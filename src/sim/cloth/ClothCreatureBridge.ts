/**
 * Cloth-Creature Integration Bridge
 *
 * Connects the VerletCloth simulation to the CreatureRiggingSystem,
 * enabling simulated clothing on creatures with bone-pinned constraints
 * and cloth-vs-static-mesh collision.
 *
 * This is a self-contained bridge that implements its own lightweight
 * Verlet cloth simulation internally, avoiding hard dependencies on
 * VerletCloth.ts or CreatureRiggingSystem.ts. It bridges:
 *   - ClothingGenerator output → cloth particle grids
 *   - Creature skeleton bones → cloth pin constraints
 *   - Scene static meshes → cloth collision response
 *
 * Phase 3 — ClothCreatureBridge
 *
 * @module sim/cloth
 */

import * as THREE from 'three';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Configuration for a garment-to-cloth conversion.
 */
export interface ClothGarmentConfig {
  /** The garment mesh to convert to cloth simulation */
  garmentMesh: THREE.Mesh;
  /** Grid resolution for the cloth particle system (width x height) */
  gridResolution: { width: number; height: number };
  /** Which bones to pin to, and which rows of the cloth grid to pin */
  pinBindings: BonePinBinding[];
  /** Cloth simulation parameters */
  clothParams: {
    /** Structural constraint stiffness (default 1.0) */
    stiffness: number;
    /** Bending constraint stiffness (default 0.5) */
    bendingStiffness: number;
    /** Velocity damping per frame 0–1 (default 0.97) */
    damping: number;
    /** Particle mass (default 1.0) */
    mass: number;
    /** Wind effect multiplier (default 0.5) */
    windInfluence: number;
  };
}

/**
 * Binding that pins rows of the cloth grid to a named bone.
 */
export interface BonePinBinding {
  /** Name of the bone to pin to */
  boneName: string;
  /** Which rows of the cloth grid to pin (0 = top) */
  pinRows: number[];
  /** Offset from bone world position */
  offset: THREE.Vector3;
}

/**
 * Configuration for cloth-vs-static-mesh collision.
 */
export interface ClothMeshCollisionConfig {
  /** Static meshes to collide against */
  collisionMeshes: THREE.Mesh[];
  /** Collision margin — how far particles are pushed out (default 0.01) */
  margin: number;
  /** Maximum collision iterations per frame (default 3) */
  maxIterations: number;
}

// ============================================================================
// Internal Types
// ============================================================================

/** Internal particle representation for the self-contained Verlet sim. */
interface BridgeParticle {
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  restPosition: THREE.Vector3;
  acceleration: THREE.Vector3;
  inverseMass: number;
  pinned: boolean;
}

/** Internal distance constraint. */
interface BridgeConstraint {
  particleA: number;
  particleB: number;
  restLength: number;
  stiffness: number;
  active: boolean;
  type: 'structural' | 'shear' | 'bending';
}

/** Tracks a pinned particle bound to a bone. */
interface BonePin {
  particleIndex: number;
  bone: THREE.Bone;
  offset: THREE.Vector3;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CLOTH_PARAMS = {
  stiffness: 1.0,
  bendingStiffness: 0.5,
  damping: 0.97,
  mass: 1.0,
  windInfluence: 0.5,
};

const DEFAULT_COLLISION_CONFIG: ClothMeshCollisionConfig = {
  collisionMeshes: [],
  margin: 0.01,
  maxIterations: 3,
};

const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const SOLVER_ITERATIONS = 5;
const SUBSTEPS = 4;

// ============================================================================
// ClothCreatureBridge
// ============================================================================

/**
 * ClothCreatureBridge — Phase 3
 *
 * Bridges the ClothingGenerator, CreatureRiggingSystem, and VerletCloth
 * simulation so that garments on creatures are physically simulated with
 * bone-pinned constraints and mesh collision.
 *
 * Typical usage (inside an R3F component):
 * ```ts
 * const bridge = new ClothCreatureBridge(scene, skeleton, config);
 * bridge.setCollisionMeshes(collisionConfig);
 *
 * // In useFrame:
 * bridge.update(delta, wind);
 *
 * // Access the simulated mesh for rendering:
 * <primitive object={bridge.getSimulatedMesh()} />
 * ```
 */
export class ClothCreatureBridge {
  // ---------------------------------------------------------------------------
  // Internal simulation state
  // ---------------------------------------------------------------------------
  private particles: BridgeParticle[] = [];
  private constraints: BridgeConstraint[] = [];
  private bonePins: BonePin[] = [];

