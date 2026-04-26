import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

export interface LeafParams {
  baseColor: THREE.Color;
  veinColor: THREE.Color;
  edgeColor: THREE.Color;
  translucency: number;
  roughness: number;
  enableVeins: boolean;
  veinDensity: number;
  enableDamage: boolean;
  damageAmount: number;
  enableDew: boolean;
  dewSize: number;
  health: number;
  [key: string]: unknown;
}

export type LeafPreset = 'healthy' | 'autumn' | 'withered' | 'variegated' | 'young';

/**
 * Configuration for leaf material properties
 */
export interface LeafMaterialConfig {
  /** Base color of leaf */
  baseColor: THREE.Color;
  /** Vein color */
  veinColor: THREE.Color;
  /** Edge color (for autumn/withered leaves) */
  edgeColor: THREE.Color;
  /** Translucency for light passing through */
  translucency: number;
  /** Roughness of leaf surface */
  roughness: number;
  /** Enable veins pattern */
  enableVeins: boolean;
  /** Vein density */
  veinDensity: number;
  /** Enable damage/wear */
  enableDamage: boolean;
  /** Damage amount (0-1) */
  damageAmount: number;
  /** Enable dew drops */
  enableDew: boolean;
  /** Dew drop size */
  dewSize: number;
  /** Leaf health (1 = healthy, 0 = dead) */
  health: number;
}

/**
 * Realistic leaf material with translucency and vein patterns
 */
