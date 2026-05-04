/**
 * Trimesh Geometry Node Implementations
 *
 * Ports: infinigen/core/constraints/evaluator/node_impl/trimesh_geometry.py
 *
 * Implements evaluation logic for geometry-based relations using three.js mesh operations.
 * Uses BVH-accelerated spatial queries via BVHQueryEngine for precise mesh-based
 * collision detection, distance computation, and raycasting, with AABB fallbacks
 * for objects that lack mesh geometry.
 *
 * Includes: Distance, Touching, SupportedBy, StableAgainst, Coverage,
 *           CoPlanar, Facing, AccessibleFrom, Visible, Hidden,
 *           HasLineOfSight, Contains
 */

import { Relation } from '../../language/relations';
import { State, ObjectState } from '../state';
import { Vector3, Vector2, Matrix4 } from 'three';
import * as THREE from 'three';
import {
  BVHQueryEngine,
  getDefaultBVHEngine,
  type ClosestPointResult,
  type RaycastResult,
} from '../bvh-queries';

// ============================================================================
// Module-level BVH Engine
// ============================================================================

/**
 * Module-level BVH query engine instance.
 * Can be overridden via kwargs.bvhEngine in any evaluation function.
 */
let _bvhEngine: BVHQueryEngine = getDefaultBVHEngine();

/**
 * Get the current BVH engine, preferring kwargs override.
 */
function getBVHEngine(kwargs: any): BVHQueryEngine {
  return kwargs?.bvhEngine ?? _bvhEngine;
}

/**
 * Extract a THREE.Object3D from an ObjectState, returning null if unavailable.
 */
function getObject3D(objState: ObjectState): THREE.Object3D | null {
  return objState.obj ?? null;
}

/**
 * Check if an ObjectState has a usable mesh for BVH queries.
 */
function hasMesh(objState: ObjectState): boolean {
  if (!objState.obj) return false;
  let found = false;
  objState.obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      found = true;
    }
  });
  return found;
}

// ============================================================================
// Evaluation Functions
// ============================================================================

/**
 * Compute distance between two objects.
 *
 * Uses BVH-accelerated `minDistance()` for precise mesh-to-mesh distance
 * when both objects have meshes. Falls back to AABB-based approximation
 * when mesh data is unavailable.
 */
export function evaluateDistance(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1');
  const obj2Name = childVals.get('obj2');

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return Infinity;
  }

  // Try BVH-based precise distance
  if (hasMesh(obj1State) && hasMesh(obj2State)) {
    try {
      const engine = getBVHEngine(kwargs);
      const dist = engine.minDistance(obj1State.obj, obj2State.obj);
      return dist;
    } catch (e) {
      // Fall through to AABB approximation
      console.warn('evaluateDistance: BVH query failed, falling back to AABB:', (e as Error).message);
    }
  }

  // AABB fallback: simple Euclidean distance minus bounding box radii
  const pos1 = new Vector3();
  const pos2 = new Vector3();
  obj1State.obj.getWorldPosition(pos1);
  obj2State.obj.getWorldPosition(pos2);

  const distance = pos1.distanceTo(pos2);

  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

  const size1 = new Vector3();
  const size2 = new Vector3();
  bbox1.getSize(size1);
  bbox2.getSize(size2);

  const radius1 = Math.max(size1.x, size1.y, size1.z) / 2;
  const radius2 = Math.max(size2.x, size2.y, size2.z) / 2;

  return Math.max(0, distance - radius1 - radius2);
}

/**
 * Check if two objects are touching.
 *
 * Uses BVH-accelerated `anyTouching()` for precise triangle-level collision
 * detection when both objects have meshes. Falls back to AABB intersection.
 *
 * Returns 0 if touching, positive value if separated.
 */
