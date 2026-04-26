/**
 * Shared Type Definitions for Infinigen R3F
 */
import * as THREE from 'three';
/**
 * Lightweight mesh representation for serialization and bridge transfer
 */
export interface MeshData {
    vertices: number[];
    faces: number[];
    normals?: number[];
    uvs?: number[];
    materialId?: string;
}
/**
 * Physics configuration for MJCF/URDF export
 */
export interface PhysicsConfig {
    sceneId: string;
    objects: Array<{
        id: string;
        mesh: MeshData;
        mass: number;
        friction: number;
        restitution: number;
        pose: {
            position: [number, number, number];
            rotation: [number, number, number, number];
        };
        joints?: Array<{
            type: 'hinge' | 'slider' | 'ball' | 'fixed';
            axis?: [number, number, number];
            limits?: {
                min: number;
                max: number;
            };
            damping?: number;
        }>;
    }>;
    gravity?: [number, number, number];
    timestep?: number;
    solverIterations?: number;
}
/**
 * Raycast hit result
 */
export interface RayHit {
    distance: number;
    point: [number, number, number];
    normal: [number, number, number];
    objectId?: string;
}
/**
 * Bounding Box representation
 */
export interface BBox {
    min: [number, number, number];
    max: [number, number, number];
}
/**
 * Pose representation
 */
export interface Pose {
    position: [number, number, number];
    rotation: [number, number, number, number];
}
/**
 * Constraint evaluation context
 */
export interface EvalContext {
    objects: Map<string, any>;
    scene?: THREE.Scene;
    camera?: THREE.Camera;
}
/**
 * Proposal result from MCMC strategy
 */
export interface Proposal {
    variableId: string;
    oldValue: any;
    newValue: any;
    logProb: number;
}
/**
 * Solver state snapshot
 */
export interface SolverState {
    iteration: number;
    energy: number;
    assignments: Map<string, any>;
    temperature?: number;
}
//# sourceMappingURL=types.d.ts.map