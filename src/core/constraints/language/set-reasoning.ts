/**
 * Set Reasoning for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/set_reasoning.py
 */

import { Node, Variable, Domain, ObjectSetDomain } from './types';
import { ScalarExpression, BoolExpression, ScalarConstant } from './expression';

/**
 * Base class for object set expressions
 */
export abstract class ObjectSetExpression extends Node {
  /**
   * Get the domain of this expression
   */
  abstract domain(): ObjectSetDomain;

  /**
   * Evaluate this expression to get actual object IDs
   */
  abstract evaluate(state: Map<Variable, any>): Set<string>;

  /**
   * Get variables used in this expression
   */
  abstract getVariables(): Set<Variable>;

  /**
   * Union with another set
   */
  union(other: ObjectSetExpression): UnionObjects {
    return new UnionObjects(this, other);
  }

  /**
   * Intersection with another set
   */
  intersection(other: ObjectSetExpression): IntersectionObjects {
    return new IntersectionObjects(this, other);
  }

  /**
   * Difference with another set
   */
  difference(other: ObjectSetExpression): DifferenceObjects {
    return new DifferenceObjects(this, other);
  }

  /**
   * Filter by condition
   */
  filter(condition: ObjectCondition): FilterObjects {
    return new FilterObjects(this, condition);
  }

  /**
   * Count objects in set
   */
  count(): CountExpression {
    return new CountExpression(this);
  }
}

/**
 * Constant set of object IDs
 */
export class ObjectSetConstant extends ObjectSetExpression {
  readonly type = 'ObjectSetConstant';
  constructor(public readonly objectIds: Set<string>) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain(this.objectIds);
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    return new Set(this.objectIds);
  }

  getVariables(): Set<Variable> {
    return new Set();
  }

  clone(): ObjectSetConstant {
    return new ObjectSetConstant(new Set(this.objectIds));
  }

  toString(): string {
    return `Set{${Array.from(this.objectIds).join(', ')}}`;
  }
}

/**
 * Variable reference as object set
 */
export class ObjectSetVariable extends ObjectSetExpression {
  readonly type = 'ObjectSetVariable';
  constructor(public readonly variable: Variable) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const value = state.get(this.variable);
    if (!(value instanceof Set)) {
      throw new Error(`Expected Set for variable ${this.variable.name}, got ${typeof value}`);
    }
    return value as Set<string>;
  }

  getVariables(): Set<Variable> {
    return new Set([this.variable]);
  }

  clone(): ObjectSetVariable {
    return new ObjectSetVariable(this.variable.clone());
  }

  toString(): string {
    return `ObjSetVar(${this.variable.name})`;
  }
}

/**
 * Union of two object sets
 */
export class UnionObjects extends ObjectSetExpression {
  readonly type = 'UnionObjects';
  constructor(
    public readonly left: ObjectSetExpression,
    public readonly right: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const leftSet = this.left.evaluate(state);
    const rightSet = this.right.evaluate(state);
    return new Set([...leftSet, ...rightSet]);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.left.getVariables()) vars.add(v);
    for (const v of this.right.getVariables()) vars.add(v);
    return vars;
  }

  clone(): UnionObjects {
    return new UnionObjects(
      this.left.clone() as ObjectSetExpression,
      this.right.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Union(${this.left}, ${this.right})`;
  }
}

/**
 * Intersection of two object sets
 */
export class IntersectionObjects extends ObjectSetExpression {
  readonly type = 'IntersectionObjects';
  constructor(
    public readonly left: ObjectSetExpression,
    public readonly right: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const leftSet = this.left.evaluate(state);
    const rightSet = this.right.evaluate(state);
    const intersection = new Set<string>();
    for (const obj of leftSet) {
      if (rightSet.has(obj)) {
        intersection.add(obj);
      }
    }
    return intersection;
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.left.getVariables()) vars.add(v);
    for (const v of this.right.getVariables()) vars.add(v);
    return vars;
  }

  clone(): IntersectionObjects {
    return new IntersectionObjects(
      this.left.clone() as ObjectSetExpression,
      this.right.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Intersection(${this.left}, ${this.right})`;
  }
}

/**
 * Difference of two object sets (left - right)
 */
