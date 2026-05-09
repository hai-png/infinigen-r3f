/**
 * LightingRegistry — Strategy pattern for lighting presets
 *
 * Manages lighting presets (indoor, outdoor, studio, dramatic, natural, custom)
 * with a pluggable strategy pattern. Each preset is a self-contained
 * configuration that the LightingOrchestrator can apply.
 *
 * Built-in presets:
 *   - 'indoor'    — Soft interior lighting
 *   - 'outdoor'   — Natural outdoor lighting with sun and sky
 *   - 'studio'    — Three-point studio lighting (replaces standalone ThreePointLighting)
 *   - 'dramatic'  — High-contrast dramatic lighting
 *   - 'natural'   — Balanced natural lighting
 *
 * Custom presets can be registered at runtime.
 *
 * @module assets/lighting/LightingRegistry
 */

import * as THREE from 'three';
import {
  type AtmospherePipelineConfig,
  DEFAULT_ATMOSPHERE_CONFIG,
} from './AtmospherePipeline';

// ============================================================================
// Strategy Interface
// ============================================================================

/**
 * Result returned when a lighting preset strategy is applied.
 */
export interface LightingPresetResult {
  /** All lights created by this preset */
  lights: THREE.Light[];
  /** Optional atmosphere config overrides */
  atmosphereOverrides: Partial<AtmospherePipelineConfig>;
  /** Optional target object for directional/spot lights */
  target?: THREE.Object3D;
  /** Metadata about the applied preset */
  meta: {
    name: string;
    description: string;
    lightCount: number;
  };
}

/**
 * Strategy interface that each lighting preset must implement.
 *
 * The `apply` method creates actual THREE.Light instances and returns them
 * along with optional atmosphere pipeline configuration overrides. The
 * `dispose` method cleans up any GPU resources held by the strategy.
 */
export interface LightingPresetStrategy {
  /** Unique identifier for this preset */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /**
   * Apply the lighting preset to the scene.
   *
   * @param scene - The THREE.Scene to add lights to
   * @param camera - Optional camera for light positioning
   * @param renderer - Optional renderer for shadow map setup
   * @returns LightingPresetResult containing created lights and config overrides
   */
  apply(
    scene: THREE.Scene,
    camera?: THREE.Camera,
    renderer?: THREE.WebGLRenderer,
  ): LightingPresetResult;
  /**
   * Dispose any GPU resources held by this strategy.
   * Called when the preset is being replaced or the orchestrator is disposing.
   */
  dispose(): void;
}

// ============================================================================
// Indoor Lighting Preset
// ============================================================================

export class IndoorLightingStrategy implements LightingPresetStrategy {
  readonly name = 'indoor';
  readonly description = 'Soft, even interior lighting with minimal shadows';

  private lights: THREE.Light[] = [];
  private target: THREE.Object3D | null = null;

  apply(
    scene: THREE.Scene,
    _camera?: THREE.Camera,
    _renderer?: THREE.WebGLRenderer,
  ): LightingPresetResult {
    this.dispose();

    // Ceiling light — warm white overhead
    const ceilingLight = new THREE.PointLight(0xfff5e6, 0.8, 20, 2);
    ceilingLight.position.set(0, 4, 0);
    ceilingLight.castShadow = true;
    ceilingLight.shadow.mapSize.setScalar(512);
    scene.add(ceilingLight);
    this.lights.push(ceilingLight);

    // Window light — cool daylight from side
    const windowLight = new THREE.SpotLight(0xddeeff, 0.6, 15, Math.PI / 4, 0.5, 2);
    windowLight.position.set(5, 3, 0);
    this.target = new THREE.Object3D();
    this.target.position.set(0, 0, 0);
    scene.add(this.target);
    windowLight.target = this.target;
    scene.add(windowLight);
    this.lights.push(windowLight);

    // Fill light — soft warm fill on opposite side
    const fillLight = new THREE.PointLight(0xffeedd, 0.3, 12, 2);
    fillLight.position.set(-4, 2, 3);
    scene.add(fillLight);
    this.lights.push(fillLight);

    return {
      lights: [...this.lights],
      atmosphereOverrides: {
        timeOfDay: 'noon',
        turbidity: 1.0,
        fogDensity: 0,
        cloudCoverage: 0,
        exposureCompensation: 0.5,
        toneMapping: 'aces',
      },
      target: this.target ?? undefined,
      meta: {
        name: this.name,
        description: this.description,
        lightCount: this.lights.length,
      },
    };
  }

