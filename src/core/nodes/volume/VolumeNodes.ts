/**
 * Volume Nodes Module
 * Volume data access, sampling, and volume-to-mesh conversion
 * Ported from Blender Geometry Nodes
 *
 * Implements:
 * - VolumeData interface and VolumeGrid class for representing 3D scalar fields
 * - VolumeToMeshNode: Marching cubes isosurface extraction
 * - SampleVolumeNode: Trilinear interpolation sampling with gradient computation
 * - VolumeInfoNode: Statistical analysis using Welford's method
 * - DensityToAlphaNode: Linear and Beer-Lambert density-to-alpha conversion
 * - VolumeDistributeNode: Rejection sampling point distribution within volumes
 */

import type { NodeBase, AttributeDomain } from '../core/types';
import { EDGE_TABLE, TRIANGLE_TABLE, EDGE_VERTICES, CORNER_OFFSETS } from '../../../terrain/mesher/MarchingCubesLUTs';

// ============================================================================
// Core Volume Data Types
// ============================================================================

/**
 * VolumeData — The standard interface for 3D scalar field data.
 *
 * Represents a regular grid of Float32 samples with resolution and
 * world-space bounds metadata. This is the canonical volume representation
 * used by all volume nodes in the system.
 */
export interface VolumeData {
  /** The voxel data stored as a flat Float32Array in ZYX order */
  data: Float32Array;
  /** Grid dimensions [width, height, depth] in voxels */
  resolution: [number, number, number];
  /** World-space bounding box */
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /** Size of each voxel in world units [dx, dy, dz] */
  voxelSize: [number, number, number];
}

/**
 * VolumeGrid — A concrete implementation of VolumeData with built-in
 * sampling, gradient computation, and mutation methods.
 *
 * Provides trilinear interpolation for smooth sampling and central
 * differences for gradient estimation. This is the primary volume
 * container used throughout the node system.
 */
export class VolumeGrid implements VolumeData {
  public data: Float32Array;
  public resolution: [number, number, number];
  public bounds: { min: [number, number, number]; max: [number, number, number] };
  public voxelSize: [number, number, number];

  constructor(
    resolution: [number, number, number],
    bounds?: { min: [number, number, number]; max: [number, number, number] },
    data?: Float32Array,
  ) {
    this.resolution = resolution;
    this.bounds = bounds ?? {
      min: [0, 0, 0],
      max: [resolution[0] - 1, resolution[1] - 1, resolution[2] - 1],
    };
    const totalVoxels = resolution[0] * resolution[1] * resolution[2];
    this.data = data ?? new Float32Array(totalVoxels);
    this.voxelSize = [
      (this.bounds.max[0] - this.bounds.min[0]) / Math.max(resolution[0] - 1, 1),
      (this.bounds.max[1] - this.bounds.min[1]) / Math.max(resolution[1] - 1, 1),
      (this.bounds.max[2] - this.bounds.min[2]) / Math.max(resolution[2] - 1, 1),
    ];
  }

  /** Get the linear index for voxel (ix, iy, iz) */
  private index(ix: number, iy: number, iz: number): number {
    return iz * this.resolution[1] * this.resolution[0] + iy * this.resolution[0] + ix;
  }

  /** Get the voxel value at integer coordinates (clamped to bounds) */
  getValue(ix: number, iy: number, iz: number): number {
    const cx = Math.max(0, Math.min(this.resolution[0] - 1, ix));
    const cy = Math.max(0, Math.min(this.resolution[1] - 1, iy));
    const cz = Math.max(0, Math.min(this.resolution[2] - 1, iz));
    return this.data[this.index(cx, cy, cz)];
  }

  /** Set the voxel value at integer coordinates */
  setValue(ix: number, iy: number, iz: number, value: number): void {
    if (ix >= 0 && ix < this.resolution[0] &&
        iy >= 0 && iy < this.resolution[1] &&
        iz >= 0 && iz < this.resolution[2]) {
      this.data[this.index(ix, iy, iz)] = value;
    }
  }

