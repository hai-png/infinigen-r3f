/**
 * BVH-Accelerated mesh_to_sdf Conversion
 *
 * Ports: infinigen/terrain/mesh_to_sdf/
 *
 * Provides high-performance mesh-to-SDF conversion using three-mesh-bvh
 * for BVH-accelerated spatial queries. Replaces the brute-force O(n×triangles)
 * approach in sdf-operations.ts with O(n×log(triangles)) BVH traversal.
 *
 * Key components:
 * - MeshToSDF: BVH-accelerated signed distance computation from triangle meshes
 * - OccupancyVolume: 3D occupancy grid for cave generation with interpolation
 * - SDFGrid: General-purpose SDF storage with trilinear interpolation and combinators
 * - Cave integration: L-system tunnel mesh → MeshToSDF → OccupancyVolume pipeline
 *
 * Sign determination uses ray casting: cast a ray from the query point and
 * count intersections — an odd count means the point is inside the mesh.
 *
 * @module terrain/sdf/MeshToSDF
 */

import * as THREE from 'three';

// Lazy-load three-mesh-bvh to avoid SSR/test issues where THREE.Mesh may not be defined.
// The library extends THREE.Mesh at import time, which fails in Node.js test environments.
let _MeshBVH: any = null;
let _HitPointInfo: any = null;

async function ensureMeshBVH() {
  if (_MeshBVH) return;
  const mod = await import('three-mesh-bvh');
  _MeshBVH = mod.MeshBVH;
  _HitPointInfo = mod.HitPointInfo;
}

function getMeshBVH(): any {
  if (!_MeshBVH) throw new Error('[MeshToSDF] three-mesh-bvh not loaded. Call ensureMeshBVH() first or use async API.');
  return _MeshBVH;
}

type HitPointInfo = {
  point: THREE.Vector3;
  distance: number;
  faceIndex: number;
};

import { LSystemCaveGenerator } from './LSystemCave';
import type { CaveTunnelData, CaveGrammarConfig } from './LSystemCave';
import { smoothUnion } from './SDFCombinators';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for MeshToSDF conversion.
 */
export interface MeshToSDFConfig {
  /** Resolution of the SDF grid (voxel size in world units). Default: 0.5 */
  resolution: number;
  /** Bounding box for the SDF grid. If not provided, computed from the mesh. */
  bounds?: THREE.Box3;
  /** Padding added around the mesh bounds (in world units). Default: 1.0 */
  boundsPadding: number;
  /** Maximum signed distance value to clamp to. Default: Infinity */
  maxDistance: number;
  /** Number of ray directions for sign determination (more = more robust). Default: 3 */
  signRayCount: number;
  /** BVH construction strategy: 0=CENTER, 1=AVERAGE, 2=SAH. Default: 2 */
  bvhStrategy: number;
  /** Maximum leaf triangles in BVH. Default: 10 */
  bvhMaxLeafTris: number;
}

/** Default configuration for MeshToSDF */
export const DEFAULT_MESHTOSDF_CONFIG: MeshToSDFConfig = {
  resolution: 0.5,
  boundsPadding: 1.0,
  maxDistance: Infinity,
  signRayCount: 3,
  bvhStrategy: 2,
  bvhMaxLeafTris: 10,
};

/**
 * Result of a single-point SDF query against a mesh.
 */
export interface MeshSDFResult {
  /** Signed distance (negative inside, positive outside) */
  distance: number;
  /** Closest point on the mesh surface */
  closestPoint: THREE.Vector3;
  /** Face index of the closest triangle */
  faceIndex: number;
  /** Whether the query point is inside the mesh */
  isInside: boolean;
}

/**
 * Serialized format for SDFGrid — compact JSON-friendly representation.
 */
export interface SDFGridSerialized {
  /** Grid dimensions [nx, ny, nz] */
  gridSize: [number, number, number];
  /** AABB minimum corner [x, y, z] */
  boundsMin: [number, number, number];
  /** AABB maximum corner [x, y, z] */
  boundsMax: [number, number, number];
  /** Voxel size [x, y, z] */
  voxelSize: [number, number, number];
  /** Flat SDF data as base64-encoded Float32Array */
  dataBase64: string;
}

// ============================================================================
// MeshToSDF — BVH-Accelerated Signed Distance Computation
// ============================================================================

/**
 * BVH-accelerated mesh-to-SDF converter.
 *
 * Builds a MeshBVH from the input geometry and uses it for efficient
 * closest-point queries and ray-casting for sign determination.
 *
 * Usage:
 * ```typescript
 * const converter = new MeshToSDF(meshGeometry);
 * const sdf = converter.computeSDF({ resolution: 0.5 });
 * // sdf is a Float32Array of signed distances
 *
 * // Or single-point query:
 * const result = converter.queryPoint(new THREE.Vector3(1, 2, 3));
 * ```
 */
export class MeshToSDF {
  private bvh: any;
  private geometry: THREE.BufferGeometry;
  private meshBounds: THREE.Box3;

