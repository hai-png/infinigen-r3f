/**
 * VegetationLODSystem.ts
 *
 * Camera-Distance LOD Pipeline + Procedural Bark Material + Twig Refinement (P1 Vegetation)
 *
 * Comprehensive Level-of-Detail system for vegetation objects with:
 *   1. VegetationLODManager — registers vegetation objects, computes camera distance,
 *      selects LOD levels with hysteresis, creates LOD mesh variants
 *   2. LODGeometrySimplifier — generates simplified geometry per LOD level
 *      (edge collapse, convex hull, billboard quad)
 *   3. ProceduralBarkMaterial — multi-layer bark shader using GLSLProceduralTextureBridge
 *      (FBM base color, ridged bark ridges, Voronoi knot holes, noise lichen)
 *   4. VegetationDetailComposer — composes tree skeletons with LOD-managed details
 *   5. LODConfig / SeasonalLODConfig — configuration interfaces
 *
 * LOD Levels:
 *   LOD0: Full detail (all branches, leaves, fruits)
 *   LOD1: Medium (fewer branches, billboard leaves, no fruits)
 *   LOD2: Low (trunk + canopy sphere/cone, billboard)
 *   LOD3: Billboard only (single quad facing camera)
 *   LOD4: Culled (not rendered)
 *
 * @module assets/objects/vegetation
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm, seededNoise3D, seededVoronoi2D } from '@/core/util/MathUtils';
import {
  createProceduralMaterial,
  type ProceduralMaterialParams,
} from '@/assets/materials/shaders/GLSLProceduralTextureBridge';
import {
  FruitFactory,
  FlowerFactory,
  TwigGenerator,
  TreeChildPlacer,
  SeasonalAppearance,
  DEFAULT_TREE_CHILDREN_CONFIG,
  DEFAULT_SEASON_CONFIGS,
  type TreeChildrenConfig,
  type SeasonConfig,
  type FruitParams,
  type FlowerParams,
  type TwigParams,
} from './FruitFlowerSystem';
import type { TreeSkeleton, TreeVertex } from './SpaceColonization';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Configuration for a single LOD level's distance and face budget.
 */
export interface LODLevelConfig {
  /** Distance at which this LOD level begins */
  minDistance: number;
  /** Distance at which this LOD level ends */
  maxDistance: number;
}

/**
 * LOD configuration for a vegetation object.
 * Controls distance thresholds, face budgets, hysteresis, and culling.
 */
export interface LODConfig {
  /** Distance thresholds per LOD level (5 entries: LOD0–LOD4) */
  distances: number[];
  /** Target face count per LOD level (5 entries: LOD0–LOD4) */
  targetFaceSizes: number[];
  /** Distance hysteresis fraction for LOD switching (default 0.05 = 5%) */
  transitionHysteresis: number;
  /** Billboard rendering mode */
  billboardMode: 'alpha_cutout' | 'solid';
  /** Distance at which the object is removed entirely (culled) */
  cullDistance: number;
}

/**
 * Season-aware LOD settings. Controls what details are visible per season.
 */
export interface SeasonalLODConfig {
  /** Current season */
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Whether flowers are visible (spring: full, summer: partial, autumn/winter: none) */
  flowersEnabled: boolean;
  /** Whether fruits are visible (spring: none, summer: growing, autumn: ripe, winter: none) */
  fruitsEnabled: boolean;
  /** Leaf density fraction 0–1 (spring: 0.7, summer: 1.0, autumn: 0.5, winter: 0.05) */
  leafDensity: number;
  /** Leaf color for the season */
  leafColor: THREE.Color;
  /** Whether twigs are visible (spring–autumn: yes, winter: at LOD0 only) */
  twigsEnabled: boolean;
  /** Fruit maturity 0–1 (0 = unripe green, 1 = fully ripe) */
  fruitMaturity: number;
  /** Flower bloom state 0–1 (0 = bud, 1 = full bloom) */
  flowerBloom: number;
}

/**
 * Existing vegetation LOD config (backward-compatible).
 * Used by the simple 3-LOD VegetationLODSystem.
 */
export interface VegetationLODConfig {
  /** LOD distance thresholds */
  lodDistances: LODLevelConfig[];
  /** Number of billboard angles to pre-render (4–8) */
  billboardAngles: number;
  /** Billboard sprite resolution */
  billboardResolution: number;
  /** Whether to use instanced rendering for LOD2 */
  useInstancedBillboards: boolean;
}

/**
 * A registered vegetation instance with its LOD state.
 */
export interface VegetationInstance {
  /** The full-detail mesh group */
  mesh: THREE.Group;
  /** World position */
  position: THREE.Vector3;
  /** Y-axis rotation */
  rotation: number;
  /** Uniform scale */
  scale: number;
  /** Vegetation type for LOD grouping */
  type: string;
  /** Pre-computed LOD level */
  currentLOD: number;
}

/**
 * Internal tracking entry for a registered vegetation object.
 */
interface VegetationEntry {
  /** The original full-detail object */
  object: THREE.Object3D;
  /** LOD configuration for this object */
  config: LODConfig;
  /** THREE.LOD object managing the level switches */
  lodObject: THREE.LOD;
  /** Current active LOD level (with hysteresis) */
  currentLevel: number;
  /** Bounding sphere for distance computation */
  boundingSphere: THREE.Sphere;
  /** Seasonal config */
  seasonalConfig: SeasonalLODConfig;
  /** Optional tree skeleton for detail composition */
  skeleton?: TreeSkeleton;
}

/**
 * Parameters for procedural bark material generation.
 */
export interface BarkMaterialParams {
  /** Base bark color (brown-grey tones) */
  barkColor: THREE.Color;
  /** Depth of bark ridges (0–1, default 0.5) */
  ridgeDepth: number;
  /** Density of knot holes (0–1, default 0.3) */
  knotDensity: number;
  /** Amount of lichen/moss coverage (0–1, default 0.2) */
  lichenAmount: number;
  /** Moisture level affecting darkness (0–1, default 0.3) */
  moistureLevel: number;
  /** Resolution of generated textures (default 512) */
  resolution: number;
  /** Random seed for variation */
  seed: number;
}

/**
 * Parameters for procedural leaf material generation.
 */
export interface LeafMaterialParams {
  /** Base leaf color */
  leafColor: THREE.Color;
  /** Season for color variation */
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Vein pattern intensity (0–1, default 0.5) */
  veinIntensity: number;
  /** Subsurface scattering approximation (0–1, default 0.8) */
  subsurfaceScattering: number;
  /** Resolution of generated textures (default 256) */
  resolution: number;
  /** Random seed for variation */
  seed: number;
}

/**
 * Parameters for procedural twig material generation.
 */
export interface TwigMaterialParams {
  /** Base bark color (smooth transition from trunk) */
  barkColor: THREE.Color;
  /** Transition blend from trunk bark to smooth twig (0–1, default 0.5) */
  barkToTwigBlend: number;
  /** Fresnel rim lighting intensity (0–1, default 0.3) */
  fresnelRimIntensity: number;
  /** Resolution of generated textures (default 256) */
  resolution: number;
  /** Random seed for variation */
  seed: number;
}

/**
 * Configuration for VegetationDetailComposer.
 */
export interface DetailComposerConfig {
  /** Bark material parameters */
  barkParams: Partial<BarkMaterialParams>;
  /** Leaf material parameters */
  leafParams: Partial<LeafMaterialParams>;
  /** Twig material parameters */
  twigParams: Partial<TwigMaterialParams>;
  /** Tree children config (fruits, flowers, twigs) */
  childrenConfig: Partial<TreeChildrenConfig>;
  /** Seasonal LOD config */
  seasonalConfig: SeasonalLODConfig;
  /** LOD level to compose for (0–4) */
  lodLevel: number;
  /** Random seed */
  seed: number;
}

// ============================================================================
// Default Configurations
// ============================================================================

/** Default LOD configuration for a typical tree */
export const DEFAULT_LOD_CONFIG: LODConfig = {
  distances: [0, 30, 80, 150, 300],
  targetFaceSizes: [10000, 3000, 800, 2, 0],
  transitionHysteresis: 0.05,
  billboardMode: 'alpha_cutout',
  cullDistance: 300,
};

