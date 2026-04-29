import { ScalarExpression, BoolExpression } from './expression';
import { ObjectSetExpression } from './set-reasoning';
/**
 * Constant expressions for constraint language
 */
/**
 * Create a scalar constant expression
 */
export declare function scalar(value: number): ScalarConstant;
/**
 * Create a boolean constant expression
 */
export declare function bool(value: boolean): BoolConstant;
/**
 * Scalar constant expression
 */
export declare class ScalarConstant extends ScalarExpression {
    readonly value: number;
    constructor(value: number);
    children(): Map<string, any>;
}
/**
 * Boolean constant expression
 */
export declare class BoolConstant extends BoolExpression {
    readonly value: boolean;
    constructor(value: boolean);
    children(): Map<string, any>;
}
/**
 * Common numeric constants
 */
export declare const ZERO: ScalarConstant;
export declare const ONE: ScalarConstant;
export declare const HALF: ScalarConstant;
export declare const EPSILON: ScalarConstant;
/**
 * Common boolean constants
 */
export declare const TRUE: BoolConstant;
export declare const FALSE: BoolConstant;
/**
 * Create a variable reference for an object set
 */
export declare function item(name: string, memberOf?: ObjectSetExpression): ItemExpression;
/**
 * Item expression - references a variable in the constraint system
 */
export declare class ItemExpression extends ObjectSetExpression {
    readonly name: string;
    memberOf?: ObjectSetExpression | undefined;
    constructor(name: string, memberOf?: ObjectSetExpression | undefined);
    children(): Map<string, any>;
}
/**
 * Create a tagged object set expression
 */
export declare function tagged(objs: ObjectSetExpression, tags: string[]): TaggedExpression;
/**
 * Tagged object set - filters objects by semantic tags
 */
export declare class TaggedExpression extends ObjectSetExpression {
    readonly objs: ObjectSetExpression;
    readonly tags: string[];
    constructor(objs: ObjectSetExpression, tags: string[]);
    children(): Map<string, any>;
}
/**
 * Scene-wide object set - all objects in the scene
 */
export declare class SceneExpression extends ObjectSetExpression {
    children(): Map<string, any>;
}
/**
 * Singleton instance for scene expression
 */
export declare const SCENE: SceneExpression;
/**
 * Problem definition - collection of constraints and score terms
 */
export declare class Problem {
    constraints: Map<string, BoolExpression>;
    scoreTerms: Map<string, ScalarExpression>;
    constructor(constraints?: Map<string, BoolExpression>, scoreTerms?: Map<string, ScalarExpression>);
    addConstraint(name: string, constraint: BoolExpression): void;
    addScoreTerm(name: string, term: ScalarExpression): void;
    /**
     * Get all expressions in the problem (constraints and score terms)
     */
    allExpressions(): Generator<ScalarExpression | BoolExpression>;
    /**
     * Count total number of nodes in the problem
     */
    totalNodes(): number;
}
/**
 * Named constraint wrapper
 */
export declare class NamedConstraint {
    readonly name: string;
    readonly constraint: BoolExpression;
    readonly weight: number;
    readonly required: boolean;
    constructor(name: string, constraint: BoolExpression, weight?: number, required?: boolean);
}
/**
 * Named score term wrapper
 */
export declare class NamedScoreTerm {
    readonly name: string;
    readonly term: ScalarExpression;
    readonly weight: number;
    readonly minimize: boolean;
    constructor(name: string, term: ScalarExpression, weight?: number, minimize?: boolean);
}
/**
 * Build a problem from named constraints and score terms
 */
export declare function buildProblem(constraints?: NamedConstraint[], scoreTerms?: NamedScoreTerm[]): Problem;
//# sourceMappingURL=constants.d.ts.map