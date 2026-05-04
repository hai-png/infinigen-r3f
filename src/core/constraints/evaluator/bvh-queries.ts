/**
 * BVH Spatial Query Engine
 *
 * Provides precise mesh-based spatial queries using three-mesh-bvh acceleration,
 * replacing AABB bounding-box approximations with actual triangle-level collision
 * detection, distance queries, and raycasting.
 *
 * Ports: Python trimesh library's collision/distance APIs via BVH acceleration.
 *
 * Key methods mirror the original Infinigen Python trimesh_geometry.py API:
 *  - minDistance: Precise minimum distance between two meshes
 *  - anyTouching: Precise collision detection between mesh triangles
 *  - contains: Check if mesh A contains mesh B (raycasting-based)
 *  - hasLineOfSight: Ray-based line-of-sight check between two points
 *  - accessibilityCostCuboidPenetration: Extrude bbox and check penetration
 *  - closestPointOnSurface: Find closest point on mesh surface to a given point
 *  - raycast: Cast a ray against all cached BVHs
 */

import {
  MeshBVH,
  ExtendedTriangle,
  NOT_INTERSECTED,
  INTERSECTED,
  CONTAINED,
  type HitPointInfo,
  type ShapecastCallbacks,
} from 'three-mesh-bvh';
import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/** Result of a closest-point-on-surface query */
export interface ClosestPointResult {
  point: THREE.Vector3;
  distance: number;
  faceIndex: number;
  normal?: THREE.Vector3;
}

/** Result of a raycast query */
export interface RaycastResult {
  point: THREE.Vector3;
  distance: number;
  faceIndex: number;
  normal?: THREE.Vector3;
  object: THREE.Object3D;
}

/** Cached BVH entry including the BVH, world-space geometry, and source object */
interface BVHCacheEntry {
  bvh: MeshBVH;
  worldGeometry: THREE.BufferGeometry;
  sourceObject: THREE.Object3D;
  /** The matrixWorld that was applied when the BVH was built */
  appliedMatrix: THREE.Matrix4;
}

// ============================================================================
// BVHQueryEngine
// ============================================================================

/**
 * Engine for precise BVH-accelerated spatial queries.
 *
 * Maintains a cache of MeshBVH instances keyed by object UUID.
 * Builds BVH from THREE.Mesh geometry on demand (lazy construction).
 * Handles world-space transformations correctly by cloning geometry
 * and applying matrixWorld before building BVH.
 */
export class BVHQueryEngine {
  private cache: Map<string, BVHCacheEntry> = new Map();
  /** All registered objects for global raycasting */
  private registeredObjects: Map<string, THREE.Object3D> = new Map();

