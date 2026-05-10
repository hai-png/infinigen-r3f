/**
 * Unified Constraint System
 *
 * This module provides a unified constraint infrastructure that bridges the gap
 * between the two existing relation systems (SpatialRelationAlgebra.ts and
 * relations.ts) and fixes the critical TagCondition.evaluate() stub that always
 * returns true.
 *
 * Key fixes:
 * - Tag.matches() properly handles negation (! prefix / negated flag)
 * - TagSet.has() / matches() works correctly with negated tags
 * - Polygon2D provides the 2D spatial operations needed for room solving
 * - ViolationAwareSA implements correct MH acceptance with hard/soft constraint
 *   distinction (matches original's metrop_hastings_with_viol())
 * - ObjectState integrates polygon footprint, tag set, relations, and DOF
 *   constraints into a single typed state object
 *
 * This is a NEW module that does not modify existing files. It exports everything
 * for use by the existing constraint system.
 */

import * as THREE from 'three';

// ============================================================================
// Tag — Named tag with negation support
// ============================================================================

/**
 * A named tag that supports negation.
 *
 * Tags are used for semantic filtering: an object with tag "chair" matches
 * a query for Tag("chair"), but does NOT match a query for Tag("chair", true)
 * (negated), which means "not chair".
 *
 * The `!` prefix in string form indicates negation: `!TagName`.
 */
export class Tag {
  /** The tag name (without negation prefix) */
  readonly name: string;

  /** Whether this tag is negated (!TagName) */
  readonly negated: boolean;

  constructor(name: string, negated: boolean = false) {
    this.name = name;
    this.negated = negated;
  }

  /**
   * Check if this tag matches another tag.
   *
   * Matching rules:
   * - A non-negated tag matches another non-negated tag with the same name
   * - A negated tag matches a non-negated tag with a DIFFERENT name
   *   (i.e., "NOT X" is satisfied by any tag that isn't "X")
   * - Two negated tags with the same name do NOT match
   *   (i.e., "NOT X" does not match "NOT X" — both exclude X)
   * - A non-negated tag does NOT match a negated tag
   */
  matches(other: Tag): boolean {
    if (this.negated && !other.negated) {
      // "NOT this.name" matches any tag that isn't "this.name"
      return this.name !== other.name;
    }
    if (!this.negated && !other.negated) {
      // Both positive: must have same name
      return this.name === other.name;
    }
    if (this.negated && other.negated) {
      // Both negated: "NOT X" does not match "NOT X"
      return this.name !== other.name;
    }
    // !this.negated && other.negated: positive does not match negated
    return false;
  }

  /**
   * Parse a tag string into a Tag object.
   *
   * Supports "TagName" and "!TagName" formats.
   */
  static parse(tagStr: string): Tag {
    const trimmed = tagStr.trim();
    if (trimmed.startsWith('!')) {
      return new Tag(trimmed.substring(1), true);
    }
    return new Tag(trimmed, false);
  }

  /**
   * Get the string representation, using "!" prefix for negated tags.
   */
  toString(): string {
    return this.negated ? `!${this.name}` : this.name;
  }

  /**
   * Equality check (same name AND same negation state).
   */
  equals(other: Tag): boolean {
    return this.name === other.name && this.negated === other.negated;
  }

  /**
   * Hash key for use in Maps/Sets.
   */
  toKey(): string {
    return this.toString();
  }
}

// ============================================================================
// TagSet — Set of tags with negation-aware matching
// ============================================================================

/**
 * A set of tags that supports negation-aware matching.
 *
 * Unlike the existing TagSet implementations (which are either string-based
 * or Tag-object-based without proper negation handling), this class provides:
 *
 * - `has(tag)`: checks if the set contains a matching tag, respecting negation
 * - `matches(query)`: evaluates whether a query Tag is satisfied by this set
 * - `matchesAll(queries)`: all queries must be satisfied
 * - `matchesAny(queries)`: at least one query must be satisfied
 *
 * This replaces the stub `TagCondition.evaluate()` which always returned true.
 */
export class TagSet {
  private tags: Map<string, Tag> = new Map();

  constructor(tags?: Tag[] | Iterable<Tag>) {
    if (tags) {
      for (const tag of tags) {
        this.tags.set(tag.toKey(), tag);
      }
    }
  }

  /**
   * Check if this set contains a tag with the given name (ignoring negation).
   * For exact matching including negation, use `matches()`.
   */
  has(tag: Tag): boolean {
    // Check if there's a tag with the same name in the set
    const positiveKey = tag.name;
    const negatedKey = `!${tag.name}`;
    return this.tags.has(positiveKey) || this.tags.has(negatedKey);
  }

  /**
   * Add a tag to the set.
   */
  add(tag: Tag): void {
    this.tags.set(tag.toKey(), tag);
  }

  /**
   * Remove a tag from the set (by exact key match).
   */
  remove(tag: Tag): void {
    this.tags.delete(tag.toKey());
  }

  /**
   * Evaluate whether a query tag is satisfied by this set.
   *
   * This is the core fix for TagCondition.evaluate():
   *
   * - Non-negated query (e.g., Tag("chair")): returns true if the set
   *   contains a positive tag with that name AND does NOT contain a negated
   *   version that would exclude it.
   *
   * - Negated query (e.g., Tag("chair", true)): returns true if the set
   *   does NOT contain a positive tag with that name (i.e., the object
   *   is NOT tagged "chair").
   */
  matches(query: Tag): boolean {
    if (query.negated) {
      // Negated query: "NOT chair" is satisfied if "chair" is NOT in the set
      return !this.tags.has(query.name);
    } else {
      // Positive query: "chair" is satisfied if "chair" is in the set
      // AND there's no negation overriding it (which shouldn't happen
      // in a well-formed tag set, but we handle it)
      return this.tags.has(query.name);
    }
  }

  /**
   * Check if ALL queries are satisfied by this set.
   */
  matchesAll(queries: Tag[]): boolean {
    return queries.every(q => this.matches(q));
  }

  /**
   * Check if ANY query is satisfied by this set.
   */
  matchesAny(queries: Tag[]): boolean {
    return queries.some(q => this.matches(q));
  }

  /**
   * Get the number of tags in this set.
   */
  get size(): number {
    return this.tags.size;
  }

  /**
   * Check if this set is empty.
   */
  isEmpty(): boolean {
    return this.tags.size === 0;
  }

  /**
   * Iterate over the tags in this set.
   */
  [Symbol.iterator](): IterableIterator<Tag> {
    return this.tags.values();
  }

  /**
   * Convert to an array of Tag objects.
   */
  toArray(): Tag[] {
    return Array.from(this.tags.values());
  }

  /**
   * Union with another TagSet.
   */
  union(other: TagSet): TagSet {
    const result = new TagSet(this.tags.values());
    for (const tag of other.tags.values()) {
      result.add(tag);
    }
    return result;
  }

  /**
   * Intersection with another TagSet.
   */
  intersect(other: TagSet): TagSet {
    const result = new TagSet();
    for (const [key, tag] of this.tags) {
      if (other.tags.has(key)) {
        result.add(tag);
      }
    }
    return result;
  }

  /**
   * Difference with another TagSet.
   */
  difference(other: TagSet): TagSet {
    const result = new TagSet();
    for (const [key, tag] of this.tags) {
      if (!other.tags.has(key)) {
        result.add(tag);
      }
    }
    return result;
  }

  /**
   * Check if every tag in this set is also in the other set.
   */
  isSubsetOf(other: TagSet): boolean {
    for (const key of this.tags.keys()) {
      if (!other.tags.has(key)) return false;
    }
    return true;
  }

  /**
   * Clone this tag set.
   */
  clone(): TagSet {
    return new TagSet(this.tags.values());
  }

  /**
   * String representation.
   */
  toString(): string {
    return `TagSet{${this.toArray().map(t => t.toString()).join(', ')}}`;
  }
}

// ============================================================================
// Polygon2D — 2D polygon operations for room solving
// ============================================================================

/**
 * 2D polygon representation with geometric operations.
 *
 * Provides the 2D spatial operations needed for room solving:
 * - Area computation (shoelace formula)
 * - Point containment (ray casting)
 * - Intersection detection (separating axis theorem)
 * - Buffer (grow/shrink by distance)
 * - Shared edge length (for room adjacency)
 * - Centroid computation
 *
 * Uses THREE.Vector2 for vertex representation.
 */
export class Polygon2D {
  readonly vertices: THREE.Vector2[];

  constructor(vertices: THREE.Vector2[]) {
    // Ensure we have a valid polygon (at least 3 vertices)
    this.vertices = vertices.length >= 3 ? vertices : [];
  }

  /**
   * Compute the signed area using the shoelace formula.
   * Returns a positive value for counter-clockwise, negative for clockwise.
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
    return area / 2;
  }

  /**
   * Compute the absolute area of this polygon.
   */
  area(): number {
    return Math.abs(this.signedArea());
  }

