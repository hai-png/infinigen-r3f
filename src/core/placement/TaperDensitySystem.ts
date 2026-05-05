/**
 * TaperDensitySystem.ts
 *
 * Taper scale/density scatter feature for InfiniGen R3F.
 *
 * In the original Infinigen, scatter density can be tapered by distance from
 * camera, altitude, terrain slope, or a custom curve. This system provides a
 * composable set of taper functions that map 3D positions to density
 * multipliers in [0, 1], allowing for effects such as:
 *
 *   - Dense vegetation near the camera that thins out at distance
 *   - Tree density that decreases with altitude (tree line)
 *   - Rocks that concentrate on steep slopes
 *   - Radial falloff from a focal point
 *   - Fully custom user-defined taper curves
 *
 * Architecture:
 *   TaperFunction  — pure function (Vector3 → number) for individual lookups
 *   TaperMode      — enum of built-in taper strategies
 *   TaperConfig    — serialisable configuration for a taper
 *   TaperCurves    — collection of curve evaluation functions
 *   TaperDensitySystem — main class with batch evaluation, texture generation,
 *                        multi-taper composition, and scatter-system integration
 *   DensityTaperPresets — ready-made configurations for common scenarios
 *
 * @module placement/TaperDensitySystem
 */

import * as THREE from 'three';

// ============================================================================
// TaperFunction
// ============================================================================

/**
 * A function that maps a 3D world-space position to a density multiplier
 * in the range [0, 1].
 *
 *   1.0 = full density (no tapering)
 *   0.0 = zero density (fully tapered away)
 *
 * TaperFunctions are composable — they can be multiplied together to combine
 * effects (e.g. distance-from-camera AND altitude tapering).
 */
export type TaperFunction = (position: THREE.Vector3) => number;

// ============================================================================
// TaperMode
// ============================================================================

/**
 * Built-in taper strategies.
 *
 * Each mode defines how the taper distance/parameter is computed from a 3D
 * position before being fed through the selected TaperCurve.
 */
export enum TaperMode {
  /** Density decreases with distance from camera */
  DISTANCE_FROM_CAMERA = 'distanceFromCamera',
  /** Density changes with height (altitude) */
  ALTITUDE = 'altitude',
  /** Density changes with terrain slope angle */
  SLOPE = 'slope',
  /** Density decreases radially from a centre point */
  RADIAL = 'radial',
  /** User-defined custom curve function */
  CUSTOM_CURVE = 'customCurve',
}

// ============================================================================
// TaperCurveType
// ============================================================================

/**
 * Named curve types for the taper profile.
 *
 * These map directly to methods on the {@link TaperCurves} utility class.
 */
export type TaperCurveType = 'linear' | 'quadratic' | 'exponential' | 'smoothstep';

// ============================================================================
// TaperBlendMode
// ============================================================================

/**
 * How multiple taper functions are composed together.
 */
export enum TaperBlendMode {
  /** Multiply all taper values together (intersection — all must agree) */
  MULTIPLY = 'multiply',
  /** Take the minimum taper value (hard-limit — any one can veto) */
  MIN = 'min',
  /** Take the maximum taper value (union — any one can allow) */
  MAX = 'max',
  /** Average of all taper values */
  AVERAGE = 'average',
  /** Additive blending (sum clamped to [0, 1]) */
  ADDITIVE = 'additive',
}

// ============================================================================
// TaperConfig
// ============================================================================

/**
 * Serialisable configuration for a single taper.
 *
 * Each field is optional — sensible defaults are provided by
 * {@link createDefaultTaperConfig}.
 */
export interface TaperConfig {
  /** Which taper strategy to use */
  mode: TaperMode;

  /** Distance at which tapering begins (default 0) */
  startDistance: number;

  /** Distance at which density reaches zero (default 100) */
  endDistance: number;

  /** Curve profile for the taper falloff */
  curve: TaperCurveType;

  /** Flip the taper direction — when true, density *increases* with distance */
  invert: boolean;

  /** Centre point for RADIAL mode (default origin) */
  center: THREE.Vector3;

  /** Altitude range [min, max] for ALTITUDE mode (default [0, 100]) */
  altitudeRange: [number, number];

  /** Slope range [min, max] in degrees for SLOPE mode (default [0, 90]) */
  slopeRange: [number, number];

  /**
   * Custom taper function for CUSTOM_CURVE mode.
   * Takes a normalised parameter t ∈ [0, 1] and returns a density ∈ [0, 1].
   */
  customCurveFn?: (t: number) => number;

