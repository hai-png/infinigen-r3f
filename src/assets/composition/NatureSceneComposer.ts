/**
 * Nature Scene Composer for Infinigen R3F
 *
 * Implements the full nature scene generation pipeline matching original generate_nature.py.
 * Each step is an independently callable method; `compose(seed)` runs the full pipeline.
 */

import { Vector3, Quaternion, Color, MathUtils, Box3 } from 'three';
import { TerrainGenerator, type TerrainConfig, type TerrainData } from '@/terrain/core/TerrainGenerator';
import { BiomeSystem, type BiomeType, type BiomeGrid } from '@/terrain/biomes/core/BiomeSystem';
import { BiomeFramework, BiomeInterpolator, BiomeScatterer, type ScatteredAsset } from '@/terrain/biomes/core/BiomeFramework';
import { BiomeScatterMapping, type BiomeScatterProfile, type ScatterEntry, type BiomeScatterConfig, getScatterConfigForBiome, BIOME_SCATTER_CONFIGS } from '@/terrain/biomes/core/BiomeScatterMapping';
import { createCanvas } from '@/assets/utils/CanvasUtils';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'snow' | 'dust' | 'fog';
export type CreatureType = 'ground' | 'flying' | 'aquatic' | 'insect';

export interface TerrainParams {
  seed: number;
  width: number;
  height: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  erosionStrength: number;
  erosionIterations: number;
  tectonicPlates: number;
  seaLevel: number;
}

export interface VegetationDensityParams {
  treeDensity: number;
  bushDensity: number;
  grassDensity: number;
  flowerDensity: number;
  mushroomDensity: number;
  groundCoverDensity: number;
}

export interface CloudParams {
  enabled: boolean;
  count: number;
  altitude: number;
  spread: number;
}

export interface CameraParams {
  position: Vector3;
  target: Vector3;
  fov: number;
  near: number;
  far: number;
}

export interface LightingParams {
  sunPosition: Vector3;
  sunIntensity: number;
  sunColor: string;
  ambientIntensity: number;
  ambientColor: string;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
}

export interface CreatureParams {
  type: CreatureType;
  count: number;
  spawnArea: { center: Vector3; radius: number };
}

export interface WaterParams {
  riverEnabled: boolean;
  lakeEnabled: boolean;
  waterfallEnabled: boolean;
  oceanEnabled: boolean;
  waterLevel: number;
}

export interface WindParams {
  enabled: boolean;
  speed: number;
  gustAmplitude: number;
  gustFrequency: number;
  direction: Vector3;
}

export interface WeatherParticleParams {
  type: WeatherType;
  intensity: number;
  density: number;
}

export interface NatureSceneConfig {
  terrain: Partial<TerrainParams>;
  season: Season;
  vegetation: Partial<VegetationDensityParams>;
  clouds: Partial<CloudParams>;
  camera: Partial<CameraParams>;
  lighting: Partial<LightingParams>;
  creatures: CreatureParams[];
  water: Partial<WaterParams>;
  wind: Partial<WindParams>;
  weather: WeatherParticleParams | null;
}

export interface NatureSceneResult {
  seed: number;
  terrain: TerrainData | null;
  terrainParams: TerrainParams;
  season: Season;
  vegetationConfig: VegetationDensityParams;
  cloudConfig: CloudParams;
  cameraConfig: CameraParams;
  lightingConfig: LightingParams;
  creatureConfigs: CreatureParams[];
  waterConfig: WaterParams;
  windConfig: WindParams;
  weatherConfig: WeatherParticleParams | null;
  boulders: BoulderData[];
  groundCover: GroundCoverData[];
  scatterMasks: ScatterMaskData[];
  rivers: RiverData[];
  /** Biome grid result from the Whittaker classification system */
  biomeGrid: BiomeGrid | null;
  /** Dominant biome type across the scene */
  dominantBiome: BiomeType | null;
  /** Per-biome scatter profiles used for vegetation selection */
  biomeScatterProfiles: Map<string, BiomeScatterProfile>;
  /** Per-biome simplified scatter configs (scatterType + density + scaleRange + materialPreset) */
  biomeScatterConfigs: Map<string, BiomeScatterConfig[]>;
}

