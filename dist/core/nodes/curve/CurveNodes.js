/**
 * Curve Nodes - TypeScript implementation of Blender geometry curve nodes
 * Based on infinigen/core/nodes/nodegroups/ and Blender geometry nodes
 *
 * Provides curve manipulation, sampling, and primitive generation
 */
import * as THREE from 'three';
import { getAttribute } from '../helpers/attribute-helpers';
// ============================================================================
// Node Definitions & Execute Functions
// ============================================================================
/**
 * Convert a curve to a mesh by extruding along a profile curve
 */
export const CurveToMeshDefinition = {
    name: 'CurveToMesh',
    type: 'CurveToMeshNode',
    category: 'Curve',
    inputs: [
        { name: 'Curve', type: 'GEOMETRY', default: null },
        { name: 'ProfileCurve', type: 'GEOMETRY', default: null },
        { name: 'FillCaps', type: 'BOOLEAN', default: true },
    ],
    outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
};
export function executeCurveToMesh(ctx) {
    const { Curve, FillCaps } = ctx.inputs;
    if (!Curve)
        return null;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    if (pointCount < 2)
        return null;
    const vertices = [];
    const indices = [];
    const normals = [];
    const profileResolution = 8;
    const radius = 0.1; // Default radius
    for (let i = 0; i < pointCount; i++) {
        const pos = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        let tangent;
        if (i === 0) {
            tangent = new THREE.Vector3(positions[3] - positions[0], positions[4] - positions[1], positions[5] - positions[2]).normalize();
        }
        else if (i === pointCount - 1) {
            tangent = new THREE.Vector3(positions[i * 3] - positions[(i - 1) * 3], positions[i * 3 + 1] - positions[(i - 1) * 3 + 1], positions[i * 3 + 2] - positions[(i - 1) * 3 + 2]).normalize();
        }
        else {
            tangent = new THREE.Vector3(positions[(i + 1) * 3] - positions[(i - 1) * 3], positions[(i + 1) * 3 + 1] - positions[(i - 1) * 3 + 1], positions[(i + 1) * 3 + 2] - positions[(i - 1) * 3 + 2]).normalize();
        }
        const up = Math.abs(tangent.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
        for (let j = 0; j < profileResolution; j++) {
            const angle = (j / profileResolution) * Math.PI * 2;
            const offset = normal.clone().multiplyScalar(Math.cos(angle) * radius).add(binormal.clone().multiplyScalar(Math.sin(angle) * radius));
            const vertex = pos.clone().add(offset);
            vertices.push(vertex.x, vertex.y, vertex.z);
            normals.push(normal.x, normal.y, normal.z);
        }
    }
    for (let i = 0; i < pointCount - 1; i++) {
        for (let j = 0; j < profileResolution; j++) {
            const current = i * profileResolution + j;
            const next = (i + 1) * profileResolution + j;
            const nextJ = (j + 1) % profileResolution;
            indices.push(current, next, current + nextJ);
            indices.push(next, next + nextJ, current + nextJ);
        }
    }
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    mesh.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    mesh.setIndex(indices);
    return mesh;
}
/**
 * Convert curve to points distributed along its length
 */
export const CurveToPointsDefinition = {
    name: 'CurveToPoints',
    type: 'CurveToPointsNode',
    category: 'Curve',
    inputs: [
        { name: 'Curve', type: 'GEOMETRY', default: null },
        { name: 'Count', type: 'INT', default: 1 },
        { name: 'Length', type: 'FLOAT', default: 0 },
    ],
    outputs: [{ name: 'Points', type: 'GEOMETRY' }],
};
export function executeCurveToPoints(ctx) {
    const { Curve, Count } = ctx.inputs;
    if (!Curve || Count < 1)
        return null;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    if (pointCount < 2)
        return null;
    const segmentLengths = [];
    let totalLength = 0;
    for (let i = 0; i < pointCount - 1; i++) {
        const p1 = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const p2 = new THREE.Vector3(positions[(i + 1) * 3], positions[(i + 1) * 3 + 1], positions[(i + 1) * 3 + 2]);
        const len = p1.distanceTo(p2);
        segmentLengths.push(len);
        totalLength += len;
    }
    const newPositions = [];
    for (let i = 0; i < Count; i++) {
        const t = Count === 1 ? 0.5 : i / (Count - 1);
        const targetDist = t * totalLength;
        let currentDist = 0;
        for (let j = 0; j < segmentLengths.length; j++) {
            if (currentDist + segmentLengths[j] >= targetDist) {
                const segmentT = (targetDist - currentDist) / segmentLengths[j];
                const p1 = new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
                const p2 = new THREE.Vector3(positions[(j + 1) * 3], positions[(j + 1) * 3 + 1], positions[(j + 1) * 3 + 2]);
                const point = p1.lerp(p2, segmentT);
                newPositions.push(point.x, point.y, point.z);
                break;
            }
            currentDist += segmentLengths[j];
        }
    }
    const points = new THREE.BufferGeometry();
    points.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    return points;
}
/**
 * Convert mesh edges to curves
 */
export const MeshToCurveDefinition = {
    name: 'MeshToCurve',
    type: 'MeshToCurveNode',
    category: 'Curve',
    inputs: [{ name: 'Mesh', type: 'GEOMETRY', default: null }],
    outputs: [{ name: 'Curve', type: 'GEOMETRY' }],
};
export function executeMeshToCurve(ctx) {
    const { Mesh } = ctx.inputs;
    if (!Mesh)
        return null;
    const positions = getAttribute(Mesh, 'position');
    const index = Mesh.index;
    const vertices = [];
    if (index) {
        const indices = index.array;
        const edgeSet = new Set();
        for (let i = 0; i < indices.length; i += 3) {
            const edges = [
                [indices[i], indices[i + 1]],
                [indices[i + 1], indices[i + 2]],
                [indices[i + 2], indices[i]],
            ];
            for (const [a, b] of edges) {
                const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    vertices.push(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2], positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
                }
            }
        }
    }
    else {
        for (let i = 0; i < positions.length; i += 9) {
            for (let j = 0; j < 3; j++) {
                const p1 = i + j * 3;
                const p2 = i + ((j + 1) % 3) * 3;
                vertices.push(positions[p1], positions[p1 + 1], positions[p1 + 2], positions[p2], positions[p2 + 1], positions[p2 + 2]);
            }
        }
    }
    const curve = new THREE.BufferGeometry();
    curve.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return curve;
}
/**
 * Sample a point on a curve at given factor or length
 */
