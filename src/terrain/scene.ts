/**
 * Terrain Scene Composition System
 *
 * Implements the full `scene()` function from the original Princeton Infinigen's
 * `infinigen/terrain/scene.py`. The `TerrainSceneComposer` probabilistically
 * activates terrain elements (caves, ground, landtiles, warped rocks, voronoi
 * rocks, waterbody, atmosphere, etc.), creates dependency chains between them,
 * tracks the "last ground element" for downstream dependency resolution, and
 * returns a structured `SceneComposition` containing the active element map and
 * scene-level metadata (water plane height, dominant biome, active element list).
 *
 * Key differences from the Python version:
 * - Uses `ElementRegistry` instead of a plain Python dict for element management
 * - All RNG is consumed through `SeededRandom` (no `FixedSeed` context manager,
 *   we instead derive per-element seeds via `intHash`)
 * - Dependencies are resolved through the registry's topological sort rather
 *   than being manually passed as constructor arguments
 * - The `SceneComposition` return type is strongly typed
 *
 * @module terrain/scene
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import {
  ElementRegistry,
  TerrainElement,
  GroundElement,
  MountainElement,
  CaveElement,
  VoronoiRockElement,
  WaterbodyElement,
  LandTilesElement,
  WarpedRocksElement,
  UpsideDownMountainNewElement,
  AtmosphereElement,
} from '@/terrain/sdf/TerrainElementSystem';

// ============================================================================
// Utility: intHash (deterministic seed combiner)
// ============================================================================

/**
 * Deterministic hash combining multiple values into a single seed.
 *
 * Mirrors the Python `int_hash` / `FixedSeed(int_hash([seed, "label"]))`
 * pattern used in the original Infinigen to derive per-element seeds from
 * the master seed plus a label string.
 *
 * Implementation uses FNV-1a on the label string XORed with the numeric seed
 * to produce a well-distributed 32-bit integer.
 *
 * @param seed - Master seed value
 * @param label - String label to distinguish different seed derivations
 * @returns A deterministic integer seed
 */
function computeElementSeed(seed: number, label: string): number {
  // FNV-1a hash of the label
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  // Combine with the numeric seed
  return ((hash ^ seed) >>> 0) || 1; // Ensure non-zero
}

/**
 * Probabilistic activation check.
 *
 * Returns true with the given probability (0.0 to 1.0).
 * Matches the Python `chance(probability)` utility.
 *
 * @param probability - Activation chance [0, 1]
 * @param rng - Seeded random number generator
 * @returns Whether the element should be activated
 */
function chance(probability: number, rng: SeededRandom): boolean {
  return rng.next() < probability;
}

// ============================================================================
// Element Names
// ============================================================================

/**
 * Canonical element names matching the original Infinigen ElementNames enum.
 *
 * These are the keys used in the elements dictionary and the names
 * that `TerrainElement.name` should return for each element type.
 */
export const ElementNames = {
  Caves: 'Caves',
  Ground: 'Ground',
  LandTiles: 'LandTiles',
  Mountains: 'Mountains',
  WarpedRocks: 'WarpedRocks',
  VoronoiRocks: 'VoronoiRocks',
  VoronoiGrains: 'VoronoiGrains',
  UpsidedownMountains: 'UpsidedownMountains',
  Volcanos: 'Volcanos',
  FloatingIce: 'FloatingIce',
  Liquid: 'Liquid',
  Atmosphere: 'Atmosphere',
} as const;

export type ElementName = typeof ElementNames[keyof typeof ElementNames];

// ============================================================================
// Scene Composition Configuration
// ============================================================================

/**
 * Probabilistic activation chances for each terrain element.
 *
 * Matches the gin.configurable parameters of the original `scene()` function.
 * Each value is a probability [0, 1] that the corresponding element will be
 * activated for a given scene.
 */
export interface SceneChances {
  /** Probability of generating caves (default: 0.5) */
  caves_chance: number;
  /** Probability of generating ground terrain (default: 1.0) */
  ground_chance: number;
  /** Probability of generating landtiles terrain (default: 1.0) */
  landtiles_chance: number;
  /** Probability of generating warped rocks (default: 0.3) */
  warped_rocks_chance: number;
  /** Probability of generating voronoi rocks (default: 0.5) */
  voronoi_rocks_chance: number;
  /** Probability of generating voronoi grains (default: 0) */
  voronoi_grains_chance: number;
  /** Probability of generating upside-down mountains (default: 0) */
  upsidedown_mountains_chance: number;
  /** Probability of generating a waterbody (default: 0.5) */
  waterbody_chance: number;
  /** Probability of generating volcanos (default: 0) */
  volcanos_chance: number;
  /** Probability of generating floating ice (default: 0) */
  ground_ice_chance: number;
}

