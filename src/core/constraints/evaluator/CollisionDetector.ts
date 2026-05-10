/**
 * CollisionDetector Facade — Unified collision detection interface
 *
 * Gap 8 Fix: Integrates GJK collision detection with BVH mesh-mesh
 * collision to provide a single facade for the constraint system.
 *
 * - checkCollision(objA, objB): Check if two objects collide
 * - computePenetration(objA, objB): Get penetration depth/normal
 * - minDistance(objA, objB): Get minimum distance between objects
 *
 * Uses GJK for convex shapes and BVH for concave meshes.
 */

import * as THREE from 'three';
import {
  Collider,
  ColliderConfig,
  ColliderShape,
} from '../../../sim/physics/Collider';
import {
  gjkIntersect,
  epaPenetration,
  detectCollisionGJK,
  getSupportFunction,
  SupportFunction,
  EPAResult,
} from '../../../sim/physics/collision/GJK';
import {
  BVHCollisionManager,
  CollisionQueryResult,
  getDefaultCollisionManager,
} from './bvh-collision';

// ============================================================================
// CollisionResult — Result of a collision check
// ============================================================================

export interface CollisionCheckResult {
  /** Whether the objects are colliding */
  colliding: boolean;

  /** Minimum distance between surfaces (0 if penetrating) */
  distance: number;

  /** Penetration depth (positive if overlapping) */
  penetrationDepth: number;

  /** Contact normal from A to B */
  contactNormal: THREE.Vector3 | null;

  /** Closest point on A */
  pointA: THREE.Vector3 | null;

  /** Closest point on B */
  pointB: THREE.Vector3 | null;

  /** Which method was used: 'gjk' or 'bvh' */
  method: 'gjk' | 'bvh' | 'aabb';
}

// ============================================================================
// ShapeInfo — Shape metadata for an object
// ============================================================================

export interface ShapeInfo {
  /** Whether the shape is convex */
  isConvex: boolean;

  /** The collider if convex (for GJK) */
  collider?: Collider;

  /** The Object3D if mesh-based (for BVH) */
  object3D?: THREE.Object3D;

  /** Bounding box */
  boundingBox: THREE.Box3;

  /** Approximate shape type */
  shapeType: ColliderShape | 'mesh';
}

// ============================================================================
// CollisionDetector
// ============================================================================

/**
 * Facade for collision detection that integrates GJK and BVH.
 *
 * For convex shapes (boxes, spheres, cylinders), uses GJK for precise
 * collision detection. For concave meshes, falls back to BVH.
 */
export class CollisionDetector {
  private bvhManager: BVHCollisionManager;
  private shapeCache: Map<string, ShapeInfo> = new Map();

  constructor(bvhManager?: BVHCollisionManager) {
    this.bvhManager = bvhManager ?? getDefaultCollisionManager();
  }

  /**
   * Register an object for collision detection.
   *
   * @param id Unique identifier
   * @param object The THREE.Object3D
   * @param shapeHint Optional hint about the shape type
   */
  registerObject(
    id: string,
    object: THREE.Object3D,
    shapeHint?: { isConvex?: boolean; shapeType?: ColliderShape | 'mesh' }
  ): void {
    const boundingBox = new THREE.Box3().setFromObject(object);
    const isConvex = shapeHint?.isConvex ?? this.inferConvexity(object);
    const shapeType = shapeHint?.shapeType ?? this.inferShapeType(object);

    let collider: Collider | undefined;
    if (isConvex && shapeType !== 'mesh') {
      collider = this.createCollider(id, boundingBox, shapeType as ColliderShape);
    }

    const shapeInfo: ShapeInfo = {
      isConvex,
      collider,
      object3D: object,
      boundingBox,
      shapeType,
    };

    this.shapeCache.set(id, shapeInfo);

    // Also register with BVH manager for mesh-mesh checks
    this.bvhManager.addCollisionObject(id, object);
  }

  /**
   * Remove an object from collision detection.
   */
  unregisterObject(id: string): void {
    this.shapeCache.delete(id);
    this.bvhManager.removeCollisionObject(id);
  }

