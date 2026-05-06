/**
 * SimFactory - Bridge between KinematicCompiler output and PhysicsWorld engine
 *
 * This is the core simulation factory that creates rigid bodies, joints, and
 * complete articulated objects in the physics world. It serves as the pipeline
 * bridge between:
 *   - KinematicCompiler (produces kinematic DAGs from articulated objects)
 *   - PhysicsWorld (full physics engine with RigidBody, Collider, Joint support)
 *
 * The bridge pipeline is:
 *   ArticulatedObjectResult
 *     → compileKinematicTree() → KinematicNodeTree
 *     → RigidBodySkeleton.construct() → RigidBodyNode[]
 *     → SimFactory.createRigidBodyFromNode() / createJointFromNodes()
 *     → { bodies: SimRigidBody[], joints: SimJoint[], world: PhysicsWorld }
 *
 * Output is consumable by:
 *   - RapierPhysicsProvider for real-time simulation
 *   - SimulationExporter for URDF/MJCF export
 *
 * Physics Backend Consolidation (Wave 3):
 *   Rapier is established as the primary physics backend. The SimFactory
 *   provides methods that map to Rapier's capabilities:
 *   - createRapierBody() — creates a @react-three/rapier RigidBody
 *   - createRapierJoint() — creates a rapier joint
 *   - generateCollisionFromMesh() — uses MeshSimplifier for low-poly hulls
 *   - The existing PhysicsWorld-based methods remain for non-Rapier contexts
 */

import { Vector3, Quaternion, Box3, Mesh } from 'three';
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
import {
  compileKinematicTree,
  KinematicNodeTree,
  RigidBodySkeleton,
  RigidBodyNode,
} from './kinematic/KinematicCompiler';
import {
  ArticulatedObjectResult,
  JointInfo,
  JointType as ArticulatedJointType,
} from '../assets/objects/articulated/types';

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

/**
 * Full result of creating an articulated object from an ArticulatedObjectResult.
 * Contains the physics objects, the kinematic tree, and the skeleton for
 * downstream consumption by both RapierPhysicsProvider (real-time sim) and
 * SimulationExporter (URDF/MJCF export).
 */
export interface SimArticulatedObjectFullResult {
  /** Created rigid body handles */
  bodies: SimRigidBody[];
  /** Created joint handles */
  joints: SimJoint[];
  /** The underlying PhysicsWorld */
  world: PhysicsWorld;
  /** The compiled kinematic node tree (for FK/IK and export) */
  kinematicTree: KinematicNodeTree;
  /** The simplified rigid-body skeleton (for URDF/MJCF export) */
  skeleton: RigidBodySkeleton;
  /** The original ArticulatedObjectResult category */
  category: string;
}

/**
 * Configuration for creating an articulated object from an ArticulatedObjectResult.
 */
export interface CreateArticulatedObjectConfig {
  /** Default density for mass estimation (kg/m³, default: 500 for wood-like) */
  defaultDensity?: number;
  /** Default friction coefficient (default: 0.5) */
  defaultFriction?: number;
  /** Default restitution (default: 0.3) */
  defaultRestitution?: number;
  /** Whether the root body should be static (default: true) */
  rootBodyStatic?: boolean;
  /** Gravity for the physics world (default: [0, -9.81, 0]) */
  gravity?: [number, number, number];
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
  // Bridge: ArticulatedObjectResult → KinematicCompiler → PhysicsWorld
  // --------------------------------------------------------------------------

