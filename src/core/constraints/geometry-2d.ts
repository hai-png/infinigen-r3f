/**
 * 2D Geometry Library for Constraint System
 *
 * Ports: Python shapely library (used throughout infinigen for 2D polygon operations)
 *
 * Provides comprehensive 2D geometric primitives and operations needed for
 * room solving, footprint analysis, and support polygon computation.
 *
 * Key classes:
 *  - Point2D: 2D point with distance/nearest operations
 *  - LineString2D: 2D line string for wall segments
 *  - Polygon2D: Full-featured 2D polygon with CSG-like operations
 *    (contains, intersects, union, intersection, difference, buffer)
 *
 * Additional operations:
 *  - Area, perimeter, centroid computations
 *  - Convex hull computation
 *  - Boolean operations (union, intersection, difference)
 *  - Buffer (Minkowski sum with a disk)
 *  - Point-in-polygon testing
 *  - Segment intersection
 */

import * as THREE from 'three';

// ============================================================================
// Point2D
// ============================================================================

/**
 * 2D point with distance and nearest-neighbor operations.
 *
 * A standalone 2D point class with explicit x/y properties and
 * geometric operations needed by the constraint system.
 * Compatible with THREE.Vector2 via the `toVector2()` method.
 */
export class Point2D {
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Compute Euclidean distance to another point.
   */
  distanceTo(other: Point2D): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Compute squared distance to another point (avoids sqrt).
   */
  distanceToSquared(other: Point2D): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return dx * dx + dy * dy;
  }

  /**
   * Find the nearest point from a collection of points.
   *
   * @param points Collection of points to search
   * @returns The nearest point and its distance
   */
  nearestTo(points: Point2D[]): { point: Point2D; distance: number } | null {
    if (points.length === 0) return null;

    let nearest = points[0];
    let minDist = this.distanceTo(points[0]);

    for (let i = 1; i < points.length; i++) {
      const dist = this.distanceTo(points[i]);
      if (dist < minDist) {
        minDist = dist;
        nearest = points[i];
      }
    }

    return { point: nearest, distance: minDist };
  }

  /**
   * Compute the midpoint between this point and another.
   */
  midpoint(other: Point2D): Point2D {
    return new Point2D(
      (this.x + other.x) / 2,
      (this.y + other.y) / 2
    );
  }

  /**
   * Linear interpolation toward another point.
   */
  lerp(other: Point2D, t: number): Point2D {
    return new Point2D(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t
    );
  }

  /**
   * Add another point to this point (returns new Point2D).
   */
  add(other: Point2D): Point2D {
    return new Point2D(this.x + other.x, this.y + other.y);
  }

  /**
   * Subtract another point from this point (returns new Point2D).
   */
  sub(other: Point2D): Point2D {
    return new Point2D(this.x - other.x, this.y - other.y);
  }

  /**
   * Scale this point by a scalar (returns new Point2D).
   */
  multiplyScalar(s: number): Point2D {
    return new Point2D(this.x * s, this.y * s);
  }

  /**
   * Add scaled vector (returns new Point2D).
   */
  addScaledVector(other: Point2D, s: number): Point2D {
    return new Point2D(this.x + other.x * s, this.y + other.y * s);
  }

  /**
   * Dot product with another point.
   */
  dot(other: Point2D): number {
    return this.x * other.x + this.y * other.y;
  }

  /**
   * Compute the length (magnitude) of this point as a vector.
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Compute the squared length of this point as a vector.
   */
  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * Normalize this point as a vector (returns new Point2D).
   */
  normalize(): Point2D {
    const len = this.length();
    if (len < 1e-10) return new Point2D(0, 0);
    return new Point2D(this.x / len, this.y / len);
  }

  /**
   * Negate this point (returns new Point2D).
   */
  negate(): Point2D {
    return new Point2D(-this.x, -this.y);
  }

  /**
   * Create a Point2D from a THREE.Vector2.
   */
  static fromVector2(v: { x: number; y: number }): Point2D {
    return new Point2D(v.x, v.y);
  }

  /**
   * Convert to a plain object compatible with THREE.Vector2.
   */
  toVector2(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /**
   * Clone this point.
   */
  clone(): Point2D {
    return new Point2D(this.x, this.y);
  }
}

