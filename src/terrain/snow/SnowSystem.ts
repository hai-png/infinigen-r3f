/**
 * Physics-Based Snowfall Simulation System
 *
 * TypeScript port of Landlab's FlowDirectorSteepest + TransportLengthHillslopeDiffuser,
 * extended with realistic snow accumulation physics for the infinigen-r3f terrain pipeline.
 *
 * Core components:
 * 1. FlowDirectorSteepest — D8 flow routing with depression-filling (Landlab port)
 * 2. TransportLengthHillslopeDiffuser — Hillslope diffusion with transport-length limiter
 * 3. Snow Accumulation Physics — SWE tracking, lapse rate, wind redistribution, aspect radiation, compaction
 * 4. Snow Mask Generation — Normal-based retention, preference directions, smooth blending
 * 5. TwoPhaseTerrainPipeline Integration — Accepts heightmap + normals, outputs snow depth/mask/heightmap
 *
 * All random operations are seed-based for reproducibility.
 *
 * @module terrain/snow/SnowSystem
 */

import * as THREE from 'three';
import { PerlinNoiseSource, type NoiseSource } from '../source';

// ============================================================================
// Constants
// ============================================================================

/** D8 neighbor offsets (row, col) for the 8 surrounding cells */
const D8_OFFSETS: readonly [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

/** Distance weights for D8 neighbors (cardinal=1, diagonal=√2) */
const D8_DISTANCES: readonly number[] = [
  Math.SQRT2, 1, Math.SQRT2,
  1,           1,
  Math.SQRT2, 1, Math.SQRT2,
];

/** Direction codes for D8 flow routing (−1 = unassigned / boundary) */
const UNASSIGNED_FLOW = -1;

/** Gravity constant (m/s²) */
const GRAVITY = 9.81;

/** Stefan-Boltzmann constant (W/m²/K⁴) — used in longwave radiation */
const STEFAN_BOLTZMANN = 5.67e-8;

/** Fresh snow density (kg/m³) */
const FRESH_SNOW_DENSITY = 50;

/** Maximum snow density after compaction (kg/m³) */
const MAX_SNOW_DENSITY = 600;

/** Density of water (kg/m³) */
const WATER_DENSITY = 1000;

/** Latent heat of fusion for water (J/kg) */
const LATENT_HEAT_FUSION = 334000;

/** Specific heat of ice (J/kg/K) */
const SPECIFIC_HEAT_ICE = 2090;

/** Solar constant (W/m²) */
const SOLAR_CONSTANT = 1361;

// ============================================================================
// Public Interfaces
// ============================================================================

/**
 * Configuration for the physics-based snowfall simulation.
 */
export interface SnowParams {
  // --- Snow accumulation ---
  /** Base snow-water equivalent depth in meters (default: 0.05) */
  baseSWEDepth: number;
  /** Maximum snow depth in meters (default: 3.0) */
  maxDepth: number;
  /** Snowfall rate in mm SWE per hour (default: 2.0) */
  snowfallRate: number;

  // --- Temperature & melt ---
  /** Base temperature at sea level in °C (default: -5) */
  baseTemperature: number;
  /** Temperature lapse rate in °C per 1000m altitude (default: -6.5) */
  lapseRate: number;
  /** Degree-day melt factor in mm SWE / °C / day (default: 3.0) */
  degreeDayFactor: number;
  /** Critical temperature below which precipitation falls as snow (°C, default: 1.5) */
  snowThresholdTemp: number;

  // --- Wind-driven redistribution ---
  /** Wind strength 0-1 (default: 0.4) */
  windStrength: number;
  /** Wind direction (normalized, default: [1,0,0]) */
  windDirection: THREE.Vector3;
  /** Saltation transport coefficient (default: 0.3) */
  saltationCoeff: number;
  /** Suspension transport coefficient (default: 0.15) */
  suspensionCoeff: number;
  /** Wind shadow / snow fence effect (0-1, default: 0.5) */
  windShadowFactor: number;

  // --- Solar radiation ---
  /** Enable aspect-dependent solar radiation (default: true) */
  enableAspectMelt: boolean;
  /** Solar radiation multiplier for south-facing slopes (default: 1.5) */
  southFacingMeltMultiplier: number;

  // --- Flow routing ---
  /** Number of flow routing iterations (default: 3) */
  flowRoutingIterations: number;
  /** Depression-filling tolerance in meters (default: 0.01) */
  pitFillTolerance: number;

  // --- Diffusion ---
  /** Hillslope diffusivity coefficient D (m²/s, default: 0.001) */
  diffusivity: number;
  /** Critical slope threshold for transport (radians, default: ~36°) */
  criticalSlope: number;
  /** Number of diffusion time steps per simulation step (default: 5) */
  diffusionSteps: number;
  /** Diffusion time step in seconds (default: 3600) */
  diffusionDt: number;

  // --- Snow compaction ---
  /** Enable snow compaction over time (default: true) */
  enableCompaction: boolean;
  /** Compaction rate constant (1/s, default: 1e-7) */
  compactionRate: number;

  // --- Snow mask ---
  /** Normal Y threshold for snow retention (0-1, default: 0.5) */
  normalThreshold: number;
  /** Slope angle above which snow slides off completely (degrees, default: 60) */
  slideAngleMax: number;
  /** Slope angle below which snow fully accumulates (degrees, default: 30) */
  slideAngleMin: number;
  /** Normal preference direction for snow shelter (default: wind direction) */
  preferenceDirection: THREE.Vector3;
  /** Preference direction weight (0-1, default: 0.3) */
  preferenceWeight: number;
  /** Minimum snow depth for a cell to appear in the binary mask (m, default: 0.01) */
  maskMinDepth: number;
  /** Snow mask blending smoothness (0 = sharp, 1 = very smooth, default: 0.5) */
  maskSmoothness: number;

  // --- Visualization ---
  /** Snow color (default: white with slight blue tint) */
  color: THREE.Color;
  /** Snow roughness (PBR, default: 0.4) */
  roughness: number;
  /** Snow metalness (PBR, default: 0.0) */
  metalness: number;
  /** Snow sparkle intensity (0-1, default: 0.3) */
  sparkleIntensity: number;
  /** SSS translucency approximation (0-1, default: 0.2) */
  translucency: number;
  /** Surface smoothing passes (default: 3) */
  smoothingPasses: number;
  /** Minimum depth for mesh overlay (m, default: 0.01) */
  minDepthForMesh: number;
  /** Enable wind drift patterns (default: true) */
  enableDrifts: boolean;
  /** Drift noise scale (default: 10) */
  driftScale: number;

  // --- Seed & resolution ---
  /** Random seed for reproducibility (default: 12345) */
  seed: number;
  /** Simulation time step in seconds (default: 3600 = 1 hour) */
  timeStep: number;
  /** Number of simulation iterations per call (default: 24 = 1 day) */
  iterations: number;
}

// ============================================================================
// Internal Grid Types
// ============================================================================

/** Mutable grid wrapper for heightmap operations */
interface GridData {
  data: Float32Array;
  width: number;
  height: number;
}

/** Result of flow routing computation */
interface FlowRoutingResult {
  /** Per-cell receiver index (flat array, −1 = boundary/sink) */
  receivers: Int32Array;
  /** Flow accumulation count at each cell */
  accumulation: Float32Array;
  /** Filled (depression-corrected) elevation grid */
  filledElevation: Float32Array;
  /** Slope to steepest downhill neighbor (positive = downhill) */
  steepestSlope: Float32Array;
}

/** Snow state per grid cell */
interface SnowCellState {
  /** Snow-water equivalent depth (m) */
  swe: number;
  /** Snow depth (m) — swe / (density / WATER_DENSITY) */
  depth: number;
  /** Snow density (kg/m³) */
  density: number;
  /** Temperature of snowpack (°C) */
  temperature: number;
  /** Age of snowpack in seconds */
  age: number;
}

// ============================================================================
// SeededRandom — lightweight deterministic PRNG for snow simulation
// ============================================================================

class SnowRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max) */
  uniform(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Returns a Gaussian-distributed value using Box-Muller */
  gaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(Math.max(1e-10, u1))) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
}

// ============================================================================
// FlowDirectorSteepest — D8 Flow Routing (Landlab port)
// ============================================================================

/**
 * FlowDirectorSteepest: Directs flow from each cell to its steepest downhill
 * neighbor using the D8 algorithm. Includes depression-filling to handle pits
 * and flat areas that would otherwise trap flow.
 *
 * This is a TypeScript port of Landlab's FlowDirectorSteepest component.
 *
 * Algorithm:
 * 1. Fill depressions (pits) in the elevation grid using a priority-flood algorithm
 * 2. For each cell, find the steepest downhill neighbor among 8 surrounding cells
 * 3. Build a receiver map (each cell → its downstream neighbor)
 * 4. Compute flow accumulation by traversing from each cell to its outlet
 */
