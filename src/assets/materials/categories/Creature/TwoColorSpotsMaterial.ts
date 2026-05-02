import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for two-color spots material properties
 * Based on infinigen's two_color_spots.py — two-color spotted pattern
 */
export interface TwoColorSpotsMaterialConfig {
  /** Primary color */
  color1: THREE.Color;
  /** Secondary color (spots) */
  color2: THREE.Color;
  /** Spot scale (Voronoi frequency) */
  spotScale: number;
  /** Spot size threshold */
  spotThreshold: number;
  /** Spot boundary softness */
  boundarySoftness: number;
  /** Noise distortion amount */
  distortion: number;
  /** Noise mix factor */
  noiseMix: number;
  /** Roughness */
  roughness: number;
  /** Normal strength */
  normalStrength: number;
}

export type TwoColorSpotsParams = TwoColorSpotsMaterialConfig;
export type TwoColorSpotsPreset = 'dalmatian' | 'holstein' | 'appaloosa' | 'ladybug' | 'moth';

/**
 * Two-color spotted pattern material using Voronoi
 * Ported from infinigen/infinigen/assets/materials/creature/two_color_spots.py
 */
export class TwoColorSpotsMaterial {
  private config: TwoColorSpotsMaterialConfig;
  private material: THREE.MeshStandardMaterial;

  constructor(config?: Partial<TwoColorSpotsMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      color1: new THREE.Color(1.0, 0.24, 0.003),
      color2: new THREE.Color(0.49, 0.46, 0.39),
      spotScale: rng.nextFloat(5, 15),
      spotThreshold: rng.nextFloat(0.45, 0.7),
      boundarySoftness: rng.nextFloat(0.05, 0.15),
      distortion: rng.nextFloat(0.5, 0.9),
      noiseMix: rng.nextFloat(0.5, 0.9),
      roughness: rng.nextFloat(0.6, 0.85),
      normalStrength: rng.nextFloat(0.3, 0.6),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: this.config.color1,
      roughness: this.config.roughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    this.generateSpotsTexture(material);

    return material;
  }

  private generateSpotsTexture(material: THREE.MeshStandardMaterial): void {
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

        // Noise distortion of coordinates
        const distortX = noise.perlin2D(u * 5, v * 5) * this.config.distortion;
        const distortY = noise.perlin2D(u * 5 + 100, v * 5 + 100) * this.config.distortion;

        const du = u + distortX * 0.05;
        const dv = v + distortY * 0.05;

        // Voronoi pattern for spots
        const scaleU = du * this.config.spotScale;
        const scaleV = dv * this.config.spotScale;

        const cellX = Math.floor(scaleU);
        const cellY = Math.floor(scaleV);

        let minDist = Infinity;
        let minDist2 = Infinity;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx + 7, ny + 13);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 50, ny + 50);
            const dist = Math.sqrt((scaleU - fx) ** 2 + (scaleV - fy) ** 2);
            if (dist < minDist) {
              minDist2 = minDist;
              minDist = dist;
            } else if (dist < minDist2) {
              minDist2 = dist;
            }
          }
        }

        // Distance squared for sharper spots
        const distSq = minDist * minDist;

        // Threshold to determine which color
        const spotFactor = distSq < this.config.spotThreshold ? 1 : 0;

        // Soft boundary
        const edgeDist = Math.abs(distSq - this.config.spotThreshold);
        const softEdge = edgeDist < this.config.boundarySoftness
          ? 1 - edgeDist / this.config.boundarySoftness
          : 0;

        // Additional noise layer
        const colorNoise = noise.perlin2D(x * 0.02, y * 0.02) * 0.05;

        // Color mixing
        let r: number, g: number, b: number;

        if (softEdge > 0) {
          // Soft boundary blend
          const t = spotFactor > 0 ? 1 - softEdge * 0.5 : softEdge * 0.5;
          r = this.config.color1.r * (1 - t) + this.config.color2.r * t + colorNoise;
          g = this.config.color1.g * (1 - t) + this.config.color2.g * t + colorNoise;
          b = this.config.color1.b * (1 - t) + this.config.color2.b * t + colorNoise;
        } else if (spotFactor > 0.5) {
          r = this.config.color2.r + colorNoise;
          g = this.config.color2.g + colorNoise;
          b = this.config.color2.b + colorNoise;
        } else {
          r = this.config.color1.r + colorNoise;
          g = this.config.color1.g + colorNoise;
          b = this.config.color1.b + colorNoise;
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

  getMaterial(): THREE.MeshStandardMaterial {
    return this.material;
  }

  updateConfig(config: Partial<TwoColorSpotsMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.color1);
    this.material.roughness = this.config.roughness;
  }

  static createPreset(preset: TwoColorSpotsPreset): TwoColorSpotsMaterial {
    switch (preset) {
      case 'dalmatian':
        return new TwoColorSpotsMaterial({
          color1: new THREE.Color(0.95, 0.93, 0.88),
          color2: new THREE.Color(0.08, 0.08, 0.08),
          spotScale: 8,
          spotThreshold: 0.5,
          roughness: 0.8,
        });
      case 'holstein':
        return new TwoColorSpotsMaterial({
          color1: new THREE.Color(0.95, 0.93, 0.9),
          color2: new THREE.Color(0.1, 0.08, 0.06),
          spotScale: 5,
          spotThreshold: 0.55,
          roughness: 0.75,
        });
      case 'appaloosa':
        return new TwoColorSpotsMaterial({
          color1: new THREE.Color(0.7, 0.55, 0.35),
          color2: new THREE.Color(0.2, 0.15, 0.1),
          spotScale: 12,
          spotThreshold: 0.45,
          roughness: 0.8,
        });
      case 'ladybug':
        return new TwoColorSpotsMaterial({
          color1: new THREE.Color(0.85, 0.1, 0.05),
          color2: new THREE.Color(0.02, 0.02, 0.02),
          spotScale: 6,
          spotThreshold: 0.4,
          roughness: 0.5,
        });
      case 'moth':
        return new TwoColorSpotsMaterial({
          color1: new THREE.Color(0.6, 0.55, 0.4),
          color2: new THREE.Color(0.2, 0.18, 0.12),
          spotScale: 10,
          spotThreshold: 0.5,
          roughness: 0.85,
        });
      default:
        return new TwoColorSpotsMaterial();
    }
  }
}
