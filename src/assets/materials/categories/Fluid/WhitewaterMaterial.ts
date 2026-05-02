import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

/**
 * Configuration for whitewater material properties
 * Based on infinigen's whitewater.py — bubble-laden turbulent water, high opacity white
 */
export interface WhitewaterMaterialConfig {
  /** Surface color — bright white for bubble-filled water */
  baseColor: THREE.Color;
  /** Subsurface scattering color — purplish tint from bubble scattering */
  subsurfaceColor: THREE.Color;
  /** Volume scatter color — light purple-white */
  scatterColor: THREE.Color;
  /** Surface transparency (0-1) */
  transparency: number;
  /** Surface roughness */
  roughness: number;
  /** Specular IOR level */
  specularIOR: number;
  /** Index of refraction */
  ior: number;
  /** Bubble density factor (0-1) */
  bubbleDensity: number;
  /** Turbulence scale for bubble pattern */
  turbulenceScale: number;
  /** Anisotropy for volume scattering */
  anisotropy: number;
}

export type WhitewaterParams = WhitewaterMaterialConfig;
export type WhitewaterPreset = 'rapid' | 'breaker' | 'wake' | 'boil' | 'splash';

/**
 * Whitewater material — bubble-laden turbulent water with high opacity white appearance
 * Ported from infinigen/infinigen/assets/materials/fluid/whitewater.py
 *
 * The original uses:
 * - PrincipledBSDF (MULTI_GGX distribution) with:
 *   - White base color (1, 1, 1)
 *   - Purplish subsurface color (~0.71, 0.61, 0.80)
 *   - Specular IOR: ~0.089
 *   - Roughness: 0.15
 *   - Coat Roughness: 0
 *   - IOR: 1.1
 *   - Transmission: 0.5
 * - Volume Scatter with:
 *   - Color: light purple-white (0.89, 0.86, 1.0)
 *   - Anisotropy: 0.133
 */
export class WhitewaterMaterial {
  private config: WhitewaterMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<WhitewaterMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(1.0, 1.0, 1.0),
      subsurfaceColor: new THREE.Color(
        rng.nextFloat(0.66, 0.76),
        rng.nextFloat(0.56, 0.66),
        rng.nextFloat(0.75, 0.85)
      ),
      scatterColor: new THREE.Color(0.89, 0.86, 1.0),
      transparency: 0.5,
      roughness: 0.15,
      specularIOR: rng.nextFloat(0.08, 0.10),
      ior: 1.1,
      bubbleDensity: rng.nextFloat(0.6, 0.95),
      turbulenceScale: rng.nextFloat(5, 15),
      anisotropy: 0.133,
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      transmission: this.config.transparency,
      thickness: 0.5,
      ior: this.config.ior,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
      sheen: 0.3,
      sheenRoughness: 0.5,
      sheenColor: this.config.subsurfaceColor,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });

    this.generateBubbleTexture(material);
    return material;
  }

  /**
   * Generate procedural bubble/turbulence texture
   * Simulates the volume scatter appearance with bubble patterns
   */
  private generateBubbleTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // Turbulent noise for bubble distribution
        const turb1 = noise.perlin2D(u * this.config.turbulenceScale, v * this.config.turbulenceScale);
        const turb2 = noise.perlin2D(u * this.config.turbulenceScale * 2.3, v * this.config.turbulenceScale * 2.3) * 0.5;
        const turb3 = noise.perlin2D(u * this.config.turbulenceScale * 5.1, v * this.config.turbulenceScale * 5.1) * 0.25;
        const turbulence = (turb1 + turb2 + turb3) * 0.5 + 0.5;

        // Bubble pattern — bright spots in turbulent water
        const bubbleNoise = noise.perlin2D(u * 30, v * 30);
        const bubbles = Math.max(0, bubbleNoise * 0.5 + 0.5);

        // Combine: turbulence determines where bubble clusters appear
        const whiteWaterFactor = Math.min(1, turbulence * this.config.bubbleDensity);
        const bubbleDetail = bubbles * whiteWaterFactor;

        // Color: white with slight subsurface purple tint in shadow areas
        const shadowFactor = 1 - whiteWaterFactor;
        const r = 1.0 * whiteWaterFactor + this.config.subsurfaceColor.r * shadowFactor * 0.3;
        const g = 1.0 * whiteWaterFactor + this.config.subsurfaceColor.g * shadowFactor * 0.3;
        const b = 1.0 * whiteWaterFactor + this.config.subsurfaceColor.b * shadowFactor * 0.3;

        imageData.data[index] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[index + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[index + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[index + 3] = Math.min(255, Math.max(0, Math.floor((0.7 + bubbleDetail * 0.3) * 255)));
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);

    material.map = texture;
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<WhitewaterMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.transmission = this.config.transparency;
    this.material.roughness = this.config.roughness;
    this.material.ior = this.config.ior;
    this.material.sheenColor = this.config.subsurfaceColor;
  }

  static createPreset(preset: WhitewaterPreset): WhitewaterMaterial {
    switch (preset) {
      case 'rapid':
        return new WhitewaterMaterial({
          bubbleDensity: 0.85,
          turbulenceScale: 10,
          roughness: 0.12,
          transparency: 0.45,
          subsurfaceColor: new THREE.Color(0.71, 0.61, 0.80),
        });
      case 'breaker':
        return new WhitewaterMaterial({
          bubbleDensity: 0.95,
          turbulenceScale: 8,
          roughness: 0.1,
          transparency: 0.4,
          subsurfaceColor: new THREE.Color(0.68, 0.58, 0.78),
        });
      case 'wake':
        return new WhitewaterMaterial({
          bubbleDensity: 0.6,
          turbulenceScale: 12,
          roughness: 0.18,
          transparency: 0.55,
          subsurfaceColor: new THREE.Color(0.74, 0.64, 0.82),
        });
      case 'boil':
        return new WhitewaterMaterial({
          bubbleDensity: 0.9,
          turbulenceScale: 6,
          roughness: 0.13,
          transparency: 0.5,
          subsurfaceColor: new THREE.Color(0.69, 0.60, 0.79),
        });
      case 'splash':
        return new WhitewaterMaterial({
          bubbleDensity: 0.7,
          turbulenceScale: 15,
          roughness: 0.2,
          transparency: 0.6,
          subsurfaceColor: new THREE.Color(0.73, 0.63, 0.83),
        });
      default:
        return new WhitewaterMaterial();
    }
  }
}
