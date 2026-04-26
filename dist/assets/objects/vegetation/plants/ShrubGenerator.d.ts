import * as THREE from 'three';
/**
 * ShrubGenerator - Procedural shrub and bush generation with species presets
 *
 * Features:
 * - Multiple predefined species (boxwood, hydrangea, lavender, rose_bush, etc.)
 * - Seasonal color variations
 * - Berry and flower support
 * - Multiple branch patterns (spherical, elliptical, irregular, flat)
 * - Evergreen/deciduous support
 *
 * @module vegetation/plants
 */
/**
 * Shrub species configuration
 */
export interface ShrubSpeciesConfig {
    name: string;
    height: {
        min: number;
        max: number;
    };
    width: {
        min: number;
        max: number;
    };
    density: number;
    branchPattern: 'spherical' | 'elliptical' | 'irregular' | 'flat';
    leafColor: THREE.Color;
    stemColor: THREE.Color;
    seasonalColors?: {
        spring?: THREE.Color;
        summer?: THREE.Color;
        autumn?: THREE.Color;
        winter?: THREE.Color;
    };
    hasBerries?: boolean;
    berryColor?: THREE.Color;
    isEvergreen?: boolean;
}
/**
 * Predefined shrub species configurations
 */
export declare const ShrubSpeciesPresets: Record<string, ShrubSpeciesConfig>;
/**
 * Procedural shrub generator for undergrowth
 */
export declare class ShrubGenerator {
    private noiseUtils;
    private materialCache;
    constructor();
    /**
     * Generate a single shrub
     */
    generateShrub(species: string | ShrubSpeciesConfig, seed: number, options?: {
        season?: 'spring' | 'summer' | 'autumn' | 'winter';
        lod?: number;
        includeFlowers?: boolean;
    }): THREE.Group;
    /**
     * Generate stem structure
     */
    private generateStems;
    /**
     * Generate foliage mass
     */
    private generateFoliage;
    /**
     * Create flat foliage (for ferns)
     */
    private createFlatFoliage;
    /**
     * Create irregular foliage using noise
     */
    private createIrregularFoliage;
    /**
     * Generate berries
     */
    private generateBerries;
    /**
     * Get cached stem material
     */
    private getStemMaterial;
    /**
     * Get cached leaf material with transparency support
     */
    private getLeafMaterial;
    /**
     * Get seasonal color
     */
    private getSeasonalColor;
    /**
     * Apply noise displacement to geometry
     */
    private applyNoiseDisplacement;
    /**
     * Generate shrub cluster/undergrowth
     */
    generateUndergrowth(count: number, areaSize: number, speciesList: string[], seed: number, options?: {
        season?: 'spring' | 'summer' | 'autumn' | 'winter';
        biome?: string;
        avoidTrees?: boolean;
        treePositions?: THREE.Vector3[];
    }): THREE.Group;
    /**
     * Utility: random float in range
     */
    private randomInRange;
}
//# sourceMappingURL=ShrubGenerator.d.ts.map