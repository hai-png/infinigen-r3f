/**
 * Terrain Surface Registry
 *
 * Implements the `surface_registry` and `sample_surface_templates` logic from
 * the original Princeton Infinigen's `infinigen/terrain/core.py`. The
 * `TerrainSurfaceRegistry` manages a mapping from attribute types
 * (ground_collection, mountain_collection, rock_collection, snow, beach,
 * eroded, lava, atmosphere, liquid_collection) to weighted lists of surface
 * material generators. When sampling, it selects a material for each
 * attribute type via weighted random choice, then instantiates it with
 * appropriate parameters.
 *
 * In the original Python code:
 * ```python
 * self.surface_registry = {
 *     "atmosphere": process_surface_input(atmosphere, default=[(AtmosphereLightHaze, 1)]),
 *     "beach": process_surface_input(beach, default=material_assignments.beach),
 *     "eroded": process_surface_input(eroded, default=material_assignments.eroded),
 *     "ground_collection": process_surface_input(ground_collection, default=material_assignments.ground),
 *     "lava": process_surface_input(lava, default=[(Lava, 1)]),
 *     "liquid_collection": process_surface_input(liquid_collection, default=material_assignments.liquid),
 *     "mountain_collection": process_surface_input(mountain_collection, default=material_assignments.mountain),
 *     "rock_collection": process_surface_input(rock_collection, default=material_assignments.rock),
 *     "snow": process_surface_input(snow, default=[(Snow, 1)]),
 * }
 * ```
 *
 * The R3F port replaces Python class references with `SurfaceMaterialDescriptor`
 * objects that carry enough information to generate a `THREE.Material` at
 * runtime. The `sampleSurfaceTemplates()` method performs the weighted random
 * selection and returns instantiated `SurfaceTemplate` objects ready for
 * application to terrain geometry.
 *
 * @module terrain/surface/SurfaceRegistry
 */

import * as THREE from 'three';
import { SeededRandom, weightedSample } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

// ============================================================================
// Surface Type Classification
// ============================================================================

/**
 * Classification of surface rendering types.
 *
 * Mirrors the original Infinigen `SurfaceTypes` enum:
 * - SDFPerturb: Surface modifies the SDF field directly (converted to
 *   Displacement during coarse terrain phase if degrade_sdf_to_displacement
 *   is true)
 * - Displacement: Surface applies displacement mapping to the mesh
 * - BlenderDisplacement: Surface uses Blender-specific displacement
 *   modifiers (not applicable in R3F, mapped to regular Displacement)
 */
export enum SurfaceType {
  /** SDF-level perturbation (highest quality, modifies geometry before meshing) */
  SDFPerturb = 'SDFPerturb',
  /** Displacement mapping (applied as vertex displacement post-meshing) */
  Displacement = 'Displacement',
  /** Blender-specific displacement (mapped to Displacement in R3F) */
  BlenderDisplacement = 'BlenderDisplacement',
}

/**
 * Get the effective surface type after applying degradation rules.
 *
 * In the original Infinigen, SDFPerturb surfaces are downgraded to
 * Displacement during the coarse terrain phase. This function implements
 * that logic.
 *
 * @param surfaceType - The nominal surface type
 * @param degradeSDFToDisplacement - Whether to degrade SDFPerturb to Displacement
 * @returns The effective surface type
 */
export function getEffectiveSurfaceType(
  surfaceType: SurfaceType,
  degradeSDFToDisplacement: boolean = true,
): SurfaceType {
  if (degradeSDFToDisplacement && surfaceType === SurfaceType.SDFPerturb) {
    return SurfaceType.Displacement;
  }
  return surfaceType;
}

// ============================================================================
// Surface Material Descriptors
// ============================================================================

