/**
 * Wood Material Generator
 * 
 * Generates procedural wood materials with various species.
 * Features grain patterns, color variations, and surface imperfections.
 */

import { Color } from 'three';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';
import { GeneratedMaterial, MaterialProperties } from '../../MaterialSystem';

export type WoodSpecies = 'oak' | 'pine' | 'walnut' | 'mahogany' | 'cherry' | 'maple' | 'birch' | 'ash';

export interface WoodParameters {
  species: WoodSpecies;
  grainScale?: number;
  grainContrast?: number;
  colorVariation?: number;
  hasKnots?: boolean;
  knotDensity?: number;
  finish?: 'matte' | 'satin' | 'gloss';
}

export class WoodGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed?: number) {
    this.noise = new NoiseGenerator(seed);
  }
  
  generate(params: WoodParameters): GeneratedMaterial {
    const {
      species,
      grainScale = 10,
      grainContrast = 0.3,
      colorVariation = 0.1,
      hasKnots = true,
      knotDensity = 0.05,
      finish = 'satin'
    } = params;
    
    const baseColor = this.getSpeciesColor(species);
    const grainColor = this.getGrainColor(species);
    
    // Calculate PBR properties based on finish
    let roughness = 0.6;
    let metalness = 0.0;
    
    switch (finish) {
      case 'matte':
        roughness = 0.8;
        break;
      case 'satin':
        roughness = 0.5;
        break;
      case 'gloss':
        roughness = 0.2;
        break;
    }
    
    const properties: MaterialProperties = {
      baseColor,
      roughness,
      metalness,
      hasNormalMap: true,
      hasRoughnessMap: true,
      hasMetalnessMap: false,
      hasAOMap: false,
      wearLevel: 0,
      dirtLevel: 0,
      customMaps: {}
    };
    
    // Generate grain texture
    properties.customMaps['grain'] = (u: number, v: number) => {
      const grainX = u * grainScale;
      const grainY = v * grainScale * 0.1;
      
      // Primary grain lines
      let grain = this.noise.simplex(grainX, grainY * 0.5, { octaves: 4, persistence: 0.5 });
      
      // Add fine grain details
      const fineGrain = this.noise.simplex(grainX * 3, grainY * 2, { octaves: 2 });
      grain += fineGrain * 0.3;
      
      // Add knots if enabled
      if (hasKnots) {
        const knotNoise = this.noise.voronoi(u * 20, v * 20);
        const knots = knotNoise < knotDensity ? 1 : 0;
        grain += knots * grainContrast;
      }
      
      // Normalize and apply contrast
      grain = (grain + 1) / 2; // Normalize to [0, 1]
      grain = Math.pow(grain, 1 / grainContrast);
      
      return grain;
    };
    
    // Generate color variation
    properties.customMaps['colorVariation'] = (u: number, v: number) => {
      const variation = this.noise.perlin(u * 5, v * 5, undefined, { octaves: 3 });
      return (variation + 1) / 2 * colorVariation;
    };
    
    // Generate normal map for grain relief
    properties.customMaps['normalStrength'] = (u: number, v: number) => {
      const grainX = u * grainScale;
      const grain = this.noise.simplex(grainX, v * grainScale * 0.1, { octaves: 3 });
      return Math.abs(grain) * 0.02; // Small displacement
    };
    
    return {
      type: 'wood',
      properties,
      metadata: {
        species,
        finish,
        hasKnots,
        generatedAt: Date.now()
      }
    };
  }
  
  private getSpeciesColor(species: WoodSpecies): Color {
    const colors: Record<WoodSpecies, number> = {
      oak: 0xC4A484,
      pine: 0xD2B48C,
      walnut: 0x5C4033,
      mahogany: 0x4A2C2A,
      cherry: 0x8B4513,
      maple: 0xF5DEB3,
      birch: 0xF5F5DC,
      ash: 0xD2B48C
    };
    
    const color = new Color(colors[species]);
    
    // Add slight random variation
    const variation = (Math.random() - 0.5) * 0.1;
    color.offsetHSL(0, 0, variation);
    
    return color;
  }
  
  private getGrainColor(species: WoodSpecies): Color {
    const baseColor = this.getSpeciesColor(species);
    const grainColor = baseColor.clone();
    
    // Grain is typically darker
    grainColor.multiplyScalar(0.7);
    
    return grainColor;
  }
  
  /**
   * Generate aged/weathered wood
   */
  generateWeathered(params: WoodParameters, age: number = 0.5): GeneratedMaterial {
    const material = this.generate(params);
    
    // Increase roughness with age
    material.properties.roughness = Math.min(1, material.properties.roughness + age * 0.3);
    
    // Desaturate color
    material.properties.baseColor.offsetHSL(0, -age * 0.3, -age * 0.2);
    
    // Add weathering patterns
    material.properties.customMaps['weathering'] = (u: number, v: number) => {
      const weather = this.noise.ridge(u * 3, v * 3);
      return weather * age;
    };
    
    material.metadata!.weathered = true;
    material.metadata!.age = age;
    
    return material;
  }
  
  /**
   * Generate stained wood
   */
  generateStained(params: WoodParameters, stainColor: Color, intensity: number = 0.5): GeneratedMaterial {
    const material = this.generate(params);
    
    // Blend base color with stain
    material.properties.baseColor.lerp(stainColor, intensity);
    
    // Stain typically darkens and adds slight gloss
    material.properties.roughness *= (1 - intensity * 0.3);
    
    material.metadata!.stained = true;
    material.metadata!.stainColor = stainColor.getHex();
    material.metadata!.stainIntensity = intensity;
    
    return material;
  }
}

// Pre-configured wood presets
export const WoodPresets = {
  rusticOak: (seed?: number) => new WoodGenerator(seed).generate({
    species: 'oak',
    grainScale: 15,
    grainContrast: 0.4,
    hasKnots: true,
    knotDensity: 0.08,
    finish: 'matte'
  }),
  
  polishedWalnut: (seed?: number) => new WoodGenerator(seed).generate({
    species: 'walnut',
    grainScale: 8,
    grainContrast: 0.3,
    hasKnots: false,
    finish: 'gloss'
  }),
  
  naturalPine: (seed?: number) => new WoodGenerator(seed).generate({
    species: 'pine',
    grainScale: 12,
    grainContrast: 0.25,
    hasKnots: true,
    knotDensity: 0.06,
    finish: 'satin'
  }),
  
  antiqueMahogany: (seed?: number) => {
    const gen = new WoodGenerator(seed);
    return gen.generateWeathered({
      species: 'mahogany',
      grainScale: 10,
      grainContrast: 0.35,
      hasKnots: true,
      finish: 'satin'
    }, 0.7);
  }
};

export default WoodGenerator;
