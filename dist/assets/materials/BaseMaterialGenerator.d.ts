/**
 * Base Material Generator
 * Abstract base class for all material generators following Infinigen's pattern
 */
import { Material, Texture, Color } from 'three';
import { SeededRandom } from '../../core/util/math/distributions';
export interface MaterialOutput {
    material: Material;
    maps: {
        map: Texture | null;
        roughnessMap: Texture | null;
        normalMap: Texture | null;
        metalnessMap?: Texture | null;
        aoMap?: Texture | null;
        displacementMap?: Texture | null;
    };
    params: Record<string, unknown>;
}
export declare abstract class BaseMaterialGenerator<T extends Record<string, unknown>> {
    protected rng: SeededRandom;
    constructor(seed?: number);
    /**
     * Get default parameters for this material type
     */
    abstract getDefaultParams(): T;
    /**
     * Generate the material with given parameters
     */
    abstract generate(params?: Partial<T>, seed?: number): MaterialOutput;
    /**
     * Get variations of this material
     */
    abstract getVariations(count: number): T[];
    /**
     * Merge default params with provided params
     */
    protected mergeParams(defaults: T, overrides: Partial<T>): T;
    /**
     * Create a base material instance
     */
    protected createBaseMaterial(): Material;
    /**
     * Create a texture from a color
     */
    protected createTextureFromColor(color: Color | number, size?: number): Texture;
    /**
     * Get pixel color from texture at given coordinates
     */
    protected getPixelColor(texture: Texture, u: number, v: number): Color;
    setSeed(seed: number): void;
}
//# sourceMappingURL=BaseMaterialGenerator.d.ts.map