class FlowDirectorSteepest {
  private width: number;
  private height: number;
  private size: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.size = width * height;
  }

  /**
   * Run the full D8 flow routing algorithm on an elevation grid.
   *
   * @param elevation - Raw elevation values (flat Float32Array, row-major)
   * @param tolerance - Depression fill tolerance in meters
   * @returns FlowRoutingResult with receivers, accumulation, filled elevation, slopes
   */
  route(elevation: Float32Array, tolerance: number = 0.01): FlowRoutingResult {
    // Step 1: Fill depressions
    const filled = this.fillDepressions(elevation, tolerance);

    // Step 2: Find steepest downhill neighbor for each cell
    const receivers = new Int32Array(this.size);
    const steepestSlope = new Float32Array(this.size);

    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const idx = row * this.width + col;
        const elev = filled[idx];

        let maxSlope = 0;
        let bestReceiver = UNASSIGNED_FLOW;

        for (let n = 0; n < 8; n++) {
          const nRow = row + D8_OFFSETS[n][0];
          const nCol = col + D8_OFFSETS[n][1];

          if (nRow < 0 || nRow >= this.height || nCol < 0 || nCol >= this.width) continue;

          const nIdx = nRow * this.width + nCol;
          const nElev = filled[nIdx];
          const slope = (elev - nElev) / D8_DISTANCES[n];

          if (slope > maxSlope) {
            maxSlope = slope;
            bestReceiver = nIdx;
          }
        }

        receivers[idx] = bestReceiver;
        steepestSlope[idx] = maxSlope;
      }
    }

    // Step 3: Compute flow accumulation
    const accumulation = this.computeAccumulation(receivers);

    return { receivers, accumulation, filledElevation: filled, steepestSlope };
  }

  /**
   * Fill depressions (pits) in the elevation grid using a priority-flood algorithm.
   *
   * This is a TypeScript port of the depression-filling algorithm used in Landlab's
   * SinkFiller component. It ensures that all cells have a valid downhill path to
   * the grid boundary (watershed outlet).
   *
   * Algorithm:
   * - Initialize boundary cells in a priority queue
   * - Process cells in order of elevation (lowest first)
   * - If a cell is lower than its processed neighbor, raise it to match
   *   (within the tolerance) so flow can route through it
   *
   * @param elevation - Raw elevation values
   * @param tolerance - Maximum fill height above original (meters)
   * @returns Filled elevation grid
   */
  fillDepressions(elevation: Float32Array, tolerance: number): Float32Array {
    const filled = new Float32Array(elevation);
    const closed = new Uint8Array(this.size); // 0 = open, 1 = in queue, 2 = processed

    // Simple priority queue using a sorted insertion approach
    // For grid sizes typical of terrain (256×256 = 65K cells), this is adequate.
    // Uses a binary heap for O(n log n) performance.
    const heap: { idx: number; elev: number }[] = [];

    const pushHeap = (idx: number, elev: number): void => {
      heap.push({ idx, elev });
      let pos = heap.length - 1;
      while (pos > 0) {
        const parent = (pos - 1) >> 1;
        if (heap[parent].elev <= heap[pos].elev) break;
        [heap[parent], heap[pos]] = [heap[pos], heap[parent]];
        pos = parent;
      }
    };

    const popHeap = (): { idx: number; elev: number } | undefined => {
      if (heap.length === 0) return undefined;
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let pos = 0;
        while (true) {
          let smallest = pos;
          const left = 2 * pos + 1;
          const right = 2 * pos + 2;
          if (left < heap.length && heap[left].elev < heap[smallest].elev) smallest = left;
          if (right < heap.length && heap[right].elev < heap[smallest].elev) smallest = right;
          if (smallest === pos) break;
          [heap[pos], heap[smallest]] = [heap[smallest], heap[pos]];
          pos = smallest;
        }
      }
      return top;
    };

    // Seed the queue with boundary cells
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        if (row === 0 || row === this.height - 1 || col === 0 || col === this.width - 1) {
          const idx = row * this.width + col;
          pushHeap(idx, filled[idx]);
          closed[idx] = 1;
        }
      }
    }

    // Priority-flood: process cells from lowest elevation
    while (heap.length > 0) {
      const entry = popHeap();
      if (!entry) break;
      const { idx, elev: currentElev } = entry;

      if (closed[idx] === 2) continue; // Already processed
      closed[idx] = 2;

      const row = Math.floor(idx / this.width);
      const col = idx % this.width;

      // Visit neighbors
      for (let n = 0; n < 8; n++) {
        const nRow = row + D8_OFFSETS[n][0];
        const nCol = col + D8_OFFSETS[n][1];

        if (nRow < 0 || nRow >= this.height || nCol < 0 || nCol >= this.width) continue;

        const nIdx = nRow * this.width + nCol;
        if (closed[nIdx] === 2) continue; // Already processed

        // If neighbor is lower than current, it's a pit — fill it
        if (filled[nIdx] < currentElev) {
          // Fill only within tolerance; if the pit is too deep, leave it
          const fillElev = Math.min(filled[nIdx] + tolerance, currentElev);
          filled[nIdx] = fillElev;
        }

        if (closed[nIdx] === 0) {
          pushHeap(nIdx, filled[nIdx]);
          closed[nIdx] = 1;
        }
      }
    }

    return filled;
  }

  /**
   * Compute flow accumulation from the receiver map.
   *
   * Traverses each cell's flow path to the outlet, accumulating
   * flow counts. Uses a topological sort for efficiency.
   */
  private computeAccumulation(receivers: Int32Array): Float32Array {
    const accumulation = new Float32Array(this.size);
    // Initialize each cell with unit flow
    accumulation.fill(1);

    // Compute in-degree for each node
    const inDegree = new Int32Array(this.size);
    for (let i = 0; i < this.size; i++) {
      const recv = receivers[i];
      if (recv >= 0 && recv !== i) {
        inDegree[recv]++;
      }
    }

    // Topological sort using Kahn's algorithm
    const queue: number[] = [];
    for (let i = 0; i < this.size; i++) {
      if (inDegree[i] === 0) {
        queue.push(i);
      }
    }

    let head = 0;
    while (head < queue.length) {
      const cell = queue[head++];
      const recv = receivers[cell];

      if (recv >= 0 && recv !== cell) {
        // Accumulate flow downstream
        accumulation[recv] += accumulation[cell];
        inDegree[recv]--;
        if (inDegree[recv] === 0) {
          queue.push(recv);
        }
      }
    }

    return accumulation;
  }
}

// ============================================================================
// TransportLengthHillslopeDiffuser (Landlab port)
// ============================================================================

/**
 * TransportLengthHillslopeDiffuser: Implements hillslope diffusion with
 * transport-length limiting, as used in Landlab's component of the same name.
 *
 * The diffusion equation is:  ∂z/∂t = D · ∇²z + transport
 *
 * Transport length is dependent on slope and material properties:
 * - On gentle slopes, transport is limited (short transport length)
 * - On steep slopes exceeding the critical angle, transport is unlimited
 * - Between these regimes, transport length varies linearly
 *
 * This produces more realistic terrain evolution than simple diffusion,
 * as it prevents unrealistic over-steepening and produces natural
 * slope-break morphologies.
 */
class TransportLengthHillslopeDiffuser {
  private width: number;
  private height: number;

  /** Hillslope diffusivity (m²/s) */
  private diffusivity: number;
  /** Critical slope threshold (radians) */
  private criticalSlope: number;
  /** Time step (s) */
  private dt: number;

  constructor(width: number, height: number, diffusivity: number, criticalSlope: number, dt: number) {
    this.width = width;
    this.height = height;
    this.diffusivity = diffusivity;
    this.criticalSlope = criticalSlope;
    this.dt = dt;
  }

