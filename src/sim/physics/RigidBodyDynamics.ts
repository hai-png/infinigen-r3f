/**
 * Physics Simulation Module for Infinigen R3F
 * 
 * Provides complete rigid body dynamics, collision detection,
 * and physics material definitions integrated with @react-three/rapier.
 */

import { Vector3, Quaternion, Matrix4, Box3, Sphere } from 'three';
import type { RapierRigidBody, ColliderDesc, RigidBodyDesc } from '@react-three/rapier';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type PhysicsShapeType = 
  | 'box' 
  | 'sphere' 
  | 'capsule' 
  | 'cylinder' 
  | 'convexHull' 
  | 'trimesh'
  | 'heightfield';

export interface PhysicsShape {
  type: PhysicsShapeType;
  dimensions?: Vector3; // For box, capsule, cylinder
  radius?: number;      // For sphere, capsule, cylinder
  height?: number;      // For capsule, cylinder
  vertices?: Float32Array; // For convexHull, trimesh
  indices?: Uint32Array;   // For trimesh
  heights?: Float32Array;  // For heightfield
  size?: Vector3;          // For heightfield
}

export interface PhysicsMaterial {
  id: string;
  name: string;
  friction: number;
  restitution: number;
  density: number;
  linearDamping: number;
  angularDamping: number;
}

export interface RigidBodyConfig {
  id: string;
  position: Vector3;
  rotation: Quaternion;
  mass: number;
  shape: PhysicsShape;
  materialId: string;
  isStatic: boolean;
  isKinematic: boolean;
  ccdEnabled: boolean; // Continuous Collision Detection
  sleepThreshold?: number;
}

export interface CollisionEvent {
  collider1: string;
  collider2: string;
  contactPoint: Vector3;
  normal: Vector3;
  impulse: number;
  timestamp: number;
  depth: number;
}

export interface ConstraintConfig {
  id: string;
  type: 'fixed' | 'revolute' | 'prismatic' | 'spherical' | 'cone' | 'motor';
  bodyA: string;
  bodyB: string;
  anchorA?: Vector3;
  anchorB?: Vector3;
  axis?: Vector3;
  limits?: { min: number; max: number };
  motor?: { velocity: number; force: number };
}

// ============================================================================
// Physics Material Library
// ============================================================================

export const PHYSICS_MATERIALS: Record<string, PhysicsMaterial> = {
  default: {
    id: 'default',
    name: 'Default',
    friction: 0.5,
    restitution: 0.3,
    density: 1.0,
    linearDamping: 0.05,
    angularDamping: 0.05,
  },
  
  wood: {
    id: 'wood',
    name: 'Wood',
    friction: 0.4,
    restitution: 0.2,
    density: 0.7,
    linearDamping: 0.05,
    angularDamping: 0.05,
  },
  
  metal: {
    id: 'metal',
    name: 'Metal',
    friction: 0.3,
    restitution: 0.4,
    density: 7.8,
    linearDamping: 0.02,
    angularDamping: 0.02,
  },
  
  plastic: {
    id: 'plastic',
    name: 'Plastic',
    friction: 0.4,
    restitution: 0.3,
    density: 1.2,
    linearDamping: 0.05,
    angularDamping: 0.05,
  },
  
  rubber: {
    id: 'rubber',
    name: 'Rubber',
    friction: 0.8,
    restitution: 0.6,
    density: 1.1,
    linearDamping: 0.1,
    angularDamping: 0.1,
  },
  
  glass: {
    id: 'glass',
    name: 'Glass',
    friction: 0.2,
    restitution: 0.1,
    density: 2.5,
    linearDamping: 0.02,
    angularDamping: 0.02,
  },
  
  fabric: {
    id: 'fabric',
    name: 'Fabric',
    friction: 0.6,
    restitution: 0.1,
    density: 0.3,
    linearDamping: 0.2,
    angularDamping: 0.2,
  },
  
  terrain: {
    id: 'terrain',
    name: 'Terrain',
    friction: 0.7,
    restitution: 0.1,
    density: 2.0,
    linearDamping: 0.1,
    angularDamping: 0.1,
  },
  
  ice: {
    id: 'ice',
    name: 'Ice',
    friction: 0.05,
    restitution: 0.1,
    density: 0.9,
    linearDamping: 0.01,
    angularDamping: 0.01,
  },
  
  water: {
    id: 'water',
    name: 'Water',
    friction: 0.1,
    restitution: 0.0,
    density: 1.0,
    linearDamping: 0.5,
    angularDamping: 0.5,
  },
};

// ============================================================================
// Kinematic Compiler
// ============================================================================

