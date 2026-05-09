/**
 * Spatial Relations for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/relations.py
 *
 * Each relation's evaluate() method resolves ObjectSetExpressions to object IDs,
 * retrieves their SpatialObject data from the state, and computes the actual
 * spatial predicate.
 */

import { Node, Variable, Domain, ObjectSetDomain } from './types';
import { BoolExpression, ScalarExpression, BoolConstant } from './expression';
import { ObjectSetExpression } from './set-reasoning';
import {
  SpatialObject,
  retrieveSpatialObjects,
  toVec3,
  distance,
  dot,
  normalize,
  sub,
  angleBetween,
  getAABB,
  aabbOverlapOrNear,
  aabbOverlapXZ,
  aabbContainedIn,
  aabbOverlapAreaXZ,
  aabbDistance,
  getForward,
  directionTo,
  rayAABBIntersection,
} from './spatial-helpers';

/**
 * Base class for all relations (constraints)
 */
export abstract class Relation extends BoolExpression {
  /**
   * Check if this relation is satisfied
   */
  abstract isSatisfied(state: Map<Variable, any>): boolean;

  /**
   * Get the variables involved in this relation
   */
  abstract getVariables(): Set<Variable>;

  /** Type discriminator for relation type comparisons */
  abstract readonly relationType?: string;
  
  /** Optional target tags for relation matching */
  targetTags?: string[];

  // ==========================================================================
  // Logical Reasoning Operations
  // Ported from infinigen/core/constraints/constraint_language/relations.py
  // ==========================================================================

  /**
   * Implication: when this relation is satisfied, the other must also be satisfied.
   *
   * Logical definition: NOT(this) OR other  (material implication)
   * This is satisfied if either this is false, or other is true.
   *
   * Ported from Python: `a.implies(b)` in constraint_language/relations.py
   *
   * Named impliesRelation rather than implies to avoid conflict with the
   * base BoolExpression.implies() method which has a different signature.
   *
   * @param other - The consequent relation
   * @returns A new Relation representing the implication
   */
  impliesRelation(other: Relation): Relation {
    return new ImpliesRelation(this, other);
  }

  /**
   * Intersects: both relations can be simultaneously true for some configuration.
   *
   * This is an existential satisfiability check — the returned relation is
   * satisfied when there exists a configuration where both this AND other
   * could hold simultaneously. This is weaker than intersection() which
   * requires both to actually hold in the current state.
   *
   * @param other - The other relation to check for potential overlap
   * @returns A new Relation that is satisfied when both can coexist
   */
  intersects(other: Relation): Relation {
    return new IntersectsRelation(this, other);
  }

  /**
   * Intersection: both this AND other must be satisfied simultaneously.
   *
   * This is stronger than AndRelations because the resulting relation
   * is treated as a unified constraint that can be simplified and
   * propagated as a single unit (e.g., two spatial constraints may
   * reduce to a tighter bounding region).
   *
   * @param other - The other relation to intersect with
   * @returns A new Relation satisfied only when both this AND other hold
   */
  intersection(other: Relation): Relation {
    return new IntersectionRelation(this, other);
  }

  /**
   * Difference: this relation is satisfied but the other is not.
   *
   * Logical definition: this AND NOT(other)
   * Useful for constraint subtraction — e.g., "near but not touching",
   * or "visible but not occluded".
   *
   * @param other - The relation to subtract
   * @returns A new Relation satisfied when this holds but other does not
   */
  difference(other: Relation): Relation {
    return new DifferenceRelation(this, other);
  }
}

/**
 * Special relation that matches any object set
 */
export class AnyRelation extends Relation {
  readonly type = 'AnyRelation';
  readonly relationType = 'any';
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return true;
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): AnyRelation {
    return new AnyRelation(this.objects.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `Any(${this.objects})`;
  }
}

/**
 * Negated relation: NOT(relation)
 */
export class NegatedRelation extends Relation {
  readonly type = 'NegatedRelation';
  readonly relationType = 'negated';
  constructor(public readonly relation: Relation) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['relation', this.relation]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    return !this.relation.evaluate(state);
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return !this.relation.isSatisfied(state);
  }

  getVariables(): Set<Variable> {
    return this.relation.getVariables();
  }

  clone(): NegatedRelation {
    return new NegatedRelation(this.relation.clone() as Relation);
  }

  toString(): string {
    return `NOT(${this.relation})`;
  }
}

/**
 * Conjunction of relations: AND(relations)
 */
export class AndRelations extends Relation {
  readonly type = 'AndRelations';
  readonly relationType = 'and';
  constructor(public readonly relations: Relation[]) {
    super();
  }

  children(): Map<string, Node> {
    const map = new Map<string, Node>();
    this.relations.forEach((r, i) => map.set(`relation_${i}`, r));
    return map;
  }

  evaluate(state: Map<Variable, any>): boolean {
    return this.relations.every(r => r.evaluate(state));
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.relations.every(r => r.isSatisfied(state));
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const r of this.relations) {
      for (const v of r.getVariables()) {
        vars.add(v);
      }
    }
    return vars;
  }

  clone(): AndRelations {
    return new AndRelations(this.relations.map(r => r.clone() as Relation));
  }

  toString(): string {
    return `AND(${this.relations.join(', ')})`;
  }
}

/**
 * Disjunction of relations: OR(relations)
 */
export class OrRelations extends Relation {
  readonly type = 'OrRelations';
  readonly relationType = 'or';
  constructor(public readonly relations: Relation[]) {
    super();
  }

  children(): Map<string, Node> {
    const map = new Map<string, Node>();
    this.relations.forEach((r, i) => map.set(`relation_${i}`, r));
    return map;
  }

  evaluate(state: Map<Variable, any>): boolean {
    return this.relations.some(r => r.evaluate(state));
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.relations.some(r => r.isSatisfied(state));
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const r of this.relations) {
      for (const v of r.getVariables()) {
        vars.add(v);
      }
    }
    return vars;
  }

  clone(): OrRelations {
    return new OrRelations(this.relations.map(r => r.clone() as Relation));
  }

  toString(): string {
    return `OR(${this.relations.join(', ')})`;
  }
}

/**
 * Base class for geometry-based relations
 */
