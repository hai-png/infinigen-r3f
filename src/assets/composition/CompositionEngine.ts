/**
 * Composition Engine for Infinigen R3F Port
 * 
 * Manages scene composition through rules, constraints, and templates.
 * Handles spatial relationships, aesthetic principles, and automated placement.
 */

import { Vector3, Quaternion, Box3, Sphere } from 'three';
import type { Object3D } from 'three';
import type { SceneGraphNode } from '../nodes/types';
/**
 * Spatial relationship types between objects
 */
export enum SpatialRelation {
  ADJACENT = 'adjacent',
  ALIGNED = 'aligned',
  CENTERED = 'centered',
  DISTRIBUTED = 'distributed',
  HIERARCHICAL = 'hierarchical',
  SYMMETRICAL = 'symmetrical',
  RADIAL = 'radial',
  GRID = 'grid',
  FOLLOW_PATH = 'follow_path',
}

/**
 * Aesthetic principle types
 */
export enum AestheticPrinciple {
  BALANCE = 'balance',
  RHYTHM = 'rhythm',
  EMPHASIS = 'emphasis',
  PROPORTION = 'proportion',
  HARMONY = 'harmony',
  VARIETY = 'variety',
  UNITY = 'unity',
}

/**
 * Composition rule definition
 */
export interface CompositionRule {
  id: string;
  name: string;
  description: string;
  relation: SpatialRelation;
  principles: AestheticPrinciple[];
  priority: number; // 0-100, higher = more important
  parameters: Record<string, any>;
  validator: (context: CompositionContext) => boolean;
  applier: (context: CompositionContext) => CompositionResult;
}

/**
 * Constraint definition for object placement
 */
export interface CompositionConstraint {
  id: string;
  type: 'distance' | 'angle' | 'visibility' | 'collision' | 'semantic';
  source?: string; // Node ID
  target?: string; // Node ID or group
  parameters: {
    min?: number;
    max?: number;
    axis?: 'x' | 'y' | 'z' | 'any';
    required?: boolean;
    semantic?: string; // e.g., "must face camera", "must be on ground"
  };
}

/**
 * Composition template for reusable layouts
 */
export interface CompositionTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  objects: TemplateObject[];
  rules: string[]; // Rule IDs to apply
  constraints: CompositionConstraint[];
  variables: TemplateVariable[];
}

/**
 * Object definition within a template
 */
export interface TemplateObject {
  id: string;
  category: string;
  variant?: string;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  parent?: string; // Parent object ID in template
  metadata?: Record<string, any>;
}

/**
 * Variable for template customization
 */
export interface TemplateVariable {
  name: string;
  type: 'number' | 'vector3' | 'quaternion' | 'string' | 'boolean';
  defaultValue: any;
  min?: number;
  max?: number;
  options?: string[];
}

/**
 * Context for composition evaluation
 */
export interface CompositionContext {
  nodes: Map<string, SceneGraphNode>;
  rootNode: Object3D;
  bounds: Box3;
  center: Vector3;
  up: Vector3;
  forward: Vector3;
  cameraPosition?: Vector3;
  lightDirections?: Vector3[];
  groundLevel: number;
  existingObjects: Array<{
    nodeId: string;
    bounds: Box3;
    center: Vector3;
    category: string;
  }>;
  variables?: Record<string, any>;
}

/**
 * Result of applying a composition rule
 */
export interface CompositionResult {
  success: boolean;
  transformations: Array<{
    nodeId: string;
    position?: Vector3;
    rotation?: Quaternion;
    scale?: Vector3;
  }>;
  conflicts: Array<{
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  }>;
  score: number; // 0-1 quality score
  metrics: CompositionMetrics;
}

/**
 * Metrics for evaluating composition quality
 */
export interface CompositionMetrics {
  balanceScore: number;
  rhythmScore: number;
  proportionScore: number;
  harmonyScore: number;
  overallScore: number;
  details: {
    centerOfMass: Vector3;
    boundingVolume: Sphere;
    densityDistribution: number[];
    symmetryAxis?: Vector3;
    goldenRatioDeviations: number[];
  };
}

