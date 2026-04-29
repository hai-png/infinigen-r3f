/**
 * MathUtils.ts
 *
 * Comprehensive mathematical utilities ported from Infinigen's math.py, random.py, and color.py.
 * Includes vector operations, interval arithmetic, random number generation with seeds,
 * and color space conversions.
 */
import * as THREE from 'three';
/**
 * Converts a Euler angle representation to a Quaternion.
 * @param euler [x, y, z] in radians
 * @param order Rotation order (default 'XYZ')
 */
export declare function eulerToQuaternion(euler: [number, number, number], order?: THREE.EulerOrder): THREE.Quaternion;
/**
 * Converts a Quaternion to Euler angles.
 * @param q Quaternion
 * @param order Rotation order
 */
export declare function quaternionToEuler(q: THREE.Quaternion, order?: THREE.EulerOrder): [number, number, number];
/**
 * Computes the signed angle between two vectors around a given axis.
 */
export declare function signedAngle(v1: THREE.Vector3, v2: THREE.Vector3, axis: THREE.Vector3): number;
/**
 * Projects a point onto a line segment defined by p1 and p2.
 * Returns the closest point on the segment.
 */
export declare function projectPointOnSegment(point: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3): THREE.Vector3;
/**
 * Calculates the distance between a point and a line segment.
 */
export declare function distancePointToSegment(point: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3): number;
/**
 * Generates a random point inside a unit sphere.
 */
export declare function randomPointInSphere(radius?: number): THREE.Vector3;
/**
 * Generates a random point on a unit sphere surface.
 */
export declare function randomPointOnSphere(radius?: number): THREE.Vector3;
export type Interval = [number, number];
export declare const EMPTY_INTERVAL: Interval;
/**
 * Creates an interval from two numbers.
 */
export declare function makeInterval(a: number, b: number): Interval;
/**
 * Checks if an interval is empty.
 */
export declare function isEmptyInterval(i: Interval): boolean;
/**
 * Returns the union of two intervals.
 */
export declare function unionIntervals(a: Interval, b: Interval): Interval;
/**
 * Returns the intersection of two intervals.
 */
export declare function intersectIntervals(a: Interval, b: Interval): Interval;
/**
 * Adds a scalar to an interval.
 */
export declare function addScalarToInterval(i: Interval, s: number): Interval;
/**
 * Multiplies an interval by a scalar.
 */
export declare function multiplyIntervalByScalar(i: Interval, s: number): Interval;
/**
 * Checks if a value is within an interval.
 */
export declare function isInInterval(val: number, i: Interval): boolean;
/**
 * Gets the width of an interval.
 */
export declare function intervalWidth(i: Interval): number;
/**
 * Gets the midpoint of an interval.
 */
export declare function intervalMidpoint(i: Interval): number;
/**
 * Simple Mulberry32 PRNG for seeded randomness.
 */
export interface RandomGenerator {
    next(): number;
    nextInt(min: number, max: number): number;
    nextFloat(min: number, max: number): number;
}
/**
 * SeededRandom is an alias for SeededRandom for backward compatibility
 */
export type SeededRandomType = SeededRandom;
export declare class SeededRandom implements RandomGenerator {
    seed: number;
    constructor(seed: number);
    /**
     * Returns a random float in [0, 1).
     */
    next(): number;
    /**
     * Returns a random integer in [min, max].
     */
    nextInt(min: number, max: number): number;
    /**
     * Returns a random float in [min, max).
     * If no arguments provided, returns a random float in [0, 1).
     */
    nextFloat(min?: number, max?: number): number;
    /**
     * Alias for next() - returns a random float in [0, 1).
     * For backward compatibility with code expecting uniform().
     */
    uniform(): number;
    /**
     * Picks a random element from an array.
     */
    choice<T>(array: T[]): T;
    /**
     * Alias for nextFloat(min, max)
     */
    range(min: number, max: number): number;
    /**
     * Alias for nextInt(min, max)
     */
    int(min: number, max: number): number;
    /**
     * Returns true with the given probability
     */
    boolean(chance?: number): boolean;
    /**
     * Shuffles an array in place.
     */
    shuffle<T>(array: T[]): T[];
    /**
     * Generates a random Gaussian (Normal) distribution value.
     * Uses Box-Muller transform.
     */
    gaussian(mean?: number, stdDev?: number): number;
    [Symbol.dispose](): void;
}
export declare function random(): number;
export declare function randomInt(min: number, max: number): number;
export declare function randomChoice<T>(array: T[]): T;
/**
 * Weighted random sample from an array.
 * If weights are provided, uses them for selection probability.
 * Otherwise falls back to uniform random choice.
 */
