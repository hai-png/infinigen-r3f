/**
 * RagdollSimulationBridge.ts — Bridges the existing ragdoll system with the
 * physics world for complete simulation.
 *
 * Fills the four gaps identified in the reaudit of CreatureRagdollAndMuscles.ts:
 * 1. Ground collision — prevents ragdoll from falling through the ground plane
 * 2. Simulation stepping — integrates ragdoll physics with PhysicsWorld.step()
 * 3. Impact detection — detects when a creature should transition to ragdoll mode
 * 4. Animation ↔ ragdoll blending — smooth transitions between driven modes
 *
 * @module creatures/RagdollSimulationBridge
 */

import * as THREE from 'three';
import {
  RagdollPhysics,
  RagdollConfig,
  RagdollBody,
  SpringHingeConstraint,
} from '@/assets/objects/creatures/CreatureRagdollAndMuscles';
import { CompositionalGenome } from '@/assets/objects/creatures/genome/CompositionalGenome';
import { PhysicsWorld } from '@/sim/physics/PhysicsWorld';
import { RigidBody } from '@/sim/physics/RigidBody';
import { createBoxShape } from '@/sim/physics/PhysicsWorld';

// ============================================================================
// 1. RagdollBlendState
// ============================================================================

/**
 * Enumeration of the four states a creature can be in with respect to
 * ragdoll blending.
 *
 * State machine transitions:
 *   ANIMATED ──▶ BLENDING_TO_RAGDOLL ──▶ RAGDOLL
 *   RAGDOLL  ──▶ BLENDING_TO_ANIMATED ──▶ ANIMATED
 */
export enum RagdollBlendState {
  /** Fully animation-driven (no physics influence) */
  ANIMATED = 'ANIMATED',
  /** Transitioning from animation to ragdoll (blend factor 0→1) */
  BLENDING_TO_RAGDOLL = 'BLENDING_TO_RAGDOLL',
  /** Fully physics-driven ragdoll */
  RAGDOLL = 'RAGDOLL',
  /** Transitioning from ragdoll back to animation (blend factor 1→0) */
  BLENDING_TO_ANIMATED = 'BLENDING_TO_ANIMATED',
}

// ============================================================================
// 2. RagdollSimulationConfig
// ============================================================================

/**
 * Configuration for the ragdoll simulation bridge.
 *
 * Controls physics parameters, impact thresholds, blending timing,
 * and sub-stepping for the simulation loop.
 */
export interface RagdollSimulationConfig {
  /** Gravity vector (default: (0, -9.81, 0)) */
  gravity: THREE.Vector3;
  /** Y coordinate of the ground plane (default: 0) */
  groundHeight: number;
  /** Linear speed above which a collision triggers ragdoll mode (m/s, default: 5) */
  impactVelocityThreshold: number;
  /** Seconds for animation↔ragdoll transition (default: 0.3) */
  blendDuration: number;
  /** Maximum physics sub-steps per frame (default: 4) */
  maxSimulationSteps: number;
  /** Fixed physics time step in seconds (default: 1/60) */
  timeStep: number;
  /** Whether to automatically switch to ragdoll on detected impact (default: true) */
  autoWakeOnImpact: boolean;
  /** Speed below which the ragdoll is considered settled (m/s, default: 0.15) */
  settleThreshold: number;
}

/** Default simulation configuration */
export const DEFAULT_RAGDOLL_SIM_CONFIG: RagdollSimulationConfig = {
  gravity: new THREE.Vector3(0, -9.81, 0),
  groundHeight: 0,
  impactVelocityThreshold: 5.0,
  blendDuration: 0.3,
  maxSimulationSteps: 4,
  timeStep: 1 / 60,
  autoWakeOnImpact: true,
  settleThreshold: 0.15,
};

// ============================================================================
// 3. Pose types
// ============================================================================

/**
 * A single bone's pose: position + quaternion.
 */
export interface BonePose {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
}

/**
 * Full creature pose — map of bone name → BonePose.
 */
export type CreaturePose = Map<string, BonePose>;

// ============================================================================
// 4. ImpactDetector
// ============================================================================

