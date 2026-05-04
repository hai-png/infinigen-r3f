/**
 * GinConfig.ts — Core Configuration Engine
 *
 * A TypeScript implementation of gin-config style hierarchical parameter
 * binding for the infinigen-r3f project. Provides:
 *
 *   1. **Hierarchical parameter binding** — parameters are bound to specific
 *      configurable names and override their defaults.
 *   2. **Parameter interpolation** — config values can reference other config
 *      values via `${namespace/key}` syntax.
 *   3. **Composability** — multiple configs can be merged with precedence.
 *   4. **Runtime overrides** — parameters can be changed at runtime.
 *   5. **Reproducibility** — `toConfigString()` fully determines generation output.
 *
 * Designed to work with SeededRandom for deterministic generation.
 */

import { SeededRandom } from '../util/MathUtils';
import { parseConfigString, type ParsedOverride, type ParsedInclude } from './ConfigParser';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported parameter value types in the config system.
 * Primitive types are stored directly; Vector3/Color are stored as serializable
 * objects and reconstructed on access.
 */
export type ConfigValue =
  | number
  | string
  | boolean
  | Vector3Value
  | ColorValue
  | EnumValue
  | null;

/**
 * Serializable representation of a THREE.Vector3.
 */
export interface Vector3Value {
  __type: 'Vector3';
  x: number;
  y: number;
  z: number;
}

/**
 * Serializable representation of a THREE.Color.
 */
export interface ColorValue {
  __type: 'Color';
  r: number;
  g: number;
  b: number;
}

/**
 * Serializable representation of an enum/object reference.
 */
export interface EnumValue {
  __type: 'Enum';
  enumName: string;
  value: string;
}

/**
 * A single configurable registration entry.
 */
export interface ConfigurableEntry {
  /** Fully-qualified name, e.g. "terrain/TerrainGenerator" */
  name: string;
  /** Default parameter values */
  defaults: Record<string, ConfigValue>;
  /** Current overrides (keys that differ from defaults) */
  overrides: Record<string, ConfigValue>;
  /** Description for documentation */
  description?: string;
}

/**
 * Result of resolving all interpolations for a configurable.
 */
export type ResolvedConfig = Record<string, ConfigValue>;

/**
 * A snapshot of the entire config state for serialization.
 */
export interface GinConfigSnapshot {
  version: string;
  configurables: Record<string, {
    defaults: Record<string, ConfigValue>;
    overrides: Record<string, ConfigValue>;
    description?: string;
  }>;
  symbols: Record<string, ConfigValue>;
  includes: string[];
}

// ============================================================================
// GinConfig Class
// ============================================================================

/**
 * Core configuration engine — the central registry for all configurable
 * parameters in the infinigen-r3f scene generation pipeline.
 *
 * Usage:
 * ```ts
 * const gin = new GinConfig();
 * gin.bindConfigurable('terrain/TerrainGenerator', {
 *   seed: 42,
 *   width: 512,
 *   height: 512,
 *   scale: 100,
 * });
 * gin.setOverride('terrain/TerrainGenerator', 'seed', 123);
 * const config = gin.getConfigurable('terrain/TerrainGenerator');
 * // config.seed === 123
 * ```
 */
export class GinConfig {
  // -------------------------------------------------------------------
  // Internal State
  // -------------------------------------------------------------------

  /** Registry of all configurables keyed by their fully-qualified name. */
  private registry: Map<string, ConfigurableEntry> = new Map();

  /** Symbol table for @references (named values). */
  private symbols: Map<string, ConfigValue> = new Map();

  /** List of included config files (for reproducibility). */
  private includes: string[] = [];

  /** Interpolation references: maps `namespace/key` to `targetNamespace/key`. */
  private references: Map<string, string> = new Map();

  /** Global seed for the scene, used as the root of deterministic generation. */
  private _seed: number = 42;

  /** SeededRandom derived from the global seed. */
  private _rng: SeededRandom;

  /** Version stamp for serialization. */
  private static VERSION = '1.0.0';

  // -------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------

  constructor(seed: number = 42) {
    this._seed = seed;
    this._rng = new SeededRandom(seed);
  }

  // -------------------------------------------------------------------
  // Seed & RNG
  // -------------------------------------------------------------------

  /** Get the global scene seed. */
  get seed(): number {
    return this._seed;
  }

  /** Set the global scene seed and re-create the RNG. */
  set seed(value: number) {
    this._seed = value;
    this._rng = new SeededRandom(value);
  }

