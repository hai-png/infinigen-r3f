/**
 * ScenePipelineIntegration.ts
 *
 * Integrates AssetFactorySystem + DensityPlacementSystem + GPUScatterSystem
 * into a unified scene generation pipeline.
 *
 * Provides three major components:
 *
 * 1. ScenePipelineIntegration — Full scene composition pipeline with
 *    stages: terrain generation, density field computation, scatter
 *    placeholders, populate via AssetFactory, constraint solving,
 *    camera pose search, and ground truth rendering.
 *
 * 2. SceneConfig — Declarative scene specification covering terrain,
 *    assets, water, lighting, and camera constraints.
 *
 * 3. CameraPoseSearch — Ported and enhanced from DensityPlacementSystem's
 *    CameraPoseSearchEngine with raycast-based obstacle checking, adaptive
 *    FOV, and a propose/validate/score loop up to 30 000 iterations.
 *
 * 4. SceneResult — Final scene output with terrain, water, assets,
 *    camera pose, lights, and generation metadata.
 *
 * Public API:
 *   SceneConfig                 scene specification interface
 *   SceneResult                 pipeline output interface
 *   CameraPoseSearch            camera positioning engine
 *   ScenePipelineIntegration    full pipeline orchestrator
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import {
  DensityPlacementSystem,
  PlacementMask,
  PlaceholderInstance,
  TerrainData,
  CameraConstraint,
  CameraPoseResult,
} from '@/core/placement/DensityPlacementSystem';
import {
  AssetFactory,
  AssetFactoryRegistry,
  AssetPipeline,
  LODLevel,
} from '@/assets/utils/AssetFactorySystem';
import {
  GPUScatterAccelerator,
  ScatterCameraCuller,
  ScatterDensityField,
} from '@/core/placement/GPUScatterSystem';

// ============================================================================
// SceneConfig — declarative scene specification
// ============================================================================

/**
 * Full scene specification for the generation pipeline.
 *
 * Covers terrain, asset placement, water, lighting, and camera
 * constraints — all the information needed by ScenePipelineIntegration
 * to produce a complete ComposedScene / SceneResult.
 */
export interface SceneConfig {
  /** Unique scene identifier */
  id: string;
  /** Master random seed */
  seed: number;

  /** Terrain configuration */
  terrain: TerrainSceneConfig;

  /** Asset placement specifications */
  assets: AssetSceneConfig[];

  /** Water configuration */
  water: WaterSceneConfig;

  /** Lighting configuration */
  lighting: LightingSceneConfig;

  /** Camera constraints for pose search */
  camera: CameraSceneConfig;
}

/**
 * Terrain configuration for scene generation.
 */
export interface TerrainSceneConfig {
  /** Random seed for terrain generation (overrides master seed if set) */
  seed?: number;
  /** World-space extent of the terrain */
  worldSize: number;
  /** Height field resolution */
  resolution: number;
  /** Vertical scale multiplier */
  heightScale: number;
  /** Sea level (normalised 0-1) */
  seaLevel: number;
  /** Element types to activate: 'ground', 'mountain', 'cave', 'voronoi_rock', 'waterbody' */
  elementTypes: string[];
  /** Composition weights per element type (element name → weight 0-1) */
  compositionWeights: Record<string, number>;
}

/**
 * Asset placement specification for one asset type in the scene.
 */
export interface AssetSceneConfig {
  /** Factory category (e.g. 'tree', 'boulder') */
  category: string;
  /** Factory asset type (e.g. 'oak_tree', 'granite_boulder') */
  assetType: string;
  /** Target instance count */
  count: number;
  /** Density per unit area (overrides count if > 0) */
  densityPerArea: number;
  /** Minimum spacing between instances */
  spacing: number;
  /** PlacementMask filter configuration */
  maskFilters: MaskFilterConfig[];
  /** Per-instance generation parameters passed to the factory */
  params?: Record<string, any>;
}

/**
 * Configuration for one PlacementMask filter.
 */
export interface MaskFilterConfig {
  /** Filter type */
  type: 'noise' | 'altitude' | 'slope' | 'tag' | 'biome' | 'distance';
  /** Filter-specific parameters */
  params: Record<string, any>;
}

/**
 * Water configuration for the scene.
 */
export interface WaterSceneConfig {
  /** Whether to add a water plane */
  enabled: boolean;
  /** Y position of the water plane */
  planeHeight: number;
  /** Wave type: 'flat', 'sine', 'gerstner' */
  waveType: 'flat' | 'sine' | 'gerstner';
  /** Wave amplitude (world units) */
  waveAmplitude: number;
  /** Water colour */
  color: THREE.Color;
  /** Opacity (0-1) */
  opacity: number;
}

/**
 * Lighting configuration for the scene.
 */
