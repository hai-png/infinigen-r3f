import * as THREE from 'three';
/**
 * Configuration for flower material properties
 */
export interface FlowerMaterialConfig {
    petalColor: THREE.Color;
    petalOpacity: number;
    petalRoughness: number;
    petalMetalness: number;
    centerColor: THREE.Color;
    centerRoughness: number;
    hasDewdrops: boolean;
    subsurfaceScattering: number;
    normalScale: number;
    animationSpeed?: number;
}
/**
 * Procedural flower material generator
 */
export declare class FlowerMaterial {
    private static readonly DEFAULT_CONFIG;
    static generate(config?: Partial<FlowerMaterialConfig>): THREE.MeshStandardMaterial;
    private static generatePetalTexture;
    private static generateNormalMap;
    private static addDewdrops;
    static getPreset(flowerType: string): FlowerMaterialConfig;
}
//# sourceMappingURL=FlowerMaterial.d.ts.map