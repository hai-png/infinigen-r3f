import * as THREE from 'three';
/**
 * Tree species configuration with biological parameters
 */
export interface TreeSpeciesConfig {
    name: string;
    trunkHeight: {
        min: number;
        max: number;
    };
    trunkRadius: {
        min: number;
        max: number;
    };
    crownRadius: {
        min: number;
        max: number;
    };
    crownHeight: {
        min: number;
        max: number;
    };
    branchCount: {
        min: number;
        max: number;
    };
    branchAngle: {
        min: number;
        max: number;
    };
    leafDensity: number;
    barkColor: THREE.Color;
    leafColor: THREE.Color;
    seasonalColors?: {
        spring?: THREE.Color;
        summer?: THREE.Color;
        autumn?: THREE.Color;
        winter?: THREE.Color;
    };
    shapeType: 'cone' | 'sphere' | 'cylinder' | 'irregular' | 'palm';
    hasSnowCap?: boolean;
}
/**
 * Predefined tree species configurations
 */
export declare const TreeSpeciesPresets: Record<string, TreeSpeciesConfig>;
/**
 * Generated tree instance data
 */
export interface TreeInstance {
    position: THREE.Vector3;
    rotation: number;
    scale: THREE.Vector3;
    species: string;
    season: 'spring' | 'summer' | 'autumn' | 'winter';
    health: number;
    age: number;
}
/**
 * Procedural tree generator with multiple species support
 */
export declare class TreeGenerator {
    private noiseUtils;
    private materialCache;
    private geometryCache;
    constructor();
    /**
     * Generate a complete tree mesh
     */
    generateTree(species: string | TreeSpeciesConfig, seed: number, options?: {
        season?: 'spring' | 'summer' | 'autumn' | 'winter';
        lod?: number;
        includeColliders?: boolean;
    }): THREE.Group;
    /**
     * Generate tree trunk with procedural texture
     */
    private generateTrunk;
    /**
     * Generate branch system
     */
    private generateBranches;
    /**
     * Generate foliage/crown
     */
    private generateFoliage;
    /**
     * Create irregular crown shape using noise
     */
    private createIrregularCrown;
    /**
     * Create palm fronds
     */
    private createPalmFronds;
    /**
     * Generate snow cap on branches
     */
    private generateSnowCap;
    /**
     * Get cached bark material
     */
    private getBarkMaterial;
    /**
     * Get cached leaf material
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
     * Generate forest with multiple trees
     */
    generateForest(count: number, areaSize: number, speciesList: string[], seed: number, options?: {
        season?: 'spring' | 'summer' | 'autumn' | 'winter';
        densityMap?: Float32Array;
        biome?: string;
    }): THREE.Group;
    /**
     * Utility: random float in range
     */
    private randomInRange;
}
//# sourceMappingURL=TreeGenerator.d.ts.map