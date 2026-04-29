/**
 * Evaluator Module - Constraint Evaluation Engine
 *
 * Exports all evaluator components for constraint satisfaction checking.
 */
export { evaluateNode, evaluateProblem, violCount, relevant, EvalResult } from './evaluate.js';
export { domainContains, objKeysInDom } from './domain-contains.js';
export { memoKey, evictMemoForObj, evictMemoForMove, resetBVHCache } from './eval-memo.js';
export { State, ObjectState, RelationState, BVHCacheEntry, poseAffectsScore } from './state.js';
export { nodeImpls, registerNodeImpl, registerGeometryNodeImpls, defaultHandler } from './node-impl/index.js';
export { evaluateDistance, evaluateTouching, evaluateSupportedBy, evaluateStableAgainst, evaluateCoverage, evaluateCoPlanar, evaluateFacing, evaluateAccessibleFrom, evaluateVisible, evaluateHidden, geometryNodeImpls } from './node-impl/trimesh-geometry.js';
//# sourceMappingURL=index.d.ts.map