export const SampleCurveDefinition = {
    name: 'SampleCurve',
    type: 'SampleCurveNode',
    category: 'Curve',
    inputs: [
        { name: 'Curve', type: 'GEOMETRY', default: null },
        { name: 'Factor', type: 'FLOAT', default: 0.5 },
        { name: 'Length', type: 'FLOAT', default: 0 },
    ],
    outputs: [
        { name: 'Position', type: 'VECTOR' },
        { name: 'Tangent', type: 'VECTOR' },
        { name: 'Normal', type: 'VECTOR' },
        { name: 'Rotation', type: 'ROTATION' },
    ],
};
export function executeSampleCurve(ctx) {
    const { Curve, Factor, Length } = ctx.inputs;
    const defaultValue = {
        Position: new THREE.Vector3(),
        Tangent: new THREE.Vector3(0, 0, 1),
        Normal: new THREE.Vector3(0, 1, 0),
        Rotation: new THREE.Quaternion(),
    };
    if (!Curve)
        return defaultValue;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    if (pointCount < 2)
        return defaultValue;
    let totalLength = 0;
    const segmentLengths = [];
    for (let i = 0; i < pointCount - 1; i++) {
        const p1 = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const p2 = new THREE.Vector3(positions[(i + 1) * 3], positions[(i + 1) * 3 + 1], positions[(i + 1) * 3 + 2]);
        const len = p1.distanceTo(p2);
        segmentLengths.push(len);
        totalLength += len;
    }
    const targetDist = Length > 0 ? Length : Factor * totalLength;
    let currentDist = 0;
    for (let i = 0; i < segmentLengths.length; i++) {
        if (currentDist + segmentLengths[i] >= targetDist) {
            const segmentT = (targetDist - currentDist) / segmentLengths[i];
            const p1 = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            const p2 = new THREE.Vector3(positions[(i + 1) * 3], positions[(i + 1) * 3 + 1], positions[(i + 1) * 3 + 2]);
            const position = p1.clone().lerp(p2, segmentT);
            const tangent = p2.clone().sub(p1).normalize();
            const up = Math.abs(tangent.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
            const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();
            const binormal = new THREE.Vector3().crossVectors(tangent, normal);
            const matrix = new THREE.Matrix4().makeBasis(tangent, normal, binormal);
            const rotation = new THREE.Quaternion().setFromRotationMatrix(matrix);
            return { Position: position, Tangent: tangent, Normal: normal, Rotation: rotation };
        }
        currentDist += segmentLengths[i];
    }
    return defaultValue;
}
/**
 * Set the radius of curve control points
 */
export const SetCurveRadiusDefinition = {
    name: 'SetCurveRadius',
    type: 'SetCurveRadiusNode',
    category: 'Curve',
    inputs: [
        { name: 'Curve', type: 'GEOMETRY', default: null },
        { name: 'Radius', type: 'FLOAT', default: 1 },
        { name: 'Selection', type: 'BOOLEAN', default: null },
    ],
    outputs: [{ name: 'Curve', type: 'GEOMETRY' }],
};
export function executeSetCurveRadius(ctx) {
    const { Curve, Radius, Selection } = ctx.inputs;
    if (!Curve)
        return null;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    const result = Curve.clone();
    const radii = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
        if (!Selection || Selection[i]) {
            radii[i] = Radius;
        }
        else {
            const existingRadii = getAttribute(Curve, 'radius');
            radii[i] = existingRadii ? existingRadii[i] : 1;
        }
    }
    result.setAttribute('radius', new THREE.Float32BufferAttribute(radii, 1));
    return result;
}
/**
 * Set the tilt angle of curve control points
 */