/**
 * ImpactDetector — Detects when a rigid body experiences an impact
 * strong enough to trigger ragdoll mode.
 *
 * Monitors body velocities against a configurable threshold and fires
 * callbacks when an impact is detected. Also provides impact point and
 * normal information for downstream systems (e.g., applying impulse
 * or playing hit effects).
 *
 * Usage:
 * ```typescript
 * const detector = new ImpactDetector();
 * detector.onImpact((body, point, normal) => {
 *   console.log('Impact detected at', point, 'with normal', normal);
 * });
 *
 * // Each frame, check bodies:
 * for (const body of ragdollBodies) {
 *   detector.checkForImpact(body, threshold);
 * }
 * ```
 */
export class ImpactDetector {
  /** Registered impact callbacks */
  private callbacks: Array<(body: RigidBody, point: THREE.Vector3, normal: THREE.Vector3) => void> = [];

  /** Bodies that have already triggered impact this cycle (prevent re-fire) */
  private impactedBodies: Set<string> = new Set();

  /** Most recent impact point per body (world-space) */
  private lastImpactPoint: Map<string, THREE.Vector3> = new Map();

  /** Most recent impact normal per body */
  private lastImpactNormal: Map<string, THREE.Vector3> = new Map();

  /**
   * Check if a rigid body's velocity exceeds the impact threshold.
   *
   * Evaluates both linear speed and angular speed. When the combined
   * kinetic energy proxy exceeds the threshold, the impact callbacks
   * are invoked and the impact point/normal are cached.
   *
   * @param body - The rigid body to evaluate
   * @param threshold - Minimum velocity magnitude to qualify as impact (m/s)
   * @returns True if an impact was detected for this body
   */
  checkForImpact(body: RigidBody, threshold: number): boolean {
    const linearSpeed = body.linearVelocity.length();
    const angularSpeed = body.angularVelocity.length();

    // Combined kinetic proxy: linear speed dominates, angular adds margin
    const combinedSpeed = linearSpeed + angularSpeed * 0.3;

    if (combinedSpeed > threshold) {
      if (!this.impactedBodies.has(body.id)) {
        // New impact — compute point and normal
        const point = this.getImpactPoint(body);
        const normal = new THREE.Vector3(0, 1, 0); // Default upward normal

        this.impactedBodies.add(body.id);
        this.lastImpactPoint.set(body.id, point.clone());
        this.lastImpactNormal.set(body.id, normal.clone());

        // Fire callbacks
        for (const cb of this.callbacks) {
          cb(body, point, normal);
        }

        return true;
      }
    } else {
      // Body has slowed below threshold — allow re-trigger
      this.impactedBodies.delete(body.id);
    }

    return false;
  }

  /**
   * Register a callback that fires when an impact is detected.
   *
   * @param callback - Function receiving (body, impactPoint, impactNormal)
   */
  onImpact(callback: (body: RigidBody, point: THREE.Vector3, normal: THREE.Vector3) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Get the world-space impact point for a body.
   *
   * The impact point is approximated as the body's current position
   * offset toward the velocity direction by half the body's extent
   * (estimated from its speed and geometry).
   *
   * @param body - The rigid body that experienced impact
   * @returns World-space impact point
   */
  getImpactPoint(body: RigidBody): THREE.Vector3 {
    const cached = this.lastImpactPoint.get(body.id);
    if (cached) return cached.clone();

    // Approximate: body center offset slightly in velocity direction
    const speed = body.linearVelocity.length();
    if (speed > 0.001) {
      const dir = body.linearVelocity.clone().normalize();
      // Offset by a small amount toward the velocity direction
      return body.position.clone().sub(dir.multiplyScalar(0.1));
    }
    return body.position.clone();
  }

  /**
   * Get the impact surface normal for a body.
   *
   * If the body is near the ground, returns the ground normal (up).
   * Otherwise, returns the negative velocity direction (collision surface
   * is perpendicular to approach direction).
   *
   * @param body - The rigid body that experienced impact
   * @param groundHeight - Y coordinate of the ground plane
   * @returns Surface normal at the impact point
   */
  getImpactNormal(body: RigidBody, groundHeight: number): THREE.Vector3 {
    // If body is near ground level, impact normal is upward
    const distToGround = body.position.y - groundHeight;
    if (distToGround < 1.0) {
      return new THREE.Vector3(0, 1, 0);
    }

    // Otherwise, normal is opposite to velocity
    const speed = body.linearVelocity.length();
    if (speed > 0.001) {
      return body.linearVelocity.clone().normalize().negate();
    }

    return new THREE.Vector3(0, 1, 0);
  }

  /**
   * Reset impact state. Call at the start of a new frame.
   */
  reset(): void {
    this.impactedBodies.clear();
  }
}

// ============================================================================
// 5. RagdollVisualSync
// ============================================================================

/**
 * RagdollVisualSync — Synchronizes the Three.js visual representation
 * from the physics simulation with blend factor support.
 *
 * During ANIMATED state the visual mesh is driven by the animation system.
 * During RAGDOLL state the visual mesh is driven by physics bodies.
 * During blending, the two poses are interpolated using the blend factor.
 *
 * Usage:
 * ```typescript
 * const sync = new RagdollVisualSync();
 * sync.syncFromPhysics(creatureGroup, ragdollConfig, blendFactor);
 * ```
 */
export class RagdollVisualSync {
  /** Cached animated pose (captured at blend start) */
  private animatedPose: CreaturePose = new Map();

