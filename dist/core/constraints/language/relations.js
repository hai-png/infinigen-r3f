/**
 * Spatial Relations for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/relations.py
 */
import { BoolExpression } from './expression.js';
/**
 * Base class for all relations (constraints)
 */
export class Relation extends BoolExpression {
}
/**
 * Special relation that matches any object set
 */
export class AnyRelation extends Relation {
    constructor(objects) {
        super();
        this.objects = objects;
    }
    children() {
        return new Map([['objects', this.objects]]);
    }
    evaluate(state) {
        return true;
    }
    isSatisfied(state) {
        return true;
    }
    getVariables() {
        return this.objects.getVariables();
    }
    clone() {
        return new AnyRelation(this.objects.clone());
    }
    toString() {
        return `Any(${this.objects})`;
    }
}
/**
 * Negated relation: NOT(relation)
 */
export class NegatedRelation extends Relation {
    constructor(relation) {
        super();
        this.relation = relation;
    }
    children() {
        return new Map([['relation', this.relation]]);
    }
    evaluate(state) {
        return !this.relation.evaluate(state);
    }
    isSatisfied(state) {
        return !this.relation.isSatisfied(state);
    }
    getVariables() {
        return this.relation.getVariables();
    }
    clone() {
        return new NegatedRelation(this.relation.clone());
    }
    toString() {
        return `NOT(${this.relation})`;
    }
}
/**
 * Conjunction of relations: AND(relations)
 */
export class AndRelations extends Relation {
    constructor(relations) {
        super();
        this.relations = relations;
    }
    children() {
        const map = new Map();
        this.relations.forEach((r, i) => map.set(`relation_${i}`, r));
        return map;
    }
    evaluate(state) {
        return this.relations.every(r => r.evaluate(state));
    }
    isSatisfied(state) {
        return this.relations.every(r => r.isSatisfied(state));
    }
    getVariables() {
        const vars = new Set();
        for (const r of this.relations) {
            for (const v of r.getVariables()) {
                vars.add(v);
            }
        }
        return vars;
    }
    clone() {
        return new AndRelations(this.relations.map(r => r.clone()));
    }
    toString() {
        return `AND(${this.relations.join(', ')})`;
    }
}
/**
 * Disjunction of relations: OR(relations)
 */
export class OrRelations extends Relation {
    constructor(relations) {
        super();
        this.relations = relations;
    }
    children() {
        const map = new Map();
        this.relations.forEach((r, i) => map.set(`relation_${i}`, r));
        return map;
    }
    evaluate(state) {
        return this.relations.some(r => r.evaluate(state));
    }
    isSatisfied(state) {
        return this.relations.some(r => r.isSatisfied(state));
    }
    getVariables() {
        const vars = new Set();
        for (const r of this.relations) {
            for (const v of r.getVariables()) {
                vars.add(v);
            }
        }
        return vars;
    }
    clone() {
        return new OrRelations(this.relations.map(r => r.clone()));
    }
    toString() {
        return `OR(${this.relations.join(', ')})`;
    }
}
/**
 * Base class for geometry-based relations
 */
