/**
 * Nature Scene Composer for Infinigen R3F — Thin orchestrator.
 *
 * Previously a 1096-line god class; now delegates to subsystems:
 *   - NatureTerrainSubsystem   — terrain generation & biome classification
 *   - NatureVegetationSubsystem — vegetation & ground cover scattering
 *   - NatureAtmosphereSubsystem — clouds, weather, wind, lighting
 *   - NatureWaterSubsystem     — rivers, lakes, waterfalls
 *   - NatureCameraSubsystem    — camera setup & terrain validation
 *
 * The NatureSceneComposer orchestrates these components and provides the
 * same public API as before: `compose(seed)`, config/result types, and
 * static utilities.
 *
 * @module composition/NatureSceneComposer
 */

import { Vector3, Quaternion, Box3 } from 'three';
import { type TerrainData } from '@/terrain/core/TerrainGenerator';
import { type BiomeType, type BiomeGrid } from '@/terrain/biomes/core/BiomeSystem';
import { BiomeFramework, type ScatteredAsset } from '@/terrain/biomes/core/BiomeFramework';
import { type BiomeScatterProfile, type BiomeScatterConfig, getScatterConfigForBiome } from '@/terrain/biomes/core/BiomeScatterMapping';

// Subsystems
import { NatureTerrainSubsystem } from './subsystems/NatureTerrainSubsystem';
import { NatureVegetationSubsystem } from './subsystems/NatureVegetationSubsystem';
import { NatureAtmosphereSubsystem } from './subsystems/NatureAtmosphereSubsystem';
import { NatureWaterSubsystem } from './subsystems/NatureWaterSubsystem';
import { NatureCameraSubsystem } from './subsystems/NatureCameraSubsystem';

// ---------------------------------------------------------------------------
// Type definitions (preserved for backward compatibility)
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
// Seeded RNG helper (lightweight, deterministic — used for creature spawning)
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
// NatureSceneComposer — Thin orchestrator
// ---------------------------------------------------------------------------

/**
 * Nature Scene Composer — orchestrates the full nature scene generation pipeline.
 *
 * Delegates to specialized subsystems while preserving the original public API.
 * The compose(seed) method runs the full pipeline in order:
 *
 *   1. generateTerrain()       → NatureTerrainSubsystem
 *   2. classifyBiomes()        → NatureTerrainSubsystem
 *   3. addClouds()             → NatureAtmosphereSubsystem
 *   4. chooseSeason()          → NatureAtmosphereSubsystem
 *   5. scatterVegetation()     → NatureVegetationSubsystem
 *   6. addBouldersAndRocks()   → NatureVegetationSubsystem
 *   7. setupCamera()           → NatureCameraSubsystem
 *   8. configureLighting()     → NatureAtmosphereSubsystem
 *   9. addCreatures()          → inline (small, RNG-dependent)
 *  10. scatterGroundCover()    → NatureVegetationSubsystem
 *  11. addWindEffectors()      → NatureAtmosphereSubsystem
 *  12. addWeatherParticles()   → NatureAtmosphereSubsystem
 *  13. addRiversAndWaterfalls()→ NatureWaterSubsystem
 */
export class NatureSceneComposer {
  private config: NatureSceneConfig;
  private rng: ComposerRNG;
  private seed: number;
  private result: NatureSceneResult;

  // Subsystems
  private terrainSubsystem: NatureTerrainSubsystem;
  private vegetationSubsystem: NatureVegetationSubsystem;
  private atmosphereSubsystem: NatureAtmosphereSubsystem;
  private waterSubsystem: NatureWaterSubsystem;
  private cameraSubsystem: NatureCameraSubsystem;

