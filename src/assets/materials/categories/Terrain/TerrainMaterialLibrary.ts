/**
 * Terrain Material Library
 *
 * Comprehensive terrain material generators matching Infinigen's terrain materials.
 * Produces color, normal, and roughness texture maps using per-pixel noise
 * for 12 distinct terrain types: ChunkyRock, CobbleStone, CrackedGround, Dirt,
 * Ice, Mountain, Mud, Sand, Sandstone, Soil, Stone, and Snow.
 *
 * Uses MeshPhysicalMaterial when subsurface scattering or clearcoat is needed
 * (Ice, Snow, Mud), otherwise MeshStandardMaterial.
 */
import { createCanvas } from '../../../utils/CanvasUtils';
import {
  Color, Texture, CanvasTexture, Material,
  MeshStandardMaterial, MeshPhysicalMaterial,
} from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D, fbm } from '../../../../core/util/math/noise';

// ============================================================================
// Types
// ============================================================================

/** All supported terrain material types */
export type TerrainType =
  | 'ChunkyRock'
  | 'CobbleStone'
  | 'CrackedGround'
  | 'Dirt'
  | 'Ice'
  | 'Mountain'
  | 'Mud'
  | 'Sand'
  | 'Sandstone'
  | 'Soil'
  | 'Stone'
  | 'Snow';

/** Parameters for terrain material generation */
export interface TerrainParams {
  [key: string]: unknown;
  type: TerrainType;
  color: Color;
  roughness: number;
  moisture: number;
  scale: number;
  detail: number;
  seed: number;
}

// ============================================================================
// Preset Definitions
// ============================================================================

const TERRAIN_PRESETS: Record<string, Partial<TerrainParams>> = {
  chunky_rock_warm: {
    type: 'ChunkyRock',
    color: new Color(0x8b7355),
    roughness: 0.92,
    moisture: 0.05,
    scale: 1.0,
    detail: 0.7,
  },
  chunky_rock_cool: {
    type: 'ChunkyRock',
    color: new Color(0x6b6b6b),
    roughness: 0.88,
    moisture: 0.1,
    scale: 0.8,
    detail: 0.6,
  },
  cobblestone_dry: {
    type: 'CobbleStone',
    color: new Color(0x8a8070),
    roughness: 0.75,
    moisture: 0.05,
    scale: 1.0,
    detail: 0.6,
  },
  cobblestone_mossy: {
    type: 'CobbleStone',
    color: new Color(0x7a7a68),
    roughness: 0.82,
    moisture: 0.4,
    scale: 1.0,
    detail: 0.7,
  },
  cracked_ground_dry: {
    type: 'CrackedGround',
    color: new Color(0xb8956a),
    roughness: 0.95,
    moisture: 0.0,
    scale: 1.0,
    detail: 0.8,
  },
  cracked_ground_wet: {
    type: 'CrackedGround',
    color: new Color(0x8b6b4a),
    roughness: 0.7,
    moisture: 0.25,
    scale: 1.0,
    detail: 0.7,
  },
  dirt_dry: {
    type: 'Dirt',
    color: new Color(0x6b4226),
    roughness: 0.95,
    moisture: 0.05,
    scale: 1.0,
    detail: 0.5,
  },
  dirt_wet: {
    type: 'Dirt',
    color: new Color(0x4a2e1a),
    roughness: 0.7,
    moisture: 0.5,
    scale: 1.0,
    detail: 0.5,
  },
  ice_clear: {
    type: 'Ice',
    color: new Color(0xc8dce8),
    roughness: 0.05,
    moisture: 0.0,
    scale: 1.0,
    detail: 0.6,
  },
  ice_frosted: {
    type: 'Ice',
    color: new Color(0xdde8ef),
    roughness: 0.25,
    moisture: 0.0,
    scale: 0.8,
    detail: 0.7,
  },
  mountain_granite: {
    type: 'Mountain',
    color: new Color(0x808080),
    roughness: 0.85,
    moisture: 0.05,
    scale: 1.0,
    detail: 0.6,
  },
  mountain_snowy: {
    type: 'Mountain',
    color: new Color(0x9a9a9a),
    roughness: 0.75,
    moisture: 0.1,
    scale: 1.2,
    detail: 0.5,
  },
  mud_wet: {
    type: 'Mud',
    color: new Color(0x4a3a28),
    roughness: 0.35,
    moisture: 0.8,
    scale: 1.0,
    detail: 0.6,
  },
  mud_drying: {
    type: 'Mud',
    color: new Color(0x6b5440),
    roughness: 0.6,
    moisture: 0.4,
    scale: 1.0,
    detail: 0.5,
  },
  sand_desert: {
    type: 'Sand',
    color: new Color(0xd4a853),
    roughness: 0.9,
    moisture: 0.0,
    scale: 1.0,
    detail: 0.6,
  },
  sand_beach: {
    type: 'Sand',
    color: new Color(0xe8cc8a),
    roughness: 0.85,
    moisture: 0.1,
    scale: 0.8,
    detail: 0.5,
  },
  sandstone_red: {
    type: 'Sandstone',
    color: new Color(0xc47a4a),
    roughness: 0.82,
    moisture: 0.02,
    scale: 1.0,
    detail: 0.7,
  },
  sandstone_layered: {
    type: 'Sandstone',
    color: new Color(0xc9a86c),
    roughness: 0.78,
    moisture: 0.05,
    scale: 1.2,
    detail: 0.8,
  },
  soil_rich: {
    type: 'Soil',
    color: new Color(0x3a2816),
    roughness: 0.92,
    moisture: 0.2,
    scale: 1.0,
    detail: 0.6,
  },
  soil_loam: {
    type: 'Soil',
    color: new Color(0x5a4230),
    roughness: 0.88,
    moisture: 0.3,
    scale: 1.0,
    detail: 0.5,
  },
  stone_gray: {
    type: 'Stone',
    color: new Color(0x888888),
    roughness: 0.75,
    moisture: 0.05,
    scale: 1.0,
    detail: 0.5,
  },
  stone_mossy: {
    type: 'Stone',
    color: new Color(0x7a8a7a),
    roughness: 0.8,
    moisture: 0.25,
    scale: 1.0,
    detail: 0.6,
  },
  snow_fresh: {
    type: 'Snow',
    color: new Color(0xf0f4f8),
    roughness: 0.6,
    moisture: 0.0,
    scale: 1.0,
    detail: 0.4,
  },
  snow_packed: {
    type: 'Snow',
    color: new Color(0xd8dfe8),
    roughness: 0.45,
    moisture: 0.05,
    scale: 1.0,
    detail: 0.5,
  },
};

// ============================================================================
// TerrainMaterialLibrary
// ============================================================================

