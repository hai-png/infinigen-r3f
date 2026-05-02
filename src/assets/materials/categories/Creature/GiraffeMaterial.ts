import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for giraffe material properties
 * Based on infinigen's giraffe.py — brown patches on tan background
 */
export interface GiraffeMaterialConfig {
  /** Background/tan color */
  backgroundColor: THREE.Color;
  /** Patch/brown color */
  patchColor: THREE.Color;
  /** Patch border color */
  borderColor: THREE.Color;
  /** Patch scale (Voronoi frequency) */
  patchScale: number;
  /** Patch threshold (0-1, lower = bigger patches) */
  patchThreshold: number;
  /** Patch edge softness */
  edgeSoftness: number;
  /** Roughness */
  roughness: number;
  /** Normal strength */
  normalStrength: number;
}

export type GiraffeParams = GiraffeMaterialConfig;
export type GiraffePreset = 'masai' | 'reticulated' | 'northern' | 'southern' | 'nubian';

/**
 * Giraffe material — brown patches on tan background using Voronoi pattern
 * Ported from infinigen/infinigen/assets/materials/creature/giraffe.py
 */
export class GiraffeMaterial {
  private config: GiraffeMaterialConfig;
  private material: THREE.MeshStandardMaterial;

  constructor(config?: Partial<GiraffeMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      backgroundColor: new THREE.Color(0.93, 0.75, 0.45),
      patchColor: new THREE.Color(0.4, 0.22, 0.08),
      borderColor: new THREE.Color(0.65, 0.45, 0.2),
      patchScale: rng.nextFloat(8, 14),
      patchThreshold: rng.nextFloat(0.04, 0.08),
      edgeSoftness: rng.nextFloat(0.02, 0.06),
      roughness: rng.nextFloat(0.7, 0.85),
      normalStrength: rng.nextFloat(0.3, 0.6),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: this.config.backgroundColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    this.generateGiraffeTexture(material);

    return material;
  }

  private generateGiraffeTexture(material: THREE.MeshStandardMaterial): void {
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

        // Voronoi for patch pattern
        const scaleU = u * this.config.patchScale;
        const scaleV = v * this.config.patchScale;

        const cellX = Math.floor(scaleU);
        const cellY = Math.floor(scaleV);

        let minDist = Infinity;
        let secondMinDist = Infinity;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx, ny);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 50, ny + 50);
            const dist = Math.sqrt((scaleU - fx) ** 2 + (scaleV - fy) ** 2);
            if (dist < minDist) {
              secondMinDist = minDist;
              minDist = dist;
            } else if (dist < secondMinDist) {
              secondMinDist = dist;
            }
          }
        }

        // Edge between cells
        const edgeDist = secondMinDist - minDist;

        // Patch detection using threshold
        const isPatch = edgeDist < this.config.patchThreshold;
        const isBorder = edgeDist >= this.config.patchThreshold &&
          edgeDist < this.config.patchThreshold + this.config.edgeSoftness;

        // Color variation
        const colorNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.06;
        const fineNoise = noise.perlin2D(x * 0.05, y * 0.05) * 0.03;

        let r: number, g: number, b: number;

        if (isPatch) {
          r = this.config.patchColor.r + colorNoise + fineNoise;
          g = this.config.patchColor.g + colorNoise + fineNoise;
          b = this.config.patchColor.b + colorNoise + fineNoise;
        } else if (isBorder) {
          // Soft edge between patch and background
          const borderT = (edgeDist - this.config.patchThreshold) / this.config.edgeSoftness;
          r = this.config.patchColor.r * (1 - borderT) + this.config.borderColor.r * borderT + colorNoise;
          g = this.config.patchColor.g * (1 - borderT) + this.config.borderColor.g * borderT + colorNoise;
          b = this.config.patchColor.b * (1 - borderT) + this.config.borderColor.b * borderT + colorNoise;
        } else {
          r = this.config.backgroundColor.r + colorNoise + fineNoise;
          g = this.config.backgroundColor.g + colorNoise + fineNoise;
          b = this.config.backgroundColor.b + colorNoise + fineNoise;
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

  updateConfig(config: Partial<GiraffeMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.backgroundColor);
    this.material.roughness = this.config.roughness;
  }

  static createPreset(preset: GiraffePreset): GiraffeMaterial {
    switch (preset) {
      case 'masai':
        return new GiraffeMaterial({
          backgroundColor: new THREE.Color(0.93, 0.75, 0.45),
          patchColor: new THREE.Color(0.4, 0.22, 0.08),
          borderColor: new THREE.Color(0.65, 0.45, 0.2),
          patchScale: 10,
          patchThreshold: 0.06,
        });
      case 'reticulated':
        return new GiraffeMaterial({
          backgroundColor: new THREE.Color(0.9, 0.72, 0.4),
          patchColor: new THREE.Color(0.3, 0.15, 0.05),
          borderColor: new THREE.Color(0.55, 0.38, 0.18),
          patchScale: 8,
          patchThreshold: 0.05,
          edgeSoftness: 0.03,
        });
      case 'northern':
        return new GiraffeMaterial({
          backgroundColor: new THREE.Color(0.92, 0.78, 0.5),
          patchColor: new THREE.Color(0.45, 0.25, 0.1),
          borderColor: new THREE.Color(0.7, 0.5, 0.25),
          patchScale: 12,
          patchThreshold: 0.07,
        });
      case 'southern':
        return new GiraffeMaterial({
          backgroundColor: new THREE.Color(0.88, 0.7, 0.38),
          patchColor: new THREE.Color(0.35, 0.18, 0.06),
          borderColor: new THREE.Color(0.6, 0.4, 0.18),
          patchScale: 11,
          patchThreshold: 0.06,
        });
      case 'nubian':
        return new GiraffeMaterial({
          backgroundColor: new THREE.Color(0.9, 0.73, 0.42),
          patchColor: new THREE.Color(0.38, 0.2, 0.07),
          borderColor: new THREE.Color(0.62, 0.42, 0.2),
          patchScale: 9,
          patchThreshold: 0.055,
        });
      default:
        return new GiraffeMaterial();
    }
  }
}
