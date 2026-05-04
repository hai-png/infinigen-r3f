/**
 * LandTileSystem.ts
 *
 * Tile-based terrain system with heightmaps and biome interpolation.
 * Provides the backbone for tile-based terrain variety, mirroring the
 * original Infinigen LandLab integration with erosion/snowfall/eruption
 * processes and tile-based terrain with biome-weighted interpolation.
 *
 * Key components:
 * - LandTile: A single terrain tile with heightmap + biome weights
 * - LandTileGenerator: Generates individual tiles using FBM noise + biome modifiers
 * - LandTileComposer: Composes multiple tiles into a seamless BufferGeometry
 * - LandProcessManager: Applies LandLab-style processes (erosion, snowfall, eruption)
 * - LandTileSystem: Main entry point orchestrating tile generation, composition, and LOD
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm, seededNoise2D, seededRidgedMultifractal } from '../../core/util/MathUtils';
import type { BiomeDefinition, BiomeBlend } from '../biomes/core/BiomeSystem';
import { BiomeInterpolator } from '../biomes/core/BiomeFramework';
import { HydraulicErosionProcess, ThermalWeatheringProcess, SedimentTransportProcess } from '../land-process';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Represents a single terrain tile with its heightmap, biome weights, and metadata.
 */
export interface LandTile {
  /** Unique identifier for the tile */
  id: string;
  /** World-space X position of the tile origin */
  x: number;
  /** World-space Z position of the tile origin */
  z: number;
  /** Side length of the tile in world units */
  size: number;
  /** NxN height values stored as a flat Float32Array (row-major: row * resolution + col) */
  heightmap: Float32Array;
  /** Heightmap grid resolution (number of samples per side) */
  resolution: number;
  /** Biome blend weights keyed by biome ID */
  biomeWeights: Map<string, number>;
  /** Whether hydraulic erosion has been applied */
  erosionApplied: boolean;
  /** List of land process names that have been applied */
  processesApplied: string[];
}

/**
 * Configuration for biome-specific height modification.
 */
export interface BiomeHeightConfig {
  /** Biome ID this config applies to */
  biomeId: string;
  /** Base elevation offset added to the heightmap */
  baseElevation: number;
  /** Amplitude multiplier for noise (mountains = high, plains = low) */
  amplitudeScale: number;
  /** Frequency multiplier for noise detail */
  frequencyScale: number;
  /** Ridged noise contribution (for mountain ridges) */
  ridgedContribution: number;
  /** Terrace effect strength (for stepped terrain) */
  terraceStrength: number;
}

/**
 * Configuration for the LandTileGenerator.
 */
export interface LandTileGeneratorConfig {
  /** Default heightmap resolution per tile */
  defaultResolution: number;
  /** Base noise amplitude */
  amplitude: number;
  /** Base noise frequency */
  frequency: number;
  /** Number of FBM octaves */
  octaves: number;
  /** Lacunarity for FBM */
  lacunarity: number;
  /** Persistence (gain) for FBM */
  persistence: number;
  /** Global seed for deterministic generation */
  seed: number;
  /** Sea level (0-1 normalized height) */
  seaLevel: number;
  /** Height multiplier in world units */
  heightScale: number;
}

/**
 * Configuration for the LandTileComposer.
 */
export interface LandTileComposerConfig {
  /** Width (in world units) of the blending zone at tile edges */
  blendWidth: number;
  /** Blend interpolation method */
  blendMethod: 'cosine' | 'hermite' | 'linear';
  /** Whether to generate vertex colors based on biome weights */
  generateVertexColors: boolean;
  /** Whether to compute normals */
  computeNormals: boolean;
  /** Whether to generate UVs */
  generateUVs: boolean;
}

/**
 * Parameters for hydraulic erosion process.
 */
export interface TileErosionParams {
  /** Number of droplet iterations */
  iterations: number;
  /** Erosion strength (0-1) */
  strength: number;
  /** Whether erosion is enabled */
  enabled: boolean;
}

/**
 * Parameters for snowfall accumulation process.
 */
export interface TileSnowfallParams {
  /** Snow accumulation threshold (height above which snow accumulates) */
  snowLine: number;
  /** Maximum snow depth */
  maxDepth: number;
  /** Snow smoothing iterations */
  smoothingPasses: number;
  /** Whether snowfall is enabled */
  enabled: boolean;
}

/**
 * Parameters for volcanic eruption deformation process.
 */
export interface TileEruptionParams {
  /** Number of volcanic vents to create */
  ventCount: number;
  /** Maximum crater radius */
  maxCraterRadius: number;
  /** Maximum crater depth */
  maxCraterDepth: number;
  /** Maximum lava flow distance from vent */
  lavaFlowDistance: number;
  /** Lava flow height above terrain */
  lavaFlowHeight: number;
  /** Whether eruptions are enabled */
  enabled: boolean;
}

/**
 * Configuration for the LandTileSystem.
 */
