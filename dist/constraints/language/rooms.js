/**
 * Constraint Language - Room-Specific Constraints
 *
 * Helper functions and predicates for indoor scene generation,
 * room layout, and architectural constraints.
 * Ported from: constraint_language/rooms.py
 */
import { AndRelations, OrRelations, Touching, Facing, AccessibleFrom, ReachableFrom, Visible, Proximity, } from './relations';
import { FilterObjects, TagCondition, } from './set-reasoning';
import { item, SCENE } from './constants';
/**
 * Create a room-specific object set filtered by room tag
 */
export function objectsInRoom(roomTag, objectType) {
    const baseFilter = new TagCondition('room', roomTag);
    if (objectType) {
        const combinedFilter = new AndRelations([
            baseFilter,
            new TagCondition('semantics', objectType)
        ]);
        return new FilterObjects(SCENE, combinedFilter);
    }
    return new FilterObjects(SCENE, baseFilter);
}
/**
 * Get all objects with a specific room function
 */
export function objectsWithFunction(functionType) {
    return new FilterObjects(SCENE, new TagCondition('function', functionType));
}
/**
 * Constraint: Object must be in a specific room
 */
export function InRoom(object, roomTag) {
    const objVar = typeof object === 'string' ? item(object) : object;
    return new TagCondition('room', roomTag);
}
/**
 * Constraint: Two rooms must be adjacent (share a wall or be connected)
 */
export function RoomsAdjacent(room1, room2) {
    // Objects from room1 should be touching or very close to objects from room2
    const room1Objects = objectsInRoom(room1);
    const room2Objects = objectsInRoom(room2);
    // At least some objects from each room should be touching or within threshold
    return new Exists(room1Objects, (obj1) => new Exists(room2Objects, (obj2) => new OrRelations([
        new Touching(obj1, obj2),
        new Proximity(obj1, obj2, 0.5) // Within 50cm
    ])));
}
/**
 * Constraint: Two rooms must NOT be adjacent
 */
export function RoomsNotAdjacent(room1, room2, minDistance = 2.0) {
    const room1Objects = objectsInRoom(room1);
    const room2Objects = objectsInRoom(room2);
    // All objects from room1 should be at least minDistance from room2 objects
    return new ForAll(room1Objects, (obj1) => new ForAll(room2Objects, (obj2) => new Proximity(obj1, obj2, minDistance)));
}
/**
 * Constraint: Room must have access to entrance
 */
export function RoomHasEntranceAccess(roomTag, maxDistance = 10.0) {
    const roomObjects = objectsInRoom(roomTag);
    const entranceObjects = objectsWithFunction('entrance');
    return new Exists(roomObjects, (obj) => new Exists(entranceObjects, (entrance) => new AndRelations([
        new ReachableFrom(obj, entrance),
        new Proximity(obj, entrance, maxDistance)
    ])));
}
/**
 * Constraint: Room must have natural light (visible from windows)
 */
export function RoomHasNaturalLight(roomTag, minVisibleWindows = 1) {
    const roomObjects = objectsInRoom(roomTag);
    const windowObjects = new FilterObjects(SCENE, new TagCondition('semantics', 'window'));
    // Count visible windows from room objects
    const visibleWindows = new SumOver(windowObjects, (window) => new Exists(roomObjects, (obj) => new Visible(window, obj)));
    return new Proximity(visibleWindows, minVisibleWindows);
}
/**
 * Constraint: Furniture arrangement within a room
 */
