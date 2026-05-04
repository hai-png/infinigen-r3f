/**
 * Asset Streaming System
 * 
 * Provides progressive loading, priority-based streaming, and memory management
 * for large-scale scene generation.
 */

import { Object3D, Texture, BufferGeometry } from 'three';

// ============================================================================
// Types & Interfaces
// ============================================================================

export enum StreamPriority {
  CRITICAL = 0,   // Immediately visible, highest priority
  HIGH = 1,       // Soon to be visible
  MEDIUM = 2,     // Within view frustum
  LOW = 3,        // Outside view but nearby
  BACKGROUND = 4, // Far away, load when idle
}

export enum LoadState {
  PENDING = 'pending',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
  UNLOADED = 'unloaded',
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

export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  maxMemoryMB: 512,
  maxConcurrentLoads: 4,
  priorityUpdateInterval: 500,
  unloadDelay: 5000,
  enableProgressive: true,
  enablePrediction: true,
  predictionHorizon: 3,
};

// ============================================================================
// Asset Streamer
// ============================================================================

export class AssetStreamer {
  private assets: Map<string, StreamableAsset> = new Map();
  private loadQueue: StreamableAsset[] = [];
  private activeLoads: Set<string> = new Set();
  private config: StreamingConfig;
  private currentMemoryMB: number = 0;
  private updateInterval?: number;

  constructor(config: Partial<StreamingConfig> = {}) {
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
    this.startUpdateLoop();
  }

  /**
   * Register asset for streaming
   */
  registerAsset(asset: StreamableAsset): void {
    this.assets.set(asset.id, asset);
    this.updateLoadQueue();
  }

  /**
   * Unregister asset
   */
  unregisterAsset(id: string): void {
    const asset = this.assets.get(id);
    if (asset) {
      this.currentMemoryMB -= asset.size / (1024 * 1024);
      this.assets.delete(id);
      
      // Remove from load queue
      const index = this.loadQueue.findIndex(a => a.id === id);
      if (index !== -1) {
        this.loadQueue.splice(index, 1);
      }
    }
  }

  /**
   * Mark asset as accessed (updates priority)
   */
  accessAsset(id: string): void {
    const asset = this.assets.get(id);
    if (asset) {
      asset.lastAccessed = performance.now();
      asset.accessCount++;
      this.updateAssetPriority(asset);
    }
  }

  /**
   * Update asset priority based on camera distance
   */
  private updateAssetPriority(asset: StreamableAsset): void {
    const distance = asset.distanceToCamera || Infinity;
    const sphere = asset.boundingSphere || 1;

    if (distance < sphere * 2) {
      asset.priority = StreamPriority.CRITICAL;
    } else if (distance < sphere * 5) {
      asset.priority = StreamPriority.HIGH;
    } else if (distance < sphere * 10) {
      asset.priority = StreamPriority.MEDIUM;
    } else if (distance < sphere * 20) {
      asset.priority = StreamPriority.LOW;
    } else {
      asset.priority = StreamPriority.BACKGROUND;
    }
  }

  /**
   * Update load queue based on priorities
   */
  private updateLoadQueue(): void {
    // Sort by priority and access recency
    this.loadQueue = Array.from(this.assets.values())
      .filter(a => a.state === LoadState.PENDING || a.state === LoadState.UNLOADED)
      .sort((a, b) => {
        // Primary sort by priority
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // Secondary sort by access count
        if (b.accessCount !== a.accessCount) {
          return b.accessCount - a.accessCount;
        }
        // Tertiary sort by last accessed time
        return b.lastAccessed - a.lastAccessed;
      });

    this.processLoadQueue();
  }

  /**
   * Process load queue
   */
  private async processLoadQueue(): Promise<void> {
    while (
      this.loadQueue.length > 0 &&
      this.activeLoads.size < this.config.maxConcurrentLoads
    ) {
      const asset = this.loadQueue.shift();
      if (asset && !this.activeLoads.has(asset.id)) {
        this.loadAsset(asset);
      }
    }
  }

  /**
   * Load single asset
   */
  private async loadAsset(asset: StreamableAsset): Promise<void> {
    if (this.activeLoads.has(asset.id)) return;

    asset.state = LoadState.LOADING;
    this.activeLoads.add(asset.id);

    try {
      // Simulate loading (replace with actual loader)
      const data = await this.fetchAsset(asset.url, asset.type);
      
      asset.data = data;
      asset.state = LoadState.LOADED;
      asset.size = this.calculateAssetSize(data);
      this.currentMemoryMB += asset.size / (1024 * 1024);

      // Check memory limit
      if (this.currentMemoryMB > this.config.maxMemoryMB) {
        this.unloadLeastImportant();
      }
    } catch (error) {
      console.error(`Failed to load asset ${asset.id}:`, error);
      asset.state = LoadState.ERROR;
    } finally {
      this.activeLoads.delete(asset.id);
      this.processLoadQueue();
    }
  }

