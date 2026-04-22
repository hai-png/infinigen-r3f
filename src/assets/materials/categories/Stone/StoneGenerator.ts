/**
 * Stone Material Generator
 */
import { Color } from 'three';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';
import { GeneratedMaterial, MaterialProperties } from '../../MaterialSystem';

export type StoneType = 'granite' | 'marble' | 'limestone' | 'slate' | 'sandstone' | 'basalt' | 'quartzite';

export interface StoneParameters {
  type: StoneType;
  color?: Color;
  veinDensity?: number;
  roughness?: number;
  polished?: boolean;
}

export class StoneGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed?: number) {
    this.noise = new NoiseGenerator(seed);
  }
  
  generate(params: StoneParameters): GeneratedMaterial {
    const { type, color = new Color(0x808080), veinDensity = 0.3, roughness: baseRoughness, polished = false } = params;
    
    const roughness = baseRoughness ?? (polished ? 0.1 : 0.7);
    
    const properties: MaterialProperties = {
      baseColor: color.clone(),
      roughness,
      metalness: 0.0,
      hasNormalMap: true,
      hasRoughnessMap: false,
      hasMetalnessMap: false,
      hasAOMap: false,
      wearLevel: 0,
      dirtLevel: 0,
      customMaps: {}
    };
    
    properties.customMaps['veins'] = (u: number, v: number) => {
      if (type === 'marble') {
        const warped = this.noise.warpedNoise(u * 5, v * 5, 0.8);
        return this.noise.simplex(warped[0] * 3, warped[1] * 3);
      }
      if (type === 'granite') {
        return this.noise.voronoi(u * 30, v * 30) < veinDensity ? 0.5 : 1;
      }
      return this.noise.perlin(u * 10, v * 10, undefined, { octaves: 4 });
    };
    
    return {
      type: 'stone',
      properties,
      metadata: { stoneType: type, polished, veinDensity, generatedAt: Date.now() }
    };
  }
}

export const StonePresets = {
  polishedMarble: (seed?: number) => new StoneGenerator(seed).generate({ type: 'marble', color: new Color(0xF5F5F5), polished: true }),
  graniteCountertop: (seed?: number) => new StoneGenerator(seed).generate({ type: 'granite', polished: true }),
  slateTile: (seed?: number) => new StoneGenerator(seed).generate({ type: 'slate', color: new Color(0x4A4A4A) }),
  limestone: (seed?: number) => new StoneGenerator(seed).generate({ type: 'limestone', color: new Color(0xE8DCC4) })
};

export default StoneGenerator;
