/**
 * Floor Plan Moves - Room manipulation toolkit for constraint-based layout
 *
 * Provides move operators for modifying room configurations during simulated annealing:
 * - Move walls (adjust room dimensions)
 * - Split rooms (divide large rooms)
 * - Merge rooms (combine adjacent rooms)
 * - Swap room functions (reassign room types)
 * - Adjust door/window positions
 *
 * @packageDocumentation
 */
import { Room, RoomType } from './RoomTypes';
import { ConstraintViolation } from '../core/ConstraintTypes';
/**
 * Result of a floor plan move operation
 */
export interface MoveResult {
    success: boolean;
    modifiedRooms: Room[];
    violations: ConstraintViolation[];
    energyChange: number;
    description: string;
}
/**
 * Direction enumeration for wall movements
 */
export declare enum Direction {
    NORTH = "north",
    SOUTH = "south",
    EAST = "east",
    WEST = "west"
}
/**
 * Parameters for wall movement operations
 */
export interface WallMoveParams {
    roomId: string;
    direction: Direction;
    distance: number;
}
/**
 * Parameters for room split operations
 */
export interface RoomSplitParams {
    roomId: string;
    splitAxis: 'x' | 'z';
    splitPosition: number;
    newRoomType?: RoomType;
}
/**
 * Parameters for room merge operations
 */
export interface RoomMergeParams {
    room1Id: string;
    room2Id: string;
    resultingType?: RoomType;
}
/**
 * Parameters for function swap operations
 */
export interface FunctionSwapParams {
    room1Id: string;
    room2Id: string;
}
/**
 * Parameters for door/window adjustment
 */
export interface OpeningAdjustParams {
    roomId: string;
    openingType: 'door' | 'window';
    openingId: string;
    newPosition: number;
    newWall?: Direction;
}
/**
 * Floor Plan Moves Manager
 *
 * Handles all room manipulation operations for the constraint solver.
 * Each move is designed to be reversible for simulated annealing rollback.
 */
export declare class FloorPlanMoves {
    private minRoomSize;
    private maxRoomSize;
    private wallThickness;
    constructor(config?: {
        minRoomSize?: number;
        maxRoomSize?: number;
        wallThickness?: number;
    });
    /**
     * Move a wall to expand or contract a room
     */
    moveWall(rooms: Room[], params: WallMoveParams): MoveResult;
    /**
     * Split a room into two separate rooms
     */
    splitRoom(rooms: Room[], params: RoomSplitParams): MoveResult;
    /**
     * Merge two adjacent rooms into one
     */
    mergeRooms(rooms: Room[], params: RoomMergeParams): MoveResult;
    /**
     * Swap the functions/types of two rooms
     */
    swapFunctions(rooms: Room[], params: FunctionSwapParams): MoveResult;
    /**
     * Adjust position of a door or window
     */
    adjustOpening(rooms: Room[], params: OpeningAdjustParams): MoveResult;
    /**
     * Check if two room bounds overlap
     */
    private boundsOverlap;
    /**
     * Check if two rooms are adjacent (share a wall)
     */
    private areAdjacent;
}
export default FloorPlanMoves;
//# sourceMappingURL=FloorPlanMoves.d.ts.map