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
 * The orchestrator now delegates preset management to a LightingRegistry,
 * which uses the strategy pattern for pluggable lighting presets.
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
import {
  LightingRegistry,
  type LightingPresetStrategy,
  type LightingPresetResult,
} from './LightingRegistry';

// ============================================================================
// Lighting Preset Types (kept for backward compatibility)
// ============================================================================

export type LightingPresetType = 'indoor' | 'outdoor' | 'studio' | 'dramatic' | 'natural';

export interface LightingPreset {
  type: LightingPresetType;
  name: string;
  description: string;
  atmosphere: Partial<AtmospherePipelineConfig>;
}

// ============================================================================
// Built-in Presets (kept for backward compatibility — read from registry)
// ============================================================================

/**
 * Static preset definitions for backward compatibility.
 * These mirror the atmosphere overrides that the registry strategies produce.
 * Prefer using LightingRegistry directly for full light creation.
 */
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
 *
 * // Access the registry for advanced control
 * const registry = orchestrator.getRegistry();
 * registry.register(myCustomPreset);
 * ```
 */
export class LightingOrchestrator {
  private pipeline: AtmospherePipeline;
  private registry: LightingRegistry;
  private sceneLights: THREE.Light[] = [];
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private currentPreset: LightingPresetType = 'outdoor';
  private keyLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  /** Tracks whether the current preset was applied via the registry */
  private usingRegistryPreset = false;
  /** Last result from the registry (for cleanup) */
  private lastRegistryResult: LightingPresetResult | null = null;

  constructor(registry?: LightingRegistry) {
    this.pipeline = new AtmospherePipeline();
    this.registry = registry ?? new LightingRegistry();
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
    this.camera = camera ?? null;
    this.renderer = renderer ?? null;
    const presetType = options.preset ?? 'outdoor';
    this.currentPreset = presetType;

    // Apply preset via the registry — this creates actual lights
    this.applyPresetViaRegistry(presetType, scene, camera, renderer);

    // Merge registry atmosphere config with overrides
    const preset = LIGHTING_PRESETS[presetType];
    const atmosphereConfig: Partial<AtmospherePipelineConfig> = {
      ...preset.atmosphere,
      ...options.atmosphere,
    };

    // Attach atmosphere pipeline
    this.pipeline.attach(scene, camera, renderer, atmosphereConfig);
  }

  /**
   * Apply a lighting preset at runtime.
   *
   * Uses the LightingRegistry to create the preset's lights and applies
   * the associated atmosphere configuration.
   */
  applyPreset(presetType: LightingPresetType): void {
    this.currentPreset = presetType;

    // Apply via registry if scene is available
    if (this.scene) {
      this.applyPresetViaRegistry(presetType, this.scene, this.camera ?? undefined, this.renderer ?? undefined);
    }

    // Update atmosphere pipeline
    const preset = LIGHTING_PRESETS[presetType];
    this.pipeline.update(preset.atmosphere);
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
   * Get the LightingRegistry for advanced control.
   * Allows registering custom presets, querying available presets, etc.
   */
  getRegistry(): LightingRegistry {
    return this.registry;
  }

  /**
   * Get the AtmospherePipeline instance.
   */
  getPipeline(): AtmospherePipeline {
    return this.pipeline;
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.removeExtraLights();
    this.cleanupRegistryResult();
    this.pipeline.dispose();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Apply a preset via the LightingRegistry.
   * Cleans up previous registry-applied lights first.
   */
  private applyPresetViaRegistry(
    presetType: LightingPresetType,
    scene: THREE.Scene,
    camera?: THREE.Camera,
    renderer?: THREE.WebGLRenderer,
  ): void {
    // Clean up previous registry result
    this.cleanupRegistryResult();

    if (this.registry.has(presetType)) {
      this.lastRegistryResult = this.registry.apply(presetType, scene, camera, renderer);
      this.usingRegistryPreset = true;

      // Add registry lights to our tracking
      for (const light of this.lastRegistryResult.lights) {
        // Don't double-add to scene (the strategy already did that)
        // Just track for management
        this.sceneLights.push(light);
      }

      // Add target object to scene if present
      if (this.lastRegistryResult.target && !this.lastRegistryResult.target.parent) {
        scene.add(this.lastRegistryResult.target);
      }
    } else {
      // Fallback: use inline light setup for backward compat
      this.usingRegistryPreset = false;
      this.removeExtraLights();

      if (presetType === 'studio') {
        this.setupThreePointLighting(scene);
      }
      if (presetType === 'indoor') {
        this.setupIndoorLighting(scene);
      }
    }
  }

  /**
   * Clean up lights created by the registry.
   */
  private cleanupRegistryResult(): void {
    if (!this.lastRegistryResult) return;

    // Remove registry lights from our tracking
    for (const light of this.lastRegistryResult.lights) {
      const idx = this.sceneLights.indexOf(light);
      if (idx >= 0) {
        this.sceneLights.splice(idx, 1);
      }
    }

    // Remove target object from scene
    if (this.lastRegistryResult.target) {
      this.lastRegistryResult.target.parent?.remove(this.lastRegistryResult.target);
    }

    this.lastRegistryResult = null;
  }

  /**
   * @deprecated Use LightingRegistry with 'studio' preset instead.
   * Kept for backward compatibility when registry is unavailable.
   */
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

  /**
   * @deprecated Use LightingRegistry with 'indoor' preset instead.
   * Kept for backward compatibility when registry is unavailable.
   */
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