  /**
   * Sample the volume at world-space coordinates using trilinear interpolation.
   *
   * @param x - World-space X coordinate
   * @param y - World-space Y coordinate
   * @param z - World-space Z coordinate
   * @returns Interpolated scalar value at the given position
   */
  sample(x: number, y: number, z: number): number {
    // Convert world to voxel coordinates
    const vx = (x - this.bounds.min[0]) / this.voxelSize[0];
    const vy = (y - this.bounds.min[1]) / this.voxelSize[1];
    const vz = (z - this.bounds.min[2]) / this.voxelSize[2];

    const ix = Math.floor(vx);
    const iy = Math.floor(vy);
    const iz = Math.floor(vz);

    // Fractional parts
    const fx = vx - ix;
    const fy = vy - iy;
    const fz = vz - iz;

    // Clamp integer coords to valid range
    const x0 = Math.max(0, Math.min(this.resolution[0] - 1, ix));
    const y0 = Math.max(0, Math.min(this.resolution[1] - 1, iy));
    const z0 = Math.max(0, Math.min(this.resolution[2] - 1, iz));
    const x1 = Math.min(this.resolution[0] - 1, x0 + 1);
    const y1 = Math.min(this.resolution[1] - 1, y0 + 1);
    const z1 = Math.min(this.resolution[2] - 1, z0 + 1);

    // Trilinear interpolation: interpolate along X, then Y, then Z
    const c000 = this.data[this.index(x0, y0, z0)];
    const c100 = this.data[this.index(x1, y0, z0)];
    const c010 = this.data[this.index(x0, y1, z0)];
    const c110 = this.data[this.index(x1, y1, z0)];
    const c001 = this.data[this.index(x0, y0, z1)];
    const c101 = this.data[this.index(x1, y0, z1)];
    const c011 = this.data[this.index(x0, y1, z1)];
    const c111 = this.data[this.index(x1, y1, z1)];

    const c00 = c000 * (1 - fx) + c100 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
  }

  /**
   * Compute the gradient at world-space coordinates using central differences.
   *
   * The gradient is estimated by sampling the volume at offset positions
   * along each axis and computing the finite difference. At volume boundaries,
   * one-sided differences are used.
   *
   * @param x - World-space X coordinate
   * @param y - World-space Y coordinate
   * @param z - World-space Z coordinate
   * @returns Gradient vector [dF/dx, dF/dy, dF/dz]
   */
  gradient(x: number, y: number, z: number): [number, number, number] {
    const h = this.voxelSize[0] * 0.5; // Half-voxel offset

    // Central differences for each axis
    const dx = (this.sample(x + h, y, z) - this.sample(x - h, y, z)) / (2 * h);
    const dy = (this.sample(x, y + h, z) - this.sample(x, y - h, z)) / (2 * h);
    const dz = (this.sample(x, y, z + h) - this.sample(x, y, z - h)) / (2 * h);

    return [dx, dy, dz];
  }

  /** Get total number of voxels in the grid */
  get voxelCount(): number {
    return this.resolution[0] * this.resolution[1] * this.resolution[2];
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface VolumeNodeBase extends NodeBase {
  category: 'volume';
}

// ----------------------------------------------------------------------------
// Volume to Mesh Node
// ----------------------------------------------------------------------------

export interface VolumeToMeshInputs {
  volume?: VolumeData | null;
  threshold?: number;
  adaptivity?: number;
}

export interface VolumeToMeshOutputs {
  geometry: {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
  } | null;
  vertexCount: number;
  faceCount: number;
}

export class VolumeToMeshNode implements VolumeNodeBase {
  readonly category = 'volume';
  readonly nodeType = 'volume_to_mesh';
  readonly name = 'Volume to Mesh';
  readonly inputs: VolumeToMeshInputs;
  readonly outputs: VolumeToMeshOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: VolumeToMeshInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      geometry: null,
      vertexCount: 0,
      faceCount: 0,
    };
  }