  constructor(config: Partial<NatureSceneConfig> = {}) {
    this.seed = config.terrain?.seed ?? 42;
    this.rng = new ComposerRNG(this.seed);
    this.config = this.mergeDefaults(config);

    // Initialize subsystems
    this.terrainSubsystem = new NatureTerrainSubsystem(this.seed);
    this.vegetationSubsystem = new NatureVegetationSubsystem(this.seed);
    this.atmosphereSubsystem = new NatureAtmosphereSubsystem(this.seed);
    this.waterSubsystem = new NatureWaterSubsystem(this.seed);
    this.cameraSubsystem = new NatureCameraSubsystem();

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

      // Reset subsystems with new seed
      this.terrainSubsystem.resetSeed(seed);
      this.vegetationSubsystem.resetSeed(seed);
      this.atmosphereSubsystem.resetSeed(seed);
      this.waterSubsystem.resetSeed(seed);
    }

    // Step 1–2: Terrain & biomes (delegated to NatureTerrainSubsystem)
    this.result.terrain = this.terrainSubsystem.generateTerrain(this.result.terrainParams);
    const biomeResult = this.terrainSubsystem.classifyBiomes(this.result.terrain, this.result.terrainParams);
    this.result.biomeGrid = biomeResult.biomeGrid;
    this.result.dominantBiome = biomeResult.dominantBiome;
    this.result.biomeScatterProfiles = biomeResult.biomeScatterProfiles;
    this.result.biomeScatterConfigs = biomeResult.biomeScatterConfigs;
    this.result.scatterMasks.push(...biomeResult.scatterMasks);

    // Step 3: Clouds (delegated to NatureAtmosphereSubsystem)
    const cloudMask = this.atmosphereSubsystem.addClouds(this.result.cloudConfig, this.seed);
    if (cloudMask) this.result.scatterMasks.push(cloudMask);

    // Step 4: Season (delegated to NatureAtmosphereSubsystem)
    this.result.season = this.atmosphereSubsystem.chooseSeason(this.config.season);

    // Step 5: Vegetation (delegated to NatureVegetationSubsystem)
    const vegResult = this.vegetationSubsystem.scatterVegetation(
      this.result.vegetationConfig,
      this.result.terrain,
      this.result.biomeGrid,
      this.result.dominantBiome,
      this.result.biomeScatterProfiles,
    );
    this.result.vegetationConfig = vegResult.vegetationConfig;
    this.result.scatterMasks.push(...vegResult.scatterMasks);

    // Step 6: Boulders (delegated to NatureVegetationSubsystem)
    this.result.boulders = this.vegetationSubsystem.addBouldersAndRocks();

    // Step 7: Camera (delegated to NatureCameraSubsystem)
    this.result.cameraConfig = this.cameraSubsystem.setupCamera(this.result.cameraConfig, this.result.terrain);

    // Step 8: Lighting (delegated to NatureAtmosphereSubsystem)
    this.result.lightingConfig = this.atmosphereSubsystem.configureLighting(this.result.lightingConfig, this.result.season);

    // Step 9: Creatures (kept inline — small and RNG-dependent)
    this.result.creatureConfigs = this.addCreatures();

    // Step 10: Ground cover (delegated to NatureVegetationSubsystem)
    this.result.groundCover = this.vegetationSubsystem.scatterGroundCover(
      this.result.vegetationConfig,
      this.result.season,
      this.result.biomeGrid,
      this.result.biomeScatterProfiles,
      this.result.waterConfig,
    );

    // Step 11: Wind (delegated to NatureAtmosphereSubsystem)
    this.result.windConfig = this.atmosphereSubsystem.addWindEffectors(this.result.windConfig);

    // Step 12: Weather (delegated to NatureAtmosphereSubsystem)
    this.result.weatherConfig = this.atmosphereSubsystem.addWeatherParticles(this.config.weather, this.result.season);

    // Step 13: Rivers & waterfalls (delegated to NatureWaterSubsystem)
    this.result.rivers = this.waterSubsystem.addRiversAndWaterfalls(this.result.waterConfig);

