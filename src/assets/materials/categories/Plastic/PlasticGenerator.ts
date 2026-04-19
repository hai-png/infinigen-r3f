/**
 * Plastic Material Generator
 */
import { Color } from 'three';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';
import { GeneratedMaterial, MaterialProperties } from '../../MaterialSystem';

export type PlasticType = 'abs' | 'polypropylene' | 'pvc' | 'polycarbonate' | 'acrylic' | 'nylon' | 'ptfe';

export interface PlasticParameters {
  type: PlasticType;
  color?: Color;
  transparency?: number;
  roughness?: number;
  hasTexture?: boolean;
}

export class PlasticGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed?: number) {
    this.noise = new NoiseGenerator(seed);
  }
  
  generate(params: PlasticParameters): GeneratedMaterial {
    const { type, color = new Color(0x808080), transparency = 0, roughness = 0.3, hasTexture = false } = params;
    
    const properties: MaterialProperties = {
      baseColor: color.clone(),
      roughness,
      metalness: 0.0,
      hasNormalMap: hasTexture,
      hasRoughnessMap: false,
      hasMetalnessMap: false,
      hasAOMap: false,
      wearLevel: 0,
      dirtLevel: 0,
      customMaps: {}
    };
    
    if (hasTexture) {
      properties.customMaps['texture'] = (u: number, v: number) => {
        return this.noise.simplex(u * 20, v * 20, { octaves: 3 });
      };
    }
    
    return {
      type: 'plastic',
      properties,
      metadata: { plasticType: type, transparency, generatedAt: Date.now() }
    };
  }
}

export const PlasticPresets = {
  whiteABS: (seed?: number) => new PlasticGenerator(seed).generate({ type: 'abs', color: new Color(0xF5F5F5) }),
  blackPP: (seed?: number) => new PlasticGenerator(seed).generate({ type: 'polypropylene', color: new Color(0x1a1a1a) }),
  clearAcrylic: (seed?: number) => new PlasticGenerator(seed).generate({ type: 'acrylic', transparency: 0.9, roughness: 0.05 })
};

export default PlasticGenerator;