  /**
   * Run one diffusion step on the elevation/snow grid.
   *
   * Applies the transport-length-limited hillslope diffusion equation
   * to the combined terrain+snow elevation, with separate tracking of
   * snow redistribution.
   *
   * @param elevation - Current elevation grid (terrain + snow combined)
   * @param snowDepth - Snow depth grid (modified in-place for snow redistribution)
   * @param cellSize - Grid cell spacing in meters
   */
  diffuse(elevation: Float32Array, snowDepth: Float32Array, cellSize: number): void {
    const size = this.width * this.height;
    const dzdt = new Float32Array(size); // Elevation change rate

    const D = this.diffusivity;
    const sc = this.criticalSlope;
    const dx = cellSize;

    // Compute Laplacian and transport at each cell
    for (let row = 1; row < this.height - 1; row++) {
      for (let col = 1; col < this.width - 1; col++) {
        const idx = row * this.width + col;
        const z = elevation[idx];

        // Compute gradients in 4 cardinal directions
        const zL = elevation[idx - 1];
        const zR = elevation[idx + 1];
        const zU = elevation[(row - 1) * this.width + col];
        const zD = elevation[(row + 1) * this.width + col];

        // Second derivative (Laplacian) using central differences
        const d2zdx2 = (zR - 2 * z + zL) / (dx * dx);
        const d2zdy2 = (zD - 2 * z + zU) / (dx * dx);
        const laplacian = d2zdx2 + d2zdy2;

        // Compute local slope magnitude
        const dzdx = (zR - zL) / (2 * dx);
        const dzdy = (zD - zU) / (2 * dx);
        const slope = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
        const slopeAngle = Math.atan(slope);

        // Transport length factor: limits diffusion on gentle slopes
        // Full transport above critical slope, linear ramp below
        let transportFactor: number;
        if (slopeAngle >= sc) {
          transportFactor = 1.0;
        } else if (slopeAngle > 0) {
          // Smooth ramp using cubic interpolation for stability
          const t = slopeAngle / sc;
          transportFactor = t * t * (3 - 2 * t); // smoothstep
        } else {
          transportFactor = 0;
        }

        // Diffusion equation: ∂z/∂t = D * ∇²z * transportFactor
        dzdt[idx] = D * laplacian * transportFactor;
      }
    }

    // Apply elevation changes and update snow depth
    const maxChange = dx * 0.1; // Stability limit
    for (let i = 0; i < size; i++) {
      let change = dzdt[i] * this.dt;

      // Clamp change for numerical stability
      change = Math.max(-maxChange, Math.min(maxChange, change));

      // Only redistribute snow (not bedrock)
      if (snowDepth[i] > 0) {
        const snowChange = Math.min(Math.abs(change), snowDepth[i] * 0.3) * Math.sign(change);
        snowDepth[i] = Math.max(0, snowDepth[i] + snowChange);
      }
    }
  }

  /**
   * Run multiple diffusion steps.
   */
  runMultipleSteps(
    elevation: Float32Array,
    snowDepth: Float32Array,
    cellSize: number,
    steps: number,
  ): void {
    for (let step = 0; step < steps; step++) {
      this.diffuse(elevation, snowDepth, cellSize);
    }
  }
}

// ============================================================================
// Snow Accumulation Physics
// ============================================================================

/**
 * Snow accumulation physics engine.
 *
 * Implements:
 * - Snow-water equivalence (SWE) tracking per grid cell
 * - Temperature-dependent accumulation/melt with altitude lapse rate
 * - Wind-driven snow redistribution (saltation + suspension transport)
 * - Aspect-dependent solar radiation (south-facing slopes melt faster)
 * - Snow compaction over time (density increase)
 * - Degree-day melt model
 */
class SnowAccumulationPhysics {
  private params: SnowParams;
  private rng: SnowRNG;
  private windNoise: NoiseSource;
  private radiationNoise: NoiseSource;

  /** Per-cell snow state */
  private snowState: SnowCellState[];

  constructor(params: SnowParams) {
    this.params = params;
    this.rng = new SnowRNG(params.seed);
    this.windNoise = new PerlinNoiseSource(params.seed + 100);
    this.radiationNoise = new PerlinNoiseSource(params.seed + 200);
    this.snowState = [];
  }

  /**
   * Initialize snow state arrays for a grid of given size.
   */
  initializeState(size: number): void {
    this.snowState = new Array(size);
    for (let i = 0; i < size; i++) {
      this.snowState[i] = {
        swe: this.params.baseSWEDepth,
        depth: this.params.baseSWEDepth / (FRESH_SNOW_DENSITY / WATER_DENSITY),
        density: FRESH_SNOW_DENSITY,
        temperature: this.params.baseTemperature,
        age: 0,
      };
    }
  }

  /**
   * Get the snow state array.
   */
  getState(): SnowCellState[] {
    return this.snowState;
  }

  /**
   * Run one time step of snow physics.
   *
   * @param gridWidth - Grid width
   * @param gridHeight - Grid height
   * @param heightMap - Terrain heightmap
   * @param normalMap - Normal map (3 components per vertex)
   * @param flowResult - Flow routing result for snow redistribution
   * @param cellSize - Grid cell spacing in meters
   */
  step(
    gridWidth: number,
    gridHeight: number,
    heightMap: Float32Array,
    normalMap: Float32Array,
    flowResult: FlowRoutingResult,
    cellSize: number,
  ): void {
    const dt = this.params.timeStep;
    const size = gridWidth * gridHeight;

    // --- Phase 1: Snowfall accumulation ---
    this.accumulateSnowfall(size, heightMap, dt);

    // --- Phase 2: Temperature-dependent melt ---
    this.computeMelt(size, heightMap, normalMap, dt);

    // --- Phase 3: Wind-driven redistribution ---
    if (this.params.windStrength > 0) {
      this.windRedistribution(gridWidth, gridHeight, heightMap, normalMap, flowResult, cellSize, dt);
    }

    // --- Phase 4: Snow compaction ---
    if (this.params.enableCompaction) {
      this.compactSnow(size, dt);
    }

    // --- Phase 5: Snow sliding on steep slopes ---
    this.slideSnow(gridWidth, gridHeight, heightMap, normalMap, cellSize);

    // --- Phase 6: Update derived quantities ---
    this.updateDerived(size);
  }

  /**
   * Phase 1: Accumulate snowfall based on temperature and altitude.
   *
   * Uses the lapse rate to determine local temperature at each cell.
   * If local temperature is below the snow threshold, precipitation
   * falls as snow; otherwise as rain (which is ignored for snow depth).
   */
  private accumulateSnowfall(size: number, heightMap: Float32Array, dt: number): void {
    const lapseRatePerMeter = this.params.lapseRate / 1000; // °C/m

    for (let i = 0; i < size; i++) {
      const altitude = heightMap[i];
      const localTemp = this.params.baseTemperature + lapseRatePerMeter * altitude;

      // Only accumulate snow when below threshold temperature
      if (localTemp < this.params.snowThresholdTemp) {
        // Snowfall rate varies with temperature (more snow at colder temps)
        const tempFactor = Math.max(0, 1 - (localTemp - this.params.baseTemperature) / 20);
        const snowfall = this.params.snowfallRate / 1000 * tempFactor * (dt / 3600); // mm/hr to m

        this.snowState[i].swe += snowfall;
      }
    }
  }

  /**
   * Phase 2: Compute snowmelt using degree-day model with aspect-dependent
   * solar radiation correction.
   *
   * Melt = degreeDayFactor × max(0, T_local) × radiation_correction
   *
   * South-facing slopes receive more solar radiation and melt faster.
   * The radiation correction is based on the surface normal's orientation
   * relative to the sun's position (assumed to be due south at noon).
   */
  private computeMelt(size: number, heightMap: Float32Array, normalMap: Float32Array, dt: number): void {
    const lapseRatePerMeter = this.params.lapseRate / 1000;

    for (let i = 0; i < size; i++) {
      const altitude = heightMap[i];
      const localTemp = this.params.baseTemperature + lapseRatePerMeter * altitude;

      // Skip if below freezing (no melt)
      if (localTemp <= 0) continue;

      // Base melt from degree-day model
      let meltRate = this.params.degreeDayFactor / 1000 * localTemp * (dt / 86400); // mm/day to m

      // Aspect-dependent solar radiation correction
      if (this.params.enableAspectMelt && normalMap.length > i * 3 + 2) {
        const nx = normalMap[i * 3];
        const nz = normalMap[i * 3 + 2]; // Z component in terrain space

        // Compute aspect: angle of the surface normal projected onto the XZ plane
        // South-facing means the normal points in the -Z direction (toward the sun in N. hemisphere)
        // We use the Z component: nz < 0 = south-facing = more sun
        const aspectFactor = -nz; // Positive when south-facing

        if (aspectFactor > 0) {
          // South-facing: increased melt
          const sunExposure = Math.min(1, aspectFactor * 2);
          meltRate *= 1 + (this.params.southFacingMeltMultiplier - 1) * sunExposure;
        } else if (aspectFactor < 0) {
          // North-facing: decreased melt
          const shadowFactor = Math.min(1, -aspectFactor * 2);
          meltRate *= 1 - shadowFactor * 0.5; // Up to 50% reduction
        }

        // Add noise-based cloud cover variation
        const cloudNoise = this.radiationNoise.sample2D(
          (i % Math.round(Math.sqrt(size))) * 0.01,
          Math.floor(i / Math.round(Math.sqrt(size))) * 0.01,
        );
        meltRate *= 0.8 + 0.4 * Math.max(0, cloudNoise); // 0.8× to 1.2×
      }

      // Apply melt
      this.snowState[i].swe = Math.max(0, this.snowState[i].swe - meltRate);
    }
  }

