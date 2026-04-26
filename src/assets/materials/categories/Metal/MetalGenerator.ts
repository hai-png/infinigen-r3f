/**
 * Metal Material Generator - Steel, aluminum, brass, copper, iron with patina
 */
import { Color, Texture, CanvasTexture } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { FixedSeed } from '../../../../core/util/math/utils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface MetalParams {
  [key: string]: unknown;
  type: 'steel' | 'aluminum' | 'brass' | 'copper' | 'iron' | 'gold' | 'silver';
  color: Color;
  roughness: number;
  metalness: number;
  oxidation: number;
  brushed: boolean;
  brushedDirection: number;
}

export class MetalGenerator extends BaseMaterialGenerator<MetalParams> {
  private static readonly DEFAULT_PARAMS: MetalParams = {
    type: 'steel',
    color: new Color(0x888888),
    roughness: 0.3,
    metalness: 1.0,
    oxidation: 0.0,
    brushed: false,
    brushedDirection: 0,
  };

  constructor() { super(); }
  getDefaultParams(): MetalParams { return { ...MetalGenerator.DEFAULT_PARAMS }; }

  generate(params: Partial<MetalParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(MetalGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new FixedSeed(seed) : this.rng;
    const material = this.createBaseMaterial() as any;
    
    material.metalness = finalParams.metalness;
    material.roughness = finalParams.roughness;
    material.color = finalParams.color;
    
    if (finalParams.brushed) {
      material.normalMap = this.generateBrushedNormal(finalParams, rng);
    }
    
    if (finalParams.oxidation > 0) {
      this.applyOxidation(material, finalParams, rng);
    }
    
    material.roughnessMap = this.generateRoughnessMap(finalParams, rng);
    
    return { material, maps: { map: null, roughnessMap: material.roughnessMap, normalMap: material.normalMap || null }, params: finalParams };
  }

  private generateBrushedNormal(params: MetalParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);
    
    for (let i = 0; i < size; i += 2) {
      const brightness = 128 + Math.sin(i / 5) * 10;
      ctx.fillStyle = `rgb(${brightness}, ${brightness}, 255)`;
      ctx.fillRect(0, i, size, 2);
    }
    
    return new CanvasTexture(canvas);
  }

  private applyOxidation(material: any, params: MetalParams, rng: FixedSeed): void {
    // Oxidation affects color and roughness
    material.roughness = Math.min(1.0, material.roughness + params.oxidation * 0.4);
  }

  private generateRoughnessMap(params: MetalParams, rng: FixedSeed): Texture {
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

  getVariations(count: number): MetalParams[] {
    const variations: MetalParams[] = [];
    const types: MetalParams['type'][] = ['steel', 'aluminum', 'brass', 'copper', 'iron'];
    for (let i = 0; i < count; i++) {
      const type = types[this.rng.nextInt(0, types.length - 1)];
      let color = new Color(0x888888);
      if (type === 'brass') color = new Color(0xffd700);
      else if (type === 'copper') color = new Color(0xb87333);
      else if (type === 'gold') color = new Color(0xffd700);
      
      variations.push({
        type,
        color,
        roughness: 0.1 + this.rng.nextFloat() * 0.4,
        metalness: 0.8 + this.rng.nextFloat() * 0.2,
        oxidation: this.rng.nextFloat() * 0.5,
        brushed: this.rng.nextFloat() > 0.5,
        brushedDirection: this.rng.nextFloat() * Math.PI,
      });
    }
    return variations;
  }
}
