// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick, David Yan
// Ported to TypeScript for React Three Fiber

import * as ops from './expression';
import { BoolExpression, ScalarExpression } from './expression';
import { Domain } from './domain';
import { constraintDomain } from './constraint-domain';
import { domainTagSubstitute } from './domain-substitute';
import { isConstant } from './constraint-constancy';
import { Variable } from '../tags';
import { ObjectSetExpression, CountExpression } from './set-reasoning';
import { Problem, BoolOperatorExpression, ScalarOperatorExpression } from './constants';

/**
 * Bound representation for constraint bounding analysis
 */
export interface Bound {
  domain?: Domain;
  low?: number;
  high?: number;
}

/**
 * Create a bound from a comparison operation
 */
export function createBoundFromComparison(
  opFunc: string,
  lhs: (() => number) | ScalarExpression,
  rhs: (() => number) | ScalarExpression
): Bound {
  const lhsVal = isConstant(lhs as any) ? (lhs as any)() : undefined;
  const rhsVal = isConstant(rhs as any) ? (rhs as any)() : undefined;

  if (lhsVal === undefined && rhsVal === undefined) {
    throw new Error(`Attempted to create bound with neither side constant`);
  }

  const rightConst = rhsVal !== undefined;
  const val = rightConst ? rhsVal : lhsVal!;

  switch (opFunc) {
    case 'eq':
      return { low: val, high: val };
    case 'le':
      return rightConst ? { high: val } : { low: val };
    case 'ge':
      return rightConst ? { low: val } : { high: val };
    case 'lt':
      return rightConst ? { high: val - 1 } : { low: val + 1 };
    case 'gt':
      return rightConst ? { low: val + 1 } : { high: val - 1 };
    default:
      throw new Error(`Unhandled operator: ${opFunc}`);
  }
}

/**
 * Map a bound through a binary operation
 */
export function mapBound(
  bound: Bound,
  func: (a: number, b: number) => number,
  lhs?: number,
  rhs?: number
): Bound {
  if ((lhs === undefined) === (rhs === undefined)) {
    throw new Error('Expected exactly one of lhs or rhs to be provided');
  }

  if (lhs !== undefined) {
    return {
      low: func(lhs, bound.low!),
      high: func(lhs, bound.high!)
    };
  } else {
    return {
      low: func(bound.low!, rhs!),
      high: func(bound.high!, rhs!)
    };
  }
}

/**
 * Integer inverse operations mapping
 */
const intInverseOp: Record<string, string> = {
  'add': 'sub',
  'sub': 'add',
  'mul': 'div',
  'div': 'mul'
};

/**
 * Map bounds through scalar operator expressions
 */
export function expressionMapBoundBinop(
  node: ScalarOperatorExpression,
  bound: Bound
): Bound[] {
  const [lhs, rhs] = node.operands;
  const invFunc = intInverseOp[node.func];
  
  if (!invFunc) {
    return [];
  }

  const lhsConst = isConstant(lhs);
  const rhsConst = isConstant(rhs);

  if (!lhsConst && !rhsConst) {
    return [];
  }

  if (lhsConst && !rhsConst) {
    const lhsVal = (lhs as any)();
    return expressionMapBound(rhs as any, mapBound(bound, (a, b) => {
      switch (invFunc) {
        case 'sub': return a - b;
        case 'add': return a + b;
        case 'div': return Math.floor(a / b);
        case 'mul': return a * b;
        default: return b;
      }
    }, lhs=lhsVal));
  }

  if (!lhsConst && rhsConst) {
    const rhsVal = (rhs as any)();
    return expressionMapBound(lhs as any, mapBound(bound, (a, b) => {
      switch (invFunc) {
        case 'sub': return a + b;
        case 'add': return a - b;
        case 'div': return a * b;
        case 'mul': return Math.floor(a / b);
        default: return a;
      }
    }, rhs=rhsVal));
  }

  return [];
}

/**
 * Map bounds through expressions
 */
export function expressionMapBound(
  node: any,
  bound: Bound
): Bound[] {
  if (node instanceof ScalarOperatorExpression) {
    if (intInverseOp[node.func]) {
      return expressionMapBoundBinop(node, bound);
    }
  }

  if (node instanceof CountExpression) {
    return expressionMapBound(node.objs, bound);
  }

  if (node instanceof ObjectSetExpression) {
    const domain = constraintDomain(node);
    return [{
      domain,
      low: bound.low,
      high: bound.high
    }];
  }

  return [];
}

/**
 * Evaluate expressions with known variables
 */
