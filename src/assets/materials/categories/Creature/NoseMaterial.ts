import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for nose material properties
 * Soft wet nose material (like dog/cat nose)
 */
export interface NoseMaterialConfig {
  /** Base nose color */
  baseColor: THREE.Color;
  /** Nostril interior color */
  nostrilColor: THREE.Color;
  /** Subsurface scattering color */
  subsurfaceColor: THREE.Color;
  /** Surface texture scale (for the bumpy nose texture) */
  textureScale: number;
  /** Roughness (low for wet look) */
  roughness: number;
  /** Subsurface scattering amount */
  subsurfaceAmount: number;
  /** Wetness/clearcoat amount */
  wetness: number;
  /** Normal strength for bump detail */
  normalStrength: number;
}

export type NoseParams = NoseMaterialConfig;
export type NosePreset = 'dog' | 'cat' | 'bear' | 'pig' | 'human';

/**
 * Soft wet nose material with bumpy texture
 * Inspired by common mammalian nose textures
 */
export class NoseMaterial {
  private config: NoseMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<NoseMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.15, 0.1, 0.1),
      nostrilColor: new THREE.Color(0.05, 0.03, 0.03),
      subsurfaceColor: new THREE.Color(0.5, 0.15, 0.15),
      textureScale: rng.nextFloat(20, 40),
      roughness: rng.nextFloat(0.2, 0.4),
      subsurfaceAmount: 0.1,
      wetness: rng.nextFloat(0.5, 0.9),
      normalStrength: rng.nextFloat(0.4, 0.8),
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
      clearcoatRoughness: 0.05,
      thickness: 0.5,
      attenuationColor: this.config.subsurfaceColor,
      attenuationDistance: 0.5 / Math.max(0.01, this.config.subsurfaceAmount),
      side: THREE.DoubleSide,
    });

    this.generateNoseTexture(material);
    this.generateNormalMap(material);

    return material;
  }

  private generateNoseTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // Bumpy nose texture using Voronoi
        const texU = u * this.config.textureScale;
        const texV = v * this.config.textureScale;

        const cellX = Math.floor(texU);
        const cellY = Math.floor(texV);

        let minDist = Infinity;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx, ny);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 50, ny + 50);
            const dist = Math.sqrt((texU - fx) ** 2 + (texV - fy) ** 2);
            minDist = Math.min(minDist, dist);
          }
        }

        // Color variation based on texture
        const bumpFactor = Math.max(0, 1 - minDist * 2);
        const colorNoise = noise.perlin2D(x * 0.02, y * 0.02) * 0.05;

        // Darker at texture boundaries
        const boundaryFactor = 1 - bumpFactor;

        const r = this.config.baseColor.r * (1 - boundaryFactor * 0.3) + this.config.nostrilColor.r * boundaryFactor * 0.3 + colorNoise;
        const g = this.config.baseColor.g * (1 - boundaryFactor * 0.3) + this.config.nostrilColor.g * boundaryFactor * 0.3 + colorNoise;
        const b = this.config.baseColor.b * (1 - boundaryFactor * 0.3) + this.config.nostrilColor.b * boundaryFactor * 0.3 + colorNoise;

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

        const texU = u * this.config.textureScale;
        const texV = v * this.config.textureScale;

        const cellX = Math.floor(texU);
        const cellY = Math.floor(texV);

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
            const dist = Math.sqrt((texU - fx) ** 2 + (texV - fy) ** 2);
            if (dist < minDist) {
              minDist = dist;
              closestDx = texU - fx;
              closestDy = texV - fy;
            }
          }
        }

        // Bumpy normal from voronoi cells
        const nx = closestDx * 2;
        const ny = closestDy * 2;
        const nz = 1.0 - minDist * 0.5;

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

  updateConfig(config: Partial<NoseMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
    this.material.clearcoat = this.config.wetness;
  }

  static createPreset(preset: NosePreset): NoseMaterial {
    switch (preset) {
      case 'dog':
        return new NoseMaterial({
          baseColor: new THREE.Color(0.15, 0.1, 0.1),
          subsurfaceColor: new THREE.Color(0.5, 0.15, 0.15),
          roughness: 0.25,
          wetness: 0.8,
          textureScale: 30,
        });
      case 'cat':
        return new NoseMaterial({
          baseColor: new THREE.Color(0.2, 0.13, 0.12),
          subsurfaceColor: new THREE.Color(0.55, 0.2, 0.2),
          roughness: 0.3,
          wetness: 0.7,
          textureScale: 25,
        });
      case 'bear':
        return new NoseMaterial({
          baseColor: new THREE.Color(0.18, 0.12, 0.1),
          subsurfaceColor: new THREE.Color(0.45, 0.15, 0.12),
          roughness: 0.35,
          wetness: 0.6,
          textureScale: 20,
        });
      case 'pig':
        return new NoseMaterial({
          baseColor: new THREE.Color(0.55, 0.3, 0.3),
          subsurfaceColor: new THREE.Color(0.7, 0.4, 0.4),
          roughness: 0.3,
          wetness: 0.6,
          textureScale: 35,
        });
      case 'human':
        return new NoseMaterial({
          baseColor: new THREE.Color(0.65, 0.4, 0.35),
          subsurfaceColor: new THREE.Color(0.8, 0.3, 0.25),
          roughness: 0.45,
          wetness: 0.2,
          textureScale: 40,
          subsurfaceAmount: 0.2,
        });
      default:
        return new NoseMaterial();
    }
  }
}
