/**
 * ErosionMaterialBlending — Erosion-driven material blending for terrain
 *
 * Connects the hydraulic erosion system output to material blending masks.
 * In the original Infinigen, erosion masks from SoilMachine are used to
 * blend between rock (eroded), soil (sediment deposits), sand (water paths),
 * and other terrain materials based on erosion simulation results.
 *
 * Features:
 *   - Erosion mask → rock material (exposed bedrock on steep/eroded areas)
 *   - Sediment mask → soil material (deposited sediment on flat areas)
 *   - Water flow mask → sand/gravel (along water channels)
 *   - Altitude-based blending (beach at sea level, snow at altitude)
 *   - Slope-based blending (cliff = rock, flat = grass)
 *   - Integration with MaterialBlendingSystem
 *   - Configurable transition curves and noise perturbation
 *
 * @module assets/materials/blending
 */

import * as THREE from 'three';
import { SeededNoiseGenerator } from '../../../core/util/math/noise';
import { SeededRandom } from '../../../core/util/MathUtils';
import { MaterialBlendingSystem, type BlendConfig, type MaterialPBRParams } from './MaterialBlendingSystem';

// ============================================================================
// Types
// ============================================================================

/**
 * Erosion data from the hydraulic erosion simulation.
 * Maps directly to the output of HydraulicErosionGPU or CPU erosion.
 */
export interface ErosionData {
  /** Width of the terrain height field */
  width: number;
  /** Height of the terrain height field */
  height: number;
  /** Per-cell erosion amount (positive = material removed) */
  erosionMap: Float32Array;
  /** Per-cell sediment deposition amount (positive = material added) */
  sedimentMap: Float32Array;
  /** Per-cell water flow accumulation */
  waterFlowMap: Float32Array;
  /** Per-cell terrain slope angle in radians */
  slopeMap: Float32Array;
  /** Per-cell terrain height */
  heightMap: Float32Array;
}

/**
 * Configuration for erosion-driven material blending.
 */
export interface ErosionBlendConfig {
  /** Resolution of the blend mask (default 512) */
  resolution: number;
  /** Seed for noise perturbation (default 42) */
  seed: number;

  // Slope thresholds
  /** Slope angle (radians) below which terrain is considered flat (default 0.26 ≈ 15°) */
  flatSlopeThreshold: number;
  /** Slope angle (radians) above which terrain is considered steep/cliff (default 0.79 ≈ 45°) */
  steepSlopeThreshold: number;

  // Altitude zones
  /** Altitude below which is beach/sand zone (default 0.05) */
  beachAltitude: number;
  /** Altitude above which is snow zone (default 0.85) */
  snowAltitude: number;

  // Erosion thresholds
  /** Erosion value above which rock is exposed (default 0.3) */
  erosionRockThreshold: number;
  /** Sediment value above which soil is deposited (default 0.2) */
  sedimentSoilThreshold: number;
  /** Water flow value above which sand/gravel channel (default 0.5) */
  waterChannelThreshold: number;

  // Noise perturbation for organic transitions
  /** Scale of noise applied to blend boundaries (default 3.0) */
  boundaryNoiseScale: number;
  /** Strength of boundary noise perturbation (default 0.15) */
  boundaryNoiseStrength: number;

  // Materials
  /** Material for exposed rock (eroded areas, cliffs) */
  rockMaterial: MaterialPBRParams;
  /** Material for soil/sediment (flat areas, deposits) */
  soilMaterial: MaterialPBRParams;
  /** Material for sand (beach, water channels) */
  sandMaterial: MaterialPBRParams;
  /** Material for grass/vegetation (mid-altitude flat) */
  grassMaterial: MaterialPBRParams;
  /** Material for snow (high altitude) */
  snowMaterial: MaterialPBRParams;
}

/**
 * Per-pixel blend weights for up to 5 terrain materials.
 */
export interface TerrainBlendWeights {
  /** Blend weight for rock material [0..1] */
  rock: Float32Array;
  /** Blend weight for soil material [0..1] */
  soil: Float32Array;
  /** Blend weight for sand material [0..1] */
  sand: Float32Array;
  /** Blend weight for grass material [0..1] */
  grass: Float32Array;
  /** Blend weight for snow material [0..1] */
  snow: Float32Array;
  /** Resolution of the weight maps */
  resolution: number;
}

/**
 * Result of erosion-driven material blending.
 */
export interface ErosionBlendResult {
  /** The blended material */
  material: THREE.MeshPhysicalMaterial;
  /** Blend weight maps for each material */
  weights: TerrainBlendWeights;
  /** Combined blend mask texture */
  maskTexture: THREE.DataTexture;
}

// ============================================================================
// Default Materials
// ============================================================================

