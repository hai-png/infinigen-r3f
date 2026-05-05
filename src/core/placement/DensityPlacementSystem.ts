/**
 * DensityPlacementSystem.ts
 *
 * Two-phase density-based placement pipeline that mirrors the original
 * Infinigen scatter_placeholders → populate_all workflow.
 *
 * Phase 1 (scatterPlaceholders): A PlacementMask is evaluated over a 2D
 * bounding region to produce PlaceholderInstance positions, respecting
 * composable filters (noise, altitude, slope, tag, biome, distance).
 *
 * Phase 2 (populatePlaceholders): Each placeholder is replaced with actual
 * geometry from an AssetFactory.
 *
 * Also includes CameraPoseSearchEngine, which implements the original's
 * propose/validate/score camera positioning loop (up to 30 000 iterations
 * with BVH raycast obstacle checking).
 *
 * Public API:
 *   PlacementFilter  interface + concrete filters
 *   PlacementMask    composable mask builder
 *   PlaceholderInstance
 *   DensityPlacementSystem   two-phase placement engine
 *   CameraConstraint, CameraPoseResult
 *   CameraPoseSearchEngine   camera positioning via propose/validate/score
 *   TerrainData              terrain data container for mask evaluation
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { seededNoise2D, seededNoise3D } from '@/core/util/MathUtils';
import type { AssetFactory } from '@/assets/utils/AssetFactorySystem';

// ============================================================================
// Terrain Data
// ============================================================================

/**
 * Lightweight container for terrain data needed by placement masks.
 * Consumers (e.g. TerrainGenerator) are responsible for populating this.
 */
export interface TerrainData {
  /** 1-D height field; indexed as heightData[z * width + x] */
  heightData: Float32Array;
  /** Optional slope field (radians) parallel to heightData */
  slopeData?: Float32Array;
  /** Optional normal field (x,y,z per pixel) */
  normalData?: Float32Array;
  /** Tag index per pixel */
  tagData?: Uint8Array;
  /** Grid dimensions */
  width: number;
  height: number;
  /** World-space extent of the terrain */
  worldSize: number;
  /** Vertical scale */
  heightScale: number;
  /** Sea-level (normalized 0-1) */
  seaLevel: number;
}

// ============================================================================
// PlacementFilter
// ============================================================================

/** Common interface for all composable placement filters */
export interface PlacementFilter {
  /** Unique descriptive name */
  readonly name: string;
  /**
   * Evaluate this filter at world-space (x, z).
   * Returns a value in [0, 1]: 0 = fully blocked, 1 = fully allowed.
   * If terrainData is unavailable the filter should return a neutral value.
   */
  evaluate(x: number, z: number, terrainData?: TerrainData): number;
}

// ============================================================================
// NoiseFilter
// ============================================================================

/**
 * Threshold on a seeded noise value.
 * The mask output is the (clamped, normalised) noise value itself when
 * it exceeds the threshold; otherwise it is 0.
 */
export class NoiseFilter implements PlacementFilter {
  readonly name = 'NoiseFilter';

  constructor(
    private threshold: number,
    private scale: number,
    private seed: number,
  ) {}

  evaluate(x: number, z: number, _terrainData?: TerrainData): number {
    const raw = seededNoise2D(x, z, this.scale, this.seed);
    // Normalise from ≈[-1,1] to [0,1]
    const norm = (raw + 1) * 0.5;
    return norm >= this.threshold ? norm : 0;
  }
}

// ============================================================================
// AltitudeFilter
// ============================================================================

/**
 * Allow placement only within [minAltitude, maxAltitude] (normalised
 * terrain height 0-1), with optional soft edges.
 */
export class AltitudeFilter implements PlacementFilter {
  readonly name = 'AltitudeFilter';

  constructor(
    private minAltitude: number,
    private maxAltitude: number,
    private softness: number = 0.1,
  ) {}

