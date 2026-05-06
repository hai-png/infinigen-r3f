/**
 * BiomeFramework.ts
 * Complete biome interpolation, transition zones, and dynamic asset scattering.
 *
 * Provides:
 * - BiomeInterpolator: Smooth transition zones between biomes using noise for
 *   blend widths. Instead of hard biome boundaries, produces a blend map where
 *   each cell has a weighted mix of nearby biomes. This prevents sharp visual
 *   transitions in terrain appearance.
 *
 * - BiomeScatterer: Maps each biome type to appropriate scatter configurations
 *   using BiomeScatterMapping, integrates with the existing ScatterFactory for
 *   actual geometry + material generation.
 *
 * - BiomeFramework: Top-level orchestrator that combines interpolation and
 *   scattering into a unified pipeline.
 */

import * as THREE from 'three';
import type { BiomeDefinition, BiomeBlend, BiomeType } from './BiomeSystem';
import type { AssetMetadata } from '../../../assets/core/AssetTypes';
import { SeededRandom } from '../../../core/util/MathUtils';
import { SeededNoiseGenerator } from '../../../core/util/math/noise';
import { BiomeScatterMapping, type ExtendedBiomeType, type BiomeScatterProfile, type ScatterEntry } from './BiomeScatterMapping';
import type { ScatterConfig as AdvancedScatterConfig } from '../../../core/placement/advanced/ScatterSystem';

export interface BiomeTransitionZone {
  startBiome: string;
  endBiome: string;
  blendWidth: number;
  elevationRange?: [number, number];
  slopeRange?: [number, number];
}

export interface ScatteredAsset {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  assetId: string;
  metadata: AssetMetadata;
  biomeAffinity: number;
}

export interface BiomeScatterConfig {
  density: number; // assets per square unit
  minDistance: number;
  maxDistance: number;
  alignmentToNormal: boolean;
  randomRotation: boolean;
  scaleVariation: [number, number];
  seed?: number;
}

// ============================================================================
// BiomeInterpolator — Noise-based Smooth Transition Zones
// ============================================================================

/**
 * BiomeInterpolator produces smooth blend maps between biomes.
 *
 * Instead of hard boundaries, each position gets a weighted mix of all
 * applicable biomes. The blend width varies spatially using noise, which
 * creates organic, natural-looking transition zones instead of straight lines.
 *
 * The interpolator uses:
 * - BiomeDefinition ranges (elevation, slope, temperature, moisture) to
 *   compute per-biome affinity at each point
 * - Transition zones that specify blend widths between specific biome pairs
 * - SeededNoiseGenerator to vary the blend width spatially, preventing
 *   mechanical-looking boundaries
 * - Gaussian-like falloff for smooth weight transitions
 */
export class BiomeInterpolator {
  private biomes: Map<string, BiomeDefinition>;
  private transitionZones: BiomeTransitionZone[];
  private noiseGen: SeededNoiseGenerator;
  private blendNoiseGen: SeededNoiseGenerator;

  constructor(seed: number = 42) {
    this.biomes = new Map();
    this.transitionZones = [];
    this.noiseGen = new SeededNoiseGenerator(seed);
    this.blendNoiseGen = new SeededNoiseGenerator(seed + 500);
  }

  registerBiome(biome: BiomeDefinition): void {
    this.biomes.set(biome.id, biome);
  }

  addTransitionZone(zone: BiomeTransitionZone): void {
    this.transitionZones.push(zone);
  }