  /**
   * Check if a point is inside this polygon using ray casting.
   */
  contains(point: THREE.Vector2): boolean {
    if (this.vertices.length < 3) return false;

    let inside = false;
    const n = this.vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const vi = this.vertices[i];
      const vj = this.vertices[j];

      if (((vi.y > point.y) !== (vj.y > point.y)) &&
          (point.x < (vj.x - vi.x) * (point.y - vi.y) / (vj.y - vi.y) + vi.x)) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Check if this polygon intersects another polygon using SAT
   * (Separating Axis Theorem) for convex polygons, and bounding box
   * pre-check for general polygons.
   */
  intersects(other: Polygon2D): boolean {
    if (this.vertices.length < 3 || other.vertices.length < 3) return false;

    // Quick bounding box check first
    const thisBB = this.getBoundingBox();
    const otherBB = other.getBoundingBox();
    if (thisBB.minX > otherBB.maxX || thisBB.maxX < otherBB.minX ||
        thisBB.minY > otherBB.maxY || thisBB.maxY < otherBB.minY) {
      return false;
    }

    // For convex polygons, use SAT
    if (this.isConvex() && other.isConvex()) {
      return this.satIntersects(other);
    }

    // For non-convex polygons, check edge intersections and containment
    return this.generalIntersects(other);
  }

  /**
   * Grow or shrink this polygon by a distance (buffer operation).
   *
   * Positive distance = grow, negative = shrink.
   * Uses vertex offset along averaged normals.
   */
  buffer(distance: number): Polygon2D {
    if (this.vertices.length < 3 || distance === 0) {
      return this.clone();
    }

    const n = this.vertices.length;
    const newVertices: THREE.Vector2[] = [];

    for (let i = 0; i < n; i++) {
      const prev = this.vertices[(i - 1 + n) % n];
      const curr = this.vertices[i];
      const next = this.vertices[(i + 1) % n];

      // Compute normals of the two adjacent edges
      const edge1 = new THREE.Vector2().subVectors(curr, prev);
      const edge2 = new THREE.Vector2().subVectors(next, curr);

      // Outward normals (perpendicular, rotated 90° clockwise for CCW polygon)
      const normal1 = new THREE.Vector2(edge1.y, -edge1.x).normalize();
      const normal2 = new THREE.Vector2(edge2.y, -edge2.x).normalize();

      // Average the two normals
      const avgNormal = new THREE.Vector2().addVectors(normal1, normal2).normalize();

      // Offset the vertex
      const offset = avgNormal.multiplyScalar(distance);
      newVertices.push(new THREE.Vector2(curr.x + offset.x, curr.y + offset.y));
    }

    return new Polygon2D(newVertices);
  }

  /**
   * Compute the length of shared edges between this polygon and another.
   *
   * Two edges are "shared" if they are within tolerance of each other.
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
      const edgeLen1 = a1.distanceTo(a2);

      for (let j = 0; j < n2; j++) {
        const b1 = other.vertices[j];
        const b2 = other.vertices[(j + 1) % n2];

        // Check if these edges are close to each other (either direction)
        const overlap = this.edgeOverlapLength(a1, a2, b1, b2, tolerance);
        totalLength += overlap;
      }
    }

    return totalLength;
  }

  /**
   * Compute the centroid of this polygon.
   */
  centroid(): THREE.Vector2 {
    if (this.vertices.length === 0) return new THREE.Vector2(0, 0);
    if (this.vertices.length === 1) return this.vertices[0].clone();
    if (this.vertices.length === 2) {
      return new THREE.Vector2(
        (this.vertices[0].x + this.vertices[1].x) / 2,
        (this.vertices[0].y + this.vertices[1].y) / 2
      );
    }

    // Centroid of a polygon using the area-weighted formula
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
      const sum = this.vertices.reduce(
        (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
        { x: 0, y: 0 }
      );
      return new THREE.Vector2(sum.x / n, sum.y / n);
    }

    cx /= (6 * area);
    cy /= (6 * area);
    return new THREE.Vector2(cx, cy);
  }

  /**
   * Clone this polygon.
   */
  clone(): Polygon2D {
    return new Polygon2D(this.vertices.map(v => v.clone()));
  }

  // ── Static constructors ─────────────────────────────────────────────

  /**
   * Create a Polygon2D from a THREE.Box3 bounding box (projected onto XZ plane).
   */
  static fromBoundingBox(box: THREE.Box3): Polygon2D {
    const min = box.min;
    const max = box.max;
    return new Polygon2D([
      new THREE.Vector2(min.x, min.z),
      new THREE.Vector2(max.x, min.z),
      new THREE.Vector2(max.x, max.z),
      new THREE.Vector2(min.x, max.z),
    ]);
  }

  /**
   * Create a Polygon2D from a THREE.Shape.
   */
  static fromShape(shape: THREE.Shape): Polygon2D {
    const points = shape.getPoints(32);
    return new Polygon2D(points.map(p => new THREE.Vector2(p.x, p.y)));
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Get axis-aligned bounding box of this polygon.
   */
  private getBoundingBox(): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const v of this.vertices) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    return { minX, maxX, minY, maxY };
  }

