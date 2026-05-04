/**
 * BVH-Accelerated Triangle Mesh Collider
 *
 * Uses three-mesh-bvh for fast spatial queries on triangle mesh geometry.
 * Provides ray intersection, closest point, and support function for
 * integration with the physics system's GJK collision detection.
 *
 * When three-mesh-bvh is available, it monkey-patches THREE.Mesh.prototype.raycast
 * so that standard THREE.Raycaster calls automatically use BVH acceleration.
 * We also attempt to directly instantiate MeshBVH for explicit closest-point queries.
 *
 * @module TrimeshCollider
 */

import * as THREE from 'three';
import { computeConvexHullFromGeometry, convexHullSupport, QuickhullResult } from './Quickhull';

// Attempt to import MeshBVH from three-mesh-bvh.
// If unavailable, we fall back to standard Three.js raycasting.
let MeshBVHClass: any = null;
let generateMeshBVH: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bvhModule = require('three-mesh-bvh');
  MeshBVHClass = bvhModule.MeshBVH ?? null;
  generateMeshBVH = bvhModule.generateMeshBVH ?? null;
} catch {
  // three-mesh-bvh not available — fallback to standard Three.js APIs
}

// ============================================================================
// Result Types
// ============================================================================

/** Result of a closest-point-on-mesh query. */
export interface TrimeshCollisionResult {
  /** Closest point on the mesh surface. */
  point: THREE.Vector3;
  /** Surface normal at the closest point. */
  normal: THREE.Vector3;
  /** Distance from query point to surface. */
  distance: number;
  /** Triangle index of the closest face. */
  faceIndex: number;
}

/** Result of a ray-mesh intersection query. */
export interface TrimeshRayResult {
  /** Intersection point in world space. */
  point: THREE.Vector3;
  /** Surface normal at intersection. */
  normal: THREE.Vector3;
  /** Distance along the ray from origin. */
  distance: number;
  /** Triangle index hit. */
  faceIndex: number;
}

// ============================================================================
// TrimeshCollider
// ============================================================================

/**
 * BVH-accelerated triangle mesh collider.
 *
 * Wraps a THREE.Mesh and provides spatial queries needed by the physics
 * pipeline: ray casting, closest-point queries, containment tests, and a
 * GJK-compatible support function (via optional convex hull).
 *
 * Construction clones the geometry so that BVH generation does not mutate
 * the caller's mesh. The BVH is built once at construction time; call
 * `updateTransform()` when the mesh's world matrix changes.
 */
export class TrimeshCollider {
  // ---- Core data --------------------------------------------------------

  private mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;

  /**
   * The BVH instance from three-mesh-bvh, or null if the library is
   * unavailable or the geometry is degenerate.
   */
  private bvh: any;

  /** Cached position attribute for vertex iteration. */
  private positionAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

  /** Normal attribute (may be null if geometry has no normals). */
  private normalAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;

  /** Index attribute (may be null for non-indexed geometry). */
  private indexAttribute: THREE.BufferAttribute | null;

  // ---- Convex hull for GJK support --------------------------------------

  /** Cached convex hull result from Quickhull. */
  private hullResult: QuickhullResult | null = null;

  /** Cached hull vertices (convenience reference from hullResult). */
  private hullVertices: THREE.Vector3[] | null = null;

  // ---- Reusable temporaries (avoid per-frame GC) ------------------------

  private readonly _raycaster: THREE.Raycaster;
  private readonly _ray: THREE.Ray;
  private readonly _worldMatrix: THREE.Matrix4;
  private readonly _inverseMatrix: THREE.Matrix4;
  private readonly _aabb: THREE.Box3;
  private readonly _v0: THREE.Vector3;
  private readonly _v1: THREE.Vector3;
  private readonly _v2: THREE.Vector3;
  private readonly _triNormal: THREE.Vector3;
  private readonly _edge1: THREE.Vector3;
  private readonly _edge2: THREE.Vector3;

  // ========================================================================
  // Construction
  // ========================================================================

