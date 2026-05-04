/**
 * WhitewaterShader — Per-Type Shader Pipeline for whitewater/foam
 *
 * Ports the original Infinigen's whitewater material with:
 * - White base color with slight blue SSS tint
 * - Low specular (IOR 1.1)
 * - High roughness (0.15)
 * - Transmission weight (0.5) for semi-transparency
 * - Volume scattering with slight blue color and forward anisotropy
 * - Uses THREE.MeshPhysicalMaterial with transmission, thickness, and SSS
 *
 * Phase 2, Item 2: Per-Type Shader Pipelines
 *
 * @module assets/materials/fluid
 */

import * as THREE from 'three';
import { createCanvas } from '../../utils/CanvasUtils';
import { NoiseUtils } from '../../../core/util/math/noise';
import { SeededRandom } from '../../../core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/** Whitewater shader configuration */
export interface WhitewaterShaderConfig {
  /** Surface color — bright white for bubble-filled water */
  baseColor: THREE.Color;
  /** Subsurface scattering color — purplish tint from bubble scattering */
  subsurfaceColor: THREE.Color;
  /** Volume scatter color — light purple-white */
  scatterColor: THREE.Color;
  /** Surface transparency (0-1) */
  transmission: number;
  /** Surface roughness */
  roughness: number;
  /** Specular IOR level */
  specularIOR: number;
  /** Index of refraction */
  ior: number;
  /** Bubble density factor (0-1) */
  bubbleDensity: number;
  /** Turbulence scale for bubble pattern */
  turbulenceScale: number;
  /** Volume scattering anisotropy */
  anisotropy: number;
  /** Thickness for transmission/SSS */
  thickness: number;
  /** Seed for deterministic variation */
  seed: number;
}

/** Whitewater preset types */
export type WhitewaterShaderPreset = 'rapid' | 'breaker' | 'wake' | 'boil' | 'splash';

/** Default configuration matching original Infinigen whitewater.py */
const DEFAULT_WHITEWATER_CONFIG: WhitewaterShaderConfig = {
  baseColor: new THREE.Color(1.0, 1.0, 1.0),
  subsurfaceColor: new THREE.Color(0.71, 0.61, 0.80),
  scatterColor: new THREE.Color(0.89, 0.86, 1.0),
  transmission: 0.5,
  roughness: 0.15,
  specularIOR: 0.089,
  ior: 1.1,
  bubbleDensity: 0.8,
  turbulenceScale: 10.0,
  anisotropy: 0.133,
  thickness: 0.5,
  seed: 42,
};

// ============================================================================
// Whitewater Presets
// ============================================================================

const WHITEWATER_PRESETS: Record<WhitewaterShaderPreset, Partial<WhitewaterShaderConfig>> = {
  rapid: {
    bubbleDensity: 0.85,
    turbulenceScale: 10,
    roughness: 0.12,
    transmission: 0.45,
    subsurfaceColor: new THREE.Color(0.71, 0.61, 0.80),
    anisotropy: 0.15,
  },
  breaker: {
    bubbleDensity: 0.95,
    turbulenceScale: 8,
    roughness: 0.10,
    transmission: 0.40,
    subsurfaceColor: new THREE.Color(0.68, 0.58, 0.78),
    anisotropy: 0.12,
  },
  wake: {
    bubbleDensity: 0.6,
    turbulenceScale: 12,
    roughness: 0.18,
    transmission: 0.55,
    subsurfaceColor: new THREE.Color(0.74, 0.64, 0.82),
    anisotropy: 0.18,
  },
  boil: {
    bubbleDensity: 0.9,
    turbulenceScale: 6,
    roughness: 0.13,
    transmission: 0.50,
    subsurfaceColor: new THREE.Color(0.69, 0.60, 0.79),
    anisotropy: 0.10,
  },
  splash: {
    bubbleDensity: 0.7,
    turbulenceScale: 15,
    roughness: 0.20,
    transmission: 0.60,
    subsurfaceColor: new THREE.Color(0.73, 0.63, 0.83),
    anisotropy: 0.20,
  },
};

// ============================================================================
// WhitewaterMaterialFactory
// ============================================================================

/**
 * Factory class for creating whitewater/foam materials.
 *
 * Uses THREE.MeshPhysicalMaterial with transmission, thickness, and SSS
 * to approximate the original Infinigen whitewater material which uses:
 * - PrincipledBSDF (MULTI_GGX distribution) with white base, purplish SSS, low specular IOR, roughness 0.15, IOR 1.1, transmission 0.5
 * - Volume Scatter with light purple-white color and forward anisotropy
 *
 * @example
 * ```ts
 * const factory = new WhitewaterMaterialFactory('rapid', 42);
 * const material = factory.create();
 * ```
 */
export class WhitewaterMaterialFactory {
  private config: WhitewaterShaderConfig;
  private material: THREE.MeshPhysicalMaterial | null = null;

