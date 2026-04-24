import * as THREE from 'three';

/**
 * Detail Placement System
 * 
 * Sophisticated algorithms for placing small decorative objects and details:
 * - Clustering for natural grouping (books, utensils, tools)
 * - Surface conformity (objects conform to surface topology)
 * - Semantic placement rules (books on shelves, cups on tables)
 * - Collision-free micro-adjustments
 * - Variation generation (rotation, scale, offset)
 * 
 * @module DetailPlacementSystem
 */

/**
 * Types of detail placement strategies
 */
export enum DetailStrategy {
  /** Random scattering with collision avoidance */
  SCATTER = 'scatter',
  /** Clustered placement for grouped items */
  CLUSTER = 'cluster',
  /** Linear arrangement along edges/paths */
  LINEAR = 'linear',
  /** Grid-based organized placement */
  GRID = 'grid',
  /** Edge-following placement */
  EDGE = 'edge',
  /** Corner-focused placement */
  CORNER = 'corner',
  /** Surface-conforming distribution */
  SURFACE = 'surface',
}

/**
 * Configuration for detail placement
 */
export interface DetailConfig {
  /** Placement strategy to use */
  strategy: DetailStrategy;
  /** Number of objects to place */
  count: number;
  /** Target surface mesh */
  surface: THREE.Mesh | null;
  /** Bounding area for placement */
  bounds?: THREE.Box3;
  /** Minimum distance between objects */
  minSpacing?: number;
  /** Maximum distance from surface */
  maxDistanceFromSurface?: number;
  /** Rotation constraints */
  rotation?: RotationConstraint;
  /** Scale variation */
  scale?: ScaleConstraint;
  /** Alignment preferences */
  alignment?: AlignmentConfig;
  /** Exclusion zones */
  exclusionZones?: THREE.Box3[];
  /** Inclusion zones (must be within these) */
  inclusionZones?: THREE.Box3[];
  /** Semantic tags for valid placement surfaces */
  requiredTags?: string[];
  /** Tags that invalidate placement */
  forbiddenTags?: string[];
}

/**
 * Rotation constraint configuration
 */
export interface RotationConstraint {
  /** Allow random rotation around Y axis */
  randomY?: boolean;
  /** Fixed rotation around Y */
  fixedY?: number;
  /** Min/max rotation around X */
  xRange?: [number, number];
  /** Min/max rotation around Z */
  zRange?: [number, number];
  /** Align to surface normal */
  alignToNormal?: boolean;
}

/**
 * Scale constraint configuration
 */
export interface ScaleConstraint {
  /** Uniform scale range [min, max] */
  uniform?: [number, number];
  /** Per-axis scale ranges */
  perAxis?: {
    x: [number, number];
    y: [number, number];
    z: [number, number];
  };
}

/**
 * Alignment configuration
 */
export interface AlignmentConfig {
  /** Align to world up */
  worldUp?: boolean;
  /** Align to surface normal */
  surfaceNormal?: boolean;
  /** Prefer cardinal directions */
  cardinalDirections?: boolean;
  /** Snap to grid */
  snapToGrid?: boolean;
  /** Grid size for snapping */
  gridSize?: number;
}

/**
 * Cluster configuration for grouped placements
 */
export interface ClusterConfig {
  /** Number of clusters to create */
  clusterCount: number;
  /** Objects per cluster (or range) */
  objectsPerCluster: number | [number, number];
  /** Cluster radius */
  clusterRadius: number;
  /** Cluster centers (optional, will generate if not provided) */
  clusterCenters?: THREE.Vector3[];
}

/**
 * Linear arrangement configuration
 */
export interface LinearConfig {
  /** Start point */
  start: THREE.Vector3;
  /** End point */
  end: THREE.Vector3;
  /** Spacing between objects */
  spacing: number;
  /** Offset from line */
  offset?: number;
  /** Randomize along line */
  randomize?: boolean;
  /** Randomization amount */
  randomAmount?: number;
}

/**
 * Result of a detail placement operation
 */