  // Grid dimensions (cached from config)
  private gridWidth: number;
  private gridHeight: number;

  // Rendering
  private geometry: THREE.BufferGeometry;
  private outputMesh: THREE.Mesh;

  // External references
  private scene: THREE.Scene;
  private skeleton: THREE.Skeleton | null;
  private config: ClothGarmentConfig;
  private collisionConfig: ClothMeshCollisionConfig;

  // Simulation controls
  private enabled: boolean = true;
  private wind: THREE.Vector3 = new THREE.Vector3();
  private time: number = 0;

  // Reusable temp objects to avoid GC pressure
  private readonly _tmpVec = new THREE.Vector3();
  private readonly _tmpVec2 = new THREE.Vector3();
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _rayDir = new THREE.Vector3();
  private readonly _rayOrigin = new THREE.Vector3();

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * @param scene    The THREE.Scene (the output mesh is added automatically).
   * @param skeleton The creature skeleton (may be null for static garments).
   * @param config   Garment-to-cloth configuration.
   */
  constructor(
    scene: THREE.Scene,
    skeleton: THREE.Skeleton | null,
    config: ClothGarmentConfig,
  ) {
    this.scene = scene;
    this.skeleton = skeleton;
    this.config = config;
    this.collisionConfig = { ...DEFAULT_COLLISION_CONFIG };

    this.gridWidth = config.gridResolution.width;
    this.gridHeight = config.gridResolution.height;

    // Ensure clothParams has all defaults filled in
    this.config.clothParams = { ...DEFAULT_CLOTH_PARAMS, ...config.clothParams };

    // Build the cloth from the garment mesh
    this.createClothFromGarment();

    // Build bone pin bindings if a skeleton was provided
    if (skeleton) {
      this.pinClothToBones(skeleton, config.pinBindings);
    }

    // Create renderable geometry and mesh
    this.geometry = this.buildGeometry();
    this.outputMesh = this.buildMesh();

    // Add to scene
    scene.add(this.outputMesh);
  }

  // ---------------------------------------------------------------------------
  // 1. Create Cloth From Garment
  // ---------------------------------------------------------------------------

  /**
   * Convert the garment mesh into a cloth particle grid that roughly
   * follows the garment shape. We sample positions from the garment's
   * bounding box and project them onto the mesh surface.
   */
  private createClothFromGarment(): void {
    const garment = this.config.garmentMesh;
    garment.updateMatrixWorld(true);

    // Compute bounding box in world space
    const bbox = new THREE.Box3().setFromObject(garment);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(center);

    const { width: segW, height: segH } = this.config.gridResolution;
    const { mass } = this.config.clothParams;

    // Raycaster for projecting grid points onto the garment surface
    const raycaster = new THREE.Raycaster();
    const downDir = new THREE.Vector3(0, -1, 0);

    this.particles = [];

    for (let row = 0; row <= segH; row++) {
      for (let col = 0; col <= segW; col++) {
        const u = col / segW;
        const v = row / segH;

        // Map to bounding box XY extents, start from above
        const x = center.x + (u - 0.5) * size.x;
        const y = center.y + size.y * 0.5 + 0.5; // above the top
        const z = center.z + (v - 0.5) * size.z;

        this._rayOrigin.set(x, y, z);
        raycaster.set(this._rayOrigin, downDir);
        raycaster.far = size.y + 2.0;

        const hits = raycaster.intersectObject(garment, false);

        let position: THREE.Vector3;
        if (hits.length > 0) {
          // Use the first hit point as initial position
          position = hits[0].point.clone();
        } else {
          // Fallback: distribute uniformly within bounding volume
          position = new THREE.Vector3(
            center.x + (u - 0.5) * size.x,
            center.y + (v - 0.5) * size.y,
            center.z,
          );
        }

        this.particles.push({
          position: position.clone(),
          previousPosition: position.clone(),
          restPosition: position.clone(),
          acceleration: new THREE.Vector3(),
          inverseMass: 1.0 / mass,
          pinned: false,
        });
      }
    }

    // Build constraints
    this.buildConstraints();
  }

