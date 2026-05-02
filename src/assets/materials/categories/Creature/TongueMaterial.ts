import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for tongue material properties
 * Based on infinigen's tongue.py — pink/red wet muscle tissue
 */
export interface TongueMaterialConfig {
  /** Base tongue color (pink-red) */
  baseColor: THREE.Color;
  /** Subsurface scattering color */
  subsurfaceColor: THREE.Color;
  /** Papillae (bump) color */
  papillaeColor: THREE.Color;
  /** Roughness (low for wet look) */
  roughness: number;
  /** Subsurface amount */
  subsurfaceAmount: number;
  /** Papillae density (0-1) */
  papillaeDensity: number;
  /** Wetness/clearcoat amount */
  wetness: number;
  /** Normal strength */
  normalStrength: number;
}

export type TongueParams = TongueMaterialConfig;
export type TonguePreset = 'human' | 'cat' | 'reptile' | 'dog' | 'cow';

/**
 * Pink/red wet muscle tissue material for tongues
 * Ported from infinigen/infinigen/assets/materials/creature/tongue.py
 */
export class TongueMaterial {
  private config: TongueMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<TongueMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.8, 0.06, 0.044),
      subsurfaceColor: new THREE.Color(0.8, 0.0, 0.27),
      papillaeColor: new THREE.Color(0.65, 0.04, 0.035),
      roughness: rng.nextFloat(0.3, 0.5),
      subsurfaceAmount: 0.15,
      papillaeDensity: rng.nextFloat(0.3, 0.7),
      wetness: rng.nextFloat(0.3, 0.7),
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
      clearcoat: this.config.wetness,
      clearcoatRoughness: 0.1,
      thickness: 1.0,
      attenuationColor: this.config.subsurfaceColor,
      attenuationDistance: 0.5 / Math.max(0.01, this.config.subsurfaceAmount),
      side: THREE.DoubleSide,
    });

    this.generateTongueTexture(material);
    this.generateNormalMap(material);

    return material;
  }

  private generateTongueTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // Musgrave-like texture for roughness variation
        const musgraveNoise = noise.fbm(x * 0.07, y * 0.07, 0, 4);
        const roughnessVariation = (musgraveNoise + 1) * 0.5;

        // Papillae pattern (taste buds)
        const papillaeFreq = 30 + this.config.papillaeDensity * 40;
        const papX = x * papillaeFreq / size;
        const papY = y * papillaeFreq / size;
        const cellX = Math.floor(papX);
        const cellY = Math.floor(papY);

        let minDist = Infinity;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx, ny);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 50, ny + 50);
            const dist = Math.sqrt((papX - fx) ** 2 + (papY - fy) ** 2);
            minDist = Math.min(minDist, dist);
          }
        }

        // Papillae darken the surface slightly
        const papFactor = Math.max(0, 1 - minDist * 2);

        // Color with variation
        const colorNoise = noise.perlin2D(x * 0.02, y * 0.02) * 0.08;
        const r = this.config.baseColor.r * (1 - papFactor * 0.2) + this.config.papillaeColor.r * papFactor * 0.2 + colorNoise + roughnessVariation * 0.05;
        const g = this.config.baseColor.g * (1 - papFactor * 0.2) + this.config.papillaeColor.g * papFactor * 0.2 + colorNoise;
        const b = this.config.baseColor.b * (1 - papFactor * 0.15) + this.config.papillaeColor.b * papFactor * 0.15 + colorNoise;

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

        // Papillae bump normal
        const papillaeFreq = 30 + this.config.papillaeDensity * 40;
        const papX = x * papillaeFreq / size;
        const papY = y * papillaeFreq / size;
        const cellX = Math.floor(papX);
        const cellY = Math.floor(papY);

        let minDist = Infinity;
        let closestDx = 0;
        let closestDy = 0;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx, ny);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 50, ny + 50);
            const dist = Math.sqrt((papX - fx) ** 2 + (papY - fy) ** 2);
            if (dist < minDist) {
              minDist = dist;
              closestDx = papX - fx;
              closestDy = papY - fy;
            }
          }
        }

        const nx = closestDx * 1.5;
        const ny = closestDy * 1.5;
        const nz = 1.0 - minDist * 0.3;

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
    material.normalMap = texture;
    material.normalScale = new THREE.Vector2(
      this.config.normalStrength,
      this.config.normalStrength
    );
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<TongueMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
    this.material.clearcoat = this.config.wetness;
  }

  static createPreset(preset: TonguePreset): TongueMaterial {
    switch (preset) {
      case 'human':
        return new TongueMaterial({
          baseColor: new THREE.Color(0.8, 0.06, 0.044),
          subsurfaceColor: new THREE.Color(0.8, 0.0, 0.27),
          roughness: 0.4,
          wetness: 0.5,
          papillaeDensity: 0.5,
        });
      case 'cat':
        return new TongueMaterial({
          baseColor: new THREE.Color(0.75, 0.08, 0.06),
          subsurfaceColor: new THREE.Color(0.75, 0.02, 0.2),
          roughness: 0.55,
          wetness: 0.4,
          papillaeDensity: 0.8,
        });
      case 'reptile':
        return new TongueMaterial({
          baseColor: new THREE.Color(0.7, 0.05, 0.03),
          subsurfaceColor: new THREE.Color(0.7, 0.0, 0.15),
          roughness: 0.5,
          wetness: 0.35,
          papillaeDensity: 0.3,
        });
      case 'dog':
        return new TongueMaterial({
          baseColor: new THREE.Color(0.75, 0.2, 0.15),
          subsurfaceColor: new THREE.Color(0.8, 0.1, 0.2),
          roughness: 0.45,
          wetness: 0.6,
          papillaeDensity: 0.6,
        });
      case 'cow':
        return new TongueMaterial({
          baseColor: new THREE.Color(0.6, 0.15, 0.1),
          subsurfaceColor: new THREE.Color(0.65, 0.05, 0.15),
          roughness: 0.5,
          wetness: 0.5,
          papillaeDensity: 0.7,
        });
      default:
        return new TongueMaterial();
    }
  }
}