  /**
   * Optional terrain-data accessor for SLOPE mode.
   * When provided, the slope at the query position is looked up from this
   * data instead of requiring a separate normal.
   */
  terrainDataProvider?: TerrainDataProvider;

  /**
   * Optional camera position for DISTANCE_FROM_CAMERA mode.
   * Updated dynamically by the scatter system.
   */
  cameraPosition?: THREE.Vector3;
}

// ============================================================================
// TerrainDataProvider
// ============================================================================

/**
 * Interface for terrain data lookup — allows the taper system to query
 * height and slope without a hard dependency on a specific terrain system.
 */
export interface TerrainDataProvider {
  /** Get terrain height at world-space (x, z) */
  getHeight(x: number, z: number): number;
  /** Get terrain slope in degrees at world-space (x, z) */
  getSlope(x: number, z: number): number;
  /** Get terrain normal at world-space (x, z) */
  getNormal?(x: number, z: number): THREE.Vector3;
}

// ============================================================================
// TaperCurves
// ============================================================================

/**
 * Collection of pure curve-evaluation functions.
 *
 * Each function takes a normalised parameter t ∈ [0, 1] and returns a value
 * in [0, 1] representing the density multiplier at that point along the taper.
 *
 * - t = 0 → start of the taper (near the reference)
 * - t = 1 → end of the taper (far from the reference)
 *
 * By convention, all curves return 1.0 at t = 0 and 0.0 at t = 1
 * (density is full near the reference, zero at the far end).
 * Use `invert: true` on the config to flip this relationship.
 */
export class TaperCurves {
  /**
   * Linear interpolation: density falls off linearly from 1 to 0.
   */
  static linear(t: number): number {
    return 1.0 - Math.max(0, Math.min(1, t));
  }

  /**
   * Quadratic ease-in: density drops slowly at first, then quickly.
   * Good for gentle near-field tapering that aggressively cuts off at distance.
   */
  static quadratic(t: number): number {
    const tc = Math.max(0, Math.min(1, t));
    return (1.0 - tc) * (1.0 - tc);
  }

  /**
   * Exponential decay: rapid density drop near the reference, long tail.
   * Good for effects where most of the taper happens close to the camera.
   */
  static exponential(t: number): number {
    const tc = Math.max(0, Math.min(1, t));
    return Math.exp(-4.0 * tc);
  }

  /**
   * Hermite smoothstep: S-curve interpolation with zero first-derivative
   * at both endpoints. Provides the smoothest visual transition.
   */
  static smoothstep(t: number): number {
    const tc = Math.max(0, Math.min(1, t));
    // smoothstep returns 1 at tc=0 and 0 at tc=1
    return 1.0 - tc * tc * (3.0 - 2.0 * tc);
  }

  /**
   * Clamped smoothstep between two edges.
   * Returns 1.0 below edge0, 0.0 above edge1, and a smoothstep
   * transition between.
   */
  static smoothstepRange(t: number, edge0: number, edge1: number): number {
    if (t <= edge0) return 1.0;
    if (t >= edge1) return 0.0;
    const tc = (t - edge0) / (edge1 - edge0);
    return 1.0 - tc * tc * (3.0 - 2.0 * tc);
  }

  /**
   * Evaluate a curve by name.
   *
   * @param curveName  One of 'linear', 'quadratic', 'exponential', 'smoothstep'
   * @param t          Normalised parameter ∈ [0, 1]
   * @returns Density multiplier ∈ [0, 1]
   */
  static evaluate(curveName: TaperCurveType, t: number): number {
    switch (curveName) {
      case 'linear':
        return TaperCurves.linear(t);
      case 'quadratic':
        return TaperCurves.quadratic(t);
      case 'exponential':
        return TaperCurves.exponential(t);
      case 'smoothstep':
        return TaperCurves.smoothstep(t);
      default:
        return TaperCurves.linear(t);
    }
  }
}

// ============================================================================
// Helper: createDefaultTaperConfig
// ============================================================================

/**
 * Create a TaperConfig with sensible defaults for a given mode.
 *
 * @param mode  The taper mode (default DISTANCE_FROM_CAMERA)
 * @returns A fully-populated TaperConfig
 */
export function createDefaultTaperConfig(mode: TaperMode = TaperMode.DISTANCE_FROM_CAMERA): TaperConfig {
  return {
    mode,
    startDistance: 0,
    endDistance: 100,
    curve: 'smoothstep',
    invert: false,
    center: new THREE.Vector3(0, 0, 0),
    altitudeRange: [0, 100],
    slopeRange: [0, 90],
  };
}

