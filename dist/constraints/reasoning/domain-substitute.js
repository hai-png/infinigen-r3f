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
import { isConstant, evaluateConstant } from './constraint-constancy.js';
/**
 * Substitute variables in a node with given bindings
 *
 * @param node - The node to substitute in
 * @param bindings - Variable bindings (name -> value or domain)
 * @returns SubstitutionResult with the substituted node
 */
export function substituteVariables(node, bindings) {
    const substitutedVars = new Set();
    const substitute = (n) => {
        if (n.type === 'Variable') {
            const varNode = n;
            if (bindings.has(varNode.name)) {
                substitutedVars.add(varNode.name);
                const binding = bindings.get(varNode.name);
                // If binding is a constant value, return a constant node
                if (typeof binding !== 'object' || binding instanceof Array ||
                    (binding.constructor && !binding.type)) {
                    return createConstantNode(binding);
                }
                // If binding is a domain, keep as variable but mark for domain propagation
                if (binding.type) {
                    return n; // Keep variable, domain will be handled separately
                }
                return n;
            }
            return n;
        }
        if (n.type === 'Constant') {
            return n;
        }
        if (n.type === 'BinaryOp') {
            const binOp = n;
            const left = substitute(binOp.left);
            const right = substitute(binOp.right);
            // Try to simplify if both sides are constant
            if (isConstant(left) && isConstant(right)) {
                const result = evaluateConstant(binOp);
                if (result !== undefined) {
                    return createConstantNode(result);
                }
            }
            return {
                ...binOp,
                left,
                right
            };
        }
        if (n.type === 'UnaryOp') {
            const unOp = n;
            const operand = substitute(unOp.operand);
            // Simplify if operand is constant
            if (isConstant(operand)) {
                const result = evaluateConstant(unOp);
                if (result !== undefined) {
                    return createConstantNode(result);
                }
            }
            return {
                ...unOp,
                operand
            };
        }
        if (n.type === 'Relation') {
            const rel = n;
            const args = rel.args.map(arg => substitute(arg));
            // Check if relation can be evaluated (all args constant)
            if (args.every(arg => isConstant(arg))) {
                // Could evaluate relation here if needed
                // For now, keep as relation node
            }
            return {
                ...rel,
                args
            };
        }
        if (n.type === 'Quantifier') {
            const quant = n;
            // Don't substitute bound variable in quantifier scope
            const filteredBindings = new Map(bindings);
            filteredBindings.delete(quant.boundVar);
            const body = substitute(quant.body);
            return {
                ...quant,
                body
            };
        }
        if (n.type === 'FilterObjects') {
            const filter = n;
            const source = substitute(filter.source);
            const condition = substitute(filter.condition);
            return {
                ...filter,
                source,
                condition
            };
        }
        if (n.type === 'SetExpression') {
            const setExpr = n;
            const elements = setExpr.elements.map(elem => substitute(elem));
            return {
                ...setExpr,
                elements
            };
        }
        // Default: return unchanged
        return n;
    };
    const result = substitute(node);
    return {
        node: result,
        success: substitutedVars.size > 0,
        substitutedVars
    };
}
/**
 * Substitute a single variable in a node
 *
 * @param node - The node to substitute in
 * @param varName - Name of variable to substitute
 * @param replacement - Replacement node or value
 * @returns New node with substitutions
 */
export function substituteVariable(node, varName, replacement) {
    const bindings = new Map([[varName, replacement]]);
    const result = substituteVariables(node, bindings);
    return result.node;
}
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
export function applyDomainSubstitution(node, domains) {
    const substituteWithDomains = (n) => {
        if (n.type === 'Variable') {
            const varNode = n;
            // Variable itself doesn't change, but domain info is used elsewhere
            return n;
        }
        if (n.type === 'BinaryOp') {
            const binOp = n;
            const left = substituteWithDomains(binOp.left);
            const right = substituteWithDomains(binOp.right);
            // Check for domain-based simplifications
            const simplified = simplifyWithDomainInfo(binOp, left, right, domains);
            if (simplified) {
                return simplified;
            }
            return {
                ...binOp,
                left,
                right
            };
        }
        if (n.type === 'Relation') {
            const rel = n;
            const args = rel.args.map(arg => substituteWithDomains(arg));
            // Check for domain-based relation simplification
            const simplified = simplifyRelationWithDomains(rel, args, domains);
            if (simplified) {
                return simplified;
            }
            return {
                ...rel,
                args
            };
        }
        // Recurse for other node types
        if (n.type === 'UnaryOp') {
            const unOp = n;
            return {
                ...unOp,
                operand: substituteWithDomains(unOp.operand)
            };
        }
        if (n.type === 'Quantifier') {
            const quant = n;
            const filteredDomains = new Map(domains);
            filteredDomains.delete(quant.boundVar);
            return {
                ...quant,
                body: substituteWithDomains(quant.body)
            };
        }
        if (n.type === 'FilterObjects') {
            const filter = n;
            return {
                ...filter,
                source: substituteWithDomains(filter.source),
                condition: substituteWithDomains(filter.condition)
            };
        }
        if (n.type === 'SetExpression') {
            const setExpr = n;
            return {
                ...setExpr,
                elements: setExpr.elements.map(elem => substituteWithDomains(elem))
            };
        }
        return n;
    };
    return substituteWithDomains(node);
}
/**
 * Simplify binary operation using domain information
 */
