/**
 * Set Reasoning for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/set_reasoning.py
 */
import { Node, ObjectSetDomain } from './types.js';
import { ScalarExpression, BoolExpression } from './expression.js';
/**
 * Base class for object set expressions
 */
export class ObjectSetExpression extends Node {
    /**
     * Union with another set
     */
    union(other) {
        return new UnionObjects(this, other);
    }
    /**
     * Intersection with another set
     */
    intersection(other) {
        return new IntersectionObjects(this, other);
    }
    /**
     * Difference with another set
     */
    difference(other) {
        return new DifferenceObjects(this, other);
    }
    /**
     * Filter by condition
     */
    filter(condition) {
        return new FilterObjects(this, condition);
    }
    /**
     * Count objects in set
     */
    count() {
        return new CountExpression(this);
    }
}
/**
 * Constant set of object IDs
 */
export class ObjectSetConstant extends ObjectSetExpression {
    constructor(objectIds) {
        super();
        this.objectIds = objectIds;
    }
    children() {
        return new Map();
    }
    domain() {
        return new ObjectSetDomain(this.objectIds);
    }
    evaluate(state) {
        return new Set(this.objectIds);
    }
    getVariables() {
        return new Set();
    }
    clone() {
        return new ObjectSetConstant(new Set(this.objectIds));
    }
    toString() {
        return `Set{${Array.from(this.objectIds).join(', ')}}`;
    }
}
/**
 * Variable reference as object set
 */
export class ObjectSetVariable extends ObjectSetExpression {
    constructor(variable) {
        super();
        this.variable = variable;
    }
    children() {
        return new Map();
    }
    domain() {
        return new ObjectSetDomain();
    }
    evaluate(state) {
        const value = state.get(this.variable);
        if (!(value instanceof Set)) {
            throw new Error(`Expected Set for variable ${this.variable.name}, got ${typeof value}`);
        }
        return value;
    }
    getVariables() {
        return new Set([this.variable]);
    }
    clone() {
        return new ObjectSetVariable(this.variable.clone());
    }
    toString() {
        return `ObjSetVar(${this.variable.name})`;
    }
}
/**
 * Union of two object sets
 */
export class UnionObjects extends ObjectSetExpression {
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
    domain() {
        return new ObjectSetDomain();
    }
    evaluate(state) {
        const leftSet = this.left.evaluate(state);
        const rightSet = this.right.evaluate(state);
        return new Set([...leftSet, ...rightSet]);
    }
    getVariables() {
        const vars = new Set();
        for (const v of this.left.getVariables())
            vars.add(v);
        for (const v of this.right.getVariables())
            vars.add(v);
        return vars;
    }
    clone() {
        return new UnionObjects(this.left.clone(), this.right.clone());
    }
    toString() {
        return `Union(${this.left}, ${this.right})`;
    }
}
/**
 * Intersection of two object sets
 */
export class IntersectionObjects extends ObjectSetExpression {
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
    domain() {
        return new ObjectSetDomain();
    }
    evaluate(state) {
        const leftSet = this.left.evaluate(state);
        const rightSet = this.right.evaluate(state);
        const intersection = new Set();
        for (const obj of leftSet) {
            if (rightSet.has(obj)) {
                intersection.add(obj);
            }
        }
        return intersection;
    }
    getVariables() {
        const vars = new Set();
        for (const v of this.left.getVariables())
            vars.add(v);
        for (const v of this.right.getVariables())
            vars.add(v);
        return vars;
    }
    clone() {
        return new IntersectionObjects(this.left.clone(), this.right.clone());
    }
    toString() {
        return `Intersection(${this.left}, ${this.right})`;
    }
}
/**
 * Difference of two object sets (left - right)
 */
export class DifferenceObjects extends ObjectSetExpression {
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
    domain() {
        return new ObjectSetDomain();
    }
    evaluate(state) {
        const leftSet = this.left.evaluate(state);
        const rightSet = this.right.evaluate(state);
        const difference = new Set(leftSet);
        for (const obj of rightSet) {
            difference.delete(obj);
        }
        return difference;
    }
    getVariables() {
        const vars = new Set();
        for (const v of this.left.getVariables())
            vars.add(v);
        for (const v of this.right.getVariables())
            vars.add(v);
        return vars;
    }
    clone() {
        return new DifferenceObjects(this.left.clone(), this.right.clone());
    }
    toString() {
        return `Difference(${this.left}, ${this.right})`;
    }
}
/**
 * Condition for filtering objects
 */
export class ObjectCondition extends Node {
}
/**
 * Filter objects by condition
 */
export class FilterObjects extends ObjectSetExpression {
    constructor(objects, condition) {
        super();
        this.objects = objects;
        this.condition = condition;
    }
    children() {
        return new Map([
            ['objects', this.objects],
            ['condition', this.condition]
        ]);
    }
    domain() {
        return new ObjectSetDomain();
    }
    evaluate(state) {
        const objectSet = this.objects.evaluate(state);
        const filtered = new Set();
        for (const obj of objectSet) {
            if (this.condition.evaluate(obj, state)) {
                filtered.add(obj);
            }
        }
        return filtered;
    }
    getVariables() {
        const vars = this.objects.getVariables();
        for (const v of this.condition.getVariables()) {
            vars.add(v);
        }
        return vars;
    }
    clone() {
        return new FilterObjects(this.objects.clone(), this.condition.clone());
    }
    toString() {
        return `Filter(${this.objects}, ${this.condition})`;
    }
}
/**
 * Tag-based object condition
 */