  constructor(mesh: THREE.Mesh) {
    this.mesh = mesh;

    // Clone geometry so we don't mutate the original mesh data
    this.geometry = (mesh.geometry as THREE.BufferGeometry).clone();

    // Cache attribute references
    const posAttr = this.geometry.getAttribute('position');
    if (!posAttr) {
      throw new Error('TrimeshCollider: geometry has no position attribute');
    }
    this.positionAttribute = posAttr;
    this.normalAttribute = this.geometry.getAttribute('normal') ?? null;
    this.indexAttribute = this.geometry.index ?? null;

    // Build the BVH (if three-mesh-bvh is available)
    this.bvh = null;
    this._buildBVH();

    // Initialize temporaries
    this._raycaster = new THREE.Raycaster();
    this._ray = new THREE.Ray();
    this._worldMatrix = new THREE.Matrix4();
    this._inverseMatrix = new THREE.Matrix4();
    this._aabb = new THREE.Box3();
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._triNormal = new THREE.Vector3();
    this._edge1 = new THREE.Vector3();
    this._edge2 = new THREE.Vector3();

    // Compute bounding box
    this.geometry.computeBoundingBox();
  }

  // ========================================================================
  // BVH Construction
  // ========================================================================

  /**
   * Attempt to build a BVH from the cloned geometry using three-mesh-bvh.
   * If the library is not available or construction fails, this is a no-op
   * and we fall back to standard Three.js raycasting (which is still
   * BVH-accelerated if the global monkey-patch was applied on import).
   */
  private _buildBVH(): void {
    if (MeshBVHClass === null && generateMeshBVH === null) return;

    try {
      if (typeof generateMeshBVH === 'function') {
        // three-mesh-bvh >= 0.7 style
        this.bvh = generateMeshBVH(this.geometry);
      } else if (typeof MeshBVHClass === 'function') {
        // older three-mesh-bvh style
        this.bvh = new MeshBVHClass(this.geometry);
      }

      // Assign the BVH back onto the geometry so that Mesh.raycast uses it
      if (this.bvh !== null) {
        (this.geometry as any).boundsTree = this.bvh;
      }
    } catch (err) {
      // BVH construction can fail on degenerate geometry — silently degrade
      console.warn('TrimeshCollider: BVH construction failed, falling back to brute-force:', err);
      this.bvh = null;
    }
  }

  // ========================================================================
  // Closest Point
  // ========================================================================

  /**
   * Find the closest point on the mesh surface to a given point.
   *
   * If three-mesh-bvh provides `closestPointToPoint` on the BVH instance,
   * this runs in O(log n). Otherwise we fall back to iterating all triangles
   * which is O(n) but still correct.
   *
   * @param point Query point in local space of the mesh.
   * @param maxDistance Optional maximum search distance (early-out).
   * @returns Collision result or null if no point is within maxDistance.
   */
  closestPointToPoint(
    point: THREE.Vector3,
    maxDistance?: number
  ): TrimeshCollisionResult | null {
    // Early rejection via bounding sphere
    if (!this.geometry.boundingSphere) {
      this.geometry.computeBoundingSphere();
    }
    const bsphere = this.geometry.boundingSphere!;
    if (bsphere) {
      const distToCenter = point.distanceTo(bsphere.center);
      if (maxDistance !== undefined && distToCenter - bsphere.radius > maxDistance) {
        return null;
      }
    }

    // Try BVH-accelerated query first
    if (this.bvh !== null && typeof this.bvh.closestPointToPoint === 'function') {
      return this._closestPointBVH(point, maxDistance);
    }

    // Fallback: brute-force triangle iteration
    return this._closestPointBruteForce(point, maxDistance);
  }

  /**
   * BVH-accelerated closest point using three-mesh-bvh's API.
   */
  private _closestPointBVH(
    point: THREE.Vector3,
    maxDistance?: number
  ): TrimeshCollisionResult | null {
    const target: any = {
      point: new THREE.Vector3(),
      distance: Infinity,
      faceIndex: -1,
    };

    // three-mesh-bvh >= 0.5 signature:
    // bvh.closestPointToPoint(point, target)  or
    // bvh.closestPointToPoint(point, { point, distance, faceIndex })
    try {
      this.bvh.closestPointToPoint(point, target);
    } catch {
      return this._closestPointBruteForce(point, maxDistance);
    }

    if (target.faceIndex < 0 || target.distance === Infinity) {
      return null;
    }

    if (maxDistance !== undefined && target.distance > maxDistance) {
      return null;
    }

    const normal = this._getFaceNormal(target.faceIndex);

    return {
      point: target.point.clone(),
      normal,
      distance: target.distance,
      faceIndex: target.faceIndex,
    };
  }

