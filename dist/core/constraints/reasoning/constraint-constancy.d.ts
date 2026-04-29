import { Node } from '../language';
/**
 * Check if a constraint language node is a constant (can be evaluated without scene state)
 */
export declare function isConstant(node: Node): boolean;
/**
 * Check if an expression evaluates to a known constant value
 */
export declare function evaluateConstant<T extends number | boolean>(node: any): T | null;
/**
 * Simplify an expression by evaluating constant subexpressions
 */
export declare function simplifyConstant(node: any): any;
//# sourceMappingURL=constraint-constancy.d.ts.map