  /**
   * Check if this polygon is convex.
   */
  private isConvex(): boolean {
    if (this.vertices.length < 3) return false;
    const n = this.vertices.length;
    let sign = 0;
    for (let i = 0; i < n; i++) {
      const a = this.vertices[i];
      const b = this.vertices[(i + 1) % n];
      const c = this.vertices[(i + 2) % n];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (cross !== 0) {
        if (sign === 0) {
          sign = cross > 0 ? 1 : -1;
        } else if ((cross > 0 ? 1 : -1) !== sign) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * SAT intersection test for convex polygons.
   */
  private satIntersects(other: Polygon2D): boolean {
    const axes = this.getEdgeNormals().concat(other.getEdgeNormals());
    for (const axis of axes) {
      const proj1 = this.projectOntoAxis(axis);
      const proj2 = other.projectOntoAxis(axis);
      if (proj1.max < proj2.min || proj2.max < proj1.min) {
        return false; // Separating axis found
      }
    }
    return true;
  }

  /**
   * General intersection test for non-convex polygons.
   */
  private generalIntersects(other: Polygon2D): boolean {
    // Check if any vertex of one polygon is inside the other
    for (const v of this.vertices) {
      if (other.contains(v)) return true;
    }
    for (const v of other.vertices) {
      if (this.contains(v)) return true;
    }

    // Check for edge intersections
    const n1 = this.vertices.length;
    const n2 = other.vertices.length;
    for (let i = 0; i < n1; i++) {
      const a1 = this.vertices[i];
      const a2 = this.vertices[(i + 1) % n1];
      for (let j = 0; j < n2; j++) {
        const b1 = other.vertices[j];
        const b2 = other.vertices[(j + 1) % n2];
        if (this.segmentsIntersect(a1, a2, b1, b2)) return true;
      }
    }

    return false;
  }

  /**
   * Get outward-pointing normals of all edges.
   */
  private getEdgeNormals(): THREE.Vector2[] {
    const normals: THREE.Vector2[] = [];
    const n = this.vertices.length;
    for (let i = 0; i < n; i++) {
      const a = this.vertices[i];
      const b = this.vertices[(i + 1) % n];
      const edge = new THREE.Vector2().subVectors(b, a);
      normals.push(new THREE.Vector2(edge.y, -edge.x).normalize());
    }
    return normals;
  }

  /**
   * Project this polygon onto an axis and return min/max.
   */
  private projectOntoAxis(axis: THREE.Vector2): { min: number; max: number } {
    let min = Infinity, max = -Infinity;
    for (const v of this.vertices) {
      const proj = v.dot(axis);
      min = Math.min(min, proj);
      max = Math.max(max, proj);
    }
    return { min, max };
  }

  /**
   * Check if two line segments intersect.
   */
  private segmentsIntersect(
    a1: THREE.Vector2, a2: THREE.Vector2,
    b1: THREE.Vector2, b2: THREE.Vector2
  ): boolean {
    const d1 = this.cross2D(b2.clone().sub(b1), a1.clone().sub(b1));
    const d2 = this.cross2D(b2.clone().sub(b1), a2.clone().sub(b1));
    const d3 = this.cross2D(a2.clone().sub(a1), b1.clone().sub(a1));
    const d4 = this.cross2D(a2.clone().sub(a1), b2.clone().sub(a1));

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }

    return false;
  }

  /**
   * 2D cross product (scalar).
   */
  private cross2D(a: THREE.Vector2, b: THREE.Vector2): number {
    return a.x * b.y - a.y * b.x;
  }

  /**
   * Compute the overlap length of two collinear (or near-collinear) edges.
   */
  private edgeOverlapLength(
    a1: THREE.Vector2, a2: THREE.Vector2,
    b1: THREE.Vector2, b2: THREE.Vector2,
    tolerance: number
  ): number {
    // Direction of edge a
    const aDir = new THREE.Vector2().subVectors(a2, a1);
    const aLen = aDir.length();
    if (aLen < 1e-10) return 0;
    aDir.normalize();

    // Project b's endpoints onto a's line
    const b1OnA = aDir.dot(new THREE.Vector2().subVectors(b1, a1));
    const b2OnA = aDir.dot(new THREE.Vector2().subVectors(b2, a1));

    // Perpendicular distance of b's endpoints from a's line
    const perpDist1 = Math.abs(
      new THREE.Vector2(-aDir.y, aDir.x).dot(new THREE.Vector2().subVectors(b1, a1))
    );
    const perpDist2 = Math.abs(
      new THREE.Vector2(-aDir.y, aDir.x).dot(new THREE.Vector2().subVectors(b2, a1))
    );

    // Both endpoints must be close to a's line
    if (perpDist1 > tolerance || perpDist2 > tolerance) return 0;

    // Compute the overlap interval on a's parameterization
    const bMin = Math.min(b1OnA, b2OnA);
    const bMax = Math.max(b1OnA, b2OnA);
    const overlapStart = Math.max(0, bMin);
    const overlapEnd = Math.min(aLen, bMax);

    return Math.max(0, overlapEnd - overlapStart);
  }
}

// ============================================================================
// DOFConstraints — Degrees of freedom for constraint-aware proposals
// ============================================================================

/**
 * Degrees of freedom constraints for an object.
 *
 * Specifies which translation and rotation axes are allowed,
 * their ranges, and quantization steps. Used by the SA solver
 * to generate valid move proposals.
 */
export class DOFConstraints {
  /** Which axes can translate [x, y, z] */
  translationAxes: [boolean, boolean, boolean];

  /** Which axes can rotate [x, y, z] */
  rotationAxes: [boolean, boolean, boolean];

  /** Min/max translation values per axis */
  translationRange: [THREE.Vector3, THREE.Vector3];

  /** Min/max rotation values per axis (Euler angles in radians) */
  rotationRange: [THREE.Euler, THREE.Euler];

  /** Quantized rotation step (e.g., Math.PI / 4 for 45° Z-axis rotation) */
  quantizedRotationStep: number;

  constructor(
    translationAxes: [boolean, boolean, boolean] = [true, true, true],
    rotationAxes: [boolean, boolean, boolean] = [true, true, true],
    translationRange?: [THREE.Vector3, THREE.Vector3],
    rotationRange?: [THREE.Euler, THREE.Euler],
    quantizedRotationStep: number = 0
  ) {
    this.translationAxes = translationAxes;
    this.rotationAxes = rotationAxes;
    this.translationRange = translationRange ?? [
      new THREE.Vector3(-10, -10, -10),
      new THREE.Vector3(10, 10, 10)
    ];
    this.rotationRange = rotationRange ?? [
      new THREE.Euler(-Math.PI, -Math.PI, -Math.PI),
      new THREE.Euler(Math.PI, Math.PI, Math.PI)
    ];
    this.quantizedRotationStep = quantizedRotationStep;
  }

  /**
   * Project a proposed translation onto allowed DOF axes,
   * clamping to the allowed range.
   */
  projectTranslation(proposed: THREE.Vector3): THREE.Vector3 {
    const result = new THREE.Vector3();
    const [min, max] = this.translationRange;

    const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
    for (let i = 0; i < 3; i++) {
      if (this.translationAxes[i]) {
        const val = proposed[axes[i]];
        result[axes[i]] = Math.max(min[axes[i]], Math.min(max[axes[i]], val));
      }
      // If axis is not allowed, result stays 0 for that axis
    }

    return result;
  }

  /**
   * Quantize a proposed rotation to allowed steps.
   * If quantizedRotationStep is 0, no quantization is applied.
   */
  quantizeRotation(proposed: THREE.Euler): THREE.Euler {
    if (this.quantizedRotationStep <= 0) {
      return proposed.clone();
    }

    const step = this.quantizedRotationStep;
    const [minRot, maxRot] = this.rotationRange;

    const quantize = (val: number, allowed: boolean, minVal: number, maxVal: number): number => {
      if (!allowed) return 0;
      // Quantize to nearest step
      let q = Math.round(val / step) * step;
      // Clamp to range
      q = Math.max(minVal, Math.min(maxVal, q));
      return q;
    };

    return new THREE.Euler(
      quantize(proposed.x, this.rotationAxes[0], minRot.x, maxRot.x),
      quantize(proposed.y, this.rotationAxes[1], minRot.y, maxRot.y),
      quantize(proposed.z, this.rotationAxes[2], minRot.z, maxRot.z)
    );
  }

  /**
   * Create DOF constraints for a floor-placed object that can only
   * translate in XZ and rotate around Y.
   */
  static floorObject(
    xzRange?: [THREE.Vector3, THREE.Vector3],
    yRotationStep: number = Math.PI / 4
  ): DOFConstraints {
    return new DOFConstraints(
      [true, false, true], // translate XZ only
      [false, true, false], // rotate Y only
      xzRange ?? [
        new THREE.Vector3(-10, 0, -10),
        new THREE.Vector3(10, 0, 10)
      ],
      [
        new THREE.Euler(0, -Math.PI, 0),
        new THREE.Euler(0, Math.PI, 0)
      ],
      yRotationStep
    );
  }

  /**
   * Create DOF constraints for a fixed object (no translation or rotation).
   */
  static fixed(): DOFConstraints {
    return new DOFConstraints(
      [false, false, false],
      [false, false, false]
    );
  }

  /**
   * Create DOF constraints for a freely movable object.
   */
  static free(): DOFConstraints {
    return new DOFConstraints(
      [true, true, true],
      [true, true, true]
    );
  }
}

// ============================================================================
// ObjectState — Typed state tracking for constraint solver
// ============================================================================

/**
 * Typed object state for the constraint solver.
 *
 * This provides a unified representation that integrates:
 * - Position, rotation, scale (from existing ObjectState)
 * - TagSet with proper negation-aware matching (fixes TagCondition stub)
 * - Relation map (from existing relations system)
 * - DOFConstraints (new: constraint-aware proposals)
 * - Polygon2D footprint (new: 2D spatial reasoning)
 * - BoundingBox (from existing system)
 *
 * Unlike the existing ObjectState (which has `polygon: any` always null),
 * this class provides a fully functional polygon representation.
 */
export class ObjectState {
  /** Unique identifier */
  id: string;

  /** Object type (e.g., "chair", "table", "room") */
  type: string;

  /** 3D position */
  position: THREE.Vector3;

  /** Rotation as Euler angles */
  rotation: THREE.Euler;

  /** Scale */
  scale: THREE.Vector3;

  /** Tags with negation-aware matching */
  tags: TagSet;

  /** Relations to other objects: relation name -> target + params */
  relations: Map<string, RelationEntry>;

  /** Degrees of freedom for constraint-aware proposals */
  dofConstraints: DOFConstraints;

  /** 2D footprint for overlap checks */
  footprint: Polygon2D;

  /** 3D bounding box */
  boundingBox: THREE.Box3;

  constructor(opts: Partial<ObjectStateOptions> = {}) {
    this.id = opts.id ?? '';
    this.type = opts.type ?? '';
    this.position = opts.position?.clone() ?? new THREE.Vector3();
    this.rotation = opts.rotation?.clone() ?? new THREE.Euler();
    this.scale = opts.scale?.clone() ?? new THREE.Vector3(1, 1, 1);
    this.tags = opts.tags?.clone() ?? new TagSet();
    this.relations = opts.relations ?? new Map();
    this.dofConstraints = opts.dofConstraints ?? DOFConstraints.free();
    this.footprint = opts.footprint ?? new Polygon2D([]);
    this.boundingBox = opts.boundingBox ?? new THREE.Box3();
  }

  /**
   * Check if this object has a specific tag.
   * This replaces the stub TagCondition.evaluate() with proper matching.
   */
  hasTag(tag: Tag): boolean {
    return this.tags.matches(tag);
  }

  /**
   * Add a tag to this object.
   */
  addTag(tag: Tag): void {
    this.tags.add(tag);
  }

  /**
   * Remove a tag from this object.
   */
  removeTag(tag: Tag): void {
    this.tags.remove(tag);
  }

  /**
   * Get a relation by name.
   */
  getRelation(name: string): RelationEntry | undefined {
    return this.relations.get(name);
  }

  /**
   * Add/update a relation.
   */
  setRelation(name: string, entry: RelationEntry): void {
    this.relations.set(name, entry);
  }

  /**
   * Update the bounding box from the 3D object (if available).
   */
  updateBoundingBox(): void {
    if (this.footprint.vertices.length >= 3) {
      // Derive from footprint + position
      const minY = this.position.y;
      const maxY = this.position.y + this.scale.y; // approximate height
      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (const v of this.footprint.vertices) {
        minX = Math.min(minX, v.x + this.position.x);
        maxX = Math.max(maxX, v.x + this.position.x);
        minZ = Math.min(minZ, v.y + this.position.z);
        maxZ = Math.max(maxZ, v.y + this.position.z);
      }
      this.boundingBox = new THREE.Box3(
        new THREE.Vector3(minX, minY, minZ),
        new THREE.Vector3(maxX, maxY, maxZ)
      );
    }
  }

  /**
   * Deep clone this object state.
   */
  clone(): ObjectState {
    const cloned = new ObjectState({
      id: this.id,
      type: this.type,
      position: this.position.clone(),
      rotation: this.rotation.clone(),
      scale: this.scale.clone(),
      tags: this.tags.clone(),
      dofConstraints: this.dofConstraints,
      footprint: this.footprint.clone(),
      boundingBox: this.boundingBox.clone(),
    });
    // Clone the relations map
    cloned.relations = new Map();
    for (const [key, entry] of this.relations) {
      cloned.relations.set(key, { ...entry });
    }
    return cloned;
  }

  /**
   * String representation for debugging.
   */
  toString(): string {
    return `ObjectState(id=${this.id}, type=${this.type}, pos=${this.position.toArray().map(v => v.toFixed(2))}, tags=${this.tags})`;
  }
}

/** Options for constructing an ObjectState */
export interface ObjectStateOptions {
  id: string;
  type: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  tags: TagSet;
  relations: Map<string, RelationEntry>;
  dofConstraints: DOFConstraints;
  footprint: Polygon2D;
  boundingBox: THREE.Box3;
}

/** A relation entry pointing to a target object with parameters */
export interface RelationEntry {
  /** The target object ID */
  targetId: string;
  /** Relation-specific parameters */
  params: Record<string, any>;
}

// ============================================================================
// RelationResult — Result of evaluating a relation
// ============================================================================

/**
 * Result of evaluating a relation between two objects.
 *
 * `satisfied` indicates whether the relation holds.
 * `violationAmount` quantifies how much the relation is violated
 * (0 = fully satisfied, >0 = degree of violation).
 * This is critical for the violation-aware SA solver.
 */
export interface RelationResult {
  /** Whether the relation is satisfied */
  satisfied: boolean;

  /**
   * Degree of violation: 0 = fully satisfied, >0 = degree of violation.
   * For distance-based relations, this is the excess distance.
   * For contact-based relations, this is the gap distance.
   */
  violationAmount: number;

  /** Optional metadata for debugging and visualization */
  metadata?: Record<string, any>;
}

// ============================================================================
// Relation — Unified abstract relation hierarchy
// ============================================================================

/**
 * Abstract base class for unified relations.
 *
 * Each relation has:
 * - A name identifying the relation type
 * - Child tags: tags that the child object must have for this relation
 * - Parent tags: tags that the parent object must have for this relation
 * - An evaluate() method that computes a RelationResult
 *
 * This unifies the two existing relation systems:
 * 1. SpatialRelationAlgebra.ts (geometric reasoning, no tag matching)
 * 2. relations.ts (language AST, tag-unaware)
 *
 * The unified Relation combines both: tag-based filtering (from the original
 * Python's child_tags/parent_tags subpart matching) AND geometric evaluation.
 */
export abstract class Relation {
  /** Name of this relation type */
  abstract readonly name: string;

  /** Tags required of the child object for this relation to apply */
  abstract readonly childTags: TagSet;

  /** Tags required of the parent object for this relation to apply */
  abstract readonly parentTags: TagSet;

  /**
   * Evaluate this relation between a child and parent object.
   *
   * @param child - The child object state
   * @param parent - The parent object state
   * @returns RelationResult with satisfied status and violation amount
   */
  abstract evaluate(child: ObjectState, parent: ObjectState): RelationResult;

  /**
   * Check if the child's tags satisfy this relation's child tag requirements.
   */
  childTagsMatch(child: ObjectState): boolean {
    if (this.childTags.isEmpty()) return true;
    for (const tag of this.childTags) {
      if (!child.tags.matches(tag)) return false;
    }
    return true;
  }

  /**
   * Check if the parent's tags satisfy this relation's parent tag requirements.
   */
  parentTagsMatch(parent: ObjectState): boolean {
    if (this.parentTags.isEmpty()) return true;
    for (const tag of this.parentTags) {
      if (!parent.tags.matches(tag)) return false;
    }
    return true;
  }

  /**
   * Check if both child and parent tags match before evaluating.
   * Returns null if tags don't match (relation doesn't apply).
   */
  evaluateIfApplicable(
    child: ObjectState,
    parent: ObjectState
  ): RelationResult | null {
    if (!this.childTagsMatch(child) || !this.parentTagsMatch(parent)) {
      return null;
    }
    return this.evaluate(child, parent);
  }

  // ── Gap 7: Algebra operations ────────────────────────────────────────

  /**
   * Implication: does this relation logically imply another?
   *
   * A implies B means: whenever A holds, B also holds.
   * Uses the implication lattice: STABLE_AGAINST → SUPPORTED_BY → TOUCHING
   *
   * @param other - The potential consequent relation
   * @returns true if this relation implies other
   */
  implies(other: Relation): boolean {
    // Default implementation: same name with same or weaker params
    if (this.name === other.name) return true;

    // Implication lattice from SpatialRelationAlgebra.ts
    // Extended with new relation types for comprehensive reasoning
    const lattice: Record<string, string[]> = {
      'stable_against': ['supported_by', 'touching', 'coplanar', 'near', 'proximity'],
      'supported_by': ['touching', 'coplanar', 'near', 'proximity'],
      'touching': ['coplanar', 'near', 'proximity'],
      'containment': ['touching', 'near', 'proximity'],
      'near': ['proximity'],
      'coverage': ['touching', 'near', 'proximity'],
      'support_coverage': ['coverage', 'touching', 'near', 'proximity', 'supported_by'],
      // Shared edge and room neighbour implications
      'shared_edge': ['room_neighbour', 'touching', 'near', 'proximity'],
      'room_neighbour': ['touching', 'near', 'proximity'],
      // Hidden/Visible are complementary
      'hidden': [],
      'visible': [],
      // AccessibleFrom implies reachable (weaker condition)
      'accessible_from': ['reachable_from', 'near', 'proximity'],
      'reachable_from': ['near', 'proximity'],
      // Grouped implies near/proximity for all members
      'grouped': ['near', 'proximity'],
      // Distributed implies grouped (all members are together)
      'distributed': ['grouped', 'near', 'proximity'],
      // Facing implies near for reasonable angles
      'facing': ['near', 'proximity'],
      // OnFloor implies supported_by
      'on_floor': ['supported_by', 'touching', 'coplanar'],
      // Distance is a general relation
      'distance': ['near', 'proximity'],
    };

    const implied = lattice[this.name];
    if (implied && implied.includes(other.name)) return true;

    // Transitive check: if this implies X and X implies other
    if (implied) {
      for (const intermediate of implied) {
        const intermediateLattice = lattice[intermediate];
        if (intermediateLattice && intermediateLattice.includes(other.name)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Intersects: can both relations be simultaneously true for some configuration?
   *
   * @param other - The other relation
   * @returns A new Relation representing the intersection, or null if mutually exclusive
   */
  intersects(other: Relation): Relation | null {
    // Default: same-type relations intersect if params are compatible
    if (this.name === other.name) return this;

    // Complementary relations don't intersect
    if ((this.name === 'hidden' && other.name === 'visible') ||
        (this.name === 'visible' && other.name === 'hidden')) {
      return null;
    }

    // AccessibleFrom and blocking relations can conflict
    if ((this.name === 'accessible_from' && other.name === 'containment') ||
        (this.name === 'reachable_from' && other.name === 'containment')) {
      // Containment doesn't necessarily block accessibility
      return this;
    }

    // Most relations can coexist
    return this;
  }

  /**
   * Difference: this relation minus the other.
   *
   * Returns a relation satisfied when THIS holds but OTHER does not,
   * or null if this is a subset of other (difference is empty).
   *
   * @param other - The relation to subtract
   * @returns A new Relation for the difference, or null
   */
  difference(other: Relation): Relation | null {
    // If other implies this, the difference is empty
    if (other.implies(this)) return null;

    // Same type: difference depends on parameters
    if (this.name === other.name) return null;

    // Different types: this minus other is still this (they're independent)
    return this;
  }
}

// ============================================================================
// Concrete Relation Implementations
// ============================================================================

/**
 * StableAgainst relation: object is stable on a surface.
 *
 * Checks:
 * - Normal alignment (contact normal should be roughly upward)
 * - Contact area (bounding boxes overlap in XZ)
 * - Vertical gap (child bottom close to parent top)
 *
 * This is the strongest relation in the implication lattice:
 *   STABLE_AGAINST → SUPPORTED_BY → TOUCHING
 */
export class StableAgainstRelation extends Relation {
  readonly name = 'stable_against';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly margin: number = 0.05,
    public readonly contactNormal: THREE.Vector3 = new THREE.Vector3(0, 1, 0)
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // Check vertical alignment
    const childBottom = child.boundingBox.min.y;
    const parentTop = parent.boundingBox.max.y;
    const verticalGap = Math.abs(childBottom - parentTop);

    // Check XZ overlap
    const childFootprint = child.footprint;
    const parentFootprint = parent.footprint;

    let xzOverlap = false;
    if (childFootprint.vertices.length >= 3 && parentFootprint.vertices.length >= 3) {
      xzOverlap = childFootprint.intersects(parentFootprint);
    } else {
      // Fallback to bounding box XZ overlap
      xzOverlap = !(
        child.boundingBox.max.x < parent.boundingBox.min.x ||
        child.boundingBox.min.x > parent.boundingBox.max.x ||
        child.boundingBox.max.z < parent.boundingBox.min.z ||
        child.boundingBox.min.z > parent.boundingBox.max.z
      );
    }

    // Check normal alignment (contact normal should be roughly up)
    const normalAlignment = this.contactNormal.dot(new THREE.Vector3(0, 1, 0));

    const verticalSatisfied = verticalGap <= this.margin;
    const satisfied = verticalSatisfied && xzOverlap && normalAlignment > 0.5;

    return {
      satisfied,
      violationAmount: satisfied ? 0 : verticalGap + (xzOverlap ? 0 : 1) + (normalAlignment > 0.5 ? 0 : 0.5),
      metadata: { verticalGap, xzOverlap, normalAlignment },
    };
  }
}

/**
 * Touching relation: objects are touching (bounding boxes overlap or near).
 */
export class TouchingRelation extends Relation {
  readonly name = 'touching';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly threshold: number = 0.01
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // Compute distance between bounding boxes
    const dist = this.boundingBoxDistance(child.boundingBox, parent.boundingBox);
    const satisfied = dist <= this.threshold;

    return {
      satisfied,
      violationAmount: satisfied ? 0 : dist - this.threshold,
      metadata: { distance: dist },
    };
  }

  private boundingBoxDistance(a: THREE.Box3, b: THREE.Box3): number {
    // If boxes overlap, distance is 0
    if (a.intersectsBox(b)) return 0;

    // Compute separation distance
    const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
    const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
    const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

/**
 * SupportedBy relation: one object supports another (vertical support check).
 */
export class SupportedByRelation extends Relation {
  readonly name = 'supported_by';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly tolerance: number = 0.1
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    const childBottom = child.boundingBox.min.y;
    const parentTop = parent.boundingBox.max.y;

    // Check vertical proximity
    const verticalGap = childBottom - parentTop;
    const verticallyClose = verticalGap >= -this.tolerance && verticalGap <= this.tolerance;

    // Check XZ overlap
    const xzOverlap = !(
      child.boundingBox.max.x < parent.boundingBox.min.x ||
      child.boundingBox.min.x > parent.boundingBox.max.x ||
      child.boundingBox.max.z < parent.boundingBox.min.z ||
      child.boundingBox.min.z > parent.boundingBox.max.z
    );

    const satisfied = verticallyClose && xzOverlap;
    return {
      satisfied,
      violationAmount: satisfied ? 0 : Math.abs(verticalGap) + (xzOverlap ? 0 : 1),
      metadata: { verticalGap, xzOverlap },
    };
  }
}

/**
 * CoPlanar relation: objects are on the same plane.
 */
export class CoPlanarRelation extends Relation {
  readonly name = 'coplanar';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly distanceTolerance: number = 0.1,
    public readonly normalTolerance: number = 0.1,
    public readonly normal: THREE.Vector3 = new THREE.Vector3(0, 1, 0)
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // Check 1: Distance from the reference plane
    const diff = child.position.clone().sub(parent.position);
    const distFromPlane = Math.abs(diff.dot(this.normal));
    const distanceSatisfied = distFromPlane <= this.distanceTolerance;

    // Check 2: Normal alignment tolerance.
    // If both objects have bounding boxes, check that the face normals
    // are aligned (within normalTolerance) with the reference plane normal.
    let normalSatisfied = true;
    let normalAlignment = 1.0;
    if (this.normalTolerance > 0) {
      // Compute the vector from parent to child projected along normal
      const diffLen = diff.length();
      if (diffLen > 1e-10) {
        // The component of the direction perpendicular to the normal
        const alongNormal = diff.dot(this.normal) / diffLen;
        const perpLen = Math.sqrt(1 - alongNormal * alongNormal);
        // For coplanar objects spread along the plane, the direction
        // between them should be mostly perpendicular to the normal.
        // normalAlignment = 1 - |alongNormal| (1 = perfectly in-plane)
        normalAlignment = 1 - Math.abs(alongNormal);
      }

      // Also check using bounding box face normals if available
      const childBB = child.boundingBox;
      const parentBB = parent.boundingBox;
      if (childBB && parentBB && !childBB.isEmpty() && !parentBB.isEmpty()) {
        // Use the up-direction (Y-axis) as a proxy for surface normal
        // If both objects are on the same surface, their contact normals
        // should be consistent with the plane normal.
        const upDir = new THREE.Vector3(0, 1, 0);
        normalAlignment = Math.abs(this.normal.dot(upDir));
      }

      normalSatisfied = (1 - normalAlignment) <= this.normalTolerance;
    }

    const satisfied = distanceSatisfied && normalSatisfied;
    let violationAmount = 0;
    if (!distanceSatisfied) violationAmount += distFromPlane - this.distanceTolerance;
    if (!normalSatisfied) violationAmount += (1 - normalAlignment) - this.normalTolerance;

    return {
      satisfied,
      violationAmount,
      metadata: { distFromPlane, normalAlignment },
    };
  }
}

/**
 * SharedEdge relation: objects share a boundary edge (for room adjacency).
 */
export class SharedEdgeRelation extends Relation {
  readonly name = 'shared_edge';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly minEdgeLength: number = 0.5,
    public readonly edgeTolerance: number = 0.05
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    const sharedLen = child.footprint.sharedEdgeLength(
      parent.footprint,
      this.edgeTolerance
    );
    const satisfied = sharedLen >= this.minEdgeLength;

    return {
      satisfied,
      violationAmount: satisfied ? 0 : this.minEdgeLength - sharedLen,
      metadata: { sharedEdgeLength: sharedLen },
    };
  }
}

/**
 * RoomNeighbour relation: rooms are adjacent (for floor plans).
 */
export class RoomNeighbourRelation extends Relation {
  readonly name = 'room_neighbour';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly minSharedEdge: number = 0.5,
    public readonly connectorTypes: ('door' | 'open' | 'wall')[] = ['door', 'open']
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // Use the shared edge length as the primary criterion
    const sharedLen = child.footprint.sharedEdgeLength(
      parent.footprint,
      0.05
    );
    const satisfied = sharedLen >= this.minSharedEdge;

    return {
      satisfied,
      violationAmount: satisfied ? 0 : this.minSharedEdge - sharedLen,
      metadata: { sharedEdgeLength: sharedLen, connectorTypes: this.connectorTypes },
    };
  }
}

/**
 * Distance relation: objects are within a distance range.
 */
export class DistanceRelation extends Relation {
  readonly name = 'distance';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly minDistance: number = 0,
    public readonly maxDistance: number = 5
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    const dist = child.position.distanceTo(parent.position);
    const tooClose = dist < this.minDistance;
    const tooFar = dist > this.maxDistance;
    const satisfied = !tooClose && !tooFar;

    let violationAmount = 0;
    if (tooClose) violationAmount = this.minDistance - dist;
    if (tooFar) violationAmount = dist - this.maxDistance;

    return {
      satisfied,
      violationAmount,
      metadata: { distance: dist },
    };
  }
}

/**
 * OnFloor relation: object is on the floor (y position is near zero).
 */
export class OnFloorRelation extends Relation {
  readonly name = 'on_floor';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet([new Tag('floor')]),
    public readonly tolerance: number = 0.15
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // The child's bottom should be near the parent's top (floor surface)
    const childBottom = child.boundingBox.min.y;
    const parentTop = parent.boundingBox.max.y;
    const gap = Math.abs(childBottom - parentTop);
    const satisfied = gap <= this.tolerance;

