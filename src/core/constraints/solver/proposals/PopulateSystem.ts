/**
 * Populate System — Placeholder → Real Asset Spawning
 *
 * Ports: infinigen/core/constraints/example_solver/populate.py
 *
 * Converts constraint solver placeholders into actual 3D asset meshes.
 * After the constraint solver finds valid positions and assignments for
 * objects (represented as abstract ObjectState entries), the populate
 * system:
 *
 * 1. Takes a solved constraint state with placeholders
 * 2. Looks up the appropriate asset factory for each placeholder
 * 3. Generates the 3D geometry (meshes) using the factory
 * 4. Places the generated mesh at the solved position/rotation
 * 5. Assigns materials based on the object's tags
 * 6. Returns a populated scene group with all real assets
 *
 * This is the final step in the indoor scene generation pipeline:
 *   ConstraintProblem → Solver → PopulatedScene
 *
 * Key classes:
 * - PopulateConfig: Configuration for the populate step
 * - PopulateSystem: Main orchestrator for placeholder → mesh conversion
 * - PlaceholderResolver: Resolves placeholder IDs to asset factories
 * - AssetSpawner: Generates and places 3D meshes
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';
import {
  Tag,
  TagSet,
  ObjectState,
  DOFConstraints,
} from '../../unified/UnifiedConstraintSystem';
import {
  AssetFactoryRegistry,
  TagUsageLookup,
  AssetFactoryProfile,
} from './UsageLookup';

// ============================================================================
// Types
// ============================================================================

/**
 * A placeholder object that needs to be replaced with a real asset.
 */
export interface Placeholder {
  /** Unique ID matching the constraint solver's ObjectState ID */
  id: string;

  /** Object type (e.g., "chair", "table") */
  type: string;

  /** Solved position from the constraint solver */
  position: THREE.Vector3;

  /** Solved rotation from the constraint solver */
  rotation: THREE.Euler;

  /** Solved scale from the constraint solver */
  scale: THREE.Vector3;

  /** Tags assigned by the constraint solver */
  tags: TagSet;

  /** The room this placeholder belongs to */
  roomId: string;
}

/**
 * A spawned asset (placeholder replaced with real geometry).
 */
export interface SpawnedAsset {
  /** The original placeholder ID */
  placeholderId: string;

  /** The factory that generated this asset */
  factoryId: string;

  /** The 3D mesh group for this asset */
  mesh: THREE.Group;

  /** Position in world space */
  position: THREE.Vector3;

  /** Rotation in world space */
  rotation: THREE.Euler;

  /** Scale */
  scale: THREE.Vector3;

  /** Tags on this asset */
  tags: TagSet;

  /** Bounding box in world space */
  boundingBox: THREE.Box3;
}

/**
 * Result of the populate step.
 */
export interface PopulateResult {
  /** All spawned assets */
  assets: SpawnedAsset[];

  /** The complete scene group */
  sceneGroup: THREE.Group;

  /** Mapping: placeholder ID → spawned asset */
  assetMap: Map<string, SpawnedAsset>;

  /** Number of placeholders that were successfully populated */
  populatedCount: number;

  /** Number of placeholders that failed to populate */
  failedCount: number;

  /** Failure reasons */
  failures: Array<{ placeholderId: string; reason: string }>;
}

/**
 * Configuration for the populate system.
 */
export interface PopulateConfig {
  /** Whether to add debug visualization (wireframe boxes for placeholders) */
  debugVisualization: boolean;
  /** Default material for objects that don't have factory-specific materials */
  defaultMaterial: THREE.MeshStandardMaterial;
  /** Whether to compute and attach bounding boxes */
  computeBoundingBoxes: boolean;
  /** Maximum number of assets to spawn per room */
  maxAssetsPerRoom: number;
  /** Minimum distance between assets of the same type */
  minSameTypeDistance: number;
}

/** Default populate configuration */
export const DEFAULT_POPULATE_CONFIG: PopulateConfig = {
  debugVisualization: false,
  defaultMaterial: new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.7,
    metalness: 0.1,
  }),
  computeBoundingBoxes: true,
  maxAssetsPerRoom: 30,
  minSameTypeDistance: 0.5,
};