/**
 * Descriptor for a surface material that can be weighted-sampled from the
 * registry.
 *
 * Each descriptor carries enough information to:
 * 1. Generate a THREE.Material at runtime
 * 2. Compute displacement values for terrain surface perturbation
 * 3. Identify the surface type (SDFPerturb, Displacement, etc.)
 *
 * This replaces the Python pattern of storing `(MaterialClass, weight)` tuples
 * in the surface_registry dict.
 */
export interface SurfaceMaterialDescriptor {
  /** Unique identifier for this surface material */
  id: string;
  /** Human-readable display name */
  name: string;
  /** The surface type classification */
  surfaceType: SurfaceType;
  /** Weight for random sampling (higher = more likely to be selected) */
  weight: number;
  /** Default PBR parameters for the material */
  params: SurfaceMaterialParams;
  /** Optional displacement configuration */
  displacement?: SurfaceDisplacementConfig;
  /** Optional modifier name for BlenderDisplacement surfaces */
  modName?: string;
}

/**
 * PBR material parameters for a terrain surface.
 *
 * These are the standard physically-based rendering parameters that
 * map to THREE.MeshStandardMaterial properties.
 */
export interface SurfaceMaterialParams {
  /** Base color (albedo) as a hex number or THREE.Color */
  color: number | THREE.Color;
  /** Roughness [0, 1] */
  roughness: number;
  /** Metalness [0, 1] */
  metalness: number;
  /** Normal map intensity */
  normalScale: number;
  /** Opacity [0, 1] (1.0 = fully opaque) */
  opacity: number;
  /** Whether this surface is transparent */
  transparent: boolean;
  /** Additional custom parameters */
  custom?: Record<string, any>;
}

/**
 * Configuration for surface displacement.
 *
 * Controls how the surface perturbs the terrain geometry. SDFPerturb
 * surfaces modify the SDF field before meshing; Displacement surfaces
 * apply vertex displacement after meshing.
 */
export interface SurfaceDisplacementConfig {
  /** Displacement amplitude (world units) */
  amplitude: number;
  /** Displacement frequency (noise scale) */
  frequency: number;
  /** Number of noise octaves for displacement */
  octaves: number;
  /** Lacunarity (frequency multiplier per octave) */
  lacunarity: number;
  /** Persistence (amplitude multiplier per octave) */
  persistence: number;
}

// ============================================================================
// Surface Template
// ============================================================================

/**
 * An instantiated surface template ready for application to terrain.
 *
 * Created by `sampleSurfaceTemplates()` when a `SurfaceMaterialDescriptor`
 * is selected via weighted sampling. Contains the instantiated material
 * and displacement data ready for use in the rendering pipeline.
 */
export class SurfaceTemplate {
  /** Unique identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Surface type classification */
  readonly surfaceType: SurfaceType;
  /** The PBR material parameters */
  readonly params: SurfaceMaterialParams;
  /** Displacement configuration (if applicable) */
  readonly displacement: SurfaceDisplacementConfig | null;
  /** Modifier name for BlenderDisplacement surfaces */
  readonly modName: string | null;
  /** The source descriptor that was sampled */
  readonly sourceDescriptor: SurfaceMaterialDescriptor;

  /** Lazily-created THREE.Material */
  private cachedMaterial: THREE.MeshStandardMaterial | null = null;

  constructor(descriptor: SurfaceMaterialDescriptor) {
    this.id = descriptor.id;
    this.name = descriptor.name;
    this.surfaceType = descriptor.surfaceType;
    this.params = { ...descriptor.params };
    this.displacement = descriptor.displacement ? { ...descriptor.displacement } : null;
    this.modName = descriptor.modName ?? null;
    this.sourceDescriptor = descriptor;
  }

  /**
   * Get or create the THREE.Material for this surface template.
   *
   * The material is created lazily and cached for reuse.
   * Call dispose() to release GPU resources.
   *
   * @returns The PBR material for this surface
   */
  getMaterial(): THREE.MeshStandardMaterial {
    if (this.cachedMaterial) return this.cachedMaterial;

    const color = this.params.color instanceof THREE.Color
      ? this.params.color
      : new THREE.Color(this.params.color);

    this.cachedMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: this.params.roughness,
      metalness: this.params.metalness,
      opacity: this.params.opacity,
      transparent: this.params.transparent,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    return this.cachedMaterial;
  }

