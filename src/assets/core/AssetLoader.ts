/**
 * AssetLoader.ts
 * 
 * Async asset loading system with progress tracking, error handling, and caching.
 * Supports procedural generation, GLTF loading, and texture management.
 */

import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import {
  IProceduralGenerator,
  LoadOptions,
  LoadProgress,
  AssetResult,
  LoadCallback,
  AssetEventType,
  AssetEvent
} from './AssetTypes';
import { AssetLibrary } from './AssetLibrary';

/**
 * Async asset loader with comprehensive loading pipeline
 */
export class AssetLoader {
  private library: AssetLibrary;
  private gltfLoader: GLTFLoader;
  
  // Loading queue
  private queue: LoadTask[] = [];
  private activeLoads: Map<string, Promise<any>> = new Map();
  
  // Concurrency control
  private maxConcurrentLoads: number = 4;
  private currentLoads: number = 0;
  
  // Progress callbacks
  private onProgressCallbacks: Set<(progress: LoadProgress) => void> = new Set();
  
  // Timeout settings
  private defaultTimeout: number = 30000; // 30 seconds

  constructor() {
    this.library = AssetLibrary.getInstance();
    this.gltfLoader = new GLTFLoader();
  }

  // ============================================================================
  // Procedural Asset Loading
  // ============================================================================

