/**
 * Room Solving Pipeline — P2 Constraints
 *
 * Provides 2D polygon operations, room graph generation, and floor plan
 * simulated-annealing optimisation on top of the P0 UnifiedConstraintSystem
 * and P1 ConstraintProposalSystem.
 *
 * Key components:
 * - Polygon2DOperations: shapely-like 2D geometry (intersection, union,
 *   difference, buffer, convex hull, point-in-polygon)
 * - RoomSpec: room specification with adjacency & window requirements
 * - GraphMaker: generates & validates room adjacency graphs
 * - ContourFactory: generates building contours (rectangular, L-shaped, irregular)
 * - SegmentMaker: divides contours into room polygons via recursive bisection
 * - FloorPlanMove: SA move types (split, merge, move_wall, swap)
 * - FloorPlanSolver: SA optimiser for floor plan layout
 * - FloorPlanSolution: solution container with rooms, adjacency, exterior walls
 * - BlueprintRenderer: Three.js visualisation (2D floor plan + 3D walls)
 *
 * This is a NEW module that does not modify existing files.
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import {
  Polygon2D,
  ViolationAwareSA,
  Constraint,
  SAConfig,
  DEFAULT_SA_CONFIG,
  Tag,
  TagSet,
  ObjectState,
} from '../unified/UnifiedConstraintSystem';

// ============================================================================
// LineSegment2D — A 2D line segment between two points
// ============================================================================

/**
 * A 2D line segment defined by two endpoints.
 *
 * Used for representing wall segments, exterior wall edges,
 * and door/window positions in the floor plan.
 */
export interface LineSegment2D {
  /** Start point of the segment */
  start: THREE.Vector2;
  /** End point of the segment */
  end: THREE.Vector2;
}

// ============================================================================
// Polygon2DOperations — shapely-like 2D geometry operations
// ============================================================================

/**
 * Static utility class providing shapely-like 2D polygon operations.
 *
 * Extends the base Polygon2D with additional operations needed for
 * room solving: intersection (Sutherland-Hodgman), union (grid
 * rasterisation), difference, convex hull (Graham scan), and
 * point-in-polygon (ray casting).
 *
 * All methods are static and operate on Polygon2D instances.
 */
export class Polygon2DOperations {
  /**
   * Compute the area of a polygon using the shoelace formula.
   *
   * Delegates to Polygon2D.area() but provided here for API consistency
   * with the shapely-like interface.
   *
   * @param polygon - The polygon to measure
   * @returns The absolute area of the polygon
   */
  static area(polygon: Polygon2D): number {
    return polygon.area();
  }

  /**
   * Compute the intersection of two convex polygons using
   * the Sutherland-Hodgman clipping algorithm.
   *
   * Clips polygon A against each edge of polygon B.
   * Returns null if the intersection is empty.
   *
   * @param polyA - The subject polygon (will be clipped)
   * @param polyB - The clip polygon (defines the clipping region)
   * @returns The intersection polygon, or null if no intersection
   */
  static intersection(polyA: Polygon2D, polyB: Polygon2D): Polygon2D | null {
    if (polyA.vertices.length < 3 || polyB.vertices.length < 3) return null;

    let output = [...polyA.vertices];
    const n = polyB.vertices.length;

    for (let i = 0; i < n; i++) {
      if (output.length === 0) return null;

      const input = [...output];
      output = [];

      const edgeStart = polyB.vertices[i];
      const edgeEnd = polyB.vertices[(i + 1) % n];

      for (let j = 0; j < input.length; j++) {
        const current = input[j];
        const previous = input[(j - 1 + input.length) % input.length];

        const currentInside = Polygon2DOperations.isLeft(
          edgeStart, edgeEnd, current
        );
        const previousInside = Polygon2DOperations.isLeft(
          edgeStart, edgeEnd, previous
        );

        if (currentInside) {
          if (!previousInside) {
            const inter = Polygon2DOperations.lineIntersection(
              previous, current, edgeStart, edgeEnd
            );
            if (inter) output.push(inter);
          }
          output.push(current);
        } else if (previousInside) {
          const inter = Polygon2DOperations.lineIntersection(
            previous, current, edgeStart, edgeEnd
          );
          if (inter) output.push(inter);
        }
      }
    }

    if (output.length < 3) return null;
    return new Polygon2D(output);
  }

