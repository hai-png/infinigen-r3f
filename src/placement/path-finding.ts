/**
 * Path Finding Module
 * 
 * A* pathfinding, raycasting utilities, and spatial queries
 * for navigation and placement validation.
 * 
 * Ported from: infinigen/core/placement/path_finding.py
 */

import { Vector3, Ray, Box3, BufferGeometry } from 'three';

/**
 * Represents a node in the pathfinding graph
 */
export interface PathNode {
  /** Position in 3D space */
  position: Vector3;
  /** Cost from start (g-cost) */
  gCost: number;
  /** Heuristic cost to goal (h-cost) */
  hCost: number;
  /** Total cost (f = g + h) */
  fCost: number;
  /** Parent node for path reconstruction */
  parent: PathNode | null;
  /** Whether node is walkable */
  walkable: boolean;
  /** Node identifier */
  id: string;
}

/**
 * Result of a pathfinding operation
 */
export interface Path {
  /** Sequence of waypoints */
  waypoints: Vector3[];
  /** Total path length */
  length: number;
  /** Whether path was found */
  found: boolean;
  /** Number of nodes explored */
  nodesExplored: number;
  /** Computation time in ms */
  computationTime: number;
}

/**
 * Configuration for pathfinding
 */
export interface PathFinderConfig {
  /** Grid resolution (cell size) */
  cellSize: number;
  /** Maximum search iterations */
  maxIterations: number;
  /** Heuristic type */
  heuristic: 'euclidean' | 'manhattan' | 'chebyshev';
  /** Allow diagonal movement */
  allowDiagonal: boolean;
  /** Diagonal movement cost multiplier */
  diagonalCost: number;
}

const DEFAULT_CONFIG: PathFinderConfig = {
  cellSize: 0.5,
  maxIterations: 10000,
  heuristic: 'euclidean',
  allowDiagonal: true,
  diagonalCost: Math.SQRT2,
};

/**
 * A* Pathfinding implementation for 3D navigation
 */
export class PathFinder {
  private config: PathFinderConfig;
  private grid: Map<string, PathNode> = new Map();
  private bounds: Box3 | null = null;
  
  constructor(config: Partial<PathFinderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Set the navigation bounds
   */
  setBounds(bounds: Box3): void {
    this.bounds = bounds;
  }
  
  /**
   * Find path from start to end position
   */
  findPath(start: Vector3, end: Vector3, obstacles?: Box3[]): Path {
    const startTime = performance.now();
    
    // Clear previous search
    this.grid.clear();
    
    // Discretize start and end positions
    const startNode = this.getNodeAt(start);
    const endNode = this.getNodeAt(end);
    
    if (!startNode.walkable || !endNode.walkable) {
      return {
        waypoints: [],
        length: 0,
        found: false,
        nodesExplored: 0,
        computationTime: performance.now() - startTime,
      };
    }
    
    // Open and closed sets
    const openSet: PathNode[] = [startNode];
    const closedSet: Set<string> = new Set();
    
    startNode.gCost = 0;
    startNode.hCost = this.heuristic(startNode.position, endNode.position);
    startNode.fCost = startNode.gCost + startNode.hCost;
    
    let nodesExplored = 0;
    
    while (openSet.length > 0 && nodesExplored < this.config.maxIterations) {
      // Get node with lowest fCost
      openSet.sort((a, b) => a.fCost - b.fCost);
      const current = openSet.shift()!;
      
      nodesExplored++;
      
      // Check if we reached the goal
      if (current.id === endNode.id) {
        const path = this.reconstructPath(current);
        return {
          waypoints: path,
          length: this.calculatePathLength(path),
          found: true,
          nodesExplored,
          computationTime: performance.now() - startTime,
        };
      }
      
      closedSet.add(current.id);
      
      // Explore neighbors
      const neighbors = this.getNeighbors(current);
      
      for (const neighbor of neighbors) {
        if (closedSet.has(neighbor.id) || !neighbor.walkable) {
          continue;
        }
        
        // Check obstacle collision if obstacles provided
        if (obstacles && this.isInObstacle(neighbor.position, obstacles)) {
          continue;
        }
        
        const tentativeGCost = current.gCost + this.getDistance(current, neighbor);
        
        const existingInOpen = openSet.find(n => n.id === neighbor.id);
        
        if (!existingInOpen || tentativeGCost < (existingInOpen.gCost)) {
          neighbor.parent = current;
          neighbor.gCost = tentativeGCost;
          neighbor.hCost = this.heuristic(neighbor.position, endNode.position);
          neighbor.fCost = neighbor.gCost + neighbor.hCost;
          
          if (!existingInOpen) {
            openSet.push(neighbor);
          }
        }
      }
    }
    
    // No path found
    return {
      waypoints: [],
      length: 0,
      found: false,
      nodesExplored,
      computationTime: performance.now() - startTime,
    };
  }
  
  /**
   * Get or create node at position
   */
  private getNodeAt(position: Vector3): PathNode {
    const key = this.positionToKey(position);
    
    if (!this.grid.has(key)) {
      const snappedPos = this.snapToGrid(position);
      const walkable = this.isPositionWalkable(snappedPos);
      
      this.grid.set(key, {
        position: snappedPos.clone(),
        gCost: Infinity,
        hCost: Infinity,
        fCost: Infinity,
        parent: null,
        walkable,
        id: key,
      });
    }
    
    return this.grid.get(key)!;
  }
  
  /**
   * Get neighboring nodes
   */
  private getNeighbors(node: PathNode): PathNode[] {
    const neighbors: PathNode[] = [];
    const directions = [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, -1, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1),
    ];
    
    // Add diagonal directions if allowed
    if (this.config.allowDiagonal) {
      directions.push(
        new Vector3(1, 1, 0).normalize(),
        new Vector3(1, -1, 0).normalize(),
        new Vector3(-1, 1, 0).normalize(),
        new Vector3(-1, -1, 0).normalize(),
        new Vector3(1, 0, 1).normalize(),
        new Vector3(1, 0, -1).normalize(),
        new Vector3(-1, 0, 1).normalize(),
        new Vector3(-1, 0, -1).normalize(),
        new Vector3(0, 1, 1).normalize(),
        new Vector3(0, 1, -1).normalize(),
        new Vector3(0, -1, 1).normalize(),
        new Vector3(0, -1, -1).normalize(),
        new Vector3(1, 1, 1).normalize(),
        new Vector3(1, 1, -1).normalize(),
        new Vector3(1, -1, 1).normalize(),
        new Vector3(1, -1, -1).normalize(),
        new Vector3(-1, 1, 1).normalize(),
        new Vector3(-1, 1, -1).normalize(),
        new Vector3(-1, -1, 1).normalize(),
        new Vector3(-1, -1, -1).normalize(),
      );
    }
    
    for (const dir of directions) {
      const neighborPos = node.position.clone().add(
        dir.multiplyScalar(this.config.cellSize)
      );
      neighbors.push(this.getNodeAt(neighborPos));
    }
    
    return neighbors;
  }
  
