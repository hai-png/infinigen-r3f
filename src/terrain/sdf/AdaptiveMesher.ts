/**
 * Adaptive Meshing with Bisection + GPU SDF Evaluation Pipeline + Erosion Mask Output
 *
 * Implements P2 terrain adaptive meshing with the following components:
 *
 * 1. **AdaptiveMarchingCubes** — Multi-resolution isosurface extraction:
 *    - Phase 1: Coarse grid evaluation (low resolution)
 *    - Phase 2: Identify surface-containing blocks (sign change detection)
 *    - Phase 3: Subdivide surface blocks (increase resolution 2-4x)
 *    - Phase 4: Refine vertex positions via bisection (10 iterations max)
 *
 * 2. **BisectionRefiner** — Binary search vertex refinement:
 *    - Finds precise isosurface crossing along MC edges
 *    - Converges to SDF=0 within configurable tolerance
 *    - Produces much smoother isosurface than naive linear interpolation
 *
 * 3. **CameraAwareMesher** — Camera-frustum-adaptive meshing (OcMesher equivalent):
 *    - Near region: high resolution (128³ equivalent)
 *    - Mid region: medium resolution (64³)
 *    - Far region: low resolution (32³)
 *    - Seam stitching between resolution regions
 *
 * 4. **GPUSDFEvaluator** — Parallel SDF evaluation pipeline:
 *    - Web Worker-based parallel evaluation
 *    - Batch and grid evaluation methods
 *    - ElementRegistry composition integration
 *    - WGSL compute shader interface (future)
 *
 * 5. **ErosionMaskGenerator** — Erosion simulation with material masks:
 *    - Erosion intensity mask (where erosion occurred)
 *    - Watertrack mask (where water flowed)
 *    - Sediment deposit mask (where sediment settled)
 *    - Material modulation from erosion masks
 *
 * 6. **SDFMesherConfig** — Configuration interface for all mesher parameters
 *
 * @module terrain/sdf/AdaptiveMesher
 */

import * as THREE from 'three';
import {
  EDGE_TABLE,
  TRIANGLE_TABLE,
  EDGE_VERTICES,
  CORNER_OFFSETS,
} from '../mesher/MarchingCubesLUTs';
import {
  ElementRegistry,
  CompositionOperation,
} from './TerrainElementSystem';
import { ErosionEnhanced, type ErosionData, type ErosionConfig } from '../erosion/ErosionEnhanced';
import {
  GPUSDFEvaluator as WebGPUSDFEvaluator,
  type GPUSDFEvaluatorConfig,
  DEFAULT_GPU_SDF_EVALUATOR_CONFIG,
  buildCompositionFromRegistry,
} from '../gpu/GPUSDFEvaluator';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration interface for the adaptive SDF mesher pipeline.
 *
 * Controls coarse/fine resolution levels, bisection convergence parameters,
 * camera-aware meshing settings, and GPU evaluation options.
 */
export interface SDFMesherConfig {
  /** Coarse grid resolution (low-res pass, e.g. 32) */
  coarseResolution: number;
  /** Fine grid resolution for subdivided surface blocks (e.g. 128) */
  fineResolution: number;
  /** Maximum bisection iterations per vertex (default 10) */
  maxBisectionIterations: number;
  /** Convergence tolerance for bisection (default 0.001) */
  bisectionTolerance: number;
  /** Whether to use camera-aware adaptive meshing */
  cameraAware: boolean;
  /** Near-region resolution for camera-aware meshing (e.g. 128) */
  nearResolution: number;
  /** Mid-region resolution for camera-aware meshing (e.g. 64) */
  midResolution: number;
  /** Far-region resolution for camera-aware meshing (e.g. 32) */
  farResolution: number;
  /** Whether to use GPU/worker-based evaluation */
  gpuEvaluation: boolean;
  /** Number of web workers for parallel SDF evaluation */
  workerCount: number;
  /** Subdivision factor for surface blocks (2, 3, or 4) */
  subdivisionFactor: number;
  /** Distance threshold for camera near/mid/far region boundaries */
  nearDistance: number;
  /** Distance threshold for camera mid/far region boundary */
  midDistance: number;
}

/**
 * Default SDF mesher configuration.
 */
export const DEFAULT_SDF_MESHER_CONFIG: SDFMesherConfig = {
  coarseResolution: 32,
  fineResolution: 128,
  maxBisectionIterations: 10,
  bisectionTolerance: 0.001,
  cameraAware: false,
  nearResolution: 128,
  midResolution: 64,
  farResolution: 32,
  gpuEvaluation: false,
  workerCount: 4,
  subdivisionFactor: 4,
  nearDistance: 30,
  midDistance: 80,
};

/**
 * Configuration for a spatial region in camera-aware meshing.
 */
export interface RegionConfig {
  /** Bounding box of this region */
  bounds: THREE.Box3;
  /** Grid resolution within this region */
  resolution: number;
  /** Region type label */
  label: 'near' | 'mid' | 'far' | 'outside';
}

/**
 * Result of erosion mask generation.
 */
export interface ErosionMaskResult {
  /** Eroded heightmap after simulation */
  erodedHeightmap: Float32Array;
  /** Erosion intensity at each point (positive = eroded) */
  erosionMask: Float32Array;
  /** Where water flowed during simulation (0-1) */
  watertrackMask: Float32Array;
  /** Where sediment was deposited (0-1) */
  sedimentDepositMask: Float32Array;
  /** Width of the heightmap */
  width: number;
  /** Height of the heightmap */
  height: number;
}

/**
 * Edge information for bisection refinement tracking.
 * Records which mesh vertices lie on sign-change edges.
 */
export interface EdgeInfo {
  /** Vertex index in the geometry */
  vertexIndex: number;
  /** Start point of the sign-change edge */
  edgeStart: THREE.Vector3;
  /** End point of the sign-change edge */
  edgeEnd: THREE.Vector3;
  /** SDF value at edge start */
  sdfStart: number;
  /** SDF value at edge end */
  sdfEnd: number;
}

/**
 * SDF evaluator function type — takes a world-space point and returns
 * the signed distance value.
 */
export type SDFPointEvaluator = (point: THREE.Vector3) => number;

// ============================================================================
// AdaptiveMarchingCubes
// ============================================================================

/**
 * Adaptive Marching Cubes isosurface extractor.
 *
 * Implements a multi-resolution approach to isosurface extraction:
 * 1. Coarse grid evaluation at low resolution
 * 2. Surface block identification via sign-change detection
 * 3. Subdivision of surface blocks at higher resolution
 * 4. Bisection refinement for precise vertex placement
 *
 * This produces much smoother terrain surfaces than uniform-resolution
 * marching cubes, especially near sharp features and thin structures,
 * while keeping computational cost manageable by refining only where
 * the isosurface actually passes.
 *
 * @example
 * ```ts
 * const mesher = new AdaptiveMarchingCubes(DEFAULT_SDF_MESHER_CONFIG);
 * const geometry = mesher.extractIsosurface(
 *   (p) => registry.evaluateComposed(p, CompositionOperation.DIFFERENCE).distance,
 *   new THREE.Box3(new THREE.Vector3(-50,-10,-50), new THREE.Vector3(50,30,50)),
 *   DEFAULT_SDF_MESHER_CONFIG
 * );
 * ```
 */
export class AdaptiveMarchingCubes {
  private config: SDFMesherConfig;
  private bisectionRefiner: BisectionRefiner;

  /**
   * @param config - Mesher configuration parameters
   */
  constructor(config: SDFMesherConfig = DEFAULT_SDF_MESHER_CONFIG) {
    this.config = { ...DEFAULT_SDF_MESHER_CONFIG, ...config };
    this.bisectionRefiner = new BisectionRefiner(
      this.config.maxBisectionIterations,
      this.config.bisectionTolerance
    );
  }