export const SetCurveTiltDefinition = {
    name: 'SetCurveTilt',
    type: 'SetCurveTiltNode',
    category: 'Curve',
    inputs: [
        { name: 'Curve', type: 'GEOMETRY', default: null },
        { name: 'Tilt', type: 'FLOAT', default: 0 },
        { name: 'Selection', type: 'BOOLEAN', default: null },
    ],
    outputs: [{ name: 'Curve', type: 'GEOMETRY' }],
};
export function executeSetCurveTilt(ctx) {
    const { Curve, Tilt, Selection } = ctx.inputs;
    if (!Curve)
        return null;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    const result = Curve.clone();
    const tilts = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
        if (!Selection || Selection[i]) {
            tilts[i] = Tilt;
        }
        else {
            const existingTilts = getAttribute(Curve, 'tilt');
            tilts[i] = existingTilts ? existingTilts[i] : 0;
        }
    }
    result.setAttribute('tilt', new THREE.Float32BufferAttribute(tilts, 1));
    return result;
}
/**
 * Calculate the total length of a curve
 */
export const CurveLengthDefinition = {
    name: 'CurveLength',
    type: 'CurveLengthNode',
    category: 'Curve',
    inputs: [{ name: 'Curve', type: 'GEOMETRY', default: null }],
    outputs: [{ name: 'Length', type: 'FLOAT' }],
};
export function executeCurveLength(ctx) {
    const { Curve } = ctx.inputs;
    if (!Curve)
        return 0;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    if (pointCount < 2)
        return 0;
    let totalLength = 0;
    for (let i = 0; i < pointCount - 1; i++) {
        const p1 = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const p2 = new THREE.Vector3(positions[(i + 1) * 3], positions[(i + 1) * 3 + 1], positions[(i + 1) * 3 + 2]);
        totalLength += p1.distanceTo(p2);
    }
    return totalLength;
}
/**
 * Subdivide curve segments
 */
