/**
 * VerletCloth — P5.5: Verlet Cloth Simulation
 *
 * Implements cloth simulation using position-based dynamics (Verlet integration)
 * designed for use within R3F's useFrame hooks. Supports pin constraints
 * for curtain rods and flag poles, wind force integration with the existing
 * WindAnimationSystem, and rendering as a Mesh with updated vertex positions.
 *
 * Phase 5 — P5.5: Verlet Cloth Simulation
 *
 * @module sim/cloth
 */

import { Vector3, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, DoubleSide } from 'three';
import type { WindAnimationSystem, AnimationConfig } from '../../assets/animation/motion/WindAnimationSystem';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for Verlet cloth simulation.
 */
export interface VerletClothConfig {
  /** Width of the cloth in world units (default: 2) */
  width: number;
  /** Height of the cloth in world units (default: 2) */
  height: number;
  /** Number of horizontal segments (default: 20) */
  segmentsX: number;
  /** Number of vertical segments (default: 20) */
  segmentsY: number;
  /** Mass per particle (default: 0.1) */
  mass: number;
  /** Constraint stiffness 0-1 (default: 0.9) */
  stiffness: number;
  /** Velocity damping per frame 0-1 (default: 0.98) */
  damping: number;
  /** Stretch threshold beyond which constraints break (default: 2.5) */
  tearThreshold: number;
  /** Whether to allow tearing when stretched beyond threshold (default: false) */
  enableTearing: boolean;
  /** Number of constraint solver iterations per substep (default: 5) */
  solverIterations: number;
  /** Number of substeps per frame (default: 5) */
  substeps: number;
  /** Gravity vector (default: [0, -9.81, 0]) */
  gravity: [number, number, number];
  /** Orientation of the cloth plane (default: 'xy') */
  orientation: 'xy' | 'xz' | 'yz';
  /** Pin mode: which edge(s) to pin (default: 'top') */
  pinMode: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'corners' | 'custom';
  /** Custom pin indices (used when pinMode is 'custom') */
  customPins?: number[];
}

/**
 * A single particle in the cloth grid.
 */
export interface VerletParticle {
  /** Current position */
  position: Vector3;
  /** Previous position (for Verlet integration) */
  previousPosition: Vector3;
  /** Original rest position */
  restPosition: Vector3;
  /** Accumulated acceleration for this frame */
  acceleration: Vector3;
  /** Inverse mass (0 = pinned/immovable) */
  inverseMass: number;
  /** Whether this particle is pinned */
  pinned: boolean;
}

/**
 * A distance constraint between two particles.
 */
export interface VerletConstraint {
  /** Index of particle A */
  particleA: number;
  /** Index of particle B */
  particleB: number;
  /** Rest length of the constraint */
  restLength: number;
  /** Stiffness factor 0-1 */
  stiffness: number;
  /** Whether the constraint is still active (false if torn) */
  active: boolean;
}

/**
 * Pin constraint — anchors a particle at a fixed position.
 */
export interface PinConstraint {
  /** Particle index */
  particle: number;
  /** Fixed position */
  position: Vector3;
  /** Whether the pin is a "rod" type (allows rotation around the pin point) */
  isRod: boolean;
}

// ============================================================================
// Default configuration
// ============================================================================

const DEFAULT_CONFIG: VerletClothConfig = {
  width: 2,
  height: 2,
  segmentsX: 20,
  segmentsY: 20,
  mass: 0.1,
  stiffness: 0.9,
  damping: 0.98,
  tearThreshold: 2.5,
  enableTearing: false,
  solverIterations: 5,
  substeps: 5,
  gravity: [0, -9.81, 0],
  orientation: 'xy',
  pinMode: 'top',
};

// ============================================================================
// VerletClothSimulation
// ============================================================================

