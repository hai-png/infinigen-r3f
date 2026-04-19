/**
 * Density Functions for Placement
 * 
 * Defines density functions that control where objects can be placed
 * on surfaces based on geometric properties, tags, and custom criteria.
 * 
 * Ported from: infinigen/core/placement/density.py
 */

import { Vector3 } from 'three';
import { Tag } from '../tags/index.js';

/**
 * Parameters for density evaluation
 */
export interface DensityParams {
  /** Minimum density threshold */
  minDensity: number;
  /** Maximum density threshold */
  maxDensity: number;
  /** Falloff exponent */
  falloff: number;
  /** Use smooth interpolation */
  smooth: boolean;
}

/**
 * Base density function interface
 */
export interface DensityFunction {
  /**
   * Evaluate density at a point
   * @param position - Point in 3D space
   * @param normal - Surface normal at point
   * @returns Density value in [0, 1]
   */
  evaluate(position: Vector3, normal: Vector3): number;
  
  /**
   * Get density parameters
   */
  getParams(): DensityParams;
  
  /**
   * Set density parameters
   */
  setParams(params: Partial<DensityParams>): void;
}

/**
 * Default density parameters
 */
const DEFAULT_PARAMS: DensityParams = {
  minDensity: 0.0,
  maxDensity: 1.0,
  falloff: 2.0,
  smooth: true,
};

/**
 * Simplex noise-based density function
 * Creates natural-looking density variations
 */
export class SimplexDensity implements DensityFunction {
  private params: DensityParams;
  private scale: number;
  private octaves: number;
  private persistence: number;
  private seed: number;
  
  constructor(
    scale: number = 1.0,
    octaves: number = 4,
    persistence: number = 0.5,
    seed: number = Math.random()
  ) {
    this.params = { ...DEFAULT_PARAMS };
    this.scale = scale;
    this.octaves = octaves;
    this.persistence = persistence;
    this.seed = seed;
  }
  
  evaluate(position: Vector3, normal: Vector3): number {
    const scaledPos = {
      x: position.x * this.scale,
      y: position.y * this.scale,
      z: position.z * this.scale,
    };
    
    // Generate simplex noise
    let noise = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    
    for (let i = 0; i < this.octaves; i++) {
      noise += this.simplex3D(
        scaledPos.x * frequency + this.seed,
        scaledPos.y * frequency + this.seed,
        scaledPos.z * frequency + this.seed
      ) * amplitude;
      
      maxValue += amplitude;
      amplitude *= this.persistence;
      frequency *= 2;
    }
    
    // Normalize to [0, 1]
    const normalized = (noise / maxValue + 1) / 2;
    
    // Apply thresholds
    return this.clampDensity(normalized);
  }
  
  /**
   * 3D Simplex noise implementation
   */
  private simplex3D(x: number, y: number, z: number): number {
    // Simplified simplex noise - uses gradient hashing
    const F3 = 1.0 / 3.0;
    const G3 = 1.0 / 6.0;
    
    // Skew input space to determine which simplex cell we're in
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    
    // Unskew the cell origin back to (x,y,z) space
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;
    
    // Determine which simplex we're in
    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;
    
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0;
        i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0;
        i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1;
        i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1;
        i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0;
        i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0;
        i2 = 1; j2 = 1; k2 = 0;
      }
    }
    
    // Offsets for corners
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;
    
    // Hash coordinates of corners
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    
    // Calculate contributions from corners
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    
    const grad3 = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
    ];
    
    const perm = this.generatePermutation(this.seed);
    
    // Corner 0
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      const gi0 = perm[(ii + perm[jj + perm[kk]]) % 12];
      t0 *= t0;
      n0 = t0 * t0 * this.dot(grad3[gi0], [x0, y0, z0]);
    }
    
    // Corner 1
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      const gi1 = perm[(ii + i1 + perm[jj + j1 + perm[kk + k1]]) % 12];
      t1 *= t1;
      n1 = t1 * t1 * this.dot(grad3[gi1], [x1, y1, z1]);
    }
    
    // Corner 2
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      const gi2 = perm[(ii + i2 + perm[jj + j2 + perm[kk + k2]]) % 12];
      t2 *= t2;
      n2 = t2 * t2 * this.dot(grad3[gi2], [x2, y2, z2]);
    }
    
    // Corner 3
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      const gi3 = perm[(ii + 1 + perm[jj + 1 + perm[kk + 1]]) % 12];
      t3 *= t3;
      n3 = t3 * t3 * this.dot(grad3[gi3], [x3, y3, z3]);
    }
    
    // Sum contributions and scale to [-1, 1]
    return 32.0 * (n0 + n1 + n2 + n3);
  }
  
  /**
   * Generate permutation table from seed
   */
  private generatePermutation(seed: number): number[] {
    const perm = new Array(256);
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }
    
    // Shuffle based on seed
    let s = seed * 2147483647;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    
    // Extend to 512 for wrapping
    const extended = new Array(512);
    for (let i = 0; i < 256; i++) {
      extended[i] = perm[i];
      extended[i + 256] = perm[i];
    }
    
    return extended;
  }
  
  /**
   * Dot product
   */
  private dot(g: number[], v: number[]): number {
    return g[0] * v[0] + g[1] * v[1] + g[2] * v[2];
  }
  
  /**
   * Clamp density to configured range
   */
  private clampDensity(value: number): number {
    let clamped = Math.max(this.params.minDensity, Math.min(this.params.maxDensity, value));
    
    // Apply falloff curve
    if (this.params.falloff !== 1.0) {
      clamped = Math.pow(clamped, this.params.falloff);
    }
    
    // Smooth interpolation if enabled
    if (this.params.smooth) {
      clamped = clamped * clamped * (3 - 2 * clamped);
    }
    
    return clamped;
  }
  
  getParams(): DensityParams {
    return { ...this.params };
  }
  
  setParams(params: Partial<DensityParams>): void {
    this.params = { ...this.params, ...params };
  }
}

