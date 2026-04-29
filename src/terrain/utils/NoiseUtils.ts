/**
 * Noise utilities for terrain generation
 */
import { noise3D, noise2D, Noise3D } from '../../core/util/math/noise';

export { noise3D, noise2D, Noise3D };

/**
 * NoiseUtils class for procedural noise generation
 * Compatible with original InfiniGen Python API
 */
export class NoiseUtils {
  private seed: number;
  private noiseInstance: Noise3D;

  constructor(seed: number = Math.random() * 1000) {
    this.seed = seed;
    this.noiseInstance = new Noise3D(seed);
  }

  /**
   * Evaluate Perlin noise at given coordinates
   */
  perlin(x: number, y: number, z: number = 0): number {
    return this.noiseInstance.perlin(x, y, z);
  }

  /**
   * Alias for perlin - evaluate noise at coordinates
   */
  evaluate(x: number, y: number, z: number = 0): number {
    return this.noiseInstance.evaluate(x, y, z);
  }

  /**
   * 2D Perlin noise
   */
  perlin2D(x: number, y: number): number {
    return this.noiseInstance.perlin(x, y, 0);
  }

  /**
   * 3D Perlin noise
   */
  perlin3D(x: number, y: number, z: number): number {
    return this.noiseInstance.perlin(x, y, z);
  }

  /**
   * Set the seed for noise generation
   */
  setSeed(seed: number): void {
    this.seed = seed;
    this.noiseInstance.setSeed(seed);
  }

  /**
   * Get the current seed
   */
  getSeed(): number {
    return this.seed;
  }

  /**
   * Generate noise value with octaves (fractal Brownian motion)
   */
  fbm(x: number, y: number, z: number = 0, octaves: number = 4): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.perlin3D(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }

  /**
   * Static method for 2D Perlin noise (used by PineDebrisGenerator)
   */
  static perlin2D(x: number, y: number): number {
    return noise2D(x, y);
  }
}

export function sampleNoise(x: number, y: number, z: number = 0): number {
  return noise3D(x, y, z);
}

export function generateNoiseMap(
  width: number,
  height: number,
  scale: number = 1.0,
  octaves: number = 4
): Float32Array {
  const map = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let maxValue = 0;
      
      for (let i = 0; i < octaves; i++) {
        value += noise3D((x / width) * scale * frequency, (y / height) * scale * frequency, 0) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      
      map[y * width + x] = value / maxValue;
    }
  }
  return map;
}
