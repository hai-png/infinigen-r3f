/**
 * Terrain Constraint System
 * 
 * Ports core constraint functionality from Infinigen's constraint system
 * for controlling terrain generation parameters and relationships.
 */

import { Vector3, Box3 } from 'three';

/**
 * Base constraint types for terrain generation
 */
export type ConstraintType = 
  | 'elevation'
  | 'slope'
  | 'aspect'
  | 'curvature'
  | 'distance'
  | 'region'
  | 'biome'
  | 'erosion'
  | 'tectonic';

/**
 * Comparison operators for constraints
 */
export type ComparisonOp = 
  | 'equals'
  | 'notEquals'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'between'
  | 'outside';

/**
 * Logical operators for combining constraints
 */
export type LogicalOp = 'and' | 'or' | 'not' | 'xor';

/**
 * Base constraint interface
 */
export interface TerrainConstraint {
  type: ConstraintType;
  id?: string;
  weight?: number;
  enabled?: boolean;
}

/**
 * Elevation constraint - controls height values
 */
export interface ElevationConstraint extends TerrainConstraint {
  type: 'elevation';
  operator: ComparisonOp;
  value: number | [number, number];
  falloff?: 'linear' | 'smooth' | 'step';
  falloffWidth?: number;
}

/**
 * Slope constraint - controls terrain steepness
 */
export interface SlopeConstraint extends TerrainConstraint {
  type: 'slope';
  operator: ComparisonOp;
  value: number | [number, number]; // in degrees or radians
  falloff?: 'linear' | 'smooth' | 'step';
  falloffWidth?: number;
}

/**
 * Aspect constraint - controls slope direction (compass orientation)
 */
export interface AspectConstraint extends TerrainConstraint {
  type: 'aspect';
  operator: ComparisonOp;
  value: number | [number, number]; // in degrees (0-360)
  falloff?: 'linear' | 'smooth' | 'step';
  falloffWidth?: number;
}

/**
 * Curvature constraint - controls surface convexity/concavity
 */
export interface CurvatureConstraint extends TerrainConstraint {
  type: 'curvature';
  operator: ComparisonOp;
  value: number | [number, number];
  curvatureType?: 'profile' | 'plan' | 'tangential';
  falloff?: 'linear' | 'smooth' | 'step';
  falloffWidth?: number;
}

/**
 * Distance constraint - controls distance from point/line/area
 */
export interface DistanceConstraint extends TerrainConstraint {
  type: 'distance';
  operator: ComparisonOp;
  value: number | [number, number];
  from: Vector3 | Vector3[] | Box3;
  distanceType?: 'euclidean' | 'manhattan' | 'chebyshev';
  falloff?: 'linear' | 'smooth' | 'step';
  falloffWidth?: number;
}

/**
 * Region constraint - constrains to specific spatial region
 */
export interface RegionConstraint extends TerrainConstraint {
  type: 'region';
  region: Box3 | Polygon;
  inside: boolean;
  falloff?: 'linear' | 'smooth' | 'step';
  falloffWidth?: number;
}

/**
 * Biome constraint - constrains based on biome masks
 */
export interface BiomeConstraint extends TerrainConstraint {
  type: 'biome';
  biomeIds: string[];
  operator: 'in' | 'notIn';
  falloff?: 'linear' | 'smooth' | 'step';
  falloffWidth?: number;
}

/**
 * Erosion constraint - controls erosion intensity
 */
export interface ErosionConstraint extends TerrainConstraint {
  type: 'erosion';
  operator: ComparisonOp;
  value: number | [number, number];
  erosionType?: 'hydraulic' | 'thermal' | 'wind';
  falloff?: 'linear' | 'smooth' | 'step';
  falloffWidth?: number;
}

/**
 * Tectonic constraint - controls tectonic plate influence
 */
export interface TectonicConstraint extends TerrainConstraint {
  type: 'tectonic';
  operator: ComparisonOp;
  value: number | [number, number];
  plateId?: number;
  falloff?: 'linear' | 'smooth' | 'step';
  falloffWidth?: number;
}

/**
 * Polygon definition for region constraints
 */
export interface Polygon {
  vertices: Vector3[];
  plane?: Vector3; // normal vector, defaults to Y-up
}

/**
 * Composite constraint for logical operations
 */
export interface CompositeConstraint extends TerrainConstraint {
  type: 'composite';
  operator: LogicalOp;
  children: TerrainConstraint[];
}