// ============================================================================
// PlaceholderResolver — Resolves placeholders to factories
// ============================================================================

/**
 * Resolves placeholder objects to appropriate asset factories.
 *
 * Uses the TagUsageLookup to find factories whose providesTags
 * match the placeholder's tags, then selects the best match
 * based on tag coverage and priority.
 */
export class PlaceholderResolver {
  private usageLookup: TagUsageLookup | null;
  private factoryRegistry: AssetFactoryRegistry | null;
  private rng: SeededRandom;

  constructor(
    factoryRegistry?: AssetFactoryRegistry,
    usageLookup?: TagUsageLookup,
    seed: number = 42,
  ) {
    this.factoryRegistry = factoryRegistry ?? null;
    this.usageLookup = usageLookup ?? null;
    this.rng = new SeededRandom(seed);
  }

  /**
   * Resolve a placeholder to the best matching factory.
   *
   * @param placeholder - The placeholder to resolve
   * @returns The best matching factory profile, or null if no match
   */
  resolve(placeholder: Placeholder): AssetFactoryProfile | null {
    if (!this.factoryRegistry || !this.usageLookup) {
      return this.fallbackResolve(placeholder);
    }

    // Find compatible factories using the tag lookup
    const candidates = this.usageLookup.findCompatibleFactories(
      placeholder.tags,
      undefined, // no category filter
    );

    if (candidates.length === 0) {
      // Try matching by type name as fallback
      const byType = this.factoryRegistry.getAll().filter(
        f => f.category === placeholder.type || f.displayName.toLowerCase().includes(placeholder.type),
      );
      if (byType.length > 0) {
        return this.usageLookup.selectWeightedRandom(byType, this.rng);
      }
      return null;
    }

    // Select weighted random from top candidates
    return this.usageLookup.selectWeightedRandom(candidates, this.rng);
  }

  /**
   * Fallback resolution when registry/lookup are not available.
   */
  private fallbackResolve(placeholder: Placeholder): AssetFactoryProfile | null {
    // Return a generic profile based on type
    return {
      factoryId: `generic_${placeholder.type}`,
      displayName: `Generic ${placeholder.type}`,
      category: placeholder.type,
      providesTags: placeholder.tags,
      requiresTags: new TagSet(),
      excludedTags: new TagSet(),
      typicalSize: {
        width: [0.3, 1.0],
        height: [0.3, 1.0],
        depth: [0.3, 1.0],
      },
      priority: 1,
      maxInstances: 100,
    };
  }
}

// ============================================================================
// AssetSpawner — Generates and places 3D meshes
// ============================================================================

/**
 * Generates 3D meshes for placeholders and places them at the solved positions.
 *
 * For each placeholder, the spawner:
 * 1. Creates a mesh based on the factory's typical dimensions
 * 2. Applies appropriate materials based on the object's tags
 * 3. Positions the mesh at the placeholder's solved position
 * 4. Rotates the mesh according to the placeholder's solved rotation
 * 5. Computes the bounding box
 */
export class AssetSpawner {
  private config: PopulateConfig;
  private rng: SeededRandom;
  private instanceCounters: Map<string, number> = new Map();

  constructor(config: Partial<PopulateConfig> = {}, seed: number = 42) {
    this.config = { ...DEFAULT_POPULATE_CONFIG, ...config };
    this.rng = new SeededRandom(seed);
  }

  /**
   * Spawn a 3D mesh for a placeholder using a factory profile.
   *
   * @param placeholder - The placeholder to spawn
   * @param factory - The factory profile to use for generation
   * @returns A SpawnedAsset with the generated mesh
   */
  spawn(placeholder: Placeholder, factory: AssetFactoryProfile): SpawnedAsset {
    // Get instance counter for this factory
    const instanceNum = (this.instanceCounters.get(factory.factoryId) ?? 0) + 1;
    this.instanceCounters.set(factory.factoryId, instanceNum);

    // Create a group for the asset
    const group = new THREE.Group();
    group.name = `${factory.displayName}_${instanceNum}`;

    // Generate geometry based on factory's typical dimensions
    const mesh = this.generateMesh(placeholder, factory);
    if (mesh) {
      group.add(mesh);
    }

    // Position and rotate
    group.position.copy(placeholder.position);
    group.rotation.copy(placeholder.rotation);
    group.scale.copy(placeholder.scale);

    // Compute bounding box
    const boundingBox = new THREE.Box3();
    if (this.config.computeBoundingBoxes) {
      boundingBox.setFromObject(group);
    }

    return {
      placeholderId: placeholder.id,
      factoryId: factory.factoryId,
      mesh: group,
      position: placeholder.position.clone(),
      rotation: placeholder.rotation.clone(),
      scale: placeholder.scale.clone(),
      tags: placeholder.tags,
      boundingBox,
    };
  }