  /**
   * Brute-force O(n) closest point: iterate all triangles, compute the
   * closest point on each, and keep the best result.
   */
  private _closestPointBruteForce(
    point: THREE.Vector3,
    maxDistance?: number
  ): TrimeshCollisionResult | null {
    let bestDist = maxDistance ?? Infinity;
    let bestPoint: THREE.Vector3 | null = null;
    let bestFaceIndex = -1;

    const triangleCount = this.getTriangleCount();
    const tempClosest = new THREE.Vector3();

    for (let i = 0; i < triangleCount; i++) {
      this._getTriangleVertices(i, this._v0, this._v1, this._v2);

      // Closest point on triangle to the query point
      closestPointOnTriangle(point, this._v0, this._v1, this._v2, tempClosest);

      const distSq = point.distanceToSquared(tempClosest);

      if (distSq < bestDist * bestDist) {
        bestDist = Math.sqrt(distSq);
        bestPoint = tempClosest.clone();
        bestFaceIndex = i;

        // Early exit if we find an exact or very close hit
        if (bestDist < 1e-10) break;
      }
    }

    if (bestPoint === null) return null;

    const normal = this._getFaceNormal(bestFaceIndex);

    return {
      point: bestPoint,
      normal,
      distance: bestDist,
      faceIndex: bestFaceIndex,
    };
  }

  // ========================================================================
  // Ray Intersection
  // ========================================================================

