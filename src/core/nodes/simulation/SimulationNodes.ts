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
// Simulation Configuration Types
// ============================================================================

export interface SoftBodyConfig {
  mass: number;
  stiffness: number;
  damping: number;
  pressure: number;
  collisionMargin: number;
  /** Spring constant for internal springs */
  springStiffness: number;
  /** Number of solver iterations per substep */
  solverIterations: number;
}

export interface ParticleCollisionConfig {
  bounce: number;
  friction: number;
  stickiness: number;
  /** Collision margin distance */
  margin: number;
  /** Maximum collision impulses per step */
  maxCollisions: number;
  /** Whether to kill particles on collision */
  killOnCollision: boolean;
}

export interface FluidFlowConfig {
  flowType: 'inflow' | 'outflow' | 'geometry';
  velocity: Vector3;
  sourceVolume: number;
  /** Emission density (particles per unit volume per second) */
  density: number;
  /** Temperature of emitted fluid */
  temperature: number;
  /** Fuel value for fire simulation */
  fuel: number;
}

export interface ClothConfig {
  mass: number;
  structuralStiffness: number;
  bendingStiffness: number;
  damping: number;
  pressure: number;
  /** Shear stiffness for diagonal springs */
  shearStiffness: number;
  /** Air drag coefficient */
  airDrag: number;
  /** Pin stiffness for pinned vertices */
  pinStiffness: number;
  /** Self-collision distance */
  selfCollisionDistance: number;
}

export interface ClothPinGroupConfig {
  pinnedVertices: number[];
  pinStrength: number;
  /** Whether pinned vertices are completely fixed (strength=1) or partially */
  isAbsolute: boolean;
  /** Target position offset for pinned vertices */
  targetOffset: Vector3;
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
  readonly name = 'Rigid Body World';
  readonly inputs: RigidBodyWorldInputs;
  readonly outputs: RigidBodyWorldOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

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
    this.outputs.world = {
      gravity: this.outputs.gravity.clone(),
      substeps: this.outputs.substeps,
      solverIterations: this.inputs.solverIterations ?? 10,
    };
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
  readonly name = 'Rigid Body Constraints';
  readonly inputs: RigidBodyConstraintsInputs;
  readonly outputs: RigidBodyConstraintsOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

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
    const axisA = this.inputs.axisA || [0, 0, 1];
    const axisB = this.inputs.axisB || [0, 0, 1];
    
    this.outputs.pivotA.set(pivotA[0], pivotA[1], pivotA[2]);
    this.outputs.pivotB.set(pivotB[0], pivotB[1], pivotB[2]);
    this.outputs.type = this.inputs.constraintType ?? 'fixed';

    this.outputs.constraint = {
      type: this.outputs.type,
      pivotA: this.outputs.pivotA.clone(),
      pivotB: this.outputs.pivotB.clone(),
      axisA: new Vector3(axisA[0], axisA[1], axisA[2]).normalize(),
      axisB: new Vector3(axisB[0], axisB[1], axisB[2]).normalize(),
      limitLower: this.inputs.limitLower || [0, 0, 0],
      limitUpper: this.inputs.limitUpper || [0, 0, 0],
    };

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
  config: SoftBodyConfig;
  mass: number;
  stiffness: number;
  damping: number;
  pressure: number;
}