export interface BoulderData {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  type: string;
}

export interface GroundCoverData {
  type: 'leaves' | 'twigs' | 'grass' | 'flowers' | 'mushrooms' | 'pine_debris' | string;
  positions: Vector3[];
  density: number;
  /** Biome type that this ground cover is associated with */
  biomeType?: BiomeType;
}

export interface ScatterMaskData {
  name: string;
  resolution: number;
  data: Float32Array;
}

export interface RiverData {
  path: Vector3[];
  width: number;
  depth: number;
  flowSpeed: number;
}

// ---------------------------------------------------------------------------
// Seeded RNG helper (lightweight, deterministic)
// ---------------------------------------------------------------------------

class ComposerRNG {
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

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TERRAIN: TerrainParams = {
  seed: 42,
  width: 256,
  height: 256,
  scale: 60,
  octaves: 6,
  persistence: 0.5,
  lacunarity: 2.0,
  erosionStrength: 0.3,
  erosionIterations: 10,
  tectonicPlates: 3,
  seaLevel: 0.3,
};

const DEFAULT_VEGETATION: VegetationDensityParams = {
  treeDensity: 0.4,
  bushDensity: 0.3,
  grassDensity: 0.8,
  flowerDensity: 0.2,
  mushroomDensity: 0.1,
  groundCoverDensity: 0.6,
};

const DEFAULT_CLOUDS: CloudParams = {
  enabled: true,
  count: 12,
  altitude: 80,
  spread: 120,
};

const DEFAULT_CAMERA: CameraParams = {
  position: new Vector3(80, 60, 80),
  target: new Vector3(0, 5, 0),
  fov: 55,
  near: 0.5,
  far: 1000,
};

const DEFAULT_LIGHTING: LightingParams = {
  sunPosition: new Vector3(60, 100, 40),
  sunIntensity: 1.8,
  sunColor: '#fffbe6',
  ambientIntensity: 0.4,
  ambientColor: '#b8d4e8',
  hemisphereSkyColor: '#87ceeb',
  hemisphereGroundColor: '#3a5f0b',
  hemisphereIntensity: 0.35,
};

const DEFAULT_WATER: WaterParams = {
  riverEnabled: true,
  lakeEnabled: true,
  waterfallEnabled: false,
  oceanEnabled: true,
  waterLevel: 0.3,
};

const DEFAULT_WIND: WindParams = {
  enabled: true,
  speed: 3.0,
  gustAmplitude: 0.4,
  gustFrequency: 0.3,
  direction: new Vector3(1, 0, 0.3).normalize(),
};

// ---------------------------------------------------------------------------
// NatureSceneComposer
// ---------------------------------------------------------------------------

export class NatureSceneComposer {
  private config: NatureSceneConfig;
  private rng: ComposerRNG;
  private seed: number;
  private result: NatureSceneResult;
  private biomeSystem: BiomeSystem;
  private biomeFramework: BiomeFramework;
  private scatterMapping: BiomeScatterMapping;

  constructor(config: Partial<NatureSceneConfig> = {}) {
    this.seed = config.terrain?.seed ?? 42;
    this.rng = new ComposerRNG(this.seed);
    this.config = this.mergeDefaults(config);
    this.biomeSystem = new BiomeSystem(0.3, this.seed);
    this.biomeFramework = new BiomeFramework(this.seed);
    this.scatterMapping = new BiomeScatterMapping();
    this.result = this.createEmptyResult();
  }

  // -----------------------------------------------------------------------
  // Full pipeline
  // -----------------------------------------------------------------------

