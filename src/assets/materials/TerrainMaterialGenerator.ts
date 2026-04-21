/**
 * Terrain Material Generation System
 * 
 * Implements procedural materials for terrain including:
 * - Rock and stone variations
 * - Soil and dirt types
 * - Sand (fine, coarse, dunes)
 * - Mud and wet ground
 * - Ice and snow
 * - Gravel and pebbles
 * - Cracked earth
 * 
 * Features:
 * - Multi-scale noise for geological features
 * - Erosion simulation hints
 * - Moisture-based color variation
 * - Layered strata effects
 */

import { Color, Texture, CanvasTexture, Vector2 } from 'three';
import { NoiseGenerator } from '../procedural/NoiseGenerator';

// ============================================================================
// Type Definitions
// ============================================================================

export type TerrainMaterialType =
  | 'rock'
  | 'stone'
  | 'dirt'
  | 'soil'
  | 'sand'
  | 'mud'
  | 'ice'
  | 'snow'
  | 'gravel'
  | 'clay'
  | 'cracked_earth';

export type RockType = 
  | 'granite'
  | 'limestone'
  | 'sandstone'
  | 'slate'
  | 'basalt'
  | 'marble'
  | 'shale';

export type SoilType =
  | 'loam'
  | 'clay'
  | 'silt'
  | 'peat'
  | 'chalk';

export interface TerrainMaterialProperties {
  // Base color
  baseColor: Color;
  
  // Surface properties
  roughness: number;
  metalness: number;
  
  // Terrain-specific properties
  terrainType?: TerrainMaterialType;
  rockType?: RockType;
  soilType?: SoilType;
  
  // Pattern parameters
  pattern?: 'none' | 'layered' | 'veined' | 'speckled' | 'cracked' | 'rippled';
  patternScale?: number;
  patternIntensity?: number;
  
  // Environmental factors
  moisture?: number;        // 0-1, affects color and reflectivity
  erosion?: number;         // 0-1, weathering level
  elevation?: number;       // 0-1, affects snow/ice
  
  // Geological features
  hasStrata?: boolean;      // Layered rock formations
  hasCrystals?: boolean;    // Crystal inclusions
  hasFossils?: boolean;     // Fossil patterns (limestone)
}

export interface GeneratedTerrainMaterial {
  properties: TerrainMaterialProperties;
  textures: {
    baseColor?: Texture;
    roughness?: Texture;
    normal?: Texture;
    ao?: Texture;
    displacement?: Texture;  // Height map for parallax
    pattern?: Texture;       // Veins, strata, etc.
  };
  type: TerrainMaterialType;
  subtype?: string;
}

// ============================================================================
// Rock Color Presets
// ============================================================================

export const ROCK_COLOR_PRESETS: Record<RockType, {
  baseColor: [number, number, number];
  secondaryColor: [number, number, number];
  roughness: number;
  pattern: 'speckled' | 'layered' | 'veined' | 'none';
}> = {
  granite: {
    baseColor: [0.65, 0.60, 0.58],
    secondaryColor: [0.25, 0.22, 0.20],
    roughness: 0.7,
    pattern: 'speckled'
  },
  limestone: {
    baseColor: [0.85, 0.82, 0.78],
    secondaryColor: [0.70, 0.65, 0.60],
    roughness: 0.6,
    pattern: 'layered'
  },
  sandstone: {
    baseColor: [0.82, 0.70, 0.55],
    secondaryColor: [0.65, 0.50, 0.35],
    roughness: 0.75,
    pattern: 'layered'
  },
  slate: {
    baseColor: [0.40, 0.38, 0.42],
    secondaryColor: [0.25, 0.24, 0.28],
    roughness: 0.5,
    pattern: 'layered'
  },
  basalt: {
    baseColor: [0.25, 0.24, 0.26],
    secondaryColor: [0.15, 0.14, 0.16],
    roughness: 0.8,
    pattern: 'speckled'
  },
  marble: {
    baseColor: [0.90, 0.88, 0.85],
    secondaryColor: [0.60, 0.55, 0.50],
    roughness: 0.3,
    pattern: 'veined'
  },
  shale: {
    baseColor: [0.45, 0.40, 0.38],
    secondaryColor: [0.30, 0.26, 0.24],
    roughness: 0.65,
    pattern: 'layered'
  }
};

