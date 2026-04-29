/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Adaptive Meshing System with LOD and Chunk Streaming
 */
import { BufferGeometry, Vector3, Box3, Sphere } from 'three';
import { TerrainData } from './TerrainGenerator';
export interface MeshConfig {
    chunkSize: number;
    lodLevels: number;
    maxError: number;
    borderSize: number;
}
export interface ChunkData {
    geometry: BufferGeometry;
    lodLevel: number;
    bounds: Box3;
    boundingSphere: Sphere;
    position: {
        x: number;
        y: number;
    };
    neighbors: {
        north: boolean;
        south: boolean;
        east: boolean;
        west: boolean;
    };
}
export declare class TerrainMesher {
    private config;
    private chunks;
    constructor(config?: Partial<MeshConfig>);
    /**
     * Generate mesh from terrain data
     */
    generateMesh(terrainData: TerrainData): BufferGeometry;
    /**
     * Generate chunked mesh with LOD
     */
    generateChunkedMesh(terrainData: TerrainData, cameraPosition: Vector3): Map<string, ChunkData>;
    /**
     * Generate single chunk
     */
    private generateChunk;
    /**
     * Calculate appropriate LOD level based on distance
     */
    private calculateLOD;
    /**
     * Get chunk by key
     */
    getChunk(key: string): ChunkData | undefined;
    /**
     * Update chunks based on camera position
     */
    updateChunks(terrainData: TerrainData, cameraPosition: Vector3): void;
    /**
     * Clear all chunks
     */
    clearChunks(): void;
    /**
     * Get active chunk count
     */
    getChunkCount(): number;
    /**
     * Optimize geometry for rendering
     */
    optimizeGeometry(geometry: BufferGeometry): BufferGeometry;
    /**
     * Generate wireframe geometry for debugging
     */
    generateWireframe(geometry: BufferGeometry): BufferGeometry;
}
//# sourceMappingURL=TerrainMesher.d.ts.map