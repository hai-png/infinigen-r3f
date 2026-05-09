/**
 * Geometric predicate expressions for constraint language
 * These compute scalar values from geometric relationships
 * 
 * Ported from infinigen/core/constraints/constraint_language/geometry.py
 */

import { Node, Variable } from './types';
import { ScalarExpression } from './expression';
import { ObjectSetExpression } from './set-reasoning';
import {
  SpatialObject,
  retrieveSpatialObjects,
  toVec3,
  distance as spatialDistance,
  angleBetween,
  getAABB,
  getForward,
  directionTo,
  dot,
  normalize,
  aabbOverlapAreaXZ,
  aabbDistance,
  aabbContainedIn,
} from './spatial-helpers';

/**
 * Geometric predicate expressions for constraint language
 * These compute scalar values from geometric relationships
 */

export abstract class GeometryPredicate extends ScalarExpression {
  abstract readonly predicateType: string;
}

/**
 * Distance between two objects or sets
 * Computes the minimum distance between any pair of objects from the two sets
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
    const ids1 = this.obj1.evaluate(state);
    const ids2 = this.obj2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    
    if (objs1.length === 0 || objs2.length === 0) return Infinity;
    
    // Find minimum distance between any pair
    let minDist = Infinity;
    for (const a of objs1) {
      for (const b of objs2) {
        const d = spatialDistance(a.position, b.position);
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
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
 * Returns the Euclidean distance (simplified cost model)
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
    const ids1 = this.obj.evaluate(state);
    const ids2 = this.fromObj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids1);
    const fromObjs = retrieveSpatialObjects(state, ids2);
    
    if (objs.length === 0 || fromObjs.length === 0) return Infinity;
    
    // Accessibility cost = minimum distance to any "from" object
    let minDist = Infinity;
    for (const a of objs) {
      for (const b of fromObjs) {
        const d = spatialDistance(a.position, b.position);
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
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
 * Returns a score from 0 to 1 (1 = directly facing, 0 = perpendicular or behind)
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
    const ids1 = this.obj.evaluate(state);
    const ids2 = this.viewer.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids1);
    const viewers = retrieveSpatialObjects(state, ids2);
    
    if (objs.length === 0 || viewers.length === 0) return 0;
    
    // Focus score based on how directly the viewer faces the object
    let maxScore = 0;
    for (const viewer of viewers) {
      const fwd = getForward(viewer);
      for (const obj of objs) {
        const dir = directionTo(viewer, obj);
        const d = dot(fwd, dir);
        // Score is max of (dot product + 1) / 2, normalized to [0, 1]
        const score = Math.max(0, (d + 1) / 2);
        if (score > maxScore) maxScore = score;
      }
    }
    return maxScore;
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
 * Returns the angle in radians between the forward directions of two objects,
 * or the angle between the direction from obj1 to obj2
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
    const ids1 = this.obj1.evaluate(state);
    const ids2 = this.obj2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    
    if (objs1.length === 0 || objs2.length === 0) return 0;
    
    // Compute average angle between forward directions of objects
    let totalAngle = 0;
    let count = 0;
    for (const a of objs1) {
      const fwdA = getForward(a);
      for (const b of objs2) {
        const fwdB = getForward(b);
        totalAngle += angleBetween(fwdA, fwdB);
        count++;
      }
    }
    return count > 0 ? totalAngle / count : 0;
  }

  clone(): Angle {
    return new Angle(
      this.obj1.clone() as ObjectSetExpression,
      this.obj2.clone() as ObjectSetExpression
    );
  }
}

/**
 * Surface area of an object (computed from AABB)
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalArea = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      const dx = aabb.max[0] - aabb.min[0];
      const dy = aabb.max[1] - aabb.min[1];
      const dz = aabb.max[2] - aabb.min[2];
      // AABB surface area = 2*(dx*dy + dx*dz + dy*dz)
      totalArea += 2 * (dx * dy + dx * dz + dy * dz);
    }
    return totalArea;
  }

  clone(): SurfaceArea {
    return new SurfaceArea(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Volume of an object (computed from AABB)
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalVolume = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      const dx = aabb.max[0] - aabb.min[0];
      const dy = aabb.max[1] - aabb.min[1];
      const dz = aabb.max[2] - aabb.min[2];
      totalVolume += dx * dy * dz;
    }
    return totalVolume;
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
 * Height of an object above ground (Y coordinate of center)
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    // Return average Y position (height above ground)
    let totalY = 0;
    for (const obj of objs) {
      totalY += toVec3(obj.position)[1];
    }
    return totalY / objs.length;
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : 2;
    let totalWidth = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      totalWidth += aabb.max[axisIndex] - aabb.min[axisIndex];
    }
    return totalWidth;
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : 2;
    let total = 0;
    for (const obj of objs) {
      total += toVec3(obj.position)[axisIndex];
    }
    return total / objs.length;
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    // Average alignment of forward directions with the target direction
    let totalDot = 0;
    for (const obj of objs) {
      const fwd = getForward(obj);
      totalDot += dot(fwd, this.direction);
    }
    return totalDot / objs.length;
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return Infinity;
    
    // Get all other objects in the state that aren't in the exclude set
    const excludeIds = this.excludeSet ? this.excludeSet.evaluate(state) : new Set<string>();
    
    // Collect all spatial objects from state that are NOT our objects or excluded
    let minClearance = Infinity;
    for (const obj of objs) {
      const objPos = toVec3(obj.position);
      // Check distance to every object in state (excluding self and excluded)
      for (const [key, value] of state.entries()) {
        const keyStr = String(key);
        if (keyStr.startsWith('__spatial_')) {
          const otherId = keyStr.replace('__spatial_', '');
          if (ids.has(otherId) || excludeIds.has(otherId)) continue;
          const other = value as SpatialObject;
          const d = spatialDistance(objPos, other.position);
          if (d < minClearance) minClearance = d;
        }
      }
    }
    return minClearance;
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
 * Returns a value from 0 to 1 based on distance and facing direction
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
    const ids1 = this.obj.evaluate(state);
    const ids2 = this.viewer.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids1);
    const viewers = retrieveSpatialObjects(state, ids2);
    
    if (objs.length === 0 || viewers.length === 0) return 0;
    
    // Visibility score based on distance (closer = more visible) and facing
    let maxScore = 0;
    for (const viewer of viewers) {
      const fwd = getForward(viewer);
      for (const obj of objs) {
        const dir = directionTo(viewer, obj);
        const dist = spatialDistance(viewer.position, obj.position);
        const facingScore = Math.max(0, dot(fwd, dir)); // 0 to 1
        const distScore = Math.max(0, 1 - dist / 100); // Closer = higher score
        const score = facingScore * distScore;
        if (score > maxScore) maxScore = score;
      }
    }
    return maxScore;
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
 * Returns 1.0 if center of mass is within support base, 0.0 if not
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalScore = 0;
    for (const obj of objs) {
      const pos = toVec3(obj.position);
      const aabb = getAABB(obj);
      // Stable if center of mass (position) is within the XZ footprint of the AABB
      const withinX = pos[0] >= aabb.min[0] && pos[0] <= aabb.max[0];
      const withinZ = pos[2] >= aabb.min[2] && pos[2] <= aabb.max[2];
      const aboveGround = pos[1] >= 0;
      totalScore += (withinX && withinZ && aboveGround) ? 1.0 : 0.0;
    }
    return totalScore / objs.length;
  }

  clone(): StabilityScore {
    return new StabilityScore(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Support contact area between two objects
 * Returns the XZ overlap area between the bottom of the supported object
 * and the top of the supporter object
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
    const ids1 = this.supported.evaluate(state);
    const ids2 = this.supporter.evaluate(state);
    const supporteds = retrieveSpatialObjects(state, ids1);
    const supporters = retrieveSpatialObjects(state, ids2);
    
    if (supporteds.length === 0 || supporters.length === 0) return 0;
    
    let totalArea = 0;
    for (const a of supporteds) {
      const aabbA = getAABB(a);
      for (const b of supporters) {
        const aabbB = getAABB(b);
        // Check if a is on top of b (bottom of a near top of b)
        const aBottom = aabbA.min[1];
        const bTop = aabbB.max[1];
        if (Math.abs(aBottom - bTop) < 0.15) {
          totalArea += aabbOverlapAreaXZ(aabbA, aabbB);
        }
      }
    }
    return totalArea;
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
 * Returns 1.0 if reachable, decays with distance
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
    const ids1 = this.obj.evaluate(state);
    const ids2 = this.agent.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids1);
    const agents = retrieveSpatialObjects(state, ids2);
    
    if (objs.length === 0 || agents.length === 0) return 0;
    
    // Reachability score based on inverse distance
    const armLength = 2.0; // Typical human arm reach
    let maxScore = 0;
    for (const agent of agents) {
      for (const obj of objs) {
        const dist = spatialDistance(agent.position, obj.position);
        const score = Math.max(0, 1 - dist / armLength);
        if (score > maxScore) maxScore = score;
      }
    }
    return maxScore;
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalAlignment = 0;
    for (const obj of objs) {
      const fwd = getForward(obj);
      totalAlignment += dot(fwd, this.targetDirection);
    }
    return totalAlignment / objs.length;
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalCompactness = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      const dx = aabb.max[0] - aabb.min[0];
      const dy = aabb.max[1] - aabb.min[1];
      const dz = aabb.max[2] - aabb.min[2];
      const volume = dx * dy * dz;
      const surfaceArea = 2 * (dx * dy + dx * dz + dy * dz);
      if (surfaceArea > 0) {
        totalCompactness += volume / Math.pow(surfaceArea, 1.5);
      }
    }
    return totalCompactness / objs.length;
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
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 1;
    
    const ai1 = this.axis1 === 'x' ? 0 : this.axis1 === 'y' ? 1 : 2;
    const ai2 = this.axis2 === 'x' ? 0 : this.axis2 === 'y' ? 1 : 2;
    
    let totalRatio = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      const d1 = aabb.max[ai1] - aabb.min[ai1];
      const d2 = aabb.max[ai2] - aabb.min[ai2];
      totalRatio += d2 > 0 ? d1 / d2 : 1;
    }
    return totalRatio / objs.length;
  }

  clone(): AspectRatio {
    return new AspectRatio(this.obj.clone() as ObjectSetExpression, this.axis1, this.axis2);
  }
}

// ============================================================================
// Missing Geometry Predicates
// Ported from: constraint_language/geometry.py
// ============================================================================

/**
 * MinDistanceInternal - Minimum pairwise distance within a set
 *
 * Port of: min_distance_internal(objs) in constraint_language/geometry.py
 * Returns the minimum distance between any pair of objects in the set.
 * O(n²) but typically small sets.
 */
