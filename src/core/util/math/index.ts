/**
 * Math Utilities Module
 * Centralized math operations for 3D graphics, noise, and random number generation
 * 
 * Note: Vector3 and lerp exist in both ../MathUtils (re-exports from three.js)
 * and ./vector (custom implementations). We keep both accessible:
 * - THREE.Vector3 is available via the MathUtils re-export
 * - Custom Vector3 (interface) and lerp (for Vector3) are from ./vector
 * To resolve the conflict, we export ./vector with the custom types under
 * aliases and keep the three.js re-exports as the primary Vector3/lerp.
 */

// Re-export everything from MathUtils (includes THREE.Vector3, lerp for numbers)
export * from '../MathUtils';

// Re-export sub-modules for organized imports
export { SeededRandom } from './distributions';
export type { RandomGenerator } from './distributions';

export { 
  noise3D, 
  noise2D, 
  voronoi2D, 
  ridgedMultifractal,
  fbm,
  Noise3D 
} from './noise';
export type { NoiseFunction } from './noise';

// Export from ./vector with aliases to avoid conflicts with MathUtils re-exports
export {
  Vector3 as MathVec3,
  vec3,
  add as vec3Add,
  sub as vec3Sub,
  mul as vec3Mul,
  div as vec3Div,
  dot as vec3Dot,
  cross as vec3Cross,
  length as vec3Length,
  lengthSq as vec3LengthSq,
  normalize as vec3Normalize,
  distance as vec3Distance,
  distanceSq as vec3DistanceSq,
  lerp as vec3Lerp,
  negate as vec3Negate,
  clone as vec3Clone,
  equals as vec3Equals,
  scaleToLength as vec3ScaleToLength,
  project as vec3Project,
  reject as vec3Reject,
  reflect as vec3Reflect,
  min as vec3Min,
  max as vec3Max,
  abs as vec3Abs,
  ZERO as VEC3_ZERO,
  UNIT_X,
  UNIT_Y,
  UNIT_Z,
} from './vector';

export * from './bbox';
export * from './utils';
export * from './transforms';
