/**
 * InstanceScatterSystem
 * 
 * Procedural scattering system for distributing objects (vegetation, rocks, debris)
 * across surfaces with advanced placement rules, collision avoidance, and LOD support.
 * 
 * Features:
 * - Surface-based scattering with normal alignment
 * - Density maps and gradient-based distribution
 * - Collision detection and overlap prevention
 * - Scale, rotation, and position randomization
 * - LOD (Level of Detail) instance management
 * - Biome-based distribution rules
 * - Poisson disk sampling for natural distribution
 */

import {
  Object3D,
  Vector3,
  Quaternion,
  Matrix4,
  BufferGeometry,
  InstancedMesh,
  Color,
  Raycaster,
  Box3,
  Sphere,
  MathUtils,
  Plane,
  Triangle
} from 'three';

// ============================================================================
// Type Definitions
// ============================================================================

export type ScatterMode = 'random' | 'poisson' | 'grid' | 'paint';
export type AlignmentMode = 'normal' | 'up' | 'look_at' | 'random';
export type DistributionType = 'uniform' | 'gradient' | 'texture' | 'custom';

export interface ScatterInstance {
  id: string;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  objectId: string;
  metadata?: {
    biome?: string;
    density?: number;
    height?: number;
    slope?: number;
    custom?: Record<string, any>;
  };
}

export interface ScatterObject {
  id: string;
  mesh: Object3D | BufferGeometry;
  material?: any;
  weight: number; // Probability weight for selection
  minScale: Vector3;
  maxScale: Vector3;
  lodLevels?: { distance: number; mesh: Object3D | BufferGeometry }[];
}

export interface ScatterRules {
  minDistance: number; // Minimum distance between instances
  maxDistance: number; // Maximum distance from surface
  alignToNormal: boolean;
  alignUpVector: Vector3;
  avoidCollisions: boolean;
  collisionRadius: number;
  slopeLimit: number; // Maximum slope in degrees
  heightRange: { min: number; max: number };
  densityMap?: number[][]; // 2D array of density values
  exclusionZones?: Box3[] | Sphere[];
  inclusionZones?: Box3[] | Sphere[];
}

export interface ScatterConfig {
  mode: ScatterMode;
  distribution: DistributionType;
  count: number;
  seed?: number;
  poissonRadius?: number; // For Poisson disk sampling
  gridSize?: number; // For grid mode
  randomRotation: {
    enabled: boolean;
    minYaw: number;
    maxYaw: number;
    minPitch: number;
    maxPitch: number;
    minRoll: number;
    maxRoll: number;
  };
  randomScale: {
    enabled: boolean;
    min: Vector3;
    max: Vector3;
  };
  alignment: AlignmentMode;
  lookAtTarget?: Vector3;
}

export interface ScatterResult {
  success: boolean;
  instances: ScatterInstance[];
  rejectedCount: number;
  computationTime: number;
  statistics: {
    averageDensity: number;
    coverageArea: number;
    boundingBox: Box3;
  };
}

