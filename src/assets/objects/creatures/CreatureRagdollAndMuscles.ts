/**
 * CreatureRagdollAndMuscles.ts — P2 Creatures: Ragdoll Physics + Multi-Muscle Body
 *
 * Implements five core systems for physics-driven creature simulation:
 *
 * 1. RagdollPhysics        — Creates ragdoll rigid bodies from genome skeleton
 * 2. SpringHingeConstraint — Spring-based hinge joint for creature articulation
 * 3. MultiMuscleBody       — NURBS tube body with surface muscle bump overlays
 * 4. CreatureCollisionShape — Simplified collision geometry from part meshes
 * 5. RagdollConfig         — Configuration interface for ragdoll systems
 *
 * Integrates with existing systems:
 * - CompositionalGenome (P0) for part tree and joint configurations
 * - CreatureAnimationSystem (P1) for switching between animation and ragdoll
 * - PhysicsWorld / RigidBody / Joint for physics simulation
 * - NURBSBodyBuilder for parametric surface construction
 *
 * @module creatures/CreatureRagdollAndMuscles
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import {
  CompositionalGenome,
  PartNode,
  PartType,
  JointConfig as GenomeJointConfig,
  PartParams,
} from '@/assets/objects/creatures/genome/CompositionalGenome';
import {
  RigidBody,
  RigidBodyConfig,
  boxInertiaTensor,
  sphereInertiaTensor,
  capsuleInertiaTensor,
  cylinderInertiaTensor,
} from '@/sim/physics/RigidBody';
import { Joint, JointConfig } from '@/sim/physics/Joint';
import { PhysicsWorld } from '@/sim/physics/PhysicsWorld';
import {
  createBoxShape,
  createSphereShape,
  createCapsuleShape,
  PhysicsShape,
} from '@/sim/physics/PhysicsWorld';

// ============================================================================
// 1. RagdollConfig
// ============================================================================

/**
 * Configuration interface for a creature ragdoll.
 *
 * Contains all the data needed to create, simulate, and synchronize
 * a physics-driven ragdoll from a creature's genome and skeleton.
 */
export interface RagdollConfig {
  /** Rigid bodies for each body part */
  bodies: RagdollBody[];
  /** Spring hinge constraints connecting body parts */
  constraints: SpringHingeConstraint[];
  /** Collision shapes mapped by part ID */
  collisionShapes: Map<string, CollisionShape>;
  /** Whether the ragdoll is currently active (vs. animation-driven) */
  isActive: boolean;
  /** The creature group this ragdoll is attached to */
  creatureGroup: THREE.Group | null;
  /** Cached animation pose for switching back from ragdoll */
  cachedAnimationPose: Map<string, { position: THREE.Vector3; rotation: THREE.Quaternion }>;
}

/**
 * A single rigid body in the ragdoll system.
 */
export interface RagdollBody {
  /** Unique identifier matching the PartNode ID */
  id: string;
  /** Physics rigid body */
  rigidBody: RigidBody;
  /** Collider ID in the physics world */
  colliderId: string | null;
  /** Part type for collision shape selection */
  partType: PartType;
  /** Reference to the Three.js mesh/bone this body drives */
  sceneNode: THREE.Object3D | null;
  /** Local offset from bone to rigid body center */
  localOffset: THREE.Vector3;
}

// ============================================================================
// 2. CollisionShape
// ============================================================================

/**
 * Simplified collision shape types for creature body parts.
 *
 * Each body part is approximated by one of three primitive shapes:
 * - Capsule: For limbs (arms, legs, tail)
 * - Box: For torso (main body mass)
 * - Sphere: For head (roughly spherical)
 */
export type CollisionShapeType = 'capsule' | 'box' | 'sphere';

/**
 * A simplified collision shape derived from part geometry.
 */
export interface CollisionShape {
  /** Shape primitive type */
  type: CollisionShapeType;
  /** Half-extents for box shapes */
  halfExtents: THREE.Vector3;
  /** Radius for sphere and capsule shapes */
  radius: number;
  /** Height for capsule shapes */
  height: number;
  /** Local-space center offset */
  center: THREE.Vector3;
}

/**
 * CreatureCollisionShape — Generates simplified collision shapes
 * from part geometry.
 *
 * Derives bounding primitives (capsule, box, sphere) from the
 * vertex data of a BufferGeometry, with per-part-type selection:
 * - Torso → Box
 * - Head → Sphere
 * - Limb / Tail / Wing / Fin → Capsule
 * - Other → Sphere (conservative default)
 */
export class CreatureCollisionShape {
  /**
   * Generate a simplified collision shape from part geometry and type.
   *
   * @param geometry - The part's BufferGeometry
   * @param partType - The body part type determining shape selection
   * @returns CollisionShape with bounding primitive parameters
   */
  static fromPartGeometry(geometry: THREE.BufferGeometry, partType: PartType): CollisionShape {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox ?? new THREE.Box3();
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    switch (partType) {
      case PartType.Torso:
        return {
          type: 'box',
          halfExtents: size.clone().multiplyScalar(0.5),
          radius: 0,
          height: 0,
          center,
        };

      case PartType.Head:
        return {
          type: 'sphere',
          halfExtents: new THREE.Vector3(),
          radius: Math.max(size.x, size.y, size.z) * 0.5,
          height: 0,
          center,
        };

      case PartType.Limb:
      case PartType.Tail:
      case PartType.Wing:
      case PartType.Fin:
        return {
          type: 'capsule',
          halfExtents: new THREE.Vector3(),
          radius: Math.max(size.x, size.z) * 0.5,
          height: size.y,
          center,
        };

      default:
        return {
          type: 'sphere',
          halfExtents: new THREE.Vector3(),
          radius: Math.max(size.x, size.y, size.z) * 0.5,
          height: 0,
          center,
        };
    }
  }