export class TerrainMaterialLibrary extends BaseMaterialGenerator<TerrainParams> {
  private static readonly DEFAULT_PARAMS: TerrainParams = {
    type: 'Stone',
    color: new Color(0x888888),
    roughness: 0.75,
    moisture: 0.1,
    scale: 1.0,
    detail: 0.5,
    seed: 42,
  };

  constructor(seed?: number) {
    super(seed);
  }

  getDefaultParams(): TerrainParams {
    return { ...TerrainMaterialLibrary.DEFAULT_PARAMS };
  }

  // --------------------------------------------------------------------------
  // Main generate method
  // --------------------------------------------------------------------------

  generate(params: Partial<TerrainParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(TerrainMaterialLibrary.DEFAULT_PARAMS, params);
    const effectiveSeed = seed ?? finalParams.seed;
    const rng = new SeededRandom(effectiveSeed);

    // Determine if MeshPhysicalMaterial is needed
    const needsPhysical =
      finalParams.type === 'Ice' ||
      finalParams.type === 'Snow' ||
      finalParams.type === 'Mud';

    // Generate texture maps
    const map = this.generateColorMap(finalParams, rng);
    const normalMap = this.generateNormalMap(finalParams, rng);
    const roughnessMap = this.generateRoughnessMap(finalParams, rng);

    let material: Material;

    if (needsPhysical) {
      const phys = new MeshPhysicalMaterial({
        color: finalParams.color,
        roughness: finalParams.roughness,
        metalness: 0.0,
        map,
        normalMap,
        roughnessMap,
      });

      // Terrain-specific physical properties
      switch (finalParams.type) {
        case 'Ice':
          phys.transmission = 0.3;
          phys.thickness = 1.5;
          phys.ior = 1.31;
          phys.clearcoat = 0.8;
          phys.clearcoatRoughness = 0.1;
          break;
        case 'Snow':
          phys.sheen = 0.5;
          phys.sheenRoughness = 0.8;
          phys.sheenColor = new Color(0xe8f0ff);
          phys.clearcoat = 0.1;
          phys.clearcoatRoughness = 0.6;
          break;
        case 'Mud':
          phys.clearcoat = 0.3 * finalParams.moisture;
          phys.clearcoatRoughness = 0.4;
          break;
      }
      material = phys;
    } else {
      material = new MeshStandardMaterial({
        color: finalParams.color,
        roughness: finalParams.roughness,
        metalness: 0.0,
        map,
        normalMap,
        roughnessMap,
      });
    }

    return { material, maps: { map, roughnessMap, normalMap }, params: finalParams };
  }

  // ==========================================================================
  // Color Map Generation — dispatches per terrain type
  // ==========================================================================

  private generateColorMap(params: TerrainParams, rng: SeededRandom): Texture {
    switch (params.type) {
      case 'ChunkyRock':   return this.generateChunkyRockTexture(params, rng);
      case 'CobbleStone':  return this.generateCobbleStoneTexture(params, rng);
      case 'CrackedGround':return this.generateCrackedGroundTexture(params, rng);
      case 'Dirt':         return this.generateDirtTexture(params, rng);
      case 'Ice':          return this.generateIceTexture(params, rng);
      case 'Mountain':     return this.generateMountainTexture(params, rng);
      case 'Mud':          return this.generateMudTexture(params, rng);
      case 'Sand':         return this.generateSandTexture(params, rng);
      case 'Sandstone':    return this.generateSandstoneTexture(params, rng);
      case 'Soil':         return this.generateSoilTexture(params, rng);
      case 'Stone':        return this.generateStoneTexture(params, rng);
      case 'Snow':         return this.generateSnowTexture(params, rng);
      default:             return this.generateStoneTexture(params, rng);
    }
  }

  // --------------------------------------------------------------------------
  // 1. ChunkyRock — Large rocky boulders, rough with deep crevices
  // --------------------------------------------------------------------------

  private generateChunkyRockTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Large-scale boulder shapes via ridged noise
        const boulder = fbm(u * 3 * sc, v * 3 * sc, 0, 6, 2.0, 0.5, 1.0);
        const boulderShape = Math.abs(boulder) * 40;

        // Deep crevices — dark lines where boulders meet
        const crevice = fbm(u * 5 * sc, v * 5 * sc, 1.5, 4, 2.0, 0.6, 1.0);
        const creviceDepth = crevice < -0.4 ? (crevice + 0.4) * 80 : 0;

        // Medium-scale surface roughness
        const rough1 = noise.perlin(x / (30 * sc), y / (30 * sc), 0) * 18;
        const rough2 = noise.perlin(x / (12 * sc), y / (12 * sc), 1) * 8;

        // Warm/cool rock color variation
        const warmCool = noise.perlin(x / (200 * sc), y / (200 * sc), 2) * 15;

        // Mineral deposits — occasional bright speckles
        const mineral = noise.perlin(x / (8 * sc), y / (8 * sc), 3);
        const mineralFactor = mineral > 0.82 ? (mineral - 0.82) * 50 : 0;

        const r = baseR + boulderShape - creviceDepth + rough1 + rough2 + warmCool + mineralFactor;
        const g = baseG + boulderShape - creviceDepth + rough1 + rough2 + warmCool * 0.8 + mineralFactor * 0.7;
        const b = baseB + boulderShape - creviceDepth + rough1 + rough2 + warmCool * 0.6 + mineralFactor * 0.5;

        data[idx]     = Math.max(0, Math.min(255, r));
        data[idx + 1] = Math.max(0, Math.min(255, g));
        data[idx + 2] = Math.max(0, Math.min(255, b));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 2. CobbleStone — Rounded stone patterns with moss-filled gaps
  // --------------------------------------------------------------------------

  private generateCobbleStoneTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const noise2 = new Noise3D(rng.seed + 100);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;
    const moisture = params.moisture;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Voronoi-like cobble pattern via high-frequency fbm
        const cell = fbm(u * 8 * sc, v * 8 * sc, 0, 3, 2.0, 0.5, 1.0);
        const cell2 = fbm(u * 8 * sc + 5.3, v * 8 * sc + 1.7, 0, 3, 2.0, 0.5, 1.0);

        // Gap detection — where two cells meet
        const edge = Math.abs(cell - cell2);
        const isGap = edge < 0.08;

        // Individual cobble surface variation
        const cobbleVar = noise.perlin(x / (20 * sc), y / (20 * sc), 0) * 15;
        const cobbleFine = noise.perlin(x / (6 * sc), y / (6 * sc), 1) * 5;

        // Color per cobble — slight hue variation
        const cobbleHue = noise.perlin(x / (80 * sc), y / (80 * sc), 2) * 12;

        // Moss in gaps (green tint)
        const mossStrength = moisture * (isGap ? 0.8 : 0);
        const mossGreen = isGap ? mossStrength * 40 : 0;

