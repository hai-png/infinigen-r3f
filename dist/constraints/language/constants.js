// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.
// Authors: Alexander Raistrick
// Ported to TypeScript for React Three Fiber
import { ScalarExpression, BoolExpression } from './expression';
import { ObjectSetExpression } from './set-reasoning';
/**
 * Constant expressions for constraint language
 */
/**
 * Create a scalar constant expression
 */
export function scalar(value) {
    return new ScalarConstant(value);
}
/**
 * Create a boolean constant expression
 */
export function bool(value) {
    return new BoolConstant(value);
}
/**
 * Scalar constant expression
 */
export class ScalarConstant extends ScalarExpression {
    constructor(value) {
        super();
        this.value = value;
    }
    children() {
        return new Map();
    }
}
/**
 * Boolean constant expression
 */
export class BoolConstant extends BoolExpression {
    constructor(value) {
        super();
        this.value = value;
    }
    children() {
        return new Map();
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
export function item(name, memberOf) {
    return new ItemExpression(name, memberOf);
}
/**
 * Item expression - references a variable in the constraint system
 */
export class ItemExpression extends ObjectSetExpression {
    constructor(name, memberOf) {
        super();
        this.name = name;
        this.memberOf = memberOf;
    }
    children() {
        const children = new Map([['name', this.name]]);
        if (this.memberOf) {
            children.set('memberOf', this.memberOf);
        }
        return children;
    }
}
/**
 * Create a tagged object set expression
 */
export function tagged(objs, tags) {
    return new TaggedExpression(objs, tags);
}
/**
 * Tagged object set - filters objects by semantic tags
 */
export class TaggedExpression extends ObjectSetExpression {
    constructor(objs, tags) {
        super();
        this.objs = objs;
        this.tags = tags;
    }
    children() {
        return new Map([
            ['objs', this.objs],
            ['tags', this.tags]
        ]);
    }
}
/**
 * Scene-wide object set - all objects in the scene
 */
export class SceneExpression extends ObjectSetExpression {
    children() {
        return new Map();
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
    constructor(constraints = new Map(), scoreTerms = new Map()) {
        this.constraints = constraints;
        this.scoreTerms = scoreTerms;
    }
    addConstraint(name, constraint) {
        this.constraints.set(name, constraint);
    }
    addScoreTerm(name, term) {
        this.scoreTerms.set(name, term);
    }
    /**
     * Get all expressions in the problem (constraints and score terms)
     */
    *allExpressions() {
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
    totalNodes() {
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
    constructor(name, constraint, weight = 1.0, required = false) {
        this.name = name;
        this.constraint = constraint;
        this.weight = weight;
        this.required = required;
    }
}
/**
 * Named score term wrapper
 */
export class NamedScoreTerm {
    constructor(name, term, weight = 1.0, minimize = true) {
        this.name = name;
        this.term = term;
        this.weight = weight;
        this.minimize = minimize;
    }
}
/**
 * Build a problem from named constraints and score terms
 */
export function buildProblem(constraints = [], scoreTerms = []) {
    const problem = new Problem();
    for (const c of constraints) {
        problem.addConstraint(c.name, c.constraint);
    }
    for (const s of scoreTerms) {
        problem.addScoreTerm(s.name, s.term);
    }
    return problem;
}
//# sourceMappingURL=constants.js.map