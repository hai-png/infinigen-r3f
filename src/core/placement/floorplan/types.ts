/**
 * Floor Plan Generator Types
 *
 * Ported from infinigen/core/constraints/example_solver/room/
 * Defines all data structures for procedural floor plan generation.
 */

import * as THREE from 'three';

// ============================================================================
// Enums
// ============================================================================

/** Room type classification matching original infinigen Semantics */
export enum RoomType {
  Bedroom = 'bedroom',
  Kitchen = 'kitchen',
  Bathroom = 'bathroom',
  LivingRoom = 'living_room',
  DiningRoom = 'dining_room',
  Office = 'office',
  Hallway = 'hallway',
  Garage = 'garage',
  Storage = 'storage',
  Utility = 'utility',
  Closet = 'closet',
  Balcony = 'balcony',
  Warehouse = 'warehouse',
  OpenOffice = 'open_office',
  MeetingRoom = 'meeting_room',
  BreakRoom = 'break_room',
  Staircase = 'staircase',
  Entrance = 'entrance',
  Exterior = 'exterior',
}

/** Building style classification */
export enum BuildingStyle {
  Apartment = 'apartment',
  House = 'house',
  Office = 'office',
  Warehouse = 'warehouse',
}

/** Connection type between adjacent rooms */
export enum ConnectionType {
  Wall = 'wall',
  Door = 'door',
  Open = 'open',
  Window = 'window',
  Panoramic = 'panoramic',
}

/** Surface type for furniture placement */
export enum SurfaceType {
  Floor = 'floor',
  Wall = 'wall',
  Ceiling = 'ceiling',
}

// ============================================================================
// 2D Geometry Types
// ============================================================================

/** 2D polygon represented as an array of [x, y] coordinate pairs */
export type Polygon2D = [number, number][];

/** 2D line segment */
export interface LineSegment2D {
  start: [number, number];
  end: [number, number];
}

/** Axis-aligned bounding box in 2D */
export interface Bounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ============================================================================
// Adjacency & Constraints
// ============================================================================

/** Adjacency constraint between two room types */
export interface AdjacencyConstraint {
  /** First room type */
  roomTypeA: RoomType;
  /** Second room type */
  roomTypeB: RoomType;
  /** Connection type between the rooms */
  connectionType: ConnectionType;
  /** Constraint weight for the solver (higher = more important) */
  weight: number;
  /** Whether this constraint is mandatory */
  isHard: boolean;
}

/** Size constraint for a room type */
export interface RoomSizeConstraint {
  /** Room type this applies to */
  roomType: RoomType;
  /** Minimum area in square meters */
  minArea: number;
  /** Maximum area in square meters */
  maxArea: number;
  /** Target/typical area in square meters */
  targetArea: number;
  /** Minimum aspect ratio */
  minAspectRatio: number;
  /** Maximum aspect ratio */
  maxAspectRatio: number;
}

/** Building-wide constraint set */
export interface BuildingConstraints {
  /** Adjacency constraints between rooms */
  adjacencies: AdjacencyConstraint[];
  /** Size constraints per room type */
  roomSizes: Map<RoomType, RoomSizeConstraint>;
  /** Total building area (sq meters) */
  totalArea: number;
  /** Minimum wall thickness in meters */
  wallThickness: number;
  /** Wall height in meters */
  wallHeight: number;
  /** Grid unit for discretization */
  unit: number;
}

// ============================================================================
// Room & Floor Plan
// ============================================================================

/** Wall segment with optional opening */
export interface Wall {
  /** Unique identifier */
  id: string;
  /** Start point in 2D (local to room) */
  start: [number, number];
  /** End point in 2D (local to room) */
  end: [number, number];
  /** Wall thickness */
  thickness: number;
  /** Wall height */
  height: number;
  /** Whether this is an exterior wall */
  isExterior: boolean;
  /** Connected room ID (for interior walls) */
  connectsTo?: string;
  /** Opening type if any */
  opening?: WallOpening;
  /** 3D mesh reference */
  mesh?: THREE.Mesh;
}