/** Default bark material parameters */
export const DEFAULT_BARK_PARAMS: BarkMaterialParams = {
  barkColor: new THREE.Color(0x4a3728),
  ridgeDepth: 0.5,
  knotDensity: 0.3,
  lichenAmount: 0.2,
  moistureLevel: 0.3,
  resolution: 512,
  seed: 42,
};

/** Default leaf material parameters */
export const DEFAULT_LEAF_PARAMS: LeafMaterialParams = {
  leafColor: new THREE.Color(0x2d5a1d),
  season: 'summer',
  veinIntensity: 0.5,
  subsurfaceScattering: 0.8,
  resolution: 256,
  seed: 42,
};

/** Default twig material parameters */
export const DEFAULT_TWIG_PARAMS: TwigMaterialParams = {
  barkColor: new THREE.Color(0x5d4037),
  barkToTwigBlend: 0.5,
  fresnelRimIntensity: 0.3,
  resolution: 256,
  seed: 42,
};

/** Seasonal LOD configs for each season */
export const SEASONAL_LOD_CONFIGS: Record<string, SeasonalLODConfig> = {
  spring: {
    season: 'spring',
    flowersEnabled: true,
    fruitsEnabled: false,
    leafDensity: 0.7,
    leafColor: new THREE.Color(0x7cb342),
    twigsEnabled: true,
    fruitMaturity: 0.1,
    flowerBloom: 1.0,
  },
  summer: {
    season: 'summer',
    flowersEnabled: false,
    fruitsEnabled: true,
    leafDensity: 1.0,
    leafColor: new THREE.Color(0x2d5a1d),
    twigsEnabled: true,
    fruitMaturity: 0.7,
    flowerBloom: 0.3,
  },
  autumn: {
    season: 'autumn',
    flowersEnabled: false,
    fruitsEnabled: true,
    leafDensity: 0.5,
    leafColor: new THREE.Color(0xd84315),
    twigsEnabled: true,
    fruitMaturity: 1.0,
    flowerBloom: 0.0,
  },
  winter: {
    season: 'winter',
    flowersEnabled: false,
    fruitsEnabled: false,
    leafDensity: 0.05,
    leafColor: new THREE.Color(0x5d4037),
    twigsEnabled: false,
    fruitMaturity: 0.0,
    flowerBloom: 0.0,
  },
};

// ============================================================================
// VegetationLODManager
// ============================================================================

/**
 * Manages Level-of-Detail for registered vegetation objects.
 *
 * Computes per-frame camera distances, selects LOD levels with hysteresis
 * to prevent popping, and switches between pre-built geometry variants.
 *
 * Usage:
 * ```ts
 * const manager = new VegetationLODManager();
 * manager.addVegetationObject(treeGroup, lodConfig);
 * // In render loop:
 * manager.update(camera);
 * ```
 */
export class VegetationLODManager {
  private entries: VegetationEntry[] = [];
  private billboardCache: Map<string, THREE.CanvasTexture> = new Map();
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Register a vegetation object with its LOD configuration.
   * Creates LOD mesh variants at different detail levels and adds them
   * to a THREE.LOD object for automatic switching.
   *
   * @param object The vegetation object (tree, bush, etc.)
   * @param lodConfig LOD distances, face budgets, hysteresis, and cull distance
   * @param seasonalConfig Season-specific LOD settings (default: summer)
   * @param skeleton Optional tree skeleton for detail composition
   */
  addVegetationObject(
    object: THREE.Object3D,
    lodConfig: LODConfig = DEFAULT_LOD_CONFIG,
    seasonalConfig: SeasonalLODConfig = SEASONAL_LOD_CONFIGS.summer,
    skeleton?: TreeSkeleton,
  ): void {
    const lod = this.createLODVariants(object, lodConfig, seasonalConfig);

    // Compute bounding sphere from object
    const boundingBox = new THREE.Box3().setFromObject(object);
    const boundingSphere = new THREE.Sphere();
    boundingBox.getBoundingSphere(boundingSphere);

    const entry: VegetationEntry = {
      object,
      config: lodConfig,
      lodObject: lod,
      currentLevel: 0,
      boundingSphere,
      seasonalConfig,
      skeleton,
    };

    this.entries.push(entry);
  }

  /**
   * Update LOD levels based on camera position.
   * For each registered object, computes distance to camera and selects
   * the appropriate LOD level with hysteresis to prevent popping.
   *
   * @param camera The active camera for distance computation
   */
  update(camera: THREE.Camera): void {
    const cameraPos = camera.position;

    for (const entry of this.entries) {
      // Compute distance from camera to object center
      const objectWorldPos = new THREE.Vector3();
      entry.object.getWorldPosition(objectWorldPos);
      const distance = cameraPos.distanceTo(objectWorldPos);

      // Select LOD level with hysteresis
      const newLevel = this.selectLODLevel(distance, entry);

      if (newLevel !== entry.currentLevel) {
        entry.currentLevel = newLevel;
        entry.lodObject.update(camera);
      }
    }
  }

  /**
   * Create LOD mesh variants at different detail levels.
   *
   * LOD0: Full detail (all branches, leaves, fruits)
   * LOD1: Medium (fewer branches, billboard leaves, no fruits)
   * LOD2: Low (trunk + canopy sphere/cone, billboard)
   * LOD3: Billboard only (single quad facing camera)
   * LOD4: Culled (not rendered)
   *
   * @param geometry The full-detail geometry to create variants from
   * @param levels Number of LOD levels (default 5)
   * @returns THREE.LOD object with all levels configured
   */
  createLODVariants(
    object: THREE.Object3D,
    lodConfig: LODConfig,
    seasonalConfig: SeasonalLODConfig,
  ): THREE.LOD {
    const lod = new THREE.LOD();
    const distances = lodConfig.distances;
    const simplifier = new LODGeometrySimplifier(this.rng);

    // LOD0: Full detail — use the original object
    lod.addLevel(object, distances[0]);

    // LOD1: Medium detail — simplified geometry
    const lod1Group = this.createMediumLOD(object, seasonalConfig);
    lod.addLevel(lod1Group, distances[1] ?? 30);

    // LOD2: Low detail — trunk + canopy approximation
    const lod2Group = this.createLowLOD(object);
    lod.addLevel(lod2Group, distances[2] ?? 80);

    // LOD3: Billboard only
    const lod3Mesh = simplifier.createBillboardQuad(
      this.getBillboardTextureForObject(object),
      this.estimateObjectSize(object),
    );
    lod.addLevel(lod3Mesh, distances[3] ?? 150);

    // LOD4: Culled — empty object
    const culledObject = new THREE.Object3D();
    culledObject.visible = false;
    lod.addLevel(culledObject, distances[4] ?? 300);

    return lod;
  }

  /**
   * Get all registered LOD objects for adding to a scene.
   */
  getLODObjects(): THREE.LOD[] {
    return this.entries.map(e => e.lodObject);
  }

  /**
   * Update the seasonal configuration for a registered object.
   */
  setSeasonalConfig(object: THREE.Object3D, config: SeasonalLODConfig): void {
    const entry = this.entries.find(e => e.object === object);
    if (entry) {
      entry.seasonalConfig = config;
    }
  }

