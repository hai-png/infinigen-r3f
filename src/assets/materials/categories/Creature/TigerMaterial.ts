import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for tiger material properties
 * Based on infinigen's tiger.py — orange-black stripe pattern
 */
export interface TigerMaterialConfig {
  /** Base orange/tawny color */
  baseColor: THREE.Color;
  /** Stripe color (typically dark brown/black) */
  stripeColor: THREE.Color;
  /** Belly/underside lighter color */
  bellyColor: THREE.Color;
  /** Stripe width (0-1) */
  stripeWidth: number;
  /** Stripe distortion amount */
  stripeDistortion: number;
  /** Stripe scale frequency */
  stripeScale: number;
  /** Roughness */
  roughness: number;
  /** Specular intensity */
  specular: number;
  /** Subsurface scattering amount */
  subsurfaceAmount: number;
  /** Subsurface scattering color */
  subsurfaceColor: THREE.Color;
}

export type TigerParams = TigerMaterialConfig;
export type TigerPreset = 'bengal' | 'white' | 'snow' | 'sumatran' | 'siberian';

/**
 * Tiger stripe material with orange-black pattern
 * Ported from infinigen/infinigen/assets/materials/creature/tiger.py
 */
export class TigerMaterial {
  private config: TigerMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<TigerMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.85, 0.55, 0.15),
      stripeColor: new THREE.Color(0.05, 0.03, 0.02),
      bellyColor: new THREE.Color(0.95, 0.85, 0.6),
      stripeWidth: rng.nextFloat(0.08, 0.18),
      stripeDistortion: rng.nextFloat(0.5, 1.5),
      stripeScale: rng.nextFloat(0.8, 1.5),
      roughness: 0.75,
      specular: 0.3,
      subsurfaceAmount: 0.15,
      subsurfaceColor: new THREE.Color(0.9, 0.4, 0.15),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      specularIntensity: this.config.specular,
      thickness: 1.0,
      attenuationColor: this.config.subsurfaceColor,
      attenuationDistance: 0.5 / Math.max(0.01, this.config.subsurfaceAmount),
      side: THREE.DoubleSide,
    });

    this.generateStripeTexture(material);
    this.generateNormalMap(material);

    return material;
  }

  private generateStripeTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // Create distorted stripe pattern
        const distort1 = noise.perlin2D(u * 5, v * 5) * this.config.stripeDistortion;
        const distort2 = noise.perlin2D(u * 10 + 3.7, v * 10 + 7.3) * this.config.stripeDistortion * 0.3;

        // Vertical-ish stripes with musgrave-like distortion
        const stripeCoord = u * this.config.stripeScale * 10 + distort1 + distort2;
        const stripeVal = Math.sin(stripeCoord * Math.PI * 2);

        // Create sharp stripe edges
        const stripeMask = stripeVal > (1 - this.config.stripeWidth * 6) ? 1 : 0;

        // Add belly gradient (lighter underneath)
        const bellyFactor = Math.max(0, (v - 0.7) * 3.3);

        // Color blending
        let r: number, g: number, b: number;
        if (stripeMask > 0.5) {
          r = this.config.stripeColor.r;
          g = this.config.stripeColor.g;
          b = this.config.stripeColor.b;
        } else {
          const baseR = this.config.baseColor.r * (1 - bellyFactor) + this.config.bellyColor.r * bellyFactor;
          const baseG = this.config.baseColor.g * (1 - bellyFactor) + this.config.bellyColor.g * bellyFactor;
          const baseB = this.config.baseColor.b * (1 - bellyFactor) + this.config.bellyColor.b * bellyFactor;

          // Add fine fur texture noise
          const furNoise = noise.perlin2D(x * 0.08, y * 0.08) * 0.08;
          r = baseR + furNoise;
          g = baseG + furNoise;
          b = baseB + furNoise;
        }

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

        // Fur grain normal map
        const nx = noise.perlin2D(x * 0.15, y * 0.05) * 0.3;
        const ny = noise.perlin2D(x * 0.05, y * 0.15) * 0.15;
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
    material.normalScale = new THREE.Vector2(0.3, 0.3);
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<TigerMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
    this.material.specularIntensity = this.config.specular;
  }

  static createPreset(preset: TigerPreset): TigerMaterial {
    switch (preset) {
      case 'bengal':
        return new TigerMaterial({
          baseColor: new THREE.Color(0.85, 0.55, 0.15),
          stripeColor: new THREE.Color(0.05, 0.03, 0.02),
          stripeWidth: 0.12,
          stripeDistortion: 1.0,
        });
      case 'white':
        return new TigerMaterial({
          baseColor: new THREE.Color(0.95, 0.92, 0.85),
          stripeColor: new THREE.Color(0.45, 0.35, 0.2),
          bellyColor: new THREE.Color(0.98, 0.97, 0.95),
          stripeWidth: 0.15,
          stripeDistortion: 0.8,
        });
      case 'snow':
        return new TigerMaterial({
          baseColor: new THREE.Color(0.9, 0.88, 0.75),
          stripeColor: new THREE.Color(0.35, 0.25, 0.15),
          bellyColor: new THREE.Color(0.98, 0.97, 0.93),
          stripeWidth: 0.08,
          stripeDistortion: 0.6,
        });
      case 'sumatran':
        return new TigerMaterial({
          baseColor: new THREE.Color(0.8, 0.48, 0.1),
          stripeColor: new THREE.Color(0.03, 0.02, 0.01),
          stripeWidth: 0.15,
          stripeDistortion: 1.2,
          stripeScale: 1.3,
        });
      case 'siberian':
        return new TigerMaterial({
          baseColor: new THREE.Color(0.82, 0.58, 0.2),
          stripeColor: new THREE.Color(0.06, 0.04, 0.02),
          bellyColor: new THREE.Color(0.96, 0.9, 0.65),
          stripeWidth: 0.1,
          stripeDistortion: 0.9,
          roughness: 0.8,
        });
      default:
        return new TigerMaterial();
    }
  }
}