  /**
   * Compute the moment of inertia tensor for a collision shape.
   *
   * @param shape - The collision shape
   * @param mass - Mass of the body in kg
   * @returns 3x3 inertia tensor matrix
   */
  static computeInertia(shape: CollisionShape, mass: number): THREE.Matrix3 {
    switch (shape.type) {
      case 'box':
        return boxInertiaTensor(
          mass,
          shape.halfExtents.x * 2,
          shape.halfExtents.y * 2,
          shape.halfExtents.z * 2,
        );
      case 'sphere':
        return sphereInertiaTensor(mass, shape.radius);
      case 'capsule':
        return capsuleInertiaTensor(mass, shape.radius, shape.height);
      default:
        return sphereInertiaTensor(mass, shape.radius || 0.5);
    }
  }

  /**
   * Create a PhysicsShape from a CollisionShape for the physics world.
   *
   * @param shape - The creature collision shape
   * @returns PhysicsShape suitable for PhysicsWorld.addCollider()
   */
  static toPhysicsShape(shape: CollisionShape): PhysicsShape {
    switch (shape.type) {
      case 'box':
        return createBoxShape(
          shape.halfExtents.x * 2,
          shape.halfExtents.y * 2,
          shape.halfExtents.z * 2,
        );
      case 'sphere':
        return createSphereShape(shape.radius);
      case 'capsule':
        return createCapsuleShape(shape.radius, shape.height);
      default:
        return createSphereShape(shape.radius || 0.5);
    }
  }
}

// ============================================================================
// 3. SpringHingeConstraint
// ============================================================================

/**
 * SpringHingeConstraint — Spring-based hinge constraint for creature joints.
 *
 * Extends the basic hinge joint with spring force calculation that
 * provides both stiffness (restoring torque) and damping (energy dissipation).
 * Used for all creature articulation: ball joints, hinge joints, and
 * prismatic joints are all modeled with spring forces around the
 * relevant degrees of freedom.
 *
 * The spring force follows Hooke's law:
 *   F = -stiffness * displacement - damping * velocity
 *
 * With angular limits enforced via clamping.
 */
export class SpringHingeConstraint {
  /** Connection point on body A in local space */
  anchorA: THREE.Vector3;
  /** Connection point on body B in local space */
  anchorB: THREE.Vector3;
  /** Rotation axis for hinge joints (in body A local space) */
  axis: THREE.Vector3;
  /** Angular limits in radians */
  angleLimits: { min: number; max: number };
  /** Spring stiffness coefficient (N·m/rad) */
  stiffness: number;
  /** Damping coefficient (N·m·s/rad) */
  damping: number;
  /** Maximum constraint force (N) */
  maxForce: number;
  /** Joint type from the genome */
  jointType: 'hinge' | 'ball' | 'weld' | 'prismatic';
  /** Per-axis angular limits for ball joints */
  axisLimits: {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
  };

  /**
   * Create a new spring hinge constraint.
   *
   * @param params - Constraint parameters
   */
  constructor(params: {
    anchorA?: THREE.Vector3;
    anchorB?: THREE.Vector3;
    axis?: THREE.Vector3;
    angleLimits?: { min: number; max: number };
    stiffness?: number;
    damping?: number;
    maxForce?: number;
    jointType?: 'hinge' | 'ball' | 'weld' | 'prismatic';
    axisLimits?: {
      minX: number; maxX: number;
      minY: number; maxY: number;
      minZ: number; maxZ: number;
    };
  }) {
    this.anchorA = params.anchorA ?? new THREE.Vector3();
    this.anchorB = params.anchorB ?? new THREE.Vector3();
    this.axis = params.axis ?? new THREE.Vector3(0, 1, 0);
    this.angleLimits = params.angleLimits ?? { min: -Math.PI * 0.5, max: Math.PI * 0.5 };
    this.stiffness = params.stiffness ?? 50;
    this.damping = params.damping ?? 5;
    this.maxForce = params.maxForce ?? 1000;
    this.jointType = params.jointType ?? 'ball';
    this.axisLimits = params.axisLimits ?? {
      minX: -Math.PI * 0.5, maxX: Math.PI * 0.5,
      minY: -Math.PI * 0.25, maxY: Math.PI * 0.25,
      minZ: -Math.PI * 0.3, maxZ: Math.PI * 0.3,
    };
  }