/**
 * Default activation chances matching the original Infinigen defaults.
 */
export const DEFAULT_SCENE_CHANCES: SceneChances = {
  caves_chance: 0.5,
  ground_chance: 1.0,
  landtiles_chance: 1.0,
  warped_rocks_chance: 0.3,
  voronoi_rocks_chance: 0.5,
  voronoi_grains_chance: 0.0,
  upsidedown_mountains_chance: 0.0,
  waterbody_chance: 0.5,
  volcanos_chance: 0.0,
  ground_ice_chance: 0.0,
};

/**
 * Parameters for element initialization.
 *
 * Each key maps an element name to its init() params object.
 * If an element is activated but has no entry here, default params are used.
 */
export type ElementParamsMap = Partial<Record<ElementName, Record<string, any>>>;

/**
 * Scene-level metadata returned by the composer.
 *
 * Mirrors the `scene_infos` dict from the original Python `scene()` function,
 * plus additional R3F-specific metadata.
 */
export interface SceneInfos {
  /** Height of the water plane (-1e5 if no waterbody is active) */
  water_plane: number;
  /** List of active element names */
  active_elements: ElementName[];
  /** Name of the last ground element (Ground or LandTiles) */
  last_ground_element: ElementName | null;
  /** Dominant biome type (null if not yet computed) */
  dominant_biome: string | null;
  /** Whether the scene contains caves */
  has_caves: boolean;
  /** Whether the scene contains a waterbody */
  has_waterbody: boolean;
  /** Whether the scene uses landtiles (replaces simple ground) */
  uses_landtiles: boolean;
  /** Scene bounding box for generation */
  bounds: THREE.Box3 | null;
}

/**
 * Result of scene composition.
 *
 * Contains the populated ElementRegistry with all active elements initialized
 * and dependency-resolved, plus scene-level metadata.
 */
export interface SceneComposition {
  /** The element registry with all active elements registered and initialized */
  registry: ElementRegistry;
  /** Scene-level metadata */
  infos: SceneInfos;
  /** Map of element names to their activated instances */
  elements: Map<string, TerrainElement>;
}

// ============================================================================
// TerrainSceneComposer
// ============================================================================

/**
 * Scene composition engine implementing the original Infinigen `scene()` function.
 *
 * This class manages the probabilistic activation of terrain elements and their
 * dependency chain resolution. The composition algorithm follows the original
 * Python implementation:
 *
 * 1. Determine caves activation (independent, no dependencies)
 * 2. Determine ground activation (depends on caves if caves are active)
 * 3. Determine landtiles activation (depends on caves; replaces ground as
 *    last_ground_element if active)
 * 4. Assert that at least one ground element is active
 * 5. Determine warped rocks activation (depends on caves)
 * 6. Determine voronoi rocks activation (depends on last_ground_element and caves)
 * 7. Determine upside-down mountains activation (independent)
 * 8. Determine waterbody activation (depends on landtiles if present)
 * 9. Always add atmosphere element (depends on waterbody)
 *
 * Usage:
 * ```typescript
 * const composer = new TerrainSceneComposer(42);
 * const composition = composer.compose();
 * // composition.registry now contains all active elements
 * // composition.infos.water_plane gives the water height
 * ```
 */
export class TerrainSceneComposer {
  /** Master seed for the entire scene */
  private seed: number;

  /** Probabilistic activation chances */
  private chances: SceneChances;

  /** Per-element init parameters */
  private elementParams: ElementParamsMap;

  /** World-space bounds for the scene */
  private bounds: THREE.Box3 | null;

  /** Whether to use spherical planet mode */
  private sphericalMode: boolean;

  /** Sphere radius for spherical mode */
  private sphereRadius: number;

  /**
   * Create a new TerrainSceneComposer.
   *
   * @param seed - Master random seed for reproducibility
   * @param chances - Probabilistic activation chances (defaults to DEFAULT_SCENE_CHANCES)
   * @param elementParams - Per-element initialization parameters
   * @param bounds - World-space bounds for the scene (default: -100 to 100 XZ, -10 to 50 Y)
   * @param sphericalMode - Whether to use spherical planet mode (default: false)
   * @param sphereRadius - Radius for spherical mode (default: 1000)
   */
  constructor(
    seed: number,
    chances: Partial<SceneChances> = {},
    elementParams: ElementParamsMap = {},
    bounds: THREE.Box3 | null = null,
    sphericalMode: boolean = false,
    sphereRadius: number = 1000,
  ) {
    this.seed = seed;
    this.chances = { ...DEFAULT_SCENE_CHANCES, ...chances };
    this.elementParams = elementParams;
    this.sphericalMode = sphericalMode;
    this.sphereRadius = sphereRadius;

    // Default bounds: -100 to 100 in XZ, -10 to 50 in Y
    this.bounds = bounds ?? new THREE.Box3(
      new THREE.Vector3(-100, -10, -100),
      new THREE.Vector3(100, 50, 100),
    );
  }