  /**
   * Compute an approximate union of two polygons via grid rasterisation.
   *
   * Rasterises both polygons onto a grid, ORs the occupancy, then
   * traces the boundary of the union region. The grid resolution
   * determines the accuracy of the result.
   *
   * @param polyA - First polygon
   * @param polyB - Second polygon
   * @param resolution - Grid resolution (default 100 cells along longest axis)
   * @returns The union polygon
   */
  static union(
    polyA: Polygon2D,
    polyB: Polygon2D,
    resolution: number = 100
  ): Polygon2D {
    // Compute bounding box of both polygons
    const allVerts = [...polyA.vertices, ...polyB.vertices];
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const v of allVerts) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }

    const pad = 0.01;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const cellSize = Math.max(rangeX, rangeY) / resolution;

    const cols = Math.ceil(rangeX / cellSize) + 1;
    const rows = Math.ceil(rangeY / cellSize) + 1;

    // Rasterise both polygons
    const grid: boolean[][] = Array.from({ length: rows }, () =>
      Array(cols).fill(false)
    );

    const fillPolygon = (poly: Polygon2D): void => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = minX + (c + 0.5) * cellSize;
          const py = minY + (r + 0.5) * cellSize;
          const point = new THREE.Vector2(px, py);
          if (poly.contains(point)) {
            grid[r][c] = true;
          }
        }
      }
    };

    fillPolygon(polyA);
    fillPolygon(polyB);

    // Trace boundary using marching squares (simplified)
    const boundary: THREE.Vector2[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = grid[r][c] ? 1 : 0;
        const tr = grid[r][c + 1] ? 1 : 0;
        const br = grid[r + 1][c + 1] ? 1 : 0;
        const bl = grid[r + 1][c] ? 1 : 0;

        // If any cell in the 2x2 block differs, add boundary segments
        const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
        if (code > 0 && code < 15) {
          // Cell is on boundary — add center
          boundary.push(new THREE.Vector2(
            minX + (c + 0.5) * cellSize,
            minY + (r + 0.5) * cellSize
          ));
        }
      }
    }

    if (boundary.length < 3) {
      // Fallback: return convex hull of all vertices
      return Polygon2DOperations.convexHull(allVerts);
    }

    // Sort boundary points by angle from centroid for consistent polygon
    const cx = boundary.reduce((s, p) => s + p.x, 0) / boundary.length;
    const cy = boundary.reduce((s, p) => s + p.y, 0) / boundary.length;
    const centroid = new THREE.Vector2(cx, cy);

    boundary.sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
      return angleA - angleB;
    });

    // Simplify the boundary to reduce vertex count
    const simplified = Polygon2DOperations.simplifyPolygon(boundary, cellSize * 2);

    return simplified.length >= 3
      ? new Polygon2D(simplified)
      : Polygon2DOperations.convexHull(allVerts);
  }

  /**
   * Compute the difference of two polygons (polyA - polyB).
   *
   * Uses grid rasterisation: rasterises A and NOT-B, then traces
   * the boundary of the remaining region.
   *
   * @param polyA - The polygon to subtract from
   * @param polyB - The polygon to subtract
   * @param resolution - Grid resolution (default 100)
   * @returns The difference polygon, or null if result is empty
   */
  static difference(
    polyA: Polygon2D,
    polyB: Polygon2D,
    resolution: number = 100
  ): Polygon2D | null {
    if (polyA.vertices.length < 3) return null;
    if (polyB.vertices.length < 3) return polyA.clone();

    // Quick check: if no intersection, return A as-is
    if (!polyA.intersects(polyB)) return polyA.clone();

    // Compute bounding box
    const allVerts = [...polyA.vertices, ...polyB.vertices];
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const v of allVerts) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }

    const pad = 0.01;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const cellSize = Math.max(rangeX, rangeY) / resolution;

    const cols = Math.ceil(rangeX / cellSize) + 1;
    const rows = Math.ceil(rangeY / cellSize) + 1;

    // Rasterise: A AND NOT B
    const boundary: THREE.Vector2[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = minX + (c + 0.5) * cellSize;
        const py = minY + (r + 0.5) * cellSize;
        const point = new THREE.Vector2(px, py);
        const inA = polyA.contains(point);
        const inB = polyB.contains(point);
        if (inA && !inB) {
          boundary.push(point);
        }
      }
    }

    if (boundary.length < 3) return null;

    // Sort by angle from centroid
    const cx = boundary.reduce((s, p) => s + p.x, 0) / boundary.length;
    const cy = boundary.reduce((s, p) => s + p.y, 0) / boundary.length;
    const centroid = new THREE.Vector2(cx, cy);

    boundary.sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
      return angleA - angleB;
    });

    const simplified = Polygon2DOperations.simplifyPolygon(boundary, cellSize * 2);
    return simplified.length >= 3 ? new Polygon2D(simplified) : null;
  }

  /**
   * Offset a polygon inward or outward by a given distance.
   *
   * Positive distance = grow (outward), negative = shrink (inward).
   * Delegates to Polygon2D.buffer() which uses vertex offset along
   * averaged normals.
   *
   * @param polygon - The polygon to offset
   * @param distance - Offset distance (positive = grow, negative = shrink)
   * @returns The offset polygon
   */
  static buffer(polygon: Polygon2D, distance: number): Polygon2D {
    return polygon.buffer(distance);
  }

  /**
   * Compute the length of shared boundary between two polygons.
   *
   * Two edges are considered "shared" if they are within the
   * given tolerance of each other. Used for determining room
   * adjacency by measuring wall overlap.
   *
   * @param polyA - First polygon
   * @param polyB - Second polygon
   * @param tolerance - Maximum distance for edges to be considered shared (default 0.05)
   * @returns Total length of shared boundary
   */
  static sharedEdgeLength(
    polyA: Polygon2D,
    polyB: Polygon2D,
    tolerance: number = 0.05
  ): number {
    return polyA.sharedEdgeLength(polyB, tolerance);
  }

  /**
   * Compute the convex hull of a set of points using Graham scan.
   *
   * The Graham scan finds the convex hull in O(n log n) time:
   * 1. Find the point with the lowest y-coordinate (pivot)
   * 2. Sort remaining points by polar angle from pivot
   * 3. Process points, maintaining a stack that forms the hull
   *
   * @param points - Array of 2D points
   * @returns The convex hull as a Polygon2D
   */
  static convexHull(points: THREE.Vector2[]): Polygon2D {
    if (points.length < 3) return new Polygon2D(points.map(p => p.clone()));
    if (points.length === 3) return new Polygon2D(points.map(p => p.clone()));

    // Find the point with the lowest y (and leftmost if tied)
    let pivotIdx = 0;
    for (let i = 1; i < points.length; i++) {
      if (
        points[i].y < points[pivotIdx].y ||
        (points[i].y === points[pivotIdx].y && points[i].x < points[pivotIdx].x)
      ) {
        pivotIdx = i;
      }
    }

    // Swap pivot to front
    const pts = points.map(p => p.clone());
    [pts[0], pts[pivotIdx]] = [pts[pivotIdx], pts[0]];
    const pivot = pts[0];

    // Sort by polar angle from pivot
    const sorted = pts.slice(1).sort((a, b) => {
      const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
      const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
      if (Math.abs(angleA - angleB) > 1e-10) return angleA - angleB;
      // Collinear: closer point first
      const distA = a.distanceTo(pivot);
      const distB = b.distanceTo(pivot);
      return distA - distB;
    });

    // Graham scan
    const stack: THREE.Vector2[] = [pivot];
    for (const pt of sorted) {
      while (
        stack.length >= 2 &&
        Polygon2DOperations.cross(
          stack[stack.length - 2],
          stack[stack.length - 1],
          pt
        ) <= 0
      ) {
        stack.pop();
      }
      stack.push(pt);
    }

    return new Polygon2D(stack);
  }

  /**
   * Create a Polygon2D from a bounding box defined by min and max corners.
   *
   * @param min - The minimum corner (bottom-left)
   * @param max - The maximum corner (top-right)
   * @returns A rectangular Polygon2D
   */
  static fromBoundingBox(
    min: THREE.Vector2,
    max: THREE.Vector2
  ): Polygon2D {
    return new Polygon2D([
      new THREE.Vector2(min.x, min.y),
      new THREE.Vector2(max.x, min.y),
      new THREE.Vector2(max.x, max.y),
      new THREE.Vector2(min.x, max.y),
    ]);
  }

  /**
   * Check if a point is inside a polygon using ray casting algorithm.
   *
   * Casts a horizontal ray from the point to the right and counts
   * edge crossings. Odd count = inside, even = outside.
   *
   * @param point - The point to test
   * @param polygon - The polygon to test against
   * @returns True if the point is inside the polygon
   */
  static pointInPolygon(point: THREE.Vector2, polygon: Polygon2D): boolean {
    return polygon.contains(point);
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Check if point C is on the left side of the directed line A→B.
   * Left side = inside for counter-clockwise polygons.
   */
  private static isLeft(
    a: THREE.Vector2,
    b: THREE.Vector2,
    c: THREE.Vector2
  ): boolean {
    return (
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) >= 0
    );
  }

  /**
   * Compute the intersection of two line segments (p1→p2 and p3→p4).
   * Returns null if lines are parallel.
   */
  private static lineIntersection(
    p1: THREE.Vector2,
    p2: THREE.Vector2,
    p3: THREE.Vector2,
    p4: THREE.Vector2
  ): THREE.Vector2 | null {
    const denom =
      (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(denom) < 1e-10) return null;

    const t =
      ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) /
      denom;

    return new THREE.Vector2(
      p1.x + t * (p2.x - p1.x),
      p1.y + t * (p2.y - p1.y)
    );
  }

  /**
   * 2D cross product of vectors OA and OB.
   */
  private static cross(
    o: THREE.Vector2,
    a: THREE.Vector2,
    b: THREE.Vector2
  ): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  /**
   * Simplify a polygon by removing near-collinear points.
   * Uses a simple distance-to-line heuristic.
   */
  private static simplifyPolygon(
    vertices: THREE.Vector2[],
    tolerance: number
  ): THREE.Vector2[] {
    if (vertices.length <= 3) return vertices;

    const result: THREE.Vector2[] = [vertices[0]];
    for (let i = 1; i < vertices.length; i++) {
      const prev = result[result.length - 1];
      const curr = vertices[i];
      if (prev.distanceTo(curr) < tolerance) continue;
      result.push(curr);
    }

    return result.length >= 3 ? result : vertices;
  }
}

// ============================================================================
// RoomSpec — Room specification with adjacency & window requirements
// ============================================================================

/**
 * Specification for a room in the floor plan.
 *
 * Defines the room's name, area constraints, type, adjacency
 * requirements, window requirements, and door connections.
 * Used by GraphMaker to build the adjacency graph and by
 * FloorPlanSolver to evaluate constraint satisfaction.
 */
