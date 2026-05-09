/**
 * Nature Vegetation Subsystem — Handles vegetation and ground cover scattering.
 *
 * Extracted from NatureSceneComposer (Phase C decomposition).
 * Responsible for:
 *   - scatterVegetation() — tree/bush density masks and biome-aware vegetation
 *   - scatterGroundCover() — leaves, twigs, grass, flowers, mushrooms, pine debris
 *   - addBouldersAndRocks() — boulder/rock scatter placement
 *
 * @module composition/subsystems/NatureVegetationSubsystem
 */

import { Vector3, Quaternion } from 'three';
import { type BiomeType, type BiomeGrid } from '@/terrain/biomes/core/BiomeSystem';
import { type BiomeScatterProfile } from '@/terrain/biomes/core/BiomeScatterMapping';
import type {
  VegetationDensityParams,
  BoulderData,
  GroundCoverData,
  ScatterMaskData,
  Season,
} from '../NatureSceneComposer';

// ============================================================================
// Seeded RNG (shared lightweight deterministic RNG)
// ============================================================================

class VegetationRNG {
  private s: number;
  constructor(seed: number) { this.s = seed; }
  next(): number {
    const x = Math.sin(this.s++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ============================================================================
// NatureVegetationSubsystem
// ============================================================================

/**
 * Result of the vegetation scatter step.
 */
export interface VegetationStepResult {
  vegetationConfig: VegetationDensityParams;
  boulders: BoulderData[];
  groundCover: GroundCoverData[];
  scatterMasks: ScatterMaskData[];
}

/**
 * NatureVegetationSubsystem — handles vegetation scattering and ground cover.
 *
 * Extracted from NatureSceneComposer so the composer can remain a thin orchestrator.
 */
export class NatureVegetationSubsystem {
  private rng: VegetationRNG;

  constructor(seed: number) {
    this.rng = new VegetationRNG(seed);
  }

  /** Re-initialize with a new seed */
  resetSeed(seed: number): void {
    this.rng = new VegetationRNG(seed);
  }

  // -----------------------------------------------------------------------
  // Vegetation scattering
  // -----------------------------------------------------------------------

  /**
   * Scatter vegetation based on biome data and terrain characteristics.
   *
   * Generates altitude, slope, and biome-aware vegetation masks.
   * Adjusts vegetation density by the dominant biome's multipliers.
   */
  scatterVegetation(
    veg: VegetationDensityParams,
    terrain: import('@/terrain/core/TerrainGenerator').TerrainData | null,
    biomeGrid: BiomeGrid | null,
    dominantBiome: BiomeType | null,
    biomeScatterProfiles: Map<string, BiomeScatterProfile>,
  ): { vegetationConfig: VegetationDensityParams; scatterMasks: ScatterMaskData[] } {
    const scatterMasks: ScatterMaskData[] = [];

    // Generate vegetation scatter masks based on biome data
    if (terrain) {
      const res = 128;
      const slopeMask = new Float32Array(res * res);
      const altMask = new Float32Array(res * res);
      const biomeVegMask = new Float32Array(res * res); // Biome-aware vegetation mask
      const h = terrain.heightMap;
      const w = terrain.heightMap.width ?? terrain.width;
      const ht = terrain.heightMap.height ?? terrain.height;

      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const sx = Math.floor(x / res * w);
          const sy = Math.floor(y / res * ht);
          const idx = sy * w + sx;
          const height = h.data?.[idx] ?? 0;
          const slope = terrain.slopeMap.data?.[idx] ?? 0;

          // Trees prefer moderate slopes and mid-altitude
          altMask[y * res + x] = height > 0.3 && height < 0.75 ? 1.0 : height > 0.25 && height < 0.8 ? 0.5 : 0;
          slopeMask[y * res + x] = slope < 0.3 ? 1.0 : slope < 0.5 ? 0.5 : 0.1;

          // Biome-aware vegetation density: different biomes support different tree density
          if (biomeGrid && idx < biomeGrid.biomeIds.length) {
            const biomeType = biomeGrid.biomeIndexToType[biomeGrid.biomeIds[idx]];
            const profile = biomeScatterProfiles.get(biomeType);
            // Use the profile's vegetation density multiplier to drive tree placement
            const vegMult = profile?.densityMultipliers.vegetation ?? 1.0;
            const globalMult = profile?.densityMultipliers.global ?? 1.0;
            biomeVegMask[y * res + x] = Math.min(1.0, vegMult * globalMult);
          } else {
            biomeVegMask[y * res + x] = 0.5; // Default fallback
          }
        }
      }

      scatterMasks.push(
        { name: 'altitude_trees', resolution: res, data: altMask },
        { name: 'slope_trees', resolution: res, data: slopeMask },
        { name: 'biome_vegetation', resolution: res, data: biomeVegMask },
      );
    }

    // Adjust vegetation config based on dominant biome
    if (dominantBiome) {
      const profile = biomeScatterProfiles.get(dominantBiome);
      if (profile) {
        // Scale vegetation density by the biome's vegetation multiplier
        const mult = profile.densityMultipliers.vegetation * profile.densityMultipliers.global;
        veg.treeDensity *= mult;
        veg.bushDensity *= mult;
        veg.grassDensity *= profile.densityMultipliers.groundCover * profile.densityMultipliers.global;
        veg.groundCoverDensity *= profile.densityMultipliers.groundCover * profile.densityMultipliers.global;
      }
    }

    return { vegetationConfig: veg, scatterMasks };
  }

  // -----------------------------------------------------------------------
  // Boulders and rocks
  // -----------------------------------------------------------------------

  /**
   * Scatter boulders and rocks across the scene.
   */
  addBouldersAndRocks(): BoulderData[] {
    const boulders: BoulderData[] = [];
    const count = this.rng.int(5, 20);

    for (let i = 0; i < count; i++) {
      const scale = this.rng.range(0.5, 3.0);
      boulders.push({
        position: new Vector3(
          this.rng.range(-80, 80),
          0,
          this.rng.range(-80, 80),
        ),
        rotation: new Quaternion().setFromEuler({
          x: this.rng.range(0, Math.PI),
          y: this.rng.range(0, Math.PI * 2),
          z: this.rng.range(0, Math.PI),
        } as any),
        scale: new Vector3(
          scale * this.rng.range(0.7, 1.3),
          scale * this.rng.range(0.5, 1.0),
          scale * this.rng.range(0.7, 1.3),
        ),
        type: this.rng.pick(['boulder', 'rock', 'stone', 'pebble']),
      });
    }

    return boulders;
  }

  // -----------------------------------------------------------------------
  // Ground cover
  // -----------------------------------------------------------------------

  /**
   * Scatter ground cover elements (leaves, twigs, grass, flowers, mushrooms, pine debris).
   *
   * When biome data is available, uses per-biome scatter profiles to determine
   * ground cover types and densities. Falls back to season-based logic otherwise.
   */
  scatterGroundCover(
    veg: VegetationDensityParams,
    season: Season,
    biomeGrid: BiomeGrid | null,
    biomeScatterProfiles: Map<string, BiomeScatterProfile>,
    waterConfig: { oceanEnabled: boolean },
  ): GroundCoverData[] {
    const cover: GroundCoverData[] = [];
    const worldHalf = 80;

    // If we have biome data, generate biome-specific ground cover
    if (biomeGrid && biomeScatterProfiles.size > 0) {
      // For each biome present in the scene, generate ground cover from the scatter profile
      for (const [biomeType, profile] of biomeScatterProfiles) {
        // Skip ocean biomes for ground cover
        if (biomeType === 'ocean') continue;

        const groundEntries = profile.groundCover;
        for (const entry of groundEntries) {
          const count = Math.floor(entry.baseDensity * profile.densityMultipliers.groundCover * profile.densityMultipliers.global * 200);
          if (count <= 0) continue;

          const positions: Vector3[] = [];
          for (let i = 0; i < count; i++) {
            positions.push(new Vector3(this.rng.range(-worldHalf, worldHalf), 0, this.rng.range(-worldHalf, worldHalf)));
          }
          if (positions.length > 0) {
            cover.push({
              type: entry.id,
              positions,
              density: entry.baseDensity * profile.densityMultipliers.groundCover,
              biomeType: biomeType as BiomeType,
            });
          }
        }

        // Add special features from the biome profile
        const specialEntries = profile.specialFeatures;
        for (const entry of specialEntries) {
          const count = Math.floor(entry.baseDensity * profile.densityMultipliers.specialFeatures * profile.densityMultipliers.global * 50);
          if (count <= 0) continue;

          const positions: Vector3[] = [];
          for (let i = 0; i < count; i++) {
            positions.push(new Vector3(this.rng.range(-worldHalf, worldHalf), 0, this.rng.range(-worldHalf, worldHalf)));
          }
          if (positions.length > 0) {
            cover.push({
              type: entry.id,
              positions,
              density: entry.baseDensity * profile.densityMultipliers.specialFeatures,
              biomeType: biomeType as BiomeType,
            });
          }
        }
      }
    } else {
      // Fallback: original ground cover logic without biome awareness
      // Leaves
      if (season === 'autumn' || season === 'summer') {
        const positions: Vector3[] = [];
        const count = Math.floor(veg.groundCoverDensity * 200);
        for (let i = 0; i < count; i++) {
          positions.push(new Vector3(this.rng.range(-worldHalf, worldHalf), 0, this.rng.range(-worldHalf, worldHalf)));
        }
        cover.push({ type: 'leaves', positions, density: veg.groundCoverDensity });
      }

      // Twigs
      {
        const positions: Vector3[] = [];
        const count = Math.floor(veg.groundCoverDensity * 80);
        for (let i = 0; i < count; i++) {
          positions.push(new Vector3(this.rng.range(-worldHalf, worldHalf), 0, this.rng.range(-worldHalf, worldHalf)));
        }
        cover.push({ type: 'twigs', positions, density: veg.groundCoverDensity * 0.5 });
      }

      // Grass
      if (season !== 'winter') {
        const positions: Vector3[] = [];
        const count = Math.floor(veg.grassDensity * 500);
        for (let i = 0; i < count; i++) {
          positions.push(new Vector3(this.rng.range(-worldHalf, worldHalf), 0, this.rng.range(-worldHalf, worldHalf)));
        }
        cover.push({ type: 'grass', positions, density: veg.grassDensity });
      }

      // Flowers
      if (season === 'spring' || season === 'summer') {
        const positions: Vector3[] = [];
        const count = Math.floor(veg.flowerDensity * 150);
        for (let i = 0; i < count; i++) {
          positions.push(new Vector3(this.rng.range(-worldHalf, worldHalf), 0, this.rng.range(-worldHalf, worldHalf)));
        }
        cover.push({ type: 'flowers', positions, density: veg.flowerDensity });
      }

      // Mushrooms
      if (season !== 'winter' && season !== 'summer') {
        const positions: Vector3[] = [];
        const count = Math.floor(veg.mushroomDensity * 60);
        for (let i = 0; i < count; i++) {
          positions.push(new Vector3(this.rng.range(-worldHalf, worldHalf), 0, this.rng.range(-worldHalf, worldHalf)));
        }
        cover.push({ type: 'mushrooms', positions, density: veg.mushroomDensity });
      }

      // Pine debris
      {
        const positions: Vector3[] = [];
        const count = Math.floor(veg.groundCoverDensity * 100);
        for (let i = 0; i < count; i++) {
          positions.push(new Vector3(this.rng.range(-worldHalf, worldHalf), 0, this.rng.range(-worldHalf, worldHalf)));
        }
        cover.push({ type: 'pine_debris', positions, density: veg.groundCoverDensity * 0.4 });
      }
    }

    return cover;
  }
}