export class LeafMaterial {
  private config: LeafMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<LeafMaterialConfig>) {
    this.config = {
      baseColor: new THREE.Color(0x4caf50),
      veinColor: new THREE.Color(0x388e3c),
      edgeColor: new THREE.Color(0x4caf50),
      translucency: 0.7,
      roughness: 0.6,
      enableVeins: true,
      veinDensity: 0.5,
      enableDamage: false,
      damageAmount: 0.2,
      enableDew: false,
      dewSize: 0.02,
      health: 1.0,
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    // Adjust color based on health
    const adjustedBaseColor = this.getHealthAdjustedColor();
    
    const material = new THREE.MeshPhysicalMaterial({
      color: adjustedBaseColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      transmission: this.config.translucency * 0.3,
      thickness: 0.1,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
      side: THREE.DoubleSide,
    });

    // Generate leaf texture with veins
    if (this.config.enableVeins) {
      this.generateLeafTexture(material);
    } else {
      this.generateSimpleLeafTexture(material);
    }

    return material;
  }

  private getHealthAdjustedColor(): THREE.Color {
    if (this.config.health >= 0.8) {
      // Healthy green
      return this.config.baseColor.clone();
    } else if (this.config.health >= 0.5) {
      // Slightly yellowing
      const t = (0.8 - this.config.health) / 0.3;
      const yellow = new THREE.Color(0xffeb3b);
      return this.config.baseColor.clone().lerp(yellow, t);
    } else if (this.config.health >= 0.2) {
      // Autumn colors (orange/brown)
      const t = (0.5 - this.config.health) / 0.3;
      const orange = new THREE.Color(0xff9800);
      const brown = new THREE.Color(0x8d6e63);
      const autumnColor = orange.lerp(brown, t);
      return this.config.baseColor.clone().lerp(autumnColor, t);
    } else {
      // Dead/dried
      return new THREE.Color(0x5d4037);
    }
  }

  private generateLeafTexture(material: THREE.MeshPhysicalMaterial): void {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);
    const adjustedColor = this.getHealthAdjustedColor();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        
        // Normalize coordinates to center
        const u = (x - size / 2) / size;
        const v = (y - size / 2) / size;
        
        // Create leaf shape (ellipse)
        const leafShape = Math.sqrt((u * 2) * (u * 2) + v * v);
        
        if (leafShape > 0.45) {
          // Outside leaf - transparent
          imageData.data[index] = 0;
          imageData.data[index + 1] = 0;
          imageData.data[index + 2] = 0;
          imageData.data[index + 3] = 0;
          continue;
        }

        // Base color with variation
        const noise = NoiseUtils.perlin2D(x * 0.02, y * 0.02) * 0.1;
        let r = adjustedColor.r + noise;
        let g = adjustedColor.g + noise;
        let b = adjustedColor.b + noise;

        // Add veins
        if (this.config.enableVeins) {
          const veinPattern = this.generateVeinPattern(u, v);
          if (veinPattern > 0) {
            const veinBlend = veinPattern * this.config.veinDensity;
            r = r * (1 - veinBlend) + this.config.veinColor.r * veinBlend;
            g = g * (1 - veinBlend) + this.config.veinColor.g * veinBlend;
            b = b * (1 - veinBlend) + this.config.veinColor.b * veinBlend;
          }
        }

        // Add edge discoloration (autumn effect or damage)
        const edgeFactor = Math.pow(leafShape / 0.45, 3);
        if (edgeFactor > 0.7 || this.config.enableDamage) {
          const edgeBlend = edgeFactor * (this.config.health < 1 ? 0.5 : 0.2);
          r = r * (1 - edgeBlend) + this.config.edgeColor.r * edgeBlend;
          g = g * (1 - edgeBlend) + this.config.edgeColor.g * edgeBlend;
          b = b * (1 - edgeBlend) + this.config.edgeColor.b * edgeBlend;
        }

        // Add damage spots
        if (this.config.enableDamage && this.config.damageAmount > 0) {
          const damageNoise = NoiseUtils.perlin2D(x * 0.05, y * 0.05);
          if (damageNoise > 1 - this.config.damageAmount) {
            const damageBlend = (damageNoise - (1 - this.config.damageAmount)) / this.config.damageAmount;
            r *= (1 - damageBlend * 0.5);
            g *= (1 - damageBlend * 0.5);
            b *= (1 - damageBlend * 0.5);
          }
        }

        // Alpha based on leaf shape
        const alpha = Math.max(0, 1 - (leafShape - 0.4) * 5);

        imageData.data[index] = Math.min(255, Math.floor(r * 255));
        imageData.data[index + 1] = Math.min(255, Math.floor(g * 255));
        imageData.data[index + 2] = Math.min(255, Math.floor(b * 255));
        imageData.data[index + 3] = Math.floor(alpha * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    material.map = texture;
    material.alphaMap = texture;
    material.transparent = true;
  }

  private generateVeinPattern(u: number, v: number): number {
    // Main central vein
    const mainVein = Math.exp(-Math.abs(u * 10));
    
    // Secondary veins branching out
    const secondaryVeins = Math.sin(v * 20 + Math.abs(u) * 5) * 0.1 + 0.1;
    const secondaryPattern = Math.exp(-Math.abs(secondaryVeins * 5));
    
    // Fine tertiary veins
    const tertiaryNoise = NoiseUtils.perlin2D(u * 50, v * 50) * 0.05;
    
    return Math.max(mainVein * 0.8, secondaryPattern * 0.4, tertiaryNoise);
  }

  private generateSimpleLeafTexture(material: THREE.MeshPhysicalMaterial): void {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);
    const adjustedColor = this.getHealthAdjustedColor();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        
        const u = (x - size / 2) / size;
        const v = (y - size / 2) / size;
        const leafShape = Math.sqrt((u * 2) * (u * 2) + v * v);
        
        if (leafShape > 0.45) {
          imageData.data[index] = 0;
          imageData.data[index + 1] = 0;
          imageData.data[index + 2] = 0;
          imageData.data[index + 3] = 0;
          continue;
        }

        const noise = NoiseUtils.perlin2D(x * 0.02, y * 0.02) * 0.1;
        const r = adjustedColor.r + noise;
        const g = adjustedColor.g + noise;
        const b = adjustedColor.b + noise;
        const alpha = Math.max(0, 1 - (leafShape - 0.4) * 5);

        imageData.data[index] = Math.min(255, Math.floor(r * 255));
        imageData.data[index + 1] = Math.min(255, Math.floor(g * 255));
        imageData.data[index + 2] = Math.min(255, Math.floor(b * 255));
        imageData.data[index + 3] = Math.floor(alpha * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    material.map = texture;
    material.alphaMap = texture;
    material.transparent = true;
  }

  /**
   * Get the Three.js material instance
   */
  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  /**
   * Update leaf configuration dynamically
   */
  updateConfig(config: Partial<LeafMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Regenerate textures if color or pattern changed
    if (config.baseColor !== undefined || config.health !== undefined || 
        config.enableVeins !== undefined || config.enableDamage !== undefined) {
      if (this.config.enableVeins) {
        this.generateLeafTexture(this.material);
      } else {
        this.generateSimpleLeafTexture(this.material);
      }
    }
    
    // Update material properties
    this.material.color.set(this.getHealthAdjustedColor());
    this.material.roughness = this.config.roughness;
    this.material.transmission = this.config.translucency * 0.3;
  }

  /**
   * Create preset leaf types
   */
  static createPreset(preset: 'healthy' | 'autumn' | 'withered' | 'tropical' | 'succulent'): LeafMaterial {
    switch (preset) {
      case 'healthy':
        return new LeafMaterial({
          baseColor: new THREE.Color(0x4caf50),
          veinColor: new THREE.Color(0x388e3c),
          translucency: 0.7,
          roughness: 0.6,
          enableVeins: true,
          health: 1.0,
        });
      
      case 'autumn':
        return new LeafMaterial({
          baseColor: new THREE.Color(0xff9800),
          veinColor: new THREE.Color(0xf57c00),
          edgeColor: new THREE.Color(0x8d6e63),
          translucency: 0.6,
          roughness: 0.7,
          enableVeins: true,
          health: 0.4,
        });
      
      case 'withered':
        return new LeafMaterial({
          baseColor: new THREE.Color(0x8d6e63),
          veinColor: new THREE.Color(0x5d4037),
          edgeColor: new THREE.Color(0x3e2723),
          translucency: 0.4,
          roughness: 0.8,
          enableVeins: true,
          enableDamage: true,
          damageAmount: 0.4,
          health: 0.1,
        });
      
      case 'tropical':
        return new LeafMaterial({
          baseColor: new THREE.Color(0x2e7d32),
          veinColor: new THREE.Color(0x1b5e20),
          translucency: 0.8,
          roughness: 0.5,
          enableVeins: true,
          veinDensity: 0.7,
          health: 1.0,
        });
      
      case 'succulent':
        return new LeafMaterial({
          baseColor: new THREE.Color(0x81c784),
          veinColor: new THREE.Color(0x66bb6a),
          translucency: 0.5,
          roughness: 0.4,
          enableVeins: false,
          enableDew: true,
          health: 1.0,
        });
      
      default:
        return new LeafMaterial();
    }
  }
}
