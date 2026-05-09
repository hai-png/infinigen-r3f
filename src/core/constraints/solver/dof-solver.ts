/**
 * DOF Solver — Enhanced Degrees-of-Freedom Computation
 *
 * Ports: infinigen/core/constraints/example_solver/geometry/dof.py
 *
 * Computes remaining DOF given constraint plane normals:
 *  - 0 DOF: 3+ non-parallel planes fully constrain the object
 *  - 1 DOF: Object can slide along a line (2 planes → line of intersection)
 *  - 2 DOF: Object can slide on a surface (1 plane → surface)
 *
 * Also provides methods for applying relation constraints and surface sampling.
 */

import * as THREE from 'three';
import { State, ObjectState, RelationState } from '../evaluator/state';
import { Plane } from './planes';
import { PlaneExtractor } from './planes';
import { Polygon2D } from '../unified/UnifiedConstraintSystem';

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
  feasibleRegion: Polygon2D | null;
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

// ============================================================================
// DOFSolverEnhanced
// ============================================================================

/**
 * Enhanced DOF solver that provides detailed DOF analysis beyond the basic
 * DOFSolver in dof.ts. This class computes DOF results with translation axes,
 * feasible regions, and rotation axes.
 */
export class DOFSolverEnhanced {
  private planeExtractor: PlaneExtractor;

  constructor() {
    this.planeExtractor = new PlaneExtractor();
  }

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
        };
      }

      cross.normalize();

      // Rotation DOF: if the two normals are in the same plane as the cross product,
      // rotation around the cross product is still free
      return {
        translationDOF: 1,
        rotationDOF: 1,
        translationAxes: [cross],
        rotationAxis: cross.clone(),
        constraintPlanes: [],
        feasibleRegion: null,
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
    };
  }

  /**
   * Apply relation constraints to place an object.
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

    // Compute rotation from DOF constraints
    const dof = this.computeDOF(constraintNormals);
    const rotation = this.solveRotationFromDOF(dof, objectState);

    return {
      success: position !== null,
      position: position ?? new THREE.Vector3(objectState.position.x, objectState.position.y, objectState.position.z),
      rotation: rotation,
      remainingDOF: { ...dof, constraintPlanes: parentPlanes },
    };
  }

  /**
   * Randomly sample a valid position within DOF constraints.
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
   * Solve for rotation given DOF constraints.
   */
  private solveRotationFromDOF(dof: DOFResult, objState: ObjectState): THREE.Euler {
    const currentYaw = objState.yaw ?? objState.rotation.y;

    if (dof.rotationDOF === 0) {
      // Fully constrained — keep current
      return new THREE.Euler(objState.rotation.x, currentYaw, objState.rotation.z);
    }

    if (dof.rotationAxis) {
      // Free rotation around axis
      const randomAngle = Math.random() * Math.PI * 2;
      const axis = dof.rotationAxis;

      if (Math.abs(axis.y) > 0.9) {
        return new THREE.Euler(0, randomAngle, 0);
      } else if (Math.abs(axis.x) > 0.9) {
        return new THREE.Euler(randomAngle, 0, 0);
      } else if (Math.abs(axis.z) > 0.9) {
        return new THREE.Euler(0, 0, randomAngle);
      }

      const q = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), randomAngle);
      return new THREE.Euler().setFromQuaternion(q);
    }

    // No rotation axis specified — keep current
    return new THREE.Euler(objState.rotation.x, currentYaw, objState.rotation.z);
  }
}
