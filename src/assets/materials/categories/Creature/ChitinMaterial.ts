import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for chitin material properties
 * Based on infinigen's chitin.py — hard exoskeleton shell material
 */
export interface ChitinMaterialConfig {
  /** Base chitin color */
  baseColor: THREE.Color;
  /** Highlight/ridge color */
  highlightColor: THREE.Color;
  /** Seam/edge color */
  seamColor: THREE.Color;
  /** Pattern frequency */
  patternFrequency: number;
  /** Roughness */
  roughness: number;
  /** Roughness variation amount */
  roughnessVariation: number;
  /** Metalness — chitin can have slight metallic sheen */
  metalness: number;
  /** Clearcoat strength */
  clearcoat: number;
  /** Pattern angle in radians */
  patternAngle: number;
  /** Normal strength */
  normalStrength: number;
}

export type ChitinParams = ChitinMaterialConfig;
export type ChitinPreset = 'beetle' | 'ant' | 'crab' | 'scorpion' | 'stag_beetle';

/**
 * Hard insect chitin exoskeleton material
 * Ported from infinigen/infinigen/assets/materials/creature/chitin.py
 */
export class ChitinMaterial {
  private config: ChitinMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<ChitinMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.12, 0.08, 0.04),
      highlightColor: new THREE.Color(0.2, 0.15, 0.08),
      seamColor: new THREE.Color(0.02, 0.01, 0.005),
      patternFrequency: rng.nextFloat(8, 15),
      roughness: rng.nextFloat(0.3, 0.5),
      roughnessVariation: rng.nextFloat(0.1, 0.3),
      metalness: 0.1,
      clearcoat: rng.nextFloat(0.2, 0.5),
      patternAngle: rng.nextFloat(-0.5, 0.5),
      normalStrength: rng.nextFloat(0.5, 1.0),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: this.config.metalness,
      clearcoat: this.config.clearcoat,
      clearcoatRoughness: 0.2,
      side: THREE.DoubleSide,
    });

    this.generateChitinTexture(material);
    this.generateNormalMap(material);

    return material;
  }

  private generateChitinTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // Rotate UV for pattern
        const cos = Math.cos(this.config.patternAngle);
        const sin = Math.sin(this.config.patternAngle);
        const ru = u * cos - v * sin;
        const rv = u * sin + v * cos;

        // Cross-hatch pattern — diagonal lines
        const line1 = Math.abs(Math.sin((ru + rv) * this.config.patternFrequency * Math.PI));
        const line2 = Math.abs(Math.sin((ru - rv) * this.config.patternFrequency * Math.PI));

        // Seam detection — where lines are thin
        const seam1 = line1 < 0.1 ? 1 : 0;
        const seam2 = line2 < 0.1 ? 1 : 0;
        const isSeam = Math.max(seam1, seam2);

        // Noise for color variation
        const colorNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.1;
        const fineNoise = noise.perlin2D(x * 0.08, y * 0.08) * 0.04;

        // Pointiness-based highlight (simulated)
        const highlightNoise = noise.perlin2D(x * 0.005, y * 0.005);
        const highlight = Math.max(0, highlightNoise) * 0.5;

        let r: number, g: number, b: number;

        if (isSeam > 0.5) {
          r = this.config.seamColor.r;
          g = this.config.seamColor.g;
          b = this.config.seamColor.b;
        } else {
          r = this.config.baseColor.r * (1 - highlight) + this.config.highlightColor.r * highlight + colorNoise + fineNoise;
          g = this.config.baseColor.g * (1 - highlight) + this.config.highlightColor.g * highlight + colorNoise + fineNoise;
          b = this.config.baseColor.b * (1 - highlight) + this.config.highlightColor.b * highlight + colorNoise + fineNoise;
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

    // Generate roughness map — chitin is smoother at ridges, rougher in grooves
    this.generateRoughnessMap(material);
  }

  private generateRoughnessMap(material: THREE.MeshPhysicalMaterial): void {
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
        const u = x / size;
        const v = y / size;

        // Pointiness-like variation in roughness
        const highlightNoise = noise.perlin2D(x * 0.005, y * 0.005);
        const isHighlight = highlightNoise > 0.3;

        // Invert: highlighted areas (ridges) are smoother
        let roughnessValue: number;
        if (isHighlight) {
          roughnessValue = this.config.roughness * 0.5;
        } else {
          roughnessValue = this.config.roughness + this.config.roughnessVariation * noise.perlin2D(x * 0.05, y * 0.05);
        }

        const val = Math.floor(Math.max(0, Math.min(1, roughnessValue)) * 255);
        imageData.data[index] = val;
        imageData.data[index + 1] = val;
        imageData.data[index + 2] = val;
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    material.roughnessMap = texture;
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

        // Surface detail normals
        const nx = noise.perlin2D(x * 0.06, y * 0.06) * 0.3;
        const ny = noise.perlin2D(x * 0.06 + 100, y * 0.06 + 100) * 0.2;
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

  updateConfig(config: Partial<ChitinMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
    this.material.metalness = this.config.metalness;
    this.material.clearcoat = this.config.clearcoat;
  }

  static createPreset(preset: ChitinPreset): ChitinMaterial {
    switch (preset) {
      case 'beetle':
        return new ChitinMaterial({
          baseColor: new THREE.Color(0.08, 0.06, 0.02),
          highlightColor: new THREE.Color(0.15, 0.12, 0.05),
          metalness: 0.15,
          clearcoat: 0.4,
          roughness: 0.35,
        });
      case 'ant':
        return new ChitinMaterial({
          baseColor: new THREE.Color(0.15, 0.08, 0.03),
          highlightColor: new THREE.Color(0.2, 0.12, 0.06),
          metalness: 0.05,
          clearcoat: 0.2,
          roughness: 0.45,
        });
      case 'crab':
        return new ChitinMaterial({
          baseColor: new THREE.Color(0.6, 0.3, 0.15),
          highlightColor: new THREE.Color(0.75, 0.4, 0.2),
          seamColor: new THREE.Color(0.3, 0.15, 0.05),
          metalness: 0.0,
          clearcoat: 0.3,
          roughness: 0.4,
        });
      case 'scorpion':
        return new ChitinMaterial({
          baseColor: new THREE.Color(0.3, 0.2, 0.08),
          highlightColor: new THREE.Color(0.4, 0.28, 0.12),
          metalness: 0.1,
          clearcoat: 0.35,
          roughness: 0.35,
        });
      case 'stag_beetle':
        return new ChitinMaterial({
          baseColor: new THREE.Color(0.2, 0.1, 0.03),
          highlightColor: new THREE.Color(0.35, 0.2, 0.08),
          metalness: 0.2,
          clearcoat: 0.5,
          roughness: 0.25,
        });
      default:
        return new ChitinMaterial();
    }
  }
}
