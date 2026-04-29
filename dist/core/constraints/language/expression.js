/**
 * Expression System for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/expression.py
 */
import { Node, NumericDomain, BooleanDomain } from './types.js';
/**
 * Base class for all expressions
 */
export class Expression extends Node {
}
/**
 * Scalar (numeric) expression base class
 */
export class ScalarExpression extends Expression {
    domain() {
        return new NumericDomain();
    }
    /**
     * Addition: this + other
     */
    add(other) {
        return new ScalarOperatorExpression(this, 'add', other);
    }
    /**
     * Subtraction: this - other
     */
    sub(other) {
        return new ScalarOperatorExpression(this, 'sub', other);
    }
    /**
     * Multiplication: this * other
     */
    multiply(other) {
        return new ScalarOperatorExpression(this, 'mul', other);
    }
    /**
     * Division: this / other
     */
    div(other) {
        return new ScalarOperatorExpression(this, 'div', other);
    }
    /**
     * Modulo: this % other
     */
    mod(other) {
        return new ScalarOperatorExpression(this, 'mod', other);
    }
    /**
     * Power: this ^ other
     */
    pow(other) {
        return new ScalarOperatorExpression(this, 'pow', other);
    }
    /**
     * Negation: -this
     */
    negate() {
        return new ScalarNegateExpression(this);
    }
    /**
     * Absolute value: |this|
     */
    abs() {
        return new ScalarAbsExpression(this);
    }
    /**
     * Minimum: min(this, other)
     */
    min(other) {
        return new ScalarMinExpression(this, other);
    }
    /**
     * Maximum: max(this, other)
     */
    max(other) {
        return new ScalarMaxExpression(this, other);
    }
    /**
     * Equality: this == other
     */
    equals(other) {
        return new BoolOperatorExpression(this, 'eq', other);
    }
    /**
     * Inequality: this != other
     */
    notEquals(other) {
        return new BoolOperatorExpression(this, 'neq', other);
    }
    /**
     * Less than: this < other
     */
    lessThan(other) {
        return new BoolOperatorExpression(this, 'lt', other);
    }
    /**
     * Less than or equal: this <= other
     */
    lessThanOrEqual(other) {
        return new BoolOperatorExpression(this, 'lte', other);
    }
    /**
     * Greater than: this > other
     */
    greaterThan(other) {
        return new BoolOperatorExpression(this, 'gt', other);
    }
    /**
     * Greater than or equal: this >= other
     */
    greaterThanOrEqual(other) {
        return new BoolOperatorExpression(this, 'gte', other);
    }
}
/**
 * Boolean expression base class
 */
export class BoolExpression extends Expression {
    domain() {
        return new BooleanDomain();
    }
    /**
     * Logical AND: this && other
     */
    and(other) {
        return new BoolOperatorExpression(this, 'and', other);
    }
    /**
     * Logical OR: this || other
     */
    or(other) {
        return new BoolOperatorExpression(this, 'or', other);
    }
    /**
     * Logical XOR: this XOR other
     */
    xor(other) {
        return new BoolOperatorExpression(this, 'xor', other);
    }
    /**
     * Logical NOT: !this
     */
    not() {
        return new BoolNotExpression(this);
    }
    /**
     * Implication: this => other
     */
    implies(other) {
        return new BoolOperatorExpression(this, 'implies', other);
    }
}
/**
 * Constant scalar value
 */
export class ScalarConstant extends ScalarExpression {
    constructor(value) {
        super();
        this.value = value;
    }
    children() {
        return new Map();
    }
    evaluate(state) {
        return this.value;
    }
    clone() {
        return new ScalarConstant(this.value);
    }
    toString() {
        return `${this.value}`;
    }
}
/**
 * Constant boolean value
 */
export class BoolConstant extends BoolExpression {
    constructor(value) {
        super();
        this.value = value;
    }
    children() {
        return new Map();
    }
    evaluate(state) {
        return this.value;
    }
    clone() {
        return new BoolConstant(this.value);
    }
    toString() {
        return `${this.value}`;
    }
}
/**
 * Variable reference as scalar expression
 */
