/**
 * VolumeScatterDensity.ts — 3D Volumetric Density Sampling with SDF Queries
 *
 * Extends the scatter placement system with full 3D density fields that
 * consider vertical position, underwater state, cave interior regions, and
 * surface slope. Uses SDF queries from TerrainElementSystem to make density
 * decisions that are spatially coherent with the terrain geometry.
 *
 * Key concepts:
 *   - Density values are in [0, 2]: 1 = base density, 0 = nothing, 2 = double
 *   - SDF evaluator is optional — falls back to height-only queries if absent
 *   - Modifiers are composable: stack canopy boost + slope + cave effects
 *   - Pre-built biome factories for common use-cases
 *
 * @module placement/VolumeScatterDensity
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Optional Terrain Import
// ============================================================================

/**
 * SDF evaluator function type — matches ElementEvalResult.distance from
 * TerrainElementSystem but avoids a hard dependency. If the caller provides
 * an SDF evaluator, the density field can query cave interiors, water
 * surfaces, and other volumetric features. Without it, the field falls back
 * to height-only queries.
 */
export type SDFEvaluator = (
  pos: THREE.Vector3,
) => { distance: number; auxiliary: Record<string, any> };

// ============================================================================
// Density Modifier Types
// ============================================================================

/**
 * Discriminator for the different density modifier types.
 */
export enum VolumeDensityModifierType {
  /** Increases density below a canopy height threshold */
  UNDER_CANOPY = 'underCanopy',
  /** Reduces land-plant density below water; optionally boosts aquatic */
  UNDERWATER = 'underwater',
  /** Boosts mushroom/lichen density inside caves */
  CAVE_INTERIOR = 'caveInterior',
  /** Reduces density on steep slopes */
  SLOPE = 'slope',
  /** Reduces density at high altitude */
  ALTITUDE_FALLOFF = 'altitudeFalloff',
}

/**
 * Parameters for the under-canopy boost modifier.
 */
export interface UnderCanopyBoostParams {
  /** Y-coordinate of the canopy ceiling (world space). Density increases
   *  for points whose Y is above terrain but below this height. */
  canopyHeight: number;
  /** Multiplier applied at ground level under canopy (default 1.8). */
  boostFactor: number;
  /** Vertical distance over which the boost fades to 1.0 above
   *  canopyHeight (default 5.0). */
  falloffRange: number;
}

/**
 * Parameters for the underwater suppression modifier.
 */
export interface UnderwaterSuppressionParams {
  /** Y-coordinate of the water plane (world space). */
  waterPlaneHeight: number;
  /** Density multiplier for land vegetation below water (default 0.1). */
  suppressionFactor: number;
  /** Vertical transition range above/below water surface (default 1.0). */
  transitionRange: number;
  /** If true, density *increases* below water (for aquatic plants). */
  invertForAquatic: boolean;
}

/**
 * Parameters for the cave-interior boost modifier.
 */
export interface CaveInteriorBoostParams {
  /** Density multiplier inside a cave (default 1.6). */
  boostFactor: number;
  /** Distance over which the boost fades to 1.0 from the cave wall
   *  (default 3.0). */
  distanceFalloff: number;
  /** Density multiplier for grass/flowers inside caves (default 0.3).
   *  These are typically suppressed inside caves. */
  grassSuppressionFactor: number;
}

/**
 * Parameters for the slope-based density modifier.
 */
export interface SlopeDensityModifierParams {
  /** Slope angle (degrees) above which density begins to decrease
   *  (default 35). */
  steepThreshold: number;
  /** Density multiplier at vertical (90°) surfaces (default 0.1). */
  reductionFactor: number;
  /** Slope angle (degrees) at which density is fully reduced (default 70). */
  maxSlope: number;
}

/**
 * Parameters for the altitude falloff modifier.
 */
export interface AltitudeFalloffParams {
  /** Altitude above which density begins to decrease (default 40). */
  falloffStart: number;
  /** Altitude at which density reaches minimum (default 80). */
  falloffEnd: number;
  /** Minimum density factor at falloffEnd (default 0.1). */
  minDensity: number;
}

/**
 * A single density modifier configuration — a tagged union of the above
 * parameter types.
 */
export type VolumeDensityModifierConfig =
  | { type: VolumeDensityModifierType.UNDER_CANOPY; params: UnderCanopyBoostParams }
  | { type: VolumeDensityModifierType.UNDERWATER; params: UnderwaterSuppressionParams }
  | { type: VolumeDensityModifierType.CAVE_INTERIOR; params: CaveInteriorBoostParams }
  | { type: VolumeDensityModifierType.SLOPE; params: SlopeDensityModifierParams }
  | { type: VolumeDensityModifierType.ALTITUDE_FALLOFF; params: AltitudeFalloffParams };

