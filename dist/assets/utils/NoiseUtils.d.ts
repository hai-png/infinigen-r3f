/**
 * Noise Utilities Module
 * Provides Perlin noise and related utility functions for procedural generation
 */
export declare class NoiseUtils {
    private permutationTable;
    private seed;
    constructor(seed?: number);
    /**
     * Set seed for reproducible noise generation
     * @param seed - Seed value for permutation table
     */
    setSeed(seed: number): void;
    /**
     * Generate 2D Perlin noise value at given coordinates
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Noise value in range [-1, 1]
     */
    perlin2D(x: number, y: number): number;
    /**
     * Generate multi-octave noise for more natural patterns
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param octaves - Number of noise layers
     * @param persistence - Amplitude decrease per octave (0-1)
     * @param lacunarity - Frequency increase per octave
     * @returns Combined noise value
     */
    octaveNoise(x: number, y: number, octaves?: number, persistence?: number, lacunarity?: number): number;
    /**
     * Fade function for smooth interpolation (Perlin's 6t^5 - 15t^4 + 10t^3)
     */
    private fade;
    /**
     * Linear interpolation between two values
     */
    private lerp;
    /**
     * Gradient function for noise calculation
     */
    private grad;
    /**
     * Initialize permutation table for noise generation
     * @param seed - Seed value for shuffling
     */
    private initPermutationTable;
    /**
     * Generate random value seeded by coordinates
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Random value in range [0, 1]
     */
    seededRandom(x: number, y: number): number;
    /**
     * Clamp value between min and max
     */
    clamp(value: number, min: number, max: number): number;
    /**
     * Remap value from one range to another
     */
    remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number;
    /**
     * Static method to generate 2D Perlin noise without instantiation
     */
    static perlin2D(x: number, y: number): number;
}
/**
 * Static method to generate 2D Perlin noise without instantiation
 */
export declare function perlin2D(x: number, y: number): number;
/**
 * Static method to generate octave noise without instantiation
 */
export declare function octaveNoise(x: number, y: number, octaves?: number, persistence?: number, lacunarity?: number): number;
/**
 * Static method to get seeded random value without instantiation
 */
export declare function seededRandom(x: number, y: number): number;
//# sourceMappingURL=NoiseUtils.d.ts.map