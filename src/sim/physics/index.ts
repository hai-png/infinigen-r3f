/**
 * Physics Simulation Module Exports
 */

// Core physics world
export { PhysicsWorld } from './PhysicsWorld';
export type { PhysicsWorldConfig, CollisionEvent } from './PhysicsWorld';

// Rigid body
export { RigidBody } from './RigidBody';
export type { RigidBodyConfig, BodyType } from './RigidBody';

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

// Rigid body dynamics (existing advanced module)
export {
  RigidBodyDynamics,
  KinematicCompiler,
  CollisionDetectionSystem,
  type PhysicsShapeType,
  type PhysicsShape,
  type CollisionLayer,
  COLLISION_LAYERS,
  createBoxShape,
  createSphereShape,
  createCapsuleShape,
  createCylinderShape,
  createConvexHullShape,
  createTrimeshShape,
  meshToPhysicsShape,
} from './RigidBodyDynamics';
