/**
 * BiomeSystem.ts
 * Core biome type definitions, Whittaker diagram classification, and system wrapper.
 *
 * Provides:
 * - Temperature map generation (latitude, altitude, distance-to-water, noise)
 * - Moisture map generation (distance-to-water, altitude, wind direction noise, noise)
 * - Whittaker diagram biome classification from temperature × moisture axes
 * - 2D grid biome classification matching terrain resolution
 * - Legacy compatibility layer for BiomeFramework
 */

import * as THREE from 'three';
import { BiomeFramework as CoreBiomeFramework } from './BiomeFramework';
import { SeededNoiseGenerator } from '../../../core/util/math/noise';

// ============================================================================
// Type Definitions (exported for use across the codebase)
// ============================================================================

export interface BiomeDefinition {
  id: string;
  name: string;
  elevationRange?: [number, number];
  slopeRange?: [number, number];
  temperatureRange?: [number, number];
  moistureRange?: [number, number];
  primaryAssets?: string[];
  secondaryAssets?: string[];
  groundMaterial?: string;
  vegetationDensity?: number;
  colorPrimary?: THREE.Color;
  colorSecondary?: THREE.Color;
  climate?: {
    temperature: number;
    humidity: number;
  };
  assetTags?: string[];
}

export interface BiomeBlend {
  primaryBiome?: BiomeDefinition | null;
  secondaryBiome?: BiomeDefinition;
  blendFactor: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  biomes: BiomeDefinition[];
  weights: number[];
  transitionFactor: number;
}

/**
 * Core biome types from the Whittaker diagram classification.
 * The R3F port uses these 9 primary biome types plus legacy aliases.
 */
export type BiomeType =
  // Primary Whittaker biome types (task specification)
  | 'desert'
  | 'savanna'
  | 'tropical_forest'
  | 'temperate_forest'
  | 'boreal_forest'
  | 'tundra'
  | 'ocean'
  | 'coast'
  | 'mountain'
  // Legacy aliases (backward compatibility)
  | 'tundra'           // same
  | 'taiga'            // alias for boreal_forest
  | 'temperate_forest' // same
  | 'tropical_rainforest' // alias for tropical_forest
  | 'grassland'        // between savanna and temperate_forest
  | 'alpine'           // alias for mountain
  | 'wetland'          // special moisture-dominated biome
  | 'coastal';         // alias for coast

export interface BiomeConfig {
  transitionWidth: number;
  blendMode: 'linear' | 'smooth' | 'stepped';
  enableElevationConstraints: boolean;
  enableSlopeConstraints: boolean;
  assetDensityMultiplier: number;
}

// ============================================================================
// Whittaker Diagram Configuration
// ============================================================================

/**
 * Temperature and moisture ranges for each biome in the Whittaker classification.
 * Temperature is 0-1 (cold to hot), moisture is 0-1 (dry to wet).
 *
 * Based on the real Whittaker diagram:
 *   - High temp + low moisture → desert
 *   - High temp + medium moisture → savanna
 *   - High temp + high moisture → tropical_forest
 *   - Medium temp + medium-high moisture → temperate_forest
 *   - Low temp + medium-high moisture → boreal_forest
 *   - Very low temp + any moisture → tundra
 *   - Below sea level → ocean
 *   - Near sea level + low altitude → coast
 *   - High altitude + steep slope → mountain
 */
export interface WhittakerZone {
  biomeType: BiomeType;
  tempMin: number;
  tempMax: number;
  moistureMin: number;
  moistureMax: number;
  /** Optional altitude constraint (0-1 normalized height) */
  altitudeMin?: number;
  altitudeMax?: number;
  /** Priority for overlapping zones (higher wins) */
  priority: number;
}

/**
 * Standard Whittaker diagram zones for biome classification.
 * Temperature: 0 = polar cold, 1 = equatorial hot
 * Moisture: 0 = arid desert, 1 = saturated rainforest
 */