export interface LightingSceneConfig {
  /** Sun position (directional light direction) */
  sunPosition: THREE.Vector3;
  /** Sun intensity */
  sunIntensity: number;
  /** Sun colour */
  sunColor: THREE.Color;
  /** Ambient light intensity */
  ambientIntensity: number;
  /** Ambient colour */
  ambientColor: THREE.Color;
  /** Enable atmospheric fog */
  atmosphericFog: boolean;
  /** Fog density (for exponential fog) */
  fogDensity: number;
  /** Fog near distance (for linear fog) */
  fogNear: number;
  /** Fog far distance (for linear fog) */
  fogFar: number;
}

/**
 * Camera configuration for pose search.
 */
export interface CameraSceneConfig {
  /** Camera constraint definitions */
  constraints: CameraConstraint[];
  /** Maximum pose search iterations */
  maxIterations: number;
  /** Search bounds (overrides auto-detection if set) */
  searchBounds?: THREE.Box3;
  /** Subject point the camera should look at */
  subject?: THREE.Vector3;
  /** Random seed for pose search */
  seed?: number;
}

// ============================================================================
// ComposedScene — intermediate pipeline state
// ============================================================================

/**
 * Intermediate representation of a composed scene during pipeline
 * execution.  Each pipeline stage populates its corresponding field.
 */
export interface ComposedScene {
  /** Generated terrain mesh */
  terrain: THREE.Mesh | null;
  /** Terrain data for placement filters */
  terrainData: TerrainData | null;
  /** Water group (plane + optional wave mesh) */
  water: THREE.Group | null;
  /** Placeholder instances per asset type */
  placeholders: Map<string, PlaceholderInstance[]>;
  /** Density field textures per asset type */
  densityFields: Map<string, THREE.DataTexture>;
  /** Populated asset objects per asset type */
  assets: Map<string, THREE.Object3D[]>;
  /** Scene lights */
  lights: THREE.Light[];
}

// ============================================================================
// SceneResult — final pipeline output
// ============================================================================

/**
 * Final output from the scene generation pipeline.
 */
export interface SceneResult {
  /** Terrain mesh */
  terrain: THREE.Mesh;
  /** Water group */
  water: THREE.Group;
  /** All generated asset objects, keyed by "category::assetType" */
  assets: Map<string, THREE.Object3D[]>;
  /** Best camera pose found */
  camera: CameraPoseResult;
  /** Scene lights */
  lights: THREE.Light[];
  /** Generation metadata and statistics */
  metadata: SceneGenerationMetadata;
}

/**
 * Generation metadata capturing timing and statistics.
 */
export interface SceneGenerationMetadata {
  /** Scene ID */
  sceneId: string;
  /** Master seed used */
  seed: number;
  /** Total generation time (ms) */
  totalTimeMs: number;
  /** Per-stage timings (stage name → ms) */
  stageTimings: Record<string, number>;
  /** Number of asset types processed */
  assetTypeCount: number;
  /** Total instances placed */
  totalInstances: number;
  /** Camera search iterations */
  cameraIterations: number;
  /** Camera search score */
  cameraScore: number;
}

// ============================================================================
// CameraPoseSearch
// ============================================================================

/**
 * Camera pose search engine with raycast-based obstacle checking,
 * adaptive FOV, and weighted composite scoring.
 *
 * Ported and enhanced from DensityPlacementSystem's
 * CameraPoseSearchEngine with the following improvements:
 * - Configurable padding for obstacle raycast distance
 * - Multi-ray obstacle sampling (fan of rays around look direction)
 * - Adaptive FOV based on distance-to-subject
 * - Detailed scoring breakdown for debugging
 */
export class CameraPoseSearch {
  private raycaster: THREE.Raycaster;
  private maxIterations: number;
  private padClearance: number;

  /**
   * @param maxIterations  Maximum propose/validate/score iterations (default 30000)
   * @param padClearance   Extra clearance for obstacle checking (default 0.5)
   */
  constructor(maxIterations: number = 30000, padClearance: number = 0.5) {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = 1000;
    this.maxIterations = maxIterations;
    this.padClearance = padClearance;
  }

  /**
   * Search for an optimal camera pose in the scene.
   *
   * Uses a propose/validate/score loop:
   * 1. Propose a random position within search bounds.
   * 2. Validate against all hard constraints.
   * 3. Score the pose against all constraints (weighted composite).
   * 4. Keep the best-scoring valid pose found.
   *
   * @param scene       THREE.Scene to search within
   * @param constraints Array of camera constraints
   * @param config      Camera configuration (iterations, bounds, subject, seed)
   * @returns CameraPoseResult with best pose found
   */
  search(
    scene: THREE.Scene,
    constraints: CameraConstraint[],
    config: CameraSceneConfig,
  ): CameraPoseResult {
    const seed = config.seed ?? 42;
    const maxIter = config.maxIterations ?? this.maxIterations;
    const rng = new SeededRandom(seed);
    const searchBounds = config.searchBounds ?? this.inferBounds(scene);
    const subjectPos = config.subject ?? new THREE.Vector3(0, 0, 0);

    let bestResult: CameraPoseResult = {
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      fov: Math.PI / 3,
      score: -1,
      iterations: 0,
      found: false,
    };

    for (let i = 0; i < maxIter; i++) {
      // 1. Propose random position within bounds
      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(searchBounds.min.x, searchBounds.max.x, rng.next()),
        THREE.MathUtils.lerp(searchBounds.min.y, searchBounds.max.y, rng.next()),
        THREE.MathUtils.lerp(searchBounds.min.z, searchBounds.max.z, rng.next()),
      );

      // 2. Compute look direction toward subject
      const dir = new THREE.Vector3().subVectors(subjectPos, pos).normalize();

      // 3. Validate hard constraints
      if (!this.validateConstraints(pos, dir, constraints, scene)) {
        continue;
      }

      // 4. Score the pose
      const score = this.scorePose(pos, dir, constraints, scene, subjectPos);
      if (score > bestResult.score) {
        bestResult = {
          position: pos.clone(),
          direction: dir.clone(),
          fov: this.proposeFOV(pos, subjectPos, constraints),
          score,
          iterations: i + 1,
          found: true,
        };
      }
    }