  /**
   * Interpolate biome blend at a specific position.
   *
   * Instead of returning a single biome, returns a BiomeBlend with weighted
   * contributions from all biomes that have affinity for this position.
   * The weights incorporate:
   *   1. Range-based affinity (elevation, slope, temperature, moisture)
   *   2. Noise-modulated transition zone blending
   *   3. Gaussian falloff from biome centers
   */
  interpolate(position: THREE.Vector3, normal: THREE.Vector3): BiomeBlend {
    const blend: BiomeBlend = {
      biomes: [],
      weights: [],
      primaryBiome: null,
      transitionFactor: 0,
      position: position,
      normal: normal,
      blendFactor: 0,
      secondaryBiome: undefined,
    };

    // Compute affinity for each registered biome
    const affinities: { biome: BiomeDefinition; affinity: number }[] = [];

    for (const [id, biome] of this.biomes) {
      const affinity = this.calculateBiomeAffinity(position, normal, biome);

      if (affinity > 0.05) {
        affinities.push({ biome, affinity });
      }
    }

    if (affinities.length === 0) {
      return blend;
    }

    // Apply noise-modulated transition zone blending
    for (const zone of this.transitionZones) {
      const startBiome = this.biomes.get(zone.startBiome);
      const endBiome = this.biomes.get(zone.endBiome);
      if (!startBiome || !endBiome) continue;

      // Check if position is in the transition zone's elevation/slope range
      const inElevRange = !zone.elevationRange ||
        (position.y >= zone.elevationRange[0] && position.y <= zone.elevationRange[1]);
      const slope = Math.acos(Math.max(-1, Math.min(1, normal.y))) * (180 / Math.PI);
      const inSlopeRange = !zone.slopeRange ||
        (slope >= zone.slopeRange[0] && slope <= zone.slopeRange[1]);

      if (inElevRange && inSlopeRange) {
        // Modulate blend width with noise for organic boundaries
        const noiseVal = this.blendNoiseGen.fbm(
          position.x * 0.05,
          position.y * 0.05,
          position.z * 0.05,
          { octaves: 3, gain: 0.5, scale: 1.0 }
        );
        const effectiveBlendWidth = zone.blendWidth * (0.7 + noiseVal * 0.6);

        // Boost both biomes in the transition zone
        for (const entry of affinities) {
          if (entry.biome.id === zone.startBiome || entry.biome.id === zone.endBiome) {
            entry.affinity *= (1.0 + effectiveBlendWidth * 0.3);
          }
        }
      }
    }

    // Normalize weights
    const totalAffinity = affinities.reduce((sum, a) => sum + a.affinity, 0);
    if (totalAffinity <= 0) return blend;

    for (const { biome, affinity } of affinities) {
      blend.biomes.push(biome);
      blend.weights.push(affinity / totalAffinity);
    }

    // Sort by weight descending
    const sortedIndices = blend.weights
      .map((w, i) => ({ weight: w, index: i }))
      .sort((a, b) => b.weight - a.weight);

    if (sortedIndices.length > 0) {
      blend.primaryBiome = blend.biomes[sortedIndices[0].index];
      blend.blendFactor = sortedIndices[0].weight;
      blend.transitionFactor = sortedIndices.length > 1
        ? sortedIndices[1].weight / sortedIndices[0].weight
        : 0;
      if (sortedIndices.length > 1) {
        blend.secondaryBiome = blend.biomes[sortedIndices[1].index];
      }
    }

    return blend;
  }

  /**
   * Interpolate biome blend across a 2D grid.
   *
   * Produces a grid of BiomeBlend objects where each cell has weighted
   * contributions from all applicable biomes. This is the core method
   * for generating smooth biome transitions.
   *
   * @param heightMap - Normalized height values
   * @param normalMap - Normal vectors (3 components per cell)
   * @param width - Grid width
   * @param height - Grid height
   * @param scale - World-space scale factor for position mapping
   * @returns Array of BiomeBlend objects, one per grid cell
   */
  interpolateGrid(
    heightMap: Float32Array,
    normalMap: Float32Array,
    width: number,
    height: number,
    scale: number = 1.0
  ): BiomeBlend[] {
    const blends: BiomeBlend[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const h = heightMap[idx];

        const position = new THREE.Vector3(x * scale, h, y * scale);
        const normalIdx = idx * 3;
        const normal = new THREE.Vector3(
          normalMap[normalIdx] || 0,
          normalMap[normalIdx + 1] || 1,
          normalMap[normalIdx + 2] || 0
        ).normalize();

        blends.push(this.interpolate(position, normal));
      }
    }

