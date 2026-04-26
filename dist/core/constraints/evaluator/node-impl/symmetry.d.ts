/**
 * Symmetry Constraints Module
 *
 * Implements symmetry-based relation evaluators.
 * Ported from: infinigen/core/constraints/evaluator/node_impl/symmetry.py
 *
 * Relations implemented:
 * - Symmetric: Objects arranged symmetrically around an axis/plane
 * - Aligned: Objects aligned along a direction
 * - Distributed: Objects evenly distributed in a region
 */
import { RelationNode } from '../../language/types.js';
import { State } from '../state.js';
import * as THREE from 'three';
/**
 * Symmetry constraint result
 */
export interface SymmetryResult {
    satisfied: boolean;
    loss: number;
    /** Axis or plane of symmetry */
    symmetryAxis?: THREE.Vector3;
    symmetryPlane?: {
        normal: THREE.Vector3;
        point: THREE.Vector3;
    };
    /** Pairs of symmetric objects */
    symmetricPairs?: Array<[string, string]>;
}
/**
 * Registry of symmetry node implementations
 */
export declare const symmetryNodeImpls: Map<string, Function>;
/**
 * Evaluate Symmetric relation
 *
 * Checks if objects are arranged symmetrically around an axis or plane.
 * Uses bounding box centers for efficiency.
 *
 * @param node - Symmetric relation node
 * @param state - Current solver state
 * @param childVals - Evaluated child values
 * @param kwargs - Additional parameters
 * @returns SymmetryResult with satisfaction and loss
 */
export declare function evaluateSymmetric(node: RelationNode, state: State, childVals: Map<string, any>, kwargs?: any): SymmetryResult;
/**
 * Evaluate Aligned relation
 *
 * Checks if objects are aligned along a common direction.
 *
 * @param node - Aligned relation node
 * @param state - Current solver state
 * @param childVals - Evaluated child values
 * @param kwargs - Additional parameters
 */
export declare function evaluateAligned(node: RelationNode, state: State, childVals: Map<string, any>, kwargs?: any): {
    satisfied: boolean;
    loss: number;
    direction?: THREE.Vector3;
};
/**
 * Evaluate Distributed relation
 *
 * Checks if objects are evenly distributed in a region.
 *
 * @param node - Distributed relation node
 * @param state - Current solver state
 * @param childVals - Evaluated child values
 * @param kwargs - Additional parameters
 */
export declare function evaluateDistributed(node: RelationNode, state: State, childVals: Map<string, any>, kwargs?: any): {
    satisfied: boolean;
    loss: number;
    distribution?: 'uniform' | 'grid' | 'random';
};
//# sourceMappingURL=symmetry.d.ts.map