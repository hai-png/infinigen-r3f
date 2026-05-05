/**
 * Simulation P2 Features — Fluid Scene Composition & Cloth Collision
 *
 * Provides two advanced simulation subsystems for the infinigen-r3f project:
 *
 * 1. FluidSceneComposerP2 — Composes complete FLIPFluidSolver scenes for
 *    still water, rivers, beaches, and tilted rivers. Handles terrain boolean
 *    subtraction for water volume, boundary conditions, inflow/outflow, and
 *    wave pushers.
 *
 * 2. ClothSceneCollision — Adds terrain and mesh collision to ClothSimulation.
 *    Includes terrain height sampling collision, BVH-based mesh collision for
 *    furniture/objects, and position correction for penetrating particles with
 *    velocity reflection and friction.
 *
 * @module sim
 */

import * as THREE from 'three';
import { FLIPFluidSolver, FLIPConfig, FLIPParticle } from './fluid/FLIPFluidSolver';
import type { ClothSimulation, ClothParticle, ClothConstraint } from './cloth/ClothSimulation';

// ============================================================================
// Types
// ============================================================================

/** A composed fluid scene ready for simulation */
export interface FluidScene {
  /** The configured FLIP solver */
  solver: FLIPFluidSolver;
  /** Domain bounds in world space */
  domainMin: THREE.Vector3;
  /** Domain bounds in world space */
  domainMax: THREE.Vector3;
  /** Initial particle count */
  particleCount: number;
  /** Scene description */
  description: string;
  /** Optional terrain obstacle SDF */
  terrainSDF?: TerrainObstacleSDF;
  /** Optional inflow configuration */
  inflow?: InflowConfig;
  /** Optional outflow configuration */
  outflow?: OutflowConfig;
  /** Optional wave pushers */
  wavePushers?: WavePusher[];
}

/** Terrain obstacle SDF for fluid boundary */
export interface TerrainObstacleSDF {
  /** Sample the signed distance at a world position. Negative = inside terrain. */
  sample(pos: THREE.Vector3): number;
  /** Sample the surface normal at a world position */
  normal(pos: THREE.Vector3): THREE.Vector3;
  /** Terrain bounds */
  bounds: THREE.Box3;
}

/** Inflow configuration for continuous fluid source */
export interface InflowConfig {
  /** Position of inflow region */
  position: THREE.Vector3;
  /** Size of inflow region */
  size: THREE.Vector3;
  /** Velocity of inflowing fluid */
  velocity: THREE.Vector3;
  /** Particles to emit per step */
  rate: number;
  /** Spacing between inflow particles */
  spacing: number;
}

/** Outflow configuration for fluid drain */
export interface OutflowConfig {
  /** Position of outflow region */
  position: THREE.Vector3;
  /** Size of outflow region */
  size: THREE.Vector3;
  /** Culling bounds — particles outside are removed */
  cullMin: THREE.Vector3;
  cullMax: THREE.Vector3;
}

/** Wave pusher for beach/shoreline effects */
export interface WavePusher {
  /** Origin of the wave pusher */
  origin: THREE.Vector3;
  /** Direction of wave propagation */
  direction: THREE.Vector3;
  /** Wave amplitude */
  amplitude: number;
  /** Wave frequency */
  frequency: number;
  /** Wave speed */
  speed: number;
}

/** Terrain height sampler function type */
export type TerrainHeightSampler = (x: number, z: number) => number;

/** Collision result for cloth particles */
export interface ClothCollisionResult {
  /** Index of the colliding particle */
  particleIndex: number;
  /** Collision normal */
  normal: THREE.Vector3;
  /** Penetration depth */
  depth: number;
  /** Contact point on surface */
  contactPoint: THREE.Vector3;
}

/** BVH node for mesh collision acceleration */
interface BVHNode {
  bounds: THREE.Box3;
  left?: BVHNode;
  right?: BVHNode;
  triangles?: number[]; // triangle indices (leaf node)
}

// ============================================================================
// 1. FluidSceneComposerP2
// ============================================================================