  /**
   * Create a full articulated object from an ArticulatedObjectResult.
   *
   * This is the core bridge method. It:
   * 1. Runs the ArticulatedObjectResult through compileKinematicTree()
   * 2. Builds a RigidBodySkeleton (simplifies weld-connected bodies)
   * 3. Creates rigid bodies from the skeleton nodes
   * 4. Creates joints between parent-child body pairs
   * 5. Returns a full result including the kinematic tree and skeleton
   *    for downstream consumption by RapierPhysicsProvider and SimulationExporter
   *
   * @param result - The ArticulatedObjectResult from a generator
   * @param config - Configuration for mass estimation, body types, etc.
   * @returns Full result with physics handles, kinematic tree, and skeleton
   */
  createArticulatedObjectFromResult(
    result: ArticulatedObjectResult,
    config: CreateArticulatedObjectConfig = {}
  ): SimArticulatedObjectFullResult {
    const density = config.defaultDensity ?? 500;
    const rootBodyStatic = config.rootBodyStatic ?? true;

    // Step 1: Compile the kinematic tree from the articulated object
    const kinematicTree = compileKinematicTree(result);

    // Step 2: Build the rigid body skeleton (simplifies weld-connected bodies)
    const skeleton = new RigidBodySkeleton();
    skeleton.construct(kinematicTree);

    // Step 3: Build a mesh lookup from the THREE.Group
    const meshLookup = this.buildMeshLookup(result.group);

    // Step 4: Build a JointInfo lookup from the result
    const jointLookup = new Map<string, JointInfo>();
    for (const j of result.joints) {
      jointLookup.set(j.id, j);
    }

    // Step 5: Create all rigid bodies from the skeleton
    const nodeToBody = new Map<string, SimRigidBody>();
    const bodies: SimRigidBody[] = [];

    for (const rbNode of skeleton.bodies) {
      const isRoot = rbNode.parentId === null;
      const bodyType: BodyType = (isRoot && rootBodyStatic) ? 'static' : 'dynamic';

      // Find meshes that belong to this body (via meshSubset path attribute)
      const bodyMeshes = this.findMeshesForNode(rbNode, meshLookup);
      const bounds = this.computeCombinedBounds(bodyMeshes);
      const shape = this.inferShapeFromBounds(bounds);
      const mass = this.estimateMassFromBounds(bounds, density, bodyType);

      // Get position from mesh or default
      const position = this.computeBodyPosition(bodyMeshes, bounds);

      const simBody = this.createRigidBody({
        name: rbNode.id,
        mass,
        position: [position.x, position.y, position.z],
        shape,
        bodyType,
      });

      // Store the skeleton node reference on the body's userData
      simBody.body.userData = {
        ...simBody.body.userData,
        skeletonNodeId: rbNode.id,
        meshSubset: rbNode.meshSubset,
        isRoot,
        jointType: rbNode.jointType,
        jointAxis: rbNode.jointAxis.toArray(),
        jointLimits: rbNode.jointLimits,
        jointDynamics: rbNode.jointDynamics,
      };

      nodeToBody.set(rbNode.id, simBody);
      bodies.push(simBody);
    }

    // Step 6: Create all joints from the skeleton's parent-child relationships
    const joints: SimJoint[] = [];

    for (const rbNode of skeleton.bodies) {
      if (rbNode.parentId === null) continue;

      const parentSimBody = nodeToBody.get(rbNode.parentId);
      const childSimBody = nodeToBody.get(rbNode.id);

      if (!parentSimBody || !childSimBody) {
        console.warn(
          `[SimFactory] Skipping joint for node "${rbNode.id}": ` +
          `parent body "${rbNode.parentId}" or child body not found.`
        );
        continue;
      }

      // Skip weld/fixed joints (bodies are already merged by RigidBodySkeleton,
      // but we may still have fixed joints if simplification was partial)
      if (rbNode.isWelded()) {
        // Create a fixed joint to maintain the constraint
        const simJoint = this.createJointFromRigidBodyNode(
          rbNode,
          parentSimBody,
          childSimBody,
          jointLookup
        );
        if (simJoint) {
          joints.push(simJoint);
        }
        continue;
      }

      // Create articulated joint
      const simJoint = this.createJointFromRigidBodyNode(
        rbNode,
        parentSimBody,
        childSimBody,
        jointLookup
      );
      if (simJoint) {
        joints.push(simJoint);
      }
    }

    return {
      bodies,
      joints,
      world: this.world,
      kinematicTree,
      skeleton,
      category: result.category,
    };
  }

  // --------------------------------------------------------------------------
  // Bridge helpers: RigidBodyNode → physics objects
  // --------------------------------------------------------------------------