  compose(seed?: number): NatureSceneResult {
    if (seed !== undefined) {
      this.seed = seed;
      this.rng = new ComposerRNG(seed);
      this.config.terrain.seed = seed;
      this.biomeSystem = new BiomeSystem(0.3, seed);
      this.biomeFramework = new BiomeFramework(seed);
    }

    this.generateTerrain();
    this.classifyBiomes();
    this.addClouds();
    this.chooseSeason();
    this.scatterVegetation();
    this.addBouldersAndRocks();
    this.setupCamera();
    this.configureLighting();
    this.addCreatures();
    this.scatterGroundCover();
    this.addWindEffectors();
    this.addWeatherParticles();
    this.addRiversAndWaterfalls();

    return this.result;
  }

  // -----------------------------------------------------------------------
  // Step 1: Generate terrain (coarse)
  // -----------------------------------------------------------------------

  generateTerrain(): TerrainData | null {
    const tp = this.result.terrainParams;
    const generator = new TerrainGenerator({
      seed: tp.seed,
      width: tp.width,
      height: tp.height,
      scale: tp.scale,
      octaves: tp.octaves,
      persistence: tp.persistence,
      lacunarity: tp.lacunarity,
      erosionStrength: tp.erosionStrength,
      erosionIterations: tp.erosionIterations,
      tectonicPlates: tp.tectonicPlates,
      seaLevel: tp.seaLevel,
    });

    try {
      const data = generator.generate();
      this.result.terrain = data;
      return data;
    } catch (err) {
      // Silently fall back - terrain generation may fail during SSR or other failure
      if (process.env.NODE_ENV === 'development') console.debug('[NatureSceneComposer] terrain generation fallback:', err);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Step 1b: Classify biomes using Whittaker diagram
  // -----------------------------------------------------------------------

  /**
   * Classify terrain into biomes using temperature/moisture maps.
   *
   * Replaces the old 25-line inline height/slope lookup with the proper
   * Whittaker diagram approach. Produces a BiomeGrid with:
   * - Temperature map (latitude, altitude, distance-to-water, noise)
   * - Moisture map (distance-to-water, altitude, wind noise, noise)
   * - Per-cell biome classification
   * - Per-cell blend weights for smooth transitions
   * - Scatter profiles for each biome type
   */
  classifyBiomes(): BiomeGrid | null {
    const terrain = this.result.terrain;
    if (!terrain) return null;

    const w = terrain.width;
    const h = terrain.height;
    const heightData = terrain.heightMap.data;
    const slopeData = terrain.slopeMap.data;

    if (!heightData || !slopeData) return null;

    // Use the BiomeGrid from TerrainGenerator if available (avoids double-computation)
    let biomeGrid: BiomeGrid;
    if (terrain.biomeGrid) {
      biomeGrid = terrain.biomeGrid;
    } else {
      // Fallback: generate biome grid using BiomeSystem directly
      biomeGrid = this.biomeSystem.generateBiomeGrid(
        heightData,
        slopeData,
        w,
        h,
        { seed: this.seed, seaLevel: this.result.terrainParams.seaLevel }
      );
    }

    this.result.biomeGrid = biomeGrid;

    // Use dominant biome from TerrainGenerator if available
    if (terrain.dominantBiome) {
      this.result.dominantBiome = terrain.dominantBiome;
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
      this.result.dominantBiome = dominantBiome;
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
        this.result.biomeScatterProfiles.set(biomeType, profile);
      } else {
        // Fallback: direct lookup from BiomeScatterMapping
        const directProfile = this.scatterMapping.getProfile(biomeType as any);
        if (directProfile) {
          this.result.biomeScatterProfiles.set(biomeType, directProfile);
        }
      }
    }

    // Populate simplified biome scatter configs from BIOME_SCATTER_CONFIGS
    for (const biomeType of biomeCounts.keys()) {
      const configs = getScatterConfigForBiome(biomeType);
      if (configs.length > 0) {
        this.result.biomeScatterConfigs.set(biomeType, configs);
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
    for (const [biomeType, configs] of this.result.biomeScatterConfigs) {
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
          biomeMask[y * res + x] = biomeType === (this.result.dominantBiome ?? 'desert') ? 1.0 : 0.5;
          tempMask[y * res + x] = biomeGrid.temperature[gridIdx] ?? 0;
          moistureMask[y * res + x] = biomeGrid.moisture[gridIdx] ?? 0;

          // Use blend weights from BiomeInterpolator for smooth transition mask
          // The blendWeights array provides per-cell weighted mixes of nearby biomes
          const weights = biomeGrid.blendWeights[gridIdx];
          if (weights && weights.length > 1) {
            // Transition factor: 1 - weight of primary biome = how much blending
            blendMask[y * res + x] = 1.0 - weights[0].weight;
          } else {
            blendMask[y * res + x] = 0;
          }

          // Compute per-scatter-type density from blended biome weights
          // For each scatter type, accumulate density weighted by each biome's blend weight
          if (weights && weights.length > 0) {
            for (const { biomeType: wBiome, weight: wWeight } of weights) {
              const cfgs = this.result.biomeScatterConfigs.get(wBiome);
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

    this.result.scatterMasks.push(
      { name: 'biome_dominant', resolution: res, data: biomeMask },
      { name: 'temperature', resolution: res, data: tempMask },
      { name: 'moisture', resolution: res, data: moistureMask },
      { name: 'biome_blend', resolution: res, data: blendMask },
    );

    // Add per-scatter-type density masks (e.g. 'scatter_grass', 'scatter_rock', etc.)
    for (const [scatterType, mask] of scatterMasks) {
      this.result.scatterMasks.push({
        name: `scatter_${scatterType}`,
        resolution: res,
        data: mask,
      });
    }

    return biomeGrid;
  }

  // -----------------------------------------------------------------------
  // Step 2: Add clouds, choose season
  // -----------------------------------------------------------------------

  addClouds(): CloudParams {
    const cp = this.result.cloudConfig;
    if (!cp.enabled) return cp;

    // Generate cloud positions as scatter mask data
    const cloudMask = new Float32Array(64 * 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const nx = x / 64 * 4;
        const ny = y / 64 * 4;
        const v = (Math.sin(nx * 2.7 + this.seed) * Math.cos(ny * 3.1 + this.seed) + 1) * 0.5;
        cloudMask[y * 64 + x] = v > 0.6 ? v : 0;
      }
    }
    this.result.scatterMasks.push({ name: 'clouds', resolution: 64, data: cloudMask });
    return cp;
  }

  chooseSeason(): Season {
    const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
    this.result.season = this.config.season ?? this.rng.pick(seasons);
    return this.result.season;
  }

  // -----------------------------------------------------------------------
  // Step 3: Scatter trees/bushes with density masks
  // -----------------------------------------------------------------------

  scatterVegetation(): VegetationDensityParams {
    const veg = this.result.vegetationConfig;
    const terrain = this.result.terrain;
    const biomeGrid = this.result.biomeGrid;

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
            const profile = this.result.biomeScatterProfiles.get(biomeType);
            // Use the profile's vegetation density multiplier to drive tree placement
            const vegMult = profile?.densityMultipliers.vegetation ?? 1.0;
            const globalMult = profile?.densityMultipliers.global ?? 1.0;
            biomeVegMask[y * res + x] = Math.min(1.0, vegMult * globalMult);
          } else {
            biomeVegMask[y * res + x] = 0.5; // Default fallback
          }
        }
      }

      this.result.scatterMasks.push(
        { name: 'altitude_trees', resolution: res, data: altMask },
        { name: 'slope_trees', resolution: res, data: slopeMask },
        { name: 'biome_vegetation', resolution: res, data: biomeVegMask },
      );
    }

    // Adjust vegetation config based on dominant biome
    if (this.result.dominantBiome) {
      const profile = this.result.biomeScatterProfiles.get(this.result.dominantBiome);
      if (profile) {
        // Scale vegetation density by the biome's vegetation multiplier
        const mult = profile.densityMultipliers.vegetation * profile.densityMultipliers.global;
        veg.treeDensity *= mult;
        veg.bushDensity *= mult;
        veg.grassDensity *= profile.densityMultipliers.groundCover * profile.densityMultipliers.global;
        veg.groundCoverDensity *= profile.densityMultipliers.groundCover * profile.densityMultipliers.global;
      }
    }

    return veg;
  }

  // -----------------------------------------------------------------------
  // Step 4: Add boulders and rocks
  // -----------------------------------------------------------------------

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

    this.result.boulders = boulders;
    return boulders;
  }