export function ArrangeFurnitureInRoom(roomTag, furnitureTypes, options = {}) {
    const constraints = [];
    const { minClearance = 0.6, groupRelated = true, faceCenter = false } = options;
    const roomObjects = objectsInRoom(roomTag);
    // Create variables for each furniture type
    const furnitureVars = furnitureTypes.map((type, idx) => item(`furniture_${idx}`));
    // Each furniture piece must be in the room
    furnitureVars.forEach((furnVar, idx) => {
        constraints.push(new TagCondition('semantics', furnitureTypes[idx]));
        constraints.push(new TagCondition('room', roomTag));
    });
    // Minimum clearance between furniture
    if (minClearance > 0) {
        for (let i = 0; i < furnitureVars.length; i++) {
            for (let j = i + 1; j < furnitureVars.length; j++) {
                constraints.push(new Proximity(furnitureVars[i], furnitureVars[j], minClearance));
            }
        }
    }
    // Group related furniture (e.g., desk and chair)
    if (groupRelated && furnitureVars.length >= 2) {
        constraints.push(new Proximity(furnitureVars[0], furnitureVars[1], 1.0));
    }
    // Face room center
    if (faceCenter && furnitureVars.length > 0) {
        // Simplified: just add a constraint that furniture should face inward
        furnitureVars.forEach(furnVar => {
            constraints.push(new Facing(furnVar));
        });
    }
    return constraints;
}
/**
 * Constraint: Traffic flow path through rooms
 */
export function TrafficFlowPath(startRoom, endRoom, intermediateRooms, options = {}) {
    const { minWidth = 0.8, maxHeightDifference = 0.3 } = options;
    const startObjects = objectsInRoom(startRoom);
    const endObjects = objectsInRoom(endRoom);
    // Basic accessibility constraint
    let pathConstraint = new Exists(startObjects, (start) => new Exists(endObjects, (end) => new AccessibleFrom(end, start)));
    // Add intermediate room constraints
    if (intermediateRooms && intermediateRooms.length > 0) {
        const intermediateConstraints = intermediateRooms.map(room => {
            const roomObjects = objectsInRoom(room);
            return new Exists(roomObjects, (obj) => new AndRelations([
                new ReachableFrom(obj, startObjects),
                new ReachableFrom(endObjects, obj)
            ]));
        });
        pathConstraint = new AndRelations([pathConstraint, ...intermediateConstraints]);
    }
    return pathConstraint;
}
/**
 * Constraint: Room privacy hierarchy
 */
export function PrivacyHierarchy(publicRooms, privateRooms, options = {}) {
    const { bufferZone = true, minSeparation = 3.0 } = options;
    const constraints = [];
    // Private rooms should not be directly accessible from public rooms
    publicRooms.forEach(publicRoom => {
        privateRooms.forEach(privateRoom => {
            if (bufferZone) {
                // Require separation
                constraints.push(RoomsNotAdjacent(publicRoom, privateRoom, minSeparation));
            }
            else {
                // Just not adjacent
                constraints.push(RoomsNotAdjacent(publicRoom, privateRoom, 1.5));
            }
        });
    });
    return constraints;
}
/**
 * Constraint: Functional zones within a room
 */
export function FunctionalZones(roomTag, zones) {
    const constraints = [];
    zones.forEach((zone, zoneIdx) => {
        const zonePrefix = `zone_${zoneIdx}_`;
        // Tag objects with zone function
        zone.objects.forEach((objType, objIdx) => {
            const objVar = item(`${zonePrefix}${objIdx}`);
            constraints.push(new TagCondition('semantics', objType));
            constraints.push(new TagCondition('function', zone.function));
            constraints.push(new TagCondition('room', roomTag));
        });
        // Group zone objects together
        if (zone.objects.length > 1) {
            for (let i = 0; i < zone.objects.length - 1; i++) {
                constraints.push(new Proximity(item(`${zonePrefix}${i}`), item(`${zonePrefix}${i + 1}`), 1.5));
            }
        }
        // Position constraints
        if (zone.position === 'corner') {
            // Objects should be near room boundaries
            zone.objects.forEach((_, idx) => {
                // Would need room boundary information
                // Simplified: just note this as a future enhancement
            });
        }
        else if (zone.position === 'wall') {
            // Objects should be against walls
            zone.objects.forEach((_, idx) => {
                // Would need wall detection
            });
        }
    });
    // Separate different zones
    for (let i = 0; i < zones.length - 1; i++) {
        for (let j = i + 1; j < zones.length; j++) {
            const zone1Prefix = `zone_${i}_`;
            const zone2Prefix = `zone_${j}_`;
            // Add separation between zones
            constraints.push(new Proximity(item(`${zone1Prefix}0`), item(`${zone2Prefix}0`), 2.0));
        }
    }
    return constraints;
}
/**
 * Helper: Create a complete room definition with common constraints
 */
