import * as THREE from 'three';
/**
 * Position-Based Dynamics Soft Body Simulation
 * Implements real-time soft body deformation using PBD with volume constraints
 */
export interface SoftBodyConfig {
    mass: number;
    stiffness: number;
    damping: number;
    pressure: number;
    volumeStiffness: number;
    enablePressure: boolean;
}
export interface SoftBodyParticle {
    position: THREE.Vector3;
    previousPosition: THREE.Vector3;
    originalPosition: THREE.Vector3;
    velocity: THREE.Vector3;
    force: THREE.Vector3;
    mass: number;
    inverseMass: number;
    pinned: boolean;
}
export interface SoftBodyConstraint {
    particleA: number;
    particleB: number;
    restLength: number;
    stiffness: number;
    active: boolean;
}
export interface SoftBodyTetrahedron {
    indices: [number, number, number, number];
    restVolume: number;
}
export declare class SoftBodySimulation {
    private particles;
    private constraints;
    private tetrahedra;
    private geometry;
    private mesh;
    private config;
    private gravity;
    private enabled;
    constructor(config?: Partial<SoftBodyConfig>);
    initializeFromSphere(radius: number, segments: number, pinTop?: boolean): void;
    private createEdgeConstraints;
    private addInternalConstraints;
    private createTetrahedra;
    private calculateTetrahedronVolume;
    private createMesh;
    update(dt: number): void;
    private integrateForces;
    private applyPressure;
    private integrateVerlet;
    private satisfyConstraints;
    private satisfyVolumeConstraints;
    private updateGeometry;
    getMesh(): THREE.Mesh | null;
    setGravity(gravity: THREE.Vector3): void;
    setPressure(pressure: number): void;
    pinParticle(index: number, pinned: boolean): void;
    applyForce(index: number, force: THREE.Vector3): void;
    reset(): void;
    dispose(): void;
}
export default SoftBodySimulation;
//# sourceMappingURL=SoftBodySimulation.d.ts.map