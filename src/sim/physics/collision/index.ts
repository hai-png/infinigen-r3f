/**
 * Collision Detection Submodule
 *
 * Provides collision detection algorithms and collider types:
 * - BroadPhase: Broad-phase collision detection
 * - NarrowPhase: Narrow-phase collision detection
 * - CollisionFilter: Layer-based collision filtering
 * - GJK/EPA: GJK intersection and EPA penetration algorithms
 * - ContactGeneration: Multi-contact manifold generation
 * - Quickhull: Convex hull computation for physics colliders
 * - TrimeshCollider: BVH-accelerated triangle mesh collider
 *
 * @module sim/physics/collision
 */

// Broad-phase
export { BroadPhase } from './BroadPhase';
export type { BroadPhasePair } from './BroadPhase';

// Narrow-phase
export { NarrowPhase } from './NarrowPhase';
export type { CollisionPair, ContactPoint } from './NarrowPhase';

// Collision filtering
export { CollisionFilter } from './CollisionFilter';

// GJK/EPA collision detection
export {
  gjkIntersect,
  epaPenetration,
  minkowskiSupport,
  detectCollisionGJK,
  getSupportFunction,
  boxSupport,
  sphereSupport,
  cylinderSupport,
  capsuleSupport,
} from './GJK';
export type { SupportFunction, GJKResult, EPAResult } from './GJK';

// Contact generation
export {
  ContactManifold,
  ContactManifoldCache,
  generateBoxBoxContacts,
  generateSphereBoxContacts,
  generateGJKContacts,
  generateContacts,
} from './ContactGeneration';

// Quickhull convex hull algorithm
export {
  computeConvexHull,
  convexHullSupport,
  createConvexHullSupportFn,
  computeConvexHullFromGeometry,
  computeConvexHullFromFloat32Array,
} from './Quickhull';
export type { HullFace, HullEdge, QuickhullResult } from './Quickhull';

// BVH-accelerated triangle mesh collider
export { TrimeshCollider } from './TrimeshCollider';
export type { TrimeshCollisionResult, TrimeshRayResult } from './TrimeshCollider';
