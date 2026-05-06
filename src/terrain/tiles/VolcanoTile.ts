/**
 * VolcanoTile — Conical Volcano LandTile Generator
 *
 * Generates volcanic terrain with a conical shape and caldera depression
 * at the summit. Supports optional lava flow material using the 'lava'
 * material preset from MaterialPresetLibrary.
 *
 * Parameters:
 * - coneAngle: half-angle of the volcanic cone (degrees)
 * - calderaDepth: depth of the caldera depression at the summit
 * - hasLava: whether to add lava flow channels with 'lava' material
 *
 * Compatible with the LandTileComposer for blending with adjacent tiles.
 *
 * @module terrain/tiles
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm, seededRidgedMultifractal } from '@/core/util/MathUtils';
import { TERRAIN_MATERIALS } from '../sdf/SDFPrimitives';
import { VOLCANO_TILE_MATERIALS } from './SpecialTiles';
import type { LandTile } from './LandTileSystem';
import { MaterialPresetLibrary } from '@/assets/materials/MaterialPresetLibrary';

// ============================================================================
// Configuration
// ============================================================================

/** Configuration for a single volcano tile */
export interface VolcanoTileConfig {
  /** Center position of the volcano */
  center: THREE.Vector3;
  /** Cone half-angle in degrees (controls slope steepness, default ~30) */
  coneAngle: number;
  /** Base radius of the volcanic cone */
  baseRadius: number;
  /** Summit radius (caldera rim) */
  summitRadius: number;
  /** Height from base to summit */
  height: number;
  /** Caldera depth (how deep the crater is) */
  calderaDepth: number;
  /** Whether to add lava flow channels with 'lava' material preset */
  hasLava: boolean;
  /** Number of lava flow channels (if hasLava) */
  lavaFlowCount: number;
  /** Lava flow width */
  lavaFlowWidth: number;
  /** Lava flow height above slope */
  lavaFlowHeight: number;
  /** Caldera rim irregularity (0 = circular, 1 = very irregular) */
  calderaIrregularity: number;
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
  /** Whether to apply material presets from MaterialPresetLibrary */
  applyMaterialPresets: boolean;
}

const DEFAULT_VOLCANO_TILE_CONFIG: VolcanoTileConfig = {
  center: new THREE.Vector3(0, 0, 0),
  coneAngle: 30,
  baseRadius: 20.0,
  summitRadius: 5.0,
  height: 12.0,
  calderaDepth: 3.0,
  hasLava: true,
  lavaFlowCount: 4,
  lavaFlowWidth: 2.0,
  lavaFlowHeight: 0.5,
  calderaIrregularity: 0.3,
  slopeVariation: 0.3,
  ashCoverage: 0.5,
  seed: 42,
  resolution: 64,
  size: 50,
  applyMaterialPresets: true,
};

// ============================================================================
// Lava / Volcanic Material Preset Colors
// ============================================================================

/**
 * Color palette derived from the MaterialPresetLibrary 'lava' and
 * 'mountain_rock' presets.
 *
 * The 'lava' preset has: baseColor(0.15, 0.08, 0.05), emissionColor(1.0, 0.4, 0.05)
 * The 'mountain_rock' preset has: baseColor(0.48, 0.45, 0.4)
 */
const VOLCANO_PRESET_COLORS = {
  volcanicRock: { r: 0.30, g: 0.27, b: 0.25 },    // From 'mountain_rock' (darker)
  lavaFlow: { r: 0.85, g: 0.25, b: 0.05 },         // From 'lava' emission color
  calderaFloor: { r: 0.25, g: 0.20, b: 0.18 },     // Dark crater floor
  ashField: { r: 0.45, g: 0.42, b: 0.38 },          // Grey ash
  scoria: { r: 0.22, g: 0.18, b: 0.16 },            // Very dark vesicular rock
  stone: { r: 0.40, g: 0.38, b: 0.35 },             // Default stone
} as const;

// ============================================================================
// generateVolcanoTileMesh
// ============================================================================

/**
 * Generate a Volcano tile as a BufferGeometry.
 *
 * The volcano consists of:
 * - A conical shape with noise-displaced slopes
 * - A caldera (crater) depression at the summit
 * - Optional lava flow channels running down the slopes
 * - Material zones: volcanic rock, lava flows, caldera floor, ash, scoria
 *
 * Vertex colors are derived from the MaterialPresetLibrary 'lava' and
 * 'mountain_rock' presets when `applyMaterialPresets` is enabled.
 *
 * @param config - Volcano configuration
 * @returns BufferGeometry with positions, normals, UVs, and vertex colors
 */
