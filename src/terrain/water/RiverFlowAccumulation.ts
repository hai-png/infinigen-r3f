/**
 * RiverFlowAccumulation — Enhanced River Network with Flow Accumulation
 *
 * Implements a complete hydrological river network generation pipeline:
 *
 * 1. **Pit filling**: Fill depressions in the heightmap using a priority-flood
 *    algorithm to ensure continuous downhill flow.
 * 2. **D8 flow direction**: Water flows to the steepest downhill neighbor
 *    among 8 possible directions.
 * 3. **Flow accumulation**: Count upstream drainage area for each cell
 *    using a topological sort approach.
 * 4. **Strahler stream order**: Classify stream segments by their
 *    hierarchical order (headwater = 1, merging increases order).
 * 5. **River network extraction**: Extract river paths above a flow
 *    accumulation threshold.
 * 6. **Meandering**: Apply sine-based meandering with noise perturbation
 *    for natural river curves.
 * 7. **Valley carving**: Carve V-shaped or U-shaped valleys along
 *    river paths into the heightmap.
 *
 * All randomness is seed-based for reproducibility.
 *
 * @module terrain/water
 */

import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

// ============================================================================
// Types
// ============================================================================

/**
 * D8 flow direction codes (0-7), representing the 8 cardinal and diagonal
 * directions from a cell to its neighbor. Convention:
 *
 *   6  5  4
 *   7  X  3
 *   0  1  2
 */
export const D8_DIRECTIONS = [
  [-1, 1],   // 0: SW
  [0, 1],    // 1: S
  [1, 1],    // 2: SE
  [1, 0],    // 3: E
  [1, -1],   // 4: NE
  [0, -1],   // 5: N
  [-1, -1],  // 6: NW
  [-1, 0],   // 7: W
] as const;

/** Distance multiplier for D8 directions (cardinal = 1, diagonal = √2) */
export const D8_DIST: Float64Array = new Float64Array([
  Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1,
]);

/**
 * Result of flow accumulation computation.
 */
export interface FlowAccumulationResult {
  /** D8 flow direction codes (0-7) for each cell, 255 = no flow (pit/edge) */
  flowDir: Uint8Array;
  /** Accumulated flow (upstream drainage area in cells) for each cell */
  flowAccum: Float32Array;
  /** Strahler stream order for each cell (0 = no stream) */
  streamOrder: Uint8Array;
  /** Filled (hydrologically conditioned) heightmap */
  filledHeightmap: Float32Array;
}

/**
 * A river segment extracted from the flow accumulation grid.
 */
export interface RiverSegment {
  /** Start cell index in the grid */
  startIdx: number;
  /** End cell index in the grid */
  endIdx: number;
  /** Strahler stream order of this segment */
  order: number;
  /** Flow accumulation at the outlet of this segment */
  flowAccum: number;
  /** Grid cell path (col, row pairs) from start to end */
  path: [number, number][];
}

/**
 * Configuration for the river flow accumulation system.
 */
export interface RiverFlowConfig {
  /** RNG seed for reproducibility (default 42) */
  seed: number;
  /** Flow accumulation threshold for stream extraction (default 100) */
  streamThreshold: number;
  /** Minimum Strahler order for river extraction (default 1) */
  minStreamOrder: number;
  /** Meandering sinuosity factor (1.0 = straight, higher = more curved) (default 1.5) */
  meanderSinuosity: number;
  /** Meandering wavelength in world units (default 30) */
  meanderWavelength: number;
  /** Meandering amplitude in world units (default 5) */
  meanderAmplitude: number;
  /** Valley shape: 'V' for V-shaped, 'U' for U-shaped (default 'V') */
  valleyShape: 'V' | 'U';
  /** Valley width in world units (default 4.0) */
  valleyWidth: number;
  /** Valley depth in world units (default 2.0) */
  valleyDepth: number;
  /** Pit fill maximum iterations (0 = unlimited) (default 0) */
  pitFillMaxIterations: number;
  /** Noise frequency for meandering perturbation (default 0.01) */
  meanderNoiseFrequency: number;
  /** Noise amplitude for meandering perturbation (default 0.3) */
  meanderNoiseAmplitude: number;
  /** Whether to merge tributaries at confluences (default true) */
  mergeTributaries: boolean;
}

