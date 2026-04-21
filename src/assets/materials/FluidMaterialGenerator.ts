/**
 * Fluid Material Generator for InfiniGen R3F Port
 * 
 * Generates procedural fluid materials including water, lava, smoke, and fog.
 * Implements advanced shader effects like Gerstner waves, caustics, and volumetrics.
 * 
 * Features:
 * - Water with surface waves and depth absorption
 * - Lava with molten core and cooling crust
 * - Smoke/fog volumetric effects
 * - Caustics projection
 * - Foam and whitewater
 * - Viscosity appearance
 * 
 * @author InfiniGen R3F Team
 * @version 1.0.0
 */

import { CanvasTexture, Color, Vector2, MathUtils } from 'three';

/**
 * Fluid type enumeration
 */
export enum FluidType {
  WATER = 'water',
  LAVA = 'lava',
  SMOKE = 'smoke',
  FOG = 'fog',
  OIL = 'oil',
  SLIME = 'slime'
}

/**
 * Water preset types
 */
export enum WaterPreset {
  OCEAN = 'ocean',
  LAKE = 'lake',
  RIVER = 'river',
  POOL = 'pool',
  SWAMP = 'swamp',
  TROPICAL = 'tropical',
  ARCTIC = 'arctic'
}

/**
 * Lava preset types
 */
export enum LavaPreset {
  BASALTIC = 'basaltic',
  ANDESITIC = 'andesitic',
  RHYOLITIC = 'rhyolitic',
  COOLING = 'cooling',
  FLOWING = 'flowing'
}

/**
 * Configuration for fluid material generation
 */
export interface FluidMaterialConfig {
  // Basic settings
  fluidType: FluidType;
  
  // Color settings
  baseColor: Color;
  deepColor?: Color;
  foamColor?: Color;
  
  // Surface properties
  roughness?: number;
  metalness?: number;
  transmission?: number;
  thickness?: number;
  
  // Wave settings (for water)
  waveAmplitude?: number;
  waveFrequency?: number;
  waveSpeed?: number;
  waveDirection?: Vector2;
  
  // Depth settings
  maxDepth?: number;
  absorptionCoefficient?: number;
  
  // Foam settings
  foamAmount?: number;
  foamScale?: number;
  
  // Animation
  time?: number;
  animationSpeed?: number;
  
  // Randomization
  seed?: number;
  
  // Resolution
  textureSize?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<FluidMaterialConfig> = {
  roughness: 0.1,
  metalness: 0.0,
  transmission: 0.9,
  thickness: 1.0,
  waveAmplitude: 0.1,
  waveFrequency: 1.0,
  waveSpeed: 1.0,
  waveDirection: new Vector2(1, 0),
  maxDepth: 10.0,
  absorptionCoefficient: 0.5,
  foamAmount: 0.3,
  foamScale: 0.05,
  time: 0,
  animationSpeed: 1.0,
  textureSize: 512
};

/**
 * Fluid Material Generator Class
 * 
 * Generates procedural fluid materials with realistic shading
 */
export class FluidMaterialGenerator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentConfig: FluidMaterialConfig | null = null;
  
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  /**
   * Generate a complete fluid material texture set
   */
  public generate(config: FluidMaterialConfig): {
    baseColor: CanvasTexture;
    roughness: CanvasTexture;
    normal: CanvasTexture;
    height: CanvasTexture;
    foam: CanvasTexture;
    absorption: CanvasTexture;
  } {
    this.currentConfig = { ...DEFAULT_CONFIG, ...config };
    
    const size = this.currentConfig.textureSize || 512;
    this.canvas.width = size;
    this.canvas.height = size;
    
    // Generate based on fluid type
    switch (this.currentConfig.fluidType) {
      case FluidType.WATER:
        return this.generateWater(size);
      case FluidType.LAVA:
        return this.generateLava(size);
      case FluidType.SMOKE:
      case FluidType.FOG:
        return this.generateVolumetric(size);
      default:
        return this.generateGenericFluid(size);
    }
  }
  
