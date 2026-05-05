/**
 * CSG Solidification Pipeline — P3-7
 *
 * Provides Constructive Solid Geometry (CSG) operations on THREE.BufferGeometry
 * using a BSP (Binary Space Partitioning) tree approach. This module fills
 * the gap in BlueprintSolidifier.ts where door/window CSG boolean subtraction
 * was stubbed — it actually cuts wall geometry to create openings.
 *
 * Key components:
 * - CSGBSP: Low-level BSP tree for CSG classification and splitting
 * - CSGBoolean: High-level CSG operations (subtract, union, intersect)
 * - CSGSolidificationPipeline: Full pipeline converting 2D floor plans
 *   to solid 3D walls with door/window openings cut via CSG
 * - OpeningType / OpeningConfig: Types for specifying openings
 *
 * Algorithm overview:
 * 1. Convert BufferGeometry to a list of CSGPolygon triangles
 * 2. Build a BSP tree from one mesh's polygons
 * 3. Classify the other mesh's polygons against the BSP tree
 * 4. Split polygons that straddle the partitioning plane
 * 5. Collect polygons in the desired half-space (inside/outside)
 * 6. Convert resulting polygons back to BufferGeometry
 *
 * For subtract(A, B): Build BSP from B, clip A's polygons against
 * inverted B tree (keep polygons of A that are outside B).
 *
 * @module constraints/indoor
 */

import * as THREE from 'three';

// ============================================================================
// Constants
// ============================================================================

/** Epsilon for plane-side classification to avoid z-fighting / coplanar issues */
const EPSILON = 1e-5;

/** Maximum BSP tree depth to prevent runaway recursion */
const MAX_BSP_DEPTH = 128;

// ============================================================================
// CSGVertex — A single vertex with position and optional attributes
// ============================================================================

/**
 * A lightweight vertex used within CSG operations.
 *
 * Stores position, normal, and UV. These are interpolated when
 * splitting polygons across BSP partition planes.
 */
class CSGVertex {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  uv: THREE.Vector2;

  constructor(
    position: THREE.Vector3,
    normal: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
    uv: THREE.Vector2 = new THREE.Vector2(0, 0),
  ) {
    this.position = position.clone();
    this.normal = normal.clone();
    this.uv = uv.clone();
  }

  /**
   * Linearly interpolate between this vertex and another.
   * Used when splitting a polygon across a BSP partition plane.
   *
   * @param other - The other vertex
   * @param t     - Interpolation parameter (0 = this, 1 = other)
   */
  lerp(other: CSGVertex, t: number): CSGVertex {
    return new CSGVertex(
      new THREE.Vector3().lerpVectors(this.position, other.position, t),
      new THREE.Vector3().lerpVectors(this.normal, other.normal, t).normalize(),
      new THREE.Vector2().lerpVectors(this.uv, other.uv, t),
    );
  }

  clone(): CSGVertex {
    return new CSGVertex(this.position.clone(), this.normal.clone(), this.uv.clone());
  }
}

// ============================================================================
// CSGPolygon — A convex polygon (triangle fan) for CSG operations
// ============================================================================

/**
 * A convex polygon used within CSG operations.
 *
 * Typically a triangle (3 vertices) but may temporarily have more
 * vertices during splitting before being re-triangulated.
 * Carries its own plane for fast BSP classification.
 */
class CSGPolygon {
  vertices: CSGVertex[];
  plane: THREE.Plane;

  constructor(vertices: CSGVertex[]) {
    this.vertices = vertices;
    this.plane = CSGPolygon.computePlane(vertices);
  }

  /**
   * Compute the plane of a polygon from its first three non-collinear vertices.
   */
  private static computePlane(vertices: CSGVertex[]): THREE.Plane {
    if (vertices.length < 3) {
      return new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    }
    const a = vertices[0].position;
    const b = vertices[1].position;
    const c = vertices[2].position;
    const plane = new THREE.Plane();
    plane.setFromCoplanarPoints(a, b, c);
    return plane;
  }

  /**
   * Flip the polygon's winding order and plane normal.
   * Used when inverting a BSP tree.
   */
  flip(): void {
    this.vertices.reverse();
    for (const v of this.vertices) {
      v.normal.negate();
    }
    this.plane.negate();
  }

  /**
   * Triangulate this polygon into a list of triangles.
   * Uses a simple fan triangulation from the first vertex.
   */
  triangulate(): CSGPolygon[] {
    if (this.vertices.length < 3) return [];
    if (this.vertices.length === 3) return [this];

    const triangles: CSGPolygon[] = [];
    for (let i = 1; i < this.vertices.length - 1; i++) {
      triangles.push(
        new CSGPolygon([
          this.vertices[0].clone(),
          this.vertices[i].clone(),
          this.vertices[i + 1].clone(),
        ]),
      );
    }
    return triangles;
  }

  clone(): CSGPolygon {
    return new CSGPolygon(this.vertices.map((v) => v.clone()));
  }
}

// ============================================================================
// CSGBSP — Binary Space Partitioning tree node
// ============================================================================

/**
 * BSP tree node for CSG operations.
 *
 * Each node stores:
 * - A partitioning plane
 * - Polygons that lie on this plane (coplanar)
 * - A front child (polygons on the positive/normal side of the plane)
 * - A back child (polygons on the negative side of the plane)
 *
 * The tree is built by choosing a polygon's plane as the partitioning
 * plane, then classifying all remaining polygons as front, back, or
 * coplanar. Polygons that straddle the plane are split.
 */
class CSGBSP {
  plane: THREE.Plane | null = null;
  front: CSGBSP | null = null;
  back: CSGBSP | null = null;
  polygons: CSGPolygon[] = [];

  /**
   * Build the BSP tree from a list of polygons.
   *
   * Picks the first polygon's plane as the partitioning plane,
   * then classifies and splits the remaining polygons.
   *
   * @param polygons - Array of CSGPolygon to partition
   * @param depth   - Current depth (for safety cap)
   */
  build(polygons: CSGPolygon[], depth: number = 0): void {
    if (depth > MAX_BSP_DEPTH || polygons.length === 0) return;

    if (this.plane === null) {
      this.plane = polygons[0].plane.clone();
    }

    const frontList: CSGPolygon[] = [];
    const backList: CSGPolygon[] = [];
    const coplanarList: CSGPolygon[] = [];

    for (const polygon of polygons) {
      this.splitPolygon(polygon, coplanarList, frontList, backList);
    }

    // Coplanar polygons are stored in this node
    this.polygons = coplanarList;

    // Recurse on front
    if (frontList.length > 0) {
      if (this.front === null) this.front = new CSGBSP();
      this.front.build(frontList, depth + 1);
    }

    // Recurse on back
    if (backList.length > 0) {
      if (this.back === null) this.back = new CSGBSP();
      this.back.build(backList, depth + 1);
    }
  }

