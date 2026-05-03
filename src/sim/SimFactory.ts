/**
 * SimFactory - Bridge between KinematicCompiler output and PhysicsWorld engine
 *
 * This is the core simulation factory that creates rigid bodies, joints, and
 * complete articulated objects in the physics world. It serves as the pipeline
 * bridge between:
 *   - KinematicCompiler (produces kinematic DAGs from articulated objects)
 *   - PhysicsWorld (full physics engine with RigidBody, Collider, Joint support)
 *
 * Previously a 2-line stub returning empty objects. Now fully implemented.
 */

import { Vector3, Quaternion } from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { RigidBody, RigidBodyConfig, BodyType } from './physics/RigidBody';
import { ColliderConfig, ColliderShape } from './physics/Collider';
import { Joint, JointConfig, JointType } from './physics/Joint';
import {
  boxInertiaTensor,
  sphereInertiaTensor,
  cylinderInertiaTensor,
  capsuleInertiaTensor,
} from './physics/RigidBody';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Handle to a rigid body created by SimFactory.
 * Wraps the physics-engine RigidBody with metadata needed by the sim pipeline.
 */
export interface SimRigidBody {
  /** Unique identifier (same as the underlying RigidBody's id) */
  id: string;
  /** The physics-engine rigid body */
  body: RigidBody;
  /** Human-readable name */
  name: string;
  /** IDs of colliders attached to this body */
  colliderIds: string[];
}

/**
 * Handle to a joint created by SimFactory.
 * Wraps the physics-engine Joint with metadata needed by the sim pipeline.
 */
export interface SimJoint {
  /** Unique identifier (same as the underlying Joint's id) */
  id: string;
  /** The physics-engine joint */
  joint: Joint;
  /** Human-readable name */
  name: string;
  /** ID of the first body connected by this joint */
  bodyAId: string;
  /** ID of the second body connected by this joint */
  bodyBId: string;
}

/**
 * Shape specification for creating colliders in SimFactory.
 * Supports all common physics shape types.
 */
export interface ShapeSpec {
  type: 'box' | 'sphere' | 'cylinder' | 'capsule' | 'convexHull' | 'trimesh';
  params: {
    /** For box: [width, height, depth] */
    dimensions?: [number, number, number];
    /** For sphere: radius */
    radius?: number;
    /** For cylinder/capsule: radius */
    cylinderRadius?: number;
    /** For cylinder/capsule: height */
    height?: number;
    /** For convexHull/trimesh: vertices as Float32Array */
    vertices?: Float32Array;
    /** For trimesh: indices as Uint32Array */
    indices?: Uint32Array;
  };
}

/**
 * Joint type as specified by the SimFactory API.
 * Maps to physics engine joint types internally:
 *   - 'hinge'   → PhysicsWorld 'hinge'
 *   - 'slider'  → PhysicsWorld 'prismatic'
 *   - 'ball'    → PhysicsWorld 'ball-socket'
 *   - 'fixed'   → PhysicsWorld 'fixed'
 *   - 'spring'  → PhysicsWorld 'ball-socket' (with spring-like damping)
 */
export type SimJointType = 'hinge' | 'slider' | 'ball' | 'fixed' | 'spring';

/**
 * Input format for creating a single rigid body via SimFactory.
 */
export interface SimRigidBodyConfig {
  name: string;
  mass: number;
  position: [number, number, number];
  rotation?: [number, number, number, number]; // quaternion [x, y, z, w]
  shape: ShapeSpec;
  bodyType?: 'static' | 'dynamic' | 'kinematic';
}

/**
 * Input format for creating a single joint via SimFactory.
 */
export interface SimJointConfig {
  name: string;
  type: SimJointType;
  bodyAId: string;
  bodyBId: string;
  anchor: [number, number, number];
  axis?: [number, number, number];
  limits?: { min: number; max: number };
}

/**
 * Input format for creating a complete articulated object via SimFactory.
 * Contains all rigid bodies and joints that form the articulated structure.
 *
 * Named SimArticulatedObjectResult to avoid collision with the
 * ArticulatedObjectResult in assets/objects/articulated/types.ts
 * (which is the output of articulated object generators with THREE.Group,
 * JointInfo[], etc.). This type is a simplified input format for the
 * SimFactory bridge pipeline.
 */
