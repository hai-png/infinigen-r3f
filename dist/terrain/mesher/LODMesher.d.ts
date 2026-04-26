/**
 * Infinigen R3F Port - Enhanced Mesher Systems
 * LOD (Level of Detail) Mesher with Adaptive Resolution
 *
 * Based on original: infinigen/terrain/mesher/lod_mesher.py
 * Implements adaptive mesh refinement based on camera distance and screen space error
 */
import { Vector3, BufferGeometry, Box3, Sphere } from 'three';
import { SphericalMesher, SphericalMesherConfig, CameraPose } from './SphericalMesher';
import { SDFKernel } from '../sdf/SDFOperations';
export interface LODConfig extends SphericalMesherConfig {
    maxLOD: number;
    minLOD: number;
    screenSpaceError: number;
    lodTransitionDistance: number;
    borderStitching: boolean;
}
export interface LODChunk {
    geometry: BufferGeometry;
    lodLevel: number;
    bounds: Box3;
    boundingSphere: Sphere;
    children: LODChunk[];
    parent: LODChunk | null;
    visible: boolean;
    needsUpdate: boolean;
}
export declare class LODMesher extends SphericalMesher {
    protected lodConfig: LODConfig;
    protected rootChunk: LODChunk | null;
    protected activeChunks: LODChunk[];
    constructor(cameraPose: CameraPose, bounds: [number, number, number, number, number, number], config?: Partial<LODConfig>);
    /**
     * Generate hierarchical LOD mesh structure
     */
    generateLODMesh(kernels: SDFKernel[]): LODChunk;
    /**
     * Create a chunk at specified LOD level
     */
    protected createChunk(kernels: SDFKernel[], lodLevel: number, bounds: Box3, parent: LODChunk | null): LODChunk;
    /**
     * Generate geometry for a single chunk
     */
    protected generateChunkGeometry(kernels: SDFKernel[], bounds: Box3, resolution: number, lodLevel: number): BufferGeometry;
    /**
     * Calculate resolution for LOD level
     */
    protected calculateResolution(lodLevel: number): number;
    /**
     * Subdivide bounds into 4 sub-chunks
     */
    protected subdivideBounds(bounds: Box3): Box3[];
    /**
     * Update LOD visibility based on camera position
     */
    updateLODVisibility(cameraPosition: Vector3): void;
    /**
     * Traverse LOD tree and determine visible chunks
     */
    protected traverseLODTree(chunk: LODChunk | null, cameraPosition: Vector3): void;
    /**
     * Calculate screen space error for a chunk
     */
    protected calculateScreenSpaceError(radius: number, distance: number): number;
    /**
     * Apply border stitching between different LOD levels
     * Prevents cracks at LOD boundaries
     */
    protected applyBorderStitching(): void;
    /**
     * Find neighboring chunks at higher LOD levels
     */
    protected findHigherLODNeighbors(chunk: LODChunk): LODChunk[];
    /**
     * Check if two chunks are adjacent
     */
    protected areAdjacent(chunk1: LODChunk, chunk2: LODChunk): boolean;
    /**
     * Stitch borders between chunks to prevent cracks
     */
    protected stitchChunkBorders(lowLODChunk: LODChunk, highLODChunk: LODChunk): void;
    /**
     * Get all visible geometries for rendering
     */
    getVisibleGeometries(): BufferGeometry[];
    /**
     * Update chunk geometries marked as needing update
     */
    updatePendingChunks(kernels: SDFKernel[]): void;
}
//# sourceMappingURL=LODMesher.d.ts.map