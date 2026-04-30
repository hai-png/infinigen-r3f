// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick, Karhan Kayan
// Ported to TypeScript for React Three Fiber

import { Node, Variable } from './types';
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
  readonly type = 'Distance';
  readonly predicateType = 'Distance';
  
  constructor(
    public obj1: ObjectSetExpression,
    public obj2: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj1', this.obj1],
      ['obj2', this.obj2]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    // Placeholder - requires distance computation between object sets
    return 0;
  }

  clone(): Distance {
    return new Distance(
      this.obj1.clone() as ObjectSetExpression,
      this.obj2.clone() as ObjectSetExpression
    );
  }
}

/**
 * Accessibility cost - how difficult it is to access an object
 */
export class AccessibilityCost extends GeometryPredicate {
  readonly type = 'AccessibilityCost';
  readonly predicateType = 'AccessibilityCost';
  
  constructor(
    public obj: ObjectSetExpression,
    public fromObj: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj', this.obj],
      ['fromObj', this.fromObj]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): AccessibilityCost {
    return new AccessibilityCost(
      this.obj.clone() as ObjectSetExpression,
      this.fromObj.clone() as ObjectSetExpression
    );
  }
}

/**
 * Focus score - how much an object is in focus from a viewpoint
 */
export class FocusScore extends GeometryPredicate {
  readonly type = 'FocusScore';
  readonly predicateType = 'FocusScore';
  
  constructor(
    public obj: ObjectSetExpression,
    public viewer: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj', this.obj],
      ['viewer', this.viewer]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): FocusScore {
    return new FocusScore(
      this.obj.clone() as ObjectSetExpression,
      this.viewer.clone() as ObjectSetExpression
    );
  }
}

/**
 * Angle between two objects or directions
 */
export class Angle extends GeometryPredicate {
  readonly type = 'Angle';
  readonly predicateType = 'Angle';
  
  constructor(
    public obj1: ObjectSetExpression,
    public obj2: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj1', this.obj1],
      ['obj2', this.obj2]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): Angle {
    return new Angle(
      this.obj1.clone() as ObjectSetExpression,
      this.obj2.clone() as ObjectSetExpression
    );
  }
}

/**
 * Surface area of an object
 */