export interface RoomSpec {
  /** Unique name for this room (e.g., "LivingRoom", "Kitchen") */
  name: string;

  /** Target area in square meters */
  area: number;

  /** Minimum allowed area in square meters */
  minArea: number;

  /** Maximum allowed area in square meters */
  maxArea: number;

  /** Room type determining colour coding and default properties */
  roomType:
    | 'living'
    | 'bedroom'
    | 'kitchen'
    | 'bathroom'
    | 'hallway'
    | 'closet'
    | 'office';

  /** Names of rooms that must be adjacent to this room */
  adjacencyRequirements: string[];

  /** Whether this room needs access to an exterior wall */
  windowRequirement: 'none' | 'any' | 'exterior';

  /** Names of rooms connected by doors to this room */
  doorConnections: string[];
}

// ============================================================================
// RoomGraph — Adjacency graph for the room layout
// ============================================================================

/**
 * Adjacency graph representing room connectivity.
 *
 * Nodes are room names; edges indicate adjacency (shared walls).
 * Used by SegmentMaker and FloorPlanSolver to enforce and
 * evaluate adjacency constraints.
 */
export interface RoomGraph {
  /** Map of room name → set of adjacent room names */
  adjacency: Map<string, Set<string>>;
}

// ============================================================================
// GraphMaker — Generate and validate room adjacency graphs
// ============================================================================

/**
 * Generates room adjacency graphs from RoomSpec requirements and
 * validates them for connectivity and constraint satisfaction.
 *
 * The graph generation algorithm:
 * 1. Add edges for all adjacency requirements from specs
 * 2. Add edges for all door connections from specs
 * 3. Ensure connectivity via BFS (add edges if disconnected)
 * 4. Validate the graph meets all constraints
 */
export class GraphMaker {
  /**
   * Generate a room adjacency graph from room specifications.
   *
   * Creates an adjacency graph that satisfies:
   * - All adjacencyRequirements from each RoomSpec
   * - All doorConnections from each RoomSpec
   * - Full connectivity (all rooms reachable from any other)
   *
   * If the graph is disconnected after adding required edges,
   * additional edges are added to connect components.
   *
   * @param specs - Array of room specifications
   * @param rng - Seeded random number generator for edge addition order
   * @returns A RoomGraph with adjacency information
   */
  generateRoomGraph(specs: RoomSpec[], rng: SeededRandom): RoomGraph {
    const adjacency = new Map<string, Set<string>>();

    // Initialize adjacency sets
    for (const spec of specs) {
      adjacency.set(spec.name, new Set<string>());
    }

    // Add edges from adjacency requirements
    for (const spec of specs) {
      for (const neighbor of spec.adjacencyRequirements) {
        adjacency.get(spec.name)?.add(neighbor);
        adjacency.get(neighbor)?.add(spec.name);
      }
    }

    // Add edges from door connections
    for (const spec of specs) {
      for (const connected of spec.doorConnections) {
        adjacency.get(spec.name)?.add(connected);
        adjacency.get(connected)?.add(spec.name);
      }
    }

    // Ensure connectivity: connect disconnected components
    this.ensureConnectivity(adjacency, specs, rng);

    return { adjacency };
  }

  /**
   * Validate a room graph against the given specifications.
   *
   * Checks:
   * - All adjacency requirements are satisfied (rooms that must be adjacent have edges)
   * - All door connections are satisfied
   * - Graph is fully connected (all rooms reachable)
   *
   * @param graph - The room graph to validate
   * @param specs - The room specifications to validate against
   * @returns Array of validation error strings (empty if valid)
   */
  validateGraph(graph: RoomGraph, specs: RoomSpec[]): string[] {
    const errors: string[] = [];

    // Check adjacency requirements
    for (const spec of specs) {
      for (const required of spec.adjacencyRequirements) {
        const neighbors = graph.adjacency.get(spec.name);
        if (!neighbors || !neighbors.has(required)) {
          errors.push(
            `Room "${spec.name}" requires adjacency with "${required}" but no edge exists`
          );
        }
      }
    }

    // Check door connections
    for (const spec of specs) {
      for (const connected of spec.doorConnections) {
        const neighbors = graph.adjacency.get(spec.name);
        if (!neighbors || !neighbors.has(connected)) {
          errors.push(
            `Room "${spec.name}" has door connection to "${connected}" but no adjacency edge`
          );
        }
      }
    }

    // Check connectivity
    if (specs.length > 0) {
      const visited = new Set<string>();
      const queue = [specs[0].name];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const neighbors = graph.adjacency.get(current);
        if (neighbors) {
          for (const n of neighbors) {
            if (!visited.has(n)) queue.push(n);
          }
        }
      }
      if (visited.size < specs.length) {
        const unreachable = specs
          .filter(s => !visited.has(s.name))
          .map(s => s.name);
        errors.push(
          `Graph is not fully connected. Unreachable rooms: ${unreachable.join(', ')}`
        );
      }
    }

    return errors;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Ensure the adjacency graph is fully connected by adding
   * edges between disconnected components.
   */
  private ensureConnectivity(
    adjacency: Map<string, Set<string>>,
    specs: RoomSpec[],
    rng: SeededRandom
  ): void {
    const roomNames = specs.map(s => s.name);

    // Find connected components via BFS
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const name of roomNames) {
      if (visited.has(name)) continue;

      const component: string[] = [];
      const queue = [name];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);

        const neighbors = adjacency.get(current);
        if (neighbors) {
          for (const n of neighbors) {
            if (!visited.has(n)) queue.push(n);
          }
        }
      }

      components.push(component);
    }

    // Connect components by adding edges
    if (components.length > 1) {
      for (let i = 1; i < components.length; i++) {
        // Connect this component to the first component
        const fromIdx = Math.floor(rng.next() * components[0].length);
        const toIdx = Math.floor(rng.next() * components[i].length);
        const from = components[0][fromIdx];
        const to = components[i][toIdx];

        adjacency.get(from)?.add(to);
        adjacency.get(to)?.add(from);
      }
    }
  }
}

// ============================================================================
// ContourFactory — Generate building contours
// ============================================================================

/**
 * Factory class for generating building boundary contours.
 *
 * Produces Polygon2D contours representing the outer boundary
 * of a building floor plan. Supports rectangular, L-shaped,
 * and irregular contours with configurable area and aspect ratio.
 */
