/**
 * DrawCallOptimizer - Analyzes and optimizes draw calls for better rendering performance
 *
 * Provides tools to batch geometries, merge materials, and reduce state changes
 * to minimize GPU overhead in large scenes.
 */
import type { Object3D, Material } from 'three';
export interface DrawCallStats {
    /** Total number of draw calls */
    totalDrawCalls: number;
    /** Number of unique materials */
    uniqueMaterials: number;
    /** Number of unique geometries */
    uniqueGeometries: number;
    /** Objects grouped by material */
    materialGroups: Map<Material, Object3D[]>;
    /** Potential draw call reduction */
    potentialReduction: number;
    /** Optimization suggestions */
    suggestions: string[];
}
export interface OptimizationResult {
    /** Optimized scene graph */
    optimizedRoot: Object3D;
    /** Number of draw calls before optimization */
    beforeDrawCalls: number;
    /** Number of draw calls after optimization */
    afterDrawCalls: number;
    /** Reduction percentage */
    reductionPercent: number;
    /** Merged objects count */
    mergedObjects: number;
}
export interface BatchConfig {
    /** Maximum batch size (objects per batch) */
    maxBatchSize?: number;
    /** Merge objects with same material */
    mergeByMaterial?: boolean;
    /** Merge objects with same geometry */
    mergeByGeometry?: boolean;
    /** Minimum distance to consider objects separate */
    minDistance?: number;
    /** Preserve individual object transforms */
    preserveTransforms?: boolean;
}
/**
 * Analyzes a scene for draw call optimization opportunities
 */
export declare class DrawCallOptimizer {
    private scene;
    constructor(scene: Object3D);
    /**
     * Analyze current draw call statistics
     */
    analyze(): DrawCallStats;
    /**
     * Optimize scene by batching objects
     */
    optimize(config?: BatchConfig): OptimizationResult;
    /**
     * Create batches from objects sharing the same material
     */
    private createMaterialBatches;
    /**
     * Merge multiple geometries into one
     */
    private mergeGeometries;
    /**
     * Merge array of buffer geometries
     */
    private mergeBufferGeometries;
    /**
     * Count draw calls in a scene
     */
    private countDrawCalls;
    /**
     * Check if object is renderable
     */
    private isRenderable;
    /**
     * Get unique identifier for geometry
     */
    private getGeometryId;
    /**
     * Generate optimization suggestions
     */
    private generateSuggestions;
    /**
     * Enable instancing for repeated geometries
     */
    convertToInstancedMeshes(maxInstances?: number): Object3D;
}
export default DrawCallOptimizer;
//# sourceMappingURL=DrawCallOptimizer.d.ts.map