  // -----------------------------------------------------------------------
  // Step 5: Set up camera with pose validation
  // -----------------------------------------------------------------------

  setupCamera(): CameraParams {
    const cam = this.result.cameraConfig;
    const terrain = this.result.terrain;

    // Validate camera isn't below terrain
    if (terrain) {
      const heightScale = 35;
      const worldSize = 200;
      const nx = Math.floor(((cam.position.x + worldSize / 2) / worldSize) * terrain.width);
      const ny = Math.floor(((cam.position.z + worldSize / 2) / worldSize) * terrain.height);
      const idx = ny * terrain.width + nx;
      const terrainH = (terrain.heightMap.data?.[idx] ?? 0) * heightScale;

      if (cam.position.y < terrainH + 5) {
        cam.position.y = terrainH + 15;
      }
    }

    return cam;
  }

  // -----------------------------------------------------------------------
  // Step 6: Configure lighting (sky-based)
  // -----------------------------------------------------------------------

  configureLighting(): LightingParams {
    const light = this.result.lightingConfig;
    const season = this.result.season;

    // Seasonal lighting adjustments
    switch (season) {
      case 'winter':
        light.sunIntensity = 1.2;
        light.sunColor = '#e0e8f0';
        light.ambientIntensity = 0.5;
        light.ambientColor = '#c0d0e0';
        break;
      case 'autumn':
        light.sunIntensity = 1.5;
        light.sunColor = '#ffddaa';
        light.ambientIntensity = 0.4;
        light.ambientColor = '#c8a878';
        break;
      case 'spring':
        light.sunIntensity = 1.7;
        light.sunColor = '#fff5e0';
        light.ambientIntensity = 0.4;
        light.ambientColor = '#b8d4e8';
        break;
      case 'summer':
      default:
        // Keep defaults
        break;
    }

    return light;
  }