// ============================================================================
// TaperDensitySystem
// ============================================================================

/**
 * Main system for computing taper-based density adjustments.
 *
 * Provides methods to:
 *   - Compute a density multiplier at a single 3D position
 *   - Generate a 2D density texture (DataTexture) for GPU scatter
 *   - Compose multiple taper functions together with different blend modes
 *   - Apply tapering to an existing scatter system
 *   - Compute how many instances survive tapering
 *
 * Usage:
 * ```ts
 * const system = new TaperDensitySystem();
 *
 * // Single-point query
 * const density = system.computeDensityMultiplier(
 *   new THREE.Vector3(10, 5, 20),
 *   DensityTaperPresets.CAMERA_LOD,
 * );
 *
 * // Generate GPU texture
 * const texture = system.computeDensityMap(
 *   new THREE.Box3(new THREE.Vector3(-50,0,-50), new THREE.Vector3(50,100,50)),
 *   256,
 *   DensityTaperPresets.ALTITUDE_VEGETATION,
 * );
 * ```
 */
export class TaperDensitySystem {
  /** Reusable vector to avoid per-call allocations */
  private readonly _tempVec = new THREE.Vector3();

  // -------------------------------------------------------------------
  // computeDensityMultiplier
  // -------------------------------------------------------------------

  /**
   * Compute the density multiplier at a given 3D position according to a
   * taper configuration.
   *
   * @param position  World-space position to evaluate
   * @param config    Taper configuration
   * @returns Density multiplier in [0, 1]
   */
  computeDensityMultiplier(position: THREE.Vector3, config: TaperConfig): number {
    const t = this.computeNormalisedParameter(position, config);
    let density: number;

    if (config.mode === TaperMode.CUSTOM_CURVE && config.customCurveFn) {
      density = config.customCurveFn(t);
    } else {
      density = TaperCurves.evaluate(config.curve, t);
    }

    // Invert: flip the taper so density *increases* with distance
    if (config.invert) {
      density = 1.0 - density;
    }

    return Math.max(0, Math.min(1, density));
  }

  // -------------------------------------------------------------------
  // computeDensityMap
  // -------------------------------------------------------------------

