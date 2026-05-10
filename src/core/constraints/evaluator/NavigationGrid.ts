/**
 * Navigation Grid — A* Pathfinding for Accessibility Constraints
 *
 * Gap 6 Fix: Provides basic A* pathfinding on a 2D navigation grid
 * for AccessibleFrom and ReachableFrom relation evaluation.
 *
 * The grid is computed from the scene's obstacle bounding boxes.
 * Grid cells that overlap with obstacle footprints are marked as blocked.
 *
 * Usage:
 *   const grid = NavigationGrid.fromObstacles(obstacles, bounds, resolution);
 *   const path = grid.findPath(start, end);
 *   const accessible = grid.isAccessible(start, end, maxDistance);
 */

import * as THREE from 'three';

// ============================================================================
// NavigationGrid
// ============================================================================

/**
 * 2D navigation grid for pathfinding.
 *
 * The grid covers a rectangular region of the XZ plane.
 * Each cell is either passable or blocked.
 */
export class NavigationGrid {
  /** Grid resolution (meters per cell) */
  readonly resolution: number;

  /** Grid dimensions */
  readonly width: number;
  readonly height: number;

  /** World-space origin (top-left corner of the grid) */
  readonly originX: number;
  readonly originZ: number;

  /** Blocked cells: blocked[y * width + x] = true if blocked */
  private blocked: Uint8Array;

  private constructor(
    resolution: number,
    width: number,
    height: number,
    originX: number,
    originZ: number,
    blocked: Uint8Array
  ) {
    this.resolution = resolution;
    this.width = width;
    this.height = height;
    this.originX = originX;
    this.originZ = originZ;
    this.blocked = blocked;
  }

  /**
   * Create a NavigationGrid from a set of obstacle bounding boxes.
   *
   * @param obstacles Array of bounding boxes for obstacles
   * @param bounds The region to cover (bounding box)
   * @param resolution Cell size in meters (default 0.5)
   * @returns A new NavigationGrid
   */
  static fromObstacles(
    obstacles: THREE.Box3[],
    bounds: THREE.Box3,
    resolution: number = 0.5
  ): NavigationGrid {
    // Compute grid dimensions
    const worldWidth = bounds.max.x - bounds.min.x;
    const worldHeight = bounds.max.z - bounds.min.z;
    const width = Math.ceil(worldWidth / resolution);
    const height = Math.ceil(worldHeight / resolution);

    const blocked = new Uint8Array(width * height);

    // Mark cells blocked by obstacles
    for (const obstacle of obstacles) {
      // Only consider the XZ footprint
      const minCellX = Math.max(0, Math.floor((obstacle.min.x - bounds.min.x) / resolution));
      const maxCellX = Math.min(width - 1, Math.ceil((obstacle.max.x - bounds.min.x) / resolution));
      const minCellY = Math.max(0, Math.floor((obstacle.min.z - bounds.min.z) / resolution));
      const maxCellY = Math.min(height - 1, Math.ceil((obstacle.max.z - bounds.min.z) / resolution));

      for (let cy = minCellY; cy <= maxCellY; cy++) {
        for (let cx = minCellX; cx <= maxCellX; cx++) {
          blocked[cy * width + cx] = 1;
        }
      }
    }

    return new NavigationGrid(resolution, width, height, bounds.min.x, bounds.min.z, blocked);
  }