  /**
   * Compute displacement value at a given world position.
   *
   * Uses multi-octave FBM noise with the displacement configuration
   * parameters. Returns 0 if no displacement is configured.
   *
   * @param position - World-space position
   * @param noise - Noise generator instance
   * @returns Displacement value in world units
   */
  computeDisplacement(position: THREE.Vector3, noise: NoiseUtils): number {
    if (!this.displacement) return 0;

    const { amplitude, frequency, octaves, lacunarity, persistence } = this.displacement;
    let value = 0;
    let amp = amplitude;
    let freq = frequency;

    for (let i = 0; i < octaves; i++) {
      value += noise.fbm(
        position.x * freq,
        position.y * freq,
        position.z * freq,
        1,
      ) * amp;
      amp *= persistence;
      freq *= lacunarity;
    }

    return value;
  }

  /**
   * Dispose GPU resources held by this template.
   */
  dispose(): void {
    if (this.cachedMaterial) {
      this.cachedMaterial.dispose();
      this.cachedMaterial = null;
    }
  }
}

// ============================================================================
// Attribute Types
// ============================================================================

/**
 * Attribute types that map to surface material collections.
 *
 * These correspond to the keys in the original Python `surface_registry` dict
 * and the `element.attributes` sets that determine which surface is applied
 * to which part of the terrain.
 */
export const SurfaceAttributeTypes = {
  /** Ground/soil surfaces */
  GroundCollection: 'ground_collection',
  /** Mountain/cliff surfaces */
  MountainCollection: 'mountain_collection',
  /** Rock/boulder surfaces */
  RockCollection: 'rock_collection',
  /** Snow surfaces */
  Snow: 'snow',
  /** Beach/shoreline surfaces */
  Beach: 'beach',
  /** Eroded/weathered surfaces */
  Eroded: 'eroded',
  /** Lava surfaces */
  Lava: 'lava',
  /** Atmosphere/fog surfaces */
  Atmosphere: 'atmosphere',
  /** Water/liquid surfaces */
  LiquidCollection: 'liquid_collection',
} as const;

export type SurfaceAttributeType = typeof SurfaceAttributeTypes[keyof typeof SurfaceAttributeTypes];

// ============================================================================
// Default Surface Material Descriptors
// ============================================================================

/**
 * Default surface material descriptors for each attribute type.
 *
 * These provide reasonable defaults matching the original Infinigen
 * `material_assignments` and specific material classes.
 */
