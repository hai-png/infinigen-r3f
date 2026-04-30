/**
 * OCMesher Alternative - Mesh Operations Utility
 * 
 * This module provides mesh operations similar to OcMesher, including:
 * - Boolean operations (union, intersection, difference)
 * - Mesh simplification/decimation
 * - Remeshing and subdivision
 * - CSG operations
 * - Voxelization
 * 
 * Note: This is a TypeScript implementation that serves as an alternative
 * to the original OcMesher C++ library. For production use with complex
 * operations, consider integrating with libraries like:
 * - mankattan/three-csg-ts
 * - gkjohnson/three-mesh-bvh
 * - js-libcsg
 */

import {
  BufferGeometry,
  Mesh,
  Vector3,
  Matrix4,
  Box3,
  Triangle,
  Ray,
  Color,
} from 'three';

export interface MeshBooleanOptions {
  resolution?: number;
  preserveUVs?: boolean;
  cleanup?: boolean;
}

export interface SimplifyOptions {
  targetFaceCount: number;
  aggressiveness?: number;
  preserveBorders?: boolean;
  preserveUVs?: boolean;
}

export interface SubdivideOptions {
  iterations: number;
  smoothNormals?: boolean;
  preserveUVs?: boolean;
}

export interface VoxelizationOptions {
  resolution: number;
  solid?: boolean;
  includeInterior?: boolean;
}

export interface CSGResult {
  geometry: BufferGeometry;
  operation: 'union' | 'intersection' | 'difference';
  success: boolean;
  warnings?: string[];
}

/**
 * Mesh Operations Provider
 * 
 * Provides mesh boolean operations, simplification, and other mesh processing
 * capabilities as an alternative to OcMesher.
 */
export class MeshOperations {
  private static readonly EPSILON = 1e-10;

  /**
   * Perform boolean union of two meshes
   */
  static union(
    meshA: Mesh,
    meshB: Mesh,
    options: MeshBooleanOptions = {}
  ): CSGResult {
    const { preserveUVs = true, cleanup = true } = options;
    const warnings: string[] = [];

    try {
      // Convert meshes to geometries
      const geomA = meshA.geometry.clone();
      const geomB = meshB.geometry.clone();

      // Apply world transforms
      geomA.applyMatrix4(meshA.matrixWorld);
      geomB.applyMatrix4(meshB.matrixWorld);

      // Perform voxel-based union (simplified approach)
      const result = this.voxelBasedBoolean(geomA, geomB, 'union', {
        resolution: options.resolution ?? 128,
        preserveUVs,
      });

      if (cleanup && result.geometry) {
        this.cleanupGeometry(result.geometry);
      }

      return {
        geometry: result.geometry,
        operation: 'union',
        success: true,
        warnings,
      };
    } catch (error) {
      warnings.push(`Union operation failed: ${error}`);
      return {
        geometry: new BufferGeometry(),
        operation: 'union',
        success: false,
        warnings,
      };
    }
  }

  /**
   * Perform boolean intersection of two meshes
   */
  static intersection(
    meshA: Mesh,
    meshB: Mesh,
    options: MeshBooleanOptions = {}
  ): CSGResult {
    const { preserveUVs = true, cleanup = true } = options;
    const warnings: string[] = [];

    try {
      const geomA = meshA.geometry.clone();
      const geomB = meshB.geometry.clone();

      geomA.applyMatrix4(meshA.matrixWorld);
      geomB.applyMatrix4(meshB.matrixWorld);

      const result = this.voxelBasedBoolean(geomA, geomB, 'intersection', {
        resolution: options.resolution ?? 128,
        preserveUVs,
      });

      if (cleanup && result.geometry) {
        this.cleanupGeometry(result.geometry);
      }

      return {
        geometry: result.geometry,
        operation: 'intersection',
        success: true,
        warnings,
      };
    } catch (error) {
      warnings.push(`Intersection operation failed: ${error}`);
      return {
        geometry: new BufferGeometry(),
        operation: 'intersection',
        success: false,
        warnings,
      };
    }
  }