  execute(): VolumeToMeshOutputs {
    const volume = this.inputs.volume;
    if (!volume || !volume.data) {
      this.outputs.geometry = null;
      this.outputs.vertexCount = 0;
      this.outputs.faceCount = 0;
      return this.outputs;
    }

    const threshold = this.inputs.threshold ?? 0.5;
    const adaptivity = this.inputs.adaptivity ?? 0.0;

    const result = marchingCubes(volume, threshold, adaptivity);

    this.outputs.geometry = result;
    this.outputs.vertexCount = result.positions.length / 3;
    this.outputs.faceCount = result.indices.length / 3;

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Sample Volume Node
// ----------------------------------------------------------------------------

export interface SampleVolumeInputs {
  volume?: VolumeData | VolumeGrid | null;
  position?: number[];
  gridType?: 'density' | 'heat' | 'velocity';
  interpolation?: 'linear' | 'nearest';
}

export interface SampleVolumeOutputs {
  value: number;
  gradient: number[];
}

export class SampleVolumeNode implements VolumeNodeBase {
  readonly category = 'volume';
  readonly nodeType = 'sample_volume';
  readonly name = 'Sample Volume';
  readonly inputs: SampleVolumeInputs;
  readonly outputs: SampleVolumeOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: SampleVolumeInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      value: 0,
      gradient: [0, 0, 0],
    };
  }

  execute(): SampleVolumeOutputs {
    const volume = this.inputs.volume;
    const position = this.inputs.position || [0, 0, 0];
    const interpolation = this.inputs.interpolation ?? 'linear';

    if (!volume || !volume.data) {
      this.outputs.value = 0;
      this.outputs.gradient = [0, 0, 0];
      return this.outputs;
    }

    // Create a VolumeGrid for sampling if not already one
    const grid = volume instanceof VolumeGrid
      ? volume
      : new VolumeGrid(volume.resolution, volume.bounds, volume.data);

    if (interpolation === 'nearest') {
      // Nearest-neighbor sampling: snap to closest voxel
      const ix = Math.round((position[0] - grid.bounds.min[0]) / grid.voxelSize[0]);
      const iy = Math.round((position[1] - grid.bounds.min[1]) / grid.voxelSize[1]);
      const iz = Math.round((position[2] - grid.bounds.min[2]) / grid.voxelSize[2]);
      this.outputs.value = grid.getValue(ix, iy, iz);
    } else {
      // Trilinear interpolation
      this.outputs.value = grid.sample(position[0], position[1], position[2]);
    }

    // Compute gradient via central differences
    const grad = grid.gradient(position[0], position[1], position[2]);
    this.outputs.gradient = [grad[0], grad[1], grad[2]];

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Volume Info Node (formerly Volume Attribute Stats Node)
// ----------------------------------------------------------------------------

export interface VolumeInfoInputs {
  volume?: VolumeData | null;
  attribute?: string;
}

export interface VolumeInfoOutputs {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
}

export class VolumeInfoNode implements VolumeNodeBase {
  readonly category = 'volume';
  readonly nodeType = 'volume_info';
  readonly name = 'Volume Info';
  readonly inputs: VolumeInfoInputs;
  readonly outputs: VolumeInfoOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: VolumeInfoInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      min: 0,
      max: 1,
      mean: 0.5,
      median: 0.5,
      stdDev: 0.1,
    };
  }

  execute(): VolumeInfoOutputs {
    const volume = this.inputs.volume;

    if (!volume || !volume.data || volume.data.length === 0) {
      this.outputs.min = 0;
      this.outputs.max = 0;
      this.outputs.mean = 0;
      this.outputs.median = 0;
      this.outputs.stdDev = 0;
      return this.outputs;
    }

    const data = volume.data;
    const n = data.length;

    // Single-pass Welford's method for mean and variance
    let min = Infinity;
    let max = -Infinity;
    let mean = 0;
    let m2 = 0; // Sum of squared differences from the mean

    for (let i = 0; i < n; i++) {
      const val = data[i];

      // Track min/max
      if (val < min) min = val;
      if (val > max) max = val;

      // Welford's online algorithm for mean and variance
      const delta = val - mean;
      mean += delta / (i + 1);
      const delta2 = val - mean;
      m2 += delta * delta2;
    }

    const variance = n > 1 ? m2 / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);

    // Estimate median via histogram binning for large volumes
    const median = estimateMedian(data, min, max);

    this.outputs.min = min;
    this.outputs.max = max;
    this.outputs.mean = mean;
    this.outputs.median = median;
    this.outputs.stdDev = stdDev;

    return this.outputs;
  }
}

/**
 * Estimate the median of a large dataset using histogram binning.
 *
 * For small datasets (< 10000 elements), sorts directly.
 * For larger datasets, uses a histogram with 1000 bins to find
 * the approximate median without sorting the entire array.
 */
