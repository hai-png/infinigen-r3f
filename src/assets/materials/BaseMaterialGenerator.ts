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

export abstract class BaseMaterialGenerator<T extends Record<string, unknown>> {
  protected rng: SeededRandom;

  constructor(seed?: number) {
    this.rng = new SeededRandom(seed ?? Math.random() * 10000);
  }

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
  protected mergeParams(defaults: T, overrides: Partial<T>): T {
    return { ...defaults, ...overrides };
  }

  /**
   * Create a base material instance
   */
  protected createBaseMaterial(): Material {
    // Override in subclasses to create specific material types
    throw new Error('createBaseMaterial must be implemented by subclass');
  }

  /**
   * Create a texture from a color
   */
  protected createTextureFromColor(color: Color | number, size: number = 256): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const hex = color instanceof Color ? `#${color.getHexString()}` : `#${new Color(color).getHexString()}`;
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, size, size);
    }
    // Note: CanvasTexture requires browser environment
    // In Node.js, this would need a different implementation
    return {} as Texture;
  }

  /**
   * Get pixel color from texture at given coordinates
   */
  protected getPixelColor(texture: Texture, u: number, v: number): Color {
    // Simplified implementation - actual implementation would sample texture
    return new Color(1, 1, 1);
  }

  setSeed(seed: number): void {
    this.rng = new SeededRandom(seed);
  }
}