  /**
   * Create structural, shear, and bending constraints for the particle grid.
   */
  private buildConstraints(): void {
    const { stiffness, bendingStiffness } = this.config.clothParams;
    const segW = this.gridWidth;
    const segH = this.gridHeight;
    const cols = segW + 1; // particles per row

    this.constraints = [];

    for (let row = 0; row <= segH; row++) {
      for (let col = 0; col <= segW; col++) {
        const idx = row * cols + col;

        // Structural — horizontal
        if (col < segW) {
          const right = idx + 1;
          this.addConstraint(idx, right, stiffness, 'structural');
        }

        // Structural — vertical
        if (row < segH) {
          const below = (row + 1) * cols + col;
          this.addConstraint(idx, below, stiffness, 'structural');
        }

        // Shear — diagonals
        if (col < segW && row < segH) {
          const diagA = (row + 1) * cols + (col + 1);
          this.addConstraint(idx, diagA, stiffness * 0.5, 'shear');
        }
        if (col > 0 && row < segH) {
          const diagB = (row + 1) * cols + (col - 1);
          this.addConstraint(idx, diagB, stiffness * 0.5, 'shear');
        }

        // Bending — skip one particle horizontally
        if (col < segW - 1) {
          const skipH = row * cols + (col + 2);
          this.addConstraint(idx, skipH, bendingStiffness, 'bending');
        }

        // Bending — skip one particle vertically
        if (row < segH - 1) {
          const skipV = (row + 2) * cols + col;
          this.addConstraint(idx, skipV, bendingStiffness, 'bending');
        }
      }
    }
  }