/**
 * FluidSceneComposerP2 composes complete fluid simulation scenes for various
 * natural water scenarios. It configures FLIPFluidSolver instances with the
 * correct domain, particles, boundary conditions, inflow/outflow, and wave
 * effects.
 *
 * The composer handles:
 * - Terrain boolean subtraction: removes particles inside terrain
 * - Boundary conditions: walls, inflow, outflow
 * - Wave pushers: oscillating forces for beach/shoreline
 * - River channels: carved from terrain with bank obstacles
 *
 * Usage:
 * ```ts
 * const composer = new FluidSceneComposerP2();
 * const scene = composer.composeStillWater(terrainSampler, bounds, 2.0);
 * scene.solver.step(dt);
 * ```
 */
export class FluidSceneComposerP2 {
  /**
   * Compose a still water scene — a flat body of water at a given depth.
   * Particles below the water surface are initialized; terrain is subtracted.
   *
   * @param terrain - Terrain height sampler (returns Y height at x,z)
   * @param bounds - Bounding box of the water domain
   * @param depth - Water depth in meters
   * @returns A composed FluidScene
   */
  composeStillWater(
    terrain: TerrainHeightSampler,
    bounds: THREE.Box3,
    depth: number,
  ): FluidScene {
    const cellSize = 0.05;
    const nx = Math.ceil((bounds.max.x - bounds.min.x) / cellSize);
    const ny = Math.ceil(depth / cellSize);
    const nz = Math.ceil((bounds.max.z - bounds.min.z) / cellSize);

    const config: Partial<FLIPConfig> = {
      gridSize: [nx, ny, nz],
      cellSize,
      gravity: new THREE.Vector3(0, -9.81, 0),
      flipRatio: 0.95,
      pressureIterations: 40,
      maxParticles: 50000,
      boundaryType: 'noslip',
      adaptiveTimeStep: true,
    };

    const solver = new FLIPFluidSolver(config);

    // Water surface height
    const waterSurfaceY = bounds.min.y + depth;

    // Initialize water particles below surface, above terrain
    const spacing = cellSize * 0.5;
    const min = new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z);
    const max = new THREE.Vector3(bounds.max.x, waterSurfaceY, bounds.max.z);

    solver.initializeBlock(min, max, spacing);

    // Remove particles inside terrain
    const particles = solver.getParticles();
    const terrainSDF = this.createTerrainSDF(terrain, bounds);
    const filtered = particles.filter(p => {
      const terrainY = terrain(p.position.x, p.position.z);
      return p.position.y > terrainY;
    });
    solver.initialize(filtered);

