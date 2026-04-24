// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick, David Yan
// Ported to TypeScript for React Three Fiber

import { Node, Domain, ObjectSetDomain, NumericDomain, PoseDomain, BBoxDomain, BooleanDomain } from '../language/types.js';
import { ScalarExpression, BoolExpression, ScalarConstant, BoolConstant, ScalarVariable, BoolVariable } from '../language/expression.js';
import { ObjectSetExpression, ObjectSetConstant, ObjectSetVariable, FilterObjects, UnionObjects, IntersectionObjects, DifferenceObjects, CountExpression } from '../language/set-reasoning.js';
import { Problem, BoolOperatorExpression, ScalarOperatorExpression, ItemExpression, TaggedExpression, SceneExpression } from '../language/constants.js';
import { Relation, AnyRelation, NegatedRelation, AndRelations, OrRelations } from '../language/relations.js';
import { GeometryPredicate, Distance, Angle, SurfaceArea, Volume, Count } from '../language/geometry.js';
import { ForAll, Exists, SumOver, MeanOver, MaxOver, MinOver } from '../language/set-reasoning.js';

/**
 * Extract the domain of a constraint language node
 * This analyzes the structure of expressions to determine variable domains
 */
export function constraintDomain(node: Node): Domain | undefined {
  const recurse = (n: Node): Domain | undefined => constraintDomain(n);

  // Handle Problem - return union of all constraint domains
  if (node instanceof Problem) {
    const domains: Domain[] = [];
    for (const constraint of node.constraints.values()) {
      const domain = recurse(constraint);
      if (domain) domains.push(domain);
    }
    for (const scoreTerm of node.scoreTerms.values()) {
      const domain = recurse(scoreTerm);
      if (domain) domains.push(domain);
    }
    
    if (domains.length === 0) return undefined;
    if (domains.length === 1) return domains[0];
    
    // Intersect all domains
    return intersectDomains(domains);
  }

  // Handle boolean operators - extract domains from operands
  if (node instanceof BoolOperatorExpression) {
    const operandDomains = node.operands
      .map(op => recurse(op))
      .filter((d): d is Domain => d !== undefined);
    
    if (operandDomains.length === 0) return undefined;
    if (operandDomains.length === 1) return operandDomains[0];
    
    return intersectDomains(operandDomains);
  }

  // Handle scalar operators
  if (node instanceof ScalarOperatorExpression) {
    const operandDomains = node.operands
      .map(op => recurse(op))
      .filter((d): d is Domain => d !== undefined);
    
    if (operandDomains.length === 0) return new NumericDomain();
    return operandDomains[0];
  }

  // Handle relations
  if (node instanceof Relation) {
    return extractRelationDomain(node);
  }

  // Handle object set expressions
  if (node instanceof ObjectSetExpression) {
    return extractObjectSetDomain(node);
  }

  // Handle geometry predicates
  if (node instanceof GeometryPredicate) {
    return new NumericDomain();
  }

  // Handle quantifiers
  if (node instanceof ForAll || node instanceof Exists || 
      node instanceof SumOver || node instanceof MeanOver ||
      node instanceof MaxOver || node instanceof MinOver) {
    return extractQuantifierDomain(node as any);
  }

  // Handle variables directly
  if (node instanceof ScalarVariable) {
    return new NumericDomain();
  }

  if (node instanceof BoolVariable) {
    return new BooleanDomain();
  }

  if (node instanceof ObjectSetVariable) {
    return new ObjectSetDomain();
  }

  // Handle constants
  if (node instanceof ScalarConstant || node instanceof BoolConstant) {
    return undefined; // Constants don't constrain domains
  }

  if (node instanceof ObjectSetConstant) {
    return undefined;
  }

  return undefined;
}

/**
 * Extract domain from a relation
 */
function extractRelationDomain(relation: Relation): Domain | undefined {
  if (relation instanceof NegatedRelation) {
    return constraintDomain(relation.relation);
  }

  if (relation instanceof AndRelations || relation instanceof OrRelations) {
    const domains = relation.relations
      .map(r => constraintDomain(r))
      .filter((d): d is Domain => d !== undefined);
    
    if (domains.length === 0) return undefined;
    return intersectDomains(domains);
  }

  // For other relations, extract domains from arguments
  const children = Array.from(relation.children().values());
  const domains = children
    .map(child => constraintDomain(child))
    .filter((d): d is Domain => d !== undefined);

  if (domains.length === 0) return undefined;
  return intersectDomains(domains);
}

/**
 * Extract domain from object set expression
 */
