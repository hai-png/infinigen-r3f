import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

/**
 * Configuration for river water material properties
 * Based on infinigen's river_water.py — freshwater with green tint, depth scattering, sediment
 */
export interface RiverWaterMaterialConfig {
  /** Surface color — shallow water tint */
  baseColor: THREE.Color;
  /** Deep water color — dark green-brown at depth */
  deepColor: THREE.Color;
  /** Sediment color — muddy brown particles */
  sedimentColor: THREE.Color;
  /** Surface transparency (0-1) */
  transparency: number;
  /** Surface roughness */
  roughness: number;
  /** Metalness */
  metalness: number;
  /** Index of refraction */
  ior: number;
  /** Wave height multiplier */
  waveHeight: number;
  /** Flow speed */
  flowSpeed: number;
  /** Depth scattering density */
  scatterDensity: number;
  /** Sediment amount (0-1) */
  sedimentAmount: number;
}

export type RiverWaterParams = RiverWaterMaterialConfig;
export type RiverWaterPreset = 'mountain' | 'meadow' | 'swamp' | 'glacial' | 'tropical';

/**
 * River water material with green tint, depth-based color ramp, and sediment
 * Ported from infinigen/infinigen/assets/materials/fluid/river_water.py
 *
 * The original uses:
 * - PrincipledBSDF with full transmission, IOR 1.33, roughness 0
 * - Mix with TransparentBSDF for camera ray trick
 * - Volume scatter with depth-based color ramp (brown→dark green→black)
 * - Principled volume with blue tint and musgrave noise density
 * - Volume absorption
 */
export class RiverWaterMaterial {
  private config: RiverWaterMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;
  private time: number = 0;