  /**
   * Check if two objects are colliding.
   */
  checkCollision(idA: string, idB: string): CollisionCheckResult {
    const shapeA = this.shapeCache.get(idA);
    const shapeB = this.shapeCache.get(idB);

    if (!shapeA || !shapeB) {
      return this.emptyResult();
    }

    // AABB pre-check
    if (!shapeA.boundingBox.intersectsBox(shapeB.boundingBox)) {
      return {
        colliding: false,
        distance: this.aabbDistance(shapeA.boundingBox, shapeB.boundingBox),
        penetrationDepth: 0,
        contactNormal: null,
        pointA: null,
        pointB: null,
        method: 'aabb',
      };
    }

    // Both convex: use GJK
    if (shapeA.isConvex && shapeB.isConvex && shapeA.collider && shapeB.collider) {
      return this.gjkCheck(shapeA.collider, shapeB.collider);
    }

    // At least one is mesh: use BVH
    if (shapeA.object3D && shapeB.object3D) {
      const bvhResult = this.bvhManager.checkCollision(idA, idB);
      return {
        colliding: bvhResult.colliding,
        distance: bvhResult.distance,
        penetrationDepth: bvhResult.penetrationDepth,
        contactNormal: bvhResult.contactNormal,
        pointA: bvhResult.pointA,
        pointB: bvhResult.pointB,
        method: 'bvh',
      };
    }

    // Fallback to AABB
    return this.aabbCheck(shapeA.boundingBox, shapeB.boundingBox);
  }

  /**
   * Compute the penetration depth and normal between two colliding objects.
   */
  computePenetration(idA: string, idB: string): CollisionCheckResult {
    const shapeA = this.shapeCache.get(idA);
    const shapeB = this.shapeCache.get(idB);

    if (!shapeA || !shapeB) {
      return this.emptyResult();
    }

    // Use GJK+EPA for convex shapes
    if (shapeA.isConvex && shapeB.isConvex && shapeA.collider && shapeB.collider) {
      const epaResult = detectCollisionGJK(shapeA.collider, shapeB.collider);
      if (epaResult) {
        return {
          colliding: true,
          distance: 0,
          penetrationDepth: epaResult.depth,
          contactNormal: epaResult.normal,
          pointA: epaResult.point,
          pointB: epaResult.point.clone().add(epaResult.normal.clone().multiplyScalar(epaResult.depth)),
          method: 'gjk',
        };
      }
    }

    // Fall back to AABB penetration estimate
    if (shapeA.boundingBox.intersectsBox(shapeB.boundingBox)) {
      return this.aabbPenetration(shapeA.boundingBox, shapeB.boundingBox);
    }

    return this.emptyResult();
  }

  /**
   * Compute the minimum distance between two objects.
   */
  minDistance(idA: string, idB: string): number {
    const shapeA = this.shapeCache.get(idA);
    const shapeB = this.shapeCache.get(idB);

    if (!shapeA || !shapeB) return Infinity;

    // AABB check first
    if (!shapeA.boundingBox.intersectsBox(shapeB.boundingBox)) {
      return this.aabbDistance(shapeA.boundingBox, shapeB.boundingBox);
    }

    // Use BVH for precise distance
    if (shapeA.object3D && shapeB.object3D) {
      return this.bvhManager.minDistance(shapeA.object3D, shapeB.object3D);
    }

    // AABB distance
    return this.aabbDistance(shapeA.boundingBox, shapeB.boundingBox);
  }

  /**
   * Update the shape info for an object (call after it moves).
   */
  updateObject(id: string): void {
    const shapeInfo = this.shapeCache.get(id);
    if (shapeInfo && shapeInfo.object3D) {
      shapeInfo.boundingBox.setFromObject(shapeInfo.object3D);
      this.bvhManager.updateObject(id);
    }
  }