export class SurfaceArea extends GeometryPredicate {
  readonly type = 'SurfaceArea';
  readonly predicateType = 'SurfaceArea';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): SurfaceArea {
    return new SurfaceArea(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Volume of an object
 */
export class Volume extends GeometryPredicate {
  readonly type = 'Volume';
  readonly predicateType = 'Volume';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): Volume {
    return new Volume(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Count of objects in a set
 */
export class Count extends GeometryPredicate {
  readonly type = 'Count';
  readonly predicateType = 'Count';
  
  constructor(public objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return this.objs.evaluate(state).size;
  }

  clone(): Count {
    return new Count(this.objs.clone() as ObjectSetExpression);
  }
}

/**
 * Height of an object above ground
 */
export class Height extends GeometryPredicate {
  readonly type = 'Height';
  readonly predicateType = 'Height';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): Height {
    return new Height(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Width/bounding box dimension of an object
 */
export class Width extends GeometryPredicate {
  readonly type = 'Width';
  readonly predicateType = 'Width';
  
  constructor(
    public obj: ObjectSetExpression,
    public axis: 'x' | 'y' | 'z' = 'x'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): Width {
    return new Width(this.obj.clone() as ObjectSetExpression, this.axis);
  }
}

/**
 * Center of mass position component
 */
export class CenterOfMass extends GeometryPredicate {
  readonly type = 'CenterOfMass';
  readonly predicateType = 'CenterOfMass';
  
  constructor(
    public obj: ObjectSetExpression,
    public axis: 'x' | 'y' | 'z' = 'y'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): CenterOfMass {
    return new CenterOfMass(this.obj.clone() as ObjectSetExpression, this.axis);
  }
}

/**
 * Normal direction alignment score
 */
export class NormalAlignment extends GeometryPredicate {
  readonly type = 'NormalAlignment';
  readonly predicateType = 'NormalAlignment';
  
  constructor(
    public obj: ObjectSetExpression,
    public direction: [number, number, number]
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): NormalAlignment {
    return new NormalAlignment(this.obj.clone() as ObjectSetExpression, [...this.direction]);
  }
}

/**
 * Clearance distance - minimum distance to any other object
 */
export class Clearance extends GeometryPredicate {
  readonly type = 'Clearance';
  readonly predicateType = 'Clearance';
  
  constructor(
    public obj: ObjectSetExpression,
    public excludeSet?: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    const children = new Map<string, Node>([['obj', this.obj]]);
    if (this.excludeSet) {
      children.set('excludeSet', this.excludeSet);
    }
    return children;
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): Clearance {
    return new Clearance(
      this.obj.clone() as ObjectSetExpression,
      this.excludeSet?.clone() as ObjectSetExpression | undefined
    );
  }
}

/**
 * Visibility score from a viewpoint
 */
export class VisibilityScore extends GeometryPredicate {
  readonly type = 'VisibilityScore';
  readonly predicateType = 'VisibilityScore';
  
  constructor(
    public obj: ObjectSetExpression,
    public viewer: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj', this.obj],
      ['viewer', this.viewer]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): VisibilityScore {
    return new VisibilityScore(
      this.obj.clone() as ObjectSetExpression,
      this.viewer.clone() as ObjectSetExpression
    );
  }
}

/**
 * Stability score - how stable an object is in its current pose
 */
export class StabilityScore extends GeometryPredicate {
  readonly type = 'StabilityScore';
  readonly predicateType = 'StabilityScore';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): StabilityScore {
    return new StabilityScore(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Support contact area between two objects
 */
export class SupportContactArea extends GeometryPredicate {
  readonly type = 'SupportContactArea';
  readonly predicateType = 'SupportContactArea';
  
  constructor(
    public supported: ObjectSetExpression,
    public supporter: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['supported', this.supported],
      ['supporter', this.supporter]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): SupportContactArea {
    return new SupportContactArea(
      this.supported.clone() as ObjectSetExpression,
      this.supporter.clone() as ObjectSetExpression
    );
  }
}

/**
 * Reachability score - can an agent reach this object
 */
export class ReachabilityScore extends GeometryPredicate {
  readonly type = 'ReachabilityScore';
  readonly predicateType = 'ReachabilityScore';
  
  constructor(
    public obj: ObjectSetExpression,
    public agent: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj', this.obj],
      ['agent', this.agent]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): ReachabilityScore {
    return new ReachabilityScore(
      this.obj.clone() as ObjectSetExpression,
      this.agent.clone() as ObjectSetExpression
    );
  }
}

/**
 * Orientation alignment with a target direction
 */
export class OrientationAlignment extends GeometryPredicate {
  readonly type = 'OrientationAlignment';
  readonly predicateType = 'OrientationAlignment';
  
  constructor(
    public obj: ObjectSetExpression,
    public targetDirection: [number, number, number]
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): OrientationAlignment {
    return new OrientationAlignment(this.obj.clone() as ObjectSetExpression, [...this.targetDirection]);
  }
}

/**
 * Compactness ratio - volume / surface_area^(3/2)
 */
export class Compactness extends GeometryPredicate {
  readonly type = 'Compactness';
  readonly predicateType = 'Compactness';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): Compactness {
    return new Compactness(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Aspect ratio of bounding box
 */
export class AspectRatio extends GeometryPredicate {
  readonly type = 'AspectRatio';
  readonly predicateType = 'AspectRatio';
  
  constructor(
    public obj: ObjectSetExpression,
    public axis1: 'x' | 'y' | 'z' = 'x',
    public axis2: 'x' | 'y' | 'z' = 'y'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return 0;
  }

  clone(): AspectRatio {
    return new AspectRatio(this.obj.clone() as ObjectSetExpression, this.axis1, this.axis2);
  }
}
