/**
 * LODSystem.ts — Canonical Level-of-Detail management system
 *
 * This is the single canonical source for all LOD-related types, classes,
 * and utilities.  Other modules must import from here rather than defining
 * their own LODConfig / LODSystem variants.
 *
 * Re-exports:
 *  - LODConfig (canonical asset-level config) from ./AssetTypes
 *
 * Defines:
 *  - RenderingLODConfig   – runtime rendering LOD config (was core/rendering/lod/LODSystem)
 *  - ExportLODConfig      – export-pipeline LOD config   (was datagen/pipeline/SceneExporter)
 *  - TerrainLODConfigFields – terrain-specific LOD fields (was terrain/mesher/LODMesher)
 *  - LODManager / InstancedLODManager – backward-compatible rendering helpers
 *  - Utility functions: generateLODLevels, selectLODByDistance, …
 *
 * Implements automatic LOD switching, HLOD (Hierarchical LOD), and
 * memory-efficient streaming.
 */

import * as THREE from 'three';
import { LODConfig } from './AssetTypes';
import { SeededRandom } from '../../core/util/MathUtils';

// ============================================================================
// Re-export canonical LODConfig from AssetTypes
// ============================================================================

export type { LODConfig } from './AssetTypes';

// ============================================================================
// Rendering LOD Types (migrated from core/rendering/lod/LODSystem.ts)
// ============================================================================

/**
 * A single LOD level definition for the rendering pipeline.
 * Each level specifies the distance threshold, geometry reduction factor,
 * material quality, and shadow behaviour.
 */
export interface RenderingLODLevel {
  distance: number;
  reductionFactor: number;
  materialQuality: number;
  shadowCasting: boolean;
}

/**
 * Runtime rendering LOD configuration.
 * Controls how the rendering pipeline selects and transitions between LOD levels.
 *
 * Previously defined as `LODConfig` in `core/rendering/lod/LODSystem.ts`.
 * Use `RenderingLODConfig` going forward; the old name is kept as a
 * deprecated alias for backward compatibility.
 */
export interface RenderingLODConfig {
  levels: RenderingLODLevel[];
  hysteresis: number;
  transitionTime: number;
  pixelRatio: number;
  screenSpaceErrorThreshold: number;
  distanceScale: number;
}

/**
 * @deprecated Use `RenderingLODLevel` instead. Kept for backward compatibility.
 */
export type LODLevel = RenderingLODLevel;

/**
 * @deprecated Use `RenderingLODConfig` instead. Kept for backward compatibility.
 */
export type RenderingLODConfigAlias = RenderingLODConfig;

/**
 * Extended THREE.LOD carrying per-level metadata.
 */
export interface LODMesh extends THREE.LOD {
  lodLevels: RenderingLODLevel[];
  currentLevel: number;
}

/**
 * A registered LOD-tracked object in the rendering pipeline.
 */
export interface LODObject {
  id: string;
  lodMesh: LODMesh;
  position: THREE.Vector3;
  bounds: THREE.Box3;
}

/**
 * Default rendering LOD configuration with four quality tiers.
 */
export const DEFAULT_LOD_CONFIG: RenderingLODConfig = {
  levels: [
    { distance: 0, reductionFactor: 1.0, materialQuality: 1.0, shadowCasting: true },
    { distance: 50, reductionFactor: 0.5, materialQuality: 0.8, shadowCasting: true },
    { distance: 100, reductionFactor: 0.25, materialQuality: 0.6, shadowCasting: false },
    { distance: 200, reductionFactor: 0.1, materialQuality: 0.4, shadowCasting: false },
  ],
  hysteresis: 0.1,
  transitionTime: 0.5,
  pixelRatio: 1,
  screenSpaceErrorThreshold: 2,
  distanceScale: 1,
};

/**
 * Instanced LOD configuration extending the rendering config with
 * GPU instancing parameters.
 */
export interface InstancedLODConfig extends RenderingLODConfig {
  maxInstances: number;
  cullingDistance: number;
  gpuInstancing: boolean;
}

// ============================================================================
// Rendering LOD Helper Functions (migrated from core/rendering/lod/LODSystem.ts)
// ============================================================================

/**
 * Basic LOD manager – maintains a registry of LOD-tracked objects and
 * updates their active level each frame based on camera distance.
 *
 * Retained for backward compatibility with code that imported LODManager
 * from `core/rendering/lod`.
 */