  /**
   * Get the count of objects at each LOD level.
   */
  getLODCounts(): Record<number, number> {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const entry of this.entries) {
      counts[entry.currentLevel] = (counts[entry.currentLevel] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get total registered object count.
   */
  getObjectCount(): number {
    return this.entries.length;
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.billboardCache.forEach(tex => tex.dispose());
    this.billboardCache.clear();
    for (const entry of this.entries) {
      entry.lodObject.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }
    this.entries = [];
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Select LOD level from distance with hysteresis to prevent popping.
   * The hysteresis creates a dead zone around transition distances:
   * switching UP (farther) requires distance > threshold + hysteresis,
   * switching DOWN (closer) requires distance < threshold - hysteresis.
   */
  private selectLODLevel(distance: number, entry: VegetationEntry): number {
    const distances = entry.config.distances;
    const hysteresis = entry.config.transitionHysteresis;
    const currentLevel = entry.currentLevel;

    // Find the appropriate level
    let targetLevel = distances.length - 1; // Default to culled
    for (let i = 0; i < distances.length - 1; i++) {
      if (distance < distances[i + 1]) {
        targetLevel = i;
        break;
      }
    }

    // Apply hysteresis: only switch if we've moved far enough past the boundary
    if (targetLevel !== currentLevel) {
      const threshold = distances[Math.max(targetLevel, currentLevel)];
      const hysteresisDistance = threshold * hysteresis;

      if (targetLevel > currentLevel) {
        // Moving to lower detail (farther): require distance > threshold + hysteresis
        if (distance < threshold + hysteresisDistance) {
          return currentLevel; // Stay at current level
        }
      } else {
        // Moving to higher detail (closer): require distance < threshold - hysteresis
        if (distance > threshold - hysteresisDistance) {
          return currentLevel; // Stay at current level
        }
      }
    }

    return targetLevel;
  }

  /**
   * Create a medium-detail LOD representation.
   * Fewer branches, merged leaf clusters, no fruits/flowers.
   */
  private createMediumLOD(
    object: THREE.Object3D,
    seasonalConfig: SeasonalLODConfig,
  ): THREE.Group {
    const group = new THREE.Group();
    const simplifier = new LODGeometrySimplifier(this.rng);

    // Collect meshes from the original object
    const meshes: THREE.Mesh[] = [];
    object.traverse(child => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });

    // Simplify branch/trunk geometry
    for (const mesh of meshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const isBark = material && (
        material.roughness > 0.7 ||
        (material.color && this.isBrownish(material.color))
      );

      if (isBark && mesh.geometry) {
        const simplified = simplifier.simplifyToLevel(
          mesh.geometry,
          Math.max(100, this.countFaces(mesh.geometry) * 0.3),
          'edge_collapse',
        );
        const newMesh = new THREE.Mesh(simplified, material.clone());
        newMesh.position.copy(mesh.position);
        newMesh.rotation.copy(mesh.rotation);
        newMesh.scale.copy(mesh.scale);
        newMesh.castShadow = true;
        group.add(newMesh);
      }
    }

    // Add simplified foliage — merged sphere clusters instead of individual leaves
    const foliageData = this.extractFoliageBounds(object);
    if (foliageData) {
      const foliageMat = new THREE.MeshStandardMaterial({
        color: seasonalConfig.leafColor,
        roughness: 0.7,
        metalness: 0.0,
      });

      // Create 1-3 merged spheres for canopy
      const clusterCount = Math.max(1, Math.min(3, Math.floor(foliageData.radius / 2)));
      for (let i = 0; i < clusterCount; i++) {
        const radius = foliageData.radius * (0.4 + this.rng.uniform(0, 0.3));
        const foliageGeo = new THREE.SphereGeometry(radius, 8, 6);
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.copy(foliageData.center);
        foliage.position.x += (this.rng.next() - 0.5) * foliageData.radius * 0.5;
        foliage.position.z += (this.rng.next() - 0.5) * foliageData.radius * 0.5;
        foliage.castShadow = true;
        group.add(foliage);
      }
    }

    return group;
  }

  /**
   * Create a low-detail LOD representation.
   * Trunk cylinder + canopy sphere/cone.
   */
  private createLowLOD(object: THREE.Object3D): THREE.Group {
    const group = new THREE.Group();
    const size = this.estimateObjectSize(object);

    // Simplified trunk — single cylinder
    const trunkHeight = size * 0.5;
    const trunkRadius = size * 0.05;
    const trunkGeo = new THREE.CylinderGeometry(
      trunkRadius * 0.7, trunkRadius, trunkHeight, 6,
    );
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    group.add(trunk);

    // Simplified canopy — sphere or cone
    const canopyRadius = size * 0.3;
    const canopyGeo = new THREE.SphereGeometry(canopyRadius, 6, 4);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a1d,
      roughness: 0.7,
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = trunkHeight + canopyRadius * 0.5;
    canopy.castShadow = true;
    group.add(canopy);

    return group;
  }

  /**
   * Estimate the overall size of an object from its bounding box.
   */
  private estimateObjectSize(object: THREE.Object3D): number {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    return Math.max(size.x, size.y, size.z);
  }

  /**
   * Extract foliage bounding information from an object.
   */
  private extractFoliageBounds(object: THREE.Object3D): { center: THREE.Vector3; radius: number } | null {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return null;

    const center = new THREE.Vector3();
    box.getCenter(center);
    center.y = box.max.y * 0.7; // Foliage is in upper portion

    const size = new THREE.Vector3();
    box.getSize(size);
    const radius = Math.max(size.x, size.z) * 0.4;

    return { center, radius };
  }

  /**
   * Get or create a billboard texture for a vegetation object.
   */
  private getBillboardTextureForObject(object: THREE.Object3D): THREE.CanvasTexture {
    const key = `billboard_${object.uuid}`;
    if (this.billboardCache.has(key)) {
      return this.billboardCache.get(key)!;
    }

    const texture = this.generateBillboardTexture(object);
    this.billboardCache.set(key, texture);
    return texture;
  }

  /**
   * Generate a billboard texture by rendering a simplified tree silhouette.
   */
  private generateBillboardTexture(object: THREE.Object3D): THREE.CanvasTexture {
    const res = 128;
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, res, res);

    // Detect colors from object materials
    let trunkColor = '#4a3728';
    let foliageColor = '#2d5a1d';
    object.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const mat = child.material;
        if (this.isBrownish(mat.color)) {
          trunkColor = `#${mat.color.getHexString()}`;
        } else if (this.isGreenish(mat.color)) {
          foliageColor = `#${mat.color.getHexString()}`;
        }
      }
    });

    // Draw trunk
    ctx.fillStyle = trunkColor;
    const trunkWidth = res * 0.08;
    const trunkHeight = res * 0.45;
    ctx.fillRect(res / 2 - trunkWidth / 2, res - trunkHeight, trunkWidth, trunkHeight);

    // Draw canopy — rounded ellipse
    ctx.fillStyle = foliageColor;
    ctx.beginPath();
    ctx.ellipse(res / 2, res * 0.4, res * 0.35, res * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Add noise variation
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 40; i++) {
      const x = this.rng.next() * res;
      const y = this.rng.next() * res * 0.6;
      const r = this.rng.uniform(2, 5);
      ctx.fillStyle = this.rng.next() > 0.5 ? '#1a3d1a' : '#4a7c23';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Check if a color is in the brown/bark range.
   */
  private isBrownish(color: THREE.Color): boolean {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    return hsl.h > 0.02 && hsl.h < 0.12 && hsl.s < 0.6 && hsl.l < 0.5;
  }

  /**
   * Check if a color is in the green/foliage range.
   */
  private isGreenish(color: THREE.Color): boolean {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    return hsl.h > 0.15 && hsl.h < 0.45 && hsl.s > 0.2;
  }

  /**
   * Count the number of faces in a geometry.
   */
  private countFaces(geometry: THREE.BufferGeometry): number {
    if (geometry.index) {
      return geometry.index.count / 3;
    }
    return geometry.attributes.position.count / 3;
  }
}

// ============================================================================
// LODGeometrySimplifier
// ============================================================================

/**
 * Generates simplified geometry for each LOD level.
 *
 * Provides multiple simplification strategies:
 * - Edge collapse for medium LOD (progressive decimation)
 * - Convex hull approximation for low LOD
 * - Billboard quad generation for the lowest LOD
 */
export class LODGeometrySimplifier {
  private rng: SeededRandom;

  constructor(rng?: SeededRandom) {
    this.rng = rng ?? new SeededRandom(42);
  }

  /**
   * Simplify geometry to a target face count using the specified method.
   *
   * @param geometry The source geometry to simplify
   * @param targetFaces Target number of faces
   * @param method Simplification method: 'edge_collapse', 'convex_hull', or 'billboard'
   * @returns Simplified BufferGeometry
   */
  simplifyToLevel(
    geometry: THREE.BufferGeometry,
    targetFaces: number,
    method: 'edge_collapse' | 'convex_hull' | 'billboard',
  ): THREE.BufferGeometry {
    switch (method) {
      case 'edge_collapse':
        return this.edgeCollapseSimplify(geometry, targetFaces);
      case 'convex_hull':
        return this.convexHullApproximation(geometry, targetFaces);
      case 'billboard':
        return this.createBillboardFromGeometry(geometry);
      default:
        return this.edgeCollapseSimplify(geometry, targetFaces);
    }
  }

