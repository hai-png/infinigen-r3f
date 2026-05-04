/**
 * Voronoi Rock Elements — Enhanced Voronoi-based Rock SDF Primitives
 *
 * Replaces stub VoronoiRock SDF elements with real implementations featuring:
 * - Gap noise: cellular voronoi-based gaps between rock facets
 * - Warp noise: domain warping for organic distortion
 * - Mask noise: coverage mask controlling where rocks appear
 * - Beach tags: worn-smooth rocks on beach zones
 * - Cave-aware features: rocks near cave entrances are larger and more angular
 * - Multiple rock size scales: boulders, rocks, pebbles
 *
 * @module terrain/sdf
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm, seededNoise3D, seededVoronoi2D, seededRidgedMultifractal } from '@/core/util/MathUtils';
import { SDFPrimitiveResult, TERRAIN_MATERIALS, sdSphere, sdBox } from './SDFPrimitives';
import { smoothUnion, sdfUnion, domainWarp } from './SDFCombinators';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for advanced Voronoi rock generation */
export interface VoronoiRockAdvancedConfig {
  /** Center position of the rock formation */
  center: THREE.Vector3;
  /** Base radius of the rock */
  baseRadius: number;
  /** Number of voronoi cells / facets */
  cellCount: number;
  /** Irregularity factor (0 = smooth, 1 = very jagged) */
  irregularity: number;
  /** Gap noise frequency — controls gap width between facets */
  gapFrequency: number;
  /** Gap noise amplitude — controls gap depth */
  gapAmplitude: number;
  /** Warp noise strength — domain warping amount */
  warpStrength: number;
  /** Warp noise frequency */
  warpFrequency: number;
  /** Mask noise threshold — coverage mask cutoff (0-1) */
  maskThreshold: number;
  /** Mask noise frequency */
  maskFrequency: number;
  /** Whether this rock is on a beach zone */
  isBeach: boolean;
  /** Beach smoothness factor (0 = angular, 1 = smooth) */
  beachSmoothness: number;
  /** Water level for beach erosion computation */
  waterLevel: number;
  /** Whether cave-aware features are enabled */
  caveAware: boolean;
  /** Distance to nearest cave entrance (0 = at entrance) */
  caveProximity: number;
  /** Rock scale: 'boulder', 'rock', or 'pebble' */
  scale: 'boulder' | 'rock' | 'pebble';
}

/** Default configuration for advanced Voronoi rock */
export const DEFAULT_VORONOI_ROCK_ADVANCED_CONFIG: VoronoiRockAdvancedConfig = {
  center: new THREE.Vector3(0, 0, 0),
  baseRadius: 2.0,
  cellCount: 7,
  irregularity: 0.4,
  gapFrequency: 0.8,
  gapAmplitude: 0.15,
  warpStrength: 0.3,
  warpFrequency: 0.5,
  maskThreshold: 0.3,
  maskFrequency: 0.15,
  isBeach: false,
  beachSmoothness: 0.7,
  waterLevel: 0.5,
  caveAware: false,
  caveProximity: Infinity,
  scale: 'rock',
};

/** Configuration for Voronoi rock cluster */
export interface VoronoiRockClusterConfig {
  /** Center of the cluster */
  center: THREE.Vector3;
  /** Overall cluster radius */
  clusterRadius: number;
  /** Minimum distance between rocks (Poisson disk parameter) */
  minRockSpacing: number;
  /** Number of rock placement attempts (Poisson disk) */
  placementAttempts: number;
  /** Base rock size */
  baseRockSize: number;
  /** Size variation factor (0 = uniform, 1 = highly varied) */
  sizeVariation: number;
  /** Random seed */
  seed: number;
  /** Whether cluster is on beach */
  isBeach: boolean;
}

/** Default configuration for Voronoi rock cluster */
export const DEFAULT_VORONOI_ROCK_CLUSTER_CONFIG: VoronoiRockClusterConfig = {
  center: new THREE.Vector3(0, 0, 0),
  clusterRadius: 8.0,
  minRockSpacing: 1.5,
  placementAttempts: 30,
  baseRockSize: 1.5,
  sizeVariation: 0.6,
  seed: 42,
  isBeach: false,
};

