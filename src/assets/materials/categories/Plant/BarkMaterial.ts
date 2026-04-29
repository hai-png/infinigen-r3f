import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';

export interface BarkParams {
  baseColor: THREE.Color;
  creviceColor: THREE.Color;
  roughness: number;
  pattern: 'smooth' | 'rough' | 'furrowed' | 'peeling' | 'ridged';
  depth: number;
  enableMoss: boolean;
  mossDensity: number;
  mossColor: THREE.Color;
  enableLichen: boolean;
  lichenColor: THREE.Color;
  [key: string]: unknown;
}

export type BarkPreset = 'oak' | 'pine' | 'birch' | 'cedar' | 'mossy';

/**
 * Configuration for bark material properties
 */
export interface BarkMaterialConfig {
  /** Base color of bark */
  baseColor: THREE.Color;
  /** Crevice/dark area color */
  creviceColor: THREE.Color;
  /** Roughness */
  roughness: number;
  /** Bark pattern type */
  pattern: 'smooth' | 'rough' | 'furrowed' | 'peeling' | 'ridged';
  /** Depth of bark texture */
  depth: number;
  /** Enable moss growth */
  enableMoss: boolean;
  /** Moss density */
  mossDensity: number;
  /** Moss color */
  mossColor: THREE.Color;
  /** Enable lichen */
  enableLichen: boolean;
  /** Lichen color */
  lichenColor: THREE.Color;
}

/**
 * Realistic tree bark material with various patterns
 */
export class BarkMaterial {
  private config: BarkMaterialConfig;
  private material: THREE.MeshStandardMaterial;

  constructor(config?: Partial<BarkMaterialConfig>) {
    this.config = {
      baseColor: new THREE.Color(0x5d4037),
      creviceColor: new THREE.Color(0x3e2723),
      roughness: 0.9,
      pattern: 'rough',
      depth: 0.5,
      enableMoss: false,
      mossDensity: 0.3,
      mossColor: new THREE.Color(0x689f38),
      enableLichen: false,
      lichenColor: new THREE.Color(0xbcaaa4),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    // Generate bark texture
    this.generateBarkTexture(material);

    return material;
  }

  private generateBarkTexture(material: THREE.MeshStandardMaterial): void {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        
        let value = 0;
        
        switch (this.config.pattern) {
          case 'smooth':
            value = this.generateSmoothBark(x, y, size);
            break;
          case 'rough':
            value = this.generateRoughBark(x, y, size);
            break;
          case 'furrowed':
            value = this.generateFurrowedBark(x, y, size);
            break;
          case 'peeling':
            value = this.generatePeelingBark(x, y, size);
            break;
          case 'ridged':
            value = this.generateRidgedBark(x, y, size);
            break;
        }

        // Blend base and crevice colors
        const r = this.config.baseColor.r * (1 - value) + this.config.creviceColor.r * value;
        const g = this.config.baseColor.g * (1 - value) + this.config.creviceColor.g * value;
        const b = this.config.baseColor.b * (1 - value) + this.config.creviceColor.b * value;

        // Add moss if enabled
        let finalR = r, finalG = g, finalB = b;
        if (this.config.enableMoss) {
          const mossNoise = NoiseUtils.perlin2D(x * 0.02, y * 0.02);
          if (mossNoise > 1 - this.config.mossDensity) {
            const mossBlend = (mossNoise - (1 - this.config.mossDensity)) / this.config.mossDensity;
            finalR = r * (1 - mossBlend) + this.config.mossColor.r * mossBlend;
            finalG = g * (1 - mossBlend) + this.config.mossColor.g * mossBlend;
            finalB = b * (1 - mossBlend) + this.config.mossColor.b * mossBlend;
          }
        }

        // Add lichen if enabled
        if (this.config.enableLichen) {
          const lichenNoise = NoiseUtils.perlin2D(x * 0.03 + 100, y * 0.03 + 100);
          if (lichenNoise > 0.7) {
            const lichenBlend = (lichenNoise - 0.7) / 0.3 * 0.5;
            finalR = finalR * (1 - lichenBlend) + this.config.lichenColor.r * lichenBlend;
            finalG = finalG * (1 - lichenBlend) + this.config.lichenColor.g * lichenBlend;
            finalB = finalB * (1 - lichenBlend) + this.config.lichenColor.b * lichenBlend;
          }
        }

        imageData.data[index] = Math.min(255, Math.floor(finalR * 255));
        imageData.data[index + 1] = Math.min(255, Math.floor(finalG * 255));
        imageData.data[index + 2] = Math.min(255, Math.floor(finalB * 255));
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    material.map = texture;
    
    // Create normal map from the texture
    const normalMap = this.createNormalMap(imageData, size);
    material.normalMap = normalMap;
    material.normalScale = new THREE.Vector2(this.config.depth, this.config.depth);
  }

  private generateSmoothBark(x: number, y: number, size: number): number {
    const noise = NoiseUtils.perlin2D(x * 0.01, y * 0.01);
    return Math.max(0, noise * 0.3);
  }

  private generateRoughBark(x: number, y: number, size: number): number {
    const noise1 = NoiseUtils.perlin2D(x * 0.02, y * 0.02);
    const noise2 = NoiseUtils.perlin2D(x * 0.05, y * 0.05) * 0.5;
    return (Math.abs(noise1) + Math.abs(noise2)) * 0.5;
  }

  private generateFurrowedBark(x: number, y: number, size: number): number {
    const u = x / size;
    const v = y / size;
    
    // Vertical furrows
    const furrowNoise = NoiseUtils.perlin2D(u * 20, v * 2);
    const furrows = Math.sin(furrowNoise * Math.PI * 4) * 0.5 + 0.5;
    
    // Add some horizontal variation
    const crossNoise = NoiseUtils.perlin2D(u * 5, v * 10) * 0.3;
    
    return Math.max(0, furrows + crossNoise);
  }

  private generatePeelingBark(x: number, y: number, size: number): number {
    const u = x / size;
    const v = y / size;
    
    // Create peeling patches
    const patchNoise = NoiseUtils.perlin2D(u * 10, v * 10);
    const patches = Math.abs(patchNoise);
    
    // Add edge highlights for peeling effect
    const edgeNoise = NoiseUtils.perlin2D(u * 20, v * 20);
    const edges = Math.abs(edgeNoise) > 0.8 ? 0.5 : 0;
    
    return patches * 0.5 + edges;
  }

  private generateRidgedBark(x: number, y: number, size: number): number {
    const u = x / size;
    const v = y / size;
    
    // Horizontal ridges
    const ridgeFreq = 30;
    const ridges = Math.abs(Math.sin(v * ridgeFreq)) * 
                   (0.5 + 0.5 * Math.sin(u * 10));
    
    // Add vertical cracks
    const crackNoise = NoiseUtils.perlin2D(u * 15, v * 3);
    const cracks = Math.abs(crackNoise) > 0.7 ? 0.3 : 0;
    
    return ridges + cracks;
  }

  private createNormalMap(imageData: ImageData, size: number): THREE.CanvasTexture {
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = size;
    normalCanvas.height = size;
    const normalCtx = normalCanvas.getContext('2d')!;
    
    const normalData = normalCtx.createImageData(size, size);
    
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const index = (y * size + x) * 4;
        
        // Sample neighboring pixels
        const left = imageData.data[((y) * size + (x - 1)) * 4];
        const right = imageData.data[((y) * size + (x + 1)) * 4];
        const top = imageData.data[((y - 1) * size + x) * 4];
        const bottom = imageData.data[((y + 1) * size + x) * 4];
        
        // Calculate normal from height differences
        const dx = (right - left) / 255;
        const dy = (bottom - top) / 255;
        
        const nx = dx * this.config.depth;
        const ny = dy * this.config.depth;
        const nz = Math.sqrt(1 - nx * nx - ny * ny);
        
        normalData.data[index] = Math.floor((nx + 1) * 127.5);
        normalData.data[index + 1] = Math.floor((ny + 1) * 127.5);
        normalData.data[index + 2] = Math.floor((nz + 1) * 127.5);
        normalData.data[index + 3] = 255;
      }
    }
    
