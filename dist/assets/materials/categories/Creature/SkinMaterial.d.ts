import * as THREE from 'three';
/**
 * Configuration for skin material properties
 */
export interface SkinMaterialConfig {
    /** Base skin color (albedo) */
    baseColor: THREE.Color;
    /** Subsurface scattering color */
    subsurfaceColor: THREE.Color;
    /** Subsurface scattering radius (RGB for different wavelengths) */
    subsurfaceRadius: THREE.Vector3;
    /** Amount of subsurface scattering (0-1) */
    subsurfaceAmount: number;
    /** Roughness of skin surface */
    roughness: number;
    /** Specular intensity */
    specular: number;
    /** Normal map strength for skin details (pores, wrinkles) */
    normalStrength: number;
    /** Enable freckles or spots */
    enableFreckles: boolean;
    /** Freckle density (0-1) */
    freckleDensity: number;
    /** Freckle color */
    freckleColor: THREE.Color;
    /** Enable wrinkles */
    enableWrinkles: boolean;
    /** Wrinkle depth */
    wrinkleDepth: number;
    /** Skin type: 'human', 'alien', 'creature' */
    skinType: 'human' | 'alien' | 'creature';
}
/**
 * Realistic skin material with subsurface scattering
 */
export declare class SkinMaterial {
    private config;
    private material;
    constructor(config?: Partial<SkinMaterialConfig>);
    private createMaterial;
    private generateSubsurfaceMap;
    private generateSkinDetailMap;
    /**
     * Get the Three.js material instance
     */
    getMaterial(): THREE.MeshPhysicalMaterial;
    /**
     * Update skin configuration dynamically
     */
    updateConfig(config: Partial<SkinMaterialConfig>): void;
    /**
     * Create preset skin types
     */
    static createPreset(preset: 'fair' | 'medium' | 'dark' | 'alien' | 'zombie'): SkinMaterial;
}
//# sourceMappingURL=SkinMaterial.d.ts.map