export function defineRoom(name, roomFunction, privacy, adjacency, requiredObjects = []) {
    const roomTag = name;
    const constraints = [];
    const objects = [];
    // Tag the room itself
    constraints.push(new TagCondition('room', name));
    constraints.push(new TagCondition('function', roomFunction));
    constraints.push(new TagCondition('privacy', privacy));
    // Add adjacency constraints
    if (adjacency.requiredNeighbors) {
        adjacency.requiredNeighbors.forEach(neighbor => {
            constraints.push(RoomsAdjacent(name, neighbor));
        });
    }
    if (adjacency.excludedNeighbors) {
        adjacency.excludedNeighbors.forEach(neighbor => {
            constraints.push(RoomsNotAdjacent(name, neighbor, 2.0));
        });
    }
    // Add required objects
    requiredObjects.forEach((req, idx) => {
        const count = req.count ?? 1;
        for (let i = 0; i < count; i++) {
            const objVar = item(`${name}_${req.type}_${i}`);
            objects.push(objVar);
            constraints.push(new TagCondition('semantics', req.type));
            constraints.push(new TagCondition('room', name));
            if (req.constraints) {
                constraints.push(...req.constraints);
            }
        }
    });
    // Add entrance access requirement
    constraints.push(RoomHasEntranceAccess(name));
    return { roomTag, constraints, objects };
}
/**
 * Utility: Check if a room configuration is valid
 */
export function validateRoomConfig(roomFunction, objects, roomSize) {
    const issues = [];
    const suggestions = [];
    // Common room requirements
    const requiredByFunction = {
        sleeping: ['bed', 'nightstand'],
        cooking: ['stove', 'sink', 'counter'],
        dining: ['table', 'chair'],
        working: ['desk', 'chair'],
        relaxing: ['sofa', 'chair'],
        bathing: ['toilet', 'sink', 'shower'],
        storage: ['shelf', 'cabinet'],
        circulation: [],
        entrance: ['door'],
        laundry: ['washer', 'dryer'],
        hobby: ['table', 'chair']
    };
    const required = requiredByFunction[roomFunction] || [];
    required.forEach(reqObj => {
        if (!objects.includes(reqObj)) {
            issues.push(`Missing required object: ${reqObj}`);
            suggestions.push(`Add ${reqObj} for ${roomFunction} room`);
        }
    });
    // Size recommendations
    const minSizes = {
        sleeping: 9.0, // 9 m² minimum
        cooking: 6.0, // 6 m² minimum
        dining: 8.0, // 8 m² minimum
        working: 7.0, // 7 m² minimum
        relaxing: 12.0, // 12 m² minimum
        bathing: 4.0, // 4 m² minimum
        storage: 3.0, // 3 m² minimum
        circulation: 2.0, // 2 m² minimum
        entrance: 3.0, // 3 m² minimum
        laundry: 4.0, // 4 m² minimum
        hobby: 8.0 // 8 m² minimum
    };
    if (roomSize) {
        const area = roomSize.width * roomSize.depth;
        const minArea = minSizes[roomFunction] || 5.0;
        if (area < minArea) {
            issues.push(`Room too small: ${area.toFixed(1)} m² (minimum: ${minArea} m²)`);
            suggestions.push(`Increase room size to at least ${minArea} m²`);
        }
    }
    return {
        valid: issues.length === 0,
        issues,
        suggestions
    };
}
//# sourceMappingURL=rooms.js.map