/**
 * Physics Simulation Module Exports
 *
 * Consolidated barrel exports for the physics system.
 *
 * Primary physics engine: PhysicsWorld + collision pipeline
 * Kinematic compilation: KinematicCompiler
 * Shape utilities: meshToPhysicsShape, createXxxShape (from PhysicsWorld)
 * Inertia tensor: boxInertiaTensor, sphereInertiaTensor, etc. (from RigidBody)
 * GJK/EPA: GJK + EPA collision detection (from collision/GJK)
 * CCD: Continuous Collision Detection (from CCD)
 * Contact generation: Multi-contact manifolds (from collision/ContactGeneration)
 */

// Core physics world (includes shape utilities: meshToPhysicsShape, createXxxShape, PhysicsShape, PhysicsShapeType)
export { PhysicsWorld } from './PhysicsWorld';
export type { PhysicsWorldConfig, CollisionEvent } from './PhysicsWorld';
export {
  meshToPhysicsShape,
  createBoxShape,
  createSphereShape,
  createCapsuleShape,
  createCylinderShape,
  createConvexHullShape,
  createTrimeshShape,
} from './PhysicsWorld';
export type { PhysicsShapeType, PhysicsShape } from './PhysicsWorld';

// Rigid body + inertia tensor helpers
export { RigidBody } from './RigidBody';
export type { RigidBodyConfig, BodyType } from './RigidBody';
export {
  boxInertiaTensor,
  sphereInertiaTensor,
  cylinderInertiaTensor,
  capsuleInertiaTensor,
  diagonalInertiaTensor,
  invertMatrix3,
  mulMatrix3Vector3,
  mulMatrix3TransposeVector3,
  rotateInertiaTensor,
} from './RigidBody';

// Colliders
export { Collider } from './Collider';
export type { ColliderConfig, ColliderShape } from './Collider';

// Joints
export { Joint } from './Joint';
export type { JointConfig, JointType } from './Joint';

// Materials
export { defaultMaterial, materialPresets, combineFriction, combineRestitution } from './Material';
export type { PhysicsMaterial } from './Material';

// Collision pipeline
export { BroadPhase } from './collision/BroadPhase';
export { NarrowPhase } from './collision/NarrowPhase';
export { CollisionFilter } from './collision/CollisionFilter';
export { generateContacts } from './collision/ContactGeneration';
export type { BroadPhasePair } from './collision/BroadPhase';
export type { CollisionPair, ContactPoint } from './collision/NarrowPhase';

// GJK/EPA
export {
  gjkIntersect,
  epaPenetration,
  minkowskiSupport,
  detectCollisionGJK,
  getSupportFunction,
  boxSupport,
  sphereSupport,
  cylinderSupport,
  capsuleSupport,
} from './collision/GJK';
export type { SupportFunction, GJKResult, EPAResult } from './collision/GJK';

// Multi-contact manifolds
export {
  ContactManifold,
  ContactManifoldCache,
  generateBoxBoxContacts,
  generateSphereBoxContacts,
  generateGJKContacts,
} from './collision/ContactGeneration';

// Continuous Collision Detection
export { ContinuousCollisionDetector } from './CCD';
export type { CCDEvent } from './CCD';

// Kinematic compiler and collision layers (unique to RigidBodyDynamics.ts)
export {
  KinematicCompiler,
  COLLISION_LAYERS,
} from './RigidBodyDynamics';
export type {
  KinematicJoint,
  KinematicLink,
  KinematicChain,
  CompiledKinematicChain,
  CollisionLayer,
} from './RigidBodyDynamics';

// Quickhull convex hull algorithm
export {
  computeConvexHull,
  convexHullSupport,
  createConvexHullSupportFn,
  computeConvexHullFromGeometry,
  computeConvexHullFromFloat32Array,
} from './collision/Quickhull';
export type { HullFace, HullEdge, QuickhullResult } from './collision/Quickhull';

// BVH-accelerated triangle mesh collider
export { TrimeshCollider } from './collision/TrimeshCollider';
export type { TrimeshCollisionResult, TrimeshRayResult } from './collision/TrimeshCollider';

// Re-export shape types from PhysicsWorld for backward compatibility
// (consumers that imported these from RigidBodyDynamics will still get them)
export type { PhysicsShapeType as RigidBodyDynamicsShapeType } from './PhysicsWorld';
