import { Node, Domain } from '../language/types.js';
/**
 * Extract the domain of a constraint language node
 * This analyzes the structure of expressions to determine variable domains
 */
export declare function constraintDomain(node: Node): Domain | undefined;
/**
 * Extract all variables from a constraint expression
 */
export declare function extractVariables(node: Node): Set<string>;
/**
 * Check if a node contains a specific variable
 */
export declare function containsVariable(node: Node, varName: string): boolean;
/**
 * Get free variables (variables not bound by quantifiers)
 */
export declare function getFreeVariables(node: Node): Set<string>;
/**
 * Analyze constraint complexity for solver optimization
 */
export interface ConstraintComplexity {
    numVariables: number;
    numConstants: number;
    depth: number;
    hasQuantifiers: boolean;
    hasGeometryPredicates: boolean;
    domainType?: string;
}
export declare function analyzeConstraintComplexity(node: Node): ConstraintComplexity;
//# sourceMappingURL=constraint-domain.d.ts.map