/**
 * VerletClothSimulation — P5.5
 *
 * Position-based dynamics cloth simulation using Verlet integration.
 * Designed to be updated from an R3F `useFrame` hook:
 *
 * ```ts
 * const cloth = new VerletClothSimulation({ width: 4, height: 3 });
 * // In useFrame:
 * cloth.update(delta, windSystem);
 * mesh.geometry = cloth.getGeometry();
 * ```
 *
 * Features:
 * - Verlet integration with substep loop for stability
 * - Structural, shear, and bending constraints
 * - Pin constraints for curtain rods, flag poles
 * - Wind force integration with existing WindAnimationSystem
 * - Tearing support (constraints break beyond threshold)
 * - Render as Mesh with updated vertex positions per frame
 */
export class VerletClothSimulation {
  private config: VerletClothConfig;
  private particles: VerletParticle[] = [];
  private constraints: VerletConstraint[] = [];
  private pins: PinConstraint[] = [];
  private geometry: BufferGeometry;
  private mesh: Mesh;
  private gravity: Vector3;
  private windSystem: WindAnimationSystem | null = null;
  private windConfig: AnimationConfig | null = null;
  private externalWind: Vector3 = new Vector3(0, 0, 0);
  private enabled: boolean = true;
  private time: number = 0;

  constructor(config: Partial<VerletClothConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gravity = new Vector3(...this.config.gravity);

    this.initializeParticles();
    this.initializeConstraints();
    this.initializePins();
    this.geometry = this.createGeometry();
    this.mesh = this.createMesh();
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  /**
   * Create particles on a grid in the chosen orientation plane.
   */
  private initializeParticles(): void {
    const { width, height, segmentsX, segmentsY, mass } = this.config;
    const particles: VerletParticle[] = [];

    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        const u = x / segmentsX;
        const v = y / segmentsY;

        const px = (u - 0.5) * width;
        const py = (v - 0.5) * height;
        const pz = 0;

        // Determine pinned status based on pinMode
        const pinned = this.isPinned(x, y, segmentsX, segmentsY);

        const position = this.transformPosition(px, py, pz);

        particles.push({
          position: position.clone(),
          previousPosition: position.clone(),
          restPosition: position.clone(),
          acceleration: new Vector3(0, 0, 0),
          inverseMass: pinned ? 0 : 1 / mass,
          pinned,
        });
      }
    }

