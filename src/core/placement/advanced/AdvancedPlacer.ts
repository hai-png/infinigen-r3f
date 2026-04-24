/**
 * Advanced Placement System for InfiniGen R3F
 * 
 * Provides sophisticated object placement algorithms including:
 * - Poisson Disk Sampling for blue-noise distribution
 * - Relaxation algorithms for even spacing
 * - Surface projection with alignment
 * - Collision avoidance and semantic filtering
 * - Constraint-based placement validation
 */

import { Vector3, Raycaster, Mesh, BufferGeometry, Matrix4 } from 'three';
import { BBox } from '../util/math/bbox';
import { TagQuery } from '../tags';

// ============================================================================
// Configuration Types
// ============================================================================

export interface PlacementConfig {
  /** Minimum distance between placed objects (for Poisson disk) */
  minDistance: number;
  /** Maximum attempts to place an object before giving up */
  maxAttempts: number;
  /** Grid cell size for spatial acceleration */
  gridSize: number;
  /** Whether to align objects to surface normals */
  alignToSurface: boolean;
  /** Whether to avoid collisions with existing objects */
  avoidCollisions: boolean;
  /** Margin for collision avoidance */
  collisionMargin: number;
  /** Semantic tags that must be present on target surfaces */
  requiredSurfaceTags?: TagQuery;
  /** Semantic tags that must NOT be present on target surfaces */
  forbiddenSurfaceTags?: TagQuery;
  /** Height range for valid placement */
  heightRange?: [number, number];
  /** Slope tolerance in radians (0 = flat only, PI/2 = any slope) */
  maxSlope: number;
}

export interface PlacementCandidate {
  position: Vector3;
  normal: Vector3;
  surfaceTag: string | null;
  score: number;
}

export interface PlacementResult {
  success: boolean;
  position: Vector3 | null;
  rotation: Vector3 | null;
  reason?: string;
}

// ============================================================================
// Poisson Disk Sampling Implementation
// ============================================================================

/**
 * Implements Bridson's algorithm for Poisson disk sampling
 * Generates points with minimum separation distance
 */
export class PoissonDiskSampler {
  private width: number;
  private height: number;
  private depth: number;
  private radius: number;
  private cellSize: number;
  private grid: Map<string, number>;
  private samples: Vector3[];
  private activeList: number[];

  constructor(width: number, height: number, depth: number, radius: number) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.radius = radius;
    this.cellSize = radius / Math.sqrt(3);
    this.grid = new Map();
    this.samples = [];
    this.activeList = [];
  }

  /**
   * Generate Poisson disk distributed points
   * @param numPoints Target number of points (may generate more/fewer)
   * @returns Array of sampled positions
   */
  sample(numPoints: number): Vector3[] {
    this.grid.clear();
    this.samples = [];
    this.activeList = [];

    // Start with a random point
    const firstPoint = new Vector3(
      Math.random() * this.width,
      Math.random() * this.height,
      Math.random() * this.depth
    );
    this.addSample(firstPoint);

    let attempts = 0;
    const maxAttempts = numPoints * 100;

    while (this.samples.length < numPoints && attempts < maxAttempts) {
      if (this.activeList.length === 0) {
        // Re-seed if no active points
        const seedPoint = new Vector3(
          Math.random() * this.width,
          Math.random() * this.height,
          Math.random() * this.depth
        );
        this.addSample(seedPoint);
      }

      // Pick a random active point
      const activeIndex = Math.floor(Math.random() * this.activeList.length);
      const point = this.samples[this.activeList[activeIndex]];

      // Try to generate k points around it
      let found = false;
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const zAngle = Math.random() * Math.PI;
        const r = this.radius * (1 + Math.random());

        const newX = point.x + r * Math.sin(zAngle) * Math.cos(angle);
        const newY = point.y + r * Math.sin(zAngle) * Math.sin(angle);
        const newZ = point.z + r * Math.cos(zAngle);

        if (
          newX >= 0 && newX < this.width &&
          newY >= 0 && newY < this.height &&
          newZ >= 0 && newZ < this.depth
        ) {
          const candidate = new Vector3(newX, newY, newZ);
          
          if (this.isValid(candidate)) {
            this.addSample(candidate);
            found = true;
            break;
          }
        }
      }

      // Remove from active list if no valid points found after k attempts
      if (!found) {
        this.activeList.splice(activeIndex, 1);
      }

      attempts++;
    }

    return this.samples;
  }

  private addSample(point: Vector3): void {
    this.samples.push(point);
    this.activeList.push(this.samples.length - 1);
    
    const cell = this.gridKey(point);
    this.grid.set(cell, this.samples.length - 1);
  }

  private isValid(point: Vector3): boolean {
    const cell = this.gridKey(point);
    const [cx, cy, cz] = cell.split(',').map(Number);

    // Check neighboring cells
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          const neighborCell = `${cx + dx},${cy + dy},${cz + dz}`;
          const neighborIndex = this.grid.get(neighborCell);
          
          if (neighborIndex !== undefined) {
            const neighbor = this.samples[neighborIndex];
            if (point.distanceToSquared(neighbor) < this.radius * this.radius) {
              return false;
            }
          }
        }
      }
    }

    return true;
  }

  private gridKey(point: Vector3): string {
    const x = Math.floor(point.x / this.cellSize);
    const y = Math.floor(point.y / this.cellSize);
    const z = Math.floor(point.z / this.cellSize);
    return `${x},${y},${z}`;
  }
}