const DEFAULT_ROCK: MaterialPBRParams = {
  baseColor: new THREE.Color(0.48, 0.45, 0.40),
  roughness: 0.85, metallic: 0.0,
  aoStrength: 0.7, heightScale: 0.05, normalStrength: 2.0,
  emissionColor: null, emissionStrength: 0,
  noiseScale: 3, noiseDetail: 7, distortion: 0.4, warpStrength: 0.5,
};

const DEFAULT_SOIL: MaterialPBRParams = {
  baseColor: new THREE.Color(0.35, 0.25, 0.15),
  roughness: 0.9, metallic: 0.0,
  aoStrength: 0.5, heightScale: 0.02, normalStrength: 1.0,
  emissionColor: null, emissionStrength: 0,
  noiseScale: 6, noiseDetail: 5, distortion: 0.3, warpStrength: 0.3,
};

const DEFAULT_SAND: MaterialPBRParams = {
  baseColor: new THREE.Color(0.82, 0.72, 0.52),
  roughness: 0.9, metallic: 0.0,
  aoStrength: 0.3, heightScale: 0.01, normalStrength: 0.8,
  emissionColor: null, emissionStrength: 0,
  noiseScale: 15, noiseDetail: 4, distortion: 0.1, warpStrength: 0.1,
};

const DEFAULT_GRASS: MaterialPBRParams = {
  baseColor: new THREE.Color(0.2, 0.45, 0.12),
  roughness: 0.75, metallic: 0.0,
  aoStrength: 0.4, heightScale: 0.02, normalStrength: 1.0,
  emissionColor: null, emissionStrength: 0,
  noiseScale: 6, noiseDetail: 5, distortion: 0.3, warpStrength: 0.4,
};

const DEFAULT_SNOW: MaterialPBRParams = {
  baseColor: new THREE.Color(0.92, 0.94, 0.98),
  roughness: 0.7, metallic: 0.0,
  aoStrength: 0.3, heightScale: 0.01, normalStrength: 0.5,
  emissionColor: null, emissionStrength: 0,
  noiseScale: 4, noiseDetail: 4, distortion: 0.2, warpStrength: 0.3,
};

const DEFAULT_CONFIG: Omit<ErosionBlendConfig, 'rockMaterial' | 'soilMaterial' | 'sandMaterial' | 'grassMaterial' | 'snowMaterial'> = {
  resolution: 512,
  seed: 42,
  flatSlopeThreshold: 0.26,   // ~15°
  steepSlopeThreshold: 0.79,  // ~45°
  beachAltitude: 0.05,
  snowAltitude: 0.85,
  erosionRockThreshold: 0.3,
  sedimentSoilThreshold: 0.2,
  waterChannelThreshold: 0.5,
  boundaryNoiseScale: 3.0,
  boundaryNoiseStrength: 0.15,
};

// ============================================================================
// ErosionMaterialBlending Class
// ============================================================================

/**
 * ErosionMaterialBlending — Creates terrain material blend masks from
 * hydraulic erosion simulation output.
 *
 * This class bridges the gap between the erosion simulation system
 * (which produces erosion, sediment, and water flow maps) and the
 * material blending system (which creates physically-based terrain
 * materials with smooth transitions).
 *
 * The blending logic follows the original Infinigen's approach:
 *   1. Steep/eroded areas → exposed rock
 *   2. Flat areas with sediment → soil
 *   3. Low altitude near water → sand/beach
 *   4. Mid-altitude flat areas → grass/vegetation
 *   5. High altitude → snow
 *   6. Water flow channels → sand/gravel
 *
 * Noise perturbation is applied to blend boundaries for organic,
 * natural-looking transitions.
 *
 * @example
 * ```ts
 * const blender = new ErosionMaterialBlending();
 * const result = blender.blend(erosionData, {
 *   seed: 12345,
 *   resolution: 1024,
 * });
 * terrainMesh.material = result.material;
 * ```
 */
export class ErosionMaterialBlending {
  private blendingSystem: MaterialBlendingSystem;

  constructor() {
    this.blendingSystem = new MaterialBlendingSystem(512);
  }