  /**
   * Helper — add a single distance constraint.
   */
  private addConstraint(
    a: number,
    b: number,
    stiffness: number,
    type: 'structural' | 'shear' | 'bending',
  ): void {
    const posA = this.particles[a].position;
    const posB = this.particles[b].position;
    const restLength = posA.distanceTo(posB);

    this.constraints.push({
      particleA: a,
      particleB: b,
      restLength,
      stiffness,
      active: true,
      type,
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Pin Cloth To Bones
  // ---------------------------------------------------------------------------

  /**
   * Pin specific rows of the cloth grid to creature skeleton bones.
   * For each BonePinBinding, find the bone in the skeleton, then mark
   * the corresponding particles as pinned and store a mapping so that
   * every frame the pinned particles follow the bone world position.
   */
  pinClothToBones(skeleton: THREE.Skeleton, bindings: BonePinBinding[]): void {
    const cols = this.gridWidth + 1;

    for (const binding of bindings) {
      // Find the bone by name
      const bone = skeleton.bones.find(
        (b) => b.name === binding.boneName,
      );
      if (!bone) {
        console.warn(
          `[ClothCreatureBridge] Bone "${binding.boneName}" not found in skeleton. Skipping pin binding.`,
        );
        continue;
      }

      // Pin each row specified in the binding
      for (const row of binding.pinRows) {
        if (row < 0 || row > this.gridHeight) {
          console.warn(
            `[ClothCreatureBridge] Pin row ${row} out of range [0..${this.gridHeight}]. Skipping.`,
          );
          continue;
        }

        for (let col = 0; col <= this.gridWidth; col++) {
          const particleIdx = row * cols + col;
          if (particleIdx >= this.particles.length) continue;

          const particle = this.particles[particleIdx];
          particle.pinned = true;
          particle.inverseMass = 0;

          // Compute initial offset: particle pos in bone-local space
          const boneWorldPos = new THREE.Vector3();
          bone.getWorldPosition(boneWorldPos);

          const offset = particle.position.clone().sub(boneWorldPos);
          // Apply the user-specified offset on top
          offset.add(binding.offset);

          this.bonePins.push({
            particleIndex: particleIdx,
            bone,
            offset: offset.clone(),
          });
        }
      }
    }
  }

  /**
   * Update all bone-pinned particles to follow their bones.
   * Called at the start of each frame before the simulation step.
   */
  private updateBonePins(): void {
    for (const pin of this.bonePins) {
      const particle = this.particles[pin.particleIndex];
      if (!particle.pinned) continue;

      // Get the bone's current world position
      pin.bone.getWorldPosition(this._tmpVec);

      // Apply offset in world space (transform offset by bone's world rotation)
      const boneWorldQuat = new THREE.Quaternion();
      pin.bone.getWorldQuaternion(boneWorldQuat);

      this._tmpVec2.copy(pin.offset).applyQuaternion(boneWorldQuat);
      this._tmpVec.add(this._tmpVec2);

      // Move the particle to the bone position + offset
      particle.previousPosition.copy(particle.position);
      particle.position.copy(this._tmpVec);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Resolve Cloth-Mesh Collisions
  // ---------------------------------------------------------------------------

  /**
   * Configure collision meshes for cloth-vs-static-mesh collision.
   */
  setCollisionMeshes(config: ClothMeshCollisionConfig): void {
    this.collisionConfig = {
      margin: config.margin ?? DEFAULT_COLLISION_CONFIG.margin,
      maxIterations: config.maxIterations ?? DEFAULT_COLLISION_CONFIG.maxIterations,
      collisionMeshes: config.collisionMeshes,
    };
  }

  /**
   * Push cloth particles out of static meshes.
   *
   * Strategy:
   *   For each collision mesh, for each non-pinned cloth particle,
   *   cast a ray from above the particle downward. If the ray hits
   *   the mesh and the hit is close to the particle, the particle
   *   is likely inside or penetrating the mesh. Push it outward
   *   along the surface normal by the collision margin.
   *
   *   We also cast rays from multiple directions for robustness.
   */
  private resolveClothMeshCollisions(): void {
    const { collisionMeshes, margin, maxIterations } = this.collisionConfig;
    if (collisionMeshes.length === 0) return;

    // Multiple ray directions for robust collision detection
    const rayDirections = [
      new THREE.Vector3(0, 1, 0),   // up
      new THREE.Vector3(0, -1, 0),  // down
      new THREE.Vector3(1, 0, 0),   // right
      new THREE.Vector3(-1, 0, 0),  // left
      new THREE.Vector3(0, 0, 1),   // forward
      new THREE.Vector3(0, 0, -1),  // back
    ];

    const rayMaxDist = 2.0; // how far to cast

    for (let iter = 0; iter < maxIterations; iter++) {
      let anyCollision = false;

      for (const mesh of collisionMeshes) {
        // Ensure the mesh has up-to-date world matrix for raycasting
        mesh.updateMatrixWorld(true);

        for (let i = 0; i < this.particles.length; i++) {
          const particle = this.particles[i];
          if (particle.pinned) continue;

          for (const dir of rayDirections) {
            // Set ray origin slightly away from particle along dir
            this._rayOrigin.copy(particle.position).addScaledVector(dir, margin * 0.5);
            this._rayDir.copy(dir).negate(); // shoot toward the particle

            this._raycaster.set(this._rayOrigin, this._rayDir);
            this._raycaster.far = rayMaxDist;
            this._raycaster.near = 0;

            const hits = this._raycaster.intersectObject(mesh, false);
            if (hits.length === 0) continue;

            const hit = hits[0];
            // If the hit is very close to the particle, it's penetrating
            const distToParticle = hit.distance - margin * 0.5;

            if (distToParticle < margin) {
              // Push particle out along the surface normal
              if (hit.face && hit.face.normal) {
                // Transform face normal to world space
                const normalWorld = hit.face.normal.clone()
                  .transformDirection(mesh.matrixWorld);

                const pushDist = margin - distToParticle;
                particle.position.addScaledVector(normalWorld, pushDist);
                anyCollision = true;
              }
            }
          }
        }
      }

      // Early exit if no collisions were found in this iteration
      if (!anyCollision) break;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Update (per-frame)
  // ---------------------------------------------------------------------------

  /**
   * Called each frame to advance the cloth simulation.
   *
   * @param dt   Delta time in seconds.
   * @param wind Optional wind force vector.
   */
  update(dt: number, wind?: THREE.Vector3): void {
    if (!this.enabled) return;

    // Clamp delta time for stability
    dt = Math.min(dt, 0.05);
    this.time += dt;

    // Store wind
    if (wind) {
      this.wind.copy(wind).multiplyScalar(this.config.clothParams.windInfluence);
    }

    // 1. Update bone-pinned positions
    this.updateBonePins();

    // 2. Run simulation substeps
    const subDt = dt / SUBSTEPS;
    for (let step = 0; step < SUBSTEPS; step++) {
      this.accumulateForces(subDt);
      this.integrateVerlet(subDt);
      this.satisfyConstraints();
      this.enforcePins();
    }

    // 3. Resolve mesh collisions
    this.resolveClothMeshCollisions();

    // 4. Update output mesh geometry
    this.updateGeometry();
  }

  // ---------------------------------------------------------------------------
  // Internal simulation helpers
  // ---------------------------------------------------------------------------

  /**
   * Accumulate forces (gravity + wind) on all non-pinned particles.
   */
  private accumulateForces(dt: number): void {
    for (const particle of this.particles) {
      if (particle.pinned) continue;

      // Reset acceleration
      particle.acceleration.set(0, 0, 0);

      // Gravity
      particle.acceleration.add(GRAVITY);

      // Wind
      if (this.wind.lengthSq() > 0) {
        // Add turbulence: vary wind per-particle based on position & time
        const turbulence = Math.sin(
          particle.position.x * 3.0 + this.time * 2.0,
        ) * 0.3;
        this._tmpVec.copy(this.wind);
        this._tmpVec.y += turbulence;
        particle.acceleration.add(this._tmpVec);
      }
    }
  }

  /**
   * Verlet integration step for all non-pinned particles.
   */
  private integrateVerlet(dt: number): void {
    const damping = this.config.clothParams.damping;

    for (const particle of this.particles) {
      if (particle.pinned) continue;

      // velocity = (position - previousPosition) * damping
      this._tmpVec.copy(particle.position)
        .sub(particle.previousPosition)
        .multiplyScalar(damping);

      // newPosition = position + velocity + acceleration * dt^2
      this._tmpVec2.copy(particle.position)
        .add(this._tmpVec)
        .add(particle.acceleration.clone().multiplyScalar(dt * dt));

      particle.previousPosition.copy(particle.position);
      particle.position.copy(this._tmpVec2);
    }
  }

  /**
   * Iterative constraint satisfaction (position-based dynamics).
   */
  private satisfyConstraints(): void {
    for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
      for (const constraint of this.constraints) {
        if (!constraint.active) continue;

        const pA = this.particles[constraint.particleA];
        const pB = this.particles[constraint.particleB];

        if (pA.pinned && pB.pinned) continue;

        this._tmpVec.copy(pB.position).sub(pA.position);
        const distance = this._tmpVec.length();

        if (distance < 1e-8) continue;

        const diff = (distance - constraint.restLength) / distance;
        const correction = diff * 0.5 * constraint.stiffness;

        this._tmpVec2.copy(this._tmpVec).multiplyScalar(correction);

        if (!pA.pinned) {
          pA.position.add(this._tmpVec2);
        }
        if (!pB.pinned) {
          pB.position.sub(this._tmpVec2);
        }
      }
    }
  }

  /**
   * Enforce pin constraints after simulation step — snap pinned
   * particles back to their bone-driven positions.
   */
  private enforcePins(): void {
    for (const pin of this.bonePins) {
      const particle = this.particles[pin.particleIndex];
      if (!particle.pinned) continue;

      // Re-read bone position (it may have moved during the frame)
      pin.bone.getWorldPosition(this._tmpVec);

      const boneWorldQuat = new THREE.Quaternion();
      pin.bone.getWorldQuaternion(boneWorldQuat);

      this._tmpVec2.copy(pin.offset).applyQuaternion(boneWorldQuat);
      this._tmpVec.add(this._tmpVec2);

      particle.position.copy(this._tmpVec);
      // Also update previousPosition so Verlet doesn't add velocity
      particle.previousPosition.copy(this._tmpVec);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Output Mesh
  // ---------------------------------------------------------------------------

  /**
   * Build the BufferGeometry from the current particle grid.
   */
  private buildGeometry(): THREE.BufferGeometry {
    const segW = this.gridWidth;
    const segH = this.gridHeight;
    const geometry = new THREE.BufferGeometry();

    // Positions
    const positions: number[] = [];
    for (const p of this.particles) {
      positions.push(p.position.x, p.position.y, p.position.z);
    }

    // UVs
    const uvs: number[] = [];
    for (let row = 0; row <= segH; row++) {
      for (let col = 0; col <= segW; col++) {
        uvs.push(col / segW, row / segH);
      }
    }

    // Indices
    const indices: number[] = [];
    const cols = segW + 1;
    for (let row = 0; row < segH; row++) {
      for (let col = 0; col < segW; col++) {
        const a = row * cols + col;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Build the output THREE.Mesh for rendering the simulated cloth.
   */
  private buildMesh(): THREE.Mesh {
    // Inherit material from the garment mesh if possible
    let material: THREE.Material;
    const garmentMat = this.config.garmentMesh.material;
    if (garmentMat instanceof THREE.Material) {
      material = garmentMat.clone();
      if (material instanceof THREE.MeshStandardMaterial) {
        material.side = THREE.DoubleSide;
      }
    } else {
      material = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        side: THREE.DoubleSide,
        roughness: 0.7,
        metalness: 0.1,
      });
    }

    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'cloth-creature-bridge';

    return mesh;
  }

  /**
   * Update the BufferGeometry vertex positions from the current particles.
   */
  private updateGeometry(): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i].position;
      posAttr.setXYZ(i, p.x, p.y, p.z);
    }

    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /**
   * Returns the THREE.Mesh that visualizes the simulated cloth.
   * Add this to your scene or use as a `<primitive>` in R3F.
   */
  getSimulatedMesh(): THREE.Mesh {
    return this.outputMesh;
  }

  // ---------------------------------------------------------------------------
  // Public API — Configuration
  // ---------------------------------------------------------------------------

  /**
   * Enable or disable the simulation loop.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if the simulation is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set the wind force applied to the cloth (will be scaled by windInfluence).
   */
  setWind(wind: THREE.Vector3): void {
    this.wind.copy(wind).multiplyScalar(this.config.clothParams.windInfluence);
  }

  /**
   * Override the cloth material on the output mesh.
   */
  setMaterial(material: THREE.Material): void {
    this.outputMesh.material = material;
  }

  /**
   * Get the current garment config.
   */
  getConfig(): ClothGarmentConfig {
    return this.config;
  }

  // ---------------------------------------------------------------------------
  // Public API — Bone Pin Management
  // ---------------------------------------------------------------------------

  /**
   * Dynamically add a new bone pin binding at runtime.
   */
  addBonePin(binding: BonePinBinding): void {
    if (!this.skeleton) {
      console.warn('[ClothCreatureBridge] Cannot add bone pin: no skeleton.');
      return;
    }
    this.pinClothToBones(this.skeleton, [binding]);
  }

  /**
   * Remove all bone pins for a given bone name.
   */
  removeBonePins(boneName: string): void {
    const bone = this.skeleton?.bones.find((b) => b.name === boneName);
    if (!bone) return;

    // Unpin particles that were bound to this bone
    const removedIndices = new Set<number>();
    this.bonePins = this.bonePins.filter((pin) => {
      if (pin.bone === bone) {
        removedIndices.add(pin.particleIndex);
        return false;
      }
      return true;
    });

    // Re-enable dynamics on those particles (if no other pin holds them)
    const stillPinned = new Set(this.bonePins.map((p) => p.particleIndex));
    for (const idx of removedIndices) {
      if (!stillPinned.has(idx)) {
        const particle = this.particles[idx];
        particle.pinned = false;
        particle.inverseMass = 1.0 / this.config.clothParams.mass;
      }
    }
  }

  /**
   * Get the list of current bone pin bindings (read-only snapshot).
   */
  getBonePins(): ReadonlyArray<{ particleIndex: number; boneName: string; offset: THREE.Vector3 }> {
    return this.bonePins.map((pin) => ({
      particleIndex: pin.particleIndex,
      boneName: pin.bone.name,
      offset: pin.offset.clone(),
    }));
  }

  // ---------------------------------------------------------------------------
  // Public API — Diagnostics
  // ---------------------------------------------------------------------------

  /**
   * Get the total number of particles in the cloth grid.
   */
  getParticleCount(): number {
    return this.particles.length;
  }

  /**
   * Get the number of active (non-torn) constraints.
   */
  getActiveConstraintCount(): number {
    return this.constraints.filter((c) => c.active).length;
  }

  /**
   * Get the number of bone-pinned particles.
   */
  getPinnedCount(): number {
    return this.particles.filter((p) => p.pinned).length;
  }

  /**
   * Get the center of mass of all non-pinned particles.
   */
  getCenterOfMass(): THREE.Vector3 {
    const center = new THREE.Vector3();
    let count = 0;

    for (const p of this.particles) {
      if (!p.pinned) {
        center.add(p.position);
        count++;
      }
    }

    if (count > 0) center.divideScalar(count);
    return center;
  }

  /**
   * Get the bounding box of all particles.
   */
  getBoundingBox(): { min: THREE.Vector3; max: THREE.Vector3 } {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (const p of this.particles) {
      min.min(p.position);
      max.max(p.position);
    }

    return { min, max };
  }

  // ---------------------------------------------------------------------------
  // Reset & Dispose
  // ---------------------------------------------------------------------------

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
   * Dispose of all resources (geometry, material, remove from scene).
   */
  dispose(): void {
    this.scene.remove(this.outputMesh);
    this.geometry.dispose();

    if (this.outputMesh.material instanceof THREE.Material) {
      this.outputMesh.material.dispose();
    }

    this.particles = [];
    this.constraints = [];
    this.bonePins = [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export default ClothCreatureBridge;
