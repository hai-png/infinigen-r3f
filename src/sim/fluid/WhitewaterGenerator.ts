/**
 * Whitewater/Foam Generation System
 *
 * Generates whitewater particles (spray, foam, bubbles) from FLIP simulation data.
 * Detects high-velocity and high-vorticity regions as whitewater sources, then
 * simulates three types of whitewater particles with different physical behavior:
 *
 * - **Spray**: Small droplets above the surface with ballistic trajectories
 * - **Foam**: Surface-bound bubbles that drift with the flow
 * - **Bubbles**: Subsurface air pockets that rise due to buoyancy
 *
 * Integration with WhitewaterShader.ts:
 * - Foam → flat disc instances on surface (white, semi-transparent)
 * - Spray → small sphere instances above surface (white, metallic)
 * - Bubbles → subsurface sphere instances (bluish, refractive)
 *
 * Phase 2, Item 8: Fluid Scale and Materials
 *
 * @module sim/fluid
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import type { FLIPParticle, FLIPFluidSolver, FLIPGrid } from './FLIPFluidSolver';

// ─── Whitewater Types ───────────────────────────────────────────────────────────

/** Whitewater particle type classification */
export type WhitewaterType = 'spray' | 'foam' | 'bubble';

/** Configuration for whitewater generation */
export interface WhitewaterParams {
  /** Velocity magnitude threshold for spray generation (default 3.0 m/s) */
  sprayThreshold: number;
  /** Velocity magnitude threshold for foam generation (default 1.5 m/s) */
  foamThreshold: number;
  /** Vorticity threshold for bubble generation (default 5.0) */
  bubbleVorticityThreshold: number;
  /** Radius of bubble particles (default 0.02 m) */
  bubbleRadius: number;
  /** Foam particle lifetime in seconds (default 5.0) */
  foamLifetime: number;
  /** Spray particle lifetime in seconds (default 2.0) */
  sprayLifetime: number;
  /** Bubble particle lifetime in seconds (default 3.0) */
  bubbleLifetime: number;
  /** Maximum number of foam particles (default 5000) */
  maxFoamParticles: number;
  /** Maximum number of spray particles (default 3000) */
  maxSprayParticles: number;
  /** Maximum number of bubble particles (default 2000) */
  maxBubbleParticles: number;
  /** Gravity for spray particles (default -9.81) */
  gravity: number;
  /** Buoyancy acceleration for bubbles (default 2.0 m/s²) */
  bubbleBuoyancy: number;
  /** Drag coefficient for foam (default 0.95) */
  foamDrag: number;
  /** Drag coefficient for spray (default 0.99) */
  sprayDrag: number;
  /** Rate of whitewater generation per source particle per second (default 0.5) */
  generationRate: number;
  /** Wind effect on spray (default 0) */
  windSpeed: THREE.Vector3;
  /** Random seed for deterministic generation */
  seed: number;
}

/** A single whitewater particle */
export interface WhitewaterParticle {
  /** Unique identifier */
  id: number;
  /** Type of whitewater particle */
  type: WhitewaterType;
  /** World-space position */
  position: THREE.Vector3;
  /** World-space velocity */
  velocity: THREE.Vector3;
  /** Remaining lifetime in seconds */
  lifetime: number;
  /** Initial lifetime (for fade-out computation) */
  maxLifetime: number;
  /** Size/radius of the particle */
  size: number;
  /** Opacity (1.0 = fully visible, 0.0 = invisible) */
  opacity: number;
}

/** Collection of whitewater particles organized by type */
export interface WhitewaterParticles {
  /** All particles combined */
  all: WhitewaterParticle[];
  /** Foam particles only */
  foam: WhitewaterParticle[];
  /** Spray particles only */
  spray: WhitewaterParticle[];
  /** Bubble particles only */
  bubbles: WhitewaterParticle[];
}

