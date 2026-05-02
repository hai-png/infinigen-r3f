import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for bone material properties
 * Based on infinigen's bone.py — off-white porous surface
 */
export interface BoneMaterialConfig {
  /** Base bone color (off-white) */
  baseColor: THREE.Color;
  /** Porous/dark spot color */
  porousColor: THREE.Color;
  /** Marrow/interior color */
  marrowColor: THREE.Color;
  /** Surface noise scale */
  noiseScale: number;
  /** Porosity amount (0-1) */
  porosity: number;
  /** Roughness */
  roughness: number;
  /** Glass-like transmission amount */
  glassAmount: number;
  /** Normal strength */
  normalStrength: number;
}

export type BoneParams = BoneMaterialConfig;
export type BonePreset = 'fresh' | 'aged' | 'fossilized' | 'ivory' | 'antler';

/**
 * Off-white porous bone surface material
 * Ported from infinigen/infinigen/assets/materials/creature/bone.py
 */
export class BoneMaterial {
  private config: BoneMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<BoneMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.85, 0.82, 0.75),
      porousColor: new THREE.Color(0.5, 0.45, 0.35),
      marrowColor: new THREE.Color(0.4, 0.25, 0.1),
      noiseScale: rng.nextFloat(8, 15),
      porosity: rng.nextFloat(0.1, 0.3),
      roughness: rng.nextFloat(0.35, 0.55),
      glassAmount: 0.2,
      normalStrength: rng.nextFloat(0.3, 0.7),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      transmission: this.config.glassAmount * 0.1,
      ior: 1.55,
      thickness: 0.3,
      side: THREE.DoubleSide,
    });

    this.generateBoneTexture(material);
    this.generateNormalMap(material);

    return material;
  }

  private generateBoneTexture(material: THREE.MeshPhysicalMaterial): void {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);
    const noise = new NoiseUtils();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Voronoi for porous texture
        const voronoiScale = this.config.noiseScale;
        const cellX = Math.floor(u * voronoiScale);
        const cellY = Math.floor(v * voronoiScale);

        let minDist = Infinity;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx, ny);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 50, ny + 50);
            const dist = Math.sqrt((u * voronoiScale - fx) ** 2 + (v * voronoiScale - fy) ** 2);
            minDist = Math.min(minDist, dist);
          }
        }

        // Pore detection
        const isPore = minDist < this.config.porosity;

        // Noise variation
        const colorNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.05;

        let r: number, g: number, b: number;

        if (isPore) {
          r = this.config.porousColor.r + colorNoise;
          g = this.config.porousColor.g + colorNoise;
          b = this.config.porousColor.b + colorNoise;
        } else {
          // Fine grain noise for bone surface
          const fineNoise = noise.perlin2D(x * 0.05, y * 0.05) * 0.03;
          r = this.config.baseColor.r + colorNoise + fineNoise;
          g = this.config.baseColor.g + colorNoise + fineNoise;
          b = this.config.baseColor.b + colorNoise + fineNoise;
        }

        imageData.data[index] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[index + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[index + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    material.map = texture;
  }

  private generateNormalMap(material: THREE.MeshPhysicalMaterial): void {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);
    const noise = new NoiseUtils();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;

        const nx = noise.perlin2D(x * 0.04, y * 0.04) * 0.2;
        const ny = noise.perlin2D(x * 0.04 + 100, y * 0.04 + 100) * 0.2;
        const nz = 1.0;

        imageData.data[index] = Math.floor((nx * 0.5 + 0.5) * 255);
        imageData.data[index + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        imageData.data[index + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    material.normalMap = texture;
    material.normalScale = new THREE.Vector2(
      this.config.normalStrength,
      this.config.normalStrength
    );
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<BoneMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
  }

  static createPreset(preset: BonePreset): BoneMaterial {
    switch (preset) {
      case 'fresh':
        return new BoneMaterial({
          baseColor: new THREE.Color(0.9, 0.85, 0.75),
          porousColor: new THREE.Color(0.7, 0.55, 0.4),
          roughness: 0.4,
          porosity: 0.15,
        });
      case 'aged':
        return new BoneMaterial({
          baseColor: new THREE.Color(0.75, 0.7, 0.6),
          porousColor: new THREE.Color(0.4, 0.35, 0.25),
          roughness: 0.55,
          porosity: 0.25,
        });
      case 'fossilized':
        return new BoneMaterial({
          baseColor: new THREE.Color(0.6, 0.55, 0.45),
          porousColor: new THREE.Color(0.3, 0.28, 0.2),
          marrowColor: new THREE.Color(0.35, 0.3, 0.2),
          roughness: 0.65,
          porosity: 0.3,
        });
      case 'ivory':
        return new BoneMaterial({
          baseColor: new THREE.Color(0.95, 0.92, 0.85),
          porousColor: new THREE.Color(0.8, 0.75, 0.65),
          roughness: 0.3,
          porosity: 0.08,
        });
      case 'antler':
        return new BoneMaterial({
          baseColor: new THREE.Color(0.55, 0.4, 0.25),
          porousColor: new THREE.Color(0.35, 0.25, 0.15),
          roughness: 0.5,
          porosity: 0.2,
        });
      default:
        return new BoneMaterial();
    }
  }
}
