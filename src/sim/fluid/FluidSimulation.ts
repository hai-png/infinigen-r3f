import * as THREE from 'three';
import { FluidSurfaceRenderer, FluidSurfaceRendererConfig } from './FluidSurfaceRenderer';

/**
 * Smoothed Particle Hydrodynamics (SPH) Fluid Simulation
 * Implements real-time fluid simulation using Lagrangian particles
 * with optional surface reconstruction via marching cubes.
 */

export interface FluidConfig {
  particleCount: number;
  particleMass: number;
  restDensity: number;
  gasConstant: number;
  viscosity: number;
  h: number; // Smoothing radius
  gravity: THREE.Vector3;
  /** Enable surface reconstruction via marching cubes (default false) */
  surfaceReconstruction: boolean;
  /** Grid resolution for surface reconstruction (8-64, default 32) */
  surfaceGridResolution: number;
  /** Material preset for the surface mesh (default 'river_water') */
  surfaceMaterialPreset: string;
  /** World-space padding around particle bounds for surface extraction (default 0.15) */
  surfaceBoundsPadding: number;
}

export interface FluidParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  density: number;
  pressure: number;
}

export class FluidSimulation {
  private particles: FluidParticle[] = [];
  private config: FluidConfig;
  private bounds: THREE.Box3;
  private geometry: THREE.BufferGeometry | null = null;
  private points: THREE.Points | null = null;
  private enabled: boolean = true;
  private spatialHash: Map<string, number[]> = new Map();

  // Surface reconstruction
  private surfaceRenderer: FluidSurfaceRenderer | null = null;
  private surfaceMesh: THREE.Mesh | null = null;
  private surfaceReconstruction: boolean;

