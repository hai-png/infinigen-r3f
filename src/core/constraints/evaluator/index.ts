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
  type BVHCacheEntry,
  poseAffectsScore
} from './state';

// Node implementations for geometry-based relations
export {
  nodeImpls,
  registerNodeImpl,
  registerGeometryNodeImpls,
  defaultHandler
} from './node-impl/index';

// BVH Spatial Query Engine
export {
  BVHQueryEngine,
  getDefaultBVHEngine,
  setDefaultBVHEngine,
  resetDefaultBVHEngine,
  type ClosestPointResult,
  type RaycastResult as BVHRaycastResult,
} from './bvh-queries';

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
  evaluateHasLineOfSight,
  evaluateContains,
  geometryNodeImpls
} from './node-impl/trimesh-geometry';

// Geometry Cost Functions
export {
  distance as geometryDistance,
  accessibility_cost,
  center_stable_surface_dist,
  freespace_2d,
  coplanarity_cost,
  volume as geometryVolume,
  min_dist_2d,
  rotational_asymmetry,
  reflectional_asymmetry,
  clearance_cost,
  path_obstruction_cost,
  accessibility_cost_bvh,
  clearance_cost_bvh,
  path_obstruction_cost_bvh,
} from './GeometryCosts';

// BVH Collision Manager (trimesh.collision.CollisionManager equivalent)
export {
  BVHCollisionManager,
  getDefaultCollisionManager,
  setDefaultCollisionManager,
  resetDefaultCollisionManager,
  type CollisionQueryResult,
  type ContainmentResult,
  type AccessibilityCostResult,
} from './bvh-collision';