  /**
   * Phase 3: Wind-driven snow redistribution.
   *
   * Models two transport mechanisms:
   * - Saltation: Snow particles bouncing along the surface (dominant at moderate wind)
   * - Suspension: Fine particles carried in the air (dominant at high wind)
   *
   * Snow is eroded from windward faces and deposited in leeward (sheltered) areas.
   * The wind shadow effect creates drifts behind obstacles.
   */
  private windRedistribution(
    gridWidth: number,
    gridHeight: number,
    heightMap: Float32Array,
    normalMap: Float32Array,
    flowResult: FlowRoutingResult,
    cellSize: number,
    dt: number,
  ): void {
    const windDir = this.params.windDirection.clone().normalize();
    const size = gridWidth * gridHeight;

    // Compute wind exposure at each cell
    const windExposure = new Float32Array(size);   // Positive = windward, Negative = leeward
    const snowTransport = new Float32Array(size);   // Net transport flux at each cell

    for (let row = 1; row < gridHeight - 1; row++) {
      for (let col = 1; col < gridWidth - 1; col++) {
        const idx = row * gridWidth + col;

        if (this.snowState[idx].swe <= 0) continue;

        // Compute wind exposure from surface normal
        const nx = normalMap[idx * 3];
        const ny = normalMap[idx * 3 + 1];
        const nz = normalMap[idx * 3 + 2];

        // Dot product of normal with wind direction
        // Positive = windward (facing into wind), Negative = leeward (sheltered)
        const windDot = nx * windDir.x + ny * windDir.y + nz * windDir.z;
        windExposure[idx] = windDot;

        // Transport capacity depends on wind strength and snow availability
        const snowAvailable = this.snowState[idx].swe;

        if (windDot > 0) {
          // Windward: erosion (saltation + suspension)
          const erosionRate = this.params.saltationCoeff * windDot * this.params.windStrength;
          const suspensionRate = this.params.suspensionCoeff * Math.pow(windDot, 2) * this.params.windStrength;
          const totalErosion = (erosionRate + suspensionRate) * snowAvailable * (dt / 3600);

          snowTransport[idx] -= Math.min(totalErosion, snowAvailable * 0.3);
        } else if (windDot < 0) {
          // Leeward: deposition
          // Deposit more snow in sheltered areas (wind shadow effect)
          const shelterFactor = -windDot * this.params.windShadowFactor;

          // Add noise-based drift variation
          const driftNoise = this.windNoise.sample2D(
            col / this.params.driftScale,
            row / this.params.driftScale,
          );
          const driftVariation = 1 + 0.3 * Math.max(0, driftNoise);

          const depositionRate = shelterFactor * this.params.windStrength * driftVariation * (dt / 3600);
          snowTransport[idx] += depositionRate * this.params.baseSWEDepth;
        }
      }
    }

    // Apply transport: move eroded snow to downstream cells using flow routing
    for (let idx = 0; idx < size; idx++) {
      if (snowTransport[idx] < 0) {
        // Erosion: remove snow from this cell
        const erosion = Math.abs(snowTransport[idx]);
        const actualErosion = Math.min(erosion, this.snowState[idx].swe);
        this.snowState[idx].swe -= actualErosion;

        // Deposit eroded snow downstream (along flow path)
        let depositRemaining = actualErosion;
        let currentIdx = idx;
        const maxSteps = 10; // Limit transport distance

        for (let step = 0; step < maxSteps && depositRemaining > 0; step++) {
          const recv = flowResult.receivers[currentIdx];
          if (recv < 0 || recv === currentIdx) break;

          // Deposit fraction decreases with distance
          const depositFraction = 0.4 * (1 - step / maxSteps);
          const deposit = depositRemaining * depositFraction;

          this.snowState[recv].swe += deposit;
          depositRemaining -= deposit;
          currentIdx = recv;
        }

        // Any remaining snow is deposited at the last cell
        if (depositRemaining > 0 && currentIdx >= 0 && currentIdx < size) {
          this.snowState[currentIdx].swe += depositRemaining;
        }
      } else {
        // Direct deposition (from wind shadow effect)
        this.snowState[idx].swe += snowTransport[idx];
      }
    }
  }

  /**
   * Phase 4: Snow compaction over time.
   *
   * Snow density increases over time due to overburden pressure and
   * metamorphic processes. This reduces snow depth while maintaining
   * constant SWE.
   *
   * Compaction rate: dρ/dt = compactionRate * ρ * exp(-0.02 * ρ/ρ_max)
   *
   * This produces an asymptotic approach to maximum density.
   */
  private compactSnow(size: number, dt: number): void {
    for (let i = 0; i < size; i++) {
      const state = this.snowState[i];
      if (state.swe <= 0) continue;

      state.age += dt;

      // Overburden pressure increases with depth (more compaction at bottom)
      const overburdenFactor = 1 + state.depth * 2; // Deeper snow compacts faster

      // Compaction rate with asymptotic density limit
      const densityRatio = state.density / MAX_SNOW_DENSITY;
      const compactionAmount = this.params.compactionRate * overburdenFactor *
        Math.exp(-5 * densityRatio) * dt;

      state.density = Math.min(MAX_SNOW_DENSITY, state.density + compactionAmount * state.density);
    }
  }

  /**
   * Phase 5: Snow sliding on steep slopes.
   *
   * Snow slides off surfaces steeper than the critical angle.
   * Between slideAngleMin and slideAngleMax, the fraction of snow
   * that slides increases linearly.
   *
   * Sliding snow follows the flow routing path downhill.
   */
  private slideSnow(
    gridWidth: number,
    gridHeight: number,
    heightMap: Float32Array,
    normalMap: Float32Array,
    cellSize: number,
  ): void {
    const minRad = this.params.slideAngleMin * Math.PI / 180;
    const maxRad = this.params.slideAngleMax * Math.PI / 180;
    const size = gridWidth * gridHeight;

    for (let i = 0; i < size; i++) {
      if (this.snowState[i].swe <= 0) continue;

      const ny = normalMap[i * 3 + 1];
      const slopeAngle = Math.acos(Math.max(0, Math.min(1, ny)));

      if (slopeAngle <= minRad) continue; // Below threshold, no sliding

      let slideFraction: number;
      if (slopeAngle >= maxRad) {
        slideFraction = 1.0; // Complete removal
      } else {
        // Linear ramp between min and max
        slideFraction = (slopeAngle - minRad) / (maxRad - minRad);
      }

      // Smooth the transition
      slideFraction = slideFraction * slideFraction * (3 - 2 * slideFraction);

      const slideAmount = this.snowState[i].swe * slideFraction * 0.5;
      this.snowState[i].swe -= slideAmount;

      // Move slid snow to the downhill neighbor
      const row = Math.floor(i / gridWidth);
      const col = i % gridWidth;

      let bestIdx = i;
      let maxSlope = 0;
      for (let n = 0; n < 8; n++) {
        const nRow = row + D8_OFFSETS[n][0];
        const nCol = col + D8_OFFSETS[n][1];
        if (nRow < 0 || nRow >= gridHeight || nCol < 0 || nCol >= gridWidth) continue;
        const nIdx = nRow * gridWidth + nCol;
        const slope = (heightMap[i] - heightMap[nIdx]) / D8_DISTANCES[n];
        if (slope > maxSlope) {
          maxSlope = slope;
          bestIdx = nIdx;
        }
      }

      if (bestIdx !== i && bestIdx < size) {
        this.snowState[bestIdx].swe += slideAmount;
      }
    }
  }

  /**
   * Phase 6: Update derived quantities (depth from SWE and density).
   *
   * depth = swe / (density / WATER_DENSITY)
   * Also clamps values to valid ranges.
   */
  private updateDerived(size: number): void {
    for (let i = 0; i < size; i++) {
      const state = this.snowState[i];

      // Compute depth from SWE and density
      if (state.swe > 0) {
        state.depth = state.swe / (state.density / WATER_DENSITY);
        state.depth = Math.min(state.depth, this.params.maxDepth);
      } else {
        state.swe = 0;
        state.depth = 0;
        state.density = FRESH_SNOW_DENSITY;
        state.age = 0;
      }

      // Snowpack temperature follows air temperature with lag
      const lapseRatePerMeter = this.params.lapseRate / 1000;
      // (temperature is updated externally via heightMap, so we keep the last value)
    }
  }