  constructor(config: Partial<FluidConfig> = {}) {
    this.config = {
      particleCount: 500,
      particleMass: 0.1,
      restDensity: 1000,
      gasConstant: 2000,
      viscosity: 250,
      h: 0.1,
      gravity: new THREE.Vector3(0, -9.81, 0),
      surfaceReconstruction: false,
      surfaceGridResolution: 32,
      surfaceMaterialPreset: 'river_water',
      surfaceBoundsPadding: 0.15,
      ...config,
    };

    this.surfaceReconstruction = this.config.surfaceReconstruction;

    this.bounds = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1)
    );

    this.initializeParticles();
  }

  private initializeParticles(): void {
    const { particleCount, h } = this.config;
    
    // Initialize particles in a grid pattern
    const gridSize = Math.ceil(Math.cbrt(particleCount));
    const spacing = h * 0.5;
    
    let count = 0;
    for (let x = 0; x < gridSize && count < particleCount; x++) {
      for (let y = 0; y < gridSize && count < particleCount; y++) {
        for (let z = 0; z < gridSize && count < particleCount; z++) {
          const px = (x - gridSize / 2) * spacing;
          const py = (y - gridSize / 2) * spacing + 0.5;
          const pz = (z - gridSize / 2) * spacing;

          this.particles.push({
            position: new THREE.Vector3(px, py, pz),
            velocity: new THREE.Vector3(0, 0, 0),
            acceleration: new THREE.Vector3(0, 0, 0),
            density: 0,
            pressure: 0,
          });
          
          count++;
        }
      }
    }

    this.createVisualization();

    // Initialize surface renderer if enabled
    if (this.surfaceReconstruction) {
      this.initSurfaceRenderer();
    }
  }

  private createVisualization(): void {
    const { particleCount } = this.config;
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    // Initialize with blue color
    for (let i = 0; i < particleCount; i++) {
      colors[i * 3] = 0.2;
      colors[i * 3 + 1] = 0.4;
      colors[i * 3 + 2] = 0.9;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    });
    
    this.points = new THREE.Points(geometry, material);
    this.geometry = geometry;
  }

  /**
   * Initialize the surface renderer for marching cubes extraction.
   */
  private initSurfaceRenderer(): void {
    if (this.surfaceRenderer) return;

    const surfaceConfig: Partial<FluidSurfaceRendererConfig> = {
      gridResolution: this.config.surfaceGridResolution,
      smoothingRadius: this.config.h,
      particleMass: this.config.particleMass,
      restDensity: this.config.restDensity,
      boundsPadding: this.config.surfaceBoundsPadding,
      materialPreset: this.config.surfaceMaterialPreset,
    };

    this.surfaceRenderer = new FluidSurfaceRenderer(surfaceConfig);
    this.surfaceMesh = this.surfaceRenderer.getMesh();
    this.surfaceMesh.name = 'FluidSurface';

    // When surface reconstruction is on, make particles semi-transparent
    // so the surface mesh is visible
    if (this.points) {
      const mat = this.points.material as THREE.PointsMaterial;
      mat.opacity = 0.3;
    }
  }

  /**
   * Clean up the surface renderer.
   */
  private destroySurfaceRenderer(): void {
    if (this.surfaceRenderer) {
      this.surfaceRenderer.dispose();
      this.surfaceRenderer = null;
      this.surfaceMesh = null;
    }

    // Restore full particle opacity
    if (this.points) {
      const mat = this.points.material as THREE.PointsMaterial;
      mat.opacity = 0.8;
    }
  }

  public step(dt: number): void {
    if (!this.enabled || this.particles.length === 0) return;

    dt = Math.min(dt, 0.02);
    const substeps = 4;
    const subDt = dt / substeps;

    for (let step = 0; step < substeps; step++) {
      this.updateSpatialHash();
      this.computeDensityPressure();
      this.computeForces();
      this.integrate(subDt);
      this.handleBoundaries();
    }

    this.updateVisualization();

    // Update surface mesh if reconstruction is enabled
    if (this.surfaceReconstruction && this.surfaceRenderer) {
      this.updateSurfaceMesh();
    }
  }

  /**
   * Update the surface mesh from current particle positions.
   * Called automatically each step when surface reconstruction is enabled.
   */
  private updateSurfaceMesh(): void {
    if (!this.surfaceRenderer) return;

    // Extract particle positions
    const positions: THREE.Vector3[] = [];
    for (const p of this.particles) {
      positions.push(p.position);
    }

    this.surfaceRenderer.update(positions);
    this.surfaceMesh = this.surfaceRenderer.getMesh();
  }

  private hashPosition(pos: THREE.Vector3): string {
    const cellSize = this.config.h;
    const x = Math.floor(pos.x / cellSize);
    const y = Math.floor(pos.y / cellSize);
    const z = Math.floor(pos.z / cellSize);
    return `${x},${y},${z}`;
  }

  private updateSpatialHash(): void {
    this.spatialHash.clear();
    
    for (let i = 0; i < this.particles.length; i++) {
      const hash = this.hashPosition(this.particles[i].position);
      if (!this.spatialHash.has(hash)) {
        this.spatialHash.set(hash, []);
      }
      this.spatialHash.get(hash)!.push(i);
    }
  }

  private getNeighbors(particleIdx: number): number[] {
    const pos = this.particles[particleIdx].position;
    const neighbors: number[] = [];
    const cellSize = this.config.h;
    
    const cx = Math.floor(pos.x / cellSize);
    const cy = Math.floor(pos.y / cellSize);
    const cz = Math.floor(pos.z / cellSize);
    
    // Check 27 neighboring cells (3x3x3)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const hash = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = this.spatialHash.get(hash);
          if (cell) {
            neighbors.push(...cell);
          }
        }
      }
    }
    
    return neighbors;
  }

  private poly6Kernel(r: number): number {
    const { h } = this.config;
    if (r >= 0 && r <= h) {
      const factor = 315 / (64 * Math.PI * Math.pow(h, 9));
      return factor * Math.pow(h * h - r * r, 3);
    }
    return 0;
  }

  private spikyGradient(r: number): number {
    const { h } = this.config;
    if (r >= 0 && r <= h) {
      const factor = -45 / (Math.PI * Math.pow(h, 6));
      return factor * Math.pow(h - r, 2);
    }
    return 0;
  }

  private viscosityLaplacian(r: number): number {
    const { h } = this.config;
    if (r >= 0 && r <= h) {
      const factor = 45 / (Math.PI * Math.pow(h, 6));
      return factor * (h - r);
    }
    return 0;
  }

  private computeDensityPressure(): void {
    const { particleMass, restDensity, gasConstant } = this.config;
    
    for (let i = 0; i < this.particles.length; i++) {
      let density = 0;
      
      const neighbors = this.getNeighbors(i);
      for (const j of neighbors) {
        const r = this.particles[i].position.distanceTo(this.particles[j].position);
        density += particleMass * this.poly6Kernel(r);
      }
      
      this.particles[i].density = density;
      this.particles[i].pressure = gasConstant * (density - restDensity);
    }
  }

  private computeForces(): void {
    const { particleMass, viscosity, restDensity } = this.config;
    
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      const force = new THREE.Vector3(0, 0, 0);
      
      // Pressure force
      const pressureForce = new THREE.Vector3(0, 0, 0);
      const viscosityForce = new THREE.Vector3(0, 0, 0);
      
      const neighbors = this.getNeighbors(i);
      for (const j of neighbors) {
        if (i === j) continue;
        
        const neighbor = this.particles[j];
        const r = particle.position.distanceTo(neighbor.position);
        
        if (r < 0.001) continue;
        
        const dir = particle.position.clone().sub(neighbor.position).normalize();
        
        // Pressure force contribution
        const pressureTerm = (particle.pressure + neighbor.pressure) / (2 * neighbor.density);
        const spikyGrad = this.spikyGradient(r);
        pressureForce.add(dir.multiplyScalar(-particleMass * pressureTerm * spikyGrad));
        
        // Viscosity force contribution
        const viscTerm = this.viscosityLaplacian(r);
        viscosityForce.add(neighbor.velocity.clone().sub(particle.velocity).multiplyScalar(viscTerm / neighbor.density));
      }
      
      viscosityForce.multiplyScalar(viscosity * particleMass);
      
      // Add gravity
      force.add(this.config.gravity.clone().multiplyScalar(particleMass));
      force.add(pressureForce);
      force.add(viscosityForce);
      
      particle.acceleration.copy(force.divideScalar(particleMass));
    }
  }

  private integrate(dt: number): void {
    for (const particle of this.particles) {
      // Update velocity
      particle.velocity.add(particle.acceleration.clone().multiplyScalar(dt));
      
      // Update position
      particle.position.add(particle.velocity.clone().multiplyScalar(dt));
    }
  }

  private handleBoundaries(): void {
    const { bounds } = this;
    const damping = 0.3;
    
    for (const particle of this.particles) {
      // X boundaries
      if (particle.position.x < bounds.min.x) {
        particle.position.x = bounds.min.x;
        particle.velocity.x *= -damping;
      } else if (particle.position.x > bounds.max.x) {
        particle.position.x = bounds.max.x;
        particle.velocity.x *= -damping;
      }
      
      // Y boundaries
      if (particle.position.y < bounds.min.y) {
        particle.position.y = bounds.min.y;
        particle.velocity.y *= -damping;
      } else if (particle.position.y > bounds.max.y) {
        particle.position.y = bounds.max.y;
        particle.velocity.y *= -damping;
      }
      
      // Z boundaries
      if (particle.position.z < bounds.min.z) {
        particle.position.z = bounds.min.z;
        particle.velocity.z *= -damping;
      } else if (particle.position.z > bounds.max.z) {
        particle.position.z = bounds.max.z;
        particle.velocity.z *= -damping;
      }
    }
  }

  private updateVisualization(): void {
    if (!this.geometry) return;
    
    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
    }
    
    positions.needsUpdate = true;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  public getPoints(): THREE.Points | null {
    return this.points;
  }

  /**
   * Get the surface mesh (water surface from marching cubes).
   * Returns null if surface reconstruction is not enabled.
   */
  public getSurfaceMesh(): THREE.Mesh | null {
    return this.surfaceMesh;
  }

  /**
   * Get the FluidSurfaceRenderer instance.
   * Returns null if surface reconstruction is not enabled.
   */
  public getSurfaceRenderer(): FluidSurfaceRenderer | null {
    return this.surfaceRenderer;
  }

  /**
   * Enable or disable surface reconstruction.
   * When enabled, a water surface mesh is generated via marching cubes.
   * When disabled, only particle point sprites are shown.
   */
  public setSurfaceReconstruction(enabled: boolean): void {
    if (enabled === this.surfaceReconstruction) return;

    this.surfaceReconstruction = enabled;

    if (enabled) {
      this.initSurfaceRenderer();
      // Immediately update the surface
      this.updateSurfaceMesh();
    } else {
      this.destroySurfaceRenderer();
    }
  }

  /**
   * Check if surface reconstruction is currently enabled.
   */
  public isSurfaceReconstructionEnabled(): boolean {
    return this.surfaceReconstruction;
  }

  /**
   * Set the grid resolution for surface reconstruction.
   * Valid range: 8–64. Higher = better quality, lower FPS.
   * Default: 32 for real-time, up to 64 for quality.
   */
  public setSurfaceGridResolution(res: number): void {
    this.config.surfaceGridResolution = Math.max(8, Math.min(64, res));
    if (this.surfaceRenderer) {
      this.surfaceRenderer.setGridResolution(this.config.surfaceGridResolution);
    }
  }

  /**
   * Get the current surface grid resolution.
   */
  public getSurfaceGridResolution(): number {
    return this.config.surfaceGridResolution;
  }

  /**
   * Set the rest density threshold for the isosurface.
   * Lower values create a larger surface, higher values create a tighter surface.
   */
  public setRestDensity(density: number): void {
    this.config.restDensity = density;
    if (this.surfaceRenderer) {
      this.surfaceRenderer.setRestDensity(density);
    }
  }

  /**
   * Set the material preset for the surface mesh.
   * Common presets: 'river_water', 'waterfall', 'whitewater'
   * This takes effect on next surface renderer creation.
   */
  public setSurfaceMaterialPreset(preset: string): void {
    this.config.surfaceMaterialPreset = preset;
    // Need to recreate the renderer for new material
    if (this.surfaceReconstruction) {
      this.destroySurfaceRenderer();
      this.initSurfaceRenderer();
      this.updateSurfaceMesh();
    }
  }

  /**
   * Get all particle positions as an array of Vector3.
   * Useful for external surface extraction or debugging.
   */
  public getParticlePositions(): THREE.Vector3[] {
    return this.particles.map(p => p.position);
  }

  /**
   * Get the number of active particles.
   */
  public getParticleCount(): number {
    return this.particles.length;
  }

  public addForce(position: THREE.Vector3, force: THREE.Vector3, radius: number = 0.2): void {
    for (const particle of this.particles) {
      const dist = particle.position.distanceTo(position);
      if (dist < radius) {
        const influence = 1 - dist / radius;
        particle.acceleration.add(force.clone().multiplyScalar(influence));
      }
    }
  }

  public reset(): void {
    this.particles = [];
    this.destroySurfaceRenderer();
    this.initializeParticles();
  }

  public setGravity(gravity: THREE.Vector3): void {
    this.config.gravity.copy(gravity);
  }

  /**
   * Set the simulation bounds. Particles that leave this region are
   * reflected back inside.
   */
  public setBounds(bounds: THREE.Box3): void {
    this.bounds = bounds.clone();
  }

  /**
   * Get the simulation bounds.
   */
  public getBounds(): THREE.Box3 {
    return this.bounds.clone();
  }

  public dispose(): void {
    if (this.geometry) {
      this.geometry.dispose();
    }
    if (this.points) {
      (this.points.material as THREE.Material).dispose();
    }
    this.destroySurfaceRenderer();
  }
}

export default FluidSimulation;