export class TagCondition extends ObjectCondition {
    constructor(requiredTags, excludedTags) {
        super();
        this.requiredTags = requiredTags;
        this.excludedTags = excludedTags;
    }
    children() {
        return new Map();
    }
    evaluate(objectId, state) {
        // Placeholder - requires tag system integration
        return true;
    }
    getVariables() {
        return new Set();
    }
    clone() {
        return new TagCondition(new Set(this.requiredTags), this.excludedTags ? new Set(this.excludedTags) : undefined);
    }
    toString() {
        return `TagCondition(req=[${Array.from(this.requiredTags).join(', ')}])`;
    }
}
/**
 * ForAll quantifier: ∀x ∈ objects. predicate(x)
 */
export class ForAll extends BoolExpression {
    constructor(variable, objects, predicate) {
        super();
        this.variable = variable;
        this.objects = objects;
        this.predicate = predicate;
    }
    children() {
        return new Map([
            ['objects', this.objects],
            ['predicate', this.predicate]
        ]);
    }
    evaluate(state) {
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
    clone() {
        return new ForAll(this.variable.clone(), this.objects.clone(), this.predicate.clone());
    }
    toString() {
        return `ForAll(${this.variable.name} ∈ ${this.objects}. ${this.predicate})`;
    }
}
/**
 * Exists quantifier: ∃x ∈ objects. predicate(x)
 */
export class Exists extends BoolExpression {
    constructor(variable, objects, predicate) {
        super();
        this.variable = variable;
        this.objects = objects;
        this.predicate = predicate;
    }
    children() {
        return new Map([
            ['objects', this.objects],
            ['predicate', this.predicate]
        ]);
    }
    evaluate(state) {
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
    clone() {
        return new Exists(this.variable.clone(), this.objects.clone(), this.predicate.clone());
    }
    toString() {
        return `Exists(${this.variable.name} ∈ ${this.objects}. ${this.predicate})`;
    }
}
/**
 * SumOver aggregator: Σx ∈ objects. scalar_expr(x)
 */
export class SumOver extends ScalarExpression {
    constructor(variable, objects, expression) {
        super();
        this.variable = variable;
        this.objects = objects;
        this.expression = expression;
    }
    children() {
        return new Map([
            ['objects', this.objects],
            ['expression', this.expression]
        ]);
    }
    evaluate(state) {
        const objectSet = this.objects.evaluate(state);
        let sum = 0;
        for (const obj of objectSet) {
            const extendedState = new Map(state);
            extendedState.set(this.variable, obj);
            sum += this.expression.evaluate(extendedState);
        }
        return sum;
    }
    clone() {
        return new SumOver(this.variable.clone(), this.objects.clone(), this.expression.clone());
    }
    toString() {
        return `SumOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
    }
}
/**
 * MeanOver aggregator: mean of scalar_expr over objects
 */
export class MeanOver extends ScalarExpression {
    constructor(variable, objects, expression) {
        super();
        this.variable = variable;
        this.objects = objects;
        this.expression = expression;
    }
    children() {
        return new Map([
            ['objects', this.objects],
            ['expression', this.expression]
        ]);
    }
    evaluate(state) {
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
    clone() {
        return new MeanOver(this.variable.clone(), this.objects.clone(), this.expression.clone());
    }
    toString() {
        return `MeanOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
    }
}
/**
 * MaxOver aggregator: max of scalar_expr over objects
 */
export class MaxOver extends ScalarExpression {
    constructor(variable, objects, expression) {
        super();
        this.variable = variable;
        this.objects = objects;
        this.expression = expression;
    }
    children() {
        return new Map([
            ['objects', this.objects],
            ['expression', this.expression]
        ]);
    }
    evaluate(state) {
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
    clone() {
        return new MaxOver(this.variable.clone(), this.objects.clone(), this.expression.clone());
    }
    toString() {
        return `MaxOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
    }
}
/**
 * MinOver aggregator: min of scalar_expr over objects
 */
export class MinOver extends ScalarExpression {
    constructor(variable, objects, expression) {
        super();
        this.variable = variable;
        this.objects = objects;
        this.expression = expression;
    }
    children() {
        return new Map([
            ['objects', this.objects],
            ['expression', this.expression]
        ]);
    }
    evaluate(state) {
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
    clone() {
        return new MinOver(this.variable.clone(), this.objects.clone(), this.expression.clone());
    }
    toString() {
        return `MinOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
    }
}
/**
 * Count expression: |objects|
 */
export class CountExpression extends ScalarExpression {
    constructor(objects) {
        super();
        this.objects = objects;
    }
    children() {
        return new Map([['objects', this.objects]]);
    }
    evaluate(state) {
        return this.objects.evaluate(state).size;
    }
    clone() {
        return new CountExpression(this.objects.clone());
    }
    toString() {
        return `Count(${this.objects})`;
    }
}
//# sourceMappingURL=set-reasoning.js.map