function extractObjectSetDomain(objSet: ObjectSetExpression): Domain | undefined {
  if (objSet instanceof ObjectSetConstant) {
    return new ObjectSetDomain(objSet.objectIds);
  }

  if (objSet instanceof ObjectSetVariable) {
    return new ObjectSetDomain();
  }

  if (objSet instanceof ItemExpression) {
    // Item references a variable in a set
    if (objSet.memberOf) {
      return constraintDomain(objSet.memberOf);
    }
    return new ObjectSetDomain();
  }

  if (objSet instanceof TaggedExpression) {
    return constraintDomain(objSet.objs);
  }

  if (objSet instanceof SceneExpression) {
    return new ObjectSetDomain();
  }

  if (objSet instanceof FilterObjects) {
    return constraintDomain(objSet.objs);
  }

  if (objSet instanceof UnionObjects) {
    const left = constraintDomain(objSet.left);
    const right = constraintDomain(objSet.right);
    if (!left && !right) return undefined;
    if (!left) return right;
    if (!right) return left;
    return unionDomains(left, right);
  }

  if (objSet instanceof IntersectionObjects) {
    const left = constraintDomain(objSet.left);
    const right = constraintDomain(objSet.right);
    if (!left && !right) return undefined;
    if (!left) return right;
    if (!right) return left;
    return intersectDomains([left, right]);
  }

  if (objSet instanceof DifferenceObjects) {
    return constraintDomain(objSet.left);
  }

  if (objSet instanceof CountExpression) {
    return new NumericDomain();
  }

  return new ObjectSetDomain();
}

/**
 * Extract domain from quantifier expression
 */
function extractQuantifierDomain(quantifier: any): Domain | undefined {
  if ('objs' in quantifier) {
    return constraintDomain(quantifier.objs);
  }
  return undefined;
}

/**
 * Intersect multiple domains
 */
function intersectDomains(domains: Domain[]): Domain {
  if (domains.length === 0) {
    throw new Error('Cannot intersect empty domain list');
  }
  
  let result = domains[0];
  for (let i = 1; i < domains.length; i++) {
    result = result.intersect(domains[i]);
  }
  return result;
}

/**
 * Union two domains
 */
function unionDomains(a: Domain, b: Domain): Domain {
  // For object set domains, union the object sets
  if (a instanceof ObjectSetDomain && b instanceof ObjectSetDomain) {
    if (!a.objects && !b.objects) return new ObjectSetDomain();
    if (!a.objects) return b;
    if (!b.objects) return a;
    
    const allObjects = [...new Set([...a.objects, ...b.objects])];
    return new ObjectSetDomain(allObjects);
  }
  
  // For numeric domains, create unbounded domain
  if (a instanceof NumericDomain && b instanceof NumericDomain) {
    return new NumericDomain();
  }
  
  // Default to first domain
  return a;
}

/**
 * Extract all variables from a constraint expression
 */
export function extractVariables(node: Node): Set<string> {
  const variables = new Set<string>();
  
  for (const child of node.traverse()) {
    if (child instanceof ScalarVariable || 
        child instanceof BoolVariable || 
        child instanceof ObjectSetVariable) {
      variables.add(child.name);
    } else if (child instanceof ItemExpression) {
      variables.add(child.name);
    }
  }
  
  return variables;
}

/**
 * Check if a node contains a specific variable
 */
export function containsVariable(node: Node, varName: string): boolean {
  for (const child of node.traverse()) {
    if (child instanceof ScalarVariable || 
        child instanceof BoolVariable || 
        child instanceof ObjectSetVariable) {
      if (child.name === varName) return true;
    } else if (child instanceof ItemExpression) {
      if (child.name === varName) return true;
    }
  }
  return false;
}

/**
 * Get free variables (variables not bound by quantifiers)
 */
export function getFreeVariables(node: Node): Set<string> {
  const allVars = extractVariables(node);
  const boundVars = new Set<string>();
  
  // Find all bound variables from quantifiers
  for (const child of node.traverse()) {
    if ((child instanceof ForAll || child instanceof Exists ||
         child instanceof SumOver || child instanceof MeanOver ||
         child instanceof MaxOver || child instanceof MinOver) &&
        'varName' in child) {
      boundVars.add((child as any).varName);
    }
  }
  
  const freeVars = new Set<string>();
  for (const v of allVars) {
    if (!boundVars.has(v)) {
      freeVars.add(v);
    }
  }
  
  return freeVars;
}

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

export function analyzeConstraintComplexity(node: Node): ConstraintComplexity {
  let numVariables = 0;
  let numConstants = 0;
  let maxDepth = 0;
  let hasQuantifiers = false;
  let hasGeometryPredicates = false;
  
  function traverse(n: Node, depth: number): void {
    maxDepth = Math.max(maxDepth, depth);
    
    if (n instanceof ScalarVariable || n instanceof BoolVariable || 
        n instanceof ObjectSetVariable || n instanceof ItemExpression) {
      numVariables++;
    }
    
    if (n instanceof ScalarConstant || n instanceof BoolConstant ||
        n instanceof ObjectSetConstant) {
      numConstants++;
    }
    
    if (n instanceof ForAll || n instanceof Exists ||
        n instanceof SumOver || n instanceof MeanOver ||
        n instanceof MaxOver || n instanceof MinOver) {
      hasQuantifiers = true;
    }
    
    if (n instanceof GeometryPredicate) {
      hasGeometryPredicates = true;
    }
    
    for (const [, child] of n.children()) {
      traverse(child, depth + 1);
    }
  }
  
  traverse(node, 0);
  
  const domain = constraintDomain(node);
  
  return {
    numVariables,
    numConstants,
    depth: maxDepth,
    hasQuantifiers,
    hasGeometryPredicates,
    domainType: domain?.type
  };
}
