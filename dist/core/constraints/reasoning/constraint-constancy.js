// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.
// Authors: Alexander Raistrick
// Ported to TypeScript for React Three Fiber
import { ScalarOperatorExpression, BoolOperatorExpression, ScalarConstant, BoolConstant } from '../language';
/**
 * Check if a constraint language node is a constant (can be evaluated without scene state)
 */
export function isConstant(node) {
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
export function evaluateConstant(node) {
    if (!isConstant(node)) {
        return null;
    }
    if (node instanceof ScalarConstant) {
        return node.value;
    }
    if (node instanceof BoolConstant) {
        return node.value;
    }
    if (node instanceof ScalarOperatorExpression || node instanceof BoolOperatorExpression) {
        const operands = node.operands.map(op => evaluateConstant(op));
        if (operands.some(op => op === null)) {
            return null;
        }
        const ops = operands;
        switch (node.func) {
            // Scalar operations
            case 'add': return ops[0] + ops[1];
            case 'sub': return ops[0] - ops[1];
            case 'mul': return ops[0] * ops[1];
            case 'div': return Math.floor(ops[0] / ops[1]);
            case 'mod': return ops[0] % ops[1];
            case 'pow': return Math.pow(ops[0], ops[1]);
            case 'min': return Math.min(...ops);
            case 'max': return Math.max(...ops);
            // Boolean operations
            case 'and': return ops[0] && ops[1];
            case 'or': return ops[0] || ops[1];
            case 'eq': return ops[0] === ops[1];
            case 'ne': return ops[0] !== ops[1];
            case 'lt': return ops[0] < ops[1];
            case 'le': return ops[0] <= ops[1];
            case 'gt': return ops[0] > ops[1];
            case 'ge': return ops[0] >= ops[1];
            default:
                return null;
        }
    }
    return null;
}
/**
 * Simplify an expression by evaluating constant subexpressions
 */
export function simplifyConstant(node) {
    if (!isConstant(node)) {
        return node;
    }
    const evaluated = evaluateConstant(node);
    if (evaluated !== null) {
        if (typeof evaluated === 'number') {
            return new ScalarConstant(evaluated);
        }
        else {
            return new BoolConstant(evaluated);
        }
    }
    return node;
}
//# sourceMappingURL=constraint-constancy.js.map