import * as THREE from 'three';
/**
 * Configuration for grassland ecosystem generation
 */
export interface GrasslandConfig {
    /** Area size in meters */
    areaSize: number;
    /** Grass density (0-1) */
    density: number;
    /** Mix of grass species */
    speciesMix: {
        tallGrass: number;
        shortGrass: number;
        ornamentalGrass: number;
        wildflowers: number;
    };
    /** Height variation */
    heightVariation: number;
    /** Color variation */
    colorVariation: {
        green: THREE.Color;
        yellow: THREE.Color;
        brown: THREE.Color;
    };
    /** Seasonal tint */
    season: 'spring' | 'summer' | 'autumn' | 'winter';
    /** Wind animation enabled */
    enableWind: boolean;
    /** Include wildflowers */
    includeWildflowers: boolean;
}
/**
 * Generator for grassland ecosystems with mixed grass species and wildflowers
 */
export declare class GrasslandGenerator {
    private readonly defaultConfig;
    /**
     * Generate a grassland ecosystem using instanced rendering
     */
    generate(config?: Partial<GrasslandConfig>): THREE.InstancedMesh[];
    /**
     * Create instanced tall grass
     */
    private createTallGrassInstances;
    /**
     * Create instanced short grass
     */
    private createShortGrassInstances;
    /**
     * Create instanced ornamental grass (feathery plumes)
     */
    private createOrnamentalGrassInstances;
    /**
     * Create wildflower instances
     */
    private createWildflowerInstances;
    /**
     * Create a single grass blade geometry
     */
    private createGrassBladeGeometry;
    /**
     * Create ornamental grass geometry with feathery plume
     */
    private createOrnamentalGrassGeometry;
    /**
     * Create flower geometry
     */
    private createFlowerGeometry;
    private createDaisyGeometry;
    private createTulipGeometry;
    private createSimpleFlowerGeometry;
    /**
     * Merge geometries from a group
     */
    private mergeGroupGeometries;
    /**
     * Get seasonal color adjustment
     */
    private getSeasonalColor;
    /**
     * Update wind animation for all grass instances
     */
    updateWind(meshes: THREE.InstancedMesh[], time: number, windStrength?: number): void;
}
//# sourceMappingURL=GrasslandGenerator.d.ts.map