const DEFAULT_DESCRIPTORS: Record<SurfaceAttributeType, SurfaceMaterialDescriptor[]> = {
  // ---------------------------------------------------------------------------
  // ground_collection — mirrors original: [(Mud,1),(Sand,1),(CobbleStone,1),
  //   (CrackedGround,1),(Dirt,1),(Stone,1),(Soil,1)]
  // ---------------------------------------------------------------------------
  [SurfaceAttributeTypes.GroundCollection]: [
    {
      id: 'mud',
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
        custom: { wetness: 0.7, crackWhenDry: true },
      },
      displacement: { amplitude: 0.04, frequency: 0.06, octaves: 3, lacunarity: 2.0, persistence: 0.45 },
    },
    {
      id: 'sand',
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
        custom: { wetDryColor: true, duneRipple: true },
      },
      displacement: { amplitude: 0.03, frequency: 0.08, octaves: 3, lacunarity: 2.2, persistence: 0.4 },
    },
    {
      id: 'cobblestone',
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
        custom: { roundedPattern: true },
      },
      displacement: { amplitude: 0.18, frequency: 0.25, octaves: 3, lacunarity: 2.0, persistence: 0.5 },
    },
    {
      id: 'crackedground',
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
        custom: { dryCracks: true, voronoiEdges: true },
      },
      displacement: { amplitude: 0.12, frequency: 0.2, octaves: 3, lacunarity: 2.5, persistence: 0.55 },
    },
    {
      id: 'dirt',
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
        custom: { rockFragments: true, mixedNoise: true },
      },
      displacement: { amplitude: 0.1, frequency: 0.07, octaves: 4, lacunarity: 2.0, persistence: 0.5 },
    },
    {
      id: 'stone',
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
        custom: { veins: true, cracks: true, layeredNoise: true },
      },
      displacement: { amplitude: 0.2, frequency: 0.1, octaves: 5, lacunarity: 2.0, persistence: 0.5 },
    },
    {
      id: 'soil',
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
        custom: { organicTexture: true, fineGrained: true },
      },
      displacement: { amplitude: 0.05, frequency: 0.04, octaves: 4, lacunarity: 2.0, persistence: 0.45 },
    },
  ],

  // ---------------------------------------------------------------------------
  // mountain_collection — mirrors original: [(Mountain,1),(Sandstone,1),(Ice,1)]
  // ---------------------------------------------------------------------------
  [SurfaceAttributeTypes.MountainCollection]: [
    {
      id: 'mountain',
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
        custom: { altitudeColored: true, voronoiCracks: true, layeredNoise: true },
      },
      displacement: { amplitude: 0.6, frequency: 0.08, octaves: 6, lacunarity: 2.0, persistence: 0.55 },
    },
    {
      id: 'sandstone',
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
        custom: { stratification: true, horizontalLayers: true },
      },
      displacement: { amplitude: 0.15, frequency: 0.06, octaves: 4, lacunarity: 2.0, persistence: 0.5 },
    },
    {
      id: 'ice',
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
        custom: { cracks: true, refractions: true, specular: true },
      },
      displacement: { amplitude: 0.08, frequency: 0.12, octaves: 3, lacunarity: 2.0, persistence: 0.4 },
    },
  ],

  // ---------------------------------------------------------------------------
  // rock_collection — not in original material_assignments but kept for
  // compatibility; uses ChunkyRock and Stone surfaces
  // ---------------------------------------------------------------------------
  [SurfaceAttributeTypes.RockCollection]: [
    {
      id: 'chunkyrock',
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
        custom: { angularFragments: true, voronoiChunks: true },
      },
      displacement: { amplitude: 0.4, frequency: 0.15, octaves: 4, lacunarity: 2.2, persistence: 0.6 },
    },
    {
      id: 'stone_rock',
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
        custom: { veins: true, cracks: true },
      },
      displacement: { amplitude: 0.2, frequency: 0.1, octaves: 5, lacunarity: 2.0, persistence: 0.5 },
    },
  ],

  // ---------------------------------------------------------------------------
  // snow — mirrors original: [(Snow, 1)]
  // ---------------------------------------------------------------------------
  [SurfaceAttributeTypes.Snow]: [
    {
      id: 'snow',
      name: 'Snow',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0xe8ecf4,
        roughness: 0.6,
        metalness: 0.0,
        normalScale: 0.3,
        opacity: 1.0,
        transparent: false,
      },
      displacement: { amplitude: 0.05, frequency: 0.02, octaves: 3, lacunarity: 2.0, persistence: 0.5 },
    },
  ],

  // ---------------------------------------------------------------------------
  // beach — mirrors original: [(Sand,1),(CrackedGround,1),(Dirt,1),(Stone,1),(Soil,1)]
  // ---------------------------------------------------------------------------
  [SurfaceAttributeTypes.Beach]: [
    {
      id: 'sand_beach',
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
        custom: { wetDryColor: true, duneRipple: true },
      },
      displacement: { amplitude: 0.03, frequency: 0.08, octaves: 3, lacunarity: 2.2, persistence: 0.4 },
    },
    {
      id: 'crackedground_beach',
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
        custom: { dryCracks: true, voronoiEdges: true },
      },
      displacement: { amplitude: 0.12, frequency: 0.2, octaves: 3, lacunarity: 2.5, persistence: 0.55 },
    },
    {
      id: 'dirt_beach',
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
        custom: { rockFragments: true },
      },
      displacement: { amplitude: 0.1, frequency: 0.07, octaves: 4, lacunarity: 2.0, persistence: 0.5 },
    },
    {
      id: 'stone_beach',
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
        custom: { veins: true },
      },
      displacement: { amplitude: 0.2, frequency: 0.1, octaves: 5, lacunarity: 2.0, persistence: 0.5 },
    },
    {
      id: 'soil_beach',
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
        custom: { organicTexture: true },
      },
      displacement: { amplitude: 0.05, frequency: 0.04, octaves: 4, lacunarity: 2.0, persistence: 0.45 },
    },
  ],

  // ---------------------------------------------------------------------------
  // eroded — mirrors original: [(Sand,1),(CrackedGround,1),(Dirt,1),(Stone,1),(Soil,1)]
  // ---------------------------------------------------------------------------
  [SurfaceAttributeTypes.Eroded]: [
    {
      id: 'sand_eroded',
      name: 'Sand',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0xb8a870,
        roughness: 0.95,
        metalness: 0.0,
        normalScale: 0.7,
        opacity: 1.0,
        transparent: false,
        custom: { duneRipple: true },
      },
      displacement: { amplitude: 0.03, frequency: 0.08, octaves: 3, lacunarity: 2.2, persistence: 0.4 },
    },
    {
      id: 'crackedground_eroded',
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
        custom: { dryCracks: true, voronoiEdges: true },
      },
      displacement: { amplitude: 0.12, frequency: 0.2, octaves: 3, lacunarity: 2.5, persistence: 0.55 },
    },
    {
      id: 'dirt_eroded',
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
        custom: { rockFragments: true },
      },
      displacement: { amplitude: 0.1, frequency: 0.07, octaves: 4, lacunarity: 2.0, persistence: 0.5 },
    },
    {
      id: 'stone_eroded',
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
        custom: { veins: true, cracks: true },
      },
      displacement: { amplitude: 0.2, frequency: 0.1, octaves: 5, lacunarity: 2.0, persistence: 0.5 },
    },
    {
      id: 'soil_eroded',
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
        custom: { organicTexture: true },
      },
      displacement: { amplitude: 0.05, frequency: 0.04, octaves: 4, lacunarity: 2.0, persistence: 0.45 },
    },
  ],

  // ---------------------------------------------------------------------------
  // lava — mirrors original: [(Lava, 1)]
  // ---------------------------------------------------------------------------
  [SurfaceAttributeTypes.Lava]: [
    {
      id: 'lava',
      name: 'Lava',
      surfaceType: SurfaceType.SDFPerturb,
      weight: 1,
      params: {
        color: 0xff4400,
        roughness: 0.3,
        metalness: 0.1,
        normalScale: 0.5,
        opacity: 1.0,
        transparent: false,
        custom: { emissive: 0xff2200, emissiveIntensity: 0.6 },
      },
      displacement: { amplitude: 0.5, frequency: 0.15, octaves: 3, lacunarity: 2.0, persistence: 0.5 },
      modName: 'lava_displacement',
    },
  ],

  // ---------------------------------------------------------------------------
  // atmosphere — mirrors original: [(AtmosphereLightHaze, 1)]
  // ---------------------------------------------------------------------------
  [SurfaceAttributeTypes.Atmosphere]: [
    {
      id: 'atmosphere_haze',
      name: 'AtmosphereLightHaze',
      surfaceType: SurfaceType.Displacement,
      weight: 1,
      params: { color: 0xc0d0e0, roughness: 1.0, metalness: 0.0, normalScale: 0.0, opacity: 0.3, transparent: true },
    },
  ],

  // ---------------------------------------------------------------------------
  // liquid_collection — mirrors original: [(Water, 1)]
  // ---------------------------------------------------------------------------
  [SurfaceAttributeTypes.LiquidCollection]: [
    {
      id: 'water',
      name: 'Water',
      surfaceType: SurfaceType.Displacement,
      weight: 1,
      params: { color: 0x1e5080, roughness: 0.1, metalness: 0.0, normalScale: 0.3, opacity: 0.85, transparent: true },
      displacement: { amplitude: 0.05, frequency: 0.5, octaves: 2, lacunarity: 2.0, persistence: 0.5 },
    },
  ],
};