  /**
   * Perform boolean difference (A - B) of two meshes
   */
  static difference(
    meshA: Mesh,
    meshB: Mesh,
    options: MeshBooleanOptions = {}
  ): CSGResult {
    const { preserveUVs = true, cleanup = true } = options;
    const warnings: string[] = [];

    try {
      const geomA = meshA.geometry.clone();
      const geomB = meshB.geometry.clone();

      geomA.applyMatrix4(meshA.matrixWorld);
      geomB.applyMatrix4(meshB.matrixWorld);

      const result = this.voxelBasedBoolean(geomA, geomB, 'difference', {
        resolution: options.resolution ?? 128,
        preserveUVs,
      });

      if (cleanup && result.geometry) {
        this.cleanupGeometry(result.geometry);
      }

      return {
        geometry: result.geometry,
        operation: 'difference',
        success: true,
        warnings,
      };
    } catch (error) {
      warnings.push(`Difference operation failed: ${error}`);
      return {
        geometry: new BufferGeometry(),
        operation: 'difference',
        success: false,
        warnings,
      };
    }
  }

  /**
   * Simplify mesh by reducing face count
   */
  static simplify(
    geometry: BufferGeometry,
    options: SimplifyOptions
  ): BufferGeometry {
    const {
      targetFaceCount,
      aggressiveness = 5,
      preserveBorders = true,
      preserveUVs = true,
    } = options;

    const positions = geometry.getAttribute('position');
    const indices = geometry.getIndex();
    const normals = geometry.getAttribute('normal');
    const uvs = geometry.getAttribute('uv');

    if (!indices || !positions) {
      return geometry.clone();
    }

    // Simple vertex clustering approach
    const faceCount = indices.count / 3;
    const reductionRatio = targetFaceCount / faceCount;

    if (reductionRatio >= 1) {
      return geometry.clone();
    }

    // Create bounding box for spatial hashing
    const bbox = new Box3().setFromAttribute(positions);
    const size = new Vector3();
    bbox.getSize(size);

    // Calculate grid dimensions based on target face count
    const gridSize = Math.ceil(Math.cbrt(targetFaceCount * 2));
    const cellSize = new Vector3(
      size.x / gridSize,
      size.y / gridSize,
      size.z / gridSize
    );

    // Cluster vertices
    const vertexClusters = new Map<string, number[]>();
    const positionArray = positions.array as Float32Array;

    for (let i = 0; i < positions.count; i++) {
      const x = positionArray[i * 3];
      const y = positionArray[i * 3 + 1];
      const z = positionArray[i * 3 + 2];

      const cellX = Math.floor((x - bbox.min.x) / cellSize.x);
      const cellY = Math.floor((y - bbox.min.y) / cellSize.y);
      const cellZ = Math.floor((z - bbox.min.z) / cellSize.z);

      const key = `${cellX},${cellY},${cellZ}`;

      if (!vertexClusters.has(key)) {
        vertexClusters.set(key, []);
      }
      vertexClusters.get(key)!.push(i);
    }

    // Create mapping from old vertex to new vertex
    const vertexMap = new Map<number, number>();
    const newPositions: number[] = [];
    let newVertexCount = 0;

    vertexClusters.forEach((vertices) => {
      // Calculate centroid of cluster
      let cx = 0, cy = 0, cz = 0;
      vertices.forEach((vi) => {
        cx += positionArray[vi * 3];
        cy += positionArray[vi * 3 + 1];
        cz += positionArray[vi * 3 + 2];
      });
      cx /= vertices.length;
      cy /= vertices.length;
      cz /= vertices.length;

      // Map all vertices in cluster to new vertex
      vertices.forEach((vi) => {
        vertexMap.set(vi, newVertexCount);
      });

      newPositions.push(cx, cy, cz);
      newVertexCount++;
    });

    // Rebuild faces with new vertices
    const newIndices: number[] = [];
    const indexArray = indices.array as Uint16Array | Uint32Array;

    for (let i = 0; i < indexArray.length; i += 3) {
      const v0 = vertexMap.get(indexArray[i]);
      const v1 = vertexMap.get(indexArray[i + 1]);
      const v2 = vertexMap.get(indexArray[i + 2]);

      // Skip degenerate triangles
      if (v0 !== v1 && v1 !== v2 && v0 !== v2) {
        newIndices.push(v0!, v1!, v2!);
      }
    }

    // Create new geometry
    const result = new BufferGeometry();
    result.setAttribute(
      'position',
      new Float32Array(newPositions).buffer as any
    );
    result.setIndex(newIndices);

    // Recompute normals
    result.computeVertexNormals();

    return result;
  }

