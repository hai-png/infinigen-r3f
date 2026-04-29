// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.
/**
 * Create a new vector
 */
export function vec3(x = 0, y = 0, z = 0) {
    return { x, y, z };
}
/**
 * Add two vectors
 */
export function add(a, b) {
    return {
        x: a.x + b.x,
        y: a.y + b.y,
        z: a.z + b.z
    };
}
/**
 * Subtract two vectors
 */
export function sub(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z
    };
}
/**
 * Multiply vector by scalar
 */
export function mul(v, s) {
    return {
        x: v.x * s,
        y: v.y * s,
        z: v.z * s
    };
}
/**
 * Divide vector by scalar
 */
export function div(v, s) {
    return {
        x: v.x / s,
        y: v.y / s,
        z: v.z / s
    };
}
/**
 * Dot product of two vectors
 */
export function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
/**
 * Cross product of two vectors
 */
export function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}
/**
 * Length (magnitude) of a vector
 */
export function length(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
/**
 * Squared length of a vector (faster than length)
 */
export function lengthSq(v) {
    return v.x * v.x + v.y * v.y + v.z * v.z;
}
/**
 * Normalize a vector
 */
export function normalize(v) {
    const len = length(v);
    if (len === 0) {
        return { x: 0, y: 0, z: 0 };
    }
    return div(v, len);
}
/**
 * Distance between two points
 */
export function distance(a, b) {
    return length(sub(a, b));
}
/**
 * Squared distance between two points (faster than distance)
 */
export function distanceSq(a, b) {
    return lengthSq(sub(a, b));
}
/**
 * Linear interpolation between two vectors
 */
export function lerp(a, b, t) {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t
    };
}
/**
 * Negate a vector
 */
export function negate(v) {
    return {
        x: -v.x,
        y: -v.y,
        z: -v.z
    };
}
/**
 * Clone a vector
 */
export function clone(v) {
    return { x: v.x, y: v.y, z: v.z };
}
/**
 * Check if two vectors are equal (within epsilon)
 */
export function equals(a, b, epsilon = 1e-6) {
    return Math.abs(a.x - b.x) < epsilon &&
        Math.abs(a.y - b.y) < epsilon &&
        Math.abs(a.z - b.z) < epsilon;
}
/**
 * Scale a vector to have a specific length
 */
export function scaleToLength(v, length) {
    const normalized = normalize(v);
    return mul(normalized, length);
}
/**
 * Project vector a onto vector b
 */
export function project(a, b) {
    const bNormalized = normalize(b);
    const dotProduct = dot(a, bNormalized);
    return mul(bNormalized, dotProduct);
}
/**
 * Reject vector a from vector b (component perpendicular to b)
 */
export function reject(a, b) {
    const projection = project(a, b);
    return sub(a, projection);
}
/**
 * Reflect vector v around normal n
 */
export function reflect(v, n) {
    const d = dot(v, n);
    return sub(v, mul(n, 2 * d));
}
/**
 * Get component-wise minimum of two vectors
 */
export function min(a, b) {
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        z: Math.min(a.z, b.z)
    };
}
/**
 * Get component-wise maximum of two vectors
 */
export function max(a, b) {
    return {
        x: Math.max(a.x, b.x),
        y: Math.max(a.y, b.y),
        z: Math.max(a.z, b.z)
    };
}
/**
 * Component-wise absolute value
 */
export function abs(v) {
    return {
        x: Math.abs(v.x),
        y: Math.abs(v.y),
        z: Math.abs(v.z)
    };
}
/**
 * Zero vector constant
 */
export const ZERO = { x: 0, y: 0, z: 0 };
/**
 * Unit X vector
 */
export const UNIT_X = { x: 1, y: 0, z: 0 };
/**
 * Unit Y vector
 */
export const UNIT_Y = { x: 0, y: 1, z: 0 };
/**
 * Unit Z vector
 */
export const UNIT_Z = { x: 0, y: 0, z: 1 };
//# sourceMappingURL=vector.js.map