  /**
   * Calculate heuristic distance
   */
  private heuristic(a: Vector3, b: Vector3): number {
    const delta = new Vector3().subVectors(b, a);
    
    switch (this.config.heuristic) {
      case 'manhattan':
        return Math.abs(delta.x) + Math.abs(delta.y) + Math.abs(delta.z);
      case 'chebyshev':
        return Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z));
      case 'euclidean':
      default:
        return delta.length();
    }
  }
  
  /**
   * Get distance between two nodes
   */
  private getDistance(a: PathNode, b: PathNode): number {
    const dist = a.position.distanceTo(b.position);
    
    // Apply diagonal cost if not axis-aligned
    const isDiagonal = 
      Math.abs(a.position.x - b.position.x) > 0.01 &&
      Math.abs(a.position.y - b.position.y) > 0.01 ||
      Math.abs(a.position.y - b.position.y) > 0.01 &&
      Math.abs(a.position.z - b.position.z) > 0.01 ||
      Math.abs(a.position.x - b.position.x) > 0.01 &&
      Math.abs(a.position.z - b.position.z) > 0.01;
    
    return isDiagonal ? dist * this.config.diagonalCost : dist;
  }
  
  /**
   * Reconstruct path from goal node
   */
  private reconstructPath(goal: PathNode): Vector3[] {
    const path: Vector3[] = [];
    let current: PathNode | null = goal;
    
    while (current !== null) {
      path.unshift(current.position.clone());
      current = current.parent;
    }
    
    return path;
  }
  
  /**
   * Calculate total path length
   */
  private calculatePathLength(waypoints: Vector3[]): number {
    let length = 0;
    for (let i = 1; i < waypoints.length; i++) {
      length += waypoints[i].distanceTo(waypoints[i - 1]);
    }
    return length;
  }
  
  /**
   * Convert position to grid key
   */
  private positionToKey(position: Vector3): string {
    const snapped = this.snapToGrid(position);
    return `${snapped.x.toFixed(2)},${snapped.y.toFixed(2)},${snapped.z.toFixed(2)}`;
  }
  
  /**
   * Snap position to grid
   */
  private snapToGrid(position: Vector3): Vector3 {
    const halfCell = this.config.cellSize / 2;
    return new Vector3(
      Math.floor(position.x / this.config.cellSize) * this.config.cellSize + halfCell,
      Math.floor(position.y / this.config.cellSize) * this.config.cellSize + halfCell,
      Math.floor(position.z / this.config.cellSize) * this.config.cellSize + halfCell,
    );
  }
  
  /**
   * Check if position is within bounds and walkable
   */
  private isPositionWalkable(position: Vector3): boolean {
    // Check bounds
    if (this.bounds && !this.bounds.containsPoint(position)) {
      return false;
    }
    
    // Basic walkability: assume ground level (y=0) is walkable
    // In full implementation, would check against terrain mesh
    return position.y >= -0.5 && position.y <= 2.0;
  }
  
  /**
   * Check if position is inside any obstacle
   */
  private isInObstacle(position: Vector3, obstacles: Box3[]): boolean {
    for (const obstacle of obstacles) {
      if (obstacle.containsPoint(position)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Clear cached grid data
   */
  clear(): void {
    this.grid.clear();
  }
}

/**
 * BVH-based raycaster for efficient ray-geometry intersection
 */
export class BVHRayCaster {
  private geometry: BufferGeometry | null = null;
  private bvhBuilt: boolean = false;
  
  /**
   * Build BVH acceleration structure for geometry
   */
  build(geometry: BufferGeometry): void {
    this.geometry = geometry;
    this.bvhBuilt = true;
    // In full implementation, would build actual BVH tree
    // Using three.js MeshBVH or custom implementation
  }
  
  /**
   * Cast ray and return intersections
   */
  cast(ray: Ray, maxDistance?: number): Intersection[] {
    if (!this.geometry || !this.bvhBuilt) {
      return [];
    }
    
    const intersections: Intersection[] = [];
    const positions = this.geometry.attributes.position.array as Float32Array;
    const triangleCount = positions.length / 9; // 3 vertices * 3 components
    
    for (let i = 0; i < triangleCount; i++) {
      const v0 = new Vector3(
        positions[i * 9],
        positions[i * 9 + 1],
        positions[i * 9 + 2]
      );
      const v1 = new Vector3(
        positions[i * 9 + 3],
        positions[i * 9 + 4],
        positions[i * 9 + 5]
      );
      const v2 = new Vector3(
        positions[i * 9 + 6],
        positions[i * 9 + 7],
        positions[i * 9 + 8]
      );
      
      const intersection = this.rayTriangleIntersect(ray, v0, v1, v2);
      
      if (intersection && (!maxDistance || intersection.distance <= maxDistance)) {
        intersections.push(intersection);
      }
    }
    
    // Sort by distance
    intersections.sort((a, b) => a.distance - b.distance);
    
    return intersections;
  }
  
  /**
   * Möller–Trumbore ray-triangle intersection
   */
  private rayTriangleIntersect(
    ray: Ray,
    v0: Vector3,
    v1: Vector3,
    v2: Vector3
  ): Intersection | null {
    const EPSILON = 1e-8;
    
    const edge1 = new Vector3().subVectors(v1, v0);
    const edge2 = new Vector3().subVectors(v2, v0);
    const h = new Vector3().crossVectors(ray.direction, edge2);
    
    const a = edge1.dot(h);
    
    if (Math.abs(a) < EPSILON) {
      return null; // Ray parallel to triangle
    }
    
    const f = 1.0 / a;
    const s = new Vector3().subVectors(ray.origin, v0);
    const u = f * s.dot(h);
    
    if (u < 0 || u > 1) {
      return null;
    }
    
    const q = new Vector3().crossVectors(s, edge1);
    const v = f * ray.direction.dot(q);
    
    if (v < 0 || u + v > 1) {
      return null;
    }
    
    const t = f * edge2.dot(q);
    
    if (t > EPSILON) {
      const point = new Vector3().copy(ray.origin).add(
        ray.direction.clone().multiplyScalar(t)
      );
      
      return {
        point,
        distance: t,
        faceNormal: new Vector3().crossVectors(edge1, edge2).normalize(),
        uv: new Vector3(u, v, 1 - u - v),
      };
    }
    
    return null;
  }
  
  /**
   * Cast ray and return first intersection
   */
  castFirst(ray: Ray, maxDistance?: number): Intersection | null {
    const intersections = this.cast(ray, maxDistance);
    return intersections.length > 0 ? intersections[0] : null;
  }
}

/**
 * Ray intersection result
 */
export interface Intersection {
  /** Intersection point */
  point: Vector3;
  /** Distance from ray origin */
  distance: number;
  /** Face normal at intersection */
  faceNormal: Vector3;
  /** Barycentric coordinates */
  uv: Vector3;
}
