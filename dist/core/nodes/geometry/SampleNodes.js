/**
 * Sample Nodes for Geometry Nodes System
 *
 * Handles sampling operations (points on mesh, volume, curves, etc.)
 * Based on original: infinigen/core/nodes/nodegroups/sample_nodes.py
 */
import { Vector3, Box3 } from 'three';
import { SocketType } from '../core/socket-types';
// ============================================================================
// Node Definitions
// ============================================================================
/**
 * Distribute Points on Faces Node
 * Distributes points across the surface of a mesh
 */
export const DistributePointsOnFacesDefinition = {
    name: 'Distribute Points on Faces',
    type: 'distribute_points_on_faces',
    category: 'sample',
    description: 'Distributes points across the surface of a mesh based on density',
    inputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
        { name: 'Selection', type: SocketType.BOOLEAN, default: true },
        { name: 'Density', type: SocketType.FLOAT, default: 1.0 },
        { name: 'Density Factor', type: SocketType.FLOAT, default: 1.0 },
    ],
    outputs: [
        { name: 'Points', type: SocketType.VECTOR },
        { name: 'Normals', type: SocketType.VECTOR },
        { name: 'Face Indices', type: SocketType.INTEGER },
        { name: 'Barycentric Coords', type: SocketType.VECTOR },
    ],
    parameters: [
        { name: 'Distribution Method', type: 'enum', options: ['random', 'poisson_disk', 'grid', 'stratified'], default: 'random' },
        { name: 'Seed', type: 'integer', default: 0 },
        { name: 'Use Mesh Normal', type: 'boolean', default: true },
        { name: 'Radius Min', type: 'float', default: 0.0 },
        { name: 'Radius Max', type: 'float', default: 0.0 },
        { name: 'Weight Attribute', type: 'string', default: '' },
    ],
    defaults: {
        distributionMethod: 'random',
        seed: 0,
        useMeshNormal: true,
        radiusMin: 0.0,
        radiusMax: 0.0,
    },
};
/**
 * Distribute Points in Volume Node
 * Distributes points inside a volume
 */
export const DistributePointsInVolumeDefinition = {
    name: 'Distribute Points in Volume',
    type: 'distribute_points_in_volume',
    category: 'sample',
    description: 'Distributes points inside a volume (mesh, box, sphere, cylinder)',
    inputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
        { name: 'Count', type: SocketType.INTEGER, required: true },
        { name: 'Selection', type: SocketType.BOOLEAN, default: true },
    ],
    outputs: [
        { name: 'Points', type: SocketType.VECTOR },
    ],
    parameters: [
        { name: 'Distribution Method', type: 'enum', options: ['random', 'poisson_disk', 'grid', 'stratified'], default: 'random' },
        { name: 'Seed', type: 'integer', default: 0 },
        { name: 'Volume Type', type: 'enum', options: ['mesh', 'box', 'sphere', 'cylinder'], default: 'mesh' },
    ],
    defaults: {
        distributionMethod: 'random',
        seed: 0,
        volumeType: 'mesh',
    },
};
/**
 * Mesh to Points Node
 * Converts mesh elements to points
 */
export const MeshToPointsDefinition = {
    name: 'Mesh to Points',
    type: 'mesh_to_points',
    category: 'sample',
    description: 'Converts mesh vertices, edges, faces, or corners to points',
    inputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
        { name: 'Selection', type: SocketType.BOOLEAN, default: true },
    ],
    outputs: [
        { name: 'Points', type: SocketType.VECTOR },
        { name: 'Normals', type: SocketType.VECTOR },
    ],
    parameters: [
        { name: 'Mode', type: 'enum', options: ['vertices', 'edges', 'faces', 'corners'], default: 'vertices' },
    ],
    defaults: {
        mode: 'vertices',
    },
};
/**
 * Point on Geometry Node
 * Gets a point at a specific factor along the geometry
 */
