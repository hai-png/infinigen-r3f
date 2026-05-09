/**
 * Nature Terrain Subsystem — Handles terrain generation and biome classification.
 *
 * Extracted from NatureSceneComposer (Phase C decomposition).
 * Responsible for:
 *   - generateTerrain() — producing TerrainData from TerrainGenerator
 *   - classifyBiomes() — Whittaker diagram classification with scatter masks
 *
 * @module composition/subsystems/NatureTerrainSubsystem
 */

import { TerrainGenerator, type TerrainGeneratorConfig, type TerrainData } from '@/terrain/core/TerrainGenerator';
import { BiomeSystem, type BiomeType, type BiomeGrid } from '@/terrain/biomes/core/BiomeSystem';
import { BiomeFramework, BiomeScatterer, type ScatteredAsset } from '@/terrain/biomes/core/BiomeFramework';
import { BiomeScatterMapping, type BiomeScatterProfile, type BiomeScatterConfig, getScatterConfigForBiome, BIOME_SCATTER_CONFIGS } from '@/terrain/biomes/core/BiomeScatterMapping';
import type { TerrainParams, ScatterMaskData } from '../NatureSceneComposer';

// ============================================================================
// TerrainSubsystem
// ============================================================================

/**
 * Result of terrain generation step.
 */
export interface TerrainStepResult {
  terrain: TerrainData | null;
  terrainParams: TerrainParams;
  biomeGrid: BiomeGrid | null;
  dominantBiome: BiomeType | null;
  biomeScatterProfiles: Map<string, BiomeScatterProfile>;
  biomeScatterConfigs: Map<string, BiomeScatterConfig[]>;
  scatterMasks: ScatterMaskData[];
}

/**
 * NatureTerrainSubsystem — handles terrain generation and biome classification.
 *
 * Extracted from NatureSceneComposer so the composer can remain a thin orchestrator.
 */