        // Weathering — darker patches on older cobbles
        const weather = noise.perlin(x / (150 * sc), y / (150 * sc), 3);
        const weatherFactor = weather < -0.3 ? (weather + 0.3) * 20 : 0;

        if (isGap) {
          // Gap color — dark with possible moss
          const gapDark = -35;
          data[idx]     = Math.max(0, Math.min(255, baseR + gapDark + mossGreen * 0.3));
          data[idx + 1] = Math.max(0, Math.min(255, baseG + gapDark + mossGreen));
          data[idx + 2] = Math.max(0, Math.min(255, baseB + gapDark + mossGreen * 0.2));
        } else {
          const r = baseR + cobbleVar + cobbleFine + cobbleHue + weatherFactor;
          const g = baseG + cobbleVar + cobbleFine + cobbleHue * 0.9 + weatherFactor;
          const b = baseB + cobbleVar + cobbleFine + cobbleHue * 0.8 + weatherFactor;
          data[idx]     = Math.max(0, Math.min(255, r));
          data[idx + 1] = Math.max(0, Math.min(255, g));
          data[idx + 2] = Math.max(0, Math.min(255, b));
        }
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 3. CrackedGround — Dry earth with polygonal crack patterns
  // --------------------------------------------------------------------------

  private generateCrackedGroundTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Polygonal crack pattern using domain-warped fbm
        // Domain warp to create irregular polygon edges
        const warpX = noise.perlin(u * 6 * sc, v * 6 * sc, 0) * 0.08;
        const warpY = noise.perlin(u * 6 * sc + 3.7, v * 6 * sc + 7.2, 0) * 0.08;

        const warpedU = u + warpX;
        const warpedV = v + warpY;

        // Cracks as sharp lines from ridged multifractal
        const crack = fbm(warpedU * 10 * sc, warpedV * 10 * sc, 0, 5, 2.3, 0.55, 1.0);
        const crackLine = Math.abs(crack);
        const isCrack = crackLine < 0.04;
        const crackDepth = isCrack ? (0.04 - crackLine) * 600 : 0;

        // Ground surface variation
        const surfaceVar = noise.perlin(x / (60 * sc), y / (60 * sc), 1) * 10;
        const surfaceFine = noise.perlin(x / (15 * sc), y / (15 * sc), 2) * 5;

        // Dried earth tone variation
        const toneShift = noise.perlin(x / (200 * sc), y / (200 * sc), 3) * 12;

        // Small pebble/dust accents
        const pebble = noise.perlin(x / (4 * sc), y / (4 * sc), 4);
        const pebbleFactor = pebble > 0.85 ? (pebble - 0.85) * 30 : 0;

        if (isCrack) {
          // Dark crack interior
          data[idx]     = Math.max(0, Math.min(255, baseR * 0.4 - crackDepth));
          data[idx + 1] = Math.max(0, Math.min(255, baseG * 0.35 - crackDepth));
          data[idx + 2] = Math.max(0, Math.min(255, baseB * 0.3 - crackDepth));
        } else {
          const r = baseR + surfaceVar + surfaceFine + toneShift + pebbleFactor;
          const g = baseG + surfaceVar + surfaceFine + toneShift * 0.9 + pebbleFactor * 0.8;
          const b = baseB + surfaceVar + surfaceFine + toneShift * 0.7 + pebbleFactor * 0.6;
          data[idx]     = Math.max(0, Math.min(255, r));
          data[idx + 1] = Math.max(0, Math.min(255, g));
          data[idx + 2] = Math.max(0, Math.min(255, b));
        }
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 4. Dirt — Soft earth with subtle grain
  // --------------------------------------------------------------------------

  private generateDirtTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Large-scale color variation (soil patches)
        const patch = noise.perlin(x / (200 * sc), y / (200 * sc), 0) * 15;

        // Medium-scale clumping
        const clump = noise.perlin(x / (50 * sc), y / (50 * sc), 1) * 10;

        // Fine grain texture
        const grain = noise.perlin(x / (10 * sc), y / (10 * sc), 2) * 6;
        const microGrain = noise.perlin(x / (3 * sc), y / (3 * sc), 3) * 3;

        // Organic matter specks (darker spots)
        const organic = noise.perlin(x / (20 * sc), y / (20 * sc), 4);
        const organicFactor = organic < -0.5 ? (organic + 0.5) * 25 : 0;

        // Small stone inclusions
        const stone = noise.perlin(x / (7 * sc), y / (7 * sc), 5);
        const stoneFactor = stone > 0.8 ? (stone - 0.8) * 40 : 0;

        const totalNoise = patch + clump + grain + microGrain + organicFactor + stoneFactor;

        data[idx]     = Math.max(0, Math.min(255, baseR + totalNoise));
        data[idx + 1] = Math.max(0, Math.min(255, baseG + totalNoise * 0.85));
        data[idx + 2] = Math.max(0, Math.min(255, baseB + totalNoise * 0.7));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 5. Ice — Smooth ice with fractures and subsurface scattering
  // --------------------------------------------------------------------------

  private generateIceTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Fracture lines — thin branching cracks
        const fracture = fbm(u * 8 * sc, v * 8 * sc, 0, 5, 2.2, 0.45, 1.0);
        const fractureLine = Math.abs(fracture);
        const isFracture = fractureLine < 0.03;
        const fractureDepth = isFracture ? (0.03 - fractureLine) * 800 : 0;

        // Subsurface color variation (bluish depth)
        const depth = noise.perlin(x / (100 * sc), y / (100 * sc), 0) * 12;

        // Ice crystalline structure — faint directional patterns
        const crystal = noise.perlin(x / (25 * sc), y / (60 * sc), 1) * 6;

        // Frosted areas — white patches
        const frost = noise.perlin(x / (80 * sc), y / (80 * sc), 2);
        const frostFactor = frost > 0.5 ? (frost - 0.5) * 30 : 0;

        // Internal bubble inclusions
        const bubble = noise.perlin(x / (30 * sc), y / (30 * sc), 3);
        const bubbleFactor = bubble > 0.75 ? (bubble - 0.75) * 25 : 0;

        // Subtle blue tint variation
        const blueShift = noise.perlin(x / (150 * sc), y / (150 * sc), 4) * 8;

        if (isFracture) {
          // Fracture lines are brighter and bluish-white
          data[idx]     = Math.max(0, Math.min(255, baseR + 40 + fractureDepth * 0.3));
          data[idx + 1] = Math.max(0, Math.min(255, baseG + 45 + fractureDepth * 0.3));
          data[idx + 2] = Math.max(0, Math.min(255, baseB + 50 + fractureDepth * 0.2));
        } else {
          const r = baseR + depth + crystal + frostFactor + bubbleFactor - blueShift * 0.3;
          const g = baseG + depth + crystal + frostFactor + bubbleFactor;
          const b = baseB + depth + crystal + frostFactor + bubbleFactor + blueShift;
          data[idx]     = Math.max(0, Math.min(255, r));
          data[idx + 1] = Math.max(0, Math.min(255, g));
          data[idx + 2] = Math.max(0, Math.min(255, b));
        }
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 6. Mountain — Rocky mountain face with multi-layer noise, Voronoi cracks,
  //    slope modulation, and height-based coloring
  // --------------------------------------------------------------------------

