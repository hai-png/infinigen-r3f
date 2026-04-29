import * as THREE from 'three';
/**
 * Position-Based Dynamics Cloth Simulation
 * Implements real-time cloth simulation using PBD constraints
 */
export interface ClothConfig {
    width: number;
    height: number;
    segmentsX: number;
    segmentsY: number;
    mass: number;
    stiffness: number;
    damping: number;
    tearThreshold: number;
    enableTearing: boolean;
}
export interface ClothParticle {
    position: THREE.Vector3;
    previousPosition: THREE.Vector3;
    originalPosition: THREE.Vector3;
    velocity: THREE.Vector3;
    force: THREE.Vector3;
    mass: number;
    inverseMass: number;
    pinned: boolean;
}
export interface ClothConstraint {
    particleA: number;
    particleB: number;
    restLength: number;
    stiffness: number;
    active: boolean;
}
export declare class ClothSimulation {
    private particles;
    private constraints;
    private geometry;
    private mesh;
    private config;
    private gravity;
    private wind;
    private enabled;
    constructor(config?: Partial<ClothConfig>);
    private initializeCloth;
    private createMesh;
    update(dt: number): void;
    private integrateForces;
    private integrateVerlet;
    private satisfyConstraints;
    private updateWind;
    private updateGeometry;
    getMesh(): THREE.Mesh | null;
    setGravity(gravity: THREE.Vector3): void;
    setWind(wind: THREE.Vector3): void;
    pinPoint(index: number, pinned: boolean): void;
    reset(): void;
    dispose(): void;
}
export default ClothSimulation;
//# sourceMappingURL=ClothSimulation.d.ts.map