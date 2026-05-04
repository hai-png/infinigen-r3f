# BVH Spatial Queries for Constraints - Implementation Record

## Task ID
Phase 2, Item 4: BVH Spatial Queries for Constraints

## Summary
Implemented BVH-accelerated spatial query module and upgraded trimesh-geometry evaluator to use precise mesh-based queries instead of AABB bounding-box approximations.

## Files Created
- `src/core/constraints/evaluator/bvh-queries.ts` — New BVH spatial query engine module

## Files Modified
- `src/core/constraints/evaluator/node-impl/trimesh-geometry.ts` — Upgraded all evaluation functions to use BVH queries
- `src/core/constraints/evaluator/GeometryCosts.ts` — Added BVH-enhanced cost functions
- `src/core/constraints/evaluator/index.ts` — Updated exports for new functions

## Implementation Details

### Step 1: BVH Query Module (`bvh-queries.ts`)
- **BVHQueryEngine class** with lazy BVH construction and caching by object UUID
- Cache invalidation on object movement (matrixWorld comparison)
- Methods implemented:
  - `minDistance(objA, objB)` — Precise mesh-to-mesh distance via `closestPointToGeometry`
  - `anyTouching(objA, objB, tolerance?)` — Triangle-level collision via `intersectsGeometry` + distance tolerance
  - `contains(objA, objB)` — Raycasting-based containment check (Fibonacci sphere ray directions)
  - `hasLineOfSight(from, to, obstacles?)` — BVH raycast occluder check
  - `accessibilityCostCuboidPenetration(objA, objB, normalDir, dist)` — Extruded bbox penetration via BVH shapecast
  - `closestPointOnSurface(obj, point)` — BVH `closestPointToPoint`
  - `raycast(origin, direction, maxDist?, objects?)` — Multi-object BVH raycasting
  - `invalidateCache(objId?)` — Stale BVH data cleanup
- All methods fall back to AABB approximations with console warnings when mesh data is unavailable
- World-space geometry transformation handled correctly (clone + applyMatrix4)
- Module-level singleton pattern with `getDefaultBVHEngine()`, `setDefaultBVHEngine()`, `resetDefaultBVHEngine()`

### Step 2: Upgraded trimesh-geometry.ts
All evaluation functions now attempt BVH queries first, falling back to AABB:
- `evaluateDistance()` — Uses `bvhEngine.minDistance()` for precise mesh distance
- `evaluateTouching()` — Uses `bvhEngine.anyTouching()` for precise collision detection
- `evaluateSupportedBy()` — Uses `bvhEngine.closestPointOnSurface()` for actual contact points
- `evaluateStableAgainst()` — Uses BVH raycasting downward to find actual support surfaces
- `evaluateCoverage()` — Uses BVH raycasting from grid of points on obj2 surface
- `evaluateCoPlanar()` — Uses BVH surface normal sampling via closestPointOnSurface
- `evaluateFacing()` — Enhanced with BVH line-of-sight visibility check
- `evaluateAccessibleFrom()` — Uses `bvhEngine.hasLineOfSight()` for actual line-of-sight checks
- `evaluateVisible()` — Uses BVH raycasting to check for occluders
- **NEW** `evaluateHasLineOfSight()` — Direct BVH line-of-sight check
- **NEW** `evaluateContains()` — BVH raycasting-based containment check

### Step 3: Updated GeometryCosts.ts
Three new BVH-enhanced cost functions:
- `accessibility_cost_bvh()` — Uses actual BVH raycasting instead of point-based obstacle approximation
- `clearance_cost_bvh()` — Uses BVH raycasting for mesh-accurate clearance measurement
- `path_obstruction_cost_bvh()` — Uses BVH raycasting along path segments for precise obstruction cost

## Type Safety
- All code compiles with zero TypeScript errors in modified files
- Pre-existing errors in other files (BrushedMetalShader.ts, NURBSToArmature.ts) are unrelated
- No lint errors in any modified files
