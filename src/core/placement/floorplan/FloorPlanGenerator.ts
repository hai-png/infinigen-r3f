/**
 * Floor Plan Generator for Infinigen R3F
 *
 * Ports the procedural floor plan system from:
 *   infinigen/core/constraints/example_solver/room/
 *
 * Subsystems:
 * - RoomAdjacencyGraph: Define room adjacency requirements
 * - ContourGenerator: Generate outer building contour as a 2D polygon
 * - RoomSegmenter: Split the contour into rooms based on adjacency
 * - FloorPlanSolver: Optimize room layout using simulated annealing
 * - RoomSolidifier: Convert 2D floor plan to 3D Three.js geometry
 * - FloorPlanDecorator: Place furniture and objects in rooms
 *
 * Usage:
 *   const plan = createFloorPlan({ seed: 42, totalArea: 100, roomCount: 5, ... });
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import {
  RoomType,
  BuildingStyle,
  ConnectionType,
  type FloorPlanParams,
  type FloorPlan,
  type Room,
  type Wall,
  type WallOpening,
  type Door,
  type Window,
  type Polygon2D,
  type Bounds2D,
  type AdjacencyConstraint,
  type RoomSizeConstraint,
  type BuildingConstraints,
  BUILDING_DEFAULTS,
  ROOM_TYPICAL_AREAS,
  ROOM_MATERIALS,
} from './types';

// ============================================================================
// Utility Functions
// ============================================================================

/** Compute area of a 2D polygon using the shoelace formula */
function polygonArea(poly: Polygon2D): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i][0] * poly[j][1];
    area -= poly[j][0] * poly[i][1];
  }
  return Math.abs(area) / 2;
}

/** Compute centroid of a 2D polygon */
function polygonCentroid(poly: Polygon2D): [number, number] {
  let cx = 0, cy = 0;
  for (const [x, y] of poly) {
    cx += x;
    cy += y;
  }
  return [cx / poly.length, cy / poly.length];
}

