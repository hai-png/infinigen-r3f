/**
 * MathUtils.ts
 * 
 * Comprehensive mathematical utilities ported from Infinigen's math.py, random.py, and color.py.
 * Includes vector operations, interval arithmetic, random number generation with seeds,
 * and color space conversions.
 */

import * as THREE from 'three';

// ============================================================================
// Vector & Matrix Utilities
// ============================================================================

/**
 * Converts a Euler angle representation to a Quaternion.
 * @param euler [x, y, z] in radians
 * @param order Rotation order (default 'XYZ')
 */
export function eulerToQuaternion(euler: [number, number, number], order: THREE.EulerOrder = 'XYZ'): THREE.Quaternion {
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(euler[0], euler[1], euler[2], order);
  q.setFromEuler(e);
  return q;
}

/**
 * Converts a Quaternion to Euler angles.
 * @param q Quaternion
 * @param order Rotation order
 */
export function quaternionToEuler(q: THREE.Quaternion, order: THREE.EulerOrder = 'XYZ'): [number, number, number] {
  const e = new THREE.Euler().setFromQuaternion(q, order);
  return [e.x, e.y, e.z];
}

/**
 * Computes the signed angle between two vectors around a given axis.
 */
export function signedAngle(v1: THREE.Vector3, v2: THREE.Vector3, axis: THREE.Vector3): number {
  const v1Norm = v1.clone().normalize();
  const v2Norm = v2.clone().normalize();
  const axisNorm = axis.clone().normalize();

  const angle = v1Norm.angleTo(v2Norm);
  const cross = new THREE.Vector3().crossVectors(v1Norm, v2Norm);
  const sign = Math.sign(cross.dot(axisNorm));

  return angle * sign;
}

/**
 * Projects a point onto a line segment defined by p1 and p2.
 * Returns the closest point on the segment.
 */
export function projectPointOnSegment(point: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3): THREE.Vector3 {
  const segmentVec = new THREE.Vector3().subVectors(p2, p1);
  const pointVec = new THREE.Vector3().subVectors(point, p1);
  
  const segLenSq = segmentVec.lengthSq();
  if (segLenSq === 0) return p1.clone();

  let t = pointVec.dot(segmentVec) / segLenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment

  return new THREE.Vector3().addVectors(p1, segmentVec.multiplyScalar(t));
}

/**
 * Calculates the distance between a point and a line segment.
 */
export function distancePointToSegment(point: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3): number {
  const proj = projectPointOnSegment(point, p1, p2);
  return point.distanceTo(proj);
}

/**
 * Generates a random point inside a unit sphere.
 */
