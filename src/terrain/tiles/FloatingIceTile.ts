/**
 * FloatingIceTile — Mesa-based Floating Ice LandTile Generator
 *
 * Generates floating ice formations using a mesa approach: flat tops with
 * steep icy cliff sides. Applies the 'ice' material preset from
 * MaterialPresetLibrary for translucent icy surfaces, and 'snow' preset
 * for snow-covered areas on top.
 *
 * Parameters:
 * - sizeRange: [min, max] radius of the ice formation
 * - heightRange: [min, max] height of the mesa
 * - edgeErosion: amount of erosion at the mesa edges (0 = smooth, 1 = very eroded)
 *
 * Compatible with the LandTileComposer for blending with adjacent tiles.
 *
 * @module terrain/tiles
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm, seededRidgedMultifractal } from '@/core/util/MathUtils';
import { TERRAIN_MATERIALS } from '../sdf/SDFPrimitives';
import { ICE_TILE_MATERIALS } from './SpecialTiles';
import type { LandTile } from './LandTileSystem';
import { MaterialPresetLibrary } from '@/assets/materials/MaterialPresetLibrary';

// ============================================================================
// Configuration
// ============================================================================

/** Configuration for a single floating ice mesa tile */
export interface FloatingIceTileConfig {
  /** Center position of the ice formation */
  center: THREE.Vector3;
  /** Size (radius) range for the ice mesa [min, max] */
  sizeRange: [number, number];
  /** Height range for the ice mesa [min, max] */
  heightRange: [number, number];
  /** Edge erosion amount (0 = smooth edges, 1 = heavily eroded) */
  edgeErosion: number;
  /** Cliff steepness (0 = gentle slope, 1 = vertical cliff) */
  cliffSteepness: number;
  /** Surface roughness (0 = smooth ice, 1 = very rough) */
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
  /** Whether to apply ice material preset from MaterialPresetLibrary */
  applyIceMaterialPreset: boolean;
}

const DEFAULT_FLOATING_ICE_TILE_CONFIG: FloatingIceTileConfig = {
  center: new THREE.Vector3(0, 0, 0),
  sizeRange: [4.0, 10.0],
  heightRange: [2.0, 8.0],
  edgeErosion: 0.3,
  cliffSteepness: 0.85,
  roughness: 0.4,
  hasFrozenLake: true,
  frozenLakeDepth: 0.3,
  snowCoverage: 0.6,
  seed: 42,
  resolution: 64,
  size: 30,
  applyIceMaterialPreset: true,
};

// ============================================================================
// Ice Material Preset Colors
// ============================================================================

/**
 * Color palette derived from the MaterialPresetLibrary 'ice' and 'snow' presets.
 *
 * The 'ice' preset has: baseColor(0.7, 0.82, 0.9), roughness 0.15, transmission 0.3
 * The 'snow' preset has: baseColor(0.92, 0.94, 0.98), roughness 0.7
 * The 'ice_crystal' preset has: baseColor(0.75, 0.85, 0.95), roughness 0.05, transmission 0.5
 */
const ICE_PRESET_COLORS = {
  iceSurface: { r: 0.80, g: 0.90, b: 0.96 },     // From 'ice' preset baseColor
  iceCliff: { r: 0.70, g: 0.85, b: 0.92 },        // Slightly darker ice on cliffs
  frozenLake: { r: 0.75, g: 0.88, b: 0.95 },       // From 'ice_crystal' preset
  snowCover: { r: 0.92, g: 0.94, b: 0.98 },        // From 'snow' preset baseColor
  stoneBase: { r: 0.35, g: 0.33, b: 0.30 },        // Rocky base beneath ice
} as const;

// ============================================================================
// generateFloatingIceTileMesh
// ============================================================================

/**
 * Generate a FloatingIce mesa tile as a BufferGeometry.
 *
 * Uses the mesa approach:
 * - Flat or slightly concave top surface (ice plateau)
 * - Steep, nearly vertical cliff sides with icy material
 * - Optional frozen lake depression in the center
 * - Edge erosion via ridged noise for natural broken-ice edges
 * - Snow coverage that fades near cliff edges
 *
 * Vertex colors are derived from the MaterialPresetLibrary 'ice' and 'snow'
 * presets when `applyIceMaterialPreset` is enabled.
 *
 * @param config - Ice formation configuration
 * @returns BufferGeometry with positions, normals, UVs, and vertex colors
 */