export const PointOnGeometryDefinition = {
    name: 'Point on Geometry',
    type: 'point_on_geometry',
    category: 'sample',
    description: 'Gets a point at a specific factor along the geometry',
    inputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
        { name: 'Factor', type: SocketType.FLOAT, required: true, default: 0.5 },
    ],
    outputs: [
        { name: 'Position', type: SocketType.VECTOR },
        { name: 'Normal', type: SocketType.VECTOR },
        { name: 'Face Index', type: SocketType.INTEGER },
    ],
};
/**
 * Sample Nearest Surface Node
 * Finds the nearest point on a surface
 */
export const SampleNearestSurfaceDefinition = {
    name: 'Sample Nearest Surface',
    type: 'sample_nearest_surface',
    category: 'sample',
    description: 'Finds the nearest point on a surface to a given position',
    inputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
        { name: 'Position', type: SocketType.VECTOR, required: true },
    ],
    outputs: [
        { name: 'Position', type: SocketType.VECTOR },
        { name: 'Normal', type: SocketType.VECTOR },
        { name: 'Distance', type: SocketType.FLOAT },
        { name: 'Face Index', type: SocketType.INTEGER },
    ],
};
/**
 * Sample Nearest Volume Node
 * Finds the nearest point in a volume
 */
export const SampleNearestVolumeDefinition = {
    name: 'Sample Nearest Volume',
    type: 'sample_nearest_volume',
    category: 'sample',
    description: 'Finds the nearest point in a volume to a given position',
    inputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
        { name: 'Position', type: SocketType.VECTOR, required: true },
    ],
    outputs: [
        { name: 'Position', type: SocketType.VECTOR },
        { name: 'Distance', type: SocketType.FLOAT },
    ],
};
/**
 * Random Value Node
 * Generates random values of various types
 */
export const RandomValueDefinition = {
    name: 'Random Value',
    type: 'random_value',
    category: 'sample',
    description: 'Generates random values of various types',
    inputs: [
        { name: 'Min', type: SocketType.ANY, default: 0 },
        { name: 'Max', type: SocketType.ANY, default: 1 },
        { name: 'Probability', type: SocketType.FLOAT, default: 1.0 },
        { name: 'ID', type: SocketType.INTEGER, default: 0 },
    ],
    outputs: [
        { name: 'Value', type: SocketType.ANY },
    ],
    parameters: [
        { name: 'Data Type', type: 'enum', options: ['float', 'vector', 'color', 'integer', 'boolean'], default: 'float' },
        { name: 'Use Min', type: 'boolean', default: true },
        { name: 'Use Max', type: 'boolean', default: true },
    ],
    defaults: {
        dataType: 'float',
        useMin: true,
        useMax: true,
    },
};
/**
 * Position Node
 * Gets the position attribute
 */
export const PositionDefinition = {
    name: 'Position',
    type: 'position',
    category: 'sample',
    description: 'Gets the position attribute of points',
    inputs: [
        { name: 'Offset', type: SocketType.VECTOR, default: new Vector3(0, 0, 0) },
    ],
    outputs: [
        { name: 'Position', type: SocketType.VECTOR },
    ],
};
/**
 * Normal Node
 * Gets the normal attribute
 */
export const NormalDefinition = {
    name: 'Normal',
    type: 'normal',
    category: 'sample',
    description: 'Gets the normal attribute of points',
    inputs: [],
    outputs: [
        { name: 'Normal', type: SocketType.VECTOR },
    ],
};
/**
 * Tangent Node
 * Gets the tangent attribute
 */
export const TangentDefinition = {
    name: 'Tangent',
    type: 'tangent',
    category: 'sample',
    description: 'Gets the tangent attribute of points',
    inputs: [],
    outputs: [
        { name: 'Tangent', type: SocketType.VECTOR },
    ],
};
/**
 * UV Map Node
 * Gets UV coordinates
 */
export const UVMapDefinition = {
    name: 'UV Map',
    type: 'uv_map',
    category: 'sample',
    description: 'Gets UV coordinates from a UV map',
    inputs: [],
    outputs: [
        { name: 'UV', type: SocketType.VECTOR },
    ],
    parameters: [
        { name: 'UV Map Name', type: 'string', default: 'UVMap' },
    ],
    defaults: {
        uvMapName: 'UVMap',
    },
};
/**
 * Color Node
 * Gets color attribute
 */
