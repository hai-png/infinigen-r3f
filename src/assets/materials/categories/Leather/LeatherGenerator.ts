/**
 * Leather Material Generator - Full-grain, top-grain, suede, distressed
 */
import { Color, Texture, CanvasTexture, MeshPhysicalMaterial } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { FixedSeed } from '../../../../core/util/MathUtils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface LeatherParams {
  [key: string]: unknown;
  type: 'full-grain' | 'top-grain' | 'suede' | 'distressed' | 'patent';
  color: Color;
  roughness: number;
  grainIntensity: number;
  wearLevel: number;
  sheen: number;
}

export class LeatherGenerator extends BaseMaterialGenerator<LeatherParams> {
  private static readonly DEFAULT_PARAMS: LeatherParams = {
    type: 'full-grain',
    color: new Color(0x4a3728),
    roughness: 0.4,
    grainIntensity: 0.5,
    wearLevel: 0.0,
    sheen: 0.2,
  };

  constructor() { super(); }
  getDefaultParams(): LeatherParams { return { ...LeatherGenerator.DEFAULT_PARAMS }; }

  generate(params: Partial<LeatherParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(LeatherGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new FixedSeed(seed) : this.rng;
    const material = this.createBaseMaterial() as MeshPhysicalMaterial;
    
    material.color = finalParams.color;
    material.roughness = finalParams.roughness;
    material.metalness = 0.0;
    
    if (finalParams.type === 'suede') {
      material.roughness = 0.8;
    } else if (finalParams.type === 'patent') {
      material.roughness = 0.1;
      material.clearcoat = 1.0;
    }
    
    material.map = this.generateGrainTexture(finalParams, rng);
    material.normalMap = this.generateNormalMap(finalParams, rng);
    material.roughnessMap = this.generateRoughnessMap(finalParams, rng);
    
    return { material, maps: { map: material.map, roughnessMap: material.roughnessMap, normalMap: material.normalMap }, params: finalParams };
  }

  private generateGrainTexture(params: LeatherParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const n = noise.perlin(x / 20, y / 20, 0) * params.grainIntensity * 30;
        const r = Math.max(0, Math.min(255, params.color.r * 255 + n));
        const g = Math.max(0, Math.min(255, params.color.g * 255 + n));
        const b = Math.max(0, Math.min(255, params.color.b * 255 + n));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    return new CanvasTexture(canvas);
  }

  private generateNormalMap(params: LeatherParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);
    
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 30, y / 30, 0) * 20;
        ctx.fillStyle = `rgb(${128+n}, ${128+n}, 255)`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    return new CanvasTexture(canvas);
  }

  private generateRoughnessMap(params: LeatherParams, rng: FixedSeed): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    const base = Math.floor(params.roughness * 255);
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, 0, size, size);
    return new CanvasTexture(canvas);
  }

  getVariations(count: number): LeatherParams[] {
    const variations: LeatherParams[] = [];
    const types: LeatherParams['type'][] = ['full-grain', 'top-grain', 'suede', 'distressed', 'patent'];
    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        color: new Color().setHSL(0.05 + this.rng.nextFloat() * 0.1, 0.4 + this.rng.nextFloat() * 0.3, 0.2 + this.rng.nextFloat() * 0.4),
        roughness: 0.2 + this.rng.nextFloat() * 0.5,
        grainIntensity: 0.3 + this.rng.nextFloat() * 0.5,
        wearLevel: this.rng.nextFloat() * 0.4,
        sheen: this.rng.nextFloat() * 0.4,
      });
    }
    return variations;
  }
}