export const SubdivideCurveDefinition = {
    name: 'SubdivideCurve',
    type: 'SubdivideCurveNode',
    category: 'Curve',
    inputs: [
        { name: 'Curve', type: 'GEOMETRY', default: null },
        { name: 'Cuts', type: 'INT', default: 1 },
    ],
    outputs: [{ name: 'Curve', type: 'GEOMETRY' }],
};
export function executeSubdivideCurve(ctx) {
    const { Curve, Cuts } = ctx.inputs;
    if (!Curve || Cuts < 1)
        return Curve;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    if (pointCount < 2)
        return null;
    const newVertices = [];
    for (let i = 0; i < pointCount - 1; i++) {
        const p1 = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const p2 = new THREE.Vector3(positions[(i + 1) * 3], positions[(i + 1) * 3 + 1], positions[(i + 1) * 3 + 2]);
        newVertices.push(p1.x, p1.y, p1.z);
        for (let j = 1; j <= Cuts; j++) {
            const t = j / (Cuts + 1);
            const point = p1.clone().lerp(p2, t);
            newVertices.push(point.x, point.y, point.z);
        }
    }
    newVertices.push(positions[(pointCount - 1) * 3], positions[(pointCount - 1) * 3 + 1], positions[(pointCount - 1) * 3 + 2]);
    const curve = new THREE.BufferGeometry();
    curve.setAttribute('position', new THREE.Float32BufferAttribute(newVertices, 3));
    return curve;
}
/**
 * Resample curve to have uniform point distribution
 */