export const ColorDefinition = {
    name: 'Color',
    type: 'color',
    category: 'sample',
    description: 'Gets color attribute from the geometry',
    inputs: [
        { name: 'Color', type: SocketType.COLOR, default: null },
    ],
    outputs: [
        { name: 'Color', type: SocketType.COLOR },
    ],
    parameters: [
        { name: 'Attribute Name', type: 'string', default: 'Color' },
    ],
    defaults: {
        attributeName: 'Color',
    },
};
/**
 * Instance on Points Node
 * Instances geometry on points
 */
export const InstanceOnPointsDefinition = {
    name: 'Instance on Points',
    type: 'instance_on_points',
    category: 'sample',
    description: 'Creates instances of geometry on points',
    inputs: [
        { name: 'Points', type: SocketType.VECTOR, required: true },
        { name: 'Instance', type: SocketType.GEOMETRY, required: true },
        { name: 'Rotation', type: SocketType.VECTOR, default: new Vector3(0, 0, 0) },
        { name: 'Scale', type: SocketType.FLOAT, default: 1.0 },
        { name: 'Selection', type: SocketType.BOOLEAN, default: true },
    ],
    outputs: [
        { name: 'Instances', type: SocketType.GEOMETRY },
    ],
    parameters: [
        { name: 'Pick Random', type: 'boolean', default: false },
        { name: 'Align Rotation to Normal', type: 'boolean', default: false },
    ],
    defaults: {
        pickRandom: false,
        alignRotationToNormal: false,
    },
};
/**
 * Realize Instances Node
 * Converts instances to real geometry
 */
export const RealizeInstancesDefinition = {
    name: 'Realize Instances',
    type: 'realize_instances',
    category: 'sample',
    description: 'Converts instances to real geometry',
    inputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
    ],
    outputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY },
    ],
};
// ============================================================================
// Execution Functions
// ============================================================================
/**
 * Execute Distribute Points on Faces Node
 */