  /**
   * Subdivide mesh using Loop subdivision
   */
  static subdivide(
    geometry: BufferGeometry,
    options: SubdivideOptions
  ): BufferGeometry {
    const { iterations = 1, smoothNormals = true, preserveUVs = true } = options;

    let result = geometry.clone();

    for (let i = 0; i < iterations; i++) {
      result = this.subdivideOnce(result, smoothNormals, preserveUVs);
    }

    return result;
  }

  /**
   * Voxelize a mesh
   */
  static voxelize(
    mesh: Mesh,
    options: VoxelizationOptions
  ): { positions: Float32Array; count: number } {
    const {
      resolution,
      solid = true,
      includeInterior = false,
    } = options;

    const bbox = new Box3().setFromObject(mesh);
    const size = new Vector3();
    bbox.getSize(size);

    const cellSize = Math.max(size.x, size.y, size.z) / resolution;
    const positions: number[] = [];

    // Create raycaster for testing occupancy
    const raycaster = new Ray();
    const direction = new Vector3(0, 0, 1);

    // Sample points in bounding box
    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        for (let z = 0; z < resolution; z++) {
          const px = bbox.min.x + (x + 0.5) * cellSize;
          const py = bbox.min.y + (y + 0.5) * cellSize;
          const pz = bbox.min.z + (z + 0.5) * cellSize;

          const point = new Vector3(px, py, pz);

          // Test if point is inside or on surface
          let isInside = false;
          let isOnSurface = false;

          if (solid) {
            // Ray casting test
            raycaster.set(point, direction);
            const intersects = raycaster.intersectObject(mesh, true);
            isInside = intersects.length % 2 === 1;
          } else {
            // Surface test - check distance to nearest triangle
            isOnSurface = this.isPointNearSurface(point, mesh, cellSize * 1.5);
          }

          if ((solid && isInside) || (!solid && isOnSurface)) {
            positions.push(px, py, pz);
          }
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      count: positions.length / 3,
    };
  }

  /**
   * Cleanup geometry by removing degenerate faces and merging vertices
   */
  static cleanupGeometry(geometry: BufferGeometry): void {
    const positions = geometry.getAttribute('position');
    const indices = geometry.getIndex();

    if (!indices || !positions) return;

    const indexArray = indices.array as Uint16Array | Uint32Array;
    const positionArray = positions.array as Float32Array;

    // Remove degenerate triangles
    const cleanIndices: number[] = [];
    for (let i = 0; i < indexArray.length; i += 3) {
      const v0 = indexArray[i];
      const v1 = indexArray[i + 1];
      const v2 = indexArray[i + 2];

      // Check for duplicate vertices
      if (v0 !== v1 && v1 !== v2 && v0 !== v2) {
        // Check for collinear vertices
        const p0 = new Vector3(
          positionArray[v0 * 3],
          positionArray[v0 * 3 + 1],
          positionArray[v0 * 3 + 2]
        );
        const p1 = new Vector3(
          positionArray[v1 * 3],
          positionArray[v1 * 3 + 1],
          positionArray[v1 * 3 + 2]
        );
        const p2 = new Vector3(
          positionArray[v2 * 3],
          positionArray[v2 * 3 + 1],
          positionArray[v2 * 3 + 2]
        );

        const area = new Triangle(p0, p1, p2).getArea();
        if (area > this.EPSILON) {
          cleanIndices.push(v0, v1, v2);
        }
      }
    }

    if (cleanIndices.length < indexArray.length) {
      geometry.setIndex(cleanIndices);
    }

    // Merge close vertices
    geometry.mergeVertices();
  }

