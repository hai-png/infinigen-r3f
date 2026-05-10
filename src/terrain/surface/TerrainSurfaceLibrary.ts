/**
 * Terrain Surface Library — Node-Graph-Based Surface Definitions
 *
 * Provides static factory methods for each terrain surface type from the
 * original Infinigen `surface_registry`. Each method returns a fully
 * configured `SurfaceMaterialDescriptor` with displacement noise patterns
 * and a `shaderGraph` description that mirrors how the original Python
 * `node_wrangler.py` shader functions compose Blender shader node graphs.
 *
 * The original Infinigen defines terrain surfaces via `SDFPerturb` shader
 * node graphs that modify the terrain SDF before meshing. In the R3F port
 * these are represented as `SurfaceMaterialDescriptor` objects with:
 * - Displacement configurations that produce the characteristic surface patterns
 * - A `shaderGraph` property describing the node connections needed
 * - PBR parameters matching the original surface appearance
 *
 * Surface inventory (matching original Infinigen terrain surfaces):
 * - Sand:        Wave + Voronoi dune ripples, wet/dry coloring
 * - Mountain:    Layered noise + Voronoi cracks, altitude-colored
 * - Soil:        Fine-grained organic soil texture
 * - Dirt:        Coarser dirt with rock fragments
 * - Mud:         Wet, smooth mud with dry cracks
 * - Stone:       Natural stone with veins and cracks
 * - Ice:         Smooth ice with cracks and refractions
 * - Sandstone:   Layered sandstone with stratification
 * - ChunkyRock:  Chunky rock with angular Voronoi fragments
 * - CobbleStone: Rounded cobblestone Voronoi pattern
 * - CrackedGround: Dry cracked earth Voronoi edge patterns
 *
 * @module terrain/surface/TerrainSurfaceLibrary
 */

import * as THREE from 'three';
import {
  SurfaceMaterialDescriptor,
  SurfaceMaterialParams,
  SurfaceDisplacementConfig,
  SurfaceType,
} from '@/terrain/surface/SurfaceRegistry';
import {
  ShaderGraphType,
  ShaderGraphDescriptor,
  GraphBlendMode,
} from '@/terrain/surface/ShaderGraphSurfaceBridge';

// ============================================================================
// Shader Graph Node Description Types
// ============================================================================

/**
 * Describes a single node in a shader graph.
 *
 * Mirrors Blender's shader node types used by the original Infinigen's
 * `node_wrangler.py`. Each node has a type (e.g., 'musgrave', 'voronoi',
 * 'wave', 'colorramp') and parameters controlling its behavior.
 */
export interface ShaderNodeDescription {
  /** Node type identifier (e.g., 'musgrave', 'voronoi', 'wave', 'mix', 'colorramp') */
  type: string;
  /** Unique node name within the graph */
  name: string;
  /** Parameters for this node */
  params: Record<string, number | string | boolean>;
}

/**
 * Describes a connection between two shader nodes.
 *
 * Each connection maps an output socket of a source node to an input
 * socket of a destination node, exactly as Blender's node link system works.
 */
export interface ShaderLinkDescription {
  /** Source node name */
  fromNode: string;
  /** Source output socket name */
  fromSocket: string;
  /** Destination node name */
  toNode: string;
  /** Destination input socket name */
  toSocket: string;
}

/**
 * Extended surface material descriptor with shader graph description.
 *
 * Adds the `shaderGraph` property that describes the full node graph
 * needed to reproduce the surface in a shader pipeline, matching how
 * the original Infinigen defines surfaces via `node_wrangler.py`.
 */
export interface TerrainSurfaceDescriptor extends SurfaceMaterialDescriptor {
  /** Shader graph node descriptions */
  shaderGraph: {
    /** Displacement graph type */
    displacementType: ShaderGraphType;
    /** Material graph type */
    materialType: ShaderGraphType;
    /** Blend mode for composing displacement and material */
    blendMode: GraphBlendMode;
    /** Nodes in the displacement graph */
    displacementNodes: ShaderNodeDescription[];
    /** Connections in the displacement graph */
    displacementLinks: ShaderLinkDescription[];
    /** Nodes in the material (albedo) graph */
    materialNodes: ShaderNodeDescription[];
    /** Connections in the material (albedo) graph */
    materialLinks: ShaderLinkDescription[];
    /** Color ramp stops for altitude-based coloring (if applicable) */
    altitudeColorRamp?: { position: number; color: [number, number, number] }[];
    /** Coordinate scale overrides [x, y, z] */
    coordScale?: [number, number, number];
  };
}

// ============================================================================
// TerrainSurfaces — Static Factory Class
// ============================================================================

/**
 * Static factory class providing node-graph-based surface definitions for
 * all 11 terrain surfaces from the original Infinigen.
 *
 * Each static method returns a `TerrainSurfaceDescriptor` with:
 * - Proper displacement noise patterns
 * - A `shaderGraph` property describing the node connections
 * - PBR parameters matching the original surface appearance
 *
 * Usage:
 * ```typescript
 * const sandDesc = TerrainSurfaces.sand(42);
 * const mountainDesc = TerrainSurfaces.mountain(42);
 *
 * // Use with TerrainSurfaceRegistry
 * registry.registerDescriptors('ground_collection', [
 *   TerrainSurfaces.sand(42),
 *   TerrainSurfaces.mud(42),
 * ]);
 *
 * // Access shader graph for rendering pipeline
 * const graph = sandDesc.shaderGraph;
 * ```
 */