  /**
   * Generate a 2D density texture (XZ plane) for GPU scatter consumption.
   *
   * Samples the taper function on a regular grid over the XZ extent of the
   * bounding box and packs the result into a THREE.DataTexture.
   *
   * For ALTITUDE mode the Y value at each sample is taken from the terrain
   * data provider; otherwise, the Y value is the mid-height of the bounds.
   *
   * @param bounds      World-space bounding box defining the sampling area
   * @param resolution  Grid resolution (width = height = resolution)
   * @param config      Taper configuration
   * @returns DataTexture with R channel = density multiplier in [0, 1]
   */
  computeDensityMap(
    bounds: THREE.Box3,
    resolution: number,
    config: TaperConfig,
  ): THREE.DataTexture {
    const size = resolution * resolution;
    const data = new Float32Array(size * 4); // RGBA

    const sizeVec = bounds.getSize(new THREE.Vector3());
    const midY = bounds.min.y + sizeVec.y * 0.5;

    for (let iz = 0; iz < resolution; iz++) {
      for (let ix = 0; ix < resolution; ix++) {
        const u = ix / Math.max(1, resolution - 1);
        const v = iz / Math.max(1, resolution - 1);

        const worldX = bounds.min.x + u * sizeVec.x;
        const worldZ = bounds.min.z + v * sizeVec.z;

        // For altitude mode, try to get terrain height
        let worldY = midY;
        if (config.mode === TaperMode.ALTITUDE && config.terrainDataProvider) {
          worldY = config.terrainDataProvider.getHeight(worldX, worldZ);
        }

        const pos = new THREE.Vector3(worldX, worldY, worldZ);
        const density = this.computeDensityMultiplier(pos, config);

        const idx = (iz * resolution + ix) * 4;
        data[idx + 0] = density;  // R = density
        data[idx + 1] = 0;        // G
        data[idx + 2] = 0;        // B
        data[idx + 3] = 1;        // A
      }
    }

    const texture = new THREE.DataTexture(
      data,
      resolution,
      resolution,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.needsUpdate = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return texture;
  }

  // -------------------------------------------------------------------
  // composeTapers
  // -------------------------------------------------------------------

  /**
   * Compose multiple taper functions together using the specified blend mode.
   *
   * @param tapers     Array of TaperFunction instances
   * @param blendMode  How to combine the taper values (default MULTIPLY)
   * @returns A new TaperFunction that evaluates all tapers and blends them
   */
  composeTapers(
    tapers: TaperFunction[],
    blendMode: TaperBlendMode = TaperBlendMode.MULTIPLY,
  ): TaperFunction {
    if (tapers.length === 0) {
      return () => 1.0;
    }

    if (tapers.length === 1) {
      return tapers[0];
    }

    return (position: THREE.Vector3): number => {
      let result: number;

      switch (blendMode) {
        case TaperBlendMode.MULTIPLY: {
          result = 1.0;
          for (const taper of tapers) {
            result *= taper(position);
            if (result <= 0) return 0; // early out
          }
          break;
        }

        case TaperBlendMode.MIN: {
          result = Infinity;
          for (const taper of tapers) {
            const v = taper(position);
            if (v < result) result = v;
          }
          break;
        }

        case TaperBlendMode.MAX: {
          result = -Infinity;
          for (const taper of tapers) {
            const v = taper(position);
            if (v > result) result = v;
          }
          break;
        }

        case TaperBlendMode.AVERAGE: {
          let sum = 0;
          for (const taper of tapers) {
            sum += taper(position);
          }
          result = sum / tapers.length;
          break;
        }

        case TaperBlendMode.ADDITIVE: {
          let sum = 0;
          for (const taper of tapers) {
            sum += taper(position);
          }
          result = Math.min(1, sum);
          break;
        }

        default: {
          result = 1.0;
          for (const taper of tapers) {
            result *= taper(position);
          }
          break;
        }
      }

      return Math.max(0, Math.min(1, result));
    };
  }

  // -------------------------------------------------------------------
  // applyTaperToScatter
  // -------------------------------------------------------------------

  /**
   * Apply a taper configuration to an existing scatter system.
   *
   * This returns a TaperFunction that can be used to filter scattered
   * instances, and optionally wraps the taper into a filter function
   * compatible with the DensityPlacementSystem's PlacementMask.
   *
   * @param scatterSystem  Object with a density function that can be overridden
   * @param taperConfig    Taper configuration to apply
   * @returns The TaperFunction that was applied, for chaining or manual use
   */
  applyTaperToScatter(
    scatterSystem: ScatterSystemWithDensity,
    taperConfig: TaperConfig,
  ): TaperFunction {
    const taperFn = this.createTaperFunction(taperConfig);

    // Store the original density function
    const originalDensityFn = scatterSystem.densityFunction;

    // Override with tapered version
    scatterSystem.densityFunction = (position: THREE.Vector3): number => {
      const taperMultiplier = taperFn(position);

      // Blend with original density function if present
      if (originalDensityFn) {
        const originalDensity = originalDensityFn(position);
        return Math.max(0, Math.min(1, originalDensity * taperMultiplier));
      }

      return taperMultiplier;
    };

    return taperFn;
  }

  // -------------------------------------------------------------------
  // computeTaperedInstanceCount
  // -------------------------------------------------------------------

  /**
   * Compute how many instances from a set of positions survive tapering.
   *
   * For each position, the taper multiplier is computed. If it is above a
   * random threshold (deterministic, based on position hash), the instance
   * survives. This produces a statistically correct count for budgeting.
   *
   * @param baseCount    Total number of candidate instances
   * @param positions    World-space positions of all candidates
   * @param taperConfig  Taper configuration
   * @returns Number of instances expected to survive tapering
   */
  computeTaperedInstanceCount(
    baseCount: number,
    positions: THREE.Vector3[],
    taperConfig: TaperConfig,
  ): number {
    if (positions.length === 0) return 0;

    let survivorCount = 0;

    for (let i = 0; i < Math.min(baseCount, positions.length); i++) {
      const density = this.computeDensityMultiplier(positions[i], taperConfig);

      // Use position-based deterministic threshold for consistency
      const threshold = this.positionHash(positions[i]);
      if (density >= threshold) {
        survivorCount++;
      }
    }

    return survivorCount;
  }

  // -------------------------------------------------------------------
  // createTaperFunction
  // -------------------------------------------------------------------

  /**
   * Create a standalone TaperFunction from a TaperConfig.
   *
   * The returned function is self-contained and can be used independently
   * of the TaperDensitySystem instance.
   *
   * @param config  Taper configuration
   * @returns A pure TaperFunction
   */
  createTaperFunction(config: TaperConfig): TaperFunction {
    // Capture config values in closure for performance
    const mode = config.mode;
    const startDist = config.startDistance;
    const endDist = config.endDistance;
    const range = Math.max(0.001, endDist - startDist);
    const curveType = config.curve;
    const invert = config.invert;
    const center = config.center.clone();
    const altMin = config.altitudeRange[0];
    const altRange = Math.max(0.001, config.altitudeRange[1] - config.altitudeRange[0]);
    const slopeMin = config.slopeRange[0];
    const slopeRange = Math.max(0.001, config.slopeRange[1] - config.slopeRange[0]);
    const customFn = config.customCurveFn;
    const terrainProvider = config.terrainDataProvider;
    const cameraPos = config.cameraPosition;

    return (position: THREE.Vector3): number => {
      let t: number;

      switch (mode) {
        // ----- Distance from camera -----
        case TaperMode.DISTANCE_FROM_CAMERA: {
          const camPos = cameraPos ?? new THREE.Vector3(0, 10, 0);
          const dist = position.distanceTo(camPos);
          t = (dist - startDist) / range;
          break;
        }

        // ----- Altitude -----
        case TaperMode.ALTITUDE: {
          t = (position.y - altMin) / altRange;
          break;
        }

        // ----- Slope -----
        case TaperMode.SLOPE: {
          if (terrainProvider) {
            const slopeDeg = terrainProvider.getSlope(position.x, position.z);
            t = (slopeDeg - slopeMin) / slopeRange;
          } else {
            // No terrain data: assume flat → slope of 0
            t = 0;
          }
          break;
        }

        // ----- Radial from centre -----
        case TaperMode.RADIAL: {
          const dist = position.distanceTo(center);
          t = (dist - startDist) / range;
          break;
        }

        // ----- Custom curve -----
        case TaperMode.CUSTOM_CURVE: {
          if (customFn) {
            // customCurveFn receives the raw normalised distance parameter
            const dist = position.distanceTo(center);
            t = (dist - startDist) / range;
            let density = customFn(t);
            if (invert) density = 1.0 - density;
            return Math.max(0, Math.min(1, density));
          }
          t = 0;
          break;
        }

        default:
          t = 0;
          break;
      }

      let density = TaperCurves.evaluate(curveType, t);
      if (invert) density = 1.0 - density;

      return Math.max(0, Math.min(1, density));
    };
  }

  // -------------------------------------------------------------------
  // computeNormalisedParameter
  // -------------------------------------------------------------------

  /**
   * Compute the normalised parameter t ∈ (-∞, +∞) for a given position
   * and config. The curve function will clamp and remap as needed.
   */
  private computeNormalisedParameter(position: THREE.Vector3, config: TaperConfig): number {
    const range = Math.max(0.001, config.endDistance - config.startDistance);

    switch (config.mode) {
      case TaperMode.DISTANCE_FROM_CAMERA: {
        const camPos = config.cameraPosition ?? new THREE.Vector3(0, 10, 0);
        const dist = position.distanceTo(camPos);
        return (dist - config.startDistance) / range;
      }

      case TaperMode.ALTITUDE: {
        const altRange = Math.max(0.001, config.altitudeRange[1] - config.altitudeRange[0]);
        return (position.y - config.altitudeRange[0]) / altRange;
      }

      case TaperMode.SLOPE: {
        if (config.terrainDataProvider) {
          const slopeDeg = config.terrainDataProvider.getSlope(position.x, position.z);
          const slopeRange = Math.max(0.001, config.slopeRange[1] - config.slopeRange[0]);
          return (slopeDeg - config.slopeRange[0]) / slopeRange;
        }
        return 0;
      }

      case TaperMode.RADIAL: {
        const dist = position.distanceTo(config.center);
        return (dist - config.startDistance) / range;
      }

      case TaperMode.CUSTOM_CURVE: {
        // For custom curve, use radial distance as the base parameter
        const dist = position.distanceTo(config.center);
        return (dist - config.startDistance) / range;
      }

      default:
        return 0;
    }
  }

  // -------------------------------------------------------------------
  // positionHash
  // -------------------------------------------------------------------

  /**
   * Deterministic hash of a 3D position that returns a value in [0, 1).
   * Used for stochastic instance acceptance/rejection.
   */
  private positionHash(position: THREE.Vector3): number {
    // Simple but fast hash based on sin mixing
    const x = position.x * 12.9898;
    const y = position.y * 78.233;
    const z = position.z * 45.164;
    const dot = x + y + z;
    const sinVal = Math.sin(dot) * 43758.5453;
    return sinVal - Math.floor(sinVal);
  }
}

// ============================================================================
// ScatterSystemWithDensity interface
// ============================================================================

/**
 * Interface for a scatter system that supports density function overrides.
 *
 * This avoids a hard dependency on the full ScatterSystem type — any object
 * that exposes a `densityFunction` property can be tapered.
 */
export interface ScatterSystemWithDensity {
  /** Current density function — may be overridden by applyTaperToScatter */
  densityFunction?: (position: THREE.Vector3) => number;
  /** Optional configuration that may include a density map */
  rules?: {
    densityMap?: number[][];
    [key: string]: unknown;
  };
  /** Optional method to update the config */
  setRules?(rules: Record<string, unknown>): void;
}

// ============================================================================
// DensityTaperPresets
// ============================================================================

/**
 * Pre-built taper configurations for common natural-world scenarios.
 *
 * Each preset is a fully-defined TaperConfig that can be passed directly to
 * {@link TaperDensitySystem.computeDensityMultiplier} or
 * {@link TaperDensitySystem.computeDensityMap}.
 *
 * Note: Presets that reference a camera position or terrain data provider
 * must have those fields set at runtime before use.
 */
export namespace DensityTaperPresets {
  /**
   * FOREST_EDGE — Dense at centre, thins at edges (radial).
   *
   * Simulates a forest clearing or dense woodland core that transitions
   * to sparse trees at the perimeter.
   */
  export const FOREST_EDGE: TaperConfig = {
    mode: TaperMode.RADIAL,
    startDistance: 0,
    endDistance: 80,
    curve: 'smoothstep',
    invert: false,
    center: new THREE.Vector3(0, 0, 0),
    altitudeRange: [0, 100],
    slopeRange: [0, 90],
  };

