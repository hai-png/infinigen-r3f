/**
 * Placement Types
 * Type definitions for object placement system
 */
export function createPlacementZone(id, geometry, weight = 1.0, tags) {
    return { id, geometry, weight, tags };
}
export function createPlacementConfig(strategy, options) {
    return {
        strategy,
        ...options,
    };
}
//# sourceMappingURL=types.js.map