/**
 * UnifiedScatterSystem — Single entry point for all scatter operations
 *
 * Consolidates the previously fragmented scatter systems:
 *   - GPUScatterSystem
 *   - ScatterSystem (advanced/)
 *   - InstanceScatter
 *   - VolumeScatterDensity
 *   - TaperDensitySystem
 *   - ScatterP2Features
 *
 * Consumers use this class instead of importing individual scatter modules.
 * Internally delegates to ScatterRegistry strategies.
 *
 * Usage:
 * ```ts
 * const system = UnifiedScatterSystem.createDefault();
 *
 * // Quick scatter using named strategies
 * const result = system.scatterPoisson({ seed: 42, count: 100, ... });
 *
 * // Generic scatter entry point
 * const result = system.scatter('grid_jitter', { type: 'grid_jitter', ... });
 *
 * // Scatter on terrain (auto-projects positions)
 * const terrainResult = system.scatterOnTerrain('poisson_disk', config, terrainData);
 *
 * // Create instanced mesh from scatter result
 * const mesh = system.createInstancedMesh(geometry, material, result);
 * ```
 *
 * @module placement
 */

import * as THREE from 'three';
import {
  ScatterRegistry,
  type ScatterStrategy,
  type ScatterStrategyConfig,
  type ScatterOutput,
  type PoissonDiskConfig,
  type GridJitterConfig,
  type DensityMaskConfig,
  type VolumeConfig,
  type TaperConfig,
  type GPUScatterConfig,
} from './ScatterRegistry';
import type { TerrainData } from './DensityPlacementSystem';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the UnifiedScatterSystem.
 * Controls which scatter strategies are available and default parameters.
 */
export interface UnifiedScatterConfig {
  /** Default seed for reproducibility */
  defaultSeed: number;
  /** Default minimum spacing between instances */
  defaultMinSpacing: number;
  /** Default density multiplier */
  defaultDensity: number;
  /** Default bounds for scatter operations (2D: XZ plane) */
  defaultBounds: THREE.Box2;
  /** Whether to auto-project positions onto terrain height */
  autoProjectOnTerrain: boolean;
  /** Custom scatter registry (if not provided, uses default) */
  scatterRegistry?: ScatterRegistry;
}

/**
 * Default configuration for the UnifiedScatterSystem.
 */
export const DEFAULT_UNIFIED_SCATTER_CONFIG: UnifiedScatterConfig = {
  defaultSeed: 42,
  defaultMinSpacing: 2.0,
  defaultDensity: 1.0,
  defaultBounds: new THREE.Box2(
    new THREE.Vector2(-50, -50),
    new THREE.Vector2(50, 50),
  ),
  autoProjectOnTerrain: false,
};

// ============================================================================
// UnifiedScatterSystem
// ============================================================================

/**
 * Facade class that provides a simple API for all scatter operations.
 *
 * Instead of importing and configuring individual scatter systems
 * (GPUScatterSystem, ScatterSystem, InstanceScatter, etc.), consumers
 * use this single class which delegates to the appropriate ScatterRegistry
 * strategy.
 *
 * The class provides:
 *   - Named convenience methods for each built-in strategy
 *   - A generic `scatter()` entry point
 *   - Terrain projection via `scatterOnTerrain()`
 *   - InstancedMesh creation via `createInstancedMesh()`
 */
export class UnifiedScatterSystem {
  private registry: ScatterRegistry;
  private config: UnifiedScatterConfig;

  constructor(config: Partial<UnifiedScatterConfig> = {}) {
    this.config = { ...DEFAULT_UNIFIED_SCATTER_CONFIG, ...config };
    this.registry = this.config.scatterRegistry ?? ScatterRegistry.createDefault();
  }

  // --------------------------------------------------------------------------
  // Generic scatter entry point
  // --------------------------------------------------------------------------

  /**
   * Execute a scatter algorithm by strategy name.
   *
   * @param name    The registered scatter strategy name
   * @param config  Strategy-specific configuration
   * @returns ScatterOutput with generated positions
   */
  scatter(name: string, config: ScatterStrategyConfig): ScatterOutput {
    return this.registry.scatter(name, config);
  }

  // --------------------------------------------------------------------------
  // Named convenience methods
  // --------------------------------------------------------------------------

