/**
 * Fog System
 *
 * Volumetric fog simulation with height-based density,
 * wind-driven movement, and dynamic dissipation.
 *
 * @module FogSystem
 */
import * as THREE from 'three';
export interface FogParams {
    density: number;
    color: THREE.Color;
    height: number;
    falloff: number;
    windSpeed: number;
    windDirection: THREE.Vector3;
    turbulence: number;
    noiseScale: number;
}
export declare class FogSystem {
    private scene;
    private params;
    private fogMesh;
    private noiseTexture;
    private timeUniform;
    private densityUniform;
    private heightUniform;
    private falloffUniform;
    constructor(scene: THREE.Scene, params?: Partial<FogParams>);
    /**
     * Initialize fog volume mesh
     */
    private initializeFog;
    /**
     * Create 3D noise texture
     */
    private createNoiseTexture;
    /**
     * Update fog simulation
     */
    update(deltaTime: number): void;
    /**
     * Set fog density
     */
    setDensity(density: number): void;
    /**
     * Set fog color
     */
    setColor(color: THREE.Color): void;
    /**
     * Set fog height
     */
    setHeight(height: number): void;
    /**
     * Set wind parameters
     */
    setWind(speed: number, direction: THREE.Vector3): void;
    /**
     * Set turbulence level
     */
    setTurbulence(turbulence: number): void;
    /**
     * Enable/disable fog
     */
    setEnabled(enabled: boolean): void;
    /**
     * Get current visibility distance
     */
    getVisibility(): number;
    /**
     * Clean up resources
     */
    dispose(): void;
}
export default FogSystem;
//# sourceMappingURL=FogSystem.d.ts.map