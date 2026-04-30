/**
 * Solver State - Re-export from evaluator/state for compatibility
 * 
 * Files importing from '../constraints/solver/state' or './state'
 * will resolve here and get the State type from evaluator.
 */

export { State, ObjectState, RelationState, BVHCacheEntry } from '../evaluator/state';