  /**
   * Create a SpringHingeConstraint from a genome JointConfig.
   *
   * @param jointConfig - Joint configuration from the compositional genome
   * @param parentOffset - Offset from parent body center to joint location
   * @param childOffset - Offset from child body center to joint location
   * @returns Configured SpringHingeConstraint
   */
  static fromJointConfig(
    jointConfig: GenomeJointConfig,
    parentOffset: THREE.Vector3,
    childOffset: THREE.Vector3,
  ): SpringHingeConstraint {
    return new SpringHingeConstraint({
      anchorA: parentOffset,
      anchorB: childOffset,
      axis: jointConfig.axis.clone(),
      angleLimits: {
        min: Math.min(
          jointConfig.limits.minX,
          jointConfig.limits.minY,
          jointConfig.limits.minZ,
        ),
        max: Math.max(
          jointConfig.limits.maxX,
          jointConfig.limits.maxY,
          jointConfig.limits.maxZ,
        ),
      },
      stiffness: jointConfig.stiffness * 100, // Scale from [0,1] to [0,100]
      damping: 5 + (1 - jointConfig.stiffness) * 20, // Softer joints have more damping
      maxForce: 1000,
      jointType: jointConfig.type,
      axisLimits: {
        minX: jointConfig.limits.minX,
        maxX: jointConfig.limits.maxX,
        minY: jointConfig.limits.minY,
        maxY: jointConfig.limits.maxY,
        minZ: jointConfig.limits.minZ,
        maxZ: jointConfig.limits.maxZ,
      },
    });
  }

  /**
   * Compute the spring constraint force between two bodies.
   *
   * Calculates the restoring force based on the deviation from
   * the rest angle and the relative angular velocity.
   *
   * @param bodyA - First rigid body
   * @param bodyB - Second rigid body
   * @returns Force vector in world space to apply to body B
   */
  computeConstraintForce(bodyA: RigidBody, bodyB: RigidBody): THREE.Vector3 {
    // Get world-space anchor positions
    const worldAnchorA = this.anchorA.clone().applyQuaternion(bodyA.rotation).add(bodyA.position);
    const worldAnchorB = this.anchorB.clone().applyQuaternion(bodyB.rotation).add(bodyB.position);

    // Position error (anchor misalignment)
    const positionError = new THREE.Vector3().subVectors(worldAnchorB, worldAnchorA);
    const positionForce = positionError.multiplyScalar(this.stiffness * 0.5);

    // Angular spring force
    const force = new THREE.Vector3();

    switch (this.jointType) {
      case 'hinge': {
        // Compute angle around hinge axis
        const axisWorld = this.axis.clone().applyQuaternion(bodyA.rotation).normalize();
        const relativeRotation = new THREE.Quaternion().copy(bodyA.rotation).invert().multiply(bodyB.rotation);
        const angle = 2 * Math.acos(Math.max(-1, Math.min(1, relativeRotation.w)));
        const clampedAngle = Math.max(this.angleLimits.min, Math.min(this.angleLimits.max, angle));
        const angleError = clampedAngle - angle;

        // Spring torque around hinge axis
        const angularForce = axisWorld.multiplyScalar(-this.stiffness * angleError);

        // Damping from relative angular velocity
        const relAngVel = new THREE.Vector3().subVectors(bodyB.angularVelocity, bodyA.angularVelocity);
        const dampingForce = relAngVel.multiplyScalar(-this.damping);

        force.add(angularForce).add(dampingForce);
        break;
      }

      case 'ball': {
        // Compute rotation error as Euler angles
        const relQuat = new THREE.Quaternion().copy(bodyA.rotation).invert().multiply(bodyB.rotation);
        const euler = new THREE.Euler().setFromQuaternion(relQuat, 'XYZ');

        // Apply spring force per axis with limits
        const fx = this.computeAxisSpringForce(euler.x, this.axisLimits.minX, this.axisLimits.maxX, bodyA, bodyB, new THREE.Vector3(1, 0, 0));
        const fy = this.computeAxisSpringForce(euler.y, this.axisLimits.minY, this.axisLimits.maxY, bodyA, bodyB, new THREE.Vector3(0, 1, 0));
        const fz = this.computeAxisSpringForce(euler.z, this.axisLimits.minZ, this.axisLimits.maxZ, bodyA, bodyB, new THREE.Vector3(0, 0, 1));

        force.add(fx).add(fy).add(fz);
        break;
      }

      case 'weld': {
        // Weld: strongly enforce both position and rotation alignment
        force.add(positionForce);
        const relQuat = new THREE.Quaternion().copy(bodyA.rotation).invert().multiply(bodyB.rotation);
        const identity = new THREE.Quaternion();
        const rotError = new THREE.Quaternion().copy(relQuat).invert();
        const angle = 2 * Math.acos(Math.max(-1, Math.min(1, rotError.w)));
        if (angle > 0.01) {
          const axis = new THREE.Vector3(rotError.x, rotError.y, rotError.z).normalize();
          force.add(axis.multiplyScalar(-this.stiffness * 2 * angle));
        }
        break;
      }

      case 'prismatic': {
        // Prismatic: allow translation along axis, restrict rotation
        const axisWorld = this.axis.clone().applyQuaternion(bodyA.rotation).normalize();
        const alongAxis = positionError.dot(axisWorld);
        const perpError = positionError.clone().sub(axisWorld.clone().multiplyScalar(alongAxis));
        force.add(perpError.multiplyScalar(this.stiffness));

        // Also stabilize rotation
        const relAngVel = new THREE.Vector3().subVectors(bodyB.angularVelocity, bodyA.angularVelocity);
        force.add(relAngVel.multiplyScalar(-this.damping));
        break;
      }
    }

    // Clamp to max force
    if (force.length() > this.maxForce) {
      force.normalize().multiplyScalar(this.maxForce);
    }

    return force;
  }