export class ContourFactory {
  /**
   * Generate a building contour with the specified total area.
   *
   * Creates a slightly irregular polygon (not a perfect rectangle)
   * for realism. The irregularity is controlled by the RNG.
   *
   * @param totalArea - Target area in square meters
   * @param aspectRatio - Width-to-height ratio (default 1.4)
   * @param rng - Seeded random number generator
   * @returns The building contour as a Polygon2D
   */
  static generateContour(
    totalArea: number,
    aspectRatio: number = 1.4,
    rng: SeededRandom
  ): Polygon2D {
    // Compute dimensions from area and aspect ratio
    // area = width * height, width = aspectRatio * height
    const height = Math.sqrt(totalArea / aspectRatio);
    const width = aspectRatio * height;

    // Start with a rectangle and add slight irregularity
    const irregularity = 0.05; // 5% deviation
    const vertices: THREE.Vector2[] = [];

    // Generate 6-8 vertices with slight offsets from rectangle
    const numVertices = rng.nextInt(6, 8);

    // Base rectangle corners
    const hw = width / 2;
    const hh = height / 2;

    // Create vertices around the rectangle with perturbation
    const baseCorners = [
      new THREE.Vector2(-hw, -hh),
      new THREE.Vector2(hw, -hh),
      new THREE.Vector2(hw, hh),
      new THREE.Vector2(-hw, hh),
    ];

    // Distribute numVertices around the boundary
    for (let i = 0; i < numVertices; i++) {
      const t = i / numVertices;
      const perimeter = 2 * (width + height);
      const dist = t * perimeter;

      let basePoint: THREE.Vector2;
      if (dist < width) {
        // Bottom edge
        basePoint = new THREE.Vector2(-hw + dist, -hh);
      } else if (dist < width + height) {
        // Right edge
        basePoint = new THREE.Vector2(hw, -hh + (dist - width));
      } else if (dist < 2 * width + height) {
        // Top edge
        basePoint = new THREE.Vector2(hw - (dist - width - height), hh);
      } else {
        // Left edge
        basePoint = new THREE.Vector2(-hw, hh - (dist - 2 * width - height));
      }

      // Add perturbation (but keep inside reasonable bounds)
      const pertX = (rng.next() - 0.5) * width * irregularity * 2;
      const pertY = (rng.next() - 0.5) * height * irregularity * 2;

      vertices.push(new THREE.Vector2(
        Math.max(-hw * 1.1, Math.min(hw * 1.1, basePoint.x + pertX)),
        Math.max(-hh * 1.1, Math.min(hh * 1.1, basePoint.y + pertY))
      ));
    }

    return new Polygon2D(vertices);
  }

  /**
   * Generate an L-shaped building contour.
   *
   * Creates two rectangular wings connected at a corner,
   * with the wing ratio controlling the size of the second wing.
   *
   * @param area - Target area in square meters
   * @param wingRatio - Ratio of second wing width to first (0.3-0.7)
   * @param rng - Seeded random number generator
   * @returns The L-shaped contour as a Polygon2D
   */
  static generateLShaped(
    area: number,
    wingRatio: number = 0.5,
    rng: SeededRandom
  ): Polygon2D {
    const clampedRatio = Math.max(0.3, Math.min(0.7, wingRatio));

    // Main wing dimensions
    const mainWidth = Math.sqrt(area * 0.7);
    const mainHeight = mainWidth * 0.8;

    // Second wing dimensions
    const wingWidth = mainWidth * clampedRatio;
    const wingHeight = mainHeight * clampedRatio;

    // L-shape vertices (counter-clockwise)
    const vertices: THREE.Vector2[] = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(mainWidth, 0),
      new THREE.Vector2(mainWidth, mainHeight - wingHeight),
      new THREE.Vector2(wingWidth, mainHeight - wingHeight),
      new THREE.Vector2(wingWidth, mainHeight),
      new THREE.Vector2(0, mainHeight),
    ];

    // Add slight perturbation for realism
    const irregularity = 0.03;
    for (const v of vertices) {
      v.x += (rng.next() - 0.5) * mainWidth * irregularity;
      v.y += (rng.next() - 0.5) * mainHeight * irregularity;
    }

    return new Polygon2D(vertices);
  }

  /**
   * Generate a simple rectangular building contour.
   *
   * @param area - Target area in square meters
   * @param aspectRatio - Width-to-height ratio (default 1.4)
   * @returns The rectangular contour as a Polygon2D
   */
  static generateRectangular(
    area: number,
    aspectRatio: number = 1.4
  ): Polygon2D {
    const height = Math.sqrt(area / aspectRatio);
    const width = aspectRatio * height;
    const hw = width / 2;
    const hh = height / 2;

    return new Polygon2D([
      new THREE.Vector2(-hw, -hh),
      new THREE.Vector2(hw, -hh),
      new THREE.Vector2(hw, hh),
      new THREE.Vector2(-hw, hh),
    ]);
  }
}

// ============================================================================
// RoomLayout — A single room in a divided layout
// ============================================================================

/**
 * A room in a divided floor plan layout.
 *
 * Contains the room's polygon footprint, its type, and
 * adjacency information derived from shared walls.
 */
export interface RoomLayout {
  /** Room name (matches a RoomSpec name) */
  name: string;

  /** Room type */
  roomType: RoomSpec['roomType'];

  /** The 2D polygon footprint of this room */
  polygon: Polygon2D;

  /** Names of rooms adjacent to this room (sharing a wall) */
  adjacentRooms: string[];
}

// ============================================================================
// SegmentMaker — Divide contour into rooms
// ============================================================================

/**
 * Divides a building contour into rooms using recursive bisection.
 *
 * The algorithm:
 * 1. Start with the full contour as one region
 * 2. Recursively split the largest region along the longer axis
 * 3. Alternate between horizontal and vertical splits
 * 4. Continue until we have the desired number of rooms
 * 5. Assign room types based on specs
 * 6. Compute adjacency from shared edge lengths
 */
export class SegmentMaker {
  /**
   * Divide a building contour into rooms based on specifications.
   *
   * Uses recursive bisection to split the contour into the required
   * number of rooms. Each room gets a Polygon2D footprint and
   * adjacency information is computed from shared wall lengths.
   *
   * @param contour - The building boundary polygon
   * @param rooms - Array of room specifications
   * @param rng - Seeded random number generator
   * @returns Array of RoomLayout objects with polygons and adjacency
   */
  static divideContour(
    contour: Polygon2D,
    rooms: RoomSpec[],
    rng: SeededRandom
  ): RoomLayout[] {
    if (rooms.length === 0) return [];
    if (rooms.length === 1) {
      return [
        {
          name: rooms[0].name,
          roomType: rooms[0].roomType,
          polygon: contour.clone(),
          adjacentRooms: [],
        },
      ];
    }

    // Get bounding box of contour
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const v of contour.vertices) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }

    // Recursive bisection
    const regions = SegmentMaker.bisect(
      minX, minY, maxX, maxY,
      rooms.length,
      rng,
      0 // depth
    );

    // Create room layouts
    const layouts: RoomLayout[] = [];

    // Sort specs by area (largest first) and assign to regions (largest first)
    const sortedSpecs = [...rooms].sort((a, b) => b.area - a.area);
    const sortedRegions = [...regions].sort((a, b) => {
      const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
      const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
      return areaB - areaA;
    });

    for (let i = 0; i < sortedSpecs.length && i < sortedRegions.length; i++) {
      const spec = sortedSpecs[i];
      const region = sortedRegions[i];

      const polygon = new Polygon2D([
        new THREE.Vector2(region.minX, region.minY),
        new THREE.Vector2(region.maxX, region.minY),
        new THREE.Vector2(region.maxX, region.maxY),
        new THREE.Vector2(region.minX, region.maxY),
      ]);

      layouts.push({
        name: spec.name,
        roomType: spec.roomType,
        polygon,
        adjacentRooms: [],
      });
    }

    // Compute adjacency from shared edges
    SegmentMaker.computeAdjacency(layouts);

    return layouts;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Recursively bisect a rectangular region into sub-regions.
   */
  private static bisect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    count: number,
    rng: SeededRandom,
    depth: number
  ): Array<{ minX: number; minY: number; maxX: number; maxY: number }> {
    if (count <= 1) {
      return [{ minX, minY, maxX, maxY }];
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // Determine split axis: alternate, with preference for longer axis
    const splitVertical =
      depth % 2 === 0
        ? width >= height
        : width < height;

    // Number of rooms in each half
    const leftCount = Math.ceil(count / 2);
    const rightCount = count - leftCount;

    // Split position with slight randomness (0.4-0.6 range)
    const splitRatio = 0.4 + rng.next() * 0.2;

    if (splitVertical) {
      const splitX = minX + width * splitRatio;
      const left = SegmentMaker.bisect(
        minX, minY, splitX, maxY, leftCount, rng, depth + 1
      );
      const right = SegmentMaker.bisect(
        splitX, minY, maxX, maxY, rightCount, rng, depth + 1
      );
      return [...left, ...right];
    } else {
      const splitY = minY + height * splitRatio;
      const bottom = SegmentMaker.bisect(
        minX, minY, maxX, splitY, leftCount, rng, depth + 1
      );
      const top = SegmentMaker.bisect(
        minX, splitY, maxX, maxY, rightCount, rng, depth + 1
      );
      return [...bottom, ...top];
    }
  }

  /**
   * Compute adjacency between rooms based on shared edge length.
   *
   * This method is public so that FloorPlanSolver can recompute
   * adjacency after applying moves.
   *
   * @param layouts - Array of room layouts to compute adjacency for
   */
  static computeAdjacency(layouts: RoomLayout[]): void {
    const tolerance = 0.15; // 15cm tolerance for shared walls
    const minSharedLength = 0.3; // Minimum 30cm shared wall for adjacency

    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const sharedLength = layouts[i].polygon.sharedEdgeLength(
          layouts[j].polygon,
          tolerance
        );

        if (sharedLength >= minSharedLength) {
          layouts[i].adjacentRooms.push(layouts[j].name);
          layouts[j].adjacentRooms.push(layouts[i].name);
        }
      }
    }
  }
}

