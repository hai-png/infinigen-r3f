/**
 * FLIP Surface Mesh Extraction
 *
 * Comprehensive surface extraction and rendering pipeline for the FLIP fluid solver.
 * Converts particle data into renderable triangle meshes using marching cubes
 * isosurface extraction on density fields computed from SPH kernels.
 *
 * Components:
 *   1. FluidParticle — extended particle with whitewater type classification
 *   2. SurfaceExtractionConfig — configurable extraction parameters
 *   3. FluidSurfaceExtractor — static surface extraction engine
 *   4. SPHKernels — Poly6, Spiky, Viscosity kernels (Müller et al. 2003)
 *   5. WhitewaterSystem — foam, spray, bubble generation
 *   6. WhitewaterConfig / WhitewaterParticles — whitewater data structures
 *   7. FluidObstacle — mesh-to-SDF voxelization for collision
 *   8. FluidInflowOutflow — boundary condition emitters/drains
 *   9. FluidSceneComposer — high-level scene presets (still water, beach, river)
 *  10. FluidScene — composed scene description
 *  11. FluidSurfaceRenderer — mesh creation and per-frame updates
 *  12. FLIPSurfaceExtractor — backward-compatible class wrapper
 *
 * The marching cubes implementation reuses lookup tables from
 * terrain/mesher/MarchingCubesLUTs.ts.
 *
 * @module FLIPSurfaceExtractor
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { EDGE_TABLE, TRIANGLE_TABLE, EDGE_VERTICES, CORNER_OFFSETS } from '../../terrain/mesher/MarchingCubesLUTs';
import type { FLIPParticle } from './FLIPFluidSolver';
import type { FLIPGrid } from './FLIPFluidSolver';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FluidParticle Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extended fluid particle with whitewater type classification.
 * Compatible with FLIPParticle from FLIPFluidSolver but adds
 * type field for foam/spray/bubble rendering.
 */