/**
 * Main Composition Engine class
 */
export class CompositionEngine {
  private rules: Map<string, CompositionRule> = new Map();
  private constraints: Map<string, CompositionConstraint> = new Map();
  private templates: Map<string, CompositionTemplate> = new Map();
  private activeRules: string[] = [];
  private activeConstraints: string[] = [];

  /**
   * Register a composition rule
   */
  registerRule(rule: CompositionRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Register a constraint
   */
  registerConstraint(constraint: CompositionConstraint): void {
    this.constraints.set(constraint.id, constraint);
  }

  /**
   * Register a template
   */
  registerTemplate(template: CompositionTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Activate rules by ID
   */
  activateRules(ruleIds: string[]): void {
    this.activeRules = ruleIds.filter(id => this.rules.has(id));
  }

  /**
   * Activate constraints by ID
   */
  activateConstraints(constraintIds: string[]): void {
    this.activeConstraints = constraintIds.filter(id => this.constraints.has(id));
  }

  /**
   * Apply a template to the scene
   */
  applyTemplate(
    templateId: string,
    context: CompositionContext,
    variables?: Record<string, any>
  ): CompositionResult {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Merge variables with defaults
    const mergedVars = this.mergeTemplateVariables(template.variables, variables);
    context.variables = mergedVars;

    // Apply template objects
    const result: CompositionResult = {
      success: true,
      transformations: [],
      conflicts: [],
      score: 0,
      metrics: this.calculateMetrics(context),
    };

    // Instantiate template objects
    for (const obj of template.objects) {
      const transformed = this.instantiateTemplateObject(obj, context, mergedVars);
      if (transformed) {
        result.transformations.push(transformed);
      }
    }

    // Apply template rules
    if (template.rules.length > 0) {
      this.activateRules(template.rules);
      const ruleResult = this.applyRules(context);
      result.transformations.push(...ruleResult.transformations);
      result.conflicts.push(...ruleResult.conflicts);
    }

    // Apply template constraints
    if (template.constraints.length > 0) {
      for (const constraint of template.constraints) {
        this.registerConstraint(constraint);
      }
      this.activateConstraints(template.constraints.map(c => c.id));
      const constraintResult = this.validateConstraints(context);
      result.conflicts.push(...constraintResult);
    }

    // Calculate final score
    result.score = this.calculateOverallScore(result.metrics, result.conflicts);
    result.success = !result.conflicts.some(c => c.severity === 'error');

    return result;
  }

  /**
   * Apply all active rules to the context
   */
  applyRules(context: CompositionContext): CompositionResult {
    const result: CompositionResult = {
      success: true,
      transformations: [],
      conflicts: [],
      score: 0,
      metrics: this.calculateMetrics(context),
    };

    // Sort rules by priority
    const sortedRules = this.activeRules
      .map(id => this.rules.get(id))
      .filter((r): r is CompositionRule => r !== undefined)
      .sort((a, b) => b.priority - a.priority);

    // Apply each rule
    for (const rule of sortedRules) {
      if (!rule.validator(context)) {
        result.conflicts.push({
          ruleId: rule.id,
          constraintId: '',
          description: `Rule "${rule.name}" validation failed`,
          severity: 'warning',
        });
        continue;
      }

      try {
        const ruleResult = rule.applier(context);
        result.transformations.push(...ruleResult.transformations);
        result.conflicts.push(...ruleResult.conflicts);
      } catch (error) {
        result.conflicts.push({
          ruleId: rule.id,
          constraintId: '',
          description: `Rule "${rule.name}" application error: ${error}`,
          severity: 'error',
        });
        result.success = false;
      }
    }

    // Update metrics after transformations
    result.metrics = this.calculateMetrics(context);
    result.score = this.calculateOverallScore(result.metrics, result.conflicts);

    return result;
  }

  /**
   * Validate all active constraints
   */
  validateConstraints(context: CompositionContext): Array<{
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  }> {
    const conflicts: Array<{
      ruleId: string;
      constraintId: string;
      description: string;
      severity: 'error' | 'warning' | 'info';
    }> = [];

    for (const constraintId of this.activeConstraints) {
      const constraint = this.constraints.get(constraintId);
      if (!constraint) continue;

      const violation = this.checkConstraintViolation(constraint, context);
      if (violation) {
        conflicts.push(violation);
      }
    }

    return conflicts;
  }

  /**
   * Calculate composition quality metrics
   */
  calculateMetrics(context: CompositionContext): CompositionMetrics {
    const centers = context.existingObjects.map(obj => obj.center);
    
    // Calculate center of mass
    const centerOfMass = new Vector3();
    if (centers.length > 0) {
      for (const center of centers) {
        centerOfMass.add(center);
      }
      centerOfMass.divideScalar(centers.length);
    }

    // Calculate bounding volume
    const boundingSphere = new Sphere(context.center, 0);
    for (const obj of context.existingObjects) {
      boundingSphere.expandByPoint(obj.bounds.min);
      boundingSphere.expandByPoint(obj.bounds.max);
    }

    // Calculate density distribution (8 octants)
    const densityDistribution = this.calculateDensityDistribution(context);

    // Calculate balance score (symmetry around center)
    const balanceScore = this.calculateBalanceScore(context, centerOfMass);

    // Calculate rhythm score (spacing patterns)
    const rhythmScore = this.calculateRhythmScore(context);

    // Calculate proportion score (golden ratio adherence)
    const proportionScore = this.calculateProportionScore(context);

    // Calculate harmony score (color/material harmony would go here)
    const harmonyScore = 0.8; // Placeholder

    // Overall score
    const overallScore = (balanceScore + rhythmScore + proportionScore + harmonyScore) / 4;

    return {
      balanceScore,
      rhythmScore,
      proportionScore,
      harmonyScore,
      overallScore,
      details: {
        centerOfMass,
        boundingVolume: boundingSphere,
        densityDistribution,
        symmetryAxis: undefined,
        goldenRatioDeviations: [],
      },
    };
  }

  /**
   * Merge template variables with defaults
   */
  private mergeTemplateVariables(
    variables: TemplateVariable[],
    overrides?: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const variable of variables) {
      result[variable.name] = overrides?.[variable.name] ?? variable.defaultValue;
    }

    return result;
  }

  /**
   * Instantiate a template object with variable substitution
   */
  private instantiateTemplateObject(
    obj: TemplateObject,
    context: CompositionContext,
    variables: Record<string, any>
  ): { nodeId: string; position?: Vector3; rotation?: Quaternion; scale?: Vector3 } | null {
    // Substitute variables in position and scale (rotation rarely uses variables)
    const position = this.substituteVector3(obj.position, variables, 'position', obj.id);
    const rotation = obj.rotation;
    const scale = this.substituteVector3(obj.scale, variables, 'scale', obj.id);

    return {
      nodeId: obj.id,
      position,
      rotation,
      scale,
    };
  }

  /**
   * Substitute variables in a Vector3.
   *
   * Supports variable overrides and expression evaluation.
   * Looks up per-component overrides using naming conventions in priority order:
   *   1. `{objectId}_{prefix}_{axis}` (most specific)
   *   2. `{prefix}_{axis}`
   *   3. `{axis}`
   *
   * String values containing `${varName}` are evaluated as mathematical expressions.
   * Nested variable references are supported with cycle detection.
   *
   * @example substituteVector3(v, { width: 4, position_x: "${width}/2" }, 'position', 'chair')
   *          → Vector3 where x = 2
   */
  private substituteVector3(
    vector: Vector3,
    variables: Record<string, any>,
    prefix: string = '',
    objectId: string = '',
  ): Vector3 {
    const result = vector.clone();

    for (const axis of ['x', 'y', 'z'] as const) {
      // Build lookup keys in priority order
      const lookupKeys = [
        objectId && prefix ? `${objectId}_${prefix}_${axis}` : '',
        prefix ? `${prefix}_${axis}` : '',
        axis,
      ].filter(Boolean);

      for (const key of lookupKeys) {
        if (key in variables) {
          const val = variables[key];
          if (typeof val === 'number') {
            result[axis] = val;
            break;
          } else if (typeof val === 'string') {
            result[axis] = this.evaluateExpression(val, variables);
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * Evaluate a string expression containing `${varName}` references.
   * Replaces all variable references and evaluates the result as a math expression.
   *
   * Features:
   *   - Nested variable resolution: "${depth}" → depth's value (which may itself be an expression)
   *   - Cycle detection: prevents infinite recursion when variables reference each other
   *   - Basic arithmetic: +, -, *, /, %, parentheses
   *   - Safe evaluation: only numeric and operator characters are allowed
   *
   * @example evaluateExpression("${width}/2", { width: 4 }) → 2
   * @example evaluateExpression("${depth} * 2 + 1", { depth: 3 }) → 7
   */
  private evaluateExpression(
    expr: string,
    variables: Record<string, any>,
    resolutionStack?: Set<string>,
  ): number {
    // Initialize cycle detection stack on first call
    const stack = resolutionStack ?? new Set<string>();

    try {
      // Replace ${varName} patterns with their values
      let resolved = expr.replace(/\$\{(\w+)\}/g, (_match: string, varName: string) => {
        // Cycle detection: if we're already resolving this variable, stop
        if (stack.has(varName)) {
          if (process.env.NODE_ENV === 'development') {
            console.debug(`[CompositionEngine] Circular variable reference detected: ${varName}`);
          }
          return '0';
        }

        const val = variables[varName];
        if (val === undefined) return '0';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'string') {
          // Recursively resolve nested variable references with cycle tracking
          stack.add(varName);
          const result = String(this.evaluateExpression(val, variables, stack));
          stack.delete(varName);
          return result;
        }
        return '0';
      });

      // Handle empty or whitespace-only expressions
      if (!resolved.trim()) return 0;

      // Sanitize: only allow safe math characters and numbers
      if (!/^[\d\s+\-*/().%]+$/.test(resolved)) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[CompositionEngine] Expression contains unsafe characters: ${resolved}`);
        }
        return 0;
      }

      // Evaluate the mathematical expression safely using Function constructor
      // The sanitization above ensures only numbers and operators are present
      const result = new Function(`"use strict"; return (${resolved})`)();

      if (typeof result === 'number' && isFinite(result)) {
        return result;
      }
      return 0;
    } catch (err) {
      // Silently fall back - expression evaluation failed
      if (process.env.NODE_ENV === 'development') {
        console.debug('[CompositionEngine] evaluateExpression fallback:', err);
      }
      return 0;
    }
  }

  /**
   * Check if a constraint is violated
   */
  private checkConstraintViolation(
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    // Implementation depends on constraint type
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

  private checkDistanceConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    if (!constraint.source || !constraint.target) return null;

    const sourceObj = context.existingObjects.find(o => o.nodeId === constraint.source);
    const targetObj = context.existingObjects.find(o => 
      o.nodeId === constraint.target || constraint.target === '*'
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

  /**
   * Check angle constraint between source and target relative to a reference point.
   *
   * Computes the angle between the source→reference and target→reference vectors.
   * Supports the `axis` parameter to restrict the angle measurement to a specific
   * plane:
   *   - 'y': angle in the XZ plane (horizontal / azimuthal angle)
   *   - 'x': angle in the YZ plane
   *   - 'z': angle in the XY plane
   *   - 'any' / undefined: full 3D angle (default)
   *
   * Angles are checked against min/max parameters in degrees.
   * The reference point is the camera position if available, otherwise the scene center.
   */
  private checkAngleConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    if (!constraint.source || !constraint.target) return null;

    const sourceObj = context.existingObjects.find(o => o.nodeId === constraint.source);
    const targetObj = context.existingObjects.find(o => o.nodeId === constraint.target);

    if (!sourceObj || !targetObj) return null;

    // Reference point: camera position if available, otherwise scene center
    const reference = context.cameraPosition ?? context.center;

    // Compute vectors from reference to source and target
    const toSource = sourceObj.center.clone().sub(reference);
    const toTarget = targetObj.center.clone().sub(reference);

    // Handle degenerate zero-length vectors
    if (toSource.lengthSq() === 0 || toTarget.lengthSq() === 0) return null;

    const axis = constraint.parameters.axis ?? 'any';
    let angleDeg: number;

    if (axis === 'any') {
      // Full 3D angle
      const angleRad = toSource.angleTo(toTarget);
      angleDeg = angleRad * (180 / Math.PI);
    } else {
      // Project onto the plane perpendicular to the specified axis,
      // then compute the 2D angle in that plane.
      const projectedSource = toSource.clone();
      const projectedTarget = toTarget.clone();

      // Zero out the axis component to project onto the plane
      projectedSource[axis] = 0;
      projectedTarget[axis] = 0;

      // Check if projections have sufficient length
      if (projectedSource.lengthSq() < 1e-10 || projectedTarget.lengthSq() < 1e-10) {
        // One or both vectors are parallel to the axis — angle is undefined in this plane
        // In this case the projected angle is either 0° or 180°; we treat it as 0° (coincident projection)
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

  private checkCollisionConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    // Check for overlapping bounding boxes
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

  /**
   * Check visibility constraint: verify that the source object is visible from
   * the camera (within frustum and not fully occluded).
   *
   * Implements a three-stage check:
   *   1. Frustum check: verify the object is in front of the camera and within
   *      a configurable field-of-view cone.
   *   2. Multi-sample occlusion check: test multiple sample points on the target
   *      object's bounding box (center + corners + face centers) and compute a
   *      visibility fraction, inspired by the OcclusionDetector pattern.
   *   3. If visibility fraction drops below a threshold, the object is considered
   *      occluded.
   */
  private checkVisibilityConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    if (!context.cameraPosition) return null; // Cannot check without camera

    const targetId = constraint.source;
    if (!targetId) return null;

    const targetObj = context.existingObjects.find(o => o.nodeId === targetId);
    if (!targetObj) return null;

    const camPos = context.cameraPosition;
    const camDir = (context.forward ?? new Vector3(0, 0, -1)).clone().normalize();

    // Vector from camera to target center
    const toTargetCenter = targetObj.center.clone().sub(camPos);
    const targetDist = toTargetCenter.length();
    if (targetDist === 0) return null;

    const toTargetDir = toTargetCenter.clone().normalize();

    // ── Stage 1: Frustum check ────────────────────────────────────
    const viewDot = toTargetDir.dot(camDir);

    // Behind camera?
    if (viewDot < 0) {
      return {
        ruleId: '',
        constraintId: constraint.id,
        description: `Object ${targetId} is behind the camera`,
        severity: constraint.parameters.required ? 'error' : 'warning',
      };
    }

    // Outside FOV cone? (default 60° half-angle = 120° total FOV)
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

    // ── Stage 2: Multi-sample occlusion check ────────────────────
    // Generate sample points on the target's bounding box
    const samplePoints = this.generateVisibilitySamplePoints(targetObj.bounds);
    const visibilityThreshold = constraint.parameters.min ?? 0.1; // 10% visible by default

    let visibleSamples = 0;
    const occluderSet = new Set<string>();

    for (const samplePoint of samplePoints) {
      const toSample = samplePoint.clone().sub(camPos);
      const sampleDist = toSample.length();
      if (sampleDist === 0) continue;

      const toSampleDir = toSample.clone().normalize();

      // Check if this sample point is occluded by any other object
      let sampleOccluded = false;

      for (const other of context.existingObjects) {
        if (other.nodeId === targetId) continue;

        // Quick distance check: only consider objects that are closer to the camera
        const toOtherCenter = other.center.clone().sub(camPos);
        const otherDist = toOtherCenter.length();
        if (otherDist === 0 || otherDist >= sampleDist) continue;

        // Check if the sample direction passes through the other object's angular extent
        const toOtherDir = toOtherCenter.clone().normalize();
        const angularSep = Math.acos(Math.min(1, toSampleDir.dot(toOtherDir)));

        // Estimate other object's angular radius
        const otherSize = other.bounds.getSize(new Vector3());
        const otherAngularRadius = Math.atan(
          Math.max(otherSize.x, otherSize.y, otherSize.z) / (2 * otherDist),
        );

        // If the sample point falls within the other object's angular extent, it's occluded
        if (angularSep < otherAngularRadius) {
          sampleOccluded = true;
          occluderSet.add(other.nodeId);
          break; // No need to check other occluders for this sample
        }
      }

      if (!sampleOccluded) {
        visibleSamples++;
      }
    }

    // ── Stage 3: Visibility fraction check ───────────────────────
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

  /**
   * Generate sample points on a bounding box for visibility checking.
   * Includes center, corners, and face centers, similar to OcclusionDetector.
   */
  private generateVisibilitySamplePoints(bounds: Box3): Vector3[] {
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
   * Check semantic constraints using a hardcoded rule table for common indoor
   * spatial relationships.
   *
   * Implements the following semantic rules:
   *   - "on_floor":      source bottom should be near ground level
   *   - "on_ceiling":    source top should be near ceiling
   *   - "near_wall":     source should be within wall distance of scene boundary
   *   - "above":         source center should be above target center
   *   - "below":         source center should be below target center
   *   - "on_top_of":     source bottom should be near target top (supporting surface)
   *   - "beside":        source should be laterally adjacent to target within a distance
   *   - "inside":        source should be fully contained within target's bounding box
   *   - "near":          source should be within a specified distance of target
   *   - "facing_camera": source should face toward camera position
   *   - "auto":          auto-detect constraints from object category via the rule table
   */
  private checkSemanticConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    const semanticRule = constraint.parameters.semantic;
    if (!semanticRule) return null;

    // Primary object being checked
    const obj = constraint.source
      ? context.existingObjects.find(o => o.nodeId === constraint.source)
      : null;
    if (!obj) return null;

    // Secondary object for relational rules (above/below/on_top_of/beside/inside/near)
    const refObj = constraint.target
      ? context.existingObjects.find(o => o.nodeId === constraint.target)
      : null;

    const tolerance = constraint.parameters.min ?? 0.1;   // World units tolerance
    const distanceThreshold = constraint.parameters.max ?? 1.0; // Distance for beside/near

    switch (semanticRule) {
      // ── on_floor: object bottom should be near ground level ──────
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

      // ── on_ceiling: object top should be near ceiling ────────────
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

      // ── near_wall: object should be within wall distance ─────────
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

      // ── above: source center should be above target center ───────
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

      // ── below: source center should be below target center ───────
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

      // ── on_top_of: source bottom should be near target top ───────
      // This is distinct from "above" — it implies physical contact / support.
      // e.g., "lamp on_top_of table", "book on_top_of shelf"
      case 'on_top_of': {
        if (!refObj) return null;
        const sourceBottom = obj.bounds.min.y;
        const targetTop = refObj.bounds.max.y;
        const verticalGap = Math.abs(sourceBottom - targetTop);
        // Also check lateral overlap: the source should be above the target's footprint
        const lateralOverlap = this.computeLateralOverlap(obj.bounds, refObj.bounds);

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

      // ── beside: source should be laterally adjacent to target ────
      // Objects are "beside" each other if they're at roughly the same height
      // and within a specified lateral distance, but not overlapping.
      case 'beside': {
        if (!refObj) return null;
        // Check similar height (within tolerance of each other's vertical center)
        const heightDiff = Math.abs(obj.center.y - refObj.center.y);
        const maxVerticalDiff = tolerance * 5; // Allow some vertical leeway
        // Compute lateral distance (distance in the XZ plane)
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

      // ── inside: source should be fully contained within target ───
      // The source's bounding box must be entirely within the target's bounding box.
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

      // ── near: source should be within distance of target ─────────
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

      // ── facing_camera: object should face toward camera position ──
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

      // ── auto: auto-detect constraints from object category ───────
      case 'auto': {
        return this.checkAutoSemanticConstraint(obj, constraint, context);
      }

      default:
        // Unknown semantic rule — no violation reported
        return null;
    }

    return null;
  }

  /**
   * Hardcoded rule table mapping object categories to expected semantic
   * constraints.  When `semantic: "auto"` is specified, the engine looks
   * up the object's category and checks the corresponding rules.
   *
   * Category matching uses substring matching (e.g., "furniture.table"
   * matches any category containing "table").
   */
  private static readonly SEMANTIC_RULE_TABLE: Array<{
    categoryPattern: string;
    constraint: string; // semantic constraint type
    parameters: { min?: number; max?: number };
  }> = [
    // Tables and desks should be on the floor
    { categoryPattern: 'table',   constraint: 'on_floor', parameters: { min: 0.15 } },
    { categoryPattern: 'desk',    constraint: 'on_floor', parameters: { min: 0.15 } },
    // Chairs should be on the floor
    { categoryPattern: 'chair',   constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'stool',   constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'sofa',    constraint: 'on_floor', parameters: { min: 0.15 } },
    // Beds should be on the floor
    { categoryPattern: 'bed',     constraint: 'on_floor', parameters: { min: 0.2 } },
    // Storage furniture on the floor
    { categoryPattern: 'dresser', constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'shelf',   constraint: 'on_floor', parameters: { min: 0.1 } },
    { categoryPattern: 'cabinet', constraint: 'on_floor', parameters: { min: 0.1 } },
    // Ceiling lights should be near the ceiling
    { categoryPattern: 'ceiling-light', constraint: 'on_ceiling', parameters: { min: 0.3 } },
    { categoryPattern: 'pendant',       constraint: 'on_ceiling', parameters: { min: 0.5 } },
    // Rugs / floormats should be on the floor
    { categoryPattern: 'rug',     constraint: 'on_floor', parameters: { min: 0.05 } },
    { categoryPattern: 'FloorMat', constraint: 'on_floor', parameters: { min: 0.05 } },
    // Bookshelves and tall storage should be near a wall
    { categoryPattern: 'bookcase',  constraint: 'near_wall', parameters: { max: 0.3 } },
    { categoryPattern: 'bookshelf', constraint: 'near_wall', parameters: { max: 0.3 } },
    // Wall decorations should be near walls
    { categoryPattern: 'wall-decoration', constraint: 'near_wall', parameters: { max: 0.1 } },
    { categoryPattern: 'mirror.wall',     constraint: 'near_wall', parameters: { max: 0.1 } },
    // Plants on floor
    { categoryPattern: 'plant.indoor.large', constraint: 'on_floor', parameters: { min: 0.1 } },
    // Lamps on tables/desks
    { categoryPattern: 'lamp.table', constraint: 'on_floor', parameters: { min: 0.4, max: 1.5 } },
    { categoryPattern: 'lamp.desk',  constraint: 'on_floor', parameters: { min: 0.4, max: 1.5 } },
    // Floor lamps on floor
    { categoryPattern: 'lamp.floor', constraint: 'on_floor', parameters: { min: 0.1 } },
    // Appliances on floor
    { categoryPattern: 'refrigerator',  constraint: 'on_floor', parameters: { min: 0.05 } },
    { categoryPattern: 'stove',         constraint: 'on_floor', parameters: { min: 0.05 } },
    { categoryPattern: 'appliance',     constraint: 'on_floor', parameters: { min: 0.1 } },
  ];

  /**
   * Check auto-detected semantic constraints based on the object's category.
   * Uses the SEMANTIC_RULE_TABLE to find applicable rules.
   */
  private checkAutoSemanticConstraint(
    obj: { nodeId: string; bounds: Box3; center: Vector3; category: string },
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    const category = obj.category.toLowerCase();

    // Find all matching rules in the table
    for (const rule of CompositionEngine.SEMANTIC_RULE_TABLE) {
      if (!category.includes(rule.categoryPattern.toLowerCase())) continue;

      // Found a matching rule — create a synthetic constraint and check it
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
        // Prefix description to indicate auto-detection
        violation.description = `[auto:${rule.categoryPattern}] ${violation.description}`;
        return violation;
      }
    }

    return null;
  }

  /**
   * Compute the lateral (XZ plane) overlap area between two bounding boxes.
   * Returns 0 if there is no overlap, or a positive value representing
   * the overlapping area.
   */
  private computeLateralOverlap(a: Box3, b: Box3): number {
    const overlapX = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
    const overlapZ = Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
    return overlapX * overlapZ;
  }

  /**
   * Calculate density distribution across 8 octants
   */
  private calculateDensityDistribution(context: CompositionContext): number[] {
    const distribution = new Array(8).fill(0);
    const center = context.center;

    for (const obj of context.existingObjects) {
      const relative = obj.center.clone().sub(center);
      const octant = (
        (relative.x >= 0 ? 4 : 0) +
        (relative.y >= 0 ? 2 : 0) +
        (relative.z >= 0 ? 1 : 0)
      );
      distribution[octant]++;
    }

    // Normalize
    const total = distribution.reduce((a, b) => a + b, 0);
    if (total > 0) {
      return distribution.map(d => d / total);
    }
    return distribution;
  }

  /**
   * Calculate balance score based on symmetry
   */
  private calculateBalanceScore(context: CompositionContext, centerOfMass: Vector3): number {
    const deviation = centerOfMass.distanceTo(context.center);
    const maxDeviation = context.bounds.getSize(new Vector3()).length() / 2;
    
    if (maxDeviation === 0) return 1.0;
    
    // Score decreases as center of mass deviates from scene center
    return Math.max(0, 1 - deviation / maxDeviation);
  }

  /**
   * Calculate rhythm score based on spacing patterns
   */
  private calculateRhythmScore(context: CompositionContext): number {
    if (context.existingObjects.length < 2) return 1.0;

    const distances: number[] = [];
    for (let i = 0; i < context.existingObjects.length; i++) {
      for (let j = i + 1; j < context.existingObjects.length; j++) {
        distances.push(
          context.existingObjects[i].center.distanceTo(
            context.existingObjects[j].center
          )
        );
      }
    }

    // Calculate variance in distances (lower variance = better rhythm)
    const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);

    // Normalize score (lower stdDev = higher score)
    const normalizedStdDev = stdDev / (mean || 1);
    return Math.max(0, 1 - normalizedStdDev);
  }

  /**
   * Calculate proportion score based on golden ratio
   */
  private calculateProportionScore(context: CompositionContext): number {
    const phi = 1.618033988749895;
    const deviations: number[] = [];

    const sizes = context.existingObjects.map(obj => 
      obj.bounds.getSize(new Vector3())
    );

    for (const size of sizes) {
      const ratios = [
        Math.max(size.x, size.y) / Math.min(size.x, size.y),
        Math.max(size.y, size.z) / Math.min(size.y, size.z),
        Math.max(size.x, size.z) / Math.min(size.x, size.z),
      ].filter(r => isFinite(r) && r > 0);

      for (const ratio of ratios) {
        const deviation = Math.abs(ratio - phi) / phi;
        deviations.push(deviation);
      }
    }

    if (deviations.length === 0) return 1.0;

    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    return Math.max(0, 1 - avgDeviation);
  }

  /**
   * Calculate overall score from metrics and conflicts
   */
  private calculateOverallScore(
    metrics: CompositionMetrics,
    conflicts: Array<{ severity: 'error' | 'warning' | 'info' }>
  ): number {
    let score = metrics.overallScore;

    // Penalize for conflicts
    for (const conflict of conflicts) {
      switch (conflict.severity) {
        case 'error':
          score *= 0.5;
          break;
        case 'warning':
          score *= 0.8;
          break;
        case 'info':
          score *= 0.95;
          break;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get a rule by ID
   */
  getRule(id: string): CompositionRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Get a template by ID
   */
  getTemplate(id: string): CompositionTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * List all registered rules
   */
  listRules(): CompositionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * List all registered templates
   */
  listTemplates(): CompositionTemplate[] {
    return Array.from(this.templates.values());
  }
}

// Export singleton instance
export const compositionEngine = new CompositionEngine();
