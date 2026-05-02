import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

/**
 * Configuration for reptile material properties
 * Based on infinigen's reptile_brown_circle.py — brown circle/geometric pattern
 */
export interface ReptileMaterialConfig {
  /** Base skin color */
  baseColor: THREE.Color;
  /** Scale/patch color */
  patchColor: THREE.Color;
  /** Dark edge color between scales */
  edgeColor: THREE.Color;
  /** Belly/lighter region color */
  bellyColor: THREE.Color;
  /** Scale pattern frequency */
  scaleFrequency: number;
  /** Patch size (0-1) */
  patchSize: number;
  /** Roughness */
  roughness: number;
  /** Normal strength for scale detail */
  normalStrength: number;
  /** Voronoi edge thickness */
  edgeThickness: number;
}

export type ReptileParams = ReptileMaterialConfig;
export type ReptilePreset = 'gecko' | 'iguana' | 'chameleon' | 'alligator' | 'komodo';

/**
 * Reptile material with brown circle/geometric Voronoi pattern
 * Ported from infinigen/infinigen/assets/materials/creature/reptile_brown_circle.py
 */
export class ReptileMaterial {
  private config: ReptileMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<ReptileMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.45, 0.3, 0.15),
      patchColor: new THREE.Color(0.55, 0.4, 0.2),
      edgeColor: new THREE.Color(0.08, 0.05, 0.02),
      bellyColor: new THREE.Color(0.65, 0.5, 0.3),
      scaleFrequency: rng.nextFloat(30, 60),
      patchSize: rng.nextFloat(0.04, 0.08),
      roughness: rng.nextFloat(0.4, 0.6),
      normalStrength: rng.nextFloat(0.6, 1.2),
      edgeThickness: rng.nextFloat(0.02, 0.05),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
      side: THREE.DoubleSide,
    });

    this.generateScaleTexture(material);
    this.generateNormalMap(material);

    return material;
  }

  private generateScaleTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // Voronoi-based scale pattern
        const scaleU = u * this.config.scaleFrequency;
        const scaleV = v * this.config.scaleFrequency;

        // Calculate distance to nearest cell center
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
            const fy = ny + noise.seededRandom(nx + 100, ny + 100);
            const dist = Math.sqrt((scaleU - fx) ** 2 + (scaleV - fy) ** 2);
            if (dist < minDist) {
              secondMinDist = minDist;
              minDist = dist;
            } else if (dist < secondMinDist) {
              secondMinDist = dist;
            }
          }
        }

        // Edge detection from Voronoi
        const edgeDist = secondMinDist - minDist;
        const isEdge = edgeDist < this.config.edgeThickness;
        const isPatch = minDist < this.config.patchSize;

        // Color determination
        const colorNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.1;
        const highFreqNoise = noise.perlin2D(x * 0.08, y * 0.08) * 0.05;

        let r: number, g: number, b: number;

        if (isEdge) {
          r = this.config.edgeColor.r;
          g = this.config.edgeColor.g;
          b = this.config.edgeColor.b;
        } else if (isPatch) {
          // Dark circular patches
          r = this.config.patchColor.r * 0.6 + colorNoise;
          g = this.config.patchColor.g * 0.6 + colorNoise;
          b = this.config.patchColor.b * 0.6 + colorNoise;
        } else {
          // Base scale color with dorsal-ventral gradient
          const dvBlend = Math.max(0, Math.min(1, (v - 0.5) * 2));
          r = this.config.baseColor.r * (1 - dvBlend * 0.3) + this.config.bellyColor.r * dvBlend * 0.3 + colorNoise + highFreqNoise;
          g = this.config.baseColor.g * (1 - dvBlend * 0.3) + this.config.bellyColor.g * dvBlend * 0.3 + colorNoise + highFreqNoise;
          b = this.config.baseColor.b * (1 - dvBlend * 0.3) + this.config.bellyColor.b * dvBlend * 0.3 + colorNoise + highFreqNoise;
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
    const noise = new NoiseUtils();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        const scaleU = u * this.config.scaleFrequency;
        const scaleV = v * this.config.scaleFrequency;

        const cellX = Math.floor(scaleU);
        const cellY = Math.floor(scaleV);

        let minDist = Infinity;
        let closestX = 0;
        let closestY = 0;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx, ny);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 100, ny + 100);
            const dist = Math.sqrt((scaleU - fx) ** 2 + (scaleV - fy) ** 2);
            if (dist < minDist) {
              minDist = dist;
              closestX = scaleU - fx;
              closestY = scaleV - fy;
            }
          }
        }

        const nx = closestX * 2;
        const ny = closestY * 2;
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

  updateConfig(config: Partial<ReptileMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.roughness = this.config.roughness;
  }

  static createPreset(preset: ReptilePreset): ReptileMaterial {
    switch (preset) {
      case 'gecko':
        return new ReptileMaterial({
          baseColor: new THREE.Color(0.45, 0.4, 0.25),
          patchColor: new THREE.Color(0.3, 0.35, 0.15),
          scaleFrequency: 40,
          roughness: 0.45,
        });
      case 'iguana':
        return new ReptileMaterial({
          baseColor: new THREE.Color(0.3, 0.4, 0.15),
          patchColor: new THREE.Color(0.45, 0.5, 0.2),
          bellyColor: new THREE.Color(0.55, 0.55, 0.2),
          scaleFrequency: 35,
          roughness: 0.5,
        });
      case 'chameleon':
        return new ReptileMaterial({
          baseColor: new THREE.Color(0.3, 0.5, 0.2),
          patchColor: new THREE.Color(0.6, 0.3, 0.1),
          bellyColor: new THREE.Color(0.5, 0.6, 0.25),
          scaleFrequency: 50,
          roughness: 0.4,
        });
      case 'alligator':
        return new ReptileMaterial({
          baseColor: new THREE.Color(0.2, 0.22, 0.12),
          patchColor: new THREE.Color(0.15, 0.18, 0.1),
          edgeColor: new THREE.Color(0.05, 0.05, 0.02),
          scaleFrequency: 25,
          roughness: 0.6,
          normalStrength: 1.0,
        });
      case 'komodo':
        return new ReptileMaterial({
          baseColor: new THREE.Color(0.35, 0.3, 0.15),
          patchColor: new THREE.Color(0.25, 0.2, 0.1),
          scaleFrequency: 30,
          roughness: 0.55,
        });
      default:
        return new ReptileMaterial();
    }
  }
}