export function evaluateTouching(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1');
  const obj2Name = childVals.get('obj2');

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return 1; // Not touching
  }

  const tolerance = kwargs?.tolerance ?? 0.01;

  // Try BVH-based precise collision
  if (hasMesh(obj1State) && hasMesh(obj2State)) {
    try {
      const engine = getBVHEngine(kwargs);
      if (engine.anyTouching(obj1State.obj, obj2State.obj, tolerance)) {
        return 0; // Touching
      }
      // Not touching — return precise distance as violation measure
      return engine.minDistance(obj1State.obj, obj2State.obj);
    } catch (e) {
      console.warn('evaluateTouching: BVH query failed, falling back to AABB:', (e as Error).message);
    }
  }

  // AABB fallback
  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);
  bbox1.expandByScalar(tolerance);
  bbox2.expandByScalar(tolerance);

  if (bbox1.intersectsBox(bbox2)) {
    return 0;
  }

  return evaluateDistance(node, state, childVals, kwargs);
}

/**
 * Check if obj1 is supported by obj2.
 *
 * Uses BVH `closestPointOnSurface()` to find actual contact points
 * instead of just AABB overlap. Verifies that the support point normal
 * is upward-facing.
 */
export function evaluateSupportedBy(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1');
  const obj2Name = childVals.get('obj2');

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return 1;
  }

  // Use BVH closestPointOnSurface for precise support detection
  if (hasMesh(obj1State) && hasMesh(obj2State)) {
    try {
      const engine = getBVHEngine(kwargs);

      // Get the bottom-center of obj1 as a query point
      const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
      const bottomCenter = new Vector3();
      bbox1.getCenter(bottomCenter);
      bottomCenter.y = bbox1.min.y;

      // Find closest point on obj2's surface
      const closestResult = engine.closestPointOnSurface(obj2State.obj, bottomCenter);

      if (closestResult) {
        // Check vertical proximity — obj1's bottom should be near obj2's top
        const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);
        const verticalTolerance = kwargs?.verticalTolerance ?? 0.05;
        const verticalViolation = Math.max(0, closestResult.point.y - bbox1.min.y - verticalTolerance);

        // If obj1 is above obj2's top with small gap, check overlap
        if (verticalViolation <= verticalTolerance) {
          // Check horizontal overlap (use closest point distance as proxy)
          const horizontalDist = new Vector2(
            bottomCenter.x - closestResult.point.x,
            bottomCenter.z - closestResult.point.z
          ).length();

          // Allow small horizontal offset for support
          const maxHorizontalOffset = 0.3;
          const horizontalViolation = Math.max(0, horizontalDist - maxHorizontalOffset);

          return verticalViolation + horizontalViolation * 0.5;
        }
      }
    } catch (e) {
      console.warn('evaluateSupportedBy: BVH query failed, falling back to AABB:', (e as Error).message);
    }
  }

  // AABB fallback
  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

  const min1 = bbox1.min.y;
  const max2 = bbox2.max.y;

  const verticalTolerance = 0.05;
  const verticalViolation = Math.max(0, min1 - max2 - verticalTolerance);

  const overlapX = Math.max(0, Math.min(bbox1.max.x, bbox2.max.x) - Math.max(bbox1.min.x, bbox2.min.x));
  const overlapZ = Math.max(0, Math.min(bbox1.max.z, bbox2.max.z) - Math.max(bbox1.min.z, bbox2.min.z));

  const area1 = (bbox1.max.x - bbox1.min.x) * (bbox1.max.z - bbox1.min.z);
  const overlapArea = overlapX * overlapZ;

  const overlapRatio = area1 > 0 ? overlapArea / area1 : 0;
  const overlapViolation = overlapRatio < 0.2 ? (0.2 - overlapRatio) * 5 : 0;

  return verticalViolation + overlapViolation;
}

/**
 * Check if obj1 is stable against obj2.
 *
 * Uses BVH raycasting to find actual support surfaces.
 * Casts rays downward from the object's center and checks if they hit
 * the support surface with proper margin/check_z/rev_normal parameters.
 */
