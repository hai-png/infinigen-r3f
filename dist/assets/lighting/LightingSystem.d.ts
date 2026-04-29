/**
 * Lighting System - Automated Scene Lighting
 *
 * Ports: infinigen/assets/lighting/
 *
 * Provides procedural lighting setup for indoor, outdoor, and studio scenes.
 */
import * as THREE from 'three';
export interface LightPreset {
    name: string;
    type: 'indoor' | 'outdoor' | 'studio' | 'dramatic' | 'natural';
    description: string;
}
export interface LightingConfig {
    preset?: LightPreset['type'];
    hdriPath?: string;
    ambientIntensity?: number;
    ambientColor?: THREE.Color;
    sunIntensity?: number;
    sunColor?: THREE.Color;
    sunPosition?: THREE.Vector3;
    fillLightIntensity?: number;
    fillLightPosition?: THREE.Vector3;
    rimLightIntensity?: number;
    rimLightPosition?: THREE.Vector3;
    shadowsEnabled?: boolean;
    shadowMapSize?: number;
}
/**
 * Preset lighting configurations
 */
export declare const LIGHT_PRESETS: Record<string, LightingConfig>;
/**
 * Main lighting system class
 */
export declare class LightingSystem {
    private scene;
    private config;
    private lights;
    private hdriTexture;
    private environment;
    constructor(scene: THREE.Scene, config?: LightingConfig);
    /**
     * Setup complete lighting for the scene
     */
    setup(): void;
    /**
     * Clear all existing lights
     */
    clearLights(): void;
    /**
     * Setup ambient light
     */
    setupAmbient(): THREE.AmbientLight;
    /**
     * Setup sun/directional light
     */
    setupSun(): THREE.DirectionalLight;
    /**
     * Setup fill light
     */
    setupFillLight(): THREE.PointLight | THREE.SpotLight;
    /**
     * Setup rim/back light
     */
    setupRimLight(): THREE.SpotLight;
    /**
     * Enable shadows on renderer and lights
     */
    setupShadows(): void;
    /**
     * Setup HDRI environment lighting
     */
    setupHDRI(path: string): Promise<void>;
    /**
     * Load cube texture for HDRI
     */
    private loadCubeTexture;
    /**
     * Update sun position (for time of day simulation)
     */
    updateSunPosition(azimuth: number, elevation: number): void;
    /**
     * Get a light by name
     */
    getLight(name: string): THREE.Light | undefined;
    /**
     * Update lighting configuration
     */
    updateConfig(config: Partial<LightingConfig>): void;
    /**
     * Dispose of all resources
     */
    dispose(): void;
}
/**
 * Create a three-point lighting setup
 */
export declare function createThreePointLighting(scene: THREE.Scene, intensity?: number): LightingSystem;
/**
 * Create outdoor daylight setup
 */
export declare function createDaylightLighting(scene: THREE.Scene, timeOfDay?: 'morning' | 'noon' | 'evening'): LightingSystem;
/**
 * Create indoor ambient lighting
 */
export declare function createIndoorLighting(scene: THREE.Scene, warm?: boolean): LightingSystem;
//# sourceMappingURL=LightingSystem.d.ts.map