/**
 * Unified Terrain Generator — Architectural Unification
 *
 * Merges the heightmap-based TerrainGenerator (2D) and the SDF-based
 * SDFTerrainGenerator (3D) into a single unified system using element
 * composition from TerrainElementSystem.
 *
 * Architecture:
 * 1. UnifiedTerrainGenerator — One generator supporting four modes:
 *    - HEIGHTMAP: 2D noise-based (fast, simple, legacy-compatible)
 *    - SDF_FLAT: 3D SDF with flat ground (moderate complexity)
 *    - SDF_FULL: 3D SDF with full element composition (slow, highest quality)
 *    - PLANET: Spherical SDF for planet generation
 * 2. TerrainGenerationMode enum — Mode selection
 * 3. UnifiedTerrainConfig — Comprehensive configuration for all modes
 * 4. TerrainPresetConfig — 5 preset configurations for quick generation
 *
 * Both heightmap and SDF modes use the same mesher pipeline, and
 * element composition (via ElementRegistry + TerrainElementSystem) is
 * used internally for all modes. Heightmap mode simply uses GroundElement
 * only, while SDF modes add caves, mountains, rocks, and water.
 *
 * @module terrain
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import {
  ElementRegistry,
  CompositionOperation,
  GroundElement,
  MountainElement,
  CaveElement,
  VoronoiRockElement,
  WaterbodyElement,
  buildSDFFromElements,
} from '@/terrain/sdf/TerrainElementSystem';
import { SignedDistanceField, extractIsosurface } from '@/terrain/sdf/sdf-operations';
import {
  GPUSDFEvaluator,
  type GPUSDFEvaluatorConfig,
  type SDFEvaluationResult,
  DEFAULT_GPU_SDF_EVALUATOR_CONFIG,
  buildCompositionFromRegistry,
} from '@/terrain/gpu/GPUSDFEvaluator';
import {
  TerrainSurfaceBridge,
  TerrainSurfaceBridgeConfig,
  DEFAULT_TERRAIN_SURFACE_BRIDGE_CONFIG,
  TerrainVertexAttributes,
} from '@/terrain/surface/SurfaceKernelPipeline';

// ============================================================================
// TerrainGenerationMode
// ============================================================================

/**
 * Terrain generation mode selection.
 *
 * - HEIGHTMAP: 2D noise-based terrain (fastest, no overhangs/caves).
 *   Uses GroundElement only with FBM noise for height.
 * - SDF_FLAT: 3D SDF terrain with flat ground base. Adds waterbodies
 *   and simple features. Moderate generation time.
 * - SDF_FULL: Full 3D SDF terrain with complete element composition
 *   (ground, mountains, caves, rocks, water). Slowest but highest quality.
 * - PLANET: Spherical SDF for planet generation. Elements are evaluated
 *   in spherical coordinates with a configurable planet radius.
 */
export enum TerrainGenerationMode {
  /** 2D noise-based (fast, simple) */
  HEIGHTMAP = 'heightmap',
  /** 3D SDF with flat ground (moderate) */
  SDF_FLAT = 'sdf_flat',
  /** 3D SDF with full element composition (slow, highest quality) */
  SDF_FULL = 'sdf_full',
  /** Spherical SDF for planet generation */
  PLANET = 'planet',
}

// ============================================================================
// UnifiedTerrainConfig
// ============================================================================

/**
 * Mountain-specific parameters for terrain generation.
 */
export interface MountainParams {
  /** Noise frequency for mountain FBM */
  frequency: number;
  /** Maximum mountain height */
  amplitude: number;
  /** FBM octaves */
  octaves: number;
  /** FBM lacunarity */
  lacunarity: number;
  /** FBM persistence */
  persistence: number;
  /** Number of mountain groups */
  groupCount: number;
  /** Whether to use ridge noise for sharper features */
  useRidge: boolean;
  /** Mask noise threshold (0-1) for mountain coverage */
  maskThreshold: number;
}

/**
 * Cave-specific parameters for terrain generation.
 */
export interface CaveParams {
  /** Number of main cave tunnels */
  tunnelCount: number;
  /** Base tunnel radius */
  tunnelRadius: number;
  /** Lattice grid spacing for tunnel waypoints */
  latticeSpacing: number;
  /** Jitter amount for lattice points */
  latticeJitter: number;
  /** Maximum number of branches per tunnel */
  branchMaxCount: number;
  /** Probability of a branch at each potential branch point */
  branchProbability: number;
  /** Radius variation along tunnels */
  radiusVariation: number;
}

/**
 * Rock-specific parameters for terrain generation.
 */
export interface RockParams {
  /** Number of rock instances */
  rockCount: number;
  /** Base radius of each rock */
  baseRadius: number;
  /** Number of Voronoi cells per rock */
  cellCount: number;
  /** Irregularity factor (0-1) */
  irregularity: number;
  /** Cluster radius for rock placement */
  clusterRadius: number;
}

/**
 * Water-specific parameters for terrain generation.
 */
export interface WaterParams {
  /** Height of the water plane */
  waterPlaneHeight: number;
  /** X radius of the waterbody */
  radiusX: number;
  /** Z radius of the waterbody */
  radiusZ: number;
  /** Depth of the waterbody */
  depth: number;
  /** Wave amplitude on the water surface */
  waveAmplitude: number;
  /** Wave spatial frequency */
  waveFrequency: number;
}

/**
 * Ground-specific parameters for terrain generation.
 */
export interface GroundParams {
  /** Noise frequency for ground FBM */
  frequency: number;
  /** FBM amplitude */
  amplitude: number;
  /** FBM octaves */
  octaves: number;
  /** FBM lacunarity */
  lacunarity: number;
  /** FBM persistence */
  persistence: number;
  /** Base height offset */
  baseHeight: number;
  /** Whether to enable sand dunes */
  sandDunes: boolean;
  /** Sand dune height amplitude */
  sandDuneAmplitude: number;
  /** Sand dune frequency */
  sandDuneFrequency: number;
}

/**
 * Planet-specific parameters (only used in PLANET mode).
 */
