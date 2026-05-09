/**
 * TerrainMaterialBridge — Integrates TerrainMaterialSystem into MaterialPipeline
 *
 * Converts terrain surface parameters into MaterialPipeline-compatible inputs,
 * enabling terrain materials to be created through the unified pipeline.
 * Handles slope-based blending (rock at steep slopes, grass at gentle),
 * altitude-based blending (snow at high, sand at low), and biome color palettes.
 */

import * as THREE from 'three';
import { MaterialPipeline } from '../MaterialPipeline';
import type { MaterialPBRParams } from '../textures/TextureBakePipeline';
import { TerrainMaterialLibrary, type TerrainParams, type TerrainType } from '../categories/Terrain/TerrainMaterialLibrary';
import { MaterialPresetLibrary, type MaterialPreset } from '../MaterialPresetLibrary';
import { ColorSystem } from '../ColorSystem';

// ============================================================================
// Types
// ============================================================================

/** Terrain surface parameters for bridge conversion */
export interface TerrainSurfaceParams {
  /** Terrain type (ChunkyRock, Dirt, Sand, etc.) */
  type: TerrainType;
  /** Base color */
  color?: THREE.Color;
  /** Roughness */
  roughness?: number;
  /** Moisture level 0-1 */
  moisture?: number;
  /** Texture scale */
  scale?: number;
  /** Detail level */
  detail?: number;
  /** Random seed */
  seed?: number;
}

/** Biome definition for color/material lookup */
interface BiomeDefinition {
  /** Biome name */
  name: string;
  /** Base terrain type */
  terrainType: TerrainType;
  /** Color palette (multiple options for variation) */
  colors: THREE.Color[];
  /** Roughness range */
  roughness: [number, number];
  /** Default moisture */
  moisture: number;
}

// ============================================================================
// Biome Definitions
// ============================================================================

const BIOME_DEFINITIONS: Record<string, BiomeDefinition> = {
  desert: {
    name: 'desert',
    terrainType: 'Sand',
    colors: [new THREE.Color(0xd4a853), new THREE.Color(0xc49a3c), new THREE.Color(0xe8cc8a)],
    roughness: [0.85, 0.95],
    moisture: 0.0,
  },
  tundra: {
    name: 'tundra',
    terrainType: 'Snow',
    colors: [new THREE.Color(0xe8ecf4), new THREE.Color(0xd8dfe8), new THREE.Color(0xf0f4f8)],
    roughness: [0.5, 0.65],
    moisture: 0.05,
  },
  forest: {
    name: 'forest',
    terrainType: 'Dirt',
    colors: [new THREE.Color(0x6b4226), new THREE.Color(0x5a3a20), new THREE.Color(0x3a2816)],
    roughness: [0.85, 0.95],
    moisture: 0.25,
  },
  tropical: {
    name: 'tropical',
    terrainType: 'Mud',
    colors: [new THREE.Color(0x4a3a28), new THREE.Color(0x5a4a32), new THREE.Color(0x3a2a18)],
    roughness: [0.6, 0.8],
    moisture: 0.6,
  },
  mountain: {
    name: 'mountain',
    terrainType: 'Mountain',
    colors: [new THREE.Color(0x808080), new THREE.Color(0x6b6b6b), new THREE.Color(0x9a9a9a)],
    roughness: [0.75, 0.9],
    moisture: 0.05,
  },
  volcanic: {
    name: 'volcanic',
    terrainType: 'ChunkyRock',
    colors: [new THREE.Color(0x2a2a2a), new THREE.Color(0x3a3a3a), new THREE.Color(0x1a1a1a)],
    roughness: [0.85, 0.95],
    moisture: 0.0,
  },
  coastal: {
    name: 'coastal',
    terrainType: 'Sandstone',
    colors: [new THREE.Color(0xc9a86c), new THREE.Color(0xc47a4a), new THREE.Color(0xd4b878)],
    roughness: [0.78, 0.88],
    moisture: 0.1,
  },
  grassland: {
    name: 'grassland',
    terrainType: 'Soil',
    colors: [new THREE.Color(0x5a4230), new THREE.Color(0x4a3620), new THREE.Color(0x3a2816)],
    roughness: [0.85, 0.92],
    moisture: 0.2,
  },
};