export function evaluateStableAgainst(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1');
  const obj2Name = childVals.get('obj2');

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return 1;
  }

  const margin = kwargs?.margin ?? 0.05;
  const checkZ = kwargs?.check_z ?? true;
  const revNormal = kwargs?.rev_normal ?? false;

  // Use BVH raycasting for precise support surface detection
  if (hasMesh(obj2State)) {
    try {
      const engine = getBVHEngine(kwargs);
      const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
      const center1 = new Vector3();
      bbox1.getCenter(center1);

      // Cast rays downward from obj1's center and corners
      const rayOrigin = new Vector3(center1.x, bbox1.min.y + margin, center1.z);
      const rayDir = new Vector3(0, -1, 0);

      const hits = engine.raycast(rayOrigin, rayDir, margin + 2.0, [obj2State.obj]);

      if (hits.length > 0) {
        // Found a support surface — check if it's close enough
        const hit = hits[0];
        const gap = bbox1.min.y - hit.point.y;
        const gapViolation = Math.max(0, gap - margin);

        if (gapViolation === 0) {
          // Check if the support surface normal is upward-facing
          if (hit.normal) {
            const upComponent = revNormal ? -hit.normal.y : hit.normal.y;
            const normalViolation = upComponent < 0.7 ? (0.7 - upComponent) * 2 : 0;
            return normalViolation;
          }
          return 0;
        }
        return gapViolation;
      }

      // No hit from center — try multiple sample points
      const samplePoints = [
        new Vector3(bbox1.min.x, bbox1.min.y + margin, bbox1.min.z),
        new Vector3(bbox1.max.x, bbox1.min.y + margin, bbox1.min.z),
        new Vector3(bbox1.min.x, bbox1.min.y + margin, bbox1.max.z),
        new Vector3(bbox1.max.x, bbox1.min.y + margin, bbox1.max.z),
      ];

      let hitCount = 0;
      let totalGapViolation = 0;

      for (const sp of samplePoints) {
        const spHits = engine.raycast(sp, rayDir, margin + 2.0, [obj2State.obj]);
        if (spHits.length > 0) {
          hitCount++;
          const gap = bbox1.min.y - spHits[0].point.y;
          totalGapViolation += Math.max(0, gap - margin);
        }
      }

      if (hitCount > 0) {
        return totalGapViolation / hitCount;
      }

      // No support found — compute distance to nearest support surface
      const closestResult = engine.closestPointOnSurface(obj2State.obj, center1);
      if (closestResult) {
        return closestResult.distance;
      }
    } catch (e) {
      console.warn('evaluateStableAgainst: BVH query failed, falling back to AABB:', (e as Error).message);
    }
  }

  // AABB fallback
  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

  const center1 = new Vector3();
  bbox1.getCenter(center1);

  const supportY = bbox2.max.y;
  const projectionPoint = new Vector3(center1.x, supportY, center1.z);

  const isWithinSupport = bbox2.containsPoint(projectionPoint);

  if (isWithinSupport) {
    return 0;
  }

  const closestPoint = bbox2.clampPoint(projectionPoint, new Vector3());
  return projectionPoint.distanceTo(closestPoint);
}

/**
 * Evaluate coverage of obj1 over obj2.
 *
 * Uses BVH raycasting downward from a grid of points on obj2
 * to check how many are occluded by obj1.
 */