  /**
   * Generate a mesh based on the placeholder type and factory dimensions.
   */
  private generateMesh(
    placeholder: Placeholder,
    factory: AssetFactoryProfile,
  ): THREE.Mesh | null {
    const size = factory.typicalSize;

    // Pick random dimensions within the factory's typical range
    const width = this.rng.nextFloat(size.width[0], size.width[1]);
    const height = this.rng.nextFloat(size.height[0], size.height[1]);
    const depth = this.rng.nextFloat(size.depth[0], size.depth[1]);

    // Choose geometry type based on object tags
    let geometry: THREE.BufferGeometry;

    const hasTag = (tagName: string): boolean => {
      for (const t of placeholder.tags) {
        if (t.name === tagName) return true;
      }
      return false;
    };

    if (hasTag('chair') || hasTag('sitting')) {
      geometry = this.generateChairGeometry(width, height, depth);
    } else if (hasTag('table') || hasTag('surface')) {
      geometry = this.generateTableGeometry(width, height, depth);
    } else if (hasTag('lamp') || hasTag('lighting')) {
      geometry = this.generateLampGeometry(width, height, depth);
    } else if (hasTag('shelf') || hasTag('storage')) {
      geometry = this.generateShelfGeometry(width, height, depth);
    } else if (hasTag('sofa')) {
      geometry = this.generateSofaGeometry(width, height, depth);
    } else if (hasTag('bed') || hasTag('sleeping')) {
      geometry = this.generateBedGeometry(width, height, depth);
    } else if (hasTag('rug') || hasTag('floor_covering')) {
      geometry = new THREE.BoxGeometry(width, 0.02, depth);
    } else if (hasTag('picture') || hasTag('wall_art')) {
      geometry = new THREE.BoxGeometry(width, height, 0.03);
    } else if (hasTag('plant') || hasTag('natural')) {
      geometry = this.generatePlantGeometry(width, height, depth);
    } else {
      // Default: simple box
      geometry = new THREE.BoxGeometry(width, height, depth);
    }

    // Get material based on tags
    const material = this.getMaterial(placeholder);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `${factory.displayName}_mesh`;

    return mesh;
  }

  /**
   * Generate a simple chair geometry.
   */
  private generateChairGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Seat
    const seat = new THREE.BoxGeometry(w, 0.04, d * 0.9);
    const seatMesh = new THREE.Mesh(seat, this.config.defaultMaterial);
    seatMesh.position.y = h * 0.5;
    group.add(seatMesh);

    // Backrest
    const back = new THREE.BoxGeometry(w, h * 0.45, 0.04);
    const backMesh = new THREE.Mesh(back, this.config.defaultMaterial);
    backMesh.position.set(0, h * 0.5 + h * 0.225, -d * 0.4);
    group.add(backMesh);

