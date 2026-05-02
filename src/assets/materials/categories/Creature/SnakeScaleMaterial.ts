import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for snake scale material properties
 * Based on infinigen's snake_scale.py — overlapping scales with iridescence
 */
export interface SnakeScaleMaterialConfig {
  /** Base color of snake scales */
  baseColor: THREE.Color;
  /** Edge/ridge color between scales */
  edgeColor: THREE.Color;
  /** Iridescent shimmer color */
  iridescentColor: THREE.Color;
  /** Scale pattern size (0-1) */
  scaleSize: number;
  /** Scale overlap amount (0-1) */
  overlap: number;
  /** Roughness of scale surface */
  roughness: number;
  /** Metalness */
  metalness: number;
  /** Iridescence strength (0-1) */
  iridescence: number;
  /** Iridescence IOR */
  iridescenceIOR: number;
  /** Scale pattern orientation angle in radians */
  patternAngle: number;
  /** Normal strength for scale relief */
  normalStrength: number;
}

export type SnakeScaleParams = SnakeScaleMaterialConfig;
export type SnakeScalePreset = 'cobra' | 'python' | 'viper' | 'coral' | 'anaconda';

/**
 * Snake scale material with overlapping hexagonal pattern and iridescence
 * Ported from infinigen/infinigen/assets/materials/creature/snake_scale.py
 */