  constructor(preset: WhitewaterShaderPreset = 'rapid', seed: number = 42) {
    const presetConfig = WHITEWATER_PRESETS[preset] || {};
    const rng = new SeededRandom(seed);
    this.config = {
      ...DEFAULT_WHITEWATER_CONFIG,
      ...presetConfig,
      seed,
      subsurfaceColor: presetConfig.subsurfaceColor ?? new THREE.Color(
        rng.nextFloat(0.66, 0.76),
        rng.nextFloat(0.56, 0.66),
        rng.nextFloat(0.75, 0.85)
      ),
      specularIOR: rng.nextFloat(0.08, 0.10),
      bubbleDensity: presetConfig.bubbleDensity ?? rng.nextFloat(0.6, 0.95),
      turbulenceScale: presetConfig.turbulenceScale ?? rng.nextFloat(5, 15),
    };
  }

  /**
   * Create a whitewater MeshPhysicalMaterial.
   */
  create(config?: Partial<WhitewaterShaderConfig>): THREE.MeshPhysicalMaterial {
    const finalConfig = { ...this.config, ...config };

    this.material = new THREE.MeshPhysicalMaterial({
      // Base appearance: bright white
      color: finalConfig.baseColor,
      roughness: finalConfig.roughness,
      metalness: 0.0,

      // Transmission for semi-transparency (matching original's transmission: 0.5)
      transmission: finalConfig.transmission,
      thickness: finalConfig.thickness,
      ior: finalConfig.ior,

      // Specular (matching original's specular IOR: ~0.089)
      specularIntensity: finalConfig.specularIOR,
      specularColor: new THREE.Color(1, 1, 1),

      // Clearcoat for wet surface look
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,

      // Sheen for SSS approximation (purplish tint)
      sheen: 0.3,
      sheenRoughness: 0.5,
      sheenColor: finalConfig.subsurfaceColor,

      // Volume scattering approximation
      // Three.js MeshPhysicalMaterial supports volume properties
      attenuationColor: finalConfig.scatterColor,
      attenuationDistance: 0.5,

      // Transparency settings
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,

      name: `Whitewater_${finalConfig.seed}`,
    });

    // Generate procedural bubble texture
    this.generateBubbleTexture(this.material, finalConfig);

    return this.material;
  }

  /**
   * Generate procedural bubble/turbulence texture.
   * Simulates the volume scatter appearance with bubble patterns.
   */
  private generateBubbleTexture(
    material: THREE.MeshPhysicalMaterial,
    config: WhitewaterShaderConfig
  ): void {
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

        // Turbulent noise for bubble distribution
        const turb1 = noise.perlin2D(u * config.turbulenceScale, v * config.turbulenceScale);
        const turb2 = noise.perlin2D(u * config.turbulenceScale * 2.3, v * config.turbulenceScale * 2.3) * 0.5;
        const turb3 = noise.perlin2D(u * config.turbulenceScale * 5.1, v * config.turbulenceScale * 5.1) * 0.25;
        const turbulence = (turb1 + turb2 + turb3) * 0.5 + 0.5;

        // Bubble pattern — bright spots in turbulent water
        const bubbleNoise = noise.perlin2D(u * 30, v * 30);
        const bubbles = Math.max(0, bubbleNoise * 0.5 + 0.5);

        // Combine: turbulence determines where bubble clusters appear
        const whiteWaterFactor = Math.min(1, turbulence * config.bubbleDensity);
        const bubbleDetail = bubbles * whiteWaterFactor;

        // Color: white with slight subsurface purple tint in shadow areas
        const shadowFactor = 1 - whiteWaterFactor;
        const r = 1.0 * whiteWaterFactor + config.subsurfaceColor.r * shadowFactor * 0.3;
        const g = 1.0 * whiteWaterFactor + config.subsurfaceColor.g * shadowFactor * 0.3;
        const b = 1.0 * whiteWaterFactor + config.subsurfaceColor.b * shadowFactor * 0.3;

        imageData.data[index] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[index + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[index + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[index + 3] = Math.min(255, Math.max(0, Math.floor((0.7 + bubbleDetail * 0.3) * 255)));
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
   * Update material configuration at runtime.
   */
  updateConfig(config: Partial<WhitewaterShaderConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.material) {
      this.material.color.set(this.config.baseColor);
      this.material.transmission = this.config.transmission;
      this.material.roughness = this.config.roughness;
      this.material.ior = this.config.ior;
      this.material.sheenColor = this.config.subsurfaceColor;
    }
  }

  /**
   * Get a preset configuration.
   */
  static getPreset(preset: WhitewaterShaderPreset): Partial<WhitewaterShaderConfig> {
    return WHITEWATER_PRESETS[preset] || {};
  }

  /**
   * List all whitewater presets.
   */
  static listPresets(): WhitewaterShaderPreset[] {
    return Object.keys(WHITEWATER_PRESETS) as WhitewaterShaderPreset[];
  }

  /**
   * Dispose of created materials and textures.
   */
  dispose(): void {
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}