export interface LandTileSystemConfig {
  /** Tile generator configuration */
  generator: Partial<LandTileGeneratorConfig>;
  /** Tile composer configuration */
  composer: Partial<LandTileComposerConfig>;
  /** Erosion process parameters */
  erosion: Partial<TileErosionParams>;
  /** Snowfall process parameters */
  snowfall: Partial<TileSnowfallParams>;
  /** Eruption process parameters */
  eruption: Partial<TileEruptionParams>;
  /** Biome height configurations */
  biomeHeights: BiomeHeightConfig[];
  /** Whether to auto-apply erosion during generation */
  autoErosion: boolean;
  /** LOD distance thresholds (ascending) */
  lodDistances: number[];
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_GENERATOR_CONFIG: LandTileGeneratorConfig = {
  defaultResolution: 64,
  amplitude: 1.0,
  frequency: 0.02,
  octaves: 6,
  lacunarity: 2.0,
  persistence: 0.5,
  seed: 42,
  seaLevel: 0.3,
  heightScale: 30,
};

const DEFAULT_COMPOSER_CONFIG: LandTileComposerConfig = {
  blendWidth: 0.15,
  blendMethod: 'cosine',
  generateVertexColors: true,
  computeNormals: true,
  generateUVs: true,
};

const DEFAULT_EROSION_PARAMS: TileErosionParams = {
  iterations: 100,
  strength: 0.5,
  enabled: true,
};

const DEFAULT_SNOWFALL_PARAMS: TileSnowfallParams = {
  snowLine: 0.75,
  maxDepth: 0.15,
  smoothingPasses: 3,
  enabled: true,
};

const DEFAULT_ERUPTION_PARAMS: TileEruptionParams = {
  ventCount: 2,
  maxCraterRadius: 8,
  maxCraterDepth: 0.3,
  lavaFlowDistance: 20,
  lavaFlowHeight: 0.1,
  enabled: true,
};

/** Default biome height configurations for 6 standard biome types */
const DEFAULT_BIOME_HEIGHTS: BiomeHeightConfig[] = [
  {
    biomeId: 'mountain',
    baseElevation: 0.6,
    amplitudeScale: 2.5,
    frequencyScale: 1.0,
    ridgedContribution: 0.8,
    terraceStrength: 0.0,
  },
  {
    biomeId: 'plains',
    baseElevation: 0.25,
    amplitudeScale: 0.3,
    frequencyScale: 0.5,
    ridgedContribution: 0.0,
    terraceStrength: 0.0,
  },
  {
    biomeId: 'desert',
    baseElevation: 0.3,
    amplitudeScale: 0.5,
    frequencyScale: 0.7,
    ridgedContribution: 0.2,
    terraceStrength: 0.3,
  },
  {
    biomeId: 'tundra',
    baseElevation: 0.45,
    amplitudeScale: 0.8,
    frequencyScale: 0.8,
    ridgedContribution: 0.4,
    terraceStrength: 0.0,
  },
  {
    biomeId: 'forest',
    baseElevation: 0.35,
    amplitudeScale: 0.6,
    frequencyScale: 0.6,
    ridgedContribution: 0.1,
    terraceStrength: 0.0,
  },
  {
    biomeId: 'ocean',
    baseElevation: 0.05,
    amplitudeScale: 0.15,
    frequencyScale: 0.3,
    ridgedContribution: 0.0,
    terraceStrength: 0.0,
  },
];

const DEFAULT_SYSTEM_CONFIG: LandTileSystemConfig = {
  generator: {},
  composer: {},
  erosion: {},
  snowfall: {},
  eruption: {},
  biomeHeights: DEFAULT_BIOME_HEIGHTS,
  autoErosion: true,
  lodDistances: [50, 100, 200, 400],
};

// ============================================================================
// Interpolation Utilities
// ============================================================================

/** Cosine interpolation — smooth S-curve */
function cosineInterp(t: number): number {
  return (1 - Math.cos(t * Math.PI)) * 0.5;
}

/** Hermite interpolation (smoothstep) — C1 continuous */
function hermiteInterp(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Linear interpolation */
function linearInterp(t: number): number {
  return t;
}

/** Get the interpolation function based on blend method */
function getInterpFn(method: LandTileComposerConfig['blendMethod']): (t: number) => number {
  switch (method) {
    case 'cosine': return cosineInterp;
    case 'hermite': return hermiteInterp;
    case 'linear': return linearInterp;
    default: return cosineInterp;
  }
}

// ============================================================================
// LandTileGenerator
// ============================================================================

/**
 * Generates individual LandTiles with FBM noise heightmaps and biome-specific
 * height modifiers. Uses SeededRandom for full determinism.
 */
export class LandTileGenerator {
  private config: LandTileGeneratorConfig;
  private rng: SeededRandom;
  private biomeHeightMap: Map<string, BiomeHeightConfig>;
  private biomeInterpolator: BiomeInterpolator;

  constructor(
    config: Partial<LandTileGeneratorConfig> = {},
    biomeHeights: BiomeHeightConfig[] = DEFAULT_BIOME_HEIGHTS,
  ) {
    this.config = { ...DEFAULT_GENERATOR_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
    this.biomeHeightMap = new Map();
    this.biomeInterpolator = new BiomeInterpolator();

    // Index biome height configs
    for (const bh of biomeHeights) {
      this.biomeHeightMap.set(bh.biomeId, bh);
    }
  }

  /**
   * Register a BiomeDefinition with the internal interpolator so that
   * biome weights can be computed for arbitrary world positions.
   */
  registerBiome(biome: BiomeDefinition): void {
    this.biomeInterpolator.registerBiome(biome);
  }

  /**
   * Generate a single terrain tile at the given world position.
   *
   * @param x          World X origin of the tile
   * @param z          World Z origin of the tile
   * @param size       World-space side length
   * @param biomeConfig Optional override for biome weights (skip auto-detection)
   */
  generateTile(
    x: number,
    z: number,
    size: number,
    biomeConfig?: Map<string, number>,
  ): LandTile {
    const res = this.config.defaultResolution;
    const heightmap = new Float32Array(res * res);

    // Determine biome weights for the tile center
    const biomeWeights = biomeConfig ?? this.computeBiomeWeights(x + size / 2, z + size / 2);

    // 1. Generate base heightmap using FBM noise
    this.generateBaseHeightmap(heightmap, res, x, z, size);

    // 2. Apply biome-specific height modifiers
    this.applyBiomeModifiers(heightmap, res, x, z, size, biomeWeights);

    // 3. Normalize to [0, 1]
    this.normalizeHeightmap(heightmap);

    const tile: LandTile = {
      id: `tile_${x}_${z}`,
      x,
      z,
      size,
      heightmap,
      resolution: res,
      biomeWeights,
      erosionApplied: false,
      processesApplied: [],
    };

    return tile;
  }

  // ---- Private helpers ----------------------------------------------------

  /**
   * Compute biome weights for a world position using the BiomeInterpolator.
   * Falls back to a noise-based heuristic if no biomes are registered.
   */
  private computeBiomeWeights(wx: number, wz: number): Map<string, number> {
    const weights = new Map<string, number>();

    // Try the BiomeInterpolator first
    const position = new THREE.Vector3(wx, 0, wz);
    const normal = new THREE.Vector3(0, 1, 0);
    const blend: BiomeBlend = this.biomeInterpolator.interpolate(position, normal);

    if (blend.biomes.length > 0) {
      for (let i = 0; i < blend.biomes.length; i++) {
        weights.set(blend.biomes[i].id, blend.weights[i]);
      }
      return weights;
    }

    // Fallback: noise-based biome assignment using Voronoi-like regions
    const biomeIds = ['mountain', 'plains', 'desert', 'tundra', 'forest', 'ocean'];
    const regionScale = 0.005;
    const regionNoise = seededNoise2D(wx * regionScale, wz * regionScale, 1.0, this.config.seed);
    const moistureNoise = seededNoise2D(wx * regionScale + 500, wz * regionScale + 500, 1.0, this.config.seed + 1);

    // Map noise to biome affinities
    const temperature = (regionNoise + 1) * 0.5; // [0, 1]
    const moisture = (moistureNoise + 1) * 0.5;  // [0, 1]

    // Simple heuristic weight assignment
    const assignWeight = (biome: string, temp: number, moist: number): number => {
      switch (biome) {
        case 'ocean':    return Math.max(0, 0.8 - temp * 1.5);
        case 'desert':   return Math.max(0, temp * 0.8 - moist * 0.6);
        case 'plains':   return Math.max(0, (1 - Math.abs(temp - 0.5)) * (1 - Math.abs(moist - 0.4)) * 0.6);
        case 'forest':   return Math.max(0, moist * 0.7 * (1 - Math.abs(temp - 0.6)) * 0.8);
        case 'tundra':   return Math.max(0, (1 - temp) * 0.7 * (1 - moist * 0.3));
        case 'mountain': return Math.max(0, Math.abs(temp - 0.5) * 0.5 + Math.abs(moist - 0.5) * 0.3);
        default:         return 0;
      }
    };

    let totalWeight = 0;
    for (const id of biomeIds) {
      const w = assignWeight(id, temperature, moisture);
      if (w > 0.01) {
        weights.set(id, w);
        totalWeight += w;
      }
    }

    // Normalize weights
    if (totalWeight > 0) {
      for (const [id, w] of weights) {
        weights.set(id, w / totalWeight);
      }
    } else {
      // Default: equal plains/forest
      weights.set('plains', 0.5);
      weights.set('forest', 0.5);
    }

    return weights;
  }

  /**
   * Fill the heightmap with FBM noise centered on the tile's world position.
   */
  private generateBaseHeightmap(
    heightmap: Float32Array,
    res: number,
    tileX: number,
    tileZ: number,
    tileSize: number,
  ): void {
    const { frequency, octaves, lacunarity, persistence, seed } = this.config;
    const step = tileSize / (res - 1);

    for (let row = 0; row < res; row++) {
      for (let col = 0; col < res; col++) {
        const wx = tileX + col * step;
        const wz = tileZ + row * step;

        const value = seededFbm(
          wx * frequency,
          0,
          wz * frequency,
          octaves,
          lacunarity,
          persistence,
          seed,
        );

        // Map from [-1,1] to [0,1]
        heightmap[row * res + col] = (value + 1) * 0.5;
      }
    }
  }

  /**
   * Apply biome-specific height modifications to the heightmap.
   * Each biome's height config is weighted by that biome's influence.
   */
  private applyBiomeModifiers(
    heightmap: Float32Array,
    res: number,
    tileX: number,
    tileZ: number,
    tileSize: number,
    biomeWeights: Map<string, number>,
  ): void {
    const { frequency, octaves, lacunarity, persistence, seed, amplitude } = this.config;
    const step = tileSize / (res - 1);

    for (let row = 0; row < res; row++) {
      for (let col = 0; col < res; col++) {
        const wx = tileX + col * step;
        const wz = tileZ + row * step;
        const idx = row * res + col;
        const baseHeight = heightmap[idx];

        // Per-vertex biome interpolation (blend across tile)
        const vertBiomeWeights = this.computeBiomeWeights(wx, wz);

        let modifiedHeight = 0;
        let totalInfluence = 0;

        for (const [biomeId, weight] of vertBiomeWeights) {
          const bhConfig = this.biomeHeightMap.get(biomeId);
          if (!bhConfig) continue;

          // Compute biome-local noise for detail
          const localNoise = seededFbm(
            wx * frequency * bhConfig.frequencyScale + seed * 0.1,
            0,
            wz * frequency * bhConfig.frequencyScale + seed * 0.1,
            octaves,
            lacunarity,
            persistence,
            seed + 1,
          );

          // Ridged noise for mountain ridges
          let ridged = 0;
          if (bhConfig.ridgedContribution > 0) {
            ridged = seededRidgedMultifractal(
              wx * frequency * bhConfig.frequencyScale + seed * 0.2,
              0,
              wz * frequency * bhConfig.frequencyScale + seed * 0.2,
              octaves,
              lacunarity,
              persistence,
              0.7,
              seed + 2,
            );
          }

          // Combine base elevation + noise amplitude
          let h = bhConfig.baseElevation;
          h += (localNoise + 1) * 0.5 * bhConfig.amplitudeScale * amplitude;

          // Add ridged contribution
          h += ridged * bhConfig.ridgedContribution * amplitude;

          // Terrace effect: quantize heights for stepped terrain
          if (bhConfig.terraceStrength > 0) {
            const terraceCount = 8;
            const terraceH = Math.round(h * terraceCount) / terraceCount;
            h = h * (1 - bhConfig.terraceStrength) + terraceH * bhConfig.terraceStrength;
          }

          modifiedHeight += h * weight;
          totalInfluence += weight;
        }

        // Blend with the base heightmap
        if (totalInfluence > 0) {
          modifiedHeight /= totalInfluence;
          // Mix 60% biome-modified, 40% base to keep natural variation
          heightmap[idx] = baseHeight * 0.4 + modifiedHeight * 0.6;
        }
      }
    }
  }

  /**
   * Normalize heightmap values to [0, 1].
   */
  private normalizeHeightmap(heightmap: Float32Array): void {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < heightmap.length; i++) {
      min = Math.min(min, heightmap[i]);
      max = Math.max(max, heightmap[i]);
    }
    const range = max - min;
    if (range < 1e-8) {
      heightmap.fill(0.5);
      return;
    }
    for (let i = 0; i < heightmap.length; i++) {
      heightmap[i] = (heightmap[i] - min) / range;
    }
  }
}

// ============================================================================
// LandTileComposer
// ============================================================================

/**
 * Composes multiple LandTiles into a single THREE.BufferGeometry mesh.
 * Handles seamless edge blending between adjacent tiles and biome-weighted
 * vertex color assignment.
 */
export class LandTileComposer {
  private config: LandTileComposerConfig;

  constructor(config: Partial<LandTileComposerConfig> = {}) {
    this.config = { ...DEFAULT_COMPOSER_CONFIG, ...config };
  }

  /**
   * Compose an array of tiles into a single BufferGeometry.
   *
   * Adjacent tiles are blended along their shared edges using the configured
   * interpolation method (cosine/hermite/linear) within a configurable blend width.
   *
   * @param tiles      Array of tiles to compose
   * @param blendWidth Normalized blend width at tile edges (0-0.5, relative to tile size)
   * @returns THREE.BufferGeometry with positions, normals, UVs, and optional vertex colors
   */
  composeTiles(tiles: LandTile[], blendWidth?: number): THREE.BufferGeometry {
    const bw = blendWidth ?? this.config.blendWidth;
    const interpFn = getInterpFn(this.config.blendMethod);

    // Index tiles by their grid position for adjacency lookup
    const tileGrid = new Map<string, LandTile>();
    for (const tile of tiles) {
      // Quantize position to grid coordinates to handle floating-point imprecision
      const gx = Math.round(tile.x / tile.size);
      const gz = Math.round(tile.z / tile.size);
      tileGrid.set(`${gx},${gz}`, tile);
    }

    // Collect all vertices
    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // Track vertex offset for index buffer
    let vertexOffset = 0;

    // Default biome color palette
    const biomeColorMap: Record<string, THREE.Color> = {
      mountain: new THREE.Color(0.55, 0.45, 0.35),
      plains:   new THREE.Color(0.35, 0.65, 0.25),
      desert:   new THREE.Color(0.85, 0.75, 0.45),
      tundra:   new THREE.Color(0.75, 0.8, 0.85),
      forest:   new THREE.Color(0.2, 0.5, 0.15),
      ocean:    new THREE.Color(0.15, 0.3, 0.6),
    };

    for (const tile of tiles) {
      const res = tile.resolution;
      const { x: tileX, z: tileZ, size: tileSize, heightmap, biomeWeights } = tile;

      const gx = Math.round(tileX / tileSize);
      const gz = Math.round(tileZ / tileSize);

      // Find adjacent tiles
      const tileRight  = tileGrid.get(`${gx + 1},${gz}`);
      const tileLeft   = tileGrid.get(`${gx - 1},${gz}`);
      const tileTop    = tileGrid.get(`${gx},${gz - 1}`);
      const tileBottom = tileGrid.get(`${gx},${gz + 1}`);

      // Create a blended copy of the heightmap for this tile
      const blendedHM = new Float32Array(heightmap);

      // Edge blending with adjacent tiles
      this.blendEdgeRight(blendedHM, res, tile, tileRight, bw, interpFn);
      this.blendEdgeLeft(blendedHM, res, tile, tileLeft, bw, interpFn);
      this.blendEdgeTop(blendedHM, res, tile, tileTop, bw, interpFn);
      this.blendEdgeBottom(blendedHM, res, tile, tileBottom, bw, interpFn);

      // Corner blending (where 4 tiles meet)
      this.blendCorner(
        blendedHM, res, tile,
        tileGrid.get(`${gx + 1},${gz - 1}`),
        tileGrid.get(`${gx - 1},${gz - 1}`),
        tileGrid.get(`${gx + 1},${gz + 1}`),
        tileGrid.get(`${gx - 1},${gz + 1}`),
        bw, interpFn,
      );

      // Generate mesh vertices
      const step = tileSize / (res - 1);
      const heightScale = 30; // world units for max height

      for (let row = 0; row < res; row++) {
        for (let col = 0; col < res; col++) {
          const idx = row * res + col;
          const h = blendedHM[idx];

          const px = tileX + col * step;
          const py = h * heightScale;
          const pz = tileZ + row * step;

          positions.push(px, py, pz);

          // UV: normalized within the tile
          if (this.config.generateUVs) {
            uvs.push(col / (res - 1), row / (res - 1));
          }

          // Vertex color: blend biome colors by weights
          if (this.config.generateVertexColors) {
            let r = 0, g = 0, b = 0;
            let totalW = 0;

            // Height-dependent blending for visual variety
            const localBiomeWeights = this.getVertexBiomeWeights(
              h, col, row, res, biomeWeights,
            );

            for (const [biomeId, weight] of localBiomeWeights) {
              const color = biomeColorMap[biomeId] ?? new THREE.Color(0.5, 0.5, 0.5);
              r += color.r * weight;
              g += color.g * weight;
              b += color.b * weight;
              totalW += weight;
            }

            if (totalW > 0) {
              colors.push(r / totalW, g / totalW, b / totalW);
            } else {
              colors.push(0.5, 0.5, 0.5);
            }
          }
        }
      }

      // Generate indices (triangle strip per quad)
      for (let row = 0; row < res - 1; row++) {
        for (let col = 0; col < res - 1; col++) {
          const a = vertexOffset + row * res + col;
          const b = vertexOffset + row * res + (col + 1);
          const c = vertexOffset + (row + 1) * res + col;
          const d = vertexOffset + (row + 1) * res + (col + 1);

          indices.push(a, c, b);
          indices.push(b, c, d);
        }
      }

      vertexOffset += res * res;
    }

    // Build the BufferGeometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    if (this.config.generateUVs) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }

    if (this.config.generateVertexColors) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    geometry.setIndex(indices);

    if (this.config.computeNormals) {
      geometry.computeVertexNormals();
    }

    return geometry;
  }

  // ---- Edge blending helpers ---------------------------------------------

  /**
   * Blend the right edge of this tile with the left edge of the right neighbor.
   */
  private blendEdgeRight(
    hm: Float32Array, res: number,
    tile: LandTile, neighbor: LandTile | undefined,
    bw: number, interpFn: (t: number) => number,
  ): void {
    if (!neighbor) return;
    const blendCols = Math.max(1, Math.floor(bw * res));
    for (let row = 0; row < res; row++) {
      for (let bc = 0; bc < blendCols; bc++) {
        const col = res - 1 - bc;
        const t = interpFn(bc / blendCols);
        const thisH = tile.heightmap[row * res + col];
        const neighborH = neighbor.heightmap[row * res + bc];
        hm[row * res + col] = thisH * (1 - t * 0.5) + neighborH * (t * 0.5);
      }
    }
  }

  /**
   * Blend the left edge of this tile with the right edge of the left neighbor.
   */
  private blendEdgeLeft(
    hm: Float32Array, res: number,
    tile: LandTile, neighbor: LandTile | undefined,
    bw: number, interpFn: (t: number) => number,
  ): void {
    if (!neighbor) return;
    const blendCols = Math.max(1, Math.floor(bw * res));
    for (let row = 0; row < res; row++) {
      for (let bc = 0; bc < blendCols; bc++) {
        const col = bc;
        const t = interpFn(bc / blendCols);
        const thisH = tile.heightmap[row * res + col];
        const neighborH = neighbor.heightmap[row * res + (res - 1 - bc)];
        hm[row * res + col] = thisH * (1 - (1 - t) * 0.5) + neighborH * ((1 - t) * 0.5);
      }
    }
  }

  /**
   * Blend the top edge of this tile with the bottom edge of the top neighbor.
   */
  private blendEdgeTop(
    hm: Float32Array, res: number,
    tile: LandTile, neighbor: LandTile | undefined,
    bw: number, interpFn: (t: number) => number,
  ): void {
    if (!neighbor) return;
    const blendRows = Math.max(1, Math.floor(bw * res));
    for (let br = 0; br < blendRows; br++) {
      const row = br;
      const t = interpFn(br / blendRows);
      for (let col = 0; col < res; col++) {
        const thisH = tile.heightmap[row * res + col];
        const neighborH = neighbor.heightmap[(res - 1 - br) * res + col];
        hm[row * res + col] = thisH * (1 - (1 - t) * 0.5) + neighborH * ((1 - t) * 0.5);
      }
    }
  }

  /**
   * Blend the bottom edge of this tile with the top edge of the bottom neighbor.
   */
  private blendEdgeBottom(
    hm: Float32Array, res: number,
    tile: LandTile, neighbor: LandTile | undefined,
    bw: number, interpFn: (t: number) => number,
  ): void {
    if (!neighbor) return;
    const blendRows = Math.max(1, Math.floor(bw * res));
    for (let br = 0; br < blendRows; br++) {
      const row = res - 1 - br;
      const t = interpFn(br / blendRows);
      for (let col = 0; col < res; col++) {
        const thisH = tile.heightmap[row * res + col];
        const neighborH = neighbor.heightmap[br * res + col];
        hm[row * res + col] = thisH * (1 - t * 0.5) + neighborH * (t * 0.5);
      }
    }
  }

  /**
   * Blend corners where up to 4 tiles meet. Uses bilinear blending.
   */
  private blendCorner(
    hm: Float32Array, res: number,
    tile: LandTile,
    neighborTR: LandTile | undefined,
    neighborTL: LandTile | undefined,
    neighborBR: LandTile | undefined,
    neighborBL: LandTile | undefined,
    bw: number, interpFn: (t: number) => number,
  ): void {
    const blendSize = Math.max(1, Math.floor(bw * res * 0.5));

    // Top-right corner
    if (neighborTR) {
      for (let r = 0; r < blendSize; r++) {
        for (let c = 0; c < blendSize; c++) {
          const row = r;
          const col = res - 1 - c;
          const tx = c / blendSize;
          const ty = r / blendSize;
          const t = interpFn((tx + ty) * 0.5);
          const thisH = tile.heightmap[row * res + col];
          const nh = neighborTR.heightmap[(res - 1 - r) * res + c];
          hm[row * res + col] = thisH * (1 - t * 0.25) + nh * (t * 0.25);
        }
      }
    }

    // Top-left corner
    if (neighborTL) {
      for (let r = 0; r < blendSize; r++) {
        for (let c = 0; c < blendSize; c++) {
          const row = r;
          const col = c;
          const tx = c / blendSize;
          const ty = r / blendSize;
          const t = interpFn((tx + ty) * 0.5);
          const thisH = tile.heightmap[row * res + col];
          const nh = neighborTL.heightmap[(res - 1 - r) * res + (res - 1 - c)];
          hm[row * res + col] = thisH * (1 - t * 0.25) + nh * (t * 0.25);
        }
      }
    }

    // Bottom-right corner
    if (neighborBR) {
      for (let r = 0; r < blendSize; r++) {
        for (let c = 0; c < blendSize; c++) {
          const row = res - 1 - r;
          const col = res - 1 - c;
          const tx = c / blendSize;
          const ty = r / blendSize;
          const t = interpFn((tx + ty) * 0.5);
          const thisH = tile.heightmap[row * res + col];
          const nh = neighborBR.heightmap[r * res + c];
          hm[row * res + col] = thisH * (1 - t * 0.25) + nh * (t * 0.25);
        }
      }
    }

    // Bottom-left corner
    if (neighborBL) {
      for (let r = 0; r < blendSize; r++) {
        for (let c = 0; c < blendSize; c++) {
          const row = res - 1 - r;
          const col = c;
          const tx = c / blendSize;
          const ty = r / blendSize;
          const t = interpFn((tx + ty) * 0.5);
          const thisH = tile.heightmap[row * res + col];
          const nh = neighborBL.heightmap[r * res + (res - 1 - c)];
          hm[row * res + col] = thisH * (1 - t * 0.25) + nh * (t * 0.25);
        }
      }
    }
  }

  /**
   * Compute per-vertex biome weights by blending the tile-level weights
   * with height-dependent modifiers for more natural transitions.
   */
  private getVertexBiomeWeights(
    h: number,
    col: number,
    row: number,
    res: number,
    tileBiomeWeights: Map<string, number>,
  ): Map<string, number> {
    const weights = new Map<string, number>(tileBiomeWeights);

    // Height-dependent biome adjustments
    if (h > 0.75) {
      // High elevation: bias toward mountain/tundra
      this.adjustWeight(weights, 'mountain', 0.3);
      this.adjustWeight(weights, 'tundra', 0.2);
      this.adjustWeight(weights, 'ocean', -0.5);
      this.adjustWeight(weights, 'plains', -0.2);
    } else if (h < 0.2) {
      // Low elevation: bias toward ocean
      this.adjustWeight(weights, 'ocean', 0.4);
      this.adjustWeight(weights, 'mountain', -0.4);
    }

    // Edge fading: reduce biome specificity at tile edges for smoother blending
    const edgeDist = Math.min(col, row, res - 1 - col, res - 1 - row);
    const edgeFade = Math.min(1, edgeDist / 4);

    if (edgeFade < 1) {
      // At edges, flatten biome weights toward uniform
      const avgWeight = 1 / Math.max(1, weights.size);
      for (const [id, w] of weights) {
        weights.set(id, w * edgeFade + avgWeight * (1 - edgeFade));
      }
    }

    // Normalize
    let total = 0;
    for (const w of weights.values()) {
      total += Math.max(0, w);
    }
    if (total > 0) {
      for (const [id, w] of weights) {
        weights.set(id, Math.max(0, w) / total);
      }
    }

    return weights;
  }

  private adjustWeight(weights: Map<string, number>, biomeId: string, delta: number): void {
    const current = weights.get(biomeId) ?? 0;
    weights.set(biomeId, current + delta);
  }
}

// ============================================================================
// LandProcessManager
// ============================================================================

/**
 * Applies LandLab-style processes to tiles.
 * Each process modifies the tile heightmap in place.
 */
export class LandProcessManager {
  private erosionConfig: TileErosionParams;
  private snowfallConfig: TileSnowfallParams;
  private eruptionConfig: TileEruptionParams;
  private rng: SeededRandom;

  constructor(
    erosion: Partial<TileErosionParams> = {},
    snowfall: Partial<TileSnowfallParams> = {},
    eruption: Partial<TileEruptionParams> = {},
    seed: number = 42,
  ) {
    this.erosionConfig = { ...DEFAULT_EROSION_PARAMS, ...erosion };
    this.snowfallConfig = { ...DEFAULT_SNOWFALL_PARAMS, ...snowfall };
    this.eruptionConfig = { ...DEFAULT_ERUPTION_PARAMS, ...eruption };
    this.rng = new SeededRandom(seed);
  }

  /**
   * Apply hydraulic erosion to a tile's heightmap.
   * Uses the existing HydraulicErosionProcess from land-process.ts.
   */
  applyErosion(tile: LandTile, params?: Partial<TileErosionParams>): void {
    const cfg = { ...this.erosionConfig, ...params };
    if (!cfg.enabled) return;

    const erosion = new HydraulicErosionProcess({
      iterations: cfg.iterations,
      strength: cfg.strength,
      enabled: true,
    });

    erosion.apply(tile.heightmap, tile.resolution, tile.resolution);
    tile.erosionApplied = true;

    if (!tile.processesApplied.includes('erosion')) {
      tile.processesApplied.push('erosion');
    }

    // Clamp values after erosion
    for (let i = 0; i < tile.heightmap.length; i++) {
      tile.heightmap[i] = Math.max(0, Math.min(1, tile.heightmap[i]));
    }
  }

  /**
   * Apply thermal weathering (slope relaxation) to a tile's heightmap.
   */
  applyThermalWeathering(tile: LandTile, iterations: number = 30, strength: number = 0.3): void {
    const thermal = new ThermalWeatheringProcess({
      iterations,
      strength,
      enabled: true,
    });

    thermal.apply(tile.heightmap, tile.resolution, tile.resolution);

    if (!tile.processesApplied.includes('thermal_weathering')) {
      tile.processesApplied.push('thermal_weathering');
    }

    // Clamp
    for (let i = 0; i < tile.heightmap.length; i++) {
      tile.heightmap[i] = Math.max(0, Math.min(1, tile.heightmap[i]));
    }
  }

  /**
   * Apply sediment transport to a tile's heightmap.
   */
  applySedimentTransport(tile: LandTile, iterations: number = 100, strength: number = 0.4): void {
    const transport = new SedimentTransportProcess({
      iterations,
      strength,
      enabled: true,
    });

    transport.apply(tile.heightmap, tile.resolution, tile.resolution);

    if (!tile.processesApplied.includes('sediment_transport')) {
      tile.processesApplied.push('sediment_transport');
    }

    // Clamp
    for (let i = 0; i < tile.heightmap.length; i++) {
      tile.heightmap[i] = Math.max(0, Math.min(1, tile.heightmap[i]));
    }
  }

  /**
   * Apply snowfall accumulation to a tile's heightmap.
   *
   * Snow accumulates above the snow line and is smoothed to create
   * natural drifts. The heightmap is modified in place.
   */
  applySnowfall(tile: LandTile, params?: Partial<TileSnowfallParams>): void {
    const cfg = { ...this.snowfallConfig, ...params };
    if (!cfg.enabled) return;

    const res = tile.resolution;
    const { snowLine, maxDepth, smoothingPasses } = cfg;

    // 1. Accumulate snow above the snow line
    const snowAccum = new Float32Array(res * res);
    for (let i = 0; i < tile.heightmap.length; i++) {
      const h = tile.heightmap[i];
      if (h > snowLine) {
        // Snow depth increases with height above the snow line
        const aboveLine = h - snowLine;
        const depth = Math.min(maxDepth, aboveLine * 0.5);
        // Slope-dependent: less snow on steep slopes
        const row = Math.floor(i / res);
        const col = i % res;
        const slope = this.estimateSlope(tile.heightmap, res, col, row);
        const slopeFactor = Math.max(0, 1 - slope * 5);
        snowAccum[i] = depth * slopeFactor;
      }
    }

    // 2. Smooth snow accumulation to create drifts
    for (let pass = 0; pass < smoothingPasses; pass++) {
      const smoothed = new Float32Array(snowAccum);
      for (let row = 1; row < res - 1; row++) {
        for (let col = 1; col < res - 1; col++) {
          const idx = row * res + col;
          smoothed[idx] = (
            snowAccum[idx] * 4 +
            snowAccum[(row - 1) * res + col] +
            snowAccum[(row + 1) * res + col] +
            snowAccum[row * res + (col - 1)] +
            snowAccum[row * res + (col + 1)]
          ) / 8;
        }
      }
      snowAccum.set(smoothed);
    }

    // 3. Add snow accumulation to heightmap
    for (let i = 0; i < tile.heightmap.length; i++) {
      tile.heightmap[i] = Math.min(1, tile.heightmap[i] + snowAccum[i]);
    }

    if (!tile.processesApplied.includes('snowfall')) {
      tile.processesApplied.push('snowfall');
    }
  }

  /**
   * Apply volcanic eruption deformation to a tile's heightmap.
   *
   * Creates crater depressions and raised lava flows emanating from
   * randomly placed volcanic vents within the tile.
   */
  applyEruption(tile: LandTile, params?: Partial<TileEruptionParams>): void {
    const cfg = { ...this.eruptionConfig, ...params };
    if (!cfg.enabled) return;

    const res = tile.resolution;
    const { ventCount, maxCraterRadius, maxCraterDepth, lavaFlowDistance, lavaFlowHeight } = cfg;

    // Generate volcanic vent positions
    for (let v = 0; v < ventCount; v++) {
      // Place vent at a random position within the tile (not at edges)
      const ventCol = Math.floor(this.rng.nextFloat(0.2, 0.8) * res);
      const ventRow = Math.floor(this.rng.nextFloat(0.2, 0.8) * res);

      const craterRadius = this.rng.nextFloat(3, maxCraterRadius);
      const craterDepth = this.rng.nextFloat(0.1, maxCraterDepth);

      // 1. Carve crater: depression centered on the vent
      for (let row = 0; row < res; row++) {
        for (let col = 0; col < res; col++) {
          const dx = col - ventCol;
          const dy = row - ventRow;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < craterRadius) {
            const t = dist / craterRadius;
            // Parabolic crater profile: deepest at center, raised rim at edge
            const craterProfile = (1 - t * t) * craterDepth;
            // Add a raised rim just outside the crater
            const rimHeight = t > 0.8 ? (1 - (t - 0.8) / 0.2) * craterDepth * 0.3 : 0;
            const idx = row * res + col;
            tile.heightmap[idx] = Math.max(0, tile.heightmap[idx] - craterProfile + rimHeight);
          }
        }
      }

      // 2. Generate lava flows: raised ridges emanating from the vent
      const flowCount = this.rng.nextInt(2, 5);
      for (let f = 0; f < flowCount; f++) {
        const angle = this.rng.next() * Math.PI * 2;
        const flowLength = this.rng.nextFloat(
          Math.max(3, lavaFlowDistance * 0.3),
          Math.min(res * 0.4, lavaFlowDistance),
        );
        const flowWidth = this.rng.nextFloat(1.5, 4);
        const flowH = this.rng.nextFloat(0.02, lavaFlowHeight);

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        for (let row = 0; row < res; row++) {
          for (let col = 0; col < res; col++) {
            const dx = col - ventCol;
            const dy = row - ventRow;

            // Project onto flow direction
            const along = dx * cosA + dy * sinA;
            const across = Math.abs(-dx * sinA + dy * cosA);

            if (along > 0 && along < flowLength && across < flowWidth) {
              // Lava flow profile: raised center, tapering at edges
              const alongF = 1 - along / flowLength;
              const acrossF = 1 - across / flowWidth;
              const height = alongF * acrossF * acrossF * flowH;
              const idx = row * res + col;
              tile.heightmap[idx] = Math.min(1, tile.heightmap[idx] + height);
            }
          }
        }
      }
    }

    if (!tile.processesApplied.includes('eruption')) {
      tile.processesApplied.push('eruption');
    }
  }

  /**
   * Apply all configured processes to a tile in sequence.
   */
  applyAll(tile: LandTile): void {
    this.applyErosion(tile);
    this.applyThermalWeathering(tile);
    this.applySedimentTransport(tile);
    this.applySnowfall(tile);
    this.applyEruption(tile);
  }

  // ---- Helpers ------------------------------------------------------------

  /**
   * Estimate the local slope at a point in the heightmap.
   * Returns a value in [0, 1] where 0 = flat, 1 = very steep.
   */
  private estimateSlope(hm: Float32Array, res: number, col: number, row: number): number {
    const left   = col > 0 ? hm[row * res + (col - 1)] : hm[row * res + col];
    const right  = col < res - 1 ? hm[row * res + (col + 1)] : hm[row * res + col];
    const top    = row > 0 ? hm[(row - 1) * res + col] : hm[row * res + col];
    const bottom = row < res - 1 ? hm[(row + 1) * res + col] : hm[row * res + col];

    const dx = right - left;
    const dy = bottom - top;
    return Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
  }
}

// ============================================================================
// LandTileSystem — Main Entry Point
// ============================================================================

/**
 * The main tile-based terrain system that orchestrates tile generation,
 * composition, process application, and level-of-detail management.
 *
 * Usage:
 * ```typescript
 * const system = new LandTileSystem({ generator: { seed: 12345 } });
 * const geometry = system.generateRegion(0, 0, 100);
 * // geometry is a THREE.BufferGeometry ready for mesh creation
 * ```
 */
export class LandTileSystem {
  private config: LandTileSystemConfig;
  private generator: LandTileGenerator;
  private composer: LandTileComposer;
  private processManager: LandProcessManager;
  private tileCache: Map<string, LandTile>;
  private currentLOD: number;

