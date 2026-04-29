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
    constructor(seed = Math.random() * 1000) {
        this.seed = seed;
        this.noiseInstance = new Noise3D(seed);
    }
    /**
     * Evaluate Perlin noise at given coordinates
     */
    perlin(x, y, z = 0) {
        return this.noiseInstance.perlin(x, y, z);
    }
    /**
     * Alias for perlin - evaluate noise at coordinates
     */
    evaluate(x, y, z = 0) {
        return this.noiseInstance.evaluate(x, y, z);
    }
    /**
     * 2D Perlin noise
     */
    perlin2D(x, y) {
        return this.noiseInstance.perlin(x, y, 0);
    }
    /**
     * 3D Perlin noise
     */
    perlin3D(x, y, z) {
        return this.noiseInstance.perlin(x, y, z);
    }
    /**
     * Set the seed for noise generation
     */
    setSeed(seed) {
        this.seed = seed;
        this.noiseInstance.setSeed(seed);
    }
    /**
     * Get the current seed
     */
    getSeed() {
        return this.seed;
    }
    /**
     * Generate noise value with octaves (fractal Brownian motion)
     */
    fbm(x, y, z = 0, octaves = 4) {
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
    static perlin2D(x, y) {
        return noise2D(x, y);
    }
}
export function sampleNoise(x, y, z = 0) {
    return noise3D(x, y, z);
}
export function generateNoiseMap(width, height, scale = 1.0, octaves = 4) {
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
//# sourceMappingURL=NoiseUtils.js.map