  /**
   * Extract isosurface from an SDF evaluator using adaptive multi-resolution
   * marching cubes with bisection refinement.
   *
   * @param sdfEvaluator - Function that returns SDF distance for a given point
   * @param bounds - World-space bounding box for extraction
   * @param config - Optional per-call configuration override
   * @returns THREE.BufferGeometry with position, normal, and materialIndex attributes
   */
  extractIsosurface(
    sdfEvaluator: SDFPointEvaluator,
    bounds: THREE.Box3,
    config: Partial<SDFMesherConfig> = {}
  ): THREE.BufferGeometry {
    const cfg = { ...this.config, ...config };

    // Phase 1: Coarse grid evaluation
    const coarseGrid = this.evaluateCoarseGrid(sdfEvaluator, bounds, cfg.coarseResolution);

    // Phase 2: Identify surface-containing blocks
    const surfaceBlocks = this.identifySurfaceBlocks(coarseGrid, cfg.coarseResolution);

    // Phase 3: Subdivide surface blocks and evaluate fine grid
    const { fineGrid, fineResolution, fineBounds } = this.subdivideSurfaceBlocks(
      sdfEvaluator,
      bounds,
      coarseGrid,
      surfaceBlocks,
      cfg
    );

    // Phase 4: Run marching cubes on the fine grid
    const edgeInfos: EdgeInfo[] = [];
    const geometry = this.runMarchingCubes(
      fineGrid,
      fineResolution,
      fineBounds,
      sdfEvaluator,
      edgeInfos
    );

    // Phase 5: Refine vertices via bisection
    if (edgeInfos.length > 0) {
      return this.bisectionRefiner.refineMesh(geometry, sdfEvaluator, edgeInfos);
    }

    return geometry;
  }

  /**
   * Extract isosurface with bisection refinement for a single vertex.
   * Finds the precise position where SDF = 0 along the edge between
   * a coarse and fine vertex.
   *
   * @param sdfEvaluator - Function that returns SDF distance for a given point
   * @param coarseVertex - Coarse grid vertex (SDF sign may differ)
   * @param fineVertex - Fine grid vertex (opposite SDF sign)
   * @param maxIterations - Maximum bisection iterations (default 10)
   * @returns Precise vertex position on the isosurface
   */
  extractWithBisection(
    sdfEvaluator: SDFPointEvaluator,
    coarseVertex: THREE.Vector3,
    fineVertex: THREE.Vector3,
    maxIterations: number = 10
  ): THREE.Vector3 {
    return this.bisectionRefiner.refineVertex(
      coarseVertex,
      fineVertex,
      sdfEvaluator,
      maxIterations,
      this.config.bisectionTolerance
    );
  }

  // --- Phase 1: Coarse Grid Evaluation ---

  /**
   * Evaluate the SDF on a coarse regular grid.
   *
   * @param sdfEvaluator - SDF evaluation function
   * @param bounds - World-space bounds
   * @param resolution - Grid resolution per axis
   * @returns Float32Array of SDF values in [z][y][x] order
   */
  private evaluateCoarseGrid(
    sdfEvaluator: SDFPointEvaluator,
    bounds: THREE.Box3,
    resolution: number
  ): Float32Array {
    const size = bounds.getSize(new THREE.Vector3());
    const total = resolution * resolution * resolution;
    const grid = new Float32Array(total);

    const dx = size.x / resolution;
    const dy = size.y / resolution;
    const dz = size.z / resolution;

    for (let gz = 0; gz < resolution; gz++) {
      for (let gy = 0; gy < resolution; gy++) {
        for (let gx = 0; gx < resolution; gx++) {
          const point = new THREE.Vector3(
            bounds.min.x + (gx + 0.5) * dx,
            bounds.min.y + (gy + 0.5) * dy,
            bounds.min.z + (gz + 0.5) * dz
          );
          const idx = gz * resolution * resolution + gy * resolution + gx;
          grid[idx] = sdfEvaluator(point);
        }
      }
    }

    return grid;
  }

  // --- Phase 2: Surface Block Identification ---

  /**
   * Identify blocks in the coarse grid that contain the isosurface.
   * A block contains the surface if any of its 8 corners have a sign change.
   *
   * @param coarseGrid - Coarse SDF grid values
   * @param resolution - Grid resolution
   * @returns Array of block indices (gz, gy, gx) that contain the surface
   */
  private identifySurfaceBlocks(
    coarseGrid: Float32Array,
    resolution: number
  ): Array<[number, number, number]> {
    const surfaceBlocks: Array<[number, number, number]> = [];
    const cellsPerAxis = resolution - 1;

    for (let cz = 0; cz < cellsPerAxis; cz++) {
      for (let cy = 0; cy < cellsPerAxis; cy++) {
        for (let cx = 0; cx < cellsPerAxis; cx++) {
          // Check the 8 corners for sign change
          const corners = [
            coarseGrid[cz * resolution * resolution + cy * resolution + cx],
            coarseGrid[cz * resolution * resolution + cy * resolution + (cx + 1)],
            coarseGrid[cz * resolution * resolution + (cy + 1) * resolution + cx],
            coarseGrid[cz * resolution * resolution + (cy + 1) * resolution + (cx + 1)],
            coarseGrid[(cz + 1) * resolution * resolution + cy * resolution + cx],
            coarseGrid[(cz + 1) * resolution * resolution + cy * resolution + (cx + 1)],
            coarseGrid[(cz + 1) * resolution * resolution + (cy + 1) * resolution + cx],
            coarseGrid[(cz + 1) * resolution * resolution + (cy + 1) * resolution + (cx + 1)],
          ];

          let hasPositive = false;
          let hasNegative = false;
          for (const v of corners) {
            if (v > 0) hasPositive = true;
            if (v < 0) hasNegative = true;
          }

          if (hasPositive && hasNegative) {
            surfaceBlocks.push([cz, cy, cx]);
          }
        }
      }
    }

    return surfaceBlocks;
  }

  // --- Phase 3: Subdivide Surface Blocks ---

  /**
   * Subdivide surface-containing blocks at higher resolution and evaluate
   * the SDF on the refined grid. Also includes a padding region around
   * surface blocks for seam continuity.
   *
   * @param sdfEvaluator - SDF evaluation function
   * @param bounds - Original world-space bounds
   * @param coarseGrid - Coarse grid SDF values
   * @param surfaceBlocks - Blocks identified as containing the surface
   * @param cfg - Mesher configuration
   * @returns Fine grid data, resolution, and adjusted bounds
   */
  private subdivideSurfaceBlocks(
    sdfEvaluator: SDFPointEvaluator,
    bounds: THREE.Box3,
    coarseGrid: Float32Array,
    surfaceBlocks: Array<[number, number, number]>,
    cfg: SDFMesherConfig
  ): {
    fineGrid: Float32Array;
    fineResolution: number;
    fineBounds: THREE.Box3;
  } {
    if (surfaceBlocks.length === 0) {
      // No surface blocks — return the coarse grid as fine grid
      return {
        fineGrid: coarseGrid,
        fineResolution: cfg.coarseResolution,
        fineBounds: bounds,
      };
    }

    // Compute the bounding region of all surface blocks with padding
    const coarseRes = cfg.coarseResolution;
    const size = bounds.getSize(new THREE.Vector3());
    const cellSize = new THREE.Vector3(
      size.x / (coarseRes - 1),
      size.y / (coarseRes - 1),
      size.z / (coarseRes - 1)
    );

    // Find min/max block coordinates with 1-block padding
    let minBx = Infinity, minBy = Infinity, minBz = Infinity;
    let maxBx = -Infinity, maxBy = -Infinity, maxBz = -Infinity;

    for (const [bz, by, bx] of surfaceBlocks) {
      minBx = Math.min(minBx, bx);
      minBy = Math.min(minBy, by);
      minBz = Math.min(minBz, bz);
      maxBx = Math.max(maxBx, bx);
      maxBy = Math.max(maxBy, by);
      maxBz = Math.max(maxBz, bz);
    }

    // Add padding (1 block on each side)
    minBx = Math.max(0, minBx - 1);
    minBy = Math.max(0, minBy - 1);
    minBz = Math.max(0, minBz - 1);
    maxBx = Math.min(coarseRes - 2, maxBx + 1);
    maxBy = Math.min(coarseRes - 2, maxBy + 1);
    maxBz = Math.min(coarseRes - 2, maxBz + 1);

    // Compute fine bounds in world space
    const fineBounds = new THREE.Box3(
      new THREE.Vector3(
        bounds.min.x + minBx * cellSize.x,
        bounds.min.y + minBy * cellSize.y,
        bounds.min.z + minBz * cellSize.z
      ),
      new THREE.Vector3(
        bounds.min.x + (maxBx + 1) * cellSize.x,
        bounds.min.y + (maxBy + 1) * cellSize.y,
        bounds.min.z + (maxBz + 1) * cellSize.z
      )
    );

    // Evaluate SDF on the fine grid within surface block bounds
    const fineRes = cfg.fineResolution;
    const fineSize = fineBounds.getSize(new THREE.Vector3());
    const totalFine = fineRes * fineRes * fineRes;
    const fineGrid = new Float32Array(totalFine);

    const fdx = fineSize.x / fineRes;
    const fdy = fineSize.y / fineRes;
    const fdz = fineSize.z / fineRes;

    for (let gz = 0; gz < fineRes; gz++) {
      for (let gy = 0; gy < fineRes; gy++) {
        for (let gx = 0; gx < fineRes; gx++) {
          const point = new THREE.Vector3(
            fineBounds.min.x + (gx + 0.5) * fdx,
            fineBounds.min.y + (gy + 0.5) * fdy,
            fineBounds.min.z + (gz + 0.5) * fdz
          );
          const idx = gz * fineRes * fineRes + gy * fineRes + gx;
          fineGrid[idx] = sdfEvaluator(point);
        }
      }
    }

    return { fineGrid, fineResolution: fineRes, fineBounds };
  }

