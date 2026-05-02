import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for fish body material properties
 * Based on infinigen's fish_body.py — iridescent fish scales with lateral line
 */
export interface FishBodyMaterialConfig {
  /** Base dorsal color */
  dorsalColor: THREE.Color;
  /** Ventral/belly color */
  ventralColor: THREE.Color;
  /** Scale highlight color */
  scaleHighlightColor: THREE.Color;
  /** Iridescent shimmer color */
  iridescentColor: THREE.Color;
  /** Scale size (0-1) */
  scaleSize: number;
  /** Scale aspect ratio (width vs height) */
  scaleAspectRatio: number;
  /** Roughness */
  roughness: number;
  /** Metalness */
  metalness: number;
  /** Iridescence strength */
  iridescence: number;
  /** Iridescence IOR */
  iridescenceIOR: number;
  /** Lateral line visibility (0-1) */
  lateralLineVisibility: number;
  /** Normal strength */
  normalStrength: number;
}

export type FishBodyParams = FishBodyMaterialConfig;
export type FishBodyPreset = 'trout' | 'salmon' | 'tropical' | 'goldfish' | 'bass';

/**
 * Fish body material with iridescent scales and lateral line
 * Ported from infinigen/infinigen/assets/materials/creature/fish_body.py
 */
export class FishBodyMaterial {
  private config: FishBodyMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<FishBodyMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      dorsalColor: new THREE.Color(0.2, 0.3, 0.15),
      ventralColor: new THREE.Color(0.6, 0.55, 0.35),
      scaleHighlightColor: new THREE.Color(0.8, 0.75, 0.5),
      iridescentColor: new THREE.Color(0.5, 0.7, 0.8),
      scaleSize: rng.nextFloat(0.3, 0.6),
      scaleAspectRatio: rng.nextFloat(0.2, 0.4),
      roughness: rng.nextFloat(0.2, 0.35),
      metalness: 0.15,
      iridescence: rng.nextFloat(0.5, 1.0),
      iridescenceIOR: 1.69,
      lateralLineVisibility: rng.nextFloat(0.3, 0.7),
      normalStrength: rng.nextFloat(0.5, 0.9),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.dorsalColor,
      roughness: this.config.roughness,
      metalness: this.config.metalness,
      iridescence: this.config.iridescence,
      iridescenceIOR: this.config.iridescenceIOR,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
      thickness: 1.0,
      attenuationColor: new THREE.Color(0.8, 0.7, 0.5),
      attenuationDistance: 2.0,
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
    const freq = 8 + this.config.scaleSize * 15;
    const yFreq = freq * (1 / this.config.scaleAspectRatio);
    const noise = new NoiseUtils();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Elongated fish scale pattern
        const row = Math.floor(v * yFreq);
        const offset = (row % 2) * 0.5 / freq;
        const cx = Math.floor((u - offset) * freq) / freq + offset;
        const cy = Math.floor(v * yFreq) / yFreq;

        const dx = (u - cx) * freq;
        const dy = (v - cy) * yFreq;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Scale shape — round with overlapping
        const scaleShape = Math.max(0, 1 - dist * 1.5);
        const edgeFactor = 1 - scaleShape;

        // Dorsal-ventral gradient
        const dvBlend = Math.max(0, Math.min(1, (v - 0.3) * 2));

        // Color mixing
        const baseR = this.config.dorsalColor.r * (1 - dvBlend) + this.config.ventralColor.r * dvBlend;
        const baseG = this.config.dorsalColor.g * (1 - dvBlend) + this.config.ventralColor.g * dvBlend;
        const baseB = this.config.dorsalColor.b * (1 - dvBlend) + this.config.ventralColor.b * dvBlend;

        // Scale edge highlighting
        const highlightFactor = edgeFactor > 0.7 ? (edgeFactor - 0.7) / 0.3 : 0;

