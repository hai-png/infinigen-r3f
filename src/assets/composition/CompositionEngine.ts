/**
 * Composition Engine — Thin orchestrator for the composition system.
 *
 * Previously a 1462-line god class; now delegates to:
 *   - types.ts          — shared interfaces and enums
 *   - CompositionRules  — rule registration, activation, and application
 *   - SpatialIndex      — spatial constraint checking
 *   - CompositionScorer — quality metrics and scoring
 *
 * The CompositionEngine orchestrates these components, manages template
 * application, and provides variable substitution / expression evaluation.
 *
 * @module composition/CompositionEngine
 */

import { Vector3, Quaternion, Box3 } from 'three';
import type { Object3D } from 'three';

// ── Extracted modules ─────────────────────────────────────────────────
import type {
  SceneGraphNode,
  CompositionRule,
  CompositionConstraint,
  CompositionTemplate,
  TemplateObject,
  TemplateVariable,
  CompositionContext,
  CompositionResult,
  CompositionMetrics,
  CompositionConflict,
} from './types';

export type {
  SceneGraphNode,
  CompositionRule,
  CompositionConstraint,
  CompositionTemplate,
  TemplateObject,
  TemplateVariable,
  CompositionContext,
  CompositionResult,
  CompositionMetrics,
  CompositionConflict,
};

// Re-export enums for backward compatibility
export { SpatialRelation, AestheticPrinciple } from './types';

import { CompositionRules } from './CompositionRules';
import { SpatialIndex } from './SpatialIndex';
import { CompositionScorer } from './CompositionScorer';

// ============================================================================
// CompositionEngine — Thin orchestrator
// ============================================================================

/**
 * Main Composition Engine class.
 *
 * Manages rules, constraints, and templates; delegates scoring to
 * CompositionScorer and spatial queries to SpatialIndex.
 */
export class CompositionEngine {
  private ruleManager: CompositionRules = new CompositionRules();
  private spatialIndex: SpatialIndex = new SpatialIndex();
  private scorer: CompositionScorer = new CompositionScorer();

  private constraints: Map<string, CompositionConstraint> = new Map();
  private templates: Map<string, CompositionTemplate> = new Map();
  private activeConstraints: string[] = [];

  // ── Rule management (delegated) ──────────────────────────────────────

  /** Register a composition rule */
  registerRule(rule: CompositionRule): void {
    this.ruleManager.register(rule);
  }

  /** Get a rule by ID */
  getRule(id: string): CompositionRule | undefined {
    return this.ruleManager.get(id);
  }

  /** List all registered rules */
  listRules(): CompositionRule[] {
    return this.ruleManager.list();
  }

  /** Activate rules by ID */
  activateRules(ruleIds: string[]): void {
    this.ruleManager.activate(ruleIds);
  }

  // ── Constraint management ───────────────────────────────────────────

  /** Register a constraint */
  registerConstraint(constraint: CompositionConstraint): void {
    this.constraints.set(constraint.id, constraint);
  }

  /** Activate constraints by ID */
  activateConstraints(constraintIds: string[]): void {
    this.activeConstraints = constraintIds.filter(id => this.constraints.has(id));
  }

  // ── Template management ─────────────────────────────────────────────

  /** Register a template */
  registerTemplate(template: CompositionTemplate): void {
    this.templates.set(template.id, template);
  }

  /** Get a template by ID */
  getTemplate(id: string): CompositionTemplate | undefined {
    return this.templates.get(id);
  }

  /** List all registered templates */
  listTemplates(): CompositionTemplate[] {
    return Array.from(this.templates.values());
  }

  // ── Core operations ─────────────────────────────────────────────────

  /**
   * Apply a template to the scene
   */
  applyTemplate(
    templateId: string,
    context: CompositionContext,
    variables?: Record<string, unknown>,
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
   * Apply all active rules to the context.
   * Delegates to CompositionRules.
   */
  applyRules(context: CompositionContext): CompositionResult {
    return this.ruleManager.apply(
      context,
      (ctx) => this.calculateMetrics(ctx),
      (metrics, conflicts) => this.calculateOverallScore(metrics, conflicts),
    );
  }

  /**
   * Validate all active constraints.
   * Delegates to SpatialIndex.
   */
  validateConstraints(context: CompositionContext): CompositionConflict[] {
    return this.spatialIndex.validateConstraints(
      this.activeConstraints,
      this.constraints,
      context,
    );
  }

  // ── Metrics (delegated) ─────────────────────────────────────────────

  /**
   * Calculate composition quality metrics.
   * Delegates to CompositionScorer.
   */
  calculateMetrics(context: CompositionContext): CompositionMetrics {
    return this.scorer.calculateMetrics(context);
  }

  /**
   * Calculate overall score from metrics and conflicts.
   * Delegates to CompositionScorer.
   */
  private calculateOverallScore(
    metrics: CompositionMetrics,
    conflicts: CompositionConflict[],
  ): number {
    return this.scorer.calculateOverallScore(metrics, conflicts);
  }

  // ── Template helpers (kept here — small and specific to templates) ───

  /**
   * Merge template variables with defaults
   */
  private mergeTemplateVariables(
    variables: TemplateVariable[],
    overrides?: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

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
    _context: CompositionContext,
    variables: Record<string, unknown>,
  ): { nodeId: string; position?: Vector3; rotation?: Quaternion; scale?: Vector3 } | null {
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
   * Looks up per-component overrides using naming conventions in priority order:
   *   1. `{objectId}_{prefix}_{axis}` (most specific)
   *   2. `{prefix}_{axis}`
   *   3. `{axis}`
   *
   * String values containing `${varName}` are evaluated as mathematical expressions.
   */
  private substituteVector3(
    vector: Vector3,
    variables: Record<string, unknown>,
    prefix: string = '',
    objectId: string = '',
  ): Vector3 {
    const result = vector.clone();

    for (const axis of ['x', 'y', 'z'] as const) {
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
   * Features: nested variable resolution, cycle detection, basic arithmetic,
   * safe evaluation (only numeric and operator characters allowed).
   */
  private evaluateExpression(
    expr: string,
    variables: Record<string, unknown>,
    resolutionStack?: Set<string>,
  ): number {
    const stack = resolutionStack ?? new Set<string>();

    try {
      let resolved = expr.replace(/\$\{(\w+)\}/g, (_match: string, varName: string) => {
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
          stack.add(varName);
          const result = String(this.evaluateExpression(val, variables, stack));
          stack.delete(varName);
          return result;
        }
        return '0';
      });

      if (!resolved.trim()) return 0;

      if (!/^[\d\s+\-*/().%]+$/.test(resolved)) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[CompositionEngine] Expression contains unsafe characters: ${resolved}`);
        }
        return 0;
      }

      const result = new Function(`"use strict"; return (${resolved})`)();

      if (typeof result === 'number' && isFinite(result)) {
        return result;
      }
      return 0;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[CompositionEngine] evaluateExpression fallback:', err);
      }
      return 0;
    }
  }
}

// Export singleton instance
export const compositionEngine = new CompositionEngine();
