import * as THREE from 'three';
/**
 * Configuration for small plant generation
 */
export interface SmallPlantConfig {
    /** Plant species type */
    species: 'succulent' | 'cactus' | 'fern' | 'aloe' | 'jade' | 'spider_plant';
    /** Plant height in meters */
    height: number;
    /** Pot size (0 = no pot) */
    potSize: number;
    /** Number of leaves/fronds */
    leafCount: number;
    /** Leaf color variation */
    leafColor: THREE.Color;
    /** Add randomness to leaf positions */
    randomness: number;
    /** Include flowers */
    hasFlowers: boolean;
    /** Flower color */
    flowerColor?: THREE.Color;
}
/**
 * Generator for small indoor and decorative plants
 * Creates succulents, cacti, aloe, jade plants, spider plants, and small ferns
 */
export declare class SmallPlantGenerator {
    private readonly defaultConfig;
    /**
     * Generate a small plant mesh group
     */
    generate(config?: Partial<SmallPlantConfig>): THREE.Group;
    /**
     * Create multiple small plants for clustering
     */
    generateCluster(config: Partial<SmallPlantConfig> & {
        count: number;
        spread: number;
    }): THREE.Group;
    private createPot;
    private createSucculent;
    private addSucculentFlowers;
    private createCactus;
    private addCactusArms;
    private createSmallFern;
    private createAloe;
    private addAloeTeeth;
    private createJade;
    private createSpiderPlant;
    private addSpiderPlantlets;
}
//# sourceMappingURL=SmallPlantGenerator.d.ts.map