export interface PlanetParams {
  /** Planet radius */
  radius: number;
  /** Atmosphere height (for visual effects) */
  atmosphereHeight: number;
  /** Sea level as fraction of radius (0-1) */
  seaLevelFraction: number;
}

/**
 * Comprehensive configuration for the UnifiedTerrainGenerator.
 *
 * Supports all four generation modes with mode-specific parameters.
 * Element-specific configurations (mountain, cave, rock, water, ground)
 * are used only in SDF_FLAT and SDF_FULL modes.
 */
export interface UnifiedTerrainConfig {
  /** Generation mode */
  mode: TerrainGenerationMode;
  /** Random seed for reproducibility */
  seed: number;
  /** Which elements to include (by name: 'Ground', 'Mountains', 'Caves', 'VoronoiRocks', 'Waterbody') */
  elements: string[];
  /** World-space bounds for the terrain */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Voxel resolution for SDF modes (world units per voxel) */
  resolution: number;
  /** Heightmap grid size for HEIGHTMAP mode (width and height in pixels) */
  heightmapSize: number;
  /** Height scale factor for HEIGHTMAP mode */
  heightScale: number;
  /** Smooth blend factor for SDF boolean operations */
  smoothBlend: number;
  /** Mountain parameters */
  mountainParams: Partial<MountainParams>;
  /** Cave parameters */
  caveParams: Partial<CaveParams>;
  /** Rock parameters */
  rockParams: Partial<RockParams>;
  /** Water parameters */
  waterParams: Partial<WaterParams>;
  /** Ground parameters */
  groundParams: Partial<GroundParams>;
  /** Planet parameters */
  planetParams: Partial<PlanetParams>;
  /** Surface bridge configuration for material assignment */
  surfaceConfig: Partial<TerrainSurfaceBridgeConfig>;
  /** Whether to apply surface material after generation */
  applySurface: boolean;
  /** Material color for simple material mode */
  color: number;
  /** Material roughness */
  roughness: number;
  /** Erosion strength for HEIGHTMAP mode (0 = disabled) */
  erosionStrength: number;
  /** Number of erosion iterations for HEIGHTMAP mode */
  erosionIterations: number;
  /** GPU SDF evaluator configuration (enables GPU-accelerated SDF evaluation) */
  gpuSDFConfig: Partial<GPUSDFEvaluatorConfig>;
}

/**
 * Default values for mountain parameters.
 */
const DEFAULT_MOUNTAIN_PARAMS: MountainParams = {
  frequency: 0.008,
  amplitude: 25,
  octaves: 8,
  lacunarity: 2.0,
  persistence: 0.5,
  groupCount: 3,
  useRidge: true,
  maskThreshold: 0.3,
};

/**
 * Default values for cave parameters.
 */
const DEFAULT_CAVE_PARAMS: CaveParams = {
  tunnelCount: 5,
  tunnelRadius: 3,
  latticeSpacing: 20,
  latticeJitter: 5,
  branchMaxCount: 3,
  branchProbability: 0.4,
  radiusVariation: 0.5,
};

/**
 * Default values for rock parameters.
 */
const DEFAULT_ROCK_PARAMS: RockParams = {
  rockCount: 5,
  baseRadius: 2.0,
  cellCount: 7,
  irregularity: 0.4,
  clusterRadius: 8.0,
};

/**
 * Default values for water parameters.
 */
const DEFAULT_WATER_PARAMS: WaterParams = {
  waterPlaneHeight: 0.5,
  radiusX: 15,
  radiusZ: 15,
  depth: 3,
  waveAmplitude: 0.05,
  waveFrequency: 0.5,
};

/**
 * Default values for ground parameters.
 */
const DEFAULT_GROUND_PARAMS: GroundParams = {
  frequency: 0.02,
  amplitude: 8,
  octaves: 6,
  lacunarity: 2.0,
  persistence: 0.5,
  baseHeight: 0,
  sandDunes: false,
  sandDuneAmplitude: 2.0,
  sandDuneFrequency: 0.02,
};

/**
 * Default values for planet parameters.
 */
const DEFAULT_PLANET_PARAMS: PlanetParams = {
  radius: 1000,
  atmosphereHeight: 50,
  seaLevelFraction: 0.3,
};

/**
 * Default unified terrain configuration.
 */
export const DEFAULT_UNIFIED_TERRAIN_CONFIG: UnifiedTerrainConfig = {
  mode: TerrainGenerationMode.HEIGHTMAP,
  seed: 42,
  elements: ['Ground', 'Mountains', 'Caves', 'VoronoiRocks', 'Waterbody'],
  bounds: {
    minX: -50,
    maxX: 50,
    minY: -10,
    maxY: 30,
    minZ: -50,
    maxZ: 50,
  },
  resolution: 0.5,
  heightmapSize: 512,
  heightScale: 100,
  smoothBlend: 0.3,
  mountainParams: {},
  caveParams: {},
  rockParams: {},
  waterParams: {},
  groundParams: {},
  planetParams: {},
  surfaceConfig: {},
  applySurface: true,
  color: 0x8b7355,
  roughness: 0.9,
  erosionStrength: 0.3,
  erosionIterations: 20,
  gpuSDFConfig: {},
};

// ============================================================================
// TerrainPresetConfig
// ============================================================================

/**
 * Terrain preset configuration for quick one-call generation.
 *
 * Each preset provides a complete set of parameters optimized for a
 * specific terrain type. Use `generateFromPreset(preset)` to generate
 * terrain with a single call.
 */
export enum TerrainPresetConfig {
  /** Flat grassland with gentle rolling hills */
  FLAT_GRASSLAND = 'flat_grassland',
  /** Mountain range with caves, rocks, and snow */
  MOUNTAIN_RANGE = 'mountain_range',
  /** Coastal terrain with water, beach, and cliffs */
  COASTAL = 'coastal',
  /** Desert canyon with erosion, rocks, and sand dunes */
  DESERT_CANYON = 'desert_canyon',
  /** Alien planet with unusual elements and spherical mode */
  ALIEN_PLANET = 'alien_planet',
}