const WHITTAKER_ZONES: WhittakerZone[] = [
  // Ocean — below sea level, overrides everything
  { biomeType: 'ocean',     tempMin: 0,   tempMax: 1,   moistureMin: 0,   moistureMax: 1,   priority: 100 },

  // Coast — near sea level (handled separately by altitude check)
  { biomeType: 'coast',     tempMin: 0,   tempMax: 1,   moistureMin: 0,   moistureMax: 1,   priority: 90 },

  // Mountain — high altitude (handled separately by altitude + slope check)
  { biomeType: 'mountain',  tempMin: 0,   tempMax: 1,   moistureMin: 0,   moistureMax: 1,   priority: 80 },

  // Hot + Dry → Desert
  { biomeType: 'desert',    tempMin: 0.65, tempMax: 1.0, moistureMin: 0,   moistureMax: 0.25, priority: 10 },

  // Hot + Medium-low moisture → Savanna
  { biomeType: 'savanna',   tempMin: 0.6,  tempMax: 1.0, moistureMin: 0.2, moistureMax: 0.5,  priority: 8 },

  // Hot + High moisture → Tropical Forest
  { biomeType: 'tropical_forest', tempMin: 0.65, tempMax: 1.0, moistureMin: 0.5, moistureMax: 1.0, priority: 10 },

  // Medium temp + Medium-high moisture → Temperate Forest
  { biomeType: 'temperate_forest', tempMin: 0.3, tempMax: 0.65, moistureMin: 0.4, moistureMax: 1.0, priority: 10 },

  // Low temp + Medium-high moisture → Boreal Forest (Taiga)
  { biomeType: 'boreal_forest', tempMin: 0.1, tempMax: 0.35, moistureMin: 0.3, moistureMax: 1.0, priority: 10 },

  // Very low temp → Tundra (overrides boreal at extreme cold)
  { biomeType: 'tundra',    tempMin: 0,   tempMax: 0.15, moistureMin: 0,   moistureMax: 1.0,  priority: 15 },

  // Medium temp + low moisture → Grassland (between desert and temperate forest)
  { biomeType: 'grassland', tempMin: 0.3,  tempMax: 0.7, moistureMin: 0.15, moistureMax: 0.45, priority: 5 },

  // Wetland — high moisture + moderate temp + low altitude (override)
  { biomeType: 'wetland',   tempMin: 0.2,  tempMax: 0.8, moistureMin: 0.85, moistureMax: 1.0,  priority: 20 },
];

// ============================================================================
// Temperature & Moisture Map Generation
// ============================================================================

/**
 * Configuration for generating temperature and moisture maps.
 */
export interface ClimateMapConfig {
  /** Seed for deterministic noise generation */
  seed: number;
  /** Width of the terrain grid */
  width: number;
  /** Height of the terrain grid */
  height: number;
  /** Sea level (0-1 normalized height) */
  seaLevel: number;
  /** How much altitude reduces temperature (0-1, higher = more reduction) */
  altitudeLapseRate: number;
  /** Noise scale for temperature variation */
  temperatureNoiseScale: number;
  /** Noise scale for moisture variation */
  moistureNoiseScale: number;
  /** Wind direction for moisture transport (normalized) */
  windDirection: THREE.Vector2;
  /** How much wind affects moisture (0-1) */
  windInfluence: number;
  /** Distance-to-water influence on moisture (0-1) */
  waterMoistureInfluence: number;
  /** Distance-to-water influence on temperature (0-1) */
  waterTemperatureInfluence: number;
  /** World-space width of the terrain (for latitude calculation) */
  worldWidth: number;
  /** World-space height of the terrain (for latitude calculation) */
  worldHeight: number;
}

const DEFAULT_CLIMATE_MAP_CONFIG: ClimateMapConfig = {
  seed: 42,
  width: 512,
  height: 512,
  seaLevel: 0.3,
  altitudeLapseRate: 0.6,
  temperatureNoiseScale: 3.0,
  moistureNoiseScale: 4.0,
  windDirection: new THREE.Vector2(1, 0.3).normalize(),
  windInfluence: 0.3,
  waterMoistureInfluence: 0.5,
  waterTemperatureInfluence: 0.15,
  worldWidth: 200,
  worldHeight: 200,
};

// ============================================================================
// Biome Grid Result
// ============================================================================

/**
 * Result of biome classification for a terrain grid.
 */