// ============================================================================
// TerrainSurfaceRegistry
// ============================================================================

/**
 * Surface material registry for terrain rendering.
 *
 * Manages the mapping from attribute types (ground_collection, mountain_collection,
 * etc.) to weighted lists of surface material descriptors. Provides methods for:
 * - Weighted random sampling of surface templates per attribute type
 * - Looking up sampled surfaces for a given attribute
 * - Creating THREE.Material instances from sampled templates
 *
 * Mirrors the original Infinigen `surface_registry` dict and the
 * `sample_surface_templates()` method from `Terrain.__init__`.
 *
 * Usage:
 * ```typescript
 * const registry = new TerrainSurfaceRegistry(42);
 * registry.sampleSurfaceTemplates();
 * const groundTemplate = registry.getSurface('ground_collection');
 * const material = groundTemplate?.getMaterial();
 * ```
 */
export class TerrainSurfaceRegistry {
  /** Per-attribute-type weighted material descriptor lists */
  private registry: Map<SurfaceAttributeType, SurfaceMaterialDescriptor[]>;

  /** Sampled surface templates (populated by sampleSurfaceTemplates) */
  private surfaces: Map<SurfaceAttributeType, SurfaceTemplate>;

  /** Random seed for reproducible sampling */
  private seed: number;

