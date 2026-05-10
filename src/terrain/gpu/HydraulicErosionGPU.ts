/**
 * HydraulicErosionGPU — WebGPU Compute-Shader Hydraulic Erosion
 *
 * GPU-accelerated particle-based hydraulic erosion inspired by the original
 * infinigen C++ SoilMachine.  Falls back to a CPU implementation when WebGPU
 * is unavailable.
 *
 * Architecture (3 compute passes per iteration + 1 apply pass):
 *   Pass 1 – Rain:  Generate random droplet positions via PCG hash
 *   Pass 2 – Simulate: Each thread simulates one droplet's complete
 *            lifecycle (gradient → inertia → move → erode/deposit → evaporate)
 *            and accumulates per-cell deltas via atomic<i32> (fixed-point).
 *   Pass 3 – Apply:  Convert fixed-point deltas to float and add to heightmap
 *   Pass 4 – Smooth: 3×3 thermal-weathering slope relaxation
 *
 * The CPU fallback implements the identical algorithm so that results are
 * visually consistent regardless of which path is taken.
 *
 * Multi-resolution: `erodeMultiRes()` runs erosion at progressively higher
 * resolutions (e.g. 512² → 1024² → 2048²) for both broad and fine detail.
 *
 * @module terrain/gpu
 */

// ============================================================================
// Public Types
// ============================================================================

/**
 * Configuration for the GPU hydraulic erosion system.
 */
export interface HydraulicErosionGPUConfig {
  /** Whether GPU erosion is enabled (default true) */
  enabled: boolean;
  /** Number of erosion iterations (each iteration spawns a fresh batch of droplets) */
  iterations: number;
  /** Droplets per iteration */
  dropletCount: number;
  /** Radius of erosion/deposition kernel in cells */
  erosionRadius: number;
  /** Speed of sediment deposition [0,1] */
  depositionRate: number;
  /** Water evaporation speed [0,1] */
  evaporationRate: number;
  /** Gravity constant affecting droplet acceleration */
  gravity: number;
  /** Direction inertia — how much the old direction is preserved [0,1] */
  inertia: number;
  /** Multiplier for maximum sediment a droplet can carry */
  sedimentCapacity: number;
  /** Minimum slope threshold below which no erosion occurs */
  minSlope: number;
  /** Minimum sediment capacity (prevents zero capacity on flat terrain) */
  minSedimentCapacity: number;
  /** Maximum number of steps a droplet can take before dying */
  maxDropletLifetime: number;
  /** Erosion speed multiplier [0,1] */
  erodeSpeed: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Thermal weathering smoothing iterations (per erosion iteration) */
  smoothIterations: number;
  /** Talus angle for thermal weathering (radians, default ~60°) */
  talusAngle: number;
  /** Thermal weathering transfer strength [0,1] */
  thermalStrength: number;
  /** Workgroup size for compute shaders */
  workgroupSize: number;
}

/**
 * Result of a GPU (or CPU) hydraulic erosion run.
 */
export interface ErosionGPUResult {
  /** Eroded heightmap (new Float32Array, same size as input) */
  heightmap: Float32Array;
  /** How much height was removed at each point (positive = erosion) */
  erosionMask: Float32Array;
  /** How much water flowed through each point (accumulated) */
  waterFlowMask: Float32Array;
  /** Whether the GPU path was actually used */
  gpuUsed: boolean;
  /** Wall-clock execution time in milliseconds */
  executionTimeMs: number;
}

// ============================================================================
// Backward-Compatible Aliases
// ============================================================================

/**
 * @deprecated Use HydraulicErosionGPUConfig instead.
 * Kept for backward compatibility with the gpu/index.ts barrel export.
 */
export interface ErosionConfig {
  seed: number;
  iterations: number;
  inertia: number;
  sedimentCapacityFactor: number;
  erodeSpeed: number;
  depositSpeed: number;
  evaporateSpeed: number;
  gravity: number;
  maxDropletLifetime: number;
  resolution: number;
}

/**
 * @deprecated Use ErosionGPUResult instead.
 * Kept for backward compatibility with the gpu/index.ts barrel export.
 */
