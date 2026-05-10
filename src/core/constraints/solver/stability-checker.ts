/**
 * Stability Checker — Enhanced with Surface Snapping and COM Analysis
 *
 * Ports: infinigen/core/constraints/example_solver/geometry/stability.py
 *
 * Provides methods for:
 *  - stableAgainst(): Check if child is stably against parent
 *  - coplanar(): Check coplanarity
 *  - snapAgainst(): Snap child to parent plane with margin
 *  - moveObjRandomPt(): Move object to random point on parent plane
 *  - checkCenterOfMassStability(): COM within support polygon
 *  - computeSupportPolygon(): Intersection of projected footprints
 *  - snapToSurface(): Snap object to a specific tagged surface
 */

import * as THREE from 'three';
import { State, ObjectState, RelationState } from '../evaluator/state';
import { Plane } from './planes';
import { PlaneExtractor } from './planes';
import { TagSet as UnifiedTagSet } from '../unified/UnifiedConstraintSystem';
import { Polygon2D, Point2D } from '../geometry-2d';
import { SubpartTag, Subparts, tagCanonicalSurfaces, taggedFaceMask } from '../tags/index';

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

/**
 * Result of a center-of-mass stability check.
 */
export interface COMStabilityResult {
  /** Whether the center of mass is within the support polygon */
  stable: boolean;
  /** Center of mass position in world space */
  centerOfMass: THREE.Vector3;
  /** The support polygon (2D footprint intersection) */
  supportPolygon: Polygon2D | null;
  /** Distance from COM projection to the nearest support polygon edge.
   *  Positive = inside, negative = outside */
  comMargin: number;
  /** The overhang ratio (0 = fully supported, 1 = no support) */
  overhangRatio: number;
}

// ============================================================================
// EnhancedStabilityChecker
// ============================================================================