  /**
   * Create a new MeshToSDF converter.
   *
   * @param input - A THREE.BufferGeometry or THREE.Mesh to convert
   * @param bvhStrategy - BVH construction strategy (0=CENTER, 1=AVERAGE, 2=SAH)
   * @param maxLeafTris - Maximum triangles per BVH leaf node
   */
  constructor(
    input: THREE.BufferGeometry | THREE.Mesh,
    bvhStrategy: number = 2,
    maxLeafTris: number = 10,
  ) {
    // Extract geometry from mesh if needed
    if (input instanceof THREE.Mesh) {
      this.geometry = input.geometry.clone();
      // Apply mesh's world transform to the geometry
      this.geometry.applyMatrix4(input.matrixWorld);
    } else {
      this.geometry = input.clone();
    }

    // Validate geometry has position attribute
    if (!this.geometry.attributes.position) {
      throw new Error('[MeshToSDF] Geometry must have a position attribute');
    }

    // Ensure the geometry has an index buffer (MeshBVH works best with indexed geometry)
    if (!this.geometry.index) {
      this.geometry = this.geometry.toNonIndexed
        ? this.geometry
        : this.createIndexedGeometry(this.geometry);
    }

    // Compute bounding box
    this.geometry.computeBoundingBox();
    this.meshBounds = this.geometry.boundingBox!.clone();

    // Build the BVH (requires three-mesh-bvh to be loaded)
    const MeshBVH = getMeshBVH();
    try {
      this.bvh = new MeshBVH(this.geometry, {
        strategy: bvhStrategy,
        maxLeafSize: maxLeafTris,
        setBoundingBox: true,
        verbose: false,
      });
    } catch (err) {
      throw new Error(
        `[MeshToSDF] Failed to build BVH: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Asynchronous factory that ensures three-mesh-bvh is loaded before construction.
   *
   * @param input - A THREE.BufferGeometry or THREE.Mesh to convert
   * @param bvhStrategy - BVH construction strategy (0=CENTER, 1=AVERAGE, 2=SAH)
   * @param maxLeafTris - Maximum triangles per BVH leaf node
   * @returns Promise<MeshToSDF> instance
   */
  static async create(
    input: THREE.BufferGeometry | THREE.Mesh,
    bvhStrategy: number = 2,
    maxLeafTris: number = 10,
  ): Promise<MeshToSDF> {
    await ensureMeshBVH();
    return new MeshToSDF(input, bvhStrategy, maxLeafTris);
  }

  // --------------------------------------------------------------------------
  // Single-Point Query
  // --------------------------------------------------------------------------

  /**
   * Compute the signed distance from a single point to the mesh.
   *
   * Uses BVH-accelerated closest-point query for the unsigned distance,
   * then determines sign via ray-cast intersection counting.
   *
   * @param point - The query point in world space
   * @returns Signed distance result with closest point and inside/outside flag
   */
  queryPoint(point: THREE.Vector3): MeshSDFResult {
    // 1. Find closest point on mesh surface using BVH
    const target: HitPointInfo = {
      point: new THREE.Vector3(),
      distance: 0,
      faceIndex: 0,
    };
    const hit = this.bvh.closestPointToPoint(point, target, 0, Infinity);

    let unsignedDistance: number;
    let closestPoint: THREE.Vector3;
    let faceIndex: number;

    if (hit) {
      unsignedDistance = hit.distance;
      closestPoint = hit.point.clone();
      faceIndex = hit.faceIndex;
    } else {
      // Fallback: compute distance to bounding box
      const clamped = this.meshBounds.clampPoint(point, new THREE.Vector3());
      unsignedDistance = point.distanceTo(clamped);
      closestPoint = clamped;
      faceIndex = -1;
    }

    // 2. Determine sign: cast rays and count intersections
    // Odd number of intersections = inside the mesh
    const isInside = this.isPointInside(point);
    const signedDistance = isInside ? -unsignedDistance : unsignedDistance;

    return {
      distance: signedDistance,
      closestPoint,
      faceIndex,
      isInside,
    };
  }

  /**
   * Compute signed distances for a batch of query points.
   *
   * More efficient than calling queryPoint() in a loop because
   * the BVH stays warm in cache.
   *
   * @param points - Array of query points in world space
   * @returns Float32Array of signed distances (same length as points array / 3)
   */
  queryPointsBatch(points: Float32Array | THREE.Vector3[]): Float32Array {
    const count = points instanceof Float32Array ? points.length / 3 : points.length;
    const result = new Float32Array(count);

    // Reusable objects to reduce GC pressure
    const target: HitPointInfo = {
      point: new THREE.Vector3(),
      distance: 0,
      faceIndex: 0,
    };
    const queryPoint = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      if (points instanceof Float32Array) {
        queryPoint.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      } else {
        queryPoint.copy(points[i]);
      }

      // Closest point query
      const hit = this.bvh.closestPointToPoint(queryPoint, target, 0, Infinity);

      let unsignedDistance: number;
      if (hit) {
        unsignedDistance = hit.distance;
      } else {
        const clamped = this.meshBounds.clampPoint(queryPoint, new THREE.Vector3());
        unsignedDistance = queryPoint.distanceTo(clamped);
      }

      // Sign determination
      const isInside = this.isPointInside(queryPoint);
      result[i] = isInside ? -unsignedDistance : unsignedDistance;
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Full Grid Computation
  // --------------------------------------------------------------------------

  /**
   * Compute a full 3D SDF grid from the mesh.
   *
   * Iterates over all voxels in the bounding box and computes signed
   * distance using BVH-accelerated queries.
   *
   * @param config - Configuration for the SDF computation
   * @returns SDFGrid instance containing the computed signed distances
   */
  computeSDFGrid(config: Partial<MeshToSDFConfig> = {}): SDFGrid {
    const cfg: MeshToSDFConfig = { ...DEFAULT_MESHTOSDF_CONFIG, ...config };

    // Compute bounds
    const bounds = cfg.bounds
      ? cfg.bounds.clone()
      : this.meshBounds.clone();

    // Add padding
    const padding = new THREE.Vector3(cfg.boundsPadding, cfg.boundsPadding, cfg.boundsPadding);
    bounds.min.sub(padding);
    bounds.max.add(padding);

    // Create the SDF grid
    const gridSize = bounds.getSize(new THREE.Vector3());
    const nx = Math.max(1, Math.ceil(gridSize.x / cfg.resolution));
    const ny = Math.max(1, Math.ceil(gridSize.y / cfg.resolution));
    const nz = Math.max(1, Math.ceil(gridSize.z / cfg.resolution));

    const voxelSize = new THREE.Vector3(
      gridSize.x / nx,
      gridSize.y / ny,
      gridSize.z / nz,
    );

    const grid = new SDFGrid({
      gridSize: [nx, ny, nz],
      bounds,
      voxelSize,
    });

    // Fill the grid with BVH-accelerated queries
    const target: HitPointInfo = {
      point: new THREE.Vector3(),
      distance: 0,
      faceIndex: 0,
    };
    const queryPoint = new THREE.Vector3();

    for (let gz = 0; gz < nz; gz++) {
      for (let gy = 0; gy < ny; gy++) {
        for (let gx = 0; gx < nx; gx++) {
          // Compute world position of this voxel center
          queryPoint.set(
            bounds.min.x + (gx + 0.5) * voxelSize.x,
            bounds.min.y + (gy + 0.5) * voxelSize.y,
            bounds.min.z + (gz + 0.5) * voxelSize.z,
          );

          // BVH closest point query
          const hit = this.bvh.closestPointToPoint(queryPoint, target, 0, Infinity);

          let unsignedDistance: number;
          if (hit) {
            unsignedDistance = hit.distance;
          } else {
            const clamped = bounds.clampPoint(queryPoint, new THREE.Vector3());
            unsignedDistance = queryPoint.distanceTo(clamped);
          }

          // Clamp to max distance
          if (cfg.maxDistance < Infinity) {
            unsignedDistance = Math.min(unsignedDistance, cfg.maxDistance);
          }

          // Sign determination
          const isInside = this.isPointInside(queryPoint);
          const signedDistance = isInside ? -unsignedDistance : unsignedDistance;

          grid.setValueAtGrid(gx, gy, gz, signedDistance);
        }
      }
    }

    return grid;
  }

  /**
   * Compute a flat Float32Array of signed distances for a grid.
   *
   * This is a lower-level API that returns just the distance values
   * without the SDFGrid wrapper. Useful for integration with existing
   * code that expects the old SignedDistanceField format.
   *
   * @param config - Configuration for the SDF computation
   * @returns Object with distance data, grid dimensions, and bounds
   */
  computeSDFFlat(
    config: Partial<MeshToSDFConfig> = {},
  ): { data: Float32Array; gridSize: [number, number, number]; bounds: THREE.Box3; voxelSize: THREE.Vector3 } {
    const grid = this.computeSDFGrid(config);
    return {
      data: grid.data,
      gridSize: grid.gridSize,
      bounds: grid.bounds.clone(),
      voxelSize: grid.voxelSize.clone(),
    };
  }

  // --------------------------------------------------------------------------
  // Sign Determination
  // --------------------------------------------------------------------------

  /**
   * Determine if a point is inside the mesh using ray-cast intersection counting.
   *
   * Casts multiple rays from the point in different directions and counts
   * intersections with the mesh. If the majority of rays produce an odd
   * number of intersections, the point is classified as inside.
   *
   * Uses multiple ray directions for robustness — a single ray can miss
   * the mesh entirely or produce ambiguous results at tangent edges.
   *
   * @param point - The query point
   * @param rayCount - Number of ray directions to use (default from config)
   * @returns true if the point is inside the mesh
   */
  isPointInside(point: THREE.Vector3, rayCount: number = 3): boolean {
    // Try deterministic ray directions first
    // Using the primary axes plus some diagonals for robustness
    const directions = this.getSignRayDirections(rayCount);

    let insideVotes = 0;
    let totalVotes = 0;

    const ray = new THREE.Ray();

    for (const dir of directions) {
      ray.set(point, dir);

      // Use BVH-accelerated raycast
      const hits = this.bvh.raycast(ray, THREE.DoubleSide);

      // Filter out self-intersections at zero distance
      const validHits = hits.filter(h => h.distance > 1e-6);
      const intersectionCount = validHits.length;

      // Odd count = inside
      if (intersectionCount % 2 === 1) {
        insideVotes++;
      }
      totalVotes++;
    }

    // Majority vote: if more than half the rays say inside, classify as inside
    return totalVotes > 0 && insideVotes > totalVotes / 2;
  }

  /**
   * Generate ray directions for sign determination.
   *
   * Uses a mix of axis-aligned and diagonal directions for robustness.
   * The first direction is always +X (commonly the most reliable for
   * typical meshes), followed by other directions.
   */
  private getSignRayDirections(count: number): THREE.Vector3[] {
    // Predefined directions with good coverage
    const candidates = [
      new THREE.Vector3(1, 0, 0),       // +X
      new THREE.Vector3(0, 1, 0),       // +Y
      new THREE.Vector3(0, 0, 1),       // +Z
      new THREE.Vector3(1, 1, 0).normalize(),   // +X+Y
      new THREE.Vector3(0, 1, 1).normalize(),   // +Y+Z
      new THREE.Vector3(1, 0, 1).normalize(),   // +X+Z
      new THREE.Vector3(1, 1, 1).normalize(),   // +X+Y+Z
      new THREE.Vector3(-1, 0, 0),      // -X
      new THREE.Vector3(0, -1, 0),      // -Y
      new THREE.Vector3(0, 0, -1),      // -Z
    ];

    return candidates.slice(0, Math.min(count, candidates.length));
  }

  // --------------------------------------------------------------------------
  // Geometry Utilities
  // --------------------------------------------------------------------------

  /**
   * Create an indexed geometry from a non-indexed one.
   * MeshBVH requires indexed geometry for optimal performance.
   */
  private createIndexedGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;

    // Simple approach: create index as [0, 1, 2, 3, 4, 5, ...]
    // This is effectively non-indexed but satisfies the API contract
    const indices = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      indices[i] = i;
    }

    const newGeometry = geometry.clone();
    newGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    return newGeometry;
  }

  /**
   * Get the computed BVH (for advanced usage or caching).
   */
  getBVH(): any {
    return this.bvh;
  }

  /**
   * Get the mesh bounds.
   */
  getBounds(): THREE.Box3 {
    return this.meshBounds.clone();
  }
}

// ============================================================================
// OccupancyVolume — 3D Occupancy Grid for Cave Generation
// ============================================================================

/**
 * 3D occupancy volume for cave generation.
 *
 * Stores occupancy values (0.0 = empty/solid, 1.0 = tunnel/open) on a
 * regular 3D grid. Supports trilinear and tricubic interpolation for
 * smooth SDF evaluation, Voronoi-tiled placement with rotation, and
 * threshold-based wall thickness control.
 *
 * The occupancy convention matches the original Infinigen:
 * - 1.0 = inside a tunnel (empty/air)
 * - 0.0 = solid rock
 *
 * When converting to SDF, the sign convention flips:
 * - Negative SDF = inside the tunnel (carved out)
 * - Positive SDF = solid rock
 *
 * Usage:
 * ```typescript
 * const occupancy = OccupancyVolume.fromMesh(tunnelMesh, { resolution: 0.5 });
 * const isInside = occupancy.sample(new THREE.Vector3(5, 0, 5)) > 0.5;
 * const dist = occupancy.toSDF(new THREE.Vector3(5, 0, 5));
 * ```
 */
export class OccupancyVolume {
  /** Occupancy data (flat Float32Array, size = nx*ny*nz) */
  public data: Float32Array;

  /** Grid dimensions */
  public gridSize: [number, number, number];

  /** World-space AABB minimum corner */
  public boundsMin: THREE.Vector3;

  /** World-space AABB maximum corner */
  public boundsMax: THREE.Vector3;

  /** Voxel size in world units */
  public voxelSize: THREE.Vector3;

  /** Threshold for occupancy → solid/empty classification */
  public threshold: number;

  constructor(params: {
    gridSize: [number, number, number];
    boundsMin: THREE.Vector3;
    boundsMax: THREE.Vector3;
    data?: Float32Array;
    threshold?: number;
  }) {
    this.gridSize = params.gridSize;
    this.boundsMin = params.boundsMin.clone();
    this.boundsMax = params.boundsMax.clone();
    this.threshold = params.threshold ?? 0.5;

    const extent = new THREE.Vector3().subVectors(this.boundsMax, this.boundsMin);
    this.voxelSize = new THREE.Vector3(
      extent.x / this.gridSize[0],
      extent.y / this.gridSize[1],
      extent.z / this.gridSize[2],
    );

    const totalCells = this.gridSize[0] * this.gridSize[1] * this.gridSize[2];
    if (params.data) {
      if (params.data.length !== totalCells) {
        throw new Error(
          `[OccupancyVolume] Data length ${params.data.length} doesn't match grid size ${totalCells}`,
        );
      }
      this.data = params.data;
    } else {
      this.data = new Float32Array(totalCells);
      // Initialize to 0.0 (solid)
    }
  }

  // --------------------------------------------------------------------------
  // Factory Methods
  // --------------------------------------------------------------------------

  /**
   * Create an OccupancyVolume from a mesh using BVH-accelerated mesh_to_sdf.
   *
   * Converts the mesh to an SDF, then maps negative distances (inside mesh)
   * to occupancy 1.0 (tunnel/open), and positive distances (outside) to 0.0 (solid).
   *
   * @param mesh - Input mesh geometry
   * @param config - MeshToSDF configuration
   * @param threshold - Occupancy threshold for wall thickness (default 0.5)
   * @returns OccupancyVolume with occupancy values derived from the mesh
   */
  static async fromMesh(
    mesh: THREE.BufferGeometry | THREE.Mesh,
    config: Partial<MeshToSDFConfig> = {},
    threshold: number = 0.5,
  ): Promise<OccupancyVolume> {
    const converter = await MeshToSDF.create(mesh, config.bvhStrategy, config.bvhMaxLeafTris);
    const sdfGrid = converter.computeSDFGrid(config);

    // Convert SDF values to occupancy:
    // Negative SDF (inside tunnel) → occupancy 1.0
    // Positive SDF (solid rock) → occupancy 0.0
    // Transition region uses smooth step for anti-aliasing
    const occupancy = new Float32Array(sdfGrid.data.length);
    const wallThickness = (config.resolution ?? 0.5) * 0.5;

    for (let i = 0; i < sdfGrid.data.length; i++) {
      const dist = sdfGrid.data[i];
      if (dist < -wallThickness) {
        // Well inside the tunnel
        occupancy[i] = 1.0;
      } else if (dist > wallThickness) {
        // Well outside (solid rock)
        occupancy[i] = 0.0;
      } else {
        // Transition region: smooth step
        const t = (dist + wallThickness) / (2 * wallThickness);
        occupancy[i] = 1.0 - this.smoothStep(t);
      }
    }

    return new OccupancyVolume({
      gridSize: sdfGrid.gridSize,
      boundsMin: sdfGrid.bounds.min,
      boundsMax: sdfGrid.bounds.max,
      data: occupancy,
      threshold,
    });
  }

  /**
   * Create an OccupancyVolume from L-system cave tunnel data.
   *
   * Takes the path points and radii from the L-system generator and
   * rasterizes them into a 3D occupancy grid.
   *
   * @param tunnelData - Output from LSystemCaveGenerator.generate()
   * @param threshold - Occupancy threshold (default 0.5)
   * @returns OccupancyVolume with tunnel occupancy values
   */
  static fromTunnelData(
    tunnelData: CaveTunnelData,
    threshold: number = 0.5,
  ): OccupancyVolume {
    const nx = tunnelData.gridSize;
    const ny = tunnelData.gridSize;
    const nz = tunnelData.gridSize;

    const boundsMin = tunnelData.gridOrigin;
    const cellSize = tunnelData.gridCellSize;
    const boundsMax = new THREE.Vector3(
      boundsMin.x + nx * cellSize,
      boundsMin.y + ny * cellSize,
      boundsMin.z + nz * cellSize,
    );

    return new OccupancyVolume({
      gridSize: [nx, ny, nz],
      boundsMin,
      boundsMax,
      data: tunnelData.occupancy,
      threshold,
    });
  }

  // --------------------------------------------------------------------------
  // Sampling
  // --------------------------------------------------------------------------

  /**
   * Sample occupancy at a world-space position using trilinear interpolation.
   *
   * @param position - World-space position
   * @returns Interpolated occupancy value (0.0 to 1.0)
   */
  sample(position: THREE.Vector3): number {
    const fx = (position.x - this.boundsMin.x) / this.voxelSize.x - 0.5;
    const fy = (position.y - this.boundsMin.y) / this.voxelSize.y - 0.5;
    const fz = (position.z - this.boundsMin.z) / this.voxelSize.z - 0.5;

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);

    const dx = fx - x0;
    const dy = fy - y0;
    const dz = fz - z0;

    // Trilinear interpolation
    const v000 = this.getSafeValue(x0, y0, z0);
    const v100 = this.getSafeValue(x0 + 1, y0, z0);
    const v010 = this.getSafeValue(x0, y0 + 1, z0);
    const v110 = this.getSafeValue(x0 + 1, y0 + 1, z0);
    const v001 = this.getSafeValue(x0, y0, z0 + 1);
    const v101 = this.getSafeValue(x0 + 1, y0, z0 + 1);
    const v011 = this.getSafeValue(x0, y0 + 1, z0 + 1);
    const v111 = this.getSafeValue(x0 + 1, y0 + 1, z0 + 1);

    // Interpolate along X
    const v00 = v000 * (1 - dx) + v100 * dx;
    const v01 = v010 * (1 - dx) + v110 * dx;
    const v10 = v001 * (1 - dx) + v101 * dx;
    const v11 = v011 * (1 - dx) + v111 * dx;

    // Interpolate along Y
    const v0 = v00 * (1 - dy) + v01 * dy;
    const v1 = v10 * (1 - dy) + v11 * dy;

    // Interpolate along Z
    return v0 * (1 - dz) + v1 * dz;
  }

  /**
   * Sample occupancy using tricubic interpolation for smoother results.
   *
   * Uses Catmull-Rom splines for higher-quality interpolation at the cost
   * of sampling 64 (4³) voxels instead of 8 (2³) per query.
   *
   * @param position - World-space position
   * @returns Smoothly interpolated occupancy value
   */
  sampleCubic(position: THREE.Vector3): number {
    const fx = (position.x - this.boundsMin.x) / this.voxelSize.x - 0.5;
    const fy = (position.y - this.boundsMin.y) / this.voxelSize.y - 0.5;
    const fz = (position.z - this.boundsMin.z) / this.voxelSize.z - 0.5;

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);

    const dx = fx - x0;
    const dy = fy - y0;
    const dz = fz - z0;

    // Tricubic using Catmull-Rom: sample 4x4x4 neighborhood
    // First interpolate along X for each of the 4x4 YZ slices
    const yzSlices = new Float32Array(16);
    let idx = 0;
    for (let j = -1; j <= 2; j++) {
      for (let k = -1; k <= 2; k++) {
        const v0 = this.getSafeValue(x0 - 1, y0 + j, z0 + k);
        const v1 = this.getSafeValue(x0, y0 + j, z0 + k);
        const v2 = this.getSafeValue(x0 + 1, y0 + j, z0 + k);
        const v3 = this.getSafeValue(x0 + 2, y0 + j, z0 + k);
        yzSlices[idx++] = this.catmullRom(v0, v1, v2, v3, dx);
      }
    }

    // Then interpolate along Y
    const zSlice = new Float32Array(4);
    for (let k = 0; k < 4; k++) {
      const base = k * 4;
      zSlice[k] = this.catmullRom(
        yzSlices[base],
        yzSlices[base + 1],
        yzSlices[base + 2],
        yzSlices[base + 3],
        dy,
      );
    }

    // Finally interpolate along Z
    return this.catmullRom(zSlice[0], zSlice[1], zSlice[2], zSlice[3], dz);
  }

  /**
   * Convert occupancy to SDF value at a point.
   *
   * Returns negative distance inside tunnels (occupancy > threshold),
   * positive distance in solid rock (occupancy < threshold).
   * Uses trilinear interpolation for the occupancy sample, then converts
   * to distance via a smooth mapping function.
   *
   * @param position - World-space position
   * @returns Signed distance value
   */
  toSDF(position: THREE.Vector3): number {
    const occ = this.sample(position);

    // Map occupancy to signed distance:
    // occupancy = 1.0 → deeply inside tunnel → large negative distance
    // occupancy = threshold → at the boundary → zero distance
    // occupancy = 0.0 → deeply in solid rock → large positive distance
    const normalizedOcc = (occ - this.threshold) / (1.0 - this.threshold);
    const minDim = Math.min(this.voxelSize.x, this.voxelSize.y, this.voxelSize.z);
    return -normalizedOcc * minDim;
  }

  // --------------------------------------------------------------------------
  // Voronoi-Tiled Placement
  // --------------------------------------------------------------------------

  /**
   * Evaluate the occupancy at a point transformed by Voronoi tile placement.
   *
   * This enables stamping the occupancy volume at multiple tile positions
   * with rotation, creating a Voronoi-tiled pattern. The tile transform
   * maps the query point into the local coordinate system of the tile.
   *
   * @param position - World-space query point
   * @param tilePosition - Center position of the tile
   * @param tileRotation - Rotation of the tile (quaternion)
   * @param useCubic - Whether to use tricubic interpolation (default: false)
   * @returns Occupancy value at the transformed point
   */
  sampleTiled(
    position: THREE.Vector3,
    tilePosition: THREE.Vector3,
    tileRotation: THREE.Quaternion,
    useCubic: boolean = false,
  ): number {
    // Transform world point into tile-local coordinates
    const localPos = position.clone().sub(tilePosition);
    const inverseRotation = tileRotation.clone().invert();
    localPos.applyQuaternion(inverseRotation);

    // Sample the occupancy volume at the local position
    return useCubic ? this.sampleCubic(localPos) : this.sample(localPos);
  }

  /**
   * Evaluate occupancy at a point considering multiple Voronoi tiles.
   *
   * Takes the maximum occupancy across all tiles that cover the point,
   * effectively unioning the tunnel spaces.
   *
   * @param position - World-space query point
   * @param tiles - Array of tile positions and rotations
   * @returns Maximum occupancy across all covering tiles
   */
  sampleVoronoiTiled(
    position: THREE.Vector3,
    tiles: Array<{ position: THREE.Vector3; rotation: THREE.Quaternion }>,
  ): number {
    let maxOcc = 0;

    for (const tile of tiles) {
      const occ = this.sampleTiled(position, tile.position, tile.rotation);
      maxOcc = Math.max(maxOcc, occ);
    }

    return maxOcc;
  }

  // --------------------------------------------------------------------------
  // Accessors
  // --------------------------------------------------------------------------

  /**
   * Get occupancy value at grid coordinates (integer indices).
   */
  getValueAtGrid(gx: number, gy: number, gz: number): number {
    if (
      gx < 0 || gx >= this.gridSize[0] ||
      gy < 0 || gy >= this.gridSize[1] ||
      gz < 0 || gz >= this.gridSize[2]
    ) {
      return 0.0;
    }
    const idx =
      gz * this.gridSize[0] * this.gridSize[1] +
      gy * this.gridSize[0] +
      gx;
    return this.data[idx];
  }

  /**
   * Set occupancy value at grid coordinates.
   */
  setValueAtGrid(gx: number, gy: number, gz: number, value: number): void {
    if (
      gx < 0 || gx >= this.gridSize[0] ||
      gy < 0 || gy >= this.gridSize[1] ||
      gz < 0 || gz >= this.gridSize[2]
    ) {
      return;
    }
    const idx =
      gz * this.gridSize[0] * this.gridSize[1] +
      gy * this.gridSize[0] +
      gx;
    this.data[idx] = value;
  }

  /**
   * Check if a world-space position is inside a tunnel.
   */
  isInside(position: THREE.Vector3): boolean {
    return this.sample(position) > this.threshold;
  }

  /**
   * Get world-space position from grid coordinates.
   */
  getPosition(gx: number, gy: number, gz: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.boundsMin.x + (gx + 0.5) * this.voxelSize.x,
      this.boundsMin.y + (gy + 0.5) * this.voxelSize.y,
      this.boundsMin.z + (gz + 0.5) * this.voxelSize.z,
    );
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private getSafeValue(gx: number, gy: number, gz: number): number {
    // Clamp to grid bounds (boundary = solid = 0.0)
    if (
      gx < 0 || gx >= this.gridSize[0] ||
      gy < 0 || gy >= this.gridSize[1] ||
      gz < 0 || gz >= this.gridSize[2]
    ) {
      return 0.0;
    }
    const idx =
      gz * this.gridSize[0] * this.gridSize[1] +
      gy * this.gridSize[0] +
      gx;
    return this.data[idx];
  }

  /**
   * Catmull-Rom spline interpolation between v1 and v2 using v0, v3 as control points.
   */
  private catmullRom(v0: number, v1: number, v2: number, v3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * v1 +
        (-v0 + v2) * t +
        (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
        (-v0 + 3 * v1 - 3 * v2 + v3) * t3)
    );
  }

  /**
   * Smooth step function for occupancy → SDF transition.
   */
  private static smoothStep(t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped * clamped * (3 - 2 * clamped);
  }
}