// ============================================================================
// VolumeScatterConfig
// ============================================================================

/**
 * Configuration for a volumetric density field used in scatter placement.
 */
export interface VolumeScatterConfig {
  /** Base density multiplier. 1.0 = normal, values in [0, 2]. */
  baseDensity: number;
  /** Ordered array of density modifier configurations. Applied left-to-right. */
  modifiers: VolumeDensityModifierConfig[];
  /** 3D grid resolution as [resX, resY, resZ]. */
  resolution: [number, number, number];
  /** World-space bounding box for the density field. */
  bounds: THREE.Box3;
}

// ============================================================================
// VolumeDensityModifiers — stateless modifier functions
// ============================================================================

/**
 * Collection of pure functions that compute a density multiplier for a
 * single 3D point. Each function returns a value in [0, 2] where 1 means
 * no change. These are composed multiplicatively by VolumeDensityField.
 */
export class VolumeDensityModifiers {
  /**
   * Under-canopy boost — increases density for points below a canopy ceiling.
   *
   * The boost is strongest near ground level and fades linearly to 1.0 at
   * canopyHeight + falloffRange above the canopy.
   *
   * @param worldPos   Query position in world space
   * @param terrainY   Terrain surface Y at this (x, z)
   * @param params     Canopy parameters
   * @returns Density multiplier in [1, boostFactor]
   */
  static underCanopyBoost(
    worldPos: THREE.Vector3,
    terrainY: number,
    params: UnderCanopyBoostParams,
  ): number {
    const { canopyHeight, boostFactor, falloffRange } = params;

    // Only boost if we are above terrain but below the canopy ceiling
    if (worldPos.y < terrainY || worldPos.y > canopyHeight + falloffRange) {
      return 1.0;
    }

    if (worldPos.y <= canopyHeight) {
      // Inside the canopy zone: full boost near ground, fading toward ceiling
      const heightAboveTerrain = worldPos.y - terrainY;
      const canopyThickness = canopyHeight - terrainY;
      const t = canopyThickness > 0 ? heightAboveTerrain / canopyThickness : 0;
      // Strongest at ground, fading linearly toward canopy top
      return 1.0 + (boostFactor - 1.0) * (1.0 - t);
    }

    // Above canopy: fade from boostFactor to 1.0 over falloffRange
    const aboveCanopy = worldPos.y - canopyHeight;
    const fadeT = Math.min(1.0, aboveCanopy / falloffRange);
    return 1.0 + (boostFactor - 1.0) * (1.0 - fadeT);
  }

  /**
   * Underwater suppression — reduces land vegetation density below a water
   * plane. Can be inverted for aquatic plants.
   *
   * @param worldPos   Query position in world space
   * @param params     Water suppression parameters
   * @returns Density multiplier. For land plants: [suppressionFactor, 1].
   *          For aquatic (inverted): [1, 2 - suppressionFactor].
   */
  static underwaterSuppression(
    worldPos: THREE.Vector3,
    params: UnderwaterSuppressionParams,
  ): number {
    const { waterPlaneHeight, suppressionFactor, transitionRange, invertForAquatic } = params;

    if (invertForAquatic) {
      // Aquatic plants: boosted below water, suppressed above
      if (worldPos.y >= waterPlaneHeight + transitionRange) {
        return suppressionFactor; // Above water: suppressed
      }
      if (worldPos.y <= waterPlaneHeight) {
        return 1.0 + (1.0 - suppressionFactor); // Below water: boosted (e.g., 1.9)
      }
      // Transition zone
      const t = (waterPlaneHeight + transitionRange - worldPos.y) / transitionRange;
      return suppressionFactor + (1.0 + (1.0 - suppressionFactor) - suppressionFactor) * t;
    }

    // Land plants: suppressed below water, normal above
    if (worldPos.y >= waterPlaneHeight + transitionRange) {
      return 1.0; // Well above water: normal
    }
    if (worldPos.y <= waterPlaneHeight) {
      return suppressionFactor; // Below water: suppressed
    }
    // Transition zone
    const t = (worldPos.y - waterPlaneHeight) / transitionRange;
    return suppressionFactor + (1.0 - suppressionFactor) * t;
  }