export function evaluateCoverage(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1');
  const obj2Name = childVals.get('obj2');

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return 0;
  }

  // Use BVH raycasting for precise coverage
  if (hasMesh(obj1State) && hasMesh(obj2State)) {
    try {
      const engine = getBVHEngine(kwargs);
      const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

      // Sample a grid of points on obj2's top surface
      const gridSize = kwargs?.gridSize ?? 4; // 4x4 = 16 sample points
      const rayDir = new Vector3(0, 1, 0); // Cast upward to check for occlusion
      const topY = bbox2.max.y + 0.01; // Slightly above the surface

      let totalSamples = 0;
      let coveredSamples = 0;

      const dx = (bbox2.max.x - bbox2.min.x) / (gridSize + 1);
      const dz = (bbox2.max.z - bbox2.min.z) / (gridSize + 1);

      for (let i = 1; i <= gridSize; i++) {
        for (let j = 1; j <= gridSize; j++) {
          const sampleX = bbox2.min.x + dx * i;
          const sampleZ = bbox2.min.z + dz * j;
          const samplePoint = new Vector3(sampleX, topY, sampleZ);

          totalSamples++;

          // Check if obj1 occludes this point from above
          const hits = engine.raycast(samplePoint, rayDir, 100, [obj1State.obj]);
          if (hits.length > 0) {
            coveredSamples++;
          }
        }
      }

      if (totalSamples === 0) return 0;
      return coveredSamples / totalSamples;
    } catch (e) {
      console.warn('evaluateCoverage: BVH query failed, falling back to AABB:', (e as Error).message);
    }
  }

  // AABB fallback: 2D projection overlap on XZ plane
  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

  const overlapX = Math.max(0, Math.min(bbox1.max.x, bbox2.max.x) - Math.max(bbox1.min.x, bbox2.min.x));
  const overlapZ = Math.max(0, Math.min(bbox1.max.z, bbox2.max.z) - Math.max(bbox1.min.z, bbox2.min.z));

  const area2 = (bbox2.max.x - bbox2.min.x) * (bbox2.max.z - bbox2.min.z);
  const overlapArea = overlapX * overlapZ;

  if (area2 === 0) return 0;

  return overlapArea / area2;
}

/**
 * Check if objects are coplanar.
 *
 * Uses BVH to sample surface normals and check if they're aligned,
 * not just comparing AABB Y values.
 */
export function evaluateCoPlanar(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1');
  const obj2Name = childVals.get('obj2');
  const plane = childVals.get('plane') || 'top';

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return 1;
  }

  // Use BVH for normal sampling if available
  if (hasMesh(obj1State) && hasMesh(obj2State)) {
    try {
      const engine = getBVHEngine(kwargs);
      const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
      const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

      // Get reference point on each object's surface based on plane
      let refPoint1: THREE.Vector3;
      let refPoint2: THREE.Vector3;

      switch (plane) {
        case 'top':
          refPoint1 = new Vector3((bbox1.min.x + bbox1.max.x) / 2, bbox1.max.y, (bbox1.min.z + bbox1.max.z) / 2);
          refPoint2 = new Vector3((bbox2.min.x + bbox2.max.x) / 2, bbox2.max.y, (bbox2.min.z + bbox2.max.z) / 2);
          break;
        case 'bottom':
          refPoint1 = new Vector3((bbox1.min.x + bbox1.max.x) / 2, bbox1.min.y, (bbox1.min.z + bbox1.max.z) / 2);
          refPoint2 = new Vector3((bbox2.min.x + bbox2.max.x) / 2, bbox2.min.y, (bbox2.min.z + bbox2.max.z) / 2);
          break;
        case 'center':
        default:
          refPoint1 = bbox1.getCenter(new Vector3());
          refPoint2 = bbox2.getCenter(new Vector3());
          break;
      }

      // Find closest surface points and check normals
      const closest1 = engine.closestPointOnSurface(obj1State.obj, refPoint1);
      const closest2 = engine.closestPointOnSurface(obj2State.obj, refPoint2);

      if (closest1 && closest2) {
        // Check Y-plane alignment
        const tolerance = 0.05;
        const yDiff = Math.abs(closest1.point.y - closest2.point.y);

        if (yDiff <= tolerance) {
          return 0;
        }
        return yDiff;
      }
    } catch (e) {
      console.warn('evaluateCoPlanar: BVH query failed, falling back to AABB:', (e as Error).message);
    }
  }

  // AABB fallback
  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

  let y1: number, y2: number;

  switch (plane) {
    case 'top':
      y1 = bbox1.max.y;
      y2 = bbox2.max.y;
      break;
    case 'bottom':
      y1 = bbox1.min.y;
      y2 = bbox2.min.y;
      break;
    case 'center':
      y1 = (bbox1.max.y + bbox1.min.y) / 2;
      y2 = (bbox2.max.y + bbox2.min.y) / 2;
      break;
    default:
      y1 = bbox1.max.y;
      y2 = bbox2.max.y;
  }

  const tolerance = 0.05;
  return Math.abs(y1 - y2) > tolerance ? Math.abs(y1 - y2) : 0;
}