  /**
   * Compose the terrain scene.
   *
   * This is the main entry point, equivalent to calling `scene()` in the
   * original Infinigen. It probabilistically activates elements, initializes
   * them with derived seeds, resolves dependencies, and returns a
   * `SceneComposition` containing the populated registry and scene metadata.
   *
   * @returns The composed scene with registry and metadata
   * @throws Error if neither Ground nor LandTiles is activated
   */
  compose(): SceneComposition {
    const registry = new ElementRegistry(0.3);
    const elements = new Map<string, TerrainElement>();
    const infos: SceneInfos = {
      water_plane: -1e5,
      active_elements: [],
      last_ground_element: null,
      dominant_biome: null,
      has_caves: false,
      has_waterbody: false,
      uses_landtiles: false,
      bounds: this.bounds,
    };

    // ====================================================================
    // Step 1: Caves
    // ====================================================================
    let cavesElement: CaveElement | null = null;

    const cavesSeed = computeElementSeed(this.seed, 'caves');
    const cavesRng = new SeededRandom(cavesSeed);

    if (chance(this.chances.caves_chance, cavesRng)) {
      cavesElement = new CaveElement();
      const params = this.getElementParams(ElementNames.Caves, { bounds: this.bounds });
      cavesElement.init(params, cavesRng);
      cavesElement.enabled = true;
      registry.register(cavesElement);
      elements.set(ElementNames.Caves, cavesElement);
      infos.has_caves = true;
    }

    // ====================================================================
    // Step 2: Ground
    // ====================================================================
    let lastGroundElement: TerrainElement | null = null;

    const groundSeed = computeElementSeed(this.seed, 'ground');
    const groundRng = new SeededRandom(groundSeed);

    if (chance(this.chances.ground_chance, groundRng)) {
      const groundParams = this.getElementParams(ElementNames.Ground, {
        mode: this.sphericalMode ? 'spherical' : 'flat',
        sphereRadius: this.sphereRadius,
      });
      const groundElement = new GroundElement();
      groundElement.init(groundParams, groundRng);
      groundElement.enabled = true;
      registry.register(groundElement);
      elements.set(ElementNames.Ground, groundElement);
      lastGroundElement = groundElement;
      infos.last_ground_element = ElementNames.Ground;
    }

    // ====================================================================
    // Step 3: LandTiles
    // ====================================================================
    const landtilesSeed = computeElementSeed(this.seed, 'landtiles');
    const landtilesRng = new SeededRandom(landtilesSeed);

    if (chance(this.chances.landtiles_chance, landtilesRng)) {
      const landtilesParams = this.getElementParams(ElementNames.LandTiles, {
        bounds: this.bounds,
      });
      const landtilesElement = new LandTilesElement();
      landtilesElement.init(landtilesParams, landtilesRng);
      landtilesElement.enabled = true;
      registry.register(landtilesElement);
      elements.set(ElementNames.LandTiles, landtilesElement);
      lastGroundElement = landtilesElement;
      infos.last_ground_element = ElementNames.LandTiles;
      infos.uses_landtiles = true;
    }

    // At least one ground element must be active
    if (!lastGroundElement) {
      throw new Error(
        'TerrainSceneComposer: At least one ground element (Ground or LandTiles) must be active. ' +
        'Set ground_chance or landtiles_chance to a non-zero value.'
      );
    }

    // ====================================================================
    // Step 4: Mountains
    // ====================================================================
    // Mountains are always created (they depend on nothing and are
    // conditionally present via mask coverage). In the original, mountains
    // are part of the ground system; here we add them as a separate element
    // for composition flexibility.
    const mountainsSeed = computeElementSeed(this.seed, 'mountains');
    const mountainsRng = new SeededRandom(mountainsSeed);

    const mountainParams = this.getElementParams(ElementNames.Mountains, {
      sphericalMode: this.sphericalMode,
      sphereRadius: this.sphereRadius,
    });
    const mountainElement = new MountainElement();
    mountainElement.init(mountainParams, mountainsRng);
    mountainElement.enabled = true;
    registry.register(mountainElement);
    elements.set(ElementNames.Mountains, mountainElement);

    // ====================================================================
    // Step 5: Warped Rocks
    // ====================================================================
    const warpedRocksSeed = computeElementSeed(this.seed, 'warped_rocks');
    const warpedRocksRng = new SeededRandom(warpedRocksSeed);

    if (chance(this.chances.warped_rocks_chance, warpedRocksRng)) {
      const warpedRocksParams = this.getElementParams(ElementNames.WarpedRocks, {});
      const warpedRocksElement = new WarpedRocksElement();
      warpedRocksElement.init(warpedRocksParams, warpedRocksRng);
      warpedRocksElement.enabled = true;
      registry.register(warpedRocksElement);
      elements.set(ElementNames.WarpedRocks, warpedRocksElement);
    }

    // ====================================================================
    // Step 6: Voronoi Rocks
    // ====================================================================
    const voronoiRocksSeed = computeElementSeed(this.seed, 'voronoi_rocks');
    const voronoiRocksRng = new SeededRandom(voronoiRocksSeed);

    if (chance(this.chances.voronoi_rocks_chance, voronoiRocksRng)) {
      const voronoiRocksParams = this.getElementParams(ElementNames.VoronoiRocks, {});
      const voronoiRocksElement = new VoronoiRockElement();
      voronoiRocksElement.init(voronoiRocksParams, voronoiRocksRng);
      voronoiRocksElement.enabled = true;
      registry.register(voronoiRocksElement);
      elements.set(ElementNames.VoronoiRocks, voronoiRocksElement);
    }

    // ====================================================================
    // Step 7: Upside-Down Mountains
    // ====================================================================
    const upsideDownSeed = computeElementSeed(this.seed, 'upsidedown_mountains');
    const upsideDownRng = new SeededRandom(upsideDownSeed);

    if (chance(this.chances.upsidedown_mountains_chance, upsideDownRng)) {
      const upsideDownParams = this.getElementParams(ElementNames.UpsidedownMountains, {});
      const upsideDownElement = new UpsideDownMountainNewElement();
      upsideDownElement.init(upsideDownParams, upsideDownRng);
      upsideDownElement.enabled = true;
      registry.register(upsideDownElement);
      elements.set(ElementNames.UpsidedownMountains, upsideDownElement);
    }

    // ====================================================================
    // Step 8: Waterbody
    // ====================================================================
    let waterbodyElement: WaterbodyElement | null = null;

    const waterbodySeed = computeElementSeed(this.seed, 'waterbody');
    const waterbodyRng = new SeededRandom(waterbodySeed);

    if (chance(this.chances.waterbody_chance, waterbodyRng)) {
      const waterbodyParams = this.getElementParams(ElementNames.Liquid, {});
      waterbodyElement = new WaterbodyElement();
      waterbodyElement.init(waterbodyParams, waterbodyRng);
      waterbodyElement.enabled = true;
      registry.register(waterbodyElement);
      elements.set(ElementNames.Liquid, waterbodyElement);
      infos.water_plane = waterbodyParams.waterPlaneHeight ?? 0.5;
      infos.has_waterbody = true;
    }

    // ====================================================================
    // Step 9: Atmosphere (always present)
    // ====================================================================
    const atmosphereSeed = computeElementSeed(this.seed, 'atmosphere');
    const atmosphereRng = new SeededRandom(atmosphereSeed);

    const atmosphereParams = this.getElementParams(ElementNames.Atmosphere, {
      waterPlaneHeight: infos.water_plane > -1e5 ? infos.water_plane : 0.5,
    });
    const atmosphereElement = new AtmosphereElement();
    atmosphereElement.init(atmosphereParams, atmosphereRng);
    atmosphereElement.enabled = true;
    registry.register(atmosphereElement);
    elements.set(ElementNames.Atmosphere, atmosphereElement);

    // ====================================================================
    // Finalize: resolve dependencies and populate infos
    // ====================================================================

    // Resolve all dependencies (this triggers topological sort and wiring)
    registry.resolveDependencies();

    // Build active elements list
    infos.active_elements = [...elements.keys()] as ElementName[];

    // Determine dominant biome from active elements
    infos.dominant_biome = this.inferDominantBiome(elements, infos);

    return { registry, infos, elements };
  }