export interface SimArticulatedObjectResult {
  rigidBodies: Array<{
    name: string;
    mass: number;
    position: [number, number, number];
    rotation?: [number, number, number, number]; // quaternion [x, y, z, w]
    shape: ShapeSpec;
    bodyType: 'static' | 'dynamic' | 'kinematic';
  }>;
  joints: Array<{
    name: string;
    type: SimJointType;
    bodyA: string;
    bodyB: string;
    anchor: [number, number, number];
    axis?: [number, number, number];
    limits?: { min: number; max: number };
  }>;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Auto-incrementing ID counters for generated bodies, colliders, joints */
let _bodyCounter = 0;
let _colliderCounter = 0;
let _jointCounter = 0;

/**
 * Generate a unique body ID.
 */
function generateBodyId(): string {
  return `sim_body_${++_bodyCounter}`;
}

/**
 * Generate a unique collider ID.
 */
function generateColliderId(): string {
  return `sim_collider_${++_colliderCounter}`;
}

/**
 * Generate a unique joint ID.
 */
function generateJointId(): string {
  return `sim_joint_${++_jointCounter}`;
}

/**
 * Map SimFactory joint type to PhysicsWorld JointType.
 *
 * Mapping:
 *   'hinge'  → 'hinge'
 *   'slider' → 'prismatic'
 *   'ball'   → 'ball-socket'
 *   'fixed'  → 'fixed'
 *   'spring' → 'ball-socket' (spring joints use ball-socket with damping)
 */
function mapJointType(simType: SimJointType): JointType {
  switch (simType) {
    case 'hinge':
      return 'hinge';
    case 'slider':
      return 'prismatic';
    case 'ball':
      return 'ball-socket';
    case 'fixed':
      return 'fixed';
    case 'spring':
      // Spring joints are modeled as ball-socket joints with spring-like damping.
      // The damping behavior is handled through the joint's motor configuration.
      return 'ball-socket';
    default:
      console.warn(`[SimFactory] Unknown joint type "${simType}", falling back to ball-socket`);
      return 'ball-socket';
  }
}

/**
 * Resolve a ShapeSpec into a ColliderConfig that the PhysicsWorld understands.
 *
 * The PhysicsWorld Collider only supports 'box' | 'sphere' | 'cylinder' shapes,
 * so unsupported shapes (capsule, convexHull, trimesh) are approximated:
 *   - 'capsule'    → 'cylinder' (same bounding volume)
 *   - 'convexHull' → 'box' (bounding box approximation)
 *   - 'trimesh'    → 'box' (bounding box approximation)
 */
function shapeSpecToColliderConfig(
  shapeSpec: ShapeSpec,
  colliderId: string
): ColliderConfig {
  const p = shapeSpec.params;

  switch (shapeSpec.type) {
    case 'box': {
      const dims = p.dimensions ?? [1, 1, 1];
      return {
        id: colliderId,
        shape: 'box' as ColliderShape,
        halfExtents: new Vector3(dims[0] / 2, dims[1] / 2, dims[2] / 2),
      };
    }

    case 'sphere': {
      return {
        id: colliderId,
        shape: 'sphere' as ColliderShape,
        radius: p.radius ?? 0.5,
      };
    }

    case 'cylinder': {
      return {
        id: colliderId,
        shape: 'cylinder' as ColliderShape,
        radius: p.cylinderRadius ?? p.radius ?? 0.5,
        height: p.height ?? 1.0,
      };
    }

    case 'capsule': {
      // Approximate capsule as cylinder (Collider doesn't support capsule directly)
      return {
        id: colliderId,
        shape: 'cylinder' as ColliderShape,
        radius: p.cylinderRadius ?? p.radius ?? 0.5,
        height: p.height ?? 1.0,
      };
    }

    case 'convexHull': {
      // Approximate convex hull as a box.
      // If dimensions are provided, use them; otherwise default to 1x1x1.
      console.warn(
        '[SimFactory] convexHull shape approximated as box collider. ' +
        'Provide params.dimensions for accurate bounding box.'
      );
      const dims = p.dimensions ?? [1, 1, 1];
      return {
        id: colliderId,
        shape: 'box' as ColliderShape,
        halfExtents: new Vector3(dims[0] / 2, dims[1] / 2, dims[2] / 2),
      };
    }

    case 'trimesh': {
      // Approximate trimesh as a box.
      console.warn(
        '[SimFactory] trimesh shape approximated as box collider. ' +
        'Provide params.dimensions for accurate bounding box.'
      );
      const dims = p.dimensions ?? [1, 1, 1];
      return {
        id: colliderId,
        shape: 'box' as ColliderShape,
        halfExtents: new Vector3(dims[0] / 2, dims[1] / 2, dims[2] / 2),
      };
    }

    default: {
      console.warn(
        `[SimFactory] Unknown shape type "${shapeSpec.type}", falling back to box(1,1,1)`
      );
      return {
        id: colliderId,
        shape: 'box' as ColliderShape,
        halfExtents: new Vector3(0.5, 0.5, 0.5),
      };
    }
  }
}

/**
 * Compute an appropriate inertia tensor for the given shape, mass, and body type.
 * Returns undefined for static bodies (inertia not needed).
 */
function computeInertiaTensor(
  shapeSpec: ShapeSpec,
  mass: number,
  bodyType: BodyType
): import('three').Matrix3 | undefined {
  if (bodyType === 'static') return undefined;

  const p = shapeSpec.params;

  switch (shapeSpec.type) {
    case 'box': {
      const dims = p.dimensions ?? [1, 1, 1];
      return boxInertiaTensor(mass, dims[0], dims[1], dims[2]);
    }
    case 'sphere': {
      return sphereInertiaTensor(mass, p.radius ?? 0.5);
    }
    case 'cylinder': {
      return cylinderInertiaTensor(mass, p.cylinderRadius ?? p.radius ?? 0.5, p.height ?? 1.0);
    }
    case 'capsule': {
      return capsuleInertiaTensor(mass, p.cylinderRadius ?? p.radius ?? 0.5, p.height ?? 1.0);
    }
    default: {
      // For convexHull/trimesh, use sphere approximation with radius derived from dimensions
      const dims = p.dimensions ?? [1, 1, 1];
      const maxDim = Math.max(dims[0], dims[1], dims[2]);
      return sphereInertiaTensor(mass, maxDim / 2);
    }
  }
}

// ============================================================================
// SimFactory
// ============================================================================

export class SimFactory {
  private world: PhysicsWorld;

