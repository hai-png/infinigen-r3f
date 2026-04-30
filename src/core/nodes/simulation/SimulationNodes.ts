/**
 * Simulation Nodes Module
 * Rigid body, soft body, particle, and fluid simulation nodes
 * Ported from Blender Geometry Nodes and Infinigen physics system
 */

import { Vector3, Quaternion } from 'three';
import type { NodeBase, AttributeDomain } from '../core/types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SimulationNodeBase extends NodeBase {
  category: 'simulation';
}

// ============================================================================
// Rigid Body Simulation Nodes
// ============================================================================

// ----------------------------------------------------------------------------
// Rigid Body World Node
// ----------------------------------------------------------------------------

export interface RigidBodyWorldInputs {
  gravity?: number[];
  substeps?: number;
  solverIterations?: number;
}

export interface RigidBodyWorldOutputs {
  world: any;
  gravity: Vector3;
  substeps: number;
}

export class RigidBodyWorldNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'rigid_body_world';
  readonly inputs: RigidBodyWorldInputs;
  readonly outputs: RigidBodyWorldOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: RigidBodyWorldInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      world: null,
      gravity: new Vector3(0, -9.81, 0),
      substeps: inputs.substeps ?? 60,
    };
  }

  execute(): RigidBodyWorldOutputs {
    const gravity = this.inputs.gravity || [0, -9.81, 0];
    this.outputs.gravity.set(gravity[0], gravity[1], gravity[2]);
    this.outputs.substeps = this.inputs.substeps ?? 60;
    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Rigid Body Constraints Node
// ----------------------------------------------------------------------------

export interface RigidBodyConstraintsInputs {
  constraintType?: 'fixed' | 'hinge' | 'slider' | 'cone_twist' | 'generic';
  pivotA?: number[];
  pivotB?: number[];
  axisA?: number[];
  axisB?: number[];
  limitLower?: number[];
  limitUpper?: number[];
}

export interface RigidBodyConstraintsOutputs {
  constraint: any;
  type: string;
  pivotA: Vector3;
  pivotB: Vector3;
}

export class RigidBodyConstraintsNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'rigid_body_constraints';
  readonly inputs: RigidBodyConstraintsInputs;
  readonly outputs: RigidBodyConstraintsOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: RigidBodyConstraintsInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      constraint: null,
      type: inputs.constraintType ?? 'fixed',
      pivotA: new Vector3(),
      pivotB: new Vector3(),
    };
  }

  execute(): RigidBodyConstraintsOutputs {
    const pivotA = this.inputs.pivotA || [0, 0, 0];
    const pivotB = this.inputs.pivotB || [0, 0, 0];
    
    this.outputs.pivotA.set(pivotA[0], pivotA[1], pivotA[2]);
    this.outputs.pivotB.set(pivotB[0], pivotB[1], pivotB[2]);
    this.outputs.type = this.inputs.constraintType ?? 'fixed';
    
    return this.outputs;
  }
}

// ============================================================================
// Soft Body Simulation Nodes
// ============================================================================

// ----------------------------------------------------------------------------
// Soft Body Setup Node
// ----------------------------------------------------------------------------

export interface SoftBodySetupInputs {
  mass?: number;
  stiffness?: number;
  damping?: number;
  pressure?: number;
  collisionMargin?: number;
}

export interface SoftBodySetupOutputs {
  mass: number;
  stiffness: number;
  damping: number;
  pressure: number;
}

export class SoftBodySetupNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'soft_body_setup';
  readonly inputs: SoftBodySetupInputs;
  readonly outputs: SoftBodySetupOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: SoftBodySetupInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      mass: inputs.mass ?? 1.0,
      stiffness: inputs.stiffness ?? 0.5,
      damping: inputs.damping ?? 0.1,
      pressure: inputs.pressure ?? 0.0,
    };
  }

  execute(): SoftBodySetupOutputs {
    this.outputs.mass = this.inputs.mass ?? 1.0;
    this.outputs.stiffness = this.inputs.stiffness ?? 0.5;
    this.outputs.damping = this.inputs.damping ?? 0.1;
    this.outputs.pressure = this.inputs.pressure ?? 0.0;
    return this.outputs;
  }
}

// ============================================================================
// Particle System Nodes
// ============================================================================

