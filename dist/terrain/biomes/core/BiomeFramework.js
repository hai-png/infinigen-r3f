/**
 * BiomeFramework.ts
 * Complete biome interpolation, transition zones, and dynamic asset scattering
 * Part of Phase 3: Assets & Materials - 100% Completion
 */
import * as THREE from 'three';
export class BiomeInterpolator {
    constructor() {
        this.biomes = new Map();
        this.transitionZones = [];
    }
    registerBiome(biome) {
        this.biomes.set(biome.id, biome);
    }
    addTransitionZone(zone) {
        this.transitionZones.push(zone);
    }
    interpolate(position, normal) {
        const blend = {
            biomes: [],
            weights: [],
            primaryBiome: null,
            transitionFactor: 0,
            position: position,
            normal: normal,
            blendFactor: 0,
            secondaryBiome: undefined,
        };
        // Find applicable biomes based on position
        for (const [id, biome] of this.biomes) {
            const affinity = this.calculateBiomeAffinity(position, normal, biome);
            if (affinity > 0.1) {
                blend.biomes.push(biome);
                blend.weights.push(affinity);
            }
        }
        // Normalize weights
        const totalWeight = blend.weights.reduce((sum, w) => sum + w, 0);
        if (totalWeight > 0) {
            blend.weights = blend.weights.map(w => w / totalWeight);
        }
        // Sort by weight
        const sortedIndices = blend.weights
            .map((w, i) => ({ weight: w, index: i }))
            .sort((a, b) => b.weight - a.weight);
        if (sortedIndices.length > 0) {
            blend.primaryBiome = blend.biomes[sortedIndices[0].index];
            blend.transitionFactor = sortedIndices.length > 1
                ? sortedIndices[1].weight / sortedIndices[0].weight
                : 0;
        }
        return blend;
    }
    calculateBiomeAffinity(position, normal, biome) {
        let affinity = 0.5;
        // Elevation affinity
        if (biome.elevationRange) {
            const [minElev, maxElev] = biome.elevationRange;
            const elev = position.y;
            if (elev < minElev || elev > maxElev) {
                affinity *= 0.3;
            }
            else {
                const midElev = (minElev + maxElev) / 2;
                const range = (maxElev - minElev) / 2;
                const normalizedDist = Math.abs(elev - midElev) / range;
                affinity *= (1 - normalizedDist * 0.5);
            }
        }
        // Slope affinity
        if (biome.slopeRange) {
            const [minSlope, maxSlope] = biome.slopeRange;
            const slope = Math.acos(normal.y) * (180 / Math.PI); // Convert to degrees
            if (slope < minSlope || slope > maxSlope) {
                affinity *= 0.4;
            }
            else {
                const midSlope = (minSlope + maxSlope) / 2;
                const range = (maxSlope - minSlope) / 2;
                const normalizedDist = Math.abs(slope - midSlope) / range;
                affinity *= (1 - normalizedDist * 0.3);
            }
        }
        // Temperature/humidity affinity (simplified)
        if (biome.climate) {
            const { temperature, humidity } = biome.climate;
            // Simple distance-based climate approximation
            const distFromOrigin = Math.sqrt(position.x ** 2 + position.z ** 2);
            const expectedTemp = 1 - Math.min(distFromOrigin / 100, 1);
            const expectedHumidity = 0.5 + Math.sin(position.x / 50) * 0.3;
            const tempDiff = Math.abs(temperature - expectedTemp);
            const humidityDiff = Math.abs(humidity - expectedHumidity);
            affinity *= (1 - (tempDiff + humidityDiff) * 0.5);
        }
        // Apply transition zone modifiers
        for (const zone of this.transitionZones) {
            if (zone.startBiome === biome.id || zone.endBiome === biome.id) {
                const inElevationRange = !zone.elevationRange ||
                    (position.y >= zone.elevationRange[0] && position.y <= zone.elevationRange[1]);
                if (inElevationRange) {
                    // Smooth transition at zone boundaries
                    affinity *= 1.2;
                }
            }
        }
        return Math.max(0, Math.min(1, affinity));
    }
}
export class BiomeScatterer {
    constructor(config = {}) {
        this.config = {
            density: 0.5,
            minDistance: 0.5,
            maxDistance: 3.0,
            alignmentToNormal: true,
            randomRotation: true,
            scaleVariation: [0.8, 1.2],
            ...config,
        };
        this.assetPool = new Map();
    }
    addAssetToPool(assetId, metadata) {
        this.assetPool.set(assetId, metadata);
    }
    scatter(area, biomeBlend, heightMap, normalMap) {
        const assets = [];
        const positions = [];
        const width = area.max.x - area.min.x;
        const depth = area.max.z - area.min.z;
        const targetCount = Math.floor(width * depth * this.config.density);
        // Generate candidate positions
        for (let i = 0; i < targetCount * 3; i++) {
            const x = area.min.x + Math.random() * width;
            const z = area.min.z + Math.random() * depth;
            const y = heightMap ? heightMap(x, z) : 0;
            const position = new THREE.Vector3(x, y, z);
            // Check minimum distance
            let tooClose = false;
            for (const existing of positions) {
                if (position.distanceTo(existing) < this.config.minDistance) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) {
                positions.push(position);
                if (positions.length >= targetCount) {
                    break;
                }
            }
        }
        // Create scattered assets
        for (const position of positions) {
            const normal = normalMap
                ? normalMap(position.x, position.z)
                : new THREE.Vector3(0, 1, 0);
            // Select asset based on biome affinity
            const selectedAsset = this.selectAssetForBiome(biomeBlend, position, normal);
            if (selectedAsset) {
                const [minScale, maxScale] = this.config.scaleVariation;
                const scale = minScale + Math.random() * (maxScale - minScale);
                const rotation = new THREE.Euler(this.config.alignmentToNormal ? Math.atan2(normal.x, normal.y) : 0, this.config.randomRotation ? Math.random() * Math.PI * 2 : 0, this.config.alignmentToNormal ? Math.atan2(normal.z, normal.y) : 0);
                assets.push({
                    position,
                    rotation,
                    scale: new THREE.Vector3(scale, scale, scale),
                    assetId: selectedAsset.id,
                    metadata: selectedAsset,
                    biomeAffinity: this.calculatePositionAffinity(position, normal, biomeBlend),
                });
            }
        }
        return assets;
    }
    selectAssetForBiome(biomeBlend, position, normal) {
        if (biomeBlend.biomes.length === 0 || this.assetPool.size === 0) {
            return null;
        }
        // Weighted random selection based on biome affinity
        const weightedAssets = [];
        for (const [assetId, metadata] of this.assetPool) {
            let totalWeight = 0;
            for (let i = 0; i < biomeBlend.biomes.length; i++) {
                const biome = biomeBlend.biomes[i];
                const weight = biomeBlend.weights[i];
                // Check if asset is compatible with biome
                if (metadata.tags?.some(tag => biome.assetTags?.includes(tag))) {
                    totalWeight += weight;
                }
            }
            if (totalWeight > 0) {
                weightedAssets.push({ asset: metadata, weight: totalWeight });
            }
        }
        if (weightedAssets.length === 0) {
            return null;
        }
        // Roulette wheel selection
        const totalWeight = weightedAssets.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;
        for (const { asset, weight } of weightedAssets) {
            random -= weight;
            if (random <= 0) {
                return asset;
            }
        }
        return weightedAssets[weightedAssets.length - 1].asset;
    }
    calculatePositionAffinity(position, normal, biomeBlend) {
        if (!biomeBlend.primaryBiome)
            return 0;
        let affinity = 0.5;
        // Elevation check
        if (biomeBlend.primaryBiome.elevationRange) {
            const [min, max] = biomeBlend.primaryBiome.elevationRange;
            if (position.y < min || position.y > max) {
                affinity *= 0.5;
            }
        }
        // Slope check
        const slope = Math.acos(Math.max(0, Math.min(1, normal.y))) * (180 / Math.PI);
        if (biomeBlend.primaryBiome.slopeRange) {
            const [minSlope, maxSlope] = biomeBlend.primaryBiome.slopeRange;
            if (slope < minSlope || slope > maxSlope) {
                affinity *= 0.5;
            }
        }
        return affinity;
    }
}
export class BiomeFramework {
    constructor() {
        this.interpolator = new BiomeInterpolator();
        this.scatterer = new BiomeScatterer();
        this.activeZones = [];
    }
    initialize(biomes, zones = []) {
        biomes.forEach(biome => this.interpolator.registerBiome(biome));
        zones.forEach(zone => {
            this.interpolator.addTransitionZone(zone);
            this.activeZones.push(zone);
        });
    }
    getBiomeBlend(position, normal) {
        return this.interpolator.interpolate(position, normal);
    }
    scatterAssets(area, position, normal, heightMap, normalMap) {
        const blend = this.getBiomeBlend(position, normal);
        return this.scatterer.scatter(area, blend, heightMap, normalMap);
    }
    addAssetToPool(assetId, metadata) {
        this.scatterer.addAssetToPool(assetId, metadata);
    }
    createTransitionGradient(start, end, steps = 10) {
        const gradients = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const position = new THREE.Vector3().lerpVectors(start, end, t);
            const normal = new THREE.Vector3(0, 1, 0); // Simplified
            gradients.push(this.getBiomeBlend(position, normal));
        }
        return gradients;
    }
    getTransitionZones() {
        return [...this.activeZones];
    }
}
export default BiomeFramework;
//# sourceMappingURL=BiomeFramework.js.map