// ============================================================================
// FloorPlanMove — SA move types for floor plan optimisation
// ============================================================================

/**
 * A proposed move in the floor plan SA optimisation.
 *
 * Four move types are supported:
 * - split_room: Divide a room into two along an axis
 * - merge_rooms: Merge two adjacent rooms into one
 * - move_wall: Shift a shared wall between two rooms
 * - swap_rooms: Swap the room types of two rooms
 */
export interface FloorPlanMove {
  /** The type of move */
  type: 'split_room' | 'merge_rooms' | 'move_wall' | 'swap_rooms';

  /** ID of the primary room affected by this move */
  roomId: string;

  /** Direction/amount of the move (for move_wall) */
  delta: THREE.Vector2;

  /** ID of the secondary room (for merge_rooms, swap_rooms) */
  targetRoomId?: string;
}

// ============================================================================
// FloorPlanSolution — Result of floor plan solving
// ============================================================================

/**
 * The result of floor plan optimisation.
 *
 * Contains the final room layout, adjacency graph, exterior wall
 * information, optimisation score, and iteration count.
 */
export interface FloorPlanSolution {
  /** Map of room name → {polygon, roomType} */
  rooms: Map<string, { polygon: Polygon2D; roomType: string }>;

  /** Map of room name → list of adjacent room names */
  adjacencyGraph: Map<string, string[]>;

  /** Map of room name → exterior wall line segments */
  exteriorWalls: Map<string, LineSegment2D[]>;

  /** Optimisation score (lower is better) */
  score: number;

  /** Number of SA iterations performed */
  iterations: number;
}

// ============================================================================
// FloorPlanSolverConfig — Configuration for the floor plan solver
// ============================================================================

/**
 * Configuration for the FloorPlanSolver SA optimisation.
 *
 * Extends the base SAConfig with floor-plan-specific parameters.
 */
export interface FloorPlanSolverConfig extends SAConfig {
  /** Weight for area constraint violations */
  areaWeight: number;

  /** Weight for adjacency constraint violations */
  adjacencyWeight: number;

  /** Weight for connectivity constraint violations */
  connectivityWeight: number;

  /** Weight for aspect ratio constraint violations */
  aspectRatioWeight: number;

  /** Minimum shared edge length for rooms to be considered adjacent (meters) */
  adjacencyTolerance: number;

  /** Maximum number of rooms allowed (safety cap) */
  maxRooms: number;

  /** Total maximum SA iterations across all temperature levels */
  maxTotalIterations: number;
}

/** Default floor plan solver configuration */
export const DEFAULT_FLOOR_PLAN_SOLVER_CONFIG: FloorPlanSolverConfig = {
  ...DEFAULT_SA_CONFIG,
  areaWeight: 10.0,
  adjacencyWeight: 20.0,
  connectivityWeight: 50.0,
  aspectRatioWeight: 5.0,
  adjacencyTolerance: 0.15,
  maxRooms: 30,
  initialTemperature: 100,
  coolingRate: 0.95,
  minTemperature: 0.1,
  maxTotalIterations: 5000,
};

// ============================================================================
// FloorPlanSolver — SA optimiser for floor plan layout
// ============================================================================

/**
 * Simulated annealing solver for floor plan layout optimisation.
 *
 * Generates an initial layout via SegmentMaker, then optimises
 * using SA with four move types: split_room, merge_rooms,
 * move_wall, and swap_rooms.
 *
 * Uses ViolationAwareSA from P0 for correct MH acceptance with
 * hard/soft constraint distinction.
 *
 * Constraint evaluation:
 * - Area constraints: each room's area must be within [minArea, maxArea]
 * - Adjacency constraints: required adjacent rooms must share a wall
 * - Connectivity: all rooms must form a connected graph
 */
export class FloorPlanSolver {
  private config: FloorPlanSolverConfig;
  private rng: SeededRandom;

  /**
   * Create a new FloorPlanSolver.
   *
   * @param config - Solver configuration (partial, defaults applied)
   * @param seed - Random seed for reproducibility
   */
  constructor(
    config: Partial<FloorPlanSolverConfig> = {},
    seed: number = 42
  ) {
    this.config = { ...DEFAULT_FLOOR_PLAN_SOLVER_CONFIG, ...config };
    this.rng = new SeededRandom(seed);
  }