function estimateMedian(data: Float32Array, min: number, max: number): number {
  const n = data.length;

  if (n < 10000) {
    // For small datasets, sort and pick the middle element
    const sorted = Array.from(data).sort((a, b) => a - b);
    if (n % 2 === 0) {
      return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    }
    return sorted[Math.floor(n / 2)];
  }

  // Histogram binning for large datasets
  const numBins = 1000;
  const range = max - min;
  if (range === 0) return min;

  const binWidth = range / numBins;
  const bins = new Uint32Array(numBins);

  for (let i = 0; i < n; i++) {
    const binIndex = Math.min(Math.floor((data[i] - min) / binWidth), numBins - 1);
    bins[binIndex]++;
  }

  // Find the bin that contains the median
  const halfCount = n / 2;
  let cumulative = 0;
  for (let b = 0; b < numBins; b++) {
    cumulative += bins[b];
    if (cumulative >= halfCount) {
      // Linear interpolation within the bin for better accuracy
      const prevCumulative = cumulative - bins[b];
      const fraction = (halfCount - prevCumulative) / bins[b];
      return min + (b + fraction) * binWidth;
    }
  }

  return (min + max) / 2;
}

// Keep the old name as an alias for backward compatibility
export type VolumeAttributeStatsInputs = VolumeInfoInputs;
export type VolumeAttributeStatsOutputs = VolumeInfoOutputs;
export const VolumeAttributeStatsNode = VolumeInfoNode;

// ----------------------------------------------------------------------------
// Density to Alpha Node
// ----------------------------------------------------------------------------

export interface DensityToAlphaInputs {
  density?: number;
  cutoff?: number;
  alphaScale?: number;
  mode?: 'linear' | 'beer_lambert';
  pathLength?: number;
}

export interface DensityToAlphaOutputs {
  alpha: number;
}