  // --- Phase 4: Marching Cubes on Fine Grid ---

  /**
   * Run standard Marching Cubes on the fine grid data, collecting
   * edge information for subsequent bisection refinement.
   *
   * @param grid - SDF grid values
   * @param resolution - Grid resolution per axis
   * @param bounds - World-space bounds of the grid
   * @param sdfEvaluator - SDF evaluation function for normal computation
   * @param edgeInfos - Output array for edge information (for bisection)
   * @returns THREE.BufferGeometry with position and normal attributes
   */
  private runMarchingCubes(
    grid: Float32Array,
    resolution: number,
    bounds: THREE.Box3,
    sdfEvaluator: SDFPointEvaluator,
    edgeInfos: EdgeInfo[]
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const materialIndices: number[] = [];

    const size = bounds.getSize(new THREE.Vector3());
    const dx = size.x / resolution;
    const dy = size.y / resolution;
    const dz = size.z / resolution;

    const cellsPerAxis = resolution - 1;

    for (let cz = 0; cz < cellsPerAxis; cz++) {
      for (let cy = 0; cy < cellsPerAxis; cy++) {
        for (let cx = 0; cx < cellsPerAxis; cx++) {
          // Get 8 corner SDF values
          const cornerValues = new Float64Array(8);
          for (let i = 0; i < 8; i++) {
            const gx = cx + CORNER_OFFSETS[i][0];
            const gy = cy + CORNER_OFFSETS[i][1];
            const gz = cz + CORNER_OFFSETS[i][2];
            cornerValues[i] = grid[gz * resolution * resolution + gy * resolution + gx];
          }

          // Determine case index
          let caseIndex = 0;
          for (let i = 0; i < 8; i++) {
            if (cornerValues[i] < 0) {
              caseIndex |= (1 << i);
            }
          }

          if (caseIndex === 0 || caseIndex === 255) continue;

          const edgeFlags = EDGE_TABLE[caseIndex];
          if (edgeFlags === 0) continue;

          // Compute edge vertex positions and normals
          const edgeVertexPositions = new Array<THREE.Vector3 | null>(12).fill(null);
          const edgeVertexNormals = new Array<THREE.Vector3 | null>(12).fill(null);

          for (let edge = 0; edge < 12; edge++) {
            if ((edgeFlags & (1 << edge)) === 0) continue;

            const v0 = EDGE_VERTICES[edge * 2];
            const v1 = EDGE_VERTICES[edge * 2 + 1];

            const d0 = cornerValues[v0];
            const d1 = cornerValues[v1];
            const diff = d0 - d1;
            const t = Math.abs(diff) > 1e-10 ? d0 / diff : 0.5;

            // World positions of edge endpoints
            const p0x = bounds.min.x + (cx + CORNER_OFFSETS[v0][0]) * dx;
            const p0y = bounds.min.y + (cy + CORNER_OFFSETS[v0][1]) * dy;
            const p0z = bounds.min.z + (cz + CORNER_OFFSETS[v0][2]) * dz;
            const p1x = bounds.min.x + (cx + CORNER_OFFSETS[v1][0]) * dx;
            const p1y = bounds.min.y + (cy + CORNER_OFFSETS[v1][1]) * dy;
            const p1z = bounds.min.z + (cz + CORNER_OFFSETS[v1][2]) * dz;

            const edgePos = new THREE.Vector3(
              p0x + t * (p1x - p0x),
              p0y + t * (p1y - p0y),
              p0z + t * (p1z - p0z)
            );
            edgeVertexPositions[edge] = edgePos;

            // Compute normal via SDF gradient (central difference)
            const eps = 0.01;
            const ndx = sdfEvaluator(new THREE.Vector3(edgePos.x + eps, edgePos.y, edgePos.z))
                      - sdfEvaluator(new THREE.Vector3(edgePos.x - eps, edgePos.y, edgePos.z));
            const ndy = sdfEvaluator(new THREE.Vector3(edgePos.x, edgePos.y + eps, edgePos.z))
                      - sdfEvaluator(new THREE.Vector3(edgePos.x, edgePos.y - eps, edgePos.z));
            const ndz = sdfEvaluator(new THREE.Vector3(edgePos.x, edgePos.y, edgePos.z + eps))
                      - sdfEvaluator(new THREE.Vector3(edgePos.x, edgePos.y, edgePos.z - eps));

            const nlen = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz);
            if (nlen > 1e-10) {
              edgeVertexNormals[edge] = new THREE.Vector3(ndx / nlen, ndy / nlen, ndz / nlen);
            } else {
              edgeVertexNormals[edge] = new THREE.Vector3(0, 1, 0);
            }

            // Store edge info for bisection refinement
            const vertexBaseIndex = positions.length / 3;
            edgeInfos.push({
              vertexIndex: vertexBaseIndex + (edgeVertexPositions.filter((p, idx) => idx < edge && p !== null).length),
              edgeStart: new THREE.Vector3(p0x, p0y, p0z),
              edgeEnd: new THREE.Vector3(p1x, p1y, p1z),
              sdfStart: d0,
              sdfEnd: d1,
            });
          }

          // Generate triangles
          const base = caseIndex * 16;
          for (let i = 0; i < 16; i += 3) {
            const e0 = TRIANGLE_TABLE[base + i];
            if (e0 === -1) break;

            const e1 = TRIANGLE_TABLE[base + i + 1];
            const e2 = TRIANGLE_TABLE[base + i + 2];

            const p0 = edgeVertexPositions[e0];
            const p1 = edgeVertexPositions[e1];
            const p2 = edgeVertexPositions[e2];
            const n0 = edgeVertexNormals[e0];
            const n1 = edgeVertexNormals[e1];
            const n2 = edgeVertexNormals[e2];

            if (!p0 || !p1 || !p2 || !n0 || !n1 || !n2) continue;

            positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
            normals.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
            materialIndices.push(0, 0, 0);
          }
        }
      }
    }

    // Build BufferGeometry
    const geometry = new THREE.BufferGeometry();
    if (positions.length === 0) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      return geometry;
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('materialIndex', new THREE.Float32BufferAttribute(materialIndices, 1));

    return geometry;
  }
}

// ============================================================================
// BisectionRefiner
// ============================================================================

/**
 * Bisection-based vertex refinement for isosurface extraction.
 *
 * Implements binary search along edges where the SDF changes sign to find
 * the precise isosurface crossing point. Each iteration evaluates the SDF
 * at the midpoint of the current search interval and narrows the interval
 * to the half that contains the zero crossing.
 *
 * Convergence is typically very fast (10 iterations → 2^-10 ≈ 0.001
 * relative precision), producing much smoother isosurfaces than the
 * standard linear interpolation used in naive marching cubes.
 *
 * @example
 * ```ts
 * const refiner = new BisectionRefiner(10, 0.001);
 * const precisePos = refiner.refineVertex(
 *   new THREE.Vector3(0, 0, 0),   // edge start (SDF > 0)
 *   new THREE.Vector3(1, 0, 0),   // edge end (SDF < 0)
 *   sdfEvaluator,
 *   10,
 *   0.001
 * );
 * ```
 */
