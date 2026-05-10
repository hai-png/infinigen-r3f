/**
 * Simulation Nodes Module Export
 * Rigid body, soft body, particle, and fluid simulation nodes
 * Plus simulation zone and repeat zone nodes (Blender 3.x style)
 */

export {
  // Node Classes
  RigidBodyWorldNode,
  RigidBodyConstraintsNode,
  SoftBodySetupNode,
  ParticleSystemNode,
  ParticleCollisionNode,
  FluidDomainNode,
  FluidFlowNode,
  ClothSetupNode,
  ClothPinGroupNode,

  // Zone Nodes
  SimulationZoneNode,
  RepeatZoneNode,
  SimulationInputNode,
  SimulationOutputNode,
  RepeatInputNode,
  RepeatOutputNode,

  // Type Definitions
  type SimulationNodeBase,
  type RigidBodyWorldInputs,
  type RigidBodyWorldOutputs,
  type RigidBodyConstraintsInputs,
  type RigidBodyConstraintsOutputs,
  type SoftBodySetupInputs,
  type SoftBodySetupOutputs,
  type ParticleSystemInputs,
  type ParticleSystemOutputs,
  type ParticleCollisionInputs,
  type ParticleCollisionOutputs,
  type FluidDomainInputs,
  type FluidDomainOutputs,
  type FluidFlowInputs,
  type FluidFlowOutputs,
  type ClothSetupInputs,
  type ClothSetupOutputs,
  type ClothPinGroupInputs,
  type ClothPinGroupOutputs,

  // Zone Type Definitions
  type SimulationState,
  type SimulationStepContext,
  type SimulationZoneInputs,
  type SimulationZoneOutputs,
  type RepeatZoneInputs,
  type RepeatZoneOutputs,
  type SimulationInputInputs,
  type SimulationInputOutputs,
  type SimulationOutputInputs,
  type SimulationOutputOutputs,
  type RepeatInputInputs,
  type RepeatInputOutputs,
  type RepeatOutputInputs,
  type RepeatOutputOutputs,

  // Factory Functions
  createRigidBodyWorldNode,
  createRigidBodyConstraintsNode,
  createSoftBodySetupNode,
  createParticleSystemNode,
  createParticleCollisionNode,
  createFluidDomainNode,
  createFluidFlowNode,
  createClothSetupNode,
  createClothPinGroupNode,
  createSimulationZoneNode,
  createRepeatZoneNode,
  createSimulationInputNode,
  createSimulationOutputNode,
  createRepeatInputNode,
  createRepeatOutputNode,
} from './SimulationNodes';