  /**
   * Cave interior boost — increases density for cave-adapted species
   * (mushrooms, lichen) while suppressing sun-loving plants (grass).
   *
   * Uses SDF auxiliary data to detect cave interiors.
   *
   * @param worldPos    Query position
   * @param sdfResult   SDF evaluation result at this point (optional)
   * @param params      Cave interior parameters
   * @returns Density multiplier based on cave proximity
   */
  static caveInteriorBoost(
    worldPos: THREE.Vector3,
    sdfResult: { distance: number; auxiliary: Record<string, any> } | null,
    params: CaveInteriorBoostParams,
  ): number {
    if (!sdfResult) return 1.0;

    const { boostFactor, distanceFalloff, grassSuppressionFactor } = params;
    const isInsideCave = sdfResult.auxiliary?.caveTag === true;
    const boundaryDist = sdfResult.auxiliary?.boundarySDF as number | undefined;

    if (isInsideCave) {
      // Inside a cave: boost cave species, suppress grass
      // Use boundary distance to fade effect near walls
      const wallProximity = boundaryDist !== undefined ? boundaryDist : 0;
      const fadeT = distanceFalloff > 0 ? Math.min(1.0, wallProximity / distanceFalloff) : 1.0;
      return 1.0 + (boostFactor - 1.0) * fadeT;
    }

    // Near cave entrance: partial boost based on distance to cave
    if (boundaryDist !== undefined && boundaryDist < distanceFalloff) {
      const fadeT = 1.0 - boundaryDist / distanceFalloff;
      return 1.0 + (boostFactor - 1.0) * fadeT;
    }

    // Outside cave: apply grass suppression factor as baseline hint
    // (callers can choose to use boostFactor or grassSuppressionFactor)
    // By default, outside caves grass is normal
    return 1.0;
  }

  /**
   * Compute the grass/flower suppression factor for cave interiors.
   *
   * This is a companion to caveInteriorBoost — the boost function is
   * intended for cave species; this function handles the inverse for
   * surface species that should be suppressed inside caves.
   *
   * @param sdfResult   SDF evaluation result
   * @param params      Cave interior parameters
   * @returns Density multiplier for grass/flowers in [grassSuppressionFactor, 1]
   */
  static caveGrassSuppression(
    sdfResult: { distance: number; auxiliary: Record<string, any> } | null,
    params: CaveInteriorBoostParams,
  ): number {
    if (!sdfResult) return 1.0;

    const { grassSuppressionFactor, distanceFalloff } = params;
    const isInsideCave = sdfResult.auxiliary?.caveTag === true;
    const boundaryDist = sdfResult.auxiliary?.boundarySDF as number | undefined;

    if (isInsideCave) {
      return grassSuppressionFactor;
    }

    if (boundaryDist !== undefined && boundaryDist < distanceFalloff) {
      const fadeT = boundaryDist / distanceFalloff;
      return grassSuppressionFactor + (1.0 - grassSuppressionFactor) * fadeT;
    }

    return 1.0;
  }

  /**
   * Slope-based density modifier — reduces density on steep slopes.
   *
   * @param slopeDegrees  Surface slope angle in degrees [0, 90]
   * @param params        Slope modifier parameters
   * @returns Density multiplier in [reductionFactor, 1]
   */
  static slopeDensityModifier(
    slopeDegrees: number,
    params: SlopeDensityModifierParams,
  ): number {
    const { steepThreshold, reductionFactor, maxSlope } = params;

    if (slopeDegrees <= steepThreshold) {
      return 1.0; // Gentle slope: no change
    }
    if (slopeDegrees >= maxSlope) {
      return reductionFactor; // Very steep: fully reduced
    }

    // Linear interpolation between 1.0 and reductionFactor
    const t = (slopeDegrees - steepThreshold) / (maxSlope - steepThreshold);
    return 1.0 - t * (1.0 - reductionFactor);
  }

  /**
   * Altitude falloff — reduces density at high elevations.
   *
   * @param altitude  Y-coordinate of the query point
   * @param params    Altitude falloff parameters
   * @returns Density multiplier in [minDensity, 1]
   */
  static altitudeFalloff(
    altitude: number,
    params: AltitudeFalloffParams,
  ): number {
    const { falloffStart, falloffEnd, minDensity } = params;

    if (altitude <= falloffStart) {
      return 1.0;
    }
    if (altitude >= falloffEnd) {
      return minDensity;
    }

    const t = (altitude - falloffStart) / (falloffEnd - falloffStart);
    return 1.0 - t * (1.0 - minDensity);
  }
}

// ============================================================================
// VolumeDensityField
// ============================================================================