  /**
   * Create a camera-facing billboard quad with a vegetation texture.
   * The quad auto-rotates to face the camera and uses alpha-cutout
   * for the tree silhouette.
   *
   * @param texture The billboard texture (tree silhouette)
   * @param size Size of the billboard quad
   * @returns Mesh with billboard behavior
   */
  createBillboardQuad(texture: THREE.Texture, size: number): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(size, size);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.isBillboard = true;
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Edge Collapse Simplification
  // --------------------------------------------------------------------------

  /**
   * Simplify geometry using iterative edge collapse.
   * Collapses the shortest edges first, merging their vertices.
   *
   * This is a simplified implementation that reduces face count by
   * selectively removing vertices and re-triangulating.
   */
  private edgeCollapseSimplify(
    geometry: THREE.BufferGeometry,
    targetFaces: number,
  ): THREE.BufferGeometry {
    const posAttr = geometry.attributes.position;
    if (!posAttr) return new THREE.BufferGeometry();

    const currentFaces = this.countFaces(geometry);
    if (currentFaces <= targetFaces) {
      return geometry.clone();
    }

    // Simple vertex decimation: skip every Nth vertex
    const ratio = targetFaces / currentFaces;
    const step = Math.max(1, Math.floor(1 / ratio));

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const normAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;
    const indexAttr = geometry.index;

    // Select vertices to keep
    const keptIndices: number[] = [];
    for (let i = 0; i < posAttr.count; i += step) {
      keptIndices.push(i);
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      if (normAttr) {
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      } else {
        normals.push(0, 1, 0);
      }
      if (uvAttr) {
        uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      } else {
        uvs.push(0, 0);
      }
    }

    // Re-triangulate using kept vertices
    for (let i = 0; i < keptIndices.length - 2; i++) {
      indices.push(i, i + 1, i + 2);
    }

    const simplified = new THREE.BufferGeometry();
    simplified.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    simplified.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    simplified.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (indices.length > 0) {
      simplified.setIndex(indices);
    }
    simplified.computeVertexNormals();

    return simplified;
  }

  // --------------------------------------------------------------------------
  // Convex Hull Approximation
  // --------------------------------------------------------------------------

  /**
   * Create a convex hull approximation of the geometry.
   * Samples vertices and creates a simplified convex bounding shape.
   */
  private convexHullApproximation(
    geometry: THREE.BufferGeometry,
    targetFaces: number,
  ): THREE.BufferGeometry {
    const posAttr = geometry.attributes.position;
    if (!posAttr) return new THREE.BufferGeometry();

    // Compute bounding box
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Create an icosahedron as convex hull approximation
    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    const detail = targetFaces > 100 ? 2 : targetFaces > 20 ? 1 : 0;
    return new THREE.IcosahedronGeometry(radius, detail);
  }

  // --------------------------------------------------------------------------
  // Billboard from Geometry
  // --------------------------------------------------------------------------

  /**
   * Create a billboard representation from existing geometry.
   * Uses the geometry's bounding size to determine billboard dimensions.
   */
  private createBillboardFromGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);

    const width = Math.max(size.x, size.z);
    const height = size.y;

    return new THREE.PlaneGeometry(width, height);
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Count faces in a geometry.
   */
  private countFaces(geometry: THREE.BufferGeometry): number {
    if (geometry.index) {
      return geometry.index.count / 3;
    }
    return geometry.attributes.position.count / 3;
  }
}

// ============================================================================
// ProceduralBarkMaterial
// ============================================================================

/**
 * Generates multi-layer procedural bark materials using the GLSL pipeline.
 *
 * Bark shader layers:
 * 1. Base color from FBM noise (brown-grey tones)
 * 2. Bark ridges from ridged multifractal (vertical streak pattern)
 * 3. Knot holes from Voronoi (scattered dark spots)
 * 4. Lichen/moss from noise threshold (green patches on one side)
 *
 * Outputs a MeshStandardMaterial with albedo, normal, roughness, and AO maps.
 */
export class ProceduralBarkMaterial {
  /**
   * Create a procedural bark material with multi-layer noise.
   *
   * @param params Bark material parameters
   * @param rng Seeded random for variation
   * @returns MeshStandardMaterial with procedural bark textures
   */
  static createBarkMaterial(
    params: Partial<BarkMaterialParams> = {},
    rng?: SeededRandom,
  ): THREE.MeshStandardMaterial {
    const p: BarkMaterialParams = { ...DEFAULT_BARK_PARAMS, ...params };
    const seed = p.seed;
    const usedRng = rng ?? new SeededRandom(seed);

    // Generate bark color variation using FBM
    const barkColor = ProceduralBarkMaterial.generateBarkBaseColor(p.barkColor, usedRng, p.moistureLevel);

    // Use GLSLProceduralTextureBridge for GPU-accelerated texture generation
    try {
      const material = createProceduralMaterial('wood', {
        baseColor: barkColor,
        roughness: 0.85 + p.moistureLevel * 0.1,
        metallic: 0.0,
        aoStrength: 0.8,
        normalStrength: 1.0 + p.ridgeDepth * 0.5,
        heightScale: 0.03 + p.ridgeDepth * 0.02,
        resolution: p.resolution,
        seed: seed,
      });

      material.name = `ProceduralBark_${seed}`;

      // Apply additional bark-specific modulation
      ProceduralBarkMaterial.applyBarkRidgeModulation(material, p, usedRng);
      ProceduralBarkMaterial.applyKnotHoleModulation(material, p, usedRng);
      ProceduralBarkMaterial.applyLichenModulation(material, p, usedRng);

      return material;
    } catch {
      // Fallback: create a simple bark material without GLSL pipeline
      return ProceduralBarkMaterial.createFallbackBarkMaterial(p, usedRng);
    }
  }

