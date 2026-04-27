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
export interface RandomGenerator {
  next(): number;
  nextInt(min: number, max: number): number;
  nextFloat(min: number, max: number): number;
}

/**
 * SeededRandom is an alias for SeededRandom for backward compatibility
 */
export type SeededRandomType = SeededRandom;

export class SeededRandom implements RandomGenerator {
  public seed: number;

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
   * If no arguments provided, returns a random float in [0, 1).
   */
  nextFloat(min?: number, max?: number): number {
    if (min === undefined || max === undefined) {
      return this.next();
    }
    return this.next() * (max - min) + min;
  }

  /**
   * Alias for next() - returns a random float in [0, 1).
   * For backward compatibility with code expecting uniform().
   */
  uniform(): number {
    return this.next();
  }

  /**
   * Picks a random element from an array.
   */
  choice<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Alias for nextFloat(min, max)
   */
  range(min: number, max: number): number {
    return this.nextFloat(min, max);
  }

  /**
   * Alias for nextInt(min, max)
   */
  int(min: number, max: number): number {
    return this.nextInt(min, max);
  }

  /**
   * Returns true with the given probability
   */
  boolean(chance: number = 0.5): boolean {
    return this.next() < chance;
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

  [Symbol.dispose](): void {
    // No-op for cleanup
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

/**
 * Weighted random sample from an array.
 * If weights are provided, uses them for selection probability.
 * Otherwise falls back to uniform random choice.
 */
export function weightedSample<T>(items: T[], rng?: SeededRandom, weights?: number[]): T {
  const random = rng || globalRng;
  
  if (!weights || weights.length === 0) {
    return random.choice(items);
  }
  
  // Normalize weights
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = random.uniform() * total;
  
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      return items[i];
    }
  }
  
  return items[items.length - 1];
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

// ============================================================================
// Noise Functions (Simplex/Perlin-style)
// ============================================================================

/**
 * Simple 3D noise function using gradient hashing
 * Based on classic Perlin noise algorithm
 * @param x - X coordinate
 * @param y - Y coordinate  
 * @param z - Z coordinate
 * @param scale - Noise scale/frequency multiplier
 * @returns Noise value in range [-1, 1]
 */
export function noise3D(x: number, y: number, z: number, scale: number = 1.0): number {
  const X = Math.floor(x * scale) & 255;
  const Y = Math.floor(y * scale) & 255;
  const Z = Math.floor(z * scale) & 255;

  x -= Math.floor(x * scale);
  y -= Math.floor(y * scale);
  z -= Math.floor(z * scale);

  // Fade curves for smooth interpolation
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);

  // Hash coordinates of cube corners
  const A = p[X] + Y;
  const AA = p[A] + Z;
  const AB = p[A + 1] + Z;
  const B = p[X + 1] + Y;
  const BA = p[B] + Z;
  const BB = p[B + 1] + Z;

  // Gradient contributions
  const result = lerp(
    w,
    lerp(
      v,
      lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
      lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))
    ),
    lerp(
      v,
      lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
      lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))
    )
  );

  return result;
}

/**
 * Simple 2D noise function using gradient hashing
 * Based on classic Perlin noise algorithm
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param scale - Noise scale/frequency multiplier
 * @returns Noise value in range [-1, 1]
 */
export function noise2D(x: number, y: number, scale: number = 1.0): number {
  const X = Math.floor(x * scale) & 255;
  const Y = Math.floor(y * scale) & 255;

  x -= Math.floor(x * scale);
  y -= Math.floor(y * scale);

  // Fade curves for smooth interpolation
  const u = fade(x);
  const v = fade(y);

  // Hash coordinates of square corners
  const A = p[X] + Y;
  const B = p[X + 1] + Y;

  // Gradient contributions
  const result = lerp(
    v,
    lerp(u, grad(p[A], x, y, 0), grad(p[B], x - 1, y, 0)),
    lerp(u, grad(p[A + 1], x, y - 1, 0), grad(p[B + 1], x - 1, y - 1, 0))
  );

  return result;
}

