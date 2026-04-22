/**
 * Ceramic Material Generator
 * 
 * Generates procedural ceramic materials.
 * Features glazes, patterns, and surface finishes.
 */

import { Color } from 'three';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';
import { GeneratedMaterial, MaterialProperties } from '../../MaterialSystem';

export type CeramicType = 'porcelain' | 'stoneware' | 'earthenware' | 'terracotta' | 'bone_china';
export type GlazeType = 'glossy' | 'matte' | 'satin' | 'crystalline' | 'reactive';

export interface CeramicParameters {
  type: CeramicType;
  glaze?: GlazeType;
  color?: Color;
  hasPattern?: boolean;
  patternType?: 'solid' | 'marbled' | 'speckled' | 'striped' | 'floral';
  roughness?: number;
}

export class CeramicGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed?: number) {
    this.noise = new NoiseGenerator(seed);
  }
  
  generate(params: CeramicParameters): GeneratedMaterial {
    const {
      type,
      glaze = 'glossy',
      color = new Color(0xFFFFFF),
      hasPattern = false,
      patternType = 'solid',
      roughness: baseRoughness
    } = params;
    
    // Calculate base roughness based on glaze type
    let roughness = baseRoughness ?? this.getGlazeRoughness(glaze);
    let metalness = 0.0;
    
    const properties: MaterialProperties = {
      baseColor: color.clone(),
      roughness,
      metalness,
      hasNormalMap: hasPattern || type === 'terracotta',
      hasRoughnessMap: true,
      hasMetalnessMap: false,
      hasAOMap: false,
      wearLevel: 0,
      dirtLevel: 0,
      customMaps: {}
    };
    
    // Generate clay body texture for unglazed ceramics
    if (type === 'terracotta' || type === 'earthenware') {
      properties.customMaps['clay'] = (u: number, v: number) => {
        return this.noise.perlin(u * 50, v * 50, undefined, { octaves: 4 });
      };
    }
    
    // Add glaze pattern if requested
    if (hasPattern) {
      properties.customMaps['glazePattern'] = (u: number, v: number) => {
        return this.generateGlazePattern(u, v, patternType!);
      };
    }
    
    // Crystalline glazes have special variation
    if (glaze === 'crystalline') {
      properties.customMaps['crystals'] = (u: number, v: number) => {
        const crystalNoise = this.noise.voronoi(u * 30, v * 30);
        return crystalNoise < 0.1 ? 1 : 0;
      };
    }
    
    return {
      type: 'ceramic',
      properties,
      metadata: {
        ceramicType: type,
        glazeType: glaze,
        hasPattern,
        patternType,
        generatedAt: Date.now()
      }
    };
  }
  
  private getGlazeRoughness(glaze: GlazeType): number {
    const roughness: Record<GlazeType, number> = {
      glossy: 0.05,
      satin: 0.2,
      matte: 0.6,
      crystalline: 0.15,
      reactive: 0.25
    };
    return roughness[glaze] ?? 0.3;
  }
  
  private generateGlazePattern(u: number, v: number, patternType: string): number {
    switch (patternType) {
      case 'marbled':
        const marbleX = u * 10 + this.noise.warpedNoise(u * 5, v * 5, 0.5)[0];
        const marble = this.noise.simplex(marbleX, v * 10);
        return (marble + 1) / 2;
        
      case 'speckled':
        const speckleNoise = this.noise.voronoi(u * 100, v * 100);
        return speckleNoise < 0.05 ? 0.3 : 1;
        
      case 'striped':
        return (Math.sin(u * 20 * Math.PI) + 1) / 2;
        
      case 'floral':
        const floralNoise = this.noise.ridge(u * 8, v * 8);
        return Math.pow((floralNoise + 1) / 2, 1.5);
        
      default:
        return 1;
    }
  }
  
  /**
   * Generate cracked/crazed glaze
   */
  generateCracked(params: CeramicParameters, crackDensity: number = 0.3): GeneratedMaterial {
    const material = this.generate(params);
    
    material.properties.customMaps!['cracks'] = (u: number, v: number) => {
      const crackNoise = this.noise.ridge(u * 50 * crackDensity, v * 50 * crackDensity);
      const cracks = crackNoise < 0.1 * crackDensity ? 0.5 : 1;
      return cracks;
    };
    
    // Cracks increase apparent roughness
    material.properties.roughness += crackDensity * 0.1;
    
    material.metadata!.cracked = true;
    material.metadata!.crackDensity = crackDensity;
    
    return material;
  }
  
  /**
   * Generate aged ceramic with wear
   */
  generateAged(params: CeramicParameters, age: number = 0.5): GeneratedMaterial {
    const material = this.generate(params);
    
    // Add wear patterns
    material.properties.customMaps!['wear'] = (u: number, v: number) => {
      const wearNoise = this.noise.perlin(u * 5, v * 5, undefined, { octaves: 3 });
      return (wearNoise + 1) / 2 * age;
    };
    
    // Aging increases roughness and adds dirt
    material.properties.roughness = Math.min(1, material.properties.roughness + age * 0.2);
    material.properties.dirtLevel = age * 0.3;
    
    // Slight color shift
    material.properties.baseColor.offsetHSL(0.02, -age * 0.1, -age * 0.1);
    
    material.metadata!.aged = true;
    material.metadata!.age = age;
    
    return material;
  }
}

// Pre-configured ceramic presets
export const CeramicPresets = {
  whitePorcelain: (seed?: number) => new CeramicGenerator(seed).generate({
    type: 'porcelain',
    glaze: 'glossy',
    color: new Color(0xFFFFF0)
  }),
  
  terracottaPot: (seed?: number) => new CeramicGenerator(seed).generate({
    type: 'terracotta',
    glaze: 'matte',
    color: new Color(0xC1765B)
  }),
  
  blueAndWhite: (seed?: number) => new CeramicGenerator(seed).generate({
    type: 'porcelain',
    glaze: 'glossy',
    color: new Color(0xF0F8FF),
    hasPattern: true,
    patternType: 'floral'
  }),
  
  stonewareMatte: (seed?: number, color = new Color(0x8B7D6B)) => new CeramicGenerator(seed).generate({
    type: 'stoneware',
    glaze: 'matte',
    color
  }),
  
  reactiveGlaze: (seed?: number, color = new Color(0x4A7C8C)) => new CeramicGenerator(seed).generate({
    type: 'stoneware',
    glaze: 'reactive',
    color,
    hasPattern: true,
    patternType: 'marbled'
  })
};

export default CeramicGenerator;