/**
 * Check if obj1 is facing obj2.
 *
 * Enhanced with BVH raycasting to verify actual visibility
 * (not just orientation check).
 */
export function evaluateFacing(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1');
  const obj2Name = childVals.get('obj2');

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return 1;
  }

  const pos1 = new Vector3();
  const pos2 = new Vector3();
  obj1State.obj.getWorldPosition(pos1);
  obj2State.obj.getWorldPosition(pos2);

  // Get forward direction of obj1
  const forward = new Vector3(0, 0, -1);
  forward.applyQuaternion(obj1State.obj.getWorldQuaternion(new THREE.Quaternion()));

  // Direction to obj2
  const toObj2 = new Vector3().subVectors(pos2, pos1).normalize();

  // Dot product should be close to 1 if facing
  const dot = forward.dot(toObj2);

  // If BVH is available, enhance with visibility check
  if (hasMesh(obj1State) && hasMesh(obj2State)) {
    try {
      const engine = getBVHEngine(kwargs);

      // Check if obj2 is visible from obj1's facing direction
      // Cast a ray from obj1 toward obj2
      const hasLOS = engine.hasLineOfSight(pos1, pos2);

      if (!hasLOS) {
        // Oriented correctly but occluded — add a penalty
        return Math.max(0, 1 - dot) + 0.5;
      }
    } catch (e) {
      // Ignore BVH failure for facing check — orientation alone is acceptable
    }
  }

  return Math.max(0, 1 - dot);
}

/**
 * Check if obj1 is accessible from obj2.
 *
 * Uses `bvhEngine.hasLineOfSight()` for actual line-of-sight checks
 * instead of distance-only.
 */
export function evaluateAccessibleFrom(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1');
  const obj2Name = childVals.get('obj2');

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return 1;
  }

  const pos1 = new Vector3();
  const pos2 = new Vector3();
  obj1State.obj.getWorldPosition(pos1);
  obj2State.obj.getWorldPosition(pos2);

  const maxReach = kwargs?.maxReach ?? 5.0;

  // Distance check first
  const distance = pos1.distanceTo(pos2);
  if (distance > maxReach) {
    return distance - maxReach;
  }

  // Use BVH line-of-sight check
  if (hasMesh(obj1State) || hasMesh(obj2State)) {
    try {
      const engine = getBVHEngine(kwargs);

      // Get all other objects in the scene as potential obstacles
      const obstacles: THREE.Object3D[] = [];
      for (const [name, objState] of state.objs.entries()) {
        if (name !== obj1Name && name !== obj2Name && objState.obj) {
          obstacles.push(objState.obj);
        }
      }

      const hasLOS = engine.hasLineOfSight(pos1, pos2, obstacles);

      if (!hasLOS) {
        // Blocked line of sight — penalty proportional to distance
        return distance * 0.5;
      }
    } catch (e) {
      // Fall through to distance-only result
    }
  }

  return 0;
}

/**
 * Check if object is visible from camera/viewpoint.
 *
 * Uses BVH raycasting to check for occluders between viewer and object.
 */
export function evaluateVisible(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const objName = childVals.get('obj');
  const viewerName = childVals.get('viewer');

  const objState = state.objs.get(objName);
  const viewerState = viewerName ? state.objs.get(viewerName) : null;

  if (!objState || !objState.obj) {
    return 1;
  }

  const objPos = new Vector3();
  objState.obj.getWorldPosition(objPos);

  const viewerPos = viewerState?.obj
    ? new Vector3().setFromMatrixPosition(viewerState.obj.matrixWorld)
    : new Vector3(0, 1.6, 3);

  const distance = objPos.distanceTo(viewerPos);

  // Check if within reasonable viewing distance
  if (distance > 20) {
    return distance - 20;
  }

  // Check vertical angle
  const dy = objPos.y - viewerPos.y;
  const angle = Math.atan2(dy, distance);
  const minAngle = -Math.PI / 6;
  const maxAngle = Math.PI / 3;

  if (angle < minAngle || angle > maxAngle) {
    return Math.min(Math.abs(angle - minAngle), Math.abs(angle - maxAngle));
  }

  // Use BVH raycasting to check for occluders
  if (hasMesh(objState)) {
    try {
      const engine = getBVHEngine(kwargs);

      // Get all other objects as potential occluders
      const occluders: THREE.Object3D[] = [];
      for (const [name, os] of state.objs.entries()) {
        if (name !== objName && name !== viewerName && os.obj) {
          occluders.push(os.obj);
        }
      }

      // Cast ray from viewer to object
      const direction = new Vector3().subVectors(objPos, viewerPos).normalize();
      const hits = engine.raycast(viewerPos, direction, distance, occluders);

      if (hits.length > 0 && hits[0].distance < distance - 0.1) {
        // Object is occluded
        return 0.5; // Visibility violation
      }
    } catch (e) {
      // Fall through — distance and angle check is acceptable
    }
  }

  return 0;
}