// ============================================================================
// SDFGrid — General-Purpose SDF Storage
// ============================================================================

/**
 * General-purpose 3D SDF grid with interpolation and composition support.
 *
 * Stores signed distance values on a regular 3D grid within an AABB.
 * Supports:
 * - Trilinear interpolation for smooth evaluation
 * - Composition with other SDF primitives via combinators
 * - Serialization/deserialization for caching and transfer
 * - Gradient computation for surface normal estimation
 *
 * Compatible with the existing SignedDistanceField class but adds
 * additional functionality for composition and serialization.
 *
 * Usage:
 * ```typescript
 * const grid = new SDFGrid({ gridSize: [32, 32, 32], bounds, voxelSize });
 * grid.setValueAtGrid(16, 16, 16, -1.0); // Inside point
 *
 * const dist = grid.sample(new THREE.Vector3(5, 5, 5)); // Trilinear
 * const normal = grid.gradient(new THREE.Vector3(5, 5, 5)); // Central diff
 *
 * // Compose with another grid
 * const combined = SDFGrid.compose(gridA, gridB, 'union', 0.5);
 * ```
 */
export class SDFGrid {
  /** Signed distance data (flat Float32Array) */
  public data: Float32Array;

  /** Grid dimensions [nx, ny, nz] */
  public gridSize: [number, number, number];

