import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

/**
 * Configuration for smoke material properties
 * Based on infinigen's smoke.py — volumetric density shader, gray/black gradient
 */
export interface SmokeMaterialConfig {
  /** Base smoke color — gray tone */
  baseColor: THREE.Color;
  /** Dense smoke color — darker for thick regions */
  denseColor: THREE.Color;
  /** Volume density (controls opacity/thickness) */
  density: number;
  /** Surface roughness */
  roughness: number;
  /** Opacity (0-1) */
  opacity: number;
  /** Noise scale for smoke density variation */
  noiseScale: number;
  /** Noise detail (octaves) for smoke detail */
  noiseDetail: number;
  /** Turbulence strength for swirling patterns */
  turbulence: number;
  /** Anisotropy for light scattering direction */
  anisotropy: number;
}

export type SmokeParams = SmokeMaterialConfig;
export type SmokePreset = 'light' | 'dense' | 'campfire' | 'industrial' | 'steam';

/**
 * Smoke material — volumetric density with gray/black gradient
 * Ported from infinigen/infinigen/assets/materials/fluid/smoke.py
 *
 * The original uses:
 * - Principled Volume only (no surface shader)
 *   - Color: gray (~0.38, 0.38, 0.38) with random_color_neighbour variation
 *   - Density: uniform(1.0, 5.0)
 * - No surface BSDF — purely volume-based
 *
 * Since Three.js MeshPhysicalMaterial doesn't support volume rendering,
 * we approximate with a transparent surface using procedural noise for density
 */
export class SmokeMaterial {
  private config: SmokeMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<SmokeMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(
        rng.nextFloat(0.33, 0.43),
        rng.nextFloat(0.33, 0.43),
        rng.nextFloat(0.33, 0.43)
      ),
      denseColor: new THREE.Color(0.1, 0.1, 0.1),
      density: rng.nextFloat(1.0, 5.0),
      roughness: 1.0,
      opacity: 0.6,
      noiseScale: rng.nextFloat(2.0, 5.0),
      noiseDetail: rng.nextInt(4, 8),
      turbulence: rng.nextFloat(0.3, 0.8),
      anisotropy: 0.0,
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: 0.0,
      transparent: true,
      opacity: this.config.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.generateSmokeTexture(material);
    return material;
  }

  /**
   * Generate procedural smoke density texture
   * Approximates the volume density with surface noise patterns
   */
  private generateSmokeTexture(material: THREE.MeshPhysicalMaterial): void {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);
    const noise = new NoiseUtils();

    const normalizedDensity = Math.min(1, this.config.density / 5.0);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Layered noise for smoke density — approximating musgrave/principled volume
        let smokeValue = 0;
        let amplitude = 1.0;
        let frequency = this.config.noiseScale;
        let maxAmplitude = 0;

        for (let octave = 0; octave < this.config.noiseDetail; octave++) {
          smokeValue += noise.perlin2D(u * frequency, v * frequency) * amplitude;
          maxAmplitude += amplitude;
          amplitude *= 0.5;
          frequency *= 2.1;
        }
        smokeValue = smokeValue / maxAmplitude;

        // Add turbulence swirl
        const swirl = noise.perlin2D(
          u * this.config.noiseScale * 0.5 + smokeValue * this.config.turbulence,
          v * this.config.noiseScale * 0.5
        ) * 0.3;
        smokeValue += swirl;

        // Normalize to 0-1
        smokeValue = smokeValue * 0.5 + 0.5;
        smokeValue = Math.max(0, Math.min(1, smokeValue));

        // Apply density control
        const densityFactor = smokeValue * normalizedDensity;

        // Color: interpolate from dense (dark) to light smoke
        const colorFactor = Math.pow(densityFactor, 0.7);
        const r = this.config.denseColor.r * (1 - colorFactor) + this.config.baseColor.r * colorFactor;
        const g = this.config.denseColor.g * (1 - colorFactor) + this.config.baseColor.g * colorFactor;
        const b = this.config.denseColor.b * (1 - colorFactor) + this.config.baseColor.b * colorFactor;

        // Alpha: density-based transparency
        const alpha = Math.min(1, densityFactor * 1.5);

        imageData.data[index] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[index + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[index + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[index + 3] = Math.min(255, Math.max(0, Math.floor(alpha * 255)));
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);

    material.map = texture;
    material.alphaMap = texture;
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<SmokeMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.opacity = this.config.opacity;
  }

  static createPreset(preset: SmokePreset): SmokeMaterial {
    switch (preset) {
      case 'light':
        return new SmokeMaterial({
          baseColor: new THREE.Color(0.45, 0.45, 0.45),
          denseColor: new THREE.Color(0.2, 0.2, 0.2),
          density: 1.5,
          opacity: 0.35,
          noiseScale: 3.0,
          turbulence: 0.5,
        });
      case 'dense':
        return new SmokeMaterial({
          baseColor: new THREE.Color(0.30, 0.30, 0.30),
          denseColor: new THREE.Color(0.05, 0.05, 0.05),
          density: 4.5,
          opacity: 0.8,
          noiseScale: 2.5,
          turbulence: 0.3,
        });
      case 'campfire':
        return new SmokeMaterial({
          baseColor: new THREE.Color(0.40, 0.38, 0.35),
          denseColor: new THREE.Color(0.08, 0.06, 0.04),
          density: 3.0,
          opacity: 0.5,
          noiseScale: 4.0,
          turbulence: 0.7,
        });
      case 'industrial':
        return new SmokeMaterial({
          baseColor: new THREE.Color(0.35, 0.35, 0.37),
          denseColor: new THREE.Color(0.03, 0.03, 0.03),
          density: 5.0,
          opacity: 0.7,
          noiseScale: 2.0,
          turbulence: 0.4,
        });
      case 'steam':
        return new SmokeMaterial({
          baseColor: new THREE.Color(0.70, 0.70, 0.72),
          denseColor: new THREE.Color(0.4, 0.4, 0.42),
          density: 1.0,
          opacity: 0.25,
          noiseScale: 5.0,
          turbulence: 0.6,
        });
      default:
        return new SmokeMaterial();
    }
  }
}
