import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for horn material properties
 * Based on infinigen's horn.py — keratin horn with rings
 */
export interface HornMaterialConfig {
  /** Base horn color */
  baseColor: THREE.Color;
  /** Ring/growth line color */
  ringColor: THREE.Color;
  /** Tip color (usually darker) */
  tipColor: THREE.Color;
  /** Ring frequency (growth lines) */
  ringFrequency: number;
  /** Ring distortion amount */
  ringDistortion: number;
  /** Surface noise scale */
  noiseScale: number;
  /** Roughness */
  roughness: number;
  /** Glossy coat amount */
  clearcoat: number;
  /** Normal strength */
  normalStrength: number;
}

export type HornParams = HornMaterialConfig;
export type HornPreset = 'ram' | 'antelope' | 'rhino' | 'bull' | 'deer';

/**
 * Keratin horn material with growth rings
 * Ported from infinigen/infinigen/assets/materials/creature/horn.py
 */
export class HornMaterial {
  private config: HornMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<HornMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.38, 0.24, 0.12),
      ringColor: new THREE.Color(0.19, 0.15, 0.1),
      tipColor: new THREE.Color(0.15, 0.1, 0.06),
      ringFrequency: rng.nextFloat(6, 12),
      ringDistortion: rng.nextFloat(0.5, 2.0),
      noiseScale: rng.nextFloat(8, 15),
      roughness: rng.nextFloat(0.15, 0.35),
      clearcoat: rng.nextFloat(0.3, 0.6),
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
      clearcoat: this.config.clearcoat,
      clearcoatRoughness: 0.15,
      side: THREE.DoubleSide,
    });

    this.generateHornTexture(material);
    this.generateNormalMap(material);

    return material;
  }

  private generateHornTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // Growth ring pattern (horizontal rings around the horn)
        const ringDistort = noise.perlin2D(u * 5, v * 3) * this.config.ringDistortion;
        const ringPattern = Math.sin((v + ringDistort * 0.1) * this.config.ringFrequency * Math.PI * 2);

        // Ring factor: 1 at ring valleys, 0 at peaks
        const ringFactor = (1 - ringPattern) * 0.5;

        // Voronoi cross-hatch pattern
        const voronoiNoise = noise.perlin2D(
          u * this.config.noiseScale,
          v * this.config.noiseScale
        );

        // Tip darkening gradient
        const tipFactor = Math.pow(u, 2) * 0.3;

        // Color mixing
        const baseR = this.config.baseColor.r * (1 - tipFactor) + this.config.tipColor.r * tipFactor;
        const baseG = this.config.baseColor.g * (1 - tipFactor) + this.config.tipColor.g * tipFactor;
        const baseB = this.config.baseColor.b * (1 - tipFactor) + this.config.tipColor.b * tipFactor;

        const fineNoise = voronoiNoise * 0.08;

        const r = baseR * (1 - ringFactor * 0.4) + this.config.ringColor.r * ringFactor * 0.4 + fineNoise;
        const g = baseG * (1 - ringFactor * 0.4) + this.config.ringColor.g * ringFactor * 0.4 + fineNoise;
        const b = baseB * (1 - ringFactor * 0.4) + this.config.ringColor.b * ringFactor * 0.4 + fineNoise;

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
        const u = x / size;
        const v = y / size;

        // Ring grooves
        const ringDistort = noise.perlin2D(u * 5, v * 3) * this.config.ringDistortion * 0.05;
        const ringPattern = Math.sin((v + ringDistort) * this.config.ringFrequency * Math.PI * 2);

        // Normal from ring groove
        const ny = Math.cos(ringPattern * Math.PI) * 0.2;
        const nx = noise.perlin2D(x * 0.04, y * 0.04) * 0.15;
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

  updateConfig(config: Partial<HornMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
    this.material.clearcoat = this.config.clearcoat;
  }

  static createPreset(preset: HornPreset): HornMaterial {
    switch (preset) {
      case 'ram':
        return new HornMaterial({
          baseColor: new THREE.Color(0.55, 0.4, 0.2),
          ringColor: new THREE.Color(0.35, 0.25, 0.12),
          ringFrequency: 8,
          roughness: 0.25,
          clearcoat: 0.5,
        });
      case 'antelope':
        return new HornMaterial({
          baseColor: new THREE.Color(0.35, 0.25, 0.12),
          ringColor: new THREE.Color(0.2, 0.15, 0.08),
          ringFrequency: 12,
          roughness: 0.2,
          clearcoat: 0.6,
        });
      case 'rhino':
        return new HornMaterial({
          baseColor: new THREE.Color(0.4, 0.35, 0.25),
          ringColor: new THREE.Color(0.25, 0.2, 0.15),
          tipColor: new THREE.Color(0.2, 0.15, 0.1),
          ringFrequency: 5,
          roughness: 0.4,
          clearcoat: 0.2,
        });
      case 'bull':
        return new HornMaterial({
          baseColor: new THREE.Color(0.3, 0.2, 0.1),
          ringColor: new THREE.Color(0.15, 0.1, 0.05),
          ringFrequency: 10,
          roughness: 0.2,
          clearcoat: 0.55,
        });
      case 'deer':
        return new HornMaterial({
          baseColor: new THREE.Color(0.5, 0.35, 0.18),
          ringColor: new THREE.Color(0.35, 0.22, 0.1),
          tipColor: new THREE.Color(0.25, 0.15, 0.08),
          ringFrequency: 15,
          roughness: 0.3,
          clearcoat: 0.4,
        });
      default:
        return new HornMaterial();
    }
  }
}