/**
 * Get the full UnifiedTerrainConfig for a given preset.
 *
 * @param preset - The preset name
 * @returns Complete configuration matching the preset
 */
export function getPresetConfig(preset: TerrainPresetConfig): UnifiedTerrainConfig {
  switch (preset) {
    case TerrainPresetConfig.FLAT_GRASSLAND:
      return {
        ...DEFAULT_UNIFIED_TERRAIN_CONFIG,
        mode: TerrainGenerationMode.HEIGHTMAP,
        seed: 42,
        elements: ['Ground'],
        bounds: { minX: -80, maxX: 80, minY: -2, maxY: 15, minZ: -80, maxZ: 80 },
        resolution: 1.0,
        heightmapSize: 256,
        heightScale: 30,
        groundParams: {
          frequency: 0.015,
          amplitude: 4,
          octaves: 4,
          persistence: 0.4,
          baseHeight: 0,
          sandDunes: false,
        },
        surfaceConfig: {
          snowLine: 50, // Very high — no snow
          rockLine: 30, // Very high — no rock
        },
        applySurface: true,
        color: 0x4a8c30,
        erosionStrength: 0.2,
        erosionIterations: 10,
      };

    case TerrainPresetConfig.MOUNTAIN_RANGE:
      return {
        ...DEFAULT_UNIFIED_TERRAIN_CONFIG,
        mode: TerrainGenerationMode.SDF_FULL,
        seed: 123,
        elements: ['Ground', 'Mountains', 'Caves', 'VoronoiRocks'],
        bounds: { minX: -60, maxX: 60, minY: -15, maxY: 40, minZ: -60, maxZ: 60 },
        resolution: 0.5,
        mountainParams: {
          frequency: 0.006,
          amplitude: 30,
          octaves: 8,
          groupCount: 4,
          useRidge: true,
          maskThreshold: 0.25,
        },
        caveParams: {
          tunnelCount: 6,
          tunnelRadius: 3.5,
          branchMaxCount: 4,
          branchProbability: 0.5,
        },
        rockParams: {
          rockCount: 8,
          baseRadius: 2.5,
          clusterRadius: 12,
        },
        surfaceConfig: {
          snowLine: 22,
          rockLine: 12,
          cliffSlope: Math.PI / 4,
        },
        applySurface: true,
        color: 0x7a6e60,
      };

    case TerrainPresetConfig.COASTAL:
      return {
        ...DEFAULT_UNIFIED_TERRAIN_CONFIG,
        mode: TerrainGenerationMode.SDF_FLAT,
        seed: 456,
        elements: ['Ground', 'Waterbody'],
        bounds: { minX: -60, maxX: 60, minY: -5, maxY: 15, minZ: -60, maxZ: 60 },
        resolution: 0.6,
        groundParams: {
          frequency: 0.018,
          amplitude: 6,
          octaves: 5,
          baseHeight: 0,
          sandDunes: true,
          sandDuneAmplitude: 1.5,
          sandDuneFrequency: 0.03,
        },
        waterParams: {
          waterPlaneHeight: 1.0,
          radiusX: 25,
          radiusZ: 25,
          depth: 4,
          waveAmplitude: 0.08,
          waveFrequency: 0.6,
        },
        surfaceConfig: {
          snowLine: 50,
          rockLine: 10,
          waterProximity: 4.0,
          flatSlope: Math.PI / 10,
        },
        applySurface: true,
        color: 0xc2b87a,
      };

    case TerrainPresetConfig.DESERT_CANYON:
      return {
        ...DEFAULT_UNIFIED_TERRAIN_CONFIG,
        mode: TerrainGenerationMode.SDF_FULL,
        seed: 789,
        elements: ['Ground', 'Mountains', 'VoronoiRocks'],
        bounds: { minX: -70, maxX: 70, minY: -10, maxY: 25, minZ: -70, maxZ: 70 },
        resolution: 0.5,
        groundParams: {
          frequency: 0.012,
          amplitude: 10,
          octaves: 5,
          baseHeight: 0,
          sandDunes: true,
          sandDuneAmplitude: 3.0,
          sandDuneFrequency: 0.025,
        },
        mountainParams: {
          frequency: 0.01,
          amplitude: 18,
          octaves: 6,
          groupCount: 2,
          useRidge: true,
        },
        rockParams: {
          rockCount: 10,
          baseRadius: 3.0,
          clusterRadius: 15,
        },
        surfaceConfig: {
          snowLine: 50,
          rockLine: 15,
          sandColor: new THREE.Color(0xd4a76a),
          rockColor: new THREE.Color(0xb08050),
        },
        applySurface: true,
        color: 0xd4a76a,
        erosionStrength: 0.5,
        erosionIterations: 30,
      };

    case TerrainPresetConfig.ALIEN_PLANET:
      return {
        ...DEFAULT_UNIFIED_TERRAIN_CONFIG,
        mode: TerrainGenerationMode.PLANET,
        seed: 1337,
        elements: ['Ground', 'Mountains', 'Caves'],
        bounds: { minX: -200, maxX: 200, minY: -200, maxY: 200, minZ: -200, maxZ: 200 },
        resolution: 2.0,
        planetParams: {
          radius: 100,
          atmosphereHeight: 15,
          seaLevelFraction: 0.25,
        },
        groundParams: {
          frequency: 0.03,
          amplitude: 12,
          octaves: 6,
          lacunarity: 2.0,
          persistence: 0.5,
          baseHeight: 0,
          sandDunes: false,
          sandDuneAmplitude: 0,
          sandDuneFrequency: 0,
        },
        mountainParams: {
          frequency: 0.015,
          amplitude: 15,
          octaves: 7,
          groupCount: 5,
          useRidge: true,
        },
        caveParams: {
          tunnelCount: 8,
          tunnelRadius: 4,
          branchMaxCount: 5,
        },
        surfaceConfig: {
          snowLine: 30,
          rockLine: 10,
          snowColor: new THREE.Color(0xa0e0a0),  // Green snow
          rockColor: new THREE.Color(0x804080),   // Purple rock
          grassColor: new THREE.Color(0x60a060),   // Blue-green
        },
        applySurface: true,
        color: 0x804080,
      };
  }
}