  /**
   * Load a procedurally generated asset
   */
  public async loadProcedural<TParams>(
    generatorId: string,
    params?: TParams,
    options?: LoadOptions
  ): Promise<AssetResult<THREE.Object3D>> {
    const cacheKey = options?.cache !== false 
      ? `${generatorId}_${JSON.stringify(params || {})}` 
      : null;

    // Check cache first
    if (cacheKey) {
      const cached = this.library.cacheGet<THREE.Object3D>(cacheKey);
      if (cached) {
        return { success: true, data: cached.clone() };
      }
    }

    // Get generator from library
    const generator = this.library.getGenerator<TParams>(generatorId);
    if (!generator) {
      return { 
        success: false, 
        error: new Error(`Generator ${generatorId} not found`) 
      };
    }

    try {
      // Use provided params or generate random ones
      const finalParams = params || generator.randomizeParams();
      
      // Validate parameters
      if (!generator.validateParams(finalParams)) {
        return { 
          success: false, 
          error: new Error(`Invalid parameters for generator ${generatorId}`) 
        };
      }

      // Generate the asset
      const asset = generator.generate(finalParams);
      
      // Cache result if enabled
      if (cacheKey && options?.cache !== false) {
        this.library.cacheSet(cacheKey, asset.clone());
      }

      return { success: true, data: asset };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('Unknown error during generation') 
      };
    }
  }

  /**
   * Load multiple procedural assets in batch
   */
  public async loadProceduralBatch<TParams>(
    generatorId: string,
    count: number,
    baseParams?: Partial<TParams>,
    options?: LoadOptions
  ): Promise<AssetResult<THREE.Object3D[]>> {
    const results: THREE.Object3D[] = [];
    const errors: Error[] = [];

    const generator = this.library.getGenerator<TParams>(generatorId);
    if (!generator) {
      return { 
        success: false, 
        error: new Error(`Generator ${generatorId} not found`) 
      };
    }

    for (let i = 0; i < count; i++) {
      // Randomize parameters with optional base overrides
      const params = {
        ...generator.getDefaultParams(),
        ...baseParams,
        seed: Math.random()
      } as TParams;

      const result = await this.loadProcedural(generatorId, params, options);
      
      if (result.success) {
        results.push(result.data);
      } else {
        errors.push(result.error);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { 
        success: false, 
        error: new Error(`All ${count} loads failed`) 
      };
    }

    return { 
      success: true, 
      data: results 
    };
  }

  // ============================================================================
  // GLTF/GLB Loading
  // ============================================================================

  /**
   * Load a GLTF/GLB file asynchronously
   */
  public async loadGLTF(
    url: string,
    options?: LoadOptions
  ): Promise<AssetResult<GLTF>> {
    const cacheKey = options?.cache !== false ? `gltf_${url}` : null;

    // Check cache
    if (cacheKey) {
      const cached = this.library.cacheGet<GLTF>(cacheKey);
      if (cached) {
        return { success: true, data: cached };
      }
    }

    return new Promise((resolve) => {
      const timeout = options?.timeout || this.defaultTimeout;
      
      // Create timeout promise
      const timeoutPromise = new Promise<AssetResult<GLTF>>((_, reject) => {
        setTimeout(() => reject(new Error(`Loading timeout after ${timeout}ms`)), timeout);
      });

      // Create load promise
      const loadPromise = new Promise<AssetResult<GLTF>>((resolveLoad) => {
        this.gltfLoader.load(
          url,
          (gltf) => {
            // Success callback
            if (cacheKey && options?.cache !== false) {
              this.library.cacheSet(cacheKey, gltf);
            }
            
            this.emitProgress({
              total: 1,
              loaded: 1,
              failed: 0,
              progress: 1.0,
              currentAsset: url
            });

            resolveLoad({ success: true, data: gltf });
          },
          (xhr) => {
            // Progress callback
            if (xhr.total > 0) {
              this.emitProgress({
                total: xhr.total,
                loaded: xhr.loaded,
                failed: 0,
                progress: xhr.loaded / xhr.total,
                currentAsset: url
              });
            }
          },
          (error) => {
            // Error callback
            resolveLoad({ 
              success: false, 
              error: error instanceof Error ? error : new Error('Failed to load GLTF') 
            });
          }
        );
      });

      // Race between load and timeout
      Promise.race([loadPromise, timeoutPromise])
        .then(resolve)
        .catch(error => {
          resolve({ success: false, error });
        });
    });
  }

  /**
   * Load multiple GLTF files with concurrency control
   */
  public async loadGLTFBatch(
    urls: string[],
    options?: LoadOptions
  ): Promise<AssetResult<Map<string, GLTF>>> {
    const results = new Map<string, GLTF>();
    const errors: Error[] = [];
    let loaded = 0;
    let failed = 0;

    const emitBatchProgress = () => {
      this.emitProgress({
        total: urls.length,
        loaded,
        failed,
        progress: (loaded + failed) / urls.length,
        currentAsset: `${loaded}/${urls.length}`
      });
    };

    // Process with concurrency limit
    const processQueue = async () => {
      while (this.queue.length > 0 && this.currentLoads < this.maxConcurrentLoads) {
        const task = this.queue.shift();
        if (!task) break;

        this.currentLoads++;
        
        try {
          const result = await this.loadGLTF(task.url, options);
          
          if (result.success) {
            results.set(task.url, result.data);
            loaded++;
          } else {
            errors.push(result.error);
            failed++;
          }
          
          emitBatchProgress();
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error('Unknown error'));
          failed++;
          emitBatchProgress();
        } finally {
          this.currentLoads--;
          processQueue(); // Process next item
        }
      }
    };

    // Queue all URLs
    urls.forEach(url => {
      this.queue.push({ url, callback: () => {} });
    });

    // Start processing
    processQueue();

    // Wait for all to complete
    return new Promise((resolve) => {
      const checkCompletion = setInterval(() => {
        if (loaded + failed >= urls.length) {
          clearInterval(checkCompletion);
          
          if (failed > 0 && loaded === 0) {
            resolve({ 
              success: false, 
              error: new Error(`All ${failed} loads failed`) 
            });
          } else {
            resolve({ success: true, data: results });
          }
        }
      }, 100);
    });
  }

  // ============================================================================
  // Texture Loading
  // ============================================================================

  /**
   * Load a texture with optional compression
   */
  public async loadTexture(
    url: string,
    options?: LoadOptions & { compress?: boolean }
  ): Promise<AssetResult<THREE.Texture>> {
    const cacheKey = options?.cache !== false ? `texture_${url}` : null;

    // Check cache
    if (cacheKey) {
      const cached = this.library.cacheGet<THREE.Texture>(cacheKey);
      if (cached) {
        return { success: true, data: cached };
      }
    }

    return new Promise((resolve) => {
      const textureLoader = new THREE.TextureLoader();
      
      textureLoader.load(
        url,
        (texture) => {
          // Apply compression if requested
          if (options?.compress) {
            // texture.compression = THREE.BasisCompression; // Requires Basis transcoder - commented out due to type issues
          }
          
          if (cacheKey && options?.cache !== false) {
            this.library.cacheSet(cacheKey, texture);
          }
          
          resolve({ success: true, data: texture });
        },
        undefined, // Progress (optional)
        (error) => {
          resolve({ 
            success: false, 
            error: error instanceof Error ? error : new Error('Failed to load texture') 
          });
        }
      );
    });
  }

  /**
   * Load PBR texture set (albedo, normal, roughness, metalness, etc.)
   */
  public async loadPBRTextures(
    basePath: string,
    textureNames: {
      baseColor?: string;
      normal?: string;
      roughness?: string;
      metalness?: string;
      ao?: string;
      displacement?: string;
      emissive?: string;
    }
  ): Promise<AssetResult<Record<string, THREE.Texture>>> {
    const textures: Record<string, THREE.Texture> = {};
    const errors: Error[] = [];

    const texturePromises: Promise<void>[] = [];

    Object.entries(textureNames).forEach(([key, filename]) => {
      if (filename) {
        const url = `${basePath}/${filename}`;
        const promise = this.loadTexture(url).then(result => {
          if (result.success) {
            textures[key] = result.data;
          } else {
            errors.push(result.error);
          }
        });
        texturePromises.push(promise);
      }
    });

    await Promise.all(texturePromises);

    if (errors.length > 0 && Object.keys(textures).length === 0) {
      return { 
        success: false, 
        error: new Error(`All texture loads failed: ${errors.map(e => e.message).join(', ')}`) 
      };
    }

    return { success: true, data: textures };
  }

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  /**
   * Add progress callback
   */
  public onProgress(callback: (progress: LoadProgress) => void): void {
    this.onProgressCallbacks.add(callback);
  }

  /**
   * Remove progress callback
   */
  public offProgress(callback: (progress: LoadProgress) => void): void {
    this.onProgressCallbacks.delete(callback);
  }

  /**
   * Emit progress event to all callbacks
   */
  private emitProgress(progress: LoadProgress): void {
    this.onProgressCallbacks.forEach(callback => callback(progress));
    
    // Also emit through library event system
    const event: AssetEvent = {
      type: AssetEventType.LOAD_PROGRESS,
      progress,
      timestamp: Date.now()
    };
    // Library event emission would go here if needed
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Set maximum concurrent loads
   */
  public setMaxConcurrentLoads(max: number): void {
    this.maxConcurrentLoads = Math.max(1, max);
  }

  /**
   * Set default timeout for loads
   */
  public setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = Math.max(1000, timeout);
  }

  /**
   * Cancel all pending loads
   */
  public cancelAll(): void {
    this.queue = [];
    this.activeLoads.clear();
    this.currentLoads = 0;
  }

  /**
   * Cancel specific load
   */
  public cancel(url: string): void {
    this.queue = this.queue.filter(task => task.url !== url);
    this.activeLoads.delete(url);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get currently active load count
   */
  public getActiveLoadCount(): number {
    return this.currentLoads;
  }

  /**
   * Get queued load count
   */
  public getQueuedLoadCount(): number {
    return this.queue.length;
  }

  /**
   * Preload assets into cache
   */
  public async preload(
    urls: string[],
    type: 'gltf' | 'texture' = 'gltf'
  ): Promise<void> {
    const promises = urls.map(url => {
      if (type === 'gltf') {
        return this.loadGLTF(url, { cache: true });
      } else {
        return this.loadTexture(url, { cache: true });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Clear loader cache
   */
  public clearCache(): void {
    this.library.clearCache();
  }
}

/**
 * Internal load task interface
 */
interface LoadTask {
  url: string;
  callback: LoadCallback<any>;
}

// Export singleton-style helper
export const assetLoader = new AssetLoader();