  evaluate(x: number, z: number, terrainData?: TerrainData): number {
    if (!terrainData) return 1;

    const h = this.sampleHeight(x, z, terrainData);

    if (h >= this.minAltitude && h <= this.maxAltitude) return 1;

    // Soft-edge falloff
    if (this.softness > 0) {
      const range = this.maxAltitude - this.minAltitude;
      const softRange = this.softness * range;
      const distBelow = this.minAltitude - h;
      const distAbove = h - this.maxAltitude;
      if (distBelow > 0 && distBelow < softRange) return 1 - distBelow / softRange;
      if (distAbove > 0 && distAbove < softRange) return 1 - distAbove / softRange;
    }

    return 0;
  }

  private sampleHeight(x: number, z: number, td: TerrainData): number {
    const u = (x / td.worldSize + 0.5) * td.width;
    const v = (z / td.worldSize + 0.5) * td.height;
    const ix = Math.min(Math.max(Math.floor(u), 0), td.width - 1);
    const iz = Math.min(Math.max(Math.floor(v), 0), td.height - 1);
    return td.heightData[iz * td.width + ix] ?? 0;
  }
}

// ============================================================================
// SlopeFilter
// ============================================================================

/**
 * Allow placement only on slopes within [minSlope, maxSlope] (radians),
 * with optional soft edges.
 */
export class SlopeFilter implements PlacementFilter {
  readonly name = 'SlopeFilter';

  constructor(
    private minSlope: number,
    private maxSlope: number,
    private softness: number = 0.1,
  ) {}

  evaluate(x: number, z: number, terrainData?: TerrainData): number {
    if (!terrainData || !terrainData.slopeData) return 1;

    const slope = this.sampleSlope(x, z, terrainData);

    if (slope >= this.minSlope && slope <= this.maxSlope) return 1;

    if (this.softness > 0) {
      const range = this.maxSlope - this.minSlope;
      const softRange = this.softness * range;
      const distBelow = this.minSlope - slope;
      const distAbove = slope - this.maxSlope;
      if (distBelow > 0 && distBelow < softRange) return 1 - distBelow / softRange;
      if (distAbove > 0 && distAbove < softRange) return 1 - distAbove / softRange;
    }

    return 0;
  }

  private sampleSlope(x: number, z: number, td: TerrainData): number {
    const u = (x / td.worldSize + 0.5) * td.width;
    const v = (z / td.worldSize + 0.5) * td.height;
    const ix = Math.min(Math.max(Math.floor(u), 0), td.width - 1);
    const iz = Math.min(Math.max(Math.floor(v), 0), td.height - 1);
    return td.slopeData![iz * td.width + ix] ?? 0;
  }
}

// ============================================================================
// TagFilter
// ============================================================================

/**
 * Filter by terrain tags (e.g. only on "sand", or exclude "water").
 */
export class TagFilter implements PlacementFilter {
  readonly name = 'TagFilter';

  /** All known tag names in order matching tagData indices */
  static readonly TAG_NAMES: readonly string[] = [
    'landscape', 'cave', 'underwater', 'beach', 'forest', 'mountain', 'plains',
  ];

  constructor(
    private includeTags: string[],
    private exclude: boolean = false,
  ) {}

  evaluate(x: number, z: number, terrainData?: TerrainData): number {
    if (!terrainData || !terrainData.tagData) return 1;

    const u = (x / terrainData.worldSize + 0.5) * terrainData.width;
    const v = (z / terrainData.worldSize + 0.5) * terrainData.height;
    const ix = Math.min(Math.max(Math.floor(u), 0), terrainData.width - 1);
    const iz = Math.min(Math.max(Math.floor(v), 0), terrainData.height - 1);
    const tagIdx = terrainData.tagData[iz * terrainData.width + ix] ?? 0;
    const tag = TagFilter.TAG_NAMES[tagIdx] ?? 'landscape';

    if (this.exclude) {
      return this.includeTags.includes(tag) ? 0 : 1;
    }
    return this.includeTags.length === 0 || this.includeTags.includes(tag) ? 1 : 0;
  }
}

