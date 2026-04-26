import * as THREE from 'three';
/**
 * Configuration for scale material properties
 */
export interface ScaleMaterialConfig {
    /** Base color of scales */
    baseColor: THREE.Color;
    /** Edge/rim color of scales */
    edgeColor: THREE.Color;
    /** Iridescent highlight color */
    iridescentColor: THREE.Color;
    /** Scale size (0-1) */
    scaleSize: number;
    /** Scale pattern type */
    pattern: 'round' | 'hexagonal' | 'diamond' | 'jagged';
    /** Roughness of scale surface */
    roughness: number;
    /** Metallicity */
    metalness: number;
    /** Iridescence strength (0-1) */
    iridescence: number;
    /** Iridescence index of refraction */
    ior: number;
    /** Normal map strength for scale detail */
    normalStrength: number;
    /** Enable bioluminescence */
    enableBioluminescence: boolean;
    /** Bioluminescence color */
    bioluminescentColor: THREE.Color;
    /** Bioluminescence intensity */
    bioluminescenceIntensity: number;
}
/**
 * Realistic reptilian/dragon scale material with iridescence
 */
export declare class ScaleMaterial {
    private config;
    private material;
    constructor(config?: Partial<ScaleMaterialConfig>);
    private createMaterial;
    private generateScalePattern;
    private generateRoundScales;
    private generateHexagonalScales;
    private generateDiamondScales;
    private generateJaggedScales;
    private addBioluminescence;
    /**
     * Get the Three.js material instance
     */
    getMaterial(): THREE.MeshPhysicalMaterial;
    /**
     * Update scale configuration dynamically
     */
    updateConfig(config: Partial<ScaleMaterialConfig>): void;
    /**
     * Create preset scale types
     */
    static createPreset(preset: 'snake' | 'dragon' | 'fish' | 'lizard' | 'fantasy'): ScaleMaterial;
}
//# sourceMappingURL=ScaleMaterial.d.ts.map