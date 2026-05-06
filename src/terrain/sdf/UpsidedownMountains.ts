/**
 * Upsidedown Mountains — Floating Mountain SDF and Mesh Generation
 *
 * Port of the floating mountain (UpsidedownMountains) asset generator from
 * the original Princeton Infinigen. Floating mountains are truncated cone
 * shapes with flat or convex tops, stalactite-like tapering bottoms, and
 * optional features like connection bridges, waterfalls, and vegetation zones.
 *
 * Features:
 * - Truncated cone base shape (wide top, narrow bottom point)
 * - Layered noise displacement for rocky surface texture
 * - Optional rock bridges between close mountains
 * - Gravity-defying placement at configurable altitude
 * - Material zones: rocky surface, vegetation patches, snow caps
 * - Shadow casting computation helpers
 *
 * @module terrain/sdf
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm, seededNoise3D, seededRidgedMultifractal } from '@/core/util/MathUtils';
import { SDFPrimitiveResult, TERRAIN_MATERIALS } from './SDFPrimitives';
import { smoothUnion, sdfUnion, sdfSubtraction, smoothSubtraction } from './SDFCombinators';
import { SignedDistanceField, extractIsosurface, sdfBoolean, sdfSmoothUnion, createPrimitiveSDF } from './sdf-operations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for a single floating mountain */
export interface UpsidedownMountainConfig {
  /** Center position of the mountain (base altitude) */
  center: THREE.Vector3;
  /** Top radius (wide end) */
  topRadius: number;
  /** Height of the mountain (top to bottom point) */
  height: number;
  /** Bottom taper ratio (0 = point, 1 = same as top) */
  bottomTaperRatio: number;
  /** Overhang bulge factor near the top (0 = no overhang) */
  overhangBulge: number;
  /** Top surface flatness (0 = concave, 1 = perfectly flat) */
  topFlatness: number;
  /** Surface detail noise scale */
  detailScale: number;
  /** Surface detail noise strength */
  detailStrength: number;
  /** Number of noise displacement layers */
  displacementLayers: number;
  /** Random seed */
  seed: number;
  /** Altitude offset above the base center */
  altitude: number;
  /** Snow cap threshold (0 = no snow, lower = more snow) */
  snowCapThreshold: number;
  /** Vegetation zone height on top surface */
  vegetationZoneHeight: number;
}

/** Default configuration for a single floating mountain */
export const DEFAULT_UPSIDEDOWN_MOUNTAIN_CONFIG: UpsidedownMountainConfig = {
  center: new THREE.Vector3(0, 20, 0),
  topRadius: 8.0,
  height: 15.0,
  bottomTaperRatio: 0.05,
  overhangBulge: 0.15,
  topFlatness: 0.8,
  detailScale: 0.3,
  detailStrength: 0.5,
  displacementLayers: 4,
  seed: 42,
  altitude: 20.0,
  snowCapThreshold: 0.7,
  vegetationZoneHeight: 2.0,
};

/** Configuration for a mountain range */
export interface UpsidedownMountainRangeConfig {
  /** Center of the range */
  center: THREE.Vector3;
  /** Overall range radius */
  rangeRadius: number;
  /** Number of mountains in the range */
  mountainCount: number;
  /** Base altitude for all mountains */
  baseAltitude: number;
  /** Height variation range [min, max] */
  heightRange: [number, number];
  /** Top radius variation range [min, max] */
  radiusRange: [number, number];
  /** Minimum spacing between mountain centers */
  minSpacing: number;
  /** Whether to add connection bridges */
  enableBridges: boolean;
  /** Bridge thickness */
  bridgeThickness: number;
  /** Bridge maximum span (won't connect mountains farther apart) */
  bridgeMaxSpan: number;
  /** Random seed */
  seed: number;
  /** Surface detail parameters */
  detailScale: number;
  detailStrength: number;
}

/** Default configuration for a mountain range */
export const DEFAULT_UPSIDEDOWN_MOUNTAIN_RANGE_CONFIG: UpsidedownMountainRangeConfig = {
  center: new THREE.Vector3(0, 20, 0),
  rangeRadius: 40.0,
  mountainCount: 5,
  baseAltitude: 20.0,
  heightRange: [8, 20],
  radiusRange: [5, 12],
  minSpacing: 10.0,
  enableBridges: true,
  bridgeThickness: 1.5,
  bridgeMaxSpan: 15.0,
  seed: 42,
  detailScale: 0.3,
  detailStrength: 0.5,
};

/** Mountain instance data for a range */
interface MountainInstance {
  center: THREE.Vector3;
  topRadius: number;
  height: number;
  seed: number;
}

// ---------------------------------------------------------------------------
// Material IDs for floating mountains
// ---------------------------------------------------------------------------

/** Extended material IDs specific to floating mountains */
export const FLOATING_MOUNTAIN_MATERIALS = {
  ...TERRAIN_MATERIALS,
  ROCKY_SURFACE: 0,
  VEGETATION: 8,
  SNOW_CAP: 5,
  BRIDGE_STONE: 0,
} as const;

// ---------------------------------------------------------------------------
// sdUpsidedownMountain
// ---------------------------------------------------------------------------