  /** Whether sampleSurfaceTemplates has been called */
  private sampled: boolean;

  /**
   * Create a new TerrainSurfaceRegistry.
   *
   * @param seed - Master seed for reproducible surface sampling
   * @param overrides - Optional overrides for specific attribute types.
   *   Each key is an attribute type, each value is an array of material
   *   descriptors that replace the defaults for that attribute type.
   */
  constructor(
    seed: number,
    overrides: Partial<Record<SurfaceAttributeType, SurfaceMaterialDescriptor[]>> = {},
  ) {
    this.seed = seed;
    this.registry = new Map();
    this.surfaces = new Map();
    this.sampled = false;

    // Initialize with default descriptors
    for (const [attrType, descriptors] of Object.entries(DEFAULT_DESCRIPTORS)) {
      this.registry.set(
        attrType as SurfaceAttributeType,
        descriptors as SurfaceMaterialDescriptor[],
      );
    }

    // Apply overrides
    for (const [attrType, descriptors] of Object.entries(overrides)) {
      if (descriptors && descriptors.length > 0) {
        this.registry.set(
          attrType as SurfaceAttributeType,
          descriptors,
        );
      }
    }
  }

  /**
   * Sample surface templates for all attribute types.
   *
   * For each attribute type in the registry, performs a weighted random
   * selection of one material descriptor and instantiates it as a
   * `SurfaceTemplate`. This mirrors the original Infinigen's
   * `sample_surface_templates()` method.
   *
   * Can be called multiple times to re-sample (e.g., for the fine terrain
   * phase where surfaces need to be re-sampled to ensure attribute-surface
   * correspondence).
   *
   * @param reseed - Optional new seed for this sampling pass. If not
   *   provided, derives from the master seed.
   */
  sampleSurfaceTemplates(reseed?: number): void {
    // Dispose old templates
    for (const template of this.surfaces.values()) {
      template.dispose();
    }
    this.surfaces.clear();

    // Create RNG with a seed derived from the master seed + "terrain surface"
    const sampleSeed = reseed ?? this.computeSurfaceSeed();
    const rng = new SeededRandom(sampleSeed);

    for (const [attrType, descriptors] of this.registry) {
      if (descriptors.length === 0) continue;

      // Weighted random selection
      const weights = descriptors.map((d) => d.weight);
      const selected = weightedSample(descriptors, rng, weights);

      // Instantiate as a SurfaceTemplate
      const template = new SurfaceTemplate(selected);
      this.surfaces.set(attrType, template);
    }

    this.sampled = true;
  }

