/**
 * Expression System for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/expression.py
 */

import { Node, Variable, Domain, NumericDomain, BooleanDomain, ObjectSetDomain } from './types';

/**
 * Base class for all expressions
 */
export abstract class Expression extends Node {
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
export abstract class ScalarExpression extends Expression {
  domain(): Domain {
    return new NumericDomain();
  }

  /**
   * Addition: this + other
   */
  add(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'add', other);
  }

  /**
   * Subtraction: this - other
   */
  sub(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'sub', other);
  }

  /**
   * Multiplication: this * other
   */
  multiply(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'mul', other);
  }

  /**
   * Division: this / other
   */
  div(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'div', other);
  }

  /**
   * Modulo: this % other
   */
  mod(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'mod', other);
  }

  /**
   * Power: this ^ other
   */
  pow(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'pow', other);
  }

  /**
   * Negation: -this
   */
  negate(): ScalarNegateExpression {
    return new ScalarNegateExpression(this);
  }

  /**
   * Absolute value: |this|
   */
  abs(): ScalarAbsExpression {
    return new ScalarAbsExpression(this);
  }

  /**
   * Minimum: min(this, other)
   */
  min(other: ScalarExpression): ScalarMinExpression {
    return new ScalarMinExpression(this, other);
  }

  /**
   * Maximum: max(this, other)
   */
  max(other: ScalarExpression): ScalarMaxExpression {
    return new ScalarMaxExpression(this, other);
  }

  /**
   * Equality: this == other
   */
  equals(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'eq', other);
  }

  /**
   * Inequality: this != other
   */
  notEquals(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'neq', other);
  }

  /**
   * Less than: this < other
   */
  lessThan(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'lt', other);
  }

  /**
   * Less than or equal: this <= other
   */
  lessThanOrEqual(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'lte', other);
  }

  /**
   * Greater than: this > other
   */
  greaterThan(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'gt', other);
  }

  /**
   * Greater than or equal: this >= other
   */
  greaterThanOrEqual(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'gte', other);
  }
}

/**
 * Boolean expression base class
 */
export abstract class BoolExpression extends Expression {
  domain(): Domain {
    return new BooleanDomain();
  }

  /**
   * Logical AND: this && other
   */
  and(other: BoolExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'and', other);
  }

  /**
   * Logical OR: this || other
   */
  or(other: BoolExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'or', other);
  }

  /**
   * Logical XOR: this XOR other
   */
  xor(other: BoolExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'xor', other);
  }

  /**
   * Logical NOT: !this
   */
  not(): BoolNotExpression {
    return new BoolNotExpression(this);
  }

  /**
   * Implication: this => other
   */
  implies(other: BoolExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'implies', other);
  }
}

/**
 * Constant scalar value
 */
export class ScalarConstant extends ScalarExpression {
  readonly type = 'ScalarConstant';
  constructor(public readonly value: number) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: Map<Variable, any>): number {
    return this.value;
  }

  clone(): ScalarConstant {
    return new ScalarConstant(this.value);
  }

  toString(): string {
    return `${this.value}`;
  }
}

/**
 * Constant boolean value
 */
export class BoolConstant extends BoolExpression {
  readonly type = 'BoolConstant';
  constructor(public readonly value: boolean) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: Map<Variable, any>): boolean {
    return this.value;
  }

  clone(): BoolConstant {
    return new BoolConstant(this.value);
  }

  toString(): string {
    return `${this.value}`;
  }
}

/**
 * Variable reference as scalar expression
 */
export class ScalarVariable extends ScalarExpression {
  readonly type = 'ScalarVariable';
  constructor(public readonly variable: Variable) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: Map<Variable, any>): number {
    const value = state.get(this.variable);
    if (typeof value !== 'number') {
      throw new Error(`Expected numeric value for variable ${this.variable.name}, got ${typeof value}`);
    }
    return value;
  }

  clone(): ScalarVariable {
    return new ScalarVariable(this.variable.clone());
  }

  toString(): string {
    return `ScalarVar(${this.variable.name})`;
  }
}

/**
 * Variable reference as boolean expression
 */
export class BoolVariable extends BoolExpression {
  readonly type = 'BoolVariable';
  constructor(public readonly variable: Variable) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: Map<Variable, any>): boolean {
    const value = state.get(this.variable);
    if (typeof value !== 'boolean') {
      throw new Error(`Expected boolean value for variable ${this.variable.name}, got ${typeof value}`);
    }
    return value;
  }

  clone(): BoolVariable {
    return new BoolVariable(this.variable.clone());
  }

  toString(): string {
    return `BoolVar(${this.variable.name})`;
  }
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
export class ScalarOperatorExpression extends ScalarExpression {
  readonly type = 'ScalarOperatorExpression';
  constructor(
    public readonly left: ScalarExpression,
    public readonly operator: ScalarOperator,
    public readonly right: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
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

  clone(): ScalarOperatorExpression {
    return new ScalarOperatorExpression(
      this.left.clone() as ScalarExpression,
      this.operator,
      this.right.clone() as ScalarExpression
    );
  }

  toString(): string {
    const opMap: Record<ScalarOperator, string> = {
      add: '+', sub: '-', mul: '*', div: '/', mod: '%', pow: '^'
    };
    return `(${this.left} ${opMap[this.operator]} ${this.right})`;
  }
}

/**
 * Binary boolean operator expression
 */
export class BoolOperatorExpression extends BoolExpression {
  readonly type = 'BoolOperatorExpression';
  constructor(
    public readonly left: Expression,
    public readonly operator: BoolOperator,
    public readonly right?: Expression
  ) {
    super();
  }

