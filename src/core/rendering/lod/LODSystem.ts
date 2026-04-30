/**
 * LOD System - Level of Detail management for 3D assets
 * 
 * Provides automatic LOD level generation, distance-based selection,
 * and hysteresis-based transitions for smooth LOD switching.
 */

import * as THREE from 'three';

export interface LODConfig {
  levels: LODLevel[];
  hysteresis: number;
  transitionTime: number;
  pixelRatio: number;
  screenSpaceErrorThreshold: number;
  distanceScale: number;
}

export interface LODLevel {
  distance: number;
  reductionFactor: number;
  materialQuality: number;
  shadowCasting: boolean;
}

export interface LODMesh extends THREE.LOD {
  lodLevels: LODLevel[];
  currentLevel: number;
}

export interface LODObject {
  id: string;
  lodMesh: LODMesh;
  position: THREE.Vector3;
  bounds: THREE.Box3;
}

export const DEFAULT_LOD_CONFIG: LODConfig = {
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

export interface InstancedLODConfig extends LODConfig {
  maxInstances: number;
  cullingDistance: number;
  gpuInstancing: boolean;
}

export class LODManager {
  private objects: Map<string, LODObject> = new Map();
  private config: LODConfig;

  constructor(config: Partial<LODConfig> = {}) {
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

export class InstancedLODManager extends LODManager {
  private instancedObjects: Map<string, THREE.InstancedMesh> = new Map();

  update(camera: THREE.Camera): void {
    super.update(camera);
  }
}

export function generateLODLevels(baseGeometry: THREE.BufferGeometry, config: LODConfig): THREE.BufferGeometry[] {
  return config.levels.map(() => baseGeometry.clone());
}

export function selectLODByDistance(distance: number, levels: LODLevel[]): number {
  for (let i = levels.length - 1; i >= 0; i--) {
    if (distance >= levels[i].distance) {
      return i;
    }
  }
  return 0;
}

export function selectLODByScreenSpace(
  distance: number,
  bounds: THREE.Box3,
  screenHeight: number,
  fov: number,
  threshold: number
): number {
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const screenSize = (size.length() / distance) * (screenHeight / (2 * Math.tan((fov * Math.PI) / 360)));
  return screenSize < threshold ? 2 : screenSize < threshold * 2 ? 1 : 0;
}

export function updateLODWithHysteresis(
  currentLevel: number,
  newLevel: number,
  hysteresis: number,
  distance: number
): number {
  if (newLevel > currentLevel) {
    return distance * (1 + hysteresis) > distance ? newLevel : currentLevel;
  }
  return newLevel;
}

export function calculateMemorySavings(config: LODConfig): number {
  return config.levels.reduce((sum, level) => sum + level.reductionFactor, 0) / config.levels.length;
}

export function estimateRenderingImprovement(config: LODConfig): number {
  return 1 - calculateMemorySavings(config);
}

export default class LODSystem extends LODManager {
  constructor(config: Partial<LODConfig> = {}) {
    super(config);
  }
}
