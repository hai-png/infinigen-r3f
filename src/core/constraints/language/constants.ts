// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick
// Ported to TypeScript for React Three Fiber

import { ScalarExpression, BoolExpression } from './expression';
import { ObjectSetExpression } from './set-reasoning';
import { ObjectSetDomain, Variable } from './types';

/**
 * Constant expressions for constraint language
 */

/**
 * Create a scalar constant expression
 */
export function scalar(value: number): ScalarConstant {
  return new ScalarConstant(value);
}

/**
 * Create a boolean constant expression
 */
export function bool(value: boolean): BoolConstant {
  return new BoolConstant(value);
}

/**
 * Scalar constant expression
 */
export class ScalarConstant extends ScalarExpression {
  readonly type = 'ScalarConstant';
  constructor(public readonly value: number) {
    super();
  }

  children(): Map<string, any> {
    return new Map();
  }

  evaluate(state: Map<any, any>): number {
    return this.value;
  }

  clone(): ScalarConstant {
    return new ScalarConstant(this.value);
  }
}

/**
 * Boolean constant expression
 */
export class BoolConstant extends BoolExpression {
  readonly type = 'BoolConstant';
  constructor(public readonly value: boolean) {
    super();
  }

  children(): Map<string, any> {
    return new Map();
  }

  evaluate(state: Map<any, any>): boolean {
    return this.value;
  }

  clone(): BoolConstant {
    return new BoolConstant(this.value);
  }
}

/**
 * Common numeric constants
 */
export const ZERO = new ScalarConstant(0);
export const ONE = new ScalarConstant(1);
export const HALF = new ScalarConstant(0.5);
export const EPSILON = new ScalarConstant(1e-6);

/**
 * Common boolean constants
 */
export const TRUE = new BoolConstant(true);
export const FALSE = new BoolConstant(false);

/**
 * Create a variable reference for an object set
 */
export function item(name: string, memberOf?: ObjectSetExpression): ItemExpression {
  return new ItemExpression(name, memberOf);
}

/**
 * Item expression - references a variable in the constraint system
 */
export class ItemExpression extends ObjectSetExpression {
  readonly type = 'ItemExpression';
  constructor(
    public readonly name: string,
    public memberOf?: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, any> {
    const children = new Map<string, any>([['name', this.name]]);
    if (this.memberOf) {
      children.set('memberOf', this.memberOf);
    }
    return children;
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<any, any>): Set<string> {
    const value = state.get(this.name);
    return value instanceof Set ? value : new Set([value]);
  }

  getVariables(): Set<Variable> {
    return new Set();
  }

  clone(): ItemExpression {
    return new ItemExpression(this.name, this.memberOf?.clone() as ObjectSetExpression);
  }
}

/**
 * Create a tagged object set expression
 */
export function tagged(
  objs: ObjectSetExpression,
  tags: string[]
): TaggedExpression {
  return new TaggedExpression(objs, tags);
}

/**
 * Tagged object set - filters objects by semantic tags
 */
export class TaggedExpression extends ObjectSetExpression {
  readonly type = 'TaggedExpression';
  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly tags: string[]
  ) {
    super();
  }

  children(): Map<string, any> {
    return new Map<string, any>([
      ['objs', this.objs],
      ['tags', this.tags]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<any, any>): Set<string> {
    return this.objs.evaluate(state);
  }

  getVariables(): Set<Variable> {
    return this.objs.getVariables();
  }

  clone(): TaggedExpression {
    return new TaggedExpression(this.objs.clone() as ObjectSetExpression, [...this.tags]);
  }
}

/**
 * Scene-wide object set - all objects in the scene
 */
export class SceneExpression extends ObjectSetExpression {
  readonly type = 'SceneExpression';

  children(): Map<string, any> {
    return new Map();
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<any, any>): Set<string> {
    const sceneObjs = state.get('__scene__');
    return sceneObjs instanceof Set ? sceneObjs : new Set();
  }

  getVariables(): Set<Variable> {
    return new Set();
  }

  clone(): SceneExpression {
    return new SceneExpression();
  }
}

/**
 * Singleton instance for scene expression
 */
export const SCENE = new SceneExpression();

/**
 * Problem definition - collection of constraints and score terms
 */
export class Problem {
  constructor(
    public constraints: Map<string, BoolExpression> = new Map(),
    public scoreTerms: Map<string, ScalarExpression> = new Map()
  ) {}

  addConstraint(name: string, constraint: BoolExpression): void {
    this.constraints.set(name, constraint);
  }

  addScoreTerm(name: string, term: ScalarExpression): void {
    this.scoreTerms.set(name, term);
  }

  /**
   * Get all expressions in the problem (constraints and score terms)
   */
  *allExpressions(): Generator<ScalarExpression | BoolExpression> {
    for (const expr of this.constraints.values()) {
      yield expr;
    }
    for (const expr of this.scoreTerms.values()) {
      yield expr;
    }
  }

  /**
   * Count total number of nodes in the problem
   */
  totalNodes(): number {
    let count = 0;
    for (const expr of this.allExpressions()) {
      count += expr.size();
    }
    return count;
  }
}

/**
 * Named constraint wrapper
 */
export class NamedConstraint {
  constructor(
    public readonly name: string,
    public readonly constraint: BoolExpression,
    public readonly weight: number = 1.0,
    public readonly required: boolean = false
  ) {}
}

/**
 * Named score term wrapper
 */
export class NamedScoreTerm {
  constructor(
    public readonly name: string,
    public readonly term: ScalarExpression,
    public readonly weight: number = 1.0,
    public readonly minimize: boolean = true
  ) {}
}

/**
 * Build a problem from named constraints and score terms
 */
export function buildProblem(
  constraints: NamedConstraint[] = [],
  scoreTerms: NamedScoreTerm[] = []
): Problem {
  const problem = new Problem();
  
  for (const c of constraints) {
    problem.addConstraint(c.name, c.constraint);
  }
  
  for (const s of scoreTerms) {
    problem.addScoreTerm(s.name, s.term);
  }
  
  return problem;
}
