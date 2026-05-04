/**
 * SceneConfigBridge.ts — Bridge between GinConfig and SceneConfigSystem
 *
 * Provides bidirectional conversion between the new GinConfig system and
 * the existing SceneConfigSystem (YAML/JSON-based). This enables:
 *
 * 1. Loading existing SceneConfig JSON/YAML into GinConfig
 * 2. Exporting GinConfig state as a SceneConfig
 * 3. Using GinConfig overrides to modify SceneConfig parameters
 * 4. Gradual migration from SceneConfigSystem to GinConfig
 *
 * Example usage:
 * ```ts
 * const gin = new GinConfig(42);
 * const bridge = new GinConfigBridge(gin);
 *
 * // Load from existing SceneConfig
 * const sceneConfig = ConfigParser.parseJSON(jsonString);
 * bridge.importSceneConfig(sceneConfig);
 *
 * // Export to SceneConfig format
 * const exported = bridge.exportSceneConfig();
 *
 * // Apply overrides and re-export
 * gin.setOverride('terrain/TerrainGenerator', 'seed', 123);
 * const updated = bridge.exportSceneConfig();
 * ```
 */

import {
  GinConfig,
  ConfigValue,
  vec3,
  color,
  enumVal,
  isVector3Value,
  isColorValue,
} from './GinConfig';
import type {
  SceneConfig,
  EnvironmentConfig,
  CameraConfig,
  LightingConfig,
  RenderingConfig,
  Vector3Config,
  ColorConfig,
} from '../../datagen/pipeline/SceneConfigSystem';

// ============================================================================
// Mapping Types
// ============================================================================

/**
 * Describes how a SceneConfig field maps to a GinConfig configurable.
 */
export interface SceneConfigGinMapping {
  /** SceneConfig field path (dot-separated). */
  scenePath: string;
  /** GinConfig configurable name. */
  ginName: string;
  /** GinConfig parameter key. */
  ginKey: string;
  /** Optional value transformer. */
  transform?: (value: any) => ConfigValue;
  /** Optional reverse transformer. */
  reverseTransform?: (value: ConfigValue) => any;
}

// ============================================================================
// Default Mappings
// ============================================================================

/**
 * Default mappings between SceneConfig fields and GinConfig parameters.
 * This covers the most common configuration fields.
 */
const DEFAULT_MAPPINGS: SceneConfigGinMapping[] = [
  // Environment
  {
    scenePath: 'environment.sky.turbidity',
    ginName: 'weather/WeatherSystem',
    ginKey: 'turbidity',
  },
  {
    scenePath: 'environment.sky.sunPosition',
    ginName: 'weather/TimeOfDaySystem',
    ginKey: 'sunPosition',
    transform: (v: Vector3Config) => {
      if (Array.isArray(v)) return vec3(v[0], v[1], v[2]);
      return vec3(v.x, v.y, v.z);
    },
    reverseTransform: (v: ConfigValue) => {
      if (isVector3Value(v)) return [v.x, v.y, v.z] as Vector3Config;
      return v;
    },
  },
  {
    scenePath: 'environment.fog.enabled',
    ginName: 'weather/FogSystem',
    ginKey: 'enabled',
  },
  {
    scenePath: 'environment.fog.density',
    ginName: 'weather/FogSystem',
    ginKey: 'density',
  },
  {
    scenePath: 'environment.fog.color',
    ginName: 'weather/FogSystem',
    ginKey: 'color',
    transform: (v: ColorConfig) => {
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return color(v[0], v[1], v[2]);
      if ('r' in v && 'g' in v && 'b' in v) return color((v as {r:number;g:number;b:number}).r, (v as {r:number;g:number;b:number}).g, (v as {r:number;g:number;b:number}).b);
      // HSL/HSV — convert to JSON string for later resolution
      return JSON.stringify(v);
    },
  },

  // Lighting
  {
    scenePath: 'lighting.ambient.intensity',
    ginName: 'lighting/LightingSystem',
    ginKey: 'ambientIntensity',
  },
  {
    scenePath: 'lighting.directional.0.intensity',
    ginName: 'lighting/LightingSystem',
    ginKey: 'directionalIntensity',
  },
  {
    scenePath: 'lighting.directional.0.castShadow',
    ginName: 'lighting/LightingSystem',
    ginKey: 'castShadow',
  },

  // Rendering
  {
    scenePath: 'rendering.shadows.enabled',
    ginName: 'rendering/RenderingConfig',
    ginKey: 'shadowsEnabled',
  },
  {
    scenePath: 'rendering.shadows.mapSize',
    ginName: 'lighting/LightingSystem',
    ginKey: 'shadowMapSize',
  },
  {
    scenePath: 'rendering.toneMapping.type',
    ginName: 'rendering/RenderingConfig',
    ginKey: 'toneMapping',
  },
  {
    scenePath: 'rendering.toneMapping.exposure',
    ginName: 'rendering/RenderingConfig',
    ginKey: 'exposure',
  },
];

// ============================================================================
// Bridge Class
// ============================================================================