  /**
   * Compute the combined terrain+snow elevation grid.
   */
  computeCombinedElevation(heightMap: Float32Array, size: number): Float32Array {
    const combined = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      combined[i] = heightMap[i] + this.snowState[i].depth;
    }
    return combined;
  }

  /**
   * Extract snow depth as a flat Float32Array.
   */
  getSnowDepthMap(size: number): Float32Array {
    const depthMap = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      depthMap[i] = this.snowState[i].depth;
    }
    return depthMap;
  }

  /**
   * Extract SWE as a flat Float32Array.
   */
  getSWEDepthMap(size: number): Float32Array {
    const sweMap = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      sweMap[i] = this.snowState[i].swe;
    }
    return sweMap;
  }

  /**
   * Extract snow density as a flat Float32Array.
   */
  getDensityMap(size: number): Float32Array {
    const densityMap = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      densityMap[i] = this.snowState[i].density;
    }
    return densityMap;
  }
}

// ============================================================================
// Snow Mask Generator
// ============================================================================

/**
 * Generates a per-cell snow mask based on:
 * - Surface normal (steep slopes shed snow)
 * - Wind shadow (leeward faces accumulate more)
 * - Snow depth threshold
 * - Preference directions (sheltered faces)
 * - Smooth blending between snow and rock
 */
class SnowMaskGenerator {
  private params: SnowParams;
  private maskNoise: NoiseSource;

  constructor(params: SnowParams) {
    this.params = params;
    this.maskNoise = new PerlinNoiseSource(params.seed + 300);
  }

  /**
   * Compute the snow mask.
   *
   * @param normalMap - Surface normals (3 components per vertex)
   * @param snowDepth - Snow depth per cell
   * @param vertexCount - Number of vertices
   * @returns Float32Array with one value per vertex in [0, 1]
   */
  compute(normalMap: Float32Array, snowDepth: Float32Array, vertexCount: number): Float32Array {
    const mask = new Float32Array(vertexCount);

    const minRad = this.params.slideAngleMin * Math.PI / 180;
    const maxRad = this.params.slideAngleMax * Math.PI / 180;

    for (let i = 0; i < vertexCount; i++) {
      const nx = normalMap[i * 3];
      const ny = normalMap[i * 3 + 1];
      const nz = normalMap[i * 3 + 2];
      const depth = snowDepth[i] ?? 0;

      // --- Factor 1: Normal-based retention ---
      let coverage = 0;

      if (ny >= this.params.normalThreshold) {
        coverage = 1;
      } else if (ny > 0) {
        coverage = ny / this.params.normalThreshold;
        // Apply configurable smoothness
        const s = this.params.maskSmoothness;
        if (s < 1) {
          // Sharper transition
          const t = coverage;
          coverage = Math.pow(t, 1 / Math.max(0.1, s));
        } else {
          // Smoother transition (higher-order smoothstep)
          coverage = coverage * coverage * (3 - 2 * coverage);
        }
      } else {
        // Overhanging / vertical — no snow
        coverage = 0;
      }

      // --- Factor 2: Slope-based sliding ---
      const slopeAngle = Math.acos(Math.max(0, Math.min(1, ny)));
      if (slopeAngle > minRad) {
        let slideFactor: number;
        if (slopeAngle >= maxRad) {
          slideFactor = 0;
        } else {
          const t = (slopeAngle - minRad) / (maxRad - minRad);
          slideFactor = 1 - t;
          slideFactor = slideFactor * slideFactor * (3 - 2 * slideFactor); // smoothstep
        }
        coverage *= slideFactor;
      }

      // --- Factor 3: Wind shadow (lee-side accumulation) ---
      if (this.params.windStrength > 0) {
        const windDir = this.params.windDirection;
        const windDot = nx * windDir.x + ny * windDir.y + nz * windDir.z;

        if (windDot < 0) {
          // Leeward — boost snow coverage
          const shadowBoost = (-windDot) * this.params.windShadowFactor;
          coverage = Math.min(1, coverage + shadowBoost * (1 - coverage));
        } else {
          // Windward — reduce snow slightly
          coverage *= 1 - windDot * this.params.windShadowFactor * 0.3;
        }
      }

      // --- Factor 4: Preference direction (sheltered faces) ---
      if (this.params.preferenceWeight > 0) {
        const prefDir = this.params.preferenceDirection;
        const prefDot = nx * prefDir.x + ny * prefDir.y + nz * prefDir.z;
        if (prefDot < 0) {
          // Sheltered from preference direction
          const prefBoost = (-prefDot) * this.params.preferenceWeight;
          coverage = Math.min(1, coverage + prefBoost * (1 - coverage));
        }
      }

      // --- Factor 5: Depth threshold ---
      if (depth < this.params.maskMinDepth) {
        coverage = 0;
      } else {
        // Scale coverage by depth (thin snow = partially covered)
        const depthFactor = Math.min(1, depth / (this.params.maskMinDepth * 5));
        coverage *= depthFactor;
      }

      // --- Factor 6: Edge proximity (reduce snow near cliff edges) ---
      const edgeFactor = Math.sqrt(nx * nx + nz * nz);
      if (edgeFactor > 0.7) {
        coverage *= Math.max(0, (1 - edgeFactor) / 0.3);
      }

      // --- Factor 7: Noise-based variation for natural look ---
      const noiseVal = this.maskNoise.sample2D(i * 0.1, i * 0.07);
      coverage *= 0.85 + 0.3 * Math.max(0, noiseVal); // 0.85× to 1.15× variation

      mask[i] = Math.max(0, Math.min(1, coverage));
    }

    return mask;
  }

  /**
   * Create a binary snow mask from the continuous mask.
   */
  computeBinary(normalMap: Float32Array, snowDepth: Float32Array, vertexCount: number): Uint8Array {
    const continuous = this.compute(normalMap, snowDepth, vertexCount);
    const binary = new Uint8Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      binary[i] = continuous[i] > 0.3 ? 1 : 0;
    }

    return binary;
  }

  /**
   * Smooth blend between snow and rock surfaces.
   * Returns a blend weight in [0, 1] for each vertex.
   */
  computeBlendWeights(
    normalMap: Float32Array,
    snowDepth: Float32Array,
    vertexCount: number,
  ): Float32Array {
    const mask = this.compute(normalMap, snowDepth, vertexCount);
    const blended = new Float32Array(vertexCount);

    const smoothness = this.params.maskSmoothness;

    for (let i = 0; i < vertexCount; i++) {
      // Apply smoothstep blending
      let w = mask[i];
      if (smoothness > 0) {
        // Higher smoothness = wider transition zone
        const threshold = 0.5 - smoothness * 0.3;
        const width = 0.2 + smoothness * 0.3;
        w = Math.max(0, Math.min(1, (w - threshold) / width));
        w = w * w * (3 - 2 * w); // smoothstep
      }
      blended[i] = w;
    }

    return blended;
  }
}

// ============================================================================
// Simulation Result Type
// ============================================================================

/**
 * Result of the snowfall simulation.
 */
export interface SimulateResult {
  /** Combined terrain + snow elevation heightmap */
  snowHeightMap: Float32Array;
  /** Per-vertex snow coverage mask [0, 1] */
  snowMask: Float32Array;
  /** Snow depth per cell (m) */
  snowDepthMap: Float32Array;
  /** Snow-water equivalent per cell (m) */
  sweMap: Float32Array;
  /** Snow density per cell (kg/m³) */
  densityMap: Float32Array;
  /** Flow accumulation from the last routing step */
  flowAccumulation: Float32Array;
}

// ============================================================================
// Main SnowSystem Class
// ============================================================================

/**
 * Physics-based snowfall simulation system.
 *
 * Integrates Landlab-equivalent flow routing and hillslope diffusion
 * with comprehensive snow accumulation physics. Designed to be used
 * as a drop-in replacement for the previous simplified snow system.
 *
 * Usage:
 * ```typescript
 * const snowSystem = new SnowSystem({ seed: 42, iterations: 24 });
 * const result = snowSystem.simulate(heightMap, normalMap, { width, height, cellSize });
 * // result.snowHeightMap — terrain elevation + snow depth
 * // result.snowMask — per-vertex snow coverage [0, 1]
 * // result.snowDepthMap — snow depth per cell
 * ```
 */
export class SnowSystem {
  private params: SnowParams;
  private width: number = 0;
  private height: number = 0;
  private initialized: boolean = false;

  // Subsystems
  private flowDirector!: FlowDirectorSteepest;
  private diffuser!: TransportLengthHillslopeDiffuser;
  private physics!: SnowAccumulationPhysics;
  private maskGenerator!: SnowMaskGenerator;

  // Noise sources
  private driftNoise: NoiseSource;

  // Cached results
  private snowDepthMap: Float32Array | null = null;
  private snowMask: Float32Array | null = null;

  // Snow overlay mesh & resources (for cleanup)
  private snowMesh: THREE.Mesh | null = null;
  private snowMaterial: THREE.MeshStandardMaterial | null = null;
  private snowPileMeshes: THREE.Mesh[] = [];

