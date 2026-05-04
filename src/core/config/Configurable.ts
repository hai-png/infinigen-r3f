/**
 * Configurable.ts — Decorator/Mixin for Making Classes Configurable
 *
 * Provides two mechanisms for integrating classes with GinConfig:
 *
 * 1. **`@configurable(name)` decorator** — for declarative registration
 * 2. **`makeConfigurable(Class, name)` function** — for imperative/programmatic use
 *
 * Configurable classes automatically:
 * - Register their default parameters with GinConfig
 * - Read bound parameters from GinConfig in the constructor
 * - Expose `this.config` with resolved values
 * - Support parameter types: number, string, boolean, Vector3, Color, enum
 *
 * Works with SeededRandom for deterministic generation.
 */

import { Vector3, Color } from 'three';
import {
  GinConfig,
  ConfigValue,
  ResolvedConfig,
  Vector3Value,
  ColorValue,
  EnumValue,
  isVector3Value,
  isColorValue,
  isEnumValue,
  getGlobalGin,
  vec3,
  color,
} from './GinConfig';
import { SeededRandom } from '../util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata stored on a configurable class constructor.
 */
export interface ConfigurableMetadata {
  /** The fully-qualified configurable name. */
  ginName: string;
  /** Default parameter values. */
  ginDefaults: Record<string, ConfigValue>;
  /** Optional description. */
  ginDescription?: string;
}

/**
 * Interface for configurable instances.
 * Any class that uses `@configurable` or `makeConfigurable` will have
 * these properties and methods.
 */
export interface ConfigurableInstance {
  /** The GinConfig instance this object reads from. */
  gin: GinConfig;

  /** The fully-qualified configurable name. */
  ginName: string;

  /** Resolved configuration values (defaults + overrides). */
  config: ResolvedConfig;

  /** SeededRandom derived from the configurable name and global seed. */
  configRng: SeededRandom;

  /**
   * Refresh the config from GinConfig (pick up any overrides applied
   * since construction).
   */
  refreshConfig(): void;

  /**
   * Update a single config parameter at runtime.
   */
  setConfigValue(key: string, value: ConfigValue): void;

  /**
   * Get the defaults for this configurable.
   */
  getConfigDefaults(): Record<string, ConfigValue>;
}

/**
 * Symbol used to store metadata on class constructors.
 */
const CONFIGURABLE_METADATA = Symbol('gin:configurable');

// ============================================================================
// Decorator
// ============================================================================

/**
 * Class decorator that registers the class with GinConfig and provides
 * `this.config` access in the constructor.
 *
 * Usage:
 * ```ts
 * @configurable('terrain/TerrainGenerator')
 * class TerrainGenerator {
 *   static ginDefaults = {
 *     seed: 42,
 *     width: 512,
 *     scale: 100,
 *   };
 *
 *   config: ResolvedConfig;
 *   gin: GinConfig;
 *   ginName: string;
 *   configRng: SeededRandom;
 *
 *   constructor(partial?: Partial<typeof TerrainGenerator.ginDefaults>) {
 *     initConfigurable(this, TerrainGenerator, partial);
 *     // this.config.seed, this.config.width, etc. are available
 *   }
 * }
 * ```
 *
 * @param name - Fully-qualified configurable name (e.g., "terrain/TerrainGenerator")
 */
export function configurable(name: string) {
  return function <T extends new (...args: any[]) => any>(constructor: T): T {
    // Store metadata on the constructor
    const defaults = (constructor as any).ginDefaults ?? {};
    const description = (constructor as any).ginDescription;

    (constructor as any)[CONFIGURABLE_METADATA] = {
      ginName: name,
      ginDefaults: defaults,
      ginDescription: description,
    } satisfies ConfigurableMetadata;

    // Register with the global GinConfig
    const gin = getGlobalGin();
    gin.bindConfigurable(name, defaults, description);

    return constructor;
  };
}

// ============================================================================
// Mixin Function
// ============================================================================

/**
 * Make an existing class configurable without using a decorator.
 * Useful for classes you don't control or when using a functional style.
 *
 * Usage:
 * ```ts
 * class TerrainGenerator { ... }
 * const ConfigurableTerrain = makeConfigurable(TerrainGenerator, 'terrain/TerrainGenerator', {
 *   seed: 42,
 *   width: 512,
 * });
 * const gen = new ConfigurableTerrain();
 * gen.config.seed; // 42 (or override value)
 * ```
 *
 * @param BaseClass - The class to make configurable
 * @param name - Fully-qualified configurable name
 * @param defaults - Default parameter values
 * @param description - Optional description
 */
