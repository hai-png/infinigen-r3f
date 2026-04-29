/**
 * Expression System for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/expression.py
 */
import { Node, Variable, Domain } from './types.js';
/**
 * Base class for all expressions
 */
export declare abstract class Expression extends Node {
    /**
     * Get the domain of this expression
     */
    abstract domain(): Domain;
    /**
     * Evaluate this expression given a state
     */
    abstract evaluate(state: Map<Variable, any>): any;
}
/**
 * Scalar (numeric) expression base class
 */
export declare abstract class ScalarExpression extends Expression {
    domain(): Domain;
    /**
     * Addition: this + other
     */
    add(other: ScalarExpression): ScalarOperatorExpression;
    /**
     * Subtraction: this - other
     */
    sub(other: ScalarExpression): ScalarOperatorExpression;
    /**
     * Multiplication: this * other
     */
    multiply(other: ScalarExpression): ScalarOperatorExpression;
    /**
     * Division: this / other
     */
    div(other: ScalarExpression): ScalarOperatorExpression;
    /**
     * Modulo: this % other
     */
    mod(other: ScalarExpression): ScalarOperatorExpression;
    /**
     * Power: this ^ other
     */
    pow(other: ScalarExpression): ScalarOperatorExpression;
    /**
     * Negation: -this
     */
    negate(): ScalarNegateExpression;
    /**
     * Absolute value: |this|
     */
    abs(): ScalarAbsExpression;
    /**
     * Minimum: min(this, other)
     */
    min(other: ScalarExpression): ScalarMinExpression;
    /**
     * Maximum: max(this, other)
     */
    max(other: ScalarExpression): ScalarMaxExpression;
    /**
     * Equality: this == other
     */
    equals(other: ScalarExpression): BoolOperatorExpression;
    /**
     * Inequality: this != other
     */
    notEquals(other: ScalarExpression): BoolOperatorExpression;
    /**
     * Less than: this < other
     */
    lessThan(other: ScalarExpression): BoolOperatorExpression;
    /**
     * Less than or equal: this <= other
     */
    lessThanOrEqual(other: ScalarExpression): BoolOperatorExpression;
    /**
     * Greater than: this > other
     */
    greaterThan(other: ScalarExpression): BoolOperatorExpression;
    /**
     * Greater than or equal: this >= other
     */
    greaterThanOrEqual(other: ScalarExpression): BoolOperatorExpression;
}
/**
 * Boolean expression base class
 */
export declare abstract class BoolExpression extends Expression {
    domain(): Domain;
    /**
     * Logical AND: this && other
     */
    and(other: BoolExpression): BoolOperatorExpression;
    /**
     * Logical OR: this || other
     */
    or(other: BoolExpression): BoolOperatorExpression;
    /**
     * Logical XOR: this XOR other
     */
    xor(other: BoolExpression): BoolOperatorExpression;
    /**
     * Logical NOT: !this
     */
    not(): BoolNotExpression;
    /**
     * Implication: this => other
     */
    implies(other: BoolExpression): BoolOperatorExpression;
}
/**
 * Constant scalar value
 */
export declare class ScalarConstant extends ScalarExpression {
    readonly value: number;
    constructor(value: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): ScalarConstant;
    toString(): string;
}
/**
 * Constant boolean value
 */
export declare class BoolConstant extends BoolExpression {
    readonly value: boolean;
    constructor(value: boolean);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    clone(): BoolConstant;
    toString(): string;
}
/**
 * Variable reference as scalar expression
 */
export declare class ScalarVariable extends ScalarExpression {
    readonly variable: Variable;
    constructor(variable: Variable);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): ScalarVariable;
    toString(): string;
}
/**
 * Variable reference as boolean expression
 */
export declare class BoolVariable extends BoolExpression {
    readonly variable: Variable;
    constructor(variable: Variable);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    clone(): BoolVariable;
    toString(): string;
}
/**
 * Binary operator for scalar expressions
 */
export type ScalarOperator = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow';
/**
 * Binary operator for boolean expressions
 */
export type BoolOperator = 'and' | 'or' | 'xor' | 'implies' | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
/**
 * Binary scalar operator expression
 */
export declare class ScalarOperatorExpression extends ScalarExpression {
    readonly left: ScalarExpression;
    readonly operator: ScalarOperator;
    readonly right: ScalarExpression;
    constructor(left: ScalarExpression, operator: ScalarOperator, right: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): ScalarOperatorExpression;
    toString(): string;
}
/**
 * Binary boolean operator expression
 */
export declare class BoolOperatorExpression extends BoolExpression {
    readonly left: Expression;
    readonly operator: BoolOperator;
    readonly right?: Expression | undefined;
    constructor(left: Expression, operator: BoolOperator, right?: Expression | undefined);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    clone(): BoolOperatorExpression;
    toString(): string;
}
/**
 * Scalar negation expression
 */
export declare class ScalarNegateExpression extends ScalarExpression {
    readonly operand: ScalarExpression;
    constructor(operand: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): ScalarNegateExpression;
    toString(): string;
}
/**
 * Absolute value expression
 */
export declare class ScalarAbsExpression extends ScalarExpression {
    readonly operand: ScalarExpression;
    constructor(operand: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): ScalarAbsExpression;
    toString(): string;
}
/**
 * Minimum of two scalars
 */
export declare class ScalarMinExpression extends ScalarExpression {
    readonly left: ScalarExpression;
    readonly right: ScalarExpression;
    constructor(left: ScalarExpression, right: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): ScalarMinExpression;
    toString(): string;
}
/**
 * Maximum of two scalars
 */
export declare class ScalarMaxExpression extends ScalarExpression {
    readonly left: ScalarExpression;
    readonly right: ScalarExpression;
    constructor(left: ScalarExpression, right: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): ScalarMaxExpression;
    toString(): string;
}
/**
 * Boolean NOT expression
 */
export declare class BoolNotExpression extends BoolExpression {
    readonly operand: BoolExpression;
    constructor(operand: BoolExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    clone(): BoolNotExpression;
    toString(): string;
}
/**
 * If-then-else expression for scalars
 */
export declare class ScalarIfElse extends ScalarExpression {
    readonly condition: BoolExpression;
    readonly thenExpr: ScalarExpression;
    readonly elseExpr: ScalarExpression;
    constructor(condition: BoolExpression, thenExpr: ScalarExpression, elseExpr: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): ScalarIfElse;
    toString(): string;
}
/**
 * If-then-else expression for booleans
 */
export declare class BoolIfElse extends BoolExpression {
    readonly condition: BoolExpression;
    readonly thenExpr: BoolExpression;
    readonly elseExpr: BoolExpression;
    constructor(condition: BoolExpression, thenExpr: BoolExpression, elseExpr: BoolExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    clone(): BoolIfElse;
    toString(): string;
}
//# sourceMappingURL=expression.d.ts.map