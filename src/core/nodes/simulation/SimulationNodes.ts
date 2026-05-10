/**
 * Simulation Nodes Module
 * Rigid body, soft body, particle, and fluid simulation nodes
 * Ported from Blender Geometry Nodes and Infinigen physics system
 */

import { Vector3, Quaternion } from 'three';
import type { NodeBase, AttributeDomain } from '../core/types';
import { SeededRandom } from '../../util/MathUtils';

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
  private rng: SeededRandom;

  constructor(inputs: ParticleSystemInputs = {}) {
    this.inputs = inputs;
    this.rng = new SeededRandom(42);
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
        (this.rng.next() - 0.5) * 2,
        (this.rng.next() - 0.5) * 2,
        (this.rng.next() - 0.5) * 2
      ]);
      
      velocities.push([
        velocity[0] + (this.rng.next() - 0.5) * randomVel,
        velocity[1] + (this.rng.next() - 0.5) * randomVel,
        velocity[2] + (this.rng.next() - 0.5) * randomVel
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
// Simulation Zone Nodes (Blender 3.x style)
// ============================================================================

/**
 * Simulation state passed between steps in a simulation zone.
 *
 * Contains the geometry being simulated along with any custom
 * attributes that the inner graph reads and writes each step.
 */
export interface SimulationState {
  geometry: any;
  attributes: Record<string, any>;
}

/**
 * Context for a single simulation step, provided by SimulationInputNode.
 */
export interface SimulationStepContext {
  /** Time elapsed since the simulation started */
  elapsedTime: number;
  /** Time delta for this step */
  deltaTime: number;
  /** Current step index (0-based) */
  stepIndex: number;
}

// ----------------------------------------------------------------------------
// Simulation Zone Node
// ----------------------------------------------------------------------------

export interface SimulationZoneInputs {
  /** Initial geometry state before simulation starts */
  geometry?: any;
  /** Time step between simulation frames */
  deltaTime?: number;
  /** Maximum number of simulation steps */
  maxSteps?: number;
  /** Number of substeps per frame (higher = more accurate but slower) */
  substeps?: number;
}

export interface SimulationZoneOutputs {
  /** Final geometry state after all simulation steps */
  geometry: any;
  /** Number of steps actually executed */
  stepsExecuted: number;
  /** Total elapsed simulation time */
  elapsedTime: number;
}

/**
 * SimulationZoneNode — The core simulation zone (Blender 3.x style).
 *
 * A simulation zone defines a looping subgraph that executes for a
 * configurable number of steps. On each step, the inner graph
 * (SimulationInput → inner nodes → SimulationOutput) receives the
 * current state and produces a new state, which feeds back into the
 * next step.
 *
 * The zone maintains:
 * - The current geometry state
 * - Step timing information (delta_time, elapsed_time, step_index)
 * - Any custom attributes passed between steps
 *
 * The inner graph is identified by a `zoneId` that links the zone
 * node with its input/output nodes.
 */
export class SimulationZoneNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'simulation_zone';
  readonly name = 'Simulation Zone';
  readonly inputs: SimulationZoneInputs;
  readonly outputs: SimulationZoneOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  /** Unique identifier linking this zone with its inner Input/Output nodes */
  zoneId: string;

  constructor(inputs: SimulationZoneInputs = {}, zoneId?: string) {
    this.inputs = inputs;
    this.zoneId = zoneId ?? `sim_zone_${SimulationZoneNode._nextId++}`;
    this.outputs = {
      geometry: null,
      stepsExecuted: 0,
      elapsedTime: 0,
    };
  }

  private static _nextId = 0;

  execute(): SimulationZoneOutputs {
    // The actual stepping is handled by the SimulationZoneExecutor.
    // This execute() provides a basic pass-through for standalone use.
    const deltaTime = this.inputs.deltaTime ?? 1 / 60;
    const maxSteps = this.inputs.maxSteps ?? 1;

    this.outputs.geometry = this.inputs.geometry ?? null;
    this.outputs.stepsExecuted = maxSteps;
    this.outputs.elapsedTime = maxSteps * deltaTime;

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Repeat Zone Node
// ----------------------------------------------------------------------------

export interface RepeatZoneInputs {
  /** Initial geometry state */
  geometry?: any;
  /** Number of iterations to execute */
  iterations?: number;
}

export interface RepeatZoneOutputs {
  /** Final geometry state after all iterations */
  geometry: any;
  /** Number of iterations actually executed */
  iterationsExecuted: number;
}

/**
 * RepeatZoneNode — A repeat/loop zone (Blender 3.x style).
 *
 * Similar to a simulation zone but simpler: the inner graph is
 * executed N times with the output of one iteration feeding as
 * input to the next. The iteration index is available inside
 * the zone via RepeatInputNode.
 *
 * This is useful for iterative algorithms like relaxation,
 * subdivision, or any process that needs to be repeated a
 * fixed number of times.
 */
export class RepeatZoneNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'repeat_zone';
  readonly name = 'Repeat Zone';
  readonly inputs: RepeatZoneInputs;
  readonly outputs: RepeatZoneOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  /** Unique identifier linking this zone with its inner Input/Output nodes */
  zoneId: string;

  constructor(inputs: RepeatZoneInputs = {}, zoneId?: string) {
    this.inputs = inputs;
    this.zoneId = zoneId ?? `repeat_zone_${RepeatZoneNode._nextId++}`;
    this.outputs = {
      geometry: null,
      iterationsExecuted: 0,
    };
  }

  private static _nextId = 0;

  execute(): RepeatZoneOutputs {
    // The actual iteration is handled by the RepeatZoneExecutor.
    // This execute() provides a basic pass-through for standalone use.
    const iterations = this.inputs.iterations ?? 1;

    this.outputs.geometry = this.inputs.geometry ?? null;
    this.outputs.iterationsExecuted = iterations;

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Simulation Input Node
// ----------------------------------------------------------------------------

export interface SimulationInputInputs {
  /** Internal: receives the current simulation state from the zone executor */
  _state?: SimulationState;
  _stepContext?: SimulationStepContext;
}

export interface SimulationInputOutputs {
  /** The current geometry state in this simulation step */
  geometry: any;
  /** Time delta for this step */
  deltaTime: number;
  /** Total elapsed time since simulation start */
  elapsedTime: number;
  /** Current step index (0-based) */
  stepIndex: number;
}

/**
 * SimulationInputNode — The input side of a simulation zone.
 *
 * Placed inside a SimulationZone's inner graph. It receives the
 * current simulation state from the zone executor and outputs
 * the geometry and step context (delta_time, elapsed_time, step_index)
 * for the inner graph to process.
 *
 * Each SimulationInputNode is linked to its parent zone via zoneId.
 */
export class SimulationInputNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'simulation_input';
  readonly name = 'Simulation Input';
  readonly inputs: SimulationInputInputs;
  readonly outputs: SimulationInputOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  /** Links this input node to its parent SimulationZoneNode */
  zoneId: string;

  constructor(zoneId?: string) {
    this.zoneId = zoneId ?? '';
    this.inputs = {};
    this.outputs = {
      geometry: null,
      deltaTime: 1 / 60,
      elapsedTime: 0,
      stepIndex: 0,
    };
  }

  execute(): SimulationInputOutputs {
    const state = this.inputs._state;
    const context = this.inputs._stepContext;

    if (state) {
      this.outputs.geometry = state.geometry;
    }

    if (context) {
      this.outputs.deltaTime = context.deltaTime;
      this.outputs.elapsedTime = context.elapsedTime;
      this.outputs.stepIndex = context.stepIndex;
    }

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Simulation Output Node
// ----------------------------------------------------------------------------

export interface SimulationOutputInputs {
  /** The modified geometry from the inner graph to feed to the next step */
  geometry?: any;
  /** Custom attributes to carry forward to the next step */
  attributes?: Record<string, any>;
}

export interface SimulationOutputOutputs {
  /** Internal: the updated simulation state for the zone executor */
  _state: SimulationState;
}

/**
 * SimulationOutputNode — The output side of a simulation zone.
 *
 * Placed inside a SimulationZone's inner graph. It receives the
 * modified geometry and attributes from the inner graph and
 * packages them into a SimulationState that feeds back as input
 * for the next step.
 *
 * Each SimulationOutputNode is linked to its parent zone via zoneId.
 */
export class SimulationOutputNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'simulation_output';
  readonly name = 'Simulation Output';
  readonly inputs: SimulationOutputInputs;
  readonly outputs: SimulationOutputOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  /** Links this output node to its parent SimulationZoneNode */
  zoneId: string;

  constructor(zoneId?: string) {
    this.zoneId = zoneId ?? '';
    this.inputs = {};
    this.outputs = {
      _state: { geometry: null, attributes: {} },
    };
  }

  execute(): SimulationOutputOutputs {
    this.outputs._state = {
      geometry: this.inputs.geometry ?? null,
      attributes: this.inputs.attributes ?? {},
    };

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Repeat Input Node
// ----------------------------------------------------------------------------

export interface RepeatInputInputs {
  /** Internal: receives the current iteration state from the zone executor */
  _state?: SimulationState;
  _iterationIndex?: number;
}

export interface RepeatInputOutputs {
  /** The current geometry state in this iteration */
  geometry: any;
  /** The current iteration index (0-based) */
  iterationIndex: number;
}

/**
 * RepeatInputNode — The input side of a repeat zone.
 *
 * Placed inside a RepeatZone's inner graph. It receives the
 * current iteration state from the zone executor and outputs
 * the geometry and current iteration index for the inner graph
 * to process.
 *
 * Each RepeatInputNode is linked to its parent zone via zoneId.
 */
export class RepeatInputNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'repeat_input';
  readonly name = 'Repeat Input';
  readonly inputs: RepeatInputInputs;
  readonly outputs: RepeatInputOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  /** Links this input node to its parent RepeatZoneNode */
  zoneId: string;

  constructor(zoneId?: string) {
    this.zoneId = zoneId ?? '';
    this.inputs = {};
    this.outputs = {
      geometry: null,
      iterationIndex: 0,
    };
  }

  execute(): RepeatInputOutputs {
    const state = this.inputs._state;

    if (state) {
      this.outputs.geometry = state.geometry;
    }

    this.outputs.iterationIndex = this.inputs._iterationIndex ?? 0;

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Repeat Output Node
// ----------------------------------------------------------------------------

export interface RepeatOutputInputs {
  /** The modified geometry from the inner graph to feed to the next iteration */
  geometry?: any;
  /** Custom attributes to carry forward to the next iteration */
  attributes?: Record<string, any>;
}

export interface RepeatOutputOutputs {
  /** Internal: the updated state for the zone executor */
  _state: SimulationState;
}

/**
 * RepeatOutputNode — The output side of a repeat zone.
 *
 * Placed inside a RepeatZone's inner graph. It receives the
 * modified geometry and attributes from the inner graph and
 * packages them into a state that feeds back as input for the
 * next iteration.
 *
 * Each RepeatOutputNode is linked to its parent zone via zoneId.
 */
export class RepeatOutputNode implements SimulationNodeBase {
  readonly category = 'simulation';
  readonly nodeType = 'repeat_output';
  readonly name = 'Repeat Output';
  readonly inputs: RepeatOutputInputs;
  readonly outputs: RepeatOutputOutputs;
  readonly domain: AttributeDomain = 'point';
  readonly settings: Record<string, any> = {};

  /** Links this output node to its parent RepeatZoneNode */
  zoneId: string;

  constructor(zoneId?: string) {
    this.zoneId = zoneId ?? '';
    this.inputs = {};
    this.outputs = {
      _state: { geometry: null, attributes: {} },
    };
  }

  execute(): RepeatOutputOutputs {
    this.outputs._state = {
      geometry: this.inputs.geometry ?? null,
      attributes: this.inputs.attributes ?? {},
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

export function createSimulationZoneNode(inputs?: SimulationZoneInputs, zoneId?: string): SimulationZoneNode {
  return new SimulationZoneNode(inputs, zoneId);
}

export function createRepeatZoneNode(inputs?: RepeatZoneInputs, zoneId?: string): RepeatZoneNode {
  return new RepeatZoneNode(inputs, zoneId);
}

export function createSimulationInputNode(zoneId?: string): SimulationInputNode {
  return new SimulationInputNode(zoneId);
}

export function createSimulationOutputNode(zoneId?: string): SimulationOutputNode {
  return new SimulationOutputNode(zoneId);
}

export function createRepeatInputNode(zoneId?: string): RepeatInputNode {
  return new RepeatInputNode(zoneId);
}

export function createRepeatOutputNode(zoneId?: string): RepeatOutputNode {
  return new RepeatOutputNode(zoneId);
}