  /** Cached ragdoll pose (captured at blend start) */
  private ragdollPose: CreaturePose = new Map();

  /**
   * Synchronize visual mesh from physics with blend support.
   *
   * @param creatureGroup - The creature's Three.js group
   * @param ragdollConfig - Current ragdoll configuration
   * @param blendFactor - 0 = fully animated, 1 = fully ragdoll
   */
  syncFromPhysics(
    creatureGroup: THREE.Group,
    ragdollConfig: RagdollConfig,
    blendFactor: number,
  ): void {
    // Clamp blend factor
    const factor = Math.max(0, Math.min(1, blendFactor));

    if (factor <= 0) {
      // Fully animated — no physics sync needed
      return;
    }

    // For each ragdoll body, update its associated scene node
    for (const body of ragdollConfig.bodies) {
      if (!body.sceneNode) continue;

      if (factor >= 1) {
        // Fully ragdoll — directly apply physics state
        body.sceneNode.position.copy(body.rigidBody.position);
        body.sceneNode.quaternion.copy(body.rigidBody.rotation);

        // Apply local offset correction
        if (body.localOffset.lengthSq() > 0) {
          const offset = body.localOffset.clone().applyQuaternion(body.rigidBody.rotation);
          body.sceneNode.position.sub(offset);
        }
      } else {
        // Blending — interpolate between animated and ragdoll poses
        const animatedPose = this.animatedPose.get(body.id);
        const ragdollPosition = body.rigidBody.position.clone();
        const ragdollRotation = body.rigidBody.rotation.clone();

        // Apply local offset correction to ragdoll position
        if (body.localOffset.lengthSq() > 0) {
          const offset = body.localOffset.clone().applyQuaternion(body.rigidBody.rotation);
          ragdollPosition.sub(offset);
        }

        if (animatedPose) {
          // Blend position
          body.sceneNode.position.lerpVectors(
            animatedPose.position,
            ragdollPosition,
            factor,
          );
          // Blend rotation
          body.sceneNode.quaternion.slerpQuaternions(
            animatedPose.rotation,
            ragdollRotation,
            factor,
          );
        } else {
          // No cached animated pose — just apply ragdoll with factor
          body.sceneNode.position.copy(ragdollPosition);
          body.sceneNode.quaternion.copy(ragdollRotation);
        }
      }
    }

    // Update world matrices
    creatureGroup.updateMatrixWorld(true);
  }

  /**
   * Interpolate between an animated pose and a ragdoll pose.
   *
   * @param animatedPose - The animation-driven pose
   * @param ragdollPose - The physics-driven pose
   * @param factor - Blend factor (0 = animated, 1 = ragdoll)
   * @returns Blended pose
   */
  blendPose(
    animatedPose: CreaturePose,
    ragdollPose: CreaturePose,
    factor: number,
  ): CreaturePose {
    const result: CreaturePose = new Map();
    const clampedFactor = Math.max(0, Math.min(1, factor));

    // Iterate all bones in the animated pose
    for (const [boneName, animatedBone] of animatedPose) {
      const ragdollBone = ragdollPose.get(boneName);

      if (ragdollBone) {
        result.set(boneName, {
          position: new THREE.Vector3().lerpVectors(
            animatedBone.position,
            ragdollBone.position,
            clampedFactor,
          ),
          rotation: new THREE.Quaternion().slerpQuaternions(
            animatedBone.rotation,
            ragdollBone.rotation,
            clampedFactor,
          ),
        });
      } else {
        // No corresponding ragdoll bone — keep animated
        result.set(boneName, {
          position: animatedBone.position.clone(),
          rotation: animatedBone.rotation.clone(),
        });
      }
    }

    return result;
  }