  /** Map from user-provided name → SimRigidBody handle */
  private bodiesByName: Map<string, SimRigidBody> = new Map();

  /** Map from user-provided name → SimJoint handle */
  private jointsByName: Map<string, SimJoint> = new Map();

  /** Map from body ID → SimRigidBody handle (for fast ID lookup) */
  private bodiesById: Map<string, SimRigidBody> = new Map();

  /** Map from joint ID → SimJoint handle (for fast ID lookup) */
  private jointsById: Map<string, SimJoint> = new Map();

  constructor(world?: PhysicsWorld) {
    this.world = world ?? new PhysicsWorld();
  }

  // --------------------------------------------------------------------------
  // createRigidBody
  // --------------------------------------------------------------------------

  /**
   * Create a rigid body in the physics world with an associated collider.
   *
   * Pipeline:
   * 1. Create RigidBodyConfig from the input
   * 2. Add the body to PhysicsWorld
   * 3. Create a collider from the shape specification
   * 4. Attach the collider to the body
   * 5. Return a SimRigidBody handle
   */
  createRigidBody(config: SimRigidBodyConfig): SimRigidBody {
    const bodyId = generateBodyId();
    const colliderId = generateColliderId();
    const bodyType: BodyType = config.bodyType ?? 'dynamic';

    // 1. Create RigidBodyConfig
    const rbConfig: RigidBodyConfig = {
      id: bodyId,
      bodyType,
      position: new Vector3(config.position[0], config.position[1], config.position[2]),
      mass: bodyType === 'static' ? 0 : config.mass,
    };

    // Set rotation if provided (quaternion [x, y, z, w])
    if (config.rotation) {
      rbConfig.rotation = new Quaternion(
        config.rotation[0],
        config.rotation[1],
        config.rotation[2],
        config.rotation[3]
      );
    }

    // Compute inertia tensor based on shape
    const inertiaTensor = computeInertiaTensor(config.shape, config.mass, bodyType);
    if (inertiaTensor) {
      rbConfig.inertiaTensor = inertiaTensor;
    }

    // 2. Add body to PhysicsWorld
    const body = this.world.addBody(rbConfig);

    // 3. Create collider from shape spec
    const colliderConfig = shapeSpecToColliderConfig(config.shape, colliderId);

    // 4. Add collider to the body
    this.world.addCollider(colliderConfig, bodyId);

    // 5. Build and store the SimRigidBody handle
    const simBody: SimRigidBody = {
      id: bodyId,
      body,
      name: config.name,
      colliderIds: [colliderId],
    };

    this.bodiesByName.set(config.name, simBody);
    this.bodiesById.set(bodyId, simBody);

    return simBody;
  }

