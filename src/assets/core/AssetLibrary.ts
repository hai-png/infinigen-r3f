/**
 * AssetLibrary.ts
 * 
 * Central registry and management system for all assets in Infinigen R3F.
 * Handles registration, lookup, caching, and lifecycle management of procedural generators and loaded assets.
 */

import * as THREE from 'three';
import { 
  IAsset, 
  AssetCategory, 
  IProceduralGenerator, 
  IPBRMaterial,
  IBiome,
  AssetMetadata,
  AssetResult,
  LoadOptions,
  LoadProgress,
  AssetEvent,
  AssetEventType
} from './AssetTypes';
import { Logger } from '@/core/util/Logger';

/**
 * Main asset library class for managing all scene assets
 */
export class AssetLibrary {
  private static instance: AssetLibrary;
  
  // Asset registries
  private generators: Map<string, IProceduralGenerator<any>> = new Map();
  private materials: Map<string, IPBRMaterial> = new Map();
  private biomes: Map<string, IBiome> = new Map();
  private loadedAssets: Map<string, THREE.Object3D> = new Map();
  
  // Metadata tracking
  private metadata: Map<string, AssetMetadata> = new Map();
  
  // Caching
  private cache: Map<string, any> = new Map();
  private cacheEnabled: boolean = true;
  private maxCacheSize: number = 1000;
  
  // Event listeners
  private eventListeners: Map<AssetEventType, Set<(event: AssetEvent) => void>> = new Map();
  
  // Statistics
  private stats: LibraryStats = {
    totalGenerators: 0,
    totalMaterials: 0,
    totalBiomes: 0,
    loadedAssets: 0,
    cacheHits: 0,
    cacheMisses: 0,
    memoryUsage: 0
  };

  private constructor() {
    this.initializeEventTypes();
  }

  /**
   * Get singleton instance of AssetLibrary
   */
  public static getInstance(): AssetLibrary {
    if (!AssetLibrary.instance) {
      AssetLibrary.instance = new AssetLibrary();
    }
    return AssetLibrary.instance;
  }

  /**
   * Initialize event type maps
   */
  private initializeEventTypes(): void {
    const eventTypes = Object.values(AssetEventType);
    eventTypes.forEach(type => {
      this.eventListeners.set(type, new Set());
    });
  }

  // ============================================================================
  // Generator Registration & Management
  // ============================================================================

  /**
   * Register a procedural generator
   */
  public registerGenerator<TParams>(
    id: string, 
    generator: IProceduralGenerator<TParams>,
    category: AssetCategory,
    tags: string[] = []
  ): void {
    if (this.generators.has(id)) {
      Logger.warn('AssetLibrary', `Generator ${id} already registered, overwriting`);
    }

    this.generators.set(id, generator as IProceduralGenerator<any>);
    this.stats.totalGenerators++;

    const metadata: AssetMetadata = {
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: 'system',
      description: `Procedural generator: ${id}`,
      tags: [...tags, category]
    };

    this.metadata.set(id, metadata);
    this.emitEvent({
      type: AssetEventType.LOAD_COMPLETE,
      assetId: id,
      timestamp: Date.now()
    });
  }

  /**
   * Get a registered generator by ID
   */
  public getGenerator<TParams>(id: string): IProceduralGenerator<TParams> | null {
    const generator = this.generators.get(id);
    if (!generator) {
      Logger.warn('AssetLibrary', `Generator ${id} not found`);
      return null;
    }
    return generator as IProceduralGenerator<TParams>;
  }

  /**
   * Get all generators in a category
   */
  public getGeneratorsByCategory(category: AssetCategory): IProceduralGenerator<any>[] {
    const result: IProceduralGenerator<any>[] = [];
    this.generators.forEach((generator, id) => {
      const meta = this.metadata.get(id);
      if (meta && meta.tags?.includes(category)) {
        result.push(generator);
      }
    });
    return result;
  }

