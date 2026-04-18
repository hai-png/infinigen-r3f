/**
 * Evaluator Module - Constraint Evaluation Engine
 * 
 * Exports all evaluator components for constraint satisfaction checking.
 */

// Core evaluation engine
export {
  evaluateNode,
  evaluateProblem,
  violCount,
  relevant,
  EvalResult
} from './evaluate.js';

// Domain membership testing
export {
  domainContains,
  objKeysInDom
} from './domain-contains.js';

// Memoization and cache management
export {
  memoKey,
  evictMemoForObj,
  evictMemoForMove,
  resetBVHCache
} from './eval-memo.js';

// State definitions
export {
  State,
  ObjectState,
  RelationState,
  BVHCacheEntry,
  poseAffectsScore
} from './state.js';