    this.particles = particles;
  }

  /**
   * Determine if a particle at (x, y) in the grid should be pinned.
   */
  private isPinned(x: number, y: number, segmentsX: number, segmentsY: number): boolean {
    const mode = this.config.pinMode;

    switch (mode) {
      case 'top':
        return y === 0;
      case 'bottom':
        return y === segmentsY;
      case 'left':
        return x === 0;
      case 'right':
        return x === segmentsX;
      case 'topLeft':
        return y === 0 && x === 0;
      case 'topRight':
        return y === 0 && x === segmentsX;
      case 'corners':
        return (y === 0 && x === 0) ||
               (y === 0 && x === segmentsX) ||
               (y === segmentsY && x === 0) ||
               (y === segmentsY && x === segmentsX);
      case 'custom':
        return this.config.customPins?.includes(y * (segmentsX + 1) + x) ?? false;
      case 'none':
      default:
        return false;
    }
  }

  /**
   * Transform position based on orientation plane.
   */
  private transformPosition(x: number, y: number, z: number): Vector3 {
    switch (this.config.orientation) {
      case 'xz':
        return new Vector3(x, z, y);
      case 'yz':
        return new Vector3(z, x, y);
      case 'xy':
      default:
        return new Vector3(x, y, z);
    }
  }

  /**
   * Initialize structural, shear, and bending constraints.
   */
  private initializeConstraints(): void {
    const { segmentsX, segmentsY, stiffness } = this.config;

    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        const idx = y * (segmentsX + 1) + x;

        // Structural: horizontal
        if (x < segmentsX) {
          const idxRight = y * (segmentsX + 1) + (x + 1);
          this.addConstraint(idx, idxRight, stiffness);
        }

        // Structural: vertical
        if (y < segmentsY) {
          const idxBelow = (y + 1) * (segmentsX + 1) + x;
          this.addConstraint(idx, idxBelow, stiffness);
        }

        // Shear: diagonal
        if (x < segmentsX && y < segmentsY) {
          const idxDiag = (y + 1) * (segmentsX + 1) + (x + 1);
          this.addConstraint(idx, idxDiag, stiffness * 0.5);
        }
        if (x > 0 && y < segmentsY) {
          const idxDiag = (y + 1) * (segmentsX + 1) + (x - 1);
          this.addConstraint(idx, idxDiag, stiffness * 0.5);
        }

        // Bending: skip one particle
        if (x < segmentsX - 1) {
          const idxSkip = y * (segmentsX + 1) + (x + 2);
          this.addConstraint(idx, idxSkip, stiffness * 0.25);
        }
        if (y < segmentsY - 1) {
          const idxSkip = (y + 2) * (segmentsX + 1) + x;
          this.addConstraint(idx, idxSkip, stiffness * 0.25);
        }
      }
    }
  }

  /**
   * Add a distance constraint between two particles.
   */
  private addConstraint(a: number, b: number, stiffness: number): void {
    const posA = this.particles[a].position;
    const posB = this.particles[b].position;
    const restLength = posA.distanceTo(posB);

    this.constraints.push({
      particleA: a,
      particleB: b,
      restLength,
      stiffness,
      active: true,
    });
  }

  /**
   * Initialize pin constraints from pinned particles.
   */
  private initializePins(): void {
    for (let i = 0; i < this.particles.length; i++) {
      if (this.particles[i].pinned) {
        this.pins.push({
          particle: i,
          position: this.particles[i].position.clone(),
          isRod: true, // Pin acts like a rod — particle can rotate around it
        });
      }
    }
  }

  /**
   * Create the BufferGeometry for rendering.
   */
  private createGeometry(): BufferGeometry {
    const { segmentsX, segmentsY } = this.config;
    const geometry = new BufferGeometry();

    // Positions
    const positions: number[] = [];
    for (const p of this.particles) {
      positions.push(p.position.x, p.position.y, p.position.z);
    }

    // UVs
    const uvs: number[] = [];
    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        uvs.push(x / segmentsX, y / segmentsY);
      }
    }

    // Indices
    const indices: number[] = [];
    for (let y = 0; y < segmentsY; y++) {
      for (let x = 0; x < segmentsX; x++) {
        const a = y * (segmentsX + 1) + x;
        const b = a + 1;
        const c = a + (segmentsX + 1);
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create the rendering Mesh.
   */
  private createMesh(): Mesh {
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      side: DoubleSide,
      roughness: 0.7,
      metalness: 0.1,
    });

    const mesh = new Mesh(this.geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'verlet-cloth';
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Simulation Step
  // --------------------------------------------------------------------------

  /**
   * Update the cloth simulation for one frame.
   *
   * Call this from an R3F `useFrame` hook:
   * ```ts
   * useFrame((_, delta) => {
   *   cloth.update(delta, windSystem);
   * });
   * ```
   *
   * @param dt          Delta time in seconds.
   * @param windSystem  Optional WindAnimationSystem for wind force integration.
   * @param windConfig  Optional AnimationConfig for wind response.
   */
  update(dt: number, windSystem?: WindAnimationSystem | null, windConfig?: AnimationConfig): void {
    if (!this.enabled) return;

    // Clamp delta time to prevent instability
    dt = Math.min(dt, 0.05);
    this.time += dt;

    // Store wind system reference
    if (windSystem) this.windSystem = windSystem;
    if (windConfig) this.windConfig = windConfig;

    const substeps = this.config.substeps;
    const subDt = dt / substeps;

    for (let step = 0; step < substeps; step++) {
      this.accumulateForces(subDt);
      this.integrateVerlet(subDt);
      this.satisfyConstraints();
      this.satisfyPins();
    }

    this.updateGeometry();
  }

  /**
   * Accumulate forces on all particles (gravity + wind).
   */
  private accumulateForces(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      if (particle.pinned) continue;

      // Reset acceleration
      particle.acceleration.set(0, 0, 0);

      // Gravity
      particle.acceleration.add(this.gravity);

      // Wind force from WindAnimationSystem
      if (this.windSystem) {
        const windForce = this.windSystem.getWindForce(
          particle.position,
          particle.position.y,
        );

        if (this.windConfig) {
          // Scale by flexibility and inverse mass
          const flexibility = this.windConfig.flexibility;
          const massFactor = 1 / (1 / particle.inverseMass);
          windForce.multiplyScalar(flexibility / massFactor);
        }

        particle.acceleration.add(windForce);
      }

      // External wind override
      if (this.externalWind.lengthSq() > 0) {
        particle.acceleration.add(this.externalWind);
      }
    }
  }

  /**
   * Verlet integration step.
   */
  private integrateVerlet(dt: number): void {
    const damping = this.config.damping;

    for (const particle of this.particles) {
      if (particle.pinned) continue;

      // Verlet integration: newPos = pos + (pos - prevPos) * damping + acc * dt^2
      const velocity = particle.position.clone()
        .sub(particle.previousPosition)
        .multiplyScalar(damping);

      const newPosition = particle.position.clone()
        .add(velocity)
        .add(particle.acceleration.clone().multiplyScalar(dt * dt));

      particle.previousPosition.copy(particle.position);
      particle.position.copy(newPosition);
    }
  }

  /**
   * Satisfy distance constraints using iterative relaxation.
   */
  private satisfyConstraints(): void {
    const iterations = this.config.solverIterations;

    for (let iter = 0; iter < iterations; iter++) {
      for (const constraint of this.constraints) {
        if (!constraint.active) continue;

        const pA = this.particles[constraint.particleA];
        const pB = this.particles[constraint.particleB];

        if (pA.pinned && pB.pinned) continue;

        const delta = pB.position.clone().sub(pA.position);
        const distance = delta.length();

        if (distance < 1e-8) continue;

        // Check for tearing
        if (this.config.enableTearing && distance > constraint.restLength * this.config.tearThreshold) {
          constraint.active = false;
          continue;
        }

        const diff = (distance - constraint.restLength) / distance;
        const correction = delta.multiplyScalar(diff * 0.5 * constraint.stiffness);

        if (!pA.pinned) {
          pA.position.add(correction);
        }
        if (!pB.pinned) {
          pB.position.sub(correction);
        }
      }
    }
  }

  /**
   * Enforce pin constraints — snap pinned particles to their anchor positions.
   */
  private satisfyPins(): void {
    for (const pin of this.pins) {
      const particle = this.particles[pin.particle];
      if (pin.isRod) {
        // Rod pin: particle stays at the pin position
        particle.position.copy(pin.position);
      } else {
        // Fixed pin: particle and its previous position both stay
        particle.previousPosition.copy(pin.position);
        particle.position.copy(pin.position);
      }
    }
  }

  /**
   * Update the BufferGeometry vertex positions and normals.
   */
  private updateGeometry(): void {
    const positions = this.geometry.getAttribute('position') as Float32BufferAttribute;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i].position;
      positions.setXYZ(i, p.x, p.y, p.z);
    }

    positions.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Get the rendering Mesh. Add this to your R3F scene.
   */
  getMesh(): Mesh {
    return this.mesh;
  }

  /**
   * Get the BufferGeometry (for manual rendering).
   */
  getGeometry(): BufferGeometry {
    return this.geometry;
  }

  /**
   * Set the gravity vector.
   */
  setGravity(gravity: Vector3): void {
    this.gravity.copy(gravity);
  }

  /**
   * Set an external wind force (in addition to any WindAnimationSystem).
   */
  setExternalWind(wind: Vector3): void {
    this.externalWind.copy(wind);
  }

  /**
   * Pin a specific particle at its current position.
   */
  pinParticle(index: number, isRod: boolean = true): void {
    if (index < 0 || index >= this.particles.length) return;

    this.particles[index].pinned = true;
    this.particles[index].inverseMass = 0;

    this.pins.push({
      particle: index,
      position: this.particles[index].position.clone(),
      isRod,
    });
  }

  /**
   * Pin a specific particle at a given world position.
   */
  pinParticleAt(index: number, position: Vector3, isRod: boolean = true): void {
    if (index < 0 || index >= this.particles.length) return;

    this.particles[index].pinned = true;
    this.particles[index].inverseMass = 0;
    this.particles[index].position.copy(position);
    this.particles[index].previousPosition.copy(position);

    this.pins.push({
      particle: index,
      position: position.clone(),
      isRod,
    });
  }

  /**
   * Unpin a specific particle, making it dynamic again.
   */
  unpinParticle(index: number): void {
    if (index < 0 || index >= this.particles.length) return;

    this.particles[index].pinned = false;
    this.particles[index].inverseMass = 1 / this.config.mass;

    // Remove from pins array
    const pinIdx = this.pins.findIndex(p => p.particle === index);
    if (pinIdx >= 0) {
      this.pins.splice(pinIdx, 1);
    }
  }

  /**
   * Move a pin to a new position (e.g., sliding a curtain rod).
   */
  movePin(index: number, newPosition: Vector3): void {
    const pin = this.pins.find(p => p.particle === index);
    if (pin) {
      pin.position.copy(newPosition);
    }
  }

  /**
   * Apply an impulse to a specific particle.
   */
  applyImpulse(index: number, impulse: Vector3): void {
    if (index < 0 || index >= this.particles.length) return;
    if (this.particles[index].pinned) return;

    // In Verlet, impulses are applied by adjusting the previous position
    const particle = this.particles[index];
    particle.previousPosition.sub(impulse);
  }

  /**
   * Reset all particles to their rest positions.
   */
  reset(): void {
    for (const particle of this.particles) {
      particle.position.copy(particle.restPosition);
      particle.previousPosition.copy(particle.restPosition);
      particle.acceleration.set(0, 0, 0);
    }

    // Reactivate all constraints
    for (const constraint of this.constraints) {
      constraint.active = true;
    }

    this.updateGeometry();
  }

  /**
   * Get the number of active (non-torn) constraints.
   */
  getActiveConstraintCount(): number {
    return this.constraints.filter(c => c.active).length;
  }

  /**
   * Get the total number of constraints (including torn).
   */
  getTotalConstraintCount(): number {
    return this.constraints.length;
  }

  /**
   * Get particle count.
   */
  getParticleCount(): number {
    return this.particles.length;
  }

  /**
   * Get the current center of mass of all non-pinned particles.
   */
  getCenterOfMass(): Vector3 {
    const center = new Vector3(0, 0, 0);
    let count = 0;

    for (const particle of this.particles) {
      if (!particle.pinned) {
        center.add(particle.position);
        count++;
      }
    }

    if (count > 0) center.divideScalar(count);
    return center;
  }

  /**
   * Get bounding box of all particles.
   */
  getBoundingBox(): { min: Vector3; max: Vector3 } {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);

    for (const particle of this.particles) {
      min.min(particle.position);
      max.max(particle.position);
    }

    return { min, max };
  }

  /**
   * Enable or disable the simulation.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Set the material for the cloth mesh.
   */
  setMaterial(material: MeshStandardMaterial): void {
    this.mesh.material = material;
  }

  /**
   * Clean up geometry and material resources.
   */
  dispose(): void {
    this.geometry.dispose();
    if (this.mesh.material instanceof MeshStandardMaterial) {
      this.mesh.material.dispose();
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Filename-matching alias for backward compat.
 * `import VerletCloth from './VerletCloth'` and `import { VerletCloth } from './VerletCloth'` both work.
 */
export { VerletClothSimulation as VerletCloth };
export default VerletClothSimulation;
