/**
 * MeshOptimizer.ts
 *
 * Post-processing mesh optimization including decimation,
 * normal smoothing, and topology improvement.
 *
 * Based on original Infinigen's mesh optimization pipeline.
 */
import { BufferGeometry } from 'three';
export interface OptimizationConfig {
    targetFaceCount: number;
    aggressiveDecimation: boolean;
    preserveBoundaries: boolean;
    smoothNormals: boolean;
    normalSmoothingAngle: number;
    removeDegenerateFaces: boolean;
    weldVertices: boolean;
    weldThreshold: number;
}
/**
 * Optimizes terrain meshes for performance and quality
 */
export declare class MeshOptimizer {
    private config;
    constructor(config?: Partial<OptimizationConfig>);
    /**
     * Apply full optimization pipeline to geometry
     */
    optimize(geometry: BufferGeometry): BufferGeometry;
    /**
     * Remove degenerate (zero-area) faces
     */
    private removeDegenerateFaces;
    /**
     * Weld nearby vertices together
     */
    private weldVertices;
    /**
     * Simplify mesh through edge collapse decimation
     */
    private decimate;
    /**
     * Smooth vertex normals based on adjacent face normals
     */
    private smoothNormals;
    /**
     * Update optimization configuration
     */
    setConfig(config: Partial<OptimizationConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): OptimizationConfig;
}
export default MeshOptimizer;
//# sourceMappingURL=MeshOptimizer.d.ts.map