export class LODManager {
  private objects: Map<string, LODObject> = new Map();
  private config: RenderingLODConfig;

  constructor(config: Partial<RenderingLODConfig> = {}) {
    this.config = { ...DEFAULT_LOD_CONFIG, ...config };
  }

  addLODObject(id: string, lodMesh: LODMesh, position: THREE.Vector3, bounds: THREE.Box3): void {
    this.objects.set(id, { id, lodMesh, position, bounds });
  }

  removeLODObject(id: string): void {
    this.objects.delete(id);
  }

  update(camera: THREE.Camera): void {
    for (const obj of this.objects.values()) {
      const distance = camera.position.distanceTo(obj.position);
      const level = selectLODByDistance(distance, this.config.levels);
      obj.lodMesh.currentLevel = level;
    }
  }
}

/**
 * Instanced LOD manager – extends LODManager with GPU instancing support.
 *
 * Retained for backward compatibility.
 */
export class InstancedLODManager extends LODManager {
  private instancedObjects: Map<string, THREE.InstancedMesh> = new Map();

  update(camera: THREE.Camera): void {
    super.update(camera);
  }
}

/**
 * Generate placeholder LOD geometries by cloning the base geometry
 * for each configured level.
 */
export function generateLODLevels(
  baseGeometry: THREE.BufferGeometry,
  config: RenderingLODConfig,
): THREE.BufferGeometry[] {
  return config.levels.map(() => baseGeometry.clone());
}

/**
 * Select the appropriate LOD level index based on camera distance.
 */
export function selectLODByDistance(
  distance: number,
  levels: RenderingLODLevel[],
): number {
  for (let i = levels.length - 1; i >= 0; i--) {
    if (distance >= levels[i].distance) {
      return i;
    }
  }
  return 0;
}

/**
 * Select LOD level using screen-space error metrics.
 */
export function selectLODByScreenSpace(
  distance: number,
  bounds: THREE.Box3,
  screenHeight: number,
  fov: number,
  threshold: number,
): number {
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const screenSize =
    (size.length() / distance) *
    (screenHeight / (2 * Math.tan((fov * Math.PI) / 360)));
  return screenSize < threshold ? 2 : screenSize < threshold * 2 ? 1 : 0;
}

/**
 * Apply hysteresis when switching to a higher (coarser) LOD level to
 * avoid rapid switching near thresholds.
 */
export function updateLODWithHysteresis(
  currentLevel: number,
  newLevel: number,
  hysteresis: number,
  distance: number,
): number {
  if (newLevel > currentLevel) {
    return distance * (1 + hysteresis) > distance ? newLevel : currentLevel;
  }
  return newLevel;
}

/**
 * Calculate average reduction factor across LOD levels (for memory estimates).
 */
export function calculateMemorySavings(config: RenderingLODConfig): number {
  return (
    config.levels.reduce((sum, level) => sum + level.reductionFactor, 0) /
    config.levels.length
  );
}

/**
 * Estimate rendering improvement ratio (1 − average reduction).
 */
export function estimateRenderingImprovement(config: RenderingLODConfig): number {
  return 1 - calculateMemorySavings(config);
}

// ============================================================================
// Export LOD Config (migrated from datagen/pipeline/SceneExporter.ts)
// ============================================================================

/**
 * LOD configuration for scene export pipelines.
 * Each level specifies a distance, geometric reduction ratio, and an
 * integer level index.
 *
 * Previously defined as `LODConfig` in `datagen/pipeline/SceneExporter.ts`.
 */
export interface ExportLODConfig {
  level: number;
  distance: number;
  reduction: number; // 0.0 to 1.0 (1.0 = full resolution)
}

// ============================================================================
// Terrain LOD Config Fields (migrated from terrain/mesher/LODMesher.ts)
// ============================================================================

/**
 * LOD-specific fields for the terrain mesher configuration.
 *
 * The full `TerrainLODConfig` in `terrain/mesher/LODMesher.ts` extends
 * `SphericalMesherConfig` with these fields.  Because that base type is
 * terrain-specific, only the LOD fields are defined here; the composed
 * type is assembled in the terrain module.
 *
 * Previously defined as part of `LODConfig` in `terrain/mesher/LODMesher.ts`.
 */
