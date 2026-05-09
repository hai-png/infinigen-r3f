/**
 * Constraint Simplifier
 *
 * Ports: constraint simplification logic from the original Infinigen
 * constraint_language/__init__.py and related optimization passes.
 *
 * Applies algebraic simplifications to constraint expressions:
 *  - Constant folding (evaluate constant sub-expressions)
 *  - Redundant AND/OR branch removal (AND(true, x) → x; OR(false, x) → x)
 *  - Double negation elimination (NOT(NOT(x)) → x)
 *  - Trivial comparison collapse (constant == constant)
 *  - Duplicate constraint merging
 *  - Domain intersection simplification where one domain implies another
 */

import {
  Expression,
  ScalarExpression,
  BoolExpression,
  ScalarConstant,
  BoolConstant,
  ScalarOperatorExpression,
  BoolOperatorExpression,
  BoolNotExpression,
  ScalarNegateExpression,
  HingeLossExpression,
  ScalarIfElse,
  BoolIfElse,
  InRangeExpression,
} from '../language/expression';
import { Node, Variable, Domain } from '../language/types';
import { TagSet } from '../unified/UnifiedConstraintSystem';

// ============================================================================
// Public API
// ============================================================================

/**
 * Result of simplification containing the simplified expression
 * and metadata about what simplifications were applied.
 */
export interface SimplificationResult {
  /** The simplified expression */
  simplified: Expression;
  /** Number of simplification rules applied */
  rulesApplied: number;
  /** Description of applied rules */
  appliedRules: string[];
}

/**
 * Simplify a boolean expression by applying algebraic rules.
 *
 * @param expr The expression to simplify
 * @returns The simplified expression
 */
export function simplifyExpression(expr: BoolExpression): BoolExpression {
  const result = simplifyBoolExpr(expr, new Set());
  return result.simplified;
}

/**
 * Simplify a scalar expression by applying algebraic rules.
 *
 * @param expr The expression to simplify
 * @returns The simplified expression
 */
export function simplifyScalarExpression(expr: ScalarExpression): ScalarExpression {
  const result = simplifyScalarExpr(expr, new Set());
  return result.simplified;
}

/**
 * Simplify all constraints in a constraint map.
 * Removes constraints that simplify to true, and flags
 * constraints that simplify to false (contradictions).
 *
 * @param constraints Map of constraint name → boolean expression
 * @returns Simplified constraints and contradictions
 */
export function simplifyConstraintMap(
  constraints: Map<string, BoolExpression>
): { simplified: Map<string, BoolExpression>; contradictions: string[]; removed: string[] } {
  const simplified = new Map<string, BoolExpression>();
  const contradictions: string[] = [];
  const removed: string[] = [];

  for (const [name, constraint] of constraints) {
    const result = simplifyBoolExpr(constraint, new Set());

    // If constraint simplifies to constant true, it's trivially satisfied → remove
    if (result.simplified instanceof BoolConstant && result.simplified.value === true) {
      removed.push(name);
      continue;
    }

    // If constraint simplifies to constant false, it's a contradiction
    if (result.simplified instanceof BoolConstant && result.simplified.value === false) {
      contradictions.push(name);
    }

    simplified.set(name, result.simplified);
  }

  // Merge duplicate constraints (same expression structure)
  const seen = new Map<string, string>(); // expression key → constraint name
  const toMerge: string[] = [];

  for (const [name, constraint] of simplified) {
    const key = expressionKey(constraint);
    if (seen.has(key)) {
      toMerge.push(name);
    } else {
      seen.set(key, name);
    }
  }

  for (const name of toMerge) {
    simplified.delete(name);
  }

  return { simplified, contradictions, removed: [...removed, ...toMerge] };
}

/**
 * Simplify domain intersections where one domain implies another.
 * If domain A implies domain B, then A ∩ B = A (B is redundant).
 *
 * @param domains Array of domains to simplify
 * @returns Simplified array of domains with redundancies removed
 */
export function simplifyDomainIntersection(domains: Domain[]): Domain[] {
  const result: Domain[] = [];

  for (const domain of domains) {
    let isImplied = false;

    // Check if this domain is already implied by an existing domain in the result
    for (const existing of result) {
      if (existing.implies(domain)) {
        // existing is more specific than domain → domain is redundant
        isImplied = true;
        break;
      }
    }

    if (isImplied) continue;

    // Check if this domain implies any existing domain (replace the broader one)
    const toRemove: number[] = [];
    for (let i = 0; i < result.length; i++) {
      if (domain.implies(result[i])) {
        toRemove.push(i);
      }
    }

    // Remove broader domains (iterate in reverse to maintain indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      result.splice(toRemove[i], 1);
    }

    result.push(domain);
  }

  return result;
}