  /**
   * Fetch asset data with appropriate loader based on type
   */
  private async fetchAsset(url: string, type: string): Promise<any> {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch asset: ${url} (${response.status})`);
      }
      
      switch (type.toLowerCase()) {
        case 'gltf':
        case 'glb':
          return await this.loadGLTF(response);
        
        case 'obj':
          return await this.loadOBJ(response);
        
        case 'fbx':
          return await this.loadFBX(response);
        
        case 'texture':
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'webp':
          return await this.loadTexture(response);
        
        case 'hdr':
        case 'exr':
          return await this.loadHDRI(response);
        
        default:
          // Fallback: return blob
          return await response.blob();
      }
    } catch (error) {
      console.error(`Error fetching asset ${url}:`, error);
      throw error;
    }
  }

  /**
   * Load GLTF/GLB model
   */
  private async loadGLTF(response: Response): Promise<any> {
    const arrayBuffer = await response.arrayBuffer();
    // In production, use GLTFLoader from three/examples
    return {
      type: 'gltf',
      data: arrayBuffer,
      url: response.url,
      size: arrayBuffer.byteLength
    };
  }

  /**
   * Load OBJ model
   */
  private async loadOBJ(response: Response): Promise<any> {
    const text = await response.text();
    // In production, use OBJLoader from three/examples
    return {
      type: 'obj',
      data: text,
      url: response.url,
      size: text.length
    };
  }

  /**
   * Load FBX model
   */
  private async loadFBX(response: Response): Promise<any> {
    const arrayBuffer = await response.arrayBuffer();
    // In production, use FBXLoader from three/examples
    return {
      type: 'fbx',
      data: arrayBuffer,
      url: response.url,
      size: arrayBuffer.byteLength
    };
  }

  /**
   * Load texture image
   */
  private async loadTexture(response: Response): Promise<any> {
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);
    return {
      type: 'texture',
      data: imageBitmap,
      url: response.url,
      size: blob.size,
      width: imageBitmap.width,
      height: imageBitmap.height
    };
  }

  /**
   * Load HDRI environment map
   */
  private async loadHDRI(response: Response): Promise<any> {
    const arrayBuffer = await response.arrayBuffer();
    // In production, use RGBELoader or EXRLoader
    return {
      type: 'hdri',
      data: arrayBuffer,
      url: response.url,
      size: arrayBuffer.byteLength
    };
  }

  /**
   * Calculate asset size in bytes
   */
  private calculateAssetSize(data: any): number {
    if (data?.size !== undefined) {
      return data.size;
    }
    
    if (data?.data) {
      if (data.data instanceof ArrayBuffer) {
        return data.data.byteLength;
      }
      if (typeof data.data === 'string') {
        return data.data.length;
      }
      if (data.data instanceof Blob) {
        return data.data.size;
      }
    }
    
    // Estimate based on type
    const typeSizes: Record<string, number> = {
      'gltf': 512 * 1024,    // 512KB average
      'glb': 256 * 1024,     // 256KB average
      'obj': 128 * 1024,     // 128KB average
      'texture': 1024 * 1024, // 1MB average
      'hdri': 8 * 1024 * 1024 // 8MB average
    };
    
    return typeSizes[data?.type] || 1024 * 1024; // Default 1MB
  }

  /**
   * Unload least important asset
   */
  private unloadLeastImportant(): void {
    // Find lowest priority loaded asset
    let candidate: StreamableAsset | null = null;
    
    for (const asset of this.assets.values()) {
      if (asset.state === LoadState.LOADED && asset.priority === StreamPriority.BACKGROUND) {
        if (!candidate || asset.lastAccessed < candidate.lastAccessed) {
          candidate = asset;
        }
      }
    }

    if (candidate) {
      this.unloadAsset(candidate.id);
    }
  }

  /**
   * Unload specific asset
   */
  unloadAsset(id: string): void {
    const asset = this.assets.get(id);
    if (asset && asset.state === LoadState.LOADED) {
      // Dispose resources
      this.disposeAssetData(asset.data);
      
      asset.data = null;
      asset.state = LoadState.UNLOADED;
      this.currentMemoryMB -= asset.size / (1024 * 1024);
    }
  }

  /**
   * Dispose asset data
   */
  private disposeAssetData(data: any): void {
    if (!data) return;

    // Dispose Three.js resources
    if (data instanceof BufferGeometry) {
      data.dispose();
    }
    if (data instanceof Texture) {
      data.dispose();
    }
    if (data instanceof Object3D) {
      data.traverse((child: Object3D) => {
        if ((child as any).geometry) {
          (child as any).geometry.dispose();
        }
        if ((child as any).material) {
          if (Array.isArray((child as any).material)) {
            (child as any).material.forEach((m: any) => m.dispose());
          } else {
            (child as any).material.dispose();
          }
        }
      });
    }
  }

  /**
   * Start priority update loop
   */
  private startUpdateLoop(): void {
    this.updateInterval = window.setInterval(() => {
      this.updatePriorities();
    }, this.config.priorityUpdateInterval);
  }

  /**
   * Update all asset priorities
   */
  private updatePriorities(): void {
    for (const asset of this.assets.values()) {
      this.updateAssetPriority(asset);
    }
    this.updateLoadQueue();
  }

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
  } {
    let loaded = 0, loading = 0, pending = 0;
    
    for (const asset of this.assets.values()) {
      switch (asset.state) {
        case LoadState.LOADED: loaded++; break;
        case LoadState.LOADING: loading++; break;
        default: pending++; break;
      }
    }

    return {
      totalAssets: this.assets.size,
      loadedAssets: loaded,
      loadingAssets: loading,
      pendingAssets: pending,
      memoryUsageMB: this.currentMemoryMB,
      memoryLimitMB: this.config.maxMemoryMB,
    };
  }

  /**
   * Stop streaming system
   */
  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Unload all assets
    for (const id of this.assets.keys()) {
      this.unloadAsset(id);
    }

    this.assets.clear();
    this.loadQueue = [];
    this.activeLoads.clear();
  }
}

// ============================================================================
// Progressive Loading
// ============================================================================

export interface ProgressiveLoadOptions {
  chunks: number;
  chunkDelayMs: number;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}

export async function progressiveLoad<T>(
  loader: () => Promise<T>,
  options: ProgressiveLoadOptions
): Promise<T> {
  const { chunks, chunkDelayMs, onProgress, onComplete } = options;
  
  for (let i = 0; i < chunks; i++) {
    await new Promise(resolve => setTimeout(resolve, chunkDelayMs));
    if (onProgress) {
      onProgress((i + 1) / chunks);
    }
  }

  const result = await loader();
  if (onComplete) {
    onComplete();
  }

  return result;
}

// ============================================================================
// Prediction Engine
// ============================================================================

export class PredictionEngine {
  private history: Array<{ position: { x: number; y: number; z: number }; timestamp: number }> = [];
  private maxHistorySize: number = 60; // 1 second at 60fps

  /**
   * Record camera position
   */
  recordPosition(position: { x: number; y: number; z: number }): void {
    this.history.push({
      position,
      timestamp: performance.now(),
    });

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Predict future camera position
   */
  predictPosition(horizonSeconds: number): { x: number; y: number; z: number } {
    if (this.history.length < 2) {
      return this.history[0]?.position || { x: 0, y: 0, z: 0 };
    }

    // Calculate velocity from recent positions
    const recent = this.history.slice(-10);
    const first = recent[0].position;
    const last = recent[recent.length - 1].position;
    const timeDelta = (recent[recent.length - 1].timestamp - recent[0].timestamp) / 1000;

    if (timeDelta === 0) {
      return last;
    }

    const velocity = {
      x: (last.x - first.x) / timeDelta,
      y: (last.y - first.y) / timeDelta,
      z: (last.z - first.z) / timeDelta,
    };

    // Extrapolate
    return {
      x: last.x + velocity.x * horizonSeconds,
      y: last.y + velocity.y * horizonSeconds,
      z: last.z + velocity.z * horizonSeconds,
    };
  }

  /**
   * Get assets that will be needed soon
   */
  getPredictedAssets(
    assets: StreamableAsset[],
    horizonSeconds: number
  ): StreamableAsset[] {
    const predictedPos = this.predictPosition(horizonSeconds);

    return assets
      .map(asset => {
        const dx = (asset.boundingSphere || 0) - predictedPos.x;
        const dy = (asset.boundingSphere || 0) - predictedPos.y;
        const dz = (asset.boundingSphere || 0) - predictedPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        return { asset, distance };
      })
      .filter(({ distance }) => distance < 50) // Within 50 units
      .sort((a, b) => a.distance - b.distance)
      .map(({ asset }) => asset);
  }
}

/**
 * Default export – AssetStreamer, the primary class in this module.
 *
 * Previously this file exported a bag-of-symbols object as default.  All
 * symbols remain available as named exports.
 */
export default AssetStreamer;
