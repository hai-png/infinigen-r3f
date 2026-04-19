/**
 * Metal Material Generator
 * 
 * Generates procedural metal materials with various types.
 * Features brushed patterns, oxidation, and surface finishes.
 */

import { Color } from 'three';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';
import { GeneratedMaterial, MaterialProperties } from '../../MaterialSystem';

export type MetalType = 'steel' | 'aluminum' | 'brass' | 'copper' | 'bronze' | 'gold' | 'silver' | 'iron' | 'titanium' | 'chrome';

export interface MetalParameters {
  type: MetalType;
  brushed?: boolean;
  brushDirection?: 'horizontal' | 'vertical' | 'diagonal';
  brushScale?: number;
  roughness?: number;
  hasOxidation?: boolean;
  oxidationLevel?: number;
  polished?: boolean;
}

export class MetalGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed?: number) {
    this.noise = new NoiseGenerator(seed);
  }
  
  generate(params: MetalParameters): GeneratedMaterial {
    const {
      type,
      brushed = false,
      brushDirection = 'horizontal',
      brushScale = 50,
      roughness: baseRoughness,
      hasOxidation = false,
      oxidationLevel = 0.2,
      polished = false
    } = params;
    
    const baseColor = this.getMetalColor(type);
    
    // Calculate base roughness
    let roughness = baseRoughness ?? (polished ? 0.1 : 0.4);
    let metalness = 1.0;
    
    const properties: MaterialProperties = {
      baseColor,
      roughness,
      metalness,
      hasNormalMap: brushed || hasOxidation,
      hasRoughnessMap: true,
      hasMetalnessMap: false,
      hasAOMap: false,
      wearLevel: 0,
      dirtLevel: 0,
      customMaps: {}
    };
    
    // Generate brushed pattern if requested
    if (brushed) {
      properties.customMaps['brush'] = (u: number, v: number) => {
        let brushU = u * brushScale;
        let brushV = v * brushScale;
        
        // Rotate coordinates based on direction
        if (brushDirection === 'diagonal') {
          const temp = brushU;
          brushU = brushU + brushV;
          brushV = brushV - temp;
        } else if (brushDirection === 'vertical') {
          const temp = brushU;
          brushU = brushV;
          brushV = temp;
        }
        
        // Generate fine parallel lines
        const lines = this.noise.simplex(brushU, brushV * 0.01, { octaves: 2 });
        return (lines + 1) / 2;
      };
      
      // Brushing adds slight anisotropy (simulated via roughness variation)
      properties.customMaps['roughnessVariation'] = (u: number, v: number) => {
        const brush = properties.customMaps!['brush'](u, v);
        return 0.8 + brush * 0.2;
      };
    }
    
    // Add oxidation if requested
    if (hasOxidation) {
      properties.customMaps['oxidation'] = (u: number, v: number) => {
        const oxNoise = this.noise.perlin(u * 10, v * 10, undefined, { octaves: 4 });
        const oxPattern = Math.pow((oxNoise + 1) / 2, 2);
        return oxPattern * oxidationLevel;
      };
      
      // Oxidation increases roughness
      properties.roughness = Math.min(1, properties.roughness + oxidationLevel * 0.3);
    }
    
    return {
      type: 'metal',
      properties,
      metadata: {
        metalType: type,
        brushed,
        brushDirection,
        polished,
        hasOxidation,
        oxidationLevel,
        generatedAt: Date.now()
      }
    };
  }
  
  private getMetalColor(type: MetalType): Color {
    const colors: Record<MetalType, number> = {
      steel: 0xBCC6CC,
      aluminum: 0xD3D3D3,
      brass: 0xB5A642,
      copper: 0xB87333,
      bronze: 0xCD7F32,
      gold: 0xFFD700,
      silver: 0xC0C0C0,
      iron: 0x6B6B6B,
      titanium: 0x8B8D8F,
      chrome: 0xE8E8E8
    };
    
    const color = new Color(colors[type]);
    
    // Add slight random variation
    const variation = (Math.random() - 0.5) * 0.05;
    color.offsetHSL(0, 0, variation);
    
    return color;
  }
  
  /**
   * Generate patinated metal (aged copper/bronze)
   */
  generatePatinated(params: MetalParameters, age: number = 0.7): GeneratedMaterial {
    if (params.type !== 'copper' && params.type !== 'bronze' && params.type !== 'brass') {
      console.warn('Patination only applies to copper-based metals');
    }
    
    const material = this.generate(params);
    
    // Patina is green/blue-green
    const patinaColor = new Color(0x4A7C59);
    
    material.properties.customMaps!['patina'] = (u: number, v: number) => {
      const patinaNoise = this.noise.voronoi(u * 15, v * 15);
      const patinaPattern = patinaNoise < age * 0.3 ? 1 : 0;
      return patinaPattern;
    };
    
    material.metadata!.patinated = true;
    material.metadata!.age = age;
    material.metadata!.patinaColor = patinaColor.getHex();
    
    return material;
  }
  
  /**
   * Generate rusty metal (iron/steel)
   */
  generateRusty(params: MetalParameters, rustLevel: number = 0.5): GeneratedMaterial {
    if (params.type !== 'iron' && params.type !== 'steel') {
      console.warn('Rust only applies to ferrous metals');
    }
    
    const material = this.generate(params);
    
    // Rust color
    const rustColor = new Color(0x8B4513);
    
    material.properties.customMaps!['rust'] = (u: number, v: number) => {
      const rustNoise = this.noise.ridge(u * 8, v * 8);
      const rustPattern = Math.pow((rustNoise + 1) / 2, 1.5);
      return rustPattern * rustLevel;
    };
    
    // Rust significantly increases roughness
    material.properties.roughness = Math.min(1, material.properties.roughness + rustLevel * 0.5);
    
    material.metadata!.rusted = true;
    material.metadata!.rustLevel = rustLevel;
    material.metadata!.rustColor = rustColor.getHex();
    
    return material;
  }
  
  /**
   * Generate anodized metal (aluminum/titanium)
   */
  generateAnodized(params: MetalParameters, color: Color, intensity: number = 0.8): GeneratedMaterial {
    if (params.type !== 'aluminum' && params.type !== 'titanium') {
      console.warn('Anodization typically applies to aluminum or titanium');
    }
    
    const material = this.generate(params);
    
    // Blend base metal color with anodized color
    material.properties.baseColor.lerp(color, intensity);
    
    // Anodization can add iridescent effects (simulated via subtle color variation)
    material.properties.customMaps!['anodize'] = (u: number, v: number) => {
      const iridescence = this.noise.simplex(u * 20, v * 20, { octaves: 2 });
      return (iridescence + 1) / 2 * 0.1; // Subtle variation
    };
    
    material.metadata!.anodized = true;
    material.metadata!.anodizeColor = color.getHex();
    material.metadata!.anodizeIntensity = intensity;
    
    return material;
  }
}

