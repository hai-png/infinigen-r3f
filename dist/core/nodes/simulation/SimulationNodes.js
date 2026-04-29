/**
 * Simulation Nodes Module
 * Rigid body, soft body, particle, and fluid simulation nodes
 * Ported from Blender Geometry Nodes and Infinigen physics system
 */
import { Vector3 } from 'three';
export class RigidBodyWorldNode {
    constructor(inputs = {}) {
        this.category = 'simulation';
        this.nodeType = 'rigid_body_world';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            world: null,
            gravity: new Vector3(0, -9.81, 0),
            substeps: inputs.substeps ?? 60,
        };
    }
    execute() {
        const gravity = this.inputs.gravity || [0, -9.81, 0];
        this.outputs.gravity.set(gravity[0], gravity[1], gravity[2]);
        this.outputs.substeps = this.inputs.substeps ?? 60;
        return this.outputs;
    }
}
export class RigidBodyConstraintsNode {
    constructor(inputs = {}) {
        this.category = 'simulation';
        this.nodeType = 'rigid_body_constraints';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            constraint: null,
            type: inputs.constraintType ?? 'fixed',
            pivotA: new Vector3(),
            pivotB: new Vector3(),
        };
    }
    execute() {
        const pivotA = this.inputs.pivotA || [0, 0, 0];
        const pivotB = this.inputs.pivotB || [0, 0, 0];
        this.outputs.pivotA.set(pivotA[0], pivotA[1], pivotA[2]);
        this.outputs.pivotB.set(pivotB[0], pivotB[1], pivotB[2]);
        this.outputs.type = this.inputs.constraintType ?? 'fixed';
        return this.outputs;
    }
}
export class SoftBodySetupNode {
    constructor(inputs = {}) {
        this.category = 'simulation';
        this.nodeType = 'soft_body_setup';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            mass: inputs.mass ?? 1.0,
            stiffness: inputs.stiffness ?? 0.5,
            damping: inputs.damping ?? 0.1,
            pressure: inputs.pressure ?? 0.0,
        };
    }
    execute() {
        this.outputs.mass = this.inputs.mass ?? 1.0;
        this.outputs.stiffness = this.inputs.stiffness ?? 0.5;
        this.outputs.damping = this.inputs.damping ?? 0.1;
        this.outputs.pressure = this.inputs.pressure ?? 0.0;
        return this.outputs;
    }
}
export class ParticleSystemNode {
    constructor(inputs = {}) {
        this.category = 'simulation';
        this.nodeType = 'particle_system';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            particles: [],
            count: inputs.count ?? 1000,
            positions: [],
            velocities: [],
        };
    }
    execute() {
        const count = this.inputs.count ?? 1000;
        const lifetime = this.inputs.lifetime ?? 10;
        const velocity = this.inputs.velocity || [0, 0, 0];
        const randomVel = this.inputs.randomVelocity ?? 0.1;
        const positions = [];
        const velocities = [];
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
export class ParticleCollisionNode {
    constructor(inputs = {}) {
        this.category = 'simulation';
        this.nodeType = 'particle_collision';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            bounce: inputs.bounce ?? 0.5,
            friction: inputs.friction ?? 0.1,
            stickiness: inputs.stickiness ?? 0.0,
        };
    }
    execute() {
        this.outputs.bounce = this.inputs.bounce ?? 0.5;
        this.outputs.friction = this.inputs.friction ?? 0.1;
        this.outputs.stickiness = this.inputs.stickiness ?? 0.0;
        return this.outputs;
    }
}
export class FluidDomainNode {
    constructor(inputs = {}) {
        this.category = 'simulation';
        this.nodeType = 'fluid_domain';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            resolution: inputs.resolution ?? 32,
            viscosity: inputs.viscosity ?? 0.01,
            surfaceTension: inputs.surfaceTension ?? 0.0,
            gridSize: [1, 1, 1],
        };
    }
    execute() {
        const resolution = this.inputs.resolution ?? 32;
        this.outputs.resolution = resolution;
        this.outputs.viscosity = this.inputs.viscosity ?? 0.01;
        this.outputs.surfaceTension = this.inputs.surfaceTension ?? 0.0;
        this.outputs.gridSize = [resolution, resolution, resolution];
        return this.outputs;
    }
}
export class FluidFlowNode {
    constructor(inputs = {}) {
        this.category = 'simulation';
        this.nodeType = 'fluid_flow';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            flowType: inputs.flowType ?? 'inflow',
            velocity: new Vector3(),
            sourceVolume: inputs.sourceVolume ?? 1.0,
        };
    }
    execute() {
        const velocity = this.inputs.velocity || [0, 0, 0];
        this.outputs.velocity.set(velocity[0], velocity[1], velocity[2]);
        this.outputs.flowType = this.inputs.flowType ?? 'inflow';
        this.outputs.sourceVolume = this.inputs.sourceVolume ?? 1.0;
        return this.outputs;
    }
}
export class ClothSetupNode {
    constructor(inputs = {}) {
        this.category = 'simulation';
        this.nodeType = 'cloth_setup';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            mass: inputs.mass ?? 0.5,
            structuralStiffness: inputs.structuralStiffness ?? 10.0,
            bendingStiffness: inputs.bendingStiffness ?? 0.5,
            damping: inputs.damping ?? 0.01,
            pressure: inputs.pressure ?? 0.0,
        };
    }
    execute() {
        this.outputs.mass = this.inputs.mass ?? 0.5;
        this.outputs.structuralStiffness = this.inputs.structuralStiffness ?? 10.0;
        this.outputs.bendingStiffness = this.inputs.bendingStiffness ?? 0.5;
        this.outputs.damping = this.inputs.damping ?? 0.01;
        this.outputs.pressure = this.inputs.pressure ?? 0.0;
        return this.outputs;
    }
}
export class ClothPinGroupNode {
    constructor(inputs = {}) {
        this.category = 'simulation';
        this.nodeType = 'cloth_pin_group';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            pinnedVertices: [],
            pinStrength: inputs.pinStrength ?? 1.0,
        };
    }
    execute() {
        this.outputs.pinnedVertices = this.inputs.vertexGroup || [];
        this.outputs.pinStrength = this.inputs.pinStrength ?? 1.0;
        return this.outputs;
    }
}
// ============================================================================
// Factory Functions
// ============================================================================
export function createRigidBodyWorldNode(inputs) {
    return new RigidBodyWorldNode(inputs);
}
export function createRigidBodyConstraintsNode(inputs) {
    return new RigidBodyConstraintsNode(inputs);
}
export function createSoftBodySetupNode(inputs) {
    return new SoftBodySetupNode(inputs);
}
export function createParticleSystemNode(inputs) {
    return new ParticleSystemNode(inputs);
}
export function createParticleCollisionNode(inputs) {
    return new ParticleCollisionNode(inputs);
}
export function createFluidDomainNode(inputs) {
    return new FluidDomainNode(inputs);
}
export function createFluidFlowNode(inputs) {
    return new FluidFlowNode(inputs);
}
export function createClothSetupNode(inputs) {
    return new ClothSetupNode(inputs);
}
export function createClothPinGroupNode(inputs) {
    return new ClothPinGroupNode(inputs);
}
//# sourceMappingURL=SimulationNodes.js.map