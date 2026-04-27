/**
 * Glass Material Generator - Clear, frosted, tinted, patterned glass
 */
import { Color, Texture, CanvasTexture, MeshPhysicalMaterial } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from "../../../../core/util/MathUtils";
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

  generate(params: Partial<GlassParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(GlassGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;
    const material = this.createBaseMaterial() as MeshPhysicalMaterial;
    
    material.transparent = true;
    material.transmission = finalParams.transmission;
    material.roughness = finalParams.roughness;
    material.metalness = 0.0;
    material.ior = finalParams.ior;
    material.thickness = finalParams.thickness;
    material.color = finalParams.color;
    
    if (finalParams.type === 'frosted') {
      material.roughness = 0.6;
    } else if (finalParams.type === 'patterned') {
      material.normalMap = this.generatePatternNormal(finalParams.patternType, rng);
    }
    
    return { material, maps: { map: null, roughnessMap: null, normalMap: material.normalMap || null }, params: finalParams };
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
      for (let x = 0; x < size; x += 20) {
        const gradient = ctx.createLinearGradient(x, 0, x + 15, 0);
        gradient.addColorStop(0, '#8080ff');
        gradient.addColorStop(0.5, '#a0a0ff');
        gradient.addColorStop(1, '#8080ff');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, 0, 15, size);
      }
    }
    
    return new CanvasTexture(canvas);
  }

  getVariations(count: number): GlassParams[] {
    const variations: GlassParams[] = [];
    const types: GlassParams['type'][] = ['clear', 'frosted', 'tinted', 'patterned'];
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
