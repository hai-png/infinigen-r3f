/**
 * Fluid Dynamics System for Water Simulation
 *
 * Implements shallow water equations and particle-based fluid simulation
 * for realistic water behavior in terrain features.
 *
 * @module FluidDynamics
 */
import * as THREE from 'three';
export interface FluidParticle {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    acceleration: THREE.Vector3;
    mass: number;
    pressure: number;
    density: number;
}
export interface FluidSimulationParams {
    gravity: number;
    viscosity: number;
    surfaceTension: number;
    particleRadius: number;
    restDensity: number;
    gasConstant: number;
    smoothingRadius: number;
    timeStep: number;
}
export declare class FluidDynamics {
    private particles;
    private params;
    private noise;
    private spatialHash;
    private hashScale;
    constructor(params?: Partial<FluidSimulationParams>);
    /**
     * Initialize fluid particles in a region
     */
    initializeParticles(origin: THREE.Vector3, size: THREE.Vector3, count: number): void;
    /**
     * Update fluid simulation by one time step
     */
    update(deltaTime: number): void;
    /**
     * Rebuild spatial hash grid for efficient neighbor lookup
     */
    private rebuildSpatialHash;
    /**
     * Get hash key for a position
     */
    private getHashKey;
    /**
     * Get neighboring particles within smoothing radius
     */
    private getNeighbors;
    /**
     * Calculate density for each particle using SPH
     */
    private calculateDensities;
    /**
     * Calculate pressure using state equation
     */
    private calculatePressures;
    /**
     * Calculate accelerations from pressure and viscosity forces
     */
    private calculateAccelerations;
    /**
     * Integrate positions and velocities using leapfrog integration
     */
    private integrate;
    /**
     * Apply boundary conditions
     */
    private applyBoundaries;
    /**
     * Poly6 kernel for density calculation
     */
    private poly6Kernel;
    /**
     * Spiky gradient for pressure force
     */
    private spikyGradient;
    /**
     * Laplacian kernel for viscosity force
     */
    private laplacianKernel;
    /**
     * Get all particles for rendering
     */
    getParticles(): FluidParticle[];
    /**
     * Create Three.js points for visualization
     */
    createVisualization(color?: number, size?: number): THREE.Points;
}
export default FluidDynamics;
//# sourceMappingURL=FluidDynamics.d.ts.map