// ============================================================================
// Internal: Boolean Expression Simplification
// ============================================================================

function simplifyBoolExpr(
  expr: BoolExpression,
  visited: Set<string>
): { simplified: BoolExpression; rulesApplied: number; appliedRules: string[] } {
  const key = expressionKey(expr);
  if (visited.has(key)) {
    return { simplified: expr, rulesApplied: 0, appliedRules: [] };
  }
  visited.add(key);

  let rulesApplied = 0;
  const appliedRules: string[] = [];

  // ── BoolConstant: already simplified ──
  if (expr instanceof BoolConstant) {
    return { simplified: expr, rulesApplied: 0, appliedRules: [] };
  }

  // ── BoolNotExpression: NOT simplification ──
  if (expr instanceof BoolNotExpression) {
    const inner = simplifyBoolExpr(expr.operand, visited);

    // NOT(NOT(x)) → x (double negation elimination)
    if (inner.simplified instanceof BoolNotExpression) {
      return {
        simplified: inner.simplified.operand,
        rulesApplied: inner.rulesApplied + 1,
        appliedRules: [...inner.appliedRules, 'double_negation'],
      };
    }

    // NOT(true) → false, NOT(false) → true
    if (inner.simplified instanceof BoolConstant) {
      return {
        simplified: new BoolConstant(!inner.simplified.value),
        rulesApplied: inner.rulesApplied + 1,
        appliedRules: [...inner.appliedRules, 'not_constant'],
      };
    }

    return {
      simplified: new BoolNotExpression(inner.simplified),
      rulesApplied: inner.rulesApplied,
      appliedRules: inner.appliedRules,
    };
  }

  // ── BoolOperatorExpression: AND/OR/comparison simplification ──
  if (expr instanceof BoolOperatorExpression) {
    const op = expr.func as string;

    // ── AND simplification ──
    if (op === 'and') {
      const leftResult = expr.left ? simplifyBoolExpr(expr.left as BoolExpression, visited) : null;
      const rightResult = expr.right ? simplifyBoolExpr(expr.right as BoolExpression, visited) : null;

      if (leftResult && rightResult) {
        const l = leftResult.simplified;
        const r = rightResult.simplified;
        const totalRules = leftResult.rulesApplied + rightResult.rulesApplied;
        const totalAppliedRules = [...leftResult.appliedRules, ...rightResult.appliedRules];

        // AND(true, x) → x
        if (l instanceof BoolConstant && l.value === true) {
          return {
            simplified: r,
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'and_true_left'],
          };
        }

        // AND(x, true) → x
        if (r instanceof BoolConstant && r.value === true) {
          return {
            simplified: l,
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'and_true_right'],
          };
        }

        // AND(false, x) → false
        if (l instanceof BoolConstant && l.value === false) {
          return {
            simplified: new BoolConstant(false),
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'and_false_left'],
          };
        }

        // AND(x, false) → false
        if (r instanceof BoolConstant && r.value === false) {
          return {
            simplified: new BoolConstant(false),
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'and_false_right'],
          };
        }

        // AND(x, x) → x (idempotent)
        if (expressionKey(l) === expressionKey(r)) {
          return {
            simplified: l,
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'and_idempotent'],
          };
        }

        return {
          simplified: new BoolOperatorExpression(l, 'and', r),
          rulesApplied: totalRules,
          appliedRules: totalAppliedRules,
        };
      }
    }

    // ── OR simplification ──
    if (op === 'or') {
      const leftResult = expr.left ? simplifyBoolExpr(expr.left as BoolExpression, visited) : null;
      const rightResult = expr.right ? simplifyBoolExpr(expr.right as BoolExpression, visited) : null;

      if (leftResult && rightResult) {
        const l = leftResult.simplified;
        const r = rightResult.simplified;
        const totalRules = leftResult.rulesApplied + rightResult.rulesApplied;
        const totalAppliedRules = [...leftResult.appliedRules, ...rightResult.appliedRules];

        // OR(false, x) → x
        if (l instanceof BoolConstant && l.value === false) {
          return {
            simplified: r,
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'or_false_left'],
          };
        }

        // OR(x, false) → x
        if (r instanceof BoolConstant && r.value === false) {
          return {
            simplified: l,
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'or_false_right'],
          };
        }

        // OR(true, x) → true
        if (l instanceof BoolConstant && l.value === true) {
          return {
            simplified: new BoolConstant(true),
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'or_true_left'],
          };
        }

        // OR(x, true) → true
        if (r instanceof BoolConstant && r.value === true) {
          return {
            simplified: new BoolConstant(true),
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'or_true_right'],
          };
        }

        // OR(x, x) → x (idempotent)
        if (expressionKey(l) === expressionKey(r)) {
          return {
            simplified: l,
            rulesApplied: totalRules + 1,
            appliedRules: [...totalAppliedRules, 'or_idempotent'],
          };
        }

        return {
          simplified: new BoolOperatorExpression(l, 'or', r),
          rulesApplied: totalRules,
          appliedRules: totalAppliedRules,
        };
      }
    }

    // ── Comparison with constants ──
    if (['eq', 'neq', 'lt', 'lte', 'gt', 'gte'].includes(op)) {
      const leftResult = expr.left ? tryEvaluateConstant(expr.left as ScalarExpression) : null;
      const rightResult = expr.right ? tryEvaluateConstant(expr.right as ScalarExpression) : null;

      if (leftResult !== null && rightResult !== null) {
        const result = evaluateComparison(op, leftResult, rightResult);
        return {
          simplified: new BoolConstant(result),
          rulesApplied: 1,
          appliedRules: ['constant_comparison'],
        };
      }
    }

    // ── IMPLIES simplification: a => b ≡ !a || b ──
    if (op === 'implies') {
      const leftResult = expr.left ? simplifyBoolExpr(expr.left as BoolExpression, visited) : null;
      const rightResult = expr.right ? simplifyBoolExpr(expr.right as BoolExpression, visited) : null;

      if (leftResult && rightResult) {
        // true => x → x
        if (leftResult.simplified instanceof BoolConstant && leftResult.simplified.value === true) {
          return {
            simplified: rightResult.simplified,
            rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
            appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'implies_true'],
          };
        }

        // false => x → true (vacuously true)
        if (leftResult.simplified instanceof BoolConstant && leftResult.simplified.value === false) {
          return {
            simplified: new BoolConstant(true),
            rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
            appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'implies_false'],
          };
        }

        // x => true → true
        if (rightResult.simplified instanceof BoolConstant && rightResult.simplified.value === true) {
          return {
            simplified: new BoolConstant(true),
            rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
            appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'implies_rhs_true'],
          };
        }

        return {
          simplified: new BoolOperatorExpression(leftResult.simplified, 'implies', rightResult.simplified),
          rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied,
          appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules],
        };
      }
    }
  }

  // ── BoolIfElse simplification ──
  if (expr instanceof BoolIfElse) {
    const condResult = simplifyBoolExpr(expr.condition, visited);
    const thenResult = simplifyBoolExpr(expr.thenExpr, visited);
    const elseResult = simplifyBoolExpr(expr.elseExpr, visited);

    if (condResult.simplified instanceof BoolConstant) {
      return {
        simplified: condResult.simplified.value ? thenResult.simplified : elseResult.simplified,
        rulesApplied: condResult.rulesApplied + thenResult.rulesApplied + elseResult.rulesApplied + 1,
        appliedRules: [
          ...condResult.appliedRules,
          ...thenResult.appliedRules,
          ...elseResult.appliedRules,
          'ifelse_constant_condition',
        ],
      };
    }

    // if (c, x, x) → x
    if (expressionKey(thenResult.simplified) === expressionKey(elseResult.simplified)) {
      return {
        simplified: thenResult.simplified,
        rulesApplied: condResult.rulesApplied + thenResult.rulesApplied + elseResult.rulesApplied + 1,
        appliedRules: [
          ...condResult.appliedRules,
          ...thenResult.appliedRules,
          ...elseResult.appliedRules,
          'ifelse_same_branches',
        ],
      };
    }

    return {
      simplified: new BoolIfElse(condResult.simplified, thenResult.simplified, elseResult.simplified),
      rulesApplied: condResult.rulesApplied + thenResult.rulesApplied + elseResult.rulesApplied,
      appliedRules: [
        ...condResult.appliedRules,
        ...thenResult.appliedRules,
        ...elseResult.appliedRules,
      ],
    };
  }

  // ── Fallback: return as-is ──
  return { simplified: expr, rulesApplied: 0, appliedRules: [] };
}

