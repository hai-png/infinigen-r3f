/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Terrain Utilities and Helper Functions
 */
import { Vector3, Raycaster, Plane, Box3 } from 'three';
export class TerrainUtils {
    /**
     * Sample height at specific coordinates with bilinear interpolation
     */
    static sampleHeight(heightMap, width, x, y) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        if (xi < 0 || xi >= width - 1 || yi < 0 || yi >= heightMap.length / width - 1) {
            return 0;
        }
        const xf = x - xi;
        const yf = y - yi;
        const idx00 = yi * width + xi;
        const idx10 = yi * width + (xi + 1);
        const idx01 = (yi + 1) * width + xi;
        const idx11 = (yi + 1) * width + (xi + 1);
        // Bilinear interpolation
        const h00 = heightMap[idx00];
        const h10 = heightMap[idx10];
        const h01 = heightMap[idx01];
        const h11 = heightMap[idx11];
        const h0 = h00 * (1 - xf) + h10 * xf;
        const h1 = h01 * (1 - xf) + h11 * xf;
        return h0 * (1 - yf) + h1 * yf;
    }
    /**
     * Calculate slope at specific coordinates
     */
    static calculateSlope(heightMap, width, x, y) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        if (xi <= 0 || xi >= width - 1 || yi <= 0 || yi >= heightMap.length / width - 1) {
            return 0;
        }
        const left = heightMap[yi * width + (xi - 1)];
        const right = heightMap[yi * width + (xi + 1)];
        const top = heightMap[(yi - 1) * width + xi];
        const bottom = heightMap[(yi + 1) * width + xi];
        const dx = (right - left) / 2;
        const dy = (bottom - top) / 2;
        return Math.sqrt(dx * dx + dy * dy);
    }
    /**
     * Get normal vector at specific coordinates
     */
    static getNormalAt(heightMap, normalMap, width, x, y) {
        const idx = Math.floor(y) * width + Math.floor(x);
        if (idx < 0 || idx * 3 + 2 >= normalMap.length) {
            return new Vector3(0, 1, 0);
        }
        return new Vector3(normalMap[idx * 3], normalMap[idx * 3 + 1], normalMap[idx * 3 + 2]);
    }
    /**
     * Check if position is underwater
     */
    static isUnderwater(height, waterLevel) {
        return height < waterLevel;
    }
    /**
     * Get water depth at position
     */
    static getWaterDepth(height, waterLevel) {
        return Math.max(0, waterLevel - height);
    }
    /**
     * Create water plane geometry config
     */
    static createWaterConfig(config = {}) {
        return {
            level: 0.3,
            color: 0x4488ff,
            opacity: 0.7,
            animated: true,
            waveSpeed: 1.0,
            waveHeight: 0.05,
            ...config,
        };
    }
    /**
     * Generate shoreline mask
     */
    static generateShorelineMask(heightMap, width, height, waterLevel, shoreWidth = 5) {
        const mask = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const h = heightMap[idx];
                // Check if near water level
                if (Math.abs(h - waterLevel) < 0.05) {
                    mask[idx] = 255;
                }
                else {
                    // Check neighbors for water proximity
                    let hasWaterNeighbor = false;
                    for (let dy = -1; dy <= 1 && !hasWaterNeighbor; dy++) {
                        for (let dx = -1; dx <= 1 && !hasWaterNeighbor; dx++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nIdx = ny * width + nx;
                                if (heightMap[nIdx] < waterLevel) {
                                    hasWaterNeighbor = true;
                                }
                            }
                        }
                    }
                    mask[idx] = hasWaterNeighbor ? 128 : 0;
                }
            }
        }
        return mask;
    }
    /**
     * Calculate terrain bounding box
     */
    static calculateBounds(heightMap, width, height, verticalScale = 100) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const h = heightMap[y * width + x] * verticalScale;
                minX = Math.min(minX, x);
                minY = Math.min(minY, h);
                minZ = Math.min(minZ, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, h);
                maxZ = Math.max(maxZ, y);
            }
        }
        return new Box3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ));
    }
    /**
     * Raycast against terrain heightmap
     */
    static raycastTerrain(origin, direction, heightMap, width, height, verticalScale = 100) {
        const raycaster = new Raycaster(origin, direction);
        const plane = new Plane(new Vector3(0, 1, 0), 0);
        // Find intersection with ground plane
        const planeIntersect = new Vector3();
        raycaster.ray.intersectPlane(plane, planeIntersect);
        if (!planeIntersect)
            return null;
        // Check bounds
        if (planeIntersect.x < 0 || planeIntersect.x >= width ||
            planeIntersect.z < 0 || planeIntersect.z >= height) {
            return null;
        }
        // Get height at intersection
        const terrainHeight = this.sampleHeight(heightMap, width, planeIntersect.x, planeIntersect.z) * verticalScale;
        // Check if ray hits terrain
        if (origin.y > terrainHeight && direction.y < 0) {
            return new Vector3(planeIntersect.x, terrainHeight, planeIntersect.z);
        }
        return null;
    }
    /**
     * Generate minimap data from heightmap
     */
    static generateMinimap(heightMap, width, height, size = 256) {
        const data = new Uint8ClampedArray(size * size * 4);
        const scaleX = width / size;
        const scaleY = height / size;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const srcX = Math.floor(x * scaleX);
                const srcY = Math.floor(y * scaleY);
                const h = heightMap[srcY * width + srcX];
                const idx = (y * size + x) * 4;
                // Color based on height
                if (h < 0.3) {
                    // Water
                    data[idx] = 20;
                    data[idx + 1] = 50;
                    data[idx + 2] = 150;
                }
                else if (h < 0.35) {
                    // Beach
                    data[idx] = 210;
                    data[idx + 1] = 190;
                    data[idx + 2] = 140;
                }
                else if (h < 0.6) {
                    // Grass/Forest
                    const green = 100 + Math.floor(h * 100);
                    data[idx] = 40;
                    data[idx + 1] = green;
                    data[idx + 2] = 30;
                }
                else if (h < 0.85) {
                    // Mountain
                    const gray = 100 + Math.floor((h - 0.6) * 200);
                    data[idx] = gray;
                    data[idx + 1] = gray;
                    data[idx + 2] = gray;
                }
                else {
                    // Snow
                    data[idx] = 255;
                    data[idx + 1] = 255;
                    data[idx + 2] = 255;
                }
                data[idx + 3] = 255; // Alpha
            }
        }
        return data;
    }
    /**
     * Smooth heightmap with gaussian blur
     */
    static smoothHeightmap(heightMap, width, height, iterations = 1) {
        const result = new Float32Array(heightMap);
        for (let iter = 0; iter < iterations; iter++) {
            const temp = new Float32Array(result);
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = y * width + x;
                    // 3x3 gaussian kernel
                    const sum = temp[idx - width - 1] * 0.0625 +
                        temp[idx - width] * 0.125 +
                        temp[idx - width + 1] * 0.0625 +
                        temp[idx - 1] * 0.125 +
                        temp[idx] * 0.25 +
                        temp[idx + 1] * 0.125 +
                        temp[idx + width - 1] * 0.0625 +
                        temp[idx + width] * 0.125 +
                        temp[idx + width + 1] * 0.0625;
                    result[idx] = sum;
                }
            }
        }
        return result;
    }
}
//# sourceMappingURL=TerrainUtils.js.map