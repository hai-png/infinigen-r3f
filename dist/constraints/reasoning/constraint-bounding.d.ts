import { ScalarExpression } from './expression';
import { Domain } from '../constraints/reasoning/domain';
import { ScalarOperatorExpression } from './constants';
/**
 * Bound representation for constraint bounding analysis
 */
export interface Bound {
    domain?: Domain;
    low?: number;
    high?: number;
}
/**
 * Create a bound from a comparison operation
 */
export declare function createBoundFromComparison(opFunc: string, lhs: (() => number) | ScalarExpression, rhs: (() => number) | ScalarExpression): Bound;
/**
 * Map a bound through a binary operation
 */
export declare function mapBound(bound: Bound, func: (a: number, b: number) => number, lhs?: number, rhs?: number): Bound;
/**
 * Map bounds through scalar operator expressions
 */
export declare function expressionMapBoundBinop(node: ScalarOperatorExpression, bound: Bound): Bound[];
/**
 * Map bounds through expressions
 */
export declare function expressionMapBound(node: any, bound: Bound): Bound[];
/**
 * Evaluate expressions with known variables
 */
export declare function evaluateKnownVars(node: any, knownVars: Array<[Domain, number]>): number | null;
/**
 * Extract bounds from constraints
 */
export declare function constraintBounds(node: any, state?: any): Bound[];
/**
 * Check if a bound is valid (has at least one bound defined)
 */
export declare function isValidBound(bound: Bound): boolean;
/**
 * Intersect two bounds
 */
export declare function intersectBounds(a: Bound, b: Bound): Bound;
/**
 * Union two bounds
 */
export declare function unionBounds(a: Bound, b: Bound): Bound;
/**
 * Check if a value satisfies a bound
 */
export declare function satisfiesBound(value: number, bound: Bound): boolean;
//# sourceMappingURL=constraint-bounding.d.ts.map