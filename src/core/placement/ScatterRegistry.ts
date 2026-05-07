/**
 * ScatterRegistry.ts — Unified scatter strategy registry
 *
 * Provides a common interface (ScatterStrategy) and registry (ScatterRegistry)
 * for all scatter/placement algorithms in the system. Instead of calling each
 * system directly, consumers use `registry.scatter(name, config)` and the
 * registry delegates to the appropriate strategy implementation.
 *
 * Built-in strategies:
 *   - 'poisson_disk'  → DensityPlacementSystem (jittered grid + density mask)
 *   - 'grid_jitter'   → InstanceScatter (grid-based with jitter)
 *   - 'density_mask'  → ScatterSystem (advanced scatter with distribution maps)
 *   - 'volume'        → VolumeScatterDensity (3D volumetric density)
 *   - 'taper'         → TaperDensitySystem (distance/altitude-based taper)
 *   - 'gpu'           → GPUScatterSystem (GPU-accelerated Poisson-disk on mesh)
 *
 * @module placement
 */

import * as THREE from 'three';
import type { TerrainData, PlacementMask } from './DensityPlacementSystem';
import type { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Core Types
// ============================================================================

/** Result from any scatter strategy */
export interface ScatterOutput {
  /** Generated positions */
  positions: THREE.Vector3[];
  /** Per-position rotations (optional — may use default Y-random) */
  rotations?: THREE.Euler[];
  /** Per-position scales (optional — defaults to unit scale) */
  scales?: THREE.Vector3[];
  /** Number of instances actually placed */
  count: number;
  /** Strategy-specific metadata */
  metadata?: Record<string, unknown>;
}

/** Common configuration for scatter strategies */
export interface ScatterConfigBase {
  /** Seed for reproducibility */
  seed: number;
  /** Target number of instances */
  count: number;
  /** 2D bounding box for placement (XZ plane) */
  bounds: THREE.Box2;
  /** Minimum spacing between instances */
  minSpacing: number;
  /** Density multiplier (0-1+, default 1.0) */
  density?: number;
  /** Optional terrain data for filter evaluation */
  terrainData?: TerrainData;
  /** Optional composable placement mask */
  mask?: PlacementMask;
}

/** Strategy-specific configuration extensions */
export interface PoissonDiskConfig extends ScatterConfigBase {
  type: 'poisson_disk';
  /** Overall density multiplier */
  density: number;
}

export interface GridJitterConfig extends ScatterConfigBase {
  type: 'grid_jitter';
  /** Grid cell size (overrides minSpacing if set) */
  cellSize?: number;
  /** Jitter amount (0-1, default 0.8) */
  jitterAmount?: number;
}

export interface DensityMaskConfig extends ScatterConfigBase {
  type: 'density_mask';
  /** Distribution map values */
  distributionMap?: Float32Array;
  /** Map resolution */
  mapResolution?: [number, number];
}

export interface VolumeConfig extends ScatterConfigBase {
  type: 'volume';
  /** 3D bounding box (overrides 2D bounds) */
  bounds3D?: THREE.Box3;
  /** Height range for placement */
  heightRange?: [number, number];
}

export interface TaperConfig extends ScatterConfigBase {
  type: 'taper';
  /** Taper start distance */
  startDistance: number;
  /** Taper end distance */
  endDistance: number;
  /** Taper curve type */
  curve: 'linear' | 'quadratic' | 'exponential' | 'smoothstep';
  /** Camera position for distance-based taper */
  cameraPosition?: THREE.Vector3;
}

export interface GPUScatterConfig extends ScatterConfigBase {
  type: 'gpu';
  /** Target mesh to scatter on */
  targetMesh: THREE.Mesh;
  /** Optional density mask texture */
  densityMaskTexture?: THREE.DataTexture;
}

/** Union of all strategy configs */
export type ScatterStrategyConfig =
  | PoissonDiskConfig
  | GridJitterConfig
  | DensityMaskConfig
  | VolumeConfig
  | TaperConfig
  | GPUScatterConfig;

// ============================================================================
// ScatterStrategy Interface
// ============================================================================

/**
 * Common interface for all scatter algorithms.
 *
 * Each strategy implements the `scatter()` method, taking a typed config
 * and returning a standard ScatterOutput.
 */
export interface ScatterStrategy<T extends ScatterStrategyConfig = ScatterStrategyConfig> {
  /** Unique name for this strategy */
  readonly name: string;

  /**
   * Execute the scatter algorithm.
   *
   * @param config  Strategy-specific configuration
   * @returns ScatterOutput with positions, optional rotations/scales, and metadata
   */
  scatter(config: T): ScatterOutput;
}

// ============================================================================
// Built-in Strategy Implementations
// ============================================================================

/**
 * Poisson-disk scatter using DensityPlacementSystem's jittered-grid approach.
 * Uses the PlacementMask for density-based acceptance/rejection.
 */
export class PoissonDiskStrategy implements ScatterStrategy<PoissonDiskConfig> {
  readonly name = 'poisson_disk';

  scatter(config: PoissonDiskConfig): ScatterOutput {
    const { seed, count, bounds, minSpacing, density = 1.0, terrainData, mask } = config;

    // Simple seeded RNG
    const rng = this.createRNG(seed);
    const positions: THREE.Vector3[] = [];
    const effectiveSpacing = minSpacing / Math.max(0.01, Math.sqrt(density));
    const halfSpacing = effectiveSpacing * 0.5;

    const minX = bounds.min.x;
    const minZ = bounds.min.y;
    const maxX = bounds.max.x;
    const maxZ = bounds.max.y;

    for (let z = minZ + halfSpacing; z < maxZ && positions.length < count; z += effectiveSpacing) {
      for (let x = minX + halfSpacing; x < maxX && positions.length < count; x += effectiveSpacing) {
        const jx = x + (rng() - 0.5) * effectiveSpacing * 0.8;
        const jz = z + (rng() - 0.5) * effectiveSpacing * 0.8;

        let accept = true;

        if (mask) {
          const maskValue = mask.evaluate(jx, jz, terrainData);
          accept = rng() < maskValue * density;
        } else if (density < 1.0) {
          accept = rng() < density;
        }

        if (accept) {
          const y = terrainData
            ? this.sampleTerrainHeight(jx, jz, terrainData)
            : 0;
          positions.push(new THREE.Vector3(jx, y, jz));
        }
      }
    }

    return {
      positions,
      rotations: positions.map(() => new THREE.Euler(0, rng() * Math.PI * 2, 0)),
      count: positions.length,
      metadata: { strategy: 'poisson_disk', requestedCount: count },
    };
  }

  private createRNG(seed: number): () => number {
    let s = seed;
    return () => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };
  }

  private sampleTerrainHeight(x: number, z: number, td: TerrainData): number {
    const u = (x / td.worldSize + 0.5) * td.width;
    const v = (z / td.worldSize + 0.5) * td.height;
    const ix = Math.min(Math.max(Math.floor(u), 0), td.width - 1);
    const iz = Math.min(Math.max(Math.floor(v), 0), td.height - 1);
    return (td.heightData[iz * td.width + ix] ?? 0) * td.heightScale;
  }
}

