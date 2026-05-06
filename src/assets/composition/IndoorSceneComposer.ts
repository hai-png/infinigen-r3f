/**
 * Indoor Scene Composer for Infinigen R3F
 *
 * Mirrors NatureSceneComposer but for indoor scenes.
 * Full pipeline: room layout -> furniture placement -> lighting setup.
 *
 * Uses the existing FloorPlanGenerator and room-solver for procedural room layout,
 * with template-based fallback for quick single-room composition.
 * Integrates SimulatedAnnealing constraint solver for furniture placement validation.
 */

import { Vector3, Quaternion, Box3, Object3D, Color, MathUtils } from 'three';
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
// Seeded RNG helper (matches NatureSceneComposer.ComposerRNG)
// ---------------------------------------------------------------------------

class ComposerRNG {
  private s: number;
  constructor(seed: number) { this.s = seed; }
  next(): number {
    const x = Math.sin(this.s++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ---------------------------------------------------------------------------
// Indoor type definitions
// ---------------------------------------------------------------------------

export type RoomType =
  | 'living_room' | 'bedroom' | 'kitchen' | 'bathroom' | 'office'
  | 'dining_room' | 'studio' | 'garage' | 'library' | 'attic' | 'basement' | 'warehouse';

export type SurfaceType = 'floor' | 'wall' | 'ceiling';

/** Time-of-day lighting preset for indoor scenes */
export type IndoorTimeOfDay = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

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

// ---------------------------------------------------------------------------
// IndoorSceneConfig — mirrors NatureSceneConfig structure
// ---------------------------------------------------------------------------

/** Dimensions of the building / room in meters */
export interface IndoorDimensions {
  width: number;
  depth: number;
  height: number;
}

/** A furniture item spec for the config */
export interface FurnitureSpec {
  name: string;
  category: string;
  onSurface: SurfaceType;
  /** Relative position within room (0-1 normalised or absolute) */
  position: [number, number, number];
  tags: string[];
}

/** Indoor lighting parameters — mirrors NatureSceneComposer.LightingParams */
export interface IndoorLightingParams {
  /** Main ceiling light intensity */
  ceilingLightIntensity: number;
  /** Ceiling light colour (hex) */
  ceilingLightColor: string;
  /** Whether window light is enabled */
  windowLightEnabled: boolean;
  /** Window light intensity */
  windowLightIntensity: number;
  /** Window light colour (hex) */
  windowLightColor: string;
  /** Ambient fill intensity */
  ambientIntensity: number;
  /** Ambient fill colour (hex) */
  ambientColor: string;
  /** Hemisphere sky colour */
  hemisphereSkyColor: string;
  /** Hemisphere ground colour */
  hemisphereGroundColor: string;
  /** Hemisphere intensity */
  hemisphereIntensity: number;
}

/** Room geometry output — 3D-ready data produced by the layout step */
export interface RoomGeometry {
  /** Room ID this geometry belongs to */
  roomId: string;
  /** 2D polygon footprint as [x,z] pairs (world space) */
  footprint: [number, number][];
  /** Floor Y coordinate */
  floorY: number;
  /** Ceiling Y coordinate */
  ceilingY: number;
  /** Wall thickness */
  wallThickness: number;
}

/** Camera parameters for indoor scene — mirrors NatureSceneComposer.CameraParams */
export interface IndoorCameraParams {
  position: Vector3;
  target: Vector3;
  fov: number;
  near: number;
  far: number;
}

/** Full indoor scene configuration — mirrors NatureSceneConfig */
export interface IndoorSceneConfig {
  seed: number;
  roomType: RoomType;
  dimensions: Partial<IndoorDimensions>;
  furniture: FurnitureSpec[];
  lighting: Partial<IndoorLightingParams>;
  /** Building style for procedural layout (used when roomType list > 1) */
  buildingStyle: BuildingStyle;
  /** Room types for multi-room procedural generation */
  roomTypes: RoomType[];
  /** Whether to use procedural floor plan or template */
  useProceduralLayout: boolean;
  /** Time of day for lighting */
  timeOfDay: IndoorTimeOfDay;
  /** Camera override */
  camera: Partial<IndoorCameraParams>;
}

// ---------------------------------------------------------------------------
// IndoorSceneResult — mirrors NatureSceneResult structure
// ---------------------------------------------------------------------------

export interface IndoorSceneResult {
  seed: number;
  rooms: RoomSpec[];
  roomGeometries: RoomGeometry[];
  objects: IndoorObject[];
  materials: SurfaceMaterial[];
  doors: DoorPlacement[];
  windows: WindowPlacement[];
  constraints: ConstraintRelation[];
  lightingConfig: IndoorLightingParams;
  cameraConfig: IndoorCameraParams;
  solverStats: AnnealingStats | null;
  score: number;
  /** Procedural FloorPlan reference (if useProceduralLayout) */
  floorPlan: FloorPlan | null;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DIMENSIONS: IndoorDimensions = {
  width: 6,
  depth: 5,
  height: 3,
};

const DEFAULT_LIGHTING: Record<IndoorTimeOfDay, IndoorLightingParams> = {
  morning: {
    ceilingLightIntensity: 0.6,
    ceilingLightColor: '#FFF5E0',
    windowLightEnabled: true,
    windowLightIntensity: 1.4,
    windowLightColor: '#FFE4B5',
    ambientIntensity: 0.35,
    ambientColor: '#E8D8C8',
    hemisphereSkyColor: '#87CEEB',
    hemisphereGroundColor: '#8B7355',
    hemisphereIntensity: 0.3,
  },
  midday: {
    ceilingLightIntensity: 0.4,
    ceilingLightColor: '#FFFFFF',
    windowLightEnabled: true,
    windowLightIntensity: 1.8,
    windowLightColor: '#FFFFF0',
    ambientIntensity: 0.45,
    ambientColor: '#D8E8F0',
    hemisphereSkyColor: '#87CEEB',
    hemisphereGroundColor: '#8B7355',
    hemisphereIntensity: 0.35,
  },
  afternoon: {
    ceilingLightIntensity: 0.5,
    ceilingLightColor: '#FFF0D0',
    windowLightEnabled: true,
    windowLightIntensity: 1.5,
    windowLightColor: '#FFD700',
    ambientIntensity: 0.4,
    ambientColor: '#E0D0C0',
    hemisphereSkyColor: '#FFA07A',
    hemisphereGroundColor: '#8B7355',
    hemisphereIntensity: 0.3,
  },
  evening: {
    ceilingLightIntensity: 0.9,
    ceilingLightColor: '#FFE4C4',
    windowLightEnabled: true,
    windowLightIntensity: 0.4,
    windowLightColor: '#FF8C00',
    ambientIntensity: 0.25,
    ambientColor: '#C8B8A8',
    hemisphereSkyColor: '#FF6347',
    hemisphereGroundColor: '#5C3317',
    hemisphereIntensity: 0.2,
  },
  night: {
    ceilingLightIntensity: 1.2,
    ceilingLightColor: '#FFF8DC',
    windowLightEnabled: false,
    windowLightIntensity: 0.05,
    windowLightColor: '#4169E1',
    ambientIntensity: 0.15,
    ambientColor: '#A0A0C0',
    hemisphereSkyColor: '#191970',
    hemisphereGroundColor: '#2F2F2F',
    hemisphereIntensity: 0.1,
  },
};

const DEFAULT_CAMERA: IndoorCameraParams = {
  position: new Vector3(0, 1.6, 4),
  target: new Vector3(0, 1.0, 0),
  fov: 60,
  near: 0.1,
  far: 50,
};

// ---------------------------------------------------------------------------
// Template definitions (preserved from original)
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
// Templates (unchanged — keep for backward compatibility)
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
// IndoorSceneComposer — mirrors NatureSceneComposer
// ---------------------------------------------------------------------------

export class IndoorSceneComposer {
  private config: IndoorSceneConfig;
  private rng: ComposerRNG;
  private seed: number;
  private result: IndoorSceneResult;

  constructor(config: Partial<IndoorSceneConfig> = {}) {
    this.seed = config.seed ?? 42;
    this.rng = new ComposerRNG(this.seed);
    this.config = this.mergeDefaults(config);
    this.result = this.createEmptyResult();
  }

  // -----------------------------------------------------------------------
  // Full pipeline (mirrors NatureSceneComposer.compose)
  // -----------------------------------------------------------------------

  /**
   * Run the full indoor scene composition pipeline.
   * Pipeline: room layout -> furniture placement -> lighting setup.
   */
  composeIndoorScene(config?: Partial<IndoorSceneConfig>): IndoorSceneResult {
    if (config) {
      this.config = this.mergeDefaults(config);
      if (config.seed !== undefined) {
        this.seed = config.seed;
        this.rng = new ComposerRNG(this.seed);
      }
    }

    // Reset result
    this.result = this.createEmptyResult();

    // Step 1: Generate room layout
    this.generateRoomLayout();

    // Step 2: Place furniture
    this.placeFurniture();

    // Step 3: Configure lighting
    this.configureLighting();

    // Step 4: Setup camera
    this.setupCamera();

    // Step 5: Run constraint solver
    this.runConstraintSolver();

    return this.result;
  }

  /** Backward-compatible compose alias */
  compose(seed?: number): IndoorSceneResult {
    if (seed !== undefined) {
      this.seed = seed;
      this.rng = new ComposerRNG(seed);
      this.config.seed = seed;
    }
    return this.composeIndoorScene();
  }

  // -----------------------------------------------------------------------
  // Step 1: Generate room layout
  // -----------------------------------------------------------------------

  generateRoomLayout(): RoomSpec[] {
    if (this.config.useProceduralLayout && this.config.roomTypes.length > 1) {
      this.generateProceduralLayout();
    } else {
      // Template-based single room
      const roomType = this.config.roomType;
      const template = TEMPLATES[roomType];
      if (!template) return this.result.rooms;

      const dims = this.config.dimensions;
      const id = roomType;

      const roomSpec: RoomSpec = {
        id,
        name: template.name,
        type: roomType,
        bounds: {
          min: [-(dims.width ?? template.size[0]) / 2, 0, -(dims.depth ?? template.size[2]) / 2],
          max: [(dims.width ?? template.size[0]) / 2, dims.height ?? template.size[1], (dims.depth ?? template.size[2]) / 2],
        },
        adjacencies: template.doors.map(d => d.connectsTo),
      };

      this.result.rooms.push(roomSpec);

      // Generate room geometry from bounds
      const b = roomSpec.bounds;
      this.result.roomGeometries.push({
        roomId: id,
        footprint: [
          [b.min[0], b.min[2]],
          [b.max[0], b.min[2]],
          [b.max[0], b.max[2]],
          [b.min[0], b.max[2]],
        ],
        floorY: b.min[1],
        ceilingY: b.max[1],
        wallThickness: 0.15,
      });

      // Add doors and windows from template
      for (const doorDef of template.doors) {
        const doorPos = this.getWallPosition(doorDef.wall, [
          dims.width ?? template.size[0],
          dims.height ?? template.size[1],
          dims.depth ?? template.size[2],
        ], doorDef.offset);
        this.result.doors.push({
          position: doorPos,
          rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), doorDef.wall * Math.PI / 2),
          width: 0.9,
          height: 2.1,
          connectsTo: doorDef.connectsTo,
        });
      }

      for (const winDef of template.windows) {
        const winPos = this.getWallPosition(winDef.wall, [
          dims.width ?? template.size[0],
          dims.height ?? template.size[1],
          dims.depth ?? template.size[2],
        ], winDef.offset);
        winPos.y = 1.5;
        this.result.windows.push({
          position: winPos,
          rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), winDef.wall * Math.PI / 2),
          width: 1.2,
          height: 1.0,
          wallIndex: winDef.wall,
          outdoorBackdrop: winDef.outdoorBackdrop,
        });
      }

      // Add materials
      for (const mat of template.materials) {
        this.result.materials.push({ ...mat });
      }
    }

    return this.result.rooms;
  }

