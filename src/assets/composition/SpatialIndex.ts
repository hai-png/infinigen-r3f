/**
 * Spatial Index — Spatial constraint checking for composition.
 *
 * Extracted from CompositionEngine.ts. Contains all constraint validation
 * logic: distance, angle, collision, visibility, and semantic constraints.
 * Also provides helper utilities for sample-point generation and lateral
 * overlap computation.
 *
 * @module composition/SpatialIndex
 */

import { Vector3, Box3 } from 'three';
import type {
  CompositionConstraint,
  CompositionContext,
  CompositionConflict,
} from './types';

// ============================================================================
// Conflict type alias (re-exported for convenience)
// ============================================================================

export type { CompositionConflict };

// ============================================================================
// SpatialIndex — constraint checking facade
// ============================================================================

/**
 * Provides spatial constraint validation for the composition system.
 *
 * Stateless by design — all methods are pure functions that accept a
 * constraint and a context, returning a conflict or null.
 */
export class SpatialIndex {
  /**
   * Validate a single constraint and return a conflict if violated.
   */
  checkConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext,
  ): CompositionConflict | null {
    switch (constraint.type) {
      case 'distance':
        return this.checkDistanceConstraint(constraint, context);
      case 'angle':
        return this.checkAngleConstraint(constraint, context);
      case 'collision':
        return this.checkCollisionConstraint(constraint, context);
      case 'visibility':
        return this.checkVisibilityConstraint(constraint, context);
      case 'semantic':
        return this.checkSemanticConstraint(constraint, context);
      default:
        return null;
    }
  }

  /**
   * Validate all active constraints and return an array of conflicts.
   */
  validateConstraints(
    constraintIds: string[],
    constraints: Map<string, CompositionConstraint>,
    context: CompositionContext,
  ): CompositionConflict[] {
    const conflicts: CompositionConflict[] = [];

    for (const constraintId of constraintIds) {
      const constraint = constraints.get(constraintId);
      if (!constraint) continue;

      const violation = this.checkConstraint(constraint, context);
      if (violation) {
        conflicts.push(violation);
      }
    }

    return conflicts;
  }

  // ========================================================================
  // Distance
  // ========================================================================

  private checkDistanceConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext,
  ): CompositionConflict | null {
    if (!constraint.source || !constraint.target) return null;

    const sourceObj = context.existingObjects.find(o => o.nodeId === constraint.source);
    const targetObj = context.existingObjects.find(o =>
      o.nodeId === constraint.target || constraint.target === '*',
    );

    if (!sourceObj || !targetObj) return null;

    const distance = sourceObj.center.distanceTo(targetObj.center);
    const { min, max } = constraint.parameters;

    if (min !== undefined && distance < min) {
      return {
        ruleId: '',
        constraintId: constraint.id,
        description: `Distance ${distance.toFixed(2)} < minimum ${min}`,
        severity: constraint.parameters.required ? 'error' : 'warning',
      };
    }

    if (max !== undefined && distance > max) {
      return {
        ruleId: '',
        constraintId: constraint.id,
        description: `Distance ${distance.toFixed(2)} > maximum ${max}`,
        severity: constraint.parameters.required ? 'error' : 'warning',
      };
    }

    return null;
  }

  // ========================================================================
  // Angle
  // ========================================================================

  /**
   * Check angle constraint between source and target relative to a reference point.
   *
   * Supports the `axis` parameter to restrict angle measurement to a
   * specific plane:
   *   - 'y': angle in the XZ plane (horizontal / azimuthal)
   *   - 'x': angle in the YZ plane
   *   - 'z': angle in the XY plane
   *   - 'any' / undefined: full 3D angle (default)
   */
  private checkAngleConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext,
  ): CompositionConflict | null {
    if (!constraint.source || !constraint.target) return null;

    const sourceObj = context.existingObjects.find(o => o.nodeId === constraint.source);
    const targetObj = context.existingObjects.find(o => o.nodeId === constraint.target);

    if (!sourceObj || !targetObj) return null;

    const reference = context.cameraPosition ?? context.center;

    const toSource = sourceObj.center.clone().sub(reference);
    const toTarget = targetObj.center.clone().sub(reference);

    if (toSource.lengthSq() === 0 || toTarget.lengthSq() === 0) return null;

    const axis = constraint.parameters.axis ?? 'any';
    let angleDeg: number;

    if (axis === 'any') {
      const angleRad = toSource.angleTo(toTarget);
      angleDeg = angleRad * (180 / Math.PI);
    } else {
      const projectedSource = toSource.clone();
      const projectedTarget = toTarget.clone();

      projectedSource[axis] = 0;
      projectedTarget[axis] = 0;

      if (projectedSource.lengthSq() < 1e-10 || projectedTarget.lengthSq() < 1e-10) {
        angleDeg = 0;
      } else {
        const angleRad = projectedSource.angleTo(projectedTarget);
        angleDeg = angleRad * (180 / Math.PI);
      }
    }

    const { min, max } = constraint.parameters;

    if (min !== undefined && angleDeg < min) {
      return {
        ruleId: '',
        constraintId: constraint.id,
        description: `Angle ${angleDeg.toFixed(1)}° between ${constraint.source} and ${constraint.target} (axis=${axis}) is below minimum ${min}°`,
        severity: constraint.parameters.required ? 'error' : 'warning',
      };
    }

    if (max !== undefined && angleDeg > max) {
      return {
        ruleId: '',
        constraintId: constraint.id,
        description: `Angle ${angleDeg.toFixed(1)}° between ${constraint.source} and ${constraint.target} (axis=${axis}) exceeds maximum ${max}°`,
        severity: constraint.parameters.required ? 'error' : 'warning',
      };
    }

    return null;
  }

  // ========================================================================
  // Collision
  // ========================================================================

  private checkCollisionConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext,
  ): CompositionConflict | null {
    for (let i = 0; i < context.existingObjects.length; i++) {
      for (let j = i + 1; j < context.existingObjects.length; j++) {
        const a = context.existingObjects[i];
        const b = context.existingObjects[j];

        if (a.bounds.intersectsBox(b.bounds)) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Collision detected between ${a.nodeId} and ${b.nodeId}`,
            severity: 'error',
          };
        }
      }
    }
    return null;
  }

  // ========================================================================
  // Visibility
  // ========================================================================

  /**
   * Three-stage visibility check:
   *   1. Frustum check (behind camera / outside FOV cone)
   *   2. Multi-sample occlusion check on bounding box
   *   3. Visibility fraction threshold check
   */
  private checkVisibilityConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext,
  ): CompositionConflict | null {
    if (!context.cameraPosition) return null;

    const targetId = constraint.source;
    if (!targetId) return null;

    const targetObj = context.existingObjects.find(o => o.nodeId === targetId);
    if (!targetObj) return null;

    const camPos = context.cameraPosition;
    const camDir = (context.forward ?? new Vector3(0, 0, -1)).clone().normalize();

    const toTargetCenter = targetObj.center.clone().sub(camPos);
    const targetDist = toTargetCenter.length();
    if (targetDist === 0) return null;

    const toTargetDir = toTargetCenter.clone().normalize();

    // Stage 1: Frustum check
    const viewDot = toTargetDir.dot(camDir);

    if (viewDot < 0) {
      return {
        ruleId: '',
        constraintId: constraint.id,
        description: `Object ${targetId} is behind the camera`,
        severity: constraint.parameters.required ? 'error' : 'warning',
      };
    }

    const fovHalfAngle = (constraint.parameters.max ?? 60) * (Math.PI / 180);
    const angleFromCenter = Math.acos(Math.min(1, viewDot));
    if (angleFromCenter > fovHalfAngle) {
      return {
        ruleId: '',
        constraintId: constraint.id,
        description: `Object ${targetId} is outside camera field of view (${(angleFromCenter * 180 / Math.PI).toFixed(1)}° off-axis)`,
        severity: constraint.parameters.required ? 'error' : 'warning',
      };
    }

    // Stage 2: Multi-sample occlusion check
    const samplePoints = generateVisibilitySamplePoints(targetObj.bounds);
    const visibilityThreshold = constraint.parameters.min ?? 0.1;

    let visibleSamples = 0;
    const occluderSet = new Set<string>();

    for (const samplePoint of samplePoints) {
      const toSample = samplePoint.clone().sub(camPos);
      const sampleDist = toSample.length();
      if (sampleDist === 0) continue;

      const toSampleDir = toSample.clone().normalize();

      let sampleOccluded = false;

      for (const other of context.existingObjects) {
        if (other.nodeId === targetId) continue;

        const toOtherCenter = other.center.clone().sub(camPos);
        const otherDist = toOtherCenter.length();
        if (otherDist === 0 || otherDist >= sampleDist) continue;

        const toOtherDir = toOtherCenter.clone().normalize();
        const angularSep = Math.acos(Math.min(1, toSampleDir.dot(toOtherDir)));

        const otherSize = other.bounds.getSize(new Vector3());
        const otherAngularRadius = Math.atan(
          Math.max(otherSize.x, otherSize.y, otherSize.z) / (2 * otherDist),
        );

        if (angularSep < otherAngularRadius) {
          sampleOccluded = true;
          occluderSet.add(other.nodeId);
          break;
        }
      }

      if (!sampleOccluded) {
        visibleSamples++;
      }
    }

    // Stage 3: Visibility fraction check
    const visibilityFraction = samplePoints.length > 0
      ? visibleSamples / samplePoints.length
      : 1.0;

    if (visibilityFraction < visibilityThreshold) {
      const occluderNames = Array.from(occluderSet).join(', ') || 'unknown';
      return {
        ruleId: '',
        constraintId: constraint.id,
        description: `Object ${targetId} is occluded (visibility=${(visibilityFraction * 100).toFixed(0)}%, threshold=${(visibilityThreshold * 100).toFixed(0)}%, occluders: ${occluderNames})`,
        severity: constraint.parameters.required ? 'error' : 'warning',
      };
    }

    return null;
  }

  // ========================================================================
  // Semantic
  // ========================================================================

  /**
   * Check semantic constraints using a hardcoded rule table for common indoor
   * spatial relationships.
   *
   * Supports: on_floor, on_ceiling, near_wall, above, below, on_top_of,
   * beside, inside, near, facing_camera, auto.
   */
  private checkSemanticConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext,
  ): CompositionConflict | null {
    const semanticRule = constraint.parameters.semantic;
    if (!semanticRule) return null;

    const obj = constraint.source
      ? context.existingObjects.find(o => o.nodeId === constraint.source)
      : null;
    if (!obj) return null;

    const refObj = constraint.target
      ? context.existingObjects.find(o => o.nodeId === constraint.target)
      : null;

    const tolerance = constraint.parameters.min ?? 0.1;
    const distanceThreshold = constraint.parameters.max ?? 1.0;

    switch (semanticRule) {
      case 'on_floor': {
        const bottomY = obj.bounds.min.y;
        if (Math.abs(bottomY - context.groundLevel) > tolerance) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} bottom Y=${bottomY.toFixed(2)} is not on floor (ground=${context.groundLevel}, tolerance=${tolerance})`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'on_ceiling': {
        const ceilingY = context.bounds.max.y;
        const topY = obj.bounds.max.y;
        if (Math.abs(topY - ceilingY) > tolerance) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} top Y=${topY.toFixed(2)} is not on ceiling (ceiling=${ceilingY.toFixed(2)}, tolerance=${tolerance})`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'near_wall': {
        const distToMinX = Math.abs(obj.bounds.min.x - context.bounds.min.x);
        const distToMaxX = Math.abs(obj.bounds.max.x - context.bounds.max.x);
        const distToMinZ = Math.abs(obj.bounds.min.z - context.bounds.min.z);
        const distToMaxZ = Math.abs(obj.bounds.max.z - context.bounds.max.z);
        const minDistToWall = Math.min(distToMinX, distToMaxX, distToMinZ, distToMaxZ);

        if (minDistToWall > distanceThreshold) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} is ${minDistToWall.toFixed(2)} units from nearest wall (max allowed=${distanceThreshold})`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'above': {
        if (!refObj) return null;
        if (obj.center.y <= refObj.center.y) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} (Y=${obj.center.y.toFixed(2)}) is not above ${constraint.target} (Y=${refObj.center.y.toFixed(2)})`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'below': {
        if (!refObj) return null;
        if (obj.center.y >= refObj.center.y) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} (Y=${obj.center.y.toFixed(2)}) is not below ${constraint.target} (Y=${refObj.center.y.toFixed(2)})`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'on_top_of': {
        if (!refObj) return null;
        const sourceBottom = obj.bounds.min.y;
        const targetTop = refObj.bounds.max.y;
        const verticalGap = Math.abs(sourceBottom - targetTop);
        const lateralOverlap = computeLateralOverlap(obj.bounds, refObj.bounds);

        if (verticalGap > tolerance) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} (bottom=${sourceBottom.toFixed(2)}) is not on top of ${constraint.target} (top=${targetTop.toFixed(2)}, gap=${verticalGap.toFixed(2)}, tolerance=${tolerance})`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        if (lateralOverlap <= 0) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} is above ${constraint.target} but has no lateral overlap (not resting on it)`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'beside': {
        if (!refObj) return null;
        const heightDiff = Math.abs(obj.center.y - refObj.center.y);
        const maxVerticalDiff = tolerance * 5;
        const lateralDist = Math.sqrt(
          Math.pow(obj.center.x - refObj.center.x, 2) +
          Math.pow(obj.center.z - refObj.center.z, 2),
        );

        if (heightDiff > maxVerticalDiff) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} is not beside ${constraint.target}: height difference ${heightDiff.toFixed(2)} exceeds ${maxVerticalDiff.toFixed(2)}`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        if (lateralDist > distanceThreshold) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} is not beside ${constraint.target}: lateral distance ${lateralDist.toFixed(2)} exceeds ${distanceThreshold}`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'inside': {
        if (!refObj) return null;
        const isInside = (
          obj.bounds.min.x >= refObj.bounds.min.x - tolerance &&
          obj.bounds.max.x <= refObj.bounds.max.x + tolerance &&
          obj.bounds.min.y >= refObj.bounds.min.y - tolerance &&
          obj.bounds.max.y <= refObj.bounds.max.y + tolerance &&
          obj.bounds.min.z >= refObj.bounds.min.z - tolerance &&
          obj.bounds.max.z <= refObj.bounds.max.z + tolerance
        );
        if (!isInside) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} is not inside ${constraint.target}`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'near': {
        if (!refObj) return null;
        const distance = obj.center.distanceTo(refObj.center);
        if (distance > distanceThreshold) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} is not near ${constraint.target}: distance ${distance.toFixed(2)} exceeds ${distanceThreshold}`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'facing_camera': {
        if (!context.cameraPosition) return null;
        const toCamera = context.cameraPosition.clone().sub(obj.center).normalize();
        const forwardDir = (context.forward ?? new Vector3(0, 0, 1)).clone().normalize();
        const alignment = toCamera.dot(forwardDir);

        if (alignment < 0) {
          return {
            ruleId: '',
            constraintId: constraint.id,
            description: `Object ${constraint.source} is not facing the camera (alignment=${alignment.toFixed(2)})`,
            severity: constraint.parameters.required ? 'error' : 'warning',
          };
        }
        break;
      }

      case 'auto': {
        return this.checkAutoSemanticConstraint(obj, constraint, context);
      }

      default:
        return null;
    }

    return null;
  }

  // ========================================================================
  // Auto-semantic rule table
  // ========================================================================

  private static readonly SEMANTIC_RULE_TABLE: ReadonlyArray<{
    categoryPattern: string;
    constraint: string;
    parameters: { min?: number; max?: number };
  }> = [
    { categoryPattern: 'table',   constraint: 'on_floor', parameters: { min: 0.15 } },
    { categoryPattern: 'desk',    constraint: 'on_floor', parameters: { min: 0.15 } },
    { categoryPattern: 'chair',   constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'stool',   constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'sofa',    constraint: 'on_floor', parameters: { min: 0.15 } },
    { categoryPattern: 'bed',     constraint: 'on_floor', parameters: { min: 0.2 } },
    { categoryPattern: 'dresser', constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'shelf',   constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'cabinet', constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'ceiling-light', constraint: 'on_ceiling', parameters: { min: 0.3 } },
    { categoryPattern: 'pendant',       constraint: 'on_ceiling', parameters: { min: 0.5 } },
    { categoryPattern: 'rug',     constraint: 'on_floor', parameters: { min: 0.05 } },
    { categoryPattern: 'FloorMat', constraint: 'on_floor', parameters: { min: 0.05 } },
    { categoryPattern: 'bookcase',  constraint: 'near_wall', parameters: { max: 0.3 } },
    { categoryPattern: 'bookshelf', constraint: 'near_wall', parameters: { max: 0.3 } },
    { categoryPattern: 'wall-decoration', constraint: 'near_wall', parameters: { max: 0.1 } },
    { categoryPattern: 'mirror.wall',     constraint: 'near_wall', parameters: { max: 0.1 } },
    { categoryPattern: 'plant.indoor.large', constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'lamp.table', constraint: 'on_floor', parameters: { min: 0.4, max: 1.5 } },
    { categoryPattern: 'lamp.desk',  constraint: 'on_floor', parameters: { min: 0.4, max: 1.5 } },
    { categoryPattern: 'lamp.floor', constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'refrigerator',  constraint: 'on_floor', parameters: { min: 0.05 } },
    { categoryPattern: 'stove',         constraint: 'on_floor', parameters: { min: 0.05 } },
    { categoryPattern: 'appliance',     constraint: 'on_floor', parameters: { min: 0.1 } },
  ];

  private checkAutoSemanticConstraint(
    obj: { nodeId: string; bounds: Box3; center: Vector3; category: string },
    constraint: CompositionConstraint,
    context: CompositionContext,
  ): CompositionConflict | null {
    const category = obj.category.toLowerCase();

    for (const rule of SpatialIndex.SEMANTIC_RULE_TABLE) {
      if (!category.includes(rule.categoryPattern.toLowerCase())) continue;

      const syntheticConstraint: CompositionConstraint = {
        id: `${constraint.id}_auto_${rule.constraint}`,
        type: 'semantic',
        source: constraint.source,
        target: constraint.target,
        parameters: {
          ...constraint.parameters,
          semantic: rule.constraint,
          min: rule.parameters.min,
          max: rule.parameters.max,
        },
      };

      const violation = this.checkSemanticConstraint(syntheticConstraint, context);
      if (violation) {
        violation.description = `[auto:${rule.categoryPattern}] ${violation.description}`;
        return violation;
      }
    }

    return null;
  }
}

