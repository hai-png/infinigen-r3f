/**
 * AssetFactorySystem.ts
 *
 * Unified asset factory pipeline that wires individual generators into a
 * composable scene-generation system. Matches the original Infinigen's
 * factory/registry pattern: each generator is wrapped in an AssetFactory
 * that provides a uniform async API, bounding-box queries, LOD support,
 * and triangle-count budgeting.
 *
 * Public API:
 *   - AssetFactory<T>         abstract base class
 *   - LODLevel                interface
 *   - AssetFactoryRegistry    registry of all factories
 *   - TreeFactory, BoulderFactory, GrassFactory, CactusFactory,
 *     MushroomFactory, CreatureFactory   concrete wrappers
 *   - AssetPipeline           orchestrator for full scene asset generation
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { TreeGenerator } from '@/assets/objects/vegetation/trees/TreeGenerator';
import { BoulderGenerator } from '@/assets/objects/terrain/BoulderGenerator';
import { GrassGenerator } from '@/assets/objects/vegetation/plants/GrassGenerator';
import { CactusGenerator } from '@/assets/objects/vegetation/cactus/CactusGenerator';
import { MushroomGenerator } from '@/assets/objects/vegetation/plants/MushroomGenerator';
import { MammalGenerator } from '@/assets/objects/creatures/MammalGenerator';
import { BirdGenerator } from '@/assets/objects/creatures/BirdGenerator';
import { FishGenerator } from '@/assets/objects/creatures/FishGenerator';
import { InsectGenerator } from '@/assets/objects/creatures/InsectGenerator';
import { ReptileGenerator } from '@/assets/objects/creatures/ReptileGenerator';

// ============================================================================
// LOD Level
// ============================================================================

/**
 * Describes one LOD level for an asset factory.
 * level 0 = highest quality, increasing levels = lower quality.
 */
export interface LODLevel {
  /** LOD level index (0 = highest quality) */
  level: number;
  /** Maximum distance from camera at which this LOD is used */
  maxDistance: number;
  /** Target triangle count for this LOD level */
  targetTriangles: number;
}

// ============================================================================
// Default LOD tables
// ============================================================================

const DEFAULT_TREE_LOD: LODLevel[] = [
  { level: 0, maxDistance: 50, targetTriangles: 8000 },
  { level: 1, maxDistance: 150, targetTriangles: 3000 },
  { level: 2, maxDistance: 400, targetTriangles: 800 },
];

const DEFAULT_BOULDER_LOD: LODLevel[] = [
  { level: 0, maxDistance: 40, targetTriangles: 2000 },
  { level: 1, maxDistance: 120, targetTriangles: 600 },
  { level: 2, maxDistance: 300, targetTriangles: 200 },
];

const DEFAULT_GRASS_LOD: LODLevel[] = [
  { level: 0, maxDistance: 30, targetTriangles: 5000 },
  { level: 1, maxDistance: 80, targetTriangles: 1500 },
];

const DEFAULT_CACTUS_LOD: LODLevel[] = [
  { level: 0, maxDistance: 50, targetTriangles: 4000 },
  { level: 1, maxDistance: 150, targetTriangles: 1200 },
  { level: 2, maxDistance: 400, targetTriangles: 400 },
];

const DEFAULT_MUSHROOM_LOD: LODLevel[] = [
  { level: 0, maxDistance: 20, targetTriangles: 1500 },
  { level: 1, maxDistance: 60, targetTriangles: 400 },
];

const DEFAULT_CREATURE_LOD: LODLevel[] = [
  { level: 0, maxDistance: 60, targetTriangles: 6000 },
  { level: 1, maxDistance: 200, targetTriangles: 2000 },
  { level: 2, maxDistance: 500, targetTriangles: 600 },
];

// ============================================================================
// AssetFactory – abstract base
// ============================================================================

/**
 * Abstract base class for all asset factories.
 *
 * Every factory wraps an underlying procedural generator and provides:
 *  - `generate()`         — produce a single asset instance (async)
 *  - `generateBatch()`    — produce N instances in parallel
 *  - `getBoundingBox()`   — bounding box for collision / placement
 *  - `getTriangleCount()` — estimated triangle budget
 *  - `getLODLevels()`     — available LOD tiers
 *  - `generateAtLOD()`    — generate at a specific LOD tier
 *
 * @typeParam T - The concrete THREE.Object3D subtype this factory yields
 */