function simplifyWithDomainInfo(node, left, right, domains) {
    // Example: If we know x > 5 and domain of x is [0, 3], contradiction!
    // This is a placeholder for more sophisticated domain reasoning
    if (node.opType === 'Comparison') {
        const compOp = node.op;
        // Get domains of variables in left and right
        const leftVars = extractVariablesFromNode(left);
        const rightVars = extractVariablesFromNode(right);
        // Check for numeric domain bounds
        for (const varName of leftVars) {
            const domain = domains.get(varName);
            if (domain && domain.type === 'NumericDomain') {
                const numDomain = domain;
                // Could check if comparison is always true/false given bounds
                // Implementation depends on specific comparison operator
            }
        }
    }
    return null; // No simplification possible
}
/**
 * Simplify relation using domain information
 */
function simplifyRelationWithDomains(node, args, domains) {
    // Check if all arguments have known domains
    const argDomains = args.map(arg => {
        if (arg.type === 'Variable') {
            return domains.get(arg.name);
        }
        return undefined;
    });
    // Example: If relation is Distance(x, y) < 0 and both have valid pose domains,
    // this is always false (distance can't be negative)
    if (node.relationType === 'Distance') {
        // Distance is always non-negative
        // Could simplify Distance(x,y) >= 0 to true
    }
    return null; // No simplification possible
}
/**
 * Extract all variable names from a node
 */
function extractVariablesFromNode(node) {
    const vars = new Set();
    const collect = (n) => {
        if (n.type === 'Variable') {
            vars.add(n.name);
        }
        else if (n.type === 'BinaryOp') {
            collect(n.left);
            collect(n.right);
        }
        else if (n.type === 'UnaryOp') {
            collect(n.operand);
        }
        else if (n.type === 'Relation') {
            n.args.forEach(collect);
        }
    };
    collect(node);
    return vars;
}
/**
 * Create a constant node from a value
 */
function createConstantNode(value) {
    return {
        type: 'Constant',
        value,
        constantType: typeof value === 'boolean' ? 'BoolConstant' :
            typeof value === 'number' ? 'ScalarConstant' :
                value instanceof Array ? 'VectorConstant' : 'ObjectConstant'
    };
}
/**
 * Compose multiple substitutions
 *
 * @param node - The node to substitute in
 * @param substitutions - Array of {varName, replacement} pairs
 * @returns Final substituted node
 */
export function composeSubstitutions(node, substitutions) {
    let result = node;
    for (const sub of substitutions) {
        result = substituteVariable(result, sub.varName, sub.replacement);
    }
    return result;
}
/**
 * Check if a substitution would create circular dependencies
 *
 * @param varName - Variable to substitute
 * @param replacement - Replacement expression
 * @returns True if substitution would be circular
 */
export function isCircularSubstitution(varName, replacement) {
    const varsInReplacement = extractVariablesFromNode(replacement);
    return varsInReplacement.has(varName);
}
/**
 * Safe substitution that checks for circularity
 *
 * @param node - The node to substitute in
 * @param varName - Variable to substitute
 * @param replacement - Replacement expression
 * @throws Error if substitution would be circular
 */
export function safeSubstituteVariable(node, varName, replacement) {
    const replacementNode = typeof replacement === 'object' && replacement.type
        ? replacement
        : createConstantNode(replacement);
    if (isCircularSubstitution(varName, replacementNode)) {
        throw new Error(`Circular substitution detected: ${varName} appears in its own replacement`);
    }
    return substituteVariable(node, varName, replacement);
}
/**
 * Normalize a constraint by applying all possible substitutions and simplifications
 *
 * @param node - Constraint to normalize
 * @param domains - Known variable domains
 * @returns Normalized constraint
 */
export function normalizeConstraint(node, domains = new Map()) {
    // Step 1: Apply domain substitution
    let result = applyDomainSubstitution(node, domains);
    // Step 2: Substitute any constant variables
    const constBindings = new Map();
    for (const [varName, domain] of domains.entries()) {
        if (domain.type === 'NumericDomain') {
            const numDomain = domain;
            if (numDomain.lower !== -Infinity && numDomain.lower === numDomain.upper) {
                constBindings.set(varName, numDomain.lower);
            }
        }
    }
    if (constBindings.size > 0) {
        const subResult = substituteVariables(result, constBindings);
        result = subResult.node;
    }
    // Step 3: Simplify constants
    // (Already done during substitution via isConstant checks)
    return result;
}
//# sourceMappingURL=domain-substitute.js.map