export class SnakeScaleMaterial {
  private config: SnakeScaleMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<SnakeScaleMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.18, 0.25, 0.12),
      edgeColor: new THREE.Color(0.1, 0.15, 0.06),
      iridescentColor: new THREE.Color(0.4, 0.6, 0.3),
      scaleSize: rng.nextFloat(0.3, 0.6),
      overlap: rng.nextFloat(0.3, 0.6),
      roughness: rng.nextFloat(0.35, 0.55),
      metalness: 0.1,
      iridescence: rng.nextFloat(0.3, 0.8),
      iridescenceIOR: 1.5,
      patternAngle: rng.nextFloat(-0.2, 0.2),
      normalStrength: rng.nextFloat(0.6, 1.0),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: this.config.metalness,
      iridescence: this.config.iridescence,
      iridescenceIOR: this.config.iridescenceIOR,
      clearcoat: 0.5,
      clearcoatRoughness: 0.15,
      side: THREE.DoubleSide,
    });

    (material as any).iridescenceColor = this.config.iridescentColor;

    this.generateScaleTexture(material);
    this.generateNormalMap(material);

    return material;
  }

  private generateScaleTexture(material: THREE.MeshPhysicalMaterial): void {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);
    const freq = 12 + this.config.scaleSize * 18;
    const noise = new NoiseUtils();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Apply rotation for pattern angle
        const cos = Math.cos(this.config.patternAngle);
        const sin = Math.sin(this.config.patternAngle);
        const ru = u * cos - v * sin;
        const rv = u * sin + v * cos;

        // Hexagonal offset for overlapping pattern
        const row = Math.floor(rv * freq);
        const offset = (row % 2) * 0.5 / freq;
        const cx = Math.floor((ru - offset) * freq) / freq + offset;
        const cy = Math.floor(rv * freq) / freq;

        const dx = ru - cx;
        const dy = rv - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) * freq;

        // Overlapping scale shape — raised center, sharp edge
        const scaleShape = Math.max(0, 1 - dist * 1.8);
        const edgeFactor = 1 - Math.pow(scaleShape, 0.5);

        // Color variation with noise
        const colorNoise = noise.perlin2D(x * 0.02, y * 0.02) * 0.15;

        const r = this.config.baseColor.r * (1 - edgeFactor * 0.5) + this.config.edgeColor.r * edgeFactor * 0.5 + colorNoise;
        const g = this.config.baseColor.g * (1 - edgeFactor * 0.5) + this.config.edgeColor.g * edgeFactor * 0.5 + colorNoise;
        const b = this.config.baseColor.b * (1 - edgeFactor * 0.5) + this.config.edgeColor.b * edgeFactor * 0.5 + colorNoise;

        imageData.data[index] = Math.min(255, Math.floor(r * 255));
        imageData.data[index + 1] = Math.min(255, Math.floor(g * 255));
        imageData.data[index + 2] = Math.min(255, Math.floor(b * 255));
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    material.map = texture;
  }

  private generateNormalMap(material: THREE.MeshPhysicalMaterial): void {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);
    const freq = 12 + this.config.scaleSize * 18;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        const cos = Math.cos(this.config.patternAngle);
        const sin = Math.sin(this.config.patternAngle);
        const ru = u * cos - v * sin;
        const rv = u * sin + v * cos;

        const row = Math.floor(rv * freq);
        const offset = (row % 2) * 0.5 / freq;
        const cx = Math.floor((ru - offset) * freq) / freq + offset;
        const cy = Math.floor(rv * freq) / freq;

        const dx = ru - cx;
        const dy = rv - cy;

        // Normal from scale center offset
        const nx = dx * freq * 2;
        const ny = dy * freq * 2;
        const nz = 1.0 - Math.sqrt(nx * nx + ny * ny) * 0.5;

        imageData.data[index] = Math.floor((nx * 0.5 + 0.5) * 255);
        imageData.data[index + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        imageData.data[index + 2] = Math.floor((Math.max(0, nz) * 0.5 + 0.5) * 255);
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    material.normalMap = texture;
    material.normalScale = new THREE.Vector2(
      this.config.normalStrength,
      this.config.normalStrength
    );
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<SnakeScaleMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
    this.material.iridescence = this.config.iridescence;
    this.material.iridescenceIOR = this.config.iridescenceIOR;
    (this.material as any).iridescenceColor = this.config.iridescentColor;
  }

  static createPreset(preset: SnakeScalePreset): SnakeScaleMaterial {
    switch (preset) {
      case 'cobra':
        return new SnakeScaleMaterial({
          baseColor: new THREE.Color(0.15, 0.18, 0.08),
          edgeColor: new THREE.Color(0.08, 0.1, 0.04),
          iridescentColor: new THREE.Color(0.5, 0.7, 0.3),
          roughness: 0.4,
          iridescence: 0.6,
          scaleSize: 0.5,
        });
      case 'python':
        return new SnakeScaleMaterial({
          baseColor: new THREE.Color(0.35, 0.3, 0.15),
          edgeColor: new THREE.Color(0.2, 0.15, 0.08),
          iridescentColor: new THREE.Color(0.6, 0.5, 0.2),
          roughness: 0.45,
          iridescence: 0.4,
          scaleSize: 0.6,
        });
      case 'viper':
        return new SnakeScaleMaterial({
          baseColor: new THREE.Color(0.25, 0.22, 0.12),
          edgeColor: new THREE.Color(0.12, 0.1, 0.05),
          iridescentColor: new THREE.Color(0.3, 0.4, 0.2),
          roughness: 0.5,
          iridescence: 0.3,
          scaleSize: 0.35,
        });
      case 'coral':
        return new SnakeScaleMaterial({
          baseColor: new THREE.Color(0.7, 0.2, 0.15),
          edgeColor: new THREE.Color(0.4, 0.1, 0.08),
          iridescentColor: new THREE.Color(0.9, 0.3, 0.2),
          roughness: 0.35,
          iridescence: 0.7,
          scaleSize: 0.4,
        });
      case 'anaconda':
        return new SnakeScaleMaterial({
          baseColor: new THREE.Color(0.2, 0.28, 0.1),
          edgeColor: new THREE.Color(0.08, 0.15, 0.04),
          iridescentColor: new THREE.Color(0.3, 0.5, 0.2),
          roughness: 0.5,
          iridescence: 0.5,
          scaleSize: 0.7,
        });
      default:
        return new SnakeScaleMaterial();
    }
  }
}
