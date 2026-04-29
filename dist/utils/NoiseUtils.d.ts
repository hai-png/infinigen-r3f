/**
 * Noise utilities for terrain generation
 */
import { noise3D, noise2D } from '../../core/util/math/noise';
export { noise3D, noise2D };
export declare function sampleNoise(x: number, y: number, z?: number): number;
export declare function generateNoiseMap(width: number, height: number, scale?: number, octaves?: number): Float32Array;
//# sourceMappingURL=NoiseUtils.d.ts.map