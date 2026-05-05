/**
 * SeasonAwareSpeciesSelector.ts
 *
 * Season-aware species selection system for procedural scatter objects.
 * Provides climate-zone and season-dependent species mixing, density
 * modulation, and color shifting — mirroring the original Infinigen
 * `season` parameter that governs which plants, fruits, and scatter
 * objects appear.
 *
 * Architecture:
 *   Season / ClimateZone enums — canonical identifiers
 *   SpeciesEntry — per-species metadata (season probability, climate range, etc.)
 *   SpeciesDatabase — ~45 pre-populated realistic species entries
 *   SeasonAwareSpeciesSelector — weighted random selection, density/color queries
 *   SeasonConfig — runtime season state with transition support
 *
 * @module assets/objects/scatter/seasonal
 */

import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Enums
// ============================================================================

/**
 * Canonical season identifiers with built-in transition ordering.
 * The numeric values encode the natural cycle: SPRING → SUMMER → AUTUMN → WINTER → SPRING.
 */
export enum Season {
  SPRING = 'spring',
  SUMMER = 'summer',
  AUTUMN = 'autumn',
  WINTER = 'winter',
}

/**
 * Köppen-inspired climate zone classification.
 * Controls which species are available and how seasons manifest.
 */
export enum ClimateZone {
  TROPICAL = 'tropical',
  TEMPERATE = 'temperate',
  BOREAL = 'boreal',
  ARID = 'arid',
  ALPINE = 'alpine',
}

// ============================================================================
// Interfaces
// ============================================================================

/**
 * A single species entry in the database.
 * Describes the ecological niche of a species across seasons and climates.
 */
export interface SpeciesEntry {
  /** Unique identifier, e.g. 'oak_white', 'pine_scots' */
  speciesId: string;
  /** Human-readable name */
  name: string;
  /** Broad biological category */
  category: 'tree' | 'shrub' | 'flower' | 'grass' | 'mushroom' | 'fruit';
  /** Probability of appearance in each season (0 = absent, 1 = peak) */
  seasonAvailability: Record<Season, number>;
  /** Climate zones where this species naturally occurs */
  climateZones: ClimateZone[];
  /** Altitude range in meters [min, max] */
  altitudeRange: [number, number];
  /** Moisture range 0–1 [min, max] (0 = desert, 1 = swamp) */
  moistureRange: [number, number];
}

/**
 * Seasonal variation parameters for a specific species in a given season.
 */
export interface SeasonalVariationParams {
  /** Leaf / foliage color as [r, g, b] in 0–1 */
  leafColor: [number, number, number];
  /** Whether fruit is present and its ripeness 0–1 */
  fruitPresence: number;
  /** Density modifier relative to peak (1.0 = no change) */
  densityModifier: number;
}

/**
 * Runtime season configuration — passed to the selector to contextualise
 * all queries. Includes the current season, progress within the season,
 * climate zone, and environmental parameters.
 */
export interface SeasonConfig {
  /** Current season */
  currentSeason: Season;
  /** Progress within the current season 0–1 (0 = start, 1 = end) */
  seasonProgress: number;
  /** Climate zone of the scene */
  climateZone: ClimateZone;
  /** Base temperature in °C */
  temperatureBase: number;
  /** Daylight hours (0–24) */
  daylightHours: number;
  /** Precipitation level 0–1 */
  precipitationLevel: number;
}

/**
 * Parameters for species selection queries.
 */
export interface SelectionParams {
  /** Climate zone (defaults to TEMPERATE) */
  climateZone?: ClimateZone;
  /** Altitude in metres (defaults to 0) */
  altitude?: number;
  /** Moisture level 0–1 (defaults to 0.5) */
  moisture?: number;
  /** Optional category filter */
  category?: SpeciesEntry['category'];
  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * Result of interpolating between two seasons.
 */
export interface InterpolatedSeasonState {
  /** Primary (current) season */
  fromSeason: Season;
  /** Next season we are transitioning towards */
  toSeason: Season;
  /** Blend factor 0–1 (0 = fully fromSeason, 1 = fully toSeason) */
  blend: number;
  /** Blended species availability (speciesId → weighted probability) */
  blendedAvailability: Map<string, number>;
  /** Blended density multipliers (speciesId → multiplier) */
  blendedDensity: Map<string, number>;
  /** Blended color shifts (speciesId → [r, g, b]) */
  blendedColorShift: Map<string, [number, number, number]>;
}

// ============================================================================
// Season Helpers
// ============================================================================

/** Ordered season cycle for iteration */
const SEASON_ORDER: Season[] = [Season.SPRING, Season.SUMMER, Season.AUTUMN, Season.WINTER];

/** Length of each season's transition period (fraction of the season) */
const TRANSITION_FRACTION = 0.2; // 20 % of each season is a transition zone

/**
 * Get the next season in the natural cycle.
 */
export function nextSeason(s: Season): Season {
  const idx = SEASON_ORDER.indexOf(s);
  return SEASON_ORDER[(idx + 1) % SEASON_ORDER.length];
}

/**
 * Get the previous season in the natural cycle.
 */
export function prevSeason(s: Season): Season {
  const idx = SEASON_ORDER.indexOf(s);
  return SEASON_ORDER[(idx + SEASON_ORDER.length - 1) % SEASON_ORDER.length];
}

/**
 * Determine if we are in a transition zone at the end of a season,
 * and if so, compute the blend factor towards the next season.
 * Returns null if not transitioning.
 */
export function getTransition(
  season: Season,
  progress: number,
): { toSeason: Season; blend: number } | null {
  if (progress > 1.0 - TRANSITION_FRACTION) {
    const blend = (progress - (1.0 - TRANSITION_FRACTION)) / TRANSITION_FRACTION;
    return { toSeason: nextSeason(season), blend };
  }
  // Transition at the very start of a season (from the previous one)
  if (progress < TRANSITION_FRACTION) {
    const blend = 1.0 - progress / TRANSITION_FRACTION;
    return { toSeason: prevSeason(season), blend };
  }
  return null;
}

// ============================================================================
// Species Database
// ============================================================================

/**
 * Central database of ~45 species with realistic ecological profiles.
 *
 * Season availability follows these general rules:
 *   - Trees: mostly evergreen or deciduous (high summer, low winter)
 *   - Flowers: peak in spring/summer, absent in winter
 *   - Fruits: peak in summer/autumn
 *   - Grasses: moderate in warm seasons, dormant in winter
 *   - Mushrooms: peak in autumn (moist), low in other seasons
 *   - Shrubs: similar to trees but wider availability
 */
export class SpeciesDatabase {
  private entries: Map<string, SpeciesEntry> = new Map();