/** Configuration for worn beach rock */
export interface WornBeachRockConfig {
  /** Center position */
  center: THREE.Vector3;
  /** Rock radius */
  radius: number;
  /** Smoothness factor (0 = sharp, 1 = very smooth) */
  smoothness: number;
  /** Water level for erosion computation */
  waterLevel: number;
  /** Erosion band height above water level */
  erosionBandHeight: number;
  /** Sand accumulation depth at base */
  sandAccumulationDepth: number;
  /** Sand accumulation spread (how wide the sand tapers) */
  sandSpread: number;
}

/** Default configuration for worn beach rock */
export const DEFAULT_WORN_BEACH_ROCK_CONFIG: WornBeachRockConfig = {
  center: new THREE.Vector3(0, 0, 0),
  radius: 1.5,
  smoothness: 0.7,
  waterLevel: 0.5,
  erosionBandHeight: 0.3,
  sandAccumulationDepth: 0.2,
  sandSpread: 0.5,
};

// ---------------------------------------------------------------------------
// Scale Multipliers
// ---------------------------------------------------------------------------

/** Size and detail multipliers per rock scale */
const SCALE_PARAMS = {
  boulder: { radiusMult: 2.5, cellMult: 1.4, gapMult: 0.7, warpMult: 0.6, detailOctaves: 5 },
  rock:    { radiusMult: 1.0, cellMult: 1.0, gapMult: 1.0, warpMult: 1.0, detailOctaves: 4 },
  pebble:  { radiusMult: 0.35, cellMult: 0.7, gapMult: 1.3, warpMult: 1.2, detailOctaves: 3 },
} as const;

// ---------------------------------------------------------------------------
// sdVoronoiRockAdvanced
// ---------------------------------------------------------------------------

/**
 * Enhanced Voronoi rock SDF with gap/warp/mask noise patterns.
 *
 * Improvements over basic sdVoronoiRock:
 * - **Gap noise**: Cellular voronoi-based gaps between rock facets create
 *   realistic crack-like separation between crystal faces
 * - **Warp noise**: Domain warping produces organic distortion so rocks
 *   aren't perfectly spherical
 * - **Mask noise**: Coverage mask controls where rocks appear, preventing
 *   them from occupying every possible location
 * - **Beach tags**: On beach zones, rocks have worn-smooth appearance with
 *   reduced facet sharpness
 * - **Cave-aware**: Rocks near cave entrances are larger and more angular
 *   (weathering is less in sheltered areas)
 * - **Multiple scales**: Boulder, rock, and pebble sizes with appropriate
 *   detail levels
 */
