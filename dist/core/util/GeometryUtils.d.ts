/**
 * GeometryUtils.ts
 *
 * Advanced geometry utilities for mesh operations, bevelling, smoothing,
 * and geometric transformations. Ported from Infinigen's bevelling.py and ocmesher_utils.py.
 */
import * as THREE from 'three';
/**
 * Applies a bevel to mesh edges by chamfering vertices.
 * This is a simplified implementation - production would use proper mesh subdivision.
 */
export declare function bevelMesh(geometry: THREE.BufferGeometry, bevelAmount?: number, segments?: number): THREE.BufferGeometry;
/**
 * Creates a rounded box geometry with beveled edges.
 */
export declare function createRoundedBox(width: number, height: number, depth: number, radius?: number, segments?: number): THREE.BufferGeometry;
/**
 * Applies Laplacian smoothing to a mesh.
 * @param iterations Number of smoothing passes
 * @param lambda Smoothing factor (0-1)
 */
export declare function laplacianSmooth(geometry: THREE.BufferGeometry, iterations?: number, lambda?: number): THREE.BufferGeometry;
/**
 * Voxelize a mesh into a 3D grid.
 * @param geometry Input mesh geometry
 * @param resolution Voxel grid resolution (voxels per unit)
 * @returns 3D array of booleans representing occupied voxels
 */
export declare function voxelizeMesh(geometry: THREE.BufferGeometry, resolution?: number): {
    grid: boolean[][][];
    bbox: THREE.Box3;
    voxelSize: number;
};
/**
 * Converts a voxel grid back to a mesh using marching cubes approximation.
 * Simplified implementation using box instancing.
 */
export declare function voxelGridToMesh(grid: boolean[][][], bbox: THREE.Box3, voxelSize: number): THREE.InstancedMesh;
/**
 * Approximates a mesh with a convex hull.
 * Uses Three.js ConvexGeometry (requires vertices).
 */
export declare function approximateConvexHull(geometry: THREE.BufferGeometry): THREE.BufferGeometry;
/**
 * Splits a mesh into approximately convex parts.
 * Simplified version that just returns the convex hull.
 * Full implementation would use HACD or similar algorithm.
 */
export declare function decomposeIntoConvexParts(geometry: THREE.BufferGeometry, maxParts?: number): THREE.BufferGeometry[];
/**
 * Applies a transformation matrix to geometry vertices.
 */
export declare function transformGeometry(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry;
/**
 * Mirrors geometry across a plane.
 * @param axis 'x', 'y', or 'z'
 */
export declare function mirrorGeometry(geometry: THREE.BufferGeometry, axis?: 'x' | 'y' | 'z'): THREE.BufferGeometry;
/**
 * Scales geometry non-uniformly.
 */
export declare function scaleGeometry(geometry: THREE.BufferGeometry, scaleX: number, scaleY: number, scaleZ: number): THREE.BufferGeometry;
/**
 * Calculates the surface area of a mesh.
 */
export declare function calculateSurfaceArea(geometry: THREE.BufferGeometry): number;
/**
 * Calculates the volume of a closed mesh (using divergence theorem).
 */
export declare function calculateVolume(geometry: THREE.BufferGeometry): number;
//# sourceMappingURL=GeometryUtils.d.ts.map