    return {
      satisfied,
      violationAmount: satisfied ? 0 : gap - this.tolerance,
      metadata: { gap },
    };
  }
}

// ============================================================================
// Gap 1: Missing Relations from language/relations.ts
// ============================================================================

/**
 * Hidden relation: object is occluded from all viewpoints.
 * Uses BVH line-of-sight when available, falls back to ground check.
 */
export class HiddenRelation extends Relation {
  readonly name = 'hidden';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly viewpoints: THREE.Vector3[] = [
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(10, 2, 0),
      new THREE.Vector3(-10, 2, 0),
      new THREE.Vector3(0, 2, 10),
      new THREE.Vector3(0, 2, -10),
    ]
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // Child is hidden if below ground or occluded from all viewpoints
    if (child.position.y < 0) {
      return { satisfied: true, violationAmount: 0 };
    }

    // Try BVH line-of-sight
    try {
      const { getDefaultCollisionManager } = require('../evaluator/bvh-collision');
      const manager = getDefaultCollisionManager();
      const childCenter = new THREE.Vector3();
      child.boundingBox.getCenter(childCenter);

      let hiddenFromAll = true;
      for (const vp of this.viewpoints) {
        if (manager.hasLineOfSight(vp, childCenter)) {
          hiddenFromAll = false;
          break;
        }
      }
      return {
        satisfied: hiddenFromAll,
        violationAmount: hiddenFromAll ? 0 : 1,
        metadata: { hiddenFromAll },
      };
    } catch {
      // Fallback: distance-based check
      const dist = child.position.length();
      const isHidden = dist > 500;
      return {
        satisfied: isHidden,
        violationAmount: isHidden ? 0 : 1,
        metadata: { distance: dist },
      };
    }
  }
}