  /**
   * Cast a ray against the mesh and find the closest intersection.
   *
   * When three-mesh-bvh is installed it monkey-patches Mesh.raycast, so
   * THREE.Raycaster automatically benefits from BVH acceleration.
   *
   * @param origin Ray origin in world space.
   * @param direction Ray direction (does not need to be normalized).
   * @param maxDistance Maximum ray travel distance (default Infinity).
   * @returns Intersection result or null if no hit.
   */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance?: number
  ): TrimeshRayResult | null {
    // Normalize direction for raycaster
    const dir = direction.clone().normalize();
    this._ray.set(origin, dir);

    this._raycaster.ray.copy(this._ray);
    this._raycaster.near = 0;
    this._raycaster.far = maxDistance ?? Infinity;
    this._raycaster.firstHitOnly = true;

    // Use a temporary mesh with the cloned geometry for raycasting.
    // This ensures the BVH boundsTree is available on the geometry.
    const tempMesh = this.mesh;
    const origGeometry = tempMesh.geometry;
    tempMesh.geometry = this.geometry;

    const intersections: THREE.Intersection[] = [];
    tempMesh.raycast(this._raycaster, intersections);

    // Restore original geometry
    tempMesh.geometry = origGeometry;

    if (intersections.length === 0) return null;

    const hit = intersections[0];
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(tempMesh.matrixWorld)
      : new THREE.Vector3(0, 1, 0);

    return {
      point: hit.point.clone(),
      normal,
      distance: hit.distance,
      faceIndex: hit.faceIndex ?? 0,
    };
  }

  // ========================================================================
  // Containment Test
  // ========================================================================

  /**
   * Check if a point is inside the mesh (approximate, using ray casting).
   *
   * Casts 6 rays (±X, ±Y, ±Z) from the point and uses majority vote.
   * A point is considered inside if the majority of rays indicate it is
   * enclosed (odd intersection count).
   *
   * This method works best for closed (watertight) meshes. For open meshes
   * the result is unreliable.
   *
   * @param point Query point in local space of the mesh.
   * @returns True if the point is likely inside the mesh.
   */
  containsPoint(point: THREE.Vector3): boolean {
    // Quick bounding-box rejection
    if (!this.geometry.boundingBox) {
      this.geometry.computeBoundingBox();
    }
    const bbox = this.geometry.boundingBox!;
    if (!bbox.containsPoint(point)) {
      return false;
    }

    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];

    let insideVotes = 0;

    for (const dir of directions) {
      if (this._countIntersections(point, dir) % 2 === 1) {
        insideVotes++;
      }
    }

    // Majority vote: if 4 or more of 6 rays say inside, we consider it inside
    return insideVotes >= 4;
  }

  /**
   * Count the number of intersections along a ray from the given point.
   */
  private _countIntersections(origin: THREE.Vector3, direction: THREE.Vector3): number {
    this._raycaster.ray.set(origin, direction);
    this._raycaster.near = 0;
    this._raycaster.far = Infinity;
    this._raycaster.firstHitOnly = false;

    const tempMesh = this.mesh;
    const origGeometry = tempMesh.geometry;
    tempMesh.geometry = this.geometry;

    const intersections: THREE.Intersection[] = [];
    tempMesh.raycast(this._raycaster, intersections);

    tempMesh.geometry = origGeometry;

    return intersections.length;
  }

  // ========================================================================
  // GJK Support Function
  // ========================================================================

  /**
   * GJK support function: find the vertex furthest along a direction.
   *
   * If a convex hull has been computed (via `computeConvexHull()`), this
   * uses the hull vertices for O(h) where h << n. Otherwise, it iterates
   * all mesh vertices in O(n).
   *
   * The returned point is in the mesh's local space.
   *
   * @param direction Search direction (does not need to be normalized).
   * @returns The vertex furthest along the given direction.
   */
  support(direction: THREE.Vector3): THREE.Vector3 {
    // Fast path: use cached convex hull
    if (this.hullVertices !== null && this.hullVertices.length > 0) {
      return convexHullSupport(direction, this.hullVertices);
    }

    // Slow path: iterate all position vertices
    return this._vertexSupport(direction);
  }

  /**
   * Brute-force vertex support: iterate all vertices and find the one
   * with the maximum dot product along the given direction.
   */
  private _vertexSupport(direction: THREE.Vector3): THREE.Vector3 {
    const posAttr = this.positionAttribute;
    const count = posAttr.count;

    if (count === 0) return new THREE.Vector3();

    let bestIdx = 0;
    let bestDot = direction.dot(
      new THREE.Vector3(posAttr.getX(0), posAttr.getY(0), posAttr.getZ(0))
    );

    const tempV = new THREE.Vector3();

    for (let i = 1; i < count; i++) {
      tempV.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      const d = direction.dot(tempV);
      if (d > bestDot) {
        bestDot = d;
        bestIdx = i;
      }
    }

    return new THREE.Vector3(
      posAttr.getX(bestIdx),
      posAttr.getY(bestIdx),
      posAttr.getZ(bestIdx)
    );
  }

  // ========================================================================
  // Convex Hull
  // ========================================================================

  /**
   * Compute a convex hull of the mesh vertices for faster support queries.
   * Uses the Quickhull algorithm from ./Quickhull.ts.
   *
   * After calling this method, `support()` will use the hull vertices
   * instead of iterating all mesh vertices. This is beneficial when the
   * support function is called many times (e.g., during GJK iterations).
   */
  computeConvexHull(): void {
    this.hullResult = computeConvexHullFromGeometry(this.geometry);
    this.hullVertices = this.hullResult.vertices.length > 0
      ? this.hullResult.vertices
      : null;
  }

  // ========================================================================
  // AABB
  // ========================================================================

  /**
   * Get the AABB of the mesh in world space.
   *
   * Applies the mesh's current world matrix to the geometry's local AABB.
   */
  getAABB(): THREE.Box3 {
    if (!this.geometry.boundingBox) {
      this.geometry.computeBoundingBox();
    }

    this.mesh.updateWorldMatrix(true, false);
    this._aabb.copy(this.geometry.boundingBox!);
    this._aabb.applyMatrix4(this.mesh.matrixWorld);

    return this._aabb.clone();
  }

  // ========================================================================
  // Triangle Count
  // ========================================================================

  /**
   * Get the total number of triangles in the mesh.
   */
  getTriangleCount(): number {
    if (this.indexAttribute !== null) {
      return this.indexAttribute.count / 3;
    }
    return this.positionAttribute.count / 3;
  }

  // ========================================================================
  // Transform Update
  // ========================================================================

  /**
   * Update internal state after the mesh's transformation changes.
   *
   * This does NOT rebuild the BVH (that is expensive and rarely needed
   * for static terrain). It only recomputes the bounding box and
   * bounding sphere so that early-rejection tests remain accurate.
   *
   * For animated/skinned meshes that change vertex positions, you would
   * need to rebuild the BVH — but that is beyond the scope of this
   * collider which targets static terrain and level geometry.
   */
  updateTransform(): void {
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();

    // Invalidate hull if the geometry may have changed
    // (For static meshes this is a no-op; for dynamic meshes the caller
    // should call computeConvexHull() again after updating vertices.)
  }

  // ========================================================================
  // Dispose
  // ========================================================================

  /**
   * Dispose of the cloned geometry and BVH resources.
   * The collider should not be used after calling this method.
   */
  dispose(): void {
    this.geometry.dispose();

    // Dispose BVH if it has a dispose method
    if (this.bvh !== null && typeof this.bvh.dispose === 'function') {
      this.bvh.dispose();
    }

    this.bvh = null;
    this.hullResult = null;
    this.hullVertices = null;
  }

  // ========================================================================
  // Internal Helpers
  // ========================================================================

  /**
   * Read the three vertices of a triangle by face index.
   */
  private _getTriangleVertices(
    faceIndex: number,
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3
  ): void {
    const posAttr = this.positionAttribute;

    if (this.indexAttribute !== null) {
      const idx = this.indexAttribute;
      const base = faceIndex * 3;
      const i0 = idx.getX(base);
      const i1 = idx.getX(base + 1);
      const i2 = idx.getX(base + 2);

      a.set(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      b.set(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      c.set(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    } else {
      const base = faceIndex * 3;
      a.set(posAttr.getX(base), posAttr.getY(base), posAttr.getZ(base));
      b.set(posAttr.getX(base + 1), posAttr.getY(base + 1), posAttr.getZ(base + 1));
      c.set(posAttr.getX(base + 2), posAttr.getY(base + 2), posAttr.getZ(base + 2));
    }
  }

  /**
   * Compute the face normal for a triangle by index.
   * If the geometry has a normal attribute, reads from it.
   * Otherwise, computes the geometric normal from the triangle vertices.
   */
  private _getFaceNormal(faceIndex: number): THREE.Vector3 {
    // Try to read from the normal attribute
    if (this.normalAttribute !== null) {
      // For indexed geometry, read vertex normals of the face
      const normAttr = this.normalAttribute;
      let i0: number, i1: number, i2: number;

      if (this.indexAttribute !== null) {
        const base = faceIndex * 3;
        i0 = this.indexAttribute.getX(base);
        i1 = this.indexAttribute.getX(base + 1);
        i2 = this.indexAttribute.getX(base + 2);
      } else {
        const base = faceIndex * 3;
        i0 = base;
        i1 = base + 1;
        i2 = base + 2;
      }

      const n0 = new THREE.Vector3(normAttr.getX(i0), normAttr.getY(i0), normAttr.getZ(i0));
      const n1 = new THREE.Vector3(normAttr.getX(i1), normAttr.getY(i1), normAttr.getZ(i1));
      const n2 = new THREE.Vector3(normAttr.getX(i2), normAttr.getY(i2), normAttr.getZ(i2));

      // Average the vertex normals
      const avg = n0.add(n1).add(n2).divideScalar(3);
      if (avg.lengthSq() > 1e-12) {
        return avg.normalize();
      }
    }

    // Fallback: compute geometric normal from triangle vertices
    this._getTriangleVertices(faceIndex, this._v0, this._v1, this._v2);

    this._edge1.subVectors(this._v1, this._v0);
    this._edge2.subVectors(this._v2, this._v0);
    this._triNormal.crossVectors(this._edge1, this._edge2);

    const len = this._triNormal.length();
    if (len < 1e-12) {
      // Degenerate triangle — return an arbitrary normal
      return new THREE.Vector3(0, 1, 0);
    }

    this._triNormal.divideScalar(len);
    return this._triNormal.clone();
  }
}

// ============================================================================
// Standalone Geometry Utility: Closest Point on Triangle
// ============================================================================

/**
 * Compute the closest point on a triangle to a given query point.
 *
 * Uses the Voronoi region method from Ericson, "Real-Time Collision Detection",
 * Chapter 5. This is exact and handles all edge/vertex cases correctly.
 *
 * @param p Query point.
 * @param a,b,c Triangle vertices.
 * @param out Vector to store the result (modified in place).
 * @returns The `out` vector containing the closest point.
 */
function closestPointOnTriangle(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  out: THREE.Vector3
): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const ap = new THREE.Vector3().subVectors(p, a);

  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) {
    // Closest is vertex a
    return out.copy(a);
  }

  const bp = new THREE.Vector3().subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) {
    // Closest is vertex b
    return out.copy(b);
  }

  // Check edge ab
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return out.copy(a).addScaledVector(ab, v);
  }

  const cp = new THREE.Vector3().subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) {
    // Closest is vertex c
    return out.copy(c);
  }

  // Check edge ac
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return out.copy(a).addScaledVector(ac, w);
  }

  // Check edge bc
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const bc = new THREE.Vector3().subVectors(c, b);
    return out.copy(b).addScaledVector(bc, w);
  }

  // Inside the triangle — barycentric coordinates
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return out.copy(a).addScaledVector(ab, v).addScaledVector(ac, w);
}
