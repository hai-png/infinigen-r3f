/**
 * Plant Material Generation System
 * 
 * Implements procedural materials for plants including:
 * - Bark textures (smooth, rough, peeling, layered)
 * - Leaf surfaces (waxy, hairy, veined)
 * - Grass blade materials
 * - Flower petal materials
 * - Moss, lichen, and epiphytic growth
 * 
 * Features:
 * - Multiple bark pattern types
 * - Aging and weathering effects
 * - Seasonal color variations
 * - Vein patterns for leaves
 */

import { Color, Texture, CanvasTexture, Vector2 } from 'three';
import { NoiseGenerator } from '../procedural/NoiseGenerator';

// ============================================================================
// Type Definitions
// ============================================================================

export type PlantMaterialType =
  | 'bark'
  | 'leaf'
  | 'grass'
  | 'petal'
  | 'fruit'
  | 'wood'
  | 'moss'
  | 'lichen';

export type BarkType = 
  | 'smooth'      // Birch, aspen
  | 'rough'       // Oak, pine
  | 'furrowed'    // Deep grooves
  | 'peeling'     // Eucalyptus, sycamore
  | 'layered'     // Cedar, redwood
  | 'spiny'       // Cactus
  | 'scaled';     // Palm

export type LeafType =
  | 'waxy'        // Glossy, reflective
  | 'matte'       // Non-reflective
  | 'hairy'       // Fuzzy surface
  | 'veined'      // Prominent veins
  | 'succulent';  // Thick, fleshy

export interface PlantMaterialProperties {
  // Base color
  baseColor: Color;
  
  // Surface properties
  roughness: number;
  metalness: number;
  
  // Plant-specific properties
  plantType?: 'bark' | 'leaf' | 'grass' | 'flower' | 'fruit';
  barkType?: BarkType;
  leafType?: LeafType;
  
  // Pattern parameters
  pattern?: 'none' | 'stripes' | 'spots' | 'veins' | 'rings' | 'scales';
  patternScale?: number;
  patternIntensity?: number;
  
  // Aging and weathering
  ageFactor?: number;       // 0-1, affects moss/lichen growth
  weathering?: number;      // 0-1, sun bleaching, wear
  moisture?: number;        // 0-1, affects glossiness
  