  /**
   * Poisson-disk scatter using jittered grid with density mask.
   *
   * Produces a natural-looking distribution with minimum spacing guarantees.
   * Best for vegetation, rocks, and other organic scatter patterns.
   *
   * @param overrides  Partial config overrides (merged with defaults)
   * @returns ScatterOutput with positions and optional rotations/scales
   */
  scatterPoisson(overrides: Partial<PoissonDiskConfig> = {}): ScatterOutput {
    const config: PoissonDiskConfig = {
      type: 'poisson_disk',
      seed: overrides.seed ?? this.config.defaultSeed,
      count: overrides.count ?? 100,
      bounds: overrides.bounds ?? this.config.defaultBounds,
      minSpacing: overrides.minSpacing ?? this.config.defaultMinSpacing,
      density: overrides.density ?? this.config.defaultDensity,
      terrainData: overrides.terrainData,
      mask: overrides.mask,
    };
    return this.registry.scatter('poisson_disk', config);
  }

  /**
   * Grid-based scatter with jitter.
   *
   * Places instances on a regular grid with random displacement.
   * Best for structured patterns like orchards, crop fields, or city grids.
   *
   * @param overrides  Partial config overrides (merged with defaults)
   * @returns ScatterOutput with positions
   */
  scatterGrid(overrides: Partial<GridJitterConfig> = {}): ScatterOutput {
    const config: GridJitterConfig = {
      type: 'grid_jitter',
      seed: overrides.seed ?? this.config.defaultSeed,
      count: overrides.count ?? 100,
      bounds: overrides.bounds ?? this.config.defaultBounds,
      minSpacing: overrides.minSpacing ?? this.config.defaultMinSpacing,
      cellSize: overrides.cellSize,
      jitterAmount: overrides.jitterAmount ?? 0.8,
    };
    return this.registry.scatter('grid_jitter', config);
  }

  /**
   * Density-mask scatter using a distribution map.
   *
   * Controls placement density via a Float32Array distribution map.
   * Best for heterogeneous density patterns like population maps.
   *
   * @param overrides  Partial config overrides (merged with defaults)
   * @returns ScatterOutput with positions
   */
  scatterDensityMask(overrides: Partial<DensityMaskConfig> = {}): ScatterOutput {
    const config: DensityMaskConfig = {
      type: 'density_mask',
      seed: overrides.seed ?? this.config.defaultSeed,
      count: overrides.count ?? 100,
      bounds: overrides.bounds ?? this.config.defaultBounds,
      minSpacing: overrides.minSpacing ?? this.config.defaultMinSpacing,
      distributionMap: overrides.distributionMap,
      mapResolution: overrides.mapResolution,
    };
    return this.registry.scatter('density_mask', config);
  }

  /**
   * Volumetric scatter with height constraints.
   *
   * Generates positions in a 3D bounding box with height range.
   * Best for underwater placement, aerial scatter, or layered environments.
   *
   * @param overrides  Partial config overrides (merged with defaults)
   * @returns ScatterOutput with 3D positions
   */
  scatterVolume(overrides: Partial<VolumeConfig> = {}): ScatterOutput {
    const config: VolumeConfig = {
      type: 'volume',
      seed: overrides.seed ?? this.config.defaultSeed,
      count: overrides.count ?? 100,
      bounds: overrides.bounds ?? this.config.defaultBounds,
      minSpacing: overrides.minSpacing ?? this.config.defaultMinSpacing,
      bounds3D: overrides.bounds3D,
      heightRange: overrides.heightRange ?? [0, 10],
    };
    return this.registry.scatter('volume', config);
  }

  /**
   * Taper scatter with distance-based density falloff.
   *
   * Generates positions with density tapering based on distance from camera.
   * Best for LOD-aware placement where distant objects are sparser.
   *
   * @param overrides  Partial config overrides (merged with defaults)
   * @returns ScatterOutput with positions
   */
  scatterTaper(overrides: Partial<TaperConfig> = {}): ScatterOutput {
    const config: TaperConfig = {
      type: 'taper',
      seed: overrides.seed ?? this.config.defaultSeed,
      count: overrides.count ?? 100,
      bounds: overrides.bounds ?? this.config.defaultBounds,
      minSpacing: overrides.minSpacing ?? this.config.defaultMinSpacing,
      startDistance: overrides.startDistance ?? 10,
      endDistance: overrides.endDistance ?? 100,
      curve: overrides.curve ?? 'linear',
      cameraPosition: overrides.cameraPosition,
    };
    return this.registry.scatter('taper', config);
  }

  /**
   * GPU-accelerated scatter on a target mesh surface.
   *
   * Samples points on a mesh surface with optional density mask texture.
   * Best for scattering on complex geometry like terrain meshes.
   *
   * @param overrides  Partial config overrides (merged with defaults)
   * @returns ScatterOutput with surface-sampled positions
   */
  scatterGpu(overrides: Partial<GPUScatterConfig> = {}): ScatterOutput {
    if (!overrides.targetMesh) {
      throw new Error('[UnifiedScatterSystem] scatterGpu requires a targetMesh');
    }
    const config: GPUScatterConfig = {
      type: 'gpu',
      seed: overrides.seed ?? this.config.defaultSeed,
      count: overrides.count ?? 100,
      bounds: overrides.bounds ?? this.config.defaultBounds,
      minSpacing: overrides.minSpacing ?? this.config.defaultMinSpacing,
      targetMesh: overrides.targetMesh,
      densityMaskTexture: overrides.densityMaskTexture,
    };
    return this.registry.scatter('gpu', config);
  }

