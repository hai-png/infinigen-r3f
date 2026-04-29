/**
 * ChunkStitcher.ts
 *
 * Prevents cracks between adjacent terrain chunks at different LOD levels.
 * Implements edge stitching algorithms to ensure seamless transitions.
 *
 * Based on original Infinigen's chunk stitching logic adapted for Three.js/R3F.
 */
import { BufferGeometry } from 'three';
export interface ChunkBoundary {
    left: number;
    right: number;
    top: number;
    bottom: number;
}
export interface StitchConfig {
    stitchThreshold: number;
    maxStitchDistance: number;
    enableDiagonalStitching: boolean;
}
/**
 * Manages stitching between adjacent terrain chunks to prevent visible cracks
 */
export declare class ChunkStitcher {
    private config;
    private stitchCache;
    constructor(config?: Partial<StitchConfig>);
    /**
     * Stitch two adjacent chunk geometries together
     */
    stitchChunks(primaryGeom: BufferGeometry, neighborGeom: BufferGeometry, direction: 'left' | 'right' | 'top' | 'bottom'): BufferGeometry;
    /**
     * Extract vertices along a specific boundary edge
     */
    private extractBoundaryVertices;
    /**
     * Check if a vertex lies on the specified boundary
     */
    private isOnBoundary;
    /**
     * Sort boundary vertices in consistent order
     */
    private sortBoundaryVertices;
    /**
     * Find points where stitching should occur
     */
    private findStitchPoints;
    /**
     * Apply stitching modifications to geometry
     */
    private applyStitching;
    /**
     * Get opposite direction for neighbor matching
     */
    private getOppositeDirection;
    /**
     * Clear stitching cache
     */
    clearCache(): void;
    /**
     * Generate cache key for stitch pair
     */
    private getCacheKey;
}
export default ChunkStitcher;
//# sourceMappingURL=ChunkStitcher.d.ts.map