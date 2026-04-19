/**
 * Fabric Material Generator
 * 
 * Generates procedural fabric materials with various weaves.
 * Features weave patterns, fiber textures, and material properties.
 */

import { Color } from 'three';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';
import { GeneratedMaterial, MaterialProperties } from '../../MaterialSystem';

export type FabricWeave = 'plain' | 'twill' | 'satin' | 'basket' | 'herringbone' | 'denim' | 'knit';
export type FabricFiber = 'cotton' | 'silk' | 'wool' | 'linen' | 'polyester' | 'nylon' | 'velvet' | 'leather';

export interface FabricParameters {
  weave: FabricWeave;
  fiber?: FabricFiber;
  color?: Color;
  patternScale?: number;
  hasPattern?: boolean;
  patternType?: 'solid' | 'striped' | 'checkered' | 'floral' | 'geometric';
  roughness?: number;
  thickness?: number;
}

export class FabricGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed?: number) {
    this.noise = new NoiseGenerator(seed);
  }
  
  generate(params: FabricParameters): GeneratedMaterial {
    const {
      weave,
      fiber = 'cotton',
      color = new Color(0x888888),
      patternScale = 20,
      hasPattern = false,
      patternType = 'solid',
      roughness: baseRoughness,
      thickness = 1.0
    } = params;
    
    // Calculate base properties based on fiber type
    let roughness = baseRoughness ?? this.getFiberRoughness(fiber);
    let metalness = 0.0;
    
    const properties: MaterialProperties = {
      baseColor: color.clone(),
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
    
    // Generate weave pattern
    properties.customMaps['weave'] = (u: number, v: number) => {
      return this.generateWeavePattern(u, v, weave, patternScale);
    };
    
    // Generate fiber texture
    properties.customMaps['fiber'] = (u: number, v: number) => {
      return this.generateFiberTexture(u, v, fiber);
    };
    
    // Add surface pattern if requested
    if (hasPattern) {
      properties.customMaps['pattern'] = (u: number, v: number) => {
        return this.generateSurfacePattern(u, v, patternType!, patternScale);
      };
    }
    
    // Normal map strength based on weave and thickness
    properties.customMaps['normalStrength'] = (u: number, v: number) => {
      const weaveDepth = this.getWeaveDepth(weave);
      return weaveDepth * thickness * 0.05;
    };
    
    return {
      type: 'fabric',
      properties,
      metadata: {
        weave,
        fiber,
        hasPattern,
        patternType,
        thickness,
        generatedAt: Date.now()
      }
    };
  }
  
  private getFiberRoughness(fiber: FabricFiber): number {
    const roughness: Record<FabricFiber, number> = {
      cotton: 0.7,
      silk: 0.3,
      wool: 0.8,
      linen: 0.6,
      polyester: 0.4,
      nylon: 0.35,
      velvet: 0.9,
      leather: 0.5
    };
    return roughness[fiber] ?? 0.6;
  }
  
  private getWeaveDepth(weave: FabricWeave): number {
    const depths: Record<FabricWeave, number> = {
      plain: 0.3,
      twill: 0.5,
      satin: 0.2,
      basket: 0.6,
      herringbone: 0.5,
      denim: 0.4,
      knit: 0.7
    };
    return depths[weave] ?? 0.4;
  }
  
  private generateWeavePattern(u: number, v: number, weave: FabricWeave, scale: number): number {
    const uScaled = u * scale;
    const vScaled = v * scale;
    
    switch (weave) {
      case 'plain':
        // Simple over-under pattern
        const plainU = Math.sin(uScaled * Math.PI) > 0 ? 1 : 0;
        const plainV = Math.sin(vScaled * Math.PI) > 0 ? 1 : 0;
        return (plainU + plainV) / 2;
        
      case 'twill':
        // Diagonal rib pattern
        const twillNoise = this.noise.simplex(uScaled * 0.5 + vScaled * 0.5, uScaled * 0.5 - vScaled * 0.5);
        return (twillNoise + 1) / 2;
        
      case 'satin':
        // Smooth with occasional floats
        const satinNoise = this.noise.perlin(uScaled * 0.3, vScaled * 0.3, undefined, { octaves: 2 });
        return Math.pow((satinNoise + 1) / 2, 1.5);
        
      case 'basket':
        // Checkerboard-like pattern
        const basketU = Math.floor(uScaled) % 2;
        const basketV = Math.floor(vScaled) % 2;
        return (basketU + basketV) % 2 === 0 ? 0.8 : 0.2;
        
      case 'herringbone':
        // V-shaped pattern
        const herringU = Math.floor(uScaled);
        const herringV = Math.floor(vScaled);
        const phase = herringU % 4 < 2 ? 1 : -1;
        const herring = Math.sin((herringV + herringU * phase) * 0.5);
        return (herring + 1) / 2;
        
      case 'denim':
        // Twill with color variation
        const denimNoise = this.noise.simplex(uScaled, vScaled * 0.5, { octaves: 3 });
        return (denimNoise + 1) / 2;
        
      case 'knit':
        // Interlocking loops
        const knitNoise = this.noise.voronoi(uScaled * 0.8, vScaled * 0.8);
        return Math.min(1, knitNoise * 2);
        
      default:
        return 0.5;
    }
  }
  
  private generateFiberTexture(u: number, v: number, fiber: FabricFiber): number {
    switch (fiber) {
      case 'cotton':
        // Soft, slightly fuzzy
        return this.noise.perlin(u * 30, v * 30, undefined, { octaves: 3, persistence: 0.4 });
        
      case 'silk':
        // Smooth, fine fibers
        return this.noise.simplex(u * 50, v * 50, { octaves: 2, persistence: 0.3 });
        
      case 'wool':
        // Coarse, curly fibers
        return this.noise.ridge(u * 25, v * 25) * 0.5;
        
      case 'linen':
        // Irregular, slubbed texture
        const linenNoise = this.noise.perlin(u * 20, v * 20, undefined, { octaves: 4 });
        return Math.abs(linenNoise);
        
      case 'velvet':
        // Dense pile
        const velvetNoise = this.noise.simplex(u * 40, v * 40, { octaves: 4 });
        return Math.pow((velvetNoise + 1) / 2, 2);
        
      default:
        return this.noise.simplex(u * 30, v * 30);
    }
  }
  
  private generateSurfacePattern(u: number, v: number, patternType: string, scale: number): number {
    switch (patternType) {
      case 'striped':
        return (Math.sin(u * scale * Math.PI) + 1) / 2;
        
      case 'checkered':
        const checkU = Math.floor(u * scale * 0.5) % 2;
        const checkV = Math.floor(v * scale * 0.5) % 2;
        return (checkU + checkV) % 2 === 0 ? 1 : 0;
        
      case 'floral':
        const floralNoise = this.noise.voronoi(u * scale * 0.3, v * scale * 0.3);
        return Math.sin(floralNoise * Math.PI * 4) * 0.5 + 0.5;
        
      case 'geometric':
        const geoNoise = this.noise.ridge(u * scale * 0.4, v * scale * 0.4);
        return Math.pow((geoNoise + 1) / 2, 1.2);
        
      default:
        return 0;
    }
  }
  
  /**
   * Generate worn/distressed fabric
   */
  generateWorn(params: FabricParameters, wearLevel: number = 0.5): GeneratedMaterial {
    const material = this.generate(params);
    
    // Worn fabric is rougher
    material.properties.roughness = Math.min(1, material.properties.roughness + wearLevel * 0.2);
    
    // Add wear patterns
    material.properties.customMaps!['wear'] = (u: number, v: number) => {
      const wearNoise = this.noise.perlin(u * 10, v * 10, undefined, { octaves: 3 });
      return (wearNoise + 1) / 2 * wearLevel;
    };
    
    // Faded color
    const fadeAmount = wearLevel * 0.3;
    material.properties.baseColor.offsetHSL(0, -fadeAmount * 0.5, fadeAmount * 0.2);
    
    material.metadata!.worn = true;
    material.metadata!.wearLevel = wearLevel;
    
    return material;
  }
  
  /**
   * Generate quilted/padded fabric
   */
  generateQuilted(params: FabricParameters, stitchSpacing: number = 0.1): GeneratedMaterial {
    const material = this.generate(params);
    
    // Add quilting pattern
    material.properties.customMaps!['quilting'] = (u: number, v: number) => {
      const stitchU = Math.sin(u / stitchSpacing * Math.PI * 2);
      const stitchV = Math.sin(v / stitchSpacing * Math.PI * 2);
      const diamond = Math.abs(stitchU) + Math.abs(stitchV);
      return Math.min(1, diamond);
    };
    
    // Quilting adds thickness variation
    material.properties.customMaps!['thickness'] = (u: number, v: number) => {
      return material.properties.customMaps!['quilting'](u, v);
    };
    
    material.metadata!.quilted = true;
    material.metadata!.stitchSpacing = stitchSpacing;
    
    return material;
  }
}

