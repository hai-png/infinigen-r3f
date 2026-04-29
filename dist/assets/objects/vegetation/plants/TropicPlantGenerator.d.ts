/**
 * TropicPlantGenerator - Generates tropical plants with large leaves
 *
 * This generator creates lush tropical vegetation including:
 * - Monstera deliciosa (Swiss cheese plant)
 * - Bird of Paradise (Strelitzia)
 * - Banana plants
 * - Philodendron
 * - Calathea
 * - Anthurium
 *
 * Features:
 * - Large, broad leaves with distinctive shapes
 * - Split and fenestrated leaf patterns
 * - Thick stems and aerial roots
 * - Dense clustering for jungle appearance
 */
import * as THREE from 'three';
export interface TropicPlantConfig {
    species: 'monstera' | 'bird_of_paradise' | 'banana' | 'philodendron' | 'calathea' | 'anthurium' | 'palm_small';
    height: number;
    stemRadius: number;
    leafSize: number;
    leafCount: number;
    leafSplitDepth: number;
    leafFenestration: number;
    leafWaviness: number;
    leafDroop: number;
    primaryColor: THREE.Color;
    secondaryColor: THREE.Color;
    variegation: number;
    glossiness: number;
    spiralAngle: number;
    internodeLength: number;
    humidity: number;
    lightExposure: number;
}
export declare const TropicSpeciesPresets: Record<string, Partial<TropicPlantConfig>>;
export declare class TropicPlantGenerator {
    private noise;
    private config;
    constructor(config?: Partial<TropicPlantConfig>);
    /**
     * Generate a complete tropical plant
     */
    generate(position?: THREE.Vector3): THREE.Group;
    /**
     * Generate main stem
     */
    private generateStem;
    /**
     * Generate a single tropical leaf
     */
    private generateLeaf;
    /**
     * Create petiole (leaf stalk)
     */
    private createPetiole;
    /**
     * Create leaf blade based on species
     */
    private createLeafBlade;
    /**
     * Create Monstera leaf with characteristic splits and holes
     */
    private createMonsteraLeaf;
    /**
     * Create Bird of Paradise leaf (large, paddle-shaped with splits)
     */
    private createBirdOfParadiseLeaf;
    /**
     * Create Banana leaf (large, oblong with wavy edges)
     */
    private createBananaLeaf;
    /**
     * Create heart-shaped leaf (Philodendron)
     */
    private createHeartShapedLeaf;
    /**
     * Create oval leaf (Calathea)
     */
    private createOvalLeaf;
    /**
     * Create arrow-shaped leaf (Anthurium)
     */
    private createArrowLeaf;
    /**
     * Create palmate leaf (fan palm)
     */
    private createPalmateLeaf;
    /**
     * Create generic leaf as fallback
     */
    private createGenericLeaf;
    /**
     * Apply splits along leaf edges
     */
    private applyLeafSplits;
    /**
     * Add fenestrations (holes) to leaf
     */
    private addFenestrations;
    /**
     * Apply wavy edge pattern
     */
    private applyEdgeWave;
    /**
     * Create leaf material with appropriate properties
     */
    private createLeafMaterial;
    /**
     * Generate aerial roots for climbing species
     */
    private generateAerialRoots;
    /**
     * Get config with default segments value
     */
    private getConfigWithDefaults;
    /**
     * Update configuration
     */
    setConfig(config: Partial<TropicPlantConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): TropicPlantConfig;
}
export default TropicPlantGenerator;
//# sourceMappingURL=TropicPlantGenerator.d.ts.map