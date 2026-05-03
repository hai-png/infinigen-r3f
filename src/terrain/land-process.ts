/**
 * Land Process - Landform processing algorithms
 *
 * Provides algorithms for processing and refining terrain landforms
 * including hydraulic erosion, thermal weathering, and sediment transport.
 *
 * Each process modifies the heightMap in-place and returns it.
 * Uses a simple seeded RNG (sin-based hash) for deterministic, portable results.
 *
 * @see ErosionSystem.ts — higher-level erosion pipeline
 * @see ErosionEnhanced.ts — droplet-based hydraulic erosion + diffusion transport
 */

export interface LandProcessConfig {
  iterations: number;
  strength: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Seeded RNG (sin-based hash, portable, no external dependencies)
// ---------------------------------------------------------------------------

class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a pseudo-random float in [0, 1). */
  next(): number {
    this.state++;
    const x = Math.sin(this.state * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }
}

// ---------------------------------------------------------------------------
// Hydraulic Erosion — droplet-based rainfall simulation
// ---------------------------------------------------------------------------

/**
 * Droplet-based hydraulic erosion.
 *
 * For each iteration a raindrop is placed at a random position on the
 * heightmap and flows downhill following the terrain gradient (with inertia).
 * It picks up sediment proportional to its speed, the local slope, and the
 * water it carries; when it slows or reaches capacity it deposits sediment.
 * Water evaporates gradually, eventually killing the droplet.
 *
 * Produces realistic V-shaped valleys, gullies, and branching stream patterns.
 */
export class HydraulicErosionProcess {
  private config: LandProcessConfig;

  constructor(config: Partial<LandProcessConfig> = {}) {
    this.config = { iterations: 100, strength: 0.5, enabled: true, ...config };
  }

  apply(heightMap: Float32Array, width: number, height: number): Float32Array {
    if (!this.config.enabled || width < 4 || height < 4) return heightMap;

    const rng = new SeededRNG(42);
    const dropletCount = this.config.iterations;
    const strength = this.config.strength;

    // Tuning knobs (scaled by strength)
    const inertia = 0.05;
    const sedimentCapacityFactor = 4.0;
    const minSedimentCapacity = 0.01;
    const erodeSpeed = 0.3 * strength;
    const depositSpeed = 0.3 * strength;
    const evaporateSpeed = 0.01;
    const gravity = 9.81;
    const maxDropletLifetime = 64;
    const erosionRadius = 3;

    // ---- helpers --------------------------------------------------------

    /** Bilinear height sample at continuous coordinates. */
    const sampleHeight = (px: number, py: number): number => {
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const fx = px - ix;
      const fy = py - iy;
      const x0 = Math.max(0, Math.min(width - 2, ix));
      const y0 = Math.max(0, Math.min(height - 2, iy));
      const h00 = heightMap[y0 * width + x0];
      const h10 = heightMap[y0 * width + x0 + 1];
      const h01 = heightMap[(y0 + 1) * width + x0];
      const h11 = heightMap[(y0 + 1) * width + x0 + 1];
      return (
        h00 * (1 - fx) * (1 - fy) +
        h10 * fx * (1 - fy) +
        h01 * (1 - fx) * fy +
        h11 * fx * fy
      );
    };

    /** Analytical gradient of the bilinear surface (points uphill). */
    const calcGradient = (px: number, py: number): [number, number] => {
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const fx = px - ix;
      const fy = py - iy;
      const x0 = Math.max(0, Math.min(width - 2, ix));
      const y0 = Math.max(0, Math.min(height - 2, iy));
      const h00 = heightMap[y0 * width + x0];
      const h10 = heightMap[y0 * width + x0 + 1];
      const h01 = heightMap[(y0 + 1) * width + x0];
      const h11 = heightMap[(y0 + 1) * width + x0 + 1];
      const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
      const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      return [gx, gy];
    };

    /** Distribute an erosion amount over a circular kernel. */
    const erodeArea = (cx: number, cy: number, amount: number): void => {
      const r = erosionRadius;
      const rSq = r * r;
      const icx = Math.floor(cx);
      const icy = Math.floor(cy);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dSq = dx * dx + dy * dy;
          if (dSq > rSq) continue;
          const px = icx + dx;
          const py = icy + dy;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          const weight = 1 - Math.sqrt(dSq) / r;
          heightMap[py * width + px] -= amount * weight * 0.1;
        }
      }
    };