  /**
   * Extract the current pose from a creature group as an array of
   * position + rotation for each bone.
   *
   * @param creatureGroup - The creature's Three.js group
   * @returns Map of bone name → { position, rotation }
   */
  extractPose(creatureGroup: THREE.Group): CreaturePose {
    const pose: CreaturePose = new Map();

    creatureGroup.traverse((child) => {
      if (child instanceof THREE.Bone || child.type === 'Bone') {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        child.getWorldPosition(worldPos);
        child.getWorldQuaternion(worldQuat);

        pose.set(child.name, {
          position: worldPos,
          rotation: worldQuat,
        });
      }
    });

    return pose;
  }

  /**
   * Apply a pose to the creature's bones.
   *
   * @param creatureGroup - The creature's Three.js group
   * @param pose - Map of bone name → { position, rotation }
   */
  applyPose(creatureGroup: THREE.Group, pose: CreaturePose): void {
    for (const [boneName, bonePose] of pose) {
      const bone = creatureGroup.getObjectByName(boneName);
      if (bone) {
        bone.position.copy(bonePose.position);
        bone.quaternion.copy(bonePose.rotation);
      }
    }

    creatureGroup.updateMatrixWorld(true);
  }

  /**
   * Cache the current animated pose for blending.
   * Call when starting a blend transition.
   */
  cacheAnimatedPose(creatureGroup: THREE.Group): void {
    this.animatedPose = this.extractPose(creatureGroup);
  }

  /**
   * Cache the current ragdoll pose for blending.
   * Call when starting a blend transition back to animation.
   */
  cacheRagdollPose(ragdollConfig: RagdollConfig): void {
    this.ragdollPose.clear();

    for (const body of ragdollConfig.bodies) {
      this.ragdollPose.set(body.id, {
        position: body.rigidBody.position.clone(),
        rotation: body.rigidBody.rotation.clone(),
      });
    }
  }

  /**
   * Get the cached animated pose.
   */
  getAnimatedPose(): CreaturePose {
    return this.animatedPose;
  }

  /**
   * Get the cached ragdoll pose.
   */
  getRagdollPose(): CreaturePose {
    return this.ragdollPose;
  }
}

// ============================================================================
// 6. RagdollSimulationBridge
// ============================================================================

/** ID for the ground plane static body in the physics world */
const GROUND_BODY_ID = '__ragdoll_ground_plane__';
/** ID for the ground plane collider */
const GROUND_COLLIDER_ID = '__ragdoll_ground_collider__';

/**
 * RagdollSimulationBridge — Bridges the existing CreatureRagdollAndMuscles
 * ragdoll system with the PhysicsWorld for complete simulation.
 *
 * Provides:
 * - Ground collision (prevents ragdoll falling through floor)
 * - Simulation stepping integrated with PhysicsWorld
 * - Impact detection (triggers ragdoll on hard collisions)
 * - Smooth blending between animation and ragdoll modes
 *
 * State machine:
 *   ANIMATED ←→ BLENDING_TO_RAGDOLL ←→ RAGDOLL ←→ BLENDING_TO_ANIMATED ←→ ANIMATED
 *
 * Usage:
 * ```typescript
 * const bridge = new RagdollSimulationBridge();
 * bridge.createAndAttach(creatureGroup, genome, skeleton, physicsWorld);
 *
 * // Each frame:
 * bridge.stepSimulation(dt);
 *
 * // Trigger ragdoll on impact:
 * if (bridge.detectImpact(velocity, 5.0)) {
 *   bridge.blendToRagdoll(creatureGroup, ragdollConfig, 0.3);
 * }
 * ```
 */
export class RagdollSimulationBridge {
  // ── Internal state ──────────────────────────────────────────────────

  /** Current blend state */
  private state: RagdollBlendState = RagdollBlendState.ANIMATED;

