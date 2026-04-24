/**
 * Evaluation Memoization
 *
 * Ports: infinigen/core/constraints/evaluator/eval_memo.py
 *
 * Manages memoization cache for constraint evaluation.
 * Handles cache invalidation when objects move or change.
 */
import { Node, Problem } from '../language/types.js';
import { State, ObjectState } from './state.js';
import { Move } from '../constraints/solver/moves.js';
/**
 * Generate a memoization key for a node
 */
export declare function memoKey(n: Node): any;
/**
 * Evict memo entries related to a specific object
 */
export declare function evictMemoForObj(node: Problem, memo: Map<any, any>, obj: ObjectState): boolean;
/**
 * Reset BVH cache for moved objects
 */
export declare function resetBVHCache(state: State, filterName?: string): void;
/**
 * Evict memo entries after applying a move
 */
export declare function evictMemoForMove(problem: Problem, state: State, memo: Map<any, any>, move: Move): void;
//# sourceMappingURL=eval-memo.d.ts.map