import * as THREE from 'three';
/**
 * Smoothed Particle Hydrodynamics (SPH) Fluid Simulation
 * Implements real-time fluid simulation using Lagrangian particles
 */
export interface FluidConfig {
    particleCount: number;
    particleMass: number;
    restDensity: number;
    gasConstant: number;
    viscosity: number;
    h: number;
    gravity: THREE.Vector3;
}
export interface FluidParticle {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    acceleration: THREE.Vector3;
    density: number;
    pressure: number;
}
export declare class FluidSimulation {
    private particles;
    private config;
    private bounds;
    private geometry;
    private points;
    private enabled;
    private spatialHash;
    constructor(config?: Partial<FluidConfig>);
    private initializeParticles;
    private createVisualization;
    step(dt: number): void;
    private hashPosition;
    private updateSpatialHash;
    private getNeighbors;
    private poly6Kernel;
    private spikyGradient;
    private viscosityLaplacian;
    private computeDensityPressure;
    private computeForces;
    private integrate;
    private handleBoundaries;
    private updateVisualization;
    getPoints(): THREE.Points | null;
    addForce(position: THREE.Vector3, force: THREE.Vector3, radius?: number): void;
    reset(): void;
    setGravity(gravity: THREE.Vector3): void;
    dispose(): void;
}
export default FluidSimulation;
//# sourceMappingURL=FluidSimulation.d.ts.map