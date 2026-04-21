/**
 * Creature Material Generation System
 * 
 * Implements procedural materials for creatures including:
 * - Skin with subsurface scattering simulation
 * - Fur/hair particle systems
 * - Scales, feathers, and specialized creature materials
 * - Bone, beak, horn, and eyeball materials
 * 
 * Features:
 * - Fitzpatrick skin type variations
 * - Age-related skin changes
 * - Creature-specific skin types (reptilian, amphibian, mammalian)
 * - Pattern generation (stripes, spots, etc.)
 */

import { Color, Texture, CanvasTexture, Vector2, Vector3 } from 'three';
import { NoiseGenerator } from '../procedural/NoiseGenerator';

// ============================================================================
// Type Definitions
// ============================================================================

export type CreatureMaterialType =
  | 'skin'
  | 'fur'
  | 'scales'
  | 'feathers'
  | 'bone'
  | 'beak'
  | 'horn'
  | 'eyeball'
  | 'tongue'
  | 'nose'
  | 'slime';

export type SkinType = 
  | 'human'
  | 'mammal'
  | 'reptile'
  | 'amphibian'
  | 'fish'
  | 'bird';

export type FitzpatrickType = I | II | III | IV | V | VI;

export interface CreatureMaterialProperties {
  // Base color
  baseColor: Color;
  
  // Subsurface scattering simulation
  sssAmount: number;        // 0-1, intensity of subsurface scattering
  sssRadius: number;        // Scattering radius in mm
  sssColor?: Color;         // Tint for subsurface scattering
  
  // Surface details
  roughness: number;
  metalness: number;
  
  // Creature-specific properties
  skinType?: SkinType;
  pattern?: 'none' | 'stripes' | 'spots' | 'marbled' | 'gradient' | 'freckles';
  patternScale?: number;
  patternIntensity?: number;
  
  // Age/wear factors
  ageFactor?: number;       // 0-1, affects wrinkles, spots
  wetness?: number;         // 0-1, for amphibians/slimy creatures
}

export interface GeneratedCreatureMaterial {
  properties: CreatureMaterialProperties;
  textures: {
    baseColor?: Texture;
    roughness?: Texture;
    normal?: Texture;
    sss?: Texture;          // Subsurface scattering map
    pattern?: Texture;      // Stripe/spot pattern
  };
  type: CreatureMaterialType;
  subtype?: string;
}

// ============================================================================
// Skin Tone Presets (Fitzpatrick Scale)
// ============================================================================

export const FITZPATRICK_SKIN_TONES: Record<FitzpatrickType, {
  baseColor: [number, number, number];
  sssColor: [number, number, number];
  roughness: number;
}> = {
  I: { // Very fair, always burns
    baseColor: [0.98, 0.88, 0.82],
    sssColor: [0.95, 0.70, 0.65],
    roughness: 0.45
  },
  II: { // Fair, usually burns
    baseColor: [0.96, 0.82, 0.75],
    sssColor: [0.93, 0.65, 0.60],
    roughness: 0.48
  },
  III: { // Medium, sometimes burns
    baseColor: [0.92, 0.76, 0.66],
    sssColor: [0.90, 0.60, 0.52],
    roughness: 0.50
  },
  IV: { // Olive, rarely burns
    baseColor: [0.85, 0.68, 0.54],
    sssColor: [0.82, 0.55, 0.45],
    roughness: 0.52
  },
  V: { // Brown, very rarely burns
    baseColor: [0.72, 0.52, 0.38],
    sssColor: [0.70, 0.45, 0.35],
    roughness: 0.55
  },
  VI: { // Dark brown/black, never burns
    baseColor: [0.45, 0.30, 0.22],
    sssColor: [0.55, 0.35, 0.28],
    roughness: 0.58
  }
};

// Animal skin tone presets
export const ANIMAL_SKIN_PRESETS: Record<string, {
  baseColor: [number, number, number];
  sssColor: [number, number, number];
  roughness: number;
}> = {
  pig: {
    baseColor: [0.95, 0.75, 0.80],
    sssColor: [0.92, 0.65, 0.70],
    roughness: 0.50
  },
  elephant: {
    baseColor: [0.45, 0.42, 0.40],
    sssColor: [0.55, 0.50, 0.48],
    roughness: 0.75
  },
  rhino: {
    baseColor: [0.50, 0.48, 0.45],
    sssColor: [0.58, 0.55, 0.52],
    roughness: 0.70
  },
  hippo: {
    baseColor: [0.60, 0.50, 0.55],
    sssColor: [0.65, 0.55, 0.58],
    roughness: 0.65
  }
};

