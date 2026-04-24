/**
 * Domain Substitution Module
 *
 * Implements variable substitution in constraints and domains.
 * Ported from: infinigen/core/constraints/reasoning/domain_substitute.py (~1,100 LOC)
 *
 * This module handles:
 * - Variable substitution in expressions
 * - Domain substitution when variables are bound
 * - Constraint simplification after substitution
 */
import { Node } from '../language/types.js';
import { Domain } from '../language/types.js';
/**
 * Substitution result containing the substituted node and success flag
 */
export interface SubstitutionResult {
    node: Node;
    success: boolean;
    /** Variables that were successfully substituted */
    substitutedVars: Set<string>;
}
/**
 * Variable binding mapping variable names to their values/domains
 */
export interface VariableBinding {
    varName: string;
    value?: any;
    domain?: Domain;
}
/**
 * Substitute variables in a node with given bindings
 *
 * @param node - The node to substitute in
 * @param bindings - Variable bindings (name -> value or domain)
 * @returns SubstitutionResult with the substituted node
 */
export declare function substituteVariables(node: Node, bindings: Map<string, any | Domain>): SubstitutionResult;
/**
 * Substitute a single variable in a node
 *
 * @param node - The node to substitute in
 * @param varName - Name of variable to substitute
 * @param replacement - Replacement node or value
 * @returns New node with substitutions
 */
export declare function substituteVariable(node: Node, varName: string, replacement: Node | any): Node;
/**
 * Apply domain substitution to a constraint
 *
 * When a variable's domain is known, we can sometimes simplify
 * the constraint or detect contradictions early.
 *
 * @param node - Constraint node
 * @param domains - Map of variable names to their domains
 * @returns Simplified constraint node
 */
export declare function applyDomainSubstitution(node: Node, domains: Map<string, Domain>): Node;
/**
 * Compose multiple substitutions
 *
 * @param node - The node to substitute in
 * @param substitutions - Array of {varName, replacement} pairs
 * @returns Final substituted node
 */
export declare function composeSubstitutions(node: Node, substitutions: Array<{
    varName: string;
    replacement: Node | any;
}>): Node;
/**
 * Check if a substitution would create circular dependencies
 *
 * @param varName - Variable to substitute
 * @param replacement - Replacement expression
 * @returns True if substitution would be circular
 */
export declare function isCircularSubstitution(varName: string, replacement: Node): boolean;
/**
 * Safe substitution that checks for circularity
 *
 * @param node - The node to substitute in
 * @param varName - Variable to substitute
 * @param replacement - Replacement expression
 * @throws Error if substitution would be circular
 */
export declare function safeSubstituteVariable(node: Node, varName: string, replacement: Node | any): Node;
/**
 * Normalize a constraint by applying all possible substitutions and simplifications
 *
 * @param node - Constraint to normalize
 * @param domains - Known variable domains
 * @returns Normalized constraint
 */
export declare function normalizeConstraint(node: Node, domains?: Map<string, Domain>): Node;
//# sourceMappingURL=domain-substitute.d.ts.map