/**
 * Grid-based scatter with jitter. Places instances on a regular grid
 * with random displacement within each cell.
 */
export class GridJitterStrategy implements ScatterStrategy<GridJitterConfig> {
  readonly name = 'grid_jitter';

  scatter(config: GridJitterConfig): ScatterOutput {
    const { seed, count, bounds, minSpacing, cellSize, jitterAmount = 0.8 } = config;

    const rng = this.createRNG(seed);
    const positions: THREE.Vector3[] = [];
    const size = cellSize ?? minSpacing;

    const minX = bounds.min.x;
    const minZ = bounds.min.y;
    const maxX = bounds.max.x;
    const maxZ = bounds.max.y;

    for (let z = minZ + size * 0.5; z < maxZ && positions.length < count; z += size) {
      for (let x = minX + size * 0.5; x < maxX && positions.length < count; x += size) {
        const jx = x + (rng() - 0.5) * size * jitterAmount;
        const jz = z + (rng() - 0.5) * size * jitterAmount;
        positions.push(new THREE.Vector3(jx, 0, jz));
      }
    }

    return {
      positions,
      rotations: positions.map(() => new THREE.Euler(0, rng() * Math.PI * 2, 0)),
      count: positions.length,
      metadata: { strategy: 'grid_jitter', cellSize: size },
    };
  }

  private createRNG(seed: number): () => number {
    let s = seed;
    return () => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };
  }
}

