/**
 * Constraint Language Utilities
 *
 * Helper functions for constraint manipulation, simplification, and domain operations.
 * Ported from: constraint_language/util.py
 */
import type { ConstraintNode, ExpressionNode, Domain } from './types';
import type { State } from '../constraints/evaluator/state';
/**
 * Simplify a constraint node by evaluating constant subexpressions
 */
export declare function simplifyConstraint(node: ConstraintNode): ConstraintNode;
/**
 * Simplify an expression node by evaluating constant subexpressions
 */
export declare function simplifyExpression(node: ExpressionNode): ExpressionNode;
/**
 * Extract all variables from a constraint node
 */
export declare function extractVariables(node: ConstraintNode): Set<string>;
/**
 * Check if a constraint is satisfiable given current domains
 */
export declare function isSatisfiable(constraint: ConstraintNode, domains: Map<string, Domain>, state?: State): boolean;
/**
 * Get the tightest possible bounds for a numeric expression
 */
export declare function getExpressionBounds(expr: ExpressionNode, domains: Map<string, Domain>): [number, number];
/**
 * Substitute a variable with an expression in a constraint
 */
export declare function substituteVariable(node: ConstraintNode | ExpressionNode, varName: string, replacement: ExpressionNode): ConstraintNode | ExpressionNode;
/**
 * Normalize a constraint to conjunctive normal form (CNF)
 */
export declare function toCNF(node: ConstraintNode): ConstraintNode;
/**
 * Compute the support set of a constraint (variables that affect its truth value)
 */
export declare function supportSet(node: ConstraintNode): Set<string>;
/**
 * Check if two constraints are syntactically equal
 */
export declare function constraintsEqual(a: ConstraintNode, b: ConstraintNode): boolean;
/**
 * Estimate the computational complexity of evaluating a constraint
 */
export declare function estimateComplexity(node: ConstraintNode): number;
/**
 * Create a human-readable string representation of a constraint
 */
export declare function constraintToString(node: ConstraintNode): string;
//# sourceMappingURL=util.d.ts.map