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
import { Room } from './RoomTypes';
/**
 * Configuration for solidifier output
 */
export interface SolidifierConfig {
    wallHeight: number;
    wallThickness: number;
    floorThickness: number;
    ceilingHeight?: number;
    includeFloors: boolean;
    includeCeilings: boolean;
    includeWallFrames: boolean;
    doorWidth: number;
    doorHeight: number;
    windowDefaultWidth: number;
    windowDefaultHeight: number;
    mergeAdjacentWalls: boolean;
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
 * Solidifier Class
 *
 * Converts room layouts into renderable Three.js geometry.
 * Handles wall generation, opening cutouts, and material assignment.
 */
export declare class Solidifier {
    private config;
    constructor(config?: Partial<SolidifierConfig>);
    /**
     * Generate geometry for all rooms
     */
    solidify(rooms: Room[]): RoomGeometry[];
    /**
     * Generate geometry for a single room
     */
    private solidifyRoom;
    /**
     * Generate wall geometry with openings
     */
    private generateWalls;
    /**
     * Extract wall segments from room bounds
     */
    private extractWallSegments;
    /**
     * Get openings (doors/windows) for a specific wall
     */
    private getOpeningsForWall;
    /**
     * Create geometry for a wall segment with openings
     */
    private createWallSegment;
    /**
     * Generate floor geometry
     */
    private generateFloor;
    /**
     * Generate ceiling geometry
     */
    private generateCeiling;
    /**
     * Merge multiple geometries into one
     */
    private mergeGeometries;
    /**
     * Get wall material based on room type
     */
    private getWallMaterial;
    /**
     * Get floor material based on room type
     */
    private getFloorMaterial;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<SolidifierConfig>): void;
}
export default Solidifier;
//# sourceMappingURL=Solidifier.d.ts.map