import * as THREE from 'three';
/**
 * Configuration for leaf material properties
 */
export interface LeafMaterialConfig {
    /** Base color of leaf */
    baseColor: THREE.Color;
    /** Vein color */
    veinColor: THREE.Color;
    /** Edge color (for autumn/withered leaves) */
    edgeColor: THREE.Color;
    /** Translucency for light passing through */
    translucency: number;
    /** Roughness of leaf surface */
    roughness: number;
    /** Enable veins pattern */
    enableVeins: boolean;
    /** Vein density */
    veinDensity: number;
    /** Enable damage/wear */
    enableDamage: boolean;
    /** Damage amount (0-1) */
    damageAmount: number;
    /** Enable dew drops */
    enableDew: boolean;
    /** Dew drop size */
    dewSize: number;
    /** Leaf health (1 = healthy, 0 = dead) */
    health: number;
}
/**
 * Realistic leaf material with translucency and vein patterns
 */
export declare class LeafMaterial {
    private config;
    private material;
    constructor(config?: Partial<LeafMaterialConfig>);
    private createMaterial;
    private getHealthAdjustedColor;
    private generateLeafTexture;
    private generateVeinPattern;
    private generateSimpleLeafTexture;
    /**
     * Get the Three.js material instance
     */
    getMaterial(): THREE.MeshPhysicalMaterial;
    /**
     * Update leaf configuration dynamically
     */
    updateConfig(config: Partial<LeafMaterialConfig>): void;
    /**
     * Create preset leaf types
     */
    static createPreset(preset: 'healthy' | 'autumn' | 'withered' | 'tropical' | 'succulent'): LeafMaterial;
}
//# sourceMappingURL=LeafMaterial.d.ts.map