// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick, Karhan Kayan
// Ported to TypeScript for React Three Fiber

import { ScalarExpression } from './expression';
import { ObjectSetExpression } from './set-reasoning';

/**
 * Geometric predicate expressions for constraint language
 * These compute scalar values from geometric relationships
 */

export abstract class GeometryPredicate extends ScalarExpression {
  abstract readonly predicateType: string;
}

/**
 * Distance between two objects or sets
 */
export class Distance extends GeometryPredicate {
  readonly predicateType = 'Distance';
  
  constructor(
    public obj1: ObjectSetExpression,
    public obj2: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'AccessibilityCost';
  
  constructor(
    public obj: ObjectSetExpression,
    public fromObj: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'FocusScore';
  
  constructor(
    public obj: ObjectSetExpression,
    public viewer: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'Angle';
  
  constructor(
    public obj1: ObjectSetExpression,
    public obj2: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'SurfaceArea';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, any> {
    return new Map([['obj', this.obj]]);
  }
}

/**
 * Volume of an object
 */
export class Volume extends GeometryPredicate {
  readonly predicateType = 'Volume';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, any> {
    return new Map([['obj', this.obj]]);
  }
}

/**
 * Count of objects in a set
 */
export class Count extends GeometryPredicate {
  readonly predicateType = 'Count';
  
  constructor(public objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, any> {
    return new Map([['objs', this.objs]]);
  }
}

/**
 * Height of an object above ground
 */
export class Height extends GeometryPredicate {
  readonly predicateType = 'Height';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, any> {
    return new Map([['obj', this.obj]]);
  }
}

/**
 * Width/bounding box dimension of an object
 */
export class Width extends GeometryPredicate {
  readonly predicateType = 'Width';
  
  constructor(
    public obj: ObjectSetExpression,
    public axis: 'x' | 'y' | 'z' = 'x'
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'CenterOfMass';
  
  constructor(
    public obj: ObjectSetExpression,
    public axis: 'x' | 'y' | 'z' = 'y'
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'NormalAlignment';
  
  constructor(
    public obj: ObjectSetExpression,
    public direction: [number, number, number]
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'Clearance';
  
  constructor(
    public obj: ObjectSetExpression,
    public excludeSet?: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'VisibilityScore';
  
  constructor(
    public obj: ObjectSetExpression,
    public viewer: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'StabilityScore';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, any> {
    return new Map([['obj', this.obj]]);
  }
}

/**
 * Support contact area between two objects
 */
export class SupportContactArea extends GeometryPredicate {
  readonly predicateType = 'SupportContactArea';
  
  constructor(
    public supported: ObjectSetExpression,
    public supporter: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'ReachabilityScore';
  
  constructor(
    public obj: ObjectSetExpression,
    public agent: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'OrientationAlignment';
  
  constructor(
    public obj: ObjectSetExpression,
    public targetDirection: [number, number, number]
  ) {
    super();
  }

  children(): Map<string, any> {
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
  readonly predicateType = 'Compactness';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, any> {
    return new Map([['obj', this.obj]]);
  }
}

/**
 * Aspect ratio of bounding box
 */
export class AspectRatio extends GeometryPredicate {
  readonly predicateType = 'AspectRatio';
  
  constructor(
    public obj: ObjectSetExpression,
    public axis1: 'x' | 'y' | 'z' = 'x',
    public axis2: 'x' | 'y' | 'z' = 'y'
  ) {
    super();
  }

  children(): Map<string, any> {
    return new Map([
      ['obj', this.obj],
      ['axis1', this.axis1],
      ['axis2', this.axis2]
    ]);
  }
}