/** Compute axis-aligned bounding box of a 2D polygon */
function polygonBounds(poly: Polygon2D): Bounds2D {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** Compute perimeter of a 2D polygon */
function polygonPerimeter(poly: Polygon2D): number {
  let perimeter = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const dx = poly[j][0] - poly[i][0];
    const dy = poly[j][1] - poly[i][1];
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

/** Compute compactness of a polygon (4π * area / perimeter²), range [0, 1] */
function polygonCompactness(poly: Polygon2D): number {
  const area = polygonArea(poly);
  const perimeter = polygonPerimeter(poly);
  if (perimeter === 0) return 0;
  return (4 * Math.PI * area) / (perimeter * perimeter);
}

/** Check if a point is inside a polygon using ray casting */
function pointInPolygon(point: [number, number], poly: Polygon2D): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distance between two 2D points */
function dist2D(a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Snap a value to the nearest grid unit */
function unitCast(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

/** Create a rectangle polygon from bounds */
function rectPolygon(minX: number, minY: number, maxX: number, maxY: number): Polygon2D {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
}

// ============================================================================
// RoomAdjacencyGraph
// ============================================================================

/**
 * Builds an adjacency graph of rooms based on building type and constraints.
 * Ports: infinigen/core/constraints/example_solver/room/graph.py
 */
class RoomAdjacencyGraph {
  private rng: SeededRandom;
  private nodes: { id: string; type: RoomType; level: number }[] = [];
  private edges: { from: string; to: string; type: ConnectionType }[] = [];
  private adjacencyMap: Map<string, Set<string>> = new Map();

  constructor(seed: number) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Build a room adjacency graph for the given building style and room types.
   * Returns the graph as nodes and edges.
   */
  build(
    roomTypes: RoomType[],
    style: BuildingStyle,
    customConstraints?: AdjacencyConstraint[],
  ): { nodes: { id: string; type: RoomType; level: number }[]; edges: { from: string; to: string; type: ConnectionType }[] } {
    this.nodes = [];
    this.edges = [];
    this.adjacencyMap = new Map();

    // Create nodes for each room type
    const typeCounts = new Map<RoomType, number>();
    for (const type of roomTypes) {
      const count = typeCounts.get(type) ?? 0;
      typeCounts.set(type, count + 1);
      const id = `${type}_${count}`;
      this.nodes.push({ id, type, level: 0 });
      this.adjacencyMap.set(id, new Set());
    }

    // Get default constraints for building style
    const constraints = customConstraints ?? this.getDefaultConstraints(style);

    // Apply adjacency constraints
    for (const constraint of constraints) {
      const nodesA = this.nodes.filter(n => n.type === constraint.roomTypeA);
      const nodesB = this.nodes.filter(n => n.type === constraint.roomTypeB);

      for (const nodeA of nodesA) {
        for (const nodeB of nodesB) {
          if (nodeA.id !== nodeB.id && !this.adjacencyMap.get(nodeA.id)?.has(nodeB.id)) {
            this.edges.push({ from: nodeA.id, to: nodeB.id, type: constraint.connectionType });
            this.adjacencyMap.get(nodeA.id)?.add(nodeB.id);
            this.adjacencyMap.get(nodeB.id)?.add(nodeA.id);
          }
        }
      }
    }

    // Ensure the graph is connected by connecting any isolated nodes
    this.ensureConnected();

    return { nodes: this.nodes, edges: this.edges };
  }

  /** Get default adjacency constraints for a building style */
  private getDefaultConstraints(style: BuildingStyle): AdjacencyConstraint[] {
    const base: AdjacencyConstraint[] = [
      // Kitchen next to dining room
      { roomTypeA: RoomType.Kitchen, roomTypeB: RoomType.DiningRoom, connectionType: ConnectionType.Open, weight: 0.9, isHard: true },
      // Bathroom near bedrooms
      { roomTypeA: RoomType.Bathroom, roomTypeB: RoomType.Bedroom, connectionType: ConnectionType.Door, weight: 0.7, isHard: false },
      // Hallway connects to everything
      { roomTypeA: RoomType.Hallway, roomTypeB: RoomType.LivingRoom, connectionType: ConnectionType.Door, weight: 0.8, isHard: true },
      { roomTypeA: RoomType.Hallway, roomTypeB: RoomType.Bedroom, connectionType: ConnectionType.Door, weight: 0.8, isHard: true },
      { roomTypeA: RoomType.Hallway, roomTypeB: RoomType.Bathroom, connectionType: ConnectionType.Door, weight: 0.7, isHard: true },
      // Living room to entrance
      { roomTypeA: RoomType.LivingRoom, roomTypeB: RoomType.Entrance, connectionType: ConnectionType.Door, weight: 0.9, isHard: true },
      // Kitchen near living room
      { roomTypeA: RoomType.Kitchen, roomTypeB: RoomType.LivingRoom, connectionType: ConnectionType.Door, weight: 0.6, isHard: false },
    ];

    switch (style) {
      case BuildingStyle.Office:
        return [
          ...base.filter(c =>
            c.roomTypeA !== RoomType.Bedroom && c.roomTypeB !== RoomType.Bedroom &&
            c.roomTypeA !== RoomType.Kitchen && c.roomTypeB !== RoomType.Kitchen &&
            c.roomTypeA !== RoomType.DiningRoom && c.roomTypeB !== RoomType.DiningRoom
          ),
          { roomTypeA: RoomType.Hallway, roomTypeB: RoomType.OpenOffice, connectionType: ConnectionType.Door, weight: 0.9, isHard: true },
          { roomTypeA: RoomType.Hallway, roomTypeB: RoomType.Office, connectionType: ConnectionType.Door, weight: 0.8, isHard: true },
          { roomTypeA: RoomType.Hallway, roomTypeB: RoomType.MeetingRoom, connectionType: ConnectionType.Door, weight: 0.7, isHard: true },
          { roomTypeA: RoomType.Hallway, roomTypeB: RoomType.BreakRoom, connectionType: ConnectionType.Door, weight: 0.6, isHard: false },
          { roomTypeA: RoomType.Office, roomTypeB: RoomType.MeetingRoom, connectionType: ConnectionType.Door, weight: 0.5, isHard: false },
          { roomTypeA: RoomType.OpenOffice, roomTypeB: RoomType.MeetingRoom, connectionType: ConnectionType.Door, weight: 0.5, isHard: false },
        ];
      case BuildingStyle.Warehouse:
        return [
          { roomTypeA: RoomType.Warehouse, roomTypeB: RoomType.Office, connectionType: ConnectionType.Door, weight: 0.8, isHard: true },
          { roomTypeA: RoomType.Warehouse, roomTypeB: RoomType.Storage, connectionType: ConnectionType.Open, weight: 0.7, isHard: false },
          { roomTypeA: RoomType.Warehouse, roomTypeB: RoomType.Utility, connectionType: ConnectionType.Door, weight: 0.6, isHard: false },
          { roomTypeA: RoomType.Office, roomTypeB: RoomType.Storage, connectionType: ConnectionType.Door, weight: 0.5, isHard: false },
        ];
      default:
        return base;
    }
  }

  /** Ensure the graph is connected by connecting isolated components */
  private ensureConnected(): void {
    if (this.nodes.length <= 1) return;

    const visited = new Set<string>();
    const components: string[][] = [];

    for (const node of this.nodes) {
      if (visited.has(node.id)) continue;
      const component: string[] = [];
      const queue = [node.id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);
        for (const neighbor of this.adjacencyMap.get(current) ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
      components.push(component);
    }

    // Connect components via hallway or first available node
    for (let i = 1; i < components.length; i++) {
      const prevComponent = components[i - 1];
      const currComponent = components[i];
      const fromId = this.rng.choice(prevComponent);
      const toId = this.rng.choice(currComponent);
      this.edges.push({ from: fromId, to: toId, type: ConnectionType.Door });
      this.adjacencyMap.get(fromId)?.add(toId);
      this.adjacencyMap.get(toId)?.add(fromId);
    }
  }
}

// ============================================================================
// ContourGenerator
// ============================================================================

/**
 * Generates the outer building contour as a 2D polygon.
 * Ports: infinigen/core/constraints/example_solver/room/contour.py
 */
class ContourGenerator {
  private rng: SeededRandom;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a building contour for the given total area.
   * Returns a rectangular or L/T-shaped polygon.
   */
  generate(totalArea: number, unit: number, aspectRatioRange: [number, number] = [0.7, 1.3]): Polygon2D {
    // Determine aspect ratio
    const aspectRatio = this.rng.uniform(aspectRatioRange[0], aspectRatioRange[1]);

    // Compute width and height from area
    const width = unitCast(Math.sqrt(totalArea * aspectRatio), unit);
    const height = unitCast(Math.sqrt(totalArea / aspectRatio), unit);

    // Optionally add complexity (L-shape, T-shape)
    const shapeType = this.rng.next();

    if (shapeType < 0.5) {
      // Simple rectangle
      return rectPolygon(0, 0, width, height);
    } else if (shapeType < 0.8) {
      // L-shape
      return this.generateLShape(width, height, unit);
    } else {
      // T-shape
      return this.generateTShape(width, height, unit);
    }
  }

  private generateLShape(width: number, height: number, unit: number): Polygon2D {
    const cutWidth = unitCast(width * this.rng.uniform(0.3, 0.5), unit);
    const cutHeight = unitCast(height * this.rng.uniform(0.3, 0.5), unit);

    // Decide which corner to cut
    const corner = this.rng.nextInt(0, 3);

    switch (corner) {
      case 0: // Cut top-right
        return [
          [0, 0], [width, 0], [width, height - cutHeight],
          [width - cutWidth, height - cutHeight], [width - cutWidth, height],
          [0, height],
        ];
      case 1: // Cut bottom-right
        return [
          [0, 0], [width - cutWidth, 0], [width - cutWidth, cutHeight],
          [width, cutHeight], [width, height], [0, height],
        ];
      case 2: // Cut bottom-left
        return [
          [cutWidth, 0], [width, 0], [width, height],
          [0, height], [0, cutHeight], [cutWidth, cutHeight],
        ];
      default: // Cut top-left
        return [
          [0, 0], [width, 0], [width, height],
          [cutWidth, height], [cutWidth, height - cutHeight],
          [0, height - cutHeight],
        ];
    }
  }

  private generateTShape(width: number, height: number, unit: number): Polygon2D {
    const wingWidth = unitCast(width * this.rng.uniform(0.3, 0.5), unit);
    const stemWidth = unitCast(width * this.rng.uniform(0.3, 0.4), unit);
    const stemHeight = unitCast(height * this.rng.uniform(0.4, 0.6), unit);

    const leftOffset = unitCast((width - stemWidth) * this.rng.uniform(0.2, 0.5), unit);

    return [
      [0, 0], [width, 0], [width, height - stemHeight],
      [leftOffset + stemWidth, height - stemHeight],
      [leftOffset + stemWidth, height],
      [leftOffset, height],
      [leftOffset, height - stemHeight],
      [0, height - stemHeight],
    ];
  }
}

// ============================================================================
// RoomSegmenter
// ============================================================================

/**
 * Splits the building contour into rooms based on adjacency requirements.
 * Ports: infinigen/core/constraints/example_solver/room/segment.py
 */
class RoomSegmenter {
  private rng: SeededRandom;
  private unit: number;

  constructor(seed: number, unit: number) {
    this.rng = new SeededRandom(seed);
    this.unit = unit;
  }

  /**
   * Segment a contour into rooms.
   * Uses recursive bisection to divide the polygon into the required number of segments,
   * then assigns segments to rooms based on adjacency constraints.
   */
  segment(
    contour: Polygon2D,
    roomCount: number,
    roomTypes: RoomType[],
    adjacencies: Map<string, Set<string>>,
    nodeIds: string[],
  ): Map<string, Polygon2D> {
    // Step 1: Divide the contour into segments using recursive bisection
    const segmentCount = Math.max(roomCount, Math.round(roomCount * this.rng.uniform(1.5, 2.0)));
    const segments = this.divideContour(contour, segmentCount);

    // Step 2: Compute shared edges between segments
    const sharedEdges = this.computeSharedEdges(segments);

    // Step 3: Merge segments down to roomCount
    const merged = this.mergeSegments(segments, sharedEdges, roomCount);

    // Step 4: Assign rooms to merged segments based on adjacency
    const assignment = this.assignRooms(merged, adjacencies, nodeIds, roomTypes);

    return assignment;
  }

  /** Recursively bisect the contour into segments */
  private divideContour(contour: Polygon2D, count: number): Map<number, Polygon2D> {
    const segments = new Map<number, Polygon2D>();
    segments.set(0, contour);

    let nextId = 1;
    const minSegmentMargin = this.unit * 2;

    for (let iter = 0; iter < count * 10 && segments.size < count; iter++) {
      // Pick a segment to split (prefer larger segments)
      const keys = Array.from(segments.keys());
      const areas = keys.map(k => polygonArea(segments.get(k)!));
      const totalArea = areas.reduce((a, b) => a + b, 0);
      const probs = areas.map(a => a / totalArea);

      let r = this.rng.next();
      let selectedIndex = 0;
      for (let i = 0; i < probs.length; i++) {
        r -= probs[i];
        if (r <= 0) {
          selectedIndex = i;
          break;
        }
      }

      const selectedKey = keys[selectedIndex];
      const selectedPoly = segments.get(selectedKey)!;
      const bounds = polygonBounds(selectedPoly);

      const w = bounds.maxX - bounds.minX;
      const h = bounds.maxY - bounds.minY;

      // Choose split direction (longer axis)
      const splitHorizontal = w >= h;
      const splitRange = splitHorizontal ? w : h;

      if (splitRange < minSegmentMargin * 2) continue;

      // Choose split position
      const splitPos = unitCast(
        (splitHorizontal ? bounds.minX : bounds.minY) + splitRange * this.rng.uniform(0.3, 0.7),
        this.unit,
      );

      // Split the polygon
      const [left, right] = this.splitPolygon(selectedPoly, splitPos, splitHorizontal);
      if (left.length >= 3 && right.length >= 3) {
        const leftArea = polygonArea(left);
        const rightArea = polygonArea(right);
        if (leftArea >= minSegmentMargin * minSegmentMargin && rightArea >= minSegmentMargin * minSegmentMargin) {
          segments.set(selectedKey, left);
          segments.set(nextId++, right);
        }
      }
    }

    return segments;
  }

  /** Split a polygon along a horizontal or vertical line */
  private splitPolygon(poly: Polygon2D, pos: number, horizontal: boolean): [Polygon2D, Polygon2D] {
    const left: Polygon2D = [];
    const right: Polygon2D = [];

    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];

      const vi = horizontal ? xi : yi;
      const vj = horizontal ? xj : yj;

      const iLeft = vi <= pos;
      const jLeft = vj <= pos;

      if (iLeft) left.push(poly[i]);
      if (!iLeft) right.push(poly[i]);

      // Check if edge crosses the split line
      if ((iLeft && !jLeft) || (!iLeft && jLeft)) {
        const t = (pos - vi) / (vj - vi);
        const ix = horizontal ? pos : xi + t * (xj - xi);
        const iy = horizontal ? yi + t * (yj - yi) : pos;
        left.push([ix, iy]);
        right.push([ix, iy]);
      }
    }

    // Order the points correctly (convex hull or sort by angle)
    return [this.orderPolygon(left), this.orderPolygon(right)];
  }

  /** Order polygon points by angle from centroid */
  private orderPolygon(poly: Polygon2D): Polygon2D {
    if (poly.length < 3) return poly;
    const [cx, cy] = polygonCentroid(poly);
    return [...poly].sort((a, b) => {
      const angleA = Math.atan2(a[1] - cy, a[0] - cx);
      const angleB = Math.atan2(b[1] - cy, b[0] - cx);
      return angleA - angleB;
    });
  }

  /** Compute shared edges between segments */
  private computeSharedEdges(segments: Map<number, Polygon2D>): Map<number, Map<number, number>> {
    const result = new Map<number, Map<number, number>>();
    const threshold = this.unit * 0.5;

    for (const [idA, polyA] of segments) {
      for (const [idB, polyB] of segments) {
        if (idA >= idB) continue;
        const sharedLength = this.computeSharedLength(polyA, polyB, threshold);
        if (sharedLength > this.unit) {
          if (!result.has(idA)) result.set(idA, new Map());
          if (!result.has(idB)) result.set(idB, new Map());
          result.get(idA)!.set(idB, sharedLength);
          result.get(idB)!.set(idA, sharedLength);
        }
      }
    }

    return result;
  }

  /** Approximate shared edge length between two polygons */
  private computeSharedLength(polyA: Polygon2D, polyB: Polygon2D, threshold: number): number {
    let length = 0;
    for (let i = 0; i < polyA.length; i++) {
      const j = (i + 1) % polyA.length;
      const midX = (polyA[i][0] + polyA[j][0]) / 2;
      const midY = (polyA[i][1] + polyA[j][1]) / 2;
      const edgeLen = dist2D(polyA[i], polyA[j]);

      // Check if the midpoint of this edge is close to the other polygon boundary
      const minDist = this.distanceToPolygonBoundary([midX, midY], polyB);
      if (minDist < threshold) {
        length += edgeLen;
      }
    }
    return length;
  }

  /** Distance from a point to the nearest edge of a polygon */
  private distanceToPolygonBoundary(point: [number, number], poly: Polygon2D): number {
    let minDist = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const d = this.distancePointToSegment2D(point, poly[i], poly[j]);
      minDist = Math.min(minDist, d);
    }
    return minDist;
  }

  /** Distance from a 2D point to a line segment */
  private distancePointToSegment2D(p: [number, number], a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return dist2D(p, a);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return dist2D(p, [a[0] + t * dx, a[1] + t * dy]);
  }

  /** Merge segments down to the target count */
  private mergeSegments(
    segments: Map<number, Polygon2D>,
    sharedEdges: Map<number, Map<number, number>>,
    targetCount: number,
  ): Map<number, Polygon2D> {
    const result = new Map(segments);
    const edges = new Map<number, Map<number, number>>();
    // Deep copy shared edges
    for (const [k, v] of sharedEdges) {
      edges.set(k, new Map(v));
    }

    while (result.size > targetCount) {
      // Find the segment with fewest neighbors (smallest shared edge count)
      const keys = Array.from(result.keys());
      const neighborCounts = keys.map(k => edges.get(k)?.size ?? 0);
      const totalNeighbors = neighborCounts.reduce((a, b) => a + b, 0);

      if (totalNeighbors === 0) break;

      // Pick a segment to merge (prefer those with fewer neighbors)
      const probs = neighborCounts.map(c => 1 / (c + 1));
      const totalProbs = probs.reduce((a, b) => a + b, 0);
      let r = this.rng.next() * totalProbs;
      let selectedIndex = 0;
      for (let i = 0; i < probs.length; i++) {
        r -= probs[i];
        if (r <= 0) {
          selectedIndex = i;
          break;
        }
      }

      const mergeKey = keys[selectedIndex];
      const neighbors = edges.get(mergeKey);
      if (!neighbors || neighbors.size === 0) continue;

      // Pick a neighbor to merge with (prefer those with more external connections)
      const neighborEntries = Array.from(neighbors.entries());
      const neighborWeights = neighborEntries.map(([, sharedLen]) => sharedLen);
      const totalWeight = neighborWeights.reduce((a, b) => a + b, 0);
      r = this.rng.next() * totalWeight;
      let mergeNeighborIdx = 0;
      for (let i = 0; i < neighborWeights.length; i++) {
        r -= neighborWeights[i];
        if (r <= 0) {
          mergeNeighborIdx = i;
          break;
        }
      }

      const [neighborKey] = neighborEntries[mergeNeighborIdx];

      // Merge the polygons
      const mergedPoly = this.mergePolygons(result.get(mergeKey)!, result.get(neighborKey)!);
      if (mergedPoly.length < 3) continue;

      // Update maps
      result.delete(mergeKey);
      result.set(neighborKey, mergedPoly);

      // Update shared edges
      edges.delete(mergeKey);
      for (const [, neighbors2] of edges) {
        neighbors2.delete(mergeKey);
      }

      // Recompute edges for the merged segment
      const newEdges = new Map<number, number>();
      for (const [otherKey, otherPoly] of result) {
        if (otherKey === neighborKey) continue;
        const sharedLen = this.computeSharedLength(mergedPoly, otherPoly, this.unit * 0.5);
        if (sharedLen > this.unit) {
          newEdges.set(otherKey, sharedLen);
          edges.get(otherKey)?.set(neighborKey, sharedLen);
        } else {
          edges.get(otherKey)?.delete(neighborKey);
        }
      }
      edges.set(neighborKey, newEdges);
    }

    return result;
  }

  /** Merge two polygons by taking their convex hull */
  private mergePolygons(polyA: Polygon2D, polyB: Polygon2D): Polygon2D {
    // Simple merge: take all points and compute convex hull
    const allPoints = [...polyA, ...polyB];
    return this.convexHull(allPoints);
  }

  /** Compute convex hull of 2D points using Graham scan */
  private convexHull(points: Polygon2D): Polygon2D {
    if (points.length < 3) return points;

    // Find lowest point
    let lowest = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i][1] < points[lowest][1] ||
        (points[i][1] === points[lowest][1] && points[i][0] < points[lowest][0])) {
        lowest = i;
      }
    }

    // Swap to front
    [points[0], points[lowest]] = [points[lowest], points[0]];
    const pivot = points[0];

    // Sort by angle
    const sorted = points.slice(1).sort((a, b) => {
      const angleA = Math.atan2(a[1] - pivot[1], a[0] - pivot[0]);
      const angleB = Math.atan2(b[1] - pivot[1], b[0] - pivot[0]);
      if (Math.abs(angleA - angleB) > 1e-10) return angleA - angleB;
      return dist2D(pivot, a) - dist2D(pivot, b);
    });

    const hull: Polygon2D = [pivot];
    for (const pt of sorted) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2];
        const b = hull[hull.length - 1];
        const cross = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]);
        if (cross >= 0) break;
        hull.pop();
      }
      hull.push(pt);
    }

    return hull;
  }

  /** Assign room types to segments based on adjacency constraints */
  private assignRooms(
    segments: Map<number, Polygon2D>,
    adjacencies: Map<string, Set<string>>,
    nodeIds: string[],
    roomTypes: RoomType[],
  ): Map<string, Polygon2D> {
    const assignment = new Map<string, Polygon2D>();
    const segmentKeys = Array.from(segments.keys());
    const used = new Set<number>();

    // Greedy assignment: for each room, find the best unassigned segment
    for (let i = 0; i < nodeIds.length && i < segmentKeys.length; i++) {
      const nodeId = nodeIds[i];
      const neighbors = adjacencies.get(nodeId) ?? new Set();

      // Find which assigned rooms are neighbors of this one
      const assignedNeighborSegments: number[] = [];
      for (const neighbor of neighbors) {
        for (const [assignedId, assignedSegKey] of this.roomToSegment) {
          if (assignedId === neighbor) {
            assignedNeighborSegments.push(assignedSegKey);
          }
        }
      }

      // Pick the best segment
      let bestKey = -1;
      let bestScore = -Infinity;

      for (const key of segmentKeys) {
        if (used.has(key)) continue;
        let score = 0;
        // Prefer segments adjacent to neighbor segments
        for (const neighborSegKey of assignedNeighborSegments) {
          const sharedLen = this.computeSharedLength(
            segments.get(key)!,
            segments.get(neighborSegKey)!,
            this.unit * 0.5,
          );
          score += sharedLen;
        }
        // Add small random noise for variety
        score += this.rng.next() * this.unit;

        if (score > bestScore) {
          bestScore = score;
          bestKey = key;
        }
      }

      if (bestKey === -1) {
        // Fallback: pick first unused
        for (const key of segmentKeys) {
          if (!used.has(key)) {
            bestKey = key;
            break;
          }
        }
      }

      if (bestKey !== -1) {
        used.add(bestKey);
        assignment.set(nodeId, segments.get(bestKey)!);
        this.roomToSegment.set(nodeId, bestKey);
      }
    }

    return assignment;
  }

  private roomToSegment: Map<string, number> = new Map();
}