/** Render-ready whitewater data for each type */
export interface WhitewaterRenderData {
  /** Instance matrices for foam (flat discs on surface) */
  foamMatrices: THREE.Matrix4[];
  /** Opacities for foam instances */
  foamOpacities: number[];
  /** Instance matrices for spray (small spheres above surface) */
  sprayMatrices: THREE.Matrix4[];
  /** Opacities for spray instances */
  sprayOpacities: number[];
  /** Instance matrices for bubbles (subsurface spheres) */
  bubbleMatrices: THREE.Matrix4[];
  /** Opacities for bubble instances */
  bubbleOpacities: number[];
}

// ─── Defaults ────────────────────────────────────────────────────────────────────

const DEFAULT_WHITEWATER_PARAMS: WhitewaterParams = {
  sprayThreshold: 3.0,
  foamThreshold: 1.5,
  bubbleVorticityThreshold: 5.0,
  bubbleRadius: 0.02,
  foamLifetime: 5.0,
  sprayLifetime: 2.0,
  bubbleLifetime: 3.0,
  maxFoamParticles: 5000,
  maxSprayParticles: 3000,
  maxBubbleParticles: 2000,
  gravity: -9.81,
  bubbleBuoyancy: 2.0,
  foamDrag: 0.95,
  sprayDrag: 0.99,
  generationRate: 0.5,
  windSpeed: new THREE.Vector3(0, 0, 0),
  seed: 42,
};

// ─── WhitewaterSystem ───────────────────────────────────────────────────────────

/**
 * Whitewater generation system for FLIP fluid simulation.
 *
 * Detects high-energy regions in the fluid and generates spray, foam,
 * and bubble particles with appropriate physics for each type.
 */
export class WhitewaterSystem {
  private params: WhitewaterParams;
  private rng: SeededRandom;

  // Active particles
  private foamParticles: WhitewaterParticle[] = [];
  private sprayParticles: WhitewaterParticle[] = [];
  private bubbleParticles: WhitewaterParticle[] = [];

  // Particle ID counter
  private nextId: number = 0;

  // Accumulator for generation timing
  private generationAccumulator: number = 0;

  // Temporary objects for matrix computation
  private dummy: THREE.Object3D;

  constructor(params: Partial<WhitewaterParams> = {}) {
    this.params = { ...DEFAULT_WHITEWATER_PARAMS, ...params };
    this.rng = new SeededRandom(this.params.seed);
    this.dummy = new THREE.Object3D();
  }

  // ── Generation ──────────────────────────────────────────────────────────

  /**
   * Generate whitewater particles from FLIP simulation data.
   *
   * @param flipSolver The FLIP solver providing fluid state
   * @param dt Time step in seconds
   * @returns All active whitewater particles organized by type
   */
  generateFromFLIP(flipSolver: FLIPFluidSolver, dt: number): WhitewaterParticles {
    const particles = flipSolver.getParticles();
    const grid = flipSolver.getGrid();

    this.generationAccumulator += dt;

    // Generate new whitewater at a rate controlled by generationRate
    const shouldGenerate = this.generationAccumulator >= 1.0 / this.params.generationRate;

    if (shouldGenerate) {
      this.generationAccumulator = 0;
      this.generateParticles(particles, grid);
    }

    // Update existing particles
    this.updateParticles(dt, flipSolver);

    return this.getAllParticles();
  }

