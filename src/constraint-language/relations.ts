/**
 * Spatial Relations for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/relations.py
 */

import { Node, Variable, Domain, ObjectSetDomain } from './types.js';
import { BoolExpression, ScalarExpression, BoolConstant } from './expression.js';
import { ObjectSetExpression } from './set-reasoning.js';

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
}

/**
 * Special relation that matches any object set
 */
export class AnyRelation extends Relation {
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

/**
 * Touching relation: objects1 are touching objects2
 */
export class Touching extends GeometryRelation {
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly threshold: number = 0.01
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires scene/collision system
    return true;
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
 * Supported by relation: objects1 are supported by objects2
 */
export class SupportedBy extends GeometryRelation {
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly tolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires physics/gravity simulation
    return true;
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
 * Co-planar relation: objects are on the same plane
 */
export class CoPlanar extends GeometryRelation {
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly normalTolerance: number = 0.1,
    public readonly distanceTolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires normal/distance computation
    return true;
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
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires stability analysis
    return true;
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
 */
export class Facing extends GeometryRelation {
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly angleThreshold: number = Math.PI / 4
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires forward vector computation
    return true;
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
    // Placeholder - requires position comparison
    return true;
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
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly reachDistance: number = 1.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires path finding
    return true;
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
 * Reachable from relation: objects1 are reachable from objects2 via path
 */
export class ReachableFrom extends GeometryRelation {
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly maxPathLength?: number
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires A* pathfinding
    return true;
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
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly distance: number = 0.5
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires view direction computation
    return true;
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
 * Aligned relation: objects1 are aligned with objects2
 */
export class Aligned extends GeometryRelation {
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly axis: 'x' | 'y' | 'z' = 'y',
    public readonly tolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires alignment check
    return true;
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
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires ray casting
    return true;
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
 */
export class Visible extends Relation {
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
    // Placeholder - requires visibility testing
    return true;
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
 */
export class Grouped extends Relation {
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
    // Placeholder - requires clustering analysis
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
 */
export class Distributed extends Relation {
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
    // Placeholder - requires distribution analysis
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
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly coverageThreshold: number = 0.8
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires area/volume computation
    return true;
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
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly minSupport: number = 0.5
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    return true;
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
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires physics simulation
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
 */
export class Containment extends GeometryRelation {
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires bounding box containment check
    return true;
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
 */
export class Proximity extends GeometryRelation {
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly maxDistance: number = 1.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // Placeholder - requires distance computation
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Proximity {
    return new Proximity(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.maxDistance
    );
  }

  toString(): string {
    return `Proximity(${this.objects1}, ${this.objects2}, ${this.maxDistance})`;
  }
}