  // --------------------------------------------------------------------------
  // Terrain-aware scatter
  // --------------------------------------------------------------------------

  /**
   * Scatter with automatic terrain projection.
   *
   * Executes a scatter strategy and then projects the resulting positions
   * onto the terrain height field. The Y coordinate of each position is
   * replaced with the terrain height at that (X, Z) location.
   *
   * @param name        The registered scatter strategy name
   * @param config      Strategy-specific configuration
   * @param terrainData Terrain height data for projection
   * @returns ScatterOutput with Y positions projected onto terrain
   */
  scatterOnTerrain(
    name: string,
    config: ScatterStrategyConfig,
    terrainData: TerrainData,
  ): ScatterOutput {
    const result = this.registry.scatter(name, config);

    // Project each position onto the terrain
    for (let i = 0; i < result.positions.length; i++) {
      result.positions[i].y = this.sampleTerrainHeight(
        result.positions[i].x,
        result.positions[i].z,
        terrainData,
      );
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // InstancedMesh creation
  // --------------------------------------------------------------------------

  /**
   * Create an InstancedMesh from a scatter result.
   *
   * Takes a base geometry and material, and creates an InstancedMesh
   * with instance matrices set from the scatter output positions,
   * rotations, and scales.
   *
   * @param geometry      Base geometry for each instance
   * @param material      Material for the mesh
   * @param scatterResult Output from a scatter operation
   * @returns InstancedMesh with instance transforms applied
   */
  createInstancedMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    scatterResult: ScatterOutput,
  ): THREE.InstancedMesh {
    const count = scatterResult.count;
    const mesh = new THREE.InstancedMesh(geometry, material, count);

    const dummy = new THREE.Object3D();
    const defaultRotation = new THREE.Euler(0, 0, 0);
    const defaultScale = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < count; i++) {
      dummy.position.copy(scatterResult.positions[i] ?? new THREE.Vector3());

      const rotation = scatterResult.rotations?.[i] ?? defaultRotation;
      dummy.rotation.copy(rotation);

      const scale = scatterResult.scales?.[i] ?? defaultScale;
      dummy.scale.copy(scale);

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Registry access
  // --------------------------------------------------------------------------

  /**
   * Get the underlying ScatterRegistry.
   */
  getRegistry(): ScatterRegistry {
    return this.registry;
  }

  /**
   * Register a custom scatter strategy.
   */
  registerStrategy(name: string, strategy: ScatterStrategy): void {
    this.registry.register(name, strategy);
  }

  /**
   * Check if a strategy is registered.
   */
  hasStrategy(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * Get all registered strategy names.
   */
  getStrategyNames(): string[] {
    return this.registry.getStrategyNames();
  }

  // --------------------------------------------------------------------------
  // Factory
  // --------------------------------------------------------------------------

  /**
   * Create a UnifiedScatterSystem with default configuration.
   */
  static createDefault(): UnifiedScatterSystem {
    return new UnifiedScatterSystem();
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  /**
   * Sample terrain height at a world-space (X, Z) position.
   *
   * Uses bilinear interpolation on the height field for smooth results.
   */
  private sampleTerrainHeight(x: number, z: number, td: TerrainData): number {
    // Map world position to height field UV
    const u = (x / td.worldSize + 0.5) * td.width;
    const v = (z / td.worldSize + 0.5) * td.height;

    // Bilinear interpolation
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, td.width - 1);
    const z1 = Math.min(z0 + 1, td.height - 1);

    const fx = u - x0;
    const fz = v - z0;

    const clampedX0 = Math.max(0, Math.min(x0, td.width - 1));
    const clampedZ0 = Math.max(0, Math.min(z0, td.height - 1));

    const h00 = td.heightData[clampedZ0 * td.width + clampedX0] ?? 0;
    const h10 = td.heightData[clampedZ0 * td.width + x1] ?? 0;
    const h01 = td.heightData[z1 * td.width + clampedX0] ?? 0;
    const h11 = td.heightData[z1 * td.width + x1] ?? 0;

    // Bilinear interpolation
    const h = h00 * (1 - fx) * (1 - fz) +
              h10 * fx * (1 - fz) +
              h01 * (1 - fx) * fz +
              h11 * fx * fz;

    return h * td.heightScale;
  }
}