// ============================================================================
// Lloyd's Relaxation Algorithm
// ============================================================================

/**
 * Applies Lloyd's relaxation to evenly distribute points
 * Uses Voronoi-like iteration to move points toward centroid of their region
 */
export class RelaxationSolver {
  private points: Vector3[];
  private bounds: BBox;
  private k: number; // Number of iterations

  constructor(points: Vector3[], bounds: BBox, iterations: number = 5) {
    this.points = points.map(p => p.clone());
    this.bounds = bounds;
    this.k = iterations;
  }

  /**
   * Run relaxation iterations
   * @returns Relaxed point positions
   */
  relax(): Vector3[] {
    for (let iter = 0; iter < this.k; iter++) {
      this.relaxationStep();
    }
    return this.points;
  }

  private relaxationStep(): void {
    const n = this.points.length;
    if (n === 0) return;

    // Build spatial grid for fast neighbor lookup
    const gridSize = Math.max(
      this.bounds.max.x - this.bounds.min.x,
      this.bounds.max.y - this.bounds.min.y,
      this.bounds.max.z - this.bounds.min.z
    ) / Math.sqrt(n);

    const grid = new Map<string, number[]>();
    
    for (let i = 0; i < n; i++) {
      const key = this.gridKey(this.points[i], gridSize);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(i);
    }

    // Move each point toward centroid of neighbors
    for (let i = 0; i < n; i++) {
      const point = this.points[i];
      const neighbors = this.getNeighbors(point, grid, gridSize);
      
      if (neighbors.length === 0) continue;

      // Calculate centroid
      const centroid = new Vector3(0, 0, 0);
      for (const idx of neighbors) {
        centroid.add(this.points[idx]);
      }
      centroid.divideScalar(neighbors.length);

      // Move point toward centroid (weighted average)
      const alpha = 0.5; // Relaxation factor
      point.lerpVectors(point, centroid, alpha);

      // Clamp to bounds
      point.x = Math.max(this.bounds.min.x, Math.min(this.bounds.max.x, point.x));
      point.y = Math.max(this.bounds.min.y, Math.min(this.bounds.max.y, point.y));
      point.z = Math.max(this.bounds.min.z, Math.min(this.bounds.max.z, point.z));
    }
  }

  private getNeighbors(
    point: Vector3,
    grid: Map<string, number[]>,
    gridSize: number
  ): number[] {
    const key = this.gridKey(point, gridSize);
    const [cx, cy, cz] = key.split(',').map(Number);
    const neighbors: number[] = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighborKey = `${cx + dx},${cy + dy},${cz + dz}`;
          const indices = grid.get(neighborKey);
          if (indices) {
            neighbors.push(...indices);
          }
        }
      }
    }

    return neighbors;
  }

  private gridKey(point: Vector3, gridSize: number): string {
    const x = Math.floor((point.x - this.bounds.min.x) / gridSize);
    const y = Math.floor((point.y - this.bounds.min.y) / gridSize);
    const z = Math.floor((point.z - this.bounds.min.z) / gridSize);
    return `${x},${y},${z}`;
  }
}

// ============================================================================
// Surface Projection & Alignment
// ============================================================================

export interface SurfaceHit {
  position: Vector3;
  normal: Vector3;
  distance: number;
  object: Mesh | null;
  tag: string | null;
}

/**
 * Projects points onto surfaces and aligns them properly
 */
export class SurfaceProjector {
  private raycaster: Raycaster;
  private meshes: Mesh[];

