/**
 * BiomeSystem.ts
 * Core biome type definitions and system wrapper
 * Provides legacy compatibility layer for BiomeFramework
 */
import { BiomeFramework as CoreBiomeFramework } from './BiomeFramework';
// ============================================================================
// BiomeSystem Wrapper Class (Legacy Compatibility)
// ============================================================================
export class BiomeSystem {
    constructor(transitionWidth = 0.3) {
        this.framework = new CoreBiomeFramework();
        this.config = {
            transitionWidth,
            blendMode: 'smooth',
            enableElevationConstraints: true,
            enableSlopeConstraints: true,
            assetDensityMultiplier: 1.0,
        };
    }
    /**
     * Initialize the biome system with definitions and transition zones
     */
    initialize(biomes, zones) {
        const translatedZones = zones?.map(z => ({
            startBiome: z.startBiome,
            endBiome: z.endBiome,
            blendWidth: z.blendWidth,
            elevationRange: z.elevationRange,
            slopeRange: z.slopeRange,
        })) || [];
        this.framework.initialize(biomes, translatedZones);
    }
    /**
     * Get biome blend at a specific position
     */
    getBiomeBlend(position, normal) {
        return this.framework.getBiomeBlend(position, normal);
    }
    /**
     * Scatter assets based on biome constraints
     */
    scatterAssets(area, position, normal, heightMap, normalMap) {
        return this.framework.scatterAssets(area, position, normal, heightMap, normalMap);
    }
    /**
     * Add an asset to the scattering pool
     */
    addAssetToPool(assetId, metadata) {
        this.framework.addAssetToPool(assetId, metadata);
    }
    /**
     * Create a gradient of biome blends between two points
     */
    createTransitionGradient(start, end, steps = 10) {
        return this.framework.createTransitionGradient(start, end, steps);
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update configuration
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
}
export default BiomeSystem;
//# sourceMappingURL=BiomeSystem.js.map