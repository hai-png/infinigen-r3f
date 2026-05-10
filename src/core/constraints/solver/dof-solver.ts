/**
 * DOF Solver — Enhanced Degrees-of-Freedom Computation with Plane Snapping
 *
 * Ports: infinigen/core/constraints/example_solver/geometry/dof.py
 *
 * Computes remaining DOF given constraint plane normals:
 *  - 0 DOF: 3+ non-parallel planes fully constrain the object
 *  - 1 DOF: Object can slide along a line (2 planes → line of intersection)
 *  - 2 DOF: Object can slide on a surface (1 plane → surface)
 *
 * Enhanced with:
 *  - tryApplyRelationConstraints: Apply all relation constraints for an object
 *  - snapToSurface: Snap an object to a tagged surface with margin
 *  - computeDOFMatrix: Compute remaining degrees of freedom from plane sets
 *  - sampleOnDOF: Sample a valid position within DOF constraints
 *  - checkStability: Center-of-mass stability check
 *  - Alignment to parent plane normals using least-squares
 *  - Translation solving via least-squares for plane offsets
 *  - Stability matrix computation for translation DOF
 *  - Rotation axis constraint computation
 *  - Handles DOF 0 (fully constrained), DOF 1 (2 constraints), DOF 2 (1 constraint)
 */

import * as THREE from 'three';
import { State, ObjectState, RelationState } from '../evaluator/state';
import { Plane } from './planes';
import { PlaneExtractor } from './planes';
import { Polygon2D as Polygon2DUnified } from '../unified/UnifiedConstraintSystem';
import { Polygon2D, Point2D } from '../geometry-2d';
import { SubpartTag, Subparts, tagCanonicalSurfaces, taggedFaceMask } from '../tags/index';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Result of DOF computation.
 */
export interface DOFResult {
  /** Remaining translation degrees of freedom (0, 1, or 2) */
  translationDOF: number;
  /** Remaining rotation degrees of freedom (0 or 1) */
  rotationDOF: number;
  /** Valid translation directions */
  translationAxes: THREE.Vector3[];
  /** Valid rotation axis (if rotationDOF > 0) */
  rotationAxis: THREE.Vector3 | null;
  /** The planes constraining this object */
  constraintPlanes: Plane[];
  /** 2D feasible region on the constraint surface */
  feasibleRegion: Polygon2DUnified | null;
  /** The DOF matrix encoding remaining translation freedom */
  dofMatrix: THREE.Matrix3;
  /** The stability matrix for translation DOF */
  stabilityMatrix: THREE.Matrix3;
}

/**
 * Result of applying relation constraints to an object.
 */
export interface DOFApplicationResult {
  /** Whether the application was successful */
  success: boolean;
  /** The computed position */
  position: THREE.Vector3;
  /** The computed rotation */
  rotation: THREE.Euler;
  /** Remaining DOF after applying constraints */
  remainingDOF: DOFResult;
  /** Error message if unsuccessful */
  error?: string;
}

/**
 * Result of a stability check.
 */
export interface StabilityCheckResult {
  /** Whether the object is stable */
  stable: boolean;
  /** Center of mass position in world space */
  centerOfMass: THREE.Vector3;
  /** Support polygon (2D) on the supporting surface */
  supportPolygon: Polygon2D | null;
  /** Distance from COM projection to support polygon boundary
   *  (negative = outside, positive = inside, 0 = on boundary) */
  comToBoundaryDistance: number;
}

/**
 * Result of a surface snap operation.
 */
export interface SnapResult {
  /** The snapped position */
  position: THREE.Vector3;
  /** The snapped rotation */
  rotation: THREE.Euler;
  /** The plane that was snapped to */
  plane: Plane;
  /** Distance from original position to snapped position */
  snapDistance: number;
}

// ============================================================================
// DOFSolverEnhanced
// ============================================================================

/**
 * Enhanced DOF solver that provides detailed DOF analysis beyond the basic
 * DOFSolver in dof.ts. This class computes DOF results with translation axes,
 * feasible regions, rotation axes, stability checks, and surface snapping.
 *
 * Key enhancements over the basic DOFSolver:
 *  - **Plane snapping**: snapToSurface aligns an object to a tagged surface
 *  - **DOF matrix computation**: computeDOFMatrix gives the full DOF constraint matrix
 *  - **Stability checking**: checkStability verifies center-of-mass support
 *  - **Least-squares alignment**: Aligns object rotation to parent plane normals
 *  - **SA move proposals**: sampleOnDOF generates valid positions for SA moves
 *  - **DOF 0/1/2 handling**: Correct behavior for each constraint level
 */