export class ScalarVariable extends ScalarExpression {
    constructor(variable) {
        super();
        this.variable = variable;
    }
    children() {
        return new Map();
    }
    evaluate(state) {
        const value = state.get(this.variable);
        if (typeof value !== 'number') {
            throw new Error(`Expected numeric value for variable ${this.variable.name}, got ${typeof value}`);
        }
        return value;
    }
    clone() {
        return new ScalarVariable(this.variable.clone());
    }
    toString() {
        return `ScalarVar(${this.variable.name})`;
    }
}
/**
 * Variable reference as boolean expression
 */
export class BoolVariable extends BoolExpression {
    constructor(variable) {
        super();
        this.variable = variable;
    }
    children() {
        return new Map();
    }
    evaluate(state) {
        const value = state.get(this.variable);
        if (typeof value !== 'boolean') {
            throw new Error(`Expected boolean value for variable ${this.variable.name}, got ${typeof value}`);
        }
        return value;
    }
    clone() {
        return new BoolVariable(this.variable.clone());
    }
    toString() {
        return `BoolVar(${this.variable.name})`;
    }
}
/**
 * Binary scalar operator expression
 */
export class ScalarOperatorExpression extends ScalarExpression {
    constructor(left, operator, right) {
        super();
        this.left = left;
        this.operator = operator;
        this.right = right;
    }
    children() {
        return new Map([
            ['left', this.left],
            ['right', this.right]
        ]);
    }
    evaluate(state) {
        const leftVal = this.left.evaluate(state);
        const rightVal = this.right.evaluate(state);
        switch (this.operator) {
            case 'add': return leftVal + rightVal;
            case 'sub': return leftVal - rightVal;
            case 'mul': return leftVal * rightVal;
            case 'div': return leftVal / rightVal;
            case 'mod': return leftVal % rightVal;
            case 'pow': return Math.pow(leftVal, rightVal);
            default: throw new Error(`Unknown scalar operator: ${this.operator}`);
        }
    }
    clone() {
        return new ScalarOperatorExpression(this.left.clone(), this.operator, this.right.clone());
    }
    toString() {
        const opMap = {
            add: '+', sub: '-', mul: '*', div: '/', mod: '%', pow: '^'
        };
        return `(${this.left} ${opMap[this.operator]} ${this.right})`;
    }
}
/**
 * Binary boolean operator expression
 */
export class BoolOperatorExpression extends BoolExpression {
    constructor(left, operator, right) {
        super();
        this.left = left;
        this.operator = operator;
        this.right = right;
    }
    children() {
        const children = new Map([['left', this.left]]);
        if (this.right) {
            children.set('right', this.right);
        }
        return children;
    }
    evaluate(state) {
        const leftVal = this.left.evaluate(state);
        if (!this.right) {
            // Unary operators
            if (this.operator === 'not') {
                return !leftVal;
            }
            throw new Error(`Binary operator ${this.operator} requires right operand`);
        }
        const rightVal = this.right.evaluate(state);
        switch (this.operator) {
            case 'and': return leftVal && rightVal;
            case 'or': return leftVal || rightVal;
            case 'xor': return leftVal !== rightVal;
            case 'implies': return !leftVal || rightVal;
            case 'eq': return leftVal === rightVal;
            case 'neq': return leftVal !== rightVal;
            case 'lt': return leftVal < rightVal;
            case 'lte': return leftVal <= rightVal;
            case 'gt': return leftVal > rightVal;
            case 'gte': return leftVal >= rightVal;
            default: throw new Error(`Unknown boolean operator: ${this.operator}`);
        }
    }
    clone() {
        return new BoolOperatorExpression(this.left.clone(), this.operator, this.right?.clone());
    }
    toString() {
        const opMap = {
            and: '&&', or: '||', xor: '^', implies: '=>',
            eq: '==', neq: '!=', lt: '<', lte: '<=', gt: '>', gte: '>='
        };
        if (this.right) {
            return `(${this.left} ${opMap[this.operator]} ${this.right})`;
        }
        return `(${opMap[this.operator]}${this.left})`;
    }
}
/**
 * Scalar negation expression
 */