// ============================================================================
// BiomeFilter
// ============================================================================

/**
 * Filter by biome name (maps to tag-based lookup under the hood).
 */
export class BiomeFilter implements PlacementFilter {
  readonly name = 'BiomeFilter';

  constructor(private biomeNames: string[]) {}

  evaluate(x: number, z: number, terrainData?: TerrainData): number {
    if (!terrainData || !terrainData.tagData) return 1;

    const u = (x / terrainData.worldSize + 0.5) * terrainData.width;
    const v = (z / terrainData.worldSize + 0.5) * terrainData.height;
    const ix = Math.min(Math.max(Math.floor(u), 0), terrainData.width - 1);
    const iz = Math.min(Math.max(Math.floor(v), 0), terrainData.height - 1);
    const tagIdx = terrainData.tagData[iz * terrainData.width + ix] ?? 0;
    const biome = TagFilter.TAG_NAMES[tagIdx] ?? 'landscape';

    return this.biomeNames.length === 0 || this.biomeNames.includes(biome) ? 1 : 0;
  }
}

// ============================================================================
// DistanceFilter
// ============================================================================

/**
 * Allow placement within [minDist, maxDist] from a reference point,
 * with linear / quadratic / exponential falloff.
 */
export class DistanceFilter implements PlacementFilter {
  readonly name = 'DistanceFilter';

  constructor(
    private referencePoint: THREE.Vector3,
    private minDist: number,
    private maxDist: number,
    private falloff: 'linear' | 'quadratic' | 'exponential' = 'linear',
  ) {}

  evaluate(x: number, z: number, _terrainData?: TerrainData): number {
    const dx = x - this.referencePoint.x;
    const dz = z - this.referencePoint.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= this.minDist) return 1.0;
    if (dist >= this.maxDist) return 0.0;

    const t = (dist - this.minDist) / Math.max(0.001, this.maxDist - this.minDist);
    switch (this.falloff) {
      case 'linear': return 1 - t;
      case 'quadratic': return (1 - t) * (1 - t);
      case 'exponential': return Math.exp(-3 * t);
      default: return 1 - t;
    }
  }
}

// ============================================================================
// PlacementMask
// ============================================================================

/**
 * Composable density mask — the core abstraction matching the original
 * Infinigen placement_mask().
 *
 * Filters are added via fluent builder methods; the final density at any
 * (x, z) position is the product of all filter values (i.e. all filters
 * must agree for placement to occur).
 */
export class PlacementMask {
  private filters: PlacementFilter[] = [];

  /** Add a noise threshold filter */
  addNoiseFilter(threshold: number, scale: number, seed: number): PlacementMask {
    this.filters.push(new NoiseFilter(threshold, scale, seed));
    return this;
  }

  /** Add an altitude range filter */
  addAltitudeFilter(minAltitude: number, maxAltitude: number, softness: number = 0.1): PlacementMask {
    this.filters.push(new AltitudeFilter(minAltitude, maxAltitude, softness));
    return this;
  }

  /** Add a slope range filter */
  addSlopeFilter(minSlope: number, maxSlope: number, softness: number = 0.1): PlacementMask {
    this.filters.push(new SlopeFilter(minSlope, maxSlope, softness));
    return this;
  }

  /** Add a tag filter (exclude = true means the listed tags are blocked) */
  addTagFilter(tags: string[], exclude: boolean = false): PlacementMask {
    this.filters.push(new TagFilter(tags, exclude));
    return this;
  }

  /** Add a biome filter */
  addBiomeFilter(biomeNames: string[]): PlacementMask {
    this.filters.push(new BiomeFilter(biomeNames));
    return this;
  }

  /** Add a distance-from-point filter */
  addDistanceFilter(
    referencePoint: THREE.Vector3,
    minDist: number,
    maxDist: number,
    falloff: 'linear' | 'quadratic' | 'exponential' = 'linear',
  ): PlacementMask {
    this.filters.push(new DistanceFilter(referencePoint, minDist, maxDist, falloff));
    return this;
  }