export interface Biome {
  id: string;
  name: string;
  objects: { objectId: string; weight: number; minSlope: number; maxSlope: number }[];
  density: number;
  rules: Partial<ScatterRules>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique instance ID
 */
function generateInstanceId(): string {
  return `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if two points are too close
 */
function isTooClose(point: Vector3, points: Vector3[], minDistance: number): boolean {
  for (const other of points) {
    if (point.distanceToSquared(other) < minDistance * minDistance) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a point is within any exclusion zone
 */
function isInExclusionZone(point: Vector3, zones: (Box3 | Sphere)[]): boolean {
  for (const zone of zones) {
    if (zone instanceof Box3 && zone.containsPoint(point)) {
      return true;
    } else if (zone instanceof Sphere && zone.containsPoint(point)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a point is within any inclusion zone
 */
function isInInclusionZone(point: Vector3, zones: (Box3 | Sphere)[]): boolean {
  if (zones.length === 0) return true;
  
  for (const zone of zones) {
    if (zone instanceof Box3 && zone.containsPoint(point)) {
      return true;
    } else if (zone instanceof Sphere && zone.containsPoint(point)) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate slope at a point on a surface
 */
function calculateSlope(normal: Vector3, upVector: Vector3 = new Vector3(0, 1, 0)): number {
  const dot = normal.dot(upVector);
  const angle = Math.acos(Math.abs(dot)) * (180 / Math.PI);
  return angle;
}

/**
 * Generate a random quaternion within specified Euler angle ranges
 */
function randomQuaternion(
  minYaw: number,
  maxYaw: number,
  minPitch: number,
  maxPitch: number,
  minRoll: number,
  maxRoll: number
): Quaternion {
  const yaw = MathUtils.randFloat(minYaw, maxYaw) * (Math.PI / 180);
  const pitch = MathUtils.randFloat(minPitch, maxPitch) * (Math.PI / 180);
  const roll = MathUtils.randFloat(minRoll, maxRoll) * (Math.PI / 180);
  
  const qx = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch);
  const qy = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  const qz = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll);
  
  return qy.multiply(qx).multiply(qz);
}

/**
 * Align quaternion to surface normal
 */
function alignToNormal(upVector: Vector3, normal: Vector3, baseRotation?: Quaternion): Quaternion {
  const targetUp = normal.clone().normalize();
  const quaternion = new Quaternion().setFromUnitVectors(upVector, targetUp);
  
  if (baseRotation) {
    quaternion.multiply(baseRotation);
  }
  
  return quaternion;
}

/**
 * Poisson disk sampling in 2D
 */
function poissonDiskSampling(
  width: number,
  height: number,
  radius: number,
  k: number = 30,
  seed?: number
): Vector2[] {
  const cellSize = radius / Math.sqrt(2);
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const grid = new Array(gridWidth * gridHeight).fill(-1);
  
  const samples: Vector2[] = [];
  const queue: Vector2[] = [];
  
  // First sample
  const firstSample = new Vector2(
    Math.random() * width,
    Math.random() * height
  );
  samples.push(firstSample);
  queue.push(firstSample);
  
  const gridX = Math.floor(firstSample.x / cellSize);
  const gridY = Math.floor(firstSample.y / cellSize);
  grid[gridY * gridWidth + gridX] = 0;
  
  while (queue.length > 0) {
    const index = Math.floor(Math.random() * queue.length);
    const sample = queue[index];
    
    let found = false;
    for (let i = 0; i < k; i++) {
      const angle = Math.atan2(sample.y, sample.x) + Math.random() * Math.PI * 2;
      const dist = MathUtils.randFloat(radius, radius * 2);
      
      const newX = sample.x + Math.cos(angle) * dist;
      const newY = sample.y + Math.sin(angle) * dist;
      
      if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
        const newGridX = Math.floor(newX / cellSize);
        const newGridY = Math.floor(newY / cellSize);
        
        if (newGridX >= 0 && newGridX < gridWidth && newGridY >= 0 && newGridY < gridHeight) {
          let tooClose = false;
          
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const checkX = newGridX + dx;
              const checkY = newGridY + dy;
              
              if (checkX >= 0 && checkX < gridWidth && checkY >= 0 && checkY < gridHeight) {
                const existingIndex = grid[checkY * gridWidth + checkX];
                if (existingIndex !== -1) {
                  const existing = samples[existingIndex];
                  if (existing.distanceTo(new Vector2(newX, newY)) < radius) {
                    tooClose = true;
                    break;
                  }
                }
              }
            }
            if (tooClose) break;
          }
          
          if (!tooClose) {
            const newSample = new Vector2(newX, newY);
            samples.push(newSample);
            queue.push(newSample);
            grid[newGridY * gridWidth + newGridX] = samples.length - 1;
            found = true;
            break;
          }
        }
      }
    }
    
    if (!found) {
      queue.splice(index, 1);
    }
  }
  
  return samples;
}

// Import Vector2 for Poisson sampling
import { Vector2 } from 'three';

// ============================================================================
// InstanceScatterSystem Class
// ============================================================================

export class InstanceScatterSystem {
  private config: ScatterConfig;
  private rules: ScatterRules;
  private objects: Map<string, ScatterObject>;
  private biomes: Map<string, Biome>;
  private instances: Map<string, ScatterInstance>;
  private raycaster: Raycaster;
  private seed: number;
  private currentPositions: Vector3[];
  
  constructor(config?: Partial<ScatterConfig>, rules?: Partial<ScatterRules>) {
    this.config = {
      mode: config?.mode ?? 'poisson',
      distribution: config?.distribution ?? 'uniform',
      count: config?.count ?? 100,
      seed: config?.seed,
      poissonRadius: config?.poissonRadius ?? 1.0,
      gridSize: config?.gridSize ?? 2.0,
      randomRotation: config?.randomRotation ?? {
        enabled: true,
        minYaw: 0,
        maxYaw: 360,
        minPitch: 0,
        maxPitch: 0,
        minRoll: 0,
        maxRoll: 0
      },
      randomScale: config?.randomScale ?? {
        enabled: true,
        min: new Vector3(0.8, 0.8, 0.8),
        max: new Vector3(1.2, 1.2, 1.2)
      },
      alignment: config?.alignment ?? 'normal'
    };
    
    this.rules = {
      minDistance: rules?.minDistance ?? 0.5,
      maxDistance: rules?.maxDistance ?? 0.1,
      alignToNormal: rules?.alignToNormal ?? true,
      alignUpVector: rules?.alignUpVector ?? new Vector3(0, 1, 0),
      avoidCollisions: rules?.avoidCollisions ?? true,
      collisionRadius: rules?.collisionRadius ?? 0.3,
      slopeLimit: rules?.slopeLimit ?? 60,
      heightRange: rules?.heightRange ?? { min: -Infinity, max: Infinity },
      exclusionZones: rules?.exclusionZones ?? [],
      inclusionZones: rules?.inclusionZones ?? [],
      densityMap: rules?.densityMap
    };
    
    this.objects = new Map();
    this.biomes = new Map();
    this.instances = new Map();
    this.raycaster = new Raycaster();
    this.seed = this.config.seed ?? Date.now();
    this.currentPositions = [];
    
    // Seed random number generator
    MathUtils.seedRandom(this.seed);
  }
  
  /**
   * Register a scatterable object
   */
  registerObject(obj: ScatterObject): void {
    this.objects.set(obj.id, obj);
  }
  
  /**
   * Remove a registered object
   */
  removeObject(id: string): void {
    this.objects.delete(id);
  }
  
  /**
   * Register a biome
   */
  registerBiome(biome: Biome): void {
    this.biomes.set(biome.id, biome);
  }
  
  /**
   * Set scatter configuration
   */
  setConfig(config: Partial<ScatterConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Set scatter rules
   */
  setRules(rules: Partial<ScatterRules>): void {
    this.rules = { ...this.rules, ...rules };
  }
  
  /**
   * Clear all instances
   */
  clearInstances(): void {
    this.instances.clear();
    this.currentPositions = [];
  }
  
  /**
   * Get all current instances
   */
  getInstances(): Map<string, ScatterInstance> {
    return new Map(this.instances);
  }
  
  /**
   * Scatter objects on a surface geometry
   */
  scatterOnSurface(
    geometry: BufferGeometry,
    transform: Matrix4,
    activeBiome?: string
  ): ScatterResult {
    const startTime = performance.now();
    
    if (!geometry.attributes.position) {
      return {
        success: false,
        instances: [],
        rejectedCount: 0,
        computationTime: 0,
        statistics: {
          averageDensity: 0,
          coverageArea: 0,
          boundingBox: new Box3()
        }
      };
    }
    
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal?.array;
    const triangles: Triangle[] = [];
    
    // Extract triangles from geometry
    for (let i = 0; i < positions.length; i += 9) {
      const v0 = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const v1 = new Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
      const v2 = new Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);
      
      const triangle = new Triangle(v0, v1, v2);
      triangle.a.applyMatrix4(transform);
      triangle.b.applyMatrix4(transform);
      triangle.c.applyMatrix4(transform);
      triangles.push(triangle);
    }
    
    // Calculate surface area
    let totalArea = 0;
    for (const triangle of triangles) {
      totalArea += triangle.getArea();
    }
    
    // Generate sample points based on mode
    const samplePoints = this.generateSamplePoints(totalArea, triangles);
    
    // Create instances
    const newInstances: ScatterInstance[] = [];
    let rejectedCount = 0;
    const selectedObjects = this.selectObjectsForBiome(activeBiome);
    
    for (const sample of samplePoints) {
      // Find closest triangle
      let closestTriangle: Triangle | null = null;
      let closestDist = Infinity;
      
      for (const triangle of triangles) {
        const point = triangle.closestPointToPoint(sample, false);
        const dist = point.distanceTo(sample);
        
        if (dist < closestDist) {
          closestDist = dist;
          closestTriangle = triangle;
        }
      }
      
      if (!closestTriangle || closestDist > this.rules.maxDistance) {
        rejectedCount++;
        continue;
      }
      
      // Get point on surface
      const surfacePoint = closestTriangle.closestPointToPoint(sample, true);
      const normal = closestTriangle.getNormal(new Vector3());
      
      // Validate placement
      if (!this.validatePlacement(surfacePoint, normal, triangles)) {
        rejectedCount++;
        continue;
      }
      
      // Select random object
      const scatterObj = this.selectRandomObject(selectedObjects);
      if (!scatterObj) {
        rejectedCount++;
        continue;
      }
      
      // Calculate transform
      const rotation = this.calculateRotation(normal, scatterObj.id);
      const scale = this.calculateScale(scatterObj.id);
      
      const instance: ScatterInstance = {
        id: generateInstanceId(),
        position: surfacePoint,
        rotation,
        scale,
        objectId: scatterObj.id,
        metadata: {
          slope: calculateSlope(normal, this.rules.alignUpVector),
          height: surfacePoint.y,
          custom: {}
        }
      };
      
      newInstances.push(instance);
      this.instances.set(instance.id, instance);
      this.currentPositions.push(surfacePoint);
    }
    
    const computationTime = performance.now() - startTime;
    
    // Calculate statistics
    const allPositions = newInstances.map(i => i.position);
    const boundingBox = allPositions.length > 0
      ? new Box3().setFromPoints(allPositions)
      : new Box3();
    
    const coverageArea = totalArea > 0 ? newInstances.length / totalArea : 0;
    
    return {
      success: newInstances.length > 0,
      instances: newInstances,
      rejectedCount,
      computationTime,
      statistics: {
        averageDensity: newInstances.length / (totalArea || 1),
        coverageArea: totalArea,
        boundingBox
      }
    };
  }
  
  /**
   * Scatter objects on a terrain with height map
   */
  scatterOnTerrain(
    width: number,
    depth: number,
    heightFunction: (x: number, z: number) => number,
    normalFunction?: (x: number, z: number) => Vector3
  ): ScatterResult {
    const startTime = performance.now();
    
    // Generate sample points
    const samplePoints = this.generateSamplePoints(width * depth);
    
    const newInstances: ScatterInstance[] = [];
    let rejectedCount = 0;
    
    for (const sample of samplePoints) {
      const x = sample.x;
      const z = sample.y;
      
      // Check bounds
      if (x < 0 || x > width || z < 0 || z > depth) {
        rejectedCount++;
        continue;
      }
      
      // Get height
      const y = heightFunction(x, z);
      const position = new Vector3(x, y, z);
      
      // Validate placement
      if (!this.validatePlacement(position, new Vector3(0, 1, 0))) {
        rejectedCount++;
        continue;
      }
      
      // Get normal
      const normal = normalFunction?.(x, z) || new Vector3(0, 1, 0);
      
      // Select random object
      const scatterObj = this.selectRandomObject();
      if (!scatterObj) {
        rejectedCount++;
        continue;
      }
      
      // Calculate transform
      const rotation = this.calculateRotation(normal, scatterObj.id);
      const scale = this.calculateScale(scatterObj.id);
      
      const instance: ScatterInstance = {
        id: generateInstanceId(),
        position,
        rotation,
        scale,
        objectId: scatterObj.id,
        metadata: {
          slope: calculateSlope(normal, this.rules.alignUpVector),
          height: y,
          custom: {}
        }
      };
      
      newInstances.push(instance);
      this.instances.set(instance.id, instance);
      this.currentPositions.push(position);
    }
    
    const computationTime = performance.now() - startTime;
    
    const allPositions = newInstances.map(i => i.position);
    const boundingBox = allPositions.length > 0
      ? new Box3().setFromPoints(allPositions)
      : new Box3();
    
    return {
      success: newInstances.length > 0,
      instances: newInstances,
      rejectedCount,
      computationTime,
      statistics: {
        averageDensity: newInstances.length / (width * depth),
        coverageArea: width * depth,
        boundingBox
      }
    };
  }
  
  /**
   * Create an InstancedMesh from scattered instances
   */
  createInstancedMesh(
    baseGeometry: BufferGeometry,
    material: any,
    objectIds?: string[]
  ): InstancedMesh {
    const filteredInstances = objectIds
      ? Array.from(this.instances.values()).filter(i => objectIds.includes(i.objectId))
      : Array.from(this.instances.values());
    
    const instancedMesh = new InstancedMesh(
      baseGeometry,
      material,
      filteredInstances.length
    );
    
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    
    for (let i = 0; i < filteredInstances.length; i++) {
      const instance = filteredInstances[i];
      
      matrix.compose(instance.position, instance.rotation, instance.scale);
      instancedMesh.setMatrixAt(i, matrix);
    }
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    
    return instancedMesh;
  }
  
  /**
   * Remove instances in a region
   */
  removeInstancesInRegion(region: Box3 | Sphere): number {
    let removed = 0;
    
    for (const [id, instance] of this.instances.entries()) {
      if (region instanceof Box3 && region.containsPoint(instance.position)) {
        this.instances.delete(id);
        removed++;
      } else if (region instanceof Sphere && region.containsPoint(instance.position)) {
        this.instances.delete(id);
        removed++;
      }
    }
    
    // Update current positions
    this.currentPositions = Array.from(this.instances.values()).map(i => i.position);
    
    return removed;
  }
  
  /**
   * Get statistics
   */
  getStatistics(): {
    totalInstances: number;
    objectsPerType: Map<string, number>;
    averageScale: Vector3;
    boundingBox: Box3;
  } {
    const instances = Array.from(this.instances.values());
    const objectsPerType = new Map<string, number>();
    let totalScale = new Vector3();
    
    for (const instance of instances) {
      objectsPerType.set(
        instance.objectId,
        (objectsPerType.get(instance.objectId) || 0) + 1
      );
      totalScale.add(instance.scale);
    }
    
    const averageScale = instances.length > 0
      ? totalScale.divideScalar(instances.length)
      : new Vector3();
    
    const allPositions = instances.map(i => i.position);
    const boundingBox = allPositions.length > 0
      ? new Box3().setFromPoints(allPositions)
      : new Box3();
    
    return {
      totalInstances: instances.length,
      objectsPerType,
      averageScale,
      boundingBox
    };
  }
  
  /**
   * Export instances to JSON
   */
  exportToJSON(): string {
    const data = {
      config: this.config,
      rules: this.rules,
      instances: Array.from(this.instances.values()).map(i => ({
        id: i.id,
        position: [i.position.x, i.position.y, i.position.z],
        rotation: [i.rotation.x, i.rotation.y, i.rotation.z, i.rotation.w],
        scale: [i.scale.x, i.scale.y, i.scale.z],
        objectId: i.objectId,
        metadata: i.metadata
      }))
    };
    
    return JSON.stringify(data, null, 2);
  }
  
  /**
   * Import instances from JSON
   */
  importFromJSON(json: string): void {
    const data = JSON.parse(json);
    
    this.config = { ...this.config, ...data.config };
    this.rules = { ...this.rules, ...data.rules };
    
    this.instances.clear();
    this.currentPositions = [];
    
    for (const instanceData of data.instances) {
      const instance: ScatterInstance = {
        ...instanceData,
        position: new Vector3(...instanceData.position),
        rotation: new Quaternion(...instanceData.rotation),
        scale: new Vector3(...instanceData.scale)
      };
      
      this.instances.set(instance.id, instance);
      this.currentPositions.push(instance.position);
    }
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  /**
   * Generate sample points based on configured mode
   */
  private generateSamplePoints(area: number, triangles?: Triangle[]): Vector2[] {
    const points: Vector2[] = [];
    
    switch (this.config.mode) {
      case 'poisson':
        const width = Math.sqrt(area);
        const height = area / width;
        const poissonPoints = poissonDiskSampling(
          width,
          height,
          this.config.poissonRadius!,
          30,
          this.seed
        );
        points.push(...poissonPoints);
        break;
        
      case 'random':
        for (let i = 0; i < this.config.count; i++) {
          points.push(new Vector2(
            Math.random() * (triangles ? 100 : area),
            Math.random() * (triangles ? 100 : area)
          ));
        }
        break;
        
      case 'grid':
        const gridSize = this.config.gridSize!;
        const cols = Math.ceil(area / gridSize);
        for (let x = 0; x < cols; x++) {
          for (let y = 0; y < cols; y++) {
            if (Math.random() < 0.7) { // 70% fill rate
              points.push(new Vector2(x * gridSize, y * gridSize));
            }
          }
        }
        break;
    }
    
    return points;
  }
  
  /**
   * Select objects based on biome
   */
  private selectObjectsForBiome(biomeId?: string): ScatterObject[] {
    if (!biomeId) {
      return Array.from(this.objects.values());
    }
    
    const biome = this.biomes.get(biomeId);
    if (!biome) {
      return Array.from(this.objects.values());
    }
    
    const selected: ScatterObject[] = [];
    for (const objSpec of biome.objects) {
      const obj = this.objects.get(objSpec.objectId);
      if (obj) {
        selected.push({ ...obj, weight: objSpec.weight });
      }
    }
    
    return selected;
  }
  
  /**
   * Select a random object based on weights
   */
  private selectRandomObject(objects?: ScatterObject[]): ScatterObject | null {
    const pool = objects || Array.from(this.objects.values());
    if (pool.length === 0) return null;
    
    const totalWeight = pool.reduce((sum, obj) => sum + obj.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const obj of pool) {
      random -= obj.weight;
      if (random <= 0) {
        return obj;
      }
    }
    
    return pool[pool.length - 1];
  }
  
  /**
   * Validate placement against rules
   */
  private validatePlacement(
    position: Vector3,
    normal: Vector3,
    triangles?: Triangle[]
  ): boolean {
    // Check height range
    if (position.y < this.rules.heightRange.min || position.y > this.rules.heightRange.max) {
      return false;
    }
    
    // Check slope
    const slope = calculateSlope(normal, this.rules.alignUpVector);
    if (slope > this.rules.slopeLimit) {
      return false;
    }
    
    // Check exclusion zones
    if (this.rules.exclusionZones && isInExclusionZone(position, this.rules.exclusionZones)) {
      return false;
    }
    
    // Check inclusion zones
    if (this.rules.inclusionZones && !isInInclusionZone(position, this.rules.inclusionZones)) {
      return false;
    }
    
    // Check minimum distance from other instances
    if (this.rules.minDistance > 0 && isTooClose(position, this.currentPositions, this.rules.minDistance)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Calculate rotation for an instance
   */
  private calculateRotation(normal: Vector3, objectId: string): Quaternion {
    let rotation: Quaternion;
    
    if (this.config.alignment === 'normal' && this.rules.alignToNormal) {
      rotation = alignToNormal(this.rules.alignUpVector, normal);
    } else if (this.config.alignment === 'look_at' && this.config.lookAtTarget) {
      rotation = new Quaternion().setFromUnitVectors(
        new Vector3(0, 0, 1),
        new Vector3().subVectors(this.config.lookAtTarget, new Vector3()).normalize()
      );
    } else if (this.config.alignment === 'random') {
      rotation = randomQuaternion(
        this.config.randomRotation.minYaw,
        this.config.randomRotation.maxYaw,
        this.config.randomRotation.minPitch,
        this.config.randomRotation.maxPitch,
        this.config.randomRotation.minRoll,
        this.config.randomRotation.maxRoll
      );
    } else {
      rotation = new Quaternion();
    }
    
    // Apply random rotation if enabled
    if (this.config.randomRotation.enabled && this.config.alignment !== 'random') {
      const randomRot = randomQuaternion(
        this.config.randomRotation.minYaw,
        this.config.randomRotation.maxYaw,
        this.config.randomRotation.minPitch,
        this.config.randomRotation.maxPitch,
        this.config.randomRotation.minRoll,
        this.config.randomRotation.maxRoll
      );
      rotation.multiply(randomRot);
    }
    
    return rotation.normalize();
  }
  
  /**
   * Calculate scale for an instance
   */
  private calculateScale(objectId: string): Vector3 {
    const obj = this.objects.get(objectId);
    
    if (!this.config.randomScale.enabled || !obj) {
      return new Vector3(1, 1, 1);
    }
    
    const minScale = obj.minScale || this.config.randomScale.min;
    const maxScale = obj.maxScale || this.config.randomScale.max;
    
    return new Vector3(
      MathUtils.randFloat(minScale.x, maxScale.x),
      MathUtils.randFloat(minScale.y, maxScale.y),
      MathUtils.randFloat(minScale.z, maxScale.z)
    );
  }
}

export default InstanceScatterSystem;
