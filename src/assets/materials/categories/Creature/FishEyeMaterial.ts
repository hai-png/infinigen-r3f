import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for fish eye material properties
 * Based on infinigen's fish_eye.py — spherical lens with iris and pupil
 */
export interface FishEyeMaterialConfig {
  /** Iris base color */
  irisColor: THREE.Color;
  /** Iris secondary color (ring) */
  irisRingColor: THREE.Color;
  /** Pupil color */
  pupilColor: THREE.Color;
  /** Sclera (white of eye) color */
  scleraColor: THREE.Color;
  /** Iris size relative to eye (0-1) */
  irisSize: number;
  /** Pupil size relative to iris (0-1) */
  pupilSize: number;
  /** Cornea glossiness (0-1) */
  corneaGloss: number;
  /** Iris pattern complexity */
  irisDetail: number;
  /** Roughness of the sclera */
  roughness: number;
}

export type FishEyeParams = FishEyeMaterialConfig;
export type FishEyePreset = 'goldfish' | 'shark' | 'tropical' | 'catfish' | 'pike';

/**
 * Fish eye material with iris, pupil, and glossy cornea
 * Ported from infinigen/infinigen/assets/materials/creature/fish_eye.py
 */
export class FishEyeMaterial {
  private config: FishEyeMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<FishEyeMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      irisColor: new THREE.Color(0.6, 0.5, 0.2),
      irisRingColor: new THREE.Color(0.9, 0.7, 0.1),
      pupilColor: new THREE.Color(0.0, 0.0, 0.0),
      scleraColor: new THREE.Color(0.85, 0.85, 0.8),
      irisSize: rng.nextFloat(0.55, 0.75),
      pupilSize: rng.nextFloat(0.3, 0.5),
      corneaGloss: 0.95,
      irisDetail: rng.nextFloat(0.5, 1.0),
      roughness: 0.05,
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.scleraColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      clearcoat: this.config.corneaGloss,
      clearcoatRoughness: 0.02,
      side: THREE.DoubleSide,
    });

    this.generateEyeTexture(material);

    return material;
  }

  private generateEyeTexture(material: THREE.MeshPhysicalMaterial): void {
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
        const u = (x / size) * 2 - 1; // [-1, 1]
        const v = (y / size) * 2 - 1;
        const dist = Math.sqrt(u * u + v * v);

        let r: number, g: number, b: number;

        if (dist > 0.95) {
          // Edge — very dark boundary
          r = 0.02; g = 0.02; b = 0.02;
        } else if (dist > this.config.irisSize) {
          // Sclera region
          const scleraNoise = noise.perlin2D(x * 0.05, y * 0.05) * 0.05;
          r = this.config.scleraColor.r + scleraNoise;
          g = this.config.scleraColor.g + scleraNoise;
          b = this.config.scleraColor.b + scleraNoise;
        } else if (dist > this.config.irisSize * this.config.pupilSize) {
          // Iris region
          const irisT = (dist - this.config.irisSize * this.config.pupilSize) /
            (this.config.irisSize * (1 - this.config.pupilSize));

          // Voronoi-like iris pattern
          const irisNoise = noise.perlin2D(
            x * 0.03 * this.config.irisDetail,
            y * 0.03 * this.config.irisDetail
          ) * 0.3;

          // Radial gradient from pupil edge to iris edge
          const radialBlend = irisT;

          r = this.config.irisColor.r * (1 - radialBlend * 0.3) + this.config.irisRingColor.r * radialBlend * 0.3 + irisNoise;
          g = this.config.irisColor.g * (1 - radialBlend * 0.3) + this.config.irisRingColor.g * radialBlend * 0.3 + irisNoise;
          b = this.config.irisColor.b * (1 - radialBlend * 0.3) + this.config.irisRingColor.b * radialBlend * 0.3 + irisNoise;

          // Add radial fiber pattern
          const angle = Math.atan2(v, u);
          const fiberPattern = Math.sin(angle * 20 + irisNoise * 5) * 0.08;
          r += fiberPattern;
          g += fiberPattern;
          b += fiberPattern;
        } else {
          // Pupil region
          r = this.config.pupilColor.r;
          g = this.config.pupilColor.g;
          b = this.config.pupilColor.b;
        }

        imageData.data[index] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[index + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[index + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    material.map = texture;
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<FishEyeMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.roughness = this.config.roughness;
    this.material.clearcoat = this.config.corneaGloss;
  }

  static createPreset(preset: FishEyePreset): FishEyeMaterial {
    switch (preset) {
      case 'goldfish':
        return new FishEyeMaterial({
          irisColor: new THREE.Color(0.7, 0.5, 0.1),
          irisRingColor: new THREE.Color(0.9, 0.7, 0.15),
          irisSize: 0.65,
          pupilSize: 0.35,
        });
      case 'shark':
        return new FishEyeMaterial({
          irisColor: new THREE.Color(0.15, 0.15, 0.15),
          irisRingColor: new THREE.Color(0.25, 0.25, 0.2),
          scleraColor: new THREE.Color(0.9, 0.9, 0.85),
          irisSize: 0.6,
          pupilSize: 0.5,
        });
      case 'tropical':
        return new FishEyeMaterial({
          irisColor: new THREE.Color(0.2, 0.6, 0.5),
          irisRingColor: new THREE.Color(0.1, 0.9, 0.8),
          irisSize: 0.7,
          pupilSize: 0.3,
        });
      case 'catfish':
        return new FishEyeMaterial({
          irisColor: new THREE.Color(0.4, 0.35, 0.15),
          irisRingColor: new THREE.Color(0.6, 0.5, 0.2),
          irisSize: 0.55,
          pupilSize: 0.4,
        });
      case 'pike':
        return new FishEyeMaterial({
          irisColor: new THREE.Color(0.5, 0.55, 0.2),
          irisRingColor: new THREE.Color(0.7, 0.65, 0.1),
          irisSize: 0.6,
          pupilSize: 0.35,
        });
      default:
        return new FishEyeMaterial();
    }
  }
}
