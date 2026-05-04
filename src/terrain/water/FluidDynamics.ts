/**
 * Fluid Dynamics System for Water Simulation
 * 
 * Implements shallow water equations and particle-based fluid simulation
 * for realistic water behavior in terrain features.
 * 
 * @module FluidDynamics
 */

import * as THREE from 'three';
import { createNoise3D, NoiseFunction3D } from 'simplex-noise';
import { SeededRandom } from '../../core/util/math/index';
import { SPHSurfaceExtractor } from '../../sim/fluid/SPHSurfaceExtractor';
import type { SPHSurfaceExtractorConfig } from '../../sim/fluid/SPHSurfaceExtractor';

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
  seed: number;
}

export class FluidDynamics {
  private particles: FluidParticle[] = [];
  private params: FluidSimulationParams;
  private noise: NoiseFunction3D;
  private spatialHash: Map<string, FluidParticle[]>;
  private hashScale: number;
  private rng: SeededRandom;
  private surfaceExtractor: SPHSurfaceExtractor;

  constructor(params?: Partial<FluidSimulationParams>) {
    this.params = {
      gravity: -9.81,
      viscosity: 0.001,
      surfaceTension: 0.072,
      particleRadius: 0.1,
      restDensity: 1000,
      gasConstant: 2000,
      smoothingRadius: 0.5,
      timeStep: 0.016,
      seed: 42,
      ...params
    };

    this.noise = createNoise3D();
    this.spatialHash = new Map();
    this.hashScale = this.params.smoothingRadius;
    this.rng = new SeededRandom(this.params.seed);

    // Initialize SPH surface extractor with matching parameters
    this.surfaceExtractor = new SPHSurfaceExtractor({
      gridResolution: 32,
      smoothingRadius: this.params.smoothingRadius,
      particleMass: this.params.restDensity * Math.pow(this.params.particleRadius, 3),
      isoThreshold: this.params.restDensity * 0.5,
      boundsPadding: this.params.particleRadius * 2,
      smoothingIterations: 2,
      smoothingFactor: 0.3,
    });
  }

  /**
   * Initialize fluid particles in a region
   */
  initializeParticles(
    origin: THREE.Vector3,
    size: THREE.Vector3,
    count: number
  ): void {
    this.particles = [];
    
    for (let i = 0; i < count; i++) {
      const particle: FluidParticle = {
        position: new THREE.Vector3(
          origin.x + this.rng.next() * size.x,
          origin.y + this.rng.next() * size.y,
          origin.z + this.rng.next() * size.z
        ),
        velocity: new THREE.Vector3(0, 0, 0),
        acceleration: new THREE.Vector3(0, 0, 0),
        mass: this.params.restDensity * Math.pow(this.params.particleRadius, 3),
        pressure: 0,
        density: this.params.restDensity
      };
      
      this.particles.push(particle);
    }
    
    this.rebuildSpatialHash();
  }

  /**
   * Update fluid simulation by one time step
   */
  update(deltaTime: number): void {
    const dt = Math.min(deltaTime, this.params.timeStep);
    
    // Rebuild spatial hash for neighbor lookup
    this.rebuildSpatialHash();
    
    // Calculate densities and pressures
    this.calculateDensities();
    this.calculatePressures();
    
    // Calculate accelerations from forces
    this.calculateAccelerations();
    
    // Integrate positions and velocities
    this.integrate(dt);
    
    // Apply boundary conditions
    this.applyBoundaries();
  }

  /**
   * Rebuild spatial hash grid for efficient neighbor lookup
   */
  private rebuildSpatialHash(): void {
    this.spatialHash.clear();
    
    for (const particle of this.particles) {
      const hashKey = this.getHashKey(particle.position);
      
      if (!this.spatialHash.has(hashKey)) {
        this.spatialHash.set(hashKey, []);
      }
      
      this.spatialHash.get(hashKey)!.push(particle);
    }
  }

  /**
   * Get hash key for a position
   */
  private getHashKey(position: THREE.Vector3): string {
    const x = Math.floor(position.x / this.hashScale);
    const y = Math.floor(position.y / this.hashScale);
    const z = Math.floor(position.z / this.hashScale);
    
    return `${x},${y},${z}`;
  }

