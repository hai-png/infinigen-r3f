/**
 * ConfigParser.ts — Parse gin-config Style Configuration Syntax
 *
 * Parses a human-readable configuration format inspired by Google's gin-config:
 *
 * ```
 * # Comment lines start with #
 * terrain/TerrainGenerator.seed = 42
 * terrain/TerrainGenerator.width = 512
 * terrain/TerrainGenerator.biome = "alpine"
 * creatures/CreatureBase.body_profile = @feline_cheetah
 *
 * # Interpolation references
 * scene/seed = 42
 * terrain/TerrainGenerator.seed = ${scene/seed}
 *
 * # Include other config files
 * @include base_nature.gin
 * @include alpine_overrides.gin
 *
 * # Symbol definitions
 * @feline_cheetah = {"__type":"Enum","enumName":"BodyProfile","value":"cheetah"}
 * ```
 *
 * The parser is stateless — it takes a string and returns structured data.
 * File inclusion resolution is handled by the caller (GinConfig.fromConfigString).
 */

import { ConfigValue, Vector3Value, ColorValue, EnumValue, vec3, color, enumVal } from './GinConfig';

// ============================================================================
// Parsed Result Types
// ============================================================================

/**
 * A single parsed override: configName.key = value
 */
export interface ParsedOverride {
  /** The configurable name (part before the last dot). */
  configName: string;
  /** The parameter key (part after the last dot). */
  key: string;
  /** The parsed value. */
  value: ConfigValue;
}

/**
 * A parsed @include directive.
 */
export interface ParsedInclude {
  /** The file path to include. */
  file: string;
}

/**
 * A parsed symbol definition: @name = value
 */
export interface ParsedSymbol {
  /** The symbol name (without @). */
  name: string;
  /** The symbol value. */
  value: ConfigValue;
}

/**
 * Complete result of parsing a config string.
 */