  /** Get the global SeededRandom instance. */
  get rng(): SeededRandom {
    return this._rng;
  }

  /**
   * Create a child SeededRandom with a deterministic sub-seed derived
   * from the configurable name. This ensures each generator gets its own
   * deterministic stream without interfering with others.
   */
  createChildRng(name: string): SeededRandom {
    // Simple hash of the name to produce a sub-seed
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      const ch = name.charCodeAt(i);
      hash = ((hash << 5) - hash + ch) | 0;
    }
    return new SeededRandom(this._seed + Math.abs(hash));
  }

  // -------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------

  /**
   * Register a configurable with default parameters.
   *
   * @param name - Fully-qualified name (e.g., "terrain/TerrainGenerator")
   * @param defaults - Default parameter values
   * @param description - Optional description for documentation
   * @throws Error if a configurable with this name is already registered
   */
  bindConfigurable(
    name: string,
    defaults: Record<string, ConfigValue>,
    description?: string,
  ): void {
    if (this.registry.has(name)) {
      // Merge new defaults into existing entry rather than throwing,
      // allowing progressive registration
      const existing = this.registry.get(name)!;
      existing.defaults = { ...existing.defaults, ...defaults };
      if (description) {
        existing.description = description;
      }
      return;
    }

    this.registry.set(name, {
      name,
      defaults: { ...defaults },
      overrides: {},
      description,
    });
  }

  /**
   * Check if a configurable is registered.
   */
  hasConfigurable(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * Get the list of all registered configurable names.
   */
  getConfigurableNames(): string[] {
    return Array.from(this.registry.keys());
  }

  // -------------------------------------------------------------------
  // Override Management
  // -------------------------------------------------------------------

  /**
   * Override a specific parameter on a configurable.
   *
   * @param name - Configurable name
   * @param key - Parameter key
   * @param value - New value
   * @throws Error if the configurable is not registered
   */
  setOverride(name: string, key: string, value: ConfigValue): void {
    const entry = this.getEntryOrThrow(name);

    // If value matches the default, remove the override
    if (this.valuesEqual(value, entry.defaults[key])) {
      delete entry.overrides[key];
    } else {
      entry.overrides[key] = value;
    }

    // If the value is a reference, store it
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      const refKey = value.slice(2, -1);
      this.references.set(`${name}.${key}`, refKey);
    }
  }

  /**
   * Set multiple overrides at once.
   */
  setOverrides(name: string, overrides: Record<string, ConfigValue>): void {
    for (const [key, value] of Object.entries(overrides)) {
      this.setOverride(name, key, value);
    }
  }

  /**
   * Remove a specific override, reverting to the default value.
   */
  clearOverride(name: string, key: string): void {
    const entry = this.getEntryOrThrow(name);
    delete entry.overrides[key];
    this.references.delete(`${name}.${key}`);
  }

  /**
   * Remove all overrides for a configurable.
   */
  clearAllOverrides(name: string): void {
    const entry = this.getEntryOrThrow(name);
    entry.overrides = {};
    // Clean up references for this configurable
    for (const refKey of this.references.keys()) {
      if (refKey.startsWith(`${name}.`)) {
        this.references.delete(refKey);
      }
    }
  }

  // -------------------------------------------------------------------
  // Resolution & Access
  // -------------------------------------------------------------------

  /**
   * Get the current resolved parameters for a configurable.
   * Resolves interpolations and merges defaults with overrides.
   *
   * @param name - Configurable name
   * @returns Resolved parameter object
   */
  getConfigurable(name: string): ResolvedConfig {
    const entry = this.getEntryOrThrow(name);
    return this.resolveEntry(entry);
  }

  /**
   * Get a single resolved parameter value.
   */
  getValue(name: string, key: string): ConfigValue {
    const config = this.getConfigurable(name);
    return config[key] ?? null;
  }

  /**
   * Resolve all configurables and return a complete snapshot.
   */
  resolveAll(): Record<string, ResolvedConfig> {
    const result: Record<string, ResolvedConfig> = {};
    for (const [name, entry] of this.registry) {
      result[name] = this.resolveEntry(entry);
    }
    return result;
  }

  /**
   * Resolve a single entry by merging defaults with overrides and
   * resolving any interpolation references.
   */
  private resolveEntry(entry: ConfigurableEntry): ResolvedConfig {
    const resolved: ResolvedConfig = { ...entry.defaults };

    // Apply overrides
    for (const [key, value] of Object.entries(entry.overrides)) {
      resolved[key] = this.resolveValue(value);
    }

    // Resolve any interpolation references in the resolved values
    for (const key of Object.keys(resolved)) {
      const value = resolved[key];
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const refPath = value.slice(2, -1);
        resolved[key] = this.resolveReference(refPath);
      }
    }

    return resolved;
  }

  /**
   * Resolve a single value, handling @symbol references.
   */
  private resolveValue(value: ConfigValue): ConfigValue {
    if (typeof value === 'string' && value.startsWith('@')) {
      const symbolName = value.slice(1);
      const symbolValue = this.symbols.get(symbolName);
      if (symbolValue !== undefined) {
        return symbolValue;
      }
    }
    return value;
  }

  /**
   * Resolve a reference path like "scene/seed" to its current value.
   */
  private resolveReference(refPath: string): ConfigValue {
    // Try to find the referenced configurable
    const parts = refPath.split('.');
    if (parts.length === 2) {
      const [configName, key] = parts;
      const entry = this.registry.get(configName);
      if (entry) {
        const resolved = this.resolveEntry(entry);
        return resolved[key] ?? null;
      }
    }

    // Try as namespace/key (e.g., "scene/seed" where "scene/seed" is a key)
    const lastSlash = refPath.lastIndexOf('/');
    if (lastSlash !== -1) {
      const configName = refPath.substring(0, lastSlash);
      const key = refPath.substring(lastSlash + 1);
      // Try to find configurable matching the prefix
      for (const [name, entry] of this.registry) {
        if (name === configName || name.startsWith(configName + '/')) {
          const resolved = this.resolveEntry(entry);
          if (key in resolved) {
            return resolved[key];
          }
        }
      }
    }

    // Try as a symbol
    const symbolValue = this.symbols.get(refPath);
    if (symbolValue !== undefined) {
      return symbolValue;
    }

    return null;
  }

  // -------------------------------------------------------------------
  // Symbols
  // -------------------------------------------------------------------

  /**
   * Register a named symbol that can be referenced with @symbolName.
   *
   * @param name - Symbol name (e.g., "feline_cheetah")
   * @param value - The value the symbol resolves to
   */
  registerSymbol(name: string, value: ConfigValue): void {
    this.symbols.set(name, value);
  }

  /**
   * Get a registered symbol value.
   */
  getSymbol(name: string): ConfigValue | undefined {
    return this.symbols.get(name);
  }

  /**
   * Get all registered symbol names.
   */
  getSymbolNames(): string[] {
    return Array.from(this.symbols.keys());
  }

  // -------------------------------------------------------------------
  // Config String (Serialization)
  // -------------------------------------------------------------------

  /**
   * Serialize the current overrides to a reproducible config string.
   * The output can be fed back into `fromConfigString()` to reproduce
   * the exact same generation.
   *
   * Format:
   * ```
   * # Generated by GinConfig v1.0.0
   * scene/seed = 42
   * terrain/TerrainGenerator.seed = 123
   * terrain/TerrainGenerator.scale = 200
   * creatures/CreatureBase.body_profile = @feline_cheetah
   * ```
   */
  toConfigString(): string {
    const lines: string[] = [];
    lines.push(`# Generated by GinConfig v${GinConfig.VERSION}`);
    lines.push(`# Seed: ${this._seed}`);
    lines.push('');

    // Output global seed
    lines.push(`scene/seed = ${this._seed}`);
    lines.push('');

    // Output includes
    for (const include of this.includes) {
      lines.push(`@include ${include}`);
    }
    if (this.includes.length > 0) {
      lines.push('');
    }

    // Output symbols
    for (const [name, value] of this.symbols) {
      lines.push(`@${name} = ${this.serializeValue(value)}`);
    }
    if (this.symbols.size > 0) {
      lines.push('');
    }

    // Output overrides grouped by configurable
    const overridesByConfig = this.groupOverridesByConfig();
    for (const [configName, overrides] of overridesByConfig) {
      lines.push(`# ${configName}`);
      for (const [key, value] of Object.entries(overrides)) {
        lines.push(`${configName}.${key} = ${this.serializeValue(value)}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Deserialize and apply overrides from a config string.
   *
   * @param str - Config string in gin-config syntax
   * @throws Error on parse errors
   */
  fromConfigString(str: string): void {
    const { overrides, includes, symbols, seed } = parseConfigString(str);

    // Apply seed first
    if (seed !== undefined) {
      this.seed = seed;
    }

    // Register symbols
    for (const sym of symbols) {
      this.registerSymbol(sym.name, sym.value);
    }

    // Record includes for reproducibility
    for (const inc of includes) {
      if (!this.includes.includes(inc.file)) {
        this.includes.push(inc.file);
      }
    }

    // Apply overrides
    for (const ov of overrides) {
      const { configName, key, value } = ov;
      // Auto-register if not yet registered
      if (!this.registry.has(configName)) {
        this.bindConfigurable(configName, {});
      }
      this.setOverride(configName, key, value);
    }
  }

  /**
   * Parse a config string and apply it (alias for fromConfigString).
   */
  setOverridesFromString(str: string): void {
    this.fromConfigString(str);
  }

  // -------------------------------------------------------------------
  // Merge & Clone
  // -------------------------------------------------------------------

  /**
   * Merge another GinConfig into this one with precedence.
   * Values from `other` take precedence over values in `this`.
   *
   * @param other - The other config to merge in
   * @param precedence - Which config takes precedence for conflicts
   */
  merge(other: GinConfig, precedence: 'this' | 'other' = 'other'): GinConfig {
    const result = this.clone();

    // Merge symbols
    for (const [name, value] of other.symbols) {
      if (precedence === 'other' || !result.symbols.has(name)) {
        result.symbols.set(name, value);
      }
    }

    // Merge includes
    for (const inc of other.includes) {
      if (!result.includes.includes(inc)) {
        result.includes.push(inc);
      }
    }

    // Merge registry entries
    for (const [name, entry] of other.registry) {
      if (!result.registry.has(name)) {
        result.registry.set(name, {
          name: entry.name,
          defaults: { ...entry.defaults },
          overrides: { ...entry.overrides },
          description: entry.description,
        });
      } else {
        const existing = result.registry.get(name)!;
        // Merge defaults
        if (precedence === 'other') {
          existing.defaults = { ...existing.defaults, ...entry.defaults };
        }
        // Merge overrides — other takes precedence
        existing.overrides = { ...existing.overrides, ...entry.overrides };
      }
    }

    // Use the other's seed if it differs and precedence is 'other'
    if (precedence === 'other' && other.seed !== this.seed) {
      result.seed = other.seed;
    }

    return result;
  }

  /**
   * Create a deep clone of this config.
   */
  clone(): GinConfig {
    const cloned = new GinConfig(this._seed);

    // Clone registry
    for (const [name, entry] of this.registry) {
      cloned.registry.set(name, {
        name: entry.name,
        defaults: { ...entry.defaults },
        overrides: { ...entry.overrides },
        description: entry.description,
      });
    }

    // Clone symbols
    for (const [name, value] of this.symbols) {
      cloned.symbols.set(name, this.deepCloneValue(value));
    }

    // Clone includes and references
    cloned.includes = [...this.includes];
    for (const [key, value] of this.references) {
      cloned.references.set(key, value);
    }

    return cloned;
  }

  // -------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------

  /**
   * Validate all registered configurables. Checks that:
   * 1. All overrides reference keys that exist in defaults
   * 2. All interpolation references can be resolved
   * 3. All symbol references exist
   *
   * @returns Array of validation warnings (empty if all valid)
   */
  validate(): string[] {
    const warnings: string[] = [];

    for (const [name, entry] of this.registry) {
      // Check overrides reference existing keys
      for (const key of Object.keys(entry.overrides)) {
        if (!(key in entry.defaults)) {
          warnings.push(
            `${name}: Override key "${key}" has no corresponding default. ` +
            `This will add a new parameter.`
          );
        }
      }

      // Check interpolation references
      for (const [key, value] of Object.entries(entry.overrides)) {
        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
          const refPath = value.slice(2, -1);
          const resolved = this.resolveReference(refPath);
          if (resolved === null) {
            warnings.push(
              `${name}.${key}: Reference "${refPath}" could not be resolved.`
            );
          }
        }

        // Check symbol references
        if (typeof value === 'string' && value.startsWith('@')) {
          const symbolName = value.slice(1);
          if (!this.symbols.has(symbolName)) {
            warnings.push(
              `${name}.${key}: Symbol "@${symbolName}" is not registered.`
            );
          }
        }
      }
    }

    return warnings;
  }

  // -------------------------------------------------------------------
  // Snapshot
  // -------------------------------------------------------------------

  /**
   * Create a serializable snapshot of the entire config state.
   */
  toSnapshot(): GinConfigSnapshot {
    const configurables: GinConfigSnapshot['configurables'] = {};

    for (const [name, entry] of this.registry) {
      configurables[name] = {
        defaults: { ...entry.defaults },
        overrides: { ...entry.overrides },
        description: entry.description,
      };
    }

    const symbols: Record<string, ConfigValue> = {};
    for (const [name, value] of this.symbols) {
      symbols[name] = value;
    }

    return {
      version: GinConfig.VERSION,
      configurables,
      symbols,
      includes: [...this.includes],
    };
  }

  /**
   * Restore config state from a snapshot.
   */
  fromSnapshot(snapshot: GinConfigSnapshot): void {
    this.registry.clear();
    this.symbols.clear();
    this.includes = [...snapshot.includes];

    for (const [name, data] of Object.entries(snapshot.configurables)) {
      this.registry.set(name, {
        name,
        defaults: { ...data.defaults },
        overrides: { ...data.overrides },
        description: data.description,
      });
    }

    for (const [name, value] of Object.entries(snapshot.symbols)) {
      this.symbols.set(name, value);
    }
  }

  /**
   * Convert the full resolved config to a JSON string.
   */
  toJSON(pretty: boolean = true): string {
    return JSON.stringify(this.resolveAll(), null, pretty ? 2 : 0);
  }

  // -------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------

  /**
   * Reset all overrides, symbols, and includes back to defaults.
   */
  reset(): void {
    for (const entry of this.registry.values()) {
      entry.overrides = {};
    }
    this.symbols.clear();
    this.includes = [];
    this.references.clear();
  }

  // -------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------

  private getEntryOrThrow(name: string): ConfigurableEntry {
    const entry = this.registry.get(name);
    if (!entry) {
      throw new Error(
        `Configurable "${name}" is not registered. ` +
        `Call bindConfigurable() first.`
      );
    }
    return entry;
  }

  private serializeValue(value: ConfigValue): string {
    if (value === null) return 'null';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'string') {
      // Strings that look like references or symbols should not be quoted
      if (value.startsWith('@') || value.startsWith('${')) {
        return value;
      }
      return `"${value}"`;
    }
    if (typeof value === 'object' && '__type' in value) {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private deepCloneValue(value: ConfigValue): ConfigValue {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    return { ...(value as object) } as ConfigValue;
  }

  private valuesEqual(a: ConfigValue, b: ConfigValue): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  private groupOverridesByConfig(): Map<string, Record<string, ConfigValue>> {
    const groups = new Map<string, Record<string, ConfigValue>>();
    for (const [name, entry] of this.registry) {
      if (Object.keys(entry.overrides).length > 0) {
        groups.set(name, { ...entry.overrides });
      }
    }
    return groups;
  }
}

// ============================================================================
// Convenience: Global Instance
// ============================================================================

/**
 * Default global GinConfig instance.
 * Use this for simple scenes, or create your own for isolated configurations.
 */
let globalGin: GinConfig | null = null;

/**
 * Get the global GinConfig instance (lazy-initialized).
 */
export function getGlobalGin(): GinConfig {
  if (!globalGin) {
    globalGin = new GinConfig();
  }
  return globalGin;
}

/**
 * Set the global GinConfig instance.
 */
export function setGlobalGin(gin: GinConfig): void {
  globalGin = gin;
}

/**
 * Reset the global GinConfig instance (creates a new one with the given seed).
 */
export function resetGlobalGin(seed: number = 42): GinConfig {
  globalGin = new GinConfig(seed);
  return globalGin;
}

// ============================================================================
// Value Constructors
// ============================================================================

/**
 * Create a Vector3 config value.
 */
export function vec3(x: number, y: number, z: number): Vector3Value {
  return { __type: 'Vector3', x, y, z };
}

/**
 * Create a Color config value.
 */
export function color(r: number, g: number, b: number): ColorValue {
  return { __type: 'Color', r, g, b };
}

/**
 * Create an Enum config value.
 */
export function enumVal(enumName: string, value: string): EnumValue {
  return { __type: 'Enum', enumName, value };
}

/**
 * Type guard for Vector3Value.
 */
export function isVector3Value(v: ConfigValue): v is Vector3Value {
  return v !== null && typeof v === 'object' && '__type' in v && v.__type === 'Vector3';
}

/**
 * Type guard for ColorValue.
 */
export function isColorValue(v: ConfigValue): v is ColorValue {
  return v !== null && typeof v === 'object' && '__type' in v && v.__type === 'Color';
}

/**
 * Type guard for EnumValue.
 */
export function isEnumValue(v: ConfigValue): v is EnumValue {
  return v !== null && typeof v === 'object' && '__type' in v && v.__type === 'Enum';
}
