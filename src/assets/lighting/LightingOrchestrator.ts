/**
 * LightingOrchestrator — Single class connecting sky, lights, exposure, fog
 *
 * Provides a higher-level API than AtmospherePipeline, integrating the
 * lighting presets (indoor/outdoor/studio/dramatic) with the atmosphere
 * pipeline and connecting node executor lights (PointLight, SpotLight, etc.)
 * into the scene.
 *
 * This replaces the need for consumers to manually coordinate:
 *   - SkyLightingSystem
 *   - LightingSystem (preset-based)
 *   - ThreePointLightingSystem
 *   - FogSystem
 *   - ExposureControl
 *
 * @module assets/lighting/LightingOrchestrator
 */

import * as THREE from 'three';
import {
  AtmospherePipeline,
  AtmospherePipelineConfig,
  DEFAULT_ATMOSPHERE_CONFIG,
  type TimeOfDay,
} from './AtmospherePipeline';

// ============================================================================
// Lighting Preset Types
// ============================================================================

export type LightingPresetType = 'indoor' | 'outdoor' | 'studio' | 'dramatic' | 'natural';

export interface LightingPreset {
  type: LightingPresetType;
  name: string;
  description: string;
  atmosphere: Partial<AtmospherePipelineConfig>;
}

// ============================================================================
// Built-in Presets
// ============================================================================

export const LIGHTING_PRESETS: Record<LightingPresetType, LightingPreset> = {
  indoor: {
    type: 'indoor',
    name: 'Indoor',
    description: 'Soft, even interior lighting with minimal shadows',
    atmosphere: {
      timeOfDay: 'noon',
      turbidity: 1.0,
      fogDensity: 0,
      cloudCoverage: 0,
      exposureCompensation: 0.5,
      toneMapping: 'aces',
    },
  },
  outdoor: {
    type: 'outdoor',
    name: 'Outdoor',
    description: 'Natural outdoor lighting with sun, sky, and atmospheric effects',
    atmosphere: {
      timeOfDay: 'afternoon',
      turbidity: 2.5,
      fogDensity: 0.1,
      cloudCoverage: 0.3,
      exposureCompensation: 0,
      toneMapping: 'aces',
    },
  },
  studio: {
    type: 'studio',
    name: 'Studio',
    description: 'Three-point studio lighting for product shots',
    atmosphere: {
      timeOfDay: 'noon',
      turbidity: 1.0,
      fogDensity: 0,
      cloudCoverage: 0,
      exposureCompensation: 0.3,
      toneMapping: 'reinhard',
    },
  },
  dramatic: {
    type: 'dramatic',
    name: 'Dramatic',
    description: 'High-contrast dramatic lighting with strong shadows',
    atmosphere: {
      timeOfDay: 'dusk',
      turbidity: 4.0,
      fogDensity: 0.3,
      cloudCoverage: 0.6,
      exposureCompensation: -0.5,
      toneMapping: 'aces',
    },
  },
  natural: {
    type: 'natural',
    name: 'Natural',
    description: 'Balanced natural lighting matching Infinigen defaults',
    atmosphere: {
      timeOfDay: 'morning',
      turbidity: 2.0,
      fogDensity: 0.05,
      cloudCoverage: 0.2,
      exposureCompensation: 0,
      toneMapping: 'aces',
    },
  },
};

// ============================================================================
// LightingOrchestrator
// ============================================================================

/**
 * High-level lighting orchestrator that connects all lighting and atmosphere
 * subsystems into a single coherent pipeline.
 *
 * Usage:
 * ```ts
 * const orchestrator = new LightingOrchestrator();
 * orchestrator.setup(scene, camera, renderer, { preset: 'outdoor' });
 *
 * // Change preset at runtime
 * orchestrator.applyPreset('dramatic');
 *
 * // Add scene-specific lights (from node executors)
 * orchestrator.addSceneLight(pointLight);
 * ```
 */
export class LightingOrchestrator {
  private pipeline: AtmospherePipeline;
  private sceneLights: THREE.Light[] = [];
  private scene: THREE.Scene | null = null;
  private currentPreset: LightingPresetType = 'outdoor';
  private keyLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;

  constructor() {
    this.pipeline = new AtmospherePipeline();
  }

