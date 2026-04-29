/**
 * Subdivision Nodes - Geometry subdivision operations
 * Based on Blender's Subdivide and Subdivision Surface nodes
 *
 * @module nodes/geometry
 */
import { BufferGeometry, Vector3 } from 'three';
import { NodeTypes } from '../core/node-types';
export const SubdivideMeshDefinition = {
    type: NodeTypes.SubdivideMesh,
    label: 'Subdivide Mesh',
    category: 'Geometry',
    inputs: [
        { name: 'Mesh', type: 'GEOMETRY', required: true },
        { name: 'Vertices', type: 'FLOAT', default: 0.5 },
    ],
    outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
    params: {
        levels: { type: 'int', default: 1, min: 0, max: 10 },
        smoothness: { type: 'float', default: 1.0, min: 0, max: 1 },
    },
};
/**
 * Linear interpolation between two vectors
 */
function lerpVector(a, b, t) {
    return new Vector3().lerpVectors(a, b, t);
}
/**
 * Catmull-Clark subdivision step
 * Implements one iteration of Catmull-Clark subdivision algorithm
 */
export function catmullClarkStep(geometry) {
    const positions = geometry.attributes.position.array;
    const vertexCount = positions.length / 3;
    // Build edge and face information
    const faceVertices = [];
    const vertexFaces = Array(vertexCount).fill(null).map(() => []);
    const edgeVertices = new Map();
    // Assuming triangulated mesh, group vertices into faces
    for (let i = 0; i < positions.length; i += 9) {
        const v0 = i / 3;
        const v1 = (i + 3) / 3;
        const v2 = (i + 6) / 3;
        faceVertices.push([v0, v1, v2]);
        vertexFaces[v0].push(faceVertices.length - 1);
        vertexFaces[v1].push(faceVertices.length - 1);
        vertexFaces[v2].push(faceVertices.length - 1);
        // Track edges
        const edges = [[v0, v1], [v1, v2], [v2, v0]];
        for (const [a, b] of edges) {
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (!edgeVertices.has(key)) {
                edgeVertices.set(key, [a, b]);
            }
        }
    }
    // Calculate face points (centroid of each face)
    const facePoints = [];
    for (const face of faceVertices) {
        const centroid = new Vector3();
        for (const vi of face) {
            centroid.add(new Vector3(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]));
        }
        centroid.divideScalar(face.length);
        facePoints.push(centroid);
    }
    // Calculate edge points (average of edge endpoints and adjacent face points)
    const edgePoints = new Map();
    for (const [key, edge] of edgeVertices.entries()) {
        const [v0, v1] = edge;
        const p0 = new Vector3(positions[v0 * 3], positions[v0 * 3 + 1], positions[v0 * 3 + 2]);
        const p1 = new Vector3(positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2]);
        // Find adjacent faces
        const adjacentFaces = [];
        for (let fi = 0; fi < faceVertices.length; fi++) {
            if (faceVertices[fi].includes(v0) && faceVertices[fi].includes(v1)) {
                adjacentFaces.push(fi);
            }
        }
        let edgePoint = p0.clone().add(p1).multiplyScalar(0.5);
        if (adjacentFaces.length > 0) {
            for (const fi of adjacentFaces) {
                edgePoint.add(facePoints[fi]);
            }
            edgePoint.divideScalar(adjacentFaces.length + 1);
        }
        edgePoints.set(key, edgePoint);
    }
    // Calculate new vertex positions
    const newPositions = [];
    for (let vi = 0; vi < vertexCount; vi++) {
        const oldPos = new Vector3(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
        const faces = vertexFaces[vi];
        if (faces.length === 0)
            continue;
        // Average of adjacent face points
        const facePointAvg = new Vector3();
        for (const fi of faces) {
            facePointAvg.add(facePoints[fi]);
        }
        facePointAvg.divideScalar(faces.length);
        // Average of adjacent edge midpoints
        const edgeMidpointAvg = new Vector3();
        let edgeCount = 0;
        for (const [key, edge] of edgeVertices.entries()) {
            if (edge.includes(vi)) {
                edgeMidpointAvg.add(edgePoints.get(key));
                edgeCount++;
            }
        }
        if (edgeCount > 0) {
            edgeMidpointAvg.divideScalar(edgeCount);
        }
        // Catmull-Clark formula: (F + 2R + (n-3)P) / n
        const n = faces.length;
        const newPos = facePointAvg
            .clone()
            .multiplyScalar(1)
            .add(edgeMidpointAvg.clone().multiplyScalar(2))
            .add(oldPos.clone().multiplyScalar(n - 3))
            .divideScalar(n);
        newPositions.push(newPos.x, newPos.y, newPos.z);
    }
    // Add edge points
    for (const edgePoint of edgePoints.values()) {
        newPositions.push(edgePoint.x, edgePoint.y, edgePoint.z);
    }
    // Add face points
    for (const facePoint of facePoints) {
        newPositions.push(facePoint.x, facePoint.y, facePoint.z);
    }
    // Create new geometry with subdivided faces
    const newGeometry = new BufferGeometry();
    const newArray = new Float32Array(newPositions);
    newGeometry.setAttribute('position', { ...geometry.attributes.position, array: newArray });
    // Copy other attributes if they exist
    for (const attr in geometry.attributes) {
        if (attr !== 'position') {
            newGeometry.setAttribute(attr, geometry.attributes[attr]);
        }
    }
    return newGeometry;
}
/**
 * Loop subdivision step
 * Implements one iteration of Loop subdivision for triangular meshes
 */