  /**
   * Classify and optionally split a polygon against this node's plane.
   *
   * Each vertex is tested against the plane:
   * - COPLANAR: on the plane
   * - FRONT: on the positive/normal side
   * - BACK: on the negative side
   * - SPANNING: straddles the plane
   *
   * Spanning polygons are split into front and back pieces.
   * Coplanar polygons are classified as front or back based on
   * their normal alignment with the partition plane.
   */
  private splitPolygon(
    polygon: CSGPolygon,
    coplanar: CSGPolygon[],
    front: CSGPolygon[],
    back: CSGPolygon[],
  ): void {
    if (this.plane === null) {
      coplanar.push(polygon);
      return;
    }

    const COPLANAR = 0;
    const FRONT = 1;
    const BACK = 2;
    const SPANNING = 3;

    let polygonType = 0;
    const vertexTypes: number[] = [];

    for (const vertex of polygon.vertices) {
      const dist = this.plane.distanceToPoint(vertex.position);
      let type: number;
      if (dist < -EPSILON) {
        type = BACK;
      } else if (dist > EPSILON) {
        type = FRONT;
      } else {
        type = COPLANAR;
      }
      polygonType |= type;
      vertexTypes.push(type);
    }

    switch (polygonType) {
      case COPLANAR: {
        // Classify based on normal alignment
        const dot = this.plane.normal.dot(polygon.plane.normal);
        (dot > 0 ? coplanar : back).push(polygon);
        break;
      }
      case FRONT:
        front.push(polygon);
        break;
      case BACK:
        back.push(polygon);
        break;
      case SPANNING: {
        // Split the polygon across the plane
        const frontVerts: CSGVertex[] = [];
        const backVerts: CSGVertex[] = [];

        for (let i = 0; i < polygon.vertices.length; i++) {
          const j = (i + 1) % polygon.vertices.length;
          const vi = polygon.vertices[i];
          const vj = polygon.vertices[j];
          const ti = vertexTypes[i];
          const tj = vertexTypes[j];

          if (ti !== BACK) frontVerts.push(vi.clone());
          if (ti !== FRONT) backVerts.push(ti !== BACK ? vi.clone() : vi.clone());

          if ((ti | tj) === SPANNING) {
            // Edge crosses the plane — compute intersection
            const di = this.plane.distanceToPoint(vi.position);
            const dj = this.plane.distanceToPoint(vj.position);
            const denom = di - dj;
            const t = Math.abs(denom) > EPSILON ? di / denom : 0;
            const v = vi.lerp(vj, t);
            frontVerts.push(v.clone());
            backVerts.push(v.clone());
          }
        }

        if (frontVerts.length >= 3) {
          front.push(new CSGPolygon(frontVerts));
        }
        if (backVerts.length >= 3) {
          back.push(new CSGPolygon(backVerts));
        }
        break;
      }
    }
  }

  /**
   * Invert the BSP tree — swap inside/outside by flipping all
   * plane normals and polygon windings recursively.
   */
  invert(): void {
    for (const polygon of this.polygons) {
      polygon.flip();
    }
    if (this.plane) {
      this.plane.negate();
    }
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    // Swap front and back children
    const temp = this.front;
    this.front = this.back;
    this.back = temp;
  }

  /**
   * Clip a list of polygons against this BSP tree.
   *
   * Removes all polygons that are on the inside (back side) of
   * every partitioning plane. Equivalent to keeping only polygons
   * that are outside the volume defined by this BSP tree.
   *
   * @param polygons - Polygons to clip
   * @returns Clipped polygon list
   */
  clipPolygons(polygons: CSGPolygon[]): CSGPolygon[] {
    if (this.plane === null) return polygons.slice();

    const front: CSGPolygon[] = [];
    const back: CSGPolygon[] = [];

    for (const polygon of polygons) {
      this.splitPolygon(polygon, front, front, back);
    }

    // Recurse: clip front polygons against front child
    let result: CSGPolygon[];
    if (this.front) {
      result = this.front.clipPolygons(front);
    } else {
      result = front;
    }

    // Back polygons are inside the volume — discard them
    // (unless we want to keep them for intersection)
    return result;
  }

  /**
   * Clip polygons, keeping only those inside the BSP volume.
   * The opposite of clipPolygons — keeps back-side polygons.
   */
  clipPolygonsInside(polygons: CSGPolygon[]): CSGPolygon[] {
    if (this.plane === null) return [];

    const front: CSGPolygon[] = [];
    const back: CSGPolygon[] = [];

    for (const polygon of polygons) {
      this.splitPolygon(polygon, front, front, back);
    }

    // Front polygons are outside — discard
    let result: CSGPolygon[] = [];
    if (this.back) {
      result = this.back.clipPolygonsInside(back);
    } else {
      result = back;
    }

    return result;
  }

  /**
   * Collect all polygons in the tree (in-order traversal).
   */
  allPolygons(): CSGPolygon[] {
    let result: CSGPolygon[] = [...this.polygons];
    if (this.front) result = result.concat(this.front.allPolygons());
    if (this.back) result = result.concat(this.back.allPolygons());
    return result;
  }

  /**
   * Classify a point as inside (back), outside (front), or on the plane.
   *
   * @returns 1 = front/outside, -1 = back/inside, 0 = on plane
   */
  classifyPoint(point: THREE.Vector3): number {
    if (this.plane === null) return 1;

    const dist = this.plane.distanceToPoint(point);

    if (dist > EPSILON) {
      return this.front ? this.front.classifyPoint(point) : 1;
    } else if (dist < -EPSILON) {
      return this.back ? this.back.classifyPoint(point) : -1;
    } else {
      // On the plane — check children
      let result = 0;
      if (this.front) result = this.front.classifyPoint(point);
      if (result === 0 && this.back) result = this.back.classifyPoint(point);
      return result;
    }
  }
}

// ============================================================================
// CSGBoolean — High-level CSG boolean operations
// ============================================================================

/**
 * Performs Constructive Solid Geometry (CSG) boolean operations
 * on THREE.BufferGeometry using BSP trees.
 *
 * All operations are CPU-based and operate on triangle meshes.
 * The geometry must be manifold (watertight) for correct results.
 *
 * Usage:
 * ```typescript
 * const csg = new CSGBoolean();
 * const result = csg.subtract(wallGeometry, openingGeometry);
 * // result is a new BufferGeometry with the opening cut out
 * ```
 */
export class CSGBoolean {
  /**
   * Subtract meshB from meshA (A - B).
   *
   * Cuts away the volume of B from A. Used for creating door/window
   * openings by subtracting a box-shaped cutter from wall geometry.
   *
   * Algorithm:
   * 1. Build BSP tree from B
   * 2. Invert B's tree (swap inside/outside)
   * 3. Clip A's polygons against inverted B (keep A outside B)
   * 4. Build BSP tree from A
   * 5. Clip B's polygons against A (keep B inside A — these are the internal faces)
   * 6. Combine A's clipped polygons with B's clipped (inverted) polygons
   * 7. Invert the result back
   *
   * @param geometryA - The geometry to subtract from (e.g., a wall)
   * @param geometryB - The geometry to remove (e.g., a door opening box)
   * @returns New BufferGeometry with B removed from A
   */
  subtract(geometryA: THREE.BufferGeometry, geometryB: THREE.BufferGeometry): THREE.BufferGeometry {
    const polygonsA = CSGBoolean.geometryToPolygons(geometryA);
    const polygonsB = CSGBoolean.geometryToPolygons(geometryB);

    // Build BSP from B, invert it
    const bspB = new CSGBSP();
    bspB.build(polygonsB);
    bspB.invert();

    // Clip A's polygons against inverted B (keep A \ B)
    const clippedA = bspB.clipPolygons(polygonsA);

    // Build BSP from A
    const bspA = new CSGBSP();
    bspA.build(clippedA);

    // Clip B's polygons against A (keep B's surfaces that are inside A)
    const clippedB = bspA.clipPolygons(polygonsB);

    // Invert B's clipped polygons (they form the internal walls of the cut)
    for (const p of clippedB) {
      p.flip();
    }

    // Combine
    const resultPolygons = clippedA.concat(clippedB);

    return CSGBoolean.polygonsToGeometry(resultPolygons);
  }

  /**
   * Union of meshA and meshB (A ∪ B).
   *
   * Merges two meshes into one, removing internal faces.
   *
   * Algorithm:
   * 1. Build BSP from B, clip A's polygons against B (keep A outside B)
   * 2. Build BSP from A, clip B's polygons against A (keep B outside A)
   * 3. Combine the clipped polygon lists
   *
   * @param geometryA - First geometry
   * @param geometryB - Second geometry
   * @returns New BufferGeometry representing the union
   */
  union(geometryA: THREE.BufferGeometry, geometryB: THREE.BufferGeometry): THREE.BufferGeometry {
    const polygonsA = CSGBoolean.geometryToPolygons(geometryA);
    const polygonsB = CSGBoolean.geometryToPolygons(geometryB);

    // Build BSP from B, clip A against B
    const bspB = new CSGBSP();
    bspB.build(polygonsB);
    const clippedA = bspB.clipPolygons(polygonsA);