  /**
   * ALTITUDE_VEGETATION — Trees thin out above the tree line (altitude).
   *
   * Full density from sea level up to 40m, then smooth falloff to zero
   * at 80m. Models real-world alpine tree lines.
   */
  export const ALTITUDE_VEGETATION: TaperConfig = {
    mode: TaperMode.ALTITUDE,
    startDistance: 0,
    endDistance: 100,
    curve: 'smoothstep',
    invert: false,
    center: new THREE.Vector3(0, 0, 0),
    altitudeRange: [40, 80],
    slopeRange: [0, 90],
  };

  /**
   * CAMERA_LOD — Reduce scatter density with camera distance.
   *
   * Full density within 20m of the camera, tapering to zero at 200m.
   * Uses exponential decay for a natural-looking falloff that keeps
   * nearby detail while culling far objects.
   */
  export const CAMERA_LOD: TaperConfig = {
    mode: TaperMode.DISTANCE_FROM_CAMERA,
    startDistance: 20,
    endDistance: 200,
    curve: 'exponential',
    invert: false,
    center: new THREE.Vector3(0, 0, 0),
    altitudeRange: [0, 100],
    slopeRange: [0, 90],
  };

  /**
   * SLOPE_ROCKS — More rocks on steep slopes (slope).
   *
   * Uses `invert: true` so that density *increases* with slope angle.
   * No rocks below 30°, full density above 70°, smooth transition between.
   */
  export const SLOPE_ROCKS: TaperConfig = {
    mode: TaperMode.SLOPE,
    startDistance: 0,
    endDistance: 100,
    curve: 'smoothstep',
    invert: true,
    center: new THREE.Vector3(0, 0, 0),
    altitudeRange: [0, 100],
    slopeRange: [30, 70],
  };

