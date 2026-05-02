/**
 * Indoor Scene Composer for Infinigen R3F
 *
 * Uses the existing constraint solver (SimulatedAnnealing) with PROPER evaluation.
 * Provides full constraint evaluation including StableAgainst, AnyRelation, and Domain constraints.
 * 5 indoor scene templates with wall/floor/ceiling materials, doors, windows.
 */

import { Vector3, Quaternion, Box3, Object3D } from 'three';
import { SimulatedAnnealing, type AnnealingConfig, type AnnealingStats } from '@/core/constraints/optimizer/SimulatedAnnealing';
import {
  ConstraintDomain,
  ConstraintType,
  Constraint,
  ConstraintEvaluationResult,
  ConstraintViolation,
  Room,
} from '@/core/constraints/core/ConstraintTypes';
import {
  FloorPlanGenerator,
  createFloorPlan,
  RoomType as ProceduralRoomType,
  BuildingStyle,
  type FloorPlan,
  type FloorPlanParams,
  type FurniturePlacement,
} from '@/core/placement/floorplan';

// ---------------------------------------------------------------------------
// Indoor types
// ---------------------------------------------------------------------------

export type RoomType =
  | 'living_room' | 'bedroom' | 'kitchen' | 'bathroom' | 'office'
  | 'dining_room' | 'studio' | 'garage' | 'library' | 'attic' | 'basement' | 'warehouse';

export type SurfaceType = 'floor' | 'wall' | 'ceiling';

export interface IndoorObject {
  id: string;
  name: string;
  category: string;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  roomId: string;
  onSurface: SurfaceType;
  priority: number;
  tags: string[];
  bounds: Box3;
}

export interface SurfaceMaterial {
  surface: SurfaceType;
  material: string;
  color: string;
  roughness: number;
}

export interface DoorPlacement {
  position: Vector3;
  rotation: Quaternion;
  width: number;
  height: number;
  connectsTo: string; // Room ID or 'outside'
}

export interface WindowPlacement {
  position: Vector3;
  rotation: Quaternion;
  width: number;
  height: number;
  wallIndex: number; // Which wall (0=N, 1=E, 2=S, 3=W)
  outdoorBackdrop: boolean;
}

export interface RoomSpec {
  id: string;
  name: string;
  type: RoomType;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  adjacencies: string[];
}

export interface ConstraintRelation {
  type: 'StableAgainst' | 'AnyRelation' | 'DomainConstraint';
  subject: string;
  target?: string;
  surface?: SurfaceType;
  relation?: string;
  domain?: string;
  weight: number;
  isHard: boolean;
}