  // --------------------------------------------------------------------------
  // createJoint
  // --------------------------------------------------------------------------

  /**
   * Create a joint between two rigid bodies in the physics world.
   *
   * Pipeline:
   * 1. Look up both bodies in the physics world
   * 2. Map the SimFactory joint type to the PhysicsWorld joint type
   * 3. Create JointConfig
   * 4. Add the joint to PhysicsWorld
   * 5. Return a SimJoint handle
   */
  createJoint(config: SimJointConfig): SimJoint {
    const jointId = generateJointId();

    // 1. Look up both bodies
    const simBodyA = this.bodiesByName.get(config.bodyAId) ?? this.bodiesById.get(config.bodyAId);
    const simBodyB = this.bodiesByName.get(config.bodyBId) ?? this.bodiesById.get(config.bodyBId);

    if (!simBodyA) {
      throw new Error(
        `[SimFactory] createJoint: bodyA "${config.bodyAId}" not found. ` +
        `Make sure the body was created before referencing it in a joint.`
      );
    }
    if (!simBodyB) {
      throw new Error(
        `[SimFactory] createJoint: bodyB "${config.bodyBId}" not found. ` +
        `Make sure the body was created before referencing it in a joint.`
      );
    }

    // 2. Map joint type
    const physicsJointType = mapJointType(config.type);

    // 3. Create JointConfig
    // Anchor is in world space in the SimFactory API, but JointConfig expects
    // local-space anchors (anchorA, anchorB). We convert the world-space anchor
    // to each body's local frame.
    const worldAnchor = new Vector3(config.anchor[0], config.anchor[1], config.anchor[2]);
    const anchorA = worldAnchor.clone().sub(simBodyA.body.position);
    const anchorB = worldAnchor.clone().sub(simBodyB.body.position);

    // Transform world-space offset to body-local space by applying inverse rotation
    const invRotA = simBodyA.body.rotation.clone().invert();
    const invRotB = simBodyB.body.rotation.clone().invert();
    anchorA.applyQuaternion(invRotA);
    anchorB.applyQuaternion(invRotB);

    const jointConfig: JointConfig = {
      id: jointId,
      type: physicsJointType,
      bodyAId: simBodyA.id,
      bodyBId: simBodyB.id,
      anchorA,
      anchorB,
    };

    // Set axis if provided (for hinge and prismatic joints)
    if (config.axis) {
      // Axis is specified in world space; transform to body A's local frame
      const worldAxis = new Vector3(config.axis[0], config.axis[1], config.axis[2]);
      jointConfig.axis = worldAxis.applyQuaternion(invRotA).normalize();
    }

    // Set limits if provided
    if (config.limits) {
      jointConfig.limits = { min: config.limits.min, max: config.limits.max };
    }

    // For spring joints, add damping via motor configuration
    if (config.type === 'spring') {
      // Model spring as a ball-socket with a zero-velocity motor (damping)
      // The motor tries to maintain zero velocity, creating spring-like resistance
      jointConfig.motor = {
        targetVelocity: 0,
        maxForce: 50, // Default spring stiffness
      };
    }

    // 4. Add joint to PhysicsWorld
    const joint = this.world.addJoint(jointConfig);

    // 5. Build and store the SimJoint handle
    const simJoint: SimJoint = {
      id: jointId,
      joint,
      name: config.name,
      bodyAId: simBodyA.id,
      bodyBId: simBodyB.id,
    };

    this.jointsByName.set(config.name, simJoint);
    this.jointsById.set(jointId, simJoint);

    return simJoint;
  }

