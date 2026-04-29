/**
 * Noise Functions
 * Re-exports from MathUtils for backward compatibility with vegetation generators
 */
export { noise3D, noise2D, voronoi2D, ridgedMultifractal, fbm } from '../MathUtils';
/**
 * Legacy Noise3D class wrapper for backward compatibility
 */
export class Noise3D {
    constructor(seed = Math.random() * 1000) {
        this.seed = seed;
    }
    perlin(x, y, z) {
        return noise3D(x, y, z, this.seed);
    }
    evaluate(x, y, z) {
        return this.perlin(x, y, z);
    }
    setSeed(seed) {
        this.seed = seed;
    }
}
//# sourceMappingURL=noise.js.map