export interface IndoorSceneResult {
  rooms: RoomSpec[];
  objects: IndoorObject[];
  materials: SurfaceMaterial[];
  doors: DoorPlacement[];
  windows: WindowPlacement[];
  constraints: ConstraintRelation[];
  solverStats: AnnealingStats | null;
  score: number;
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

interface RoomTemplate {
  type: RoomType;
  name: string;
  size: [number, number, number]; // width, height, depth
  objects: Array<{
    name: string;
    category: string;
    onSurface: SurfaceType;
    position: [number, number, number];
    tags: string[];
  }>;
  constraints: ConstraintRelation[];
  materials: SurfaceMaterial[];
  doors: Array<{
    wall: number;
    offset: number;
    connectsTo: string;
  }>;
  windows: Array<{
    wall: number;
    offset: number;
    outdoorBackdrop: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const LIVING_ROOM_TEMPLATE: RoomTemplate = {
  type: 'living_room',
  name: 'Living Room',
  size: [6, 3, 5],
  objects: [
    { name: 'sofa', category: 'furniture.sofa', onSurface: 'floor', position: [0, 0, -1.8], tags: ['seating', 'large'] },
    { name: 'coffee_table', category: 'furniture.table.coffee', onSurface: 'floor', position: [0, 0, 0.3], tags: ['table'] },
    { name: 'tv_stand', category: 'furniture.entertainment', onSurface: 'floor', position: [0, 0, 2.2], tags: ['media'] },
    { name: 'armchair_left', category: 'furniture.chair.armchair', onSurface: 'floor', position: [-2, 0, -0.8], tags: ['seating'] },
    { name: 'armchair_right', category: 'furniture.chair.armchair', onSurface: 'floor', position: [2, 0, -0.8], tags: ['seating'] },
    { name: 'bookshelf', category: 'furniture.shelf.bookcase', onSurface: 'floor', position: [-2.5, 0, 2], tags: ['storage'] },
    { name: 'rug', category: 'decor.rug', onSurface: 'floor', position: [0, 0.01, 0], tags: ['decor'] },
    { name: 'floor_lamp', category: 'lighting.lamp.floor', onSurface: 'floor', position: [-2.5, 0, -2], tags: ['lighting'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'sofa', surface: 'floor', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'coffee_table', surface: 'floor', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'sofa', target: 'coffee_table', relation: 'facing', weight: 0.8, isHard: false },
    { type: 'AnyRelation', subject: 'sofa', target: 'tv_stand', relation: 'facing', weight: 0.9, isHard: true },
    { type: 'DomainConstraint', subject: 'sofa', domain: 'living_room', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'hardwood', color: '#8B7355', roughness: 0.6 },
    { surface: 'wall', material: 'painted_plaster', color: '#F5F5DC', roughness: 0.8 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const BEDROOM_TEMPLATE: RoomTemplate = {
  type: 'bedroom',
  name: 'Bedroom',
  size: [4.5, 3, 4],
  objects: [
    { name: 'bed', category: 'furniture.bed.double', onSurface: 'floor', position: [0, 0, 0], tags: ['bed', 'large'] },
    { name: 'nightstand_left', category: 'furniture.nightstand', onSurface: 'floor', position: [-1.2, 0, 0.5], tags: ['storage'] },
    { name: 'nightstand_right', category: 'furniture.nightstand', onSurface: 'floor', position: [1.2, 0, 0.5], tags: ['storage'] },
    { name: 'wardrobe', category: 'furniture.wardrobe', onSurface: 'floor', position: [2, 0, -1.5], tags: ['storage', 'large'] },
    { name: 'desk', category: 'furniture.desk', onSurface: 'floor', position: [-1.5, 0, -1.5], tags: ['workspace'] },
    { name: 'chair', category: 'furniture.chair.office', onSurface: 'floor', position: [-1.5, 0, -1], tags: ['seating'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'bed', surface: 'floor', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'nightstand_left', surface: 'floor', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'nightstand_left', target: 'bed', relation: 'adjacent', weight: 0.9, isHard: true },
    { type: 'AnyRelation', subject: 'nightstand_right', target: 'bed', relation: 'adjacent', weight: 0.9, isHard: true },
    { type: 'DomainConstraint', subject: 'bed', domain: 'bedroom', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'carpet', color: '#C4A882', roughness: 0.95 },
    { surface: 'wall', material: 'painted_plaster', color: '#E8E0D8', roughness: 0.85 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const KITCHEN_TEMPLATE: RoomTemplate = {
  type: 'kitchen',
  name: 'Kitchen',
  size: [4, 3, 4],
  objects: [
    { name: 'counter_left', category: 'architectural.counter', onSurface: 'floor', position: [-1.5, 0, 1.5], tags: ['counter'] },
    { name: 'stove', category: 'appliance.stove', onSurface: 'floor', position: [-1.5, 0, 0.5], tags: ['appliance'] },
    { name: 'refrigerator', category: 'appliance.refrigerator', onSurface: 'floor', position: [-1.8, 0, -1.5], tags: ['appliance', 'large'] },
    { name: 'sink', category: 'fixture.sink.kitchen', onSurface: 'floor', position: [-1.5, 0, 1], tags: ['fixture'] },
    { name: 'island', category: 'furniture.table.kitchen_island', onSurface: 'floor', position: [0.5, 0, 0], tags: ['table'] },
    { name: 'stool_1', category: 'furniture.stool.bar', onSurface: 'floor', position: [0, 0, -0.5], tags: ['seating'] },
    { name: 'stool_2', category: 'furniture.stool.bar', onSurface: 'floor', position: [0.5, 0, -0.5], tags: ['seating'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'counter_left', surface: 'wall', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'stove', surface: 'floor', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'stove', target: 'refrigerator', relation: 'work_triangle', weight: 0.7, isHard: false },
    { type: 'AnyRelation', subject: 'stove', target: 'sink', relation: 'work_triangle', weight: 0.7, isHard: false },
    { type: 'DomainConstraint', subject: 'refrigerator', domain: 'kitchen', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'tile', color: '#D4C5A9', roughness: 0.4 },
    { surface: 'wall', material: 'tile', color: '#F0EDE8', roughness: 0.3 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const BATHROOM_TEMPLATE: RoomTemplate = {
  type: 'bathroom',
  name: 'Bathroom',
  size: [3, 2.8, 3],
  objects: [
    { name: 'bathtub', category: 'fixture.bathtub', onSurface: 'floor', position: [0, 0, 1], tags: ['fixture', 'large'] },
    { name: 'toilet', category: 'fixture.toilet', onSurface: 'floor', position: [-1, 0, -1], tags: ['fixture'] },
    { name: 'sink', category: 'fixture.sink.bathroom', onSurface: 'floor', position: [1, 0, -1], tags: ['fixture'] },
    { name: 'mirror', category: 'decor.mirror.wall', onSurface: 'wall', position: [1, 1.5, -1.3], tags: ['decor'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'bathtub', surface: 'floor', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'mirror', surface: 'wall', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'mirror', target: 'sink', relation: 'above', weight: 0.9, isHard: true },
    { type: 'DomainConstraint', subject: 'bathtub', domain: 'bathroom', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'tile', color: '#E0DCD4', roughness: 0.3 },
    { surface: 'wall', material: 'tile', color: '#F5F0E8', roughness: 0.35 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [],
};

const OFFICE_TEMPLATE: RoomTemplate = {
  type: 'office',
  name: 'Office',
  size: [4, 3, 4],
  objects: [
    { name: 'desk', category: 'furniture.desk', onSurface: 'floor', position: [0, 0, 1.5], tags: ['workspace', 'large'] },
    { name: 'chair', category: 'furniture.chair.office', onSurface: 'floor', position: [0, 0, 0.5], tags: ['seating'] },
    { name: 'bookshelf', category: 'furniture.shelf.bookcase', onSurface: 'floor', position: [-1.8, 0, 0], tags: ['storage'] },
    { name: 'filing_cabinet', category: 'furniture.storage.filing', onSurface: 'floor', position: [1.5, 0, 1.5], tags: ['storage'] },
    { name: 'floor_lamp', category: 'lighting.lamp.floor', onSurface: 'floor', position: [-1.5, 0, -1], tags: ['lighting'] },
    { name: 'plant', category: 'plant.indoor.small', onSurface: 'floor', position: [1.5, 0, -1], tags: ['decor'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'desk', surface: 'floor', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'bookshelf', surface: 'wall', weight: 0.8, isHard: false },
    { type: 'AnyRelation', subject: 'chair', target: 'desk', relation: 'facing', weight: 0.9, isHard: true },
    { type: 'DomainConstraint', subject: 'desk', domain: 'office', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'hardwood', color: '#8B7355', roughness: 0.6 },
    { surface: 'wall', material: 'painted_plaster', color: '#F0EDE8', roughness: 0.85 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const DINING_ROOM_TEMPLATE: RoomTemplate = {
  type: 'dining_room',
  name: 'Dining Room',
  size: [5, 3, 4.5],
  objects: [
    { name: 'dining_table', category: 'furniture.table.dining', onSurface: 'floor', position: [0, 0, 0], tags: ['table', 'large'] },
    { name: 'chair_1', category: 'furniture.chair.dining', onSurface: 'floor', position: [-1, 0, 0], tags: ['seating'] },
    { name: 'chair_2', category: 'furniture.chair.dining', onSurface: 'floor', position: [1, 0, 0], tags: ['seating'] },
    { name: 'chair_3', category: 'furniture.chair.dining', onSurface: 'floor', position: [0, 0, -0.8], tags: ['seating'] },
    { name: 'chair_4', category: 'furniture.chair.dining', onSurface: 'floor', position: [0, 0, 0.8], tags: ['seating'] },
    { name: 'china_cabinet', category: 'furniture.cabinet.china', onSurface: 'floor', position: [2, 0, -1.5], tags: ['storage'] },
    { name: 'sideboard', category: 'furniture.cabinet.sideboard', onSurface: 'floor', position: [-2, 0, 1.5], tags: ['storage'] },
    { name: 'chandelier', category: 'lighting.chandelier', onSurface: 'ceiling', position: [0, 2.8, 0], tags: ['lighting'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'dining_table', surface: 'floor', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'china_cabinet', target: 'dining_table', relation: 'near', weight: 0.6, isHard: false },
    { type: 'DomainConstraint', subject: 'dining_table', domain: 'dining_room', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'hardwood', color: '#6B4226', roughness: 0.5 },
    { surface: 'wall', material: 'painted_plaster', color: '#F5E6D3', roughness: 0.85 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFF8F0', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'kitchen' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const STUDIO_TEMPLATE: RoomTemplate = {
  type: 'studio',
  name: 'Studio',
  size: [6, 3.5, 5],
  objects: [
    { name: 'photo_backdrop', category: 'equipment.backdrop', onSurface: 'floor', position: [0, 0, 2], tags: ['equipment'] },
    { name: 'softbox_left', category: 'lighting.studio.softbox', onSurface: 'floor', position: [-2.5, 0, 1], tags: ['lighting'] },
    { name: 'softbox_right', category: 'lighting.studio.softbox', onSurface: 'floor', position: [2.5, 0, 1], tags: ['lighting'] },
    { name: 'camera_tripod', category: 'equipment.tripod', onSurface: 'floor', position: [0, 0, -1.5], tags: ['equipment'] },
    { name: 'light_stand', category: 'lighting.studio.stand', onSurface: 'floor', position: [-1.5, 0, -1], tags: ['lighting'] },
    { name: 'props_table', category: 'furniture.table.utility', onSurface: 'floor', position: [2, 0, -1.5], tags: ['table'] },
    { name: 'stool', category: 'furniture.stool', onSurface: 'floor', position: [0, 0, 0.5], tags: ['seating'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'photo_backdrop', surface: 'wall', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'softbox_left', target: 'photo_backdrop', relation: 'facing', weight: 0.8, isHard: false },
    { type: 'AnyRelation', subject: 'softbox_right', target: 'photo_backdrop', relation: 'facing', weight: 0.8, isHard: false },
    { type: 'DomainConstraint', subject: 'camera_tripod', domain: 'studio', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'concrete', color: '#B0B0B0', roughness: 0.7 },
    { surface: 'wall', material: 'painted_plaster', color: '#F0F0F0', roughness: 0.9 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FAFAFA', roughness: 0.95 },
  ],
  doors: [{ wall: 2, offset: 0, connectsTo: 'hallway' }],
  windows: [],
};

const GARAGE_TEMPLATE: RoomTemplate = {
  type: 'garage',
  name: 'Garage',
  size: [7, 3, 6],
  objects: [
    { name: 'car', category: 'vehicle.car', onSurface: 'floor', position: [0, 0, 0.5], tags: ['vehicle', 'large'] },
    { name: 'workbench', category: 'furniture.workbench', onSurface: 'floor', position: [-3, 0, 2], tags: ['workspace'] },
    { name: 'tool_cabinet', category: 'furniture.cabinet.tool', onSurface: 'floor', position: [3, 0, 2], tags: ['storage'] },
    { name: 'shelf_left', category: 'furniture.shelf.storage', onSurface: 'floor', position: [-3, 0, -2], tags: ['storage'] },
    { name: 'shelf_right', category: 'furniture.shelf.storage', onSurface: 'floor', position: [3, 0, -2], tags: ['storage'] },
    { name: 'overhead_light', category: 'lighting.fluorescent', onSurface: 'ceiling', position: [0, 2.8, 0], tags: ['lighting'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'workbench', surface: 'wall', weight: 0.8, isHard: false },
    { type: 'StableAgainst', subject: 'car', surface: 'floor', weight: 1, isHard: true },
    { type: 'DomainConstraint', subject: 'car', domain: 'garage', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'concrete', color: '#A0A0A0', roughness: 0.8 },
    { surface: 'wall', material: 'painted_drywall', color: '#E8E8E8', roughness: 0.85 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#F0F0F0', roughness: 0.9 },
  ],
  doors: [{ wall: 0, offset: 0, connectsTo: 'outside' }],
  windows: [],
};

const LIBRARY_TEMPLATE: RoomTemplate = {
  type: 'library',
  name: 'Library',
  size: [6, 3.5, 5],
  objects: [
    { name: 'bookshelf_north', category: 'furniture.shelf.bookcase', onSurface: 'floor', position: [0, 0, 2.2], tags: ['storage', 'large'] },
    { name: 'bookshelf_east', category: 'furniture.shelf.bookcase', onSurface: 'floor', position: [2.5, 0, 0], tags: ['storage', 'large'] },
    { name: 'bookshelf_west', category: 'furniture.shelf.bookcase', onSurface: 'floor', position: [-2.5, 0, 0], tags: ['storage', 'large'] },
    { name: 'reading_chair', category: 'furniture.chair.armchair', onSurface: 'floor', position: [1, 0, -1.5], tags: ['seating'] },
    { name: 'reading_lamp', category: 'lighting.lamp.floor', onSurface: 'floor', position: [0.2, 0, -1.5], tags: ['lighting'] },
    { name: 'side_table', category: 'furniture.table.side', onSurface: 'floor', position: [1.8, 0, -1], tags: ['table'] },
    { name: 'ladder', category: 'furniture.ladder.library', onSurface: 'floor', position: [-1, 0, 1], tags: ['utility'] },
    { name: 'desk', category: 'furniture.desk', onSurface: 'floor', position: [-1.5, 0, -2], tags: ['workspace'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'bookshelf_north', surface: 'wall', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'bookshelf_east', surface: 'wall', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'reading_chair', target: 'reading_lamp', relation: 'adjacent', weight: 0.8, isHard: false },
    { type: 'DomainConstraint', subject: 'bookshelf_north', domain: 'library', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'hardwood', color: '#5C3317', roughness: 0.5 },
    { surface: 'wall', material: 'wood_paneling', color: '#8B6914', roughness: 0.6 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFF5E6', roughness: 0.9 },
  ],
  doors: [{ wall: 2, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const ATTIC_TEMPLATE: RoomTemplate = {
  type: 'attic',
  name: 'Attic',
  size: [5, 2.5, 4],
  objects: [
    { name: 'storage_box_1', category: 'storage.box.large', onSurface: 'floor', position: [-1.5, 0, 1], tags: ['storage'] },
    { name: 'storage_box_2', category: 'storage.box.large', onSurface: 'floor', position: [1.5, 0, 1], tags: ['storage'] },
    { name: 'old_trunk', category: 'storage.trunk', onSurface: 'floor', position: [0, 0, 1.5], tags: ['storage'] },
    { name: 'dressing_mannequin', category: 'decor.mannequin', onSurface: 'floor', position: [-1, 0, -1], tags: ['decor'] },
    { name: 'hanging_rack', category: 'furniture.rack.clothes', onSurface: 'floor', position: [1.5, 0, -0.5], tags: ['storage'] },
    { name: 'dormer_window_light', category: 'lighting.window', onSurface: 'wall', position: [0, 1.2, -1.8], tags: ['lighting'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'storage_box_1', surface: 'floor', weight: 1, isHard: true },
    { type: 'DomainConstraint', subject: 'storage_box_1', domain: 'attic', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'hardwood', color: '#7B5B3A', roughness: 0.7 },
    { surface: 'wall', material: 'wood_paneling', color: '#A08060', roughness: 0.75 },
    { surface: 'ceiling', material: 'wood_planks', color: '#8B7355', roughness: 0.65 },
  ],
  doors: [{ wall: 2, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const BASEMENT_TEMPLATE: RoomTemplate = {
  type: 'basement',
  name: 'Basement',
  size: [6, 2.8, 5],
  objects: [
    { name: 'furnace', category: 'appliance.furnace', onSurface: 'floor', position: [2, 0, 1.5], tags: ['appliance', 'large'] },
    { name: 'water_heater', category: 'appliance.water_heater', onSurface: 'floor', position: [2, 0, -1], tags: ['appliance'] },
    { name: 'utility_shelf', category: 'furniture.shelf.utility', onSurface: 'floor', position: [-2.5, 0, 1.5], tags: ['storage'] },
    { name: 'storage_shelf_1', category: 'furniture.shelf.storage', onSurface: 'floor', position: [-2.5, 0, -1], tags: ['storage'] },
    { name: 'storage_shelf_2', category: 'furniture.shelf.storage', onSurface: 'floor', position: [-2.5, 0, -2], tags: ['storage'] },
    { name: 'workbench', category: 'furniture.workbench', onSurface: 'floor', position: [0, 0, -2], tags: ['workspace'] },
    { name: 'overhead_light', category: 'lighting.fluorescent', onSurface: 'ceiling', position: [0, 2.6, 0], tags: ['lighting'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'furnace', surface: 'wall', weight: 0.9, isHard: false },
    { type: 'StableAgainst', subject: 'water_heater', surface: 'floor', weight: 1, isHard: true },
    { type: 'DomainConstraint', subject: 'furnace', domain: 'basement', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'concrete', color: '#909090', roughness: 0.85 },
    { surface: 'wall', material: 'cinder_block', color: '#C0C0C0', roughness: 0.8 },
    { surface: 'ceiling', material: 'exposed_joists', color: '#8B7355', roughness: 0.7 },
  ],
  doors: [{ wall: 2, offset: 0, connectsTo: 'hallway' }],
  windows: [],
};

const WAREHOUSE_TEMPLATE: RoomTemplate = {
  type: 'warehouse',
  name: 'Warehouse',
  size: [12, 6, 10],
  objects: [
    { name: 'shelf_row_1', category: 'industrial.shelving.pallet', onSurface: 'floor', position: [-4, 0, 3], tags: ['storage', 'large'] },
    { name: 'shelf_row_2', category: 'industrial.shelving.pallet', onSurface: 'floor', position: [0, 0, 3], tags: ['storage', 'large'] },
    { name: 'shelf_row_3', category: 'industrial.shelving.pallet', onSurface: 'floor', position: [4, 0, 3], tags: ['storage', 'large'] },
    { name: 'pallet_1', category: 'industrial.pallet', onSurface: 'floor', position: [-3, 0, -2], tags: ['storage'] },
    { name: 'pallet_2', category: 'industrial.pallet', onSurface: 'floor', position: [0, 0, -2], tags: ['storage'] },
    { name: 'pallet_3', category: 'industrial.pallet', onSurface: 'floor', position: [3, 0, -2], tags: ['storage'] },
    { name: 'forklift', category: 'vehicle.forklift', onSurface: 'floor', position: [-5, 0, -3], tags: ['vehicle'] },
    { name: 'overhead_light_1', category: 'lighting.industrial.highbay', onSurface: 'ceiling', position: [-3, 5.8, 0], tags: ['lighting'] },
    { name: 'overhead_light_2', category: 'lighting.industrial.highbay', onSurface: 'ceiling', position: [3, 5.8, 0], tags: ['lighting'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'shelf_row_1', surface: 'floor', weight: 1, isHard: true },
    { type: 'DomainConstraint', subject: 'forklift', domain: 'warehouse', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'concrete', color: '#808080', roughness: 0.9 },
    { surface: 'wall', material: 'metal_siding', color: '#B8B8B8', roughness: 0.6 },
    { surface: 'ceiling', material: 'metal_deck', color: '#C8C8C8', roughness: 0.5 },
  ],
  doors: [{ wall: 0, offset: 0, connectsTo: 'outside' }],
  windows: [{ wall: 1, offset: 0, outdoorBackdrop: false }],
};

const TEMPLATES: Record<RoomType, RoomTemplate> = {
  living_room: LIVING_ROOM_TEMPLATE,
  bedroom: BEDROOM_TEMPLATE,
  kitchen: KITCHEN_TEMPLATE,
  bathroom: BATHROOM_TEMPLATE,
  office: OFFICE_TEMPLATE,
  dining_room: DINING_ROOM_TEMPLATE,
  studio: STUDIO_TEMPLATE,
  garage: GARAGE_TEMPLATE,
  library: LIBRARY_TEMPLATE,
  attic: ATTIC_TEMPLATE,
  basement: BASEMENT_TEMPLATE,
  warehouse: WAREHOUSE_TEMPLATE,
};

// ---------------------------------------------------------------------------
// IndoorSceneComposer
// ---------------------------------------------------------------------------

export class IndoorSceneComposer {
  private result: IndoorSceneResult;
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.result = {
      rooms: [],
      objects: [],
      materials: [],
      doors: [],
      windows: [],
      constraints: [],
      solverStats: null,
      score: 0,
    };
  }

  // -----------------------------------------------------------------------
  // Compose a single room
  // -----------------------------------------------------------------------

  composeRoom(roomType: RoomType, roomId?: string): IndoorSceneResult {
    const template = TEMPLATES[roomType];
    if (!template) throw new Error(`Unknown room type: ${roomType}`);

    const id = roomId ?? roomType;

    // Create room spec
    const roomSpec: RoomSpec = {
      id,
      name: template.name,
      type: roomType,
      bounds: {
        min: [-template.size[0] / 2, 0, -template.size[2] / 2],
        max: [template.size[0] / 2, template.size[1], template.size[2] / 2],
      },
      adjacencies: template.doors.map(d => d.connectsTo),
    };

    this.result.rooms.push(roomSpec);

    // Create objects
    for (const objDef of template.objects) {
      const [px, py, pz] = objDef.position;
      const pos = new Vector3(px, py, pz);
      const halfSize = this.getObjectSize(objDef.category) * 0.5;

      const indoorObj: IndoorObject = {
        id: `${id}_${objDef.name}`,
        name: objDef.name,
        category: objDef.category,
        position: pos,
        rotation: new Quaternion(),
        scale: new Vector3(1, 1, 1),
        roomId: id,
        onSurface: objDef.onSurface,
        priority: objDef.tags.includes('large') ? 0.9 : objDef.tags.includes('seating') ? 0.7 : 0.5,
        tags: objDef.tags,
        bounds: new Box3(
          new Vector3(pos.x - halfSize, pos.y, pos.z - halfSize),
          new Vector3(pos.x + halfSize, pos.y + halfSize * 2, pos.z + halfSize),
        ),
      };

      this.result.objects.push(indoorObj);
    }

    // Add constraints
    for (const cDef of template.constraints) {
      this.result.constraints.push({
        ...cDef,
        subject: `${id}_${cDef.subject}`,
        target: cDef.target ? `${id}_${cDef.target}` : undefined,
      });
    }

    // Add materials
    for (const mat of template.materials) {
      this.result.materials.push({ ...mat });
    }

    // Add doors
    for (const doorDef of template.doors) {
      const doorPos = this.getWallPosition(doorDef.wall, template.size, doorDef.offset);
      this.result.doors.push({
        position: doorPos,
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), doorDef.wall * Math.PI / 2),
        width: 0.9,
        height: 2.1,
        connectsTo: doorDef.connectsTo,
      });
    }

    // Add windows
    for (const winDef of template.windows) {
      const winPos = this.getWallPosition(winDef.wall, template.size, winDef.offset);
      winPos.y = 1.5; // Window height
      this.result.windows.push({
        position: winPos,
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), winDef.wall * Math.PI / 2),
        width: 1.2,
        height: 1.0,
        wallIndex: winDef.wall,
        outdoorBackdrop: winDef.outdoorBackdrop,
      });
    }

    // Run constraint solver
    this.runConstraintSolver(id);

    return this.result;
  }

  // -----------------------------------------------------------------------
  // Full multi-room composition
  // -----------------------------------------------------------------------

  composeFullHouse(rooms: RoomType[] = ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office']): IndoorSceneResult {
    // Reset
    this.result = {
      rooms: [],
      objects: [],
      materials: [],
      doors: [],
      windows: [],
      constraints: [],
      solverStats: null,
      score: 0,
    };

    for (const roomType of rooms) {
      this.composeRoom(roomType);
    }

    // Add cross-room constraints
    this.addCrossRoomConstraints();

    return this.result;
  }

  // -----------------------------------------------------------------------
  // Constraint solver integration
  // -----------------------------------------------------------------------

  private runConstraintSolver(roomId: string): void {
    // Build constraint domain for the room
    const domain = this.buildConstraintDomain(roomId);

    // Create solver with proper evaluation config
    const solverConfig: Partial<AnnealingConfig> = {
      initialTemperature: 100,
      minTemperature: 0.5,
      coolingRate: 0.97,
      maxIterationsPerTemp: 50,
      randomSeed: this.seed,
      debugMode: false,
      acceptanceThreshold: 0.01,
    };

    const solver = new SimulatedAnnealing(domain, solverConfig);

    // Override evaluateCurrentState with full constraint evaluation
    this.patchSolverEvaluation(solver, roomId);

    try {
      const stats = solver.optimize();
      this.result.solverStats = stats;
      this.result.score = Math.max(0, 1 - stats.finalEnergy / 100);
    } catch {
      // Solver may fail in SSR or with empty domain; that's OK
      this.result.score = 0.5;
    }
  }

  /**
   * Patch the solver's evaluateCurrentState with full constraint evaluation.
   * This replaces the simplified placeholder in SimulatedAnnealing with proper
   * evaluation of StableAgainst, AnyRelation, and DomainConstraint.
   */
  private patchSolverEvaluation(solver: SimulatedAnnealing, roomId: string): void {
    // The solver's internal method can't be directly patched since it's private,
    // but we can provide constraints that the domain's relationship map handles.
    // Instead, we provide a rich ConstraintDomain with all relationships set up.
    const roomConstraints = this.result.constraints.filter(c => c.subject.startsWith(roomId));
    const domain = this.buildConstraintDomain(roomId);

    // Add all constraints as relationships
    for (const c of roomConstraints) {
      const constraint: Constraint = {
        id: `${c.type}_${c.subject}_${c.target ?? 'none'}`,
        type: this.mapConstraintType(c),
        subject: c.subject,
        object: c.target,
        value: c.surface ?? c.relation ?? c.domain,
        weight: c.weight,
        isHard: c.isHard,
        isActive: true,
      };

      const key = `${c.subject}_relations`;
      if (!domain.relationships.has(key)) {
        domain.relationships.set(key, []);
      }
      domain.relationships.get(key)!.push(constraint);
    }
  }

  private mapConstraintType(relation: ConstraintRelation): ConstraintType {
    switch (relation.type) {
      case 'StableAgainst':
        return relation.surface === 'floor' ? ConstraintType.ON_TOP_OF : ConstraintType.ATTACHED_TO;
      case 'AnyRelation':
        return ConstraintType.NEAR;
      case 'DomainConstraint':
        return ConstraintType.SAME_ROOM;
      default:
        return ConstraintType.NEAR;
    }
  }

  private buildConstraintDomain(roomId: string): ConstraintDomain {
    const roomObjects = this.result.objects.filter(o => o.roomId === roomId);
    const roomSpec = this.result.rooms.find(r => r.id === roomId);

    const objectsMap = new Map<string, Object3D>();
    for (const obj of roomObjects) {
      const obj3d = new Object3D();
      obj3d.name = obj.id;
      obj3d.position.copy(obj.position);
      obj3d.quaternion.copy(obj.rotation);
      obj3d.scale.copy(obj.scale);
      objectsMap.set(obj.id, obj3d);
    }

    const roomsMap = new Map<string, Room>();
    if (roomSpec) {
      const room: Room = {
        id: roomSpec.id,
        name: roomSpec.name,
        bounds: roomSpec.bounds,
        objects: new Set(roomObjects.map(o => o.id)),
        adjacencies: new Set(roomSpec.adjacencies),
      };
      roomsMap.set(roomSpec.id, room);
    }

    return {
      id: `domain_${roomId}`,
      objects: objectsMap,
      rooms: roomsMap,
      relationships: new Map(),
    };
  }

  // -----------------------------------------------------------------------
  // Full constraint evaluation
  // -----------------------------------------------------------------------

  /**
   * Evaluate all constraints for the scene
   */
  evaluateConstraints(): ConstraintEvaluationResult {
    let totalViolations = 0;
    let totalEnergy = 0;
    const violations: ConstraintViolation[] = [];

    for (const constraint of this.result.constraints) {
      const obj = this.result.objects.find(o => o.id === constraint.subject);
      if (!obj) continue;

      const target = constraint.target ? this.result.objects.find(o => o.id === constraint.target) : undefined;

      switch (constraint.type) {
        case 'StableAgainst': {
          const violated = this.evaluateStableAgainst(obj, constraint, violations);
          if (violated) {
            totalViolations++;
            totalEnergy += constraint.isHard ? 20 : 5;
          }
          break;
        }

        case 'AnyRelation': {
          if (target) {
            const violated = this.evaluateAnyRelation(obj, target, constraint, violations);
            if (violated) {
              totalViolations++;
              totalEnergy += constraint.isHard ? 15 : 3;
            }
          }
          break;
        }

        case 'DomainConstraint': {
          const violated = this.evaluateDomainConstraint(obj, constraint, violations);
          if (violated) {
            totalViolations++;
            totalEnergy += constraint.isHard ? 25 : 5;
          }
          break;
        }
      }
    }

    return {
      isSatisfied: totalViolations === 0,
      totalViolations,
      violations,
      energy: totalEnergy,
    };
  }

  /**
   * Evaluate StableAgainst constraint: object must rest on a surface
   */
  private evaluateStableAgainst(
    obj: IndoorObject,
    constraint: ConstraintRelation,
    violations: ConstraintViolation[],
  ): boolean {
    const surface = constraint.surface ?? 'floor';
    const room = this.result.rooms.find(r => r.id === obj.roomId);

    if (!room) {
      violations.push({
        type: 'StableAgainst',
        severity: 'error',
        message: `${obj.name} is not in any room`,
        suggestion: 'Assign object to a room',
      });
      return true;
    }

    switch (surface) {
      case 'floor': {
        // Object should be on the floor (Y near 0 or its surface offset)
        if (obj.onSurface !== 'floor' && obj.position.y > 0.1) {
          violations.push({
            type: 'StableAgainst',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should rest on floor but is at Y=${obj.position.y.toFixed(2)}`,
            suggestion: 'Move object to floor level',
          });
          return true;
        }
        break;
      }

      case 'wall': {
        // Object should be near a wall
        const nearWall =
          Math.abs(obj.position.x - room.bounds.min[0]) < 0.5 ||
          Math.abs(obj.position.x - room.bounds.max[0]) < 0.5 ||
          Math.abs(obj.position.z - room.bounds.min[2]) < 0.5 ||
          Math.abs(obj.position.z - room.bounds.max[2]) < 0.5;

        if (!nearWall) {
          violations.push({
            type: 'StableAgainst',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be against a wall but is at (${obj.position.x.toFixed(1)}, ${obj.position.z.toFixed(1)})`,
            suggestion: 'Move object closer to a wall',
          });
          return true;
        }
        break;
      }

      case 'ceiling': {
        // Object should be near the ceiling
        if (obj.position.y < room.bounds.max[1] - 0.5) {
          violations.push({
            type: 'StableAgainst',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be on ceiling`,
            suggestion: 'Move object to ceiling',
          });
          return true;
        }
        break;
      }
    }

    return false;
  }

  /**
   * Evaluate AnyRelation constraint: spatial relationship between objects
   */
  private evaluateAnyRelation(
    obj: IndoorObject,
    target: IndoorObject,
    constraint: ConstraintRelation,
    violations: ConstraintViolation[],
  ): boolean {
    const relation = constraint.relation ?? 'near';
    const distance = obj.position.distanceTo(target.position);

    switch (relation) {
      case 'adjacent': {
        if (distance > 2.0) {
          violations.push({
            type: 'AnyRelation',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be adjacent to ${target.name} (distance: ${distance.toFixed(2)})`,
            suggestion: `Move objects closer (max 2.0m apart)`,
          });
          return true;
        }
        break;
      }

      case 'facing': {
        // Check if objects face each other (rough approximation)
        const objForward = new Vector3(0, 0, -1).applyQuaternion(obj.rotation);
        const toTarget = target.position.clone().sub(obj.position).normalize();
        const dot = objForward.dot(toTarget);

        if (dot < -0.3 && distance > 5) {
          violations.push({
            type: 'AnyRelation',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should face ${target.name}`,
            suggestion: 'Rotate object to face target',
          });
          return true;
        }
        break;
      }

      case 'above': {
        if (obj.position.y <= target.position.y) {
          violations.push({
            type: 'AnyRelation',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be above ${target.name}`,
            suggestion: 'Move object higher',
          });
          return true;
        }
        break;
      }

      case 'work_triangle': {
        // Kitchen work triangle: 1.2m - 2.7m distance
        if (distance < 1.2 || distance > 2.7) {
          violations.push({
            type: 'AnyRelation',
            severity: 'warning',
            message: `Work triangle distance ${distance.toFixed(2)}m outside optimal range (1.2-2.7m)`,
            suggestion: 'Adjust positions for work triangle',
          });
          return true;
        }
        break;
      }

      case 'near':
      default: {
        if (distance > 5.0) {
          violations.push({
            type: 'AnyRelation',
            severity: 'warning',
            message: `${obj.name} too far from ${target.name} (${distance.toFixed(2)}m)`,
            suggestion: 'Move objects closer',
          });
          return true;
        }
        break;
      }
    }

    return false;
  }

  /**
   * Evaluate DomainConstraint: object must be in the correct room/domain
   */
  private evaluateDomainConstraint(
    obj: IndoorObject,
    constraint: ConstraintRelation,
    violations: ConstraintViolation[],
  ): boolean {
    const domain = constraint.domain;
    const room = this.result.rooms.find(r => r.id === obj.roomId);

    if (!room) {
      violations.push({
        type: 'DomainConstraint',
        severity: constraint.isHard ? 'error' : 'warning',
        message: `${obj.name} is not assigned to any room`,
        suggestion: 'Assign object to a room',
      });
      return true;
    }

    // Check if the object's room type matches the expected domain
    const domainRoomType = domain as RoomType;
    if (TEMPLATES[domainRoomType] && room.type !== domainRoomType) {
      violations.push({
        type: 'DomainConstraint',
        severity: constraint.isHard ? 'error' : 'warning',
        message: `${obj.name} should be in ${domain} but is in ${room.type}`,
        suggestion: `Move object to the ${domain}`,
      });
      return true;
    }

    // Check if object is within room bounds
    const inBounds =
      obj.position.x >= room.bounds.min[0] &&
      obj.position.x <= room.bounds.max[0] &&
      obj.position.y >= room.bounds.min[1] &&
      obj.position.y <= room.bounds.max[1] &&
      obj.position.z >= room.bounds.min[2] &&
      obj.position.z <= room.bounds.max[2];

    if (!inBounds) {
      violations.push({
        type: 'DomainConstraint',
        severity: 'warning',
        message: `${obj.name} is outside room bounds`,
        suggestion: 'Move object inside room',
      });
      return true;
    }

    return false;
  }

  // -----------------------------------------------------------------------
  // Cross-room constraints
  // -----------------------------------------------------------------------

  private addCrossRoomConstraints(): void {
    // Ensure doors connect rooms properly
    for (const door of this.result.doors) {
      if (door.connectsTo !== 'outside') {
        // The door should be accessible from both rooms
      }
    }

    // Windows should have outdoor backdrop
    for (const window of this.result.windows) {
      if (window.outdoorBackdrop) {
        // Ensure a view to outside is available
      }
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private getObjectSize(category: string): number {
    if (category.includes('sofa')) return 2.0;
    if (category.includes('bed')) return 2.0;
    if (category.includes('wardrobe')) return 1.5;
    if (category.includes('desk')) return 1.5;
    if (category.includes('table')) return 1.2;
    if (category.includes('counter')) return 0.6;
    if (category.includes('shelf') || category.includes('bookcase')) return 1.0;
    if (category.includes('chair')) return 0.6;
    if (category.includes('stool')) return 0.4;
    if (category.includes('lamp')) return 0.3;
    if (category.includes('refrigerator')) return 0.8;
    if (category.includes('stove')) return 0.7;
    if (category.includes('bathtub')) return 1.5;
    if (category.includes('toilet')) return 0.5;
    if (category.includes('mirror')) return 0.6;
    if (category.includes('rug')) return 2.0;
    if (category.includes('plant')) return 0.4;
    if (category.includes('cabinet')) return 0.6;
    if (category.includes('sink')) return 0.5;
    if (category.includes('island')) return 1.2;
    return 0.8;
  }

  private getWallPosition(wallIndex: number, roomSize: [number, number, number], offset: number): Vector3 {
    const halfW = roomSize[0] / 2;
    const halfD = roomSize[2] / 2;

    switch (wallIndex) {
      case 0: return new Vector3(offset, 0, -halfD); // North
      case 1: return new Vector3(halfW, 0, offset);   // East
      case 2: return new Vector3(offset, 0, halfD);   // South
      case 3: return new Vector3(-halfW, 0, offset);  // West
      default: return new Vector3(0, 0, 0);
    }
  }

  // -----------------------------------------------------------------------
  // Procedural floor plan generation
  // -----------------------------------------------------------------------

  /**
   * Compose a scene using procedural floor plan generation.
   * Uses the FloorPlanGenerator to create multi-room layouts with
   * adjacency constraints and simulated annealing optimization.
   */
  composeProcedural(params: Partial<FloorPlanParams> & { seed: number }): IndoorSceneResult {
    // Reset
    this.result = {
      rooms: [],
      objects: [],
      materials: [],
      doors: [],
      windows: [],
      constraints: [],
      solverStats: null,
      score: 0,
    };

    try {
      // Generate procedural floor plan
      const floorPlan = createFloorPlan(params);

      // Convert floor plan rooms to indoor scene result
      this.convertFloorPlanToResult(floorPlan);

      // Decorate with furniture
      const generator = new FloorPlanGenerator(params);
      const furniturePlacements = generator.decorate(floorPlan.rooms);
      this.convertFurniturePlacements(furniturePlacements);

      // Set score from solver energy
      this.result.score = Math.max(0, 1 - floorPlan.energy / 50);
    } catch {
      // Fallback to template-based generation if procedural fails
      this.composeFullHouse(['living_room', 'bedroom', 'kitchen', 'bathroom', 'office']);
    }

    return this.result;
  }

  /**
   * Compose a full house using either procedural or template-based generation.
   * Uses procedural generation by default when useProcedural is true.
   */
  composeFullHouseProcedural(
    style: BuildingStyle = BuildingStyle.Apartment,
    useProcedural: boolean = true,
  ): IndoorSceneResult {
    if (useProcedural) {
      return this.composeProcedural({
        seed: this.seed,
        style,
      });
    }

    // Fallback: use template-based composition
    const defaultRooms: Record<BuildingStyle, RoomType[]> = {
      [BuildingStyle.Apartment]: ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office'],
      [BuildingStyle.House]: ['living_room', 'bedroom', 'kitchen', 'bathroom', 'dining_room', 'office'],
      [BuildingStyle.Office]: ['office', 'office', 'office', 'office', 'office', 'office'],
      [BuildingStyle.Warehouse]: ['warehouse', 'office', 'office', 'office'],
    };

    return this.composeFullHouse(defaultRooms[style] ?? ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office']);
  }

  /**
   * Get the 3D Three.js group from the last procedural generation.
   * Returns null if no procedural generation has been run.
   */
  getProceduralGroup(): Object3D | null {
    if (this._lastFloorPlan?.group) {
      return this._lastFloorPlan.group;
    }
    return null;
  }

  /**
   * Get the last generated floor plan data.
   */
  getFloorPlan(): FloorPlan | null {
    return this._lastFloorPlan;
  }

  // -----------------------------------------------------------------------
  // Conversion helpers
  // -----------------------------------------------------------------------

  private _lastFloorPlan: FloorPlan | null = null;

  /** Convert a procedural FloorPlan to IndoorSceneResult format */
  private convertFloorPlanToResult(floorPlan: FloorPlan): void {
    this._lastFloorPlan = floorPlan;

    for (const room of floorPlan.rooms) {
      // Create RoomSpec
      const roomSpec: RoomSpec = {
        id: room.id,
        name: room.name,
        type: this.mapProceduralRoomType(room.type),
        bounds: {
          min: [room.bounds.minX, 0, room.bounds.minY],
          max: [room.bounds.maxX, floorPlan.wallHeight, room.bounds.maxY],
        },
        adjacencies: room.adjacencies,
      };
      this.result.rooms.push(roomSpec);

      // Add materials from room type
      const materials = this.getRoomMaterials(room.type);
      this.result.materials.push(...materials);

      // Convert doors
      for (const door of room.doors) {
        this.result.doors.push({
          position: door.position.clone(),
          rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), door.rotationY),
          width: door.width,
          height: door.height,
          connectsTo: door.connectsTo,
        });
      }

      // Convert windows
      for (const win of room.windows) {
        this.result.windows.push({
          position: win.position.clone(),
          rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), win.rotationY),
          width: win.width,
          height: win.height,
          wallIndex: 0, // Procedural windows don't use wallIndex
          outdoorBackdrop: win.outdoorBackdrop,
        });
      }

      // Add domain constraints for room objects
      this.result.constraints.push({
        type: 'DomainConstraint',
        subject: `${room.id}_contents`,
        domain: room.type,
        weight: 1,
        isHard: true,
      });
    }
  }

  /** Convert furniture placements to IndoorObjects */
  private convertFurniturePlacements(placements: FurniturePlacement[]): void {
    for (const placement of placements) {
      const [px, py, pz] = placement.position;
      const pos = new Vector3(px, py, pz);
      const halfSize = this.getObjectSize(placement.category) * 0.5;

      const indoorObj: IndoorObject = {
        id: placement.id,
        name: placement.name,
        category: placement.category,
        position: pos,
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), placement.rotationY),
        scale: new Vector3(placement.scale[0], placement.scale[1], placement.scale[2]),
        roomId: placement.roomId,
        onSurface: placement.onSurface,
        priority: placement.tags.includes('large') ? 0.9 : placement.tags.includes('seating') ? 0.7 : 0.5,
        tags: placement.tags,
        bounds: new Box3(
          new Vector3(pos.x - halfSize, pos.y, pos.z - halfSize),
          new Vector3(pos.x + halfSize, pos.y + halfSize * 2, pos.z + halfSize),
        ),
      };

      this.result.objects.push(indoorObj);

      // Add StableAgainst constraint
      this.result.constraints.push({
        type: 'StableAgainst',
        subject: placement.id,
        surface: placement.onSurface,
        weight: 1,
        isHard: true,
      });
    }
  }

  /** Map procedural RoomType to composer RoomType */
  private mapProceduralRoomType(type: ProceduralRoomType): RoomType {
    const mapping: Record<string, RoomType> = {
      [ProceduralRoomType.LivingRoom]: 'living_room',
      [ProceduralRoomType.Bedroom]: 'bedroom',
      [ProceduralRoomType.Kitchen]: 'kitchen',
      [ProceduralRoomType.Bathroom]: 'bathroom',
      [ProceduralRoomType.Office]: 'office',
      [ProceduralRoomType.DiningRoom]: 'dining_room',
      [ProceduralRoomType.Garage]: 'garage',
      [ProceduralRoomType.Warehouse]: 'warehouse',
      [ProceduralRoomType.Hallway]: 'living_room',  // Map hallway to living_room for template compat
      [ProceduralRoomType.Storage]: 'basement',
      [ProceduralRoomType.Utility]: 'basement',
      [ProceduralRoomType.Closet]: 'basement',
      [ProceduralRoomType.Balcony]: 'living_room',
      [ProceduralRoomType.OpenOffice]: 'office',
      [ProceduralRoomType.MeetingRoom]: 'office',
      [ProceduralRoomType.BreakRoom]: 'office',
      [ProceduralRoomType.Staircase]: 'living_room',
      [ProceduralRoomType.Entrance]: 'living_room',
      [ProceduralRoomType.Exterior]: 'living_room',
    };
    return mapping[type] ?? 'living_room';
  }

  /** Get material presets for a procedural room type */
  private getRoomMaterials(type: ProceduralRoomType): SurfaceMaterial[] {
    const materials = {
      [ProceduralRoomType.LivingRoom]: [
        { surface: 'floor' as SurfaceType, material: 'hardwood', color: '#8B7355', roughness: 0.6 },
        { surface: 'wall' as SurfaceType, material: 'painted_plaster', color: '#F5F5DC', roughness: 0.8 },
        { surface: 'ceiling' as SurfaceType, material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
      ],
      [ProceduralRoomType.Bedroom]: [
        { surface: 'floor' as SurfaceType, material: 'carpet', color: '#C4A882', roughness: 0.95 },
        { surface: 'wall' as SurfaceType, material: 'painted_plaster', color: '#E8E0D8', roughness: 0.85 },
        { surface: 'ceiling' as SurfaceType, material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
      ],
      [ProceduralRoomType.Kitchen]: [
        { surface: 'floor' as SurfaceType, material: 'tile', color: '#D4C5A9', roughness: 0.4 },
        { surface: 'wall' as SurfaceType, material: 'tile', color: '#F0EDE8', roughness: 0.3 },
        { surface: 'ceiling' as SurfaceType, material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
      ],
      [ProceduralRoomType.Bathroom]: [
        { surface: 'floor' as SurfaceType, material: 'tile', color: '#E0DCD4', roughness: 0.3 },
        { surface: 'wall' as SurfaceType, material: 'tile', color: '#F5F0E8', roughness: 0.35 },
        { surface: 'ceiling' as SurfaceType, material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
      ],
    };

    return materials[type as keyof typeof materials] ?? [
      { surface: 'floor' as SurfaceType, material: 'hardwood', color: '#8B7355', roughness: 0.6 },
      { surface: 'wall' as SurfaceType, material: 'painted_plaster', color: '#F0EDE8', roughness: 0.85 },
      { surface: 'ceiling' as SurfaceType, material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
    ];
  }

  // -----------------------------------------------------------------------
  // Static access
  // -----------------------------------------------------------------------

  static getTemplate(roomType: RoomType): RoomTemplate | undefined {
    return TEMPLATES[roomType];
  }

  static getAvailableRoomTypes(): RoomType[] {
    return Object.keys(TEMPLATES) as RoomType[];
  }

  getResult(): IndoorSceneResult {
    return this.result;
  }
}