  /**
   * SHORELINE — Dense near water, thins inland (custom with water proximity).
   *
   * Uses CUSTOM_CURVE mode with a distance-based falloff that is tuned
   * for shoreline vegetation (reeds, grasses) that grows densely within
   * 5m of the water's edge and disappears by 25m inland.
   */
  export const SHORELINE: TaperConfig = {
    mode: TaperMode.CUSTOM_CURVE,
    startDistance: 0,
    endDistance: 25,
    curve: 'linear', // not used in custom mode, but required by type
    invert: false,
    center: new THREE.Vector3(0, 0, 0),
    altitudeRange: [0, 100],
    slopeRange: [0, 90],
    customCurveFn: (t: number): number => {
      // Shoreline profile: steep initial falloff then gradual thinning
      // Full density for t < 0.1 (within 2.5m), then smooth decay
      if (t <= 0.0) return 1.0;
      if (t >= 1.0) return 0.0;
      // Quadratic ease with a bias toward the near-shore region
      const nearBias = Math.exp(-3.0 * t);
      const smoothFalloff = 1.0 - t * t * (3.0 - 2.0 * t);
      // Blend the two: stronger near-shore bias, smoother far-shore
      return 0.6 * nearBias + 0.4 * smoothFalloff;
    },
  };
}

// ============================================================================
// MultiTaperComposer — convenience builder
// ============================================================================

/**
 * Fluent builder for composing multiple tapers.
 *
 * Usage:
 * ```ts
 * const taperFn = new MultiTaperComposer()
 *   .add(DensityTaperPresets.CAMERA_LOD)
 *   .add(DensityTaperPresets.ALTITUDE_VEGETATION)
 *   .blend(TaperBlendMode.MULTIPLY)
 *   .build();
 *
 * const density = taperFn(new THREE.Vector3(10, 50, 20));
 * ```
 */
export class MultiTaperComposer {
  private tapers: TaperFunction[] = [];
  private blendMode: TaperBlendMode = TaperBlendMode.MULTIPLY;
  private system: TaperDensitySystem;