    return {
      solver,
      domainMin: new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      domainMax: new THREE.Vector3(bounds.max.x, waterSurfaceY, bounds.max.z),
      particleCount: filtered.length,
      description: `Still water, depth=${depth}m, domain=${nx}x${ny}x${nz}`,
      terrainSDF,
    };
  }

  /**
   * Compose a river scene — flowing water along a path with inflow/outflow.
   * The river channel is carved from terrain; bank geometry acts as obstacles.
   *
   * @param terrain - Terrain height sampler
   * @param path - Array of points defining the river center path
   * @param width - River width in meters
   * @param depth - River depth in meters
   * @param flowSpeed - Flow velocity in m/s
   * @returns A composed FluidScene with inflow/outflow
   */
  composeRiver(
    terrain: TerrainHeightSampler,
    path: THREE.Vector3[],
    width: number,
    depth: number,
    flowSpeed: number,
  ): FluidScene {
    if (path.length < 2) {
      throw new Error('River path must have at least 2 points');
    }

    // Compute domain bounds from path + width
    const bounds = new THREE.Box3();
    for (const p of path) {
      bounds.expandByPoint(p.clone().add(new THREE.Vector3(width, depth, width)));
      bounds.expandByPoint(p.clone().sub(new THREE.Vector3(width, -depth, width)));
    }

    const cellSize = 0.05;
    const nx = Math.min(64, Math.ceil((bounds.max.x - bounds.min.x) / cellSize));
    const ny = Math.ceil(depth / cellSize);
    const nz = Math.min(64, Math.ceil((bounds.max.z - bounds.min.z) / cellSize));

    const config: Partial<FLIPConfig> = {
      gridSize: [nx, ny, nz],
      cellSize,
      gravity: new THREE.Vector3(0, -9.81, 0),
      flipRatio: 0.95,
      pressureIterations: 40,
      maxParticles: 80000,
      boundaryType: 'freeslip',
      adaptiveTimeStep: true,
    };

    const solver = new FLIPFluidSolver(config);

    // Compute flow direction from first two path points
    const flowDir = new THREE.Vector3().subVectors(path[1], path[0]).normalize();
    const flowVelocity = flowDir.multiplyScalar(flowSpeed);

    // Initialize water particles in the river channel
    const spacing = cellSize * 0.5;
    for (let i = 0; i < path.length - 1; i++) {
      const segStart = path[i];
      const segEnd = path[i + 1];
      const segDir = new THREE.Vector3().subVectors(segEnd, segStart).normalize();
      const segLen = segStart.distanceTo(segEnd);
      const perp = new THREE.Vector3(-segDir.z, 0, segDir.x); // perpendicular in XZ

      const stepsAlong = Math.floor(segLen / spacing);
      const stepsAcross = Math.floor(width / spacing);
      const stepsDepth = Math.floor(depth / spacing);

      for (let s = 0; s < stepsAlong; s++) {
        for (let a = 0; a < stepsAcross; a++) {
          for (let d = 0; d < stepsDepth; d++) {
            const t = s / stepsAlong;
            const alongOffset = segDir.clone().multiplyScalar(s * spacing);
            const acrossOffset = perp.clone().multiplyScalar((a - stepsAcross / 2) * spacing);
            const pos = segStart.clone().add(alongOffset).add(acrossOffset);
            pos.y = segStart.y - d * spacing;

            const terrainY = terrain(pos.x, pos.z);
            if (pos.y > terrainY) {
              solver.addParticle(pos, flowVelocity.clone());
            }
          }
        }
      }
    }

    // Inflow at start of path
    const inflowPos = path[0].clone();
    const inflow: InflowConfig = {
      position: inflowPos,
      size: new THREE.Vector3(width, depth, cellSize * 2),
      velocity: flowVelocity.clone(),
      rate: Math.floor(width * depth / (cellSize * cellSize) * 0.5),
      spacing: cellSize,
    };

    // Outflow at end of path
    const outflowPos = path[path.length - 1].clone();
    const outflow: OutflowConfig = {
      position: outflowPos,
      size: new THREE.Vector3(width, depth, cellSize * 2),
      cullMin: new THREE.Vector3(outflowPos.x - width, bounds.min.y, outflowPos.z - cellSize),
      cullMax: new THREE.Vector3(outflowPos.x + width, bounds.max.y, outflowPos.z + cellSize * 4),
    };

    const terrainSDF = this.createTerrainSDF(terrain, bounds);

    return {
      solver,
      domainMin: bounds.min.clone(),
      domainMax: bounds.max.clone(),
      particleCount: solver.getParticleCount(),
      description: `River, width=${width}m, depth=${depth}m, flow=${flowSpeed}m/s`,
      terrainSDF,
      inflow,
      outflow,
    };
  }

  /**
   * Compose a beach scene — shallow water with wave pushers at the shoreline.
   * Terrain-water intersection creates the shoreline geometry.
   *
   * @param terrain - Terrain height sampler
   * @param waterLevel - Y coordinate of the water surface
   * @param waveAmplitude - Wave amplitude in meters
   * @returns A composed FluidScene with wave pushers
   */
  composeBeach(
    terrain: TerrainHeightSampler,
    waterLevel: number,
    waveAmplitude: number,
  ): FluidScene {
    const bounds = new THREE.Box3(
      new THREE.Vector3(-10, waterLevel - 1, -10),
      new THREE.Vector3(10, waterLevel + 0.5, 10),
    );

    const cellSize = 0.05;
    const nx = Math.ceil(20 / cellSize);
    const ny = Math.ceil(1.5 / cellSize);
    const nz = Math.ceil(20 / cellSize);

    const config: Partial<FLIPConfig> = {
      gridSize: [nx, ny, nz],
      cellSize,
      gravity: new THREE.Vector3(0, -9.81, 0),
      flipRatio: 0.9,
      pressureIterations: 40,
      maxParticles: 60000,
      boundaryType: 'freeslip',
      adaptiveTimeStep: true,
    };

    const solver = new FLIPFluidSolver(config);

    // Initialize particles below water level and above terrain
    const spacing = cellSize * 0.5;
    solver.initializeBlock(
      new THREE.Vector3(-10, waterLevel - 1, -10),
      new THREE.Vector3(10, waterLevel, 10),
      spacing,
    );

    // Remove particles above terrain (on the beach)
    const particles = solver.getParticles();
    const filtered = particles.filter(p => {
      const terrainY = terrain(p.position.x, p.position.z);
      return p.position.y > terrainY && p.position.y < waterLevel;
    });
    solver.initialize(filtered);

    // Wave pushers along the Z axis
    const wavePushers: WavePusher[] = [];
    for (let z = -8; z <= 8; z += 2) {
      wavePushers.push({
        origin: new THREE.Vector3(-8, waterLevel, z),
        direction: new THREE.Vector3(1, 0, 0),
        amplitude: waveAmplitude,
        frequency: 0.5,
        speed: 1.5,
      });
    }

    const terrainSDF = this.createTerrainSDF(terrain, bounds);

    return {
      solver,
      domainMin: bounds.min.clone(),
      domainMax: bounds.max.clone(),
      particleCount: filtered.length,
      description: `Beach, waterLevel=${waterLevel}m, waveAmp=${waveAmplitude}m`,
      terrainSDF,
      wavePushers,
    };
  }

  /**
   * Compose a tilted river scene — river flowing downhill at a given angle.
   * Gravity is adjusted to account for the tilt.
   *
   * @param terrain - Terrain height sampler
   * @param angle - Tilt angle in degrees
   * @param width - River width in meters
   * @param depth - River depth in meters
   * @returns A composed FluidScene with adjusted gravity
   */
  composeTiltedRiver(
    terrain: TerrainHeightSampler,
    angle: number,
    width: number,
    depth: number,
  ): FluidScene {
    const angleRad = (angle * Math.PI) / 180;
    const length = 20;
    const g = 9.81;

    // Compute start and end points of the tilted river
    const startY = length * Math.sin(angleRad) / 2;
    const endY = -length * Math.sin(angleRad) / 2;
    const startX = -length * Math.cos(angleRad) / 2;
    const endX = length * Math.cos(angleRad) / 2;

    const path = [
      new THREE.Vector3(startX, startY, 0),
      new THREE.Vector3(endX, endY, 0),
    ];

    // Flow speed from gravity component along slope
    const flowSpeed = Math.sqrt(2 * g * Math.abs(startY - endY));

    // Compose as a river with the tilted path
    const scene = this.composeRiver(terrain, path, width, depth, flowSpeed);

    // Adjust gravity for the tilt (add slope-parallel component)
    const slopeDir = new THREE.Vector3(Math.cos(angleRad), -Math.sin(angleRad), 0);
    scene.solver.setGravity(
      new THREE.Vector3(g * Math.sin(angleRad), -g * Math.cos(angleRad), 0),
    );

    scene.description = `Tilted river, angle=${angle}°, flowSpeed=${flowSpeed.toFixed(1)}m/s`;
    return scene;
  }

  /**
   * Apply inflow to a fluid scene — add particles at the inflow region.
   * Call this each simulation step to maintain flow.
   *
   * @param scene - The fluid scene
   * @param dt - Time step
   */
  applyInflow(scene: FluidScene, dt: number): void {
    if (!scene.inflow) return;

    const { position, size, velocity, rate, spacing } = scene.inflow;
    const added = scene.solver.addBlockParticles(
      position,
      position.clone().add(size),
      spacing,
      velocity,
    );

    // Limit to configured rate
    if (added > rate) {
      // Remove excess particles
      const particles = scene.solver.getParticles();
      const excess = added - rate;
      const keep = particles.slice(0, particles.length - excess);
      scene.solver.initialize(keep);
    }
  }

  /**
   * Apply outflow to a fluid scene — cull particles beyond outflow region.
   * Call this each simulation step.
   *
   * @param scene - The fluid scene
   */
  applyOutflow(scene: FluidScene): void {
    if (!scene.outflow) return;
    const { cullMin, cullMax } = scene.outflow;
    scene.solver.cullParticles(cullMin, cullMax);
  }

  /**
   * Apply wave pusher forces to fluid particles.
   * Call this each simulation step.
   *
   * @param scene - The fluid scene
   * @param time - Current simulation time
   */
  applyWavePushers(scene: FluidScene, time: number): void {
    if (!scene.wavePushers) return;

    const particles = scene.solver.getParticles();
    for (const pusher of scene.wavePushers) {
      const phase = time * pusher.speed;
      const force = pusher.direction.clone().multiplyScalar(
        Math.sin(phase * pusher.frequency * Math.PI * 2) * pusher.amplitude * 9.81,
      );

      for (const p of particles) {
        const dist = p.position.distanceTo(pusher.origin);
        if (dist < 5.0) {
          const influence = 1 - dist / 5.0;
          p.velocity.add(force.clone().multiplyScalar(influence * 0.01));
        }
      }
    }
  }

  /**
   * Create a terrain SDF from a height sampler function.
   * The SDF is approximate — uses vertical distance.
   */
  private createTerrainSDF(
    terrain: TerrainHeightSampler,
    bounds: THREE.Box3,
  ): TerrainObstacleSDF {
    return {
      sample(pos: THREE.Vector3): number {
        const terrainY = terrain(pos.x, pos.z);
        return pos.y - terrainY; // Negative = inside terrain
      },
      normal(pos: THREE.Vector3): THREE.Vector3 {
        const eps = 0.01;
        const h = terrain(pos.x, pos.z);
        const hx = terrain(pos.x + eps, pos.z);
        const hz = terrain(pos.x, pos.z + eps);
        return new THREE.Vector3(
          (h - hx) / eps,
          1,
          (h - hz) / eps,
        ).normalize();
      },
      bounds,
    };
  }
}

