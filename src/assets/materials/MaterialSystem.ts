/**
 * Procedural Material Generation System
 * 
 * Implements PBR material generation with procedural textures.
 * Supports various material types: wood, metal, fabric, ceramic, plastic, etc.
 * 
 * Features:
 * - Procedural texture generation (noise-based)
 * - PBR material properties (roughness, metalness, normal maps)
 * - Weathering and wear effects
 * - Style-based variations
 * - LOD texture generation
 */

import { Color, Texture, CanvasTexture, Vector2 } from 'three';

// ============================================================================
// Type Definitions
// ============================================================================

export type MaterialType = 
  | 'wood' 
  | 'metal' 
  | 'fabric' 
  | 'ceramic' 
  | 'plastic' 
  | 'glass' 
  | 'leather' 
  | 'stone' 
  | 'terrain' 
  | 'plant';

export interface MaterialProperties {
  // Base color
  baseColor: Color;
  
  // PBR properties
  roughness: number;      // 0-1
  metalness: number;      // 0-1
  normalScale?: number;   // Normal map intensity
  
  // Surface details
  hasNormalMap: boolean;
  hasRoughnessMap: boolean;
  hasMetalnessMap: boolean;
  hasAOMap: boolean;
  
  // Wear and weathering
  wearLevel?: number;     // 0-1
  dirtLevel?: number;     // 0-1
  
  // Pattern parameters
  pattern?: 'none' | 'grain' | 'brushed' | 'woven' | 'marbled' | 'speckled';
  patternScale?: number;
  patternRotation?: number;
}

export interface GeneratedMaterial {
  properties: MaterialProperties;
  textures: {
    baseColor?: Texture;
    roughness?: Texture;
    metalness?: Texture;
    normal?: Texture;
    ao?: Texture;
  };
  type: MaterialType;
  style?: string;
}

// ============================================================================
// Noise Functions for Procedural Textures
// ============================================================================

class NoiseGenerator {
  private permutation: number[];
  
  constructor(seed: number = Math.random()) {
    this.permutation = this.generatePermutation(seed);
  }
  
  private generatePermutation(seed: number): number[] {
    const p: number[] = [];
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    
    // Fisher-Yates shuffle with seed
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.seededRandom(seed + i) * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    
    // Duplicate for wrapping
    return [...p, ...p];
  }
  
  private seededRandom(seed: number): number {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  
  fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }
  
  grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  perlin2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    const u = this.fade(x);
    const v = this.fade(y);
    
    const A = this.permutation[X] + Y;
    const B = this.permutation[X + 1] + Y;
    
    return this.lerp(
      this.lerp(this.grad(this.permutation[A], x, y), this.grad(this.permutation[B], x - 1, y), u),
      this.lerp(this.grad(this.permutation[A + 1], x, y - 1), this.grad(this.permutation[B + 1], x - 1, y - 1), u),
      v
    );
  }
  
  fbm(x: number, y: number, octaves: number = 4): number {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.perlin2D(x * frequency, y * frequency);
      amplitude *= 0.5;
      frequency *= 2;
    }
    
    return value;
  }
  
  voronoi(x: number, y: number, seed: number = 0): number {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const localX = x - cellX;
    const localY = y - cellY;
    
    let minDist = Infinity;
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighborX = cellX + dx;
        const neighborY = cellY + dy;
        
        const pointSeed = this.seededRandom(neighborX * 1000 + neighborY + seed);
        const pointX = neighborX + this.seededRandom(pointSeed);
        const pointY = neighborY + this.seededRandom(pointSeed + 1);
        
        const dist = Math.sqrt((localX - (pointX - cellX)) ** 2 + (localY - (pointY - cellY)) ** 2);
        minDist = Math.min(minDist, dist);
      }
    }
    
    return minDist;
  }
}

// ============================================================================
// Material Generators
// ============================================================================

export class MaterialGenerator {
  private noise: NoiseGenerator;
  
  constructor(seed: number = Math.random()) {
    this.noise = new NoiseGenerator(seed);
  }
  
  generate(type: MaterialType, params: Partial<MaterialProperties> = {}): GeneratedMaterial {
    const defaultProps = this.getDefaultProperties(type);
    const properties: MaterialProperties = { ...defaultProps, ...params };
    
    const textures = this.generateTextures(type, properties);
    
    return {
      properties,
      textures,
      type,
    };
  }
  