export interface ErosionData {
  heightMap: Float32Array;
  moistureMap: Float32Array;
  sedimentMap: Float32Array;
  erosionMask: Uint8Array;
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_HYDRAULIC_EROSION_GPU_CONFIG: HydraulicErosionGPUConfig = {
  enabled: true,
  iterations: 6,
  dropletCount: 4096,
  erosionRadius: 3,
  depositionRate: 0.3,
  evaporationRate: 0.01,
  gravity: 9.81,
  inertia: 0.05,
  sedimentCapacity: 4.0,
  minSlope: 0.0001,
  minSedimentCapacity: 0.01,
  maxDropletLifetime: 64,
  erodeSpeed: 0.3,
  seed: 42,
  smoothIterations: 2,
  talusAngle: Math.PI / 3,
  thermalStrength: 0.5,
  workgroupSize: 64,
};

// Fixed-point scale for atomic delta accumulation (6 decimal places)
const DELTA_SCALE = 1_000_000;
// Uniform buffer size in bytes (20 × 4 = 80, padded to 96 for 16-byte alignment)
const UNIFORM_BUFFER_SIZE = 96;

// ============================================================================
// WGSL Compute Shaders
// ============================================================================

// ---------- Pass 1: Rain (generate droplet positions) ----------

const RAIN_SHADER = /* wgsl */ `
// ============================================================================
// Rain Pass — Generate random droplet starting positions
// ============================================================================

struct Uniforms {
  width: u32,
  height: u32,
  dropletCount: u32,
  maxDropletLifetime: u32,
  seed: u32,
  inertia: f32,
  sedimentCapacityFactor: f32,
  minSedimentCapacity: f32,
  erodeSpeed: f32,
  depositSpeed: f32,
  evaporateSpeed: f32,
  gravity: f32,
  erosionRadius: f32,
  minSlope: f32,
  deltaScale: f32,
  smoothIterations: u32,
  talusTan: f32,
  thermalStrength: f32,
  iteration: u32,
  padding: u32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> droplets: array<f32>;

// PCG hash — high-quality 32-bit hash
fn pcg_hash(input: u32) -> u32 {
  var state = input * 747796405u + 2891336453u;
  state = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  state = (state >> 22u) ^ state;
  return state;
}

fn random_float(seed: u32) -> f32 {
  let h = pcg_hash(seed);
  return f32(h) / 4294967295.0;
}

@compute @workgroup_size(64)
fn rain_main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= uniforms.dropletCount) {
    return;
  }

  // Combine iteration + droplet index + global seed for unique seed per droplet
  let combinedSeed = uniforms.seed + uniforms.iteration * 7919u + idx * 104729u;

  // Generate random position (stay 2 cells away from edges for bilinear safety)
  let margin = 2.0;
  let px = random_float(combinedSeed) * (f32(uniforms.width)  - 2.0 * margin) + margin;
  let py = random_float(combinedSeed + 1u) * (f32(uniforms.height) - 2.0 * margin) + margin;

  // Write position (2 floats per droplet: posX, posY)
  droplets[idx * 2u]     = px;
  droplets[idx * 2u + 1u] = py;
}
`;

// ---------- Pass 2: Simulate (droplet path simulation) ----------

const SIMULATE_SHADER = /* wgsl */ `
// ============================================================================
// Simulate Pass — Each thread simulates one droplet's complete lifecycle
// ============================================================================

struct Uniforms {
  width: u32,
  height: u32,
  dropletCount: u32,
  maxDropletLifetime: u32,
  seed: u32,
  inertia: f32,
  sedimentCapacityFactor: f32,
  minSedimentCapacity: f32,
  erodeSpeed: f32,
  depositSpeed: f32,
  evaporateSpeed: f32,
  gravity: f32,
  erosionRadius: f32,
  minSlope: f32,
  deltaScale: f32,
  smoothIterations: u32,
  talusTan: f32,
  thermalStrength: f32,
  iteration: u32,
  padding: u32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> heightmap: array<f32>;
@group(0) @binding(2) var<storage, read> droplets: array<f32>;
@group(0) @binding(3) var<storage, read_write> deltas: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> waterFlow: array<atomic<i32>>;

// ---- Helpers ----

/** Bilinear height sample at continuous coordinates (px, py). */
fn sampleHeight(px: f32, py: f32) -> f32 {
  let ix = i32(px);
  let iy = i32(py);
  let fx = px - f32(ix);
  let fy = py - f32(iy);

  let x0 = clamp(ix, 0, i32(uniforms.width)  - 2);
  let y0 = clamp(iy, 0, i32(uniforms.height) - 2);
  let w = i32(uniforms.width);

  let h00 = heightmap[y0 * w + x0];
  let h10 = heightmap[y0 * w + x0 + 1];
  let h01 = heightmap[(y0 + 1) * w + x0];
  let h11 = heightmap[(y0 + 1) * w + x0 + 1];

  return h00 * (1.0 - fx) * (1.0 - fy)
       + h10 * fx         * (1.0 - fy)
       + h01 * (1.0 - fx) * fy
       + h11 * fx         * fy;
}

/** Analytical gradient of the bilinear surface at (px, py).
 *  Returns gradient pointing uphill (positive = higher in that direction). */
fn calcGradient(px: f32, py: f32) -> vec2f {
  let ix = i32(px);
  let iy = i32(py);
  let fx = px - f32(ix);
  let fy = py - f32(iy);

  let x0 = clamp(ix, 0, i32(uniforms.width)  - 2);
  let y0 = clamp(iy, 0, i32(uniforms.height) - 2);
  let w = i32(uniforms.width);

  let h00 = heightmap[y0 * w + x0];
  let h10 = heightmap[y0 * w + x0 + 1];
  let h01 = heightmap[(y0 + 1) * w + x0];
  let h11 = heightmap[(y0 + 1) * w + x0 + 1];

  let gx = (h10 - h00) * (1.0 - fy) + (h11 - h01) * fy;
  let gy = (h01 - h00) * (1.0 - fx) + (h11 - h10) * fx;
  return vec2f(gx, gy);
}

/** Accumulate a float delta into the fixed-point atomic delta buffer. */
fn addDelta(cellIdx: u32, amount: f32) {
  let scaled = i32(amount * uniforms.deltaScale);
  if (scaled != 0) {
    atomicAdd(&deltas[cellIdx], scaled);
  }
}

/** Accumulate water flow at a cell. */
fn addWaterFlow(cellIdx: u32, amount: f32) {
  let scaled = i32(amount * uniforms.deltaScale);
  if (scaled != 0) {
    atomicAdd(&waterFlow[cellIdx], scaled);
  }
}

// ---- Main ----

@compute @workgroup_size(64)
fn simulate_main(@builtin(global_invocation_id) gid: vec3u) {
  let dropletIdx = gid.x;
  if (dropletIdx >= uniforms.dropletCount) {
    return;
  }

  let w = uniforms.width;
  let h = uniforms.height;

  // Read initial position from rain pass
  var posX = droplets[dropletIdx * 2u];
  var posY = droplets[dropletIdx * 2u + 1u];

  var dirX: f32 = 0.0;
  var dirY: f32 = 0.0;
  var speed: f32 = 1.0;
  var water: f32 = 1.0;
  var sediment: f32 = 0.0;

  for (var step = 0u; step < uniforms.maxDropletLifetime; step++) {
    let nodeX = i32(posX);
    let nodeY = i32(posY);
    let cellX = posX - f32(nodeX);
    let cellY = posY - f32(nodeY);

    // Bounds check — droplet must be within valid bilinear interpolation range
    if (nodeX < 1 || nodeX >= i32(w) - 2 || nodeY < 1 || nodeY >= i32(h) - 2) {
      // Deposit remaining sediment at last valid position
      if (sediment > 0.00001) {
        let depositAmt = sediment * uniforms.depositSpeed;
        let idx00 = u32(nodeY) * w + u32(nodeX);
        addDelta(idx00,      depositAmt * (1.0 - cellX) * (1.0 - cellY));
        addDelta(idx00 + 1u, depositAmt * cellX         * (1.0 - cellY));
        addDelta(idx00 + w,  depositAmt * (1.0 - cellX) * cellY);
        addDelta(idx00 + w + 1u, depositAmt * cellX * cellY);
      }
      break;
    }

    let oldHeight = sampleHeight(posX, posY);
    let grad = calcGradient(posX, posY);

    // Update direction: blend inertia with negative-gradient (downhill) direction
    dirX = dirX * uniforms.inertia - grad.x * (1.0 - uniforms.inertia);
    dirY = dirY * uniforms.inertia - grad.y * (1.0 - uniforms.inertia);

    // Normalize direction
    let len = sqrt(dirX * dirX + dirY * dirY);
    if (len < 1e-10) {
      // Flat terrain — deposit and stop
      if (sediment > 0.00001) {
        let depositAmt = sediment * uniforms.depositSpeed;
        let idx00 = u32(nodeY) * w + u32(nodeX);
        addDelta(idx00,      depositAmt * (1.0 - cellX) * (1.0 - cellY));
        addDelta(idx00 + 1u, depositAmt * cellX         * (1.0 - cellY));
        addDelta(idx00 + w,  depositAmt * (1.0 - cellX) * cellY);
        addDelta(idx00 + w + 1u, depositAmt * cellX * cellY);
      }
      break;
    }
    dirX = dirX / len;
    dirY = dirY / len;

    // Advance droplet
    let newPosX = posX + dirX;
    let newPosY = posY + dirY;

    // Bounds check on new position
    if (newPosX < 1.0 || newPosX >= f32(w) - 2.0 ||
        newPosY < 1.0 || newPosY >= f32(h) - 2.0) {
      // Deposit remaining sediment and stop
      if (sediment > 0.00001) {
        let depositAmt = sediment * uniforms.depositSpeed;
        let idx00 = u32(nodeY) * w + u32(nodeX);
        addDelta(idx00,      depositAmt * (1.0 - cellX) * (1.0 - cellY));
        addDelta(idx00 + 1u, depositAmt * cellX         * (1.0 - cellY));
        addDelta(idx00 + w,  depositAmt * (1.0 - cellX) * cellY);
        addDelta(idx00 + w + 1u, depositAmt * cellX * cellY);
      }
      break;
    }

    posX = newPosX;
    posY = newPosY;

    let newHeight = sampleHeight(posX, posY);
    let deltaH = newHeight - oldHeight; // negative when going downhill

    // Update speed from potential energy conversion
    speed = sqrt(max(0.001, speed * speed + 2.0 * uniforms.gravity * abs(deltaH)));

    // Sediment capacity — steep fast water carries more
    let capacity = max(
      uniforms.minSedimentCapacity,
      uniforms.sedimentCapacityFactor * speed * max(abs(deltaH), uniforms.minSlope) * water,
    );

    // Record water flow at current cell
    let newNodeX = i32(posX);
    let newNodeY = i32(posY);
    if (newNodeX >= 0 && newNodeX < i32(w) && newNodeY >= 0 && newNodeY < i32(h)) {
      let flowIdx = u32(newNodeY) * w + u32(newNodeX);
      addWaterFlow(flowIdx, water);
    }

    // Bilinear weights at new position
    let newCellX = posX - f32(newNodeX);
    let newCellY = posY - f32(newNodeY);
    let w00 = (1.0 - newCellX) * (1.0 - newCellY);
    let w10 = newCellX         * (1.0 - newCellY);
    let w01 = (1.0 - newCellX) * newCellY;
    let w11 = newCellX         * newCellY;
    let newIdx00 = u32(newNodeY) * w + u32(newNodeX);

    if (sediment > capacity) {
      // Over capacity → deposit excess
      let depositAmt = (sediment - capacity) * uniforms.depositSpeed;
      sediment -= depositAmt;

      addDelta(newIdx00,            depositAmt * w00);
      addDelta(newIdx00 + 1u,      depositAmt * w10);
      addDelta(newIdx00 + w,       depositAmt * w01);
      addDelta(newIdx00 + w + 1u,  depositAmt * w11);
    } else {
      // Under capacity → erode (only while going downhill)
      let erodeAmt = min(
        (capacity - sediment) * uniforms.erodeSpeed,
        max(0.0, -deltaH), // cannot erode more than the height drop
      );

      if (erodeAmt > 0.0) {
        sediment += erodeAmt;

        // Distribute erosion with bilinear weights
        addDelta(newIdx00,            -erodeAmt * w00);
        addDelta(newIdx00 + 1u,      -erodeAmt * w10);
        addDelta(newIdx00 + w,       -erodeAmt * w01);
        addDelta(newIdx00 + w + 1u,  -erodeAmt * w11);
      }
    }

    // Evaporate water
    water = water * (1.0 - uniforms.evaporateSpeed);
    if (water < 0.01) {
      // Droplet drying up — deposit remaining sediment
      if (sediment > 0.00001) {
        let depositAmt = sediment * uniforms.depositSpeed;
        let dIdx00 = u32(newNodeY) * w + u32(newNodeX);
        let dcx = posX - f32(newNodeX);
        let dcy = posY - f32(newNodeY);
        addDelta(dIdx00,       depositAmt * (1.0 - dcx) * (1.0 - dcy));
        addDelta(dIdx00 + 1u, depositAmt * dcx         * (1.0 - dcy));
        addDelta(dIdx00 + w,  depositAmt * (1.0 - dcx) * dcy);
        addDelta(dIdx00 + w + 1u, depositAmt * dcx * dcy);
      }
      break;
    }
  }
}
`;

// ---------- Pass 3: Apply (convert deltas → float, add to heightmap) ----------

const APPLY_SHADER = /* wgsl */ `
// ============================================================================
// Apply Pass — Convert fixed-point atomic deltas to float and add to heightmap
// ============================================================================

struct Uniforms {
  width: u32,
  height: u32,
  dropletCount: u32,
  maxDropletLifetime: u32,
  seed: u32,
  inertia: f32,
  sedimentCapacityFactor: f32,
  minSedimentCapacity: f32,
  erodeSpeed: f32,
  depositSpeed: f32,
  evaporateSpeed: f32,
  gravity: f32,
  erosionRadius: f32,
  minSlope: f32,
  deltaScale: f32,
  smoothIterations: u32,
  talusTan: f32,
  thermalStrength: f32,
  iteration: u32,
  padding: u32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> heightmap: array<f32>;
@group(0) @binding(2) var<storage, read_write> deltas: array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> erosionMask: array<f32>;
@group(0) @binding(4) var<storage, read_write> waterFlowMask: array<f32>;
@group(0) @binding(5) var<storage, read_write> waterFlow: array<atomic<i32>>;

@compute @workgroup_size(64)
fn apply_main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  let totalCells = uniforms.width * uniforms.height;
  if (idx >= totalCells) {
    return;
  }

  // Read and reset delta
  let deltaInt = atomicLoad(&deltas[idx]);
  atomicStore(&deltas[idx], 0i);

  let deltaFloat = f32(deltaInt) / uniforms.deltaScale;

  // Apply delta to heightmap
  heightmap[idx] = heightmap[idx] + deltaFloat;

  // Accumulate erosion mask (only negative deltas = erosion)
  if (deltaFloat < 0.0) {
    erosionMask[idx] = erosionMask[idx] + (-deltaFloat);
  }

  // Read and reset water flow, accumulate into water flow mask
  let flowInt = atomicLoad(&waterFlow[idx]);
  atomicStore(&waterFlow[idx], 0i);
  let flowFloat = f32(flowInt) / uniforms.deltaScale;
  waterFlowMask[idx] = waterFlowMask[idx] + flowFloat;
}
`;

// ---------- Pass 4: Smooth (thermal weathering / slope relaxation) ----------

const SMOOTH_SHADER = /* wgsl */ `
// ============================================================================
// Smooth Pass — Thermal Weathering (3×3 slope relaxation)
//
// For each cell, check all 8 neighbours.  When the slope between centre and
// neighbour exceeds the talus angle (angle of repose), transfer material
// from the higher cell to the lower one, proportional to the excess slope.
// ============================================================================

struct Uniforms {
  width: u32,
  height: u32,
  dropletCount: u32,
  maxDropletLifetime: u32,
  seed: u32,
  inertia: f32,
  sedimentCapacityFactor: f32,
  minSedimentCapacity: f32,
  erodeSpeed: f32,
  depositSpeed: f32,
  evaporateSpeed: f32,
  gravity: f32,
  erosionRadius: f32,
  minSlope: f32,
  deltaScale: f32,
  smoothIterations: u32,
  talusTan: f32,
  thermalStrength: f32,
  iteration: u32,
  padding: u32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> heightmap: array<f32>;

@compute @workgroup_size(8, 8)
fn smooth_main(@builtin(global_invocation_id) gid: vec3u) {
  let x = gid.x;
  let y = gid.y;
  if (x >= uniforms.width || y >= uniforms.height) {
    return;
  }

  let w = uniforms.width;
  let idx = y * w + x;
  let centerH = heightmap[idx];
  var totalTransfer: f32 = 0.0;

  // 8-connected neighbourhood
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) {
        continue;
      }

      let nx = i32(x) + dx;
      let ny = i32(y) + dy;

      if (nx < 0 || nx >= i32(w) || ny < 0 || ny >= i32(uniforms.height)) {
        continue;
      }

      let nIdx = u32(ny) * w + u32(nx);
      let neighborH = heightmap[nIdx];

      // Positive heightDiff → centre is higher than neighbour
      let heightDiff = centerH - neighborH;
      let distance = sqrt(f32(dx * dx + dy * dy));
      let slope = heightDiff / distance;

      if (slope > uniforms.talusTan) {
        let excess = heightDiff - uniforms.talusTan * distance;
        let transfer = excess * 0.5 * uniforms.thermalStrength;
        if (transfer > 0.00001) {
          // Material leaves the centre cell
          totalTransfer = totalTransfer + transfer;
        }
      }
    }
  }

  // Apply net transfer (subtract material from centre)
  heightmap[idx] = heightmap[idx] - totalTransfer;
}
`;

// ============================================================================
// Uniform Buffer Layout (must match WGSL struct exactly)
// ============================================================================

function buildUniformBuffer(
  width: number,
  height: number,
  config: HydraulicErosionGPUConfig,
  iteration: number,
): ArrayBuffer {
  const buf = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
  const dv = new DataView(buf);
  let offset = 0;

  // u32 fields
  dv.setUint32(offset, width, true);                       offset += 4;  // width
  dv.setUint32(offset, height, true);                      offset += 4;  // height
  dv.setUint32(offset, config.dropletCount, true);         offset += 4;  // dropletCount
  dv.setUint32(offset, config.maxDropletLifetime, true);   offset += 4;  // maxDropletLifetime
  dv.setUint32(offset, config.seed, true);                 offset += 4;  // seed

  // f32 fields
  dv.setFloat32(offset, config.inertia, true);             offset += 4;  // inertia
  dv.setFloat32(offset, config.sedimentCapacity, true);    offset += 4;  // sedimentCapacityFactor
  dv.setFloat32(offset, config.minSedimentCapacity, true); offset += 4;  // minSedimentCapacity
  dv.setFloat32(offset, config.erodeSpeed, true);          offset += 4;  // erodeSpeed
  dv.setFloat32(offset, config.depositionRate, true);      offset += 4;  // depositSpeed
  dv.setFloat32(offset, config.evaporationRate, true);     offset += 4;  // evaporateSpeed
  dv.setFloat32(offset, config.gravity, true);             offset += 4;  // gravity
  dv.setFloat32(offset, config.erosionRadius, true);       offset += 4;  // erosionRadius
  dv.setFloat32(offset, config.minSlope, true);            offset += 4;  // minSlope
  dv.setFloat32(offset, DELTA_SCALE, true);                offset += 4;  // deltaScale

  // u32 fields
  dv.setUint32(offset, config.smoothIterations, true);     offset += 4;  // smoothIterations

  // f32 fields
  dv.setFloat32(offset, Math.tan(config.talusAngle), true); offset += 4;  // talusTan
  dv.setFloat32(offset, config.thermalStrength, true);     offset += 4;  // thermalStrength

  // u32 fields
  dv.setUint32(offset, iteration, true);                   offset += 4;  // iteration
  dv.setUint32(offset, 0, true);                           offset += 4;  // padding

  return buf;
}

// ============================================================================
// HydraulicErosionGPU
// ============================================================================

/**
 * GPU-accelerated hydraulic erosion using WebGPU compute shaders.
 *
 * Usage:
 * ```typescript
 * const erosion = new HydraulicErosionGPU();
 * const gpuAvailable = await erosion.initialize();
 *
 * const result = await erosion.erode(heightmap, 512, 512, {
 *   iterations: 6,
 *   dropletCount: 4096,
 * });
 *
 * console.log(`Used ${result.gpuUsed ? 'GPU' : 'CPU'}, took ${result.executionTimeMs}ms`);
 * erosion.dispose();
 * ```
 */
export class HydraulicErosionGPU {
  // GPU state (typed as `any` because WebGPU types are not in the
  // standard TypeScript library and may not exist at runtime)
  private device: any = null;
  private rainPipeline: any = null;
  private simulatePipeline: any = null;
  private applyPipeline: any = null;
  private smoothPipeline: any = null;
  private initialized = false;
  private gpuAvailable = false;
  private ownDevice = false; // whether we created the device (and should destroy it)

