import * as THREE from 'three';
/**
 * Configuration for fabric material generation
 */
export interface FabricMaterialConfig {
    baseColor: THREE.Color;
    patternColor: THREE.Color;
    roughness: number;
    metalness: number;
    normalScale: number;
    fabricType: 'cotton' | 'silk' | 'denim' | 'velvet' | 'leather' | 'wool' | 'linen';
    hasPattern: boolean;
    patternType?: 'stripes' | 'checks' | 'dots' | 'none';
}
/**
 * Procedural Fabric Material Generator
 * Creates realistic fabric materials with weave patterns and textures
 */
export declare class FabricMaterialGenerator {
    private defaultConfigs;
    /**
     * Generate fabric material with custom or preset configuration
     */
    generate(config?: Partial<FabricMaterialConfig>): THREE.MeshStandardMaterial;
    /**
     * Apply procedural weave pattern to material
     */
    private applyWeavePattern;
    /**
     * Apply decorative pattern overlay
     */
    private applyPattern;
    /**
     * Draw stripe pattern
     */
    private drawStripes;
    /**
     * Draw checkered pattern
     */
    private drawChecks;
    /**
     * Draw polka dot pattern
     */
    private drawDots;
    /**
     * Add noise to canvas context
     */
    private addNoise;
    /**
     * Get thread spacing based on fabric type
     */
    private getThreadSpacing;
    /**
     * Get thread width based on fabric type
     */
    private getThreadWidth;
    /**
     * Adjust color brightness
     */
    private adjustColor;
    /**
     * Generate worn/faded fabric variant
     */
    generateWorn(baseConfig?: Partial<FabricMaterialConfig>): THREE.MeshStandardMaterial;
    /**
     * Generate quilted/padded fabric variant
     */
    generateQuilted(baseConfig?: Partial<FabricMaterialConfig>): THREE.MeshStandardMaterial;
}
//# sourceMappingURL=FabricMaterial.d.ts.map