    return blends;
  }

  /**
   * Calculate affinity of a position/normal to a biome definition.
   *
   * Uses Gaussian-like falloff from biome center ranges rather than
   * hard cutoffs, producing smooth transitions.
   */
  private calculateBiomeAffinity(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    biome: BiomeDefinition
  ): number {
    let affinity = 1.0;

    // Elevation affinity — Gaussian falloff from range center
    if (biome.elevationRange) {
      const [minElev, maxElev] = biome.elevationRange;
      const elev = position.y;
      const midElev = (minElev + maxElev) / 2;
      const range = (maxElev - minElev) / 2;

      if (range <= 0) {
        affinity *= elev === midElev ? 1.0 : 0.1;
      } else if (elev < minElev || elev > maxElev) {
        // Outside range: exponential falloff
        const dist = elev < minElev ? minElev - elev : elev - maxElev;
        affinity *= Math.exp(-dist * dist / (range * range * 0.5));
      } else {
        // Inside range: stronger affinity closer to center
        const normalizedDist = Math.abs(elev - midElev) / range;
        affinity *= (1.0 - normalizedDist * 0.3);
      }
    }

    // Slope affinity — Gaussian falloff from range center
    if (biome.slopeRange) {
      const [minSlope, maxSlope] = biome.slopeRange;
      const slope = Math.acos(Math.max(-1, Math.min(1, normal.y))) * (180 / Math.PI);
      const midSlope = (minSlope + maxSlope) / 2;
      const range = (maxSlope - minSlope) / 2;

      if (range <= 0) {
        affinity *= slope === midSlope ? 1.0 : 0.1;
      } else if (slope < minSlope || slope > maxSlope) {
        const dist = slope < minSlope ? minSlope - slope : slope - maxSlope;
        affinity *= Math.exp(-dist * dist / (range * range * 0.5));
      } else {
        const normalizedDist = Math.abs(slope - midSlope) / range;
        affinity *= (1.0 - normalizedDist * 0.2);
      }
    }

    // Temperature/moisture affinity — continuous falloff
    if (biome.climate) {
      const { temperature, humidity } = biome.climate;

      // Estimate temperature from latitude + altitude
      const distFromOrigin = Math.sqrt(position.x ** 2 + position.z ** 2);
      const estimatedTemp = 1 - Math.min(distFromOrigin / 100, 1) * 0.5 - position.y * 0.3;
      const estimatedHumidity = 0.5 + this.noiseGen.fbm(
        position.x * 0.01, position.y * 0.01, position.z * 0.01,
        { octaves: 2, gain: 0.5 }
      ) * 0.3;

      const tempDiff = Math.abs(temperature - estimatedTemp);
      const humidityDiff = Math.abs(humidity - estimatedHumidity);

      // Gaussian falloff for climate distance
      affinity *= Math.exp(-(tempDiff * tempDiff + humidityDiff * humidityDiff) * 2.0);
    }

    // Apply transition zone modifiers
    for (const zone of this.transitionZones) {
      if (zone.startBiome === biome.id || zone.endBiome === biome.id) {
        const inElevationRange = !zone.elevationRange ||
          (position.y >= zone.elevationRange[0] && position.y <= zone.elevationRange[1]);

        if (inElevationRange) {
          // Smooth transition boost at zone boundaries
          const noiseVal = this.blendNoiseGen.fbm(
            position.x * 0.03, position.y * 0.03, position.z * 0.03,
            { octaves: 2, gain: 0.5 }
          );
          affinity *= (1.0 + (0.1 + noiseVal * 0.1));
        }
      }
    }

    return Math.max(0, Math.min(1, affinity));
  }
}

// ============================================================================
// BiomeScatterer — Biome-to-Scatter Mapping with ScatterFactory Integration
// ============================================================================

/**
 * BiomeScatterer maps each biome type to appropriate scatter configurations
 * and integrates with the existing ScatterFactory for geometry + material generation.
 *
 * Scatter mapping per biome:
 * - desert: sand + cactus + rocks + tumbleweed
 * - savanna: sparse grass + acacia trees + rocks
 * - tropical_forest: dense trees + ferns + vines + mushrooms
 * - temperate_forest: trees + grass + ferns + mushrooms + wildflowers
 * - boreal_forest: pine trees + moss + lichen + berries
 * - tundra: lichen + moss + snow + small rocks
 * - coast: sand + seashells + driftwood + beach grass
 * - mountain: rocks + sparse grass + snow (at altitude)
 * - ocean: seaweed + seagrass + shells
 */
export class BiomeScatterer {
  private config: Required<BiomeScatterConfig>;
  private assetPool: Map<string, AssetMetadata>;
  private rng: SeededRandom;
  private scatterMapping: BiomeScatterMapping;