export class MinDistanceInternal extends GeometryPredicate {
  readonly type = 'MinDistanceInternal';
  readonly predicateType = 'MinDistanceInternal';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length <= 1) return Infinity;

    let minDist = Infinity;
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const d = spatialDistance(objects[i].position, objects[j].position);
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
  }

  clone(): MinDistanceInternal {
    return new MinDistanceInternal(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `MinDistanceInternal(${this.objs})`;
  }
}

/**
 * FreeSpace2D - 2D free space metric
 *
 * Port of: freespace_2d(objs, others) in constraint_language/geometry.py
 * Computes 2D free space metric (area not occupied by others).
 */
export class FreeSpace2D extends GeometryPredicate {
  readonly type = 'FreeSpace2D';
  readonly predicateType = 'FreeSpace2D';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly others: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs], ['others', this.others]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objIds = this.objs.evaluate(state);
    const otherIds = this.others.evaluate(state);
    const objects = retrieveSpatialObjects(state, objIds);
    const otherObjs = retrieveSpatialObjects(state, otherIds);
    if (objects.length === 0) return 0;

    // Compute total bounding area of objs
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const obj of objects) {
      const aabb = getAABB(obj);
      minX = Math.min(minX, aabb.min[0]);
      maxX = Math.max(maxX, aabb.max[0]);
      minZ = Math.min(minZ, aabb.min[2]);
      maxZ = Math.max(maxZ, aabb.max[2]);
    }
    const totalArea = Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
    if (totalArea <= 0) return 0;

    // Subtract area occupied by others
    let occupiedArea = 0;
    for (const other of otherObjs) {
      const aabb = getAABB(other);
      const area = Math.max(0, aabb.max[0] - aabb.min[0]) * Math.max(0, aabb.max[2] - aabb.min[2]);
      occupiedArea += area;
    }

    return Math.max(0, totalArea - occupiedArea);
  }

  clone(): FreeSpace2D {
    return new FreeSpace2D(
      this.objs.clone() as ObjectSetExpression,
      this.others.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `FreeSpace2D(${this.objs}, ${this.others})`;
  }
}

/**
 * MinDistance2D - 2D minimum distance
 *
 * Port of: min_dist_2d(objs, others) in constraint_language/geometry.py
 * Computes 2D (XZ plane) minimum distance between object sets.
 */
export class MinDistance2D extends GeometryPredicate {
  readonly type = 'MinDistance2D';
  readonly predicateType = 'MinDistance2D';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly others: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs], ['others', this.others]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objIds = this.objs.evaluate(state);
    const otherIds = this.others.evaluate(state);
    const objects = retrieveSpatialObjects(state, objIds);
    const otherObjs = retrieveSpatialObjects(state, otherIds);
    if (objects.length === 0 || otherObjs.length === 0) return Infinity;

    let minDist = Infinity;
    for (const a of objects) {
      const aPos = toVec3(a.position);
      for (const b of otherObjs) {
        const bPos = toVec3(b.position);
        // 2D distance on XZ plane
        const dx = aPos[0] - bPos[0];
        const dz = aPos[2] - bPos[2];
        const d2d = Math.sqrt(dx * dx + dz * dz);
        if (d2d < minDist) minDist = d2d;
      }
    }
    return minDist;
  }

  clone(): MinDistance2D {
    return new MinDistance2D(
      this.objs.clone() as ObjectSetExpression,
      this.others.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `MinDistance2D(${this.objs}, ${this.others})`;
  }
}