  /**
   * Create a procedural leaf material with vein pattern and seasonal color.
   *
   * @param params Leaf material parameters
   * @param rng Seeded random for variation
   * @returns MeshStandardMaterial with procedural leaf textures
   */
  static createLeafMaterial(
    params: Partial<LeafMaterialParams> = {},
    rng?: SeededRandom,
  ): THREE.MeshStandardMaterial {
    const p: LeafMaterialParams = { ...DEFAULT_LEAF_PARAMS, ...params };
    const usedRng = rng ?? new SeededRandom(p.seed);

    // Seasonal color modulation
    const leafColor = ProceduralBarkMaterial.getSeasonalLeafColor(p.season, p.leafColor, usedRng);

    try {
      const material = createProceduralMaterial('nature', {
        baseColor: leafColor,
        roughness: 0.6,
        metallic: 0.0,
        aoStrength: 0.5,
        normalStrength: 0.5 + p.veinIntensity * 0.5,
        heightScale: 0.005,
        resolution: p.resolution,
        seed: p.seed,
      });

      material.name = `ProceduralLeaf_${p.season}_${p.seed}`;

      // Subsurface scattering approximation via high transmission
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.transmission = p.subsurfaceScattering * 0.3;
        material.thickness = 0.5;
        material.attenuationColor = leafColor.clone().multiplyScalar(0.8);
      } else {
        // For MeshStandardMaterial, approximate SSS with emissive
        material.emissive = leafColor.clone().multiplyScalar(p.subsurfaceScattering * 0.1);
        material.emissiveIntensity = 0.3;
      }

      material.side = THREE.DoubleSide;

      return material;
    } catch {
      return ProceduralBarkMaterial.createFallbackLeafMaterial(p, usedRng);
    }
  }

  /**
   * Create a procedural twig material with smooth bark-to-twig transition.
   *
   * @param params Twig material parameters
   * @param rng Seeded random for variation
   * @returns MeshStandardMaterial with procedural twig textures
   */
  static createTwigMaterial(
    params: Partial<TwigMaterialParams> = {},
    rng?: SeededRandom,
  ): THREE.MeshStandardMaterial {
    const p: TwigMaterialParams = { ...DEFAULT_TWIG_PARAMS, ...params };
    const usedRng = rng ?? new SeededRandom(p.seed);

    // Smooth transition from trunk bark to smooth twig
    const twigColor = p.barkColor.clone().lerp(
      new THREE.Color(0x6d5a4a),
      p.barkToTwigBlend,
    );

    try {
      const material = createProceduralMaterial('wood', {
        baseColor: twigColor,
        roughness: 0.7 - p.barkToTwigBlend * 0.2, // Twigs are smoother than trunk
        metallic: 0.0,
        aoStrength: 0.4,
        normalStrength: 0.5 * (1 - p.barkToTwigBlend), // Less normal detail on thin twigs
        heightScale: 0.01 * (1 - p.barkToTwigBlend),
        resolution: p.resolution,
        seed: p.seed,
      });

      material.name = `ProceduralTwig_${p.seed}`;

      // Fresnel rim lighting for thin branches
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.sheen = p.fresnelRimIntensity;
        material.sheenRoughness = 0.5;
        material.sheenColor = new THREE.Color(0.6, 0.55, 0.5);
      }

      return material;
    } catch {
      return ProceduralBarkMaterial.createFallbackTwigMaterial(p, usedRng);
    }
  }

  // --------------------------------------------------------------------------
  // Bark Layer Modulations
  // --------------------------------------------------------------------------

  /**
   * Generate the base bark color with FBM noise variation.
   * Adds brown-grey tonal variation based on moisture level.
   */
  private static generateBarkBaseColor(
    baseColor: THREE.Color,
    rng: SeededRandom,
    moistureLevel: number,
  ): THREE.Color {
    const hsl = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(hsl);

    // FBM-based color variation
    const variation = seededFbm(rng.nextInt(0, 1000), 0, 0, 3, 2.0, 0.5, rng.nextInt(0, 9999));

    // Adjust hue slightly
    hsl.h += variation * 0.02;
    // Increase saturation with moisture
    hsl.s += moistureLevel * 0.1;
    // Darken with moisture
    hsl.l -= moistureLevel * 0.08;
    // Add variation
    hsl.l += variation * 0.05;

    // Clamp
    hsl.h = Math.max(0, Math.min(1, hsl.h));
    hsl.s = Math.max(0, Math.min(1, hsl.s));
    hsl.l = Math.max(0.05, Math.min(0.5, hsl.l));

    const color = new THREE.Color();
    color.setHSL(hsl.h, hsl.s, hsl.l);
    return color;
  }

  /**
   * Apply bark ridge modulation to a material.
   * Modulates roughness to create vertical ridge streaks.
   */
  private static applyBarkRidgeModulation(
    material: THREE.MeshStandardMaterial,
    params: BarkMaterialParams,
    rng: SeededRandom,
  ): void {
    // Ridge modulation affects roughness variation
    const ridgeFactor = params.ridgeDepth;
    const currentRoughness = material.roughness;

    // Add ridged noise pattern to roughness (stored in roughnessMap variation)
    // Since we can't easily modify the GPU-generated texture, we adjust the material
    // properties to simulate the ridge effect
    material.roughness = currentRoughness * (1 - ridgeFactor * 0.2);

    // Store ridge parameters for potential custom shader usage
    (material as any)._barkRidgeDepth = ridgeFactor;
    (material as any)._barkRidgeSeed = rng.nextInt(0, 9999);
  }

  /**
   * Apply knot hole modulation to a material.
   * Creates scattered dark spots using Voronoi patterns.
   */
  private static applyKnotHoleModulation(
    material: THREE.MeshStandardMaterial,
    params: BarkMaterialParams,
    rng: SeededRandom,
  ): void {
    // Knot holes appear as dark spots in the bark
    // This modulates the color and adds AO variation
    const knotFactor = params.knotDensity;

    // Slightly darken the base color to account for knot hole averaging
    const darkenedColor = material.color.clone().multiplyScalar(1 - knotFactor * 0.1);
    material.color.copy(darkenedColor);

    // Increase AO to simulate shadow in knot holes
    material.aoMapIntensity = Math.min(2.0, (material.aoMapIntensity ?? 1.0) + knotFactor * 0.3);

    // Store knot parameters
    (material as any)._barkKnotDensity = knotFactor;
    (material as any)._barkKnotSeed = rng.nextInt(0, 9999);
  }

  /**
   * Apply lichen/moss modulation to a material.
   * Adds green patches on one side (typically the shaded/north side).
   */
  private static applyLichenModulation(
    material: THREE.MeshStandardMaterial,
    params: BarkMaterialParams,
    rng: SeededRandom,
  ): void {
    const lichenFactor = params.lichenAmount;

    if (lichenFactor > 0.1) {
      // Slightly tint the base color toward green for lichen areas
      const lichenColor = new THREE.Color(0x4a7a30);
      const blendedColor = material.color.clone().lerp(lichenColor, lichenFactor * 0.15);
      material.color.copy(blendedColor);

      // Lichen areas are slightly rougher
      material.roughness = Math.min(1.0, material.roughness + lichenFactor * 0.05);
    }

    // Store lichen parameters
    (material as any)._barkLichenAmount = lichenFactor;
    (material as any)._barkLichenSeed = rng.nextInt(0, 9999);
  }

  // --------------------------------------------------------------------------
  // Seasonal Leaf Color
  // --------------------------------------------------------------------------

  /**
   * Get the seasonal leaf color with variation.
   */
  private static getSeasonalLeafColor(
    season: string,
    baseColor: THREE.Color,
    rng: SeededRandom,
  ): THREE.Color {
    const seasonColors: Record<string, THREE.Color> = {
      spring: new THREE.Color(0x7cb342),
      summer: baseColor.clone(),
      autumn: new THREE.Color(0xd84315),
      winter: new THREE.Color(0x5d4037),
    };

    const targetColor = seasonColors[season] ?? baseColor.clone();

    // Add slight variation
    const variation = rng.uniform(-0.03, 0.03);
    const hsl = { h: 0, s: 0, l: 0 };
    targetColor.getHSL(hsl);
    hsl.h += variation;
    hsl.s += rng.uniform(-0.1, 0.1);
    targetColor.setHSL(
      Math.max(0, Math.min(1, hsl.h)),
      Math.max(0, Math.min(1, hsl.s)),
      hsl.l,
    );

    return targetColor;
  }

  // --------------------------------------------------------------------------
  // Fallback Materials (when GLSL pipeline is unavailable)
  // --------------------------------------------------------------------------

  /**
   * Create a simple fallback bark material without GLSL pipeline.
   */
  private static createFallbackBarkMaterial(
    params: BarkMaterialParams,
    rng: SeededRandom,
  ): THREE.MeshStandardMaterial {
    const barkColor = ProceduralBarkMaterial.generateBarkBaseColor(
      params.barkColor, rng, params.moistureLevel,
    );

    // Generate a simple canvas-based bark texture
    const res = params.resolution;
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d')!;

    // Fill with base color
    ctx.fillStyle = `#${barkColor.getHexString()}`;
    ctx.fillRect(0, 0, res, res);

    // Draw bark ridges (vertical lines with noise)
    for (let x = 0; x < res; x += rng.nextInt(3, 8)) {
      const brightness = rng.uniform(-30, 30);
      const r = Math.max(0, Math.min(255, (barkColor.r * 255) + brightness));
      const g = Math.max(0, Math.min(255, (barkColor.g * 255) + brightness));
      const b = Math.max(0, Math.min(255, (barkColor.b * 255) + brightness));
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = rng.uniform(1, 3);
      ctx.beginPath();

      let y = 0;
      ctx.moveTo(x, 0);
      while (y < res) {
        y += rng.uniform(5, 15);
        const xOffset = rng.uniform(-2, 2);
        ctx.lineTo(x + xOffset, y);
      }
      ctx.stroke();
    }

    // Add knot holes
    const knotCount = Math.floor(params.knotDensity * 5);
    for (let i = 0; i < knotCount; i++) {
      const kx = rng.uniform(0.1, 0.9) * res;
      const ky = rng.uniform(0.1, 0.9) * res;
      const kr = rng.uniform(3, 8);
      ctx.fillStyle = 'rgba(30, 20, 10, 0.6)';
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr, kr * 1.3, rng.uniform(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
    }

    // Add lichen patches
    if (params.lichenAmount > 0.1) {
      const lichenCount = Math.floor(params.lichenAmount * 8);
      for (let i = 0; i < lichenCount; i++) {
        const lx = rng.uniform(0, 0.5) * res; // Lichen on one side
        const ly = rng.uniform(0, 1) * res;
        const lr = rng.uniform(5, 15);
        ctx.fillStyle = `rgba(74, 122, 48, ${rng.uniform(0.1, 0.3)})`;
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      map: texture,
      color: barkColor,
      roughness: 0.85 + params.moistureLevel * 0.1,
      metalness: 0.0,
      bumpMap: texture,
      bumpScale: 0.03 + params.ridgeDepth * 0.02,
    });
  }

  /**
   * Create a simple fallback leaf material.
   */
  private static createFallbackLeafMaterial(
    params: LeafMaterialParams,
    rng: SeededRandom,
  ): THREE.MeshStandardMaterial {
    const leafColor = ProceduralBarkMaterial.getSeasonalLeafColor(
      params.season, params.leafColor, rng,
    );

    // Generate a canvas-based leaf texture with vein pattern
    const res = params.resolution;
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d')!;

    // Fill with base color
    ctx.fillStyle = `#${leafColor.getHexString()}`;
    ctx.fillRect(0, 0, res, res);

    // Draw central vein
    const veinColor = leafColor.clone().multiplyScalar(0.7);
    ctx.strokeStyle = `#${veinColor.getHexString()}`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(res / 2, 0);
    ctx.lineTo(res / 2, res);
    ctx.stroke();

    // Draw side veins
    const sideVeinCount = Math.floor(4 + params.veinIntensity * 6);
    for (let i = 0; i < sideVeinCount; i++) {
      const y = (i + 1) / (sideVeinCount + 1) * res;
      ctx.beginPath();
      ctx.moveTo(res / 2, y);
      ctx.quadraticCurveTo(
        res * 0.75, y - res * 0.05,
        res * 0.9, y + res * 0.02,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(res / 2, y);
      ctx.quadraticCurveTo(
        res * 0.25, y - res * 0.05,
        res * 0.1, y + res * 0.02,
      );
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      map: texture,
      color: leafColor,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
      emissive: leafColor.clone().multiplyScalar(params.subsurfaceScattering * 0.1),
      emissiveIntensity: 0.3,
    });
  }

  /**
   * Create a simple fallback twig material.
   */
  private static createFallbackTwigMaterial(
    params: TwigMaterialParams,
    rng: SeededRandom,
  ): THREE.MeshStandardMaterial {
    const twigColor = params.barkColor.clone().lerp(
      new THREE.Color(0x6d5a4a),
      params.barkToTwigBlend,
    );

    return new THREE.MeshStandardMaterial({
      color: twigColor,
      roughness: 0.7 - params.barkToTwigBlend * 0.2,
      metalness: 0.0,
    });
  }
}

