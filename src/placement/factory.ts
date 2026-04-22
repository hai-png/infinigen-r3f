/**
 * Asset Factory System for R3F/Three.js
 * Based on infinigen/core/placement/factory.py
 * 
 * Provides procedural asset generation with LOD support
 */

import * as THREE from 'three';

export interface FactoryConfig {
  seed?: number;
  coarse?: boolean;
  lodEnabled?: boolean;
  cacheEnabled?: boolean;
}

export interface AssetParameters {
  faceSize?: number;
  distance?: number;
  visDistance?: number;
  i?: number;
  placeholder?: THREE.Object3D;
  [key: string]: any;
}

export interface AssetFactoryInterface {
  createPlaceholder(params: AssetParameters): THREE.Object3D;
  createAsset(params: AssetParameters): THREE.Object3D | Promise<THREE.Object3D>;
  finalizePlaceholders?(placeholders: THREE.Object3D[]): void;
  finalizeAssets?(assets: THREE.Object3D[]): void;
  assetParameters?(distance: number, visDistance: number): AssetParameters;
}

/**
 * Simple seeded random number generator
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Mulberry32 PRNG
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  rotation(): [number, number, number] {
    return [
      this.range(0, Math.PI * 2),
      this.range(0, Math.PI * 2),
      this.range(0, Math.PI * 2),
    ];
  }
}

/**
 * Integer hash function for deterministic seeding
 */
function intHash(tuple: [number, number]): number {
  const [a, b] = tuple;
  let h = 2166136261;
  h ^= a;
  h = Math.imul(h, 16777619);
  h ^= b;
  h = Math.imul(h, 16777619);
  return h >>> 0;
}

/**
 * Base Asset Factory class
 * 
 * Provides infrastructure for procedural asset generation with:
 * - Deterministic seeding for reproducibility
 * - Placeholder system for efficient scene population
 * - LOD (Level of Detail) support
 * - Asset finalization hooks
 */
export abstract class AssetFactory implements AssetFactoryInterface {
  protected factorySeed: number;
  protected coarse: boolean;
  protected lodEnabled: boolean;
  protected cacheEnabled: boolean;
  protected assetCache: Map<number, THREE.Object3D>;

  constructor(config: FactoryConfig = {}) {
    const { seed, coarse = false, lodEnabled = true, cacheEnabled = true } = config;
    
    this.factorySeed = seed ?? Math.floor(Math.random() * 1e9);
    this.coarse = coarse;
    this.lodEnabled = lodEnabled;
    this.cacheEnabled = cacheEnabled;
    this.assetCache = new Map();

    console.debug(`${this.constructor.name} initialized with seed ${this.factorySeed}`);
  }

  /**
   * Get a seeded random generator for a specific asset index
   */
  protected getSeededRandom(i: number): SeededRandom {
    const seed = intHash([this.factorySeed, i]);
    return new SeededRandom(seed);
  }

