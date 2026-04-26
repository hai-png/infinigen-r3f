/**
 * Simulation Nodes Module
 * Rigid body, soft body, particle, and fluid simulation nodes
 * Ported from Blender Geometry Nodes and Infinigen physics system
 */
import { Vector3 } from 'three';
import type { NodeBase, Domain } from '../core/types';
export interface SimulationNodeBase extends NodeBase {
    category: 'simulation';
}
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
export declare class RigidBodyWorldNode implements SimulationNodeBase {
    readonly category = "simulation";
    readonly nodeType = "rigid_body_world";
    readonly inputs: RigidBodyWorldInputs;
    readonly outputs: RigidBodyWorldOutputs;
    readonly domain: Domain;
    constructor(inputs?: RigidBodyWorldInputs);
    execute(): RigidBodyWorldOutputs;
}
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
export declare class RigidBodyConstraintsNode implements SimulationNodeBase {
    readonly category = "simulation";
    readonly nodeType = "rigid_body_constraints";
    readonly inputs: RigidBodyConstraintsInputs;
    readonly outputs: RigidBodyConstraintsOutputs;
    readonly domain: Domain;
    constructor(inputs?: RigidBodyConstraintsInputs);
    execute(): RigidBodyConstraintsOutputs;
}
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
export declare class SoftBodySetupNode implements SimulationNodeBase {
    readonly category = "simulation";
    readonly nodeType = "soft_body_setup";
    readonly inputs: SoftBodySetupInputs;
    readonly outputs: SoftBodySetupOutputs;
    readonly domain: Domain;
    constructor(inputs?: SoftBodySetupInputs);
    execute(): SoftBodySetupOutputs;
}
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
export declare class ParticleSystemNode implements SimulationNodeBase {
    readonly category = "simulation";
    readonly nodeType = "particle_system";
    readonly inputs: ParticleSystemInputs;
    readonly outputs: ParticleSystemOutputs;
    readonly domain: Domain;
    constructor(inputs?: ParticleSystemInputs);
    execute(): ParticleSystemOutputs;
}
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
export declare class ParticleCollisionNode implements SimulationNodeBase {
    readonly category = "simulation";
    readonly nodeType = "particle_collision";
    readonly inputs: ParticleCollisionInputs;
    readonly outputs: ParticleCollisionOutputs;
    readonly domain: Domain;
    constructor(inputs?: ParticleCollisionInputs);
    execute(): ParticleCollisionOutputs;
}
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
export declare class FluidDomainNode implements SimulationNodeBase {
    readonly category = "simulation";
    readonly nodeType = "fluid_domain";
    readonly inputs: FluidDomainInputs;
    readonly outputs: FluidDomainOutputs;
    readonly domain: Domain;
    constructor(inputs?: FluidDomainInputs);
    execute(): FluidDomainOutputs;
}
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
export declare class FluidFlowNode implements SimulationNodeBase {
    readonly category = "simulation";
    readonly nodeType = "fluid_flow";
    readonly inputs: FluidFlowInputs;
    readonly outputs: FluidFlowOutputs;
    readonly domain: Domain;
    constructor(inputs?: FluidFlowInputs);
    execute(): FluidFlowOutputs;
}
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
export declare class ClothSetupNode implements SimulationNodeBase {
    readonly category = "simulation";
    readonly nodeType = "cloth_setup";
    readonly inputs: ClothSetupInputs;
    readonly outputs: ClothSetupOutputs;
    readonly domain: Domain;
    constructor(inputs?: ClothSetupInputs);
    execute(): ClothSetupOutputs;
}
export interface ClothPinGroupInputs {
    vertexGroup?: number[];
    pinStrength?: number;
}
export interface ClothPinGroupOutputs {
    pinnedVertices: number[];
    pinStrength: number;
}
export declare class ClothPinGroupNode implements SimulationNodeBase {
    readonly category = "simulation";
    readonly nodeType = "cloth_pin_group";
    readonly inputs: ClothPinGroupInputs;
    readonly outputs: ClothPinGroupOutputs;
    readonly domain: Domain;
    constructor(inputs?: ClothPinGroupInputs);
    execute(): ClothPinGroupOutputs;
}
export declare function createRigidBodyWorldNode(inputs?: RigidBodyWorldInputs): RigidBodyWorldNode;
export declare function createRigidBodyConstraintsNode(inputs?: RigidBodyConstraintsInputs): RigidBodyConstraintsNode;
export declare function createSoftBodySetupNode(inputs?: SoftBodySetupInputs): SoftBodySetupNode;
export declare function createParticleSystemNode(inputs?: ParticleSystemInputs): ParticleSystemNode;
export declare function createParticleCollisionNode(inputs?: ParticleCollisionInputs): ParticleCollisionNode;
export declare function createFluidDomainNode(inputs?: FluidDomainInputs): FluidDomainNode;
export declare function createFluidFlowNode(inputs?: FluidFlowInputs): FluidFlowNode;
export declare function createClothSetupNode(inputs?: ClothSetupInputs): ClothSetupNode;
export declare function createClothPinGroupNode(inputs?: ClothPinGroupInputs): ClothPinGroupNode;
export { RigidBodyWorldNode, RigidBodyConstraintsNode, SoftBodySetupNode, ParticleSystemNode, ParticleCollisionNode, FluidDomainNode, FluidFlowNode, ClothSetupNode, ClothPinGroupNode, };
export type { SimulationNodeBase, RigidBodyWorldInputs, RigidBodyWorldOutputs, RigidBodyConstraintsInputs, RigidBodyConstraintsOutputs, SoftBodySetupInputs, SoftBodySetupOutputs, ParticleSystemInputs, ParticleSystemOutputs, ParticleCollisionInputs, ParticleCollisionOutputs, FluidDomainInputs, FluidDomainOutputs, FluidFlowInputs, FluidFlowOutputs, ClothSetupInputs, ClothSetupOutputs, ClothPinGroupInputs, ClothPinGroupOutputs, };
//# sourceMappingURL=SimulationNodes.d.ts.map