export function executeDistributePointsOnFaces(node, geometry) {
    const { distributionMethod, seed, useMeshNormal } = node.parameters;
    const density = node.inputs.density || 1.0;
    // Seed random generator
    const random = seededRandom(seed);
    const posAttr = geometry.attributes.position;
    const indexAttr = geometry.index;
    const normalAttr = geometry.attributes.normal;
    const points = [];
    const normals = [];
    const faceIndices = [];
    const barycentricCoords = [];
    if (!posAttr || posAttr.count === 0) {
        return { points: [], normals: [], faceIndices: [], barycentricCoords: [] };
    }
    // Calculate total surface area
    let totalArea = 0;
    const faceAreas = [];
    const faceCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
    for (let i = 0; i < faceCount; i++) {
        let i0, i1, i2;
        if (indexAttr) {
            i0 = indexAttr.getX(i * 3);
            i1 = indexAttr.getX(i * 3 + 1);
            i2 = indexAttr.getX(i * 3 + 2);
        }
        else {
            i0 = i * 3;
            i1 = i * 3 + 1;
            i2 = i * 3 + 2;
        }
        const v0 = new Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
        const v1 = new Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
        const v2 = new Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
        const edge1 = new Vector3().subVectors(v1, v0);
        const edge2 = new Vector3().subVectors(v2, v0);
        const area = 0.5 * edge1.cross(edge2).length();
        faceAreas.push(area);
        totalArea += area;
    }
    // Calculate number of points
    const targetCount = Math.floor(totalArea * density);
    // Distribute points based on method
    switch (distributionMethod) {
        case 'random':
            for (let i = 0; i < targetCount; i++) {
                // Select face weighted by area
                const rand = random() * totalArea;
                let cumulativeArea = 0;
                let faceIndex = 0;
                for (let j = 0; j < faceAreas.length; j++) {
                    cumulativeArea += faceAreas[j];
                    if (rand <= cumulativeArea) {
                        faceIndex = j;
                        break;
                    }
                }
                // Generate random barycentric coordinates
                const r1 = Math.sqrt(random());
                const r2 = random();
                const u = 1 - r1;
                const v = r1 * (1 - r2);
                const w = r1 * r2;
                // Get face vertices
                let i0, i1, i2;
                if (indexAttr) {
                    i0 = indexAttr.getX(faceIndex * 3);
                    i1 = indexAttr.getX(faceIndex * 3 + 1);
                    i2 = indexAttr.getX(faceIndex * 3 + 2);
                }
                else {
                    i0 = faceIndex * 3;
                    i1 = faceIndex * 3 + 1;
                    i2 = faceIndex * 3 + 2;
                }
                const v0 = new Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
                const v1 = new Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
                const v2 = new Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
                // Interpolate position
                const point = new Vector3()
                    .addScaledVector(v0, u)
                    .addScaledVector(v1, v)
                    .addScaledVector(v2, w);
                points.push(point);
                faceIndices.push(faceIndex);
                barycentricCoords.push(new Vector3(u, v, w));
                // Get normal
                if (useMeshNormal && normalAttr) {
                    const n0 = new Vector3(normalAttr.getX(i0), normalAttr.getY(i0), normalAttr.getZ(i0));
                    const n1 = new Vector3(normalAttr.getX(i1), normalAttr.getY(i1), normalAttr.getZ(i1));
                    const n2 = new Vector3(normalAttr.getX(i2), normalAttr.getY(i2), normalAttr.getZ(i2));
                    const normal = new Vector3()
                        .addScaledVector(n0, u)
                        .addScaledVector(n1, v)
                        .addScaledVector(n2, w)
                        .normalize();
                    normals.push(normal);
                }
                else {
                    // Compute face normal
                    const v0 = new Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
                    const v1 = new Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
                    const v2 = new Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
                    const edge1 = new Vector3().subVectors(v1, v0);
                    const edge2 = new Vector3().subVectors(v2, v0);
                    const normal = edge1.cross(edge2).normalize();
                    normals.push(normal);
                }
            }
            break;
        case 'grid':
            // TODO: Implement grid-based distribution
            console.warn('Grid distribution not yet implemented, falling back to random');
            // Fall through to random for now
            break;
        case 'poisson_disk':
            // TODO: Implement Poisson disk sampling
            console.warn('Poisson disk sampling not yet implemented, falling back to random');
            // Fall through to random for now
            break;
        case 'stratified':
            // TODO: Implement stratified sampling
            console.warn('Stratified sampling not yet implemented, falling back to random');
            // Fall through to random for now
            break;
    }
    return { points, normals, faceIndices, barycentricCoords };
}
/**
 * Execute Distribute Points in Volume Node
 */
export function executeDistributePointsInVolume(node, geometry) {
    const { count, volumeType } = node.parameters;
    const { seed } = node.parameters;
    const random = seededRandom(seed);
    const points = [];
    // Compute bounding box
    const bbox = new Box3().setFromObject({ geometry });
    const size = new Vector3();
    bbox.getSize(size);
    const center = bbox.getCenter(new Vector3());
    switch (volumeType) {
        case 'box':
            for (let i = 0; i < count; i++) {
                const x = center.x + (random() - 0.5) * size.x;
                const y = center.y + (random() - 0.5) * size.y;
                const z = center.z + (random() - 0.5) * size.z;
                points.push(new Vector3(x, y, z));
            }
            break;
        case 'sphere':
            const radius = Math.max(size.x, size.y, size.z) / 2;
            for (let i = 0; i < count; i++) {
                // Random point in sphere
                const u = random();
                const v = random();
                const w = random();
                const theta = 2 * Math.PI * u;
                const phi = Math.acos(2 * v - 1);
                const r = Math.cbrt(w) * radius;
                const x = center.x + r * Math.sin(phi) * Math.cos(theta);
                const y = center.y + r * Math.sin(phi) * Math.sin(theta);
                const z = center.z + r * Math.cos(phi);
                points.push(new Vector3(x, y, z));
            }
            break;
        case 'mesh':
            // TODO: Implement proper mesh volume sampling
            // For now, use bounding box rejection sampling
            let attempts = 0;
            const maxAttempts = count * 10;
            while (points.length < count && attempts < maxAttempts) {
                const x = center.x + (random() - 0.5) * size.x;
                const y = center.y + (random() - 0.5) * size.y;
                const z = center.z + (random() - 0.5) * size.z;
                // Simple check: is point inside bounding box (always true here)
                // TODO: Implement proper point-in-mesh test
                points.push(new Vector3(x, y, z));
                attempts++;
            }
            break;
        case 'cylinder':
            // TODO: Implement cylinder sampling
            console.warn('Cylinder volume sampling not yet implemented');
            break;
    }
    return { points };
}
/**
 * Execute Mesh to Points Node
 */
