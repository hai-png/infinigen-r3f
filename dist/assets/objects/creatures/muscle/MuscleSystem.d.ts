import * as THREE from 'three';
/**
 * Procedural Muscle Simulation System
 * Implements simplified muscle fiber simulation for creature animation
 */
export interface MuscleConfig {
    stiffness: number;
    damping: number;
    activationSpeed: number;
    relaxationSpeed: number;
    maxContraction: number;
}
export interface MuscleFiber {
    origin: THREE.Vector3;
    insertion: THREE.Vector3;
    restLength: number;
    currentLength: number;
    activation: number;
    force: number;
    direction: THREE.Vector3;
}
export interface MuscleGroup {
    name: string;
    fibers: MuscleFiber[];
    boneA: string;
    boneB: string;
}
export declare class MuscleSystem {
    private muscles;
    private config;
    private enabled;
    constructor(config?: Partial<MuscleConfig>);
    addMuscleGroup(name: string, boneA: string, boneB: string, fiberCount?: number): void;
    update(dt: number, activations: Map<string, number>): void;
    getMuscleForce(muscleName: string): number;
    getFiberDirections(muscleName: string): THREE.Vector3[];
    setEnabled(enabled: boolean): void;
    reset(): void;
    visualize(scene: THREE.Scene): THREE.Group;
    dispose(): void;
}
export default MuscleSystem;
//# sourceMappingURL=MuscleSystem.d.ts.map