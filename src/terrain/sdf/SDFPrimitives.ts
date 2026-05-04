/**
 * SDF Primitives — Core SDF Primitive Functions
 *
 * Implements core SDF primitive functions matching the original Infinigen's
 * terrain elements. All functions are pure (no side effects) and work with
 * the SeededRandom system for deterministic generation.
 *
 * Phase 2 — P2.1: SDF Primitive Library
 *
 * @module terrain/sdf
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SDFPrimitiveResult {
  /** Signed distance value at the query point */
  distance: number;
  /** Material ID for multi-material support */
  materialId: number;
}

export type SDFEvaluator = (point: THREE.Vector3) => SDFPrimitiveResult;

// Material IDs for terrain multi-material support
export const TERRAIN_MATERIALS = {
  STONE: 0,
  SAND: 1,
  SOIL: 2,
  DIRT: 3,
  MUD: 4,
  SNOW: 5,
  ICE: 6,
  COBBLESTONE: 7,
  GRASS: 8,
  WATER: 9,
  LAVA: 10,
  SAND_DUNE: 11,
} as const;

// ---------------------------------------------------------------------------
// Basic SDF Primitives
// ---------------------------------------------------------------------------

/** SDF of a sphere centered at origin */
export function sdSphere(point: THREE.Vector3, radius: number): number {
  return point.length() - radius;
}

/** SDF of a box with half-extents */
export function sdBox(point: THREE.Vector3, halfSize: THREE.Vector3): number {
  const q = new THREE.Vector3(
    Math.abs(point.x) - halfSize.x,
    Math.abs(point.y) - halfSize.y,
    Math.abs(point.z) - halfSize.z,
  );
  const outside = new THREE.Vector3(
    Math.max(q.x, 0),
    Math.max(q.y, 0),
    Math.max(q.z, 0),
  ).length();
  const inside = Math.min(Math.max(q.x, Math.max(q.y, q.z)), 0);
  return outside + inside;
}

/** SDF of a torus in the XZ plane */
export function sdTorus(point: THREE.Vector3, majorRadius: number, minorRadius: number): number {
  const q = new THREE.Vector2(
    new THREE.Vector2(point.x, point.z).length() - majorRadius,
    point.y,
  );
  return q.length() - minorRadius;
}

/** SDF of a cylinder along the Y axis */
export function sdCylinder(point: THREE.Vector3, radius: number, halfHeight: number): number {
  const d = new THREE.Vector2(point.x, point.z).length() - radius;
  const h = Math.abs(point.y) - halfHeight;
  const outside = new THREE.Vector2(Math.max(d, 0), Math.max(h, 0)).length();
  const inside = Math.min(Math.max(d, h), 0);
  return outside + inside;
}

/** SDF of a cone (tip at origin, base at y=-height) */
export function sdCone(point: THREE.Vector3, radius: number, height: number): number {
  const q = new THREE.Vector2(
    new THREE.Vector2(point.x, point.z).length(),
    point.y,
  );
  const tip = q.clone().sub(new THREE.Vector2(0, -height));
  const base = q.clone().sub(new THREE.Vector2(radius, 0));
  const h = tip.dot(base) < 0 ? tip.length() : base.dot(tip) < 0 ? base.length() : Math.abs(q.x * radius - q.y * height) / Math.sqrt(radius * radius + height * height);
  return h * Math.sign(q.y);
}

/** SDF of a capsule (cylinder with hemispherical caps) */
export function sdCapsule(point: THREE.Vector3, radius: number, halfHeight: number): number {
  const p = new THREE.Vector3(point.x, Math.abs(point.y) - halfHeight, point.z);
  const d = new THREE.Vector2(
    new THREE.Vector2(p.x, p.z).length() - radius,
    p.y,
  );
  return Math.min(Math.max(d.x, d.y), 0.0) + new THREE.Vector2(Math.max(d.x, 0), Math.max(d.y, 0)).length();
}