  constructor(config: Partial<LandTileSystemConfig> = {}) {
    this.config = {
      ...DEFAULT_SYSTEM_CONFIG,
      ...config,
      generator: { ...DEFAULT_SYSTEM_CONFIG.generator, ...config.generator },
      composer: { ...DEFAULT_SYSTEM_CONFIG.composer, ...config.composer },
      erosion: { ...DEFAULT_SYSTEM_CONFIG.erosion, ...config.erosion },
      snowfall: { ...DEFAULT_SYSTEM_CONFIG.snowfall, ...config.snowfall },
      eruption: { ...DEFAULT_SYSTEM_CONFIG.eruption, ...config.eruption },
    };

    const seed = this.config.generator.seed ?? DEFAULT_GENERATOR_CONFIG.seed;

    this.generator = new LandTileGenerator(
      this.config.generator,
      this.config.biomeHeights,
    );

    this.composer = new LandTileComposer(this.config.composer);

    this.processManager = new LandProcessManager(
      this.config.erosion,
      this.config.snowfall,
      this.config.eruption,
      seed,
    );

    this.tileCache = new Map();
    this.currentLOD = 0;
  }

  /**
   * Generate a full terrain region centered at (centerX, centerZ) with the
   * given radius. Returns a THREE.BufferGeometry combining all tiles.
   *
   * @param centerX Center of the region in world X
   * @param centerZ Center of the region in world Z
   * @param radius  Radius of the region in world units
   * @returns THREE.BufferGeometry with the composed terrain mesh
   */
  generateRegion(centerX: number, centerZ: number, radius: number): THREE.BufferGeometry {
    // Determine tile size based on current LOD
    const lodDistances = this.config.lodDistances;
    const tileSize = lodDistances.length > 0
      ? lodDistances[Math.min(this.currentLOD, lodDistances.length - 1)] * 0.5
      : 50;

    // Calculate the grid of tiles needed to cover the region
    const minTileX = Math.floor((centerX - radius) / tileSize) * tileSize;
    const maxTileX = Math.ceil((centerX + radius) / tileSize) * tileSize;
    const minTileZ = Math.floor((centerZ - radius) / tileSize) * tileSize;
    const maxTileZ = Math.ceil((centerZ + radius) / tileSize) * tileSize;

    const tiles: LandTile[] = [];

    // Adjust resolution based on LOD level
    const baseRes = this.config.generator.defaultResolution ?? DEFAULT_GENERATOR_CONFIG.defaultResolution;
    const lodResolution = Math.max(8, Math.floor(baseRes / (1 + this.currentLOD * 0.5)));

    // Save and temporarily override resolution
    const origRes = this.generator['config'].defaultResolution;
    this.generator['config'].defaultResolution = lodResolution;

    for (let x = minTileX; x < maxTileX; x += tileSize) {
      for (let z = minTileZ; z < maxTileZ; z += tileSize) {
        // Check if tile center is within the radius
        const tileCenterX = x + tileSize / 2;
        const tileCenterZ = z + tileSize / 2;
        const dx = tileCenterX - centerX;
        const dz = tileCenterZ - centerZ;
        if (dx * dx + dz * dz > (radius + tileSize) * (radius + tileSize)) continue;

        // Check cache
        const cacheKey = `tile_${x}_${z}_${lodResolution}`;
        let tile = this.tileCache.get(cacheKey);

        if (!tile) {
          tile = this.generator.generateTile(x, z, tileSize);

          // Apply processes if configured
          if (this.config.autoErosion) {
            this.processManager.applyAll(tile);
          }

          this.tileCache.set(cacheKey, tile);
        }

        tiles.push(tile);
      }
    }

    // Restore original resolution
    this.generator['config'].defaultResolution = origRes;

    // Compose all tiles into a single geometry
    return this.composer.composeTiles(tiles);
  }

