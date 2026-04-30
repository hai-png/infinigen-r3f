/**
 * Domain Types for Constraint System
 * Ported from infinigen/core/domain/types.py
 */

import type { Tag } from '../../constraints/tags';

/**
 * Represents an asset description in the scene
 */
export interface AssetDescription {
  /** Unique identifier for this asset */
  id: string;
  
  /** Semantic tags describing the asset */
  tags: Set<Tag>;
  
  /** Bounding box [min_x, min_y, min_z, max_x, max_y, max_z] */
  bbox?: [number, number, number, number, number, number];
  
  /** Asset category (e.g., 'chair', 'table', 'wall') */
  category: string;
  
  /** Subcategory if applicable */
  subcategory?: string;
  
  /** Style descriptor */
  style?: string;
  
  /** Material hints */
  material?: string;
  
  /** Size category */
  size?: 'small' | 'medium' | 'large';
  
  /** Function of the object */
  function?: string;
  
  /** Room assignment */
  room?: string;
  
  /** Parent object ID (for hierarchical relationships) */
  parentId?: string;
  
  /** Children object IDs */
  childrenIds?: string[];
}

/**
 * Spatial relation between objects
 */
export type RelationType = 
  | 'near'
  | 'far'
  | 'left_of'
  | 'right_of'
  | 'in_front_of'
  | 'behind'
  | 'on_top_of'
  | 'under'
  | 'inside'
  | 'outside'
  | 'facing'
  | 'aligned_with'
  | 'parallel_to'
  | 'perpendicular_to'
  | 'same_height'
  | 'higher_than'
  | 'lower_than'
  | 'centered_on'
  | 'edge_aligned';

/**
 * Represents a spatial relation constraint
 */
export interface Relation {
  /** Type of relation */
  type: RelationType;
  
  /** First object in the relation */
  object1: string;
  
  /** Second object in the relation */
  object2: string;
  
  /** Optional distance threshold (for near/far relations) */
  distance?: number;
  
  /** Optional angle threshold (for angular relations) */
  angle?: number;
  
  /** Weight/importance of this relation */
  weight?: number;
  
  /** Whether this relation is hard (must be satisfied) or soft */
  isHard?: boolean;
  
  /** Tolerance for satisfaction */
  tolerance?: number;
}

/**
 * Node in the constraint graph
 */
export interface ConstraintNode {
  /** Unique identifier */
  id: string;
  
  /** Asset description */
  asset: AssetDescription;
  
  /** Domain constraints */
  domain: DomainConstraint;
  
  /** Relations with other nodes */
  relations: Relation[];
}

/**
 * Edge in the constraint graph representing a relation
 */
export interface ConstraintEdge {
  /** Source node ID */
  source: string;
  
  /** Target node ID */
  target: string;
  
  /** Relation type */
  relation: Relation;
}

/**
 * Domain constraint for a variable
 */
export interface DomainConstraint {
  /** Allowed categories */
  categories?: string[];
  
  /** Required tags */
  requiredTags?: Tag[];
  
  /** Forbidden tags */
  forbiddenTags?: Tag[];
  
  /** Size constraints */
  sizeConstraints?: SizeConstraint;
  
  /** Position bounds */
  positionBounds?: PositionBounds;
  
  /** Rotation constraints */
  rotationConstraints?: RotationConstraint;
  
  /** Scale constraints */
  scaleConstraints?: ScaleConstraint;
}

/**
 * Size constraint for objects
 */
export interface SizeConstraint {
  /** Minimum dimensions */
  minDimensions?: [number, number, number];
  
  /** Maximum dimensions */
  maxDimensions?: [number, number, number];
  
  /** Volume constraints */
  minVolume?: number;
  maxVolume?: number;
}

/**
 * Position bounds
 */
export interface PositionBounds {
  /** Minimum position [x, y, z] */
  min: [number, number, number];
  
  /** Maximum position [x, y, z] */
  max: [number, number, number];
}

/**
 * Rotation constraint
 */
export interface RotationConstraint {
  /** Fixed rotation (if any) */
  fixed?: [number, number, number];
  
  /** Allowable rotation ranges [min, max] for each axis */
  ranges?: {
    x?: [number, number];
    y?: [number, number];
    z?: [number, number];
  };
  
  /** Discrete allowed rotations */
  discrete?: [number, number, number][];
}

/**
 * Scale constraint
 */
export interface ScaleConstraint {
  /** Uniform scale range */
  uniform?: [number, number];
  
  /** Per-axis scale ranges */
  perAxis?: {
    x?: [number, number];
    y?: [number, number];
    z?: [number, number];
  };
  
  /** Fixed scale */
  fixed?: [number, number, number];
}

/**
 * Constraint graph representing the scene layout problem
 */
export interface ConstraintGraph {
  /** All nodes in the graph */
  nodes: Map<string, ConstraintNode>;
  
  /** All edges (relations) in the graph */
  edges: ConstraintEdge[];
  
  /** Global constraints */
  globalConstraints: GlobalConstraint[];
  
  /** Room definitions */
  rooms?: Map<string, RoomDefinition>;
}

/**
 * Global constraint affecting multiple objects
 */
export interface GlobalConstraint {
  /** Type of constraint */
  type: 'density' | 'distribution' | 'symmetry' | 'pattern' | 'clearance';
  
  /** Objects affected */
  objects: string[];
  
  /** Constraint parameters */
  params: Record<string, any>;
  
  /** Weight/importance */
  weight: number;
}

/**
 * Room definition
 */
export interface RoomDefinition {
  /** Room ID */
  id: string;
  
  /** Room type (living_room, bedroom, etc.) */
  type: string;
  
  /** Floor plan polygon */
  floorPlan: [number, number][];
  
  /** Floor height */
  floorHeight: number;
  
  /** Ceiling height */
  ceilingHeight: number;
  
  /** Wall definitions */
  walls: WallDefinition[];
  
  /** Door placements */
  doors?: DoorDefinition[];
  
  /** Window placements */
  windows?: WindowDefinition[];
}

/**
 * Wall definition
 */
export interface WallDefinition {
  /** Start point */
  start: [number, number];
  
  /** End point */
  end: [number, number];
  
  /** Height */
  height: number;
  
  /** Thickness */
  thickness: number;
  
  /** Material */
  material?: string;
}

/**
 * Door definition
 */
export interface DoorDefinition {
  /** Position on wall */
  position: [number, number];
  
  /** Width */
  width: number;
  
  /** Height */
  height: number;
  
  /** Orientation */
  orientation: 'inward' | 'outward' | 'sliding';
}

/**
 * Window definition
 */
export interface WindowDefinition {
  /** Position on wall */
  position: [number, number];
  
  /** Width */
  width: number;
  
  /** Height */
  height: number;
  
  /** Sill height */
  sillHeight: number;
}
