/**
 * Occlusion Mesher for InfiniGen R3F
 *
 * Generates simplified collision meshes from complex geometry:
 * - Voxel-based simplification
 * - Convex decomposition
 * - LOD generation for physics
 */
import { Vector3, Mesh, BufferGeometry } from 'three';
import { BBox } from '../util/math/bbox';
export interface VoxelConfig {
    /** Voxel size (smaller = more detail) */
    voxelSize: number;
    /** Maximum voxels to generate */
    maxVoxels: number;
    /** Whether to merge adjacent voxels */
    mergeVoxels: boolean;
}
export interface ConvexDecompositionConfig {
    /** Maximum number of convex hulls */
    maxHulls: number;
    /** Concavity threshold */
    concavity: number;
    /** Plane downsampling */
    planeDownsampling: number;
    /** Simplification target */
    simplificationTarget: number;
}
export interface OcclusionMesh {
    /** Simplified geometry */
    geometry: BufferGeometry;
    /** Bounding box */
    bbox: BBox;
    /** Number of triangles */
    triangleCount: number;
    /** Whether it's convex */
    isConvex: boolean;
}
export declare class Voxelizer {
    private config;
    private grid;
    constructor(config: VoxelConfig);
    /**
     * Voxelize a mesh
     */
    voxelize(mesh: Mesh): Vector3[];
    private mergeAdjacentVoxels;
    /**
     * Generate box geometry from voxels
     */
    generateBoxGeometry(voxels: Vector3[]): BufferGeometry;
}
export declare class ConvexDecomposer {
    private config;
    constructor(config: ConvexDecompositionConfig);
    /**
     * Decompose mesh into convex hulls
     * Note: This is a simplified implementation. Production use should leverage
     * libraries like ammo.js or rapier for proper convex decomposition.
     */
    decompose(mesh: Mesh): OcclusionMesh[];
    /**
     * Generate multiple convex hulls based on clustering
     */
    decomposeMulti(mesh: Mesh): OcclusionMesh[];
}
export interface OcclusionMesherConfig {
    voxel?: VoxelConfig;
    convex?: ConvexDecompositionConfig;
    /** Use voxelization (true) or convex decomposition (false) */
    useVoxels: boolean;
    /** Generate LOD levels */
    lodLevels: number;
}
export declare class OcclusionMesher {
    private config;
    private voxelizer;
    private decomposer;
    constructor(config: OcclusionMesherConfig);
    /**
     * Generate occlusion mesh from input mesh
     */
    generate(mesh: Mesh): OcclusionMesh[];
    private generateVoxelized;
    private generateBoundingBox;
    /**
     * Generate LOD chain for mesh
     */
    generateLODChain(mesh: Mesh): OcclusionMesh[][];
}
/**
 * Create default voxel configuration
 */
export declare function createDefaultVoxelConfig(): VoxelConfig;
/**
 * Create default convex decomposition configuration
 */
export declare function createDefaultConvexConfig(): ConvexDecompositionConfig;
/**
 * Quick occlusion mesh generation
 */
export declare function quickOcclude(mesh: Mesh, useVoxels?: boolean): OcclusionMesh;
//# sourceMappingURL=OcclusionMesher.d.ts.map