  /**
   * Compute spring force for a single rotation axis.
   */
  private computeAxisSpringForce(
    angle: number,
    minLimit: number,
    maxLimit: number,
    bodyA: RigidBody,
    bodyB: RigidBody,
    axis: THREE.Vector3,
  ): THREE.Vector3 {
    const clampedAngle = Math.max(minLimit, Math.min(maxLimit, angle));
    const angleError = clampedAngle - angle;

    const axisWorld = axis.clone().applyQuaternion(bodyA.rotation);
    const springForce = axisWorld.multiplyScalar(-this.stiffness * angleError);

    // Damping
    const relAngVel = new THREE.Vector3().subVectors(bodyB.angularVelocity, bodyA.angularVelocity);
    const dampingComponent = relAngVel.dot(axisWorld);
    const dampingForce = axisWorld.multiplyScalar(-this.damping * dampingComponent);

    return springForce.add(dampingForce);
  }

  /**
   * Convert to a physics JointConfig for the PhysicsWorld.
   *
   * @param bodyAId - ID of body A
   * @param bodyBId - ID of body B
   * @returns JointConfig suitable for PhysicsWorld.addJoint()
   */
  toJointConfig(bodyAId: string, bodyBId: string): JointConfig {
    let jointType: 'hinge' | 'ball-socket' | 'prismatic' | 'fixed';

    switch (this.jointType) {
      case 'hinge': jointType = 'hinge'; break;
      case 'ball': jointType = 'ball-socket'; break;
      case 'prismatic': jointType = 'prismatic'; break;
      case 'weld': jointType = 'fixed'; break;
      default: jointType = 'ball-socket';
    }

    return {
      id: `ragdoll_joint_${bodyAId}_${bodyBId}`,
      type: jointType,
      bodyAId,
      bodyBId,
      anchorA: this.anchorA.clone(),
      anchorB: this.anchorB.clone(),
      axis: this.axis.clone(),
      limits: { min: this.angleLimits.min, max: this.angleLimits.max },
    };
  }
}

// ============================================================================
// 4. RagdollPhysics
// ============================================================================

/**
 * Default tissue density for creature body parts (kg/m³).
 * Roughly matches average vertebrate muscle/bone density.
 */
const DEFAULT_TISSUE_DENSITY = 1050;

/**
 * RagdollPhysics — Creates and manages a physics-driven ragdoll from
 * a creature's genome and skeleton.
 *
 * The ragdoll creation process:
 * 1. Traverse the genome part tree
 * 2. For each part, create a RigidBody with appropriate mass and inertia
 * 3. Compute collision shapes (capsule/box/sphere) from part geometry
 * 4. Create SpringHingeConstraints from genome JointConfigs
 * 5. Register all bodies, colliders, and joints with the PhysicsWorld
 *
 * The system supports seamless switching between animation-driven and
 * physics-driven modes via activateRagdoll/deactivateRagdoll.
 *
 * Usage:
 * ```typescript
 * const ragdollPhysics = new RagdollPhysics();
 * const config = ragdollPhysics.createRagdoll(genome, skeleton);
 * ragdollPhysics.applyRagdoll(config, physicsWorld);
 * ragdollPhysics.activateRagdoll(creatureGroup);
 * ```
 */
export class RagdollPhysics {
  private density: number;

  constructor(density: number = DEFAULT_TISSUE_DENSITY) {
    this.density = density;
  }

