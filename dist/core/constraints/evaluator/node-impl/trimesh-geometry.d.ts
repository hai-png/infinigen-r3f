/**
 * Trimesh Geometry Node Implementations
 *
 * Ports: infinigen/core/constraints/evaluator/node_impl/trimesh_geometry.py
 *
 * Implements evaluation logic for geometry-based relations using three.js mesh operations.
 * Includes: Distance, Touching, SupportedBy, StableAgainst, Coverage, etc.
 */
import { Relation } from '../../language/relations.js';
import { State } from '../state.js';
/**
 * Compute distance between two objects
 * Uses simplified bounding box distance for performance
 */
export declare function evaluateDistance(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
/**
 * Check if two objects are touching
 * Returns 0 if touching, positive value if separated
 */
export declare function evaluateTouching(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
/**
 * Check if obj1 is supported by obj2
 * Considers vertical positioning and contact
 */
export declare function evaluateSupportedBy(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
/**
 * Check if obj1 is stable against obj2
 * Simplified stability check based on center of mass projection
 */
export declare function evaluateStableAgainst(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
/**
 * Evaluate coverage of obj1 over obj2
 * Returns ratio of covered area
 */
export declare function evaluateCoverage(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
/**
 * Check if objects are coplanar
 * Compares surface normals and positions
 */
export declare function evaluateCoPlanar(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
/**
 * Check if obj1 is facing obj2
 * Uses object orientation and direction vectors
 */
export declare function evaluateFacing(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
/**
 * Check if obj1 is accessible from obj2
 * Simplified line-of-sight check
 */
export declare function evaluateAccessibleFrom(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
/**
 * Check if object is visible from camera/viewpoint
 * Placeholder for raycasting implementation
 */
export declare function evaluateVisible(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
/**
 * Check if object is hidden from view
 */
export declare function evaluateHidden(node: Relation, state: State, childVals: Map<string, any>, kwargs: any): number;
export declare const geometryNodeImpls: {
    Distance: typeof evaluateDistance;
    Touching: typeof evaluateTouching;
    SupportedBy: typeof evaluateSupportedBy;
    StableAgainst: typeof evaluateStableAgainst;
    Coverage: typeof evaluateCoverage;
    CoPlanar: typeof evaluateCoPlanar;
    Facing: typeof evaluateFacing;
    AccessibleFrom: typeof evaluateAccessibleFrom;
    Visible: typeof evaluateVisible;
    Hidden: typeof evaluateHidden;
};
//# sourceMappingURL=trimesh-geometry.d.ts.map