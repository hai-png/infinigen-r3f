import * as THREE from 'three';
/**
 * Configuration for sky lighting system
 */
export interface SkyLightingConfig {
    sunPosition: THREE.Vector3;
    sunIntensity: number;
    sunColor: THREE.Color;
    skyColor: THREE.Color;
    groundColor: THREE.Color;
    turbidity: number;
    rayleigh: number;
    ambientIntensity: number;
    ambientColor: THREE.Color;
    timeOfDay?: number;
}
/**
 * Sky Lighting System
 * Creates realistic sky and sun lighting using hemisphere and directional lights
 */
export declare class SkyLightingSystem {
    private config;
    private group;
    private sunLight;
    private hemisphereLight;
    private ambientLight;
    private skyMesh?;
    constructor(config?: Partial<SkyLightingConfig>);
    /**
     * Create visual sky sphere
     */
    private createSky;
    /**
     * Update sun position based on time of day
     */
    setTimeOfDay(time: number): void;
    /**
     * Update sun intensity
     */
    setSunIntensity(intensity: number): void;
    /**
     * Get lighting group
     */
    getGroup(): THREE.Group;
    /**
     * Update configuration
     */
    setConfig(config: Partial<SkyLightingConfig>): void;
}
//# sourceMappingURL=SkyLighting.d.ts.map