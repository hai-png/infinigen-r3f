/**
 * Simulation System
 *
 * Physics simulation and export capabilities:
 * - SimFactory: Simulation factory (bridge between KinematicCompiler and PhysicsWorld)
 * - SimFactory types: SimRigidBody, SimJoint, ArticulatedObjectResult, etc.
 * - Exporters: Data exporters for various formats
 * - FLIP Fluid: Hybrid Eulerian-Lagrangian fluid solver for rivers/water
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

// FLIP Fluid solver
export { FLIPFluidSolver, FLIPGrid } from './fluid/FLIPFluidSolver';
export type { FLIPParticle, FLIPConfig } from './fluid/FLIPFluidSolver';

export { FLIPSurfaceExtractor } from './fluid/FLIPSurfaceExtractor';
export type { FLIPSurfaceExtractorConfig } from './fluid/FLIPSurfaceExtractor';

export { FLIPFluidRenderer } from './fluid/FLIPFluidRenderer';
export type { FLIPFluidRendererConfig, FLIPRenderMode } from './fluid/FLIPFluidRenderer';

// Cloth simulation
export { ClothSimulation } from './cloth/ClothSimulation';
export type { ClothConfig, ClothParticle, ClothConstraint } from './cloth/ClothSimulation';
export { VerletClothSimulation } from './cloth/VerletCloth';
export type {
  VerletClothConfig,
  VerletParticle,
  VerletConstraint,
  PinConstraint,
} from './cloth/VerletCloth';
export { ClothCreatureBridge } from './cloth/ClothCreatureBridge';
export type {
  ClothGarmentConfig,
  BonePinBinding,
  ClothMeshCollisionConfig,
} from './cloth/ClothCreatureBridge';
