/**
 * Spatial Relations for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/relations.py
 */
import { Node, Variable } from './types.js';
import { BoolExpression } from './expression.js';
import { ObjectSetExpression } from './set-reasoning.js';
/**
 * Base class for all relations (constraints)
 */
export declare abstract class Relation extends BoolExpression {
    /**
     * Check if this relation is satisfied
     */
    abstract isSatisfied(state: Map<Variable, any>): boolean;
    /**
     * Get the variables involved in this relation
     */
    abstract getVariables(): Set<Variable>;
}
/**
 * Special relation that matches any object set
 */
export declare class AnyRelation extends Relation {
    readonly objects: ObjectSetExpression;
    constructor(objects: ObjectSetExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): AnyRelation;
    toString(): string;
}
/**
 * Negated relation: NOT(relation)
 */
export declare class NegatedRelation extends Relation {
    readonly relation: Relation;
    constructor(relation: Relation);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): NegatedRelation;
    toString(): string;
}
/**
 * Conjunction of relations: AND(relations)
 */
export declare class AndRelations extends Relation {
    readonly relations: Relation[];
    constructor(relations: Relation[]);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): AndRelations;
    toString(): string;
}
/**
 * Disjunction of relations: OR(relations)
 */
export declare class OrRelations extends Relation {
    readonly relations: Relation[];
    constructor(relations: Relation[]);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): OrRelations;
    toString(): string;
}
/**
 * Base class for geometry-based relations
 */
export declare abstract class GeometryRelation extends Relation {
    readonly objects1: ObjectSetExpression;
    readonly objects2: ObjectSetExpression;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression);
    getVariables(): Set<Variable>;
}
/**
 * Touching relation: objects1 are touching objects2
 */
export declare class Touching extends GeometryRelation {
    readonly threshold: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, threshold?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): Touching;
    toString(): string;
}
/**
 * Supported by relation: objects1 are supported by objects2
 */
export declare class SupportedBy extends GeometryRelation {
    readonly tolerance: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, tolerance?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): SupportedBy;
    toString(): string;
}
/**
 * Co-planar relation: objects are on the same plane
 */
export declare class CoPlanar extends GeometryRelation {
    readonly normalTolerance: number;
    readonly distanceTolerance: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, normalTolerance?: number, distanceTolerance?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): CoPlanar;
    toString(): string;
}
/**
 * Stable against relation: objects1 are stable against objects2
 */
export declare class StableAgainst extends GeometryRelation {
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): StableAgainst;
    toString(): string;
}
/**
 * Facing relation: objects1 are facing objects2
 */
export declare class Facing extends GeometryRelation {
    readonly angleThreshold: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, angleThreshold?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): Facing;
    toString(): string;
}
/**
 * Between relation: objects1 are between objects2 and objects3
 */
export declare class Between extends Relation {
    readonly objects1: ObjectSetExpression;
    readonly objects2: ObjectSetExpression;
    readonly objects3: ObjectSetExpression;
    readonly axis: 'x' | 'y' | 'z' | 'any';
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, objects3: ObjectSetExpression, axis?: 'x' | 'y' | 'z' | 'any');
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): Between;
    toString(): string;
}
/**
 * Accessible from relation: objects1 are accessible from objects2
 */
export declare class AccessibleFrom extends GeometryRelation {
    readonly reachDistance: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, reachDistance?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): AccessibleFrom;
    toString(): string;
}
/**
 * Reachable from relation: objects1 are reachable from objects2 via path
 */
export declare class ReachableFrom extends GeometryRelation {
    readonly maxPathLength?: number | undefined;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, maxPathLength?: number | undefined);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): ReachableFrom;
    toString(): string;
}
/**
 * In front of relation: objects1 are in front of objects2
 */
export declare class InFrontOf extends GeometryRelation {
    readonly distance: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, distance?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): InFrontOf;
    toString(): string;
}
/**
 * Aligned relation: objects1 are aligned with objects2
 */
export declare class Aligned extends GeometryRelation {
    readonly axis: 'x' | 'y' | 'z';
    readonly tolerance: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, axis?: 'x' | 'y' | 'z', tolerance?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): Aligned;
    toString(): string;
}
/**
 * Hidden relation: objects1 are hidden from view
 */
export declare class Hidden extends Relation {
    readonly objects: ObjectSetExpression;
    constructor(objects: ObjectSetExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): Hidden;
    toString(): string;
}
/**
 * Visible relation: objects are visible from camera/viewpoint
 */
export declare class Visible extends Relation {
    readonly objects: ObjectSetExpression;
    readonly viewpoint?: ObjectSetExpression | undefined;
    constructor(objects: ObjectSetExpression, viewpoint?: ObjectSetExpression | undefined);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): Visible;
    toString(): string;
}
/**
 * Grouped relation: objects are close together
 */
export declare class Grouped extends Relation {
    readonly objects: ObjectSetExpression;
    readonly maxDistance: number;
    constructor(objects: ObjectSetExpression, maxDistance?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): Grouped;
    toString(): string;
}
/**
 * Distributed relation: objects are spread apart
 */
export declare class Distributed extends Relation {
    readonly objects: ObjectSetExpression;
    readonly minDistance: number;
    constructor(objects: ObjectSetExpression, minDistance?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): Distributed;
    toString(): string;
}
/**
 * Coverage relation: objects1 cover objects2
 */
export declare class Coverage extends GeometryRelation {
    readonly coverageThreshold: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, coverageThreshold?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): Coverage;
    toString(): string;
}
/**
 * Support coverage relation
 */
export declare class SupportCoverage extends GeometryRelation {
    readonly minSupport: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, minSupport?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): SupportCoverage;
    toString(): string;
}
/**
 * Stability relation: objects are stable (won't fall)
 */
export declare class Stability extends Relation {
    readonly objects: ObjectSetExpression;
    constructor(objects: ObjectSetExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    getVariables(): Set<Variable>;
    clone(): Stability;
    toString(): string;
}
/**
 * Containment relation: objects1 contain objects2
 */
export declare class Containment extends GeometryRelation {
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): Containment;
    toString(): string;
}
/**
 * Proximity relation: objects are within certain distance
 */
export declare class Proximity extends GeometryRelation {
    readonly maxDistance: number;
    constructor(objects1: ObjectSetExpression, objects2: ObjectSetExpression, maxDistance?: number);
    children(): Map<string, Node>;
    evaluate(state: Map<Variable, any>): boolean;
    isSatisfied(state: Map<Variable, any>): boolean;
    clone(): Proximity;
    toString(): string;
}
//# sourceMappingURL=relations.d.ts.map