  children(): Map<string, Node> {
    const children = new Map<string, Node>([['left', this.left]]);
    if (this.right) {
      children.set('right', this.right);
    }
    return children;
  }

  evaluate(state: Map<Variable, any>): boolean {
    const leftVal = this.left.evaluate(state);

    if (!this.right) {
      // Unary operators
      if ((this.operator as string) === 'not') {
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

  clone(): BoolOperatorExpression {
    return new BoolOperatorExpression(
      this.left.clone() as Expression,
      this.operator,
      this.right?.clone() as Expression | undefined
    );
  }

  toString(): string {
    const opMap: Record<BoolOperator, string> = {
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
  readonly type = 'ScalarNegateExpression';
  constructor(public readonly operand: ScalarExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['operand', this.operand]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return -this.operand.evaluate(state);
  }

  clone(): ScalarNegateExpression {
    return new ScalarNegateExpression(this.operand.clone() as ScalarExpression);
  }

  toString(): string {
    return `(-${this.operand})`;
  }
}

/**
 * Absolute value expression
 */
export class ScalarAbsExpression extends ScalarExpression {
  readonly type = 'ScalarAbsExpression';
  constructor(public readonly operand: ScalarExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['operand', this.operand]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return Math.abs(this.operand.evaluate(state));
  }

  clone(): ScalarAbsExpression {
    return new ScalarAbsExpression(this.operand.clone() as ScalarExpression);
  }

  toString(): string {
    return `abs(${this.operand})`;
  }
}

/**
 * Minimum of two scalars
 */
export class ScalarMinExpression extends ScalarExpression {
  readonly type = 'ScalarMinExpression';
  constructor(
    public readonly left: ScalarExpression,
    public readonly right: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    return Math.min(this.left.evaluate(state), this.right.evaluate(state));
  }

  clone(): ScalarMinExpression {
    return new ScalarMinExpression(
      this.left.clone() as ScalarExpression,
      this.right.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `min(${this.left}, ${this.right})`;
  }
}

/**
 * Maximum of two scalars
 */
export class ScalarMaxExpression extends ScalarExpression {
  readonly type = 'ScalarMaxExpression';
  constructor(
    public readonly left: ScalarExpression,
    public readonly right: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    return Math.max(this.left.evaluate(state), this.right.evaluate(state));
  }

  clone(): ScalarMaxExpression {
    return new ScalarMaxExpression(
      this.left.clone() as ScalarExpression,
      this.right.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `max(${this.left}, ${this.right})`;
  }
}

/**
 * Boolean NOT expression
 */
export class BoolNotExpression extends BoolExpression {
  readonly type = 'BoolNotExpression';
  constructor(public readonly operand: BoolExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['operand', this.operand]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    return !this.operand.evaluate(state);
  }

  clone(): BoolNotExpression {
    return new BoolNotExpression(this.operand.clone() as BoolExpression);
  }

  toString(): string {
    return `(!${this.operand})`;
  }
}

/**
 * If-then-else expression for scalars
 */
export class ScalarIfElse extends ScalarExpression {
  readonly type = 'ScalarIfElse';
  constructor(
    public readonly condition: BoolExpression,
    public readonly thenExpr: ScalarExpression,
    public readonly elseExpr: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['condition', this.condition as Node],
      ['then', this.thenExpr as Node],
      ['else', this.elseExpr as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    return this.condition.evaluate(state)
      ? this.thenExpr.evaluate(state)
      : this.elseExpr.evaluate(state);
  }

  clone(): ScalarIfElse {
    return new ScalarIfElse(
      this.condition.clone() as BoolExpression,
      this.thenExpr.clone() as ScalarExpression,
      this.elseExpr.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `if(${this.condition}, ${this.thenExpr}, ${this.elseExpr})`;
  }
}

/**
 * If-then-else expression for booleans
 */
export class BoolIfElse extends BoolExpression {
  readonly type = 'BoolIfElse';
  constructor(
    public readonly condition: BoolExpression,
    public readonly thenExpr: BoolExpression,
    public readonly elseExpr: BoolExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['condition', this.condition],
      ['then', this.thenExpr],
      ['else', this.elseExpr]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    return this.condition.evaluate(state)
      ? this.thenExpr.evaluate(state)
      : this.elseExpr.evaluate(state);
  }

  clone(): BoolIfElse {
    return new BoolIfElse(
      this.condition.clone() as BoolExpression,
      this.thenExpr.clone() as BoolExpression,
      this.elseExpr.clone() as BoolExpression
    );
  }

  toString(): string {
    return `if(${this.condition}, ${this.thenExpr}, ${this.elseExpr})`;
  }
}