/**
 * A 3D volumetric density field for scatter placement.
 *
 * Evaluates density at any 3D point considering:
 *   - Under-canopy boost (above terrain, below canopy → more grass/fern)
 *   - Underwater suppression (below water → less land vegetation, more aquatic)
 *   - Cave interior variation (inside cave → more mushroom/lichen, less grass)
 *   - Slope-based density (steep slopes → less grass, more rock)
 *
 * The field can be built into a 3D grid for fast trilinear interpolation,
 * or converted to a THREE.Data3DTexture for GPU consumption.
 *
 * Usage:
 * ```ts
 * const field = new VolumeDensityField(bounds, [32, 16, 32], sdfEvaluator);
 * field.config = myConfig;
 * const density = field.evaluate(someWorldPos); // 0..2
 * field.buildField(); // precompute grid
 * const gpuTexture = field.toDataTexture(); // for shaders
 * ```
 */
export class VolumeDensityField {
  /** The scatter configuration controlling base density and modifiers. */
  config: VolumeScatterConfig;

  /** Optional SDF evaluator for querying terrain geometry. */
  private sdfEvaluator: SDFEvaluator | null;

  /** Pre-computed 3D density grid (laid out as flat Float32Array). */
  private fieldData: Float32Array | null = null;

  /** Cached terrain height at each XZ column (lazy-populated). */
  private terrainHeightCache: Map<string, number> = new Map();

  /** Cached slope at each XZ column (lazy-populated, in degrees). */
  private slopeCache: Map<string, number> = new Map();

  /**
   * Construct a new VolumeDensityField.
   *
   * @param bounds       World-space bounding box for the field
   * @param resolution   3D grid resolution [resX, resY, resZ]
   * @param sdfEvaluator Optional SDF evaluator function. If not provided,
   *                     the field falls back to height-only queries (no
   *                     cave/water detection).
   */
  constructor(
    bounds: THREE.Box3,
    resolution: [number, number, number],
    sdfEvaluator?: SDFEvaluator,
  ) {
    this.sdfEvaluator = sdfEvaluator ?? null;
    this.config = {
      baseDensity: 1.0,
      modifiers: [],
      resolution,
      bounds: bounds.clone(),
    };
  }

  /**
   * Evaluate the density at a single world-space position.
   *
   * Applies all configured modifiers multiplicatively and clamps the
   * result to [0, 2].
   *
   * @param worldPos  The 3D position to evaluate
   * @returns Density value in [0, 2]. 1 = base, 0 = nothing, 2 = double.
   */
  evaluate(worldPos: THREE.Vector3): number {
    let density = this.config.baseDensity;

    // Compute terrain height and slope at this XZ position
    const terrainY = this.getTerrainHeight(worldPos.x, worldPos.z);
    const slope = this.getSlope(worldPos.x, worldPos.z);

    // Optionally query the SDF for volumetric information
    let sdfResult: { distance: number; auxiliary: Record<string, any> } | null = null;
    if (this.sdfEvaluator) {
      try {
        sdfResult = this.sdfEvaluator(worldPos);
      } catch {
        // SDF evaluator may throw for out-of-bounds; fall back gracefully
        sdfResult = null;
      }
    }

    // Apply each modifier multiplicatively
    for (const modifier of this.config.modifiers) {
      switch (modifier.type) {
        case VolumeDensityModifierType.UNDER_CANOPY:
          density *= VolumeDensityModifiers.underCanopyBoost(
            worldPos, terrainY, modifier.params,
          );
          break;

        case VolumeDensityModifierType.UNDERWATER:
          density *= VolumeDensityModifiers.underwaterSuppression(
            worldPos, modifier.params,
          );
          break;

        case VolumeDensityModifierType.CAVE_INTERIOR:
          density *= VolumeDensityModifiers.caveInteriorBoost(
            worldPos, sdfResult, modifier.params,
          );
          break;

        case VolumeDensityModifierType.SLOPE:
          density *= VolumeDensityModifiers.slopeDensityModifier(
            slope, modifier.params,
          );
          break;

        case VolumeDensityModifierType.ALTITUDE_FALLOFF:
          density *= VolumeDensityModifiers.altitudeFalloff(
            worldPos.y, modifier.params,
          );
          break;
      }
    }

    // Clamp to valid range
    return Math.max(0, Math.min(2, density));
  }

  /**
   * Build the 3D density grid by evaluating density at every grid point.
   *
   * After calling this method, `sampleDensity()` can be used for fast
   * trilinear interpolation lookups.
   *
   * @returns The flat Float32Array of density values (resX × resY × resZ)
   */
  buildField(): Float32Array {
    const [resX, resY, resZ] = this.config.resolution;
    const size = resX * resY * resZ;
    this.fieldData = new Float32Array(size);

    const bounds = this.config.bounds;
    const sizeVec = bounds.getSize(new THREE.Vector3());

    const tempPos = new THREE.Vector3();

    for (let iz = 0; iz < resZ; iz++) {
      for (let iy = 0; iy < resY; iy++) {
        for (let ix = 0; ix < resX; ix++) {
          // Map grid index to world position
          tempPos.set(
            bounds.min.x + (ix / Math.max(1, resX - 1)) * sizeVec.x,
            bounds.min.y + (iy / Math.max(1, resY - 1)) * sizeVec.y,
            bounds.min.z + (iz / Math.max(1, resZ - 1)) * sizeVec.z,
          );

          const idx = iz * resY * resX + iy * resX + ix;
          this.fieldData[idx] = this.evaluate(tempPos);
        }
      }
    }

    return this.fieldData;
  }