  /**
   * Internal: Voxel-based boolean operation
   */
  private static voxelBasedBoolean(
    geomA: BufferGeometry,
    geomB: BufferGeometry,
    operation: 'union' | 'intersection' | 'difference',
    options: { resolution: number; preserveUVs: boolean }
  ): { geometry: BufferGeometry } {
    const { resolution, preserveUVs } = options;

    // Voxelize both geometries
    const voxelsA = this.createVoxelGrid(geomA, resolution);
    const voxelsB = this.createVoxelGrid(geomB, resolution);

    // Perform boolean operation on voxel grids
    const resultVoxels = new Set<string>();

    switch (operation) {
      case 'union':
        // Union: A OR B
        voxelsA.forEach((key) => resultVoxels.add(key));
        voxelsB.forEach((key) => resultVoxels.add(key));
        break;

      case 'intersection':
        // Intersection: A AND B
        voxelsA.forEach((key) => {
          if (voxelsB.has(key)) {
            resultVoxels.add(key);
          }
        });
        break;

      case 'difference':
        // Difference: A AND NOT B
        voxelsA.forEach((key) => {
          if (!voxelsB.has(key)) {
            resultVoxels.add(key);
          }
        });
        break;
    }

    // Convert voxel grid back to mesh (marching cubes would be ideal)
    // For now, return simplified representation
    return this.voxelsToGeometry(resultVoxels, resolution, geomA, preserveUVs);
  }

  /**
   * Internal: Create voxel grid from geometry
   */
  private static createVoxelGrid(
    geometry: BufferGeometry,
    resolution: number
  ): Set<string> {
    const voxels = new Set<string>();
    const positions = geometry.getAttribute('position');
    const indices = geometry.getIndex();

    if (!indices || !positions) return voxels;

    const bbox = new Box3().setFromAttribute(positions);
    const size = new Vector3();
    bbox.getSize(size);
    const cellSize = Math.max(size.x, size.y, size.z) / resolution;

    const indexArray = indices.array as Uint16Array | Uint32Array;
    const positionArray = positions.array as Float32Array;

    // Voxelize each triangle
    for (let i = 0; i < indexArray.length; i += 3) {
      const v0 = indexArray[i];
      const v1 = indexArray[i + 1];
      const v2 = indexArray[i + 2];

      const p0 = new Vector3(
        positionArray[v0 * 3],
        positionArray[v0 * 3 + 1],
        positionArray[v0 * 3 + 2]
      );
      const p1 = new Vector3(
        positionArray[v1 * 3],
        positionArray[v1 * 3 + 1],
        positionArray[v1 * 3 + 2]
      );
      const p2 = new Vector3(
        positionArray[v2 * 3],
        positionArray[v2 * 3 + 1],
        positionArray[v2 * 3 + 2]
      );

      // Voxelize triangle (simplified - just mark containing voxels)
      this.voxelizeTriangle(p0, p1, p2, bbox, cellSize, resolution, voxels);
    }

    return voxels;
  }

