import * as THREE from 'three';
/**
 * Fabric drape configuration
 */
export interface FabricDrapeConfig {
    /** Fabric type affecting drape behavior */
    fabricType: 'silk' | 'cotton' | 'wool' | 'linen' | 'velvet' | 'curtain';
    /** Drape dimensions */
    width: number;
    height: number;
    /** Number of folds */
    foldCount?: number;
    /** Drape style */
    style: 'curtain' | 'tablecloth' | 'blanket' | 'towel' | 'sheet';
    /** Color */
    color: THREE.Color;
    /** Transparency (0-1) */
    transparency?: number;
    /** Wrinkle intensity (0-1) */
    wrinkleIntensity?: number;
}
/**
 * Fabric drape generator for creating realistic cloth simulations
 */
export declare class FabricDrape {
    private config;
    constructor(config: FabricDrapeConfig);
    /**
     * Generate draped fabric mesh
     */
    generate(): THREE.Mesh;
    /**
     * Create draped geometry with folds
     */
    private createDrapeGeometry;
    /**
     * Apply curtain-style drape
     */
    private applyCurtainDrape;
    /**
     * Apply tablecloth-style drape
     */
    private applyTableclothDrape;
    /**
     * Apply blanket-style drape
     */
    private applyBlanketDrape;
    /**
     * Apply towel-style drape
     */
    private applyTowelDrape;
    /**
     * Apply sheet-style drape
     */
    private applySheetDrape;
    /**
     * Create fabric material
     */
    private createFabricMaterial;
    /**
     * Get fabric properties based on type
     */
    private getFabricProperties;
    /**
     * Add fabric texture to material
     */
    private addFabricTexture;
    /**
     * Generate hanging curtain
     */
    static createHangingCurtain(width: number, height: number, color: THREE.Color, fabricType?: 'silk' | 'cotton' | 'velvet' | 'curtain'): THREE.Mesh;
    /**
     * Generate tablecloth
     */
    static createTablecloth(width: number, depth: number, color: THREE.Color, fabricType?: 'cotton' | 'linen' | 'silk'): THREE.Mesh;
    /**
     * Generate folded towel
     */
    static createFoldedTowel(width: number, height: number, color: THREE.Color): THREE.Group;
}
export default FabricDrape;
//# sourceMappingURL=FabricDrape.d.ts.map