  // -----------------------------------------------------------------------
  // Step 7: Add creatures
  // -----------------------------------------------------------------------

  addCreatures(): CreatureParams[] {
    const creatures: CreatureParams[] = [];

    // Ground creatures
    if (this.rng.next() > 0.3) {
      creatures.push({
        type: 'ground',
        count: this.rng.int(1, 4),
        spawnArea: { center: new Vector3(this.rng.range(-30, 30), 0, this.rng.range(-30, 30)), radius: 20 },
      });
    }

    // Flying creatures
    if (this.rng.next() > 0.4) {
      creatures.push({
        type: 'flying',
        count: this.rng.int(2, 8),
        spawnArea: { center: new Vector3(0, 30, 0), radius: 50 },
      });
    }

    // Aquatic creatures
    if (this.result.waterConfig.oceanEnabled && this.rng.next() > 0.5) {
      creatures.push({
        type: 'aquatic',
        count: this.rng.int(2, 6),
        spawnArea: { center: new Vector3(0, 0, 0), radius: 40 },
      });
    }

    // Insects
    if (this.result.season !== 'winter' && this.rng.next() > 0.3) {
      creatures.push({
        type: 'insect',
        count: this.rng.int(5, 20),
        spawnArea: { center: new Vector3(this.rng.range(-20, 20), 1, this.rng.range(-20, 20)), radius: 15 },
      });
    }

    this.result.creatureConfigs = creatures;
    return creatures;
  }

  // -----------------------------------------------------------------------
  // Step 8: Scatter ground cover
  // -----------------------------------------------------------------------