  // Seasonal variation
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

export interface GeneratedPlantMaterial {
  properties: PlantMaterialProperties;
  textures: {
    baseColor?: Texture;
    roughness?: Texture;
    normal?: Texture;
    ao?: Texture;
    pattern?: Texture;      // Veins, stripes, etc.
  };
  type: PlantMaterialType;
  subtype?: string;
}

// ============================================================================
// Bark Color Presets
// ============================================================================

export const BARK_COLOR_PRESETS: Record<string, {
  baseColor: [number, number, number];
  secondaryColor: [number, number, number];
  roughness: number;
}> = {
  birch: {
    baseColor: [0.95, 0.93, 0.88],
    secondaryColor: [0.15, 0.12, 0.10],
    roughness: 0.4
  },
  oak: {
    baseColor: [0.35, 0.28, 0.22],
    secondaryColor: [0.25, 0.20, 0.16],
    roughness: 0.8
  },
  pine: {
    baseColor: [0.45, 0.35, 0.28],
    secondaryColor: [0.30, 0.24, 0.18],
    roughness: 0.75
  },
  cherry: {
    baseColor: [0.55, 0.35, 0.30],
    secondaryColor: [0.40, 0.25, 0.22],
    roughness: 0.5
  },
  eucalyptus: {
    baseColor: [0.85, 0.80, 0.75],
    secondaryColor: [0.60, 0.55, 0.50],
    roughness: 0.45
  },
  cedar: {
    baseColor: [0.50, 0.35, 0.30],
    secondaryColor: [0.35, 0.25, 0.20],
    roughness: 0.7
  },
  aspen: {
    baseColor: [0.90, 0.88, 0.82],
    secondaryColor: [0.20, 0.18, 0.15],
    roughness: 0.35
  }
};

// Leaf color presets by season
export const LEAF_SEASONAL_COLORS: Record<string, {
  spring: [number, number, number];
  summer: [number, number, number];
  autumn: [number, number, number];
  winter: [number, number, number];
}> = {
  maple: {
    spring: [0.60, 0.80, 0.40],
    summer: [0.20, 0.55, 0.15],
    autumn: [0.90, 0.30, 0.10],
    winter: [0.40, 0.30, 0.20]
  },
  oak: {
    spring: [0.65, 0.82, 0.45],
    summer: [0.25, 0.58, 0.18],
    autumn: [0.60, 0.40, 0.20],
    winter: [0.45, 0.35, 0.25]
  },
  grass: {
    spring: [0.55, 0.85, 0.35],
    summer: [0.40, 0.70, 0.25],
    autumn: [0.70, 0.65, 0.30],
    winter: [0.60, 0.55, 0.35]
  }
};

// ============================================================================
// Plant Material Generator
// ============================================================================

export class PlantMaterialGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed: number = Math.random()) {
    this.noise = new NoiseGenerator(seed);
  }
  
  /**
   * Generate a plant material based on type and parameters
   */
  generate(
    type: PlantMaterialType,
    params: Partial<PlantMaterialProperties> = {}
  ): GeneratedPlantMaterial {
    const defaultProps = this.getDefaultProperties(type);
    const properties: PlantMaterialProperties = { ...defaultProps, ...params };
    
    const textures = this.generateTextures(type, properties);
    
    return {
      properties,
      textures,
      type,
    };
  }
  
  /**
   * Get default properties for a plant material type
   */
  getDefaultProperties(type: PlantMaterialType): PlantMaterialProperties {
    switch (type) {
      case 'bark':
        return {
          baseColor: new Color(0x5C4033),
          roughness: 0.7,
          metalness: 0.0,
          plantType: 'bark',
          barkType: 'rough',
          pattern: 'none',
          patternScale: 10,
          patternIntensity: 0.5,
          ageFactor: 0.0,
          weathering: 0.0,
          moisture: 0.0
        };
      
      case 'leaf':
        return {
          baseColor: new Color(0x228B22),
          roughness: 0.4,
          metalness: 0.0,
          plantType: 'leaf',
          leafType: 'waxy',
          pattern: 'veins',
          patternScale: 5,
          patternIntensity: 0.6,
          moisture: 0.3,
          season: 'summer'
        };
      
      case 'grass':
        return {
          baseColor: new Color(0x4CAF50),
          roughness: 0.6,
          metalness: 0.0,
          plantType: 'grass',
          pattern: 'stripes',
          patternScale: 20,
          patternIntensity: 0.3,
          moisture: 0.2
        };
      
      case 'petal':
        return {
          baseColor: new Color(0xFF69B4),
          roughness: 0.3,
          metalness: 0.0,
          plantType: 'flower',
          pattern: 'gradient',
          patternScale: 3,
          patternIntensity: 0.7,
          moisture: 0.4
        };
      
      case 'fruit':
        return {
          baseColor: new Color(0xFF0000),
          roughness: 0.2,
          metalness: 0.0,
          plantType: 'fruit',
          pattern: 'spots',
          patternScale: 15,
          patternIntensity: 0.4,
          moisture: 0.5
        };
      
      case 'wood':
        return {
          baseColor: new Color(0x8B4513),
          roughness: 0.6,
          metalness: 0.0,
          pattern: 'rings',
          patternScale: 8,
          patternIntensity: 0.5
        };
      
      case 'moss':
        return {
          baseColor: new Color(0x4A5D23),
          roughness: 0.9,
          metalness: 0.0,
          pattern: 'spots',
          patternScale: 30,
          patternIntensity: 0.6,
          moisture: 0.7
        };
      
      case 'lichen':
        return {
          baseColor: new Color(0xBDB76B),
          roughness: 0.8,
          metalness: 0.0,
          pattern: 'spots',
          patternScale: 25,
          patternIntensity: 0.5,
          moisture: 0.3
        };
      
      default:
        return {
          baseColor: new Color(0x228B22),
          roughness: 0.5,
          metalness: 0.0
        };
    }
  }
  
  /**
   * Generate textures for plant materials
   */
  private generateTextures(
    type: PlantMaterialType,
    properties: PlantMaterialProperties
  ): GeneratedPlantMaterial['textures'] {
    const textures: GeneratedPlantMaterial['textures'] = {};
    
    // Generate base color texture with patterns
    if (properties.pattern && properties.pattern !== 'none') {
      textures.baseColor = this.createPatternTexture(type, properties);
    }
    
    // Generate pattern texture for specific features
    if (properties.pattern === 'veins' || properties.pattern === 'rings') {
      textures.pattern = this.createFeaturePatternTexture(properties);
    }
    
    // Generate roughness map
    textures.roughness = this.createRoughnessTexture(properties);
    
    // Generate normal map for surface detail
    textures.normal = this.createNormalTexture(type, properties);
    
    // Generate AO map for crevices
    if (type === 'bark' || type === 'wood') {
      textures.ao = this.createAOTexture(properties);
    }
    
    return textures;
  }
  
  // ============================================================================
  // Specialized Plant Material Creators
  // ============================================================================
  
  /**
   * Create bark material with specified type
   */
  createBark(
    barkType: BarkType = 'rough',
    treeSpecies?: string,
    params: Partial<PlantMaterialProperties> = {}
  ): GeneratedPlantMaterial {
    let preset: any = null;
    
    if (treeSpecies && BARK_COLOR_PRESETS[treeSpecies.toLowerCase()]) {
      preset = BARK_COLOR_PRESETS[treeSpecies.toLowerCase()];
    }
    
    const material = this.generate('bark', {
      barkType: barkType,
      baseColor: preset ? new Color(...preset.baseColor) : undefined,
      roughness: preset ? preset.roughness : undefined,
      pattern: this.getBarkPatternType(barkType),
      ...params
    });
    
    material.subtype = treeSpecies || barkType;
    
    return material;
  }
  
  /**
   * Create leaf material with seasonal variation
   */
  createLeaf(
    leafType: LeafType = 'waxy',
    plantSpecies?: string,
    season: 'spring' | 'summer' | 'autumn' | 'winter' = 'summer',
    params: Partial<PlantMaterialProperties> = {}
  ): GeneratedPlantMaterial {
    let baseColor = new Color(0x228B22);
    
    if (plantSpecies && LEAF_SEASONAL_COLORS[plantSpecies.toLowerCase()]) {
      const colors = LEAF_SEASONAL_COLORS[plantSpecies.toLowerCase()];
      const colorArray = colors[season];
      if (colorArray) {
        baseColor = new Color(...colorArray);
      }
    }
    
    return this.generate('leaf', {
      leafType: leafType,
      baseColor: baseColor,
      season: season,
      pattern: 'veins',
      roughness: leafType === 'waxy' ? 0.3 : leafType === 'hairy' ? 0.7 : 0.5,
      moisture: leafType === 'succulent' ? 0.6 : 0.3,
      ...params
    });
  }
  
  /**
   * Create grass blade material
   */
  createGrass(
    grassType: 'lawn' | 'wild' | 'dry' = 'lawn',
    params: Partial<PlantMaterialProperties> = {}
  ): GeneratedPlantMaterial {
    const colorPresets = {
      lawn: [0.40, 0.70, 0.25],
      wild: [0.45, 0.75, 0.30],
      dry: [0.65, 0.60, 0.35]
    };
    
    return this.generate('grass', {
      baseColor: new Color(...colorPresets[grassType]),
      roughness: grassType === 'dry' ? 0.8 : 0.6,
      moisture: grassType === 'dry' ? 0.1 : 0.3,
      ...params
    });
  }
  
  /**
   * Create flower petal material
   */
  createPetal(
    color: Color = new Color(0xFF69B4),
    pattern: 'solid' | 'gradient' | 'striped' | 'spotted' = 'solid',
    params: Partial<PlantMaterialProperties> = {}
  ): GeneratedPlantMaterial {
    return this.generate('petal', {
      baseColor: color,
      pattern: pattern === 'solid' ? 'gradient' : pattern,
      patternIntensity: pattern === 'solid' ? 0.3 : 0.7,
      roughness: 0.3,
      moisture: 0.4,
      ...params
    });
  }
  
  /**
   * Create fruit material
   */
  createFruit(
    fruitType: 'apple' | 'orange' | 'banana' | 'berry' | 'custom',
    ripe: boolean = true,
    params: Partial<PlantMaterialProperties> = {}
  ): GeneratedPlantMaterial {
    const fruitColors: Record<string, { unripe: [number, number, number], ripe: [number, number, number] }> = {
      apple: { unripe: [0.40, 0.65, 0.25], ripe: [0.85, 0.10, 0.10] },
      orange: { unripe: [0.40, 0.60, 0.25], ripe: [0.95, 0.50, 0.10] },
      banana: { unripe: [0.50, 0.65, 0.25], ripe: [0.95, 0.90, 0.20] },
      berry: { unripe: [0.50, 0.70, 0.30], ripe: [0.60, 0.10, 0.40] }
    };
    
    const colorData = fruitColors[fruitType] || { unripe: [0.40, 0.65, 0.25], ripe: [0.85, 0.10, 0.10] };
    const colorArray = ripe ? colorData.ripe : colorData.unripe;
    
    return this.generate('fruit', {
      baseColor: new Color(...colorArray),
      roughness: fruitType === 'orange' ? 0.4 : 0.2,
      pattern: fruitType === 'orange' ? 'spots' : 'none',
      moisture: 0.5,
      ...params
    });
  }
  
  /**
   * Create moss/lichen growth material
   */
  createMossLichen(
    type: 'moss' | 'lichen',
    density: 'sparse' | 'medium' | 'dense' = 'medium',
    params: Partial<PlantMaterialProperties> = {}
  ): GeneratedPlantMaterial {
    const intensity = density === 'dense' ? 0.8 : density === 'medium' ? 0.6 : 0.4;
    
    return this.generate(type, {
      patternIntensity: intensity,
      moisture: type === 'moss' ? 0.7 : 0.4,
      roughness: type === 'moss' ? 0.9 : 0.8,
      ...params
    });
  }
  
  /**
   * Add moss/lichen growth to existing bark material
   */
  addMossGrowth(
    baseMaterial: GeneratedPlantMaterial,
    coverage: number = 0.3,
    patchy: boolean = true
  ): GeneratedPlantMaterial {
    const enhanced = { ...baseMaterial };
    enhanced.properties.ageFactor = coverage;
    
    if (patchy) {
      // Create patchy distribution
      enhanced.properties.pattern = baseMaterial.properties.pattern === 'none' ? 'spots' : baseMaterial.properties.pattern;
      enhanced.properties.patternIntensity = coverage;
    }
    
    return enhanced;
  }
  
  // ============================================================================
  // Texture Generation Methods
  // ============================================================================
  
  private getBarkPatternType(barkType: BarkType): 'none' | 'stripes' | 'spots' | 'veins' | 'rings' | 'scales' {
    switch (barkType) {
      case 'smooth':
        return 'none';
      case 'rough':
      case 'furrowed':
        return 'veins';
      case 'peeling':
        return 'spots';
      case 'layered':
        return 'stripes';
      case 'spiny':
        return 'spots';
      case 'scaled':
        return 'scales';
      default:
        return 'none';
    }
  }
  
  private createPatternTexture(
    type: PlantMaterialType,
    properties: PlantMaterialProperties
  ): CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const scale = properties.patternScale || 10;
    const baseColor = properties.baseColor;
    const intensity = properties.patternIntensity || 0.5;
    
    // Secondary color for bark patterns
    const secondaryColor = type === 'bark' && properties.barkType ? 
      this.getBarkSecondaryColor(properties.barkType) : baseColor.clone().multiplyScalar(0.7);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * scale;
        const v = y / size * scale;
        
        let variation = 0;
        let useSecondary = false;
        
        switch (properties.pattern) {
          case 'stripes':
            variation = Math.sin(u * Math.PI * 2) * intensity;
            break;
            
          case 'spots':
            const spotNoise = this.noise.fbm(u * 2, v * 2, 4);
            if (spotNoise > 0.6) {
              useSecondary = true;
              variation = intensity * 0.5;
            } else {
              variation = this.noise.fbm(u, v, 3) * intensity * 0.2;
            }
            break;
            
          case 'veins':
            // Create branching vein pattern
            const veinNoise = this.noise.fbm(u * 1.5, v * 1.5, 4);
            const majorVein = Math.abs(Math.sin(v * Math.PI)) * 0.3;
            variation = (veinNoise + majorVein) * intensity;
            break;
            
          case 'rings':
            // Tree ring pattern
            const distFromCenter = Math.sqrt((u - scale/2) ** 2 + (v - scale/2) ** 2);
            const rings = Math.sin(distFromCenter * Math.PI * 2) * 0.5 + 0.5;
            variation = rings * intensity;
            break;
            
          case 'scales':
            // Scale pattern for palm bark
            const cellX = Math.floor(u);
            const cellY = Math.floor(v);
            const localU = u % 1;
            const localV = v % 1;
            const distFromCellCenter = Math.sqrt((localU - 0.5) ** 2 + (localV - 0.5) ** 2);
            variation = distFromCellCenter < 0.4 ? intensity * 0.5 : -intensity * 0.3;
            break;
            
          case 'gradient':
            variation = (v / scale - 0.5) * intensity;
            break;
            
          default:
            variation = this.noise.fbm(u, v, 3) * intensity * 0.3;
        }
        
        // Apply weathering (sun bleaching)
        if (properties.weathering && properties.weathering > 0) {
          variation += properties.weathering * 0.2 * this.noise.fbm(u * 0.3, v * 0.3, 2);
        }
        
        const idx = (y * size + x) * 4;
        
        if (useSecondary && type === 'bark') {
          data[idx] = Math.max(0, Math.min(255, secondaryColor.r * 255 * (1 + variation)));
          data[idx + 1] = Math.max(0, Math.min(255, secondaryColor.g * 255 * (1 + variation)));
          data[idx + 2] = Math.max(0, Math.min(255, secondaryColor.b * 255 * (1 + variation)));
        } else {
          data[idx] = Math.max(0, Math.min(255, baseColor.r * 255 * (1 + variation)));
          data[idx + 1] = Math.max(0, Math.min(255, baseColor.g * 255 * (1 + variation)));
          data[idx + 2] = Math.max(0, Math.min(255, baseColor.b * 255 * (1 + variation)));
        }
        data[idx + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = 1000; // RepeatWrapping
    texture.needsUpdate = true;
    
    return texture;
  }
  
  private getBarkSecondaryColor(barkType: BarkType): Color {
    const colors: Record<BarkType, [number, number, number]> = {
      smooth: [0.20, 0.18, 0.15],
      rough: [0.25, 0.20, 0.16],
      furrowed: [0.20, 0.15, 0.12],
      peeling: [0.60, 0.55, 0.50],
      layered: [0.35, 0.25, 0.20],
      spiny: [0.30, 0.25, 0.20],
      scaled: [0.40, 0.35, 0.30]
    };
    return new Color(...colors[barkType]);
  }
  
  private createFeaturePatternTexture(properties: PlantMaterialProperties): CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const scale = properties.patternScale || 10;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * scale;
        const v = y / size * scale;
        
        let feature = 0;
        
        if (properties.pattern === 'veins') {
          // Create vein network
          const veinField = this.noise.fbm(u * 2, v * 2, 4);
          const majorVeins = Math.sin(v * Math.PI * 3) * 0.5 + 0.5;
          const minorVeins = Math.sin(u * Math.PI * 5 + v) * 0.3;
          feature = (veinField * 0.5 + majorVeins * 0.3 + minorVeins * 0.2);
        } else if (properties.pattern === 'rings') {
          const distFromCenter = Math.sqrt((u - scale/2) ** 2 + (v - scale/2) ** 2);
          feature = Math.sin(distFromCenter * Math.PI * 2) * 0.5 + 0.5;
        }
        
        const idx = (y * size + x) * 4;
        const value = Math.floor(feature * 255);
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = 1000;
    texture.needsUpdate = true;
    
    return texture;
  }
  
  private createRoughnessTexture(properties: PlantMaterialProperties): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const baseRoughness = properties.roughness;
    const moisture = properties.moisture || 0;
    const variation = 0.2;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * 10;
        const v = y / size * 10;
        
        const noise = this.noise.fbm(u, v, 3) * variation;
        // Moisture reduces roughness (makes surface more reflective)
        const roughness = Math.max(0.1, Math.min(1, baseRoughness + noise - moisture * 0.3));
        
        const idx = (y * size + x) * 4;
        const value = Math.floor(roughness * 255);
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return texture;
  }
  
  private createNormalTexture(
    type: PlantMaterialType,
    properties: PlantMaterialProperties
  ): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const scale = (properties.patternScale || 10) * 0.5;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * scale;
        const v = y / size * scale;
        
        let h00, h10, h01;
        
        if (type === 'bark' && properties.barkType === 'furrowed') {
          // Deep grooves for furrowed bark
          const grooveNoise = this.noise.fbm(u * 0.5, v * 0.5, 3);
          const grooves = Math.sin(v * Math.PI * 4) * 0.5;
          h00 = grooveNoise * 0.5 + grooves * 0.5;
          h10 = this.noise.fbm((u + 0.01) * 0.5, v * 0.5, 3) * 0.5 + Math.sin(v * Math.PI * 4) * 0.5;
          h01 = this.noise.fbm(u * 0.5, (v + 0.01) * 0.5, 3) * 0.5 + Math.sin((v + 0.01) * Math.PI * 4) * 0.5;
        } else if (type === 'bark' && properties.barkType === 'scaled') {
          // Scale pattern
          const cellX = Math.floor(u);
          const cellY = Math.floor(v);
          const localU = u % 1;
          const localV = v % 1;
          const distFromCenter = Math.sqrt((localU - 0.5) ** 2 + (localV - 0.5) ** 2);
          h00 = 1 - Math.min(1, distFromCenter * 2);
          h10 = 1 - Math.min(1, Math.sqrt((localU + 0.01 - 0.5) ** 2 + (localV - 0.5) ** 2) * 2);
          h01 = 1 - Math.min(1, Math.sqrt((localU - 0.5) ** 2 + (localV + 0.01 - 0.5) ** 2) * 2);
        } else {
          // Standard noise-based height
          h00 = this.noise.fbm(u, v, 3);
          h10 = this.noise.fbm(u + 0.01, v, 3);
          h01 = this.noise.fbm(u, v + 0.01, 3);
        }
        
        const dx = h10 - h00;
        const dy = h01 - h00;
        
        const nx = -dx * 2;
        const ny = -dy * 2;
        const nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        
        const idx = (y * size + x) * 4;
        data[idx] = Math.floor((nx / len + 1) * 127.5);
        data[idx + 1] = Math.floor((ny / len + 1) * 127.5);
        data[idx + 2] = Math.floor((nz / len + 1) * 127.5);
        data[idx + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return texture;
  }
  
  private createAOTexture(properties: PlantMaterialProperties): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const scale = (properties.patternScale || 10) * 0.3;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * scale;
        const v = y / size * scale;
        
        // AO in crevices and deep pattern areas
        const patternDepth = this.noise.fbm(u, v, 3);
        const ao = 0.6 + patternDepth * 0.4;
        
        const idx = (y * size + x) * 4;
        const value = Math.floor(ao * 255);
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return texture;
  }
}