export abstract class AssetFactory<T extends THREE.Object3D = THREE.Object3D> {
  /** Broad category: 'tree', 'boulder', 'grass', 'cactus', 'mushroom', 'creature' … */
  abstract readonly category: string;

  /** Specific asset type within the category: 'oak_tree', 'granite_boulder' … */
  abstract readonly assetType: string;

  /** Generate a single asset instance from a seed and optional params */
  abstract generate(seed: number, params?: Record<string, any>): Promise<T>;

  /** Generate multiple asset instances (for batch operations) */
  async generateBatch(
    count: number,
    baseSeed: number,
    params?: Record<string, any>,
  ): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < count; i++) {
      const asset = await this.generate(baseSeed + i, params);
      results.push(asset);
    }
    return results;
  }

  /** Get the bounding box of a generated asset (for collision / placement) */
  getBoundingBox(asset: T): THREE.Box3 {
    return new THREE.Box3().setFromObject(asset);
  }

  /** Get estimated triangle count (for LOD budgeting) */
  getTriangleCount(_params?: Record<string, any>): number {
    return 1000; // sensible default; override in subclass
  }

  /** Get available LOD levels */
  getLODLevels(): LODLevel[] {
    return [];
  }

  /** Generate at a specific LOD level */
  async generateAtLOD(
    seed: number,
    lodLevel: number,
    params?: Record<string, any>,
  ): Promise<T> {
    // Default: pass lod through params; subclasses may override for custom LOD
    return this.generate(seed, { ...params, lod: lodLevel });
  }
}

// ============================================================================
// TreeFactory
// ============================================================================

export class TreeFactory extends AssetFactory<THREE.Group> {
  readonly category = 'tree';
  readonly assetType: string;

  private generator: TreeGenerator;

  constructor(assetType: string = 'oak_tree') {
    super();
    this.assetType = assetType;
    this.generator = new TreeGenerator(0);
  }

  override getLODLevels(): LODLevel[] {
    return DEFAULT_TREE_LOD;
  }

  override getTriangleCount(params?: Record<string, any>): number {
    const lod = (params?.lod as number) ?? 0;
    const levels = this.getLODLevels();
    const match = levels.find(l => l.level === lod);
    return match?.targetTriangles ?? levels[0]?.targetTriangles ?? 8000;
  }

  async generate(seed: number, params?: Record<string, any>): Promise<THREE.Group> {
    const species = (params?.species as string) ?? this.assetType.replace('_tree', '');
    const lod = (params?.lod as number) ?? 0;
    const season = (params?.season as 'spring' | 'summer' | 'autumn' | 'winter') ?? 'summer';
    const tree = this.generator.generateTree(species, seed, { season, lod });
    tree.userData.factoryCategory = this.category;
    tree.userData.factoryAssetType = this.assetType;
    tree.userData.seed = seed;
    return tree;
  }

  override async generateAtLOD(
    seed: number,
    lodLevel: number,
    params?: Record<string, any>,
  ): Promise<THREE.Group> {
    return this.generate(seed, { ...params, lod: lodLevel });
  }
}

// ============================================================================
// BoulderFactory
// ============================================================================

export class BoulderFactory extends AssetFactory<THREE.Mesh> {
  readonly category = 'boulder';
  readonly assetType: string;

  constructor(assetType: string = 'granite_boulder') {
    super();
    this.assetType = assetType;
  }

  override getLODLevels(): LODLevel[] {
    return DEFAULT_BOULDER_LOD;
  }

  override getTriangleCount(params?: Record<string, any>): number {
    const lod = (params?.lod as number) ?? 0;
    const levels = this.getLODLevels();
    const match = levels.find(l => l.level === lod);
    return match?.targetTriangles ?? levels[0]?.targetTriangles ?? 2000;
  }

  async generate(seed: number, params?: Record<string, any>): Promise<THREE.Mesh> {
    const btype = (params?.boulderType as string) ?? 'irregular';
    const size = (params?.size as number) ?? 3.0;
    const lod = (params?.lod as number) ?? 0;
    const detailLevel = Math.max(1, 3 - lod);
    const gen = new BoulderGenerator(
      {
        type: btype as any,
        size,
        detailLevel,
      },
      seed,
    );
    const mesh = gen.generateBoulder();
    mesh.userData.factoryCategory = this.category;
    mesh.userData.factoryAssetType = this.assetType;
    mesh.userData.seed = seed;
    return mesh;
  }
}

// ============================================================================
// GrassFactory
// ============================================================================