/** SDF of an infinite ground plane at y=0 */
export function sdGroundPlane(point: THREE.Vector3): number {
  return point.y;
}

// ---------------------------------------------------------------------------
// Cave-Aware Ground SDF with Auxiliary Outputs
// ---------------------------------------------------------------------------

/**
 * Auxiliary output structure for the enhanced ground SDF.
 * Provides cave tags, boundary information, and sand dune data
 * alongside the standard distance and material fields.
 */
export interface GroundAuxiliaryOutput {
  /** Signed distance to ground surface */
  distance: number;
  /** Material ID (soil, sand, sand-dune, etc.) */
  materialId: number;
  /** Whether this point is inside a cave */
  caveTag: boolean;
  /** Distance to nearest boundary (shore, cave entrance) */
  boundarySDF: number;
  /** Local sand dune displacement value */
  sandDuneHeight: number;
}

/**
 * Configuration for the enhanced ground SDF element.
 * Controls ground mode (flat plane or spherical planet),
 * sand dune warping, and cave-awareness.
 */
export interface GroundConfig {
  /** Ground mode: flat infinite plane or spherical planet */
  mode: 'flat' | 'spherical';
  /** Sphere radius for spherical mode (default 1000) */
  sphereRadius: number;
  /** Enable sand dune displacement */
  sandDunes: boolean;
  /** Dune height amplitude (default 2.0) */
  sandDuneAmplitude: number;
  /** Dune spatial frequency (default 0.02) */
  sandDuneFrequency: number;
  /** Dune noise octaves (default 4) */
  sandDuneOctaves: number;
  /** Enable cave tags in output */
  caveAware: boolean;
  /** Ground plane height offset (default 0) */
  baseHeight: number;
}

/** Default ground configuration */
export const DEFAULT_GROUND_CONFIG: GroundConfig = {
  mode: 'flat',
  sphereRadius: 1000,
  sandDunes: false,
  sandDuneAmplitude: 2.0,
  sandDuneFrequency: 0.02,
  sandDuneOctaves: 4,
  caveAware: false,
  baseHeight: 0,
};

/**
 * Compute FBM-based sand dune displacement on the Y axis.
 * Uses multiple octaves of noise to create rolling dune shapes.
 *
 * @param x - World X coordinate
 * @param z - World Z coordinate
 * @param amplitude - Maximum dune height
 * @param frequency - Spatial frequency of dunes
 * @param octaves - Number of FBM noise octaves
 * @param noiseFn - Noise function (x, y, z, octaves) => number
 */
function computeSandDuneHeight(
  x: number,
  z: number,
  amplitude: number,
  frequency: number,
  octaves: number,
  noiseFn: (x: number, y: number, z: number, octaves: number) => number,
): number {
  // Use two noise samples offset in Z to create directional dune crests
  const n1 = noiseFn(x * frequency, 0, z * frequency, octaves);
  const n2 = noiseFn(x * frequency + 500, 0, z * frequency + 500, octaves);

  // Blend: primary dune direction with cross-wind ridges
  const duneValue = n1 * 0.7 + n2 * 0.3;

  // Scale and offset so dunes are always positive (above base ground)
  // Map from roughly [-1,1] to [0,1] then scale by amplitude
  return Math.max(0, (duneValue + 1.0) * 0.5) * amplitude;
}

/**
 * Enhanced ground SDF supporting flat/spherical modes, sand dune warping,
 * and cave-aware boundary outputs.
 *
 * @param point - Query point in world space
 * @param config - Ground configuration
 * @param noiseFn - Noise function for dune displacement
 * @param caveEvaluators - Optional array of cave SDF evaluators for cave-aware output
 * @returns Ground auxiliary output with distance, material, cave/boundary tags
 */