export function executeMeshToPoints(node, geometry) {
    const { mode } = node.parameters;
    const posAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;
    const indexAttr = geometry.index;
    const points = [];
    const normals = [];
    if (!posAttr) {
        return { points: [], normals: [] };
    }
    switch (mode) {
        case 'vertices':
            for (let i = 0; i < posAttr.count; i++) {
                points.push(new Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
                if (normalAttr) {
                    normals.push(new Vector3(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)));
                }
            }
            break;
        case 'faces':
            const faceCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
            for (let i = 0; i < faceCount; i++) {
                let i0, i1, i2;
                if (indexAttr) {
                    i0 = indexAttr.getX(i * 3);
                    i1 = indexAttr.getX(i * 3 + 1);
                    i2 = indexAttr.getX(i * 3 + 2);
                }
                else {
                    i0 = i * 3;
                    i1 = i * 3 + 1;
                    i2 = i * 3 + 2;
                }
                const v0 = new Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
                const v1 = new Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
                const v2 = new Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
                // Face centroid
                const centroid = new Vector3()
                    .addVectors(v0, v1)
                    .add(v2)
                    .divideScalar(3);
                points.push(centroid);
                // Face normal
                const edge1 = new Vector3().subVectors(v1, v0);
                const edge2 = new Vector3().subVectors(v2, v0);
                const normal = edge1.cross(edge2).normalize();
                normals.push(normal);
            }
            break;
        case 'edges':
            // TODO: Implement edge extraction
            console.warn('Edge mode not yet implemented');
            break;
        case 'corners':
            // Same as vertices for now
            for (let i = 0; i < posAttr.count; i++) {
                points.push(new Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
                if (normalAttr) {
                    normals.push(new Vector3(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)));
                }
            }
            break;
    }
    return { points, normals };
}
/**
 * Execute Point on Geometry Node
 */
export function executePointOnGeometry(node, geometry) {
    const { factor } = node.inputs;
    const posAttr = geometry.attributes.position;
    if (!posAttr || posAttr.count === 0) {
        return {
            position: new Vector3(),
            normal: new Vector3(),
            faceIndex: -1,
        };
    }
    // Simple implementation: interpolate along vertices
    const index = Math.floor(factor * (posAttr.count - 1));
    const nextIndex = Math.min(index + 1, posAttr.count - 1);
    const localFactor = (factor * (posAttr.count - 1)) - index;
    const p0 = new Vector3(posAttr.getX(index), posAttr.getY(index), posAttr.getZ(index));
    const p1 = new Vector3(posAttr.getX(nextIndex), posAttr.getY(nextIndex), posAttr.getZ(nextIndex));
    const position = new Vector3().lerpVectors(p0, p1, localFactor);
    const normal = geometry.attributes.normal
        ? new Vector3(geometry.attributes.normal.getX(index), geometry.attributes.normal.getY(index), geometry.attributes.normal.getZ(index))
        : new Vector3(0, 1, 0);
    return {
        position,
        normal,
        faceIndex: Math.floor(index / 3),
    };
}
/**
 * Execute Sample Nearest Surface Node
 */
