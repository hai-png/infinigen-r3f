import * as THREE from 'three';
export interface BarkParams {
    baseColor: THREE.Color;
    creviceColor: THREE.Color;
    roughness: number;
    pattern: 'smooth' | 'rough' | 'furrowed' | 'peeling' | 'ridged';
    depth: number;
    enableMoss: boolean;
    mossDensity: number;
    mossColor: THREE.Color;
    enableLichen: boolean;
    lichenColor: THREE.Color;
    [key: string]: unknown;
}
export type BarkPreset = 'oak' | 'pine' | 'birch' | 'cedar' | 'mossy';
/**
 * Configuration for bark material properties
 */
export interface BarkMaterialConfig {
    /** Base color of bark */
    baseColor: THREE.Color;
    /** Crevice/dark area color */
    creviceColor: THREE.Color;
    /** Roughness */
    roughness: number;
    /** Bark pattern type */
    pattern: 'smooth' | 'rough' | 'furrowed' | 'peeling' | 'ridged';
    /** Depth of bark texture */
    depth: number;
    /** Enable moss growth */
    enableMoss: boolean;
    /** Moss density */
    mossDensity: number;
    /** Moss color */
    mossColor: THREE.Color;
    /** Enable lichen */
    enableLichen: boolean;
    /** Lichen color */
    lichenColor: THREE.Color;
}
/**
 * Realistic tree bark material with various patterns
 */
export declare class BarkMaterial {
    private config;
    private material;
    constructor(config?: Partial<BarkMaterialConfig>);
    private createMaterial;
    private generateBarkTexture;
    private generateSmoothBark;
    private generateRoughBark;
    private generateFurrowedBark;
    private generatePeelingBark;
    private generateRidgedBark;
    private createNormalMap;
    /**
     * Get the Three.js material instance
     */
    getMaterial(): THREE.MeshStandardMaterial;
    /**
     * Update bark configuration dynamically
     */
    updateConfig(config: Partial<BarkMaterialConfig>): void;
    /**
     * Create preset bark types
     */
    static createPreset(preset: 'oak' | 'pine' | 'birch' | 'cedar' | 'willow'): BarkMaterial;
}
//# sourceMappingURL=BarkMaterial.d.ts.map