// ============================================================================
// FloorPlanSolver
// ============================================================================

/**
 * Optimizes room layout using simulated annealing.
 * Ports: infinigen/core/constraints/example_solver/room/solver.py
 */
class FloorPlanSolver {
  private rng: SeededRandom;
  private unit: number;
  private wallThickness: number;
  private maxStride: number;
  private scoreScale: number;

  constructor(seed: number, unit: number, wallThickness: number) {
    this.rng = new SeededRandom(seed);
    this.unit = unit;
    this.wallThickness = wallThickness;
    this.maxStride = 5;
    this.scoreScale = 5;
  }

  /**
   * Optimize a floor plan using simulated annealing.
   * Modifies room polygons to better satisfy constraints.
   */
  solve(
    rooms: Map<string, Polygon2D>,
    roomTypes: Map<string, RoomType>,
    adjacencies: Map<string, Set<string>>,
    constraints: BuildingConstraints,
    iterations: number,
  ): { rooms: Map<string, Polygon2D>; energy: number } {
    let currentRooms = new Map(rooms);
    let currentEnergy = this.computeEnergy(currentRooms, roomTypes, adjacencies, constraints);

    let bestRooms = new Map(currentRooms);
    let bestEnergy = currentEnergy;

    const totalIters = iterations * rooms.size;
    let step = 0;

    while (step < totalIters) {
      // Generate perturbation
      const roomIds = Array.from(currentRooms.keys());
      const roomId = this.rng.choice(roomIds);

      const perturbedRooms = new Map(currentRooms);
      const poly = currentRooms.get(roomId)!;

      const moveType = this.rng.next();
      let newPoly: Polygon2D;

      if (moveType < 0.4) {
        // Extrude room out
        newPoly = this.extrudeRoom(poly, true);
      } else if (moveType < 0.8) {
        // Extrude room in
        newPoly = this.extrudeRoom(poly, false);
      } else {
        // Swap two rooms' polygons
        const otherId = this.rng.choice(roomIds);
        if (otherId === roomId) {
          step++;
          continue;
        }
        newPoly = currentRooms.get(otherId)!;
        perturbedRooms.set(otherId, poly);
      }

      perturbedRooms.set(roomId, newPoly);

      const newEnergy = this.computeEnergy(perturbedRooms, roomTypes, adjacencies, constraints);

      // Simulated annealing acceptance
      const scale = this.scoreScale * step / totalIters;
      const deltaE = newEnergy - currentEnergy;
      const acceptProb = deltaE < 0 ? 1.0 : Math.exp(-deltaE * scale);

      if (this.rng.next() < acceptProb) {
        currentRooms = perturbedRooms;
        currentEnergy = newEnergy;

        if (currentEnergy < bestEnergy) {
          bestRooms = new Map(currentRooms);
          bestEnergy = currentEnergy;
        }
      }

      step++;
    }

    return { rooms: bestRooms, energy: bestEnergy };
  }