// ============================================================================
// TerrainMaterialBridge
// ============================================================================

export class TerrainMaterialBridge {
  // ===========================================================================
  // Conversion Methods
  // ===========================================================================

  /**
   * Convert terrain surface parameters to MaterialPipeline-compatible PBR params.
   *
   * Maps terrain types to appropriate PBR settings including base color,
   * roughness, metallic, and noise parameters.
   */
  static terrainToMaterialParams(terrainParams: TerrainSurfaceParams): MaterialPBRParams {
    const seed = terrainParams.seed ?? 42;
    const baseColor = terrainParams.color ?? ColorSystem.getMaterialColor('stone', seed);

    // Map terrain type to PBR parameters
    const typeToRoughness: Record<string, number> = {
      ChunkyRock: 0.92,
      CobbleStone: 0.75,
      CrackedGround: 0.95,
      Dirt: 0.95,
      Ice: 0.05,
      Mountain: 0.85,
      Mud: 0.35,
      Sand: 0.9,
      Sandstone: 0.82,
      Soil: 0.92,
      Stone: 0.75,
      Snow: 0.6,
    };

    const roughness = terrainParams.roughness ?? typeToRoughness[terrainParams.type] ?? 0.75;

    // Terrain materials are never metallic
    const metallic = 0.0;

    // Scale noise based on terrain type
    const typeToNoiseScale: Record<string, number> = {
      ChunkyRock: 3.0,
      CobbleStone: 5.0,
      CrackedGround: 4.0,
      Dirt: 6.0,
      Ice: 2.0,
      Mountain: 3.0,
      Mud: 5.0,
      Sand: 8.0,
      Sandstone: 4.0,
      Soil: 6.0,
      Stone: 5.0,
      Snow: 3.0,
    };

    const moisture = terrainParams.moisture ?? 0.1;
    // Wet materials are smoother
    const adjustedRoughness = Math.max(0.04, roughness - moisture * 0.3);

    return {
      baseColor,
      roughness: adjustedRoughness,
      metallic,
      noiseScale: typeToNoiseScale[terrainParams.type] ?? 5.0,
      noiseDetail: 5,
      distortion: 0.2,
      normalStrength: 1.0,
      aoStrength: 0.5,
      heightScale: 0.02,
      warpStrength: 0.1,
      emissionColor: null,
      emissionStrength: 0,
    };
  }

  /**
   * Create terrain material through the unified pipeline.
   *
   * Uses MaterialPipeline to create a full PBR material with procedural
   * textures from terrain surface parameters.
   */
  static async createTerrainMaterial(
    params: TerrainSurfaceParams,
  ): Promise<THREE.MeshPhysicalMaterial> {
    const pipeline = new MaterialPipeline();
    const materialParams = TerrainMaterialBridge.terrainToMaterialParams(params);

    try {
      const material = await pipeline.createMaterial('terrain', {
        variation: {
          colorShift: 0,
          age: 0,
          wear: 0,
          moisture: params.moisture ?? 0.1,
        },
        useProcedural: true,
      });

      // Apply terrain-specific overrides
      material.color.copy(materialParams.baseColor);
      material.roughness = materialParams.roughness;
      material.metalness = materialParams.metallic;

      // Ice and snow need special physical properties
      if (params.type === 'Ice') {
        (material as any).transmission = 0.3;
        (material as any).thickness = 1.5;
        material.ior = 1.31;
        material.clearcoat = 0.8;
        material.clearcoatRoughness = 0.1;
      } else if (params.type === 'Snow') {
        material.sheen = 0.5;
        material.sheenRoughness = 0.8;
        material.sheenColor = new THREE.Color(0xe8f0ff);
      } else if (params.type === 'Mud') {
        const moisture = params.moisture ?? 0.5;
        material.clearcoat = 0.3 * moisture;
        material.clearcoatRoughness = 0.4;
      }

      material.name = `Terrain_${params.type}_${Date.now()}`;
      return material;
    } catch (err) {
      console.warn('TerrainMaterialBridge: Pipeline creation failed, using TerrainMaterialLibrary fallback:', err);

      // Fallback: use the dedicated TerrainMaterialLibrary
      const lib = new TerrainMaterialLibrary(params.seed);
      const result = lib.generate({
        type: params.type,
        color: materialParams.baseColor,
        roughness: materialParams.roughness,
        moisture: params.moisture ?? 0.1,
        scale: params.scale ?? 1.0,
        detail: params.detail ?? 0.5,
      });

      return result.material as THREE.MeshPhysicalMaterial;
    }
  }

