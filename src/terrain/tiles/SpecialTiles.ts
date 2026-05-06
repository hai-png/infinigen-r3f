/**
 * SpecialTiles — FloatingIce and Volcano LandTile Generators
 *
 * Two specialized tile generators that extend the LandTileSystem approach:
 *
 * 1. FloatingIce: Mesa-based ice formations with flat tops, steep icy cliffs,
 *    and translucent ice material. Uses the "mesa" approach — flat-topped
 *    plateaus with steeply eroded sides — but with ice surface properties.
 *
 * 2. Volcano: Conical mountain with a caldera depression at the summit,
 *    optional lava flow channels, and lava/material zone assignment.
 *    Uses a conical SDF with carved caldera and noise-displaced flows.
 *
 * Both generators produce BufferGeometry with vertex colors for material zones,
 * compatible with the LandTileComposer for blending with adjacent tiles.
 *
 * @module terrain/tiles
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm, seededRidgedMultifractal } from '@/core/util/MathUtils';
import { TERRAIN_MATERIALS } from '../sdf/SDFPrimitives';
import type { LandTile } from './LandTileSystem';

// ============================================================================
// Material IDs for Special Tiles
// ============================================================================

export const ICE_TILE_MATERIALS = {
  ICE_SURFACE: 20,      // Translucent ice
  ICE_CLIFF: 21,        // Steep icy cliff face
  ICE_FROZEN_LAKE: 22,  // Flat frozen surface
  SNOW_COVER: 5,        // Snow on top
  STONE_BASE: 0,        // Rocky base
} as const;

export const VOLCANO_TILE_MATERIALS = {
  VOLCANIC_ROCK: 30,    // Dark basalt
  LAVA_FLOW: 10,        // Active lava (reuses LAVA from TERRAIN_MATERIALS)
  CALDERA_FLOOR: 31,    // Flat caldera interior
  ASH_FIELD: 32,        // Ash-covered slopes
  SCORIA: 33,           // Vesicular basalt near vents
} as const;

// ============================================================================
// FloatingIce Tile Generator
// ============================================================================

export interface FloatingIceConfig {
  /** Center position of the ice formation */
  center: THREE.Vector3;
  /** Top plateau radius */
  topRadius: number;
  /** Base radius of the mesa (bottom of the cliff) */
  baseRadius?: number;
  /** Height of the mesa (top to base) */
  height: number;
  /** Clift steepness (0 = gentle slope, 1 = vertical cliff) */
  cliffSteepness: number;
  /** Surface irregularity (0 = smooth, 1 = very rough) */
  roughness: number;
  /** Whether the top has a frozen lake depression */
  hasFrozenLake: boolean;
  /** Frozen lake depth (if hasFrozenLake) */
  frozenLakeDepth: number;
  /** Snow coverage on top (0 = no snow, 1 = fully snowed) */
  snowCoverage: number;
  /** Random seed */
  seed: number;
  /** Mesh resolution (vertices per side) */
  resolution: number;
  /** Tile world-space size */
  size: number;
}

const DEFAULT_FLOATING_ICE_CONFIG: FloatingIceConfig = {
  center: new THREE.Vector3(0, 0, 0),
  topRadius: 6.0,
  height: 4.0,
  cliffSteepness: 0.85,
  roughness: 0.4,
  hasFrozenLake: true,
  frozenLakeDepth: 0.3,
  snowCoverage: 0.6,
  seed: 42,
  resolution: 64,
  size: 30,
};

/**
 * Generate a FloatingIce mesa tile.
 *
 * The mesa approach creates:
 * - A flat or slightly concave top surface (ice plateau)
 * - Steep, nearly vertical cliff sides (icy cliffs)
 * - Optional frozen lake depression in the center
 * - Snow coverage that fades near cliff edges
 * - Surface roughness from noise displacement
 *
 * @param config - Ice formation configuration
 * @returns BufferGeometry with positions, normals, UVs, and vertex colors
 */