  constructor() {
    this.system = new TaperDensitySystem();
  }

  /**
   * Add a taper configuration to the composition.
   */
  add(config: TaperConfig): this {
    this.tapers.push(this.system.createTaperFunction(config));
    return this;
  }

  /**
   * Add a raw TaperFunction to the composition.
   */
  addFunction(fn: TaperFunction): this {
    this.tapers.push(fn);
    return this;
  }

  /**
   * Set the blend mode for combining tapers.
   */
  blend(mode: TaperBlendMode): this {
    this.blendMode = mode;
    return this;
  }

  /**
   * Build the composed TaperFunction.
   */
  build(): TaperFunction {
    return this.system.composeTapers(this.tapers, this.blendMode);
  }
}

// ============================================================================
// TaperedScatterFilter — stochastic instance filter
// ============================================================================

/**
 * A utility that filters an array of scattered positions by applying a
 * taper function stochastically. Each position is accepted or rejected
 * based on whether its taper density exceeds a deterministic threshold
 * derived from the position hash.
 *
 * This is the CPU-side equivalent of sampling a density texture — useful
 * for pre-filtering positions before GPU upload.
 */
export class TaperedScatterFilter {
  private system: TaperDensitySystem;

  constructor() {
    this.system = new TaperDensitySystem();
  }

  /**
   * Filter positions by a taper configuration.
   *
   * @param positions  Candidate positions
   * @param config     Taper configuration
   * @param seed       Optional seed for the deterministic hash
   * @returns Positions that survive tapering
   */
  filter(
    positions: THREE.Vector3[],
    config: TaperConfig,
    _seed: number = 0,
  ): THREE.Vector3[] {
    return positions.filter(pos => {
      const density = this.system.computeDensityMultiplier(pos, config);
      const threshold = this.positionHash(pos);
      return density >= threshold;
    });
  }

  /**
   * Filter positions by a pre-built TaperFunction.
   *
   * @param positions  Candidate positions
   * @param taperFn    Taper function
   * @returns Positions that survive tapering
   */
  filterByFunction(positions: THREE.Vector3[], taperFn: TaperFunction): THREE.Vector3[] {
    return positions.filter(pos => {
      const density = taperFn(pos);
      const threshold = this.positionHash(pos);
      return density >= threshold;
    });
  }

  /**
   * Compute the fraction of positions that survive tapering (without
   * allocating a new array).
   *
   * @param positions  Candidate positions
   * @param config     Taper configuration
   * @returns Survival fraction in [0, 1]
   */
  computeSurvivalFraction(positions: THREE.Vector3[], config: TaperConfig): number {
    if (positions.length === 0) return 0;

    let survivors = 0;
    for (const pos of positions) {
      const density = this.system.computeDensityMultiplier(pos, config);
      const threshold = this.positionHash(pos);
      if (density >= threshold) survivors++;
    }

    return survivors / positions.length;
  }