export class DensityToAlphaNode implements VolumeNodeBase {
  readonly category = 'volume';
  readonly nodeType = 'density_to_alpha';
  readonly name = 'Density to Alpha';
  readonly inputs: DensityToAlphaInputs;
  readonly outputs: DensityToAlphaOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: DensityToAlphaInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      alpha: 0,
    };
  }

  execute(): DensityToAlphaOutputs {
    const density = this.inputs.density ?? 0;
    const cutoff = this.inputs.cutoff ?? 0.01;
    const alphaScale = this.inputs.alphaScale ?? 1.0;
    const mode = this.inputs.mode ?? 'linear';

    // Below cutoff density, alpha is zero
    if (density < cutoff) {
      this.outputs.alpha = 0;
      return this.outputs;
    }

    if (mode === 'beer_lambert') {
      // Beer-Lambert law: alpha = 1 - exp(-density * alphaScale * pathLength)
      // This provides physically-based volume rendering where alpha increases
      // exponentially with density and path length through the medium.
      const pathLength = this.inputs.pathLength ?? 1.0;
      this.outputs.alpha = 1 - Math.exp(-density * alphaScale * pathLength);
    } else {
      // Linear mode: alpha = density * alphaScale, clamped to [0, 1]
      this.outputs.alpha = Math.min(density * alphaScale, 1.0);
    }

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Volume Distribute Node
// ----------------------------------------------------------------------------

export interface VolumeDistributeInputs {
  volume?: VolumeData | VolumeGrid | null;
  density?: number;
  seed?: number;
  maxPoints?: number;
}

export interface VolumeDistributeOutputs {
  positions: number[][];
  count: number;
}

/**
 * Seeded pseudo-random number generator (xorshift32)
 * for deterministic volume point distribution.
 */
class SeededRNG {
  private state: number;

  constructor(seed: number) {
    // Ensure non-zero state
    this.state = seed ^ 0x6D2B79F5;
    if (this.state === 0) this.state = 1;
    // Warm up the generator
    for (let i = 0; i < 8; i++) this.next();
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    // Convert to [0, 1) range
    return (x >>> 0) / 4294967296;
  }
}

export class VolumeDistributeNode implements VolumeNodeBase {
  readonly category = 'volume';
  readonly nodeType = 'volume_distribute';
  readonly name = 'Volume Distribute';
  readonly inputs: VolumeDistributeInputs;
  readonly outputs: VolumeDistributeOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: VolumeDistributeInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      positions: [],
      count: 0,
    };
  }

  execute(): VolumeDistributeOutputs {
    const volume = this.inputs.volume;
    const density = this.inputs.density ?? 1.0;
    const seed = this.inputs.seed ?? 42;
    const maxPoints = this.inputs.maxPoints ?? 10000;

    if (!volume || !volume.data) {
      this.outputs.positions = [];
      this.outputs.count = 0;
      return this.outputs;
    }

    const grid = volume instanceof VolumeGrid
      ? volume
      : new VolumeGrid(volume.resolution, volume.bounds, volume.data);

    const rng = new SeededRNG(seed);
    const positions: number[][] = [];

    // Volume bounds
    const minX = grid.bounds.min[0];
    const minY = grid.bounds.min[1];
    const minZ = grid.bounds.min[2];
    const rangeX = grid.bounds.max[0] - minX;
    const rangeY = grid.bounds.max[1] - minY;
    const rangeZ = grid.bounds.max[2] - minZ;

    // Find the maximum density value for rejection sampling normalization
    // We need this so that: random() < density_at_point / max_density
    let maxDensity = 0;
    for (let i = 0; i < grid.data.length; i++) {
      const val = Math.abs(grid.data[i]);
      if (val > maxDensity) maxDensity = val;
    }

    if (maxDensity === 0) {
      this.outputs.positions = [];
      this.outputs.count = 0;
      return this.outputs;
    }

    // Rejection sampling:
    // 1. Generate random point within volume bounds
    // 2. Sample density at that point
    // 3. Accept if random() < density * scaleFactor / maxDensity
    // The scaleFactor controls overall point density
    const scaleFactor = density / maxDensity;

    // Estimate number of attempts needed based on volume and density
    // With rejection sampling, acceptance rate ~ scaleFactor
    const volumeSize = rangeX * rangeY * rangeZ;
    const targetPoints = Math.min(
      Math.floor(density * volumeSize * scaleFactor),
      maxPoints,
    );

    // Adaptive attempt budget: we expect acceptance rate to be roughly scaleFactor
    // but we also need to account for the fact that density may be sparse
    const estimatedAttempts = Math.max(targetPoints * 3, targetPoints / Math.max(scaleFactor, 0.01));
    const maxAttempts = Math.min(estimatedAttempts, maxPoints * 100);

    let attempts = 0;

    while (positions.length < targetPoints && attempts < maxAttempts) {
      attempts++;

      // Random point in volume bounds
      const x = minX + rng.next() * rangeX;
      const y = minY + rng.next() * rangeY;
      const z = minZ + rng.next() * rangeZ;

      // Sample density at this point
      const localDensity = grid.sample(x, y, z);

      // Accept/reject based on density
      if (localDensity > 0 && rng.next() < localDensity * scaleFactor) {
        positions.push([x, y, z]);
      }
    }

    this.outputs.positions = positions;
    this.outputs.count = positions.length;

    return this.outputs;
  }
}

// ============================================================================
// Marching Cubes Implementation
// ============================================================================

/**
 * Generate a cache key for an edge vertex at a cell position.
 * Format: "cx,cy,cz,edgeIndex"
 */
function edgeCacheKey(
  cx: number, cy: number, cz: number,
  edgeIndex: number,
): string {
  return `${cx},${cy},${cz},${edgeIndex}`;
}

/**
 * Marching cubes isosurface extraction from a VolumeData grid.
 *
 * Iterates over all voxel cells, computes the configuration index
 * from the 8 corner values relative to the threshold, and generates
 * triangles using the standard edge/triangle lookup tables.
 *
 * Vertex positions are linearly interpolated along edges where the
 * isosurface crosses. Normals are estimated via central differences
 * of the volume data.
 *
 * @param volume - The input volume data
 * @param threshold - The isosurface threshold value
 * @param adaptivity - Adaptivity parameter (0 = uniform, higher = adaptive)
 *                     Currently reserved for future QEF-based simplification
 * @returns Geometry data with positions, normals, and triangle indices
 */