export function evaluateKnownVars(
  node: any,
  knownVars: Array<[Domain, number]>
): number | null {
  if (isConstant(node)) {
    return null;
  }

  if (node instanceof ScalarOperatorExpression) {
    const [lhs, rhs] = node.operands;
    if (intInverseOp[node.func]) {
      if (isConstant(lhs)) {
        const rhsEval = evaluateKnownVars(rhs, knownVars);
        if (rhsEval !== null) {
          return node.func((lhs as any)(), rhsEval);
        }
      } else {
        const lhsEval = evaluateKnownVars(lhs, knownVars);
        if (lhsEval !== null) {
          return node.func(lhsEval, (rhs as any)());
        }
      }
    }
  }

  if (node instanceof CountExpression) {
    return evaluateKnownVars(node.objs, knownVars);
  }

  if (node instanceof ObjectSetExpression) {
    const domain = constraintDomain(node);
    const vals = knownVars
      .filter(([knownDomain]) => domain as any === knownDomain)
      .map(([, val]) => val);
    
    return vals.length > 0 ? Math.min(...vals) : null;
  }

  throw new Error(`Not implemented: ${node.constructor.name}`);
}

/**
 * Extract bounds from constraints
 */
export function constraintBounds(node: any, state?: any): Bound[] {
  const recurse = (n: any) => constraintBounds(n, state);

  if (node instanceof Problem) {
    const constraints = Array.from(node.constraints.values());
    return constraints.flatMap(recurse);
  }

  if (node instanceof BoolOperatorExpression && node.func === 'and') {
    return node.operands.flatMap(recurse);
  }

  // Handle in_range constraints
  if (node.func === 'inRange') {
    const [val, low, high] = node.operands;
    const lowUpdated = updateVar(low, state);
    const highUpdated = updateVar(high, state);
    
    let lowVal: number | undefined;
    let highVal: number | undefined;
    
    if (isConstant(lowUpdated)) {
      lowVal = (lowUpdated as any)();
    }
    if (isConstant(highUpdated)) {
      highVal = (highUpdated as any)();
    }

    const bound: Bound = { low: lowVal, high: highVal };
    return expressionMapBound(val, bound);
  }

  // Handle comparison operators
  const comparisonOps = ['eq', 'le', 'ge', 'lt', 'gt'];
  if (node instanceof BoolOperatorExpression && comparisonOps.includes(node.func)) {
    const [lhs, rhs] = node.operands;
    const lhsUpdated = updateVar(lhs, state);
    const rhsUpdated = updateVar(rhs, state);

    if (!isConstant(lhsUpdated) && !isConstant(rhsUpdated)) {
      return [];
    }

    const bound = createBoundFromComparison(node.func, lhsUpdated, rhsUpdated);
    const expr = isConstant(lhsUpdated) ? rhsUpdated : lhsUpdated;
    return expressionMapBound(expr, bound);
  }

  return [];
}

/**
 * Update variable with known values from state
 */
function updateVar(varNode: any, state: any): any {
  if (!isConstant(varNode) && typeof varNode !== 'number' && state !== null) {
    const evaluated = evaluateKnownVars(varNode, state);
    return evaluated !== null ? evaluated : varNode;
  }
  return varNode;
}

/**
 * Check if a bound is valid (has at least one bound defined)
 */
export function isValidBound(bound: Bound): boolean {
  return bound.low !== undefined || bound.high !== undefined;
}

/**
 * Intersect two bounds
 */
export function intersectBounds(a: Bound, b: Bound): Bound {
  return {
    domain: a.domain || b.domain,
    low: a.low !== undefined && b.low !== undefined 
      ? Math.max(a.low, b.low) 
      : a.low ?? b.low,
    high: a.high !== undefined && b.high !== undefined 
      ? Math.min(a.high, b.high) 
      : a.high ?? b.high
  };
}

/**
 * Union two bounds
 */
export function unionBounds(a: Bound, b: Bound): Bound {
  return {
    domain: a.domain || b.domain,
    low: a.low !== undefined && b.low !== undefined 
      ? Math.min(a.low, b.low) 
      : a.low ?? b.low,
    high: a.high !== undefined && b.high !== undefined 
      ? Math.max(a.high, b.high) 
      : a.high ?? b.high
  };
}

/**
 * Bound analysis - analyze constraints to extract bounds
 * Alias for constraintBounds used by core-consolidated module
 */
export const boundAnalysis = constraintBounds;

/**
 * Check if a value satisfies a bound
 */
export function satisfiesBound(value: number, bound: Bound): boolean {
  if (bound.low !== undefined && value < bound.low) {
    return false;
  }
  if (bound.high !== undefined && value > bound.high) {
    return false;
  }
  return true;
}
