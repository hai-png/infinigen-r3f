/**
 * Vegetation Shared Types
 *
 * Canonical type definitions for the vegetation system.
 * All vegetation modules should import shared types from this file
 * instead of redefining them locally.
 *
 * @module assets/objects/vegetation/types
 */

// ============================================================================
// Season
// ============================================================================

/**
 * The four seasons used throughout the vegetation system.
 *
 * Previously duplicated across:
 *   - VegetationP2Features.ts (SeasonAwareSelector)
 *   - FruitFlowerSystem.ts (SeasonConfig)
 *   - VegetationLODSystem.ts (SeasonalLODConfig)
 *   - NatureSceneComposer.ts
 *   - SeasonAwareSpeciesSelector.ts
 *   - ForestFloorScatter.ts
 *   - TreeGenerator.ts (TreeSpeciesConfig.seasonalColors)
 *   - SpaceColonizationTreeGenerator.ts
 *   - ShrubGenerator.ts
 *   - GrasslandGenerator.ts
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** All four seasons as a constant array for iteration */
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'] as const;

// ============================================================================
// Vegetation Category
// ============================================================================

/**
 * Broad categories of vegetation used for classification and selection.
 */
export type VegetationCategory =
  | 'tree'
  | 'shrub'
  | 'grass'
  | 'fern'
  | 'flower'
  | 'mushroom'
  | 'moss'
  | 'cactus'
  | 'vine'
  | 'coral';

/**
 * Seasonal species category for weighted selection.
 */
export type SeasonalSpeciesCategory =
  | 'flowering'
  | 'fruiting'
  | 'evergreen'
  | 'deciduous'
  | 'herbaceous';

// ============================================================================
// Seasonal Weighting
// ============================================================================

/**
 * Seasonal weight map — maps each season to a numeric weight.
 * Used by species selectors, LOD systems, and scatter systems.
 */
export type SeasonalWeights = Record<Season, number>;

/**
 * Season-aware color map.
 */
export type SeasonalColors = Partial<Record<Season, import('three').Color>>;

// ============================================================================
// Species Descriptor
// ============================================================================

/**
 * Minimal species descriptor used across the vegetation system.
 * Each generator may extend this with generator-specific fields,
 * but the core identity (name, category, seasonalWeights) lives here.
 */
export interface SpeciesDescriptor {
  /** Unique species name (e.g. 'oak', 'cherry_blossom') */
  name: string;
  /** Species category for seasonal selection */
  category: SeasonalSpeciesCategory;
  /** Seasonal weight multipliers — how likely this species is to appear per season */
  seasonalWeights: SeasonalWeights;
}
