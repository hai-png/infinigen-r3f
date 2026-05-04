/**
 * AdditionalScatterTypes.ts
 *
 * Registers the 5 new scatter types in the scatter type system.
 * Each type maps to its generator class name and category for
 * organized lookup and filtering.
 *
 * Categories:
 *   weather — weather/atmospheric phenomena (snow, rain, etc.)
 *   organic — biological organisms (mold, lichen, etc.)
 *   aquatic — water-dwelling organisms (mollusk, jellyfish, etc.)
 */

// ============================================================================
// Type Definitions
// ============================================================================

/** Scatter type category for filtering and organization */
export type ScatterCategory = 'weather' | 'organic' | 'aquatic' | 'ground' | 'vegetation';

/**
 * Descriptor for a scatter type in the registry.
 */
export interface ScatterTypeDescriptor {
  /** Human-readable name */
  name: string;
  /** Generator class name (must match a class implementing ScatterGenerator) */
  generator: string;
  /** Category for filtering and organization */
  category: ScatterCategory;
  /** Optional description of the scatter type */
  description?: string;
  /** Default density value for this type */
  defaultDensity?: number;
  /** Supported biome hints */
  supportedBiomes?: string[];
}

// ============================================================================
// Additional Scatter Type Registry
// ============================================================================

/**
 * Registry of the 5 additional scatter types.
 * Maps type key to its descriptor for lookup in the scatter system.
 */
export const ADDITIONAL_SCATTER_TYPES: Record<string, ScatterTypeDescriptor> = {
  snow_layer: {
    name: 'Snow Layer',
    generator: 'SnowLayerScatter',
    category: 'weather',
    description:
      'Snow accumulation with slope-based thickness, wind drift, and melting patterns. ' +
      'Snow collects on horizontal surfaces and avoids steep slopes.',
    defaultDensity: 1.0,
    supportedBiomes: ['tundra', 'taiga', 'alpine', 'polar'],
  },
  slime_mold: {
    name: 'Slime Mold',
    generator: 'SlimeMoldScatter',
    category: 'organic',
    description:
      'Physarum-inspired network growth along moisture gradients. ' +
      'Produces vein-like patterns connecting food sources with pulsation effects.',
    defaultDensity: 0.5,
    supportedBiomes: ['temperate_forest', 'tropical_forest', 'swamp', 'rainforest'],
  },
  lichen: {
    name: 'Lichen',
    generator: 'LichenScatter',
    category: 'organic',
    description:
      'Colony-based lichen patches with species variation (crustose, foliose, fruticose). ' +
      'Features growth rings and north-facing surface bias.',
    defaultDensity: 0.8,
    supportedBiomes: ['tundra', 'taiga', 'temperate_forest', 'boreal_forest'],
  },
  mollusk: {
    name: 'Mollusk',
    generator: 'MolluskScatter',
    category: 'aquatic',
    description:
      'Shell clustering with species types (bivalve, gastropod) and substrate interaction. ' +
      'Log-normal size distribution with cluster-biased placement.',
    defaultDensity: 0.4,
    supportedBiomes: ['coastal', 'tidal', 'reef', 'estuary'],
  },
  jellyfish: {
    name: 'Jellyfish',
    generator: 'JellyfishScatter',
    category: 'aquatic',
    description:
      'Water column placement with pulse animation and species variation ' +
      '(moon jelly, box jelly, lion\'s mane, comb jelly). Includes bioluminescence.',
    defaultDensity: 0.2,
    supportedBiomes: ['ocean', 'coastal', 'deep_sea', 'reef'],
  },
};

// ============================================================================
// Category Index
// ============================================================================

/**
 * Lookup index: maps category → list of scatter type keys in that category.
 */
export const SCATTER_TYPE_CATEGORIES: Record<ScatterCategory, string[]> = {
  weather: ['snow_layer'],
  organic: ['slime_mold', 'lichen'],
  aquatic: ['mollusk', 'jellyfish'],
  ground: [],
  vegetation: [],
};

// ============================================================================
// Generator Class Map
// ============================================================================

/**
 * Maps generator class names to their scatter type keys.
 * Used for reverse lookup when instantiating generators by class name.
 */
export const GENERATOR_TO_TYPE: Record<string, string> = {
  SnowLayerScatter: 'snow_layer',
  SlimeMoldScatter: 'slime_mold',
  LichenScatter: 'lichen',
  MolluskScatter: 'mollusk',
  JellyfishScatter: 'jellyfish',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a scatter type descriptor by its key.
 * Returns undefined if the type is not found.
 */
export function getScatterType(typeKey: string): ScatterTypeDescriptor | undefined {
  return ADDITIONAL_SCATTER_TYPES[typeKey];
}

/**
 * Get all scatter type keys for a given category.
 */
export function getScatterTypesByCategory(category: ScatterCategory): string[] {
  return SCATTER_TYPE_CATEGORIES[category] ?? [];
}

/**
 * Check if a scatter type supports a given biome.
 */
export function isBiomeSupported(typeKey: string, biome: string): boolean {
  const descriptor = ADDITIONAL_SCATTER_TYPES[typeKey];
  if (!descriptor) return false;
  if (!descriptor.supportedBiomes) return true; // No restriction
  return descriptor.supportedBiomes.includes(biome);
}

/**
 * Get all registered scatter type keys.
 */
export function getAllAdditionalScatterTypeKeys(): string[] {
  return Object.keys(ADDITIONAL_SCATTER_TYPES);
}