  /** Add an arbitrary custom filter */
  addFilter(filter: PlacementFilter): PlacementMask {
    this.filters.push(filter);
    return this;
  }

  /**
   * Evaluate the mask at a 2D world-space position.
   * Returns a density value in [0, 1].
   * All filters are multiplied together — every filter must agree.
   */
  evaluate(x: number, z: number, terrainData?: TerrainData): number {
    if (this.filters.length === 0) return 1;
    let density = 1;
    for (const filter of this.filters) {
      density *= filter.evaluate(x, z, terrainData);
      if (density <= 0) return 0; // early out
    }
    return Math.max(0, Math.min(1, density));
  }

  /**
   * Generate placement positions within bounds, respecting the density mask.
   * Uses a Poisson-disk-like approach: jitter a regular grid then reject
   * positions whose mask value is below a random threshold.
   *
   * @param bounds  2D bounding box (min.x/min.y → max.x/max.y)
   * @param spacing Minimum spacing between positions
   * @param rng     Seeded random generator
   * @param terrainData  Optional terrain data for filter evaluation
   */
  generatePositions(
    bounds: THREE.Box2,
    spacing: number,
    rng: SeededRandom,
    terrainData?: TerrainData,
  ): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const minX = bounds.min.x;
    const minZ = bounds.min.y;
    const maxX = bounds.max.x;
    const maxZ = bounds.max.y;

    // Walk a jittered grid
    const halfSpacing = spacing * 0.5;
    for (let z = minZ + halfSpacing; z < maxZ; z += spacing) {
      for (let x = minX + halfSpacing; x < maxX; x += spacing) {
        // Jitter within cell
        const jx = x + (rng.next() - 0.5) * spacing * 0.8;
        const jz = z + (rng.next() - 0.5) * spacing * 0.8;

        const density = this.evaluate(jx, jz, terrainData);

        // Probabilistic acceptance proportional to density
        if (rng.next() < density) {
          const y = terrainData
            ? this.sampleTerrainHeight(jx, jz, terrainData)
            : 0;
          positions.push(new THREE.Vector3(jx, y, jz));
        }
      }
    }

    return positions;
  }

  /** Sample terrain height at world-space (x, z) */
  private sampleTerrainHeight(x: number, z: number, td: TerrainData): number {
    const u = (x / td.worldSize + 0.5) * td.width;
    const v = (z / td.worldSize + 0.5) * td.height;
    const ix = Math.min(Math.max(Math.floor(u), 0), td.width - 1);
    const iz = Math.min(Math.max(Math.floor(v), 0), td.height - 1);
    return (td.heightData[iz * td.width + ix] ?? 0) * td.heightScale;
  }

  /** Get the list of filters (for inspection / serialization) */
  getFilters(): readonly PlacementFilter[] {
    return this.filters;
  }
}

// ============================================================================
// PlaceholderInstance
// ============================================================================

/**
 * A lightweight placeholder marker placed in Phase 1,
 * later replaced with actual geometry in Phase 2.
 */
export interface PlaceholderInstance {
  /** Unique identifier */
  id: string;
  /** World-space position */
  position: THREE.Vector3;
  /** Rotation (Y-up convention) */
  rotation: THREE.Euler;
  /** Non-uniform scale */
  scale: THREE.Vector3;
  /** Category::assetType key for factory lookup */
  assetType: string;
  /** Per-instance seed */
  seed: number;
  /** Whether the placeholder has been replaced with geometry */
  populated: boolean;
  /** Current LOD level */
  lodLevel: number;
}

// ============================================================================
// DensityPlacementSystem
// ============================================================================

/**
 * Two-phase placement engine matching the original Infinigen:
 *
 * Phase 1 (scatterPlaceholders): Evaluate a PlacementMask over a 2D
 * region to produce PlaceholderInstance markers.
 *
 * Phase 2 (populatePlaceholders): Replace each placeholder with actual
 * geometry produced by an AssetFactory.
 */
