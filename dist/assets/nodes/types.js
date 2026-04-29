/**
 * Geometry Nodes Types
 * Type definitions for the geometry nodes system
 */
export function createGeometrySocket(value = null) {
    return { type: 'GEOMETRY', value };
}
export function createFieldSocket(value) {
    return { type: 'FIELD', value };
}
export function createValueSocket(valueType, value) {
    return { type: 'VALUE', valueType, value };
}
//# sourceMappingURL=types.js.map