// Pre-configured metal presets
export const MetalPresets = {
  brushedSteel: (seed?: number) => new MetalGenerator(seed).generate({
    type: 'steel',
    brushed: true,
    brushDirection: 'horizontal',
    brushScale: 50,
    roughness: 0.3
  }),
  
  polishedGold: (seed?: number) => new MetalGenerator(seed).generate({
    type: 'gold',
    polished: true,
    roughness: 0.05
  }),
  
  agedCopper: (seed?: number) => {
    const gen = new MetalGenerator(seed);
    return gen.generatePatinated({
      type: 'copper',
      roughness: 0.5
    }, 0.6);
  },
  
  rustyIron: (seed?: number) => {
    const gen = new MetalGenerator(seed);
    return gen.generateRusty({
      type: 'iron',
      roughness: 0.6
    }, 0.7);
  },
  
  anodizedAluminum: (seed?: number, color = new Color(0x4169E1)) => {
    const gen = new MetalGenerator(seed);
    return gen.generateAnodized({
      type: 'aluminum',
      brushed: true,
      roughness: 0.4
    }, color, 0.7);
  },
  
  chrome: (seed?: number) => new MetalGenerator(seed).generate({
    type: 'chrome',
    polished: true,
    roughness: 0.02
  })
};

export default MetalGenerator;
