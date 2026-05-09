/**
 * Solidifier - Converts abstract room layouts into concrete geometry
 * 
 * Takes room definitions and generates:
 * - Wall meshes with proper thickness and height
 * - Floor slabs
 * - Ceiling panels (optional)
 * - Door frames and openings
 * - Window cutouts
 * 
 * Output is optimized Three.js BufferGeometry ready for rendering.
 * 
 * @packageDocumentation
 */

import * as THREE from 'three';
import { Room, RoomType, Door, Window } from '../room/RoomTypes';
import { Direction } from '../room/FloorPlanMoves';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

/**
 * Configuration for solidifier output
 */
export interface SolidifierConfig {
  wallHeight: number;
  wallThickness: number;
  floorThickness: number;
  ceilingHeight?: number; // Optional ceiling generation
  includeFloors: boolean;
  includeCeilings: boolean;
  includeWallFrames: boolean;
  doorWidth: number;
  doorHeight: number;
  windowDefaultWidth: number;
  windowDefaultHeight: number;
  mergeAdjacentWalls: boolean; // Optimize by merging shared walls
}

/**
 * Generated geometry for a room
 */
export interface RoomGeometry {
  roomId: string;
  walls: THREE.BufferGeometry;
  floor?: THREE.BufferGeometry;
  ceiling?: THREE.BufferGeometry;
  doorFrames?: THREE.BufferGeometry[];
  windowFrames?: THREE.BufferGeometry[];
  materials: Record<string, THREE.Material>;
}

/**
 * Wall segment definition
 */
interface WallSegment {
  start: { x: number; z: number };
  end: { x: number; z: number };
  height: number;
  thickness: number;
  openings: Array<{
    type: 'door' | 'window';
    position: number; // 0-1 along wall
    width: number;
    height: number;
    id: string;
  }>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SolidifierConfig = {
  wallHeight: 3.0,
  wallThickness: 0.2,
  floorThickness: 0.15,
  ceilingHeight: undefined,
  includeFloors: true,
  includeCeilings: false,
  includeWallFrames: true,
  doorWidth: 0.9,
  doorHeight: 2.1,
  windowDefaultWidth: 1.2,
  windowDefaultHeight: 1.0,
  mergeAdjacentWalls: true
};

/**
 * Solidifier Class
 * 
 * Converts room layouts into renderable Three.js geometry.
 * Handles wall generation, opening cutouts, and material assignment.
 */
export class Solidifier {
  private config: SolidifierConfig;