export function loopSubdivisionStep(geometry) {
    const positions = geometry.attributes.position.array;
    const vertexCount = positions.length / 3;
    // Build adjacency information
    const vertexNeighbors = new Map();
    for (let i = 0; i < positions.length; i += 9) {
        const v0 = i / 3;
        const v1 = (i + 3) / 3;
        const v2 = (i + 6) / 3;
        // Add neighbors for each vertex
        [v0, v1, v2].forEach((v, idx) => {
            if (!vertexNeighbors.has(v)) {
                vertexNeighbors.set(v, new Set());
            }
            const neighbors = vertexNeighbors.get(v);
            neighbors.add([v0, v1, v2][(idx + 1) % 3]);
            neighbors.add([v0, v1, v2][(idx + 2) % 3]);
        });
    }
    // Calculate new vertex positions using Loop weights
    const newVertexPositions = [];
    for (let vi = 0; vi < vertexCount; vi++) {
        const oldPos = new Vector3(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
        const neighbors = vertexNeighbors.get(vi);
        if (!neighbors || neighbors.size === 0) {
            newVertexPositions.push(oldPos);
            continue;
        }
        const n = neighbors.size;
        // Loop weight formula
        const beta = n > 3 ? (5 / 8 - Math.pow(3 / 8 + Math.cos(2 * Math.PI / n) / 4) ** 2) / n : 3 / 16;
        const neighborSum = new Vector3();
        for (const ni of neighbors) {
            neighborSum.add(new Vector3(positions[ni * 3], positions[ni * 3 + 1], positions[ni * 3 + 2]));
        }
        const newPos = oldPos.clone().multiplyScalar(1 - n * beta).add(neighborSum.multiplyScalar(beta));
        newVertexPositions.push(newPos);
    }
    // Calculate edge midpoints
    const edgeMidpoints = new Map();
    for (let i = 0; i < positions.length; i += 9) {
        const v0 = i / 3;
        const v1 = (i + 3) / 3;
        const v2 = (i + 6) / 3;
        const edges = [[v0, v1], [v1, v2], [v2, v0]];
        for (const [a, b] of edges) {
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (!edgeMidpoints.has(key)) {
                const pa = new Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
                const pb = new Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
                edgeMidpoints.set(key, lerpVector(pa, pb, 0.5));
            }
        }
    }
    // Build new geometry
    const newPositions = [];
    // Original vertices
    for (const pos of newVertexPositions) {
        newPositions.push(pos.x, pos.y, pos.z);
    }
    // Edge midpoints
    for (const midpoint of edgeMidpoints.values()) {
        newPositions.push(midpoint.x, midpoint.y, midpoint.z);
    }
    const newGeometry = new BufferGeometry();
    const newArray = new Float32Array(newPositions);
    newGeometry.setAttribute('position', { ...geometry.attributes.position, array: newArray });
    return newGeometry;
}
/**
 * Execute SubdivideMesh node
 */
export function executeSubdivideMesh(node, inputMesh) {
    let result = inputMesh.clone();
    const levels = node.params.levels || 1;
    for (let i = 0; i < levels; i++) {
        // Alternate between Catmull-Clark and Loop for better results
        if (i % 2 === 0) {
            result = catmullClarkStep(result);
        }
        else {
            result = loopSubdivisionStep(result);
        }
    }
    return result;
}
/**
 * Simple mesh offset along normals
 */
export function offsetMesh(geometry, offset) {
    const newGeometry = geometry.clone();
    const positions = newGeometry.attributes.position.array;
    const normals = newGeometry.attributes.normal?.array;
    if (normals) {
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] += normals[i] * offset;
            positions[i + 1] += normals[i + 1] * offset;
            positions[i + 2] += normals[i + 2] * offset;
        }
    }
    else {
        // Compute normals if not present
        newGeometry.computeVertexNormals();
        return offsetMesh(newGeometry, offset);
    }
    return newGeometry;
}
//# sourceMappingURL=SubdivisionNodes.js.map