/**
 * BiomeSystem.ts
 * Core biome type definitions and system wrapper
 * Provides legacy compatibility layer for BiomeFramework
 */
import * as THREE from 'three';
export interface BiomeDefinition {
    id: string;
    name: string;
    elevationRange?: [number, number];
    slopeRange?: [number, number];
    temperatureRange?: [number, number];
    moistureRange?: [number, number];
    primaryAssets?: string[];
    secondaryAssets?: string[];
    groundMaterial?: string;
    vegetationDensity?: number;
    colorPrimary?: THREE.Color;
    colorSecondary?: THREE.Color;
}
export interface BiomeBlend {
    primaryBiome?: BiomeDefinition;
    secondaryBiome?: BiomeDefinition;
    blendFactor: number;
    position: THREE.Vector3;
    normal: THREE.Vector3;
}
export type BiomeType = 'tundra' | 'taiga' | 'temperate_forest' | 'tropical_rainforest' | 'desert' | 'grassland' | 'savanna' | 'alpine' | 'wetland' | 'coastal';
export interface BiomeConfig {
    transitionWidth: number;
    blendMode: 'linear' | 'smooth' | 'stepped';
    enableElevationConstraints: boolean;
    enableSlopeConstraints: boolean;
    assetDensityMultiplier: number;
}
export declare class BiomeSystem {
    private framework;
    private config;
    constructor(transitionWidth?: number);
    /**
     * Initialize the biome system with definitions and transition zones
     */
    initialize(biomes: BiomeDefinition[], zones?: Array<{
        startBiome: string;
        endBiome: string;
        blendWidth: number;
        elevationRange?: [number, number];
        slopeRange?: [number, number];
    }>): void;
    /**
     * Get biome blend at a specific position
     */
    getBiomeBlend(position: THREE.Vector3, normal: THREE.Vector3): BiomeBlend;
    /**
     * Scatter assets based on biome constraints
     */
    scatterAssets(area: {
        min: THREE.Vector3;
        max: THREE.Vector3;
    }, position: THREE.Vector3, normal: THREE.Vector3, heightMap?: (x: number, z: number) => number, normalMap?: (x: number, z: number) => THREE.Vector3): any[];
    /**
     * Add an asset to the scattering pool
     */
    addAssetToPool(assetId: string, metadata: any): void;
    /**
     * Create a gradient of biome blends between two points
     */
    createTransitionGradient(start: THREE.Vector3, end: THREE.Vector3, steps?: number): BiomeBlend[];
    /**
     * Get current configuration
     */
    getConfig(): BiomeConfig;
    /**
     * Update configuration
     */
    updateConfig(updates: Partial<BiomeConfig>): void;
}
export default BiomeSystem;
//# sourceMappingURL=BiomeSystem.d.ts.map