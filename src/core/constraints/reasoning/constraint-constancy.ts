// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick
// Ported to TypeScript for React Three Fiber

import { Node, ScalarOperatorExpression, BoolOperatorExpression, ScalarConstant, BoolConstant } from '../language';

/**
 * Check if a constraint language node is a constant (can be evaluated without scene state)
 */
export function isConstant(node: Node): boolean {
  if (node instanceof ScalarConstant || node instanceof BoolConstant) {
    return true;
  }
  
  if (node instanceof ScalarOperatorExpression || node instanceof BoolOperatorExpression) {
    return node.operands.every(op => isConstant(op));
  }
  
  return false;
}

/**
 * Check if an expression evaluates to a known constant value
 */
export function evaluateConstant<T extends number | boolean>(node: any): T | null {
  if (!isConstant(node)) {
    return null;
  }

  if (node instanceof ScalarConstant) {
    return node.value as T;
  }

  if (node instanceof BoolConstant) {
    return node.value as T;
  }

  if (node instanceof ScalarOperatorExpression || node instanceof BoolOperatorExpression) {
    const operands = node.operands.map(op => evaluateConstant(op));
    if (operands.some(op => op === null)) {
      return null;
    }

    const ops = operands as Array<number | boolean>;
    
    switch (node.func) {
      // Scalar operations
      case 'add': return (ops[0] as number) + (ops[1] as number) as T;
      case 'sub': return (ops[0] as number) - (ops[1] as number) as T;
      case 'mul': return (ops[0] as number) * (ops[1] as number) as T;
      case 'div': return Math.floor((ops[0] as number) / (ops[1] as number)) as T;
      case 'mod': return (ops[0] as number) % (ops[1] as number) as T;
      case 'pow': return Math.pow(ops[0] as number, ops[1] as number) as T;
      case 'min': return Math.min(...(ops as number[])) as T;
      case 'max': return Math.max(...(ops as number[])) as T;
      
      // Boolean operations
      case 'and': return (ops[0] as boolean) && (ops[1] as boolean) as T;
      case 'or': return (ops[0] as boolean) || (ops[1] as boolean) as T;
      case 'eq': return (ops[0] as any) === (ops[1] as any) as T;
      case 'ne': return (ops[0] as any) !== (ops[1] as any) as T;
      case 'lt': return (ops[0] as number) < (ops[1] as number) as T;
      case 'le': return (ops[0] as number) <= (ops[1] as number) as T;
      case 'gt': return (ops[0] as number) > (ops[1] as number) as T;
      case 'ge': return (ops[0] as number) >= (ops[1] as number) as T;
      
      default:
        return null;
    }
  }

  return null;
}

/**
 * Simplify an expression by evaluating constant subexpressions
 */
export function simplifyConstant(node: any): any {
  if (!isConstant(node)) {
    return node;
  }

  const evaluated = evaluateConstant(node);
  if (evaluated !== null) {
    if (typeof evaluated === 'number') {
      return new ScalarConstant(evaluated);
    } else {
      return new BoolConstant(evaluated);
    }
  }

  return node;
}