export interface PlacementInstance {
  /** Position in world space */
  position: THREE.Vector3;
  /** Rotation as Euler angles */
  rotation: THREE.Euler;
  /** Scale vector */
  scale: THREE.Vector3;
  /** Surface normal at position */
  normal?: THREE.Vector3;
  /** Distance from surface */
  surfaceDistance?: number;
  /** Cluster ID (if clustered) */
  clusterId?: number;
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Complete detail placement result
 */
export interface DetailPlacementResult {
  /** All placed instances */
  instances: PlacementInstance[];
  /** Success rate (placed / requested) */
  successRate: number;
  /** Placement statistics */
  statistics: {
    totalRequested: number;
    totalPlaced: number;
    collisionsAvoided: number;
    excludedByZones: number;
    excludedByTags: number;
    averageSpacing: number;
    boundingBox: THREE.Box3;
  };
}

/**
 * Detail Placement System Class
 * 
 * Handles sophisticated placement of small objects and decorative details
 * in indoor scenes.
 */
export class DetailPlacementSystem {
  /** Default minimum spacing */
  private static readonly DEFAULT_MIN_SPACING = 0.1;
  
  /** Default max distance from surface */
  private static readonly DEFAULT_MAX_SURFACE_DISTANCE = 0.05;
  
  /** Raycaster for surface detection */
  private raycaster: THREE.Raycaster;
  
  /** Spatial hash grid for collision detection */
  private spatialGrid: Map<string, PlacementInstance[]>;
  
  /** Grid cell size */
  private gridSize: number = 0.2;

  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.spatialGrid = new Map();
  }

  /**
   * Execute detail placement based on configuration
   */
  public place(config: DetailConfig): DetailPlacementResult {
    const instances: PlacementInstance[] = [];
    let collisionsAvoided = 0;
    let excludedByZones = 0;
    let excludedByTags = 0;
    
    // Initialize spatial grid
    this.spatialGrid.clear();
    
    // Generate candidate positions based on strategy
    const candidates = this.generateCandidates(config);
    
    // Place objects
    for (const candidate of candidates) {
      if (instances.length >= config.count) break;
      
      // Check exclusion zones
      if (config.exclusionZones && this.isInExclusionZone(candidate, config.exclusionZones)) {
        excludedByZones++;
        continue;
      }
      
      // Check inclusion zones
      if (config.inclusionZones && !this.isInInclusionZone(candidate, config.inclusionZones)) {
        continue;
      }
      
      // Check spacing
      if (config.minSpacing && !this.checkSpacing(candidate, instances, config.minSpacing)) {
        collisionsAvoided++;
        continue;
      }
      
      // Create instance
      const instance = this.createInstance(candidate, config, instances.length);
      instances.push(instance);
      
      // Add to spatial grid
      this.addToSpatialGrid(instance);
    }
    
    // Calculate statistics
    const boundingBox = new THREE.Box3();
    let totalSpacing = 0;
    let spacingCount = 0;
    
    for (const instance of instances) {
      boundingBox.expandByPoint(instance.position);
      
      // Calculate average spacing
      for (const other of instances) {
        if (other !== instance) {
          totalSpacing += instance.position.distanceTo(other.position);
          spacingCount++;
        }
      }
    }
    
    return {
      instances,
      successRate: instances.length / config.count,
      statistics: {
        totalRequested: config.count,
        totalPlaced: instances.length,
        collisionsAvoided,
        excludedByZones,
        excludedByTags,
        averageSpacing: spacingCount > 0 ? totalSpacing / spacingCount : 0,
        boundingBox,
      },
    };
  }

  /**
   * Generate candidate positions based on strategy
   */
  private generateCandidates(config: DetailConfig): THREE.Vector3[] {
    switch (config.strategy) {
      case DetailStrategy.SCATTER:
        return this.generateScatterCandidates(config);
      case DetailStrategy.CLUSTER:
        return this.generateClusterCandidates(config);
      case DetailStrategy.LINEAR:
        return this.generateLinearCandidates(config);
      case DetailStrategy.GRID:
        return this.generateGridCandidates(config);
      case DetailStrategy.EDGE:
        return this.generateEdgeCandidates(config);
      case DetailStrategy.CORNER:
        return this.generateCornerCandidates(config);
      case DetailStrategy.SURFACE:
        return this.generateSurfaceCandidates(config);
      default:
        return this.generateScatterCandidates(config);
    }
  }