  scatterGroundCover(): GroundCoverData[] {
    const cover: GroundCoverData[] = [];
    const veg = this.result.vegetationConfig;
    const season = this.result.season;
    const worldHalf = 80;
    const biomeGrid = this.result.biomeGrid;

    // If we have biome data, generate biome-specific ground cover
    if (biomeGrid && this.result.biomeScatterProfiles.size > 0) {
      // For each biome present in the scene, generate ground cover from the scatter profile
      for (const [biomeType, profile] of this.result.biomeScatterProfiles) {
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

    this.result.groundCover = cover;
    return cover;
  }

  // -----------------------------------------------------------------------
  // Step 9: Add wind/turbulence effectors
  // -----------------------------------------------------------------------

  addWindEffectors(): WindParams {
    return this.result.windConfig;
  }

  // -----------------------------------------------------------------------
  // Step 10: Add weather particles
  // -----------------------------------------------------------------------

  addWeatherParticles(): WeatherParticleParams | null {
    const weather = this.config.weather;

    if (weather) {
      this.result.weatherConfig = weather;
      return weather;
    }

    // Auto-choose weather based on season
    const season = this.result.season;
    if (season === 'winter' && this.rng.next() > 0.4) {
      this.result.weatherConfig = { type: 'snow', intensity: 0.7, density: 2000 };
    } else if (season === 'autumn' && this.rng.next() > 0.6) {
      this.result.weatherConfig = { type: 'rain', intensity: 0.4, density: 1500 };
    } else if (this.rng.next() > 0.8) {
      this.result.weatherConfig = { type: 'fog', intensity: 0.3, density: 100 };
    }

    return this.result.weatherConfig;
  }

  // -----------------------------------------------------------------------
  // Step 11: Add rivers/waterfalls
  // -----------------------------------------------------------------------

  addRiversAndWaterfalls(): RiverData[] {
    const rivers: RiverData[] = [];
    const wc = this.result.waterConfig;

    if (wc.riverEnabled) {
      const riverCount = this.rng.int(1, 3);
      for (let r = 0; r < riverCount; r++) {
        const path: Vector3[] = [];
        const startX = this.rng.range(-60, 60);
        const startZ = this.rng.range(-60, 60);
        const segments = this.rng.int(10, 25);

        for (let s = 0; s <= segments; s++) {
          const t = s / segments;
          path.push(new Vector3(
            startX + t * this.rng.range(20, 60) + Math.sin(t * 4) * 10,
            Math.max(0, 15 - t * 15),
            startZ + t * this.rng.range(20, 60) + Math.cos(t * 3) * 8,
          ));
        }

        rivers.push({
          path,
          width: this.rng.range(2, 8),
          depth: this.rng.range(0.5, 2),
          flowSpeed: this.rng.range(0.5, 2),
        });
      }
    }

    this.result.rivers = rivers;
    return rivers;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private mergeDefaults(config: Partial<NatureSceneConfig>): NatureSceneConfig {
    return {
      terrain: { ...DEFAULT_TERRAIN, ...config.terrain },
      season: config.season ?? 'summer',
      vegetation: { ...DEFAULT_VEGETATION, ...config.vegetation },
      clouds: { ...DEFAULT_CLOUDS, ...config.clouds },
      camera: {
        ...DEFAULT_CAMERA,
        ...config.camera,
        position: config.camera?.position ?? DEFAULT_CAMERA.position.clone(),
        target: config.camera?.target ?? DEFAULT_CAMERA.target.clone(),
      },
      lighting: {
        ...DEFAULT_LIGHTING,
        ...config.lighting,
        sunPosition: config.lighting?.sunPosition ?? DEFAULT_LIGHTING.sunPosition.clone(),
      },
      creatures: config.creatures ?? [],
      water: { ...DEFAULT_WATER, ...config.water },
      wind: {
        ...DEFAULT_WIND,
        ...config.wind,
        direction: config.wind?.direction ?? DEFAULT_WIND.direction.clone(),
      },
      weather: config.weather ?? null,
    };
  }

  private createEmptyResult(): NatureSceneResult {
    return {
      seed: this.seed,
      terrain: null,
      terrainParams: { ...DEFAULT_TERRAIN, ...this.config.terrain } as TerrainParams,
      season: this.config.season ?? 'summer',
      vegetationConfig: { ...DEFAULT_VEGETATION, ...this.config.vegetation },
      cloudConfig: { ...DEFAULT_CLOUDS, ...this.config.clouds },
      cameraConfig: {
        ...DEFAULT_CAMERA,
        ...this.config.camera,
        position: this.config.camera?.position ?? DEFAULT_CAMERA.position.clone(),
        target: this.config.camera?.target ?? DEFAULT_CAMERA.target.clone(),
      } as CameraParams,
      lightingConfig: {
        ...DEFAULT_LIGHTING,
        ...this.config.lighting,
        sunPosition: this.config.lighting?.sunPosition ?? DEFAULT_LIGHTING.sunPosition.clone(),
      } as LightingParams,
      creatureConfigs: [],
      waterConfig: { ...DEFAULT_WATER, ...this.config.water },
      windConfig: {
        ...DEFAULT_WIND,
        ...this.config.wind,
        direction: this.config.wind?.direction ?? DEFAULT_WIND.direction.clone(),
      } as WindParams,
      weatherConfig: null,
      boulders: [],
      groundCover: [],
      scatterMasks: [],
      rivers: [],
      biomeGrid: null,
      dominantBiome: null,
      biomeScatterProfiles: new Map(),
      biomeScatterConfigs: new Map(),
    };
  }

  // -----------------------------------------------------------------------
  // Static utility
  // -----------------------------------------------------------------------

  /**
   * Get scatter configurations for a specific biome type that can be fed
   * into ScatterFactory. Uses BiomeScatterer for legacy name mapping
   * and density multiplier application.
   *
   * @param biomeType - Biome type to get scatter configs for
   * @param bounds - World-space bounds for scatter placement
   * @returns Array of scatter configs compatible with ScatterFactory
   */
  getScatterConfigsForBiome(
    biomeType: BiomeType | string,
    bounds: { min: Vector3; max: Vector3 }
  ) {
    const box3 = new Box3(bounds.min, bounds.max);
    return this.biomeFramework.getScatterConfigs(biomeType, box3);
  }

  /**
   * Get the BiomeFramework instance for direct access to
   * BiomeInterpolator and BiomeScatterer.
   */
  getBiomeFramework(): BiomeFramework {
    return this.biomeFramework;
  }

  /**
   * Get simplified scatter configurations for a specific biome, suitable for
   * driving ScatterFactory with biome masks.
   *
   * Each returned BiomeScatterConfig includes scatterType, density, scaleRange,
   * and materialPreset — the four fields needed to configure scatter selection
   * per biome. The biome masks (available in result.scatterMasks) can be used
   * as distribution maps to restrict scatter placement to cells where the given
   * biome has weight > 0.
   *
   * @param biomeType - Biome identifier (e.g. 'desert', 'boreal_forest')
   * @returns Array of BiomeScatterConfig entries, or empty array if unknown
   */
  getBiomeScatterConfigs(biomeType: string): BiomeScatterConfig[] {
    return getScatterConfigForBiome(biomeType);
  }

  /**
   * Get all per-scatter-type density masks that were generated during
   * biome classification. These masks encode the blended density of each
   * scatter type (e.g. 'grass', 'rock', 'moss') across the terrain,
   * weighted by each biome's blend weight at each cell.
   *
   * Returns a Map of scatterType → Float32Array (128×128 resolution).
   * Use these as distribution maps in ScatterFactory for biome-aware placement.
   */
  getScatterDensityMasks(): Map<string, Float32Array> {
    const masks = new Map<string, Float32Array>();
    for (const mask of this.result.scatterMasks) {
      if (mask.name.startsWith('scatter_')) {
        const scatterType = mask.name.replace('scatter_', '');
        masks.set(scatterType, mask.data);
      }
    }
    return masks;
  }

  static quickCompose(seed: number, overrides?: Partial<NatureSceneConfig>): NatureSceneResult {
    const composer = new NatureSceneComposer({ ...overrides, terrain: { seed, ...overrides?.terrain } });
    return composer.compose(seed);
  }
}
