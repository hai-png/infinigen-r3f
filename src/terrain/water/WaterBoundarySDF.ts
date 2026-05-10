/**
 * WaterBoundarySDF — Enhanced Waterbody Boundary Signed Distance Field
 *
 * Computes a 2D signed distance field at the water plane height that
 * represents the shoreline boundary. Positive values = land, negative
 * values = water. The boundary SDF is used for:
 * - Shoreline extraction (the coastline as a 3D polyline)
 * - Beach zone computation (distance inland from shoreline)
 * - Smooth terrain transitions at water boundaries
 * - Asset placement constraints (e.g., boats only where SDF < 0)
 *
 * The implementation evaluates the terrain SDF at the water plane height
 * to find where terrain crosses zero, then computes a 2D distance field
 * using a fast sweeping method (FSM) for efficient shoreline distance
 * queries.
 *
 * @module terrain/water
 */

import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the water boundary SDF computation.
 */
export interface WaterBoundarySDFConfig {
  /** RNG seed for reproducibility (default 42) */
  seed: number;
  /** Beach zone width in world units (default 5.0) */
  beachWidth: number;
  /** Beach slope smoothness factor (default 0.5) */
  beachSmoothness: number;
  /** Shoreline simplification tolerance in world units (default 0.5) */
  shorelineSimplification: number;
  /** Number of FSM iterations (default 2) */
  fsmIterations: number;
  /** Whether to apply noise perturbation to the boundary (default true) */
  boundaryNoise: boolean;
  /** Boundary noise frequency (default 0.02) */
  boundaryNoiseFrequency: number;
  /** Boundary noise amplitude (default 1.0) */
  boundaryNoiseAmplitude: number;
}

/**
 * Result of the boundary SDF computation containing all derived data.
 */
export interface BoundarySDFResult {
  /** 2D grid of boundary SDF values (positive = land, negative = water) */
  boundarySDF: Float32Array;
  /** Grid resolution (width = height = resolution) */
  resolution: number;
  /** World-space bounds that were sampled */
  bounds: { min: [number, number]; max: [number, number] };
  /** Cell size in world units */
  cellSize: number;
  /** Water height used for the computation */
  waterHeight: number;
}

// ============================================================================
// WaterBoundarySDF
// ============================================================================

export class WaterBoundarySDF {
  private config: WaterBoundarySDFConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;
  private cachedResult: BoundarySDFResult | null = null;
  private beachZone: Float32Array | null = null;

