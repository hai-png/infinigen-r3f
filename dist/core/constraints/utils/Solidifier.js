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
import { Direction } from './FloorPlanMoves';
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
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
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Generate geometry for all rooms
     */
    solidify(rooms) {
        return rooms.map(room => this.solidifyRoom(room));
    }
    /**
     * Generate geometry for a single room
     */
    solidifyRoom(room) {
        const walls = this.generateWalls(room);
        const floor = this.config.includeFloors ? this.generateFloor(room) : undefined;
        const ceiling = this.config.includeCeilings && this.config.ceilingHeight
            ? this.generateCeiling(room)
            : undefined;
        const materials = {
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
    generateWalls(room) {
        const wallSegments = this.extractWallSegments(room);
        const geometries = [];
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
    extractWallSegments(room) {
        const segments = [];
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
    getOpeningsForWall(doors, windows, direction, bounds) {
        const openings = [];
        // Process doors
        for (const door of doors) {
            if (door.wall === direction) {
                openings.push({
                    type: 'door',
                    position: door.position,
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
                    position: window.position,
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
    createWallSegment(segment) {
        const length = Math.sqrt(Math.pow(segment.end.x - segment.start.x, 2) +
            Math.pow(segment.end.z - segment.start.z, 2));
        // If no openings, create simple box
        if (segment.openings.length === 0) {
            return new THREE.BoxGeometry(length, segment.height, segment.thickness);
        }
        // Create wall with openings using CSG-like approach
        // For simplicity, we'll create separate boxes between openings
        const geometries = [];
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
                }
                else {
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
    generateFloor(room) {
        const { bounds } = room;
        const width = bounds.xMax - bounds.xMin;
        const depth = bounds.zMax - bounds.zMin;
        return new THREE.PlaneGeometry(width, depth);
    }
    /**
     * Generate ceiling geometry
     */
    generateCeiling(room) {
        const { bounds } = room;
        const width = bounds.xMax - bounds.xMin;
        const depth = bounds.zMax - bounds.zMin;
        return new THREE.PlaneGeometry(width, depth);
    }
    /**
     * Merge multiple geometries into one
     */
    mergeGeometries(geometries) {
        if (geometries.length === 0) {
            return new THREE.BufferGeometry();
        }
        if (geometries.length === 1) {
            return geometries[0];
        }
        return THREE.BufferGeometryUtils.mergeGeometries(geometries, true);
    }
    /**
     * Get wall material based on room type
     */
    getWallMaterial(roomType) {
        // Default materials by room type
        const colors = {
            living: 0xf5f5dc,
            kitchen: 0xe8e8e8,
            bedroom: 0xd4b8c8,
            bathroom: 0xb8d4e8,
            dining: 0xe8d4b8,
            office: 0xd4d4e8,
            hallway: 0xf0f0f0,
            garage: 0xc0c0c0,
            utility: 0xd0d0d0,
            storage: 0xc8c8c8
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
    getFloorMaterial(roomType) {
        const colors = {
            living: 0x8b6f47, // Wood
            kitchen: 0x888888, // Tile
            bedroom: 0x8b6f47, // Wood
            bathroom: 0xaaaaaa, // Tile
            dining: 0x8b6f47, // Wood
            office: 0x6b5b47, // Dark wood
            hallway: 0x8b6f47, // Wood
            garage: 0x666666, // Concrete
            utility: 0x666666, // Concrete
            storage: 0x777777 // Concrete
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
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
export default Solidifier;
//# sourceMappingURL=Solidifier.js.map