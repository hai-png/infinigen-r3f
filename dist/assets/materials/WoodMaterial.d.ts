import * as THREE from 'three';
/**
 * Configuration for wood material generation
 */
export interface WoodMaterialConfig {
    baseColor: THREE.Color;
    grainColor: THREE.Color;
    grainScale: number;
    grainIntensity: number;
    roughness: number;
    metalness: number;
    normalScale: number;
    woodType: 'oak' | 'pine' | 'walnut' | 'mahogany' | 'cherry';
}
/**
 * Procedural Wood Material Generator
 * Creates realistic wood materials with grain patterns using shader-based techniques
 */
export declare class WoodMaterialGenerator {
    private defaultConfigs;
    /**
     * Generate wood material with custom or preset configuration
     */
    generate(config?: Partial<WoodMaterialConfig>): THREE.MeshStandardMaterial;
    /**
     * Apply procedural grain pattern to material
     */
    private applyGrainPattern;
    /**
     * Generate aged/weathered wood variant
     */
    generateWeathered(baseConfig?: Partial<WoodMaterialConfig>): THREE.MeshStandardMaterial;
    /**
     * Generate polished/treated wood variant
     */
    generatePolished(baseConfig?: Partial<WoodMaterialConfig>): THREE.MeshStandardMaterial;
}
//# sourceMappingURL=WoodMaterial.d.ts.map