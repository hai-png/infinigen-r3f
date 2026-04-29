/**
 * Solver State Definitions
 *
 * Ports: infinigen/core/constraints/example_solver/state_def.py
 *
 * Core state representations for constraint solving.
 * Note: Removed bpy dependencies, uses three.js equivalents.
 */
import { Relation } from '../language/relations.js';
import { TagSet } from '../tags/index.js';
import * as THREE from 'three';
/**
 * Represents a relation between two objects in the solver state
 */
export declare class RelationState {
    relation: Relation;
    targetName: string;
    childPlaneIdx?: number | undefined;
    parentPlaneIdx?: number | undefined;
    value?: any | undefined;
    constructor(relation: Relation, targetName: string, childPlaneIdx?: number | undefined, parentPlaneIdx?: number | undefined, value?: any | undefined);
}
/**
 * Represents an object's state in the solver
 */
export declare class ObjectState {
    obj: THREE.Object3D | null;
    polygon: any;
    generator: any;
    tags: TagSet;
    relations: RelationState[];
    dofMatrixTranslation: THREE.Vector3 | null;
    dofRotationAxis: THREE.Vector3 | null;
    private _poseAffectsScore;
    fclObj: any;
    colObj: any;
    active: boolean;
    constructor();
    /**
     * Check for tag contradictions and negated relations
     */
    validate(): void;
    toString(): string;
}
/**
 * BVH Cache entry
 */
export interface BVHCacheEntry {
    bvh: any;
    matrix: THREE.Matrix4;
}
/**
 * Main solver state container
 */
export declare class State {
    objs: Map<string, ObjectState>;
    trimeshScene: any;
    graphs: any[];
    bvhCache: Map<[string[], Set<any>], BVHCacheEntry>;
    planes: any;
    /**
     * Get object by key
     */
    get(key: string): ObjectState | undefined;
    /**
     * Set object
     */
    set(key: string, value: ObjectState): void;
    /**
     * Delete object
     */
    delete(key: string): boolean;
    /**
     * Get number of objects
     */
    get size(): number;
    /**
     * Get all active object names
     */
    getActiveObjectNames(): string[];
    /**
     * Convert to JSON-serializable format
     */
    toJSON(): any;
    /**
     * Create state from JSON
     */
    static fromJSON(data: any): State;
}
/**
 * Check if an object's pose affects the constraint score
 * This is used to optimize solving by skipping objects that don't affect violations
 */
export declare function poseAffectsScore(state: State, objName: string): boolean;
//# sourceMappingURL=state.d.ts.map