/**
 * SDF for a single floating mountain (upside-down truncated cone).
 *
 * Shape description:
 * - Top: Flat or slightly convex surface with terrain-like features
 * - Body: Truncated cone that narrows toward the bottom
 * - Bottom: Stalactite-like tapering point
 * - Surface: Layered noise displacement for rocky texture
 * - Overhang: Slight outward bulge near the top edge
 *
 * The mountain is oriented with its wide top at the top and
 * its pointed bottom facing downward.
 */
export function sdUpsidedownMountain(
  point: THREE.Vector3,
  config: Partial<UpsidedownMountainConfig> = {},
): SDFPrimitiveResult {
  const cfg = { ...DEFAULT_UPSIDEDOWN_MOUNTAIN_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);

  // Transform to mountain-local coordinates
  // Mountain center is at the top surface; bottom is at center.y - height
  const mountainTop = cfg.center.y + cfg.altitude;
  const localPoint = point.clone().sub(new THREE.Vector3(cfg.center.x, mountainTop, cfg.center.z));

  // --- Truncated Cone SDF ---
  // The cone is oriented with the wide end at top (local Y=0) and
  // tapering to a point at bottom (local Y=-height)
  const t = Math.max(0, Math.min(1, -localPoint.y / cfg.height)); // 0 at top, 1 at bottom

  // Radius at this height: linear interpolation from topRadius to bottomRadius
  const bottomRadius = cfg.topRadius * cfg.bottomTaperRatio;

  // Overhang bulge: radius increases slightly near the top then decreases
  const bulgeProfile = cfg.overhangBulge * Math.sin(t * Math.PI) * cfg.topRadius;
  const radiusAtHeight = cfg.topRadius * (1 - t) + bottomRadius * t + bulgeProfile;

  // 2D distance in XZ plane
  const distXZ = new THREE.Vector2(localPoint.x, localPoint.z).length();

  // Cone SDF: distance from the cone surface
  // For a truncated cone, the SDF is approximately:
  //   d = distXZ - radiusAtHeight (in the radial direction)
  //   with clamping at top and bottom caps
  const radialDist = distXZ - radiusAtHeight;

  // Top cap: flat surface at y=0 (slightly convex based on topFlatness)
  const topConvexity = (1.0 - cfg.topFlatness) * distXZ * distXZ * 0.01;
  const topCapDist = localPoint.y + topConvexity;

  // Bottom cap: pointed tip
  const bottomCapDist = -(localPoint.y + cfg.height);

  // Combine: intersection of cone surface, top cap, and bottom cap
  // Inside the cone = negative distance
  let dist = radialDist;

  // Clamp at top and bottom
  if (localPoint.y > 0) {
    // Above the top: outside the mountain unless we're inside the cone
    dist = Math.max(radialDist, topCapDist);
  } else if (localPoint.y < -cfg.height) {
    // Below the bottom: outside
    dist = Math.max(radialDist, bottomCapDist);
  }

  // Stalactite bottom: instead of flat bottom, add a pointed tip
  if (localPoint.y < -cfg.height * 0.7 && distXZ < radiusAtHeight * 2) {
    const tipSharpness = 2.0;
    const tipDist = localPoint.y + cfg.height + distXZ * tipSharpness * 0.1;
    const stalactiteNoise = seededFbm(
      localPoint.x * 0.5 + cfg.seed * 0.1,
      localPoint.y * 0.5,
      localPoint.z * 0.5 + cfg.seed * 0.1,
      3, 2.0, 0.5, cfg.seed + 100,
    ) * 1.5;

    dist = smoothUnion(dist, tipDist + stalactiteNoise, 1.0);
  }

  // --- Surface Detail: Layered Noise Displacement ---
  let displacement = 0;
  let amp = cfg.detailStrength;
  let freq = cfg.detailScale;

  for (let layer = 0; layer < cfg.displacementLayers; layer++) {
    const layerNoise = seededFbm(
      (point.x + cfg.center.x) * freq + layer * 31.7,
      (point.y + mountainTop) * freq + layer * 47.3,
      (point.z + cfg.center.z) * freq + layer * 73.1,
      3, 2.0, 0.5, cfg.seed + layer * 53,
    );
    displacement += layerNoise * amp;
    amp *= 0.5;
    freq *= 2.0;
  }

  // Add ridged noise for sharper rocky features
  const ridgedNoise = seededRidgedMultifractal(
    point.x * cfg.detailScale * 0.5 + cfg.center.x,
    point.y * cfg.detailScale * 0.5 + mountainTop,
    point.z * cfg.detailScale * 0.5 + cfg.center.z,
    3, 2.0, 0.5, 0.4, cfg.seed + 200,
  );
  displacement += ridgedNoise * cfg.detailStrength * 0.5;

  dist += displacement;

  // --- Material Zones ---
  let materialId: number = FLOATING_MOUNTAIN_MATERIALS.ROCKY_SURFACE;

  // Snow cap: on top surface above snow threshold
  const normalizedHeight = 1.0 - t; // 1 at top, 0 at bottom
  if (normalizedHeight > cfg.snowCapThreshold && localPoint.y > -1.0) {
    materialId = FLOATING_MOUNTAIN_MATERIALS.SNOW_CAP;
  }

  // Vegetation zone: on the flat top surface within vegetation zone height
  if (localPoint.y > -cfg.vegetationZoneHeight && distXZ < cfg.topRadius * 0.8) {
    // Check if we're on a relatively flat area (top surface)
    const slope = Math.abs(radialDist - dist);
    if (slope < 1.0) {
      materialId = FLOATING_MOUNTAIN_MATERIALS.VEGETATION;
    }
  }

  return { distance: dist, materialId };
}