export class GeometryRelation extends Relation {
    constructor(objects1, objects2) {
        super();
        this.objects1 = objects1;
        this.objects2 = objects2;
    }
    getVariables() {
        const vars = new Set();
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
    constructor(objects1, objects2, threshold = 0.01) {
        super(objects1, objects2);
        this.threshold = threshold;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires scene/collision system
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new Touching(this.objects1.clone(), this.objects2.clone(), this.threshold);
    }
    toString() {
        return `Touching(${this.objects1}, ${this.objects2}, ${this.threshold})`;
    }
}
/**
 * Supported by relation: objects1 are supported by objects2
 */
export class SupportedBy extends GeometryRelation {
    constructor(objects1, objects2, tolerance = 0.1) {
        super(objects1, objects2);
        this.tolerance = tolerance;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires physics/gravity simulation
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new SupportedBy(this.objects1.clone(), this.objects2.clone(), this.tolerance);
    }
    toString() {
        return `SupportedBy(${this.objects1}, ${this.objects2}, ${this.tolerance})`;
    }
}
/**
 * Co-planar relation: objects are on the same plane
 */
export class CoPlanar extends GeometryRelation {
    constructor(objects1, objects2, normalTolerance = 0.1, distanceTolerance = 0.1) {
        super(objects1, objects2);
        this.normalTolerance = normalTolerance;
        this.distanceTolerance = distanceTolerance;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires normal/distance computation
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new CoPlanar(this.objects1.clone(), this.objects2.clone(), this.normalTolerance, this.distanceTolerance);
    }
    toString() {
        return `CoPlanar(${this.objects1}, ${this.objects2})`;
    }
}
/**
 * Stable against relation: objects1 are stable against objects2
 */
export class StableAgainst extends GeometryRelation {
    constructor(objects1, objects2) {
        super(objects1, objects2);
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires stability analysis
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new StableAgainst(this.objects1.clone(), this.objects2.clone());
    }
    toString() {
        return `StableAgainst(${this.objects1}, ${this.objects2})`;
    }
}
/**
 * Facing relation: objects1 are facing objects2
 */
export class Facing extends GeometryRelation {
    constructor(objects1, objects2, angleThreshold = Math.PI / 4) {
        super(objects1, objects2);
        this.angleThreshold = angleThreshold;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires forward vector computation
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new Facing(this.objects1.clone(), this.objects2.clone(), this.angleThreshold);
    }
    toString() {
        return `Facing(${this.objects1}, ${this.objects2}, ${this.angleThreshold})`;
    }
}
/**
 * Between relation: objects1 are between objects2 and objects3
 */
export class Between extends Relation {
    constructor(objects1, objects2, objects3, axis = 'any') {
        super();
        this.objects1 = objects1;
        this.objects2 = objects2;
        this.objects3 = objects3;
        this.axis = axis;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2],
            ['objects3', this.objects3]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires position comparison
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    getVariables() {
        const vars = new Set();
        for (const v of this.objects1.getVariables())
            vars.add(v);
        for (const v of this.objects2.getVariables())
            vars.add(v);
        for (const v of this.objects3.getVariables())
            vars.add(v);
        return vars;
    }
    clone() {
        return new Between(this.objects1.clone(), this.objects2.clone(), this.objects3.clone(), this.axis);
    }
    toString() {
        return `Between(${this.objects1}, ${this.objects2}, ${this.objects3}, ${this.axis})`;
    }
}
/**
 * Accessible from relation: objects1 are accessible from objects2
 */
export class AccessibleFrom extends GeometryRelation {
    constructor(objects1, objects2, reachDistance = 1.0) {
        super(objects1, objects2);
        this.reachDistance = reachDistance;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires path finding
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new AccessibleFrom(this.objects1.clone(), this.objects2.clone(), this.reachDistance);
    }
    toString() {
        return `AccessibleFrom(${this.objects1}, ${this.objects2}, ${this.reachDistance})`;
    }
}
/**
 * Reachable from relation: objects1 are reachable from objects2 via path
 */
export class ReachableFrom extends GeometryRelation {
    constructor(objects1, objects2, maxPathLength) {
        super(objects1, objects2);
        this.maxPathLength = maxPathLength;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires A* pathfinding
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new ReachableFrom(this.objects1.clone(), this.objects2.clone(), this.maxPathLength);
    }
    toString() {
        return `ReachableFrom(${this.objects1}, ${this.objects2})`;
    }
}
/**
 * In front of relation: objects1 are in front of objects2
 */
export class InFrontOf extends GeometryRelation {
    constructor(objects1, objects2, distance = 0.5) {
        super(objects1, objects2);
        this.distance = distance;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires view direction computation
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new InFrontOf(this.objects1.clone(), this.objects2.clone(), this.distance);
    }
    toString() {
        return `InFrontOf(${this.objects1}, ${this.objects2}, ${this.distance})`;
    }
}
/**
 * Aligned relation: objects1 are aligned with objects2
 */
export class Aligned extends GeometryRelation {
    constructor(objects1, objects2, axis = 'y', tolerance = 0.1) {
        super(objects1, objects2);
        this.axis = axis;
        this.tolerance = tolerance;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires alignment check
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new Aligned(this.objects1.clone(), this.objects2.clone(), this.axis, this.tolerance);
    }
    toString() {
        return `Aligned(${this.objects1}, ${this.objects2}, ${this.axis}, ${this.tolerance})`;
    }
}
/**
 * Hidden relation: objects1 are hidden from view
 */
export class Hidden extends Relation {
    constructor(objects) {
        super();
        this.objects = objects;
    }
    children() {
        return new Map([['objects', this.objects]]);
    }
    evaluate(state) {
        // Placeholder - requires ray casting
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    getVariables() {
        return this.objects.getVariables();
    }
    clone() {
        return new Hidden(this.objects.clone());
    }
    toString() {
        return `Hidden(${this.objects})`;
    }
}
/**
 * Visible relation: objects are visible from camera/viewpoint
 */
export class Visible extends Relation {
    constructor(objects, viewpoint) {
        super();
        this.objects = objects;
        this.viewpoint = viewpoint;
    }
    children() {
        const map = new Map([['objects', this.objects]]);
        if (this.viewpoint) {
            map.set('viewpoint', this.viewpoint);
        }
        return map;
    }
    evaluate(state) {
        // Placeholder - requires visibility testing
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    getVariables() {
        const vars = this.objects.getVariables();
        if (this.viewpoint) {
            for (const v of this.viewpoint.getVariables()) {
                vars.add(v);
            }
        }
        return vars;
    }
    clone() {
        return new Visible(this.objects.clone(), this.viewpoint?.clone());
    }
    toString() {
        return `Visible(${this.objects}${this.viewpoint ? `, ${this.viewpoint}` : ''})`;
    }
}
/**
 * Grouped relation: objects are close together
 */
export class Grouped extends Relation {
    constructor(objects, maxDistance = 2.0) {
        super();
        this.objects = objects;
        this.maxDistance = maxDistance;
    }
    children() {
        return new Map([['objects', this.objects]]);
    }
    evaluate(state) {
        // Placeholder - requires clustering analysis
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    getVariables() {
        return this.objects.getVariables();
    }
    clone() {
        return new Grouped(this.objects.clone(), this.maxDistance);
    }
    toString() {
        return `Grouped(${this.objects}, ${this.maxDistance})`;
    }
}
/**
 * Distributed relation: objects are spread apart
 */
export class Distributed extends Relation {
    constructor(objects, minDistance = 1.0) {
        super();
        this.objects = objects;
        this.minDistance = minDistance;
    }
    children() {
        return new Map([['objects', this.objects]]);
    }
    evaluate(state) {
        // Placeholder - requires distribution analysis
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    getVariables() {
        return this.objects.getVariables();
    }
    clone() {
        return new Distributed(this.objects.clone(), this.minDistance);
    }
    toString() {
        return `Distributed(${this.objects}, ${this.minDistance})`;
    }
}
/**
 * Coverage relation: objects1 cover objects2
 */
export class Coverage extends GeometryRelation {
    constructor(objects1, objects2, coverageThreshold = 0.8) {
        super(objects1, objects2);
        this.coverageThreshold = coverageThreshold;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires area/volume computation
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new Coverage(this.objects1.clone(), this.objects2.clone(), this.coverageThreshold);
    }
    toString() {
        return `Coverage(${this.objects1}, ${this.objects2}, ${this.coverageThreshold})`;
    }
}
/**
 * Support coverage relation
 */
export class SupportCoverage extends GeometryRelation {
    constructor(objects1, objects2, minSupport = 0.5) {
        super(objects1, objects2);
        this.minSupport = minSupport;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new SupportCoverage(this.objects1.clone(), this.objects2.clone(), this.minSupport);
    }
    toString() {
        return `SupportCoverage(${this.objects1}, ${this.objects2}, ${this.minSupport})`;
    }
}
/**
 * Stability relation: objects are stable (won't fall)
 */
export class Stability extends Relation {
    constructor(objects) {
        super();
        this.objects = objects;
    }
    children() {
        return new Map([['objects', this.objects]]);
    }
    evaluate(state) {
        // Placeholder - requires physics simulation
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    getVariables() {
        return this.objects.getVariables();
    }
    clone() {
        return new Stability(this.objects.clone());
    }
    toString() {
        return `Stability(${this.objects})`;
    }
}
/**
 * Containment relation: objects1 contain objects2
 */
export class Containment extends GeometryRelation {
    constructor(objects1, objects2) {
        super(objects1, objects2);
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires bounding box containment check
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new Containment(this.objects1.clone(), this.objects2.clone());
    }
    toString() {
        return `Containment(${this.objects1}, ${this.objects2})`;
    }
}
/**
 * Proximity relation: objects are within certain distance
 */
export class Proximity extends GeometryRelation {
    constructor(objects1, objects2, maxDistance = 1.0) {
        super(objects1, objects2);
        this.maxDistance = maxDistance;
    }
    children() {
        return new Map([
            ['objects1', this.objects1],
            ['objects2', this.objects2]
        ]);
    }
    evaluate(state) {
        // Placeholder - requires distance computation
        return true;
    }
    isSatisfied(state) {
        return this.evaluate(state);
    }
    clone() {
        return new Proximity(this.objects1.clone(), this.objects2.clone(), this.maxDistance);
    }
    toString() {
        return `Proximity(${this.objects1}, ${this.objects2}, ${this.maxDistance})`;
    }
}
//# sourceMappingURL=relations.js.map