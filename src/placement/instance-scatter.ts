/**
 * Instance Scattering Module
 * 
 * Efficiently places large numbers of objects using instancing,
 * LOD management, and spatial partitioning.
 * 
 * Ported from: infinigen/core/placement/instance_scatter.py
 */

import * as THREE from 'three';
import { BBox } from '../math/bbox.js';
import { Tag } from '../tags/tags.js';
import { DensityFunction } from './density.js';

/**
 * Configuration for instance scattering
 */
export interface ScatterConfig {
  /** Maximum number of instances */
  maxInstances: number;
  /** Minimum distance between instances */
  minDistance: number;
  /** Use LOD (Level of Detail) */
  useLOD: boolean;
  /** LOD distances */
  lodDistances: number[];
  /** Random seed for reproducibility */
  seed: number;
  /** Alignment to surface normal */
  alignToNormal: boolean;
  /** Scale variation range [min, max] */
  scaleRange: [number, number];
  /** Rotation variation (radians) */
  rotationVariation: number;
}

/**
 * Represents a single scattered instance
 */
export interface ScatteredInstance {
  /** Instance ID */
  id: number;
  /** Position */
  position: THREE.Vector3;
  /** Rotation quaternion */
  rotation: THREE.Quaternion;
  /** Scale factor */
  scale: number;
  /** Surface normal at placement point */
  normal: THREE.Vector3;
  /** Assigned tag */
  tag?: Tag;
  /** LOD level */
  lodLevel: number;
}

/**
 * Spatial hash grid for efficient collision detection
 */
export class SpatialHashGrid {
  private cellSize: number;
  private grid: Map<string, Set<number>> = new Map();

  constructor(cellSize: number = 1.0) {
    this.cellSize = cellSize;
  }

  private getKey(x: number, y: number, z: number): string {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    const gz = Math.floor(z / this.cellSize);
    return `${gx},${gy},${gz}`;
  }

  /**
   * Add an instance to the grid
   */
  add(id: number, position: THREE.Vector3): void {
    const key = this.getKey(position.x, position.y, position.z);
    if (!this.grid.has(key)) {
      this.grid.set(key, new Set());
    }
    this.grid.get(key)!.add(id);
  }

  /**
   * Remove an instance from the grid
   */
  remove(id: number, position: THREE.Vector3): void {
    const key = this.getKey(position.x, position.y, position.z);
    const cell = this.grid.get(key);
    if (cell) {
      cell.delete(id);
    }
  }

  /**
   * Get nearby instance IDs within radius
   */
  getNearby(position: THREE.Vector3, radius: number): number[] {
    const nearby = new Set<number>();
    const cellsRadius = Math.ceil(radius / this.cellSize);

    const centerKey = this.getKey(position.x, position.y, position.z);
    const [cx, cy, cz] = centerKey.split(',').map(Number);

    for (let dx = -cellsRadius; dx <= cellsRadius; dx++) {
      for (let dy = -cellsRadius; dy <= cellsRadius; dy++) {
        for (let dz = -cellsRadius; dz <= cellsRadius; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = this.grid.get(key);
          if (cell) {
            cell.forEach(id => nearby.add(id));
          }
        }
      }
    }

    return Array.from(nearby);
  }

  /**
   * Clear the grid
   */
  clear(): void {
    this.grid.clear();
  }
}

/**
 * Main instance scattering system
 */
export class InstanceScatterer {
  private config: ScatterConfig;
  private instances: ScatteredInstance[] = [];
  private spatialGrid: SpatialHashGrid;
  private rng: () => number;

  constructor(config: Partial<ScatterConfig> = {}) {
    this.config = {
      maxInstances: config.maxInstances ?? 1000,
      minDistance: config.minDistance ?? 0.5,
      useLOD: config.useLOD ?? true,
      lodDistances: config.lodDistances ?? [10, 30, 60],
      seed: config.seed ?? Math.random(),
      alignToNormal: config.alignToNormal ?? true,
      scaleRange: config.scaleRange ?? [0.8, 1.2],
      rotationVariation: config.rotationVariation ?? Math.PI / 8,
    };

    // Initialize seeded random
    this.rng = this.createSeededRandom(this.config.seed);
    
    // Initialize spatial grid with cell size based on min distance
    this.spatialGrid = new SpatialHashGrid(this.config.minDistance * 2);
  }