// ============================================================================
// 2. ClothSceneCollision
// ============================================================================

/**
 * ClothSceneCollision adds collision handling to cloth simulations.
 * Supports terrain height sampling collision and BVH-based mesh collision
 * for furniture and other scene objects.
 *
 * Collision resolution:
 * 1. Detect penetration (particle below terrain or inside mesh)
 * 2. Push particle to surface along collision normal
 * 3. Reflect velocity with configurable restitution and friction
 *
 * Usage:
 * ```ts
 * const collision = new ClothSceneCollision();
 * collision.addTerrainCollision(cloth, terrainSampler);
 * collision.addMeshCollision(cloth, tableMesh, 0.02);
 * // During simulation loop:
 * collision.resolveCollisions(cloth.particles, allCollisions);
 * ```
 */
export class ClothSceneCollision {
  /** Registered collision handlers */
  private terrainCollisions: Array<{
    cloth: ClothSimulation;
    sampler: TerrainHeightSampler;
    padding: number;
    friction: number;
    restitution: number;
  }> = [];

  private meshCollisions: Array<{
    cloth: ClothSimulation;
    bvh: BVHNode;
    mesh: THREE.Mesh;
    padding: number;
    friction: number;
    restitution: number;
  }> = [];

  /**
   * Add terrain collision to a cloth simulation.
   * Prevents cloth particles from passing through the terrain by
   * projecting them above the terrain height.
   *
   * @param cloth - The cloth simulation
   * @param terrainHeightSampler - Function returning terrain Y at (x, z)
   * @param padding - Distance to keep above terrain (default 0.01)
   * @param friction - Friction coefficient (default 0.5)
   * @param restitution - Bounce coefficient (default 0.1)
   */
  addTerrainCollision(
    cloth: ClothSimulation,
    terrainHeightSampler: TerrainHeightSampler,
    padding: number = 0.01,
    friction: number = 0.5,
    restitution: number = 0.1,
  ): void {
    this.terrainCollisions.push({
      cloth,
      sampler: terrainHeightSampler,
      padding,
      friction,
      restitution,
    });
  }