// ---------------------------------------------------------------------------
// sdUpsidedownMountainRange
// ---------------------------------------------------------------------------

/**
 * SDF for a range of floating mountains.
 *
 * - Multiple mountains at varying heights
 * - Size variation: large central mountains, smaller peripheral ones
 * - Spacing: far enough apart to have gaps between them
 * - Connection bridges: optional thin rock bridges between close mountains
 *
 * @param point - Query point in world space
 * @param config - Range configuration
 * @returns Combined SDF result for the entire mountain range
 */
export function sdUpsidedownMountainRange(
  point: THREE.Vector3,
  config: Partial<UpsidedownMountainRangeConfig> = {},
): SDFPrimitiveResult {
  const cfg = { ...DEFAULT_UPSIDEDOWN_MOUNTAIN_RANGE_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);

  // --- Generate Mountain Instances ---
  const mountains: MountainInstance[] = [];

  for (let i = 0; i < cfg.mountainCount; i++) {
    // Central mountains are larger, peripheral ones smaller
    const distFromCenter = Math.sqrt(
      Math.pow(rng.next() - 0.5, 2) + Math.pow(rng.next() - 0.5, 2)
    ) * cfg.rangeRadius * 2;

    const centralityFactor = 1.0 - Math.min(1.0, distFromCenter / cfg.rangeRadius);

    const mx = cfg.center.x + (rng.next() - 0.5) * cfg.rangeRadius * 2;
    const mz = cfg.center.z + (rng.next() - 0.5) * cfg.rangeRadius * 2;
    const heightScale = centralityFactor * 0.5 + 0.5; // Central = 1.0, edge = 0.5
    const mHeight = rng.nextFloat(cfg.heightRange[0], cfg.heightRange[1]) * heightScale;
    const mRadius = rng.nextFloat(cfg.radiusRange[0], cfg.radiusRange[1]) * heightScale;
    const mAltitude = cfg.baseAltitude + rng.nextFloat(-3, 5);

    // Check minimum spacing
    const candidate = new THREE.Vector3(mx, cfg.center.y, mz);
    let tooClose = false;
    for (const existing of mountains) {
      if (candidate.distanceTo(new THREE.Vector3(existing.center.x, cfg.center.y, existing.center.z)) < cfg.minSpacing) {
        tooClose = true;
        break;
      }
    }

    if (tooClose) continue;

    mountains.push({
      center: candidate,
      topRadius: mRadius,
      height: mHeight,
      seed: cfg.seed + i * 137,
    });
  }

  if (mountains.length === 0) {
    return { distance: Infinity, materialId: TERRAIN_MATERIALS.STONE };
  }

  // --- Compute Combined SDF ---
  let combinedDist = Infinity;
  let combinedMaterial: number = TERRAIN_MATERIALS.STONE;

  for (const mountain of mountains) {
    const mountainResult = sdUpsidedownMountain(point, {
      center: mountain.center,
      topRadius: mountain.topRadius,
      height: mountain.height,
      seed: mountain.seed,
      altitude: cfg.baseAltitude + (mountain.center.y - cfg.center.y) * 0.5,
      detailScale: cfg.detailScale,
      detailStrength: cfg.detailStrength,
      snowCapThreshold: 0.7,
      vegetationZoneHeight: mountain.topRadius * 0.3,
    });

    if (combinedDist === Infinity) {
      combinedDist = mountainResult.distance;
      combinedMaterial = mountainResult.materialId;
    } else {
      const prevDist = combinedDist;
      combinedDist = smoothUnion(combinedDist, mountainResult.distance, 2.0);
      combinedMaterial = prevDist < mountainResult.distance ? combinedMaterial : mountainResult.materialId;
    }
  }

  // --- Connection Bridges ---
  if (cfg.enableBridges && mountains.length > 1) {
    const bridgeRng = new SeededRandom(cfg.seed + 5000);

    for (let i = 0; i < mountains.length; i++) {
      for (let j = i + 1; j < mountains.length; j++) {
        const m1 = mountains[i];
        const m2 = mountains[j];

        // Only connect mountains that are close enough
        const horizontalDist = new THREE.Vector2(
          m1.center.x - m2.center.x,
          m1.center.z - m2.center.z,
        ).length();

        if (horizontalDist > cfg.bridgeMaxSpan) continue;

        // Bridge connects at a height between the two mountain tops
        const bridgeY = cfg.baseAltitude - Math.min(m1.height, m2.height) * 0.3;

        // Compute SDF for a capsule-like bridge
        const bridgeStart = new THREE.Vector3(m1.center.x, bridgeY, m1.center.z);
        const bridgeEnd = new THREE.Vector3(m2.center.x, bridgeY, m2.center.z);

        // Sag: bridge droops slightly in the middle
        const bridgeMid = new THREE.Vector3().lerpVectors(bridgeStart, bridgeEnd, 0.5);
        bridgeMid.y -= horizontalDist * 0.05; // Slight sag

        // Segment SDF (distance to line segment with sag)
        const bridgeDist = capsuleSegmentSDF(point, bridgeStart, bridgeMid, bridgeEnd, cfg.bridgeThickness);

        // Only add bridge with some probability (deterministic)
        if (bridgeRng.next() > 0.6) {
          const prevDist = combinedDist;
          combinedDist = smoothUnion(combinedDist, bridgeDist, 1.0);
          if (bridgeDist < prevDist) {
            combinedMaterial = FLOATING_MOUNTAIN_MATERIALS.BRIDGE_STONE;
          }
        }
      }
    }
  }

  return { distance: combinedDist, materialId: combinedMaterial };
}