/**
 * RotationalAsymmetry - Rotational asymmetry score
 *
 * Port of: rotational_asymmetry(objs) in constraint_language/geometry.py
 * Measures how asymmetric the object arrangement is around its centroid.
 * Returns 0 for perfectly rotationally symmetric arrangements.
 */
export class RotationalAsymmetry extends GeometryPredicate {
  readonly type = 'RotationalAsymmetry';
  readonly predicateType = 'RotationalAsymmetry';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length <= 1) return 0;

    // Compute centroid
    let cx = 0, cz = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      cx += p[0]; cz += p[2];
    }
    cx /= objects.length;
    cz /= objects.length;

    // Compute angles of each object relative to centroid
    const angles = objects.map(obj => {
      const p = toVec3(obj.position);
      return Math.atan2(p[2] - cz, p[0] - cx);
    });

    // Compute asymmetry as variance of angular distribution
    // Perfect symmetry would have evenly-spaced angles
    const sortedAngles = angles.sort((a, b) => a - b);
    const n = sortedAngles.length;
    const idealSpacing = (2 * Math.PI) / n;

    let asymmetry = 0;
    for (let i = 0; i < n; i++) {
      const nextAngle = sortedAngles[(i + 1) % n];
      const currAngle = sortedAngles[i];
      const actualSpacing = nextAngle >= currAngle
        ? nextAngle - currAngle
        : (2 * Math.PI - currAngle) + nextAngle;
      asymmetry += Math.abs(actualSpacing - idealSpacing);
    }

    return asymmetry / (2 * Math.PI); // Normalize to [0, 1]
  }

  clone(): RotationalAsymmetry {
    return new RotationalAsymmetry(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `RotationalAsymmetry(${this.objs})`;
  }
}

/**
 * ReflectionalAsymmetry - Reflectional asymmetry
 *
 * Port of: reflectional_asymmetry(objs, others, use_long_plane) in constraint_language/geometry.py
 * Measures how asymmetric the arrangement is across a reflection plane.
 * Returns 0 for perfectly reflectionally symmetric.
 */
export class ReflectionalAsymmetry extends GeometryPredicate {
  readonly type = 'ReflectionalAsymmetry';
  readonly predicateType = 'ReflectionalAsymmetry';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly others: ObjectSetExpression,
    public readonly useLongPlane: boolean = true
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs], ['others', this.others]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objIds = this.objs.evaluate(state);
    const otherIds = this.others.evaluate(state);
    const objects = retrieveSpatialObjects(state, objIds);
    const otherObjs = retrieveSpatialObjects(state, otherIds);
    const allObjs = [...objects, ...otherObjs];
    if (allObjs.length <= 1) return 0;

    // Compute centroid
    let cx = 0, cz = 0;
    for (const obj of allObjs) {
      const p = toVec3(obj.position);
      cx += p[0]; cz += p[2];
    }
    cx /= allObjs.length;
    cz /= allObjs.length;

    // Determine reflection plane axis
    // Use long axis (direction of greatest spread) if useLongPlane
    let spreadX = 0, spreadZ = 0;
    for (const obj of allObjs) {
      const p = toVec3(obj.position);
      spreadX += (p[0] - cx) ** 2;
      spreadZ += (p[2] - cz) ** 2;
    }

    // Reflection plane is perpendicular to the longer spread
    const reflectAlongX = this.useLongPlane ? spreadX > spreadZ : spreadX <= spreadZ;

    // Compute asymmetry: sum of distances of objects from their reflections
    let asymmetry = 0;
    for (const obj of allObjs) {
      const p = toVec3(obj.position);
      // Reflected position
      const rx = reflectAlongX ? 2 * cx - p[0] : p[0];
      const rz = reflectAlongX ? p[2] : 2 * cz - p[2];

      // Find closest object to reflected position
      let minDist = Infinity;
      for (const other of allObjs) {
        if (other === obj) continue;
        const op = toVec3(other.position);
        const d = Math.sqrt((op[0] - rx) ** 2 + (op[2] - rz) ** 2);
        if (d < minDist) minDist = d;
      }
      asymmetry += minDist;
    }

    return asymmetry / allObjs.length;
  }

  clone(): ReflectionalAsymmetry {
    return new ReflectionalAsymmetry(
      this.objs.clone() as ObjectSetExpression,
      this.others.clone() as ObjectSetExpression,
      this.useLongPlane
    );
  }

  toString(): string {
    return `ReflectionalAsymmetry(${this.objs}, ${this.others})`;
  }
}

/**
 * CoplanarityCost - Co-planarity violation cost
 *
 * Port of: coplanarity_cost(objs) in constraint_language/geometry.py
 * All objects should be on the same plane; cost = variance in Y positions.
 */
export class CoplanarityCost extends GeometryPredicate {
  readonly type = 'CoplanarityCost';
  readonly predicateType = 'CoplanarityCost';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length <= 1) return 0;

    // Compute mean Y
    let sumY = 0;
    for (const obj of objects) {
      sumY += toVec3(obj.position)[1];
    }
    const meanY = sumY / objects.length;

    // Compute variance
    let variance = 0;
    for (const obj of objects) {
      const y = toVec3(obj.position)[1];
      variance += (y - meanY) ** 2;
    }

    return variance / objects.length; // MSE = variance
  }

  clone(): CoplanarityCost {
    return new CoplanarityCost(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `CoplanarityCost(${this.objs})`;
  }
}

/**
 * CenterStableSurfaceDist - Distance from center of support surface
 *
 * Port of: center_stable_surface_dist(objs) in constraint_language/geometry.py
 * Computes distance of objects from the center of their support surface.
 */
export class CenterStableSurfaceDist extends GeometryPredicate {
  readonly type = 'CenterStableSurfaceDist';
  readonly predicateType = 'CenterStableSurfaceDist';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 0;

    // Compute centroid of the support surface (XZ plane)
    let cx = 0, cz = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      cx += p[0]; cz += p[2];
    }
    cx /= objects.length;
    cz /= objects.length;

    // Compute average distance from centroid
    let totalDist = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      const dx = p[0] - cx;
      const dz = p[2] - cz;
      totalDist += Math.sqrt(dx * dx + dz * dz);
    }

    return totalDist / objects.length;
  }

  clone(): CenterStableSurfaceDist {
    return new CenterStableSurfaceDist(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `CenterStableSurfaceDist(${this.objs})`;
  }
}

/**
 * AngleAlignmentCost - Angular misalignment cost
 *
 * Port of: angle_alignment_cost(objs, others, others_tags) in constraint_language/geometry.py
 * Computes angular misalignment cost between two object sets.
 */
