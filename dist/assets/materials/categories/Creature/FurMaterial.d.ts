import * as THREE from 'three';
/**
 * Configuration for fur material properties
 */
export interface FurMaterialConfig {
    /** Base color of fur */
    baseColor: THREE.Color;
    /** Tip color (for gradient effect) */
    tipColor: THREE.Color;
    /** Undercoat color */
    undercoatColor: THREE.Color;
    /** Fur length (0-1) */
    furLength: number;
    /** Fur density */
    density: number;
    /** Roughness */
    roughness: number;
    /** Enable stripe pattern */
    enableStripes: boolean;
    /** Stripe color */
    stripeColor: THREE.Color;
    /** Stripe width */
    stripeWidth: number;
    /** Enable spots pattern */
    enableSpots: boolean;
    /** Spot color */
    spotColor: THREE.Color;
    /** Spot size */
    spotSize: number;
    /** Enable anisotropy for fur sheen */
    anisotropy: number;
}
export type FurParams = FurMaterialConfig;
export type FurPreset = 'cat' | 'dog' | 'tiger' | 'leopard' | 'bear' | 'rabbit';
/**
 * Realistic fur/hair material with anisotropic shading
 */
export declare class FurMaterial {
    private config;
    private material;
    constructor(config?: Partial<FurMaterialConfig>);
    private createMaterial;
    private generateFurGradient;
    private addStripes;
    private addSpots;
    /**
     * Get the Three.js material instance
     */
    getMaterial(): THREE.MeshStandardMaterial;
    /**
     * Update fur configuration dynamically
     */
    updateConfig(config: Partial<FurMaterialConfig>): void;
    /**
     * Create preset fur types
     */
    static createPreset(preset: 'cat' | 'dog' | 'tiger' | 'leopard' | 'bear' | 'rabbit'): FurMaterial;
}
//# sourceMappingURL=FurMaterial.d.ts.map