  getDefaultProperties(type: MaterialType): MaterialProperties {
    switch (type) {
      case 'wood':
        return {
          baseColor: new Color(0x8B4513),
          roughness: 0.6,
          metalness: 0.0,
          hasNormalMap: true,
          hasRoughnessMap: true,
          hasMetalnessMap: false,
          hasAOMap: false,
          pattern: 'grain',
          patternScale: 10,
        };
      
      case 'metal':
        return {
          baseColor: new Color(0xCCCCCC),
          roughness: 0.3,
          metalness: 0.9,
          hasNormalMap: true,
          hasRoughnessMap: true,
          hasMetalnessMap: false,
          hasAOMap: false,
          pattern: 'brushed',
          patternScale: 20,
        };
      
      case 'fabric':
        return {
          baseColor: new Color(0x4A5568),
          roughness: 0.8,
          metalness: 0.0,
          hasNormalMap: true,
          hasRoughnessMap: false,
          hasMetalnessMap: false,
          hasAOMap: true,
          pattern: 'woven',
          patternScale: 30,
        };
      
      case 'ceramic':
        return {
          baseColor: new Color(0xFFFFFF),
          roughness: 0.2,
          metalness: 0.0,
          hasNormalMap: false,
          hasRoughnessMap: false,
          hasMetalnessMap: false,
          hasAOMap: false,
        };
      
      case 'plastic':
        return {
          baseColor: new Color(0xFF0000),
          roughness: 0.4,
          metalness: 0.0,
          hasNormalMap: false,
          hasRoughnessMap: false,
          hasMetalnessMap: false,
          hasAOMap: false,
        };
      
      case 'glass':
        return {
          baseColor: new Color(0x88CCFF),
          roughness: 0.05,
          metalness: 0.0,
          hasNormalMap: false,
          hasRoughnessMap: false,
          hasMetalnessMap: false,
          hasAOMap: false,
        };
      
      case 'leather':
        return {
          baseColor: new Color(0x654321),
          roughness: 0.5,
          metalness: 0.0,
          hasNormalMap: true,
          hasRoughnessMap: true,
          hasMetalnessMap: false,
          hasAOMap: false,
          pattern: 'speckled',
          patternScale: 15,
        };
      
      case 'stone':
        return {
          baseColor: new Color(0x808080),
          roughness: 0.7,
          metalness: 0.0,
          hasNormalMap: true,
          hasRoughnessMap: true,
          hasMetalnessMap: false,
          hasAOMap: true,
          pattern: 'marbled',
          patternScale: 5,
        };
      
      case 'terrain':
        return {
          baseColor: new Color(0x3D5C3D),
          roughness: 0.9,
          metalness: 0.0,
          hasNormalMap: true,
          hasRoughnessMap: false,
          hasMetalnessMap: false,
          hasAOMap: true,
        };
      
      case 'plant':
        return {
          baseColor: new Color(0x228B22),
          roughness: 0.6,
          metalness: 0.0,
          hasNormalMap: true,
          hasRoughnessMap: false,
          hasMetalnessMap: false,
          hasAOMap: false,
        };
      
      default:
        return {
          baseColor: new Color(0x808080),
          roughness: 0.5,
          metalness: 0.5,
          hasNormalMap: false,
          hasRoughnessMap: false,
          hasMetalnessMap: false,
          hasAOMap: false,
        };
    }
  }
  
  private generateTextures(type: MaterialType, properties: MaterialProperties): GeneratedMaterial['textures'] {
    const textures: GeneratedMaterial['textures'] = {};
    
    // Generate base color texture if pattern is specified
    if (properties.pattern && properties.pattern !== 'none') {
      textures.baseColor = this.createPatternTexture(type, properties);
    }
    
    // Generate roughness map if needed
    if (properties.hasRoughnessMap) {
      textures.roughness = this.createRoughnessTexture(properties);
    }
    
    // Generate normal map if needed
    if (properties.hasNormalMap) {
      textures.normal = this.createNormalTexture(type, properties);
    }
    
    // Generate AO map if needed
    if (properties.hasAOMap) {
      textures.ao = this.createAOTexture(properties);
    }
    
    return textures;
  }
  
  private createPatternTexture(type: MaterialType, properties: MaterialProperties): CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const scale = properties.patternScale || 10;
    const baseColor = properties.baseColor;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * scale;
        const v = y / size * scale;
        
        let variation = 0;
        