export function makeConfigurable<T extends new (...args: any[]) => any>(
  BaseClass: T,
  name: string,
  defaults: Record<string, ConfigValue> = {},
  description?: string,
): T {
  // Store metadata
  (BaseClass as any)[CONFIGURABLE_METADATA] = {
    ginName: name,
    ginDefaults: defaults,
    ginDescription: description,
  } satisfies ConfigurableMetadata;

  // Register with the global GinConfig
  const gin = getGlobalGin();
  gin.bindConfigurable(name, defaults, description);

  return BaseClass;
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the configurable properties on an instance.
 *
 * Call this in the constructor of a `@configurable` class:
 *
 * ```ts
 * constructor(partial?: Record<string, any>) {
 *   initConfigurable(this, MyConfigurableClass, partial);
 * }
 * ```
 *
 * @param instance - The class instance being constructed
 * @param Class - The class constructor
 * @param partialOverrides - Optional partial overrides from the caller
 * @param gin - Optional GinConfig instance (defaults to global)
 */
export function initConfigurable(
  instance: any,
  Class: new (...args: any[]) => any,
  partialOverrides?: Record<string, any>,
  gin?: GinConfig,
): void {
  const metadata: ConfigurableMetadata | undefined =
    (Class as any)[CONFIGURABLE_METADATA];

  if (!metadata) {
    throw new Error(
      `Class ${(Class as any).name} is not decorated with @configurable() ` +
      `or makeConfigurable(). Ensure the decorator is applied.`
    );
  }

  const configEngine = gin ?? getGlobalGin();
  const { ginName, ginDefaults, ginDescription } = metadata;

  // Apply partial overrides as temporary overrides in GinConfig
  if (partialOverrides) {
    const typedOverrides: Record<string, ConfigValue> = {};
    for (const [key, value] of Object.entries(partialOverrides)) {
      typedOverrides[key] = toConfigValue(value);
    }
    // Only set overrides for keys that differ from defaults
    for (const [key, value] of Object.entries(typedOverrides)) {
      if (!valuesMatch(value, ginDefaults[key])) {
        configEngine.setOverride(ginName, key, value);
      }
    }
  }

  // Get resolved config
  const resolved = configEngine.getConfigurable(ginName);

  // Attach properties to the instance
  instance.gin = configEngine;
  instance.ginName = ginName;
  instance.config = resolved;
  instance.configRng = configEngine.createChildRng(ginName);

  // Attach methods
  instance.refreshConfig = function (this: any) {
    this.config = this.gin.getConfigurable(this.ginName);
  };

  instance.setConfigValue = function (this: any, key: string, value: ConfigValue) {
    this.gin.setOverride(this.ginName, key, value);
    this.config = this.gin.getConfigurable(this.ginName);
  };

  instance.getConfigDefaults = function () {
    return { ...ginDefaults };
  };
}

// ============================================================================
// Value Conversion
// ============================================================================

/**
 * Convert a runtime value to a ConfigValue for storage in GinConfig.
 * Handles THREE.Vector3 → Vector3Value and THREE.Color → ColorValue.
 */
export function toConfigValue(value: any): ConfigValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  // THREE.Vector3
  if (value instanceof Vector3) {
    return vec3(value.x, value.y, value.z);
  }

  // THREE.Color
  if (value instanceof Color) {
    return color(value.r, value.g, value.b);
  }

  // Already a ConfigValue object
  if (typeof value === 'object' && '__type' in value) {
    return value as ConfigValue;
  }

  // Fallback: stringify
  return String(value);
}

/**
 * Convert a ConfigValue back to a runtime value.
 * Vector3Value → THREE.Vector3, ColorValue → THREE.Color, etc.
 */
export function fromConfigValue(value: ConfigValue): any {
  if (value === null) return null;

  if (isVector3Value(value)) {
    return new Vector3(value.x, value.y, value.z);
  }

  if (isColorValue(value)) {
    return new Color(value.r, value.g, value.b);
  }

  if (isEnumValue(value)) {
    return value.value;
  }

  return value;
}

/**
 * Extract a typed number from config, with fallback.
 */
export function configNumber(config: ResolvedConfig, key: string, fallback: number = 0): number {
  const val = config[key];
  return typeof val === 'number' ? val : fallback;
}

/**
 * Extract a typed string from config, with fallback.
 */
export function configString(config: ResolvedConfig, key: string, fallback: string = ''): string {
  const val = config[key];
  return typeof val === 'string' ? val : fallback;
}

/**
 * Extract a typed boolean from config, with fallback.
 */
export function configBoolean(config: ResolvedConfig, key: string, fallback: boolean = false): boolean {
  const val = config[key];
  return typeof val === 'boolean' ? val : fallback;
}

/**
 * Extract a Vector3 from config, with fallback.
 */
export function configVector3(config: ResolvedConfig, key: string, fallback: Vector3 = new Vector3()): Vector3 {
  const val = config[key];
  if (isVector3Value(val)) {
    return new Vector3(val.x, val.y, val.z);
  }
  return fallback;
}

/**
 * Extract a Color from config, with fallback.
 */
export function configColor(config: ResolvedConfig, key: string, fallback: Color = new Color()): Color {
  const val = config[key];
  if (isColorValue(val)) {
    return new Color(val.r, val.g, val.b);
  }
  return fallback;
}

/**
 * Extract an enum value from config, with fallback.
 */
export function configEnum<T extends string>(config: ResolvedConfig, key: string, fallback: T): T {
  const val = config[key];
  if (isEnumValue(val)) {
    return val.value as T;
  }
  if (typeof val === 'string') {
    return val as T;
  }
  return fallback;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Check if a runtime value matches a ConfigValue.
 */
function valuesMatch(runtime: ConfigValue, configDefault: ConfigValue): boolean {
  if (runtime === configDefault) return true;
  if (runtime === null || configDefault === null) return false;
  if (typeof runtime !== typeof configDefault) return false;
  if (typeof runtime === 'object' && typeof configDefault === 'object') {
    return JSON.stringify(runtime) === JSON.stringify(configDefault);
  }
  return false;
}

/**
 * Get the configurable metadata from a class constructor.
 */
export function getConfigurableMetadata(
  Class: new (...args: any[]) => any,
): ConfigurableMetadata | undefined {
  return (Class as any)[CONFIGURABLE_METADATA];
}
