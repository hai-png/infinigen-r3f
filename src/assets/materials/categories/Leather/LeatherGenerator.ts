/**
 * Leather Material Generator
 */
import { Color } from 'three';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';
import { GeneratedMaterial, MaterialProperties } from '../../MaterialSystem';

export type LeatherType = 'full_grain' | 'top_grain' | 'genuine' | 'bonded' | 'suede' | 'nubuck';

export interface LeatherParameters {
  type: LeatherType;
  color?: Color;
  grainIntensity?: number;
  roughness?: number;
  aged?: boolean;
}

export class LeatherGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed?: number) {
    this.noise = new NoiseGenerator(seed);
  }
  
  generate(params: LeatherParameters): GeneratedMaterial {
    const { type, color = new Color(0x8B4513), grainIntensity = 0.5, roughness: baseRoughness, aged = false } = params;
    
    let roughness = baseRoughness ?? (type === 'suede' || type === 'nubuck' ? 0.9 : 0.4);
    
    const properties: MaterialProperties = {
      baseColor: color.clone(),
      roughness,
      metalness: 0.0,
      hasNormalMap: true,
      hasRoughnessMap: false,
      hasMetalnessMap: false,
      hasAOMap: false,
      wearLevel: aged ? 0.5 : 0,
      dirtLevel: 0,
      customMaps: {}
    };
    
    properties.customMaps['grain'] = (u: number, v: number) => {
      const grain = this.noise.perlin(u * 50, v * 50, undefined, { octaves: 4, persistence: 0.5 });
      return (grain + 1) / 2 * grainIntensity;
    };
    
    if (type === 'suede' || type === 'nubuck') {
      properties.customMaps['nap'] = (u: number, v: number) => {
        return this.noise.simplex(u * 100, v * 100, { octaves: 5 });
      };
    }
    
    return {
      type: 'leather',
      properties,
      metadata: { leatherType: type, aged, grainIntensity, generatedAt: Date.now() }
    };
  }
}

export const LeatherPresets = {
  brownFullGrain: (seed?: number) => new LeatherGenerator(seed).generate({ type: 'full_grain', color: new Color(0x654321) }),
  blackTopGrain: (seed?: number) => new LeatherGenerator(seed).generate({ type: 'top_grain', color: new Color(0x1a1a1a) }),
  tanSuede: (seed?: number) => new LeatherGenerator(seed).generate({ type: 'suede', color: new Color(0xD2B48C) }),
  agedBrown: (seed?: number) => new LeatherGenerator(seed).generate({ type: 'full_grain', color: new Color(0x654321), aged: true })
};

export default LeatherGenerator;