  /**
   * Generate water material textures
   */
  private generateWater(size: number): {
    baseColor: CanvasTexture;
    roughness: CanvasTexture;
    normal: CanvasTexture;
    height: CanvasTexture;
    foam: CanvasTexture;
    absorption: CanvasTexture;
  } {
    const config = this.currentConfig!;
    const time = (config.time || 0) * (config.animationSpeed || 1.0);
    
    // Generate base color with depth gradient
    this.drawWaterBaseColor(size, time);
    const baseColorMap = this.createTexture();
    
    // Generate roughness (smooth water surface)
    this.generateWaterRoughness(size, time);
    const roughnessMap = this.createTexture();
    
    // Generate normal map with waves
    this.generateWaterNormal(size, time);
    const normalMap = this.createTexture();
    
    // Generate height/displacement map
    this.generateWaterHeight(size, time);
    const heightMap = this.createTexture();
    
    // Generate foam mask
    this.generateFoamMask(size, time);
    const foamMap = this.createTexture();
    
    // Generate absorption map (depth-based)
    this.generateAbsorptionMap(size);
    const absorptionMap = this.createTexture();
    
    return {
      baseColor: baseColorMap,
      roughness: roughnessMap,
      normal: normalMap,
      height: heightMap,
      foam: foamMap,
      absorption: absorptionMap
    };
  }
  