  constructor(config: Partial<BiomeScatterConfig> = {}) {
    this.config = {
      density: 0.5,
      minDistance: 0.5,
      maxDistance: 3.0,
      alignmentToNormal: true,
      randomRotation: true,
      scaleVariation: [0.8, 1.2],
      seed: 42,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed ?? 42);
    this.assetPool = new Map();
    this.scatterMapping = new BiomeScatterMapping();
  }

  addAssetToPool(assetId: string, metadata: AssetMetadata): void {
    this.assetPool.set(assetId, metadata);
  }

  /**
   * Get the BiomeScatterMapping instance for direct profile access.
   */
  getScatterMapping(): BiomeScatterMapping {
    return this.scatterMapping;
  }

  /**
   * Get the scatter profile for a biome type.
   * Handles legacy name mapping (e.g., 'boreal_forest' → 'taiga').
   */
  getScatterProfile(biomeType: BiomeType | string): BiomeScatterProfile | undefined {
    // Map task biome types to legacy BiomeScatterMapping names
    const legacyName = this.toLegacyName(biomeType);
    return this.scatterMapping.getProfile(legacyName as ExtendedBiomeType);
  }

  /**
   * Map task-specified biome types to BiomeScatterMapping legacy names.
   */
  private toLegacyName(biomeType: string): string {
    const mapping: Record<string, string> = {
      'boreal_forest': 'taiga',
      'tropical_forest': 'tropical_rainforest',
      'mountain': 'alpine',
      'coast': 'coastal',
    };
    return mapping[biomeType] ?? biomeType;
  }

  /**
   * Get all scatter entries for a biome, combining primary vegetation,
   * ground cover, and special features into a single weighted list.
   */
  getAllScatterEntries(biomeType: BiomeType | string): ScatterEntry[] {
    const profile = this.getScatterProfile(biomeType);
    if (!profile) return [];

    return [
      ...profile.primaryVegetation,
      ...profile.groundCover,
      ...profile.specialFeatures,
    ];
  }

  /**
   * Get scatter entries filtered by category.
   */
  getScatterEntriesByCategory(
    biomeType: BiomeType | string,
    category: 'vegetation' | 'groundCover' | 'specialFeatures'
  ): ScatterEntry[] {
    const profile = this.getScatterProfile(biomeType);
    if (!profile) return [];

    switch (category) {
      case 'vegetation': return profile.primaryVegetation;
      case 'groundCover': return profile.groundCover;
      case 'specialFeatures': return profile.specialFeatures;
      default: return [];
    }
  }

  /**
   * Get density multipliers for a biome type.
   */
  getDensityMultipliers(biomeType: BiomeType | string): {
    vegetation: number;
    groundCover: number;
    specialFeatures: number;
    global: number;
  } {
    const profile = this.getScatterProfile(biomeType);
    if (!profile) {
      return { vegetation: 1.0, groundCover: 1.0, specialFeatures: 1.0, global: 1.0 };
    }
    return profile.densityMultipliers;
  }