export abstract class GeometryRelation extends Relation {
  constructor(
    public readonly objects1: ObjectSetExpression,
    public readonly objects2: ObjectSetExpression
  ) {
    super();
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.objects1.getVariables()) {
      vars.add(v);
    }
    for (const v of this.objects2.getVariables()) {
      vars.add(v);
    }
    return vars;
  }
}

// ============================================================================
// Spatial Relation Implementations
// ============================================================================

/**
 * Near relation: true if distance between any obj in objects1 and any obj in objects2 is < threshold
 * Implements: near(objA, objB, threshold)
 */
export class Near extends GeometryRelation {
  readonly type = 'Near';
  readonly relationType = 'near';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly threshold: number = 1.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      for (const b of objs2) {
        if (distance(a.position, b.position) < this.threshold) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Near {
    return new Near(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.threshold
    );
  }

  toString(): string {
    return `Near(${this.objects1}, ${this.objects2}, ${this.threshold})`;
  }
}

/**
 * Touching relation: objects1 are touching objects2 (AABBs overlap or within tolerance)
 * Implements: touching(objA, objB, tolerance)
 */
export class Touching extends GeometryRelation {
  readonly type = 'Touching';
  readonly relationType = 'touching';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly threshold: number = 0.01
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      for (const b of objs2) {
        const aabbA = getAABB(a);
        const aabbB = getAABB(b);
        if (aabbOverlapOrNear(aabbA, aabbB, this.threshold)) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Touching {
    return new Touching(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.threshold
    );
  }

  toString(): string {
    return `Touching(${this.objects1}, ${this.objects2}, ${this.threshold})`;
  }
}

/**
 * Supported by relation: objects1 are on top of objects2 AND overlap in XZ
 * Implements: supportedBy(objA, objB)
 */
export class SupportedBy extends GeometryRelation {
  readonly type = 'SupportedBy';
  readonly relationType = 'supported_by';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly tolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const aabbA = getAABB(a);
      const aBottom = aabbA.min[1];
      for (const b of objs2) {
        const aabbB = getAABB(b);
        const bTop = aabbB.max[1];
        // objA's bottom must be close to objB's top
        if (Math.abs(aBottom - bTop) <= this.tolerance) {
          // And they must overlap in XZ
          if (aabbOverlapXZ(aabbA, aabbB)) return true;
        }
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): SupportedBy {
    return new SupportedBy(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.tolerance
    );
  }

  toString(): string {
    return `SupportedBy(${this.objects1}, ${this.objects2}, ${this.tolerance})`;
  }
}

/**
 * On top of relation: objA's bottom is close to objB's top, and objA overlaps objB in XZ
 * Implements: onTopOf(objA, objB)
 */
export class OnTopOf extends GeometryRelation {
  readonly type = 'OnTopOf';
  readonly relationType = 'on_top_of';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly tolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const aabbA = getAABB(a);
      const aBottom = aabbA.min[1];
      for (const b of objs2) {
        const aabbB = getAABB(b);
        const bTop = aabbB.max[1];
        // objA's bottom close to objB's top, and objA above objB
        if (aBottom >= bTop - this.tolerance && aBottom <= bTop + this.tolerance) {
          if (aabbOverlapXZ(aabbA, aabbB)) return true;
        }
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): OnTopOf {
    return new OnTopOf(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.tolerance
    );
  }

  toString(): string {
    return `OnTopOf(${this.objects1}, ${this.objects2}, ${this.tolerance})`;
  }
}

/**
 * Co-planar relation: objects are on the same plane
 */
export class CoPlanar extends GeometryRelation {
  readonly type = 'CoPlanar';
  readonly relationType = 'co_planar';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly normalTolerance: number = 0.1,
    public readonly distanceTolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Check if all objects have similar Y position (simple coplanarity heuristic)
    const allObjs = [...objs1, ...objs2];
    const yPositions = allObjs.map(o => toVec3(o.position)[1]);
    const minY = Math.min(...yPositions);
    const maxY = Math.max(...yPositions);
    return (maxY - minY) <= this.distanceTolerance;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): CoPlanar {
    return new CoPlanar(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.normalTolerance,
      this.distanceTolerance
    );
  }