export interface TerrainLODConfigFields {
  maxLOD: number;
  minLOD: number;
  screenSpaceError: number;
  lodTransitionDistance: number;
  borderStitching: boolean;
}

// ============================================================================
// LOD System — Full-featured singleton
// ============================================================================

/**
 * LOD System for managing detail levels based on camera distance.
 * Implements automatic LOD switching, HLOD (Hierarchical LOD), and
 * memory-efficient streaming.
 */
export class LODSystem {
  private static instance: LODSystem;

  // LOD groups registry
  private lodGroups: Map<string, THREE.LOD> = new Map();

  // Configuration per asset type
  private configs: Map<string, LODConfig[]> = new Map();

  // Camera reference for distance calculations
  private camera: THREE.Camera | null = null;

  // Update frequency (ms)
  private updateInterval: number = 100;
  private lastUpdate: number = 0;

  // Performance settings
  private autoUpdate: boolean = true;
  private fadeTransition: boolean = false;
  private screenSpaceThreshold: number = 0.05; // 5% screen coverage

  // Statistics
  private stats: LODStats = {
    totalLODGroups: 0,
    activeSwitches: 0,
    culledObjects: 0,
    memorySaved: 0,
  };

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): LODSystem {
    if (!LODSystem.instance) {
      LODSystem.instance = new LODSystem();
    }
    return LODSystem.instance;
  }

  /**
   * Set the camera for distance calculations
   */
  public setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  // ============================================================================
  // LOD Group Creation & Management
  // ============================================================================

  /**
   * Create a new LOD group for an asset
   */
  public createLODGroup(
    assetId: string,
    geometries: THREE.Object3D[],
    distances: number[],
  ): THREE.LOD {
    const lod = new THREE.LOD();

    // Add each LOD level
    geometries.forEach((geometry, index) => {
      const distance = distances[index] || Infinity;
      lod.addLevel(geometry, distance);
    });

    // Enable fade transitions if configured
    if (this.fadeTransition) {
      // lod.enableFade = true; // Not available in current Three.js version
    }

    this.lodGroups.set(assetId, lod);
    this.stats.totalLODGroups++;

    return lod;
  }

  /**
   * Create LOD group with automatic geometry simplification
   */
  public createAutoLODGroup(
    assetId: string,
    baseMesh: THREE.Mesh,
    config: LODConfig[],
  ): THREE.LOD {
    const lod = new THREE.LOD();
    const geometries: THREE.Object3D[] = [];
    const distances: number[] = [];

    // Generate LOD levels
    config.forEach((level, index) => {
      const simplified = this.simplifyGeometry(
        baseMesh.geometry,
        level.targetFaceCount,
      );

      const mesh = new THREE.Mesh(simplified, baseMesh.material);
      mesh.castShadow = baseMesh.castShadow;
      mesh.receiveShadow = baseMesh.receiveShadow;

      geometries.push(mesh);
      distances.push(level.distance);
    });

    return this.createLODGroup(assetId, geometries, distances);
  }

  /**
   * Get an existing LOD group
   */
  public getLODGroup(assetId: string): THREE.LOD | null {
    return this.lodGroups.get(assetId) || null;
  }

  /**
   * Remove and dispose a LOD group
   */
  public removeLODGroup(assetId: string): boolean {
    const lod = this.lodGroups.get(assetId);
    if (!lod) return false;

    // Dispose all levels
    lod.levels.forEach((level) => {
      if (level.object instanceof THREE.Mesh) {
        level.object.geometry.dispose();
      }
    });

    this.lodGroups.delete(assetId);
    this.stats.totalLODGroups--;
    return true;
  }

  // ============================================================================
  // Geometry Simplification
  // ============================================================================

  /**
   * Simplify geometry to target face count
   */
  public simplifyGeometry(
    geometry: THREE.BufferGeometry,
    targetFaceCount: number,
  ): THREE.BufferGeometry {
    const currentFaceCount = geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;

    // If already at or below target, return copy
    if (currentFaceCount <= targetFaceCount) {
      return geometry.clone();
    }

    // Calculate reduction ratio
    const ratio = targetFaceCount / currentFaceCount;

    // Use Three.js built-in simplification if available
    // Note: For production, consider using meshoptimizer or similar library
    return this.simplifyBufferGeometry(geometry, ratio);
  }

  /**
   * Basic buffer geometry simplification (vertex clustering approach)
   */
  private simplifyBufferGeometry(
    geometry: THREE.BufferGeometry,
    ratio: number,
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;

    // Simple decimation: sample vertices at reduced rate
    const sampleRate = Math.sqrt(ratio);
    const newPositions: number[] = [];

    for (let i = 0; i < positions.length; i += 9) {
      if (new SeededRandom(42).next() < sampleRate) {
        // Keep this triangle
        newPositions.push(
          positions[i], positions[i + 1], positions[i + 2],
          positions[i + 3], positions[i + 4], positions[i + 5],
          positions[i + 6], positions[i + 7], positions[i + 8],
        );
      }
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(newPositions, 3),
    );

    // Copy other attributes if they exist
    if (geometry.attributes.normal) {
      const normals = geometry.attributes.normal.array as Float32Array;
      const newNormals: number[] = [];
      for (let i = 0; i < normals.length && i < newPositions.length; i += 3) {
        newNormals.push(normals[i], normals[i + 1], normals[i + 2]);
      }
      if (newNormals.length > 0) {
        newGeometry.setAttribute(
          'normal',
          new THREE.Float32BufferAttribute(newNormals, 3),
        );
      }
    }

    if (geometry.attributes.uv) {
      const uvs = geometry.attributes.uv.array as Float32Array;
      const newUVs: number[] = [];
      for (let i = 0; i < uvs.length && i < newPositions.length; i += 2) {
        newUVs.push(uvs[i], uvs[i + 1]);
      }
      if (newUVs.length > 0) {
        newGeometry.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(newUVs, 2),
        );
      }
    }

    newGeometry.computeVertexNormals();
    return newGeometry;
  }

  // ============================================================================
  // Automatic Updates
  // ============================================================================

  /**
   * Update all LOD groups based on camera position
   */
  public update(deltaTime: number): void {
    if (!this.autoUpdate || !this.camera) return;

    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) return;

    this.lastUpdate = now;

    this.lodGroups.forEach((lod, assetId) => {
      const previousLevel = lod.getCurrentLevel();

      // Update LOD based on camera distance
      lod.update(this.camera!);

      const currentLevel = lod.getCurrentLevel();
      if (previousLevel !== currentLevel) {
        this.stats.activeSwitches++;

        // Emit event or callback if needed
        this.onLODSwitch(assetId, previousLevel, currentLevel);
      }
    });
  }

  /**
   * Handle LOD switch events
   */
  private onLODSwitch(assetId: string, oldLevel: number, newLevel: number): void {
    // Could emit events, log statistics, or trigger loading
    console.debug(`LOD switch for ${assetId}: ${oldLevel} -> ${newLevel}`);
  }

  /**
   * Force update of specific LOD group
   */
  public forceUpdate(assetId: string): void {
    const lod = this.lodGroups.get(assetId);
    if (lod && this.camera) {
      lod.update(this.camera);
    }
  }

  // ============================================================================
  // Hierarchical LOD (HLOD)
  // ============================================================================

  /**
   * Create HLOD for grouping multiple distant objects
   */
  public createHLOD(
    hlodId: string,
    objects: THREE.Object3D[],
    distance: number,
  ): THREE.LOD {
    // Combine geometries for distant view
    const combinedGeometry = this.combineGeometries(objects);
    const combinedMesh = new THREE.Mesh(
      combinedGeometry,
      this.getAverageMaterial(objects),
    );

    const lod = new THREE.LOD();

    // Add close-up individual objects
    objects.forEach((obj) => {
      lod.addLevel(obj, 0);
    });

    // Add distant combined mesh
    lod.addLevel(combinedMesh, distance);

    this.lodGroups.set(hlodId, lod);
    this.stats.totalLODGroups++;

    return lod;
  }

  /**
   * Combine multiple geometries into one
   */
  private combineGeometries(objects: THREE.Object3D[]): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const matrices: THREE.Matrix4[] = [];

    objects.forEach((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.updateMatrixWorld(true);
        geometries.push(obj.geometry);
        matrices.push(obj.matrixWorld);
      }
    });

    return this.simpleMergeGeometries(geometries, matrices);
  }

  /**
   * Fallback geometry merging without BufferGeometryUtils
   */
  private simpleMergeGeometries(
    geometries: THREE.BufferGeometry[],
    matrices: THREE.Matrix4[],
  ): THREE.BufferGeometry {
    const merged = new THREE.BufferGeometry();
    const allPositions: number[] = [];
    const allNormals: number[] = [];

    geometries.forEach((geo, idx) => {
      const positions = geo.attributes.position.array as Float32Array;
      const matrix = matrices[idx];

      for (let i = 0; i < positions.length; i += 3) {
        const v = new THREE.Vector3(
          positions[i],
          positions[i + 1],
          positions[i + 2],
        );
        v.applyMatrix4(matrix);
        allPositions.push(v.x, v.y, v.z);
      }

      if (geo.attributes.normal) {
        const normals = geo.attributes.normal.array as Float32Array;
        for (let i = 0; i < normals.length; i += 3) {
          allNormals.push(normals[i], normals[i + 1], normals[i + 2]);
        }
      }
    });

    merged.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(allPositions, 3),
    );
    if (allNormals.length > 0) {
      merged.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(allNormals, 3),
      );
    }

    merged.computeVertexNormals();
    return merged;
  }

  /**
   * Get average material from objects
   */
  private getAverageMaterial(objects: THREE.Object3D[]): THREE.Material {
    // Simple implementation: use first material
    for (const obj of objects) {
      if (obj instanceof THREE.Mesh && obj.material) {
        return Array.isArray(obj.material) ? obj.material[0] : obj.material;
      }
    }
    return new THREE.MeshStandardMaterial({ color: 0x808080 });
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Set LOD configuration for asset type
   */
  public setConfig(assetType: string, config: LODConfig[]): void {
    this.configs.set(assetType, config);
  }

  /**
   * Get LOD configuration for asset type
   */
  public getConfig(assetType: string): LODConfig[] | undefined {
    return this.configs.get(assetType);
  }

  /**
   * Set default LOD configuration
   */
  public setDefaultConfig(): void {
    const defaultConfig: LODConfig[] = [
      { distance: 0, complexity: 'high', targetFaceCount: 10000, textureResolution: 2048 },
      { distance: 20, complexity: 'medium', targetFaceCount: 2500, textureResolution: 1024 },
      { distance: 50, complexity: 'low', targetFaceCount: 500, textureResolution: 512 },
      { distance: 100, complexity: 'low', targetFaceCount: 100, textureResolution: 256 },
    ];
    this.setConfig('default', defaultConfig);
  }

  // ============================================================================
  // Settings
  // ============================================================================

  /**
   * Enable or disable automatic updates
   */
  public setAutoUpdate(enabled: boolean): void {
    this.autoUpdate = enabled;
  }

  /**
   * Set update interval in milliseconds
   */
  public setUpdateInterval(interval: number): void {
    this.updateInterval = Math.max(16, interval); // Minimum 16ms (~60fps)
  }

  /**
   * Enable or disable fade transitions
   */
  public setFadeTransition(enabled: boolean): void {
    this.fadeTransition = enabled;
    this.lodGroups.forEach((lod) => {
      // lod.enableFade = enabled; // Not available in current Three.js version
    });
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get LOD system statistics
   */
  public getStats(): LODStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      totalLODGroups: 0,
      activeSwitches: 0,
      culledObjects: 0,
      memorySaved: 0,
    };
  }

  /**
   * Print statistics to console
   */
  public printStats(): void {
    const stats = this.getStats();
    console.log('=== LOD System Statistics ===');
    console.log(`Total LOD Groups: ${stats.totalLODGroups}`);
    console.log(`Active Switches: ${stats.activeSwitches}`);
    console.log(`Culled Objects: ${stats.culledObjects}`);
    console.log(
      `Memory Saved: ${(stats.memorySaved / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log('==============================');
  }

  /**
   * Clean up and dispose resources
   */
  public dispose(): void {
    this.lodGroups.forEach((lod, id) => {
      this.removeLODGroup(id);
    });
    this.configs.clear();
    this.camera = null;
  }
}

// ============================================================================
// LOD Statistics
// ============================================================================

/**
 * LOD statistics interface
 */
export interface LODStats {
  totalLODGroups: number;
  activeSwitches: number;
  culledObjects: number;
  memorySaved: number;
}

// Export singleton instance helper
export const lodSystem = LODSystem.getInstance();