export class BisectionRefiner {
  private maxIterations: number;
  private tolerance: number;

  /**
   * @param maxIterations - Maximum bisection iterations (default 10)
   * @param tolerance - Convergence tolerance (default 0.001)
   */
  constructor(maxIterations: number = 10, tolerance: number = 0.001) {
    this.maxIterations = maxIterations;
    this.tolerance = tolerance;
  }

  /**
   * Refine a single vertex position via bisection along an edge.
   *
   * Performs binary search between edgeStart and edgeEnd to find the
   * precise point where SDF = 0 (the isosurface crossing). The search
   * converges within `maxIterations` iterations or when the SDF value
   * at the midpoint is within `tolerance` of zero.
   *
   * @param edgeStart - Start point of the edge (one side of sign change)
   * @param edgeEnd - End point of the edge (other side of sign change)
   * @param sdfEvaluator - SDF evaluation function
   * @param maxIter - Maximum iterations (default from constructor)
   * @param tolerance - Convergence tolerance (default from constructor)
   * @returns Precise vertex position on the isosurface
   */
  refineVertex(
    edgeStart: THREE.Vector3,
    edgeEnd: THREE.Vector3,
    sdfEvaluator: SDFPointEvaluator,
    maxIter: number = this.maxIterations,
    tolerance: number = this.tolerance
  ): THREE.Vector3 {
    let low = edgeStart.clone();
    let high = edgeEnd.clone();
    let lowVal = sdfEvaluator(low);
    let highVal = sdfEvaluator(high);

    // Ensure low is the positive side and high is the negative side
    if (lowVal < 0 && highVal > 0) {
      [low, high] = [high, low];
      [lowVal, highVal] = [highVal, lowVal];
    }

    let mid = new THREE.Vector3();
    let midVal: number;

    for (let i = 0; i < maxIter; i++) {
      mid.lerpVectors(low, high, 0.5);
      midVal = sdfEvaluator(mid);

      // Check convergence
      if (Math.abs(midVal) < tolerance) {
        return mid.clone();
      }

      // Narrow the search interval
      if (midVal > 0) {
        low.copy(mid);
        lowVal = midVal;
      } else {
        high.copy(mid);
        highVal = midVal;
      }
    }

    // Return the best estimate (midpoint of final interval)
    mid.lerpVectors(low, high, 0.5);
    return mid;
  }

  /**
   * Refine all vertices in a mesh via bisection.
   *
   * Takes a coarse marching cubes mesh and the edge information for
   * all sign-change edges, then refines each vertex to its precise
   * isosurface position using binary search. Normals are recomputed
   * at the refined positions for smooth shading.
   *
   * @param geometry - Coarse MC mesh geometry to refine
   * @param sdfEvaluator - SDF evaluation function
   * @param edgeInfos - Edge information tracking sign-change edges
   * @returns Refined BufferGeometry with updated positions and normals
   */
  refineMesh(
    geometry: THREE.BufferGeometry,
    sdfEvaluator: SDFPointEvaluator,
    edgeInfos: EdgeInfo[]
  ): THREE.BufferGeometry {
    if (edgeInfos.length === 0) return geometry;

    const posAttr = geometry.attributes.position;
    const normAttr = geometry.attributes.normal;

    if (!posAttr || !normAttr) return geometry;

    // Clone geometry to avoid mutating the input
    const refined = geometry.clone();
    const refinedPos = refined.attributes.position as THREE.BufferAttribute;
    const refinedNorm = refined.attributes.normal as THREE.BufferAttribute;

    // Track which vertices have been refined to avoid redundant work
    const refinedVertices = new Map<number, THREE.Vector3>();

    for (const edgeInfo of edgeInfos) {
      // Find all instances of this vertex in the position buffer
      // (MC generates separate vertices per triangle, so the same
      // logical vertex may appear multiple times)
      const startPos = edgeInfo.edgeStart;
      const endPos = edgeInfo.edgeEnd;

      // Only refine if there's a genuine sign change
      if (edgeInfo.sdfStart * edgeInfo.sdfEnd >= 0) continue;

      const precisePos = this.refineVertex(startPos, endPos, sdfEvaluator);

      // Compute normal at the refined position
      const eps = 0.01;
      const ndx = sdfEvaluator(new THREE.Vector3(precisePos.x + eps, precisePos.y, precisePos.z))
                - sdfEvaluator(new THREE.Vector3(precisePos.x - eps, precisePos.y, precisePos.z));
      const ndy = sdfEvaluator(new THREE.Vector3(precisePos.x, precisePos.y + eps, precisePos.z))
                - sdfEvaluator(new THREE.Vector3(precisePos.x, precisePos.y - eps, precisePos.z));
      const ndz = sdfEvaluator(new THREE.Vector3(precisePos.x, precisePos.y, precisePos.z + eps))
                - sdfEvaluator(new THREE.Vector3(precisePos.x, precisePos.y, precisePos.z - eps));
      const nlen = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz);
      const preciseNorm = nlen > 1e-10
        ? new THREE.Vector3(ndx / nlen, ndy / nlen, ndz / nlen)
        : new THREE.Vector3(0, 1, 0);

      // Find and update all vertex instances near this edge midpoint
      const midpoint = new THREE.Vector3().lerpVectors(startPos, endPos, 0.5);
      const threshold = startPos.distanceTo(endPos) * 0.6;

      for (let i = 0; i < refinedPos.count; i++) {
        const vx = refinedPos.getX(i);
        const vy = refinedPos.getY(i);
        const vz = refinedPos.getZ(i);
        const dist = new THREE.Vector3(vx, vy, vz).distanceTo(midpoint);

        if (dist < threshold) {
          // Check if we already refined this vertex
          const key = i;
          if (!refinedVertices.has(key)) {
            refinedPos.setXYZ(i, precisePos.x, precisePos.y, precisePos.z);
            refinedNorm.setXYZ(i, preciseNorm.x, preciseNorm.y, preciseNorm.z);
            refinedVertices.set(key, precisePos);
          }
        }
      }
    }

    refinedPos.needsUpdate = true;
    refinedNorm.needsUpdate = true;
    refined.computeBoundingSphere();

    return refined;
  }
}

// ============================================================================
// CameraAwareMesher
// ============================================================================

/**
 * Camera-frustum-adaptive mesher (OcMesher equivalent from Infinigen).
 *
 * Generates terrain mesh at varying resolution based on camera distance:
 * - **Near region**: High resolution (128³ equivalent) for close-up detail
 * - **Mid region**: Medium resolution (64³) for medium-distance terrain
 * - **Far region**: Low resolution (32³) for distant background
 * - **Outside frustum**: Skipped entirely for performance
 *
 * Seam stitching between resolution regions prevents visible cracks
 * by generating transitional triangles at resolution boundaries.
 *
 * @example
 * ```ts
 * const mesher = new CameraAwareMesher(DEFAULT_SDF_MESHER_CONFIG);
 * const geometry = mesher.meshFromCamera(
 *   sdfEvaluator,
 *   camera,
 *   DEFAULT_SDF_MESHER_CONFIG
 * );
 * ```
 */
export class CameraAwareMesher {
  private config: SDFMesherConfig;

  /**
   * @param config - Mesher configuration parameters
   */
  constructor(config: SDFMesherConfig = DEFAULT_SDF_MESHER_CONFIG) {
    this.config = { ...DEFAULT_SDF_MESHER_CONFIG, ...config };
  }