  constructor() {
    this.populateDefaults();
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Get a species by ID. Returns undefined if not found. */
  get(speciesId: string): SpeciesEntry | undefined {
    return this.entries.get(speciesId);
  }

  /** Get all species entries. */
  getAll(): SpeciesEntry[] {
    return Array.from(this.entries.values());
  }

  /** Get species count. */
  get size(): number {
    return this.entries.size;
  }

  /** Add or replace a species entry. */
  set(entry: SpeciesEntry): void {
    this.entries.set(entry.speciesId, entry);
  }

  /**
   * Query species matching a season, climate, altitude, and moisture.
   * Returns entries with their weighted probability for the given season.
   */
  queryBySeason(
    season: Season,
    climate: ClimateZone = ClimateZone.TEMPERATE,
    altitude: number = 0,
    moisture: number = 0.5,
  ): Array<{ entry: SpeciesEntry; weight: number }> {
    const results: Array<{ entry: SpeciesEntry; weight: number }> = [];

    for (const entry of this.entries.values()) {
      // Climate filter
      if (!entry.climateZones.includes(climate)) continue;

      // Altitude filter
      if (altitude < entry.altitudeRange[0] || altitude > entry.altitudeRange[1]) continue;

      // Moisture filter — species outside moisture range get reduced weight
      let moistureFactor = 1.0;
      if (moisture < entry.moistureRange[0] || moisture > entry.moistureRange[1]) {
        // Partial penalty based on distance from range
        const dist = moisture < entry.moistureRange[0]
          ? entry.moistureRange[0] - moisture
          : moisture - entry.moistureRange[1];
        moistureFactor = Math.max(0, 1.0 - dist * 3.0);
      }

      const seasonWeight = entry.seasonAvailability[season] * moistureFactor;
      if (seasonWeight > 0) {
        results.push({ entry, weight: seasonWeight });
      }
    }

    // Sort by weight descending
    results.sort((a, b) => b.weight - a.weight);
    return results;
  }

  /**
   * Query species of a specific category for a season and climate.
   */
  queryByCategory(
    category: SpeciesEntry['category'],
    season: Season,
    climate: ClimateZone = ClimateZone.TEMPERATE,
  ): Array<{ entry: SpeciesEntry; weight: number }> {
    return this.queryBySeason(season, climate).filter(
      ({ entry }) => entry.category === category,
    );
  }

  /**
   * Get seasonal variation parameters for a species in a given season.
   * Returns leaf color, fruit presence, and density modifier.
   */
  getSeasonalVariation(speciesId: string, season: Season): SeasonalVariationParams {
    const entry = this.entries.get(speciesId);
    if (!entry) {
      return DEFAULT_VARIATION;
    }

    const availability = entry.seasonAvailability[season];

    switch (entry.category) {
      case 'tree':
        return getTreeVariation(entry, season, availability);
      case 'shrub':
        return getShrubVariation(entry, season, availability);
      case 'flower':
        return getFlowerVariation(entry, season, availability);
      case 'grass':
        return getGrassVariation(entry, season, availability);
      case 'mushroom':
        return getMushroomVariation(entry, season, availability);
      case 'fruit':
        return getFruitVariation(entry, season, availability);
      default:
        return DEFAULT_VARIATION;
    }
  }

  // --------------------------------------------------------------------------
  // Default Species Population
  // --------------------------------------------------------------------------

  private populateDefaults(): void {
    // ── Trees ──────────────────────────────────────────────────────────
    this.set({
      speciesId: 'oak_white',
      name: 'White Oak',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 0.8, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.7, [Season.WINTER]: 0.3 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [0, 1500],
      moistureRange: [0.3, 0.8],
    });
    this.set({
      speciesId: 'maple_sugar',
      name: 'Sugar Maple',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 0.7, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.9, [Season.WINTER]: 0.2 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [100, 1600],
      moistureRange: [0.4, 0.8],
    });
    this.set({
      speciesId: 'pine_scots',
      name: 'Scots Pine',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 0.9, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.9, [Season.WINTER]: 0.8 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL, ClimateZone.ALPINE],
      altitudeRange: [0, 2000],
      moistureRange: [0.2, 0.7],
    });
    this.set({
      speciesId: 'birch_silver',
      name: 'Silver Birch',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 0.8, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.6, [Season.WINTER]: 0.3 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [0, 1800],
      moistureRange: [0.3, 0.8],
    });
    this.set({
      speciesId: 'spruce_norway',
      name: 'Norway Spruce',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 0.95, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.95, [Season.WINTER]: 0.9 },
      climateZones: [ClimateZone.BOREAL, ClimateZone.ALPINE, ClimateZone.TEMPERATE],
      altitudeRange: [200, 2300],
      moistureRange: [0.3, 0.7],
    });
    this.set({
      speciesId: 'palm_coconut',
      name: 'Coconut Palm',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 1.0, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 1.0, [Season.WINTER]: 0.9 },
      climateZones: [ClimateZone.TROPICAL],
      altitudeRange: [0, 500],
      moistureRange: [0.5, 1.0],
    });
    this.set({
      speciesId: 'baobab',
      name: 'Baobab',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 0.6, [Season.SUMMER]: 0.3, [Season.AUTUMN]: 0.5, [Season.WINTER]: 0.4 },
      climateZones: [ClimateZone.TROPICAL, ClimateZone.ARID],
      altitudeRange: [0, 800],
      moistureRange: [0.1, 0.5],
    });
    this.set({
      speciesId: 'cedar_atlas',
      name: 'Atlas Cedar',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 0.9, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.9, [Season.WINTER]: 0.85 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.ARID, ClimateZone.ALPINE],
      altitudeRange: [500, 2200],
      moistureRange: [0.15, 0.6],
    });
    this.set({
      speciesId: 'willow_weeping',
      name: 'Weeping Willow',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 0.9, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.5, [Season.WINTER]: 0.1 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.TROPICAL],
      altitudeRange: [0, 800],
      moistureRange: [0.6, 1.0],
    });
    this.set({
      speciesId: 'aspen_quaking',
      name: 'Quaking Aspen',
      category: 'tree',
      seasonAvailability: { [Season.SPRING]: 0.7, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.8, [Season.WINTER]: 0.2 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [300, 2500],
      moistureRange: [0.25, 0.7],
    });

    // ── Shrubs ─────────────────────────────────────────────────────────
    this.set({
      speciesId: 'rhododendron',
      name: 'Rhododendron',
      category: 'shrub',
      seasonAvailability: { [Season.SPRING]: 1.0, [Season.SUMMER]: 0.8, [Season.AUTUMN]: 0.5, [Season.WINTER]: 0.4 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL, ClimateZone.ALPINE],
      altitudeRange: [200, 2500],
      moistureRange: [0.4, 0.8],
    });
    this.set({
      speciesId: 'hazel_common',
      name: 'Common Hazel',
      category: 'shrub',
      seasonAvailability: { [Season.SPRING]: 0.8, [Season.SUMMER]: 0.9, [Season.AUTUMN]: 0.7, [Season.WINTER]: 0.3 },
      climateZones: [ClimateZone.TEMPERATE],
      altitudeRange: [0, 1200],
      moistureRange: [0.35, 0.75],
    });
    this.set({
      speciesId: 'juniper_common',
      name: 'Common Juniper',
      category: 'shrub',
      seasonAvailability: { [Season.SPRING]: 0.8, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.9, [Season.WINTER]: 0.7 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL, ClimateZone.ALPINE],
      altitudeRange: [300, 2800],
      moistureRange: [0.15, 0.55],
    });
    this.set({
      speciesId: 'bougainvillea',
      name: 'Bougainvillea',
      category: 'shrub',
      seasonAvailability: { [Season.SPRING]: 1.0, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.8, [Season.WINTER]: 0.6 },
      climateZones: [ClimateZone.TROPICAL, ClimateZone.ARID],
      altitudeRange: [0, 600],
      moistureRange: [0.1, 0.6],
    });
    this.set({
      speciesId: 'blackberry_bush',
      name: 'Blackberry Bush',
      category: 'shrub',
      seasonAvailability: { [Season.SPRING]: 0.6, [Season.SUMMER]: 0.9, [Season.AUTUMN]: 1.0, [Season.WINTER]: 0.2 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [0, 1000],
      moistureRange: [0.35, 0.8],
    });

    // ── Flowers ────────────────────────────────────────────────────────
    this.set({
      speciesId: 'rose_wild',
      name: 'Wild Rose',
      category: 'flower',
      seasonAvailability: { [Season.SPRING]: 0.9, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.3, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE],
      altitudeRange: [0, 1200],
      moistureRange: [0.3, 0.75],
    });
    this.set({
      speciesId: 'tulip',
      name: 'Tulip',
      category: 'flower',
      seasonAvailability: { [Season.SPRING]: 1.0, [Season.SUMMER]: 0.1, [Season.AUTUMN]: 0.0, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [0, 1000],
      moistureRange: [0.3, 0.7],
    });
    this.set({
      speciesId: 'sunflower',
      name: 'Sunflower',
      category: 'flower',
      seasonAvailability: { [Season.SPRING]: 0.3, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.4, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.ARID],
      altitudeRange: [0, 800],
      moistureRange: [0.2, 0.7],
    });
    this.set({
      speciesId: 'lavender',
      name: 'Lavender',
      category: 'flower',
      seasonAvailability: { [Season.SPRING]: 0.5, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.3, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.ARID],
      altitudeRange: [0, 1500],
      moistureRange: [0.1, 0.5],
    });
    this.set({
      speciesId: 'cherry_blossom',
      name: 'Cherry Blossom',
      category: 'flower',
      seasonAvailability: { [Season.SPRING]: 1.0, [Season.SUMMER]: 0.1, [Season.AUTUMN]: 0.0, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE],
      altitudeRange: [0, 800],
      moistureRange: [0.35, 0.75],
    });
    this.set({
      speciesId: 'orchid_tropical',
      name: 'Tropical Orchid',
      category: 'flower',
      seasonAvailability: { [Season.SPRING]: 0.9, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.8, [Season.WINTER]: 0.6 },
      climateZones: [ClimateZone.TROPICAL],
      altitudeRange: [0, 1200],
      moistureRange: [0.5, 1.0],
    });
    this.set({
      speciesId: 'edelweiss',
      name: 'Edelweiss',
      category: 'flower',
      seasonAvailability: { [Season.SPRING]: 0.4, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.2, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.ALPINE],
      altitudeRange: [1800, 3400],
      moistureRange: [0.2, 0.6],
    });
    this.set({
      speciesId: 'daisy_common',
      name: 'Common Daisy',
      category: 'flower',
      seasonAvailability: { [Season.SPRING]: 0.9, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.4, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE],
      altitudeRange: [0, 800],
      moistureRange: [0.3, 0.7],
    });

    // ── Fruits ─────────────────────────────────────────────────────────
    this.set({
      speciesId: 'blueberry',
      name: 'Blueberry',
      category: 'fruit',
      seasonAvailability: { [Season.SPRING]: 0.2, [Season.SUMMER]: 0.9, [Season.AUTUMN]: 1.0, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [0, 1500],
      moistureRange: [0.4, 0.85],
    });
    this.set({
      speciesId: 'apple',
      name: 'Apple',
      category: 'fruit',
      seasonAvailability: { [Season.SPRING]: 0.3, [Season.SUMMER]: 0.7, [Season.AUTUMN]: 1.0, [Season.WINTER]: 0.1 },
      climateZones: [ClimateZone.TEMPERATE],
      altitudeRange: [0, 1200],
      moistureRange: [0.35, 0.75],
    });
    this.set({
      speciesId: 'cherry',
      name: 'Cherry',
      category: 'fruit',
      seasonAvailability: { [Season.SPRING]: 0.5, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.2, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE],
      altitudeRange: [0, 1000],
      moistureRange: [0.35, 0.75],
    });
    this.set({
      speciesId: 'mango',
      name: 'Mango',
      category: 'fruit',
      seasonAvailability: { [Season.SPRING]: 0.4, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.6, [Season.WINTER]: 0.1 },
      climateZones: [ClimateZone.TROPICAL],
      altitudeRange: [0, 600],
      moistureRange: [0.4, 0.9],
    });
    this.set({
      speciesId: 'fig',
      name: 'Fig',
      category: 'fruit',
      seasonAvailability: { [Season.SPRING]: 0.3, [Season.SUMMER]: 0.9, [Season.AUTUMN]: 1.0, [Season.WINTER]: 0.1 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.TROPICAL, ClimateZone.ARID],
      altitudeRange: [0, 800],
      moistureRange: [0.2, 0.7],
    });
    this.set({
      speciesId: 'strawberry',
      name: 'Strawberry',
      category: 'fruit',
      seasonAvailability: { [Season.SPRING]: 0.7, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.3, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE],
      altitudeRange: [0, 1000],
      moistureRange: [0.4, 0.8],
    });
    this.set({
      speciesId: 'citrus_orange',
      name: 'Orange',
      category: 'fruit',
      seasonAvailability: { [Season.SPRING]: 0.6, [Season.SUMMER]: 0.5, [Season.AUTUMN]: 0.8, [Season.WINTER]: 1.0 },
      climateZones: [ClimateZone.TROPICAL, ClimateZone.ARID],
      altitudeRange: [0, 600],
      moistureRange: [0.3, 0.7],
    });

    // ── Mushrooms ──────────────────────────────────────────────────────
    this.set({
      speciesId: 'chanterelle',
      name: 'Chanterelle',
      category: 'mushroom',
      seasonAvailability: { [Season.SPRING]: 0.1, [Season.SUMMER]: 0.5, [Season.AUTUMN]: 1.0, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [0, 1200],
      moistureRange: [0.5, 1.0],
    });
    this.set({
      speciesId: 'morel',
      name: 'Morel',
      category: 'mushroom',
      seasonAvailability: { [Season.SPRING]: 1.0, [Season.SUMMER]: 0.2, [Season.AUTUMN]: 0.1, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE],
      altitudeRange: [0, 1000],
      moistureRange: [0.45, 0.85],
    });
    this.set({
      speciesId: 'amanita_muscaria',
      name: 'Fly Agaric (Amanita)',
      category: 'mushroom',
      seasonAvailability: { [Season.SPRING]: 0.0, [Season.SUMMER]: 0.3, [Season.AUTUMN]: 1.0, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [0, 1500],
      moistureRange: [0.5, 0.9],
    });
    this.set({
      speciesId: 'porcini',
      name: 'Porcini',
      category: 'mushroom',
      seasonAvailability: { [Season.SPRING]: 0.0, [Season.SUMMER]: 0.4, [Season.AUTUMN]: 1.0, [Season.WINTER]: 0.0 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [200, 1600],
      moistureRange: [0.45, 0.85],
    });
    this.set({
      speciesId: 'shiitake',
      name: 'Shiitake',
      category: 'mushroom',
      seasonAvailability: { [Season.SPRING]: 0.5, [Season.SUMMER]: 0.6, [Season.AUTUMN]: 1.0, [Season.WINTER]: 0.1 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.TROPICAL],
      altitudeRange: [0, 1000],
      moistureRange: [0.5, 0.95],
    });

    // ── Grasses ────────────────────────────────────────────────────────
    this.set({
      speciesId: 'fescue_red',
      name: 'Red Fescue',
      category: 'grass',
      seasonAvailability: { [Season.SPRING]: 0.8, [Season.SUMMER]: 0.7, [Season.AUTUMN]: 0.6, [Season.WINTER]: 0.4 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [0, 2000],
      moistureRange: [0.2, 0.7],
    });
    this.set({
      speciesId: 'bermuda_grass',
      name: 'Bermuda Grass',
      category: 'grass',
      seasonAvailability: { [Season.SPRING]: 0.7, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.5, [Season.WINTER]: 0.1 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.ARID, ClimateZone.TROPICAL],
      altitudeRange: [0, 600],
      moistureRange: [0.15, 0.6],
    });
    this.set({
      speciesId: 'ryegrass_perennial',
      name: 'Perennial Ryegrass',
      category: 'grass',
      seasonAvailability: { [Season.SPRING]: 0.9, [Season.SUMMER]: 0.8, [Season.AUTUMN]: 0.7, [Season.WINTER]: 0.5 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.BOREAL],
      altitudeRange: [0, 1200],
      moistureRange: [0.35, 0.8],
    });
    this.set({
      speciesId: 'pampas_grass',
      name: 'Pampas Grass',
      category: 'grass',
      seasonAvailability: { [Season.SPRING]: 0.5, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.9, [Season.WINTER]: 0.3 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.ARID],
      altitudeRange: [0, 800],
      moistureRange: [0.1, 0.5],
    });
    this.set({
      speciesId: 'bamboo_moso',
      name: 'Moso Bamboo',
      category: 'grass',
      seasonAvailability: { [Season.SPRING]: 1.0, [Season.SUMMER]: 0.9, [Season.AUTUMN]: 0.8, [Season.WINTER]: 0.7 },
      climateZones: [ClimateZone.TROPICAL, ClimateZone.TEMPERATE],
      altitudeRange: [0, 1200],
      moistureRange: [0.4, 0.9],
    });
    this.set({
      speciesId: 'wheat_wild',
      name: 'Wild Wheat',
      category: 'grass',
      seasonAvailability: { [Season.SPRING]: 0.8, [Season.SUMMER]: 1.0, [Season.AUTUMN]: 0.6, [Season.WINTER]: 0.1 },
      climateZones: [ClimateZone.TEMPERATE, ClimateZone.ARID],
      altitudeRange: [0, 1000],
      moistureRange: [0.2, 0.6],
    });
  }
}

// ============================================================================
// Category-specific Variation Helpers
// ============================================================================

const DEFAULT_VARIATION: SeasonalVariationParams = {
  leafColor: [0.18, 0.35, 0.12],
  fruitPresence: 0,
  densityModifier: 1.0,
};

/**
 * Tree seasonal variation — deciduous color cycle.
 */
function getTreeVariation(
  entry: SpeciesEntry,
  season: Season,
  availability: number,
): SeasonalVariationParams {
  // Conifers (pine, spruce, cedar) keep green year-round
  const isConifer = entry.speciesId.includes('pine')
    || entry.speciesId.includes('spruce')
    || entry.speciesId.includes('cedar')
    || entry.speciesId.includes('juniper')
    || entry.speciesId.includes('palm');

  if (isConifer) {
    return {
      leafColor: season === Season.WINTER
        ? [0.12, 0.25, 0.10]
        : [0.15, 0.35, 0.12],
      fruitPresence: season === Season.AUTUMN ? 0.4 : 0,
      densityModifier: availability,
    };
  }

  switch (season) {
    case Season.SPRING:
      return { leafColor: [0.35, 0.60, 0.20], fruitPresence: 0.05, densityModifier: availability };
    case Season.SUMMER:
      return { leafColor: [0.18, 0.35, 0.12], fruitPresence: 0.4, densityModifier: availability };
    case Season.AUTUMN:
      return { leafColor: [0.75, 0.35, 0.08], fruitPresence: 0.8, densityModifier: availability };
    case Season.WINTER:
      return { leafColor: [0.35, 0.25, 0.15], fruitPresence: 0.0, densityModifier: availability };
  }
}

/**
 * Shrub seasonal variation — similar to trees but shrubs stay greener longer.
 */
function getShrubVariation(
  _entry: SpeciesEntry,
  season: Season,
  availability: number,
): SeasonalVariationParams {
  switch (season) {
    case Season.SPRING:
      return { leafColor: [0.30, 0.55, 0.22], fruitPresence: 0.1, densityModifier: availability };
    case Season.SUMMER:
      return { leafColor: [0.20, 0.40, 0.15], fruitPresence: 0.5, densityModifier: availability };
    case Season.AUTUMN:
      return { leafColor: [0.55, 0.35, 0.12], fruitPresence: 0.7, densityModifier: availability };
    case Season.WINTER:
      return { leafColor: [0.28, 0.30, 0.18], fruitPresence: 0.0, densityModifier: availability };
  }
}

/**
 * Flower seasonal variation — vivid in bloom, absent out of season.
 */
function getFlowerVariation(
  _entry: SpeciesEntry,
  season: Season,
  availability: number,
): SeasonalVariationParams {
  switch (season) {
    case Season.SPRING:
      return { leafColor: [0.90, 0.55, 0.70], fruitPresence: 0.0, densityModifier: availability };
    case Season.SUMMER:
      return { leafColor: [0.95, 0.75, 0.20], fruitPresence: 0.0, densityModifier: availability };
    case Season.AUTUMN:
      return { leafColor: [0.70, 0.40, 0.20], fruitPresence: 0.0, densityModifier: availability };
    case Season.WINTER:
      return { leafColor: [0.40, 0.35, 0.30], fruitPresence: 0.0, densityModifier: 0.0 };
  }
}

/**
 * Grass seasonal variation — golden in arid/autumn, green in wet seasons.
 */
function getGrassVariation(
  _entry: SpeciesEntry,
  season: Season,
  availability: number,
): SeasonalVariationParams {
  switch (season) {
    case Season.SPRING:
      return { leafColor: [0.40, 0.60, 0.20], fruitPresence: 0.0, densityModifier: availability };
    case Season.SUMMER:
      return { leafColor: [0.35, 0.50, 0.15], fruitPresence: 0.0, densityModifier: availability };
    case Season.AUTUMN:
      return { leafColor: [0.65, 0.50, 0.15], fruitPresence: 0.0, densityModifier: availability };
    case Season.WINTER:
      return { leafColor: [0.45, 0.38, 0.20], fruitPresence: 0.0, densityModifier: availability };
  }
}

/**
 * Mushroom seasonal variation — peak in damp autumn.
 */
function getMushroomVariation(
  _entry: SpeciesEntry,
  season: Season,
  availability: number,
): SeasonalVariationParams {
  switch (season) {
    case Season.SPRING:
      return { leafColor: [0.55, 0.45, 0.30], fruitPresence: 0.3, densityModifier: availability };
    case Season.SUMMER:
      return { leafColor: [0.50, 0.40, 0.25], fruitPresence: 0.5, densityModifier: availability };
    case Season.AUTUMN:
      return { leafColor: [0.60, 0.50, 0.30], fruitPresence: 1.0, densityModifier: availability };
    case Season.WINTER:
      return { leafColor: [0.35, 0.30, 0.25], fruitPresence: 0.0, densityModifier: 0.0 };
  }
}

/**
 * Fruit seasonal variation — unripe in spring, ripe in summer/autumn.
 */
function getFruitVariation(
  _entry: SpeciesEntry,
  season: Season,
  availability: number,
): SeasonalVariationParams {
  switch (season) {
    case Season.SPRING:
      return { leafColor: [0.50, 0.65, 0.25], fruitPresence: 0.2, densityModifier: availability };
    case Season.SUMMER:
      return { leafColor: [0.25, 0.45, 0.15], fruitPresence: 0.7, densityModifier: availability };
    case Season.AUTUMN:
      return { leafColor: [0.70, 0.45, 0.15], fruitPresence: 1.0, densityModifier: availability };
    case Season.WINTER:
      return { leafColor: [0.35, 0.30, 0.20], fruitPresence: 0.1, densityModifier: availability };
  }
}

// ============================================================================
// SeasonAwareSpeciesSelector
// ============================================================================

/**
 * Main selector class — provides weighted random species selection,
 * density/computeColorShift computation, and season interpolation.
 *
 * Usage:
 * ```ts
 * const selector = new SeasonAwareSpeciesSelector(42);
 * const species = selector.selectSpecies(5, {
 *   climateZone: ClimateZone.TEMPERATE,
 *   altitude: 300,
 *   moisture: 0.5,
 * });
 * ```
 */
export class SeasonAwareSpeciesSelector {
  private db: SpeciesDatabase;
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.db = new SpeciesDatabase();
    this.rng = new SeededRandom(seed);
  }

  /** Access the underlying species database. */
  get database(): SpeciesDatabase {
    return this.db;
  }

  // --------------------------------------------------------------------------
  // Selection
  // --------------------------------------------------------------------------

  /**
   * Select N species matching the given criteria using weighted random sampling.
   * Species with higher season availability are more likely to be chosen.
   *
   * @param count Number of species to select
   * @param params Selection parameters (season, climate, altitude, moisture)
   * @param season The current season
   * @returns Array of selected SpeciesEntry (may be fewer than count if insufficient matches)
   */
  selectSpecies(
    count: number,
    params: SelectionParams,
    season: Season = Season.SUMMER,
  ): SpeciesEntry[] {
    const climate = params.climateZone ?? ClimateZone.TEMPERATE;
    const altitude = params.altitude ?? 0;
    const moisture = params.moisture ?? 0.5;
    const seed = params.seed ?? this.rng.nextInt(0, 999999);

    const localRng = new SeededRandom(seed);

    let candidates = this.db.queryBySeason(season, climate, altitude, moisture);

    // Optional category filter
    if (params.category) {
      candidates = candidates.filter(({ entry }) => entry.category === params.category);
    }

    if (candidates.length === 0) return [];

    // Weighted random sampling without replacement
    const selected: SpeciesEntry[] = [];
    const remaining = [...candidates];
    const targetCount = Math.min(count, remaining.length);

    for (let i = 0; i < targetCount; i++) {
      const totalWeight = remaining.reduce((sum, c) => sum + c.weight, 0);
      if (totalWeight <= 0) break;

      let r = localRng.next() * totalWeight;
      let chosenIndex = 0;
      for (let j = 0; j < remaining.length; j++) {
        r -= remaining[j].weight;
        if (r <= 0) {
          chosenIndex = j;
          break;
        }
      }

      selected.push(remaining[chosenIndex].entry);
      remaining.splice(chosenIndex, 1);
    }

    return selected;
  }

  // --------------------------------------------------------------------------
  // Density & Color
  // --------------------------------------------------------------------------

  /**
   * Compute the density multiplier for a species in a given season and climate.
   * Returns a value where 1.0 = nominal density, <1 = reduced, >1 = increased.
   *
   * The multiplier is derived from:
   *   - Base season availability
   *   - Climate-specific adjustments (tropical = more in winter, boreal = less)
   *   - Temperature deviation from the species' optimum
   */
  computeDensityMultiplier(
    speciesId: string,
    season: Season,
    climate: ClimateZone = ClimateZone.TEMPERATE,
  ): number {
    const entry = this.db.get(speciesId);
    if (!entry) return 0;

    const baseAvailability = entry.seasonAvailability[season];
    if (baseAvailability <= 0) return 0;

    // Climate modifier — how "comfortable" the species is in this climate
    const inClimate = entry.climateZones.includes(climate);
    const climateModifier = inClimate ? 1.0 : 0.3;

    // Seasonal climate adjustments
    let seasonClimateBonus = 0;
    if (climate === ClimateZone.TROPICAL) {
      // Tropical climates have less seasonal variation
      seasonClimateBonus = season === Season.WINTER ? 0.3 : 0;
    } else if (climate === ClimateZone.BOREAL) {
      // Boreal climates have extreme winter reduction
      seasonClimateBonus = season === Season.WINTER ? -0.3 : 0;
    } else if (climate === ClimateZone.ARID) {
      // Arid climates favor spring (brief bloom period)
      seasonClimateBonus = season === Season.SPRING ? 0.15 : 0;
    } else if (climate === ClimateZone.ALPINE) {
      // Alpine climates have a very short growing season
      seasonClimateBonus = season === Season.SUMMER ? 0.2 : season === Season.WINTER ? -0.4 : 0;
    }

    const result = baseAvailability * climateModifier + seasonClimateBonus;
    return Math.max(0, Math.min(2.0, result));
  }

  /**
   * Compute the leaf/bark color shift for a species in a given season.
   * Returns an [r, g, b] offset to add to the base color (0–1 range).
   *
   * This accounts for:
   *   - Chlorophyll loss in autumn (yellowing → browning)
   *   - Frost damage in winter (darkening)
   *   - New growth in spring (brightening)
   *   - Full canopy in summer (deep green)
   */
  computeColorShift(speciesId: string, season: Season): [number, number, number] {
    const entry = this.db.get(speciesId);
    if (!entry) return [0, 0, 0];

    const variation = this.db.getSeasonalVariation(speciesId, season);
    // Color shift = variation color - nominal summer color
    const summerVariation = this.db.getSeasonalVariation(speciesId, Season.SUMMER);
    return [
      variation.leafColor[0] - summerVariation.leafColor[0],
      variation.leafColor[1] - summerVariation.leafColor[1],
      variation.leafColor[2] - summerVariation.leafColor[2],
    ];
  }

  // --------------------------------------------------------------------------
  // Category Availability
  // --------------------------------------------------------------------------

  /**
   * Get which object categories are active for a given season and climate.
   * Inactive categories should not be scattered at all.
   */
  getActiveCategories(
    season: Season,
    climate: ClimateZone = ClimateZone.TEMPERATE,
  ): SpeciesEntry['category'][] {
    const categories: SpeciesEntry['category'][] = [];

    // Always check if any species in the category is available
    const allCategories: SpeciesEntry['category'][] = ['tree', 'shrub', 'flower', 'grass', 'mushroom', 'fruit'];

    for (const cat of allCategories) {
      const results = this.db.queryByCategory(cat, season, climate);
      if (results.some(({ weight }) => weight > 0.1)) {
        categories.push(cat);
      }
    }

    return categories;
  }

  // --------------------------------------------------------------------------
  // Season Interpolation
  // --------------------------------------------------------------------------

  /**
   * Interpolate between two seasons for smooth transitions.
   * Given the current season and its progress (0–1), computes a blended
   * state that merges the end of the current season with the start of
   * the next season.
   *
   * This is used for gradual visual transitions rather than abrupt
   * season changes.
   *
   * @param seasonProgress The progress within the current season (0–1)
   * @param config The current season configuration
   * @returns Interpolated season state with blended availability, density, and color
   */
  interpolateSeason(
    seasonProgress: number,
    config: SeasonConfig,
  ): InterpolatedSeasonState {
    const transition = getTransition(config.currentSeason, seasonProgress);

    const fromSeason = config.currentSeason;
    const toSeason: Season = transition ? transition.toSeason : config.currentSeason;
    const blend: number = transition ? transition.blend : 0;

    const climate = config.climateZone;
    const altitude = 0; // Use 0 as default — can be refined later
    const moisture = config.precipitationLevel;

    // Query both seasons
    const fromResults = this.db.queryBySeason(fromSeason, climate, altitude, moisture);
    const toResults = this.db.queryBySeason(toSeason, climate, altitude, moisture);

    // Build maps of species → weight for each season
    const fromWeights = new Map<string, number>();
    const toWeights = new Map<string, number>();
    const fromDensity = new Map<string, number>();
    const toDensity = new Map<string, number>();
    const fromColor = new Map<string, [number, number, number]>();
    const toColor = new Map<string, [number, number, number]>();

    for (const { entry, weight } of fromResults) {
      fromWeights.set(entry.speciesId, weight);
      fromDensity.set(entry.speciesId, this.computeDensityMultiplier(entry.speciesId, fromSeason, climate));
      const v = this.db.getSeasonalVariation(entry.speciesId, fromSeason);
      fromColor.set(entry.speciesId, v.leafColor);
    }

    for (const { entry, weight } of toResults) {
      toWeights.set(entry.speciesId, weight);
      toDensity.set(entry.speciesId, this.computeDensityMultiplier(entry.speciesId, toSeason, climate));
      const v = this.db.getSeasonalVariation(entry.speciesId, toSeason);
      toColor.set(entry.speciesId, v.leafColor);
    }

    // Union of all species IDs
    const allIds = new Set([...fromWeights.keys(), ...toWeights.keys()]);

    const blendedAvailability = new Map<string, number>();
    const blendedDensity = new Map<string, number>();
    const blendedColorShift = new Map<string, [number, number, number]>();

    for (const id of allIds) {
      // Blend weights
      const fw = fromWeights.get(id) ?? 0;
      const tw = toWeights.get(id) ?? 0;
      blendedAvailability.set(id, fw * (1 - blend) + tw * blend);

      // Blend density
      const fd = fromDensity.get(id) ?? 0;
      const td = toDensity.get(id) ?? 0;
      blendedDensity.set(id, fd * (1 - blend) + td * blend);

      // Blend color
      const fc = fromColor.get(id) ?? [0.2, 0.3, 0.1];
      const tc = toColor.get(id) ?? [0.2, 0.3, 0.1];
      blendedColorShift.set(id, [
        fc[0] * (1 - blend) + tc[0] * blend,
        fc[1] * (1 - blend) + tc[1] * blend,
        fc[2] * (1 - blend) + tc[2] * blend,
      ]);
    }

    return {
      fromSeason,
      toSeason,
      blend,
      blendedAvailability,
      blendedDensity,
      blendedColorShift,
    };
  }

  // --------------------------------------------------------------------------
  // Utility
  // --------------------------------------------------------------------------

  /**
   * Get the full seasonal variation for a species.
   */
  getVariation(speciesId: string, season: Season): SeasonalVariationParams {
    return this.db.getSeasonalVariation(speciesId, season);
  }

  /**
   * Get a default SeasonConfig for a given season and climate.
   */
  static defaultConfig(
    season: Season = Season.SUMMER,
    climate: ClimateZone = ClimateZone.TEMPERATE,
  ): SeasonConfig {
    const temperatureBySeason: Record<Season, Record<ClimateZone, number>> = {
      [Season.SPRING]: { [ClimateZone.TROPICAL]: 28, [ClimateZone.TEMPERATE]: 12, [ClimateZone.BOREAL]: 2, [ClimateZone.ARID]: 22, [ClimateZone.ALPINE]: -2 },
      [Season.SUMMER]: { [ClimateZone.TROPICAL]: 32, [ClimateZone.TEMPERATE]: 22, [ClimateZone.BOREAL]: 16, [ClimateZone.ARID]: 38, [ClimateZone.ALPINE]: 8 },
      [Season.AUTUMN]: { [ClimateZone.TROPICAL]: 27, [ClimateZone.TEMPERATE]: 10, [ClimateZone.BOREAL]: 0, [ClimateZone.ARID]: 18, [ClimateZone.ALPINE]: -4 },
      [Season.WINTER]: { [ClimateZone.TROPICAL]: 24, [ClimateZone.TEMPERATE]: 0, [ClimateZone.BOREAL]: -18, [ClimateZone.ARID]: 8, [ClimateZone.ALPINE]: -15 },
    };

    const daylightBySeason: Record<Season, number> = {
      [Season.SPRING]: 12,
      [Season.SUMMER]: 16,
      [Season.AUTUMN]: 10,
      [Season.WINTER]: 8,
    };

    const precipBySeason: Record<Season, Record<ClimateZone, number>> = {
      [Season.SPRING]: { [ClimateZone.TROPICAL]: 0.6, [ClimateZone.TEMPERATE]: 0.5, [ClimateZone.BOREAL]: 0.4, [ClimateZone.ARID]: 0.2, [ClimateZone.ALPINE]: 0.5 },
      [Season.SUMMER]: { [ClimateZone.TROPICAL]: 0.7, [ClimateZone.TEMPERATE]: 0.4, [ClimateZone.BOREAL]: 0.4, [ClimateZone.ARID]: 0.1, [ClimateZone.ALPINE]: 0.3 },
      [Season.AUTUMN]: { [ClimateZone.TROPICAL]: 0.7, [ClimateZone.TEMPERATE]: 0.5, [ClimateZone.BOREAL]: 0.5, [ClimateZone.ARID]: 0.15, [ClimateZone.ALPINE]: 0.5 },
      [Season.WINTER]: { [ClimateZone.TROPICAL]: 0.4, [ClimateZone.TEMPERATE]: 0.5, [ClimateZone.BOREAL]: 0.4, [ClimateZone.ARID]: 0.2, [ClimateZone.ALPINE]: 0.6 },
    };

    return {
      currentSeason: season,
      seasonProgress: 0.5,
      climateZone: climate,
      temperatureBase: temperatureBySeason[season][climate],
      daylightHours: daylightBySeason[season],
      precipitationLevel: precipBySeason[season][climate],
    };
  }

  /**
   * Derive the likely season from environmental parameters.
   * Useful when the season is not explicitly set but can be inferred
   * from temperature and daylight.
   */
  static inferSeason(
    temperature: number,
    daylightHours: number,
    climate: ClimateZone = ClimateZone.TEMPERATE,
  ): Season {
    // Normalize temperature relative to climate
    if (climate === ClimateZone.TROPICAL) {
      // Tropical: less seasonal variation, use precipitation proxy (daylight)
      return daylightHours > 12 ? Season.SPRING : Season.AUTUMN;
    }

    // Temperate/Boreal/Arid/Alpine: use temperature + daylight
    if (temperature < -5) return Season.WINTER;
    if (temperature < 8) return daylightHours > 11 ? Season.SPRING : Season.AUTUMN;
    if (temperature < 20) return Season.SPRING;
    return Season.SUMMER;
  }

  /**
   * Dispose of any resources.
   */
  dispose(): void {
    // No-op for now; kept for API consistency
  }
}