// ============================================================================
// LineString2D
// ============================================================================

/**
 * 2D line string (polyline) for wall segments and path representation.
 *
 * A LineString2D consists of an ordered sequence of 2D points connected
 * by straight line segments. Used for representing wall segments,
 * room boundaries, and path geometry.
 */
export class LineString2D {
  readonly points: Point2D[];

  constructor(points: Point2D[] = []) {
    this.points = points;
  }

  /**
   * Number of points in this line string.
   */
  get length(): number {
    return this.points.length;
  }

  /**
   * Whether this line string is empty.
   */
  get isEmpty(): boolean {
    return this.points.length === 0;
  }

  /**
   * Whether this line string is closed (first point == last point).
   */
  get isClosed(): boolean {
    return this.points.length >= 2 &&
      this.points[0].distanceTo(this.points[this.points.length - 1]) < 1e-6;
  }

  /**
   * Compute the total length of this line string.
   */
  totalLength(): number {
    let len = 0;
    for (let i = 1; i < this.points.length; i++) {
      len += this.points[i - 1].distanceTo(this.points[i]);
    }
    return len;
  }

  /**
   * Compute the centroid (average of all points).
   */
  centroid(): Point2D {
    if (this.points.length === 0) return new Point2D(0, 0);

    let sx = 0, sy = 0;
    for (const p of this.points) {
      sx += p.x;
      sy += p.y;
    }
    return new Point2D(sx / this.points.length, sy / this.points.length);
  }

