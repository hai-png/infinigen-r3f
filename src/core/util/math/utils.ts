/**
 * Math Utilities - Legacy Aliases
 * Provides backward compatibility for files expecting utils module
 */

import * as THREE from 'three';

// SeededRandom is an alias for SeededRandom for backward compatibility
export { SeededRandom as SeededRandom } from '../MathUtils';
export type { RandomGenerator } from '../MathUtils';

// Re-export commonly used utilities
export {
  clamp,
  lerp,
  inverseLerp,
  mapRange,
  degToRad,
  radToDeg,
  randomChoice,
  randomPleasantColor,
  weightedSample
} from '../MathUtils';

// Re-export THREE types
export type { Vector3, Vector2, Quaternion, Euler } from 'three';