export class ScalarNegateExpression extends ScalarExpression {
    constructor(operand) {
        super();
        this.operand = operand;
    }
    children() {
        return new Map([['operand', this.operand]]);
    }
    evaluate(state) {
        return -this.operand.evaluate(state);
    }
    clone() {
        return new ScalarNegateExpression(this.operand.clone());
    }
    toString() {
        return `(-${this.operand})`;
    }
}
/**
 * Absolute value expression
 */
export class ScalarAbsExpression extends ScalarExpression {
    constructor(operand) {
        super();
        this.operand = operand;
    }
    children() {
        return new Map([['operand', this.operand]]);
    }
    evaluate(state) {
        return Math.abs(this.operand.evaluate(state));
    }
    clone() {
        return new ScalarAbsExpression(this.operand.clone());
    }
    toString() {
        return `abs(${this.operand})`;
    }
}
/**
 * Minimum of two scalars
 */
export class ScalarMinExpression extends ScalarExpression {
    constructor(left, right) {
        super();
        this.left = left;
        this.right = right;
    }
    children() {
        return new Map([
            ['left', this.left],
            ['right', this.right]
        ]);
    }
    evaluate(state) {
        return Math.min(this.left.evaluate(state), this.right.evaluate(state));
    }
    clone() {
        return new ScalarMinExpression(this.left.clone(), this.right.clone());
    }
    toString() {
        return `min(${this.left}, ${this.right})`;
    }
}
/**
 * Maximum of two scalars
 */
export class ScalarMaxExpression extends ScalarExpression {
    constructor(left, right) {
        super();
        this.left = left;
        this.right = right;
    }
    children() {
        return new Map([
            ['left', this.left],
            ['right', this.right]
        ]);
    }
    evaluate(state) {
        return Math.max(this.left.evaluate(state), this.right.evaluate(state));
    }
    clone() {
        return new ScalarMaxExpression(this.left.clone(), this.right.clone());
    }
    toString() {
        return `max(${this.left}, ${this.right})`;
    }
}
/**
 * Boolean NOT expression
 */
export class BoolNotExpression extends BoolExpression {
    constructor(operand) {
        super();
        this.operand = operand;
    }
    children() {
        return new Map([['operand', this.operand]]);
    }
    evaluate(state) {
        return !this.operand.evaluate(state);
    }
    clone() {
        return new BoolNotExpression(this.operand.clone());
    }
    toString() {
        return `(!${this.operand})`;
    }
}
/**
 * If-then-else expression for scalars
 */
export class ScalarIfElse extends ScalarExpression {
    constructor(condition, thenExpr, elseExpr) {
        super();
        this.condition = condition;
        this.thenExpr = thenExpr;
        this.elseExpr = elseExpr;
    }
    children() {
        return new Map([
            ['condition', this.condition],
            ['then', this.thenExpr],
            ['else', this.elseExpr]
        ]);
    }
    evaluate(state) {
        return this.condition.evaluate(state)
            ? this.thenExpr.evaluate(state)
            : this.elseExpr.evaluate(state);
    }
    clone() {
        return new ScalarIfElse(this.condition.clone(), this.thenExpr.clone(), this.elseExpr.clone());
    }
    toString() {
        return `if(${this.condition}, ${this.thenExpr}, ${this.elseExpr})`;
    }
}
/**
 * If-then-else expression for booleans
 */
export class BoolIfElse extends BoolExpression {
    constructor(condition, thenExpr, elseExpr) {
        super();
        this.condition = condition;
        this.thenExpr = thenExpr;
        this.elseExpr = elseExpr;
    }
    children() {
        return new Map([
            ['condition', this.condition],
            ['then', this.thenExpr],
            ['else', this.elseExpr]
        ]);
    }
    evaluate(state) {
        return this.condition.evaluate(state)
            ? this.thenExpr.evaluate(state)
            : this.elseExpr.evaluate(state);
    }
    clone() {
        return new BoolIfElse(this.condition.clone(), this.thenExpr.clone(), this.elseExpr.clone());
    }
    toString() {
        return `if(${this.condition}, ${this.thenExpr}, ${this.elseExpr})`;
    }
}
//# sourceMappingURL=expression.js.map