  constructor(config?: Partial<RiverWaterMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(0.03, 0.27, 0.67),
      deepColor: new THREE.Color(0.05, 0.09, 0.03),
      sedimentColor: new THREE.Color(0.20, 0.18, 0.05),
      transparency: 0.85,
      roughness: 0.0,
      metalness: 0.0,
      ior: 1.33,
      waveHeight: rng.nextFloat(0.08, 0.2),
      flowSpeed: rng.nextFloat(0.8, 1.5),
      scatterDensity: rng.nextFloat(3.0, 8.0),
      sedimentAmount: rng.nextFloat(0.2, 0.6),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: this.config.metalness,
      transmission: this.config.transparency,
      thickness: 2.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      ior: this.config.ior,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });

    this.generateRiverSurface(material);
    return material;
  }

  /**
   * Generate the procedural surface texture simulating river water
   * with depth-based color ramp (brown shallow → green mid → dark deep)
   * matching the original's colorramp with B_SPLINE interpolation
   */
  private generateRiverSurface(material: THREE.MeshPhysicalMaterial): void {
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

        // Simulate depth-based color ramp from the original shader
        // Position Y maps to depth: shallow at top, deep at bottom
        const depth = v;

        // Color ramp stops matching original:
        // 0.0: brown/sediment (0.20, 0.18, 0.05)
        // 0.35: dark olive green (0.13, 0.14, 0.06)
        // 0.68: deep green (0.06, 0.09, 0.03)
        // 1.0: near black (0.03, 0.01, 0.00)
        const rampColor = this.sampleDepthRamp(depth);

        // Musgrave-like noise for surface variation
        const surfaceNoise = noise.perlin2D(u * 11.64, v * 11.64) * 0.15;

        // Sediment particles in shallow areas
        const sedimentNoise = noise.perlin2D(u * 20, v * 20) * 0.5 + 0.5;
        const sedimentFactor = (1 - depth) * this.config.sedimentAmount * sedimentNoise;

        const r = rampColor.r * (1 - sedimentFactor) + this.config.sedimentColor.r * sedimentFactor + surfaceNoise;
        const g = rampColor.g * (1 - sedimentFactor) + this.config.sedimentColor.g * sedimentFactor + surfaceNoise;
        const b = rampColor.b * (1 - sedimentFactor) + this.config.sedimentColor.b * sedimentFactor + surfaceNoise;

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
    texture.repeat.set(4, 4);

    material.map = texture;
  }

  /**
   * Sample the depth-based color ramp with B-spline-like smooth interpolation
   * Matching the original 4-stop color ramp
   */
  private sampleDepthRamp(depth: number): THREE.Color {
    const stops = [
      { pos: 0.0, color: new THREE.Color(0.198, 0.184, 0.051) },
      { pos: 0.35, color: new THREE.Color(0.128, 0.138, 0.062) },
      { pos: 0.68, color: new THREE.Color(0.056, 0.090, 0.035) },
      { pos: 1.0, color: new THREE.Color(0.026, 0.012, 0.000) },
    ];

    const t = Math.max(0, Math.min(1, depth));

    // Find the two surrounding stops
    let lower = stops[0];
    let upper = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].pos && t <= stops[i + 1].pos) {
        lower = stops[i];
        upper = stops[i + 1];
        break;
      }
    }

    const range = upper.pos - lower.pos;
    const localT = range > 0 ? (t - lower.pos) / range : 0;

    // Smoothstep for B-spline-like interpolation
    const smoothT = localT * localT * (3 - 2 * localT);

    return new THREE.Color().lerpColors(lower.color, upper.color, smoothT);
  }

  update(deltaTime: number): void {
    this.time += deltaTime * this.config.flowSpeed;
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<RiverWaterMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    this.material.transmission = this.config.transparency;
    this.material.roughness = this.config.roughness;
    this.material.ior = this.config.ior;
  }

  static createPreset(preset: RiverWaterPreset): RiverWaterMaterial {
    switch (preset) {
      case 'mountain':
        return new RiverWaterMaterial({
          baseColor: new THREE.Color(0.04, 0.30, 0.70),
          deepColor: new THREE.Color(0.03, 0.06, 0.02),
          sedimentColor: new THREE.Color(0.15, 0.14, 0.04),
          transparency: 0.9,
          waveHeight: 0.15,
          flowSpeed: 1.4,
          scatterDensity: 4.0,
          sedimentAmount: 0.2,
        });
      case 'meadow':
        return new RiverWaterMaterial({
          baseColor: new THREE.Color(0.03, 0.25, 0.65),
          deepColor: new THREE.Color(0.06, 0.10, 0.04),
          sedimentColor: new THREE.Color(0.22, 0.20, 0.06),
          transparency: 0.8,
          waveHeight: 0.1,
          flowSpeed: 0.9,
          scatterDensity: 6.0,
          sedimentAmount: 0.5,
        });
      case 'swamp':
        return new RiverWaterMaterial({
          baseColor: new THREE.Color(0.02, 0.18, 0.35),
          deepColor: new THREE.Color(0.04, 0.06, 0.02),
          sedimentColor: new THREE.Color(0.25, 0.22, 0.08),
          transparency: 0.5,
          roughness: 0.15,
          waveHeight: 0.05,
          flowSpeed: 0.3,
          scatterDensity: 8.0,
          sedimentAmount: 0.7,
        });
      case 'glacial':
        return new RiverWaterMaterial({
          baseColor: new THREE.Color(0.15, 0.45, 0.75),
          deepColor: new THREE.Color(0.03, 0.08, 0.05),
          sedimentColor: new THREE.Color(0.30, 0.32, 0.28),
          transparency: 0.92,
          waveHeight: 0.12,
          flowSpeed: 1.0,
          scatterDensity: 3.0,
          sedimentAmount: 0.4,
        });
      case 'tropical':
        return new RiverWaterMaterial({
          baseColor: new THREE.Color(0.05, 0.35, 0.72),
          deepColor: new THREE.Color(0.02, 0.12, 0.05),
          sedimentColor: new THREE.Color(0.18, 0.16, 0.05),
          transparency: 0.85,
          waveHeight: 0.08,
          flowSpeed: 0.6,
          scatterDensity: 5.0,
          sedimentAmount: 0.3,
        });
      default:
        return new RiverWaterMaterial();
    }
  }
}
