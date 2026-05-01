/**
 * Glass Material Generator - Clear, frosted, tinted, patterned glass
 * CRITICAL: Must use MeshPhysicalMaterial (not MeshStandardMaterial) for transmission/IOR
 */
import { Color, Texture, CanvasTexture, MeshPhysicalMaterial, RepeatWrapping } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface GlassParams {
  [key: string]: unknown;
  type: 'clear' | 'frosted' | 'tinted' | 'patterned' | 'textured';
  color: Color;
  transmission: number;
  roughness: number;
  thickness: number;
  ior: number;
  patternType: 'none' | 'ribbed' | 'fluted' | 'geometric';
}

export class GlassGenerator extends BaseMaterialGenerator<GlassParams> {
  private static readonly DEFAULT_PARAMS: GlassParams = {
    type: 'clear',
    color: new Color(0xffffff),
    transmission: 0.95,
    roughness: 0.05,
    thickness: 0.01,
    ior: 1.52,
    patternType: 'none',
  };

  constructor() { super(); }
  getDefaultParams(): GlassParams { return { ...GlassGenerator.DEFAULT_PARAMS }; }

  /**
   * Override createBaseMaterial to return MeshPhysicalMaterial
   * This is critical - Glass MUST use MeshPhysicalMaterial for transmission/IOR
   */
  protected createBaseMaterial(): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.95,
      thickness: 0.01,
      ior: 1.52,
      transparent: true,
    });
  }

  generate(params: Partial<GlassParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(GlassGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;

    // CRITICAL: Use MeshPhysicalMaterial - required for glass transmission/IOR
    const material = this.createBaseMaterial();

    material.transparent = true;
    material.transmission = finalParams.transmission;
    material.roughness = finalParams.roughness;
    material.metalness = 0.0;
    material.ior = finalParams.ior;
    material.thickness = finalParams.thickness;
    material.color = finalParams.color;

    // Type-specific adjustments
    if (finalParams.type === 'frosted') {
      material.roughness = 0.6;
      material.transmission = 0.85;
      material.roughnessMap = this.generateFrostedRoughness(finalParams, rng);
    } else if (finalParams.type === 'patterned') {
      material.normalMap = this.generatePatternNormal(finalParams.patternType, rng);
    } else if (finalParams.type === 'tinted') {
      material.transmission = 0.8;
    } else if (finalParams.type === 'textured') {
      material.normalMap = this.generateTexturedNormal(finalParams, rng);
    }

    return {
      material,
      maps: {
        map: null,
        roughnessMap: material.roughnessMap || null,
        normalMap: material.normalMap || null,
      },
      params: finalParams,
    };
  }

  private generatePatternNormal(patternType: string, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    if (patternType === 'ribbed' || patternType === 'fluted') {
      const ribWidth = 20;
      for (let x = 0; x < size; x += ribWidth) {
        const gradient = ctx.createLinearGradient(x, 0, x + ribWidth, 0);
        gradient.addColorStop(0, '#8080ff');
        gradient.addColorStop(0.3, '#a0a0ff');
        gradient.addColorStop(0.5, '#c0c0ff');
        gradient.addColorStop(0.7, '#a0a0ff');
        gradient.addColorStop(1, '#8080ff');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, 0, ribWidth, size);
      }
    } else if (patternType === 'geometric') {
      const noise = new Noise3D(rng.seed);
      const gridSize = 40;
      for (let y = 0; y < size; y += gridSize) {
        for (let x = 0; x < size; x += gridSize) {
          const n = noise.perlin(x / 50, y / 50, 0) * 30;
          const r = Math.max(0, Math.min(255, 128 + n));
          const g = Math.max(0, Math.min(255, 128 + n));
          ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},255)`;
          ctx.fillRect(x, y, gridSize, gridSize);
        }
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateTexturedNormal(params: GlassParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    // Organic texture for textured glass
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const nx = noise.perlin(x / 40, y / 40, 0) * 20;
        const ny = noise.perlin(x / 40, y / 40, 100) * 20;
        const r = Math.max(0, Math.min(255, 128 + nx));
        const g = Math.max(0, Math.min(255, 128 + ny));
        ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},255)`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    return new CanvasTexture(canvas);
  }

  private generateFrostedRoughness(params: GlassParams, rng: SeededRandom): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Frosted glass has variable roughness
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const n = noise.perlin(x / 30, y / 30, 0);
        const value = Math.max(100, Math.min(220, 150 + n * 70));
        ctx.fillStyle = `rgb(${Math.floor(value)},${Math.floor(value)},${Math.floor(value)})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  getVariations(count: number): GlassParams[] {
    const variations: GlassParams[] = [];
    const types: GlassParams['type'][] = ['clear', 'frosted', 'tinted', 'patterned', 'textured'];
    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        color: new Color().setHSL(this.rng.nextFloat() * 0.3, 0.3, 0.8 + this.rng.nextFloat() * 0.2),
        transmission: 0.8 + this.rng.nextFloat() * 0.2,
        roughness: this.rng.nextFloat() * 0.3,
        thickness: 0.005 + this.rng.nextFloat() * 0.02,
        ior: 1.45 + this.rng.nextFloat() * 0.15,
        patternType: 'none',
      });
    }
    return variations;
  }
}