export interface BiomeGrid {
  /** Primary biome type at each cell (width × height) */
  biomeIds: Uint8Array;
  /** Temperature value at each cell (0-1, width × height) */
  temperature: Float32Array;
  /** Moisture value at each cell (0-1, width × height) */
  moisture: Float32Array;
  /** Grid dimensions */
  width: number;
  height: number;
  /** Mapping from biome ID index to BiomeType string */
  biomeIndexToType: BiomeType[];
  /** Mapping from BiomeType string to biome ID index */
  biomeTypeToIndex: Map<string, number>;
  /** Blend weights for each cell — for each cell, an array of {biomeType, weight} */
  blendWeights: Array<Array<{ biomeType: BiomeType; weight: number }>>;
}

// ============================================================================
// BiomeSystem Wrapper Class
// ============================================================================

export class BiomeSystem {
  private framework: CoreBiomeFramework;
  private config: BiomeConfig;
  private noiseGen: SeededNoiseGenerator;
  private moistureNoiseGen: SeededNoiseGenerator;
  private climateConfig: ClimateMapConfig;

  /** Cached biome type → index mapping */
  private biomeTypeToIndex: Map<string, number>;
  private biomeIndexToType: BiomeType[];

  constructor(transitionWidth: number = 0.3, seed: number = 42) {
    this.framework = new CoreBiomeFramework();
    this.config = {
      transitionWidth,
      blendMode: 'smooth',
      enableElevationConstraints: true,
      enableSlopeConstraints: true,
      assetDensityMultiplier: 1.0,
    };
    this.noiseGen = new SeededNoiseGenerator(seed);
    this.moistureNoiseGen = new SeededNoiseGenerator(seed + 1000);
    this.climateConfig = { ...DEFAULT_CLIMATE_MAP_CONFIG, seed };

    // Build biome type index mapping
    this.biomeTypeToIndex = new Map();
    this.biomeIndexToType = [];
    this.buildBiomeIndex();
  }

  // --------------------------------------------------------------------------
  // Biome Index Management
  // --------------------------------------------------------------------------

  private buildBiomeIndex(): void {
    const uniqueTypes: BiomeType[] = [
      'desert', 'savanna', 'tropical_forest', 'temperate_forest',
      'boreal_forest', 'tundra', 'ocean', 'coast', 'mountain',
      'grassland', 'wetland',
      // Legacy aliases
      'taiga', 'tropical_rainforest', 'alpine', 'coastal',
    ];

    this.biomeIndexToType = uniqueTypes;
    this.biomeTypeToIndex = new Map();
    uniqueTypes.forEach((type, idx) => {
      this.biomeTypeToIndex.set(type, idx);
    });
  }

  /**
   * Get the numeric index for a biome type.
   */
  getBiomeIndex(biomeType: BiomeType): number {
    return this.biomeTypeToIndex.get(biomeType) ?? 0;
  }

  /**
   * Get the biome type string for a numeric index.
   */
  getBiomeType(index: number): BiomeType {
    return this.biomeIndexToType[index] ?? 'desert';
  }

  // --------------------------------------------------------------------------
  // Temperature Map Generation
  // --------------------------------------------------------------------------