// ============================================================================
// Internal: Scalar Expression Simplification
// ============================================================================

function simplifyScalarExpr(
  expr: ScalarExpression,
  visited: Set<string>
): { simplified: ScalarExpression; rulesApplied: number; appliedRules: string[] } {
  const key = expressionKey(expr);
  if (visited.has(key)) {
    return { simplified: expr, rulesApplied: 0, appliedRules: [] };
  }
  visited.add(key);

  // ── ScalarConstant: already simplified ──
  if (expr instanceof ScalarConstant) {
    return { simplified: expr, rulesApplied: 0, appliedRules: [] };
  }

  // ── Constant folding: if all sub-expressions are constant, evaluate ──
  const constVal = tryEvaluateConstant(expr);
  if (constVal !== null) {
    return {
      simplified: new ScalarConstant(constVal),
      rulesApplied: 1,
      appliedRules: ['constant_folding'],
    };
  }

  // ── ScalarNegateExpression ──
  if (expr instanceof ScalarNegateExpression) {
    const inner = simplifyScalarExpr(expr.operand, visited);

    // -(-x) → x
    if (inner.simplified instanceof ScalarNegateExpression) {
      return {
        simplified: inner.simplified.operand,
        rulesApplied: inner.rulesApplied + 1,
        appliedRules: [...inner.appliedRules, 'double_negate'],
      };
    }

    // -constant → constant
    if (inner.simplified instanceof ScalarConstant) {
      return {
        simplified: new ScalarConstant(-inner.simplified.value),
        rulesApplied: inner.rulesApplied + 1,
        appliedRules: [...inner.appliedRules, 'negate_constant'],
      };
    }

    return {
      simplified: new ScalarNegateExpression(inner.simplified),
      rulesApplied: inner.rulesApplied,
      appliedRules: inner.appliedRules,
    };
  }

  // ── ScalarOperatorExpression ──
  if (expr instanceof ScalarOperatorExpression) {
    const leftResult = simplifyScalarExpr(expr.left, visited);
    const rightResult = simplifyScalarExpr(expr.right, visited);

    // Try constant folding
    if (leftResult.simplified instanceof ScalarConstant && rightResult.simplified instanceof ScalarConstant) {
      const lv = leftResult.simplified.value;
      const rv = rightResult.simplified.value;
      const result = evaluateScalarOp(expr.operator, lv, rv);
      if (result !== null) {
        return {
          simplified: new ScalarConstant(result),
          rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
          appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'scalar_constant_fold'],
        };
      }
    }

    // x + 0 → x, 0 + x → x
    if (expr.operator === 'add') {
      if (leftResult.simplified instanceof ScalarConstant && leftResult.simplified.value === 0) {
        return {
          simplified: rightResult.simplified,
          rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
          appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'add_zero_left'],
        };
      }
      if (rightResult.simplified instanceof ScalarConstant && rightResult.simplified.value === 0) {
        return {
          simplified: leftResult.simplified,
          rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
          appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'add_zero_right'],
        };
      }
    }

    // x - 0 → x
    if (expr.operator === 'sub' && rightResult.simplified instanceof ScalarConstant && rightResult.simplified.value === 0) {
      return {
        simplified: leftResult.simplified,
        rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
        appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'sub_zero'],
      };
    }

    // x * 1 → x, 1 * x → x
    if (expr.operator === 'mul') {
      if (leftResult.simplified instanceof ScalarConstant && leftResult.simplified.value === 1) {
        return {
          simplified: rightResult.simplified,
          rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
          appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'mul_one_left'],
        };
      }
      if (rightResult.simplified instanceof ScalarConstant && rightResult.simplified.value === 1) {
        return {
          simplified: leftResult.simplified,
          rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
          appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'mul_one_right'],
        };
      }
      // x * 0 → 0, 0 * x → 0
      if (
        (leftResult.simplified instanceof ScalarConstant && leftResult.simplified.value === 0) ||
        (rightResult.simplified instanceof ScalarConstant && rightResult.simplified.value === 0)
      ) {
        return {
          simplified: new ScalarConstant(0),
          rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied + 1,
          appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules, 'mul_zero'],
        };
      }
    }

    return {
      simplified: new ScalarOperatorExpression(leftResult.simplified, expr.operator, rightResult.simplified),
      rulesApplied: leftResult.rulesApplied + rightResult.rulesApplied,
      appliedRules: [...leftResult.appliedRules, ...rightResult.appliedRules],
    };
  }

  // ── HingeLossExpression ──
  if (expr instanceof HingeLossExpression) {
    const valResult = simplifyScalarExpr(expr.value, visited);
    const lowResult = simplifyScalarExpr(expr.low, visited);
    const highResult = simplifyScalarExpr(expr.high, visited);

    // If all constant, evaluate
    if (
      valResult.simplified instanceof ScalarConstant &&
      lowResult.simplified instanceof ScalarConstant &&
      highResult.simplified instanceof ScalarConstant
    ) {
      const v = valResult.simplified.value;
      const lo = lowResult.simplified.value;
      const hi = highResult.simplified.value;
      const result = Math.max(0, lo - v) + Math.max(0, v - hi);
      return {
        simplified: new ScalarConstant(result),
        rulesApplied: valResult.rulesApplied + lowResult.rulesApplied + highResult.rulesApplied + 1,
        appliedRules: [
          ...valResult.appliedRules,
          ...lowResult.appliedRules,
          ...highResult.appliedRules,
          'hinge_constant_fold',
        ],
      };
    }

    return {
      simplified: new HingeLossExpression(valResult.simplified, lowResult.simplified, highResult.simplified),
      rulesApplied: valResult.rulesApplied + lowResult.rulesApplied + highResult.rulesApplied,
      appliedRules: [
        ...valResult.appliedRules,
        ...lowResult.appliedRules,
        ...highResult.appliedRules,
      ],
    };
  }

  return { simplified: expr, rulesApplied: 0, appliedRules: [] };
}