// ============================================================================
// Creature Material Generator
// ============================================================================

export class CreatureMaterialGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed: number = Math.random()) {
    this.noise = new NoiseGenerator(seed);
  }
  
  /**
   * Generate a creature material based on type and parameters
   */
  generate(
    type: CreatureMaterialType, 
    params: Partial<CreatureMaterialProperties> = {}
  ): GeneratedCreatureMaterial {
    const defaultProps = this.getDefaultProperties(type);
    const properties: CreatureMaterialProperties = { ...defaultProps, ...params };
    
    const textures = this.generateTextures(type, properties);
    
    return {
      properties,
      textures,
      type,
    };
  }
  
  /**
   * Get default properties for a creature material type
   */
  getDefaultProperties(type: CreatureMaterialType): CreatureMaterialProperties {
    switch (type) {
      case 'skin':
        return {
          baseColor: new Color(0xD4A574), // Default medium skin tone
          sssAmount: 0.7,
          sssRadius: 1.5,
          sssColor: new Color(0xE88B7B),
          roughness: 0.50,
          metalness: 0.0,
          skinType: 'human',
          pattern: 'none',
          patternScale: 10,
          patternIntensity: 0.5,
          ageFactor: 0.0,
          wetness: 0.0
        };
      
      case 'fur':
        return {
          baseColor: new Color(0x8B4513),
          sssAmount: 0.3,
          sssRadius: 0.5,
          roughness: 0.8,
          metalness: 0.0,
          pattern: 'gradient',
          patternScale: 5,
          patternIntensity: 0.7
        };
      
      case 'scales':
        return {
          baseColor: new Color(0x2E8B57),
          sssAmount: 0.2,
          sssRadius: 0.3,
          roughness: 0.4,
          metalness: 0.1,
          pattern: 'marbled',
          patternScale: 20,
          patternIntensity: 0.6
        };
      
      case 'feathers':
        return {
          baseColor: new Color(0x4169E1),
          sssAmount: 0.1,
          sssRadius: 0.2,
          roughness: 0.6,
          metalness: 0.0,
          pattern: 'gradient',
          patternScale: 8,
          patternIntensity: 0.8
        };
      
      case 'bone':
        return {
          baseColor: new Color(0xF5F5DC),
          sssAmount: 0.4,
          sssRadius: 2.0,
          roughness: 0.7,
          metalness: 0.0,
          pattern: 'speckled',
          patternScale: 15,
          patternIntensity: 0.3,
          ageFactor: 0.0
        };
      
      case 'beak':
        return {
          baseColor: new Color(0xFFD700),
          sssAmount: 0.3,
          sssRadius: 0.8,
          roughness: 0.5,
          metalness: 0.0,
          pattern: 'gradient',
          patternScale: 5,
          patternIntensity: 0.4
        };
      
      case 'horn':
        return {
          baseColor: new Color(0x8B7355),
          sssAmount: 0.35,
          sssRadius: 1.0,
          roughness: 0.6,
          metalness: 0.0,
          pattern: 'marbled',
          patternScale: 10,
          patternIntensity: 0.5
        };
      
      case 'eyeball':
        return {
          baseColor: new Color(0xFFFFFF),
          sssAmount: 0.6,
          sssRadius: 0.5,
          roughness: 0.1,
          metalness: 0.0,
          wetness: 0.8
        };
      
      case 'tongue':
        return {
          baseColor: new Color(0xFF6B7A),
          sssAmount: 0.8,
          sssRadius: 1.2,
          roughness: 0.3,
          metalness: 0.0,
          wetness: 0.6
        };
      
      case 'nose':
        return {
          baseColor: new Color(0x2C2C2C),
          sssAmount: 0.5,
          sssRadius: 0.8,
          roughness: 0.4,
          metalness: 0.0,
          wetness: 0.4
        };
      
      case 'slime':
        return {
          baseColor: new Color(0x90EE90),
          sssAmount: 0.4,
          sssRadius: 0.6,
          roughness: 0.15,
          metalness: 0.0,
          wetness: 0.9
        };
      
      default:
        return {
          baseColor: new Color(0x808080),
          sssAmount: 0.3,
          sssRadius: 1.0,
          roughness: 0.5,
          metalness: 0.0
        };
    }
  }
  
  /**
   * Generate textures for creature materials
   */
  private generateTextures(
    type: CreatureMaterialType, 
    properties: CreatureMaterialProperties
  ): GeneratedCreatureMaterial['textures'] {
    const textures: GeneratedCreatureMaterial['textures'] = {};
    
    // Generate base color texture with patterns
    if (properties.pattern && properties.pattern !== 'none') {
      textures.baseColor = this.createPatternTexture(type, properties);
    }
    
    // Generate pattern texture for stripes/spots
    if (properties.pattern === 'stripes' || properties.pattern === 'spots') {
      textures.pattern = this.createPatternMaskTexture(properties);
    }
    
    // Generate SSS map
    textures.sss = this.createSSSTexture(properties);
    
    // Generate roughness map
    textures.roughness = this.createRoughnessTexture(properties);
    
    // Generate normal map for surface detail
    textures.normal = this.createNormalTexture(type, properties);
    
    return textures;
  }
  
  /**
   * Create human/creature skin with Fitzpatrick scale support
   */
  createSkin(
    fitzpatrickType?: FitzpatrickType,
    params: Partial<CreatureMaterialProperties> = {}
  ): GeneratedCreatureMaterial {
    const skinTone = fitzpatrickType ? FITZPATRICK_SKIN_TONES[fitzpatrickType] : FITZPATRICK_SKIN_TONES.III;
    
    const baseMaterial = this.generate('skin', {
      baseColor: new Color(...skinTone.baseColor),
      sssColor: new Color(...skinTone.sssColor),
      roughness: skinTone.roughness,
      ...params
    });
    
    // Add age-related features if ageFactor > 0
    if (params.ageFactor && params.ageFactor > 0) {
      baseMaterial.textures.baseColor = this.addAgeFeatures(
        baseMaterial.textures.baseColor,
        params.ageFactor
      );
    }
    
    baseMaterial.subtype = fitzpatrickType ? `fitzpatrick_${fitzpatrickType}` : 'custom';
    
    return baseMaterial;
  }
  
  /**
   * Create animal skin (pig, elephant, etc.)
   */
  createAnimalSkin(
    animal: string,
    params: Partial<CreatureMaterialProperties> = {}
  ): GeneratedCreatureMaterial {
    const preset = ANIMAL_SKIN_PRESETS[animal.toLowerCase()];
    
    if (!preset) {
      // Fall back to generic mammal skin
      return this.generate('skin', {
        skinType: 'mammal',
        ...params
      });
    }
    
    return this.generate('skin', {
      baseColor: new Color(...preset.baseColor),
      sssColor: new Color(...preset.sssColor),
      roughness: preset.roughness,
      skinType: 'mammal',
      ...params
    });
  }
  
  /**
   * Create reptilian skin with scales
   */
  createReptileSkin(
    color: Color = new Color(0x2E8B57),
    scaleSize: number = 0.05,
    params: Partial<CreatureMaterialProperties> = {}
  ): GeneratedCreatureMaterial {
    return this.generate('scales', {
      baseColor: color,
      pattern: 'marbled',
      patternScale: 1 / scaleSize,
      skinType: 'reptile',
      roughness: 0.4,
      ...params
    });
  }
  
  /**
   * Create amphibian skin (moist, smooth)
   */
  createAmphibianSkin(
    color: Color = new Color(0x6B8E23),
    params: Partial<CreatureMaterialProperties> = {}
  ): GeneratedCreatureMaterial {
    return this.generate('skin', {
      baseColor: color,
      skinType: 'amphibian',
      wetness: 0.7,
      roughness: 0.2,
      sssAmount: 0.6,
      ...params
    });
  }
  
  /**
   * Create fish skin with iridescent scales
   */
  createFishSkin(
    baseColor: Color = new Color(0x4682B4),
    iridescent: boolean = true,
    params: Partial<CreatureMaterialProperties> = {}
  ): GeneratedCreatureMaterial {
    const material = this.generate('scales', {
      baseColor: baseColor,
      skinType: 'fish',
      pattern: 'gradient',
      roughness: 0.3,
      metalness: iridescent ? 0.3 : 0.1,
      ...params
    });
    
    material.subtype = iridescent ? 'iridescent' : 'matte';
    
    return material;
  }
  
  /**
   * Generate fur material with anisotropic shading hints
   */
  createFur(
    baseColor: Color = new Color(0x8B4513),
    tipColor?: Color,
    density: 'sparse' | 'medium' | 'dense' = 'medium',
    params: Partial<CreatureMaterialProperties> = {}
  ): GeneratedCreatureMaterial {
    const tip = tipColor || baseColor.clone().multiplyScalar(0.7);
    
    return this.generate('fur', {
      baseColor: baseColor,
      pattern: 'gradient',
      patternIntensity: density === 'dense' ? 0.9 : density === 'medium' ? 0.7 : 0.5,
      roughness: 0.8,
      ...params
    });
  }
  
  /**
   * Create bone material with weathering
   */
  createBone(
    weathered: boolean = false,
    params: Partial<CreatureMaterialProperties> = {}
  ): GeneratedCreatureMaterial {
    return this.generate('bone', {
      pattern: weathered ? 'marbled' : 'speckled',
      patternIntensity: weathered ? 0.6 : 0.3,
      roughness: weathered ? 0.8 : 0.7,
      ageFactor: weathered ? 0.7 : 0.0,
      ...params
    });
  }
  
  /**
   * Create eyeball with cornea, iris, and sclera
   */
  createEyeball(
    irisColor: Color = new Color(0x4169E1),
    bloodshot: number = 0.0,
    params: Partial<CreatureMaterialProperties> = {}
  ): GeneratedCreatureMaterial {
    const material = this.generate('eyeball', {
      wetness: 0.8,
      roughness: 0.1,
      ...params
    });
    
    // Store iris color for shader use
    (material as any).irisColor = irisColor;
    (material as any).bloodshotLevel = bloodshot;
    
    return material;
  }
  
  // ============================================================================
  // Texture Generation Methods
  // ============================================================================
  
  private createPatternTexture(
    type: CreatureMaterialType, 
    properties: CreatureMaterialProperties
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
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * scale;
        const v = y / size * scale;
        
        let variation = 0;
        
        switch (properties.pattern) {
          case 'stripes':
            variation = Math.sin(u * Math.PI * 2) * intensity;
            break;
          case 'spots':
            const spotNoise = this.noise.fbm(u * 2, v * 2, 4);
            variation = spotNoise > 0.3 ? intensity * 0.5 : -intensity * 0.3;
            break;
          case 'marbled':
            variation = this.noise.fbm(u * 0.5, v * 0.5, 4) * intensity;
            break;
          case 'gradient':
            variation = (v / scale - 0.5) * intensity;
            break;
          case 'freckles':
            const freckleNoise = this.noise.voronoi(u * 3, v * 3);
            variation = freckleNoise < 0.2 ? intensity * 0.4 : 0;
            break;
          default:
            variation = this.noise.fbm(u, v, 3) * intensity * 0.3;
        }
        
        // Apply age-related darkening
        if (properties.ageFactor && properties.ageFactor > 0) {
          variation += properties.ageFactor * 0.1 * this.noise.fbm(u * 0.3, v * 0.3, 2);
        }
        
        const idx = (y * size + x) * 4;
        data[idx] = Math.max(0, Math.min(255, baseColor.r * 255 * (1 + variation)));
        data[idx + 1] = Math.max(0, Math.min(255, baseColor.g * 255 * (1 + variation)));
        data[idx + 2] = Math.max(0, Math.min(255, baseColor.b * 255 * (1 + variation)));
        data[idx + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = 1000; // RepeatWrapping
    texture.needsUpdate = true;
    
    return texture;
  }
  
  private createPatternMaskTexture(properties: CreatureMaterialProperties): CanvasTexture {
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
        
        let mask = 0;
        
        if (properties.pattern === 'stripes') {
          mask = (Math.sin(u * Math.PI * 2) + 1) / 2;
        } else if (properties.pattern === 'spots') {
          const spotNoise = this.noise.fbm(u * 2, v * 2, 4);
          mask = spotNoise > 0.3 ? 1 : 0;
        }
        
        const idx = (y * size + x) * 4;
        const value = Math.floor(mask * 255);
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
  
  private createSSSTexture(properties: CreatureMaterialProperties): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const sssAmount = properties.sssAmount || 0.5;
    const sssColor = properties.sssColor || properties.baseColor;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * 5;
        const v = y / size * 5;
        
        // Thickness variation (thinner areas = more SSS)
        const thickness = 0.5 + this.noise.fbm(u, v, 3) * 0.5;
        const sssIntensity = sssAmount * (1 - thickness * 0.5);
        
        const idx = (y * size + x) * 4;
        data[idx] = Math.floor(sssColor.r * 255 * sssIntensity);
        data[idx + 1] = Math.floor(sssColor.g * 255 * sssIntensity);
        data[idx + 2] = Math.floor(sssColor.b * 255 * sssIntensity);
        data[idx + 3] = Math.floor(sssIntensity * 255);
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return texture;
  }
  
  private createRoughnessTexture(properties: CreatureMaterialProperties): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const baseRoughness = properties.roughness;
    const wetness = properties.wetness || 0;
    const variation = 0.15;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * 10;
        const v = y / size * 10;
        
        const noise = this.noise.fbm(u, v, 3) * variation;
        // Wetness reduces roughness
        const roughness = Math.max(0.05, Math.min(1, baseRoughness + noise - wetness * 0.5));
        
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
    type: CreatureMaterialType, 
    properties: CreatureMaterialProperties
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
        
        // Sample height field with type-specific detail
        let h00, h10, h01;
        
        if (type === 'scales') {
          // Scale pattern
          const cellX = Math.floor(u * 2);
          const cellY = Math.floor(v * 2);
          const localU = (u * 2) % 1;
          const localV = (v * 2) % 1;
          
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
        
        // Calculate normals from height gradients
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
  
  private addAgeFeatures(baseTexture: Texture | undefined, ageFactor: number): CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    // Draw base texture if available
    if (baseTexture && baseTexture.image) {
      ctx.drawImage(baseTexture.image, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#D4A574';
      ctx.fillRect(0, 0, size, size);
    }
    
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * 5;
        const v = y / size * 5;
        
        // Add wrinkles (fine lines)
        const wrinkleNoise = this.noise.fbm(u * 3, v * 3, 4);
        const wrinkleIntensity = ageFactor * 0.2 * (wrinkleNoise > 0.6 ? 1 : 0);
        
        // Add age spots
        const spotNoise = this.noise.voronoi(u * 2, v * 2);
        const spotIntensity = ageFactor * 0.3 * (spotNoise < 0.15 ? 1 : 0);
        
        const idx = (y * size + x) * 4;
        
        // Darken for wrinkles
        if (wrinkleIntensity > 0) {
          data[idx] = Math.max(0, data[idx] - wrinkleIntensity * 50);
          data[idx + 1] = Math.max(0, data[idx + 1] - wrinkleIntensity * 50);
          data[idx + 2] = Math.max(0, data[idx + 2] - wrinkleIntensity * 50);
        }
        
        // Add brownish spots
        if (spotIntensity > 0) {
          data[idx] = Math.min(255, data[idx] + spotIntensity * 30);
          data[idx + 1] = Math.max(0, data[idx + 1] - spotIntensity * 10);
          data[idx + 2] = Math.max(0, data[idx + 2] - spotIntensity * 20);
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = 1000;
    texture.needsUpdate = true;
    
    return texture;
  }
}

// ============================================================================
// Preset Creature Materials
// ============================================================================

export const CREATURE_MATERIAL_PRESETS: Record<string, () => GeneratedCreatureMaterial> = {
  human_fair: () => new CreatureMaterialGenerator().createSkin('I'),
  human_medium: () => new CreatureMaterialGenerator().createSkin('III'),
  human_dark: () => new CreatureMaterialGenerator().createSkin('VI'),
  
  tiger: () => {
    const gen = new CreatureMaterialGenerator();
    const base = gen.createFur(new Color(0xFF8C00), new Color(0x000000), 'dense');
    base.properties.pattern = 'stripes';
    return base;
  },
  
  zebra: () => {
    const gen = new CreatureMaterialGenerator();
    const base = gen.createFur(new Color(0xFFFFFF), new Color(0x000000), 'medium');
    base.properties.pattern = 'stripes';
    base.properties.patternScale = 30;
    return base;
  },
  
  leopard: () => {
    const gen = new CreatureMaterialGenerator();
    const base = gen.createFur(new Color(0xDAA520), new Color(0x000000), 'medium');
    base.properties.pattern = 'spots';
    return base;
  },
  
  snake_green: () => {
    const gen = new CreatureMaterialGenerator();
    return gen.createReptileSkin(new Color(0x228B22), 0.03);
  },
  
  fish_tropical: () => {
    const gen = new CreatureMaterialGenerator();
    return gen.createFishSkin(new Color(0xFF6347), true);
  },
  
  frog: () => {
    const gen = new CreatureMaterialGenerator();
    return gen.createAmphibianSkin(new Color(0x32CD32));
  },
  
  elephant: () => {
    const gen = new CreatureMaterialGenerator();
    return gen.createAnimalSkin('elephant');
  },
  
  bone_aged: () => {
    const gen = new CreatureMaterialGenerator();
    return gen.createBone(true);
  },
  
  dragon_eye: () => {
    const gen = new CreatureMaterialGenerator();
    return gen.createEyeball(new Color(0xFFD700), 0.1);
  }
};

export default CreatureMaterialGenerator;