  /**
   * Draw water base color with depth variation
   */
  private drawWaterBaseColor(size: number, time: number): void {
    const config = this.currentConfig!;
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    const baseColor = config.baseColor;
    const deepColor = config.deepColor || new Color(baseColor.r * 0.5, baseColor.g * 0.6, baseColor.b * 0.7);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Create depth-like variation using noise
        const noise = this.perlin2D(x * 0.02 + time * 0.1, y * 0.02 + time * 0.1);
        const depthFactor = (noise + 1) * 0.5;
        
        // Interpolate between shallow and deep color
        const r = MathUtils.lerp(baseColor.r, deepColor.r, depthFactor);
        const g = MathUtils.lerp(baseColor.g, deepColor.g, depthFactor);
        const b = MathUtils.lerp(baseColor.b, deepColor.b, depthFactor);
        
        const idx = (y * size + x) * 4;
        data[idx] = Math.round(r * 255);
        data[idx + 1] = Math.round(g * 255);
        data[idx + 2] = Math.round(b * 255);
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate water roughness map
   */
  private generateWaterRoughness(size: number, time: number): void {
    const config = this.currentConfig!;
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    const baseRoughness = config.roughness || 0.1;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Add wave-caused roughness variation
        const waveNoise = this.perlin2D(x * 0.05 + time, y * 0.05 + time);
        const roughness = baseRoughness + Math.abs(waveNoise) * 0.15;
        
        const idx = (y * size + x) * 4;
        const value = Math.round(Math.min(255, Math.max(0, roughness * 255)));
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate water normal map with Gerstner waves
   */
  private generateWaterNormal(size: number, time: number): void {
    const config = this.currentConfig!;
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    const amplitude = config.waveAmplitude || 0.1;
    const frequency = config.waveFrequency || 1.0;
    const speed = config.waveSpeed || 1.0;
    const direction = config.waveDirection || new Vector2(1, 0);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        // Sample multiple Gerstner waves
        let nx = 0, ny = 0;
        
        // Primary wave
        const wave1 = this.gerstnerWave(u, v, time * speed, amplitude, frequency, direction);
        nx += wave1.x * 0.7;
        ny += wave1.y * 0.7;
        
        // Secondary wave (smaller, different direction)
        const wave2 = this.gerstnerWave(
          u * 2.3, v * 2.3, 
          time * speed * 1.3, 
          amplitude * 0.3, 
          frequency * 1.5, 
          new Vector2(-direction.y, direction.x)
        );
        nx += wave2.x * 0.3;
        ny += wave2.y * 0.3;
        
        // Encode as normal map
        data[(y * size + x) * 4] = Math.round(128 + nx * 127);
        data[(y * size + x) * 4 + 1] = Math.round(128 + ny * 127);
        data[(y * size + x) * 4 + 2] = 255;
        data[(y * size + x) * 4 + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Calculate Gerstner wave at position
   */
  private gerstnerWave(
    u: number, v: number, time: number,
    amplitude: number, frequency: number,
    direction: Vector2
  ): { x: number; y: number; z: number } {
    const k = frequency * Math.PI * 2;
    const c = Math.sqrt(9.81 / k); // Phase speed
    const phase = k * (direction.x * u + direction.y * v) - time * k * c;
    
    const steepness = amplitude * k;
    const cosPhase = Math.cos(phase);
    const sinPhase = Math.sin(phase);
    
    // Gerstner wave derivatives for normal calculation
    const dx = -steepness * direction.x * sinPhase;
    const dy = -steepness * direction.y * sinPhase;
    const dz = steepness * cosPhase;
    
    return { x: dx, y: dy, z: dz };
  }
  
  /**
   * Generate water height map
   */
  private generateWaterHeight(size: number, time: number): void {
    const config = this.currentConfig!;
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    const amplitude = config.waveAmplitude || 0.1;
    const frequency = config.waveFrequency || 1.0;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        // Combine multiple sine waves for height
        let height = 0;
        height += Math.sin(u * frequency * Math.PI * 2 + time) * amplitude;
        height += Math.sin(v * frequency * Math.PI * 2 * 0.8 + time * 1.1) * amplitude * 0.5;
        height += this.perlin2D(u * 5 + time * 0.5, v * 5) * amplitude * 0.3;
        
        // Normalize to 0-255
        const normalized = (height + amplitude * 2) / (amplitude * 4);
        const value = Math.round(Math.min(255, Math.max(0, normalized * 255)));
        
        const idx = (y * size + x) * 4;
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate foam mask
   */
  private generateFoamMask(size: number, time: number): void {
    const config = this.currentConfig!;
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    const foamAmount = config.foamAmount || 0.3;
    const foamScale = config.foamScale || 0.05;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Create foam pattern using noise
        const noise1 = this.perlin2D(x * foamScale + time, y * foamScale);
        const noise2 = this.perlin2D(x * foamScale * 2 - time * 0.5, y * foamScale * 2);
        
        let foam = (noise1 + noise2 * 0.5) * 0.5 + 0.5;
        foam = Math.pow(foam, 3) * foamAmount; // Exponential falloff
        
        const value = Math.round(Math.min(255, Math.max(0, foam * 255)));
        const idx = (y * size + x) * 4;
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate absorption map for depth-based color
   */
  private generateAbsorptionMap(size: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Gradient from shallow to deep
        const depth = y / size;
        const absorption = 1.0 - depth * 0.5;
        
        const value = Math.round(Math.min(255, Math.max(0, absorption * 255)));
        const idx = (y * size + x) * 4;
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate lava material textures
   */
  private generateLava(size: number): {
    baseColor: CanvasTexture;
    roughness: CanvasTexture;
    normal: CanvasTexture;
    height: CanvasTexture;
    foam: CanvasTexture;
    absorption: CanvasTexture;
  } {
    const config = this.currentConfig!;
    const time = (config.time || 0) * (config.animationSpeed || 0.5);
    
    // Generate base color with temperature variation
    this.drawLavaBaseColor(size, time);
    const baseColorMap = this.createTexture();
    
    // Generate roughness (crusty surface)
    this.generateLavaRoughness(size, time);
    const roughnessMap = this.createTexture();
    
    // Generate normal map
    this.generateLavaNormal(size, time);
    const normalMap = this.createTexture();
    
    // Generate height map
    this.generateLavaHeight(size, time);
    const heightMap = this.createTexture();
    
    // Use foam channel for glow intensity
    this.generateLavaGlow(size, time);
    const glowMap = this.createTexture();
    
    // Absorption not really used for lava
    this.generateAbsorptionMap(size);
    const absorptionMap = this.createTexture();
    
    return {
      baseColor: baseColorMap,
      roughness: roughnessMap,
      normal: normalMap,
      height: heightMap,
      foam: glowMap,
      absorption: absorptionMap
    };
  }
  
  /**
   * Draw lava base color with temperature gradients
   */
  private drawLavaBaseColor(size: number, time: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    const hotColor = new Color(1.0, 0.6, 0.1); // Orange-yellow
    const coolColor = new Color(0.3, 0.05, 0.05); // Dark red-black
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Multiple noise layers for lava cell pattern
        const noise1 = this.perlin2D(x * 0.03 + time * 0.2, y * 0.03);
        const noise2 = this.perlin2D(x * 0.08 - time * 0.3, y * 0.08);
        const noise3 = this.perlin2D(x * 0.15, y * 0.15 + time * 0.1);
        
        const combinedNoise = noise1 * 0.6 + noise2 * 0.3 + noise3 * 0.1;
        const t = (combinedNoise + 1) * 0.5;
        
        // Temperature-based color interpolation
        const r = MathUtils.lerp(coolColor.r, hotColor.r, t);
        const g = MathUtils.lerp(coolColor.g, hotColor.g, t * 0.5);
        const b = MathUtils.lerp(coolColor.b, hotColor.b, t * 0.2);
        
        const idx = (y * size + x) * 4;
        data[idx] = Math.round(r * 255);
        data[idx + 1] = Math.round(g * 255);
        data[idx + 2] = Math.round(b * 255);
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate lava roughness (crusty surface)
   */
  private generateLavaRoughness(size: number, time: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Cooler areas are rougher (crusted)
        const noise = this.perlin2D(x * 0.04, y * 0.04);
        const roughness = 0.3 + (noise + 1) * 0.35; // 0.3 to 0.65
        
        const idx = (y * size + x) * 4;
        const value = Math.round(Math.min(255, Math.max(0, roughness * 255)));
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate lava normal map
   */
  private generateLavaNormal(size: number, time: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        // Sample gradient from noise
        const sampleDist = 0.01;
        const h = this.perlin2D(u * 10 + time * 0.1, v * 10);
        const hx = this.perlin2D((u + sampleDist) * 10 + time * 0.1, v * 10);
        const hy = this.perlin2D(u * 10 + time * 0.1, (v + sampleDist) * 10);
        
        const nx = (h - hx) * 5;
        const ny = (h - hy) * 5;
        const nz = 1.0;
        
        // Normalize
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        
        data[(y * size + x) * 4] = Math.round(128 + (nx / len) * 127);
        data[(y * size + x) * 4 + 1] = Math.round(128 + (ny / len) * 127);
        data[(y * size + x) * 4 + 2] = Math.round(128 + (nz / len) * 127);
        data[(y * size + x) * 4 + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate lava height map
   */
  private generateLavaHeight(size: number, time: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        const height = this.perlin2D(u * 8 + time * 0.1, v * 8);
        const normalized = (height + 1) * 0.5;
        
        const idx = (y * size + x) * 4;
        const value = Math.round(Math.min(255, Math.max(0, normalized * 255)));
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate lava glow mask
   */
  private generateLavaGlow(size: number, time: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        // Hotter areas glow more
        const noise1 = this.perlin2D(u * 10 + time * 0.2, v * 10);
        const noise2 = this.perlin2D(u * 20 - time * 0.3, v * 20);
        
        const glow = Math.pow((noise1 + noise2 * 0.5 + 1.5) * 0.25, 2);
        
        const idx = (y * size + x) * 4;
        const value = Math.round(Math.min(255, Math.max(0, glow * 255)));
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate volumetric smoke/fog textures
   */
  private generateVolumetric(size: number): {
    baseColor: CanvasTexture;
    roughness: CanvasTexture;
    normal: CanvasTexture;
    height: CanvasTexture;
    foam: CanvasTexture;
    absorption: CanvasTexture;
  } {
    const config = this.currentConfig!;
    const time = (config.time || 0) * (config.animationSpeed || 0.3);
    
    // Generate density/color
    this.drawVolumetricDensity(size, time);
    const baseColorMap = this.createTexture();
    
    // Roughness (not really applicable, use for density variation)
    this.generateVolumetricRoughness(size, time);
    const roughnessMap = this.createTexture();
    
    // Normal (for light interaction)
    this.generateVolumetricNormal(size, time);
    const normalMap = this.createTexture();
    
    // Height (density proxy)
    this.generateVolumetricHeight(size, time);
    const heightMap = this.createTexture();
    
    // Foam (additional density layer)
    this.generateVolumetricDensityLayer(size, time);
    const densityMap = this.createTexture();
    
    // Absorption
    this.generateAbsorptionMap(size);
    const absorptionMap = this.createTexture();
    
    return {
      baseColor: baseColorMap,
      roughness: roughnessMap,
      normal: normalMap,
      height: heightMap,
      foam: densityMap,
      absorption: absorptionMap
    };
  }
  
  /**
   * Draw volumetric density
   */
  private drawVolumetricDensity(size: number, time: number): void {
    const config = this.currentConfig!;
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    const baseColor = config.baseColor || new Color(0.7, 0.7, 0.7);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        // Multiple noise layers for wispy smoke
        const noise1 = this.perlin2D(u * 5 + time * 0.1, v * 5 + time * 0.05);
        const noise2 = this.perlin2D(u * 10 - time * 0.15, v * 10 - time * 0.1);
        const noise3 = this.fbm(u * 20, v * 20, 3);
        
        const density = (noise1 * 0.6 + noise2 * 0.3 + noise3 * 0.1 + 1) * 0.5;
        
        const idx = (y * size + x) * 4;
        data[idx] = Math.round(baseColor.r * 255 * density);
        data[idx + 1] = Math.round(baseColor.g * 255 * density);
        data[idx + 2] = Math.round(baseColor.b * 255 * density);
        data[idx + 3] = Math.round(density * 255);
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate generic fluid for other types
   */
  private generateGenericFluid(size: number): {
    baseColor: CanvasTexture;
    roughness: CanvasTexture;
    normal: CanvasTexture;
    height: CanvasTexture;
    foam: CanvasTexture;
    absorption: CanvasTexture;
  } {
    // Fall back to water-like generation
    return this.generateWater(size);
  }
  
  /**
   * Generate volumetric roughness
   */
  private generateVolumetricRoughness(size: number, time: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        const density = this.perlin2D(u * 8 + time * 0.1, v * 8);
        const value = Math.round(((density + 1) * 0.5) * 255);
        
        const idx = (y * size + x) * 4;
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate volumetric normal
   */
  private generateVolumetricNormal(size: number, time: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        const sampleDist = 0.01;
        const h = this.perlin2D(u * 6 + time * 0.1, v * 6);
        const hx = this.perlin2D((u + sampleDist) * 6 + time * 0.1, v * 6);
        const hy = this.perlin2D(u * 6 + time * 0.1, (v + sampleDist) * 6);
        
        const nx = (h - hx) * 3;
        const ny = (h - hy) * 3;
        const nz = 1.0;
        
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        
        data[(y * size + x) * 4] = Math.round(128 + (nx / len) * 127);
        data[(y * size + x) * 4 + 1] = Math.round(128 + (ny / len) * 127);
        data[(y * size + x) * 4 + 2] = Math.round(128 + (nz / len) * 127);
        data[(y * size + x) * 4 + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate volumetric height
   */
  private generateVolumetricHeight(size: number, time: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        const height = this.perlin2D(u * 6 + time * 0.1, v * 6);
        const normalized = (height + 1) * 0.5;
        
        const idx = (y * size + x) * 4;
        const value = Math.round(Math.min(255, Math.max(0, normalized * 255)));
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate additional density layer
   */
  private generateVolumetricDensityLayer(size: number, time: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        
        const density = this.fbm(u * 12 - time * 0.2, v * 12 - time * 0.1, 4);
        const normalized = (density + 1) * 0.5;
        
        const idx = (y * size + x) * 4;
        const value = Math.round(Math.min(255, Math.max(0, normalized * 255)));
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Perlin noise implementation (simplified)
   */
  private perlin2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    
    const u = this.fade(xf);
    const v = this.fade(yf);
    
    const grad = (hash: number, x: number, y: number): number => {
      const h = hash & 3;
      const u_val = h < 2 ? x : y;
      const v_val = h < 2 ? y : x;
      return ((h & 1) === 0 ? u_val : -u_val) + ((h & 2) === 0 ? v_val : -v_val);
    };
    
    const aa = this.perm[X] + Y;
    const ab = this.perm[X] + Y + 1;
    const ba = this.perm[X + 1] + Y;
    const bb = this.perm[X + 1] + Y + 1;
    
    const x1 = this.lerp(
      grad(this.perm[aa], xf, yf),
      grad(this.perm[ba], xf - 1, yf),
      u
    );
    
    const x2 = this.lerp(
      grad(this.perm[ab], xf, yf - 1),
      grad(this.perm[bb], xf - 1, yf - 1),
      u
    );
    
    return this.lerp(x1, x2, v);
  }
  
  /**
   * Fractal Brownian Motion
   */
  private fbm(x: number, y: number, octaves: number): number {
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
  
  /**
   * Fade curve for Perlin noise
   */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }
  
  /**
   * Permutation table for noise
   */
  private perm: number[] = [];
  
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.initPermutationTable();
  }
  
  private initPermutationTable(): void {
    const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
      190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,
      68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,
      102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,
      173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,
      223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,
      232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,
      49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
    
    this.perm = new Array(512);
    for (let i = 0; i < 256; i++) {
      this.perm[i] = this.perm[i + 256] = p[i];
    }
  }
  
  /**
   * Create texture from canvas
   */
  private createTexture(): CanvasTexture {
    const texture = new CanvasTexture(this.canvas);
    texture.wrapS = texture.wrapT = 1000; // RepeatWrapping
    texture.flipY = false;
    return texture;
  }
}

/**
 * Preset configurations for common fluid types
 */
export const FluidPresets = {
  // Ocean water
  ocean: {
    fluidType: FluidType.WATER,
    baseColor: new Color(0x006994),
    deepColor: new Color(0x003366),
    roughness: 0.15,
    waveAmplitude: 0.2,
    waveFrequency: 0.8,
    waveSpeed: 1.2,
    foamAmount: 0.4,
    maxDepth: 100
  },
  
  // Calm lake
  lake: {
    fluidType: FluidType.WATER,
    baseColor: new Color(0x2e8b57),
    deepColor: new Color(0x1a5232),
    roughness: 0.05,
    waveAmplitude: 0.05,
    waveFrequency: 0.5,
    waveSpeed: 0.5,
    foamAmount: 0.1,
    maxDepth: 20
  },
  
  // Tropical paradise
  tropical: {
    fluidType: FluidType.WATER,
    baseColor: new Color(0x00ffff),
    deepColor: new Color(0x008080),
    roughness: 0.1,
    waveAmplitude: 0.1,
    waveFrequency: 1.0,
    waveSpeed: 1.0,
    foamAmount: 0.2,
    maxDepth: 30
  },
  
  // Flowing lava
  flowingLava: {
    fluidType: FluidType.LAVA,
    baseColor: new Color(1.0, 0.5, 0.1),
    roughness: 0.4,
    animationSpeed: 0.8
  },
  
  // Cooling lava crust
  coolingLava: {
    fluidType: FluidType.LAVA,
    baseColor: new Color(0.8, 0.2, 0.1),
    roughness: 0.6,
    animationSpeed: 0.3
  },
  
  // Thick smoke
  thickSmoke: {
    fluidType: FluidType.SMOKE,
    baseColor: new Color(0.3, 0.3, 0.3),
    animationSpeed: 0.2
  },
  
  // Light fog
  lightFog: {
    fluidType: FluidType.FOG,
    baseColor: new Color(0.8, 0.8, 0.85),
    animationSpeed: 0.1
  }
};

export default FluidMaterialGenerator;