  /** Ragdoll configuration (created by createAndAttach) */
  private ragdollConfig: RagdollConfig | null = null;

  /** The physics world the ragdoll is attached to */
  private physicsWorld: PhysicsWorld | null = null;

  /** The creature group */
  private creatureGroup: THREE.Group | null = null;

  /** Simulation configuration */
  private simConfig: RagdollSimulationConfig;

  /** Impact detector */
  private impactDetector: ImpactDetector;

  /** Visual synchronization */
  private visualSync: RagdollVisualSync;

  /** Current blend factor (0 = animated, 1 = ragdoll) */
  private blendFactor: number = 0;

  /** Elapsed blend time (seconds) */
  private blendElapsed: number = 0;

  /** Target blend duration for current transition */
  private currentBlendDuration: number = 0.3;

  /** Whether ground collision has been added */
  private groundAdded: boolean = false;

  /** Ragdoll physics factory */
  private ragdollPhysics: RagdollPhysics;

  /** Time accumulator for sub-stepping */
  private accumulator: number = 0;

  constructor(config: Partial<RagdollSimulationConfig> = {}) {
    this.simConfig = { ...DEFAULT_RAGDOLL_SIM_CONFIG, ...config };
    this.impactDetector = new ImpactDetector();
    this.visualSync = new RagdollVisualSync();
    this.ragdollPhysics = new RagdollPhysics();

    // If gravity is provided as a plain object, convert to Vector3
    if (!(this.simConfig.gravity instanceof THREE.Vector3)) {
      this.simConfig.gravity = new THREE.Vector3(
        (this.simConfig.gravity as any).x ?? 0,
        (this.simConfig.gravity as any).y ?? -9.81,
        (this.simConfig.gravity as any).z ?? 0,
      );
    }
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Create a ragdoll from the genome and attach it to the physics world.
   *
   * Steps:
   * 1. Create RagdollConfig via RagdollPhysics.createRagdoll()
   * 2. Apply it to the physics world via RagdollPhysics.applyRagdoll()
   * 3. Add ground plane collision
   * 4. Store references for stepping and syncing
   *
   * @param creatureGroup - The creature's Three.js group
   * @param genome - The creature's compositional genome
   * @param skeleton - The creature's Three.js skeleton
   * @param physicsWorld - The physics world to attach to
   * @returns The created RagdollConfig
   */
  createAndAttach(
    creatureGroup: THREE.Group,
    genome: CompositionalGenome,
    skeleton: THREE.Skeleton,
    physicsWorld: PhysicsWorld,
  ): RagdollConfig {
    // Store references
    this.creatureGroup = creatureGroup;
    this.physicsWorld = physicsWorld;

    // Create ragdoll configuration
    const config = this.ragdollPhysics.createRagdoll(genome, skeleton);
    config.creatureGroup = creatureGroup;

    // Apply ragdoll to physics world (registers bodies, colliders, joints)
    this.ragdollPhysics.applyRagdoll(config, physicsWorld);

    // Set gravity on the physics world
    physicsWorld.setGravity(this.simConfig.gravity);

    // Add ground plane collision
    this.handleGroundCollision(this.simConfig.groundHeight);

    // Store config
    this.ragdollConfig = config;

    // Initially all bodies sleep (creature is animation-driven)
    for (const body of config.bodies) {
      body.rigidBody.awake = false;
    }

    // Register impact callback for auto-wake
    if (this.simConfig.autoWakeOnImpact) {
      this.impactDetector.onImpact((body, _point, _normal) => {
        if (this.state === RagdollBlendState.ANIMATED) {
          this.blendToRagdoll(
            creatureGroup,
            config,
            this.simConfig.blendDuration,
          );
        }
      });
    }

    return config;
  }

  /**
   * Step the physics simulation and synchronize visuals.
   *
   * This is the main per-frame update. It:
   * 1. Advances the blend transition if blending
   * 2. Steps the physics world (with sub-stepping)
   * 3. Applies ground constraint (hard floor)
   * 4. Checks for impacts
   * 5. Syncs visual meshes from physics
   *
   * @param dt - Frame delta time in seconds
   */
  stepSimulation(dt: number): void {
    if (!this.physicsWorld || !this.ragdollConfig || !this.creatureGroup) return;

    // ── 1. Advance blend transition ──────────────────────────────────
    this.advanceBlend(dt);

    // ── 2. Only step physics when in ragdoll or blending modes ───────
    if (this.state !== RagdollBlendState.ANIMATED) {
      // Sub-stepping for stability
      const clampedDt = Math.min(dt, this.simConfig.timeStep * this.simConfig.maxSimulationSteps);
      this.accumulator += clampedDt;

      let steps = 0;
      while (this.accumulator >= this.simConfig.timeStep && steps < this.simConfig.maxSimulationSteps) {
        this.physicsWorld.step(this.simConfig.timeStep);
        this.accumulator -= this.simConfig.timeStep;
        steps++;

        // ── 3. Apply ground constraint ─────────────────────────────
        this.enforceGroundConstraint(this.simConfig.groundHeight);
      }
    }

    // ── 4. Check for impacts (only in ANIMATED state) ────────────────
    if (this.state === RagdollBlendState.ANIMATED && this.simConfig.autoWakeOnImpact) {
      for (const body of this.ragdollConfig.bodies) {
        if (body.rigidBody.awake) {
          this.impactDetector.checkForImpact(body.rigidBody, this.simConfig.impactVelocityThreshold);
        }
      }
    }

    // ── 5. Sync visuals ──────────────────────────────────────────────
    this.visualSync.syncFromPhysics(
      this.creatureGroup,
      this.ragdollConfig,
      this.blendFactor,
    );

    // ── 6. Check for ragdoll settlement (auto-return to animation) ───
    if (this.state === RagdollBlendState.RAGDOLL) {
      if (this.isRagdollSettled()) {
        // Optional: could auto-blend back to animation
        // For now, stay in RAGDOLL until explicitly told otherwise
      }
    }
  }

  /**
   * Add a ground plane collision body to prevent ragdoll from falling
   * through the floor.
   *
   * Creates a static body at groundHeight with a large flat box collider.
   *
   * @param groundHeight - Y coordinate of the ground surface
   */
  handleGroundCollision(groundHeight: number): void {
    if (!this.physicsWorld) return;
    if (this.groundAdded) return;

    this.simConfig.groundHeight = groundHeight;

    // Create a static ground plane as a very flat, very wide box
    this.physicsWorld.addBody({
      id: GROUND_BODY_ID,
      bodyType: 'static',
      position: new THREE.Vector3(0, groundHeight - 0.5, 0),
      mass: 0, // Static
      linearDamping: 0,
      angularDamping: 0,
    });

    // Add a box collider for the ground
    this.physicsWorld.addCollider(
      {
        id: GROUND_COLLIDER_ID,
        shape: 'box' as any,
        halfExtents: new THREE.Vector3(500, 0.5, 500), // Very large flat plane
        isTrigger: false,
        friction: 0.8,
        restitution: 0.2,
      },
      GROUND_BODY_ID,
    );

    this.groundAdded = true;
  }

  /**
   * Detect if a velocity exceeds the impact threshold.
   *
   * Convenience method that delegates to ImpactDetector.
   * Can also be called manually to check arbitrary velocity vectors.
   *
   * @param velocity - Velocity vector to check
   * @param threshold - Speed threshold (defaults to config threshold)
   * @returns True if velocity magnitude exceeds threshold
   */
  detectImpact(velocity: THREE.Vector3, threshold?: number): boolean {
    const t = threshold ?? this.simConfig.impactVelocityThreshold;
    return velocity.length() > t;
  }

  /**
   * Smoothly blend from animation to ragdoll mode over N seconds.
   *
   * Caches the current animated pose and begins the blend transition.
   * The blend is advanced each frame in stepSimulation().
   *
   * @param creatureGroup - The creature's Three.js group
   * @param config - The ragdoll configuration
   * @param blendDuration - Duration of the blend in seconds
   */
  blendToRagdoll(
    creatureGroup: THREE.Group,
    config: RagdollConfig,
    blendDuration?: number,
  ): void {
    if (this.state === RagdollBlendState.RAGDOLL) return;
    if (this.state === RagdollBlendState.BLENDING_TO_RAGDOLL) return;

    this.currentBlendDuration = blendDuration ?? this.simConfig.blendDuration;
    this.blendElapsed = 0;
    this.state = RagdollBlendState.BLENDING_TO_RAGDOLL;

    // Cache animated pose for blending
    this.visualSync.cacheAnimatedPose(creatureGroup);

    // Initialize ragdoll body positions from current skeleton pose
    for (const body of config.bodies) {
      if (body.sceneNode) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        body.sceneNode.getWorldPosition(worldPos);
        body.sceneNode.getWorldQuaternion(worldQuat);

        body.rigidBody.position.copy(worldPos);
        body.rigidBody.rotation.copy(worldQuat);
      }

      // Wake all bodies for physics simulation
      body.rigidBody.wake();
    }

    config.isActive = true;
    config.creatureGroup = creatureGroup;
  }