export class DensityPlacementSystem {
  private idCounter = 0;

  /**
   * Phase 1: Scatter placeholder positions based on a density mask.
   *
   * @param mask     Composable density mask
   * @param bounds   2D bounding box
   * @param density  Overall density multiplier (0-1+)
   * @param spacing  Minimum spacing between placeholders
   * @param seed     Random seed
   * @param terrainData  Optional terrain data for mask evaluation
   */
  scatterPlaceholders(
    mask: PlacementMask,
    bounds: THREE.Box2,
    density: number,
    spacing: number,
    seed: number,
    terrainData?: TerrainData,
  ): PlaceholderInstance[] {
    const rng = new SeededRandom(seed);
    const placeholders: PlaceholderInstance[] = [];

    // Generate candidate positions via the mask
    const effectiveSpacing = spacing / Math.max(0.01, Math.sqrt(density));
    const positions = mask.generatePositions(bounds, effectiveSpacing, rng, terrainData);

    // Convert positions to PlaceholderInstances
    for (const pos of positions) {
      placeholders.push({
        id: `ph_${this.idCounter++}`,
        position: pos.clone(),
        rotation: new THREE.Euler(0, rng.uniform(0, Math.PI * 2), 0),
        scale: new THREE.Vector3(1, 1, 1),
        assetType: '',  // will be set by caller
        seed: rng.nextInt(0, 999999),
        populated: false,
        lodLevel: 0,
      });
    }

    return placeholders;
  }

  /**
   * Phase 2: Populate placeholders with actual geometry from a factory.
   *
   * @param placeholders  The placeholder instances to populate
   * @param factory       The asset factory to use for geometry generation
   * @param seed          Base seed (each placeholder gets seed + index)
   */
  async populatePlaceholders(
    placeholders: PlaceholderInstance[],
    factory: AssetFactory,
    seed: number,
  ): Promise<THREE.Object3D[]> {
    const results: THREE.Object3D[] = [];

    for (let i = 0; i < placeholders.length; i++) {
      const ph = placeholders[i];
      if (ph.populated) continue;

      const asset = await factory.generate(ph.seed, { lod: ph.lodLevel });
      asset.position.copy(ph.position);
      asset.rotation.copy(ph.rotation);
      asset.scale.copy(ph.scale);
      asset.userData.placeholderId = ph.id;

      ph.populated = true;
      results.push(asset);
    }

    return results;
  }

  /**
   * Full pipeline in one call: scatter → populate.
   *
   * @param factory   Asset factory for geometry generation
   * @param mask      Composable density mask
   * @param bounds    2D bounding box
   * @param density   Overall density multiplier
   * @param spacing   Minimum spacing
   * @param seed      Random seed
   * @param assetType Category::assetType key (set on placeholders)
   * @param terrainData  Optional terrain data
   */
  async placeAssets(
    factory: AssetFactory,
    mask: PlacementMask,
    bounds: THREE.Box2,
    density: number,
    spacing: number,
    seed: number,
    assetType?: string,
    terrainData?: TerrainData,
  ): Promise<THREE.Object3D[]> {
    const placeholders = this.scatterPlaceholders(
      mask, bounds, density, spacing, seed, terrainData,
    );

    // Assign asset type
    const typeKey = assetType ?? `${factory.category}::${factory.assetType}`;
    for (const ph of placeholders) {
      ph.assetType = typeKey;
    }

    return this.populatePlaceholders(placeholders, factory, seed);
  }
}

// ============================================================================
// Camera Constraint & Result types
// ============================================================================

