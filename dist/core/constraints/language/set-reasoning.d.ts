/**
 * Set Reasoning for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/set_reasoning.py
 */
import { Node, Variable, ObjectSetDomain } from './types.js';
import { ScalarExpression, BoolExpression } from './expression.js';
/**
 * Base class for object set expressions
 */
export declare abstract class ObjectSetExpression extends Node {
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
    union(other: ObjectSetExpression): UnionObjects;
    /**
     * Intersection with another set
     */
    intersection(other: ObjectSetExpression): IntersectionObjects;
    /**
     * Difference with another set
     */
    difference(other: ObjectSetExpression): DifferenceObjects;
    /**
     * Filter by condition
     */
    filter(condition: ObjectCondition): FilterObjects;
    /**
     * Count objects in set
     */
    count(): CountExpression;
}
/**
 * Constant set of object IDs
 */
export declare class ObjectSetConstant extends ObjectSetExpression {
    readonly objectIds: Set<string>;
    constructor(objectIds: Set<string>);
    children(): Map<string, Node>;
    domain(): ObjectSetDomain;
    evaluate(state: Map<Variable, any>): Set<string>;
    getVariables(): Set<Variable>;
    clone(): ObjectSetConstant;
    toString(): string;
}
/**
 * Variable reference as object set
 */
export declare class ObjectSetVariable extends ObjectSetExpression {
    readonly variable: Variable;
    constructor(variable: Variable);
    children(): Map<string, Node>;
    domain(): ObjectSetDomain;
    evaluate(state: Map<Variable, any>): Set<string>;
    getVariables(): Set<Variable>;
    clone(): ObjectSetVariable;
    toString(): string;
}
/**
 * Union of two object sets
 */
export declare class UnionObjects extends ObjectSetExpression {
    readonly left: ObjectSetExpression;
    readonly right: ObjectSetExpression;
    constructor(left: ObjectSetExpression, right: ObjectSetExpression);
    children(): Map<string, Node>;
    domain(): ObjectSetDomain;
    evaluate(state: Map<Variable, any>): Set<string>;
    getVariables(): Set<Variable>;
    clone(): UnionObjects;
    toString(): string;
}
/**
 * Intersection of two object sets
 */
export declare class IntersectionObjects extends ObjectSetExpression {
    readonly left: ObjectSetExpression;
    readonly right: ObjectSetExpression;
    constructor(left: ObjectSetExpression, right: ObjectSetExpression);
    children(): Map<string, Node>;
    domain(): ObjectSetDomain;
    evaluate(state: Map<Variable, any>): Set<string>;
    getVariables(): Set<Variable>;
    clone(): IntersectionObjects;
    toString(): string;
}
/**
 * Difference of two object sets (left - right)
 */
export declare class DifferenceObjects extends ObjectSetExpression {
    readonly left: ObjectSetExpression;
    readonly right: ObjectSetExpression;
    constructor(left: ObjectSetExpression, right: ObjectSetExpression);
    children(): Map<string, Node>;
    domain(): ObjectSetDomain;
    evaluate(state: Map<Variable, any>): Set<string>;
    getVariables(): Set<Variable>;
    clone(): DifferenceObjects;
    toString(): string;
}
/**
 * Condition for filtering objects
 */
export declare abstract class ObjectCondition extends Node {
    abstract evaluate(objectId: string, state: Map<Variable, any>): boolean;
    abstract getVariables(): Set<Variable>;
}
/**
 * Filter objects by condition
 */
export declare class FilterObjects extends ObjectSetExpression {
    readonly objects: ObjectSetExpression;
    readonly condition: ObjectCondition;
    constructor(objects: ObjectSetExpression, condition: ObjectCondition);
    children(): Map<string, Node>;
    domain(): ObjectSetDomain;
    evaluate(state: Map<Variable, any>): Set<string>;
    getVariables(): Set<Variable>;
    clone(): FilterObjects;
    toString(): string;
}
/**
 * Tag-based object condition
 */
export declare class TagCondition extends ObjectCondition {
    readonly requiredTags: Set<string>;
    readonly excludedTags?: Set<string> | undefined;
    constructor(requiredTags: Set<string>, excludedTags?: Set<string> | undefined);
    children(): Map<string, Node>;
    evaluate(objectId: string, state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): TagCondition;
    toString(): string;
}
/**
 * ForAll quantifier: ∀x ∈ objects. predicate(x)
 */
export declare class ForAll extends BoolExpression {
    readonly variable: Variable;
    readonly objects: ObjectSetExpression;
    readonly predicate: BoolExpression;
    constructor(variable: Variable, objects: ObjectSetExpression, predicate: BoolExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    clone(): ForAll;
    toString(): string;
}
/**
 * Exists quantifier: ∃x ∈ objects. predicate(x)
 */
export declare class Exists extends BoolExpression {
    readonly variable: Variable;
    readonly objects: ObjectSetExpression;
    readonly predicate: BoolExpression;
    constructor(variable: Variable, objects: ObjectSetExpression, predicate: BoolExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    clone(): Exists;
    toString(): string;
}
/**
 * SumOver aggregator: Σx ∈ objects. scalar_expr(x)
 */
export declare class SumOver extends ScalarExpression {
    readonly variable: Variable;
    readonly objects: ObjectSetExpression;
    readonly expression: ScalarExpression;
    constructor(variable: Variable, objects: ObjectSetExpression, expression: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): SumOver;
    toString(): string;
}
/**
 * MeanOver aggregator: mean of scalar_expr over objects
 */
export declare class MeanOver extends ScalarExpression {
    readonly variable: Variable;
    readonly objects: ObjectSetExpression;
    readonly expression: ScalarExpression;
    constructor(variable: Variable, objects: ObjectSetExpression, expression: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): MeanOver;
    toString(): string;
}
/**
 * MaxOver aggregator: max of scalar_expr over objects
 */
export declare class MaxOver extends ScalarExpression {
    readonly variable: Variable;
    readonly objects: ObjectSetExpression;
    readonly expression: ScalarExpression;
    constructor(variable: Variable, objects: ObjectSetExpression, expression: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): MaxOver;
    toString(): string;
}
/**
 * MinOver aggregator: min of scalar_expr over objects
 */
export declare class MinOver extends ScalarExpression {
    readonly variable: Variable;
    readonly objects: ObjectSetExpression;
    readonly expression: ScalarExpression;
    constructor(variable: Variable, objects: ObjectSetExpression, expression: ScalarExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): MinOver;
    toString(): string;
}
/**
 * Count expression: |objects|
 */
export declare class CountExpression extends ScalarExpression {
    readonly objects: ObjectSetExpression;
    constructor(objects: ObjectSetExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): number;
    clone(): CountExpression;
    toString(): string;
}
//# sourceMappingURL=set-reasoning.d.ts.map