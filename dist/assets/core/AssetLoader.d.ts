/**
 * AssetLoader.ts
 *
 * Async asset loading system with progress tracking, error handling, and caching.
 * Supports procedural generation, GLTF loading, and texture management.
 */
import * as THREE from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LoadOptions, LoadProgress, AssetResult } from './AssetTypes';
/**
 * Async asset loader with comprehensive loading pipeline
 */
export declare class AssetLoader {
    private library;
    private gltfLoader;
    private queue;
    private activeLoads;
    private maxConcurrentLoads;
    private currentLoads;
    private onProgressCallbacks;
    private defaultTimeout;
    constructor();
    /**
     * Load a procedurally generated asset
     */
    loadProcedural<TParams>(generatorId: string, params?: TParams, options?: LoadOptions): Promise<AssetResult<THREE.Object3D>>;
    /**
     * Load multiple procedural assets in batch
     */
    loadProceduralBatch<TParams>(generatorId: string, count: number, baseParams?: Partial<TParams>, options?: LoadOptions): Promise<AssetResult<THREE.Object3D[]>>;
    /**
     * Load a GLTF/GLB file asynchronously
     */
    loadGLTF(url: string, options?: LoadOptions): Promise<AssetResult<GLTF>>;
    /**
     * Load multiple GLTF files with concurrency control
     */
    loadGLTFBatch(urls: string[], options?: LoadOptions): Promise<AssetResult<Map<string, GLTF>>>;
    /**
     * Load a texture with optional compression
     */
    loadTexture(url: string, options?: LoadOptions & {
        compress?: boolean;
    }): Promise<AssetResult<THREE.Texture>>;
    /**
     * Load PBR texture set (albedo, normal, roughness, metalness, etc.)
     */
    loadPBRTextures(basePath: string, textureNames: {
        baseColor?: string;
        normal?: string;
        roughness?: string;
        metalness?: string;
        ao?: string;
        displacement?: string;
        emissive?: string;
    }): Promise<AssetResult<Record<string, THREE.Texture>>>;
    /**
     * Add progress callback
     */
    onProgress(callback: (progress: LoadProgress) => void): void;
    /**
     * Remove progress callback
     */
    offProgress(callback: (progress: LoadProgress) => void): void;
    /**
     * Emit progress event to all callbacks
     */
    private emitProgress;
    /**
     * Set maximum concurrent loads
     */
    setMaxConcurrentLoads(max: number): void;
    /**
     * Set default timeout for loads
     */
    setDefaultTimeout(timeout: number): void;
    /**
     * Cancel all pending loads
     */
    cancelAll(): void;
    /**
     * Cancel specific load
     */
    cancel(url: string): void;
    /**
     * Get currently active load count
     */
    getActiveLoadCount(): number;
    /**
     * Get queued load count
     */
    getQueuedLoadCount(): number;
    /**
     * Preload assets into cache
     */
    preload(urls: string[], type?: 'gltf' | 'texture'): Promise<void>;
    /**
     * Clear loader cache
     */
    clearCache(): void;
}
export declare const assetLoader: AssetLoader;
//# sourceMappingURL=AssetLoader.d.ts.map