// ---------------------------------------------------------------------------
// Capsule Segment SDF Helper
// ---------------------------------------------------------------------------

/**
 * Compute SDF for a capsule-shaped bridge that follows a 3-point curve
 * (start -> mid -> end) with given thickness.
 */
function capsuleSegmentSDF(
  point: THREE.Vector3,
  start: THREE.Vector3,
  mid: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
): number {
  // Find closest point on the two-segment polyline
  const d1 = closestPointOnSegment(point, start, mid);
  const d2 = closestPointOnSegment(point, mid, end);

  const dist1 = point.distanceTo(d1);
  const dist2 = point.distanceTo(d2);

  const minDist = Math.min(dist1, dist2);
  return minDist - radius;
}

/**
 * Find the closest point on a line segment to a given point.
 */
function closestPointOnSegment(
  point: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(point, a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(ab.lengthSq(), 1e-10)));
  return a.clone().add(ab.multiplyScalar(t));
}

// ---------------------------------------------------------------------------
// Shadow Casting Computation
// ---------------------------------------------------------------------------

/**
 * Compute a simple shadow factor for a point relative to floating mountains.
 *
 * Returns a value in [0, 1] where 0 = fully shadowed, 1 = fully lit.
 * Uses ray marching upward from the query point to check if a mountain
 * blocks the light coming from above.
 *
 * @param point - Query point in world space
 * @param mountains - Array of mountain instances
 * @param steps - Number of ray march steps (default 20)
 * @param stepSize - Step size for ray marching (default 2.0)
 * @returns Shadow factor (0 = shadowed, 1 = lit)
 */
export function computeShadowFactor(
  point: THREE.Vector3,
  mountains: MountainInstance[],
  steps: number = 20,
  stepSize: number = 2.0,
): number {
  const rayDir = new THREE.Vector3(0, 1, 0); // Light from above

  for (let step = 1; step <= steps; step++) {
    const samplePoint = point.clone().add(rayDir.clone().multiplyScalar(step * stepSize));

    for (const mountain of mountains) {
      const result = sdUpsidedownMountain(samplePoint, {
        center: mountain.center,
        topRadius: mountain.topRadius,
        height: mountain.height,
        seed: mountain.seed,
      });

      if (result.distance < 0) {
        // Point is inside a mountain = shadowed
        return 0.0;
      }
    }
  }

  return 1.0; // No shadow
}

// ---------------------------------------------------------------------------
// generateUpsidedownMountainMesh
// ---------------------------------------------------------------------------

/** Configuration for mesh generation */
export interface MountainMeshConfig {
  /** Mountain range configuration */
  rangeConfig: Partial<UpsidedownMountainRangeConfig>;
  /** SDF voxel resolution for marching cubes (world units per voxel) */
  resolution: number;
  /** Whether to compute vertex colors from material zones */
  computeVertexColors: boolean;
  /** Whether to add waterfall geometry from mountain edges */
  addWaterfalls: boolean;
}

/**
 * Generate a BufferGeometry for floating mountains using marching cubes.
 *
 * The function:
 * 1. Generates mountain instances from the range config
 * 2. Samples the SDF on a voxel grid
 * 3. Extracts the isosurface via marching cubes
 * 4. Optionally computes vertex colors from material zones
 *
 * @param config - Mesh generation configuration
 * @returns THREE.BufferGeometry with positions, normals, UVs, and optional vertex colors
 */