// ============================================================================
// Internal: Helpers
// ============================================================================

/**
 * Try to evaluate a scalar expression as a constant.
 * Returns null if the expression contains variables.
 */
function tryEvaluateConstant(expr: ScalarExpression): number | null {
  try {
    const emptyState = new Map<Variable, any>();
    const result = expr.evaluate(emptyState);
    if (typeof result === 'number' && isFinite(result)) {
      return result;
    }
  } catch {
    // Expression contains unresolved variables
  }
  return null;
}

/**
 * Evaluate a comparison operator on two constant values.
 */
function evaluateComparison(op: string, lhs: number, rhs: number): boolean {
  switch (op) {
    case 'eq': return lhs === rhs;
    case 'neq': return lhs !== rhs;
    case 'lt': return lhs < rhs;
    case 'lte': return lhs <= rhs;
    case 'gt': return lhs > rhs;
    case 'gte': return lhs >= rhs;
    default: return false;
  }
}

/**
 * Evaluate a scalar binary operator on two constant values.
 */
function evaluateScalarOp(op: string, lhs: number, rhs: number): number | null {
  switch (op) {
    case 'add': return lhs + rhs;
    case 'sub': return lhs - rhs;
    case 'mul': return lhs * rhs;
    case 'div': return rhs !== 0 ? lhs / rhs : null;
    case 'mod': return rhs !== 0 ? lhs % rhs : null;
    case 'pow': return Math.pow(lhs, rhs);
    default: return null;
  }
}