    normalCtx.putImageData(normalData, 0, 0);
    const texture = new THREE.CanvasTexture(normalCanvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    return texture;
  }

  /**
   * Get the Three.js material instance
   */
  getMaterial(): THREE.MeshStandardMaterial {
    return this.material;
  }

  /**
   * Update bark configuration dynamically
   */
  updateConfig(config: Partial<BarkMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update material properties
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
    
    // Regenerate textures if pattern changed
    if (config.pattern !== undefined || config.enableMoss !== undefined || 
        config.enableLichen !== undefined) {
      this.generateBarkTexture(this.material);
    }
  }

  /**
   * Create preset bark types
   */
  static createPreset(preset: 'oak' | 'pine' | 'birch' | 'cedar' | 'willow'): BarkMaterial {
    switch (preset) {
      case 'oak':
        return new BarkMaterial({
          baseColor: new THREE.Color(0x5d4037),
          creviceColor: new THREE.Color(0x3e2723),
          pattern: 'furrowed',
          depth: 0.7,
          roughness: 0.95,
        });
      
      case 'pine':
        return new BarkMaterial({
          baseColor: new THREE.Color(0x6d4c41),
          creviceColor: new THREE.Color(0x4e342e),
          pattern: 'ridged',
          depth: 0.6,
          roughness: 0.9,
        });
      
      case 'birch':
        return new BarkMaterial({
          baseColor: new THREE.Color(0xd7ccc8),
          creviceColor: new THREE.Color(0x8d6e63),
          pattern: 'smooth',
          depth: 0.2,
          roughness: 0.6,
          enableLichen: true,
          lichenColor: new THREE.Color(0xa1887f),
        });
      
      case 'cedar':
        return new BarkMaterial({
          baseColor: new THREE.Color(0x8d6e63),
          creviceColor: new THREE.Color(0x5d4037),
          pattern: 'peeling',
          depth: 0.5,
          roughness: 0.85,
        });
      
      case 'willow':
        return new BarkMaterial({
          baseColor: new THREE.Color(0x6d4c41),
          creviceColor: new THREE.Color(0x3e2723),
          pattern: 'furrowed',
          depth: 0.8,
          roughness: 0.95,
          enableMoss: true,
          mossDensity: 0.4,
        });
      
      default:
        return new BarkMaterial();
    }
  }
}
