/**
 * Domain - Domain type definitions for constraint reasoning
 * 
 * Ported from: infinigen/core/constraints/reasoning/domain.py
 * Defines the Domain class hierarchy used for variable domain analysis.
 */

import { Node, Variable } from '../language/types';

/**
 * Base Domain class - represents the domain of a variable in constraint solving
 */
export abstract class Domain extends Node {
  abstract readonly type: string;
  
  children(): Map<string, Node> {
    return new Map();
  }
  
  /**
   * Check if a value is contained in this domain
   */
  abstract contains(value: any): boolean;
  
  /**
   * Get the size/cardinality of this domain
   */
  abstract size(): number;
  
  /**
   * Intersect with another domain
   */
  abstract intersect(other: Domain): Domain;
  
  /**
   * Check if this domain is a subset of another
   */
  abstract isSubsetOf(other: Domain): boolean;
  
  /**
   * Substitute a variable with a known value
   */
  abstract substitute(variable: Variable, value: any): Domain;

  /**
   * Sample a random value from this domain
   */
  abstract sample(seed?: number): any;

  /**
   * Check if this domain intersects with another
   */
  abstract intersects(other: Domain): boolean;
}

/**
 * Domain type enumeration
 */
export enum DomainType {
  ObjectSet = 'ObjectSet',
  Numeric = 'Numeric',
  Boolean = 'Boolean',
  Pose = 'Pose',
  BBox = 'BBox',
  Tag = 'Tag',
  Relation = 'Relation',
}

// ─── Concrete Domain Classes ────────────────────────────────────────────────

/**
 * BoxDomain - Represents an axis-aligned 3D bounding box domain.
 *
 * Useful for spatial constraints where objects must lie within a
 * rectangular region (e.g. a room floor, a shelf, a tabletop).
 */
export class BoxDomain extends Domain {
  readonly type = 'BoxDomain';

  /** Lower corner of the box [x, y, z] */
  readonly min: [number, number, number];
  /** Upper corner of the box [x, y, z] */
  readonly max: [number, number, number];

  constructor(
    min: [number, number, number] = [-Infinity, -Infinity, -Infinity],
    max: [number, number, number] = [Infinity, Infinity, Infinity],
  ) {
    super();
    this.min = [...min];
    this.max = [...max];
  }

  contains(value: any): boolean {
    const [x, y, z] = toVec3(value);
    return (
      x >= this.min[0] && x <= this.max[0] &&
      y >= this.min[1] && y <= this.max[1] &&
      z >= this.min[2] && z <= this.max[2]
    );
  }

  size(): number {
    const vol =
      (this.max[0] - this.min[0]) *
      (this.max[1] - this.min[1]) *
      (this.max[2] - this.min[2]);
    return isFinite(vol) ? vol : Infinity;
  }

  intersect(other: Domain): Domain {
    if (!(other instanceof BoxDomain)) return this;
    return new BoxDomain(
      [
        Math.max(this.min[0], other.min[0]),
        Math.max(this.min[1], other.min[1]),
        Math.max(this.min[2], other.min[2]),
      ],
      [
        Math.min(this.max[0], other.max[0]),
        Math.min(this.max[1], other.max[1]),
        Math.min(this.max[2], other.max[2]),
      ],
    );
  }

  intersects(other: Domain): boolean {
    if (!(other instanceof BoxDomain)) return false;
    for (let i = 0; i < 3; i++) {
      if (this.min[i] > other.max[i] || this.max[i] < other.min[i]) return false;
    }
    return true;
  }

  isSubsetOf(other: Domain): boolean {
    if (!(other instanceof BoxDomain)) return false;
    for (let i = 0; i < 3; i++) {
      if (this.min[i] < other.min[i] || this.max[i] > other.max[i]) return false;
    }
    return true;
  }

  substitute(_variable: Variable, _value: any): Domain {
    return this; // BoxDomain has no free variables
  }

  sample(seed?: number): [number, number, number] {
    return [
      sampleRange(this.min[0], this.max[0], seed ?? 0),
      sampleRange(this.min[1], this.max[1], (seed ?? 0) + 1),
      sampleRange(this.min[2], this.max[2], (seed ?? 0) + 2),
    ];
  }

  clone(): BoxDomain {
    return new BoxDomain([...this.min] as [number, number, number], [...this.max] as [number, number, number]);
  }

  /** Compute the center point */
  center(): [number, number, number] {
    return [
      (this.min[0] + this.max[0]) / 2,
      (this.min[1] + this.max[1]) / 2,
      (this.min[2] + this.max[2]) / 2,
    ];
  }