  /**
   * Get initialization parameters for an element, merging user-provided
   * params with defaults.
   *
   * @param name - Element name
   * @param defaults - Default parameters to use as a base
   * @returns Merged parameter object
   */
  private getElementParams(
    name: ElementName,
    defaults: Record<string, any>,
  ): Record<string, any> {
    const userParams = this.elementParams[name] ?? {};
    return { ...defaults, ...userParams };
  }

  /**
   * Infer the dominant biome from the active elements and scene info.
   *
   * Uses simple heuristics:
   * - If waterbody is present and landtiles are not: "ocean"
   * - If caves are present: "cave_system"
   * - If upside-down mountains are present: "floating_mountains"
   * - If landtiles are present: "continental"
   * - If only ground is present: "plains"
   * - Default: "continental"
   *
   * @param elements - Active elements map
   * @param infos - Scene info (partially populated)
   * @returns Dominant biome string
   */
  private inferDominantBiome(
    elements: Map<string, TerrainElement>,
    infos: SceneInfos,
  ): string {
    if (infos.has_waterbody && !infos.uses_landtiles) {
      return 'ocean';
    }
    if (infos.has_caves) {
      return 'cave_system';
    }
    if (elements.has(ElementNames.UpsidedownMountains)) {
      return 'floating_mountains';
    }
    if (infos.uses_landtiles) {
      return 'continental';
    }
    if (elements.has(ElementNames.Ground)) {
      return 'plains';
    }
    return 'continental';
  }

