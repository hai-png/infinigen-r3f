/**
 * Noise Functions
 * Re-exports from MathUtils for backward compatibility with vegetation generators
 */

export { 
  noise3D, 
  noise2D, 
  voronoi2D, 
  ridgedMultifractal,
  fbm 
} from '../MathUtils';

export type { NoiseFunction } from '../MathUtils';

/**
 * Legacy Noise3D class wrapper for backward compatibility
 */
export class Noise3D {
  private seed: number;
  
  constructor(seed: number = Math.random() * 1000) {
    this.seed = seed;
  }
  
  perlin(x: number, y: number, z: number): number {
    return noise3D(x, y, z, this.seed);
  }
  
  evaluate(x: number, y: number, z: number): number {
    return this.perlin(x, y, z);
  }
  
  setSeed(seed: number): void {
    this.seed = seed;
  }
}
