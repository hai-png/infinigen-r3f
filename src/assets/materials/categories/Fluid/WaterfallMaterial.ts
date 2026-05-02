import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

/**
 * Configuration for waterfall material properties
 * Based on infinigen's waterfall.py — white/foamy transparent with mist spray appearance
 */
export interface WaterfallMaterialConfig {
  /** Main water color — light cyan-white */
  baseColor: THREE.Color;
  /** Foam color — bright white */
  foamColor: THREE.Color;
  /** Mist/haze color for volume scatter */
  mistColor: THREE.Color;
  /** Surface transparency (0-1) */
  transparency: number;
  /** Surface roughness */
  roughness: number;
  /** Metalness — slight metallic sheen for wet look */
  metalness: number;
  /** Index of refraction */
  ior: number;
  /** Foam density (0-1) — controls alpha from musgrave texture */
  foamDensity: number;
  /** Flow speed */
  flowSpeed: number;
  /** Noise scale for foam pattern */
  noiseScale: number;
  /** Noise detail (octaves) for foam */
  noiseDetail: number;
}

export type WaterfallParams = WaterfallMaterialConfig;
export type WaterfallPreset = 'cascade' | 'plunge' | 'horsetail' | 'tiered' | 'fan';

/**
 * Waterfall material with foamy white water, transparency, and mist volume
 * Ported from infinigen/infinigen/assets/materials/fluid/waterfall.py
 *
 * The original uses:
 * - PrincipledBSDF with full transmission, IOR 1.33, roughness 0
 * - TransparentBSDF mix for camera ray optimization
 * - Second PrincipledBSDF with metallic 0.26, transmission 0.82
 *   and alpha from musgrave noise (foam pattern)
 * - Volume scatter with light blue mist color (0.58, 0.73, 0.8)
 */
export class WaterfallMaterial {
  private config: WaterfallMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;
  private time: number = 0;

  constructor(config?: Partial<WaterfallMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.69, 0.94, 1.0),
      foamColor: new THREE.Color(1.0, 1.0, 1.0),
      mistColor: new THREE.Color(0.58, 0.73, 0.80),
      transparency: 0.82,
      roughness: 0.0,
      metalness: rng.nextFloat(0.2, 0.35),
      ior: 1.333,
      foamDensity: rng.nextFloat(0.5, 0.8),
      flowSpeed: rng.nextFloat(1.5, 3.0),
      noiseScale: rng.nextFloat(2.5, 4.0),
      noiseDetail: rng.nextInt(8, 14),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: this.config.metalness,
      transmission: this.config.transparency,
      thickness: 1.0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.0,
      ior: this.config.ior,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });

    this.generateWaterfallTexture(material);
    return material;
  }

  /**
   * Generate the procedural foam/alpha texture
   * Matching the original's musgrave texture → colorramp for alpha
   * with black-to-white B-spline interpolation
   */
  private generateWaterfallTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // Musgrave-like noise for foam pattern
        // Original uses scale=3.3, detail=13, dimension=0.3
        const musgrave = noise.perlin2D(u * this.config.noiseScale, v * this.config.noiseScale);
        const detailNoise = noise.perlin2D(
          u * this.config.noiseScale * 4,
          v * this.config.noiseScale * 4
        ) * 0.3;
        const foamNoise = musgrave + detailNoise;

        // Color ramp: black (0.325) → white (0.673) — B_SPLINE interpolation
        // This controls where foam appears (alpha channel)
        const rampInput = foamNoise * 0.5 + 0.5; // normalize to 0-1
        const foamAlpha = this.sampleFoamRamp(rampInput) * this.config.foamDensity;

        // Downward flow bias — foam density increases downward (like a real waterfall)
        const flowBias = Math.pow(v, 0.5);
        const finalAlpha = Math.min(1, foamAlpha * flowBias);

        // Color: mix between base water color and white foam
        const foamFactor = finalAlpha;
        const r = this.config.baseColor.r * (1 - foamFactor) + this.config.foamColor.r * foamFactor;
        const g = this.config.baseColor.g * (1 - foamFactor) + this.config.foamColor.g * foamFactor;
        const b = this.config.baseColor.b * (1 - foamFactor) + this.config.foamColor.b * foamFactor;

        imageData.data[index] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[index + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[index + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[index + 3] = Math.min(255, Math.max(0, Math.floor(finalAlpha * 255)));
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 6);

    material.map = texture;
    material.alphaMap = texture;
  }

  /**
   * Sample the foam color ramp with B-spline-like smooth interpolation
   * Original: position 0.325 = black, position 0.673 = white
   */
  private sampleFoamRamp(value: number): number {
    const t = Math.max(0, Math.min(1, value));
    const lowPos = 0.325;
    const highPos = 0.673;

    if (t <= lowPos) return 0;
    if (t >= highPos) return 1;

    const localT = (t - lowPos) / (highPos - lowPos);
    // Smoothstep for B-spline approximation
    return localT * localT * (3 - 2 * localT);
  }

  update(deltaTime: number): void {
    this.time += deltaTime * this.config.flowSpeed;
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<WaterfallMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.transmission = this.config.transparency;
    this.material.metalness = this.config.metalness;
    this.material.ior = this.config.ior;
  }

  static createPreset(preset: WaterfallPreset): WaterfallMaterial {
    switch (preset) {
      case 'cascade':
        return new WaterfallMaterial({
          baseColor: new THREE.Color(0.72, 0.95, 1.0),
          foamDensity: 0.7,
          flowSpeed: 2.5,
          noiseScale: 3.3,
          noiseDetail: 13,
          metalness: 0.26,
        });
      case 'plunge':
        return new WaterfallMaterial({
          baseColor: new THREE.Color(0.65, 0.90, 1.0),
          foamDensity: 0.85,
          flowSpeed: 3.0,
          noiseScale: 2.8,
          noiseDetail: 10,
          metalness: 0.3,
        });
      case 'horsetail':
        return new WaterfallMaterial({
          baseColor: new THREE.Color(0.75, 0.96, 1.0),
          foamDensity: 0.5,
          flowSpeed: 2.0,
          noiseScale: 4.0,
          noiseDetail: 12,
          metalness: 0.2,
          transparency: 0.9,
        });
      case 'tiered':
        return new WaterfallMaterial({
          baseColor: new THREE.Color(0.70, 0.93, 1.0),
          foamDensity: 0.65,
          flowSpeed: 2.2,
          noiseScale: 3.5,
          noiseDetail: 11,
          metalness: 0.28,
        });
      case 'fan':
        return new WaterfallMaterial({
          baseColor: new THREE.Color(0.68, 0.92, 1.0),
          foamDensity: 0.75,
          flowSpeed: 1.8,
          noiseScale: 3.0,
          noiseDetail: 9,
          metalness: 0.22,
          transparency: 0.85,
        });
      default:
        return new WaterfallMaterial();
    }
  }
}