// ============================================================================
// Preset Plant Materials
// ============================================================================

export const PLANT_MATERIAL_PRESETS: Record<string, () => GeneratedPlantMaterial> = {
  birch_bark: () => new PlantMaterialGenerator().createBark('smooth', 'birch'),
  oak_bark: () => new PlantMaterialGenerator().createBark('rough', 'oak'),
  pine_bark: () => new PlantMaterialGenerator().createBark('furrowed', 'pine'),
  eucalyptus_bark: () => new PlantMaterialGenerator().createBark('peeling', 'eucalyptus'),
  cedar_bark: () => new PlantMaterialGenerator().createBark('layered', 'cedar'),
  
  maple_leaf_spring: () => new PlantMaterialGenerator().createLeaf('waxy', 'maple', 'spring'),
  maple_leaf_summer: () => new PlantMaterialGenerator().createLeaf('waxy', 'maple', 'summer'),
  maple_leaf_autumn: () => new PlantMaterialGenerator().createLeaf('waxy', 'maple', 'autumn'),
  
  oak_leaf: () => new PlantMaterialGenerator().createLeaf('matte', 'oak', 'summer'),
  
  lawn_grass: () => new PlantMaterialGenerator().createGrass('lawn'),
  wild_grass: () => new PlantMaterialGenerator().createGrass('wild'),
  dry_grass: () => new PlantMaterialGenerator().createGrass('dry'),
  
  rose_petal: () => new PlantMaterialGenerator().createPetal(new Color(0xDC143C), 'gradient'),
  tulip_petal: () => new PlantMaterialGenerator().createPetal(new Color(0xFF6347), 'solid'),
  
  apple_ripe: () => new PlantMaterialGenerator().createFruit('apple', true),
  apple_unripe: () => new PlantMaterialGenerator().createFruit('apple', false),
  orange: () => new PlantMaterialGenerator().createFruit('orange', true),
  
  moss_dense: () => new PlantMaterialGenerator().createMossLichen('moss', 'dense'),
  lichen_sparse: () => new PlantMaterialGenerator().createMossLichen('lichen', 'sparse')
};

export default PlantMaterialGenerator;
