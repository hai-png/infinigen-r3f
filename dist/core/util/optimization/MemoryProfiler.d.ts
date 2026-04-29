/**
 * MemoryProfiler - Monitors and profiles memory usage in real-time
 *
 * Tracks geometry, texture, material, and overall heap memory consumption
 * to help identify memory leaks and optimize resource usage.
 */
import * as THREE from 'three';
export interface MemoryStats {
    /** Total heap size (bytes) */
    totalHeapSize: number;
    /** Used heap size (bytes) */
    usedHeapSize: number;
    /** Geometry memory (bytes) */
    geometryMemory: number;
    /** Texture memory (bytes) */
    textureMemory: number;
    /** Material memory estimate (bytes) */
    materialMemory: number;
    /** Object count */
    objectCount: number;
    /** Geometry count */
    geometryCount: number;
    /** Texture count */
    textureCount: number;
    /** Material count */
    materialCount: number;
    /** Memory breakdown by type */
    breakdown: MemoryBreakdown;
    /** Warnings for high memory usage */
    warnings: string[];
}
export interface MemoryBreakdown {
    /** Memory by geometry type */
    byGeometryType: Map<string, number>;
    /** Memory by texture size */
    byTextureSize: Map<string, number>;
    /** Memory by material type */
    byMaterialType: Map<string, number>;
    /** Largest geometries */
    largestGeometries: Array<{
        name: string;
        size: number;
    }>;
    /** Largest textures */
    largestTextures: Array<{
        name: string;
        size: number;
    }>;
}
export interface MemorySnapshot {
    timestamp: number;
    stats: MemoryStats;
}
export interface MemoryConfig {
    /** Warning threshold for heap usage (0-1) */
    heapWarningThreshold?: number;
    /** Warning threshold for texture memory (MB) */
    textureWarningThreshold?: number;
    /** Warning threshold for geometry memory (MB) */
    geometryWarningThreshold?: number;
    /** Enable detailed tracking */
    detailedTracking?: boolean;
    /** Snapshot history size */
    historySize?: number;
}
/**
 * Real-time memory profiler for Three.js scenes
 */
export declare class MemoryProfiler {
    private scene;
    private renderer;
    private config;
    private snapshotHistory;
    private lastGCTime;
    constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, config?: MemoryConfig);
    /**
     * Get current memory statistics
     */
    getStats(): MemoryStats;
    /**
     * Take a memory snapshot and store in history
     */
    takeSnapshot(): MemorySnapshot;
    /**
     * Get snapshot history for trend analysis
     */
    getHistory(): MemorySnapshot[];
    /**
     * Clear snapshot history
     */
    clearHistory(): void;
    /**
     * Force garbage collection (if available)
     */
    forceGC(): void;
    /**
     * Calculate memory size of a geometry
     */
    private calculateGeometrySize;
    /**
     * Calculate memory size of a texture
     */
    private calculateTextureSize;
    /**
     * Estimate memory size of a material
     */
    private estimateMaterialSize;
    /**
     * Extract all textures from a material
     */
    private extractTextures;
    /**
     * Generate memory usage warnings
     */
    private generateWarnings;
    /**
     * Format bytes to human-readable string
     */
    private formatBytes;
    /**
     * Get memory trend over time
     */
    getTrend(): {
        increasing: boolean;
        rate: number;
    };
    /**
     * Dispose unused resources
     */
    disposeUnused(): {
        disposedGeometries: number;
        disposedMaterials: number;
        disposedTextures: number;
    };
}
export default MemoryProfiler;
//# sourceMappingURL=MemoryProfiler.d.ts.map