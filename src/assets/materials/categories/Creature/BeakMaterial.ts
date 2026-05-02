import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for beak material properties
 * Hard keratin beak material with ridges
 */
export interface BeakMaterialConfig {
  /** Base beak color */
  baseColor: THREE.Color;
  /** Ridge/groove color */
  ridgeColor: THREE.Color;
  /** Tip color (often darker/horn-colored) */
  tipColor: THREE.Color;
  /** Ridge frequency */
  ridgeFrequency: number;
  /** Surface noise scale */
  noiseScale: number;
  /** Roughness */
  roughness: number;
  /** Clearcoat for sheen */
  clearcoat: number;
  /** Normal strength */
  normalStrength: number;
}

export type BeakParams = BeakMaterialConfig;
export type BeakPreset = 'eagle' | 'parrot' | 'duck' | 'toucan' | 'finch';

/**
 * Hard keratin beak material with ridges and tip gradient
 */
export class BeakMaterial {
  private config: BeakMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<BeakMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.4, 0.3, 0.15),
      ridgeColor: new THREE.Color(0.25, 0.18, 0.08),
      tipColor: new THREE.Color(0.2, 0.15, 0.05),
      ridgeFrequency: rng.nextFloat(15, 30),
      noiseScale: rng.nextFloat(5, 12),
      roughness: rng.nextFloat(0.25, 0.45),
      clearcoat: rng.nextFloat(0.3, 0.6),
      normalStrength: rng.nextFloat(0.3, 0.6),
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

    this.generateBeakTexture(material);
    this.generateNormalMap(material);

    return material;
  }

  private generateBeakTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // Longitudinal ridges along the beak
        const ridgePattern = Math.abs(Math.sin(v * this.config.ridgeFrequency * Math.PI));
        const isRidge = ridgePattern < 0.15;

        // Tip darkening gradient
        const tipFactor = Math.pow(u, 1.5) * 0.5;

        // Surface noise
        const colorNoise = noise.perlin2D(
          u * this.config.noiseScale,
          v * this.config.noiseScale
        ) * 0.06;

        // Cere (soft base) vs hard keratin transition
        const cereTransition = Math.pow(Math.max(0, 1 - u * 1.5), 2);

        let r: number, g: number, b: number;

        if (isRidge) {
          r = this.config.ridgeColor.r + colorNoise;
          g = this.config.ridgeColor.g + colorNoise;
          b = this.config.ridgeColor.b + colorNoise;
        } else {
          const baseR = this.config.baseColor.r * (1 - tipFactor) + this.config.tipColor.r * tipFactor;
          const baseG = this.config.baseColor.g * (1 - tipFactor) + this.config.tipColor.g * tipFactor;
          const baseB = this.config.baseColor.b * (1 - tipFactor) + this.config.tipColor.b * tipFactor;

          r = baseR + colorNoise + cereTransition * 0.1;
          g = baseG + colorNoise + cereTransition * 0.08;
          b = baseB + colorNoise;
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

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const v = y / size;

        // Ridge grooves
        const ridgePattern = Math.sin(v * this.config.ridgeFrequency * Math.PI);
        const ny = Math.cos(ridgePattern * Math.PI) * 0.2;
        const nx = 0;
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

  updateConfig(config: Partial<BeakMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
    this.material.clearcoat = this.config.clearcoat;
  }

  static createPreset(preset: BeakPreset): BeakMaterial {
    switch (preset) {
      case 'eagle':
        return new BeakMaterial({
          baseColor: new THREE.Color(0.45, 0.35, 0.15),
          ridgeColor: new THREE.Color(0.3, 0.22, 0.08),
          tipColor: new THREE.Color(0.25, 0.18, 0.06),
          roughness: 0.3,
          clearcoat: 0.4,
        });
      case 'parrot':
        return new BeakMaterial({
          baseColor: new THREE.Color(0.15, 0.15, 0.12),
          ridgeColor: new THREE.Color(0.08, 0.08, 0.06),
          tipColor: new THREE.Color(0.12, 0.12, 0.1),
          roughness: 0.25,
          clearcoat: 0.5,
        });
      case 'duck':
        return new BeakMaterial({
          baseColor: new THREE.Color(0.75, 0.55, 0.15),
          ridgeColor: new THREE.Color(0.55, 0.4, 0.1),
          tipColor: new THREE.Color(0.4, 0.3, 0.08),
          roughness: 0.35,
          clearcoat: 0.45,
        });
      case 'toucan':
        return new BeakMaterial({
          baseColor: new THREE.Color(0.9, 0.6, 0.1),
          ridgeColor: new THREE.Color(0.7, 0.4, 0.05),
          tipColor: new THREE.Color(0.15, 0.1, 0.05),
          roughness: 0.3,
          clearcoat: 0.5,
          ridgeFrequency: 20,
        });
      case 'finch':
        return new BeakMaterial({
          baseColor: new THREE.Color(0.6, 0.4, 0.15),
          ridgeColor: new THREE.Color(0.4, 0.25, 0.1),
          tipColor: new THREE.Color(0.3, 0.2, 0.08),
          roughness: 0.3,
          clearcoat: 0.35,
        });
      default:
        return new BeakMaterial();
    }
  }
}