  /** Compute the dimensions */
  dimensions(): [number, number, number] {
    return [
      this.max[0] - this.min[0],
      this.max[1] - this.min[1],
      this.max[2] - this.min[2],
    ];
  }
}

/**
 * SurfaceDomain - Represents a 2D surface within a 3D space.
 *
 * Models planar surfaces such as floors, walls, tabletops, and shelves.
 * A surface is defined by its parent BoxDomain (the bounding box of the
 * surface), a plane normal, and an offset along that normal.
 */
export class SurfaceDomain extends Domain {
  readonly type = 'SurfaceDomain';

  /** Bounding box of the surface region */
  readonly bounds: BoxDomain;
  /** Normal axis: 0=X, 1=Y, 2=Z */
  readonly normalAxis: 0 | 1 | 2;
  /** Position along the normal axis (e.g. Y for a floor) */
  readonly offset: number;
  /** Thickness of the surface for contains checks */
  readonly thickness: number;

  constructor(
    bounds: BoxDomain,
    normalAxis: 0 | 1 | 2 = 1,
    offset: number = 0,
    thickness: number = 0.01,
  ) {
    super();
    this.bounds = bounds;
    this.normalAxis = normalAxis;
    this.offset = offset;
    this.thickness = thickness;
  }

  contains(value: any): boolean {
    const [x, y, z] = toVec3(value);
    // Check if the point lies on the surface plane
    const normalCoord = [x, y, z][this.normalAxis];
    if (Math.abs(normalCoord - this.offset) > this.thickness) return false;
    // Check if the point is within the 2D bounds (projected)
    return this.bounds.contains(value);
  }

  size(): number {
    const dims = this.bounds.dimensions();
    // Surface area = product of the two non-normal dimensions
    const area =
      dims[(this.normalAxis + 1) % 3] *
      dims[(this.normalAxis + 2) % 3];
    return isFinite(area) ? area : Infinity;
  }

  intersect(other: Domain): Domain {
    if (!(other instanceof SurfaceDomain)) return this;
    if (this.normalAxis !== other.normalAxis) return this;
    if (Math.abs(this.offset - other.offset) > this.thickness + other.thickness) {
      // Non-overlapping planes – return empty domain
      return new BoxDomain([0, 0, 0], [0, 0, 0]);
    }
    const mergedOffset = (this.offset + other.offset) / 2;
    const mergedThickness = Math.max(this.thickness, other.thickness) + Math.abs(this.offset - other.offset) / 2;
    return new SurfaceDomain(
      this.bounds.intersect(other.bounds) as BoxDomain,
      this.normalAxis,
      mergedOffset,
      mergedThickness,
    );
  }

  intersects(other: Domain): boolean {
    if (!(other instanceof SurfaceDomain)) return false;
    if (this.normalAxis !== other.normalAxis) return false;
    if (Math.abs(this.offset - other.offset) > this.thickness + other.thickness) return false;
    return this.bounds.intersects(other.bounds);
  }

  isSubsetOf(other: Domain): boolean {
    if (!(other instanceof SurfaceDomain)) return false;
    if (this.normalAxis !== other.normalAxis) return false;
    if (Math.abs(this.offset - other.offset) > other.thickness) return false;
    return this.bounds.isSubsetOf(other.bounds);
  }

  substitute(_variable: Variable, _value: any): Domain {
    return this;
  }

  sample(seed?: number): [number, number, number] {
    const point = this.bounds.sample(seed);
    point[this.normalAxis] = this.offset;
    return point;
  }

  clone(): SurfaceDomain {
    return new SurfaceDomain(
      this.bounds.clone(),
      this.normalAxis,
      this.offset,
      this.thickness,
    );
  }
}

/**
 * RoomDomain - Represents a room as a collection of surfaces.
 *
 * A room has a floor surface, optional ceiling, and four wall surfaces.
 * The `contains` check tests whether a point lies within the room's
 * bounding volume.
 */
export class RoomDomain extends Domain {
  readonly type = 'RoomDomain';

  /** Overall bounding box of the room */
  readonly bounds: BoxDomain;
  /** Floor surface */
  readonly floor: SurfaceDomain;
  /** Ceiling surface (optional – null for open-top rooms) */
  readonly ceiling: SurfaceDomain | null;
  /** Wall surfaces */
  readonly walls: SurfaceDomain[];