  constructor(config?: Partial<SolidifierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate geometry for all rooms
   */
  solidify(rooms: Room[]): RoomGeometry[] {
    return rooms.map(room => this.solidifyRoom(room));
  }

  /**
   * Generate geometry for a single room
   */
  private solidifyRoom(room: Room): RoomGeometry {
    const walls = this.generateWalls(room);
    const floor = this.config.includeFloors ? this.generateFloor(room) : undefined;
    const ceiling = this.config.includeCeilings && this.config.ceilingHeight 
      ? this.generateCeiling(room) 
      : undefined;

    const materials: Record<string, THREE.Material> = {
      walls: this.getWallMaterial(room.type),
      floor: this.getFloorMaterial(room.type),
      ceiling: new THREE.MeshStandardMaterial({ color: 0xffffff })
    };

    return {
      roomId: room.id,
      walls,
      floor,
      ceiling,
      materials
    };
  }

  /**
   * Generate wall geometry with openings
   */
  private generateWalls(room: Room): THREE.BufferGeometry {
    const wallSegments = this.extractWallSegments(room);
    const geometries: THREE.BufferGeometry[] = [];

    for (const segment of wallSegments) {
      const wallGeom = this.createWallSegment(segment);
      geometries.push(wallGeom);
    }

    // Merge all wall segments
    return this.mergeGeometries(geometries);
  }

  /**
   * Extract wall segments from room bounds
   */
  private extractWallSegments(room: Room): WallSegment[] {
    const segments: WallSegment[] = [];
    const { bounds } = room;
    const halfThickness = this.config.wallThickness / 2;

    // North wall (z-max)
    segments.push({
      start: { x: bounds.xMin, z: bounds.zMax },
      end: { x: bounds.xMax, z: bounds.zMax },
      height: this.config.wallHeight,
      thickness: this.config.wallThickness,
      openings: this.getOpeningsForWall(room.doors, room.windows, Direction.NORTH, bounds)
    });

    // South wall (z-min)
    segments.push({
      start: { x: bounds.xMin, z: bounds.zMin },
      end: { x: bounds.xMax, z: bounds.zMin },
      height: this.config.wallHeight,
      thickness: this.config.wallThickness,
      openings: this.getOpeningsForWall(room.doors, room.windows, Direction.SOUTH, bounds)
    });

    // East wall (x-max)
    segments.push({
      start: { x: bounds.xMax, z: bounds.zMin },
      end: { x: bounds.xMax, z: bounds.zMax },
      height: this.config.wallHeight,
      thickness: this.config.wallThickness,
      openings: this.getOpeningsForWall(room.doors, room.windows, Direction.EAST, bounds)
    });

    // West wall (x-min)
    segments.push({
      start: { x: bounds.xMin, z: bounds.zMin },
      end: { x: bounds.xMin, z: bounds.zMax },
      height: this.config.wallHeight,
      thickness: this.config.wallThickness,
      openings: this.getOpeningsForWall(room.doors, room.windows, Direction.WEST, bounds)
    });

    return segments;
  }

  /**
   * Get openings (doors/windows) for a specific wall
   */
  private getOpeningsForWall(
    doors: Door[],
    windows: Window[],
    direction: Direction,
    bounds: any
  ): WallSegment['openings'] {
    const openings: WallSegment['openings'] = [];

    // Process doors
    for (const door of doors) {
      if (door.wall === direction) {
        openings.push({
          type: 'door',
          position: door.position instanceof THREE.Vector2 ? door.position.x : door.position as any,
          width: this.config.doorWidth,
          height: this.config.doorHeight,
          id: door.id
        });
      }
    }

    // Process windows
    for (const window of windows) {
      if (window.wall === direction) {
        openings.push({
          type: 'window',
          position: window.position instanceof THREE.Vector2 ? window.position.x : window.position as any,
          width: window.width || this.config.windowDefaultWidth,
          height: window.height || this.config.windowDefaultHeight,
          id: window.id
        });
      }
    }

    // Sort by position
    return openings.sort((a, b) => a.position - b.position);
  }

  /**
   * Create geometry for a wall segment with openings
   */
  private createWallSegment(segment: WallSegment): THREE.BufferGeometry {
    const length = Math.sqrt(
      Math.pow(segment.end.x - segment.start.x, 2) +
      Math.pow(segment.end.z - segment.start.z, 2)
    );

    // If no openings, create simple box
    if (segment.openings.length === 0) {
      return new THREE.BoxGeometry(length, segment.height, segment.thickness);
    }

    // Create wall with openings using CSG-like approach
    // For simplicity, we'll create separate boxes between openings
    const geometries: THREE.BufferGeometry[] = [];
    let currentPosition = 0;

    for (const opening of segment.openings) {
      const openingStart = opening.position * length - opening.width / 2;
      const openingEnd = opening.position * length + opening.width / 2;

      // Wall segment before opening
      if (openingStart > currentPosition) {
        const segLength = openingStart - currentPosition;
        const heightAbove = segment.height - opening.height;
        
        // Bottom part (below opening)
        if (opening.type === 'door') {
          // Doors go to floor, no bottom part
        } else {
          // Windows have bottom part
          const bottomHeight = 0.9; // Standard window sill height
          geometries.push(new THREE.BoxGeometry(segLength, bottomHeight, segment.thickness));
        }

        // Top part (above opening)
        if (heightAbove > 0.1) {
          geometries.push(new THREE.BoxGeometry(segLength, heightAbove, segment.thickness));
        }
      }

      currentPosition = openingEnd;
    }

    // Final segment after last opening
    if (currentPosition < length) {
      const segLength = length - currentPosition;
      geometries.push(new THREE.BoxGeometry(segLength, segment.height, segment.thickness));
    }

    // Merge segments
    return this.mergeGeometries(geometries);
  }

  /**
   * Generate floor geometry
   */
  private generateFloor(room: Room): THREE.BufferGeometry {
    const { bounds } = room;
    const width = bounds.xMax - bounds.xMin;
    const depth = bounds.zMax - bounds.zMin;

    return new THREE.PlaneGeometry(width, depth);
  }

  /**
   * Generate ceiling geometry
   */
  private generateCeiling(room: Room): THREE.BufferGeometry {
    const { bounds } = room;
    const width = bounds.xMax - bounds.xMin;
    const depth = bounds.zMax - bounds.zMin;

    return new THREE.PlaneGeometry(width, depth);
  }

  /**
   * Merge multiple geometries into one, delegating to GeometryPipeline.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }

    if (geometries.length === 1) {
      return geometries[0];
    }

    return GeometryPipeline.mergeGeometries(geometries);
  }

  /**
   * Get wall material based on room type
   */
  private getWallMaterial(roomType: RoomType): THREE.Material {
    // Default materials by room type
    const colors: Record<RoomType, number> = {
      living: 0xf5f5dc,
      kitchen: 0xe8e8e8,
      bedroom: 0xd4b8c8,
      bathroom: 0xb8d4e8,
      dining: 0xe8d4b8,
      office: 0xd4d4e8,
      hallway: 0xf0f0f0,
      garage: 0xc0c0c0,
      utility: 0xd0d0d0,
      storage: 0xc8c8c8,
      closet: 0xd8d8d8,
      laundry: 0xd0d8d0,
      balcony: 0xe0d8c8,
      nursery: 0xe8d0d8,
      playroom: 0xd8e8d0,
      gym: 0xc8c8c8,
      library: 0xd8c8b8,
      studio: 0xd0d0d8,
      pantry: 0xd8d0c8,
      foyer: 0xe0e0e0,
    };

    return new THREE.MeshStandardMaterial({
      color: colors[roomType] || 0xdddddd,
      roughness: 0.7,
      metalness: 0.1
    });
  }

  /**
   * Get floor material based on room type
   */
  private getFloorMaterial(roomType: RoomType): THREE.Material {
    const colors: Record<RoomType, number> = {
      living: 0x8b6f47, // Wood
      kitchen: 0x888888, // Tile
      bedroom: 0x8b6f47, // Wood
      bathroom: 0xaaaaaa, // Tile
      dining: 0x8b6f47, // Wood
      office: 0x6b5b47, // Dark wood
      hallway: 0x8b6f47, // Wood
      garage: 0x666666, // Concrete
      utility: 0x666666, // Concrete
      storage: 0x777777, // Concrete
      closet: 0x8b6f47, // Wood
      laundry: 0x888888, // Tile
      balcony: 0x888888, // Tile
      nursery: 0x8b6f47, // Wood
      playroom: 0x8b6f47, // Wood
      gym: 0x666666, // Concrete
      library: 0x6b5b47, // Dark wood
      studio: 0x8b6f47, // Wood
      pantry: 0x888888, // Tile
      foyer: 0x8b6f47, // Wood
    };

    return new THREE.MeshStandardMaterial({
      color: colors[roomType] || 0x888888,
      roughness: 0.5,
      metalness: 0.0
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SolidifierConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export default Solidifier;