  // ========================================================================
  // Static Factory Methods
  // ========================================================================

  /**
   * Create a "full" scene with all elements activated (all chances = 1.0).
   *
   * Useful for testing or when you want every possible terrain feature.
   *
   * @param seed - Master seed
   * @param elementParams - Optional per-element parameters
   * @param bounds - Optional scene bounds
   * @returns Scene composition with all elements active
   */
  static createFullScene(
    seed: number,
    elementParams: ElementParamsMap = {},
    bounds: THREE.Box3 | null = null,
  ): SceneComposition {
    const fullChances: SceneChances = {
      caves_chance: 1.0,
      ground_chance: 1.0,
      landtiles_chance: 1.0,
      warped_rocks_chance: 1.0,
      voronoi_rocks_chance: 1.0,
      voronoi_grains_chance: 1.0,
      upsidedown_mountains_chance: 1.0,
      waterbody_chance: 1.0,
      volcanos_chance: 1.0,
      ground_ice_chance: 1.0,
    };
    const composer = new TerrainSceneComposer(seed, fullChances, elementParams, bounds);
    return composer.compose();
  }

  /**
   * Create a minimal scene with only ground + atmosphere.
   *
   * Useful for performance-constrained scenarios or simple terrain.
   *
   * @param seed - Master seed
   * @param elementParams - Optional per-element parameters
   * @param bounds - Optional scene bounds
   * @returns Scene composition with minimal elements
   */
  static createMinimalScene(
    seed: number,
    elementParams: ElementParamsMap = {},
    bounds: THREE.Box3 | null = null,
  ): SceneComposition {
    const minimalChances: SceneChances = {
      caves_chance: 0.0,
      ground_chance: 1.0,
      landtiles_chance: 0.0,
      warped_rocks_chance: 0.0,
      voronoi_rocks_chance: 0.0,
      voronoi_grains_chance: 0.0,
      upsidedown_mountains_chance: 0.0,
      waterbody_chance: 0.0,
      volcanos_chance: 0.0,
      ground_ice_chance: 0.0,
    };
    const composer = new TerrainSceneComposer(seed, minimalChances, elementParams, bounds);
    return composer.compose();
  }

  /**
   * Create a "standard" scene with default chances.
   *
   * This is the typical composition for most procedural worlds.
   *
   * @param seed - Master seed
   * @param elementParams - Optional per-element parameters
   * @param bounds - Optional scene bounds
   * @returns Scene composition with standard element activation
   */
  static createStandardScene(
    seed: number,
    elementParams: ElementParamsMap = {},
    bounds: THREE.Box3 | null = null,
  ): SceneComposition {
    const composer = new TerrainSceneComposer(seed, DEFAULT_SCENE_CHANCES, elementParams, bounds);
    return composer.compose();
  }
}

// ============================================================================
// Scene Info Transfer
// ============================================================================

/**
 * Transfer scene info properties onto a target object.
 *
 * Mirrors the Python `transfer_scene_info(terrain, scene_info)` function.
 * In the R3F port, this is used to populate a terrain data object with
 * scene-level metadata like water_plane height.
 *
 * @param target - Target object to receive scene info properties
 * @param infos - Scene info to transfer
 */
export function transferSceneInfo(
  target: Record<string, any>,
  infos: SceneInfos,
): void {
  target.water_plane = infos.water_plane;
  target.has_caves = infos.has_caves;
  target.has_waterbody = infos.has_waterbody;
  target.uses_landtiles = infos.uses_landtiles;
  target.last_ground_element = infos.last_ground_element;
  target.dominant_biome = infos.dominant_biome;
  target.active_elements = infos.active_elements;
}