  /**
   * Create a ragdoll configuration from a genome and skeleton.
   *
   * @param genome - The creature's compositional genome
   * @param skeleton - The creature's Three.js skeleton
   * @returns RagdollConfig with all bodies, constraints, and shapes
   */
  createRagdoll(genome: CompositionalGenome, skeleton: THREE.Skeleton): RagdollConfig {
    const bodies: RagdollBody[] = [];
    const constraints: SpringHingeConstraint[] = [];
    const collisionShapes = new Map<string, CollisionShape>();

    // Get all parts from the genome
    const parts = genome.getAllParts();

    // Create rigid body for each part
    for (const part of parts) {
      if (!part.geometry) continue;

      // Compute collision shape
      const collisionShape = CreatureCollisionShape.fromPartGeometry(
        part.geometry, part.partType,
      );
      collisionShapes.set(part.id, collisionShape);

      // Compute mass from volume × density
      const volume = this.computeVolume(part.geometry);
      const mass = volume * this.density;

      // Compute inertia tensor
      const inertiaTensor = CreatureCollisionShape.computeInertia(collisionShape, mass);

      // Get world position from the part's transform
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      part.transform.decompose(worldPos, worldQuat, worldScale);

      // Try to find matching bone in skeleton
      const matchingBone = skeleton.bones.find(b => b.name === part.id);

      // Create rigid body config
      const bodyConfig: RigidBodyConfig = {
        id: `ragdoll_${part.id}`,
        bodyType: 'dynamic',
        position: worldPos,
        rotation: worldQuat,
        mass: Math.max(0.1, mass),
        inertiaTensor,
        linearDamping: 0.05,
        angularDamping: 0.1,
        gravityScale: 1.0,
      };

      const rigidBody = new RigidBody(bodyConfig);

      const ragdollBody: RagdollBody = {
        id: part.id,
        rigidBody,
        colliderId: null,
        partType: part.partType,
        sceneNode: matchingBone ?? null,
        localOffset: collisionShape.center,
      };

      bodies.push(ragdollBody);
    }

    // Create constraints from genome joint configurations
    for (const part of parts) {
      if (part.partType === PartType.Torso) continue; // Root has no parent joint

      // Find parent part
      const parentPart = this.findParentPart(parts, part);
      if (!parentPart) continue;

      // Create constraint from genome joint config
      const constraint = SpringHingeConstraint.fromJointConfig(
        part.joint,
        part.attachment.offset.clone(), // Anchor on parent
        part.attachment.offset.clone().negate(), // Anchor on child (mirrored)
      );
      constraints.push(constraint);
    }

    return {
      bodies,
      constraints,
      collisionShapes,
      isActive: false,
      creatureGroup: null,
      cachedAnimationPose: new Map(),
    };
  }

  /**
   * Apply a ragdoll configuration to a physics world.
   *
   * Registers all rigid bodies, colliders, and joints with the
   * physics world for simulation.
   *
   * @param config - Ragdoll configuration to apply
   * @param physicsWorld - The physics world to add bodies to
   */
  applyRagdoll(config: RagdollConfig, physicsWorld: PhysicsWorld): void {
    // Add all rigid bodies and colliders
    for (const body of config.bodies) {
      physicsWorld.addBody({
        id: body.rigidBody.id,
        bodyType: body.rigidBody.bodyType,
        position: body.rigidBody.position.clone(),
        rotation: body.rigidBody.rotation.clone(),
        mass: body.rigidBody.mass,
        inertiaTensor: body.rigidBody.inertiaTensor.clone(),
        linearDamping: body.rigidBody.linearDamping,
        angularDamping: body.rigidBody.angularDamping,
      });

      // Add collider
      const shape = config.collisionShapes.get(body.id);
      if (shape) {
        const physicsShape = CreatureCollisionShape.toPhysicsShape(shape);
        const collider = physicsWorld.addCollider(
          {
            shape: physicsShape.type as any,
            isTrigger: false,
          } as any,
          body.rigidBody.id,
        );
        body.colliderId = collider.id;
      }
    }

    // Add all joint constraints
    for (let i = 0; i < config.constraints.length; i++) {
      const constraint = config.constraints[i];

      // Find the two bodies this constraint connects
      // Constraints are ordered to match the part tree: constraint[i] connects
      // bodies[i+1] to its parent
      if (i + 1 < config.bodies.length) {
        const bodyAId = config.bodies[0].rigidBody.id; // Simplified: connect to root
        const bodyBId = config.bodies[i + 1].rigidBody.id;

        const jointConfig = constraint.toJointConfig(bodyAId, bodyBId);
        physicsWorld.addJoint(jointConfig);
      }
    }
  }

  /**
   * Synchronize Three.js scene graph from ragdoll physics state.
   *
   * After physics simulation, call this method to update the creature's
   * visual representation from the physics rigid body positions and rotations.
   *
   * @param creatureGroup - The creature's Three.js group
   * @param config - Ragdoll configuration with current physics state
   */
  syncFromRagdoll(creatureGroup: THREE.Group, config: RagdollConfig): void {
    if (!config.isActive) return;

    for (const body of config.bodies) {
      if (!body.sceneNode) continue;

      // Update scene node position from rigid body
      body.sceneNode.position.copy(body.rigidBody.position);
      body.sceneNode.quaternion.copy(body.rigidBody.rotation);

      // Apply local offset
      if (body.localOffset.lengthSq() > 0) {
        const offset = body.localOffset.clone().applyQuaternion(body.rigidBody.rotation);
        body.sceneNode.position.sub(offset);
      }
    }

    // Update world matrices
    creatureGroup.updateMatrixWorld(true);
  }