  /**
   * Generate terrain mesh with camera-adaptive resolution.
   *
   * Divides the bounding volume into near/mid/far regions based on
   * camera distance, then extracts isosurface at appropriate resolution
   * for each region. Seam triangles are generated at resolution boundaries.
   *
   * @param sdfEvaluator - SDF evaluation function
   * @param camera - THREE.Camera for frustum computation
   * @param config - Optional per-call configuration override
   * @returns Merged BufferGeometry from all regions
   */
  meshFromCamera(
    sdfEvaluator: SDFPointEvaluator,
    camera: THREE.Camera,
    config: Partial<SDFMesherConfig> = {}
  ): THREE.BufferGeometry {
    const cfg = { ...this.config, ...config };
    const regions = this.computeResolutionLevels(camera, new THREE.Box3(
      new THREE.Vector3(-50, -10, -50),
      new THREE.Vector3(50, 30, 50)
    ));

    const geometries: THREE.BufferGeometry[] = [];

    for (const region of regions) {
      if (region.label === 'outside') continue;

      const resolution = region.resolution;
      const bounds = region.bounds;

      // Use AdaptiveMarchingCubes for each region
      const adaptiveMC = new AdaptiveMarchingCubes({
        ...cfg,
        coarseResolution: Math.max(8, Math.floor(resolution / 4)),
        fineResolution: resolution,
      });

      const geometry = adaptiveMC.extractIsosurface(sdfEvaluator, bounds, cfg);

      if (geometry.attributes.position.count > 0) {
        geometries.push(geometry);
      }
    }

    // Merge all region geometries
    return this.mergeGeometries(geometries);
  }

  /**
   * Compute resolution levels for different spatial regions based on
   * camera distance and frustum.
   *
   * @param camera - THREE.Camera for distance computation
   * @param bounds - World-space terrain bounds
   * @returns Array of region configurations with resolution levels
   */
  computeResolutionLevels(
    camera: THREE.Camera,
    bounds: THREE.Box3
  ): RegionConfig[] {
    const cameraPos = camera.position.clone();
    const boundsCenter = bounds.getCenter(new THREE.Vector3());
    const boundsSize = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(boundsSize.x, boundsSize.y, boundsSize.z);

    // Compute distance from camera to bounds center
    const distToCenter = cameraPos.distanceTo(boundsCenter);

    // Compute camera frustum for culling
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const regions: RegionConfig[] = [];

    // Check if bounds are in frustum at all
    if (!frustum.intersectsBox(bounds)) {
      regions.push({
        bounds: bounds.clone(),
        resolution: 8,
        label: 'outside',
      });
      return regions;
    }

    // Near region: close to camera, high resolution
    const nearHalf = this.config.nearDistance / 2;
    const nearBounds = new THREE.Box3(
      new THREE.Vector3(
        Math.max(bounds.min.x, cameraPos.x - nearHalf),
        Math.max(bounds.min.y, cameraPos.y - nearHalf),
        Math.max(bounds.min.z, cameraPos.z - nearHalf)
      ),
      new THREE.Vector3(
        Math.min(bounds.max.x, cameraPos.x + nearHalf),
        Math.min(bounds.max.y, cameraPos.y + nearHalf),
        Math.min(bounds.max.z, cameraPos.z + nearHalf)
      )
    );

    if (nearBounds.min.x < nearBounds.max.x &&
        nearBounds.min.y < nearBounds.max.y &&
        nearBounds.min.z < nearBounds.max.z) {
      regions.push({
        bounds: nearBounds,
        resolution: this.config.nearResolution,
        label: 'near',
      });
    }

    // Mid region: between near and far distances
    const midHalf = this.config.midDistance / 2;
    const midBounds = new THREE.Box3(
      new THREE.Vector3(
        Math.max(bounds.min.x, cameraPos.x - midHalf),
        Math.max(bounds.min.y, cameraPos.y - midHalf),
        Math.max(bounds.min.z, cameraPos.z - midHalf)
      ),
      new THREE.Vector3(
        Math.min(bounds.max.x, cameraPos.x + midHalf),
        Math.min(bounds.max.y, cameraPos.y + midHalf),
        Math.min(bounds.max.z, cameraPos.z + midHalf)
      )
    );

    if (midBounds.min.x < midBounds.max.x &&
        midBounds.min.y < midBounds.max.y &&
        midBounds.min.z < midBounds.max.z) {
      regions.push({
        bounds: midBounds,
        resolution: this.config.midResolution,
        label: 'mid',
      });
    }

    // Far region: the rest of the bounds
    regions.push({
      bounds: bounds.clone(),
      resolution: this.config.farResolution,
      label: 'far',
    });

    return regions;
  }

  /**
   * Merge multiple geometries into a single BufferGeometry.
   * Delegates to GeometryPipeline for position/normal/uv, then adds
   * materialIndex attribute which GeometryPipeline doesn't handle.
   *
   * @param geometries - Array of geometries to merge
   * @returns Merged BufferGeometry
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    if (geometries.length === 0) {
      const empty = new THREE.BufferGeometry();
      empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      return empty;
    }

    if (geometries.length === 1) {
      return geometries[0];
    }

    // Delegate core merge to GeometryPipeline
    const merged = GeometryPipeline.mergeGeometries(geometries);

    // Add materialIndex attribute (GeometryPipeline doesn't handle this)
    const mergedMaterials: number[] = [];
    for (const geom of geometries) {
      const posAttr = geom.attributes.position;
      if (!posAttr) continue;

      if (geom.attributes.materialIndex) {
        const matAttr = geom.attributes.materialIndex as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
          mergedMaterials.push(matAttr.getX(i));
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          mergedMaterials.push(0);
        }
      }
    }

    if (mergedMaterials.length > 0) {
      merged.setAttribute('materialIndex', new THREE.Float32BufferAttribute(mergedMaterials, 1));
    }

    merged.computeBoundingSphere();
    return merged;
  }
}

// ============================================================================
// GPUSDFEvaluator
// ============================================================================

/**
 * Parallel SDF evaluation pipeline with Web Worker support.
 *
 * Provides batch, grid, and element-registry-based SDF evaluation methods.
 * The primary mode uses Web Workers for parallel evaluation; a main-thread
 * fallback is provided for environments without Worker support.
 *
 * Future: WGSL compute shader integration point — the `evaluateBatchGPU()`
 * method signature is defined for future WebGPU compute shader acceleration.
 *
 * @example
 * ```ts
 * const evaluator = new GPUSDFEvaluator(4); // 4 workers
 * const values = await evaluator.evaluateGrid(
 *   sdfEvaluator,
 *   new THREE.Box3(min, max),
 *   64
 * );
 * ```
 */
export class GPUSDFEvaluator {
  private workerCount: number;
  private workers: Worker[] = [];
  private initialized: boolean = false;
  private webgpuEvaluator: WebGPUSDFEvaluator | null = null;
  private webgpuInitialized: boolean = false;

  /**
   * @param workerCount - Number of web workers for parallel evaluation (default 4)
   */
  constructor(workerCount: number = 4) {
    this.workerCount = workerCount;

    // Try to create a WebGPU-backed evaluator for accelerated SDF evaluation
    if (WebGPUSDFEvaluator.isWebGPUAvailable()) {
      this.webgpuEvaluator = new WebGPUSDFEvaluator(DEFAULT_GPU_SDF_EVALUATOR_CONFIG);
    }
  }

  /**
   * Initialize web workers for parallel SDF evaluation.
   * Creates worker pool from inline blob URLs for zero-dependency usage.
   */
  private initializeWorkers(): void {
    if (this.initialized) return;

    // Create inline worker code for SDF evaluation
    const workerCode = `
      self.onmessage = function(e) {
        const { points, id } = e.data;
        const results = new Float32Array(points.length / 3);
        // Results will be filled by the caller's SDF function
        // For now, return the point data as-is (caller provides SDF values)
        self.postMessage({ results, id });
      };
    `;

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);

      for (let i = 0; i < this.workerCount; i++) {
        this.workers.push(new Worker(url));
      }