  /**
   * Setup the complete lighting system for a scene.
   *
   * @param scene - The THREE.Scene
   * @param camera - Optional camera for exposure
   * @param renderer - Optional renderer for tone mapping
   * @param options - Configuration options
   */
  setup(
    scene: THREE.Scene,
    camera?: THREE.Camera,
    renderer?: THREE.WebGLRenderer,
    options: {
      preset?: LightingPresetType;
      atmosphere?: Partial<AtmospherePipelineConfig>;
    } = {},
  ): void {
    this.scene = scene;
    const presetType = options.preset ?? 'outdoor';
    this.currentPreset = presetType;
    const preset = LIGHTING_PRESETS[presetType];

    // Merge preset atmosphere config with overrides
    const atmosphereConfig: Partial<AtmospherePipelineConfig> = {
      ...preset.atmosphere,
      ...options.atmosphere,
    };

    // Attach atmosphere pipeline
    this.pipeline.attach(scene, camera, renderer, atmosphereConfig);

    // For studio preset, add three-point lighting
    if (presetType === 'studio') {
      this.setupThreePointLighting(scene);
    }

    // For indoor preset, add interior point lights
    if (presetType === 'indoor') {
      this.setupIndoorLighting(scene);
    }
  }

  /**
   * Apply a lighting preset at runtime.
   */
  applyPreset(presetType: LightingPresetType): void {
    this.currentPreset = presetType;
    const preset = LIGHTING_PRESETS[presetType];
    this.pipeline.update(preset.atmosphere);

    // Remove existing studio/indoor lights
    this.removeExtraLights();

    if (presetType === 'studio') {
      this.setupThreePointLighting(this.scene!);
    }
    if (presetType === 'indoor') {
      this.setupIndoorLighting(this.scene!);
    }
  }

  /**
   * Add a scene-specific light (e.g., from node executor).
   */
  addSceneLight(light: THREE.Light): void {
    this.sceneLights.push(light);
    if (this.scene) {
      this.scene.add(light);
    }
  }

  /**
   * Remove a scene-specific light.
   */
  removeSceneLight(light: THREE.Light): void {
    const idx = this.sceneLights.indexOf(light);
    if (idx >= 0) {
      this.sceneLights.splice(idx, 1);
    }
    if (this.scene) {
      this.scene.remove(light);
    }
  }

  /**
   * Update the time of day (for day/night cycle).
   */
  setTimeOfDay(time: TimeOfDay): void {
    this.pipeline.update({ timeOfDay: time });
  }

  /**
   * Update fog density.
   */
  setFogDensity(density: number): void {
    this.pipeline.update({ fogDensity: density });
  }

  /**
   * Update cloud coverage.
   */
  setCloudCoverage(coverage: number): void {
    this.pipeline.update({ cloudCoverage: coverage });
  }

  /**
   * Get the current preset type.
   */
  getCurrentPreset(): LightingPresetType {
    return this.currentPreset;
  }

  /**
   * Get the sun direction from the atmosphere pipeline.
   */
  getSunDirection(): THREE.Vector3 {
    return this.pipeline.getSunDirection();
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.removeExtraLights();
    this.pipeline.dispose();
    this.scene = null;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private setupThreePointLighting(scene: THREE.Scene): void {
    // Key light — main directional light from upper right
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.keyLight.position.set(5, 8, 3);
    this.keyLight.castShadow = true;
    scene.add(this.keyLight);
    this.sceneLights.push(this.keyLight);

    // Fill light — softer, opposite side
    this.fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    this.fillLight.position.set(-5, 3, -3);
    scene.add(this.fillLight);
    this.sceneLights.push(this.fillLight);

    // Rim light — from behind for edge highlights
    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.rimLight.position.set(0, 5, -8);
    scene.add(this.rimLight);
    this.sceneLights.push(this.rimLight);
  }

  private setupIndoorLighting(scene: THREE.Scene): void {
    // Ceiling light
    const ceilingLight = new THREE.PointLight(0xfff5e6, 0.8, 20);
    ceilingLight.position.set(0, 4, 0);
    scene.add(ceilingLight);
    this.sceneLights.push(ceilingLight);

    // Window light
    const windowLight = new THREE.SpotLight(0xddeeff, 0.6, 15, Math.PI / 4, 0.5);
    windowLight.position.set(5, 3, 0);
    windowLight.target.position.set(0, 0, 0);
    scene.add(windowLight);
    scene.add(windowLight.target);
    this.sceneLights.push(windowLight);
  }

  private removeExtraLights(): void {
    for (const light of this.sceneLights) {
      this.scene?.remove(light);
      if (light instanceof THREE.DirectionalLight || light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
        light.dispose();
      }
    }
    this.sceneLights = [];
    this.keyLight = null;
    this.fillLight = null;
    this.rimLight = null;
  }
}