/**
 * Tag-based density function
 * Returns high density near tagged objects
 */
export class TagDensity implements DensityFunction {
  private params: DensityParams;
  private tag: Tag;
  private influenceRadius: number;
  private falloffExponent: number;
  
  constructor(
    tag: Tag,
    influenceRadius: number = 5.0,
    falloffExponent: number = 2.0
  ) {
    this.params = { ...DEFAULT_PARAMS };
    this.tag = tag;
    this.influenceRadius = influenceRadius;
    this.falloffExponent = falloffExponent;
  }
  
  evaluate(position: Vector3, normal: Vector3): number {
    // This would typically query a spatial database of tagged objects
    // For now, return a placeholder that assumes no tagged objects nearby
    // In full implementation, this would integrate with the scene graph
    return this.params.minDensity;
  }
  
  getParams(): DensityParams {
    return { ...this.params };
  }
  
  setParams(params: Partial<DensityParams>): void {
    this.params = { ...this.params, ...params };
  }
  
  /**
   * Set the tag to attract/repel from
   */
  setTag(tag: Tag): void {
    this.tag = tag;
  }
  
  /**
   * Set influence radius
   */
  setInfluenceRadius(radius: number): void {
    this.influenceRadius = radius;
  }
}

/**
 * Normal-based density filter
 * Filters placement based on surface normal orientation
 */
export class NormalFilter implements DensityFunction {
  private params: DensityParams;
  private preferredNormal: Vector3;
  private tolerance: number;
  private inner: DensityFunction | null;
  
  constructor(
    preferredNormal: Vector3 = new Vector3(0, 1, 0),
    tolerance: number = Math.PI / 6,
    inner?: DensityFunction
  ) {
    this.params = { ...DEFAULT_PARAMS };
    this.preferredNormal = preferredNormal.clone().normalize();
    this.tolerance = tolerance;
    this.inner = inner ?? null;
  }
  
  evaluate(position: Vector3, normal: Vector3): number {
    // Check if normal matches preference
    const dot = this.preferredNormal.dot(normal.normalize());
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    
    if (angle > this.tolerance) {
      return this.params.minDensity;
    }
    
    // If there's an inner density function, evaluate it
    if (this.inner) {
      const innerDensity = this.inner.evaluate(position, normal);
      return this.clampDensity(innerDensity);
    }
    
    // Otherwise return max density
    return this.params.maxDensity;
  }
  
  private clampDensity(value: number): number {
    let clamped = Math.max(this.params.minDensity, Math.min(this.params.maxDensity, value));
    
    if (this.params.falloff !== 1.0) {
      clamped = Math.pow(clamped, this.params.falloff);
    }
    
    if (this.params.smooth) {
      clamped = clamped * clamped * (3 - 2 * clamped);
    }
    
    return clamped;
  }
  
  getParams(): DensityParams {
    return { ...this.params };
  }
  
  setParams(params: Partial<DensityParams>): void {
    this.params = { ...this.params, ...params };
  }
  
  /**
   * Set the inner density function to filter
   */
  setInner(inner: DensityFunction): void {
    this.inner = inner;
  }
}

/**
 * Threshold filter wrapper
 * Applies hard thresholds to another density function
 */
export class ThresholdFilter implements DensityFunction {
  private params: DensityParams;
  private inner: DensityFunction;
  private lowerThreshold: number;
  private upperThreshold: number;
  
  constructor(
    inner: DensityFunction,
    lowerThreshold: number = 0.3,
    upperThreshold: number = 1.0
  ) {
    this.params = { ...DEFAULT_PARAMS };
    this.inner = inner;
    this.lowerThreshold = lowerThreshold;
    this.upperThreshold = upperThreshold;
  }
  
  evaluate(position: Vector3, normal: Vector3): number {
    const density = this.inner.evaluate(position, normal);
    
    if (density < this.lowerThreshold || density > this.upperThreshold) {
      return this.params.minDensity;
    }
    
    return this.clampDensity(density);
  }
  
  private clampDensity(value: number): number {
    let clamped = Math.max(this.params.minDensity, Math.min(this.params.maxDensity, value));
    
    if (this.params.falloff !== 1.0) {
      clamped = Math.pow(clamped, this.params.falloff);
    }
    
    if (this.params.smooth) {
      clamped = clamped * clamped * (3 - 2 * clamped);
    }
    
    return clamped;
  }
  
  getParams(): DensityParams {
    return { ...this.params };
  }
  
  setParams(params: Partial<DensityParams>): void {
    this.params = { ...this.params, ...params };
  }
}