  /**
   * Create seeded random number generator
   */
  private createSeededRandom(seed: number): () => number {
    let s = seed * 2147483647;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /**
   * Scatter instances on a mesh surface
   */
  scatter(
    geometry: THREE.BufferGeometry,
    densityFn: DensityFunction,
    tag?: Tag
  ): ScatteredInstance[] {
    this.instances = [];
    this.spatialGrid.clear();

    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array | undefined;
    const vertexCount = positions.length / 3;

    // Sample points based on density function
    const candidates: { position: THREE.Vector3; normal: THREE.Vector3; weight: number }[] = [];

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      
      const position = new THREE.Vector3(x, y, z);
      const normal = normals ? 
        new THREE.Vector3(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) :
        new THREE.Vector3(0, 1, 0);

      // Evaluate density at this point
      const density = densityFn.evaluate(position, normal);
      
      if (density > 0) {
        candidates.push({ position, normal, weight: density });
      }
    }

    // Sort candidates by weight (descending)
    candidates.sort((a, b) => b.weight - a.weight);

    // Poisson disk sampling with density weights
    const placed = this.poissonDiskSample(candidates, tag);

    return placed;
  }

  /**
   * Poisson disk sampling with density-based weighting
   */
  private poissonDiskSample(
    candidates: { position: THREE.Vector3; normal: THREE.Vector3; weight: number }[],
    tag?: Tag
  ): ScatteredInstance[] {
    const placed: ScatteredInstance[] = [];
    const minDistSq = this.config.minDistance * this.config.minDistance;

    for (const candidate of candidates) {
      if (placed.length >= this.config.maxInstances) {
        break;
      }

      // Probabilistic acceptance based on weight
      const acceptanceProb = candidate.weight;
      if (this.rng() > acceptanceProb) {
        continue;
      }

      // Check minimum distance constraint
      const nearby = this.spatialGrid.getNearby(candidate.position, this.config.minDistance);
      let tooClose = false;

      for (const id of nearby) {
        const existing = placed[id];
        const distSq = candidate.position.distanceToSquared(existing.position);
        if (distSq < minDistSq) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        const instance = this.createInstance(candidate.position, candidate.normal, tag, placed.length);
        placed.push(instance);
        this.spatialGrid.add(placed.length - 1, instance.position);
      }
    }

    return placed;
  }

  /**
   * Create a scattered instance with variations
   */
  private createInstance(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    tag?: Tag,
    id: number = 0
  ): ScatteredInstance {
    // Calculate scale variation
    const scale = this.config.scaleRange[0] + 
      this.rng() * (this.config.scaleRange[1] - this.config.scaleRange[0]);

    // Calculate rotation with variation
    const upVector = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    
    if (this.config.alignToNormal) {
      quaternion.setFromUnitVectors(upVector, normal);
    }

    // Add random rotation around up axis
    const randomAngle = (this.rng() - 0.5) * 2 * this.config.rotationVariation;
    const rotationQuat = new THREE.Quaternion();
    rotationQuat.setFromAxisAngle(upVector, randomAngle);
    quaternion.multiply(rotationQuat);

    // Determine LOD level
    const lodLevel = this.calculateLOD(position);

    return {
      id,
      position: position.clone(),
      rotation: quaternion,
      scale,
      normal: normal.clone(),
      tag,
      lodLevel,
    };
  }

  /**
   * Calculate LOD level based on distance from origin (camera proxy)
   */
  private calculateLOD(position: THREE.Vector3): number {
    if (!this.config.useLOD) {
      return 0;
    }

    const dist = position.length();
    for (let i = 0; i < this.config.lodDistances.length; i++) {
      if (dist > this.config.lodDistances[i]) {
        return i + 1;
      }
    }
    return 0;
  }