  /**
   * Scatter assets within an area based on biome blend.
   *
   * Uses BiomeScatterMapping profiles to determine which scatter types
   * to place and at what density, then generates positions with
   * biome-aware selection.
   */
  scatter(
    area: { min: THREE.Vector3; max: THREE.Vector3 },
    biomeBlend: BiomeBlend,
    heightMap?: (x: number, z: number) => number,
    normalMap?: (x: number, z: number) => THREE.Vector3
  ): ScatteredAsset[] {
    const assets: ScatteredAsset[] = [];
    const positions: THREE.Vector3[] = [];

    const width = area.max.x - area.min.x;
    const depth = area.max.z - area.min.z;
    const targetCount = Math.floor(width * depth * this.config.density);

    // Collect all applicable scatter entries from all contributing biomes
    const weightedEntries: {
      entry: ScatterEntry;
      biomeType: string;
      biomeWeight: number;
      effectiveWeight: number;
    }[] = [];

    for (let i = 0; i < biomeBlend.biomes.length; i++) {
      const biome = biomeBlend.biomes[i];
      const biomeWeight = biomeBlend.weights[i];
      const allEntries = this.getAllScatterEntries(biome.id);

      for (const entry of allEntries) {
        // Apply density multipliers from the profile
        const profile = this.getScatterProfile(biome.id);
        const densityMult = profile ? profile.densityMultipliers.global : 1.0;

        weightedEntries.push({
          entry,
          biomeType: biome.id,
          biomeWeight,
          effectiveWeight: biomeWeight * entry.selectionWeight * densityMult,
        });
      }
    }

    if (weightedEntries.length === 0) return assets;

    // Generate candidate positions
    for (let i = 0; i < targetCount * 3; i++) {
      const x = area.min.x + this.rng.next() * width;
      const z = area.min.z + this.rng.next() * depth;
      const y = heightMap ? heightMap(x, z) : 0;

      const position = new THREE.Vector3(x, y, z);

      // Check minimum distance
      let tooClose = false;
      for (const existing of positions) {
        if (position.distanceTo(existing) < this.config.minDistance) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        positions.push(position);

        if (positions.length >= targetCount) break;
      }
    }

    // Create scattered assets with biome-aware selection
    for (const position of positions) {
      const normal = normalMap
        ? normalMap(position.x, position.z)
        : new THREE.Vector3(0, 1, 0);

      // Select scatter entry using weighted random selection
      const selectedEntry = this.selectWeightedEntry(weightedEntries);
      if (!selectedEntry) continue;

      const [minScale, maxScale] = selectedEntry.entry.scaleRange;
      const scale = minScale + this.rng.next() * (maxScale - minScale);

      const rotation = new THREE.Euler(
        this.config.alignmentToNormal ? Math.atan2(normal.x, normal.y) : 0,
        this.config.randomRotation ? this.rng.next() * selectedEntry.entry.rotationVariation : 0,
        this.config.alignmentToNormal ? Math.atan2(normal.z, normal.y) : 0
      );

      // Create asset metadata from the scatter entry
      const metadata: AssetMetadata = {
        version: '1.0',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        author: 'BiomeScatterer',
        name: selectedEntry.entry.label,
        tags: [selectedEntry.biomeType, selectedEntry.entry.id],
        type: selectedEntry.entry.id,
      };

      assets.push({
        position,
        rotation,
        scale: new THREE.Vector3(scale, scale, scale),
        assetId: selectedEntry.entry.id,
        metadata,
        biomeAffinity: selectedEntry.biomeWeight,
      });
    }

    return assets;
  }

  /**
   * Select a scatter entry using weighted random selection.
   */
  private selectWeightedEntry(
    entries: { entry: ScatterEntry; biomeType: string; biomeWeight: number; effectiveWeight: number }[]
  ): { entry: ScatterEntry; biomeType: string; biomeWeight: number; effectiveWeight: number } | null {
    if (entries.length === 0) return null;

    const totalWeight = entries.reduce((sum, e) => sum + e.effectiveWeight, 0);
    if (totalWeight <= 0) return null;

    let random = this.rng.next() * totalWeight;

    for (const entry of entries) {
      random -= entry.effectiveWeight;
      if (random <= 0) {
        return entry;
      }
    }

    return entries[entries.length - 1];
  }