  /** World-space AABB bounds */
  public bounds: THREE.Box3;

  /** Voxel size in world units */
  public voxelSize: THREE.Vector3;

  constructor(params: {
    gridSize: [number, number, number];
    bounds: THREE.Box3;
    voxelSize: THREE.Vector3;
    data?: Float32Array;
  }) {
    this.gridSize = params.gridSize;
    this.bounds = params.bounds.clone();
    this.voxelSize = params.voxelSize.clone();

    const totalCells = this.gridSize[0] * this.gridSize[1] * this.gridSize[2];
    if (params.data) {
      if (params.data.length !== totalCells) {
        throw new Error(
          `[SDFGrid] Data length ${params.data.length} doesn't match grid size ${totalCells}`,
        );
      }
      this.data = params.data;
    } else {
      this.data = new Float32Array(totalCells);
      this.data.fill(Infinity);
    }
  }

  // --------------------------------------------------------------------------
  // Sampling
  // --------------------------------------------------------------------------

  /**
   * Sample the SDF at a world-space position using trilinear interpolation.
   *
   * @param position - World-space query position
   * @returns Interpolated signed distance value
   */
  sample(position: THREE.Vector3): number {
    const fx = (position.x - this.bounds.min.x) / this.voxelSize.x - 0.5;
    const fy = (position.y - this.bounds.min.y) / this.voxelSize.y - 0.5;
    const fz = (position.z - this.bounds.min.z) / this.voxelSize.z - 0.5;

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);

