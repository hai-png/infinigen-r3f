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
import { BufferGeometry, Mesh } from 'three';
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
export declare class MeshOperations {
    private static readonly EPSILON;
    /**
     * Perform boolean union of two meshes
     */
    static union(meshA: Mesh, meshB: Mesh, options?: MeshBooleanOptions): CSGResult;
    /**
     * Perform boolean intersection of two meshes
     */
    static intersection(meshA: Mesh, meshB: Mesh, options?: MeshBooleanOptions): CSGResult;
    /**
     * Perform boolean difference (A - B) of two meshes
     */
    static difference(meshA: Mesh, meshB: Mesh, options?: MeshBooleanOptions): CSGResult;
    /**
     * Simplify mesh by reducing face count
     */
    static simplify(geometry: BufferGeometry, options: SimplifyOptions): BufferGeometry;
    /**
     * Subdivide mesh using Loop subdivision
     */
    static subdivide(geometry: BufferGeometry, options: SubdivideOptions): BufferGeometry;
    /**
     * Voxelize a mesh
     */
    static voxelize(mesh: Mesh, options: VoxelizationOptions): {
        positions: Float32Array;
        count: number;
    };
    /**
     * Cleanup geometry by removing degenerate faces and merging vertices
     */
    static cleanupGeometry(geometry: BufferGeometry): void;
    /**
     * Internal: Voxel-based boolean operation
     */
    private static voxelBasedBoolean;
    /**
     * Internal: Create voxel grid from geometry
     */
    private static createVoxelGrid;
    /**
     * Internal: Voxelize a single triangle
     */
    private static voxelizeTriangle;
    /**
     * Internal: Convert voxels back to geometry
     */
    private static voxelsToGeometry;
    /**
     * Internal: Single iteration of Loop subdivision
     */
    private static subdivideOnce;
    /**
     * Internal: Get or create edge midpoint
     */
    private static getOrCreateMidpoint;
    /**
     * Internal: Check if point is near mesh surface
     */
    private static isPointNearSurface;
}
export default MeshOperations;
//# sourceMappingURL=MeshOperations.d.ts.map