  /** Extrude a room polygon outward or inward along a random edge */
  private extrudeRoom(poly: Polygon2D, outward: boolean): Polygon2D {
    if (poly.length < 3) return poly;

    // Pick a random edge weighted by length
    const edges: { i: number; len: number }[] = [];
    let totalLen = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const len = dist2D(poly[i], poly[j]);
      edges.push({ i, len });
      totalLen += len;
    }

    let r = this.rng.next() * totalLen;
    let selectedEdge = 0;
    for (let i = 0; i < edges.length; i++) {
      r -= edges[i].len;
      if (r <= 0) {
        selectedEdge = edges[i].i;
        break;
      }
    }

    const j = (selectedEdge + 1) % poly.length;
    const u = poly[selectedEdge];
    const v = poly[j];

    // Compute normal direction
    const dx = v[0] - u[0];
    const dy = v[1] - u[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < this.unit) return poly;

    // Normal (perpendicular)
    let nx = -dy / len;
    let ny = dx / len;

    if (!outward) {
      nx = -nx;
      ny = -ny;
    }

    // Compute stride
    const stride = this.unit * (this.rng.nextInt(1, this.maxStride));

    // Move the edge along the normal
    const newPoly: Polygon2D = poly.map(p => {
      // Only move the two vertices of the selected edge
      if (p === u || p === v) {
        return [p[0] + nx * stride, p[1] + ny * stride] as [number, number];
      }
      return p;
    });

    // Validate: must have positive area
    if (polygonArea(newPoly) < this.unit * this.unit) {
      return poly;
    }

    return newPoly;
  }

  /** Compute total energy of the current layout */
  private computeEnergy(
    rooms: Map<string, Polygon2D>,
    roomTypes: Map<string, RoomType>,
    adjacencies: Map<string, Set<string>>,
    constraints: BuildingConstraints,
  ): number {
    let energy = 0;

    for (const [roomId, poly] of rooms) {
      const type = roomTypes.get(roomId);
      if (!type) continue;

      const area = polygonArea(poly);
      const sizeConstraint = constraints.roomSizes.get(type);

      // Size energy
      if (sizeConstraint) {
        if (area < sizeConstraint.minArea) {
          energy += (sizeConstraint.minArea - area) * 2;
        } else if (area > sizeConstraint.maxArea) {
          energy += (area - sizeConstraint.maxArea) * 1.5;
        } else if (sizeConstraint.targetArea > 0) {
          energy += Math.abs(area - sizeConstraint.targetArea) * 0.1;
        }
      }

      // Shape energy (compactness)
      const compactness = polygonCompactness(poly);
      energy += (1 - compactness) * 3;

      // Aspect ratio energy
      const bounds = polygonBounds(poly);
      const w = bounds.maxX - bounds.minX;
      const h = bounds.maxY - bounds.minY;
      if (w > 0 && h > 0) {
        const ar = Math.max(w, h) / Math.min(w, h);
        if (sizeConstraint) {
          if (ar < sizeConstraint.minAspectRatio || ar > sizeConstraint.maxAspectRatio) {
            energy += 2;
          }
        }
      }
    }

    // Adjacency energy: check if adjacent rooms actually share boundaries
    for (const [roomId, neighbors] of adjacencies) {
      const polyA = rooms.get(roomId);
      if (!polyA) continue;

      for (const neighborId of neighbors) {
        const polyB = rooms.get(neighborId);
        if (!polyB) continue;

        const sharedLen = this.approximateSharedBoundary(polyA, polyB);
        if (sharedLen < this.unit) {
          energy += 5; // Adjacent rooms should share a boundary
        }
      }
    }

    return energy;
  }

  /** Approximate shared boundary length between two polygons */
  private approximateSharedBoundary(polyA: Polygon2D, polyB: Polygon2D): number {
    let length = 0;
    const threshold = this.wallThickness * 2;

    for (let i = 0; i < polyA.length; i++) {
      const j = (i + 1) % polyA.length;
      const midX = (polyA[i][0] + polyA[j][0]) / 2;
      const midY = (polyA[i][1] + polyA[j][1]) / 2;
      const edgeLen = dist2D(polyA[i], polyA[j]);

      const minDist = this.minDistToPolygonBoundary([midX, midY], polyB);
      if (minDist < threshold) {
        length += edgeLen;
      }
    }

    return length;
  }

  private minDistToPolygonBoundary(point: [number, number], poly: Polygon2D): number {
    let minDist = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const d = this.distancePointToSegment2D(point, poly[i], poly[j]);
      minDist = Math.min(minDist, d);
    }
    return minDist;
  }

  private distancePointToSegment2D(p: [number, number], a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return dist2D(p, a);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return dist2D(p, [a[0] + t * dx, a[1] + t * dy]);
  }
}

// ============================================================================
// RoomSolidifier
// ============================================================================

/**
 * Converts a 2D floor plan to 3D Three.js geometry (walls, floors, ceilings).
 * Ports: infinigen/core/constraints/example_solver/room/solidifier.py
 */
class RoomSolidifier {
  private wallHeight: number;
  private wallThickness: number;

  constructor(wallHeight: number, wallThickness: number) {
    this.wallHeight = wallHeight;
    this.wallThickness = wallThickness;
  }