export function sdGround(
  point: THREE.Vector3,
  config: GroundConfig,
  noiseFn: (x: number, y: number, z: number, octaves: number) => number,
  caveEvaluators?: SDFEvaluator[],
): GroundAuxiliaryOutput {
  // --- Compute base ground distance ---
  let baseDistance: number;

  if (config.mode === 'spherical') {
    // Spherical planet mode: distance = point.length() - sphereRadius
    baseDistance = point.length() - config.sphereRadius;
  } else {
    // Flat plane mode: distance = point.y - baseHeight
    baseDistance = point.y - config.baseHeight;
  }

  // --- Compute sand dune displacement ---
  let sandDuneHeight = 0;
  let duneDisplacement = 0;

  if (config.sandDunes) {
    sandDuneHeight = computeSandDuneHeight(
      point.x,
      point.z,
      config.sandDuneAmplitude,
      config.sandDuneFrequency,
      config.sandDuneOctaves,
      noiseFn,
    );

    if (config.mode === 'spherical') {
      // For spherical mode, dunes push the surface outward along the radial direction.
      // Approximate by subtracting dune height from the distance.
      duneDisplacement = -sandDuneHeight;
    } else {
      // For flat mode, dunes displace the Y surface upward.
      // SDF: point.y - (baseHeight + duneHeight) = (point.y - baseHeight) - duneHeight
      duneDisplacement = -sandDuneHeight;
    }
  }

  const distance = baseDistance + duneDisplacement;

  // --- Determine material ---
  let materialId: number = TERRAIN_MATERIALS.SOIL;
  if (config.sandDunes && sandDuneHeight > 0.1) {
    materialId = TERRAIN_MATERIALS.SAND_DUNE;
  } else if (config.mode === 'flat' && Math.abs(point.y - config.baseHeight) < 0.5) {
    // Near the surface in flat mode, use SOIL (already default)
    materialId = TERRAIN_MATERIALS.SOIL;
  }

  // --- Compute cave-aware outputs ---
  let caveTag = false;
  let boundarySDF = Infinity;

  if (config.caveAware && caveEvaluators && caveEvaluators.length > 0) {
    for (const caveEval of caveEvaluators) {
      const caveResult = caveEval(point);
      const caveDist = caveResult.distance;

      // Point is inside a cave if the cave SDF is negative
      if (caveDist < 0) {
        caveTag = true;
      }

      // Boundary SDF is the minimum distance to any cave boundary
      // (the absolute distance to the nearest cave surface)
      boundarySDF = Math.min(boundarySDF, Math.abs(caveDist));
    }
  }

  // If no caves are registered, boundarySDF stays at Infinity (no boundary)
  // and caveTag stays false.

  return {
    distance,
    materialId,
    caveTag,
    boundarySDF: config.caveAware ? boundarySDF : Infinity,
    sandDuneHeight,
  };
}

/**
 * Create a ground SDF evaluator that produces `GroundAuxiliaryOutput`.
 * The returned evaluator is compatible with the `SDFEvaluator` type signature
 * (returns `{ distance, materialId }`) while also supporting the extended
 * auxiliary output via the `evaluateFull` method.
 *
 * @param config - Ground configuration
 * @param noiseFn - Noise function for dune displacement
 * @param caveEvaluators - Optional cave SDF evaluators for cave-aware output
 * @returns An object with an `evaluate` method (SDFEvaluator-compatible) and
 *          an `evaluateFull` method returning the full auxiliary output
 */
export function createGroundSDF(
  config: Partial<GroundConfig> = {},
  noiseFn: (x: number, y: number, z: number, octaves: number) => number,
  caveEvaluators: SDFEvaluator[] = [],
): {
  evaluate: SDFEvaluator;
  evaluateFull: (point: THREE.Vector3) => GroundAuxiliaryOutput;
} {
  const fullConfig: GroundConfig = { ...DEFAULT_GROUND_CONFIG, ...config };

  return {
    /** SDFEvaluator-compatible evaluate function */
    evaluate: (point: THREE.Vector3): SDFPrimitiveResult => {
      const result = sdGround(point, fullConfig, noiseFn, caveEvaluators);
      return {
        distance: result.distance,
        materialId: result.materialId,
      };
    },

    /** Full auxiliary output evaluation */
    evaluateFull: (point: THREE.Vector3): GroundAuxiliaryOutput => {
      return sdGround(point, fullConfig, noiseFn, caveEvaluators);
    },
  };
}