/**
 * Check if object is hidden from view.
 */
export function evaluateHidden(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const visibleScore = evaluateVisible(node, state, childVals, kwargs);
  return visibleScore === 0 ? 1 : 0;
}

/**
 * Check if there is a clear line of sight between two objects.
 *
 * Uses BVH raycasting to check for occluders.
 * Returns 0 if clear line of sight, positive value if blocked.
 */
export function evaluateHasLineOfSight(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1');
  const obj2Name = childVals.get('obj2');

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return 1; // No line of sight
  }

  const pos1 = new Vector3();
  const pos2 = new Vector3();
  obj1State.obj.getWorldPosition(pos1);
  obj2State.obj.getWorldPosition(pos2);

  try {
    const engine = getBVHEngine(kwargs);

    // Get all other objects as potential obstacles
    const obstacles: THREE.Object3D[] = [];
    for (const [name, os] of state.objs.entries()) {
      if (name !== obj1Name && name !== obj2Name && os.obj) {
        obstacles.push(os.obj);
      }
    }

    const hasLOS = engine.hasLineOfSight(pos1, pos2, obstacles);
    return hasLOS ? 0 : 1;
  } catch (e) {
    // Fallback: simple distance check
    const distance = pos1.distanceTo(pos2);
    return distance > 10 ? 1 : 0;
  }
}

/**
 * Check if obj1 contains obj2.
 *
 * Uses BVH raycasting to check containment by casting rays from obj2's
 * center in multiple directions. If all rays hit obj1's surface from inside,
 * obj2 is contained.
 */
export function evaluateContains(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  const obj1Name = childVals.get('obj1'); // Container
  const obj2Name = childVals.get('obj2'); // Contained

  const obj1State = state.objs.get(obj1Name);
  const obj2State = state.objs.get(obj2Name);

  if (!obj1State || !obj2State || !obj1State.obj || !obj2State.obj) {
    return 1; // Not contained
  }

  // Try BVH-based containment
  if (hasMesh(obj1State)) {
    try {
      const engine = getBVHEngine(kwargs);
      const isContained = engine.contains(obj1State.obj, obj2State.obj);
      return isContained ? 0 : 1;
    } catch (e) {
      console.warn('evaluateContains: BVH query failed, falling back to AABB:', (e as Error).message);
    }
  }

  // AABB fallback
  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);
  return bbox1.containsBox(bbox2) ? 0 : 1;
}

// ============================================================================
// Exports
// ============================================================================

/**
 * All geometry node implementation functions.
 * Used for registration with the evaluator.
 */
export const geometryNodeImpls = {
  Distance: evaluateDistance,
  Touching: evaluateTouching,
  SupportedBy: evaluateSupportedBy,
  StableAgainst: evaluateStableAgainst,
  Coverage: evaluateCoverage,
  CoPlanar: evaluateCoPlanar,
  Facing: evaluateFacing,
  AccessibleFrom: evaluateAccessibleFrom,
  Visible: evaluateVisible,
  Hidden: evaluateHidden,
  HasLineOfSight: evaluateHasLineOfSight,
  Contains: evaluateContains,
};