/**
 * Enhanced stability checker that provides detailed stability results
 * with violation amounts, COM analysis, support polygon computation,
 * and surface snapping.
 *
 * This matches the original Infinigen's stability.py API more closely
 * and adds center-of-mass stability checking and support polygon analysis.
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

  // ---------------------------------------------------------------------------
  // Core Stability Checks
  // ---------------------------------------------------------------------------

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
    childTags: UnifiedTagSet,
    parentTags: UnifiedTagSet,
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
        const normalAlignment = Math.abs((-normalDot + 1) / 2);

        // Check 2: Contact distance
        const childCenter = new THREE.Vector3(childObj.position.x, childObj.position.y, childObj.position.z);

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
    tags1: UnifiedTagSet,
    tags2: UnifiedTagSet,
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

  // ---------------------------------------------------------------------------
  // Surface Snapping
  // ---------------------------------------------------------------------------

  /**
   * Snap a child object to a parent plane.
   *
   * Projects the child's position onto the parent plane, adjusting
   * the position so the child is exactly on the plane surface with
   * the specified margin.
   *
   * @param childObj     The child object to snap
   * @param parentPlane  The parent plane to snap to
   * @param childPlane   The child's contact plane (for computing offset)
   * @param margin       Distance margin from the surface (default 0)
   * @returns The new position for the child
   */
  snapAgainst(
    childObj: ObjectState,
    parentPlane: Plane,
    childPlane: Plane,
    margin: number = 0
  ): THREE.Vector3 {
    const currentPos = new THREE.Vector3(childObj.position.x, childObj.position.y, childObj.position.z);

    // Project onto parent plane
    const parentNormal = parentPlane.normal.clone().normalize();
    const dist = currentPos.dot(parentNormal) - parentPlane.distance;

    // Compute offset for child bounding box + margin
    let offset = margin;
    if (childObj.obj) {
      const bbox = new THREE.Box3().setFromObject(childObj.obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      // The offset is half the child's extent along the parent normal direction
      offset += size.dot(parentNormal) * 0.5;
    }

    return currentPos.clone().sub(parentNormal.multiplyScalar(dist - offset));
  }

  /**
   * Snap an object to a tagged surface on a parent.
   *
   * Uses the tag system to identify the contact surface on both
   * the child and parent objects, then snaps the child to that surface.
   *
   * @param childObj     The child object to snap
   * @param parentObj    The parent object to snap to
   * @param childTags    Tags identifying the child's contact surface
   * @param parentTags   Tags identifying the parent's contact surface
   * @param margin       Distance margin from the surface
   * @returns The new position for the child, or null if no matching surface found
   */
  snapToSurface(
    childObj: ObjectState,
    parentObj: ObjectState,
    childTags: UnifiedTagSet,
    parentTags: UnifiedTagSet,
    margin: number = 0
  ): THREE.Vector3 | null {
    const childPlanes = childObj.obj ? this.planeExtractor.extractPlanes(childObj.obj) : [];
    const parentPlanes = parentObj.obj ? this.planeExtractor.extractPlanes(parentObj.obj) : [];

    const filteredChild = this.filterPlanesByTags(childPlanes, childTags);
    const filteredParent = this.filterPlanesByTags(parentPlanes, parentTags);

    if (filteredChild.length === 0 || filteredParent.length === 0) return null;

    // Find the best parent plane (closest to the child)
    let bestParentPlane: Plane | null = null;
    let bestChildPlane: Plane | null = null;
    let bestAlignment = -1;

    for (const childPlane of filteredChild) {
      for (const parentPlane of filteredParent) {
        const alignment = Math.abs(childPlane.normal.dot(parentPlane.normal));
        if (alignment > bestAlignment) {
          bestAlignment = alignment;
          bestChildPlane = childPlane;
          bestParentPlane = parentPlane;
        }
      }
    }

    if (!bestParentPlane || !bestChildPlane) return null;

    return this.snapAgainst(childObj, bestParentPlane, bestChildPlane, margin);
  }

  // ---------------------------------------------------------------------------
  // Center-of-Mass Stability
  // ---------------------------------------------------------------------------

  /**
   * Check center-of-mass stability of an object on a supporter.
   *
   * The object is stable if its center of mass projects onto the
   * support polygon (intersection of the object's and supporter's
   * footprints projected onto the support surface).
   *
   * This is a more rigorous check than the basic stableAgainst,
   * as it considers the actual geometric overlap rather than just
   * bounding box proximity.
   *
   * @param object     The object to check stability for
   * @param supporter  The supporting object
   * @returns COMStabilityResult with detailed stability analysis
   */
  checkCenterOfMassStability(
    object: ObjectState,
    supporter: ObjectState
  ): COMStabilityResult {
    // Get center of mass (approximated by bounding box center)
    const centerOfMass = object.getBBoxCenter();

    // Compute support polygon
    const supportPolygon = this.computeSupportPolygon(object, supporter);

    if (!supportPolygon || supportPolygon.isEmpty) {
      return {
        stable: false,
        centerOfMass,
        supportPolygon,
        comMargin: -Infinity,
        overhangRatio: 1,
      };
    }

    // Project center of mass onto the support surface (XZ plane for floor-like surfaces)
    const comProjection = new Point2D(centerOfMass.x, centerOfMass.z);

    // Check if the projected COM is inside the support polygon
    const inside = supportPolygon.containsPoint(comProjection);

    // Compute overhang ratio
    const objectFootprint = object.obj
      ? Polygon2D.fromBoundingBox(new THREE.Box3().setFromObject(object.obj))
      : null;

    let overhangRatio = 0;
    if (objectFootprint && !objectFootprint.isEmpty) {
      const objectArea = objectFootprint.area();
      if (objectArea > 1e-10) {
        const supportArea = supportPolygon.area();
        const overlapArea = Math.min(objectArea, supportArea);
        overhangRatio = 1 - (overlapArea / objectArea);
      }
    }

    // Compute distance from COM to nearest boundary
    let comMargin = 0;
    if (inside) {
      comMargin = this.distanceToPolygonBoundary(comProjection, supportPolygon);
    } else {
      comMargin = -this.distanceToPolygonBoundary(comProjection, supportPolygon);
    }

    return {
      stable: inside,
      centerOfMass,
      supportPolygon,
      comMargin,
      overhangRatio,
    };
  }

  /**
   * Compute the support polygon for an object on a supporter.
   *
   * The support polygon is the intersection of the object's footprint
   * and the supporter's footprint, projected onto the support surface
   * (XZ plane for floor-like surfaces, or the appropriate plane for
   * wall-mounted objects).
   *
   * @param object     The object being supported
   * @param supporter  The supporting object
   * @returns The support polygon (2D), or null if no support exists
   */
  computeSupportPolygon(
    object: ObjectState,
    supporter: ObjectState
  ): Polygon2D | null {
    const objBBox = object.obj
      ? new THREE.Box3().setFromObject(object.obj)
      : null;
    const supBBox = supporter.obj
      ? new THREE.Box3().setFromObject(supporter.obj)
      : null;

    if (!objBBox || !supBBox) return null;

    // Create 2D footprints from bounding boxes (XZ plane projection)
    const objFootprint = Polygon2D.fromBoundingBox(objBBox);
    const supFootprint = Polygon2D.fromBoundingBox(supBBox);

    // Check if bounding boxes overlap vertically
    if (Math.abs(objBBox.min.y - supBBox.max.y) > 0.2) {
      // Not in vertical contact
      return null;
    }

    // Compute intersection of footprints
    return objFootprint.intersection(supFootprint);
  }

  // ---------------------------------------------------------------------------
  // Random Point Sampling
  // ---------------------------------------------------------------------------

  /**
   * Move an object to a random point on a parent plane.
   *
   * Samples a random point on the parent plane within a reasonable
   * region around the parent's bounding box, using a seeded RNG
   * for deterministic results.
   *
   * @param obj          The object to move
   * @param parentPlane  The parent plane to move to
   * @param childTags    Tags identifying the child's contact surface
   * @param rng          Seeded random number generator (0-1 range), defaults to Math.random
   * @returns A random position on the parent plane
   */
  moveObjRandomPoint(
    obj: ObjectState,
    parentPlane: Plane,
    childTags: UnifiedTagSet,
    rng: () => number = Math.random
  ): THREE.Vector3 {
    // Start with the snapped position
    const childPlane: Plane = {
      normal: parentPlane.normal.clone().negate(),
      distance: 0,
      tag: '',
    };
    const snapped = this.snapAgainst(obj, parentPlane, childPlane);

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
    const offset = t1.multiplyScalar((rng() - 0.5) * spread * 2)
      .add(t2.multiplyScalar((rng() - 0.5) * spread * 2));

    return snapped.add(offset);
  }

  /**
   * Alias for moveObjRandomPoint (backward compatibility).
   */
  moveObjRandomPt(
    obj: ObjectState,
    parentPlane: Plane,
    childTags: UnifiedTagSet
  ): THREE.Vector3 {
    return this.moveObjRandomPoint(obj, parentPlane, childTags);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Filter planes by tags.
   */
  private filterPlanesByTags(planes: Plane[], tags: UnifiedTagSet): Plane[] {
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

    const contactDistance = verticalGap;
    const normalAlignment = childPos.y > parentPos.y ? 1 : 0;

    return {
      stable: contactWithinMargin,
      violation: contactWithinMargin ? 0 : verticalGap - margin,
      details: {
        normalsAntiParallel: childPos.y > parentPos.y,
        contactWithinMargin,
        noOverhang: true,
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
      const childArea = (childBBox.max.x - childBBox.min.x) * (childBBox.max.z - childBBox.min.z);
      if (childArea < 1e-10) return 0;

      const overlapX = Math.max(0, Math.min(childBBox.max.x, parentBBox.max.x) - Math.max(childBBox.min.x, parentBBox.min.x));
      const overlapZ = Math.max(0, Math.min(childBBox.max.z, parentBBox.max.z) - Math.max(childBBox.min.z, parentBBox.min.z));
      const overlapArea = overlapX * overlapZ;

      const supportRatio = overlapArea / childArea;
      return 1 - supportRatio;
    }

    // For wall-like surfaces (normal ≈ horizontal), check overlap along the wall
    const childCenter = childBBox.getCenter(new THREE.Vector3());
    const isInside = parentBBox.containsPoint(childCenter);
    return isInside ? 0 : 0.5;
  }

  /**
   * Compute the distance from a 2D point to the nearest edge of a polygon.
   */
  private distanceToPolygonBoundary(point: Point2D, polygon: Polygon2D): number {
    let minDist = Infinity;
    const n = polygon.vertices.length;

    for (let i = 0; i < n; i++) {
      const a = polygon.vertices[i];
      const b = polygon.vertices[(i + 1) % n];
      const dist = this.pointToSegmentDistance(point, a, b);
      minDist = Math.min(minDist, dist);
    }

    return minDist;
  }

  /**
   * Compute the distance from a 2D point to a line segment.
   */
  private pointToSegmentDistance(point: Point2D, a: Point2D, b: Point2D): number {
    const ab = new Point2D(b.x - a.x, b.y - a.y);
    const ap = new Point2D(point.x - a.x, point.y - a.y);

    const abLenSq = ab.lengthSq();
    if (abLenSq < 1e-10) return ap.length();

    let t = ap.dot(ab) / abLenSq;
    t = Math.max(0, Math.min(1, t));

    const closest = new Point2D(a.x + t * ab.x, a.y + t * ab.y);
    return point.distanceTo(closest);
  }
}