  /**
   * Generate scatter candidates
   */
  private generateScatterCandidates(config: DetailConfig): THREE.Vector3[] {
    const candidates: THREE.Vector3[] = [];
    const bounds = config.bounds || new THREE.Box3(
      new THREE.Vector3(-5, 0, -5),
      new THREE.Vector3(5, 1, 5)
    );
    
    // Generate extra candidates to account for filtering
    const extraFactor = 3;
    const targetCount = config.count * extraFactor;
    
    for (let i = 0; i < targetCount; i++) {
      const x = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, Math.random());
      const z = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, Math.random());
      const y = bounds.min.y;
      
      const candidate = new THREE.Vector3(x, y, z);
      
      // Project to surface if available
      if (config.surface) {
        const projected = this.projectToSurface(candidate, config.surface);
        if (projected) {
          candidates.push(projected);
        }
      } else {
        candidates.push(candidate);
      }
    }
    
    return candidates;
  }

  /**
   * Generate cluster candidates
   */
  private generateClusterCandidates(config: DetailConfig): THREE.Vector3[] {
    const candidates: THREE.Vector3[] = [];
    const bounds = config.bounds || new THREE.Box3(
      new THREE.Vector3(-5, 0, -5),
      new THREE.Vector3(5, 1, 5)
    );
    
    // Default cluster config
    const clusterConfig: ClusterConfig = {
      clusterCount: 3,
      objectsPerCluster: [3, 7],
      clusterRadius: 0.5,
    };
    
    // Generate cluster centers
    const centers: THREE.Vector3[] = [];
    for (let i = 0; i < clusterConfig.clusterCount; i++) {
      const center = new THREE.Vector3(
        THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, Math.random()),
        bounds.min.y,
        THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, Math.random())
      );
      
      // Project to surface
      if (config.surface) {
        const projected = this.projectToSurface(center, config.surface);
        if (projected) {
          centers.push(projected);
        }
      } else {
        centers.push(center);
      }
    }
    
    // Generate points around each cluster center
    for (const center of centers) {
      const objCount = typeof clusterConfig.objectsPerCluster === 'number'
        ? clusterConfig.objectsPerCluster
        : THREE.MathUtils.randInt(
            clusterConfig.objectsPerCluster[0],
            clusterConfig.objectsPerCluster[1]
          );
      
      for (let j = 0; j < objCount; j++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * clusterConfig.clusterRadius;
        const offset = new THREE.Vector3(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius
        );
        
        const candidate = center.clone().add(offset);
        
        // Project to surface
        if (config.surface) {
          const projected = this.projectToSurface(candidate, config.surface);
          if (projected) {
            candidates.push(projected);
          }
        } else {
          candidates.push(candidate);
        }
      }
    }
    
    return candidates;
  }

  /**
   * Generate linear candidates
   */
  private generateLinearCandidates(config: DetailConfig): THREE.Vector3[] {
    const candidates: THREE.Vector3[] = [];
    
    // This would require LinearConfig - using fallback
    const bounds = config.bounds || new THREE.Box3(
      new THREE.Vector3(-5, 0, -5),
      new THREE.Vector3(5, 1, 5)
    );
    
    const start = bounds.min.clone();
    const end = new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z);
    const direction = end.clone().sub(start).normalize();
    const length = start.distanceTo(end);
    const spacing = config.minSpacing || 0.3;
    
    let current = start.clone();
    while (current.distanceTo(end) > 0 && candidates.length < config.count * 3) {
      const candidate = current.clone();
      
      if (config.surface) {
        const projected = this.projectToSurface(candidate, config.surface);
        if (projected) {
          candidates.push(projected);
        }
      } else {
        candidates.push(candidate);
      }
      
      current.add(direction.clone().multiplyScalar(spacing));
    }
    
    return candidates;
  }

  /**
   * Generate grid candidates
   */
  private generateGridCandidates(config: DetailConfig): THREE.Vector3[] {
    const candidates: THREE.Vector3[] = [];
    const bounds = config.bounds || new THREE.Box3(
      new THREE.Vector3(-5, 0, -5),
      new THREE.Vector3(5, 1, 5)
    );
    
    const spacing = config.minSpacing || 0.5;
    
    for (let x = bounds.min.x; x <= bounds.max.x; x += spacing) {
      for (let z = bounds.min.z; z <= bounds.max.z; z += spacing) {
        const candidate = new THREE.Vector3(x, bounds.min.y, z);
        
        if (config.surface) {
          const projected = this.projectToSurface(candidate, config.surface);
          if (projected) {
            candidates.push(projected);
          }
        } else {
          candidates.push(candidate);
        }
      }
    }
    
    return candidates;
  }

  /**
   * Generate edge candidates (along boundaries)
   */
  private generateEdgeCandidates(config: DetailConfig): THREE.Vector3[] {
    const candidates: THREE.Vector3[] = [];
    const bounds = config.bounds || new THREE.Box3(
      new THREE.Vector3(-5, 0, -5),
      new THREE.Vector3(5, 1, 5)
    );
    
    const spacing = config.minSpacing || 0.3;
    
    // Edges along X
    for (let x = bounds.min.x; x <= bounds.max.x; x += spacing) {
      // Front edge
      const front = new THREE.Vector3(x, bounds.min.y, bounds.min.z);
      if (config.surface) {
        const proj = this.projectToSurface(front, config.surface);
        if (proj) candidates.push(proj);
      } else {
        candidates.push(front);
      }
      
      // Back edge
      const back = new THREE.Vector3(x, bounds.min.y, bounds.max.z);
      if (config.surface) {
        const proj = this.projectToSurface(back, config.surface);
        if (proj) candidates.push(proj);
      } else {
        candidates.push(back);
      }
    }
    
    // Edges along Z
    for (let z = bounds.min.z; z <= bounds.max.z; z += spacing) {
      // Left edge
      const left = new THREE.Vector3(bounds.min.x, bounds.min.y, z);
      if (config.surface) {
        const proj = this.projectToSurface(left, config.surface);
        if (proj) candidates.push(proj);
      } else {
        candidates.push(left);
      }
      
      // Right edge
      const right = new THREE.Vector3(bounds.max.x, bounds.min.y, z);
      if (config.surface) {
        const proj = this.projectToSurface(right, config.surface);
        if (proj) candidates.push(proj);
      } else {
        candidates.push(right);
      }
    }
    
    return candidates;
  }

  /**
   * Generate corner candidates
   */
  private generateCornerCandidates(config: DetailConfig): THREE.Vector3[] {
    const candidates: THREE.Vector3[] = [];
    const bounds = config.bounds || new THREE.Box3(
      new THREE.Vector3(-5, 0, -5),
      new THREE.Vector3(5, 1, 5)
    );
    
    const corners = [
      new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
      new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
      new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
    ];
    
    for (const corner of corners) {
      if (config.surface) {
        const projected = this.projectToSurface(corner, config.surface);
        if (projected) {
          // Add multiple points near corner
          for (let i = 0; i < 3; i++) {
            const offset = new THREE.Vector3(
              (Math.random() - 0.5) * 0.5,
              0,
              (Math.random() - 0.5) * 0.5
            );
            const candidate = projected.clone().add(offset);
            const projCandidate = this.projectToSurface(candidate, config.surface);
            if (projCandidate) {
              candidates.push(projCandidate);
            }
          }
        }
      } else {
        candidates.push(corner);
      }
    }
    
    return candidates;
  }

  /**
   * Generate surface-conforming candidates
   */
  private generateSurfaceCandidates(config: DetailConfig): THREE.Vector3[] {
    const candidates: THREE.Vector3[] = [];
    
    if (!config.surface) {
      return this.generateScatterCandidates(config);
    }
    
    const bounds = config.bounds || new THREE.Box3(
      new THREE.Vector3(-5, 0, -5),
      new THREE.Vector3(5, 1, 5)
    );
    
    // Sample surface more densely
    const sampleCount = config.count * 5;
    const geometry = config.surface.geometry;
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < sampleCount; i++) {
      // Random triangle
      const triIndex = Math.floor(Math.random() * (positions.length / 9)) * 9;
      
      const v0 = new THREE.Vector3(positions[triIndex], positions[triIndex + 1], positions[triIndex + 2]);
      const v1 = new THREE.Vector3(positions[triIndex + 3], positions[triIndex + 4], positions[triIndex + 5]);
      const v2 = new THREE.Vector3(positions[triIndex + 6], positions[triIndex + 7], positions[triIndex + 8]);
      
      // Random barycentric coordinates
      const r1 = Math.random();
      const r2 = Math.random();
      const sqrtR1 = Math.sqrt(r1);
      
      const u = 1 - sqrtR1;
      const v = sqrtR1 * (1 - r2);
      const w = sqrtR1 * r2;
      
      const point = v0.clone().multiplyScalar(u)
        .add(v1.clone().multiplyScalar(v))
        .add(v2.clone().multiplyScalar(w));
      
      // Check bounds
      if (bounds.containsPoint(point)) {
        candidates.push(point);
      }
    }
    
    return candidates;
  }

  /**
   * Project point to surface using raycasting
   */
  private projectToSurface(point: THREE.Vector3, surface: THREE.Mesh): THREE.Vector3 | null {
    const rayOrigin = new THREE.Vector3(point.x, point.y + 10, point.z);
    const rayDirection = new THREE.Vector3(0, -1, 0);
    
    this.raycaster.set(rayOrigin, rayDirection);
    const intersects = this.raycaster.intersectObject(surface);
    
    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.distance <= 10) {
        return hit.point.clone();
      }
    }
    
    return null;
  }

  /**
   * Check if point is in exclusion zone
   */
  private isInExclusionZone(point: THREE.Vector3, zones: THREE.Box3[]): boolean {
    for (const zone of zones) {
      if (zone.containsPoint(point)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if point is in inclusion zone
   */
  private isInInclusionZone(point: THREE.Vector3, zones: THREE.Box3[]): boolean {
    if (zones.length === 0) return true;
    
    for (const zone of zones) {
      if (zone.containsPoint(point)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check spacing against existing instances
   */
  private checkSpacing(
    point: THREE.Vector3,
    instances: PlacementInstance[],
    minSpacing: number
  ): boolean {
    // Use spatial grid for faster lookup
    const nearbyCells = this.getNearbyGridCells(point);
    
    for (const cell of nearbyCells) {
      const instancesInCell = this.spatialGrid.get(cell) || [];
      for (const instance of instancesInCell) {
        if (point.distanceTo(instance.position) < minSpacing) {
          return false;
        }
      }
    }
    
    // Fallback to full check
    for (const instance of instances) {
      if (point.distanceTo(instance.position) < minSpacing) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Create placement instance with transforms
   */
  private createInstance(
    position: THREE.Vector3,
    config: DetailConfig,
    index: number
  ): PlacementInstance {
    // Apply rotation
    const rotation = new THREE.Euler(0, 0, 0);
    if (config.rotation) {
      if (config.rotation.randomY) {
        rotation.y = Math.random() * Math.PI * 2;
      } else if (config.rotation.fixedY !== undefined) {
        rotation.y = config.rotation.fixedY;
      }
      
      if (config.rotation.xRange) {
        rotation.x = THREE.MathUtils.lerp(
          config.rotation.xRange[0],
          config.rotation.xRange[1],
          Math.random()
        );
      }
      
      if (config.rotation.zRange) {
        rotation.z = THREE.MathUtils.lerp(
          config.rotation.zRange[0],
          config.rotation.zRange[1],
          Math.random()
        );
      }
    }
    
    // Apply scale
    const scale = new THREE.Vector3(1, 1, 1);
    if (config.scale) {
      if (config.scale.uniform) {
        const s = THREE.MathUtils.lerp(
          config.scale.uniform[0],
          config.scale.uniform[1],
          Math.random()
        );
        scale.set(s, s, s);
      } else if (config.scale.perAxis) {
        scale.x = THREE.MathUtils.lerp(
          config.scale.perAxis.x[0],
          config.scale.perAxis.x[1],
          Math.random()
        );
        scale.y = THREE.MathUtils.lerp(
          config.scale.perAxis.y[0],
          config.scale.perAxis.y[1],
          Math.random()
        );
        scale.z = THREE.MathUtils.lerp(
          config.scale.perAxis.z[0],
          config.scale.perAxis.z[1],
          Math.random()
        );
      }
    }
    
    // Get surface normal if available
    let normal: THREE.Vector3 | undefined;
    let surfaceDistance: number | undefined;
    
    if (config.surface) {
      const hit = this.raycastSurface(position, config.surface);
      if (hit) {
        normal = hit.normal;
        surfaceDistance = position.distanceTo(hit.point);
        // Adjust position to sit on surface
        position.copy(hit.point);
      }
    }
    
    return {
      position: position.clone(),
      rotation,
      scale,
      normal,
      surfaceDistance,
    };
  }

  /**
   * Raycast to surface and get hit info
   */
  private raycastSurface(
    point: THREE.Vector3,
    surface: THREE.Mesh
  ): THREE.Intersection | null {
    const rayOrigin = new THREE.Vector3(point.x, point.y + 1, point.z);
    const rayDirection = new THREE.Vector3(0, -1, 0);
    
    this.raycaster.set(rayOrigin, rayDirection);
    const intersects = this.raycaster.intersectObject(surface);
    
    return intersects.length > 0 ? intersects[0] : null;
  }

  /**
   * Add instance to spatial grid
   */
  private addToSpatialGrid(instance: PlacementInstance): void {
    const cellKey = this.getGridCellKey(instance.position);
    
    if (!this.spatialGrid.has(cellKey)) {
      this.spatialGrid.set(cellKey, []);
    }
    
    this.spatialGrid.get(cellKey)!.push(instance);
  }

  /**
   * Get grid cell key for position
   */
  private getGridCellKey(position: THREE.Vector3): string {
    const x = Math.floor(position.x / this.gridSize);
    const y = Math.floor(position.y / this.gridSize);
    const z = Math.floor(position.z / this.gridSize);
    return `${x},${y},${z}`;
  }

  /**
   * Get nearby grid cells for collision checking
   */
  private getNearbyGridCells(position: THREE.Vector3): string[] {
    const x = Math.floor(position.x / this.gridSize);
    const y = Math.floor(position.y / this.gridSize);
    const z = Math.floor(position.z / this.gridSize);
    
    const cells: string[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          cells.push(`${x + dx},${y + dy},${z + dz}`);
        }
      }
    }
    
    return cells;
  }

  /**
   * Visualize placements as points
   */
  public visualize(result: DetailPlacementResult, color: number = 0xff0000): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    
    for (const instance of result.instances) {
      positions.push(instance.position.x, instance.position.y, instance.position.z);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
      color,
      size: 0.05,
    });
    
    return new THREE.Points(geometry, material);
  }

  /**
   * Export placements to JSON
   */
  public toJSON(result: DetailPlacementResult): string {
    return JSON.stringify({
      instances: result.instances.map(i => ({
        position: [i.position.x, i.position.y, i.position.z],
        rotation: [i.rotation.x, i.rotation.y, i.rotation.z],
        scale: [i.scale.x, i.scale.y, i.scale.z],
        normal: i.normal ? [i.normal.x, i.normal.y, i.normal.z] : null,
        metadata: i.metadata,
      })),
      statistics: {
        ...result.statistics,
        boundingBox: {
          min: [result.statistics.boundingBox.min.x, result.statistics.boundingBox.min.y, result.statistics.boundingBox.min.z],
          max: [result.statistics.boundingBox.max.x, result.statistics.boundingBox.max.y, result.statistics.boundingBox.max.z],
        },
      },
    }, null, 2);
  }
}

export default DetailPlacementSystem;