export function randomPointInSphere(radius: number = 1): THREE.Vector3 {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = radius * Math.cbrt(Math.random()); // Cube root for uniform distribution

  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.sin(phi) * Math.sin(theta);
  const z = r * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

/**
 * Generates a random point on a unit sphere surface.
 */
export function randomPointOnSphere(radius: number = 1): THREE.Vector3 {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = radius;

  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.sin(phi) * Math.sin(theta);
  const z = r * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// ============================================================================
// Interval Arithmetic
// ============================================================================

export type Interval = [number, number];

export const EMPTY_INTERVAL: Interval = [Infinity, -Infinity];

/**
 * Creates an interval from two numbers.
 */
export function makeInterval(a: number, b: number): Interval {
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * Checks if an interval is empty.
 */
export function isEmptyInterval(i: Interval): boolean {
  return i[0] > i[1];
}

/**
 * Returns the union of two intervals.
 */
export function unionIntervals(a: Interval, b: Interval): Interval {
  if (isEmptyInterval(a)) return b;
  if (isEmptyInterval(b)) return a;
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

/**
 * Returns the intersection of two intervals.
 */
export function intersectIntervals(a: Interval, b: Interval): Interval {
  if (isEmptyInterval(a) || isEmptyInterval(b)) return EMPTY_INTERVAL;
  const res: Interval = [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
  return res[0] > res[1] ? EMPTY_INTERVAL : res;
}

/**
 * Adds a scalar to an interval.
 */
export function addScalarToInterval(i: Interval, s: number): Interval {
  if (isEmptyInterval(i)) return EMPTY_INTERVAL;
  return [i[0] + s, i[1] + s];
}

/**
 * Multiplies an interval by a scalar.
 */
export function multiplyIntervalByScalar(i: Interval, s: number): Interval {
  if (isEmptyInterval(i)) return EMPTY_INTERVAL;
  if (s >= 0) {
    return [i[0] * s, i[1] * s];
  } else {
    return [i[1] * s, i[0] * s];
  }
}

/**
 * Checks if a value is within an interval.
 */
export function isInInterval(val: number, i: Interval): boolean {
  if (isEmptyInterval(i)) return false;
  return val >= i[0] && val <= i[1];
}

/**
 * Gets the width of an interval.
 */
export function intervalWidth(i: Interval): number {
  if (isEmptyInterval(i)) return 0;
  return i[1] - i[0];
}

/**
 * Gets the midpoint of an interval.
 */
export function intervalMidpoint(i: Interval): number {
  if (isEmptyInterval(i)) return 0;
  return (i[0] + i[1]) / 2;
}

// ============================================================================
// Random Number Generation (Seeded)
// ============================================================================

/**
 * Simple Mulberry32 PRNG for seeded randomness.
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Returns a random float in [0, 1).
   */
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a random integer in [min, max].
   */
  nextInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns a random float in [min, max).
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Picks a random element from an array.
   */
  choice<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Shuffles an array in place.
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Generates a random Gaussian (Normal) distribution value.
   * Uses Box-Muller transform.
   */
  gaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
}

// Global instance for non-seeded usage (uses time-based seed)
const globalRng = new SeededRandom(Date.now());

export function random(): number {
  return globalRng.next();
}

export function randomInt(min: number, max: number): number {
  return globalRng.nextInt(min, max);
}

export function randomChoice<T>(array: T[]): T {
  return globalRng.choice(array);
}

// ============================================================================
// Color Utilities
// ============================================================================

export interface RGB { r: number; g: number; b: number; }
export interface HSV { h: number; s: number; v: number; }
export interface LAB { l: number; a: number; b: number; }

/**
 * Converts RGB (0-255) to Hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Converts Hex string to RGB.
 */
export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };
}

/**
 * Converts RGB (0-1) to HSV.
 */
export function rgbToHsv(r: number, g: number, b: number): HSV {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;

  return { h, s, v };
}

/**
 * Converts HSV to RGB (0-1).
 */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    default: r = 0; g = 0; b = 0; // Should not happen
  }

  return { r: r!, g: g!, b: b! };
}

/**
 * Converts RGB (0-1) to CIELAB.
 * Approximation using D65 white point.
 */
export function rgbToLab(r: number, g: number, b: number): LAB {
  // First convert to XYZ
  let rs = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  let gs = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  let bs = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  rs *= 100; gs *= 100; bs *= 100;

  const x = rs * 0.4124 + gs * 0.3576 + bs * 0.1805;
  const y = rs * 0.2126 + gs * 0.7152 + bs * 0.0722;
  const z = rs * 0.0193 + gs * 0.1192 + bs * 0.9505;

  // Then XYZ to Lab
  const xn = 95.047, yn = 100.0, zn = 108.883;
  const fx = fLab(x / xn);
  const fy = fLab(y / yn);
  const fz = fLab(z / zn);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function fLab(t: number): number {
  return t > 0.008856 ? Math.pow(t, 1/3) : (7.787 * t) + (16 / 116);
}

/**
 * Generates a random pleasant color.
 * Uses HSV space with constrained saturation and value for better aesthetics.
 */
export function randomPleasantColor(rng: SeededRandom = globalRng): RGB {
  const h = rng.next(); // Full hue range
  const s = rng.nextFloat(0.5, 0.9); // Moderate to high saturation
  const v = rng.nextFloat(0.7, 1.0); // Bright values
  
  return hsvToRgb(h, s, v);
}

/**
 * Interpolates between two RGB colors.
 * @param t Interpolation factor (0-1)
 */
export function lerpColor(c1: RGB, c2: RGB, t: number): RGB {
  return {
    r: c1.r + (c2.r - c1.r) * t,
    g: c1.g + (c2.g - c1.g) * t,
    b: c1.b + (c2.b - c1.b) * t
  };
}

/**
 * Clamps RGB values to 0-1 range.
 */
export function clampRgb(color: RGB): RGB {
  return {
    r: Math.max(0, Math.min(1, color.r)),
    g: Math.max(0, Math.min(1, color.g)),
    b: Math.max(0, Math.min(1, color.b))
  };
}
