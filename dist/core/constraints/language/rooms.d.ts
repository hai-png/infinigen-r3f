/**
 * Constraint Language - Room-Specific Constraints
 *
 * Helper functions and predicates for indoor scene generation,
 * room layout, and architectural constraints.
 * Ported from: constraint_language/rooms.py
 */
import type { ConstraintNode, Variable } from './types';
import type { SemanticsTag, RoomTag, FunctionTag } from '../tags';
/**
 * Room function types for constraint-based room generation
 */
export type RoomFunction = 'sleeping' | 'cooking' | 'dining' | 'working' | 'relaxing' | 'bathing' | 'storage' | 'circulation' | 'entrance' | 'laundry' | 'hobby';
/**
 * Room privacy levels
 */
export type PrivacyLevel = 'public' | 'semi-private' | 'private';
/**
 * Room adjacency requirements
 */
export interface RoomAdjacency {
    /** Rooms that should be adjacent/nearby */
    preferredNeighbors?: RoomFunction[];
    /** Rooms that must be adjacent/nearby */
    requiredNeighbors?: RoomFunction[];
    /** Rooms that should NOT be adjacent */
    excludedNeighbors?: RoomFunction[];
    /** Minimum distance to specific room types */
    minDistances?: Record<RoomFunction, number>;
    /** Maximum distance to specific room types */
    maxDistances?: Record<RoomFunction, number>;
}
/**
 * Create a room-specific object set filtered by room tag
 */
export declare function objectsInRoom<T extends string>(roomTag: RoomTag | T, objectType?: SemanticsTag | string): ObjectSetExpression;
/**
 * Get all objects with a specific room function
 */
export declare function objectsWithFunction(functionType: RoomFunction): ObjectSetExpression;
/**
 * Constraint: Object must be in a specific room
 */
export declare function InRoom(object: Variable | string, roomTag: RoomTag | string): ConstraintNode;
/**
 * Constraint: Two rooms must be adjacent (share a wall or be connected)
 */
export declare function RoomsAdjacent(room1: RoomTag | string, room2: RoomTag | string): ConstraintNode;
/**
 * Constraint: Two rooms must NOT be adjacent
 */
export declare function RoomsNotAdjacent(room1: RoomTag | string, room2: RoomTag | string, minDistance?: number): ConstraintNode;
/**
 * Constraint: Room must have access to entrance
 */
export declare function RoomHasEntranceAccess(roomTag: RoomTag | string, maxDistance?: number): ConstraintNode;
/**
 * Constraint: Room must have natural light (visible from windows)
 */
export declare function RoomHasNaturalLight(roomTag: RoomTag | string, minVisibleWindows?: number): ConstraintNode;
/**
 * Constraint: Furniture arrangement within a room
 */
export declare function ArrangeFurnitureInRoom(roomTag: RoomTag | string, furnitureTypes: SemanticsTag[], options?: {
    minClearance?: number;
    groupRelated?: boolean;
    faceCenter?: boolean;
}): ConstraintNode[];
/**
 * Constraint: Traffic flow path through rooms
 */
export declare function TrafficFlowPath(startRoom: RoomTag | string, endRoom: RoomTag | string, intermediateRooms?: (RoomTag | string)[], options?: {
    minWidth?: number;
    maxHeightDifference?: number;
}): ConstraintNode;
/**
 * Constraint: Room privacy hierarchy
 */
export declare function PrivacyHierarchy(publicRooms: (RoomTag | string)[], privateRooms: (RoomTag | string)[], options?: {
    bufferZone?: boolean;
    minSeparation?: number;
}): ConstraintNode[];
/**
 * Constraint: Functional zones within a room
 */
export declare function FunctionalZones(roomTag: RoomTag | string, zones: Array<{
    function: FunctionTag | string;
    objects: SemanticsTag[];
    area?: number;
    position?: 'center' | 'corner' | 'wall';
}>): ConstraintNode[];
/**
 * Helper: Create a complete room definition with common constraints
 */
export declare function defineRoom(name: string, roomFunction: RoomFunction, privacy: PrivacyLevel, adjacency: RoomAdjacency, requiredObjects?: Array<{
    type: SemanticsTag | string;
    count?: number;
    constraints?: ConstraintNode[];
}>): {
    roomTag: RoomTag;
    constraints: ConstraintNode[];
    objects: Variable[];
};
/**
 * Utility: Check if a room configuration is valid
 */
export declare function validateRoomConfig(roomFunction: RoomFunction, objects: SemanticsTag[], roomSize?: {
    width: number;
    height: number;
    depth: number;
}): {
    valid: boolean;
    issues: string[];
    suggestions: string[];
};
export type { RoomAdjacency, PrivacyLevel };
//# sourceMappingURL=rooms.d.ts.map