  // --------------------------------------------------------------------------
  // createArticulatedObject
  // --------------------------------------------------------------------------

  /**
   * Create a full articulated object from an ArticulatedObjectResult.
   *
   * Pipeline:
   * 1. Create all rigid bodies (with colliders)
   * 2. Create all joints connecting them
   * 3. Return the complete articulated object with handles and the physics world
   */
  createArticulatedObject(result: SimArticulatedObjectResult): {
    bodies: SimRigidBody[];
    joints: SimJoint[];
    world: PhysicsWorld;
  } {
    const bodies: SimRigidBody[] = [];
    const joints: SimJoint[] = [];

    // 1. Create all rigid bodies
    for (const rbSpec of result.rigidBodies) {
      const simBody = this.createRigidBody({
        name: rbSpec.name,
        mass: rbSpec.mass,
        position: rbSpec.position,
        rotation: rbSpec.rotation,
        shape: rbSpec.shape,
        bodyType: rbSpec.bodyType,
      });
      bodies.push(simBody);
    }

    // 2. Create all joints
    for (const jointSpec of result.joints) {
      const simJoint = this.createJoint({
        name: jointSpec.name,
        type: jointSpec.type,
        bodyAId: jointSpec.bodyA,
        bodyBId: jointSpec.bodyB,
        anchor: jointSpec.anchor,
        axis: jointSpec.axis,
        limits: jointSpec.limits,
      });
      joints.push(simJoint);
    }

    // 3. Return the complete object
    return {
      bodies,
      joints,
      world: this.world,
    };
  }

  // --------------------------------------------------------------------------
  // Lookup helpers
  // --------------------------------------------------------------------------

  /**
   * Get a SimRigidBody by its name.
   */
  getBodyByName(name: string): SimRigidBody | undefined {
    return this.bodiesByName.get(name);
  }

  /**
   * Get a SimRigidBody by its physics ID.
   */
  getBodyById(id: string): SimRigidBody | undefined {
    return this.bodiesById.get(id);
  }

  /**
   * Get a SimJoint by its name.
   */
  getJointByName(name: string): SimJoint | undefined {
    return this.jointsByName.get(name);
  }

  /**
   * Get a SimJoint by its physics ID.
   */
  getJointById(id: string): SimJoint | undefined {
    return this.jointsById.get(id);
  }

  /**
   * Get all created SimRigidBodies.
   */
  getAllBodies(): SimRigidBody[] {
    return Array.from(this.bodiesById.values());
  }

  /**
   * Get all created SimJoints.
   */
  getAllJoints(): SimJoint[] {
    return Array.from(this.jointsById.values());
  }

  // --------------------------------------------------------------------------
  // Physics world access
  // --------------------------------------------------------------------------

  /**
   * Get the underlying PhysicsWorld.
   */
  getWorld(): PhysicsWorld {
    return this.world;
  }

  /**
   * Step the physics simulation forward by dt seconds.
   * Delegates to PhysicsWorld.step().
   */
  step(dt: number): void {
    this.world.step(dt);
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Remove a rigid body by name. Also removes its associated collider.
   */
  removeBodyByName(name: string): boolean {
    const simBody = this.bodiesByName.get(name);
    if (!simBody) return false;

    this.world.removeBody(simBody.id);
    this.bodiesByName.delete(name);
    this.bodiesById.delete(simBody.id);
    return true;
  }

  /**
   * Remove a joint by name.
   */
  removeJointByName(name: string): boolean {
    const simJoint = this.jointsByName.get(name);
    if (!simJoint) return false;

    this.world.removeJoint(simJoint.id);
    this.jointsByName.delete(name);
    this.jointsById.delete(simJoint.id);
    return true;
  }

  /**
   * Clear all bodies and joints from the factory and the physics world.
   */
  clear(): void {
    this.world.clear();
    this.bodiesByName.clear();
    this.bodiesById.clear();
    this.jointsByName.clear();
    this.jointsById.clear();
  }

  /**
   * Reset ID counters (useful for testing).
   */
  static resetIdCounters(): void {
    _bodyCounter = 0;
    _colliderCounter = 0;
    _jointCounter = 0;
  }
}

export default SimFactory;