  /**
   * Internal: Voxelize a single triangle
   */
  private static voxelizeTriangle(
    p0: Vector3,
    p1: Vector3,
    p2: Vector3,
    bbox: Box3,
    cellSize: number,
    resolution: number,
    voxels: Set<string>
  ): void {
    // Calculate triangle bounds
    const min = new Vector3(
      Math.min(p0.x, p1.x, p2.x),
      Math.min(p0.y, p1.y, p2.y),
      Math.min(p0.z, p1.z, p2.z)
    );
    const max = new Vector3(
      Math.max(p0.x, p1.x, p2.x),
      Math.max(p0.y, p1.y, p2.y),
      Math.max(p0.z, p1.z, p2.z)
    );

    // Expand bounds slightly
    min.subScalar(cellSize * 0.5);
    max.addScalar(cellSize * 0.5);

    // Convert to voxel coordinates
    const vmin = new Vector3(
      Math.max(0, Math.floor((min.x - bbox.min.x) / cellSize)),
      Math.max(0, Math.floor((min.y - bbox.min.y) / cellSize)),
      Math.max(0, Math.floor((min.z - bbox.min.z) / cellSize))
    );
    const vmax = new Vector3(
      Math.min(resolution - 1, Math.floor((max.x - bbox.min.x) / cellSize)),
      Math.min(resolution - 1, Math.floor((max.y - bbox.min.y) / cellSize)),
      Math.min(resolution - 1, Math.floor((max.z - bbox.min.z) / cellSize))
    );

    // Mark all voxels within bounds
    const triangle = new Triangle(p0, p1, p2);
    for (let x = vmin.x; x <= vmax.x; x++) {
      for (let y = vmin.y; y <= vmax.y; y++) {
        for (let z = vmin.z; z <= vmax.z; z++) {
          const voxelCenter = new Vector3(
            bbox.min.x + (x + 0.5) * cellSize,
            bbox.min.y + (y + 0.5) * cellSize,
            bbox.min.z + (z + 0.5) * cellSize
          );

          // Simple distance test (could be improved with proper triangle-voxel test)
          const closestPoint = new Vector3();
          triangle.closestPointToPoint(voxelCenter, closestPoint);
          const distance = voxelCenter.distanceTo(closestPoint);

          if (distance < cellSize * 0.75) {
            const key = `${x},${y},${z}`;
            voxels.add(key);
          }
        }
      }
    }
  }

  /**
   * Internal: Convert voxels back to geometry
   */
  private static voxelsToGeometry(
    voxels: Set<string>,
    resolution: number,
    referenceGeom: BufferGeometry,
    preserveUVs: boolean
  ): { geometry: BufferGeometry } {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    if (voxels.size === 0) {
      return { geometry: new BufferGeometry() };
    }

    // Get bounding box from reference geometry
    const bbox = new Box3().setFromAttribute(
      referenceGeom.getAttribute('position')
    );
    const size = new Vector3();
    bbox.getSize(size);
    const cellSize = Math.max(size.x, size.y, size.z) / resolution;

    let vertexCount = 0;
    const voxelCenters = new Map<string, number>();

    // Create vertices at voxel centers
    voxels.forEach((key) => {
      const [x, y, z] = key.split(',').map(Number);
      const px = bbox.min.x + (x + 0.5) * cellSize;
      const py = bbox.min.y + (y + 0.5) * cellSize;
      const pz = bbox.min.z + (z + 0.5) * cellSize;

      voxelCenters.set(key, vertexCount);
      positions.push(px, py, pz);
      normals.push(0, 1, 0); // Placeholder normals
      if (preserveUVs) {
        uvs.push(0, 0); // Placeholder UVs
      }

      vertexCount++;
    });

    // For now, return as point cloud representation
    // A full implementation would use marching cubes
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32Array(positions) as any
    );
    geometry.setAttribute(
      'normal',
      new Float32Array(normals) as any
    );

    if (preserveUVs && uvs.length > 0) {
      geometry.setAttribute('uv', new Float32Array(uvs) as any);
    }