    /** Distribute a deposition amount over a circular kernel. */
    const depositArea = (cx: number, cy: number, amount: number): void => {
      const r = erosionRadius;
      const rSq = r * r;
      const icx = Math.floor(cx);
      const icy = Math.floor(cy);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dSq = dx * dx + dy * dy;
          if (dSq > rSq) continue;
          const px = icx + dx;
          const py = icy + dy;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          const weight = 1 - Math.sqrt(dSq) / r;
          heightMap[py * width + px] += amount * weight * 0.1;
        }
      }
    };

    // ---- droplet simulation ---------------------------------------------

    for (let d = 0; d < dropletCount; d++) {
      // Random start position (stay away from the very edge)
      let px = rng.next() * (width - 4) + 2;
      let py = rng.next() * (height - 4) + 2;
      let dirX = 0;
      let dirY = 0;
      let speed = 1;
      let water = 1;
      let sediment = 0;

      for (let step = 0; step < maxDropletLifetime; step++) {
        const oldHeight = sampleHeight(px, py);
        const [gx, gy] = calcGradient(px, py);

        // Update direction: blend inertia with negative-gradient direction
        dirX = dirX * inertia - gx * (1 - inertia);
        dirY = dirY * inertia - gy * (1 - inertia);

        // Normalise direction
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len < 1e-10) break; // flat terrain — droplet pools and stops
        dirX /= len;
        dirY /= len;

        // Advance droplet
        const newPx = px + dirX;
        const newPy = py + dirY;

        // Bounds check — if heading off-map, deposit remaining sediment and stop
        if (newPx < 1 || newPx >= width - 2 || newPy < 1 || newPy >= height - 2) {
          if (sediment > 0) depositArea(px, py, sediment);
          break;
        }

        px = newPx;
        py = newPy;

        const newHeight = sampleHeight(px, py);
        const deltaH = newHeight - oldHeight; // negative when going downhill

        // Speed from potential-energy conversion
        speed = Math.sqrt(
          Math.max(0.001, speed * speed + 2 * gravity * Math.abs(deltaH)),
        );

        // Sediment capacity — steep fast water carries more
        const capacity = Math.max(
          minSedimentCapacity,
          sedimentCapacityFactor * speed * Math.abs(deltaH) * water,
        );

        if (sediment > capacity) {
          // Over-capacity → deposit the excess
          const depositAmt = (sediment - capacity) * depositSpeed;
          sediment -= depositAmt;
          depositArea(px, py, depositAmt);
        } else {
          // Under-capacity → erode (only while going downhill)
          const erodeAmt = Math.min(
            (capacity - sediment) * erodeSpeed,
            Math.max(0, -deltaH), // cannot erode more than the height drop
          );
          if (erodeAmt > 0) {
            sediment += erodeAmt;
            erodeArea(px, py, erodeAmt);
          }
        }

        // Evaporate
        water *= 1 - evaporateSpeed;
        if (water < 0.01) {
          // Droplet drying up — deposit whatever it still carries
          if (sediment > 0) depositArea(px, py, sediment);
          break;
        }
      }
    }

    return heightMap;
  }
}

// ---------------------------------------------------------------------------
// Thermal Weathering — freeze-thaw slope relaxation
// ---------------------------------------------------------------------------

/**
 * Thermal weathering (erosion).
 *
 * For each cell the height is compared with every neighbour.  When the
 * slope between centre and neighbour exceeds the **talus angle** (angle of
 * repose) material is transferred from the higher cell to the lower one,
 * proportional to the excess slope.  This simulates freeze-thaw cycles
 * fracturing rock on steep faces, with the debris tumbling to rest at the
 * base.
 *
 * Over many iterations steep cliffs soften into talus slopes at the angle
 * of repose while flat areas are largely unaffected.
 */
export class ThermalWeatheringProcess {
  private config: LandProcessConfig;

  constructor(config: Partial<LandProcessConfig> = {}) {
    this.config = { iterations: 50, strength: 0.3, enabled: true, ...config };
  }