  private generateMountainTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const noise2 = new Noise3D(rng.seed + 57);
    const noise3 = new Noise3D(rng.seed + 123);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;
    const moisture = params.moisture;

    // Height gradient colors (low→high)
    const colorLow  = { r: 0x6b, g: 0x5e, b: 0x50 };  // warm brown
    const colorMid  = { r: 0x80, g: 0x78, b: 0x70 };  // medium gray
    const colorHigh = { r: 0x9a, g: 0x96, b: 0x92 };  // light gray
    const colorPeak = { r: 0xe8, g: 0xec, b: 0xf4 };  // near-white snow

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // === Layer 1: Large-scale ridged multifractal for craggy macro structure ===
        const rockFace1 = fbm(u * 4 * sc, v * 4 * sc, 0, 7, 2.0, 0.55, 1.0);

        // === Layer 2: Medium-scale heterogeneous terrain noise for surface variation ===
        const rockFace2 = fbm(u * 8 * sc + 3.7, v * 8 * sc + 1.2, 0.5, 5, 2.2, 0.5, 0.8);

        // === Layer 3: Fine-scale Musgrave-like ridged detail ===
        const ridgeDetail = noise.perlin(x / (15 * sc), y / (15 * sc), 0);
        const ridge = 1.0 - Math.abs(ridgeDetail);
        const ridgeFactor = ridge * ridge * 12;

        // Combine multi-layer rock structure
        const rockRelief = rockFace1 * 20 + rockFace2 * 10 + ridgeFactor;

        // === Voronoi cracks ===
        // Approximate Voronoi crack pattern via domain-warped high-frequency noise
        const crackWarpX = noise2.perlin(u * 12 * sc, v * 12 * sc, 0) * 0.03;
        const crackWarpY = noise2.perlin(u * 12 * sc + 5.3, v * 12 * sc + 2.1, 0) * 0.03;
        const crackNoise = fbm(
          (u + crackWarpX) * 15 * sc,
          (v + crackWarpY) * 15 * sc,
          1.0, 4, 2.5, 0.5, 1.0,
        );
        const crackLine = Math.abs(crackNoise);
        const isCrack = crackLine < 0.03;
        const crackDepth = isCrack ? (0.03 - crackLine) * 500 : 0;

        // === Slope modulation (simulated from gradient of height field) ===
        const heightL = noise3.perlin((x - 1) / (40 * sc), y / (40 * sc), 0);
        const heightR = noise3.perlin((x + 1) / (40 * sc), y / (40 * sc), 0);
        const heightU = noise3.perlin(x / (40 * sc), (y - 1) / (40 * sc), 0);
        const heightD = noise3.perlin(x / (40 * sc), (y + 1) / (40 * sc), 0);
        const slopeX = heightR - heightL;
        const slopeY = heightD - heightU;
        const slopeMag = Math.sqrt(slopeX * slopeX + slopeY * slopeY);
        // Steep slopes get more rock texture, flat areas get smoother
        const slopeMod = Math.min(1, slopeMag * 8);

        // === Height-based coloring ===
        // Simulated altitude via low-frequency noise
        const altitudeNoise = noise3.perlin(x / (300 * sc), y / (300 * sc), 1);
        const simulatedAlt = (v + altitudeNoise * 0.15); // 0 = bottom, 1 = top

        // Interpolate height gradient colors
        let gradR: number, gradG: number, gradB: number;
        if (simulatedAlt < 0.3) {
          const t = simulatedAlt / 0.3;
          gradR = colorLow.r * (1 - t) + colorMid.r * t;
          gradG = colorLow.g * (1 - t) + colorMid.g * t;
          gradB = colorLow.b * (1 - t) + colorMid.b * t;
        } else if (simulatedAlt < 0.65) {
          const t = (simulatedAlt - 0.3) / 0.35;
          gradR = colorMid.r * (1 - t) + colorHigh.r * t;
          gradG = colorMid.g * (1 - t) + colorHigh.g * t;
          gradB = colorMid.b * (1 - t) + colorHigh.b * t;
        } else {
          const t = (simulatedAlt - 0.65) / 0.35;
          gradR = colorHigh.r * (1 - t) + colorPeak.r * t;
          gradG = colorHigh.g * (1 - t) + colorPeak.g * t;
          gradB = colorHigh.b * (1 - t) + colorPeak.b * t;
        }

        // === Rock grain and strata ===
        const grain = noise.perlin(x / (8 * sc), y / (8 * sc), 3) * 8 * slopeMod;
        const microGrain = noise.perlin(x / (3 * sc), y / (3 * sc), 4) * 3;

        // Rock strata — horizontal lines with warp
        const strataWarp = noise.perlin(x / (250 * sc), y / (250 * sc), 5) * 15;
        const strataVal = Math.sin((y + strataWarp) / (40 * sc) * Math.PI * 2);
        const strataLine = Math.abs(strataVal) < 0.05 ? -12 : 0;

        // === Lichen/moss on flatter surfaces ===
        const lichen = noise.perlin(x / (60 * sc), y / (60 * sc), 0);
        const lichenFactor = (lichen > 0.5 && moisture > 0.1 && slopeMag < 0.15)
          ? (lichen - 0.5) * 20 * moisture
          : 0;

        // === Snow accumulation — on flat-ish areas above simulated snow line ===
        const snowMask = noise.perlin(x / (120 * sc), y / (120 * sc), 1);
        const snowDetail = noise.perlin(x / (20 * sc), y / (20 * sc), 2);
        const snowThreshold = simulatedAlt > 0.7 ? 0.2 : 0.5;
        const snowAmount = (snowMask > snowThreshold && snowDetail > 0.1 && slopeMag < 0.2)
          ? (snowMask - snowThreshold) * 80
          : 0;

        // === Compose rock color with slope + height modulation ===
        const rockR = gradR + rockRelief + grain + microGrain + strataLine + lichenFactor * 0.3 - crackDepth;
        const rockG = gradG + rockRelief + grain + microGrain + strataLine + lichenFactor - crackDepth;
        const rockB = gradB + rockRelief + grain + microGrain + strataLine + lichenFactor * 0.4 - crackDepth;

        // Snow is white with faint blue shadows
        const snowR = 235 + snowDetail * 5;
        const snowG = 238 + snowDetail * 4;
        const snowB = 245 + snowDetail * 3;

