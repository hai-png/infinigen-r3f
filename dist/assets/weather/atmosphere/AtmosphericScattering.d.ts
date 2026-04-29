/**
 * AtmosphericScattering.ts
 * Rayleigh/Mie scattering, volumetric clouds, and fog gradients
 * Part of Phase 4: Advanced Features - 100% Completion
 */
import * as THREE from 'three';
export interface AtmosphereConfig {
    rayleighCoefficient: number;
    mieCoefficient: number;
    rayleighScaleHeight: number;
    mieScaleHeight: number;
    sunIntensity: number;
    moonIntensity: number;
    turbidity: number;
    ozone: number;
}
export interface CloudConfig {
    coverage: number;
    density: number;
    height: number;
    thickness: number;
    speed: THREE.Vector2;
}
export declare class AtmosphericScattering {
    private scene;
    private camera;
    private renderer;
    private skyMesh;
    private groundMesh;
    private cloudMesh;
    private skyMaterial;
    private config;
    private cloudConfig;
    private sunPosition;
    private moonPosition;
    private time;
    constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer);
    private initialize;
    private createSky;
    private createGround;
    private updateRayleighCoefficients;
    setSunPosition(position: THREE.Vector3): void;
    setMoonPosition(position: THREE.Vector3): void;
    setTimeOfDay(hour: number): void;
    setCloudConfig(config: Partial<CloudConfig>): void;
    private updateClouds;
    update(deltaTime: number): void;
    setFogDensity(density: number): void;
    setTurbidity(turbidity: number): void;
    dispose(): void;
}
export default AtmosphericScattering;
//# sourceMappingURL=AtmosphericScattering.d.ts.map