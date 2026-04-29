/**
 * Noise utilities for terrain generation
 */
import { noise3D, noise2D, Noise3D } from '../../core/util/math/noise';
export { noise3D, noise2D, Noise3D };
/**
 * NoiseUtils class for procedural noise generation
 * Compatible with original InfiniGen Python API
 */
export declare class NoiseUtils {
    private seed;
    private noiseInstance;
    constructor(seed?: number);
    /**
     * Evaluate Perlin noise at given coordinates
     */
    perlin(x: number, y: number, z?: number): number;
    /**
     * Alias for perlin - evaluate noise at coordinates
     */
    evaluate(x: number, y: number, z?: number): number;
    /**
     * 2D Perlin noise
     */
    perlin2D(x: number, y: number): number;
    /**
     * 3D Perlin noise
     */
    perlin3D(x: number, y: number, z: number): number;
    /**
     * Set the seed for noise generation
     */
    setSeed(seed: number): void;
    /**
     * Get the current seed
     */
    getSeed(): number;
    /**
     * Generate noise value with octaves (fractal Brownian motion)
     */
    fbm(x: number, y: number, z?: number, octaves?: number): number;
    /**
     * Static method for 2D Perlin noise (used by PineDebrisGenerator)
     */
    static perlin2D(x: number, y: number): number;
}
export declare function sampleNoise(x: number, y: number, z?: number): number;
export declare function generateNoiseMap(width: number, height: number, scale?: number, octaves?: number): Float32Array;
//# sourceMappingURL=NoiseUtils.d.ts.map