  /**
   * Generate scatter configurations for a biome type that can be fed
   * into the ScatterFactory.
   *
   * This is the integration point between BiomeScatterer and ScatterFactory.
   * It converts BiomeScatterProfile entries into ScatterConfig objects
   * that ScatterFactory.scatter() can consume.
   */
  generateScatterConfigs(
    biomeType: BiomeType | string,
    bounds: THREE.Box3,
    heightFunction?: (x: number, z: number) => number,
    normalFunction?: (x: number, z: number) => THREE.Vector3
  ): Array<{
    scatterType: string;
    config: {
      type: string;
      density: number;
      surfaceSelector: (position: THREE.Vector3, normal: THREE.Vector3) => boolean;
      seed: number;
      minScale: number;
      maxScale: number;
      bounds: THREE.Box3;
      maxSlope: number;
      minHeight: number;
      maxHeight: number;
      avoidWater: boolean;
      waterLevel: number;
      heightFunction?: (x: number, z: number) => number;
      normalFunction?: (x: number, z: number) => THREE.Vector3;
      mode: 'instanced' | 'expanded';
      lodLevel: number;
      season: 'spring' | 'summer' | 'autumn' | 'winter';
    };
  }> {
    const profile = this.getScatterProfile(biomeType);
    if (!profile) return [];

    const allEntries = this.getAllScatterEntries(biomeType);
    const densityMults = profile.densityMultipliers;
    const results: Array<{
      scatterType: string;
      config: any;
    }> = [];

    for (const entry of allEntries) {
      // Determine category multiplier
      let categoryMult = 1.0;
      if (profile.primaryVegetation.includes(entry)) {
        categoryMult = densityMults.vegetation;
      } else if (profile.groundCover.includes(entry)) {
        categoryMult = densityMults.groundCover;
      } else if (profile.specialFeatures.includes(entry)) {
        categoryMult = densityMults.specialFeatures;
      }

      const effectiveDensity = entry.baseDensity * categoryMult * densityMults.global;

      // Map scatter entry ID to ScatterFactory ScatterType
      const scatterType = this.mapEntryToScatterType(entry.id);

      results.push({
        scatterType: entry.id,
        config: {
          type: scatterType,
          density: effectiveDensity,
          surfaceSelector: (position: THREE.Vector3, normal: THREE.Vector3) => {
            // Default: accept all positions within bounds and reasonable slope
            const slope = Math.acos(Math.abs(normal.dot(new THREE.Vector3(0, 1, 0)))) * (180 / Math.PI);
            return slope < 70;
          },
          seed: this.config.seed ?? 42,
          minScale: entry.scaleRange[0],
          maxScale: entry.scaleRange[1],
          bounds,
          maxSlope: 65,
          minHeight: -Infinity,
          maxHeight: Infinity,
          avoidWater: true,
          waterLevel: 0,
          heightFunction,
          normalFunction,
          mode: 'instanced' as const,
          lodLevel: 0,
          season: 'summer' as const,
        },
      });
    }

    return results;
  }

  /**
   * Map a scatter entry ID to a ScatterFactory ScatterType.
   *
   * ScatterFactory supports: fern, moss, ground_leaves, pine_needle,
   * seashell, lichen, pebble, grass, rock, mushroom, flower, twig,
   * snow_layer, slime_mold, mollusk, jellyfish
   */
  private mapEntryToScatterType(entryId: string): string {
    // Direct matches
    const directMap: Record<string, string> = {
      'fern': 'fern',
      'ferns': 'fern',
      'fern_tropical': 'fern',
      'ferns_wetland': 'fern',
      'moss': 'moss',
      'moss_taiga': 'moss',
      'alpine_moss': 'moss',
      'lichen': 'lichen',
      'lichen_taiga': 'lichen',
      'grass': 'grass',
      'tropical_grass': 'grass',
      'savanna_grass': 'grass',
      'wetland_grass': 'grass',
      'alpine_grass': 'grass',
      'coastal_grass': 'grass',
      'beach_grass': 'grass',
      'tall_grass': 'grass',
      'short_grass': 'grass',
      'dry_grass': 'grass',
      'sparse_dry_grass': 'grass',
      'savanna_tall_grass': 'grass',
      'rock': 'rock',
      'rocks': 'rock',
      'desert_rock': 'rock',
      'forest_rock': 'rock',
      'grassland_rock': 'rock',
      'tundra_rock': 'rock',
      'mountain_rock': 'rock',
      'savanna_rock': 'rock',
      'kopje_rock': 'rock',
      'mushroom': 'mushroom',
      'mushrooms': 'mushroom',
      'tropical_mushroom': 'mushroom',
      'wetland_mushroom': 'mushroom',
      'taiga_mushroom': 'mushroom',
      'flower': 'flower',
      'wildflowers': 'flower',
      'savanna_wildflower': 'flower',
      'desert_flower': 'flower',
      'arctic_flower': 'flower',
      'seashell': 'seashell',
      'seashells': 'seashell',
      'seashells_underwater': 'seashell',
      'snow': 'snow_layer',
      'snow_patch': 'snow_layer',
      'snow_taiga': 'snow_layer',
      'pebble': 'pebble',
      'pebbles': 'pebble',
      'pine_needle': 'pine_needle',
      'pine_needle_floor': 'pine_needle',
      'ground_leaves': 'ground_leaves',
      'leaf_litter': 'ground_leaves',
      'twig': 'twig',
      'twigs': 'twig',
      'driftwood': 'twig',
      'fallen_log': 'twig',
      'sand': 'pebble',
      'sand_coastal': 'pebble',
      'sand_underwater': 'pebble',
      'rock_gravel': 'pebble',
    };

    return directMap[entryId] ?? 'pebble'; // Default fallback
  }