/**
 * Bridge between GinConfig and SceneConfigSystem.
 *
 * Handles bidirectional conversion so that both systems can coexist
 * during the migration period.
 */
export class GinConfigBridge {
  private gin: GinConfig;
  private mappings: SceneConfigGinMapping[];

  constructor(gin: GinConfig, mappings?: SceneConfigGinMapping[]) {
    this.gin = gin;
    this.mappings = mappings ?? DEFAULT_MAPPINGS;
  }

  // -------------------------------------------------------------------
  // Import: SceneConfig → GinConfig
  // -------------------------------------------------------------------

  /**
   * Import a SceneConfig into the GinConfig system.
   * Walks the SceneConfig tree and applies matching overrides.
   */
  importSceneConfig(sceneConfig: SceneConfig): void {
    // Register core configurables if not already registered
    this.ensureCoreConfigurables();

    // Apply scene-level seed
    if (sceneConfig.metadata?.seed !== undefined) {
      this.gin.seed = Number(sceneConfig.metadata.seed);
    }

    // Walk the mappings and import values
    for (const mapping of this.mappings) {
      const value = this.getNestedValue(sceneConfig, mapping.scenePath);
      if (value !== undefined) {
        const configValue = mapping.transform
          ? mapping.transform(value)
          : this.autoConvertToConfigValue(value);
        this.gin.setOverride(mapping.ginName, mapping.ginKey, configValue);
      }
    }

    // Import environment type
    if (sceneConfig.environment?.type) {
      this.gin.setOverride(
        'scene/environment',
        'type',
        sceneConfig.environment.type,
      );
    }

    // Import cameras
    if (sceneConfig.cameras && sceneConfig.cameras.length > 0) {
      this.importCameras(sceneConfig.cameras);
    }

    // Import objects as configurable overrides
    if (sceneConfig.objects) {
      this.importObjects(sceneConfig.objects);
    }
  }

  // -------------------------------------------------------------------
  // Export: GinConfig → SceneConfig
  // -------------------------------------------------------------------

  /**
   * Export the current GinConfig state as a SceneConfig.
   * Constructs a SceneConfig from the resolved GinConfig values.
   */
  exportSceneConfig(): SceneConfig {
    // Start with a base SceneConfig
    const config: SceneConfig = {
      name: 'GinConfig Export',
      version: '1.0.0',
      description: 'Auto-generated from GinConfig',
    };

    // Export seed
    config.metadata = {
      seed: this.gin.seed,
      ginConfigString: this.gin.toConfigString(),
    };

    // Export environment
    config.environment = this.exportEnvironment();

    // Export cameras
    const cameras = this.exportCameras();
    if (cameras.length > 0) {
      config.cameras = cameras;
    }

    // Export lighting
    config.lighting = this.exportLighting();

    // Export rendering
    config.rendering = this.exportRendering();

    return config;
  }

  /**
   * Get the GinConfig instance used by this bridge.
   */
  getGinConfig(): GinConfig {
    return this.gin;
  }

  /**
   * Update the GinConfig instance (e.g., after applying a preset).
   */
  setGinConfig(gin: GinConfig): void {
    this.gin = gin;
  }

  // -------------------------------------------------------------------
  // Import Helpers
  // -------------------------------------------------------------------

  private ensureCoreConfigurables(): void {
    // Register commonly used configurables with sensible defaults
    const coreConfigurables: Record<string, Record<string, ConfigValue>> = {
      'scene/environment': { type: 'outdoor' },
      'weather/WeatherSystem': {
        enabled: true,
        cloudCoverage: 0.3,
        windSpeed: 2.0,
      },
      'weather/TimeOfDaySystem': { hour: 12.0, month: 6 },
      'weather/FogSystem': { enabled: false, density: 0.001 },
      'lighting/LightingSystem': {
        ambientIntensity: 0.4,
        directionalIntensity: 1.0,
        shadowMapSize: 2048,
        castShadow: true,
      },
      'rendering/RenderingConfig': {
        toneMapping: 'aces',
        exposure: 1.0,
        shadowsEnabled: true,
        antialias: true,
      },
      'camera/CameraSystem': { fov: 60, near: 0.1, far: 1000 },
    };

    for (const [name, defaults] of Object.entries(coreConfigurables)) {
      if (!this.gin.hasConfigurable(name)) {
        this.gin.bindConfigurable(name, defaults);
      }
    }
  }

  private importCameras(cameras: CameraConfig[]): void {
    if (!this.gin.hasConfigurable('camera/CameraSystem')) {
      this.gin.bindConfigurable('camera/CameraSystem', {
        fov: 60,
        near: 0.1,
        far: 1000,
      });
    }

    // Import first camera as the primary
    const primary = cameras[0];
    if (primary.fov !== undefined) {
      this.gin.setOverride('camera/CameraSystem', 'fov', primary.fov);
    }
    if (primary.near !== undefined) {
      this.gin.setOverride('camera/CameraSystem', 'near', primary.near);
    }
    if (primary.far !== undefined) {
      this.gin.setOverride('camera/CameraSystem', 'far', primary.far);
    }
  }