  private positionHash(position: THREE.Vector3): number {
    const x = position.x * 12.9898;
    const y = position.y * 78.233;
    const z = position.z * 45.164;
    const dot = x + y + z;
    const sinVal = Math.sin(dot) * 43758.5453;
    return sinVal - Math.floor(sinVal);
  }
}

// ============================================================================
// TaperStatistics — analysis helpers
// ============================================================================

/**
 * Statistics about a taper applied over a set of positions.
 */
export interface TaperStatistics {
  /** Minimum density multiplier */
  min: number;
  /** Maximum density multiplier */
  max: number;
  /** Mean density multiplier */
  mean: number;
  /** Standard deviation */
  stdDev: number;
  /** Fraction of positions with density < 0.1 (effectively zero) */
  zeroFraction: number;
  /** Fraction of positions with density > 0.9 (effectively full) */
  fullFraction: number;
  /** Total number of positions analysed */
  count: number;
}

/**
 * Compute statistics about a taper over a set of positions.
 *
 * @param positions  Positions to sample
 * @param config     Taper configuration
 * @returns Statistical summary
 */
export function computeTaperStatistics(
  positions: THREE.Vector3[],
  config: TaperConfig,
): TaperStatistics {
  const system = new TaperDensitySystem();

  if (positions.length === 0) {
    return { min: 0, max: 0, mean: 0, stdDev: 0, zeroFraction: 0, fullFraction: 0, count: 0 };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let zeroCount = 0;
  let fullCount = 0;

  const values: number[] = [];

  for (const pos of positions) {
    const density = system.computeDensityMultiplier(pos, config);
    values.push(density);

    if (density < min) min = density;
    if (density > max) max = density;
    sum += density;
    if (density < 0.1) zeroCount++;
    if (density > 0.9) fullCount++;
  }

  const mean = sum / positions.length;

  let varianceSum = 0;
  for (const v of values) {
    const diff = v - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / positions.length);

  return {
    min,
    max,
    mean,
    stdDev,
    zeroFraction: zeroCount / positions.length,
    fullFraction: fullCount / positions.length,
    count: positions.length,
  };
}

// ============================================================================
// DensityTextureComposer — GPU-oriented multi-taper texture generation
// ============================================================================

/**
 * Composes multiple taper configurations into a single density texture.
 *
 * Each taper is evaluated independently on the grid and the results are
 * blended according to the specified blend mode. This allows, for example,
 * combining a camera-distance taper with an altitude taper in a single
 * texture for the GPU scatter system.
 */
export class DensityTextureComposer {
  private system: TaperDensitySystem;

  constructor() {
    this.system = new TaperDensitySystem();
  }

  /**
   * Generate a composed density texture from multiple taper configs.
   *
   * @param bounds      World-space bounding box
   * @param resolution  Grid resolution (width = height)
   * @param configs     Array of taper configurations to compose
   * @param blendMode   How to combine the taper values (default MULTIPLY)
   * @returns DataTexture with R = composed density in [0, 1]
   */
  composeToTexture(
    bounds: THREE.Box3,
    resolution: number,
    configs: TaperConfig[],
    blendMode: TaperBlendMode = TaperBlendMode.MULTIPLY,
  ): THREE.DataTexture {
    if (configs.length === 0) {
      // No tapers: return a fully-dense texture
      return this.system.computeDensityMap(bounds, resolution, {
        ...createDefaultTaperConfig(TaperMode.RADIAL),
        startDistance: 0,
        endDistance: 1e6, // effectively infinite → always full density
      });
    }

    if (configs.length === 1) {
      return this.system.computeDensityMap(bounds, resolution, configs[0]);
    }

    // Build taper functions
    const taperFns = configs.map(c => this.system.createTaperFunction(c));
    const composedFn = this.system.composeTapers(taperFns, blendMode);

    const size = resolution * resolution;
    const data = new Float32Array(size * 4);
    const sizeVec = bounds.getSize(new THREE.Vector3());
    const midY = bounds.min.y + sizeVec.y * 0.5;

    for (let iz = 0; iz < resolution; iz++) {
      for (let ix = 0; ix < resolution; ix++) {
        const u = ix / Math.max(1, resolution - 1);
        const v = iz / Math.max(1, resolution - 1);

        const worldX = bounds.min.x + u * sizeVec.x;
        const worldZ = bounds.min.z + v * sizeVec.z;

        // Determine Y: try terrain data from any config that has one
        let worldY = midY;
        for (const config of configs) {
          if (config.terrainDataProvider && config.mode === TaperMode.ALTITUDE) {
            worldY = config.terrainDataProvider.getHeight(worldX, worldZ);
            break;
          }
        }

        const pos = new THREE.Vector3(worldX, worldY, worldZ);
        const density = composedFn(pos);

        const idx = (iz * resolution + ix) * 4;
        data[idx + 0] = density;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 1;
      }
    }

    const texture = new THREE.DataTexture(
      data,
      resolution,
      resolution,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.needsUpdate = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return texture;
  }
}