/**
 * Alias for noise2D for backward compatibility
 */
export function perlin2D(x: number, y: number, scale: number = 1.0): number {
  return noise2D(x, y, scale);
}

/**
 * 2D Voronoi noise function
 * Returns distance to nearest feature point
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param scale - Scale factor for cell size
 * @returns Distance to nearest point (normalized)
 */
export function voronoi2D(x: number, y: number, scale: number = 1.0): number {
  const cellX = Math.floor(x * scale);
  const cellY = Math.floor(y * scale);
  
  let minDist = Infinity;

  // Check neighboring cells
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const neighborX = cellX + dx;
      const neighborY = cellY + dy;
      
      // Hash to get feature point position within cell
      const hash = hash2D(neighborX, neighborY);
      const featureX = neighborX + (hash % 1000) / 1000;
      const featureY = neighborY + ((Math.floor(hash / 1000)) % 1000) / 1000;
      
      // Distance to this feature point
      const distX = (x * scale) - featureX;
      const distY = (y * scale) - featureY;
      const dist = Math.sqrt(distX * distX + distY * distY);
      
      minDist = Math.min(minDist, dist);
    }
  }

  return minDist;
}

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
export function ridgedMultifractal(
  x: number,
  y: number,
  z: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  gain: number = 0.5,
  roughness: number = 0.5
): number {
  let signal = 0;
  let weight = 1.0;
  let frequency = 1.0;
  let amplitude = 1.0;
  
  // Offset to ensure all values are positive after ridge operation
  const offset = 1.0;
  
  for (let i = 0; i < octaves; i++) {
    // Get noise value at current frequency
    let n = noise3D(x * frequency, y * frequency, z * frequency, 1.0);
    
    // Create ridge by inverting and taking absolute value
    // This creates sharp peaks where noise crosses zero
    n = offset - Math.abs(n);
    
    // Apply weight based on previous octave's contribution
    // This creates the characteristic self-similar ridge pattern
    n *= weight;
    
    // Accumulate signal
    signal += n * amplitude;
    
    // Update weight for next octave
    // Clamp to prevent runaway feedback
    weight = Math.min(n * gain, 1.0);
    weight = Math.max(weight, 0);
    
    // Increase frequency and decrease amplitude for next octave
    frequency *= lacunarity;
    amplitude *= gain;
  }
  
  // Normalize result to 0-1 range
  // The theoretical maximum is approximately sum of amplitudes
  const maxSignal = 1.0 / (1.0 - gain);
  return MathUtils.clamp(signal / maxSignal, 0, 1) * roughness;
}

// Permutation table for noise
const p: number[] = [];
for (let i = 0; i < 256; i++) {
  p[i] = i;
}
// Shuffle permutation table
for (let i = 255; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [p[i], p[j]] = [p[j], p[i]];
}
// Duplicate for overflow handling
for (let i = 0; i < 256; i++) {
  p[256 + i] = p[i];
}

/**
 * Fade curve function (Perlin's smoothstep variant)
 */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Linear interpolation
 */
function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

/**
 * Gradient dot product for noise
 */
function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * 2D hash function
 */
function hash2D(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return Math.abs(h & 0x7fffffff);
}

// ============================================================================
// Additional Utility Functions (for backward compatibility)
// ============================================================================

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Inverse linear interpolation - finds t given value between a and b
 */
export function inverseLerp(a: number, b: number, value: number): number {
  if (Math.abs(b - a) < 0.0001) return 0;
  return (value - a) / (b - a);
}

/**
 * Map a value from one range to another
 */
export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

/**
 * Convert degrees to radians
 */
export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}
// Re-export THREE vector types for convenience
export { Vector3, Vector2, Vector4, Quaternion, Euler, Matrix4, Color } from 'three';