  /**
   * Get a specific tile at the given world position and tile size.
   *
   * @param x World X position
   * @param z World Z position
   * @param tileSize Tile size (defaults to the first LOD distance * 0.5)
   * @returns The LandTile at that position, or null if not generated
   */
  getTile(x: number, z: number, tileSize?: number): LandTile | null {
    const ts = tileSize ?? (this.config.lodDistances[0] ?? 50) * 0.5;
    const gx = Math.floor(x / ts) * ts;
    const gz = Math.floor(z / ts) * ts;

    // Search cache for any resolution variant
    for (const [, tile] of this.tileCache) {
      if (tile.x === gx && tile.z === gz && Math.abs(tile.size - ts) < 0.01) {
        return tile;
      }
    }

    return null;
  }

  /**
   * Generate and return a single tile at the given world position.
   *
   * @param x World X position of the tile origin
   * @param z World Z position of the tile origin
   * @param size Tile size in world units
   * @returns The generated LandTile
   */
  generateTile(x: number, z: number, size: number): LandTile {
    const tile = this.generator.generateTile(x, z, size);

    if (this.config.autoErosion) {
      this.processManager.applyAll(tile);
    }

    const cacheKey = `tile_${x}_${z}_${tile.resolution}`;
    this.tileCache.set(cacheKey, tile);

    return tile;
  }