  /**
   * Remove a generator from the library
   */
  public unregisterGenerator(id: string): boolean {
    if (this.generators.delete(id)) {
      this.metadata.delete(id);
      this.cache.delete(id);
      this.stats.totalGenerators--;
      return true;
    }
    return false;
  }

  // ============================================================================
  // Material Registration & Management
  // ============================================================================

  /**
   * Register a PBR material
   */
  public registerMaterial(
    id: string,
    material: IPBRMaterial,
    tags: string[] = []
  ): void {
    if (this.materials.has(id)) {
      Logger.warn('AssetLibrary', `Material ${id} already registered, overwriting`);
    }

    this.materials.set(id, material);
    this.stats.totalMaterials++;

    const metadata: AssetMetadata = {
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: 'system',
      description: `PBR Material: ${id}`,
      tags
    };

    this.metadata.set(id, metadata);
  }

  /**
   * Get a registered material by ID
   */
  public getMaterial(id: string): IPBRMaterial | null {
    return this.materials.get(id) || null;
  }

  /**
   * Get all materials
   */
  public getAllMaterials(): IPBRMaterial[] {
    return Array.from(this.materials.values());
  }

  /**
   * Remove a material from the library
   */
  public unregisterMaterial(id: string): boolean {
    if (this.materials.delete(id)) {
      this.metadata.delete(id);
      this.cache.delete(id);
      this.stats.totalMaterials--;
      return true;
    }
    return false;
  }

  // ============================================================================
  // Biome Registration & Management
  // ============================================================================

  /**
   * Register a biome definition
   */
  public registerBiome(id: string, biome: IBiome): void {
    if (this.biomes.has(id)) {
      Logger.warn('AssetLibrary', `Biome ${id} already registered, overwriting`);
    }

    this.biomes.set(id, biome);
    this.stats.totalBiomes++;

    const metadata: AssetMetadata = {
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: 'system',
      description: `Biome: ${biome.name}`
    };

    this.metadata.set(id, metadata);
  }

  /**
   * Get a registered biome by ID
   */
  public getBiome(id: string): IBiome | null {
    return this.biomes.get(id) || null;
  }

  /**
   * Get all registered biomes
   */
  public getAllBiomes(): IBiome[] {
    return Array.from(this.biomes.values());
  }

  // ============================================================================
  // Loaded Asset Management
  // ============================================================================

  /**
   * Store a loaded asset in the library
   */
  public storeLoadedAsset(id: string, asset: THREE.Object3D): void {
    this.loadedAssets.set(id, asset);
    this.stats.loadedAssets++;
  }

  /**
   * Get a loaded asset by ID
   */
  public getLoadedAsset(id: string): THREE.Object3D | null {
    return this.loadedAssets.get(id) || null;
  }

  /**
   * Remove a loaded asset
   */
  public removeLoadedAsset(id: string): boolean {
    if (this.loadedAssets.delete(id)) {
      this.stats.loadedAssets--;
      return true;
    }
    return false;
  }