// ----------------------------------------------------------------------------
// Particle System Node
// ----------------------------------------------------------------------------

export interface ParticleSystemInputs {
  count?: number;
  lifetime?: number;
  emitFrom?: 'vertex' | 'face' | 'volume';
  velocity?: number[];
  randomVelocity?: number;
  damping?: number;
  gravity?: number[];
}

export interface ParticleSystemOutputs {
  particles: any[];
  count: number;
  positions: number[][];
  velocities: number[][];
}

export class ParticleSystemNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'particle_system';
  readonly inputs: ParticleSystemInputs;
  readonly outputs: ParticleSystemOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: ParticleSystemInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      particles: [],
      count: inputs.count ?? 1000,
      positions: [],
      velocities: [],
    };
  }

  execute(): ParticleSystemOutputs {
    const count = this.inputs.count ?? 1000;
    const lifetime = this.inputs.lifetime ?? 10;
    const velocity = this.inputs.velocity || [0, 0, 0];
    const randomVel = this.inputs.randomVelocity ?? 0.1;
    
    const positions: number[][] = [];
    const velocities: number[][] = [];
    
    for (let i = 0; i < count; i++) {
      positions.push([
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ]);
      
      velocities.push([
        velocity[0] + (Math.random() - 0.5) * randomVel,
        velocity[1] + (Math.random() - 0.5) * randomVel,
        velocity[2] + (Math.random() - 0.5) * randomVel
      ]);
    }
    
    this.outputs.positions = positions;
    this.outputs.velocities = velocities;
    this.outputs.count = count;
    
    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Particle Collision Node
// ----------------------------------------------------------------------------

export interface ParticleCollisionInputs {
  collider?: any;
  bounce?: number;
  friction?: number;
  stickiness?: number;
}

export interface ParticleCollisionOutputs {
  bounce: number;
  friction: number;
  stickiness: number;
}

export class ParticleCollisionNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'particle_collision';
  readonly inputs: ParticleCollisionInputs;
  readonly outputs: ParticleCollisionOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: ParticleCollisionInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      bounce: inputs.bounce ?? 0.5,
      friction: inputs.friction ?? 0.1,
      stickiness: inputs.stickiness ?? 0.0,
    };
  }

  execute(): ParticleCollisionOutputs {
    this.outputs.bounce = this.inputs.bounce ?? 0.5;
    this.outputs.friction = this.inputs.friction ?? 0.1;
    this.outputs.stickiness = this.inputs.stickiness ?? 0.0;
    return this.outputs;
  }
}

// ============================================================================
// Fluid Simulation Nodes
// ============================================================================

// ----------------------------------------------------------------------------
// Fluid Domain Node
// ----------------------------------------------------------------------------

export interface FluidDomainInputs {
  resolution?: number;
  viscosity?: number;
  surfaceTension?: number;
  gridScale?: number;
}

export interface FluidDomainOutputs {
  resolution: number;
  viscosity: number;
  surfaceTension: number;
  gridSize: number[];
}

export class FluidDomainNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'fluid_domain';
  readonly inputs: FluidDomainInputs;
  readonly outputs: FluidDomainOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: FluidDomainInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      resolution: inputs.resolution ?? 32,
      viscosity: inputs.viscosity ?? 0.01,
      surfaceTension: inputs.surfaceTension ?? 0.0,
      gridSize: [1, 1, 1],
    };
  }

  execute(): FluidDomainOutputs {
    const resolution = this.inputs.resolution ?? 32;
    this.outputs.resolution = resolution;
    this.outputs.viscosity = this.inputs.viscosity ?? 0.01;
    this.outputs.surfaceTension = this.inputs.surfaceTension ?? 0.0;
    this.outputs.gridSize = [resolution, resolution, resolution];
    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Fluid Flow Node
// ----------------------------------------------------------------------------

export interface FluidFlowInputs {
  flowType?: 'inflow' | 'outflow' | 'geometry';
  velocity?: number[];
  sourceVolume?: number;
}

export interface FluidFlowOutputs {
  flowType: string;
  velocity: Vector3;
  sourceVolume: number;
}

export class FluidFlowNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'fluid_flow';
  readonly inputs: FluidFlowInputs;
  readonly outputs: FluidFlowOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: FluidFlowInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      flowType: inputs.flowType ?? 'inflow',
      velocity: new Vector3(),
      sourceVolume: inputs.sourceVolume ?? 1.0,
    };
  }

  execute(): FluidFlowOutputs {
    const velocity = this.inputs.velocity || [0, 0, 0];
    this.outputs.velocity.set(velocity[0], velocity[1], velocity[2]);
    this.outputs.flowType = this.inputs.flowType ?? 'inflow';
    this.outputs.sourceVolume = this.inputs.sourceVolume ?? 1.0;
    return this.outputs;
  }
}