    return this.result;
  }

  // -----------------------------------------------------------------------
  // Individual step methods (backward-compatible public API)
  // -----------------------------------------------------------------------

  generateTerrain(): TerrainData | null {
    this.result.terrain = this.terrainSubsystem.generateTerrain(this.result.terrainParams);
    return this.result.terrain;
  }

  classifyBiomes(): BiomeGrid | null {
    const biomeResult = this.terrainSubsystem.classifyBiomes(this.result.terrain, this.result.terrainParams);
    this.result.biomeGrid = biomeResult.biomeGrid;
    this.result.dominantBiome = biomeResult.dominantBiome;
    this.result.biomeScatterProfiles = biomeResult.biomeScatterProfiles;
    this.result.biomeScatterConfigs = biomeResult.biomeScatterConfigs;
    this.result.scatterMasks.push(...biomeResult.scatterMasks);
    return biomeResult.biomeGrid;
  }

  addClouds(): CloudParams {
    const cloudMask = this.atmosphereSubsystem.addClouds(this.result.cloudConfig, this.seed);
    if (cloudMask) this.result.scatterMasks.push(cloudMask);
    return this.result.cloudConfig;
  }

  chooseSeason(): Season {
    this.result.season = this.atmosphereSubsystem.chooseSeason(this.config.season);
    return this.result.season;
  }

  scatterVegetation(): VegetationDensityParams {
    const vegResult = this.vegetationSubsystem.scatterVegetation(
      this.result.vegetationConfig,
      this.result.terrain,
      this.result.biomeGrid,
      this.result.dominantBiome,
      this.result.biomeScatterProfiles,
    );
    this.result.vegetationConfig = vegResult.vegetationConfig;
    this.result.scatterMasks.push(...vegResult.scatterMasks);
    return this.result.vegetationConfig;
  }

  addBouldersAndRocks(): BoulderData[] {
    this.result.boulders = this.vegetationSubsystem.addBouldersAndRocks();
    return this.result.boulders;
  }

  setupCamera(): CameraParams {
    this.result.cameraConfig = this.cameraSubsystem.setupCamera(this.result.cameraConfig, this.result.terrain);
    return this.result.cameraConfig;
  }

  configureLighting(): LightingParams {
    this.result.lightingConfig = this.atmosphereSubsystem.configureLighting(this.result.lightingConfig, this.result.season);
    return this.result.lightingConfig;
  }

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

  scatterGroundCover(): GroundCoverData[] {
    this.result.groundCover = this.vegetationSubsystem.scatterGroundCover(
      this.result.vegetationConfig,
      this.result.season,
      this.result.biomeGrid,
      this.result.biomeScatterProfiles,
      this.result.waterConfig,
    );
    return this.result.groundCover;
  }

  addWindEffectors(): WindParams {
    this.result.windConfig = this.atmosphereSubsystem.addWindEffectors(this.result.windConfig);
    return this.result.windConfig;
  }

  addWeatherParticles(): WeatherParticleParams | null {
    this.result.weatherConfig = this.atmosphereSubsystem.addWeatherParticles(this.config.weather, this.result.season);
    return this.result.weatherConfig;
  }

  addRiversAndWaterfalls(): RiverData[] {
    this.result.rivers = this.waterSubsystem.addRiversAndWaterfalls(this.result.waterConfig);
    return this.result.rivers;
  }

  // -----------------------------------------------------------------------
  // Static utility & accessor methods
  // -----------------------------------------------------------------------

  /**
   * Get scatter configurations for a specific biome type that can be fed
   * into ScatterFactory.
   */
  getScatterConfigsForBiome(
    biomeType: BiomeType | string,
    bounds: { min: Vector3; max: Vector3 }
  ) {
    const box3 = new Box3(bounds.min, bounds.max);
    return this.terrainSubsystem.getBiomeFramework().getScatterConfigs(biomeType, box3);
  }

  /**
   * Get the BiomeFramework instance for direct access.
   */
  getBiomeFramework(): BiomeFramework {
    return this.terrainSubsystem.getBiomeFramework();
  }

  /**
   * Get simplified scatter configurations for a specific biome.
   */
  getBiomeScatterConfigs(biomeType: string): BiomeScatterConfig[] {
    return getScatterConfigForBiome(biomeType);
  }

  /**
   * Get all per-scatter-type density masks generated during biome classification.
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

  // -----------------------------------------------------------------------
  // Private helpers
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
}