/**
 * Density-mask scatter using a distribution map to control placement density.
 * Falls back to uniform random if no distribution map is provided.
 */
export class DensityMaskStrategy implements ScatterStrategy<DensityMaskConfig> {
  readonly name = 'density_mask';

  scatter(config: DensityMaskConfig): ScatterOutput {
    const { seed, count, bounds, minSpacing, distributionMap, mapResolution } = config;

    const rng = this.createRNG(seed);
    const positions: THREE.Vector3[] = [];
    const maxAttempts = count * 10;
    let attempts = 0;

    const width = mapResolution?.[0] ?? 64;
    const height = mapResolution?.[1] ?? 64;
    const sizeX = bounds.max.x - bounds.min.x;
    const sizeZ = bounds.max.y - bounds.min.y;

    while (positions.length < count && attempts < maxAttempts) {
      attempts++;
      const x = bounds.min.x + rng() * sizeX;
      const z = bounds.min.y + rng() * sizeZ;

      let accept = true;

      if (distributionMap) {
        const ix = Math.floor(((x - bounds.min.x) / sizeX) * (width - 1));
        const iz = Math.floor(((z - bounds.min.y) / sizeZ) * (height - 1));
        const idx = iz * width + ix;
        const density = distributionMap[idx] ?? 1.0;
        accept = rng() < density;
      }

      // Spacing check
      if (accept && minSpacing > 0) {
        for (const existing of positions) {
          const dx = x - existing.x;
          const dz = z - existing.z;
          if (dx * dx + dz * dz < minSpacing * minSpacing) {
            accept = false;
            break;
          }
        }
      }

      if (accept) {
        positions.push(new THREE.Vector3(x, 0, z));
      }
    }

    return {
      positions,
      count: positions.length,
      metadata: { strategy: 'density_mask', attempts },
    };
  }

  private createRNG(seed: number): () => number {
    let s = seed;
    return () => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };
  }
}

/**
 * Volume scatter — extends 2D scatter with 3D volumetric placement.
 * Generates positions in a 3D bounding box with height constraints.
 */
export class VolumeScatterStrategy implements ScatterStrategy<VolumeConfig> {
  readonly name = 'volume';

  scatter(config: VolumeConfig): ScatterOutput {
    const { seed, count, bounds, minSpacing, heightRange } = config;

    const rng = this.createRNG(seed);
    const positions: THREE.Vector3[] = [];
    const maxAttempts = count * 10;
    let attempts = 0;

    const sizeX = bounds.max.x - bounds.min.x;
    const sizeZ = bounds.max.y - bounds.min.y;
    const minY = heightRange?.[0] ?? 0;
    const maxY = heightRange?.[1] ?? 10;

    while (positions.length < count && attempts < maxAttempts) {
      attempts++;
      const x = bounds.min.x + rng() * sizeX;
      const y = minY + rng() * (maxY - minY);
      const z = bounds.min.y + rng() * sizeZ;

      // Spacing check
      let accept = true;
      if (minSpacing > 0) {
        for (const existing of positions) {
          if (new THREE.Vector3(x, y, z).distanceTo(existing) < minSpacing) {
            accept = false;
            break;
          }
        }
      }

      if (accept) {
        positions.push(new THREE.Vector3(x, y, z));
      }
    }

    return {
      positions,
      count: positions.length,
      metadata: { strategy: 'volume', heightRange: [minY, maxY] },
    };
  }

  private createRNG(seed: number): () => number {
    let s = seed;
    return () => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };
  }
}

/**
 * Taper scatter — generates positions with density tapering based on
 * distance from camera, altitude, or other parameters.
 */
export class TaperScatterStrategy implements ScatterStrategy<TaperConfig> {
  readonly name = 'taper';