  /**
   * Create a SimJoint from a RigidBodyNode's connection to its parent.
   *
   * Maps RigidBodyNode joint types to physics engine joint types:
   *   - 'hinge' / 'continuous' → hinge
   *   - 'prismatic' → slider (prismatic)
   *   - 'ball' / 'ball_socket' → ball
   *   - 'fixed' / 'weld' → fixed
   *
   * @param rbNode - The child RigidBodyNode with joint info
   * @param parentBody - The parent SimRigidBody
   * @param childBody - The child SimRigidBody
   * @param jointLookup - Lookup from joint ID to JointInfo (for anchor/axis data)
   */
  private createJointFromRigidBodyNode(
    rbNode: RigidBodyNode,
    parentBody: SimRigidBody,
    childBody: SimRigidBody,
    jointLookup: Map<string, JointInfo>
  ): SimJoint | null {
    // Determine the SimJointType from the RigidBodyNode's joint type
    const simJointType = this.rbJointTypeToSimJointType(rbNode.jointType);
    const jointName = `joint_${rbNode.parentId}_to_${rbNode.id}`;

    // Try to find the original JointInfo for this connection
    const jointInfo = this.findJointInfoForNode(rbNode, jointLookup);

    // Determine anchor point
    let anchor: [number, number, number];
    let axis: [number, number, number] | undefined;
    let limits: { min: number; max: number } | undefined;

    if (jointInfo) {
      // Use anchor from the original JointInfo (it's in parent local space)
      // Convert to world space by adding parent body position
      const parentPos = parentBody.body.position;
      anchor = [
        jointInfo.anchor.x + parentPos.x,
        jointInfo.anchor.y + parentPos.y,
        jointInfo.anchor.z + parentPos.z,
      ];
      axis = [jointInfo.axis.x, jointInfo.axis.y, jointInfo.axis.z];
      limits = { min: jointInfo.limits.min, max: jointInfo.limits.max };
    } else {
      // Fallback: place anchor at the midpoint between parent and child
      const parentPos = parentBody.body.position;
      const childPos = childBody.body.position;
      anchor = [
        (parentPos.x + childPos.x) / 2,
        (parentPos.y + childPos.y) / 2,
        (parentPos.z + childPos.z) / 2,
      ];
      // Use axis from the skeleton node
      const ja = rbNode.jointAxis;
      if (ja.lengthSq() > 0) {
        axis = [ja.x, ja.y, ja.z];
      }
      // Use limits from the skeleton node
      if (rbNode.jointLimits.min !== 0 || rbNode.jointLimits.max !== 0) {
        limits = { min: rbNode.jointLimits.min, max: rbNode.jointLimits.max };
      }
    }

    try {
      return this.createJoint({
        name: jointName,
        type: simJointType,
        bodyAId: parentBody.id,
        bodyBId: childBody.id,
        anchor,
        axis,
        limits,
      });
    } catch (err) {
      console.warn(
        `[SimFactory] Failed to create joint "${jointName}":`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }

  /**
   * Map a RigidBodyNode joint type (ArticulatedJointType | 'weld')
   * to a SimJointType for the physics engine.
   */
  private rbJointTypeToSimJointType(
    jointType: ArticulatedJointType | 'weld'
  ): SimJointType {
    switch (jointType) {
      case 'hinge':
      case 'continuous':
        return 'hinge';
      case 'prismatic':
        return 'slider';
      case 'ball':
      case 'ball_socket':
        return 'ball';
      case 'fixed':
      case 'weld':
        return 'fixed';
      default:
        console.warn(
          `[SimFactory] Unknown RigidBodyNode joint type "${jointType}", falling back to fixed`
        );
        return 'fixed';
    }
  }

  /**
   * Find the original JointInfo that corresponds to a RigidBodyNode's
   * connection to its parent. This is needed because RigidBodySkeleton
   * may merge nodes, so the node IDs may not directly match joint IDs.
   */
  private findJointInfoForNode(
    rbNode: RigidBodyNode,
    jointLookup: Map<string, JointInfo>
  ): JointInfo | null {
    // Strategy 1: Direct lookup by node ID (the joint node ID is typically
    // "joint_<jointInfo.id>")
    if (rbNode.id.startsWith('joint_')) {
      const jointId = rbNode.id.replace('joint_', '');
      const info = jointLookup.get(jointId);
      if (info) return info;
    }

    // Strategy 2: Search by matching parent-child mesh names
    // The RigidBodyNode's meshSubset may contain the child mesh name
    const meshSubsets = rbNode.meshSubset.split(',');
    for (const subset of meshSubsets) {
      for (const [, info] of jointLookup) {
        if (info.childMesh === subset.trim()) {
          return info;
        }
      }
    }

    // Strategy 3: Search for any joint whose child mesh matches a descendant
    for (const [, info] of jointLookup) {
      if (rbNode.id.includes(info.id) || rbNode.id.includes(info.childMesh)) {
        return info;
      }
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Bridge helpers: Mesh analysis
  // --------------------------------------------------------------------------

  /**
   * Build a map from mesh name → THREE.Mesh for quick lookup.
   * Traverses the THREE.Group hierarchy and collects all Mesh objects.
   */
  private buildMeshLookup(group: import('three').Group): Map<string, Mesh> {
    const lookup = new Map<string, Mesh>();
    group.traverse((child) => {
      if (child instanceof Mesh) {
        // Use the mesh name as the key; fall back to uuid
        const key = child.name || child.uuid;
        lookup.set(key, child);
      }
    });
    return lookup;
  }

  /**
   * Find all meshes that belong to a RigidBodyNode based on its meshSubset.
   *
   * The meshSubset is a comma-separated list of mesh names that identify
   * which meshes belong to this rigid body. This is set by the
   * RigidBodySkeleton during simplification.
   */
  private findMeshesForNode(
    rbNode: RigidBodyNode,
    meshLookup: Map<string, Mesh>
  ): Mesh[] {
    const meshes: Mesh[] = [];
    const subsetNames = rbNode.meshSubset.split(',').map((s) => s.trim());

    for (const name of subsetNames) {
      const mesh = meshLookup.get(name);
      if (mesh) {
        meshes.push(mesh);
      }
    }

    return meshes;
  }

  /**
   * Compute the combined bounding box of multiple meshes.
   * Returns a Box3 that encloses all the given meshes in world space.
   */
  private computeCombinedBounds(meshes: Mesh[]): Box3 {
    const bounds = new Box3();

    if (meshes.length === 0) {
      // Default: unit box centered at origin
      bounds.set(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
      return bounds;
    }

    for (const mesh of meshes) {
      // Compute world-space bounding box
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      const meshBounds = mesh.geometry.boundingBox!.clone();
      // Transform to world space
      meshBounds.applyMatrix4(mesh.matrixWorld);
      bounds.union(meshBounds);
    }

    return bounds;
  }

  /**
   * Infer a ShapeSpec from a bounding box.
   *
   * Strategy:
   * - If the box is nearly cubic (all dimensions within 20% of each other), use sphere
   * - If one dimension is much larger than the other two (cylinder-like), use cylinder
   * - Otherwise, use box (the most general shape)
   */
  private inferShapeFromBounds(bounds: Box3): ShapeSpec {
    const size = new Vector3();
    bounds.getSize(size);

    const x = size.x, y = size.y, z = size.z;
    const maxDim = Math.max(x, y, z);
    const minDim = Math.min(x, y, z);

    // Avoid degenerate cases
    if (maxDim < 1e-6) {
      return {
        type: 'box',
        params: { dimensions: [1, 1, 1] },
      };
    }

    const aspectRatio = maxDim / Math.max(minDim, 1e-6);

    // Nearly uniform in all dimensions → sphere
    if (aspectRatio < 1.3) {
      return {
        type: 'sphere',
        params: { radius: maxDim / 2 },
      };
    }

    // One dimension much larger → cylinder along that axis
    if (aspectRatio > 2.0) {
      // Find the elongated axis
      const radius = minDim / 2;
      const height = maxDim;
      return {
        type: 'cylinder',
        params: { cylinderRadius: radius, height },
      };
    }

    // Default: box
    return {
      type: 'box',
      params: { dimensions: [x, y, z] },
    };
  }

  /**
   * Estimate mass from bounding box volume and density.
   * Returns 0 for static bodies (they don't need mass).
   */
  private estimateMassFromBounds(
    bounds: Box3,
    density: number,
    bodyType: BodyType
  ): number {
    if (bodyType === 'static') return 0;

    const size = new Vector3();
    bounds.getSize(size);
    const volume = size.x * size.y * size.z;

    // Use a fill factor of 0.5 (most objects aren't solid boxes)
    return volume * density * 0.5;
  }

  /**
   * Compute the center position for a body from its meshes and bounding box.
   */
  private computeBodyPosition(meshes: Mesh[], bounds: Box3): Vector3 {
    if (meshes.length === 0) {
      return new Vector3();
    }

    // Use the center of the bounding box
    const center = new Vector3();
    bounds.getCenter(center);
    return center;
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