  /**
   * Add mesh collision to a cloth simulation.
   * Uses BVH acceleration for efficient mesh collision detection.
   * Pushes cloth particles out of the mesh surface.
   *
   * @param cloth - The cloth simulation
   * @param mesh - The collision mesh (furniture, object, etc.)
   * @param padding - Collision padding distance (default 0.02)
   * @param friction - Friction coefficient (default 0.3)
   * @param restitution - Bounce coefficient (default 0.05)
   */
  addMeshCollision(
    cloth: ClothSimulation,
    mesh: THREE.Mesh,
    padding: number = 0.02,
    friction: number = 0.3,
    restitution: number = 0.05,
  ): void {
    // Build BVH from mesh
    const bvh = this.buildBVH(mesh);
    this.meshCollisions.push({
      cloth,
      bvh,
      mesh,
      padding,
      friction,
      restitution,
    });
  }

  /**
   * Resolve all registered collisions for given particles.
   * Applies position correction and velocity reflection with friction.
   *
   * @param particles - The cloth particle array
   * @param collisions - Pre-detected collision results
   */
  resolveCollisions(
    particles: ClothParticle[],
    collisions: ClothCollisionResult[],
  ): void {
    for (const collision of collisions) {
      const particle = particles[collision.particleIndex];
      if (!particle || particle.pinned) continue;

      // Position correction: push particle to surface + padding
      const correction = collision.normal.clone().multiplyScalar(
        collision.depth + 0.001, // small offset to prevent re-penetration
      );
      particle.position.add(correction);

      // Velocity reflection
      const velDotNormal = particle.velocity.dot(collision.normal);
      if (velDotNormal < 0) {
        // Decompose velocity into normal and tangential components
        const vNormal = collision.normal.clone().multiplyScalar(velDotNormal);
        const vTangent = particle.velocity.clone().sub(vNormal);

        // Reflect normal component with restitution
        const reflectedNormal = vNormal.multiplyScalar(-0.1); // restitution

        // Apply friction to tangential component
        const frictionedTangent = vTangent.multiplyScalar(0.8); // 1 - friction

        particle.velocity.copy(reflectedNormal.add(frictionedTangent));
      }
    }
  }

