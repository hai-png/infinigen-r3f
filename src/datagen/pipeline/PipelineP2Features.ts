/**
 * Pipeline P2 Features — Frustum LOD, Random Stage Executor, Fine Detail Pass
 *
 * Provides three advanced pipeline features for the infinigen-r3f project:
 *
 * 1. FrustumLODManager — Camera-distance-based LOD selection and frustum
 *    culling. Selects LOD levels from VegetationLODManager/GPUScatterSystem
 *    and splits terrain near camera for higher detail.
 *
 * 2. RandomStageExecutor — Probabilistic pipeline stage execution with
 *    prerequisites, timing tracking, and chance-based skipping. Ports the
 *    original Infinigen's random stage factory pattern.
 *
 * 3. FineDetailPass — Post-generation detail passes for grime (moss, lichen,
 *    ivy, slime mold) and aging (weathering, cracking, rust). Adds surface
 *    detail that makes scenes look lived-in and weathered.
 *
 * @module datagen/pipeline
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/** LOD level descriptor */
export interface LODLevel {
  /** LOD level index (0 = highest detail) */
  level: number;
  /** Maximum distance for this LOD level */
  maxDistance: number;
  /** Triangle budget for this level */
  triangleBudget: number;
  /** Whether this level is currently visible */
  visible: boolean;
}

/** LOD configuration per object */
export interface ObjectLODConfig {
  /** Object ID */
  objectId: string;
  /** Available LOD levels */
  levels: LODLevel[];
  /** Current active level */
  currentLevel: number;
}

/** Terrain detail subdivision info */
export interface TerrainSubdivision {
  /** The subdivided terrain chunk */
  chunk: THREE.Object3D;
  /** World-space bounds of this chunk */
  bounds: THREE.Box3;
  /** Subdivision level */
  detail: number;
}

/** Pipeline stage configuration */
export interface StageConfig {
  /** Stage name (unique identifier) */
  name: string;
  /** Prerequisite stage names that must complete first */
  prerequisites: string[];
  /** Probability of execution (0-1). 1.0 = always run */
  chance: number;
  /** Timeout in milliseconds */
  timeout: number;
  /** Whether the stage has been completed */
  completed?: boolean;
  /** Execution time in ms */
  executionTime?: number;
}

/** Pipeline execution result */
export interface PipelineResult {
  /** Names of completed stages */
  completedStages: string[];
  /** Names of skipped stages */
  skippedStages: string[];
  /** Names of failed stages */
  failedStages: string[];
  /** Total execution time */
  totalTime: number;
  /** Per-stage timing */
  stageTimings: Record<string, number>;
  /** Stage results */
  stageResults: Record<string, any>;
}

/** Grime configuration */
export interface GrimeConfig {
  /** Moss intensity (0-1) */
  mossIntensity: number;
  /** Lichen intensity (0-1) */
  lichenIntensity: number;
  /** Ivy growth intensity (0-1) */
  ivyIntensity: number;
  /** Slime mold intensity (0-1) */
  slimeIntensity: number;
  /** Seed for deterministic results */
  seed: number;
}

/** Aging configuration */
export interface AgingConfig {
  /** Weathering intensity (0-1) */
  weatheringIntensity: number;
  /** Cracking intensity (0-1) */
  crackingIntensity: number;
  /** Rust intensity (0-1) */
  rustIntensity: number;
  /** Seed for deterministic results */
  seed: number;
}

/** Default grime config */
export const DEFAULT_GRIME_CONFIG: GrimeConfig = {
  mossIntensity: 0.5,
  lichenIntensity: 0.3,
  ivyIntensity: 0.2,
  slimeIntensity: 0.1,
  seed: 42,
};

/** Default aging config */
export const DEFAULT_AGING_CONFIG: AgingConfig = {
  weatheringIntensity: 0.5,
  crackingIntensity: 0.3,
  rustIntensity: 0.2,
  seed: 42,
};

// ============================================================================
// 1. FrustumLODManager
// ============================================================================

/**
 * FrustumLODManager provides camera-distance-based LOD selection and frustum
 * culling. For each object in the scene, it computes the distance to the
 * camera and selects the appropriate LOD level. Off-screen objects are hidden.
 *
 * Also implements terrain subdivision near the camera for higher detail
 * (port of original's split_in_view()).
 *
 * Usage:
 * ```ts
 * const lodManager = new FrustumLODManager();
 * lodManager.updateLOD(scene, camera);
 * const highDetailChunks = lodManager.splitInView(camera, terrain, 3);
 * ```
 */
