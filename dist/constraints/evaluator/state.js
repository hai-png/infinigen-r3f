/**
 * Solver State Definitions
 *
 * Ports: infinigen/core/constraints/example_solver/state_def.py
 *
 * Core state representations for constraint solving.
 * Note: Removed bpy dependencies, uses three.js equivalents.
 */
import * as THREE from 'three';
/**
 * Represents a relation between two objects in the solver state
 */
export class RelationState {
    constructor(relation, targetName, childPlaneIdx, parentPlaneIdx, value // Shapely MultiLineString equivalent
    ) {
        this.relation = relation;
        this.targetName = targetName;
        this.childPlaneIdx = childPlaneIdx;
        this.parentPlaneIdx = parentPlaneIdx;
        this.value = value;
    }
}
/**
 * Represents an object's state in the solver
 */
export class ObjectState {
    constructor() {
        this.obj = null;
        this.polygon = null; // Shapely Polygon equivalent
        this.generator = null; // AssetFactory equivalent
        this.tags = new Set();
        this.relations = [];
        // Degrees of freedom for continuous optimization
        this.dofMatrixTranslation = null;
        this.dofRotationAxis = null;
        // Cached pose affect score
        this._poseAffectsScore = null;
        // Collision objects (FCL or three.js)
        this.fclObj = null;
        this.colObj = null;
        // Whether this object is active for current greedy stage
        this.active = true;
        this.dofMatrixTranslation = new THREE.Vector3();
        this.dofRotationAxis = new THREE.Vector3(0, 1, 0);
    }
    /**
     * Check for tag contradictions and negated relations
     */
    validate() {
        // Check for contradictory tags (e.g., both "Chair" and "Table")
        const tagList = Array.from(this.tags);
        const semanticTags = tagList.filter(t => typeof t === 'string' && !t.startsWith('!'));
        // Simple contradiction check: ensure no duplicate positive semantic tags
        const uniqueSemanticTags = new Set(semanticTags);
        if (uniqueSemanticTags.size !== semanticTags.length) {
            const duplicates = semanticTags.filter((tag, index) => semanticTags.indexOf(tag) !== index);
            throw new Error(`ObjectState has contradictory tags: ${duplicates.join(', ')}`);
        }
        const hasNegated = this.relations.some(r => r.relation.constructor.name === 'NegatedRelation');
        if (hasNegated) {
            throw new Error('ObjectState cannot have negated relations');
        }
    }
    toString() {
        const objName = this.obj?.name ?? null;
        return `ObjectState(obj.name=${objName}, polygon=${this.polygon}, tags=${Array.from(this.tags)}, relations=${this.relations.length})`;
    }
}
/**
 * Main solver state container
 */