  private importObjects(objects: any[]): void {
    for (const obj of objects) {
      const ginName = `objects/${obj.type}`;
      if (!this.gin.hasConfigurable(ginName)) {
        this.gin.bindConfigurable(ginName, {
          enabled: true,
          density: 0.1,
        });
      }

      if (obj.count !== undefined) {
        this.gin.setOverride(ginName, 'density', obj.count);
      }
      if (obj.properties) {
        for (const [key, value] of Object.entries(obj.properties)) {
          this.gin.setOverride(ginName, key, this.autoConvertToConfigValue(value));
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Export Helpers
  // -------------------------------------------------------------------

  private exportEnvironment(): EnvironmentConfig {
    const envConfig: EnvironmentConfig = {
      type: 'outdoor',
    };

    // Check GinConfig for environment type
    if (this.gin.hasConfigurable('scene/environment')) {
      const env = this.gin.getConfigurable('scene/environment');
      if (env.type) {
        envConfig.type = env.type as EnvironmentConfig['type'];
      }
    }

    // Weather system
    if (this.gin.hasConfigurable('weather/WeatherSystem')) {
      const weather = this.gin.getConfigurable('weather/WeatherSystem');
      envConfig.sky = {
        enabled: true,
        turbidity: configNumber(weather, 'cloudCoverage', 0.3) as any,
      };
    }

    // Fog
    if (this.gin.hasConfigurable('weather/FogSystem')) {
      const fog = this.gin.getConfigurable('weather/FogSystem');
      if (fog.enabled) {
        envConfig.fog = {
          enabled: true,
          density: configNumber(fog, 'density', 0.001),
        };
      }
    }

    return envConfig;
  }

  private exportCameras(): CameraConfig[] {
    if (!this.gin.hasConfigurable('camera/CameraSystem')) {
      return [];
    }

    const cam = this.gin.getConfigurable('camera/CameraSystem');
    return [{
      id: 'main',
      type: 'perspective',
      fov: configNumber(cam, 'fov', 60),
      near: configNumber(cam, 'near', 0.1),
      far: configNumber(cam, 'far', 1000),
    }];
  }

  private exportLighting(): LightingConfig {
    const lighting: LightingConfig = {};

    if (this.gin.hasConfigurable('lighting/LightingSystem')) {
      const ls = this.gin.getConfigurable('lighting/LightingSystem');
      lighting.ambient = {
        enabled: true,
        intensity: configNumber(ls, 'ambientIntensity', 0.4),
      };
      lighting.directional = [{
        enabled: true,
        intensity: configNumber(ls, 'directionalIntensity', 1.0),
        direction: [1, -1, 0.5] as Vector3Config,
        castShadow: configBoolean(ls, 'castShadow', true),
      }];
    }

    return lighting;
  }

  private exportRendering(): RenderingConfig {
    const rendering: RenderingConfig = {};

    if (this.gin.hasConfigurable('rendering/RenderingConfig')) {
      const rc = this.gin.getConfigurable('rendering/RenderingConfig');
      rendering.toneMapping = {
        type: (configString(rc, 'toneMapping', 'aces') as string) as any,
        exposure: configNumber(rc, 'exposure', 1.0),
      };
      rendering.shadows = {
        enabled: configBoolean(rc, 'shadowsEnabled', true),
        type: 'pcfSoft',
        mapSize: 2048,
      };
      rendering.antialias = {
        enabled: configBoolean(rc, 'antialias', true),
        samples: 4,
      };
    }

    return rendering;
  }

  // -------------------------------------------------------------------
  // Value Conversion
  // -------------------------------------------------------------------

  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      // Handle array indices like "0"
      if (/^\d+$/.test(part) && Array.isArray(current)) {
        current = current[parseInt(part, 10)];
      } else {
        current = current[part];
      }
    }
    return current;
  }

  private autoConvertToConfigValue(value: any): ConfigValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value) && value.length === 3 && typeof value[0] === 'number') {
      return vec3(value[0], value[1], value[2]);
    }
    return JSON.stringify(value);
  }
}

// ============================================================================
// Standalone Helper Functions
// ============================================================================

/**
 * Quick helper to extract a number from a ResolvedConfig with fallback.
 * (Re-exported from Configurable for convenience)
 */
function configNumber(config: Record<string, ConfigValue>, key: string, fallback: number): number {
  const val = config[key];
  return typeof val === 'number' ? val : fallback;
}

/**
 * Quick helper to extract a string from a ResolvedConfig with fallback.
 */
function configString(config: Record<string, ConfigValue>, key: string, fallback: string): string {
  const val = config[key];
  return typeof val === 'string' ? val : fallback;
}

/**
 * Quick helper to extract a boolean from a ResolvedConfig with fallback.
 */
function configBoolean(config: Record<string, ConfigValue>, key: string, fallback: boolean): boolean {
  const val = config[key];
  return typeof val === 'boolean' ? val : fallback;
}