  /**
   * Generate a temperature map from terrain data.
   *
   * Temperature is driven by:
   * 1. Latitude — distance from equator (center of map = hot, edges = cold)
   * 2. Altitude — higher elevation = lower temperature (lapse rate)
   * 3. Distance-to-water — water bodies moderate temperature
   * 4. Noise — local variation for natural patterns
   *
   * @param heightMap - Normalized height map (0-1)
   * @param width - Grid width
   * @param height - Grid height
   * @param config - Climate map configuration overrides
   * @returns Temperature map (0 = cold, 1 = hot)
   */
  generateTemperatureMap(
    heightMap: Float32Array,
    width: number,
    height: number,
    config?: Partial<ClimateMapConfig>
  ): Float32Array {
    const cfg = { ...this.climateConfig, ...config };
    const tempMap = new Float32Array(width * height);
    const noiseGen = new SeededNoiseGenerator(cfg.seed + 100);

    const halfH = height / 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const h = heightMap[idx];

        // 1. Latitude effect: equator (center) is hot, poles (edges) are cold
        // Normalized distance from equator: 0 at center, 1 at edges
        const latDist = Math.abs(y - halfH) / halfH;
        const latitudeTemp = 1.0 - latDist; // 1 at equator, 0 at poles

        // 2. Altitude lapse rate: temperature decreases with height
        // Above sea level, apply lapse rate; below sea level stays warm
        const aboveSeaLevel = Math.max(0, h - cfg.seaLevel);
        const aboveRange = 1.0 - cfg.seaLevel;
        const normalizedAltitude = aboveRange > 0 ? aboveSeaLevel / aboveRange : 0;
        const altitudeTemp = 1.0 - normalizedAltitude * cfg.altitudeLapseRate;

        // 3. Distance-to-water moderation: areas near water have milder temperatures
        // Simple approximation: low-lying areas near sea level get moderated
        const waterProximity = Math.max(0, 1.0 - Math.abs(h - cfg.seaLevel) * 10);
        const waterTempBoost = waterProximity * cfg.waterTemperatureInfluence * 0.5;

        // 4. Noise variation for natural temperature patterns
        const nx = (x / width) * cfg.temperatureNoiseScale;
        const ny = (y / height) * cfg.temperatureNoiseScale;
        const noiseVal = noiseGen.fbm(nx, ny, 0, { octaves: 4, gain: 0.5, scale: 1.0 });
        const noiseTemp = noiseVal * 0.15; // ±0.15 variation

        // Combine: weighted blend of all factors
        let temperature = latitudeTemp * 0.45 + altitudeTemp * 0.35 + noiseTemp + waterTempBoost;

        // Clamp to [0, 1]
        tempMap[idx] = Math.max(0, Math.min(1, temperature));
      }
    }

    return tempMap;
  }

  // --------------------------------------------------------------------------
  // Moisture Map Generation
  // --------------------------------------------------------------------------

  /**
   * Generate a moisture map from terrain data.
   *
   * Moisture is driven by:
   * 1. Distance-to-water — areas near water bodies are wetter
   * 2. Altitude — windward slopes get more precipitation (orographic effect)
   * 3. Wind direction noise — moisture carried by prevailing winds
   * 4. Noise — local variation for natural patterns
   *
   * @param heightMap - Normalized height map (0-1)
   * @param width - Grid width
   * @param height - Grid height
   * @param config - Climate map configuration overrides
   * @returns Moisture map (0 = dry, 1 = wet)
   */
  generateMoistureMap(
    heightMap: Float32Array,
    width: number,
    height: number,
    config?: Partial<ClimateMapConfig>
  ): Float32Array {
    const cfg = { ...this.climateConfig, ...config };
    const moistMap = new Float32Array(width * height);
    const noiseGen = new SeededNoiseGenerator(cfg.seed + 200);

    // Pre-compute a simplified distance-to-water map
    // "Water" = cells at or below sea level
    const distToWater = this.computeDistanceToWater(heightMap, width, height, cfg.seaLevel);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const h = heightMap[idx];

        // 1. Distance-to-water: closer to water = more moisture
        const maxDist = Math.sqrt(width * width + height * height) * 0.5;
        const normalizedDist = Math.min(1, distToWater[idx] / maxDist);
        const waterMoisture = (1.0 - normalizedDist) * cfg.waterMoistureInfluence;

        // 2. Altitude effect: orographic precipitation on windward slopes
        // Wind carries moisture; when it hits mountains, it drops rain
        const wind = cfg.windDirection;
        // Sample height slightly upwind to detect slope
        const upwindX = x - wind.x * 3;
        const upwindY = y - wind.y * 3;
        const upwindIdx = Math.max(0, Math.min(height - 1, Math.floor(upwindY))) * width
          + Math.max(0, Math.min(width - 1, Math.floor(upwindX)));
        const upwindH = heightMap[upwindIdx] ?? h;
        const slopeIntoWind = Math.max(0, h - upwindH); // Positive = rising into wind
        const orographicMoisture = Math.min(0.4, slopeIntoWind * 5 * cfg.windInfluence);

        // 3. Wind direction noise: moisture carried by prevailing winds
        // Areas downwind of water get more moisture
        const windNx = (x / width) * cfg.moistureNoiseScale + wind.x * 2;
        const windNy = (y / height) * cfg.moistureNoiseScale + wind.y * 2;
        const windNoise = noiseGen.fbm(windNx, windNy, 0.5, { octaves: 4, gain: 0.5, scale: 1.0 });
        const windMoisture = (windNoise * 0.5 + 0.5) * cfg.windInfluence;

        // 4. Base noise variation
        const nx = (x / width) * cfg.moistureNoiseScale;
        const ny = (y / height) * cfg.moistureNoiseScale;
        const baseNoise = noiseGen.fbm(nx + 100, ny + 100, 0, { octaves: 5, gain: 0.5, scale: 1.0 });
        const noiseMoisture = baseNoise * 0.2;

        // 5. Rain shadow effect: areas behind mountains (downwind) are drier
        const downwindX = x + wind.x * 5;
        const downwindY = y + wind.y * 5;
        const downwindIdx = Math.max(0, Math.min(height - 1, Math.floor(downwindY))) * width
          + Math.max(0, Math.min(width - 1, Math.floor(downwindX)));
        const downwindH = heightMap[downwindIdx] ?? h;
        const slopeAwayFromWind = Math.max(0, downwindH - h); // Positive = descending away from wind
        const rainShadow = -slopeAwayFromWind * 3 * cfg.windInfluence;

        // Combine: weighted blend
        let moisture = waterMoisture + orographicMoisture + windMoisture * 0.3 + noiseMoisture + rainShadow;

        // Add base moisture level (even deserts have some minimal moisture)
        moisture = 0.15 + moisture * 0.85;

        // Clamp to [0, 1]
        moistMap[idx] = Math.max(0, Math.min(1, moisture));
      }
    }

    return moistMap;
  }

  // --------------------------------------------------------------------------
  // Distance-to-Water Computation
  // --------------------------------------------------------------------------

  /**
   * Compute approximate distance from each cell to the nearest water cell.
   * Uses a multi-pass approximation rather than full BFS for performance.
   *
   * @param heightMap - Normalized height map
   * @param width - Grid width
   * @param height - Grid height
   * @param seaLevel - Height below which is water
   * @returns Distance map (0 = at water, increasing = further from water)
   */
  private computeDistanceToWater(
    heightMap: Float32Array,
    width: number,
    height: number,
    seaLevel: number
  ): Float32Array {
    const dist = new Float32Array(width * height);
    const INF = width + height; // Large initial value

    // Initialize: water cells = 0, land cells = INF
    for (let i = 0; i < heightMap.length; i++) {
      dist[i] = heightMap[i] <= seaLevel ? 0 : INF;
    }

    // Forward pass (top-left to bottom-right)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (dist[idx] === 0) continue;

        let minDist = dist[idx];
        // Check 4-connected neighbors that have already been processed
        if (x > 0) minDist = Math.min(minDist, dist[idx - 1] + 1);
        if (y > 0) minDist = Math.min(minDist, dist[(y - 1) * width + x] + 1);
        if (x > 0 && y > 0) minDist = Math.min(minDist, dist[(y - 1) * width + (x - 1)] + 1.414);
        if (x < width - 1 && y > 0) minDist = Math.min(minDist, dist[(y - 1) * width + (x + 1)] + 1.414);

        dist[idx] = minDist;
      }
    }

    // Backward pass (bottom-right to top-left)
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const idx = y * width + x;
        if (dist[idx] === 0) continue;

        let minDist = dist[idx];
        if (x < width - 1) minDist = Math.min(minDist, dist[idx + 1] + 1);
        if (y < height - 1) minDist = Math.min(minDist, dist[(y + 1) * width + x] + 1);
        if (x < width - 1 && y < height - 1) minDist = Math.min(minDist, dist[(y + 1) * width + (x + 1)] + 1.414);
        if (x > 0 && y < height - 1) minDist = Math.min(minDist, dist[(y + 1) * width + (x - 1)] + 1.414);

        dist[idx] = minDist;
      }
    }

    return dist;
  }

  // --------------------------------------------------------------------------
  // Whittaker Biome Classification
  // --------------------------------------------------------------------------

  /**
   * Classify a single cell into a biome type using the Whittaker diagram.
   *
   * @param temperature - 0 (cold) to 1 (hot)
   * @param moisture - 0 (dry) to 1 (wet)
   * @param altitude - Normalized height 0-1
   * @param slope - Normalized slope 0-1
   * @param seaLevel - Sea level threshold
   * @returns The classified BiomeType
   */
  classifyBiome(
    temperature: number,
    moisture: number,
    altitude: number,
    slope: number,
    seaLevel: number
  ): BiomeType {
    // 1. Ocean: below sea level
    if (altitude <= seaLevel) {
      // Deep ocean vs shallow coast
      if (altitude >= seaLevel - 0.05) {
        return 'ocean'; // Shallow ocean still counts as ocean for classification
      }
      return 'ocean';
    }

    // 2. Coast: near sea level (within a narrow band above water)
    const coastBand = 0.08; // 8% of height range above sea level
    if (altitude > seaLevel && altitude <= seaLevel + coastBand && slope < 0.3) {
      return 'coast';
    }

    // 3. Mountain: high altitude or steep slopes
    const mountainAltitude = 0.75; // Above 75% of height range
    const steepSlope = 0.5;
    if ((altitude >= mountainAltitude && slope >= steepSlope * 0.5) || slope >= steepSlope) {
      // At very high altitude with cold temps → mountain (even if not steep)
      if (altitude >= 0.85 || slope >= 0.6) {
        return 'mountain';
      }
    }

    // 4. Whittaker diagram: classify by temperature × moisture
    let bestBiome: BiomeType = 'grassland'; // Default fallback
    let bestPriority = -1;
    let bestAffinity = -1;

    for (const zone of WHITTAKER_ZONES) {
      // Skip special zones that were already handled
      if (zone.priority >= 80) continue; // ocean, coast, mountain

      // Check if temperature and moisture fall within this zone
      const tempInRange = temperature >= zone.tempMin && temperature <= zone.tempMax;
      const moistInRange = moisture >= zone.moistureMin && moisture <= zone.moistureMax;

      if (tempInRange && moistInRange) {
        // Compute affinity: how close to the center of the zone
        const tempCenter = (zone.tempMin + zone.tempMax) / 2;
        const moistCenter = (zone.moistureMin + zone.moistureMax) / 2;
        const tempHalfRange = (zone.tempMax - zone.tempMin) / 2;
        const moistHalfRange = (zone.moistureMax - zone.moistureMin) / 2;

        const tempDist = tempHalfRange > 0 ? 1.0 - Math.abs(temperature - tempCenter) / tempHalfRange : 1;
        const moistDist = moistHalfRange > 0 ? 1.0 - Math.abs(moisture - moistCenter) / moistHalfRange : 1;
        const affinity = tempDist * moistDist;

        if (zone.priority > bestPriority || (zone.priority === bestPriority && affinity > bestAffinity)) {
          bestPriority = zone.priority;
          bestAffinity = affinity;
          bestBiome = zone.biomeType;
        }
      }
    }

    return bestBiome;
  }

  // --------------------------------------------------------------------------
  // Full Biome Grid Generation
  // --------------------------------------------------------------------------

  /**
   * Generate a complete biome grid from terrain height and slope data.
   *
   * This replaces the old 25-line inline height/slope lookup with a proper
   * Whittaker diagram approach using temperature and moisture maps.
   *
   * @param heightMap - Normalized height values (0-1), width × height
   * @param slopeMap - Normalized slope values (0-1), width × height
   * @param width - Grid width
   * @param height - Grid height
   * @param config - Climate map configuration overrides
   * @returns Complete BiomeGrid with biome IDs, temperature, moisture, and blend weights
   */
  generateBiomeGrid(
    heightMap: Float32Array,
    slopeMap: Float32Array,
    width: number,
    height: number,
    config?: Partial<ClimateMapConfig>
  ): BiomeGrid {
    const cfg = { ...this.climateConfig, ...config };

    // Generate temperature and moisture maps
    const temperature = this.generateTemperatureMap(heightMap, width, height, cfg);
    const moisture = this.generateMoistureMap(heightMap, width, height, cfg);

    // Classify each cell
    const biomeIds = new Uint8Array(width * height);
    const blendWeights: Array<Array<{ biomeType: BiomeType; weight: number }>> = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const h = heightMap[idx];
        const s = slopeMap[idx];
        const temp = temperature[idx];
        const moist = moisture[idx];

        // Classify primary biome
        const biomeType = this.classifyBiome(temp, moist, h, s, cfg.seaLevel);
        const biomeIdx = this.biomeTypeToIndex.get(biomeType) ?? 0;
        biomeIds[idx] = biomeIdx;

        // Compute blend weights for smooth transitions
        // For each cell, compute influence from neighboring biomes
        const weights = this.computeBlendWeights(temp, moist, h, s, cfg.seaLevel);
        blendWeights.push(weights);
      }
    }

    return {
      biomeIds,
      temperature,
      moisture,
      width,
      height,
      biomeIndexToType: [...this.biomeIndexToType],
      biomeTypeToIndex: new Map(this.biomeTypeToIndex),
      blendWeights,
    };
  }

  /**
   * Compute blend weights for a single cell based on its climate parameters.
   * Produces a weighted mix of nearby biomes for smooth transitions.
   */
  private computeBlendWeights(
    temperature: number,
    moisture: number,
    altitude: number,
    slope: number,
    seaLevel: number
  ): Array<{ biomeType: BiomeType; weight: number }> {
    const contributions: Array<{ biomeType: BiomeType; weight: number }> = [];

    // Check all Whittaker zones plus special zones
    const allZones = [...WHITTAKER_ZONES];

    // Add special zones based on altitude
    if (altitude <= seaLevel) {
      contributions.push({ biomeType: 'ocean', weight: 1.0 });
      return contributions;
    }

    if (altitude > seaLevel && altitude <= seaLevel + 0.08 && slope < 0.3) {
      // Coast zone with transition
      const coastWeight = 1.0 - Math.max(0, (altitude - seaLevel) / 0.08);
      contributions.push({ biomeType: 'coast', weight: Math.max(0.3, coastWeight) });
    }

    if (altitude >= 0.75 || slope >= 0.5) {
      const mountainWeight = Math.min(1.0, Math.max(0, (altitude - 0.6) / 0.25) + Math.max(0, (slope - 0.3) / 0.4));
      if (mountainWeight > 0) {
        contributions.push({ biomeType: 'mountain', weight: mountainWeight });
      }
    }

    // Whittaker zone contributions
    for (const zone of allZones) {
      if (zone.priority >= 80) continue; // Skip special zones

      // Compute Gaussian-like falloff from zone center
      const tempCenter = (zone.tempMin + zone.tempMax) / 2;
      const moistCenter = (zone.moistureMin + zone.moistureMax) / 2;
      const tempSigma = (zone.tempMax - zone.tempMin) / 2;
      const moistSigma = (zone.moistureMax - zone.moistureMin) / 2;

      if (tempSigma <= 0 || moistSigma <= 0) continue;

      const tempFalloff = Math.exp(-0.5 * Math.pow((temperature - tempCenter) / (tempSigma * 1.5), 2));
      const moistFalloff = Math.exp(-0.5 * Math.pow((moisture - moistCenter) / (moistSigma * 1.5), 2));

      const weight = tempFalloff * moistFalloff;
      if (weight > 0.05) {
        contributions.push({ biomeType: zone.biomeType, weight });
      }
    }

    // Normalize weights
    const totalWeight = contributions.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight > 0) {
      for (const c of contributions) {
        c.weight /= totalWeight;
      }
    } else {
      // Fallback: pure classification
      const primary = this.classifyBiome(temperature, moisture, altitude, slope, seaLevel);
      contributions.push({ biomeType: primary, weight: 1.0 });
    }

    // Sort by weight descending
    contributions.sort((a, b) => b.weight - a.weight);

    return contributions;
  }

  // --------------------------------------------------------------------------
  // Simple Biome Mask Generation (backward compatible)
  // --------------------------------------------------------------------------

  /**
   * Generate a simple biome mask compatible with the old TerrainGenerator format.
   * Returns a Uint8Array where each value is a biome ID index.
   *
   * This is the drop-in replacement for TerrainGenerator.generateBiomeMask().
   */
  generateBiomeMask(
    heightMap: Float32Array,
    slopeMap: Float32Array,
    width: number,
    height: number,
    seaLevel: number = 0.3
  ): Uint8Array {
    const grid = this.generateBiomeGrid(heightMap, slopeMap, width, height, { seaLevel });
    return grid.biomeIds;
  }

  // --------------------------------------------------------------------------
  // Legacy BiomeSystem API (backward compatibility)
  // --------------------------------------------------------------------------

  /**
   * Initialize the biome system with definitions and transition zones
   */
  initialize(biomes: BiomeDefinition[], zones?: Array<{
    startBiome: string;
    endBiome: string;
    blendWidth: number;
    elevationRange?: [number, number];
    slopeRange?: [number, number];
  }>): void {
    const translatedZones = zones?.map(z => ({
      startBiome: z.startBiome,
      endBiome: z.endBiome,
      blendWidth: z.blendWidth,
      elevationRange: z.elevationRange,
      slopeRange: z.slopeRange,
    })) || [];

    this.framework.initialize(biomes, translatedZones);
  }

  /**
   * Get biome blend at a specific position
   */
  getBiomeBlend(position: THREE.Vector3, normal: THREE.Vector3): BiomeBlend {
    return this.framework.getBiomeBlend(position, normal);
  }

  /**
   * Scatter assets based on biome constraints
   */
  scatterAssets(
    area: { min: THREE.Vector3; max: THREE.Vector3 },
    position: THREE.Vector3,
    normal: THREE.Vector3,
    heightMap?: (x: number, z: number) => number,
    normalMap?: (x: number, z: number) => THREE.Vector3
  ): any[] {
    return this.framework.scatterAssets(area, position, normal, heightMap, normalMap);
  }

  /**
   * Add an asset to the scattering pool
   */
  addAssetToPool(assetId: string, metadata: any): void {
    this.framework.addAssetToPool(assetId, metadata);
  }

  /**
   * Create a gradient of biome blends between two points
   */
  createTransitionGradient(
    start: THREE.Vector3,
    end: THREE.Vector3,
    steps: number = 10
  ): BiomeBlend[] {
    return this.framework.createTransitionGradient(start, end, steps);
  }

  /**
   * Get current configuration
   */
  getConfig(): BiomeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<BiomeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // --------------------------------------------------------------------------
  // Climate Map Configuration
  // --------------------------------------------------------------------------

  /**
   * Get the current climate map configuration.
   */
  getClimateConfig(): ClimateMapConfig {
    return { ...this.climateConfig };
  }

  /**
   * Update climate map configuration.
   */
  updateClimateConfig(updates: Partial<ClimateMapConfig>): void {
    this.climateConfig = { ...this.climateConfig, ...updates };
    if (updates.seed !== undefined) {
      this.noiseGen = new SeededNoiseGenerator(updates.seed);
      this.moistureNoiseGen = new SeededNoiseGenerator(updates.seed + 1000);
    }
  }

  // --------------------------------------------------------------------------
  // Utility: Map BiomeType to legacy names
  // --------------------------------------------------------------------------

  /**
   * Convert a task-specified BiomeType to the legacy BiomeType name
   * used in BiomeScatterMapping profiles.
   */
  static toLegacyBiomeType(biomeType: BiomeType): string {
    const mapping: Partial<Record<BiomeType, string>> = {
      'boreal_forest': 'taiga',
      'tropical_forest': 'tropical_rainforest',
      'mountain': 'alpine',
      'coast': 'coastal',
    };
    return mapping[biomeType] ?? biomeType;
  }

  /**
   * Convert a legacy BiomeType name to the task-specified equivalent.
   */
  static fromLegacyBiomeType(legacyType: string): BiomeType {
    const mapping: Record<string, BiomeType> = {
      'taiga': 'boreal_forest',
      'tropical_rainforest': 'tropical_forest',
      'alpine': 'mountain',
      'coastal': 'coast',
    };
    return mapping[legacyType] ?? legacyType as BiomeType;
  }
}

export default BiomeSystem;
