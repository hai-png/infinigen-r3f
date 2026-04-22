/**
 * SIM (Scene Interaction Model) Module
 * 
 * Physics simulation and kinematic node system for dynamic scenes.
 * Ports: core/sim/ components (algorithmic logic only, no bpy)
 * 
 * Provides:
 * - Kinematic tree representation for articulated objects
 * - Joint dynamics and constraints
 * - Material physics properties
 * - R3F physics integration helpers
 */

import { Vector3, Quaternion, Matrix4 } from 'three';

// ============================================================================
// Kinematic Node System
// ============================================================================

export enum JointType {
  FIXED = 'fixed',
  REVOLUTE = 'revolute',
  PRISMATIC = 'prismatic',
  SPHERICAL = 'spherical',
  PLANAR = 'planar',
  CONTINUOUS = 'continuous',
}

export interface JointLimits {
  lower?: number;
  upper?: number;
  velocity?: number;
  effort?: number;
}

export interface KinematicNode {
  id: string;
  name: string;
  parent?: string;
  children: string[];
  jointType: JointType;
  jointAxis: Vector3;
  jointLimits?: JointLimits;
  transform: Matrix4;
  mass: number;
  inertia: Vector3;
  friction?: number;
  restitution?: number;
}

export interface KinematicTree {
  nodes: Map<string, KinematicNode>;
  root: string;
}

export class KinematicChain {
  private tree: KinematicTree;

  constructor() {
    this.tree = {
      nodes: new Map(),
      root: '',
    };
  }

  addNode(node: KinematicNode): void {
    this.tree.nodes.set(node.id, node);
    
    if (node.parent) {
      const parent = this.tree.nodes.get(node.parent);
      if (parent) {
        parent.children.push(node.id);
      }
    } else {
      this.tree.root = node.id;
    }
  }

  getNode(id: string): KinematicNode | undefined {
    return this.tree.nodes.get(id);
  }

  getRoot(): string {
    return this.tree.root;
  }

  getAllNodes(): KinematicNode[] {
    return Array.from(this.tree.nodes.values());
  }

  /**
   * Compute forward kinematics for the chain
   */
  computeForwardKinematics(jointPositions: Map<string, number>): Map<string, Matrix4> {
    const transforms = new Map<string, Matrix4>();
    const root = this.getNode(this.getRoot());
    
    if (!root) return transforms;

    // BFS traversal
    const queue: string[] = [this.getRoot()];
    transforms.set(this.getRoot(), root.transform.clone());

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = this.getNode(nodeId)!;
      const parentTransform = transforms.get(nodeId)!;

      for (const childId of node.children) {
        const child = this.getNode(childId)!;
        
        // Apply joint transformation
        const jointTransform = this.computeJointTransform(child, jointPositions.get(childId) ?? 0);
        
        // Child transform in world space
        const worldTransform = parentTransform.clone().multiply(jointTransform).multiply(child.transform);
        transforms.set(childId, worldTransform);
        
        queue.push(childId);
      }
    }

    return transforms;
  }

  /**
   * Compute joint transformation based on joint type
   */
  private computeJointTransform(node: KinematicNode, position: number): Matrix4 {
    const transform = new Matrix4();

    switch (node.jointType) {
      case JointType.REVOLUTE:
      case JointType.CONTINUOUS:
        // Rotation around joint axis
        const rotation = new Quaternion().setFromAxisAngle(node.jointAxis, position);
        transform.makeRotationFromQuaternion(rotation);
        break;

      case JointType.PRISMATIC:
        // Translation along joint axis
        const translation = node.jointAxis.clone().multiplyScalar(position);
        transform.makeTranslation(translation.x, translation.y, translation.z);
        break;

      case JointType.SPHERICAL:
        // Spherical joint (position represents angle around axis for simplicity)
        const sphRotation = new Quaternion().setFromAxisAngle(node.jointAxis, position);
        transform.makeRotationFromQuaternion(sphRotation);
        break;

      case JointType.PLANAR:
        // Planar motion (simplified as 2D translation)
        const planarTranslation = new Vector3(position, 0, 0);
        transform.makeTranslation(planarTranslation.x, planarTranslation.y, planarTranslation.z);
        break;

      case JointType.FIXED:
      default:
        transform.identity();
        break;
    }

    return transform;
  }

  /**
   * Get degrees of freedom count
   */
  getDOF(): number {
    let dof = 0;
    for (const node of this.tree.nodes.values()) {
      switch (node.jointType) {
        case JointType.REVOLUTE:
        case JointType.PRISMATIC:
        case JointType.CONTINUOUS:
          dof += 1;
          break;
        case JointType.SPHERICAL:
          dof += 3;
          break;
        case JointType.PLANAR:
          dof += 2;
          break;
        case JointType.FIXED:
          dof += 0;
          break;
      }
    }
    return dof;
  }

  /**
   * Export to JSON for serialization
   */
  toJSON(): object {
    return {
      root: this.tree.root,
      nodes: Array.from(this.tree.nodes.entries()).map(([id, node]) => ({
        id: node.id,
        name: node.name,
        parent: node.parent,
        children: node.children,
        jointType: node.jointType,
        jointAxis: { x: node.jointAxis.x, y: node.jointAxis.y, z: node.jointAxis.z },
        jointLimits: node.jointLimits,
        transform: node.transform.toArray(),
        mass: node.mass,
        inertia: { x: node.inertia.x, y: node.inertia.y, z: node.inertia.z },
        friction: node.friction,
        restitution: node.restitution,
      })),
    };
  }
}