  // Reusable temporary objects to reduce GC pressure
  private _tmpRay: THREE.Ray = new THREE.Ray();
  private _tmpVec: THREE.Vector3 = new THREE.Vector3();
  private _tmpVec2: THREE.Vector3 = new THREE.Vector3();
  private _tmpBox: THREE.Box3 = new THREE.Box3();
  private _tmpMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private _tmpHit1: HitPointInfo = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  private _tmpHit2: HitPointInfo = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };

  // ---------------------------------------------------------------------------
  // BVH Construction & Cache Management
  // ---------------------------------------------------------------------------

  /**
   * Get or build the BVH for a given object.
   * If the object is a Mesh with geometry, builds a BVH from its world-space geometry.
   * If the object is a Group or similar, finds the first Mesh descendant.
   *
   * Returns null if no mesh geometry is available (AABB fallback needed).
   */
  getOrBuildBVH(obj: THREE.Object3D): MeshBVH | null {
    const key = obj.uuid;

    const cached = this.cache.get(key);
    if (cached) {
      // Check if the object has moved since last build
      if (this._matrixEquals(obj.matrixWorld, cached.appliedMatrix)) {
        return cached.bvh;
      }
      // Object moved, invalidate and rebuild
      this.invalidateCache(key);
    }

    // Find the mesh (could be the object itself or a descendant)
    const mesh = this._findMesh(obj);
    if (!mesh) {
      return null;
    }

    // Clone geometry and apply world transform
    const worldGeometry = mesh.geometry.clone();
    worldGeometry.applyMatrix4(obj.matrixWorld);

    // Build BVH
    try {
      const bvh = new MeshBVH(worldGeometry, {
        strategy: 2, // SAH strategy for best quality
        maxLeafSize: 10,
        setBoundingBox: true,
      });

      this.cache.set(key, {
        bvh,
        worldGeometry,
        sourceObject: obj,
        appliedMatrix: obj.matrixWorld.clone(),
      });

      this.registeredObjects.set(key, obj);

      return bvh;
    } catch (e) {
      console.warn(`BVHQueryEngine: Failed to build BVH for object: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Invalidate cached BVH data.
   * If objId is provided, only invalidate that specific object.
   * Otherwise, clear the entire cache.
   */
  invalidateCache(objId?: string): void {
    if (objId !== undefined) {
      const entry = this.cache.get(objId);
      if (entry) {
        entry.worldGeometry.dispose();
        this.cache.delete(objId);
        this.registeredObjects.delete(objId);
      }
    } else {
      // Clear all
      for (const entry of this.cache.values()) {
        entry.worldGeometry.dispose();
      }
      this.cache.clear();
      this.registeredObjects.clear();
    }
  }

  /**
   * Invalidate cache for objects that have moved (matrixWorld changed).
   */
  invalidateStale(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (!this._matrixEquals(entry.sourceObject.matrixWorld, entry.appliedMatrix)) {
        entry.worldGeometry.dispose();
        this.cache.delete(key);
        this.registeredObjects.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Spatial Query Methods
  // ---------------------------------------------------------------------------

  /**
   * Precise minimum distance between two meshes using BVH closest point queries.
   *
   * Falls back to AABB-based approximation if either object lacks mesh geometry.
   */
  minDistance(objA: THREE.Object3D, objB: THREE.Object3D): number {
    const bvhA = this.getOrBuildBVH(objA);
    const bvhB = this.getOrBuildBVH(objB);

    if (!bvhA || !bvhB) {
      console.warn('BVHQueryEngine.minDistance: Falling back to AABB approximation for objects without mesh');
      return this._aabbDistance(objA, objB);
    }

    // Get the world-space geometry of B (already applied in cache)
    const entryB = this.cache.get(objB.uuid);
    if (!entryB) return this._aabbDistance(objA, objB);

    // Use closestPointToGeometry for precise mesh-to-mesh distance
    // The BVH for A is already in world space, so geometryToBvh is identity
    const result = bvhA.closestPointToGeometry(
      entryB.worldGeometry,
      new THREE.Matrix4(), // identity — both geometries are already in world space
      this._tmpHit1,
      this._tmpHit2,
      0,
      Infinity
    );

    if (result) {
      return result.distance;
    }

    // Fallback to AABB if closestPointToGeometry fails
    return this._aabbDistance(objA, objB);
  }

  /**
   * Precise collision detection between mesh triangles using BVH.
   *
   * Uses `intersectsGeometry` for fast BVH-accelerated intersection test.
   * Falls back to AABB intersection if either object lacks mesh geometry.
   *
   * @param tolerance - Distance tolerance for "touching" (default 0.01)
   * @returns true if the meshes are touching or intersecting
   */
  anyTouching(objA: THREE.Object3D, objB: THREE.Object3D, tolerance: number = 0.01): boolean {
    const bvhA = this.getOrBuildBVH(objA);
    const bvhB = this.getOrBuildBVH(objB);

    if (!bvhA || !bvhB) {
      console.warn('BVHQueryEngine.anyTouching: Falling back to AABB intersection for objects without mesh');
      return this._aabbIntersects(objA, objB, tolerance);
    }

    // Check precise geometry intersection
    const entryB = this.cache.get(objB.uuid);
    if (!entryB) return this._aabbIntersects(objA, objB, tolerance);

    // Use intersectsGeometry for fast BVH-accelerated intersection test
    const intersects = bvhA.intersectsGeometry(entryB.worldGeometry, new THREE.Matrix4());

    if (intersects) return true;

    // If not directly intersecting, check if they're within tolerance distance
    if (tolerance > 0) {
      const dist = this.minDistance(objA, objB);
      return dist <= tolerance;
    }

    return false;
  }

  /**
   * Check if mesh A contains mesh B (raycasting-based).
   *
   * Algorithm: Cast rays from B's center in multiple directions.
   * If all rays hit A's surface (and the hit distance is consistent with
   * being inside), B is contained within A.
   *
   * Falls back to AABB containment if either object lacks mesh geometry.
   */
  contains(objA: THREE.Object3D, objB: THREE.Object3D): boolean {
    const bvhA = this.getOrBuildBVH(objA);

    if (!bvhA) {
      console.warn('BVHQueryEngine.contains: Falling back to AABB containment check');
      return this._aabbContains(objA, objB);
    }

    // Get B's center in world space
    const bboxB = new THREE.Box3().setFromObject(objB);
    const centerB = new THREE.Vector3();
    bboxB.getCenter(centerB);

    // Cast rays from B's center in multiple directions
    // If B is inside A, every ray should hit A's surface
    const directions = this._generateRayDirections(14);
    let allHit = true;

    for (const dir of directions) {
      const ray = new THREE.Ray(centerB, dir);
      const hits = bvhA.raycast(ray);

      if (hits.length === 0) {
        allHit = false;
        break;
      }

      // For containment, we need at least 2 hits (entering and exiting)
      // and the first hit should be very close (we're inside) or there
      // should be an even number of hits
      // Simple check: if there are hits in both forward and backward directions,
      // the point is likely inside
      const forwardHit = hits.find(h => h.distance > 0);
      if (!forwardHit) {
        // Try the opposite direction
        const backRay = new THREE.Ray(centerB, dir.clone().negate());
        const backHits = bvhA.raycast(backRay);
        if (backHits.length === 0) {
          allHit = false;
          break;
        }
      }
    }

    if (allHit) {
      return true;
    }

    // Fallback: AABB containment
    return this._aabbContains(objA, objB);
  }

  /**
   * Ray-based line-of-sight check between two points.
   *
   * Casts a ray from `from` to `to` and checks if any obstacle blocks the path.
   * If `obstacles` is provided, only checks those objects. Otherwise checks all
   * registered objects.
   *
   * @returns true if there is a clear line of sight (no obstacles block)
   */
  hasLineOfSight(
    from: THREE.Vector3,
    to: THREE.Vector3,
    obstacles?: THREE.Object3D[]
  ): boolean {
    const direction = new THREE.Vector3().subVectors(to, from);
    const distance = direction.length();
    if (distance < 1e-6) return true;
    direction.normalize();

    const ray = new THREE.Ray(from, direction);

    // Determine which objects to check
    const objectsToCheck = obstacles ?? Array.from(this.registeredObjects.values());

    for (const obj of objectsToCheck) {
      const bvh = this.getOrBuildBVH(obj);
      if (!bvh) continue;

      // Quick AABB pre-check
      const bbox = new THREE.Box3().setFromObject(obj);
      if (!ray.intersectsBox(bbox)) continue;

      // Precise BVH raycast
      const hit = bvh.raycastFirst(ray, THREE.FrontSide, 0, distance);
      if (hit && hit.distance < distance) {
        return false; // Obstacle blocks the line of sight
      }
    }

    return true;
  }

  /**
   * Accessibility cost based on cuboid penetration.
   *
   * Extrudes the bounding box of objA in the given normal direction by `dist`,
   * then checks how much of objB penetrates into the extruded volume.
   *
   * This matches the original Infinigen `accessibility_cost_cuboid_penetration` function.
   */
  accessibilityCostCuboidPenetration(
    objA: THREE.Object3D,
    objB: THREE.Object3D,
    normalDir: THREE.Vector3,
    dist: number
  ): number {
    const bboxA = new THREE.Box3().setFromObject(objA);
    const bvhB = this.getOrBuildBVH(objB);

    // Extrude bboxA in the normal direction
    const extrudedMin = bboxA.min.clone();
    const extrudedMax = bboxA.max.clone();

    // Extend the box in the normal direction
    if (normalDir.x > 0) extrudedMax.x += dist * normalDir.x;
    else if (normalDir.x < 0) extrudedMin.x += dist * normalDir.x;
    if (normalDir.y > 0) extrudedMax.y += dist * normalDir.y;
    else if (normalDir.y < 0) extrudedMin.y += dist * normalDir.y;
    if (normalDir.z > 0) extrudedMax.z += dist * normalDir.z;
    else if (normalDir.z < 0) extrudedMin.z += dist * normalDir.z;

    const extrudedBox = new THREE.Box3(extrudedMin, extrudedMax);

    if (!bvhB) {
      // AABB fallback: compute overlap volume
      const bboxB = new THREE.Box3().setFromObject(objB);
      if (!extrudedBox.intersectsBox(bboxB)) return 0;
      const intersection = extrudedBox.clone().intersect(bboxB);
      const size = new THREE.Vector3();
      intersection.getSize(size);
      return size.x * size.y * size.z;
    }

    // Use BVH shapecast to count penetrating triangles
    let penetrationCost = 0;
    const triangle = new ExtendedTriangle();

    bvhB.shapecast({
      intersectsBounds: (box: THREE.Box3): any => {
        return extrudedBox.intersectsBox(box) ? INTERSECTED : NOT_INTERSECTED;
      },
      intersectsTriangle: (tri: ExtendedTriangle, _triIndex: number, _contained: boolean): boolean => {
        // Check if triangle vertices are inside the extruded box
        const v0 = tri.a;
        const v1 = tri.b;
        const v2 = tri.c;

        let insideCount = 0;
        if (extrudedBox.containsPoint(v0)) insideCount++;
        if (extrudedBox.containsPoint(v1)) insideCount++;
        if (extrudedBox.containsPoint(v2)) insideCount++;

        if (insideCount > 0) {
          // Estimate penetration area proportional to contained vertices
          const triArea = tri.getArea();
          penetrationCost += triArea * (insideCount / 3);
        }

        return false; // Continue traversal
      }
    });

    return penetrationCost;
  }

  /**
   * Find closest point on mesh surface to a given point.
   *
   * @returns ClosestPointResult or null if no mesh available
   */
  closestPointOnSurface(obj: THREE.Object3D, point: THREE.Vector3): ClosestPointResult | null {
    const bvh = this.getOrBuildBVH(obj);

    if (!bvh) {
      // AABB fallback: clamp point to AABB
      const bbox = new THREE.Box3().setFromObject(obj);
      const clamped = bbox.clampPoint(point, new THREE.Vector3());
      return {
        point: clamped,
        distance: point.distanceTo(clamped),
        faceIndex: -1,
      };
    }

    const target: HitPointInfo = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
    const result = bvh.closestPointToPoint(point, target, 0, Infinity);

    if (result) {
      return {
        point: result.point.clone(),
        distance: result.distance,
        faceIndex: result.faceIndex,
      };
    }

    return null;
  }

  /**
   * Cast a ray against all cached BVHs (or a specific set of objects).
   *
   * @param origin - Ray origin
   * @param direction - Ray direction (will be normalized)
   * @param maxDist - Maximum ray distance (default Infinity)
   * @param objects - Optional specific objects to test against; defaults to all registered
   * @returns Array of raycast results, sorted by distance
   */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDist: number = Infinity,
    objects?: THREE.Object3D[]
  ): RaycastResult[] {
    const dir = direction.clone().normalize();
    const ray = new THREE.Ray(origin, dir);
    const results: RaycastResult[] = [];

    const objectsToCheck = objects ?? Array.from(this.registeredObjects.values());

    for (const obj of objectsToCheck) {
      const bvh = this.getOrBuildBVH(obj);
      if (!bvh) continue;

      // Quick AABB pre-check
      const bbox = new THREE.Box3().setFromObject(obj);
      if (!ray.intersectsBox(bbox)) continue;

      const hits = bvh.raycast(ray, THREE.FrontSide, 0, maxDist);

      for (const hit of hits) {
        results.push({
          point: hit.point.clone(),
          distance: hit.distance,
          faceIndex: hit.faceIndex ?? 0,
          object: obj,
        });
      }
    }

    // Sort by distance
    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Find the first Mesh within an Object3D hierarchy.
   */
  private _findMesh(obj: THREE.Object3D): THREE.Mesh | null {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      return obj;
    }
    // Search children
    let found: THREE.Mesh | null = null;
    obj.traverse((child) => {
      if (!found && child instanceof THREE.Mesh && child.geometry) {
        found = child;
      }
    });
    return found;
  }

  /**
   * Check if two matrices are approximately equal.
   */
  private _matrixEquals(a: THREE.Matrix4, b: THREE.Matrix4): boolean {
    const ae = a.elements;
    const be = b.elements;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(ae[i] - be[i]) > 1e-6) return false;
    }
    return true;
  }

  /**
   * AABB-based distance fallback.
   */
  private _aabbDistance(objA: THREE.Object3D, objB: THREE.Object3D): number {
    const boxA = new THREE.Box3().setFromObject(objA);
    const boxB = new THREE.Box3().setFromObject(objB);

    // Compute minimum distance between two AABBs
    const dx = Math.max(0, Math.max(boxA.min.x - boxB.max.x, boxB.min.x - boxA.max.x));
    const dy = Math.max(0, Math.max(boxA.min.y - boxB.max.y, boxB.min.y - boxA.max.y));
    const dz = Math.max(0, Math.max(boxA.min.z - boxB.max.z, boxB.min.z - boxA.max.z));

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * AABB-based intersection fallback.
   */
  private _aabbIntersects(objA: THREE.Object3D, objB: THREE.Object3D, tolerance: number = 0.01): boolean {
    const boxA = new THREE.Box3().setFromObject(objA);
    const boxB = new THREE.Box3().setFromObject(objB);
    boxA.expandByScalar(tolerance);
    boxB.expandByScalar(tolerance);
    return boxA.intersectsBox(boxB);
  }

  /**
   * AABB-based containment fallback.
   */
  private _aabbContains(objA: THREE.Object3D, objB: THREE.Object3D): boolean {
    const boxA = new THREE.Box3().setFromObject(objA);
    const boxB = new THREE.Box3().setFromObject(objB);
    return boxA.containsBox(boxB);
  }

  /**
   * Generate a set of ray directions for containment testing using Fibonacci sphere.
   */
  private _generateRayDirections(count: number): THREE.Vector3[] {
    const directions: THREE.Vector3[] = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < count; i++) {
      const theta = 2 * Math.PI * i / goldenRatio;
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);

      directions.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
      ).normalize());
    }

    return directions;
  }
}

// ============================================================================
// Module-level singleton
// ============================================================================

/**
 * Default BVHQueryEngine instance.
 * Can be shared across the module or replaced per-evaluator.
 */
let _defaultEngine: BVHQueryEngine | null = null;

/**
 * Get or create the default BVHQueryEngine instance.
 */
export function getDefaultBVHEngine(): BVHQueryEngine {
  if (!_defaultEngine) {
    _defaultEngine = new BVHQueryEngine();
  }
  return _defaultEngine;
}

/**
 * Set a custom default BVHQueryEngine instance.
 */
export function setDefaultBVHEngine(engine: BVHQueryEngine): void {
  _defaultEngine = engine;
}

/**
 * Reset the default engine (useful for testing or scene transitions).
 */
export function resetDefaultBVHEngine(): void {
  if (_defaultEngine) {
    _defaultEngine.invalidateCache();
  }
  _defaultEngine = null;
}
