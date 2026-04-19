/**
 * Physics Simulation Module Exports
 */

export {
  // Main physics engine
  RigidBodyDynamics,
  
  // Kinematic compiler
  KinematicCompiler,
  
  // Collision detection
  CollisionDetectionSystem,
  
  // Types
  type PhysicsShapeType,
  type PhysicsShape,
  type PhysicsMaterial,
  type RigidBodyConfig,
  type CollisionEvent,
  type ConstraintConfig,
  type KinematicJoint,
  type KinematicLink,
  type KinematicChain,
  type CompiledKinematicChain,
  type RigidBodyState,
  type CollisionLayer,
  type CollisionFilter,
  
  // Constants
  PHYSICS_MATERIALS,
  COLLISION_LAYERS,
  
  // Utility functions
  createBoxShape,
  createSphereShape,
  createCapsuleShape,
  createCylinderShape,
  createConvexHullShape,
  createTrimeshShape,
  meshToPhysicsShape,
} from './RigidBodyDynamics';