  /**
   * Generate new whitewater particles from high-energy fluid regions.
   */
  private generateParticles(particles: FLIPParticle[], grid: FLIPGrid): void {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const speed = p.velocity.length();

      // Compute vorticity approximation from velocity gradient
      const vorticity = this.approximateVorticity(p, grid);

      // ── Spray: High velocity, above surface ──
      if (speed > this.params.sprayThreshold && this.sprayParticles.length < this.params.maxSprayParticles) {
        // Generate 1-3 spray particles
        const count = Math.min(3, this.params.maxSprayParticles - this.sprayParticles.length);
        for (let j = 0; j < count; j++) {
          const sprayParticle = this.createSprayParticle(p);
          this.sprayParticles.push(sprayParticle);
        }
      }

      // ── Foam: Moderate velocity, on surface ──
      if (speed > this.params.foamThreshold && this.foamParticles.length < this.params.maxFoamParticles) {
        // Generate foam proportional to velocity
        const foamCount = Math.min(2, this.params.maxFoamParticles - this.foamParticles.length);
        for (let j = 0; j < foamCount; j++) {
          const foamParticle = this.createFoamParticle(p);
          this.foamParticles.push(foamParticle);
        }
      }

      // ── Bubbles: High vorticity or impact zones ──
      if (vorticity > this.params.bubbleVorticityThreshold && this.bubbleParticles.length < this.params.maxBubbleParticles) {
        const bubbleCount = Math.min(2, this.params.maxBubbleParticles - this.bubbleParticles.length);
        for (let j = 0; j < bubbleCount; j++) {
          const bubbleParticle = this.createBubbleParticle(p);
          this.bubbleParticles.push(bubbleParticle);
        }
      }
    }
  }

  // ── Particle Creation ───────────────────────────────────────────────────

  private createSprayParticle(source: FLIPParticle): WhitewaterParticle {
    // Spray is ejected upward and outward from high-velocity areas
    const ejectSpeed = source.velocity.length() * this.rng.uniform(0.3, 0.7);
    const ejectAngle = this.rng.uniform(0.3, 1.2); // Radians from horizontal
    const ejectAzimuth = this.rng.uniform(0, Math.PI * 2);

    const vx = Math.cos(ejectAngle) * Math.cos(ejectAzimuth) * ejectSpeed;
    const vy = Math.sin(ejectAngle) * ejectSpeed;
    const vz = Math.cos(ejectAngle) * Math.sin(ejectAzimuth) * ejectSpeed;

    // Offset position slightly above the surface
    const offset = new THREE.Vector3(
      this.rng.uniform(-0.02, 0.02),
      this.rng.uniform(0.01, 0.05),
      this.rng.uniform(-0.02, 0.02),
    );

    return {
      id: this.nextId++,
      type: 'spray',
      position: source.position.clone().add(offset),
      velocity: new THREE.Vector3(vx, vy, vz),
      lifetime: this.params.sprayLifetime * this.rng.uniform(0.5, 1.0),
      maxLifetime: this.params.sprayLifetime,
      size: this.rng.uniform(0.005, 0.02),
      opacity: 1.0,
    };
  }

  private createFoamParticle(source: FLIPParticle): WhitewaterParticle {
    // Foam sits on the surface and drifts with the flow
    const offset = new THREE.Vector3(
      this.rng.uniform(-0.05, 0.05),
      this.rng.uniform(0, 0.02),
      this.rng.uniform(-0.05, 0.05),
    );

    // Foam velocity is a fraction of the fluid velocity
    const velFraction = this.rng.uniform(0.3, 0.8);

    return {
      id: this.nextId++,
      type: 'foam',
      position: source.position.clone().add(offset),
      velocity: source.velocity.clone().multiplyScalar(velFraction),
      lifetime: this.params.foamLifetime * this.rng.uniform(0.6, 1.0),
      maxLifetime: this.params.foamLifetime,
      size: this.rng.uniform(0.02, 0.06),
      opacity: 1.0,
    };
  }

  private createBubbleParticle(source: FLIPParticle): WhitewaterParticle {
    // Bubbles start subsurface and rise
    const offset = new THREE.Vector3(
      this.rng.uniform(-0.03, 0.03),
      this.rng.uniform(-0.1, -0.02), // Below surface
      this.rng.uniform(-0.03, 0.03),
    );

    return {
      id: this.nextId++,
      type: 'bubble',
      position: source.position.clone().add(offset),
      velocity: new THREE.Vector3(
        this.rng.uniform(-0.1, 0.1),
        this.params.bubbleBuoyancy,
        this.rng.uniform(-0.1, 0.1),
      ),
      lifetime: this.params.bubbleLifetime * this.rng.uniform(0.5, 1.0),
      maxLifetime: this.params.bubbleLifetime,
      size: this.rng.uniform(this.params.bubbleRadius * 0.5, this.params.bubbleRadius * 2),
      opacity: 0.7,
    };
  }

  // ── Particle Update ─────────────────────────────────────────────────────

  private updateParticles(dt: number, flipSolver: FLIPFluidSolver): void {
    // Update spray (ballistic trajectories)
    this.sprayParticles = this.sprayParticles.filter(p => {
      p.lifetime -= dt;
      if (p.lifetime <= 0) return false;

      // Gravity
      p.velocity.y += this.params.gravity * dt;

      // Wind
      p.velocity.add(this.params.windSpeed.clone().multiplyScalar(dt * 0.1));

      // Drag
      p.velocity.multiplyScalar(this.params.sprayDrag);

      // Advect
      p.position.add(p.velocity.clone().multiplyScalar(dt));

      // Fade out
      p.opacity = Math.min(1, p.lifetime / (p.maxLifetime * 0.3));

      return true;
    });

    // Update foam (surface advection)
    const fluidVel = new THREE.Vector3();
    this.foamParticles = this.foamParticles.filter(p => {
      p.lifetime -= dt;
      if (p.lifetime <= 0) return false;

      // Advect with fluid velocity (interpolated from grid)
      fluidVel.copy(flipSolver.getGrid().interpolateVelocity(p.position));
      p.velocity.lerp(fluidVel, 0.1); // Gradually match fluid velocity
      p.velocity.multiplyScalar(this.params.foamDrag);

      // Advect
      p.position.add(p.velocity.clone().multiplyScalar(dt));

      // Keep foam at or near surface (y ≈ 0 if no surface data)
      p.position.y = Math.max(0, p.position.y);

      // Fade out
      p.opacity = Math.min(1, p.lifetime / (p.maxLifetime * 0.3));

      return true;
    });

    // Update bubbles (buoyancy)
    this.bubbleParticles = this.bubbleParticles.filter(p => {
      p.lifetime -= dt;
      if (p.lifetime <= 0) return false;

      // Buoyancy (rise)
      p.velocity.y += this.params.bubbleBuoyancy * dt;

      // Drag
      p.velocity.multiplyScalar(0.98);

      // Slight horizontal drift with fluid
      fluidVel.copy(flipSolver.getGrid().interpolateVelocity(p.position));
      p.velocity.x += (fluidVel.x - p.velocity.x) * 0.05;
      p.velocity.z += (fluidVel.z - p.velocity.z) * 0.05;

      // Advect
      p.position.add(p.velocity.clone().multiplyScalar(dt));

      // Bubbles pop at surface
      if (p.position.y > 0.05) return false;

      // Fade out
      p.opacity = 0.7 * Math.min(1, p.lifetime / (p.maxLifetime * 0.3));

      return true;
    });
  }

  // ── Vorticity Approximation ─────────────────────────────────────────────

  private approximateVorticity(particle: FLIPParticle, grid: FLIPGrid): number {
    // Approximate vorticity from velocity field
    // ω ≈ |∇ × v| ≈ |∂v_z/∂y - ∂v_y/∂z| + |∂v_x/∂z - ∂v_z/∂x| + |∂v_y/∂x - ∂v_x/∂y|
    const h = grid.cellSize;
    const pos = particle.position;

    // Sample velocity at nearby grid points
    const vC = grid.interpolateVelocity(pos);
    const vR = grid.interpolateVelocity(pos.clone().add(new THREE.Vector3(h, 0, 0)));
    const vL = grid.interpolateVelocity(pos.clone().add(new THREE.Vector3(-h, 0, 0)));
    const vU = grid.interpolateVelocity(pos.clone().add(new THREE.Vector3(0, h, 0)));
    const vD = grid.interpolateVelocity(pos.clone().add(new THREE.Vector3(0, -h, 0)));
    const vF = grid.interpolateVelocity(pos.clone().add(new THREE.Vector3(0, 0, h)));
    const vB = grid.interpolateVelocity(pos.clone().add(new THREE.Vector3(0, 0, -h)));

    const twoH = 2 * h;

    // Curl components
    const curlX = (vF.y - vB.y) / twoH - (vU.z - vD.z) / twoH;
    const curlY = (vR.z - vL.z) / twoH - (vF.x - vB.x) / twoH;
    const curlZ = (vU.x - vD.x) / twoH - (vR.y - vL.y) / twoH;

    return Math.sqrt(curlX * curlX + curlY * curlY + curlZ * curlZ);
  }

  // ── Render Data ─────────────────────────────────────────────────────────

  /**
   * Convert whitewater particles to render-ready instance data.
   * This creates matrices for InstancedMesh rendering.
   */
  getRenderData(): WhitewaterRenderData {
    const foamMatrices: THREE.Matrix4[] = [];
    const foamOpacities: number[] = [];
    const sprayMatrices: THREE.Matrix4[] = [];
    const sprayOpacities: number[] = [];
    const bubbleMatrices: THREE.Matrix4[] = [];
    const bubbleOpacities: number[] = [];

    // Foam: flat discs on surface
    for (const p of this.foamParticles) {
      this.dummy.position.copy(p.position);
      this.dummy.scale.set(p.size, p.size * 0.2, p.size); // Flat disc
      this.dummy.updateMatrix();
      foamMatrices.push(this.dummy.matrix.clone());
      foamOpacities.push(p.opacity);
    }

    // Spray: small spheres above surface
    for (const p of this.sprayParticles) {
      this.dummy.position.copy(p.position);
      this.dummy.scale.setScalar(p.size);
      this.dummy.updateMatrix();
      sprayMatrices.push(this.dummy.matrix.clone());
      sprayOpacities.push(p.opacity);
    }

    // Bubbles: subsurface spheres
    for (const p of this.bubbleParticles) {
      this.dummy.position.copy(p.position);
      this.dummy.scale.setScalar(p.size);
      this.dummy.updateMatrix();
      bubbleMatrices.push(this.dummy.matrix.clone());
      bubbleOpacities.push(p.opacity);
    }

    return {
      foamMatrices,
      foamOpacities,
      sprayMatrices,
      sprayOpacities,
      bubbleMatrices,
      bubbleOpacities,
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get all active whitewater particles */
  getAllParticles(): WhitewaterParticles {
    return {
      all: [...this.foamParticles, ...this.sprayParticles, ...this.bubbleParticles],
      foam: [...this.foamParticles],
      spray: [...this.sprayParticles],
      bubbles: [...this.bubbleParticles],
    };
  }

  /** Get particle counts */
  getParticleCounts(): { foam: number; spray: number; bubbles: number; total: number } {
    return {
      foam: this.foamParticles.length,
      spray: this.sprayParticles.length,
      bubbles: this.bubbleParticles.length,
      total: this.foamParticles.length + this.sprayParticles.length + this.bubbleParticles.length,
    };
  }

  /** Get the current parameters */
  getParams(): WhitewaterParams {
    return { ...this.params };
  }

  /** Reset all whitewater particles */
  reset(): void {
    this.foamParticles = [];
    this.sprayParticles = [];
    this.bubbleParticles = [];
    this.nextId = 0;
    this.generationAccumulator = 0;
  }

  /** Dispose resources */
  dispose(): void {
    this.reset();
  }
}

/**
 * Filename-matching alias for backward compat.
 * `import WhitewaterGenerator from './WhitewaterGenerator'` and
 * `import { WhitewaterGenerator } from './WhitewaterGenerator'` both work.
 */
export { WhitewaterSystem as WhitewaterGenerator };
export default WhitewaterSystem;