  /**
   * Clear all loaded assets from memory
   */
  public clearLoadedAssets(): void {
    this.loadedAssets.forEach(asset => {
      // Dispose geometries and materials
      asset.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    this.loadedAssets.clear();
    this.stats.loadedAssets = 0;
  }

  // ============================================================================
  // Caching System
  // ============================================================================

  /**
   * Cache a generated or computed result
   */
  public cacheSet(key: string, value: any): void {
    if (!this.cacheEnabled) return;

    // Enforce cache size limit
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * Get a cached value
   */
  public cacheGet<T>(key: string): T | null {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.stats.cacheHits++;
      this.emitEvent({
        type: AssetEventType.CACHE_HIT,
        assetId: key,
        timestamp: Date.now()
      });
      return value as T;
    }
    
    this.stats.cacheMisses++;
    this.emitEvent({
      type: AssetEventType.CACHE_MISS,
      assetId: key,
      timestamp: Date.now()
    });
    return null;
  }

  /**
   * Check if a key exists in cache
   */
  public hasCached(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Enable or disable caching
   */
  public setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Add an event listener
   */
  public addEventListener(
    type: AssetEventType,
    callback: (event: AssetEvent) => void
  ): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.add(callback);
    }
  }

  /**
   * Remove an event listener
   */
  public removeEventListener(
    type: AssetEventType,
    callback: (event: AssetEvent) => void
  ): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit an event to all listeners
   */
  private emitEvent(event: AssetEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
  }

  // ============================================================================
  // Statistics & Monitoring
  // ============================================================================

  /**
   * Get library statistics
   */
  public getStats(): LibraryStats {
    // Update memory usage estimate
    this.stats.memoryUsage = this.estimateMemoryUsage();
    return { ...this.stats };
  }

  /**
   * Estimate current memory usage
   */
  private estimateMemoryUsage(): number {
    let total = 0;
    
    // Estimate generator memory
    total += this.generators.size * 1024; // ~1KB per generator
    
    // Estimate material memory
    this.materials.forEach(material => {
      total += 512; // Base material overhead
      // Add texture memory estimates
      if (material.textures) {
        Object.values(material.textures).forEach(texture => {
          if (texture && texture.image) {
            const img = texture.image as HTMLCanvasElement | ImageBitmap;
            if (img) {
              total += (img.width || 1024) * (img.height || 1024) * 4; // RGBA
            }
          }
        });
      }
    });

    // Estimate loaded asset memory
    this.loadedAssets.forEach(asset => {
      asset.traverse(child => {
        if (child instanceof THREE.Mesh) {
          total += child.geometry.attributes.position.count * 12; // 3 floats * 4 bytes
        }
      });
    });

    return total;
  }

  /**
   * Print statistics to console
   */
  public printStats(): void {
    const stats = this.getStats();
    Logger.debug('AssetLibrary', '=== Asset Library Statistics ===');
    Logger.debug('AssetLibrary', `Generators: ${stats.totalGenerators}`);
    Logger.debug('AssetLibrary', `Materials: ${stats.totalMaterials}`);
    Logger.debug('AssetLibrary', `Biomes: ${stats.totalBiomes}`);
    Logger.debug('AssetLibrary', `Loaded Assets: ${stats.loadedAssets}`);
    Logger.debug('AssetLibrary', `Cache Hits: ${stats.cacheHits}`);
    Logger.debug('AssetLibrary', `Cache Misses: ${stats.cacheMisses}`);
    Logger.debug('AssetLibrary', `Memory Usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
    Logger.debug('AssetLibrary', '================================');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Search assets by tags
   */
  public searchByTags(tags: string[]): IAsset[] {
    const results: IAsset[] = [];
    
    this.metadata.forEach((meta, id) => {
      const hasAllTags = tags.every(tag => meta.tags?.includes(tag));
      if (hasAllTags) {
        results.push({
          id,
          name: id,
          category: AssetCategory.MISCELLANEOUS,
          tags: meta.tags || [],
          lodLevels: 1,
          boundingBox: new THREE.Box3(),
          metadata: meta
        });
      }
    });

    return results;
  }

  /**
   * Export library configuration to JSON
   */
  public exportConfig(): string {
    const config = {
      generators: Array.from(this.generators.keys()),
      materials: Array.from(this.materials.keys()),
      biomes: Array.from(this.biomes.keys()),
      stats: this.getStats()
    };
    return JSON.stringify(config, null, 2);
  }

  /**
   * Reset the library to initial state
   */
  public reset(): void {
    this.clearLoadedAssets();
    this.clearCache();
    this.generators.clear();
    this.materials.clear();
    this.biomes.clear();
    this.metadata.clear();
    
    this.stats = {
      totalGenerators: 0,
      totalMaterials: 0,
      totalBiomes: 0,
      loadedAssets: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryUsage: 0
    };
  }
}

/**
 * Library statistics interface
 */
export interface LibraryStats {
  totalGenerators: number;
  totalMaterials: number;
  totalBiomes: number;
  loadedAssets: number;
  cacheHits: number;
  cacheMisses: number;
  memoryUsage: number;
}

// Export singleton instance helper
export const assetLibrary = AssetLibrary.getInstance();
