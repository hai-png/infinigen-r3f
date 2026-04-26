// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.
// Authors: Alexander Raistrick, Karhan Kayan
// Ported to TypeScript for React Three Fiber
import { ScalarExpression } from './expression';
/**
 * Geometric predicate expressions for constraint language
 * These compute scalar values from geometric relationships
 */
export class GeometryPredicate extends ScalarExpression {
}
/**
 * Distance between two objects or sets
 */
export class Distance extends GeometryPredicate {
    constructor(obj1, obj2) {
        super();
        this.obj1 = obj1;
        this.obj2 = obj2;
        this.predicateType = 'Distance';
    }
    children() {
        return new Map([
            ['obj1', this.obj1],
            ['obj2', this.obj2]
        ]);
    }
}
/**
 * Accessibility cost - how difficult it is to access an object
 */
export class AccessibilityCost extends GeometryPredicate {
    constructor(obj, fromObj) {
        super();
        this.obj = obj;
        this.fromObj = fromObj;
        this.predicateType = 'AccessibilityCost';
    }
    children() {
        return new Map([
            ['obj', this.obj],
            ['fromObj', this.fromObj]
        ]);
    }
}
/**
 * Focus score - how much an object is in focus from a viewpoint
 */
export class FocusScore extends GeometryPredicate {
    constructor(obj, viewer) {
        super();
        this.obj = obj;
        this.viewer = viewer;
        this.predicateType = 'FocusScore';
    }
    children() {
        return new Map([
            ['obj', this.obj],
            ['viewer', this.viewer]
        ]);
    }
}
/**
 * Angle between two objects or directions
 */
export class Angle extends GeometryPredicate {
    constructor(obj1, obj2) {
        super();
        this.obj1 = obj1;
        this.obj2 = obj2;
        this.predicateType = 'Angle';
    }
    children() {
        return new Map([
            ['obj1', this.obj1],
            ['obj2', this.obj2]
        ]);
    }
}
/**
 * Surface area of an object
 */
export class SurfaceArea extends GeometryPredicate {
    constructor(obj) {
        super();
        this.obj = obj;
        this.predicateType = 'SurfaceArea';
    }
    children() {
        return new Map([['obj', this.obj]]);
    }
}
/**
 * Volume of an object
 */
export class Volume extends GeometryPredicate {
    constructor(obj) {
        super();
        this.obj = obj;
        this.predicateType = 'Volume';
    }
    children() {
        return new Map([['obj', this.obj]]);
    }
}
/**
 * Count of objects in a set
 */
export class Count extends GeometryPredicate {
    constructor(objs) {
        super();
        this.objs = objs;
        this.predicateType = 'Count';
    }
    children() {
        return new Map([['objs', this.objs]]);
    }
}
/**
 * Height of an object above ground
 */
export class Height extends GeometryPredicate {
    constructor(obj) {
        super();
        this.obj = obj;
        this.predicateType = 'Height';
    }
    children() {
        return new Map([['obj', this.obj]]);
    }
}
/**
 * Width/bounding box dimension of an object
 */
export class Width extends GeometryPredicate {
    constructor(obj, axis = 'x') {
        super();
        this.obj = obj;
        this.axis = axis;
        this.predicateType = 'Width';
    }
    children() {
        return new Map([
            ['obj', this.obj],
            ['axis', this.axis]
        ]);
    }
}
/**
 * Center of mass position component
 */
export class CenterOfMass extends GeometryPredicate {
    constructor(obj, axis = 'y') {
        super();
        this.obj = obj;
        this.axis = axis;
        this.predicateType = 'CenterOfMass';
    }
    children() {
        return new Map([
            ['obj', this.obj],
            ['axis', this.axis]
        ]);
    }
}
/**
 * Normal direction alignment score
 */
export class NormalAlignment extends GeometryPredicate {
    constructor(obj, direction) {
        super();
        this.obj = obj;
        this.direction = direction;
        this.predicateType = 'NormalAlignment';
    }
    children() {
        return new Map([
            ['obj', this.obj],
            ['direction', this.direction]
        ]);
    }
}
/**
 * Clearance distance - minimum distance to any other object
 */
export class Clearance extends GeometryPredicate {
    constructor(obj, excludeSet) {
        super();
        this.obj = obj;
        this.excludeSet = excludeSet;
        this.predicateType = 'Clearance';
    }
    children() {
        const children = new Map([['obj', this.obj]]);
        if (this.excludeSet) {
            children.set('excludeSet', this.excludeSet);
        }
        return children;
    }
}
/**
 * Visibility score from a viewpoint
 */
export class VisibilityScore extends GeometryPredicate {
    constructor(obj, viewer) {
        super();
        this.obj = obj;
        this.viewer = viewer;
        this.predicateType = 'VisibilityScore';
    }
    children() {
        return new Map([
            ['obj', this.obj],
            ['viewer', this.viewer]
        ]);
    }
}
/**
 * Stability score - how stable an object is in its current pose
 */
export class StabilityScore extends GeometryPredicate {
    constructor(obj) {
        super();
        this.obj = obj;
        this.predicateType = 'StabilityScore';
    }
    children() {
        return new Map([['obj', this.obj]]);
    }
}
/**
 * Support contact area between two objects
 */
export class SupportContactArea extends GeometryPredicate {
    constructor(supported, supporter) {
        super();
        this.supported = supported;
        this.supporter = supporter;
        this.predicateType = 'SupportContactArea';
    }
    children() {
        return new Map([
            ['supported', this.supported],
            ['supporter', this.supporter]
        ]);
    }
}
/**
 * Reachability score - can an agent reach this object
 */
export class ReachabilityScore extends GeometryPredicate {
    constructor(obj, agent) {
        super();
        this.obj = obj;
        this.agent = agent;
        this.predicateType = 'ReachabilityScore';
    }
    children() {
        return new Map([
            ['obj', this.obj],
            ['agent', this.agent]
        ]);
    }
}
/**
 * Orientation alignment with a target direction
 */
export class OrientationAlignment extends GeometryPredicate {
    constructor(obj, targetDirection) {
        super();
        this.obj = obj;
        this.targetDirection = targetDirection;
        this.predicateType = 'OrientationAlignment';
    }
    children() {
        return new Map([
            ['obj', this.obj],
            ['targetDirection', this.targetDirection]
        ]);
    }
}
/**
 * Compactness ratio - volume / surface_area^(3/2)
 */
export class Compactness extends GeometryPredicate {
    constructor(obj) {
        super();
        this.obj = obj;
        this.predicateType = 'Compactness';
    }
    children() {
        return new Map([['obj', this.obj]]);
    }
}
/**
 * Aspect ratio of bounding box
 */
export class AspectRatio extends GeometryPredicate {
    constructor(obj, axis1 = 'x', axis2 = 'y') {
        super();
        this.obj = obj;
        this.axis1 = axis1;
        this.axis2 = axis2;
        this.predicateType = 'AspectRatio';
    }
    children() {
        return new Map([
            ['obj', this.obj],
            ['axis1', this.axis1],
            ['axis2', this.axis2]
        ]);
    }
}
//# sourceMappingURL=geometry.js.map