export class GrassFactory extends AssetFactory<THREE.InstancedMesh> {
  readonly category = 'grass';
  readonly assetType: string;

  private generator: GrassGenerator;

  constructor(assetType: string = 'grass_field') {
    super();
    this.assetType = assetType;
    this.generator = new GrassGenerator();
  }

  override getLODLevels(): LODLevel[] {
    return DEFAULT_GRASS_LOD;
  }

  override getTriangleCount(params?: Record<string, any>): number {
    const lod = (params?.lod as number) ?? 0;
    const levels = this.getLODLevels();
    const match = levels.find(l => l.level === lod);
    return match?.targetTriangles ?? levels[0]?.targetTriangles ?? 5000;
  }

  async generate(seed: number, params?: Record<string, any>): Promise<THREE.InstancedMesh> {
    const count = (params?.count as number) ?? 1000;
    const spreadWidth = (params?.spreadWidth as number) ?? 10;
    const spreadDepth = (params?.spreadDepth as number) ?? 10;
    const bladeHeight = (params?.bladeHeight as number) ?? undefined;
    const instance = this.generator.generateGrassField(
      {
        count,
        spreadArea: { width: spreadWidth, depth: spreadDepth },
        bladeHeight,
      },
      seed,
    );
    instance.userData.factoryCategory = this.category;
    instance.userData.factoryAssetType = this.assetType;
    instance.userData.seed = seed;
    return instance;
  }
}

// ============================================================================
// CactusFactory
// ============================================================================

export class CactusFactory extends AssetFactory<THREE.Group> {
  readonly category = 'cactus';
  readonly assetType: string;

  constructor(assetType: string = 'saguaro_cactus') {
    super();
    this.assetType = assetType;
  }

  override getLODLevels(): LODLevel[] {
    return DEFAULT_CACTUS_LOD;
  }

  override getTriangleCount(params?: Record<string, any>): number {
    const lod = (params?.lod as number) ?? 0;
    const levels = this.getLODLevels();
    const match = levels.find(l => l.level === lod);
    return match?.targetTriangles ?? levels[0]?.targetTriangles ?? 4000;
  }

  async generate(seed: number, params?: Record<string, any>): Promise<THREE.Group> {
    const variant = params?.variant as string | undefined;
    const lod = (params?.lod as number) ?? 0;
    const gen = new CactusGenerator(seed);
    const group = gen.generate({ variant: variant as any, lod });
    group.userData.factoryCategory = this.category;
    group.userData.factoryAssetType = this.assetType;
    group.userData.seed = seed;
    return group;
  }
}

// ============================================================================
// MushroomFactory
// ============================================================================

export class MushroomFactory extends AssetFactory<THREE.Group> {
  readonly category = 'mushroom';
  readonly assetType: string;

  constructor(assetType: string = 'agaric_mushroom') {
    super();
    this.assetType = assetType;
  }

  override getLODLevels(): LODLevel[] {
    return DEFAULT_MUSHROOM_LOD;
  }

  override getTriangleCount(params?: Record<string, any>): number {
    const lod = (params?.lod as number) ?? 0;
    const levels = this.getLODLevels();
    const match = levels.find(l => l.level === lod);
    return match?.targetTriangles ?? levels[0]?.targetTriangles ?? 1500;
  }

  async generate(seed: number, params?: Record<string, any>): Promise<THREE.Group> {
    const species = (params?.species as string) ?? this.assetType.replace('_mushroom', '');
    const count = (params?.clusterCount as number) ?? 1;
    const spreadRadius = (params?.spreadRadius as number) ?? 0.3;
    const gen = new MushroomGenerator(seed);
    let group: THREE.Group;
    if (count > 1) {
      group = gen.generateCluster({ species: species as any }, count, spreadRadius);
    } else {
      group = gen.generate({ species: species as any });
    }
    group.userData.factoryCategory = this.category;
    group.userData.factoryAssetType = this.assetType;
    group.userData.seed = seed;
    return group;
  }
}

// ============================================================================
// CreatureFactory
// ============================================================================

/** Map of creature sub-types to their generator constructors */
type CreatureSubType = 'mammal' | 'bird' | 'fish' | 'insect' | 'reptile';

export class CreatureFactory extends AssetFactory<THREE.Group> {
  readonly category = 'creature';
  readonly assetType: string;

  constructor(assetType: string = 'mammal_creature') {
    super();
    this.assetType = assetType;
  }

