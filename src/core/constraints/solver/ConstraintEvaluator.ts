/**
 * ConstraintEvaluator — Unified State Evaluation
 *
 * Gap 3 Fix: Provides a single `evaluateState(state) => { loss, violations }`
 * function that works with the unified constraint system.
 *
 * Takes a Map<string, ObjectState> and a Relation[], evaluates each relation
 * against the state, and returns { totalLoss, violations } where each
 * Violation has { relation, objects, severity }.
 *
 * This is the default evaluation function for all solvers.
 */

import {
  ObjectState,
  Relation,
  RelationResult,
  TagSet,
  Tag,
} from '../unified/UnifiedConstraintSystem';

// ============================================================================
// Violation — Describes a single constraint violation
// ============================================================================

export interface Violation {
  /** The relation that was violated */
  relation: Relation;

  /** The IDs of the objects involved in the violation */
  objects: [string, string];

  /** How severe the violation is (0 = none, >0 = degree of violation) */
  severity: number;

  /** The full RelationResult for additional details */
  result: RelationResult;
}

// ============================================================================
// EvaluationResult — Result of evaluating an entire state
// ============================================================================

export interface EvaluationResult {
  /** Total loss across all violations */
  totalLoss: number;

  /** Number of hard constraint violations */
  hardViolationCount: number;

  /** Number of soft constraint violations */
  softViolationCount: number;

  /** Individual violations with details */
  violations: Violation[];

  /** Whether the state is fully valid (no violations) */
  isValid: boolean;

  /** Per-relation evaluation results for debugging */
  relationResults: Array<{
    relationName: string;
    childId: string;
    parentId: string;
    result: RelationResult;
  }>;
}

// ============================================================================
// ConstraintEvaluator
// ============================================================================

/**
 * Evaluates constraint satisfaction for an entire scene state.
 *
 * Usage:
 *   const evaluator = new ConstraintEvaluator();
 *   const result = evaluator.evaluate(state, relations);
 *   console.log(result.totalLoss, result.violations);
 *
 * Can also use the static convenience method:
 *   const result = ConstraintEvaluator.evaluateState(state, relations);
 */
export class ConstraintEvaluator {
  /** Whether to treat all relation violations as hard constraints */
  private treatRelationsAsHard: boolean;

  /** Weight for hard constraint violations */
  private hardWeight: number;

  /** Weight for soft constraint violations */
  private softWeight: number;

  constructor(options?: {
    treatRelationsAsHard?: boolean;
    hardWeight?: number;
    softWeight?: number;
  }) {
    this.treatRelationsAsHard = options?.treatRelationsAsHard ?? true;
    this.hardWeight = options?.hardWeight ?? 100;
    this.softWeight = options?.softWeight ?? 1;
  }

  /**
   * Evaluate all relations against a scene state.
   *
   * @param state Map of object ID to ObjectState
   * @param relations Array of relations to evaluate
   * @returns EvaluationResult with loss, violations, and details
   */
  evaluate(
    state: Map<string, ObjectState>,
    relations: Relation[]
  ): EvaluationResult {
    const violations: Violation[] = [];
    const relationResults: EvaluationResult['relationResults'] = [];
    let totalLoss = 0;
    let hardViolationCount = 0;
    let softViolationCount = 0;

    const entries = Array.from(state.entries());

    for (const relation of relations) {
      // Evaluate this relation against all applicable object pairs
      for (const [childId, childState] of entries) {
        // Skip if child tags don't match
        if (!relation.childTagsMatch(childState)) continue;

        for (const [parentId, parentState] of entries) {
          if (childId === parentId) continue;

          // Skip if parent tags don't match
          if (!relation.parentTagsMatch(parentState)) continue;

          // Evaluate the relation
          const result = relation.evaluate(childState, parentState);

          relationResults.push({
            relationName: relation.name,
            childId,
            parentId,
            result,
          });

          if (!result.satisfied) {
            const violation: Violation = {
              relation,
              objects: [childId, parentId],
              severity: result.violationAmount,
              result,
            };
            violations.push(violation);

            // Compute loss contribution
            const isHard = this.treatRelationsAsHard;
            const weight = isHard ? this.hardWeight : this.softWeight;
            totalLoss += result.violationAmount * weight;

            if (isHard) {
              hardViolationCount++;
            } else {
              softViolationCount++;
            }
          }
        }
      }
    }

    return {
      totalLoss,
      hardViolationCount,
      softViolationCount,
      violations,
      isValid: violations.length === 0,
      relationResults,
    };
  }

  /**
   * Evaluate only relations that involve a specific object.
   * Useful for incremental evaluation during SA solving.
   */
  evaluateForObject(
    state: Map<string, ObjectState>,
    relations: Relation[],
    objectId: string
  ): EvaluationResult {
    const objState = state.get(objectId);
    if (!objState) {
      return {
        totalLoss: 0,
        hardViolationCount: 0,
        softViolationCount: 0,
        violations: [],
        isValid: true,
        relationResults: [],
      };
    }

    const violations: Violation[] = [];
    const relationResults: EvaluationResult['relationResults'] = [];
    let totalLoss = 0;
    let hardViolationCount = 0;
    let softViolationCount = 0;

    for (const relation of relations) {
      // Check object as child
      if (relation.childTagsMatch(objState)) {
        for (const [parentId, parentState] of state) {
          if (parentId === objectId) continue;
          if (!relation.parentTagsMatch(parentState)) continue;

          const result = relation.evaluate(objState, parentState);
          relationResults.push({
            relationName: relation.name,
            childId: objectId,
            parentId,
            result,
          });

          if (!result.satisfied) {
            violations.push({
              relation,
              objects: [objectId, parentId],
              severity: result.violationAmount,
              result,
            });
            const weight = this.treatRelationsAsHard ? this.hardWeight : this.softWeight;
            totalLoss += result.violationAmount * weight;
            if (this.treatRelationsAsHard) hardViolationCount++;
            else softViolationCount++;
          }
        }
      }

      // Check object as parent
      if (relation.parentTagsMatch(objState)) {
        for (const [childId, childState] of state) {
          if (childId === objectId) continue;
          if (!relation.childTagsMatch(childState)) continue;

          const result = relation.evaluate(childState, objState);
          relationResults.push({
            relationName: relation.name,
            childId,
            parentId: objectId,
            result,
          });

          if (!result.satisfied) {
            violations.push({
              relation,
              objects: [childId, objectId],
              severity: result.violationAmount,
              result,
            });
            const weight = this.treatRelationsAsHard ? this.hardWeight : this.softWeight;
            totalLoss += result.violationAmount * weight;
            if (this.treatRelationsAsHard) hardViolationCount++;
            else softViolationCount++;
          }
        }
      }
    }

    return {
      totalLoss,
      hardViolationCount,
      softViolationCount,
      violations,
      isValid: violations.length === 0,
      relationResults,
    };
  }

  /**
   * Static convenience method: evaluate a full state against a set of relations.
   */
  static evaluateState(
    state: Map<string, ObjectState>,
    relations: Relation[],
    options?: { treatRelationsAsHard?: boolean; hardWeight?: number; softWeight?: number }
  ): EvaluationResult {
    const evaluator = new ConstraintEvaluator(options);
    return evaluator.evaluate(state, relations);
  }

  /**
   * Count the total number of violations.
   */
  static violationCount(result: EvaluationResult): number {
    return result.violations.length;
  }

  /**
   * Get the total severity (sum of all violation amounts).
   */
  static totalSeverity(result: EvaluationResult): number {
    return result.violations.reduce((sum, v) => sum + v.severity, 0);
  }
}