export class AngleAlignmentCost extends GeometryPredicate {
  readonly type = 'AngleAlignmentCost';
  readonly predicateType = 'AngleAlignmentCost';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly others: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs], ['others', this.others]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objIds = this.objs.evaluate(state);
    const otherIds = this.others.evaluate(state);
    const objects = retrieveSpatialObjects(state, objIds);
    const otherObjs = retrieveSpatialObjects(state, otherIds);
    if (objects.length === 0 || otherObjs.length === 0) return 0;

    // Compute average forward directions for each set
    let totalCost = 0;
    let count = 0;

    for (const a of objects) {
      const fwdA = getForward(a);
      for (const b of otherObjs) {
        const fwdB = getForward(b);
        // Angular misalignment = 1 - |cos(angle)| between forward directions
        const cosAngle = Math.abs(dot(fwdA, fwdB));
        totalCost += 1 - cosAngle;
        count++;
      }
    }

    return count > 0 ? totalCost / count : 0;
  }

  clone(): AngleAlignmentCost {
    return new AngleAlignmentCost(
      this.objs.clone() as ObjectSetExpression,
      this.others.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `AngleAlignmentCost(${this.objs}, ${this.others})`;
  }
}

// ============================================================================
// Missing Geometry Cost Functions
// Ported from infinigen/core/constraints/constraint_language/geometry.py
// These implement the focusScore, angleAlignmentCost, freespace2D, minDist2D,
// rotationalAsymmetry, reflectionalAsymmetry, and coplanarityCost functions.
// ============================================================================

/**
 * Camera Focus Score — measures how centered/visible the object is in the camera view.
 *
 * Returns a value from 0 to 1 where:
 * - 1.0 = object is perfectly centered in the camera view and close
 * - 0.0 = object is outside the camera view or very far away
 *
 * This differs from the existing FocusScore class which measures how directly
 * a viewer faces the object. CameraFocusScore measures camera-centric visibility:
 * it considers the angular distance from the camera's view center, the object's
 * distance from the camera, and whether the object is in front of the camera.
 *
 * The camera is obtained from the state via the '__camera' key, or defaults
 * to a camera at origin looking down -Z.
 */
export class CameraFocusScore extends GeometryPredicate {
  readonly type = 'CameraFocusScore';
  readonly predicateType = 'CameraFocusScore';

  constructor(public readonly obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 0;

    // Get camera position and direction from state, or use defaults
    const stateAny = state as Map<any, any>;
    const camera = stateAny.get('__camera');
    let camPos: [number, number, number] = [0, 1, 5];
    let camFwd: [number, number, number] = [0, 0, -1];
    let fov: number = Math.PI / 3; // 60 degrees default

    if (camera) {
      if (camera.position) camPos = toVec3(camera.position);
      if (camera.forward) camFwd = normalize(toVec3(camera.forward));
      if (typeof camera.fov === 'number') fov = camera.fov;
    }

    let maxScore = 0;
    for (const obj of objects) {
      const objPos = toVec3(obj.position);

      // Vector from camera to object
      const toObj: [number, number, number] = [
        objPos[0] - camPos[0],
        objPos[1] - camPos[1],
        objPos[2] - camPos[2],
      ];
      const dist = Math.sqrt(toObj[0] * toObj[0] + toObj[1] * toObj[1] + toObj[2] * toObj[2]);

      if (dist < 0.001) {
        maxScore = Math.max(maxScore, 1.0);
        continue;
      }

      // Normalize direction
      const dir: [number, number, number] = [toObj[0] / dist, toObj[1] / dist, toObj[2] / dist];

      // Angle from camera forward direction
      const cosAngle = dot(dir, camFwd);
      if (cosAngle <= 0) continue; // Behind camera

      const angle = Math.acos(Math.min(1, cosAngle));
      const halfFov = fov / 2;

      // Angular score: 1.0 at center, 0.0 at edge of FOV
      const angularScore = Math.max(0, 1 - angle / halfFov);
      if (angularScore <= 0) continue; // Outside FOV

      // Distance score: closer objects score higher (inverse distance, capped)
      const distScore = Math.max(0, 1 - dist / 50); // 50m = max useful distance

      // Combined score: angular is primary, distance is secondary
      const score = angularScore * (0.7 + 0.3 * distScore);

      maxScore = Math.max(maxScore, score);
    }

    return Math.min(1, Math.max(0, maxScore));
  }

  clone(): CameraFocusScore {
    return new CameraFocusScore(this.obj.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `focusScore(${this.obj})`;
  }
}

/**
 * Rotation Alignment Cost — cost (0-1) of how much the object's rotation deviates
 * from a target angle.
 *
 * This differs from the existing AngleAlignmentCost which compares forward
 * directions between two object sets. This version compares a single object's
 * rotation (around the Y axis) against a specified target angle.
 *
 * Returns:
 * - 0.0 = object's rotation exactly matches the target angle
 * - 1.0 = object's rotation is maximally misaligned (180° off)
 */
export class RotationAlignmentCost extends GeometryPredicate {
  readonly type = 'RotationAlignmentCost';
  readonly predicateType = 'RotationAlignmentCost';

  constructor(
    public readonly obj: ObjectSetExpression,
    public readonly targetAngle: number
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 1;

    let totalCost = 0;
    for (const obj of objects) {
      // Extract Y-axis rotation from the object's forward direction
      const fwd = getForward(obj);

      // Compute the angle of the forward direction projected onto the XZ plane
      const fwdAngle = Math.atan2(fwd[2], fwd[0]);

      // Angular difference between object's rotation and target
      let angleDiff = fwdAngle - this.targetAngle;

      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

      // Cost is normalized: 0 at 0° deviation, 1 at 180° deviation
      const cost = Math.abs(angleDiff) / Math.PI;
      totalCost += cost;
    }

    return Math.min(1, totalCost / objects.length);
  }

  clone(): RotationAlignmentCost {
    return new RotationAlignmentCost(
      this.obj.clone() as ObjectSetExpression,
      this.targetAngle
    );
  }

  toString(): string {
    return `angleAlignmentCost(${this.obj}, ${this.targetAngle})`;
  }
}

/**
 * Object Freespace 2D — amount of 2D free space around the object on the ground plane.
 *
 * Computes the area of unoccupied space within a search radius around each
 * object on the XZ (ground) plane. Other objects in the scene are treated
 * as obstacles.
 *
 * This differs from the existing FreeSpace2D which takes explicit "others" and
 * "objs" sets. This version automatically scans all other objects in the state
 * as obstacles.
 */
export class ObjectFreespace2D extends GeometryPredicate {
  readonly type = 'ObjectFreespace2D';
  readonly predicateType = 'ObjectFreespace2D';

  /** Radius around each object to search for free space */
  public readonly searchRadius: number;