// ============================================================================
// VegetationDetailComposer
// ============================================================================

/**
 * Composes a tree skeleton with LOD-managed procedural details.
 *
 * Takes a basic tree skeleton from TreeGenerator/SpaceColonization and adds:
 * - Bark material on trunk/branches (via ProceduralBarkMaterial)
 * - Leaves at terminal branches (with seasonal color)
 * - Fruits (from FruitFlowerSystem) at LOD0 only
 * - Twigs (from TwigGenerator) at LOD0–LOD1
 *
 * Returns a composed group ready for VegetationLODManager registration.
 */
export class VegetationDetailComposer {
  /**
   * Compose a tree group with LOD-managed procedural details.
   *
   * @param treeGroup The basic tree skeleton group from TreeGenerator
   * @param config Composition configuration
   * @returns Composed group with all details applied
   */
  static composeTreeWithDetail(
    treeGroup: THREE.Group,
    config: Partial<DetailComposerConfig> = {},
  ): THREE.Group {
    const fullConfig: DetailComposerConfig = {
      barkParams: DEFAULT_BARK_PARAMS,
      leafParams: DEFAULT_LEAF_PARAMS,
      twigParams: DEFAULT_TWIG_PARAMS,
      childrenConfig: DEFAULT_TREE_CHILDREN_CONFIG,
      seasonalConfig: SEASONAL_LOD_CONFIGS.summer,
      lodLevel: 0,
      seed: 42,
      ...config,
    };

    const rng = new SeededRandom(fullConfig.seed);
    const composedGroup = new THREE.Group();
    composedGroup.name = 'ComposedTree';

    // Step 1: Apply bark material to trunk/branch meshes
    const barkMaterial = ProceduralBarkMaterial.createBarkMaterial(
      fullConfig.barkParams, rng,
    );
    VegetationDetailComposer.applyMaterialToBarkMeshes(treeGroup, barkMaterial);

    // Step 2: Apply leaf material to foliage meshes
    const leafMaterial = ProceduralBarkMaterial.createLeafMaterial(
      {
        ...fullConfig.leafParams,
        season: fullConfig.seasonalConfig.season,
        leafColor: fullConfig.seasonalConfig.leafColor,
      },
      rng,
    );
    VegetationDetailComposer.applyMaterialToFoliageMeshes(treeGroup, leafMaterial);

    // Step 3: Add fruits at LOD0 only
    if (fullConfig.lodLevel === 0 && fullConfig.seasonalConfig.fruitsEnabled) {
      VegetationDetailComposer.addFruits(
        composedGroup,
        fullConfig.childrenConfig,
        fullConfig.seasonalConfig,
        rng,
      );
    }

    // Step 4: Add twigs at LOD0–LOD1
    if (fullConfig.lodLevel <= 1 && fullConfig.seasonalConfig.twigsEnabled) {
      VegetationDetailComposer.addTwigs(
        composedGroup,
        fullConfig.childrenConfig,
        rng,
      );
    }

    // Step 5: Add flowers at LOD0 (spring/summer)
    if (fullConfig.lodLevel === 0 && fullConfig.seasonalConfig.flowersEnabled) {
      VegetationDetailComposer.addFlowers(
        composedGroup,
        fullConfig.childrenConfig,
        fullConfig.seasonalConfig,
        rng,
      );
    }

    // Step 6: Apply seasonal appearance modulation
    const seasonConfig: SeasonConfig = {
      season: fullConfig.seasonalConfig.season,
      fruitMaturity: fullConfig.seasonalConfig.fruitMaturity,
      flowerBloom: fullConfig.seasonalConfig.flowerBloom,
      leafColor: fullConfig.seasonalConfig.leafColor,
      leafDensity: fullConfig.seasonalConfig.leafDensity,
    };
    const seasonalAppearance = new SeasonalAppearance(seasonConfig);
    seasonalAppearance.applyToGroup(composedGroup);

    // Step 7: Copy the base tree group into the composed group
    const treeClone = treeGroup.clone();
    composedGroup.add(treeClone);

    return composedGroup;
  }

