/**
 * Noise utilities for terrain generation
 */
import { noise3D, noise2D } from '../../core/util/math/noise';

export { noise3D, noise2D };

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
