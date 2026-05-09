/**
 * Stability Checker — Enhanced
 *
 * Ports: infinigen/core/constraints/example_solver/geometry/stability.py
 *
 * Provides methods for:
 *  - stableAgainst(): Check if child is stably against parent
 *  - coplanar(): Check coplanarity
 *  - snapAgainst(): Snap child to parent plane
 *  - moveObjRandomPt(): Move object to random point on parent plane
 */

import * as THREE from 'three';
import { State, ObjectState, RelationState } from '../evaluator/state';
import { Plane } from './planes';
import { PlaneExtractor } from './planes';
import { TagSet } from '../unified/UnifiedConstraintSystem';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Result of a stability check.
 */
export interface StabilityResult {
  /** Whether the stability condition is satisfied */
  stable: boolean;
  /** Violation amount (0 = fully stable, higher = more violated) */
  violation: number;
  /** Detailed breakdown of the check */
  details: {
    /** Whether normals are anti-parallel (within tolerance) */
    normalsAntiParallel: boolean;
    /** Whether the contact distance is within margin */
    contactWithinMargin: boolean;
    /** Whether the child's projection doesn't overhang */
    noOverhang: boolean;
    /** The computed normal alignment (1 = perfect, 0 = perpendicular) */
    normalAlignment: number;
    /** The computed contact distance */
    contactDistance: number;
    /** The overhang ratio (0 = no overhang, 1 = full overhang) */
    overhangRatio: number;
  };
}

// ============================================================================
// EnhancedStabilityChecker
// ============================================================================

/**
 * Enhanced stability checker that provides detailed stability results
 * with violation amounts, rather than just boolean pass/fail.
 *
 * This matches the original Infinigen's stability.py API more closely.
 */
export class EnhancedStabilityChecker {
  private planeExtractor: PlaneExtractor;

  /** Tolerance for considering normals anti-parallel */
  static readonly ANTI_PARALLEL_TOL = 0.15;

  /** Default margin for contact distance */
  static readonly DEFAULT_MARGIN = 0.05;

  /** Maximum overhang ratio allowed (0.5 = up to 50% overhang) */
  static readonly OVERHANG_RATIO = 0.5;

  constructor() {
    this.planeExtractor = new PlaneExtractor();
  }

  /**
   * Check if a child object is stably against a parent object.
   *
   * Checks:
   *  1. Normals are anti-parallel (within tolerance)
   *  2. Contact distance is within margin
   *  3. Child's projection onto parent plane doesn't overhang excessively
   *
   * @param childObj    The child object state
   * @param parentObj   The parent object state
   * @param childTags   Tags identifying the child's contact surface
   * @param parentTags  Tags identifying the parent's contact surface
   * @param margin      Maximum allowed gap between child and parent
   * @returns StabilityResult with detailed breakdown
   */
  stableAgainst(
    childObj: ObjectState,
    parentObj: ObjectState,
    childTags: TagSet,
    parentTags: TagSet,
    margin: number = EnhancedStabilityChecker.DEFAULT_MARGIN
  ): StabilityResult {
    // Extract planes from both objects
    const childPlanes = childObj.obj ? this.planeExtractor.extractPlanes(childObj.obj) : [];
    const parentPlanes = parentObj.obj ? this.planeExtractor.extractPlanes(parentObj.obj) : [];

    // Find the best matching parent plane (filtered by parentTags)
    const filteredParentPlanes = this.filterPlanesByTags(parentPlanes, parentTags);
    const filteredChildPlanes = this.filterPlanesByTags(childPlanes, childTags);

    if (filteredParentPlanes.length === 0 || filteredChildPlanes.length === 0) {
      // No tagged planes available — fall back to bounding box check
      return this.stableAgainstBBox(childObj, parentObj, margin);
    }

    // Find the best pair of child/parent planes
    let bestNormalAlignment = 0;
    let bestContactDistance = Infinity;
    let bestOverhangRatio = 0;
    let bestChildPlane: Plane | null = null;
    let bestParentPlane: Plane | null = null;

    for (const childPlane of filteredChildPlanes) {
      for (const parentPlane of filteredParentPlanes) {
        // Check 1: Normals should be anti-parallel (for stable placement)
        const normalDot = childPlane.normal.dot(parentPlane.normal);
        const normalAlignment = Math.abs((-normalDot + 1) / 2); // Map [-1,1] to [0,1], -1 = anti-parallel

        // Check 2: Contact distance
        const childCenter = new THREE.Vector3(childObj.position.x, childObj.position.y, childObj.position.z);
        const parentCenter = new THREE.Vector3(parentObj.position.x, parentObj.position.y, parentObj.position.z);

        // Distance from child to parent plane
        const childDistToParent = Math.abs(childCenter.dot(parentPlane.normal) - parentPlane.distance);

        // Check 3: Overhang
        const overhangRatio = this.computeOverhangRatio(childObj, parentPlane, parentObj);

        if (normalAlignment > bestNormalAlignment ||
            (normalAlignment === bestNormalAlignment && childDistToParent < bestContactDistance)) {
          bestNormalAlignment = normalAlignment;
          bestContactDistance = childDistToParent;
          bestOverhangRatio = overhangRatio;
          bestChildPlane = childPlane;
          bestParentPlane = parentPlane;
        }
      }
    }

    const normalsAntiParallel = bestNormalAlignment > (1 - EnhancedStabilityChecker.ANTI_PARALLEL_TOL);
    const contactWithinMargin = bestContactDistance <= margin;
    const noOverhang = bestOverhangRatio <= EnhancedStabilityChecker.OVERHANG_RATIO;

    const stable = normalsAntiParallel && contactWithinMargin && noOverhang;

    // Compute violation amount
    let violation = 0;
    if (!normalsAntiParallel) violation += (1 - bestNormalAlignment) * 2;
    if (!contactWithinMargin) violation += bestContactDistance - margin;
    if (!noOverhang) violation += bestOverhangRatio;

    return {
      stable,
      violation,
      details: {
        normalsAntiParallel,
        contactWithinMargin,
        noOverhang,
        normalAlignment: bestNormalAlignment,
        contactDistance: bestContactDistance,
        overhangRatio: bestOverhangRatio,
      },
    };
  }