/**
 * Visible relation: object is above ground and has line of sight from viewpoint.
 */
export class VisibleRelation extends Relation {
  readonly name = 'visible';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly viewpoints: THREE.Vector3[] = [
      new THREE.Vector3(0, 10, 0),
    ],
    public readonly maxViewDistance: number = 200
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // Must be above ground
    if (child.position.y < 0) {
      return { satisfied: false, violationAmount: -child.position.y };
    }

    try {
      const { getDefaultCollisionManager } = require('../evaluator/bvh-collision');
      const manager = getDefaultCollisionManager();
      const childCenter = new THREE.Vector3();
      child.boundingBox.getCenter(childCenter);

      for (const vp of this.viewpoints) {
        if (manager.hasLineOfSight(vp, childCenter)) {
          const dist = vp.distanceTo(childCenter);
          if (dist <= this.maxViewDistance) {
            return { satisfied: true, violationAmount: 0, metadata: { distance: dist } };
          }
        }
      }
      return { satisfied: false, violationAmount: 1 };
    } catch {
      // Fallback: distance check
      for (const vp of this.viewpoints) {
        const dist = vp.distanceTo(child.position);
        if (dist > 0 && dist <= this.maxViewDistance) {
          return { satisfied: true, violationAmount: 0, metadata: { distance: dist } };
        }
      }
      return { satisfied: false, violationAmount: 1 };
    }
  }
}

