/**
 * Stone Material Generator - Marble, granite, limestone, slate, concrete
 */
import { Color, Texture, CanvasTexture } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { FixedSeed } from '../../../../core/util/MathUtils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface StoneParams {
  [key: string]: unknown;
  type: 'marble' | 'granite' | 'limestone' | 'slate' | 'concrete' | 'travertine';
  color: Color;
  veinColor: Color;
  roughness: number;
  veinIntensity: number;
  veinScale: number;
  polishLevel: number;
}

export class StoneGenerator extends BaseMaterialGenerator<StoneParams> {
  private static readonly DEFAULT_PARAMS: StoneParams = {
    type: 'marble',
    color: new Color(0xf5f5f5),
    veinColor: new Color(0x888888),
    roughness: 0.4,
    veinIntensity: 0.5,
    veinScale: 1.0,
    polishLevel: 0.5,
  };

  constructor() { super(); }
  getDefaultParams(): StoneParams { return { ...StoneGenerator.DEFAULT_PARAMS }; }

  generate(params: Partial<StoneParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(StoneGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new FixedSeed(seed) : this.rng;
    const material = this.createBaseMaterial() as any;
    
    material.color = finalParams.color;
    material.roughness = finalParams.roughness;
    material.metalness = 0.0;
    
    if (finalParams.type === 'marble') {
      material.map = this.generateMarbleTexture(finalParams, rng);
    } else if (finalParams.type === 'granite') {
      material.map = this.generateGraniteTexture(finalParams, rng);
    } else if (finalParams.type === 'concrete') {
      material.map = this.generateConcreteTexture(finalParams, rng);
    }
    
    if (finalParams.polishLevel > 0.7) {
      material.roughness *= 0.5;
      material.clearcoat = finalParams.polishLevel;
    }
    
    material.normalMap = this.generateNormalMap(finalParams, rng);
    
    return { material, maps: { map: material.map || null, roughnessMap: null, normalMap: material.normalMap }, params: finalParams };
  }

  private generateMarbleTexture(params: StoneParams, rng: FixedSeed): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    // Base color
    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    
    // Generate veins using noise
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const n = noise.perlin(x / 100 * params.veinScale, y / 100 * params.veinScale, 0);
        if (Math.abs(n) > 0.6) {
          const intensity = (Math.abs(n) - 0.6) / 0.4 * params.veinIntensity;
          const r = Math.max(0, Math.min(255, params.veinColor.r * 255 * intensity + params.color.r * 255 * (1 - intensity)));
          const g = Math.max(0, Math.min(255, params.veinColor.g * 255 * intensity + params.color.g * 255 * (1 - intensity)));
          const b = Math.max(0, Math.min(255, params.veinColor.b * 255 * intensity + params.color.b * 255 * (1 - intensity)));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
    return new CanvasTexture(canvas);
  }

  private generateGraniteTexture(params: StoneParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 3) {
      for (let x = 0; x < size; x += 3) {
        const n = noise.perlin(x / 30, y / 30, 0);
        const r = Math.max(0, Math.min(255, params.color.r * 255 + n * 40));
        const g = Math.max(0, Math.min(255, params.color.g * 255 + n * 40));
        const b = Math.max(0, Math.min(255, params.color.b * 255 + n * 40));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 3, 3);
      }
    }
    return new CanvasTexture(canvas);
  }

  private generateConcreteTexture(params: StoneParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 50, y / 50, 0) * 25;
        const v = Math.max(0, Math.min(255, params.color.r * 255 + n));
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    return new CanvasTexture(canvas);
  }

  private generateNormalMap(params: StoneParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);
    return new CanvasTexture(canvas);
  }

  getVariations(count: number): StoneParams[] {
    const variations: StoneParams[] = [];
    const types: StoneParams['type'][] = ['marble', 'granite', 'limestone', 'slate', 'concrete'];
    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        color: new Color().setHSL(this.rng.nextFloat() * 0.1, 0.1, 0.7 + this.rng.nextFloat() * 0.2),
        veinColor: new Color().setHSL(this.rng.nextFloat() * 0.1, 0.2, 0.4 + this.rng.nextFloat() * 0.3),
        roughness: 0.3 + this.rng.nextFloat() * 0.4,
        veinIntensity: 0.3 + this.rng.nextFloat() * 0.5,
        veinScale: 0.5 + this.rng.nextFloat() * 1.5,
        polishLevel: this.rng.nextFloat(),
      });
    }
    return variations;
  }
}