  // ========================================================================
  // Public API
  // ========================================================================

  /**
   * Initialize the GPU erosion pipeline.
   *
   * Attempts to acquire a WebGPU device and compile all four compute shaders.
   * If WebGPU is unavailable, the system will fall back to CPU evaluation.
   *
   * @param device - Optional pre-existing GPUDevice to share
   * @returns true if GPU pipeline was created, false if falling back to CPU
   */
  async initialize(device?: any): Promise<boolean> {
    if (this.initialized) return this.gpuAvailable;

    try {
      if (device) {
        this.device = device;
        this.ownDevice = false;
      } else {
        if (typeof navigator === 'undefined' || !navigator.gpu) {
          this.initialized = true;
          this.gpuAvailable = false;
          return false;
        }

        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: 'high-performance',
        });
        if (!adapter) {
          this.initialized = true;
          this.gpuAvailable = false;
          return false;
        }

        this.device = await adapter.requestDevice();
        this.ownDevice = true;
      }

      // Compile all four compute pipelines
      const dev = this.device;

      try {
        // Rain pipeline
        const rainModule = dev.createShaderModule({ code: RAIN_SHADER });
        this.rainPipeline = dev.createComputePipeline({
          layout: 'auto',
          compute: { module: rainModule, entryPoint: 'rain_main' },
        });

        // Simulate pipeline
        const simModule = dev.createShaderModule({ code: SIMULATE_SHADER });
        this.simulatePipeline = dev.createComputePipeline({
          layout: 'auto',
          compute: { module: simModule, entryPoint: 'simulate_main' },
        });

        // Apply pipeline
        const applyModule = dev.createShaderModule({ code: APPLY_SHADER });
        this.applyPipeline = dev.createComputePipeline({
          layout: 'auto',
          compute: { module: applyModule, entryPoint: 'apply_main' },
        });

        // Smooth pipeline
        const smoothModule = dev.createShaderModule({ code: SMOOTH_SHADER });
        this.smoothPipeline = dev.createComputePipeline({
          layout: 'auto',
          compute: { module: smoothModule, entryPoint: 'smooth_main' },
        });

        this.gpuAvailable = true;
        this.initialized = true;
        console.log('[HydraulicErosionGPU] WebGPU pipeline initialized successfully');
        return true;
      } catch (shaderError) {
        console.warn(
          '[HydraulicErosionGPU] Shader compilation failed, will use CPU fallback:',
          shaderError,
        );
        this.cleanupGPU();
        this.initialized = true;
        this.gpuAvailable = false;
        return false;
      }
    } catch (err) {
      console.warn('[HydraulicErosionGPU] WebGPU not available, will use CPU fallback:', err);
      this.cleanupGPU();
      this.initialized = true;
      this.gpuAvailable = false;
      return false;
    }
  }

  /**
   * Run hydraulic erosion on a heightmap.
   *
   * Tries the GPU path first; falls back to CPU if GPU is unavailable.
   *
   * @param heightmap - Input heightmap as Float32Array (row-major, width×height)
   * @param width  - Grid width
   * @param height - Grid height
   * @param config - Partial config overrides
   * @returns Erosion result with modified heightmap and analysis masks
   */
  async erode(
    heightmap: Float32Array,
    width: number,
    height: number,
    config?: Partial<HydraulicErosionGPUConfig>,
  ): Promise<ErosionGPUResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const fullConfig = { ...DEFAULT_HYDRAULIC_EROSION_GPU_CONFIG, ...config };

    if (!fullConfig.enabled) {
      return this.makeEmptyResult(heightmap, width, height);
    }

    const startTime = performance.now();

    // Try GPU path
    if (this.gpuAvailable && this.device && this.rainPipeline &&
        this.simulatePipeline && this.applyPipeline && this.smoothPipeline) {
      try {
        const result = await this.erodeGPU(heightmap, width, height, fullConfig);
        result.executionTimeMs = performance.now() - startTime;
        return result;
      } catch (err) {
        console.warn('[HydraulicErosionGPU] GPU erosion failed, falling back to CPU:', err);
      }
    }

    // CPU fallback
    const result = this.erodeCPU(heightmap, width, height, fullConfig);
    result.executionTimeMs = performance.now() - startTime;
    return result;
  }

  /**
   * CPU-only hydraulic erosion (guaranteed to work everywhere).
   *
   * Implements the same algorithm as the GPU compute shader for
   * consistent visual results.
   *
   * @param heightmap - Input heightmap (will NOT be modified in-place; a copy is returned)
   * @param width  - Grid width
   * @param height - Grid height
   * @param config - Partial config overrides
   * @returns Erosion result
   */
  erodeCPU(
    heightmap: Float32Array,
    width: number,
    height: number,
    config?: Partial<HydraulicErosionGPUConfig>,
  ): ErosionGPUResult {
    const fullConfig = { ...DEFAULT_HYDRAULIC_EROSION_GPU_CONFIG, ...config };
    const size = width * height;

    // Work on a copy
    const hmap = new Float32Array(heightmap);
    const erosionMask = new Float32Array(size);
    const waterFlowMask = new Float32Array(size);

    // Simple seeded RNG (sin-based hash — portable, no external deps)
    let rngState = fullConfig.seed | 0;
    const rngNext = (): number => {
      rngState++;
      const x = Math.sin(rngState * 127.1 + 311.7) * 43758.5453123;
      return x - Math.floor(x);
    };

    // ---- Helpers (same as GPU shader) ----

    const sampleHeight = (px: number, py: number): number => {
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const fx = px - ix;
      const fy = py - iy;
      const x0 = Math.max(0, Math.min(width - 2, ix));
      const y0 = Math.max(0, Math.min(height - 2, iy));

      const h00 = hmap[y0 * width + x0];
      const h10 = hmap[y0 * width + x0 + 1];
      const h01 = hmap[(y0 + 1) * width + x0];
      const h11 = hmap[(y0 + 1) * width + x0 + 1];

      return h00 * (1 - fx) * (1 - fy) +
             h10 * fx * (1 - fy) +
             h01 * (1 - fx) * fy +
             h11 * fx * fy;
    };

    const calcGradient = (px: number, py: number): [number, number] => {
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const fx = px - ix;
      const fy = py - iy;
      const x0 = Math.max(0, Math.min(width - 2, ix));
      const y0 = Math.max(0, Math.min(height - 2, iy));

      const h00 = hmap[y0 * width + x0];
      const h10 = hmap[y0 * width + x0 + 1];
      const h01 = hmap[(y0 + 1) * width + x0];
      const h11 = hmap[(y0 + 1) * width + x0 + 1];

      const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
      const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      return [gx, gy];
    };

    const addDelta = (idx: number, amount: number): void => {
      hmap[idx] += amount;
      if (amount < 0) {
        erosionMask[idx] += -amount;
      }
    };

    // ---- Main erosion loop ----

    for (let iter = 0; iter < fullConfig.iterations; iter++) {
      for (let d = 0; d < fullConfig.dropletCount; d++) {
        // Random start position (stay 2 cells away from edges)
        let posX = rngNext() * (width - 4) + 2;
        let posY = rngNext() * (height - 4) + 2;
        let dirX = 0;
        let dirY = 0;
        let speed = 1;
        let water = 1;
        let sediment = 0;

        for (let step = 0; step < fullConfig.maxDropletLifetime; step++) {
          const nodeX = Math.floor(posX);
          const nodeY = Math.floor(posY);
          const cellX = posX - nodeX;
          const cellY = posY - nodeY;

          // Bounds check
          if (nodeX < 1 || nodeX >= width - 2 || nodeY < 1 || nodeY >= height - 2) {
            if (sediment > 0.00001) {
              const amt = sediment * fullConfig.depositionRate;
              const w00 = (1 - cellX) * (1 - cellY);
              const w10 = cellX * (1 - cellY);
              const w01 = (1 - cellX) * cellY;
              const w11 = cellX * cellY;
              const idx00 = nodeY * width + nodeX;
              addDelta(idx00, amt * w00);
              addDelta(idx00 + 1, amt * w10);
              addDelta(idx00 + width, amt * w01);
              addDelta(idx00 + width + 1, amt * w11);
            }
            break;
          }

          const oldHeight = sampleHeight(posX, posY);
          const [gx, gy] = calcGradient(posX, posY);

          // Update direction with inertia (downhill = negative gradient)
          dirX = dirX * fullConfig.inertia - gx * (1 - fullConfig.inertia);
          dirY = dirY * fullConfig.inertia - gy * (1 - fullConfig.inertia);

          // Normalize
          const len = Math.sqrt(dirX * dirX + dirY * dirY);
          if (len < 1e-10) {
            // Flat terrain — deposit and stop
            if (sediment > 0.00001) {
              const amt = sediment * fullConfig.depositionRate;
              const w00 = (1 - cellX) * (1 - cellY);
              const w10 = cellX * (1 - cellY);
              const w01 = (1 - cellX) * cellY;
              const w11 = cellX * cellY;
              const idx00 = nodeY * width + nodeX;
              addDelta(idx00, amt * w00);
              addDelta(idx00 + 1, amt * w10);
              addDelta(idx00 + width, amt * w01);
              addDelta(idx00 + width + 1, amt * w11);
            }
            break;
          }
          dirX /= len;
          dirY /= len;

          // Move droplet
          const newPosX = posX + dirX;
          const newPosY = posY + dirY;

          // Bounds check on new position
          if (newPosX < 1 || newPosX >= width - 2 || newPosY < 1 || newPosY >= height - 2) {
            if (sediment > 0.00001) {
              const amt = sediment * fullConfig.depositionRate;
              const w00 = (1 - cellX) * (1 - cellY);
              const w10 = cellX * (1 - cellY);
              const w01 = (1 - cellX) * cellY;
              const w11 = cellX * cellY;
              const idx00 = nodeY * width + nodeX;
              addDelta(idx00, amt * w00);
              addDelta(idx00 + 1, amt * w10);
              addDelta(idx00 + width, amt * w01);
              addDelta(idx00 + width + 1, amt * w11);
            }
            break;
          }

          posX = newPosX;
          posY = newPosY;

          const newHeight = sampleHeight(posX, posY);
          const deltaH = newHeight - oldHeight;

          // Record water flow
          const newNodeX = Math.floor(posX);
          const newNodeY = Math.floor(posY);
          if (newNodeX >= 0 && newNodeX < width && newNodeY >= 0 && newNodeY < height) {
            waterFlowMask[newNodeY * width + newNodeX] += water;
          }

          // Speed from potential energy
          speed = Math.sqrt(
            Math.max(0.001, speed * speed + 2 * fullConfig.gravity * Math.abs(deltaH)),
          );

          // Sediment capacity
          const capacity = Math.max(
            fullConfig.minSedimentCapacity,
            fullConfig.sedimentCapacity * speed * Math.max(Math.abs(deltaH), fullConfig.minSlope) * water,
          );

          // Bilinear weights at new position
          const newCellX = posX - newNodeX;
          const newCellY = posY - newNodeY;
          const w00 = (1 - newCellX) * (1 - newCellY);
          const w10 = newCellX * (1 - newCellY);
          const w01 = (1 - newCellX) * newCellY;
          const w11 = newCellX * newCellY;
          const newIdx00 = newNodeY * width + newNodeX;

          if (sediment > capacity) {
            // Deposit excess
            const depositAmt = (sediment - capacity) * fullConfig.depositionRate;
            sediment -= depositAmt;
            addDelta(newIdx00, depositAmt * w00);
            addDelta(newIdx00 + 1, depositAmt * w10);
            addDelta(newIdx00 + width, depositAmt * w01);
            addDelta(newIdx00 + width + 1, depositAmt * w11);
          } else {
            // Erode (only downhill)
            const erodeAmt = Math.min(
              (capacity - sediment) * fullConfig.erodeSpeed,
              Math.max(0, -deltaH),
            );
            if (erodeAmt > 0) {
              sediment += erodeAmt;
              addDelta(newIdx00, -erodeAmt * w00);
              addDelta(newIdx00 + 1, -erodeAmt * w10);
              addDelta(newIdx00 + width, -erodeAmt * w01);
              addDelta(newIdx00 + width + 1, -erodeAmt * w11);
            }
          }

          // Evaporate
          water *= (1 - fullConfig.evaporationRate);
          if (water < 0.01) {
            // Deposit remaining sediment
            if (sediment > 0.00001) {
              const amt = sediment * fullConfig.depositionRate;
              const dcx = posX - newNodeX;
              const dcy = posY - newNodeY;
              addDelta(newIdx00, amt * (1 - dcx) * (1 - dcy));
              addDelta(newIdx00 + 1, amt * dcx * (1 - dcy));
              addDelta(newIdx00 + width, amt * (1 - dcx) * dcy);
              addDelta(newIdx00 + width + 1, amt * dcx * dcy);
            }
            break;
          }
        }
      }

      // ---- Thermal weathering (smooth pass) ----
      if (fullConfig.smoothIterations > 0) {
        const talusTan = Math.tan(fullConfig.talusAngle);
        for (let si = 0; si < fullConfig.smoothIterations; si++) {
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = y * width + x;
              const centerH = hmap[idx];
              let totalTransfer = 0;

              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                  const nIdx = ny * width + nx;
                  const neighborH = hmap[nIdx];
                  const heightDiff = centerH - neighborH;
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  const slope = heightDiff / distance;

                  if (slope > talusTan) {
                    const excess = heightDiff - talusTan * distance;
                    const transfer = excess * 0.5 * fullConfig.thermalStrength;
                    if (transfer > 0.00001) {
                      totalTransfer += transfer;
                    }
                  }
                }
              }
              hmap[idx] -= totalTransfer;
            }
          }
        }
      }

      // Progress logging
      if (fullConfig.iterations > 1) {
        const pct = ((iter + 1) / fullConfig.iterations * 100).toFixed(0);
        console.log(`[HydraulicErosionCPU] Iteration ${iter + 1}/${fullConfig.iterations} (${pct}%)`);
      }
    }

    return {
      heightmap: hmap,
      erosionMask,
      waterFlowMask,
      gpuUsed: false,
      executionTimeMs: 0, // caller sets this
    };
  }

  /**
   * Run erosion at multiple resolutions for both broad and fine detail.
   *
   * 1. Downsample the input to the lowest resolution
   * 2. Run erosion at each resolution level
   * 3. Upsample and refine at the next level
   *
   * @param heightmap - Input heightmap
   * @param width  - Grid width
   * @param height - Grid height
   * @param config - Erosion config (dropletCount is scaled per level)
   * @param levels - Number of resolution levels (default 2: half-res → full-res)
   * @returns Erosion result at the original resolution
   */
  async erodeMultiRes(
    heightmap: Float32Array,
    width: number,
    height: number,
    config?: Partial<HydraulicErosionGPUConfig>,
    levels: number = 2,
  ): Promise<ErosionGPUResult> {
    const startTime = performance.now();
    const fullConfig = { ...DEFAULT_HYDRAULIC_EROSION_GPU_CONFIG, ...config };

    if (levels <= 1) {
      return this.erode(heightmap, width, height, fullConfig);
    }

    // Build resolution pyramid
    let currentMap: Float32Array = Float32Array.from(heightmap);
    let currentW = width;
    let currentH = height;
    const pyramid: Array<{ map: Float32Array; w: number; h: number }> = [];

    // Downsample
    for (let level = 0; level < levels - 1; level++) {
      pyramid.push({ map: currentMap, w: currentW, h: currentH });
      const downW = Math.max(4, Math.floor(currentW / 2));
      const downH = Math.max(4, Math.floor(currentH / 2));
      currentMap = Float32Array.from(this.downsample(currentMap, currentW, currentH, downW, downH));
      currentW = downW;
      currentH = downH;
    }
    pyramid.push({ map: currentMap, w: currentW, h: currentH });

    // Erode from coarsest to finest
    let result: ErosionGPUResult | null = null;

    for (let level = pyramid.length - 1; level >= 0; level--) {
      const { map, w, h } = pyramid[level];
      const levelConfig = { ...fullConfig };

      // Scale droplet count by area ratio at coarser levels
      const areaRatio = (w * h) / (width * height);
      levelConfig.dropletCount = Math.max(256, Math.floor(fullConfig.dropletCount * Math.sqrt(areaRatio)));

      // More iterations at coarser levels for broad features
      if (level > 0) {
        levelConfig.iterations = Math.max(2, Math.floor(fullConfig.iterations * 0.5));
        levelConfig.maxDropletLifetime = Math.min(fullConfig.maxDropletLifetime, 128);
      }

      const inputMap = result ? this.upsample(result.heightmap, result.heightmap.length === w * h ? w : pyramid[level + 1].w, result.heightmap.length === w * h ? h : pyramid[level + 1].h, w, h) : map;

      result = await this.erode(inputMap, w, h, levelConfig);
    }

    if (!result) {
      result = this.makeEmptyResult(heightmap, width, height);
    }

    // If result is at a different resolution, upsample to original
    if (result.heightmap.length !== width * height) {
      const upsampled = this.upsample(result.heightmap, currentW, currentH, width, height);
      result.heightmap = upsampled;
      result.erosionMask = this.upsample(result.erosionMask, currentW, currentH, width, height);
      result.waterFlowMask = this.upsample(result.waterFlowMask, currentW, currentH, width, height);
    }

    result.executionTimeMs = performance.now() - startTime;
    return result;
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    this.cleanupGPU();
    this.initialized = false;
    this.gpuAvailable = false;
  }

  /**
   * Check if GPU pipeline is available.
   */
  isGPUAvailable(): boolean {
    return this.gpuAvailable;
  }

  /**
   * Check if the system has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if WebGPU is available in the current environment.
   */
  static isWebGPUAvailable(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }

  // ========================================================================
  // GPU Implementation
  // ========================================================================

  private async erodeGPU(
    heightmap: Float32Array,
    width: number,
    height: number,
    config: HydraulicErosionGPUConfig,
  ): Promise<ErosionGPUResult> {
    const dev = this.device!;
    const size = width * height;
    const hmap = new Float32Array(heightmap);

    const erosionMask = new Float32Array(size);
    const waterFlowMask = new Float32Array(size);

    // ---- Create GPU buffers ----

    // Heightmap (read-write storage)
    const heightmapBuf = dev.createBuffer({
      size: size * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    dev.queue.writeBuffer(heightmapBuf, 0, hmap);

    // Droplet positions (2 floats per droplet)
    const dropletBuf = dev.createBuffer({
      size: config.dropletCount * 2 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Delta buffer (atomic i32, one per cell)
    const deltaBuf = dev.createBuffer({
      size: size * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    // Initialize to zero
    dev.queue.writeBuffer(deltaBuf, 0, new Int32Array(size));

    // Erosion mask (f32, accumulated)
    const erosionMaskBuf = dev.createBuffer({
      size: size * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(erosionMaskBuf, 0, erosionMask);

    // Water flow mask (f32, accumulated)
    const waterFlowMaskBuf = dev.createBuffer({
      size: size * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(waterFlowMaskBuf, 0, waterFlowMask);

    // Water flow atomic buffer
    const waterFlowBuf = dev.createBuffer({
      size: size * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(waterFlowBuf, 0, new Int32Array(size));

    // Readback buffer
    const readBuf = dev.createBuffer({
      size: size * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // ---- Create bind groups (shared across iterations) ----
    // Note: we need different bind groups for each pipeline since they bind
    // different resources. We create them once and reuse.

    // Rain bind group: uniform + droplet output
    const rainBG = dev.createBindGroup({
      layout: this.rainPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.createUniformBuffer(dev, width, height, config, 0) } },
        { binding: 1, resource: { buffer: dropletBuf } },
      ],
    });

    // Simulate bind group: uniform + heightmap + droplets + deltas + waterFlow
    const simulateUniformBuf = dev.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const simBG = dev.createBindGroup({
      layout: this.simulatePipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: simulateUniformBuf } },
        { binding: 1, resource: { buffer: heightmapBuf } },
        { binding: 2, resource: { buffer: dropletBuf } },
        { binding: 3, resource: { buffer: deltaBuf } },
        { binding: 4, resource: { buffer: waterFlowBuf } },
      ],
    });

    // Apply bind group: uniform + heightmap + deltas + erosionMask + waterFlowMask + waterFlow
    const applyUniformBuf = dev.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const applyBG = dev.createBindGroup({
      layout: this.applyPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: applyUniformBuf } },
        { binding: 1, resource: { buffer: heightmapBuf } },
        { binding: 2, resource: { buffer: deltaBuf } },
        { binding: 3, resource: { buffer: erosionMaskBuf } },
        { binding: 4, resource: { buffer: waterFlowMaskBuf } },
        { binding: 5, resource: { buffer: waterFlowBuf } },
      ],
    });

    // Smooth bind group: uniform + heightmap
    const smoothUniformBuf = dev.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const smoothBG = dev.createBindGroup({
      layout: this.smoothPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: smoothUniformBuf } },
        { binding: 1, resource: { buffer: heightmapBuf } },
      ],
    });

    // ---- Workgroup counts ----
    const wgSize = config.workgroupSize;
    const dropletWG = Math.ceil(config.dropletCount / wgSize);
    const cellWG = Math.ceil(size / wgSize);
    const smoothWG_X = Math.ceil(width / 8);
    const smoothWG_Y = Math.ceil(height / 8);

    // ---- Erosion iterations ----
    for (let iter = 0; iter < config.iterations; iter++) {
      // Update iteration-specific uniforms
      const iterUniformData = buildUniformBuffer(width, height, config, iter);
      dev.queue.writeBuffer(simulateUniformBuf, 0, iterUniformData);
      dev.queue.writeBuffer(applyUniformBuf, 0, iterUniformData);
      dev.queue.writeBuffer(smoothUniformBuf, 0, iterUniformData);

      // Update rain uniform (different iteration seed)
      const rainUniformBuf = this.createUniformBuffer(dev, width, height, config, iter);
      const rainIterBG = dev.createBindGroup({
        layout: this.rainPipeline!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: rainUniformBuf } },
          { binding: 1, resource: { buffer: dropletBuf } },
        ],
      });

      const encoder = dev.createCommandEncoder();

      // --- Pass 1: Rain ---
      const rainPass = encoder.beginComputePass();
      rainPass.setPipeline(this.rainPipeline!);
      rainPass.setBindGroup(0, rainIterBG);
      rainPass.dispatchWorkgroups(dropletWG);
      rainPass.end();

      // --- Pass 2: Simulate ---
      const simPass = encoder.beginComputePass();
      simPass.setPipeline(this.simulatePipeline!);
      simPass.setBindGroup(0, simBG);
      simPass.dispatchWorkgroups(dropletWG);
      simPass.end();

      // --- Pass 3: Apply deltas ---
      const applyPass = encoder.beginComputePass();
      applyPass.setPipeline(this.applyPipeline!);
      applyPass.setBindGroup(0, applyBG);
      applyPass.dispatchWorkgroups(cellWG);
      applyPass.end();

      // --- Pass 4: Smooth (thermal weathering) ---
      if (config.smoothIterations > 0) {
        for (let si = 0; si < config.smoothIterations; si++) {
          const smoothPass = encoder.beginComputePass();
          smoothPass.setPipeline(this.smoothPipeline!);
          smoothPass.setBindGroup(0, smoothBG);
          smoothPass.dispatchWorkgroups(smoothWG_X, smoothWG_Y);
          smoothPass.end();
        }
      }

      dev.queue.submit([encoder.finish()]);

      // Clean up per-iteration uniform buffer
      rainUniformBuf.destroy();

      if (config.iterations > 1) {
        const pct = ((iter + 1) / config.iterations * 100).toFixed(0);
        console.log(`[HydraulicErosionGPU] Iteration ${iter + 1}/${config.iterations} (${pct}%)`);
      }
    }

    // ---- Read back results ----
    const readEncoder = dev.createCommandEncoder();
    readEncoder.copyBufferToBuffer(heightmapBuf, 0, readBuf, 0, size * 4);
    dev.queue.submit([readEncoder.finish()]);

    await readBuf.mapAsync(GPUMapMode.READ);
    const resultHeightmap = new Float32Array(new Float32Array(readBuf.getMappedRange()));
    readBuf.unmap();

    // Read erosion mask
    const erosionReadBuf = dev.createBuffer({
      size: size * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const erosionReadEncoder = dev.createCommandEncoder();
    erosionReadEncoder.copyBufferToBuffer(erosionMaskBuf, 0, erosionReadBuf, 0, size * 4);
    dev.queue.submit([erosionReadEncoder.finish()]);

    await erosionReadBuf.mapAsync(GPUMapMode.READ);
    const resultErosion = new Float32Array(new Float32Array(erosionReadBuf.getMappedRange()));
    erosionReadBuf.unmap();

    // Read water flow mask
    const waterFlowReadBuf = dev.createBuffer({
      size: size * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const waterFlowReadEncoder = dev.createCommandEncoder();
    waterFlowReadEncoder.copyBufferToBuffer(waterFlowMaskBuf, 0, waterFlowReadBuf, 0, size * 4);
    dev.queue.submit([waterFlowReadEncoder.finish()]);

    await waterFlowReadBuf.mapAsync(GPUMapMode.READ);
    const resultWaterFlow = new Float32Array(new Float32Array(waterFlowReadBuf.getMappedRange()));
    waterFlowReadBuf.unmap();

    // Cleanup
    this.destroyBuffers(
      heightmapBuf, dropletBuf, deltaBuf, erosionMaskBuf,
      waterFlowMaskBuf, waterFlowBuf, readBuf,
      simulateUniformBuf, applyUniformBuf, smoothUniformBuf,
      erosionReadBuf, waterFlowReadBuf,
    );

    return {
      heightmap: resultHeightmap,
      erosionMask: resultErosion,
      waterFlowMask: resultWaterFlow,
      gpuUsed: true,
      executionTimeMs: 0, // caller sets this
    };
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private createUniformBuffer(
    dev: GPUDevice,
    width: number,
    height: number,
    config: HydraulicErosionGPUConfig,
    iteration: number,
  ): GPUBuffer {
    const data = buildUniformBuffer(width, height, config, iteration);
    const buf = dev.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  private makeEmptyResult(
    heightmap: Float32Array,
    width: number,
    height: number,
  ): ErosionGPUResult {
    const size = width * height;
    return {
      heightmap: new Float32Array(heightmap),
      erosionMask: new Float32Array(size),
      waterFlowMask: new Float32Array(size),
      gpuUsed: false,
      executionTimeMs: 0,
    };
  }

  /**
   * Downsample a heightmap by 2× using box filter.
   */
  private downsample(
    src: Float32Array,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number,
  ): Float32Array {
    const dst = new Float32Array(dstW * dstH);
    const scaleX = srcW / dstW;
    const scaleY = srcH / dstH;

    for (let dy = 0; dy < dstH; dy++) {
      for (let dx = 0; dx < dstW; dx++) {
        const sx0 = Math.floor(dx * scaleX);
        const sy0 = Math.floor(dy * scaleY);
        const sx1 = Math.min(sx0 + 1, srcW - 1);
        const sy1 = Math.min(sy0 + 1, srcH - 1);

        // 2×2 box filter
        dst[dy * dstW + dx] = (
          src[sy0 * srcW + sx0] +
          src[sy0 * srcW + sx1] +
          src[sy1 * srcW + sx0] +
          src[sy1 * srcW + sx1]
        ) * 0.25;
      }
    }
    return dst;
  }

  /**
   * Upsample a heightmap using bilinear interpolation.
   */
  private upsample(
    src: Float32Array,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number,
  ): Float32Array {
    const dst = new Float32Array(dstW * dstH);
    const scaleX = (srcW - 1) / Math.max(1, dstW - 1);
    const scaleY = (srcH - 1) / Math.max(1, dstH - 1);

    for (let dy = 0; dy < dstH; dy++) {
      for (let dx = 0; dx < dstW; dx++) {
        const sx = dx * scaleX;
        const sy = dy * scaleY;
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const fx = sx - ix;
        const fy = sy - iy;

        const x0 = Math.min(ix, srcW - 1);
        const x1 = Math.min(ix + 1, srcW - 1);
        const y0 = Math.min(iy, srcH - 1);
        const y1 = Math.min(iy + 1, srcH - 1);

        dst[dy * dstW + dx] =
          src[y0 * srcW + x0] * (1 - fx) * (1 - fy) +
          src[y0 * srcW + x1] * fx * (1 - fy) +
          src[y1 * srcW + x0] * (1 - fx) * fy +
          src[y1 * srcW + x1] * fx * fy;
      }
    }
    return dst;
  }

  private destroyBuffers(...buffers: GPUBuffer[]): void {
    for (const b of buffers) {
      try {
        if (b && typeof b.destroy === 'function') b.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private cleanupGPU(): void {
    if (this.ownDevice && this.device) {
      // Don't destroy a shared device
      // this.device.destroy(); // Only if we own it
    }
    this.device = null;
    this.rainPipeline = null;
    this.simulatePipeline = null;
    this.applyPipeline = null;
    this.smoothPipeline = null;
    this.gpuAvailable = false;
  }
}

export default HydraulicErosionGPU;