export class SoftBodySetupNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'soft_body_setup';
  readonly name = 'Soft Body Setup';
  readonly inputs: SoftBodySetupInputs;
  readonly outputs: SoftBodySetupOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: SoftBodySetupInputs = {}) {
    this.inputs = inputs;
    const mass = inputs.mass ?? 1.0;
    const stiffness = inputs.stiffness ?? 0.5;
    const damping = inputs.damping ?? 0.1;
    const pressure = inputs.pressure ?? 0.0;
    const collisionMargin = inputs.collisionMargin ?? 0.01;

    this.outputs = {
      config: {
        mass,
        stiffness,
        damping,
        pressure,
        collisionMargin,
        springStiffness: stiffness * 0.8,
        solverIterations: 5,
      },
      mass,
      stiffness,
      damping,
      pressure,
    };
  }

  execute(): SoftBodySetupOutputs {
    const mass = this.inputs.mass ?? 1.0;
    const stiffness = this.inputs.stiffness ?? 0.5;
    const damping = this.inputs.damping ?? 0.1;
    const pressure = this.inputs.pressure ?? 0.0;
    const collisionMargin = this.inputs.collisionMargin ?? 0.01;

    // Derive dependent parameters from primary inputs
    const springStiffness = stiffness * 0.8;
    const solverIterations = Math.max(3, Math.ceil(stiffness * 10));

    this.outputs.mass = mass;
    this.outputs.stiffness = stiffness;
    this.outputs.damping = damping;
    this.outputs.pressure = pressure;

    this.outputs.config = {
      mass,
      stiffness,
      damping,
      pressure,
      collisionMargin,
      springStiffness,
      solverIterations,
    };

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
  readonly name = 'Particle System';
  readonly inputs: ParticleSystemInputs;
  readonly outputs: ParticleSystemOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

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
  config: ParticleCollisionConfig;
  bounce: number;
  friction: number;
  stickiness: number;
}

export class ParticleCollisionNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'particle_collision';
  readonly name = 'Particle Collision';
  readonly inputs: ParticleCollisionInputs;
  readonly outputs: ParticleCollisionOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: ParticleCollisionInputs = {}) {
    this.inputs = inputs;
    const bounce = inputs.bounce ?? 0.5;
    const friction = inputs.friction ?? 0.1;
    const stickiness = inputs.stickiness ?? 0.0;

    this.outputs = {
      config: {
        bounce,
        friction,
        stickiness,
        margin: 0.001,
        maxCollisions: 10,
        killOnCollision: false,
      },
      bounce,
      friction,
      stickiness,
    };
  }

  execute(): ParticleCollisionOutputs {
    const bounce = this.inputs.bounce ?? 0.5;
    const friction = this.inputs.friction ?? 0.1;
    const stickiness = this.inputs.stickiness ?? 0.0;

    // Derive dependent collision parameters
    const margin = Math.max(0.0001, bounce * 0.002);
    const maxCollisions = Math.ceil(10 / Math.max(0.1, bounce));
    const killOnCollision = bounce < 0.01 && stickiness > 0.9;

    this.outputs.bounce = bounce;
    this.outputs.friction = friction;
    this.outputs.stickiness = stickiness;

    this.outputs.config = {
      bounce,
      friction,
      stickiness,
      margin,
      maxCollisions,
      killOnCollision,
    };

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
  readonly name = 'Fluid Domain';
  readonly inputs: FluidDomainInputs;
  readonly outputs: FluidDomainOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

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
  config: FluidFlowConfig;
  flowType: string;
  velocity: Vector3;
  sourceVolume: number;
}

export class FluidFlowNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'fluid_flow';
  readonly name = 'Fluid Flow';
  readonly inputs: FluidFlowInputs;
  readonly outputs: FluidFlowOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: FluidFlowInputs = {}) {
    this.inputs = inputs;
    const flowType = inputs.flowType ?? 'inflow';
    const velocity = inputs.velocity || [0, 0, 0];
    const sourceVolume = inputs.sourceVolume ?? 1.0;

    this.outputs = {
      config: {
        flowType,
        velocity: new Vector3(velocity[0], velocity[1], velocity[2]),
        sourceVolume,
        density: 1.0,
        temperature: 300,
        fuel: 0,
      },
      flowType,
      velocity: new Vector3(velocity[0], velocity[1], velocity[2]),
      sourceVolume,
    };
  }

  execute(): FluidFlowOutputs {
    const velocity = this.inputs.velocity || [0, 0, 0];
    const flowType = this.inputs.flowType ?? 'inflow';
    const sourceVolume = this.inputs.sourceVolume ?? 1.0;

    this.outputs.velocity.set(velocity[0], velocity[1], velocity[2]);
    this.outputs.flowType = flowType;
    this.outputs.sourceVolume = sourceVolume;

    // Derive dependent flow parameters
    const speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
    const density = flowType === 'outflow' ? 0 : Math.max(0.1, speed * 0.5);
    const temperature = flowType === 'inflow' ? 300 + speed * 10 : 300;
    const fuel = flowType === 'inflow' ? Math.max(0, sourceVolume - 0.5) : 0;

    this.outputs.config = {
      flowType,
      velocity: this.outputs.velocity.clone(),
      sourceVolume,
      density,
      temperature,
      fuel,
    };

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
  config: ClothConfig;
  mass: number;
  structuralStiffness: number;
  bendingStiffness: number;
  damping: number;
  pressure: number;
}

