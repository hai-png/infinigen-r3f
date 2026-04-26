/**
 * Constraint Evaluator - Main Evaluation Engine
 *
 * Ports: infinigen/core/constraints/evaluator/evaluate.py
 *
 * Evaluates constraint language nodes against solver state.
 * Supports loss computation, violation counting, and memoization.
 */
import { Node, Problem } from '../language/types.js';
import { Domain } from '../constraints/reasoning/domain.js';
import { State } from './state.js';
/**
 * Compute the value of a constraint node
 */
declare function computeNodeVal(node: Node, state: State, memo: Map<any, any>): any;
/**
 * Check if a node is relevant to a given domain filter
 */
export declare function relevant(node: Node, filter: Domain | null): boolean;
/**
 * Count constraint violations
 */
export declare function violCount(node: Node, state: State, memo: Map<any, any>, filter?: Domain | null): number;
/**
 * Evaluate a single node with memoization
 */
export declare function evaluateNode(node: Node, state: State, memo?: Map<any, any> | null): any;
/**
 * Result of evaluating a problem
 */
export declare class EvalResult {
    lossVals: Map<string, number>;
    violations: Map<string, boolean>;
    constructor(lossVals: Map<string, number>, violations: Map<string, boolean>);
    loss(): number;
    violCount(): number;
    toDF(): any;
    [Symbol.iterator](): Generator<number, void, unknown>;
}
/**
 * Evaluate an entire constraint problem
 */
export declare function evaluateProblem(problem: Problem, state: State, filter?: Domain | null, memo?: Map<any, any> | null, enableLoss?: boolean, enableViolated?: boolean): EvalResult;
export { computeNodeVal };
//# sourceMappingURL=evaluate.d.ts.map