  constructor(meshes: Mesh[] = []) {
    this.raycaster = new Raycaster();
    this.meshes = meshes;
  }

  addMesh(mesh: Mesh): void {
    this.meshes.push(mesh);
  }

  clearMeshes(): void {
    this.meshes = [];
  }

  /**
   * Project a point downward onto the nearest surface
   * @param point Starting point
   * @param maxDistance Maximum ray distance
   * @returns Hit information or null if no surface found
   */
  projectDown(point: Vector3, maxDistance: number = 10): SurfaceHit | null {
    const origin = point.clone();
    const direction = new Vector3(0, -1, 0);

    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDistance;

    const intersects = this.raycaster.intersectObjects(this.meshes, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        position: hit.point.clone(),
        normal: hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) || new Vector3(0, 1, 0),
        distance: hit.distance,
        object: hit.object as Mesh,
        tag: this.getObjectTag(hit.object)
      };
    }

    return null;
  }

  /**
   * Project a point in a custom direction
   */
  project(point: Vector3, direction: Vector3, maxDistance: number = 10): SurfaceHit | null {
    this.raycaster.set(point, direction);
    this.raycaster.far = maxDistance;

    const intersects = this.raycaster.intersectObjects(this.meshes, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        position: hit.point.clone(),
        normal: hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) || direction.clone().negate(),
        distance: hit.distance,
        object: hit.object as Mesh,
        tag: this.getObjectTag(hit.object)
      };
    }

    return null;
  }

  /**
   * Calculate rotation matrix to align object to surface normal
   * @param upVector Object's local up vector (default: Y-up)
   * @param targetNormal Surface normal to align to
   * @returns Rotation matrix
   */
  calculateAlignment(upVector: Vector3 = new Vector3(0, 1, 0), targetNormal: Vector3): Matrix4 {
    const matrix = new Matrix4();
    
    // Ensure normal is normalized
    const normal = targetNormal.clone().normalize();
    
    // Calculate rotation quaternion to align up vector with normal
    const v0 = upVector.clone().normalize();
    const v1 = normal;
    
    const dot = v0.dot(v1);
    const cross = new Vector3();
    
    if (Math.abs(dot - 1) < 1e-6) {
      // Vectors are parallel, no rotation needed
      return matrix.identity();
    } else if (Math.abs(dot + 1) < 1e-6) {
      // Vectors are opposite, rotate 180 degrees around arbitrary axis
      const axis = new Vector3(1, 0, 0).cross(v0);
      if (axis.lengthSq() < 1e-6) {
        axis.set(0, 0, 1).cross(v0);
      }
      axis.normalize();
      matrix.makeRotationAxis(axis, Math.PI);
    } else {
      // Standard case: rotate around cross product
      cross.crossVectors(v0, v1).normalize();
      const angle = Math.acos(dot);
      matrix.makeRotationAxis(cross, angle);
    }
    
    return matrix;
  }

  private getObjectTag(object: any): string | null {
    // Extract tag from object userData
    if (object.userData?.tag) {
      return object.userData.tag;
    }
    return null;
  }
}

// ============================================================================
// Collision Avoidance System
// ============================================================================

export interface CollisionShape {
  type: 'sphere' | 'box' | 'capsule';
  position: Vector3;
  size: Vector3 | number; // radius for sphere, dimensions for box/capsule
}

/**
 * Detects and resolves collisions during placement
 */
export class CollisionAvoidance {
  private shapes: CollisionShape[];
  private margin: number;

  constructor(margin: number = 0.1) {
    this.shapes = [];
    this.margin = margin;
  }

  addShape(shape: CollisionShape): void {
    this.shapes.push(shape);
  }

  clearShapes(): void {
    this.shapes = [];
  }

