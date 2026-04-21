/**
 * Composition Engine for Infinigen R3F Port
 * 
 * Manages scene composition through rules, constraints, and templates.
 * Handles spatial relationships, aesthetic principles, and automated placement.
 */

import { Vector3, Quaternion, Box3, Sphere } from 'three';
import type { Object3D } from 'three';
import type { SceneGraphNode } from '../nodes/types';
import { PlacementContext } from '../placement/types';

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
    // Substitute variables in position, rotation, scale
    const position = this.substituteVector3(obj.position, variables);
    const rotation = obj.rotation; // Quaternion doesn't typically use variables
    const scale = this.substituteVector3(obj.scale, variables);

    return {
      nodeId: obj.id,
      position,
      rotation,
      scale,
    };
  }

  /**
   * Substitute variables in a Vector3
   */
  private substituteVector3(vector: Vector3, variables: Record<string, any>): Vector3 {
    // Simple implementation - in production, parse expressions like "${varName}"
    return vector.clone();
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

  private checkAngleConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    // Placeholder - implement angle checking logic
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

  private checkVisibilityConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    // Placeholder - implement visibility checking from camera
    return null;
  }

  private checkSemanticConstraint(
    constraint: CompositionConstraint,
    context: CompositionContext
  ): {
    ruleId: string;
    constraintId: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  } | null {
    // Placeholder - implement semantic checking (e.g., "must face camera")
    return null;
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
