/**
 * Glass Material Generator
 */
import { Color } from 'three';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';
import { GeneratedMaterial, MaterialProperties } from '../../MaterialSystem';

export type GlassType = 'clear' | 'frosted' | 'tinted' | 'stained' | 'textured' | 'mirrored';

export interface GlassParameters {
  type: GlassType;
  color?: Color;
  transmission?: number;
  roughness?: number;
  thickness?: number;
}

export class GlassGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed?: number) {
    this.noise = new NoiseGenerator(seed);
  }
  
  generate(params: GlassParameters): GeneratedMaterial {
    const { type, color = new Color(0xFFFFFF), transmission = 1, roughness = 0, thickness = 1 } = params;
    
    let finalRoughness = roughness;
    if (type === 'frosted') finalRoughness = 0.5;
    if (type === 'textured') finalRoughness = 0.3;
    
    const properties: MaterialProperties = {
      baseColor: color.clone(),
      roughness: finalRoughness,
      metalness: 0.0,
      hasNormalMap: type === 'textured' || type === 'frosted',
      hasRoughnessMap: false,
      hasMetalnessMap: false,
      hasAOMap: false,
      wearLevel: 0,
      dirtLevel: 0,
      customMaps: {}
    };
    
    if (type === 'textured') {
      properties.customMaps['pattern'] = (u: number, v: number) => {
        return this.noise.ridge(u * 15, v * 15);
      };
    }
    
    return {
      type: 'glass',
      properties,
      metadata: { glassType: type, transmission, thickness, generatedAt: Date.now() }
    };
  }
}

export const GlassPresets = {
  clear: (seed?: number) => new GlassGenerator(seed).generate({ type: 'clear' }),
  frosted: (seed?: number) => new GlassGenerator(seed).generate({ type: 'frosted' }),
  tintedBlue: (seed?: number) => new GlassGenerator(seed).generate({ type: 'tinted', color: new Color(0xADD8E6) }),
  mirrored: (seed?: number) => new GlassGenerator(seed).generate({ type: 'mirrored', roughness: 0.02 })
};

export default GlassGenerator;