export function generateVolcanoTileMesh(
  config: Partial<VolcanoTileConfig> = {},
): THREE.BufferGeometry {
  const cfg = { ...DEFAULT_VOLCANO_TILE_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);
  const res = cfg.resolution;
  const size = cfg.size;

  // Derive base radius from cone angle and height if needed
  // tan(coneAngle) = height / (baseRadius - summitRadius)
  const coneAngleRad = (cfg.coneAngle * Math.PI) / 180;
  const derivedBaseRadius = cfg.summitRadius + cfg.height / Math.tan(coneAngleRad);
  const effectiveBaseRadius = Math.max(cfg.baseRadius, derivedBaseRadius);

  // Pre-generate lava flow angles
  const lavaFlowAngles: number[] = [];
  if (cfg.hasLava) {
    for (let i = 0; i < cfg.lavaFlowCount; i++) {
      lavaFlowAngles.push(rng.next() * Math.PI * 2);
    }
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
      let r: number, g: number, b: number;

      if (distFromCenter <= effectiveSummitRadius) {
        // Inside the caldera — depression
        const calderaT = distFromCenter / effectiveSummitRadius;
        // Parabolic depression: deepest at center, rises to rim
        const calderaProfile = (1 - calderaT * calderaT) * cfg.calderaDepth;
        height = baseY + cfg.height - calderaProfile;

        // Floor noise
        const floorNoise = seededFbm(wx * 0.5, 0, wz * 0.5, 2, 2.0, 0.5, cfg.seed + 400) * 0.2;
        height += floorNoise;

        r = VOLCANO_PRESET_COLORS.calderaFloor.r;
        g = VOLCANO_PRESET_COLORS.calderaFloor.g;
        b = VOLCANO_PRESET_COLORS.calderaFloor.b;
      } else if (distFromCenter <= effectiveBaseRadius) {
        // Volcanic cone slope — use cone angle to determine profile
        const slopeT = (distFromCenter - effectiveSummitRadius) / (effectiveBaseRadius - effectiveSummitRadius);

        // Linear conical profile
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

        if (cfg.hasLava) {
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
        }

        if (onLavaFlow) {
          // Raise lava flow above the slope
          height += cfg.lavaFlowHeight * lavaFlowInfluence * (1 - slopeT * 0.5);
          // Lava surface is smoother
          height += seededFbm(wx * 0.8, 0, wz * 0.8, 2, 2.0, 0.3, cfg.seed + 500) * 0.1;

          // Lava material preset colors
          r = VOLCANO_PRESET_COLORS.lavaFlow.r;
          g = VOLCANO_PRESET_COLORS.lavaFlow.g;
          b = VOLCANO_PRESET_COLORS.lavaFlow.b;
        } else {
          // Ash or volcanic rock
          const slopeHeight = baseY + cfg.height * (1 - slopeT);
          if (slopeT > 0.5 && rng.next() < cfg.ashCoverage) {
            r = VOLCANO_PRESET_COLORS.ashField.r;
            g = VOLCANO_PRESET_COLORS.ashField.g;
            b = VOLCANO_PRESET_COLORS.ashField.b;
          } else if (slopeT < 0.2) {
            r = VOLCANO_PRESET_COLORS.scoria.r;
            g = VOLCANO_PRESET_COLORS.scoria.g;
            b = VOLCANO_PRESET_COLORS.scoria.b;
          } else {
            r = VOLCANO_PRESET_COLORS.volcanicRock.r;
            g = VOLCANO_PRESET_COLORS.volcanicRock.g;
            b = VOLCANO_PRESET_COLORS.volcanicRock.b;
          }
        }
      } else {
        // Base ground beyond the volcano
        const groundNoise = seededFbm(wx * 0.2, 0, wz * 0.2, 2, 2.0, 0.5, cfg.seed + 200) * 0.5;
        height = baseY + groundNoise;

        // Transition from ash at the base to normal ground
        const distRatio = (distFromCenter - effectiveBaseRadius) / (halfSize - effectiveBaseRadius);
        r = distRatio < 0.3 ? VOLCANO_PRESET_COLORS.ashField.r : VOLCANO_PRESET_COLORS.stone.r;
        g = distRatio < 0.3 ? VOLCANO_PRESET_COLORS.ashField.g : VOLCANO_PRESET_COLORS.stone.g;
        b = distRatio < 0.3 ? VOLCANO_PRESET_COLORS.ashField.b : VOLCANO_PRESET_COLORS.stone.b;
      }

      positions.push(wx, height, wz);
      normals.push(0, 1, 0);
      uvs.push(u, v);
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

  // Store material preset info in userData for downstream material assignment
  if (cfg.applyMaterialPresets) {
    const library = new MaterialPresetLibrary();
    const lavaPreset = library.getPreset('lava');
    const rockPreset = library.getPreset('mountain_rock');
    geometry.userData = {
      ...geometry.userData,
      materialPresets: {
        lava: lavaPreset?.id ?? 'lava',
        rock: rockPreset?.id ?? 'mountain_rock',
        caldera: 'mountain_rock',
        ash: 'mountain_rock',
      },
      tileType: 'volcano',
      hasLava: cfg.hasLava,
      coneAngle: cfg.coneAngle,
    };
  }

  return geometry;
}

// ============================================================================
// generateVolcanoLandTile
// ============================================================================

/**
 * Generate a Volcano tile as a proper LandTile for use with LandTileComposer.
 *
 * Creates a `LandTile` with a heightmap representing a volcanic cone.
 * Uses the 'lava' material preset from MaterialPresetLibrary for lava flow
 * channels, and 'mountain_rock' for the volcanic rock surface.
 *
 * Parameters:
 * - coneAngle: half-angle of the volcanic cone (degrees)
 * - calderaDepth: depth of the caldera depression at the summit
 * - hasLava: whether to add lava flow channels with 'lava' material
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
  config: Partial<VolcanoTileConfig> = {},
): LandTile {
  const cfg: VolcanoTileConfig = {
    ...DEFAULT_VOLCANO_TILE_CONFIG,
    ...config,
    center: new THREE.Vector3(x + size / 2, 0, z + size / 2),
    size,
    resolution: config.resolution ?? 64,
  };

  const res = cfg.resolution;
  const rng = new SeededRandom(cfg.seed);

  // Derive effective base radius from cone angle
  const coneAngleRad = (cfg.coneAngle * Math.PI) / 180;
  const derivedBaseRadius = cfg.summitRadius + cfg.height / Math.tan(coneAngleRad);
  const effectiveBaseRadius = Math.max(cfg.baseRadius, derivedBaseRadius);

  // Pre-generate lava flow angles
  const lavaFlowAngles: number[] = [];
  if (cfg.hasLava) {
    for (let i = 0; i < cfg.lavaFlowCount; i++) {
      lavaFlowAngles.push(rng.next() * Math.PI * 2);
    }
  }

  // Pre-generate caldera irregularity offsets
  const calderaIrregularityOffsets: number[] = [];
  const calderaSamples = 36;
  for (let i = 0; i < calderaSamples; i++) {
    calderaIrregularityOffsets.push(
      seededFbm(i * 0.5, 0, cfg.seed * 0.1, 2, 2.0, 0.5, cfg.seed + 300) * cfg.calderaIrregularity,
    );
  }

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
      } else if (distFromCenter <= effectiveBaseRadius) {
        // Conical slope using cone angle
        const slopeT = (distFromCenter - effectiveSummitRadius) / (effectiveBaseRadius - effectiveSummitRadius);

        height = cfg.height * (1 - slopeT);

        // Slope variation
        const slopeNoise = seededFbm(
          wx * 0.3 + cfg.seed * 0.1, 0, wz * 0.3 + cfg.seed * 0.1,
          4, 2.0, 0.5, cfg.seed + 100,
        ) * cfg.slopeVariation * cfg.height * 0.15;
        height += slopeNoise;

        // Lava flow channels
        if (cfg.hasLava) {
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
            height += cfg.lavaFlowHeight * lavaFlowInfluence * (1 - slopeT * 0.5);
            height += seededFbm(wx * 0.8, 0, wz * 0.8, 2, 2.0, 0.3, cfg.seed + 500) * 0.1;
          }
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

  // Store cone angle and lava flag in processes metadata
  return {
    id: `volcano_${x}_${z}`,
    x,
    z,
    size,
    heightmap,
    resolution: res,
    biomeWeights,
    erosionApplied: false,
    processesApplied: [
      `volcano_generation:cone_${cfg.coneAngle.toFixed(1)}deg`,
      `caldera_depth:${cfg.calderaDepth}`,
      `has_lava:${cfg.hasLava}`,
    ],
  };
}