    // Merge into single geometry
    return this.mergeGroupToGeometry(group);
  }

  /**
   * Generate a simple table geometry.
   */
  private generateTableGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Tabletop
    const top = new THREE.BoxGeometry(w, 0.04, d);
    const topMesh = new THREE.Mesh(top, this.config.defaultMaterial);
    topMesh.position.y = h;
    group.add(topMesh);

    // Legs (4 cylinders)
    const legRadius = 0.025;
    const legHeight = h;
    const legGeom = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
    const offsets = [
      [-w / 2 + 0.05, -d / 2 + 0.05],
      [w / 2 - 0.05, -d / 2 + 0.05],
      [-w / 2 + 0.05, d / 2 - 0.05],
      [w / 2 - 0.05, d / 2 - 0.05],
    ];
    for (const [ox, oz] of offsets) {
      const leg = new THREE.Mesh(legGeom, this.config.defaultMaterial);
      leg.position.set(ox, legHeight / 2, oz);
      group.add(leg);
    }

    return this.mergeGroupToGeometry(group);
  }

  /**
   * Generate a simple lamp geometry.
   */
  private generateLampGeometry(w: number, h: number, _d: number): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Base
    const base = new THREE.CylinderGeometry(w * 0.3, w * 0.3, 0.03, 16);
    const baseMesh = new THREE.Mesh(base, this.config.defaultMaterial);
    baseMesh.position.y = 0.015;
    group.add(baseMesh);

    // Pole
    const pole = new THREE.CylinderGeometry(0.01, 0.01, h * 0.7, 8);
    const poleMesh = new THREE.Mesh(pole, this.config.defaultMaterial);
    poleMesh.position.y = h * 0.35 + 0.03;
    group.add(poleMesh);

    // Shade
    const shade = new THREE.ConeGeometry(w * 0.4, h * 0.3, 16, 1, true);
    const shadeMesh = new THREE.Mesh(shade, new THREE.MeshStandardMaterial({
      color: 0xf5e6c8,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }));
    shadeMesh.position.y = h * 0.7 + 0.03 + h * 0.15;
    group.add(shadeMesh);

    return this.mergeGroupToGeometry(group);
  }

  /**
   * Generate a simple shelf geometry.
   */
  private generateShelfGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
    const group = new THREE.Group();

    const numShelves = Math.max(2, Math.floor(h / 0.35));
    const shelfSpacing = h / numShelves;

    for (let i = 0; i < numShelves; i++) {
      const shelf = new THREE.BoxGeometry(w, 0.02, d);
      const shelfMesh = new THREE.Mesh(shelf, this.config.defaultMaterial);
      shelfMesh.position.y = i * shelfSpacing + 0.01;
      group.add(shelfMesh);
    }

    // Side panels
    const side = new THREE.BoxGeometry(0.02, h, d);
    const leftMesh = new THREE.Mesh(side, this.config.defaultMaterial);
    leftMesh.position.set(-w / 2 + 0.01, h / 2, 0);
    group.add(leftMesh);

    const rightMesh = new THREE.Mesh(side, this.config.defaultMaterial);
    rightMesh.position.set(w / 2 - 0.01, h / 2, 0);
    group.add(rightMesh);

    return this.mergeGroupToGeometry(group);
  }

  /**
   * Generate a simple sofa geometry.
   */
  private generateSofaGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Seat cushion
    const seat = new THREE.BoxGeometry(w, h * 0.35, d * 0.6);
    const seatMesh = new THREE.Mesh(seat, this.config.defaultMaterial);
    seatMesh.position.set(0, h * 0.175, d * 0.1);
    group.add(seatMesh);

    // Back
    const back = new THREE.BoxGeometry(w, h * 0.55, d * 0.2);
    const backMesh = new THREE.Mesh(back, this.config.defaultMaterial);
    backMesh.position.set(0, h * 0.275, -d * 0.35);
    group.add(backMesh);

    // Arms
    const arm = new THREE.BoxGeometry(0.08, h * 0.4, d * 0.7);
    const leftArm = new THREE.Mesh(arm, this.config.defaultMaterial);
    leftArm.position.set(-w / 2 + 0.04, h * 0.2, -d * 0.05);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(arm, this.config.defaultMaterial);
    rightArm.position.set(w / 2 - 0.04, h * 0.2, -d * 0.05);
    group.add(rightArm);

    return this.mergeGroupToGeometry(group);
  }

  /**
   * Generate a simple bed geometry.
   */
  private generateBedGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Mattress
    const mattress = new THREE.BoxGeometry(w, h * 0.4, d);
    const mattressMesh = new THREE.Mesh(mattress, new THREE.MeshStandardMaterial({
      color: 0xe8ddd0,
      roughness: 0.9,
      metalness: 0.0,
    }));
    mattressMesh.position.y = h * 0.2;
    group.add(mattressMesh);

    // Headboard
    const headboard = new THREE.BoxGeometry(w, h, 0.05);
    const headboardMesh = new THREE.Mesh(headboard, this.config.defaultMaterial);
    headboardMesh.position.set(0, h * 0.5, -d / 2 + 0.025);
    group.add(headboardMesh);

    // Frame
    const frame = new THREE.BoxGeometry(w + 0.04, h * 0.15, d + 0.04);
    const frameMesh = new THREE.Mesh(frame, this.config.defaultMaterial);
    frameMesh.position.y = h * 0.075;
    group.add(frameMesh);

    return this.mergeGroupToGeometry(group);
  }

  /**
   * Generate a simple plant geometry.
   */
  private generatePlantGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Pot
    const pot = new THREE.CylinderGeometry(w * 0.3, w * 0.2, h * 0.2, 12);
    const potMesh = new THREE.Mesh(pot, new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.8,
      metalness: 0.1,
    }));
    potMesh.position.y = h * 0.1;
    group.add(potMesh);

    // Foliage (sphere)
    const foliage = new THREE.SphereGeometry(w * 0.4, 12, 8);
    const foliageMesh = new THREE.Mesh(foliage, new THREE.MeshStandardMaterial({
      color: 0x2d5a1e,
      roughness: 0.9,
      metalness: 0.0,
    }));
    foliageMesh.position.y = h * 0.5 + h * 0.15;
    group.add(foliageMesh);

    return this.mergeGroupToGeometry(group);
  }

  /**
   * Merge a group of meshes into a single BufferGeometry.
   */
  private mergeGroupToGeometry(group: THREE.Group): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    group.updateMatrixWorld(true);

    for (const child of group.children) {
      if (child instanceof THREE.Mesh) {
        const cloned = child.geometry.clone();
        cloned.applyMatrix4(child.matrixWorld);
        geometries.push(cloned);
      }
    }

    if (geometries.length === 0) {
      return new THREE.BoxGeometry(0.5, 0.5, 0.5);
    }

    if (geometries.length === 1) {
      return geometries[0];
    }

    // Merge manually
    const merged = this.mergeGeometries(geometries);
    return merged;
  }

  /**
   * Merge geometries, delegating to the canonical GeometryPipeline.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return GeometryPipeline.mergeGeometries(geometries);
  }

  /**
   * Get material for a placeholder based on its tags.
   */
  private getMaterial(placeholder: Placeholder): THREE.MeshStandardMaterial {
    const hasTag = (name: string): boolean => {
      for (const t of placeholder.tags) {
        if (t.name === name) return true;
      }
      return false;
    };

    if (hasTag('wood') || hasTag('furniture')) {
      return new THREE.MeshStandardMaterial({
        color: 0x8b6914,
        roughness: 0.7,
        metalness: 0.05,
      });
    }
    if (hasTag('metal')) {
      return new THREE.MeshStandardMaterial({
        color: 0x999999,
        roughness: 0.3,
        metalness: 0.8,
      });
    }
    if (hasTag('glass')) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xccddff,
        roughness: 0.05,
        metalness: 0.0,
        transparent: true,
        opacity: 0.4,
        transmission: 0.8,
      });
    }
    if (hasTag('fabric')) {
      return new THREE.MeshStandardMaterial({
        color: 0x6b4423,
        roughness: 0.95,
        metalness: 0.0,
      });
    }

    return this.config.defaultMaterial;
  }
}

