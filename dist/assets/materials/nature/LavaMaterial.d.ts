import * as THREE from 'three';
/**
 * Configuration for lava material properties
 */
export interface LavaMaterialConfig {
    baseColor: THREE.Color;
    glowColor: THREE.Color;
    temperature: number;
    flowSpeed: number;
    turbulenceScale: number;
    bubbleDensity: number;
    crustEnabled: boolean;
    crustCoverage: number;
    emissiveIntensity: number;
}
/**
 * Procedural lava material generator with animated flow and glow effects
 */
export declare class LavaMaterial {
    private static readonly DEFAULT_CONFIG;
    private timeUniform;
    /**
     * Generate a lava material with animated shader
     */
    static generate(config?: Partial<LavaMaterialConfig>): THREE.ShaderMaterial;
    /**
     * Create preset configurations for different lava types
     */
    static getPreset(lavaType: string): LavaMaterialConfig;
    /**
     * Update material time uniform for animation
     */
    static updateMaterialTime(material: THREE.ShaderMaterial, deltaTime: number): void;
}
//# sourceMappingURL=LavaMaterial.d.ts.map