  /**
   * Sample the density field at continuous coordinates using trilinear
   * interpolation from the pre-built grid.
   *
   * **Must call `buildField()` first.**
   *
   * @param x  X position in world space
   * @param y  Y position in world space
   * @param z  Z position in world space
   * @returns Interpolated density in [0, 2]
   * @throws Error if the field has not been built
   */
  sampleDensity(x: number, y: number, z: number): number {
    if (!this.fieldData) {
      throw new Error('VolumeDensityField: call buildField() before sampleDensity()');
    }

    const [resX, resY, resZ] = this.config.resolution;
    const bounds = this.config.bounds;
    const sizeVec = bounds.getSize(new THREE.Vector3());

    // Convert world position to grid coordinates [0, res-1]
    const gx = ((x - bounds.min.x) / sizeVec.x) * (resX - 1);
    const gy = ((y - bounds.min.y) / sizeVec.y) * (resY - 1);
    const gz = ((z - bounds.min.z) / sizeVec.z) * (resZ - 1);

    // Clamp to valid grid range
    const cx = Math.max(0, Math.min(resX - 1, gx));
    const cy = Math.max(0, Math.min(resY - 1, gy));
    const cz = Math.max(0, Math.min(resZ - 1, gz));

    // Integer and fractional parts
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const z0 = Math.floor(cz);
    const x1 = Math.min(x0 + 1, resX - 1);
    const y1 = Math.min(y0 + 1, resY - 1);
    const z1 = Math.min(z0 + 1, resZ - 1);

    const fx = cx - x0;
    const fy = cy - y0;
    const fz = cz - z0;

    // Fetch 8 corner values
    const v000 = this.getFieldValue(x0, y0, z0);
    const v100 = this.getFieldValue(x1, y0, z0);
    const v010 = this.getFieldValue(x0, y1, z0);
    const v110 = this.getFieldValue(x1, y1, z0);
    const v001 = this.getFieldValue(x0, y0, z1);
    const v101 = this.getFieldValue(x1, y0, z1);
    const v011 = this.getFieldValue(x0, y1, z1);
    const v111 = this.getFieldValue(x1, y1, z1);

    // Trilinear interpolation
    const c00 = v000 * (1 - fx) + v100 * fx;
    const c10 = v010 * (1 - fx) + v110 * fx;
    const c01 = v001 * (1 - fx) + v101 * fx;
    const c11 = v011 * (1 - fx) + v111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    const result = c0 * (1 - fz) + c1 * fz;

    return Math.max(0, Math.min(2, result));
  }