export function generateUpsidedownMountainMesh(
  config: Partial<MountainMeshConfig> = {},
): THREE.BufferGeometry {
  const rangeConfig = config.rangeConfig ?? {};
  const fullRangeConfig = { ...DEFAULT_UPSIDEDOWN_MOUNTAIN_RANGE_CONFIG, ...rangeConfig };
  const resolution = config.resolution ?? 1.0;

  const rng = new SeededRandom(fullRangeConfig.seed);
  const center = fullRangeConfig.center;
  const rangeRadius = fullRangeConfig.rangeRadius;
  const baseAlt = fullRangeConfig.baseAltitude;
  const maxHeight = fullRangeConfig.heightRange[1];

  // Compute bounds for the SDF grid
  const padding = 5;
  const bounds = new THREE.Box3(
    new THREE.Vector3(
      center.x - rangeRadius - padding,
      baseAlt - maxHeight - padding,
      center.z - rangeRadius - padding,
    ),
    new THREE.Vector3(
      center.x + rangeRadius + padding,
      baseAlt + maxHeight * 0.5 + padding,
      center.z + rangeRadius + padding,
    ),
  );

  // Create the SDF
  const sdf = new SignedDistanceField({
    resolution,
    bounds,
    maxDistance: 1e6,
  });

  // Fill SDF values by evaluating the mountain range at each voxel
  for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
    for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
      for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
        const pos = sdf.getPosition(gx, gy, gz);
        const result = sdUpsidedownMountainRange(pos, fullRangeConfig);
        sdf.setValueAtGrid(gx, gy, gz, result.distance);
      }
    }
  }

  // Extract isosurface
  const geometry = extractIsosurface(sdf, 0);

  if (geometry.attributes.position.count === 0) {
    return geometry;
  }

  // --- Compute Vertex Colors from Material Zones ---
  if (config.computeVertexColors !== false) {
    const positions = geometry.attributes.position.array as Float32Array;
    const vertexCount = positions.length / 3;
    const colors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const vx = positions[i * 3];
      const vy = positions[i * 3 + 1];
      const vz = positions[i * 3 + 2];
      const vPos = new THREE.Vector3(vx, vy, vz);

      const result = sdUpsidedownMountainRange(vPos, fullRangeConfig);

      // Map material ID to color
      let r: number, g: number, b: number;
      switch (result.materialId) {
        case FLOATING_MOUNTAIN_MATERIALS.SNOW_CAP:
          r = 0.95; g = 0.95; b = 1.0; // White-blue
          break;
        case FLOATING_MOUNTAIN_MATERIALS.VEGETATION:
          r = 0.2; g = 0.5; b = 0.15; // Green
          break;
        case FLOATING_MOUNTAIN_MATERIALS.BRIDGE_STONE:
          r = 0.55; g = 0.45; b = 0.35; // Brown stone
          break;
        case FLOATING_MOUNTAIN_MATERIALS.ROCKY_SURFACE:
        default:
          r = 0.5; g = 0.45; b = 0.4; // Gray-brown rock
          break;
      }

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }

  // --- Optional: Add Waterfall Geometry ---
  // Waterfalls are thin ribbon-like meshes hanging from mountain edges
  // This is a simplified version that adds vertical strip geometry
  if (config.addWaterfalls) {
    addWaterfallGeometry(geometry, fullRangeConfig);
  }

  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------
// Waterfall Geometry Helper
// ---------------------------------------------------------------------------

/**
 * Add waterfall ribbon geometry to the mountain mesh.
 * Waterfalls are thin vertical strips that hang from the edges of mountains
 * and taper to a point below.
 *
 * This modifies the geometry in place by adding new vertices.
 */
function addWaterfallGeometry(
  geometry: THREE.BufferGeometry,
  rangeConfig: UpsidedownMountainRangeConfig,
): void {
  const rng = new SeededRandom(rangeConfig.seed + 7777);
  const waterfallPositions: THREE.Vector3[] = [];

  // Generate mountain instances (same as sdUpsidedownMountainRange)
  for (let i = 0; i < rangeConfig.mountainCount; i++) {
    const mx = rangeConfig.center.x + (rng.next() - 0.5) * rangeConfig.rangeRadius * 2;
    const mz = rangeConfig.center.z + (rng.next() - 0.5) * rangeConfig.rangeRadius * 2;
    const heightScale = 0.5 + rng.next() * 0.5;
    const mRadius = rng.nextFloat(rangeConfig.radiusRange[0], rangeConfig.radiusRange[1]) * heightScale;

    // Waterfall starts from the edge of the mountain top
    const angle = rng.next() * Math.PI * 2;
    const waterfallX = mx + Math.cos(angle) * mRadius * 0.8;
    const waterfallZ = mz + Math.sin(angle) * mRadius * 0.8;
    const waterfallTopY = rangeConfig.baseAltitude;
    const waterfallBottomY = rangeConfig.baseAltitude - rng.nextFloat(5, 12);

    // Only add waterfall with some probability
    if (rng.next() > 0.4) {
      waterfallPositions.push(new THREE.Vector3(waterfallX, waterfallTopY, waterfallZ));
      waterfallPositions.push(new THREE.Vector3(waterfallX, waterfallBottomY, waterfallZ));
    }
  }

  // Waterfall geometry is stored as user data for later processing
  // (actual ribbon mesh generation would be done by the rendering system)
  geometry.userData = {
    ...geometry.userData,
    waterfallPositions: waterfallPositions.map(v => v.toArray()),
    waterfallType: 'ribbon',
  };
}

// ---------------------------------------------------------------------------
// Convenience: Create Evaluator Functions
// ---------------------------------------------------------------------------

/**
 * Create an SDF evaluator for a single floating mountain.
 */
export function createUpsidedownMountainSDF(
  config: Partial<UpsidedownMountainConfig> = {},
): (point: THREE.Vector3) => SDFPrimitiveResult {
  return (point: THREE.Vector3): SDFPrimitiveResult => {
    return sdUpsidedownMountain(point, config);
  };
}

/**
 * Create an SDF evaluator for a mountain range.
 */
export function createUpsidedownMountainRangeSDF(
  config: Partial<UpsidedownMountainRangeConfig> = {},
): (point: THREE.Vector3) => SDFPrimitiveResult {
  return (point: THREE.Vector3): SDFPrimitiveResult => {
    return sdUpsidedownMountainRange(point, config);
  };
}

// Re-export MountainInstance for external use
export type { MountainInstance };

// ---------------------------------------------------------------------------
// Upside-Down Mountain Inversion SDF Operation
// ---------------------------------------------------------------------------

/**
 * Configuration for the inverted mountain ridges SDF.
 * This operation takes a base terrain SDF and inverts mountain ridges
 * above a configurable height threshold, creating overhanging/inverted
 * terrain features by using SDF subtraction.
 */
