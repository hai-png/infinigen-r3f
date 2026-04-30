/**
 * Room Types - Core type definitions for room-based constraint solving
 * 
 * Ported from: infinigen/core/constraints/example_solver/room/
 * Defines room types, properties, and architectural elements.
 */

import * as THREE from 'three';

/**
 * Room type enumeration
 */
export enum RoomType {
  Living = 'living',
  Bedroom = 'bedroom',
  Kitchen = 'kitchen',
  Bathroom = 'bathroom',
  Dining = 'dining',
  Hallway = 'hallway',
  Closet = 'closet',
  Office = 'office',
  Garage = 'garage',
  Laundry = 'laundry',
  Storage = 'storage',
  Balcony = 'balcony',
  Nursery = 'nursery',
  Playroom = 'playroom',
  Gym = 'gym',
  Library = 'library',
  Studio = 'studio',
  Utility = 'utility',
  Pantry = 'pantry',
  Foyer = 'foyer',
}

/**
 * Room properties defining constraints and characteristics
 */
export interface RoomProperties {
  minArea: number;
  maxArea: number;
  minWidth: number;
  minHeight: number;
  preferredAspectRatio: number;
  naturalLightRequired: boolean;
  privacyLevel: number;
  accessibilityRequired: boolean;
  requiredConnections: RoomType[];
  optionalConnections: RoomType[];
  floorMaterial: string;
  wallMaterial: string;
  ceilingHeight: number;
}

/**
 * Door connecting two rooms
 */
export interface RoomBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface Door {
  id: string;
  fromRoom: string;
  toRoom: string;
  connectsTo: string;
  position: THREE.Vector2;
  width: number;
  height: number;
  isSliding: boolean;
  isOpen: boolean;
}

/**
 * Window on an exterior wall
 */
export interface Window {
  id: string;
  roomId: string;
  position: THREE.Vector2;
  width: number;
  height: number;
  sillHeight: number;
  orientation: number;
  isOperable: boolean;
}

/**
 * Room representation in the floor plan
 */
export interface Room {
  id: string;
  name: string;
  type: RoomType;
  properties: RoomProperties;
  polygon: THREE.Vector2[];
  center: THREE.Vector2;
  area: number;
  doors: Door[];
  windows: Window[];
  neighbors: string[];
  floorLevel: number;
  bounds: RoomBounds;
}