    return { geometry };
  }

  /**
   * Internal: Single iteration of Loop subdivision
   */
  private static subdivideOnce(
    geometry: BufferGeometry,
    smoothNormals: boolean,
    preserveUVs: boolean
  ): BufferGeometry {
    // Simplified subdivision - creates midpoints on edges
    const positions = geometry.getAttribute('position');
    const indices = geometry.getIndex();

    if (!indices || !positions) {
      return geometry.clone();
    }

    const indexArray = indices.array as Uint16Array | Uint32Array;
    const positionArray = positions.array as Float32Array;

    const newPositions: number[] = [];
    const edgeMidpoints = new Map<string, number>();
    let vertexCount = 0;

    // Copy original vertices
    for (let i = 0; i < positions.count; i++) {
      newPositions.push(
        positionArray[i * 3],
        positionArray[i * 3 + 1],
        positionArray[i * 3 + 2]
      );
      vertexCount++;
    }

    const newIndices: number[] = [];

    // Process each triangle
    for (let i = 0; i < indexArray.length; i += 3) {
      const v0 = indexArray[i];
      const v1 = indexArray[i + 1];
      const v2 = indexArray[i + 2];

      // Get or create edge midpoints
      const m01 = this.getOrCreateMidpoint(
        v0,
        v1,
        positionArray,
        edgeMidpoints,
        newPositions
      );
      const m12 = this.getOrCreateMidpoint(
        v1,
        v2,
        positionArray,
        edgeMidpoints,
        newPositions
      );
      const m20 = this.getOrCreateMidpoint(
        v2,
        v0,
        positionArray,
        edgeMidpoints,
        newPositions
      );

      // Create 4 new triangles
      newIndices.push(v0, m01, m20);
      newIndices.push(v1, m12, m01);
      newIndices.push(v2, m20, m12);
      newIndices.push(m01, m12, m20);
    }

    const result = new BufferGeometry();
    result.setAttribute('position', new Float32Array(newPositions) as any);
    result.setIndex(newIndices);

    if (smoothNormals) {
      result.computeVertexNormals();
    }

    return result;
  }

  /**
   * Internal: Get or create edge midpoint
   */
  private static getOrCreateMidpoint(
    v0: number,
    v1: number,
    positionArray: Float32Array | ArrayLike<number>,
    edgeMidpoints: Map<string, number>,
    newPositions: number[]
  ): number {
    const key = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;

    if (edgeMidpoints.has(key)) {
      return edgeMidpoints.get(key)!;
    }

    const x = (positionArray[v0 * 3] + positionArray[v1 * 3]) / 2;
    const y = (positionArray[v0 * 3 + 1] + positionArray[v1 * 3 + 1]) / 2;
    const z = (positionArray[v0 * 3 + 2] + positionArray[v1 * 3 + 2]) / 2;

    const midpointIndex = newPositions.length / 3;
    newPositions.push(x, y, z);
    edgeMidpoints.set(key, midpointIndex);

    return midpointIndex;
  }

  /**
   * Internal: Check if point is near mesh surface
   */
  private static isPointNearSurface(
    point: Vector3,
    mesh: Mesh,
    threshold: number
  ): boolean {
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.getIndex();

    if (!indices || !positions) return false;

    const indexArray = indices.array as Uint16Array | Uint32Array;
    const positionArray = positions.array as Float32Array;

    // Check distance to each triangle
    for (let i = 0; i < indexArray.length; i += 3) {
      const v0 = indexArray[i];
      const v1 = indexArray[i + 1];
      const v2 = indexArray[i + 2];

      const p0 = new Vector3(
        positionArray[v0 * 3],
        positionArray[v0 * 3 + 1],
        positionArray[v0 * 3 + 2]
      );
      const p1 = new Vector3(
        positionArray[v1 * 3],
        positionArray[v1 * 3 + 1],
        positionArray[v1 * 3 + 2]
      );
      const p2 = new Vector3(
        positionArray[v2 * 3],
        positionArray[v2 * 3 + 1],
        positionArray[v2 * 3 + 2]
      );

      const triangle = new Triangle(p0, p1, p2);
      const closest = new Vector3();
      triangle.closestPointToPoint(point, closest);
      const distance = point.distanceTo(closest);

      if (distance < threshold) {
        return true;
      }
    }

    return false;
  }
}

export default MeshOperations;