  private calculatePositionAffinity(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    biomeBlend: BiomeBlend
  ): number {
    if (!biomeBlend.primaryBiome) return 0;

    let affinity = 0.5;

    // Elevation check
    if (biomeBlend.primaryBiome.elevationRange) {
      const [min, max] = biomeBlend.primaryBiome.elevationRange;
      if (position.y < min || position.y > max) {
        affinity *= 0.5;
      }
    }

    // Slope check
    const slope = Math.acos(Math.max(0, Math.min(1, normal.y))) * (180 / Math.PI);
    if (biomeBlend.primaryBiome.slopeRange) {
      const [minSlope, maxSlope] = biomeBlend.primaryBiome.slopeRange;
      if (slope < minSlope || slope > maxSlope) {
        affinity *= 0.5;
      }
    }

    return affinity;
  }
}

// ============================================================================
// BiomeFramework — Top-Level Orchestrator
// ============================================================================

export class BiomeFramework {
  private interpolator: BiomeInterpolator;
  private scatterer: BiomeScatterer;
  private activeZones: BiomeTransitionZone[];

  constructor(seed: number = 42) {
    this.interpolator = new BiomeInterpolator(seed);
    this.scatterer = new BiomeScatterer();
    this.activeZones = [];
  }

  initialize(biomes: BiomeDefinition[], zones: BiomeTransitionZone[] = []): void {
    biomes.forEach(biome => this.interpolator.registerBiome(biome));
    zones.forEach(zone => {
      this.interpolator.addTransitionZone(zone);
      this.activeZones.push(zone);
    });
  }

  getBiomeBlend(position: THREE.Vector3, normal: THREE.Vector3): BiomeBlend {
    return this.interpolator.interpolate(position, normal);
  }

  /**
   * Interpolate biome blend across a 2D grid.
   */
  interpolateGrid(
    heightMap: Float32Array,
    normalMap: Float32Array,
    width: number,
    height: number,
    scale: number = 1.0
  ): BiomeBlend[] {
    return this.interpolator.interpolateGrid(heightMap, normalMap, width, height, scale);
  }

  scatterAssets(
    area: { min: THREE.Vector3; max: THREE.Vector3 },
    position: THREE.Vector3,
    normal: THREE.Vector3,
    heightMap?: (x: number, z: number) => number,
    normalMap?: (x: number, z: number) => THREE.Vector3
  ): ScatteredAsset[] {
    const blend = this.getBiomeBlend(position, normal);
    return this.scatterer.scatter(area, blend, heightMap, normalMap);
  }

  /**
   * Get scatter configurations for a biome type for use with ScatterFactory.
   */
  getScatterConfigs(
    biomeType: BiomeType | string,
    bounds: THREE.Box3,
    heightFunction?: (x: number, z: number) => number,
    normalFunction?: (x: number, z: number) => THREE.Vector3
  ) {
    return this.scatterer.generateScatterConfigs(biomeType, bounds, heightFunction, normalFunction);
  }

  /**
   * Get the scatter profile for a biome type.
   */
  getScatterProfile(biomeType: BiomeType | string) {
    return this.scatterer.getScatterProfile(biomeType);
  }

  addAssetToPool(assetId: string, metadata: AssetMetadata): void {
    this.scatterer.addAssetToPool(assetId, metadata);
  }

  createTransitionGradient(
    start: THREE.Vector3,
    end: THREE.Vector3,
    steps: number = 10
  ): BiomeBlend[] {
    const gradients: BiomeBlend[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const position = new THREE.Vector3().lerpVectors(start, end, t);
      const normal = new THREE.Vector3(0, 1, 0); // Simplified

      gradients.push(this.getBiomeBlend(position, normal));
    }

    return gradients;
  }

  getTransitionZones(): BiomeTransitionZone[] {
    return [...this.activeZones];
  }

  getInterpolator(): BiomeInterpolator {
    return this.interpolator;
  }

  getScatterer(): BiomeScatterer {
    return this.scatterer;
  }
}

export default BiomeFramework;