export class DOFSolverEnhanced {
  private planeExtractor: PlaneExtractor;

  constructor() {
    this.planeExtractor = new PlaneExtractor();
  }

  // ---------------------------------------------------------------------------
  // Core DOF Computation
  // ---------------------------------------------------------------------------

  /**
   * Compute DOF given a set of constraint plane normals.
   *
   * @param constraintNormals Array of plane normals constraining the object
   * @returns DOFResult with translation/rotation DOF and axes
   */
  computeDOF(constraintNormals: THREE.Vector3[]): DOFResult {
    // Deduplicate normals (within tolerance)
    const uniqueNormals = this.deduplicateNormals(constraintNormals);

    if (uniqueNormals.length === 0) {
      // No constraints → 2 translation DOF + 1 rotation DOF
      return {
        translationDOF: 2,
        rotationDOF: 1,
        translationAxes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
        rotationAxis: new THREE.Vector3(0, 1, 0),
        constraintPlanes: [],
        feasibleRegion: null,
        dofMatrix: new THREE.Matrix3(
          1, 0, 0,
          0, 0, 1,
          0, 0, 0
        ),
        stabilityMatrix: new THREE.Matrix3(
          1, 0, 0,
          0, 1, 0,
          0, 0, 0
        ),
      };
    }

    if (uniqueNormals.length === 1) {
      // 1 plane → 2 translation DOF on the surface, 1 rotation DOF around normal
      const n = uniqueNormals[0];
      const [t1, t2] = this.computeTangentVectors(n);

      return {
        translationDOF: 2,
        rotationDOF: 1,
        translationAxes: [t1, t2],
        rotationAxis: n.clone(),
        constraintPlanes: [],
        feasibleRegion: null,
        dofMatrix: new THREE.Matrix3(
          t1.x, t1.y, t1.z,
          t2.x, t2.y, t2.z,
          0, 0, 0
        ),
        stabilityMatrix: new THREE.Matrix3(
          t1.x, t1.y, t1.z,
          t2.x, t2.y, t2.z,
          n.x, n.y, n.z
        ),
      };
    }

    if (uniqueNormals.length === 2) {
      // 2 non-parallel planes → 1 translation DOF along intersection line
      const cross = new THREE.Vector3().crossVectors(uniqueNormals[0], uniqueNormals[1]);
      const crossLen = cross.length();

      if (crossLen < 1e-6) {
        // Parallel planes → same as 1 plane
        const n = uniqueNormals[0];
        const [t1, t2] = this.computeTangentVectors(n);
        return {
          translationDOF: 2,
          rotationDOF: 1,
          translationAxes: [t1, t2],
          rotationAxis: n.clone(),
          constraintPlanes: [],
          feasibleRegion: null,
          dofMatrix: new THREE.Matrix3(
            t1.x, t1.y, t1.z,
            t2.x, t2.y, t2.z,
            0, 0, 0
          ),
          stabilityMatrix: new THREE.Matrix3(
            t1.x, t1.y, t1.z,
            t2.x, t2.y, t2.z,
            n.x, n.y, n.z
          ),
        };
      }

      cross.normalize();

      return {
        translationDOF: 1,
        rotationDOF: 1,
        translationAxes: [cross],
        rotationAxis: cross.clone(),
        constraintPlanes: [],
        feasibleRegion: null,
        dofMatrix: new THREE.Matrix3(
          cross.x, cross.y, cross.z,
          0, 0, 0,
          0, 0, 0
        ),
        stabilityMatrix: new THREE.Matrix3(
          cross.x, cross.y, cross.z,
          uniqueNormals[0].x, uniqueNormals[0].y, uniqueNormals[0].z,
          uniqueNormals[1].x, uniqueNormals[1].y, uniqueNormals[1].z
        ),
      };
    }

    // 3+ non-parallel planes → fully constrained
    return {
      translationDOF: 0,
      rotationDOF: 0,
      translationAxes: [],
      rotationAxis: null,
      constraintPlanes: [],
      feasibleRegion: null,
      dofMatrix: new THREE.Matrix3(),
      stabilityMatrix: new THREE.Matrix3(
        uniqueNormals[0]?.x ?? 0, uniqueNormals[0]?.y ?? 0, uniqueNormals[0]?.z ?? 0,
        uniqueNormals[1]?.x ?? 0, uniqueNormals[1]?.y ?? 0, uniqueNormals[1]?.z ?? 0,
        uniqueNormals[2]?.x ?? 0, uniqueNormals[2]?.y ?? 0, uniqueNormals[2]?.z ?? 0
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // DOF Matrix Computation
  // ---------------------------------------------------------------------------

  /**
   * Compute the DOF matrix from child and parent plane sets.
   *
   * The DOF matrix encodes the remaining degrees of freedom after applying
   * all plane constraints. Each row of the matrix is a basis vector for
   * the remaining translation subspace.
   *
   * @param childPlanes Planes from the child object (contact surfaces)
   * @param parentPlanes Planes from the parent object (support surfaces)
   * @returns DOFResult with full DOF analysis
   */
  computeDOFMatrix(childPlanes: Plane[], parentPlanes: Plane[]): DOFResult {
    // Collect all constraint normals
    const constraintNormals: THREE.Vector3[] = [];

    for (const plane of [...childPlanes, ...parentPlanes]) {
      constraintNormals.push(plane.normal);
    }

    const result = this.computeDOF(constraintNormals);
    result.constraintPlanes = [...childPlanes, ...parentPlanes];
    return result;
  }

  // ---------------------------------------------------------------------------
  // Relation Constraint Application
  // ---------------------------------------------------------------------------

  /**
   * Apply all relation constraints for an object.
   *
   * For each relation, find the matching parent plane, compute object position
   * from parent plane + child tags offset, and project remaining DOF onto
   * valid translation/rotation ranges.
   *
   * @param objectState  The object to place
   * @param relations    The relations constraining this object
   * @param state        The current solver state
   * @returns DOFApplicationResult with computed position/rotation and remaining DOF
   */
  tryApplyRelationConstraints(
    objectState: ObjectState,
    relations: RelationState[],
    state: State
  ): DOFApplicationResult {
    // Collect parent planes from relations
    const parentPlanes: Plane[] = [];
    const constraintNormals: THREE.Vector3[] = [];

    for (const rel of relations) {
      const relType = rel.relation?.constructor?.name ?? (rel.relation as any)?.type;
      if (relType === 'StableAgainst' || relType === 'stable_against' || relType === 'CoPlanar') {
        const targetObj = state.objects.get(rel.targetName);
        if (targetObj?.obj) {
          const planes = this.planeExtractor.extractPlanes(targetObj.obj);
          const plane = rel.parentPlaneIdx !== undefined && rel.parentPlaneIdx < planes.length
            ? planes[rel.parentPlaneIdx]
            : planes.length > 0 ? planes[0] : null;

          if (plane) {
            parentPlanes.push(plane);
            constraintNormals.push(plane.normal);
          }
        }
      }
    }

    if (parentPlanes.length === 0) {
      // No constraints → keep current position
      return {
        success: true,
        position: new THREE.Vector3(objectState.position.x, objectState.position.y, objectState.position.z),
        rotation: new THREE.Euler(objectState.rotation.x, objectState.rotation.y, objectState.rotation.z),
        remainingDOF: this.computeDOF([]),
      };
    }

    // Compute position by intersecting planes
    const position = this.solvePositionFromPlanes(parentPlanes, objectState);

    // Compute rotation from DOF constraints using least-squares alignment
    const rotation = this.solveRotationLeastSquares(parentPlanes, objectState);

    // Compute remaining DOF
    const dof = this.computeDOF(constraintNormals);

    return {
      success: position !== null,
      position: position ?? new THREE.Vector3(objectState.position.x, objectState.position.y, objectState.position.z),
      rotation,
      remainingDOF: { ...dof, constraintPlanes: parentPlanes },
    };
  }

  // ---------------------------------------------------------------------------
  // Surface Snapping
  // ---------------------------------------------------------------------------

  /**
   * Snap an object to a tagged surface.
   *
   * Projects the object's position onto the given plane, adjusting
   * the position so the object is exactly on the plane surface
   * with the specified margin.
   *
   * The margin controls the gap between the object and the surface:
   *  - margin = 0: Object is exactly on the plane
   *  - margin > 0: Object is slightly above the plane
   *  - margin < 0: Object penetrates slightly into the surface
   *
   * @param objectState  The object to snap
   * @param plane        The plane to snap to
   * @param margin       Distance margin from the surface (default 0)
   * @returns SnapResult with the snapped position and rotation
   */
  snapToSurface(
    objectState: ObjectState,
    plane: Plane,
    margin: number = 0
  ): SnapResult {
    const currentPos = new THREE.Vector3(objectState.position.x, objectState.position.y, objectState.position.z);

    // Project onto plane
    const n = plane.normal.clone().normalize();
    const dist = currentPos.dot(n) - plane.distance;

    // Compute offset for object bounding box
    let offset = margin;
    if (objectState.obj) {
      const bbox = new THREE.Box3().setFromObject(objectState.obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      // Add half the object's extent along the plane normal
      offset += size.dot(n) * 0.5;
    }

    const snappedPos = currentPos.clone().sub(n.clone().multiplyScalar(dist - offset));

    // Compute rotation aligned to the plane normal
    const rotation = this.alignToPlaneNormal(plane, objectState);

    return {
      position: snappedPos,
      rotation,
      plane,
      snapDistance: Math.abs(dist),
    };
  }

  // ---------------------------------------------------------------------------
  // DOF Sampling for SA Moves
  // ---------------------------------------------------------------------------

  /**
   * Sample a valid position within DOF constraints.
   *
   * Uses a seeded RNG for deterministic sampling. Generates positions
   * within the DOF subspace defined by the DOF matrix.
   *
   * @param dofMatrix The DOF matrix encoding remaining translation freedom
   * @param rng A seeded random number generator function (0-1 range)
   * @param center The center point to sample around
   * @param spread The maximum offset from the center (default 0.5)
   * @returns A sampled position within DOF constraints
   */
  sampleOnDOF(
    dofMatrix: THREE.Matrix3,
    rng: () => number,
    center: THREE.Vector3,
    spread: number = 0.5
  ): THREE.Vector3 {
    const e = dofMatrix.elements;
    const result = center.clone();

    // Extract DOF basis vectors from the matrix rows
    // Matrix3 elements are column-major
    for (let row = 0; row < 3; row++) {
      const basisVec = new THREE.Vector3(e[row], e[row + 3], e[row + 6]);
      if (basisVec.lengthSq() > 1e-10) {
        const offset = (rng() - 0.5) * spread * 2;
        result.addScaledVector(basisVec.normalize(), offset);
      }
    }

    return result;
  }

  /**
   * Randomly sample a valid position within DOF constraints.
   *
   * Convenience method that uses Math.random() as the RNG.
   *
   * @param objectState  The object to sample a position for
   * @param relations    The relations constraining this object
   * @param state        The current solver state
   * @returns A sampled position within DOF constraints
   */
  applyRelationsSurfaceSample(
    objectState: ObjectState,
    relations: RelationState[],
    state: State
  ): THREE.Vector3 {
    const result = this.tryApplyRelationConstraints(objectState, relations, state);

    if (!result.success || result.remainingDOF.translationDOF === 0) {
      return result.position;
    }

    // Sample within DOF
    const pos = result.position.clone();
    const spread = 0.5;

    for (const axis of result.remainingDOF.translationAxes) {
      const offset = (Math.random() - 0.5) * spread * 2;
      pos.addScaledVector(axis, offset);
    }

    return pos;
  }

  // ---------------------------------------------------------------------------
  // Stability Checking
  // ---------------------------------------------------------------------------

  /**
   * Check center-of-mass stability of an object on a supporter.
   *
   * The object is stable if its center of mass projects onto the
   * support polygon (intersection of the object's and supporter's
   * footprints on the support surface).
   *
   * @param objectState  The object to check stability for
   * @param supporterState  The supporting object
   * @returns StabilityCheckResult with detailed stability analysis
   */
  checkStability(
    objectState: ObjectState,
    supporterState: ObjectState
  ): StabilityCheckResult {
    // Get center of mass (approximated by bounding box center)
    const centerOfMass = objectState.getBBoxCenter();

    // Compute support polygon
    const supportPolygon = this.computeSupportPolygon(objectState, supporterState);

    if (!supportPolygon || supportPolygon.isEmpty) {
      return {
        stable: false,
        centerOfMass,
        supportPolygon,
        comToBoundaryDistance: -Infinity,
      };
    }

    // Project center of mass onto the support surface (XZ plane for floor-like surfaces)
    const comProjection = new Point2D(centerOfMass.x, centerOfMass.z);

    // Check if the projected COM is inside the support polygon
    const inside = supportPolygon.containsPoint(comProjection);

    // Compute distance from COM projection to the nearest boundary
    let comToBoundaryDist = 0;
    if (inside) {
      // Find minimum distance to the polygon boundary
      comToBoundaryDist = this.distanceToPolygonBoundary(comProjection, supportPolygon);
    } else {
      // Negative distance — COM is outside
      comToBoundaryDist = -this.distanceToPolygonBoundary(comProjection, supportPolygon);
    }

    return {
      stable: inside,
      centerOfMass,
      supportPolygon,
      comToBoundaryDistance: comToBoundaryDist,
    };
  }

  /**
   * Compute the support polygon for an object on a supporter.
   *
   * The support polygon is the intersection of the object's footprint
   * and the supporter's footprint, projected onto the support surface.
   *
   * @param objectState  The object being supported
   * @param supporterState  The supporting object
   * @returns The support polygon (2D), or null if no support exists
   */
  computeSupportPolygon(
    objectState: ObjectState,
    supporterState: ObjectState
  ): Polygon2D | null {
    const objBBox = objectState.obj
      ? new THREE.Box3().setFromObject(objectState.obj)
      : null;
    const supBBox = supporterState.obj
      ? new THREE.Box3().setFromObject(supporterState.obj)
      : null;

    if (!objBBox || !supBBox) return null;

    // Create 2D footprints from bounding boxes (XZ plane projection)
    const objFootprint = Polygon2D.fromBoundingBox(objBBox);
    const supFootprint = Polygon2D.fromBoundingBox(supBBox);

    // Compute intersection
    return objFootprint.intersection(supFootprint);
  }

  // ---------------------------------------------------------------------------
  // Rotation Alignment
  // ---------------------------------------------------------------------------

  /**
   * Align object rotation to parent plane normals using least-squares.
   *
   * Computes the rotation that best aligns the child's up-vector to the
   * combined constraint from all parent plane normals. This uses a
   * least-squares approach: finds the rotation that minimizes the sum
   * of squared angles between the child's local axes and the parent planes.
   *
   * @param parentPlanes The parent planes to align to
   * @param objectState  The object whose rotation to compute
   * @returns The computed Euler rotation
   */
  solveRotationLeastSquares(
    parentPlanes: Plane[],
    objectState: ObjectState
  ): THREE.Euler {
    if (parentPlanes.length === 0) {
      return new THREE.Euler(objectState.rotation.x, objectState.rotation.y, objectState.rotation.z);
    }

    if (parentPlanes.length === 1) {
      // Single plane: align up to the plane normal
      return this.alignToPlaneNormal(parentPlanes[0], objectState);
    }

    // Multiple planes: use least-squares to find the best rotation
    // that satisfies all constraints simultaneously
    //
    // We find the rotation R that minimizes:
    //   sum_i || R * up - n_i ||^2
    //
    // where up is the object's local up vector and n_i are the parent normals.

    // Average the parent normals (weighted by plane area if available)
    const avgNormal = new THREE.Vector3(0, 0, 0);
    for (const plane of parentPlanes) {
      avgNormal.add(plane.normal);
    }
    avgNormal.normalize();

    // If the average is degenerate, fall back to first plane
    if (avgNormal.lengthSq() < 1e-10 && parentPlanes.length > 0) {
      return this.alignToPlaneNormal(parentPlanes[0], objectState);
    }

    // Compute rotation from Y-axis to the average normal
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, avgNormal);

    // Combine with current yaw
    const currentYaw = objectState.yaw ?? objectState.rotation.y;
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), currentYaw);

    const combined = new THREE.Quaternion().multiplyQuaternions(quaternion, yawQuat);
    return new THREE.Euler().setFromQuaternion(combined);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Deduplicate normals within tolerance.
   */
  private deduplicateNormals(normals: THREE.Vector3[]): THREE.Vector3[] {
    const result: THREE.Vector3[] = [];
    const TOLERANCE = 1e-4;

    for (const n of normals) {
      const normalized = n.clone().normalize();
      let isDuplicate = false;

      for (const existing of result) {
        if (Math.abs(normalized.dot(existing)) > 1 - TOLERANCE) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        result.push(normalized);
      }
    }

    return result;
  }

  /**
   * Compute two orthogonal tangent vectors in the plane defined by normal n.
   */
  private computeTangentVectors(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
    const t1 = new THREE.Vector3();
    if (Math.abs(n.x) < 0.9) {
      t1.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      t1.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    }
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    return [t1, t2];
  }

  /**
   * Solve for position by intersecting parent planes.
   */
  private solvePositionFromPlanes(
    planes: Plane[],
    objState: ObjectState
  ): THREE.Vector3 | null {
    if (planes.length === 1) {
      // Project current position onto the plane
      const current = new THREE.Vector3(objState.position.x, objState.position.y, objState.position.z);
      const n = planes[0].normal.clone().normalize();
      const d = planes[0].distance;
      const dist = current.dot(n) - d;
      return current.clone().sub(n.multiplyScalar(dist));
    }

    if (planes.length === 2) {
      // Intersect two planes → a line; project current position onto the line
      const n1 = planes[0].normal.clone().normalize();
      const n2 = planes[1].normal.clone().normalize();
      const direction = new THREE.Vector3().crossVectors(n1, n2);

      if (direction.lengthSq() < 1e-10) return null;
      direction.normalize();

      // Find a point on the line
      const d1 = planes[0].distance;
      const d2 = planes[1].distance;
      const denom = direction.lengthSq();
      const origin = new THREE.Vector3()
        .addScaledVector(n2, d1)
        .sub(n1.clone().multiplyScalar(d2))
        .cross(direction)
        .divideScalar(denom);

      // Project current position onto the line
      const current = new THREE.Vector3(objState.position.x, objState.position.y, objState.position.z);
      const v = current.clone().sub(origin);
      const t = v.dot(direction);
      return origin.clone().addScaledVector(direction, t);
    }

    if (planes.length >= 3) {
      // Intersect three planes → a point
      const n1 = planes[0].normal.clone().normalize();
      const n2 = planes[1].normal.clone().normalize();
      const n3 = planes[2].normal.clone().normalize();

      const denom = new THREE.Vector3().crossVectors(n1, n2).dot(n3);
      if (Math.abs(denom) < 1e-10) return null;

      return new THREE.Vector3()
        .addScaledVector(new THREE.Vector3().crossVectors(n2, n3), planes[0].distance)
        .addScaledVector(new THREE.Vector3().crossVectors(n3, n1), planes[1].distance)
        .addScaledVector(new THREE.Vector3().crossVectors(n1, n2), planes[2].distance)
        .divideScalar(denom);
    }

    return null;
  }

  /**
   * Align rotation to a plane normal.
   *
   * Rotates the object so its local up-axis (Y) aligns with the plane normal.
   */
  private alignToPlaneNormal(plane: Plane, objState: ObjectState): THREE.Euler {
    const n = plane.normal.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, n);

    // Combine with current yaw
    const currentYaw = objState.yaw ?? objState.rotation.y;
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(n, currentYaw);

    const combined = new THREE.Quaternion().multiplyQuaternions(quaternion, yawQuat);
    return new THREE.Euler().setFromQuaternion(combined);
  }

  /**
   * Compute the distance from a point to the nearest edge of a polygon.
   *
   * Used for stability checking to determine how far the center of mass
   * is from the support polygon boundary.
   */
  private distanceToPolygonBoundary(point: Point2D, polygon: Polygon2D): number {
    let minDist = Infinity;
    const n = polygon.vertices.length;

    for (let i = 0; i < n; i++) {
      const a = polygon.vertices[i];
      const b = polygon.vertices[(i + 1) % n];

      // Distance from point to line segment ab
      const dist = this.pointToSegmentDistance(point, a, b);
      minDist = Math.min(minDist, dist);
    }

    return minDist;
  }

  /**
   * Compute the distance from a point to a line segment.
   */
  private pointToSegmentDistance(
    point: Point2D,
    a: Point2D,
    b: Point2D
  ): number {
    const ab = new Point2D(b.x - a.x, b.y - a.y);
    const ap = new Point2D(point.x - a.x, point.y - a.y);

    const abLenSq = ab.lengthSq();
    if (abLenSq < 1e-10) return ap.length();

    // Project point onto line
    let t = ap.dot(ab) / abLenSq;
    t = Math.max(0, Math.min(1, t));

    const closest = new Point2D(
      a.x + t * ab.x,
      a.y + t * ab.y
    );

    return point.distanceTo(closest);
  }
}