  dispose(): void {
    for (const light of this.lights) {
      light.parent?.remove(light);
      if (
        light instanceof THREE.DirectionalLight ||
        light instanceof THREE.PointLight ||
        light instanceof THREE.SpotLight
      ) {
        light.dispose();
      }
    }
    if (this.target) {
      this.target.parent?.remove(this.target);
      this.target = null;
    }
    this.lights = [];
  }
}

// ============================================================================
// Outdoor Lighting Preset
// ============================================================================

export class OutdoorLightingStrategy implements LightingPresetStrategy {
  readonly name = 'outdoor';
  readonly description = 'Natural outdoor lighting with sun, sky, and atmospheric effects';

  private lights: THREE.Light[] = [];
  private target: THREE.Object3D | null = null;

  apply(
    scene: THREE.Scene,
    _camera?: THREE.Camera,
    _renderer?: THREE.WebGLRenderer,
  ): LightingPresetResult {
    this.dispose();

    // Sun — main directional light from high angle
    const sunLight = new THREE.DirectionalLight(0xffffee, 1.5);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.setScalar(4096);
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -60;
    sunLight.shadow.camera.right = 60;
    sunLight.shadow.camera.top = 60;
    sunLight.shadow.camera.bottom = -60;
    this.target = new THREE.Object3D();
    this.target.position.set(0, 0, 0);
    scene.add(this.target);
    sunLight.target = this.target;
    scene.add(sunLight);
    this.lights.push(sunLight);

    // Sky hemisphere — blue sky / warm ground
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x444422, 0.4);
    scene.add(hemiLight);
    this.lights.push(hemiLight);

    // Fill — subtle fill from opposite side
    const fillLight = new THREE.DirectionalLight(0xaabbdd, 0.2);
    fillLight.position.set(-20, 30, -20);
    scene.add(fillLight);
    this.lights.push(fillLight);

    return {
      lights: [...this.lights],
      atmosphereOverrides: {
        timeOfDay: 'afternoon',
        turbidity: 2.5,
        fogDensity: 0.1,
        cloudCoverage: 0.3,
        exposureCompensation: 0,
        toneMapping: 'aces',
      },
      target: this.target ?? undefined,
      meta: {
        name: this.name,
        description: this.description,
        lightCount: this.lights.length,
      },
    };
  }

  dispose(): void {
    for (const light of this.lights) {
      light.parent?.remove(light);
      if (
        light instanceof THREE.DirectionalLight ||
        light instanceof THREE.PointLight ||
        light instanceof THREE.SpotLight ||
        light instanceof THREE.HemisphereLight
      ) {
        light.dispose();
      }
    }
    if (this.target) {
      this.target.parent?.remove(this.target);
      this.target = null;
    }
    this.lights = [];
  }
}

// ============================================================================
// Studio (Three-Point) Lighting Preset
// ============================================================================

/**
 * Studio lighting implementing the classic three-point technique.
 * This replaces the standalone ThreePointLightingSystem in the
 * LightingOrchestrator context — key/fill/rim logic is identical.
 */
export class StudioLightingStrategy implements LightingPresetStrategy {
  readonly name = 'studio';
  readonly description = 'Three-point studio lighting for product shots';

  private lights: THREE.Light[] = [];
  private target: THREE.Object3D | null = null;

  apply(
    scene: THREE.Scene,
    _camera?: THREE.Camera,
    _renderer?: THREE.WebGLRenderer,
  ): LightingPresetResult {
    this.dispose();

    this.target = new THREE.Object3D();
    this.target.position.set(0, 0, 0);
    scene.add(this.target);

    // Key light — main directional from upper right, casting shadows
    const keyLight = new THREE.SpotLight(0xffffff, 2.0, 50, Math.PI / 6, 0.3, 2);
    keyLight.position.set(
      Math.sin(Math.PI / 4) * 10,
      5,
      Math.cos(Math.PI / 4) * 10,
    );
    keyLight.target = this.target;
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.setScalar(2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 100;
    scene.add(keyLight);
    this.lights.push(keyLight);

    // Fill light — softer point light from opposite side
    const fillLight = new THREE.PointLight(0x8888ff, 0.5, 30, 2);
    fillLight.position.set(
      Math.sin(-Math.PI / 4) * 8,
      2,
      Math.cos(-Math.PI / 4) * 8,
    );
    scene.add(fillLight);
    this.lights.push(fillLight);

    // Rim light — from behind for edge highlights
    const rimLight = new THREE.SpotLight(0xffffff, 1.0, 50, Math.PI / 6, 0.5, 2);
    rimLight.position.set(0, 4, -10);
    rimLight.target = this.target;
    scene.add(rimLight);
    this.lights.push(rimLight);

    return {
      lights: [...this.lights],
      atmosphereOverrides: {
        timeOfDay: 'noon',
        turbidity: 1.0,
        fogDensity: 0,
        cloudCoverage: 0,
        exposureCompensation: 0.3,
        toneMapping: 'reinhard',
      },
      target: this.target ?? undefined,
      meta: {
        name: this.name,
        description: this.description,
        lightCount: this.lights.length,
      },
    };
  }

  dispose(): void {
    for (const light of this.lights) {
      light.parent?.remove(light);
      if (
        light instanceof THREE.DirectionalLight ||
        light instanceof THREE.PointLight ||
        light instanceof THREE.SpotLight
      ) {
        light.dispose();
      }
    }
    if (this.target) {
      this.target.parent?.remove(this.target);
      this.target = null;
    }
    this.lights = [];
  }
}

// ============================================================================
// Dramatic Lighting Preset
// ============================================================================

export class DramaticLightingStrategy implements LightingPresetStrategy {
  readonly name = 'dramatic';
  readonly description = 'High-contrast dramatic lighting with strong shadows';