    // Build BSP from A, clip B against A
    const bspA = new CSGBSP();
    bspA.build(polygonsA);
    const clippedB = bspA.clipPolygons(polygonsB);

    const resultPolygons = clippedA.concat(clippedB);
    return CSGBoolean.polygonsToGeometry(resultPolygons);
  }

  /**
   * Intersection of meshA and meshB (A ∩ B).
   *
   * Keeps only the overlapping volume between two meshes.
   *
   * Algorithm:
   * 1. Build BSP from B, invert it, clip A against inverted B (keep A inside B)
   * 2. Build BSP from A, invert it, clip B against inverted A (keep B inside A)
   * 3. Invert A's BSP, clip A-inside-B against that
   * 4. Combine
   *
   * @param geometryA - First geometry
   * @param geometryB - Second geometry
   * @returns New BufferGeometry representing the intersection
   */
  intersect(geometryA: THREE.BufferGeometry, geometryB: THREE.BufferGeometry): THREE.BufferGeometry {
    const polygonsA = CSGBoolean.geometryToPolygons(geometryA);
    const polygonsB = CSGBoolean.geometryToPolygons(geometryB);

    // Build BSP from B
    const bspB = new CSGBSP();
    bspB.build(polygonsB);

    // Invert B to clip A (keeping A inside B)
    const bspBInv = new CSGBSP();
    bspBInv.build(polygonsB.map((p) => p.clone()));
    bspBInv.invert();

    const clippedA = bspBInv.clipPolygons(polygonsA);

    // Build BSP from A
    const bspA = new CSGBSP();
    bspA.build(polygonsA);

    // Invert A to clip B (keeping B inside A)
    const bspAInv = new CSGBSP();
    bspAInv.build(polygonsA.map((p) => p.clone()));
    bspAInv.invert();

    const clippedB = bspAInv.clipPolygons(polygonsB);

    // Flip B's polygons back (they were clipped against inverted A)
    for (const p of clippedB) {
      p.flip();
    }

    const resultPolygons = clippedA.concat(clippedB);
    return CSGBoolean.polygonsToGeometry(resultPolygons);
  }

  // ── Static conversion helpers ─────────────────────────────────────────

  /**
   * Convert a THREE.BufferGeometry to an array of CSGPolygon triangles.
   *
   * Extracts position, normal, and UV attributes and creates
   * one CSGPolygon per triangle.
   */
  static geometryToPolygons(geometry: THREE.BufferGeometry): CSGPolygon[] {
    const polygons: CSGPolygon[] = [];

    // Ensure geometry has an index
    let indexedGeometry = geometry;
    if (!geometry.index) {
      indexedGeometry = geometry.clone();
      const posAttr = indexedGeometry.getAttribute('position') as THREE.BufferAttribute;
      const indices: number[] = [];
      for (let i = 0; i < posAttr.count; i++) indices.push(i);
      indexedGeometry.setIndex(indices);
    }

    const posAttr = indexedGeometry.getAttribute('position') as THREE.BufferAttribute;
    const normalAttr = indexedGeometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const uvAttr = indexedGeometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const indexAttr = indexedGeometry.getIndex()!;

    const indices = indexAttr.array;
    const triCount = indices.length / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = indices[t * 3];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];

      const vertices: CSGVertex[] = [];
      for (const idx of [i0, i1, i2]) {
        const position = new THREE.Vector3(
          posAttr.getX(idx),
          posAttr.getY(idx),
          posAttr.getZ(idx),
        );

        const normal = normalAttr
          ? new THREE.Vector3(normalAttr.getX(idx), normalAttr.getY(idx), normalAttr.getZ(idx))
          : new THREE.Vector3(0, 1, 0);

        const uv = uvAttr
          ? new THREE.Vector2(uvAttr.getX(idx), uvAttr.getY(idx))
          : new THREE.Vector2(0, 0);

        vertices.push(new CSGVertex(position, normal, uv));
      }

      // Skip degenerate triangles
      const edge1 = new THREE.Vector3().subVectors(vertices[1].position, vertices[0].position);
      const edge2 = new THREE.Vector3().subVectors(vertices[2].position, vertices[0].position);
      const cross = new THREE.Vector3().crossVectors(edge1, edge2);
      if (cross.lengthSq() < EPSILON * EPSILON) continue;

