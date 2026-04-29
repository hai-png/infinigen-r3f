import * as THREE from 'three';
/**
 * Enhanced mushroom species for diverse fungal varieties
 */
export declare enum MushroomSpecies {
    CHANTERELLE = "chanterelle",
    PORCINI = "porcini",
    MOREL = "morel",
    HEN_OF_WOODS = "hen_of_woods",
    AMANITA = "amanita",
    DEATH_CAP = "death_cap",
    FLY_AGARIC = "fly_agaric",
    BUTTON = "button",
    OYSTER = "oyster",
    SHITAKE = "shiitake",
    PUFFBALL = "puffball",
    BIOLUMINESCENT = "bioluminescent",
    GHOST_FUNGUS = "ghost_fungus",
    CRYSTAL_MUSHROOM = "crystal_mushroom"
}
/**
 * Growth stage for decay progression
 */
export declare enum GrowthStage {
    YOUNG = "young",// Just emerged, small
    MATURE = "mature",// Full size, spore-ready
    AGING = "aging",// Starting to decay
    DECAYING = "decaying"
}
export interface MushroomVarietyConfig {
    species: MushroomSpecies;
    growthStage: GrowthStage;
    density: number;
    area: THREE.Vector2;
    clusterGrowth?: boolean;
    bioluminescence?: number;
    sporeCloud?: boolean;
}
/**
 * Enhanced mushroom generator with multiple species and realistic features
 */
export declare class MushroomVarieties {
    private static readonly SPECIES_DATA;
    /**
     * Generate single mushroom with detailed geometry
     */
    static generateMushroom(config: MushroomVarietyConfig): THREE.Group;
    /**
     * Create mushroom stem
     */
    private static createStem;
    /**
     * Create mushroom cap based on species
     */
    private static createCap;
    /**
     * Create irregular cap shape for species like hen-of-woods
     */
    private static createIrregularCap;
    /**
     * Create white spots on caps (e.g., fly agaric)
     */
    private static createCapSpots;
    /**
     * Add bioluminescent glow effect
     */
    private static addBioluminescence;
    /**
     * Create spore cloud particle effect
     */
    private static createSporeCloud;
    /**
     * Apply decay colors to aging mushrooms
     */
    private static applyDecayColors;
    /**
     * Get size multiplier based on growth stage
     */
    private static getGrowthStageMultiplier;
    /**
     * Generate mushroom cluster
     */
    static generateCluster(config: MushroomVarietyConfig, count: number): THREE.Group;
    /**
     * Generate scattered mushrooms across area
     */
    static generateScattered(config: MushroomVarietyConfig): THREE.Group;
    /**
     * Calculate height based on terrain
     */
    private static calculateHeight;
    /**
     * Get random growth stage with weighted distribution
     */
    private static getRandomGrowthStage;
}
//# sourceMappingURL=MushroomVarieties.d.ts.map