  constructor(params: Partial<SnowParams> = {}) {
    this.params = {
      baseSWEDepth: 0.05,
      maxDepth: 3.0,
      snowfallRate: 2.0,
      baseTemperature: -5,
      lapseRate: -6.5,
      degreeDayFactor: 3.0,
      snowThresholdTemp: 1.5,
      windStrength: 0.4,
      windDirection: new THREE.Vector3(1, 0, 0),
      saltationCoeff: 0.3,
      suspensionCoeff: 0.15,
      windShadowFactor: 0.5,
      enableAspectMelt: true,
      southFacingMeltMultiplier: 1.5,
      flowRoutingIterations: 3,
      pitFillTolerance: 0.01,
      diffusivity: 0.001,
      criticalSlope: Math.PI / 5, // ~36°
      diffusionSteps: 5,
      diffusionDt: 3600,
      enableCompaction: true,
      compactionRate: 1e-7,
      normalThreshold: 0.5,
      slideAngleMax: 60,
      slideAngleMin: 30,
      preferenceDirection: new THREE.Vector3(1, 0, 0),
      preferenceWeight: 0.3,
      maskMinDepth: 0.01,
      maskSmoothness: 0.5,
      color: new THREE.Color(0.95, 0.97, 1.0),
      roughness: 0.4,
      metalness: 0.0,
      sparkleIntensity: 0.3,
      translucency: 0.2,
      smoothingPasses: 3,
      minDepthForMesh: 0.01,
      enableDrifts: true,
      driftScale: 10,
      seed: 12345,
      timeStep: 3600,
      iterations: 24,
      ...params,
    };

    // Set preference direction to wind direction if not explicitly set
    if (!params.preferenceDirection) {
      this.params.preferenceDirection = this.params.windDirection.clone();
    }

    this.driftNoise = new PerlinNoiseSource(this.params.seed);
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  /**
   * Initialize the snow system with grid dimensions.
   *
   * Creates all subsystems (flow director, diffuser, physics, mask generator)
   * and allocates internal state arrays.
   *
   * @param width - Grid width (number of columns)
   * @param height - Grid height (number of rows)
   */
  initialize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    this.flowDirector = new FlowDirectorSteepest(width, height);
    this.diffuser = new TransportLengthHillslopeDiffuser(
      width, height,
      this.params.diffusivity,
      this.params.criticalSlope,
      this.params.diffusionDt,
    );
    this.physics = new SnowAccumulationPhysics(this.params);
    this.physics.initializeState(width * height);
    this.maskGenerator = new SnowMaskGenerator(this.params);

    this.snowDepthMap = new Float32Array(width * height);
    this.snowMask = null;
    this.initialized = true;
  }

  // ========================================================================
  // Main Simulation API
  // ========================================================================

  /**
   * Run the full physics-based snowfall simulation.
   *
   * This is the primary entry point for the snow system. It:
   * 1. Runs flow routing on the terrain
   * 2. Runs multiple iterations of snow physics
   * 3. Applies hillslope diffusion
   * 4. Generates the snow mask
   * 5. Returns all output maps
   *
   * @param heightMap - Terrain heightmap (Float32Array, row-major)
   * @param normalMap - Surface normal map (3 components per vertex, Float32Array)
   * @param options - Grid configuration
   * @param options.width - Grid width
   * @param options.height - Grid height
   * @param options.cellSize - Grid cell spacing in meters (default: 1)
   * @returns Simulation result with all output maps
   */
  simulate(
    heightMap: Float32Array,
    normalMap: Float32Array,
    options: { width: number; height: number; cellSize?: number },
  ): SimulateResult {
    const { width, height, cellSize = 1 } = options;

    if (!this.initialized || this.width !== width || this.height !== height) {
      this.initialize(width, height);
    }

    const size = width * height;

    // --- Step 1: Run flow routing on terrain ---
    let flowResult = this.flowDirector.route(heightMap, this.params.pitFillTolerance);

    // --- Step 2: Run multiple iterations of snow physics ---
    for (let iter = 0; iter < this.params.iterations; iter++) {
      // Update physics
      this.physics.step(
        width, height,
        heightMap, normalMap,
        flowResult, cellSize,
      );

      // Recompute combined elevation for diffusion and re-routing
      const combinedElev = this.physics.computeCombinedElevation(heightMap, size);

      // Run hillslope diffusion on the combined surface
      if (this.params.diffusionSteps > 0) {
        const snowDepthArr = this.physics.getSnowDepthMap(size);
        this.diffuser.runMultipleSteps(combinedElev, snowDepthArr, cellSize, this.params.diffusionSteps);
        // Sync snow depth back from diffuser changes
        this.syncDepthFromDiffuser(snowDepthArr, size);
      }

      // Re-run flow routing every few iterations with updated snow surface
      if (iter > 0 && iter % this.params.flowRoutingIterations === 0) {
        flowResult = this.flowDirector.route(combinedElev, this.params.pitFillTolerance);
      }
    }

    // --- Step 3: Extract output maps ---
    const snowDepthMap = this.physics.getSnowDepthMap(size);
    const sweMap = this.physics.getSWEDepthMap(size);
    const densityMap = this.physics.getDensityMap(size);

    // Compute combined snow heightmap (terrain + snow)
    const snowHeightMap = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      snowHeightMap[i] = heightMap[i] + snowDepthMap[i];
    }

    // Generate snow mask
    const snowMask = this.maskGenerator.compute(normalMap, snowDepthMap, size);

    // Cache results
    this.snowDepthMap = snowDepthMap;
    this.snowMask = snowMask;

