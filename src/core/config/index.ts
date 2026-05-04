/**
 * Config Module — gin-config Style Configuration System for infinigen-r3f
 *
 * This module provides a comprehensive configuration system equivalent to
 * Python's gin-config, ported to TypeScript for the R3F project.
 *
 * Key features:
 * - Hierarchical parameter binding with fully-qualified names
 * - Parameter interpolation via `${reference}` syntax
 * - Composable configs with merge/clone
 * - Runtime overrides
 * - Reproducible config strings
 * - Integration with SeededRandom for deterministic generation
 *
 * Usage:
 * ```ts
 * import { GinConfig, configurable, initConfigurable } from '@/core/config';
 *
 * // Create a config engine
 * const gin = new GinConfig(42);
 *
 * // Register configurables
 * gin.bindConfigurable('terrain/TerrainGenerator', {
 *   seed: 42, width: 512, scale: 100,
 * });
 *
 * // Override at runtime
 * gin.setOverride('terrain/TerrainGenerator', 'seed', 123);
 *
 * // Get resolved config
 * const config = gin.getConfigurable('terrain/TerrainGenerator');
 * // config.seed === 123
 *
 * // Serialize for reproducibility
 * const configStr = gin.toConfigString();
 * ```
 *
 * @module core/config
 */

// Core engine
export {
  GinConfig,
  getGlobalGin,
  setGlobalGin,
  resetGlobalGin,
  vec3,
  color,
  enumVal,
  isVector3Value,
  isColorValue,
  isEnumValue,
} from './GinConfig';

export type {
  ConfigValue,
  Vector3Value,
  ColorValue,
  EnumValue,
  ConfigurableEntry,
  ResolvedConfig,
  GinConfigSnapshot,
} from './GinConfig';

// Configurable decorator/mixin
export {
  configurable,
  makeConfigurable,
  initConfigurable,
  toConfigValue,
  fromConfigValue,
  configNumber,
  configString,
  configBoolean,
  configVector3,
  configColor,
  configEnum,
  getConfigurableMetadata,
} from './Configurable';

export type {
  ConfigurableMetadata,
  ConfigurableInstance,
} from './Configurable';

// Parser
export {
  parseConfigString,
  parseValue,
  serializeValue,
  serializeConfig,
  validateConfigString,
} from './ConfigParser';

export type {
  ParsedOverride,
  ParsedInclude,
  ParsedSymbol,
  ParsedConfig,
} from './ConfigParser';

// Presets
export {
  NATURE_PRESET,
  INDOOR_PRESET,
  ALPINE_PRESET,
  TROPICAL_PRESET,
  OCEAN_PRESET,
  BUILTIN_PRESETS,
  getPreset,
  getPresetIds,
  getPresetsByCategory,
  applyPreset,
  getBaseConfigString,
  createCustomPreset,
} from './ConfigPresets';

export type {
  ConfigPreset,
} from './ConfigPresets';

// Integration bridge
export {
  GinConfigBridge,
} from './SceneConfigBridge';

export type {
  SceneConfigGinMapping,
} from './SceneConfigBridge';