export interface FluidParticle {
  /** World-space position */
  position: THREE.Vector3;
  /** World-space velocity */
  velocity: THREE.Vector3;
  /** Local density (from SPH kernel or grid rasterization) */
  density: number;
  /** Particle classification for whitewater rendering */
  type: 'fluid' | 'foam' | 'spray' | 'bubble';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SurfaceExtractionConfig Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for surface extraction from fluid particle data.
 */
export interface SurfaceExtractionConfig {
  /** Extraction method */
  method: 'marching_cubes' | 'dual_contouring' | 'spherical';
  /** Smoothing amount: 0 = raw, 1 = maximally smoothed */
  smoothing: number;
  /** Voxel resolution per axis for marching cubes / dual contouring */
  resolution: number;
  /** Influence radius of each particle in the density field */
  particleRadius: number;
  /** Isosurface threshold for marching cubes extraction */
  isoLevel: number;
  /** World-space bounding box for the extraction region */
  bounds: THREE.Box3;
  /** Number of Laplacian smoothing iterations (derived from smoothing param) */
  smoothingIterations: number;
  /** Smoothing factor per iteration (derived from smoothing param) */
  smoothingFactor: number;
  /** World-space padding around particle bounds */
  boundsPadding: number;
  /** Use grid density field directly instead of computing from particles */
  useGridDensity: boolean;
}

/** Default surface extraction configuration */
export const DEFAULT_SURFACE_EXTRACTION_CONFIG: SurfaceExtractionConfig = {
  method: 'marching_cubes',
  smoothing: 0.3,
  resolution: 32,
  particleRadius: 0.1,
  isoLevel: 0.5,
  bounds: new THREE.Box3(
    new THREE.Vector3(-5, -5, -5),
    new THREE.Vector3(5, 5, 5),
  ),
  smoothingIterations: 2,
  smoothingFactor: 0.3,
  boundsPadding: 0.15,
  useGridDensity: false,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SPHKernels — Standard SPH Kernels (Müller et al. 2003)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard SPH kernel functions from Müller et al. 2003.
 *
 * - Poly6:  used for density estimation
 * - Spiky:  used for pressure gradient (gradient is negative & monotonic)
 * - Viscosity: used for viscosity Laplacian (smooth at center)
 *
 * All kernels are defined for radius r and smoothing length h,
 * returning 0 when r >= h.
 */
export class SPHKernels {
  /**
   * Poly6 kernel for density estimation.
   *
   * W_poly6(r, h) = (315 / 64πh⁹) · (h² − r²)³   for 0 ≤ r ≤ h
   *
   * Smooth, radially symmetric, fast to evaluate.
   */
  static poly6(r: number, h: number): number {
    if (r >= h || r < 0) return 0;
    const h2 = h * h;
    const diff = h2 - r * r;
    const coeff = 315 / (64 * Math.PI * Math.pow(h, 9));
    return coeff * diff * diff * diff;
  }

  /**
   * Spiky kernel gradient magnitude for pressure forces.
   *
   * ∇W_spiky(r, h) = −(45 / πh⁶) · (h − r)²   for 0 ≤ r ≤ h
   *
   * The gradient is negative and monotonically increasing toward the center,
   * which prevents particle clumping under pressure.
   */
  static spikyGradient(r: number, h: number): number {
    if (r >= h || r < 0) return 0;
    const coeff = -45 / (Math.PI * Math.pow(h, 6));
    return coeff * (h - r) * (h - r);
  }

  /**
   * Viscosity kernel Laplacian for viscous forces.
   *
   * ∇²W_visc(r, h) = (45 / πh⁶) · (h − r)   for 0 ≤ r ≤ h
   *
   * The Laplacian is smooth at r = 0 (no singularity), making
   * viscosity forces stable near the center.
   */
  static viscosityLaplacian(r: number, h: number): number {
    if (r >= h || r < 0) return 0;
    const coeff = 45 / (Math.PI * Math.pow(h, 6));
    return coeff * (h - r);
  }

  /**
   * Poly6 coefficient pre-computation for batch evaluation.
   * Returns the normalisation constant (315 / 64πh⁹).
   */
  static poly6Coefficient(h: number): number {
    return 315 / (64 * Math.PI * Math.pow(h, 9));
  }

  /**
   * Spiky gradient coefficient pre-computation.
   * Returns the magnitude constant (45 / πh⁶).
   */
  static spikyGradientCoefficient(h: number): number {
    return 45 / (Math.PI * Math.pow(h, 6));
  }

  /**
   * Viscosity Laplacian coefficient pre-computation.
   * Returns the constant (45 / πh⁶).
   */
  static viscosityCoefficient(h: number): number {
    return 45 / (Math.PI * Math.pow(h, 6));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. WhitewaterConfig Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for whitewater (foam, spray, bubble) generation.
 * Based on curvature, vorticity, and acceleration of the fluid surface.
 */
export interface WhitewaterConfig {
  /** Maximum foam particles */
  maxFoamParticles: number;
  /** Maximum spray particles */
  maxSprayParticles: number;
  /** Maximum bubble particles */
  maxBubbleParticles: number;
  /** High curvature → foam generation threshold */
  curvatureThreshold: number;
  /** High vorticity → spray generation threshold */
  vorticityThreshold: number;
  /** High acceleration → spray generation threshold */
  accelerationThreshold: number;
  /** How fast bubbles rise due to buoyancy (m/s²) */
  bubbleBuoyancy: number;
  /** Seconds before foam disappears */
  foamLifetime: number;
  /** Seconds before spray disappears */
  sprayLifetime: number;
  /** Seconds before bubbles disappear */
  bubbleLifetime: number;
  /** Random seed for deterministic generation */
  seed: number;
}

/** Default whitewater configuration */
export const DEFAULT_WHITEWATER_CONFIG: WhitewaterConfig = {
  maxFoamParticles: 5000,
  maxSprayParticles: 3000,
  maxBubbleParticles: 2000,
  curvatureThreshold: 0.5,
  vorticityThreshold: 5.0,
  accelerationThreshold: 3.0,
  bubbleBuoyancy: 2.0,
  foamLifetime: 5.0,
  sprayLifetime: 2.0,
  bubbleLifetime: 3.0,
  seed: 42,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. WhitewaterParticles Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Render-ready whitewater particle data.
 * Positions are stored as flat Float32Arrays of (x, y, z) triplets
 * for efficient GPU upload.
 */
export interface WhitewaterParticles {
  /** Foam positions as flat (x,y,z) triplets */
  foam: Float32Array;
  /** Spray positions as flat (x,y,z) triplets */
  spray: Float32Array;
  /** Bubble positions as flat (x,y,z) triplets */
  bubbles: Float32Array;
  /** Age-based opacity for foam particles (0 = invisible, 1 = full) */
  foamOpacities: Float32Array;
  /** Age-based opacity for spray particles */
  sprayOpacities: Float32Array;
  /** Age-based opacity for bubble particles */
  bubbleOpacities: Float32Array;
  /** Number of foam particles */
  foamCount: number;
  /** Number of spray particles */
  sprayCount: number;
  /** Number of bubble particles */
  bubbleCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. WhitewaterSystem Class
// ═══════════════════════════════════════════════════════════════════════════════

/** Internal whitewater particle for simulation */
interface InternalWhitewaterParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  opacity: number;
  size: number;
}

/**
 * Generates whitewater particles (foam, spray, bubbles) from fluid simulation data.
 *
 * Detection criteria:
 * - Foam:   high surface curvature → particles trapped on surface
 * - Spray:  high vorticity or acceleration → ballistic droplets above surface
 * - Bubbles: high pressure gradient below surface → rising air pockets
 *
 * All generation is deterministic via SeededRandom.
 */
export class WhitewaterSystem {
  private config: WhitewaterConfig;
  private rng: SeededRandom;

  // Active particles
  private foamParticles: InternalWhitewaterParticle[] = [];
  private sprayParticles: InternalWhitewaterParticle[] = [];
  private bubbleParticles: InternalWhitewaterParticle[] = [];

  // Previous particle accelerations (for acceleration-based spray)
  private prevVelocities: Map<number, THREE.Vector3> = new Map();

  constructor(config: Partial<WhitewaterConfig> = {}) {
    this.config = { ...DEFAULT_WHITEWATER_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Generate whitewater particles from fluid simulation data.
   * Based on curvature, vorticity, and acceleration of fluid.
   *
   * @param particles Current fluid particles with position, velocity, density
   * @param dt        Time step in seconds
   * @returns         WhitewaterParticles with flat position arrays and opacities
   */
  static generateWhitewater(
    particles: FluidParticle[],
    config: WhitewaterConfig,
  ): WhitewaterParticles {
    const system = new WhitewaterSystem(config);
    return system.generate(particles, 1 / 60);
  }

  /**
   * Instance method for incremental whitewater generation.
   * Call each frame with the current particle state.
   */
  generate(particles: FluidParticle[], dt: number): WhitewaterParticles {
    this.updateExistingParticles(dt, particles);

    // Generate new whitewater from fluid state
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const speed = p.velocity.length();

      // Approximate curvature from density gradient
      const curvature = this.approximateCurvature(p);

      // Approximate vorticity from velocity field
      const vorticity = this.approximateVorticity(p);

      // Compute acceleration from velocity change
      const acceleration = this.computeAcceleration(i, p.velocity);

      // ── Foam: high curvature ──
      if (curvature > this.config.curvatureThreshold &&
          this.foamParticles.length < this.config.maxFoamParticles) {
        const count = Math.min(2, this.config.maxFoamParticles - this.foamParticles.length);
        for (let j = 0; j < count; j++) {
          this.foamParticles.push(this.createFoamParticle(p));
        }
      }

      // ── Spray: high vorticity or acceleration ──
      if ((vorticity > this.config.vorticityThreshold ||
           acceleration > this.config.accelerationThreshold) &&
          speed > 1.0 &&
          this.sprayParticles.length < this.config.maxSprayParticles) {
        const count = Math.min(3, this.config.maxSprayParticles - this.sprayParticles.length);
        for (let j = 0; j < count; j++) {
          this.sprayParticles.push(this.createSprayParticle(p));
        }
      }

      // ── Bubbles: subsurface, high pressure areas ──
      if (p.density > 500 && p.position.y < 0 &&
          this.bubbleParticles.length < this.config.maxBubbleParticles) {
        const count = Math.min(2, this.config.maxBubbleParticles - this.bubbleParticles.length);
        for (let j = 0; j < count; j++) {
          this.bubbleParticles.push(this.createBubbleParticle(p));
        }
      }
    }

    return this.packWhitewaterParticles();
  }

  // ── Particle creation ──────────────────────────────────────────────────

  private createFoamParticle(source: FluidParticle): InternalWhitewaterParticle {
    const offset = new THREE.Vector3(
      this.rng.uniform(-0.05, 0.05),
      this.rng.uniform(0, 0.02),
      this.rng.uniform(-0.05, 0.05),
    );
    const velFraction = this.rng.uniform(0.3, 0.8);
    return {
      position: source.position.clone().add(offset),
      velocity: source.velocity.clone().multiplyScalar(velFraction),
      lifetime: this.config.foamLifetime * this.rng.uniform(0.6, 1.0),
      maxLifetime: this.config.foamLifetime,
      opacity: 1.0,
      size: this.rng.uniform(0.02, 0.06),
    };
  }

  private createSprayParticle(source: FluidParticle): InternalWhitewaterParticle {
    const ejectSpeed = source.velocity.length() * this.rng.uniform(0.3, 0.7);
    const ejectAngle = this.rng.uniform(0.3, 1.2);
    const ejectAzimuth = this.rng.uniform(0, Math.PI * 2);
    const vx = Math.cos(ejectAngle) * Math.cos(ejectAzimuth) * ejectSpeed;
    const vy = Math.sin(ejectAngle) * ejectSpeed;
    const vz = Math.cos(ejectAngle) * Math.sin(ejectAzimuth) * ejectSpeed;

    const offset = new THREE.Vector3(
      this.rng.uniform(-0.02, 0.02),
      this.rng.uniform(0.01, 0.05),
      this.rng.uniform(-0.02, 0.02),
    );

    return {
      position: source.position.clone().add(offset),
      velocity: new THREE.Vector3(vx, vy, vz),
      lifetime: this.config.sprayLifetime * this.rng.uniform(0.5, 1.0),
      maxLifetime: this.config.sprayLifetime,
      opacity: 1.0,
      size: this.rng.uniform(0.005, 0.02),
    };
  }

  private createBubbleParticle(source: FluidParticle): InternalWhitewaterParticle {
    const offset = new THREE.Vector3(
      this.rng.uniform(-0.03, 0.03),
      this.rng.uniform(-0.1, -0.02),
      this.rng.uniform(-0.03, 0.03),
    );

    return {
      position: source.position.clone().add(offset),
      velocity: new THREE.Vector3(
        this.rng.uniform(-0.1, 0.1),
        this.config.bubbleBuoyancy,
        this.rng.uniform(-0.1, 0.1),
      ),
      lifetime: this.config.bubbleLifetime * this.rng.uniform(0.5, 1.0),
      maxLifetime: this.config.bubbleLifetime,
      opacity: 0.7,
      size: this.rng.uniform(0.01, 0.04),
    };
  }

  // ── Particle update ────────────────────────────────────────────────────

  private updateExistingParticles(dt: number, _fluidParticles: FluidParticle[]): void {
    const gravity = -9.81;

    // Update spray (ballistic)
    this.sprayParticles = this.sprayParticles.filter(p => {
      p.lifetime -= dt;
      if (p.lifetime <= 0) return false;
      p.velocity.y += gravity * dt;
      p.velocity.multiplyScalar(0.99); // drag
      p.position.addScaledVector(p.velocity, dt);
      p.opacity = Math.min(1, p.lifetime / (p.maxLifetime * 0.3));
      return true;
    });

    // Update foam (surface drift)
    this.foamParticles = this.foamParticles.filter(p => {
      p.lifetime -= dt;
      if (p.lifetime <= 0) return false;
      p.velocity.multiplyScalar(0.95); // drag
      p.position.addScaledVector(p.velocity, dt);
      p.position.y = Math.max(0, p.position.y); // stay on surface
      p.opacity = Math.min(1, p.lifetime / (p.maxLifetime * 0.3));
      return true;
    });

    // Update bubbles (buoyancy)
    this.bubbleParticles = this.bubbleParticles.filter(p => {
      p.lifetime -= dt;
      if (p.lifetime <= 0) return false;
      p.velocity.y += this.config.bubbleBuoyancy * dt;
      p.velocity.multiplyScalar(0.98); // drag
      p.position.addScaledVector(p.velocity, dt);
      if (p.position.y > 0.05) return false; // pop at surface
      p.opacity = 0.7 * Math.min(1, p.lifetime / (p.maxLifetime * 0.3));
      return true;
    });
  }

  // ── Approximation helpers ──────────────────────────────────────────────

  private approximateCurvature(_particle: FluidParticle): number {
    // Approximate curvature from local density variation.
    // Higher density gradient → higher curvature.
    // For a full implementation this would sample nearby particles.
    return Math.abs(_particle.density - 1000) / 1000;
  }

  private approximateVorticity(particle: FluidParticle): number {
    // Approximate vorticity from velocity magnitude as proxy.
    // A full implementation would compute curl of velocity field.
    return particle.velocity.length() * 0.5;
  }

  private computeAcceleration(id: number, currentVelocity: THREE.Vector3): number {
    const prevVel = this.prevVelocities.get(id);
    this.prevVelocities.set(id, currentVelocity.clone());

    if (!prevVel) return 0;
    const dv = currentVelocity.clone().sub(prevVel);
    return dv.length() * 60; // approximate acceleration (Δv * 1/dt at 60fps)
  }

  // ── Pack into output format ────────────────────────────────────────────

  private packWhitewaterParticles(): WhitewaterParticles {
    const foam = new Float32Array(this.foamParticles.length * 3);
    const foamOp = new Float32Array(this.foamParticles.length);
    for (let i = 0; i < this.foamParticles.length; i++) {
      foam[i * 3] = this.foamParticles[i].position.x;
      foam[i * 3 + 1] = this.foamParticles[i].position.y;
      foam[i * 3 + 2] = this.foamParticles[i].position.z;
      foamOp[i] = this.foamParticles[i].opacity;
    }

    const spray = new Float32Array(this.sprayParticles.length * 3);
    const sprayOp = new Float32Array(this.sprayParticles.length);
    for (let i = 0; i < this.sprayParticles.length; i++) {
      spray[i * 3] = this.sprayParticles[i].position.x;
      spray[i * 3 + 1] = this.sprayParticles[i].position.y;
      spray[i * 3 + 2] = this.sprayParticles[i].position.z;
      sprayOp[i] = this.sprayParticles[i].opacity;
    }

    const bubbles = new Float32Array(this.bubbleParticles.length * 3);
    const bubbleOp = new Float32Array(this.bubbleParticles.length);
    for (let i = 0; i < this.bubbleParticles.length; i++) {
      bubbles[i * 3] = this.bubbleParticles[i].position.x;
      bubbles[i * 3 + 1] = this.bubbleParticles[i].position.y;
      bubbles[i * 3 + 2] = this.bubbleParticles[i].position.z;
      bubbleOp[i] = this.bubbleParticles[i].opacity;
    }

    return {
      foam,
      spray,
      bubbles,
      foamOpacities: foamOp,
      sprayOpacities: sprayOp,
      bubbleOpacities: bubbleOp,
      foamCount: this.foamParticles.length,
      sprayCount: this.sprayParticles.length,
      bubbleCount: this.bubbleParticles.length,
    };
  }

  /** Reset all whitewater particles */
  reset(): void {
    this.foamParticles = [];
    this.sprayParticles = [];
    this.bubbleParticles = [];
    this.prevVelocities.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FluidObstacle Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles collision between fluid and scene obstacles.
 * Converts a THREE.Mesh into a voxelized signed distance field (SDF)
 * for efficient collision detection during fluid simulation.
 */
export class FluidObstacle {
  mesh: THREE.Mesh;
  sdf: Float32Array | null;
  velocity: THREE.Vector3;

  /** SDF grid resolution per axis */
  private sdfResolution: number;
  /** SDF grid bounds in world space */
  private sdfBounds: THREE.Box3;
  /** SDF voxel size */
  private sdfVoxelSize: THREE.Vector3;

  constructor(mesh: THREE.Mesh, velocity: THREE.Vector3 = new THREE.Vector3()) {
    this.mesh = mesh;
    this.sdf = null;
    this.velocity = velocity.clone();
    this.sdfResolution = 16;
    this.sdfBounds = new THREE.Box3();
    this.sdfVoxelSize = new THREE.Vector3();
  }

  /**
   * Voxelize mesh into SDF for fluid collision.
   * Uses distance-to-bounding-box as a fast approximation, with
   * raycasting refinement for more accurate SDF values near the surface.
   *
   * @param resolution Voxel resolution per axis (default 16)
   * @returns          Flat Float32Array of SDF values
   */
  voxelizeSDF(resolution: number = 16): Float32Array {
    this.sdfResolution = resolution;
    this.mesh.geometry.computeBoundingBox();
    const localBounds = this.mesh.geometry.boundingBox!;
    this.sdfBounds = localBounds.clone();

    // Apply mesh world transform to bounds
    this.mesh.updateMatrixWorld(true);
    this.sdfBounds.applyMatrix4(this.mesh.matrixWorld);

    // Add padding
    const padding = (this.sdfBounds.max.x - this.sdfBounds.min.x) * 0.1;
    this.sdfBounds.min.addScalar(-padding);
    this.sdfBounds.max.addScalar(padding);

    const size = new THREE.Vector3();
    this.sdfBounds.getSize(size);
    this.sdfVoxelSize.copy(size).divideScalar(resolution);

    const totalVoxels = resolution * resolution * resolution;
    this.sdf = new Float32Array(totalVoxels);

    // Raycaster for inside/outside testing
    const raycaster = new THREE.Raycaster();

    const bMin = this.sdfBounds.min;
    const dx = this.sdfVoxelSize.x;
    const dy = this.sdfVoxelSize.y;
    const dz = this.sdfVoxelSize.z;

    for (let iz = 0; iz < resolution; iz++) {
      for (let iy = 0; iy < resolution; iy++) {
        for (let ix = 0; ix < resolution; ix++) {
          const worldPos = new THREE.Vector3(
            bMin.x + (ix + 0.5) * dx,
            bMin.y + (iy + 0.5) * dy,
            bMin.z + (iz + 0.5) * dz,
          );

          // Compute SDF value using distance to bounding box as approximation
          // with raycasting to determine inside/outside
          let dist = this.computeDistanceToMesh(worldPos, raycaster);

          const idx = iz * resolution * resolution + iy * resolution + ix;
          this.sdf[idx] = dist;
        }
      }
    }

    return this.sdf;
  }

  /**
   * Check if a point is inside the obstacle.
   * Uses raycasting: if a ray from the point in any direction intersects
   * the mesh an odd number of times, the point is inside.
   */
  isInside(point: THREE.Vector3): boolean {
    return this.getSDF(point) < 0;
  }

  /**
   * Get SDF value at a point. Positive = outside, negative = inside.
   */
  getSDF(point: THREE.Vector3): number {
    if (!this.sdf) {
      // Fallback: use bounding box distance
      const box = new THREE.Box3().setFromObject(this.mesh);
      const closest = point.clone().clamp(box.min, box.max);
      const dist = point.distanceTo(closest);
      return box.containsPoint(point) ? -dist : dist;
    }

    // Convert world point to SDF grid coordinates
    const local = point.clone();
    const bMin = this.sdfBounds.min;
    const dx = this.sdfVoxelSize.x;
    const dy = this.sdfVoxelSize.y;
    const dz = this.sdfVoxelSize.z;

    const gx = (local.x - bMin.x) / dx - 0.5;
    const gy = (local.y - bMin.y) / dy - 0.5;
    const gz = (local.z - bMin.z) / dz - 0.5;

    // Trilinear interpolation of SDF
    const res = this.sdfResolution;
    const ix0 = Math.max(0, Math.min(res - 2, Math.floor(gx)));
    const iy0 = Math.max(0, Math.min(res - 2, Math.floor(gy)));
    const iz0 = Math.max(0, Math.min(res - 2, Math.floor(gz)));

    const fx = gx - ix0;
    const fy = gy - iy0;
    const fz = gz - iz0;

    const getVoxel = (ix: number, iy: number, iz: number): number => {
      if (ix < 0 || ix >= res || iy < 0 || iy >= res || iz < 0 || iz >= res) return 1;
      return this.sdf![iz * res * res + iy * res + ix];
    };

    // Trilinear interpolation
    const c000 = getVoxel(ix0, iy0, iz0);
    const c100 = getVoxel(ix0 + 1, iy0, iz0);
    const c010 = getVoxel(ix0, iy0 + 1, iz0);
    const c110 = getVoxel(ix0 + 1, iy0 + 1, iz0);
    const c001 = getVoxel(ix0, iy0, iz0 + 1);
    const c101 = getVoxel(ix0 + 1, iy0, iz0 + 1);
    const c011 = getVoxel(ix0, iy0 + 1, iz0 + 1);
    const c111 = getVoxel(ix0 + 1, iy0 + 1, iz0 + 1);

    const c00 = c000 * (1 - fx) + c100 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
  }

  /**
   * Compute distance from a point to the mesh surface.
   * Uses raycasting in multiple directions for inside/outside determination
   * and distance-to-bounding-box as the distance estimate.
   */
  private computeDistanceToMesh(point: THREE.Vector3, raycaster: THREE.Raycaster): number {
    // Cast ray in +X direction to count intersections
    raycaster.set(point, new THREE.Vector3(1, 0, 0));
    const intersections = raycaster.intersectObject(this.mesh, false);
    const isInside = intersections.length % 2 === 1;

    // Distance to bounding box as approximation
    const box = new THREE.Box3().setFromObject(this.mesh);
    const closest = point.clone().clamp(box.min, box.max);
    let dist = point.distanceTo(closest);

    // If inside, negate
    if (isInside) dist = -dist;

    return dist;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. FluidInflowOutflow Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inflow/outflow boundary conditions for the FLIP solver.
 * Inflow generates new particles; outflow removes them.
 */
export class FluidInflowOutflow {
  type: 'inflow' | 'outflow';
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  rate: number; // particles per second

  // Accumulator for particle generation timing
  private accumulator: number = 0;

  constructor(
    type: 'inflow' | 'outflow',
    position: THREE.Vector3,
    velocity: THREE.Vector3 = new THREE.Vector3(),
    radius: number = 0.5,
    rate: number = 100,
  ) {
    this.type = type;
    this.position = position.clone();
    this.velocity = velocity.clone();
    this.radius = radius;
    this.rate = rate;
  }

  /**
   * Generate new particles for inflow.
   * Particles are placed randomly within the inflow sphere.
   *
   * @param dt  Time step in seconds
   * @param rng Seeded random for deterministic placement
   * @returns   Array of FluidParticles (type: 'fluid')
   */
  generateParticles(dt: number, rng: SeededRandom): FluidParticle[] {
    if (this.type !== 'inflow') return [];

    this.accumulator += dt * this.rate;
    const count = Math.floor(this.accumulator);
    if (count <= 0) return [];
    this.accumulator -= count;

    const particles: FluidParticle[] = [];
    for (let i = 0; i < count; i++) {
      // Random point within sphere of radius
      const theta = rng.uniform(0, 2 * Math.PI);
      const phi = Math.acos(rng.uniform(-1, 1));
      const r = this.radius * Math.cbrt(rng.uniform(0, 1));

      const px = this.position.x + r * Math.sin(phi) * Math.cos(theta);
      const py = this.position.y + r * Math.sin(phi) * Math.sin(theta);
      const pz = this.position.z + r * Math.cos(phi);

      particles.push({
        position: new THREE.Vector3(px, py, pz),
        velocity: this.velocity.clone(),
        density: 1000,
        type: 'fluid',
      });
    }

    return particles;
  }

  /**
   * Check if a particle should be removed (outflow).
   * Particles within the outflow radius are removed.
   */
  shouldRemove(particlePosition: THREE.Vector3): boolean {
    if (this.type !== 'outflow') return false;
    return particlePosition.distanceTo(this.position) < this.radius;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. FluidScene Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Composed fluid scene description.
 * Contains all the elements needed for a complete fluid simulation setup.
 */
export interface FluidScene {
  /** Fluid particles (initial state) */
  particles: FluidParticle[];
  /** Scene obstacles with SDF collision */
  obstacles: FluidObstacle[];
  /** Inflow sources */
  inflows: FluidInflowOutflow[];
  /** Outflow drains */
  outflows: FluidInflowOutflow[];
  /** Simulation domain bounds */
  bounds: THREE.Box3;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Scene Configuration Interfaces
// ═══════════════════════════════════════════════════════════════════════════════

/** Still water scene configuration */
export interface StillWaterConfig {
  /** Water surface height (Y coordinate) */
  waterLevel: number;
  /** Domain size (width, depth, height) */
  domainSize: THREE.Vector3;
  /** Particle spacing */
  particleSpacing: number;
  /** Random seed */
  seed: number;
}

/** Beach scene configuration */
export interface BeachConfig {
  /** Beach width (X) */
  width: number;
  /** Beach depth (Z) */
  depth: number;
  /** Beach slope angle in radians */
  slopeAngle: number;
  /** Water level at deepest point */
  waterDepth: number;
  /** Particle spacing */
  particleSpacing: number;
  /** Wave amplitude */
  waveAmplitude: number;
  /** Random seed */
  seed: number;
}

/** River scene configuration */
export interface RiverConfig {
  /** River length (Z) */
  length: number;
  /** River width (X) */
  width: number;
  /** River depth (Y) */
  depth: number;
  /** Flow speed (m/s) */
  flowSpeed: number;
  /** Particle spacing */
  particleSpacing: number;
  /** Random seed */
  seed: number;
}

/** Tilted river scene configuration */
export interface TiltedRiverConfig {
  /** River length along slope */
  length: number;
  /** River width */
  width: number;
  /** River depth */
  depth: number;
  /** Slope angle in radians */
  slopeAngle: number;
  /** Particle spacing */
  particleSpacing: number;
  /** Random seed */
  seed: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. FluidSceneComposer Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * High-level scene composition matching original Infinigen's make_river(),
 * make_beach(), make_still_water() factories.
 *
 * Each static method creates a complete FluidScene with initial particles,
 * obstacles, inflows/outflows, and domain bounds.
 */
export class FluidSceneComposer {
  /**
   * Create a still water scene (calm lake / pool).
   * Particles fill a rectangular volume up to waterLevel.
   */
  static makeStillWater(config: StillWaterConfig): FluidScene {
    const rng = new SeededRandom(config.seed);
    const particles: FluidParticle[] = [];
    const spacing = config.particleSpacing;

    const sx = Math.max(1, Math.floor(config.domainSize.x / spacing));
    const sy = Math.max(1, Math.floor(config.waterLevel / spacing));
    const sz = Math.max(1, Math.floor(config.domainSize.z / spacing));

    for (let ix = 0; ix < sx; ix++) {
      for (let iy = 0; iy < sy; iy++) {
        for (let iz = 0; iz < sz; iz++) {
          const px = (ix + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);
          const py = (iy + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);
          const pz = (iz + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);

          particles.push({
            position: new THREE.Vector3(px, py, pz),
            velocity: new THREE.Vector3(0, 0, 0),
            density: 1000,
            type: 'fluid',
          });
        }
      }
    }

    const bounds = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      config.domainSize.clone(),
    );

    return {
      particles,
      obstacles: [],
      inflows: [],
      outflows: [],
      bounds,
    };
  }

  /**
   * Create a beach scene with sloped terrain and incoming waves.
   * Terrain obstacle is created as a sloped box mesh.
   */
  static makeBeach(config: BeachConfig): FluidScene {
    const rng = new SeededRandom(config.seed);
    const particles: FluidParticle[] = [];
    const spacing = config.particleSpacing;

    // Fill water volume (below water level, above sloped beach)
    const sx = Math.max(1, Math.floor(config.width / spacing));
    const sz = Math.max(1, Math.floor(config.depth / spacing));

    for (let ix = 0; ix < sx; ix++) {
      for (let iz = 0; iz < sz; iz++) {
        // Beach height at this Z position (slopes upward)
        const beachHeight = (iz / config.depth) * config.depth * Math.tan(config.slopeAngle);
        const waterHeight = Math.max(0, config.waterDepth - beachHeight);
        const sy = Math.max(0, Math.floor(waterHeight / spacing));

        for (let iy = 0; iy < sy; iy++) {
          const px = (ix + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);
          const py = beachHeight + (iy + 0.5) * spacing;
          const pz = (iz + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);

          // Small wave velocity
          const waveVx = config.waveAmplitude * Math.sin(pz * 2) * 0.5;

          particles.push({
            position: new THREE.Vector3(px, py, pz),
            velocity: new THREE.Vector3(waveVx, 0, 0),
            density: 1000,
            type: 'fluid',
          });
        }
      }
    }

    // Create beach terrain obstacle
    const beachGeo = new THREE.BoxGeometry(config.width, 0.5, config.depth);
    const beachMesh = new THREE.Mesh(beachGeo);
    // Tilt the beach mesh
    beachMesh.rotation.x = -config.slopeAngle;
    beachMesh.position.set(
      config.width / 2,
      -0.25,
      config.depth / 2,
    );
    beachMesh.updateMatrixWorld(true);

    const obstacle = new FluidObstacle(beachMesh);

    // Inflow at deep end
    const inflow = new FluidInflowOutflow(
      'inflow',
      new THREE.Vector3(config.width / 2, config.waterDepth * 0.5, 0.5),
      new THREE.Vector3(0, 0, 0.5),
      0.3,
      50,
    );

    const bounds = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(config.width, config.waterDepth * 2, config.depth),
    );

    return {
      particles,
      obstacles: [obstacle],
      inflows: [inflow],
      outflows: [],
      bounds,
    };
  }

  /**
   * Create a river scene with flowing water.
   * Particles fill a rectangular channel with flow velocity in +Z.
   */
  static makeRiver(config: RiverConfig): FluidScene {
    const rng = new SeededRandom(config.seed);
    const particles: FluidParticle[] = [];
    const spacing = config.particleSpacing;

    const sx = Math.max(1, Math.floor(config.width / spacing));
    const sy = Math.max(1, Math.floor(config.depth / spacing));
    const sz = Math.max(1, Math.floor(config.length / spacing));

    for (let ix = 0; ix < sx; ix++) {
      for (let iy = 0; iy < sy; iy++) {
        for (let iz = 0; iz < sz; iz++) {
          const px = (ix + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);
          const py = (iy + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);
          const pz = (iz + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);

          particles.push({
            position: new THREE.Vector3(px, py, pz),
            velocity: new THREE.Vector3(0, 0, config.flowSpeed),
            density: 1000,
            type: 'fluid',
          });
        }
      }
    }

    // Inflow at Z=0 end
    const inflow = new FluidInflowOutflow(
      'inflow',
      new THREE.Vector3(config.width / 2, config.depth / 2, 0.5),
      new THREE.Vector3(0, 0, config.flowSpeed),
      Math.max(config.width, config.depth) * 0.4,
      200,
    );

    // Outflow at Z=length end
    const outflow = new FluidInflowOutflow(
      'outflow',
      new THREE.Vector3(config.width / 2, config.depth / 2, config.length - 0.5),
      new THREE.Vector3(0, 0, config.flowSpeed),
      Math.max(config.width, config.depth) * 0.4,
      0,
    );

    const bounds = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(config.width, config.depth * 2, config.length),
    );

    return {
      particles,
      obstacles: [],
      inflows: [inflow],
      outflows: [outflow],
      bounds,
    };
  }

  /**
   * Create a tilted river scene flowing down a slope.
   * Gravity is adjusted to flow along the slope direction.
   */
  static makeTiltedRiver(config: TiltedRiverConfig): FluidScene {
    const rng = new SeededRandom(config.seed);
    const particles: FluidParticle[] = [];
    const spacing = config.particleSpacing;

    const sx = Math.max(1, Math.floor(config.width / spacing));
    const sy = Math.max(1, Math.floor(config.depth / spacing));
    const sz = Math.max(1, Math.floor(config.length / spacing));

    // Flow speed from slope
    const flowSpeed = Math.sqrt(2 * 9.81 * config.length * Math.sin(config.slopeAngle)) * 0.3;

    for (let ix = 0; ix < sx; ix++) {
      for (let iy = 0; iy < sy; iy++) {
        for (let iz = 0; iz < sz; iz++) {
          const px = (ix + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);
          const py = (iy + 0.5) * spacing + rng.uniform(-spacing * 0.1, spacing * 0.1);
          // Position along slope
          const slopeZ = (iz + 0.5) * spacing;
          const slopeY = slopeZ * Math.sin(config.slopeAngle);

          particles.push({
            position: new THREE.Vector3(px, slopeY + py, slopeZ * Math.cos(config.slopeAngle)),
            velocity: new THREE.Vector3(0, -flowSpeed * Math.sin(config.slopeAngle), flowSpeed * Math.cos(config.slopeAngle)),
            density: 1000,
            type: 'fluid',
          });
        }
      }
    }

    // Inflow at top of slope
    const inflow = new FluidInflowOutflow(
      'inflow',
      new THREE.Vector3(config.width / 2, config.depth / 2, 0.5),
      new THREE.Vector3(0, -flowSpeed * Math.sin(config.slopeAngle), flowSpeed * Math.cos(config.slopeAngle)),
      config.width * 0.4,
      200,
    );

    // Outflow at bottom of slope
    const outflow = new FluidInflowOutflow(
      'outflow',
      new THREE.Vector3(config.width / 2, 0, config.length - 0.5),
      new THREE.Vector3(0, 0, 0),
      config.width * 0.4,
      0,
    );

    const maxHeight = config.length * Math.sin(config.slopeAngle) + config.depth * 2;
    const bounds = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(config.width, maxHeight, config.length),
    );

    return {
      particles,
      obstacles: [],
      inflows: [inflow],
      outflows: [outflow],
      bounds,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. FluidSurfaceExtractor — Static Surface Extraction Engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main surface extraction engine. Provides static methods to:
 * 1. Build scalar field from particles using SPH kernels
 * 2. Extract isosurface via marching cubes
 * 3. Smooth the result
 */
export class FluidSurfaceExtractor {
  /**
   * Extract a surface mesh from fluid particle data.
   *
   * Implements the marching cubes approach:
   * 1. Create a scalar field from particle positions using SPH kernels
   * 2. Extract isosurface via marching cubes
   * 3. Smooth the result
   *
   * @param particles Fluid particles with positions
   * @param config    Surface extraction configuration
   * @returns         THREE.BufferGeometry with the extracted surface
   */
  static extractSurface(
    particles: FluidParticle[],
    config: SurfaceExtractionConfig,
  ): THREE.BufferGeometry {
    if (particles.length === 0) {
      return FluidSurfaceExtractor.createEmptyGeometry();
    }

    // 1. Build scalar field from particles
    const scalarField = FluidSurfaceExtractor.buildScalarField(particles, config);

    // 2. Extract isosurface
    let geometry: THREE.BufferGeometry;
    switch (config.method) {
      case 'marching_cubes':
        geometry = FluidSurfaceExtractor.marchingCubes(scalarField, config);
        break;
      case 'dual_contouring':
        // Dual contouring fallback to marching cubes for now
        geometry = FluidSurfaceExtractor.marchingCubes(scalarField, config);
        break;
      case 'spherical':
        geometry = FluidSurfaceExtractor.sphericalExtraction(particles, config);
        break;
      default:
        geometry = FluidSurfaceExtractor.marchingCubes(scalarField, config);
    }

    // 3. Apply Laplacian smoothing
    if (config.smoothingIterations > 0 && config.method !== 'spherical') {
      FluidSurfaceExtractor.applyLaplacianSmoothing(
        geometry,
        config.smoothingIterations,
        config.smoothingFactor,
      );
    }

    return geometry;
  }

  /**
   * Build scalar field from particles using SPH density estimation.
   * Uses the Poly6 kernel for smooth density evaluation.
   *
   * @param particles Fluid particles
   * @param config    Extraction config with resolution, particleRadius, bounds
   * @returns         Flat Float32Array of density values [z * res² + y * res + x]
   */
  static buildScalarField(
    particles: FluidParticle[],
    config: SurfaceExtractionConfig,
  ): Float32Array {
    const res = config.resolution;
    const field = new Float32Array(res * res * res);
    const h = config.particleRadius;
    const h2 = h * h;
    const coeff = SPHKernels.poly6Coefficient(h);

    // Compute actual bounds from particles if not explicitly set
    const bounds = config.bounds.clone();
    if (bounds.isEmpty()) {
      bounds.min.set(Infinity, Infinity, Infinity);
      bounds.max.set(-Infinity, -Infinity, -Infinity);
      for (const p of particles) {
        bounds.expandByPoint(p.position);
      }
      const pad = config.boundsPadding;
      bounds.min.addScalar(-pad);
      bounds.max.addScalar(pad);
    }

    const bMinX = bounds.min.x;
    const bMinY = bounds.min.y;
    const bMinZ = bounds.min.z;
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const dx = size.x / res;
    const dy = size.y / res;
    const dz = size.z / res;

    // Splat particle contributions onto nearby grid nodes
    for (let pi = 0; pi < particles.length; pi++) {
      const px = particles[pi].position.x;
      const py = particles[pi].position.y;
      const pz = particles[pi].position.z;

      const gxMin = Math.max(0, Math.floor((px - h - bMinX) / dx));
      const gyMin = Math.max(0, Math.floor((py - h - bMinY) / dy));
      const gzMin = Math.max(0, Math.floor((pz - h - bMinZ) / dz));
      const gxMax = Math.min(res - 1, Math.ceil((px + h - bMinX) / dx));
      const gyMax = Math.min(res - 1, Math.ceil((py + h - bMinY) / dy));
      const gzMax = Math.min(res - 1, Math.ceil((pz + h - bMinZ) / dz));

      for (let gz = gzMin; gz <= gzMax; gz++) {
        const gzOffset = gz * res * res;
        const gzWorld = bMinZ + (gz + 0.5) * dz;
        const rz = pz - gzWorld;
        const rz2 = rz * rz;

        for (let gy = gyMin; gy <= gyMax; gy++) {
          const gyOffset = gzOffset + gy * res;
          const gyWorld = bMinY + (gy + 0.5) * dy;
          const ry = py - gyWorld;
          const ry2 = ry * ry;

          if (ry2 + rz2 >= h2) continue;

          for (let gx = gxMin; gx <= gxMax; gx++) {
            const gxWorld = bMinX + (gx + 0.5) * dx;
            const rx = px - gxWorld;
            const r2 = rx * rx + ry2 + rz2;

            if (r2 < h2) {
              const diff = h2 - r2;
              field[gyOffset + gx] += coeff * diff * diff * diff;
            }
          }
        }
      }
    }

    return field;
  }

  // ── Marching Cubes ─────────────────────────────────────────────────────

  /**
   * Run marching cubes on a scalar field to extract an isosurface.
   */
  private static marchingCubes(
    field: Float32Array,
    config: SurfaceExtractionConfig,
  ): THREE.BufferGeometry {
    const res = config.resolution;
    const isolevel = config.isoLevel;

    const cellsX = res - 1;
    const cellsY = res - 1;
    const cellsZ = res - 1;

    if (cellsX <= 0 || cellsY <= 0 || cellsZ <= 0) {
      return FluidSurfaceExtractor.createEmptyGeometry();
    }

    const posArr: number[] = [];
    const normArr: number[] = [];

    // Compute bounds from config
    const bounds = config.bounds;
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const bMinX = bounds.min.x;
    const bMinY = bounds.min.y;
    const bMinZ = bounds.min.z;
    const dx = size.x / res;
    const dy = size.y / res;
    const dz = size.z / res;

    // Local helpers
    const getDensity = (gx: number, gy: number, gz: number): number => {
      if (gx < 0 || gx >= res || gy < 0 || gy >= res || gz < 0 || gz >= res) {
        return 0;
      }
      return field[gz * res * res + gy * res + gx];
    };

    const worldX = (gx: number) => bMinX + gx * dx;
    const worldY = (gy: number) => bMinY + gy * dy;
    const worldZ = (gz: number) => bMinZ + gz * dz;

    const _normalOut = [0, 1, 0];

    const computeNormal = (wx: number, wy: number, wz: number): void => {
      const gx0 = Math.round((wx - bMinX) / dx);
      const gy0 = Math.round((wy - bMinY) / dy);
      const gz0 = Math.round((wz - bMinZ) / dz);

      const ndx = getDensity(gx0 + 1, gy0, gz0) - getDensity(gx0 - 1, gy0, gz0);
      const ndy = getDensity(gx0, gy0 + 1, gz0) - getDensity(gx0, gy0 - 1, gz0);
      const ndz = getDensity(gx0, gy0, gz0 + 1) - getDensity(gx0, gy0, gz0 - 1);

      const len = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz);
      if (len < 1e-10) {
        _normalOut[0] = 0; _normalOut[1] = 1; _normalOut[2] = 0;
      } else {
        _normalOut[0] = ndx / len;
        _normalOut[1] = ndy / len;
        _normalOut[2] = ndz / len;
      }
    };

    // Per-cell edge caches (reused)
    const edgePos = new Float32Array(12 * 3);
    const edgeNorm = new Float32Array(12 * 3);
    const edgeComputed = new Uint8Array(12);

    // Main loop over cells
    for (let cz = 0; cz < cellsZ; cz++) {
      for (let cy = 0; cy < cellsY; cy++) {
        for (let cx = 0; cx < cellsX; cx++) {
          // 8 corner density values
          const cornerValues = [
            getDensity(cx, cy, cz),
            getDensity(cx + 1, cy, cz),
            getDensity(cx + 1, cy + 1, cz),
            getDensity(cx, cy + 1, cz),
            getDensity(cx, cy, cz + 1),
            getDensity(cx + 1, cy, cz + 1),
            getDensity(cx + 1, cy + 1, cz + 1),
            getDensity(cx, cy + 1, cz + 1),
          ];

          // Build case index
          let caseIndex = 0;
          for (let c = 0; c < 8; c++) {
            if (cornerValues[c] < isolevel) caseIndex |= (1 << c);
          }

          if (caseIndex === 0 || caseIndex === 255) continue;

          const edgeFlags = EDGE_TABLE[caseIndex];
          if (edgeFlags === 0) continue;

          // Compute edge intersection vertices & normals
          edgeComputed.fill(0);

          for (let edge = 0; edge < 12; edge++) {
            if ((edgeFlags & (1 << edge)) === 0) continue;

            const v0 = EDGE_VERTICES[edge * 2];
            const v1 = EDGE_VERTICES[edge * 2 + 1];

            const d0 = cornerValues[v0];
            const d1 = cornerValues[v1];
            const diff = d0 - d1;
            const t = Math.abs(diff) > 1e-10 ? (d0 - isolevel) / diff : 0.5;

            const p0x = worldX(cx + CORNER_OFFSETS[v0][0]);
            const p0y = worldY(cy + CORNER_OFFSETS[v0][1]);
            const p0z = worldZ(cz + CORNER_OFFSETS[v0][2]);
            const p1x = worldX(cx + CORNER_OFFSETS[v1][0]);
            const p1y = worldY(cy + CORNER_OFFSETS[v1][1]);
            const p1z = worldZ(cz + CORNER_OFFSETS[v1][2]);

            const ix = p0x + t * (p1x - p0x);
            const iy = p0y + t * (p1y - p0y);
            const iz = p0z + t * (p1z - p0z);

            const off = edge * 3;
            edgePos[off] = ix;
            edgePos[off + 1] = iy;
            edgePos[off + 2] = iz;

            computeNormal(ix, iy, iz);
            edgeNorm[off] = _normalOut[0];
            edgeNorm[off + 1] = _normalOut[1];
            edgeNorm[off + 2] = _normalOut[2];

            edgeComputed[edge] = 1;
          }

          // Generate triangles from lookup table
          const base = caseIndex * 16;
          for (let i = 0; i < 16; i += 3) {
            const e0 = TRIANGLE_TABLE[base + i];
            if (e0 === -1) break;

            const e1 = TRIANGLE_TABLE[base + i + 1];
            const e2 = TRIANGLE_TABLE[base + i + 2];

            for (const e of [e0, e1, e2]) {
              const off = e * 3;
              posArr.push(edgePos[off], edgePos[off + 1], edgePos[off + 2]);
              normArr.push(edgeNorm[off], edgeNorm[off + 1], edgeNorm[off + 2]);
            }
          }
        }
      }
    }

    return FluidSurfaceExtractor.buildGeometry(posArr, normArr);
  }

  // ── Spherical extraction (metaball-style) ──────────────────────────────

  /**
   * Simple spherical/metaball extraction for small particle counts.
   * Creates a smooth union of spheres around each particle position.
   * Falls back to marching cubes internally but with a simpler scalar field.
   */
  private static sphericalExtraction(
    particles: FluidParticle[],
    config: SurfaceExtractionConfig,
  ): THREE.BufferGeometry {
    // Build scalar field with simpler metaball function
    const res = config.resolution;
    const field = new Float32Array(res * res * res);
    const r = config.particleRadius;
    const r2 = r * r;

    const bounds = config.bounds.clone();
    if (bounds.isEmpty()) {
      bounds.min.set(Infinity, Infinity, Infinity);
      bounds.max.set(-Infinity, -Infinity, -Infinity);
      for (const p of particles) {
        bounds.expandByPoint(p.position);
      }
      bounds.min.addScalar(-config.boundsPadding);
      bounds.max.addScalar(config.boundsPadding);
    }

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const bMinX = bounds.min.x;
    const bMinY = bounds.min.y;
    const bMinZ = bounds.min.z;
    const dx = size.x / res;
    const dy = size.y / res;
    const dz = size.z / res;

    for (let pi = 0; pi < particles.length; pi++) {
      const px = particles[pi].position.x;
      const py = particles[pi].position.y;
      const pz = particles[pi].position.z;

      const gxMin = Math.max(0, Math.floor((px - r - bMinX) / dx));
      const gyMin = Math.max(0, Math.floor((py - r - bMinY) / dy));
      const gzMin = Math.max(0, Math.floor((pz - r - bMinZ) / dz));
      const gxMax = Math.min(res - 1, Math.ceil((px + r - bMinX) / dx));
      const gyMax = Math.min(res - 1, Math.ceil((py + r - bMinY) / dy));
      const gzMax = Math.min(res - 1, Math.ceil((pz + r - bMinZ) / dz));

      for (let gz = gzMin; gz <= gzMax; gz++) {
        const gzOffset = gz * res * res;
        const gzWorld = bMinZ + (gz + 0.5) * dz;
        const rz = pz - gzWorld;

        for (let gy = gyMin; gy <= gyMax; gy++) {
          const gyOffset = gzOffset + gy * res;
          const gyWorld = bMinY + (gy + 0.5) * dy;
          const ry = py - gyWorld;

          for (let gx = gxMin; gx <= gxMax; gx++) {
            const gxWorld = bMinX + (gx + 0.5) * dx;
            const rx = px - gxWorld;
            const r2dist = rx * rx + ry * ry + rz * rz;

            if (r2dist < r2 * 4) {
              // Metaball falloff: (1 - (r/R)²)²
              const normalized = r2dist / (r2 * 4);
              field[gyOffset + gx] += (1 - normalized) * (1 - normalized);
            }
          }
        }
      }
    }

    // Use marching cubes with metaball threshold
    const metaballConfig = { ...config, isoLevel: 0.5, bounds };
    return FluidSurfaceExtractor.marchingCubes(field, metaballConfig);
  }

  // ── Geometry helpers ───────────────────────────────────────────────────

  private static createEmptyGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
    return geo;
  }

  private static buildGeometry(positions: number[], normals: number[]): THREE.BufferGeometry {
    const vertCount = positions.length / 3;

    if (vertCount === 0) {
      return FluidSurfaceExtractor.createEmptyGeometry();
    }

    const geo = new THREE.BufferGeometry();
    const posArray = new Float32Array(positions);
    const normArray = new Float32Array(normals);

    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
    geo.computeBoundingSphere();

    return geo;
  }

  // ── Laplacian smoothing ────────────────────────────────────────────────

  /**
   * Apply Laplacian smoothing to the surface mesh.
   * Reduces high-frequency noise from marching cubes output.
   */
  private static applyLaplacianSmoothing(
    geometry: THREE.BufferGeometry,
    iterations: number,
    factor: number,
  ): void {
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr || posAttr.count < 3) return;

    const vertCount = posAttr.count;

    // Build vertex neighbor map from triangle connectivity
    const neighbors: Map<number, number[]> = new Map();
    for (let i = 0; i < vertCount; i++) {
      neighbors.set(i, []);
    }

    const triCount = Math.floor(vertCount / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3;
      const i1 = t * 3 + 1;
      const i2 = t * 3 + 2;

      neighbors.get(i0)!.push(i1, i2);
      neighbors.get(i1)!.push(i0, i2);
      neighbors.get(i2)!.push(i0, i1);
    }

    for (let iter = 0; iter < iterations; iter++) {
      const newPos = new Float32Array(vertCount * 3);

      for (let i = 0; i < vertCount; i++) {
        const nbrs = neighbors.get(i)!;
        if (nbrs.length === 0) {
          newPos[i * 3] = posAttr.getX(i);
          newPos[i * 3 + 1] = posAttr.getY(i);
          newPos[i * 3 + 2] = posAttr.getZ(i);
          continue;
        }

        let ax = 0, ay = 0, az = 0;
        for (const n of nbrs) {
          ax += posAttr.getX(n);
          ay += posAttr.getY(n);
          az += posAttr.getZ(n);
        }
        const count = nbrs.length;
        ax /= count;
        ay /= count;
        az /= count;

        const ox = posAttr.getX(i);
        const oy = posAttr.getY(i);
        const oz = posAttr.getZ(i);

        newPos[i * 3] = ox + factor * (ax - ox);
        newPos[i * 3 + 1] = oy + factor * (ay - oy);
        newPos[i * 3 + 2] = oz + factor * (az - oz);
      }

      const array = posAttr.array as Float32Array;
      for (let i = 0; i < vertCount * 3; i++) {
        array[i] = newPos[i];
      }
      posAttr.needsUpdate = true;
    }

    geometry.computeVertexNormals();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. FluidSurfaceRenderer — Mesh Creation and Per-Frame Updates
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders the extracted fluid surface with water-like materials.
 * Creates THREE.Mesh objects with MeshPhysicalMaterial featuring
 * transmission, IOR, and caustic-like effects for realistic water.
 */
export class FluidSurfaceRenderer {
  /**
   * Create a mesh with water-like material from extracted surface geometry.
   * Uses MeshPhysicalMaterial with transmission, IOR, and caustics.
   */
  static createWaterMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x0077be),
      roughness: 0.0,
      metalness: 0.0,
      transmission: 0.9,
      thickness: 2.0,
      ior: 1.33,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0,
      specularIntensity: 1.0,
      specularColor: new THREE.Color(0xffffff),
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.name = 'FluidSurface';
    return mesh;
  }

  /**
   * Create instanced mesh for whitewater particles.
   * Returns a THREE.Group containing instanced meshes for foam, spray, and bubbles.
   */
  static createWhitewaterMesh(whitewater: WhitewaterParticles): THREE.Group {
    const group = new THREE.Group();
    group.name = 'WhitewaterGroup';

    const dummy = new THREE.Object3D();

    // Foam: flat white discs on surface
    if (whitewater.foamCount > 0) {
      const foamGeo = new THREE.CircleGeometry(0.05, 8);
      const foamMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.15,
        metalness: 0.0,
        transmission: 0.5,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const foamInstances = new THREE.InstancedMesh(foamGeo, foamMat, whitewater.foamCount);
      for (let i = 0; i < whitewater.foamCount; i++) {
        dummy.position.set(
          whitewater.foam[i * 3],
          whitewater.foam[i * 3 + 1],
          whitewater.foam[i * 3 + 2],
        );
        dummy.scale.set(1, 0.2, 1); // flat disc
        dummy.updateMatrix();
        foamInstances.setMatrixAt(i, dummy.matrix);
        foamInstances.setColorAt(i, new THREE.Color(1, 1, 1));
      }
      foamInstances.instanceMatrix.needsUpdate = true;
      group.add(foamInstances);
    }

    // Spray: small white spheres above surface
    if (whitewater.sprayCount > 0) {
      const sprayGeo = new THREE.SphereGeometry(0.01, 6, 4);
      const sprayMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.3,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      const sprayInstances = new THREE.InstancedMesh(sprayGeo, sprayMat, whitewater.sprayCount);
      for (let i = 0; i < whitewater.sprayCount; i++) {
        dummy.position.set(
          whitewater.spray[i * 3],
          whitewater.spray[i * 3 + 1],
          whitewater.spray[i * 3 + 2],
        );
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        sprayInstances.setMatrixAt(i, dummy.matrix);
      }
      sprayInstances.instanceMatrix.needsUpdate = true;
      group.add(sprayInstances);
    }

    // Bubbles: subsurface bluish spheres
    if (whitewater.bubbleCount > 0) {
      const bubbleGeo = new THREE.SphereGeometry(0.02, 8, 6);
      const bubbleMat = new THREE.MeshPhysicalMaterial({
        color: 0xaaddff,
        roughness: 0.0,
        metalness: 0.0,
        transmission: 0.7,
        ior: 1.0,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      const bubbleInstances = new THREE.InstancedMesh(bubbleGeo, bubbleMat, whitewater.bubbleCount);
      for (let i = 0; i < whitewater.bubbleCount; i++) {
        dummy.position.set(
          whitewater.bubbles[i * 3],
          whitewater.bubbles[i * 3 + 1],
          whitewater.bubbles[i * 3 + 2],
        );
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        bubbleInstances.setMatrixAt(i, dummy.matrix);
      }
      bubbleInstances.instanceMatrix.needsUpdate = true;
      group.add(bubbleInstances);
    }

    return group;
  }

  /**
   * Update fluid mesh with new surface extraction per frame.
   * Extracts a new surface from particles and replaces the mesh geometry.
   */
  static updateFluidMesh(
    mesh: THREE.Mesh,
    particles: FluidParticle[],
    config: SurfaceExtractionConfig,
  ): void {
    const oldGeometry = mesh.geometry;
    mesh.geometry = FluidSurfaceExtractor.extractSurface(particles, config);
    oldGeometry.dispose();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 14. FLIPSurfaceExtractor — Backward-Compatible Class Wrapper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the backward-compatible FLIPSurfaceExtractor.
 * Preserves the existing API for FLIPFluidRenderer and index.ts.
 */
export interface FLIPSurfaceExtractorConfig {
  /** Grid resolution per axis for the density field (default 32) */
  gridResolution: number;
  /** Smoothing radius for the density kernel (default 0.1) */
  smoothingRadius: number;
  /** Iso-threshold for marching cubes (default 0.5) */
  isoThreshold: number;
  /** World-space padding around particle bounds (default 0.15) */
  boundsPadding: number;
  /** Number of Laplacian smoothing iterations (default 2) */
  smoothingIterations: number;
  /** Smoothing factor per iteration, 0 = none, 1 = max (default 0.3) */
  smoothingFactor: number;
  /** Use grid density field directly instead of computing from particles (default false) */
  useGridDensity: boolean;
}

const DEFAULT_EXTRACTOR_CONFIG: FLIPSurfaceExtractorConfig = {
  gridResolution: 32,
  smoothingRadius: 0.1,
  isoThreshold: 0.5,
  boundsPadding: 0.15,
  smoothingIterations: 2,
  smoothingFactor: 0.3,
  useGridDensity: false,
};

/**
 * Backward-compatible FLIP surface extractor class.
 *
 * Wraps the new FluidSurfaceExtractor static API in an instance-based
 * API matching the original FLIPSurfaceExtractor contract used by
 * FLIPFluidRenderer and the barrel exports in index.ts.
 *
 * Converts FLIPParticle[] → FluidParticle[] → FluidSurfaceExtractor → BufferGeometry
 */
export class FLIPSurfaceExtractor {
  private config: FLIPSurfaceExtractorConfig;
  private poly6Coeff: number;
  private h2: number;
  private densityField: Float32Array;

  private bounds: THREE.Box3;
  private voxelSize: THREE.Vector3;

  // Per-cell edge caches (reused each extraction)
  private edgePos: Float32Array;
  private edgeNorm: Float32Array;
  private edgeComputed: Uint8Array;

  constructor(config: Partial<FLIPSurfaceExtractorConfig> = {}) {
    this.config = { ...DEFAULT_EXTRACTOR_CONFIG, ...config };
    this.poly6Coeff = SPHKernels.poly6Coefficient(this.config.smoothingRadius);
    this.h2 = this.config.smoothingRadius * this.config.smoothingRadius;

    const res = this.config.gridResolution;
    this.densityField = new Float32Array(res * res * res);

    this.bounds = new THREE.Box3();
    this.voxelSize = new THREE.Vector3();

    this.edgePos = new Float32Array(12 * 3);
    this.edgeNorm = new Float32Array(12 * 3);
    this.edgeComputed = new Uint8Array(12);
  }

  // ── Public API (backward compatible) ───────────────────────────────────

  /**
   * Extract a water surface mesh from FLIP particles and/or grid data.
   *
   * @param particles Current FLIP particle array
   * @param grid      The FLIP grid (used for density if useGridDensity=true)
   * @returns         THREE.BufferGeometry with the extracted surface
   */
  extractSurface(particles: FLIPParticle[], grid?: FLIPGrid): THREE.BufferGeometry {
    if (particles.length === 0) {
      return this.createEmptyGeometry();
    }

    // 1. Compute bounding box with padding
    this.computeBounds(particles);

    // 2. Build density field
    if (this.config.useGridDensity && grid) {
      this.buildDensityFromGrid(grid);
    } else {
      this.buildDensityField(particles);
    }

    // 3. Marching cubes extraction
    const geometry = this.march();

    // 4. Laplacian smoothing
    if (this.config.smoothingIterations > 0) {
      this.applyLaplacianSmoothing(geometry, this.config.smoothingIterations, this.config.smoothingFactor);
    }

    return geometry;
  }

  /**
   * Get the raw density field (for debugging or custom visualization).
   */
  getDensityField(): Float32Array {
    return this.densityField;
  }

  // ── Bounding box ───────────────────────────────────────────────────────

  private computeBounds(particles: FLIPParticle[]): void {
    const pad = this.config.boundsPadding;
    this.bounds.min.set(Infinity, Infinity, Infinity);
    this.bounds.max.set(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i].position;
      if (p.x < this.bounds.min.x) this.bounds.min.x = p.x;
      if (p.y < this.bounds.min.y) this.bounds.min.y = p.y;
      if (p.z < this.bounds.min.z) this.bounds.min.z = p.z;
      if (p.x > this.bounds.max.x) this.bounds.max.x = p.x;
      if (p.y > this.bounds.max.y) this.bounds.max.y = p.y;
      if (p.z > this.bounds.max.z) this.bounds.max.z = p.z;
    }

    this.bounds.min.x -= pad;
    this.bounds.min.y -= pad;
    this.bounds.min.z -= pad;
    this.bounds.max.x += pad;
    this.bounds.max.y += pad;
    this.bounds.max.z += pad;

    const res = this.config.gridResolution;
    this.voxelSize.set(
      (this.bounds.max.x - this.bounds.min.x) / res,
      (this.bounds.max.y - this.bounds.min.y) / res,
      (this.bounds.max.z - this.bounds.min.z) / res,
    );
  }

  // ── Density field from particles ───────────────────────────────────────

  private buildDensityField(particles: FLIPParticle[]): void {
    const res = this.config.gridResolution;
    const field = this.densityField;
    const h = this.config.smoothingRadius;
    const h2 = this.h2;
    const coeff = this.poly6Coeff;

    field.fill(0);

    const bMinX = this.bounds.min.x;
    const bMinY = this.bounds.min.y;
    const bMinZ = this.bounds.min.z;
    const dx = this.voxelSize.x;
    const dy = this.voxelSize.y;
    const dz = this.voxelSize.z;

    for (let pi = 0; pi < particles.length; pi++) {
      const px = particles[pi].position.x;
      const py = particles[pi].position.y;
      const pz = particles[pi].position.z;

      const gxMin = Math.max(0, Math.floor((px - h - bMinX) / dx));
      const gyMin = Math.max(0, Math.floor((py - h - bMinY) / dy));
      const gzMin = Math.max(0, Math.floor((pz - h - bMinZ) / dz));
      const gxMax = Math.min(res - 1, Math.ceil((px + h - bMinX) / dx));
      const gyMax = Math.min(res - 1, Math.ceil((py + h - bMinY) / dy));
      const gzMax = Math.min(res - 1, Math.ceil((pz + h - bMinZ) / dz));

      for (let gz = gzMin; gz <= gzMax; gz++) {
        const gzOffset = gz * res * res;
        const gzWorld = bMinZ + (gz + 0.5) * dz;
        const rz = pz - gzWorld;
        const rz2 = rz * rz;

        for (let gy = gyMin; gy <= gyMax; gy++) {
          const gyOffset = gzOffset + gy * res;
          const gyWorld = bMinY + (gy + 0.5) * dy;
          const ry = py - gyWorld;
          const ry2 = ry * ry;

          if (ry2 + rz2 >= h2) continue;

          for (let gx = gxMin; gx <= gxMax; gx++) {
            const gxWorld = bMinX + (gx + 0.5) * dx;
            const rx = px - gxWorld;
            const r2 = rx * rx + ry2 + rz2;

            if (r2 < h2) {
              const diff = h2 - r2;
              field[gyOffset + gx] += coeff * diff * diff * diff;
            }
          }
        }
      }
    }
  }

  // ── Density field from grid ────────────────────────────────────────────

  private buildDensityFromGrid(grid: FLIPGrid): void {
    const res = this.config.gridResolution;
    const field = this.densityField;
    field.fill(0);

    const bMinX = this.bounds.min.x;
    const bMinY = this.bounds.min.y;
    const bMinZ = this.bounds.min.z;
    const dx = this.voxelSize.x;
    const dy = this.voxelSize.y;
    const dz = this.voxelSize.z;

    for (let gz = 0; gz < res; gz++) {
      const gzOffset = gz * res * res;
      const worldZ = bMinZ + (gz + 0.5) * dz;
      const gk = Math.floor(worldZ / grid.cellSize);

      for (let gy = 0; gy < res; gy++) {
        const gyOffset = gzOffset + gy * res;
        const worldY = bMinY + (gy + 0.5) * dy;
        const gj = Math.floor(worldY / grid.cellSize);

        for (let gx = 0; gx < res; gx++) {
          const worldX = bMinX + (gx + 0.5) * dx;
          const gi = Math.floor(worldX / grid.cellSize);

          const gridDensity = grid.getGridDensity(gi, gj, gk);
          if (grid.inBounds(gi, gj, gk)) {
            const idx = grid.idx(gi, gj, gk);
            field[gyOffset + gx] = grid.particleCount[idx] > 0.01
              ? gridDensity + grid.particleCount[idx]
              : 0;
          }
        }
      }
    }
  }

  // ── Marching cubes ─────────────────────────────────────────────────────

  private march(): THREE.BufferGeometry {
    const res = this.config.gridResolution;
    const isolevel = this.config.isoThreshold;
    const field = this.densityField;

    const cellsX = res - 1;
    const cellsY = res - 1;
    const cellsZ = res - 1;

    if (cellsX <= 0 || cellsY <= 0 || cellsZ <= 0) {
      return this.createEmptyGeometry();
    }

    const posArr: number[] = [];
    const normArr: number[] = [];

    const bMinX = this.bounds.min.x;
    const bMinY = this.bounds.min.y;
    const bMinZ = this.bounds.min.z;
    const dx = this.voxelSize.x;
    const dy = this.voxelSize.y;
    const dz = this.voxelSize.z;

    const getDensity = (gx: number, gy: number, gz: number): number => {
      if (gx < 0 || gx >= res || gy < 0 || gy >= res || gz < 0 || gz >= res) {
        return 0;
      }
      return field[gz * res * res + gy * res + gx];
    };

    const worldX = (gx: number) => bMinX + gx * dx;
    const worldY = (gy: number) => bMinY + gy * dy;
    const worldZ = (gz: number) => bMinZ + gz * dz;

    const _normalOut = [0, 1, 0];

    const computeNormal = (wx: number, wy: number, wz: number): void => {
      const gx0 = Math.round((wx - bMinX) / dx);
      const gy0 = Math.round((wy - bMinY) / dy);
      const gz0 = Math.round((wz - bMinZ) / dz);

      const ndx = getDensity(gx0 + 1, gy0, gz0) - getDensity(gx0 - 1, gy0, gz0);
      const ndy = getDensity(gx0, gy0 + 1, gz0) - getDensity(gx0, gy0 - 1, gz0);
      const ndz = getDensity(gx0, gy0, gz0 + 1) - getDensity(gx0, gy0, gz0 - 1);

      const len = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz);
      if (len < 1e-10) {
        _normalOut[0] = 0; _normalOut[1] = 1; _normalOut[2] = 0;
      } else {
        _normalOut[0] = ndx / len;
        _normalOut[1] = ndy / len;
        _normalOut[2] = ndz / len;
      }
    };

    for (let cz = 0; cz < cellsZ; cz++) {
      for (let cy = 0; cy < cellsY; cy++) {
        for (let cx = 0; cx < cellsX; cx++) {
          const cornerValues = [
            getDensity(cx, cy, cz),
            getDensity(cx + 1, cy, cz),
            getDensity(cx + 1, cy + 1, cz),
            getDensity(cx, cy + 1, cz),
            getDensity(cx, cy, cz + 1),
            getDensity(cx + 1, cy, cz + 1),
            getDensity(cx + 1, cy + 1, cz + 1),
            getDensity(cx, cy + 1, cz + 1),
          ];

          let caseIndex = 0;
          for (let c = 0; c < 8; c++) {
            if (cornerValues[c] < isolevel) caseIndex |= (1 << c);
          }

          if (caseIndex === 0 || caseIndex === 255) continue;

          const edgeFlags = EDGE_TABLE[caseIndex];
          if (edgeFlags === 0) continue;

          this.edgeComputed.fill(0);

          for (let edge = 0; edge < 12; edge++) {
            if ((edgeFlags & (1 << edge)) === 0) continue;

            const v0 = EDGE_VERTICES[edge * 2];
            const v1 = EDGE_VERTICES[edge * 2 + 1];

            const d0 = cornerValues[v0];
            const d1 = cornerValues[v1];
            const diff = d0 - d1;
            const t = Math.abs(diff) > 1e-10 ? (d0 - isolevel) / diff : 0.5;

            const p0x = worldX(cx + CORNER_OFFSETS[v0][0]);
            const p0y = worldY(cy + CORNER_OFFSETS[v0][1]);
            const p0z = worldZ(cz + CORNER_OFFSETS[v0][2]);
            const p1x = worldX(cx + CORNER_OFFSETS[v1][0]);
            const p1y = worldY(cy + CORNER_OFFSETS[v1][1]);
            const p1z = worldZ(cz + CORNER_OFFSETS[v1][2]);

            const ix = p0x + t * (p1x - p0x);
            const iy = p0y + t * (p1y - p0y);
            const iz = p0z + t * (p1z - p0z);

            const off = edge * 3;
            this.edgePos[off] = ix;
            this.edgePos[off + 1] = iy;
            this.edgePos[off + 2] = iz;

            computeNormal(ix, iy, iz);
            this.edgeNorm[off] = _normalOut[0];
            this.edgeNorm[off + 1] = _normalOut[1];
            this.edgeNorm[off + 2] = _normalOut[2];

            this.edgeComputed[edge] = 1;
          }

          const base = caseIndex * 16;
          for (let i = 0; i < 16; i += 3) {
            const e0 = TRIANGLE_TABLE[base + i];
            if (e0 === -1) break;

            const e1 = TRIANGLE_TABLE[base + i + 1];
            const e2 = TRIANGLE_TABLE[base + i + 2];

            for (const e of [e0, e1, e2]) {
              const off = e * 3;
              posArr.push(this.edgePos[off], this.edgePos[off + 1], this.edgePos[off + 2]);
              normArr.push(this.edgeNorm[off], this.edgeNorm[off + 1], this.edgeNorm[off + 2]);
            }
          }
        }
      }
    }

    return this.buildGeometry(posArr, normArr);
  }

  // ── Geometry helpers ───────────────────────────────────────────────────

  private createEmptyGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
    return geo;
  }

  private buildGeometry(positions: number[], normals: number[]): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const vertCount = positions.length / 3;

    if (vertCount === 0) {
      return this.createEmptyGeometry();
    }

    const posArray = new Float32Array(positions);
    const normArray = new Float32Array(normals);

    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
    geo.computeBoundingSphere();

    return geo;
  }

  // ── Laplacian smoothing ────────────────────────────────────────────────

  private applyLaplacianSmoothing(
    geometry: THREE.BufferGeometry,
    iterations: number,
    factor: number,
  ): void {
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr || posAttr.count < 3) return;

    const vertCount = posAttr.count;

    const neighbors: Map<number, number[]> = new Map();
    for (let i = 0; i < vertCount; i++) {
      neighbors.set(i, []);
    }

    const triCount = vertCount / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3;
      const i1 = t * 3 + 1;
      const i2 = t * 3 + 2;

      neighbors.get(i0)!.push(i1, i2);
      neighbors.get(i1)!.push(i0, i2);
      neighbors.get(i2)!.push(i0, i1);
    }

    for (let iter = 0; iter < iterations; iter++) {
      const newPos = new Float32Array(vertCount * 3);

      for (let i = 0; i < vertCount; i++) {
        const nbrs = neighbors.get(i)!;
        if (nbrs.length === 0) {
          newPos[i * 3] = posAttr.getX(i);
          newPos[i * 3 + 1] = posAttr.getY(i);
          newPos[i * 3 + 2] = posAttr.getZ(i);
          continue;
        }

        let ax = 0, ay = 0, az = 0;
        for (const n of nbrs) {
          ax += posAttr.getX(n);
          ay += posAttr.getY(n);
          az += posAttr.getZ(n);
        }
        const count = nbrs.length;
        ax /= count;
        ay /= count;
        az /= count;

        const ox = posAttr.getX(i);
        const oy = posAttr.getY(i);
        const oz = posAttr.getZ(i);

        newPos[i * 3] = ox + factor * (ax - ox);
        newPos[i * 3 + 1] = oy + factor * (ay - oy);
        newPos[i * 3 + 2] = oz + factor * (az - oz);
      }

      for (let i = 0; i < vertCount * 3; i++) {
        (posAttr.array as Float32Array)[i] = newPos[i];
      }
      posAttr.needsUpdate = true;
    }

    geometry.computeVertexNormals();
  }

  // ── Dispose ────────────────────────────────────────────────────────────

  dispose(): void {
    this.densityField = new Float32Array(0);
  }
}

export default FLIPSurfaceExtractor;