  /**
   * Convert the density field to a THREE.Data3DTexture for GPU consumption.
   *
   * **Must call `buildField()` first.**
   *
   * The texture uses RedFormat (single float channel) with FloatType.
   * Shader code can sample it like any other 3D texture.
   *
   * @returns A THREE.Data3DTexture containing density values
   * @throws Error if the field has not been built
   */
  toDataTexture(): THREE.Data3DTexture {
    if (!this.fieldData) {
      throw new Error('VolumeDensityField: call buildField() before toDataTexture()');
    }

    const [resX, resY, resZ] = this.config.resolution;

    const texture = new THREE.Data3DTexture(
      this.fieldData,
      resX,
      resY,
      resZ,
    );

    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Get the currently built field data, or null if not yet built.
   */
  getFieldData(): Float32Array | null {
    return this.fieldData;
  }

  /**
   * Get the configured resolution.
   */
  getResolution(): [number, number, number] {
    return this.config.resolution;
  }

  /**
   * Get the world-space bounds.
   */
  getBounds(): THREE.Box3 {
    return this.config.bounds;
  }

  /**
   * Set or replace the SDF evaluator. If set to null, the field falls
   * back to height-only queries.
   */
  setSDFEvaluator(evaluator: SDFEvaluator | null): void {
    this.sdfEvaluator = evaluator;
    // Invalidate cached field since SDF changed
    this.fieldData = null;
    this.terrainHeightCache.clear();
    this.slopeCache.clear();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Fetch a value from the field data at integer grid coordinates.
   */
  private getFieldValue(ix: number, iy: number, iz: number): number {
    if (!this.fieldData) return 1.0;
    const [resX, resY] = this.config.resolution;
    const idx = iz * resY * resX + iy * resX + ix;
    if (idx < 0 || idx >= this.fieldData.length) return 1.0;
    return this.fieldData[idx];
  }

  /**
   * Estimate terrain height at an (x, z) position.
   *
   * If an SDF evaluator is available, uses a binary search to find the
   * surface. Otherwise, returns 0 (flat plane assumption).
   */
  private getTerrainHeight(x: number, z: number): number {
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (this.terrainHeightCache.has(key)) {
      return this.terrainHeightCache.get(key)!;
    }

    let height = 0;

    if (this.sdfEvaluator) {
      // Binary search for the terrain surface along Y axis
      const bounds = this.config.bounds;
      let lo = bounds.min.y;
      let hi = bounds.max.y;

      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) * 0.5;
        const pos = new THREE.Vector3(x, mid, z);
        try {
          const result = this.sdfEvaluator(pos);
          // Negative distance = inside solid; positive = outside
          if (result.distance < 0) {
            lo = mid; // Inside terrain, surface is above
          } else {
            hi = mid; // Outside terrain, surface is below
          }
        } catch {
          break;
        }
      }

      height = (lo + hi) * 0.5;
    }

    // Cache the result
    if (this.terrainHeightCache.size > 10000) {
      this.terrainHeightCache.clear();
    }
    this.terrainHeightCache.set(key, height);

    return height;
  }

  /**
   * Estimate the slope (in degrees) at an (x, z) position.
   *
   * Uses finite differences on the terrain height if an SDF evaluator
   * is available. Otherwise, returns 0 (flat assumption).
   */
  private getSlope(x: number, z: number): number {
    const key = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (this.slopeCache.has(key)) {
      return this.slopeCache.get(key)!;
    }

    let slope = 0;

    if (this.sdfEvaluator) {
      const eps = 0.5;
      const hC = this.getTerrainHeight(x, z);
      const hX = this.getTerrainHeight(x + eps, z);
      const hZ = this.getTerrainHeight(x, z + eps);

      // Gradient of the height field
      const dhdx = (hX - hC) / eps;
      const dhdz = (hZ - hC) / eps;

      // Normal vector of the height field: (-dhdx, 1, -dhdz)
      // Slope = angle between normal and up vector
      const gradMag = Math.sqrt(dhdx * dhdx + dhdz * dhdz);
      slope = Math.atan(gradMag) * (180 / Math.PI);
    }

    if (this.slopeCache.size > 10000) {
      this.slopeCache.clear();
    }
    this.slopeCache.set(key, slope);

    return slope;
  }
}

// ============================================================================
// Biome Factory
// ============================================================================

/**
 * Pre-configured biome types for the volume density factory.
 *
 *   - 'forest':    Under-canopy boost + slope modifier
 *   - 'underwater': Underwater suppression (inverted for aquatic)
 *   - 'cave':      Cave interior boost
 *   - 'desert':    Slope modifier only
 *   - 'mountain':  Slope modifier + altitude falloff
 */
export type BiomeType = 'forest' | 'underwater' | 'cave' | 'desert' | 'mountain';

/**
 * Create a pre-configured VolumeDensityField for a given biome type.
 *
 * Each biome type comes with a sensible set of density modifiers tuned
 * for typical scatter placement scenarios.
 *
 * @param biomeType  The biome type identifier
 * @param bounds     World-space bounding box for the density field
 * @param resolution Optional grid resolution (default [32, 16, 32])
 * @param sdfEval    Optional SDF evaluator
 * @returns A configured VolumeDensityField ready for `buildField()`
 */