  /**
   * Activate ragdoll mode on a creature.
   *
   * Switches from animation-driven to physics-driven mode.
   * Caches the current animation pose for later restoration.
   *
   * @param creatureGroup - The creature's Three.js group
   * @param config - Ragdoll configuration
   * @param initialVelocity - Optional initial velocity (e.g., from impact)
   */
  activateRagdoll(
    creatureGroup: THREE.Group,
    config: RagdollConfig,
    initialVelocity?: THREE.Vector3,
  ): void {
    if (config.isActive) return;

    config.creatureGroup = creatureGroup;
    config.cachedAnimationPose.clear();

    // Cache current animation pose
    creatureGroup.traverse((child) => {
      if (child instanceof THREE.Bone || child.type === 'Bone') {
        config.cachedAnimationPose.set(child.name, {
          position: child.position.clone(),
          rotation: child.quaternion.clone(),
        });
      }
    });

    // Initialize ragdoll body positions from current skeleton pose
    for (const body of config.bodies) {
      if (body.sceneNode) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        body.sceneNode.getWorldPosition(worldPos);
        body.sceneNode.getWorldQuaternion(worldQuat);

        body.rigidBody.position.copy(worldPos);
        body.rigidBody.rotation.copy(worldQuat);
        body.rigidBody.wake();

        // Apply initial velocity if provided
        if (initialVelocity) {
          body.rigidBody.setLinearVelocity(initialVelocity.clone());
          // Add some angular velocity for realistic tumbling
          body.rigidBody.setAngularVelocity(
            new THREE.Vector3(
              (Math.random() - 0.5) * 2,
              (Math.random() - 0.5) * 1,
              (Math.random() - 0.5) * 2,
            ),
          );
        }
      }
    }

    config.isActive = true;
  }

  /**
   * Deactivate ragdoll mode and restore animation.
   *
   * Restores the cached animation pose and stops physics simulation
   * on the ragdoll bodies.
   *
   * @param creatureGroup - The creature's Three.js group
   * @param config - Ragdoll configuration
   */
  deactivateRagdoll(creatureGroup: THREE.Group, config: RagdollConfig): void {
    if (!config.isActive) return;

    // Restore cached animation pose
    for (const [name, pose] of config.cachedAnimationPose) {
      const bone = creatureGroup.getObjectByName(name);
      if (bone) {
        bone.position.copy(pose.position);
        bone.quaternion.copy(pose.rotation);
      }
    }

    // Put all ragdoll bodies to sleep
    for (const body of config.bodies) {
      body.rigidBody.linearVelocity.set(0, 0, 0);
      body.rigidBody.angularVelocity.set(0, 0, 0);
      body.rigidBody.awake = false;
    }

    config.isActive = false;
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /**
   * Estimate volume of a BufferGeometry in cubic meters.
   * Uses the bounding box as an approximation.
   */
  private computeVolume(geometry: THREE.BufferGeometry): number {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    if (!bbox) return 0.001;

    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Approximate volume based on shape type heuristic
    const v = size.x * size.y * size.z;

    // Reduce for non-solid shapes (wings, fins are thin)
    return Math.max(0.0001, v * 0.5);
  }

  /**
   * Find the parent part of a given part in the tree.
   */
  private findParentPart(allParts: PartNode[], child: PartNode): PartNode | null {
    for (const part of allParts) {
      if (part.children.includes(child)) {
        return part;
      }
    }
    return null;
  }
}

// ============================================================================
// 5. MultiMuscleBody
// ============================================================================

/**
 * Definition of a single surface muscle on the creature body.
 *
 * Muscles are defined as bumps on the NURBS tube surface, parameterized
 * by their position along the body axis (t parameter), angular extent,
 * and physical properties (fullness, height, tilt).
 */
export interface MuscleDefinition {
  /** Start parameter along body axis [0, 1] */
  startT: number;
  /** End parameter along body axis [0, 1] */
  endT: number;
  /** Fullness of the muscle cross-section [0, 1] */
  fullness: number;
  /** Height of the muscle bump relative to base body radius */
  profileHeight: number;
  /** Tilt angle of the muscle in radians (rotation around body axis) */
  tilt: number;
  /** Side of the body: 'left', 'right', or 'center' */
  side: 'left' | 'right' | 'center';
  /** Muscle group name */
  group: string;
}

/**
 * Configuration for building a multi-muscle body.
 */
export interface MultiMuscleBodyParams {
  /** Body length along the spine axis */
  bodyLength: number;
  /** Body radius at the start (head end) */
  startRadius: number;
  /** Body radius at the end (tail end) */
  endRadius: number;
  /** Number of segments along the body axis */
  segmentCount: number;
  /** Number of radial segments around the circumference */
  radialSegments: number;
  /** Muscle definitions to overlay on the base body */
  muscles: MuscleDefinition[];
  /** Overall scale factor */
  scale: number;
}

/** Default muscle body parameters */
export const DEFAULT_MUSCLE_BODY_PARAMS: MultiMuscleBodyParams = {
  bodyLength: 2.0,
  startRadius: 0.15,
  endRadius: 0.05,
  segmentCount: 32,
  radialSegments: 24,
  scale: 1.0,
  muscles: [],
};

/**
 * Pre-defined muscle groups for a typical quadruped body.
 *
 * 5 muscles per side (10 total), covering major muscle groups:
 * - Shoulder (deltoid, trapezius)
 * - Hip (gluteal, hamstring)
 * - Back (latissimus)
 * - Abdomen (rectus abdominis)
 */
