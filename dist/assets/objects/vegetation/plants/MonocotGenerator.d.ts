/**
 * MonocotGenerator - Generates monocotyledon plants (grasses, lilies, palms, etc.)
 *
 * Monocots are characterized by:
 * - Parallel leaf venation
 * - Flower parts in multiples of three
 * - Single seed leaf (cotyledon)
 * - Fibrous root systems
 *
 * This generator covers:
 * - Tall grasses and reeds
 * - Lilies and irises
 * - Agaves and yuccas
 * - Bamboo (grass family)
 * - Cattails and rushes
 */
import * as THREE from 'three';
export interface MonocotConfig {
    species: 'tall_grass' | 'reed' | 'lily' | 'iris' | 'agave' | 'yucca' | 'bamboo' | 'cattail' | 'rush';
    height: number;
    stemRadius: number;
    leafLength: number;
    leafWidth: number;
    clusterSize: number;
    spreadRadius: number;
    leafCount: number;
    leafCurvature: number;
    leafDroop: number;
    leafTwist: number;
    primaryColor: THREE.Color;
    secondaryColor: THREE.Color;
    colorVariation: number;
    windSensitivity: number;
    seasonalTint: number;
    segments: number;
    useInstancing: boolean;
}
export declare const MonocotSpeciesPresets: Record<string, Partial<MonocotConfig>>;
export declare class MonocotGenerator {
    private noise;
    private config;
    constructor(config?: Partial<MonocotConfig>);
    /**
     * Generate a complete monocot cluster
     */
    generateCluster(position?: THREE.Vector3): THREE.Group;
    /**
     * Generate a single monocot stem with leaves
     */
    generateStem(offset?: THREE.Vector3): THREE.Group;
    /**
     * Create stem geometry based on species
     */
    private createStemGeometry;
    /**
     * Create stem material with color variation
     */
    private createStemMaterial;
    /**
     * Create a single leaf
     */
    private createLeaf;
    /**
     * Create leaf geometry (long, narrow blade shape)
     */
    private createLeafGeometry;
    /**
     * Create leaf material
     */
    private createLeafMaterial;
    /**
     * Apply deformation to leaf mesh for natural curvature
     */
    private applyLeafDeformation;
    /**
     * Generate instanced monocot field for performance
     */
    generateField(count: number, areaSize: number, terrainHeightmap?: (x: number, z: number) => number): THREE.InstancedMesh;
    /**
     * Update configuration
     */
    setConfig(config: Partial<MonocotConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): MonocotConfig;
}
export default MonocotGenerator;
//# sourceMappingURL=MonocotGenerator.d.ts.map