// ============================================================================
// PopulateSystem — Main orchestrator
// ============================================================================

/**
 * Main orchestrator for converting solved constraint states into populated 3D scenes.
 *
 * Takes the output of the constraint solver (a set of ObjectState entries
 * with solved positions/rotations) and converts each placeholder into
 * a real 3D asset using the appropriate factory.
 *
 * Pipeline:
 * 1. Extract placeholders from solver state
 * 2. Resolve each placeholder to an asset factory
 * 3. Spawn 3D meshes for each placeholder
 * 4. Validate placement (no overlaps, within bounds)
 * 5. Return populated scene group
 */
export class PopulateSystem {
  private config: PopulateConfig;
  private resolver: PlaceholderResolver;
  private spawner: AssetSpawner;
  private rng: SeededRandom;

  constructor(
    config: Partial<PopulateConfig> = {},
    factoryRegistry?: AssetFactoryRegistry,
    usageLookup?: TagUsageLookup,
    seed: number = 42,
  ) {
    this.config = { ...DEFAULT_POPULATE_CONFIG, ...config };
    this.resolver = new PlaceholderResolver(factoryRegistry, usageLookup, seed);
    this.spawner = new AssetSpawner(config, seed);
    this.rng = new SeededRandom(seed);
  }

  /**
   * Populate a scene from solved constraint state.
   *
   * @param objects - The solved object states from the constraint solver
   * @param roomId - Optional room filter (only populate objects in this room)
   * @returns A PopulateResult with all spawned assets
   */
  populate(
    objects: Map<string, ObjectState>,
    roomId?: string,
  ): PopulateResult {
    const assets: SpawnedAsset[] = [];
    const assetMap = new Map<string, SpawnedAsset>();
    const failures: Array<{ placeholderId: string; reason: string }> = [];
    const sceneGroup = new THREE.Group();
    sceneGroup.name = 'PopulatedScene';

    // Convert ObjectStates to Placeholders
    const placeholders = this.extractPlaceholders(objects, roomId);

    // Count per-room assets
    const roomAssetCounts = new Map<string, number>();

    for (const placeholder of placeholders) {
      // Check room capacity
      const currentCount = roomAssetCounts.get(placeholder.roomId) ?? 0;
      if (currentCount >= this.config.maxAssetsPerRoom) {
        failures.push({
          placeholderId: placeholder.id,
          reason: `Room "${placeholder.roomId}" has reached max asset count (${this.config.maxAssetsPerRoom})`,
        });
        continue;
      }

      // Resolve placeholder to factory
      const factory = this.resolver.resolve(placeholder);
      if (!factory) {
        failures.push({
          placeholderId: placeholder.id,
          reason: `No matching factory found for type "${placeholder.type}" with tags [${Array.from(placeholder.tags).map(t => t.toString()).join(', ')}]`,
        });
        continue;
      }

      // Spawn the asset
      const spawned = this.spawner.spawn(placeholder, factory);

      // Validate placement (check for overlaps with existing assets)
      const overlap = this.checkOverlap(spawned, assets);
      if (overlap) {
        failures.push({
          placeholderId: placeholder.id,
          reason: `Overlaps with existing asset "${overlap.placeholderId}"`,
        });
        continue;
      }

      // Add to results
      assets.push(spawned);
      assetMap.set(placeholder.id, spawned);
      sceneGroup.add(spawned.mesh);
      roomAssetCounts.set(placeholder.roomId, currentCount + 1);
    }

    return {
      assets,
      sceneGroup,
      assetMap,
      populatedCount: assets.length,
      failedCount: failures.length,
      failures,
    };
  }

