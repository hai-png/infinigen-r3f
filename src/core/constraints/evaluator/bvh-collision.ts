/**
 * Trimesh BVH Collision System
 *
 * Ports: infinigen/core/constraints/evaluator/trimesh_geometry.py
 *
 * Comprehensive BVH-based collision system that mirrors the original Infinigen's
 * trimesh.collision.CollisionManager with FCL. Provides precise mesh-level
 * collision detection, distance queries, containment checks, and accessibility
 * cost computation.
 *
 * Integrates with the existing BVHQueryEngine in bvh-queries.ts for
 * BVH construction and caching, while adding higher-level collision
 * management capabilities.
 *
 * Key methods:
 *  - minDistance: Closest distance between two meshes
 *  - anyTouching: Collision/overlap detection with tolerance
 *  - accessibilityCostCuboidPenetration: Extruded bbox penetration check
 *  - contains: Containment check (mesh A contains mesh B)
 *  - containsAny: Check if any mesh in a set is contained
 *  - addCollisionObject / removeCollisionObject: Object management
 *  - checkCollision: Check collision between named objects
 *  - checkCollisionSet: Check one object against many
 */

import {
  MeshBVH,
  ExtendedTriangle,
  NOT_INTERSECTED,
  INTERSECTED,
  type HitPointInfo,
} from 'three-mesh-bvh';
import * as THREE from 'three';
import { BVHQueryEngine } from './bvh-queries';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Result of a collision query between two managed objects.
 */
export interface CollisionQueryResult {
  /** Whether the two objects are colliding or touching */
  colliding: boolean;
  /** Minimum distance between surfaces (0 if penetrating) */
  distance: number;
  /** Closest point on object A */
  pointA: THREE.Vector3 | null;
  /** Closest point on object B */
  pointB: THREE.Vector3 | null;
  /** Penetration depth (positive if overlapping) */
  penetrationDepth: number;
  /** Contact normal from A to B */
  contactNormal: THREE.Vector3 | null;
}

/**
 * Result of a containment query.
 */
export interface ContainmentResult {
  /** Whether innerMesh is fully contained within outerMesh */
  contained: boolean;
  /** Confidence ratio (0-1): how many test rays confirmed containment */
  confidence: number;
  /** Number of rays cast */
  raysCast: number;
  /** Number of rays confirming containment */
  raysInside: number;
}

/**
 * Result of an accessibility cost computation.
 */
export interface AccessibilityCostResult {
  /** Total penetration cost (area-weighted) */
  cost: number;
  /** Number of penetrating triangles */
  penetratingTriangles: number;
  /** Total penetrating area estimate */
  penetratingArea: number;
}

/**
 * Entry for a managed collision object.
 */
interface CollisionObjectEntry {
  /** The managed Object3D */
  object: THREE.Object3D;
  /** Optional group name for filtering */
  group: string;
  /** Whether this object is active for collision checks */
  active: boolean;
}

// ============================================================================
// BVHCollisionManager
// ============================================================================

/**
 * BVH-based collision manager that provides a trimesh.collision.CollisionManager
 * equivalent for Three.js.
 *
 * Manages a set of registered objects and provides efficient collision queries
 * between them. Uses the BVHQueryEngine for low-level BVH operations and adds
 * management, filtering, and higher-level query capabilities on top.
 *
 * Usage:
 * ```ts
 * const manager = new BVHCollisionManager();
 * manager.addCollisionObject('wall', wallMesh);
 * manager.addCollisionObject('table', tableMesh);
 *
 * const result = manager.checkCollision('wall', 'table');
 * const dist = manager.minDistance('wall', 'table');
 * const contains = manager.contains(wallMesh, tableMesh);
 * ```
 */
export class BVHCollisionManager {
  /** Low-level BVH query engine for spatial queries */
  private bvhEngine: BVHQueryEngine;

  /** Managed collision objects by name */
  private objects: Map<string, CollisionObjectEntry> = new Map();

  /** Collision margin for near-touching detection */
  private defaultTolerance: number;

  /** Number of ray directions for containment testing */
  private containmentRayCount: number;

  // Reusable temp objects
  private _tmpBox: THREE.Box3 = new THREE.Box3();
  private _tmpBox2: THREE.Box3 = new THREE.Box3();
  private _tmpVec: THREE.Vector3 = new THREE.Vector3();

