/**
 * Asset Streaming System
 *
 * Provides progressive loading, priority-based streaming, and memory management
 * for large-scale scene generation.
 */
export declare enum StreamPriority {
    CRITICAL = 0,// Immediately visible, highest priority
    HIGH = 1,// Soon to be visible
    MEDIUM = 2,// Within view frustum
    LOW = 3,// Outside view but nearby
    BACKGROUND = 4
}
export declare enum LoadState {
    PENDING = "pending",
    LOADING = "loading",
    LOADED = "loaded",
    ERROR = "error",
    UNLOADED = "unloaded"
}
export interface StreamableAsset {
    id: string;
    type: 'geometry' | 'texture' | 'material' | 'scene';
    url: string;
    priority: StreamPriority;
    state: LoadState;
    data: any | null;
    size: number;
    loadProgress: number;
    lastAccessed: number;
    accessCount: number;
    boundingSphere?: number;
    distanceToCamera?: number;
}
export interface StreamingConfig {
    /** Maximum memory usage in MB */
    maxMemoryMB: number;
    /** Number of concurrent loads */
    maxConcurrentLoads: number;
    /** Priority update interval (ms) */
    priorityUpdateInterval: number;
    /** Unload delay after becoming invisible (ms) */
    unloadDelay: number;
    /** Enable progressive loading */
    enableProgressive: boolean;
    /** Enable prediction of needed assets */
    enablePrediction: boolean;
    /** Prediction horizon (seconds) */
    predictionHorizon: number;
}
export declare const DEFAULT_STREAMING_CONFIG: StreamingConfig;
export declare class AssetStreamer {
    private assets;
    private loadQueue;
    private activeLoads;
    private config;
    private currentMemoryMB;
    private updateInterval?;
    constructor(config?: Partial<StreamingConfig>);
    /**
     * Register asset for streaming
     */
    registerAsset(asset: StreamableAsset): void;
    /**
     * Unregister asset
     */
    unregisterAsset(id: string): void;
    /**
     * Mark asset as accessed (updates priority)
     */
    accessAsset(id: string): void;
    /**
     * Update asset priority based on camera distance
     */
    private updateAssetPriority;
    /**
     * Update load queue based on priorities
     */
    private updateLoadQueue;
    /**
     * Process load queue
     */
    private processLoadQueue;
    /**
     * Load single asset
     */
    private loadAsset;
    /**
     * Fetch asset data with appropriate loader based on type
     */
    private fetchAsset;
    /**
     * Load GLTF/GLB model
     */
    private loadGLTF;
    /**
     * Load OBJ model
     */
    private loadOBJ;
    /**
     * Load FBX model
     */
    private loadFBX;
    /**
     * Load texture image
     */
    private loadTexture;
    /**
     * Load HDRI environment map
     */
    private loadHDRI;
    /**
     * Calculate asset size in bytes
     */
    private calculateAssetSize;
    /**
     * Unload least important asset
     */
    private unloadLeastImportant;
    /**
     * Unload specific asset
     */
    unloadAsset(id: string): void;
    /**
     * Dispose asset data
     */
    private disposeAssetData;
    /**
     * Start priority update loop
     */
    private startUpdateLoop;
    /**
     * Update all asset priorities
     */
    private updatePriorities;
    /**
     * Get streaming statistics
     */
    getStats(): {
        totalAssets: number;
        loadedAssets: number;
        loadingAssets: number;
        pendingAssets: number;
        memoryUsageMB: number;
        memoryLimitMB: number;
    };
    /**
     * Stop streaming system
     */
    destroy(): void;
}
export interface ProgressiveLoadOptions {
    chunks: number;
    chunkDelayMs: number;
    onProgress?: (progress: number) => void;
    onComplete?: () => void;
}
export declare function progressiveLoad<T>(loader: () => Promise<T>, options: ProgressiveLoadOptions): Promise<T>;
export declare class PredictionEngine {
    private history;
    private maxHistorySize;
    /**
     * Record camera position
     */
    recordPosition(position: {
        x: number;
        y: number;
        z: number;
    }): void;
    /**
     * Predict future camera position
     */
    predictPosition(horizonSeconds: number): {
        x: number;
        y: number;
        z: number;
    };
    /**
     * Get assets that will be needed soon
     */
    getPredictedAssets(assets: StreamableAsset[], horizonSeconds: number): StreamableAsset[];
}
declare const _default: {
    StreamPriority: typeof StreamPriority;
    LoadState: typeof LoadState;
    DEFAULT_STREAMING_CONFIG: StreamingConfig;
    AssetStreamer: typeof AssetStreamer;
    progressiveLoad: typeof progressiveLoad;
    PredictionEngine: typeof PredictionEngine;
};
export default _default;
//# sourceMappingURL=AssetStreaming.d.ts.map