  /**
   * Check if there is line of sight between two points,
   * with registered objects as obstacles.
   */
  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    return this.bvhManager.hasLineOfSight(from, to);
  }

  /**
   * Check if two registered objects are colliding.
   * Convenience method that wraps checkCollision for the constraint system.
   *
   * @param idA First object ID
   * @param idB Second object ID
   * @returns true if the objects are colliding (overlapping or touching)
   */
  hasCollisionBetween(idA: string, idB: string): boolean {
    const result = this.checkCollision(idA, idB);
    return result.colliding;
  }

  /**
   * Get the minimum distance between two registered objects.
   * Convenience method for constraint evaluation.
   *
   * @param idA First object ID
   * @param idB Second object ID
   * @returns Minimum distance between surfaces (0 if penetrating)
   */
  distanceBetween(idA: string, idB: string): number {
    return this.minDistance(idA, idB);
  }

  /**
   * Check if a ray from one object center to another is blocked
   * by any registered object (line of sight check for visibility).
   *
   * @param fromObjId The source object ID
   * @param toObjId The target object ID
   * @returns true if there is clear line of sight between the objects
   */
  hasLineOfSightBetween(fromObjId: string, toObjId: string): boolean {
    const shapeA = this.shapeCache.get(fromObjId);
    const shapeB = this.shapeCache.get(toObjId);

    if (!shapeA || !shapeB) return true; // No info = assume visible

    const centerA = new THREE.Vector3();
    const centerB = new THREE.Vector3();
    shapeA.boundingBox.getCenter(centerA);
    shapeB.boundingBox.getCenter(centerB);

    return this.bvhManager.hasLineOfSight(centerA, centerB);
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private emptyResult(): CollisionCheckResult {
    return {
      colliding: false,
      distance: Infinity,
      penetrationDepth: 0,
      contactNormal: null,
      pointA: null,
      pointB: null,
      method: 'aabb',
    };
  }

  private gjkCheck(colliderA: Collider, colliderB: Collider): CollisionCheckResult {
    const epaResult = detectCollisionGJK(colliderA, colliderB);

    if (epaResult) {
      return {
        colliding: true,
        distance: 0,
        penetrationDepth: epaResult.depth,
        contactNormal: epaResult.normal,
        pointA: epaResult.point,
        pointB: epaResult.point.clone().add(epaResult.normal.clone().multiplyScalar(epaResult.depth)),
        method: 'gjk',
      };
    }

    // Not colliding — estimate distance from AABB
    const boxA = new THREE.Box3(colliderA.aabbMin, colliderA.aabbMax);
    const boxB = new THREE.Box3(colliderB.aabbMin, colliderB.aabbMax);
    return {
      colliding: false,
      distance: this.aabbDistance(boxA, boxB),
      penetrationDepth: 0,
      contactNormal: null,
      pointA: null,
      pointB: null,
      method: 'gjk',
    };
  }

  private aabbCheck(a: THREE.Box3, b: THREE.Box3): CollisionCheckResult {
    const colliding = a.intersectsBox(b);
    if (colliding) {
      return this.aabbPenetration(a, b);
    }
    return {
      colliding: false,
      distance: this.aabbDistance(a, b),
      penetrationDepth: 0,
      contactNormal: null,
      pointA: null,
      pointB: null,
      method: 'aabb',
    };
  }

  private aabbPenetration(a: THREE.Box3, b: THREE.Box3): CollisionCheckResult {
    const overlap = a.clone().intersect(b);
    const size = new THREE.Vector3();
    overlap.getSize(size);
    const penetrationDepth = Math.min(size.x, size.y, size.z);

    const centerA = new THREE.Vector3();
    const centerB = new THREE.Vector3();
    a.getCenter(centerA);
    b.getCenter(centerB);
    const contactNormal = new THREE.Vector3().subVectors(centerB, centerA).normalize();

    return {
      colliding: true,
      distance: 0,
      penetrationDepth,
      contactNormal,
      pointA: overlap.getCenter(new THREE.Vector3()),
      pointB: overlap.getCenter(new THREE.Vector3()),
      method: 'aabb',
    };
  }

  private aabbDistance(a: THREE.Box3, b: THREE.Box3): number {
    if (a.intersectsBox(b)) return 0;
    const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
    const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
    const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private inferConvexity(object: THREE.Object3D): boolean {
    // Simple heuristic: if it's a basic geometry, it's convex
    if (object instanceof THREE.Mesh) {
      const geo = object.geometry;
      if (geo instanceof THREE.BoxGeometry ||
          geo instanceof THREE.SphereGeometry ||
          geo instanceof THREE.CylinderGeometry ||
          geo instanceof THREE.ConeGeometry ||
          geo instanceof THREE.TetrahedronGeometry ||
          geo instanceof THREE.OctahedronGeometry ||
          geo instanceof THREE.DodecahedronGeometry ||
          geo instanceof THREE.IcosahedronGeometry) {
        return true;
      }
    }
    return false;
  }

  private inferShapeType(object: THREE.Object3D): ColliderShape | 'mesh' {
    if (object instanceof THREE.Mesh) {
      const geo = object.geometry;
      if (geo instanceof THREE.SphereGeometry) return 'sphere';
      if (geo instanceof THREE.CylinderGeometry || geo instanceof THREE.ConeGeometry) return 'cylinder';
      if (geo instanceof THREE.BoxGeometry) return 'box';
    }
    return 'mesh';
  }

  private createCollider(id: string, box: THREE.Box3, shape: ColliderShape): Collider {
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const config: ColliderConfig = {
      id,
      shape,
      halfExtents: size.clone().multiplyScalar(0.5),
      radius: Math.max(size.x, size.y, size.z) / 2,
      height: size.y,
    };

    const collider = new Collider(config);
    collider.aabbMin = box.min.clone();
    collider.aabbMax = box.max.clone();
    return collider;
  }
}

// ============================================================================
// Module-level Singleton
// ============================================================================

let _defaultDetector: CollisionDetector | null = null;

/**
 * Get or create the default CollisionDetector instance.
 */
export function getDefaultCollisionDetector(): CollisionDetector {
  if (!_defaultDetector) {
    _defaultDetector = new CollisionDetector();
  }
  return _defaultDetector;
}