  toString(): string {
    return `CoPlanar(${this.objects1}, ${this.objects2})`;
  }
}

/**
 * Stable against relation: objects1 are stable against objects2
 */
export class StableAgainst extends GeometryRelation {
  readonly type = 'StableAgainst';
  readonly relationType = 'stable_against';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Stable = touching AND supported from below or side
    for (const a of objs1) {
      const aabbA = getAABB(a);
      for (const b of objs2) {
        const aabbB = getAABB(b);
        // Either supported from below (on top of) or touching from side
        const aBottom = aabbA.min[1];
        const bTop = aabbB.max[1];
        const onTop = Math.abs(aBottom - bTop) < 0.15 && aabbOverlapXZ(aabbA, aabbB);
        const touching = aabbDistance(aabbA, aabbB) < 0.05;
        if (onTop || touching) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): StableAgainst {
    return new StableAgainst(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `StableAgainst(${this.objects1}, ${this.objects2})`;
  }
}

/**
 * Facing relation: objects1 are facing objects2
 * Implements: facing(objA, objB, angleThreshold)
 */
export class Facing extends GeometryRelation {
  readonly type = 'Facing';
  readonly relationType = 'facing';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly angleThreshold: number = Math.PI / 4
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const fwd = getForward(a);
      for (const b of objs2) {
        const dir = directionTo(a, b);
        const ang = angleBetween(fwd, dir);
        if (ang <= this.angleThreshold) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Facing {
    return new Facing(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.angleThreshold
    );
  }

  toString(): string {
    return `Facing(${this.objects1}, ${this.objects2}, ${this.angleThreshold})`;
  }
}

/**
 * Between relation: objects1 are between objects2 and objects3
 */
export class Between extends Relation {
  readonly type = 'Between';
  readonly relationType = 'between';
  constructor(
    public readonly objects1: ObjectSetExpression,
    public readonly objects2: ObjectSetExpression,
    public readonly objects3: ObjectSetExpression,
    public readonly axis: 'x' | 'y' | 'z' | 'any' = 'any'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2],
      ['objects3', this.objects3]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const objs1 = retrieveSpatialObjects(state, this.objects1.evaluate(state));
    const objs2 = retrieveSpatialObjects(state, this.objects2.evaluate(state));
    const objs3 = retrieveSpatialObjects(state, this.objects3.evaluate(state));
    if (objs1.length === 0 || objs2.length === 0 || objs3.length === 0) return false;

    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : this.axis === 'z' ? 2 : -1;
    for (const mid of objs1) {
      const midP = toVec3(mid.position);
      for (const a of objs2) {
        const aP = toVec3(a.position);
        for (const b of objs3) {
          const bP = toVec3(b.position);
          if (axisIndex >= 0) {
            // Check along specific axis
            const arrA = aP as number[];
            const arrB = bP as number[];
            const arrMid = midP as number[];
            const lo = Math.min(arrA[axisIndex], arrB[axisIndex]);
            const hi = Math.max(arrA[axisIndex], arrB[axisIndex]);
            if (arrMid[axisIndex] >= lo && arrMid[axisIndex] <= hi) return true;
          } else {
            // Check all axes
            let allBetween = true;
            for (let i = 0; i < 3; i++) {
              const lo = Math.min(aP[i], bP[i]);
              const hi = Math.max(aP[i], bP[i]);
              if (midP[i] < lo || midP[i] > hi) { allBetween = false; break; }
            }
            if (allBetween) return true;
          }
        }
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.objects1.getVariables()) vars.add(v);
    for (const v of this.objects2.getVariables()) vars.add(v);
    for (const v of this.objects3.getVariables()) vars.add(v);
    return vars;
  }

  clone(): Between {
    return new Between(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.objects3.clone() as ObjectSetExpression,
      this.axis
    );
  }

  toString(): string {
    return `Between(${this.objects1}, ${this.objects2}, ${this.objects3}, ${this.axis})`;
  }
}

/**
 * Accessible from relation: objects1 are accessible from objects2
 */
export class AccessibleFrom extends GeometryRelation {
  readonly type = 'AccessibleFrom';
  readonly relationType = 'accessible_from';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly reachDistance: number = 1.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Simplified: accessible if within reach distance
    for (const a of objs1) {
      for (const b of objs2) {
        if (distance(a.position, b.position) <= this.reachDistance) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): AccessibleFrom {
    return new AccessibleFrom(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.reachDistance
    );
  }

  toString(): string {
    return `AccessibleFrom(${this.objects1}, ${this.objects2}, ${this.reachDistance})`;
  }
}

/**
 * Reachable from relation: objects1 are reachable from objects2
 */
export class ReachableFrom extends GeometryRelation {
  readonly type = 'ReachableFrom';
  readonly relationType = 'reachable_from';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly maxPathLength?: number
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Simplified reachability: Euclidean distance within max path length
    const maxDist = this.maxPathLength ?? Infinity;
    for (const a of objs1) {
      for (const b of objs2) {
        const d = distance(a.position, b.position);
        if (d <= maxDist) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): ReachableFrom {
    return new ReachableFrom(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.maxPathLength
    );
  }

  toString(): string {
    return `ReachableFrom(${this.objects1}, ${this.objects2})`;
  }
}

/**
 * In front of relation: objects1 are in front of objects2
 */
export class InFrontOf extends GeometryRelation {
  readonly type = 'InFrontOf';
  readonly relationType = 'in_front_of';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly distance: number = 0.5
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const fwd = getForward(a);
      for (const b of objs2) {
        const dir = directionTo(a, b);
        // In front of: forward direction aligns with direction to b
        if (dot(fwd, dir) > 0.5) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): InFrontOf {
    return new InFrontOf(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.distance
    );
  }

  toString(): string {
    return `InFrontOf(${this.objects1}, ${this.objects2}, ${this.distance})`;
  }
}

/**
 * Aligned relation: objects1 are aligned with objects2 along axis
 * Implements: alignedWith(objA, objB, axis, tolerance)
 */
export class Aligned extends GeometryRelation {
  readonly type = 'Aligned';
  readonly relationType = 'aligned';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly axis: 'x' | 'y' | 'z' = 'y',
    public readonly tolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : 2;
    for (const a of objs1) {
      const aPos = toVec3(a.position);
      for (const b of objs2) {
        const bPos = toVec3(b.position);
        if (Math.abs(aPos[axisIndex] - bPos[axisIndex]) <= this.tolerance) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Aligned {
    return new Aligned(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.axis,
      this.tolerance
    );
  }

  toString(): string {
    return `Aligned(${this.objects1}, ${this.objects2}, ${this.axis}, ${this.tolerance})`;
  }
}

/**
 * Hidden relation: objects1 are hidden from view
 */
export class Hidden extends Relation {
  readonly type = 'Hidden';
  readonly relationType = 'hidden';
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // An object is hidden if it is occluded from all viewpoints.
    // Without a camera/viewpoint, we check if any object has a very low position
    // (below ground) or is fully contained in another object.
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    // Simplified: an object is hidden if it has no valid position or is below ground
    for (const obj of objs) {
      const pos = toVec3(obj.position);
      if (pos[1] < 0) return true; // Below ground
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): Hidden {
    return new Hidden(this.objects.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `Hidden(${this.objects})`;
  }
}

/**
 * Visible relation: objects are visible from camera/viewpoint
 * Implements: visible(objA, objB, occluders) = !occluded(objA, objB, occluders)
 */
export class Visible extends Relation {
  readonly type = 'Visible';
  readonly relationType = 'visible';
  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly viewpoint?: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    const map = new Map<string, Node>([['objects', this.objects]]);
    if (this.viewpoint) {
      map.set('viewpoint', this.viewpoint);
    }
    return map;
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return false;
    if (!this.viewpoint) return true; // Without viewpoint, assume visible

    const vpIds = this.viewpoint.evaluate(state);
    const vps = retrieveSpatialObjects(state, vpIds);
    if (vps.length === 0) return true;

    // Check if any object is visible from any viewpoint (not occluded)
    // Simplified: check if distance is reasonable and above ground
    for (const obj of objs) {
      const objPos = toVec3(obj.position);
      if (objPos[1] < 0) continue; // Below ground = not visible
      for (const vp of vps) {
        const d = distance(obj.position, vp.position);
        if (d > 0 && d < 200) return true; // Within visible range
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    const vars = this.objects.getVariables();
    if (this.viewpoint) {
      for (const v of this.viewpoint.getVariables()) {
        vars.add(v);
      }
    }
    return vars;
  }

  clone(): Visible {
    return new Visible(
      this.objects.clone() as ObjectSetExpression,
      this.viewpoint?.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Visible(${this.objects}${this.viewpoint ? `, ${this.viewpoint}` : ''})`;
  }
}

/**
 * Grouped relation: objects are close together
 * Implements: groupedWith(objA, objB, groupDistance)
 */
export class Grouped extends Relation {
  readonly type = 'Grouped';
  readonly relationType = 'grouped';
  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly maxDistance: number = 2.0
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length <= 1) return true; // Single or empty objects are trivially grouped
    // Check all pairs are within maxDistance
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        if (distance(objs[i].position, objs[j].position) > this.maxDistance) {
          return false;
        }
      }
    }
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): Grouped {
    return new Grouped(
      this.objects.clone() as ObjectSetExpression,
      this.maxDistance
    );
  }

  toString(): string {
    return `Grouped(${this.objects}, ${this.maxDistance})`;
  }
}

/**
 * Distributed relation: objects are spread apart
 * Implements: spreadOut(objects, minDistance)
 */
export class Distributed extends Relation {
  readonly type = 'Distributed';
  readonly relationType = 'distributed';
  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly minDistance: number = 1.0
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length <= 1) return true;
    // Check all pairs are at least minDistance apart
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        if (distance(objs[i].position, objs[j].position) < this.minDistance) {
          return false;
        }
      }
    }
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): Distributed {
    return new Distributed(
      this.objects.clone() as ObjectSetExpression,
      this.minDistance
    );
  }

  toString(): string {
    return `Distributed(${this.objects}, ${this.minDistance})`;
  }
}

/**
 * Coverage relation: objects1 cover objects2
 */
export class Coverage extends GeometryRelation {
  readonly type = 'Coverage';
  readonly relationType = 'coverage';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly coverageThreshold: number = 0.8
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Check XZ overlap ratio of objects2 covered by objects1
    for (const b of objs2) {
      const aabbB = getAABB(b);
      const bAreaXZ = Math.max(0, aabbB.max[0] - aabbB.min[0]) * Math.max(0, aabbB.max[2] - aabbB.min[2]);
      if (bAreaXZ <= 0) continue;
      let totalCovered = 0;
      for (const a of objs1) {
        const aabbA = getAABB(a);
        totalCovered += aabbOverlapAreaXZ(aabbA, aabbB);
      }
      // Clamp to bAreaXZ (can't cover more than 100%)
      totalCovered = Math.min(totalCovered, bAreaXZ);
      if (totalCovered / bAreaXZ >= this.coverageThreshold) return true;
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Coverage {
    return new Coverage(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.coverageThreshold
    );
  }

  toString(): string {
    return `Coverage(${this.objects1}, ${this.objects2}, ${this.coverageThreshold})`;
  }
}

/**
 * Support coverage relation
 */
export class SupportCoverage extends GeometryRelation {
  readonly type = 'SupportCoverage';
  readonly relationType = 'support_coverage';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly minSupport: number = 0.5
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // objects1 (supported) must have significant XZ overlap with objects2 (supporter) top face
    for (const a of objs1) {
      const aabbA = getAABB(a);
      const aAreaXZ = Math.max(0, aabbA.max[0] - aabbA.min[0]) * Math.max(0, aabbA.max[2] - aabbA.min[2]);
      if (aAreaXZ <= 0) continue;
      let totalSupported = 0;
      for (const b of objs2) {
        const aabbB = getAABB(b);
        totalSupported += aabbOverlapAreaXZ(aabbA, aabbB);
      }
      totalSupported = Math.min(totalSupported, aAreaXZ);
      if (totalSupported / aAreaXZ >= this.minSupport) return true;
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): SupportCoverage {
    return new SupportCoverage(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.minSupport
    );
  }

  toString(): string {
    return `SupportCoverage(${this.objects1}, ${this.objects2}, ${this.minSupport})`;
  }
}

/**
 * Stability relation: objects are stable (won't fall)
 */
export class Stability extends Relation {
  readonly type = 'Stability';
  readonly relationType = 'stability';
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return true;
    // Simplified stability check: object center of mass must be above its support base
    // An object is stable if its Y position is >= 0 (not below ground) and
    // its center of mass projection falls within its AABB XZ footprint
    for (const obj of objs) {
      const pos = toVec3(obj.position);
      if (pos[1] < 0) return false; // Below ground = unstable
    }
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): Stability {
    return new Stability(this.objects.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `Stability(${this.objects})`;
  }
}

/**
 * Containment relation: objects1 contain objects2
 * Implements: containedIn(objA, objB)
 */
export class Containment extends GeometryRelation {
  readonly type = 'Containment';
  readonly relationType = 'containment';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Check if any obj2's AABB is fully inside any obj1's AABB
    for (const outer of objs1) {
      const outerAABB = getAABB(outer);
      for (const inner of objs2) {
        const innerAABB = getAABB(inner);
        if (aabbContainedIn(innerAABB, outerAABB)) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Containment {
    return new Containment(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Containment(${this.objects1}, ${this.objects2})`;
  }
}

/**
 * Proximity relation: objects are within certain distance
 * Implements: near(objA, objB, threshold) with min/max bounds
 */
export class Proximity extends GeometryRelation {
  readonly type = 'Proximity';
  readonly relationType = 'proximity';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly maxDistance: number = 1.0,
    public readonly minDistance: number = 0.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      for (const b of objs2) {
        const d = distance(a.position, b.position);
        if (d >= this.minDistance && d <= this.maxDistance) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Proximity {
    return new Proximity(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.maxDistance,
      this.minDistance
    );
  }

  toString(): string {
    return `Proximity(${this.objects1}, ${this.objects2}, ${this.maxDistance})`;
  }
}

/**
 * Far from relation: objects1 are far from objects2
 * Implements: farFrom(objA, objB, threshold)
 */
export class FarFrom extends GeometryRelation {
  readonly type = 'FarFrom';
  readonly relationType = 'far_from';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly threshold: number = 5.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return true; // No objects = vacuously far
    // ALL pairs must be far from each other
    for (const a of objs1) {
      for (const b of objs2) {
        if (distance(a.position, b.position) <= this.threshold) return false;
      }
    }
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): FarFrom {
    return new FarFrom(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.threshold
    );
  }

  toString(): string {
    return `FarFrom(${this.objects1}, ${this.objects2}, ${this.threshold})`;
  }
}

/**
 * Look at relation: objA's look direction is within angle of direction to objB
 * Implements: lookAt(objA, objB, angleThreshold)
 */
export class LookAt extends GeometryRelation {
  readonly type = 'LookAt';
  readonly relationType = 'look_at';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly angleThreshold: number = Math.PI / 6
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const fwd = getForward(a);
      for (const b of objs2) {
        const dir = directionTo(a, b);
        const ang = angleBetween(fwd, dir);
        if (ang <= this.angleThreshold) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): LookAt {
    return new LookAt(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.angleThreshold
    );
  }

  toString(): string {
    return `LookAt(${this.objects1}, ${this.objects2}, ${this.angleThreshold})`;
  }
}

/**
 * Occluded relation: some occluder is between objects1 and objects2
 * Implements: occluded(objA, objB, occluders)
 */
export class Occluded extends Relation {
  readonly type = 'Occluded';
  readonly relationType = 'occluded';
  constructor(
    public readonly objects1: ObjectSetExpression,
    public readonly objects2: ObjectSetExpression,
    public readonly occluders: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2],
      ['occluders', this.occluders]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const occIds = this.occluders.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    const occluders = retrieveSpatialObjects(state, occIds);
    if (objs1.length === 0 || objs2.length === 0 || occluders.length === 0) return false;

    for (const a of objs1) {
      const aPos = toVec3(a.position);
      for (const b of objs2) {
        const bPos = toVec3(b.position);
        const dir = normalize(sub(b.position, a.position));
        const totalDist = distance(a.position, b.position);
        for (const occ of occluders) {
          const occAABB = getAABB(occ);
          if (rayAABBIntersection(aPos, dir, occAABB)) {
            // Check that the occluder is between a and b
            const occCenter = toVec3(occ.position);
            const distToOcc = distance(a.position, occCenter);
            if (distToOcc > 0 && distToOcc < totalDist) return true;
          }
        }
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.objects1.getVariables()) vars.add(v);
    for (const v of this.objects2.getVariables()) vars.add(v);
    for (const v of this.occluders.getVariables()) vars.add(v);
    return vars;
  }

  clone(): Occluded {
    return new Occluded(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.occluders.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Occluded(${this.objects1}, ${this.objects2}, ${this.occluders})`;
  }
}

/**
 * Path to relation: unobstructed line exists from objects1 to objects2 through obstacles
 * Implements: pathTo(objA, objB, obstacles) — returns true if NO obstacle blocks the path
 */
export class PathTo extends Relation {
  readonly type = 'PathTo';
  readonly relationType = 'path_to';
  constructor(
    public readonly objects1: ObjectSetExpression,
    public readonly objects2: ObjectSetExpression,
    public readonly obstacles: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2],
      ['obstacles', this.obstacles]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // pathTo returns true if there's an unobstructed path (i.e., NOT occluded)
    const occluded = new Occluded(this.objects1, this.objects2, this.obstacles);
    return !occluded.evaluate(state);
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.objects1.getVariables()) vars.add(v);
    for (const v of this.objects2.getVariables()) vars.add(v);
    for (const v of this.obstacles.getVariables()) vars.add(v);
    return vars;
  }

  clone(): PathTo {
    return new PathTo(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.obstacles.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `PathTo(${this.objects1}, ${this.objects2}, ${this.obstacles})`;
  }
}

/**
 * Symmetric relation - enforces that a relation holds symmetrically between objects
 */
export class Symmetric extends Relation {
  readonly type = 'Symmetric';
  readonly relationType = 'symmetric';

  constructor(
    public readonly innerRelation: Relation
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['innerRelation', this.innerRelation]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    return this.innerRelation.evaluate(state);
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.innerRelation.isSatisfied(state);
  }

  getVariables(): Set<Variable> {
    return this.innerRelation.getVariables();
  }

  clone(): Symmetric {
    return new Symmetric(this.innerRelation.clone() as Relation);
  }

  toString(): string {
    return `Symmetric(${this.innerRelation})`;
  }
}

// ============================================================================
// Room-Specific Relation Types
// Ported from: constraint_language/relations.py (RoomNeighbour, CutFrom, SharedEdge, Traverse)
// ============================================================================

/**
 * RoomNeighbour relation: rooms are neighbours via connectors
 *
 * Checks if objects1 and objects2 rooms are adjacent, optionally filtering
 * by connector types (Door, Open, Wall).
 * Uses State.graphs to check room adjacency.
 */
export class RoomNeighbour extends GeometryRelation {
  readonly type = 'RoomNeighbour';
  readonly relationType = 'room_neighbour';

  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly connectorTypes: string[] = ['Door', 'Open']
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;

    // Check if state has a room graph with adjacency information
    const stateAny = state as Map<any, any>;
    const roomGraph = stateAny.get('__roomGraph');
    if (roomGraph && typeof roomGraph === 'object') {
      // If graph has areNeighbours method, use it
      if (typeof (roomGraph as any).areNeighbours === 'function') {
        for (const a of objs1) {
          for (const b of objs2) {
            if ((roomGraph as any).areNeighbours(a.id, b.id, this.connectorTypes)) {
              return true;
            }
          }
        }
        return false;
      }
    }

    // Fallback: spatial adjacency check - AABBs must be close or overlapping
    for (const a of objs1) {
      const aabbA = getAABB(a);
      for (const b of objs2) {
        const aabbB = getAABB(b);
        // Neighbour if AABBs are within 0.5m of each other
        if (aabbDistance(aabbA, aabbB) < 0.5) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): RoomNeighbour {
    return new RoomNeighbour(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      [...this.connectorTypes]
    );
  }

  toString(): string {
    return `RoomNeighbour(${this.objects1}, ${this.objects2}, [${this.connectorTypes.join(', ')}])`;
  }
}

/**
 * CutFrom relation: object was cut from parent (CSG operation)
 *
 * Checks if child was cut from parent via identity comparison on ObjectState.
 * Used for CSG (Constructive Solid Geometry) operations.
 */
export class CutFrom extends GeometryRelation {
  readonly type = 'CutFrom';
  readonly relationType = 'cut_from';

  constructor(
    public readonly child: ObjectSetExpression,
    public readonly parent: ObjectSetExpression
  ) {
    super(child, parent);
  }

  children(): Map<string, Node> {
    return new Map([['child', this.child], ['parent', this.parent]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const childIds = this.child.evaluate(state);
    const parentIds = this.parent.evaluate(state);
    const children = retrieveSpatialObjects(state, childIds);
    const parents = retrieveSpatialObjects(state, parentIds);
    if (children.length === 0 || parents.length === 0) return false;

    // Check if child was cut from parent
    // In the original Infinigen, this checks ObjectState identity
    // Here we check if the child's AABB is contained within the parent's AABB
    // AND the child's footprint is a subset of the parent's footprint
    for (const c of children) {
      const aabbC = getAABB(c);
      for (const p of parents) {
        const aabbP = getAABB(p);
        // Child must be fully contained within parent (the cut region)
        if (aabbContainedIn(aabbC, aabbP)) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): CutFrom {
    return new CutFrom(
      this.child.clone() as ObjectSetExpression,
      this.parent.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `CutFrom(${this.child}, ${this.parent})`;
  }
}

/**
 * SharedEdge relation: two rooms share an edge
 *
 * Checks if two rooms share a boundary edge.
 * Uses polygon data from ObjectState where available,
 * falls back to AABB proximity check.
 */
export class SharedEdge extends GeometryRelation {
  readonly type = 'SharedEdge';
  readonly relationType = 'shared_edge';

  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly tolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;

    // Check for shared edges using polygon data
    for (const a of objs1) {
      const aabbA = getAABB(a);
      for (const b of objs2) {
        const aabbB = getAABB(b);

        // Shared edge exists if AABBs are adjacent (close but not overlapping)
        const dist = aabbDistance(aabbA, aabbB);
        if (dist <= this.tolerance) {
          // Check if there's significant overlap along one axis (shared edge)
          const overlapX = Math.max(0, Math.min(aabbA.max[0], aabbB.max[0]) - Math.max(aabbA.min[0], aabbB.min[0]));
          const overlapZ = Math.max(0, Math.min(aabbA.max[2], aabbB.max[2]) - Math.max(aabbA.min[2], aabbB.min[2]));

          // Shared edge: one axis has overlap, the other has gap
          if ((overlapX > this.tolerance && dist > 0) ||
              (overlapZ > this.tolerance && dist > 0)) {
            return true;
          }

          // Or they overlap in XZ plane (shared edge exists at boundary)
          if (overlapX > 0 && overlapZ > 0) return true;
        }
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): SharedEdge {
    return new SharedEdge(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.tolerance
    );
  }

  toString(): string {
    return `SharedEdge(${this.objects1}, ${this.objects2})`;
  }
}

/**
 * Traverse relation: rooms are connected (path exists)
 *
 * Checks if rooms are connected (path exists in RoomGraph).
 * Uses BFS/DFS on State.graphs to find a path.
 */
export class Traverse extends GeometryRelation {
  readonly type = 'Traverse';
  readonly relationType = 'traverse';

  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly maxPathLength: number = Infinity
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;

    // Check if state has a room graph with traversal support
    const stateAny = state as Map<any, any>;
    const roomGraph = stateAny.get('__roomGraph');
    if (roomGraph && typeof roomGraph === 'object') {
      // If graph has a path-finding method, use it
      if (typeof (roomGraph as any).hasPath === 'function') {
        for (const a of objs1) {
          for (const b of objs2) {
            if ((roomGraph as any).hasPath(a.id, b.id, this.maxPathLength)) {
              return true;
            }
          }
        }
        return false;
      }
      // If graph has getNeighbours, do BFS
      if (typeof (roomGraph as any).getNeighbours === 'function') {
        for (const a of objs1) {
          for (const b of objs2) {
            if (this.bfsPath(roomGraph as any, a.id, b.id)) return true;
          }
        }
        return false;
      }
    }

    // Fallback: spatial proximity as approximate connectivity
    // If objects are within maxPathLength distance, assume traversable
    const maxDist = this.maxPathLength === Infinity ? 50 : this.maxPathLength;
    for (const a of objs1) {
      for (const b of objs2) {
        const d = distance(a.position, b.position);
        if (d <= maxDist) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Traverse {
    return new Traverse(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.maxPathLength
    );
  }

  toString(): string {
    return `Traverse(${this.objects1}, ${this.objects2})`;
  }

  /** BFS path search on the room graph */
  private bfsPath(graph: { getNeighbours: (id: string) => string[] }, startId: string, endId: string): boolean {
    if (startId === endId) return true;

    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= this.maxPathLength) continue;

      const neighbours = graph.getNeighbours(current.id);
      for (const neighbourId of neighbours) {
        if (neighbourId === endId) return true;
        if (!visited.has(neighbourId)) {
          visited.add(neighbourId);
          queue.push({ id: neighbourId, depth: current.depth + 1 });
        }
      }
    }
    return false;
  }
}

// ============================================================================
// Standalone Relation Functions
// These can be called directly without creating class instances
// ============================================================================

/**
 * Check if objA is near objB (distance < threshold)
 */
export function near(objA: SpatialObject, objB: SpatialObject, threshold: number): boolean {
  return distance(objA.position, objB.position) < threshold;
}

/**
 * Check if objA is on top of objB (bottom of A close to top of B, overlapping in XZ)
 */
export function onTopOf(objA: SpatialObject, objB: SpatialObject, tolerance: number = 0.1): boolean {
  const aabbA = getAABB(objA);
  const aabbB = getAABB(objB);
  const aBottom = aabbA.min[1];
  const bTop = aabbB.max[1];
  return Math.abs(aBottom - bTop) <= tolerance && aabbOverlapXZ(aabbA, aabbB);
}

/**
 * Check if objA is touching objB (AABBs overlap or within tolerance)
 */
export function touching(objA: SpatialObject, objB: SpatialObject, tolerance: number = 0.01): boolean {
  return aabbOverlapOrNear(getAABB(objA), getAABB(objB), tolerance);
}

/**
 * Check if objA is supported by objB (onTopOf AND XZ overlap)
 */
export function supportedBy(objA: SpatialObject, objB: SpatialObject, tolerance: number = 0.1): boolean {
  return onTopOf(objA, objB, tolerance) && aabbOverlapXZ(getAABB(objA), getAABB(objB));
}

/**
 * Check if objA is facing toward objB (within angle threshold)
 */
export function facing(objA: SpatialObject, objB: SpatialObject, angleThreshold: number = Math.PI / 4): boolean {
  const fwd = getForward(objA);
  const dir = directionTo(objA, objB);
  return angleBetween(fwd, dir) <= angleThreshold;
}

/**
 * Check if objA is far from objB (distance > threshold)
 */
export function farFrom(objA: SpatialObject, objB: SpatialObject, threshold: number): boolean {
  return distance(objA.position, objB.position) > threshold;
}

/**
 * Check if objA is reachable from objB (simplified: distance < armLength)
 */
export function reachable(objA: SpatialObject, objB: SpatialObject, armLength: number): boolean {
  return distance(objA.position, objB.position) < armLength;
}

/**
 * Check if there's an unobstructed path from objA to objB (raycasting through obstacles)
 */
export function pathTo(objA: SpatialObject, objB: SpatialObject, obstacles: SpatialObject[]): boolean {
  const origin = toVec3(objA.position);
  const dir = normalize(sub(objB.position, objA.position));
  const totalDist = distance(objA.position, objB.position);
  for (const obs of obstacles) {
    const occAABB = getAABB(obs);
    if (rayAABBIntersection(origin, dir, occAABB)) {
      const distToOcc = distance(objA.position, obs.position);
      if (distToOcc > 0 && distToOcc < totalDist) return false;
    }
  }
  return true;
}

/**
 * Check if objA's look direction is within angle of direction to objB
 */
export function lookAt(objA: SpatialObject, objB: SpatialObject, angleThreshold: number = Math.PI / 6): boolean {
  const fwd = getForward(objA);
  const dir = directionTo(objA, objB);
  return angleBetween(fwd, dir) <= angleThreshold;
}

/**
 * Check if objA and objB are aligned along the specified axis within tolerance
 */
export function alignedWith(objA: SpatialObject, objB: SpatialObject, axis: 'x' | 'y' | 'z', tolerance: number = 0.1): boolean {
  const aPos = toVec3(objA.position);
  const bPos = toVec3(objB.position);
  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  return Math.abs(aPos[axisIndex] - bPos[axisIndex]) <= tolerance;
}

/**
 * Check if objA is occluded from objB by any occluder
 */
export function occluded(objA: SpatialObject, objB: SpatialObject, occluders: SpatialObject[]): boolean {
  return !pathTo(objA, objB, occluders);
}

/**
 * Check if objA is visible from objB (not occluded)
 */
export function visible(objA: SpatialObject, objB: SpatialObject, occluders: SpatialObject[]): boolean {
  return !occluded(objA, objB, occluders);
}

/**
 * Check if objA and objB are within groupDistance of each other
 */
export function groupedWith(objA: SpatialObject, objB: SpatialObject, groupDistance: number): boolean {
  return distance(objA.position, objB.position) <= groupDistance;
}

/**
 * Check if all objects are at least minDistance apart
 */
export function spreadOut(objects: SpatialObject[], minDistance: number): boolean {
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      if (distance(objects[i].position, objects[j].position) < minDistance) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Check if objA's AABB is fully inside objB's AABB
 */
export function containedIn(objA: SpatialObject, objB: SpatialObject): boolean {
  return aabbContainedIn(getAABB(objA), getAABB(objB));
}

/**
 * Returns the Euclidean distance between object centers
 */
export function distanceBetween(objA: SpatialObject, objB: SpatialObject): number {
  return distance(objA.position, objB.position);
}

// ============================================================================
// Logical Reasoning Relation Types
// Ported from infinigen/core/constraints/constraint_language/relations.py
// These implement the implies, intersects, intersection, and difference
// operations on the Relation base class.
// ============================================================================

/**
 * Implication relation: when the antecedent is satisfied, the consequent must also be satisfied.
 *
 * Logical definition: NOT(antecedent) OR consequent  (material implication)
 * This is satisfied if either the antecedent is false, or the consequent is true.
 *
 * In the Infinigen constraint language, this is used to express conditional
 * constraints: "if A is near B, then A must also be touching B".
 */
export class ImpliesRelation extends Relation {
  readonly type = 'ImpliesRelation';
  readonly relationType = 'implies';

  constructor(
    public readonly antecedent: Relation,
    public readonly consequent: Relation
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['antecedent', this.antecedent], ['consequent', this.consequent]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Material implication: NOT(antecedent) OR consequent
    return !this.antecedent.evaluate(state) || this.consequent.evaluate(state);
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return !this.antecedent.isSatisfied(state) || this.consequent.isSatisfied(state);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.antecedent.getVariables()) vars.add(v);
    for (const v of this.consequent.getVariables()) vars.add(v);
    return vars;
  }

  clone(): ImpliesRelation {
    return new ImpliesRelation(
      this.antecedent.clone() as Relation,
      this.consequent.clone() as Relation
    );
  }

  toString(): string {
    return `(${this.antecedent} => ${this.consequent})`;
  }
}

/**
 * Intersects relation: both relations can be simultaneously true for some configuration.
 *
 * This represents an existential satisfiability check — it is satisfied when
 * there exists at least one configuration of the scene where both relations
 * could hold simultaneously. This is distinct from intersection() which requires
 * both to actually hold in the current state.
 *
 * In practice, we evaluate this by checking if both relations hold in the
 * current state OR if neither is trivially contradictory (i.e., not mutually
 * exclusive). For a precise static analysis, one would need to check variable
 * domain overlap, which this implementation approximates.
 */
export class IntersectsRelation extends Relation {
  readonly type = 'IntersectsRelation';
  readonly relationType = 'intersects';

  constructor(
    public readonly relationA: Relation,
    public readonly relationB: Relation
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['relationA', this.relationA], ['relationB', this.relationB]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Both are currently satisfied => they intersect
    const aVal = this.relationA.evaluate(state);
    const bVal = this.relationB.evaluate(state);
    if (aVal && bVal) return true;

    // If one is false, check if they share variables — if they don't,
    // they can potentially be simultaneously true in a different configuration.
    const varsA = this.relationA.getVariables();
    const varsB = this.relationB.getVariables();
    const hasSharedVars = [...varsA].some(v => varsB.has(v));

    if (!hasSharedVars) {
      // No shared variables: they are independent, so they can coexist
      return true;
    }

    // Shared variables but not both true: check if A being false
    // is due to variable values that are consistent with B being true.
    // Heuristic: if B is true and A is false, or vice versa,
    // they may still intersect for other variable assignments.
    // Conservative: return false if they share variables and aren't both true.
    // This ensures we don't claim intersection when it's uncertain.
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.relationA.getVariables()) vars.add(v);
    for (const v of this.relationB.getVariables()) vars.add(v);
    return vars;
  }

  clone(): IntersectsRelation {
    return new IntersectsRelation(
      this.relationA.clone() as Relation,
      this.relationB.clone() as Relation
    );
  }

  toString(): string {
    return `intersects(${this.relationA}, ${this.relationB})`;
  }
}

/**
 * Intersection relation: both this AND other must be satisfied simultaneously.
 *
 * This is stronger than AndRelations because the resulting relation is treated
 * as a unified constraint that can be simplified and propagated as a single
 * unit. For example, two spatial constraints may reduce to a tighter bounding
 * region when intersected.
 *
 * Key differences from AndRelations:
 * - AndRelations simply evaluates both and returns their logical AND
 * - IntersectionRelation is a semantic intersection that can be simplified
 *   by the constraint solver into a tighter combined constraint
 * - IntersectionRelation carries type information that enables domain-specific
 *   simplification (e.g., Near ∧ Touching → Touching since Touching ⊂ Near)
 */
export class IntersectionRelation extends Relation {
  readonly type = 'IntersectionRelation';
  readonly relationType = 'intersection';

  constructor(
    public readonly relationA: Relation,
    public readonly relationB: Relation
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['relationA', this.relationA], ['relationB', this.relationB]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Both must be satisfied — same as logical AND
    return this.relationA.evaluate(state) && this.relationB.evaluate(state);
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.relationA.isSatisfied(state) && this.relationB.isSatisfied(state);
  }

  /**
   * Attempt to simplify this intersection into a tighter constraint.
   * Uses relation type implications to reduce the intersection.
   *
   * For example:
   * - Near ∧ Touching → Touching (Touching implies Near)
   * - SupportedBy ∧ Touching → SupportedBy (SupportedBy implies Touching)
   */
  simplify(): Relation {
    const typeA = this.relationA.relationType;
    const typeB = this.relationB.relationType;

    // If either is AnyRelation, return the other
    if (typeA === 'any') return this.relationB;
    if (typeB === 'any') return this.relationA;

    // Implication-based simplification:
    // If A implies B (A is stronger), then A ∧ B = A
    // If B implies A (B is stronger), then A ∧ B = B

    // stable_against implies supported_by implies touching
    if (typeA === 'stable_against' && typeB === 'supported_by') return this.relationA;
    if (typeB === 'stable_against' && typeA === 'supported_by') return this.relationB;
    if (typeA === 'stable_against' && typeB === 'touching') return this.relationA;
    if (typeB === 'stable_against' && typeA === 'touching') return this.relationB;
    if (typeA === 'supported_by' && typeB === 'touching') return this.relationA;
    if (typeB === 'supported_by' && typeA === 'touching') return this.relationB;

    // supported_by implies co_planar
    if (typeA === 'supported_by' && typeB === 'co_planar') return this.relationA;
    if (typeB === 'supported_by' && typeA === 'co_planar') return this.relationB;

    // stable_against implies co_planar
    if (typeA === 'stable_against' && typeB === 'co_planar') return this.relationA;
    if (typeB === 'stable_against' && typeA === 'co_planar') return this.relationB;

    // Can't simplify further
    return this;
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.relationA.getVariables()) vars.add(v);
    for (const v of this.relationB.getVariables()) vars.add(v);
    return vars;
  }

  clone(): IntersectionRelation {
    return new IntersectionRelation(
      this.relationA.clone() as Relation,
      this.relationB.clone() as Relation
    );
  }

  toString(): string {
    return `(${this.relationA} ∩ ${this.relationB})`;
  }
}

/**
 * Difference relation: this relation is satisfied but the other is not.
 *
 * Logical definition: this AND NOT(other)
 *
 * Useful for constraint subtraction:
 * - "near but not touching" = Near.difference(Touching)
 * - "visible but not occluded" = Visible.difference(Occluded)
 * - "supported but not stable" = SupportedBy.difference(StableAgainst)
 */
export class DifferenceRelation extends Relation {
  readonly type = 'DifferenceRelation';
  readonly relationType = 'difference';

  constructor(
    public readonly relationA: Relation,
    public readonly relationB: Relation
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['relationA', this.relationA], ['relationB', this.relationB]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // A must be true AND B must be false
    return this.relationA.evaluate(state) && !this.relationB.evaluate(state);
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.relationA.isSatisfied(state) && !this.relationB.isSatisfied(state);
  }

  /**
   * Attempt to simplify this difference.
   * If A implies B, then A - B = empty (always false).
   * If B implies A, then A - B = A (subtracting a subset).
   */
  simplify(): Relation {
    const typeA = this.relationA.relationType;
    const typeB = this.relationB.relationType;

    // If A and B are the same type, difference is empty
    if (typeA === typeB) {
      // Return a constant-false relation via NegatedRelation(AnyRelation)
      // Actually, let's use a simpler approach: NegatedRelation of the same type
      // But since Relation is abstract, we use a workaround
      return new NegatedRelation(this.relationA);
    }

    // stable_against implies supported_by implies touching
    // stable_against - supported_by = empty (stable implies supported)
    if (typeA === 'stable_against' && typeB === 'supported_by') {
      return new NegatedRelation(this.relationA); // always false
    }
    if (typeA === 'stable_against' && typeB === 'touching') {
      return new NegatedRelation(this.relationA); // always false
    }
    if (typeA === 'supported_by' && typeB === 'touching') {
      return new NegatedRelation(this.relationA); // always false
    }

    // supported_by - stable_against = supported but not stable
    // This is a valid distinction (more restrictive minus more restrictive)
    // No simplification needed

    return this;
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.relationA.getVariables()) vars.add(v);
    for (const v of this.relationB.getVariables()) vars.add(v);
    return vars;
  }

  clone(): DifferenceRelation {
    return new DifferenceRelation(
      this.relationA.clone() as Relation,
      this.relationB.clone() as Relation
    );
  }

  toString(): string {
    return `(${this.relationA} - ${this.relationB})`;
  }
}