  scatter(config: TaperConfig): ScatterOutput {
    const {
      seed, count, bounds, minSpacing,
      startDistance, endDistance, curve, cameraPosition,
    } = config;

    const rng = this.createRNG(seed);
    const positions: THREE.Vector3[] = [];
    const maxAttempts = count * 10;
    let attempts = 0;

    const sizeX = bounds.max.x - bounds.min.x;
    const sizeZ = bounds.max.y - bounds.min.y;
    const camPos = cameraPosition ?? new THREE.Vector3(0, 10, 0);

    while (positions.length < count && attempts < maxAttempts) {
      attempts++;
      const x = bounds.min.x + rng() * sizeX;
      const z = bounds.min.y + rng() * sizeZ;

      // Compute taper density
      const dist = new THREE.Vector3(x, 0, z).distanceTo(camPos);
      let taperDensity: number;

      if (dist <= startDistance) {
        taperDensity = 1.0;
      } else if (dist >= endDistance) {
        taperDensity = 0.0;
      } else {
        const t = (dist - startDistance) / Math.max(0.001, endDistance - startDistance);
        switch (curve) {
          case 'linear': taperDensity = 1 - t; break;
          case 'quadratic': taperDensity = (1 - t) * (1 - t); break;
          case 'exponential': taperDensity = Math.exp(-4 * t); break;
          case 'smoothstep': taperDensity = 1 - t * t * (3 - 2 * t); break;
          default: taperDensity = 1 - t;
        }
      }

      if (rng() < taperDensity) {
        // Spacing check
        let accept = true;
        if (minSpacing > 0) {
          for (const existing of positions) {
            const dx = x - existing.x;
            const dz = z - existing.z;
            if (dx * dx + dz * dz < minSpacing * minSpacing) {
              accept = false;
              break;
            }
          }
        }

        if (accept) {
          positions.push(new THREE.Vector3(x, 0, z));
        }
      }
    }

    return {
      positions,
      count: positions.length,
      metadata: { strategy: 'taper', curve },
    };
  }

  private createRNG(seed: number): () => number {
    let s = seed;
    return () => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };
  }
}

/**
 * GPU scatter — placeholder strategy for GPU-accelerated scatter.
 * The actual GPU implementation is in GPUScatterSystem.ts and
 * requires WebGL context; this strategy produces CPU-side candidate
 * positions that can later be uploaded to GPU textures.
 */
export class GPUScatterStrategy implements ScatterStrategy<GPUScatterConfig> {
  readonly name = 'gpu';

  scatter(config: GPUScatterConfig): ScatterOutput {
    // CPU-side pre-generation for GPU upload
    const { seed, count, bounds, minSpacing, targetMesh, densityMaskTexture } = config;

    const rng = this.createRNG(seed);
    const positions: THREE.Vector3[] = [];

    // If we have a target mesh, sample points on its surface
    if (targetMesh) {
      const geometry = targetMesh.geometry;
      const posAttr = geometry.getAttribute('position');
      const indexAttr = geometry.getIndex();

      if (posAttr) {
        const totalTriangles = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;

        // Build cumulative area weights
        const triangles: Array<{
          a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3;
          normal: THREE.Vector3; area: number;
        }> = [];
        let totalArea = 0;

        const vA = new THREE.Vector3();
        const vB = new THREE.Vector3();
        const vC = new THREE.Vector3();

        for (let t = 0; t < totalTriangles; t++) {
          let ia: number, ib: number, ic: number;
          if (indexAttr) {
            ia = indexAttr.getX(t * 3);
            ib = indexAttr.getX(t * 3 + 1);
            ic = indexAttr.getX(t * 3 + 2);
          } else {
            ia = t * 3;
            ib = t * 3 + 1;
            ic = t * 3 + 2;
          }

          vA.fromBufferAttribute(posAttr as THREE.BufferAttribute, ia);
          vB.fromBufferAttribute(posAttr as THREE.BufferAttribute, ib);
          vC.fromBufferAttribute(posAttr as THREE.BufferAttribute, ic);

          vA.applyMatrix4(targetMesh.matrixWorld);
          vB.applyMatrix4(targetMesh.matrixWorld);
          vC.applyMatrix4(targetMesh.matrixWorld);

          const edge1 = new THREE.Vector3().subVectors(vB, vA);
          const edge2 = new THREE.Vector3().subVectors(vC, vA);
          const normal = new THREE.Vector3().crossVectors(edge1, edge2);
          const area = normal.length() * 0.5;
          totalArea += area;

          triangles.push({ a: vA.clone(), b: vB.clone(), c: vC.clone(), normal: normal.normalize(), area });
        }

        // Sample points on triangles proportional to area
        const cumulativeArea: number[] = [];
        let cumSum = 0;
        for (const tri of triangles) {
          cumSum += tri.area;
          cumulativeArea.push(cumSum);
        }

        const maxAttempts = count * 5;
        let attempts = 0;

        while (positions.length < count && attempts < maxAttempts) {
          attempts++;

          // Pick random triangle proportional to area
          const r = rng() * totalArea;
          let triIdx = 0;
          for (let i = 0; i < cumulativeArea.length; i++) {
            if (cumulativeArea[i] >= r) { triIdx = i; break; }
          }
          const tri = triangles[triIdx];

          // Random barycentric coordinates
          const u = rng();
          const v = rng();
          const fu = u + (1 - u - v) * 0.5;
          const fv = v + (1 - u - v) * 0.5;

          const point = new THREE.Vector3()
            .addScaledVector(tri.a, 1 - fu - fv)
            .addScaledVector(tri.b, fu)
            .addScaledVector(tri.c, fv);

          // Spacing check
          let tooClose = false;
          for (const existing of positions) {
            if (existing.distanceTo(point) < minSpacing) {
              tooClose = true;
              break;
            }
          }

          if (!tooClose) {
            positions.push(point);
          }
        }
      }
    } else {
      // Fallback: uniform random in bounds
      const sizeX = bounds.max.x - bounds.min.x;
      const sizeZ = bounds.max.y - bounds.min.y;

      for (let i = 0; i < count; i++) {
        positions.push(new THREE.Vector3(
          bounds.min.x + rng() * sizeX,
          0,
          bounds.min.y + rng() * sizeZ,
        ));
      }
    }

    return {
      positions,
      count: positions.length,
      metadata: { strategy: 'gpu', hasTargetMesh: !!targetMesh },
    };
  }