        const snowBlend = Math.min(1, snowAmount / 20);

        // Final blend: crack areas stay dark
        if (isCrack) {
          data[idx]     = Math.max(0, Math.min(255, gradR * 0.3 - crackDepth));
          data[idx + 1] = Math.max(0, Math.min(255, gradG * 0.25 - crackDepth));
          data[idx + 2] = Math.max(0, Math.min(255, gradB * 0.2 - crackDepth));
        } else {
          data[idx]     = Math.max(0, Math.min(255, rockR * (1 - snowBlend) + snowR * snowBlend));
          data[idx + 1] = Math.max(0, Math.min(255, rockG * (1 - snowBlend) + snowG * snowBlend));
          data[idx + 2] = Math.max(0, Math.min(255, rockB * (1 - snowBlend) + snowB * snowBlend));
        }
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 7. Mud — Wet mud with puddle patterns
  // --------------------------------------------------------------------------

  private generateMudTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;
    const moisture = params.moisture;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Puddle regions — low areas where water collects
        const puddle = noise.perlin(x / (150 * sc), y / (150 * sc), 0);
        const isPuddle = puddle < -0.2;
        const puddleWetness = isPuddle ? Math.min(1, (-puddle - 0.2) * 3) * moisture : 0;

        // Wet vs dry color — wet is darker and more saturated
        const wetDarken = puddleWetness * 40;

        // Drying cracks around puddles
        const crackZone = noise.perlin(x / (25 * sc), y / (25 * sc), 1);
        const nearPuddle = puddle > -0.25 && puddle < -0.1;
        const isCrack = nearPuddle && Math.abs(crackZone) < 0.06;
        const crackFactor = isCrack ? -20 : 0;

        // Mud surface texture — smooth with subtle undulations
        const surface = noise.perlin(x / (40 * sc), y / (40 * sc), 2) * 8;
        const fineDetail = noise.perlin(x / (12 * sc), y / (12 * sc), 3) * 4;

        // Footprint/animal track impressions
        const track = noise.perlin(x / (80 * sc), y / (80 * sc), 4);
        const trackFactor = track < -0.6 ? (track + 0.6) * 15 : 0;

        // Reflection sheen in puddle areas
        const sheen = isPuddle ? noise.perlin(x / (30 * sc), y / (30 * sc), 5) * 10 * moisture : 0;

        const r = baseR - wetDarken + surface + fineDetail + crackFactor + trackFactor + sheen;
        const g = baseG - wetDarken + surface + fineDetail + crackFactor + trackFactor + sheen * 0.8;
        const b = baseB - wetDarken * 0.7 + surface + fineDetail + crackFactor + trackFactor + sheen * 0.6;

        data[idx]     = Math.max(0, Math.min(255, r));
        data[idx + 1] = Math.max(0, Math.min(255, g));
        data[idx + 2] = Math.max(0, Math.min(255, b));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 8. Sand — Fine sand with wind ripple patterns
  // --------------------------------------------------------------------------

  private generateSandTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Wind ripple patterns — elongated diagonal waves
        const rippleAngle = 0.4 + noise.perlin(x / (300 * sc), y / (300 * sc), 0) * 0.2;
        const diagCoord = x * Math.cos(rippleAngle) + y * Math.sin(rippleAngle);
        const rippleWarp = noise.perlin(x / (200 * sc), y / (200 * sc), 1) * 15;
        const ripple = Math.sin((diagCoord + rippleWarp) / (8 * sc) * Math.PI * 2);
        const rippleShading = ripple * 8;

        // Fine sand grain
        const grain = noise.perlin(x / (4 * sc), y / (4 * sc), 2) * 6;
        const microGrain = noise.perlin(x / (2 * sc), y / (2 * sc), 3) * 2;

        // Large dune color variation
        const duneVar = noise.perlin(x / (250 * sc), y / (250 * sc), 4) * 10;

        // Wet sand near water (darker band)
        const wetBand = noise.perlin(x / (400 * sc), y / (400 * sc), 5);
        const wetFactor = (wetBand < -0.4 && params.moisture > 0) ? (wetBand + 0.4) * 30 * params.moisture : 0;

        // Wind shadow (lighter on windward side of ripples)
        const shadow = ripple > 0.3 ? 5 : ripple < -0.3 ? -5 : 0;

        // Shell/pebble accents
        const shell = noise.perlin(x / (15 * sc), y / (15 * sc), 6);
        const shellFactor = shell > 0.85 ? (shell - 0.85) * 25 : 0;

        const totalR = baseR + rippleShading + grain + microGrain + duneVar - wetFactor + shadow + shellFactor;
        const totalG = baseG + rippleShading + grain + microGrain + duneVar - wetFactor * 0.9 + shadow + shellFactor * 0.9;
        const totalB = baseB + rippleShading + grain + microGrain + duneVar - wetFactor * 0.7 + shadow + shellFactor * 0.7;

        data[idx]     = Math.max(0, Math.min(255, totalR));
        data[idx + 1] = Math.max(0, Math.min(255, totalG));
        data[idx + 2] = Math.max(0, Math.min(255, totalB));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 9. Sandstone — Layered sandstone with erosion
  // --------------------------------------------------------------------------

  private generateSandstoneTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;

    // Layer colors for alternating bands
    const layerColors = [
      { r: baseR, g: baseG, b: baseB },
      { r: baseR * 0.85, g: baseG * 0.82, b: baseB * 0.75 },   // darker band
      { r: baseR * 1.1, g: baseG * 1.0, b: baseB * 0.9 },      // lighter band
      { r: baseR * 0.75, g: baseG * 0.7, b: baseB * 0.6 },     // deep rust band
    ];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Horizontal sedimentary layers with warping
        const layerWarp = noise.perlin(x / (300 * sc), y / (300 * sc), 0) * 20;
        const layerWarp2 = noise.perlin(x / (150 * sc), y / (150 * sc), 1) * 8;
        const layerCoord = (y + layerWarp + layerWarp2) / (35 * sc);
        const layerIdx = Math.abs(Math.floor(layerCoord)) % layerColors.length;
        const layerFrac = layerCoord - Math.floor(layerCoord);

        // Layer color with smooth interpolation
        const nextIdx = (layerIdx + 1) % layerColors.length;
        const lc = layerColors[layerIdx];
        const lcn = layerColors[nextIdx];
        const t = Math.max(0, Math.min(1, layerFrac * 3)); // sharp transitions
        const layerR = lc.r * (1 - t) + lcn.r * t;
        const layerG = lc.g * (1 - t) + lcn.g * t;
        const layerB = lc.b * (1 - t) + lcn.b * t;

