/**
 * AssetLibrary.ts
 *
 * Central registry and management system for all assets in Infinigen R3F.
 * Handles registration, lookup, caching, and lifecycle management of procedural generators and loaded assets.
 */
import * as THREE from 'three';
import { AssetCategory, AssetEventType } from './AssetTypes';
/**
 * Main asset library class for managing all scene assets
 */
export class AssetLibrary {
    constructor() {
        // Asset registries
        this.generators = new Map();
        this.materials = new Map();
        this.biomes = new Map();
        this.loadedAssets = new Map();
        // Metadata tracking
        this.metadata = new Map();
        // Caching
        this.cache = new Map();
        this.cacheEnabled = true;
        this.maxCacheSize = 1000;
        // Event listeners
        this.eventListeners = new Map();
        // Statistics
        this.stats = {
            totalGenerators: 0,
            totalMaterials: 0,
            totalBiomes: 0,
            loadedAssets: 0,
            cacheHits: 0,
            cacheMisses: 0,
            memoryUsage: 0
        };
        this.initializeEventTypes();
    }
    /**
     * Get singleton instance of AssetLibrary
     */
    static getInstance() {
        if (!AssetLibrary.instance) {
            AssetLibrary.instance = new AssetLibrary();
        }
        return AssetLibrary.instance;
    }
    /**
     * Initialize event type maps
     */
    initializeEventTypes() {
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
    registerGenerator(id, generator, category, tags = []) {
        if (this.generators.has(id)) {
            console.warn(`Generator ${id} already registered, overwriting`);
        }
        this.generators.set(id, generator);
        this.stats.totalGenerators++;
        const metadata = {
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
    getGenerator(id) {
        const generator = this.generators.get(id);
        if (!generator) {
            console.warn(`Generator ${id} not found`);
            return null;
        }
        return generator;
    }
    /**
     * Get all generators in a category
     */
    getGeneratorsByCategory(category) {
        const result = [];
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
    unregisterGenerator(id) {
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
    registerMaterial(id, material, tags = []) {
        if (this.materials.has(id)) {
            console.warn(`Material ${id} already registered, overwriting`);
        }
        this.materials.set(id, material);
        this.stats.totalMaterials++;
        const metadata = {
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
    getMaterial(id) {
        return this.materials.get(id) || null;
    }
    /**
     * Get all materials
     */
    getAllMaterials() {
        return Array.from(this.materials.values());
    }
    /**
     * Remove a material from the library
     */
    unregisterMaterial(id) {
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
    registerBiome(id, biome) {
        if (this.biomes.has(id)) {
            console.warn(`Biome ${id} already registered, overwriting`);
        }
        this.biomes.set(id, biome);
        this.stats.totalBiomes++;
        const metadata = {
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
    getBiome(id) {
        return this.biomes.get(id) || null;
    }
    /**
     * Get all registered biomes
     */
    getAllBiomes() {
        return Array.from(this.biomes.values());
    }
    // ============================================================================
    // Loaded Asset Management
    // ============================================================================
    /**
     * Store a loaded asset in the library
     */
    storeLoadedAsset(id, asset) {
        this.loadedAssets.set(id, asset);
        this.stats.loadedAssets++;
    }
    /**
     * Get a loaded asset by ID
     */
    getLoadedAsset(id) {
        return this.loadedAssets.get(id) || null;
    }
    /**
     * Remove a loaded asset
     */
    removeLoadedAsset(id) {
        if (this.loadedAssets.delete(id)) {
            this.stats.loadedAssets--;
            return true;
        }
        return false;
    }
    /**
     * Clear all loaded assets from memory
     */
    clearLoadedAssets() {
        this.loadedAssets.forEach(asset => {
            // Dispose geometries and materials
            asset.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    }
                    else {
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
    cacheSet(key, value) {
        if (!this.cacheEnabled)
            return;
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
    cacheGet(key) {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.stats.cacheHits++;
            this.emitEvent({
                type: AssetEventType.CACHE_HIT,
                assetId: key,
                timestamp: Date.now()
            });
            return value;
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
    hasCached(key) {
        return this.cache.has(key);
    }
    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
    }
    /**
     * Enable or disable caching
     */
    setCacheEnabled(enabled) {
        this.cacheEnabled = enabled;
    }
    // ============================================================================
    // Event System
    // ============================================================================
    /**
     * Add an event listener
     */
    addEventListener(type, callback) {
        const listeners = this.eventListeners.get(type);
        if (listeners) {
            listeners.add(callback);
        }
    }
    /**
     * Remove an event listener
     */
    removeEventListener(type, callback) {
        const listeners = this.eventListeners.get(type);
        if (listeners) {
            listeners.delete(callback);
        }
    }
    /**
     * Emit an event to all listeners
     */
    emitEvent(event) {
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
    getStats() {
        // Update memory usage estimate
        this.stats.memoryUsage = this.estimateMemoryUsage();
        return { ...this.stats };
    }
    /**
     * Estimate current memory usage
     */
    estimateMemoryUsage() {
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
                        const img = texture.image;
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
    printStats() {
        const stats = this.getStats();
        console.log('=== Asset Library Statistics ===');
        console.log(`Generators: ${stats.totalGenerators}`);
        console.log(`Materials: ${stats.totalMaterials}`);
        console.log(`Biomes: ${stats.totalBiomes}`);
        console.log(`Loaded Assets: ${stats.loadedAssets}`);
        console.log(`Cache Hits: ${stats.cacheHits}`);
        console.log(`Cache Misses: ${stats.cacheMisses}`);
        console.log(`Memory Usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
        console.log('================================');
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Search assets by tags
     */
    searchByTags(tags) {
        const results = [];
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
    exportConfig() {
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
    reset() {
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
// Export singleton instance helper
export const assetLibrary = AssetLibrary.getInstance();
//# sourceMappingURL=AssetLibrary.js.map