  constructor(config: Partial<WaterBoundarySDFConfig> = {}) {
    this.config = {
      seed: 42,
      beachWidth: 5.0,
      beachSmoothness: 0.5,
      shorelineSimplification: 0.5,
      fsmIterations: 2,
      boundaryNoise: true,
      boundaryNoiseFrequency: 0.02,
      boundaryNoiseAmplitude: 1.0,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
  }

  // ------------------------------------------------------------------
  // Core Computation
  // ------------------------------------------------------------------

  /**
   * Compute the boundary SDF at water level.
   *
   * Evaluates the terrain SDF at the water plane height to find where
   * the terrain surface intersects the water plane (shoreline). Then
   * computes a 2D distance field using the fast sweeping method.
   *
   * @param terrainSDF - Function that returns SDF value at (x, y, z)
   * @param waterHeight - The Y-coordinate of the water surface
   * @param bounds - 2D world-space bounds { min: [x, z], max: [x, z] }
   * @param resolution - Grid resolution (cells per side)
   * @returns Float32Array of size resolution*resolution with boundary distances
   */
  computeBoundarySDF(
    terrainSDF: (x: number, y: number, z: number) => number,
    waterHeight: number,
    bounds: { min: [number, number]; max: [number, number] },
    resolution: number,
  ): Float32Array {
    if (resolution < 2) {
      throw new Error('Resolution must be at least 2');
    }

    const cellSizeX = (bounds.max[0] - bounds.min[0]) / (resolution - 1);
    const cellSizeZ = (bounds.max[1] - bounds.min[1]) / (resolution - 1);
    const cellSize = Math.max(cellSizeX, cellSizeZ);

    // Reset RNG for reproducibility
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);

    // Step 1: Evaluate terrain SDF at water height to get binary classification
    const classification = new Float32Array(resolution * resolution);
    const rawSDF = new Float32Array(resolution * resolution);

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const x = bounds.min[0] + col * cellSizeX;
        const z = bounds.min[1] + row * cellSizeZ;

        // Evaluate terrain SDF at the water plane height
        let sdfValue = terrainSDF(x, waterHeight, z);

        // Apply boundary noise perturbation for natural shorelines
        if (this.config.boundaryNoise) {
          const noiseOffset = this.noise.perlin2D(
            x * this.config.boundaryNoiseFrequency,
            z * this.config.boundaryNoiseFrequency,
          ) * this.config.boundaryNoiseAmplitude;
          sdfValue += noiseOffset;
        }

        const idx = row * resolution + col;
        rawSDF[idx] = sdfValue;
        // Positive = land (terrain above water), negative = water (terrain below water)
        classification[idx] = sdfValue;
      }
    }

    // Step 2: Compute 2D distance field using Fast Sweeping Method (FSM)
    const distField = this.computeFastSweepingSDF(classification, resolution, cellSize);

    // Step 3: Sign the distance field based on classification
    // Land (SDF > 0 at water height) → positive distance
    // Water (SDF < 0 at water height) → negative distance
    const boundarySDF = new Float32Array(resolution * resolution);
    for (let i = 0; i < resolution * resolution; i++) {
      boundarySDF[i] = rawSDF[i] >= 0 ? distField[i] : -distField[i];
    }

    // Cache the result
    this.cachedResult = {
      boundarySDF,
      resolution,
      bounds,
      cellSize,
      waterHeight,
    };
    this.beachZone = null; // Invalidate cached beach zone

    return boundarySDF;
  }

  // ------------------------------------------------------------------
  // Fast Sweeping Method (FSM)
  // ------------------------------------------------------------------

  /**
   * Compute unsigned distance field using the Fast Sweeping Method.
   *
   * FSM solves the Eikonal equation |∇u| = 1 by sweeping the grid
   * in 4 (2D) alternating directions. It converges to the exact
   * distance field for convex domains in O(N) time.
   *
   * @param classification - Raw SDF values at water height
   * @param resolution - Grid size
   * @param cellSize - Grid cell size in world units
   * @returns Unsigned distance field
   */
  private computeFastSweepingSDF(
    classification: Float32Array,
    resolution: number,
    cellSize: number,
  ): Float32Array {
    const N = resolution;
    const total = N * N;

    // Initialize distance field
    const dist = new Float32Array(total);
    const frozen = new Uint8Array(total); // 1 = known (boundary cell)

    // Initialize: boundary cells (where sign changes) get distance 0
    // Interior cells get large distance
    const INF = 1e20;

    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const idx = row * N + col;
        const val = classification[idx];

        // Check if this cell is adjacent to a sign change (shoreline)
        let isBoundary = false;

        // Check 4-connected neighbors
        const neighbors = [
          [row - 1, col],
          [row + 1, col],
          [row, col - 1],
          [row, col + 1],
        ];

        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          const nIdx = nr * N + nc;
          // Sign change between this cell and neighbor = shoreline
          if ((classification[nIdx] >= 0) !== (val >= 0)) {
            isBoundary = true;
            break;
          }
        }

        if (isBoundary) {
          // Approximate distance for boundary cells using linear interpolation
          dist[idx] = this.approximateBoundaryDistance(
            classification, N, row, col, cellSize,
          );
          frozen[idx] = 1;
        } else {
          dist[idx] = INF;
        }
      }
    }

    // Sweep in 4 directions
    const iterations = this.config.fsmIterations;
    for (let iter = 0; iter < iterations; iter++) {
      // Sweep 1: top-left to bottom-right
      for (let row = 0; row < N; row++) {
        for (let col = 0; col < N; col++) {
          this.sweepUpdate(dist, N, row, col, cellSize);
        }
      }
      // Sweep 2: top-right to bottom-left
      for (let row = 0; row < N; row++) {
        for (let col = N - 1; col >= 0; col--) {
          this.sweepUpdate(dist, N, row, col, cellSize);
        }
      }
      // Sweep 3: bottom-left to top-right
      for (let row = N - 1; row >= 0; row--) {
        for (let col = 0; col < N; col++) {
          this.sweepUpdate(dist, N, row, col, cellSize);
        }
      }
      // Sweep 4: bottom-right to top-left
      for (let row = N - 1; row >= 0; row--) {
        for (let col = N - 1; col >= 0; col--) {
          this.sweepUpdate(dist, N, row, col, cellSize);
        }
      }
    }

    return dist;
  }

  /**
   * Approximate the distance of a boundary cell to the actual zero crossing.
   * Uses linear interpolation between the cell and its neighbors.
   */
  private approximateBoundaryDistance(
    classification: Float32Array,
    N: number,
    row: number,
    col: number,
    cellSize: number,
  ): number {
    const idx = row * N + col;
    const val = classification[idx];
    let minDist = cellSize; // Default: half a cell

    // Check 4-connected neighbors for closest sign change
    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];

    for (const [nr, nc] of neighbors) {
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const nIdx = nr * N + nc;
      const nVal = classification[nIdx];

      // If signs differ, compute interpolated crossing distance
      if ((val >= 0) !== (nVal >= 0) && Math.abs(val - nVal) > 1e-10) {
        const t = Math.abs(val) / Math.abs(val - nVal);
        const crossingDist = t * cellSize;
        minDist = Math.min(minDist, crossingDist);
      }
    }

    return minDist;
  }

  /**
   * Update a single cell's distance using the Eikonal equation solver.
   *
   * For each cell, we solve: (u - u_min_x)² + (u - u_min_z)² = h²
   * where u_min_x and u_min_z are the minimum distances from the
   * left/right and top/bottom neighbors respectively.
   */
  private sweepUpdate(
    dist: Float32Array,
    N: number,
    row: number,
    col: number,
    cellSize: number,
  ): void {
    const h = cellSize;
    const idx = row * N + col;

    // Get minimum distance from horizontal neighbors
    let ux = Infinity;
    if (col > 0) ux = Math.min(ux, dist[idx - 1]);
    if (col < N - 1) ux = Math.min(ux, dist[idx + 1]);

    // Get minimum distance from vertical neighbors
    let uz = Infinity;
    if (row > 0) uz = Math.min(uz, dist[idx - N]);
    if (row < N - 1) uz = Math.min(uz, dist[idx + N]);

    // Solve the Eikonal equation
    let newDist: number;

    if (Math.abs(ux - uz) < h) {
      // Both dimensions contribute: solve quadratic
      // (u - ux)² + (u - uz)² = h²
      // 2u² - 2(ux+uz)u + ux² + uz² - h² = 0
      const sum = ux + uz;
      const diff = ux - uz;
      const discriminant = 2 * h * h - diff * diff;

      if (discriminant >= 0) {
        newDist = (sum + Math.sqrt(discriminant)) / 2;
      } else {
        // Fallback: use minimum of one-dimensional solutions
        newDist = Math.min(ux + h, uz + h);
      }
    } else {
      // One dimension dominates
      newDist = Math.min(ux + h, uz + h);
    }

    // Update only if new distance is smaller
    if (newDist < dist[idx]) {
      dist[idx] = newDist;
    }
  }

  // ------------------------------------------------------------------
  // Sampling
  // ------------------------------------------------------------------

  /**
   * Sample the boundary SDF at a specific 2D point.
   *
   * Uses bilinear interpolation on the cached grid for smooth results.
   *
   * @param x - World X coordinate
   * @param y - World Z coordinate (called y for 2D convention)
   * @returns Signed distance to shoreline (positive = land, negative = water)
   * @throws Error if computeBoundarySDF has not been called yet
   */
  sample(x: number, y: number): number {
    if (!this.cachedResult) {
      throw new Error('Must call computeBoundarySDF before sampling');
    }

    const { boundarySDF, resolution, bounds, cellSize } = this.cachedResult;

    // Convert world coordinates to grid coordinates
    const gridX = (x - bounds.min[0]) / cellSize;
    const gridY = (y - bounds.min[1]) / cellSize;

    // Clamp to grid bounds
    const clampedX = Math.max(0, Math.min(resolution - 1.001, gridX));
    const clampedY = Math.max(0, Math.min(resolution - 1.001, gridY));

    // Bilinear interpolation
    const x0 = Math.floor(clampedX);
    const y0 = Math.floor(clampedY);
    const x1 = Math.min(x0 + 1, resolution - 1);
    const y1 = Math.min(y0 + 1, resolution - 1);

    const fx = clampedX - x0;
    const fy = clampedY - y0;

    const v00 = boundarySDF[y0 * resolution + x0];
    const v10 = boundarySDF[y0 * resolution + x1];
    const v01 = boundarySDF[y1 * resolution + x0];
    const v11 = boundarySDF[y1 * resolution + x1];

    // Bilinear blend
    const top = v00 * (1 - fx) + v10 * fx;
    const bottom = v01 * (1 - fx) + v11 * fx;
    return top * (1 - fy) + bottom * fy;
  }

  // ------------------------------------------------------------------
  // Shoreline Extraction
  // ------------------------------------------------------------------

  /**
   * Extract the shoreline as a 3D polyline.
   *
   * Marches along the zero-crossing of the boundary SDF to produce
   * a connected set of 3D points representing the coastline.
   *
   * @param threshold - SDF threshold for shoreline detection (default 0.5 * cellSize)
   * @returns Array of [x, y, z] world-space shoreline points
   * @throws Error if computeBoundarySDF has not been called yet
   */
  extractShoreline(threshold?: number): [number, number, number][] {
    if (!this.cachedResult) {
      throw new Error('Must call computeBoundarySDF before extracting shoreline');
    }

    const { boundarySDF, resolution, bounds, cellSize, waterHeight } = this.cachedResult;
    const effectiveThreshold = threshold ?? cellSize * 0.5;

    // Step 1: Find all boundary cells (where |SDF| < threshold)
    const boundaryCells = new Uint8Array(resolution * resolution);
    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const idx = row * resolution + col;
        if (Math.abs(boundarySDF[idx]) < effectiveThreshold) {
          boundaryCells[idx] = 1;
        }
      }
    }

    // Step 2: Trace connected shoreline segments using marching contours
    const visited = new Uint8Array(resolution * resolution);
    const shorelinePoints: [number, number, number][] = [];

    for (let row = 1; row < resolution - 1; row++) {
      for (let col = 1; col < resolution - 1; col++) {
        const idx = row * resolution + col;
        if (!boundaryCells[idx] || visited[idx]) continue;

        // Trace this shoreline segment
        const segment = this.traceShorelineSegment(
          boundaryCells, boundarySDF, visited,
          resolution, row, col, bounds, cellSize, waterHeight,
        );
        shorelinePoints.push(...segment);
      }
    }

    // Step 3: Simplify the shoreline (remove redundant collinear points)
    return this.simplifyPolyline(shorelinePoints, this.config.shorelineSimplification);
  }

  /**
   * Trace a single connected shoreline segment by following boundary cells.
   */
  private traceShorelineSegment(
    boundaryCells: Uint8Array,
    boundarySDF: Float32Array,
    visited: Uint8Array,
    N: number,
    startRow: number,
    startCol: number,
    bounds: { min: [number, number]; max: [number, number] },
    cellSize: number,
    waterHeight: number,
  ): [number, number, number][] {
    const points: [number, number, number][] = [];
    const stack: [number, number][] = [[startRow, startCol]];

    // 8-connected neighbors for tracing
    const dirs = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1],
    ];

    while (stack.length > 0) {
      const [row, col] = stack.pop()!;
      const idx = row * N + col;

      if (visited[idx]) continue;
      if (!boundaryCells[idx]) continue;
      visited[idx] = 1;

      // Compute world position with sub-cell interpolation
      // Use SDF gradient to refine the shoreline position
      const x = bounds.min[0] + col * cellSize;
      const z = bounds.min[1] + row * cellSize;

      // Refine position using SDF gradient (move toward SDF = 0)
      const gradX = this.computeSDFGradient(boundarySDF, N, row, col, 'x') * cellSize;
      const gradZ = this.computeSDFGradient(boundarySDF, N, row, col, 'z') * cellSize;
      const sdfVal = boundarySDF[idx];

      // Move point toward the zero crossing
      const gradMag = Math.sqrt(gradX * gradX + gradZ * gradZ);
      let refinedX = x;
      let refinedZ = z;

      if (gradMag > 1e-6) {
        const step = -sdfVal / gradMag;
        refinedX = x + (gradX / gradMag) * step;
        refinedZ = z + (gradZ / gradMag) * step;
      }

      points.push([refinedX, waterHeight, refinedZ]);

      // Add unvisited boundary neighbors to the stack
      for (const [dr, dc] of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
        if (!visited[nr * N + nc] && boundaryCells[nr * N + nc]) {
          stack.push([nr, nc]);
        }
      }
    }

    return points;
  }

  /**
   * Compute the gradient of the boundary SDF at a grid cell.
   */
  private computeSDFGradient(
    boundarySDF: Float32Array,
    N: number,
    row: number,
    col: number,
    axis: 'x' | 'z',
  ): number {
    const idx = row * N + col;

    if (axis === 'x') {
      const left = col > 0 ? boundarySDF[idx - 1] : boundarySDF[idx];
      const right = col < N - 1 ? boundarySDF[idx + 1] : boundarySDF[idx];
      return (right - left) * 0.5;
    } else {
      const up = row > 0 ? boundarySDF[idx - N] : boundarySDF[idx];
      const down = row < N - 1 ? boundarySDF[idx + N] : boundarySDF[idx];
      return (down - up) * 0.5;
    }
  }

  /**
   * Simplify a polyline using the Ramer-Douglas-Peucker algorithm.
   */
  private simplifyPolyline(
    points: [number, number, number][],
    tolerance: number,
  ): [number, number, number][] {
    if (points.length <= 2) return points;

    // Find the point with maximum distance from the line segment
    // connecting the first and last points
    const first = points[0];
    const last = points[points.length - 1];
    let maxDist = 0;
    let maxIdx = 0;

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.pointToLineDistance(points[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance) {
      // Recursively simplify both halves
      const left = this.simplifyPolyline(points.slice(0, maxIdx + 1), tolerance);
      const right = this.simplifyPolyline(points.slice(maxIdx), tolerance);
      return [...left.slice(0, -1), ...right];
    } else {
      // All intermediate points are within tolerance
      return [first, last];
    }
  }

  /**
   * Compute the distance from a point to a line segment.
   */
  private pointToLineDistance(
    point: [number, number, number],
    lineStart: [number, number, number],
    lineEnd: [number, number, number],
  ): number {
    const dx = lineEnd[0] - lineStart[0];
    const dz = lineEnd[2] - lineStart[2];
    const lenSq = dx * dx + dz * dz;

    if (lenSq < 1e-10) {
      // Degenerate line segment
      const px = point[0] - lineStart[0];
      const pz = point[2] - lineStart[2];
      return Math.sqrt(px * px + pz * pz);
    }

    // Project point onto the line segment
    let t = ((point[0] - lineStart[0]) * dx + (point[2] - lineStart[2]) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = lineStart[0] + t * dx;
    const projZ = lineStart[2] + t * dz;

    const px = point[0] - projX;
    const pz = point[2] - projZ;
    return Math.sqrt(px * px + pz * pz);
  }

  // ------------------------------------------------------------------
  // Beach Zone Computation
  // ------------------------------------------------------------------

  /**
   * Compute the beach zone width map.
   *
   * Returns a 2D grid where each cell contains the distance from the
   * shoreline inland (0 at the shoreline, increasing inland up to
   * the beach width). This can be used for:
   * - Beach sand texture blending
   * - Vegetation exclusion zones
   * - Wave run-up animation
   *
   * @param beachWidth - Maximum beach zone width in world units
   * @returns Float32Array of the same size as the boundary SDF grid
   * @throws Error if computeBoundarySDF has not been called yet
   */
  computeBeachZone(beachWidth?: number): Float32Array {
    if (!this.cachedResult) {
      throw new Error('Must call computeBoundarySDF before computing beach zone');
    }

    const effectiveBeachWidth = beachWidth ?? this.config.beachWidth;
    const { boundarySDF, resolution } = this.cachedResult;
    const total = resolution * resolution;

    // Check cache
    if (this.beachZone && effectiveBeachWidth === this.config.beachWidth) {
      return this.beachZone;
    }

    const beach = new Float32Array(total);

    for (let i = 0; i < total; i++) {
      const sdf = boundarySDF[i];

      if (sdf <= 0) {
        // In water: no beach
        beach[i] = 0;
      } else if (sdf >= effectiveBeachWidth) {
        // Far inland: full beach width
        beach[i] = effectiveBeachWidth;
      } else {
        // In the beach zone: smooth transition
        const normalized = sdf / effectiveBeachWidth;
        // Apply smoothstep for natural transition
        const smooth = normalized * normalized * (3 - 2 * normalized);
        beach[i] = effectiveBeachWidth * smooth;
      }
    }

    this.beachZone = beach;
    return beach;
  }

  // ------------------------------------------------------------------
  // Utility Methods
  // ------------------------------------------------------------------

  /**
   * Check if a world position is in water (below shoreline).
   */
  isInWater(x: number, z: number): boolean {
    return this.sample(x, z) < 0;
  }

  /**
   * Check if a world position is on the beach (within beach zone).
   */
  isOnBeach(x: number, z: number): boolean {
    const sdf = this.sample(x, z);
    return sdf >= 0 && sdf < this.config.beachWidth;
  }

  /**
   * Get the beach blend factor at a position (0 = water edge, 1 = inland).
   */
  getBeachBlendFactor(x: number, z: number): number {
    const sdf = this.sample(x, z);
    if (sdf <= 0) return 0;
    if (sdf >= this.config.beachWidth) return 1;
    const normalized = sdf / this.config.beachWidth;
    return normalized * normalized * (3 - 2 * normalized);
  }

  /**
   * Get the water coverage fraction at a position.
   * Returns 1.0 if fully underwater, 0.0 if on land, with smooth
   * transition near the shoreline.
   */
  getWaterCoverage(x: number, z: number): number {
    const sdf = this.sample(x, z);
    const transitionWidth = this.cachedResult?.cellSize ?? 1.0;
    if (sdf > transitionWidth) return 0;
    if (sdf < -transitionWidth) return 1;
    // Smooth transition
    const t = (-sdf + transitionWidth) / (2 * transitionWidth);
    return t * t * (3 - 2 * t);
  }

  /**
   * Compute the SDF gradient direction at a point (points toward land).
   */
  getShoreNormal(x: number, z: number): [number, number] {
    if (!this.cachedResult) {
      throw new Error('Must call computeBoundarySDF before computing shore normal');
    }

    const { cellSize } = this.cachedResult;
    const eps = cellSize * 0.5;

    const sdfRight = this.sample(x + eps, z);
    const sdfLeft = this.sample(x - eps, z);
    const sdfUp = this.sample(x, z + eps);
    const sdfDown = this.sample(x, z - eps);

    const gradX = (sdfRight - sdfLeft) / (2 * eps);
    const gradZ = (sdfUp - sdfDown) / (2 * eps);

    const mag = Math.sqrt(gradX * gradX + gradZ * gradZ);
    if (mag < 1e-10) return [0, 0];

    return [gradX / mag, gradZ / mag];
  }

  // ------------------------------------------------------------------
  // Multi-Level Boundary SDF
  // ------------------------------------------------------------------

  /**
   * Compute boundary SDF at multiple water levels (for terraced terrain).
   *
   * Useful when the terrain has multiple water bodies at different
   * elevations (e.g., mountain lakes at different altitudes).
   *
   * @param terrainSDF - Terrain SDF function
   * @param waterHeights - Array of water plane heights
   * @param bounds - 2D world-space bounds
   * @param resolution - Grid resolution
   * @returns Map from water height to BoundarySDFResult
   */
  computeMultiLevelBoundarySDF(
    terrainSDF: (x: number, y: number, z: number) => number,
    waterHeights: number[],
    bounds: { min: [number, number]; max: [number, number] },
    resolution: number,
  ): Map<number, BoundarySDFResult> {
    const results = new Map<number, BoundarySDFResult>();

    for (const waterHeight of waterHeights) {
      const savedResult = this.cachedResult;
      this.computeBoundarySDF(terrainSDF, waterHeight, bounds, resolution);
      results.set(waterHeight, this.cachedResult!);
      this.cachedResult = savedResult; // Restore previous cache
    }

    return results;
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  /**
   * Get the cached boundary SDF result.
   */
  getResult(): BoundarySDFResult | null {
    return this.cachedResult;
  }

  /**
   * Get the cached beach zone grid.
   */
  getBeachZone(): Float32Array | null {
    return this.beachZone;
  }

  updateConfig(partial: Partial<WaterBoundarySDFConfig>): void {
    Object.assign(this.config, partial);
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
    this.cachedResult = null;
    this.beachZone = null;
  }

  getConfig(): WaterBoundarySDFConfig {
    return { ...this.config };
  }

  dispose(): void {
    this.cachedResult = null;
    this.beachZone = null;
  }
}