export declare function weightedSample<T>(items: T[], rng?: SeededRandom, weights?: number[]): T;
export interface RGB {
    r: number;
    g: number;
    b: number;
}
export interface HSV {
    h: number;
    s: number;
    v: number;
}
export interface LAB {
    l: number;
    a: number;
    b: number;
}
/**
 * Converts RGB (0-255) to Hex string.
 */
export declare function rgbToHex(r: number, g: number, b: number): string;
/**
 * Converts Hex string to RGB.
 */
export declare function hexToRgb(hex: string): RGB;
/**
 * Converts RGB (0-1) to HSV.
 */
export declare function rgbToHsv(r: number, g: number, b: number): HSV;
/**
 * Converts HSV to RGB (0-1).
 */
export declare function hsvToRgb(h: number, s: number, v: number): RGB;
/**
 * Converts RGB (0-1) to CIELAB.
 * Approximation using D65 white point.
 */
export declare function rgbToLab(r: number, g: number, b: number): LAB;
/**
 * Generates a random pleasant color.
 * Uses HSV space with constrained saturation and value for better aesthetics.
 */
export declare function randomPleasantColor(rng?: SeededRandom): RGB;
/**
 * Interpolates between two RGB colors.
 * @param t Interpolation factor (0-1)
 */
export declare function lerpColor(c1: RGB, c2: RGB, t: number): RGB;
/**
 * Clamps RGB values to 0-1 range.
 */
export declare function clampRgb(color: RGB): RGB;
/**
 * Simple 3D noise function using gradient hashing
 * Based on classic Perlin noise algorithm
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @param scale - Noise scale/frequency multiplier
 * @returns Noise value in range [-1, 1]
 */
export declare function noise3D(x: number, y: number, z: number, scale?: number): number;
/**
 * Simple 2D noise function using gradient hashing
 * Based on classic Perlin noise algorithm
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param scale - Noise scale/frequency multiplier
 * @returns Noise value in range [-1, 1]
 */
export declare function noise2D(x: number, y: number, scale?: number): number;
/**
 * Alias for noise2D for backward compatibility
 */
export declare function perlin2D(x: number, y: number, scale?: number): number;
/**
 * 2D Voronoi noise function
 * Returns distance to nearest feature point
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param scale - Scale factor for cell size
 * @returns Distance to nearest point (normalized)
 */
export declare function voronoi2D(x: number, y: number, scale?: number): number;
/**
 * Ridged multifractal noise function
 * Creates sharp, mountain-like features by inverting and combining noise octaves
 * Based on Ken Musgrave's ridged multifractal algorithm
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @param octaves - Number of noise octaves
 * @param lacunarity - Frequency multiplier per octave (typically 2.0)
 * @param gain - Amplitude multiplier per octave (typically 0.5)
 * @param roughness - Overall roughness control (0-1)
 * @returns Ridged multifractal noise value (-1 to 1 range, typically 0-1 after processing)
 */
export declare function ridgedMultifractal(x: number, y: number, z: number, octaves?: number, lacunarity?: number, gain?: number, roughness?: number): number;
/**
 * Clamp a value between min and max
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * Linear interpolation between two values
 */
export declare function lerp(a: number, b: number, t: number): number;
/**
 * Inverse linear interpolation - finds t given value between a and b
 */
export declare function inverseLerp(a: number, b: number, value: number): number;
/**
 * Map a value from one range to another
 */
export declare function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number;
/**
 * Convert degrees to radians
 */
export declare function degToRad(degrees: number): number;
/**
 * Convert radians to degrees
 */
export declare function radToDeg(radians: number): number;
export { Vector3, Vector2, Vector4, Quaternion, Euler, Matrix4, Color } from 'three';
//# sourceMappingURL=MathUtils.d.ts.map