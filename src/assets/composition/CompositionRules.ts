/**
 * Composition Rules — Rule validation and application logic.
 *
 * Extracted from CompositionEngine.ts. Handles the registration, activation,
 * and application of composition rules to a CompositionContext.
 *
 * @module composition/CompositionRules
 */

import type {
  CompositionRule,
  CompositionContext,
  CompositionResult,
  CompositionConflict,
} from './types';

/**
 * Manages the lifecycle of composition rules: registration, activation,
 * and application (sorted by priority).
 */
export class CompositionRules {
  private rules: Map<string, CompositionRule> = new Map();
  private activeRuleIds: string[] = [];

  // ── Registration ────────────────────────────────────────────────────

  /** Register a composition rule. */
  register(rule: CompositionRule): void {
    this.rules.set(rule.id, rule);
  }

  /** Get a rule by ID. */
  get(id: string): CompositionRule | undefined {
    return this.rules.get(id);
  }

  /** List all registered rules. */
  list(): CompositionRule[] {
    return Array.from(this.rules.values());
  }

  // ── Activation ──────────────────────────────────────────────────────

  /** Activate rules by ID (only existing rules are activated). */
  activate(ruleIds: string[]): void {
    this.activeRuleIds = ruleIds.filter(id => this.rules.has(id));
  }

  /** Get the currently active rule IDs. */
  getActiveIds(): readonly string[] {
    return this.activeRuleIds;
  }

  // ── Application ─────────────────────────────────────────────────────

  /**
   * Apply all active rules to the given context.
   *
   * Rules are sorted by descending priority. If a rule's validator
   * returns false, a warning conflict is recorded and the rule is skipped.
   * If the applier throws, an error conflict is recorded.
   *
   * @param context  The current composition context
   * @param computeMetrics  Callback to (re-)compute metrics after rules are applied
   * @param computeScore    Callback to compute an overall score from metrics + conflicts
   */
  apply(
    context: CompositionContext,
    computeMetrics: (ctx: CompositionContext) => import('./types').CompositionMetrics,
    computeScore: (
      metrics: import('./types').CompositionMetrics,
      conflicts: CompositionConflict[],
    ) => number,
  ): CompositionResult {
    const result: CompositionResult = {
      success: true,
      transformations: [],
      conflicts: [],
      score: 0,
      metrics: computeMetrics(context),
    };

    // Sort by descending priority
    const sortedRules = this.activeRuleIds
      .map(id => this.rules.get(id))
      .filter((r): r is CompositionRule => r !== undefined)
      .sort((a, b) => b.priority - a.priority);

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
    result.metrics = computeMetrics(context);
    result.score = computeScore(result.metrics, result.conflicts);

    return result;
  }
}