export interface InvertedRidgeConfig {
  /** Height threshold above which ridges are inverted (world Y) */
  inversionThreshold: number;
  /** The base terrain SDF evaluator */
  baseTerrainSDF: (point: THREE.Vector3) => SDFPrimitiveResult;
  /** Smooth blend width at the inversion threshold (default 2.0) */
  blendWidth: number;
  /** Inversion depth — how far the inverted region extends (default 5.0) */
  inversionDepth: number;
  /** Whether to use smooth subtraction (true) or sharp (false) at the boundary */
  smoothBoundary: boolean;
  /** Material ID for the inverted region surface */
  invertedMaterialId: number;
  /** Noise displacement for the inverted surface (default 0) */
  inversionNoiseScale: number;
  /** Noise displacement strength (default 0.5) */
  inversionNoiseStrength: number;
  /** Random seed for inversion noise */
  seed: number;
}

/** Default configuration for inverted ridge SDF */
export const DEFAULT_INVERTED_RIDGE_CONFIG: Partial<InvertedRidgeConfig> = {
  inversionThreshold: 15.0,
  blendWidth: 2.0,
  inversionDepth: 5.0,
  smoothBoundary: true,
  invertedMaterialId: TERRAIN_MATERIALS.STONE,
  inversionNoiseScale: 0.3,
  inversionNoiseStrength: 0.5,
  seed: 42,
};

/**
 * SDF operation that inverts mountain ridges above a height threshold.
 *
 * This creates the "upside-down mountain" effect by:
 * 1. Evaluating the base terrain SDF
 * 2. Above the threshold height, creating an inverted copy of the terrain
 *    (the terrain shape is reflected downward)
 * 3. Subtracting a half-space SDF (above threshold) from the base terrain
 *    to carve out the inverted region
 * 4. Combining the result with the inverted terrain shape using SDF subtraction
 *
 * The result is terrain where ridges above the threshold appear to hang
 * downward, like stalactites or inverted mountains.
 *
 * @param point - Query point in world space
 * @param config - Inversion configuration
 * @returns SDF result with inverted ridges above threshold
 */
export function sdInvertedRidge(
  point: THREE.Vector3,
  config: Partial<InvertedRidgeConfig> = {},
): SDFPrimitiveResult {
  const cfg = { ...DEFAULT_INVERTED_RIDGE_CONFIG, ...config } as InvertedRidgeConfig;

  // 1. Evaluate the base terrain
  const baseResult = cfg.baseTerrainSDF(point);

  // 2. If point is below the threshold, return the base terrain unchanged
  if (point.y < cfg.inversionThreshold - cfg.blendWidth) {
    return baseResult;
  }

  // 3. Compute an inverted terrain SDF:
  //    Reflect the point across the threshold plane, evaluate the terrain,
  //    then negate. This creates an inverted copy of the terrain hanging below.
  const reflectedPoint = new THREE.Vector3(
    point.x,
    2 * cfg.inversionThreshold - point.y, // Reflect Y across threshold
    point.z,
  );

  const reflectedResult = cfg.baseTerrainSDF(reflectedPoint);

  // Add inversion noise displacement
  let inversionNoise = 0;
  if (cfg.inversionNoiseScale > 0 && cfg.inversionNoiseStrength > 0) {
    inversionNoise = seededFbm(
      point.x * cfg.inversionNoiseScale + cfg.seed * 0.1,
      point.y * cfg.inversionNoiseScale,
      point.z * cfg.inversionNoiseScale + cfg.seed * 0.1,
      3, 2.0, 0.5, cfg.seed,
    ) * cfg.inversionNoiseStrength;
  }

  // The inverted SDF: the reflected terrain, but we limit its depth
  // by clamping the distance to the inversion depth
  const invertedDist = reflectedResult.distance + inversionNoise;
  const clampedInvertedDist = Math.max(invertedDist, -cfg.inversionDepth);

  // 4. Half-space SDF: everything above the threshold plane
  //    This defines the region where inversion occurs
  const halfSpaceDist = point.y - cfg.inversionThreshold;

  // 5. Combine: subtract the half-space from the base terrain to carve
  //    out the region above the threshold, then add the inverted terrain
  //    shape in that carved-out region

  // First, compute: carved = baseTerrain - halfSpaceAbove
  // This removes the part of the terrain above the threshold
  let carvedDist: number;
  let carvedMaterial: number;

  if (cfg.smoothBoundary) {
    carvedDist = smoothSubtraction(baseResult.distance, halfSpaceDist, cfg.blendWidth);
  } else {
    carvedDist = sdfSubtraction(baseResult.distance, halfSpaceDist);
  }

  // Material: where we carved, use the base material; where the half-space
  // dominates (above threshold), we'll override with inverted material
  carvedMaterial = baseResult.distance < -halfSpaceDist
    ? cfg.invertedMaterialId
    : baseResult.materialId;

  // 6. Union the carved terrain with the inverted terrain
  //    The inverted terrain fills the carved-out region above the threshold
  const resultDist = smoothUnion(carvedDist, clampedInvertedDist, cfg.blendWidth);
  const resultMaterial = clampedInvertedDist < carvedDist
    ? cfg.invertedMaterialId
    : carvedMaterial;

  return { distance: resultDist, materialId: resultMaterial };
}

/**
 * Create an SDF evaluator that inverts mountain ridges above a threshold.
 *
 * This is the factory function version of sdInvertedRidge that returns
 * a reusable SDF evaluator function.
 *
 * @param config - Inversion configuration including the base terrain SDF
 * @returns SDF evaluator function
 */