  constructor(
    public readonly obj: ObjectSetExpression,
    searchRadius: number = 5.0
  ) {
    super();
    this.searchRadius = searchRadius;
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 0;

    // Collect all other spatial objects from the state as obstacles
    const obstacleAABBs: Array<{ x0: number; z0: number; x1: number; z1: number }> = [];
    for (const [key, value] of state.entries()) {
      const keyStr = String(key);
      if (keyStr.startsWith('__spatial_')) {
        const otherId = keyStr.replace('__spatial_', '');
        if (ids.has(otherId)) continue; // Skip our own objects
        const other = value as SpatialObject;
        const aabb = getAABB(other);
        obstacleAABBs.push({
          x0: aabb.min[0],
          z0: aabb.min[2],
          x1: aabb.max[0],
          z1: aabb.max[2],
        });
      }
    }

    let totalFreespace = 0;
    const searchArea = Math.PI * this.searchRadius * this.searchRadius;

    for (const obj of objects) {
      const pos = toVec3(obj.position);
      let occupiedArea = 0;

      for (const obs of obstacleAABBs) {
        // Clip obstacle AABB to search circle (approximate as rectangle intersection)
        const clipX0 = Math.max(pos[0] - this.searchRadius, obs.x0);
        const clipZ0 = Math.max(pos[2] - this.searchRadius, obs.z0);
        const clipX1 = Math.min(pos[0] + this.searchRadius, obs.x1);
        const clipZ1 = Math.min(pos[2] + this.searchRadius, obs.z1);

        if (clipX0 < clipX1 && clipZ0 < clipZ1) {
          occupiedArea += (clipX1 - clipX0) * (clipZ1 - clipZ0);
        }
      }

      totalFreespace += Math.max(0, searchArea - occupiedArea);
    }

    return totalFreespace / objects.length;
  }

  clone(): ObjectFreespace2D {
    return new ObjectFreespace2D(
      this.obj.clone() as ObjectSetExpression,
      this.searchRadius
    );
  }

  toString(): string {
    return `freespace2D(${this.obj}, ${this.searchRadius})`;
  }
}

/**
 * Object Min Distance 2D — minimum 2D distance on the ground plane to any other object.
 *
 * Computes the minimum XZ-plane distance from each object in the set to any
 * other spatial object in the scene. This is useful for ensuring objects
 * aren't too close together without requiring an explicit "others" set.
 *
 * This differs from the existing MinDistance2D which takes explicit "others"
 * set. This version automatically scans all other objects in the state.
 */
export class ObjectMinDist2D extends GeometryPredicate {
  readonly type = 'ObjectMinDist2D';
  readonly predicateType = 'ObjectMinDist2D';

  constructor(public readonly obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return Infinity;

    // Collect positions of all other objects
    const otherPositions: Array<[number, number, number]> = [];
    for (const [key, value] of state.entries()) {
      const keyStr = String(key);
      if (keyStr.startsWith('__spatial_')) {
        const otherId = keyStr.replace('__spatial_', '');
        if (ids.has(otherId)) continue;
        const other = value as SpatialObject;
        otherPositions.push(toVec3(other.position));
      }
    }

    if (otherPositions.length === 0) return Infinity;

    let globalMinDist = Infinity;
    for (const obj of objects) {
      const pos = toVec3(obj.position);
      let minDist = Infinity;

      for (const otherPos of otherPositions) {
        const dx = pos[0] - otherPos[0];
        const dz = pos[2] - otherPos[2];
        const dist2d = Math.sqrt(dx * dx + dz * dz);
        if (dist2d < minDist) minDist = dist2d;
      }

      if (minDist < globalMinDist) globalMinDist = minDist;
    }

    return globalMinDist;
  }

  clone(): ObjectMinDist2D {
    return new ObjectMinDist2D(this.obj.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `minDist2D(${this.obj})`;
  }
}

/**
 * Object Rotational Asymmetry — measures rotational asymmetry of the object (0=symmetric, 1=asymmetric).
 *
 * Computes how asymmetrically the objects in the set are arranged around their
 * centroid on the XZ plane. A set of objects arranged in a regular polygon
 * pattern (e.g., 4 objects at corners of a square) would score 0 (symmetric),
 * while an irregular arrangement would score closer to 1.
 *
 * This is a single-object-set version that operates on the arrangement of
 * objects within the set, measuring how their positions deviate from
 * rotational symmetry around the set's centroid.
 */
export class ObjectRotationalAsymmetry extends GeometryPredicate {
  readonly type = 'ObjectRotationalAsymmetry';
  readonly predicateType = 'ObjectRotationalAsymmetry';

  /** Number of symmetry axes to test (e.g., 4 for 4-fold symmetry) */
  public readonly symmetryOrder: number;

  constructor(
    public readonly obj: ObjectSetExpression,
    symmetryOrder: number = 4
  ) {
    super();
    this.symmetryOrder = symmetryOrder;
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length <= 1) return 0; // Single object is trivially symmetric

    // Compute centroid
    let cx = 0, cz = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      cx += p[0];
      cz += p[2];
    }
    cx /= objects.length;
    cz /= objects.length;

    // For each symmetry fold, compute how well the set maps onto itself
    let totalAsymmetry = 0;
    const n = this.symmetryOrder;

    for (let k = 1; k < n; k++) {
      const angle = (2 * Math.PI * k) / n;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Rotate each object around centroid and find nearest match
      let foldAsymmetry = 0;

      for (const obj of objects) {
        const p = toVec3(obj.position);
        const dx = p[0] - cx;
        const dz = p[2] - cz;

        // Rotate
        const rx = cx + dx * cosA - dz * sinA;
        const rz = cz + dx * sinA + dz * cosA;

        // Find nearest original object to rotated position
        let minDist = Infinity;
        for (const other of objects) {
          const op = toVec3(other.position);
          const ddx = op[0] - rx;
          const ddz = op[2] - rz;
          const d = Math.sqrt(ddx * ddx + ddz * ddz);
          if (d < minDist) minDist = d;
        }

        foldAsymmetry += minDist;
      }

      totalAsymmetry += foldAsymmetry;
    }

    // Normalize by the number of folds and objects, and by a characteristic length
    // Use the average distance from centroid as the characteristic length
    let avgRadius = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      const dx = p[0] - cx;
      const dz = p[2] - cz;
      avgRadius += Math.sqrt(dx * dx + dz * dz);
    }
    avgRadius /= objects.length;

    if (avgRadius < 1e-10) return 0; // All at centroid = symmetric

    const normalizedAsymmetry = totalAsymmetry / ((n - 1) * objects.length * avgRadius);
    return Math.min(1, normalizedAsymmetry);
  }

  clone(): ObjectRotationalAsymmetry {
    return new ObjectRotationalAsymmetry(
      this.obj.clone() as ObjectSetExpression,
      this.symmetryOrder
    );
  }

  toString(): string {
    return `rotationalAsymmetry(${this.obj}, ${this.symmetryOrder})`;
  }
}

/**
 * Object Reflectional Asymmetry — measures reflectional asymmetry about a plane.
 *
 * Computes how asymmetric the object arrangement is when reflected about a
 * plane through the centroid. The reflection plane can be automatically
 * determined (long or short axis) or specified.
 *
 * Returns 0 for perfectly reflectionally symmetric arrangements,
 * and values approaching 1 for highly asymmetric ones.
 *
 * This differs from the existing ReflectionalAsymmetry which requires two
 * object sets and compares them. This version measures asymmetry of a single
 * set of objects.
 */
export class ObjectReflectionalAsymmetry extends GeometryPredicate {
  readonly type = 'ObjectReflectionalAsymmetry';
  readonly predicateType = 'ObjectReflectionalAsymmetry';

  /** Whether to use the plane perpendicular to the longest spread direction */
  public readonly useLongPlane: boolean;

