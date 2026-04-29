import * as THREE from 'three';
/**
 * Configuration for metal material generation
 */
export interface MetalMaterialConfig {
    baseColor: THREE.Color;
    roughness: number;
    metalness: number;
    normalScale: number;
    clearcoat: number;
    clearcoatRoughness: number;
    metalType: 'steel' | 'aluminum' | 'copper' | 'brass' | 'gold' | 'iron' | 'chrome';
    hasScratches: boolean;
    hasRust: boolean;
}
/**
 * Procedural Metal Material Generator
 * Creates realistic metal materials with surface imperfections
 */
export declare class MetalMaterialGenerator {
    private defaultConfigs;
    /**
     * Generate metal material with custom or preset configuration
     */
    generate(config?: Partial<MetalMaterialConfig>): THREE.MeshStandardMaterial;
    /**
     * Add procedural scratch pattern to material
     */
    private addScratches;
    /**
     * Add rust effect to material
     */
    private addRust;
    /**
     * Generate brushed metal variant
     */
    generateBrushed(baseConfig?: Partial<MetalMaterialConfig>): THREE.MeshStandardMaterial;
    /**
     * Generate worn/aged metal variant
     */
    generateWorn(baseConfig?: Partial<MetalMaterialConfig>): THREE.MeshStandardMaterial;
}
//# sourceMappingURL=MetalMaterial.d.ts.map