export class ClothSetupNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'cloth_setup';
  readonly name = 'Cloth Setup';
  readonly inputs: ClothSetupInputs;
  readonly outputs: ClothSetupOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: ClothSetupInputs = {}) {
    this.inputs = inputs;
    const mass = inputs.mass ?? 0.5;
    const structuralStiffness = inputs.structuralStiffness ?? 10.0;
    const bendingStiffness = inputs.bendingStiffness ?? 0.5;
    const damping = inputs.damping ?? 0.01;
    const pressure = inputs.pressure ?? 0.0;

    this.outputs = {
      config: {
        mass,
        structuralStiffness,
        bendingStiffness,
        damping,
        pressure,
        shearStiffness: structuralStiffness * 0.5,
        airDrag: damping * 2,
        pinStiffness: 1.0,
        selfCollisionDistance: 0.01,
      },
      mass,
      structuralStiffness,
      bendingStiffness,
      damping,
      pressure,
    };
  }

  execute(): ClothSetupOutputs {
    const mass = this.inputs.mass ?? 0.5;
    const structuralStiffness = this.inputs.structuralStiffness ?? 10.0;
    const bendingStiffness = this.inputs.bendingStiffness ?? 0.5;
    const damping = this.inputs.damping ?? 0.01;
    const pressure = this.inputs.pressure ?? 0.0;

    // Derive dependent cloth parameters
    const shearStiffness = structuralStiffness * 0.5;
    const airDrag = Math.max(0.001, damping * 2);
    const pinStiffness = structuralStiffness > 20 ? 1.0 : structuralStiffness / 20;
    const selfCollisionDistance = Math.max(0.001, mass * 0.02);

    this.outputs.mass = mass;
    this.outputs.structuralStiffness = structuralStiffness;
    this.outputs.bendingStiffness = bendingStiffness;
    this.outputs.damping = damping;
    this.outputs.pressure = pressure;

    this.outputs.config = {
      mass,
      structuralStiffness,
      bendingStiffness,
      damping,
      pressure,
      shearStiffness,
      airDrag,
      pinStiffness,
      selfCollisionDistance,
    };

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
  config: ClothPinGroupConfig;
  pinnedVertices: number[];
  pinStrength: number;
}

export class ClothPinGroupNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'cloth_pin_group';
  readonly name = 'Cloth Pin Group';
  readonly inputs: ClothPinGroupInputs;
  readonly outputs: ClothPinGroupOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  constructor(inputs: ClothPinGroupInputs = {}) {
    this.inputs = inputs;
    const pinnedVertices: number[] = [];
    const pinStrength = inputs.pinStrength ?? 1.0;

    this.outputs = {
      config: {
        pinnedVertices,
        pinStrength,
        isAbsolute: pinStrength >= 1.0,
        targetOffset: new Vector3(0, 0, 0),
      },
      pinnedVertices,
      pinStrength,
    };
  }

  execute(): ClothPinGroupOutputs {
    const pinnedVertices = this.inputs.vertexGroup || [];
    const pinStrength = this.inputs.pinStrength ?? 1.0;

    this.outputs.pinnedVertices = pinnedVertices;
    this.outputs.pinStrength = pinStrength;

    // Derive dependent pin group parameters
    const isAbsolute = pinStrength >= 1.0;
    // Target offset: if pins are soft (strength < 1), allow some drift
    const offsetScale = (1 - pinStrength) * 0.1;
    const targetOffset = new Vector3(offsetScale, offsetScale, offsetScale);

    this.outputs.config = {
      pinnedVertices,
      pinStrength,
      isAbsolute,
      targetOffset,
    };

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