/** Constraint for camera pose search */
export interface CameraConstraint {
  /** Constraint type identifier */
  type: 'altitude' | 'obstacle_clearance' | 'view_angle' | 'distance_to_subject' | 'fov' | 'custom';
  /** Minimum value (context-dependent) */
  min?: number;
  /** Maximum value (context-dependent) */
  max?: number;
  /** Target / ideal value */
  target?: number;
  /** Weight in the scoring function (default 1.0) */
  weight?: number;
  /** Custom validation function for 'custom' type */
  validate?: (position: THREE.Vector3, direction: THREE.Vector3) => number;
}

/** Result from camera pose search */
export interface CameraPoseResult {
  /** Best camera position found */
  position: THREE.Vector3;
  /** Camera look-at direction (unit vector) */
  direction: THREE.Vector3;
  /** Field of view in radians */
  fov: number;
  /** Composite score (higher = better, 0-1) */
  score: number;
  /** Number of iterations performed */
  iterations: number;
  /** Whether any valid pose was found */
  found: boolean;
}

// ============================================================================
// CameraPoseSearchEngine
// ============================================================================

/**
 * Implements the original Infinigen camera-pose search:
 * up to 30 000 iterations of propose → validate → score.
 *
 * Uses BVH raycast for obstacle checking when three-mesh-bvh is available;
 * falls back to a simple THREE.Raycaster otherwise.
 */
