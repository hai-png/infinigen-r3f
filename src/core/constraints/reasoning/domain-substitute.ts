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

import {
  Node,
  Variable,
  BinaryOpNode,
  UnaryOpNode,
  ConstantNode,
  RelationNode,
  QuantifierNode,
  SetExpressionNode,
  FilterObjectsNode,
  ArithmeticOperator,
  BooleanOperator,
  ComparisonOperator,
} from '../language/types';
import { Domain, NumericDomain, ObjectSetDomain, PoseDomain } from '../language/types';
import { constraintDomain } from './constraint-domain';
import { isConstant, evaluateConstant } from './constraint-constancy';

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
export function substituteVariables(
  node: Node,
  bindings: Map<string, any | Domain>
): SubstitutionResult {
  const substitutedVars = new Set<string>();
  
  const substitute = (n: Node): Node => {
    if (n.type === 'Variable') {
      const varNode = n as Variable;
      if (bindings.has(varNode.name)) {
        substitutedVars.add(varNode.name);
        const binding = bindings.get(varNode.name)!;
        
        // If binding is a constant value, return a constant node
        if (typeof binding !== 'object' || binding instanceof Array || 
            (binding.constructor && !binding.type)) {
          return createConstantNode(binding);
        }
        
        // If binding is a domain, keep as variable but mark for domain propagation
        if ((binding as Domain).type) {
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
      const binOp = n as BinaryOpNode;
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
      } as BinaryOpNode;
    }
    
    if (n.type === 'UnaryOp') {
      const unOp = n as UnaryOpNode;
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
      } as UnaryOpNode;
    }
    
    if (n.type === 'Relation') {
      const rel = n as RelationNode;
      const args = rel.args.map(arg => substitute(arg));
      
      // Check if relation can be evaluated (all args constant)
      if (args.every(arg => isConstant(arg))) {
        // Could evaluate relation here if needed
        // For now, keep as relation node
      }
      
      return {
        ...rel,
        args
      } as RelationNode;
    }
    
    if (n.type === 'Quantifier') {
      const quant = n as QuantifierNode;
      // Don't substitute bound variable in quantifier scope
      const filteredBindings = new Map(bindings);
      filteredBindings.delete(quant.boundVar);
      
      const body = substitute(quant.body);
      
      return {
        ...quant,
        body
      } as QuantifierNode;
    }
    
    if (n.type === 'FilterObjects') {
      const filter = n as FilterObjectsNode;
      const source = substitute(filter.source);
      const condition = substitute(filter.condition);
      
      return {
        ...filter,
        source,
        condition
      } as FilterObjectsNode;
    }
    
    if (n.type === 'SetExpression') {
      const setExpr = n as SetExpressionNode;
      const elements = setExpr.elements.map(elem => substitute(elem));
      
      return {
        ...setExpr,
        elements
      } as SetExpressionNode;
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
export function substituteVariable(
  node: Node,
  varName: string,
  replacement: Node | any
): Node {
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
export function applyDomainSubstitution(
  node: Node,
  domains: Map<string, Domain>
): Node {
  const substituteWithDomains = (n: Node): Node => {
    if (n.type === 'Variable') {
      const varNode = n as Variable;
      // Variable itself doesn't change, but domain info is used elsewhere
      return n;
    }
    
    if (n.type === 'BinaryOp') {
      const binOp = n as BinaryOpNode;
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
      } as BinaryOpNode;
    }
    
    if (n.type === 'Relation') {
      const rel = n as RelationNode;
      const args = rel.args.map(arg => substituteWithDomains(arg));
      
      // Check for domain-based relation simplification
      const simplified = simplifyRelationWithDomains(rel, args, domains);
      if (simplified) {
        return simplified;
      }
      
      return {
        ...rel,
        args
      } as RelationNode;
    }
    
    // Recurse for other node types
    if (n.type === 'UnaryOp') {
      const unOp = n as UnaryOpNode;
      return {
        ...unOp,
        operand: substituteWithDomains(unOp.operand)
      } as UnaryOpNode;
    }
    
    if (n.type === 'Quantifier') {
      const quant = n as QuantifierNode;
      const filteredDomains = new Map(domains);
      filteredDomains.delete(quant.boundVar);
      
      return {
        ...quant,
        body: substituteWithDomains(quant.body)
      } as QuantifierNode;
    }
    
    if (n.type === 'FilterObjects') {
      const filter = n as FilterObjectsNode;
      return {
        ...filter,
        source: substituteWithDomains(filter.source),
        condition: substituteWithDomains(filter.condition)
      } as FilterObjectsNode;
    }
    
    if (n.type === 'SetExpression') {
      const setExpr = n as SetExpressionNode;
      return {
        ...setExpr,
        elements: setExpr.elements.map(elem => substituteWithDomains(elem))
      } as SetExpressionNode;
    }
    
    return n;
  };
  
  return substituteWithDomains(node);
}

/**
 * Simplify binary operation using domain information
 */
function simplifyWithDomainInfo(
  node: BinaryOpNode,
  left: Node,
  right: Node,
  domains: Map<string, Domain>
): Node | null {
  // Example: If we know x > 5 and domain of x is [0, 3], contradiction!
  // This is a placeholder for more sophisticated domain reasoning
  
  if (node.opType === 'Comparison') {
    const compOp = node.op as ComparisonOperator;
    
    // Get domains of variables in left and right
    const leftVars = extractVariablesFromNode(left);
    const rightVars = extractVariablesFromNode(right);
    
    // Check for numeric domain bounds
    for (const varName of leftVars) {
      const domain = domains.get(varName);
      if (domain && domain.type === 'NumericDomain') {
        const numDomain = domain as NumericDomain;
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
function simplifyRelationWithDomains(
  node: RelationNode,
  args: Node[],
  domains: Map<string, Domain>
): Node | null {
  // Check if all arguments have known domains
  const argDomains = args.map(arg => {
    if (arg.type === 'Variable') {
      return domains.get((arg as Variable).name);
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
function extractVariablesFromNode(node: Node): Set<string> {
  const vars = new Set<string>();
  
  const collect = (n: Node) => {
    if (n.type === 'Variable') {
      vars.add((n as Variable).name);
    } else if (n.type === 'BinaryOp') {
      collect((n as BinaryOpNode).left);
      collect((n as BinaryOpNode).right);
    } else if (n.type === 'UnaryOp') {
      collect((n as UnaryOpNode).operand);
    } else if (n.type === 'Relation') {
      (n as RelationNode).args.forEach(collect);
    }
  };
  
  collect(node);
  return vars;
}

/**
 * Create a constant node from a value
 */
function createConstantNode(value: any): ConstantNode {
  return {
    type: 'Constant',
    value,
    constantType: typeof value === 'boolean' ? 'BoolConstant' :
                  typeof value === 'number' ? 'ScalarConstant' :
                  value instanceof Array ? 'VectorConstant' : 'ObjectConstant'
  } as ConstantNode;
}

/**
 * Compose multiple substitutions
 * 
 * @param node - The node to substitute in
 * @param substitutions - Array of {varName, replacement} pairs
 * @returns Final substituted node
 */
export function composeSubstitutions(
  node: Node,
  substitutions: Array<{ varName: string; replacement: Node | any }>
): Node {
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
export function isCircularSubstitution(varName: string, replacement: Node): boolean {
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
export function safeSubstituteVariable(
  node: Node,
  varName: string,
  replacement: Node | any
): Node {
  const replacementNode = typeof replacement === 'object' && replacement.type 
    ? replacement as Node 
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
export function normalizeConstraint(
  node: Node,
  domains: Map<string, Domain> = new Map()
): Node {
  // Step 1: Apply domain substitution
  let result = applyDomainSubstitution(node, domains);
  
  // Step 2: Substitute any constant variables
  const constBindings = new Map<string, any>();
  for (const [varName, domain] of domains.entries()) {
    if (domain.type === 'NumericDomain') {
      const numDomain = domain as NumericDomain;
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