/**
 * Constraint mask output
 */
export interface ConstraintMask {
  data: Float32Array;
  width: number;
  height: number;
  bounds: Box3;
}

/**
 * Constraint evaluator class
 */
export class ConstraintEvaluator {
  private constraints: Map<string, TerrainConstraint>;

  constructor() {
    this.constraints = new Map();
  }

  /**
   * Add a constraint to the evaluator
   */
  addConstraint(constraint: TerrainConstraint): void {
    const id = constraint.id || `constraint_${this.constraints.size}`;
    this.constraints.set(id, { ...constraint, id });
  }

  /**
   * Remove a constraint by ID
   */
  removeConstraint(id: string): boolean {
    return this.constraints.delete(id);
  }

  /**
   * Get a constraint by ID
   */
  getConstraint(id: string): TerrainConstraint | undefined {
    return this.constraints.get(id);
  }

  /**
   * Evaluate all constraints and produce a combined mask
   */
  evaluate(
    width: number,
    height: number,
    bounds: Box3,
    elevationData?: Float32Array,
    normalData?: Float32Array
  ): ConstraintMask {
    const mask = new Float32Array(width * height);
    const totalWeight = 0;

    for (const constraint of this.constraints.values()) {
      if (!constraint.enabled) continue;

      const weight = constraint.weight ?? 1.0;
      const constraintMask = this.evaluateSingleConstraint(
        constraint,
        width,
        height,
        bounds,
        elevationData,
        normalData
      );

      // Combine with existing mask
      for (let i = 0; i < mask.length; i++) {
        mask[i] += constraintMask.data[i] * weight;
      }
    }

    // Normalize if needed
    if (totalWeight > 0) {
      for (let i = 0; i < mask.length; i++) {
        mask[i] /= totalWeight;
      }
    }

    return { data: mask, width, height, bounds };
  }

  /**
   * Evaluate a single constraint
   */
  private evaluateSingleConstraint(
    constraint: TerrainConstraint,
    width: number,
    height: number,
    bounds: Box3,
    elevationData?: Float32Array,
    normalData?: Float32Array
  ): ConstraintMask {
    const mask = new Float32Array(width * height);

    switch (constraint.type) {
      case 'elevation':
        this.evaluateElevation(constraint as ElevationConstraint, mask, width, height, bounds, elevationData);
        break;
      case 'slope':
        this.evaluateSlope(constraint as SlopeConstraint, mask, width, height, bounds, normalData);
        break;
      case 'aspect':
        this.evaluateAspect(constraint as AspectConstraint, mask, width, height, bounds, normalData);
        break;
      case 'curvature':
        this.evaluateCurvature(constraint as CurvatureConstraint, mask, width, height, bounds, elevationData);
        break;
      case 'distance':
        this.evaluateDistance(constraint as DistanceConstraint, mask, width, height, bounds);
        break;
      case 'region':
        this.evaluateRegion(constraint as RegionConstraint, mask, width, height, bounds);
        break;
      case 'biome':
        this.evaluateBiome(constraint as BiomeConstraint, mask, width, height, bounds);
        break;
      case 'erosion':
        this.evaluateErosion(constraint as ErosionConstraint, mask, width, height, bounds, elevationData);
        break;
      case 'tectonic':
        this.evaluateTectonic(constraint as TectonicConstraint, mask, width, height, bounds, elevationData);
        break;
      case 'composite':
        return this.evaluateComposite(constraint as CompositeConstraint, width, height, bounds, elevationData, normalData);
      default:
        mask.fill(1);
    }

    return { data: mask, width, height, bounds };
  }