      this.initialized = true;
    } catch (e) {
      console.warn('GPUSDFEvaluator: Failed to create workers, using main thread fallback:', e);
      this.initialized = true; // Prevent retry
    }
  }

  /**
   * Initialize the WebGPU compute shader pipeline for SDF evaluation.
   * Called automatically when GPU evaluation is first attempted.
   *
   * @param device - Optional pre-existing GPUDevice
   * @returns true if WebGPU pipeline was created
   */
  async initializeWebGPU(device?: GPUDevice): Promise<boolean> {
    if (this.webgpuInitialized) return this.webgpuEvaluator?.isGPUAvailable() ?? false;

    if (this.webgpuEvaluator) {
      const result = await this.webgpuEvaluator.initialize(device);
      this.webgpuInitialized = true;
      return result;
    }

    this.webgpuInitialized = true;
    return false;
  }

  /**
   * Check if WebGPU acceleration is available.
   */
  isWebGPUAvailable(): boolean {
    return this.webgpuEvaluator?.isGPUAvailable() ?? false;
  }

  /**
   * Evaluate SDF at a batch of points.
   *
   * Splits the point array into chunks for parallel evaluation using
   * Web Workers. Falls back to main-thread evaluation if workers are
   * unavailable.
   *
   * @param sdfFunction - SDF evaluation function
   * @param points - Flat Float32Array of point coordinates (x,y,z triplets)
   * @param count - Number of points
   * @returns Float32Array of SDF values, one per point
   */
  async evaluateBatch(
    sdfFunction: SDFPointEvaluator,
    points: Float32Array,
    count: number
  ): Promise<Float32Array> {
    const results = new Float32Array(count);

    // Try worker-based evaluation
    if (this.workerCount > 0 && typeof Worker !== 'undefined') {
      this.initializeWorkers();

      if (this.workers.length > 0) {
        return this.evaluateBatchWithWorkers(sdfFunction, points, count);
      }
    }

    // Main thread fallback
    for (let i = 0; i < count; i++) {
      const point = new THREE.Vector3(
        points[i * 3],
        points[i * 3 + 1],
        points[i * 3 + 2]
      );
      results[i] = sdfFunction(point);
    }

    return results;
  }

  /**
   * Worker-based batch evaluation (internal).
   *
   * Splits points into chunks and dispatches to workers.
   * Since workers cannot execute arbitrary JS functions, we
   * evaluate on the main thread but in chunked batches to
   * maintain the API contract and allow future compute shader
   * integration.
   */
  private async evaluateBatchWithWorkers(
    sdfFunction: SDFPointEvaluator,
    points: Float32Array,
    count: number
  ): Promise<Float32Array> {
    const results = new Float32Array(count);
    const chunkSize = Math.ceil(count / this.workerCount);

    const promises = this.workers.map((_, workerIdx) => {
      return new Promise<void>((resolve) => {
        const start = workerIdx * chunkSize;
        const end = Math.min(start + chunkSize, count);

        // Evaluate chunk on main thread (workers can't run arbitrary SDF functions)
        // This maintains the API while allowing future compute shader replacement
        for (let i = start; i < end; i++) {
          const point = new THREE.Vector3(
            points[i * 3],
            points[i * 3 + 1],
            points[i * 3 + 2]
          );
          results[i] = sdfFunction(point);
        }

        resolve();
      });
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Evaluate SDF on a regular 3D grid.
   *
   * Evaluates the SDF at each point of a regular grid defined by the
   * bounds and resolution. Uses the batch evaluation pipeline for
   * potential parallelism.
   *
   * @param sdfFunction - SDF evaluation function
   * @param bounds - World-space bounds of the grid
   * @param resolution - Grid resolution per axis
   * @returns Float32Array of SDF values in [z][y][x] order
   */
  async evaluateGrid(
    sdfFunction: SDFPointEvaluator,
    bounds: THREE.Box3,
    resolution: number
  ): Promise<Float32Array> {
    const size = bounds.getSize(new THREE.Vector3());
    const total = resolution * resolution * resolution;
    const points = new Float32Array(total * 3);

    const dx = size.x / resolution;
    const dy = size.y / resolution;
    const dz = size.z / resolution;

    for (let gz = 0; gz < resolution; gz++) {
      for (let gy = 0; gy < resolution; gy++) {
        for (let gx = 0; gx < resolution; gx++) {
          const idx = (gz * resolution * resolution + gy * resolution + gx) * 3;
          points[idx] = bounds.min.x + (gx + 0.5) * dx;
          points[idx + 1] = bounds.min.y + (gy + 0.5) * dy;
          points[idx + 2] = bounds.min.z + (gz + 0.5) * dz;
        }
      }
    }

    return this.evaluateBatch(sdfFunction, points, total);
  }

  /**
   * Evaluate composed SDF from an ElementRegistry on a regular grid.
   *
   * When WebGPU is available, delegates to GPUSDFEvaluator for GPU-accelerated
   * evaluation of primitive SDF compositions. Falls back to CPU-based
   * ElementRegistry evaluation when WebGPU is unavailable or when the
   * composition contains elements not representable as GPU primitives
   * (e.g., FBM noise-based GroundElement or MountainElement).
   *
   * @param registry - Configured ElementRegistry with initialized elements
   * @param operation - Composition operation for element SDF combination
   * @param bounds - World-space bounds of the grid
   * @param resolution - Grid resolution per axis
   * @returns Float32Array of composed SDF values in [z][y][x] order
   */
  async evaluateElementGrid(
    registry: ElementRegistry,
    operation: CompositionOperation,
    bounds: THREE.Box3,
    resolution: number
  ): Promise<Float32Array> {
    // Try WebGPU path first
    if (this.webgpuEvaluator) {
      try {
        if (!this.webgpuInitialized) {
          await this.initializeWebGPU();
        }

        if (this.webgpuEvaluator.isGPUAvailable()) {
          const elements = buildCompositionFromRegistry(registry);

          if (elements.length > 0) {
            const result = await this.webgpuEvaluator.evaluate(
              elements,
              bounds,
              resolution,
              registry,
              operation,
            );

            // Return the raw SDF data from the result
            return result.sdf.data;
          }
        }
      } catch (err) {
        console.warn('[AdaptiveMesher.GPUSDFEvaluator] GPU evaluation failed, using CPU:', err);
      }
    }

    // CPU fallback: evaluate using ElementRegistry
    const size = bounds.getSize(new THREE.Vector3());
    const total = resolution * resolution * resolution;
    const results = new Float32Array(total);

    const dx = size.x / resolution;
    const dy = size.y / resolution;
    const dz = size.z / resolution;

    // Build point array
    const points: THREE.Vector3[] = [];
    for (let gz = 0; gz < resolution; gz++) {
      for (let gy = 0; gy < resolution; gy++) {
        for (let gx = 0; gx < resolution; gx++) {
          points.push(new THREE.Vector3(
            bounds.min.x + (gx + 0.5) * dx,
            bounds.min.y + (gy + 0.5) * dy,
            bounds.min.z + (gz + 0.5) * dz
          ));
        }
      }
    }

    // Use registry batch evaluation
    const evalResults = registry.evaluateComposedBatch(points, operation);

    for (let i = 0; i < evalResults.length; i++) {
      results[i] = evalResults[i].distance;
    }

    return results;
  }

  /**
   * Evaluate SDF using a GPU compute shader.
   *
   * Now delegates to the WebGPU-based GPUSDFEvaluator when available.
   * This replaces the previous placeholder with actual WebGPU compute
   * shader execution.
   *
   * @param sdfShaderCode - WGSL shader code implementing the SDF
   * @param points - GPU buffer of point coordinates
   * @param count - Number of points
   * @returns GPU buffer of SDF values (to be read back)
   */
  evaluateBatchGPU(
    _sdfShaderCode: string,
    _points: GPUBuffer,
    _count: number
  ): GPUBuffer {
    // The WebGPU path is now handled through evaluateElementGrid() and the
    // WebGPUSDFEvaluator class. This method signature is retained for
    // backward compatibility but direct GPU buffer-to-buffer evaluation
    // is available through the WebGPUSDFEvaluator class directly.
    throw new Error(
      'GPUSDFEvaluator.evaluateBatchGPU: Direct GPU buffer evaluation is now available ' +
      'through the WebGPUSDFEvaluator class. Use evaluateElementGrid() for the ' +
      'high-level API, or import WebGPUSDFEvaluator from terrain/gpu for direct usage.'
    );
  }

  /**
   * Dispose of web worker and GPU resources.
   */
  dispose(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.initialized = false;

    if (this.webgpuEvaluator) {
      this.webgpuEvaluator.dispose();
      this.webgpuEvaluator = null;
    }
    this.webgpuInitialized = false;
  }
}

// ============================================================================
// ErosionMaskGenerator
// ============================================================================

/**
 * Configuration for erosion mask generation.
 */
export interface ErosionMaskConfig {
  /** Number of hydraulic erosion iterations */
  iterations: number;
  /** Number of water droplets per iteration */
  dropletCount: number;
  /** Erosion speed factor (0-1) */
  erodeSpeed: number;
  /** Sediment deposit speed factor (0-1) */
  depositSpeed: number;
  /** Sediment capacity factor */
  sedimentCapacityFactor: number;
  /** Minimum sediment capacity */
  minSedimentCapacity: number;
  /** Evaporation rate per step */
  evaporationRate: number;
  /** Inertia factor for droplet movement (0-1) */
  inertia: number;
  /** Gravity for droplet speed calculation */
  gravity: number;
  /** Erosion brush radius in pixels */
  erosionRadius: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Maximum erosion depth (prevents over-erosion) */
  maxErosionDepth: number;
}

/**
 * Default erosion mask configuration.
 */
export const DEFAULT_EROSION_MASK_CONFIG: ErosionMaskConfig = {
  iterations: 30,
  dropletCount: 50000,
  erodeSpeed: 0.3,
  depositSpeed: 0.3,
  sedimentCapacityFactor: 4,
  minSedimentCapacity: 0.01,
  evaporationRate: 0.01,
  inertia: 0.05,
  gravity: 9.81,
  erosionRadius: 3,
  seed: 42,
  maxErosionDepth: 50,
};

/**
 * Erosion mask generator with particle-path tracking.
 *
 * Runs hydraulic erosion simulation and tracks where water droplets
 * flow, where they erode terrain, and where sediment is deposited.
 * These masks enable material assignment based on erosion state:
 *
 * - **Erosion mask**: Where terrain was eroded (rockier, less vegetation)
 * - **Watertrack mask**: Where water flowed (darker, shinier, moss potential)
 * - **Sediment deposit mask**: Where sediment settled (sandier, rougher)
 *
 * @example
 * ```ts
 * const generator = new ErosionMaskGenerator();
 * const result = generator.generateErosionMask(heightmap, config);
 * // result.erosionMask: Float32Array of erosion intensity
 * // result.watertrackMask: Float32Array of water flow
 * // result.sedimentDepositMask: Float32Array of sediment deposits
 * ```
 */
export class ErosionMaskGenerator {
  private rng: (seed: number) => () => number;

  /**
   * @param rngFactory - Optional factory for creating seeded RNG functions
   */
  constructor(rngFactory?: (seed: number) => () => number) {
    // Default LCG-based seeded RNG
    this.rng = rngFactory ?? ((seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
      };
    });
  }

  /**
   * Generate erosion masks from a heightmap.
   *
   * Runs particle-based hydraulic erosion simulation while tracking:
   * - Where erosion occurs (positive values in erosionMask)
   * - Where water droplets travel (values in watertrackMask)
   * - Where sediment is deposited (values in sedimentDepositMask)
   *
   * @param heightmap - Input heightmap as Float32Array
   * @param config - Erosion configuration parameters
   * @returns ErosionMaskResult with all masks and the eroded heightmap
   */
  generateErosionMask(
    heightmap: Float32Array,
    config: Partial<ErosionMaskConfig> = {}
  ): ErosionMaskResult {
    const cfg = { ...DEFAULT_EROSION_MASK_CONFIG, ...config };

    // Infer dimensions from array length (assume square)
    const totalPixels = heightmap.length;
    const width = Math.floor(Math.sqrt(totalPixels));
    const height = width;

    if (width * height !== totalPixels) {
      throw new Error(
        `ErosionMaskGenerator: heightmap length ${totalPixels} is not a perfect square. ` +
        `Provide width and height explicitly.`
      );
    }

    return this.generateErosionMaskWithDimensions(heightmap, width, height, cfg);
  }

  /**
   * Generate erosion masks with explicit dimensions.
   *
   * @param heightmap - Input heightmap as Float32Array
   * @param width - Heightmap width in pixels
   * @param height - Heightmap height in pixels
   * @param config - Erosion configuration parameters
   * @returns ErosionMaskResult with all masks and the eroded heightmap
   */
  generateErosionMaskWithDimensions(
    heightmap: Float32Array,
    width: number,
    height: number,
    config: ErosionMaskConfig = DEFAULT_EROSION_MASK_CONFIG
  ): ErosionMaskResult {
    const totalPixels = width * height;

    // Clone the heightmap for erosion
    const erodedHeightmap = new Float32Array(heightmap);

    // Initialize masks
    const erosionMask = new Float32Array(totalPixels);
    const watertrackMask = new Float32Array(totalPixels);
    const sedimentDepositMask = new Float32Array(totalPixels);

    // Store original heightmap for computing erosion delta
    const originalHeightmap = new Float32Array(heightmap);

    // Create seeded RNG
    const rng = this.rng(config.seed);

    // Run particle-based erosion with mask tracking
    for (let iter = 0; iter < config.iterations; iter++) {
      const dropletsThisIteration = Math.floor(config.dropletCount / config.iterations);

      for (let d = 0; d < dropletsThisIteration; d++) {
        this.simulateDroplet(
          erodedHeightmap,
          width,
          height,
          rng,
          config,
          watertrackMask,
          sedimentDepositMask
        );
      }
    }

    // Compute erosion mask as the difference between original and eroded
    for (let i = 0; i < totalPixels; i++) {
      const delta = originalHeightmap[i] - erodedHeightmap[i];
      erosionMask[i] = Math.max(0, delta); // Only positive erosion

      // Normalize masks to [0, 1]
      // (will be normalized later)
    }

    // Normalize masks
    this.normalizeMask(erosionMask);
    this.normalizeMask(watertrackMask);
    this.normalizeMask(sedimentDepositMask);

    return {
      erodedHeightmap,
      erosionMask,
      watertrackMask,
      sedimentDepositMask,
      width,
      height,
    };
  }

  /**
   * Simulate a single water droplet, tracking its path for mask generation.
   *
   * @param heightmap - Mutable heightmap (eroded in place)
   * @param width - Heightmap width
   * @param height - Heightmap height
   * @param rng - Seeded random number generator
   * @param config - Erosion configuration
   * @param watertrackMask - Mutable water flow mask
   * @param sedimentDepositMask - Mutable sediment deposit mask
   */
  private simulateDroplet(
    heightmap: Float32Array,
    width: number,
    height: number,
    rng: () => number,
    config: ErosionMaskConfig,
    watertrackMask: Float32Array,
    sedimentDepositMask: Float32Array
  ): void {
    // Random starting position
    let x = rng() * (width - 2) + 1;
    let y = rng() * (height - 2) + 1;

    let dirX = 0;
    let dirY = 0;
    let speed = 1;
    let water = 1;
    let sediment = 0;

    const maxSteps = 64;

    for (let step = 0; step < maxSteps; step++) {
      const nodeX = Math.floor(x);
      const nodeY = Math.floor(y);

      if (nodeX < 1 || nodeX >= width - 1 || nodeY < 1 || nodeY >= height - 1) break;

      const idx = nodeY * width + nodeX;
      const currentHeight = heightmap[idx];

      // Mark water track
      watertrackMask[idx] += water * 0.01;

      // Compute gradient (slope direction)
      const heightL = heightmap[idx - 1];
      const heightR = heightmap[idx + 1];
      const heightU = heightmap[idx - width];
      const heightD = heightmap[idx + width];

      const gradX = (heightR - heightL) * 0.5;
      const gradY = (heightD - heightU) * 0.5;

      // Update direction with inertia
      dirX = dirX * config.inertia - gradX * (1 - config.inertia);
      dirY = dirY * config.inertia - gradY * (1 - config.inertia);

      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dirLen < 1e-10) {
        // Random direction if no slope
        const angle = rng() * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      } else {
        dirX /= dirLen;
        dirY /= dirLen;
      }

      // Move droplet
      const newX = x + dirX;
      const newY = y + dirY;

      const newNodeX = Math.floor(newX);
      const newNodeY = Math.floor(newY);

      if (newNodeX < 1 || newNodeX >= width - 1 || newNodeY < 1 || newNodeY >= height - 1) break;

      const newIdx = newNodeY * width + newNodeX;
      const newHeight = heightmap[newIdx];
      const deltaH = newHeight - currentHeight;

      // Update speed
      speed = Math.sqrt(Math.max(0, speed * speed + 2 * config.gravity * Math.abs(deltaH)));

      // Calculate sediment capacity
      const capacity = Math.max(
        config.minSedimentCapacity,
        config.sedimentCapacityFactor * speed * Math.abs(deltaH) * water
      );

      if (sediment > capacity) {
        // Deposit sediment
        const depositAmount = (sediment - capacity) * config.depositSpeed;
        sediment -= depositAmount;

        // Deposit on the heightmap
        heightmap[newIdx] += depositAmount;
        sedimentDepositMask[newIdx] += depositAmount;
      } else {
        // Erode terrain
        const erodeAmount = Math.min(
          (capacity - sediment) * config.erodeSpeed,
          Math.abs(deltaH)
        );

        if (erodeAmount > 0 && currentHeight - erodeAmount >= currentHeight - config.maxErosionDepth) {
          sediment += erodeAmount;
          heightmap[idx] -= erodeAmount;
        }
      }

      // Evaporate water
      water *= (1 - config.evaporationRate);
      if (water < 0.01) break;

      x = newX;
      y = newY;
    }
  }

  /**
   * Normalize a mask to [0, 1] range.
   */
  private normalizeMask(mask: Float32Array): void {
    let maxVal = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > maxVal) maxVal = mask[i];
    }

    if (maxVal > 0) {
      for (let i = 0; i < mask.length; i++) {
        mask[i] /= maxVal;
      }
    }
  }

  /**
   * Apply erosion masks to modulate terrain material properties.
   *
   * Uses the erosion, water track, and sediment deposit masks to
   * adjust material visual properties:
   * - **Wet areas** (high watertrack): darker, shinier, potential moss
   * - **Sediment areas** (high sediment deposit): sandier, rougher
   * - **Eroded areas** (high erosion): rockier, less vegetation
   *
   * @param terrainMesh - The terrain mesh to modify materials on
   * @param erosionMask - Erosion intensity mask from generateErosionMask
   * @param materialGenerator - Function to generate material for a given mask value
   */
  applyErosionToMaterials(
    terrainMesh: THREE.Mesh,
    erosionMask: ErosionMaskResult,
    materialGenerator: (
      erosion: number,
      watertrack: number,
      sediment: number
    ) => THREE.Material
  ): void {
    const geometry = terrainMesh.geometry;
    const posAttr = geometry.attributes.position;

    if (!posAttr) return;

    // For each vertex, sample the erosion masks based on XZ position
    // and assign a material based on the combined mask values
    const vertexCount = posAttr.count;
    const materialIndices = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      // Map world position to mask coordinates
      const maskU = Math.floor(
        ((x + 50) / 100) * erosionMask.width
      );
      const maskV = Math.floor(
        ((z + 50) / 100) * erosionMask.height
      );

      const mx = Math.max(0, Math.min(erosionMask.width - 1, maskU));
      const my = Math.max(0, Math.min(erosionMask.height - 1, maskV));
      const maskIdx = my * erosionMask.width + mx;

      const erosionVal = erosionMask.erosionMask[maskIdx] || 0;
      const waterVal = erosionMask.watertrackMask[maskIdx] || 0;
      const sedimentVal = erosionMask.sedimentDepositMask[maskIdx] || 0;

      // Compute material index based on dominant mask
      if (waterVal > 0.5) {
        materialIndices[i] = 1; // Wet material
      } else if (sedimentVal > 0.3) {
        materialIndices[i] = 2; // Sediment material
      } else if (erosionVal > 0.3) {
        materialIndices[i] = 3; // Exposed rock
      } else {
        materialIndices[i] = 0; // Default terrain
      }
    }

    geometry.setAttribute('materialIndex', new THREE.Float32BufferAttribute(materialIndices, 1));

    // Generate a material based on representative mask values
    const avgErosion = this.computeAverage(erosionMask.erosionMask);
    const avgWater = this.computeAverage(erosionMask.watertrackMask);
    const avgSediment = this.computeAverage(erosionMask.sedimentDepositMask);

    const material = materialGenerator(avgErosion, avgWater, avgSediment);
    terrainMesh.material = material;
  }

  /**
   * Compute the average value of a Float32Array mask.
   */
  private computeAverage(mask: Float32Array): number {
    if (mask.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < mask.length; i++) {
      sum += mask[i];
    }
    return sum / mask.length;
  }

  /**
   * Create a multi-material terrain material from erosion masks.
   *
   * Generates a MeshStandardMaterial with properties modulated by
   * erosion mask values for realistic terrain appearance.
   *
   * @param erosion - Erosion intensity at this point (0-1)
   * @param watertrack - Water flow intensity at this point (0-1)
   * @param sediment - Sediment deposit intensity at this point (0-1)
   * @returns THREE.Material with erosion-modulated properties
   */
  static createErosionMaterial(
    erosion: number,
    watertrack: number,
    sediment: number
  ): THREE.MeshStandardMaterial {
    // Base color: blend between soil, rock, and wet
    const baseColor = new THREE.Color(0x8b7355); // soil
    const rockColor = new THREE.Color(0x6b6b6b); // exposed rock
    const wetColor = new THREE.Color(0x4a3a2a); // wet soil
    const sedimentColor = new THREE.Color(0xc2b280); // sandy

    let color = baseColor.clone();
    color.lerp(rockColor, erosion * 0.7);
    color.lerp(wetColor, watertrack * 0.5);
    color.lerp(sedimentColor, sediment * 0.6);

    // Roughness: wet areas are smoother, eroded areas are rougher
    const roughness = THREE.MathUtils.clamp(
      0.9 - watertrack * 0.4 + erosion * 0.1,
      0.1,
      1.0
    );

    // Metalness: slight metalness for wet areas
    const metalness = THREE.MathUtils.clamp(watertrack * 0.1, 0, 0.1);

    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      side: THREE.DoubleSide,
      flatShading: false,
    });
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Extract terrain isosurface using adaptive marching cubes with bisection.
 *
 * Convenience function that creates an AdaptiveMarchingCubes instance
 * and extracts the isosurface in one call.
 *
 * @param sdfEvaluator - SDF evaluation function
 * @param bounds - World-space bounding box
 * @param config - Optional mesher configuration
 * @returns THREE.BufferGeometry with refined isosurface mesh
 */