  /**
   * Generate rooms using the FloorPlanGenerator (procedural path).
   */
  private generateProceduralLayout(): void {
    try {
      const params: FloorPlanParams = {
        seed: this.seed,
        totalArea: this.config.dimensions.width! * this.config.dimensions.depth!,
        roomCount: this.config.roomTypes.length,
        roomTypes: this.config.roomTypes.map(rt => this.mapToProceduralRoomType(rt)),
        style: this.config.buildingStyle,
        stories: 1,
        wallHeight: this.config.dimensions.height ?? 3,
        wallThickness: 0.15,
        unit: 0.5,
        solverIterations: 200,
        generateGeometry: true,
      };

      const floorPlan = createFloorPlan(params);
      this.result.floorPlan = floorPlan;

      // Convert FloorPlan rooms to RoomSpec + RoomGeometry
      for (const room of floorPlan.rooms) {
        const roomType = this.mapProceduralRoomType(room.type);
        const bounds = room.bounds;

        this.result.rooms.push({
          id: room.id,
          name: room.name,
          type: roomType,
          bounds: {
            min: [bounds.minX, 0, bounds.minY],
            max: [bounds.maxX, floorPlan.wallHeight, bounds.maxY],
          },
          adjacencies: room.adjacencies,
        });

        this.result.roomGeometries.push({
          roomId: room.id,
          footprint: room.polygon.map(([x, y]) => [x, y] as [number, number]),
          floorY: 0,
          ceilingY: floorPlan.wallHeight,
          wallThickness: floorPlan.wallThickness,
        });

        // Add materials per room
        const materials = this.getRoomMaterials(room.type);
        this.result.materials.push(...materials);
      }

      // Convert doors and windows from floor plan
      for (const door of floorPlan.doors) {
        this.result.doors.push({
          position: door.position.clone(),
          rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), door.rotationY),
          width: door.width,
          height: door.height,
          connectsTo: door.connectsTo,
        });
      }