export function sdVoronoiRockAdvanced(
  point: THREE.Vector3,
  config: Partial<VoronoiRockAdvancedConfig> = {},
  rng: SeededRandom,
): SDFPrimitiveResult {
  const cfg = { ...DEFAULT_VORONOI_ROCK_ADVANCED_CONFIG, ...config };
  const scaleParams = SCALE_PARAMS[cfg.scale];

  // Apply scale multipliers
  const effectiveRadius = cfg.baseRadius * scaleParams.radiusMult;
  const effectiveCells = Math.max(3, Math.round(cfg.cellCount * scaleParams.cellMult));
  const effectiveGapAmp = cfg.gapAmplitude * scaleParams.gapMult;
  const effectiveWarpStr = cfg.warpStrength * scaleParams.warpMult;

  // Transform to local coordinates
  let localPoint = point.clone().sub(cfg.center);

  // --- Domain Warping ---
  // Displace the query point with FBM noise for organic distortion
  const warpSeed = rng.seed + 1000;
  const warpX = seededFbm(
    localPoint.x * cfg.warpFrequency,
    localPoint.y * cfg.warpFrequency,
    localPoint.z * cfg.warpFrequency,
    3, 2.0, 0.5, warpSeed,
  ) * effectiveWarpStr;

  const warpY = seededFbm(
    localPoint.x * cfg.warpFrequency + 50,
    localPoint.y * cfg.warpFrequency + 50,
    localPoint.z * cfg.warpFrequency + 50,
    3, 2.0, 0.5, warpSeed + 100,
  ) * effectiveWarpStr;

  const warpZ = seededFbm(
    localPoint.x * cfg.warpFrequency + 100,
    localPoint.y * cfg.warpFrequency + 100,
    localPoint.z * cfg.warpFrequency + 100,
    3, 2.0, 0.5, warpSeed + 200,
  ) * effectiveWarpStr;

  localPoint.add(new THREE.Vector3(warpX, warpY, warpZ));

  // --- Base Voronoi Rock Shape ---
  // Generate cell centers deterministically
  let minDist = Infinity;
  let secondMinDist = Infinity;

  const cellCenters: THREE.Vector3[] = [];
  const cellRadii: number[] = [];

  for (let i = 0; i < effectiveCells; i++) {
    const cx = (rng.next() - 0.5) * effectiveRadius * 2;
    const cy = (rng.next() - 0.5) * effectiveRadius;
    const cz = (rng.next() - 0.5) * effectiveRadius * 2;
    const cellCenter = new THREE.Vector3(cx, cy, cz);
    cellCenters.push(cellCenter);

    // Cell radius varies — irregularity controls the spread
    const cellRadius = effectiveRadius * (0.3 + rng.next() * 0.7 * cfg.irregularity);
    cellRadii.push(cellRadius);

    const dist = localPoint.distanceTo(cellCenter) - cellRadius;

    if (dist < minDist) {
      secondMinDist = minDist;
      minDist = dist;
    } else if (dist < secondMinDist) {
      secondMinDist = dist;
    }
  }

  // --- Gap Noise ---
  // Use voronoi cell boundaries to create gaps between facets
  const gapSeed = rng.seed + 3000;
  const voronoiEdge = secondMinDist - minDist; // 0 at edges, positive inside cells
  const gapNoise = seededVoronoi2D(
    localPoint.x * cfg.gapFrequency,
    localPoint.z * cfg.gapFrequency,
    1.0, gapSeed,
  );

  // Gap effect: push surface inward at cell boundaries
  const gapEffect = Math.max(0, 1.0 - voronoiEdge * 3.0) * effectiveGapAmp * (1.0 + gapNoise * 0.5);
  minDist += gapEffect;

  // --- Mask Noise ---
  // Coverage mask controls where rocks can appear
  const maskSeed = rng.seed + 5000;
  const maskValue = seededFbm(
    localPoint.x * cfg.maskFrequency + cfg.center.x * 0.1,
    localPoint.y * cfg.maskFrequency + cfg.center.y * 0.1,
    localPoint.z * cfg.maskFrequency + cfg.center.z * 0.1,
    3, 2.0, 0.5, maskSeed,
  );

  // If mask is below threshold, push the surface outward (no rock here)
  if (maskValue < cfg.maskThreshold) {
    const maskPush = (cfg.maskThreshold - maskValue) * effectiveRadius * 2.0;
    minDist += maskPush;
  }

  // --- Surface Detail ---
  // Add fine-grained noise displacement for rocky texture
  const detailSeed = rng.seed + 7000;
  const detailNoise = seededRidgedMultifractal(
    localPoint.x * 2.0,
    localPoint.y * 2.0,
    localPoint.z * 2.0,
    scaleParams.detailOctaves, 2.0, 0.5, 0.5, detailSeed,
  );
  minDist += detailNoise * 0.1 * cfg.irregularity;

  // --- Beach Modification ---
  if (cfg.isBeach) {
    // Smooth the rock by blending toward a sphere
    const sphereDist = localPoint.length() - effectiveRadius * 0.85;
    // Beach smoothness controls the blend between angular voronoi and smooth sphere
    minDist = smoothUnion(minDist, sphereDist, effectiveRadius * cfg.beachSmoothness);

    // Water-level erosion marks: slightly concave bands near water level
    const erosionY = cfg.waterLevel - cfg.center.y;
    const distFromErosion = Math.abs(localPoint.y - erosionY);
    const erosionBand = Math.max(0, 1.0 - distFromErosion / 0.3);
    minDist += erosionBand * 0.05; // Subtle concavity at water line
  }

  // --- Cave-Aware Features ---
  if (cfg.caveAware && cfg.caveProximity < 10) {
    // Rocks near cave entrances are larger and more angular
    const caveFactor = 1.0 - Math.min(1.0, cfg.caveProximity / 10.0);

    // Increase size (push surface outward = make rock bigger)
    minDist -= caveFactor * effectiveRadius * 0.3;

    // Increase angularity by adding ridged noise
    const caveNoiseSeed = rng.seed + 9000;
    const caveAngularNoise = seededRidgedMultifractal(
      localPoint.x * 1.5,
      localPoint.y * 1.5,
      localPoint.z * 1.5,
      3, 2.0, 0.6, 0.8, caveNoiseSeed,
    );
    minDist += caveAngularNoise * 0.15 * caveFactor;
  }

  // --- Material Assignment ---
  let materialId: number = TERRAIN_MATERIALS.STONE;

  if (cfg.isBeach) {
    materialId = TERRAIN_MATERIALS.COBBLESTONE;
  } else if (cfg.caveAware && cfg.caveProximity < 5) {
    materialId = TERRAIN_MATERIALS.STONE;
  } else if (cfg.scale === 'boulder') {
    materialId = TERRAIN_MATERIALS.STONE;
  } else if (cfg.scale === 'pebble') {
    materialId = TERRAIN_MATERIALS.COBBLESTONE;
  }

  return { distance: minDist, materialId };
}