  /**
   * Solve for an optimal floor plan layout.
   *
   * Algorithm:
   * 1. Generate building contour from specs
   * 2. Generate room adjacency graph via GraphMaker
   * 3. Create initial layout via SegmentMaker
   * 4. SA optimisation loop:
   *    a. Propose floor plan move (split, merge, move wall, swap)
   *    b. Evaluate constraints (area bounds, adjacency, connectivity)
   *    c. Accept/reject via ViolationAwareSA
   *    d. Track best solution
   * 5. Compute exterior walls from final layout
   * 6. Return FloorPlanSolution
   *
   * @param contour - The building boundary polygon (if null, auto-generated)
   * @param specs - Array of room specifications
   * @param config - Optional config override for this solve run
   * @returns The optimised floor plan solution
   */
  solve(
    contour: Polygon2D | null,
    specs: RoomSpec[],
    config?: Partial<FloorPlanSolverConfig>
  ): FloorPlanSolution {
    const effectiveConfig = { ...this.config, ...config };
    const totalArea = specs.reduce((sum, s) => sum + s.area, 0);

    // Generate contour if not provided
    const buildingContour =
      contour ?? ContourFactory.generateContour(totalArea, 1.4, this.rng);

    // Generate adjacency graph
    const graphMaker = new GraphMaker();
    const roomGraph = graphMaker.generateRoomGraph(specs, this.rng);

    // Create initial layout
    let layouts = SegmentMaker.divideContour(
      buildingContour,
      specs,
      this.rng
    );

    // SA optimisation
    let temperature = effectiveConfig.initialTemperature;
    let bestLayouts = layouts.map(l => ({
      ...l,
      polygon: l.polygon.clone(),
      adjacentRooms: [...l.adjacentRooms],
    }));
    let bestScore = this.evaluateLayout(layouts, specs, roomGraph).score;

    for (let iter = 0; iter < effectiveConfig.maxTotalIterations; iter++) {
      // Propose a move
      const move = this.proposeMove(layouts, specs, this.rng);
      if (!move) continue;

      // Apply the move
      const newLayouts = this.applyMove(layouts, move, specs, this.rng);

      // Evaluate the new layout
      const evaluation = this.evaluateLayout(newLayouts, specs, roomGraph);

      // Accept/reject
      const deltaScore = evaluation.score - bestScore;
      const hasHardViolation = evaluation.violations.some(v =>
        v.includes('HARD:')
      );

      // Violation-aware acceptance
      const accepted =
        !hasHardViolation &&
        (deltaScore < 0 ||
         this.rng.next() < Math.exp(-deltaScore / temperature));

      if (accepted) {
        layouts = newLayouts;
        if (evaluation.score < bestScore) {
          bestScore = evaluation.score;
          bestLayouts = layouts.map(l => ({
            ...l,
            polygon: l.polygon.clone(),
            adjacentRooms: [...l.adjacentRooms],
          }));
        }
      }

      // Cool down
      temperature *= effectiveConfig.coolingRate;
      if (temperature < effectiveConfig.minTemperature) break;
    }

    // Build solution
    const rooms = new Map<string, { polygon: Polygon2D; roomType: string }>();
    const adjacencyGraph = new Map<string, string[]>();

    for (const layout of bestLayouts) {
      rooms.set(layout.name, {
        polygon: layout.polygon,
        roomType: layout.roomType,
      });
      adjacencyGraph.set(layout.name, [...layout.adjacentRooms]);
    }

    // Compute exterior walls
    const exteriorWalls = this.computeExteriorWalls(
      bestLayouts,
      buildingContour
    );

    return {
      rooms,
      adjacencyGraph,
      exteriorWalls,
      score: bestScore,
      iterations: effectiveConfig.maxTotalIterations,
    };
  }

  /**
   * Evaluate a room layout against the specifications.
   *
   * Checks:
   * - Area constraints: each room within [minArea, maxArea]
   * - Adjacency constraints: required rooms share a wall
   * - Connectivity: all rooms form a connected graph
   *
   * @param layouts - Current room layouts
   * @param specs - Room specifications
   * @param graph - Required adjacency graph
   * @returns Score (lower is better) and list of violation descriptions
   */
  evaluateLayout(
    layouts: RoomLayout[],
    specs: RoomSpec[],
    graph: RoomGraph
  ): { score: number; violations: string[] } {
    const violations: string[] = [];
    let score = 0;

    const specMap = new Map(specs.map(s => [s.name, s]));
    const layoutMap = new Map(layouts.map(l => [l.name, l]));

    // ── Area constraints ────────────────────────────────────────────
    for (const layout of layouts) {
      const spec = specMap.get(layout.name);
      if (!spec) continue;

      const area = layout.polygon.area();

      if (area < spec.minArea) {
        const violation = `Room "${layout.name}" area ${area.toFixed(1)} < min ${spec.minArea}`;
        violations.push(violation);
        score += this.config.areaWeight * (spec.minArea - area);
      }

      if (area > spec.maxArea) {
        const violation = `Room "${layout.name}" area ${area.toFixed(1)} > max ${spec.maxArea}`;
        violations.push(violation);
        score += this.config.areaWeight * (area - spec.maxArea);
      }

      // Penalise deviation from target area
      const deviation = Math.abs(area - spec.area) / spec.area;
      score += deviation * this.config.areaWeight;
    }

    // ── Adjacency constraints ───────────────────────────────────────
    for (const spec of specs) {
      for (const required of spec.adjacencyRequirements) {
        const layout = layoutMap.get(spec.name);
        if (layout && !layout.adjacentRooms.includes(required)) {
          const violation = `Room "${spec.name}" not adjacent to required "${required}"`;
          violations.push(`HARD: ${violation}`);
          score += this.config.adjacencyWeight;
        }
      }
    }

    // ── Connectivity ────────────────────────────────────────────────
    if (layouts.length > 0) {
      const visited = new Set<string>();
      const queue = [layouts[0].name];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const layout = layoutMap.get(current);
        if (layout) {
          for (const adj of layout.adjacentRooms) {
            if (!visited.has(adj)) queue.push(adj);
          }
        }
      }

      if (visited.size < layouts.length) {
        violations.push('HARD: Layout is not fully connected');
        score += this.config.connectivityWeight * (layouts.length - visited.size);
      }
    }

    return { score, violations };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Propose a random floor plan move.
   */
  private proposeMove(
    layouts: RoomLayout[],
    specs: RoomSpec[],
    rng: SeededRandom
  ): FloorPlanMove | null {
    if (layouts.length === 0) return null;

    const moveTypes: FloorPlanMove['type'][] = [
      'move_wall',
      'swap_rooms',
      'split_room',
      'merge_rooms',
    ];

    // Weight move types based on current state
    const weights: number[] = [
      0.4, // move_wall — most common
      0.2, // swap_rooms
      layouts.length < specs.length ? 0.25 : 0.05, // split_room
      layouts.length > specs.length ? 0.15 : 0.05, // merge_rooms
    ];

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = rng.next() * totalWeight;

    let selectedType: FloorPlanMove['type'] = 'move_wall';
    for (let i = 0; i < moveTypes.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        selectedType = moveTypes[i];
        break;
      }
    }

    const roomIdx = Math.floor(rng.next() * layouts.length);
    const roomId = layouts[roomIdx].name;