  /**
   * Create a placeholder object for an asset
   * Override this to customize placeholder appearance
   */
  createPlaceholder(params: AssetParameters): THREE.Object3D {
    // Default: simple box geometry
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x888888,
      wireframe: true,
    });
    const placeholder = new THREE.Mesh(geometry, material);
    
    if (params.loc) {
      placeholder.position.copy(params.loc);
    }
    if (params.rot) {
      placeholder.rotation.set(...params.rot);
    }
    
    return placeholder;
  }

  /**
   * Finalize all placeholders at once
   * Override to perform batch operations on placeholders
   */
  finalizePlaceholders(placeholders: THREE.Object3D[]): void {
    // Default: no-op
    // Override for operations like joint space colonization
  }

  /**
   * Determine asset parameters based on camera distance
   * Override to customize LOD behavior
   */
  assetParameters(distance: number, visDistance: number): AssetParameters {
    return {
      faceSize: this.targetFaceSize(distance),
      distance,
      visDistance,
    };
  }

  /**
   * Calculate target face size based on distance
   */
  protected targetFaceSize(distance: number): number {
    // Simple LOD calculation - adjust based on requirements
    const baseSize = 0.01;
    return baseSize * distance;
  }

  /**
   * Create the actual high-detail asset
   * MUST be overridden by subclasses
   */
  abstract createAsset(params: AssetParameters): THREE.Object3D | Promise<THREE.Object3D>;

  /**
   * Finalize all assets at once
   * Override for cleanup or grouping operations
   */
  finalizeAssets(assets: THREE.Object3D[]): void {
    // Default: no-op
    // Override for cleanup, grouping, or optimization
  }

  /**
   * Spawn a placeholder at the specified location
   */
  spawnPlaceholder(
    i: number,
    loc: THREE.Vector3 = new THREE.Vector3(),
    rot: THREE.Euler = new THREE.Euler()
  ): THREE.Object3D {
    console.debug(`${this.constructor.name}.spawnPlaceholder(${i})`);

    const rng = this.getSeededRandom(i);
    
    const placeholder = this.createPlaceholder({
      i,
      loc,
      rot,
    });

    // Check for sensitive constraints (not applicable in Three.js, but kept for API compatibility)
    const hasSensitiveConstraint = false;

    if (!hasSensitiveConstraint) {
      placeholder.position.copy(loc);
      placeholder.rotation.copy(rot);
    } else {
      console.debug(
        `Not assigning placeholder location due to presence of location-sensitive constraint`
      );
    }

    placeholder.name = `${this.constructor.name}.placeholder.${i}`;

    if (placeholder.parent !== null) {
      console.warn(
        `Placeholder ${placeholder.name} has non-null parent, this may cause issues`
      );
    }

    return placeholder;
  }

  /**
   * Spawn a complete asset
   */
  async spawnAsset(
    i: number,
    options: {
      placeholder?: THREE.Object3D;
      distance?: number;
      visDistance?: number;
      loc?: THREE.Vector3;
      rot?: THREE.Euler;
      [key: string]: any;
    } = {}
  ): Promise<THREE.Object3D> {
    if (!Number.isInteger(i)) {
      throw new TypeError(`Expected integer i, got ${typeof i}`);
    }

    console.debug(`${this.constructor.name}.spawnAsset(${i})`);

    const {
      placeholder: userPlaceholder,
      distance: providedDistance,
      visDistance = 0,
      loc = new THREE.Vector3(),
      rot = new THREE.Euler(),
      ...kwargs
    } = options;

    // Check if cached
    if (this.cacheEnabled) {
      const cached = this.assetCache.get(i);
      if (cached) {
        return cached.clone();
      }
    }

    let distance = providedDistance;
    if (distance === undefined) {
      distance = this.scatterResDistance();
    }

    if (this.coarse) {
      throw new Error(
        'Attempted to spawn_asset() on an AssetFactory(coarse=true)'
      );
    }

    const userProvidedPlaceholder = userPlaceholder !== undefined;
    let placeholder = userPlaceholder;

    if (!userProvidedPlaceholder) {
      placeholder = this.spawnPlaceholder(i, loc, rot);
      this.finalizePlaceholders([placeholder]);
    }

    // Generate asset with seeded randomness
    const rng = this.getSeededRandom(i);
    const params = this.assetParameters(distance!, visDistance);
    Object.assign(params, kwargs);
    params.i = i;
    params.placeholder = placeholder;

    let asset: THREE.Object3D;
    try {
      asset = await this.createAsset(params);
    } catch (error) {
      console.error(`Failed to create asset ${i}:`, error);
      // Return placeholder on failure
      asset = placeholder!;
    }

    asset.name = `${this.constructor.name}.asset.${i}`;

    if (userProvidedPlaceholder) {
      if (asset !== placeholder) {
        if (asset.parent === null) {
          placeholder!.attach(asset);
        }
      } else {
        asset.visible = true;
      }
    } else {
      asset.parent = null;
      asset.position.copy(placeholder!.position);
      asset.rotation.copy(placeholder!.rotation);
      // Placeholder will be cleaned up by caller if needed
    }

    // Cache the asset
    if (this.cacheEnabled) {
      this.assetCache.set(i, asset);
    }

    return asset;
  }

  /**
   * Default scatter resolution distance
   */
  protected scatterResDistance(): number {
    return 10; // Default value, can be overridden
  }

  /**
   * Clear the asset cache
   */
  clearCache(): void {
    this.assetCache.clear();
  }

  /**
   * Alias for spawnAsset for convenience
   */
  async call(
    i: number,
    options?: Parameters<typeof this.spawnAsset>[1]
  ): Promise<THREE.Object3D> {
    return this.spawnAsset(i, options);
  }
}

/**
 * Create a collection of assets from multiple factories
 */
export async function createAssetCollection(
  spawnFns: Array<AssetFactory | ((i: number, options?: any) => Promise<THREE.Object3D>)>,
  n: number,
  options: {
    name?: string;
    weights?: number[];
    asList?: boolean;
    verbose?: boolean;
    centered?: boolean;
    [key: string]: any;
  } = {}
): Promise<THREE.Group | THREE.Object3D[]> {
  const {
    name,
    weights,
    asList = false,
    verbose = true,
    centered = false,
    ...kwargs
  } = options;

  const fnNames = spawnFns.map((f, i) => 
    f instanceof AssetFactory ? f.constructor.name : `fn_${i}`
  );
  const collectionName = name || fnNames.join(',');

  if (verbose) {
    console.info(`Generating collection of ${n} assets from ${collectionName}`);
  }

  const normalizedWeights = weights 
    ? weights.map(w => w / weights.reduce((a, b) => a + b, 0))
    : new Array(spawnFns.length).fill(1 / spawnFns.length);

  const objs: THREE.Object3D[][] = spawnFns.map(() => []);

  for (let i = 0; i < n; i++) {
    // Select factory based on weights
    const rand = Math.random();
    let cumulative = 0;
    let fnIdx = 0;
    
    for (let j = 0; j < normalizedWeights.length; j++) {
      cumulative += normalizedWeights[j];
      if (rand < cumulative) {
        fnIdx = j;
        break;
      }
    }

    const fn = spawnFns[fnIdx];
    let obj: THREE.Object3D;

    if (fn instanceof AssetFactory) {
      obj = await fn.spawnAsset(i, kwargs);
    } else {
      obj = await fn(i, kwargs);
    }

    if (centered) {
      // Center the asset
      const bbox = new THREE.Box3().setFromObject(obj);
      const center = bbox.getCenter(new THREE.Vector3());
      obj.position.sub(center);
      // Note: apply transform would require more complex implementation
    }

    objs[fnIdx].push(obj);
  }

  // Finalize assets
  for (let i = 0; i < spawnFns.length; i++) {
    const fn = spawnFns[i];
    if (fn instanceof AssetFactory && fn.finalizeAssets) {
      fn.finalizeAssets(objs[i]);
    }
  }

  const allObjs = objs.flat();

  if (asList) {
    return allObjs;
  } else {
    // Group into collection
    const group = new THREE.Group();
    group.name = `assets:${collectionName}`;
    
    for (const obj of allObjs) {
      group.add(obj);
    }

    // Hide collection from viewport/render by default
    group.visible = false;

    return group;
  }
}

export default AssetFactory;