// ---------------------------------------------------------------------------
// Terrain-Specific SDF Primitives
// ---------------------------------------------------------------------------

/**
 * SDF of a mountain ridge — a stretched, noise-displaced cone shape.
 * The ridge extends along the X axis with a peak at the center.
 */
export function sdMountainRidge(
  point: THREE.Vector3,
  params: {
    height: number;
    width: number;
    depth: number;
    ridgeSharpness: number;
  },
  rng: SeededRandom,
): number {
  // Scale point to normalized coordinates
  const p = new THREE.Vector3(
    point.x / params.width,
    point.y / params.height,
    point.z / params.depth,
  );

  // Base cone shape
  const coneDist = sdCone(p, 1.0, 1.0);

  // Add ridge displacement along X
  const ridgeNoise = rng.next() * 0.2; // Deterministic slight variation
  const ridge = Math.abs(p.x) * params.ridgeSharpness + ridgeNoise;

  return coneDist + ridge * params.height * 0.1;
}

/**
 * SDF of a Voronoi rock formation — multiple scattered spheres
 * with noise-based displacement creating a rocky cluster.
 */
export function sdVoronoiRock(
  point: THREE.Vector3,
  params: {
    center: THREE.Vector3;
    baseRadius: number;
    cellCount: number;
    irregularity: number;
  },
  rng: SeededRandom,
): number {
  let minDist = Infinity;

  const localPoint = point.clone().sub(params.center);

  for (let i = 0; i < params.cellCount; i++) {
    // Generate cell center positions deterministically
    const cx = (rng.next() - 0.5) * params.baseRadius * 2;
    const cy = (rng.next() - 0.5) * params.baseRadius;
    const cz = (rng.next() - 0.5) * params.baseRadius * 2;
    const cellCenter = new THREE.Vector3(cx, cy, cz);

    // Cell radius varies
    const cellRadius = params.baseRadius * (0.3 + rng.next() * 0.7);

    const dist = localPoint.clone().sub(cellCenter).length() - cellRadius;
    minDist = Math.min(minDist, dist);
  }

  return minDist;
}

/**
 * SDF of a warped rock — a sphere with domain warping for organic deformation.
 * Uses fractal noise displacement to create eroded, natural-looking rock shapes.
 */
export function sdWarpedRock(
  point: THREE.Vector3,
  params: {
    center: THREE.Vector3;
    radius: number;
    warpStrength: number;
    warpFrequency: number;
    warpOctaves: number;
  },
  noiseFn: (x: number, y: number, z: number, octaves: number) => number,
): number {
  const localPoint = point.clone().sub(params.center);

  // Domain warping: displace the input point with noise
  const warpX = noiseFn(
    localPoint.x * params.warpFrequency,
    localPoint.y * params.warpFrequency,
    localPoint.z * params.warpFrequency,
    params.warpOctaves,
  ) * params.warpStrength;

  const warpY = noiseFn(
    localPoint.x * params.warpFrequency + 100,
    localPoint.y * params.warpFrequency + 100,
    localPoint.z * params.warpFrequency + 100,
    params.warpOctaves,
  ) * params.warpStrength;

  const warpZ = noiseFn(
    localPoint.x * params.warpFrequency + 200,
    localPoint.y * params.warpFrequency + 200,
    localPoint.z * params.warpFrequency + 200,
    params.warpOctaves,
  ) * params.warpStrength;

  const warpedPoint = localPoint.clone().add(new THREE.Vector3(warpX, warpY, warpZ));

  return warpedPoint.length() - params.radius;
}