export const DEFAULT_QUADRUPED_MUSCLES: MuscleDefinition[] = [
  // Left side muscles
  { startT: 0.15, endT: 0.30, fullness: 0.7, profileHeight: 0.08, tilt: 0.2, side: 'left', group: 'shoulder' },
  { startT: 0.30, endT: 0.50, fullness: 0.5, profileHeight: 0.06, tilt: 0.1, side: 'left', group: 'back' },
  { startT: 0.40, endT: 0.55, fullness: 0.4, profileHeight: 0.04, tilt: -0.1, side: 'left', group: 'abdomen' },
  { startT: 0.55, endT: 0.70, fullness: 0.6, profileHeight: 0.07, tilt: 0.15, side: 'left', group: 'hip' },
  { startT: 0.20, endT: 0.35, fullness: 0.5, profileHeight: 0.05, tilt: 0.3, side: 'left', group: 'shoulder' },

  // Right side muscles (mirror)
  { startT: 0.15, endT: 0.30, fullness: 0.7, profileHeight: 0.08, tilt: -0.2, side: 'right', group: 'shoulder' },
  { startT: 0.30, endT: 0.50, fullness: 0.5, profileHeight: 0.06, tilt: -0.1, side: 'right', group: 'back' },
  { startT: 0.40, endT: 0.55, fullness: 0.4, profileHeight: 0.04, tilt: 0.1, side: 'right', group: 'abdomen' },
  { startT: 0.55, endT: 0.70, fullness: 0.6, profileHeight: 0.07, tilt: -0.15, side: 'right', group: 'hip' },
  { startT: 0.20, endT: 0.35, fullness: 0.5, profileHeight: 0.05, tilt: -0.3, side: 'right', group: 'shoulder' },
];

/**
 * MultiMuscleBody — Builds a NURBS tube body with muscle bump overlays.
 *
 * The body is constructed as a parametric tube (NURBS-like) with
 * configurable start/end radius. Muscle overlays are applied as
 * vertex displacements along surface normals, creating realistic
 * anatomical surface detail.
 *
 * Each muscle is parameterized by:
 * - Position along body axis (startT, endT)
 * - Angular position (side + tilt)
 * - Cross-section profile (fullness, profileHeight)
 *
 * The displacement uses a smooth bell-curve profile along the muscle
 * length and a Gaussian cross-section for natural-looking bulges.
 *
 * Usage:
 * ```typescript
 * const builder = new MultiMuscleBody();
 * const group = builder.buildBody(genome, { muscles: DEFAULT_QUADRUPED_MUSCLES });
 * scene.add(group);
 * ```
 */
export class MultiMuscleBody {
  /**
   * Build a complete creature body with muscle overlays.
   *
   * @param genome - The creature's compositional genome for body proportions
   * @param params - Body construction parameters including muscle definitions
   * @returns THREE.Group containing the mesh with muscle surface detail
   */
  buildBody(genome: CompositionalGenome, params: Partial<MultiMuscleBodyParams>): THREE.Group {
    const cfg: MultiMuscleBodyParams = { ...DEFAULT_MUSCLE_BODY_PARAMS, ...params };
    const group = new THREE.Group();
    group.name = 'creatureMuscleBody';

    // Create base tube body
    const baseMesh = this.createBaseTube(cfg);
    group.add(baseMesh);

    // Apply muscle overlay if muscles are defined
    if (cfg.muscles.length > 0) {
      const muscleGeometry = this.addMuscleLayer(
        baseMesh.geometry as THREE.BufferGeometry,
        cfg.muscles,
      );
      baseMesh.geometry = muscleGeometry;
    }

    return group;
  }