// ============================================================================
// Utility functions (exported for reuse)
// ============================================================================

/**
 * Generate sample points on a bounding box for visibility checking.
 * Includes center, 8 corners, and 6 face centers.
 */
export function generateVisibilitySamplePoints(bounds: Box3): Vector3[] {
  if (bounds.isEmpty()) return [];

  const { min, max } = bounds;
  const points: Vector3[] = [];

  // Center
  points.push(bounds.getCenter(new Vector3()));

  // 8 corners
  points.push(
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(min.x, max.y, max.z),
    new Vector3(max.x, max.y, max.z),
  );

  // 6 face centers
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const cz = (min.z + max.z) / 2;
  points.push(
    new Vector3(min.x, cy, cz),
    new Vector3(max.x, cy, cz),
    new Vector3(cx, min.y, cz),
    new Vector3(cx, max.y, cz),
    new Vector3(cx, cy, min.z),
    new Vector3(cx, cy, max.z),
  );

  return points;
}

/**
 * Compute the lateral (XZ plane) overlap area between two bounding boxes.
 * Returns 0 if there is no overlap, or a positive value representing
 * the overlapping area.
 */
export function computeLateralOverlap(a: Box3, b: Box3): number {
  const overlapX = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
  const overlapZ = Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
  return overlapX * overlapZ;
}