        // Erosion — rounded pockets and cavities
        const erosion = noise.perlin(x / (40 * sc), y / (40 * sc), 2);
        const erosionFactor = erosion > 0.65 ? (erosion - 0.65) * 60 : 0;

        // Cross-bedding — angled lines within layers
        const crossbed = Math.sin((x * 0.7 + y * 0.3 + noise.perlin(x / (80 * sc), y / (80 * sc), 3) * 20) / (12 * sc) * Math.PI * 2);
        const crossbedLine = Math.abs(crossbed) < 0.04 ? -15 : 0;

        // Surface grain
        const grain = noise.perlin(x / (6 * sc), y / (6 * sc), 4) * 5;

        // Desert varnish — darker patina on exposed surfaces
        const varnish = noise.perlin(x / (200 * sc), y / (200 * sc), 5);
        const varnishFactor = varnish > 0.3 ? (varnish - 0.3) * 15 : 0;

        data[idx]     = Math.max(0, Math.min(255, layerR - erosionFactor + crossbedLine + grain - varnishFactor));
        data[idx + 1] = Math.max(0, Math.min(255, layerG - erosionFactor + crossbedLine + grain - varnishFactor * 0.8));
        data[idx + 2] = Math.max(0, Math.min(255, layerB - erosionFactor + crossbedLine + grain - varnishFactor * 0.6));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 10. Soil — Rich dark soil with organic matter
  // --------------------------------------------------------------------------

  private generateSoilTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Large soil patches with organic variation
        const patch = noise.perlin(x / (150 * sc), y / (150 * sc), 0) * 15;

        // Root channels — organic darker streaks
        const root = fbm(x / (80 * sc), y / (80 * sc), 0, 4, 2.0, 0.5, 1.0);
        const rootFactor = root < -0.35 ? (root + 0.35) * 30 : 0;

        // Humus-rich zones (darker, more organic)
        const humus = noise.perlin(x / (60 * sc), y / (60 * sc), 1);
        const humusFactor = humus < -0.3 ? (humus + 0.3) * 20 : 0;

        // Fine soil texture — crumbly particles
        const crumb = noise.perlin(x / (8 * sc), y / (8 * sc), 2) * 7;
        const fineCrumb = noise.perlin(x / (3 * sc), y / (3 * sc), 3) * 3;

        // Small pebbles
        const pebble = noise.perlin(x / (12 * sc), y / (12 * sc), 4);
        const pebbleFactor = pebble > 0.8 ? (pebble - 0.8) * 40 : 0;

        // Worm cast / bioturbation marks
        const bio = noise.perlin(x / (40 * sc), y / (40 * sc), 5);
        const bioFactor = bio > 0.6 ? (bio - 0.6) * 12 : 0;

        const totalNoise = patch - rootFactor - humusFactor + crumb + fineCrumb + pebbleFactor + bioFactor;

        data[idx]     = Math.max(0, Math.min(255, baseR + totalNoise * 0.9));
        data[idx + 1] = Math.max(0, Math.min(255, baseG + totalNoise * 0.8));
        data[idx + 2] = Math.max(0, Math.min(255, baseB + totalNoise * 0.65));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 11. Stone — Generic stone surface, medium gray with slight texture
  // --------------------------------------------------------------------------

  private generateStoneTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;
    const moisture = params.moisture;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Broad stone color variation
        const broad = noise.perlin(x / (120 * sc), y / (120 * sc), 0) * 12;

        // Medium-scale stone texture
        const medium = noise.perlin(x / (30 * sc), y / (30 * sc), 1) * 10;

        // Fine surface grain
        const fine = noise.perlin(x / (8 * sc), y / (8 * sc), 2) * 5;
        const micro = noise.perlin(x / (3 * sc), y / (3 * sc), 3) * 2;

        // Subtle mineral veins
        const vein = fbm(x / (50 * sc), y / (50 * sc), 0, 4, 2.0, 0.5, 1.0);
        const veinFactor = Math.abs(vein) > 0.45 ? 8 : 0;

        // Moss/lichen on damp areas
        const lichen = noise.perlin(x / (60 * sc), y / (60 * sc), 4);
        const lichenFactor = (lichen > 0.55 && moisture > 0.15)
          ? (lichen - 0.55) * 25 * moisture
          : 0;

        // Water staining (darker patches)
        const stain = noise.perlin(x / (180 * sc), y / (180 * sc), 5);
        const stainFactor = stain < -0.35 ? (stain + 0.35) * 20 : 0;

        const totalR = baseR + broad + medium + fine + micro + veinFactor + lichenFactor * 0.3 - stainFactor;
        const totalG = baseG + broad + medium + fine + micro + veinFactor + lichenFactor - stainFactor;
        const totalB = baseB + broad + medium + fine + micro + veinFactor + lichenFactor * 0.4 - stainFactor;

        data[idx]     = Math.max(0, Math.min(255, totalR));
        data[idx + 1] = Math.max(0, Math.min(255, totalG));
        data[idx + 2] = Math.max(0, Math.min(255, totalB));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // --------------------------------------------------------------------------
  // 12. Snow — Fresh snow surface with subtle sparkle
  // --------------------------------------------------------------------------