  /**
   * Convert a 2D floor plan into 3D Three.js meshes.
   * Creates floors, ceilings, and walls with openings for doors and windows.
   */
  solidify(
    floorPlan: FloorPlan,
    rooms: Map<string, Polygon2D>,
    roomTypes: Map<string, RoomType>,
    adjacencies: Map<string, Set<string>>,
    connections: Map<string, Map<string, ConnectionType>>,
  ): void {
    const mainGroup = new THREE.Group();
    mainGroup.name = 'floorplan_group';

    for (const [roomId, poly] of rooms) {
      const type = roomTypes.get(roomId);
      if (!type || type === RoomType.Exterior) continue;

      const room = floorPlan.rooms.find(r => r.id === roomId);
      if (!room) continue;

      const roomGroup = new THREE.Group();
      roomGroup.name = `room_${roomId}`;

      // Create floor
      const floorMesh = this.createFloor(poly, type);
      floorMesh.name = `${roomId}_floor`;
      roomGroup.add(floorMesh);
      room.floorMesh = floorMesh;

      // Create ceiling
      const ceilingMesh = this.createCeiling(poly, type);
      ceilingMesh.name = `${roomId}_ceiling`;
      roomGroup.add(ceilingMesh);
      room.ceilingMesh = ceilingMesh;

      // Create walls
      const wallMeshes = this.createWalls(roomId, poly, type, adjacencies, connections, rooms);
      room.wallMeshes = wallMeshes;
      for (const wallMesh of wallMeshes) {
        roomGroup.add(wallMesh);
      }

      mainGroup.add(roomGroup);
      room.group = roomGroup;
    }

    floorPlan.group = mainGroup;
  }

  /** Create a floor plane from a polygon */
  private createFloor(poly: Polygon2D, roomType: RoomType): THREE.Mesh {
    const shape = this.polygonToShape(poly);
    const geometry = new THREE.ShapeGeometry(shape);
    const materials = ROOM_MATERIALS[roomType] ?? ROOM_MATERIALS[RoomType.LivingRoom];

    const material = new THREE.MeshStandardMaterial({
      color: materials.floor.color,
      roughness: materials.floor.roughness,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    mesh.receiveShadow = true;

    return mesh;
  }

  /** Create a ceiling plane from a polygon */
  private createCeiling(poly: Polygon2D, roomType: RoomType): THREE.Mesh {
    const shape = this.polygonToShape(poly);
    const geometry = new THREE.ShapeGeometry(shape);
    const materials = ROOM_MATERIALS[roomType] ?? ROOM_MATERIALS[RoomType.LivingRoom];

    const material = new THREE.MeshStandardMaterial({
      color: materials.ceiling.color,
      roughness: materials.ceiling.roughness,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = this.wallHeight;
    mesh.receiveShadow = true;

    return mesh;
  }

  /** Create wall meshes for a room */
  private createWalls(
    roomId: string,
    poly: Polygon2D,
    roomType: RoomType,
    adjacencies: Map<string, Set<string>>,
    connections: Map<string, Map<string, ConnectionType>>,
    allRooms: Map<string, Polygon2D>,
  ): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    const materials = ROOM_MATERIALS[roomType] ?? ROOM_MATERIALS[RoomType.LivingRoom];
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: materials.wall.color,
      roughness: materials.wall.roughness,
      side: THREE.DoubleSide,
    });

    const neighbors = adjacencies.get(roomId) ?? new Set();
    const roomConnections = connections.get(roomId) ?? new Map();

    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const startX = poly[i][0];
      const startZ = poly[i][1];
      const endX = poly[j][0];
      const endZ = poly[j][1];

      const dx = endX - startX;
      const dz = endZ - startZ;
      const wallLength = Math.sqrt(dx * dx + dz * dz);

      if (wallLength < 0.1) continue;

      // Determine wall angle
      const angle = Math.atan2(dx, dz);

      // Determine if this wall is exterior
      const midX = (startX + endX) / 2;
      const midZ = (startZ + endZ) / 2;
      const isExterior = !this.isInteriorWall(midX, midZ, roomId, neighbors, allRooms);

      // Determine connection type for interior walls
      let connectionType = ConnectionType.Wall;
      if (!isExterior) {
        const connectedNeighbor = this.findConnectedNeighbor(
          midX, midZ, roomId, neighbors, allRooms,
        );
        if (connectedNeighbor) {
          connectionType = roomConnections.get(connectedNeighbor) ?? ConnectionType.Door;
        }
      }

      // Create wall with openings
      const wallGroup = this.createWallSegment(
        startX, startZ, endX, endZ, wallLength, angle,
        isExterior, connectionType, roomType, roomId, i,
      );

      for (const mesh of wallGroup) {
        meshes.push(mesh);
      }
    }

    return meshes;
  }

  /** Create a wall segment, potentially with door/window openings */
  private createWallSegment(
    startX: number, startZ: number,
    endX: number, endZ: number,
    wallLength: number, angle: number,
    isExterior: boolean, connectionType: ConnectionType,
    roomType: RoomType, roomId: string, wallIndex: number,
  ): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    const materials = ROOM_MATERIALS[roomType] ?? ROOM_MATERIALS[RoomType.LivingRoom];
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: materials.wall.color,
      roughness: materials.wall.roughness,
      side: THREE.DoubleSide,
    });

    const doorWidth = 0.9;
    const doorHeight = 2.1;
    const windowWidth = 1.2;
    const windowHeight = 1.0;
    const windowSillHeight = 1.0;

    // Build wall shape (with openings carved out)
    const wallShape = new THREE.Shape();
    wallShape.moveTo(0, 0);
    wallShape.lineTo(wallLength, 0);
    wallShape.lineTo(wallLength, this.wallHeight);
    wallShape.lineTo(0, this.wallHeight);
    wallShape.lineTo(0, 0);

    // Add openings based on connection type
    if (connectionType === ConnectionType.Door) {
      const doorX = (wallLength - doorWidth) / 2;
      const doorHole = new THREE.Path();
      doorHole.moveTo(doorX, 0);
      doorHole.lineTo(doorX + doorWidth, 0);
      doorHole.lineTo(doorX + doorWidth, doorHeight);
      doorHole.lineTo(doorX, doorHeight);
      doorHole.lineTo(doorX, 0);
      wallShape.holes.push(doorHole);
    } else if (connectionType === ConnectionType.Open) {
      // Full-height opening above half-wall
      const openingY = this.wallHeight * 0.3;
      const openingHole = new THREE.Path();
      openingHole.moveTo(0.1, openingY);
      openingHole.lineTo(wallLength - 0.1, openingY);
      openingHole.lineTo(wallLength - 0.1, this.wallHeight - 0.1);
      openingHole.lineTo(0.1, this.wallHeight - 0.1);
      openingHole.lineTo(0.1, openingY);
      wallShape.holes.push(openingHole);
    } else if (isExterior && wallLength > 1.5) {
      // Add window on exterior walls
      const winX = (wallLength - windowWidth) / 2;
      const winHole = new THREE.Path();
      winHole.moveTo(winX, windowSillHeight);
      winHole.lineTo(winX + windowWidth, windowSillHeight);
      winHole.lineTo(winX + windowWidth, windowSillHeight + windowHeight);
      winHole.lineTo(winX, windowSillHeight + windowHeight);
      winHole.lineTo(winX, windowSillHeight);
      wallShape.holes.push(winHole);
    }

    const geometry = new THREE.ShapeGeometry(wallShape);
    const mesh = new THREE.Mesh(geometry, wallMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `${roomId}_wall_${wallIndex}`;

    // Position and rotate the wall
    mesh.position.set(startX, 0, startZ);
    mesh.rotation.y = angle;
    mesh.position.x += (this.wallThickness / 2) * Math.cos(angle + Math.PI / 2);
    mesh.position.z -= (this.wallThickness / 2) * Math.sin(angle + Math.PI / 2);

    meshes.push(mesh);

    // Also create the wall thickness as a box
    const thicknessGeometry = new THREE.BoxGeometry(wallLength, this.wallHeight, this.wallThickness);
    const thicknessMesh = new THREE.Mesh(thicknessGeometry, wallMaterial);
    thicknessMesh.castShadow = true;
    thicknessMesh.receiveShadow = true;
    thicknessMesh.name = `${roomId}_wall_body_${wallIndex}`;

    const wallMidX = (startX + endX) / 2;
    const wallMidZ = (startZ + endZ) / 2;
    thicknessMesh.position.set(wallMidX, this.wallHeight / 2, wallMidZ);
    thicknessMesh.rotation.y = angle;

    // For walls with openings, we still use the flat shape approach
    // For simple walls, use the box geometry
    if (connectionType === ConnectionType.Wall && !isExterior) {
      // Simple interior wall - just use the box
      return [thicknessMesh];
    }

    // For walls with openings, hide the box and use the shape
    return meshes;
  }

  /** Check if a wall midpoint is an interior wall (shared with a neighbor) */
  private isInteriorWall(
    midX: number, midZ: number,
    roomId: string, neighbors: Set<string>,
    allRooms: Map<string, Polygon2D>,
  ): boolean {
    const threshold = this.wallThickness * 3;
    for (const neighborId of neighbors) {
      const neighborPoly = allRooms.get(neighborId);
      if (!neighborPoly) continue;
      const minDist = this.minDistToPolygonBoundary([midX, midZ], neighborPoly);
      if (minDist < threshold) return true;
    }
    return false;
  }

  /** Find which neighbor a wall midpoint is shared with */
  private findConnectedNeighbor(
    midX: number, midZ: number,
    roomId: string, neighbors: Set<string>,
    allRooms: Map<string, Polygon2D>,
  ): string | null {
    const threshold = this.wallThickness * 3;
    let closestNeighbor: string | null = null;
    let closestDist = Infinity;

    for (const neighborId of neighbors) {
      const neighborPoly = allRooms.get(neighborId);
      if (!neighborPoly) continue;
      const dist = this.minDistToPolygonBoundary([midX, midZ], neighborPoly);
      if (dist < threshold && dist < closestDist) {
        closestDist = dist;
        closestNeighbor = neighborId;
      }
    }

    return closestNeighbor;
  }

  private minDistToPolygonBoundary(point: [number, number], poly: Polygon2D): number {
    let minDist = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const d = this.distancePointToSegment2D(point, poly[i], poly[j]);
      minDist = Math.min(minDist, d);
    }
    return minDist;
  }

  private distancePointToSegment2D(p: [number, number], a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return dist2D(p, a);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return dist2D(p, [a[0] + t * dx, a[1] + t * dy]);
  }

  /** Convert a Polygon2D to a THREE.Shape for geometry creation */
  private polygonToShape(poly: Polygon2D): THREE.Shape {
    if (poly.length < 3) {
      return new THREE.Shape();
    }

    const shape = new THREE.Shape();
    shape.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) {
      shape.lineTo(poly[i][0], poly[i][1]);
    }
    shape.lineTo(poly[0][0], poly[0][1]);

    return shape;
  }
}

