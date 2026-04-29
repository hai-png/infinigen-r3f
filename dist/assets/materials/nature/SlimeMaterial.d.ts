import * as THREE from 'three';
/**
 * Configuration for slime material properties
 */
export interface SlimeMaterialConfig {
    baseColor: THREE.Color;
    transparency: number;
    roughness: number;
    iridescence: number;
    viscosity: number;
    bubbleEnabled: boolean;
    bubbleSize: number;
    glowIntensity: number;
    normalScale: number;
}
/**
 * Procedural slime material generator with translucent and iridescent effects
 */
export declare class SlimeMaterial {
    private static readonly DEFAULT_CONFIG;
    /**
     * Generate a slime material with procedural textures
     */
    static generate(config?: Partial<SlimeMaterialConfig>): THREE.MeshPhysicalMaterial;
    /**
     * Generate slime texture with bubbles and viscous surface
     */
    private static generateSlimeTexture;
    /**
     * Generate normal map for viscous surface detail
     */
    private static generateNormalMap;
    /**
     * Generate iridescence texture for rainbow effect
     */
    private static generateIridescenceTexture;
    /**
     * Add bubbles to slime surface
     */
    private static addBubbles;
    /**
     * Create preset configurations for different slime types
     */
    static getPreset(slimeType: string): SlimeMaterialConfig;
}
//# sourceMappingURL=SlimeMaterial.d.ts.map