// ============================================================================
// Material Physics Definitions
// ============================================================================

export interface PhysicsMaterial {
  id: string;
  name: string;
  density: number;           // kg/m³
  friction: number;          // coefficient of friction
  restitution: number;       // bounciness (0-1)
  staticFriction?: number;
  dynamicFriction?: number;
  youngsModulus?: number;    // elasticity
  poissonRatio?: number;     // lateral strain ratio
}

export const DEFAULT_MATERIALS: Record<string, PhysicsMaterial> = {
  wood: {
    id: 'wood',
    name: 'Wood',
    density: 700,
    friction: 0.4,
    restitution: 0.1,
    staticFriction: 0.5,
    dynamicFriction: 0.3,
    youngsModulus: 10e9,
    poissonRatio: 0.3,
  },
  metal: {
    id: 'metal',
    name: 'Metal',
    density: 7800,
    friction: 0.3,
    restitution: 0.2,
    staticFriction: 0.4,
    dynamicFriction: 0.2,
    youngsModulus: 200e9,
    poissonRatio: 0.3,
  },
  plastic: {
    id: 'plastic',
    name: 'Plastic',
    density: 1200,
    friction: 0.3,
    restitution: 0.3,
    staticFriction: 0.3,
    dynamicFriction: 0.2,
    youngsModulus: 3e9,
    poissonRatio: 0.35,
  },
  glass: {
    id: 'glass',
    name: 'Glass',
    density: 2500,
    friction: 0.2,
    restitution: 0.1,
    staticFriction: 0.2,
    dynamicFriction: 0.15,
    youngsModulus: 70e9,
    poissonRatio: 0.2,
  },
  fabric: {
    id: 'fabric',
    name: 'Fabric',
    density: 500,
    friction: 0.6,
    restitution: 0.05,
    staticFriction: 0.7,
    dynamicFriction: 0.5,
    youngsModulus: 0.1e9,
    poissonRatio: 0.4,
  },
  rubber: {
    id: 'rubber',
    name: 'Rubber',
    density: 1100,
    friction: 0.8,
    restitution: 0.6,
    staticFriction: 0.9,
    dynamicFriction: 0.7,
    youngsModulus: 0.01e9,
    poissonRatio: 0.5,
  },
};

// ============================================================================
// Physics Simulation Helpers
// ============================================================================

export interface RigidBodyConfig {
  mass: number;
  position: Vector3;
  rotation: Quaternion;
  linearVelocity?: Vector3;
  angularVelocity?: Vector3;
  material?: PhysicsMaterial;
  collider?: ColliderType;
}

export enum ColliderType {
  BOX = 'box',
  SPHERE = 'sphere',
  CAPSULE = 'capsule',
  CYLINDER = 'cylinder',
  CONVEX = 'convex',
  TRIMESH = 'trimesh',
}

export interface ColliderDimensions {
  halfExtents?: Vector3;      // for box
  radius?: number;            // for sphere, capsule, cylinder
  height?: number;            // for capsule, cylinder
  vertices?: Float32Array;    // for convex, trimesh
  indices?: Uint32Array;      // for trimesh
}

export class PhysicsBody {
  config: RigidBodyConfig;
  collider: ColliderType;
  dimensions: ColliderDimensions;
  
  constructor(config: RigidBodyConfig, dimensions: ColliderDimensions = {}) {
    this.config = config;
    this.collider = config.collider ?? ColliderType.BOX;
    this.dimensions = dimensions;
  }

  /**
   * Convert to Rapier.js rigid body descriptor
   */
  toRapierDescriptor(): object {
    return {
      translation: this.config.position,
      rotation: this.config.rotation,
      mass: this.config.mass,
      linearVelocity: this.config.linearVelocity,
      angularVelocity: this.config.angularVelocity,
      collider: this.collider,
      dimensions: this.dimensions,
      friction: this.config.material?.friction ?? 0.5,
      restitution: this.config.material?.restitution ?? 0.1,
    };
  }