function marchingCubes(
  volume: VolumeData,
  threshold: number,
  _adaptivity: number = 0.0,
): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const res = volume.resolution;
  const bounds = volume.bounds;
  const voxelSize = volume.voxelSize;

  // We iterate over cells, so dimensions are (res-1) in each axis
  const cellsX = res[0] - 1;
  const cellsY = res[1] - 1;
  const cellsZ = res[2] - 1;

  if (cellsX <= 0 || cellsY <= 0 || cellsZ <= 0) {
    return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) };
  }

  // Pre-allocate output arrays (over-estimate, trim at the end)
  const maxVertices = cellsX * cellsY * cellsZ * 12; // worst case: 12 vertices per cell
  const positionBuffer = new Float32Array(maxVertices * 3);
  const normalBuffer = new Float32Array(maxVertices * 3);
  const indexBuffer = new Uint32Array(maxVertices * 3); // worst case

  let vertexCount = 0;
  let indexCount = 0;

  // Create a grid wrapper for gradient computation
  const grid = volume instanceof VolumeGrid
    ? volume
    : new VolumeGrid(volume.resolution, volume.bounds, volume.data);

  // Helper: get voxel value
  function voxelValue(ix: number, iy: number, iz: number): number {
    const cx = Math.max(0, Math.min(res[0] - 1, ix));
    const cy = Math.max(0, Math.min(res[1] - 1, iy));
    const cz = Math.max(0, Math.min(res[2] - 1, iz));
    return volume.data[cz * res[1] * res[0] + cy * res[0] + cx];
  }

  // Helper: world position of a voxel corner
  function cornerPosition(ix: number, iy: number, iz: number): [number, number, number] {
    return [
      bounds.min[0] + ix * voxelSize[0],
      bounds.min[1] + iy * voxelSize[1],
      bounds.min[2] + iz * voxelSize[2],
    ];
  }

  // Edge vertex cache to avoid duplicate vertices between adjacent cells.
  // Key: "x,y,z,edgeIndex", Value: vertex index
  const edgeVertexCache = new Map<string, number>();

  // Iterate over all cells
  for (let cz = 0; cz < cellsZ; cz++) {
    for (let cy = 0; cy < cellsY; cy++) {
      for (let cx = 0; cx < cellsX; cx++) {
        // Compute the 8 corner values for this cell
        const cornerValues: number[] = new Array(8);
        for (let v = 0; v < 8; v++) {
          const [dx, dy, dz] = CORNER_OFFSETS[v];
          cornerValues[v] = voxelValue(cx + dx, cy + dy, cz + dz);
        }

        // Compute configuration index: bit i is set if corner i >= threshold
        let configIndex = 0;
        for (let v = 0; v < 8; v++) {
          if (cornerValues[v] >= threshold) {
            configIndex |= (1 << v);
          }
        }

        // Check if this cell intersects the isosurface
        if (configIndex === 0 || configIndex === 255) continue;

        // Get the edge flags for this configuration
        const edgeFlags = EDGE_TABLE[configIndex];
        if (edgeFlags === 0) continue;

        // Compute intersection vertices on each active edge
        const edgeVertexIndices: (number | null)[] = new Array(12).fill(null);

        for (let edge = 0; edge < 12; edge++) {
          if ((edgeFlags & (1 << edge)) === 0) continue;

          // Check cache first
          const cacheKey = edgeCacheKey(cx, cy, cz, edge);
          const cached = edgeVertexCache.get(cacheKey);
          if (cached !== undefined) {
            edgeVertexIndices[edge] = cached;
            continue;
          }

          // Get the two vertices of this edge
          const v0 = EDGE_VERTICES[edge * 2];
          const v1 = EDGE_VERTICES[edge * 2 + 1];

          const [dx0, dy0, dz0] = CORNER_OFFSETS[v0];
          const [dx1, dy1, dz1] = CORNER_OFFSETS[v1];

          const val0 = cornerValues[v0];
          const val1 = cornerValues[v1];

          // Linear interpolation factor along the edge
          const denom = val1 - val0;
          const t = Math.abs(denom) > 1e-10
            ? (threshold - val0) / denom
            : 0.5;

          // Clamp t to [0, 1] for safety
          const tc = Math.max(0, Math.min(1, t));

          // Interpolated position
          const px = bounds.min[0] + ((cx + dx0) + tc * (dx1 - dx0)) * voxelSize[0];
          const py = bounds.min[1] + ((cy + dy0) + tc * (dy1 - dy0)) * voxelSize[1];
          const pz = bounds.min[2] + ((cz + dz0) + tc * (dz1 - dz0)) * voxelSize[2];

          // Compute normal via gradient at the interpolated position
          const grad = grid.gradient(px, py, pz);
          const gradLen = Math.sqrt(grad[0] * grad[0] + grad[1] * grad[1] + grad[2] * grad[2]);
          const invLen = gradLen > 1e-10 ? 1 / gradLen : 0;

          // Store vertex
          const vi = vertexCount;
          positionBuffer[vi * 3] = px;
          positionBuffer[vi * 3 + 1] = py;
          positionBuffer[vi * 3 + 2] = pz;
          normalBuffer[vi * 3] = grad[0] * invLen;
          normalBuffer[vi * 3 + 1] = grad[1] * invLen;
          normalBuffer[vi * 3 + 2] = grad[2] * invLen;

          edgeVertexIndices[edge] = vi;
          edgeVertexCache.set(cacheKey, vi);
          vertexCount++;

          // Also cache this vertex for the neighboring cell that shares this edge.
          // For edges that are shared with the next cell in +x, +y, or +z direction,
          // we can pre-populate the neighbor's cache.
          cacheSharedEdge(cx, cy, cz, edge, vi, edgeVertexCache, cellsX, cellsY, cellsZ);
        }

        // Generate triangles from the triangle table
        const tableBase = configIndex * 16;
        for (let tri = 0; tri < 16; tri += 3) {
          const e0 = TRIANGLE_TABLE[tableBase + tri];
          if (e0 === -1) break;

          const e1 = TRIANGLE_TABLE[tableBase + tri + 1];
          const e2 = TRIANGLE_TABLE[tableBase + tri + 2];

          const vi0 = edgeVertexIndices[e0];
          const vi1 = edgeVertexIndices[e1];
          const vi2 = edgeVertexIndices[e2];

          if (vi0 !== null && vi1 !== null && vi2 !== null) {
            indexBuffer[indexCount++] = vi0;
            indexBuffer[indexCount++] = vi1;
            indexBuffer[indexCount++] = vi2;
          }
        }
      }
    }
  }

  // Trim output arrays to actual size
  const positions = positionBuffer.slice(0, vertexCount * 3);
  const normals = normalBuffer.slice(0, vertexCount * 3);
  const indices = indexBuffer.slice(0, indexCount);

  return { positions, normals, indices };
}