        switch (properties.pattern) {
          case 'grain':
            variation = this.noise.fbm(u, v, 4) * 0.3;
            break;
          case 'brushed':
            variation = this.noise.perlin2D(u * 2, v * 0.5) * 0.2;
            break;
          case 'woven':
            const weaveX = Math.sin(u * Math.PI * 4) * 0.1;
            const weaveY = Math.cos(v * Math.PI * 4) * 0.1;
            variation = (weaveX + weaveY) * 0.5;
            break;
          case 'marbled':
            variation = this.noise.fbm(u * 0.5, v * 0.5, 3) * 0.4;
            break;
          case 'speckled':
            variation = (this.noise.voronoi(u, v) - 0.5) * 0.3;
            break;
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
  
  private createRoughnessTexture(properties: MaterialProperties): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    const baseRoughness = properties.roughness;
    const variation = 0.15;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * 10;
        const v = y / size * 10;
        
        const noise = this.noise.fbm(u, v, 3) * variation;
        const roughness = Math.max(0, Math.min(1, baseRoughness + noise));
        
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
  
  private createNormalTexture(type: MaterialType, properties: MaterialProperties): CanvasTexture {
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
        
        // Sample height field
        const h00 = this.noise.fbm(u, v, 3);
        const h10 = this.noise.fbm(u + 0.01, v, 3);
        const h01 = this.noise.fbm(u, v + 0.01, 3);
        
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
  
  private createAOTexture(properties: MaterialProperties): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * 5;
        const v = y / size * 5;
        
        const ao = 0.7 + this.noise.fbm(u, v, 2) * 0.3;
        
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
  
  applyWear(material: GeneratedMaterial, wearLevel: number, dirtLevel: number = 0): GeneratedMaterial {
    const worn = { ...material };
    worn.properties.wearLevel = wearLevel;
    worn.properties.dirtLevel = dirtLevel;
    
    // Modify roughness based on wear
    if (worn.textures.roughness) {
      // In production, would regenerate texture with wear patterns
      worn.properties.roughness = Math.min(1, worn.properties.roughness + wearLevel * 0.3);
    }
    
    // Modify base color based on dirt
    if (dirtLevel > 0) {
      const dirtColor = new Color(0x3D2817);
      worn.properties.baseColor.lerp(dirtColor, dirtLevel * 0.3);
    }
    
    return worn;
  }
  
  createStyleVariation(baseMaterial: GeneratedMaterial, style: 'modern' | 'traditional' | 'industrial' | 'rustic'): GeneratedMaterial {
    const variation = { ...baseMaterial };
    
    switch (style) {
      case 'modern':
        variation.properties.roughness *= 0.8;
        variation.properties.baseColor.multiplyScalar(1.1);
        break;
      case 'traditional':
        variation.properties.roughness *= 1.2;
        variation.properties.baseColor.multiplyScalar(0.9);
        break;
      case 'industrial':
        variation.properties.roughness *= 1.3;
        variation.properties.metalness = Math.min(1, variation.properties.metalness + 0.2);
        break;
      case 'rustic':
        variation.properties.roughness *= 1.4;
        variation.properties.baseColor.offsetHSL(0, 0.1, -0.1);
        break;
    }
    
    return this.applyWear(variation, style === 'rustic' ? 0.3 : 0.1);
  }
}

// ============================================================================
// Material Library
// ============================================================================

export class MaterialLibrary {
  private static generator: MaterialGenerator = new MaterialGenerator();
  private static cache: Map<string, GeneratedMaterial> = new Map();
  
  static getMaterial(type: MaterialType, style?: string, seed?: number): GeneratedMaterial {
    const cacheKey = `${type}-${style || 'default'}-${seed || 0}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    const material = this.generator.generate(type);
    
    if (style) {
      const styled = this.generator.createStyleVariation(material, style as any);
      this.cache.set(cacheKey, styled);
      return styled;
    }
    
    this.cache.set(cacheKey, material);
    return material;
  }
  
  static getRandomWood(): GeneratedMaterial {
    const woods = ['oak', 'pine', 'walnut', 'mahogany', 'cherry'];
    const wood = woods[Math.floor(Math.random() * woods.length)];
    
    const baseColors: Record<string, number> = {
      oak: 0xC4A484,
      pine: 0xD2B48C,
      walnut: 0x5C4033,
      mahogany: 0x4A2C2A,
      cherry: 0x8B4513,
    };
    
    return this.generator.generate('wood', {
      baseColor: new Color(baseColors[wood]),
      patternScale: 8 + Math.random() * 4,
    });
  }
  
  static getRandomMetal(): GeneratedMaterial {
    const metals = ['steel', 'aluminum', 'brass', 'copper', 'bronze'];
    const metal = metals[Math.floor(Math.random() * metals.length)];
    
    const baseColors: Record<string, number> = {
      steel: 0xBCC6CC,
      aluminum: 0xD3D3D3,
      brass: 0xB5A642,
      copper: 0xB87333,
      bronze: 0xCD7F32,
    };
    
    return this.generator.generate('metal', {
      baseColor: new Color(baseColors[metal]),
      roughness: 0.2 + Math.random() * 0.3,
    });
  }
  
  static getRandomFabric(): GeneratedMaterial {
    const colors = [0x4A5568, 0x2D3748, 0x718096, 0xA0AEC0, 0xE2E8F0];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    return this.generator.generate('fabric', {
      baseColor: new Color(color),
      patternScale: 20 + Math.random() * 20,
    });
  }
  
  static clearCache(): void {
    this.cache.clear();
  }
}

export { MaterialGenerator, NoiseGenerator };