// ============================================================================
// FloorPlanDecorator
// ============================================================================

/**
 * Places placeholder furniture and objects in rooms based on room type.
 * Ports: infinigen/core/constraints/example_solver/room/decorate.py
 */
class FloorPlanDecorator {
  private rng: SeededRandom;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate furniture placement data for all rooms.
   * Returns object descriptors that can be used to place actual meshes.
   */
  decorate(rooms: Room[]): FurniturePlacement[] {
    const placements: FurniturePlacement[] = [];

    for (const room of rooms) {
      if (room.type === RoomType.Exterior || room.type === RoomType.Staircase) continue;

      const furnitureTemplates = this.getFurnitureForRoomType(room.type);
      const [cx, cz] = room.centroid;
      const bounds = room.bounds;
      const roomWidth = bounds.maxX - bounds.minX;
      const roomDepth = bounds.maxY - bounds.minY;

      for (const template of furnitureTemplates) {
        // Scale position relative to room size
        const posX = cx + template.relativePosition[0] * roomWidth * 0.3;
        const posZ = cz + template.relativePosition[1] * roomDepth * 0.3;
        const posY = template.onSurface === 'ceiling' ? room.area > 0 ? 2.8 : 2.5 : 0;

        // Verify position is inside the room polygon
        if (!pointInPolygon([posX, posZ], room.polygon)) continue;

        placements.push({
          id: `${room.id}_${template.name}`,
          name: template.name,
          category: template.category,
          roomId: room.id,
          position: [posX, posY, posZ],
          rotationY: template.rotationY ?? this.rng.uniform(0, Math.PI * 2),
          scale: template.scale ?? [1, 1, 1],
          onSurface: template.onSurface,
          tags: template.tags,
        });
      }
    }

    return placements;
  }

  /** Get furniture templates for a room type */
  private getFurnitureForRoomType(type: RoomType): FurnitureTemplate[] {
    switch (type) {
      case RoomType.LivingRoom:
        return [
          { name: 'sofa', category: 'furniture.sofa', relativePosition: [0, -0.6], onSurface: 'floor', tags: ['seating', 'large'] },
          { name: 'coffee_table', category: 'furniture.table.coffee', relativePosition: [0, 0], onSurface: 'floor', tags: ['table'] },
          { name: 'tv_stand', category: 'furniture.entertainment', relativePosition: [0, 0.7], onSurface: 'floor', tags: ['media'] },
          { name: 'armchair', category: 'furniture.chair.armchair', relativePosition: [-0.6, 0], onSurface: 'floor', tags: ['seating'] },
          { name: 'bookshelf', category: 'furniture.shelf.bookcase', relativePosition: [0.7, 0.5], onSurface: 'floor', tags: ['storage'] },
          { name: 'floor_lamp', category: 'lighting.lamp.floor', relativePosition: [-0.7, -0.5], onSurface: 'floor', tags: ['lighting'] },
        ];
      case RoomType.Bedroom:
        return [
          { name: 'bed', category: 'furniture.bed.double', relativePosition: [0, 0.2], onSurface: 'floor', tags: ['bed', 'large'] },
          { name: 'nightstand_left', category: 'furniture.nightstand', relativePosition: [-0.5, 0.3], onSurface: 'floor', tags: ['storage'] },
          { name: 'nightstand_right', category: 'furniture.nightstand', relativePosition: [0.5, 0.3], onSurface: 'floor', tags: ['storage'] },
          { name: 'wardrobe', category: 'furniture.wardrobe', relativePosition: [0.6, -0.5], onSurface: 'floor', tags: ['storage', 'large'] },
          { name: 'desk', category: 'furniture.desk', relativePosition: [-0.6, -0.5], onSurface: 'floor', tags: ['workspace'] },
        ];
      case RoomType.Kitchen:
        return [
          { name: 'counter', category: 'architectural.counter', relativePosition: [-0.5, 0.5], onSurface: 'wall', tags: ['counter'] },
          { name: 'stove', category: 'appliance.stove', relativePosition: [-0.5, 0], onSurface: 'floor', tags: ['appliance'] },
          { name: 'refrigerator', category: 'appliance.refrigerator', relativePosition: [-0.6, -0.5], onSurface: 'floor', tags: ['appliance', 'large'] },
          { name: 'sink', category: 'fixture.sink.kitchen', relativePosition: [-0.5, 0.3], onSurface: 'wall', tags: ['fixture'] },
          { name: 'island', category: 'furniture.table.kitchen_island', relativePosition: [0.2, 0], onSurface: 'floor', tags: ['table'] },
        ];
      case RoomType.Bathroom:
        return [
          { name: 'bathtub', category: 'fixture.bathtub', relativePosition: [0, 0.4], onSurface: 'floor', tags: ['fixture', 'large'] },
          { name: 'toilet', category: 'fixture.toilet', relativePosition: [-0.4, -0.3], onSurface: 'floor', tags: ['fixture'] },
          { name: 'sink', category: 'fixture.sink.bathroom', relativePosition: [0.4, -0.3], onSurface: 'wall', tags: ['fixture'] },
          { name: 'mirror', category: 'decor.mirror.wall', relativePosition: [0.4, 0.1], onSurface: 'wall', tags: ['decor'] },
        ];
      case RoomType.Office:
        return [
          { name: 'desk', category: 'furniture.desk', relativePosition: [0, 0.5], onSurface: 'floor', tags: ['workspace', 'large'] },
          { name: 'chair', category: 'furniture.chair.office', relativePosition: [0, 0.1], onSurface: 'floor', tags: ['seating'] },
          { name: 'bookshelf', category: 'furniture.shelf.bookcase', relativePosition: [-0.7, 0], onSurface: 'floor', tags: ['storage'] },
          { name: 'filing_cabinet', category: 'furniture.storage.filing', relativePosition: [0.6, 0.5], onSurface: 'floor', tags: ['storage'] },
          { name: 'floor_lamp', category: 'lighting.lamp.floor', relativePosition: [-0.6, -0.4], onSurface: 'floor', tags: ['lighting'] },
        ];
      case RoomType.DiningRoom:
        return [
          { name: 'dining_table', category: 'furniture.table.dining', relativePosition: [0, 0], onSurface: 'floor', tags: ['table', 'large'] },
          { name: 'chair_1', category: 'furniture.chair.dining', relativePosition: [-0.3, 0], onSurface: 'floor', tags: ['seating'] },
          { name: 'chair_2', category: 'furniture.chair.dining', relativePosition: [0.3, 0], onSurface: 'floor', tags: ['seating'] },
          { name: 'sideboard', category: 'furniture.cabinet.sideboard', relativePosition: [0.7, -0.4], onSurface: 'floor', tags: ['storage'] },
          { name: 'chandelier', category: 'lighting.chandelier', relativePosition: [0, 0], onSurface: 'ceiling', tags: ['lighting'] },
        ];
      case RoomType.Hallway:
        return [
          { name: 'console_table', category: 'furniture.table.console', relativePosition: [0.5, 0], onSurface: 'wall', tags: ['table'] },
          { name: 'coat_rack', category: 'furniture.rack.coat', relativePosition: [-0.5, 0.3], onSurface: 'wall', tags: ['storage'] },
        ];
      case RoomType.Warehouse:
        return [
          { name: 'shelf_row_1', category: 'industrial.shelving.pallet', relativePosition: [-0.4, 0.4], onSurface: 'floor', tags: ['storage', 'large'] },
          { name: 'shelf_row_2', category: 'industrial.shelving.pallet', relativePosition: [0, 0.4], onSurface: 'floor', tags: ['storage', 'large'] },
          { name: 'shelf_row_3', category: 'industrial.shelving.pallet', relativePosition: [0.4, 0.4], onSurface: 'floor', tags: ['storage', 'large'] },
          { name: 'overhead_light_1', category: 'lighting.industrial.highbay', relativePosition: [-0.3, 0], onSurface: 'ceiling', tags: ['lighting'] },
          { name: 'overhead_light_2', category: 'lighting.industrial.highbay', relativePosition: [0.3, 0], onSurface: 'ceiling', tags: ['lighting'] },
        ];
      case RoomType.Garage:
        return [
          { name: 'car', category: 'vehicle.car', relativePosition: [0, 0], onSurface: 'floor', tags: ['vehicle', 'large'] },
          { name: 'workbench', category: 'furniture.workbench', relativePosition: [-0.6, 0.5], onSurface: 'wall', tags: ['workspace'] },
          { name: 'tool_cabinet', category: 'furniture.cabinet.tool', relativePosition: [0.6, 0.5], onSurface: 'wall', tags: ['storage'] },
        ];
      default:
        return [
          { name: 'storage_shelf', category: 'furniture.shelf.storage', relativePosition: [0, 0], onSurface: 'floor', tags: ['storage'] },
        ];
    }
  }
}