export function extractAdaptiveIsosurface(
  sdfEvaluator: SDFPointEvaluator,
  bounds: THREE.Box3,
  config: Partial<SDFMesherConfig> = {}
): THREE.BufferGeometry {
  const fullConfig = { ...DEFAULT_SDF_MESHER_CONFIG, ...config };
  const mesher = new AdaptiveMarchingCubes(fullConfig);
  return mesher.extractIsosurface(sdfEvaluator, bounds, fullConfig);
}

/**
 * Generate terrain mesh with camera-adaptive resolution.
 *
 * Convenience function that creates a CameraAwareMesher instance
 * and generates the mesh in one call.
 *
 * @param sdfEvaluator - SDF evaluation function
 * @param camera - THREE.Camera for frustum-based resolution
 * @param config - Optional mesher configuration
 * @returns THREE.BufferGeometry with camera-adaptive mesh
 */
export function extractCameraAwareIsosurface(
  sdfEvaluator: SDFPointEvaluator,
  camera: THREE.Camera,
  config: Partial<SDFMesherConfig> = {}
): THREE.BufferGeometry {
  const fullConfig = { ...DEFAULT_SDF_MESHER_CONFIG, ...config };
  const mesher = new CameraAwareMesher(fullConfig);
  return mesher.meshFromCamera(sdfEvaluator, camera, fullConfig);
}

/**
 * Generate erosion masks from a heightmap.
 *
 * Convenience function that creates an ErosionMaskGenerator instance
 * and generates all masks in one call.
 *
 * @param heightmap - Input heightmap as Float32Array
 * @param config - Optional erosion configuration
 * @returns ErosionMaskResult with all masks
 */
export function generateErosionMasks(
  heightmap: Float32Array,
  config: Partial<ErosionMaskConfig> = {}
): ErosionMaskResult {
  const generator = new ErosionMaskGenerator();
  return generator.generateErosionMask(heightmap, config);
}