// Soil color presets
export const SOIL_COLOR_PRESETS: Record<SoilType, {
  baseColor: [number, number, number];
  roughness: number;
  moistureDarkening: number;  // How much moisture darkens the soil
}> = {
  loam: {
    baseColor: [0.40, 0.30, 0.20],
    roughness: 0.9,
    moistureDarkening: 0.3
  },
  clay: {
    baseColor: [0.60, 0.35, 0.25],
    roughness: 0.85,
    moistureDarkening: 0.35
  },
  silt: {
    baseColor: [0.55, 0.45, 0.35],
    roughness: 0.8,
    moistureDarkening: 0.25
  },
  peat: {
    baseColor: [0.25, 0.20, 0.18],
    roughness: 0.95,
    moistureDarkening: 0.2
  },
  chalk: {
    baseColor: [0.92, 0.90, 0.85],
    roughness: 0.7,
    moistureDarkening: 0.15
  }
};

// Sand types
export const SAND_COLOR_PRESETS: Record<string, {
  baseColor: [number, number, number];
  roughness: number;
  grainSize: 'fine' | 'medium' | 'coarse';
}> = {
  beach: {
    baseColor: [0.92, 0.88, 0.78],
    roughness: 0.7,
    grainSize: 'fine'
  },
  desert: {
    baseColor: [0.88, 0.75, 0.55],
    roughness: 0.8,
    grainSize: 'medium'
  },
  volcanic: {
    baseColor: [0.25, 0.22, 0.20],
    roughness: 0.85,
    grainSize: 'fine'
  },
  red_desert: {
    baseColor: [0.75, 0.40, 0.30],
    roughness: 0.75,
    grainSize: 'medium'
  }
};

// ============================================================================
// Terrain Material Generator
// ============================================================================

