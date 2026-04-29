/**
 * Vector utilities
 *
 * Provides basic 3D vector operations for geometric computations.
 */
/**
 * 3D Vector type
 */
export interface Vector3 {
    x: number;
    y: number;
    z: number;
}
/**
 * Create a new vector
 */
export declare function vec3(x?: number, y?: number, z?: number): Vector3;
/**
 * Add two vectors
 */
export declare function add(a: Vector3, b: Vector3): Vector3;
/**
 * Subtract two vectors
 */
export declare function sub(a: Vector3, b: Vector3): Vector3;
/**
 * Multiply vector by scalar
 */
export declare function mul(v: Vector3, s: number): Vector3;
/**
 * Divide vector by scalar
 */
export declare function div(v: Vector3, s: number): Vector3;
/**
 * Dot product of two vectors
 */
export declare function dot(a: Vector3, b: Vector3): number;
/**
 * Cross product of two vectors
 */
export declare function cross(a: Vector3, b: Vector3): Vector3;
/**
 * Length (magnitude) of a vector
 */
export declare function length(v: Vector3): number;
/**
 * Squared length of a vector (faster than length)
 */
export declare function lengthSq(v: Vector3): number;
/**
 * Normalize a vector
 */
export declare function normalize(v: Vector3): Vector3;
/**
 * Distance between two points
 */
export declare function distance(a: Vector3, b: Vector3): number;
/**
 * Squared distance between two points (faster than distance)
 */
export declare function distanceSq(a: Vector3, b: Vector3): number;
/**
 * Linear interpolation between two vectors
 */
export declare function lerp(a: Vector3, b: Vector3, t: number): Vector3;
/**
 * Negate a vector
 */
export declare function negate(v: Vector3): Vector3;
/**
 * Clone a vector
 */
export declare function clone(v: Vector3): Vector3;
/**
 * Check if two vectors are equal (within epsilon)
 */
export declare function equals(a: Vector3, b: Vector3, epsilon?: number): boolean;
/**
 * Scale a vector to have a specific length
 */
export declare function scaleToLength(v: Vector3, length: number): Vector3;
/**
 * Project vector a onto vector b
 */
export declare function project(a: Vector3, b: Vector3): Vector3;
/**
 * Reject vector a from vector b (component perpendicular to b)
 */
export declare function reject(a: Vector3, b: Vector3): Vector3;
/**
 * Reflect vector v around normal n
 */
export declare function reflect(v: Vector3, n: Vector3): Vector3;
/**
 * Get component-wise minimum of two vectors
 */
export declare function min(a: Vector3, b: Vector3): Vector3;
/**
 * Get component-wise maximum of two vectors
 */
export declare function max(a: Vector3, b: Vector3): Vector3;
/**
 * Component-wise absolute value
 */
export declare function abs(v: Vector3): Vector3;
/**
 * Zero vector constant
 */
export declare const ZERO: Vector3;
/**
 * Unit X vector
 */
export declare const UNIT_X: Vector3;
/**
 * Unit Y vector
 */
export declare const UNIT_Y: Vector3;
/**
 * Unit Z vector
 */
export declare const UNIT_Z: Vector3;
//# sourceMappingURL=vector.d.ts.map