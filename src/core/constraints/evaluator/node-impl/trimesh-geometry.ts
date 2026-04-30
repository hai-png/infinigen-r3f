/**
 * Trimesh Geometry Node Implementations
 *
 * Ports: infinigen/core/constraints/evaluator/node_impl/trimesh_geometry.py
 *
 * Implements evaluation logic for geometry-based relations using three.js mesh operations.
 * Includes: Distance, Touching, SupportedBy, StableAgainst, Coverage, etc.
 */

import { Relation } from '../../language/relations';
import { State, ObjectState } from '../state';
import { Vector3, Matrix4 } from 'three';
import * as THREE from 'three';

/**
 * Compute distance between two objects
 * Uses simplified bounding box distance for performance
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

  // Get world positions
  const pos1 = new Vector3();
  const pos2 = new Vector3();
  obj1State.obj.getWorldPosition(pos1);
  obj2State.obj.getWorldPosition(pos2);

  // Simple Euclidean distance (can be enhanced with actual mesh distance)
  const distance = pos1.distanceTo(pos2);

  // Subtract bounding box radii for surface-to-surface distance
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
 * Check if two objects are touching
 * Returns 0 if touching, positive value if separated
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

  // Use bounding box intersection as approximation
  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

  // Expand boxes slightly for tolerance
  const tolerance = 0.01;
  bbox1.expandByScalar(tolerance);
  bbox2.expandByScalar(tolerance);

  if (bbox1.intersectsBox(bbox2)) {
    return 0; // Touching
  }

  // Return distance as violation measure
  return evaluateDistance(node, state, childVals, kwargs);
}

/**
 * Check if obj1 is supported by obj2
 * Considers vertical positioning and contact
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

  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

  const min1 = bbox1.min.y;
  const max2 = bbox2.max.y;

  // Check if obj1 is above obj2 (within tolerance)
  const verticalTolerance = 0.05;
  const verticalViolation = Math.max(0, min1 - max2 - verticalTolerance);

  // Check horizontal overlap
  const overlapX = Math.max(0, Math.min(bbox1.max.x, bbox2.max.x) - Math.max(bbox1.min.x, bbox2.min.x));
  const overlapZ = Math.max(0, Math.min(bbox1.max.z, bbox2.max.z) - Math.max(bbox1.min.z, bbox2.min.z));

  const area1 = (bbox1.max.x - bbox1.min.x) * (bbox1.max.z - bbox1.min.z);
  const overlapArea = overlapX * overlapZ;

  // Require at least 20% overlap for support
  const overlapRatio = area1 > 0 ? overlapArea / area1 : 0;
  const overlapViolation = overlapRatio < 0.2 ? (0.2 - overlapRatio) * 5 : 0;

  return verticalViolation + overlapViolation;
}

/**
 * Check if obj1 is stable against obj2
 * Simplified stability check based on center of mass projection
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

  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

  // Get center of obj1
  const center1 = new Vector3();
  bbox1.getCenter(center1);

  // Project center down to obj2's top surface
  const supportY = bbox2.max.y;
  const projectionPoint = new Vector3(center1.x, supportY, center1.z);

  // Check if projection is within obj2's bounds
  const isWithinSupport = bbox2.containsPoint(projectionPoint);

  if (isWithinSupport) {
    return 0;
  }

  // Calculate distance to nearest support point
  const closestPoint = bbox2.clampPoint(projectionPoint, new Vector3());
  return projectionPoint.distanceTo(closestPoint);
}

/**
 * Evaluate coverage of obj1 over obj2
 * Returns ratio of covered area
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

  const bbox1 = new THREE.Box3().setFromObject(obj1State.obj);
  const bbox2 = new THREE.Box3().setFromObject(obj2State.obj);

  // Calculate 2D projection overlap on XZ plane
  const overlapX = Math.max(0, Math.min(bbox1.max.x, bbox2.max.x) - Math.max(bbox1.min.x, bbox2.min.x));
  const overlapZ = Math.max(0, Math.min(bbox1.max.z, bbox2.max.z) - Math.max(bbox1.min.z, bbox2.min.z));

  const area2 = (bbox2.max.x - bbox2.min.x) * (bbox2.max.z - bbox2.min.z);
  const overlapArea = overlapX * overlapZ;

  if (area2 === 0) return 0;

  return overlapArea / area2;
}

/**
 * Check if objects are coplanar
 * Compares surface normals and positions
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
 * Check if obj1 is facing obj2
 * Uses object orientation and direction vectors
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

  // Convert to violation (1 = not facing, 0 = perfectly facing)
  return Math.max(0, 1 - dot);
}

/**
 * Check if obj1 is accessible from obj2
 * Simplified line-of-sight check
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

  // Simple distance-based accessibility
  const distance = pos1.distanceTo(pos2);
  const maxReach = 5.0; // meters

  if (distance > maxReach) {
    return distance - maxReach;
  }

  return 0;
}

/**
 * Check if object is visible from camera/viewpoint
 * Placeholder for raycasting implementation
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
    : new Vector3(0, 1.6, 3); // Default eye height

  // Simple distance and angle check
  const distance = objPos.distanceTo(viewerPos);

  // Check if within reasonable viewing distance
  if (distance > 20) {
    return distance - 20;
  }

  // Check vertical angle (not too high or low)
  const dy = objPos.y - viewerPos.y;
  const angle = Math.atan2(dy, distance);

  // Comfortable viewing angle: -30 to +60 degrees
  const minAngle = -Math.PI / 6;
  const maxAngle = Math.PI / 3;

  if (angle < minAngle || angle > maxAngle) {
    return Math.min(Math.abs(angle - minAngle), Math.abs(angle - maxAngle));
  }

  return 0;
}

/**
 * Check if object is hidden from view
 */
export function evaluateHidden(
  node: Relation,
  state: State,
  childVals: Map<string, any>,
  kwargs: any
): number {
  // Inverse of visible
  const visibleScore = evaluateVisible(node, state, childVals, kwargs);
  return visibleScore === 0 ? 1 : 0;
}

// Export all evaluation functions
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
  Hidden: evaluateHidden
};