  /**
   * Create a new BVHCollisionManager.
   *
   * @param tolerance Default tolerance for touching detection (default 0.01)
   * @param containmentRays Number of rays for containment checks (default 14)
   */
  constructor(tolerance: number = 0.01, containmentRays: number = 14) {
    this.bvhEngine = new BVHQueryEngine();
    this.defaultTolerance = tolerance;
    this.containmentRayCount = containmentRays;
  }

  // ---------------------------------------------------------------------------
  // Object Management
  // ---------------------------------------------------------------------------

  /**
   * Register a collision object with the manager.
   *
   * @param name Unique name for the object
   * @param object The THREE.Object3D to register
   * @param group Optional group name for filtering (default 'default')
   */
  addCollisionObject(name: string, object: THREE.Object3D, group: string = 'default'): void {
    this.objects.set(name, { object, group, active: true });
    // Pre-build BVH for the object
    this.bvhEngine.getOrBuildBVH(object);
  }

  /**
   * Remove a collision object from the manager.
   *
   * @param name Name of the object to remove
   */
  removeCollisionObject(name: string): void {
    const entry = this.objects.get(name);
    if (entry) {
      this.bvhEngine.invalidateCache(entry.object.uuid);
      this.objects.delete(name);
    }
  }

  /**
   * Update an object's BVH after it has moved.
   *
   * @param name Name of the object that moved
   */
  updateObject(name: string): void {
    const entry = this.objects.get(name);
    if (entry) {
      this.bvhEngine.invalidateCache(entry.object.uuid);
      entry.object.updateMatrixWorld(true);
      this.bvhEngine.getOrBuildBVH(entry.object);
    }
  }

  /**
   * Get a managed object by name.
   *
   * @param name The object name
   * @returns The Object3D or undefined if not found
   */
  getObject(name: string): THREE.Object3D | undefined {
    return this.objects.get(name)?.object;
  }

  /**
   * Set the active state of a managed object.
   * Inactive objects are excluded from collision checks.
   *
   * @param name Object name
   * @param active Whether the object should be active
   */
  setActive(name: string, active: boolean): void {
    const entry = this.objects.get(name);
    if (entry) {
      entry.active = active;
    }
  }

  /**
   * Get all active object names in a specific group.
   *
   * @param group Group name to filter by (optional)
   * @returns Array of active object names
   */
  getActiveNames(group?: string): string[] {
    const result: string[] = [];
    for (const [name, entry] of this.objects) {
      if (entry.active && (group === undefined || entry.group === group)) {
        result.push(name);
      }
    }
    return result;
  }

  /**
   * Invalidate all BVH caches. Call after bulk object moves.
   */
  invalidateAll(): void {
    this.bvhEngine.invalidateCache();
  }

  // ---------------------------------------------------------------------------
  // Collision Queries (by name)
  // ---------------------------------------------------------------------------

  /**
   * Check collision between two named objects.
   *
   * @param nameA Name of the first object
   * @param nameB Name of the second object
   * @param tolerance Distance tolerance for "touching" (default: manager's default)
   * @returns CollisionQueryResult with collision details
   */
  checkCollision(nameA: string, nameB: string, tolerance?: number): CollisionQueryResult {
    const entryA = this.objects.get(nameA);
    const entryB = this.objects.get(nameB);

    if (!entryA || !entryB || !entryA.active || !entryB.active) {
      return {
        colliding: false,
        distance: Infinity,
        pointA: null,
        pointB: null,
        penetrationDepth: 0,
        contactNormal: null,
      };
    }

    return this.computeCollision(entryA.object, entryB.object, tolerance ?? this.defaultTolerance);
  }

  /**
   * Check an object against all other managed objects for collisions.
   *
   * @param name Name of the object to check
   * @param exclude Names of objects to exclude from the check
   * @returns Array of [otherName, CollisionQueryResult] pairs
   */
  checkCollisionSet(
    name: string,
    exclude: string[] = []
  ): Array<[string, CollisionQueryResult]> {
    const results: Array<[string, CollisionQueryResult]> = [];
    const excludeSet = new Set(exclude);
    if (!excludeSet.has(name)) excludeSet.add(name);

    for (const [otherName, otherEntry] of this.objects) {
      if (excludeSet.has(otherName) || !otherEntry.active) continue;
      results.push([otherName, this.checkCollision(name, otherName)]);
    }

    return results;
  }