  constructor(
    bounds: BoxDomain,
    floorHeight: number = bounds.min[1],
    ceilingHeight: number = bounds.max[1],
    wallThickness: number = 0.1,
  ) {
    super();
    this.bounds = bounds;

    const [minX, , minZ] = bounds.min;
    const [maxX, , maxZ] = bounds.max;

    // Floor
    this.floor = new SurfaceDomain(
      new BoxDomain(
        [minX, floorHeight, minZ],
        [maxX, floorHeight + wallThickness, maxZ],
      ),
      1, // Y-axis normal
      floorHeight,
      wallThickness,
    );

    // Ceiling
    if (ceilingHeight > floorHeight) {
      this.ceiling = new SurfaceDomain(
        new BoxDomain(
          [minX, ceilingHeight - wallThickness, minZ],
          [maxX, ceilingHeight, maxZ],
        ),
        1,
        ceilingHeight,
        wallThickness,
      );
    } else {
      this.ceiling = null;
    }

    // Walls: -X, +X, -Z, +Z
    this.walls = [
      // -X wall
      new SurfaceDomain(
        new BoxDomain([minX, floorHeight, minZ], [minX + wallThickness, ceilingHeight, maxZ]),
        0, minX, wallThickness,
      ),
      // +X wall
      new SurfaceDomain(
        new BoxDomain([maxX - wallThickness, floorHeight, minZ], [maxX, ceilingHeight, maxZ]),
        0, maxX, wallThickness,
      ),
      // -Z wall
      new SurfaceDomain(
        new BoxDomain([minX, floorHeight, minZ], [maxX, ceilingHeight, minZ + wallThickness]),
        2, minZ, wallThickness,
      ),
      // +Z wall
      new SurfaceDomain(
        new BoxDomain([minX, floorHeight, maxZ - wallThickness], [maxX, ceilingHeight, maxZ]),
        2, maxZ, wallThickness,
      ),
    ];
  }

  contains(value: any): boolean {
    return this.bounds.contains(value);
  }

  size(): number {
    return this.bounds.size();
  }

  intersect(other: Domain): Domain {
    if (!(other instanceof RoomDomain)) return this;
    return new RoomDomain(
      this.bounds.intersect(other.bounds) as BoxDomain,
    );
  }

  intersects(other: Domain): boolean {
    if (!(other instanceof RoomDomain)) return false;
    return this.bounds.intersects(other.bounds);
  }

  isSubsetOf(other: Domain): boolean {
    if (!(other instanceof RoomDomain)) return false;
    return this.bounds.isSubsetOf(other.bounds);
  }

  substitute(_variable: Variable, _value: any): Domain {
    return this;
  }

  sample(seed?: number): [number, number, number] {
    // Sample a point on the floor by default
    return this.floor.sample(seed);
  }

  clone(): RoomDomain {
    return new RoomDomain(this.bounds.clone());
  }

  /**
   * Get the floor area
   */
  floorArea(): number {
    return this.floor.size();
  }

  /**
   * Get the room volume
   */
  volume(): number {
    return this.bounds.size();
  }

  /**
   * Get all surfaces (floor + ceiling + walls)
   */
  allSurfaces(): SurfaceDomain[] {
    const surfaces = [this.floor, ...this.walls];
    if (this.ceiling) surfaces.push(this.ceiling);
    return surfaces;
  }

  /**
   * Find which surface a point is closest to
   */
  closestSurface(point: [number, number, number]): SurfaceDomain {
    let best = this.floor;
    let bestDist = surfaceDistance(this.floor, point);

    if (this.ceiling) {
      const d = surfaceDistance(this.ceiling, point);
      if (d < bestDist) { bestDist = d; best = this.ceiling; }
    }

    for (const wall of this.walls) {
      const d = surfaceDistance(wall, point);
      if (d < bestDist) { bestDist = d; best = wall; }
    }

    return best;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toVec3(value: any): [number, number, number] {
  if (value == null) return [0, 0, 0];
  if (Array.isArray(value)) {
    return [
      typeof value[0] === 'number' ? value[0] : 0,
      typeof value[1] === 'number' ? value[1] : 0,
      typeof value[2] === 'number' ? value[2] : 0,
    ];
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    if (obj.position && typeof obj.position === 'object') {
      const p = obj.position;
      return [
        typeof p.x === 'number' ? p.x : 0,
        typeof p.y === 'number' ? p.y : 0,
        typeof p.z === 'number' ? p.z : 0,
      ];
    }
    return [
      typeof obj.x === 'number' ? obj.x : 0,
      typeof obj.y === 'number' ? obj.y : 0,
      typeof obj.z === 'number' ? obj.z : 0,
    ];
  }
  return [0, 0, 0];
}

function sampleRange(min: number, max: number, seed: number): number {
  if (!isFinite(max - min)) return 0;
  const t = Math.abs(Math.sin(seed * 9301 + 49297)) % 1;
  return min + t * (max - min);
}

function surfaceDistance(surface: SurfaceDomain, point: [number, number, number]): number {
  return Math.abs(point[surface.normalAxis] - surface.offset);
}