    return {
      snowHeightMap,
      snowMask,
      snowDepthMap,
      sweMap,
      densityMap,
      flowAccumulation: flowResult.accumulation,
    };
  }

  /**
   * Run a single time step (backward-compatible with old API).
   *
   * @deprecated Use `simulate()` for full physics simulation
   */
  simulateStep(
    heightMap: Float32Array,
    normalMap: Float32Array,
    deltaTime: number,
  ): Float32Array {
    if (!this.initialized) {
      this.initialize(this.width || 256, this.height || 256);
    }

    const size = this.width * this.height;
    const flowResult = this.flowDirector.route(heightMap, this.params.pitFillTolerance);

    this.physics.step(this.width, this.height, heightMap, normalMap, flowResult, 1);

    const depthMap = this.physics.getSnowDepthMap(size);
    this.snowDepthMap = depthMap;
    return depthMap;
  }

  /**
   * Sync snow depth back from the diffuser-modified array.
   * Updates the physics state to match depth changes from diffusion.
   */
  private syncDepthFromDiffuser(diffuserDepth: Float32Array, size: number): void {
    const state = this.physics.getState();
    for (let i = 0; i < size; i++) {
      if (diffuserDepth[i] !== state[i].depth) {
        // Update depth; adjust SWE to maintain mass balance with current density
        state[i].depth = diffuserDepth[i];
        if (state[i].depth > 0) {
          state[i].swe = state[i].depth * (state[i].density / WATER_DENSITY);
        } else {
          state[i].depth = 0;
          state[i].swe = 0;
        }
      }
    }
  }

  // ========================================================================
  // Snow Mask API
  // ========================================================================

  /**
   * Compute a per-vertex snow coverage mask based on surface normals,
   * wind shadow, slope, and snow depth.
   *
   * @param normals - Vertex normals (3 components per vertex)
   * @param slopeThreshold - Normal Y threshold (default from params)
   * @returns Float32Array with one value per vertex in [0, 1]
   */
  computeSnowMask(
    normals: Float32Array,
    slopeThreshold: number = this.params.normalThreshold,
  ): Float32Array {
    const vertexCount = normals.length / 3;
    const snowDepth = this.snowDepthMap ?? new Float32Array(vertexCount);
    return this.maskGenerator.compute(normals, snowDepth, vertexCount);
  }

  /**
   * Compute blend weights between snow and rock surfaces.
   */
  computeBlendWeights(normals: Float32Array, snowDepth: Float32Array): Float32Array {
    const vertexCount = normals.length / 3;
    return this.maskGenerator.computeBlendWeights(normals, snowDepth, vertexCount);
  }

  /**
   * Compute binary snow mask.
   */
  computeBinaryMask(normals: Float32Array, snowDepth: Float32Array): Uint8Array {
    const vertexCount = normals.length / 3;
    return this.maskGenerator.computeBinary(normals, snowDepth, vertexCount);
  }

  // ========================================================================
  // Snow Mesh Generation (retained from original, enhanced)
  // ========================================================================

  /**
   * Creates a PBR snow material with sparkle and SSS approximation.
   */
  createSnowMaterial(): THREE.MeshStandardMaterial {
    if (this.snowMaterial) {
      return this.snowMaterial;
    }

    const material = new THREE.MeshStandardMaterial({
      color: this.params.color,
      roughness: this.params.roughness,
      metalness: this.params.metalness,
      side: THREE.DoubleSide,
    });

    // Sparkle effect via onBeforeCompile shader injection
    if (this.params.sparkleIntensity > 0) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uSparkleIntensity = { value: this.params.sparkleIntensity };
        shader.uniforms.uTime = { value: 0.0 };

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
          uniform float uSparkleIntensity;
          uniform float uTime;

          float sparkleHash(vec3 p) {
            p = fract(p * vec3(443.8975, 397.2973, 491.1871));
            p += dot(p, p.yxz + 19.19);
            return fract((p.x + p.y) * p.z);
          }

          float sparkleNoise(vec3 p) {
            vec3 ip = floor(p);
            vec3 fp = fract(p);
            float sparkle = 0.0;
            for (int z = -1; z <= 1; z++) {
              for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                  vec3 offset = vec3(float(x), float(y), float(z));
                  float h = sparkleHash(ip + offset);
                  vec3 fpOffset = fp - offset - vec3(h, h * 0.7, h * 0.3);
                  float d = dot(fpOffset, fpOffset);
                  sparkle += smoothstep(0.02, 0.0, d) * h;
                }
              }
            }
            return sparkle;
          }`,
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          vec3 snowNormal = normalize(vNormal);
          float viewDot = max(dot(normalize(-vViewPosition), snowNormal), 0.0);
          float sparkle = sparkleNoise(vViewPosition * 80.0 + vec3(0.0, uTime * 0.1, 0.0));
          sparkle *= viewDot;
          gl_FragColor.rgb += vec3(sparkle * uSparkleIntensity * 2.0);`,
        );
      };
    }

    // SSS translucency approximation
    if (this.params.translucency > 0) {
      const sssColor = new THREE.Color(0.3, 0.5, 0.8);
      material.emissive.copy(material.emissive.clone().lerp(sssColor, this.params.translucency * 0.3));
      material.emissiveIntensity = this.params.translucency * 0.15;
    }

    this.snowMaterial = material;
    return material;
  }

  /**
   * Generate a snow overlay mesh that sits on top of the terrain.
   *
   * Creates a displaced copy of the terrain geometry, filtered to only
   * include faces with sufficient snow coverage.
   */
  generateSnowMesh(
    terrainGeometry: THREE.BufferGeometry,
    terrainNormals: Float32Array,
  ): THREE.Mesh | null {
    const positions = terrainGeometry.attributes.position.array as Float32Array;
    const index = terrainGeometry.index;
    const vertexCount = positions.length / 3;

    // Compute snow mask from normals and depth
    const snowDepth = this.snowDepthMap ?? new Float32Array(vertexCount).fill(this.params.baseSWEDepth);
    const snowMask = this.maskGenerator.compute(terrainNormals, snowDepth, vertexCount);

    // Create displaced positions
    const snowPositions = new Float32Array(positions.length);
    for (let i = 0; i < vertexCount; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      const mask = snowMask[i];
      const depth = snowDepth[i] * mask;

      // Displace along surface normal
      const nx = terrainNormals[i * 3];
      const ny = terrainNormals[i * 3 + 1];
      const nz = terrainNormals[i * 3 + 2];

      snowPositions[i * 3] = px + nx * depth;
      snowPositions[i * 3 + 1] = py + ny * depth;
      snowPositions[i * 3 + 2] = pz + nz * depth;
    }

    // Smooth the snow surface
    this.smoothSnowPositions(snowPositions, snowMask, terrainGeometry, this.params.smoothingPasses);

    // Filter triangles
    const filteredIndex = this.filterSnowTriangles(terrainGeometry, snowMask, index);
    if (filteredIndex.length === 0) return null;

    // Build geometry
    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    snowGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(terrainNormals), 3));
    snowGeometry.setIndex(filteredIndex);
    snowGeometry.computeVertexNormals();

    // Snow depth attribute for material
    const depthAttr = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      depthAttr[i] = snowDepth[i] * snowMask[i];
    }
    snowGeometry.setAttribute('aSnowDepth', new THREE.BufferAttribute(depthAttr, 1));

    const material = this.createSnowMaterial();
    const mesh = new THREE.Mesh(snowGeometry, material);
    mesh.name = 'snow_overlay';

    this.snowMesh = mesh;
    return mesh;
  }

  /**
   * Smooth snow positions by averaging with connected neighbors.
   */
  private smoothSnowPositions(
    positions: Float32Array,
    snowMask: Float32Array,
    geometry: THREE.BufferGeometry,
    passes: number,
  ): void {
    if (passes <= 0) return;

    const index = geometry.index;
    const vertexCount = positions.length / 3;

    // Build adjacency
    const adjacency = new Map<number, Set<number>>();
    const processEdge = (a: number, b: number): void => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    };

    if (index) {
      const idxArr = index.array;
      for (let i = 0; i < idxArr.length; i += 3) {
        processEdge(idxArr[i], idxArr[i + 1]);
        processEdge(idxArr[i + 1], idxArr[i + 2]);
        processEdge(idxArr[i + 2], idxArr[i]);
      }
    } else {
      for (let i = 0; i < vertexCount; i += 3) {
        processEdge(i, i + 1);
        processEdge(i + 1, i + 2);
        processEdge(i + 2, i);
      }
    }

    for (let pass = 0; pass < passes; pass++) {
      const smoothed = new Float32Array(positions.length);

      for (let v = 0; v < vertexCount; v++) {
        if (snowMask[v] < 0.01) {
          smoothed[v * 3] = positions[v * 3];
          smoothed[v * 3 + 1] = positions[v * 3 + 1];
          smoothed[v * 3 + 2] = positions[v * 3 + 2];
          continue;
        }

        const neighbors = adjacency.get(v);
        if (!neighbors || neighbors.size === 0) {
          smoothed[v * 3] = positions[v * 3];
          smoothed[v * 3 + 1] = positions[v * 3 + 1];
          smoothed[v * 3 + 2] = positions[v * 3 + 2];
          continue;
        }

        let sx = 0, sy = 0, sz = 0, count = 0;
        for (const n of neighbors) {
          if (snowMask[n] >= 0.01) {
            sx += positions[n * 3];
            sy += positions[n * 3 + 1];
            sz += positions[n * 3 + 2];
            count++;
          }
        }

        if (count > 0) {
          const alpha = 0.3;
          smoothed[v * 3] = positions[v * 3] * (1 - alpha) + (sx / count) * alpha;
          smoothed[v * 3 + 1] = positions[v * 3 + 1] * (1 - alpha) + (sy / count) * alpha;
          smoothed[v * 3 + 2] = positions[v * 3 + 2] * (1 - alpha) + (sz / count) * alpha;
        } else {
          smoothed[v * 3] = positions[v * 3];
          smoothed[v * 3 + 1] = positions[v * 3 + 1];
          smoothed[v * 3 + 2] = positions[v * 3 + 2];
        }
      }

      positions.set(smoothed);
    }
  }

  /**
   * Filter triangles: only keep faces with sufficient snow coverage.
   */
  private filterSnowTriangles(
    geometry: THREE.BufferGeometry,
    snowMask: Float32Array,
    index: THREE.BufferAttribute | null,
  ): number[] {
    const filtered: number[] = [];
    const minDepth = this.params.minDepthForMesh;

    if (index) {
      const idxArr = index.array;
      for (let i = 0; i < idxArr.length; i += 3) {
        const a = idxArr[i], b = idxArr[i + 1], c = idxArr[i + 2];
        if (snowMask[a] >= minDepth && snowMask[b] >= minDepth && snowMask[c] >= minDepth) {
          filtered.push(a, b, c);
        }
      }
    } else {
      const vertexCount = geometry.attributes.position.count;
      for (let i = 0; i < vertexCount; i += 3) {
        if (snowMask[i] >= minDepth && snowMask[i + 1] >= minDepth && snowMask[i + 2] >= minDepth) {
          filtered.push(i, i + 1, i + 2);
        }
      }
    }

    return filtered;
  }

  /**
   * Generate snow pile meshes at slope bases.
   */
  generateSnowPiles(
    terrainGeometry: THREE.BufferGeometry,
    positions?: THREE.Vector3[],
  ): THREE.Mesh[] {
    this.disposeSnowPiles();

    const pileMeshes: THREE.Mesh[] = [];
    const material = this.createSnowMaterial();
    const pilePositions = positions ?? this.detectPilePositions(terrainGeometry);

    for (const pos of pilePositions) {
      let depth = this.params.baseSWEDepth;
      if (this.snowDepthMap && this.width > 0 && this.height > 0) {
        depth = this.sampleDepthBilinear(pos.x, pos.z);
      }
      depth = Math.max(depth, this.params.baseSWEDepth);

      const radius = depth * 0.5 + 0.1;
      const pileGeo = new THREE.SphereGeometry(radius, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);

      const pilePosAttr = pileGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < pilePosAttr.length; i += 3) {
        const px = pilePosAttr[i];
        const py = pilePosAttr[i + 1];
        const pz = pilePosAttr[i + 2];
        const noise = this.driftNoise.sample3D(px * 5 + pos.x, py * 5, pz * 5 + pos.z);
        const distortion = 1 + noise * 0.15;
        pilePosAttr[i] = px * distortion;
        pilePosAttr[i + 1] = py * (1 + noise * 0.1);
        pilePosAttr[i + 2] = pz * distortion;
      }
      pileGeo.attributes.position.needsUpdate = true;
      pileGeo.computeVertexNormals();

      const pileMesh = new THREE.Mesh(pileGeo, material);
      pileMesh.position.copy(pos);
      pileMesh.name = 'snow_pile';
      pileMeshes.push(pileMesh);
    }

    this.snowPileMeshes = pileMeshes;
    return pileMeshes;
  }

  /**
   * Auto-detect positions at slope bases where snow piles form.
   */
  private detectPilePositions(terrainGeometry: THREE.BufferGeometry): THREE.Vector3[] {
    const positions = terrainGeometry.attributes.position.array as Float32Array;
    const normals = terrainGeometry.attributes.normal
      ? (terrainGeometry.attributes.normal.array as Float32Array)
      : null;
    const index = terrainGeometry.index;

    if (!normals || !index) return [];

    const pilePositions: THREE.Vector3[] = [];
    const idxArr = index.array;
    const visited = new Set<string>();

    for (let i = 0; i < idxArr.length; i += 3) {
      for (const vIdx of [idxArr[i], idxArr[i + 1], idxArr[i + 2]]) {
        const ny = normals[vIdx * 3 + 1];
        const px = positions[vIdx * 3];
        const py = positions[vIdx * 3 + 1];
        const pz = positions[vIdx * 3 + 2];

        const key = `${px.toFixed(1)},${pz.toFixed(1)}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (ny > 0.7 && this.snowDepthMap && this.width > 0 && this.height > 0) {
          const depth = this.sampleDepthBilinear(px, pz);
          if (depth > this.params.baseSWEDepth * 1.5) {
            pilePositions.push(new THREE.Vector3(px, py, pz));
          }
        }
      }
    }

    if (pilePositions.length > 50) {
      const step = Math.ceil(pilePositions.length / 50);
      return pilePositions.filter((_, i) => i % step === 0);
    }

    return pilePositions;
  }

  /**
   * Apply snow overlay to an existing terrain mesh.
   */
  applyToTerrainMesh(mesh: THREE.Mesh): THREE.Mesh | null {
    const geometry = mesh.geometry;
    const normals = geometry.attributes.normal
      ? (geometry.attributes.normal.array as Float32Array)
      : null;

    if (!normals) {
      geometry.computeVertexNormals();
      const computedNormals = geometry.attributes.normal;
      if (!computedNormals) return null;
      return this.generateSnowMesh(geometry, computedNormals.array as Float32Array);
    }

    const snowOverlay = this.generateSnowMesh(geometry, normals);

    if (snowOverlay) {
      snowOverlay.position.copy(mesh.position);
      snowOverlay.rotation.copy(mesh.rotation);
      snowOverlay.scale.copy(mesh.scale);

      const piles = this.generateSnowPiles(geometry);
      for (const pile of piles) {
        pile.position.applyMatrix4(mesh.matrixWorld);
      }
    }

    return snowOverlay;
  }

  /**
   * Apply snow to geometry by displacing vertices.
   */
  applyToGeometry(
    geometry: THREE.BufferGeometry,
    heightMap: Float32Array,
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const newPositions = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 2];
      const z = positions[i + 1];

      let snowDepth = this.params.baseSWEDepth;
      if (this.snowDepthMap && this.width > 0 && this.height > 0) {
        snowDepth = this.sampleDepthBilinear(x, y);
      }

      newPositions[i] = x;
      newPositions[i + 1] = z + snowDepth;
      newPositions[i + 2] = y;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  // ========================================================================
  // TwoPhaseTerrainPipeline Integration
  // ========================================================================

  /**
   * Generate snow data for integration with TwoPhaseTerrainPipeline.
   *
   * Accepts a heightmap + normal map and produces:
   * - Snow heightmap (terrain + snow depth)
   * - Snow mask (per-vertex coverage)
   * - Snow depth map
   *
   * @param heightMap - Terrain heightmap (Float32Array, row-major)
   * @param normalMap - Surface normal map (3 components per vertex)
   * @param width - Grid width
   * @param height - Grid height
   * @param cellSize - Grid cell spacing in meters (default: 1)
   * @returns Object with snowHeightMap, snowMask, snowDepthMap
   */
  generateForPipeline(
    heightMap: Float32Array,
    normalMap: Float32Array,
    width: number,
    height: number,
    cellSize: number = 1,
  ): {
    snowHeightMap: Float32Array;
    snowMask: Float32Array;
    snowDepthMap: Float32Array;
  } {
    const result = this.simulate(heightMap, normalMap, { width, height, cellSize });
    return {
      snowHeightMap: result.snowHeightMap,
      snowMask: result.snowMask,
      snowDepthMap: result.snowDepthMap,
    };
  }

  // ========================================================================
  // Accessors
  // ========================================================================

  /** Get snow depth at a specific grid position */
  getDepth(x: number, y: number): number {
    if (!this.snowDepthMap || x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return this.params.baseSWEDepth;
    }
    return this.snowDepthMap[y * this.width + x];
  }

  /** Get the current snow depth map */
  getDepthMap(): Float32Array | null {
    return this.snowDepthMap;
  }

  /** Get the current snow mask */
  getMask(): Float32Array | null {
    return this.snowMask;
  }

  /** Get the snow overlay mesh */
  getSnowMesh(): THREE.Mesh | null {
    return this.snowMesh;
  }

  /** Get snow pile meshes */
  getSnowPileMeshes(): THREE.Mesh[] {
    return this.snowPileMeshes;
  }

  /** Get the snow material */
  getSnowMaterial(): THREE.MeshStandardMaterial | null {
    return this.snowMaterial;
  }

  /** Update parameters */
  setParams(params: Partial<SnowParams>): void {
    this.params = { ...this.params, ...params };

    // Reinitialize subsystems if critical params changed
    if (this.initialized) {
      this.diffuser = new TransportLengthHillslopeDiffuser(
        this.width, this.height,
        this.params.diffusivity,
        this.params.criticalSlope,
        this.params.diffusionDt,
      );
      this.maskGenerator = new SnowMaskGenerator(this.params);
    }
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  dispose(): void {
    this.disposeSnowMesh();
    this.disposeSnowPiles();
    this.disposeSnowMaterial();
    this.snowDepthMap = null;
    this.snowMask = null;
    this.initialized = false;
  }

  private disposeSnowMesh(): void {
    if (this.snowMesh) {
      this.snowMesh.geometry.dispose();
      this.snowMesh = null;
    }
  }

  private disposeSnowPiles(): void {
    for (const pile of this.snowPileMeshes) {
      pile.geometry.dispose();
    }
    this.snowPileMeshes = [];
  }

  private disposeSnowMaterial(): void {
    if (this.snowMaterial) {
      this.snowMaterial.dispose();
      this.snowMaterial = null;
    }
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  /**
   * Sample snow depth using bilinear interpolation.
   */
  private sampleDepthBilinear(x: number, y: number): number {
    if (!this.snowDepthMap || this.width <= 0 || this.height <= 0) {
      return this.params.baseSWEDepth;
    }

    if (x < 0 || x >= this.width - 1 || y < 0 || y >= this.height - 1) {
      const mapX = Math.min(Math.max(Math.round(x), 0), this.width - 1);
      const mapY = Math.min(Math.max(Math.round(y), 0), this.height - 1);
      return this.snowDepthMap[mapY * this.width + mapX];
    }

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;

    const v00 = this.snowDepthMap[y0 * this.width + x0];
    const v10 = this.snowDepthMap[y0 * this.width + (x0 + 1)];
    const v01 = this.snowDepthMap[(y0 + 1) * this.width + x0];
    const v11 = this.snowDepthMap[(y0 + 1) * this.width + (x0 + 1)];

    const top = v00 * (1 - fx) + v10 * fx;
    const bottom = v01 * (1 - fx) + v11 * fx;
    return top * (1 - fy) + bottom * fy;
  }
}

export default SnowSystem;