  /**
   * Get the sampled surface template for a given attribute type.
   *
   * @param attributeType - The attribute type to look up
   * @returns The sampled SurfaceTemplate, or undefined if not yet sampled
   *   or no descriptors are registered for this attribute type
   */
  getSurface(attributeType: SurfaceAttributeType): SurfaceTemplate | undefined {
    return this.surfaces.get(attributeType);
  }

  /**
   * Get all sampled surface templates.
   *
   * @returns Map of attribute type to SurfaceTemplate
   */
  getAllSurfaces(): Map<SurfaceAttributeType, SurfaceTemplate> {
    return new Map(this.surfaces);
  }

  /**
   * Get the list of material descriptors for a given attribute type.
   *
   * @param attributeType - The attribute type to look up
   * @returns Array of material descriptors, or empty array if not registered
   */
  getDescriptors(attributeType: SurfaceAttributeType): SurfaceMaterialDescriptor[] {
    return this.registry.get(attributeType) ?? [];
  }

  /**
   * Add or replace material descriptors for a given attribute type.
   *
   * @param attributeType - The attribute type to register
   * @param descriptors - Array of material descriptors
   */
  registerDescriptors(
    attributeType: SurfaceAttributeType,
    descriptors: SurfaceMaterialDescriptor[],
  ): void {
    this.registry.set(attributeType, descriptors);
    this.sampled = false; // Invalidate sampling
  }

  /**
   * Add a single material descriptor to an existing attribute type.
   *
   * @param attributeType - The attribute type
   * @param descriptor - The material descriptor to add
   */
  addDescriptor(
    attributeType: SurfaceAttributeType,
    descriptor: SurfaceMaterialDescriptor,
  ): void {
    const existing = this.registry.get(attributeType) ?? [];
    existing.push(descriptor);
    this.registry.set(attributeType, existing);
    this.sampled = false;
  }

  /**
   * Check whether surface templates have been sampled.
   *
   * @returns True if sampleSurfaceTemplates has been called
   */
  isSampled(): boolean {
    return this.sampled;
  }

  /**
   * Apply sampled surface templates to compute displacement for a terrain vertex.
   *
   * For each surface that has displacement configured, evaluates the
   * displacement value at the given position. Returns the total
   * displacement from all applicable surfaces.
   *
   * This is the equivalent of the original `apply_surface_templates()` and
   * `surfaces_into_sdf()` combined for a single point.
   *
   * @param position - World-space position
   * @param attributeType - The attribute type at this position
   * @param noise - Noise generator for displacement computation
   * @returns Displacement value in world units
   */
  computeDisplacement(
    position: THREE.Vector3,
    attributeType: SurfaceAttributeType,
    noise: NoiseUtils,
  ): number {
    const template = this.surfaces.get(attributeType);
    if (!template) return 0;

    const effectiveType = getEffectiveSurfaceType(template.surfaceType);
    if (effectiveType === SurfaceType.Displacement || effectiveType === SurfaceType.SDFPerturb) {
      return template.computeDisplacement(position, noise);
    }

    return 0;
  }

  /**
   * Apply a surface template's material to a THREE.Mesh.
   *
   * This is the R3F equivalent of the original `apply_surface_templates()`
   * that assigns Blender materials to terrain objects. In R3F, we simply
   * set the material on the mesh.
   *
   * @param mesh - The mesh to apply the surface to
   * @param attributeType - The attribute type whose surface to apply
   * @returns True if a surface was applied, false otherwise
   */
  applySurfaceToMesh(
    mesh: THREE.Mesh,
    attributeType: SurfaceAttributeType,
  ): boolean {
    const template = this.surfaces.get(attributeType);
    if (!template) return false;

    mesh.material = template.getMaterial();
    return true;
  }