// ---------------------------------------------------------------------------
// Poisson Disk Sampling Utility
// ---------------------------------------------------------------------------

/**
 * Simple Poisson disk sampling in 2D for rock placement.
 * Generates points with minimum spacing constraint within a circular area.
 */
function poissonDiskSample2D(
  center: THREE.Vector2,
  radius: number,
  minSpacing: number,
  maxAttempts: number,
  rng: SeededRandom,
): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  const activeList: THREE.Vector2[] = [];

  // Start with a random point
  const startAngle = rng.next() * Math.PI * 2;
  const startR = rng.next() * radius;
  const start = new THREE.Vector2(
    center.x + Math.cos(startAngle) * startR,
    center.y + Math.sin(startAngle) * startR,
  );
  points.push(start);
  activeList.push(start);

  const cellSize = minSpacing / Math.SQRT2;
  const gridWidth = Math.ceil(radius * 2 / cellSize);
  const grid: (number | null)[][] = Array.from({ length: gridWidth }, () =>
    Array.from({ length: gridWidth }, () => null),
  );

  // Place initial point in grid
  const gxi = Math.floor((start.x - center.x + radius) / cellSize);
  const gyi = Math.floor((start.y - center.y + radius) / cellSize);
  if (gxi >= 0 && gxi < gridWidth && gyi >= 0 && gyi < gridWidth) {
    grid[gxi][gyi] = 0;
  }

  while (activeList.length > 0) {
    const activeIdx = Math.floor(rng.next() * activeList.length);
    const current = activeList[activeIdx];
    let found = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = minSpacing + rng.next() * minSpacing;
      const candidate = new THREE.Vector2(
        current.x + Math.cos(angle) * dist,
        current.y + Math.sin(angle) * dist,
      );

      // Check if candidate is within the circular boundary
      const distFromCenter = candidate.distanceTo(center);
      if (distFromCenter > radius) continue;

      // Check grid for neighbors
      const cgxi = Math.floor((candidate.x - center.x + radius) / cellSize);
      const cgyi = Math.floor((candidate.y - center.y + radius) / cellSize);

      let tooClose = false;
      const searchRadius = 2;
      for (let dx = -searchRadius; dx <= searchRadius && !tooClose; dx++) {
        for (let dy = -searchRadius; dy <= searchRadius && !tooClose; dy++) {
          const nx = cgxi + dx;
          const ny = cgyi + dy;
          if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridWidth) continue;
          const neighborIdx = grid[nx][ny];
          if (neighborIdx !== null && neighborIdx !== undefined) {
            const neighbor = points[neighborIdx];
            if (neighbor.distanceTo(candidate) < minSpacing) {
              tooClose = true;
            }
          }
        }
      }

      if (!tooClose) {
        const pointIdx = points.length;
        points.push(candidate);
        activeList.push(candidate);
        if (cgxi >= 0 && cgxi < gridWidth && cgyi >= 0 && cgyi < gridWidth) {
          grid[cgxi][cgyi] = pointIdx;
        }
        found = true;
        break;
      }
    }

    if (!found) {
      activeList.splice(activeIdx, 1);
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// sdVoronoiRockCluster
// ---------------------------------------------------------------------------

/**
 * Generate a cluster of related Voronoi rocks using Poisson disk sampling.
 *
 * - Uses Poisson disk sampling for natural rock placement
 * - Size variation: larger rocks at base, smaller at top
 * - Inter-rock gap computation via smooth union
 * - Each rock gets its own seeded RNG for deterministic but varied shapes
 *
 * @param point - Query point in world space
 * @param config - Cluster configuration
 * @returns Combined SDF result for the entire cluster
 */
export function sdVoronoiRockCluster(
  point: THREE.Vector3,
  config: Partial<VoronoiRockClusterConfig> = {},
): SDFPrimitiveResult {
  const cfg = { ...DEFAULT_VORONOI_ROCK_CLUSTER_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);

  // Generate rock positions using Poisson disk sampling
  const center2D = new THREE.Vector2(cfg.center.x, cfg.center.z);
  const rockPositions2D = poissonDiskSample2D(
    center2D,
    cfg.clusterRadius,
    cfg.minRockSpacing,
    cfg.placementAttempts,
    rng,
  );

  if (rockPositions2D.length === 0) {
    return { distance: Infinity, materialId: TERRAIN_MATERIALS.STONE };
  }

  // Convert 2D positions to 3D with Y variation
  const rockPositions: THREE.Vector3[] = [];
  const rockSizes: number[] = [];

  for (const pos2d of rockPositions2D) {
    // Y position: some rocks sit on ground, some are slightly embedded
    const y = cfg.center.y + rng.nextFloat(-0.3, 0.1) * cfg.baseRockSize;
    rockPositions.push(new THREE.Vector3(pos2d.x, y, pos2d.y));

    // Size variation: larger at base (lower Y), smaller at top
    const heightFactor = 1.0 - Math.max(0, (y - cfg.center.y)) / (cfg.clusterRadius * 0.5);
    const sizeVariance = 1.0 - cfg.sizeVariation + rng.next() * cfg.sizeVariation * 2;
    const rockSize = cfg.baseRockSize * heightFactor * sizeVariance;
    rockSizes.push(Math.max(0.2, rockSize));
  }

  // Compute combined SDF via smooth union of individual rocks
  let combinedDist = Infinity;
  let combinedMaterial: number = TERRAIN_MATERIALS.STONE;

  for (let i = 0; i < rockPositions.length; i++) {
    const rockRng = new SeededRandom(cfg.seed + i * 137);
    const rockCenter = rockPositions[i];
    const rockSize = rockSizes[i];

    // Distance to this individual rock
    const localPoint = point.clone().sub(rockCenter);
    const sphereDist = localPoint.length() - rockSize;

    // Add small noise displacement per rock for variation
    const noiseDisp = seededFbm(
      localPoint.x * 0.8 + i * 10,
      localPoint.y * 0.8 + i * 10,
      localPoint.z * 0.8 + i * 10,
      3, 2.0, 0.5, cfg.seed + i * 53,
    ) * rockSize * 0.2;

    const rockDist = sphereDist + noiseDisp;

    // Determine material for this rock
    const rockType = rockRng.nextInt(0, 3);
    const rockMaterial: number = rockType === 0 ? TERRAIN_MATERIALS.STONE
      : rockType === 1 ? TERRAIN_MATERIALS.COBBLESTONE
      : rockType === 2 ? TERRAIN_MATERIALS.STONE
      : TERRAIN_MATERIALS.COBBLESTONE;

    // Smooth union with previous rocks
    if (combinedDist === Infinity) {
      combinedDist = rockDist;
      combinedMaterial = rockMaterial;
    } else {
      const blendK = cfg.minRockSpacing * 0.3;
      const prevDist = combinedDist;
      combinedDist = smoothUnion(combinedDist, rockDist, blendK);
      // Pick material from the closer surface
      combinedMaterial = prevDist < rockDist ? combinedMaterial : rockMaterial;
    }
  }

  // Add inter-rock gap detail: slight ridges between rocks
  const gapSeed = cfg.seed + 9999;
  const gapDetail = seededRidgedMultifractal(
    (point.x - cfg.center.x) * 0.5,
    (point.y - cfg.center.y) * 0.5,
    (point.z - cfg.center.z) * 0.5,
    3, 2.0, 0.5, 0.3, gapSeed,
  ) * 0.05;
  combinedDist += gapDetail;

  if (cfg.isBeach) {
    combinedMaterial = TERRAIN_MATERIALS.COBBLESTONE;
  }

  return { distance: combinedDist, materialId: combinedMaterial as number };
}

// ---------------------------------------------------------------------------
// sdWornBeachRock
// ---------------------------------------------------------------------------

/**
 * Beach-specific smooth worn rock SDF.
 *
 * Features:
 * - Smoothed SDF with reduced sharpness (beach rocks are water-worn)
 * - Water-level erosion marks: subtle concave bands at the water line
 * - Sand accumulation at base: rocks partially buried in sand
 *
 * The smoothness is achieved by blending the basic rock SDF with a smooth
 * sphere using smooth union, then applying erosion and sand modifications.
 */
export function sdWornBeachRock(
  point: THREE.Vector3,
  config: Partial<WornBeachRockConfig> = {},
  rng: SeededRandom,
): SDFPrimitiveResult {
  const cfg = { ...DEFAULT_WORN_BEACH_ROCK_CONFIG, ...config };
  const localPoint = point.clone().sub(cfg.center);

  // --- Base Rock Shape (Voronoi, but will be smoothed) ---
  // Generate a few cells for the base shape
  let minDist = Infinity;
  const cellCount = 5;

  for (let i = 0; i < cellCount; i++) {
    const cx = (rng.next() - 0.5) * cfg.radius * 1.5;
    const cy = (rng.next() - 0.5) * cfg.radius * 0.8;
    const cz = (rng.next() - 0.5) * cfg.radius * 1.5;
    const cellCenter = new THREE.Vector3(cx, cy, cz);
    const cellRadius = cfg.radius * (0.4 + rng.next() * 0.6);
    const dist = localPoint.distanceTo(cellCenter) - cellRadius;
    minDist = Math.min(minDist, dist);
  }

  // --- Smoothing: Blend toward a smooth ellipsoid ---
  // Beach rocks are rounded by water erosion
  const smoothEllipsoidDist = new THREE.Vector3(
    localPoint.x / (cfg.radius * 1.1),
    localPoint.y / (cfg.radius * 0.8),
    localPoint.z / (cfg.radius * 1.1),
  ).length() - 1.0;

  // Blend between angular voronoi and smooth ellipsoid
  const blendK = cfg.radius * cfg.smoothness * 0.5;
  const smoothedDist = smoothUnion(minDist, smoothEllipsoidDist * cfg.radius * 0.8, blendK);

  // --- Subtle Surface Noise (very low frequency for worn look) ---
  const surfaceNoise = seededFbm(
    localPoint.x * 0.3 + cfg.center.x,
    localPoint.y * 0.3 + cfg.center.y,
    localPoint.z * 0.3 + cfg.center.z,
    2, 2.0, 0.4, rng.seed + 500,
  ) * cfg.radius * 0.05;
  const finalDist = smoothedDist + surfaceNoise;

  // --- Water-Level Erosion Marks ---
  // Create subtle concave bands at and near the water level
  const erosionY = cfg.waterLevel - cfg.center.y;
  const distToErosion = Math.abs(localPoint.y - erosionY);

  // Multiple erosion bands at slightly different heights
  let erosionEffect = 0;
  for (let band = 0; band < 3; band++) {
    const bandY = erosionY + (band - 1) * cfg.erosionBandHeight * 0.5;
    const bandDist = Math.abs(localPoint.y - bandY);
    const bandIntensity = Math.max(0, 1.0 - bandDist / (cfg.erosionBandHeight * 0.3));
    erosionEffect += bandIntensity * 0.03 * cfg.radius;
  }

  const erodedDist = finalDist + erosionEffect;

  // --- Sand Accumulation at Base ---
  // Rocks on beaches are partially buried: add sand material below the rock
  const baseY = -cfg.radius * 0.4; // Bottom of the rock (roughly)
  const sandTop = baseY + cfg.sandAccumulationDepth;
  const distToSand = sandTop - localPoint.y;

  // Sand only appears near the rock (within radius spread)
  const horizontalDist = new THREE.Vector2(localPoint.x, localPoint.z).length();
  const sandMask = Math.max(0, 1.0 - horizontalDist / (cfg.radius * (1.0 + cfg.sandSpread)));

  // If we're in the sand zone, modify the distance
  let finalResult = erodedDist;
  let materialId: number = TERRAIN_MATERIALS.COBBLESTONE;

  if (localPoint.y < sandTop && horizontalDist < cfg.radius * (1.0 + cfg.sandSpread)) {
    // Blend toward sand surface
    const sandDist = distToSand * sandMask;
    finalResult = smoothUnion(erodedDist, sandDist, cfg.sandAccumulationDepth * 0.5);
    if (sandDist < erodedDist) {
      materialId = TERRAIN_MATERIALS.SAND;
    }
  }

  // Near the water line, rock is slightly smoother
  if (Math.abs(localPoint.y - erosionY) < cfg.erosionBandHeight) {
    materialId = TERRAIN_MATERIALS.COBBLESTONE;
  }

  return { distance: finalResult, materialId };
}

// ---------------------------------------------------------------------------
// Convenience: Create Evaluator Functions
// ---------------------------------------------------------------------------

/**
 * Create an SDF evaluator for an advanced Voronoi rock.
 * Returns a function compatible with the SDFEvaluator type.
 */
export function createVoronoiRockAdvancedSDF(
  config: Partial<VoronoiRockAdvancedConfig>,
  seed: number = 42,
): (point: THREE.Vector3) => SDFPrimitiveResult {
  const rng = new SeededRandom(seed);
  // Consume a few random values to offset the state (makes each evaluator unique)
  for (let i = 0; i < 5; i++) rng.next();

  return (point: THREE.Vector3): SDFPrimitiveResult => {
    // Create a fresh RNG for each evaluation to ensure determinism
    const evalRng = new SeededRandom(seed);
    return sdVoronoiRockAdvanced(point, config, evalRng);
  };
}

/**
 * Create an SDF evaluator for a Voronoi rock cluster.
 * Returns a function compatible with the SDFEvaluator type.
 */
export function createVoronoiRockClusterSDF(
  config: Partial<VoronoiRockClusterConfig>,
): (point: THREE.Vector3) => SDFPrimitiveResult {
  return (point: THREE.Vector3): SDFPrimitiveResult => {
    return sdVoronoiRockCluster(point, config);
  };
}

/**
 * Create an SDF evaluator for a worn beach rock.
 * Returns a function compatible with the SDFEvaluator type.
 */
export function createWornBeachRockSDF(
  config: Partial<WornBeachRockConfig>,
  seed: number = 42,
): (point: THREE.Vector3) => SDFPrimitiveResult {
  return (point: THREE.Vector3): SDFPrimitiveResult => {
    const rng = new SeededRandom(seed);
    return sdWornBeachRock(point, config, rng);
  };
}