/** Opening in a wall (door or window) */
export interface WallOpening {
  /** Type of opening */
  type: 'door' | 'window' | 'open';
  /** Position along the wall segment (0-1) */
  position: number;
  /** Width of the opening in meters */
  width: number;
  /** Height of the opening in meters */
  height: number;
  /** Bottom edge height from floor */
  sillHeight: number;
}

/** Door placement in the floor plan */
export interface Door {
  /** Unique identifier */
  id: string;
  /** Position in 3D space */
  position: THREE.Vector3;
  /** Rotation as euler angle around Y axis */
  rotationY: number;
  /** Door width */
  width: number;
  /** Door height */
  height: number;
  /** Room this door belongs to */
  roomId: string;
  /** Connected room ID */
  connectsTo: string;
  /** 3D mesh reference */
  mesh?: THREE.Mesh;
}

/** Window placement in the floor plan */
export interface Window {
  /** Unique identifier */
  id: string;
  /** Position in 3D space */
  position: THREE.Vector3;
  /** Rotation as euler angle around Y axis */
  rotationY: number;
  /** Window width */
  width: number;
  /** Window height */
  height: number;
  /** Sill height from floor */
  sillHeight: number;
  /** Room this window belongs to */
  roomId: string;
  /** Which wall this window is on (wall ID) */
  wallId: string;
  /** Whether the window faces outdoors */
  outdoorBackdrop: boolean;
  /** 3D mesh reference */
  mesh?: THREE.Mesh;
}

/** A single room in the floor plan */
export interface Room {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Room type */
  type: RoomType;
  /** Level/floor (0-based) */
  level: number;
  /** 2D polygon boundary (world coordinates) */
  polygon: Polygon2D;
  /** Area in square meters */
  area: number;
  /** Centroid in 2D */
  centroid: [number, number];
  /** Bounding box */
  bounds: Bounds2D;
  /** Adjacent room IDs */
  adjacencies: string[];
  /** Wall segments */
  walls: Wall[];
  /** Doors in this room */
  doors: Door[];
  /** Windows in this room */
  windows: Window[];
  /** Floor mesh */
  floorMesh?: THREE.Mesh;
  /** Ceiling mesh */
  ceilingMesh?: THREE.Mesh;
  /** Wall meshes */
  wallMeshes?: THREE.Mesh[];
  /** Room group (all meshes grouped) */
  group?: THREE.Group;
}

/** Complete floor plan */
export interface FloorPlan {
  /** Unique identifier */
  id: string;
  /** Building style */
  style: BuildingStyle;
  /** Total width of the building */
  width: number;
  /** Total depth of the building */
  depth: number;
  /** Number of stories */
  stories: number;
  /** Wall height per story */
  wallHeight: number;
  /** Wall thickness */
  wallThickness: number;
  /** All rooms in the floor plan */
  rooms: Room[];
  /** All doors */
  doors: Door[];
  /** All windows */
  windows: Window[];
  /** Outer building contour */
  contour: Polygon2D;
  /** Building constraints used */
  constraints: BuildingConstraints;
  /** Solver energy (lower is better) */
  energy: number;
  /** 3D group containing all meshes */
  group?: THREE.Group;
}

// ============================================================================
// Generator Parameters
// ============================================================================

/** Parameters for floor plan generation */
export interface FloorPlanParams {
  /** Random seed for deterministic generation */
  seed: number;
  /** Total building area in square meters */
  totalArea: number;
  /** Number of rooms to generate */
  roomCount: number;
  /** Room types to include */
  roomTypes: RoomType[];
  /** Building style */
  style: BuildingStyle;
  /** Number of stories */
  stories: number;
  /** Wall height in meters */
  wallHeight: number;
  /** Wall thickness in meters */
  wallThickness: number;
  /** Grid unit for discretization */
  unit: number;
  /** Solver iterations multiplier */
  solverIterations: number;
  /** Whether to generate 3D geometry */
  generateGeometry: boolean;
  /** Custom adjacency constraints (overrides defaults) */
  customAdjacencies?: AdjacencyConstraint[];
}