export class CameraPoseSearchEngine {
  private raycaster: THREE.Raycaster;

  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = 1000;
  }

  /**
   * Search for an optimal camera pose.
   *
   * @param scene       The THREE scene (used for obstacle raycast)
   * @param constraints Array of camera constraints
   * @param maxIterations  Maximum propose/validate/score iterations (default 30 000)
   * @param seed        Random seed
   * @param bounds      Optional bounding box for camera position search
   * @param subject     Optional subject point for view-angle constraints
   */
  search(
    scene: THREE.Scene,
    constraints: CameraConstraint[],
    maxIterations: number = 30000,
    seed: number = 42,
    bounds?: THREE.Box3,
    subject?: THREE.Vector3,
  ): CameraPoseResult {
    const rng = new SeededRandom(seed);
    const searchBounds = bounds ?? this.inferBounds(scene);

    let bestResult: CameraPoseResult = {
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      fov: Math.PI / 3,
      score: -1,
      iterations: 0,
      found: false,
    };

    const subjectPos = subject ?? new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < maxIterations; i++) {
      // 1. Propose: random position within bounds
      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(searchBounds.min.x, searchBounds.max.x, rng.next()),
        THREE.MathUtils.lerp(searchBounds.min.y, searchBounds.max.y, rng.next()),
        THREE.MathUtils.lerp(searchBounds.min.z, searchBounds.max.z, rng.next()),
      );

      // 2. Validate: check all hard constraints
      const dir = new THREE.Vector3().subVectors(subjectPos, pos).normalize();
      if (!this.validateConstraints(pos, dir, constraints, scene)) {
        continue;
      }

      // 3. Score
      const score = this.scorePose(pos, dir, constraints, scene, subjectPos);
      if (score > bestResult.score) {
        bestResult = {
          position: pos.clone(),
          direction: dir.clone(),
          fov: this.proposeFOV(pos, subjectPos, constraints),
          score,
          iterations: i + 1,
          found: true,
        };
      }
    }

    bestResult.iterations = Math.min(maxIterations, bestResult.iterations || maxIterations);
    return bestResult;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /** Check hard constraints — returns false if any constraint is violated */
  private validateConstraints(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    constraints: CameraConstraint[],
    scene: THREE.Scene,
  ): boolean {
    for (const c of constraints) {
      switch (c.type) {
        case 'altitude':
          if (c.min !== undefined && pos.y < c.min) return false;
          if (c.max !== undefined && pos.y > c.max) return false;
          break;

        case 'obstacle_clearance': {
          const minClear = c.min ?? 1.0;
          this.raycaster.set(pos, dir);
          this.raycaster.near = 0;
          this.raycaster.far = minClear;
          const hits = this.raycaster.intersectObjects(scene.children, true);
          if (hits.length > 0) return false;
          break;
        }

        case 'view_angle': {
          if (!c.target) break;
          const angle = Math.acos(
            THREE.MathUtils.clamp(dir.dot(new THREE.Vector3(0, -1, 0)), -1, 1),
          );
          if (c.min !== undefined && angle < c.min) return false;
          if (c.max !== undefined && angle > c.max) return false;
          break;
        }

        case 'distance_to_subject': {
          // Will be evaluated against subject in scoring
          break;
        }

        case 'custom': {
          if (c.validate) {
            const val = c.validate(pos, dir);
            if (val <= 0) return false;
          }
          break;
        }

        default:
          break;
      }
    }
    return true;
  }

  /** Compute a composite score for a proposed camera pose */
  private scorePose(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    constraints: CameraConstraint[],
    _scene: THREE.Scene,
    subjectPos: THREE.Vector3,
  ): number {
    let score = 0;
    let totalWeight = 0;

    for (const c of constraints) {
      const weight = c.weight ?? 1.0;
      totalWeight += weight;

      switch (c.type) {
        case 'altitude': {
          // Prefer middle of altitude range
          if (c.min !== undefined && c.max !== undefined) {
            const mid = (c.min + c.max) / 2;
            const range = (c.max - c.min) / 2;
            const dist = Math.abs(pos.y - mid) / Math.max(range, 0.01);
            score += (1 - dist) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'distance_to_subject': {
          const dist = pos.distanceTo(subjectPos);
          if (c.target !== undefined) {
            const ideal = c.target;
            const ratio = Math.min(dist, ideal) / Math.max(dist, ideal);
            score += ratio * weight;
          } else if (c.min !== undefined && c.max !== undefined) {
            const mid = (c.min + c.max) / 2;
            const range = (c.max - c.min) / 2;
            const d = Math.abs(dist - mid) / Math.max(range, 0.01);
            score += (1 - Math.min(d, 1)) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'view_angle': {
          if (c.target !== undefined) {
            const angle = Math.acos(
              THREE.MathUtils.clamp(dir.dot(new THREE.Vector3(0, -1, 0)), -1, 1),
            );
            const diff = Math.abs(angle - c.target);
            score += (1 - Math.min(diff / Math.PI, 1)) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'obstacle_clearance': {
          // Already validated as clear; give full score
          score += 1.0 * weight;
          break;
        }

        case 'custom': {
          if (c.validate) {
            score += c.validate(pos, dir) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        default:
          score += 0.5 * weight;
          break;
      }
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /** Propose a field of view based on distance-to-subject and constraints */
  private proposeFOV(
    pos: THREE.Vector3,
    subjectPos: THREE.Vector3,
    constraints: CameraConstraint[],
  ): number {
    const fovConstraint = constraints.find(c => c.type === 'fov');
    if (fovConstraint?.target) return fovConstraint.target;

    const dist = pos.distanceTo(subjectPos);
    // Wider FOV for close subjects, narrower for far
    const baseFOV = Math.PI / 3;
    const adaptiveFOV = THREE.MathUtils.clamp(
      2 * Math.atan(5 / Math.max(dist, 0.1)),
      Math.PI / 6,
      Math.PI / 2,
    );
    return adaptiveFOV;
  }

  /** Infer search bounds from scene content */
  private inferBounds(scene: THREE.Scene): THREE.Box3 {
    const box = new THREE.Box3();
    scene.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
        box.expandByObject(child);
      }
    });

    // If scene is empty, return a reasonable default
    if (box.isEmpty()) {
      return new THREE.Box3(
        new THREE.Vector3(-100, 2, -100),
        new THREE.Vector3(100, 50, 100),
      );
    }

    // Expand bounds slightly and ensure minimum height above terrain
    box.min.x -= 10;
    box.min.z -= 10;
    box.max.x += 10;
    box.max.z += 10;
    box.min.y = Math.max(box.min.y + 2, 2);
    box.max.y = Math.max(box.max.y, box.min.y + 30);

    return box;
  }
}