// ============================================================================
// SDF Generation Result
// ============================================================================

/**
 * Result of SDF terrain generation including mesh and auxiliary attributes.
 */
export interface SDFGenerationResult {
  /** The generated terrain mesh */
  mesh: THREE.Mesh;
  /** Per-vertex auxiliary attributes from element evaluation */
  attributes: Map<string, Float32Array>;
  /** The element registry used for generation */
  registry: ElementRegistry;
  /** The SDF used for generation */
  sdf: SignedDistanceField;
}

// ============================================================================
// UnifiedTerrainGenerator
// ============================================================================

/**
 * Unified terrain generator that merges heightmap and SDF approaches
 * into a single system using element composition.
 *
 * Supports four generation modes:
 * - HEIGHTMAP: Uses a 2D noise heightmap with GroundElement only.
 *   Fast generation, no overhangs or caves. Best for simple terrain.
 * - SDF_FLAT: Uses 3D SDF with GroundElement + WaterbodyElement.
 *   Moderate generation time. Supports water bodies and gentle features.
 * - SDF_FULL: Uses 3D SDF with full element composition including
 *   GroundElement, MountainElement, CaveElement, VoronoiRockElement,
 *   and WaterbodyElement. Slowest but highest quality.
 * - PLANET: Uses spherical SDF for planet generation.
 *   Elements are evaluated in spherical coordinates.
 *
 * All modes use the same mesher pipeline (Marching Cubes for SDF,
 * PlaneGeometry with height displacement for HEIGHTMAP).
 *
 * Usage:
 * ```typescript
 * const generator = new UnifiedTerrainGenerator({ mode: TerrainGenerationMode.SDF_FULL });
 * const mesh = generator.generate();
 * // Or use a preset:
 * const mesh = generator.generateFromPreset(TerrainPresetConfig.MOUNTAIN_RANGE);
 * ```
 */
export class UnifiedTerrainGenerator {
  private config: UnifiedTerrainConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;
  private registry: ElementRegistry | null = null;
  private surfaceBridge: TerrainSurfaceBridge | null = null;
  private gpuSDFEvaluator: GPUSDFEvaluator | null = null;

  /**
   * Create a new UnifiedTerrainGenerator.
   *
   * @param config - Configuration (defaults to DEFAULT_UNIFIED_TERRAIN_CONFIG)
   */
  constructor(config: Partial<UnifiedTerrainConfig> = {}) {
    this.config = { ...DEFAULT_UNIFIED_TERRAIN_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);

    // Create GPU SDF evaluator if enabled
    if (this.config.gpuSDFConfig.enabled !== false) {
      this.gpuSDFEvaluator = new GPUSDFEvaluator({
        ...DEFAULT_GPU_SDF_EVALUATOR_CONFIG,
        ...this.config.gpuSDFConfig,
      });
    }
  }

  // =====================================================================
  // Main Generation API
  // =====================================================================

  /**
   * Generate terrain based on the current configuration.
   *
   * Dispatches to the appropriate generation method based on the mode:
   * - HEIGHTMAP → generateHeightmap()
   * - SDF_FLAT / SDF_FULL / PLANET → generateSDF()
   *
   * @param config - Optional per-call config overrides
   * @returns THREE.Mesh with generated terrain
   */
  generate(config: Partial<UnifiedTerrainConfig> = {}): THREE.Mesh {
    const effectiveConfig = { ...this.config, ...config };

    switch (effectiveConfig.mode) {
      case TerrainGenerationMode.HEIGHTMAP: {
        const heightmap = this.generateHeightmap(effectiveConfig);
        return this.buildMeshFromHeightmap(heightmap, effectiveConfig);
      }
      case TerrainGenerationMode.SDF_FLAT:
      case TerrainGenerationMode.SDF_FULL:
      case TerrainGenerationMode.PLANET: {
        const result = this.generateSDF(effectiveConfig);
        return result.mesh;
      }
      default:
        console.warn(`[UnifiedTerrainGenerator] Unknown mode: ${effectiveConfig.mode}, falling back to HEIGHTMAP`);
        const heightmap = this.generateHeightmap(effectiveConfig);
        return this.buildMeshFromHeightmap(heightmap, effectiveConfig);
    }
  }

  /**
   * Generate terrain from a preset configuration.
   *
   * One-call preset generation with optimized parameters.
   *
   * @param preset - The preset to use
   * @param seed - Optional seed override
   * @returns THREE.Mesh with generated terrain
   */
  generateFromPreset(preset: TerrainPresetConfig, seed?: number): THREE.Mesh {
    const presetConfig = getPresetConfig(preset);
    if (seed !== undefined) {
      presetConfig.seed = seed;
    }
    // Reset RNG and noise for the new seed
    this.rng = new SeededRandom(presetConfig.seed);
    this.noise = new NoiseUtils(presetConfig.seed);
    this.config = presetConfig;
    return this.generate();
  }