  private lights: THREE.Light[] = [];
  private target: THREE.Object3D | null = null;

  apply(
    scene: THREE.Scene,
    _camera?: THREE.Camera,
    _renderer?: THREE.WebGLRenderer,
  ): LightingPresetResult {
    this.dispose();

    // Strong key light — low angle, warm colour, casting long shadows
    const keyLight = new THREE.DirectionalLight(0xffaa00, 2.0);
    keyLight.position.set(5, 8, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.setScalar(2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 300;
    keyLight.shadow.camera.left = -50;
    keyLight.shadow.camera.right = 50;
    keyLight.shadow.camera.top = 50;
    keyLight.shadow.camera.bottom = -50;
    this.target = new THREE.Object3D();
    this.target.position.set(0, 0, 0);
    scene.add(this.target);
    keyLight.target = this.target;
    scene.add(keyLight);
    this.lights.push(keyLight);

    // Very dim cool fill — deep blue from opposite side
    const fillLight = new THREE.DirectionalLight(0x223366, 0.1);
    fillLight.position.set(-20, 5, -20);
    scene.add(fillLight);
    this.lights.push(fillLight);

    // Rim light — strong backlight
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
    rimLight.position.set(0, 20, -30);
    scene.add(rimLight);
    this.lights.push(rimLight);

    // Ambient — very low, dark blue
    const ambient = new THREE.HemisphereLight(0x1a1a2e, 0x000000, 0.1);
    scene.add(ambient);
    this.lights.push(ambient);

    return {
      lights: [...this.lights],
      atmosphereOverrides: {
        timeOfDay: 'dusk',
        turbidity: 4.0,
        fogDensity: 0.3,
        cloudCoverage: 0.6,
        exposureCompensation: -0.5,
        toneMapping: 'aces',
      },
      target: this.target ?? undefined,
      meta: {
        name: this.name,
        description: this.description,
        lightCount: this.lights.length,
      },
    };
  }

  dispose(): void {
    for (const light of this.lights) {
      light.parent?.remove(light);
      if (
        light instanceof THREE.DirectionalLight ||
        light instanceof THREE.PointLight ||
        light instanceof THREE.SpotLight ||
        light instanceof THREE.HemisphereLight
      ) {
        light.dispose();
      }
    }
    if (this.target) {
      this.target.parent?.remove(this.target);
      this.target = null;
    }
    this.lights = [];
  }
}

// ============================================================================
// Natural Lighting Preset
// ============================================================================

export class NaturalLightingStrategy implements LightingPresetStrategy {
  readonly name = 'natural';
  readonly description = 'Balanced natural lighting matching Infinigen defaults';

  private lights: THREE.Light[] = [];
  private target: THREE.Object3D | null = null;

  apply(
    scene: THREE.Scene,
    _camera?: THREE.Camera,
    _renderer?: THREE.WebGLRenderer,
  ): LightingPresetResult {
    this.dispose();

    // Sun — warm morning light
    const sunLight = new THREE.DirectionalLight(0xfffff0, 0.8);
    sunLight.position.set(30, 60, 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.setScalar(2048);
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    this.target = new THREE.Object3D();
    this.target.position.set(0, 0, 0);
    scene.add(this.target);
    sunLight.target = this.target;
    scene.add(sunLight);
    this.lights.push(sunLight);

    // Sky hemisphere — light blue / warm ground
    const hemiLight = new THREE.HemisphereLight(0xe6f3ff, 0x8d6e3f, 0.5);
    scene.add(hemiLight);
    this.lights.push(hemiLight);

    // Subtle fill from shadow side
    const fillLight = new THREE.DirectionalLight(0xb0c4de, 0.3);
    fillLight.position.set(-30, 40, -30);
    scene.add(fillLight);
    this.lights.push(fillLight);

    // Rim — gentle backlight
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, 50, -70);
    scene.add(rimLight);
    this.lights.push(rimLight);

    return {
      lights: [...this.lights],
      atmosphereOverrides: {
        timeOfDay: 'morning',
        turbidity: 2.0,
        fogDensity: 0.05,
        cloudCoverage: 0.2,
        exposureCompensation: 0,
        toneMapping: 'aces',
      },
      target: this.target ?? undefined,
      meta: {
        name: this.name,
        description: this.description,
        lightCount: this.lights.length,
      },
    };
  }

  dispose(): void {
    for (const light of this.lights) {
      light.parent?.remove(light);
      if (
        light instanceof THREE.DirectionalLight ||
        light instanceof THREE.PointLight ||
        light instanceof THREE.SpotLight ||
        light instanceof THREE.HemisphereLight
      ) {
        light.dispose();
      }
    }
    if (this.target) {
      this.target.parent?.remove(this.target);
      this.target = null;
    }
    this.lights = [];
  }
}

// ============================================================================
// LightingRegistry
// ============================================================================

/**
 * Strategy pattern registry for lighting presets.
 *
 * Manages a collection of LightingPresetStrategy instances that can be
 * applied by name. Built-in presets are registered by default. Custom
 * presets can be added at runtime via `register()`.
 *
 * Usage:
 * ```ts
 * const registry = new LightingRegistry();
 * const result = registry.apply('studio', scene, camera, renderer);
 * // result.lights contains the created THREE.Light instances
 * ```
 */
export class LightingRegistry {
  private strategies: Map<string, LightingPresetStrategy> = new Map();
  /** Track the last result for each preset so we can dispose on re-apply */
  private lastResults: Map<string, LightingPresetResult> = new Map();

  constructor() {
    // Register built-in presets
    this.register(new IndoorLightingStrategy());
    this.register(new OutdoorLightingStrategy());
    this.register(new StudioLightingStrategy());
    this.register(new DramaticLightingStrategy());
    this.register(new NaturalLightingStrategy());
  }

  /**
   * Register a lighting preset strategy.
   * If a strategy with the same name already exists, it is replaced.
   */
  register(strategy: LightingPresetStrategy): void {
    const existing = this.strategies.get(strategy.name);
    if (existing) {
      existing.dispose();
    }
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Apply a named lighting preset.
   *
   * Disposes the previous result for this preset (if any), then creates
   * new lights via the strategy's `apply()` method.
   *
   * @param name - The preset name to apply
   * @param scene - The THREE.Scene to add lights to
   * @param camera - Optional camera
   * @param renderer - Optional renderer
   * @returns LightingPresetResult
   * @throws Error if the preset name is not registered
   */
  apply(
    name: string,
    scene: THREE.Scene,
    camera?: THREE.Camera,
    renderer?: THREE.WebGLRenderer,
  ): LightingPresetResult {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(
        `Lighting preset '${name}' not found. Available: ${this.getPresetNames().join(', ')}`,
      );
    }

    // Dispose previous result for this preset if it exists
    const previous = this.lastResults.get(name);
    if (previous) {
      for (const light of previous.lights) {
        light.parent?.remove(light);
        if (
          light instanceof THREE.DirectionalLight ||
          light instanceof THREE.PointLight ||
          light instanceof THREE.SpotLight ||
          light instanceof THREE.HemisphereLight
        ) {
          light.dispose();
        }
      }
      if (previous.target) {
        previous.target.parent?.remove(previous.target);
      }
    }

    const result = strategy.apply(scene, camera, renderer);
    this.lastResults.set(name, result);
    return result;
  }

  /**
   * Check if a preset is registered.
   */
  has(name: string): boolean {
    return this.strategies.has(name);
  }

  /**
   * Get the strategy instance for a preset name.
   */
  get(name: string): LightingPresetStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get all registered preset names.
   */
  getPresetNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Dispose all strategies and clear the registry.
   * Built-in strategies are re-registered after clearing.
   */
  disposeAll(): void {
    for (const strategy of this.strategies.values()) {
      strategy.dispose();
    }
    this.strategies.clear();
    this.lastResults.clear();
  }

  /**
   * Dispose all strategies and reset to built-in presets only.
   */
  reset(): void {
    this.disposeAll();
    this.register(new IndoorLightingStrategy());
    this.register(new OutdoorLightingStrategy());
    this.register(new StudioLightingStrategy());
    this.register(new DramaticLightingStrategy());
    this.register(new NaturalLightingStrategy());
  }
}