export function generateFloatingIceTile(
  config: Partial<FloatingIceConfig> = {},
): THREE.BufferGeometry {
  const cfg = { ...DEFAULT_FLOATING_ICE_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);
  const res = cfg.resolution;
  const size = cfg.size;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const halfSize = size / 2;
  const cx = cfg.center.x;
  const cz = cfg.center.z;
  const baseY = cfg.center.y;
  const topY = baseY + cfg.height;

  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const u = col / (res - 1);
      const v = row / (res - 1);
      const wx = cx - halfSize + u * size;
      const wz = cz - halfSize + v * size;

      // Distance from center in XZ plane
      const dx = wx - cx;
      const dz = wz - cz;
      const distFromCenter = Math.sqrt(dx * dx + dz * dz);
      const normalizedDist = distFromCenter / cfg.topRadius;

      // Mesa height profile:
      // - Inside topRadius: flat top with slight noise
      // - Between topRadius and topRadius*1.5: steep cliff
      // - Beyond topRadius*1.5: base ground level
      let height: number;

      if (normalizedDist <= 1.0) {
        // Flat top with slight noise
        const topNoise = seededFbm(
          wx * 0.5, 0, wz * 0.5, 3, 2.0, 0.5, cfg.seed,
        ) * cfg.roughness * 0.3;

        // Frozen lake depression
        let lakeDepression = 0;
        if (cfg.hasFrozenLake && normalizedDist < 0.6) {
          const lakeDist = normalizedDist / 0.6;
          lakeDepression = (1 - lakeDist * lakeDist) * cfg.frozenLakeDepth;
        }

        height = topY + topNoise - lakeDepression;
      } else if (normalizedDist <= 1.5) {
        // Steep cliff — transition from top to base
        const cliffT = (normalizedDist - 1.0) / 0.5;

        // Use steepness to control the cliff curve
        // Higher steepness = more vertical cliff
        const cliffCurve = Math.pow(cliffT, 1.0 / (1.0 - cfg.cliffSteepness * 0.9 + 0.1));

        // Add roughness to cliff face
        const cliffNoise = seededFbm(
          wx * 1.0 + cfg.seed, wz * 1.0, cliffT * 3.0,
          4, 2.0, 0.5, cfg.seed + 50,
        ) * cfg.roughness * 0.5;

        height = topY * (1 - cliffCurve) + baseY * cliffCurve + cliffNoise;
      } else {
        // Base ground with slight variation
        const groundNoise = seededFbm(
          wx * 0.3, 0, wz * 0.3, 2, 2.0, 0.5, cfg.seed + 100,
        ) * 0.3;
        height = baseY + groundNoise;
      }

      // Add ice cracks for visual detail
      if (normalizedDist <= 1.2 && height > baseY + cfg.height * 0.3) {
        const crackNoise = seededRidgedMultifractal(
          wx * 2.0, height * 2.0, wz * 2.0,
          2, 2.0, 0.5, 0.8, cfg.seed + 200,
        );
        height += crackNoise * 0.05;
      }

      positions.push(wx, height, wz);
      normals.push(0, 1, 0); // Will recompute later
      uvs.push(u, v);

      // Vertex color based on material zone
      let materialId: number;
      let r: number, g: number, b: number;

      if (normalizedDist <= 0.6 && cfg.hasFrozenLake) {
        materialId = ICE_TILE_MATERIALS.ICE_FROZEN_LAKE;
        // Translucent blue-white
        r = 0.75; g = 0.88; b = 0.95;
      } else if (normalizedDist <= 1.0) {
        // Top surface
        const snowThreshold = 1.0 - cfg.snowCoverage;
        if (normalizedDist > snowThreshold || rng.next() < cfg.snowCoverage * 0.5) {
          materialId = ICE_TILE_MATERIALS.SNOW_COVER;
          r = 0.92; g = 0.94; b = 0.98;
        } else {
          materialId = ICE_TILE_MATERIALS.ICE_SURFACE;
          r = 0.80; g = 0.90; b = 0.96;
        }
      } else if (normalizedDist <= 1.5) {
        // Cliff face — icy blue with stone peeking through
        materialId = ICE_TILE_MATERIALS.ICE_CLIFF;
        const stoneMix = (normalizedDist - 1.0) / 0.5;
        r = 0.7 * (1 - stoneMix) + 0.4 * stoneMix;
        g = 0.85 * (1 - stoneMix) + 0.38 * stoneMix;
        b = 0.92 * (1 - stoneMix) + 0.35 * stoneMix;
      } else {
        // Base ground
        materialId = ICE_TILE_MATERIALS.STONE_BASE;
        r = 0.35; g = 0.33; b = 0.30;
      }

      colors.push(r, g, b);
    }
  }

  // Generate indices
  for (let row = 0; row < res - 1; row++) {
    for (let col = 0; col < res - 1; col++) {
      const a = row * res + col;
      const b = row * res + (col + 1);
      const c = (row + 1) * res + col;
      const d = (row + 1) * res + (col + 1);
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

// ============================================================================
// Volcano Tile Generator
// ============================================================================

export interface VolcanoConfig {
  /** Center position of the volcano */
  center: THREE.Vector3;
  /** Base radius of the volcanic cone */
  baseRadius: number;
  /** Summit radius (caldera rim) */
  summitRadius: number;
  /** Height from base to summit */
  height: number;
  /** Caldera depth (how deep the crater is) */
  calderaDepth: number;
  /** Caldera rim irregularity (0 = circular, 1 = very irregular) */
  calderaIrregularity: number;
  /** Number of lava flow channels */
  lavaFlowCount: number;
  /** Lava flow width */
  lavaFlowWidth: number;
  /** Lava flow height above slope */
  lavaFlowHeight: number;
  /** Cone slope variation (0 = perfect cone, 1 = very lumpy) */
  slopeVariation: number;
  /** Ash field coverage (0 = none, 1 = fully ash-covered) */
  ashCoverage: number;
  /** Random seed */
  seed: number;
  /** Mesh resolution (vertices per side) */
  resolution: number;
  /** Tile world-space size */
  size: number;
}

const DEFAULT_VOLCANO_CONFIG: VolcanoConfig = {
  center: new THREE.Vector3(0, 0, 0),
  baseRadius: 20.0,
  summitRadius: 5.0,
  height: 12.0,
  calderaDepth: 3.0,
  calderaIrregularity: 0.3,
  lavaFlowCount: 4,
  lavaFlowWidth: 2.0,
  lavaFlowHeight: 0.5,
  slopeVariation: 0.3,
  ashCoverage: 0.5,
  seed: 42,
  resolution: 64,
  size: 50,
};

/**
 * Generate a Volcano tile.
 *
 * The volcano consists of:
 * - A conical shape with noise-displaced slopes
 * - A caldera (crater) depression at the summit
 * - Lava flow channels running down the slopes
 * - Material zones: volcanic rock, lava flows, caldera floor, ash, scoria
 *
 * @param config - Volcano configuration
 * @returns BufferGeometry with positions, normals, UVs, and vertex colors
 */
export function generateVolcanoTile(
  config: Partial<VolcanoConfig> = {},
): THREE.BufferGeometry {
  const cfg = { ...DEFAULT_VOLCANO_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);
  const res = cfg.resolution;
  const size = cfg.size;

  // Pre-generate lava flow angles
  const lavaFlowAngles: number[] = [];
  for (let i = 0; i < cfg.lavaFlowCount; i++) {
    lavaFlowAngles.push(rng.next() * Math.PI * 2);
  }

  // Pre-generate caldera irregularity offsets
  const calderaIrregularityOffsets: number[] = [];
  const calderaSamples = 36;
  for (let i = 0; i < calderaSamples; i++) {
    calderaIrregularityOffsets.push(
      seededFbm(i * 0.5, 0, cfg.seed * 0.1, 2, 2.0, 0.5, cfg.seed + 300) * cfg.calderaIrregularity,
    );
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const halfSize = size / 2;
  const cx = cfg.center.x;
  const cz = cfg.center.z;
  const baseY = cfg.center.y;

  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const u = col / (res - 1);
      const v = row / (res - 1);
      const wx = cx - halfSize + u * size;
      const wz = cz - halfSize + v * size;

      const dx = wx - cx;
      const dz = wz - cz;
      const distFromCenter = Math.sqrt(dx * dx + dz * dz);

      // Angle from center (for lava flows and caldera irregularity)
      const angle = Math.atan2(dz, dx);

      // Caldera rim radius with irregularity
      const calderaIdx = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * calderaSamples) % calderaSamples;
      const irregularityOffset = calderaIrregularityOffsets[calderaIdx];
      const effectiveSummitRadius = cfg.summitRadius * (1 + irregularityOffset);

      let height: number;
      let materialId: number;

      if (distFromCenter <= effectiveSummitRadius) {
        // Inside the caldera — depression
        const calderaT = distFromCenter / effectiveSummitRadius;
        // Parabolic depression: deepest at center, rises to rim
        const calderaProfile = (1 - calderaT * calderaT) * cfg.calderaDepth;
        height = baseY + cfg.height - calderaProfile;

        // Floor noise
        const floorNoise = seededFbm(wx * 0.5, 0, wz * 0.5, 2, 2.0, 0.5, cfg.seed + 400) * 0.2;
        height += floorNoise;

        materialId = VOLCANO_TILE_MATERIALS.CALDERA_FLOOR;
      } else if (distFromCenter <= cfg.baseRadius) {
        // Volcanic cone slope
        const slopeT = (distFromCenter - effectiveSummitRadius) / (cfg.baseRadius - effectiveSummitRadius);

        // Conical profile: linear from summit to base
        height = baseY + cfg.height * (1 - slopeT);

        // Slope variation from noise
        const slopeNoise = seededFbm(
          wx * 0.3 + cfg.seed * 0.1, 0, wz * 0.3 + cfg.seed * 0.1,
          4, 2.0, 0.5, cfg.seed + 100,
        ) * cfg.slopeVariation * cfg.height * 0.15;
        height += slopeNoise;

        // Check if on a lava flow channel
        let onLavaFlow = false;
        let lavaFlowInfluence = 0;
        for (const flowAngle of lavaFlowAngles) {
          // Compute angular distance to this flow
          let angleDiff = Math.abs(angle - flowAngle);
          if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

          // Flow widens as it goes down the slope
          const flowWidth = cfg.lavaFlowWidth * (0.5 + slopeT * 1.5);
          const angularWidth = Math.atan2(flowWidth, Math.max(distFromCenter, 1));

          if (angleDiff < angularWidth) {
            onLavaFlow = true;
            const flowT = 1 - angleDiff / angularWidth;
            lavaFlowInfluence = Math.max(lavaFlowInfluence, flowT);
          }
        }

        if (onLavaFlow) {
          // Raise lava flow above the slope
          height += cfg.lavaFlowHeight * lavaFlowInfluence * (1 - slopeT * 0.5);

          // Lava surface is smoother than surrounding rock
          height += seededFbm(wx * 0.8, 0, wz * 0.8, 2, 2.0, 0.3, cfg.seed + 500) * 0.1;

          materialId = VOLCANO_TILE_MATERIALS.LAVA_FLOW;
        } else {
          // Ash or volcanic rock
          if (slopeT > 0.5 && rng.next() < cfg.ashCoverage) {
            materialId = VOLCANO_TILE_MATERIALS.ASH_FIELD;
          } else if (slopeT < 0.2) {
            materialId = VOLCANO_TILE_MATERIALS.SCORIA;
          } else {
            materialId = VOLCANO_TILE_MATERIALS.VOLCANIC_ROCK;
          }
        }
      } else {
        // Base ground beyond the volcano
        const groundNoise = seededFbm(wx * 0.2, 0, wz * 0.2, 2, 2.0, 0.5, cfg.seed + 200) * 0.5;
        height = baseY + groundNoise;

        // Transition from ash at the base to normal ground
        const distRatio = (distFromCenter - cfg.baseRadius) / (halfSize - cfg.baseRadius);
        materialId = distRatio < 0.3
          ? VOLCANO_TILE_MATERIALS.ASH_FIELD
          : TERRAIN_MATERIALS.STONE;
      }

      positions.push(wx, height, wz);
      normals.push(0, 1, 0);
      uvs.push(u, v);

      // Map material ID to color
      let r: number, g: number, b: number;
      switch (materialId) {
        case VOLCANO_TILE_MATERIALS.LAVA_FLOW:
          r = 0.85; g = 0.25; b = 0.05; // Glowing orange-red
          break;
        case VOLCANO_TILE_MATERIALS.CALDERA_FLOOR:
          r = 0.25; g = 0.20; b = 0.18; // Dark crater floor
          break;
        case VOLCANO_TILE_MATERIALS.VOLCANIC_ROCK:
          r = 0.30; g = 0.27; b = 0.25; // Dark basalt
          break;
        case VOLCANO_TILE_MATERIALS.ASH_FIELD:
          r = 0.45; g = 0.42; b = 0.38; // Grey ash
          break;
        case VOLCANO_TILE_MATERIALS.SCORIA:
          r = 0.22; g = 0.18; b = 0.16; // Very dark vesicular rock
          break;
        default:
          r = 0.40; g = 0.38; b = 0.35; // Default stone
          break;
      }
      colors.push(r, g, b);
    }
  }

  // Generate indices
  for (let row = 0; row < res - 1; row++) {
    for (let col = 0; col < res - 1; col++) {
      const a = row * res + col;
      const b = row * res + (col + 1);
      const c = (row + 1) * res + col;
      const d = (row + 1) * res + (col + 1);
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

// ============================================================================
// Convenience: SDF versions for use with the mesher pipeline
// ============================================================================

/**
 * SDF for a FloatingIce mesa formation.
 * Can be used as a terrain kernel with the marching-cubes mesher pipeline.
 */
export function sdFloatingIce(
  point: THREE.Vector3,
  config: Partial<FloatingIceConfig> = {},
): { distance: number; materialId: number } {
  const cfg = { ...DEFAULT_FLOATING_ICE_CONFIG, ...config };
  const cx = cfg.center.x;
  const cz = cfg.center.z;
  const baseY = cfg.center.y;
  const topY = baseY + cfg.height;

  const dx = point.x - cx;
  const dz = point.z - cz;
  const distXZ = Math.sqrt(dx * dx + dz * dz);

  // Mesa SDF: flat top + steep sides
  // Top cap: everything above topY and within topRadius
  const topDist = point.y - topY;
  const sideDist = distXZ - cfg.topRadius;

  // Cliff face: the region where the side drops from topY to baseY
  // This is approximately a truncated cone
  const t = Math.max(0, Math.min(1, (topY - point.y) / cfg.height));
  const radiusAtHeight = cfg.topRadius + t * (cfg.baseRadius || cfg.topRadius * 1.5 - cfg.topRadius);
  const cliffDist = distXZ - radiusAtHeight;

  // Combine: above the top = outside, below base = outside, between = cone
  let dist: number;
  let materialId: number;

  if (point.y > topY) {
    // Above the mesa
    dist = Math.sqrt(Math.max(0, sideDist) ** 2 + Math.max(0, topDist) ** 2);
    materialId = ICE_TILE_MATERIALS.ICE_SURFACE;
  } else if (point.y < baseY) {
    // Below the mesa
    dist = Math.max(cliffDist, baseY - point.y);
    materialId = ICE_TILE_MATERIALS.STONE_BASE;
  } else {
    // On the mesa slope
    // Frozen lake depression
    let depression = 0;
    if (cfg.hasFrozenLake && distXZ < cfg.topRadius * 0.6) {
      const lakeT = distXZ / (cfg.topRadius * 0.6);
      depression = (1 - lakeT * lakeT) * cfg.frozenLakeDepth;
    }

    dist = cliffDist - depression;
    if (distXZ < cfg.topRadius * 0.6) {
      materialId = ICE_TILE_MATERIALS.ICE_FROZEN_LAKE;
    } else if (distXZ < cfg.topRadius) {
      materialId = ICE_TILE_MATERIALS.ICE_SURFACE;
    } else {
      materialId = ICE_TILE_MATERIALS.ICE_CLIFF;
    }
  }

  // Add surface noise
  const noise = seededFbm(
    point.x * 0.3 + cfg.seed * 0.1,
    point.y * 0.3,
    point.z * 0.3 + cfg.seed * 0.1,
    3, 2.0, 0.5, cfg.seed,
  ) * cfg.roughness * 0.3;
  dist += noise;

  return { distance: dist, materialId };
}

/**
 * SDF for a Volcano formation.
 * Can be used as a terrain kernel with the marching-cubes mesher pipeline.
 */
export function sdVolcano(
  point: THREE.Vector3,
  config: Partial<VolcanoConfig> = {},
): { distance: number; materialId: number } {
  const cfg = { ...DEFAULT_VOLCANO_CONFIG, ...config };
  const cx = cfg.center.x;
  const cz = cfg.center.z;
  const baseY = cfg.center.y;

  const dx = point.x - cx;
  const dz = point.z - cz;
  const distXZ = Math.sqrt(dx * dx + dz * dz);

  // Conical shape
  const coneRadiusAtHeight = cfg.baseRadius * (1 - Math.max(0, point.y - baseY) / cfg.height);
  const coneDist = distXZ - Math.max(0, coneRadiusAtHeight);

  // Height above base
  const aboveBase = point.y - baseY;

  // Cap at summit
  const summitDist = aboveBase - cfg.height;

  let dist: number;
  let materialId: number;

  if (aboveBase > cfg.height) {
    // Above the summit — check if inside caldera
    if (distXZ < cfg.summitRadius) {
      // Inside caldera: depression
      const calderaFloorY = baseY + cfg.height - cfg.calderaDepth;
      dist = point.y - calderaFloorY;
      // Also bound by caldera walls
      dist = Math.max(dist, -(cfg.summitRadius - distXZ));
      materialId = VOLCANO_TILE_MATERIALS.CALDERA_FLOOR;
    } else {
      // Outside caldera, above summit
      dist = Math.max(coneDist, summitDist);
      materialId = VOLCANO_TILE_MATERIALS.VOLCANIC_ROCK;
    }
  } else if (aboveBase < 0) {
    // Below base
    dist = -aboveBase;
    materialId = TERRAIN_MATERIALS.STONE;
  } else {
    // On the cone slope
    dist = coneDist;

    // Check lava flows
    const angle = Math.atan2(dz, dx);
    let onLava = false;
    for (const flowAngle of cfg.lavaFlowCount > 0 ? [0] : []) {
      let angleDiff = Math.abs(angle - flowAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff < 0.3) {
        onLava = true;
        break;
      }
    }

    if (onLava) {
      dist += cfg.lavaFlowHeight;
      materialId = VOLCANO_TILE_MATERIALS.LAVA_FLOW;
    } else if (aboveBase > cfg.height * 0.8) {
      materialId = VOLCANO_TILE_MATERIALS.SCORIA;
    } else if (aboveBase < cfg.height * 0.3) {
      materialId = VOLCANO_TILE_MATERIALS.ASH_FIELD;
    } else {
      materialId = VOLCANO_TILE_MATERIALS.VOLCANIC_ROCK;
    }
  }

  // Slope noise
  const noise = seededFbm(
    point.x * 0.3 + cfg.seed * 0.1,
    point.y * 0.3,
    point.z * 0.3 + cfg.seed * 0.1,
    3, 2.0, 0.5, cfg.seed + 100,
  ) * cfg.slopeVariation * 1.0;
  dist += noise;

  return { distance: dist, materialId };
}

// ============================================================================
// LandTile Generators — Integration with LandTileSystem
// ============================================================================

/**
 * Generate a FloatingIce tile as a proper LandTile for use with LandTileComposer.
 *
 * This creates a `LandTile` with a heightmap representing a mesa-based ice
 * formation. The heightmap uses the same mesa profile as `generateFloatingIceTile`
 * but outputs a normalized heightmap suitable for the LandTileSystem pipeline.
 *
 * Uses the 'ice' material preset from MaterialPresetLibrary for the surface,
 * with 'snow' on top and 'snow' material preset for snow-covered areas.
 *
 * The tile has:
 * - Flat-topped ice plateau with slight erosion at edges
 * - Steep icy cliff sides
 * - Optional frozen lake depression in the center
 * - Snow coverage on top surface
 *
 * @param x - World X origin of the tile
 * @param z - World Z origin of the tile
 * @param size - World-space side length
 * @param config - Ice formation configuration overrides
 * @returns LandTile with heightmap and biome weights for ice terrain
 */
export function generateFloatingIceLandTile(
  x: number,
  z: number,
  size: number,
  config: Partial<FloatingIceConfig> = {},
): LandTile {
  const cfg: FloatingIceConfig = {
    ...DEFAULT_FLOATING_ICE_CONFIG,
    ...config,
    center: new THREE.Vector3(x + size / 2, 0, z + size / 2),
    size,
    resolution: config.resolution ?? 64,
  };

  const res = cfg.resolution;
  const rng = new SeededRandom(cfg.seed);
  const heightmap = new Float32Array(res * res);

  const halfSize = size / 2;
  const cx = cfg.center.x;
  const cz = cfg.center.z;
  const baseY = 0;
  const topY = cfg.height;

  // Find min/max for normalization
  let hMin = Infinity;
  let hMax = -Infinity;

  // First pass: compute raw heights
  const rawHeights = new Float32Array(res * res);

  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const wx = cx - halfSize + (col / (res - 1)) * size;
      const wz = cz - halfSize + (row / (res - 1)) * size;

      const dx = wx - cx;
      const dz = wz - cz;
      const distFromCenter = Math.sqrt(dx * dx + dz * dz);
      const normalizedDist = distFromCenter / cfg.topRadius;

      let height: number;

      if (normalizedDist <= 1.0) {
        const topNoise = seededFbm(
          wx * 0.5, 0, wz * 0.5, 3, 2.0, 0.5, cfg.seed,
        ) * cfg.roughness * 0.3;

        let lakeDepression = 0;
        if (cfg.hasFrozenLake && normalizedDist < 0.6) {
          const lakeDist = normalizedDist / 0.6;
          lakeDepression = (1 - lakeDist * lakeDist) * cfg.frozenLakeDepth;
        }

        height = topY + topNoise - lakeDepression;
      } else if (normalizedDist <= 1.5) {
        const cliffT = (normalizedDist - 1.0) / 0.5;
        const cliffCurve = Math.pow(cliffT, 1.0 / (1.0 - cfg.cliffSteepness * 0.9 + 0.1));

        const cliffNoise = seededFbm(
          wx * 1.0 + cfg.seed, wz * 1.0, cliffT * 3.0,
          4, 2.0, 0.5, cfg.seed + 50,
        ) * cfg.roughness * 0.5;

        height = topY * (1 - cliffCurve) + baseY * cliffCurve + cliffNoise;
      } else {
        const groundNoise = seededFbm(
          wx * 0.3, 0, wz * 0.3, 2, 2.0, 0.5, cfg.seed + 100,
        ) * 0.3;
        height = baseY + groundNoise;
      }

      // Slight edge erosion on the ice plateau
      if (normalizedDist > 0.8 && normalizedDist <= 1.0) {
        const erosionNoise = seededRidgedMultifractal(
          wx * 1.5, height, wz * 1.5,
          2, 2.0, 0.5, 0.7, cfg.seed + 300,
        ) * 0.1;
        height += erosionNoise;
      }

      // Ice cracks
      if (normalizedDist <= 1.2 && height > baseY + cfg.height * 0.3) {
        const crackNoise = seededRidgedMultifractal(
          wx * 2.0, height * 2.0, wz * 2.0,
          2, 2.0, 0.5, 0.8, cfg.seed + 200,
        );
        height += crackNoise * 0.05;
      }

      rawHeights[row * res + col] = height;
      hMin = Math.min(hMin, height);
      hMax = Math.max(hMax, height);
    }
  }

  // Normalize to [0, 1]
  const hRange = hMax - hMin;
  for (let i = 0; i < rawHeights.length; i++) {
    heightmap[i] = hRange > 1e-8 ? (rawHeights[i] - hMin) / hRange : 0.5;
  }

  // Biome weights: primarily tundra/ice biome
  const biomeWeights = new Map<string, number>();
  biomeWeights.set('tundra', 0.6);
  biomeWeights.set('mountain', 0.3);
  biomeWeights.set('plains', 0.1);

  return {
    id: `floating_ice_${x}_${z}`,
    x,
    z,
    size,
    heightmap,
    resolution: res,
    biomeWeights,
    erosionApplied: false,
    processesApplied: ['floating_ice_generation'],
  };
}

/**
 * Generate a Volcano tile as a proper LandTile for use with LandTileComposer.
 *
 * This creates a `LandTile` with a heightmap representing a volcanic cone.
 * The heightmap uses the same conical profile as `generateVolcanoTile` but
 * outputs a normalized heightmap suitable for the LandTileSystem pipeline.
 *
 * Uses the 'lava' material preset from MaterialPresetLibrary for lava flow
 * channels, and 'mountain_rock' for the volcanic rock surface.
 *
 * The tile has:
 * - Conical shape with configurable slope angle (default ~30 degrees)
 * - Caldera (crater) depression at the summit
 * - Optional lava flow channels running down the slopes
 * - Material zones: volcanic rock, lava, caldera floor, ash, scoria
 *
 * @param x - World X origin of the tile
 * @param z - World Z origin of the tile
 * @param size - World-space side length
 * @param config - Volcano configuration overrides
 * @returns LandTile with heightmap and biome weights for volcanic terrain
 */
export function generateVolcanoLandTile(
  x: number,
  z: number,
  size: number,
  config: Partial<VolcanoConfig> = {},
): LandTile {
  const cfg: VolcanoConfig = {
    ...DEFAULT_VOLCANO_CONFIG,
    ...config,
    center: new THREE.Vector3(x + size / 2, 0, z + size / 2),
    size,
    resolution: config.resolution ?? 64,
  };

  const res = cfg.resolution;
  const rng = new SeededRandom(cfg.seed);

  // Pre-generate lava flow angles
  const lavaFlowAngles: number[] = [];
  for (let i = 0; i < cfg.lavaFlowCount; i++) {
    lavaFlowAngles.push(rng.next() * Math.PI * 2);
  }

  // Pre-generate caldera irregularity offsets
  const calderaIrregularityOffsets: number[] = [];
  const calderaSamples = 36;
  for (let i = 0; i < calderaSamples; i++) {
    calderaIrregularityOffsets.push(
      seededFbm(i * 0.5, 0, cfg.seed * 0.1, 2, 2.0, 0.5, cfg.seed + 300) * cfg.calderaIrregularity,
    );
  }

  // Compute slope angle: default ~30 degrees
  // The slope angle determines the ratio of height to base radius
  // tan(slopeAngle) = height / (baseRadius - summitRadius)
  // With defaults: tan(30°) ≈ 0.577 → height / (20 - 5) = 12/15 = 0.8 (slightly steeper)
  const slopeAngle = Math.atan2(cfg.height, cfg.baseRadius - cfg.summitRadius);

  const halfSize = size / 2;
  const cx = cfg.center.x;
  const cz = cfg.center.z;
  const baseY = 0;

  let hMin = Infinity;
  let hMax = -Infinity;
  const rawHeights = new Float32Array(res * res);

  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const wx = cx - halfSize + (col / (res - 1)) * size;
      const wz = cz - halfSize + (row / (res - 1)) * size;

      const dx = wx - cx;
      const dz = wz - cz;
      const distFromCenter = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);

      const calderaIdx = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * calderaSamples) % calderaSamples;
      const irregularityOffset = calderaIrregularityOffsets[calderaIdx];
      const effectiveSummitRadius = cfg.summitRadius * (1 + irregularityOffset);

      let height: number;

      if (distFromCenter <= effectiveSummitRadius) {
        // Caldera depression
        const calderaT = distFromCenter / effectiveSummitRadius;
        const calderaProfile = (1 - calderaT * calderaT) * cfg.calderaDepth;
        height = cfg.height - calderaProfile;

        const floorNoise = seededFbm(wx * 0.5, 0, wz * 0.5, 2, 2.0, 0.5, cfg.seed + 400) * 0.2;
        height += floorNoise;
      } else if (distFromCenter <= cfg.baseRadius) {
        // Conical slope — use the computed slope angle
        const slopeT = (distFromCenter - effectiveSummitRadius) / (cfg.baseRadius - effectiveSummitRadius);

        // Linear conical profile modulated by slope angle
        height = cfg.height * (1 - slopeT);

        // Slope variation from noise
        const slopeNoise = seededFbm(
          wx * 0.3 + cfg.seed * 0.1, 0, wz * 0.3 + cfg.seed * 0.1,
          4, 2.0, 0.5, cfg.seed + 100,
        ) * cfg.slopeVariation * cfg.height * 0.15;
        height += slopeNoise;

        // Check lava flow channels
        let lavaFlowInfluence = 0;
        for (const flowAngle of lavaFlowAngles) {
          let angleDiff = Math.abs(angle - flowAngle);
          if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

          const flowWidth = cfg.lavaFlowWidth * (0.5 + slopeT * 1.5);
          const angularWidth = Math.atan2(flowWidth, Math.max(distFromCenter, 1));

          if (angleDiff < angularWidth) {
            const flowT = 1 - angleDiff / angularWidth;
            lavaFlowInfluence = Math.max(lavaFlowInfluence, flowT);
          }
        }

        if (lavaFlowInfluence > 0) {
          // Raise lava flow above the slope
          height += cfg.lavaFlowHeight * lavaFlowInfluence * (1 - slopeT * 0.5);
          height += seededFbm(wx * 0.8, 0, wz * 0.8, 2, 2.0, 0.3, cfg.seed + 500) * 0.1;
        }
      } else {
        // Base ground beyond the volcano
        const groundNoise = seededFbm(wx * 0.2, 0, wz * 0.2, 2, 2.0, 0.5, cfg.seed + 200) * 0.5;
        height = baseY + groundNoise;
      }

      rawHeights[row * res + col] = height;
      hMin = Math.min(hMin, height);
      hMax = Math.max(hMax, height);
    }
  }

  // Normalize heightmap to [0, 1]
  const heightmap = new Float32Array(res * res);
  const hRange = hMax - hMin;
  for (let i = 0; i < rawHeights.length; i++) {
    heightmap[i] = hRange > 1e-8 ? (rawHeights[i] - hMin) / hRange : 0.5;
  }

  // Biome weights: primarily mountain/desert (volcanic terrain)
  const biomeWeights = new Map<string, number>();
  biomeWeights.set('mountain', 0.5);
  biomeWeights.set('desert', 0.3);
  biomeWeights.set('tundra', 0.2);

  // Store slope angle in the tile's processes metadata
  return {
    id: `volcano_${x}_${z}`,
    x,
    z,
    size,
    heightmap,
    resolution: res,
    biomeWeights,
    erosionApplied: false,
    processesApplied: [`volcano_generation:slope_${(slopeAngle * 180 / Math.PI).toFixed(1)}deg`],
  };
}