/** Default parameters for each building style */
export const BUILDING_DEFAULTS: Record<BuildingStyle, Partial<FloorPlanParams>> = {
  [BuildingStyle.Apartment]: {
    totalArea: 80,
    roomCount: 5,
    roomTypes: [RoomType.LivingRoom, RoomType.Bedroom, RoomType.Kitchen, RoomType.Bathroom, RoomType.Hallway],
    stories: 1,
    wallHeight: 2.8,
    wallThickness: 0.15,
    unit: 0.5,
    solverIterations: 200,
  },
  [BuildingStyle.House]: {
    totalArea: 150,
    roomCount: 6,
    roomTypes: [RoomType.LivingRoom, RoomType.Bedroom, RoomType.Kitchen, RoomType.Bathroom, RoomType.DiningRoom, RoomType.Hallway],
    stories: 2,
    wallHeight: 3.0,
    wallThickness: 0.2,
    unit: 0.5,
    solverIterations: 300,
  },
  [BuildingStyle.Office]: {
    totalArea: 200,
    roomCount: 6,
    roomTypes: [RoomType.OpenOffice, RoomType.Office, RoomType.MeetingRoom, RoomType.BreakRoom, RoomType.Hallway, RoomType.Storage],
    stories: 1,
    wallHeight: 3.2,
    wallThickness: 0.15,
    unit: 0.5,
    solverIterations: 250,
  },
  [BuildingStyle.Warehouse]: {
    totalArea: 300,
    roomCount: 4,
    roomTypes: [RoomType.Warehouse, RoomType.Office, RoomType.Storage, RoomType.Utility],
    stories: 1,
    wallHeight: 5.0,
    wallThickness: 0.25,
    unit: 1.0,
    solverIterations: 150,
  },
};

// ============================================================================
// Room Type Metadata
// ============================================================================

/** Typical room areas (sq meters) - from infinigen graph.py get_typical_areas */
export const ROOM_TYPICAL_AREAS: Record<RoomType, number> = {
  [RoomType.Bedroom]: 14,
  [RoomType.Kitchen]: 10,
  [RoomType.Bathroom]: 6,
  [RoomType.LivingRoom]: 25,
  [RoomType.DiningRoom]: 15,
  [RoomType.Office]: 12,
  [RoomType.Hallway]: 8,
  [RoomType.Garage]: 25,
  [RoomType.Storage]: 6,
  [RoomType.Utility]: 5,
  [RoomType.Closet]: 3,
  [RoomType.Balcony]: 6,
  [RoomType.Warehouse]: 80,
  [RoomType.OpenOffice]: 40,
  [RoomType.MeetingRoom]: 15,
  [RoomType.BreakRoom]: 12,
  [RoomType.Staircase]: 6,
  [RoomType.Entrance]: 4,
  [RoomType.Exterior]: 0,
};

/** Default room colors for floor plan visualization */
export const ROOM_COLORS: Record<RoomType, string> = {
  [RoomType.Bedroom]: '#A8D8EA',
  [RoomType.Kitchen]: '#FFD3B6',
  [RoomType.Bathroom]: '#DCEDC1',
  [RoomType.LivingRoom]: '#FF8B94',
  [RoomType.DiningRoom]: '#D5AAFF',
  [RoomType.Office]: '#B5EAD7',
  [RoomType.Hallway]: '#E2F0CB',
  [RoomType.Garage]: '#C7CEEA',
  [RoomType.Storage]: '#FFE156',
  [RoomType.Utility]: '#FF6B6B',
  [RoomType.Closet]: '#C9B1FF',
  [RoomType.Balcony]: '#88D8B0',
  [RoomType.Warehouse]: '#95A5A6',
  [RoomType.OpenOffice]: '#7FCD91',
  [RoomType.MeetingRoom]: '#E8A87C',
  [RoomType.BreakRoom]: '#85DCB0',
  [RoomType.Staircase]: '#D4A574',
  [RoomType.Entrance]: '#41B3A3',
  [RoomType.Exterior]: '#FFFFFF',
};

/** Material presets per room type and surface */
export interface RoomMaterialPreset {
  floor: { material: string; color: string; roughness: number };
  wall: { material: string; color: string; roughness: number };
  ceiling: { material: string; color: string; roughness: number };
}