      for (const win of floorPlan.windows) {
        this.result.windows.push({
          position: win.position.clone(),
          rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), win.rotationY),
          width: win.width,
          height: win.height,
          wallIndex: 0,
          outdoorBackdrop: win.outdoorBackdrop,
        });
      }
    } catch (err) {
      // Silently fall back to template-based layout
      if (process.env.NODE_ENV === 'development') console.debug('[IndoorSceneComposer] procedural layout fallback:', err);
      // Fallback: generate from templates
      for (const rt of this.config.roomTypes) {
        const template = TEMPLATES[rt];
        if (!template) continue;
        const id = rt;
        this.result.rooms.push({
          id,
          name: template.name,
          type: rt,
          bounds: {
            min: [-template.size[0] / 2, 0, -template.size[2] / 2],
            max: [template.size[0] / 2, template.size[1], template.size[2] / 2],
          },
          adjacencies: template.doors.map(d => d.connectsTo),
        });
        for (const mat of template.materials) {
          this.result.materials.push({ ...mat });
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 2: Place furniture
  // -----------------------------------------------------------------------

  placeFurniture(): IndoorObject[] {
    // If config provides furniture, use it; otherwise use template defaults
    const furnitureList = this.config.furniture;

    if (furnitureList.length > 0) {
      // Place from config
      for (const room of this.result.rooms) {
        for (const fSpec of furnitureList) {
          const pos = new Vector3(...fSpec.position);
          const halfSize = this.getObjectSize(fSpec.category) * 0.5;

          this.result.objects.push({
            id: `${room.id}_${fSpec.name}`,
            name: fSpec.name,
            category: fSpec.category,
            position: pos,
            rotation: new Quaternion(),
            scale: new Vector3(1, 1, 1),
            roomId: room.id,
            onSurface: fSpec.onSurface,
            priority: fSpec.tags.includes('large') ? 0.9 : fSpec.tags.includes('seating') ? 0.7 : 0.5,
            tags: fSpec.tags,
            bounds: new Box3(
              new Vector3(pos.x - halfSize, pos.y, pos.z - halfSize),
              new Vector3(pos.x + halfSize, pos.y + halfSize * 2, pos.z + halfSize),
            ),
          });
        }
      }
    } else {
      // Use template objects
      for (const room of this.result.rooms) {
        const template = TEMPLATES[room.type];
        if (!template) continue;

        for (const objDef of template.objects) {
          const [px, py, pz] = objDef.position;
          const pos = new Vector3(px, py, pz);
          const halfSize = this.getObjectSize(objDef.category) * 0.5;

          this.result.objects.push({
            id: `${room.id}_${objDef.name}`,
            name: objDef.name,
            category: objDef.category,
            position: pos,
            rotation: new Quaternion(),
            scale: new Vector3(1, 1, 1),
            roomId: room.id,
            onSurface: objDef.onSurface,
            priority: objDef.tags.includes('large') ? 0.9 : objDef.tags.includes('seating') ? 0.7 : 0.5,
            tags: objDef.tags,
            bounds: new Box3(
              new Vector3(pos.x - halfSize, pos.y, pos.z - halfSize),
              new Vector3(pos.x + halfSize, pos.y + halfSize * 2, pos.z + halfSize),
            ),
          });
        }

        // Add template constraints
        for (const cDef of template.constraints) {
          this.result.constraints.push({
            ...cDef,
            subject: `${room.id}_${cDef.subject}`,
            target: cDef.target ? `${room.id}_${cDef.target}` : undefined,
          });
        }
      }
    }

    return this.result.objects;
  }

  // -----------------------------------------------------------------------
  // Step 3: Configure lighting (mirrors NatureSceneComposer.configureLighting)
  // -----------------------------------------------------------------------

  configureLighting(): IndoorLightingParams {
    const tod = this.config.timeOfDay;
    const light = this.result.lightingConfig;

    // Apply time-of-day presets
    const preset = DEFAULT_LIGHTING[tod];
    Object.assign(light, preset);

    // Room-specific adjustments
    const roomType = this.config.roomType;
    switch (roomType) {
      case 'kitchen':
        light.ceilingLightIntensity = Math.max(light.ceilingLightIntensity, 0.8);
        light.ceilingLightColor = '#FFFFFF'; // Kitchens need bright neutral light
        break;
      case 'bathroom':
        light.ceilingLightIntensity = Math.max(light.ceilingLightIntensity, 0.7);
        light.ceilingLightColor = '#FFF8F0';
        break;
      case 'bedroom':
        light.ceilingLightIntensity = Math.min(light.ceilingLightIntensity, 0.5);
        light.ceilingLightColor = '#FFF0D0'; // Warmer, softer
        break;
      case 'garage':
      case 'warehouse':
        light.ceilingLightIntensity = 1.0;
        light.ceilingLightColor = '#F0F0F0'; // Cool fluorescent
        break;
      case 'library':
        light.ceilingLightIntensity = 0.6;
        light.ceilingLightColor = '#FFE4B5'; // Warm reading light
        break;
    }

    return light;
  }

  // -----------------------------------------------------------------------
  // Step 4: Setup camera (mirrors NatureSceneComposer.setupCamera)
  // -----------------------------------------------------------------------

  setupCamera(): IndoorCameraParams {
    const cam = this.result.cameraConfig;

    // Position camera inside the room looking toward center
    if (this.result.rooms.length > 0) {
      const room = this.result.rooms[0];
      const b = room.bounds;
      const cx = (b.min[0] + b.max[0]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      const roomHeight = b.max[1] - b.min[1];

      // Place camera at 1.6m height (eye level), near one wall
      cam.position.set(cx, b.min[1] + roomHeight * 0.53, b.max[2] - 0.5);
      cam.target.set(cx, b.min[1] + roomHeight * 0.4, cz);
    }

    return cam;
  }

  // -----------------------------------------------------------------------
  // Step 5: Run constraint solver
  // -----------------------------------------------------------------------

  private runConstraintSolver(): void {
    // Add cross-room constraints
    this.addCrossRoomConstraints();

    // Run solver for each room
    for (const room of this.result.rooms) {
      this.runConstraintSolverForRoom(room.id);
    }
  }

  private runConstraintSolverForRoom(roomId: string): void {
    const domain = this.buildConstraintDomain(roomId);

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
    this.patchSolverEvaluation(solver, roomId);

    try {
      const stats = solver.optimize();
      this.result.solverStats = stats;
      this.result.score = Math.max(0, 1 - stats.finalEnergy / 100);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.debug('[IndoorSceneComposer] solver fallback:', err);
      this.result.score = 0.5;
    }
  }

  private patchSolverEvaluation(solver: SimulatedAnnealing, roomId: string): void {
    const roomConstraints = this.result.constraints.filter(c => c.subject.startsWith(roomId));
    const domain = this.buildConstraintDomain(roomId);

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
  // Constraint evaluation (preserved from original)
  // -----------------------------------------------------------------------

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
        const nearWall =
          Math.abs(obj.position.x - room.bounds.min[0]) < 0.5 ||
          Math.abs(obj.position.x - room.bounds.max[0]) < 0.5 ||
          Math.abs(obj.position.z - room.bounds.min[2]) < 0.5 ||
          Math.abs(obj.position.z - room.bounds.max[2]) < 0.5;
        if (!nearWall) {
          violations.push({
            type: 'StableAgainst',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be against a wall`,
            suggestion: 'Move object closer to a wall',
          });
          return true;
        }
        break;
      }
      case 'ceiling': {
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
            suggestion: 'Move objects closer (max 2.0m apart)',
          });
          return true;
        }
        break;
      }
      case 'facing': {
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
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be near ${target.name} (distance: ${distance.toFixed(2)})`,
            suggestion: 'Move objects closer',
          });
          return true;
        }
        break;
      }
    }
    return false;
  }

  private evaluateDomainConstraint(
    obj: IndoorObject,
    constraint: ConstraintRelation,
    violations: ConstraintViolation[],
  ): boolean {
    const domain = constraint.domain ?? '';
    const room = this.result.rooms.find(r => r.id === obj.roomId);
    if (!room) return false;

    if (domain !== room.type && domain !== obj.roomId) {
      violations.push({
        type: 'DomainConstraint',
        severity: constraint.isHard ? 'error' : 'warning',
        message: `${obj.name} should be in ${domain} but is in ${room.type}`,
        suggestion: `Move object to ${domain}`,
      });
      return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Backward-compatible public methods
  // -----------------------------------------------------------------------

  /** Compose a single room from template (backward compat) */
  composeRoom(roomType: RoomType, roomId?: string): IndoorSceneResult {
    const id = roomId ?? roomType;
    const template = TEMPLATES[roomType];
    if (!template) throw new Error(`Unknown room type: ${roomType}`);

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

    this.result.roomGeometries.push({
      roomId: id,
      footprint: [
        [roomSpec.bounds.min[0], roomSpec.bounds.min[2]],
        [roomSpec.bounds.max[0], roomSpec.bounds.min[2]],
        [roomSpec.bounds.max[0], roomSpec.bounds.max[2]],
        [roomSpec.bounds.min[0], roomSpec.bounds.max[2]],
      ],
      floorY: 0,
      ceilingY: template.size[1],
      wallThickness: 0.15,
    });

    for (const objDef of template.objects) {
      const [px, py, pz] = objDef.position;
      const pos = new Vector3(px, py, pz);
      const halfSize = this.getObjectSize(objDef.category) * 0.5;
      this.result.objects.push({
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
      });
    }

    for (const cDef of template.constraints) {
      this.result.constraints.push({
        ...cDef,
        subject: `${id}_${cDef.subject}`,
        target: cDef.target ? `${id}_${cDef.target}` : undefined,
      });
    }

    for (const mat of template.materials) {
      this.result.materials.push({ ...mat });
    }

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

    for (const winDef of template.windows) {
      const winPos = this.getWallPosition(winDef.wall, template.size, winDef.offset);
      winPos.y = 1.5;
      this.result.windows.push({
        position: winPos,
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), winDef.wall * Math.PI / 2),
        width: 1.2,
        height: 1.0,
        wallIndex: winDef.wall,
        outdoorBackdrop: winDef.outdoorBackdrop,
      });
    }

    this.runConstraintSolverForRoom(id);
    return this.result;
  }

  /** Full multi-room composition (backward compat) */
  composeFullHouse(rooms: RoomType[] = ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office']): IndoorSceneResult {
    this.result = this.createEmptyResult();
    for (const roomType of rooms) {
      this.composeRoom(roomType);
    }
    this.addCrossRoomConstraints();
    return this.result;
  }

  /** Procedural composition (backward compat) */
  composeProcedural(params: Partial<FloorPlanParams> & { seed: number }): IndoorSceneResult {
    this.result = this.createEmptyResult();
    this.seed = params.seed;
    this.rng = new ComposerRNG(this.seed);

    try {
      const floorPlan = createFloorPlan(params);
      this.result.floorPlan = floorPlan;
      this.convertFloorPlanToResult(floorPlan);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.debug('[IndoorSceneComposer] composeProcedural fallback:', err);
      this.composeFullHouse(['living_room', 'bedroom', 'kitchen', 'bathroom', 'office']);
    }
    return this.result;
  }

  composeFullHouseProcedural(
    style: BuildingStyle = BuildingStyle.House,
    totalArea: number = 120,
  ): IndoorSceneResult {
    const defaultRooms: Record<string, RoomType[]> = {
      [BuildingStyle.House]: ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office'],
      [BuildingStyle.Apartment]: ['living_room', 'bedroom', 'kitchen', 'bathroom'],
      [BuildingStyle.Office]: ['office', 'office', 'office', 'office'],
      [BuildingStyle.Warehouse]: ['warehouse', 'warehouse'],
    };

    if (style === BuildingStyle.House || style === BuildingStyle.Apartment || style === BuildingStyle.Office) {
      return this.composeProcedural({
        seed: this.seed,
        totalArea,
        roomCount: defaultRooms[style]?.length ?? 4,
        style,
      });
    }
    return this.composeFullHouse(defaultRooms[style] ?? ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office']);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private mergeDefaults(config: Partial<IndoorSceneConfig>): IndoorSceneConfig {
    return {
      seed: config.seed ?? 42,
      roomType: config.roomType ?? 'living_room',
      dimensions: { ...DEFAULT_DIMENSIONS, ...config.dimensions },
      furniture: config.furniture ?? [],
      lighting: { ...DEFAULT_LIGHTING.midday, ...config.lighting },
      buildingStyle: config.buildingStyle ?? BuildingStyle.House,
      roomTypes: config.roomTypes ?? [config.roomType ?? 'living_room'],
      useProceduralLayout: config.useProceduralLayout ?? false,
      timeOfDay: config.timeOfDay ?? 'midday',
      camera: {
        ...DEFAULT_CAMERA,
        ...config.camera,
        position: config.camera?.position ?? DEFAULT_CAMERA.position.clone(),
        target: config.camera?.target ?? DEFAULT_CAMERA.target.clone(),
      },
    };
  }

  private createEmptyResult(): IndoorSceneResult {
    return {
      seed: this.seed,
      rooms: [],
      roomGeometries: [],
      objects: [],
      materials: [],
      doors: [],
      windows: [],
      constraints: [],
      lightingConfig: { ...DEFAULT_LIGHTING.midday, ...this.config.lighting },
      cameraConfig: {
        ...DEFAULT_CAMERA,
        ...this.config.camera,
        position: this.config.camera?.position ?? DEFAULT_CAMERA.position.clone(),
        target: this.config.camera?.target ?? DEFAULT_CAMERA.target.clone(),
      },
      solverStats: null,
      score: 0,
      floorPlan: null,
    };
  }

  private addCrossRoomConstraints(): void {
    // For each pair of rooms connected by doors, add adjacency constraints
    for (const door of this.result.doors) {
      if (door.connectsTo === 'outside') continue;

      // Find objects near the door in the source room
      const sourceRoom = this.result.rooms.find(r =>
        this.result.objects.some(o => o.roomId === r.id && o.position.distanceTo(door.position) < 3),
      );
      if (!sourceRoom) continue;

      const targetRoom = this.result.rooms.find(r => r.id === door.connectsTo);
      if (!targetRoom) continue;

      // Ensure rooms are in each other's adjacency list
      if (!sourceRoom.adjacencies.includes(targetRoom.id)) {
        sourceRoom.adjacencies.push(targetRoom.id);
      }
      if (!targetRoom.adjacencies.includes(sourceRoom.id)) {
        targetRoom.adjacencies.push(sourceRoom.id);
      }
    }
  }

  private getObjectSize(category: string): number {
    const sizeMap: Record<string, number> = {
      'furniture.sofa': 2.0,
      'furniture.bed.double': 2.0,
      'furniture.table.coffee': 0.8,
      'furniture.table.dining': 1.5,
      'furniture.table.kitchen_island': 1.2,
      'furniture.desk': 1.2,
      'furniture.chair.armchair': 0.8,
      'furniture.chair.office': 0.6,
      'furniture.chair.dining': 0.5,
      'furniture.shelf.bookcase': 0.9,
      'furniture.nightstand': 0.5,
      'furniture.wardrobe': 1.0,
      'furniture.workbench': 1.5,
      'furniture.cabinet.china': 1.2,
      'furniture.cabinet.sideboard': 1.0,
      'furniture.cabinet.tool': 0.8,
      'furniture.storage.filing': 0.5,
      'furniture.stool.bar': 0.35,
      'furniture.stool': 0.35,
      'furniture.shelf.storage': 1.0,
      'furniture.shelf.utility': 0.8,
      'furniture.rack.clothes': 1.0,
      'furniture.ladder.library': 0.4,
      'furniture.table.side': 0.5,
      'furniture.table.utility': 0.8,
      'architectural.counter': 0.6,
      'appliance.stove': 0.7,
      'appliance.refrigerator': 0.8,
      'appliance.furnace': 0.8,
      'appliance.water_heater': 0.5,
      'fixture.bathtub': 1.6,
      'fixture.toilet': 0.5,
      'fixture.sink.kitchen': 0.5,
      'fixture.sink.bathroom': 0.4,
      'decor.rug': 2.0,
      'decor.mirror.wall': 0.8,
      'decor.mannequin': 0.5,
      'lighting.lamp.floor': 0.35,
      'lighting.chandelier': 0.5,
      'lighting.fluorescent': 1.2,
      'lighting.window': 0.5,
      'lighting.studio.softbox': 0.5,
      'lighting.studio.stand': 0.3,
      'lighting.industrial.highbay': 0.5,
      'plant.indoor.small': 0.3,
      'equipment.backdrop': 2.5,
      'equipment.tripod': 0.3,
      'vehicle.car': 2.2,
      'vehicle.forklift': 1.5,
      'industrial.shelving.pallet': 1.2,
      'industrial.pallet': 1.0,
      'storage.box.large': 0.6,
      'storage.trunk': 0.7,
    };

    // Try exact match first, then prefix match
    if (sizeMap[category]) return sizeMap[category];
    for (const [key, size] of Object.entries(sizeMap)) {
      if (category.startsWith(key.split('.').slice(0, -1).join('.'))) return size;
    }
    return 0.6; // default
  }

  private getWallPosition(wallIndex: number, roomSize: [number, number, number], offset: number): Vector3 {
    const [w, , d] = roomSize;
    switch (wallIndex) {
      case 0: return new Vector3(offset, 0, -d / 2); // North
      case 1: return new Vector3(w / 2, 0, offset);  // East
      case 2: return new Vector3(offset, 0, d / 2);  // South
      case 3: return new Vector3(-w / 2, 0, offset);  // West
      default: return new Vector3(0, 0, 0);
    }
  }

  /** Map composer RoomType to procedural RoomType */
  private mapToProceduralRoomType(rt: RoomType): ProceduralRoomType {
    const mapping: Record<RoomType, ProceduralRoomType> = {
      living_room: ProceduralRoomType.LivingRoom,
      bedroom: ProceduralRoomType.Bedroom,
      kitchen: ProceduralRoomType.Kitchen,
      bathroom: ProceduralRoomType.Bathroom,
      office: ProceduralRoomType.Office,
      dining_room: ProceduralRoomType.DiningRoom,
      studio: ProceduralRoomType.Office,
      garage: ProceduralRoomType.Garage,
      library: ProceduralRoomType.Office,
      attic: ProceduralRoomType.Bedroom,
      basement: ProceduralRoomType.Utility,
      warehouse: ProceduralRoomType.Warehouse,
    };
    return mapping[rt] ?? ProceduralRoomType.LivingRoom;
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
      [ProceduralRoomType.Hallway]: 'living_room',
      [ProceduralRoomType.Garage]: 'garage',
      [ProceduralRoomType.Storage]: 'warehouse',
      [ProceduralRoomType.Utility]: 'basement',
      [ProceduralRoomType.Closet]: 'bedroom',
      [ProceduralRoomType.Balcony]: 'living_room',
      [ProceduralRoomType.Warehouse]: 'warehouse',
      [ProceduralRoomType.OpenOffice]: 'office',
      [ProceduralRoomType.MeetingRoom]: 'office',
      [ProceduralRoomType.BreakRoom]: 'living_room',
      [ProceduralRoomType.Staircase]: 'living_room',
      [ProceduralRoomType.Entrance]: 'living_room',
      [ProceduralRoomType.Exterior]: 'warehouse',
    };
    return mapping[type] ?? 'living_room';
  }

  private getRoomMaterials(type: ProceduralRoomType): SurfaceMaterial[] {
    const roomType = this.mapProceduralRoomType(type);
    const template = TEMPLATES[roomType];
    if (template) return template.materials.map(m => ({ ...m }));

    // Fallback materials
    return [
      { surface: 'floor', material: 'hardwood', color: '#8B7355', roughness: 0.6 },
      { surface: 'wall', material: 'painted_plaster', color: '#F0ECE8', roughness: 0.85 },
      { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
    ];
  }

  private convertFloorPlanToResult(floorPlan: FloorPlan): void {
    for (const room of floorPlan.rooms) {
      const roomType = this.mapProceduralRoomType(room.type);
      const bounds = room.bounds;

      this.result.rooms.push({
        id: room.id,
        name: room.name,
        type: roomType,
        bounds: {
          min: [bounds.minX, 0, bounds.minY],
          max: [bounds.maxX, floorPlan.wallHeight, bounds.maxY],
        },
        adjacencies: room.adjacencies,
      });

      this.result.roomGeometries.push({
        roomId: room.id,
        footprint: room.polygon.map(([x, y]) => [x, y] as [number, number]),
        floorY: 0,
        ceilingY: floorPlan.wallHeight,
        wallThickness: floorPlan.wallThickness,
      });

      const materials = this.getRoomMaterials(room.type);
      this.result.materials.push(...materials);
    }

    for (const door of floorPlan.doors) {
      this.result.doors.push({
        position: door.position.clone(),
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), door.rotationY),
        width: door.width,
        height: door.height,
        connectsTo: door.connectsTo,
      });
    }

    for (const win of floorPlan.windows) {
      this.result.windows.push({
        position: win.position.clone(),
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), win.rotationY),
        width: win.width,
        height: win.height,
        wallIndex: 0,
        outdoorBackdrop: win.outdoorBackdrop,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Static utility (mirrors NatureSceneComposer.quickCompose)
  // -----------------------------------------------------------------------

  static quickCompose(seed: number, overrides?: Partial<IndoorSceneConfig>): IndoorSceneResult {
    const composer = new IndoorSceneComposer({ ...overrides, seed });
    return composer.composeIndoorScene();
  }
}