    switch (selectedType) {
      case 'move_wall': {
        const magnitude = (rng.next() - 0.5) * 2.0;
        const direction = rng.next() < 0.5 ? 'x' : 'y';
        const delta =
          direction === 'x'
            ? new THREE.Vector2(magnitude, 0)
            : new THREE.Vector2(0, magnitude);

        // Find an adjacent room to share the wall shift
        const adjacent = layouts[roomIdx].adjacentRooms;
        const targetRoomId =
          adjacent.length > 0
            ? adjacent[Math.floor(rng.next() * adjacent.length)]
            : undefined;

        return {
          type: 'move_wall',
          roomId,
          delta,
          targetRoomId,
        };
      }

      case 'swap_rooms': {
        const targetIdx = Math.floor(rng.next() * layouts.length);
        if (targetIdx === roomIdx) return null;
        return {
          type: 'swap_rooms',
          roomId,
          delta: new THREE.Vector2(0, 0),
          targetRoomId: layouts[targetIdx].name,
        };
      }

      case 'split_room': {
        return {
          type: 'split_room',
          roomId,
          delta: new THREE.Vector2(rng.next() < 0.5 ? 1 : 0, rng.next() < 0.5 ? 1 : 0),
        };
      }

      case 'merge_rooms': {
        const adjacent = layouts[roomIdx].adjacentRooms;
        if (adjacent.length === 0) return null;
        return {
          type: 'merge_rooms',
          roomId,
          delta: new THREE.Vector2(0, 0),
          targetRoomId: adjacent[Math.floor(rng.next() * adjacent.length)],
        };
      }
    }
  }

  /**
   * Apply a floor plan move to the layout, returning a new layout.
   */
  private applyMove(
    layouts: RoomLayout[],
    move: FloorPlanMove,
    specs: RoomSpec[],
    rng: SeededRandom
  ): RoomLayout[] {
    // Deep clone layouts
    const newLayouts = layouts.map(l => ({
      ...l,
      polygon: l.polygon.clone(),
      adjacentRooms: [...l.adjacentRooms],
    }));

    const layoutMap = new Map(newLayouts.map(l => [l.name, l]));

    switch (move.type) {
      case 'move_wall': {
        const layout = layoutMap.get(move.roomId);
        if (!layout) break;

        // Move wall by adjusting polygon vertices
        const verts = layout.polygon.vertices;
        const newVerts = verts.map(v =>
          new THREE.Vector2(v.x + move.delta.x, v.y + move.delta.y)
        );

        // Check if the moved polygon still has valid area
        const newPoly = new Polygon2D(newVerts);
        if (newPoly.area() > 0.5) {
          layout.polygon = newPoly;
        }

        // If there's a target room, shift its wall in opposite direction
        if (move.targetRoomId) {
          const target = layoutMap.get(move.targetRoomId);
          if (target) {
            const targetVerts = target.polygon.vertices.map(v =>
              new THREE.Vector2(v.x - move.delta.x, v.y - move.delta.y)
            );
            const targetPoly = new Polygon2D(targetVerts);
            if (targetPoly.area() > 0.5) {
              target.polygon = targetPoly;
            }
          }
        }

        // Recompute adjacency
        SegmentMaker.computeAdjacency(newLayouts);
        break;
      }

      case 'swap_rooms': {
        if (!move.targetRoomId) break;
        const layout1 = layoutMap.get(move.roomId);
        const layout2 = layoutMap.get(move.targetRoomId);
        if (!layout1 || !layout2) break;

        // Swap room types
        const tempType = layout1.roomType;
        layout1.roomType = layout2.roomType;
        layout2.roomType = tempType;
        break;
      }

      case 'split_room': {
        const layout = layoutMap.get(move.roomId);
        if (!layout || newLayouts.length >= this.config.maxRooms) break;

        // Get bounding box
        const bb = this.getBoundingBox(layout.polygon);
        const width = bb.maxX - bb.minX;
        const height = bb.maxY - bb.minY;

        if (width < 2.0 || height < 2.0) break; // Too small to split

        // Split along the shorter axis
        const splitVertical = width > height;
        const splitRatio = 0.4 + rng.next() * 0.2;

        let poly1: Polygon2D;
        let poly2: Polygon2D;

        if (splitVertical) {
          const splitX = bb.minX + width * splitRatio;
          poly1 = Polygon2DOperations.fromBoundingBox(
            new THREE.Vector2(bb.minX, bb.minY),
            new THREE.Vector2(splitX, bb.maxY)
          );
          poly2 = Polygon2DOperations.fromBoundingBox(
            new THREE.Vector2(splitX, bb.minY),
            new THREE.Vector2(bb.maxX, bb.maxY)
          );
        } else {
          const splitY = bb.minY + height * splitRatio;
          poly1 = Polygon2DOperations.fromBoundingBox(
            new THREE.Vector2(bb.minX, bb.minY),
            new THREE.Vector2(bb.maxX, splitY)
          );
          poly2 = Polygon2DOperations.fromBoundingBox(
            new THREE.Vector2(bb.minX, splitY),
            new THREE.Vector2(bb.maxX, bb.maxY)
          );
        }

        // Find the spec for this room and create a new spec for the split
        const spec = specs.find(s => s.name === move.roomId);
        const newRoomName = `${move.roomId}_split_${Date.now()}`;

        // Update original room
        layout.polygon = poly1;

        // Add new room
        const newLayout: RoomLayout = {
          name: newRoomName,
          roomType: spec?.roomType ?? 'hallway',
          polygon: poly2,
          adjacentRooms: [move.roomId],
        };

        layout.adjacentRooms.push(newRoomName);
        newLayouts.push(newLayout);

        // Recompute adjacency
        SegmentMaker.computeAdjacency(newLayouts);
        break;
      }

      case 'merge_rooms': {
        if (!move.targetRoomId) break;
        const layout1 = layoutMap.get(move.roomId);
        const layout2 = layoutMap.get(move.targetRoomId);
        if (!layout1 || !layout2) break;

        // Merge polygons using convex hull as approximation
        const allVerts = [
          ...layout1.polygon.vertices,
          ...layout2.polygon.vertices,
        ];
        const mergedPoly = Polygon2DOperations.convexHull(allVerts);

        // Update layout1 with merged polygon
        layout1.polygon = mergedPoly;

        // Combine adjacency lists
        const combinedAdj = new Set([
          ...layout1.adjacentRooms,
          ...layout2.adjacentRooms,
        ]);
        combinedAdj.delete(layout1.name);
        combinedAdj.delete(layout2.name);
        layout1.adjacentRooms = Array.from(combinedAdj);

        // Remove layout2
        const idx = newLayouts.findIndex(l => l.name === layout2.name);
        if (idx >= 0) newLayouts.splice(idx, 1);

        // Update references to layout2 in other rooms
        for (const l of newLayouts) {
          const adjIdx = l.adjacentRooms.indexOf(layout2.name);
          if (adjIdx >= 0) {
            l.adjacentRooms[adjIdx] = layout1.name;
          }
        }
        break;
      }
    }

    return newLayouts;
  }

  /**
   * Compute which room edges are on the exterior of the building.
   */
  private computeExteriorWalls(
    layouts: RoomLayout[],
    contour: Polygon2D
  ): Map<string, LineSegment2D[]> {
    const exteriorWalls = new Map<string, LineSegment2D[]>();
    const tolerance = 0.1;

    for (const layout of layouts) {
      const walls: LineSegment2D[] = [];
      const verts = layout.polygon.vertices;
      const n = verts.length;

      for (let i = 0; i < n; i++) {
        const start = verts[i];
        const end = verts[(i + 1) % n];
        const mid = new THREE.Vector2(
          (start.x + end.x) / 2,
          (start.y + end.y) / 2
        );

        // Check if midpoint of this edge is near the contour boundary
        // A point is on the exterior if moving outward from the edge
        // midpoint stays outside the contour
        const edgeDir = new THREE.Vector2(
          end.x - start.x,
          end.y - start.y
        ).normalize();
        const outward = new THREE.Vector2(edgeDir.y, -edgeDir.x);

        const testPoint = new THREE.Vector2(
          mid.x + outward.x * tolerance,
          mid.y + outward.y * tolerance
        );

        if (!contour.contains(testPoint)) {
          walls.push({ start: start.clone(), end: end.clone() });
        }
      }

      exteriorWalls.set(layout.name, walls);
    }

    return exteriorWalls;
  }

  /**
   * Get axis-aligned bounding box of a polygon.
   */
  private getBoundingBox(polygon: Polygon2D): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const v of polygon.vertices) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }
    return { minX, minY, maxX, maxY };
  }
}

// ============================================================================
// Room type colour mapping for BlueprintRenderer
// ============================================================================

/**
 * Map of room type → display colour (hex string) for floor plan rendering.
 */
const ROOM_TYPE_COLORS: Record<string, number> = {
  living: 0x4a90d9,
  bedroom: 0x7b68ee,
  kitchen: 0xff6347,
  bathroom: 0x40e0d0,
  hallway: 0xd3d3d3,
  closet: 0xdeb887,
  office: 0x32cd32,
};

// ============================================================================
// BlueprintRenderer — Three.js visualisation for floor plans
// ============================================================================

/**
 * Renders floor plan solutions as Three.js visualisations.
 *
 * Provides two rendering modes:
 * - 2D floor plan: line segments with colour-coded rooms,
 *   door gaps, and window marks on exterior walls
 * - 3D walls: extruded room polygons with floor, ceiling,
 *   and tagged wall faces per room type
 */