  /**
   * Create InstancedMesh from scattered instances
   */
  createInstancedMesh(
    baseMesh: THREE.Mesh,
    scene: THREE.Scene
  ): THREE.InstancedMesh {
    const count = this.instances.length;
    if (count === 0) {
      throw new Error('No instances to create');
    }

    const instancedMesh = new THREE.InstancedMesh(
      baseMesh.geometry,
      baseMesh.material,
      count
    );

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const instance = this.instances[i];
      
      scale.set(instance.scale, instance.scale, instance.scale);
      matrix.compose(instance.position, instance.rotation, scale);
      
      instancedMesh.setMatrixAt(i, matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(instancedMesh);

    return instancedMesh;
  }

  /**
   * Update instance transforms (for animation/movement)
   */
  updateInstance(id: number, transform: Partial<{
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    scale: number;
  }>): void {
    if (id < 0 || id >= this.instances.length) {
      throw new Error(`Instance ID ${id} out of range`);
    }

    const instance = this.instances[id];
    
    // Remove from old position in spatial grid
    this.spatialGrid.remove(id, instance.position);

    // Apply updates
    if (transform.position) {
      instance.position.copy(transform.position);
    }
    if (transform.rotation) {
      instance.rotation.copy(transform.rotation);
    }
    if (transform.scale !== undefined) {
      instance.scale = transform.scale;
    }

    // Add to new position in spatial grid
    this.spatialGrid.add(id, instance.position);
  }

  /**
   * Get all instances
   */
  getInstances(): ScatteredInstance[] {
    return [...this.instances];
  }

  /**
   * Get instance by ID
   */
  getInstance(id: number): ScatteredInstance | undefined {
    return this.instances[id];
  }

  /**
   * Clear all instances
   */
  clear(): void {
    this.instances = [];
    this.spatialGrid.clear();
  }

  /**
   * Filter instances by tag
   */
  filterByTag(tag: Tag): ScatteredInstance[] {
    return this.instances.filter(inst => inst.tag === tag);
  }

  /**
   * Get instances within bounding box
   */
  filterByBBox(bbox: BBox): ScatteredInstance[] {
    return this.instances.filter(inst => bbox.containsPoint(inst.position));
  }

  /**
   * Export instances for serialization
   */
  toJSON(): object {
    return {
      config: this.config,
      instances: this.instances.map(inst => ({
        id: inst.id,
        position: [inst.position.x, inst.position.y, inst.position.z],
        rotation: [inst.rotation.x, inst.rotation.y, inst.rotation.z, inst.rotation.w],
        scale: inst.scale,
        normal: [inst.normal.x, inst.normal.y, inst.normal.z],
        tag: inst.tag?.name,
        lodLevel: inst.lodLevel,
      })),
    };
  }

  /**
   * Import instances from JSON
   */
  static fromJSON(json: any): InstanceScatterer {
    const scatterer = new InstanceScatterer(json.config);
    scatterer.instances = json.instances.map((data: any) => ({
      id: data.id,
      position: new THREE.Vector3(...data.position),
      rotation: new THREE.Quaternion(...data.rotation),
      scale: data.scale,
      normal: new THREE.Vector3(...data.normal),
      tag: data.tag ? new Tag(data.tag) : undefined,
      lodLevel: data.lodLevel,
    }));

    // Rebuild spatial grid
    scatterer.instances.forEach((inst, idx) => {
      scatterer.spatialGrid.add(idx, inst.position);
    });

    return scatterer;
  }
}

/**
 * Multi-object scattering coordinator
 */
export class MultiObjectScatterer {
  private scatterers: Map<string, InstanceScatterer> = new Map();

  /**
   * Add a scatterer for a specific object type
   */
  addScatterer(objectType: string, config: Partial<ScatterConfig> = {}): InstanceScatterer {
    const scatterer = new InstanceScatterer(config);
    this.scatterers.set(objectType, scatterer);
    return scatterer;
  }

  /**
   * Get scatterer for object type
   */
  getScatterer(objectType: string): InstanceScatterer | undefined {
    return this.scatterers.get(objectType);
  }

  /**
   * Scatter multiple object types
   */
  scatterAll(
    geometries: Map<string, THREE.BufferGeometry>,
    densityFns: Map<string, DensityFunction>
  ): Map<string, ScatteredInstance[]> {
    const results = new Map<string, ScatteredInstance[]>();

    for (const [objectType, geometry] of geometries) {
      const scatterer = this.scatterers.get(objectType);
      const densityFn = densityFns.get(objectType);

      if (scatterer && densityFn) {
        const instances = scatterer.scatter(geometry, densityFn);
        results.set(objectType, instances);
      }
    }

    return results;
  }

  /**
   * Create all instanced meshes
   */
  createAllInstancedMeshes(
    baseMeshes: Map<string, THREE.Mesh>,
    scene: THREE.Scene
  ): Map<string, THREE.InstancedMesh> {
    const meshes = new Map<string, THREE.InstancedMesh>();

    for (const [objectType, scatterer] of this.scatterers) {
      const baseMesh = baseMeshes.get(objectType);
      if (baseMesh) {
        try {
          const instancedMesh = scatterer.createInstancedMesh(baseMesh, scene);
          meshes.set(objectType, instancedMesh);
        } catch (e) {
          console.warn(`No instances for ${objectType}`);
        }
      }
    }

    return meshes;
  }

  /**
   * Clear all scatterers
   */
  clear(): void {
    this.scatterers.forEach(s => s.clear());
  }
}

export default InstanceScatterer;
