/**
 * AssetLibrary.ts
 *
 * Central registry and management system for all assets in Infinigen R3F.
 * Handles registration, lookup, caching, and lifecycle management of procedural generators and loaded assets.
 */
import * as THREE from 'three';
import { IAsset, AssetCategory, IProceduralGenerator, IPBRMaterial, IBiome, AssetEvent, AssetEventType } from './AssetTypes';
/**
 * Main asset library class for managing all scene assets
 */
export declare class AssetLibrary {
    private static instance;
    private generators;
    private materials;
    private biomes;
    private loadedAssets;
    private metadata;
    private cache;
    private cacheEnabled;
    private maxCacheSize;
    private eventListeners;
    private stats;
    private constructor();
    /**
     * Get singleton instance of AssetLibrary
     */
    static getInstance(): AssetLibrary;
    /**
     * Initialize event type maps
     */
    private initializeEventTypes;
    /**
     * Register a procedural generator
     */
    registerGenerator<TParams>(id: string, generator: IProceduralGenerator<TParams>, category: AssetCategory, tags?: string[]): void;
    /**
     * Get a registered generator by ID
     */
    getGenerator<TParams>(id: string): IProceduralGenerator<TParams> | null;
    /**
     * Get all generators in a category
     */
    getGeneratorsByCategory(category: AssetCategory): IProceduralGenerator<any>[];
    /**
     * Remove a generator from the library
     */
    unregisterGenerator(id: string): boolean;
    /**
     * Register a PBR material
     */
    registerMaterial(id: string, material: IPBRMaterial, tags?: string[]): void;
    /**
     * Get a registered material by ID
     */
    getMaterial(id: string): IPBRMaterial | null;
    /**
     * Get all materials
     */
    getAllMaterials(): IPBRMaterial[];
    /**
     * Remove a material from the library
     */
    unregisterMaterial(id: string): boolean;
    /**
     * Register a biome definition
     */
    registerBiome(id: string, biome: IBiome): void;
    /**
     * Get a registered biome by ID
     */
    getBiome(id: string): IBiome | null;
    /**
     * Get all registered biomes
     */
    getAllBiomes(): IBiome[];
    /**
     * Store a loaded asset in the library
     */
    storeLoadedAsset(id: string, asset: THREE.Object3D): void;
    /**
     * Get a loaded asset by ID
     */
    getLoadedAsset(id: string): THREE.Object3D | null;
    /**
     * Remove a loaded asset
     */
    removeLoadedAsset(id: string): boolean;
    /**
     * Clear all loaded assets from memory
     */
    clearLoadedAssets(): void;
    /**
     * Cache a generated or computed result
     */
    cacheSet(key: string, value: any): void;
    /**
     * Get a cached value
     */
    cacheGet<T>(key: string): T | null;
    /**
     * Check if a key exists in cache
     */
    hasCached(key: string): boolean;
    /**
     * Clear the cache
     */
    clearCache(): void;
    /**
     * Enable or disable caching
     */
    setCacheEnabled(enabled: boolean): void;
    /**
     * Add an event listener
     */
    addEventListener(type: AssetEventType, callback: (event: AssetEvent) => void): void;
    /**
     * Remove an event listener
     */
    removeEventListener(type: AssetEventType, callback: (event: AssetEvent) => void): void;
    /**
     * Emit an event to all listeners
     */
    private emitEvent;
    /**
     * Get library statistics
     */
    getStats(): LibraryStats;
    /**
     * Estimate current memory usage
     */
    private estimateMemoryUsage;
    /**
     * Print statistics to console
     */
    printStats(): void;
    /**
     * Search assets by tags
     */
    searchByTags(tags: string[]): IAsset[];
    /**
     * Export library configuration to JSON
     */
    exportConfig(): string;
    /**
     * Reset the library to initial state
     */
    reset(): void;
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
export declare const assetLibrary: AssetLibrary;
//# sourceMappingURL=AssetLibrary.d.ts.map