export function generateFloatingIceTileMesh(
  config: Partial<FloatingIceTileConfig> = {},
): THREE.BufferGeometry {
  const cfg = { ...DEFAULT_FLOATING_ICE_TILE_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);
  const res = cfg.resolution;
  const size = cfg.size;

  // Pick a random radius and height within the configured ranges
  const topRadius = rng.nextFloat(cfg.sizeRange[0], cfg.sizeRange[1]);
  const mesaHeight = rng.nextFloat(cfg.heightRange[0], cfg.heightRange[1]);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const halfSize = size / 2;
  const cx = cfg.center.x;
  const cz = cfg.center.z;
  const baseY = cfg.center.y;
  const topY = baseY + mesaHeight;

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
      const normalizedDist = distFromCenter / topRadius;

      // Mesa height profile with edge erosion
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

        // Edge erosion: ridged noise creates broken-ice edges
        let erosionDisplacement = 0;
        if (normalizedDist > 0.7) {
          const erosionT = (normalizedDist - 0.7) / 0.3;
          const erosionNoise = seededRidgedMultifractal(
            wx * 1.5, topY, wz * 1.5,
            2, 2.0, 0.5, 0.7, cfg.seed + 300,
          );
          erosionDisplacement = erosionNoise * cfg.edgeErosion * erosionT * mesaHeight * 0.15;
        }

        height = topY + topNoise - lakeDepression + erosionDisplacement;
      } else if (normalizedDist <= 1.5) {
        // Steep cliff — transition from top to base
        const cliffT = (normalizedDist - 1.0) / 0.5;

        // Steepness curve controlled by cliffSteepness parameter
        const cliffCurve = Math.pow(cliffT, 1.0 / (1.0 - cfg.cliffSteepness * 0.9 + 0.1));

        // Add roughness to cliff face
        const cliffNoise = seededFbm(
          wx * 1.0 + cfg.seed, wz * 1.0, cliffT * 3.0,
          4, 2.0, 0.5, cfg.seed + 50,
        ) * cfg.roughness * 0.5;

        // Edge erosion on cliff face
        const cliffErosion = seededRidgedMultifractal(
          wx * 2.0, (topY * (1 - cliffT) + baseY * cliffT), wz * 2.0,
          2, 2.0, 0.5, 0.6, cfg.seed + 400,
        ) * cfg.edgeErosion * 0.3 * cliffT;

        height = topY * (1 - cliffCurve) + baseY * cliffCurve + cliffNoise + cliffErosion;
      } else {
        // Base ground with slight variation
        const groundNoise = seededFbm(
          wx * 0.3, 0, wz * 0.3, 2, 2.0, 0.5, cfg.seed + 100,
        ) * 0.3;
        height = baseY + groundNoise;
      }

      // Add ice crack details on icy surfaces
      if (normalizedDist <= 1.2 && height > baseY + mesaHeight * 0.3) {
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
      // Apply MaterialPresetLibrary 'ice' preset colors when enabled
      let r: number, g: number, b: number;

      if (normalizedDist <= 0.6 && cfg.hasFrozenLake) {
        // Frozen lake — 'ice_crystal' preset colors
        r = ICE_PRESET_COLORS.frozenLake.r;
        g = ICE_PRESET_COLORS.frozenLake.g;
        b = ICE_PRESET_COLORS.frozenLake.b;
      } else if (normalizedDist <= 1.0) {
        // Top surface — mix of ice and snow based on snowCoverage
        const snowThreshold = 1.0 - cfg.snowCoverage;
        if (normalizedDist > snowThreshold || rng.next() < cfg.snowCoverage * 0.5) {
          // Snow — 'snow' preset colors
          r = ICE_PRESET_COLORS.snowCover.r;
          g = ICE_PRESET_COLORS.snowCover.g;
          b = ICE_PRESET_COLORS.snowCover.b;
        } else {
          // Ice surface — 'ice' preset colors
          r = ICE_PRESET_COLORS.iceSurface.r;
          g = ICE_PRESET_COLORS.iceSurface.g;
          b = ICE_PRESET_COLORS.iceSurface.b;
        }
      } else if (normalizedDist <= 1.5) {
        // Cliff face — icy blue transitioning to stone
        const stoneMix = (normalizedDist - 1.0) / 0.5;
        r = ICE_PRESET_COLORS.iceCliff.r * (1 - stoneMix) + ICE_PRESET_COLORS.stoneBase.r * stoneMix;
        g = ICE_PRESET_COLORS.iceCliff.g * (1 - stoneMix) + ICE_PRESET_COLORS.stoneBase.g * stoneMix;
        b = ICE_PRESET_COLORS.iceCliff.b * (1 - stoneMix) + ICE_PRESET_COLORS.stoneBase.b * stoneMix;
      } else {
        // Base ground
        r = ICE_PRESET_COLORS.stoneBase.r;
        g = ICE_PRESET_COLORS.stoneBase.g;
        b = ICE_PRESET_COLORS.stoneBase.b;
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

  // Store material preset info in userData for downstream material assignment
  if (cfg.applyIceMaterialPreset) {
    const library = new MaterialPresetLibrary();
    const icePreset = library.getPreset('ice');
    const snowPreset = library.getPreset('snow');
    geometry.userData = {
      ...geometry.userData,
      materialPresets: {
        top: snowPreset?.id ?? 'snow',
        cliff: icePreset?.id ?? 'ice',
        lake: 'ice_crystal',
        base: 'mountain_rock',
      },
      tileType: 'floating_ice',
    };
  }

  return geometry;
}

// ============================================================================
// generateFloatingIceLandTile
// ============================================================================

/**
 * Generate a FloatingIce tile as a proper LandTile for use with LandTileComposer.
 *
 * Creates a `LandTile` with a heightmap representing a mesa-based ice
 * formation. Uses the 'ice' material preset from MaterialPresetLibrary for
 * the surface, with 'snow' on top and 'ice_crystal' for frozen lake areas.
 *
 * Parameters:
 * - sizeRange: [min, max] radius of the ice mesa
 * - heightRange: [min, max] height of the mesa
 * - edgeErosion: amount of erosion at the mesa edges
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
  config: Partial<FloatingIceTileConfig> = {},
): LandTile {
  const cfg: FloatingIceTileConfig = {
    ...DEFAULT_FLOATING_ICE_TILE_CONFIG,
    ...config,
    center: new THREE.Vector3(x + size / 2, 0, z + size / 2),
    size,
    resolution: config.resolution ?? 64,
  };

  const res = cfg.resolution;
  const rng = new SeededRandom(cfg.seed);
  const heightmap = new Float32Array(res * res);

  // Pick a random radius and height within the configured ranges
  const topRadius = rng.nextFloat(cfg.sizeRange[0], cfg.sizeRange[1]);
  const mesaHeight = rng.nextFloat(cfg.heightRange[0], cfg.heightRange[1]);

  const halfSize = size / 2;
  const cx = cfg.center.x;
  const cz = cfg.center.z;
  const baseY = 0;
  const topY = mesaHeight;

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
      const normalizedDist = distFromCenter / topRadius;

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

        // Edge erosion
        let erosionDisplacement = 0;
        if (normalizedDist > 0.7) {
          const erosionT = (normalizedDist - 0.7) / 0.3;
          const erosionNoise = seededRidgedMultifractal(
            wx * 1.5, topY, wz * 1.5,
            2, 2.0, 0.5, 0.7, cfg.seed + 300,
          );
          erosionDisplacement = erosionNoise * cfg.edgeErosion * erosionT * mesaHeight * 0.15;
        }

        height = topY + topNoise - lakeDepression + erosionDisplacement;
      } else if (normalizedDist <= 1.5) {
        const cliffT = (normalizedDist - 1.0) / 0.5;
        const cliffCurve = Math.pow(cliffT, 1.0 / (1.0 - cfg.cliffSteepness * 0.9 + 0.1));

        const cliffNoise = seededFbm(
          wx * 1.0 + cfg.seed, wz * 1.0, cliffT * 3.0,
          4, 2.0, 0.5, cfg.seed + 50,
        ) * cfg.roughness * 0.5;

        // Edge erosion on cliff face
        const cliffErosion = seededRidgedMultifractal(
          wx * 2.0, (topY * (1 - cliffT) + baseY * cliffT), wz * 2.0,
          2, 2.0, 0.5, 0.6, cfg.seed + 400,
        ) * cfg.edgeErosion * 0.3 * cliffT;

        height = topY * (1 - cliffCurve) + baseY * cliffCurve + cliffNoise + cliffErosion;
      } else {
        const groundNoise = seededFbm(
          wx * 0.3, 0, wz * 0.3, 2, 2.0, 0.5, cfg.seed + 100,
        ) * 0.3;
        height = baseY + groundNoise;
      }

      // Ice cracks
      if (normalizedDist <= 1.2 && height > baseY + mesaHeight * 0.3) {
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

  // Normalize heightmap to [0, 1]
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