export class BlueprintRenderer {
  /**
   * Render a 2D floor plan as a Three.js Group of line segments.
   *
   * Each room is drawn with walls as line segments, colour-coded
   * by room type. Doors are shown as gaps in walls, and windows
   * are shown as blue marks on exterior walls.
   *
   * @param solution - The floor plan solution to render
   * @returns A THREE.Group containing the floor plan visualisation
   */
  static renderFloorPlan(solution: FloorPlanSolution): THREE.Group {
    const group = new THREE.Group();
    group.name = 'FloorPlan2D';

    for (const [roomName, roomData] of solution.rooms) {
      const polygon = roomData.polygon;
      const roomType = roomData.roomType;
      const color = ROOM_TYPE_COLORS[roomType] ?? 0xffffff;

      // Draw room walls
      const points: THREE.Vector3[] = [];
      for (const v of polygon.vertices) {
        points.push(new THREE.Vector3(v.x, 0, v.y));
      }
      // Close the loop
      if (points.length > 0) {
        points.push(points[0].clone());
      }

      if (points.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color });
        const line = new THREE.Line(geometry, material);
        line.name = `Room_${roomName}`;
        group.add(line);
      }

      // Draw door gaps on shared walls
      const adjacent = solution.adjacencyGraph.get(roomName) ?? [];
      for (const adjName of adjacent) {
        // Only draw door once (from the room with lower name)
        if (roomName < adjName) {
          const adjRoom = solution.rooms.get(adjName);
          if (adjRoom) {
            const sharedLength = polygon.sharedEdgeLength(
              adjRoom.polygon,
              0.15
            );
            if (sharedLength > 0.3) {
              // Draw a small gap marker at the midpoint of shared wall
              const centroid1 = polygon.centroid();
              const centroid2 = adjRoom.polygon.centroid();
              const doorMid = new THREE.Vector2(
                (centroid1.x + centroid2.x) / 2,
                (centroid1.y + centroid2.y) / 2
              );

              const doorGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(doorMid.x - 0.4, 0, doorMid.y),
                new THREE.Vector3(doorMid.x + 0.4, 0, doorMid.y),
              ]);
              const doorMat = new THREE.LineBasicMaterial({
                color: 0xffaa00,
              });
              const doorLine = new THREE.Line(doorGeo, doorMat);
              doorLine.name = `Door_${roomName}_${adjName}`;
              group.add(doorLine);
            }
          }
        }
      }

      // Draw windows on exterior walls
      const extWalls = solution.exteriorWalls.get(roomName) ?? [];
      for (let i = 0; i < extWalls.length; i++) {
        const wall = extWalls[i];
        const mid = new THREE.Vector2(
          (wall.start.x + wall.end.x) / 2,
          (wall.start.y + wall.end.y) / 2
        );

        // Window: blue mark perpendicular to the wall
        const wallDir = new THREE.Vector2(
          wall.end.x - wall.start.x,
          wall.end.y - wall.start.y
        ).normalize();
        const perpDir = new THREE.Vector2(wallDir.y, -wallDir.x);

        const windowHalfWidth = 0.3;
        const windowGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(
            mid.x + perpDir.x * windowHalfWidth,
            0,
            mid.y + perpDir.y * windowHalfWidth
          ),
          new THREE.Vector3(
            mid.x - perpDir.x * windowHalfWidth,
            0,
            mid.y - perpDir.y * windowHalfWidth
          ),
        ]);
        const windowMat = new THREE.LineBasicMaterial({
          color: 0x00bfff,
          linewidth: 2,
        });
        const windowLine = new THREE.Line(windowGeo, windowMat);
        windowLine.name = `Window_${roomName}_${i}`;
        group.add(windowLine);
      }

      // Add room label (as a small point at centroid)
      const centroid = polygon.centroid();
      const labelGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const labelMat = new THREE.MeshBasicMaterial({ color });
      const labelMesh = new THREE.Mesh(labelGeo, labelMat);
      labelMesh.position.set(centroid.x, 0.05, centroid.y);
      labelMesh.name = `Label_${roomName}`;
      group.add(labelMesh);
    }

    return group;
  }

  /**
   * Render 3D walls by extruding room polygons.
   *
   * Each room's polygon is extruded to the specified wall height,
   * with floor and ceiling planes. Wall faces are tagged with
   * metadata (Wall, Ceiling, Floor) and material is assigned
   * per room type.
   *
   * @param solution - The floor plan solution to render
   * @param wallHeight - Height of the walls in meters (default 2.8)
   * @param wallThickness - Thickness of the walls in meters (default 0.15)
   * @returns A THREE.Group containing the 3D wall visualisation
   */
  static render3DWalls(
    solution: FloorPlanSolution,
    wallHeight: number = 2.8,
    wallThickness: number = 0.15
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = 'FloorPlan3D';

    for (const [roomName, roomData] of solution.rooms) {
      const polygon = roomData.polygon;
      const roomType = roomData.roomType;
      const color = ROOM_TYPE_COLORS[roomType] ?? 0xcccccc;

      const roomGroup = new THREE.Group();
      roomGroup.name = `Room3D_${roomName}`;

      // ── Walls ─────────────────────────────────────────────────────
      const verts = polygon.vertices;
      const n = verts.length;

      for (let i = 0; i < n; i++) {
        const start = verts[i];
        const end = verts[(i + 1) % n];

        // Create a wall segment as a box
        const wallLength = start.distanceTo(end);
        const wallGeo = new THREE.BoxGeometry(
          wallLength,
          wallHeight,
          wallThickness
        );

        // Determine if this is an exterior or interior wall
        const extWalls = solution.exteriorWalls?.get(roomName) ?? [];
        const isExterior = extWalls.some(
          w =>
            w.start.distanceTo(start) < 0.1 && w.end.distanceTo(end) < 0.1
        );

        const wallColor = isExterior ? 0x888888 : 0xaaaaaa;
        const wallMat = new THREE.MeshStandardMaterial({
          color: wallColor,
          side: THREE.DoubleSide,
        });

        const wallMesh = new THREE.Mesh(wallGeo, wallMat);

        // Position the wall at the midpoint of the edge, raised to wallHeight/2
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        wallMesh.position.set(midX, wallHeight / 2, midY);
        wallMesh.rotation.y = -angle;

        // Tag the wall face
        wallMesh.userData = {
          roomName,
          roomType,
          faceTag: 'Wall',
          isExterior,
        };

        roomGroup.add(wallMesh);
      }

      // ── Floor ─────────────────────────────────────────────────────
      const floorShape = new THREE.Shape();
      if (verts.length >= 3) {
        floorShape.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
          floorShape.lineTo(verts[i].x, verts[i].y);
        }
        floorShape.lineTo(verts[0].x, verts[0].y);
      }

      const floorGeo = new THREE.ShapeGeometry(floorShape);
      const floorMat = new THREE.MeshStandardMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.y = 0;
      floorMesh.userData = { roomName, roomType, faceTag: 'Floor' };
      roomGroup.add(floorMesh);

      // ── Ceiling ───────────────────────────────────────────────────
      const ceilingGeo = new THREE.ShapeGeometry(floorShape);
      const ceilingMat = new THREE.MeshStandardMaterial({
        color: 0xf0f0f0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
      });
      const ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
      ceilingMesh.rotation.x = -Math.PI / 2;
      ceilingMesh.position.y = wallHeight;
      ceilingMesh.userData = { roomName, roomType, faceTag: 'Ceiling' };
      roomGroup.add(ceilingMesh);

      group.add(roomGroup);
    }

    return group;
  }
}
