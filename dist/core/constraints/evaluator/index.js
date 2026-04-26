/**
 * Evaluator Module - Constraint Evaluation Engine
 *
 * Exports all evaluator components for constraint satisfaction checking.
 */
// Core evaluation engine
export { evaluateNode, evaluateProblem, violCount, relevant, EvalResult } from './evaluate.js';
// Domain membership testing
export { domainContains, objKeysInDom } from './domain-contains.js';
// Memoization and cache management
export { memoKey, evictMemoForObj, evictMemoForMove, resetBVHCache } from './eval-memo.js';
// State definitions
export { State, ObjectState, RelationState, poseAffectsScore } from './state.js';
// Node implementations for geometry-based relations
export { nodeImpls, registerNodeImpl, registerGeometryNodeImpls, defaultHandler } from './node-impl/index.js';
// Geometry relation evaluators
export { evaluateDistance, evaluateTouching, evaluateSupportedBy, evaluateStableAgainst, evaluateCoverage, evaluateCoPlanar, evaluateFacing, evaluateAccessibleFrom, evaluateVisible, evaluateHidden, geometryNodeImpls } from './node-impl/trimesh-geometry.js';
//# sourceMappingURL=index.js.map