export interface ParsedConfig {
  /** All parsed overrides. */
  overrides: ParsedOverride[];
  /** All @include directives. */
  includes: ParsedInclude[];
  /** All symbol definitions. */
  symbols: ParsedSymbol[];
  /** The scene seed, if specified as `scene/seed = N`. */
  seed?: number;
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a gin-config style configuration string into structured data.
 *
 * @param input - The configuration string to parse
 * @returns Parsed config structure
 * @throws Error on syntax errors
 */
export function parseConfigString(input: string): ParsedConfig {
  const result: ParsedConfig = {
    overrides: [],
    includes: [],
    symbols: [],
  };

  const lines = input.split('\n');
  let lineNumber = 0;

  for (const rawLine of lines) {
    lineNumber++;
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    try {
      // @include directive
      if (line.startsWith('@include')) {
        const file = line.substring('@include'.length).trim();
        if (!file) {
          throw new Error(`@include requires a file path`);
        }
        result.includes.push({ file });
        continue;
      }

      // Symbol definition: @name = value
      if (line.startsWith('@') && line.includes('=')) {
        const eqIdx = line.indexOf('=');
        const name = line.substring(1, eqIdx).trim();
        const valueStr = line.substring(eqIdx + 1).trim();
        if (!name) {
          throw new Error(`Symbol definition missing name`);
        }
        result.symbols.push({
          name,
          value: parseValue(valueStr),
        });
        continue;
      }

      // Key = value assignment
      if (line.includes('=')) {
        const eqIdx = line.indexOf('=');
        const lhs = line.substring(0, eqIdx).trim();
        const rhs = line.substring(eqIdx + 1).trim();

        if (!lhs) {
          throw new Error(`Missing key on left side of =`);
        }

        // Split lhs into configName.key
        const lastDot = lhs.lastIndexOf('.');
        let configName: string;
        let key: string;

        if (lastDot !== -1) {
          configName = lhs.substring(0, lastDot);
          key = lhs.substring(lastDot + 1);
        } else {
          // Could be namespace/key format (e.g., "scene/seed")
          const lastSlash = lhs.lastIndexOf('/');
          if (lastSlash !== -1) {
            configName = lhs.substring(0, lastSlash);
            key = lhs.substring(lastSlash + 1);
          } else {
            // Bare key — treat as a top-level configurable
            configName = '_global';
            key = lhs;
          }
        }

        const value = parseValue(rhs);

        // Special case: scene/seed
        if (configName === 'scene' && key === 'seed' && typeof value === 'number') {
          result.seed = value;
        }

        result.overrides.push({ configName, key, value });
        continue;
      }

      // If we get here, the line doesn't match any known pattern
      // Just skip it silently (could be a comment style not yet supported)
    } catch (err) {
      throw new Error(
        `Config parse error at line ${lineNumber}: ${line}\n` +
        `  ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ============================================================================
// Value Parsing
// ============================================================================

/**
 * Parse a value string into a ConfigValue.
 *
 * Supported formats:
 * - Numbers: `42`, `3.14`, `-1`
 * - Booleans: `true`, `false`
 * - Null: `null`
 * - Quoted strings: `"hello"`, `'world'`
 * - Interpolation references: `${namespace/key}`
 * - Symbol references: `@symbol_name`
 * - JSON objects: `{"__type":"Vector3","x":1,"y":2,"z":3}`
 */
export function parseValue(valueStr: string): ConfigValue {
  const trimmed = valueStr.trim();

  // Null
  if (trimmed === 'null' || trimmed === 'None') {
    return null;
  }

  // Boolean
  if (trimmed === 'true' || trimmed === 'True') {
    return true;
  }
  if (trimmed === 'false' || trimmed === 'False') {
    return false;
  }

  // Interpolation reference
  if (trimmed.startsWith('${') && trimmed.endsWith('}')) {
    return trimmed; // Store as string; GinConfig resolves it
  }

  // Symbol reference
  if (trimmed.startsWith('@') && !trimmed.includes('=')) {
    return trimmed; // Store as string; GinConfig resolves it
  }

  // Quoted string
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Number (integer or float, possibly negative)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!isNaN(num)) {
      return num;
    }
  }

  // Scientific notation
  if (/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!isNaN(num)) {
      return num;
    }
  }

  // JSON object (for Vector3, Color, Enum, or custom objects)
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj === 'object' && obj !== null && '__type' in obj) {
        // Validate known types
        if (obj.__type === 'Vector3' && 'x' in obj && 'y' in obj && 'z' in obj) {
          return vec3(Number(obj.x), Number(obj.y), Number(obj.z));
        }
        if (obj.__type === 'Color' && 'r' in obj && 'g' in obj && 'b' in obj) {
          return color(Number(obj.r), Number(obj.g), Number(obj.b));
        }
        if (obj.__type === 'Enum' && 'enumName' in obj && 'value' in obj) {
          return enumVal(String(obj.enumName), String(obj.value));
        }
        // Unknown typed object — store as-is
        return obj as ConfigValue;
      }
      // Plain object — store as JSON string
      return JSON.stringify(obj);
    } catch (err) {
      // Silently fall back - not valid JSON, treat as a string
      if (process.env.NODE_ENV === 'development') console.debug('[ConfigParser] JSON value parse fallback:', err);
      return trimmed;
    }
  }

  // Array (for list values)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return JSON.stringify(arr);
      }
    } catch (err) {
      // Silently fall back - not valid JSON array
      if (process.env.NODE_ENV === 'development') console.debug('[ConfigParser] JSON array parse fallback:', err);
    }
    return trimmed;
  }

  // Fallback: treat as unquoted string
  return trimmed;
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a ConfigValue to its string representation in the config format.
 */
export function serializeValue(value: ConfigValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // References and symbols are not quoted
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

/**
 * Serialize a set of overrides to a config string.
 *
 * @param overrides - Map of configName → { key → value }
 * @param seed - Optional scene seed
 * @param includes - Optional include files
 * @param symbols - Optional symbol definitions
 */
export function serializeConfig(
  overrides: Map<string, Record<string, ConfigValue>>,
  seed?: number,
  includes?: string[],
  symbols?: Map<string, ConfigValue>,
): string {
  const lines: string[] = [];

  // Seed
  if (seed !== undefined) {
    lines.push(`scene/seed = ${seed}`);
    lines.push('');
  }

  // Includes
  if (includes && includes.length > 0) {
    for (const inc of includes) {
      lines.push(`@include ${inc}`);
    }
    lines.push('');
  }

  // Symbols
  if (symbols && symbols.size > 0) {
    for (const [name, value] of symbols) {
      lines.push(`@${name} = ${serializeValue(value)}`);
    }
    lines.push('');
  }

  // Overrides
  for (const [configName, params] of overrides) {
    lines.push(`# ${configName}`);
    for (const [key, value] of Object.entries(params)) {
      lines.push(`${configName}.${key} = ${serializeValue(value)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a config string for common errors.
 *
 * @returns Array of warning messages (empty if valid)
 */
export function validateConfigString(input: string): string[] {
  const warnings: string[] = [];

  try {
    const parsed = parseConfigString(input);

    // Check for duplicate keys
    const seenKeys = new Set<string>();
    for (const ov of parsed.overrides) {
      const fullKey = `${ov.configName}.${ov.key}`;
      if (seenKeys.has(fullKey)) {
        warnings.push(`Duplicate key: ${fullKey} (last value wins)`);
      }
      seenKeys.add(fullKey);
    }

    // Check for unresolved references
    for (const ov of parsed.overrides) {
      if (typeof ov.value === 'string' && ov.value.startsWith('${') && ov.value.endsWith('}')) {
        const refPath = ov.value.slice(2, -1);
        // Check if the referenced key exists in the parsed overrides
        const refExists = parsed.overrides.some(
          o => `${o.configName}.${o.key}` === refPath || `${o.configName}/${o.key}` === refPath
        );
        if (!refExists) {
          warnings.push(
            `Reference ${ov.value} in ${ov.configName}.${ov.key} ` +
            `may not resolve (not found in this config)`
          );
        }
      }
    }

    // Check for symbol references without definitions
    const definedSymbols = new Set(parsed.symbols.map(s => s.name));
    for (const ov of parsed.overrides) {
      if (typeof ov.value === 'string' && ov.value.startsWith('@')) {
        const symName = ov.value.slice(1);
        if (!definedSymbols.has(symName)) {
          warnings.push(
            `Symbol @${symName} referenced in ${ov.configName}.${ov.key} ` +
            `is not defined in this config`
          );
        }
      }
    }
  } catch (err) {
    warnings.push(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return warnings;
}
