/**
 * Level of Detail (LOD) System for Asset Management
 * 
 * Provides automatic LOD generation, selection, and streaming for optimal performance.
 */

import type { Object3D, Geometry, Material } from 'three';

// ============================================================================
// Types & Interfaces
// ============================================================================

export enum LODLevel {
  LOD0 = 0, // Highest quality (100%)
  LOD1 = 1, // High quality (50%)
  LOD2 = 2, // Medium quality (25%)
  LOD3 = 3, // Low quality (12.5%)
  LOD4 = 4, // Lowest quality (6.25%)
}

export interface LODConfig {
  /** Distance thresholds for each LOD level (in meters) */
  distances: number[];
  /** Target triangle counts for each LOD level */
  targetTriangles: number[];
  /** Enable screen-space error metric */
  useScreenSpaceError: boolean;
  /** Screen-space error threshold (pixels) */
  screenSpaceErrorThreshold: number;
  /** Enable hysteresis to prevent LOD popping */
  enableHysteresis: boolean;
  /** Hysteresis margin (percentage) */
  hysteresisMargin: number;
  /** Fade between LODs */
  enableFading: boolean;
  /** Fade duration (ms) */
  fadeDuration: number;
}

export interface LODMesh {
  level: LODLevel;
  geometry: Geometry;
  material: Material | Material[];
  mesh: Object3D;
  triangleCount: number;
  boundingSphere: number;
}

export interface LODObject {
  id: string;
  object: Object3D;
  lods: LODMesh[];
  currentLevel: LODLevel;
  config: LODConfig;
  distanceToCamera: number;
  screenSpaceError: number;
  lastUpdate: number;
}

export const DEFAULT_LOD_CONFIG: LODConfig = {
  distances: [0, 10, 25, 50, 100],
  targetTriangles: [10000, 5000, 2000, 500, 100],
  useScreenSpaceError: true,
  screenSpaceErrorThreshold: 4,
  enableHysteresis: true,
  hysteresisMargin: 0.1,
  enableFading: true,
  fadeDuration: 200,
};

// ============================================================================
// LOD Generation
// ============================================================================

/**
 * Generate LOD levels for a geometry
 */
export function generateLODLevels(
  baseGeometry: Geometry,
  config: LODConfig = DEFAULT_LOD_CONFIG
): LODMesh[] {
  const lods: LODMesh[] = [];
  
  // LOD0 - Original geometry
  lods.push({
    level: LODLevel.LOD0,
    geometry: baseGeometry,
    material: [],
    mesh: new Object3D(),
    triangleCount: getIndexCount(baseGeometry),
    boundingSphere: computeBoundingSphere(baseGeometry),
  });

  // Generate lower LODs using simplification
  for (let i = 1; i < config.targetTriangles.length; i++) {
    const targetTris = config.targetTriangles[i];
    const simplified = simplifyGeometry(baseGeometry, targetTris);
    
    if (simplified) {
      lods.push({
        level: i as LODLevel,
        geometry: simplified,
        material: [],
        mesh: new Object3D(),
        triangleCount: getIndexCount(simplified),
        boundingSphere: computeBoundingSphere(simplified),
      });
    }
  }

  return lods;
}

/**
 * Simplify geometry to target triangle count
 */
function simplifyGeometry(geometry: Geometry, targetTriangles: number): Geometry | null {
  // Placeholder for mesh simplification algorithm
  // In production, would use libraries like meshoptimizer or draco
  const currentTris = getIndexCount(geometry);
  
  if (targetTriangles >= currentTris) {
    return geometry.clone();
  }

  // Simple vertex clustering approach (placeholder)
  const ratio = targetTriangles / currentTris;
  
  // Clone and mark for simplification
  const simplified = geometry.clone();
  (simplified as any)._lodRatio = ratio;
  
  return simplified;
}