// ============================================================================
// RiverFlowAccumulation
// ============================================================================

export class RiverFlowAccumulation {
  private config: RiverFlowConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;

  // Cached computation results
  private lastResult: FlowAccumulationResult | null = null;
  private lastSegments: RiverSegment[] = [];
  private lastWidth: number = 0;
  private lastHeight: number = 0;

  constructor(config: Partial<RiverFlowConfig> = {}) {
    this.config = {
      seed: 42,
      streamThreshold: 100,
      minStreamOrder: 1,
      meanderSinuosity: 1.5,
      meanderWavelength: 30,
      meanderAmplitude: 5,
      valleyShape: 'V',
      valleyWidth: 4.0,
      valleyDepth: 2.0,
      pitFillMaxIterations: 0,
      meanderNoiseFrequency: 0.01,
      meanderNoiseAmplitude: 0.3,
      mergeTributaries: true,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
  }

  // ------------------------------------------------------------------
  // Pit Filling (Priority-Flood Algorithm)
  // ------------------------------------------------------------------

  /**
   * Fill depressions (pits) in the heightmap using the priority-flood
   * algorithm of Wang & Liu (2006).
   *
   * This ensures that every cell has a downhill path to the edge of the
   * grid, which is required for proper flow direction computation.
   *
   * @param heightmap - Input heightmap (will not be modified)
   * @param width - Grid width
   * @param height - Grid height
   * @returns New heightmap with pits filled
   */
  fillPits(heightmap: Float32Array, width: number, height: number): Float32Array {
    if (heightmap.length !== width * height) {
      throw new Error(`Heightmap size ${heightmap.length} does not match ${width}x${height}`);
    }

    const filled = new Float32Array(heightmap);
    const closed = new Uint8Array(width * height);

    // Priority queue: min-heap by elevation
    // Each entry: [elevation, index]
    const heap: [number, number][] = [];

    // Initialize: push all edge cells into the priority queue
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        if (row === 0 || row === height - 1 || col === 0 || col === width - 1) {
          const idx = row * width + col;
          heap.push([filled[idx], idx]);
          closed[idx] = 1;
        }
      }
    }

    // Heapify
    this.heapify(heap);

    // Process cells from lowest elevation to highest
    while (heap.length > 0) {
      const [currentElev, currentIdx] = this.heapPop(heap);
      const currentRow = Math.floor(currentIdx / width);
      const currentCol = currentIdx % width;

      // Check all 8 neighbors
      for (let d = 0; d < 8; d++) {
        const nc = currentCol + D8_DIRECTIONS[d][0];
        const nr = currentRow + D8_DIRECTIONS[d][1];

        if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
        const nIdx = nr * width + nc;

        if (closed[nIdx]) continue;
        closed[nIdx] = 1;

        // If neighbor is lower than current, raise it to current level (fill the pit)
        if (filled[nIdx] < currentElev) {
          filled[nIdx] = currentElev;
        }

        this.heapPush(heap, [filled[nIdx], nIdx]);
      }
    }