    const dx = fx - x0;
    const dy = fy - y0;
    const dz = fz - z0;

    // 8 corner values
    const v000 = this.getSafeValue(x0, y0, z0);
    const v100 = this.getSafeValue(x0 + 1, y0, z0);
    const v010 = this.getSafeValue(x0, y0 + 1, z0);
    const v110 = this.getSafeValue(x0 + 1, y0 + 1, z0);
    const v001 = this.getSafeValue(x0, y0, z0 + 1);
    const v101 = this.getSafeValue(x0 + 1, y0, z0 + 1);
    const v011 = this.getSafeValue(x0, y0 + 1, z0 + 1);
    const v111 = this.getSafeValue(x0 + 1, y0 + 1, z0 + 1);

    // Trilinear interpolation
    const v00 = v000 * (1 - dx) + v100 * dx;
    const v01 = v010 * (1 - dx) + v110 * dx;
    const v10 = v001 * (1 - dx) + v101 * dx;
    const v11 = v011 * (1 - dx) + v111 * dx;

    const v0 = v00 * (1 - dy) + v01 * dy;
    const v1 = v10 * (1 - dy) + v11 * dy;

    return v0 * (1 - dz) + v1 * dz;
  }

  /**
   * Compute the SDF gradient at a world-space position using central differences.
   *
   * The gradient points in the direction of increasing distance (outward normal).
   * Returns a normalized vector.
   *
   * @param position - World-space query position
   * @returns Normalized gradient vector
   */
  gradient(position: THREE.Vector3): THREE.Vector3 {
    const eps = 0.5;
    const sx = eps * this.voxelSize.x;
    const sy = eps * this.voxelSize.y;
    const sz = eps * this.voxelSize.z;

    const dx =
      this.sample(new THREE.Vector3(position.x + sx, position.y, position.z)) -
      this.sample(new THREE.Vector3(position.x - sx, position.y, position.z));
    const dy =
      this.sample(new THREE.Vector3(position.x, position.y + sy, position.z)) -
      this.sample(new THREE.Vector3(position.x, position.y - sy, position.z));
    const dz =
      this.sample(new THREE.Vector3(position.x, position.y, position.z + sz)) -
      this.sample(new THREE.Vector3(position.x, position.y, position.z - sz));

    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-10) {
      return new THREE.Vector3(0, 1, 0); // Default up
    }
    return new THREE.Vector3(dx / len, dy / len, dz / len);
  }

  // --------------------------------------------------------------------------
  // Grid Accessors
  // --------------------------------------------------------------------------

  /**
   * Set SDF value at grid coordinates (integer indices).
   */
  setValueAtGrid(gx: number, gy: number, gz: number, value: number): void {
    if (
      gx < 0 || gx >= this.gridSize[0] ||
      gy < 0 || gy >= this.gridSize[1] ||
      gz < 0 || gz >= this.gridSize[2]
    ) {
      return;
    }
    const idx =
      gz * this.gridSize[0] * this.gridSize[1] +
      gy * this.gridSize[0] +
      gx;
    this.data[idx] = value;
  }

  /**
   * Get SDF value at grid coordinates (integer indices).
   */
  getValueAtGrid(gx: number, gy: number, gz: number): number {
    return this.getSafeValue(gx, gy, gz);
  }

  /**
   * Get world-space position from grid coordinates.
   */
  getPosition(gx: number, gy: number, gz: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.bounds.min.x + (gx + 0.5) * this.voxelSize.x,
      this.bounds.min.y + (gy + 0.5) * this.voxelSize.y,
      this.bounds.min.z + (gz + 0.5) * this.voxelSize.z,
    );
  }

  /**
   * Check if a world-space position is inside the SDF (negative distance).
   */
  isInside(position: THREE.Vector3): boolean {
    return this.sample(position) < 0;
  }

  // --------------------------------------------------------------------------
  // Composition (Combinators)
  // --------------------------------------------------------------------------

  /**
   * Compose this SDF grid with another using a boolean operation.
   *
   * Creates a new SDFGrid where each voxel is the result of combining
   * the corresponding voxels from both grids using the specified operation.
   *
   * @param other - Another SDFGrid to compose with
   * @param operation - Boolean operation: 'union', 'intersection', 'difference'
   * @param blendFactor - Blend factor for smooth operations (0 = sharp)
   * @returns New SDFGrid with the composed result
   */
  compose(
    other: SDFGrid,
    operation: 'union' | 'intersection' | 'difference' | 'smooth-union',
    blendFactor: number = 0,
  ): SDFGrid {
    const result = new SDFGrid({
      gridSize: [...this.gridSize] as [number, number, number],
      bounds: this.bounds.clone(),
      voxelSize: this.voxelSize.clone(),
    });

    // Determine union bounds for sampling
    const combinedBounds = this.bounds.clone().union(other.bounds);

    for (let gz = 0; gz < this.gridSize[2]; gz++) {
      for (let gy = 0; gy < this.gridSize[1]; gy++) {
        for (let gx = 0; gx < this.gridSize[0]; gx++) {
          const pos = this.getPosition(gx, gy, gz);
          const d1 = this.sample(pos);
          const d2 = other.sample(pos);

          let value: number;
          switch (operation) {
            case 'union':
              value = Math.min(d1, d2);
              break;
            case 'intersection':
              value = Math.max(d1, d2);
              break;
            case 'difference':
              value = Math.min(d1, -d2);
              break;
            case 'smooth-union':
              value = smoothUnion(d1, d2, blendFactor);
              break;
            default:
              value = Math.min(d1, d2);
          }

          result.setValueAtGrid(gx, gy, gz, value);
        }
      }
    }

    return result;
  }

  /**
   * Offset the SDF surface by a distance.
   *
   * Creates a new SDFGrid where every value is shifted by `distance`.
   * Positive distance expands the solid region, negative contracts it.
   *
   * @param distance - Offset distance
   * @returns New SDFGrid with offset values
   */
  offset(distance: number): SDFGrid {
    const result = new SDFGrid({
      gridSize: [...this.gridSize] as [number, number, number],
      bounds: this.bounds.clone(),
      voxelSize: this.voxelSize.clone(),
    });

    for (let i = 0; i < this.data.length; i++) {
      result.data[i] = this.data[i] - distance;
    }

    return result;
  }

  /**
   * Create an SDF evaluator function from this grid.
   *
   * The returned function is compatible with the SDFEvaluator type used
   * by the TerrainElementSystem and can be composed with other evaluators.
   *
   * @returns Function that maps a point to { distance, materialId }
   */
  toEvaluator(): (point: THREE.Vector3) => { distance: number; materialId: number } {
    return (point: THREE.Vector3) => ({
      distance: this.sample(point),
      materialId: 0, // Default material; caller should override
    });
  }

  // --------------------------------------------------------------------------
  // Serialization
  // --------------------------------------------------------------------------

  /**
   * Serialize the SDF grid to a JSON-friendly format.
   *
   * The distance data is encoded as base64 for compact transfer.
   *
   * @returns Serialized representation
   */
  serialize(): SDFGridSerialized {
    // Encode Float32Array to base64
    const bytes = new Uint8Array(this.data.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const dataBase64 = btoa(binary);

    return {
      gridSize: [...this.gridSize] as [number, number, number],
      boundsMin: [this.bounds.min.x, this.bounds.min.y, this.bounds.min.z],
      boundsMax: [this.bounds.max.x, this.bounds.max.y, this.bounds.max.z],
      voxelSize: [this.voxelSize.x, this.voxelSize.y, this.voxelSize.z],
      dataBase64,
    };
  }

  /**
   * Deserialize an SDF grid from its serialized format.
   *
   * @param serialized - The serialized representation
   * @returns Reconstructed SDFGrid
   */
  static deserialize(serialized: SDFGridSerialized): SDFGrid {
    // Decode base64 to Float32Array
    const binary = atob(serialized.dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const data = new Float32Array(bytes.buffer);

    return new SDFGrid({
      gridSize: serialized.gridSize,
      bounds: new THREE.Box3(
        new THREE.Vector3(...serialized.boundsMin),
        new THREE.Vector3(...serialized.boundsMax),
      ),
      voxelSize: new THREE.Vector3(...serialized.voxelSize),
      data,
    });
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private getSafeValue(gx: number, gy: number, gz: number): number {
    if (
      gx < 0 || gx >= this.gridSize[0] ||
      gy < 0 || gy >= this.gridSize[1] ||
      gz < 0 || gz >= this.gridSize[2]
    ) {
      // Outside grid bounds: return large positive distance (outside solid)
      return Infinity;
    }
    const idx =
      gz * this.gridSize[0] * this.gridSize[1] +
      gy * this.gridSize[0] +
      gx;
    return this.data[idx];
  }
}

// ============================================================================
// Cave Integration — L-System Tunnel Mesh → MeshToSDF → OccupancyVolume
// ============================================================================

/**
 * Configuration for the cave SDF pipeline.
 */
export interface CaveSDFPipelineConfig {
  /** L-system grammar configuration */
  grammar: Partial<CaveGrammarConfig>;
  /** Random seed for the L-system */
  seed: number;
  /** Mesh-to-SDF resolution (voxel size in world units). Default: 0.5 */
  sdfResolution: number;
  /** BVH strategy. Default: 2 (SAH) */
  bvhStrategy: number;
  /** BVH max leaf triangles. Default: 10 */
  bvhMaxLeafTris: number;
  /** Bounds padding around the tunnel mesh (world units). Default: 2.0 */
  boundsPadding: number;
  /** Occupancy threshold for wall thickness. Default: 0.5 */
  occupancyThreshold: number;
  /** Whether to use BVH-accelerated path (true) or direct tunnel occupancy (false) */
  useBVHAcceleration: boolean;
  /** Tunnel mesh detail level (number of radial segments). Default: 12 */
  tunnelMeshSegments: number;
}

/** Default configuration for the cave SDF pipeline */
export const DEFAULT_CAVE_SDF_PIPELINE_CONFIG: CaveSDFPipelineConfig = {
  grammar: {},
  seed: 42,
  sdfResolution: 0.5,
  bvhStrategy: 2,
  bvhMaxLeafTris: 10,
  boundsPadding: 2.0,
  occupancyThreshold: 0.5,
  useBVHAcceleration: true,
  tunnelMeshSegments: 12,
};

/**
 * Result of the cave SDF pipeline.
 */
export interface CaveSDFPipelineResult {
  /** The L-system cave tunnel data (points, radii, occupancy) */
  tunnelData: CaveTunnelData;
  /** Occupancy volume (from direct tunnel rasterization or BVH mesh-to-SDF) */
  occupancy: OccupancyVolume;
  /** SDF grid (only available if useBVHAcceleration is true) */
  sdfGrid: SDFGrid | null;
  /** The tunnel mesh geometry (only created if useBVHAcceleration is true) */
  tunnelMesh: THREE.BufferGeometry | null;
}

/**
 * Generate a tunnel mesh from L-system path data.
 *
 * Creates a tube geometry that follows the tunnel path with variable radius.
 * This mesh can then be converted to SDF using BVH-accelerated queries.
 *
 * @param points - Path points along the tunnel
 * @param radii - Radius at each point
 * @param segments - Number of radial segments (default: 12)
 * @returns BufferGeometry representing the tunnel mesh
 */
export function generateTunnelMesh(
  points: THREE.Vector3[],
  radii: number[],
  segments: number = 12,
): THREE.BufferGeometry {
  if (points.length < 2) {
    // Degenerate case: return a small sphere
    const geom = new THREE.SphereGeometry(radii[0] || 1, segments, segments);
    geom.translate(points[0]?.x || 0, points[0]?.y || 0, points[0]?.z || 0);
    return geom;
  }

  // Build the tunnel as a series of connected ring segments
  const positions: number[] = [];
  const indices: number[] = [];

  // Compute tangent frames along the path for proper ring orientation
  const tangents: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];

  for (let i = 0; i < points.length; i++) {
    let tangent: THREE.Vector3;
    if (i === 0) {
      tangent = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    } else if (i === points.length - 1) {
      tangent = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
    } else {
      tangent = new THREE.Vector3()
        .subVectors(points[i + 1], points[i - 1])
        .normalize();
    }
    tangents.push(tangent);

    // Compute a consistent normal/binormal frame
    let normal: THREE.Vector3;
    if (i === 0) {
      // Pick an arbitrary perpendicular direction
      if (Math.abs(tangent.y) < 0.99) {
        normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      } else {
        normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(1, 0, 0)).normalize();
      }
    } else {
      // Use previous normal, project onto the plane perpendicular to new tangent
      normal = normals[i - 1].clone();
      normal.add(
        tangent.clone().multiplyScalar(-normal.dot(tangent)),
      ).normalize();
      if (normal.lengthSq() < 1e-6) {
        if (Math.abs(tangent.y) < 0.99) {
          normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
        } else {
          normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(1, 0, 0)).normalize();
        }
      }
    }
    normals.push(normal);
    binormals.push(new THREE.Vector3().crossVectors(tangent, normal).normalize());
  }

  // Generate ring vertices for each path point
  for (let i = 0; i < points.length; i++) {
    const center = points[i];
    const radius = radii[i];
    const normal = normals[i];
    const binormal = binormals[i];

    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Vertex position = center + radius * (cos * normal + sin * binormal)
      const vx = center.x + radius * (cos * normal.x + sin * binormal.x);
      const vy = center.y + radius * (cos * normal.y + sin * binormal.y);
      const vz = center.z + radius * (cos * normal.z + sin * binormal.z);

      positions.push(vx, vy, vz);
    }
  }

  // Generate triangle indices connecting adjacent rings
  const vertsPerRing = segments + 1;
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * vertsPerRing + j;
      const b = i * vertsPerRing + j + 1;
      const c = (i + 1) * vertsPerRing + j;
      const d = (i + 1) * vertsPerRing + j + 1;

      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  // Add end caps
  // Start cap
  const startCapCenter = positions.length / 3;
  positions.push(points[0].x, points[0].y, points[0].z);
  for (let j = 0; j < segments; j++) {
    indices.push(startCapCenter, j + 1, j);
  }

  // End cap
  const endCapCenter = positions.length / 3;
  const lastRingStart = (points.length - 1) * vertsPerRing;
  positions.push(
    points[points.length - 1].x,
    points[points.length - 1].y,
    points[points.length - 1].z,
  );
  for (let j = 0; j < segments; j++) {
    indices.push(endCapCenter, lastRingStart + j, lastRingStart + j + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Run the full cave SDF pipeline: L-system → tunnel mesh → MeshToSDF → OccupancyVolume.
 *
 * This function orchestrates the complete pipeline for converting L-system
 * cave tunnel paths into a voxelized SDF representation that can be used
 * for terrain generation.
 *
 * Two paths are supported:
 * 1. **BVH-accelerated** (default): Generates a 3D tunnel mesh, builds a BVH,
 *    and uses MeshToSDF for accurate signed distance computation. Better quality
 *    but requires mesh generation.
 * 2. **Direct occupancy**: Uses the L-system generator's built-in occupancy
 *    rasterization (distance from point to line segment). Faster but less
 *    accurate for complex tunnel shapes.
 *
 * @param config - Pipeline configuration
 * @returns Pipeline result with tunnel data, occupancy volume, and optionally SDF grid
 */
export function caveTunnelToSDF(
  config: Partial<CaveSDFPipelineConfig> = {},
): CaveSDFPipelineResult {
  const cfg: CaveSDFPipelineConfig = {
    ...DEFAULT_CAVE_SDF_PIPELINE_CONFIG,
    ...config,
  };

  // Step 1: Generate L-system cave tunnel data
  const caveGenerator = new LSystemCaveGenerator();
  const tunnelData = caveGenerator.generate(cfg.seed, cfg.grammar);

  // Step 2: Create occupancy volume
  let occupancy: OccupancyVolume;
  let sdfGrid: SDFGrid | null = null;
  let tunnelMesh: THREE.BufferGeometry | null = null;

  if (cfg.useBVHAcceleration && tunnelData.points.length >= 2) {
    // BVH-accelerated path:
    // Generate tunnel mesh → build BVH → compute SDF → convert to occupancy
    tunnelMesh = generateTunnelMesh(
      tunnelData.points,
      tunnelData.radii,
      cfg.tunnelMeshSegments,
    );

    const meshToSDF = new MeshToSDF(tunnelMesh, cfg.bvhStrategy, cfg.bvhMaxLeafTris);
    sdfGrid = meshToSDF.computeSDFGrid({
      resolution: cfg.sdfResolution,
      boundsPadding: cfg.boundsPadding,
    });

    // Convert SDF grid to occupancy
    // Negative SDF (inside tunnel) → occupancy 1.0
    // Positive SDF (outside) → occupancy 0.0
    const occData = new Float32Array(sdfGrid.data.length);
    const wallThickness = cfg.sdfResolution * 0.5;

    for (let i = 0; i < sdfGrid.data.length; i++) {
      const dist = sdfGrid.data[i];
      if (dist < -wallThickness) {
        occData[i] = 1.0;
      } else if (dist > wallThickness) {
        occData[i] = 0.0;
      } else {
        // Smooth transition
        const t = (dist + wallThickness) / (2 * wallThickness);
        const clamped = Math.max(0, Math.min(1, t));
        occData[i] = 1.0 - clamped * clamped * (3 - 2 * clamped);
      }
    }

    occupancy = new OccupancyVolume({
      gridSize: sdfGrid.gridSize,
      boundsMin: sdfGrid.bounds.min,
      boundsMax: sdfGrid.bounds.max,
      data: occData,
      threshold: cfg.occupancyThreshold,
    });
  } else {
    // Direct occupancy path: use L-system's built-in rasterization
    occupancy = OccupancyVolume.fromTunnelData(tunnelData, cfg.occupancyThreshold);
  }

  return {
    tunnelData,
    occupancy,
    sdfGrid,
    tunnelMesh,
  };
}

/**
 * Convenience function: Create an SDF evaluator from L-system cave data.
 *
 * Generates the cave tunnel SDF pipeline and returns an evaluator function
 * that can be plugged into the TerrainElementSystem's composition framework.
 *
 * @param seed - Random seed for the L-system
 * @param grammarConfig - Optional grammar overrides
 * @param resolution - SDF resolution (voxel size)
 * @returns SDF evaluator function compatible with SDFPrimitives.SDFEvaluator
 */
export function createCaveSDFEvaluator(
  seed: number = 42,
  grammarConfig: Partial<CaveGrammarConfig> = {},
  resolution: number = 0.5,
): (point: THREE.Vector3) => { distance: number; materialId: number } {
  const result = caveTunnelToSDF({
    seed,
    grammar: grammarConfig,
    sdfResolution: resolution,
    useBVHAcceleration: true,
  });

  if (result.sdfGrid) {
    return result.sdfGrid.toEvaluator();
  }

  // Fallback to occupancy-based evaluation
  return (point: THREE.Vector3) => ({
    distance: result.occupancy.toSDF(point),
    materialId: 0,
  });
}