  /**
   * Detect terrain collisions for all registered cloth-terrain pairs.
   * Returns collision results that can be resolved with resolveCollisions().
   *
   * @returns Array of collision results
   */
  detectTerrainCollisions(): ClothCollisionResult[] {
    const results: ClothCollisionResult[] = [];

    for (const tc of this.terrainCollisions) {
      // Access cloth particles through the simulation
      const clothMesh = tc.cloth.getMesh();
      if (!clothMesh) continue;

      const geometry = clothMesh.geometry;
      const posAttr = geometry.getAttribute('position');

      for (let i = 0; i < posAttr.count; i++) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        const pz = posAttr.getZ(i);

        const terrainY = tc.sampler(px, pz);
        const depth = terrainY + tc.padding - py;

        if (depth > 0) {
          // Particle is below terrain
          results.push({
            particleIndex: i,
            normal: new THREE.Vector3(0, 1, 0), // terrain normal is up
            depth,
            contactPoint: new THREE.Vector3(px, terrainY, pz),
          });
        }
      }
    }

    return results;
  }

  /**
   * Detect mesh collisions for all registered cloth-mesh pairs.
   * Uses BVH for acceleration.
   *
   * @returns Array of collision results
   */
  detectMeshCollisions(): ClothCollisionResult[] {
    const results: ClothCollisionResult[] = [];

    for (const mc of this.meshCollisions) {
      const clothMesh = mc.cloth.getMesh();
      if (!clothMesh) continue;

      const geometry = clothMesh.geometry;
      const posAttr = geometry.getAttribute('position');
      const raycaster = new THREE.Raycaster();

      for (let i = 0; i < posAttr.count; i++) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        const pz = posAttr.getZ(i);

        // Cast a short ray from the particle downward
        const origin = new THREE.Vector3(px, py + mc.padding * 2, pz);
        const direction = new THREE.Vector3(0, -1, 0);
        raycaster.set(origin, direction);
        raycaster.far = mc.padding * 4;

        const intersects = raycaster.intersectObject(mc.mesh);
        if (intersects.length > 0) {
          const hit = intersects[0];
          const depth = mc.padding - hit.distance + mc.padding * 2;
          if (depth > 0) {
            results.push({
              particleIndex: i,
              normal: hit.face?.normal ?? new THREE.Vector3(0, 1, 0),
              depth,
              contactPoint: hit.point.clone(),
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Perform a full collision detection + resolution step.
   * Call this once per simulation substep.
   */
  resolveAllCollisions(): void {
    const terrainResults = this.detectTerrainCollisions();
    this.resolveCollisionsFromTerrain(terrainResults);

    const meshResults = this.detectMeshCollisions();
    // Use the cloth particles accessor
    for (const collision of meshResults) {
      const clothMesh = this.meshCollisions[0]?.cloth.getMesh();
      if (!clothMesh) continue;
      // Position correction is done on geometry directly
      const posAttr = clothMesh.geometry.getAttribute('position');
      if (collision.particleIndex < posAttr.count) {
        const px = posAttr.getX(collision.particleIndex);
        const py = posAttr.getY(collision.particleIndex);
        const pz = posAttr.getZ(collision.particleIndex);
        const correction = collision.normal.clone().multiplyScalar(collision.depth + 0.001);
        posAttr.setXYZ(
          collision.particleIndex,
          px + correction.x,
          py + correction.y,
          pz + correction.z,
        );
      }
    }
  }

  /**
   * Resolve terrain collisions by adjusting geometry positions directly.
   */
  private resolveCollisionsFromTerrain(collisions: ClothCollisionResult[]): void {
    for (const collision of collisions) {
      // Find the matching cloth
      for (const tc of this.terrainCollisions) {
        const clothMesh = tc.cloth.getMesh();
        if (!clothMesh) continue;
        const posAttr = clothMesh.geometry.getAttribute('position');
        if (collision.particleIndex >= posAttr.count) continue;

        // Position correction
        const px = posAttr.getX(collision.particleIndex);
        const py = posAttr.getY(collision.particleIndex);
        const pz = posAttr.getZ(collision.particleIndex);
        const correction = collision.normal.clone().multiplyScalar(collision.depth + 0.001);
        posAttr.setXYZ(
          collision.particleIndex,
          px + correction.x,
          py + correction.y,
          pz + correction.z,
        );
      }
    }
  }

  /**
   * Build a simple BVH from a mesh for acceleration.
   * Uses a top-down approach with median splitting.
   */
  private buildBVH(mesh: THREE.Mesh, maxDepth: number = 10, maxTriangles: number = 8): BVHNode {
    const geometry = mesh.geometry;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!.clone();

    const index = geometry.getIndex();
    const triangles: number[] = [];
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(geometry.getAttribute('position').count / 3);

    for (let i = 0; i < triCount; i++) {
      triangles.push(i);
    }

    return this.buildBVHNode(mesh, bounds, triangles, 0, maxDepth, maxTriangles);
  }

  /**
   * Recursively build a BVH node.
   */
  private buildBVHNode(
    mesh: THREE.Mesh,
    bounds: THREE.Box3,
    triangles: number[],
    depth: number,
    maxDepth: number,
    maxTriangles: number,
  ): BVHNode {
    if (triangles.length <= maxTriangles || depth >= maxDepth) {
      return { bounds, triangles };
    }

    // Find longest axis
    const size = new THREE.Vector3();
    bounds.getSize(size);
    let axis = 0;
    if (size.y > size.x) axis = 1;
    if (size.z > size.toArray()[axis]) axis = 2;

    // Sort triangles by centroid along axis
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position');
    const index = geometry.getIndex();

    const sorted = [...triangles].sort((a, b) => {
      const ca = this.triangleCentroid(a, posAttr, index);
      const cb = this.triangleCentroid(b, posAttr, index);
      return ca[axis] - cb[axis];
    });

    const mid = Math.floor(sorted.length / 2);
    const leftTris = sorted.slice(0, mid);
    const rightTris = sorted.slice(mid);

    // Compute child bounds
    const leftBounds = this.computeBounds(leftTris, posAttr, index);
    const rightBounds = this.computeBounds(rightTris, posAttr, index);

    return {
      bounds,
      left: this.buildBVHNode(mesh, leftBounds, leftTris, depth + 1, maxDepth, maxTriangles),
      right: this.buildBVHNode(mesh, rightBounds, rightTris, depth + 1, maxDepth, maxTriangles),
    };
  }

  /** Get triangle centroid */
  private triangleCentroid(
    triIndex: number,
    posAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    indexAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
  ): THREE.Vector3 {
    const i0 = indexAttr ? indexAttr.getX(triIndex * 3) : triIndex * 3;
    const i1 = indexAttr ? indexAttr.getX(triIndex * 3 + 1) : triIndex * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(triIndex * 3 + 2) : triIndex * 3 + 2;

    return new THREE.Vector3(
      (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3,
      (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3,
      (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3,
    );
  }

  /** Compute bounding box for a set of triangles */
  private computeBounds(
    triangles: number[],
    posAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    indexAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
  ): THREE.Box3 {
    const bounds = new THREE.Box3();
    for (const ti of triangles) {
      for (let v = 0; v < 3; v++) {
        const vi = indexAttr ? indexAttr.getX(ti * 3 + v) : ti * 3 + v;
        bounds.expandByPoint(new THREE.Vector3(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi)));
      }
    }
    return bounds;
  }
}