/** Furniture template for room decoration */
interface FurnitureTemplate {
  name: string;
  category: string;
  relativePosition: [number, number];
  onSurface: 'floor' | 'wall' | 'ceiling';
  tags: string[];
  rotationY?: number;
  scale?: [number, number, number];
}

/** Furniture placement result */
export interface FurniturePlacement {
  id: string;
  name: string;
  category: string;
  roomId: string;
  position: [number, number, number];
  rotationY: number;
  scale: [number, number, number];
  onSurface: 'floor' | 'wall' | 'ceiling';
  tags: string[];
}

// ============================================================================
// Main FloorPlanGenerator Class
// ============================================================================

/**
 * Main procedural floor plan generator.
 *
 * Orchestrates the entire pipeline:
 * 1. Build adjacency graph
 * 2. Generate building contour
 * 3. Segment contour into rooms
 * 4. Optimize layout with simulated annealing
 * 5. Solidify to 3D geometry
 * 6. Decorate with furniture
 */
export class FloorPlanGenerator {
  private params: Omit<Required<FloorPlanParams>, 'customAdjacencies'> & { customAdjacencies?: AdjacencyConstraint[] };
  private rng: SeededRandom;

  constructor(params: Partial<FloorPlanParams> & { seed: number }) {
    const defaults = BUILDING_DEFAULTS[params.style ?? BuildingStyle.Apartment];
    this.params = {
      seed: params.seed,
      totalArea: params.totalArea ?? defaults.totalArea ?? 80,
      roomCount: params.roomCount ?? defaults.roomCount ?? 5,
      roomTypes: params.roomTypes ?? defaults.roomTypes ?? [RoomType.LivingRoom, RoomType.Bedroom, RoomType.Kitchen, RoomType.Bathroom, RoomType.Hallway],
      style: params.style ?? BuildingStyle.Apartment,
      stories: params.stories ?? defaults.stories ?? 1,
      wallHeight: params.wallHeight ?? defaults.wallHeight ?? 2.8,
      wallThickness: params.wallThickness ?? defaults.wallThickness ?? 0.15,
      unit: params.unit ?? defaults.unit ?? 0.5,
      solverIterations: params.solverIterations ?? defaults.solverIterations ?? 200,
      generateGeometry: params.generateGeometry ?? true,
      customAdjacencies: params.customAdjacencies,
    };

    this.rng = new SeededRandom(this.params.seed);
  }

  /**
   * Generate a complete procedural floor plan.
   */
  generate(): FloorPlan {
    // Step 1: Build adjacency graph
    const graphBuilder = new RoomAdjacencyGraph(this.params.seed);
    const { nodes, edges } = graphBuilder.build(
      this.params.roomTypes,
      this.params.style,
      this.params.customAdjacencies,
    );

    // Build adjacency map
    const adjacencies = new Map<string, Set<string>>();
    const connections = new Map<string, Map<string, ConnectionType>>();
    for (const node of nodes) {
      adjacencies.set(node.id, new Set());
      connections.set(node.id, new Map());
    }
    for (const edge of edges) {
      adjacencies.get(edge.from)?.add(edge.to);
      adjacencies.get(edge.to)?.add(edge.from);
      connections.get(edge.from)?.set(edge.to, edge.type);
      connections.get(edge.to)?.set(edge.from, edge.type);
    }

    // Build room type map
    const roomTypes = new Map<string, RoomType>();
    const nodeIds: string[] = [];
    for (const node of nodes) {
      roomTypes.set(node.id, node.type);
      nodeIds.push(node.id);
    }

    // Step 2: Generate building contour
    const contourGen = new ContourGenerator(this.rng.nextInt(0, 100000));
    const slackness = 1.2; // Area slackness
    const contour = contourGen.generate(
      this.params.totalArea * slackness,
      this.params.unit,
    );

    // Step 3: Segment contour into rooms
    const segmenter = new RoomSegmenter(this.rng.nextInt(0, 100000), this.params.unit);
    const roomPolygons = segmenter.segment(
      contour,
      this.params.roomCount,
      this.params.roomTypes,
      adjacencies,
      nodeIds,
    );

    // Step 4: Build constraints for solver
    const constraints = this.buildConstraints();

    // Step 5: Optimize with simulated annealing
    const solver = new FloorPlanSolver(
      this.rng.nextInt(0, 100000),
      this.params.unit,
      this.params.wallThickness,
    );
    const { rooms: optimizedPolygons, energy } = solver.solve(
      roomPolygons,
      roomTypes,
      adjacencies,
      constraints,
      this.params.solverIterations,
    );

    // Step 6: Build Room objects
    const rooms = this.buildRooms(optimizedPolygons, roomTypes, adjacencies, connections);

    // Step 7: Build door and window lists
    const doors = rooms.flatMap(r => r.doors);
    const windows = rooms.flatMap(r => r.windows);

    // Step 8: Compute overall dimensions
    const contourBounds = polygonBounds(contour);

    // Step 9: Create floor plan object
    const floorPlan: FloorPlan = {
      id: `floorplan_${this.params.seed}`,
      style: this.params.style,
      width: contourBounds.maxX - contourBounds.minX,
      depth: contourBounds.maxY - contourBounds.minY,
      stories: this.params.stories,
      wallHeight: this.params.wallHeight,
      wallThickness: this.params.wallThickness,
      rooms,
      doors,
      windows,
      contour,
      constraints,
      energy,
    };

    // Step 10: Solidify to 3D geometry
    if (this.params.generateGeometry) {
      const solidifier = new RoomSolidifier(this.params.wallHeight, this.params.wallThickness);
      solidifier.solidify(floorPlan, optimizedPolygons, roomTypes, adjacencies, connections);
    }

    return floorPlan;
  }

  /** Build default building constraints */
  private buildConstraints(): BuildingConstraints {
    const roomSizes = new Map<RoomType, RoomSizeConstraint>();

    for (const type of this.params.roomTypes) {
      const typicalArea = ROOM_TYPICAL_AREAS[type] ?? 12;
      roomSizes.set(type, {
        roomType: type,
        minArea: typicalArea * 0.5,
        maxArea: typicalArea * 2.5,
        targetArea: typicalArea,
        minAspectRatio: 0.5,
        maxAspectRatio: 3.0,
      });
    }

    return {
      adjacencies: this.params.customAdjacencies ?? [],
      roomSizes,
      totalArea: this.params.totalArea,
      wallThickness: this.params.wallThickness,
      wallHeight: this.params.wallHeight,
      unit: this.params.unit,
    };
  }