export function executeSampleNearestSurface(node, geometry) {
    const { position } = node.inputs;
    const posAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;
    if (!posAttr || posAttr.count === 0) {
        return {
            position: new Vector3(),
            normal: new Vector3(),
            distance: Infinity,
            faceIndex: -1,
        };
    }
    // Find nearest vertex (approximation)
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    for (let i = 0; i < posAttr.count; i++) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        const pz = posAttr.getZ(i);
        const dx = px - position.x;
        const dy = py - position.y;
        const dz = pz - position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < nearestDistance) {
            nearestDistance = dist;
            nearestIndex = i;
        }
    }
    const resultPos = new Vector3(posAttr.getX(nearestIndex), posAttr.getY(nearestIndex), posAttr.getZ(nearestIndex));
    const resultNormal = normalAttr
        ? new Vector3(normalAttr.getX(nearestIndex), normalAttr.getY(nearestIndex), normalAttr.getZ(nearestIndex))
        : new Vector3(0, 1, 0);
    return {
        position: resultPos,
        normal: resultNormal,
        distance: nearestDistance,
        faceIndex: Math.floor(nearestIndex / 3),
    };
}
/**
 * Execute Random Value Node
 */
export function executeRandomValue(node) {
    const { dataType } = node.parameters;
    const min = node.inputs.min ?? 0;
    const max = node.inputs.max ?? 1;
    const id = node.inputs.id ?? 0;
    const random = seededRandom(id);
    const rand = random();
    let value;
    switch (dataType) {
        case 'float':
            value = typeof min === 'number' && typeof max === 'number'
                ? min + rand * (max - min)
                : rand;
            break;
        case 'integer':
            const minInt = typeof min === 'number' ? Math.floor(min) : 0;
            const maxInt = typeof max === 'number' ? Math.floor(max) : 1;
            value = Math.floor(minInt + rand * (maxInt - minInt + 1));
            break;
        case 'vector':
            const minV = min instanceof Vector3 ? min : new Vector3(0, 0, 0);
            const maxV = max instanceof Vector3 ? max : new Vector3(1, 1, 1);
            value = new Vector3(minV.x + rand * (maxV.x - minV.x), minV.y + rand * (maxV.y - minV.y), minV.z + rand * (maxV.z - minV.z));
            break;
        case 'boolean':
            value = rand < 0.5;
            break;
        default:
            value = rand;
    }
    return { value };
}
/**
 * Execute Position Node
 */
export function executePosition(node, geometry) {
    const { offset } = node.inputs;
    const posAttr = geometry.attributes.position;
    const positions = [];
    if (!posAttr) {
        return { position: [] };
    }
    for (let i = 0; i < posAttr.count; i++) {
        const pos = new Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        if (offset) {
            pos.add(offset);
        }
        positions.push(pos);
    }
    return { position: positions };
}
/**
 * Execute Normal Node
 */
export function executeNormal(node, geometry) {
    const normalAttr = geometry.attributes.normal;
    const normals = [];
    if (!normalAttr) {
        return { normal: [] };
    }
    for (let i = 0; i < normalAttr.count; i++) {
        normals.push(new Vector3(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)));
    }
    return { normal: normals };
}
/**
 * Execute Instance on Points Node
 */
export function executeInstanceOnPoints(node) {
    const { points, instance } = node.inputs;
    const { alignRotationToNormal } = node.parameters;
    // In a full implementation, this would create an InstancedMesh
    // For now, return metadata about the instances
    return {
        instances: {
            baseGeometry: instance,
            count: points.length,
            positions: points,
            alignedToNormal: alignRotationToNormal,
        },
    };
}
/**
 * Execute Realize Instances Node
 */
export function executeRealizeInstances(node, geometry) {
    // In a full implementation, this would convert instanced geometry to regular geometry
    // For now, return the input unchanged
    return geometry.clone();
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Seeded random number generator
 */
function seededRandom(seed) {
    let state = seed;
    return function () {
        state = (state * 9301 + 49297) % 233280;
        return state / 233280;
    };
}
//# sourceMappingURL=SampleNodes.js.map