  /**
   * Smoothly blend from ragdoll back to animation over N seconds.
   *
   * Caches the current ragdoll pose and begins the reverse blend.
   * The blend is advanced each frame in stepSimulation().
   *
   * @param creatureGroup - The creature's Three.js group
   * @param config - The ragdoll configuration
   * @param blendDuration - Duration of the blend in seconds
   */
  blendToAnimation(
    creatureGroup: THREE.Group,
    config: RagdollConfig,
    blendDuration?: number,
  ): void {
    if (this.state === RagdollBlendState.ANIMATED) return;
    if (this.state === RagdollBlendState.BLENDING_TO_ANIMATED) return;

    this.currentBlendDuration = blendDuration ?? this.simConfig.blendDuration;
    this.blendElapsed = 0;
    this.state = RagdollBlendState.BLENDING_TO_ANIMATED;

    // Cache ragdoll pose for blending
    this.visualSync.cacheRagdollPose(config);

    // Slow down ragdoll bodies during blend
    for (const body of config.bodies) {
      body.rigidBody.linearVelocity.multiplyScalar(0.5);
      body.rigidBody.angularVelocity.multiplyScalar(0.5);
    }
  }

  /**
   * Get the current ragdoll blend state.
   *
   * @returns Current RagdollBlendState
   */
  getRagdollState(): RagdollBlendState {
    return this.state;
  }

