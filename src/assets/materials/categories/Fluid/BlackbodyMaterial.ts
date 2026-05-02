import { createCanvas } from '../../../utils/CanvasUtils';
import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

/**
 * Configuration for blackbody material properties
 * Based on infinigen's blackbody.py — emissive gas for fire/lava glow, temperature-based color
 */
export interface BlackbodyMaterialConfig {
  /** Base color — dark gray for volume */
  baseColor: THREE.Color;
  /** Emissive color at low temperature (deep red) */
  lowTempColor: THREE.Color;
  /** Emissive color at mid temperature (orange-yellow) */
  midTempColor: THREE.Color;
  /** Emissive color at high temperature (bright white-yellow) */
  highTempColor: THREE.Color;
  /** Temperature (controls emissive color, 1000-15000K) */
  temperature: number;
  /** Blackbody intensity multiplier */
  intensity: number;
  /** Volume density */
  density: number;
  /** Surface roughness */
  roughness: number;
  /** Noise scale for temperature variation */
  noiseScale: number;
  /** Flame sharpness — controls width of the bright band */
  flameSharpness: number;
}

export type BlackbodyParams = BlackbodyMaterialConfig;
export type BlackbodyPreset = 'candle' | 'campfire' | 'forge' | 'eruption' | 'plasma';

/**
 * Blackbody material — emissive gas with temperature-based color for fire/lava glow
 * Ported from infinigen/infinigen/assets/materials/fluid/blackbody.py
 *
 * The original uses:
 * - Volume Info node → ColorRamp for flame (black → white → black band)
 * - Volume Info → ColorRamp for density (white → black)
 * - Multiply flame * density, then * ~8627 intensity
 * - Principled Volume with:
 *   - Color: gray (~0.36, 0.36, 0.36) with random variation
 *   - Density: ~15
 *   - Blackbody Intensity: from multiplied value
 *
 * Since Three.js doesn't have blackbody intensity on MeshPhysicalMaterial,
 * we use emissive color mapped from temperature to approximate the effect
 */
export class BlackbodyMaterial {
  private config: BlackbodyMaterialConfig;
  private material: THREE.MeshPhysicalMaterial;

  constructor(config?: Partial<BlackbodyMaterialConfig>, seed: number = 42) {
    const rng = new SeededRandom(seed);
    this.config = {
      baseColor: new THREE.Color(
        rng.nextFloat(0.26, 0.46),
        rng.nextFloat(0.26, 0.46),
        rng.nextFloat(0.26, 0.46)
      ),
      lowTempColor: new THREE.Color(0.8, 0.1, 0.0),
      midTempColor: new THREE.Color(1.0, 0.6, 0.1),
      highTempColor: new THREE.Color(1.0, 0.95, 0.8),
      temperature: rng.nextFloat(2000, 6000),
      intensity: rng.nextFloat(6000, 10000),
      density: rng.nextFloat(12, 18),
      roughness: 1.0,
      noiseScale: rng.nextFloat(2.0, 5.0),
      flameSharpness: rng.nextFloat(0.2, 0.4),
      ...config,
    };

    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshPhysicalMaterial {
    // Get temperature-based emissive color
    const emissiveColor = this.getTemperatureColor(this.config.temperature);

    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.baseColor,
      emissive: emissiveColor,
      emissiveIntensity: this.config.intensity / 10000,
      roughness: this.config.roughness,
      metalness: 0.0,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });

    this.generateFlameTexture(material);
    return material;
  }

  /**
   * Convert temperature (Kelvin) to approximate blackbody color
   * Using Planck's law approximation for visible spectrum
   */
  private getTemperatureColor(tempK: number): THREE.Color {
    // Simplified blackbody color approximation
    const t = tempK / 100;
    let r: number, g: number, b: number;

    // Red channel
    if (t <= 66) {
      r = 255;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    }

    // Green channel
    if (t <= 66) {
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
    } else {
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    }

    // Blue channel
    if (t >= 66) {
      b = 255;
    } else if (t <= 19) {
      b = 0;
    } else {
      b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    }

    r = Math.max(0, Math.min(255, r)) / 255;
    g = Math.max(0, Math.min(255, g)) / 255;
    b = Math.max(0, Math.min(255, b)) / 255;

    return new THREE.Color(r, g, b);
  }

  /**
   * Generate procedural flame/temperature texture
   * Approximates the original's volume info → colorramp → multiply pipeline
   */
  private generateFlameTexture(material: THREE.MeshPhysicalMaterial): void {
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

        // "Flame" — narrow bright band from noise
        // Original: colorramp with black→white→black at positions 0.25/0.28/0.59
        const flameNoise = noise.perlin2D(u * this.config.noiseScale, v * this.config.noiseScale);
        const flameNormalized = flameNoise * 0.5 + 0.5;
        const flame = this.sampleFlameRamp(flameNormalized);

        // "Density" — fades from white to black
        // Original: colorramp at positions 0.36/0.64
        const densityNoise = noise.perlin2D(
          u * this.config.noiseScale * 1.5 + 100,
          v * this.config.noiseScale * 1.5 + 100
        );
        const densityNormalized = densityNoise * 0.5 + 0.5;
        const densityMask = this.sampleDensityRamp(densityNormalized);

        // Height-based falloff — flame is stronger at bottom
        const heightFactor = Math.pow(1 - v, 1.5);

        // Multiply flame * density * height (matching original's multiply nodes)
        const combinedValue = flame * densityMask * heightFactor;

        // Map to temperature-based color
        const localTemp = this.config.temperature * (0.5 + combinedValue * 0.8);
        const tempColor = this.getTemperatureColor(localTemp);

        // Intensity scaling
        const intensity = Math.pow(combinedValue, 0.8) * this.config.intensity / 10000;

        const r = tempColor.r * intensity;
        const g = tempColor.g * intensity;
        const b = tempColor.b * intensity;

        imageData.data[index] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[index + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[index + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[index + 3] = Math.min(255, Math.max(0, Math.floor((0.3 + combinedValue * 0.7) * 255)));
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);

    material.emissiveMap = texture;
  }

  /**
   * Sample the flame color ramp
   * Original: black(0.25) → white(0.28) → black(0.59)
   * Creates a narrow bright band simulating the flame front
   */
  private sampleFlameRamp(value: number): number {
    const t = Math.max(0, Math.min(1, value));
    const pos1 = 0.25; // black
    const pos2 = 0.28; // white peak
    const pos3 = 0.59; // black

    if (t < pos1) return 0;
    if (t < pos2) {
      const localT = (t - pos1) / (pos2 - pos1);
      return localT; // rise quickly
    }
    if (t < pos3) {
      const localT = (t - pos2) / (pos3 - pos2);
      return 1 - localT; // fall slowly
    }
    return 0;
  }

  /**
   * Sample the density color ramp
   * Original: white(0.36) → black(0.64)
   */
  private sampleDensityRamp(value: number): number {
    const t = Math.max(0, Math.min(1, value));
    const pos1 = 0.36; // white
    const pos2 = 0.64; // black

    if (t <= pos1) return 1;
    if (t >= pos2) return 0;

    const localT = (t - pos1) / (pos2 - pos1);
    return 1 - localT;
  }

  getMaterial(): THREE.MeshPhysicalMaterial {
    return this.material;
  }

  updateConfig(config: Partial<BlackbodyMaterialConfig>): void {
    this.config = { ...this.config, ...config };
    this.material.color.set(this.config.baseColor);
    const emissiveColor = this.getTemperatureColor(this.config.temperature);
    this.material.emissive = emissiveColor;
    this.material.emissiveIntensity = this.config.intensity / 10000;
  }

  static createPreset(preset: BlackbodyPreset): BlackbodyMaterial {
    switch (preset) {
      case 'candle':
        return new BlackbodyMaterial({
          temperature: 1800,
          intensity: 4000,
          density: 14,
          baseColor: new THREE.Color(0.36, 0.36, 0.36),
          lowTempColor: new THREE.Color(0.9, 0.2, 0.0),
          midTempColor: new THREE.Color(1.0, 0.7, 0.2),
          highTempColor: new THREE.Color(1.0, 0.9, 0.6),
          noiseScale: 3.0,
          flameSharpness: 0.3,
        });
      case 'campfire':
        return new BlackbodyMaterial({
          temperature: 2500,
          intensity: 7000,
          density: 15,
          baseColor: new THREE.Color(0.35, 0.35, 0.35),
          lowTempColor: new THREE.Color(0.8, 0.1, 0.0),
          midTempColor: new THREE.Color(1.0, 0.55, 0.1),
          highTempColor: new THREE.Color(1.0, 0.9, 0.7),
          noiseScale: 3.3,
          flameSharpness: 0.25,
        });
      case 'forge':
        return new BlackbodyMaterial({
          temperature: 4500,
          intensity: 9000,
          density: 16,
          baseColor: new THREE.Color(0.38, 0.36, 0.34),
          lowTempColor: new THREE.Color(0.9, 0.15, 0.0),
          midTempColor: new THREE.Color(1.0, 0.65, 0.15),
          highTempColor: new THREE.Color(1.0, 0.95, 0.85),
          noiseScale: 2.5,
          flameSharpness: 0.35,
        });
      case 'eruption':
        return new BlackbodyMaterial({
          temperature: 6000,
          intensity: 10000,
          density: 18,
          baseColor: new THREE.Color(0.40, 0.38, 0.36),
          lowTempColor: new THREE.Color(0.85, 0.1, 0.0),
          midTempColor: new THREE.Color(1.0, 0.5, 0.05),
          highTempColor: new THREE.Color(1.0, 1.0, 0.9),
          noiseScale: 4.0,
          flameSharpness: 0.2,
        });
      case 'plasma':
        return new BlackbodyMaterial({
          temperature: 12000,
          intensity: 8500,
          density: 13,
          baseColor: new THREE.Color(0.30, 0.30, 0.40),
          lowTempColor: new THREE.Color(0.3, 0.1, 0.8),
          midTempColor: new THREE.Color(0.5, 0.3, 1.0),
          highTempColor: new THREE.Color(0.9, 0.85, 1.0),
          noiseScale: 5.0,
          flameSharpness: 0.4,
        });
      default:
        return new BlackbodyMaterial();
    }
  }
}