export function createVolumeDensityForBiome(
  biomeType: BiomeType,
  bounds: THREE.Box3,
  resolution: [number, number, number] = [32, 16, 32],
  sdfEval?: SDFEvaluator,
): VolumeDensityField {
  const field = new VolumeDensityField(bounds, resolution, sdfEval);

  switch (biomeType) {
    case 'forest': {
      field.config.baseDensity = 1.0;
      field.config.modifiers = [
        {
          type: VolumeDensityModifierType.UNDER_CANOPY,
          params: {
            canopyHeight: bounds.min.y + (bounds.max.y - bounds.min.y) * 0.7,
            boostFactor: 1.8,
            falloffRange: 5.0,
          },
        },
        {
          type: VolumeDensityModifierType.SLOPE,
          params: {
            steepThreshold: 35,
            reductionFactor: 0.2,
            maxSlope: 65,
          },
        },
      ];
      break;
    }

    case 'underwater': {
      field.config.baseDensity = 1.0;
      field.config.modifiers = [
        {
          type: VolumeDensityModifierType.UNDERWATER,
          params: {
            waterPlaneHeight: bounds.min.y + (bounds.max.y - bounds.min.y) * 0.4,
            suppressionFactor: 0.1,
            transitionRange: 1.0,
            invertForAquatic: true,
          },
        },
      ];
      break;
    }

    case 'cave': {
      field.config.baseDensity = 0.8;
      field.config.modifiers = [
        {
          type: VolumeDensityModifierType.CAVE_INTERIOR,
          params: {
            boostFactor: 1.6,
            distanceFalloff: 3.0,
            grassSuppressionFactor: 0.3,
          },
        },
      ];
      break;
    }

    case 'desert': {
      field.config.baseDensity = 0.6;
      field.config.modifiers = [
        {
          type: VolumeDensityModifierType.SLOPE,
          params: {
            steepThreshold: 30,
            reductionFactor: 0.1,
            maxSlope: 55,
          },
        },
      ];
      break;
    }

    case 'mountain': {
      field.config.baseDensity = 0.7;
      field.config.modifiers = [
        {
          type: VolumeDensityModifierType.SLOPE,
          params: {
            steepThreshold: 40,
            reductionFactor: 0.15,
            maxSlope: 75,
          },
        },
        {
          type: VolumeDensityModifierType.ALTITUDE_FALLOFF,
          params: {
            falloffStart: bounds.min.y + (bounds.max.y - bounds.min.y) * 0.5,
            falloffEnd: bounds.max.y,
            minDensity: 0.1,
          },
        },
      ];
      break;
    }
  }

  return field;
}

// ============================================================================
// Scatter System Integration
// ============================================================================

/**
 * Interface for the scatter system's density function that we override.
 * This avoids a hard dependency on InstanceScatterSystem's full type.
 */
interface ScatterSystemWithDensity {
  /** Current density function — may be overridden by integrateWithScatterSystem */
  densityFunction?: (position: THREE.Vector3) => number;
  /** Configuration that may include a density map */
  rules?: {
    densityMap?: number[][];
    [key: string]: any;
  };
  /** Optional method to update the config */
  setRules?(rules: Record<string, any>): void;
}

/**
 * Wire a built VolumeDensityField into an InstanceScatterSystem by
 * overriding the density function with a 3D-aware version.
 *
 * After calling this function, the scatter system will use the volumetric
 * density field for placement decisions instead of its default 2D density.
 *
 * If the field has been pre-built with `buildField()`, sampling uses fast
 * trilinear interpolation. Otherwise, it calls `evaluate()` directly (slower
 * but always correct).
 *
 * @param field          The VolumeDensityField to integrate
 * @param scatterSystem  The scatter system instance to wire into
 * @param options        Optional integration options
 * @param options.scaleToDensityMap  If true, also update the scatter system's
 *                                   2D densityMap from a top-down projection of
 *                                   the 3D field (default: false)
 * @param options.densityMapResX     Resolution X for the projected density map
 * @param options.densityMapResZ     Resolution Z for the projected density map
 */
export function integrateWithScatterSystem(
  field: VolumeDensityField,
  scatterSystem: ScatterSystemWithDensity,
  options?: {
    scaleToDensityMap?: boolean;
    densityMapResX?: number;
    densityMapResZ?: number;
  },
): void {
  const opts = {
    scaleToDensityMap: false,
    densityMapResX: 64,
    densityMapResZ: 64,
    ...options,
  };

  // Override the density function with our 3D-aware version
  const originalDensityFn = scatterSystem.densityFunction;

  scatterSystem.densityFunction = (position: THREE.Vector3): number => {
    let density: number;

    if (field.getFieldData()) {
      // Use fast trilinear interpolation from pre-built grid
      density = field.sampleDensity(position.x, position.y, position.z);
    } else {
      // Fall back to direct evaluation (slower)
      density = field.evaluate(position);
    }

    // If there was an existing density function, blend multiplicatively
    if (originalDensityFn) {
      const originalDensity = originalDensityFn(position);
      density *= originalDensity;
    }

    return Math.max(0, Math.min(2, density));
  };

  // Optionally project the 3D density field to a 2D density map
  if (opts.scaleToDensityMap && scatterSystem.rules) {
    const resX = opts.densityMapResX;
    const resZ = opts.densityMapResZ;
    const bounds = field.getBounds();
    const sizeVec = bounds.getSize(new THREE.Vector3());

    const densityMap: number[][] = [];

    for (let iz = 0; iz < resZ; iz++) {
      const row: number[] = [];
      for (let ix = 0; ix < resX; ix++) {
        // Sample at mid-height of the bounding box (near terrain surface)
        const worldX = bounds.min.x + (ix / (resX - 1)) * sizeVec.x;
        const worldZ = bounds.min.z + (iz / (resZ - 1)) * sizeVec.z;
        const worldY = bounds.min.y + sizeVec.y * 0.1; // Sample near bottom

        const pos = new THREE.Vector3(worldX, worldY, worldZ);
        let d: number;

        if (field.getFieldData()) {
          d = field.sampleDensity(pos.x, pos.y, pos.z);
        } else {
          d = field.evaluate(pos);
        }

        row.push(d);
      }
      densityMap.push(row);
    }

    scatterSystem.rules.densityMap = densityMap;

    if (scatterSystem.setRules) {
      scatterSystem.setRules(scatterSystem.rules);
    }
  }
}