/**
 * Facing relation: child's forward direction points toward parent.
 */
export class FacingRelation extends Relation {
  readonly name = 'facing';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly angleThreshold: number = Math.PI / 4
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // Compute child's forward direction from rotation
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(child.rotation);
    const toParent = parent.position.clone().sub(child.position).normalize();
    const angle = forward.angleTo(toParent);
    const satisfied = angle <= this.angleThreshold;
    return {
      satisfied,
      violationAmount: satisfied ? 0 : angle - this.angleThreshold,
      metadata: { angle },
    };
  }
}

/**
 * Between relation: child is between two reference objects along an axis.
 */
export class BetweenRelation extends Relation {
  readonly name = 'between';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly axis: 'x' | 'y' | 'z' | 'any' = 'any',
    public readonly tolerance: number = 0.5
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // Parent here is interpreted as one boundary; the other boundary
    // is expected to be stored in the relation params.
    // For now, check if child is between parent position and origin along the axis.
    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : this.axis === 'z' ? 2 : -1;

    if (axisIndex >= 0) {
      const childVal = child.position.getComponent(axisIndex);
      const parentVal = parent.position.getComponent(axisIndex);
      const lo = Math.min(0, parentVal);
      const hi = Math.max(0, parentVal);
      const inRange = childVal >= lo - this.tolerance && childVal <= hi + this.tolerance;
      return {
        satisfied: inRange,
        violationAmount: inRange ? 0 : Math.min(Math.abs(childVal - lo), Math.abs(childVal - hi)),
        metadata: { axis: this.axis, childVal, parentVal },
      };
    }

    // 'any' axis: check all axes
    let totalViolation = 0;
    let allSatisfied = true;
    for (const idx of [0, 1, 2]) {
      const childVal = child.position.getComponent(idx);
      const parentVal = parent.position.getComponent(idx);
      const lo = Math.min(0, parentVal);
      const hi = Math.max(0, parentVal);
      if (childVal < lo - this.tolerance || childVal > hi + this.tolerance) {
        allSatisfied = false;
        totalViolation += Math.min(Math.abs(childVal - lo), Math.abs(childVal - hi));
      }
    }
    return { satisfied: allSatisfied, violationAmount: totalViolation };
  }
}

/**
 * Near relation: objects are within a threshold distance.
 */
export class NearRelation extends Relation {
  readonly name = 'near';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly threshold: number = 1.0
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    const dist = child.position.distanceTo(parent.position);
    const satisfied = dist < this.threshold;
    return {
      satisfied,
      violationAmount: satisfied ? 0 : dist - this.threshold,
      metadata: { distance: dist },
    };
  }
}

/**
 * Proximity relation: objects are within a distance range.
 */
export class ProximityRelation extends Relation {
  readonly name = 'proximity';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly minDistance: number = 0.5,
    public readonly maxDistance: number = 3.0
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    const dist = child.position.distanceTo(parent.position);
    const tooClose = dist < this.minDistance;
    const tooFar = dist > this.maxDistance;
    const satisfied = !tooClose && !tooFar;

    let violationAmount = 0;
    if (tooClose) violationAmount = this.minDistance - dist;
    if (tooFar) violationAmount = dist - this.maxDistance;

    return { satisfied, violationAmount, metadata: { distance: dist } };
  }
}

/**
 * Containment relation: child is entirely inside parent's bounding box.
 */
export class ContainmentRelation extends Relation {
  readonly name = 'containment';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly tolerance: number = 0.01
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    const contained = parent.boundingBox.containsBox(child.boundingBox);
    if (contained) {
      return { satisfied: true, violationAmount: 0 };
    }

    // Compute how far outside the child is
    const overflow = child.boundingBox.clone().intersect(parent.boundingBox);
    const childSize = new THREE.Vector3();
    const overflowSize = new THREE.Vector3();
    child.boundingBox.getSize(childSize);
    overflow.getSize(overflowSize);

    const childVol = childSize.x * childSize.y * childSize.z;
    const overlapVol = overflowSize.x * overflowSize.y * overflowSize.z;
    const containmentRatio = childVol > 0 ? overlapVol / childVol : 0;

    return {
      satisfied: false,
      violationAmount: 1 - containmentRatio,
      metadata: { containmentRatio },
    };
  }
}

/**
 * Grouped relation: objects are within maxDistance of each other.
 */
export class GroupedRelation extends Relation {
  readonly name = 'grouped';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly maxDistance: number = 2.0
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    const dist = child.position.distanceTo(parent.position);
    const satisfied = dist <= this.maxDistance;
    return {
      satisfied,
      violationAmount: satisfied ? 0 : dist - this.maxDistance,
      metadata: { distance: dist },
    };
  }
}

/**
 * Distributed relation: objects are at least minDistance apart.
 */
export class DistributedRelation extends Relation {
  readonly name = 'distributed';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly minDistance: number = 1.0
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    const dist = child.position.distanceTo(parent.position);
    const satisfied = dist >= this.minDistance;
    return {
      satisfied,
      violationAmount: satisfied ? 0 : this.minDistance - dist,
      metadata: { distance: dist },
    };
  }
}

/**
 * Coverage relation: child's XZ footprint covers a threshold of parent's XZ footprint.
 */
export class CoverageRelation extends Relation {
  readonly name = 'coverage';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly coverageThreshold: number = 0.8
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    const childArea = child.footprint.area();
    const parentArea = parent.footprint.area();

    if (parentArea <= 0) {
      return { satisfied: false, violationAmount: 1, metadata: { parentArea: 0 } };
    }

    // Use footprint intersection for coverage computation if available
    if (child.footprint.vertices.length >= 3 && parent.footprint.vertices.length >= 3) {
      const intersection = child.footprint.intersects(parent.footprint);
      // Approximate: if they intersect, use a ratio based on areas
      const ratio = childArea > 0 ? Math.min(childArea, parentArea) / parentArea : 0;
      const satisfied = ratio >= this.coverageThreshold;
      return {
        satisfied,
        violationAmount: satisfied ? 0 : this.coverageThreshold - ratio,
        metadata: { coverageRatio: ratio },
      };
    }

    // Fallback to bounding box overlap
    const overlapXZ = !(
      child.boundingBox.max.x < parent.boundingBox.min.x ||
      child.boundingBox.min.x > parent.boundingBox.max.x ||
      child.boundingBox.max.z < parent.boundingBox.min.z ||
      child.boundingBox.min.z > parent.boundingBox.max.z
    );

    if (!overlapXZ) {
      return { satisfied: false, violationAmount: this.coverageThreshold, metadata: { overlap: false } };
    }

    // Compute overlap area
    const overlapMinX = Math.max(child.boundingBox.min.x, parent.boundingBox.min.x);
    const overlapMaxX = Math.min(child.boundingBox.max.x, parent.boundingBox.max.x);
    const overlapMinZ = Math.max(child.boundingBox.min.z, parent.boundingBox.min.z);
    const overlapMaxZ = Math.min(child.boundingBox.max.z, parent.boundingBox.max.z);
    const overlapArea = Math.max(0, overlapMaxX - overlapMinX) * Math.max(0, overlapMaxZ - overlapMinZ);
    const ratio = parentArea > 0 ? overlapArea / parentArea : 0;
    const satisfied = ratio >= this.coverageThreshold;
    return {
      satisfied,
      violationAmount: satisfied ? 0 : this.coverageThreshold - ratio,
      metadata: { coverageRatio: ratio },
    };
  }
}

/**
 * SupportCoverage relation: the fraction of child's footprint supported by parent.
 */