/**
 * Cache shared edge vertices for neighboring cells.
 *
 * When we compute a vertex on an edge of cell (cx, cy, cz), the
 * same vertex will be needed by the adjacent cell on the other side
 * of that edge. We pre-populate the neighbor's cache entry so it
 * can reuse the vertex instead of creating a duplicate.
 */
function cacheSharedEdge(
  cx: number, cy: number, cz: number,
  edge: number, vertexIndex: number,
  cache: Map<string, number>,
  cellsX: number, cellsY: number, cellsZ: number,
): void {
  // Edge connectivity:
  // Edges 0,1,2,3 are on the bottom face (z = cz)
  // Edges 4,5,6,7 are on the top face (z = cz+1)
  // Edges 8,9,10,11 are vertical edges
  //
  // Edge 0: v0→v1 = (0,0,0)→(1,0,0) — shared with cell at (cx, cy-1, cz) if cy > 0
  // Edge 1: v1→v2 = (1,0,0)→(1,1,0) — shared with cell at (cx+1, cy, cz) if cx+1 < cellsX
  // Edge 2: v2→v3 = (1,1,0)→(0,1,0) — shared with cell at (cx, cy+1, cz) if cy+1 < cellsY
  // Edge 3: v3→v0 = (0,1,0)→(0,0,0) — shared with cell at (cx-1, cy, cz) if cx > 0
  // Edge 4: v4→v5 = (0,0,1)→(1,0,1) — shared with cell at (cx, cy-1, cz+1) ... etc
  //
  // For simplicity, we only cache the most important shared edges:
  // the ones along -x, -y, -z boundaries (i.e., edges that the current
  // cell "owns" that the next cell in +x/+y/+z direction will need).

  // Edge pairs that are shared between current cell and next cell in each direction:
  // +X neighbor: edge 3 (v3→v0) of current cell == edge 1 (v1→v2) of (cx+1,cy,cz) ... reversed
  // But it's simpler to just check the well-known shared edge mappings:

  // For edge on the +x face (edges 1, 5): neighbor at cx+1
  // For edge on the +y face (edges 2, 6): neighbor at cy+1
  // For edge on the +z face (edges 8-11): neighbor at cz+1

  // We'll use a simpler approach: for vertical edges (8-11), cache for z+1 neighbor
  // For horizontal edges, cache for the appropriate +x/+y neighbor

  switch (edge) {
    // Bottom face edges (z = cz)
    case 0: // (0,0,0)→(1,0,0) along X at y=0, z=0
      // Shared with cell at (cx, cy-1, cz) edge 2
      if (cy > 0) cache.set(edgeCacheKey(cx, cy - 1, cz, 2), vertexIndex);
      break;
    case 1: // (1,0,0)→(1,1,0) along Y at x=1, z=0
      // Shared with cell at (cx+1, cy, cz) edge 3
      if (cx + 1 < cellsX) cache.set(edgeCacheKey(cx + 1, cy, cz, 3), vertexIndex);
      break;
    case 2: // (1,1,0)→(0,1,0) along X at y=1, z=0
      // Shared with cell at (cx, cy+1, cz) edge 0
      if (cy + 1 < cellsY) cache.set(edgeCacheKey(cx, cy + 1, cz, 0), vertexIndex);
      break;
    case 3: // (0,1,0)→(0,0,0) along Y at x=0, z=0
      // Shared with cell at (cx-1, cy, cz) edge 1
      if (cx > 0) cache.set(edgeCacheKey(cx - 1, cy, cz, 1), vertexIndex);
      break;

    // Top face edges (z = cz+1)
    case 4: // (0,0,1)→(1,0,1) along X at y=0, z=1
      // Shared with cell at (cx, cy-1, cz) edge 6
      if (cy > 0) cache.set(edgeCacheKey(cx, cy - 1, cz, 6), vertexIndex);
      break;
    case 5: // (1,0,1)→(1,1,1) along Y at x=1, z=1
      // Shared with cell at (cx+1, cy, cz) edge 7
      if (cx + 1 < cellsX) cache.set(edgeCacheKey(cx + 1, cy, cz, 7), vertexIndex);
      break;
    case 6: // (1,1,1)→(0,1,1) along X at y=1, z=1
      // Shared with cell at (cx, cy+1, cz) edge 4
      if (cy + 1 < cellsY) cache.set(edgeCacheKey(cx, cy + 1, cz, 4), vertexIndex);
      break;
    case 7: // (0,1,1)→(0,0,1) along Y at x=0, z=1
      // Shared with cell at (cx-1, cy, cz) edge 5
      if (cx > 0) cache.set(edgeCacheKey(cx - 1, cy, cz, 5), vertexIndex);
      break;

    // Vertical edges (shared with cell at cz-1)
    case 8:  // (0,0,0)→(0,0,1)
      if (cz > 0) cache.set(edgeCacheKey(cx, cy, cz - 1, 10), vertexIndex);
      break;
    case 9:  // (1,0,0)→(1,0,1)
      if (cz > 0) cache.set(edgeCacheKey(cx, cy, cz - 1, 11), vertexIndex);
      break;
    case 10: // (1,1,0)→(1,1,1)
      if (cz > 0) cache.set(edgeCacheKey(cx, cy, cz - 1, 8), vertexIndex);
      break;
    case 11: // (0,1,0)→(0,1,1)
      if (cz > 0) cache.set(edgeCacheKey(cx, cy, cz - 1, 9), vertexIndex);
      break;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createVolumeToMeshNode(inputs?: VolumeToMeshInputs): VolumeToMeshNode {
  return new VolumeToMeshNode(inputs);
}

export function createSampleVolumeNode(inputs?: SampleVolumeInputs): SampleVolumeNode {
  return new SampleVolumeNode(inputs);
}

export function createVolumeInfoNode(inputs?: VolumeInfoInputs): VolumeInfoNode {
  return new VolumeInfoNode(inputs);
}

/** @deprecated Use createVolumeInfoNode instead */
export function createVolumeAttributeStatsNode(inputs?: VolumeAttributeStatsInputs): VolumeInfoNode {
  return new VolumeInfoNode(inputs);
}

export function createDensityToAlphaNode(inputs?: DensityToAlphaInputs): DensityToAlphaNode {
  return new DensityToAlphaNode(inputs);
}

export function createVolumeDistributeNode(inputs?: VolumeDistributeInputs): VolumeDistributeNode {
  return new VolumeDistributeNode(inputs);
}