// ============================================================================
// Utility: Density Map Sampling
// ============================================================================

/**
 * Sample a 2D density map at a continuous (u, v) position using bilinear
 * interpolation. Useful for the projected density maps created by
 * `integrateWithScatterSystem`.
 *
 * @param densityMap  2D array of density values [row][col]
 * @param u           Horizontal coordinate in [0, 1]
 * @param v           Vertical coordinate in [0, 1]
 * @returns Interpolated density value
 */
export function sampleDensityMap(
  densityMap: number[][],
  u: number,
  v: number,
): number {
  const rows = densityMap.length;
  if (rows === 0) return 1.0;
  const cols = densityMap[0].length;
  if (cols === 0) return 1.0;

  // Map to grid coordinates
  const gx = Math.max(0, Math.min(cols - 1, u * (cols - 1)));
  const gy = Math.max(0, Math.min(rows - 1, v * (rows - 1)));

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, cols - 1);
  const y1 = Math.min(y0 + 1, rows - 1);

  const fx = gx - x0;
  const fy = gy - y0;

  const c00 = densityMap[y0]?.[x0] ?? 1.0;
  const c10 = densityMap[y0]?.[x1] ?? 1.0;
  const c01 = densityMap[y1]?.[x0] ?? 1.0;
  const c11 = densityMap[y1]?.[x1] ?? 1.0;

  // Bilinear interpolation
  const top = c00 * (1 - fx) + c10 * fx;
  const bottom = c01 * (1 - fx) + c11 * fx;

  return top * (1 - fy) + bottom * fy;
}

// ============================================================================
// Utility: Batch Evaluation
// ============================================================================

/**
 * Evaluate the density field at multiple positions in batch.
 *
 * This is more efficient than calling `evaluate()` in a loop when the
 * field has an SDF evaluator, because terrain height and slope lookups
 * can be amortized for nearby XZ positions.
 *
 * @param field      The density field
 * @param positions  Array of world-space positions
 * @returns Float32Array of density values, one per position
 */
export function evaluateBatch(
  field: VolumeDensityField,
  positions: THREE.Vector3[],
): Float32Array {
  const result = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i++) {
    result[i] = field.evaluate(positions[i]);
  }

  return result;
}

// ============================================================================
// Utility: Field Statistics
// ============================================================================

/**
 * Statistics about a built density field.
 */
export interface DensityFieldStats {
  /** Minimum density value in the field */
  min: number;
  /** Maximum density value in the field */
  max: number;
  /** Average density value */
  mean: number;
  /** Standard deviation of density values */
  stdDev: number;
  /** Fraction of voxels with density < 0.1 (essentially empty) */
  emptyFraction: number;
  /** Fraction of voxels with density > 1.5 (high density) */
  highDensityFraction: number;
  /** Total number of voxels */
  voxelCount: number;
}

/**
 * Compute statistics about a built density field.
 *
 * @param field  The density field (must have been built)
 * @returns Statistics object
 * @throws Error if the field has not been built
 */
export function computeFieldStats(field: VolumeDensityField): DensityFieldStats {
  const data = field.getFieldData();
  if (!data) {
    throw new Error('VolumeDensityField: call buildField() before computeFieldStats()');
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let emptyCount = 0;
  let highCount = 0;

  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (v < 0.1) emptyCount++;
    if (v > 1.5) highCount++;
  }

  const mean = sum / data.length;

  // Compute standard deviation
  let varianceSum = 0;
  for (let i = 0; i < data.length; i++) {
    const diff = data[i] - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / data.length);

  return {
    min,
    max,
    mean,
    stdDev,
    emptyFraction: emptyCount / data.length,
    highDensityFraction: highCount / data.length,
    voxelCount: data.length,
  };
}