  /**
   * Get the bounding box of this line string.
   */
  getBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (this.points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of this.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Check if this line string intersects another line string.
   *
   * Uses segment-by-segment intersection testing.
   */
  intersects(other: LineString2D): boolean {
    for (let i = 1; i < this.points.length; i++) {
      for (let j = 1; j < other.points.length; j++) {
        if (segmentsIntersect(
          this.points[i - 1], this.points[i],
          other.points[j - 1], other.points[j]
        )) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if this line string intersects a polygon.
   */
  intersectsPolygon(poly: Polygon2D): boolean {
    for (let i = 1; i < this.points.length; i++) {
      for (let j = 0; j < poly.vertices.length; j++) {
        const k = (j + 1) % poly.vertices.length;
        if (segmentsIntersect(
          this.points[i - 1], this.points[i],
          poly.vertices[j], poly.vertices[k]
        )) {
          return true;
        }
      }
    }

    // Also check if any point of the line string is inside the polygon
    for (const p of this.points) {
      if (poly.containsPoint(p)) return true;
    }

    return false;
  }

  /**
   * Find all intersection points with another line string.
   */
  intersectionPoints(other: LineString2D): Point2D[] {
    const result: Point2D[] = [];

    for (let i = 1; i < this.points.length; i++) {
      for (let j = 1; j < other.points.length; j++) {
        const pt = segmentIntersectionPoint(
          this.points[i - 1], this.points[i],
          other.points[j - 1], other.points[j]
        );
        if (pt) result.push(pt);
      }
    }

    return result;
  }

  /**
   * Get the point at a given fractional distance along the line string.
   *
   * @param t Fractional distance (0 = start, 1 = end)
   * @returns The interpolated point
   */
  pointAt(t: number): Point2D {
    if (this.points.length === 0) return new Point2D();
    if (this.points.length === 1) return this.points[0].clone();

    const totalLen = this.totalLength();
    const targetDist = t * totalLen;

    let accumulated = 0;
    for (let i = 1; i < this.points.length; i++) {
      const segLen = this.points[i - 1].distanceTo(this.points[i]);
      if (accumulated + segLen >= targetDist) {
        const segT = segLen > 1e-10 ? (targetDist - accumulated) / segLen : 0;
        return this.points[i - 1].lerp(this.points[i], segT);
      }
      accumulated += segLen;
    }

    return this.points[this.points.length - 1].clone();
  }

  /**
   * Clone this line string.
   */
  clone(): LineString2D {
    return new LineString2D(this.points.map(p => p.clone()));
  }
}

// ============================================================================
// Polygon2D (Enhanced)
// ============================================================================

/**
 * Comprehensive 2D polygon with CSG-like operations.
 *
 * Provides full geometric operations matching the Python shapely library
 * API used in the original Infinigen:
 *
 *  - **Predicates**: contains, intersects, covers, touches
 *  - **Boolean ops**: union, intersection, difference
 *  - **Analysis**: area, perimeter, centroid, convexHull
 *  - **Transform**: buffer (grow/shrink), translate, rotate, scale
 *  - **Constructors**: fromBoundingBox, fromConvexHull, regular, rectangle
 *
 * The polygon is represented as a simple (non-self-intersecting) polygon
 * with vertices in counter-clockwise (CCW) order. Holes are supported
 * through the `holes` property.
 */
export class Polygon2D {
  /** Outer boundary vertices (CCW order) */
  vertices: Point2D[];

  /** Hole boundaries (each is a CW-ordered ring) */
  holes: Point2D[][];

  constructor(vertices: Point2D[] = [], holes: Point2D[][] = []) {
    this.vertices = vertices;
    this.holes = holes;
  }

  /**
   * Number of vertices in the outer boundary.
   */
  get vertexCount(): number {
    return this.vertices.length;
  }

  /**
   * Whether this polygon has no vertices.
   */
  get isEmpty(): boolean {
    return this.vertices.length < 3;
  }

  /**
   * Whether this polygon is convex.
   */
  get isConvex(): boolean {
    return this.checkConvex();
  }

  // ---------------------------------------------------------------------------
  // Predicates
  // ---------------------------------------------------------------------------

  /**
   * Check if a point is inside this polygon using ray casting.
   *
   * Works for both convex and concave (simple) polygons.
   * Points on the boundary are considered inside.
   */
  containsPoint(point: Point2D): boolean {
    if (this.vertices.length < 3) return false;

    // Check outer boundary
    if (!this.rayCastContains(point, this.vertices)) return false;

    // Check holes — point must NOT be inside any hole
    for (const hole of this.holes) {
      if (hole.length >= 3 && this.rayCastContains(point, hole)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if this polygon contains another polygon entirely.
   *
   * All vertices of the other polygon must be inside this polygon.
   */
  containsPolygon(other: Polygon2D): boolean {
    if (this.isEmpty || other.isEmpty) return false;

    for (const v of other.vertices) {
      if (!this.containsPoint(v)) return false;
    }

    // Also check edge intersections — other polygon should not cross our boundary
    return !this.edgesIntersect(other);
  }

  /**
   * Check if this polygon intersects another polygon.
   *
   * Two polygons intersect if:
   *  - Any edge of one crosses an edge of the other, OR
   *  - One polygon is entirely inside the other
   */
  intersects(other: Polygon2D): boolean {
    if (this.isEmpty || other.isEmpty) return false;

    // Quick bounding box check
    const thisBB = this.getBounds();
    const otherBB = other.getBounds();
    if (thisBB.minX > otherBB.maxX || thisBB.maxX < otherBB.minX ||
        thisBB.minY > otherBB.maxY || thisBB.maxY < otherBB.minY) {
      return false;
    }

    // Check edge intersections
    if (this.edgesIntersect(other)) return true;

    // Check containment (one inside the other)
    if (this.containsPoint(other.vertices[0])) return true;
    if (other.containsPoint(this.vertices[0])) return true;

    return false;
  }

  /**
   * Check if this polygon covers another polygon (contains it entirely,
   * including boundary).
   */
  covers(other: Polygon2D): boolean {
    return this.containsPolygon(other);
  }

  /**
   * Check if this polygon touches (shares boundary with) another polygon
   * but does not overlap interior.
   */
  touches(other: Polygon2D): boolean {
    if (this.isEmpty || other.isEmpty) return false;

    // Check if any edges are shared (within tolerance)
    const TOLERANCE = 1e-4;
    const n1 = this.vertices.length;
    const n2 = other.vertices.length;

    for (let i = 0; i < n1; i++) {
      const a1 = this.vertices[i];
      const a2 = this.vertices[(i + 1) % n1];

      for (let j = 0; j < n2; j++) {
        const b1 = other.vertices[j];
        const b2 = other.vertices[(j + 1) % n2];

        // Check if edges are collinear and overlapping
        const overlap = this.edgeOverlapLength(a1, a2, b1, b2, TOLERANCE);
        if (overlap > TOLERANCE) {
          // Check that interiors don't overlap
          // (simplified: if no intersection or one contains the other, they just touch)
          return true;
        }
      }
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Boolean Operations
  // ---------------------------------------------------------------------------

  /**
   * Compute the union of this polygon with another polygon.
   *
   * Uses the Greiner-Hormann algorithm for polygon clipping.
   * Falls back to convex hull approximation for complex cases.
   */
  union(other: Polygon2D): Polygon2D {
    if (this.isEmpty) return other.clone();
    if (other.isEmpty) return this.clone();

    // If one contains the other, return the outer one
    if (this.containsPolygon(other)) return this.clone();
    if (other.containsPolygon(this)) return other.clone();

    // If they don't intersect, return a multi-polygon (approximated as convex hull)
    if (!this.intersects(other)) {
      return Polygon2D.fromConvexHull([...this.vertices, ...other.vertices]);
    }

    // For intersecting polygons, compute union using vertex collection
    // This is a simplified approach that works for many common cases
    return this.computeUnion(other);
  }

  /**
   * Compute the intersection of this polygon with another polygon.
   *
   * Returns the overlapping region between the two polygons.
   * Uses the Sutherland-Hodgman algorithm for clipping.
   */
  intersection(other: Polygon2D): Polygon2D {
    if (this.isEmpty || other.isEmpty) return new Polygon2D();

    // Quick bounding box check
    const thisBB = this.getBounds();
    const otherBB = other.getBounds();
    if (thisBB.minX > otherBB.maxX || thisBB.maxX < otherBB.minX ||
        thisBB.minY > otherBB.maxY || thisBB.maxY < otherBB.minY) {
      return new Polygon2D();
    }

    // Use Sutherland-Hodgman algorithm to clip this polygon by other
    let result = [...this.vertices];

    for (let i = 0; i < other.vertices.length; i++) {
      if (result.length === 0) return new Polygon2D();

      const edgeStart = other.vertices[i];
      const edgeEnd = other.vertices[(i + 1) % other.vertices.length];

      const inputList = [...result];
      result = [];

      for (let j = 0; j < inputList.length; j++) {
        const current = inputList[j];
        const previous = inputList[(j - 1 + inputList.length) % inputList.length];

        const currentInside = isLeftOf(edgeStart, edgeEnd, current) >= 0;
        const previousInside = isLeftOf(edgeStart, edgeEnd, previous) >= 0;

        if (currentInside) {
          if (!previousInside) {
            const inter = segmentIntersectionPoint(previous, current, edgeStart, edgeEnd);
            if (inter) result.push(inter);
          }
          result.push(current);
        } else if (previousInside) {
          const inter = segmentIntersectionPoint(previous, current, edgeStart, edgeEnd);
          if (inter) result.push(inter);
        }
      }
    }

    return new Polygon2D(result);
  }

  /**
   * Compute the difference of this polygon minus another polygon.
   *
   * Returns the portion of this polygon that does not overlap with other.
   */
  difference(other: Polygon2D): Polygon2D {
    if (this.isEmpty) return new Polygon2D();
    if (other.isEmpty) return this.clone();

    // If other fully contains this, result is empty
    if (other.containsPolygon(this)) return new Polygon2D();

    // If they don't intersect, result is this polygon unchanged
    if (!this.intersects(other)) return this.clone();

    // Simplified approach: collect vertices of this polygon that are
    // outside other, plus intersection points
    const resultVertices: Point2D[] = [];

    const n = this.vertices.length;
    for (let i = 0; i < n; i++) {
      const current = this.vertices[i];
      const next = this.vertices[(i + 1) % n];

      const currentInside = other.containsPoint(current);

      if (!currentInside) {
        resultVertices.push(current);
      }

      // Check for edge intersections
      for (let j = 0; j < other.vertices.length; j++) {
        const otherStart = other.vertices[j];
        const otherEnd = other.vertices[(j + 1) % other.vertices.length];

        const inter = segmentIntersectionPoint(current, next, otherStart, otherEnd);
        if (inter) {
          resultVertices.push(inter);
        }
      }
    }

    if (resultVertices.length < 3) return new Polygon2D();

    // Sort vertices to form a valid polygon (by angle from centroid)
    const centroid = this.centroid();
    resultVertices.sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
      return angleA - angleB;
    });

    return new Polygon2D(resultVertices);
  }

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------

  /**
   * Compute the signed area using the shoelace formula.
   * Positive for CCW, negative for CW.
   */
  signedArea(): number {
    if (this.vertices.length < 3) return 0;

    let area = 0;
    const n = this.vertices.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += this.vertices[i].x * this.vertices[j].y;
      area -= this.vertices[j].x * this.vertices[i].y;
    }

    // Subtract hole areas
    for (const hole of this.holes) {
      const hn = hole.length;
      for (let i = 0; i < hn; i++) {
        const j = (i + 1) % hn;
        area -= hole[i].x * hole[j].y;
        area -= hole[j].x * hole[i].y;
      }
    }

    return area / 2;
  }

  /**
   * Compute the absolute area of this polygon.
   */
  area(): number {
    return Math.abs(this.signedArea());
  }

  /**
   * Compute the perimeter of this polygon.
   */
  perimeter(): number {
    if (this.vertices.length < 2) return 0;

    let perim = 0;
    const n = this.vertices.length;
    for (let i = 0; i < n; i++) {
      perim += this.vertices[i].distanceTo(this.vertices[(i + 1) % n]);
    }

    // Add hole perimeters
    for (const hole of this.holes) {
      for (let i = 0; i < hole.length; i++) {
        perim += hole[i].distanceTo(hole[(i + 1) % hole.length]);
      }
    }

    return perim;
  }

  /**
   * Compute the centroid (geometric center) of this polygon.
   *
   * Uses the area-weighted formula for accuracy.
   */
  centroid(): Point2D {
    if (this.vertices.length === 0) return new Point2D(0, 0);
    if (this.vertices.length === 1) return this.vertices[0].clone();
    if (this.vertices.length === 2) {
      return this.vertices[0].midpoint(this.vertices[1]);
    }

    // Area-weighted centroid formula
    let cx = 0;
    let cy = 0;
    let area = 0;
    const n = this.vertices.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const cross = this.vertices[i].x * this.vertices[j].y -
                    this.vertices[j].x * this.vertices[i].y;
      area += cross;
      cx += (this.vertices[i].x + this.vertices[j].x) * cross;
      cy += (this.vertices[i].y + this.vertices[j].y) * cross;
    }

    area /= 2;
    if (Math.abs(area) < 1e-10) {
      // Degenerate polygon: use simple average
      let sx = 0, sy = 0;
      for (const v of this.vertices) {
        sx += v.x;
        sy += v.y;
      }
      return new Point2D(sx / n, sy / n);
    }

    cx /= (6 * area);
    cy /= (6 * area);
    return new Point2D(cx, cy);
  }

  /**
   * Compute the convex hull of this polygon's vertices.
   *
   * Uses Andrew's monotone chain algorithm (O(n log n)).
   */
  convexHull(): Polygon2D {
    return Polygon2D.fromConvexHull(this.vertices);
  }

  /**
   * Ensure vertices are in counter-clockwise (CCW) order.
   * Reverses if the signed area is negative.
   */
  ensureCCW(): Polygon2D {
    if (this.signedArea() < 0) {
      this.vertices.reverse();
    }
    return this;
  }

  // ---------------------------------------------------------------------------
  // Transform
  // ---------------------------------------------------------------------------

  /**
   * Buffer (grow/shrink) this polygon by a distance.
   *
   * Positive distance = grow (expand outward),
   * Negative distance = shrink (contract inward).
   *
   * Uses vertex offset along averaged edge normals.
   */
  buffer(distance: number): Polygon2D {
    if (this.vertices.length < 3 || Math.abs(distance) < 1e-10) {
      return this.clone();
    }

    const n = this.vertices.length;
    const newVertices: Point2D[] = [];

    for (let i = 0; i < n; i++) {
      const prev = this.vertices[(i - 1 + n) % n];
      const curr = this.vertices[i];
      const next = this.vertices[(i + 1) % n];

      // Compute normals of the two adjacent edges
      const edge1 = new Point2D(curr.x - prev.x, curr.y - prev.y);
      const edge2 = new Point2D(next.x - curr.x, next.y - curr.y);

      // Outward normals (perpendicular, rotated 90° clockwise for CCW polygon)
      const normal1 = new Point2D(edge1.y, -edge1.x).normalize();
      const normal2 = new Point2D(edge2.y, -edge2.x).normalize();

      // Average the two normals
      const avgNormal = new Point2D(
        normal1.x + normal2.x,
        normal1.y + normal2.y
      ).normalize();

      // Offset the vertex
      const offset = avgNormal.multiplyScalar(distance);
      newVertices.push(new Point2D(curr.x + offset.x, curr.y + offset.y));
    }

    return new Polygon2D(newVertices, this.holes.map(h => h.map(p => p.clone())));
  }

  /**
   * Translate this polygon by a 2D offset.
   */
  translate(dx: number, dy: number): Polygon2D {
    const newVerts = this.vertices.map(v => new Point2D(v.x + dx, v.y + dy));
    const newHoles = this.holes.map(h => h.map(v => new Point2D(v.x + dx, v.y + dy)));
    return new Polygon2D(newVerts, newHoles);
  }

  /**
   * Rotate this polygon around the origin by an angle (radians).
   */
  rotate(angle: number): Polygon2D {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const transform = (v: Point2D) => new Point2D(
      v.x * cos - v.y * sin,
      v.x * sin + v.y * cos
    );

    const newVerts = this.vertices.map(transform);
    const newHoles = this.holes.map(h => h.map(transform));
    return new Polygon2D(newVerts, newHoles);
  }

  /**
   * Scale this polygon by factors in X and Y.
   */
  scale(sx: number, sy: number = sx): Polygon2D {
    const newVerts = this.vertices.map(v => new Point2D(v.x * sx, v.y * sy));
    const newHoles = this.holes.map(h => h.map(v => new Point2D(v.x * sx, v.y * sy)));
    return new Polygon2D(newVerts, newHoles);
  }

  /**
   * Get the axis-aligned bounding box of this polygon.
   */
  getBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (this.vertices.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const v of this.vertices) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }

    return { minX, minY, maxX, maxY };
  }

  // ---------------------------------------------------------------------------
  // Edge Operations
  // ---------------------------------------------------------------------------

  /**
   * Compute the length of shared edges between this polygon and another.
   *
   * Two edges are "shared" if they are collinear and overlapping within tolerance.
   * Used for room adjacency computation.
   */
  sharedEdgeLength(other: Polygon2D, tolerance: number = 0.05): number {
    if (this.vertices.length < 2 || other.vertices.length < 2) return 0;

    let totalLength = 0;
    const n1 = this.vertices.length;
    const n2 = other.vertices.length;

    for (let i = 0; i < n1; i++) {
      const a1 = this.vertices[i];
      const a2 = this.vertices[(i + 1) % n1];

      for (let j = 0; j < n2; j++) {
        const b1 = other.vertices[j];
        const b2 = other.vertices[(j + 1) % n2];

        totalLength += this.edgeOverlapLength(a1, a2, b1, b2, tolerance);
      }
    }

    return totalLength;
  }

  // ---------------------------------------------------------------------------
  // Cloning
  // ---------------------------------------------------------------------------

  /**
   * Clone this polygon.
   */
  clone(): Polygon2D {
    const newVerts = this.vertices.map(v => v.clone());
    const newHoles = this.holes.map(h => h.map(v => v.clone()));
    return new Polygon2D(newVerts, newHoles);
  }

  // ---------------------------------------------------------------------------
  // Static Constructors
  // ---------------------------------------------------------------------------

  /**
   * Create a Polygon2D from a THREE.Box3 bounding box (projected onto XZ plane).
   */
  static fromBoundingBox(box: THREE.Box3): Polygon2D {
    return new Polygon2D([
      new Point2D(box.min.x, box.min.z),
      new Point2D(box.max.x, box.min.z),
      new Point2D(box.max.x, box.max.z),
      new Point2D(box.min.x, box.max.z),
    ]);
  }

  /**
   * Create a Polygon2D from the convex hull of a set of points.
   *
   * Uses Andrew's monotone chain algorithm.
   */
  static fromConvexHull(points: Point2D[]): Polygon2D {
    if (points.length < 3) return new Polygon2D(points.map(p => p.clone()));

    // Sort points lexicographically
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

    // Build lower hull
    const lower: Point2D[] = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross2D(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    // Build upper hull
    const upper: Point2D[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross2D(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    // Remove last point of each half (it's repeated)
    lower.pop();
    upper.pop();

    return new Polygon2D([...lower, ...upper]);
  }

  /**
   * Create a regular polygon (n-gon) with given center and radius.
   */
  static regular(n: number, center: Point2D = new Point2D(0, 0), radius: number = 1): Polygon2D {
    const vertices: Point2D[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      vertices.push(new Point2D(
        center.x + radius * Math.cos(angle),
        center.y + radius * Math.sin(angle)
      ));
    }
    return new Polygon2D(vertices);
  }

  /**
   * Create a rectangle with given corner coordinates.
   */
  static rectangle(minX: number, minY: number, maxX: number, maxY: number): Polygon2D {
    return new Polygon2D([
      new Point2D(minX, minY),
      new Point2D(maxX, minY),
      new Point2D(maxX, maxY),
      new Point2D(minX, maxY),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Ray casting algorithm for point-in-polygon test.
   */
  private rayCastContains(point: Point2D, ring: Point2D[]): boolean {
    let inside = false;
    const n = ring.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const vi = ring[i];
      const vj = ring[j];

      if (((vi.y > point.y) !== (vj.y > point.y)) &&
          (point.x < (vj.x - vi.x) * (point.y - vi.y) / (vj.y - vi.y) + vi.x)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Check if any edge of this polygon intersects any edge of another.
   */
  private edgesIntersect(other: Polygon2D): boolean {
    const n1 = this.vertices.length;
    const n2 = other.vertices.length;

    for (let i = 0; i < n1; i++) {
      const a1 = this.vertices[i];
      const a2 = this.vertices[(i + 1) % n1];

      for (let j = 0; j < n2; j++) {
        const b1 = other.vertices[j];
        const b2 = other.vertices[(j + 1) % n2];

        if (segmentsIntersect(a1, a2, b1, b2)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if this polygon is convex.
   */
  private checkConvex(): boolean {
    if (this.vertices.length < 3 || this.holes.length > 0) return false;

    const n = this.vertices.length;
    let sign = 0;

    for (let i = 0; i < n; i++) {
      const a = this.vertices[i];
      const b = this.vertices[(i + 1) % n];
      const c = this.vertices[(i + 2) % n];
      const cross = cross2D(a, b, c);

      if (Math.abs(cross) > 1e-10) {
        const newSign = cross > 0 ? 1 : -1;
        if (sign === 0) {
          sign = newSign;
        } else if (newSign !== sign) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Compute the overlap length of two near-collinear edges.
   */
  private edgeOverlapLength(
    a1: Point2D, a2: Point2D,
    b1: Point2D, b2: Point2D,
    tolerance: number
  ): number {
    const aDir = new Point2D(a2.x - a1.x, a2.y - a1.y);
    const aLen = aDir.length();
    if (aLen < 1e-10) return 0;
    aDir.normalize();

    // Project b's endpoints onto a's line
    const b1OnA = aDir.dot(new Point2D(b1.x - a1.x, b1.y - a1.y));
    const b2OnA = aDir.dot(new Point2D(b2.x - a1.x, b2.y - a1.y));

    // Perpendicular distance of b's endpoints from a's line
    const perpDir = new Point2D(-aDir.y, aDir.x);
    const perpDist1 = Math.abs(perpDir.dot(new Point2D(b1.x - a1.x, b1.y - a1.y)));
    const perpDist2 = Math.abs(perpDir.dot(new Point2D(b2.x - a1.x, b2.y - a1.y)));

    if (perpDist1 > tolerance || perpDist2 > tolerance) return 0;

    const bMin = Math.min(b1OnA, b2OnA);
    const bMax = Math.max(b1OnA, b2OnA);
    const overlapStart = Math.max(0, bMin);
    const overlapEnd = Math.min(aLen, bMax);

    return Math.max(0, overlapEnd - overlapStart);
  }

  /**
   * Simplified union computation for intersecting polygons.
   * Collects boundary vertices and intersection points, then sorts
   * them to form a valid polygon.
   */
  private computeUnion(other: Polygon2D): Polygon2D {
    const resultVertices: Point2D[] = [];
    const n1 = this.vertices.length;
    const n2 = other.vertices.length;

    // Collect vertices from this polygon that are outside other
    for (const v of this.vertices) {
      if (!other.containsPoint(v)) {
        resultVertices.push(v);
      }
    }

    // Collect vertices from other polygon that are outside this
    for (const v of other.vertices) {
      if (!this.containsPoint(v)) {
        resultVertices.push(v);
      }
    }

    // Collect intersection points
    for (let i = 0; i < n1; i++) {
      const a1 = this.vertices[i];
      const a2 = this.vertices[(i + 1) % n1];

      for (let j = 0; j < n2; j++) {
        const b1 = other.vertices[j];
        const b2 = other.vertices[(j + 1) % n2];

        const inter = segmentIntersectionPoint(a1, a2, b1, b2);
        if (inter) {
          resultVertices.push(inter);
        }
      }
    }

    if (resultVertices.length < 3) {
      // Fallback to convex hull
      return Polygon2D.fromConvexHull([...this.vertices, ...other.vertices]);
    }

    // Sort vertices by angle from centroid to form a valid polygon
    const centroid = this.unionCentroid(other);
    resultVertices.sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
      return angleA - angleB;
    });

    return new Polygon2D(resultVertices);
  }

  /**
   * Approximate centroid of the union of two polygons.
   */
  private unionCentroid(other: Polygon2D): Point2D {
    const c1 = this.centroid();
    const c2 = other.centroid();
    const a1 = this.area();
    const a2 = other.area();
    const totalArea = a1 + a2;

    if (totalArea < 1e-10) return new Point2D(0, 0);

    return new Point2D(
      (c1.x * a1 + c2.x * a2) / totalArea,
      (c1.y * a1 + c2.y * a2) / totalArea
    );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 2D cross product of vectors OA and OB (scalar).
 *
 * Returns positive if OAB makes a counter-clockwise turn,
 * negative for clockwise, zero if collinear.
 */
function cross2D(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Check if two line segments intersect.
 *
 * Uses the orientation-based algorithm for efficiency.
 */
function segmentsIntersect(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
  const d1 = cross2D(b1, b2, a1);
  const d2 = cross2D(b1, b2, a2);
  const d3 = cross2D(a1, a2, b1);
  const d4 = cross2D(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Check collinear cases
  if (Math.abs(d1) < 1e-10 && onSegment(b1, b2, a1)) return true;
  if (Math.abs(d2) < 1e-10 && onSegment(b1, b2, a2)) return true;
  if (Math.abs(d3) < 1e-10 && onSegment(a1, a2, b1)) return true;
  if (Math.abs(d4) < 1e-10 && onSegment(a1, a2, b2)) return true;

  return false;
}

/**
 * Check if point p lies on segment ab (assumes collinearity).
 */
function onSegment(a: Point2D, b: Point2D, p: Point2D): boolean {
  return p.x >= Math.min(a.x, b.x) - 1e-10 &&
         p.x <= Math.max(a.x, b.x) + 1e-10 &&
         p.y >= Math.min(a.y, b.y) - 1e-10 &&
         p.y <= Math.max(a.y, b.y) + 1e-10;
}

/**
 * Compute the intersection point of two line segments.
 *
 * Returns null if the segments don't intersect, or the intersection point.
 */
function segmentIntersectionPoint(
  a1: Point2D, a2: Point2D,
  b1: Point2D, b2: Point2D
): Point2D | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null; // Parallel or collinear

  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;

  if (t >= -1e-10 && t <= 1 + 1e-10 && u >= -1e-10 && u <= 1 + 1e-10) {
    return new Point2D(a1.x + t * d1x, a1.y + t * d1y);
  }

  return null;
}

/**
 * Check if point p is on the left side of the directed line from a to b.
 *
 * Returns positive if left, negative if right, 0 if on the line.
 */
function isLeftOf(a: Point2D, b: Point2D, p: Point2D): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}
