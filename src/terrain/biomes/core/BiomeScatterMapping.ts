/**
 * BiomeScatterMapping.ts
 * Configuration object that defines which scatter types appear in which biome.
 *
 * Plan Action 10.1.1 — Biome ↔ Scatter mapping
 *
 * Provides:
 * - Per-biome scatter categories: primary vegetation, ground cover, special features
 * - Density multipliers for each scatter layer within a biome
 * - A lookup function `getScatterConfigForBiome` for runtime queries
 * - The `BIOME_SCATTER_MAPPING` constant for direct access
 */

import type { BiomeType } from './BiomeSystem';
import type { ScatterConfig } from '../../../core/placement/advanced/ScatterSystem';

// ============================================================================
// Extended Biome Types
// ============================================================================

/**
 * Extends the core BiomeType with additional aquatic / specialised biomes
 * that have distinct scatter profiles but are not part of the base enum yet.
 */
export type ExtendedBiomeType = BiomeType | 'coral_reef';

// ============================================================================
// Scatter Category Types
// ============================================================================

/** A single scatter entry within a biome configuration */
export interface ScatterEntry {
  /** Unique identifier matching an asset / scatter type in the ScatterSystem */
  id: string;
  /** Human-readable label */
  label: string;
  /** Base density (instances per square unit) before the biome density multiplier */
  baseDensity: number;
  /** Minimum spacing between instances of this type */
  minDistance: number;
  /** Scale variation range [min, max] */
  scaleRange: [number, number];
  /** Maximum Y-axis rotation variation in radians */
  rotationVariation: number;
  /** Whether instances should align to surface normals */
  alignToSurface: boolean;
  /** Relative weight when randomly selecting among entries in the same category */
  selectionWeight: number;
}

/** Density multipliers that scale the base densities of each scatter category */
export interface DensityMultipliers {
  /** Multiplier applied to primary vegetation base densities */
  vegetation: number;
  /** Multiplier applied to ground cover base densities */
  groundCover: number;
  /** Multiplier applied to special feature base densities */
  specialFeatures: number;
  /** Global multiplier applied on top of all per-category multipliers */
  global: number;
}

/** Full scatter configuration for a single biome */
export interface BiomeScatterProfile {
  /** Biome identifier */
  biomeType: ExtendedBiomeType;
  /** Primary vegetation — trees, shrubs, large canopy plants */
  primaryVegetation: ScatterEntry[];
  /** Ground cover — grasses, mosses, lichens, low-growing plants */
  groundCover: ScatterEntry[];
  /** Special features — biome-unique scatter elements (cactus, mushrooms, coral, etc.) */
  specialFeatures: ScatterEntry[];
  /** Density multipliers for this biome */
  densityMultipliers: DensityMultipliers;
  /** Fallback ScatterConfig used when no per-entry overrides are provided */
  defaultScatterConfig: ScatterConfig;
}

// ============================================================================
// Helper — default ScatterConfig
// ============================================================================

function makeDefaultScatterConfig(overrides: Partial<ScatterConfig> = {}): ScatterConfig {
  return {
    density: 1.0,
    minDistance: 0.5,
    maxInstances: 1000,
    scaleRange: [0.8, 1.2],
    rotationVariation: Math.PI,
    alignToSurface: true,
    lodDistances: [10, 30, 100],
    ...overrides,
  };
}

// ============================================================================
// Biome Scatter Profile Definitions
// ============================================================================