    return filled;
  }

  // ------------------------------------------------------------------
  // D8 Flow Direction
  // ------------------------------------------------------------------

  /**
   * Compute D8 flow directions from a (pit-filled) heightmap.
   *
   * Each cell flows to its steepest downhill neighbor among 8
   * possible directions. Edge cells and local minima flow off-grid
   * (direction code 255).
   *
   * @param heightmap - Pit-filled heightmap
   * @param width - Grid width
   * @param height - Grid height
   * @returns Uint8Array of D8 direction codes (0-7), 255 = no outflow
   */
  computeD8FlowDirection(
    heightmap: Float32Array,
    width: number,
    height: number,
  ): Uint8Array {
    const flowDir = new Uint8Array(width * height).fill(255);

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        const currentH = heightmap[idx];

        let maxSlope = 0;
        let bestDir = 255;

        for (let d = 0; d < 8; d++) {
          const nc = col + D8_DIRECTIONS[d][0];
          const nr = row + D8_DIRECTIONS[d][1];

          if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;

          const nIdx = nr * width + nc;
          const nH = heightmap[nIdx];
          const dist = D8_DIST[d];
          const slope = (currentH - nH) / dist;

          if (slope > maxSlope) {
            maxSlope = slope;
            bestDir = d;
          }
        }

        flowDir[idx] = bestDir;
      }
    }

    return flowDir;
  }

  // ------------------------------------------------------------------
  // Flow Accumulation
  // ------------------------------------------------------------------

  /**
   * Compute flow accumulation using a topological sort approach.
   *
   * For each cell, count the number of upstream cells that drain
   * through it. This gives the drainage area (in grid cells) for
   * each point on the terrain.
   *
   * @param flowDir - D8 flow direction array
   * @param width - Grid width
   * @param height - Grid height
   * @returns Float32Array of accumulated flow values
   */
  computeFlowAccumulation(
    flowDir: Uint8Array,
    width: number,
    height: number,
  ): Float32Array {
    const total = width * height;
    const flowAccum = new Float32Array(total).fill(1); // Each cell counts as 1
    const inDegree = new Uint32Array(total);

    // Compute in-degree for each cell (how many cells flow into it)
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        const dir = flowDir[idx];

        if (dir === 255) continue; // No outflow

        const nc = col + D8_DIRECTIONS[dir][0];
        const nr = row + D8_DIRECTIONS[dir][1];

        if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;

        const nIdx = nr * width + nc;
        inDegree[nIdx]++;
      }
    }

    // Topological sort: process cells from sources (in-degree 0) to outlets
    const queue: number[] = [];

    // Initialize queue with source cells
    for (let i = 0; i < total; i++) {
      if (inDegree[i] === 0) {
        queue.push(i);
      }
    }

    // Process cells in topological order
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const row = Math.floor(idx / width);
      const col = idx % width;
      const dir = flowDir[idx];

      if (dir === 255) continue; // No outflow

      const nc = col + D8_DIRECTIONS[dir][0];
      const nr = row + D8_DIRECTIONS[dir][1];

      if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;

      const nIdx = nr * width + nc;

      // Accumulate flow
      flowAccum[nIdx] += flowAccum[idx];

      // Decrease in-degree of downstream cell
      inDegree[nIdx]--;
      if (inDegree[nIdx] === 0) {
        queue.push(nIdx);
      }
    }

    return flowAccum;
  }

  // ------------------------------------------------------------------
  // Strahler Stream Order
  // ------------------------------------------------------------------

  /**
   * Compute Strahler stream order for each cell.
   *
   * Rules:
   * - Headwater streams (no upstream tributaries) have order 1
   * - When two streams of the same order merge, the downstream
   *   order increases by 1
   * - When streams of different orders merge, the downstream
   *   order is the maximum of the two
   *
   * @param flowDir - D8 flow direction array
   * @param flowAccum - Flow accumulation array
   * @param width - Grid width
   * @param height - Grid height
   * @param threshold - Minimum flow accumulation to be considered a stream
   * @returns Uint8Array of Strahler stream orders (0 = not a stream)
   */
  computeStrahlerOrder(
    flowDir: Uint8Array,
    flowAccum: Float32Array,
    width: number,
    height: number,
    threshold: number,
  ): Uint8Array {
    const total = width * height;
    const streamOrder = new Uint8Array(total);
    const inDegree = new Uint32Array(total);

    // Build in-degree for stream cells only
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        if (flowAccum[idx] < threshold) continue; // Not a stream cell

        const dir = flowDir[idx];
        if (dir === 255) continue;

        const nc = col + D8_DIRECTIONS[dir][0];
        const nr = row + D8_DIRECTIONS[dir][1];

        if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;

        const nIdx = nr * width + nc;
        if (flowAccum[nIdx] >= threshold) {
          inDegree[nIdx]++;
        }
      }
    }

    // Process from headwaters (in-degree 0 stream cells)
    const queue: number[] = [];
    for (let i = 0; i < total; i++) {
      if (flowAccum[i] >= threshold && inDegree[i] === 0) {
        streamOrder[i] = 1; // Headwater = order 1
        queue.push(i);
      }
    }

    // Track the maximum incoming order and count of same-order tributaries
    const maxIncomingOrder = new Uint8Array(total);
    const sameOrderCount = new Uint8Array(total);

    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const row = Math.floor(idx / width);
      const col = idx % width;
      const dir = flowDir[idx];

      if (dir === 255) continue;

      const nc = col + D8_DIRECTIONS[dir][0];
      const nr = row + D8_DIRECTIONS[dir][1];

      if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;

      const nIdx = nr * width + nc;
      if (flowAccum[nIdx] < threshold) continue; // Not a stream cell

      // Propagate Strahler order downstream
      const currentOrder = streamOrder[idx];

      if (currentOrder > maxIncomingOrder[nIdx]) {
        maxIncomingOrder[nIdx] = currentOrder;
        sameOrderCount[nIdx] = 1;
      } else if (currentOrder === maxIncomingOrder[nIdx]) {
        sameOrderCount[nIdx]++;
      }

      // Decrease in-degree
      inDegree[nIdx]--;

      // When all upstream tributaries are processed, assign order
      if (inDegree[nIdx] === 0) {
        if (sameOrderCount[nIdx] >= 2) {
          // Two or more tributaries of same order → order + 1
          streamOrder[nIdx] = maxIncomingOrder[nIdx] + 1;
        } else {
          // Only one tributary of max order → same order
          streamOrder[nIdx] = maxIncomingOrder[nIdx];
        }
        queue.push(nIdx);
      }
    }

    return streamOrder;
  }

  // ------------------------------------------------------------------
  // Full Flow Accumulation Pipeline
  // ------------------------------------------------------------------

  /**
   * Compute the full flow accumulation pipeline:
   * 1. Fill pits
   * 2. Compute D8 flow directions
   * 3. Compute flow accumulation
   * 4. Compute Strahler stream order
   *
   * @param heightmap - Input heightmap
   * @param width - Grid width
   * @param height - Grid height
   * @returns Complete flow accumulation result
   */
  computeFlowAccumulationFull(
    heightmap: Float32Array,
    width: number,
    height: number,
  ): FlowAccumulationResult {
    if (heightmap.length !== width * height) {
      throw new Error(`Heightmap size ${heightmap.length} does not match ${width}x${height}`);
    }

    // Reset RNG for reproducibility
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);

    // Step 1: Fill pits
    const filledHeightmap = this.fillPits(heightmap, width, height);

    // Step 2: Compute D8 flow directions
    const flowDir = this.computeD8FlowDirection(filledHeightmap, width, height);

    // Step 3: Compute flow accumulation
    const flowAccum = this.computeFlowAccumulation(flowDir, width, height);

    // Step 4: Compute Strahler stream order
    const streamOrder = this.computeStrahlerOrder(
      flowDir, flowAccum, width, height, this.config.streamThreshold,
    );

    const result: FlowAccumulationResult = {
      flowDir,
      flowAccum,
      streamOrder,
      filledHeightmap,
    };

    // Cache results
    this.lastResult = result;
    this.lastWidth = width;
    this.lastHeight = height;

    return result;
  }

  // ------------------------------------------------------------------
  // River Network Extraction
  // ------------------------------------------------------------------

  /**
   * Extract river network from flow accumulation above a threshold.
   *
   * Traces stream segments from headwaters to outlets, recording
   * the path, order, and flow accumulation for each segment.
   *
   * @param flowAccum - Flow accumulation array
   * @param threshold - Minimum flow accumulation for a stream
   * @param width - Grid width
   * @param height - Grid height
   * @returns Array of river segments
   */
  extractRiverNetwork(
    flowAccum: Float32Array,
    threshold: number,
    width: number,
    height: number,
  ): RiverSegment[] {
    const flowDir = this.lastResult?.flowDir ?? new Uint8Array(width * height).fill(255);
    const streamOrder = this.lastResult?.streamOrder ?? new Uint8Array(width * height);

    // Find headwater cells (stream cells with no upstream stream tributaries)
    const isHeadwater = new Uint8Array(width * height);
    const isStream = new Uint8Array(width * height);

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        if (flowAccum[idx] >= threshold) {
          isStream[idx] = 1;
        }
      }
    }

    // Identify headwaters: stream cells with no upstream stream neighbors
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        if (!isStream[idx]) continue;

        let hasUpstream = false;
        for (let d = 0; d < 8; d++) {
          const nc = col + D8_DIRECTIONS[d][0];
          const nr = row + D8_DIRECTIONS[d][1];
          if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
          const nIdx = nr * width + nc;

          // Check if this neighbor flows INTO the current cell
          const nDir = flowDir[nIdx];
          if (nDir === 255) continue;
          const targetCol = nc + D8_DIRECTIONS[nDir][0];
          const targetRow = nr + D8_DIRECTIONS[nDir][1];
          if (targetCol === col && targetRow === row && isStream[nIdx]) {
            hasUpstream = true;
            break;
          }
        }

        if (!hasUpstream) {
          isHeadwater[idx] = 1;
        }
      }
    }

    // Trace river segments from each headwater
    const visited = new Uint8Array(width * height);
    const segments: RiverSegment[] = [];

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        if (!isHeadwater[idx] || visited[idx]) continue;

        // Trace downstream from this headwater
        const path: [number, number][] = [[col, row]];
        let currentCol = col;
        let currentRow = row;
        let currentIdx = idx;

        while (true) {
          visited[currentIdx] = 1;

          const dir = flowDir[currentIdx];
          if (dir === 255) break; // No outflow

          const nextCol = currentCol + D8_DIRECTIONS[dir][0];
          const nextRow = currentRow + D8_DIRECTIONS[dir][1];

          if (nextCol < 0 || nextCol >= width || nextRow < 0 || nextRow >= height) break;

          const nextIdx = nextRow * width + nextCol;
          path.push([nextCol, nextRow]);

          // Stop at confluences (cells with multiple upstream tributaries)
          let upstreamCount = 0;
          for (let d = 0; d < 8; d++) {
            const uc = nextCol + D8_DIRECTIONS[d][0];
            const ur = nextRow + D8_DIRECTIONS[d][1];
            if (uc < 0 || uc >= width || ur < 0 || ur >= height) continue;
            const uIdx = ur * width + uc;
            const uDir = flowDir[uIdx];
            if (uDir === 255) continue;
            const targetC = uc + D8_DIRECTIONS[uDir][0];
            const targetR = ur + D8_DIRECTIONS[uDir][1];
            if (targetC === nextCol && targetR === nextRow && isStream[uIdx]) {
              upstreamCount++;
            }
          }

          // If confluence and not the first upstream, end this segment
          if (upstreamCount > 1 && path.length > 1) {
            // Don't mark as visited — other tributaries need to reach it
            break;
          }

          currentCol = nextCol;
          currentRow = nextRow;
          currentIdx = nextIdx;

          // Stop if not a stream cell anymore
          if (!isStream[nextIdx]) break;
        }

        // Create segment if long enough
        if (path.length >= 2) {
          const startIdx = path[0][1] * width + path[0][0];
          const endIdx = path[path.length - 1][1] * width + path[path.length - 1][0];

          // Get the maximum stream order along the path
          let maxOrder = 0;
          for (const [pc, pr] of path) {
            const pIdx = pr * width + pc;
            maxOrder = Math.max(maxOrder, streamOrder[pIdx]);
          }

          segments.push({
            startIdx,
            endIdx,
            order: Math.max(1, maxOrder),
            flowAccum: flowAccum[endIdx],
            path,
          });
        }
      }
    }

    // Sort segments by Strahler order descending (major rivers first)
    segments.sort((a, b) => b.order - a.order || b.flowAccum - a.flowAccum);

    this.lastSegments = segments;
    return segments;
  }

  // ------------------------------------------------------------------
  // River Meandering
  // ------------------------------------------------------------------

  /**
   * Generate a meandering river path from a straight segment.
   *
   * Applies sine-based meandering with noise perturbation to create
   * natural-looking river curves. The meandering respects the original
   * flow direction while adding lateral displacement.
   *
   * @param segment - River segment to meander
   * @param sinuosity - Target sinuosity (path length / straight distance)
   * @param wavelength - Meander wavelength in world units
   * @param amplitude - Meander amplitude in world units
   * @returns Array of [x, y, z] world-space meandered path points
   */
  generateMeanderPath(
    segment: RiverSegment,
    sinuosity?: number,
    wavelength?: number,
    amplitude?: number,
  ): [number, number, number][] {
    const path = segment.path;
    if (path.length < 2) {
      return path.map(([c, r]) => [c, r, 0] as [number, number, number]);
    }

    const effectiveSinuosity = sinuosity ?? this.config.meanderSinuosity;
    const effectiveWavelength = wavelength ?? this.config.meanderWavelength;
    const effectiveAmplitude = amplitude ?? this.config.meanderAmplitude;

    // Compute the overall flow direction of the segment
    const startCol = path[0][0];
    const startRow = path[0][1];
    const endCol = path[path.length - 1][0];
    const endRow = path[path.length - 1][1];

    const flowDirX = endCol - startCol;
    const flowDirZ = endRow - startRow;
    const flowLength = Math.sqrt(flowDirX * flowDirX + flowDirZ * flowDirZ);

    if (flowLength < 1) {
      return path.map(([c, r]) => [c, r, 0] as [number, number, number]);
    }

    // Normalize flow direction
    const ndx = flowDirX / flowLength;
    const ndz = flowDirZ / flowLength;

    // Perpendicular direction for meandering
    const perpX = -ndz;
    const perpZ = ndx;

    // Compute total path length along the segment
    let totalDist = 0;
    const distances: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      const dx = path[i][0] - path[i - 1][0];
      const dz = path[i][1] - path[i - 1][1];
      totalDist += Math.sqrt(dx * dx + dz * dz);
      distances.push(totalDist);
    }

    // Generate meandered path
    const meanderedPath: [number, number, number][] = [];

    // Number of sub-samples for smooth curves
    const subsamples = Math.max(path.length * 4, 20);

    for (let s = 0; s <= subsamples; s++) {
      const t = s / subsamples;
      const dist = t * totalDist;

      // Find the base position along the original path (interpolate)
      const basePos = this.interpolatePathPosition(path, distances, t);

      // Compute meander displacement
      // Primary sine wave
      const phase = (dist / effectiveWavelength) * Math.PI * 2;
      const sineDisp = Math.sin(phase) * effectiveAmplitude * effectiveSinuosity;

      // Noise perturbation for natural variation
      const noiseVal = this.noise.perlin2D(
        basePos[0] * this.config.meanderNoiseFrequency,
        basePos[1] * this.config.meanderNoiseFrequency,
      ) * effectiveAmplitude * this.config.meanderNoiseAmplitude;

      // Secondary harmonic for asymmetry
      const secondaryDisp = Math.sin(phase * 2.3 + 1.7) * effectiveAmplitude * 0.2;

      // Total lateral displacement
      const lateralDisp = sineDisp + noiseVal + secondaryDisp;

      // Apply displacement perpendicular to flow direction
      const mx = basePos[0] + perpX * lateralDisp;
      const mz = basePos[1] + perpZ * lateralDisp;

      meanderedPath.push([mx, 0, mz]); // Y will be set from heightmap
    }

    return meanderedPath;
  }

  /**
   * Interpolate a position along the path at parameter t ∈ [0, 1].
   */
  private interpolatePathPosition(
    path: [number, number][],
    distances: number[],
    t: number,
  ): [number, number] {
    if (t <= 0) return [path[0][0], path[0][1]];
    if (t >= 1) return [path[path.length - 1][0], path[path.length - 1][1]];

    const totalDist = distances[distances.length - 1];
    const targetDist = t * totalDist;

    // Find the segment containing this distance
    for (let i = 1; i < distances.length; i++) {
      if (distances[i] >= targetDist) {
        const segLen = distances[i] - distances[i - 1];
        const segT = segLen > 0 ? (targetDist - distances[i - 1]) / segLen : 0;

        const x = path[i - 1][0] + (path[i][0] - path[i - 1][0]) * segT;
        const y = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * segT;
        return [x, y];
      }
    }

    return [path[path.length - 1][0], path[path.length - 1][1]];
  }

  // ------------------------------------------------------------------
  // Valley Carving
  // ------------------------------------------------------------------

  /**
   * Carve a river valley into the heightmap along a given path.
   *
   * Supports both V-shaped (narrow, steep-walled) and U-shaped
   * (wide, flat-bottomed) valley profiles. The valley depth and
   * width scale with the Strahler order of the river.
   *
   * @param heightmap - Input heightmap (will be modified)
   * @param path - World-space path points [x, y, z]
   * @param valleyWidth - Valley width in world units
   * @param valleyDepth - Valley depth in world units
   * @returns Modified heightmap with carved valleys
   */
  carveRiverValley(
    heightmap: Float32Array,
    path: [number, number, number][],
    valleyWidth?: number,
    valleyDepth?: number,
  ): Float32Array {
    if (path.length < 2) return heightmap;

    const effectiveWidth = valleyWidth ?? this.config.valleyWidth;
    const effectiveDepth = valleyDepth ?? this.config.valleyDepth;
    const result = new Float32Array(heightmap);

    // We need the grid dimensions from cached results
    const W = this.lastWidth;
    const H = this.lastHeight;
    if (W === 0 || H === 0) {
      // Fallback: try to infer dimensions
      return result;
    }

    // Compute cumulative distances along the path for interpolation
    const pathDistances: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      const dx = path[i][0] - path[i - 1][0];
      const dz = path[i][2] - path[i - 1][2];
      pathDistances.push(pathDistances[i - 1] + Math.sqrt(dx * dx + dz * dz));
    }

    // For each grid cell, find the closest point on the river path
    // and compute valley carving
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const idx = row * W + col;

        // Find closest point on path
        let minDist = Infinity;
        let closestPathIdx = 0;

        for (let p = 0; p < path.length; p++) {
          const dx = col - path[p][0];
          const dz = row - path[p][2];
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < minDist) {
            minDist = dist;
            closestPathIdx = p;
          }
        }

        // Check if within valley radius (use 2x width for gentle falloff)
        const maxRadius = effectiveWidth * 3;
        if (minDist > maxRadius) continue;

        // Get the elevation at the closest path point
        const pathElevation = result[idx]; // Current height at this cell

        // Compute valley profile
        let valleyCarve: number;

        if (this.config.valleyShape === 'V') {
          // V-shaped valley: linear cross-section
          const normalizedDist = minDist / effectiveWidth;
          valleyCarve = effectiveDepth * Math.max(0, 1 - normalizedDist);
        } else {
          // U-shaped valley: parabolic cross-section with flat bottom
          const normalizedDist = minDist / effectiveWidth;
          if (normalizedDist < 0.5) {
            // Flat bottom
            valleyCarve = effectiveDepth;
          } else {
            // Parabolic walls
            const wallT = (normalizedDist - 0.5) / 0.5;
            valleyCarve = effectiveDepth * (1 - wallT * wallT);
          }
        }

        // Apply smooth falloff at valley edges
        const edgeFade = Math.max(0, 1 - (minDist / maxRadius));
        const smoothFade = edgeFade * edgeFade * (3 - 2 * edgeFade); // smoothstep
        valleyCarve *= smoothFade;

        // Subtract valley from terrain
        result[idx] = Math.min(result[idx], pathElevation - valleyCarve);
      }
    }

    return result;
  }

  /**
   * Carve valleys for all extracted river segments.
   *
   * Each segment's valley dimensions scale with its Strahler order:
   * higher-order rivers get wider and deeper valleys.
   *
   * @param heightmap - Input heightmap
   * @param segments - River segments (from extractRiverNetwork)
   * @returns Modified heightmap with all valleys carved
   */
  carveAllValleys(
    heightmap: Float32Array,
    segments: RiverSegment[],
  ): Float32Array {
    let result = new Float32Array(heightmap);

    for (const segment of segments) {
      // Generate meander path for this segment
      const meanderPath = this.generateMeanderPath(segment);

      // Scale valley dimensions by stream order
      const orderScale = Math.pow(segment.order, 0.5);
      const width = this.config.valleyWidth * orderScale;
      const depth = this.config.valleyDepth * orderScale;

      result = new Float32Array(this.carveRiverValley(result, meanderPath, width, depth));
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Convenience: Full Pipeline
  // ------------------------------------------------------------------

  /**
   * Run the complete river network generation pipeline.
   *
   * 1. Pit filling
   * 2. D8 flow direction
   * 3. Flow accumulation
   * 4. Strahler stream order
   * 5. River network extraction
   * 6. Meander path generation
   * 7. Valley carving
   *
   * @param heightmap - Input heightmap
   * @param width - Grid width
   * @param height - Grid height
   * @returns Complete result with all generated data
   */
  generateFull(
    heightmap: Float32Array,
    width: number,
    height: number,
  ): {
    flowResult: FlowAccumulationResult;
    segments: RiverSegment[];
    meanderPaths: [number, number, number][][];
    carvedHeightmap: Float32Array;
  } {
    // Step 1-4: Flow accumulation pipeline
    const flowResult = this.computeFlowAccumulationFull(heightmap, width, height);

    // Step 5: Extract river network
    const segments = this.extractRiverNetwork(
      flowResult.flowAccum,
      this.config.streamThreshold,
      width,
      height,
    );

    // Step 6: Generate meander paths for each segment
    const meanderPaths: [number, number, number][][] = [];
    for (const segment of segments) {
      meanderPaths.push(this.generateMeanderPath(segment));
    }

    // Step 7: Carve valleys
    const carvedHeightmap = this.carveAllValleys(heightmap, segments);

    return {
      flowResult,
      segments,
      meanderPaths,
      carvedHeightmap,
    };
  }

  // ------------------------------------------------------------------
  // Priority Queue (Min-Heap) for Pit Filling
  // ------------------------------------------------------------------

  private heapPush(heap: [number, number][], item: [number, number]): void {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  }

  private heapPop(heap: [number, number][]): [number, number] {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      this.heapSiftDown(heap, 0);
    }
    return top;
  }

  private heapify(heap: [number, number][]): void {
    for (let i = (heap.length >> 1) - 1; i >= 0; i--) {
      this.heapSiftDown(heap, i);
    }
  }

  private heapSiftDown(heap: [number, number][], i: number): void {
    const n = heap.length;
    while (true) {
      let smallest = i;
      const left = (i << 1) + 1;
      const right = (i << 1) + 2;

      if (left < n && heap[left][0] < heap[smallest][0]) smallest = left;
      if (right < n && heap[right][0] < heap[smallest][0]) smallest = right;

      if (smallest === i) break;

      [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
      i = smallest;
    }
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  getLastResult(): FlowAccumulationResult | null {
    return this.lastResult;
  }

  getLastSegments(): RiverSegment[] {
    return this.lastSegments;
  }

  updateConfig(partial: Partial<RiverFlowConfig>): void {
    Object.assign(this.config, partial);
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
    this.lastResult = null;
    this.lastSegments = [];
  }

  getConfig(): RiverFlowConfig {
    return { ...this.config };
  }

  dispose(): void {
    this.lastResult = null;
    this.lastSegments = [];
  }
}