export class TerrainSurfaces {
  // ==========================================================================
  // Sand — Wave + Voronoi dune ripples, wet/dry coloring
  // ==========================================================================

  /**
   * Create a Sand surface descriptor.
   *
   * Sand uses wave noise for dune ripples combined with voronoi for
   * grain texture. The displacement is low-amplitude with a characteristic
   * undulating pattern. The original Infinigen shader combines:
   * - Wave texture (bands mode) for dune ripple patterns
   * - Voronoi texture (distance mode) for sand grain
   * - Mix node to blend dune and grain
   * - ColorRamp for wet/dry sand coloring
   *
   * @param seed - Random seed for procedural variation
   * @returns Sand TerrainSurfaceDescriptor
   */
  static sand(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'sand');
    return {
      id: `sand_${seed}`,
      name: 'Sand',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0xc2b87a,
        roughness: 0.95,
        metalness: 0.0,
        normalScale: 0.7,
        opacity: 1.0,
        transparent: false,
        custom: {
          wetDryColor: true,
          duneRipple: true,
          wetColor: 0x9a905a,
          dryColor: 0xd4c88a,
        },
      },
      displacement: {
        amplitude: 0.03,
        frequency: 0.08,
        octaves: 3,
        lacunarity: 2.2,
        persistence: 0.4,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.LAYERED_BLEND,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.MIX,
        displacementNodes: [
          { type: 'wave', name: 'dune_wave', params: { bandsDirection: 'X', scale: 3.0 + rngVariation(rng, 0.5), detail: 2.0, distortion: 0.3 } },
          { type: 'voronoi', name: 'grain_voronoi', params: { scale: 25.0 + rngVariation(rng, 5.0), feature: 1, smoothness: 0.8 } },
          { type: 'mix', name: 'sand_mix', params: { factor: 0.7 } },
          { type: 'musgrave', name: 'detail_noise', params: { musgraveType: 'fBM', scale: 8.0, detail: 3.0, dimension: 2.0, lacunarity: 2.0 } },
          { type: 'mix', name: 'final_mix', params: { factor: 0.15 } },
        ],
        displacementLinks: [
          { fromNode: 'dune_wave', fromSocket: 'fac', toNode: 'sand_mix', toSocket: 'a' },
          { fromNode: 'grain_voronoi', fromSocket: 'distance', toNode: 'sand_mix', toSocket: 'b' },
          { fromNode: 'sand_mix', fromSocket: 'result', toNode: 'final_mix', toSocket: 'a' },
          { fromNode: 'detail_noise', fromSocket: 'fac', toNode: 'final_mix', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'musgrave', name: 'base_noise', params: { scale: 5.0, detail: 4.0, dimension: 2.0 } },
          { type: 'colorramp', name: 'sand_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'base_noise', fromSocket: 'fac', toNode: 'sand_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // Mountain — Layered noise + Voronoi cracks, altitude-colored
  // ==========================================================================

  /**
   * Create a Mountain surface descriptor.
   *
   * Mountain uses high-amplitude layered noise with voronoi cracks at
   * multiple scales. The original Infinigen shader combines:
   * - Musgrave (HeteroTerrain) for large-scale terrain variation
   * - Musgrave (RidgedMultifractal) for ridge features
   * - Voronoi (edge distance) for crack patterns at two scales
   * - Altitude-based ColorRamp for snow/rock/grass transitions
   *
   * @param seed - Random seed for procedural variation
   * @returns Mountain TerrainSurfaceDescriptor
   */
  static mountain(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'mountain');
    return {
      id: `mountain_${seed}`,
      name: 'Mountain',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0x7a6e60,
        roughness: 0.95,
        metalness: 0.0,
        normalScale: 1.0,
        opacity: 1.0,
        transparent: false,
        custom: {
          altitudeColored: true,
          voronoiCracks: true,
          layeredNoise: true,
        },
      },
      displacement: {
        amplitude: 0.6,
        frequency: 0.08,
        octaves: 6,
        lacunarity: 2.0,
        persistence: 0.55,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.LAYERED_BLEND,
        materialType: ShaderGraphType.ALTITUDE_BLEND,
        blendMode: GraphBlendMode.ADD,
        displacementNodes: [
          { type: 'musgrave', name: 'base_terrain', params: { musgraveType: 'HETERO_TERRAIN', scale: 2.0 + rngVariation(rng, 0.5), detail: 6.0, dimension: 2.0, lacunarity: 2.0, offset: 0.5 } },
          { type: 'musgrave', name: 'ridges', params: { musgraveType: 'RIDGED_MULTIFRACTAL', scale: 4.0, detail: 5.0, dimension: 1.5, lacunarity: 2.0, offset: 1.0, gain: 2.0 } },
          { type: 'voronoi', name: 'cracks_large', params: { scale: 8.0 + rngVariation(rng, 2.0), feature: 2, smoothness: 0.3 } },
          { type: 'voronoi', name: 'cracks_small', params: { scale: 20.0 + rngVariation(rng, 5.0), feature: 2, smoothness: 0.5 } },
          { type: 'mix', name: 'crack_blend', params: { factor: 0.6 } },
          { type: 'mix', name: 'base_ridge', params: { factor: 0.3 } },
          { type: 'mix', name: 'final_mountain', params: { factor: 0.2 } },
        ],
        displacementLinks: [
          { fromNode: 'cracks_large', fromSocket: 'distance', toNode: 'crack_blend', toSocket: 'a' },
          { fromNode: 'cracks_small', fromSocket: 'distance', toNode: 'crack_blend', toSocket: 'b' },
          { fromNode: 'base_terrain', fromSocket: 'fac', toNode: 'base_ridge', toSocket: 'a' },
          { fromNode: 'ridges', fromSocket: 'fac', toNode: 'base_ridge', toSocket: 'b' },
          { fromNode: 'base_ridge', fromSocket: 'result', toNode: 'final_mountain', toSocket: 'a' },
          { fromNode: 'crack_blend', fromSocket: 'result', toNode: 'final_mountain', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'musgrave', name: 'low_alt_noise', params: { musgraveType: 'fBM', scale: 4.0, detail: 4.0 } },
          { type: 'musgrave', name: 'high_alt_noise', params: { musgraveType: 'RIDGED_MULTIFRACTAL', scale: 6.0, detail: 6.0, offset: 1.0, gain: 2.0 } },
          { type: 'colorramp', name: 'altitude_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'low_alt_noise', fromSocket: 'fac', toNode: 'altitude_color', toSocket: 'fac' },
        ],
        altitudeColorRamp: [
          { position: 0.0, color: [0.42, 0.38, 0.30] },
          { position: 0.3, color: [0.48, 0.43, 0.38] },
          { position: 0.6, color: [0.55, 0.50, 0.45] },
          { position: 0.85, color: [0.75, 0.72, 0.68] },
          { position: 1.0, color: [0.91, 0.93, 0.96] },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // Soil — Fine-grained organic soil texture
  // ==========================================================================

  /**
   * Create a Soil surface descriptor.
   *
   * Soil uses very fine, low-amplitude organic texture. The original
   * Infinigen shader combines:
   * - Musgrave (fBM) at fine scale for organic micro-variation
   * - Noise (simplex) for organic grain
   * - ColorRamp for humus/mineral color variation
   *
   * @param seed - Random seed for procedural variation
   * @returns Soil TerrainSurfaceDescriptor
   */
  static soil(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'soil');
    return {
      id: `soil_${seed}`,
      name: 'Soil',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0x6b4423,
        roughness: 0.95,
        metalness: 0.0,
        normalScale: 0.7,
        opacity: 1.0,
        transparent: false,
        custom: {
          organicTexture: true,
          fineGrained: true,
        },
      },
      displacement: {
        amplitude: 0.05,
        frequency: 0.04,
        octaves: 4,
        lacunarity: 2.0,
        persistence: 0.45,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.NOISE_DISPLACEMENT,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.MIX,
        displacementNodes: [
          { type: 'musgrave', name: 'organic_base', params: { musgraveType: 'fBM', scale: 6.0 + rngVariation(rng, 1.0), detail: 5.0, dimension: 2.5, lacunarity: 2.0, gain: 0.5 } },
          { type: 'noise', name: 'grain', params: { noiseType: 'simplex', scale: 15.0, detail: 3.0, distortion: 0.2 } },
          { type: 'mix', name: 'soil_mix', params: { factor: 0.85 } },
        ],
        displacementLinks: [
          { fromNode: 'organic_base', fromSocket: 'fac', toNode: 'soil_mix', toSocket: 'a' },
          { fromNode: 'grain', fromSocket: 'fac', toNode: 'soil_mix', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'musgrave', name: 'color_base', params: { scale: 4.0, detail: 4.0, dimension: 2.0 } },
          { type: 'colorramp', name: 'soil_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'color_base', fromSocket: 'fac', toNode: 'soil_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // Dirt — Coarser dirt with rock fragments
  // ==========================================================================

  /**
   * Create a Dirt surface descriptor.
   *
   * Dirt uses medium-amplitude mixed noise with rock fragment patterns.
   * The original Infinigen shader combines:
   * - Musgrave (HeteroTerrain) for base dirt texture
   * - Voronoi (F1) for rock fragment placement
   * - Mix node blending dirt and rock fragments
   *
   * @param seed - Random seed for procedural variation
   * @returns Dirt TerrainSurfaceDescriptor
   */
  static dirt(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'dirt');
    return {
      id: `dirt_${seed}`,
      name: 'Dirt',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0x8b7355,
        roughness: 0.93,
        metalness: 0.0,
        normalScale: 0.8,
        opacity: 1.0,
        transparent: false,
        custom: {
          rockFragments: true,
          mixedNoise: true,
        },
      },
      displacement: {
        amplitude: 0.1,
        frequency: 0.07,
        octaves: 4,
        lacunarity: 2.0,
        persistence: 0.5,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.LAYERED_BLEND,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.MIX,
        displacementNodes: [
          { type: 'musgrave', name: 'dirt_base', params: { musgraveType: 'HETERO_TERRAIN', scale: 3.0 + rngVariation(rng, 0.5), detail: 4.0, dimension: 2.0, lacunarity: 2.0, offset: 0.5 } },
          { type: 'voronoi', name: 'rock_fragments', params: { scale: 12.0 + rngVariation(rng, 3.0), feature: 0, smoothness: 0.2 } },
          { type: 'noise', name: 'dirt_detail', params: { noiseType: 'simplex', scale: 10.0, detail: 3.0, distortion: 0.4 } },
          { type: 'mix', name: 'dirt_rock_mix', params: { factor: 0.8 } },
          { type: 'mix', name: 'dirt_final', params: { factor: 0.9 } },
        ],
        displacementLinks: [
          { fromNode: 'dirt_base', fromSocket: 'fac', toNode: 'dirt_rock_mix', toSocket: 'a' },
          { fromNode: 'rock_fragments', fromSocket: 'distance', toNode: 'dirt_rock_mix', toSocket: 'b' },
          { fromNode: 'dirt_rock_mix', fromSocket: 'result', toNode: 'dirt_final', toSocket: 'a' },
          { fromNode: 'dirt_detail', fromSocket: 'fac', toNode: 'dirt_final', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'musgrave', name: 'color_base', params: { scale: 3.5, detail: 4.0, dimension: 2.0 } },
          { type: 'colorramp', name: 'dirt_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'color_base', fromSocket: 'fac', toNode: 'dirt_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // Mud — Wet, smooth mud with dry cracks
  // ==========================================================================

  /**
   * Create a Mud surface descriptor.
   *
   * Mud uses smooth, low-amplitude displacement with occasional cracks
   * when dry. The original Infinigen shader combines:
   * - Musgrave (fBM) at low amplitude for smooth base
   * - Voronoi (edge distance) for crack patterns (active when dry)
   * - Mix node blending smooth mud and crack displacement
   * - Lower roughness for wet appearance
   *
   * @param seed - Random seed for procedural variation
   * @returns Mud TerrainSurfaceDescriptor
   */
  static mud(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'mud');
    return {
      id: `mud_${seed}`,
      name: 'Mud',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0x5a4a3a,
        roughness: 0.85,
        metalness: 0.0,
        normalScale: 0.4,
        opacity: 1.0,
        transparent: false,
        custom: {
          wetness: 0.7,
          crackWhenDry: true,
        },
      },
      displacement: {
        amplitude: 0.04,
        frequency: 0.06,
        octaves: 3,
        lacunarity: 2.0,
        persistence: 0.45,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.VORONOI_CRACK_DISPLACEMENT,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.MIX,
        displacementNodes: [
          { type: 'musgrave', name: 'mud_base', params: { musgraveType: 'fBM', scale: 2.0 + rngVariation(rng, 0.5), detail: 3.0, dimension: 2.5, lacunarity: 2.0, gain: 0.3 } },
          { type: 'voronoi', name: 'dry_cracks', params: { scale: 6.0 + rngVariation(rng, 2.0), feature: 2, smoothness: 0.1 } },
          { type: 'mix', name: 'mud_crack_mix', params: { factor: 0.85 } },
        ],
        displacementLinks: [
          { fromNode: 'mud_base', fromSocket: 'fac', toNode: 'mud_crack_mix', toSocket: 'a' },
          { fromNode: 'dry_cracks', fromSocket: 'distance', toNode: 'mud_crack_mix', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'musgrave', name: 'color_base', params: { scale: 3.0, detail: 3.0, dimension: 2.0 } },
          { type: 'colorramp', name: 'mud_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'color_base', fromSocket: 'fac', toNode: 'mud_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // Stone — Natural stone with veins and cracks
  // ==========================================================================

  /**
   * Create a Stone surface descriptor.
   *
   * Stone uses medium-amplitude layered noise with vein and crack patterns.
   * The original Infinigen shader combines:
   * - Musgrave (HeteroTerrain) for base stone texture
   * - Musgrave (RidgedMultifractal) for vein patterns
   * - Voronoi (edge distance) for crack detail
   * - Multi-scale mix for natural stone appearance
   *
   * @param seed - Random seed for procedural variation
   * @returns Stone TerrainSurfaceDescriptor
   */
  static stone(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'stone');
    return {
      id: `stone_${seed}`,
      name: 'Stone',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0x7a7060,
        roughness: 0.92,
        metalness: 0.0,
        normalScale: 0.95,
        opacity: 1.0,
        transparent: false,
        custom: {
          veins: true,
          cracks: true,
          layeredNoise: true,
        },
      },
      displacement: {
        amplitude: 0.2,
        frequency: 0.1,
        octaves: 5,
        lacunarity: 2.0,
        persistence: 0.5,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.LAYERED_BLEND,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.OVERLAY,
        displacementNodes: [
          { type: 'musgrave', name: 'stone_base', params: { musgraveType: 'HETERO_TERRAIN', scale: 2.5 + rngVariation(rng, 0.5), detail: 5.0, dimension: 2.0, lacunarity: 2.0, offset: 0.5 } },
          { type: 'musgrave', name: 'veins', params: { musgraveType: 'RIDGED_MULTIFRACTAL', scale: 5.0, detail: 4.0, dimension: 1.5, lacunarity: 2.0, offset: 1.0, gain: 2.0 } },
          { type: 'voronoi', name: 'cracks', params: { scale: 15.0 + rngVariation(rng, 3.0), feature: 2, smoothness: 0.4 } },
          { type: 'mix', name: 'base_vein_mix', params: { factor: 0.7 } },
          { type: 'mix', name: 'stone_final', params: { factor: 0.85 } },
        ],
        displacementLinks: [
          { fromNode: 'stone_base', fromSocket: 'fac', toNode: 'base_vein_mix', toSocket: 'a' },
          { fromNode: 'veins', fromSocket: 'fac', toNode: 'base_vein_mix', toSocket: 'b' },
          { fromNode: 'base_vein_mix', fromSocket: 'result', toNode: 'stone_final', toSocket: 'a' },
          { fromNode: 'cracks', fromSocket: 'distance', toNode: 'stone_final', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'musgrave', name: 'color_base', params: { scale: 3.0, detail: 5.0, dimension: 2.0 } },
          { type: 'colorramp', name: 'stone_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'color_base', fromSocket: 'fac', toNode: 'stone_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // Ice — Smooth ice with cracks and refractions
  // ==========================================================================

  /**
   * Create an Ice surface descriptor.
   *
   * Ice uses smooth displacement with crack patterns (voronoi edges) and
   * specular highlights. The original Infinigen shader combines:
   * - Musgrave (fBM) for subtle surface undulation
   * - Voronoi (edge distance) for crack patterns
   * - Very low roughness for specular/refractive appearance
   * - Subsurface-like transparency for ice depth
   *
   * @param seed - Random seed for procedural variation
   * @returns Ice TerrainSurfaceDescriptor
   */
  static ice(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'ice');
    return {
      id: `ice_${seed}`,
      name: 'Ice',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0xa8cce0,
        roughness: 0.15,
        metalness: 0.05,
        normalScale: 0.6,
        opacity: 0.9,
        transparent: false,
        custom: {
          cracks: true,
          refractions: true,
          specular: true,
          ior: 1.31,
        },
      },
      displacement: {
        amplitude: 0.08,
        frequency: 0.12,
        octaves: 3,
        lacunarity: 2.0,
        persistence: 0.4,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.VORONOI_CRACK_DISPLACEMENT,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.MIX,
        displacementNodes: [
          { type: 'musgrave', name: 'ice_surface', params: { musgraveType: 'fBM', scale: 3.0 + rngVariation(rng, 0.5), detail: 3.0, dimension: 2.5, lacunarity: 2.0, gain: 0.3 } },
          { type: 'voronoi', name: 'ice_cracks', params: { scale: 10.0 + rngVariation(rng, 2.0), feature: 2, smoothness: 0.2 } },
          { type: 'mix', name: 'ice_crack_blend', params: { factor: 0.75 } },
        ],
        displacementLinks: [
          { fromNode: 'ice_surface', fromSocket: 'fac', toNode: 'ice_crack_blend', toSocket: 'a' },
          { fromNode: 'ice_cracks', fromSocket: 'distance', toNode: 'ice_crack_blend', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'musgrave', name: 'color_base', params: { scale: 4.0, detail: 3.0, dimension: 2.0 } },
          { type: 'voronoi', name: 'crack_color', params: { scale: 10.0, feature: 2, smoothness: 0.2 } },
          { type: 'colorramp', name: 'ice_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'color_base', fromSocket: 'fac', toNode: 'ice_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // Sandstone — Layered sandstone with stratification
  // ==========================================================================

  /**
   * Create a Sandstone surface descriptor.
   *
   * Sandstone uses horizontal stratification with layered patterns.
   * The original Infinigen shader combines:
   * - Wave texture (rings mode) for horizontal stratification layers
   * - Musgrave for cross-strata variation
   * - Noise for surface grain
   * - ColorRamp for alternating strata colors
   *
   * @param seed - Random seed for procedural variation
   * @returns Sandstone TerrainSurfaceDescriptor
   */
  static sandstone(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'sandstone');
    return {
      id: `sandstone_${seed}`,
      name: 'Sandstone',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0xb8a070,
        roughness: 0.9,
        metalness: 0.0,
        normalScale: 0.85,
        opacity: 1.0,
        transparent: false,
        custom: {
          stratification: true,
          horizontalLayers: true,
        },
      },
      displacement: {
        amplitude: 0.15,
        frequency: 0.06,
        octaves: 4,
        lacunarity: 2.0,
        persistence: 0.5,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.LAYERED_BLEND,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.MIX,
        displacementNodes: [
          { type: 'wave', name: 'strata', params: { bandsDirection: 'Z', scale: 4.0 + rngVariation(rng, 0.5), detail: 3.0, distortion: 0.4 } },
          { type: 'musgrave', name: 'cross_strata', params: { musgraveType: 'HETERO_TERRAIN', scale: 3.0, detail: 4.0, dimension: 2.0, lacunarity: 2.0, offset: 0.5 } },
          { type: 'noise', name: 'grain', params: { noiseType: 'simplex', scale: 12.0, detail: 3.0, distortion: 0.3 } },
          { type: 'mix', name: 'strata_variation', params: { factor: 0.6 } },
          { type: 'mix', name: 'sandstone_final', params: { factor: 0.85 } },
        ],
        displacementLinks: [
          { fromNode: 'strata', fromSocket: 'fac', toNode: 'strata_variation', toSocket: 'a' },
          { fromNode: 'cross_strata', fromSocket: 'fac', toNode: 'strata_variation', toSocket: 'b' },
          { fromNode: 'strata_variation', fromSocket: 'result', toNode: 'sandstone_final', toSocket: 'a' },
          { fromNode: 'grain', fromSocket: 'fac', toNode: 'sandstone_final', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'wave', name: 'color_strata', params: { bandsDirection: 'Z', scale: 4.0, detail: 2.0 } },
          { type: 'colorramp', name: 'sandstone_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'color_strata', fromSocket: 'fac', toNode: 'sandstone_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // ChunkyRock — Chunky rock with angular Voronoi fragments
  // ==========================================================================

  /**
   * Create a ChunkyRock surface descriptor.
   *
   * ChunkyRock uses high-amplitude, angular voronoi fragments.
   * The original Infinigen shader combines:
   * - Voronoi (F1, distance) for angular chunk boundaries
   * - Musgrave (RidgedMultifractal) for rough chunk surfaces
   * - Noise for intra-chunk detail
   * - Additive blend for chunky, high-relief displacement
   *
   * @param seed - Random seed for procedural variation
   * @returns ChunkyRock TerrainSurfaceDescriptor
   */
  static chunkyRock(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'chunkyrock');
    return {
      id: `chunkyrock_${seed}`,
      name: 'ChunkyRock',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0x6a6050,
        roughness: 0.95,
        metalness: 0.0,
        normalScale: 1.0,
        opacity: 1.0,
        transparent: false,
        custom: {
          angularFragments: true,
          voronoiChunks: true,
        },
      },
      displacement: {
        amplitude: 0.4,
        frequency: 0.15,
        octaves: 4,
        lacunarity: 2.2,
        persistence: 0.6,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.VORONOI_CRACK_DISPLACEMENT,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.ADD,
        displacementNodes: [
          { type: 'voronoi', name: 'chunk_boundaries', params: { scale: 4.0 + rngVariation(rng, 1.0), feature: 0, smoothness: 0.05 } },
          { type: 'musgrave', name: 'chunk_surface', params: { musgraveType: 'RIDGED_MULTIFRACTAL', scale: 6.0, detail: 5.0, dimension: 1.5, lacunarity: 2.2, offset: 1.0, gain: 2.0 } },
          { type: 'noise', name: 'chunk_detail', params: { noiseType: 'simplex', scale: 15.0, detail: 4.0, distortion: 0.6 } },
          { type: 'mix', name: 'chunk_blend', params: { factor: 0.5 } },
          { type: 'mix', name: 'chunky_final', params: { factor: 0.8 } },
        ],
        displacementLinks: [
          { fromNode: 'chunk_boundaries', fromSocket: 'distance', toNode: 'chunk_blend', toSocket: 'a' },
          { fromNode: 'chunk_surface', fromSocket: 'fac', toNode: 'chunk_blend', toSocket: 'b' },
          { fromNode: 'chunk_blend', fromSocket: 'result', toNode: 'chunky_final', toSocket: 'a' },
          { fromNode: 'chunk_detail', fromSocket: 'fac', toNode: 'chunky_final', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'voronoi', name: 'color_chunks', params: { scale: 4.0, feature: 0, smoothness: 0.05 } },
          { type: 'colorramp', name: 'rock_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'color_chunks', fromSocket: 'distance', toNode: 'rock_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // CobbleStone — Rounded cobblestone pattern
  // ==========================================================================

  /**
   * Create a CobbleStone surface descriptor.
   *
   * CobbleStone uses rounded voronoi pattern with medium amplitude.
   * The original Infinigen shader combines:
   * - Voronoi (F1, smooth) for rounded stone shapes
   * - Voronoi (edge distance) for mortar gaps between stones
   * - Musgrave for per-stone surface variation
   * - ColorRamp for stone/mortar color alternation
   *
   * @param seed - Random seed for procedural variation
   * @returns CobbleStone TerrainSurfaceDescriptor
   */
  static cobbleStone(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'cobblestone');
    return {
      id: `cobblestone_${seed}`,
      name: 'CobbleStone',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0x8a8070,
        roughness: 0.88,
        metalness: 0.0,
        normalScale: 0.9,
        opacity: 1.0,
        transparent: false,
        custom: {
          roundedPattern: true,
        },
      },
      displacement: {
        amplitude: 0.18,
        frequency: 0.25,
        octaves: 3,
        lacunarity: 2.0,
        persistence: 0.5,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.VORONOI_CRACK_DISPLACEMENT,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.MIX,
        displacementNodes: [
          { type: 'voronoi', name: 'stone_shapes', params: { scale: 5.0 + rngVariation(rng, 1.0), feature: 0, smoothness: 1.0 } },
          { type: 'voronoi', name: 'mortar_gaps', params: { scale: 5.0 + rngVariation(rng, 1.0), feature: 2, smoothness: 0.1 } },
          { type: 'musgrave', name: 'stone_surface', params: { musgraveType: 'HETERO_TERRAIN', scale: 8.0, detail: 3.0, dimension: 2.0, lacunarity: 2.0, offset: 0.5 } },
          { type: 'mix', name: 'cobble_blend', params: { factor: 0.7 } },
          { type: 'mix', name: 'cobble_final', params: { factor: 0.8 } },
        ],
        displacementLinks: [
          { fromNode: 'stone_shapes', fromSocket: 'distance', toNode: 'cobble_blend', toSocket: 'a' },
          { fromNode: 'mortar_gaps', fromSocket: 'distance', toNode: 'cobble_blend', toSocket: 'b' },
          { fromNode: 'cobble_blend', fromSocket: 'result', toNode: 'cobble_final', toSocket: 'a' },
          { fromNode: 'stone_surface', fromSocket: 'fac', toNode: 'cobble_final', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'voronoi', name: 'color_stones', params: { scale: 5.0, feature: 0, smoothness: 1.0 } },
          { type: 'colorramp', name: 'cobble_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'color_stones', fromSocket: 'distance', toNode: 'cobble_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // CrackedGround — Dry cracked earth pattern
  // ==========================================================================

  /**
   * Create a CrackedGround surface descriptor.
   *
   * CrackedGround uses voronoi edge patterns for dry earth cracks.
   * The original Infinigen shader combines:
   * - Voronoi (edge distance, two scales) for primary and secondary cracks
   * - Musgrave for base ground variation
   * - ColorRamp for cracked/uncracked earth coloring
   *
   * @param seed - Random seed for procedural variation
   * @returns CrackedGround TerrainSurfaceDescriptor
   */
  static crackedGround(seed: number): TerrainSurfaceDescriptor {
    const rng = seedHash(seed, 'crackedground');
    return {
      id: `crackedground_${seed}`,
      name: 'CrackedGround',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0x7a6a55,
        roughness: 0.92,
        metalness: 0.0,
        normalScale: 1.0,
        opacity: 1.0,
        transparent: false,
        custom: {
          dryCracks: true,
          voronoiEdges: true,
        },
      },
      displacement: {
        amplitude: 0.12,
        frequency: 0.2,
        octaves: 3,
        lacunarity: 2.5,
        persistence: 0.55,
      },
      shaderGraph: {
        displacementType: ShaderGraphType.VORONOI_CRACK_DISPLACEMENT,
        materialType: ShaderGraphType.MATERIAL_CHANNEL,
        blendMode: GraphBlendMode.MAX,
        displacementNodes: [
          { type: 'voronoi', name: 'primary_cracks', params: { scale: 5.0 + rngVariation(rng, 1.0), feature: 2, smoothness: 0.05 } },
          { type: 'voronoi', name: 'secondary_cracks', params: { scale: 12.0 + rngVariation(rng, 3.0), feature: 2, smoothness: 0.1 } },
          { type: 'musgrave', name: 'ground_base', params: { musgraveType: 'fBM', scale: 2.0, detail: 3.0, dimension: 2.0, lacunarity: 2.5, gain: 0.5 } },
          { type: 'mix', name: 'crack_layers', params: { factor: 0.5 } },
          { type: 'mix', name: 'cracked_final', params: { factor: 0.3 } },
        ],
        displacementLinks: [
          { fromNode: 'primary_cracks', fromSocket: 'distance', toNode: 'crack_layers', toSocket: 'a' },
          { fromNode: 'secondary_cracks', fromSocket: 'distance', toNode: 'crack_layers', toSocket: 'b' },
          { fromNode: 'crack_layers', fromSocket: 'result', toNode: 'cracked_final', toSocket: 'a' },
          { fromNode: 'ground_base', fromSocket: 'fac', toNode: 'cracked_final', toSocket: 'b' },
        ],
        materialNodes: [
          { type: 'voronoi', name: 'crack_pattern', params: { scale: 5.0, feature: 2, smoothness: 0.05 } },
          { type: 'colorramp', name: 'crack_color', params: { mode: 'linear' } },
        ],
        materialLinks: [
          { fromNode: 'crack_pattern', fromSocket: 'distance', toNode: 'crack_color', toSocket: 'fac' },
        ],
        coordScale: [1, 1, 1],
      },
    };
  }

  // ==========================================================================
  // Utility: Build descriptors for a collection from original assignments
  // ==========================================================================

  /**
   * Build an array of TerrainSurfaceDescriptors for a given collection name,
   * using seeds derived from the master seed.
   *
   * This mirrors the original Infinigen's `material_assignments` where each
   * collection maps to a list of `(SurfaceClass, weight)` tuples. Here, we
   * instantiate each surface with a unique seed derived from the master seed
   * and the surface name.
   *
   * @param collection - Collection name matching original material_assignments
   * @param masterSeed - Master seed for deterministic generation
   * @returns Array of TerrainSurfaceDescriptors for the collection
   */
  static buildCollection(
    collection: 'ground' | 'mountain' | 'eroded' | 'beach' | 'rock',
    masterSeed: number,
  ): TerrainSurfaceDescriptor[] {
    switch (collection) {
      case 'ground':
        // ground_collection = [(Mud,1),(Sand,1),(CobbleStone,1),(CrackedGround,1),(Dirt,1),(Stone,1),(Soil,1)]
        return [
          TerrainSurfaces.mud(deriveSeed(masterSeed, 'mud')),
          TerrainSurfaces.sand(deriveSeed(masterSeed, 'sand')),
          TerrainSurfaces.cobbleStone(deriveSeed(masterSeed, 'cobblestone')),
          TerrainSurfaces.crackedGround(deriveSeed(masterSeed, 'crackedground')),
          TerrainSurfaces.dirt(deriveSeed(masterSeed, 'dirt')),
          TerrainSurfaces.stone(deriveSeed(masterSeed, 'stone')),
          TerrainSurfaces.soil(deriveSeed(masterSeed, 'soil')),
        ];
      case 'mountain':
        // mountain_collection = [(Mountain,1),(Sandstone,1),(Ice,1)]
        return [
          TerrainSurfaces.mountain(deriveSeed(masterSeed, 'mountain')),
          TerrainSurfaces.sandstone(deriveSeed(masterSeed, 'sandstone')),
          TerrainSurfaces.ice(deriveSeed(masterSeed, 'ice')),
        ];
      case 'eroded':
        // eroded = [(Sand,1),(CrackedGround,1),(Dirt,1),(Stone,1),(Soil,1)]
        return [
          TerrainSurfaces.sand(deriveSeed(masterSeed, 'sand_eroded')),
          TerrainSurfaces.crackedGround(deriveSeed(masterSeed, 'crackedground_eroded')),
          TerrainSurfaces.dirt(deriveSeed(masterSeed, 'dirt_eroded')),
          TerrainSurfaces.stone(deriveSeed(masterSeed, 'stone_eroded')),
          TerrainSurfaces.soil(deriveSeed(masterSeed, 'soil_eroded')),
        ];
      case 'beach':
        // beach = [(Sand,1),(CrackedGround,1),(Dirt,1),(Stone,1),(Soil,1)]
        return [
          TerrainSurfaces.sand(deriveSeed(masterSeed, 'sand_beach')),
          TerrainSurfaces.crackedGround(deriveSeed(masterSeed, 'crackedground_beach')),
          TerrainSurfaces.dirt(deriveSeed(masterSeed, 'dirt_beach')),
          TerrainSurfaces.stone(deriveSeed(masterSeed, 'stone_beach')),
          TerrainSurfaces.soil(deriveSeed(masterSeed, 'soil_beach')),
        ];
      case 'rock':
        // rock_collection — ChunkyRock + Stone
        return [
          TerrainSurfaces.chunkyRock(deriveSeed(masterSeed, 'chunkyrock')),
          TerrainSurfaces.stone(deriveSeed(masterSeed, 'stone_rock')),
        ];
      default:
        return [];
    }
  }

  // ==========================================================================
  // Utility: Get a surface descriptor by name
  // ==========================================================================

  /**
   * Get a terrain surface descriptor by surface name.
   *
   * @param surfaceName - Name of the surface (case-insensitive)
   * @param seed - Random seed for procedural variation
   * @returns TerrainSurfaceDescriptor for the named surface
   * @throws Error if the surface name is not recognized
   */
  static getByName(surfaceName: string, seed: number): TerrainSurfaceDescriptor {
    const lower = surfaceName.toLowerCase();
    switch (lower) {
      case 'sand': return TerrainSurfaces.sand(seed);
      case 'mountain': return TerrainSurfaces.mountain(seed);
      case 'soil': return TerrainSurfaces.soil(seed);
      case 'dirt': return TerrainSurfaces.dirt(seed);
      case 'mud': return TerrainSurfaces.mud(seed);
      case 'stone': return TerrainSurfaces.stone(seed);
      case 'ice': return TerrainSurfaces.ice(seed);
      case 'sandstone': return TerrainSurfaces.sandstone(seed);
      case 'chunkyrock': return TerrainSurfaces.chunkyRock(seed);
      case 'cobblestone': return TerrainSurfaces.cobbleStone(seed);
      case 'crackedground': return TerrainSurfaces.crackedGround(seed);
      default:
        throw new Error(`Unknown terrain surface: "${surfaceName}". ` +
          `Valid surfaces: sand, mountain, soil, dirt, mud, stone, ice, ` +
          `sandstone, chunkyrock, cobblestone, crackedground`);
    }
  }

  // ==========================================================================
  // Utility: List all available surface names
  // ==========================================================================

  /**
   * Get the list of all available terrain surface names.
   *
   * @returns Array of surface name strings
   */
  static getSurfaceNames(): string[] {
    return [
      'sand',
      'mountain',
      'soil',
      'dirt',
      'mud',
      'stone',
      'ice',
      'sandstone',
      'chunkyrock',
      'cobblestone',
      'crackedground',
    ];
  }
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Derive a deterministic seed from a master seed and a label string.
 *
 * Uses FNV-1a hash on the label and XORs with the master seed to produce
 * a unique but deterministic per-surface seed.
 *
 * @param masterSeed - The master seed
 * @param label - A string label (e.g., surface name)
 * @returns A deterministic derived seed
 */
function deriveSeed(masterSeed: number, label: string): number {
  let hash = 2166136261;
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash ^ masterSeed) >>> 0) || 1;
}

/**
 * Seed hash for RNG variation — combines seed and surface name for
 * slight parameter variation in shader graph node parameters.
 *
 * @param seed - Base seed
 * @param surfaceName - Surface name for hashing
 * @returns A deterministic variation seed
 */
function seedHash(seed: number, surfaceName: string): number {
  let hash = 2166136261;
  const label = `terrain_surface_${surfaceName}`;
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash ^ seed) >>> 0) || 1;
}

/**
 * Generate a small random variation from a seed.
 *
 * Returns a value in [-range, +range] derived deterministically from
 * the seed. Used to add slight variation to shader node parameters.
 *
 * @param seed - Deterministic seed
 * @param range - Maximum variation range
 * @returns Variation value in [-range, +range]
 */
function rngVariation(seed: number, range: number): number {
  // Simple hash-based variation
  let h = seed;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  const normalized = ((h & 0x7fffffff) / 0x7fffffff) * 2 - 1; // [-1, 1]
  return normalized * range;
}