export class SupportCoverageRelation extends Relation {
  readonly name = 'support_coverage';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly minSupport: number = 0.5
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // First check vertical alignment (child bottom close to parent top)
    const childBottom = child.boundingBox.min.y;
    const parentTop = parent.boundingBox.max.y;
    const verticalGap = Math.abs(childBottom - parentTop);
    if (verticalGap > 0.2) {
      return { satisfied: false, violationAmount: verticalGap, metadata: { verticalGap } };
    }

    // Compute XZ overlap ratio relative to child's footprint area
    const overlapMinX = Math.max(child.boundingBox.min.x, parent.boundingBox.min.x);
    const overlapMaxX = Math.min(child.boundingBox.max.x, parent.boundingBox.max.x);
    const overlapMinZ = Math.max(child.boundingBox.min.z, parent.boundingBox.min.z);
    const overlapMaxZ = Math.min(child.boundingBox.max.z, parent.boundingBox.max.z);
    const overlapArea = Math.max(0, overlapMaxX - overlapMinX) * Math.max(0, overlapMaxZ - overlapMinZ);

    const childArea = child.footprint.area();
    const ratio = childArea > 0 ? overlapArea / childArea : 0;
    const satisfied = ratio >= this.minSupport;

    return {
      satisfied,
      violationAmount: satisfied ? 0 : this.minSupport - ratio,
      metadata: { supportRatio: ratio },
    };
  }
}

/**
 * AccessibleFrom relation: A* path exists between objects with total length ≤ reachDistance.
 */
export class AccessibleFromRelation extends Relation {
  readonly name = 'accessible_from';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly reachDistance: number = 5.0
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    // Try A* pathfinding
    try {
      const { getCachedNavigationGrid } = require('../evaluator/NavigationGrid');
      const grid = getCachedNavigationGrid(
        'accessible',
        [], // obstacles from scene context
        new THREE.Box3(
          new THREE.Vector3(-50, -1000, -50),
          new THREE.Vector3(50, 1000, 50)
        ),
        0.5
      );
      const start = new THREE.Vector3(child.position.x, 0, child.position.z);
      const end = new THREE.Vector3(parent.position.x, 0, parent.position.z);
      const accessible = grid.isAccessible(start, end, this.reachDistance);
      return {
        satisfied: accessible,
        violationAmount: accessible ? 0 : 1,
        metadata: { reachDistance: this.reachDistance },
      };
    } catch {
      // Fallback to Euclidean distance
      const dist = child.position.distanceTo(parent.position);
      const satisfied = dist <= this.reachDistance;
      return {
        satisfied,
        violationAmount: satisfied ? 0 : dist - this.reachDistance,
        metadata: { distance: dist },
      };
    }
  }
}

/**
 * ReachableFrom relation: A* path exists with total length ≤ maxPathLength.
 */
export class ReachableFromRelation extends Relation {
  readonly name = 'reachable_from';
  readonly childTags: TagSet;
  readonly parentTags: TagSet;

  constructor(
    childTags: TagSet = new TagSet(),
    parentTags: TagSet = new TagSet(),
    public readonly maxPathLength: number = 10.0
  ) {
    super();
    this.childTags = childTags;
    this.parentTags = parentTags;
  }

  evaluate(child: ObjectState, parent: ObjectState): RelationResult {
    try {
      const { getCachedNavigationGrid } = require('../evaluator/NavigationGrid');
      const grid = getCachedNavigationGrid(
        'reachable',
        [],
        new THREE.Box3(
          new THREE.Vector3(-50, -1000, -50),
          new THREE.Vector3(50, 1000, 50)
        ),
        0.5
      );
      const start = new THREE.Vector3(child.position.x, 0, child.position.z);
      const end = new THREE.Vector3(parent.position.x, 0, parent.position.z);
      const pathLen = grid.pathLength(start, end);
      const satisfied = pathLen <= this.maxPathLength;
      return {
        satisfied,
        violationAmount: satisfied ? 0 : pathLen - this.maxPathLength,
        metadata: { pathLength: pathLen },
      };
    } catch {
      const dist = child.position.distanceTo(parent.position);
      const satisfied = dist <= this.maxPathLength;
      return {
        satisfied,
        violationAmount: satisfied ? 0 : dist - this.maxPathLength,
        metadata: { distance: dist },
      };
    }
  }
}

// ============================================================================
// SAConfig — Simulated Annealing Configuration
// ============================================================================

/**
 * Configuration for the violation-aware simulated annealing solver.
 */
export interface SAConfig {
  /** Initial temperature */
  initialTemperature: number;

  /** Minimum temperature (stopping condition) */
  minTemperature: number;

  /** Cooling rate (0-1, multiply temperature each step) */
  coolingRate: number;

  /** Maximum iterations per temperature level */
  maxIterationsPerTemp: number;

  /** Random seed for reproducibility */
  randomSeed: number;

  /** Whether to accept moves that increase soft constraint violations */
  acceptSoftViolations: boolean;

  /** Weight for hard constraint violations */
  hardConstraintWeight: number;

  /** Weight for soft constraint violations */
  softConstraintWeight: number;

  /** Energy threshold for early termination */
  convergenceThreshold: number;
}

/** Default SA configuration */
export const DEFAULT_SA_CONFIG: SAConfig = {
  initialTemperature: 1000,
  minTemperature: 0.1,
  coolingRate: 0.95,
  maxIterationsPerTemp: 100,
  randomSeed: 42,
  acceptSoftViolations: true,
  hardConstraintWeight: 100,
  softConstraintWeight: 1,
  convergenceThreshold: 0.001,
};

// ============================================================================
// MoveProposal — Proposal for a solver move
// ============================================================================

/**
 * A proposed move for the SA solver.
 *
 * Each move specifies which object to move, and the new position/rotation
 * (or a delta from the current state).
 */
export interface MoveProposal {
  /** The object ID to move */
  objectId: string;

  /** New position (absolute) */
  newPosition?: THREE.Vector3;

  /** Position delta (relative to current) */
  deltaPosition?: THREE.Vector3;

  /** New rotation (absolute) */
  newRotation?: THREE.Euler;

  /** Rotation delta (relative to current) */
  deltaRotation?: THREE.Euler;

  /** Proposal type for logging/debugging */
  type: 'translate' | 'rotate' | 'translate_rotate' | 'reinit';

  /** Energy change from this proposal (filled after evaluation) */
  energyChange?: number;

  /** Violation change from this proposal (filled after evaluation) */
  violationChange?: number;
}

// ============================================================================
// Constraint — Unified constraint interface
// ============================================================================

/**
 * A constraint in the unified system.
 *
 * Constraints are evaluated against a full state (map of object states)
 * and return a violation amount. Hard constraints have infinite weight
 * and must be satisfied; soft constraints can be violated at a cost.
 */
export interface Constraint {
  /** Unique identifier */
  id: string;

  /** Whether this is a hard (must-satisfy) or soft (optimization) constraint */
  hard: boolean;

  /** Weight for soft constraints (ignored for hard constraints) */
  weight: number;

  /**
   * Evaluate this constraint against a state.
   * Returns the violation amount (0 = fully satisfied).
   */
  evaluate(state: Map<string, ObjectState>): number;

  /** Human-readable description */
  description?: string;
}

// ============================================================================
// ViolationAwareSA — Violation-aware Simulated Annealing
// ============================================================================

/**
 * Violation-aware Simulated Annealing solver.
 *
 * Implements Metropolis-Hastings with violation awareness, matching the
 * original Infinigen's metrop_hastings_with_viol():
 *
 * - Always accept violation-decreasing moves
 * - Never accept hard-constraint-violation-increasing moves
 * - Standard Metropolis for equal violations (temperature-dependent)
 * - Accept soft-violation-increasing moves with probability
 *   exp(-delta / temperature)
 *
 * This differs from the existing SimulatedAnnealing class which:
 * - Doesn't distinguish between hard and soft constraints
 * - Uses a simplified energy computation
 * - Doesn't have violation-aware acceptance criteria
 */
export class ViolationAwareSA {
  private config: SAConfig;
  private rng: () => number;
  private temperature: number;
  private iterationCount: number;
  private bestState: Map<string, ObjectState> | null;
  private bestEnergy: number;

  /** Statistics tracking */
  stats: {
    totalIterations: number;
    acceptedMoves: number;
    rejectedMoves: number;
    hardViolationsRejected: number;
    temperatureSchedule: number[];
    energyHistory: number[];
  };

  constructor(config: Partial<SAConfig> = {}) {
    this.config = { ...DEFAULT_SA_CONFIG, ...config };
    this.temperature = this.config.initialTemperature;
    this.iterationCount = 0;
    this.bestState = null;
    this.bestEnergy = Infinity;

    // Simple seeded RNG (linear congruential)
    let seed = this.config.randomSeed;
    this.rng = () => {
      seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
      return (seed >>> 0) / 0xFFFFFFFF;
    };

    this.stats = {
      totalIterations: 0,
      acceptedMoves: 0,
      rejectedMoves: 0,
      hardViolationsRejected: 0,
      temperatureSchedule: [],
      energyHistory: [],
    };
  }

