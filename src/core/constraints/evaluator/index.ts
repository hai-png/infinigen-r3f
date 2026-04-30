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
} from './evaluate';

// Domain membership testing
export {
  domainContains,
  objKeysInDom
} from './domain-contains';

// Memoization and cache management
export {
  memoKey,
  evictMemoForObj,
  evictMemoForMove,
  resetBVHCache
} from './eval-memo';

// State definitions
export {
  State,
  ObjectState,
  RelationState,
  BVHCacheEntry,
  poseAffectsScore
} from './state';

// Node implementations for geometry-based relations
export {
  nodeImpls,
  registerNodeImpl,
  registerGeometryNodeImpls,
  defaultHandler
} from './node-impl/index';

// Geometry relation evaluators
export {
  evaluateDistance,
  evaluateTouching,
  evaluateSupportedBy,
  evaluateStableAgainst,
  evaluateCoverage,
  evaluateCoPlanar,
  evaluateFacing,
  evaluateAccessibleFrom,
  evaluateVisible,
  evaluateHidden,
  geometryNodeImpls
} from './node-impl/trimesh-geometry';