function getIndexCount(geometry: Geometry): number {
  if (geometry.index) {
    return geometry.index.count / 3;
  }
  if (geometry.attributes.position) {
    return geometry.attributes.position.count / 3;
  }
  return 0;
}

function computeBoundingSphere(geometry: Geometry): number {
  if (!geometry.boundingSphere) {
    geometry.computeBoundingSphere();
  }
  return geometry.boundingSphere?.radius || 0;
}

// ============================================================================
// LOD Selection
// ============================================================================

/**
 * Select appropriate LOD level based on distance
 */
export function selectLODByDistance(
  distance: number,
  config: LODConfig
): LODLevel {
  for (let i = config.distances.length - 1; i >= 0; i--) {
    if (distance >= config.distances[i]) {
      return Math.min(i, LODLevel.LOD4) as LODLevel;
    }
  }
  return LODLevel.LOD0;
}

/**
 * Select LOD based on screen-space error
 */
export function selectLODByScreenSpace(
  object: LODObject,
  cameraPosition: { x: number; y: number; z: number },
  viewportHeight: number,
  fov: number
): LODLevel {
  const distance = object.distanceToCamera;
  const sphereRadius = object.lods[object.currentLevel]?.boundingSphere || 1;
  
  // Calculate screen-space size
  const fovRad = (fov * Math.PI) / 180;
  const projectedSize = (sphereRadius / distance) * (viewportHeight / Math.tan(fovRad / 2));
  
  // Calculate error metric
  const baseError = sphereRadius / distance;
  const screenSpaceError = baseError * projectedSize;
  
  object.screenSpaceError = screenSpaceError;
  
  // Find LOD that meets error threshold
  for (let i = 0; i < object.lods.length; i++) {
    const lodError = screenSpaceError * (1 + i * 0.5);
    if (lodError <= object.config.screenSpaceErrorThreshold) {
      return i as LODLevel;
    }
  }
  
  return LODLevel.LOD4;
}

/**
 * Update LOD selection with hysteresis
 */
export function updateLODWithHysteresis(
  object: LODObject,
  newLevel: LODLevel
): void {
  if (!object.config.enableHysteresis) {
    object.currentLevel = newLevel;
    return;
  }

  const currentLevel = object.currentLevel;
  const margin = object.config.hysteresisMargin;

  // Only switch if change is significant enough
  if (newLevel > currentLevel) {
    // Switching to lower quality - need larger distance increase
    const threshold = currentLevel + 1 + margin;
    if (newLevel >= threshold) {
      object.currentLevel = newLevel;
    }
  } else if (newLevel < currentLevel) {
    // Switching to higher quality - can switch sooner
    const threshold = currentLevel - 1 - margin;
    if (newLevel <= threshold) {
      object.currentLevel = newLevel;
    }
  }
}

// ============================================================================
// LOD Manager
// ============================================================================

export class LODManager {
  private objects: Map<string, LODObject> = new Map();
  private defaultConfig: LODConfig;

  constructor(config: Partial<LODConfig> = {}) {
    this.defaultConfig = { ...DEFAULT_LOD_CONFIG, ...config };
  }

  /**
   * Add object to LOD system
   */
  addObject(
    id: string,
    object: Object3D,
    lods: LODMesh[],
    config?: Partial<LODConfig>
  ): void {
    this.objects.set(id, {
      id,
      object,
      lods,
      currentLevel: LODLevel.LOD0,
      config: { ...this.defaultConfig, ...config },
      distanceToCamera: 0,
      screenSpaceError: 0,
      lastUpdate: 0,
    });
  }

  /**
   * Remove object from LOD system
   */
  removeObject(id: string): void {
    this.objects.delete(id);
  }