  /**
   * Find the shortest path between two world-space points using A*.
   *
   * @param start Start position in world space (XZ)
   * @param end End position in world space (XZ)
   * @returns Array of world-space waypoints, or null if no path exists
   */
  findPath(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] | null {
    const startCell = this.worldToCell(start.x, start.z);
    const endCell = this.worldToCell(end.x, end.z);

    if (!this.inBounds(startCell.x, startCell.y) || !this.inBounds(endCell.x, endCell.y)) {
      return null;
    }

    if (this.isBlocked(endCell.x, endCell.y)) {
      // Try to find nearest unblocked cell to the end
      const nearest = this.findNearestUnblocked(endCell.x, endCell.y);
      if (!nearest) return null;
      endCell.x = nearest.x;
      endCell.y = nearest.y;
    }

    // A* pathfinding
    const openSet: AStarNode[] = [];
    const closedSet = new Uint8Array(this.width * this.height);
    const gScore = new Float32Array(this.width * this.height).fill(Infinity);
    const cameFrom = new Int32Array(this.width * this.height).fill(-1);

    const startIdx = startCell.y * this.width + startCell.x;
    gScore[startIdx] = 0;

    openSet.push({
      x: startCell.x,
      y: startCell.y,
      f: this.heuristic(startCell.x, startCell.y, endCell.x, endCell.y),
    });

    const dx = [0, 1, 0, -1, 1, 1, -1, -1];
    const dy = [1, 0, -1, 0, 1, -1, 1, -1];
    const costs = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

    const maxIterations = this.width * this.height * 4;
    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest f score
      let bestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[bestIdx].f) {
          bestIdx = i;
        }
      }

      const current = openSet[bestIdx];
      openSet.splice(bestIdx, 1);

      // Reached the goal
      if (current.x === endCell.x && current.y === endCell.y) {
        return this.reconstructPath(cameFrom, current.x, current.y);
      }

      const currentIdx = current.y * this.width + current.x;
      if (closedSet[currentIdx]) continue;
      closedSet[currentIdx] = 1;

      // Explore neighbors
      for (let d = 0; d < 8; d++) {
        const nx = current.x + dx[d];
        const ny = current.y + dy[d];

        if (!this.inBounds(nx, ny)) continue;
        if (this.isBlocked(nx, ny)) continue;

        const nIdx = ny * this.width + nx;
        if (closedSet[nIdx]) continue;

        // For diagonal moves, check that both adjacent cardinal cells are passable
        if (d >= 4) {
          const adjX = current.x + dx[d - 4];
          const adjY = current.y + dy[d - 4];
          if (this.isBlocked(adjX, adjY)) continue;
        }

        const tentativeG = gScore[currentIdx] + costs[d];
        if (tentativeG < gScore[nIdx]) {
          gScore[nIdx] = tentativeG;
          cameFrom[nIdx] = currentIdx;
          openSet.push({
            x: nx,
            y: ny,
            f: tentativeG + this.heuristic(nx, ny, endCell.x, endCell.y),
          });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Check if a path exists between two points with total length ≤ maxDistance.
   */
  isAccessible(start: THREE.Vector3, end: THREE.Vector3, maxDistance: number): boolean {
    const path = this.findPath(start, end);
    if (!path) return false;

    let totalLength = 0;
    for (let i = 1; i < path.length; i++) {
      totalLength += path[i].distanceTo(path[i - 1]);
    }

    return totalLength <= maxDistance;
  }

  /**
   * Get the total path length between two points, or Infinity if unreachable.
   */
  pathLength(start: THREE.Vector3, end: THREE.Vector3): number {
    const path = this.findPath(start, end);
    if (!path) return Infinity;

    let totalLength = 0;
    for (let i = 1; i < path.length; i++) {
      totalLength += path[i].distanceTo(path[i - 1]);
    }
    return totalLength;
  }

  /**
   * Check if a cell is blocked.
   */
  isBlocked(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    return this.blocked[cy * this.width + cx] === 1;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private worldToCell(wx: number, wz: number): { x: number; y: number } {
    return {
      x: Math.floor((wx - this.originX) / this.resolution),
      y: Math.floor((wz - this.originZ) / this.resolution),
    };
  }

  private cellToWorld(cx: number, cy: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.originX + (cx + 0.5) * this.resolution,
      0,
      this.originZ + (cy + 0.5) * this.resolution
    );
  }

  private inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cx < this.width && cy >= 0 && cy < this.height;
  }

  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    // Octile distance for 8-directional movement
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return Math.max(dx, dy) + (1.414 - 1) * Math.min(dx, dy);
  }

  private reconstructPath(
    cameFrom: Int32Array,
    endX: number,
    endY: number
  ): THREE.Vector3[] {
    const path: THREE.Vector3[] = [];
    let cx = endX;
    let cy = endY;

    while (cx >= 0 && cy >= 0) {
      path.unshift(this.cellToWorld(cx, cy));
      const idx = cy * this.width + cx;
      const prev = cameFrom[idx];
      if (prev < 0) break;
      cy = Math.floor(prev / this.width);
      cx = prev % this.width;
    }

    return path;
  }

  private findNearestUnblocked(cx: number, cy: number): { x: number; y: number } | null {
    // BFS to find nearest unblocked cell
    const visited = new Uint8Array(this.width * this.height);
    const queue: Array<{ x: number; y: number }> = [{ x: cx, y: cy }];
    visited[cy * this.width + cx] = 1;

    const dx = [0, 1, 0, -1];
    const dy = [1, 0, -1, 0];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!this.isBlocked(current.x, current.y)) {
        return current;
      }

      for (let d = 0; d < 4; d++) {
        const nx = current.x + dx[d];
        const ny = current.y + dy[d];
        if (!this.inBounds(nx, ny)) continue;
        const nIdx = ny * this.width + nx;
        if (visited[nIdx]) continue;
        visited[nIdx] = 1;
        queue.push({ x: nx, y: ny });
      }
    }

    return null;
  }
}

// ============================================================================
// A* Node
// ============================================================================

interface AStarNode {
  x: number;
  y: number;
  f: number;
}

// ============================================================================
// Navigation Grid Cache
// ============================================================================

const gridCache = new Map<string, NavigationGrid>();

/**
 * Get or create a cached navigation grid for a scene.
 *
 * @param sceneId Unique scene identifier
 * @param obstacles Array of obstacle bounding boxes
 * @param bounds Scene bounds
 * @param resolution Cell size
 * @returns A cached NavigationGrid
 */
export function getCachedNavigationGrid(
  sceneId: string,
  obstacles: THREE.Box3[],
  bounds: THREE.Box3,
  resolution: number = 0.5
): NavigationGrid {
  const key = `${sceneId}_${resolution}`;
  let grid = gridCache.get(key);
  if (!grid) {
    grid = NavigationGrid.fromObstacles(obstacles, bounds, resolution);
    gridCache.set(key, grid);
  }
  return grid;
}

/**
 * Invalidate a cached navigation grid (call when obstacles change).
 */
export function invalidateNavigationGrid(sceneId: string, resolution: number = 0.5): void {
  gridCache.delete(`${sceneId}_${resolution}`);
}