  /** Build Room objects from optimized polygons */
  private buildRooms(
    polygons: Map<string, Polygon2D>,
    roomTypes: Map<string, RoomType>,
    adjacencies: Map<string, Set<string>>,
    connections: Map<string, Map<string, ConnectionType>>,
  ): Room[] {
    const rooms: Room[] = [];

    for (const [roomId, poly] of polygons) {
      const type = roomTypes.get(roomId);
      if (!type || type === RoomType.Exterior) continue;

      const area = polygonArea(poly);
      const centroid = polygonCentroid(poly);
      const bounds = polygonBounds(poly);
      const neighbors = Array.from(adjacencies.get(roomId) ?? []);

      // Build walls
      const walls = this.buildWalls(roomId, poly, neighbors, connections, polygons);

      // Build doors
      const doors = this.buildDoors(roomId, poly, neighbors, connections);

      // Build windows
      const windows = this.buildWindows(roomId, poly, neighbors, connections, polygons);

      const room: Room = {
        id: roomId,
        name: this.getRoomName(type, rooms.filter(r => r.type === type).length),
        type,
        level: 0,
        polygon: poly,
        area,
        centroid,
        bounds,
        adjacencies: neighbors,
        walls,
        doors,
        windows,
      };

      rooms.push(room);
    }

    return rooms;
  }

  /** Get display name for a room */
  private getRoomName(type: RoomType, index: number): string {
    const names: Record<string, string> = {
      [RoomType.Bedroom]: index === 0 ? 'Master Bedroom' : `Bedroom ${index + 1}`,
      [RoomType.Kitchen]: 'Kitchen',
      [RoomType.Bathroom]: index === 0 ? 'Main Bathroom' : `Bathroom ${index + 1}`,
      [RoomType.LivingRoom]: 'Living Room',
      [RoomType.DiningRoom]: 'Dining Room',
      [RoomType.Office]: index === 0 ? 'Office' : `Office ${index + 1}`,
      [RoomType.Hallway]: 'Hallway',
      [RoomType.Garage]: 'Garage',
      [RoomType.Storage]: 'Storage',
      [RoomType.Utility]: 'Utility Room',
      [RoomType.Closet]: 'Closet',
      [RoomType.Balcony]: 'Balcony',
      [RoomType.Warehouse]: 'Warehouse',
      [RoomType.OpenOffice]: 'Open Office',
      [RoomType.MeetingRoom]: 'Meeting Room',
      [RoomType.BreakRoom]: 'Break Room',
      [RoomType.Staircase]: 'Staircase',
      [RoomType.Entrance]: 'Entrance',
      [RoomType.Exterior]: 'Exterior',
    };
    return names[type] ?? type;
  }

  /** Build wall definitions for a room */
  private buildWalls(
    roomId: string,
    poly: Polygon2D,
    neighbors: string[],
    connections: Map<string, Map<string, ConnectionType>>,
    allPolygons: Map<string, Polygon2D>,
  ): Wall[] {
    const walls: Wall[] = [];
    const roomConnections = connections.get(roomId) ?? new Map();

    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const wallLength = dist2D(poly[i], poly[j]);

      if (wallLength < 0.1) continue;

      // Determine if this is an exterior wall
      const midX = (poly[i][0] + poly[j][0]) / 2;
      const midZ = (poly[i][1] + poly[j][1]) / 2;
      let isExterior = true;
      let connectsTo: string | undefined;
      let opening: WallOpening | undefined;

      // Check if adjacent to another room
      for (const neighborId of neighbors) {
        const neighborPoly = allPolygons.get(neighborId);
        if (!neighborPoly) continue;

        let minDist = Infinity;
        for (let ni = 0; ni < neighborPoly.length; ni++) {
          const nj = (ni + 1) % neighborPoly.length;
          const nMidX = (neighborPoly[ni][0] + neighborPoly[nj][0]) / 2;
          const nMidZ = (neighborPoly[ni][1] + neighborPoly[nj][1]) / 2;
          const d = Math.sqrt((midX - nMidX) ** 2 + (midZ - nMidZ) ** 2);
          minDist = Math.min(minDist, d);
        }

        if (minDist < this.params.wallThickness * 4) {
          isExterior = false;
          connectsTo = neighborId;

          const connType = roomConnections.get(neighborId) ?? ConnectionType.Wall;
          if (connType === ConnectionType.Door) {
            opening = {
              type: 'door',
              position: 0.5,
              width: 0.9,
              height: 2.1,
              sillHeight: 0,
            };
          } else if (connType === ConnectionType.Open) {
            opening = {
              type: 'open',
              position: 0.5,
              width: wallLength * 0.8,
              height: this.params.wallHeight,
              sillHeight: this.params.wallHeight * 0.3,
            };
          }
          break;
        }
      }

      // Add window on exterior walls
      if (isExterior && wallLength > 1.5) {
        opening = {
          type: 'window',
          position: 0.5,
          width: 1.2,
          height: 1.0,
          sillHeight: 1.0,
        };
      }

      walls.push({
        id: `${roomId}_wall_${i}`,
        start: poly[i],
        end: poly[j],
        thickness: this.params.wallThickness,
        height: this.params.wallHeight,
        isExterior,
        connectsTo,
        opening,
      });
    }

    return walls;
  }

  /** Build door definitions */
  private buildDoors(
    roomId: string,
    poly: Polygon2D,
    neighbors: string[],
    connections: Map<string, Map<string, ConnectionType>>,
  ): Door[] {
    const doors: Door[] = [];
    const roomConnections = connections.get(roomId) ?? new Map();

    for (const neighborId of neighbors) {
      const connType = roomConnections.get(neighborId);
      if (connType !== ConnectionType.Door) continue;

      // Find the wall that connects to this neighbor
      const centroid = polygonCentroid(poly);
      // Simplified: place door at room center, facing toward the neighbor
      doors.push({
        id: `${roomId}_door_${neighborId}`,
        position: new THREE.Vector3(centroid[0], 0, centroid[1]),
        rotationY: 0,
        width: 0.9,
        height: 2.1,
        roomId,
        connectsTo: neighborId,
      });
    }

    return doors;
  }

  /** Build window definitions */
  private buildWindows(
    roomId: string,
    poly: Polygon2D,
    neighbors: string[],
    connections: Map<string, Map<string, ConnectionType>>,
    allPolygons: Map<string, Polygon2D>,
  ): Window[] {
    const windows: Window[] = [];

    // Add windows on exterior walls
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const wallLength = dist2D(poly[i], poly[j]);

      if (wallLength < 1.5) continue;

      const midX = (poly[i][0] + poly[j][0]) / 2;
      const midZ = (poly[i][1] + poly[j][1]) / 2;

      // Check if this is an exterior wall
      let isExterior = true;
      for (const neighborId of neighbors) {
        const neighborPoly = allPolygons.get(neighborId);
        if (!neighborPoly) continue;
        let minDist = Infinity;
        for (let ni = 0; ni < neighborPoly.length; ni++) {
          const nj = (ni + 1) % neighborPoly.length;
          const nMidX = (neighborPoly[ni][0] + neighborPoly[nj][0]) / 2;
          const nMidZ = (neighborPoly[ni][1] + neighborPoly[nj][1]) / 2;
          const d = Math.sqrt((midX - nMidX) ** 2 + (midZ - nMidZ) ** 2);
          minDist = Math.min(minDist, d);
        }
        if (minDist < this.params.wallThickness * 4) {
          isExterior = false;
          break;
        }
      }

      if (isExterior) {
        const dx = poly[j][0] - poly[i][0];
        const dz = poly[j][1] - poly[i][1];
        const rotationY = Math.atan2(dx, dz);

        windows.push({
          id: `${roomId}_window_${i}`,
          position: new THREE.Vector3(midX, 1.5, midZ),
          rotationY,
          width: 1.2,
          height: 1.0,
          sillHeight: 1.0,
          roomId,
          wallId: `${roomId}_wall_${i}`,
          outdoorBackdrop: true,
        });
      }
    }

    return windows;
  }

  /** Decorate rooms with furniture placement data */
  decorate(rooms: Room[]): FurniturePlacement[] {
    const decorator = new FloorPlanDecorator(this.rng.nextInt(0, 100000));
    return decorator.decorate(rooms);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a procedural floor plan with the given parameters.
 *
 * @example
 * ```ts
 * const plan = createFloorPlan({
 *   seed: 42,
 *   totalArea: 100,
 *   roomCount: 5,
 *   roomTypes: [RoomType.LivingRoom, RoomType.Bedroom, RoomType.Kitchen, RoomType.Bathroom, RoomType.Hallway],
 *   style: BuildingStyle.Apartment,
 * });
 *
 * // Access 3D group
 * scene.add(plan.group);
 *
 * // Access room data
 * for (const room of plan.rooms) {
 *   console.log(`${room.name}: ${room.area}m²`);
 * }
 * ```
 */
export function createFloorPlan(params: Partial<FloorPlanParams> & { seed: number }): FloorPlan {
  const generator = new FloorPlanGenerator(params);
  return generator.generate();
}

/**
 * Decorate a floor plan with furniture placement data.
 */
export function decorateFloorPlan(
  floorPlan: FloorPlan,
  seed: number,
): FurniturePlacement[] {
  const decorator = new FloorPlanDecorator(seed);
  return decorator.decorate(floorPlan.rooms);
}