  /** Optional reflection axis: 'x' or 'z'. If unset, auto-determined. */
  public readonly reflectionAxis?: 'x' | 'z';

  constructor(
    public readonly obj: ObjectSetExpression,
    useLongPlane: boolean = true,
    reflectionAxis?: 'x' | 'z'
  ) {
    super();
    this.useLongPlane = useLongPlane;
    this.reflectionAxis = reflectionAxis;
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length <= 1) return 0;

    // Compute centroid
    let cx = 0, cz = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      cx += p[0];
      cz += p[2];
    }
    cx /= objects.length;
    cz /= objects.length;

    // Determine reflection axis
    let reflectAlongX: boolean;
    if (this.reflectionAxis) {
      reflectAlongX = this.reflectionAxis === 'x';
    } else {
      // Auto-determine: reflect along the longer spread direction
      let spreadX = 0, spreadZ = 0;
      for (const obj of objects) {
        const p = toVec3(obj.position);
        spreadX += (p[0] - cx) ** 2;
        spreadZ += (p[2] - cz) ** 2;
      }
      // Reflection plane is perpendicular to the longer spread
      reflectAlongX = this.useLongPlane ? spreadX > spreadZ : spreadX <= spreadZ;
    }

    // Compute asymmetry: for each object, find nearest match to its reflection
    let totalAsymmetry = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      // Reflected position
      const rx = reflectAlongX ? 2 * cx - p[0] : p[0];
      const rz = reflectAlongX ? p[2] : 2 * cz - p[2];

      // Find closest object to reflected position
      let minDist = Infinity;
      for (const other of objects) {
        const op = toVec3(other.position);
        const ddx = op[0] - rx;
        const ddz = op[2] - rz;
        const d = Math.sqrt(ddx * ddx + ddz * ddz);
        if (d < minDist) minDist = d;
      }
      totalAsymmetry += minDist;
    }

    // Normalize by average distance from centroid
    let avgRadius = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      const dx = p[0] - cx;
      const dz = p[2] - cz;
      avgRadius += Math.sqrt(dx * dx + dz * dz);
    }
    avgRadius /= objects.length;

    if (avgRadius < 1e-10) return 0;

    return Math.min(1, totalAsymmetry / (objects.length * avgRadius));
  }

  clone(): ObjectReflectionalAsymmetry {
    return new ObjectReflectionalAsymmetry(
      this.obj.clone() as ObjectSetExpression,
      this.useLongPlane,
      this.reflectionAxis
    );
  }

  toString(): string {
    return `reflectionalAsymmetry(${this.obj})`;
  }
}

/**
 * Object Coplanarity Cost — cost of how much the object deviates from being
 * coplanar with a reference surface.
 *
 * Computes the mean squared deviation of object positions from a reference plane.
 * The reference plane can be:
 * - The ground plane (Y=0) by default
 * - A plane fitted through the object positions
 * - A specified reference plane from the state
 *
 * Returns 0 if all objects lie perfectly on the reference plane,
 * and increasing values for greater deviation.
 *
 * This differs from the existing CoplanarityCost which measures Y-position
 * variance within a set. This version allows specifying an external reference
 * surface and supports arbitrary plane orientations.
 */
export class ObjectCoplanarityCost extends GeometryPredicate {
  readonly type = 'ObjectCoplanarityCost';
  readonly predicateType = 'ObjectCoplanarityCost';

  /** Reference plane mode: 'ground' (Y=0), 'fitted' (best-fit plane), or 'reference' (from state) */
  public readonly planeMode: 'ground' | 'fitted' | 'reference';

  constructor(
    public readonly obj: ObjectSetExpression,
    planeMode: 'ground' | 'fitted' | 'reference' = 'ground'
  ) {
    super();
    this.planeMode = planeMode;
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 0;
    if (objects.length === 1) {
      // Single object: cost is distance from reference plane
      const p = toVec3(objects[0].position);
      if (this.planeMode === 'ground') return p[1] * p[1]; // Distance from Y=0
      return 0;
    }

    let planeNormal: [number, number, number];
    let planePoint: [number, number, number];

    if (this.planeMode === 'ground') {
      planeNormal = [0, 1, 0];
      planePoint = [0, 0, 0];
    } else if (this.planeMode === 'reference') {
      // Try to get reference plane from state
      const stateAny = state as Map<any, any>;
      const refPlane = stateAny.get('__referencePlane');
      if (refPlane) {
        planeNormal = normalize(toVec3(refPlane.normal ?? [0, 1, 0]));
        planePoint = toVec3(refPlane.point ?? [0, 0, 0]);
      } else {
        // Fallback to ground
        planeNormal = [0, 1, 0];
        planePoint = [0, 0, 0];
      }
    } else {
      // 'fitted': compute best-fit plane through the points using PCA
      // Compute centroid
      let cx = 0, cy = 0, cz = 0;
      for (const obj of objects) {
        const p = toVec3(obj.position);
        cx += p[0]; cy += p[1]; cz += p[2];
      }
      cx /= objects.length;
      cy /= objects.length;
      cz /= objects.length;
      planePoint = [cx, cy, cz];

      // Compute covariance matrix (simplified: only the normal direction)
      // For a proper PCA, we'd need eigendecomposition. Here we use a simpler
      // approach: find the direction of least variance.
      let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
      for (const obj of objects) {
        const p = toVec3(obj.position);
        const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
        xx += dx * dx; xy += dx * dy; xz += dx * dz;
        yy += dy * dy; yz += dy * dz; zz += dz * dz;
      }

      // The normal of the best-fit plane is the eigenvector corresponding
      // to the smallest eigenvalue of the covariance matrix.
      // Simplified: use the cross product of the two principal directions.
      // For simplicity, compute the normal as the direction with minimum spread.
      const spreadX = xx, spreadY = yy, spreadZ = zz;

      if (spreadX <= spreadY && spreadX <= spreadZ) {
        planeNormal = [1, 0, 0];
      } else if (spreadY <= spreadX && spreadY <= spreadZ) {
        planeNormal = [0, 1, 0];
      } else {
        planeNormal = [0, 0, 1];
      }
    }

    // Compute sum of squared distances from the reference plane
    let totalSqDist = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      // Signed distance = dot(P - planePoint, planeNormal)
      const dx = p[0] - planePoint[0];
      const dy = p[1] - planePoint[1];
      const dz = p[2] - planePoint[2];
      const dist = dx * planeNormal[0] + dy * planeNormal[1] + dz * planeNormal[2];
      totalSqDist += dist * dist;
    }

    // Return mean squared deviation
    return totalSqDist / objects.length;
  }

  clone(): ObjectCoplanarityCost {
    return new ObjectCoplanarityCost(
      this.obj.clone() as ObjectSetExpression,
      this.planeMode
    );
  }

  toString(): string {
    return `coplanarityCost(${this.obj}, ${this.planeMode})`;
  }
}

// ============================================================================
// Standalone Geometry Cost Functions
// Ported from infinigen/core/constraints/constraint_language/geometry.py
//
// These are direct-evaluation functions that take a GeometryContext and return
// a numeric cost/score. They mirror the Python API where functions like
// focusScore(context), angleAlignmentCost(context, targetAngle), etc. are
// called directly rather than constructing predicate class instances.
// ============================================================================

