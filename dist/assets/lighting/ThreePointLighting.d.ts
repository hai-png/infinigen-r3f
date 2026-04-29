import * as THREE from 'three';
/**
 * Configuration for three-point lighting setup
 */
export interface ThreePointLightingConfig {
    keyIntensity: number;
    keyColor: THREE.Color;
    keyAngle: number;
    keyHeight: number;
    fillIntensity: number;
    fillColor: THREE.Color;
    fillAngle: number;
    fillHeight: number;
    rimIntensity: number;
    rimColor: THREE.Color;
    rimHeight: number;
    target: THREE.Vector3;
    enableShadows: boolean;
    shadowMapSize: number;
}
/**
 * Three-Point Lighting System
 * Classic studio lighting setup with key, fill, and rim lights
 */
export declare class ThreePointLightingSystem {
    private config;
    private group;
    private keyLight;
    private fillLight;
    private rimLight;
    private targetObject;
    constructor(config?: Partial<ThreePointLightingConfig>);
    /**
     * Create a spotlight with standard settings
     */
    private createSpotLight;
    /**
     * Create fill light (point light for soft illumination)
     */
    private createFillLight;
    /**
     * Update light positions based on new target
     */
    setTarget(target: THREE.Vector3): void;
    /**
     * Reposition all lights maintaining their relative angles
     */
    private repositionLights;
    /**
     * Set key light intensity
     */
    setKeyIntensity(intensity: number): void;
    /**
     * Set fill light intensity
     */
    setFillIntensity(intensity: number): void;
    /**
     * Set rim light intensity
     */
    setRimIntensity(intensity: number): void;
    /**
     * Get lighting group
     */
    getGroup(): THREE.Group;
    /**
     * Update configuration
     */
    setConfig(config: Partial<ThreePointLightingConfig>): void;
    /**
     * Create dramatic lighting preset
     */
    applyDramaticPreset(): void;
    /**
     * Create soft/portrait lighting preset
     */
    applySoftPreset(): void;
}
//# sourceMappingURL=ThreePointLighting.d.ts.map