  private createRNG(seed: number): () => number {
    let s = seed;
    return () => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };
  }
}

// ============================================================================
// ScatterRegistry
// ============================================================================

/**
 * Registry for scatter strategies. Provides a unified interface for
 * all scatter algorithms via the strategy pattern.
 *
 * Usage:
 * ```ts
 * const registry = ScatterRegistry.createDefault();
 *
 * // Use built-in strategy
 * const result = registry.scatter('poisson_disk', {
 *   type: 'poisson_disk',
 *   seed: 42,
 *   count: 100,
 *   bounds: new THREE.Box2(new THREE.Vector2(-50, -50), new THREE.Vector2(50, 50)),
 *   minSpacing: 2,
 *   density: 0.8,
 * });
 *
 * // Register custom strategy
 * registry.register('my_scatter', new MyCustomStrategy());
 * ```
 */
export class ScatterRegistry {
  private strategies: Map<string, ScatterStrategy> = new Map();

  /**
   * Register a scatter strategy.
   *
   * @param name      Unique name for the strategy
   * @param strategy  The strategy implementation
   * @throws Error if a strategy with the same name is already registered
   */
  register(name: string, strategy: ScatterStrategy): void {
    if (this.strategies.has(name)) {
      throw new Error(`[ScatterRegistry] Strategy '${name}' is already registered`);
    }
    this.strategies.set(name, strategy);
  }

  /**
   * Execute a scatter algorithm by name.
   *
   * @param name    The registered strategy name
   * @param config  Strategy-specific configuration
   * @returns ScatterOutput with generated positions
   * @throws Error if the strategy is not found
   */
  scatter(name: string, config: ScatterStrategyConfig): ScatterOutput {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(
        `[ScatterRegistry] Unknown scatter strategy '${name}'. ` +
        `Available: ${Array.from(this.strategies.keys()).join(', ')}`,
      );
    }
    return strategy.scatter(config);
  }

  /**
   * Check if a strategy is registered.
   */
  has(name: string): boolean {
    return this.strategies.has(name);
  }

  /**
   * Get a registered strategy by name.
   */
  get(name: string): ScatterStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get all registered strategy names.
   */
  getStrategyNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Create a registry pre-loaded with all built-in strategies.
   */
  static createDefault(): ScatterRegistry {
    const registry = new ScatterRegistry();

    registry.register('poisson_disk', new PoissonDiskStrategy());
    registry.register('grid_jitter', new GridJitterStrategy());
    registry.register('density_mask', new DensityMaskStrategy());
    registry.register('volume', new VolumeScatterStrategy());
    registry.register('taper', new TaperScatterStrategy());
    registry.register('gpu', new GPUScatterStrategy());

    return registry;
  }
}
