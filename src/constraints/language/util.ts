/**
 * Constraint Language Utilities
 * 
 * Helper functions for constraint manipulation, simplification, and domain operations.
 * Ported from: constraint_language/util.py
 */

import type {
  ConstraintNode,
  ExpressionNode,
  Variable,
  Constant,
  Domain,
  ObjectSetDomain,
  NumericDomain,
} from './types';
import { evaluateNode } from '../constraints/evaluator/evaluate';
import type { State } from '../constraints/evaluator/state';

/**
 * Simplify a constraint node by evaluating constant subexpressions
 */
export function simplifyConstraint(node: ConstraintNode): ConstraintNode {
  if (node.type === 'And' || node.type === 'Or') {
    const simplifiedChildren = node.children.map(simplifyConstraint);
    
    // Remove True nodes from And, False nodes from Or
    const filtered = simplifiedChildren.filter(child => {
      if (node.type === 'And' && child.type === 'Constant' && child.value === true) return false;
      if (node.type === 'Or' && child.type === 'Constant' && child.value === false) return false;
      return true;
    });
    
    // If any child is False in And or True in Or, the whole expression simplifies
    if (node.type === 'And' && filtered.some(c => c.type === 'Constant' && c.value === false)) {
      return { type: 'Constant', value: false };
    }
    if (node.type === 'Or' && filtered.some(c => c.type === 'Constant' && c.value === true)) {
      return { type: 'Constant', value: true };
    }
    
    // Flatten nested And/Or
    const flattened: ConstraintNode[] = [];
    for (const child of filtered) {
      if (child.type === node.type && 'children' in child) {
        flattened.push(...(child as any).children);
      } else {
        flattened.push(child);
      }
    }
    
    if (flattened.length === 0) {
      return { type: 'Constant', value: node.type === 'And' };
    }
    if (flattened.length === 1) {
      return flattened[0];
    }
    
    return { ...node, children: flattened } as ConstraintNode;
  }
  
  if (node.type === 'Not') {
    const simplified = simplifyConstraint(node.child);
    if (simplified.type === 'Constant') {
      return { type: 'Constant', value: !simplified.value };
    }
    if (simplified.type === 'Not') {
      return simplified.child; // Double negation
    }
    return { ...node, child: simplified };
  }
  
  if (node.type === 'Comparison') {
    const simplifiedLeft = simplifyExpression(node.left);
    const simplifiedRight = simplifyExpression(node.right);
    
    // Evaluate if both sides are constants
    if (simplifiedLeft.type === 'Constant' && simplifiedRight.type === 'Constant') {
      const leftVal = simplifiedLeft.value;
      const rightVal = simplifiedRight.value;
      
      let result: boolean;
      switch (node.op) {
        case 'Eq': result = leftVal === rightVal; break;
        case 'Ne': result = leftVal !== rightVal; break;
        case 'Lt': result = leftVal < rightVal; break;
        case 'Le': result = leftVal <= rightVal; break;
        case 'Gt': result = leftVal > rightVal; break;
        case 'Ge': result = leftVal >= rightVal; break;
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
      
      return { type: 'Constant', value: result };
    }
    
    return { ...node, left: simplifiedLeft, right: simplifiedRight };
  }
  
  return node;
}

/**
 * Simplify an expression node by evaluating constant subexpressions
 */
export function simplifyExpression(node: ExpressionNode): ExpressionNode {
  if (node.type === 'Constant') {
    return node;
  }
  
  if (node.type === 'Variable') {
    return node;
  }
  
  if (node.type === 'BinaryOp') {
    const simplifiedLeft = simplifyExpression(node.left);
    const simplifiedRight = simplifyExpression(node.right);
    
    // Evaluate if both operands are constants
    if (simplifiedLeft.type === 'Constant' && simplifiedRight.type === 'Constant') {
      const leftVal = simplifiedLeft.value;
      const rightVal = simplifiedRight.value;
      
      let result: number;
      switch (node.op) {
        case 'Add': result = leftVal + rightVal; break;
        case 'Sub': result = leftVal - rightVal; break;
        case 'Mul': result = leftVal * rightVal; break;
        case 'Div': result = leftVal / rightVal; break;
        case 'Mod': result = leftVal % rightVal; break;
        case 'Pow': result = Math.pow(leftVal, rightVal); break;
        case 'Min': result = Math.min(leftVal, rightVal); break;
        case 'Max': result = Math.max(leftVal, rightVal); break;
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
      
      return { type: 'Constant', value: result };
    }
    
    // Identity operations
    if (node.op === 'Add' && simplifiedRight.type === 'Constant' && simplifiedRight.value === 0) {
      return simplifiedLeft;
    }
    if (node.op === 'Add' && simplifiedLeft.type === 'Constant' && simplifiedLeft.value === 0) {
      return simplifiedRight;
    }
    if (node.op === 'Sub' && simplifiedRight.type === 'Constant' && simplifiedRight.value === 0) {
      return simplifiedLeft;
    }
    if (node.op === 'Mul' && simplifiedRight.type === 'Constant' && simplifiedRight.value === 1) {
      return simplifiedLeft;
    }
    if (node.op === 'Mul' && simplifiedLeft.type === 'Constant' && simplifiedLeft.value === 1) {
      return simplifiedRight;
    }
    if (node.op === 'Mul' && (
      (simplifiedRight.type === 'Constant' && simplifiedRight.value === 0) ||
      (simplifiedLeft.type === 'Constant' && simplifiedLeft.value === 0)
    )) {
      return { type: 'Constant', value: 0 };
    }
    
    return { ...node, left: simplifiedLeft, right: simplifiedRight };
  }
  
  if (node.type === 'UnaryOp') {
    const simplifiedChild = simplifyExpression(node.child);
    
    if (simplifiedChild.type === 'Constant') {
      if (node.op === 'Neg') {
        return { type: 'Constant', value: -simplifiedChild.value };
      }
      if (node.op === 'Abs') {
        return { type: 'Constant', value: Math.abs(simplifiedChild.value) };
      }
    }
    
    return { ...node, child: simplifiedChild };
  }
  
  if (node.type === 'FunctionCall') {
    const simplifiedArgs = node.args.map(simplifyExpression);
    
    // Evaluate if all arguments are constants
    if (simplifiedArgs.every(arg => arg.type === 'Constant')) {
      const values = simplifiedArgs.map(arg => (arg as Constant).value);
      
      let result: number;
      switch (node.name) {
        case 'sin': result = Math.sin(values[0]); break;
        case 'cos': result = Math.cos(values[0]); break;
        case 'tan': result = Math.tan(values[0]); break;
        case 'sqrt': result = Math.sqrt(values[0]); break;
        case 'log': result = Math.log(values[0]); break;
        case 'log10': result = Math.log10(values[0]); break;
        case 'exp': result = Math.exp(values[0]); break;
        case 'floor': result = Math.floor(values[0]); break;
        case 'ceil': result = Math.ceil(values[0]); break;
        case 'round': result = Math.round(values[0]); break;
        case 'sign': result = Math.sign(values[0]); break;
        case 'clamp': 
          result = Math.max(values[1], Math.min(values[2], values[0])); 
          break;
        default: 
          // Unknown function, keep as is
          return { ...node, args: simplifiedArgs };
      }
      
      return { type: 'Constant', value: result };
    }
    
    return { ...node, args: simplifiedArgs };
  }
  
  if (node.type === 'IfElse') {
    const simplifiedCond = simplifyExpression(node.condition);
    
    if (simplifiedCond.type === 'Constant') {
      // Return the appropriate branch
      return simplifyExpression(simplifiedCond.value ? node.thenExpr : node.elseExpr);
    }
    
    return {
      ...node,
      condition: simplifiedCond,
      thenExpr: simplifyExpression(node.thenExpr),
      elseExpr: simplifyExpression(node.elseExpr),
    };
  }
  
  return node;
}

/**
 * Extract all variables from a constraint node
 */
export function extractVariables(node: ConstraintNode): Set<string> {
  const variables = new Set<string>();
  
  function traverse(n: ConstraintNode | ExpressionNode) {
    if (n.type === 'Variable') {
      variables.add(n.name);
    }
    
    if ('children' in n && n.children) {
      n.children.forEach(traverse);
    }
    if ('child' in n && n.child) {
      traverse(n.child);
    }
    if ('left' in n && n.left) {
      traverse(n.left);
    }
    if ('right' in n && n.right) {
      traverse(n.right);
    }
    if ('args' in n && n.args) {
      n.args.forEach(traverse);
    }
    if ('condition' in n && n.condition) {
      traverse(n.condition);
      traverse((n as any).thenExpr);
      traverse((n as any).elseExpr);
    }
  }
  
  traverse(node);
  return variables;
}

/**
 * Check if a constraint is satisfiable given current domains
 */
export function isSatisfiable(
  constraint: ConstraintNode,
  domains: Map<string, Domain>,
  state?: State
): boolean {
  // Quick check: if constraint simplifies to False, it's unsatisfiable
  const simplified = simplifyConstraint(constraint);
  if (simplified.type === 'Constant' && simplified.value === false) {
    return false;
  }
  
  // Try to evaluate with domain bounds
  try {
    const result = evaluateNode(simplified, domains, state);
    if (result.type === 'Boolean' && typeof result.value === 'boolean') {
      return result.value;
    }
  } catch {
    // Evaluation failed, assume potentially satisfiable
  }
  
  return true; // Cannot determine, assume satisfiable
}

/**
 * Get the tightest possible bounds for a numeric expression
 */
export function getExpressionBounds(
  expr: ExpressionNode,
  domains: Map<string, Domain>
): [number, number] {
  if (expr.type === 'Constant') {
    return [expr.value, expr.value];
  }
  
  if (expr.type === 'Variable') {
    const domain = domains.get(expr.name);
    if (domain?.type === 'NumericDomain') {
      return [domain.min, domain.max];
    }
    return [-Infinity, Infinity];
  }
  
  if (expr.type === 'BinaryOp') {
    const [leftMin, leftMax] = getExpressionBounds(expr.left, domains);
    const [rightMin, rightMax] = getExpressionBounds(expr.right, domains);
    
    switch (expr.op) {
      case 'Add':
        return [leftMin + rightMin, leftMax + rightMax];
      case 'Sub':
        return [leftMin - rightMax, leftMax - rightMin];
      case 'Mul': {
        const candidates = [
          leftMin * rightMin,
          leftMin * rightMax,
          leftMax * rightMin,
          leftMax * rightMax,
        ];
        return [Math.min(...candidates), Math.max(...candidates)];
      }
      case 'Div':
        return [-Infinity, Infinity]; // Conservative
      case 'Min':
        return [Math.min(leftMin, rightMin), Math.min(leftMax, rightMax)];
      case 'Max':
        return [Math.max(leftMin, rightMin), Math.max(leftMax, rightMax)];
      default:
        return [-Infinity, Infinity];
    }
  }
  
  if (expr.type === 'UnaryOp') {
    const [min, max] = getExpressionBounds(expr.child, domains);
    if (expr.op === 'Neg') {
      return [-max, -min];
    }
    if (expr.op === 'Abs') {
      if (min >= 0) return [min, max];
      if (max <= 0) return [-max, -min];
      return [0, Math.max(-min, max)];
    }
  }
  
  return [-Infinity, Infinity];
}

/**
 * Substitute a variable with an expression in a constraint
 */
export function substituteVariable(
  node: ConstraintNode | ExpressionNode,
  varName: string,
  replacement: ExpressionNode
): ConstraintNode | ExpressionNode {
  if (node.type === 'Variable' && node.name === varName) {
    return replacement;
  }
  
  // Deep copy and substitute recursively
  if (node.type === 'BinaryOp') {
    return {
      ...node,
      left: substituteVariable(node.left, varName, replacement) as ExpressionNode,
      right: substituteVariable(node.right, varName, replacement) as ExpressionNode,
    };
  }
  
  if (node.type === 'UnaryOp') {
    return {
      ...node,
      child: substituteVariable(node.child, varName, replacement) as ExpressionNode,
    };
  }
  
  if (node.type === 'FunctionCall') {
    return {
      ...node,
      args: node.args.map(arg => substituteVariable(arg, varName, replacement) as ExpressionNode),
    };
  }
  
  if (node.type === 'Comparison') {
    return {
      ...node,
      left: substituteVariable(node.left, varName, replacement) as ExpressionNode,
      right: substituteVariable(node.right, varName, replacement) as ExpressionNode,
    };
  }
  
  if (node.type === 'And' || node.type === 'Or') {
    return {
      ...node,
      children: node.children.map(child => 
        substituteVariable(child, varName, replacement) as ConstraintNode
      ),
    };
  }
  
  if (node.type === 'Not') {
    return {
      ...node,
      child: substituteVariable(node.child, varName, replacement) as ConstraintNode,
    };
  }
  
  if (node.type === 'IfElse') {
    return {
      ...node,
      condition: substituteVariable(node.condition, varName, replacement) as ExpressionNode,
      thenExpr: substituteVariable(node.thenExpr, varName, replacement) as ExpressionNode,
      elseExpr: substituteVariable(node.elseExpr, varName, replacement) as ExpressionNode,
    };
  }
  
  return node;
}

/**
 * Normalize a constraint to conjunctive normal form (CNF)
 */
export function toCNF(node: ConstraintNode): ConstraintNode {
  // First simplify
  let simplified = simplifyConstraint(node);
  
  // Eliminate implications (if any)
  simplified = eliminateImplications(simplified);
  
  // Move NOT inward
  simplified = moveNotInward(simplified);
  
  // Distribute OR over AND
  simplified = distributeOrOverAnd(simplified);
  
  return simplified;
}

function eliminateImplications(node: ConstraintNode): ConstraintNode {
  // Handle implication elimination if needed
  // For now, just traverse children
  if (node.type === 'And' || node.type === 'Or') {
    return {
      ...node,
      children: node.children.map(eliminateImplications),
    };
  }
  if (node.type === 'Not') {
    return { ...node, child: eliminateImplications(node.child) };
  }
  return node;
}

function moveNotInward(node: ConstraintNode): ConstraintNode {
  if (node.type === 'Not') {
    const child = node.child;
    if (child.type === 'And') {
      // ¬(A ∧ B) → ¬A ∨ ¬B
      return {
        type: 'Or',
        children: child.children.map(c => moveNotInward({ type: 'Not', child: c })),
      };
    }
    if (child.type === 'Or') {
      // ¬(A ∨ B) → ¬A ∧ ¬B
      return {
        type: 'And',
        children: child.children.map(c => moveNotInward({ type: 'Not', child: c })),
      };
    }
    if (child.type === 'Not') {
      // ¬¬A → A
      return moveNotInward(child.child);
    }
  }
  
  if (node.type === 'And' || node.type === 'Or') {
    return {
      ...node,
      children: node.children.map(moveNotInward),
    };
  }
  
  return node;
}

function distributeOrOverAnd(node: ConstraintNode): ConstraintNode {
  if (node.type === 'And') {
    return {
      ...node,
      children: node.children.map(distributeOrOverAnd),
    };
  }
  
  if (node.type === 'Or') {
    const children = node.children.map(distributeOrOverAnd);
    
    // Find AND children
    const andIndex = children.findIndex(c => c.type === 'And');
    if (andIndex === -1) {
      return { ...node, children };
    }
    
    const andNode = children[andIndex] as any;
    const otherChildren = children.filter((_, i) => i !== andIndex);
    
    // Distribute: (A ∧ B) ∨ C → (A ∨ C) ∧ (B ∨ C)
    const distributed = andNode.children.map((andChild: ConstraintNode) => ({
      type: 'Or' as const,
      children: [andChild, ...otherChildren],
    }));
    
    return {
      type: 'And',
      children: distributed.map(distributeOrOverAnd),
    };
  }
  
  return node;
}

/**
 * Compute the support set of a constraint (variables that affect its truth value)
 */
export function supportSet(node: ConstraintNode): Set<string> {
  return extractVariables(node);
}

/**
 * Check if two constraints are syntactically equal
 */
export function constraintsEqual(a: ConstraintNode, b: ConstraintNode): boolean {
  if (a.type !== b.type) return false;
  
  if (a.type === 'Constant') {
    return a.value === (b as any).value;
  }
  
  if (a.type === 'Comparison') {
    return (
      a.op === (b as any).op &&
      expressionsEqual(a.left, (b as any).left) &&
      expressionsEqual(a.right, (b as any).right)
    );
  }
  
  if (a.type === 'And' || a.type === 'Or') {
    const aChildren = a.children;
    const bChildren = (b as any).children;
    if (aChildren.length !== bChildren.length) return false;
    return aChildren.every((c, i) => constraintsEqual(c, bChildren[i]));
  }
  
  if (a.type === 'Not') {
    return constraintsEqual(a.child, (b as any).child);
  }
  
  return true;
}

function expressionsEqual(a: ExpressionNode, b: ExpressionNode): boolean {
  if (a.type !== b.type) return false;
  
  if (a.type === 'Constant') {
    return a.value === (b as any).value;
  }
  
  if (a.type === 'Variable') {
    return a.name === (b as any).name;
  }
  
  if (a.type === 'BinaryOp') {
    return (
      a.op === (b as any).op &&
      expressionsEqual(a.left, (b as any).left) &&
      expressionsEqual(a.right, (b as any).right)
    );
  }
  
  if (a.type === 'UnaryOp') {
    return (
      a.op === (b as any).op &&
      expressionsEqual(a.child, (b as any).child)
    );
  }
  
  if (a.type === 'FunctionCall') {
    return (
      a.name === (b as any).name &&
      a.args.length === (b as any).args.length &&
      a.args.every((arg, i) => expressionsEqual(arg, (b as any).args[i]))
    );
  }
  
  return true;
}

/**
 * Estimate the computational complexity of evaluating a constraint
 */
export function estimateComplexity(node: ConstraintNode): number {
  const baseCost = 1;
  
  if (node.type === 'Constant') {
    return baseCost;
  }
  
  if (node.type === 'Comparison') {
    return baseCost + estimateExprComplexity(node.left) + estimateExprComplexity(node.right);
  }
  
  if (node.type === 'And' || node.type === 'Or') {
    return baseCost + node.children.reduce((sum, c) => sum + estimateComplexity(c), 0);
  }
  
  if (node.type === 'Not') {
    return baseCost + estimateComplexity(node.child);
  }
  
  return baseCost;
}

function estimateExprComplexity(node: ExpressionNode): number {
  const baseCost = 1;
  
  if (node.type === 'Constant' || node.type === 'Variable') {
    return baseCost;
  }
  
  if (node.type === 'BinaryOp') {
    return baseCost + estimateExprComplexity(node.left) + estimateExprComplexity(node.right);
  }
  
  if (node.type === 'UnaryOp') {
    return baseCost + estimateExprComplexity(node.child);
  }
  
  if (node.type === 'FunctionCall') {
    // Some functions are more expensive
    const funcCost: Record<string, number> = {
      sin: 5, cos: 5, tan: 5,
      sqrt: 3, log: 3, log10: 3, exp: 3,
      floor: 1, ceil: 1, round: 1,
    };
    const cost = funcCost[node.name] || 2;
    return cost + node.args.reduce((sum, arg) => sum + estimateExprComplexity(arg), 0);
  }
  
  if (node.type === 'IfElse') {
    return (
      baseCost +
      estimateExprComplexity(node.condition) +
      estimateExprComplexity(node.thenExpr) +
      estimateExprComplexity(node.elseExpr)
    );
  }
  
  return baseCost;
}

/**
 * Create a human-readable string representation of a constraint
 */
export function constraintToString(node: ConstraintNode): string {
  if (node.type === 'Constant') {
    return node.value.toString();
  }
  
  if (node.type === 'Comparison') {
    return `${expressionToString(node.left)} ${node.op} ${expressionToString(node.right)}`;
  }
  
  if (node.type === 'And') {
    return `(${node.children.map(constraintToString).join(' ∧ ')})`;
  }
  
  if (node.type === 'Or') {
    return `(${node.children.map(constraintToString).join(' ∨ ')})`;
  }
  
  if (node.type === 'Not') {
    return `¬(${constraintToString(node.child)})`;
  }
  
  return '?';
}

function expressionToString(node: ExpressionNode): string {
  if (node.type === 'Constant') {
    return node.value.toString();
  }
  
  if (node.type === 'Variable') {
    return node.name;
  }
  
  if (node.type === 'BinaryOp') {
    const opMap: Record<string, string> = {
      Add: '+', Sub: '-', Mul: '*', Div: '/', Mod: '%', Pow: '^',
      Min: 'min', Max: 'max',
    };
    return `(${expressionToString(node.left)} ${opMap[node.op] || node.op} ${expressionToString(node.right)})`;
  }
  
  if (node.type === 'UnaryOp') {
    if (node.op === 'Neg') return `(-${expressionToString(node.child)})`;
    if (node.op === 'Abs') return `|${expressionToString(node.child)}|`;
    return `${node.op}(${expressionToString(node.child)})`;
  }
  
  if (node.type === 'FunctionCall') {
    return `${node.name}(${node.args.map(expressionToString).join(', ')})`;
  }
  
  if (node.type === 'IfElse') {
    return `if ${expressionToString(node.condition)} then ${expressionToString(node.thenExpr)} else ${expressionToString(node.elseExpr)}`;
  }
  
  return '?';
}