// ---------------------------------------------------------------------------
// SDF with Material ID
// ---------------------------------------------------------------------------

/**
 * Create an SDF evaluator function for a terrain element.
 * The evaluator returns both distance and material ID.
 */
export function createTerrainSDF(
  type: 'mountain' | 'cave' | 'rock' | 'ground' | 'waterbody' | 'arch',
  params: Record<string, any>,
  rng: SeededRandom,
  noiseFn: (x: number, y: number, z: number, octaves: number) => number,
): SDFEvaluator {
  switch (type) {
    case 'mountain':
      return (point: THREE.Vector3) => ({
        distance: sdMountainRidge(point, {
          height: params.height ?? 20,
          width: params.width ?? 30,
          depth: params.depth ?? 25,
          ridgeSharpness: params.ridgeSharpness ?? 2.0,
        }, rng),
        materialId: TERRAIN_MATERIALS.STONE,
      });

    case 'cave':
      return (point: THREE.Vector3) => {
        // Cave is a tunnel-like structure
        const localPoint = point.clone().sub(params.center ?? new THREE.Vector3());
        const tunnelDist = sdCylinder(
          localPoint,
          params.radius ?? 3,
          params.halfLength ?? 15,
        );
        return {
          distance: tunnelDist,
          materialId: TERRAIN_MATERIALS.STONE,
        };
      };

    case 'rock':
      return (point: THREE.Vector3) => {
        if (params.warped) {
          return {
            distance: sdWarpedRock(point, {
              center: params.center ?? new THREE.Vector3(),
              radius: params.radius ?? 2,
              warpStrength: params.warpStrength ?? 0.5,
              warpFrequency: params.warpFrequency ?? 0.3,
              warpOctaves: params.warpOctaves ?? 3,
            }, noiseFn),
            materialId: TERRAIN_MATERIALS.STONE,
          };
        }
        return {
          distance: sdVoronoiRock(point, {
            center: params.center ?? new THREE.Vector3(),
            baseRadius: params.radius ?? 2,
            cellCount: params.cellCount ?? 5,
            irregularity: params.irregularity ?? 0.3,
          }, rng),
          materialId: TERRAIN_MATERIALS.COBBLESTONE,
        };
      };

    case 'ground': {
      const groundSDF = createGroundSDF(
        {
          mode: params.mode ?? 'flat',
          sphereRadius: params.sphereRadius ?? 1000,
          sandDunes: params.sandDunes ?? false,
          sandDuneAmplitude: params.sandDuneAmplitude ?? 2.0,
          sandDuneFrequency: params.sandDuneFrequency ?? 0.02,
          sandDuneOctaves: params.sandDuneOctaves ?? 4,
          caveAware: params.caveAware ?? false,
          baseHeight: params.baseHeight ?? 0,
        },
        noiseFn,
        params.caveEvaluators ?? [],
      );
      return groundSDF.evaluate;
    }

    case 'waterbody':
      return (point: THREE.Vector3) => {
        // Water body is an ellipsoid below the water level
        const localPoint = point.clone().sub(params.center ?? new THREE.Vector3());
        const scaledPoint = new THREE.Vector3(
          localPoint.x / (params.radiusX ?? 15),
          localPoint.y / (params.depth ?? 3),
          localPoint.z / (params.radiusZ ?? 15),
        );
        return {
          distance: scaledPoint.length() - 1.0,
          materialId: TERRAIN_MATERIALS.WATER,
        };
      };

    case 'arch':
      return (point: THREE.Vector3) => {
        const localPoint = point.clone().sub(params.center ?? new THREE.Vector3());
        return {
          distance: sdTorus(localPoint, params.majorRadius ?? 5, params.minorRadius ?? 1),
          materialId: TERRAIN_MATERIALS.STONE,
        };
      };

    default:
      return (_point: THREE.Vector3) => ({
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
      });
  }
}