export class TerrainMaterialGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed: number = Math.random()) {
    this.noise = new NoiseGenerator(seed);
  }
  
  /**
   * Generate a terrain material based on type and parameters
   */
  generate(
    type: TerrainMaterialType,
    params: Partial<TerrainMaterialProperties> = {}
  ): GeneratedTerrainMaterial {
    const defaultProps = this.getDefaultProperties(type);
    const properties: TerrainMaterialProperties = { ...defaultProps, ...params };
    
    const textures = this.generateTextures(type, properties);
    
    return {
      properties,
      textures,
      type,
    };
  }
  
  /**
   * Get default properties for a terrain material type
   */
  getDefaultProperties(type: TerrainMaterialType): TerrainMaterialProperties {
    switch (type) {
      case 'rock':
        return {
          baseColor: new Color(0x6B6B6B),
          roughness: 0.7,
          metalness: 0.0,
          terrainType: 'rock',
          rockType: 'granite',
          pattern: 'speckled',
          patternScale: 20,
          patternIntensity: 0.5,
          moisture: 0.0,
          erosion: 0.0,
          hasStrata: false
        };
      
      case 'stone':
        return {
          baseColor: new Color(0x5A5A5A),
          roughness: 0.6,
          metalness: 0.0,
          terrainType: 'stone',
          pattern: 'cracked',
          patternScale: 15,
          patternIntensity: 0.4,
          erosion: 0.2
        };
      
      case 'dirt':
        return {
          baseColor: new Color(0x5C4033),
          roughness: 0.95,
          metalness: 0.0,
          terrainType: 'dirt',
          soilType: 'loam',
          pattern: 'speckled',
          patternScale: 30,
          patternIntensity: 0.3,
          moisture: 0.1
        };
      
      case 'soil':
        return {
          baseColor: new Color(0x4A3728),
          roughness: 0.9,
          metalness: 0.0,
          terrainType: 'soil',
          soilType: 'loam',
          pattern: 'none',
          moisture: 0.2
        };
      
      case 'sand':
        return {
          baseColor: new Color(0xC2B280),
          roughness: 0.8,
          metalness: 0.0,
          terrainType: 'sand',
          pattern: 'rippled',
          patternScale: 25,
          patternIntensity: 0.4,
          moisture: 0.0
        };
      
      case 'mud':
        return {
          baseColor: new Color(0x3D2817),
          roughness: 0.4,
          metalness: 0.0,
          terrainType: 'mud',
          pattern: 'cracked',
          patternScale: 20,
          patternIntensity: 0.5,
          moisture: 0.8
        };
      
      case 'ice':
        return {
          baseColor: new Color(0xA8D8EA),
          roughness: 0.1,
          metalness: 0.0,
          terrainType: 'ice',
          pattern: 'cracked',
          patternScale: 30,
          patternIntensity: 0.3,
          moisture: 0.0
        };
      
      case 'snow':
        return {
          baseColor: new Color(0xFFFAFA),
          roughness: 0.5,
          metalness: 0.0,
          terrainType: 'snow',
          pattern: 'none',
          moisture: 0.0
        };
      
      case 'gravel':
        return {
          baseColor: new Color(0x696969),
          roughness: 0.85,
          metalness: 0.0,
          terrainType: 'gravel',
          pattern: 'speckled',
          patternScale: 10,
          patternIntensity: 0.7
        };
      
      case 'clay':
        return {
          baseColor: new Color(0xB8735E),
          roughness: 0.7,
          metalness: 0.0,
          terrainType: 'clay',
          pattern: 'cracked',
          patternScale: 25,
          patternIntensity: 0.4,
          moisture: 0.3
        };
      
      case 'cracked_earth':
        return {
          baseColor: new Color(0x5C4A3D),
          roughness: 0.9,
          metalness: 0.0,
          terrainType: 'cracked_earth',
          pattern: 'cracked',
          patternScale: 30,
          patternIntensity: 0.8,
          moisture: 0.0,
          erosion: 0.7
        };
      
      default:
        return {
          baseColor: new Color(0x5A5A5A),
          roughness: 0.7,
          metalness: 0.0
        };
    }
  }
  
  /**
   * Generate textures for terrain materials
   */
  private generateTextures(
    type: TerrainMaterialType,
    properties: TerrainMaterialProperties
  ): GeneratedTerrainMaterial['textures'] {
    const textures: GeneratedTerrainMaterial['textures'] = {};
    
    // Generate base color texture with patterns
    if (properties.pattern && properties.pattern !== 'none') {
      textures.baseColor = this.createPatternTexture(type, properties);
    }
    
    // Generate pattern texture for specific features
    if (properties.pattern === 'veined' || properties.pattern === 'layered') {
      textures.pattern = this.createFeaturePatternTexture(properties);
    }
    
    // Generate roughness map
    textures.roughness = this.createRoughnessTexture(properties);
    
    // Generate normal map for surface detail
    textures.normal = this.createNormalTexture(type, properties);
    
    // Generate AO map for crevices
    if (type === 'rock' || type === 'stone' || type === 'cracked_earth') {
      textures.ao = this.createAOTexture(properties);
    }
    
    // Generate displacement map for height variation
    if (type === 'rock' || type === 'stone' || type === 'cracked_earth') {
      textures.displacement = this.createDisplacementTexture(properties);
    }
    
    return textures;
  }
  
  // ============================================================================
  // Specialized Terrain Material Creators
  // ============================================================================
  
  /**
   * Create rock material with specified type
   */
  createRock(
    rockType: RockType = 'granite',
    params: Partial<TerrainMaterialProperties> = {}
  ): GeneratedTerrainMaterial {
    const preset = ROCK_COLOR_PRESETS[rockType];
    
    return this.generate('rock', {
      rockType: rockType,
      baseColor: new Color(...preset.baseColor),
      roughness: preset.roughness,
      pattern: preset.pattern,
      ...params
    });
  }
  
  /**
   * Create soil material with type and moisture
   */
  createSoil(
    soilType: SoilType = 'loam',
    moisture: number = 0.2,
    params: Partial<TerrainMaterialProperties> = {}
  ): GeneratedTerrainMaterial {
    const preset = SOIL_COLOR_PRESETS[soilType];
    
    // Apply moisture darkening
    const baseColorArray = preset.baseColor;
    const darkening = moisture * preset.moistureDarkening;
    const darkenedColor = [
      baseColorArray[0] * (1 - darkening),
      baseColorArray[1] * (1 - darkening),
      baseColorArray[2] * (1 - darkening)
    ];
    
    return this.generate('soil', {
      soilType: soilType,
      baseColor: new Color(...darkenedColor),
      moisture: moisture,
      roughness: preset.roughness,
      ...params
    });
  }
  
  /**
   * Create sand material with type
   */
  createSand(
    sandType: 'beach' | 'desert' | 'volcanic' | 'red_desert' = 'desert',
    params: Partial<TerrainMaterialProperties> = {}
  ): GeneratedTerrainMaterial {
    const preset = SAND_COLOR_PRESETS[sandType];
    
    return this.generate('sand', {
      baseColor: new Color(...preset.baseColor),
      roughness: preset.roughness,
      pattern: sandType === 'desert' || sandType === 'red_desert' ? 'rippled' : 'none',
      ...params
    });
  }
  
  /**
   * Create mud with wetness variation
   */
  createMud(
    wetness: 'dry' | 'moist' | 'wet' | 'puddle' = 'moist',
    params: Partial<TerrainMaterialProperties> = {}
  ): GeneratedTerrainMaterial {
    const wetnessLevels = { dry: 0.3, moist: 0.6, wet: 0.85, puddle: 0.95 };
    const roughnessLevels = { dry: 0.8, moist: 0.5, wet: 0.3, puddle: 0.15 };
    
    return this.generate('mud', {
      moisture: wetnessLevels[wetness],
      roughness: roughnessLevels[wetness],
      pattern: wetness === 'dry' ? 'cracked' : 'none',
      ...params
    });
  }
  
  /**
   * Create ice with clarity variation
   */
  createIce(
    clarity: 'clear' | 'cloudy' | 'glacier' = 'clear',
    params: Partial<TerrainMaterialProperties> = {}
  ): GeneratedTerrainMaterial {
    const colors = {
      clear: [0xA8D8EA, 0.1],
      cloudy: [0xD4EBF5, 0.3],
      glacier: [0x7FB3D5, 0.2]
    };
    
    const [color, roughness] = colors[clarity];
    
    return this.generate('ice', {
      baseColor: new Color(color),
      roughness: roughness,
      pattern: clarity === 'glacier' ? 'layered' : 'cracked',
      ...params
    });
  }
  
  /**
   * Create snow with depth variation
   */
  createSnow(
    depth: 'light' | 'medium' | 'deep' = 'medium',
    params: Partial<TerrainMaterialProperties> = {}
  ): GeneratedTerrainMaterial {
    const roughnessLevels = { light: 0.6, medium: 0.5, deep: 0.4 };
    
    return this.generate('snow', {
      roughness: roughnessLevels[depth],
      ...params
    });
  }
  
  /**
   * Create stratified rock (layered sedimentary)
   */
  createStratifiedRock(
    layers: number = 5,
    params: Partial<TerrainMaterialProperties> = {}
  ): GeneratedTerrainMaterial {
    return this.generate('rock', {
      pattern: 'layered',
      patternScale: 50 / layers,
      patternIntensity: 0.6,
      hasStrata: true,
      ...params
    });
  }
  
  /**
   * Create eroded/weathered rock
   */
  createWeatheredRock(
    erosionLevel: number = 0.5,
    params: Partial<TerrainMaterialProperties> = {}
  ): GeneratedTerrainMaterial {
    return this.generate('stone', {
      erosion: erosionLevel,
      pattern: 'cracked',
      patternIntensity: 0.4 + erosionLevel * 0.4,
      roughness: 0.6 + erosionLevel * 0.2,
      ...params
    });
  }
  
  /**
   * Blend two terrain materials (for transitions)
   */
  blendMaterials(
    material1: GeneratedTerrainMaterial,
    material2: GeneratedTerrainMaterial,
    blendFactor: number = 0.5
  ): GeneratedTerrainMaterial {
    const blended: GeneratedTerrainMaterial = {
      properties: {
        ...material1.properties,
        baseColor: material1.properties.baseColor.clone().lerp(
          material2.properties.baseColor,
          blendFactor
        ),
        roughness: material1.properties.roughness * (1 - blendFactor) + 
                   material2.properties.roughness * blendFactor
      },
      textures: {},
      type: material1.type
    };
    
    return blended;
  }
  
  // ============================================================================
  // Texture Generation Methods
  // ============================================================================
  
  private createPatternTexture(
    type: TerrainMaterialType,
    properties: TerrainMaterialProperties
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
    
    // Get secondary color for patterns
    let secondaryColor = baseColor.clone().multiplyScalar(0.7);
    if (type === 'rock' && properties.rockType) {
      const preset = ROCK_COLOR_PRESETS[properties.rockType];
      if (preset) {
        secondaryColor = new Color(...preset.secondaryColor);
      }
    }
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * scale;
        const v = y / size * scale;
        
        let variation = 0;
        let useSecondary = false;
        
        switch (properties.pattern) {
          case 'speckled':
            // Granite-like speckled pattern
            const speckleNoise = this.noise.fbm(u * 3, v * 3, 4);
            if (speckleNoise > 0.5) {
              useSecondary = true;
              variation = intensity * 0.3;
            } else {
              variation = this.noise.fbm(u, v, 3) * intensity * 0.2;
            }
            break;
            
          case 'layered':
            // Sedimentary rock layers
            const layerNoise = this.noise.fbm(u * 0.5, v * 0.5, 3);
            const bands = Math.sin(v * Math.PI * 2) * 0.5 + 0.5;
            variation = (layerNoise * 0.5 + bands * 0.5) * intensity;
            
            if (bands > 0.7) {
              useSecondary = true;
            }
            break;
            
          case 'veined':
            // Marble-like veins
            const veinField = this.noise.fbm(u * 2, v * 2, 4);
            const majorVeins = Math.abs(Math.sin(u * Math.PI * 2 + v)) * 0.5;
            variation = (veinField * 0.4 + majorVeins * 0.6) * intensity;
            
            if (majorVeins > 0.6) {
              useSecondary = true;
            }
            break;
            
          case 'cracked':
            // Dried mud/cracked earth
            const crackNoise = this.noise.voronoi(u * 2, v * 2);
            const cracks = crackNoise < 0.15 ? 1 : 0;
            variation = cracks * intensity;
            
            if (cracks) {
              useSecondary = true;
            }
            break;
            
          case 'rippled':
            // Sand dune ripples
            const ripple = Math.sin(u * Math.PI * 4) * 0.5 + 0.5;
            const rippleNoise = this.noise.fbm(u * 0.5, v * 0.5, 2) * 0.3;
            variation = (ripple + rippleNoise) * intensity;
            break;
            
          default:
            variation = this.noise.fbm(u, v, 3) * intensity * 0.3;
        }
        
        // Apply moisture darkening
        if (properties.moisture && properties.moisture > 0) {
          const moistureDarkening = 1 - properties.moisture * 0.3;
          variation *= moistureDarkening;
        }
        
        // Apply erosion weathering
        if (properties.erosion && properties.erosion > 0) {
          const erosionNoise = this.noise.fbm(u * 0.3, v * 0.3, 2);
          variation += properties.erosion * 0.2 * erosionNoise;
        }
        
        const idx = (y * size + x) * 4;
        
        if (useSecondary) {
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
  
  private createFeaturePatternTexture(properties: TerrainMaterialProperties): CanvasTexture {
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
        
        if (properties.pattern === 'veined') {
          const veinField = this.noise.fbm(u * 2, v * 2, 4);
          const majorVeins = Math.abs(Math.sin(u * Math.PI * 2 + v)) * 0.5;
          feature = veinField * 0.4 + majorVeins * 0.6;
        } else if (properties.pattern === 'layered') {
          const layerNoise = this.noise.fbm(u * 0.5, v * 0.5, 3);
          const bands = Math.sin(v * Math.PI * 2) * 0.5 + 0.5;
          feature = layerNoise * 0.5 + bands * 0.5;
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
  
  private createRoughnessTexture(properties: TerrainMaterialProperties): CanvasTexture {
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
        // Moisture reduces roughness
        const roughness = Math.max(0.05, Math.min(1, baseRoughness + noise - moisture * 0.4));
        
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
    type: TerrainMaterialType,
    properties: TerrainMaterialProperties
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
        
        if (type === 'cracked_earth' || properties.pattern === 'cracked') {
          // Cracked pattern
          const crackField = this.noise.voronoi(u * 1.5, v * 1.5);
          const cracks = crackField < 0.2 ? 1 - crackField * 5 : 0;
          h00 = cracks + this.noise.fbm(u, v, 2) * 0.3;
          h10 = (this.noise.voronoi((u + 0.01) * 1.5, v * 1.5) < 0.2 ? 
                 1 - this.noise.voronoi((u + 0.01) * 1.5, v * 1.5) * 5 : 0) + 
                this.noise.fbm(u + 0.01, v, 2) * 0.3;
          h01 = (this.noise.voronoi(u * 1.5, (v + 0.01) * 1.5) < 0.2 ? 
                 1 - this.noise.voronoi(u * 1.5, (v + 0.01) * 1.5) * 5 : 0) + 
                this.noise.fbm(u, v + 0.01, 2) * 0.3;
        } else if (type === 'sand' && properties.pattern === 'rippled') {
          // Sand ripples
          h00 = Math.sin(u * Math.PI * 4) * 0.5 + this.noise.fbm(u, v, 2) * 0.2;
          h10 = Math.sin((u + 0.01) * Math.PI * 4) * 0.5 + this.noise.fbm(u + 0.01, v, 2) * 0.2;
          h01 = Math.sin(u * Math.PI * 4) * 0.5 + this.noise.fbm(u, v + 0.01, 2) * 0.2;
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
  
  private createAOTexture(properties: TerrainMaterialProperties): CanvasTexture {
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
        
        // AO in crevices and cracks
        let ao = 0.7;
        
        if (properties.pattern === 'cracked') {
          const crackField = this.noise.voronoi(u * 2, v * 2);
          ao = crackField < 0.15 ? 0.3 : 0.7 + this.noise.fbm(u, v, 2) * 0.3;
        } else {
          ao = 0.6 + this.noise.fbm(u, v, 3) * 0.4;
        }
        
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
  
  private createDisplacementTexture(properties: TerrainMaterialProperties): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const scale = (properties.patternScale || 10) * 0.4;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * scale;
        const v = y / size * scale;
        
        let height = 0;
        
        if (properties.pattern === 'cracked') {
          const crackField = this.noise.voronoi(u * 2, v * 2);
          height = crackField < 0.15 ? 0 : 1 - crackField;
        } else if (properties.pattern === 'layered') {
          height = Math.sin(v * Math.PI * 2) * 0.5 + 0.5;
        } else {
          height = this.noise.fbm(u, v, 3);
        }
        
        const idx = (y * size + x) * 4;
        const value = Math.floor(height * 255);
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
// Preset Terrain Materials
// ============================================================================

export const TERRAIN_MATERIAL_PRESETS: Record<string, () => GeneratedTerrainMaterial> = {
  // Rocks
  granite: () => new TerrainMaterialGenerator().createRock('granite'),
  limestone: () => new TerrainMaterialGenerator().createRock('limestone'),
  sandstone: () => new TerrainMaterialGenerator().createRock('sandstone'),
  slate: () => new TerrainMaterialGenerator().createRock('slate'),
  basalt: () => new TerrainMaterialGenerator().createRock('basalt'),
  marble: () => new TerrainMaterialGenerator().createRock('marble'),
  
  // Soils
  loam_soil: () => new TerrainMaterialGenerator().createSoil('loam', 0.2),
  clay_soil: () => new TerrainMaterialGenerator().createSoil('clay', 0.3),
  wet_loam: () => new TerrainMaterialGenerator().createSoil('loam', 0.6),
  
  // Sands
  beach_sand: () => new TerrainMaterialGenerator().createSand('beach'),
  desert_sand: () => new TerrainMaterialGenerator().createSand('desert'),
  volcanic_sand: () => new TerrainMaterialGenerator().createSand('volcanic'),
  red_sand: () => new TerrainMaterialGenerator().createSand('red_desert'),
  
  // Mud
  dry_mud: () => new TerrainMaterialGenerator().createMud('dry'),
  moist_mud: () => new TerrainMaterialGenerator().createMud('moist'),
  wet_mud: () => new TerrainMaterialGenerator().createMud('wet'),
  
  // Ice and Snow
  clear_ice: () => new TerrainMaterialGenerator().createIce('clear'),
  glacier_ice: () => new TerrainMaterialGenerator().createIce('glacier'),
  light_snow: () => new TerrainMaterialGenerator().createSnow('light'),
  deep_snow: () => new TerrainMaterialGenerator().createSnow('deep'),
  
  // Special
  stratified_rock: () => new TerrainMaterialGenerator().createStratifiedRock(5),
  weathered_rock: () => new TerrainMaterialGenerator().createWeatheredRock(0.6),
  cracked_earth: () => new TerrainMaterialGenerator().generate('cracked_earth')
};

export default TerrainMaterialGenerator;
