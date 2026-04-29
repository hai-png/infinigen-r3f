/**
 * Rain Particle System
 *
 * High-performance rain simulation using instanced rendering
 * with wind effects, splash particles, and surface interaction.
 *
 * @module RainSystem
 */
import * as THREE from 'three';
export interface RainParams {
    intensity: number;
    windSpeed: number;
    windDirection: THREE.Vector3;
    dropSize: number;
    fallSpeed: number;
    splashEnabled: boolean;
    dripFromSurfaces: boolean;
}
export declare class RainSystem {
    private scene;
    private params;
    private rainMesh;
    private splashMesh;
    private dummy;
    private rainData;
    private readonly maxDrops;
    private readonly maxSplashes;
    constructor(scene: THREE.Scene, params?: Partial<RainParams>);
    /**
     * Initialize rain drop instanced mesh
     */
    private initializeRain;
    /**
     * Initialize splash particle system
     */
    private initializeSplashes;
    /**
     * Reset a single rain drop to top of simulation volume
     */
    private resetDrop;
    /**
     * Update rain simulation
     */
    update(deltaTime: number): void;
    /**
     * Create splash at position
     */
    private createSplash;
    /**
     * Update splash particles
     */
    private updateSplashes;
    /**
     * Set rain intensity
     */
    setIntensity(intensity: number): void;
    /**
     * Set wind parameters
     */
    setWind(speed: number, direction: THREE.Vector3): void;
    /**
     * Enable/disable splashes
     */
    setSplashesEnabled(enabled: boolean): void;
    /**
     * Clean up resources
     */
    dispose(): void;
}
export default RainSystem;
//# sourceMappingURL=RainSystem.d.ts.map