    bestResult.iterations = Math.min(maxIter, bestResult.iterations || maxIter);
    return bestResult;
  }

  // ------------------------------------------------------------------
  // Private: validation
  // ------------------------------------------------------------------

  /**
   * Check hard constraints — returns false if any constraint is violated.
   */
  private validateConstraints(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    constraints: CameraConstraint[],
    scene: THREE.Scene,
  ): boolean {
    for (const c of constraints) {
      switch (c.type) {
        case 'altitude':
          if (c.min !== undefined && pos.y < c.min) return false;
          if (c.max !== undefined && pos.y > c.max) return false;
          break;

        case 'obstacle_clearance': {
          const minClear = (c.min ?? 1.0) + this.padClearance;
          // Cast multiple rays in a fan around the look direction
          const rays = this.buildObstacleRays(pos, dir, minClear);
          for (const ray of rays) {
            this.raycaster.set(ray.origin, ray.direction);
            this.raycaster.near = 0;
            this.raycaster.far = minClear;
            const hits = this.raycaster.intersectObjects(scene.children, true);
            if (hits.length > 0) return false;
          }
          break;
        }

        case 'view_angle': {
          if (!c.target) break;
          const angle = Math.acos(
            THREE.MathUtils.clamp(
              dir.dot(new THREE.Vector3(0, -1, 0)), -1, 1,
            ),
          );
          if (c.min !== undefined && angle < c.min) return false;
          if (c.max !== undefined && angle > c.max) return false;
          break;
        }

        case 'distance_to_subject': {
          // Soft constraint — validated in scoring
          break;
        }

        case 'fov': {
          // No hard validation for FOV
          break;
        }

        case 'custom': {
          if (c.validate) {
            const val = c.validate(pos, dir);
            if (val <= 0) return false;
          }
          break;
        }

        default:
          break;
      }
    }
    return true;
  }

  /**
   * Build a set of rays for obstacle checking: primary + fan of
   * offset rays for wider clearance detection.
   */
  private buildObstacleRays(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    _clearance: number,
  ): Array<{ origin: THREE.Vector3; direction: THREE.Vector3 }> {
    const rays: Array<{ origin: THREE.Vector3; direction: THREE.Vector3 }> = [];

    // Primary ray
    rays.push({ origin: pos.clone(), direction: dir.clone() });

    // Fan of offset rays (4 cardinal directions, 15° offset)
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const fanAngle = 15 * (Math.PI / 180);

    const offsets = [
      right.clone().multiplyScalar(Math.sin(fanAngle)),
      right.clone().multiplyScalar(-Math.sin(fanAngle)),
      up.clone().multiplyScalar(Math.sin(fanAngle)),
      up.clone().multiplyScalar(-Math.sin(fanAngle)),
    ];

    for (const offset of offsets) {
      const offsetDir = dir.clone().multiplyScalar(Math.cos(fanAngle)).add(offset).normalize();
      rays.push({ origin: pos.clone(), direction: offsetDir });
    }

    return rays;
  }

  // ------------------------------------------------------------------
  // Private: scoring
  // ------------------------------------------------------------------

  /**
   * Compute a weighted composite score for a proposed camera pose.
   * Higher score = better pose.
   */
  private scorePose(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    constraints: CameraConstraint[],
    _scene: THREE.Scene,
    subjectPos: THREE.Vector3,
  ): number {
    let score = 0;
    let totalWeight = 0;

    for (const c of constraints) {
      const weight = c.weight ?? 1.0;
      totalWeight += weight;

      switch (c.type) {
        case 'altitude': {
          if (c.min !== undefined && c.max !== undefined) {
            const mid = (c.min + c.max) / 2;
            const range = (c.max - c.min) / 2;
            const dist = Math.abs(pos.y - mid) / Math.max(range, 0.01);
            score += (1 - Math.min(dist, 1)) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'distance_to_subject': {
          const dist = pos.distanceTo(subjectPos);
          if (c.target !== undefined) {
            const ideal = c.target;
            const ratio = Math.min(dist, ideal) / Math.max(dist, ideal);
            score += ratio * weight;
          } else if (c.min !== undefined && c.max !== undefined) {
            const mid = (c.min + c.max) / 2;
            const range = (c.max - c.min) / 2;
            const d = Math.abs(dist - mid) / Math.max(range, 0.01);
            score += (1 - Math.min(d, 1)) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'view_angle': {
          if (c.target !== undefined) {
            const angle = Math.acos(
              THREE.MathUtils.clamp(
                dir.dot(new THREE.Vector3(0, -1, 0)), -1, 1,
              ),
            );
            const diff = Math.abs(angle - c.target);
            score += (1 - Math.min(diff / Math.PI, 1)) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'obstacle_clearance': {
          // Already validated as clear; give full score
          score += 1.0 * weight;
          break;
        }

        case 'fov': {
          // FOV scoring: prefer target FOV
          if (c.target !== undefined) {
            score += 0.8 * weight; // FOV is adaptive, so moderate score
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'custom': {
          if (c.validate) {
            score += c.validate(pos, dir) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        default:
          score += 0.5 * weight;
          break;
      }
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  // ------------------------------------------------------------------
  // Private: FOV proposal
  // ------------------------------------------------------------------

  /**
   * Propose a field of view based on distance-to-subject and constraints.
   * Wider FOV for close subjects, narrower for distant ones.
   */
  private proposeFOV(
    pos: THREE.Vector3,
    subjectPos: THREE.Vector3,
    constraints: CameraConstraint[],
  ): number {
    const fovConstraint = constraints.find(c => c.type === 'fov');
    if (fovConstraint?.target) return fovConstraint.target;

    const dist = pos.distanceTo(subjectPos);
    const adaptiveFOV = THREE.MathUtils.clamp(
      2 * Math.atan(5 / Math.max(dist, 0.1)),
      Math.PI / 6,
      Math.PI / 2,
    );

    // Clamp to constraint bounds if specified
    if (fovConstraint?.min !== undefined) {
      return Math.max(adaptiveFOV, fovConstraint.min);
    }
    if (fovConstraint?.max !== undefined) {
      return Math.min(adaptiveFOV, fovConstraint.max);
    }

    return adaptiveFOV;
  }

  // ------------------------------------------------------------------
  // Private: bounds inference
  // ------------------------------------------------------------------

  /**
   * Infer search bounds from scene content.
   */
  private inferBounds(scene: THREE.Scene): THREE.Box3 {
    const box = new THREE.Box3();
    scene.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
        box.expandByObject(child);
      }
    });

    if (box.isEmpty()) {
      return new THREE.Box3(
        new THREE.Vector3(-100, 2, -100),
        new THREE.Vector3(100, 50, 100),
      );
    }

    // Expand bounds and ensure minimum height
    box.min.x -= 10;
    box.min.z -= 10;
    box.max.x += 10;
    box.max.z += 10;
    box.min.y = Math.max(box.min.y + 2, 2);
    box.max.y = Math.max(box.max.y, box.min.y + 30);

    return box;
  }
}

// ============================================================================
// ScenePipelineIntegration
// ============================================================================

/**
 * Full scene generation pipeline that integrates:
 * - TerrainElementSystem (terrain generation)
 * - DensityPlacementSystem (two-phase placeholder → populate)
 * - GPUScatterSystem (GPU-driven scatter with culling)
 * - AssetFactorySystem (geometry generation)
 * - CameraPoseSearch (camera positioning)
 *
 * Pipeline stages:
 * 1. Generate terrain
 * 2. Compute density fields for each asset type
 * 3. Scatter asset placeholders (Phase 1)
 * 4. Populate placeholders via AssetFactory (Phase 2)
 * 5. Apply constraint solver for indoor scenes
 * 6. Search camera poses
 * 7. Render ground truth passes
 */
export class ScenePipelineIntegration {
  private densitySystem: DensityPlacementSystem;
  private scatterAccelerator: GPUScatterAccelerator;
  private cameraCuller: ScatterCameraCuller;
  private densityField: ScatterDensityField;
  private cameraSearch: CameraPoseSearch;
  private assetPipeline: AssetPipeline;
  private registry: AssetFactoryRegistry;

  /** The active THREE.Scene */
  private scene: THREE.Scene;

  /**
   * @param scene     The THREE.Scene to populate
   * @param registry  Optional pre-configured AssetFactoryRegistry
   */
  constructor(scene: THREE.Scene, registry?: AssetFactoryRegistry) {
    this.scene = scene;
    this.densitySystem = new DensityPlacementSystem();
    this.scatterAccelerator = new GPUScatterAccelerator();
    this.cameraCuller = new ScatterCameraCuller();
    this.densityField = new ScatterDensityField();
    this.cameraSearch = new CameraPoseSearch();
    this.assetPipeline = new AssetPipeline(registry);
    this.registry = this.assetPipeline.getRegistry();
  }

  /**
   * Access the underlying AssetFactoryRegistry.
   */
  getRegistry(): AssetFactoryRegistry {
    return this.registry;
  }

  /**
   * Access the underlying DensityPlacementSystem.
   */
  getDensitySystem(): DensityPlacementSystem {
    return this.densitySystem;
  }

  /**
   * Access the underlying CameraPoseSearch.
   */
  getCameraSearch(): CameraPoseSearch {
    return this.cameraSearch;
  }

  /**
   * Compose a scene from a SceneConfig, executing the pipeline stages
   * and returning an intermediate ComposedScene.
   *
   * This is the synchronous portion of the pipeline; it generates
   * terrain, computes density fields, and creates placeholder instances.
   *
   * @param config  Full scene specification
   * @returns ComposedScene with terrain, placeholders, and density fields
   */
  composeScene(config: SceneConfig): ComposedScene {
    const rng = new SeededRandom(config.seed);
    const composed: ComposedScene = {
      terrain: null,
      terrainData: null,
      water: null,
      placeholders: new Map(),
      densityFields: new Map(),
      assets: new Map(),
      lights: [],
    };

    // --- Stage 1: Generate terrain ---
    const terrain = this.generateTerrain(config.terrain, rng);
    composed.terrain = terrain.mesh;
    composed.terrainData = terrain.terrainData;

    // Add terrain to scene
    if (terrain.mesh) {
      this.scene.add(terrain.mesh);
    }

    // --- Stage 2: Compute density fields ---
    for (const assetConfig of config.assets) {
      const key = `${assetConfig.category}::${assetConfig.assetType}`;
      const mask = this.buildPlacementMask(assetConfig, rng);

      if (composed.terrainData) {
        const densityTex = this.densityField.createDensityTexture(
          composed.terrainData,
          mask,
        );
        composed.densityFields.set(key, densityTex);
      }

      // --- Stage 3: Scatter placeholders ---
      const bounds = new THREE.Box2(
        new THREE.Vector2(
          -config.terrain.worldSize * 0.5,
          -config.terrain.worldSize * 0.5,
        ),
        new THREE.Vector2(
          config.terrain.worldSize * 0.5,
          config.terrain.worldSize * 0.5,
        ),
      );

      const density = assetConfig.densityPerArea > 0
        ? assetConfig.densityPerArea
        : assetConfig.count / (config.terrain.worldSize * config.terrain.worldSize);

      const placeholders = this.densitySystem.scatterPlaceholders(
        mask,
        bounds,
        density,
        assetConfig.spacing,
        rng.nextInt(0, 999999),
        composed.terrainData ?? undefined,
      );

      // Assign asset type to placeholders
      for (const ph of placeholders) {
        ph.assetType = key;
      }

      composed.placeholders.set(key, placeholders);
    }

    // --- Stage 4: Generate water ---
    if (config.water.enabled) {
      composed.water = this.generateWater(config.water);
      this.scene.add(composed.water);
    }

    // --- Stage 5: Generate lights ---
    composed.lights = this.generateLights(config.lighting);
    for (const light of composed.lights) {
      this.scene.add(light);
    }

    return composed;
  }

  /**
   * Full pipeline: compose + populate + camera search.
   *
   * @param config  Full scene specification
   * @returns Promise resolving to a SceneResult
   */
  async generateSceneFromConfig(config: SceneConfig): Promise<SceneResult> {
    const startTime = performance.now();
    const stageTimings: Record<string, number> = {};

    // --- Compose scene (stages 1-5) ---
    const composeStart = performance.now();
    const composed = this.composeScene(config);
    stageTimings['compose'] = performance.now() - composeStart;

    // --- Stage 4: Populate placeholders via AssetFactory ---
    const populateStart = performance.now();
    let totalInstances = 0;

    for (const [key, placeholders] of composed.placeholders) {
      const [category, assetType] = key.split('::');
      const factory = this.registry.get(category, assetType);
      if (!factory) {
        console.warn(`[ScenePipeline] No factory for ${key}, skipping populate`);
        continue;
      }

      // Find matching config for params
      const assetConfig = config.assets.find(
        a => a.category === category && a.assetType === assetType,
      );
      const params = assetConfig?.params;

      // Populate with custom params
      const populatedAssets: THREE.Object3D[] = [];
      for (const ph of placeholders) {
        if (ph.populated) continue;
        const asset = await factory.generate(ph.seed, { ...params, lod: ph.lodLevel });
        asset.position.copy(ph.position);
        asset.rotation.copy(ph.rotation);
        asset.scale.copy(ph.scale);
        asset.userData.placeholderId = ph.id;
        ph.populated = true;
        populatedAssets.push(asset);
        this.scene.add(asset);
        totalInstances++;
      }

      composed.assets.set(key, populatedAssets);
    }
    stageTimings['populate'] = performance.now() - populateStart;

    // --- Stage 5: Constraint solver for indoor scenes ---
    const constraintStart = performance.now();
    // TODO: Integrate with UnifiedConstraintSystem when indoor scenes are supported
    stageTimings['constraints'] = performance.now() - constraintStart;

    // --- Stage 6: Camera pose search ---
    const cameraStart = performance.now();
    const cameraResult = this.cameraSearch.search(
      this.scene,
      config.camera.constraints,
      config.camera,
    );
    stageTimings['camera_search'] = performance.now() - cameraStart;

    // --- Build result ---
    const totalTime = performance.now() - startTime;

    const result: SceneResult = {
      terrain: composed.terrain ?? new THREE.Mesh(),
      water: composed.water ?? new THREE.Group(),
      assets: composed.assets,
      camera: cameraResult,
      lights: composed.lights,
      metadata: {
        sceneId: config.id,
        seed: config.seed,
        totalTimeMs: totalTime,
        stageTimings,
        assetTypeCount: config.assets.length,
        totalInstances,
        cameraIterations: cameraResult.iterations,
        cameraScore: cameraResult.score,
      },
    };

    return result;
  }

  // ------------------------------------------------------------------
  // Private: terrain generation
  // ------------------------------------------------------------------

  /**
   * Generate terrain mesh and TerrainData from config.
   */
  private generateTerrain(
    config: TerrainSceneConfig,
    rng: SeededRandom,
  ): { mesh: THREE.Mesh; terrainData: TerrainData } {
    const terrainSeed = config.seed ?? rng.nextInt(0, 999999);

    // Create height data
    const width = config.resolution;
    const height = config.resolution;
    const heightData = new Float32Array(width * height);
    const slopeData = new Float32Array(width * height);
    const tagData = new Uint8Array(width * height);

    // Simple procedural terrain using FBM noise
    for (let iz = 0; iz < height; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const u = ix / (width - 1);
        const v = iz / (height - 1);
        const worldX = (u - 0.5) * config.worldSize;
        const worldZ = (v - 0.5) * config.worldSize;

        // Multi-octave noise
        let h = 0;
        let amplitude = 1;
        let frequency = 0.01;
        for (let oct = 0; oct < 6; oct++) {
          h += this.simpleNoise(worldX * frequency, worldZ * frequency, terrainSeed + oct) * amplitude;
          amplitude *= 0.5;
          frequency *= 2.0;
        }

        // Normalise to [0, 1]
        h = (h + 1) * 0.5;
        heightData[iz * width + ix] = h;

        // Compute approximate slope
        if (ix > 0 && iz > 0) {
          const dhdx = heightData[iz * width + ix] - heightData[iz * width + ix - 1];
          const dhdz = heightData[iz * width + ix] - heightData[(iz - 1) * width + ix];
          slopeData[iz * width + ix] = Math.atan(Math.sqrt(dhdx * dhdx + dhdz * dhdz) * width / config.worldSize);
        }

        // Tag assignment based on altitude
        if (h < config.seaLevel) {
          tagData[iz * width + ix] = 2; // underwater
        } else if (h < config.seaLevel + 0.05) {
          tagData[iz * width + ix] = 3; // beach
        } else if (h < 0.5) {
          tagData[iz * width + ix] = 4; // forest
        } else if (h < 0.75) {
          tagData[iz * width + ix] = 5; // mountain
        } else {
          tagData[iz * width + ix] = 6; // plains
        }
      }
    }

    // Create terrain mesh
    const geometry = new THREE.PlaneGeometry(
      config.worldSize, config.worldSize,
      width - 1, height - 1,
    );
    geometry.rotateX(-Math.PI / 2);

    // Apply height data to vertices
    const posAttr = geometry.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setY(i, heightData[i] * config.heightScale);
    }
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x4a7c3f,
      roughness: 0.9,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;

    const terrainData: TerrainData = {
      heightData,
      slopeData,
      tagData,
      width,
      height: height,
      worldSize: config.worldSize,
      heightScale: config.heightScale,
      seaLevel: config.seaLevel,
    };

    return { mesh, terrainData };
  }

  // ------------------------------------------------------------------
  // Private: placement mask building
  // ------------------------------------------------------------------

  /**
   * Build a PlacementMask from an AssetSceneConfig's filter list.
   */
  private buildPlacementMask(
    assetConfig: AssetSceneConfig,
    rng: SeededRandom,
  ): PlacementMask {
    const mask = new PlacementMask();

    for (const filterConfig of assetConfig.maskFilters) {
      switch (filterConfig.type) {
        case 'noise':
          mask.addNoiseFilter(
            filterConfig.params.threshold ?? 0.4,
            filterConfig.params.scale ?? 0.02,
            filterConfig.params.seed ?? rng.nextInt(0, 999999),
          );
          break;

        case 'altitude':
          mask.addAltitudeFilter(
            filterConfig.params.min ?? 0,
            filterConfig.params.max ?? 1,
            filterConfig.params.softness ?? 0.1,
          );
          break;

        case 'slope':
          mask.addSlopeFilter(
            filterConfig.params.min ?? 0,
            filterConfig.params.max ?? Math.PI / 2,
            filterConfig.params.softness ?? 0.1,
          );
          break;

        case 'tag':
          mask.addTagFilter(
            filterConfig.params.tags ?? [],
            filterConfig.params.exclude ?? false,
          );
          break;

        case 'biome':
          mask.addBiomeFilter(
            filterConfig.params.biomes ?? [],
          );
          break;

        case 'distance': {
          const ref = filterConfig.params.referencePoint
            ? new THREE.Vector3(
                filterConfig.params.referencePoint.x ?? 0,
                filterConfig.params.referencePoint.y ?? 0,
                filterConfig.params.referencePoint.z ?? 0,
              )
            : new THREE.Vector3(0, 0, 0);
          mask.addDistanceFilter(
            ref,
            filterConfig.params.minDist ?? 0,
            filterConfig.params.maxDist ?? 100,
            filterConfig.params.falloff ?? 'linear',
          );
          break;
        }
      }
    }

    return mask;
  }

  // ------------------------------------------------------------------
  // Private: water generation
  // ------------------------------------------------------------------

  /**
   * Generate a water plane from configuration.
   */
  private generateWater(config: WaterSceneConfig): THREE.Group {
    const group = new THREE.Group();
    group.name = 'water';

    const geometry = new THREE.PlaneGeometry(200, 200, 64, 64);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      transparent: true,
      opacity: config.opacity,
      roughness: 0.1,
      metalness: 0.3,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = config.planeHeight;
    mesh.name = 'water_plane';

    // Apply wave displacement if not flat
    if (config.waveType !== 'flat' && config.waveAmplitude > 0) {
      const posAttr = geometry.getAttribute('position');
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        let y = 0;
        if (config.waveType === 'sine') {
          y = Math.sin(x * 0.5) * Math.cos(z * 0.3) * config.waveAmplitude;
        } else if (config.waveType === 'gerstner') {
          y = (
            Math.sin(x * 0.4 + z * 0.2) * 0.5 +
            Math.sin(x * 0.8 - z * 0.4) * 0.3
          ) * config.waveAmplitude;
        }
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    group.add(mesh);
    return group;
  }

  // ------------------------------------------------------------------
  // Private: light generation
  // ------------------------------------------------------------------

  /**
   * Generate scene lights from configuration.
   */
  private generateLights(config: LightingSceneConfig): THREE.Light[] {
    const lights: THREE.Light[] = [];

    // Directional light (sun)
    const sun = new THREE.DirectionalLight(config.sunColor, config.sunIntensity);
    sun.position.copy(config.sunPosition);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    lights.push(sun);

    // Ambient light
    const ambient = new THREE.AmbientLight(config.ambientColor, config.ambientIntensity);
    lights.push(ambient);

    // Hemisphere light for natural outdoor feel
    const hemi = new THREE.HemisphereLight(
      new THREE.Color(0.6, 0.75, 1.0), // sky colour
      new THREE.Color(0.3, 0.25, 0.2), // ground colour
      0.4,
    );
    lights.push(hemi);

    return lights;
  }

  // ------------------------------------------------------------------
  // Private: simple noise helper
  // ------------------------------------------------------------------

  /**
   * Simple deterministic noise function for terrain generation.
   * Uses seededNoise2D from MathUtils.
   */
  private simpleNoise(x: number, z: number, seed: number): number {
    // Import at the top of file is already done; use the module-level import
    // We use a simple hash-based approach inline to avoid import issues
    let h = (Math.floor(x * 1000) * 374761393 + Math.floor(z * 1000) * 668265263 + seed * 1013904223) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    h = (h ^ (h >> 16));
    const n = (h & 0x7fffffff) / 0x7fffffff;
    // Smooth with cosine interpolation using nearby points
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;

    const n00 = this.hashNoise(ix, iz, seed);
    const n10 = this.hashNoise(ix + 1, iz, seed);
    const n01 = this.hashNoise(ix, iz + 1, seed);
    const n11 = this.hashNoise(ix + 1, iz + 1, seed);

    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);

    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;

    return (nx0 + (nx1 - nx0) * sz) * 2 - 1; // [-1, 1]
  }

  /**
   * Deterministic 2D hash noise returning [0, 1].
   */
  private hashNoise(x: number, z: number, seed: number): number {
    let h = (x * 374761393 + z * 668265263 + seed * 1013904223) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    h = (h ^ (h >> 16));
    return (h & 0x7fffffff) / 0x7fffffff;
  }
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default scene configuration for a temperate forest environment.
 */
export const DEFAULT_FOREST_CONFIG: SceneConfig = {
  id: 'forest_default',
  seed: 42,

  terrain: {
    worldSize: 200,
    resolution: 256,
    heightScale: 30,
    seaLevel: 0.15,
    elementTypes: ['ground', 'mountain'],
    compositionWeights: { ground: 1.0, mountain: 0.6 },
  },

  assets: [
    {
      category: 'tree',
      assetType: 'oak_tree',
      count: 30,
      densityPerArea: 0,
      spacing: 5,
      maskFilters: [
        { type: 'altitude', params: { min: 0.2, max: 0.7, softness: 0.1 } },
        { type: 'slope', params: { min: 0, max: 0.5, softness: 0.1 } },
        { type: 'tag', params: { tags: ['forest', 'plains'], exclude: false } },
      ],
    },
    {
      category: 'tree',
      assetType: 'pine_tree',
      count: 20,
      densityPerArea: 0,
      spacing: 5,
      maskFilters: [
        { type: 'altitude', params: { min: 0.4, max: 0.8, softness: 0.1 } },
        { type: 'tag', params: { tags: ['mountain'], exclude: false } },
      ],
    },
    {
      category: 'boulder',
      assetType: 'granite_boulder',
      count: 10,
      densityPerArea: 0,
      spacing: 3,
      maskFilters: [
        { type: 'noise', params: { threshold: 0.6, scale: 0.05, seed: 123 } },
        { type: 'slope', params: { min: 0.2, max: 1.5 } },
      ],
    },
    {
      category: 'grass',
      assetType: 'grass_field',
      count: 5,
      densityPerArea: 0,
      spacing: 10,
      maskFilters: [
        { type: 'altitude', params: { min: 0.15, max: 0.4 } },
        { type: 'tag', params: { tags: ['forest', 'plains'], exclude: false } },
      ],
      params: { count: 800, spreadWidth: 20, spreadDepth: 20 },
    },
  ],

  water: {
    enabled: true,
    planeHeight: 4.5,
    waveType: 'gerstner',
    waveAmplitude: 0.3,
    color: new THREE.Color(0.2, 0.4, 0.6),
    opacity: 0.7,
  },

  lighting: {
    sunPosition: new THREE.Vector3(50, 80, 30),
    sunIntensity: 1.5,
    sunColor: new THREE.Color(1.0, 0.95, 0.85),
    ambientIntensity: 0.4,
    ambientColor: new THREE.Color(0.5, 0.55, 0.65),
    atmosphericFog: true,
    fogDensity: 0.003,
    fogNear: 50,
    fogFar: 200,
  },

  camera: {
    constraints: [
      { type: 'altitude', min: 3, max: 40, weight: 1.0 },
      { type: 'obstacle_clearance', min: 2.0, weight: 1.5 },
      { type: 'view_angle', target: 0.5, min: 0.1, max: 1.2, weight: 0.8 },
      { type: 'distance_to_subject', target: 30, min: 10, max: 80, weight: 1.0 },
    ],
    maxIterations: 5000,
    subject: new THREE.Vector3(0, 5, 0),
    seed: 42,
  },
};

/**
 * Default scene configuration for a desert environment.
 */
export const DEFAULT_DESERT_CONFIG: SceneConfig = {
  id: 'desert_default',
  seed: 99,

  terrain: {
    worldSize: 200,
    resolution: 256,
    heightScale: 15,
    seaLevel: 0.05,
    elementTypes: ['ground'],
    compositionWeights: { ground: 1.0 },
  },

  assets: [
    {
      category: 'cactus',
      assetType: 'saguaro_cactus',
      count: 15,
      densityPerArea: 0,
      spacing: 6,
      maskFilters: [
        { type: 'altitude', params: { min: 0.1, max: 0.6 } },
        { type: 'tag', params: { tags: ['plains', 'beach'], exclude: false } },
      ],
    },
    {
      category: 'cactus',
      assetType: 'barrel_cactus',
      count: 10,
      densityPerArea: 0,
      spacing: 4,
      maskFilters: [
        { type: 'noise', params: { threshold: 0.3, scale: 0.03, seed: 77 } },
      ],
    },
    {
      category: 'boulder',
      assetType: 'sandstone_boulder',
      count: 6,
      densityPerArea: 0,
      spacing: 8,
      maskFilters: [
        { type: 'noise', params: { threshold: 0.7, scale: 0.04, seed: 55 } },
      ],
    },
  ],

  water: {
    enabled: false,
    planeHeight: 0,
    waveType: 'flat',
    waveAmplitude: 0,
    color: new THREE.Color(0.2, 0.4, 0.6),
    opacity: 0.0,
  },

  lighting: {
    sunPosition: new THREE.Vector3(80, 90, 20),
    sunIntensity: 2.0,
    sunColor: new THREE.Color(1.0, 0.9, 0.7),
    ambientIntensity: 0.5,
    ambientColor: new THREE.Color(0.7, 0.6, 0.5),
    atmosphericFog: true,
    fogDensity: 0.005,
    fogNear: 30,
    fogFar: 150,
  },

  camera: {
    constraints: [
      { type: 'altitude', min: 2, max: 25, weight: 1.0 },
      { type: 'obstacle_clearance', min: 1.5, weight: 1.5 },
      { type: 'distance_to_subject', target: 40, min: 15, max: 100, weight: 1.0 },
    ],
    maxIterations: 3000,
    subject: new THREE.Vector3(0, 2, 0),
    seed: 99,
  },
};
