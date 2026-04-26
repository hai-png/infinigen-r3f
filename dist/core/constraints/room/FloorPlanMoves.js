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
/**
 * Direction enumeration for wall movements
 */
export var Direction;
(function (Direction) {
    Direction["NORTH"] = "north";
    Direction["SOUTH"] = "south";
    Direction["EAST"] = "east";
    Direction["WEST"] = "west";
})(Direction || (Direction = {}));
/**
 * Floor Plan Moves Manager
 *
 * Handles all room manipulation operations for the constraint solver.
 * Each move is designed to be reversible for simulated annealing rollback.
 */
export class FloorPlanMoves {
    constructor(config) {
        this.minRoomSize = 2.0; // minimum 2x2 meters
        this.maxRoomSize = 20.0; // maximum 20x20 meters
        this.wallThickness = 0.2; // 20cm walls
        if (config?.minRoomSize)
            this.minRoomSize = config.minRoomSize;
        if (config?.maxRoomSize)
            this.maxRoomSize = config.maxRoomSize;
        if (config?.wallThickness)
            this.wallThickness = config.wallThickness;
    }
    /**
     * Move a wall to expand or contract a room
     */
    moveWall(rooms, params) {
        const room = rooms.find(r => r.id === params.roomId);
        if (!room) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOM_NOT_FOUND', severity: 'error', message: `Room ${params.roomId} not found` }],
                energyChange: Infinity,
                description: `Failed: Room ${params.roomId} not found`
            };
        }
        const originalBounds = { ...room.bounds };
        let newBounds = { ...room.bounds };
        // Calculate new bounds based on direction
        switch (params.direction) {
            case Direction.NORTH:
                newBounds.zMax += params.distance;
                break;
            case Direction.SOUTH:
                newBounds.zMin += params.distance;
                break;
            case Direction.EAST:
                newBounds.xMax += params.distance;
                break;
            case Direction.WEST:
                newBounds.xMin += params.distance;
                break;
        }
        // Validate new dimensions
        const width = newBounds.xMax - newBounds.xMin;
        const depth = newBounds.zMax - newBounds.zMin;
        if (width < this.minRoomSize || depth < this.minRoomSize) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOM_TOO_SMALL', severity: 'warning', message: `Room would be too small: ${width.toFixed(2)}x${depth.toFixed(2)}` }],
                energyChange: Infinity,
                description: `Failed: Room would be too small (${width.toFixed(2)}x${depth.toFixed(2)})`
            };
        }
        if (width > this.maxRoomSize || depth > this.maxRoomSize) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOM_TOO_LARGE', severity: 'warning', message: `Room would be too large: ${width.toFixed(2)}x${depth.toFixed(2)}` }],
                energyChange: Infinity,
                description: `Failed: Room would be too large (${width.toFixed(2)}x${depth.toFixed(2)})`
            };
        }
        // Check for collisions with other rooms
        const hasCollision = rooms.some(r => {
            if (r.id === params.roomId)
                return false;
            return this.boundsOverlap(newBounds, r.bounds);
        });
        if (hasCollision) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOM_COLLISION', severity: 'error', message: `New bounds collide with adjacent room` }],
                energyChange: Infinity,
                description: `Failed: Wall movement causes collision with adjacent room`
            };
        }
        // Apply the move
        const modifiedRoom = {
            ...room,
            bounds: newBounds,
            area: width * depth,
            volume: width * room.bounds.yMax * depth
        };
        const modifiedRooms = rooms.map(r => r.id === params.roomId ? modifiedRoom : r);
        // Calculate energy change (simplified - based on area change and constraint satisfaction)
        const areaChange = Math.abs(modifiedRoom.area - room.area);
        const energyChange = areaChange * 0.1; // penalty for large changes
        return {
            success: true,
            modifiedRooms: modifiedRooms,
            violations: [],
            energyChange,
            description: `Moved ${params.direction} wall of room ${params.roomId} by ${params.distance.toFixed(2)}m`
        };
    }
    /**
     * Split a room into two separate rooms
     */
    splitRoom(rooms, params) {
        const room = rooms.find(r => r.id === params.roomId);
        if (!room) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOM_NOT_FOUND', severity: 'error', message: `Room ${params.roomId} not found` }],
                energyChange: Infinity,
                description: `Failed: Room ${params.roomId} not found`
            };
        }
        const splitPos = params.splitPosition;
        if (splitPos <= 0.1 || splitPos >= 0.9) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'INVALID_SPLIT_POSITION', severity: 'warning', message: `Split position must be between 0.1 and 0.9` }],
                energyChange: Infinity,
                description: `Failed: Invalid split position (${splitPos})`
            };
        }
        let room1Bounds, room2Bounds;
        if (params.splitAxis === 'x') {
            // Split along X axis (vertical division)
            const splitX = room.bounds.xMin + (room.bounds.xMax - room.bounds.xMin) * splitPos;
            room1Bounds = {
                ...room.bounds,
                xMax: splitX - this.wallThickness / 2
            };
            room2Bounds = {
                ...room.bounds,
                xMin: splitX + this.wallThickness / 2
            };
        }
        else {
            // Split along Z axis (horizontal division)
            const splitZ = room.bounds.zMin + (room.bounds.zMax - room.bounds.zMin) * splitPos;
            room1Bounds = {
                ...room.bounds,
                zMax: splitZ - this.wallThickness / 2
            };
            room2Bounds = {
                ...room.bounds,
                zMin: splitZ + this.wallThickness / 2
            };
        }
        // Validate both rooms meet minimum size requirements
        const room1Width = room1Bounds.xMax - room1Bounds.xMin;
        const room1Depth = room1Bounds.zMax - room1Bounds.zMin;
        const room2Width = room2Bounds.xMax - room2Bounds.xMin;
        const room2Depth = room2Bounds.zMax - room2Bounds.zMin;
        if (room1Width < this.minRoomSize || room1Depth < this.minRoomSize ||
            room2Width < this.minRoomSize || room2Depth < this.minRoomSize) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOM_TOO_SMALL', severity: 'warning', message: `One or both resulting rooms are too small` }],
                energyChange: Infinity,
                description: `Failed: Resulting rooms would be too small`
            };
        }
        // Create new rooms
        const newRoom1 = {
            id: `${params.roomId}_a`,
            type: room.type,
            bounds: room1Bounds,
            area: room1Width * room1Depth,
            volume: room1Width * room.bounds.yMax * room1Depth,
            properties: { ...room.properties },
            doors: [],
            windows: []
        };
        const newRoom2 = {
            id: `${params.roomId}_b`,
            type: params.newRoomType || room.type,
            bounds: room2Bounds,
            area: room2Width * room2Depth,
            volume: room2Width * room.bounds.yMax * room2Depth,
            properties: { ...room.properties },
            doors: [],
            windows: []
        };
        // Replace original room with two new rooms
        const modifiedRooms = [
            ...rooms.filter(r => r.id !== params.roomId),
            newRoom1,
            newRoom2
        ];
        // Energy penalty for increasing room count (complexity cost)
        const energyChange = 5.0;
        return {
            success: true,
            modifiedRooms,
            violations: [],
            energyChange,
            description: `Split room ${params.roomId} into ${newRoom1.id} and ${newRoom2.id}`
        };
    }
    /**
     * Merge two adjacent rooms into one
     */
    mergeRooms(rooms, params) {
        const room1 = rooms.find(r => r.id === params.room1Id);
        const room2 = rooms.find(r => r.id === params.room2Id);
        if (!room1 || !room2) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOM_NOT_FOUND', severity: 'error', message: `One or both rooms not found` }],
                energyChange: Infinity,
                description: `Failed: One or both rooms not found`
            };
        }
        // Check if rooms are adjacent (share a wall)
        if (!this.areAdjacent(room1, room2)) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOMS_NOT_ADJACENT', severity: 'warning', message: `Rooms ${params.room1Id} and ${params.room2Id} are not adjacent` }],
                energyChange: Infinity,
                description: `Failed: Rooms are not adjacent`
            };
        }
        // Calculate merged bounds
        const mergedBounds = {
            xMin: Math.min(room1.bounds.xMin, room2.bounds.xMin),
            xMax: Math.max(room1.bounds.xMax, room2.bounds.xMax),
            yMin: Math.min(room1.bounds.yMin, room2.bounds.yMin),
            yMax: Math.max(room1.bounds.yMax, room2.bounds.yMax),
            zMin: Math.min(room1.bounds.zMin, room2.bounds.zMin),
            zMax: Math.max(room1.bounds.zMax, room2.bounds.zMax)
        };
        const width = mergedBounds.xMax - mergedBounds.xMin;
        const depth = mergedBounds.zMax - mergedBounds.zMin;
        // Create merged room
        const mergedRoom = {
            id: `${params.room1Id}_${params.room2Id}`,
            type: params.resultingType || room1.type,
            bounds: mergedBounds,
            area: width * depth,
            volume: width * mergedBounds.yMax * depth,
            properties: {
                ...room1.properties,
                ...room2.properties
            },
            doors: [...room1.doors, ...room2.doors],
            windows: [...room1.windows, ...room2.windows]
        };
        // Remove original rooms and add merged room
        const modifiedRooms = [
            ...rooms.filter(r => r.id !== params.room1Id && r.id !== params.room2Id),
            mergedRoom
        ];
        // Energy bonus for reducing complexity
        const energyChange = -3.0;
        return {
            success: true,
            modifiedRooms,
            violations: [],
            energyChange,
            description: `Merged rooms ${params.room1Id} and ${params.room2Id} into ${mergedRoom.id}`
        };
    }
    /**
     * Swap the functions/types of two rooms
     */
    swapFunctions(rooms, params) {
        const room1 = rooms.find(r => r.id === params.room1Id);
        const room2 = rooms.find(r => r.id === params.room2Id);
        if (!room1 || !room2) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOM_NOT_FOUND', severity: 'error', message: `One or both rooms not found` }],
                energyChange: Infinity,
                description: `Failed: One or both rooms not found`
            };
        }
        // Swap room types
        const modifiedRoom1 = {
            ...room1,
            type: room2.type
        };
        const modifiedRoom2 = {
            ...room2,
            type: room1.type
        };
        const modifiedRooms = rooms.map(r => {
            if (r.id === params.room1Id)
                return modifiedRoom1;
            if (r.id === params.room2Id)
                return modifiedRoom2;
            return r;
        });
        // Minimal energy change (function swaps are usually low-cost)
        const energyChange = 0.5;
        return {
            success: true,
            modifiedRooms,
            violations: [],
            energyChange,
            description: `Swapped functions of rooms ${params.room1Id} (${room1.type}→${room2.type}) and ${params.room2Id} (${room2.type}→${room1.type})`
        };
    }
    /**
     * Adjust position of a door or window
     */
    adjustOpening(rooms, params) {
        const room = rooms.find(r => r.id === params.roomId);
        if (!room) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'ROOM_NOT_FOUND', severity: 'error', message: `Room ${params.roomId} not found` }],
                energyChange: Infinity,
                description: `Failed: Room ${params.roomId} not found`
            };
        }
        const openings = params.openingType === 'door' ? room.doors : room.windows;
        const openingIndex = openings.findIndex(o => o.id === params.openingId);
        if (openingIndex === -1) {
            return {
                success: false,
                modifiedRooms: [],
                violations: [{ type: 'OPENING_NOT_FOUND', severity: 'error', message: `${params.openingType} ${params.openingId} not found` }],
                energyChange: Infinity,
                description: `Failed: ${params.openingType} ${params.openingId} not found`
            };
        }
        // Update opening position
        const updatedOpening = {
            ...openings[openingIndex],
            position: params.newPosition,
            wall: params.newWall || openings[openingIndex].wall
        };
        const updatedOpenings = openings.map((o, i) => i === openingIndex ? updatedOpening : o);
        const modifiedRoom = {
            ...room,
            doors: params.openingType === 'door' ? updatedOpenings : room.doors,
            windows: params.openingType === 'window' ? updatedOpenings : room.windows
        };
        const modifiedRooms = rooms.map(r => r.id === params.roomId ? modifiedRoom : r);
        // Very small energy change for minor adjustments
        const energyChange = 0.1;
        return {
            success: true,
            modifiedRooms,
            violations: [],
            energyChange,
            description: `Adjusted ${params.openingType} ${params.openingId} in room ${params.roomId}`
        };
    }
    /**
     * Check if two room bounds overlap
     */
    boundsOverlap(bounds1, bounds2) {
        return !(bounds1.xMax < bounds2.xMin ||
            bounds1.xMin > bounds2.xMax ||
            bounds1.zMax < bounds2.zMin ||
            bounds1.zMin > bounds2.zMax);
    }
    /**
     * Check if two rooms are adjacent (share a wall)
     */
    areAdjacent(room1, room2) {
        // Check if they share a wall (within tolerance)
        const tolerance = this.wallThickness + 0.1;
        const xOverlap = !(room1.bounds.xMax < room2.bounds.xMin - tolerance ||
            room1.bounds.xMin > room2.bounds.xMax + tolerance);
        const zOverlap = !(room1.bounds.zMax < room2.bounds.zMin - tolerance ||
            room1.bounds.zMin > room2.bounds.zMax + tolerance);
        // Adjacent if they overlap in one dimension and touch in the other
        const xAdjacent = Math.abs(room1.bounds.xMax - room2.bounds.xMin) < tolerance ||
            Math.abs(room1.bounds.xMin - room2.bounds.xMax) < tolerance;
        const zAdjacent = Math.abs(room1.bounds.zMax - room2.bounds.zMin) < tolerance ||
            Math.abs(room1.bounds.zMin - room2.bounds.zMax) < tolerance;
        return (xOverlap && zAdjacent) || (zOverlap && xAdjacent);
    }
}
export default FloorPlanMoves;
//# sourceMappingURL=FloorPlanMoves.js.map