  /**
   * Evaluate elevation constraint
   */
  private evaluateElevation(
    constraint: ElevationConstraint,
    mask: Float32Array,
    width: number,
    height: number,
    bounds: Box3,
    elevationData?: Float32Array
  ): void {
    if (!elevationData) {
      mask.fill(0.5);
      return;
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const elevation = elevationData[idx];
        mask[idx] = this.compareValue(elevation, constraint.operator, constraint.value, constraint.falloffWidth || 0.1);
      }
    }
  }

  /**
   * Evaluate slope constraint
   */
  private evaluateSlope(
    constraint: SlopeConstraint,
    mask: Float32Array,
    width: number,
    height: number,
    bounds: Box3,
    normalData?: Float32Array
  ): void {
    if (!normalData) {
      mask.fill(0.5);
      return;
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const nIdx = idx * 3;
        const normal = new Vector3(normalData[nIdx], normalData[nIdx + 1], normalData[nIdx + 2]);
        
        // Calculate slope angle from normal (angle from vertical)
        const slopeAngle = Math.acos(Math.abs(normal.y)) * (180 / Math.PI);
        
        mask[idx] = this.compareValue(slopeAngle, constraint.operator, constraint.value, constraint.falloffWidth || 5);
      }
    }
  }

  /**
   * Evaluate aspect constraint
   */
  private evaluateAspect(
    constraint: AspectConstraint,
    mask: Float32Array,
    width: number,
    height: number,
    bounds: Box3,
    normalData?: Float32Array
  ): void {
    if (!normalData) {
      mask.fill(0.5);
      return;
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const nIdx = idx * 3;
        const normal = new Vector3(normalData[nIdx], normalData[nIdx + 1], normalData[nIdx + 2]);
        
        // Calculate aspect (compass direction) from normal
        const aspect = Math.atan2(normal.x, -normal.z) * (180 / Math.PI);
        const normalizedAspect = aspect < 0 ? aspect + 360 : aspect;
        
        mask[idx] = this.compareValue(normalizedAspect, constraint.operator, constraint.value, constraint.falloffWidth || 10);
      }
    }
  }

  /**
   * Evaluate curvature constraint
   */
  private evaluateCurvature(
    constraint: CurvatureConstraint,
    mask: Float32Array,
    width: number,
    height: number,
    bounds: Box3,
    elevationData?: Float32Array
  ): void {
    if (!elevationData) {
      mask.fill(0.5);
      return;
    }

    // Simplified curvature calculation using finite differences
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Second derivatives for curvature
        const dxx = elevationData[y * width + (x + 1)] - 2 * elevationData[idx] + elevationData[y * width + (x - 1)];
        const dyy = elevationData[(y + 1) * width + x] - 2 * elevationData[idx] + elevationData[(y - 1) * width + x];
        
        let curvature: number;
        if (constraint.curvatureType === 'plan') {
          curvature = dxx;
        } else if (constraint.curvatureType === 'profile') {
          curvature = dyy;
        } else {
          curvature = dxx + dyy; // Mean curvature
        }
        
        mask[idx] = this.compareValue(curvature, constraint.operator, constraint.value, constraint.falloffWidth || 0.01);
      }
    }
  }

  /**
   * Evaluate distance constraint
   */
  private evaluateDistance(
    constraint: DistanceConstraint,
    mask: Float32Array,
    width: number,
    height: number,
    bounds: Box3
  ): void {
    const size = bounds.getSize(new Vector3());

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        const worldX = bounds.min.x + (x / width) * size.x;
        const worldZ = bounds.min.z + (y / height) * size.z;
        const pos = new Vector3(worldX, 0, worldZ);
        
        let distance: number;
        
        if (constraint.from instanceof Vector3) {
          distance = this.calculateDistance(pos, constraint.from, constraint.distanceType);
        } else if (constraint.from instanceof Array) {
          // Distance to polyline
          distance = Infinity;
          for (let i = 0; i < constraint.from.length - 1; i++) {
            const dist = this.distanceToLineSegment(pos, constraint.from[i], constraint.from[i + 1]);
            distance = Math.min(distance, dist);
          }
        } else if (constraint.from instanceof Box3) {
          distance = this.distanceToBox(pos, constraint.from);
        } else {
          distance = 0;
        }
        
        mask[idx] = this.compareValue(distance, constraint.operator, constraint.value, constraint.falloffWidth || 1);
      }
    }
  }

  /**
   * Evaluate region constraint
   */
  private evaluateRegion(
    constraint: RegionConstraint,
    mask: Float32Array,
    width: number,
    height: number,
    bounds: Box3
  ): void {
    const size = bounds.getSize(new Vector3());

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        const worldX = bounds.min.x + (x / width) * size.x;
        const worldZ = bounds.min.z + (y / height) * size.z;
        const pos = new Vector3(worldX, 0, worldZ);
        
        let inside: boolean;
        
        if (constraint.region instanceof Box3) {
          inside = constraint.region.containsPoint(pos);
        } else {
          inside = this.pointInPolygon(pos, constraint.region);
        }
        
        mask[idx] = constraint.inside ? (inside ? 1 : 0) : (inside ? 0 : 1);
      }
    }
  }

  /**
   * Evaluate biome constraint
   */
  private evaluateBiome(
    constraint: BiomeConstraint,
    mask: Float32Array,
    width: number,
    height: number,
    bounds: Box3
  ): void {
    // Placeholder - would need biome data integration
    mask.fill(0.5);
  }

  /**
   * Evaluate erosion constraint
   */
  private evaluateErosion(
    constraint: ErosionConstraint,
    mask: Float32Array,
    width: number,
    height: number,
    bounds: Box3,
    elevationData?: Float32Array
  ): void {
    // Placeholder - would need erosion simulation data
    mask.fill(0.5);
  }

  /**
   * Evaluate tectonic constraint
   */
  private evaluateTectonic(
    constraint: TectonicConstraint,
    mask: Float32Array,
    width: number,
    height: number,
    bounds: Box3,
    elevationData?: Float32Array
  ): void {
    // Placeholder - would need tectonic simulation data
    mask.fill(0.5);
  }

  /**
   * Evaluate composite constraint
   */
  private evaluateComposite(
    constraint: CompositeConstraint,
    width: number,
    height: number,
    bounds: Box3,
    elevationData?: Float32Array,
    normalData?: Float32Array
  ): ConstraintMask {
    const childMasks = constraint.children.map(child =>
      this.evaluateSingleConstraint(child, width, height, bounds, elevationData, normalData)
    );

    const mask = new Float32Array(width * height);

    for (let i = 0; i < mask.length; i++) {
      let result: number;

      switch (constraint.operator) {
        case 'and':
          result = Math.min(...childMasks.map(m => m.data[i]));
          break;
        case 'or':
          result = Math.max(...childMasks.map(m => m.data[i]));
          break;
        case 'not':
          result = 1 - (childMasks[0]?.data[i] || 0);
          break;
        case 'xor':
          result = childMasks.reduce((acc, m) => acc + m.data[i], 0) % 2;
          break;
        default:
          result = 0;
      }

      mask[i] = result;
    }

    return { data: mask, width, height, bounds };
  }

  /**
   * Compare value against constraint
   */
  private compareValue(
    actual: number,
    operator: ComparisonOp,
    target: number | [number, number],
    falloffWidth: number
  ): number {
    let result: number;

    switch (operator) {
      case 'equals':
        result = 1 - Math.min(Math.abs(actual - (target as number)) / falloffWidth, 1);
        break;
      case 'notEquals':
        result = Math.min(Math.abs(actual - (target as number)) / falloffWidth, 1);
        break;
      case 'lessThan':
        result = actual < (target as number) ? 1 : Math.max(1 - (actual - (target as number)) / falloffWidth, 0);
        break;
      case 'lessThanOrEqual':
        result = actual <= (target as number) ? 1 : Math.max(1 - (actual - (target as number)) / falloffWidth, 0);
        break;
      case 'greaterThan':
        result = actual > (target as number) ? 1 : Math.max(1 - ((target as number) - actual) / falloffWidth, 0);
        break;
      case 'greaterThanOrEqual':
        result = actual >= (target as number) ? 1 : Math.max(1 - ((target as number) - actual) / falloffWidth, 0);
        break;
      case 'between':
        const [min, max] = target as [number, number];
        if (actual >= min && actual <= max) {
          result = 1;
        } else if (actual < min) {
          result = Math.max(1 - (min - actual) / falloffWidth, 0);
        } else {
          result = Math.max(1 - (actual - max) / falloffWidth, 0);
        }
        break;
      case 'outside':
        const [omin, omax] = target as [number, number];
        if (actual < omin || actual > omax) {
          result = 1;
        } else {
          result = Math.max(1 - Math.min(omin - actual, actual - omax) / falloffWidth, 0);
        }
        break;
      default:
        result = 0;
    }

    return Math.max(0, Math.min(1, result));
  }

  /**
   * Calculate distance between two points
   */
  private calculateDistance(a: Vector3, b: Vector3, type?: 'euclidean' | 'manhattan' | 'chebyshev'): number {
    switch (type) {
      case 'manhattan':
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
      case 'chebyshev':
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
      case 'euclidean':
      default:
        return a.distanceTo(b);
    }
  }

  /**
   * Distance from point to line segment
   */
  private distanceToLineSegment(point: Vector3, a: Vector3, b: Vector3): number {
    const ab = new Vector3().subVectors(b, a);
    const ap = new Vector3().subVectors(point, a);
    
    let t = ap.dot(ab) / ab.lengthSq();
    t = Math.max(0, Math.min(1, t));
    
    const closest = new Vector3().addVectors(a, ab.clone().multiplyScalar(t));
    return point.distanceTo(closest);
  }

  /**
   * Distance from point to box
   */
  private distanceToBox(point: Vector3, box: Box3): number {
    const closest = box.clampPoint(point, new Vector3());
    return point.distanceTo(closest);
  }

  /**
   * Check if point is inside polygon (2D)
   */
  private pointInPolygon(point: Vector3, polygon: Polygon): boolean {
    const { vertices, plane = new Vector3(0, 1, 0) } = polygon;
    
    // Ray casting algorithm
    let inside = false;
    
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, zi = vertices[i].z;
      const xj = vertices[j].x, zj = vertices[j].z;
      
      if (((zi > point.z) !== (zj > point.z)) &&
          (point.x < (xj - xi) * (point.z - zi) / (zj - zi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  }

  /**
   * Clear all constraints
   */
  clear(): void {
    this.constraints.clear();
  }

  /**
   * Get all constraints
   */
  getAllConstraints(): TerrainConstraint[] {
    return Array.from(this.constraints.values());
  }

  /**
   * Enable/disable constraint
   */
  setConstraintEnabled(id: string, enabled: boolean): boolean {
    const constraint = this.constraints.get(id);
    if (constraint) {
      constraint.enabled = enabled;
      this.constraints.set(id, constraint);
      return true;
    }
    return false;
  }

  /**
   * Update constraint weight
   */
  setConstraintWeight(id: string, weight: number): boolean {
    const constraint = this.constraints.get(id);
    if (constraint) {
      constraint.weight = weight;
      this.constraints.set(id, constraint);
      return true;
    }
    return false;
  }
}

/**
 * Factory functions for creating constraints
 */
export const Constraints = {
  elevation: (operator: ComparisonOp, value: number | [number, number], options?: Partial<ElevationConstraint>): ElevationConstraint => ({
    type: 'elevation',
    operator,
    value,
    ...options,
  }),

  slope: (operator: ComparisonOp, value: number | [number, number], options?: Partial<SlopeConstraint>): SlopeConstraint => ({
    type: 'slope',
    operator,
    value,
    ...options,
  }),

  aspect: (operator: ComparisonOp, value: number | [number, number], options?: Partial<AspectConstraint>): AspectConstraint => ({
    type: 'aspect',
    operator,
    value,
    ...options,
  }),

  curvature: (operator: ComparisonOp, value: number | [number, number], options?: Partial<CurvatureConstraint>): CurvatureConstraint => ({
    type: 'curvature',
    operator,
    value,
    ...options,
  }),

  distance: (from: Vector3 | Vector3[] | Box3, operator: ComparisonOp, value: number | [number, number], options?: Partial<DistanceConstraint>): DistanceConstraint => ({
    type: 'distance',
    from,
    operator,
    value,
    ...options,
  }),

  region: (region: Box3 | Polygon, inside: boolean, options?: Partial<RegionConstraint>): RegionConstraint => ({
    type: 'region',
    region,
    inside,
    ...options,
  }),

  biome: (biomeIds: string[], operator: 'in' | 'notIn', options?: Partial<BiomeConstraint>): BiomeConstraint => ({
    type: 'biome',
    biomeIds,
    operator,
    ...options,
  }),

  erosion: (operator: ComparisonOp, value: number | [number, number], options?: Partial<ErosionConstraint>): ErosionConstraint => ({
    type: 'erosion',
    operator,
    value,
    ...options,
  }),

  tectonic: (operator: ComparisonOp, value: number | [number, number], options?: Partial<TectonicConstraint>): TectonicConstraint => ({
    type: 'tectonic',
    operator,
    value,
    ...options,
  }),

  and: (...children: TerrainConstraint[]): CompositeConstraint => ({
    type: 'composite',
    operator: 'and',
    children,
  }),

  or: (...children: TerrainConstraint[]): CompositeConstraint => ({
    type: 'composite',
    operator: 'or',
    children,
  }),

  not: (constraint: TerrainConstraint): CompositeConstraint => ({
    type: 'composite',
    operator: 'not',
    children: [constraint],
  }),

  xor: (...children: TerrainConstraint[]): CompositeConstraint => ({
    type: 'composite',
    operator: 'xor',
    children,
  }),
};

export default ConstraintEvaluator;
