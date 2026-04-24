/**
 * Plastic Material Generator - Matte, glossy, textured plastic
 */
import { Color, Texture, CanvasTexture } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../BaseMaterialGenerator';
import { FixedSeed } from '../../../core/util/math/utils';
import { Noise3D } from '../../../core/util/math/noise';

export interface PlasticParams {
  type: 'matte' | 'glossy' | 'textured' | 'translucent' | 'metallic';
  color: Color;
  roughness: number;
  metalness: number;
  transmission: number;
  textureScale: number;
}

export class PlasticGenerator extends BaseMaterialGenerator<PlasticParams> {
  private static readonly DEFAULT_PARAMS: PlasticParams = {
    type: 'matte',
    color: new Color(0xffffff),
    roughness: 0.5,
    metalness: 0.0,
    transmission: 0.0,
    textureScale: 1.0,
  };

  constructor() { super(); }
  getDefaultParams(): PlasticParams { return { ...PlasticGenerator.DEFAULT_PARAMS }; }

  generate(params: Partial<PlasticParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(PlasticGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new FixedSeed(seed) : this.rng;
    const material = this.createBaseMaterial();
    
    material.color = finalParams.color;
    material.roughness = finalParams.roughness;
    material.metalness = finalParams.metalness;
    material.transmission = finalParams.transmission;
    
    if (finalParams.type === 'glossy') material.roughness = 0.1;
    else if (finalParams.type === 'matte') material.roughness = 0.6;
    else if (finalParams.type === 'textured') {
      material.map = this.generateTexture(finalParams, rng);
      material.normalMap = this.generateNormalMap(finalParams, rng);
    }
    
    return { material, maps: { map: material.map || null, roughnessMap: null, normalMap: material.normalMap || null }, params: finalParams };
  }

  private generateTexture(params: PlasticParams, rng: FixedSeed): Texture {
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
        const n = noise.perlin(x / 50, y / 50, 0) * 20;
        const r = Math.max(0, Math.min(255, params.color.r * 255 + n));
        const g = Math.max(0, Math.min(255, params.color.g * 255 + n));
        const b = Math.max(0, Math.min(255, params.color.b * 255 + n));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    return new CanvasTexture(canvas);
  }

  private generateNormalMap(params: PlasticParams, rng: FixedSeed): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);
    return new CanvasTexture(canvas);
  }

  getVariations(count: number): PlasticParams[] {
    const variations: PlasticParams[] = [];
    const types: PlasticParams['type'][] = ['matte', 'glossy', 'textured', 'translucent'];
    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        color: new Color().setHSL(this.rng.nextFloat(), 0.6, 0.5),
        roughness: 0.2 + this.rng.nextFloat() * 0.5,
        metalness: this.rng.nextFloat() * 0.3,
        transmission: this.rng.nextFloat() * 0.3,
        textureScale: 0.5 + this.rng.nextFloat() * 1.5,
      });
    }
    return variations;
  }
}