  /**
   * Update the level of detail based on camera position.
   * Tiles closer to the camera use higher resolution; distant tiles use lower resolution.
   *
   * @param camera The THREE.Camera to base LOD on
   */
  updateLOD(camera: THREE.Camera): void {
    const distThresholds = this.config.lodDistances;

    // Determine LOD based on camera distance from origin (or a reference point)
    const cameraPos = camera.position;
    const distFromOrigin = cameraPos.length();

    let newLOD = 0;
    for (let i = 0; i < distThresholds.length; i++) {
      if (distFromOrigin > distThresholds[i]) {
        newLOD = i + 1;
      }
    }

    if (newLOD !== this.currentLOD) {
      this.currentLOD = newLOD;
    }
  }

  /**
   * Get the current LOD level.
   */
  getCurrentLOD(): number {
    return this.currentLOD;
  }

  /**
   * Register a BiomeDefinition with the system's tile generator.
   * This must be called before generating tiles if you want biome-specific
   * terrain features.
   */
  registerBiome(biome: BiomeDefinition): void {
    this.generator.registerBiome(biome);
  }

  /**
   * Get the process manager for manually applying land processes.
   */
  getProcessManager(): LandProcessManager {
    return this.processManager;
  }

  /**
   * Get the tile generator for manual tile generation.
   */
  getGenerator(): LandTileGenerator {
    return this.generator;
  }

  /**
   * Get the tile composer for manual composition.
   */
  getComposer(): LandTileComposer {
    return this.composer;
  }

  /**
   * Clear the tile cache to free memory.
   */
  clearCache(): void {
    this.tileCache.clear();
  }

  /**
   * Get the number of cached tiles.
   */
  getCacheSize(): number {
    return this.tileCache.size;
  }

  /**
   * Get all cached tiles.
   */
  getCachedTiles(): LandTile[] {
    return Array.from(this.tileCache.values());
  }
}
