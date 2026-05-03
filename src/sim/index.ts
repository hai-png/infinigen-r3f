/**
 * Simulation System
 *
 * Physics simulation and export capabilities:
 * - SimFactory: Simulation factory (bridge between KinematicCompiler and PhysicsWorld)
 * - SimFactory types: SimRigidBody, SimJoint, ArticulatedObjectResult, etc.
 * - Exporters: Data exporters for various formats
 */

// SimFactory class
export { SimFactory } from './SimFactory';

// SimFactory public types
export type {
  SimRigidBody,
  SimJoint,
  ShapeSpec,
  SimJointType,
  SimRigidBodyConfig,
  SimJointConfig,
  SimArticulatedObjectResult,
} from './SimFactory';

// Physics exporters
export { PhysicsExporterFactory as physicsExporters } from './physics-exporters';
