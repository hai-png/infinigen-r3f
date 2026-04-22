/**
 * Math Utilities Module
 *
 * Exports mathematical utilities including bounding boxes,
 * vector operations, and hash functions.
 */

// Vector types and operations
export {
  Vector3,
  vec3,
  add,
  sub,
  mul,
  div,
  dot,
  cross,
  length,
  lengthSq,
  normalize,
  distance,
  distanceSq,
  lerp,
  negate,
  clone,
  equals,
  scaleToLength,
  project,
  reject,
  reflect,
  min as vecMin,
  max as vecMax,
  abs as vecAbs,
  ZERO,
  UNIT_X,
  UNIT_Y,
  UNIT_Z
} from './vector.js';

// Bounding box operations
export {
  BBox,
  unionBBoxes,
  intersectBBoxes
} from './bbox.js';