  /**
   * Get neighboring particles within smoothing radius
   */
  private getNeighbors(particle: FluidParticle): FluidParticle[] {
    const neighbors: FluidParticle[] = [];
    const pos = particle.position;
    
    const startX = Math.floor((pos.x - this.params.smoothingRadius) / this.hashScale);
    const endX = Math.floor((pos.x + this.params.smoothingRadius) / this.hashScale);
    const startY = Math.floor((pos.y - this.params.smoothingRadius) / this.hashScale);
    const endY = Math.floor((pos.y + this.params.smoothingRadius) / this.hashScale);
    const startZ = Math.floor((pos.z - this.params.smoothingRadius) / this.hashScale);
    const endZ = Math.floor((pos.z + this.params.smoothingRadius) / this.hashScale);
    
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        for (let z = startZ; z <= endZ; z++) {
          const hashKey = `${x},${y},${z}`;
          const cell = this.spatialHash.get(hashKey);
          
          if (cell) {
            for (const other of cell) {
              if (other !== particle) {
                const distSq = pos.distanceToSquared(other.position);
                if (distSq < this.params.smoothingRadius * this.params.smoothingRadius) {
                  neighbors.push(other);
                }
              }
            }
          }
        }
      }
    }
    
    return neighbors;
  }

  /**
   * Calculate density for each particle using SPH
   */
  private calculateDensities(): void {
    for (const particle of this.particles) {
      let density = 0;
      const neighbors = this.getNeighbors(particle);
      
      for (const neighbor of neighbors) {
        const dist = particle.position.distanceTo(neighbor.position);
        const weight = this.poly6Kernel(dist);
        density += neighbor.mass * weight;
      }
      
      particle.density = Math.max(density, this.params.restDensity * 0.1);
    }
  }

  /**
   * Calculate pressure using state equation
   */
  private calculatePressures(): void {
    for (const particle of this.particles) {
      particle.pressure = this.params.gasConstant * (particle.density - this.params.restDensity);
    }
  }

  /**
   * Calculate accelerations from pressure and viscosity forces
   */
  private calculateAccelerations(): void {
    for (const particle of this.particles) {
      const acceleration = new THREE.Vector3(0, this.params.gravity, 0);
      const neighbors = this.getNeighbors(particle);
      
      // Pressure force
      const pressureAccel = new THREE.Vector3(0, 0, 0);
      for (const neighbor of neighbors) {
        const dist = particle.position.distanceTo(neighbor.position);
        const gradWeight = this.spikyGradient(dist, particle.position, neighbor.position);
        
        const pressureTerm = (particle.pressure / (particle.density * particle.density) +
                             neighbor.pressure / (neighbor.density * neighbor.density));
        
        pressureAccel.add(gradWeight.multiplyScalar(-neighbor.mass * pressureTerm));
      }
      
      acceleration.add(pressureAccel);
      
      // Viscosity force
      const viscosityAccel = new THREE.Vector3(0, 0, 0);
      for (const neighbor of neighbors) {
        const dist = particle.position.distanceTo(neighbor.position);
        const lapWeight = this.laplacianKernel(dist);
        
        viscosityAccel.add(
          neighbor.velocity.clone()
            .sub(particle.velocity)
            .multiplyScalar(neighbor.mass * lapWeight / neighbor.density)
        );
      }
      
      acceleration.add(viscosityAccel.multiplyScalar(this.params.viscosity));
      
      particle.acceleration.copy(acceleration);
    }
  }

  /**
   * Integrate positions and velocities using leapfrog integration
   */
  private integrate(dt: number): void {
    for (const particle of this.particles) {
      // Update velocity
      particle.velocity.add(
        particle.acceleration.clone().multiplyScalar(dt)
      );
      
      // Apply viscosity damping
      particle.velocity.multiplyScalar(1 - this.params.viscosity * 0.1);
      
      // Update position
      particle.position.add(
        particle.velocity.clone().multiplyScalar(dt)
      );
    }
  }

  /**
   * Apply boundary conditions
   */
  private applyBoundaries(): void {
    const damping = 0.3;
    const minDist = this.params.particleRadius;
    
    for (const particle of this.particles) {
      // Simple floor boundary
      if (particle.position.y < minDist) {
        particle.position.y = minDist;
        particle.velocity.y *= -damping;
      }
      
      // Add more complex boundaries as needed
    }
  }

  /**
   * Poly6 kernel for density calculation
   */
  private poly6Kernel(dist: number): number {
    const h = this.params.smoothingRadius;
    if (dist >= h) return 0;
    
    const factor = 315 / (64 * Math.PI * Math.pow(h, 9));
    const term = h * h - dist * dist;
    return factor * term * term * term;
  }

  /**
   * Spiky gradient for pressure force
   */
  private spikyGradient(
    dist: number,
    pos: THREE.Vector3,
    neighborPos: THREE.Vector3
  ): THREE.Vector3 {
    const h = this.params.smoothingRadius;
    if (dist >= h || dist < 1e-6) return new THREE.Vector3(0, 0, 0);
    
    const factor = -45 / (Math.PI * Math.pow(h, 6));
    const term = h - dist;
    const magnitude = factor * term * term;
    
    const direction = neighborPos.clone().sub(pos).normalize();
    return direction.multiplyScalar(magnitude);
  }

  /**
   * Laplacian kernel for viscosity force
   */
  private laplacianKernel(dist: number): number {
    const h = this.params.smoothingRadius;
    if (dist >= h) return 0;
    
    const factor = 15 / (2 * Math.PI * Math.pow(h, 3));
    return factor * (h - dist);
  }

  /**
   * Get all particles for rendering
   */
  getParticles(): FluidParticle[] {
    return this.particles;
  }

  /**
   * Create Three.js points for visualization
   */
  createVisualization(
    color: number = 0x44aaff,
    size: number = 0.1
  ): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particles.length * 3);
    
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i].position;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 0.8
    });
    
    return new THREE.Points(geometry, material);
  }

  /**
   * Extract a smooth mesh surface from the current SPH particles using
   * marching cubes on a density field computed with the Poly6 kernel.
   *
   * This converts the point cloud into a watertight triangle mesh suitable
   * for rendering with a water material.
   *
   * @param overrideParams Optional parameters to override the default extractor config
   * @returns THREE.BufferGeometry with the extracted surface
   */
  getSurfaceGeometry(
    overrideParams?: Partial<SPHSurfaceExtractorConfig>,
  ): THREE.BufferGeometry {
    return this.surfaceExtractor.extractSurface(this.particles, overrideParams);
  }

  /**
   * Get the underlying SPHSurfaceExtractor for advanced configuration.
   */
  getSurfaceExtractor(): SPHSurfaceExtractor {
    return this.surfaceExtractor;
  }
}

export default FluidDynamics;