  /**
   * Compute moment of inertia for simple shapes
   */
  computeInertia(): Vector3 {
    const mass = this.config.mass;
    
    switch (this.collider) {
      case ColliderType.BOX: {
        const { x, y, z } = this.dimensions.halfExtents ?? new Vector3(0.5, 0.5, 0.5);
        const width = x * 2, height = y * 2, depth = z * 2;
        return new Vector3(
          (mass / 12) * (height * height + depth * depth),
          (mass / 12) * (width * width + depth * depth),
          (mass / 12) * (width * width + height * height)
        );
      }
      
      case ColliderType.SPHERE: {
        const r = this.dimensions.radius ?? 0.5;
        const I = (2/5) * mass * r * r;
        return new Vector3(I, I, I);
      }
      
      case ColliderType.CYLINDER: {
        const r = this.dimensions.radius ?? 0.5;
        const h = this.dimensions.height ?? 1.0;
        return new Vector3(
          (1/12) * mass * (3 * r * r + h * h),
          (1/2) * mass * r * r,
          (1/12) * mass * (3 * r * r + h * h)
        );
      }
      
      default:
        return new Vector3(1, 1, 1);
    }
  }
}

// ============================================================================
// Joint Dynamics
// ============================================================================

export interface JointConfig {
  bodyA: string;
  bodyB: string;
  jointType: JointType;
  anchorA: Vector3;
  anchorB: Vector3;
  axis?: Vector3;
  limits?: JointLimits;
  motor?: {
    targetVelocity: number;
    maxForce: number;
  };
  spring?: {
    stiffness: number;
    damping: number;
    restLength: number;
  };
}

export class SimJoint {
  config: JointConfig;

  constructor(config: JointConfig) {
    this.config = config;
  }

  /**
   * Convert to Rapier.js joint descriptor
   */
  toRapierDescriptor(): object {
    return {
      body1: this.config.bodyA,
      body2: this.config.bodyB,
      anchor1: this.config.anchorA,
      anchor2: this.config.anchorB,
      axis1: this.config.axis,
      axis2: this.config.axis,
      limits: this.config.limits,
      motor: this.config.motor,
      spring: this.config.spring,
      jointType: this.config.jointType,
    };
  }

  /**
   * Check if joint is within limits
   */
  isWithinLimits(position: number): boolean {
    const limits = this.config.limits;
    if (!limits) return true;
    
    if (limits.lower !== undefined && position < limits.lower) return false;
    if (limits.upper !== undefined && position > limits.upper) return false;
    
    return true;
  }

  /**
   * Compute constraint force for limit violation
   */
  computeLimitForce(position: number, velocity: number): number {
    const limits = this.config.limits;
    if (!limits) return 0;
    
    let force = 0;
    const stiffness = 1000;
    const damping = 100;
    
    if (limits.lower !== undefined && position < limits.lower) {
      const penetration = limits.lower - position;
      force = stiffness * penetration - damping * velocity;
    } else if (limits.upper !== undefined && position > limits.upper) {
      const penetration = position - limits.upper;
      force = -stiffness * penetration - damping * velocity;
    }
    
    return force;
  }
}

// ============================================================================
// Export Utilities
// ============================================================================

/**
 * Export kinematic chain to URDF format
 */
export function exportToURDF(chain: KinematicChain): string {
  let urdf = '<?xml version="1.0"?>\n<robot name="exported_robot">\n';
  
  for (const node of chain.getAllNodes()) {
    // Link
    urdf += `  <link name="${node.name}">\n`;
    urdf += `    <inertial>\n`;
    urdf += `      <mass value="${node.mass}"/>\n`;
    urdf += `      <inertia ixx="${node.inertia.x}" ixy="0" ixz="0" iyy="${node.inertia.y}" iyz="0" izz="${node.inertia.z}"/>\n`;
    urdf += `    </inertial>\n`;
    urdf += `  </link>\n`;
    
    // Joint (if not root)
    if (node.parent) {
      const parent = chain.getNode(node.parent)!;
      urdf += `  <joint name="${node.name}_joint" type="${node.jointType}">\n`;
      urdf += `    <parent link="${parent.name}"/>\n`;
      urdf += `    <child link="${node.name}"/>\n`;
      urdf += `    <axis xyz="${node.jointAxis.x} ${node.jointAxis.y} ${node.jointAxis.z}"/>\n`;
      
      if (node.jointLimits) {
        urdf += `    <limit lower="${node.jointLimits.lower ?? '-inf'}" upper="${node.jointLimits.upper ?? 'inf'}" `;
        urdf += `velocity="${node.jointLimits.velocity ?? 'inf'}" effort="${node.jointLimits.effort ?? 'inf'}"/>\n`;
      }
      
      urdf += `  </joint>\n`;
    }
  }
  
  urdf += '</robot>';
  return urdf;
}

/**
 * Create R3F-compatible physics world configuration
 */
export function createPhysicsWorldConfig(): object {
  return {
    gravity: { x: 0, y: -9.81, z: 0 },
    timestep: 1/60,
    substeps: 1,
    broadphase: 'sweep_and_prune',
    solverIterations: 4,
    allowSleep: true,
    sleepSpeedLimit: 0.1,
    sleepTimeLimit: 1.0,
  };
}