export class NatureTerrainSubsystem {
  private biomeSystem: BiomeSystem;
  private biomeFramework: BiomeFramework;
  private scatterMapping: BiomeScatterMapping;
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.biomeSystem = new BiomeSystem(0.3, seed);
    this.biomeFramework = new BiomeFramework(seed);
    this.scatterMapping = new BiomeScatterMapping();
  }

  /** Re-initialize with a new seed (called when compose() gets a new seed) */
  resetSeed(seed: number): void {
    this.seed = seed;
    this.biomeSystem = new BiomeSystem(0.3, seed);
    this.biomeFramework = new BiomeFramework(seed);
  }

  // -----------------------------------------------------------------------
  // Terrain generation
  // -----------------------------------------------------------------------

  /**
   * Generate terrain data from the TerrainGenerator.
   * Falls back gracefully on failure (SSR, missing canvas, etc.).
   */
  generateTerrain(terrainParams: TerrainParams): TerrainData | null {
    const generator = new TerrainGenerator({
      seed: terrainParams.seed,
      width: terrainParams.width,
      height: terrainParams.height,
      scale: terrainParams.scale,
      octaves: terrainParams.octaves,
      persistence: terrainParams.persistence,
      lacunarity: terrainParams.lacunarity,
      erosionStrength: terrainParams.erosionStrength,
      erosionIterations: terrainParams.erosionIterations,
      tectonicPlates: terrainParams.tectonicPlates,
      seaLevel: terrainParams.seaLevel,
    });

    try {
      const data = generator.generate();
      return data;
    } catch (err) {
      // Silently fall back - terrain generation may fail during SSR or other failure
      if (process.env.NODE_ENV === 'development') console.debug('[NatureTerrainSubsystem] terrain generation fallback:', err);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Biome classification
  // -----------------------------------------------------------------------

  /**
   * Classify terrain into biomes using temperature/moisture maps (Whittaker diagram).
   *
   * Produces a BiomeGrid with:
   * - Temperature map (latitude, altitude, distance-to-water, noise)
   * - Moisture map (distance-to-water, altitude, wind noise, noise)
   * - Per-cell biome classification
   * - Per-cell blend weights for smooth transitions
   * - Scatter profiles for each biome type
   *
   * Also generates scatter masks for biome dominance, temperature, moisture,
   * blend transitions, and per-scatter-type density masks.
   */
  classifyBiomes(
    terrain: TerrainData | null,
    terrainParams: TerrainParams,
  ): Pick<TerrainStepResult, 'biomeGrid' | 'dominantBiome' | 'biomeScatterProfiles' | 'biomeScatterConfigs' | 'scatterMasks'> {
    const result: Pick<TerrainStepResult, 'biomeGrid' | 'dominantBiome' | 'biomeScatterProfiles' | 'biomeScatterConfigs' | 'scatterMasks'> = {
      biomeGrid: null,
      dominantBiome: null,
      biomeScatterProfiles: new Map(),
      biomeScatterConfigs: new Map(),
      scatterMasks: [],
    };

    if (!terrain) return result;

    const w = terrain.width;
    const h = terrain.height;
    const heightData = terrain.heightMap.data;
    const slopeData = terrain.slopeMap.data;

    if (!heightData || !slopeData) return result;

    // Always generate full BiomeGrid from BiomeSystem.
    const biomeGrid = this.biomeSystem.generateBiomeGrid(
      heightData,
      slopeData,
      w,
      h,
      { seed: this.seed, seaLevel: terrainParams.seaLevel }
    );

    result.biomeGrid = biomeGrid;

    // Use dominant biome from TerrainGenerator if available
    if (terrain.dominantBiome) {
      result.dominantBiome = terrain.dominantBiome;
    } else {
      // Determine dominant biome
      const biomeCounts = new Map<string, number>();
      for (let i = 0; i < biomeGrid.biomeIds.length; i++) {
        const biomeType = biomeGrid.biomeIndexToType[biomeGrid.biomeIds[i]];
        if (biomeType) {
          biomeCounts.set(biomeType, (biomeCounts.get(biomeType) ?? 0) + 1);
        }
      }
      let maxCount = 0;
      let dominantBiome: BiomeType | null = null;
      for (const [type, count] of biomeCounts) {
        // Don't count ocean as dominant for land-based decisions
        if (type !== 'ocean' && count > maxCount) {
          maxCount = count;
          dominantBiome = type as BiomeType;
        }
      }
      result.dominantBiome = dominantBiome;
    }

    // Collect scatter profiles for all present biomes using BiomeScatterer
    const biomeCounts = new Map<string, number>();
    for (let i = 0; i < biomeGrid.biomeIds.length; i++) {
      const biomeType = biomeGrid.biomeIndexToType[biomeGrid.biomeIds[i]];
      if (biomeType) {
        biomeCounts.set(biomeType, (biomeCounts.get(biomeType) ?? 0) + 1);
      }
    }
    for (const biomeType of biomeCounts.keys()) {
      // Use BiomeScatterer to get profiles (handles legacy name mapping)
      const profile = this.biomeFramework.getScatterProfile(biomeType);
      if (profile) {
        result.biomeScatterProfiles.set(biomeType, profile);
      } else {
        // Fallback: direct lookup from BiomeScatterMapping
        const directProfile = this.scatterMapping.getProfile(biomeType as any);
        if (directProfile) {
          result.biomeScatterProfiles.set(biomeType, directProfile);
        }
      }
    }

    // Populate simplified biome scatter configs from BIOME_SCATTER_CONFIGS
    for (const biomeType of biomeCounts.keys()) {
      const configs = getScatterConfigForBiome(biomeType);
      if (configs.length > 0) {
        result.biomeScatterConfigs.set(biomeType, configs);
      }
    }

    // Generate biome-specific scatter masks using BiomeInterpolator for smooth transitions
    // Also generate per-biome scatter-type density masks driven by BIOME_SCATTER_CONFIGS
    const res = 128;
    const biomeMask = new Float32Array(res * res);
    const tempMask = new Float32Array(res * res);
    const moistureMask = new Float32Array(res * res);
    const blendMask = new Float32Array(res * res); // Smooth blend transition mask

    // Collect unique scatter types across all present biomes for per-type density masks
    const scatterTypeBiomes = new Map<string, Map<string, number>>(); // scatterType → (biome → density)
    for (const [biomeType, configs] of result.biomeScatterConfigs) {
      for (const cfg of configs) {
        if (!scatterTypeBiomes.has(cfg.scatterType)) {
          scatterTypeBiomes.set(cfg.scatterType, new Map());
        }
        scatterTypeBiomes.get(cfg.scatterType)!.set(biomeType, cfg.density);
      }
    }

    // Pre-allocate per-scatter-type density masks
    const scatterMasks = new Map<string, Float32Array>();
    for (const scatterType of scatterTypeBiomes.keys()) {
      scatterMasks.set(scatterType, new Float32Array(res * res));
    }

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const srcX = Math.floor(x / res * w);
        const srcY = Math.floor(y / res * h);
        const gridIdx = srcY * w + srcX;

        if (gridIdx < biomeGrid.biomeIds.length) {
          const biomeType = biomeGrid.biomeIndexToType[biomeGrid.biomeIds[gridIdx]];
          biomeMask[y * res + x] = biomeType === (result.dominantBiome ?? 'desert') ? 1.0 : 0.5;
          tempMask[y * res + x] = biomeGrid.temperature[gridIdx] ?? 0;
          moistureMask[y * res + x] = biomeGrid.moisture[gridIdx] ?? 0;

          // Use blend weights from BiomeInterpolator for smooth transition mask
          const weights = biomeGrid.blendWeights[gridIdx];
          if (weights && weights.length > 1) {
            // Transition factor: 1 - weight of primary biome = how much blending
            blendMask[y * res + x] = 1.0 - weights[0].weight;
          } else {
            blendMask[y * res + x] = 0;
          }

          // Compute per-scatter-type density from blended biome weights
          if (weights && weights.length > 0) {
            for (const { biomeType: wBiome, weight: wWeight } of weights) {
              const cfgs = result.biomeScatterConfigs.get(wBiome);
              if (!cfgs) continue;
              for (const cfg of cfgs) {
                const mask = scatterMasks.get(cfg.scatterType);
                if (mask) {
                  mask[y * res + x] += cfg.density * wWeight;
                }
              }
            }
          }
        }
      }
    }

    result.scatterMasks.push(
      { name: 'biome_dominant', resolution: res, data: biomeMask },
      { name: 'temperature', resolution: res, data: tempMask },
      { name: 'moisture', resolution: res, data: moistureMask },
      { name: 'biome_blend', resolution: res, data: blendMask },
    );

    // Add per-scatter-type density masks (e.g. 'scatter_grass', 'scatter_rock', etc.)
    for (const [scatterType, mask] of scatterMasks) {
      result.scatterMasks.push({
        name: `scatter_${scatterType}`,
        resolution: res,
        data: mask,
      });
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Utility accessors
  // -----------------------------------------------------------------------

  /** Get the BiomeFramework instance for direct access */
  getBiomeFramework(): BiomeFramework {
    return this.biomeFramework;
  }

  /** Get the BiomeScatterMapping instance */
  getScatterMapping(): BiomeScatterMapping {
    return this.scatterMapping;
  }
}