export function createInvertedRidgeSDF(
  config: Partial<InvertedRidgeConfig> = {},
): (point: THREE.Vector3) => SDFPrimitiveResult {
  return (point: THREE.Vector3): SDFPrimitiveResult => {
    return sdInvertedRidge(point, config);
  };
}

// ---------------------------------------------------------------------------
// Floating Island SDF using SDFOperations (volumetric boolean ops)
// ---------------------------------------------------------------------------

/**
 * Configuration for the volumetric floating island SDF.
 *
 * Unlike `sdInvertedRidge` which operates point-by-point with SDFCombinators,
 * this function operates on full `SignedDistanceField` volumes using the
 * boolean operations (subtraction, union, intersection) from `sdf-operations.ts`.
 *
 * The approach:
 * 1. Rasterize the base terrain into an SDF volume
 * 2. Create a half-space plane SDF at the inversion threshold
 * 3. Subtract the half-space from the terrain: terrain - halfSpace
 *    This carves out the terrain above the threshold, leaving only
 *    the part below the threshold intact
 * 4. Create an inverted (reflected) copy of the terrain above the threshold
 * 5. Intersect the inverted terrain with the half-space to constrain it
 *    to the region above the threshold
 * 6. Union the below-threshold terrain with the inverted above-threshold terrain
 *
 * The result creates the distinctive "floating island" / "upside-down mountain"
 * terrain where peaks above the threshold hang downward like stalactites.
 */
export interface FloatingIslandSDFConfig {
  /** Base terrain SDF evaluator function */
  baseTerrainSDF: (point: THREE.Vector3) => SDFPrimitiveResult;
  /** Height threshold above which ridges are inverted (world Y) */
  inversionThreshold: number;
  /** Inversion depth — how far the inverted region extends below the threshold (default 5.0) */
  inversionDepth: number;
  /** Voxel resolution for SDF rasterization (world units per voxel, default 1.0) */
  resolution: number;
  /** Bounds of the SDF volume to compute */
  bounds: THREE.Box3;
  /** Smooth blend factor for the final union (default 2.0) */
  blendFactor: number;
  /** Noise displacement for the inverted surface (default 0) */
  inversionNoiseScale: number;
  /** Noise displacement strength (default 0.5) */
  inversionNoiseStrength: number;
  /** Material ID for the inverted region surface */
  invertedMaterialId: number;
  /** Random seed */
  seed: number;
}

/** Default configuration for floating island SDF */
export const DEFAULT_FLOATING_ISLAND_SDF_CONFIG: Partial<FloatingIslandSDFConfig> = {
  inversionThreshold: 15.0,
  inversionDepth: 5.0,
  resolution: 1.0,
  blendFactor: 2.0,
  inversionNoiseScale: 0.3,
  inversionNoiseStrength: 0.5,
  invertedMaterialId: TERRAIN_MATERIALS.STONE,
  seed: 42,
};

/**
 * Create a floating island SDF volume using volumetric boolean operations.
 *
 * This function uses the `sdfBoolean` and `sdfSmoothUnion` operations from
 * `sdf-operations.ts` (SDFOperations) to construct floating island terrain:
 *
 * 1. **Rasterize base terrain**: Evaluate the base terrain SDF at each voxel
 *    to create a volumetric SDF.
 *
 * 2. **Create half-space plane**: Generate an SDF volume where everything
 *    above `inversionThreshold` is inside (negative). This is the "cut plane".
 *
 * 3. **Subtract**: `terrainBelow = terrain - halfSpaceAbove`
 *    Using `sdfBoolean(sdfDifference)`, this removes the terrain above the
 *    threshold, keeping only the terrain below.
 *
 * 4. **Create inverted terrain**: For each voxel above the threshold, compute
 *    the terrain SDF at the reflected point (mirrored across the threshold).
 *    This creates an upside-down copy of the mountain peaks.
 *
 * 5. **Intersect**: `invertedAbove = invertedTerrain ∩ halfSpaceAbove`
 *    Using `sdfBoolean(sdfIntersection)`, constrain the inverted terrain to
 *    only exist above the threshold plane.
 *
 * 6. **Union**: `result = terrainBelow ∪ invertedAbove`
 *    Using `sdfSmoothUnion`, combine the below-threshold terrain with the
 *    inverted peaks hanging above, creating the floating island effect.
 *
 * @param config - Floating island configuration
 * @returns SignedDistanceField with the combined floating island terrain
 */
