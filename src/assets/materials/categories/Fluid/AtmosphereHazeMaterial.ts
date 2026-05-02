import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

/**
 * Configuration for atmosphere haze material properties
 * Based on infinigen's atmosphere_light_haze.py — volume scatter for aerial perspective, light blue
 */
export interface AtmosphereHazeMaterialConfig {
  /** Haze color — light blue for atmospheric scattering */
  baseColor: THREE.Color;
  /** Deep haze color — where density is highest */
  deepColor: THREE.Color;
  /** Volume density (very low for atmosphere — 0 to 0.006 in original) */
  density: number;
  /** Surface roughness */
  roughness: number;
  /** Opacity (0-1) — very low for haze */
  opacity: number;
  /** Anisotropy for light scattering direction (0-1) */
  anisotropy: number;
  /** Noise scale for density variation */
  noiseScale: number;
  /** Height falloff — how quickly haze thins with altitude */
  heightFalloff: number;
  /** Maximum haze height (0-1 normalized) */
  maxHeight: number;
}

export type AtmosphereHazeParams = AtmosphereHazeMaterialConfig;
export type AtmosphereHazePreset = 'morning' | 'overcast' | 'dusk' | 'mountain' | 'coastal';

/**
 * Atmosphere haze material — volume scatter for aerial perspective, light blue tint
 * Ported from infinigen/infinigen/assets/materials/fluid/atmosphere_light_haze.py
 *
 * The original uses:
 * - Principled Volume only (no surface shader, type=None)
 *   - Color: from colors.fog_hsv() — typically light blue/gray
 *   - Density: uniform(0, 0.006) — very low for subtle atmospheric effect
 *   - Anisotropy: 0.5 — forward-scattering for aerial perspective
 * - enable_scatter flag (default True)
 *
 * Since Three.js MeshPhysicalMaterial doesn't support true volume rendering,
 * we approximate with a highly transparent surface using height-based falloff
 */
export class AtmosphereHazeMaterial {
  private config: AtmosphereHazeMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<AtmosphereHazeMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(
        rng.nextFloat(0.55, 0.75),
        rng.nextFloat(0.65, 0.82),
        rng.nextFloat(0.80, 0.95)
      ),
      deepColor: new THREE.Color(0.4, 0.5, 0.65),
      density: rng.nextFloat(0.002, 0.006),
      roughness: 1.0,
      opacity: 0.15,
      anisotropy: 0.5,
      noiseScale: rng.nextFloat(1.0, 3.0),
      heightFalloff: rng.nextFloat(2.0, 5.0),
      maxHeight: rng.nextFloat(0.6, 1.0),
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

    this.generateHazeTexture(material);
    return material;
  }

  /**
   * Generate procedural atmosphere haze texture
   * Height-based density falloff with noise variation
   * Simulates the volume scatter with aerial perspective
   */
  private generateHazeTexture(material: THREE.MeshPhysicalMaterial): void {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imageData = ctx.createImageData(size, size);
    const noise = new NoiseUtils();

    // Normalize density to visual range (original 0-0.006 is very low)
    const visualDensity = Math.min(1, this.config.density * 100);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Height-based falloff — haze is denser at lower altitudes
        // v=0 is top (high altitude), v=1 is bottom (low altitude)
        const height = 1 - v;
        const heightFactor = Math.pow(Math.max(0, 1 - height / this.config.maxHeight), this.config.heightFalloff);

        // Soft noise variation for natural look
        const noiseValue = noise.perlin2D(u * this.config.noiseScale, v * this.config.noiseScale) * 0.2;
        const densityVariation = heightFactor + noiseValue * heightFactor;

        // Anisotropy approximation — brighter in forward-scattering direction
        // Simulate by adding slight brightness variation
        const anisotropyFactor = 1.0 + noise.perlin2D(u * 2, v * 2) * this.config.anisotropy * 0.1;

        // Final haze density
        const hazeDensity = Math.max(0, Math.min(1, densityVariation * visualDensity * anisotropyFactor));

        // Color: blend between deep and light haze based on density
        const colorBlend = Math.pow(hazeDensity, 0.5);
        const r = this.config.deepColor.r * (1 - colorBlend) + this.config.baseColor.r * colorBlend;
        const g = this.config.deepColor.g * (1 - colorBlend) + this.config.baseColor.g * colorBlend;
        const b = this.config.deepColor.b * (1 - colorBlend) + this.config.baseColor.b * colorBlend;

        imageData.data[index] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[index + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[index + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[index + 3] = Math.min(255, Math.max(0, Math.floor(hazeDensity * 255)));
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(3, 1);

    material.map = texture;
    material.alphaMap = texture;
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<AtmosphereHazeMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.opacity = this.config.opacity;
  }

  static createPreset(preset: AtmosphereHazePreset): AtmosphereHazeMaterial {
    switch (preset) {
      case 'morning':
        return new AtmosphereHazeMaterial({
          baseColor: new THREE.Color(0.72, 0.78, 0.92),
          deepColor: new THREE.Color(0.55, 0.60, 0.75),
          density: 0.004,
          opacity: 0.2,
          anisotropy: 0.6,
          heightFalloff: 3.0,
          maxHeight: 0.8,
        });
      case 'overcast':
        return new AtmosphereHazeMaterial({
          baseColor: new THREE.Color(0.65, 0.68, 0.72),
          deepColor: new THREE.Color(0.45, 0.48, 0.52),
          density: 0.005,
          opacity: 0.25,
          anisotropy: 0.4,
          heightFalloff: 2.5,
          maxHeight: 0.9,
        });
      case 'dusk':
        return new AtmosphereHazeMaterial({
          baseColor: new THREE.Color(0.75, 0.65, 0.55),
          deepColor: new THREE.Color(0.50, 0.38, 0.28),
          density: 0.003,
          opacity: 0.18,
          anisotropy: 0.5,
          heightFalloff: 3.5,
          maxHeight: 0.7,
        });
      case 'mountain':
        return new AtmosphereHazeMaterial({
          baseColor: new THREE.Color(0.60, 0.72, 0.85),
          deepColor: new THREE.Color(0.35, 0.45, 0.60),
          density: 0.006,
          opacity: 0.22,
          anisotropy: 0.55,
          heightFalloff: 4.0,
          maxHeight: 0.65,
        });
      case 'coastal':
        return new AtmosphereHazeMaterial({
          baseColor: new THREE.Color(0.68, 0.80, 0.90),
          deepColor: new THREE.Color(0.40, 0.55, 0.68),
          density: 0.003,
          opacity: 0.15,
          anisotropy: 0.5,
          heightFalloff: 2.0,
          maxHeight: 0.85,
        });
      default:
        return new AtmosphereHazeMaterial();
    }
  }
}