        // Lateral line (thin stripe at middle)
        const lateralDist = Math.abs(v - 0.5);
        const lateralFactor = lateralDist < 0.02 ? (1 - lateralDist / 0.02) * this.config.lateralLineVisibility : 0;

        const colorNoise = noise.perlin2D(x * 0.03, y * 0.03) * 0.08;

        const r = baseR * (1 - highlightFactor * 0.3) + this.config.scaleHighlightColor.r * highlightFactor * 0.3 - lateralFactor * 0.1 + colorNoise;
        const g = baseG * (1 - highlightFactor * 0.3) + this.config.scaleHighlightColor.g * highlightFactor * 0.3 + lateralFactor * 0.05 + colorNoise;
        const b = baseB * (1 - highlightFactor * 0.2) + this.config.scaleHighlightColor.b * highlightFactor * 0.2 + lateralFactor * 0.15 + colorNoise;

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
    texture.repeat.set(3, 3);
    material.map = texture;
  }

  private generateNormalMap(material: THREE.MeshPhysicalMaterial): void {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);
    const freq = 8 + this.config.scaleSize * 15;
    const yFreq = freq * (1 / this.config.scaleAspectRatio);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        const row = Math.floor(v * yFreq);
        const offset = (row % 2) * 0.5 / freq;
        const cx = Math.floor((u - offset) * freq) / freq + offset;
        const cy = Math.floor(v * yFreq) / yFreq;

        const dx = (u - cx) * freq;
        const dy = (v - cy) * yFreq;

        const nx = dx * 1.5;
        const ny = dy * 1.5;
        const nz = 1.0 - Math.sqrt(nx * nx + ny * ny) * 0.4;

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
    texture.repeat.set(3, 3);
    material.normalMap = texture;
    material.normalScale = new THREE.Vector2(
      this.config.normalStrength,
      this.config.normalStrength
    );
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<FishBodyMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.dorsalColor);
    this.material.roughness = this.config.roughness;
    this.material.iridescence = this.config.iridescence;
  }

  static createPreset(preset: FishBodyPreset): FishBodyMaterial {
    switch (preset) {
      case 'trout':
        return new FishBodyMaterial({
          dorsalColor: new THREE.Color(0.25, 0.3, 0.18),
          ventralColor: new THREE.Color(0.65, 0.55, 0.35),
          iridescentColor: new THREE.Color(0.4, 0.6, 0.5),
          roughness: 0.3,
          iridescence: 0.5,
        });
      case 'salmon':
        return new FishBodyMaterial({
          dorsalColor: new THREE.Color(0.35, 0.25, 0.2),
          ventralColor: new THREE.Color(0.85, 0.6, 0.45),
          iridescentColor: new THREE.Color(0.7, 0.5, 0.4),
          roughness: 0.25,
          iridescence: 0.6,
        });
      case 'tropical':
        return new FishBodyMaterial({
          dorsalColor: new THREE.Color(0.1, 0.4, 0.6),
          ventralColor: new THREE.Color(0.3, 0.8, 0.9),
          iridescentColor: new THREE.Color(0.2, 0.9, 1.0),
          roughness: 0.2,
          iridescence: 0.9,
          metalness: 0.2,
        });
      case 'goldfish':
        return new FishBodyMaterial({
          dorsalColor: new THREE.Color(0.85, 0.45, 0.1),
          ventralColor: new THREE.Color(0.95, 0.7, 0.2),
          iridescentColor: new THREE.Color(1.0, 0.7, 0.2),
          roughness: 0.25,
          iridescence: 0.7,
        });
      case 'bass':
        return new FishBodyMaterial({
          dorsalColor: new THREE.Color(0.2, 0.28, 0.12),
          ventralColor: new THREE.Color(0.55, 0.5, 0.3),
          iridescentColor: new THREE.Color(0.3, 0.5, 0.3),
          roughness: 0.35,
          iridescence: 0.3,
        });
      default:
        return new FishBodyMaterial();
    }
  }
}