  apply(heightMap: Float32Array, width: number, height: number): Float32Array {
    if (!this.config.enabled || width < 3 || height < 3) return heightMap;

    const iterations = this.config.iterations;
    const strength = this.config.strength;
    // Talus angle — angle of repose (60°).  Material slides when the
    // local slope exceeds tan(60°) ≈ 1.73.
    const talusAngle = Math.PI / 3;
    const talusTan = Math.tan(talusAngle);

    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const centerH = heightMap[idx];

          // 8-connected neighbourhood
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;

              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

              const nIdx = ny * width + nx;
              const neighborH = heightMap[nIdx];

              // Positive heightDiff → centre is higher than neighbour
              const heightDiff = centerH - neighborH;
              const distance = Math.sqrt(dx * dx + dy * dy);
              const slope = heightDiff / distance;

              if (slope > talusTan) {
                // Transfer proportional to the *excess* above the talus angle
                const excess = heightDiff - talusTan * distance;
                const transfer = excess * 0.5 * strength;

                if (transfer > 1e-6) {
                  heightMap[idx] -= transfer;
                  heightMap[nIdx] += transfer;
                }
              }
            }
          }
        }
      }
    }

    return heightMap;
  }
}

// ---------------------------------------------------------------------------
// Sediment Transport — flow accumulation erosion / deposition
// ---------------------------------------------------------------------------

/**
 * Sediment transport based on flow accumulation.
 *
 * 1. For every cell a D8 (steepest-descent) flow direction is computed.
 * 2. Cells are processed from highest to lowest so that upstream flow
 *    accumulates correctly downstream.
 * 3. Erosion is applied where flow × slope is high (stream-power model),
 *    carving valleys.
 * 4. Deposition is applied where flow is high but slope is low, forming
 *    alluvial fans and filling valley floors.
 *
 * The result is broad valley carving and realistic sediment deposition at
 * the base of mountain slopes.
 */
export class SedimentTransportProcess {
  private config: LandProcessConfig;

  constructor(config: Partial<LandProcessConfig> = {}) {
    this.config = { iterations: 200, strength: 0.4, enabled: true, ...config };
  }

  apply(heightMap: Float32Array, width: number, height: number): Float32Array {
    if (!this.config.enabled || width < 3 || height < 3) return heightMap;

    const iterations = this.config.iterations;
    const strength = this.config.strength;
    const size = width * height;

    // Reusable buffers (allocated once, cleared per iteration)
    const flowDir = new Int32Array(size);
    const slopeMap = new Float32Array(size);
    const flowAccum = new Float32Array(size);
    const deltaMap = new Float32Array(size);

    // 8-neighbour offsets (precomputed for speed)
    const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
    const DY = [-1, -1, -1, 0, 0, 1, 1, 1];
    const DIST = [
      Math.SQRT2, 1, Math.SQRT2,
      1,           1,
      Math.SQRT2, 1, Math.SQRT2,
    ];

    for (let iter = 0; iter < iterations; iter++) {
      // ---- Step 1: compute flow direction & slope (D8 steepest descent) --
      flowDir.fill(-1);
      slopeMap.fill(0);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const h = heightMap[idx];
          let maxSlope = 0;
          let target = -1;

          for (let n = 0; n < 8; n++) {
            const nx = x + DX[n];
            const ny = y + DY[n];
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

            const nIdx = ny * width + nx;
            const s = (h - heightMap[nIdx]) / DIST[n];
            if (s > maxSlope) {
              maxSlope = s;
              target = nIdx;
            }
          }

          flowDir[idx] = target;
          slopeMap[idx] = maxSlope;
        }
      }

      // ---- Step 2: flow accumulation (sorted highest → lowest) ----------
      flowAccum.fill(1); // unit rainfall on every cell

      // Build index array and sort by height descending
      const sorted: number[] = Array.from({ length: size }, (_, i) => i);
      sorted.sort((a, b) => heightMap[b] - heightMap[a]);

      for (let i = 0; i < size; i++) {
        const idx = sorted[i];
        const target = flowDir[idx];
        if (target >= 0) {
          flowAccum[target] += flowAccum[idx];
        }
      }

      // ---- Step 3: erosion & deposition ---------------------------------
      deltaMap.fill(0);

      for (let i = 0; i < size; i++) {
        const flow = flowAccum[i];
        const slope = slopeMap[i];

        // Stream-power erosion: √flow × slope
        const erosionAmt = strength * 0.0005 * Math.sqrt(flow) * slope;
        deltaMap[i] -= erosionAmt;

        // Deposition in flat areas with significant accumulated flow
        if (slope < 0.05 && flow > 3) {
          const flatness = 0.05 - slope; // 0..0.05
          const depositAmt = strength * 0.0002 * Math.sqrt(flow) * flatness;
          deltaMap[i] += depositAmt;
        }
      }

      // ---- Step 4: apply changes to heightmap ---------------------------
      for (let i = 0; i < size; i++) {
        heightMap[i] += deltaMap[i];
      }
    }

    return heightMap;
  }
}