  /**
   * Get the current blend factor (0 = animated, 1 = ragdoll).
   */
  getBlendFactor(): number {
    return this.blendFactor;
  }

  /**
   * Get the simulation configuration.
   */
  getSimConfig(): RagdollSimulationConfig {
    return this.simConfig;
  }

  /**
   * Get the impact detector for custom impact handling.
   */
  getImpactDetector(): ImpactDetector {
    return this.impactDetector;
  }

  /**
   * Get the visual sync for custom pose operations.
   */
  getVisualSync(): RagdollVisualSync {
    return this.visualSync;
  }

  /**
   * Get the ragdoll configuration.
   */
  getRagdollConfig(): RagdollConfig | null {
    return this.ragdollConfig;
  }

  /**
   * Immediately force ragdoll mode without blending.
   * Useful for scripted events or debug.
   */
  forceRagdoll(initialVelocity?: THREE.Vector3): void {
    if (!this.ragdollConfig || !this.creatureGroup) return;

    this.state = RagdollBlendState.RAGDOLL;
    this.blendFactor = 1.0;

    this.ragdollPhysics.activateRagdoll(
      this.creatureGroup,
      this.ragdollConfig,
      initialVelocity,
    );
  }

  /**
   * Immediately force animation mode without blending.
   * Useful for scripted events or debug.
   */
  forceAnimated(): void {
    if (!this.ragdollConfig || !this.creatureGroup) return;

    this.state = RagdollBlendState.ANIMATED;
    this.blendFactor = 0.0;

    this.ragdollPhysics.deactivateRagdoll(
      this.creatureGroup,
      this.ragdollConfig,
    );
  }

  /**
   * Apply an impulse to the ragdoll at a specific point.
   * Only works when in RAGDOLL or BLENDING states.
   *
   * @param impulse - The impulse vector
   * @param worldPoint - The world-space point to apply the impulse
   */
  applyImpulse(impulse: THREE.Vector3, worldPoint: THREE.Vector3): void {
    if (!this.ragdollConfig) return;
    if (this.state === RagdollBlendState.ANIMATED) return;

    // Find the closest body to the impact point and apply impulse
    let closestBody: RagdollBody | null = null;
    let closestDist = Infinity;

    for (const body of this.ragdollConfig.bodies) {
      const dist = body.rigidBody.position.distanceTo(worldPoint);
      if (dist < closestDist) {
        closestDist = dist;
        closestBody = body;
      }
    }

    if (closestBody) {
      closestBody.rigidBody.applyImpulseAtPoint(impulse, worldPoint);

      // Also wake all connected bodies for realistic chain reaction
      for (const body of this.ragdollConfig.bodies) {
        body.rigidBody.wake();
      }
    }
  }