// ============================================================================
// Cloth Simulation Nodes
// ============================================================================

// ----------------------------------------------------------------------------
// Cloth Setup Node
// ----------------------------------------------------------------------------

export interface ClothSetupInputs {
  mass?: number;
  structuralStiffness?: number;
  bendingStiffness?: number;
  damping?: number;
  pressure?: number;
}

export interface ClothSetupOutputs {
  mass: number;
  structuralStiffness: number;
  bendingStiffness: number;
  damping: number;
  pressure: number;
}

export class ClothSetupNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'cloth_setup';
  readonly inputs: ClothSetupInputs;
  readonly outputs: ClothSetupOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: ClothSetupInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      mass: inputs.mass ?? 0.5,
      structuralStiffness: inputs.structuralStiffness ?? 10.0,
      bendingStiffness: inputs.bendingStiffness ?? 0.5,
      damping: inputs.damping ?? 0.01,
      pressure: inputs.pressure ?? 0.0,
    };
  }

  execute(): ClothSetupOutputs {
    this.outputs.mass = this.inputs.mass ?? 0.5;
    this.outputs.structuralStiffness = this.inputs.structuralStiffness ?? 10.0;
    this.outputs.bendingStiffness = this.inputs.bendingStiffness ?? 0.5;
    this.outputs.damping = this.inputs.damping ?? 0.01;
    this.outputs.pressure = this.inputs.pressure ?? 0.0;
    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Cloth Pin Group Node
// ----------------------------------------------------------------------------

export interface ClothPinGroupInputs {
  vertexGroup?: number[];
  pinStrength?: number;
}

export interface ClothPinGroupOutputs {
  pinnedVertices: number[];
  pinStrength: number;
}

export class ClothPinGroupNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'cloth_pin_group';
  readonly inputs: ClothPinGroupInputs;
  readonly outputs: ClothPinGroupOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: ClothPinGroupInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      pinnedVertices: [],
      pinStrength: inputs.pinStrength ?? 1.0,
    };
  }

  execute(): ClothPinGroupOutputs {
    this.outputs.pinnedVertices = this.inputs.vertexGroup || [];
    this.outputs.pinStrength = this.inputs.pinStrength ?? 1.0;
    return this.outputs;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createRigidBodyWorldNode(inputs?: RigidBodyWorldInputs): RigidBodyWorldNode {
  return new RigidBodyWorldNode(inputs);
}

export function createRigidBodyConstraintsNode(inputs?: RigidBodyConstraintsInputs): RigidBodyConstraintsNode {
  return new RigidBodyConstraintsNode(inputs);
}

export function createSoftBodySetupNode(inputs?: SoftBodySetupInputs): SoftBodySetupNode {
  return new SoftBodySetupNode(inputs);
}

export function createParticleSystemNode(inputs?: ParticleSystemInputs): ParticleSystemNode {
  return new ParticleSystemNode(inputs);
}

export function createParticleCollisionNode(inputs?: ParticleCollisionInputs): ParticleCollisionNode {
  return new ParticleCollisionNode(inputs);
}

export function createFluidDomainNode(inputs?: FluidDomainInputs): FluidDomainNode {
  return new FluidDomainNode(inputs);
}

export function createFluidFlowNode(inputs?: FluidFlowInputs): FluidFlowNode {
  return new FluidFlowNode(inputs);
}

export function createClothSetupNode(inputs?: ClothSetupInputs): ClothSetupNode {
  return new ClothSetupNode(inputs);
}

export function createClothPinGroupNode(inputs?: ClothPinGroupInputs): ClothPinGroupNode {
  return new ClothPinGroupNode(inputs);
}