  /**
   * Check if a position collides with any existing shape
   * @param position Position to check
   * @param radius Radius of object at position
   * @returns True if collision detected
   */
  hasCollision(position: Vector3, radius: number): boolean {
    const effectiveRadius = radius + this.margin;

    for (const shape of this.shapes) {
      if (shape.type === 'sphere') {
        const dist = position.distanceTo(shape.position);
        if (dist < effectiveRadius + (shape.size as number)) {
          return true;
        }
      } else if (shape.type === 'box') {
        const size = shape.size as Vector3;
        const closest = new Vector3(
          Math.max(shape.position.x - size.x / 2, Math.min(position.x, shape.position.x + size.x / 2)),
          Math.max(shape.position.y - size.y / 2, Math.min(position.y, shape.position.y + size.y / 2)),
          Math.max(shape.position.z - size.z / 2, Math.min(position.z, shape.position.z + size.z / 2))
        );
        
        if (position.distanceTo(closest) < effectiveRadius) {
          return true;
        }
      } else if (shape.type === 'capsule') {
        // Simplified capsule collision (as sphere for now)
        const dist = position.distanceTo(shape.position);
        if (dist < effectiveRadius + (shape.size as number)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Find a non-colliding position near the target
   * @param target Desired position
   * @param radius Object radius
   * @param maxSearchRadius Maximum distance to search
   * @param maxAttempts Maximum placement attempts
   * @returns Non-colliding position or null
   */
  findValidPosition(
    target: Vector3,
    radius: number,
    maxSearchRadius: number = 2,
    maxAttempts: number = 50
  ): Vector3 | null {
    if (!this.hasCollision(target, radius)) {
      return target.clone();
    }

    // Spiral search pattern
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = (attempt / maxAttempts) * Math.PI * 2 * 3; // 3 rotations
      const ratio = attempt / maxAttempts;
      const searchRadius = ratio * maxSearchRadius;
      
      const offset = new Vector3(
        Math.cos(angle) * searchRadius,
        0,
        Math.sin(angle) * searchRadius
      );
      
      const candidate = target.clone().add(offset);
      
      if (!this.hasCollision(candidate, radius)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Add bounding box from mesh as collision shape
   */
  addMesh(mesh: Mesh): void {
    const bbox = new BBox();
    bbox.setFromObject(mesh);
    
    const center = bbox.getCenter(new Vector3());
    const size = bbox.getSize(new Vector3());
    
    this.addShape({
      type: 'box',
      position: center,
      size: size
    });
  }
}

// ============================================================================
// Semantic Filtering
// ============================================================================

/**
 * Filters placement candidates based on semantic constraints
 */
export class SemanticFilter {
  private requiredTags: Set<string>;
  private forbiddenTags: Set<string>;

  constructor() {
    this.requiredTags = new Set();
    this.forbiddenTags = new Set();
  }

  addRequiredTag(tag: string): void {
    this.requiredTags.add(tag);
  }

  addForbiddenTag(tag: string): void {
    this.forbiddenTags.add(tag);
  }

  clear(): void {
    this.requiredTags.clear();
    this.forbiddenTags.clear();
  }

  /**
   * Test if a surface meets semantic requirements
   * @param surfaceTags Tags present on the surface
   * @returns True if surface passes all filters
   */
  test(surfaceTags: string[]): boolean {
    const tagSet = new Set(surfaceTags);

    // Check required tags
    for (const tag of this.requiredTags) {
      if (!tagSet.has(tag)) {
        return false;
      }
    }

    // Check forbidden tags
    for (const tag of this.forbiddenTags) {
      if (tagSet.has(tag)) {
        return false;
      }
    }

    return true;
  }
}

// ============================================================================
// Main Advanced Placer Class
// ============================================================================

export interface AdvancedPlacementOptions {
  config: PlacementConfig;
  bounds: BBox;
  targetCount: number;
  meshes?: Mesh[];
  existingPositions?: Vector3[];
}

export class AdvancedPlacer {
  private config: PlacementConfig;
  private bounds: BBox;
  private projector: SurfaceProjector;
  private collider: CollisionAvoidance;
  private filter: SemanticFilter;

  constructor(options: AdvancedPlacementOptions) {
    this.config = options.config;
    this.bounds = options.bounds;
    this.projector = new SurfaceProjector(options.meshes || []);
    this.collider = new CollisionAvoidance(this.config.collisionMargin);
    this.filter = new SemanticFilter();

    // Initialize filters from config
    if (options.existingPositions) {
      for (const pos of options.existingPositions) {
        this.collider.addShape({
          type: 'sphere',
          position: pos,
          size: this.config.minDistance / 2
        });
      }
    }
  }

  /**
   * Generate advanced placements using multiple strategies
   * @returns Array of valid placement positions
   */
  async generatePlacements(): Promise<Vector3[]> {
    const positions: Vector3[] = [];

    // Step 1: Generate initial Poisson disk samples
    const sampler = new PoissonDiskSampler(
      this.bounds.max.x - this.bounds.min.x,
      this.bounds.max.y - this.bounds.min.y,
      this.bounds.max.z - this.bounds.min.z,
      this.config.minDistance
    );

    const samples = sampler.sample(this.targetCount * 2);

    // Step 2: Apply relaxation for better distribution
    const relaxer = new RelaxationSolver(samples, this.bounds, 3);
    const relaxedSamples = relaxer.relax();

    // Step 3: Project to surfaces and validate
    for (const sample of relaxedSamples) {
      if (positions.length >= this.targetCount) break;

      const worldPos = sample.clone().add(new Vector3(
        this.bounds.min.x,
        this.bounds.min.y,
        this.bounds.min.z
      ));

      // Project down to surface
      const hit = await this.projectToSurface(worldPos);
      
      if (!hit) continue;

      // Check height constraints
      if (this.config.heightRange) {
        if (hit.position.y < this.config.heightRange[0] || 
            hit.position.y > this.config.heightRange[1]) {
          continue;
        }
      }

      // Check slope constraint
      const slope = Math.acos(hit.normal.dot(new Vector3(0, 1, 0)));
      if (slope > this.config.maxSlope) {
        continue;
      }

      // Check semantic constraints
      if (hit.tag && !this.filter.test([hit.tag])) {
        continue;
      }

      // Check collision
      if (this.config.avoidCollisions) {
        if (this.collider.hasCollision(hit.position, this.config.minDistance / 2)) {
          // Try to find nearby valid position
          const validPos = this.collider.findValidPosition(
            hit.position,
            this.config.minDistance / 2
          );
          
          if (validPos) {
            positions.push(validPos);
          }
        } else {
          positions.push(hit.position.clone());
        }
      } else {
        positions.push(hit.position.clone());
      }
    }

    return positions;
  }

  private async projectToSurface(point: Vector3): Promise<SurfaceHit | null> {
    return this.projector.projectDown(point, 10);
  }

  /**
   * Calculate optimal placement for a single object
   */
  async placeSingle(
    preferredPosition: Vector3,
    objectRadius: number
  ): Promise<PlacementResult> {
    let attempts = 0;
    let currentPos = preferredPosition.clone();

    while (attempts < this.config.maxAttempts) {
      // Project to surface
      const hit = await this.projectToSurface(currentPos);
      
      if (!hit) {
        attempts++;
        currentPos = this.getRandomOffset(currentPos, attempts * 0.5);
        continue;
      }

      // Validate constraints
      if (this.config.heightRange) {
        if (hit.position.y < this.config.heightRange[0] || 
            hit.position.y > this.config.heightRange[1]) {
          attempts++;
          currentPos = this.getRandomOffset(currentPos, 1);
          continue;
        }
      }

      // Check collision
      if (this.config.avoidCollisions && 
          this.collider.hasCollision(hit.position, objectRadius)) {
        const validPos = this.collider.findValidPosition(hit.position, objectRadius);
        if (validPos) {
          return {
            success: true,
            position: validPos,
            rotation: this.calculateRotation(hit.normal)
          };
        }
        attempts++;
        currentPos = this.getRandomOffset(currentPos, 1);
        continue;
      }

      // Success!
      return {
        success: true,
        position: hit.position,
        rotation: this.calculateRotation(hit.normal)
      };
    }

    return {
      success: false,
      position: null,
      rotation: null,
      reason: `Failed to find valid placement after ${attempts} attempts`
    };
  }

  private getRandomOffset(base: Vector3, radius: number): Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    return base.clone().add(new Vector3(
      Math.cos(angle) * r,
      0,
      Math.sin(angle) * r
    ));
  }

  private calculateRotation(normal: Vector3): Vector3 {
    if (!this.config.alignToSurface) {
      return new Vector3(0, 0, 0);
    }

    // Calculate Euler angles from normal
    const euler = new Vector3();
    
    // Simple approximation: rotate around X and Z to align Y with normal
    euler.x = Math.atan2(normal.z, normal.y);
    euler.z = -Math.atan2(normal.x, normal.y);
    euler.y = 0; // Keep original yaw
    
    return euler;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create default placement configuration
 */
export function createDefaultConfig(): PlacementConfig {
  return {
    minDistance: 0.5,
    maxAttempts: 100,
    gridSize: 0.25,
    alignToSurface: true,
    avoidCollisions: true,
    collisionMargin: 0.05,
    maxSlope: Math.PI / 4, // 45 degrees
  };
}

/**
 * Batch placement helper
 */
export async function batchPlace(
  count: number,
  bounds: BBox,
  options?: Partial<PlacementConfig>
): Promise<Vector3[]> {
  const config = { ...createDefaultConfig(), ...options };
  const placer = new AdvancedPlacer({
    config,
    bounds,
    targetCount: count
  });

  return placer.generatePlacements();
}