  override getLODLevels(): LODLevel[] {
    return DEFAULT_CREATURE_LOD;
  }

  override getTriangleCount(params?: Record<string, any>): number {
    const lod = (params?.lod as number) ?? 0;
    const levels = this.getLODLevels();
    const match = levels.find(l => l.level === lod);
    return match?.targetTriangles ?? levels[0]?.targetTriangles ?? 6000;
  }

  async generate(seed: number, params?: Record<string, any>): Promise<THREE.Group> {
    const subType = (params?.creatureSubType as CreatureSubType) ??
      this.inferSubType();
    const species = (params?.species as string) ?? undefined;

    let group: THREE.Group;

    switch (subType) {
      case 'mammal': {
        const gen = new MammalGenerator(seed);
        group = gen.generate((species as any) ?? 'dog', params);
        break;
      }
      case 'bird': {
        const gen = new BirdGenerator(seed);
        group = gen.generate((species as any) ?? 'sparrow', params);
        break;
      }
      case 'fish': {
        const gen = new FishGenerator({ seed });
        group = gen.generate((species as any) ?? 'goldfish', params);
        break;
      }
      case 'insect': {
        const gen = new InsectGenerator({ seed });
        group = gen.generate();
        break;
      }
      case 'reptile': {
        const gen = new ReptileGenerator({ seed });
        group = gen.generate();
        break;
      }
      default: {
        const gen = new MammalGenerator(seed);
        group = gen.generate('dog');
      }
    }

    group.userData.factoryCategory = this.category;
    group.userData.factoryAssetType = this.assetType;
    group.userData.seed = seed;
    return group;
  }

  private inferSubType(): CreatureSubType {
    if (this.assetType.includes('mammal')) return 'mammal';
    if (this.assetType.includes('bird')) return 'bird';
    if (this.assetType.includes('fish')) return 'fish';
    if (this.assetType.includes('insect')) return 'insect';
    if (this.assetType.includes('reptile')) return 'reptile';
    return 'mammal';
  }
}

// ============================================================================
// AssetFactoryRegistry
// ============================================================================

/**
 * Central registry for all asset factories.
 *
 * Provides lookup by (category, assetType) and bulk queries.
 */
export class AssetFactoryRegistry {
  private factories: Map<string, AssetFactory> = new Map();

  private static key(category: string, assetType: string): string {
    return `${category}::${assetType}`;
  }

  /** Register a factory */
  register(factory: AssetFactory): void {
    const key = AssetFactoryRegistry.key(factory.category, factory.assetType);
    this.factories.set(key, factory);
  }

  /** Get a factory by category + asset type */
  get(category: string, assetType: string): AssetFactory | undefined {
    return this.factories.get(AssetFactoryRegistry.key(category, assetType));
  }

  /** Get all factories in a given category */
  getByCategory(category: string): AssetFactory[] {
    const results: AssetFactory[] = [];
    for (const [key, factory] of this.factories) {
      if (key.startsWith(`${category}::`)) {
        results.push(factory);
      }
    }
    return results;
  }

  /** List all registered factories */
  listAll(): { category: string; assetType: string; factory: AssetFactory }[] {
    const result: { category: string; assetType: string; factory: AssetFactory }[] = [];
    for (const factory of this.factories.values()) {
      result.push({ category: factory.category, assetType: factory.assetType, factory });
    }
    return result;
  }

  /** Remove all registered factories */
  clear(): void {
    this.factories.clear();
  }
}

// ============================================================================
// Scene Preset type (lightweight — just a plain object schema)
// ============================================================================

export interface ScenePreset {
  /** Unique preset name */
  name: string;
  /** Factory specifications: category → assetType → count / params */
  assets: Record<
    string,
    Record<
      string,
      {
        count: number;
        params?: Record<string, any>;
        density?: number;
        spacing?: number;
        maskFilters?: Record<string, any>[];
      }
    >
  >;
  /** Terrain configuration */
  terrain?: Record<string, any>;
  /** Lighting overrides */
  lighting?: Record<string, any>;
}

// ============================================================================
// AssetPipeline
// ============================================================================

/**
 * Orchestrates asset generation for an entire scene.
 *
 * Usage:
 *   const pipeline = new AssetPipeline();
 *   pipeline.configureFromPreset(preset);
 *   const assets = await pipeline.generateSceneAssets(sceneGraph);
 */
export class AssetPipeline {
  private registry: AssetFactoryRegistry;
  private preset: ScenePreset | null = null;