/**
 * Generate a canonical string key for an expression for duplicate detection.
 * This is a best-effort structural hash; it doesn't need to be perfect.
 */
function expressionKey(expr: Expression): string {
  if (expr instanceof BoolConstant) return `BC:${expr.value}`;
  if (expr instanceof ScalarConstant) return `SC:${expr.value}`;

  if (expr instanceof BoolNotExpression) return `NOT(${expressionKey(expr.operand)})`;
  if (expr instanceof ScalarNegateExpression) return `NEG(${expressionKey(expr.operand)})`;

  if (expr instanceof BoolOperatorExpression) {
    const leftKey = expr.left ? expressionKey(expr.left as Expression) : '';
    const rightKey = expr.right ? expressionKey(expr.right as Expression) : '';
    return `BO:${expr.func}(${leftKey},${rightKey})`;
  }

  if (expr instanceof ScalarOperatorExpression) {
    return `SO:${expr.operator}(${expressionKey(expr.left)},${expressionKey(expr.right)})`;
  }

  if (expr instanceof HingeLossExpression) {
    return `HINGE(${expressionKey(expr.value)},${expressionKey(expr.low)},${expressionKey(expr.high)})`;
  }

  if (expr instanceof BoolIfElse) {
    return `IF(${expressionKey(expr.condition)},${expressionKey(expr.thenExpr)},${expressionKey(expr.elseExpr)})`;
  }

  if (expr instanceof ScalarIfElse) {
    return `SIF(${expressionKey(expr.condition)},${expressionKey(expr.thenExpr)},${expressionKey(expr.elseExpr)})`;
  }

  if (expr instanceof InRangeExpression) {
    return `INRANGE(${expressionKey(expr.value)},${expressionKey(expr.low)},${expressionKey(expr.high)})`;
  }

  // Fallback: use type + toString
  return `${expr.type}:${expr.toString()}`;
}