export const ROOM_MATERIALS: Record<RoomType, RoomMaterialPreset> = {
  [RoomType.Bedroom]: {
    floor: { material: 'carpet', color: '#C4A882', roughness: 0.95 },
    wall: { material: 'painted_plaster', color: '#E8E0D8', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.Kitchen]: {
    floor: { material: 'tile', color: '#D4C5A9', roughness: 0.4 },
    wall: { material: 'tile', color: '#F0EDE8', roughness: 0.3 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.Bathroom]: {
    floor: { material: 'tile', color: '#E0DCD4', roughness: 0.3 },
    wall: { material: 'tile', color: '#F5F0E8', roughness: 0.35 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.LivingRoom]: {
    floor: { material: 'hardwood', color: '#8B7355', roughness: 0.6 },
    wall: { material: 'painted_plaster', color: '#F5F5DC', roughness: 0.8 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.DiningRoom]: {
    floor: { material: 'hardwood', color: '#6B4226', roughness: 0.5 },
    wall: { material: 'painted_plaster', color: '#F5E6D3', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFF8F0', roughness: 0.9 },
  },
  [RoomType.Office]: {
    floor: { material: 'hardwood', color: '#8B7355', roughness: 0.6 },
    wall: { material: 'painted_plaster', color: '#F0EDE8', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.Hallway]: {
    floor: { material: 'hardwood', color: '#9B8B6B', roughness: 0.6 },
    wall: { material: 'painted_plaster', color: '#F0ECE8', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.Garage]: {
    floor: { material: 'concrete', color: '#A0A0A0', roughness: 0.8 },
    wall: { material: 'painted_drywall', color: '#E8E8E8', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#F0F0F0', roughness: 0.9 },
  },
  [RoomType.Storage]: {
    floor: { material: 'concrete', color: '#B0B0B0', roughness: 0.8 },
    wall: { material: 'painted_plaster', color: '#E8E8E8', roughness: 0.9 },
    ceiling: { material: 'painted_plaster', color: '#F0F0F0', roughness: 0.9 },
  },
  [RoomType.Utility]: {
    floor: { material: 'concrete', color: '#A0A0A0', roughness: 0.85 },
    wall: { material: 'painted_plaster', color: '#E0E0E0', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#F0F0F0', roughness: 0.9 },
  },
  [RoomType.Closet]: {
    floor: { material: 'hardwood', color: '#8B7355', roughness: 0.6 },
    wall: { material: 'painted_plaster', color: '#F0F0F0', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.Balcony]: {
    floor: { material: 'tile', color: '#B0A090', roughness: 0.5 },
    wall: { material: 'painted_plaster', color: '#F0E8E0', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.Warehouse]: {
    floor: { material: 'concrete', color: '#808080', roughness: 0.9 },
    wall: { material: 'metal_siding', color: '#B8B8B8', roughness: 0.6 },
    ceiling: { material: 'metal_deck', color: '#C8C8C8', roughness: 0.5 },
  },
  [RoomType.OpenOffice]: {
    floor: { material: 'carpet', color: '#909090', roughness: 0.8 },
    wall: { material: 'painted_plaster', color: '#F0F0F0', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.MeetingRoom]: {
    floor: { material: 'carpet', color: '#8080A0', roughness: 0.85 },
    wall: { material: 'painted_plaster', color: '#F0ECE8', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.BreakRoom]: {
    floor: { material: 'tile', color: '#C0B0A0', roughness: 0.4 },
    wall: { material: 'painted_plaster', color: '#F0E8E0', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.Staircase]: {
    floor: { material: 'hardwood', color: '#8B7355', roughness: 0.5 },
    wall: { material: 'painted_plaster', color: '#F0F0F0', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.Entrance]: {
    floor: { material: 'tile', color: '#A09080', roughness: 0.5 },
    wall: { material: 'painted_plaster', color: '#F0ECE8', roughness: 0.85 },
    ceiling: { material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  },
  [RoomType.Exterior]: {
    floor: { material: 'none', color: '#000000', roughness: 1.0 },
    wall: { material: 'none', color: '#000000', roughness: 1.0 },
    ceiling: { material: 'none', color: '#000000', roughness: 1.0 },
  },
};