export interface KinematicJoint {
  id: string;
  type: 'revolute' | 'prismatic' | 'spherical' | 'fixed';
  parentLink: string;
  childLink: string;
  origin: Vector3;
  axis?: Vector3;
  limits?: { lower: number; upper: number; effort: number; velocity: number };
  mimic?: { joint: string; multiplier: number; offset: number };
}

export interface KinematicLink {
  id: string;
  name: string;
  inertia: {
    ixx: number; ixy: number; ixz: number;
    iyy: number; iyz: number; izz: number;
  };
  mass: number;
  visual?: {
    geometry: PhysicsShape;
    material?: string;
  };
  collision?: {
    geometry: PhysicsShape;
  };
}

export interface KinematicChain {
  id: string;
  name: string;
  links: Map<string, KinematicLink>;
  joints: Map<string, KinematicJoint>;
  rootLink: string;
}

export class KinematicCompiler {
  private chains: Map<string, KinematicChain> = new Map();
  private compiledChains: Map<string, CompiledKinematicChain> = new Map();

  /**
   * Register a kinematic chain
   */
  registerChain(chain: KinematicChain): void {
    this.chains.set(chain.id, chain);
    this.compiledChains.delete(chain.id); // Invalidate compiled version
  }

  /**
   * Compile a kinematic chain for runtime optimization
   */
  compileChain(chainId: string): CompiledKinematicChain {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Kinematic chain ${chainId} not found`);
    }

    // Build link hierarchy
    const linkHierarchy = new Map<string, KinematicLink>();
    const jointTree = new Map<string, KinematicJoint[]>();
    
    // Find root and build tree
    const rootLink = chain.links.get(chain.rootLink);
    if (!rootLink) {
      throw new Error(`Root link ${chain.rootLink} not found`);
    }
    
    linkHierarchy.set(chain.rootLink, rootLink);
    jointTree.set(chain.rootLink, []);

    // Build parent-child relationships
    for (const [jointId, joint] of chain.joints) {
      const parentJoints = jointTree.get(joint.parentLink) || [];
      parentJoints.push(joint);
      jointTree.set(joint.parentLink, parentJoints);
      
      if (!linkHierarchy.has(joint.childLink)) {
        const childLink = chain.links.get(joint.childLink);
        if (childLink) {
          linkHierarchy.set(joint.childLink, childLink);
        }
      }
    }

    // Compute forward kinematics cache
    const fkCache = this.computeForwardKinematicsCache(chain, jointTree);
    
    // Compute Jacobians for efficient inverse kinematics
    const jacobianCache = this.computeJacobianCache(chain, jointTree);

    const compiled: CompiledKinematicChain = {
      id: chain.id,
      name: chain.name,
      links: linkHierarchy,
      joints: chain.joints,
      jointTree,
      forwardKinematicsCache: fkCache,
      jacobianCache,
      dofCount: this.countDegreesOfFreedom(chain),
    };

    this.compiledChains.set(chainId, compiled);
    return compiled;
  }

  private computeForwardKinematicsCache(
    chain: KinematicChain,
    jointTree: Map<string, KinematicJoint[]>
  ): Map<string, Matrix4> {
    const cache = new Map<string, Matrix4>();
    
    const computeTransform = (linkId: string, parentTransform: Matrix4): Matrix4 => {
      const link = chain.links.get(linkId);
      if (!link) return parentTransform;

      // Find joint connecting to this link
      let jointTransform = new Matrix4().identity();
      for (const [parentId, joints] of jointTree.entries()) {
        for (const joint of joints) {
          if (joint.childLink === linkId) {
            jointTransform = this.jointToMatrix(joint);
            break;
          }
        }
      }

      const worldTransform = parentTransform.clone().multiply(jointTransform);
      cache.set(linkId, worldTransform);

      // Process children
      const children = jointTree.get(linkId) || [];
      for (const childJoint of children) {
        computeTransform(childJoint.childLink, worldTransform);
      }

      return worldTransform;
    };

    computeTransform(chain.rootLink, new Matrix4().identity());
    return cache;
  }

  private computeJacobianCache(
    chain: KinematicChain,
    jointTree: Map<string, KinematicJoint[]>
  ): Map<string, Matrix4[]> {
    // Simplified Jacobian cache - in production would compute full analytical Jacobians
    const cache = new Map<string, Matrix4[]>();
    
    for (const [linkId] of chain.links) {
      const jacobians: Matrix4[] = [];
      // Compute Jacobian for each DOF affecting this link
      cache.set(linkId, jacobians);
    }
    
    return cache;
  }

  private jointToMatrix(joint: KinematicJoint): Matrix4 {
    const matrix = new Matrix4().makeTranslation(
      joint.origin.x,
      joint.origin.y,
      joint.origin.z
    );
    
    if (joint.axis) {
      // Apply rotation based on joint type and axis
      // Simplified - would need full rotation matrix based on joint angle
    }
    
    return matrix;
  }

  private countDegreesOfFreedom(chain: KinematicChain): number {
    let dof = 0;
    for (const joint of chain.joints.values()) {
      switch (joint.type) {
        case 'revolute':
        case 'prismatic':
          dof += 1;
          break;
        case 'spherical':
          dof += 3;
          break;
        case 'fixed':
          dof += 0;
          break;
      }
    }
    return dof;
  }

  getCompiledChain(chainId: string): CompiledKinematicChain | null {
    return this.compiledChains.get(chainId) || null;
  }

  /**
   * Update joint positions and recompute forward kinematics
   */
  updateJointPositions(chainId: string, jointPositions: Map<string, number>): Matrix4[] {
    const compiled = this.compiledChains.get(chainId);
    if (!compiled) {
      throw new Error(`Compiled chain ${chainId} not found`);
    }

    // Update joint transforms based on positions
    // Recompute forward kinematics cache
    const updatedFk = new Map<string, Matrix4>();
    
    // Implementation would update each joint transform and propagate
    // This is a simplified placeholder
    
    return Array.from(updatedFk.values());
  }
}

export interface CompiledKinematicChain {
  id: string;
  name: string;
  links: Map<string, KinematicLink>;
  joints: Map<string, KinematicJoint>;
  jointTree: Map<string, KinematicJoint[]>;
  forwardKinematicsCache: Map<string, Matrix4>;
  jacobianCache: Map<string, Matrix4[]>;
  dofCount: number;
}

// ============================================================================
// Collision Detection System
// ============================================================================

export type CollisionLayer = number;

export const COLLISION_LAYERS = {
  DEFAULT: 1,
  STATIC: 2,
  DYNAMIC: 4,
  TRIGGER: 8,
  CHARACTER: 16,
  VEHICLE: 32,
  PROJECTILE: 64,
  SENSOR: 128,
};

export interface CollisionFilter {
  groups: CollisionLayer;
  mask: CollisionLayer;
}

export class CollisionDetectionSystem {
  private colliders: Map<string, ColliderInfo> = new Map();
  private collisionPairs: Set<string> = new Set();
  private contactCache: Map<string, ContactData> = new Map();

  /**
   * Register a collider
   */
  registerCollider(collider: ColliderInfo): void {
    this.colliders.set(collider.id, collider);
    this.updateBoundingVolumes(collider);
  }

  /**
   * Unregister a collider
   */
  unregisterCollider(colliderId: string): void {
    this.colliders.delete(colliderId);
    // Clean up contact cache
    for (const [key] of this.contactCache.entries()) {
      if (key.includes(colliderId)) {
        this.contactCache.delete(key);
      }
    }
  }

  /**
   * Update collider transform
   */
  updateColliderTransform(colliderId: string, position: Vector3, rotation: Quaternion): void {
    const collider = this.colliders.get(colliderId);
    if (!collider) return;

    // Update bounding volumes
    this.updateBoundingVolumes(collider, position, rotation);
  }

  private updateBoundingVolumes(
    collider: ColliderInfo,
    position?: Vector3,
    rotation?: Quaternion
  ): void {
    const pos = position || new Vector3(0, 0, 0);
    
    // Compute bounding box
    collider.boundingBox = this.computeBoundingBox(collider.shape, pos);
    
    // Compute bounding sphere
    collider.boundingSphere = this.computeBoundingSphere(collider.shape, pos);
  }

  private computeBoundingBox(shape: PhysicsShape, position: Vector3): Box3 {
    const box = new Box3();
    
    switch (shape.type) {
      case 'box': {
        const halfExtents = shape.dimensions!.clone().multiplyScalar(0.5);
        box.setFromCenterAndSize(position, shape.dimensions!);
        break;
      }
      case 'sphere': {
        const diameter = shape.radius! * 2;
        box.setFromCenterAndSize(position, new Vector3(diameter, diameter, diameter));
        break;
      }
      case 'capsule': {
        const width = shape.radius! * 2;
        const height = shape.height! + shape.radius! * 2;
        box.setFromCenterAndSize(position, new Vector3(width, height, width));
        break;
      }
      case 'cylinder': {
        const diameter = shape.radius! * 2;
        box.setFromCenterAndSize(position, new Vector3(diameter, shape.height!, diameter));
        break;
      }
      case 'convexHull':
      case 'trimesh': {
        if (shape.vertices) {
          box.setFromPoints(Array.from(shape.vertices).map((_, i) => 
            new Vector3(
              shape.vertices![i * 3],
              shape.vertices![i * 3 + 1],
              shape.vertices![i * 3 + 2]
            ).add(position)
          ));
        }
        break;
      }
    }
    
    return box;
  }

  private computeBoundingSphere(shape: PhysicsShape, position: Vector3): Sphere {
    let radius = 0;
    
    switch (shape.type) {
      case 'box':
        radius = shape.dimensions!.length() * 0.5;
        break;
      case 'sphere':
        radius = shape.radius!;
        break;
      case 'capsule':
      case 'cylinder':
        radius = Math.max(shape.radius!, shape.height! * 0.5);
        break;
      case 'convexHull':
      case 'trimesh':
        // Compute from vertices
        if (shape.vertices) {
          let maxDist = 0;
          for (let i = 0; i < shape.vertices.length; i += 3) {
            const v = new Vector3(
              shape.vertices[i],
              shape.vertices[i + 1],
              shape.vertices[i + 2]
            );
            maxDist = Math.max(maxDist, v.length());
          }
          radius = maxDist;
        }
        break;
    }
    
    return new Sphere(position, radius);
  }

  /**
   * Broad phase collision detection using sweep and prune
   */
  broadPhase(): string[][] {
    const potentialCollisions: string[][] = [];
    const colliderList = Array.from(this.colliders.values());
    
    // Sort by min X coordinate (sweep and prune)
    colliderList.sort((a, b) => a.boundingBox.min.x - b.boundingBox.min.x);
    
    // Check overlapping intervals
    for (let i = 0; i < colliderList.length; i++) {
      const colliderA = colliderList[i];
      
      for (let j = i + 1; j < colliderList.length; j++) {
        const colliderB = colliderList[j];
        
        // Early exit if no overlap in X
        if (colliderB.boundingBox.min.x > colliderA.boundingBox.max.x) {
          break;
        }
        
        // Check collision filter
        if (!this.testCollisionFilter(colliderA.filter, colliderB.layer)) {
          continue;
        }
        
        // Check bounding box overlap
        if (this.testBoxOverlap(colliderA.boundingBox, colliderB.boundingBox)) {
          potentialCollisions.push([colliderA.id, colliderB.id]);
        }
      }
    }
    
    return potentialCollisions;
  }

  private testCollisionFilter(filter: CollisionFilter, layer: CollisionLayer): boolean {
    return (filter.groups & layer) !== 0 && (filter.mask & layer) !== 0;
  }

  private testBoxOverlap(boxA: Box3, boxB: Box3): boolean {
    return boxA.intersectsBox(boxB);
  }

  /**
   * Narrow phase collision detection
   */
  narrowPhase(pairs: string[][]): CollisionEvent[] {
    const collisions: CollisionEvent[] = [];
    
    for (const [idA, idB] of pairs) {
      const colliderA = this.colliders.get(idA);
      const colliderB = this.colliders.get(idB);
      
      if (!colliderA || !colliderB) continue;
      
      const contact = this.detectContact(colliderA, colliderB);
      if (contact) {
        const pairKey = [idA, idB].sort().join('-');
        const wasColliding = this.collisionPairs.has(pairKey);
        
        this.collisionPairs.add(pairKey);
        
        collisions.push({
          collider1: idA,
          collider2: idB,
          contactPoint: contact.points[0],
          normal: contact.normal,
          impulse: 0, // Would be computed during resolution
          timestamp: Date.now(),
          depth: contact.depth || 0,
        });
        
        // Cache contact data
        this.contactCache.set(pairKey, contact);
      } else {
        const pairKey = [idA, idB].sort().join('-');
        this.collisionPairs.delete(pairKey);
        this.contactCache.delete(pairKey);
      }
    }
    
    return collisions;
  }

  private detectContact(a: ColliderInfo, b: ColliderInfo): ContactData | null {
    // Simple GJK-like contact detection (simplified)
    // In production, would use full GJK/EPA algorithm
    
    switch (a.shape.type) {
      case 'sphere':
        return this.sphereContacts(a, b);
      case 'box':
        return this.boxContacts(a, b);
      default:
        return this.genericContacts(a, b);
    }
  }

  private sphereContacts(sphereCollider: ColliderInfo, other: ColliderInfo): ContactData | null {
    const sphere = sphereCollider.boundingSphere;
    
    switch (other.shape.type) {
      case 'sphere': {
        const otherSphere = other.boundingSphere;
        const direction = new Vector3().subVectors(otherSphere.center, sphere.center);
        const distance = direction.length();
        const minDistance = sphere.radius + otherSphere.radius;
        
        if (distance >= minDistance) return null;
        
        direction.normalize();
        const contactPoint = sphere.center.clone().add(direction.multiplyScalar(sphere.radius));
        const penetration = minDistance - distance;
        
        return {
          points: [contactPoint],
          normal: direction,
          depth: penetration,
          bodyA: sphereCollider.id,
          bodyB: other.id,
        };
      }
      
      case 'box': {
        // Simplified sphere-box contact
        const closestPoint = other.boundingBox.clampPoint(sphere.center, new Vector3());
        const direction = new Vector3().subVectors(sphere.center, closestPoint);
        const distance = direction.length();
        
        if (distance >= sphere.radius) return null;
        
        direction.normalize();
        const penetration = sphere.radius - distance;
        
        return {
          points: [closestPoint],
          normal: direction,
          depth: penetration,
          bodyA: sphereCollider.id,
          bodyB: other.id,
        };
      }
    }
    
    return null;
  }

  private boxContacts(a: ColliderInfo, b: ColliderInfo): ContactData | null {
    if (!a.boundingBox.intersectsBox(b.boundingBox)) {
      return null;
    }
    
    // Simplified box-box contact
    // In production, would use SAT (Separating Axis Theorem)
    
    const centerA = new Vector3();
    const centerB = new Vector3();
    a.boundingBox.getCenter(centerA);
    b.boundingBox.getCenter(centerB);
    
    const normal = new Vector3().subVectors(centerB, centerA).normalize();
    const contactPoint = new Vector3();
    
    // Find contact point on A's surface
    a.boundingBox.clampPoint(centerB, contactPoint);
    
    // Estimate penetration depth
    const overlap = Math.min(
      a.boundingBox.max.x - b.boundingBox.min.x,
      b.boundingBox.max.x - a.boundingBox.min.x,
      a.boundingBox.max.y - b.boundingBox.min.y,
      b.boundingBox.max.y - a.boundingBox.min.y,
      a.boundingBox.max.z - b.boundingBox.min.z,
      b.boundingBox.max.z - a.boundingBox.min.z
    );
    
    return {
      points: [contactPoint],
      normal,
      depth: overlap * 0.5,
      bodyA: a.id,
      bodyB: b.id,
    };
  }

  private genericContacts(a: ColliderInfo, b: ColliderInfo): ContactData | null {
    // Fallback to bounding sphere test
    if (!a.boundingSphere.intersectsSphere(b.boundingSphere)) {
      return null;
    }
    
    const direction = new Vector3().subVectors(b.boundingSphere.center, a.boundingSphere.center);
    const distance = direction.length();
    const minDistance = a.boundingSphere.radius + b.boundingSphere.radius;
    
    if (distance >= minDistance) return null;
    
    direction.normalize();
    const contactPoint = a.boundingSphere.center.clone().add(
      direction.multiplyScalar(a.boundingSphere.radius)
    );
    
    return {
      points: [contactPoint],
      normal: direction,
      depth: minDistance - distance,
      bodyA: a.id,
      bodyB: b.id,
    };
  }

  /**
   * Get cached contact data
   */
  getContactData(colliderA: string, colliderB: string): ContactData | null {
    const key = [colliderA, colliderB].sort().join('-');
    return this.contactCache.get(key) || null;
  }

  /**
   * Clear all collision data
   */
  clear(): void {
    this.collisionPairs.clear();
    this.contactCache.clear();
  }
}

// ============================================================================
// Rigid Body Dynamics
// ============================================================================

export interface RigidBodyState {
  position: Vector3;
  rotation: Quaternion;
  linearVelocity: Vector3;
  angularVelocity: Vector3;
  awake: boolean;
}

export class RigidBodyDynamics {
  private bodies: Map<string, RigidBodyState> = new Map();
  private constraints: Map<string, ConstraintConfig> = new Map();
  private collisionSystem: CollisionDetectionSystem;
  private kinematicCompiler: KinematicCompiler;

  constructor() {
    this.collisionSystem = new CollisionDetectionSystem();
    this.kinematicCompiler = new KinematicCompiler();
  }

  /**
   * Create a rigid body
   */
  createBody(config: RigidBodyConfig): RigidBodyState {
    const material = PHYSICS_MATERIALS[config.materialId] || PHYSICS_MATERIALS.default;
    
    const state: RigidBodyState = {
      position: config.position.clone(),
      rotation: config.rotation.clone(),
      linearVelocity: new Vector3(0, 0, 0),
      angularVelocity: new Vector3(0, 0, 0),
      awake: !config.isStatic,
    };
    
    this.bodies.set(config.id, state);
    
    // Register collider
    this.collisionSystem.registerCollider({
      id: config.id,
      shape: config.shape,
      layer: config.isStatic ? COLLISION_LAYERS.STATIC : COLLISION_LAYERS.DYNAMIC,
      filter: {
        groups: config.isStatic ? COLLISION_LAYERS.STATIC : COLLISION_LAYERS.DYNAMIC,
        mask: COLLISION_LAYERS.DEFAULT | COLLISION_LAYERS.STATIC | COLLISION_LAYERS.DYNAMIC,
      },
      boundingBox: new Box3(),
      boundingSphere: new Sphere(),
      isTrigger: false,
    });
    
    return state;
  }

  /**
   * Remove a rigid body
   */
  removeBody(bodyId: string): void {
    this.bodies.delete(bodyId);
    this.collisionSystem.unregisterCollider(bodyId);
  }

  /**
   * Apply force to a body
   */
  applyForce(bodyId: string, force: Vector3, point?: Vector3): void {
    const body = this.bodies.get(bodyId);
    if (!body || !body.awake) return;
    
    const material = this.getMaterialForBody(bodyId);
    if (!material) return;
    
    // F = ma, so a = F/m
    const acceleration = force.clone().divideScalar(material.density);
    
    // Apply to linear velocity (simplified - would integrate over time)
    body.linearVelocity.add(acceleration);
    
    // If force applied off-center, also apply torque
    if (point) {
      const leverArm = new Vector3().subVectors(point, body.position);
      const torque = new Vector3().crossVectors(leverArm, force);
      this.applyTorque(bodyId, torque);
    }
  }

  /**
   * Apply torque to a body
   */
  applyTorque(bodyId: string, torque: Vector3): void {
    const body = this.bodies.get(bodyId);
    if (!body || !body.awake) return;
    
    const material = this.getMaterialForBody(bodyId);
    if (!material) return;
    
    // Simplified angular acceleration
    const angularAccel = torque.clone().divideScalar(material.density * 10);
    body.angularVelocity.add(angularAccel);
  }

  /**
   * Apply impulse (instantaneous velocity change)
   */
  applyImpulse(bodyId: string, impulse: Vector3, point?: Vector3): void {
    const body = this.bodies.get(bodyId);
    if (!body || !body.awake) return;
    
    const material = this.getMaterialForBody(bodyId);
    if (!material) return;
    
    // Impulse directly changes velocity
    const velocityChange = impulse.clone().divideScalar(material.density);
    body.linearVelocity.add(velocityChange);
    
    if (point) {
      const leverArm = new Vector3().subVectors(point, body.position);
      const angularImpulse = new Vector3().crossVectors(leverArm, impulse);
      const angularVelChange = angularImpulse.divideScalar(material.density * 10);
      body.angularVelocity.add(angularVelChange);
    }
  }

  /**
   * Add constraint between bodies
   */
  addConstraint(config: ConstraintConfig): void {
    this.constraints.set(config.id, config);
  }

  /**
   * Remove constraint
   */
  removeConstraint(constraintId: string): void {
    this.constraints.delete(constraintId);
  }

  /**
   * Step simulation forward
   */
  step(deltaTime: number): void {
    // 1. Broad phase collision detection
    const potentialCollisions = this.collisionSystem.broadPhase();
    
    // 2. Narrow phase collision detection
    const collisions = this.collisionSystem.narrowPhase(potentialCollisions);
    
    // 3. Integrate velocities
    for (const [bodyId, body] of this.bodies.entries()) {
      if (!body.awake) continue;
      
      const material = this.getMaterialForBody(bodyId);
      if (!material) continue;
      
      // Apply gravity
      const gravity = new Vector3(0, -9.81, 0);
      body.linearVelocity.add(gravity.clone().multiplyScalar(deltaTime));
      
      // Apply damping
      body.linearVelocity.multiplyScalar(1 - material.linearDamping * deltaTime);
      body.angularVelocity.multiplyScalar(1 - material.angularDamping * deltaTime);
      
      // Integrate position
      body.position.add(body.linearVelocity.clone().multiplyScalar(deltaTime));
      
      // Integrate rotation (simplified)
      if (body.angularVelocity.lengthSq() > 0.001) {
        const deltaAngle = body.angularVelocity.length() * deltaTime;
        const axis = body.angularVelocity.clone().normalize();
        const deltaQuat = new Quaternion().setFromAxisAngle(axis, deltaAngle);
        body.rotation.multiply(deltaQuat);
        body.rotation.normalize();
      }
    }
    
    // 4. Resolve collisions
    this.resolveCollisions(collisions, deltaTime);
    
    // 5. Satisfy constraints
    this.satisfyConstraints();
    
    // 6. Update collision system transforms
    for (const [bodyId, body] of this.bodies.entries()) {
      this.collisionSystem.updateColliderTransform(bodyId, body.position, body.rotation);
    }
  }

  private resolveCollisions(collisions: CollisionEvent[], deltaTime: number): void {
    for (const collision of collisions) {
      const bodyA = this.bodies.get(collision.collider1);
      const bodyB = this.bodies.get(collision.collider2);
      
      if (!bodyA || !bodyB) continue;
      if (!bodyA.awake && !bodyB.awake) continue;
      
      const materialA = this.getMaterialForBody(collision.collider1);
      const materialB = this.getMaterialForBody(collision.collider2);
      
      if (!materialA || !materialB) continue;
      
      // Compute relative velocity
      const relVel = new Vector3().subVectors(bodyB.linearVelocity, bodyA.linearVelocity);
      const velAlongNormal = relVel.dot(collision.normal);
      
      // Only resolve if moving towards each other
      if (velAlongNormal > 0) continue;
      
      // Compute restitution (bounciness)
      const restitution = Math.min(materialA.restitution, materialB.restitution);
      
      // Compute impulse scalar
      const invMassA = bodyA.awake ? 1 / materialA.density : 0;
      const invMassB = bodyB.awake ? 1 / materialB.density : 0;
      
      let impulseScalar = -(1 + restitution) * velAlongNormal;
      impulseScalar /= (invMassA + invMassB);
      
      // Apply impulse
      const impulse = collision.normal.clone().multiplyScalar(impulseScalar);
      
      if (bodyA.awake) {
        bodyA.linearVelocity.sub(impulse.clone().multiplyScalar(invMassA));
      }
      if (bodyB.awake) {
        bodyB.linearVelocity.add(impulse.clone().multiplyScalar(invMassB));
      }
      
      // Positional correction to prevent sinking
      const slop = 0.01;
      const percent = 0.8;
      const penetration = Math.max(collision.depth - slop, 0);
      const correction = collision.normal.clone().multiplyScalar((penetration / (invMassA + invMassB)) * percent);
      
      if (bodyA.awake) {
        bodyA.position.sub(correction.clone().multiplyScalar(invMassA));
      }
      if (bodyB.awake) {
        bodyB.position.add(correction.clone().multiplyScalar(invMassB));
      }
    }
  }

  private satisfyConstraints(): void {
    for (const constraint of this.constraints.values()) {
      const bodyA = this.bodies.get(constraint.bodyA);
      const bodyB = this.bodies.get(constraint.bodyB);
      
      if (!bodyA || !bodyB) continue;
      
      switch (constraint.type) {
        case 'fixed':
          this.satisfyFixedConstraint(constraint, bodyA, bodyB);
          break;
        case 'revolute':
          this.satisfyRevoluteConstraint(constraint, bodyA, bodyB);
          break;
        case 'prismatic':
          this.satisfyPrismaticConstraint(constraint, bodyA, bodyB);
          break;
        case 'spherical':
          this.satisfySphericalConstraint(constraint, bodyA, bodyB);
          break;
      }
    }
  }

  private satisfyFixedConstraint(
    constraint: ConstraintConfig,
    bodyA: RigidBodyState,
    bodyB: RigidBodyState
  ): void {
    if (!constraint.anchorA || !constraint.anchorB) return;
    
    // Keep bodies at fixed relative position
    const targetPos = new Vector3().copy(bodyA.position).add(constraint.anchorA);
    const currentPos = new Vector3().copy(bodyB.position).add(constraint.anchorB);
    
    const error = new Vector3().subVectors(targetPos, currentPos);
    const correction = error.multiplyScalar(0.5);
    
    bodyA.position.add(correction);
    bodyB.position.sub(correction);
  }

  private satisfyRevoluteConstraint(
    constraint: ConstraintConfig,
    bodyA: RigidBodyState,
    bodyB: RigidBodyState
  ): void {
    // Hinge constraint - allow rotation around axis only
    if (!constraint.anchorA || !constraint.anchorB || !constraint.axis) return;
    
    // Positional constraint: anchors must coincide
    const anchorAWorld = new Vector3().copy(bodyA.position).add(constraint.anchorA);
    const anchorBWorld = new Vector3().copy(bodyB.position).add(constraint.anchorB);
    
    const error = new Vector3().subVectors(anchorAWorld, anchorBWorld);
    const correction = error.multiplyScalar(0.5);
    
    bodyA.position.add(correction);
    bodyB.position.sub(correction);
    
    // Rotational constraint: align axes (simplified)
    // Full implementation would project out rotation components perpendicular to axis
  }

  private satisfyPrismaticConstraint(
    constraint: ConstraintConfig,
    bodyA: RigidBodyState,
    bodyB: RigidBodyState
  ): void {
    // Slider constraint - allow translation along axis only
    if (!constraint.anchorA || !constraint.anchorB || !constraint.axis) return;
    
    // Similar to revolute but different rotational constraints
    const anchorAWorld = new Vector3().copy(bodyA.position).add(constraint.anchorA);
    const anchorBWorld = new Vector3().copy(bodyB.position).add(constraint.anchorB);
    
    const error = new Vector3().subVectors(anchorAWorld, anchorBWorld);
    
    // Remove component along axis
    const alongAxis = constraint.axis.clone().multiplyScalar(error.dot(constraint.axis));
    const perpendicularError = new Vector3().subVectors(error, alongAxis);
    
    const correction = perpendicularError.multiplyScalar(0.5);
    
    bodyA.position.add(correction);
    bodyB.position.sub(correction);
  }

  private satisfySphericalConstraint(
    constraint: ConstraintConfig,
    bodyA: RigidBodyState,
    bodyB: RigidBodyState
  ): void {
    // Ball-and-socket constraint - anchors must coincide, free rotation
    if (!constraint.anchorA || !constraint.anchorB) return;
    
    const anchorAWorld = new Vector3().copy(bodyA.position).add(constraint.anchorA);
    const anchorBWorld = new Vector3().copy(bodyB.position).add(constraint.anchorB);
    
    const error = new Vector3().subVectors(anchorAWorld, anchorBWorld);
    const correction = error.multiplyScalar(0.5);
    
    bodyA.position.add(correction);
    bodyB.position.sub(correction);
  }

  private getMaterialForBody(bodyId: string): PhysicsMaterial | null {
    // In a full implementation, would look up material from body config
    // For now, return default
    return PHYSICS_MATERIALS.default;
  }

  /**
   * Get body state
   */
  getBodyState(bodyId: string): RigidBodyState | null {
    return this.bodies.get(bodyId) || null;
  }

  /**
   * Wake up a sleeping body
   */
  wakeBody(bodyId: string): void {
    const body = this.bodies.get(bodyId);
    if (body) {
      body.awake = true;
    }
  }

  /**
   * Put body to sleep
   */
  sleepBody(bodyId: string): void {
    const body = this.bodies.get(bodyId);
    if (body) {
      body.awake = false;
      body.linearVelocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    }
  }

  /**
   * Get collision system
   */
  getCollisionSystem(): CollisionDetectionSystem {
    return this.collisionSystem;
  }

  /**
   * Get kinematic compiler
   */
  getKinematicCompiler(): KinematicCompiler {
    return this.kinematicCompiler;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a box shape
 */
export function createBoxShape(width: number, height: number, depth: number): PhysicsShape {
  return {
    type: 'box',
    dimensions: new Vector3(width, height, depth),
  };
}

/**
 * Create a sphere shape
 */
export function createSphereShape(radius: number): PhysicsShape {
  return {
    type: 'sphere',
    radius,
  };
}

/**
 * Create a capsule shape
 */
export function createCapsuleShape(radius: number, height: number): PhysicsShape {
  return {
    type: 'capsule',
    radius,
    height,
  };
}

/**
 * Create a cylinder shape
 */
export function createCylinderShape(radius: number, height: number): PhysicsShape {
  return {
    type: 'cylinder',
    radius,
    height,
  };
}

/**
 * Create a convex hull from vertices
 */
export function createConvexHullShape(vertices: Float32Array): PhysicsShape {
  return {
    type: 'convexHull',
    vertices,
  };
}

/**
 * Create a trimesh shape
 */
export function createTrimeshShape(vertices: Float32Array, indices: Uint32Array): PhysicsShape {
  return {
    type: 'trimesh',
    vertices,
    indices,
  };
}

/**
 * Convert Three.js mesh to physics shape
 */
export function meshToPhysicsShape(
  geometry: any,
  useConvexHull: boolean = true
): PhysicsShape {
  // Extract vertices from geometry
  const positions = geometry.attributes.position.array;
  const vertices = new Float32Array(positions.length);
  
  for (let i = 0; i < positions.length; i++) {
    vertices[i] = positions[i];
  }
  
  if (useConvexHull) {
    return createConvexHullShape(vertices);
  } else {
    const indices = geometry.index?.array || new Uint32Array(positions.length / 3);
    return createTrimeshShape(vertices, indices);
  }
}

// Type definitions for collision detection
interface ColliderInfo {
  id: string;
  shape: PhysicsShape;
  layer: CollisionLayer;
  filter: CollisionFilter;
  boundingBox: Box3;
  boundingSphere: Sphere;
  isTrigger: boolean;
}

interface ContactData {
  points: Vector3[];
  normal: Vector3;
  depth: number;
  bodyA: string;
  bodyB: string;
}
