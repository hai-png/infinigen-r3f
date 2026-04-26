/**
 * Physics Simulation Module for Infinigen R3F
 *
 * Provides complete rigid body dynamics, collision detection,
 * and physics material definitions integrated with @react-three/rapier.
 */
import { Vector3, Quaternion, Matrix4, Box3, Sphere } from 'three';
export type PhysicsShapeType = 'box' | 'sphere' | 'capsule' | 'cylinder' | 'convexHull' | 'trimesh' | 'heightfield';
export interface PhysicsShape {
    type: PhysicsShapeType;
    dimensions?: Vector3;
    radius?: number;
    height?: number;
    vertices?: Float32Array;
    indices?: Uint32Array;
    heights?: Float32Array;
    size?: Vector3;
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
    ccdEnabled: boolean;
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
    limits?: {
        min: number;
        max: number;
    };
    motor?: {
        velocity: number;
        force: number;
    };
}
export declare const PHYSICS_MATERIALS: Record<string, PhysicsMaterial>;
export interface KinematicJoint {
    id: string;
    type: 'revolute' | 'prismatic' | 'spherical' | 'fixed';
    parentLink: string;
    childLink: string;
    origin: Vector3;
    axis?: Vector3;
    limits?: {
        lower: number;
        upper: number;
        effort: number;
        velocity: number;
    };
    mimic?: {
        joint: string;
        multiplier: number;
        offset: number;
    };
}
export interface KinematicLink {
    id: string;
    name: string;
    inertia: {
        ixx: number;
        ixy: number;
        ixz: number;
        iyy: number;
        iyz: number;
        izz: number;
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
export declare class KinematicCompiler {
    private chains;
    private compiledChains;
    /**
     * Register a kinematic chain
     */
    registerChain(chain: KinematicChain): void;
    /**
     * Compile a kinematic chain for runtime optimization
     */
    compileChain(chainId: string): CompiledKinematicChain;
    private computeForwardKinematicsCache;
    private computeJacobianCache;
    private jointToMatrix;
    private countDegreesOfFreedom;
    getCompiledChain(chainId: string): CompiledKinematicChain | null;
    /**
     * Update joint positions and recompute forward kinematics
     */
    updateJointPositions(chainId: string, jointPositions: Map<string, number>): Matrix4[];
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
export type CollisionLayer = number;
export declare const COLLISION_LAYERS: {
    DEFAULT: number;
    STATIC: number;
    DYNAMIC: number;
    TRIGGER: number;
    CHARACTER: number;
    VEHICLE: number;
    PROJECTILE: number;
    SENSOR: number;
};
export interface CollisionFilter {
    groups: CollisionLayer;
    mask: CollisionLayer;
}
export declare class CollisionDetectionSystem {
    private colliders;
    private collisionPairs;
    private contactCache;
    /**
     * Register a collider
     */
    registerCollider(collider: ColliderInfo): void;
    /**
     * Unregister a collider
     */
    unregisterCollider(colliderId: string): void;
    /**
     * Update collider transform
     */
    updateColliderTransform(colliderId: string, position: Vector3, rotation: Quaternion): void;
    private updateBoundingVolumes;
    private computeBoundingBox;
    private computeBoundingSphere;
    /**
     * Broad phase collision detection using sweep and prune
     */
    broadPhase(): string[][];
    private testCollisionFilter;
    private testBoxOverlap;
    /**
     * Narrow phase collision detection
     */
    narrowPhase(pairs: string[][]): CollisionEvent[];
    private detectContact;
    private sphereContacts;
    private boxContacts;
    private genericContacts;
    /**
     * Get cached contact data
     */
    getContactData(colliderA: string, colliderB: string): ContactData | null;
    /**
     * Clear all collision data
     */
    clear(): void;
}
export interface RigidBodyState {
    position: Vector3;
    rotation: Quaternion;
    linearVelocity: Vector3;
    angularVelocity: Vector3;
    awake: boolean;
}
export declare class RigidBodyDynamics {
    private bodies;
    private constraints;
    private collisionSystem;
    private kinematicCompiler;
    constructor();
    /**
     * Create a rigid body
     */
    createBody(config: RigidBodyConfig): RigidBodyState;
    /**
     * Remove a rigid body
     */
    removeBody(bodyId: string): void;
    /**
     * Apply force to a body
     */
    applyForce(bodyId: string, force: Vector3, point?: Vector3): void;
    /**
     * Apply torque to a body
     */
    applyTorque(bodyId: string, torque: Vector3): void;
    /**
     * Apply impulse (instantaneous velocity change)
     */
    applyImpulse(bodyId: string, impulse: Vector3, point?: Vector3): void;
    /**
     * Add constraint between bodies
     */
    addConstraint(config: ConstraintConfig): void;
    /**
     * Remove constraint
     */
    removeConstraint(constraintId: string): void;
    /**
     * Step simulation forward
     */
    step(deltaTime: number): void;
    private resolveCollisions;
    private satisfyConstraints;
    private satisfyFixedConstraint;
    private satisfyRevoluteConstraint;
    private satisfyPrismaticConstraint;
    private satisfySphericalConstraint;
    private getMaterialForBody;
    /**
     * Get body state
     */
    getBodyState(bodyId: string): RigidBodyState | null;
    /**
     * Wake up a sleeping body
     */
    wakeBody(bodyId: string): void;
    /**
     * Put body to sleep
     */
    sleepBody(bodyId: string): void;
    /**
     * Get collision system
     */
    getCollisionSystem(): CollisionDetectionSystem;
    /**
     * Get kinematic compiler
     */
    getKinematicCompiler(): KinematicCompiler;
}
/**
 * Create a box shape
 */
export declare function createBoxShape(width: number, height: number, depth: number): PhysicsShape;
/**
 * Create a sphere shape
 */
export declare function createSphereShape(radius: number): PhysicsShape;
/**
 * Create a capsule shape
 */
export declare function createCapsuleShape(radius: number, height: number): PhysicsShape;
/**
 * Create a cylinder shape
 */
export declare function createCylinderShape(radius: number, height: number): PhysicsShape;
/**
 * Create a convex hull from vertices
 */
export declare function createConvexHullShape(vertices: Float32Array): PhysicsShape;
/**
 * Create a trimesh shape
 */
export declare function createTrimeshShape(vertices: Float32Array, indices: Uint32Array): PhysicsShape;
/**
 * Convert Three.js mesh to physics shape
 */
export declare function meshToPhysicsShape(geometry: any, useConvexHull?: boolean): PhysicsShape;
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
export {};
//# sourceMappingURL=RigidBodyDynamics.d.ts.map