/**
 * GeometryContext — evaluation context for standalone geometry cost functions.
 *
 * Provides all the spatial data needed by the geometry functions: the object(s)
 * being evaluated, other objects in the scene, camera information, and the
 * variable state map for resolving ObjectSetExpressions.
 */
export interface GeometryContext {
  /** The primary object(s) being evaluated — resolved SpatialObject instances */
  objects: SpatialObject[];

  /** All other spatial objects in the scene (obstacles, neighbours, etc.) */
  others: SpatialObject[];

  /** Camera position (defaults to [0, 1, 5] if not provided) */
  cameraPosition?: [number, number, number];

  /** Camera forward direction (defaults to [0, 0, -1] if not provided) */
  cameraForward?: [number, number, number];

  /** Camera field-of-view in radians (defaults to π/3) */
  cameraFov?: number;

  /** Optional reference plane for coplanarity: { normal: [x,y,z], point: [x,y,z] } */
  referencePlane?: { normal: [number, number, number]; point: [number, number, number] };

  /** Optional variable state map for resolving ObjectSetExpressions */
  state?: Map<Variable, any>;
}

/**
 * focusScore — measures how centered/visible the object is in the camera view.
 *
 * Returns a value from 0 to 1 where:
 * - 1.0 = object is perfectly centered in the camera view and close
 * - 0.0 = object is outside the camera view or very far away
 *
 * Ported from: focusScore(context) in constraint_language/geometry.py
 */
export function focusScore(context: GeometryContext): number {
  const { objects } = context;
  if (objects.length === 0) return 0;

  const camPos: [number, number, number] = context.cameraPosition ?? [0, 1, 5];
  const camFwd: [number, number, number] = context.cameraForward
    ? normalize(context.cameraForward)
    : [0, 0, -1];
  const fov = context.cameraFov ?? Math.PI / 3;

  let maxScore = 0;
  for (const obj of objects) {
    const objPos = toVec3(obj.position);

    // Vector from camera to object
    const toObj: [number, number, number] = [
      objPos[0] - camPos[0],
      objPos[1] - camPos[1],
      objPos[2] - camPos[2],
    ];
    const dist = Math.sqrt(toObj[0] * toObj[0] + toObj[1] * toObj[1] + toObj[2] * toObj[2]);

    if (dist < 0.001) {
      maxScore = Math.max(maxScore, 1.0);
      continue;
    }

    // Normalize direction
    const dir: [number, number, number] = [toObj[0] / dist, toObj[1] / dist, toObj[2] / dist];

    // Angle from camera forward direction
    const cosAngle = dot(dir, camFwd);
    if (cosAngle <= 0) continue; // Behind camera

    const angle = Math.acos(Math.min(1, cosAngle));
    const halfFov = fov / 2;

    // Angular score: 1.0 at center, 0.0 at edge of FOV
    const angularScore = Math.max(0, 1 - angle / halfFov);
    if (angularScore <= 0) continue; // Outside FOV

    // Distance score: closer objects score higher
    const distScore = Math.max(0, 1 - dist / 50);

    // Combined score
    const score = angularScore * (0.7 + 0.3 * distScore);
    maxScore = Math.max(maxScore, score);
  }

  return Math.min(1, Math.max(0, maxScore));
}

/**
 * angleAlignmentCost — cost (0-1) of rotation deviation from a target angle.
 *
 * Returns 0.0 when the object's Y-axis rotation exactly matches the target,
 * and 1.0 when it is maximally misaligned (180° off).
 *
 * Ported from: angleAlignmentCost(context, targetAngle) in constraint_language/geometry.py
 */
export function angleAlignmentCost(context: GeometryContext, targetAngle: number): number {
  const { objects } = context;
  if (objects.length === 0) return 1;

  let totalCost = 0;
  for (const obj of objects) {
    const fwd = getForward(obj);

    // Compute the angle of the forward direction projected onto the XZ plane
    const fwdAngle = Math.atan2(fwd[2], fwd[0]);

    // Angular difference between object's rotation and target
    let angleDiff = fwdAngle - targetAngle;

    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Cost is normalized: 0 at 0° deviation, 1 at 180° deviation
    const cost = Math.abs(angleDiff) / Math.PI;
    totalCost += cost;
  }

  return Math.min(1, totalCost / objects.length);
}

/**
 * freespace2D — amount of 2D free space around the object on the ground plane.
 *
 * Computes the area of unoccupied space within a search radius around each
 * object on the XZ (ground) plane. Other objects in the context are treated
 * as obstacles.
 *
 * Ported from: freespace2D(context) in constraint_language/geometry.py
 */
export function freespace2D(context: GeometryContext): number {
  const { objects, others } = context;
  if (objects.length === 0) return 0;

  const searchRadius = 5.0;
  const searchArea = Math.PI * searchRadius * searchRadius;

  // Collect obstacle AABBs from context.others
  const obstacleAABBs: Array<{ x0: number; z0: number; x1: number; z1: number }> = [];
  for (const other of others) {
    const aabb = getAABB(other);
    obstacleAABBs.push({
      x0: aabb.min[0],
      z0: aabb.min[2],
      x1: aabb.max[0],
      z1: aabb.max[2],
    });
  }

  let totalFreespace = 0;
  for (const obj of objects) {
    const pos = toVec3(obj.position);
    let occupiedArea = 0;

    for (const obs of obstacleAABBs) {
      const clipX0 = Math.max(pos[0] - searchRadius, obs.x0);
      const clipZ0 = Math.max(pos[2] - searchRadius, obs.z0);
      const clipX1 = Math.min(pos[0] + searchRadius, obs.x1);
      const clipZ1 = Math.min(pos[2] + searchRadius, obs.z1);

      if (clipX0 < clipX1 && clipZ0 < clipZ1) {
        occupiedArea += (clipX1 - clipX0) * (clipZ1 - clipZ0);
      }
    }

    totalFreespace += Math.max(0, searchArea - occupiedArea);
  }

  return totalFreespace / objects.length;
}

/**
 * minDist2D — minimum 2D distance to any other object.
 *
 * Computes the minimum XZ-plane distance from each object in the set to any
 * other spatial object in the context.
 *
 * Ported from: minDist2D(context) in constraint_language/geometry.py
 */
export function minDist2D(context: GeometryContext): number {
  const { objects, others } = context;
  if (objects.length === 0 || others.length === 0) return Infinity;

  let globalMinDist = Infinity;
  for (const obj of objects) {
    const pos = toVec3(obj.position);
    let minDist = Infinity;

    for (const other of others) {
      const otherPos = toVec3(other.position);
      const dx = pos[0] - otherPos[0];
      const dz = pos[2] - otherPos[2];
      const dist2d = Math.sqrt(dx * dx + dz * dz);
      if (dist2d < minDist) minDist = dist2d;
    }

    if (minDist < globalMinDist) globalMinDist = minDist;
  }

  return globalMinDist;
}