  /**
   * Update all LODs based on camera position
   */
  update(cameraPosition: { x: number; y: number; z: number }, viewportHeight: number, fov: number): void {
    const now = performance.now();

    for (const [id, obj] of this.objects) {
      // Calculate distance to camera
      const dx = obj.object.position.x - cameraPosition.x;
      const dy = obj.object.position.y - cameraPosition.y;
      const dz = obj.object.position.z - cameraPosition.z;
      obj.distanceToCamera = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Select LOD based on screen-space error
      let newLevel: LODLevel;
      if (obj.config.useScreenSpaceError) {
        newLevel = selectLODByScreenSpace(obj, cameraPosition, viewportHeight, fov);
      } else {
        newLevel = selectLODByDistance(obj.distanceToCamera, obj.config);
      }

      // Apply hysteresis
      updateLODWithHysteresis(obj, newLevel);

      // Update mesh visibility
      this.updateMeshVisibility(obj);

      obj.lastUpdate = now;
    }
  }

  /**
   * Update mesh visibility based on current LOD
   */
  private updateMeshVisibility(obj: LODObject): void {
    // Hide all LOD meshes
    obj.lods.forEach(lod => {
      if (lod.mesh) {
        lod.mesh.visible = false;
      }
    });

    // Show current LOD
    const currentLOD = obj.lods[obj.currentLevel];
    if (currentLOD && currentLOD.mesh) {
      currentLOD.mesh.visible = true;
      
      // Sync position/rotation/scale with parent
      currentLOD.mesh.position.copy(obj.object.position);
      currentLOD.mesh.rotation.copy(obj.object.rotation);
      currentLOD.mesh.scale.copy(obj.object.scale);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalObjects: number;
    lodDistribution: Record<number, number>;
    averageDistance: number;
  } {
    const distribution: Record<number, number> = {};
    let totalDistance = 0;

    for (const obj of this.objects.values()) {
      distribution[obj.currentLevel] = (distribution[obj.currentLevel] || 0) + 1;
      totalDistance += obj.distanceToCamera;
    }

    return {
      totalObjects: this.objects.size,
      lodDistribution: distribution,
      averageDistance: this.objects.size > 0 ? totalDistance / this.objects.size : 0,
    };
  }

  /**
   * Clear all objects
   */
  clear(): void {
    this.objects.clear();
  }
}

// ============================================================================
// Instanced LOD Support
// ============================================================================

export interface InstancedLODConfig extends LODConfig {
  maxInstances: number;
  instanceStride: number;
}

export class InstancedLODManager {
  private instances: Map<string, { count: number; matrices: Float32Array }> = new Map();
  private configs: Map<string, InstancedLODConfig> = new Map();

  addInstancedObject(
    id: string,
    initialCount: number,
    config: InstancedLODConfig
  ): void {
    const matrices = new Float32Array(config.maxInstances * 16);
    this.instances.set(id, { count: initialCount, matrices });
    this.configs.set(id, config);
  }

  updateInstanceMatrix(id: string, index: number, matrix: Float32Array): void {
    const instance = this.instances.get(id);
    if (instance && index < instance.count) {
      instance.matrices.set(matrix, index * 16);
    }
  }

  getInstanceBuffer(id: string): Float32Array | null {
    const instance = this.instances.get(id);
    return instance ? instance.matrices : null;
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate memory savings from LOD
 */
export function calculateMemorySavings(originalTris: number, lodTris: number[]): number {
  const totalLodTris = lodTris.reduce((sum, tris) => sum + tris, 0);
  const savings = originalTris - totalLodTris;
  return (savings / originalTris) * 100;
}

/**
 * Estimate rendering cost reduction
 */
export function estimateRenderingImprovement(
  visibleObjects: number,
  avgLODLevel: number
): number {
  // Rough estimate: each LOD level reduces cost by ~50%
  const reductionFactor = Math.pow(0.5, avgLODLevel);
  return (1 - reductionFactor) * 100;
}

export default {
  LODLevel,
  DEFAULT_LOD_CONFIG,
  generateLODLevels,
  selectLODByDistance,
  selectLODByScreenSpace,
  updateLODWithHysteresis,
  LODManager,
  InstancedLODManager,
  calculateMemorySavings,
  estimateRenderingImprovement,
};