export const ResampleCurveDefinition = {
    name: 'ResampleCurve',
    type: 'ResampleCurveNode',
    category: 'Curve',
    inputs: [
        { name: 'Curve', type: 'GEOMETRY', default: null },
        { name: 'Count', type: 'INT', default: 0 },
        { name: 'Length', type: 'FLOAT', default: 0 },
        { name: 'Start', type: 'FLOAT', default: 0 },
        { name: 'End', type: 'FLOAT', default: 1 },
    ],
    outputs: [{ name: 'Curve', type: 'GEOMETRY' }],
};
export function executeResampleCurve(ctx) {
    const { Curve, Count, Start, End } = ctx.inputs;
    if (!Curve)
        return null;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    if (pointCount < 2)
        return null;
    let totalLength = 0;
    const segmentLengths = [];
    for (let i = 0; i < pointCount - 1; i++) {
        const p1 = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const p2 = new THREE.Vector3(positions[(i + 1) * 3], positions[(i + 1) * 3 + 1], positions[(i + 1) * 3 + 2]);
        const len = p1.distanceTo(p2);
        segmentLengths.push(len);
        totalLength += len;
    }
    const trimmedLength = totalLength * (End - Start);
    const actualCount = Count > 0 ? Count : Math.max(2, Math.ceil(trimmedLength));
    const newVertices = [];
    for (let i = 0; i < actualCount; i++) {
        const t = actualCount === 1 ? 0.5 : i / (actualCount - 1);
        const adjustedT = Start + t * (End - Start);
        const targetDist = adjustedT * totalLength;
        let currentDist = 0;
        for (let j = 0; j < segmentLengths.length; j++) {
            if (currentDist + segmentLengths[j] >= targetDist) {
                const segmentT = (targetDist - currentDist) / segmentLengths[j];
                const p1 = new THREE.Vector3(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
                const p2 = new THREE.Vector3(positions[(j + 1) * 3], positions[(j + 1) * 3 + 1], positions[(j + 1) * 3 + 2]);
                const point = p1.clone().lerp(p2, segmentT);
                newVertices.push(point.x, point.y, point.z);
                break;
            }
            currentDist += segmentLengths[j];
        }
    }
    const curve = new THREE.BufferGeometry();
    curve.setAttribute('position', new THREE.Float32BufferAttribute(newVertices, 3));
    return curve;
}
/**
 * Create a circle curve primitive
 */
export const CurveCircleDefinition = {
    name: 'CurveCircle',
    type: 'CurveCircleNode',
    category: 'Curve Primitives',
    inputs: [
        { name: 'Mode', type: 'ENUM', default: 'RADIUS' },
        { name: 'Radius', type: 'FLOAT', default: 1 },
        { name: 'Diameter', type: 'FLOAT', default: 2 },
        { name: 'Resolution', type: 'INT', default: 32 },
    ],
    outputs: [{ name: 'Curve', type: 'GEOMETRY' }],
};
export function executeCurveCircle(ctx) {
    const { Mode, Radius, Diameter, Resolution } = ctx.inputs;
    const radius = Mode === 'DIAMETER' ? Diameter / 2 : Radius;
    const resolution = Math.max(3, Resolution);
    const vertices = [];
    for (let i = 0; i < resolution; i++) {
        const angle = (i / resolution) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        vertices.push(x, y, 0);
    }
    vertices.push(vertices[0], vertices[1], vertices[2]);
    const curve = new THREE.BufferGeometry();
    curve.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return curve;
}
/**
 * Create a line curve primitive
 */
export const CurveLineDefinition = {
    name: 'CurveLine',
    type: 'CurveLineNode',
    category: 'Curve Primitives',
    inputs: [
        { name: 'Start', type: 'VECTOR', default: new THREE.Vector3() },
        { name: 'End', type: 'VECTOR', default: new THREE.Vector3(0, 0, 1) },
    ],
    outputs: [{ name: 'Curve', type: 'GEOMETRY' }],
};
export function executeCurveLine(ctx) {
    const { Start, End } = ctx.inputs;
    const vertices = [
        Start.x, Start.y, Start.z,
        End.x, End.y, End.z,
    ];
    const curve = new THREE.BufferGeometry();
    curve.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return curve;
}
/**
 * Fill a closed curve with a mesh
 */
export const FillCurveDefinition = {
    name: 'FillCurve',
    type: 'FillCurveNode',
    category: 'Curve',
    inputs: [
        { name: 'Curve', type: 'GEOMETRY', default: null },
        { name: 'FillHoles', type: 'BOOLEAN', default: true },
    ],
    outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
};
export function executeFillCurve(ctx) {
    const { Curve } = ctx.inputs;
    if (!Curve)
        return null;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    if (pointCount < 3)
        return null;
    const vertices = [];
    const indices = [];
    for (let i = 0; i < pointCount; i++) {
        vertices.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
    for (let i = 1; i < pointCount - 1; i++) {
        indices.push(0, i, i + 1);
    }
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    mesh.setIndex(indices);
    mesh.computeVertexNormals();
    return mesh;
}
/**
 * Add fillets (rounded corners) to curve
 */
export const FilletCurveDefinition = {
    name: 'FilletCurve',
    type: 'FilletCurveNode',
    category: 'Curve',
    inputs: [
        { name: 'Curve', type: 'GEOMETRY', default: null },
        { name: 'Radius', type: 'FLOAT', default: 1 },
        { name: 'Segments', type: 'INT', default: 4 },
    ],
    outputs: [{ name: 'Curve', type: 'GEOMETRY' }],
};
export function executeFilletCurve(ctx) {
    const { Curve, Radius, Segments } = ctx.inputs;
    if (!Curve || Radius <= 0)
        return Curve;
    const positions = getAttribute(Curve, 'position');
    const pointCount = positions.length / 3;
    if (pointCount < 3)
        return null;
    const newVertices = [];
    for (let i = 0; i < pointCount; i++) {
        const prev = new THREE.Vector3(positions[(i > 0 ? i - 1 : pointCount - 1) * 3], positions[(i > 0 ? i - 1 : pointCount - 1) * 3 + 1], positions[(i > 0 ? i - 1 : pointCount - 1) * 3 + 2]);
        const curr = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const next = new THREE.Vector3(positions[(i < pointCount - 1 ? i + 1 : 0) * 3], positions[(i < pointCount - 1 ? i + 1 : 0) * 3 + 1], positions[(i < pointCount - 1 ? i + 1 : 0) * 3 + 2]);
        const tan1 = prev.clone().sub(curr).normalize();
        const tan2 = next.clone().sub(curr).normalize();
        const angle = Math.acos(Math.max(-1, Math.min(1, tan1.dot(tan2))));
        if (angle > 0.1 && angle < Math.PI - 0.1) {
            const bisector = tan1.clone().add(tan2).normalize();
            for (let j = 0; j <= Segments; j++) {
                const t = j / Segments;
                const phi = t * angle;
                const rotated = tan1.clone().applyAxisAngle(bisector, phi);
                const point = curr.clone().add(rotated.multiplyScalar(Radius));
                newVertices.push(point.x, point.y, point.z);
            }
        }
        else {
            newVertices.push(curr.x, curr.y, curr.z);
        }
    }
    const curve = new THREE.BufferGeometry();
    curve.setAttribute('position', new THREE.Float32BufferAttribute(newVertices, 3));
    return curve;
}
//# sourceMappingURL=CurveNodes.js.map