  /**
   * Add muscle layer displacement to a base mesh geometry.
   *
   * Displaces vertices along surface normals based on muscle parameters.
   * Uses smooth falloff at muscle boundaries for natural transitions.
   *
   * @param baseMesh - The base tube geometry to modify
   * @param muscleDefs - Array of muscle definitions to apply
   * @returns Modified BufferGeometry with muscle displacement
   */
  addMuscleLayer(
    baseMesh: THREE.BufferGeometry,
    muscleDefs: MuscleDefinition[],
  ): THREE.BufferGeometry {
    // Clone to avoid modifying the original
    const geometry = baseMesh.clone();
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');

    if (!normalAttr) {
      geometry.computeVertexNormals();
    }

    const normals = geometry.getAttribute('normal');

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      // Compute t parameter (0 = head, 1 = tail) from Y position
      const t = 0.5 - y / (DEFAULT_MUSCLE_BODY_PARAMS.bodyLength * 0.5);
      const clampedT = Math.max(0, Math.min(1, t));

      // Compute angular position around the tube (for left/right/center)
      const angle = Math.atan2(x, z);

      // Accumulate displacement from all muscles
      let totalDisplacement = 0;

      for (const muscle of muscleDefs) {
        // Check if this vertex is within the muscle's t-range
        if (clampedT < muscle.startT || clampedT > muscle.endT) continue;

        // Check if this vertex is on the correct side
        const isOnSide = this.isVertexOnSide(angle, muscle.side, muscle.tilt);
        if (!isOnSide) continue;

        // Compute displacement along muscle length (bell curve)
        const muscleCenter = (muscle.startT + muscle.endT) * 0.5;
        const muscleHalfWidth = (muscle.endT - muscle.startT) * 0.5;
        const distFromCenter = (clampedT - muscleCenter) / muscleHalfWidth;
        const lengthProfile = Math.exp(-distFromCenter * distFromCenter * 2);

        // Compute displacement cross-section (Gaussian bump)
        const angularDist = this.angularDistanceFromMuscle(angle, muscle);
        const crossSection = Math.exp(-angularDist * angularDist * 4) * muscle.fullness;

        // Total displacement = height * length_profile * cross_section
        totalDisplacement += muscle.profileHeight * lengthProfile * crossSection;
      }

      // Apply displacement along surface normal
      if (totalDisplacement > 0) {
        const nx = normals.getX(i);
        const ny = normals.getY(i);
        const nz = normals.getZ(i);

        posAttr.setX(i, x + nx * totalDisplacement);
        posAttr.setY(i, y + ny * totalDisplacement);
        posAttr.setZ(i, z + nz * totalDisplacement);
      }
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /**
   * Create the base parametric tube mesh.
   */
  private createBaseTube(params: MultiMuscleBodyParams): THREE.Mesh {
    const {
      bodyLength,
      startRadius,
      endRadius,
      segmentCount,
      radialSegments,
      scale,
    } = params;

    // Create a tapered tube using CylinderGeometry with vertex displacement
    const geo = new THREE.CylinderGeometry(
      endRadius * scale,
      startRadius * scale,
      bodyLength * scale,
      radialSegments,
      segmentCount,
      false,
    );

    // Apply NURBS-like taper profile
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const normalizedY = y / (bodyLength * scale) + 0.5; // [0, 1] from bottom to top

      // Smooth taper using cubic interpolation
      const t = normalizedY;
      const radius = THREE.MathUtils.lerp(startRadius, endRadius, t) * scale;

      // Apply shoulder and hip bulges for anatomical realism
      const shoulderBulge = 0.08 * Math.exp(-Math.pow((t - 0.25) * 6, 2));
      const hipBulge = 0.06 * Math.exp(-Math.pow((t - 0.65) * 6, 2));
      const totalRadius = radius * (1 + shoulderBulge + hipBulge);

      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const currentRadius = Math.sqrt(x * x + z * z);

      if (currentRadius > 0.001) {
        const scaleRatio = totalRadius / currentRadius;
        posAttr.setX(i, x * scaleRatio);
        posAttr.setZ(i, z * scaleRatio);
      }
    }

    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.7,
      metalness: 0.0,
    });

    return new THREE.Mesh(geo, material);
  }

  /**
   * Check if a vertex at a given angle is on the specified side.
   */
  private isVertexOnSide(
    angle: number,
    side: 'left' | 'right' | 'center',
    tilt: number,
  ): boolean {
    const tiltedAngle = angle - tilt;

    switch (side) {
      case 'left':
        return tiltedAngle > Math.PI * 0.25 && tiltedAngle < Math.PI * 0.75;
      case 'right':
        return tiltedAngle < -Math.PI * 0.25 && tiltedAngle > -Math.PI * 0.75;
      case 'center':
        return Math.abs(tiltedAngle) < Math.PI * 0.3;
      default:
        return false;
    }
  }

  /**
   * Compute angular distance from a muscle's primary orientation.
   */
  private angularDistanceFromMuscle(
    vertexAngle: number,
    muscle: MuscleDefinition,
  ): number {
    // Target angle based on side and tilt
    let targetAngle: number;
    switch (muscle.side) {
      case 'left':
        targetAngle = Math.PI * 0.5 + muscle.tilt;
        break;
      case 'right':
        targetAngle = -Math.PI * 0.5 + muscle.tilt;
        break;
      case 'center':
        targetAngle = muscle.tilt;
        break;
      default:
        targetAngle = 0;
    }

    // Angular distance with wrapping
    let diff = vertexAngle - targetAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a complete ragdoll system for a creature.
 *
 * Convenience function that creates a ragdoll physics instance,
 * builds the ragdoll from the genome, and applies it to the physics world.
 *
 * @param genome - The creature's compositional genome
 * @param skeleton - The creature's Three.js skeleton
 * @param physicsWorld - The physics world to simulate in
 * @param density - Tissue density in kg/m³ (default 1050)
 * @returns RagdollConfig for managing the ragdoll
 */
export function createCreatureRagdoll(
  genome: CompositionalGenome,
  skeleton: THREE.Skeleton,
  physicsWorld: PhysicsWorld,
  density: number = DEFAULT_TISSUE_DENSITY,
): RagdollConfig {
  const ragdollPhysics = new RagdollPhysics(density);
  const config = ragdollPhysics.createRagdoll(genome, skeleton);
  ragdollPhysics.applyRagdoll(config, physicsWorld);
  return config;
}

/**
 * Create a multi-muscle body mesh for a creature.
 *
 * Convenience function that builds the body using default quadruped
 * muscles if none are provided.
 *
 * @param genome - The creature's compositional genome
 * @param muscleDefs - Optional muscle definitions (defaults to quadruped)
 * @param scale - Body scale factor (default 1.0)
 * @returns THREE.Group containing the muscle body mesh
 */
export function createMuscleBody(
  genome: CompositionalGenome,
  muscleDefs?: MuscleDefinition[],
  scale: number = 1.0,
): THREE.Group {
  const builder = new MultiMuscleBody();
  return builder.buildBody(genome, {
    muscles: muscleDefs ?? DEFAULT_QUADRUPED_MUSCLES,
    scale,
  });
}
