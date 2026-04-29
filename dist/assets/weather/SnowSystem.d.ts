/**
 * Snow Particle System
 *
 * Realistic snow simulation with fluttering flakes,
 * wind drift, accumulation, and melting effects.
 *
 * @module SnowSystem
 */
import * as THREE from 'three';
export interface SnowParams {
    intensity: number;
    windSpeed: number;
    windDirection: THREE.Vector3;
    flakeSize: number;
    fallSpeed: number;
    turbulence: number;
    accumulationEnabled: boolean;
    meltEnabled: boolean;
    temperature: number;
}
export declare class SnowSystem {
    private scene;
    private params;
    private snowMesh;
    private accumulationMeshes;
    private snowflakes;
    private readonly maxFlakes;
    private accumulationMap;
    constructor(scene: THREE.Scene, params?: Partial<SnowParams>);
    /**
     * Initialize snow particle system
     */
    private initializeSnow;
    /**
     * Update snow simulation
     */
    update(deltaTime: number): void;
    /**
     * Track snow accumulation at position
     */
    private addAccumulation;
    /**
     * Handle snow melting based on temperature
     */
    private handleMelting;
    /**
     * Get accumulated snow height at position
     */
    getAccumulationHeight(x: number, z: number): number;
    /**
     * Create visible snow accumulation meshes
     */
    createAccumulationMeshes(gridSize?: number): void;
    /**
     * Set snow intensity
     */
    setIntensity(intensity: number): void;
    /**
     * Set wind parameters
     */
    setWind(speed: number, direction: THREE.Vector3): void;
    /**
     * Set temperature (affects melting)
     */
    setTemperature(temp: number): void;
    /**
     * Enable/disable accumulation
     */
    setAccumulationEnabled(enabled: boolean): void;
    /**
     * Clear all accumulated snow
     */
    clearAccumulation(): void;
    /**
     * Clean up resources
     */
    dispose(): void;
}
export default SnowSystem;
//# sourceMappingURL=SnowSystem.d.ts.map