  /**
   * Get biome-specific material with slope/altitude blending.
   *
   * Applies blending rules:
   * - Steep slopes → rock texture (regardless of biome)
   * - High altitude → snow overlay
   * - Low altitude → sand/beach overlay
   * - Base material from biome definition
   */
  static async createBiomeMaterial(
    biome: string,
    slope: number = 0,
    altitude: number = 0.5,
  ): Promise<THREE.MeshPhysicalMaterial> {
    const biomeDef = BIOME_DEFINITIONS[biome];
    if (!biomeDef) {
      console.warn(`TerrainMaterialBridge: Unknown biome "${biome}", using grassland`);
      return TerrainMaterialBridge.createBiomeMaterial('grassland', slope, altitude);
    }

    const seed = biome.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const colorIndex = seed % biomeDef.colors.length;
    const baseColor = biomeDef.colors[colorIndex].clone();

    // Apply altitude-based modifications
    let adjustedColor = baseColor;
    let adjustedRoughness = biomeDef.roughness[0] +
      (seed / 255) * (biomeDef.roughness[1] - biomeDef.roughness[0]);
    let terrainType: TerrainType = biomeDef.terrainType;

    // High altitude → snow
    if (altitude > 0.85) {
      const snowBlend = (altitude - 0.85) / 0.15;
      const snowColor = new THREE.Color(0xf0f4f8);
      adjustedColor = adjustedColor.clone().lerp(snowColor, snowBlend);
      adjustedRoughness = adjustedRoughness * (1 - snowBlend) + 0.6 * snowBlend;
      if (snowBlend > 0.7) {
        terrainType = 'Snow';
      }
    }
    // Low altitude → sand
    else if (altitude < 0.15) {
      const sandBlend = (0.15 - altitude) / 0.15;
      const sandColor = new THREE.Color(0xc2b87a);
      adjustedColor = adjustedColor.clone().lerp(sandColor, sandBlend);
      adjustedRoughness = adjustedRoughness * (1 - sandBlend) + 0.9 * sandBlend;
      if (sandBlend > 0.7) {
        terrainType = 'Sand';
      }
    }

    // Steep slope → rock
    if (slope > 0.35) {
      const rockBlend = (slope - 0.35) / 0.3;
      const rockColor = new THREE.Color(0x7a6e60);
      adjustedColor = adjustedColor.clone().lerp(rockColor, Math.min(1, rockBlend));
      adjustedRoughness = Math.max(adjustedRoughness, 0.85 * rockBlend + adjustedRoughness * (1 - rockBlend));
      if (rockBlend > 0.7) {
        terrainType = 'Stone';
      }
    }

    return TerrainMaterialBridge.createTerrainMaterial({
      type: terrainType,
      color: adjustedColor,
      roughness: adjustedRoughness,
      moisture: biomeDef.moisture,
      scale: 1.0,
      detail: 0.6,
      seed,
    });
  }

