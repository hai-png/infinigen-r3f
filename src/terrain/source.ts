/**
 * Terrain Source - Noise sources and sampling for terrain generation
 * 
 * Provides noise generation functions, heightfield sources,
 * and sampling utilities for terrain data.
 */

import * as THREE from 'three';

export interface NoiseSource {
  sample(x: number, y: number, z?: number): number;
  sample2D(x: number, y: number): number;
  sample3D(x: number, y: number, z: number): number;
}

export class PerlinNoiseSource implements NoiseSource {
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  sample(x: number, y: number, z: number = 0): number {
    return this.sample3D(x, y, z);
  }

  sample2D(x: number, y: number): number {
    return this.sample3D(x, y, 0);
  }

  sample3D(x: number, y: number, z: number): number {
    // Simplified noise function
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164 + this.seed) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }
}

export class SimplexNoiseSource implements NoiseSource {
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  sample(x: number, y: number, z: number = 0): number {
    return this.sample3D(x, y, z);
  }

  sample2D(x: number, y: number): number {
    return this.sample3D(x, y, 0);
  }

  sample3D(x: number, y: number, z: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164 + this.seed) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }
}

export function sampleHeightField(
  source: NoiseSource,
  x: number,
  y: number,
  octaves: number = 6,
  persistence: number = 0.5,
  lacunarity: number = 2.0,
  scale: number = 1.0
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += source.sample2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}