export class State {
    constructor() {
        this.objs = new Map();
        this.trimeshScene = null; // Trimesh scene equivalent
        this.graphs = []; // RoomGraph array
        this.bvhCache = new Map();
        this.planes = null; // Planes object
    }
    /**
     * Get object by key
     */
    get(key) {
        return this.objs.get(key);
    }
    /**
     * Set object
     */
    set(key, value) {
        this.objs.set(key, value);
    }
    /**
     * Delete object
     */
    delete(key) {
        return this.objs.delete(key);
    }
    /**
     * Get number of objects
     */
    get size() {
        return this.objs.size;
    }
    /**
     * Get all active object names
     */
    getActiveObjectNames() {
        const result = [];
        for (const [name, obj] of this.objs.entries()) {
            if (obj.active) {
                result.push(name);
            }
        }
        return result;
    }
    /**
     * Convert to JSON-serializable format
     */
    toJSON() {
        return {
            objs: Array.from(this.objs.entries()).map(([name, obj]) => ({
                name,
                tags: Array.from(obj.tags),
                active: obj.active,
                relations: obj.relations.map(r => ({
                    relation: r.relation.constructor.name,
                    targetName: r.targetName,
                    childPlaneIdx: r.childPlaneIdx,
                    parentPlaneIdx: r.parentPlaneIdx
                }))
            })),
            graphCount: this.graphs.length,
            bvhCacheSize: this.bvhCache.size
        };
    }
    /**
     * Create state from JSON
     */
    static fromJSON(data) {
        const state = new State();
        for (const objData of data.objs) {
            const objState = new ObjectState();
            objState.tags = new Set(objData.tags);
            objState.active = objData.active;
            // Reconstruct relations with proper relation objects
            objState.relations = objData.relations.map((r) => {
                // Create a basic relation object based on type name
                const relationType = r.relation;
                // Create a minimal relation object that can be evaluated
                let relation;
                switch (relationType) {
                    case 'Touching':
                        relation = { type: 'Touching' };
                        break;
                    case 'SupportedBy':
                        relation = { type: 'SupportedBy' };
                        break;
                    case 'CoPlanar':
                        relation = { type: 'CoPlanar' };
                        break;
                    case 'StableAgainst':
                        relation = { type: 'StableAgainst' };
                        break;
                    case 'Facing':
                        relation = { type: 'Facing' };
                        break;
                    case 'Between':
                        relation = { type: 'Between' };
                        break;
                    case 'AccessibleFrom':
                        relation = { type: 'AccessibleFrom' };
                        break;
                    case 'ReachableFrom':
                        relation = { type: 'ReachableFrom' };
                        break;
                    case 'InFrontOf':
                        relation = { type: 'InFrontOf' };
                        break;
                    case 'Aligned':
                        relation = { type: 'Aligned' };
                        break;
                    case 'Hidden':
                        relation = { type: 'Hidden' };
                        break;
                    case 'Visible':
                        relation = { type: 'Visible' };
                        break;
                    case 'Grouped':
                        relation = { type: 'Grouped' };
                        break;
                    case 'Distributed':
                        relation = { type: 'Distributed' };
                        break;
                    case 'Coverage':
                        relation = { type: 'Coverage' };
                        break;
                    case 'SupportCoverage':
                        relation = { type: 'SupportCoverage' };
                        break;
                    case 'Stability':
                        relation = { type: 'Stability' };
                        break;
                    case 'Containment':
                        relation = { type: 'Containment' };
                        break;
                    case 'Proximity':
                        relation = { type: 'Proximity' };
                        break;
                    default:
                        // Fallback for unknown relation types
                        relation = { type: relationType };
                }
                return new RelationState(relation, r.targetName, r.childPlaneIdx, r.parentPlaneIdx);
            });
            state.objs.set(objData.name, objState);
        }
        return state;
    }
}
/**
 * Check if an object's pose affects the constraint score
 * This is used to optimize solving by skipping objects that don't affect violations
 */
export function poseAffectsScore(state, objName) {
    const obj = state.objs.get(objName);
    if (!obj)
        return false;
    if (obj._poseAffectsScore !== null) {
        return obj._poseAffectsScore;
    }
    // An object's pose affects the score if:
    // 1. It has relations that depend on position/orientation
    // 2. It's involved in geometric constraints
    const poseDependentRelations = [
        'Touching', 'SupportedBy', 'CoPlanar', 'StableAgainst',
        'Facing', 'Between', 'InFrontOf', 'Aligned',
        'Hidden', 'Visible', 'Containment', 'Proximity'
    ];
    for (const rel of obj.relations) {
        const relType = rel.relation.constructor.name;
        if (poseDependentRelations.includes(relType)) {
            obj._poseAffectsScore = true;
            return true;
        }
    }
    // Also check if any other object has a relation targeting this object
    for (const [otherName, otherObj] of state.objs.entries()) {
        if (otherName === objName)
            continue;
        for (const rel of otherObj.relations) {
            if (rel.targetName === objName) {
                const relType = rel.relation.constructor.name;
                if (poseDependentRelations.includes(relType)) {
                    obj._poseAffectsScore = true;
                    return true;
                }
            }
        }
    }
    // If no pose-dependent relations found, pose doesn't affect score
    obj._poseAffectsScore = false;
    return false;
}
//# sourceMappingURL=state.js.map