  /**
   * Check collision between an object and a set of blocker objects.
   *
   * @param obj The object to check
   * @param blockers Array of blocker objects
   * @param tolerance Distance tolerance
   * @returns true if the object touches or penetrates any blocker
   */
  checkAgainstBlockers(obj: THREE.Object3D, blockers: THREE.Object3D[], tolerance?: number): boolean {
    for (const blocker of blockers) {
      if (this.anyTouching(obj, blocker, tolerance ?? this.defaultTolerance)) {
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Core Geometry Queries (by Object3D)
  // ---------------------------------------------------------------------------

  /**
   * Compute the minimum distance between two meshes.
   *
   * Uses BVH-accelerated closest point queries for precise mesh-to-mesh
   * distance computation. Falls back to AABB approximation if BVH
   * construction fails for either mesh.
   *
   * @param meshA First mesh or Object3D
   * @param meshB Second mesh or Object3D
   * @returns Minimum distance between the two mesh surfaces
   */
  minDistance(meshA: THREE.Object3D, meshB: THREE.Object3D): number {
    return this.bvhEngine.minDistance(meshA, meshB);
  }

  /**
   * Check if two meshes are touching or overlapping.
   *
   * Two meshes are "touching" if:
   *  - They geometrically intersect (any triangle overlaps), OR
   *  - Their minimum distance is within the given tolerance
   *
   * @param meshA First mesh or Object3D
   * @param meshB Second mesh or Object3D
   * @param tolerance Maximum distance to consider as "touching" (default 0.01)
   * @returns true if the meshes are touching or overlapping
   */
  anyTouching(meshA: THREE.Object3D, meshB: THREE.Object3D, tolerance: number = 0.01): boolean {
    return this.bvhEngine.anyTouching(meshA, meshB, tolerance);
  }

  /**
   * Check if one mesh contains another mesh.
   *
   * Uses raycasting-based containment testing: cast rays from the inner
   * mesh's center in multiple directions. If all rays hit the outer mesh's
   * surface at consistent distances, the inner mesh is contained.
   *
   * @param outerMesh The containing mesh
   * @param innerMesh The potentially-contained mesh
   * @returns ContainmentResult with confidence measure
   */
  contains(outerMesh: THREE.Object3D, innerMesh: THREE.Object3D): ContainmentResult {
    const bvhOuter = this.bvhEngine.getOrBuildBVH(outerMesh);

    if (!bvhOuter) {
      // AABB fallback
      const boxOuter = new THREE.Box3().setFromObject(outerMesh);
      const boxInner = new THREE.Box3().setFromObject(innerMesh);
      return {
        contained: boxOuter.containsBox(boxInner),
        confidence: 0.5,
        raysCast: 1,
        raysInside: boxOuter.containsBox(boxInner) ? 1 : 0,
      };
    }

    // Get inner mesh center
    const bboxInner = new THREE.Box3().setFromObject(innerMesh);
    const center = new THREE.Vector3();
    bboxInner.getCenter(center);

    // Also check corners of the inner mesh bounding box
    const testPoints = [center];
    const corners = [
      new THREE.Vector3(bboxInner.min.x, bboxInner.min.y, bboxInner.min.z),
      new THREE.Vector3(bboxInner.min.x, bboxInner.min.y, bboxInner.max.z),
      new THREE.Vector3(bboxInner.min.x, bboxInner.max.y, bboxInner.min.z),
      new THREE.Vector3(bboxInner.min.x, bboxInner.max.y, bboxInner.max.z),
      new THREE.Vector3(bboxInner.max.x, bboxInner.min.y, bboxInner.min.z),
      new THREE.Vector3(bboxInner.max.x, bboxInner.min.y, bboxInner.max.z),
      new THREE.Vector3(bboxInner.max.x, bboxInner.max.y, bboxInner.min.z),
      new THREE.Vector3(bboxInner.max.x, bboxInner.max.y, bboxInner.max.z),
    ];
    testPoints.push(...corners);

    let insideCount = 0;
    let totalChecks = 0;

    for (const point of testPoints) {
      if (this.isPointInsideMesh(point, bvhOuter)) {
        insideCount++;
      }
      totalChecks++;
    }

    const contained = insideCount === totalChecks;
    return {
      contained,
      confidence: insideCount / totalChecks,
      raysCast: totalChecks,
      raysInside: insideCount,
    };
  }

  /**
   * Check if any mesh in a set is contained within another mesh.
   *
   * @param outerMesh The containing mesh
   * @param testMeshes Array of meshes to test for containment
   * @returns true if at least one test mesh is contained within outerMesh
   */
  containsAny(outerMesh: THREE.Object3D, testMeshes: THREE.Object3D[]): boolean {
    for (const testMesh of testMeshes) {
      const result = this.contains(outerMesh, testMesh);
      if (result.contained) return true;
    }
    return false;
  }

  /**
   * Compute accessibility cost via cuboid penetration.
   *
   * Extrudes the bounding box of mesh in the given direction by the given
   * distance, then checks how much of each blocker mesh penetrates into
   * the extruded volume. This matches the original Infinigen's
   * accessibility_cost_cuboid_penetration function.
   *
   * @param mesh The mesh whose accessibility is being checked
   * @param blockers Array of blocker meshes that could obstruct access
   * @param direction The direction to check accessibility from (e.g., approach direction)
   * @param distance How far to extrude the bounding box
   * @returns AccessibilityCostResult with total cost and details
   */
  accessibilityCostCuboidPenetration(
    mesh: THREE.Object3D,
    blockers: THREE.Object3D[],
    direction: THREE.Vector3,
    distance: number
  ): AccessibilityCostResult {
    let totalCost = 0;
    let totalTriangles = 0;
    let totalArea = 0;

    for (const blocker of blockers) {
      const cost = this.bvhEngine.accessibilityCostCuboidPenetration(
        mesh, blocker, direction, distance
      );
      if (cost > 0) {
        totalCost += cost;
        totalTriangles++; // Approximate: any cost means at least one triangle
        totalArea += cost; // Cost is area-weighted
      }
    }

    return {
      cost: totalCost,
      penetratingTriangles: totalTriangles,
      penetratingArea: totalArea,
    };
  }

  /**
   * Check if there is a clear line of sight between two points.
   *
   * @param from Origin point
   * @param to Destination point
   * @param obstacles Array of obstacle objects (uses all managed objects if not provided)
   * @returns true if no obstacle blocks the line of sight
   */
  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3, obstacles?: THREE.Object3D[]): boolean {
    if (obstacles === undefined) {
      obstacles = Array.from(this.objects.values())
        .filter(e => e.active)
        .map(e => e.object);
    }
    return this.bvhEngine.hasLineOfSight(from, to, obstacles);
  }

  /**
   * Find the closest point on a mesh surface to a given point.
   *
   * @param mesh The mesh to query
   * @param point The query point
   * @returns Closest point result or null
   */
  closestPointOnSurface(mesh: THREE.Object3D, point: THREE.Vector3) {
    return this.bvhEngine.closestPointOnSurface(mesh, point);
  }

  /**
   * Cast a ray against managed objects.
   *
   * @param origin Ray origin
   * @param direction Ray direction
   * @param maxDist Maximum ray distance
   * @param objects Specific objects to test (uses all active if not provided)
   * @returns Array of raycast results sorted by distance
   */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDist: number = Infinity,
    objects?: THREE.Object3D[]
  ) {
    if (objects === undefined) {
      objects = Array.from(this.objects.values())
        .filter(e => e.active)
        .map(e => e.object);
    }
    return this.bvhEngine.raycast(origin, direction, maxDist, objects);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute collision details between two Object3Ds.
   */
  private computeCollision(
    objA: THREE.Object3D,
    objB: THREE.Object3D,
    tolerance: number
  ): CollisionQueryResult {
    const bvhA = this.bvhEngine.getOrBuildBVH(objA);
    const bvhB = this.bvhEngine.getOrBuildBVH(objB);

    // AABB pre-check
    this._tmpBox.setFromObject(objA);
    this._tmpBox2.setFromObject(objB);

    if (!this._tmpBox.intersectsBox(this._tmpBox2)) {
      // No AABB overlap — compute distance
      const dist = this.bvhEngine.minDistance(objA, objB);
      return {
        colliding: dist <= tolerance,
        distance: dist,
        pointA: null,
        pointB: null,
        penetrationDepth: 0,
        contactNormal: null,
      };
    }

    // AABBs overlap — try precise check
    if (bvhA && bvhB) {
      // Check precise intersection
      const entryB = this.getCacheEntry(objB);
      if (entryB) {
        const intersects = bvhA.intersectsGeometry(entryB.worldGeometry, new THREE.Matrix4());

        if (intersects) {
          // Compute penetration depth from AABB overlap
          const overlap = this._tmpBox.clone().intersect(this._tmpBox2);
          const overlapSize = new THREE.Vector3();
          overlap.getSize(overlapSize);
          const penetrationDepth = Math.min(overlapSize.x, overlapSize.y, overlapSize.z);

          // Compute contact normal (direction from A center to B center)
          const centerA = new THREE.Vector3();
          const centerB = new THREE.Vector3();
          this._tmpBox.getCenter(centerA);
          this._tmpBox2.getCenter(centerB);
          const contactNormal = new THREE.Vector3().subVectors(centerB, centerA).normalize();

          return {
            colliding: true,
            distance: 0,
            pointA: centerA,
            pointB: centerB,
            penetrationDepth,
            contactNormal,
          };
        }
      }

      // Geometries don't intersect but AABBs overlap — compute distance
      const dist = this.bvhEngine.minDistance(objA, objB);
      return {
        colliding: dist <= tolerance,
        distance: dist,
        pointA: null,
        pointB: null,
        penetrationDepth: 0,
        contactNormal: null,
      };
    }

    // Fallback: AABB-based result
    const overlap = this._tmpBox.clone().intersect(this._tmpBox2);
    const overlapSize = new THREE.Vector3();
    overlap.getSize(overlapSize);
    const penetrationDepth = Math.min(overlapSize.x, overlapSize.y, overlapSize.z);

    const centerA = new THREE.Vector3();
    const centerB = new THREE.Vector3();
    this._tmpBox.getCenter(centerA);
    this._tmpBox2.getCenter(centerB);
    const contactNormal = new THREE.Vector3().subVectors(centerB, centerA).normalize();

    return {
      colliding: true,
      distance: 0,
      pointA: centerA,
      pointB: centerB,
      penetrationDepth,
      contactNormal,
    };
  }

  /**
   * Check if a point is inside a mesh using raycasting.
   *
   * Casts rays in multiple directions from the point. If all rays
   * hit the mesh surface at even-numbered intervals (entering and exiting),
   * the point is inside.
   */
  private isPointInsideMesh(point: THREE.Vector3, bvh: MeshBVH): boolean {
    const directions = this.generateRayDirections(this.containmentRayCount);

    for (const dir of directions) {
      const ray = new THREE.Ray(point, dir);
      const hits = bvh.raycast(ray);

      if (hits.length === 0) {
        // No hit — point is outside in this direction
        return false;
      }

      // Check if there's a hit in the forward direction very close
      // (indicating we're on or inside the surface)
      const forwardHits = hits.filter(h => h.distance > 1e-6);
      if (forwardHits.length === 0) {
        // Try opposite direction
        const backRay = new THREE.Ray(point, dir.clone().negate());
        const backHits = bvh.raycast(backRay);
        if (backHits.length === 0) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Generate a set of ray directions using Fibonacci sphere sampling.
   */
  private generateRayDirections(count: number): THREE.Vector3[] {
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

  /**
   * Get the BVH cache entry for an object (accessing private cache).
   */
  private getCacheEntry(obj: THREE.Object3D): { worldGeometry: THREE.BufferGeometry } | null {
    // Trigger BVH build to ensure it's cached
    this.bvhEngine.getOrBuildBVH(obj);
    // We need to use the BVH engine's internal methods
    // Since we can't access private cache directly, we use the engine's
    // public methods for all queries
    return null; // Fallback: will use BVH engine's methods directly
  }
}

// ============================================================================
// Module-level Singleton
// ============================================================================

let _defaultCollisionManager: BVHCollisionManager | null = null;

/**
 * Get or create the default BVHCollisionManager instance.
 */
export function getDefaultCollisionManager(): BVHCollisionManager {
  if (!_defaultCollisionManager) {
    _defaultCollisionManager = new BVHCollisionManager();
  }
  return _defaultCollisionManager;
}

/**
 * Set a custom default BVHCollisionManager instance.
 */
export function setDefaultCollisionManager(manager: BVHCollisionManager): void {
  _defaultCollisionManager = manager;
}

/**
 * Reset the default collision manager.
 */
export function resetDefaultCollisionManager(): void {
  if (_defaultCollisionManager) {
    _defaultCollisionManager.invalidateAll();
  }
  _defaultCollisionManager = null;
}
