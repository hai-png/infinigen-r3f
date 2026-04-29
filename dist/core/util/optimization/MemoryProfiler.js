/**
 * MemoryProfiler - Monitors and profiles memory usage in real-time
 *
 * Tracks geometry, texture, material, and overall heap memory consumption
 * to help identify memory leaks and optimize resource usage.
 */
import * as THREE from 'three';
/**
 * Real-time memory profiler for Three.js scenes
 */
export class MemoryProfiler {
    constructor(scene, renderer, config = {}) {
        this.snapshotHistory = [];
        this.lastGCTime = 0;
        this.scene = scene;
        this.renderer = renderer;
        this.config = {
            heapWarningThreshold: config.heapWarningThreshold ?? 0.8,
            textureWarningThreshold: config.textureWarningThreshold ?? 256,
            geometryWarningThreshold: config.geometryWarningThreshold ?? 128,
            detailedTracking: config.detailedTracking ?? true,
            historySize: config.historySize ?? 60
        };
    }
    /**
     * Get current memory statistics
     */
    getStats() {
        const breakdown = {
            byGeometryType: new Map(),
            byTextureSize: new Map(),
            byMaterialType: new Map(),
            largestGeometries: [],
            largestTextures: []
        };
        let geometryMemory = 0;
        let textureMemory = 0;
        let materialMemory = 0;
        let objectCount = 0;
        let geometryCount = 0;
        let textureCount = 0;
        let materialCount = 0;
        const geometrySizes = [];
        const textureSizes = [];
        // Track seen objects to avoid double counting
        const seenGeometries = new Set();
        const seenTextures = new Set();
        const seenMaterials = new Set();
        this.scene.traverse((object) => {
            objectCount++;
            if (object instanceof THREE.Mesh) {
                const mesh = object;
                // Count geometry
                if (mesh.geometry && !seenGeometries.has(mesh.geometry)) {
                    seenGeometries.add(mesh.geometry);
                    geometryCount++;
                    const geomSize = this.calculateGeometrySize(mesh.geometry);
                    geometryMemory += geomSize;
                    if (this.config.detailedTracking) {
                        const typeName = mesh.geometry.type;
                        breakdown.byGeometryType.set(typeName, (breakdown.byGeometryType.get(typeName) || 0) + geomSize);
                        geometrySizes.push({
                            name: mesh.name || `Geometry_${geometryCount}`,
                            size: geomSize
                        });
                    }
                }
                // Count materials
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach(material => {
                    if (material && !seenMaterials.has(material)) {
                        seenMaterials.add(material);
                        materialCount++;
                        const matSize = this.estimateMaterialSize(material);
                        materialMemory += matSize;
                        if (this.config.detailedTracking) {
                            const typeName = material.type;
                            breakdown.byMaterialType.set(typeName, (breakdown.byMaterialType.get(typeName) || 0) + matSize);
                        }
                    }
                    // Count textures in material
                    if (material) {
                        const textures = this.extractTextures(material);
                        textures.forEach(texture => {
                            if (texture && !seenTextures.has(texture)) {
                                seenTextures.add(texture);
                                textureCount++;
                                const texSize = this.calculateTextureSize(texture);
                                textureMemory += texSize;
                                if (this.config.detailedTracking) {
                                    const sizeKey = `${texture.image?.width || 0}x${texture.image?.height || 0}`;
                                    breakdown.byTextureSize.set(sizeKey, (breakdown.byTextureSize.get(sizeKey) || 0) + texSize);
                                    textureSizes.push({
                                        name: texture.name || `Texture_${textureCount}`,
                                        size: texSize
                                    });
                                }
                            }
                        });
                    }
                });
            }
        });
        // Get heap info from performance API if available
        let totalHeapSize = 0;
        let usedHeapSize = 0;
        if (typeof performance !== 'undefined' && 'memory' in performance) {
            const mem = performance.memory;
            totalHeapSize = mem.totalJSHeapSize || 0;
            usedHeapSize = mem.usedJSHeapSize || 0;
        }
        else {
            // Estimate based on tracked memory
            usedHeapSize = geometryMemory + textureMemory + materialMemory;
            totalHeapSize = usedHeapSize * 1.5; // Rough estimate
        }
        // Sort and get largest items
        if (this.config.detailedTracking) {
            breakdown.largestGeometries = geometrySizes
                .sort((a, b) => b.size - a.size)
                .slice(0, 10);
            breakdown.largestTextures = textureSizes
                .sort((a, b) => b.size - a.size)
                .slice(0, 10);
        }
        // Generate warnings
        const warnings = this.generateWarnings({
            totalHeapSize,
            usedHeapSize,
            geometryMemory,
            textureMemory,
            materialMemory,
            objectCount,
            geometryCount,
            textureCount,
            materialCount,
            breakdown,
            warnings: []
        });
        return {
            totalHeapSize,
            usedHeapSize,
            geometryMemory,
            textureMemory,
            materialMemory,
            objectCount,
            geometryCount,
            textureCount,
            materialCount,
            breakdown,
            warnings
        };
    }
    /**
     * Take a memory snapshot and store in history
     */
    takeSnapshot() {
        const stats = this.getStats();
        const snapshot = {
            timestamp: Date.now(),
            stats
        };
        this.snapshotHistory.push(snapshot);
        // Trim history if exceeds limit
        if (this.snapshotHistory.length > this.config.historySize) {
            this.snapshotHistory.shift();
        }
        return snapshot;
    }
    /**
     * Get snapshot history for trend analysis
     */
    getHistory() {
        return [...this.snapshotHistory];
    }
    /**
     * Clear snapshot history
     */
    clearHistory() {
        this.snapshotHistory = [];
    }
    /**
     * Force garbage collection (if available)
     */
    forceGC() {
        // Note: GC can only be forced in Chrome with --expose-gc flag
        if (typeof global !== 'undefined' && typeof global.gc === 'function') {
            global.gc();
            this.lastGCTime = Date.now();
        }
    }
    /**
     * Calculate memory size of a geometry
     */
    calculateGeometrySize(geometry) {
        let size = 0;
        // Sum up all attribute arrays
        for (const key in geometry.attributes) {
            const attribute = geometry.attributes[key];
            if (attribute && attribute.array) {
                size += attribute.array.byteLength;
            }
        }
        // Add index buffer
        if (geometry.index && geometry.index.array) {
            size += geometry.index.array.byteLength;
        }
        return size;
    }
    /**
     * Calculate memory size of a texture
     */
    calculateTextureSize(texture) {
        const image = texture.image;
        if (!image)
            return 0;
        const width = image.width || 0;
        const height = image.height || 0;
        if (width === 0 || height === 0)
            return 0;
        // Estimate based on format (RGBA = 4 bytes per pixel)
        const bytesPerPixel = 4;
        const mipmaps = Math.floor(Math.log2(Math.max(width, height))) + 1;
        // Account for mipmaps (1 + 1/4 + 1/16 + ... ≈ 1.33x)
        const baseSize = width * height * bytesPerPixel;
        const totalSize = baseSize * 1.33;
        return totalSize;
    }
    /**
     * Estimate memory size of a material
     */
    estimateMaterialSize(material) {
        // Base material overhead
        let size = 1024; // ~1KB base
        // Add size for uniform values
        const uniforms = material.uniforms;
        if (uniforms) {
            for (const key in uniforms) {
                const value = uniforms[key].value;
                if (value) {
                    if (value instanceof Float32Array || value instanceof Array) {
                        size += value.length * 4;
                    }
                    else if (typeof value === 'number') {
                        size += 8;
                    }
                    else if (typeof value === 'boolean') {
                        size += 1;
                    }
                }
            }
        }
        return size;
    }
    /**
     * Extract all textures from a material
     */
    extractTextures(material) {
        const textures = [];
        // Check common texture properties
        const textureProps = [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap',
            'emissiveMap', 'specularMap', 'aoMap', 'displacementMap',
            'bumpMap', 'alphaMap', 'envMap', 'lightMap'
        ];
        textureProps.forEach(prop => {
            const texture = material[prop];
            if (texture && texture instanceof THREE.Texture) {
                textures.push(texture);
            }
        });
        return textures;
    }
    /**
     * Generate memory usage warnings
     */
    generateWarnings(stats) {
        const warnings = [];
        // Heap usage warning
        if (stats.totalHeapSize > 0) {
            const heapUsage = stats.usedHeapSize / stats.totalHeapSize;
            if (heapUsage > this.config.heapWarningThreshold) {
                warnings.push(`High heap usage: ${(heapUsage * 100).toFixed(1)}% (${this.formatBytes(stats.usedHeapSize)} / ${this.formatBytes(stats.totalHeapSize)})`);
            }
        }
        // Texture memory warning
        const textureMB = stats.textureMemory / (1024 * 1024);
        if (textureMB > this.config.textureWarningThreshold) {
            warnings.push(`High texture memory: ${textureMB.toFixed(1)} MB (threshold: ${this.config.textureWarningThreshold} MB)`);
        }
        // Geometry memory warning
        const geometryMB = stats.geometryMemory / (1024 * 1024);
        if (geometryMB > this.config.geometryWarningThreshold) {
            warnings.push(`High geometry memory: ${geometryMB.toFixed(1)} MB (threshold: ${this.config.geometryWarningThreshold} MB)`);
        }
        // Object count warning
        if (stats.objectCount > 10000) {
            warnings.push(`Large number of objects: ${stats.objectCount}`);
        }
        // Many unique geometries
        if (stats.geometryCount > 500) {
            warnings.push(`Many unique geometries: ${stats.geometryCount}. Consider instancing.`);
        }
        // Many unique materials
        if (stats.materialCount > 100) {
            warnings.push(`Many unique materials: ${stats.materialCount}. Consider batching.`);
        }
        return warnings;
    }
    /**
     * Format bytes to human-readable string
     */
    formatBytes(bytes) {
        if (bytes === 0)
            return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    /**
     * Get memory trend over time
     */
    getTrend() {
        if (this.snapshotHistory.length < 2) {
            return { increasing: false, rate: 0 };
        }
        const recent = this.snapshotHistory.slice(-10);
        const first = recent[0].stats.usedHeapSize;
        const last = recent[recent.length - 1].stats.usedHeapSize;
        const diff = last - first;
        const timeDiff = recent[recent.length - 1].timestamp - recent[0].timestamp;
        const rate = timeDiff > 0 ? diff / timeDiff : 0;
        return {
            increasing: diff > 0,
            rate
        };
    }
    /**
     * Dispose unused resources
     */
    disposeUnused() {
        let disposedGeometries = 0;
        let disposedMaterials = 0;
        let disposedTextures = 0;
        // This would require tracking which resources are no longer referenced
        // Implementation depends on specific use case
        return {
            disposedGeometries,
            disposedMaterials,
            disposedTextures
        };
    }
}
export default MemoryProfiler;
//# sourceMappingURL=MemoryProfiler.js.map