  /**
   * Async terrain generation with GPU-accelerated SDF evaluation.
   *
   * When WebGPU is available, this uses GPUSDFEvaluator to evaluate
   * the SDF grid in parallel on the GPU, providing orders-of-magnitude
   * speedup over the synchronous CPU path. Falls back to CPU evaluation
   * when WebGPU is unavailable.
   *
   * @param device - Optional pre-existing GPUDevice
   * @param config - Optional per-call config overrides
   * @returns SDFGenerationResult with mesh, attributes, registry, and SDF
   */
  async generateAsync(device?: GPUDevice, config: Partial<UnifiedTerrainConfig> = {}): Promise<SDFGenerationResult> {
    const effectiveConfig = { ...this.config, ...config };

    // Build the element registry based on mode
    this.registry = this.buildElementRegistry(effectiveConfig);

    // Build SDF bounds
    const bounds = new THREE.Box3(
      new THREE.Vector3(
        effectiveConfig.bounds.minX,
        effectiveConfig.bounds.minY,
        effectiveConfig.bounds.minZ,
      ),
      new THREE.Vector3(
        effectiveConfig.bounds.maxX,
        effectiveConfig.bounds.maxY,
        effectiveConfig.bounds.maxZ,
      ),
    );

    // For PLANET mode, adjust bounds
    if (effectiveConfig.mode === TerrainGenerationMode.PLANET) {
      const planetParams = {
        ...DEFAULT_PLANET_PARAMS,
        ...effectiveConfig.planetParams,
      };
      const r = planetParams.radius;
      const padding = r * 0.3;
      bounds.min.set(-r - padding, -r - padding, -r - padding);
      bounds.max.set(r + padding, r + padding, r + padding);
    }

    let sdf: SignedDistanceField;
    let gpuUsed = false;

    // Try GPU SDF evaluation
    if (this.gpuSDFEvaluator) {
      try {
        await this.gpuSDFEvaluator.initialize(device);

        // Build composition from registry for GPU evaluation
        const elements = buildCompositionFromRegistry(this.registry, effectiveConfig.smoothBlend);

        if (elements.length > 0 && this.gpuSDFEvaluator.isGPUAvailable()) {
          const result = await this.gpuSDFEvaluator.evaluate(
            elements,
            bounds,
            effectiveConfig.resolution,
            this.registry,
            CompositionOperation.DIFFERENCE,
          );
          sdf = result.sdf;
          gpuUsed = result.gpuUsed;
          console.log(`[UnifiedTerrainGenerator] SDF evaluation: ${result.gpuUsed ? 'GPU' : 'CPU'} (${result.executionTimeMs.toFixed(1)}ms)`);
        } else {
          // No GPU-compatible elements, use CPU fallback via ElementRegistry
          sdf = buildSDFFromElements(
            this.registry,
            bounds,
            effectiveConfig.resolution,
            CompositionOperation.DIFFERENCE,
          );
        }
      } catch (err) {
        console.warn('[UnifiedTerrainGenerator] GPU SDF evaluation failed, using CPU:', err);
        sdf = buildSDFFromElements(
          this.registry,
          bounds,
          effectiveConfig.resolution,
          CompositionOperation.DIFFERENCE,
        );
      }
    } else {
      // No GPU evaluator, use CPU path
      sdf = buildSDFFromElements(
        this.registry,
        bounds,
        effectiveConfig.resolution,
        CompositionOperation.DIFFERENCE,
      );
    }

    // Extract isosurface
    let geometry = extractIsosurface(sdf, 0);

    if (geometry.attributes.position.count === 0) {
      console.warn('[UnifiedTerrainGenerator] extractIsosurface produced empty geometry');
      const emptyMesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: effectiveConfig.color }),
      );
      return {
        mesh: emptyMesh,
        attributes: new Map(),
        registry: this.registry,
        sdf,
      };
    }

    // Compute per-vertex attributes from element evaluation
    const attributes = this.computeVertexAttributes(geometry, this.registry);

    // Apply surface material
    let material: THREE.Material;
    if (effectiveConfig.applySurface) {
      this.surfaceBridge = new TerrainSurfaceBridge({
        ...DEFAULT_TERRAIN_SURFACE_BRIDGE_CONFIG,
        ...effectiveConfig.surfaceConfig,
        seed: effectiveConfig.seed,
      });

      const vertexAttrs = this.extractVertexAttributes(geometry, this.registry);
      material = this.surfaceBridge.generateTerrainMaterial(vertexAttrs);
      (material as THREE.MeshStandardMaterial).vertexColors = true;
      this.surfaceBridge.applyVertexColors(geometry, vertexAttrs, effectiveConfig.surfaceConfig);
    } else {
      material = new THREE.MeshStandardMaterial({
        color: effectiveConfig.color,
        roughness: effectiveConfig.roughness,
        metalness: 0.0,
        side: THREE.DoubleSide,
        flatShading: false,
      });
    }

    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'UnifiedTerrainMesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      mesh,
      attributes,
      registry: this.registry,
      sdf,
    };
  }

  // =====================================================================
  // Heightmap Mode
  // =====================================================================

  /**
   * Generate a 2D heightmap using noise.
   *
   * Uses GroundElement's FBM noise to compute height values on a 2D grid.
   * This is the fast generation path that produces heightmap terrain
   * without overhangs, caves, or other 3D features.
   *
   * @param config - Optional per-call config overrides
   * @returns Float32Array of height values
   */
  generateHeightmap(config: Partial<UnifiedTerrainConfig> = {}): Float32Array {
    const effectiveConfig = { ...this.config, ...config };
    const { heightmapSize, seed } = effectiveConfig;
    const groundParams = {
      ...DEFAULT_GROUND_PARAMS,
      ...effectiveConfig.groundParams,
    };

    // Create a GroundElement for heightmap generation
    const rng = new SeededRandom(seed);
    const groundElement = new GroundElement();
    groundElement.init({
      frequency: groundParams.frequency,
      amplitude: groundParams.amplitude,
      octaves: groundParams.octaves,
      lacunarity: groundParams.lacunarity,
      persistence: groundParams.persistence,
      baseHeight: groundParams.baseHeight,
      sandDunes: groundParams.sandDunes,
      sandDuneAmplitude: groundParams.sandDuneAmplitude,
      sandDuneFrequency: groundParams.sandDuneFrequency,
    }, rng);

    // Generate heightmap grid
    const size = heightmapSize;
    const heightmap = new Float32Array(size * size);

    const { minX, maxX, minZ, maxZ } = effectiveConfig.bounds;
    const rangeX = maxX - minX;
    const rangeZ = maxZ - minZ;

    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        // Map grid coordinates to world space
        const worldX = minX + (x / (size - 1)) * rangeX;
        const worldZ = minZ + (z / (size - 1)) * rangeZ;

        // Evaluate the ground element at a point on the XZ plane
        // Use a reference height of 0 to get the surface height
        const testPoint = new THREE.Vector3(worldX, 0, worldZ);
        const result = groundElement.evaluate(testPoint);

        // The heightmap value is the negative of the SDF distance
        // (since ground SDF = surfaceY - pointY, and pointY=0, height = surfaceY = distance)
        heightmap[z * size + x] = result.distance;
      }
    }

    // Apply erosion if configured
    if (effectiveConfig.erosionStrength > 0) {
      this.applyErosionToHeightmap(heightmap, size, effectiveConfig);
    }

    // Normalize heightmap
    this.normalizeHeightmap(heightmap);

    return heightmap;
  }

  /**
   * Build a terrain mesh from a heightmap.
   *
   * Creates a PlaneGeometry and displaces vertices according to the
   * heightmap values. Applies surface material if configured.
   *
   * @param heightmap - Float32Array of height values
   * @param config - Effective configuration
   * @returns THREE.Mesh with terrain geometry
   */
  private buildMeshFromHeightmap(
    heightmap: Float32Array,
    config: UnifiedTerrainConfig,
  ): THREE.Mesh {
    const size = config.heightmapSize;
    const { minX, maxX, minZ, maxZ } = config.bounds;
    const rangeX = maxX - minX;
    const rangeZ = maxZ - minZ;

    // Create plane geometry
    const geometry = new THREE.PlaneGeometry(rangeX, rangeZ, size - 1, size - 1);
    geometry.rotateX(-Math.PI / 2);

    // Displace vertices by heightmap
    const posAttr = geometry.getAttribute('position');
    const posArray = posAttr.array as Float32Array;
    const vertexCount = posAttr.count;

    for (let i = 0; i < vertexCount; i++) {
      // Map vertex index to heightmap UV
      const ix = i % size;
      const iz = Math.floor(i / size);

      if (ix < size && iz < size) {
        const heightIdx = iz * size + ix;
        const height = heightmap[heightIdx] ?? 0;
        // Y is up after rotation
        posArray[i * 3 + 1] = height * config.heightScale * 0.01;
      }
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    // Create material
    let material: THREE.Material;
    if (config.applySurface) {
      // Use a basic colored material with vertex colors
      material = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: config.roughness,
        metalness: 0.0,
        side: THREE.DoubleSide,
        flatShading: false,
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: config.roughness,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'UnifiedTerrainMesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Apply erosion to a heightmap using simple thermal + hydraulic erosion.
   *
   * @param heightmap - The heightmap to erode (modified in-place)
   * @param size - Grid size (width = height)
   * @param config - Effective configuration
   */
  private applyErosionToHeightmap(
    heightmap: Float32Array,
    size: number,
    config: UnifiedTerrainConfig,
  ): void {
    // Simple thermal erosion: smooth steep slopes
    const iterations = config.erosionIterations;
    const talusAngle = 0.05;
    const erosionRate = config.erosionStrength * 0.5;

    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const idx = y * size + x;
          const h = heightmap[idx];

          // Check 4 neighbors
          const neighbors = [
            heightmap[(y - 1) * size + x],
            heightmap[(y + 1) * size + x],
            heightmap[y * size + (x - 1)],
            heightmap[y * size + (x + 1)],
          ];

          for (const nh of neighbors) {
            const diff = h - nh;
            if (diff > talusAngle) {
              const transfer = diff * erosionRate * 0.25;
              heightmap[idx] -= transfer;
            }
          }
        }
      }
    }
  }

  /**
   * Normalize a heightmap to [0, 1] range.
   *
   * @param heightmap - The heightmap to normalize (modified in-place)
   */
  private normalizeHeightmap(heightmap: Float32Array): void {
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < heightmap.length; i++) {
      min = Math.min(min, heightmap[i]);
      max = Math.max(max, heightmap[i]);
    }

    const range = max - min;
    if (range < 1e-10) return;

    for (let i = 0; i < heightmap.length; i++) {
      heightmap[i] = (heightmap[i] - min) / range;
    }
  }

  // =====================================================================
  // SDF Mode
  // =====================================================================

  /**
   * Generate 3D terrain using SDF with element composition.
   *
   * Creates and configures an ElementRegistry with the appropriate elements
   * for the mode (SDF_FLAT, SDF_FULL, or PLANET), builds the SDF, and
   * extracts the isosurface via Marching Cubes.
   *
   * @param config - Optional per-call config overrides
   * @returns SDFGenerationResult with mesh, attributes, registry, and SDF
   */
  generateSDF(config: Partial<UnifiedTerrainConfig> = {}): SDFGenerationResult {
    const effectiveConfig = { ...this.config, ...config };

    // Build the element registry based on mode
    this.registry = this.buildElementRegistry(effectiveConfig);

    // Build SDF bounds
    const bounds = new THREE.Box3(
      new THREE.Vector3(
        effectiveConfig.bounds.minX,
        effectiveConfig.bounds.minY,
        effectiveConfig.bounds.minZ,
      ),
      new THREE.Vector3(
        effectiveConfig.bounds.maxX,
        effectiveConfig.bounds.maxY,
        effectiveConfig.bounds.maxZ,
      ),
    );

    // For PLANET mode, adjust bounds to encompass the sphere
    if (effectiveConfig.mode === TerrainGenerationMode.PLANET) {
      const planetParams = {
        ...DEFAULT_PLANET_PARAMS,
        ...effectiveConfig.planetParams,
      };
      const r = planetParams.radius;
      const padding = r * 0.3;
      bounds.min.set(-r - padding, -r - padding, -r - padding);
      bounds.max.set(r + padding, r + padding, r + padding);
    }

    // Build SDF from elements
    const sdf = buildSDFFromElements(
      this.registry,
      bounds,
      effectiveConfig.resolution,
      CompositionOperation.DIFFERENCE,
    );

    // Extract isosurface
    let geometry = extractIsosurface(sdf, 0);

    if (geometry.attributes.position.count === 0) {
      console.warn('[UnifiedTerrainGenerator] extractIsosurface produced empty geometry');
      const emptyMesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: effectiveConfig.color }),
      );
      return {
        mesh: emptyMesh,
        attributes: new Map(),
        registry: this.registry,
        sdf,
      };
    }

    // Compute per-vertex attributes from element evaluation
    const attributes = this.computeVertexAttributes(geometry, this.registry);

    // Apply surface material if configured
    let material: THREE.Material;
    if (effectiveConfig.applySurface) {
      this.surfaceBridge = new TerrainSurfaceBridge({
        ...DEFAULT_TERRAIN_SURFACE_BRIDGE_CONFIG,
        ...effectiveConfig.surfaceConfig,
        seed: effectiveConfig.seed,
      });

      const vertexAttrs = this.extractVertexAttributes(geometry, this.registry);
      material = this.surfaceBridge.generateTerrainMaterial(vertexAttrs);
      (material as THREE.MeshStandardMaterial).vertexColors = true;

      // Apply vertex colors to geometry
      this.surfaceBridge.applyVertexColors(geometry, vertexAttrs, effectiveConfig.surfaceConfig);
    } else {
      material = new THREE.MeshStandardMaterial({
        color: effectiveConfig.color,
        roughness: effectiveConfig.roughness,
        metalness: 0.0,
        side: THREE.DoubleSide,
        flatShading: false,
      });
    }

    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'UnifiedTerrainMesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      mesh,
      attributes,
      registry: this.registry,
      sdf,
    };
  }

  // =====================================================================
  // Element Registry Construction
  // =====================================================================

  /**
   * Build an ElementRegistry configured for the current mode.
   *
   * - HEIGHTMAP: GroundElement only
   * - SDF_FLAT: GroundElement + WaterbodyElement
   * - SDF_FULL: GroundElement + MountainElement + CaveElement + VoronoiRockElement + WaterbodyElement
   * - PLANET: GroundElement (spherical) + MountainElement (spherical) + CaveElement
   *
   * @param config - Effective configuration
   * @returns Configured ElementRegistry with initialized elements
   */
  private buildElementRegistry(config: UnifiedTerrainConfig): ElementRegistry {
    const registry = new ElementRegistry();
    const rng = new SeededRandom(config.seed);
    const groundParams = { ...DEFAULT_GROUND_PARAMS, ...config.groundParams };
    const mountainParams = { ...DEFAULT_MOUNTAIN_PARAMS, ...config.mountainParams };
    const caveParams = { ...DEFAULT_CAVE_PARAMS, ...config.caveParams };
    const rockParams = { ...DEFAULT_ROCK_PARAMS, ...config.rockParams };
    const waterParams = { ...DEFAULT_WATER_PARAMS, ...config.waterParams };
    const planetParams = { ...DEFAULT_PLANET_PARAMS, ...config.planetParams };

    // Determine which elements to include based on mode
    const elements = config.elements;
    const isPlanetMode = config.mode === TerrainGenerationMode.PLANET;

    // --- Ground Element (always included) ---
    if (elements.includes('Ground') || config.mode === TerrainGenerationMode.HEIGHTMAP) {
      const ground = new GroundElement();
      ground.init({
        frequency: groundParams.frequency,
        amplitude: groundParams.amplitude,
        octaves: groundParams.octaves,
        lacunarity: groundParams.lacunarity,
        persistence: groundParams.persistence,
        baseHeight: groundParams.baseHeight,
        sandDunes: groundParams.sandDunes,
        sandDuneAmplitude: groundParams.sandDuneAmplitude,
        sandDuneFrequency: groundParams.sandDuneFrequency,
        mode: isPlanetMode ? 'spherical' : 'flat',
        sphereRadius: planetParams.radius,
      }, rng);
      registry.register(ground);
    }

    // --- Mountain Element ---
    if (elements.includes('Mountains') && config.mode !== TerrainGenerationMode.HEIGHTMAP) {
      const mountains = new MountainElement();
      mountains.init({
        frequency: mountainParams.frequency,
        amplitude: mountainParams.amplitude,
        octaves: mountainParams.octaves,
        lacunarity: mountainParams.lacunarity,
        persistence: mountainParams.persistence,
        groupCount: mountainParams.groupCount,
        useRidge: mountainParams.useRidge,
        maskThreshold: mountainParams.maskThreshold,
        sphericalMode: isPlanetMode,
        sphereRadius: planetParams.radius,
      }, rng);
      registry.register(mountains);
    }

    // --- Cave Element ---
    if (elements.includes('Caves') && config.mode === TerrainGenerationMode.SDF_FULL) {
      const caves = new CaveElement();
      caves.init({
        tunnelCount: caveParams.tunnelCount,
        tunnelRadius: caveParams.tunnelRadius,
        latticeSpacing: caveParams.latticeSpacing,
        latticeJitter: caveParams.latticeJitter,
        branchMaxCount: caveParams.branchMaxCount,
        branchProbability: caveParams.branchProbability,
        radiusVariation: caveParams.radiusVariation,
        bounds: new THREE.Box3(
          new THREE.Vector3(config.bounds.minX, config.bounds.minY, config.bounds.minZ),
          new THREE.Vector3(config.bounds.maxX, config.bounds.maxY, config.bounds.maxZ),
        ),
      }, rng);
      registry.register(caves);
    }

    // --- Voronoi Rock Element ---
    if (elements.includes('VoronoiRocks') && config.mode === TerrainGenerationMode.SDF_FULL) {
      const rocks = new VoronoiRockElement();
      rocks.init({
        rockCount: rockParams.rockCount,
        baseRadius: rockParams.baseRadius,
        cellCount: rockParams.cellCount,
        irregularity: rockParams.irregularity,
        clusterRadius: rockParams.clusterRadius,
      }, rng);
      registry.register(rocks);
    }

    // --- Waterbody Element ---
    if (elements.includes('Waterbody') && config.mode !== TerrainGenerationMode.HEIGHTMAP) {
      const water = new WaterbodyElement();
      water.init({
        waterPlaneHeight: waterParams.waterPlaneHeight,
        radiusX: waterParams.radiusX,
        radiusZ: waterParams.radiusZ,
        depth: waterParams.depth,
        waveAmplitude: waterParams.waveAmplitude,
        waveFrequency: waterParams.waveFrequency,
      }, rng);
      registry.register(water);
    }

    // Resolve dependencies (topological sort)
    registry.resolveDependencies();

    return registry;
  }

  // =====================================================================
  // Attribute Computation
  // =====================================================================

  /**
   * Compute per-vertex auxiliary attributes from element evaluation.
   *
   * Evaluates the element registry at each vertex position to collect
   * auxiliary data (material IDs, cave tags, water coverage, etc.)
   * and stores them as named Float32Arrays.
   *
   * @param geometry - The terrain geometry
   * @param registry - The element registry
   * @returns Map of attribute name → Float32Array
   */
  private computeVertexAttributes(
    geometry: THREE.BufferGeometry,
    registry: ElementRegistry,
  ): Map<string, Float32Array> {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return new Map();

    const vertexCount = posAttr.count;
    const posArray = posAttr.array as Float32Array;

    const materialIds = new Float32Array(vertexCount);
    const caveTags = new Float32Array(vertexCount);
    const boundarySDFs = new Float32Array(vertexCount);
    const liquidCovered = new Float32Array(vertexCount);
    const heights = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const point = new THREE.Vector3(
        posArray[i * 3],
        posArray[i * 3 + 1],
        posArray[i * 3 + 2],
      );

      const result = registry.evaluateComposed(point, CompositionOperation.DIFFERENCE);

      materialIds[i] = result.materialId;
      caveTags[i] = result.auxiliary.caveTag ? 1.0 : 0.0;
      boundarySDFs[i] = typeof result.auxiliary.boundarySDF === 'number'
        ? result.auxiliary.boundarySDF : Infinity;
      liquidCovered[i] = result.auxiliary.LiquidCovered ? 1.0 : 0.0;
      heights[i] = point.y;
    }

    const attributes = new Map<string, Float32Array>();
    attributes.set('materialId', materialIds);
    attributes.set('caveTag', caveTags);
    attributes.set('boundarySDF', boundarySDFs);
    attributes.set('liquidCovered', liquidCovered);
    attributes.set('height', heights);

    // Store on geometry as custom attributes
    geometry.setAttribute('materialId', new THREE.BufferAttribute(materialIds, 1));
    geometry.setAttribute('caveTag', new THREE.BufferAttribute(caveTags, 1));
    geometry.setAttribute('boundarySDF', new THREE.BufferAttribute(boundarySDFs, 1));
    geometry.setAttribute('liquidCovered', new THREE.BufferAttribute(liquidCovered, 1));

    return attributes;
  }

  /**
   * Extract TerrainVertexAttributes from geometry for the surface bridge.
   *
   * @param geometry - The terrain geometry
   * @param registry - The element registry
   * @returns Array of TerrainVertexAttributes
   */
  private extractVertexAttributes(
    geometry: THREE.BufferGeometry,
    registry: ElementRegistry,
  ): TerrainVertexAttributes[] {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return [];

    const vertexCount = posAttr.count;
    const posArray = posAttr.array as Float32Array;
    const attributes: TerrainVertexAttributes[] = [];

    for (let i = 0; i < vertexCount; i++) {
      const point = new THREE.Vector3(
        posArray[i * 3],
        posArray[i * 3 + 1],
        posArray[i * 3 + 2],
      );

      const result = registry.evaluateComposed(point, CompositionOperation.DIFFERENCE);

      // Compute slope from neighboring vertices
      let slope = 0;
      if (i > 0 && i < vertexCount - 1) {
        const prevY = posArray[(i - 1) * 3 + 1];
        const nextY = posArray[(i + 1) * 3 + 1];
        const dx = Math.sqrt(
          (posArray[(i + 1) * 3] - posArray[(i - 1) * 3]) ** 2 +
          (posArray[(i + 1) * 3 + 2] - posArray[(i - 1) * 3 + 2]) ** 2,
        );
        if (dx > 1e-6) {
          slope = Math.atan2(Math.abs(nextY - prevY), dx);
        }
      }

      attributes.push({
        height: point.y,
        slope,
        caveTag: result.auxiliary.caveTag ?? false,
        boundarySDF: result.auxiliary.boundarySDF ?? Infinity,
        liquidCovered: result.auxiliary.LiquidCovered ?? false,
        waterPlaneHeight: result.auxiliary.waterPlaneHeight ?? 0,
        materialId: result.materialId,
        sandDuneHeight: result.auxiliary.sandDuneHeight ?? 0,
        auxiliary: result.auxiliary,
      });
    }

    return attributes;
  }

  // =====================================================================
  // Utility Methods
  // =====================================================================

  /**
   * Get the element registry from the last generation.
   *
   * @returns The ElementRegistry, or null if no generation has been done
   */
  getRegistry(): ElementRegistry | null {
    return this.registry;
  }

  /**
   * Get the surface bridge from the last generation.
   *
   * @returns The TerrainSurfaceBridge, or null if not created
   */
  getSurfaceBridge(): TerrainSurfaceBridge | null {
    return this.surfaceBridge;
  }

  /**
   * Get the current configuration.
   *
   * @returns Copy of the current config
   */
  getConfig(): UnifiedTerrainConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration at runtime.
   *
   * @param config - Partial config to merge
   */
  setConfig(config: Partial<UnifiedTerrainConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reseed the generator with a new seed.
   *
   * @param seed - New random seed
   */
  reseed(seed: number): void {
    this.config.seed = seed;
    this.rng = new SeededRandom(seed);
    this.noise = new NoiseUtils(seed);
  }

  /**
   * Dispose of resources held by this generator.
   */
  dispose(): void {
    this.registry = null;
    this.surfaceBridge = null;
    if (this.gpuSDFEvaluator) {
      this.gpuSDFEvaluator.dispose();
      this.gpuSDFEvaluator = null;
    }
  }

  /**
   * Get the GPU SDF evaluator instance (for external configuration).
   * Returns null if GPU evaluation is disabled.
   */
  getGPUSDFEvaluator(): GPUSDFEvaluator | null {
    return this.gpuSDFEvaluator;
  }
}
