/**
 * Boolean Nodes - Mesh boolean operations (CSG)
 * Based on Blender's Boolean geometry nodes
 *
 * @module nodes/boolean
 */
import { BufferGeometry } from 'three';
import { NodeTypes } from '../../core/node-types.js';
export const BooleanUnionDefinition = {
    type: NodeTypes.BooleanUnion,
    label: 'Boolean Union',
    category: 'Boolean',
    inputs: [
        { name: 'Mesh1', type: 'GEOMETRY', required: true },
        { name: 'Mesh2', type: 'GEOMETRY', required: true },
    ],
    outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
    params: {
        solver: { type: 'enum', options: ['exact', 'fast'], default: 'fast' },
        overlapThreshold: { type: 'float', default: 0.0001, min: 0, max: 0.01 },
    },
};
export const BooleanIntersectDefinition = {
    type: NodeTypes.BooleanIntersect,
    label: 'Boolean Intersect',
    category: 'Boolean',
    inputs: [
        { name: 'Mesh1', type: 'GEOMETRY', required: true },
        { name: 'Mesh2', type: 'GEOMETRY', required: true },
    ],
    outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
    params: {
        solver: { type: 'enum', options: ['exact', 'fast'], default: 'fast' },
    },
};
export const BooleanDifferenceDefinition = {
    type: NodeTypes.BooleanDifference,
    label: 'Boolean Difference',
    category: 'Boolean',
    inputs: [
        { name: 'Mesh1', type: 'GEOMETRY', required: true },
        { name: 'Mesh2', type: 'GEOMETRY', required: true },
    ],
    outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
    params: {
        solver: { type: 'enum', options: ['exact', 'fast'], default: 'fast' },
        holeTolerant: { type: 'boolean', default: false },
    },
};
// ============================================================================
// Boolean Execution Functions
// ============================================================================
/**
 * Simple voxel-based boolean union (placeholder for production CSG library)
 * In production, use a library like manifold-3d or csg.js
 */
export function booleanUnion(geom1, geom2, solver = 'fast', overlapThreshold = 0.0001) {
    // Placeholder implementation
    // In production, integrate with a proper CSG library
    console.warn('BooleanUnion: Using placeholder implementation. Integrate with manifold-3d for production.');
    // For now, just merge geometries (not a true boolean union)
    return mergeGeometriesApproximate(geom1, geom2);
}
/**
 * Simple voxel-based boolean intersection
 */
export function booleanIntersect(geom1, geom2, solver = 'fast') {
    console.warn('BooleanIntersect: Using placeholder implementation.');
    // Placeholder - return empty geometry
    return new BufferGeometry();
}
/**
 * Simple voxel-based boolean difference
 */
export function booleanDifference(geom1, geom2, solver = 'fast', holeTolerant = false) {
    console.warn('BooleanDifference: Using placeholder implementation.');
    // Placeholder - return first geometry unchanged
    return geom1.clone();
}
/**
 * Helper: Approximate geometry merge (NOT a true boolean)
 */
function mergeGeometriesApproximate(geom1, geom2) {
    const pos1 = geom1.attributes.position.array;
    const pos2 = geom2.attributes.position.array;
    const mergedPositions = new Float32Array(pos1.length + pos2.length);
    mergedPositions.set(pos1, 0);
    mergedPositions.set(pos2, pos1.length);
    const merged = new BufferGeometry();
    merged.setAttribute('position', new globalThis.Float32BufferAttribute(mergedPositions, 3));
    // Copy UVs if available
    if (geom1.attributes.uv && geom2.attributes.uv) {
        const uv1 = geom1.attributes.uv.array;
        const uv2 = geom2.attributes.uv.array;
        const mergedUVs = new Float32Array(uv1.length + uv2.length);
        mergedUVs.set(uv1, 0);
        mergedUVs.set(uv2, uv1.length);
        merged.setAttribute('uv', new globalThis.Float32BufferAttribute(mergedUVs, 2));
    }
    merged.computeVertexNormals();
    return merged;
}
// ============================================================================
// Exports
// ============================================================================
export const BooleanNodes = {
    BooleanUnion: BooleanUnionDefinition,
    BooleanIntersect: BooleanIntersectDefinition,
    BooleanDifference: BooleanDifferenceDefinition,
};
export const BooleanFunctions = {
    booleanUnion,
    booleanIntersect,
    booleanDifference,
};
//# sourceMappingURL=BooleanNodes.js.map