const DESERT_PROFILE: BiomeScatterProfile = {
  biomeType: 'desert',
  primaryVegetation: [
    {
      id: 'desert_shrub',
      label: 'Sparse Dry Shrub',
      baseDensity: 0.02,
      minDistance: 3.0,
      scaleRange: [0.4, 0.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
  ],
  groundCover: [
    {
      id: 'sand',
      label: 'Sand Patch',
      baseDensity: 0.6,
      minDistance: 0.3,
      scaleRange: [0.5, 1.5],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.7,
    },
    {
      id: 'sparse_dry_grass',
      label: 'Sparse Dry Grass',
      baseDensity: 0.05,
      minDistance: 1.0,
      scaleRange: [0.3, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
  ],
  specialFeatures: [
    {
      id: 'cactus',
      label: 'Cactus',
      baseDensity: 0.015,
      minDistance: 4.0,
      scaleRange: [0.6, 1.4],
      rotationVariation: Math.PI * 0.25,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'rocks',
      label: 'Desert Rock',
      baseDensity: 0.03,
      minDistance: 2.5,
      scaleRange: [0.3, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'desert_flower',
      label: 'Desert Flower',
      baseDensity: 0.005,
      minDistance: 2.0,
      scaleRange: [0.2, 0.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  densityMultipliers: {
    vegetation: 0.3,
    groundCover: 0.6,
    specialFeatures: 0.5,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.08,
    minDistance: 2.0,
    maxInstances: 200,
  }),
};

const TEMPERATE_FOREST_PROFILE: BiomeScatterProfile = {
  biomeType: 'temperate_forest',
  primaryVegetation: [
    {
      id: 'oak_tree',
      label: 'Oak Tree',
      baseDensity: 0.06,
      minDistance: 5.0,
      scaleRange: [0.7, 1.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'birch_tree',
      label: 'Birch Tree',
      baseDensity: 0.04,
      minDistance: 4.0,
      scaleRange: [0.6, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'maple_tree',
      label: 'Maple Tree',
      baseDensity: 0.03,
      minDistance: 4.5,
      scaleRange: [0.7, 1.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'forest_shrub',
      label: 'Forest Shrub',
      baseDensity: 0.08,
      minDistance: 1.5,
      scaleRange: [0.4, 0.9],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  groundCover: [
    {
      id: 'grass',
      label: 'Forest Grass',
      baseDensity: 0.5,
      minDistance: 0.3,
      scaleRange: [0.5, 1.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.5,
    },
    {
      id: 'ferns',
      label: 'Ferns',
      baseDensity: 0.15,
      minDistance: 0.8,
      scaleRange: [0.4, 0.9],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'leaf_litter',
      label: 'Leaf Litter',
      baseDensity: 0.3,
      minDistance: 0.2,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  specialFeatures: [
    {
      id: 'mushrooms',
      label: 'Mushrooms',
      baseDensity: 0.04,
      minDistance: 1.0,
      scaleRange: [0.2, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'fallen_log',
      label: 'Fallen Log',
      baseDensity: 0.01,
      minDistance: 6.0,
      scaleRange: [0.6, 1.4],
      rotationVariation: Math.PI * 0.5,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'wildflowers',
      label: 'Forest Wildflowers',
      baseDensity: 0.03,
      minDistance: 1.2,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'forest_rock',
      label: 'Mossy Rock',
      baseDensity: 0.015,
      minDistance: 3.0,
      scaleRange: [0.4, 1.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  densityMultipliers: {
    vegetation: 1.2,
    groundCover: 1.0,
    specialFeatures: 0.8,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.25,
    minDistance: 1.0,
    maxInstances: 2500,
  }),
};

const TROPICAL_RAINFOREST_PROFILE: BiomeScatterProfile = {
  biomeType: 'tropical_rainforest',
  primaryVegetation: [
    {
      id: 'palm_tree',
      label: 'Palm Tree',
      baseDensity: 0.07,
      minDistance: 4.0,
      scaleRange: [0.7, 1.4],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'broadleaf_tree',
      label: 'Broadleaf Tree',
      baseDensity: 0.09,
      minDistance: 3.5,
      scaleRange: [0.8, 1.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'kapok_tree',
      label: 'Kapok Tree',
      baseDensity: 0.02,
      minDistance: 8.0,
      scaleRange: [1.0, 1.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.15,
    },
    {
      id: 'tropical_shrub',
      label: 'Tropical Shrub',
      baseDensity: 0.1,
      minDistance: 1.5,
      scaleRange: [0.5, 1.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  groundCover: [
    {
      id: 'tropical_grass',
      label: 'Tropical Grass',
      baseDensity: 0.4,
      minDistance: 0.3,
      scaleRange: [0.5, 1.1],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'fern_tropical',
      label: 'Tropical Fern',
      baseDensity: 0.2,
      minDistance: 0.6,
      scaleRange: [0.5, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
  ],
  specialFeatures: [
    {
      id: 'vines',
      label: 'Hanging Vines',
      baseDensity: 0.06,
      minDistance: 2.0,
      scaleRange: [0.6, 1.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'orchids',
      label: 'Orchids',
      baseDensity: 0.03,
      minDistance: 1.5,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'bromeliad',
      label: 'Bromeliad',
      baseDensity: 0.02,
      minDistance: 2.0,
      scaleRange: [0.3, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'tropical_mushroom',
      label: 'Tropical Mushroom',
      baseDensity: 0.025,
      minDistance: 1.0,
      scaleRange: [0.2, 0.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
  ],
  densityMultipliers: {
    vegetation: 1.5,
    groundCover: 1.2,
    specialFeatures: 1.0,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.4,
    minDistance: 0.8,
    maxInstances: 3500,
  }),
};

const TUNDRA_PROFILE: BiomeScatterProfile = {
  biomeType: 'tundra',
  primaryVegetation: [
    {
      id: 'sparse_shrub',
      label: 'Sparse Tundra Shrub',
      baseDensity: 0.02,
      minDistance: 3.0,
      scaleRange: [0.3, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.5,
    },
    {
      id: 'dwarf_willow',
      label: 'Dwarf Willow',
      baseDensity: 0.01,
      minDistance: 4.0,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'dwarf_birch',
      label: 'Dwarf Birch',
      baseDensity: 0.008,
      minDistance: 5.0,
      scaleRange: [0.3, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  groundCover: [
    {
      id: 'lichen',
      label: 'Lichen',
      baseDensity: 0.3,
      minDistance: 0.2,
      scaleRange: [0.3, 0.8],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'moss',
      label: 'Moss',
      baseDensity: 0.25,
      minDistance: 0.2,
      scaleRange: [0.3, 0.7],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'snow',
      label: 'Snow Patch',
      baseDensity: 0.4,
      minDistance: 0.3,
      scaleRange: [0.5, 1.5],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
  ],
  specialFeatures: [
    {
      id: 'tundra_rock',
      label: 'Tundra Rock',
      baseDensity: 0.02,
      minDistance: 3.0,
      scaleRange: [0.4, 1.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'frozen_pond',
      label: 'Frozen Pond',
      baseDensity: 0.003,
      minDistance: 10.0,
      scaleRange: [0.8, 2.0],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'arctic_flower',
      label: 'Arctic Flower',
      baseDensity: 0.01,
      minDistance: 1.5,
      scaleRange: [0.1, 0.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
  ],
  densityMultipliers: {
    vegetation: 0.3,
    groundCover: 0.7,
    specialFeatures: 0.3,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.1,
    minDistance: 1.5,
    maxInstances: 500,
  }),
};

const GRASSLAND_PROFILE: BiomeScatterProfile = {
  biomeType: 'grassland',
  primaryVegetation: [
    {
      id: 'scattered_tree',
      label: 'Scattered Tree',
      baseDensity: 0.015,
      minDistance: 8.0,
      scaleRange: [0.6, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'lone_oak',
      label: 'Lone Oak',
      baseDensity: 0.005,
      minDistance: 15.0,
      scaleRange: [0.8, 1.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'grassland_shrub',
      label: 'Grassland Shrub',
      baseDensity: 0.03,
      minDistance: 3.0,
      scaleRange: [0.4, 0.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
  ],
  groundCover: [
    {
      id: 'tall_grass',
      label: 'Tall Grass',
      baseDensity: 0.7,
      minDistance: 0.2,
      scaleRange: [0.6, 1.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.5,
    },
    {
      id: 'short_grass',
      label: 'Short Grass',
      baseDensity: 0.5,
      minDistance: 0.15,
      scaleRange: [0.3, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'wildflowers',
      label: 'Wildflowers',
      baseDensity: 0.12,
      minDistance: 0.8,
      scaleRange: [0.2, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  specialFeatures: [
    {
      id: 'grassland_rock',
      label: 'Field Stone',
      baseDensity: 0.01,
      minDistance: 5.0,
      scaleRange: [0.3, 1.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'termite_mound',
      label: 'Termite Mound',
      baseDensity: 0.003,
      minDistance: 12.0,
      scaleRange: [0.5, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.15,
    },
    {
      id: 'butterfly_bush',
      label: 'Butterfly Bush',
      baseDensity: 0.02,
      minDistance: 2.5,
      scaleRange: [0.4, 0.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'dried_dung',
      label: 'Dung Pile',
      baseDensity: 0.005,
      minDistance: 4.0,
      scaleRange: [0.2, 0.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  densityMultipliers: {
    vegetation: 0.5,
    groundCover: 1.4,
    specialFeatures: 0.6,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.35,
    minDistance: 0.5,
    maxInstances: 3000,
  }),
};

const ALPINE_PROFILE: BiomeScatterProfile = {
  biomeType: 'alpine',
  primaryVegetation: [
    {
      id: 'sparse_pine',
      label: 'Sparse Pine',
      baseDensity: 0.02,
      minDistance: 5.0,
      scaleRange: [0.5, 1.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'stunted_spruce',
      label: 'Stunted Spruce',
      baseDensity: 0.015,
      minDistance: 6.0,
      scaleRange: [0.4, 0.9],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'alpine_shrub',
      label: 'Alpine Shrub',
      baseDensity: 0.04,
      minDistance: 2.0,
      scaleRange: [0.3, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
  ],
  groundCover: [
    {
      id: 'alpine_grass',
      label: 'Alpine Grass',
      baseDensity: 0.25,
      minDistance: 0.4,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'rock_gravel',
      label: 'Gravel / Scree',
      baseDensity: 0.3,
      minDistance: 0.3,
      scaleRange: [0.2, 0.6],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'alpine_moss',
      label: 'Alpine Moss',
      baseDensity: 0.15,
      minDistance: 0.3,
      scaleRange: [0.3, 0.6],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
  ],
  specialFeatures: [
    {
      id: 'mountain_rock',
      label: 'Mountain Rock / Boulder',
      baseDensity: 0.04,
      minDistance: 3.0,
      scaleRange: [0.5, 2.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'snow_patch',
      label: 'Snow Patch',
      baseDensity: 0.08,
      minDistance: 1.0,
      scaleRange: [0.5, 2.0],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'edelweiss',
      label: 'Edelweiss',
      baseDensity: 0.01,
      minDistance: 1.5,
      scaleRange: [0.1, 0.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.15,
    },
    {
      id: 'mountain_cliff',
      label: 'Cliff Face',
      baseDensity: 0.008,
      minDistance: 8.0,
      scaleRange: [1.0, 3.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.15,
    },
  ],
  densityMultipliers: {
    vegetation: 0.4,
    groundCover: 0.6,
    specialFeatures: 0.7,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.12,
    minDistance: 1.5,
    maxInstances: 800,
  }),
};

const COASTAL_PROFILE: BiomeScatterProfile = {
  biomeType: 'coastal',
  primaryVegetation: [
    {
      id: 'beach_grass',
      label: 'Beach Grass',
      baseDensity: 0.15,
      minDistance: 0.8,
      scaleRange: [0.4, 0.9],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'coastal_pine',
      label: 'Coastal Pine',
      baseDensity: 0.02,
      minDistance: 6.0,
      scaleRange: [0.6, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'coastal_shrub',
      label: 'Coastal Shrub',
      baseDensity: 0.06,
      minDistance: 2.0,
      scaleRange: [0.4, 0.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
  ],
  groundCover: [
    {
      id: 'sand_coastal',
      label: 'Beach Sand',
      baseDensity: 0.5,
      minDistance: 0.2,
      scaleRange: [0.5, 1.5],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.5,
    },
    {
      id: 'coastal_grass',
      label: 'Coastal Turf',
      baseDensity: 0.2,
      minDistance: 0.4,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'pebbles',
      label: 'Beach Pebbles',
      baseDensity: 0.15,
      minDistance: 0.3,
      scaleRange: [0.1, 0.4],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  specialFeatures: [
    {
      id: 'driftwood',
      label: 'Driftwood',
      baseDensity: 0.02,
      minDistance: 3.0,
      scaleRange: [0.5, 1.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'seashells',
      label: 'Seashells',
      baseDensity: 0.06,
      minDistance: 0.5,
      scaleRange: [0.1, 0.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'sea_oats',
      label: 'Sea Oats',
      baseDensity: 0.08,
      minDistance: 1.0,
      scaleRange: [0.4, 0.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'tidal_pool',
      label: 'Tidal Pool',
      baseDensity: 0.005,
      minDistance: 8.0,
      scaleRange: [0.5, 1.5],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.15,
    },
  ],
  densityMultipliers: {
    vegetation: 0.7,
    groundCover: 1.0,
    specialFeatures: 0.8,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.2,
    minDistance: 0.6,
    maxInstances: 2000,
  }),
};

const WETLAND_PROFILE: BiomeScatterProfile = {
  biomeType: 'wetland',
  primaryVegetation: [
    {
      id: 'willow_tree',
      label: 'Willow Tree',
      baseDensity: 0.03,
      minDistance: 5.0,
      scaleRange: [0.7, 1.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'cypress_tree',
      label: 'Bald Cypress',
      baseDensity: 0.025,
      minDistance: 5.0,
      scaleRange: [0.6, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'wetland_shrub',
      label: 'Wetland Shrub',
      baseDensity: 0.06,
      minDistance: 2.0,
      scaleRange: [0.4, 0.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
  ],
  groundCover: [
    {
      id: 'moss',
      label: 'Wetland Moss',
      baseDensity: 0.35,
      minDistance: 0.2,
      scaleRange: [0.3, 0.7],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'ferns_wetland',
      label: 'Marsh Ferns',
      baseDensity: 0.2,
      minDistance: 0.6,
      scaleRange: [0.4, 0.9],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'wetland_grass',
      label: 'Wetland Grass',
      baseDensity: 0.25,
      minDistance: 0.3,
      scaleRange: [0.4, 0.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
  ],
  specialFeatures: [
    {
      id: 'reeds',
      label: 'Reeds',
      baseDensity: 0.1,
      minDistance: 0.8,
      scaleRange: [0.5, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'cattails',
      label: 'Cattails',
      baseDensity: 0.08,
      minDistance: 0.8,
      scaleRange: [0.5, 1.1],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'lily_pad',
      label: 'Lily Pad',
      baseDensity: 0.04,
      minDistance: 0.5,
      scaleRange: [0.2, 0.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'wetland_mushroom',
      label: 'Wetland Mushroom',
      baseDensity: 0.02,
      minDistance: 1.5,
      scaleRange: [0.2, 0.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  densityMultipliers: {
    vegetation: 0.8,
    groundCover: 1.2,
    specialFeatures: 1.0,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.3,
    minDistance: 0.6,
    maxInstances: 2500,
  }),
};

const TAIGA_PROFILE: BiomeScatterProfile = {
  biomeType: 'taiga',
  primaryVegetation: [
    {
      id: 'pine_tree',
      label: 'Pine Tree',
      baseDensity: 0.08,
      minDistance: 3.5,
      scaleRange: [0.6, 1.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'spruce_tree',
      label: 'Spruce Tree',
      baseDensity: 0.06,
      minDistance: 3.5,
      scaleRange: [0.6, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'fir_tree',
      label: 'Fir Tree',
      baseDensity: 0.04,
      minDistance: 4.0,
      scaleRange: [0.6, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'taiga_shrub',
      label: 'Taiga Shrub',
      baseDensity: 0.04,
      minDistance: 2.0,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.1,
    },
  ],
  groundCover: [
    {
      id: 'lichen_taiga',
      label: 'Lichen',
      baseDensity: 0.3,
      minDistance: 0.2,
      scaleRange: [0.3, 0.7],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'moss_taiga',
      label: 'Moss',
      baseDensity: 0.25,
      minDistance: 0.2,
      scaleRange: [0.3, 0.6],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'pine_needle_floor',
      label: 'Pine Needle Floor',
      baseDensity: 0.35,
      minDistance: 0.2,
      scaleRange: [0.4, 0.8],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
  ],
  specialFeatures: [
    {
      id: 'berries',
      label: 'Berry Bush',
      baseDensity: 0.03,
      minDistance: 2.0,
      scaleRange: [0.3, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'taiga_mushroom',
      label: 'Taiga Mushroom',
      baseDensity: 0.02,
      minDistance: 1.5,
      scaleRange: [0.2, 0.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'taiga_rock',
      label: 'Mossy Boulder',
      baseDensity: 0.015,
      minDistance: 4.0,
      scaleRange: [0.4, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'snow_taiga',
      label: 'Snow Drift',
      baseDensity: 0.05,
      minDistance: 2.0,
      scaleRange: [0.5, 1.5],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  densityMultipliers: {
    vegetation: 1.0,
    groundCover: 1.0,
    specialFeatures: 0.6,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.2,
    minDistance: 1.0,
    maxInstances: 2000,
  }),
};

const CORAL_REEF_PROFILE: BiomeScatterProfile = {
  biomeType: 'coral_reef',
  primaryVegetation: [
    {
      id: 'coral_branching',
      label: 'Branching Coral',
      baseDensity: 0.12,
      minDistance: 1.5,
      scaleRange: [0.5, 1.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'coral_fan',
      label: 'Fan Coral',
      baseDensity: 0.06,
      minDistance: 2.0,
      scaleRange: [0.4, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'coral_brain',
      label: 'Brain Coral',
      baseDensity: 0.04,
      minDistance: 2.5,
      scaleRange: [0.5, 1.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'coral_table',
      label: 'Table Coral',
      baseDensity: 0.03,
      minDistance: 3.0,
      scaleRange: [0.6, 1.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  groundCover: [
    {
      id: 'seaweed',
      label: 'Seaweed',
      baseDensity: 0.25,
      minDistance: 0.5,
      scaleRange: [0.4, 1.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'seagrass',
      label: 'Seagrass',
      baseDensity: 0.3,
      minDistance: 0.3,
      scaleRange: [0.3, 0.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'sand_underwater',
      label: 'Sandy Bottom',
      baseDensity: 0.3,
      minDistance: 0.2,
      scaleRange: [0.5, 1.5],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
  ],
  specialFeatures: [
    {
      id: 'seashells_underwater',
      label: 'Seashells',
      baseDensity: 0.05,
      minDistance: 1.0,
      scaleRange: [0.1, 0.4],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'sea_anemone',
      label: 'Sea Anemone',
      baseDensity: 0.04,
      minDistance: 1.5,
      scaleRange: [0.2, 0.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'starfish',
      label: 'Starfish',
      baseDensity: 0.02,
      minDistance: 2.0,
      scaleRange: [0.1, 0.4],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'urchin',
      label: 'Sea Urchin',
      baseDensity: 0.015,
      minDistance: 2.0,
      scaleRange: [0.1, 0.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.15,
    },
    {
      id: 'sponge',
      label: 'Sea Sponge',
      baseDensity: 0.03,
      minDistance: 1.5,
      scaleRange: [0.2, 0.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.15,
    },
  ],
  densityMultipliers: {
    vegetation: 1.2,
    groundCover: 1.0,
    specialFeatures: 0.8,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.3,
    minDistance: 0.5,
    maxInstances: 3000,
    alignToSurface: true,
  }),
};

// ============================================================================
// Savanna — fills out the remaining core BiomeType
// ============================================================================

const SAVANNA_PROFILE: BiomeScatterProfile = {
  biomeType: 'savanna',
  primaryVegetation: [
    {
      id: 'acacia_tree',
      label: 'Acacia Tree',
      baseDensity: 0.025,
      minDistance: 8.0,
      scaleRange: [0.6, 1.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'baobab_tree',
      label: 'Baobab Tree',
      baseDensity: 0.005,
      minDistance: 15.0,
      scaleRange: [0.8, 1.6],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'savanna_shrub',
      label: 'Savanna Shrub',
      baseDensity: 0.04,
      minDistance: 2.5,
      scaleRange: [0.4, 0.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
  ],
  groundCover: [
    {
      id: 'savanna_grass',
      label: 'Savanna Tall Grass',
      baseDensity: 0.5,
      minDistance: 0.3,
      scaleRange: [0.5, 1.2],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.5,
    },
    {
      id: 'dry_grass',
      label: 'Dry Grass',
      baseDensity: 0.3,
      minDistance: 0.3,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'savanna_wildflower',
      label: 'Savanna Wildflower',
      baseDensity: 0.06,
      minDistance: 1.0,
      scaleRange: [0.2, 0.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  specialFeatures: [
    {
      id: 'termite_mound_savanna',
      label: 'Termite Mound',
      baseDensity: 0.003,
      minDistance: 12.0,
      scaleRange: [0.5, 1.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'savanna_rock',
      label: 'Kopje Rock',
      baseDensity: 0.008,
      minDistance: 8.0,
      scaleRange: [0.8, 2.0],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'thorn_bush',
      label: 'Thorn Bush',
      baseDensity: 0.03,
      minDistance: 2.0,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'watering_hole',
      label: 'Watering Hole',
      baseDensity: 0.002,
      minDistance: 20.0,
      scaleRange: [1.0, 3.0],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  densityMultipliers: {
    vegetation: 0.5,
    groundCover: 1.2,
    specialFeatures: 0.5,
    global: 1.0,
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.2,
    minDistance: 1.0,
    maxInstances: 2000,
  }),
};

// ============================================================================
// Ocean Profile (underwater scatter)
// ============================================================================

const OCEAN_PROFILE: BiomeScatterProfile = {
  biomeType: 'ocean',
  primaryVegetation: [
    {
      id: 'kelp_forest',
      label: 'Kelp Forest',
      baseDensity: 0.08,
      minDistance: 3.0,
      scaleRange: [0.5, 1.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.4,
    },
    {
      id: 'sea_grass_bed',
      label: 'Sea Grass Bed',
      baseDensity: 0.12,
      minDistance: 1.5,
      scaleRange: [0.4, 0.9],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.35,
    },
    {
      id: 'coral_patch',
      label: 'Coral Patch',
      baseDensity: 0.05,
      minDistance: 4.0,
      scaleRange: [0.6, 1.8],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
  ],
  groundCover: [
    {
      id: 'ocean_sand',
      label: 'Ocean Sand',
      baseDensity: 0.4,
      minDistance: 0.3,
      scaleRange: [0.5, 1.5],
      rotationVariation: 0,
      alignToSurface: true,
      selectionWeight: 0.5,
    },
    {
      id: 'seagrass',
      label: 'Seagrass',
      baseDensity: 0.25,
      minDistance: 0.3,
      scaleRange: [0.3, 0.7],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.3,
    },
    {
      id: 'ocean_pebbles',
      label: 'Ocean Pebbles',
      baseDensity: 0.15,
      minDistance: 0.2,
      scaleRange: [0.1, 0.4],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
  ],
  specialFeatures: [
    {
      id: 'ocean_shells',
      label: 'Ocean Seashells',
      baseDensity: 0.04,
      minDistance: 1.5,
      scaleRange: [0.1, 0.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'sea_anemone_ocean',
      label: 'Sea Anemone',
      baseDensity: 0.03,
      minDistance: 2.0,
      scaleRange: [0.2, 0.5],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.25,
    },
    {
      id: 'starfish_ocean',
      label: 'Starfish',
      baseDensity: 0.015,
      minDistance: 2.5,
      scaleRange: [0.1, 0.4],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.2,
    },
    {
      id: 'ocean_urchin',
      label: 'Sea Urchin',
      baseDensity: 0.01,
      minDistance: 3.0,
      scaleRange: [0.1, 0.3],
      rotationVariation: Math.PI,
      alignToSurface: true,
      selectionWeight: 0.15,
    },
  ],
  densityMultipliers: {
    vegetation: 0.8,
    groundCover: 0.6,
    specialFeatures: 0.5,
    global: 0.5, // Much lower density underwater
  },
  defaultScatterConfig: makeDefaultScatterConfig({
    density: 0.1,
    minDistance: 1.0,
    maxInstances: 500,
  }),
};

// ============================================================================
// BiomeScatterMapping Class
// ============================================================================

/**
 * Central registry that maps biome types to their scatter configurations.
 *
 * Supports both legacy biome names and the task-specified Whittaker names:
 * - 'mountain' is an alias for 'alpine'
 * - 'coast' is an alias for 'coastal'
 * - 'boreal_forest' is an alias for 'taiga'
 * - 'tropical_forest' is an alias for 'tropical_rainforest'
 *
 * Usage:
 * ```ts
 * const mapping = new BiomeScatterMapping();
 * const profile = mapping.getProfile('desert');
 * const mountainProfile = mapping.getProfile('mountain'); // alias → alpine
 * ```
 */
export class BiomeScatterMapping {
  private profiles: Map<ExtendedBiomeType, BiomeScatterProfile>;

  /** Alias map: task biome type → legacy profile biome type */
  private static readonly ALIASES: Record<string, string> = {
    'mountain': 'alpine',
    'coast': 'coastal',
    'boreal_forest': 'taiga',
    'tropical_forest': 'tropical_rainforest',
  };

  constructor() {
    this.profiles = new Map<ExtendedBiomeType, BiomeScatterProfile>();

    // Register all built-in biome profiles
    this.register(DESERT_PROFILE);
    this.register(TEMPERATE_FOREST_PROFILE);
    this.register(TROPICAL_RAINFOREST_PROFILE);
    this.register(TUNDRA_PROFILE);
    this.register(GRASSLAND_PROFILE);
    this.register(ALPINE_PROFILE);
    this.register(COASTAL_PROFILE);
    this.register(WETLAND_PROFILE);
    this.register(TAIGA_PROFILE);
    this.register(CORAL_REEF_PROFILE);
    this.register(SAVANNA_PROFILE);
    this.register(OCEAN_PROFILE);

    // Register alias profiles for task-specified biome names
    // Each alias points to the same profile object as its legacy equivalent
    this.register({ ...ALPINE_PROFILE, biomeType: 'mountain' });
    this.register({ ...COASTAL_PROFILE, biomeType: 'coast' });
    this.register({ ...TAIGA_PROFILE, biomeType: 'boreal_forest' });
    this.register({ ...TROPICAL_RAINFOREST_PROFILE, biomeType: 'tropical_forest' });
  }

  // --------------------------------------------------------------------------
  // Registration
  // --------------------------------------------------------------------------

  /**
   * Register (or overwrite) a biome scatter profile.
   */
  register(profile: BiomeScatterProfile): void {
    this.profiles.set(profile.biomeType, profile);
  }

  /**
   * Remove a biome scatter profile.
   */
  unregister(biomeType: ExtendedBiomeType): boolean {
    return this.profiles.delete(biomeType);
  }

  // --------------------------------------------------------------------------
  // Lookup
  // --------------------------------------------------------------------------

  /**
   * Get the full scatter profile for a biome, or `undefined` if not found.
   */
  getProfile(biomeType: ExtendedBiomeType): BiomeScatterProfile | undefined {
    return this.profiles.get(biomeType);
  }

  /**
   * Check whether a profile exists for the given biome type.
   */
  has(biomeType: ExtendedBiomeType): boolean {
    return this.profiles.has(biomeType);
  }

  /**
   * List all registered biome types.
   */
  getRegisteredBiomeTypes(): ExtendedBiomeType[] {
    return Array.from(this.profiles.keys());
  }

  // --------------------------------------------------------------------------
  // Scatter-entry lookups
  // --------------------------------------------------------------------------

  /**
   * Get all scatter entries across all categories for a biome, with density
   * multipliers already applied.
   */
  getAllEntries(biomeType: ExtendedBiomeType): ScatterEntry[] {
    const profile = this.profiles.get(biomeType);
    if (!profile) return [];

    const { densityMultipliers: dm } = profile;

    const applyMultiplier = (entries: ScatterEntry[], multiplier: number): ScatterEntry[] =>
      entries.map(entry => ({
        ...entry,
        baseDensity: entry.baseDensity * multiplier * dm.global,
      }));

    return [
      ...applyMultiplier(profile.primaryVegetation, dm.vegetation),
      ...applyMultiplier(profile.groundCover, dm.groundCover),
      ...applyMultiplier(profile.specialFeatures, dm.specialFeatures),
    ];
  }

  /**
   * Get scatter entries for a specific category within a biome.
   */
  getCategoryEntries(
    biomeType: ExtendedBiomeType,
    category: 'primaryVegetation' | 'groundCover' | 'specialFeatures',
  ): ScatterEntry[] {
    const profile = this.profiles.get(biomeType);
    if (!profile) return [];

    const multiplier =
      category === 'primaryVegetation'
        ? profile.densityMultipliers.vegetation
        : category === 'groundCover'
          ? profile.densityMultipliers.groundCover
          : profile.densityMultipliers.specialFeatures;

    return profile[category].map(entry => ({
      ...entry,
      baseDensity: entry.baseDensity * multiplier * profile.densityMultipliers.global,
    }));
  }

  /**
   * Build a `ScatterConfig` for a specific scatter entry within a biome,
   * merging per-entry settings with the biome's default config.
   */
  buildScatterConfig(
    biomeType: ExtendedBiomeType,
    entryId: string,
    overrides?: Partial<ScatterConfig>,
  ): ScatterConfig | undefined {
    const profile = this.profiles.get(biomeType);
    if (!profile) return undefined;

    const allEntries = [
      ...profile.primaryVegetation,
      ...profile.groundCover,
      ...profile.specialFeatures,
    ];
    const entry = allEntries.find(e => e.id === entryId);
    if (!entry) return undefined;

    return {
      ...profile.defaultScatterConfig,
      density: entry.baseDensity,
      minDistance: entry.minDistance,
      scaleRange: entry.scaleRange,
      rotationVariation: entry.rotationVariation,
      alignToSurface: entry.alignToSurface,
      ...overrides,
    };
  }

  /**
   * Get simplified scatter configurations for a biome type.
   *
   * Returns an array of BiomeScatterConfig entries with scatterType,
   * density, scaleRange, and materialPreset for each scatter element
   * that should appear in the given biome.
   *
   * @param biomeType - Biome identifier (supports both Whittaker and legacy names)
   * @returns Array of BiomeScatterConfig entries, or empty array if biome is unknown
   */
  getScatterConfigForBiome(biomeType: string): BiomeScatterConfig[] {
    return BIOME_SCATTER_CONFIGS[biomeType] ?? [];
  }
}

// ============================================================================
// Task-specified Biome ↔ Scatter mapping (flat config format)
// ============================================================================

/**
 * Simplified scatter configuration entry for biome-to-scatter mapping.
 * Each entry specifies a concrete scatter type, its density, scale range,
 * and an optional material preset from the MaterialPresetLibrary.
 */
export interface BiomeScatterConfig {
  /** Scatter type matching ScatterFactory geometry types (e.g. 'rock', 'grass', 'mushroom') */
  scatterType: string;
  /** Relative density per biome (instances per square unit) */
  density: number;
  /** Scale variation range [min, max] */
  scaleRange: [number, number];
  /** Material preset ID from MaterialPresetLibrary (e.g. 'sand', 'moss', 'coral') */
  materialPreset: string;
}

/**
 * Flat biome → scatter config mapping.
 *
 * Each biome maps to an array of BiomeScatterConfig entries that specify
 * scatterType, density, scaleRange, and materialPreset for each scatter
 * element that should appear in that biome.
 *
 * Desert:         sand, cactus, rocks, tumbleweed
 * Savanna:        sparse_grass, acacia_trees, rocks
 * Tropical Forest: dense_trees, ferns, vines, mushrooms
 * Temperate Forest: trees, grass, ferns, mushrooms, wildflowers
 * Boreal Forest:  pine_trees, moss, lichen, berries
 * Tundra:         lichen, moss, snow, small_rocks
 * Coast:          sand, seashells, driftwood, beach_grass
 * Mountain:       rocks, sparse_grass, snow
 * Ocean:          kelp, coral
 */
export const BIOME_SCATTER_CONFIGS: Record<string, BiomeScatterConfig[]> = {
  desert: [
    { scatterType: 'ground_leaves', density: 0.6,  scaleRange: [0.5, 1.5], materialPreset: 'sand' },
    { scatterType: 'mushroom',      density: 0.015, scaleRange: [0.6, 1.4], materialPreset: 'succulent' },
    { scatterType: 'rock',          density: 0.03,  scaleRange: [0.3, 1.2], materialPreset: 'sandstone' },
    { scatterType: 'ground_leaves', density: 0.008, scaleRange: [0.3, 0.8], materialPreset: 'simple_brownish' },
  ],
  savanna: [
    { scatterType: 'grass',  density: 0.4,  scaleRange: [0.5, 1.2], materialPreset: 'grass_blade' },
    { scatterType: 'fern',   density: 0.025, scaleRange: [0.6, 1.3], materialPreset: 'simple_greenery' },
    { scatterType: 'rock',   density: 0.008, scaleRange: [0.8, 2.0], materialPreset: 'mountain_rock' },
  ],
  tropical_forest: [
    { scatterType: 'fern',      density: 0.09, scaleRange: [0.8, 1.5], materialPreset: 'simple_greenery' },
    { scatterType: 'fern',      density: 0.2,  scaleRange: [0.5, 1.2], materialPreset: 'leaves' },
    { scatterType: 'fern',      density: 0.06, scaleRange: [0.6, 1.5], materialPreset: 'simple_greenery' },
    { scatterType: 'mushroom',  density: 0.025, scaleRange: [0.2, 0.5], materialPreset: 'simple_brownish' },
  ],
  temperate_forest: [
    { scatterType: 'fern',      density: 0.06, scaleRange: [0.7, 1.3], materialPreset: 'simple_greenery' },
    { scatterType: 'grass',     density: 0.5,  scaleRange: [0.5, 1.0], materialPreset: 'grass_blade' },
    { scatterType: 'fern',      density: 0.15, scaleRange: [0.4, 0.9], materialPreset: 'leaves' },
    { scatterType: 'mushroom',  density: 0.04, scaleRange: [0.2, 0.6], materialPreset: 'simple_brownish' },
    { scatterType: 'flower',    density: 0.03, scaleRange: [0.3, 0.7], materialPreset: 'simple_whitish' },
  ],
  boreal_forest: [
    { scatterType: 'pine_needle', density: 0.08, scaleRange: [0.6, 1.3], materialPreset: 'simple_greenery' },
    { scatterType: 'moss',        density: 0.25, scaleRange: [0.3, 0.6], materialPreset: 'moss' },
    { scatterType: 'lichen',      density: 0.3,  scaleRange: [0.3, 0.7], materialPreset: 'lichen' },
    { scatterType: 'flower',      density: 0.03, scaleRange: [0.3, 0.6], materialPreset: 'simple_greenery' },
  ],
  tundra: [
    { scatterType: 'lichen',      density: 0.3,  scaleRange: [0.3, 0.8], materialPreset: 'lichen' },
    { scatterType: 'moss',        density: 0.25, scaleRange: [0.3, 0.7], materialPreset: 'moss' },
    { scatterType: 'snow_layer',  density: 0.4,  scaleRange: [0.5, 1.5], materialPreset: 'snow' },
    { scatterType: 'pebble',      density: 0.02, scaleRange: [0.4, 1.0], materialPreset: 'chunky_rock' },
  ],
  coast: [
    { scatterType: 'ground_leaves', density: 0.5,  scaleRange: [0.5, 1.5], materialPreset: 'sand' },
    { scatterType: 'seashell',      density: 0.06, scaleRange: [0.1, 0.3], materialPreset: 'coral' },
    { scatterType: 'twig',          density: 0.02, scaleRange: [0.5, 1.5], materialPreset: 'old_wood' },
    { scatterType: 'grass',         density: 0.15, scaleRange: [0.4, 0.9], materialPreset: 'grass_blade' },
  ],
  mountain: [
    { scatterType: 'rock',         density: 0.04, scaleRange: [0.5, 2.0], materialPreset: 'mountain_rock' },
    { scatterType: 'grass',        density: 0.2,  scaleRange: [0.3, 0.7], materialPreset: 'grass_blade' },
    { scatterType: 'snow_layer',   density: 0.08, scaleRange: [0.5, 2.0], materialPreset: 'snow' },
  ],
  ocean: [
    { scatterType: 'fern',   density: 0.08, scaleRange: [0.5, 1.5], materialPreset: 'simple_greenery' },
    { scatterType: 'rock',   density: 0.05, scaleRange: [0.6, 1.8], materialPreset: 'coral' },
  ],
  // Legacy aliases
  tropical_rainforest: [
    { scatterType: 'fern',      density: 0.09, scaleRange: [0.8, 1.5], materialPreset: 'simple_greenery' },
    { scatterType: 'fern',      density: 0.2,  scaleRange: [0.5, 1.2], materialPreset: 'leaves' },
    { scatterType: 'fern',      density: 0.06, scaleRange: [0.6, 1.5], materialPreset: 'simple_greenery' },
    { scatterType: 'mushroom',  density: 0.025, scaleRange: [0.2, 0.5], materialPreset: 'simple_brownish' },
  ],
  taiga: [
    { scatterType: 'pine_needle', density: 0.08, scaleRange: [0.6, 1.3], materialPreset: 'simple_greenery' },
    { scatterType: 'moss',        density: 0.25, scaleRange: [0.3, 0.6], materialPreset: 'moss' },
    { scatterType: 'lichen',      density: 0.3,  scaleRange: [0.3, 0.7], materialPreset: 'lichen' },
    { scatterType: 'flower',      density: 0.03, scaleRange: [0.3, 0.6], materialPreset: 'simple_greenery' },
  ],
  alpine: [
    { scatterType: 'rock',         density: 0.04, scaleRange: [0.5, 2.0], materialPreset: 'mountain_rock' },
    { scatterType: 'grass',        density: 0.2,  scaleRange: [0.3, 0.7], materialPreset: 'grass_blade' },
    { scatterType: 'snow_layer',   density: 0.08, scaleRange: [0.5, 2.0], materialPreset: 'snow' },
  ],
  coastal: [
    { scatterType: 'ground_leaves', density: 0.5,  scaleRange: [0.5, 1.5], materialPreset: 'sand' },
    { scatterType: 'seashell',      density: 0.06, scaleRange: [0.1, 0.3], materialPreset: 'coral' },
    { scatterType: 'twig',          density: 0.02, scaleRange: [0.5, 1.5], materialPreset: 'old_wood' },
    { scatterType: 'grass',         density: 0.15, scaleRange: [0.4, 0.9], materialPreset: 'grass_blade' },
  ],
};

// ============================================================================
// Canonical scatter ID mapping (for ScatterFactory bridge)
// ============================================================================

/**
 * Maps biome types to the canonical scatter identifiers required by the task.
 *
 * These IDs follow the `{feature}_scatter` naming convention and serve as
 * stable keys that the ScatterFactory can resolve to concrete ScatterTypes.
 *
 * Desert:    sand_scatter, cactus_scatter, rock_scatter, tumbleweed_scatter
 * Savanna:   sparse_grass_scatter, acacia_tree_scatter, rock_scatter
 * Tropical:  dense_tree_scatter, fern_scatter, vine_scatter, mushroom_scatter
 * Temperate: tree_scatter, grass_scatter, fern_scatter, mushroom_scatter, wildflower_scatter
 * Boreal:    pine_tree_scatter, moss_scatter, lichen_scatter, berry_scatter
 * Tundra:    lichen_scatter, moss_scatter, snow_scatter, small_rock_scatter
 * Coast:     sand_scatter, seashell_scatter, driftwood_scatter, beach_grass_scatter
 * Mountain:  rock_scatter, sparse_grass_scatter, snow_scatter
 * Ocean:     kelp_scatter, coral_scatter
 */
export const BIOME_SCATTER_ID_MAP: Record<string, string[]> = {
  desert:          ['sand_scatter', 'cactus_scatter', 'rock_scatter', 'tumbleweed_scatter'],
  savanna:         ['sparse_grass_scatter', 'acacia_tree_scatter', 'rock_scatter'],
  tropical_forest: ['dense_tree_scatter', 'fern_scatter', 'vine_scatter', 'mushroom_scatter'],
  temperate_forest:['tree_scatter', 'grass_scatter', 'fern_scatter', 'mushroom_scatter', 'wildflower_scatter'],
  boreal_forest:   ['pine_tree_scatter', 'moss_scatter', 'lichen_scatter', 'berry_scatter'],
  tundra:          ['lichen_scatter', 'moss_scatter', 'snow_scatter', 'small_rock_scatter'],
  coast:           ['sand_scatter', 'seashell_scatter', 'driftwood_scatter', 'beach_grass_scatter'],
  mountain:        ['rock_scatter', 'sparse_grass_scatter', 'snow_scatter'],
  ocean:           ['kelp_scatter', 'coral_scatter'],
  // Legacy aliases
  tropical_rainforest: ['dense_tree_scatter', 'fern_scatter', 'vine_scatter', 'mushroom_scatter'],
  taiga:               ['pine_tree_scatter', 'moss_scatter', 'lichen_scatter', 'berry_scatter'],
  alpine:              ['rock_scatter', 'sparse_grass_scatter', 'snow_scatter'],
  coastal:             ['sand_scatter', 'seashell_scatter', 'driftwood_scatter', 'beach_grass_scatter'],
};

/**
 * Maps canonical scatter IDs (from BIOME_SCATTER_ID_MAP) to ScatterFactory ScatterType values.
 *
 * This is the bridge between the biome-driven scatter configuration and the
 * actual geometry/material generators registered in ScatterFactory.
 */
export const SCATTER_ID_TO_SCATTER_TYPE: Record<string, string> = {
  // Ground cover
  sand_scatter:        'ground_leaves',
  sparse_grass_scatter:'grass',
  grass_scatter:       'grass',
  beach_grass_scatter: 'grass',

  // Vegetation — trees
  cactus_scatter:      'mushroom',       // closest built-in; custom registration recommended
  acacia_tree_scatter: 'fern',           // placeholder — register a custom type
  dense_tree_scatter:  'fern',
  tree_scatter:        'fern',
  pine_tree_scatter:   'pine_needle',

  // Ground cover — organic
  fern_scatter:        'fern',
  moss_scatter:        'moss',
  lichen_scatter:      'lichen',
  vine_scatter:        'fern',           // placeholder — register a custom type
  mushroom_scatter:    'mushroom',
  wildflower_scatter:  'flower',
  berry_scatter:       'flower',         // placeholder — register a custom type

  // Rocks & debris
  rock_scatter:        'rock',
  small_rock_scatter:  'pebble',

  // Snow
  snow_scatter:        'snow_layer',

  // Coast
  seashell_scatter:    'seashell',
  driftwood_scatter:   'twig',

  // Desert
  tumbleweed_scatter:  'ground_leaves',  // placeholder — register a custom type

  // Ocean
  kelp_scatter:        'fern',           // kelp uses fern-like geometry
  coral_scatter:       'rock',           // coral uses rock-like geometry with coral material
};

/**
 * Get the canonical scatter IDs for a given biome type.
 *
 * @param biomeType - Biome identifier (supports both Whittaker and legacy names)
 * @returns Array of scatter ID strings, or empty array if biome is unknown
 */
export function getScatterIdsForBiome(biomeType: string): string[] {
  return BIOME_SCATTER_ID_MAP[biomeType] ?? [];
}

/**
 * Resolve a canonical scatter ID to a ScatterFactory ScatterType.
 *
 * @param scatterId - Canonical scatter ID (e.g. 'sand_scatter')
 * @returns ScatterType string for use with ScatterFactory, or undefined
 */
export function resolveScatterType(scatterId: string): string | undefined {
  return SCATTER_ID_TO_SCATTER_TYPE[scatterId];
}

// ============================================================================
// Singleton / Exports
// ============================================================================

/**
 * Shared, pre-populated BiomeScatterMapping instance.
 * Prefer using this over constructing a new one unless you need custom profiles.
 */
export const BIOME_SCATTER_MAPPING = new BiomeScatterMapping();

/**
 * Convenience function — returns BiomeScatterConfig[] for the given biome type,
 * with scatterType, density, scaleRange, and materialPreset for each entry.
 *
 * This is the primary export consumers should use for runtime scatter lookups
 * when working with biome masks and ScatterFactory.
 *
 * @param biomeType - Biome identifier (supports both Whittaker and legacy names)
 * @returns Array of BiomeScatterConfig entries, or empty array if biome is unknown
 */
export function getScatterConfigForBiome(biomeType: string): BiomeScatterConfig[] {
  return BIOME_SCATTER_MAPPING.getScatterConfigForBiome(biomeType);
}

export default BiomeScatterMapping;