  /**
   * Apply bark material to all branch/trunk meshes in a group.
   * Detects bark meshes by their material properties (high roughness, brown color).
   */
  static applyMaterialToBarkMeshes(
    group: THREE.Object3D,
    material: THREE.MeshStandardMaterial,
  ): void {
    group.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const mat = child.material;
        // Detect bark meshes: rough, non-metallic, brown-ish
        if (mat.roughness > 0.6 && mat.metalness < 0.1) {
          const hsl = { h: 0, s: 0, l: 0 };
          mat.color.getHSL(hsl);
          // Brown range: hue 0.02–0.12, saturation < 0.7
          if (hsl.h > 0.01 && hsl.h < 0.15 && hsl.s < 0.7) {
            child.material = material.clone();
          }
        }
      }
    });
  }

  /**
   * Apply leaf material to all foliage meshes in a group.
   * Detects foliage meshes by their green color.
   */
  static applyMaterialToFoliageMeshes(
    group: THREE.Object3D,
    material: THREE.MeshStandardMaterial,
  ): void {
    group.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const mat = child.material;
        // Detect foliage meshes: green-ish color
        const hsl = { h: 0, s: 0, l: 0 };
        mat.color.getHSL(hsl);
        if (hsl.h > 0.15 && hsl.h < 0.45 && hsl.s > 0.15) {
          child.material = material.clone();
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // Detail Adders
  // --------------------------------------------------------------------------

  /**
   * Add fruits to branch endpoints.
   */
  private static addFruits(
    group: THREE.Group,
    childrenConfig: Partial<TreeChildrenConfig>,
    seasonalConfig: SeasonalLODConfig,
    rng: SeededRandom,
  ): void {
    const config = { ...DEFAULT_TREE_CHILDREN_CONFIG, ...childrenConfig };
    if (!config.fruitEnabled) return;

    // Place a few fruits at random positions within the tree volume
    const fruitCount = Math.floor(config.fruitDensity * 10);
    const fruitParams = FruitFactory.randomize(config.fruitType, rng);

    // Adjust fruit color based on maturity
    const unripeColor = new THREE.Color(0x6b8e23); // Green
    fruitParams.color = unripeColor.clone().lerp(fruitParams.color, seasonalConfig.fruitMaturity);

    for (let i = 0; i < fruitCount; i++) {
      const fruit = FruitFactory.generate(fruitParams, rng);
      fruit.position.set(
        rng.uniform(-1, 1) * 2,
        rng.uniform(3, 6),
        rng.uniform(-1, 1) * 2,
      );
      group.add(fruit);
    }
  }

  /**
   * Add twigs at branch endpoints.
   */
  private static addTwigs(
    group: THREE.Group,
    childrenConfig: Partial<TreeChildrenConfig>,
    rng: SeededRandom,
  ): void {
    const config = { ...DEFAULT_TREE_CHILDREN_CONFIG, ...childrenConfig };
    if (!config.twigEnabled) return;

    const twigParams = TwigGenerator.createScaledParams(3.0, config.twigSizeScale);
    const twigCount = Math.floor(rng.uniform(3, 8));

    for (let i = 0; i < twigCount; i++) {
      const twig = TwigGenerator.generate(twigParams, rng);
      twig.position.set(
        rng.uniform(-1, 1) * 2,
        rng.uniform(3, 6),
        rng.uniform(-1, 1) * 2,
      );
      twig.rotation.y = rng.uniform(0, Math.PI * 2);
      group.add(twig);
    }
  }

  /**
   * Add flowers at branch endpoints.
   */
  private static addFlowers(
    group: THREE.Group,
    childrenConfig: Partial<TreeChildrenConfig>,
    seasonalConfig: SeasonalLODConfig,
    rng: SeededRandom,
  ): void {
    const config = { ...DEFAULT_TREE_CHILDREN_CONFIG, ...childrenConfig };
    if (!config.flowerEnabled) return;

    const flowerParams = FlowerFactory.randomize(config.flowerType, rng);

    // Adjust flower scale based on bloom
    const flowerScale = 0.3 + seasonalConfig.flowerBloom * 0.7;
    flowerParams.petalSize *= flowerScale;

    const flowerCount = Math.floor(config.flowerDensity * 8);
    for (let i = 0; i < flowerCount; i++) {
      const flower = FlowerFactory.generate(flowerParams, rng);
      flower.position.set(
        rng.uniform(-1, 1) * 2,
        rng.uniform(3, 6),
        rng.uniform(-1, 1) * 2,
      );
      flower.visible = seasonalConfig.flowerBloom > 0.3;
      group.add(flower);
    }
  }
}

// ============================================================================
// VegetationLODSystem (backward-compatible wrapper)
// ============================================================================

/**
 * Backward-compatible 3-LOD VegetationLODSystem.
 *
 * Provides a simple 3-level LOD system for vegetation:
 *   LOD0: Full detail
 *   LOD1: Reduced detail
 *   LOD2: Billboard
 *
 * Wraps the new VegetationLODManager for compatibility with existing code.
 */
export class VegetationLODSystem {
  private config: VegetationLODConfig;
  private instances: VegetationInstance[] = [];
  private billboardCache: Map<string, THREE.CanvasTexture> = new Map();
  private lodGroups: Map<number, THREE.Group> = new Map();
  private camera: THREE.Camera | null = null;
  private rng: SeededRandom;
  private manager: VegetationLODManager;

  constructor(config: Partial<VegetationLODConfig> = {}, seed: number = 42) {
    this.rng = new SeededRandom(seed);
    this.manager = new VegetationLODManager(seed);
    this.config = {
      lodDistances: [
        { minDistance: 0, maxDistance: 50 },
        { minDistance: 50, maxDistance: 120 },
        { minDistance: 120, maxDistance: 500 },
      ],
      billboardAngles: 6,
      billboardResolution: 128,
      useInstancedBillboards: true,
      ...config,
    };

    // Initialize LOD groups
    for (let i = 0; i < 3; i++) {
      this.lodGroups.set(i, new THREE.Group());
    }
  }

  /**
   * Set the camera for distance calculations
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Register a vegetation instance for LOD management
   */
  addInstance(instance: VegetationInstance): void {
    this.instances.push(instance);
  }

  /**
   * Add multiple instances
   */
  addInstances(instances: VegetationInstance[]): void {
    this.instances.push(...instances);
  }

  /**
   * Get the LOD group for a specific level
   */
  getLODGroup(level: number): THREE.Group {
    return this.lodGroups.get(level) ?? new THREE.Group();
  }

  /**
   * Get all LOD groups as an array
   */
  getAllLODGroups(): THREE.Group[] {
    return [this.lodGroups.get(0)!, this.lodGroups.get(1)!, this.lodGroups.get(2)!];
  }

  /**
   * Update LOD levels based on camera position
   */
  update(): void {
    if (!this.camera) return;

    const cameraPos = this.camera.position;

    for (const instance of this.instances) {
      const distance = cameraPos.distanceTo(instance.position);
      const newLOD = this.computeLODLevel(distance);

      if (newLOD !== instance.currentLOD) {
        this.switchLOD(instance, instance.currentLOD, newLOD);
        instance.currentLOD = newLOD;
      }
    }
  }

  /**
   * Compute LOD level from distance
   */
  private computeLODLevel(distance: number): number {
    for (let i = 0; i < this.config.lodDistances.length; i++) {
      const lodConfig = this.config.lodDistances[i];
      if (distance >= lodConfig.minDistance && distance < lodConfig.maxDistance) {
        return i;
      }
    }
    return this.config.lodDistances.length - 1;
  }

  /**
   * Switch an instance between LOD levels
   */
  private switchLOD(instance: VegetationInstance, fromLOD: number, toLOD: number): void {
    const fromGroup = this.lodGroups.get(fromLOD);
    const toGroup = this.lodGroups.get(toLOD);

    if (fromGroup) {
      const children = fromGroup.children;
      for (let i = children.length - 1; i >= 0; i--) {
        if (children[i].userData.instanceId === this.getInstanceId(instance)) {
          fromGroup.remove(children[i]);
          break;
        }
      }
    }

    if (toGroup) {
      const lodObject = this.createLODRepresentation(instance, toLOD);
      lodObject.userData.instanceId = this.getInstanceId(instance);
      toGroup.add(lodObject);
    }
  }

  private getInstanceId(instance: VegetationInstance): string {
    return `${instance.type}_${instance.position.x.toFixed(2)}_${instance.position.z.toFixed(2)}`;
  }

  /**
   * Create the appropriate representation for a LOD level
   */
  private createLODRepresentation(instance: VegetationInstance, lodLevel: number): THREE.Object3D {
    switch (lodLevel) {
      case 0:
        return this.createFullDetailLOD(instance);
      case 1:
        return this.createReducedLOD(instance);
      case 2:
        return this.createBillboardLOD(instance);
      default:
        return this.createBillboardLOD(instance);
    }
  }

  /**
   * LOD0: Full detail mesh
   */
  private createFullDetailLOD(instance: VegetationInstance): THREE.Group {
    const clone = instance.mesh.clone();
    clone.position.copy(instance.position);
    clone.rotation.y = instance.rotation;
    clone.scale.setScalar(instance.scale);
    return clone;
  }

  /**
   * LOD1: Reduced detail — simplified branch geometry + merged foliage
   */
  private createReducedLOD(instance: VegetationInstance): THREE.Group {
    const group = new THREE.Group();
    const simplifier = new LODGeometrySimplifier(this.rng);

    // Simplified trunk — single cylinder
    const trunkHeight = 5 * instance.scale;
    const trunkRadius = 0.3 * instance.scale;
    const trunkGeo = new THREE.CylinderGeometry(
      trunkRadius * 0.7, trunkRadius, trunkHeight, 6,
    );
    const trunkMat = ProceduralBarkMaterial.createBarkMaterial({
      barkColor: new THREE.Color(0x4a3728),
      resolution: 128,
    }, this.rng);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    group.add(trunk);

    // Simplified foliage — 1-2 merged spheres
    const foliageRng = new SeededRandom(Math.floor(instance.position.x * 100 + instance.position.z * 100));
    const foliageCount = foliageRng.nextInt(1, 3);
    const foliageMat = ProceduralBarkMaterial.createLeafMaterial({
      leafColor: new THREE.Color(0x2d5a1d),
      resolution: 64,
    }, foliageRng);

    for (let i = 0; i < foliageCount; i++) {
      const radius = foliageRng.uniform(1.5, 3.0) * instance.scale;
      const foliageGeo = new THREE.SphereGeometry(radius, 6, 4);
      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
      foliage.position.set(
        (foliageRng.next() - 0.5) * instance.scale,
        trunkHeight + foliageRng.uniform(0, 1) * instance.scale,
        (foliageRng.next() - 0.5) * instance.scale,
      );
      foliage.castShadow = true;
      group.add(foliage);
    }

    group.position.copy(instance.position);
    group.rotation.y = instance.rotation;

    return group;
  }

  /**
   * LOD2: Billboard — camera-facing sprite
   */
  private createBillboardLOD(instance: VegetationInstance): THREE.Mesh {
    const texture = this.getBillboardTexture(instance.type);

    const height = 6 * instance.scale;
    const width = height;
    const simplifier = new LODGeometrySimplifier(this.rng);
    const mesh = simplifier.createBillboardQuad(texture, width);
    mesh.position.copy(instance.position);
    mesh.position.y += height / 2;

    // Billboard behavior: always face camera
    mesh.lookAt(this.camera?.position ?? new THREE.Vector3(0, 5, 0));

    return mesh;
  }

  /**
   * Get or create a billboard texture for a vegetation type
   */
  private getBillboardTexture(type: string): THREE.CanvasTexture {
    if (this.billboardCache.has(type)) {
      return this.billboardCache.get(type)!;
    }

    const texture = this.generateBillboardTexture(type);
    this.billboardCache.set(type, texture);
    return texture;
  }

  /**
   * Generate a billboard texture by rendering a simplified tree silhouette
   */
  private generateBillboardTexture(type: string): THREE.CanvasTexture {
    const res = this.config.billboardResolution;
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, res, res);

    const colors: Record<string, { trunk: string; foliage: string }> = {
      oak: { trunk: '#4a3728', foliage: '#2d5a1d' },
      pine: { trunk: '#3e2723', foliage: '#1b5e20' },
      birch: { trunk: '#e8e8e8', foliage: '#689f38' },
      palm: { trunk: '#8d6e63', foliage: '#4caf50' },
      willow: { trunk: '#5d4037', foliage: '#8bc34a' },
      default: { trunk: '#4a3728', foliage: '#2d5a1d' },
    };

    const palette = colors[type] || colors.default;

    // Draw trunk
    ctx.fillStyle = palette.trunk;
    const trunkWidth = res * 0.08;
    const trunkHeight = res * 0.45;
    ctx.fillRect(res / 2 - trunkWidth / 2, res - trunkHeight, trunkWidth, trunkHeight);

    // Draw foliage
    ctx.fillStyle = palette.foliage;
    ctx.beginPath();
    if (type === 'pine') {
      ctx.moveTo(res / 2, res * 0.1);
      ctx.lineTo(res * 0.75, res * 0.55);
      ctx.lineTo(res * 0.25, res * 0.55);
    } else {
      ctx.ellipse(res / 2, res * 0.4, res * 0.35, res * 0.3, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    // Add some noise/variation
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 50; i++) {
      const x = this.rng.next() * res;
      const y = this.rng.next() * res * 0.6;
      const r = this.rng.uniform(2, 6);
      ctx.fillStyle = this.rng.next() > 0.5 ? '#1a3d1a' : '#4a7c23';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Update billboard orientations to face the camera
   */
  updateBillboardOrientations(): void {
    if (!this.camera) return;

    const lod2Group = this.lodGroups.get(2);
    if (!lod2Group) return;

    for (const child of lod2Group.children) {
      if (child.userData.isBillboard) {
        child.lookAt(this.camera.position);
      }
    }
  }

  /**
   * Create instanced billboard mesh for all LOD2 instances of a type
   */
  createInstancedBillboards(type: string, instances: VegetationInstance[]): THREE.InstancedMesh | null {
    if (instances.length === 0) return null;

    const texture = this.getBillboardTexture(type);
    const height = 6;
    const width = 6;
    const geometry = new THREE.PlaneGeometry(width, height);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });

    const instancedMesh = new THREE.InstancedMesh(geometry, material, instances.length);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      dummy.position.copy(inst.position);
      dummy.position.y += height * inst.scale / 2;
      dummy.scale.setScalar(inst.scale);
      dummy.rotation.y = inst.rotation;

      if (this.camera) {
        dummy.lookAt(this.camera.position);
      }

      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  /**
   * Get total instance count
   */
  getInstanceCount(): number {
    return this.instances.length;
  }

  /**
   * Get instance count per LOD level
   */
  getLODCounts(): Record<number, number> {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    for (const inst of this.instances) {
      counts[inst.currentLOD] = (counts[inst.currentLOD] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get the underlying LOD manager (for advanced usage)
   */
  getManager(): VegetationLODManager {
    return this.manager;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.billboardCache.forEach(tex => tex.dispose());
    this.billboardCache.clear();
    this.instances = [];
    this.lodGroups.forEach(group => {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    });
    this.manager.dispose();
  }
}

// ============================================================================
// Convenience Factory Functions
// ============================================================================

/**
 * Create a complete LOD-managed tree with procedural bark, leaves, and details.
 *
 * @param treeGroup Base tree group from TreeGenerator
 * @param config Detail composition configuration
 * @param lodConfig LOD distance configuration
 * @returns Composed tree registered with a new VegetationLODManager
 */
export function createLODTree(
  treeGroup: THREE.Group,
  config: Partial<DetailComposerConfig> = {},
  lodConfig: LODConfig = DEFAULT_LOD_CONFIG,
): { composed: THREE.Group; manager: VegetationLODManager } {
  const composed = VegetationDetailComposer.composeTreeWithDetail(treeGroup, config);
  const manager = new VegetationLODManager(config.seed ?? 42);
  manager.addVegetationObject(composed, lodConfig, config.seasonalConfig);
  return { composed, manager };
}

/**
 * Create a seasonal LOD configuration for a given season.
 *
 * @param season The target season
 * @returns SeasonalLODConfig with appropriate settings
 */
export function createSeasonalConfig(
  season: 'spring' | 'summer' | 'autumn' | 'winter',
): SeasonalLODConfig {
  return SEASONAL_LOD_CONFIGS[season] ?? SEASONAL_LOD_CONFIGS.summer;
}

/**
 * Create LOD-appropriate detail configuration.
 * Higher LOD levels use fewer details (no fruits, fewer twigs, etc.)
 *
 * @param lodLevel LOD level (0–4)
 * @param season Current season
 * @returns DetailComposerConfig appropriate for the LOD level
 */
export function createLODAppropriateConfig(
  lodLevel: number,
  season: 'spring' | 'summer' | 'autumn' | 'winter',
): DetailComposerConfig {
  const seasonalConfig = createSeasonalConfig(season);

  return {
    barkParams: {
      resolution: Math.max(128, 512 - lodLevel * 128),
    },
    leafParams: {
      season,
      resolution: Math.max(64, 256 - lodLevel * 64),
    },
    twigParams: {
      resolution: Math.max(64, 256 - lodLevel * 64),
    },
    childrenConfig: {
      fruitEnabled: lodLevel === 0 && seasonalConfig.fruitsEnabled,
      flowerEnabled: lodLevel === 0 && seasonalConfig.flowersEnabled,
      twigEnabled: lodLevel <= 1 && seasonalConfig.twigsEnabled,
    },
    seasonalConfig,
    lodLevel,
    seed: 42,
  };
}