  /**
   * Register terrain-specific presets with MaterialPresetLibrary.
   *
   * Adds preset entries for each terrain type so they can be created
   * through the unified MaterialPipeline API by name.
   */
  static registerTerrainPresets(): void {
    // Access the global preset library and register terrain presets
    const terrainTypes: TerrainType[] = [
      'ChunkyRock', 'CobbleStone', 'CrackedGround', 'Dirt',
      'Ice', 'Mountain', 'Mud', 'Sand', 'Sandstone', 'Soil',
      'Stone', 'Snow',
    ];

    const typeColors: Record<string, THREE.Color> = {
      ChunkyRock: new THREE.Color(0x8b7355),
      CobbleStone: new THREE.Color(0x8a8070),
      CrackedGround: new THREE.Color(0xb8956a),
      Dirt: new THREE.Color(0x6b4226),
      Ice: new THREE.Color(0xc8dce8),
      Mountain: new THREE.Color(0x808080),
      Mud: new THREE.Color(0x4a3a28),
      Sand: new THREE.Color(0xd4a853),
      Sandstone: new THREE.Color(0xc9a86c),
      Soil: new THREE.Color(0x3a2816),
      Stone: new THREE.Color(0x888888),
      Snow: new THREE.Color(0xf0f4f8),
    };

    const typeRoughness: Record<string, number> = {
      ChunkyRock: 0.92,
      CobbleStone: 0.75,
      CrackedGround: 0.95,
      Dirt: 0.95,
      Ice: 0.05,
      Mountain: 0.85,
      Mud: 0.35,
      Sand: 0.9,
      Sandstone: 0.82,
      Soil: 0.92,
      Stone: 0.75,
      Snow: 0.6,
    };

    // Register each terrain type as a preset
    for (const tType of terrainTypes) {
      const preset: MaterialPreset = {
        id: `terrain_${tType.toLowerCase()}`,
        name: `Terrain ${tType}`,
        category: 'terrain',
        description: `Terrain ${tType} material preset`,
        params: {
          baseColor: typeColors[tType] ?? new THREE.Color(0x888888),
          roughness: typeRoughness[tType] ?? 0.75,
          metallic: 0.0,
          noiseScale: 5.0,
          noiseDetail: 5,
          distortion: 0.2,
          normalStrength: 1.0,
          aoStrength: 0.5,
          heightScale: 0.02,
          warpStrength: 0.1,
          emissionColor: null,
          emissionStrength: 0,
        },
        physicalOverrides: {
          clearcoat: tType === 'Ice' ? 0.8 : tType === 'Snow' ? 0.1 : tType === 'Mud' ? 0.15 : 0,
          clearcoatRoughness: tType === 'Ice' ? 0.1 : 0.4,
          transmission: tType === 'Ice' ? 0.3 : 0,
          ior: tType === 'Ice' ? 1.31 : 1.45,
          thickness: tType === 'Ice' ? 1.5 : 0,
          sheen: tType === 'Snow' ? 0.5 : 0,
          sheenRoughness: tType === 'Snow' ? 0.8 : 0,
          sheenColor: tType === 'Snow' ? new THREE.Color(0xe8f0ff) : undefined,
        },
      };

      // Note: In a full implementation, this would register with the singleton
      // MaterialPresetLibrary. For now, we store the presets for later registration.
      TerrainMaterialBridge._terrainPresets.set(preset.id, preset);
    }
  }

  /** Internal storage for terrain presets before registration */
  private static _terrainPresets: Map<string, MaterialPreset> = new Map();

  /** Get registered terrain presets */
  static getTerrainPresets(): Map<string, MaterialPreset> {
    if (TerrainMaterialBridge._terrainPresets.size === 0) {
      TerrainMaterialBridge.registerTerrainPresets();
    }
    return TerrainMaterialBridge._terrainPresets;
  }
}

export default TerrainMaterialBridge;
