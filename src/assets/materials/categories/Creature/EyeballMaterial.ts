import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for eyeball material properties
 * Based on infinigen's eyeball.py — wet glossy eye with iris
 */
export interface EyeballMaterialConfig {
  /** Iris primary color */
  irisColor: THREE.Color;
  /** Iris secondary/ring color */
  irisRingColor: THREE.Color;
  /** Pupil color */
  pupilColor: THREE.Color;
  /** Sclera (white) color */
  scleraColor: THREE.Color;
  /** Iris radius (0-1 relative to eye) */
  irisRadius: number;
  /** Pupil radius (0-1 relative to iris) */
  pupilRadius: number;
  /** Cornea clearcoat amount */
  corneaClearcoat: number;
  /** Roughness (very low for glossy eye) */
  roughness: number;
  /** Iris detail level */
  irisDetail: number;
  /** Subsurface amount for sclera translucency */
  subsurfaceAmount: number;
  /** Subsurface color */
  subsurfaceColor: THREE.Color;
  /** Eye coordinate axis ('X' or 'Y') */
  coordinateAxis: 'X' | 'Y';
}

export type EyeballParams = EyeballMaterialConfig;
export type EyeballPreset = 'human_brown' | 'human_blue' | 'human_green' | 'cat' | 'reptile';

/**
 * Wet glossy eyeball material with iris and pupil
 * Ported from infinigen/infinigen/assets/materials/creature/eyeball.py
 */
export class EyeballMaterial {
  private config: EyeballMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<EyeballMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      irisColor: new THREE.Color(0.35, 0.25, 0.1),
      irisRingColor: new THREE.Color(0.5, 0.4, 0.15),
      pupilColor: new THREE.Color(0.0, 0.0, 0.0),
      scleraColor: new THREE.Color(0.9, 0.88, 0.82),
      irisRadius: rng.nextFloat(0.6, 0.8),
      pupilRadius: rng.nextFloat(0.3, 0.5),
      corneaClearcoat: 1.0,
      roughness: 0.03,
      irisDetail: rng.nextFloat(0.5, 1.0),
      subsurfaceAmount: 0.1,
      subsurfaceColor: new THREE.Color(1.0, 0.8, 0.7),
      coordinateAxis: 'X',
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.scleraColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      clearcoat: this.config.corneaClearcoat,
      clearcoatRoughness: 0.01,
      thickness: 0.5,
      attenuationColor: this.config.subsurfaceColor,
      attenuationDistance: 0.5 / Math.max(0.01, this.config.subsurfaceAmount),
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
        const u = (x / size) * 2 - 1;
        const v = (y / size) * 2 - 1;
        const dist = Math.sqrt(u * u + v * v);

        let r: number, g: number, b: number;

        if (dist > 1.0) {
          // Outside eye
          r = 0.02; g = 0.02; b = 0.02;
        } else if (dist > this.config.irisRadius) {
          // Sclera region
          const scleraNoise = noise.perlin2D(x * 0.03, y * 0.03) * 0.03;
          // Slight vein coloring near edges
          const edgeFactor = (dist - this.config.irisRadius) / (1 - this.config.irisRadius);
          const veinNoise = noise.perlin2D(x * 0.02, y * 0.02) * 0.1 * edgeFactor;

          r = this.config.scleraColor.r + scleraNoise + veinNoise;
          g = this.config.scleraColor.g + scleraNoise;
          b = this.config.scleraColor.b + scleraNoise;
        } else if (dist > this.config.irisRadius * this.config.pupilRadius) {
          // Iris region
          const irisT = (dist - this.config.irisRadius * this.config.pupilRadius) /
            (this.config.irisRadius * (1 - this.config.pupilRadius));

          // Iris fiber pattern
          const angle = Math.atan2(v, u);
          const fiberNoise = noise.perlin2D(
            angle * 3 * this.config.irisDetail,
            irisT * 10 * this.config.irisDetail
          ) * 0.15;

          // Radial gradient
          r = this.config.irisColor.r * (1 - irisT * 0.3) + this.config.irisRingColor.r * irisT * 0.3 + fiberNoise;
          g = this.config.irisColor.g * (1 - irisT * 0.3) + this.config.irisRingColor.g * irisT * 0.3 + fiberNoise;
          b = this.config.irisColor.b * (1 - irisT * 0.3) + this.config.irisRingColor.b * irisT * 0.3 + fiberNoise;

          // Collarette (ring pattern in iris)
          const collarette = Math.sin(irisT * Math.PI * 4) * 0.05;
          r += collarette;
          g += collarette;
          b += collarette;
        } else {
          // Pupil
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

  updateConfig(config: Partial<EyeballMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.roughness = this.config.roughness;
    this.material.clearcoat = this.config.corneaClearcoat;
  }

  static createPreset(preset: EyeballPreset): EyeballMaterial {
    switch (preset) {
      case 'human_brown':
        return new EyeballMaterial({
          irisColor: new THREE.Color(0.35, 0.22, 0.08),
          irisRingColor: new THREE.Color(0.5, 0.35, 0.12),
          irisRadius: 0.7,
          pupilRadius: 0.4,
        });
      case 'human_blue':
        return new EyeballMaterial({
          irisColor: new THREE.Color(0.2, 0.35, 0.55),
          irisRingColor: new THREE.Color(0.35, 0.5, 0.65),
          irisRadius: 0.7,
          pupilRadius: 0.4,
        });
      case 'human_green':
        return new EyeballMaterial({
          irisColor: new THREE.Color(0.2, 0.4, 0.2),
          irisRingColor: new THREE.Color(0.35, 0.55, 0.25),
          irisRadius: 0.7,
          pupilRadius: 0.4,
        });
      case 'cat':
        return new EyeballMaterial({
          irisColor: new THREE.Color(0.55, 0.45, 0.1),
          irisRingColor: new THREE.Color(0.7, 0.6, 0.15),
          irisRadius: 0.75,
          pupilRadius: 0.25,
          irisDetail: 0.8,
        });
      case 'reptile':
        return new EyeballMaterial({
          irisColor: new THREE.Color(0.4, 0.5, 0.15),
          irisRingColor: new THREE.Color(0.6, 0.7, 0.1),
          irisRadius: 0.65,
          pupilRadius: 0.3,
          irisDetail: 0.6,
        });
      default:
        return new EyeballMaterial();
    }
  }
}