  constructor(registry?: AssetFactoryRegistry) {
    this.registry = registry ?? new AssetFactoryRegistry();
    this.registerDefaults();
  }

  /** Access the underlying registry */
  getRegistry(): AssetFactoryRegistry {
    return this.registry;
  }

  /** Configure factories from a scene preset */
  configureFromPreset(preset: ScenePreset): void {
    this.preset = preset;
  }

  /**
   * Generate all assets for a scene according to the current preset.
   *
   * @param _sceneGraph - Placeholder for a future scene-graph object;
   *                      currently unused but kept for API stability.
   * @returns Map from "category::assetType" to generated Object3D arrays
   */
  async generateSceneAssets(
    _sceneGraph?: any,
  ): Promise<Map<string, THREE.Object3D[]>> {
    const result = new Map<string, THREE.Object3D[]>();

    if (!this.preset) {
      return result;
    }

    const baseSeed = 42;

    for (const [category, types] of Object.entries(this.preset.assets)) {
      for (const [assetType, spec] of Object.entries(types)) {
        const factory = this.registry.get(category, assetType);
        if (!factory) {
          console.warn(
            `[AssetPipeline] No factory registered for ${category}::${assetType}, skipping`,
          );
          continue;
        }

        const assets = await factory.generateBatch(
          spec.count,
          baseSeed + hashString(`${category}::${assetType}`),
          spec.params,
        );

        const key = `${category}::${assetType}`;
        result.set(key, assets);
      }
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Default registration
  // ------------------------------------------------------------------

  private registerDefaults(): void {
    const defaults: AssetFactory[] = [
      new TreeFactory('oak_tree'),
      new TreeFactory('pine_tree'),
      new TreeFactory('birch_tree'),
      new TreeFactory('palm_tree'),
      new TreeFactory('willow_tree'),
      new BoulderFactory('granite_boulder'),
      new BoulderFactory('limestone_boulder'),
      new BoulderFactory('sandstone_boulder'),
      new BoulderFactory('basalt_boulder'),
      new GrassFactory('grass_field'),
      new GrassFactory('grass_tall'),
      new CactusFactory('saguaro_cactus'),
      new CactusFactory('barrel_cactus'),
      new CactusFactory('prickly_pear_cactus'),
      new MushroomFactory('agaric_mushroom'),
      new MushroomFactory('bolete_mushroom'),
      new MushroomFactory('chanterelle_mushroom'),
      new MushroomFactory('morel_mushroom'),
      new CreatureFactory('mammal_creature'),
      new CreatureFactory('bird_creature'),
      new CreatureFactory('fish_creature'),
      new CreatureFactory('insect_creature'),
      new CreatureFactory('reptile_creature'),
    ];

    for (const factory of defaults) {
      this.registry.register(factory);
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Simple deterministic string → number hash */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ============================================================================
// Default Scene Presets
// ============================================================================

export const NATURE_SCENE_PRESET: ScenePreset = {
  name: 'nature',
  assets: {
    tree: {
      oak_tree: { count: 15, density: 0.4, spacing: 5 },
      pine_tree: { count: 10, density: 0.3, spacing: 5 },
      birch_tree: { count: 5, density: 0.2, spacing: 4 },
    },
    boulder: {
      granite_boulder: { count: 8, density: 0.15, spacing: 3 },
    },
    grass: {
      grass_field: { count: 3, params: { count: 800, spreadWidth: 20, spreadDepth: 20 } },
    },
    mushroom: {
      agaric_mushroom: { count: 6, params: { clusterCount: 3 } },
    },
    creature: {
      mammal_creature: { count: 2, params: { creatureSubType: 'mammal', species: 'deer' } },
      bird_creature: { count: 3, params: { creatureSubType: 'bird', species: 'sparrow' } },
    },
  },
};

export const DESERT_SCENE_PRESET: ScenePreset = {
  name: 'desert',
  assets: {
    cactus: {
      saguaro_cactus: { count: 12, density: 0.3, spacing: 4 },
      barrel_cactus: { count: 8, density: 0.2, spacing: 3 },
      prickly_pear_cactus: { count: 6, density: 0.15, spacing: 3 },
    },
    boulder: {
      sandstone_boulder: { count: 5, density: 0.1, spacing: 5 },
    },
    grass: {
      grass_field: { count: 1, params: { count: 200, spreadWidth: 10, spreadDepth: 10, bladeHeight: 0.15 } },
    },
  },
};
