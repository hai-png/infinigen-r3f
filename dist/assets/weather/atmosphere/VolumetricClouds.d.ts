/**
 * Volumetric Cloud System
 *
 * Implements procedural volumetric clouds inspired by Infinigen's atmosphere system.
 * Uses raymarching through 3D noise fields for realistic cloud rendering.
 *
 * Features:
 * - Multiple cloud layers (cirrus, cumulus, stratus)
 * - Dynamic lighting with self-shadowing
 * - Wind-driven animation
 * - LOD-based performance optimization
 *
 * @see https://github.com/princeton-vl/infinigen
 */
import * as THREE from 'three';
export interface CloudParams {
    layerCount: number;
    baseHeight: number;
    layerThickness: number;
    density: number;
    coverage: number;
    detail: number;
    lightAbsorption: number;
    shadowIntensity: number;
    albedo: THREE.Color;
    windSpeed: THREE.Vector3;
    timeScale: number;
    raySteps: number;
    lightSteps: number;
}
/**
 * Cloud layer definition with specific characteristics
 */
export declare class CloudLayer {
    type: 'cirrus' | 'cumulus' | 'stratus';
    height: number;
    thickness: number;
    density: number;
    coverage: number;
    scale: number;
    detail: number;
    windOffset: THREE.Vector3;
    constructor(type?: 'cirrus' | 'cumulus' | 'stratus', params?: Partial<CloudLayer>);
    private applyTypeDefaults;
    toJSON(): Record<string, any>;
}
/**
 * Volumetric cloud renderer using raymarching
 */
export declare class VolumetricClouds {
    private scene;
    private camera;
    private renderer;
    private cloudMesh;
    private cloudMaterial;
    private layers;
    private params;
    private timeUniform;
    private sunDirection;
    private noiseTexture3D;
    private noiseTexture2D;
    /**
     * Create 3D and 2D noise textures for GPU sampling
     */
    private createNoiseTextures;
    private generatePerlinNoise3D;
    private generatePerlinNoise2D;
    private fade;
    private lerp;
    private grad;
    private grad2D;
    private p;
    /**
     * Create the cloud shader material with raymarching
     */
    private createCloudMaterial;
    /**
     * Add a cloud layer
     */
    addLayer(layer: CloudLayer): void;
    /**
     * Remove a cloud layer by index
     */
    removeLayer(index: number): void;
    /**
     * Update shader uniforms
     */
    private updateUniforms;
    /**
     * Update cloud parameters
     */
    updateParams(params: Partial<CloudParams>): void;
    /**
     * Set sun direction for lighting
     */
    setSunDirection(direction: THREE.Vector3): void;
    /**
     * Animate clouds based on time and wind
     */
    animate(deltaTime: number): void;
    /**
     * Cleanup resources
     */
    dispose(): void;
}
export default VolumetricClouds;
//# sourceMappingURL=VolumetricClouds.d.ts.map