// Pre-configured fabric presets
export const FabricPresets = {
  cottonCanvas: (seed?: number, color = new Color(0xD2B48C)) => new FabricGenerator(seed).generate({
    weave: 'plain',
    fiber: 'cotton',
    color,
    patternScale: 15,
    roughness: 0.75
  }),
  
  silkSatin: (seed?: number, color = new Color(0xC0C0C0)) => new FabricGenerator(seed).generate({
    weave: 'satin',
    fiber: 'silk',
    color,
    roughness: 0.25
  }),
  
  woolTweed: (seed?: number, color = new Color(0x8B7355)) => new FabricGenerator(seed).generate({
    weave: 'twill',
    fiber: 'wool',
    color,
    hasPattern: true,
    patternType: 'checkered',
    patternScale: 10
  }),
  
  denimJeans: (seed?: number) => new FabricGenerator(seed).generate({
    weave: 'denim',
    fiber: 'cotton',
    color: new Color(0x4A5F8C),
    patternScale: 25
  }),
  
  velvetLuxury: (seed?: number, color = new Color(0x800020)) => new FabricGenerator(seed).generate({
    weave: 'satin',
    fiber: 'velvet',
    color,
    roughness: 0.85
  }),
  
  knittedWool: (seed?: number, color = new Color(0xF5F5DC)) => new FabricGenerator(seed).generate({
    weave: 'knit',
    fiber: 'wool',
    color,
    thickness: 1.5
  })
};

export default FabricGenerator;