export class DifferenceObjects extends ObjectSetExpression {
  readonly type = 'DifferenceObjects';
  constructor(
    public readonly left: ObjectSetExpression,
    public readonly right: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const leftSet = this.left.evaluate(state);
    const rightSet = this.right.evaluate(state);
    const difference = new Set<string>(leftSet);
    for (const obj of rightSet) {
      difference.delete(obj);
    }
    return difference;
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.left.getVariables()) vars.add(v);
    for (const v of this.right.getVariables()) vars.add(v);
    return vars;
  }

  clone(): DifferenceObjects {
    return new DifferenceObjects(
      this.left.clone() as ObjectSetExpression,
      this.right.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Difference(${this.left}, ${this.right})`;
  }
}

/**
 * Condition for filtering objects
 */
export abstract class ObjectCondition extends Node {
  abstract evaluate(objectId: string, state: Map<Variable, any>): boolean;
  abstract getVariables(): Set<Variable>;
}

/**
 * Filter objects by condition
 */
export class FilterObjects extends ObjectSetExpression {
  readonly type = 'FilterObjects';
  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly condition: ObjectCondition
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['condition', this.condition as Node]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const objectSet = this.objects.evaluate(state);
    const filtered = new Set<string>();
    for (const obj of objectSet) {
      if (this.condition.evaluate(obj, state)) {
        filtered.add(obj);
      }
    }
    return filtered;
  }

  getVariables(): Set<Variable> {
    const vars = this.objects.getVariables();
    for (const v of this.condition.getVariables()) {
      vars.add(v);
    }
    return vars;
  }

  clone(): FilterObjects {
    return new FilterObjects(
      this.objects.clone() as ObjectSetExpression,
      this.condition.clone() as ObjectCondition
    );
  }

  toString(): string {
    return `Filter(${this.objects}, ${this.condition})`;
  }
}

/**
 * Tag-based object condition
 */
export class TagCondition extends ObjectCondition {
  readonly type = 'TagCondition';
  constructor(
    public readonly requiredTags: Set<string>,
    public readonly excludedTags?: Set<string>
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(objectId: string, state: Map<Variable, any>): boolean {
    // Placeholder - requires tag system integration
    return true;
  }

  getVariables(): Set<Variable> {
    return new Set();
  }

  clone(): TagCondition {
    return new TagCondition(
      new Set(this.requiredTags),
      this.excludedTags ? new Set(this.excludedTags) : undefined
    );
  }

  toString(): string {
    return `TagCondition(req=[${Array.from(this.requiredTags).join(', ')}])`;
  }
}

/**
 * ForAll quantifier: ∀x ∈ objects. predicate(x)
 */
export class ForAll extends BoolExpression {
  readonly type = 'ForAll';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly predicate: BoolExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['predicate', this.predicate as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const objectSet = this.objects.evaluate(state);
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      if (!this.predicate.evaluate(extendedState)) {
        return false;
      }
    }
    return true;
  }

  clone(): ForAll {
    return new ForAll(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.predicate.clone() as BoolExpression
    );
  }

  toString(): string {
    return `ForAll(${this.variable.name} ∈ ${this.objects}. ${this.predicate})`;
  }
}

/**
 * Exists quantifier: ∃x ∈ objects. predicate(x)
 */
export class Exists extends BoolExpression {
  readonly type = 'Exists';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly predicate: BoolExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['predicate', this.predicate as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const objectSet = this.objects.evaluate(state);
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      if (this.predicate.evaluate(extendedState)) {
        return true;
      }
    }
    return false;
  }

  clone(): Exists {
    return new Exists(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.predicate.clone() as BoolExpression
    );
  }

  toString(): string {
    return `Exists(${this.variable.name} ∈ ${this.objects}. ${this.predicate})`;
  }
}

/**
 * SumOver aggregator: Σx ∈ objects. scalar_expr(x)
 */
export class SumOver extends ScalarExpression {
  readonly type = 'SumOver';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly expression: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['expression', this.expression as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objectSet = this.objects.evaluate(state);
    let sum = 0;
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      sum += this.expression.evaluate(extendedState);
    }
    return sum;
  }

  clone(): SumOver {
    return new SumOver(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.expression.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `SumOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
  }
}

/**
 * MeanOver aggregator: mean of scalar_expr over objects
 */
export class MeanOver extends ScalarExpression {
  readonly type = 'MeanOver';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly expression: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['expression', this.expression as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objectSet = this.objects.evaluate(state);
    if (objectSet.size === 0) {
      return 0;
    }
    
    let sum = 0;
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      sum += this.expression.evaluate(extendedState);
    }
    return sum / objectSet.size;
  }

  clone(): MeanOver {
    return new MeanOver(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.expression.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `MeanOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
  }
}

/**
 * MaxOver aggregator: max of scalar_expr over objects
 */
export class MaxOver extends ScalarExpression {
  readonly type = 'MaxOver';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly expression: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['expression', this.expression as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objectSet = this.objects.evaluate(state);
    if (objectSet.size === 0) {
      return -Infinity;
    }
    
    let maxVal = -Infinity;
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      const val = this.expression.evaluate(extendedState);
      if (val > maxVal) {
        maxVal = val;
      }
    }
    return maxVal;
  }

  clone(): MaxOver {
    return new MaxOver(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.expression.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `MaxOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
  }
}

/**
 * MinOver aggregator: min of scalar_expr over objects
 */
export class MinOver extends ScalarExpression {
  readonly type = 'MinOver';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly expression: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['expression', this.expression as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objectSet = this.objects.evaluate(state);
    if (objectSet.size === 0) {
      return Infinity;
    }
    
    let minVal = Infinity;
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      const val = this.expression.evaluate(extendedState);
      if (val < minVal) {
        minVal = val;
      }
    }
    return minVal;
  }

  clone(): MinOver {
    return new MinOver(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.expression.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `MinOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
  }
}

/**
 * Count expression: |objects|
 */
export class CountExpression extends ScalarExpression {
  readonly type = 'CountExpression';
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return this.objects.evaluate(state).size;
  }

  clone(): CountExpression {
    return new CountExpression(this.objects.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `Count(${this.objects})`;
  }
}