/**
 * rotationalAsymmetry — measures rotational asymmetry (0=symmetric, 1=asymmetric).
 *
 * Computes how asymmetrically the objects are arranged around their centroid
 * on the XZ plane. A regular polygon arrangement scores 0; irregular arrangements
 * approach 1.
 *
 * Ported from: rotationalAsymmetry(context) in constraint_language/geometry.py
 */
export function rotationalAsymmetry(context: GeometryContext): number {
  const { objects } = context;
  if (objects.length <= 1) return 0;

  // Compute centroid
  let cx = 0, cz = 0;
  for (const obj of objects) {
    const p = toVec3(obj.position);
    cx += p[0]; cz += p[2];
  }
  cx /= objects.length;
  cz /= objects.length;

  // For each symmetry fold, compute how well the set maps onto itself
  const symmetryOrder = Math.max(2, Math.min(objects.length, 8));
  let totalAsymmetry = 0;

  for (let k = 1; k < symmetryOrder; k++) {
    const angle = (2 * Math.PI * k) / symmetryOrder;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let foldAsymmetry = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      const dx = p[0] - cx;
      const dz = p[2] - cz;

      // Rotate
      const rx = cx + dx * cosA - dz * sinA;
      const rz = cz + dx * sinA + dz * cosA;

      // Find nearest original object to rotated position
      let minDist = Infinity;
      for (const other of objects) {
        const op = toVec3(other.position);
        const ddx = op[0] - rx;
        const ddz = op[2] - rz;
        const d = Math.sqrt(ddx * ddx + ddz * ddz);
        if (d < minDist) minDist = d;
      }
      foldAsymmetry += minDist;
    }
    totalAsymmetry += foldAsymmetry;
  }

  // Normalize by characteristic length
  let avgRadius = 0;
  for (const obj of objects) {
    const p = toVec3(obj.position);
    const dx = p[0] - cx;
    const dz = p[2] - cz;
    avgRadius += Math.sqrt(dx * dx + dz * dz);
  }
  avgRadius /= objects.length;

  if (avgRadius < 1e-10) return 0;

  const normalizedAsymmetry = totalAsymmetry / ((symmetryOrder - 1) * objects.length * avgRadius);
  return Math.min(1, normalizedAsymmetry);
}

/**
 * reflectionalAsymmetry — measures reflectional asymmetry about a plane.
 *
 * Computes how asymmetric the object arrangement is when reflected about a
 * plane through the centroid. Returns 0 for perfectly reflectionally symmetric
 * arrangements, and values approaching 1 for highly asymmetric ones.
 *
 * Ported from: reflectionalAsymmetry(context) in constraint_language/geometry.py
 */
export function reflectionalAsymmetry(context: GeometryContext): number {
  const { objects } = context;
  if (objects.length <= 1) return 0;

  // Compute centroid
  let cx = 0, cz = 0;
  for (const obj of objects) {
    const p = toVec3(obj.position);
    cx += p[0]; cz += p[2];
  }
  cx /= objects.length;
  cz /= objects.length;

  // Auto-determine reflection axis: reflect along the longer spread direction
  let spreadX = 0, spreadZ = 0;
  for (const obj of objects) {
    const p = toVec3(obj.position);
    spreadX += (p[0] - cx) ** 2;
    spreadZ += (p[2] - cz) ** 2;
  }
  const reflectAlongX = spreadX > spreadZ;

  // Compute asymmetry: for each object, find nearest match to its reflection
  let totalAsymmetry = 0;
  for (const obj of objects) {
    const p = toVec3(obj.position);
    // Reflected position
    const rx = reflectAlongX ? 2 * cx - p[0] : p[0];
    const rz = reflectAlongX ? p[2] : 2 * cz - p[2];

    // Find closest object to reflected position
    let minDist = Infinity;
    for (const other of objects) {
      const op = toVec3(other.position);
      const ddx = op[0] - rx;
      const ddz = op[2] - rz;
      const d = Math.sqrt(ddx * ddx + ddz * ddz);
      if (d < minDist) minDist = d;
    }
    totalAsymmetry += minDist;
  }

  // Normalize by average distance from centroid
  let avgRadius = 0;
  for (const obj of objects) {
    const p = toVec3(obj.position);
    const dx = p[0] - cx;
    const dz = p[2] - cz;
    avgRadius += Math.sqrt(dx * dx + dz * dz);
  }
  avgRadius /= objects.length;

  if (avgRadius < 1e-10) return 0;

  return Math.min(1, totalAsymmetry / (objects.length * avgRadius));
}

/**
 * coplanarityCost — cost of deviation from coplanarity with reference surface.
 *
 * Computes the mean squared deviation of object positions from a reference plane.
 * The reference plane defaults to the ground plane (Y=0) but can be:
 * - 'ground': Y=0 plane
 * - 'fitted': best-fit plane through the object positions
 * - 'reference': a plane specified in the context
 *
 * Returns 0 if all objects lie perfectly on the reference plane.
 *
 * Ported from: coplanarityCost(context) in constraint_language/geometry.py
 */
export function coplanarityCost(
  context: GeometryContext,
  planeMode: 'ground' | 'fitted' | 'reference' = 'ground'
): number {
  const { objects } = context;
  if (objects.length === 0) return 0;
  if (objects.length === 1) {
    const p = toVec3(objects[0].position);
    if (planeMode === 'ground') return p[1] * p[1];
    return 0;
  }

  let planeNormal: [number, number, number];
  let planePoint: [number, number, number];

  if (planeMode === 'ground') {
    planeNormal = [0, 1, 0];
    planePoint = [0, 0, 0];
  } else if (planeMode === 'reference') {
    if (context.referencePlane) {
      planeNormal = normalize(context.referencePlane.normal);
      planePoint = context.referencePlane.point;
    } else {
      // Fallback to ground
      planeNormal = [0, 1, 0];
      planePoint = [0, 0, 0];
    }
  } else {
    // 'fitted': compute best-fit plane through the points
    let cx = 0, cy = 0, cz = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      cx += p[0]; cy += p[1]; cz += p[2];
    }
    cx /= objects.length;
    cy /= objects.length;
    cz /= objects.length;
    planePoint = [cx, cy, cz];

    // Find direction of minimum spread (simplified PCA)
    let xx = 0, yy = 0, zz = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
      xx += dx * dx; yy += dy * dy; zz += dz * dz;
    }

    if (xx <= yy && xx <= zz) {
      planeNormal = [1, 0, 0];
    } else if (yy <= xx && yy <= zz) {
      planeNormal = [0, 1, 0];
    } else {
      planeNormal = [0, 0, 1];
    }
  }

  // Compute sum of squared distances from the reference plane
  let totalSqDist = 0;
  for (const obj of objects) {
    const p = toVec3(obj.position);
    const dx = p[0] - planePoint[0];
    const dy = p[1] - planePoint[1];
    const dz = p[2] - planePoint[2];
    const dist = dx * planeNormal[0] + dy * planeNormal[1] + dz * planeNormal[2];
    totalSqDist += dist * dist;
  }

  return totalSqDist / objects.length;
}