  private generateSnowTexture(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const sc = params.scale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Snow surface undulations — gentle drifts
        const drift = noise.perlin(x / (150 * sc), y / (150 * sc), 0) * 8;

        // Wind-sculpted surface details
        const windDetail = noise.perlin(x / (40 * sc), y / (20 * sc), 1) * 5;

        // Snow crystal grain — very fine
        const grain = noise.perlin(x / (5 * sc), y / (5 * sc), 2) * 4;

        // Ice crystal sparkle — occasional bright points
        const sparkle = noise.perlin(x / (3 * sc), y / (3 * sc), 3);
        const sparkleFactor = sparkle > 0.88 ? (sparkle - 0.88) * 80 : 0;

        // Blue shadow in depressions
        const shadow = noise.perlin(x / (80 * sc), y / (80 * sc), 4);
        const shadowBlue = shadow < -0.2 ? (shadow + 0.2) * 15 : 0;

        // Dirt/dust contamination
        const dust = noise.perlin(x / (100 * sc), y / (100 * sc), 5);
        const dustFactor = dust > 0.6 ? (dust - 0.6) * 8 : 0;

        // Compaction — slightly darker where snow is compressed
        const compact = noise.perlin(x / (60 * sc), y / (60 * sc), 6);
        const compactFactor = compact > 0.5 ? (compact - 0.5) * 8 : 0;

        const r = baseR + drift + windDetail + grain + sparkleFactor - shadowBlue * 0.5 - dustFactor - compactFactor;
        const g = baseG + drift + windDetail + grain + sparkleFactor - shadowBlue * 0.2 - dustFactor - compactFactor;
        const b = baseB + drift + windDetail + grain + sparkleFactor + shadowBlue - dustFactor * 0.5 - compactFactor;

        data[idx]     = Math.max(0, Math.min(255, r));
        data[idx + 1] = Math.max(0, Math.min(255, g));
        data[idx + 2] = Math.max(0, Math.min(255, b));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // ==========================================================================
  // Normal Map Generation — terrain-specific surface detail
  // ==========================================================================

  private generateNormalMap(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed + 500);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    // Per-type normal map parameters
    const config = this.getNormalMapConfig(params.type, params.scale);
    const sc = config.scale;
    const strength = config.strength;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Compute surface gradient from noise for normal derivation
        const n  = noise.perlin(x / sc, y / sc, 0);
        const nx = noise.perlin((x + 1) / sc, y / sc, 0) - n;
        const ny = noise.perlin(x / sc, (y + 1) / sc, 0) - n;

        // Additional per-type features
        let extraZ = 0;

        switch (params.type) {
          case 'ChunkyRock': {
            // Deep crevice depressions
            const u = x / size;
            const v = y / size;
            const crevice = fbm(u * 5 * params.scale, v * 5 * params.scale, 1.5, 4, 2.0, 0.6, 1.0);
            if (crevice < -0.4) extraZ = (crevice + 0.4) * 1.5;
            break;
          }
          case 'CobbleStone': {
            // Rounded cobble bumps with flat gaps
            const u = x / size;
            const v = y / size;
            const cell = fbm(u * 8 * params.scale, v * 8 * params.scale, 0, 3, 2.0, 0.5, 1.0);
            const cell2 = fbm(u * 8 * params.scale + 5.3, v * 8 * params.scale + 1.7, 0, 3, 2.0, 0.5, 1.0);
            const edge = Math.abs(cell - cell2);
            if (edge < 0.08) extraZ = -0.8; // Gap depression
            break;
          }
          case 'CrackedGround': {
            // Crack depressions
            const u = x / size;
            const v = y / size;
            const crack = fbm(u * 10 * params.scale, v * 10 * params.scale, 0, 5, 2.3, 0.55, 1.0);
            if (Math.abs(crack) < 0.04) extraZ = -1.2;
            break;
          }
          case 'Ice': {
            // Fracture line ridges
            const u = x / size;
            const v = y / size;
            const fracture = fbm(u * 8 * params.scale, v * 8 * params.scale, 0, 5, 2.2, 0.45, 1.0);
            if (Math.abs(fracture) < 0.03) extraZ = 0.8;
            // Smooth surface with slight convexity
            break;
          }
          case 'Mountain': {
            // Craggy rock face with strong relief
            const u = x / size;
            const v = y / size;
            const rockFace = fbm(u * 4 * params.scale, v * 4 * params.scale, 0, 7, 2.0, 0.55, 1.0);
            extraZ = rockFace * 0.3;
            break;
          }
          case 'Mud': {
            // Puddle depressions
            const puddle = noise.perlin(x / (sc * 0.3), y / (sc * 0.3), 1);
            if (puddle < -0.2) extraZ = (puddle + 0.2) * 0.5;
            break;
          }
          case 'Sand': {
            // Wind ripple corrugation
            const rippleAngle = 0.4;
            const diagCoord = x * Math.cos(rippleAngle) + y * Math.sin(rippleAngle);
            const ripple = Math.sin(diagCoord / (8 * params.scale) * Math.PI * 2);
            extraZ = ripple * 0.15;
            break;
          }
          case 'Sandstone': {
            // Layered strata edges
            const strataWarp = noise.perlin(x / (sc * 1.5), y / (sc * 1.5), 1) * 2;
            const strataVal = Math.sin((y / size * 512 + strataWarp * 20) / (35 * params.scale) * Math.PI * 2);
            if (Math.abs(strataVal) < 0.05) extraZ = -0.4;
            // Erosion pockets
            const erosion = noise.perlin(x / (sc * 0.2), y / (sc * 0.2), 2);
            if (erosion > 0.65) extraZ -= (erosion - 0.65) * 1.0;
            break;
          }
          case 'Snow': {
            // Gentle drift undulation
            const drift = noise.perlin(x / (sc * 2), y / (sc * 2), 1);
            extraZ = drift * 0.15;
            // Sparkle bumps
            const sparkle = noise.perlin(x / (sc * 0.1), y / (sc * 0.1), 2);
            if (sparkle > 0.88) extraZ += 0.3;
            break;
          }
          default:
            break;
        }

        // Encode normal: map [-1,1] to [0,255]
        data[idx]     = Math.max(0, Math.min(255, 128 + nx * strength * 128));
        data[idx + 1] = Math.max(0, Math.min(255, 128 + ny * strength * 128));
        data[idx + 2] = Math.max(0, Math.min(255, 255 + extraZ * -50));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  /** Get normal map configuration per terrain type */
  private getNormalMapConfig(type: TerrainType, scale: number): { scale: number; strength: number } {
    const configs: Record<TerrainType, { scale: number; strength: number }> = {
      ChunkyRock:   { scale: 25 * scale, strength: 3.5 },
      CobbleStone:  { scale: 30 * scale, strength: 2.8 },
      CrackedGround:{ scale: 40 * scale, strength: 2.0 },
      Dirt:         { scale: 20 * scale, strength: 1.5 },
      Ice:          { scale: 60 * scale, strength: 0.8 },
      Mountain:     { scale: 35 * scale, strength: 3.0 },
      Mud:          { scale: 30 * scale, strength: 1.2 },
      Sand:         { scale: 25 * scale, strength: 1.5 },
      Sandstone:    { scale: 30 * scale, strength: 2.5 },
      Soil:         { scale: 18 * scale, strength: 1.5 },
      Stone:        { scale: 40 * scale, strength: 2.0 },
      Snow:         { scale: 50 * scale, strength: 1.0 },
    };
    return configs[type];
  }

  // ==========================================================================
  // Roughness Map Generation — terrain-specific surface properties
  // ==========================================================================

  private generateRoughnessMap(params: TerrainParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed + 700);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseRoughness = Math.floor(params.roughness * 255);
    const config = this.getRoughnessConfig(params.type);
    const sc = config.varScale * params.scale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Base roughness variation from noise
        let n = noise.perlin(x / sc, y / sc, 0) * config.variation;

        // Per-type roughness modifications
        switch (params.type) {
          case 'Ice': {
            // Fracture lines are smoother
            const u = x / size;
            const v = y / size;
            const fracture = fbm(u * 8 * params.scale, v * 8 * params.scale, 0, 5, 2.2, 0.45, 1.0);
            if (Math.abs(fracture) < 0.03) n -= 40;
            // Frost patches are rougher
            const frost = noise.perlin(x / (sc * 0.5), y / (sc * 0.5), 1);
            if (frost > 0.5) n += (frost - 0.5) * 30;
            break;
          }
          case 'Mud': {
            // Puddle areas are much smoother (wetter)
            const puddle = noise.perlin(x / (sc * 2), y / (sc * 2), 1);
            if (puddle < -0.2) n -= 60 * params.moisture;
            break;
          }
          case 'Snow': {
            // Packed areas are smoother
            const compact = noise.perlin(x / (sc * 1.5), y / (sc * 1.5), 1);
            if (compact > 0.5) n -= (compact - 0.5) * 40;
            // Sparkle areas are slightly smoother
            const sparkle = noise.perlin(x / (sc * 0.1), y / (sc * 0.1), 2);
            if (sparkle > 0.88) n -= 15;
            break;
          }
          case 'CobbleStone': {
            // Gap areas are rougher (moss/gravel)
            const u = x / size;
            const v = y / size;
            const cell = fbm(u * 8 * params.scale, v * 8 * params.scale, 0, 3, 2.0, 0.5, 1.0);
            const cell2 = fbm(u * 8 * params.scale + 5.3, v * 8 * params.scale + 1.7, 0, 3, 2.0, 0.5, 1.0);
            const edge = Math.abs(cell - cell2);
            if (edge < 0.08) n += 20;
            break;
          }
          case 'Sand': {
            // Wind ripples create alternating rough/smooth bands
            const rippleAngle = 0.4;
            const diagCoord = x * Math.cos(rippleAngle) + y * Math.sin(rippleAngle);
            const ripple = Math.sin(diagCoord / (8 * params.scale) * Math.PI * 2);
            n += ripple * 8;
            break;
          }
          case 'Sandstone': {
            // Erosion pockets are rougher
            const erosion = noise.perlin(x / (sc * 0.3), y / (sc * 0.3), 1);
            if (erosion > 0.65) n += (erosion - 0.65) * 40;
            break;
          }
          default:
            break;
        }

        const v = Math.max(0, Math.min(255, baseRoughness + n));
        data[idx]     = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  /** Get roughness map configuration per terrain type */
  private getRoughnessConfig(type: TerrainType): { varScale: number; variation: number } {
    const configs: Record<TerrainType, { varScale: number; variation: number }> = {
      ChunkyRock:   { varScale: 12, variation: 25 },
      CobbleStone:  { varScale: 15, variation: 20 },
      CrackedGround:{ varScale: 18, variation: 15 },
      Dirt:         { varScale: 10, variation: 12 },
      Ice:          { varScale: 20, variation: 30 },
      Mountain:     { varScale: 15, variation: 22 },
      Mud:          { varScale: 15, variation: 35 },
      Sand:         { varScale: 8,  variation: 10 },
      Sandstone:    { varScale: 12, variation: 20 },
      Soil:         { varScale: 10, variation: 12 },
      Stone:        { varScale: 15, variation: 18 },
      Snow:         { varScale: 18, variation: 20 },
    };
    return configs[type];
  }

  // ==========================================================================
  // Variations & Presets
  // ==========================================================================

  getVariations(count: number): TerrainParams[] {
    const variations: TerrainParams[] = [];
    const types: TerrainType[] = [
      'ChunkyRock', 'CobbleStone', 'CrackedGround', 'Dirt',
      'Ice', 'Mountain', 'Mud', 'Sand',
      'Sandstone', 'Soil', 'Stone', 'Snow',
    ];

    // Roughness ranges per terrain type
    const roughnessMap: Record<TerrainType, [number, number]> = {
      ChunkyRock:   [0.82, 0.98],
      CobbleStone:  [0.65, 0.85],
      CrackedGround:[0.85, 1.0],
      Dirt:         [0.85, 0.98],
      Ice:          [0.02, 0.3],
      Mountain:     [0.7, 0.9],
      Mud:          [0.2, 0.55],
      Sand:         [0.8, 0.95],
      Sandstone:    [0.7, 0.85],
      Soil:         [0.82, 0.95],
      Stone:        [0.6, 0.82],
      Snow:         [0.4, 0.7],
    };

    // Hue ranges per terrain type (approximate, in 0-1 range)
    const hueMap: Record<TerrainType, [number, number]> = {
      ChunkyRock:   [0.05, 0.12],
      CobbleStone:  [0.06, 0.11],
      CrackedGround:[0.07, 0.12],
      Dirt:         [0.05, 0.1],
      Ice:          [0.55, 0.6],
      Mountain:     [0.0, 0.08],
      Mud:          [0.04, 0.1],
      Sand:         [0.08, 0.14],
      Sandstone:    [0.04, 0.1],
      Soil:         [0.04, 0.09],
      Stone:        [0.0, 0.07],
      Snow:         [0.55, 0.62],
    };

    // Lightness ranges per terrain type
    const lightnessMap: Record<TerrainType, [number, number]> = {
      ChunkyRock:   [0.3, 0.55],
      CobbleStone:  [0.35, 0.55],
      CrackedGround:[0.45, 0.65],
      Dirt:         [0.2, 0.4],
      Ice:          [0.75, 0.92],
      Mountain:     [0.35, 0.6],
      Mud:          [0.15, 0.35],
      Sand:         [0.6, 0.8],
      Sandstone:    [0.45, 0.65],
      Soil:         [0.12, 0.3],
      Stone:        [0.35, 0.6],
      Snow:         [0.85, 0.97],
    };

    for (let i = 0; i < count; i++) {
      const t = this.rng.choice(types);
      const [rMin, rMax] = roughnessMap[t];
      const [hMin, hMax] = hueMap[t];
      const [lMin, lMax] = lightnessMap[t];

      const sat = t === 'Ice' || t === 'Snow'
        ? 0.05 + this.rng.nextFloat() * 0.15
        : 0.1 + this.rng.nextFloat() * 0.25;

      variations.push({
        type: t,
        color: new Color().setHSL(
          this.rng.nextFloat(hMin, hMax),
          sat,
          this.rng.nextFloat(lMin, lMax),
        ),
        roughness: this.rng.nextFloat(rMin, rMax),
        moisture: t === 'Mud' ? this.rng.nextFloat(0.3, 0.9)
          : t === 'CobbleStone' ? this.rng.nextFloat(0, 0.5)
          : this.rng.nextFloat(0, 0.2),
        scale: this.rng.nextFloat(0.6, 1.4),
        detail: this.rng.nextFloat(0.3, 0.9),
        seed: this.rng.nextInt(1, 99999),
      });
    }
    return variations;
  }

  /** Get a preset by name */
  static getPreset(name: string): Partial<TerrainParams> | undefined {
    return TERRAIN_PRESETS[name];
  }

  /** List all available preset names */
  static listPresets(): string[] {
    return Object.keys(TERRAIN_PRESETS);
  }
}