  /**
   * Get the list of attribute types that have SDFPerturb surfaces.
   *
   * Used by the `surfaces_into_sdf()` step to identify which surfaces
   * need to be converted to SDF perturbation data for the terrain elements.
   *
   * @returns Array of attribute types with SDFPerturb surface type
   */
  getSDFPerturbAttributes(): SurfaceAttributeType[] {
    const result: SurfaceAttributeType[] = [];
    for (const [attrType, template] of this.surfaces) {
      if (template.surfaceType === SurfaceType.SDFPerturb) {
        result.push(attrType);
      }
    }
    return result;
  }

  /**
   * Get the list of attribute types that have Displacement surfaces.
   *
   * Used by the pipeline to identify which surfaces need displacement
   * map baking.
   *
   * @returns Array of attribute types with Displacement surface type
   */
  getDisplacementAttributes(): SurfaceAttributeType[] {
    const result: SurfaceAttributeType[] = [];
    for (const [attrType, template] of this.surfaces) {
      const effectiveType = getEffectiveSurfaceType(template.surfaceType);
      if (effectiveType === SurfaceType.Displacement) {
        result.push(attrType);
      }
    }
    return result;
  }

  /**
   * Get the list of attribute types that have BlenderDisplacement surfaces.
   *
   * In the R3F port, these are treated the same as regular Displacement
   * surfaces but tracked separately for compatibility with the original
   * pipeline structure.
   *
   * @returns Array of attribute types with BlenderDisplacement surface type
   */
  getBlenderDisplacementAttributes(): SurfaceAttributeType[] {
    const result: SurfaceAttributeType[] = [];
    for (const [attrType, template] of this.surfaces) {
      if (template.surfaceType === SurfaceType.BlenderDisplacement) {
        result.push(attrType);
      }
    }
    return result;
  }

  /**
   * Compute a deterministic surface sampling seed from the master seed.
   *
   * Uses the same FNV-1a hash approach as the scene composer to derive
   * a per-surface-system seed.
   *
   * @returns A deterministic seed for surface sampling
   */
  private computeSurfaceSeed(): number {
    let hash = 2166136261;
    const label = 'terrain surface';
    for (let i = 0; i < label.length; i++) {
      hash ^= label.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash ^ this.seed) >>> 0) || 1;
  }

  /**
   * Dispose all GPU resources held by sampled surface templates.
   */
  dispose(): void {
    for (const template of this.surfaces.values()) {
      template.dispose();
    }
    this.surfaces.clear();
    this.sampled = false;
  }
}

// ============================================================================
// process_surface_input equivalent
// ============================================================================

/**
 * Process a surface input specification into an array of material descriptors.
 *
 * Mirrors the Python `process_surface_input()` function which handles:
 * - None input: returns the default descriptor list
 * - String input: returns the descriptors from DEFAULT_DESCRIPTORS for that key
 * - Array input: returns the array as-is (already valid descriptors)
 *
 * @param input - The surface input specification
 * @param defaults - Default descriptors to use if input is null/undefined
 * @returns Array of surface material descriptors
 */
export function processSurfaceInput(
  input: SurfaceMaterialDescriptor[] | string | null | undefined,
  defaults: SurfaceMaterialDescriptor[],
): SurfaceMaterialDescriptor[] {
  if (input === null || input === undefined) {
    return defaults;
  }

  if (typeof input === 'string') {
    // Look up by attribute type name
    const lookup = DEFAULT_DESCRIPTORS[input as SurfaceAttributeType];
    return lookup ?? defaults;
  }

  // Already an array of descriptors
  return input;
}