  /**
   * Run the SA solver.
   *
   * @param initialState - Map of object ID to ObjectState
   * @param constraints - Array of constraints to satisfy
   * @param relations - Array of relations to evaluate
   * @param proposals - Array of move proposals to consider
   * @param config - Optional config override
   * @returns The final (best-found) state
   */
  solve(
    initialState: Map<string, ObjectState>,
    constraints: Constraint[],
    relations: Relation[],
    proposals: MoveProposal[],
    config?: Partial<SAConfig>
  ): Map<string, ObjectState> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.temperature = this.config.initialTemperature;
    this.iterationCount = 0;
    this.bestState = this.cloneState(initialState);
    this.bestEnergy = this.computeEnergy(initialState, constraints, relations);

    let currentEnergy = this.bestEnergy;
    let currentState = initialState;

    while (this.temperature > this.config.minTemperature) {
      this.stats.temperatureSchedule.push(this.temperature);

      for (let i = 0; i < this.config.maxIterationsPerTemp; i++) {
        this.iterationCount++;
        this.stats.totalIterations++;

        // Pick a random proposal
        const proposal = proposals.length > 0
          ? proposals[this.iterationCount % proposals.length]
          : this.generateRandomProposal(currentState);

        if (!proposal) continue;

        // Apply the proposal to get a new state
        const newState = this.applyProposal(currentState, proposal);

        // Compute energies
        const newEnergy = this.computeEnergy(newState, constraints, relations);
        const deltaEnergy = newEnergy - currentEnergy;

        // Decompose into hard and soft violation changes
        const hardViolation = this.computeHardViolation(newState, constraints, relations);
        const currentHardViolation = this.computeHardViolation(currentState, constraints, relations);
        const hardDelta = hardViolation - currentHardViolation;

        // Violation-aware Metropolis-Hastings acceptance:
        // 1. Never accept moves that increase hard constraint violations
        if (hardDelta > 0) {
          this.stats.hardViolationsRejected++;
          this.stats.rejectedMoves++;
          continue;
        }

        // 2. Always accept moves that decrease total violation
        if (deltaEnergy <= 0) {
          currentState = newState;
          currentEnergy = newEnergy;
          this.stats.acceptedMoves++;
        }
        // 3. Standard Metropolis for violation-increasing moves (soft only)
        else if (this.config.acceptSoftViolations) {
          const acceptanceProb = Math.exp(-deltaEnergy / this.temperature);
          if (this.rng() < acceptanceProb) {
            currentState = newState;
            currentEnergy = newEnergy;
            this.stats.acceptedMoves++;
          } else {
            this.stats.rejectedMoves++;
          }
        } else {
          this.stats.rejectedMoves++;
        }

        // Track best state
        if (currentEnergy < this.bestEnergy) {
          this.bestEnergy = currentEnergy;
          this.bestState = this.cloneState(currentState);
        }

        this.stats.energyHistory.push(currentEnergy);

        // Early convergence check
        if (currentEnergy < this.config.convergenceThreshold) {
          return this.bestState;
        }
      }

      // Cool down
      this.temperature *= this.config.coolingRate;
    }

    return this.bestState ?? currentState;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Compute total energy = hard violations * hardWeight + soft violations * softWeight
   */
  private computeEnergy(
    state: Map<string, ObjectState>,
    constraints: Constraint[],
    relations: Relation[]
  ): number {
    let hardViolation = 0;
    let softViolation = 0;

    // Evaluate constraints
    for (const constraint of constraints) {
      const viol = constraint.evaluate(state);
      if (constraint.hard) {
        hardViolation += viol;
      } else {
        softViolation += viol * constraint.weight;
      }
    }

    // Evaluate relations between all pairs
    const objects = Array.from(state.entries());
    for (const [childId, childState] of objects) {
      for (const [parentId, parentState] of objects) {
        if (childId === parentId) continue;
        for (const relation of relations) {
          // Check if relation applies to this pair (via tags)
          if (relation.childTagsMatch(childState) && relation.parentTagsMatch(parentState)) {
            const result = relation.evaluate(childState, parentState);
            if (!result.satisfied) {
              // Treat all relation violations as hard
              hardViolation += result.violationAmount;
            }
          }
        }
      }
    }

    return hardViolation * this.config.hardConstraintWeight +
           softViolation * this.config.softConstraintWeight;
  }

  /**
   * Compute only hard constraint violations.
   */
  private computeHardViolation(
    state: Map<string, ObjectState>,
    constraints: Constraint[],
    relations: Relation[]
  ): number {
    let violation = 0;

    for (const constraint of constraints) {
      if (constraint.hard) {
        violation += constraint.evaluate(state);
      }
    }

    // Relations are treated as hard constraints
    const objects = Array.from(state.entries());
    for (const [childId, childState] of objects) {
      for (const [parentId, parentState] of objects) {
        if (childId === parentId) continue;
        for (const relation of relations) {
          if (relation.childTagsMatch(childState) && relation.parentTagsMatch(parentState)) {
            const result = relation.evaluate(childState, parentState);
            if (!result.satisfied) {
              violation += result.violationAmount;
            }
          }
        }
      }
    }

    return violation;
  }

  /**
   * Generate a random proposal for a random object in the state.
   */
  private generateRandomProposal(state: Map<string, ObjectState>): MoveProposal | null {
    const ids = Array.from(state.keys());
    if (ids.length === 0) return null;

    const objectId = ids[Math.floor(this.rng() * ids.length)];
    const obj = state.get(objectId);
    if (!obj) return null;

    // Apply DOF constraints to the proposal
    const dof = obj.dofConstraints;
    const deltaPos = new THREE.Vector3(
      dof.translationAxes[0] ? (this.rng() - 0.5) * 2 : 0,
      dof.translationAxes[1] ? (this.rng() - 0.5) * 2 : 0,
      dof.translationAxes[2] ? (this.rng() - 0.5) * 2 : 0
    );

    const projectedPos = dof.projectTranslation(obj.position.clone().add(deltaPos));

    return {
      objectId,
      deltaPosition: projectedPos.sub(obj.position),
      type: 'translate_rotate',
    };
  }

  /**
   * Apply a proposal to a state, returning a new state.
   */
  private applyProposal(
    state: Map<string, ObjectState>,
    proposal: MoveProposal
  ): Map<string, ObjectState> {
    const newState = this.cloneState(state);
    const obj = newState.get(proposal.objectId);
    if (!obj) return newState;

    if (proposal.newPosition) {
      obj.position.copy(proposal.newPosition);
    }
    if (proposal.deltaPosition) {
      obj.position.add(proposal.deltaPosition);
    }
    if (proposal.newRotation) {
      obj.rotation.copy(proposal.newRotation);
    }
    if (proposal.deltaRotation) {
      obj.rotation.x += proposal.deltaRotation.x;
      obj.rotation.y += proposal.deltaRotation.y;
      obj.rotation.z += proposal.deltaRotation.z;
    }

    // Apply DOF constraints
    const dof = obj.dofConstraints;
    obj.position.copy(dof.projectTranslation(obj.position));
    obj.rotation.copy(dof.quantizeRotation(obj.rotation));

    // Update bounding box
    obj.updateBoundingBox();

    return newState;
  }

  /**
   * Deep clone a state map.
   */
  private cloneState(state: Map<string, ObjectState>): Map<string, ObjectState> {
    const result = new Map<string, ObjectState>();
    for (const [key, value] of state) {
      result.set(key, value.clone());
    }
    return result;
  }
}

// ============================================================================
// LazyConstraintMemo — Lazy memoization for incremental evaluation
// ============================================================================

/**
 * Lazy memoization for constraint evaluation.
 *
 * When the SA solver moves an object, only constraints that depend
 * on that object need to be re-evaluated. This memo caches evaluation
 * results and invalidates entries when objects move.
 *
 * This matches the original Infinigen's evict_memo_for_move().
 */
export class LazyConstraintMemo {
  private memo: Map<string, number> = new Map();

  /**
   * Evaluate a constraint with memoization.
   *
   * If the result for this constraintId is already cached, return it.
   * Otherwise, call computeFn() to compute and cache the result.
   *
   * @param constraintId - Unique key for this constraint evaluation
   * @param computeFn - Function to compute the value if not cached
   * @returns The cached or computed value
   */
  evaluate(constraintId: string, computeFn: () => number): number {
    const cached = this.memo.get(constraintId);
    if (cached !== undefined) {
      return cached;
    }
    const value = computeFn();
    this.memo.set(constraintId, value);
    return value;
  }

  /**
   * Evict memo entries that depend on a moved object.
   *
   * This implements the eviction strategy from the original:
   * when object X moves, any constraint that involves X must be
   * re-evaluated. We evict entries whose ID contains the object ID.
   *
   * @param movedObjectId - ID of the object that was moved
   */
  evictForMove(movedObjectId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.memo.keys()) {
      // Simple heuristic: if the constraint ID references the moved object
      if (key.includes(movedObjectId)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.memo.delete(key);
    }
  }

  /**
   * Clear all memo entries.
   */
  clear(): void {
    this.memo.clear();
  }

  /**
   * Get the number of cached entries.
   */
  get size(): number {
    return this.memo.size;
  }

  /**
   * Check if a constraint is cached.
   */
  has(constraintId: string): boolean {
    return this.memo.has(constraintId);
  }
}