  /**
   * Check if two objects are coplanar.
   *
   * Two objects are coplanar if they share a plane with:
   *  - Parallel normals (within tolerance)
   *  - Same distance from origin (within tolerance)
   *
   * @param obj1     First object
   * @param obj2     Second object
   * @param tags1    Tags for the first object's surface
   * @param tags2    Tags for the second object's surface
   * @param margin   Tolerance for distance comparison
   * @returns true if the objects are coplanar
   */
  coplanar(
    obj1: ObjectState,
    obj2: ObjectState,
    tags1: TagSet,
    tags2: TagSet,
    margin: number = 0.1
  ): boolean {
    const planes1 = obj1.obj ? this.planeExtractor.extractPlanes(obj1.obj) : [];
    const planes2 = obj2.obj ? this.planeExtractor.extractPlanes(obj2.obj) : [];

    const filtered1 = this.filterPlanesByTags(planes1, tags1);
    const filtered2 = this.filterPlanesByTags(planes2, tags2);

    for (const p1 of filtered1) {
      for (const p2 of filtered2) {
        const normalDot = p1.normal.dot(p2.normal);
        const isParallel = Math.abs(Math.abs(normalDot) - 1) < PlaneExtractor.COPLANAR_NORMAL_TOL;
        const isSameDistance = Math.abs(p1.distance - p2.distance) < margin;

        if (isParallel && isSameDistance) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Snap a child object to a parent plane.
   *
   * Projects the child's position onto the parent plane, adjusting
   * the position so the child is exactly on the plane surface.
   *
   * @param childObj     The child object to snap
   * @param parentPlane  The parent plane to snap to
   * @param childTags    Tags identifying the child's contact surface
   * @returns The new position for the child
   */
  snapAgainst(
    childObj: ObjectState,
    parentPlane: Plane,
    childTags: TagSet
  ): THREE.Vector3 {
    const currentPos = new THREE.Vector3(childObj.position.x, childObj.position.y, childObj.position.z);

    // Project onto parent plane
    const n = parentPlane.normal.clone().normalize();
    const dist = currentPos.dot(n) - parentPlane.distance;

    // Offset by child's bounding box half-height in the normal direction
    let offset = 0;
    if (childObj.obj) {
      const bbox = new THREE.Box3().setFromObject(childObj.obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      // The offset is half the child's extent along the parent normal
      offset = size.dot(n) * 0.5;
    }

    return currentPos.clone().sub(n.multiplyScalar(dist + offset));
  }

  /**
   * Move an object to a random point on a parent plane.
   *
   * Samples a random point on the parent plane within a reasonable
   * region around the parent's bounding box.
   *
   * @param obj          The object to move
   * @param parentPlane  The parent plane to move to
   * @param childTags    Tags identifying the child's contact surface
   * @returns A random position on the parent plane
   */
  moveObjRandomPt(
    obj: ObjectState,
    parentPlane: Plane,
    childTags: TagSet
  ): THREE.Vector3 {
    // Start with the snapped position
    const snapped = this.snapAgainst(obj, parentPlane, childTags);

    // Add a random offset within the tangent plane
    const n = parentPlane.normal.clone().normalize();

    let t1 = new THREE.Vector3();
    if (Math.abs(n.x) < 0.9) {
      t1.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      t1.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    }
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();

    const spread = 0.5;
    const offset = t1.multiplyScalar((Math.random() - 0.5) * spread * 2)
      .add(t2.multiplyScalar((Math.random() - 0.5) * spread * 2));

    return snapped.add(offset);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Filter planes by tags.
   */
  private filterPlanesByTags(planes: Plane[], tags: TagSet): Plane[] {
    if (tags.size === 0) return planes;

    return planes.filter(plane => {
      for (const tag of tags) {
        if (tag.name === plane.tag || tag.name.toLowerCase() === plane.tag.toLowerCase()) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Fallback stability check using bounding boxes (when no plane data is available).
   */
  private stableAgainstBBox(
    childObj: ObjectState,
    parentObj: ObjectState,
    margin: number
  ): StabilityResult {
    const childPos = new THREE.Vector3(childObj.position.x, childObj.position.y, childObj.position.z);
    const parentPos = new THREE.Vector3(parentObj.position.x, parentObj.position.y, parentObj.position.z);

    // Simple vertical proximity check
    const verticalGap = Math.abs(childPos.y - parentPos.y);
    const contactWithinMargin = verticalGap <= margin;

    // Simple XZ overlap check
    const noOverhang = true; // Can't compute without proper geometry

    const contactDistance = verticalGap;
    const normalAlignment = childPos.y > parentPos.y ? 1 : 0;

    return {
      stable: contactWithinMargin,
      violation: contactWithinMargin ? 0 : verticalGap - margin,
      details: {
        normalsAntiParallel: childPos.y > parentPos.y,
        contactWithinMargin,
        noOverhang,
        normalAlignment,
        contactDistance,
        overhangRatio: 0,
      },
    };
  }

  /**
   * Compute the overhang ratio of a child object on a parent plane.
   *
   * The overhang ratio is the fraction of the child's footprint that
   * extends beyond the parent's surface. A ratio of 0 means no overhang;
   * a ratio of 1 means complete overhang (unstable).
   */
  private computeOverhangRatio(
    childObj: ObjectState,
    parentPlane: Plane,
    parentObj: ObjectState
  ): number {
    if (!childObj.obj || !parentObj.obj) return 0;

    // Get child and parent bounding boxes
    const childBBox = new THREE.Box3().setFromObject(childObj.obj);
    const parentBBox = new THREE.Box3().setFromObject(parentObj.obj);

    // Project both bounding boxes onto the parent plane's tangent space
    const n = parentPlane.normal.clone().normalize();

    // For floor-like surfaces (normal ≈ up), check XZ overlap
    if (Math.abs(n.y) > 0.9) {
      const childMinXZ = { x: childBBox.min.x, z: childBBox.min.z };
      const childMaxXZ = { x: childBBox.max.x, z: childBBox.max.z };
      const parentMinXZ = { x: parentBBox.min.x, z: parentBBox.min.z };
      const parentMaxXZ = { x: parentBBox.max.x, z: parentBBox.max.z };

      const childArea = (childMaxXZ.x - childMinXZ.x) * (childMaxXZ.z - childMinXZ.z);
      if (childArea < 1e-10) return 0;

      const overlapX = Math.max(0, Math.min(childMaxXZ.x, parentMaxXZ.x) - Math.max(childMinXZ.x, parentMinXZ.x));
      const overlapZ = Math.max(0, Math.min(childMaxXZ.z, parentMaxXZ.z) - Math.max(childMinXZ.z, parentMinXZ.z));
      const overlapArea = overlapX * overlapZ;

      const supportRatio = overlapArea / childArea;
      return 1 - supportRatio; // overhang = 1 - support
    }

    // For wall-like surfaces (normal ≈ horizontal), check overlap along the wall
    // Simplified: check if child center is within parent bounds
    const childCenter = childBBox.getCenter(new THREE.Vector3());
    const isInside = parentBBox.containsPoint(childCenter);
    return isInside ? 0 : 0.5;
  }
}