  /**
   * Clean up and remove the ragdoll from the physics world.
   */
  dispose(): void {
    if (!this.physicsWorld || !this.ragdollConfig) return;

    // Remove all ragdoll bodies from physics world
    for (const body of this.ragdollConfig.bodies) {
      if (body.colliderId) {
        this.physicsWorld.removeCollider(body.colliderId);
      }
      this.physicsWorld.removeBody(body.rigidBody.id);
    }

    // Remove ground plane
    if (this.groundAdded) {
      this.physicsWorld.removeCollider(GROUND_COLLIDER_ID);
      this.physicsWorld.removeBody(GROUND_BODY_ID);
      this.groundAdded = false;
    }

    this.ragdollConfig = null;
    this.physicsWorld = null;
    this.creatureGroup = null;
    this.state = RagdollBlendState.ANIMATED;
    this.blendFactor = 0;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Advance the blend transition based on elapsed time.
   */
  private advanceBlend(dt: number): void {
    if (this.state === RagdollBlendState.ANIMATED ||
        this.state === RagdollBlendState.RAGDOLL) {
      return;
    }

    this.blendElapsed += dt;
    const t = Math.min(1, this.blendElapsed / this.currentBlendDuration);

    // Use smoothstep for nicer easing
    const smoothT = t * t * (3 - 2 * t);

    if (this.state === RagdollBlendState.BLENDING_TO_RAGDOLL) {
      this.blendFactor = smoothT;
      if (t >= 1) {
        this.state = RagdollBlendState.RAGDOLL;
        this.blendFactor = 1;
      }
    } else if (this.state === RagdollBlendState.BLENDING_TO_ANIMATED) {
      this.blendFactor = 1 - smoothT;
      if (t >= 1) {
        this.state = RagdollBlendState.ANIMATED;
        this.blendFactor = 0;

        // Deactivate ragdoll
        if (this.ragdollConfig && this.creatureGroup) {
          this.ragdollPhysics.deactivateRagdoll(
            this.creatureGroup,
            this.ragdollConfig,
          );
        }
      }
    }
  }

  /**
   * Enforce ground constraint on all ragdoll bodies.
   *
   * Prevents bodies from falling below groundHeight by clamping
   * positions and reflecting velocities. This is a hard constraint
   * that supplements the ground plane collider.
   */
  private enforceGroundConstraint(groundHeight: number): void {
    if (!this.ragdollConfig) return;

    for (const body of this.ragdollConfig.bodies) {
      const rb = body.rigidBody;

      // Compute body's lowest point (approximate using collision shape)
      let bodyHalfHeight = 0.1; // Minimum half-height
      if (rb.colliderId && this.physicsWorld) {
        // Could query collider for precise extent; use heuristic
        bodyHalfHeight = 0.15;
      }

      const lowestPoint = rb.position.y - bodyHalfHeight;

      if (lowestPoint < groundHeight) {
        // Push body up to ground level
        const penetration = groundHeight - lowestPoint;
        rb.position.y += penetration;

        // Reflect downward velocity with some damping
        if (rb.linearVelocity.y < 0) {
          rb.linearVelocity.y *= -0.3; // Bounce with energy loss

          // Apply friction to horizontal velocity
          rb.linearVelocity.x *= 0.8;
          rb.linearVelocity.z *= 0.8;

          // Dampen angular velocity on ground contact
          rb.angularVelocity.multiplyScalar(0.9);
        }
      }
    }
  }

  /**
   * Check if the ragdoll has settled (all bodies below settle threshold).
   */
  private isRagdollSettled(): boolean {
    if (!this.ragdollConfig) return false;

    for (const body of this.ragdollConfig.bodies) {
      const speed = body.rigidBody.linearVelocity.length() +
                    body.rigidBody.angularVelocity.length() * 0.3;
      if (speed > this.simConfig.settleThreshold) {
        return false;
      }
    }

    return true;
  }
}
