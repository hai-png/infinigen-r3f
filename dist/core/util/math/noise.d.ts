/**
 * Noise Functions
 * Re-exports from MathUtils for backward compatibility with vegetation generators
 */
export { noise3D, noise2D, voronoi2D, ridgedMultifractal, fbm } from '../MathUtils';
export type { NoiseFunction } from '../MathUtils';
/**
 * Legacy Noise3D class wrapper for backward compatibility
 */
export declare class Noise3D {
    private seed;
    constructor(seed?: number);
    perlin(x: number, y: number, z: number): number;
    evaluate(x: number, y: number, z: number): number;
    setSeed(seed: number): void;
}
//# sourceMappingURL=noise.d.ts.map