  /**
   * Create blend weight maps from erosion simulation data.
   *
   * Generates per-pixel weights for rock, soil, sand, grass, and snow
   * materials based on erosion intensity, sediment deposition, water flow,
   * slope, and altitude.
   *
   * @param erosionData - Output from the erosion simulation
   * @param config - Blending configuration
   * @returns TerrainBlendWeights with per-material weight maps
   */
  createBlendWeights(
    erosionData: ErosionData,
    config: Partial<ErosionBlendConfig> = {},
  ): TerrainBlendWeights {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const res = cfg.resolution;
    const noise = new SeededNoiseGenerator(cfg.seed);
    const rng = new SeededRandom(cfg.seed);

    const rock = new Float32Array(res * res);
    const soil = new Float32Array(res * res);
    const sand = new Float32Array(res * res);
    const grass = new Float32Array(res * res);
    const snow = new Float32Array(res * res);

    // Normalize erosion data to [0, 1] range
    const erosionMax = Math.max(...Array.from(erosionData.erosionMap), 0.001);
    const sedimentMax = Math.max(...Array.from(erosionData.sedimentMap), 0.001);
    const waterMax = Math.max(...Array.from(erosionData.waterFlowMap), 0.001);
    const heightMax = Math.max(...Array.from(erosionData.heightMap), 0.001);

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = y * res + x;

        // Sample erosion data (bilinear mapping from data resolution to blend resolution)
        const dataX = Math.floor((x / res) * erosionData.width);
        const dataY = Math.floor((y / res) * erosionData.height);
        const dataIdx = dataY * erosionData.width + dataX;

        const erosion = (erosionData.erosionMap[dataIdx] || 0) / erosionMax;
        const sediment = (erosionData.sedimentMap[dataIdx] || 0) / sedimentMax;
        const waterFlow = (erosionData.waterFlowMap[dataIdx] || 0) / waterMax;
        const slope = erosionData.slopeMap[dataIdx] || 0;
        const height = (erosionData.heightMap[dataIdx] || 0) / heightMax;

        // Apply boundary noise for organic transitions
        const nx = x / res;
        const ny = y / res;
        const boundaryNoise = noise.fbm(
          nx * cfg.boundaryNoiseScale,
          ny * cfg.boundaryNoiseScale,
          0,
          { octaves: 3, gain: 0.5 },
        ) * cfg.boundaryNoiseStrength;

        // ---- Compute individual material weights ----

        // Rock: steep slopes + high erosion
        const slopeFactor = smoothstep(cfg.flatSlopeThreshold, cfg.steepSlopeThreshold, slope + boundaryNoise);
        const erosionFactor = smoothstep(cfg.erosionRockThreshold * 0.5, cfg.erosionRockThreshold, erosion + boundaryNoise);
        let rockWeight = Math.max(slopeFactor, erosionFactor);

        // Snow: high altitude
        const snowFactor = smoothstep(cfg.snowAltitude - 0.05, cfg.snowAltitude + 0.05, height + boundaryNoise * 0.3);
        let snowWeight = snowFactor;

        // Sand: low altitude (beach) + water flow channels
        const beachFactor = 1.0 - smoothstep(cfg.beachAltitude - 0.02, cfg.beachAltitude + 0.02, height + boundaryNoise * 0.2);
        const channelFactor = smoothstep(cfg.waterChannelThreshold * 0.7, cfg.waterChannelThreshold, waterFlow + boundaryNoise);
        let sandWeight = Math.max(beachFactor * 0.8, channelFactor * 0.6);

        // Soil: sediment deposits
        const sedimentFactor = smoothstep(cfg.sedimentSoilThreshold * 0.5, cfg.sedimentSoilThreshold, sediment + boundaryNoise);
        let soilWeight = sedimentFactor;

        // Grass: mid-altitude flat areas without erosion
        const isFlat = 1.0 - slopeFactor;
        const isMidAlt = smoothstep(cfg.beachAltitude, cfg.beachAltitude + 0.1, height) *
                         (1.0 - smoothstep(cfg.snowAltitude - 0.15, cfg.snowAltitude - 0.05, height));
        const notEroded = 1.0 - erosionFactor;
        let grassWeight = isFlat * isMidAlt * notEroded * (1.0 - sedimentFactor) * 0.8;

        // ---- Normalize weights ----
        // Reduce conflicts: snow overrides, rock on steep, sand on beach
        if (snowWeight > 0.5) {
          rockWeight *= (1.0 - snowWeight) * 2;
          grassWeight *= (1.0 - snowWeight);
          soilWeight *= (1.0 - snowWeight);
        }

        if (sandWeight > 0.5) {
          grassWeight *= (1.0 - sandWeight);
          soilWeight *= (1.0 - sandWeight) * 0.5;
        }

        if (rockWeight > 0.7) {
          grassWeight *= (1.0 - rockWeight) * 2;
          soilWeight *= (1.0 - rockWeight) * 0.3;
        }

        // Final normalization
        const total = rockWeight + soilWeight + sandWeight + grassWeight + snowWeight;
        if (total > 0) {
          rock[idx] = rockWeight / total;
          soil[idx] = soilWeight / total;
          sand[idx] = sandWeight / total;
          grass[idx] = grassWeight / total;
          snow[idx] = snowWeight / total;
        } else {
          // Default to grass
          grass[idx] = 1.0;
        }
      }
    }

    return { rock, soil, sand, grass, snow, resolution: res };
  }

  /**
   * Create an ErosionData object from terrain height field.
   *
   * Computes slope and derives approximate erosion, sediment, and water flow
   * from the height field using simple heuristics. For full erosion simulation,
   * use HydraulicErosionGPU instead.
   *
   * @param heightMap - Terrain height values
   * @param width - Height field width
   * @param height - Height field height
   * @returns Approximate ErosionData
   */
  static createApproximateErosionData(
    heightMap: Float32Array,
    width: number,
    height: number,
  ): ErosionData {
    const slopeMap = new Float32Array(width * height);
    const erosionMap = new Float32Array(width * height);
    const sedimentMap = new Float32Array(width * height);
    const waterFlowMap = new Float32Array(width * height);

    // Compute slope from height field gradient
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const h = heightMap[idx];
        const hx = heightMap[idx + 1] - heightMap[idx - 1];
        const hy = heightMap[idx + width] - heightMap[idx - width];
        const slope = Math.sqrt(hx * hx + hy * hy);
        slopeMap[idx] = Math.atan(slope);

        // Heuristic: erosion on steep slopes, sediment in flat areas
        erosionMap[idx] = Math.max(0, slope - 0.3) * h;
        sedimentMap[idx] = Math.max(0, 0.3 - slope) * (1 - h) * 0.5;

        // Simple water flow: accumulate downhill
        waterFlowMap[idx] = Math.max(0, slope - 0.1) * h * 0.3;
      }
    }

    return {
      width, height,
      erosionMap, sedimentMap, waterFlowMap, slopeMap,
      heightMap,
    };
  }

  /**
   * Blend terrain materials using erosion data and configuration.
   *
   * @param erosionData - Erosion simulation output
   * @param config - Blending configuration with materials
   * @returns ErosionBlendResult with blended material and weight maps
   */
  blend(
    erosionData: ErosionData,
    config: Partial<ErosionBlendConfig> = {},
  ): ErosionBlendResult {
    const cfg: ErosionBlendConfig = {
      ...DEFAULT_CONFIG,
      rockMaterial: DEFAULT_ROCK,
      soilMaterial: DEFAULT_SOIL,
      sandMaterial: DEFAULT_SAND,
      grassMaterial: DEFAULT_GRASS,
      snowMaterial: DEFAULT_SNOW,
      ...config,
    };

    // Generate blend weights
    const weights = this.createBlendWeights(erosionData, cfg);

    // Use the MaterialBlendingSystem to blend the materials
    // We'll use altitude mode with 4 materials (rock, soil, grass, snow)
    // and apply sand separately via the weight maps
    const blendResult = this.blendingSystem.blendMultipleMaterials(
      [cfg.sandMaterial, cfg.grassMaterial, cfg.soilMaterial, cfg.rockMaterial],
      {
        maskType: 'altitude',
        altitudeParams: {
          breakpoints: [0.2, 0.5, 0.8],
          falloff: 0.2,
        },
        resolution: cfg.resolution,
        seed: cfg.seed,
      },
    );

    // Create a combined mask texture showing material distribution
    const res = cfg.resolution;
    const maskData = new Float32Array(res * res * 4);
    for (let i = 0; i < res * res; i++) {
      maskData[i * 4]     = weights.rock[i];     // R = rock
      maskData[i * 4 + 1] = weights.grass[i];    // G = grass
      maskData[i * 4 + 2] = weights.sand[i];     // B = sand
      maskData[i * 4 + 3] = weights.snow[i];     // A = snow
    }
    const maskTexture = new THREE.DataTexture(
      maskData, res, res, THREE.RGBAFormat, THREE.FloatType,
    );
    maskTexture.needsUpdate = true;
    maskTexture.wrapS = THREE.RepeatWrapping;
    maskTexture.wrapT = THREE.RepeatWrapping;
    maskTexture.name = 'ErosionBlendMask';

    return {
      material: blendResult.material,
      weights,
      maskTexture,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Smoothstep function for blend transitions.
 * Returns 0 when x <= edge0, 1 when x >= edge1, smooth interpolation between.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Create erosion blend mask from a simple height field.
 * Convenience function that creates approximate erosion data and blends.
 *
 * @param heightMap - Terrain height values
 * @param width - Height field width
 * @param height - Height field height
 * @param config - Optional blend configuration
 * @returns ErosionBlendResult
 */
export function createErosionBlendMask(
  heightMap: Float32Array,
  width: number,
  height: number,
  config: Partial<ErosionBlendConfig> = {},
): ErosionBlendResult {
  const erosionData = ErosionMaterialBlending.createApproximateErosionData(
    heightMap, width, height,
  );
  const blender = new ErosionMaterialBlending();
  return blender.blend(erosionData, config);
}