export function createFloatingIslandSDF(
  config: Partial<FloatingIslandSDFConfig> = {},
): SignedDistanceField {
  const cfg = { ...DEFAULT_FLOATING_ISLAND_SDF_CONFIG, ...config } as FloatingIslandSDFConfig;

  if (!cfg.baseTerrainSDF || !cfg.bounds) {
    throw new Error('FloatingIslandSDFConfig requires baseTerrainSDF and bounds');
  }

  // Step 1: Rasterize the base terrain into an SDF volume
  const terrainSDF = new SignedDistanceField({
    resolution: cfg.resolution,
    bounds: cfg.bounds,
    maxDistance: 1e6,
  });

  for (let gz = 0; gz < terrainSDF.gridSize[2]; gz++) {
    for (let gy = 0; gy < terrainSDF.gridSize[1]; gy++) {
      for (let gx = 0; gx < terrainSDF.gridSize[0]; gx++) {
        const pos = terrainSDF.getPosition(gx, gy, gz);
        const result = cfg.baseTerrainSDF(pos);
        terrainSDF.setValueAtGrid(gx, gy, gz, result.distance);
      }
    }
  }

  // Step 2: Create half-space plane SDF (above threshold = inside)
  // The plane SDF: -(point.y - threshold) = threshold - point.y
  // Negative above the threshold (inside), positive below (outside)
  const halfSpaceSDF = new SignedDistanceField({
    resolution: cfg.resolution,
    bounds: cfg.bounds,
    maxDistance: 1e6,
  });

  for (let gz = 0; gz < halfSpaceSDF.gridSize[2]; gz++) {
    for (let gy = 0; gy < halfSpaceSDF.gridSize[1]; gy++) {
      for (let gx = 0; gx < halfSpaceSDF.gridSize[0]; gx++) {
        const pos = halfSpaceSDF.getPosition(gx, gy, gz);
        // Half-space: inside (negative) above threshold, outside (positive) below
        const dist = cfg.inversionThreshold - pos.y;
        halfSpaceSDF.setValueAtGrid(gx, gy, gz, dist);
      }
    }
  }

  // Step 3: Subtract — terrainBelow = terrain - halfSpace
  // This removes the terrain above the threshold, keeping terrain below
  const terrainBelow = sdfBoolean(terrainSDF, halfSpaceSDF, 'difference');

  // Step 4: Create inverted terrain above the threshold
  // For each voxel above the threshold, evaluate the terrain at the reflected
  // point and add noise displacement
  const invertedSDF = new SignedDistanceField({
    resolution: cfg.resolution,
    bounds: cfg.bounds,
    maxDistance: 1e6,
  });

  for (let gz = 0; gz < invertedSDF.gridSize[2]; gz++) {
    for (let gy = 0; gy < invertedSDF.gridSize[1]; gy++) {
      for (let gx = 0; gx < invertedSDF.gridSize[0]; gx++) {
        const pos = invertedSDF.getPosition(gx, gy, gz);

        // Reflect point across the threshold plane
        const reflectedPoint = new THREE.Vector3(
          pos.x,
          2 * cfg.inversionThreshold - pos.y,
          pos.z,
        );

        // Evaluate terrain at the reflected point
        const reflectedResult = cfg.baseTerrainSDF(reflectedPoint);

        // Add inversion noise displacement
        let inversionNoise = 0;
        if (cfg.inversionNoiseScale > 0 && cfg.inversionNoiseStrength > 0) {
          inversionNoise = seededFbm(
            pos.x * cfg.inversionNoiseScale + cfg.seed * 0.1,
            pos.y * cfg.inversionNoiseScale,
            pos.z * cfg.inversionNoiseScale + cfg.seed * 0.1,
            3, 2.0, 0.5, cfg.seed,
          ) * cfg.inversionNoiseStrength;
        }

        // Clamp inverted depth so the floating islands don't extend too far
        const invertedDist = Math.max(
          reflectedResult.distance + inversionNoise,
          -cfg.inversionDepth,
        );

        invertedSDF.setValueAtGrid(gx, gy, gz, invertedDist);
      }
    }
  }

  // Step 5: Intersect inverted terrain with half-space (above threshold)
  // This constrains the inverted terrain to only appear above the threshold
  const invertedAbove = sdfBoolean(invertedSDF, halfSpaceSDF, 'intersection');

  // Step 6: Smooth union of below-threshold terrain and inverted above-threshold terrain
  const result = sdfSmoothUnion(terrainBelow, invertedAbove, cfg.blendFactor);

  return result;
}

/**
 * Generate a floating island mesh from the volumetric SDF operations.
 *
 * This is the high-level convenience function that:
 * 1. Creates the floating island SDF using `createFloatingIslandSDF`
 * 2. Extracts the isosurface via marching cubes
 * 3. Optionally adds vertex colors from material zones
 *
 * @param config - Floating island SDF configuration
 * @returns THREE.BufferGeometry with the floating island terrain mesh
 */
export function generateFloatingIslandMesh(
  config: Partial<FloatingIslandSDFConfig> = {},
): THREE.BufferGeometry {
  const sdf = createFloatingIslandSDF(config);
  const geometry = extractIsosurface(sdf, 0);

  if (geometry.attributes.position.count === 0) {
    return geometry;
  }

  // Compute vertex colors based on height relative to the inversion threshold
  const cfg = { ...DEFAULT_FLOATING_ISLAND_SDF_CONFIG, ...config } as FloatingIslandSDFConfig;
  const positions = geometry.attributes.position.array as Float32Array;
  const vertexCount = positions.length / 3;
  const colors = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    const vx = positions[i * 3];
    const vy = positions[i * 3 + 1];
    const vz = positions[i * 3 + 2];

    // Above the threshold = inverted region (floating island surface)
    // Below the threshold = normal terrain
    if (vy > cfg.inversionThreshold) {
      // Inverted region — darker, rocky surface
      colors[i * 3] = 0.40;     // r
      colors[i * 3 + 1] = 0.35; // g
      colors[i * 3 + 2] = 0.30; // b
    } else {
      // Normal terrain below threshold
      colors[i * 3] = 0.50;     // r
      colors[i * 3 + 1] = 0.45; // g
      colors[i * 3 + 2] = 0.40; // b
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