  /**
   * Extract placeholders from solver ObjectStates.
   */
  private extractPlaceholders(
    objects: Map<string, ObjectState>,
    roomId?: string,
  ): Placeholder[] {
    const placeholders: Placeholder[] = [];

    for (const [id, obj] of objects) {
      // Filter by room if specified
      if (roomId) {
        const roomRelation = obj.getRelation('room');
        if (roomRelation && roomRelation.targetId !== roomId) continue;
      }

      placeholders.push({
        id: obj.id,
        type: obj.type,
        position: obj.position.clone(),
        rotation: obj.rotation.clone(),
        scale: obj.scale.clone(),
        tags: obj.tags.clone(),
        roomId: obj.getRelation('room')?.targetId ?? 'default',
      });
    }

    return placeholders;
  }

  /**
   * Check if a spawned asset overlaps with any existing assets.
   */
  private checkOverlap(
    asset: SpawnedAsset,
    existingAssets: SpawnedAsset[],
  ): SpawnedAsset | null {
    if (asset.boundingBox.isEmpty()) return null;

    for (const existing of existingAssets) {
      if (existing.boundingBox.isEmpty()) continue;

      // Check for same-type proximity (softer check)
      if (asset.tags.toArray().some(t => existing.tags.toArray().some(et => et.name === t.name))) {
        const distance = asset.position.distanceTo(existing.position);
        if (distance < this.config.minSameTypeDistance) {
          return existing;
        }
      }

      // Check bounding box intersection
      if (asset.boundingBox.intersectsBox(existing.boundingBox)) {
        return existing;
      }
    }

    return null;
  }
}
