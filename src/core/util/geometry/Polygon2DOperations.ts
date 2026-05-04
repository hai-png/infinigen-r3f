/**
 * Polygon2D Operations Module
 *
 * High-level 2D polygon operations built on top of the Martinez-Rueda-Feito
 * clipping algorithm for exact boolean operations, with additional geometric
 * utilities for floor plan generation and spatial reasoning.
 *
 * @module core/util/geometry
 */

import {
  union as martinezUnion,
  intersection as martinezIntersection,
  difference as martinezDifference,
  xor as martinezXor,
  type Point2D,
  type Polygon2D,
  type BooleanOp,
} from './MartinezPolygonClipping';

// Re-export types
export type { Point2D, Polygon2D, BooleanOp };

// ─── Constants ─────────────────────────────────────────────────────────────────

const EPS = 1e-10;

// ─── Core Polygon Operations ───────────────────────────────────────────────────

/**
 * PolygonOps provides a high-level API for 2D polygon operations.
 *
 * Boolean operations use the Martinez-Rueda-Feito algorithm for exact results.
 * Non-boolean operations use efficient direct implementations.
 */
export const PolygonOps = {
  // ── Boolean Operations (via Martinez) ───────────────────────────────────

  /** Compute the union of two polygons */
  union(subject: Polygon2D, clip: Polygon2D): Polygon2D[] {
    if (subject.length < 3 || clip.length < 3) return [];
    return martinezUnion(subject, clip);
  },

  /** Compute the intersection of two polygons */
  intersection(subject: Polygon2D, clip: Polygon2D): Polygon2D[] {
    if (subject.length < 3 || clip.length < 3) return [];
    return martinezIntersection(subject, clip);
  },

  /** Compute the difference (subject - clip) of two polygons */
  difference(subject: Polygon2D, clip: Polygon2D): Polygon2D[] {
    if (subject.length < 3 || clip.length < 3) return [];
    return martinezDifference(subject, clip);
  },

  /** Compute the symmetric difference (XOR) of two polygons */
  xor(subject: Polygon2D, clip: Polygon2D): Polygon2D[] {
    if (subject.length < 3 || clip.length < 3) return [];
    return martinezXor(subject, clip);
  },

  // ── Geometric Properties ───────────────────────────────────────────────

  /**
   * Compute the signed area of a polygon.
   * Positive = counter-clockwise, Negative = clockwise.
   */
  area(polygon: Polygon2D): number {
    let area = 0;
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += polygon[i][0] * polygon[j][1];
      area -= polygon[j][0] * polygon[i][1];
    }
    return area / 2;
  },

  /**
   * Compute the centroid of a polygon.
   * Returns the geometric center weighted by area.
   */
  centroid(polygon: Polygon2D): Point2D {
    const n = polygon.length;
    if (n === 0) return [0, 0];
    if (n === 1) return [polygon[0][0], polygon[0][1]];
    if (n === 2) {
      return [
        (polygon[0][0] + polygon[1][0]) / 2,
        (polygon[0][1] + polygon[1][1]) / 2,
      ];
    }

    let cx = 0;
    let cy = 0;
    let signedArea = 0;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const cross = polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1];
      signedArea += cross;
      cx += (polygon[i][0] + polygon[j][0]) * cross;
      cy += (polygon[i][1] + polygon[j][1]) * cross;
    }

    signedArea /= 2;

    if (Math.abs(signedArea) < EPS) {
      // Degenerate polygon: return simple average
      let sx = 0, sy = 0;
      for (const p of polygon) {
        sx += p[0];
        sy += p[1];
      }
      return [sx / n, sy / n];
    }

    cx /= (6 * signedArea);
    cy /= (6 * signedArea);

    return [cx, cy];
  },

  /**
   * Point-in-polygon test using ray casting algorithm.
   * Returns true if the point is inside the polygon (including on boundary).
   */
  contains(polygon: Polygon2D, point: Point2D): boolean {
    const [px, py] = point;
    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];

      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  },

  /**
   * Quick bounding-box intersection check.
   * Returns true if the bounding boxes of the two polygons overlap.
   * This is a necessary but not sufficient condition for polygon intersection.
   */
  bboxIntersects(a: Polygon2D, b: Polygon2D): boolean {
    const boundsA = this.bounds(a);
    const boundsB = this.bounds(b);

    return !(
      boundsA.maxX < boundsB.minX ||
      boundsA.minX > boundsB.maxX ||
      boundsA.maxY < boundsB.minY ||
      boundsA.minY > boundsB.maxY
    );
  },

  /**
   * Check if two polygons intersect.
   * Uses bounding box check first, then exact polygon intersection.
   */
  intersects(a: Polygon2D, b: Polygon2D): boolean {
    if (!this.bboxIntersects(a, b)) return false;
    const result = martinezIntersection(a, b);
    return result.length > 0 && result.some(p => p.length >= 3);
  },

  /**
   * Compute axis-aligned bounding box of a polygon.
   */
  bounds(polygon: Polygon2D): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const [x, y] of polygon) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    return { minX, minY, maxX, maxY };
  },

  /**
   * Compute perimeter of a polygon.
   */
  perimeter(polygon: Polygon2D): number {
    let perimeter = 0;
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = polygon[j][0] - polygon[i][0];
      const dy = polygon[j][1] - polygon[i][1];
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  },

  /**
   * Compute compactness of a polygon (4π * area / perimeter²).
   * Range [0, 1] where 1 is a perfect circle.
   */
  compactness(polygon: Polygon2D): number {
    const area = Math.abs(this.area(polygon));
    const perim = this.perimeter(polygon);
    if (perim === 0) return 0;
    return (4 * Math.PI * area) / (perim * perim);
  },

  // ── Polygon Transformations ────────────────────────────────────────────

  /**
   * Buffer (Minkowski sum with circle) approximation.
   * Offsets the polygon outward (positive distance) or inward (negative distance).
   * This is an approximation using vertex offset and arc insertion.
   */
  buffer(polygon: Polygon2D, distance: number, segments: number = 8): Polygon2D {
    return this.offset(polygon, distance, segments);
  },

  /**
   * Polygon offset (inset/outset).
   * Positive distance = outset (expand), Negative distance = inset (shrink).
   * Inserts arc segments at concave vertices for a smooth offset.
   */
  offset(polygon: Polygon2D, distance: number, arcSegments: number = 6): Polygon2D {
    if (polygon.length < 3) return [...polygon];

    const n = polygon.length;
    const result: Point2D[] = [];

    for (let i = 0; i < n; i++) {
      const prev = polygon[(i - 1 + n) % n];
      const curr = polygon[i];
      const next = polygon[(i + 1) % n];

      // Compute edge directions
      const dx1 = curr[0] - prev[0];
      const dy1 = curr[1] - prev[1];
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = next[0] - curr[0];
      const dy2 = next[1] - curr[1];
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      if (len1 < EPS || len2 < EPS) continue;

      // Outward normals for each edge
      const nx1 = -dy1 / len1;
      const ny1 = dx1 / len1;
      const nx2 = -dy2 / len2;
      const ny2 = dx2 / len2;

      // Offset the two adjacent edges
      const offsetX1 = curr[0] + nx1 * distance;
      const offsetY1 = curr[1] + ny1 * distance;
      const offsetX2 = curr[0] + nx2 * distance;
      const offsetY2 = curr[1] + ny2 * distance;

      // Check if this is a convex or concave corner
      const cross = dx1 * dy2 - dy1 * dx2;

      if (Math.abs(cross) < EPS) {
        // Straight line: just add the offset point
        result.push([offsetX1, offsetY1]);
      } else if ((distance > 0 && cross > 0) || (distance < 0 && cross < 0)) {
        // Concave corner: add both offset points (they form a miter)
        result.push([offsetX1, offsetY1]);
        result.push([offsetX2, offsetY2]);
      } else {
        // Convex corner: add arc segments
        const angle1 = Math.atan2(ny1, nx1);
        const angle2 = Math.atan2(ny2, nx2);

        // Determine arc direction
        let startAngle = angle1;
        let endAngle = angle2;

        // Normalize angles
        while (endAngle < startAngle) endAngle += 2 * Math.PI;
        if (endAngle - startAngle > Math.PI) {
          endAngle -= 2 * Math.PI;
        }

        // Generate arc points
        for (let s = 0; s <= arcSegments; s++) {
          const t = s / arcSegments;
          const angle = startAngle + t * (endAngle - startAngle);
          result.push([
            curr[0] + Math.cos(angle) * Math.abs(distance),
            curr[1] + Math.sin(angle) * Math.abs(distance),
          ]);
        }
      }
    }

    // Remove self-intersections using simple cleanup
    return this._removeSelfIntersections(result);
  },

  /**
   * Douglas-Peucker polygon simplification.
   * Reduces the number of vertices while preserving shape within tolerance.
   */
  simplify(polygon: Polygon2D, tolerance: number): Polygon2D {
    if (polygon.length <= 3) return [...polygon];

    // Find the point with maximum distance from the line segment
    // connecting the first and last points
    const n = polygon.length;
    let maxDist = 0;
    let maxIdx = 0;

    const first = polygon[0];
    const last = polygon[n - 1];

    for (let i = 1; i < n - 1; i++) {
      const dist = this._pointToSegmentDistance(polygon[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance) {
      // Recursively simplify
      const left = this.simplify(polygon.slice(0, maxIdx + 1), tolerance);
      const right = this.simplify(polygon.slice(maxIdx), tolerance);
      return [...left.slice(0, -1), ...right];
    } else {
      return [first, last];
    }
  },

  /**
   * Quickhull convex hull algorithm.
   * Returns the convex hull of a set of 2D points.
   */
  convexHull(points: Point2D[]): Polygon2D {
    if (points.length < 3) return [...points];

    // Find extreme points
    let minX = 0, maxX = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] < points[minX][0]) minX = i;
      if (points[i][0] > points[maxX][0]) maxX = i;
    }

    const hull: Point2D[] = [];

    // Build hull using divide-and-conquer
    this._quickHullRecursive(points, points[minX], points[maxX], 1, hull);
    this._quickHullRecursive(points, points[minX], points[maxX], -1, hull);

    // Sort hull points by angle from centroid
    if (hull.length < 3) return [...points];

    const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
    const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;

    hull.sort((a, b) => {
      return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx);
    });

    return hull;
  },

  // ── Helper methods ──────────────────────────────────────────────────────

  /**
   * Ensure polygon is counter-clockwise.
   */
  ensureCCW(polygon: Polygon2D): Polygon2D {
    if (this.area(polygon) < 0) {
      return [...polygon].reverse();
    }
    return [...polygon];
  },

  /**
   * Ensure polygon is clockwise.
   */
  ensureCW(polygon: Polygon2D): Polygon2D {
    if (this.area(polygon) > 0) {
      return [...polygon].reverse();
    }
    return [...polygon];
  },

  /**
   * Create a rectangle polygon from bounds.
   */
  rect(minX: number, minY: number, maxX: number, maxY: number): Polygon2D {
    return [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
  },

  /**
   * Distance between two 2D points.
   */
  distance(a: Point2D, b: Point2D): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  },

  /**
   * Merge two polygons by taking their convex hull.
   * This is a fast but approximate merge. For exact union, use `union()`.
   */
  mergeHull(a: Polygon2D, b: Polygon2D): Polygon2D {
    return this.convexHull([...a, ...b]);
  },

  // ── Private helpers ──────────────────────────────────────────────────────

  _pointToSegmentDistance(point: Point2D, a: Point2D, b: Point2D): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;

    if (lenSq < EPS) return this.distance(point, a);

    let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = a[0] + t * dx;
    const projY = a[1] + t * dy;
    const ddx = point[0] - projX;
    const ddy = point[1] - projY;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  },

  _quickHullRecursive(
    points: Point2D[],
    lineA: Point2D,
    lineB: Point2D,
    side: number,
    hull: Point2D[],
  ): void {
    let maxDist = 0;
    let maxPoint: Point2D | null = null;

    for (const p of points) {
      const dist = this._signedDistanceToLine(p, lineA, lineB);
      if (dist * side > 0 && Math.abs(dist) > maxDist) {
        maxDist = Math.abs(dist);
        maxPoint = p;
      }
    }

    if (maxPoint === null) {
      // No points on this side: add the line endpoints to hull
      if (!hull.some(h => Math.abs(h[0] - lineA[0]) < EPS && Math.abs(h[1] - lineA[1]) < EPS)) {
        hull.push(lineA);
      }
      if (!hull.some(h => Math.abs(h[0] - lineB[0]) < EPS && Math.abs(h[1] - lineB[1]) < EPS)) {
        hull.push(lineB);
      }
      return;
    }

    // Recurse on the two sub-problems
    this._quickHullRecursive(points, lineA, maxPoint, side, hull);
    this._quickHullRecursive(points, maxPoint, lineB, side, hull);
  },

  _signedDistanceToLine(point: Point2D, a: Point2D, b: Point2D): number {
    return ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])) /
      Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
  },

  _removeSelfIntersections(polygon: Polygon2D): Polygon2D {
    // Simple self-intersection removal: remove duplicate consecutive points
    // and very short edges. A full implementation would use Bentley-Ottmann.
    if (polygon.length < 3) return polygon;

    const cleaned: Point2D[] = [polygon[0]];
    for (let i = 1; i < polygon.length; i++) {
      const prev = cleaned[cleaned.length - 1];
      const curr = polygon[i];
      const dx = curr[0] - prev[0];
      const dy = curr[1] - prev[1];
      if (dx * dx + dy * dy > EPS * EPS) {
        cleaned.push(curr);
      }
    }

    // Remove last point if it duplicates the first
    if (cleaned.length > 1) {
      const first = cleaned[0];
      const last = cleaned[cleaned.length - 1];
      if (Math.abs(first[0] - last[0]) < EPS && Math.abs(first[1] - last[1]) < EPS) {
        cleaned.pop();
      }
    }

    return cleaned;
  },
};

/**
 * Filename-matching alias for backward compat.
 * `import Polygon2DOperations from './Polygon2DOperations'` and
 * `import { Polygon2DOperations } from './Polygon2DOperations'` both work.
 */
export { PolygonOps as Polygon2DOperations };
export default Polygon2DOperations;
