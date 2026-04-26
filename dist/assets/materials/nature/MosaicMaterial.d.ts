import * as THREE from 'three';
/**
 * Configuration for mosaic material properties
 */
export interface MosaicMaterialConfig {
    tileColors: THREE.Color[];
    tileSize: number;
    groutColor: THREE.Color;
    groutWidth: number;
    patternType: 'random' | 'checkerboard' | 'stripes' | 'diagonal' | 'custom';
    roughness: number;
    normalScale: number;
    metallic: number;
    variationIntensity: number;
}
/**
 * Procedural mosaic material generator for decorative floors and walls
 */
export declare class MosaicMaterial {
    private static readonly DEFAULT_CONFIG;
    /**
     * Generate a mosaic material with procedural textures
     */
    static generate(config?: Partial<MosaicMaterialConfig>): THREE.MeshStandardMaterial;
    /**
     * Generate mosaic texture based on pattern type
     */
    private static generateMosaicTexture;
    /**
     * Add color variation to individual tiles
     */
    private static addTileVariation;
    /**
     * Add surface detail to tiles
     */
    private static addTileDetail;
    /**
     * Generate normal map for mosaic surface
     */
    private static generateNormalMap;
    /**
     * Create preset configurations for different mosaic styles
     */
    static getPreset(mosaicType: string): MosaicMaterialConfig;
}
//# sourceMappingURL=MosaicMaterial.d.ts.map