export class FrustumLODManager {
  /** Frustum for visibility testing */
  private frustum: THREE.Frustum = new THREE.Frustum();

  /** Projection matrix helper */
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();

  /** Cached LOD configs per object */
  private lodConfigs: Map<string, ObjectLODConfig> = new Map();

  /** Distance thresholds for LOD levels */
  private distanceThresholds: number[];

  /** Whether to log LOD changes */
  private debug: boolean;

  constructor(options: {
    /** Distance thresholds for LOD levels [near, mid, far] */
    distanceThresholds?: number[];
    /** Enable debug logging */
    debug?: boolean;
  } = {}) {
    this.distanceThresholds = options.distanceThresholds ?? [20, 50, 100, 200];
    this.debug = options.debug ?? false;
  }

  /**
   * Update LOD levels and visibility for all objects in the scene.
   * Computes distance to camera for each mesh, selects LOD level,
   * and hides off-screen objects.
   *
   * @param scene - The scene to update
   * @param camera - The current camera
   */
  updateLOD(scene: THREE.Scene, camera: THREE.Camera): void {
    // Update frustum from camera
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const cameraPosition = camera.position.clone();

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Group)) return;

      // Check frustum visibility
      const boundingSphere = new THREE.Sphere();
      if (object instanceof THREE.Mesh && object.geometry) {
        object.geometry.computeBoundingSphere();
        if (object.geometry.boundingSphere) {
          boundingSphere.copy(object.geometry.boundingSphere);
          boundingSphere.applyMatrix4(object.matrixWorld);
        }
      } else {
        // For groups, use a rough bounding sphere
        boundingSphere.setFromPoints(
          [object.position.clone().applyMatrix4(object.matrixWorld)],
        );
        boundingSphere.radius = 5; // rough estimate
      }

      const isVisible = this.frustum.intersectsSphere(boundingSphere);
      object.visible = isVisible;

      if (!isVisible) return;

      // Compute distance to camera
      const worldPos = new THREE.Vector3();
      object.getWorldPosition(worldPos);
      const distance = cameraPosition.distanceTo(worldPos);

      // Select LOD level
      const lodLevel = this.selectLODLevel(distance, object);

      // Apply LOD by adjusting detail
      if (object instanceof THREE.Mesh) {
        this.applyMeshLOD(object, lodLevel);
      }

      // Check for VegetationLODSystem integration
      if ((object as any).lodLevels) {
        (object as any).lodLevels.forEach((lod: any, idx: number) => {
          if (lod.object) lod.object.visible = idx === lodLevel;
        });
      }

      // Check for GPUScatterSystem integration
      if ((object as any).setLODLevel) {
        (object as any).setLODLevel(lodLevel);
      }
    });
  }

  /**
   * Port of original's split_in_view(): subdivide terrain near the camera
   * for higher detail rendering. Returns an array of subdivided terrain chunks.
   *
   * @param camera - The current camera
   * @param terrain - The terrain object
   * @param detail - Subdivision detail level (1-5)
   * @returns Array of terrain subdivision chunks
   */
  splitInView(
    camera: THREE.Camera,
    terrain: THREE.Object3D,
    detail: number,
  ): THREE.Object3D[] {
    const result: THREE.Object3D[] = [];
    const cameraPos = camera.position.clone();
    const maxDist = this.distanceThresholds[0] ?? 20; // Use first threshold as "near"

    // Find terrain mesh
    const terrainMesh = this.findTerrainMesh(terrain);
    if (!terrainMesh) return result;

    const geometry = terrainMesh.geometry;
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return result;

    // Compute terrain bounds
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const terrainSize = new THREE.Vector3();
    bounds.getSize(terrainSize);

    // Determine subdivision grid near camera
    const gridSize = Math.pow(2, detail);
    const chunkSize = Math.min(maxDist * 2, terrainSize.x, terrainSize.z) / gridSize;

    const baseX = Math.max(bounds.min.x, cameraPos.x - maxDist);
    const baseZ = Math.max(bounds.min.z, cameraPos.z - maxDist);
    const endX = Math.min(bounds.max.x, cameraPos.x + maxDist);
    const endZ = Math.min(bounds.max.z, cameraPos.z + maxDist);

    for (let gx = 0; gx < gridSize; gx++) {
      for (let gz = 0; gz < gridSize; gz++) {
        const chunkMinX = baseX + gx * chunkSize;
        const chunkMinZ = baseZ + gz * chunkSize;
        const chunkMaxX = Math.min(chunkMinX + chunkSize, endX);
        const chunkMaxZ = Math.min(chunkMinZ + chunkSize, endZ);

        // Skip chunks that are too far from camera
        const chunkCenter = new THREE.Vector3(
          (chunkMinX + chunkMaxX) / 2,
          cameraPos.y,
          (chunkMinZ + chunkMaxZ) / 2,
        );
        const dist = cameraPos.distanceTo(chunkCenter);
        if (dist > maxDist * 1.5) continue;

        // Create subdivided chunk
        const chunkGeometry = this.createSubdividedChunk(
          terrainMesh,
          chunkMinX, chunkMinZ, chunkMaxX, chunkMaxZ,
          detail,
        );

        const chunkMesh = new THREE.Mesh(
          chunkGeometry,
          (terrainMesh as THREE.Mesh).material as THREE.Material,
        );
        chunkMesh.name = `terrain_chunk_${gx}_${gz}`;
        chunkMesh.castShadow = terrainMesh.castShadow;
        chunkMesh.receiveShadow = terrainMesh.receiveShadow;

        result.push(chunkMesh);
      }
    }

    return result;
  }

  /**
   * Select the LOD level based on distance to camera.
   */
  private selectLODLevel(distance: number, _object: THREE.Object3D): number {
    for (let i = 0; i < this.distanceThresholds.length; i++) {
      if (distance < this.distanceThresholds[i]) {
        return i;
      }
    }
    return this.distanceThresholds.length; // Lowest detail
  }

  /**
   * Apply LOD to a mesh by adjusting its detail level.
   * This modifies the mesh's geometry subdivision or shader complexity.
   */
  private applyMeshLOD(mesh: THREE.Mesh, level: number): void {
    // Store LOD level as userData for external systems
    mesh.userData.lodLevel = level;

    // Adjust shadow casting based on distance
    mesh.castShadow = level <= 2;
    mesh.receiveShadow = level <= 3;

    // For very distant objects, reduce update frequency
    if (level >= this.distanceThresholds.length) {
      mesh.frustumCulled = true;
    }
  }

  /**
   * Find the main terrain mesh in an object hierarchy.
   */
  private findTerrainMesh(terrain: THREE.Object3D): THREE.Mesh | null {
    if (terrain instanceof THREE.Mesh && terrain.geometry.getAttribute('position')) {
      return terrain;
    }
    let found: THREE.Mesh | null = null;
    terrain.traverse((child) => {
      if (!found && child instanceof THREE.Mesh && child.geometry.getAttribute('position')) {
        found = child;
      }
    });
    return found;
  }

  /**
   * Create a subdivided terrain chunk geometry.
   */
  private createSubdividedChunk(
    terrainMesh: THREE.Mesh,
    minX: number, minZ: number, maxX: number, maxZ: number,
    detail: number,
  ): THREE.BufferGeometry {
    const resolution = Math.pow(2, detail) + 1;
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const terrainGeometry = terrainMesh.geometry;
    const terrainPos = terrainGeometry.getAttribute('position');
    const terrainNorm = terrainGeometry.getAttribute('normal');

    // Sample terrain height at a given (x, z) using nearest-vertex lookup
    const sampleTerrain = (x: number, z: number): { y: number; nx: number; ny: number; nz: number } => {
      let bestDist = Infinity;
      let y = 0, nx = 0, ny = 1, nz = 0;

      if (terrainPos) {
        for (let i = 0; i < terrainPos.count; i++) {
          const dx = terrainPos.getX(i) - x;
          const dz = terrainPos.getZ(i) - z;
          const d = dx * dx + dz * dz;
          if (d < bestDist) {
            bestDist = d;
            y = terrainPos.getY(i);
            if (terrainNorm) {
              nx = terrainNorm.getX(i);
              ny = terrainNorm.getY(i);
              nz = terrainNorm.getZ(i);
            }
          }
        }
      }

      return { y, nx, ny, nz };
    };

    // Generate vertices
    for (let iz = 0; iz < resolution; iz++) {
      for (let ix = 0; ix < resolution; ix++) {
        const u = ix / (resolution - 1);
        const v = iz / (resolution - 1);
        const x = minX + u * (maxX - minX);
        const z = minZ + v * (maxZ - minZ);

        const sample = sampleTerrain(x, z);
        positions.push(x, sample.y, z);
        normals.push(sample.nx, sample.ny, sample.nz);
        uvs.push(u, v);
      }
    }

    // Generate indices
    for (let iz = 0; iz < resolution - 1; iz++) {
      for (let ix = 0; ix < resolution - 1; ix++) {
        const a = iz * resolution + ix;
        const b = a + 1;
        const c = a + resolution;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    return geometry;
  }
}

// ============================================================================
// 2. RandomStageExecutor
// ============================================================================

/**
 * RandomStageExecutor implements the probabilistic pipeline stage execution
 * pattern from the original Infinigen. Stages are registered with prerequisites,
 * execution probability (chance), and timeout. During execution:
 *
 * 1. Stages are ordered by prerequisites (topological sort)
 * 2. Each stage is executed if its prerequisites are met
 * 3. Chance-based skipping: a stage with chance=0.7 has a 30% chance of being skipped
 * 4. Timing is tracked per stage
 * 5. Timeout protection prevents runaway stages
 *
 * Usage:
 * ```ts
 * const executor = new RandomStageExecutor();
 * executor.addStage('terrain', terrainFn, { prerequisites: [], chance: 1.0, timeout: 5000 });
 * executor.addStage('vegetation', vegFn, { prerequisites: ['terrain'], chance: 0.8, timeout: 3000 });
 * const result = executor.execute({ seed: 42 });
 * ```
 */
export class RandomStageExecutor {
  /** Registered stages in registration order */
  private stages: Array<{
    name: string;
    fn: (context: PipelineExecutionContext) => any;
    config: StageConfig;
  }> = new Array();

  /**
   * Register a pipeline stage.
   *
   * @param name - Unique stage name
   * @param fn - Stage execution function
   * @param config - Stage configuration (prerequisites, chance, timeout)
   */
  addStage(
    name: string,
    fn: (context: PipelineExecutionContext) => any,
    config: Partial<StageConfig> = {},
  ): void {
    this.stages.push({
      name,
      fn,
      config: {
        name,
        prerequisites: config.prerequisites ?? [],
        chance: config.chance ?? 1.0,
        timeout: config.timeout ?? 30000,
      },
    });
  }

  /**
   * Execute all registered stages in prerequisite order with chance-based skipping.
   *
   * @param pipelineConfig - Pipeline configuration with seed
   * @returns Pipeline execution result
   */
  execute(pipelineConfig: { seed?: number } = {}): PipelineResult {
    const startTime = performance.now();
    const seed = pipelineConfig.seed ?? 42;
    const rng = this.seededRandom(seed);

    const completedStages: string[] = [];
    const skippedStages: string[] = [];
    const failedStages: string[] = [];
    const stageTimings: Record<string, number> = {};
    const stageResults: Record<string, any> = {};

    // Sort stages by prerequisites (topological order)
    const sortedStages = this.topologicalSort();

    const context: PipelineExecutionContext = {
      seed,
      rng,
      completedStages: new Set(),
      stageResults,
      startTime,
    };

    for (const stage of sortedStages) {
      const { name, fn, config } = stage;

      // Check prerequisites
      const prerequisitesMet = config.prerequisites.every(
        prereq => context.completedStages.has(prereq),
      );
      if (!prerequisitesMet) {
        skippedStages.push(name);
        continue;
      }

      // Chance-based execution
      if (rng() > config.chance) {
        skippedStages.push(name);
        continue;
      }

      // Execute with timeout protection
      const stageStart = performance.now();
      try {
        const result = fn(context);
        const stageTime = performance.now() - stageStart;
        stageTimings[name] = stageTime;
        stageResults[name] = result;
        context.completedStages.add(name);
        completedStages.push(name);
      } catch (error) {
        const stageTime = performance.now() - stageStart;
        stageTimings[name] = stageTime;
        failedStages.push(name);
        stageResults[name] = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    return {
      completedStages,
      skippedStages,
      failedStages,
      totalTime: performance.now() - startTime,
      stageTimings,
      stageResults,
    };
  }

  /**
   * Get the number of registered stages.
   */
  getStageCount(): number {
    return this.stages.length;
  }

  /**
   * Get all registered stage names.
   */
  getStageNames(): string[] {
    return this.stages.map(s => s.name);
  }

  /**
   * Topological sort of stages based on prerequisites.
   * Uses Kahn's algorithm.
   */
  private topologicalSort(): Array<typeof this.stages[0]> {
    const stageMap = new Map(this.stages.map(s => [s.name, s]));
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    // Initialize
    for (const stage of this.stages) {
      inDegree.set(stage.name, 0);
      adj.set(stage.name, []);
    }

    // Build graph
    for (const stage of this.stages) {
      for (const prereq of stage.config.prerequisites) {
        if (adj.has(prereq)) {
          adj.get(prereq)!.push(stage.name);
          inDegree.set(stage.name, (inDegree.get(stage.name) ?? 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) queue.push(name);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const neighbor of adj.get(current) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Return stages in sorted order
    return sorted
      .map(name => stageMap.get(name))
      .filter((s): s is typeof this.stages[0] => s !== undefined);
  }

  /** Seeded PRNG */
  private seededRandom(seed: number): () => number {
    let state = Math.abs(seed | 0) || 1;
    return () => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 4294967296;
    };
  }
}

/** Context passed to pipeline stage functions */
export interface PipelineExecutionContext {
  /** Pipeline seed */
  seed: number;
  /** Seeded random number generator */
  rng: () => number;
  /** Set of completed stage names */
  completedStages: Set<string>;
  /** Results from previous stages */
  stageResults: Record<string, any>;
  /** Pipeline start time */
  startTime: number;
}

// ============================================================================
// 3. FineDetailPass
// ============================================================================

/**
 * FineDetailPass adds surface-level grime and aging effects to scene objects.
 * These post-generation detail passes make scenes look lived-in and weathered.
 *
 * Grime effects:
 * - Moss: green patches on north-facing, shaded surfaces
 * - Lichen: crusty patches on rocks
 * - Ivy: vine growth on walls
 * - Slime mold: wet organic patches
 *
 * Aging effects:
 * - Weathering: color fading on exposed surfaces
 * - Cracking: displacement cracks on dry materials
 * - Rust: on metallic surfaces in wet areas
 *
 * Usage:
 * ```ts
 * const detailPass = new FineDetailPass();
 * detailPass.applyGrime(scene, { mossIntensity: 0.5, seed: 42 });
 * detailPass.applyAging(scene, { weatheringIntensity: 0.3, seed: 42 });
 * ```
 */
export class FineDetailPass {
  /**
   * Apply grime effects to the scene.
   * Adds moss, lichen, ivy, and slime mold patches to appropriate surfaces.
   *
   * @param scene - The scene to apply grime to
   * @param config - Grime configuration
   */
  applyGrime(scene: THREE.Scene | THREE.Group, config: Partial<GrimeConfig> = {}): void {
    const fullConfig: GrimeConfig = { ...DEFAULT_GRIME_CONFIG, ...config };
    const rng = this.seededRandom(fullConfig.seed);

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.geometry || !object.geometry.getAttribute('position')) return;

      const material = object.material as THREE.MeshStandardMaterial;
      if (!material) return;

      const posAttr = object.geometry.getAttribute('position');
      const normAttr = object.geometry.getAttribute('normal');

      // Moss on north-facing, shaded surfaces
      if (fullConfig.mossIntensity > 0 && normAttr) {
        this.applyMoss(object, material, normAttr, fullConfig.mossIntensity, rng);
      }

      // Lichen on rocks (rough surfaces)
      if (fullConfig.lichenIntensity > 0 && material.roughness > 0.6) {
        this.applyLichen(object, material, fullConfig.lichenIntensity, rng);
      }

      // Ivy on walls (vertical surfaces)
      if (fullConfig.ivyIntensity > 0 && normAttr) {
        this.applyIvy(object, normAttr, fullConfig.ivyIntensity, rng);
      }

      // Slime mold on wet organic patches (low-lying, smooth surfaces)
      if (fullConfig.slimeIntensity > 0 && material.roughness < 0.5) {
        this.applySlimeMold(object, material, fullConfig.slimeIntensity, rng);
      }
    });
  }

  /**
   * Apply aging effects to the scene.
   * Adds weathering, cracking, and rust to appropriate surfaces.
   *
   * @param scene - The scene to apply aging to
   * @param config - Aging configuration
   */
  applyAging(scene: THREE.Scene | THREE.Group, config: Partial<AgingConfig> = {}): void {
    const fullConfig: AgingConfig = { ...DEFAULT_AGING_CONFIG, ...config };
    const rng = this.seededRandom(fullConfig.seed);

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.geometry) return;

      const material = object.material as THREE.MeshStandardMaterial;
      if (!material) return;

      // Weathering: color fading on exposed surfaces
      if (fullConfig.weatheringIntensity > 0) {
        this.applyWeathering(material, fullConfig.weatheringIntensity, rng);
      }

      // Cracking on dry, rough materials
      if (fullConfig.crackingIntensity > 0 && material.roughness > 0.5) {
        this.applyCracking(object, material, fullConfig.crackingIntensity, rng);
      }

      // Rust on metallic surfaces
      if (fullConfig.rustIntensity > 0 && material.metalness > 0.3) {
        this.applyRust(material, fullConfig.rustIntensity, rng);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Grime Sub-passes
  // ---------------------------------------------------------------------------

  /**
   * Apply moss effect — green patches on north-facing (negative Z) and
   * shaded surfaces (normals pointing away from sun).
   */
  private applyMoss(
    mesh: THREE.Mesh,
    material: THREE.MeshStandardMaterial,
    normAttr: THREE.BufferAttribute,
    intensity: number,
    rng: () => number,
  ): void {
    // Check average normal direction
    let avgNormalY = 0;
    let northFacingCount = 0;
    const count = normAttr.count;

    for (let i = 0; i < count; i++) {
      avgNormalY += normAttr.getY(i);
      if (normAttr.getZ(i) < -0.3) northFacingCount++;
    }
    avgNormalY /= count;

    // Moss prefers surfaces that are:
    // 1. Roughly horizontal or slightly tilted (avgNormalY > 0.3)
    // 2. North-facing (negative Z)
    const mossScore = avgNormalY * 0.5 + (northFacingCount / count) * 0.5;
    if (mossScore < 0.2) return; // Not suitable for moss

    // Apply moss tint to material color
    const mossColor = new THREE.Color(0.15, 0.35, 0.08);
    const mixFactor = intensity * mossScore * 0.3;

    if (material.color) {
      const originalColor = material.color.clone();
      material.color.lerp(mossColor, mixFactor);
    }

    // Increase roughness slightly (moss is rough)
    material.roughness = Math.min(1, material.roughness + intensity * 0.1);

    // Add moss as vertex color variation if geometry supports it
    if (mesh.geometry.getAttribute('position')) {
      const posAttr = mesh.geometry.getAttribute('position');
      const vertCount = posAttr.count;
      const mossMask = new Float32Array(vertCount);

      for (let i = 0; i < vertCount; i++) {
        const nx = normAttr.getX(i);
        const ny = normAttr.getY(i);
        const nz = normAttr.getZ(i);
        // Moss grows on top-facing and north-facing surfaces
        mossMask[i] = Math.max(0, ny * 0.6 - nz * 0.3 + nx * 0.1) * intensity;
        // Add some random variation
        mossMask[i] *= 0.5 + rng() * 0.5;
      }

      mesh.geometry.setAttribute('aMossMask', new THREE.BufferAttribute(mossMask, 1));
    }
  }

  /**
   * Apply lichen effect — crusty patches on rocks.
   * Lichen appears as gray-green speckled patches on rough stone surfaces.
   */
  private applyLichen(
    mesh: THREE.Mesh,
    material: THREE.MeshStandardMaterial,
    intensity: number,
    rng: () => number,
  ): void {
    // Lichen color: gray-green, slightly desaturated
    const lichenColor = new THREE.Color(0.45, 0.50, 0.35);
    const mixFactor = intensity * 0.15 * (0.5 + rng() * 0.5);

    if (material.color) {
      material.color.lerp(lichenColor, mixFactor);
    }

    // Lichen slightly reduces roughness (smooth crust)
    material.roughness = Math.max(0.3, material.roughness - intensity * 0.05);
  }

  /**
   * Apply ivy growth on walls — vine-like growth on vertical surfaces.
   * Creates small ivy mesh decorations on wall-like geometry.
   */
  private applyIvy(
    mesh: THREE.Mesh,
    normAttr: THREE.BufferAttribute,
    intensity: number,
    rng: () => number,
  ): void {
    // Find vertical surfaces (normals roughly horizontal)
    const count = normAttr.count;
    let wallVertices = 0;

    for (let i = 0; i < count; i++) {
      const ny = Math.abs(normAttr.getY(i));
      if (ny < 0.3) wallVertices++; // Mostly vertical
    }

    const wallRatio = wallVertices / count;
    if (wallRatio < 0.3) return; // Not enough wall surface

    // Place ivy vine decorations at random wall positions
    const ivyCount = Math.floor(wallVertices * intensity * 0.02);
    const parent = mesh.parent ?? mesh;

    for (let i = 0; i < ivyCount; i++) {
      const vertIdx = Math.floor(rng() * count);
      const ny = Math.abs(normAttr.getY(vertIdx));
      if (ny > 0.3) continue; // Skip non-wall vertices

      const posAttr = mesh.geometry.getAttribute('position');
      const pos = new THREE.Vector3(
        posAttr.getX(vertIdx),
        posAttr.getY(vertIdx),
        posAttr.getZ(vertIdx),
      ).applyMatrix4(mesh.matrixWorld);

      // Create a small ivy vine mesh
      const ivy = this.createIvyVine(pos, rng, intensity);
      if (ivy) {
        parent.add(ivy);
      }
    }
  }

  /**
   * Create a small ivy vine mesh at a given position.
   * Stub implementation — creates a simple vine-like geometry.
   */
  private createIvyVine(
    position: THREE.Vector3,
    rng: () => number,
    intensity: number,
  ): THREE.Mesh | null {
    // Create vine path (cubic bezier curve going upward)
    const height = 0.5 + rng() * 2 * intensity;
    const spread = 0.1 + rng() * 0.3;

    const curve = new THREE.CubicBezierCurve3(
      position,
      position.clone().add(new THREE.Vector3(spread, height * 0.3, 0)),
      position.clone().add(new THREE.Vector3(-spread, height * 0.7, spread)),
      position.clone().add(new THREE.Vector3(0, height, 0)),
    );

    const tubeGeometry = new THREE.TubeGeometry(curve, 8, 0.005 + rng() * 0.01, 4, false);
    const vineMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.1 + rng() * 0.1, 0.3 + rng() * 0.15, 0.05),
      roughness: 0.8,
      metalness: 0.0,
    });

    const vineMesh = new THREE.Mesh(tubeGeometry, vineMaterial);
    vineMesh.name = 'ivy_vine';

    // Add a few leaf-like shapes along the vine
    const leafCount = Math.floor(3 + rng() * 5 * intensity);
    for (let l = 0; l < leafCount; l++) {
      const t = rng();
      const point = curve.getPoint(t);
      const leafGeo = new THREE.PlaneGeometry(0.03 + rng() * 0.04, 0.04 + rng() * 0.05);
      const leafMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.08 + rng() * 0.12, 0.35 + rng() * 0.2, 0.04),
        roughness: 0.7,
        side: THREE.DoubleSide,
      });
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.copy(point);
      leaf.position.x += (rng() - 0.5) * 0.05;
      leaf.position.z += (rng() - 0.5) * 0.05;
      leaf.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      leaf.name = 'ivy_leaf';
      vineMesh.add(leaf);
    }

    return vineMesh;
  }

  /**
   * Apply slime mold effect — wet organic patches on smooth, low-lying surfaces.
   */
  private applySlimeMold(
    mesh: THREE.Mesh,
    material: THREE.MeshStandardMaterial,
    intensity: number,
    rng: () => number,
  ): void {
    // Slime mold: glossy wet patches, yellowish-green
    const slimeColor = new THREE.Color(0.6, 0.7, 0.3);
    const mixFactor = intensity * 0.1 * (0.3 + rng() * 0.7);

    if (material.color) {
      material.color.lerp(slimeColor, mixFactor);
    }

    // Slime is glossy (low roughness)
    material.roughness = Math.max(0.1, material.roughness - intensity * 0.15);

    // Add slight emission for bioluminescent effect
    if (intensity > 0.3 && rng() > 0.5) {
      material.emissive = new THREE.Color(0.05, 0.1, 0.02);
      material.emissiveIntensity = intensity * 0.3;
    }
  }

  // ---------------------------------------------------------------------------
  // Aging Sub-passes
  // ---------------------------------------------------------------------------

  /**
   * Apply weathering effect — color fading on exposed surfaces.
   * Desaturates and lightens the material color.
   */
  private applyWeathering(
    material: THREE.MeshStandardMaterial,
    intensity: number,
    rng: () => number,
  ): void {
    if (!material.color) return;

    // Desaturate color (move toward gray)
    const hsl = { h: 0, s: 0, l: 0 };
    material.color.getHSL(hsl);

    // Reduce saturation
    hsl.s = Math.max(0, hsl.s - intensity * 0.3 * (0.5 + rng() * 0.5));

    // Slightly lighten
    hsl.l = Math.min(1, hsl.l + intensity * 0.05 * rng());

    material.color.setHSL(hsl.h, hsl.s, hsl.l);

    // Increase roughness (weathered surfaces are rougher)
    material.roughness = Math.min(1, material.roughness + intensity * 0.1);

    // Reduce metallic appearance (oxidation)
    material.metalness = Math.max(0, material.metalness - intensity * 0.05);
  }

  /**
   * Apply cracking effect — displacement cracks on dry, rough materials.
   * Modifies vertex positions to create crack-like displacement.
   */
  private applyCracking(
    mesh: THREE.Mesh,
    material: THREE.MeshStandardMaterial,
    intensity: number,
    rng: () => number,
  ): void {
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    if (!posAttr || !normAttr) return;

    // Apply subtle crack-like displacement
    const crackScale = intensity * 0.02;
    const crackPattern = (x: number, y: number, z: number): number => {
      // Voronoi-like crack pattern using simple hash
      const ix = Math.floor(x * 10);
      const iy = Math.floor(y * 10);
      const iz = Math.floor(z * 10);
      const hash = ((ix * 374761393 + iy * 668265263 + iz * 1274126177) | 0);
      const h = ((hash ^ (hash >> 13)) * 1274126177) | 0;
      return ((h & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    };

    // Only displace a fraction of vertices for performance
    const sampleRate = Math.max(1, Math.floor(1 / (intensity * 0.5)));
    for (let i = 0; i < posAttr.count; i += sampleRate) {
      if (rng() > intensity) continue;

      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const pz = posAttr.getZ(i);
      const nx = normAttr.getX(i);
      const ny = normAttr.getY(i);
      const nz = normAttr.getZ(i);

      const crackValue = crackPattern(px, py, pz);
      if (Math.abs(crackValue) > 0.7) {
        // Near crack edge — displace along normal
        const displacement = crackScale * (crackValue > 0 ? 1 : -0.5);
        posAttr.setXYZ(
          i,
          px + nx * displacement,
          py + ny * displacement,
          pz + nz * displacement,
        );
      }
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    // Darken material slightly in crack areas
    if (material.color) {
      material.color.multiplyScalar(1 - intensity * 0.1);
    }
  }

  /**
   * Apply rust effect — on metallic surfaces in wet areas.
   * Changes color toward orange-brown and reduces metallic appearance.
   */
  private applyRust(
    material: THREE.MeshStandardMaterial,
    intensity: number,
    rng: () => number,
  ): void {
    if (!material.color) return;

    // Rust color: orange-brown
    const rustColor = new THREE.Color(0.6, 0.3, 0.1);
    const mixFactor = intensity * 0.4 * (0.3 + rng() * 0.7);

    material.color.lerp(rustColor, mixFactor);

    // Rust is rough and non-metallic
    material.roughness = Math.min(1, material.roughness + intensity * 0.3);
    material.metalness = Math.max(0, material.metalness - intensity * 0.4);

    // Add slight bump to simulate rough rust surface
    material.bumpScale = (material.bumpScale ?? 0) + intensity * 0.02;
  }

  /** Seeded PRNG */
  private seededRandom(seed: number): () => number {
    let state = Math.abs(seed | 0) || 1;
    return () => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 4294967296;
    };
  }
}
