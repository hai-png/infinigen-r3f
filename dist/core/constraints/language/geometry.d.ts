import { ScalarExpression } from './expression';
import { ObjectSetExpression } from './set-reasoning';
/**
 * Geometric predicate expressions for constraint language
 * These compute scalar values from geometric relationships
 */
export declare abstract class GeometryPredicate extends ScalarExpression {
    abstract readonly predicateType: string;
}
/**
 * Distance between two objects or sets
 */
export declare class Distance extends GeometryPredicate {
    obj1: ObjectSetExpression;
    obj2: ObjectSetExpression;
    readonly predicateType = "Distance";
    constructor(obj1: ObjectSetExpression, obj2: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Accessibility cost - how difficult it is to access an object
 */
export declare class AccessibilityCost extends GeometryPredicate {
    obj: ObjectSetExpression;
    fromObj: ObjectSetExpression;
    readonly predicateType = "AccessibilityCost";
    constructor(obj: ObjectSetExpression, fromObj: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Focus score - how much an object is in focus from a viewpoint
 */
export declare class FocusScore extends GeometryPredicate {
    obj: ObjectSetExpression;
    viewer: ObjectSetExpression;
    readonly predicateType = "FocusScore";
    constructor(obj: ObjectSetExpression, viewer: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Angle between two objects or directions
 */
export declare class Angle extends GeometryPredicate {
    obj1: ObjectSetExpression;
    obj2: ObjectSetExpression;
    readonly predicateType = "Angle";
    constructor(obj1: ObjectSetExpression, obj2: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Surface area of an object
 */
export declare class SurfaceArea extends GeometryPredicate {
    obj: ObjectSetExpression;
    readonly predicateType = "SurfaceArea";
    constructor(obj: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Volume of an object
 */
export declare class Volume extends GeometryPredicate {
    obj: ObjectSetExpression;
    readonly predicateType = "Volume";
    constructor(obj: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Count of objects in a set
 */
export declare class Count extends GeometryPredicate {
    objs: ObjectSetExpression;
    readonly predicateType = "Count";
    constructor(objs: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Height of an object above ground
 */
export declare class Height extends GeometryPredicate {
    obj: ObjectSetExpression;
    readonly predicateType = "Height";
    constructor(obj: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Width/bounding box dimension of an object
 */
export declare class Width extends GeometryPredicate {
    obj: ObjectSetExpression;
    axis: 'x' | 'y' | 'z';
    readonly predicateType = "Width";
    constructor(obj: ObjectSetExpression, axis?: 'x' | 'y' | 'z');
    children(): Map<string, any>;
}
/**
 * Center of mass position component
 */
export declare class CenterOfMass extends GeometryPredicate {
    obj: ObjectSetExpression;
    axis: 'x' | 'y' | 'z';
    readonly predicateType = "CenterOfMass";
    constructor(obj: ObjectSetExpression, axis?: 'x' | 'y' | 'z');
    children(): Map<string, any>;
}
/**
 * Normal direction alignment score
 */
export declare class NormalAlignment extends GeometryPredicate {
    obj: ObjectSetExpression;
    direction: [number, number, number];
    readonly predicateType = "NormalAlignment";
    constructor(obj: ObjectSetExpression, direction: [number, number, number]);
    children(): Map<string, any>;
}
/**
 * Clearance distance - minimum distance to any other object
 */
export declare class Clearance extends GeometryPredicate {
    obj: ObjectSetExpression;
    excludeSet?: ObjectSetExpression | undefined;
    readonly predicateType = "Clearance";
    constructor(obj: ObjectSetExpression, excludeSet?: ObjectSetExpression | undefined);
    children(): Map<string, any>;
}
/**
 * Visibility score from a viewpoint
 */
export declare class VisibilityScore extends GeometryPredicate {
    obj: ObjectSetExpression;
    viewer: ObjectSetExpression;
    readonly predicateType = "VisibilityScore";
    constructor(obj: ObjectSetExpression, viewer: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Stability score - how stable an object is in its current pose
 */
export declare class StabilityScore extends GeometryPredicate {
    obj: ObjectSetExpression;
    readonly predicateType = "StabilityScore";
    constructor(obj: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Support contact area between two objects
 */
export declare class SupportContactArea extends GeometryPredicate {
    supported: ObjectSetExpression;
    supporter: ObjectSetExpression;
    readonly predicateType = "SupportContactArea";
    constructor(supported: ObjectSetExpression, supporter: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Reachability score - can an agent reach this object
 */
export declare class ReachabilityScore extends GeometryPredicate {
    obj: ObjectSetExpression;
    agent: ObjectSetExpression;
    readonly predicateType = "ReachabilityScore";
    constructor(obj: ObjectSetExpression, agent: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Orientation alignment with a target direction
 */
export declare class OrientationAlignment extends GeometryPredicate {
    obj: ObjectSetExpression;
    targetDirection: [number, number, number];
    readonly predicateType = "OrientationAlignment";
    constructor(obj: ObjectSetExpression, targetDirection: [number, number, number]);
    children(): Map<string, any>;
}
/**
 * Compactness ratio - volume / surface_area^(3/2)
 */
export declare class Compactness extends GeometryPredicate {
    obj: ObjectSetExpression;
    readonly predicateType = "Compactness";
    constructor(obj: ObjectSetExpression);
    children(): Map<string, any>;
}
/**
 * Aspect ratio of bounding box
 */
export declare class AspectRatio extends GeometryPredicate {
    obj: ObjectSetExpression;
    axis1: 'x' | 'y' | 'z';
    axis2: 'x' | 'y' | 'z';
    readonly predicateType = "AspectRatio";
    constructor(obj: ObjectSetExpression, axis1?: 'x' | 'y' | 'z', axis2?: 'x' | 'y' | 'z');
    children(): Map<string, any>;
}
//# sourceMappingURL=geometry.d.ts.map