      polygons.push(new CSGPolygon(vertices));
    }

    return polygons;
  }

  /**
   * Convert an array of CSGPolygon back to a THREE.BufferGeometry.
   *
   * Triangulates any non-triangle polygons (from splitting),
   * then builds indexed position/normal/UV buffers.
   */
  static polygonsToGeometry(polygons: CSGPolygon[]): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    for (const polygon of polygons) {
      // Triangulate (in case splitting produced polygons with >3 vertices)
      const triangles = polygon.triangulate();

      for (const tri of triangles) {
        for (const v of tri.vertices) {
          positions.push(v.position.x, v.position.y, v.position.z);
          normals.push(v.normal.x, v.normal.y, v.normal.z);
          uvs.push(v.uv.x, v.uv.y);
        }
        indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
        vertexOffset += 3;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

// ============================================================================
// BSPTree — Public-facing BSP tree class
// ============================================================================

/**
 * Public-facing Binary Space Partitioning tree for CSG operations.
 *
 * Wraps the internal CSGBSP with a cleaner API for external use.
 * Provides methods for building from mesh geometry, clipping polygons,
 * classifying points, and inverting the tree.
 *
 * Usage:
 * ```typescript
 * const bsp = new BSPTree();
 * bsp.buildFromMesh(geometry);
 * const isInside = bsp.classifyPoint(somePoint) < 0;
 * ```
 */
export class BSPTree {
  private root: CSGBSP;

  constructor() {
    this.root = new CSGBSP();
  }

  /**
   * Build the BSP tree from a BufferGeometry mesh.
   *
   * Converts the geometry to CSGPolygon list and recursively
   * partitions it into a BSP tree.
   *
   * @param geometry - The mesh geometry to partition
   */
  buildFromMesh(geometry: THREE.BufferGeometry): void {
    const polygons = CSGBoolean.geometryToPolygons(geometry);
    this.root = new CSGBSP();
    this.root.build(polygons);
  }

  /**
   * Clip a list of polygons against this tree, keeping only
   * those outside the tree's volume.
   *
   * @param polygons - Polygons to clip (can be from another BSP)
   * @returns Clipped polygon list
   */
  clipPolygons(polygons: CSGPolygon[]): CSGPolygon[] {
    return this.root.clipPolygons(polygons);
  }

  /**
   * Classify a point as inside, outside, or on the plane.
   *
   * @param point - The point to classify
   * @returns 1 = outside, -1 = inside, 0 = on the plane
   */
  classifyPoint(point: THREE.Vector3): number {
    return this.root.classifyPoint(point);
  }

  /**
   * Invert the BSP tree — swap inside and outside.
   *
   * Flips all plane normals and polygon windings,
   * and swaps front/back children recursively.
   */
  invert(): void {
    this.root.invert();
  }

  /**
   * Get all polygons in the tree.
   */
  allPolygons(): CSGPolygon[] {
    return this.root.allPolygons();
  }

  /**
   * Get the internal BSP root (for advanced use).
   */
  getRoot(): CSGBSP {
    return this.root;
  }
}

// ============================================================================
// OpeningType — Type of opening in a wall
// ============================================================================

/**
 * Enumeration of opening types that can be cut into wall geometry.
 *
 * Each type has different default dimensions and frame geometry.
 */
export enum OpeningType {
  /** Standard door opening — tall, reaches near the ceiling */
  DOOR = 'door',
  /** Window opening — has a sill, doesn't reach the floor or ceiling */
  WINDOW = 'window',
  /** Archway — a wide opening without a door frame */
  ARCHWAY = 'archway',
  /** Passage — a simple rectangular opening (no frame) */
  PASSAGE = 'passage',
}

// ============================================================================
// OpeningConfig — Configuration for wall openings
// ============================================================================

/**
 * Configuration for a wall opening (door, window, archway, passage).
 *
 * Specifies the opening's type, position, dimensions, and frame style.
 * Used by CSGSolidificationPipeline.cutOpening() and add*Frame() methods.
 */
export interface OpeningConfig {
  /** Type of opening */
  type: OpeningType;
  /** Center position of the opening in 3D space */
  position: THREE.Vector3;
  /** Width of the opening in meters */
  width: number;
  /** Height of the opening in meters */
  height: number;
  /** Height of the sill above the floor (0 for doors) */
  sillHeight: number;
  /** Depth/thickness of the opening (should match wall thickness) */
  depth: number;
  /** Y-axis rotation to align with the wall direction */
  rotationY: number;
  /** Frame style: 'wooden', 'metal', 'none' */
  frameStyle: 'wooden' | 'metal' | 'none';
  /** Frame thickness in meters (default: 0.05) */
  frameThickness: number;
  /** Whether to include glass (for windows) */
  hasGlass: boolean;
  /** Glass opacity (0-1, default: 0.3) */
  glassOpacity: number;
  /** Whether this opening connects two rooms */
  isInterior: boolean;
  /** Name of room on side A (for doors) */
  roomA: string;
  /** Name of room on side B (for doors) */
  roomB: string;
  /** Unique identifier */
  id: string;
}

/** Default opening configuration values */
const DEFAULT_OPENING_CONFIG: Partial<OpeningConfig> = {
  type: OpeningType.DOOR,
  width: 0.9,
  height: 2.1,
  sillHeight: 0,
  depth: 0.15,
  rotationY: 0,
  frameStyle: 'wooden',
  frameThickness: 0.05,
  hasGlass: false,
  glassOpacity: 0.3,
  isInterior: true,
  roomA: '',
  roomB: '',
  id: '',
};

// ============================================================================
// StaircaseConfig — Configuration for staircase geometry
// ============================================================================

/**
 * Configuration for staircase generation within a room.
 */
export interface StaircaseConfig {
  /** Tread depth in meters (default: 0.28) */
  treadDepth: number;
  /** Riser height in meters (default: 0.18) */
  riserHeight: number;
  /** Staircase width in meters (default: 1.0) */
  width: number;
  /** Y coordinate of the lower floor (default: 0) */
  fromFloorY: number;
  /** Y coordinate of the upper floor (default: 2.7) */
  toFloorY: number;
  /** Minimum headroom in meters (default: 2.0) */
  minHeadroom: number;
  /** Minimum tread depth for validity (default: 0.22) */
  minTreadDepth: number;
  /** Maximum riser height for validity (default: 0.20) */
  maxRiserHeight: number;
  /** Starting position in the room (default: origin) */
  position: THREE.Vector3;
  /** Y-axis rotation of the staircase (default: 0) */
  rotationY: number;
  /** Whether to include handrails (default: true) */
  includeHandrails: boolean;
  /** Material color for treads (default: 0x8b7355) */
  treadColor: number;
  /** Material color for risers (default: 0x6b5335) */
  riserColor: number;
}

/** Default staircase configuration */
const DEFAULT_STAIRCASE_CONFIG: Partial<StaircaseConfig> = {
  treadDepth: 0.28,
  riserHeight: 0.18,
  width: 1.0,
  fromFloorY: 0,
  toFloorY: 2.7,
  minHeadroom: 2.0,
  minTreadDepth: 0.22,
  maxRiserHeight: 0.20,
  position: new THREE.Vector3(),
  rotationY: 0,
  includeHandrails: true,
  treadColor: 0x8b7355,
  riserColor: 0x6b5335,
};

// ============================================================================
// FloorPlanConfig — Configuration for solidification pipeline
// ============================================================================

/**
 * Configuration for the CSGSolidificationPipeline.
 *
 * Controls wall thickness, default opening dimensions,
 * and material parameters.
 */
export interface FloorPlanConfig {
  /** Wall thickness in meters (default: 0.15) */
  wallThickness: number;
  /** Default floor height Y (default: 0) */
  defaultFloorY: number;
  /** Default ceiling height Y (default: 2.7) */
  defaultCeilingY: number;
  /** Default door width (default: 0.9) */
  doorWidth: number;
  /** Default door height (default: 2.1) */
  doorHeight: number;
  /** Default window width (default: 1.2) */
  windowWidth: number;
  /** Default window height (default: 1.4) */
  windowHeight: number;
  /** Default window sill height (default: 0.9) */
  windowSillHeight: number;
  /** Whether to use CSG for cutting openings (false = simple box removal) */
  useCSG: boolean;
}

/** Default floor plan configuration */
export const DEFAULT_FLOOR_PLAN_CONFIG: FloorPlanConfig = {
  wallThickness: 0.15,
  defaultFloorY: 0,
  defaultCeilingY: 2.7,
  doorWidth: 0.9,
  doorHeight: 2.1,
  windowWidth: 1.2,
  windowHeight: 1.4,
  windowSillHeight: 0.9,
  useCSG: true,
};

// ============================================================================
// OpeningResult — Result of cutting an opening
// ============================================================================

/**
 * Result of cutting an opening in a wall.
 *
 * Contains the modified wall geometry and optional frame/glass meshes.
 */
export interface OpeningResult {
  /** The wall geometry with the opening cut out */
  wallGeometry: THREE.BufferGeometry;
  /** The opening cutter geometry (for debugging) */
  cutterGeometry: THREE.BufferGeometry;
  /** Door frame mesh (if applicable) */
  frameMesh: THREE.Mesh | null;
  /** Door leaf mesh (if applicable) */
  leafMesh: THREE.Mesh | null;
  /** Window glass pane mesh (if applicable) */
  glassMesh: THREE.Mesh | null;
  /** The opening configuration used */
  config: OpeningConfig;
}

// ============================================================================
// CSGSolidificationPipeline — Main pipeline class
// ============================================================================

/**
 * Converts 2D floor plans to solid 3D wall geometry with door/window
 * openings cut via CSG boolean subtraction.
 *
 * This pipeline replaces the stubbed CSG operations in BlueprintSolidifier
 * with actual BSP-based boolean operations. It can:
 *
 * 1. Solidify an entire floor plan into 3D geometry
 * 2. Cut individual door/window openings in walls
 * 3. Add door frames, window frames, and glass panes
 * 4. Add staircase geometry connecting floors
 *
 * All CSG operations use the BSP tree approach for robustness:
 * - Build a BSP tree from the cutter geometry
 * - Classify wall polygons against the BSP tree
 * - Split polygons that straddle the partition plane
 * - Collect only the desired polygons (inside/outside)
 *
 * Usage:
 * ```typescript
 * const pipeline = new CSGSolidificationPipeline();
 * const building = pipeline.solidifyFloorPlan(floorPlan, config);
 *
 * // Cut a door opening in a wall
 * const result = pipeline.cutOpening(wallGeometry, OpeningType.DOOR, {
 *   position: new THREE.Vector3(2, 1.05, 0),
 *   width: 0.9,
 *   height: 2.1,
 *   sillHeight: 0,
 *   depth: 0.15,
 * }, position, dimensions);
 * ```
 */
export class CSGSolidificationPipeline {
  private csg: CSGBoolean;
  private config: FloorPlanConfig;

  constructor(config: Partial<FloorPlanConfig> = {}) {
    this.config = { ...DEFAULT_FLOOR_PLAN_CONFIG, ...config };
    this.csg = new CSGBoolean();
  }

  // ── Floor Plan Solidification ──────────────────────────────────────

  /**
   * Convert a 2D floor plan to solid 3D walls with openings.
   *
   * Takes a FloorPlanSolution (room polygons, adjacency, exterior walls)
   * and produces a THREE.Group containing:
   * - Extruded wall geometry per room
   * - Floor and ceiling planes
   * - Door openings cut via CSG between adjacent rooms
   * - Window openings cut via CSG on exterior walls
   * - Door frames, window frames, and glass panes
   *
   * @param floorPlan - The solved floor plan from FloorPlanSolver
   * @param config    - Optional configuration overrides
   * @returns A THREE.Group with the complete 3D building
   */
  solidifyFloorPlan(
    floorPlan: {
      rooms: Map<string, { polygon: { vertices: THREE.Vector2[] }; roomType: string }>;
      adjacencyGraph: Map<string, string[]>;
      exteriorWalls: Map<string, Array<{ start: THREE.Vector2; end: THREE.Vector2 }>>;
    },
    config?: Partial<FloorPlanConfig>,
  ): THREE.Group {
    const cfg = config ? { ...this.config, ...config } : this.config;
    const building = new THREE.Group();
    building.name = 'CSGSolidifiedBuilding';

    // Step 1: Create wall geometry per room
    const wallGeometries = new Map<string, THREE.BufferGeometry>();

    for (const [roomName, roomData] of floorPlan.rooms) {
      const polygon = roomData.polygon;
      if (polygon.vertices.length < 3) continue;

      const wallGeom = this.extrudeWallFromPolygon(
        polygon.vertices,
        cfg.defaultFloorY,
        cfg.defaultCeilingY,
        cfg.wallThickness,
      );

      wallGeometries.set(roomName, wallGeom);

      // Create floor
      const floorMesh = this.createFloorMesh(polygon.vertices, cfg.defaultFloorY);
      if (floorMesh) building.add(floorMesh);

      // Create ceiling
      const ceilingMesh = this.createCeilingMesh(polygon.vertices, cfg.defaultCeilingY);
      if (ceilingMesh) building.add(ceilingMesh);
    }

    // Step 2: Cut door openings between adjacent rooms
    const processedPairs = new Set<string>();
    for (const [roomName, neighbors] of floorPlan.adjacencyGraph) {
      for (const neighbor of neighbors) {
        const pairKey = roomName < neighbor
          ? `${roomName}__${neighbor}`
          : `${neighbor}__${roomName}`;

        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const roomA = floorPlan.rooms.get(roomName);
        const roomB = floorPlan.rooms.get(neighbor);
        if (!roomA || !roomB) continue;

        // Find shared wall position
        const sharedPos = this.findSharedWallCenter(
          roomA.polygon.vertices,
          roomB.polygon.vertices,
        );
        if (!sharedPos) continue;

        const wallGeom = wallGeometries.get(roomName);
        if (!wallGeom) continue;

        // Cut the door opening
        const openingResult = this.cutOpening(wallGeom, OpeningType.DOOR, {
          type: OpeningType.DOOR,
          position: sharedPos.position,
          width: cfg.doorWidth,
          height: cfg.doorHeight,
          sillHeight: 0,
          depth: cfg.wallThickness * 2, // Cut through the wall
          rotationY: sharedPos.rotationY,
          frameStyle: 'wooden',
          frameThickness: 0.05,
          hasGlass: false,
          glassOpacity: 0,
          isInterior: true,
          roomA: roomName,
          roomB: neighbor,
          id: `door_${roomName}_${neighbor}`,
        });

        // Replace wall geometry with cut version
        wallGeometries.set(roomName, openingResult.wallGeometry);

        // Add frame and leaf meshes
        if (openingResult.frameMesh) building.add(openingResult.frameMesh);
        if (openingResult.leafMesh) building.add(openingResult.leafMesh);
      }
    }

    // Step 3: Cut window openings on exterior walls
    for (const [roomName, exteriorWalls] of floorPlan.exteriorWalls) {
      const wallGeom = wallGeometries.get(roomName);
      if (!wallGeom) continue;

      for (const wall of exteriorWalls) {
        const centerX = (wall.start.x + wall.end.x) / 2;
        const centerZ = (wall.start.y + wall.end.y) / 2;
        const wallDir = new THREE.Vector2().subVectors(wall.end, wall.start);
        const wallLen = wallDir.length();
        if (wallLen < cfg.windowWidth + 0.3) continue;

        wallDir.normalize();
        const rotationY = Math.atan2(wallDir.y, wallDir.x);

        const windowResult = this.cutOpening(wallGeom, OpeningType.WINDOW, {
          type: OpeningType.WINDOW,
          position: new THREE.Vector3(
            centerX,
            cfg.defaultFloorY + cfg.windowSillHeight + cfg.windowHeight / 2,
            centerZ,
          ),
          width: cfg.windowWidth,
          height: cfg.windowHeight,
          sillHeight: cfg.windowSillHeight,
          depth: cfg.wallThickness * 2,
          rotationY,
          frameStyle: 'metal',
          frameThickness: 0.04,
          hasGlass: true,
          glassOpacity: 0.3,
          isInterior: false,
          roomA: roomName,
          roomB: '',
          id: `window_${roomName}_${Date.now()}`,
        });

        // Replace wall geometry
        wallGeometries.set(roomName, windowResult.wallGeometry);

        // Add frame and glass meshes
        if (windowResult.frameMesh) building.add(windowResult.frameMesh);
        if (windowResult.glassMesh) building.add(windowResult.glassMesh);
      }
    }

    // Step 4: Add wall meshes to building
    for (const [roomName, wallGeom] of wallGeometries) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xf5f0e8,
        roughness: 0.85,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      const wallMesh = new THREE.Mesh(wallGeom, material);
      wallMesh.name = `${roomName}_CSGWalls`;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      building.add(wallMesh);
    }

    return building;
  }

  // ── Opening Cutting ────────────────────────────────────────────────

  /**
   * Cut a door/window opening in wall geometry using CSG subtraction.
   *
   * Creates a box-shaped cutter matching the opening dimensions and
   * position, then uses CSG subtract to cut it from the wall.
   * Optionally adds frame and glass pane geometry.
   *
   * @param wallGeometry - The wall geometry to cut
   * @param openingType  - Type of opening (DOOR, WINDOW, etc.)
   * @param config       - Opening configuration (position, dimensions, frame)
   * @returns OpeningResult with modified wall geometry and optional frame/glass
   */
  cutOpening(
    wallGeometry: THREE.BufferGeometry,
    openingType: OpeningType,
    config: Partial<OpeningConfig>,
  ): OpeningResult {
    const cfg: OpeningConfig = {
      type: openingType,
      position: config.position ?? DEFAULT_OPENING_CONFIG.position ?? new THREE.Vector3(),
      width: config.width ?? DEFAULT_OPENING_CONFIG.width ?? 0.9,
      height: config.height ?? DEFAULT_OPENING_CONFIG.height ?? 2.1,
      sillHeight: config.sillHeight ?? DEFAULT_OPENING_CONFIG.sillHeight ?? 0,
      depth: config.depth ?? DEFAULT_OPENING_CONFIG.depth ?? 0.15,
      rotationY: config.rotationY ?? DEFAULT_OPENING_CONFIG.rotationY ?? 0,
      frameStyle: config.frameStyle ?? DEFAULT_OPENING_CONFIG.frameStyle ?? 'wooden',
      frameThickness: config.frameThickness ?? DEFAULT_OPENING_CONFIG.frameThickness ?? 0.05,
      hasGlass: config.hasGlass ?? DEFAULT_OPENING_CONFIG.hasGlass ?? false,
      glassOpacity: config.glassOpacity ?? DEFAULT_OPENING_CONFIG.glassOpacity ?? 0.3,
      isInterior: config.isInterior ?? DEFAULT_OPENING_CONFIG.isInterior ?? true,
      roomA: config.roomA ?? DEFAULT_OPENING_CONFIG.roomA ?? '',
      roomB: config.roomB ?? DEFAULT_OPENING_CONFIG.roomB ?? '',
      id: config.id ?? DEFAULT_OPENING_CONFIG.id ?? '',
    };

    // Create the cutter box
    const cutterGeometry = this.createOpeningCutter(cfg);
    const cutterWorldGeometry = this.transformCutter(cutterGeometry, cfg);

    // Perform CSG subtraction
    let resultGeometry: THREE.BufferGeometry;
    if (this.config.useCSG) {
      try {
        resultGeometry = this.csg.subtract(wallGeometry, cutterWorldGeometry);
      } catch (err) {
        console.warn('[CSGSolidificationPipeline] CSG subtraction failed, using fallback:', err);
        resultGeometry = wallGeometry;
      }
    } else {
      // Fallback: return unmodified wall geometry
      resultGeometry = wallGeometry;
    }

    // Create frame and glass geometry
    const frameMesh = this.createOpeningFrame(cfg);
    const leafMesh = openingType === OpeningType.DOOR ? this.createDoorLeaf(cfg) : null;
    const glassMesh = openingType === OpeningType.WINDOW && cfg.hasGlass
      ? this.createGlassPane(cfg)
      : null;

    return {
      wallGeometry: resultGeometry,
      cutterGeometry: cutterWorldGeometry,
      frameMesh,
      leafMesh,
      glassMesh,
      config: cfg,
    };
  }

  // ── Frame Geometry ─────────────────────────────────────────────────

  /**
   * Add a door frame around an opening.
   *
   * Creates a frame geometry that wraps around the door opening,
   * with the specified style (wooden, metal) and thickness.
   *
   * @param opening  - The opening configuration
   * @param doorConfig - Additional door frame parameters
   * @returns Door frame mesh, or null if frameStyle is 'none'
   */
  addDoorFrame(
    opening: OpeningConfig,
    doorConfig?: { frameThickness?: number; frameStyle?: 'wooden' | 'metal' | 'none' },
  ): THREE.Mesh | null {
    const cfg = { ...opening, ...doorConfig };
    if (cfg.frameStyle === 'none') return null;
    return this.createOpeningFrame(cfg);
  }

  /**
   * Add a window frame around an opening.
   *
   * Creates a window frame geometry with mullions and a sill,
   * matching the specified style and thickness.
   *
   * @param opening    - The opening configuration
   * @param windowConfig - Additional window frame parameters
   * @returns Window frame mesh, or null if frameStyle is 'none'
   */
  addWindowFrame(
    opening: OpeningConfig,
    windowConfig?: { frameThickness?: number; frameStyle?: 'wooden' | 'metal' | 'none'; mullionCount?: number },
  ): THREE.Mesh | null {
    const cfg = { ...opening, ...windowConfig };
    if (cfg.frameStyle === 'none') return null;

    const mullionCount = windowConfig?.mullionCount ?? 2;
    return this.createWindowFrameWithMullions(cfg, mullionCount);
  }

  /**
   * Add staircase geometry within a room.
   *
   * Generates a complete staircase with treads, risers, and optional
   * handrails. Performs validity checking for headroom, riser height,
   * and tread depth.
   *
   * @param room  - Room metadata (footprint vertices, floorY, ceilingY)
   * @param stairConfig - Staircase configuration parameters
   * @returns THREE.Group containing staircase geometry, or null if invalid
   */
  addStaircase(
    room: {
      footprint: { vertices: THREE.Vector2[] };
      floorY: number;
      ceilingY: number;
    },
    stairConfig?: Partial<StaircaseConfig>,
  ): THREE.Group | null {
    const cfg: StaircaseConfig = {
      treadDepth: stairConfig?.treadDepth ?? DEFAULT_STAIRCASE_CONFIG.treadDepth ?? 0.28,
      riserHeight: stairConfig?.riserHeight ?? DEFAULT_STAIRCASE_CONFIG.riserHeight ?? 0.18,
      width: stairConfig?.width ?? DEFAULT_STAIRCASE_CONFIG.width ?? 1.0,
      fromFloorY: room.floorY,
      toFloorY: room.ceilingY,
      minHeadroom: stairConfig?.minHeadroom ?? DEFAULT_STAIRCASE_CONFIG.minHeadroom ?? 2.0,
      minTreadDepth: stairConfig?.minTreadDepth ?? DEFAULT_STAIRCASE_CONFIG.minTreadDepth ?? 0.22,
      maxRiserHeight: stairConfig?.maxRiserHeight ?? DEFAULT_STAIRCASE_CONFIG.maxRiserHeight ?? 0.20,
      position: stairConfig?.position ?? DEFAULT_STAIRCASE_CONFIG.position ?? new THREE.Vector3(),
      rotationY: stairConfig?.rotationY ?? DEFAULT_STAIRCASE_CONFIG.rotationY ?? 0,
      includeHandrails: stairConfig?.includeHandrails ?? DEFAULT_STAIRCASE_CONFIG.includeHandrails ?? true,
      treadColor: stairConfig?.treadColor ?? DEFAULT_STAIRCASE_CONFIG.treadColor ?? 0x8b7355,
      riserColor: stairConfig?.riserColor ?? DEFAULT_STAIRCASE_CONFIG.riserColor ?? 0x6b5335,
    };

    // Validity checks
    const totalRise = cfg.toFloorY - cfg.fromFloorY;
    if (totalRise <= 0) {
      console.warn('[CSGSolidificationPipeline] Invalid staircase: totalRise must be positive');
      return null;
    }

    if (cfg.riserHeight > cfg.maxRiserHeight) {
      console.warn(
        `[CSGSolidificationPipeline] Riser height ${cfg.riserHeight} exceeds max ${cfg.maxRiserHeight}`,
      );
      return null;
    }

    if (cfg.treadDepth < cfg.minTreadDepth) {
      console.warn(
        `[CSGSolidificationPipeline] Tread depth ${cfg.treadDepth} below min ${cfg.minTreadDepth}`,
      );
      return null;
    }

    const headroom = room.ceilingY - room.floorY;
    if (headroom < cfg.minHeadroom) {
      console.warn(`[CSGSolidificationPipeline] Insufficient headroom: ${headroom} < ${cfg.minHeadroom}`);
      return null;
    }

    const stepCount = Math.ceil(totalRise / cfg.riserHeight);
    const actualRiserHeight = totalRise / stepCount;

    const staircaseGroup = new THREE.Group();
    staircaseGroup.name = 'CSGStaircase';
    staircaseGroup.position.copy(cfg.position);
    staircaseGroup.rotation.y = cfg.rotationY;

    const treadMaterial = new THREE.MeshStandardMaterial({
      color: cfg.treadColor,
      roughness: 0.7,
      metalness: 0.1,
    });
    const riserMaterial = new THREE.MeshStandardMaterial({
      color: cfg.riserColor,
      roughness: 0.8,
      metalness: 0.05,
    });

    for (let i = 0; i < stepCount; i++) {
      // Tread
      const treadGeom = new THREE.BoxGeometry(cfg.width, 0.03, cfg.treadDepth);
      const treadMesh = new THREE.Mesh(treadGeom, treadMaterial);
      treadMesh.position.set(
        0,
        cfg.fromFloorY + (i + 1) * actualRiserHeight,
        i * cfg.treadDepth + cfg.treadDepth / 2,
      );
      treadMesh.castShadow = true;
      staircaseGroup.add(treadMesh);

      // Riser
      const riserGeom = new THREE.BoxGeometry(cfg.width, actualRiserHeight, 0.02);
      const riserMesh = new THREE.Mesh(riserGeom, riserMaterial);
      riserMesh.position.set(
        0,
        cfg.fromFloorY + (i + 0.5) * actualRiserHeight,
        (i + 1) * cfg.treadDepth,
      );
      staircaseGroup.add(riserMesh);
    }

    // Handrails
    if (cfg.includeHandrails) {
      this.addHandrailGeometry(
        staircaseGroup, stepCount, actualRiserHeight, cfg.treadDepth, cfg.width, cfg.fromFloorY,
      );
    }

    return staircaseGroup;
  }

  // ── Private Helpers ────────────────────────────────────────────────

  /**
   * Create a box-shaped cutter for an opening.
   *
   * The cutter is a simple box that, when subtracted from the wall,
   * creates the opening. It extends slightly beyond the wall thickness
   * to ensure a clean cut.
   */
  private createOpeningCutter(config: OpeningConfig): THREE.BufferGeometry {
    // Add small margin to ensure clean cut through wall
    const margin = 0.02;
    const depth = config.depth + margin * 2;
    const geometry = new THREE.BoxGeometry(config.width, config.height, depth);
    return geometry;
  }

  /**
   * Apply position and rotation transforms to the cutter geometry.
   */
  private transformCutter(
    cutterGeometry: THREE.BufferGeometry,
    config: OpeningConfig,
  ): THREE.BufferGeometry {
    const matrix = new THREE.Matrix4();
    const position = config.position;
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      config.rotationY,
    );
    matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));

    const transformed = cutterGeometry.clone();
    transformed.applyMatrix4(matrix);
    return transformed;
  }

  /**
   * Create a door/window frame mesh around an opening.
   *
   * The frame is a slightly larger box than the opening,
   * positioned to wrap around the opening edges.
   */
  private createOpeningFrame(config: OpeningConfig): THREE.Mesh | null {
    if (config.frameStyle === 'none') return null;

    const ft = config.frameThickness;
    const frameDepth = config.depth + 0.02;

    // Frame is a box slightly larger than the opening with a hole
    // We approximate it as four frame pieces forming a rectangle
    const frameGroup = new THREE.Group();

    const isWooden = config.frameStyle === 'wooden';
    const material = new THREE.MeshStandardMaterial({
      color: isWooden ? 0x5c4033 : 0xb0b0b0,
      roughness: isWooden ? 0.6 : 0.3,
      metalness: isWooden ? 0.1 : 0.5,
    });

    // Top bar
    const topBar = new THREE.Mesh(
      new THREE.BoxGeometry(config.width + ft * 2, ft, frameDepth),
      material,
    );
    topBar.position.y = config.height / 2 + ft / 2;
    frameGroup.add(topBar);

    // Left bar
    const leftBar = new THREE.Mesh(
      new THREE.BoxGeometry(ft, config.height, frameDepth),
      material,
    );
    leftBar.position.x = -(config.width / 2 + ft / 2);
    frameGroup.add(leftBar);

    // Right bar
    const rightBar = new THREE.Mesh(
      new THREE.BoxGeometry(ft, config.height, frameDepth),
      material,
    );
    rightBar.position.x = config.width / 2 + ft / 2;
    frameGroup.add(rightBar);

    // For doors: add threshold
    if (config.type === OpeningType.DOOR) {
      const threshold = new THREE.Mesh(
        new THREE.BoxGeometry(config.width + ft * 2, ft * 0.5, frameDepth),
        material,
      );
      threshold.position.y = -(config.height / 2 + ft * 0.25);
      frameGroup.add(threshold);
    }

    // For windows: add sill
    if (config.type === OpeningType.WINDOW) {
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(config.width + ft * 4, ft, frameDepth + 0.04),
        material,
      );
      sill.position.y = -(config.height / 2 + ft / 2);
      sill.position.z = 0.02;
      frameGroup.add(sill);
    }

    // Apply transform
    frameGroup.position.copy(config.position);
    frameGroup.rotation.y = config.rotationY;

    // Merge frame pieces into a single mesh
    // For simplicity, return the group's first mesh as a representation
    // (In production, you'd merge all frame pieces into one geometry)
    const mergedFrame = this.mergeGroupToMesh(frameGroup, material);
    mergedFrame.name = `Frame_${config.id}`;
    mergedFrame.castShadow = true;

    return mergedFrame;
  }

  /**
   * Create a window frame with mullions (vertical dividers).
   */
  private createWindowFrameWithMullions(
    config: OpeningConfig,
    mullionCount: number,
  ): THREE.Mesh {
    const ft = config.frameThickness;
    const frameDepth = config.depth + 0.02;

    const material = new THREE.MeshStandardMaterial({
      color: config.frameStyle === 'wooden' ? 0x5c4033 : 0xb0b0b0,
      roughness: config.frameStyle === 'wooden' ? 0.6 : 0.3,
      metalness: config.frameStyle === 'wooden' ? 0.1 : 0.5,
    });

    const group = new THREE.Group();

    // Outer frame bars
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(config.width + ft * 2, ft, frameDepth), material);
    topBar.position.y = config.height / 2 + ft / 2;
    group.add(topBar);

    const bottomBar = new THREE.Mesh(new THREE.BoxGeometry(config.width + ft * 2, ft, frameDepth), material);
    bottomBar.position.y = -(config.height / 2 + ft / 2);
    group.add(bottomBar);

    const leftBar = new THREE.Mesh(new THREE.BoxGeometry(ft, config.height + ft * 2, frameDepth), material);
    leftBar.position.x = -(config.width / 2 + ft / 2);
    group.add(leftBar);

    const rightBar = new THREE.Mesh(new THREE.BoxGeometry(ft, config.height + ft * 2, frameDepth), material);
    rightBar.position.x = config.width / 2 + ft / 2;
    group.add(rightBar);

    // Mullions (vertical dividers)
    const mullionWidth = ft * 0.6;
    for (let i = 1; i < mullionCount; i++) {
      const x = -config.width / 2 + (config.width * i) / mullionCount;
      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(mullionWidth, config.height, frameDepth),
        material,
      );
      mullion.position.x = x;
      group.add(mullion);
    }

    // Sill
    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(config.width + ft * 4, ft * 1.5, frameDepth + 0.06),
      material,
    );
    sill.position.y = -(config.height / 2 + ft * 0.75);
    sill.position.z = 0.03;
    group.add(sill);

    // Apply transform
    group.position.copy(config.position);
    group.rotation.y = config.rotationY;

    const merged = this.mergeGroupToMesh(group, material);
    merged.name = `WindowFrame_${config.id}`;
    merged.castShadow = true;
    return merged;
  }

  /**
   * Create a door leaf (the actual door panel).
   */
  private createDoorLeaf(config: OpeningConfig): THREE.Mesh | null {
    if (config.type !== OpeningType.DOOR) return null;

    const leafWidth = config.width - 0.02;
    const leafHeight = config.height - 0.02;
    const leafDepth = 0.04;

    const material = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      roughness: 0.5,
      metalness: 0.05,
    });

    const geometry = new THREE.BoxGeometry(leafWidth, leafHeight, leafDepth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(config.position);
    mesh.rotation.y = config.rotationY;
    mesh.castShadow = true;
    mesh.name = `DoorLeaf_${config.id}`;

    return mesh;
  }

  /**
   * Create a glass pane for a window opening.
   */
  private createGlassPane(config: OpeningConfig): THREE.Mesh | null {
    if (!config.hasGlass) return null;

    const glassWidth = config.width - config.frameThickness * 2;
    const glassHeight = config.height - config.frameThickness * 2;

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xcce5ff,
      transparent: true,
      opacity: config.glassOpacity,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.9,
      ior: 1.5,
    });

    const geometry = new THREE.PlaneGeometry(glassWidth, glassHeight);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(config.position);
    mesh.rotation.y = config.rotationY;
    mesh.name = `GlassPane_${config.id}`;

    return mesh;
  }

  /**
   * Extrude a 2D polygon into 3D wall geometry with thickness.
   *
   * Each edge of the polygon is extruded into a thick wall segment
   * (outer face, inner face, top, bottom, left cap, right cap).
   */
  private extrudeWallFromPolygon(
    vertices: THREE.Vector2[],
    floorY: number,
    ceilingY: number,
    thickness: number,
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let offset = 0;
    const n = vertices.length;
    const wallHeight = ceilingY - floorY;

    for (let i = 0; i < n; i++) {
      const curr = vertices[i];
      const next = vertices[(i + 1) % n];

      const edgeDir = new THREE.Vector2().subVectors(next, curr);
      const edgeLen = edgeDir.length();
      if (edgeLen < 0.01) continue;
      edgeDir.normalize();

      const inwardNormal = new THREE.Vector2(-edgeDir.y, edgeDir.x);
      const offsetVec = inwardNormal.clone().multiplyScalar(thickness);

      // Outer face corners
      const c0 = [curr.x, floorY, curr.y];
      const c1 = [next.x, floorY, next.y];
      const c2 = [next.x, ceilingY, next.y];
      const c3 = [curr.x, ceilingY, curr.y];

      // Inner face corners
      const i0 = [curr.x + offsetVec.x, floorY, curr.y + offsetVec.y];
      const i1 = [next.x + offsetVec.x, floorY, next.y + offsetVec.y];
      const i2 = [next.x + offsetVec.x, ceilingY, next.y + offsetVec.y];
      const i3 = [curr.x + offsetVec.x, ceilingY, curr.y + offsetVec.y];

      // Outer face
      this.pushQuad(positions, normals, uvs, indices, c0, c1, c2, c3, [0, 0, -1], offset);
      offset += 4;

      // Inner face
      this.pushQuad(positions, normals, uvs, indices, i1, i0, i3, i2, [0, 0, 1], offset);
      offset += 4;

      // Top
      this.pushQuad(positions, normals, uvs, indices, c3, c2, i2, i3, [0, 1, 0], offset);
      offset += 4;

      // Bottom
      this.pushQuad(positions, normals, uvs, indices, c0, i0, i1, c1, [0, -1, 0], offset);
      offset += 4;

      // Left cap
      this.pushQuad(positions, normals, uvs, indices, c0, c3, i3, i0, [-edgeDir.y, 0, edgeDir.x], offset);
      offset += 4;

      // Right cap
      this.pushQuad(positions, normals, uvs, indices, c1, i1, i2, c2, [edgeDir.y, 0, -edgeDir.x], offset);
      offset += 4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Push a quad (two triangles) into the buffer arrays.
   */
  private pushQuad(
    pos: number[], norms: number[], uvArr: number[], idx: number[],
    v0: number[], v1: number[], v2: number[], v3: number[],
    n: number[], offset: number,
  ): void {
    const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
    const nn = len > 0 ? [n[0] / len, n[1] / len, n[2] / len] : [0, 1, 0];

    pos.push(...v0, ...v1, ...v2, ...v3);
    for (let i = 0; i < 4; i++) norms.push(...nn);
    uvArr.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  /**
   * Create a floor mesh from polygon vertices.
   */
  private createFloorMesh(vertices: THREE.Vector2[], floorY: number): THREE.Mesh | null {
    if (vertices.length < 3) return null;

    const shape = new THREE.Shape();
    shape.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      shape.lineTo(vertices[i].x, vertices[i].y);
    }
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, floorY + 0.001, 0);

    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.7,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.name = 'Floor';
    return mesh;
  }

  /**
   * Create a ceiling mesh from polygon vertices.
   */
  private createCeilingMesh(vertices: THREE.Vector2[], ceilingY: number): THREE.Mesh | null {
    if (vertices.length < 3) return null;

    const shape = new THREE.Shape();
    shape.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      shape.lineTo(vertices[i].x, vertices[i].y);
    }
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, ceilingY - 0.001, 0);

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Ceiling';
    return mesh;
  }

  /**
   * Find the center point and rotation of the shared wall between two room polygons.
   */
  private findSharedWallCenter(
    vertsA: THREE.Vector2[],
    vertsB: THREE.Vector2[],
  ): { position: THREE.Vector3; rotationY: number } | null {
    const tolerance = 0.15;
    const n1 = vertsA.length;
    const n2 = vertsB.length;

    for (let i = 0; i < n1; i++) {
      const a1 = vertsA[i];
      const a2 = vertsA[(i + 1) % n1];

      for (let j = 0; j < n2; j++) {
        const b1 = vertsB[j];
        const b2 = vertsB[(j + 1) % n2];

        const midA = new THREE.Vector2((a1.x + a2.x) / 2, (a1.y + a2.y) / 2);
        const midB = new THREE.Vector2((b1.x + b2.x) / 2, (b1.y + b2.y) / 2);
        const dist = midA.distanceTo(midB);

        if (dist < tolerance * 5) {
          const centerX = (midA.x + midB.x) / 2;
          const centerZ = (midA.y + midB.y) / 2;
          const edgeDir = new THREE.Vector2().subVectors(a2, a1).normalize();
          const rotationY = Math.atan2(edgeDir.y, edgeDir.x);

          return {
            position: new THREE.Vector3(
              centerX,
              this.config.defaultFloorY + this.config.doorHeight / 2,
              centerZ,
            ),
            rotationY,
          };
        }
      }
    }

    return null;
  }

  /**
   * Merge a THREE.Group's children into a single mesh.
   *
   * Combines all child meshes' geometries (applying their local
   * transforms) into one BufferGeometry.
   */
  private mergeGroupToMesh(group: THREE.Group, material: THREE.Material): THREE.Mesh {
    const geometries: THREE.BufferGeometry[] = [];

    group.updateMatrixWorld(true);

    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geom = child.geometry.clone();
        geom.applyMatrix4(child.matrixWorld);
        geometries.push(geom);
      }
    });

    if (geometries.length === 0) {
      return new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), material);
    }

    // Manual merge
    const mergedPositions: number[] = [];
    const mergedNormals: number[] = [];
    const mergedUVs: number[] = [];
    const mergedIndices: number[] = [];
    let vertexOffset = 0;

    for (const geom of geometries) {
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      const normalAttr = geom.getAttribute('normal') as THREE.BufferAttribute | null;
      const uvAttr = geom.getAttribute('uv') as THREE.BufferAttribute | null;
      const indexAttr = geom.getIndex();

      for (let i = 0; i < posAttr.count; i++) {
        mergedPositions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        if (normalAttr) {
          mergedNormals.push(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
        } else {
          mergedNormals.push(0, 1, 0);
        }
        if (uvAttr) {
          mergedUVs.push(uvAttr.getX(i), uvAttr.getY(i));
        } else {
          mergedUVs.push(0, 0);
        }
      }

      if (indexAttr) {
        const indexArray = indexAttr.array as Uint16Array | Uint32Array;
        for (let i = 0; i < indexAttr.count; i++) {
          mergedIndices.push(indexArray[i] + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          mergedIndices.push(i + vertexOffset);
        }
      }

      vertexOffset += posAttr.count;
      geom.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(mergedNormals, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(mergedUVs, 2));
    merged.setIndex(mergedIndices);
    merged.computeVertexNormals();

    return new THREE.Mesh(merged, material);
  }

  /**
   * Add handrail geometry to a staircase group.
   */
  private addHandrailGeometry(
    group: THREE.Group,
    stepCount: number,
    riserHeight: number,
    treadDepth: number,
    stairWidth: number,
    fromFloor: number,
  ): void {
    const handrailHeight = 0.9;
    const handrailMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.6,
      metalness: 0.2,
    });

    // Posts
    const postInterval = Math.max(1, Math.floor(stepCount / 5));
    for (let i = 0; i <= stepCount; i += postInterval) {
      const postGeom = new THREE.CylinderGeometry(0.02, 0.02, handrailHeight, 8);
      const postMesh = new THREE.Mesh(postGeom, handrailMaterial);
      postMesh.position.set(
        -stairWidth / 2 + 0.05,
        fromFloor + i * riserHeight + handrailHeight / 2,
        i * treadDepth,
      );
      group.add(postMesh);
    }

    // Top rail
    const totalLength = stepCount * treadDepth;
    const totalRise = stepCount * riserHeight;
    const railLength = Math.sqrt(totalLength * totalLength + totalRise * totalRise);
    const railAngle = Math.atan2(totalRise, totalLength);

    const railGeom = new THREE.CylinderGeometry(0.015, 0.015, railLength, 8);
    const railMesh = new THREE.Mesh(railGeom, handrailMaterial);
    railMesh.position.set(
      -stairWidth / 2 + 0.05,
      fromFloor + totalRise / 2 + handrailHeight,
      totalLength / 2,
    );
    railMesh.rotation.x = -railAngle;
    group.add(railMesh);
  }
}
