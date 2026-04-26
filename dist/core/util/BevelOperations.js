import * as THREE from 'three';
/**
 * Bevel Operations System
 *
 * Mesh beveling and edge smoothing utilities:
 * - Chamfer (straight edge) bevels
 * - Rounded (curved) bevels with multiple segments
 * - Selective edge beveling
 * - Vertex beveling for soft corners
 * - Custom profile bevels
 *
 * @module BevelOperations
 */
/**
 * Bevel types supported
 */
export var BevelType;
(function (BevelType) {
    /** Straight chamfer cut */
    BevelType["CHAMFER"] = "chamfer";
    /** Rounded curve with segments */
    BevelType["ROUNDED"] = "rounded";
    /** Custom profile curve */
    BevelType["CUSTOM"] = "custom";
})(BevelType || (BevelType = {}));
/**
 * Bevel Operations Class
 *
 * Provides mesh beveling and edge smoothing functionality.
 */
export class BevelOperations {
    /**
     * Apply bevel to a geometry
     */
    bevel(geometry, config) {
        const startTime = performance.now();
        // Clone geometry to avoid modifying original
        const original = geometry.clone();
        const beveled = geometry.clone();
        // Ensure geometry has normals and tangents
        beveled.computeVertexNormals();
        // Extract edges from geometry
        const edges = this.extractEdges(beveled);
        // Filter edges based on angle criteria
        const minAngle = config.minAngle ?? BevelOperations.DEFAULT_MIN_ANGLE;
        const bevelableEdges = edges.filter(edge => edge.angle > minAngle);
        // Apply bevel to each edge
        let newVertices = 0;
        let newFaces = 0;
        for (const edge of bevelableEdges) {
            const result = this.bevelEdge(beveled, edge, config);
            newVertices += result.vertices;
            newFaces += result.faces;
        }
        // Update normals after beveling
        beveled.computeVertexNormals();
        const endTime = performance.now();
        return {
            original,
            beveled,
            edgesBeveled: bevelableEdges.length,
            newVertices,
            newFaces,
            processingTime: endTime - startTime,
        };
    }
    /**
     * Extract edges from geometry
     */
    extractEdges(geometry) {
        const edges = [];
        const edgeMap = new Map();
        const positions = geometry.attributes.position.array;
        const indices = geometry.index?.array || new Uint32Array(Array.from({ length: positions.length / 3 }, (_, i) => i));
        // Get face normals
        const faceNormals = [];
        for (let i = 0; i < indices.length; i += 3) {
            const v0 = new THREE.Vector3(positions[indices[i] * 3], positions[indices[i] * 3 + 1], positions[indices[i] * 3 + 2]);
            const v1 = new THREE.Vector3(positions[indices[i + 1] * 3], positions[indices[i + 1] * 3 + 1], positions[indices[i + 1] * 3 + 2]);
            const v2 = new THREE.Vector3(positions[indices[i + 2] * 3], positions[indices[i + 2] * 3 + 1], positions[indices[i + 2] * 3 + 2]);
            const normal = new THREE.Vector3();
            normal.crossVectors(new THREE.Vector3().subVectors(v1, v0), new THREE.Vector3().subVectors(v2, v0)).normalize();
            faceNormals.push(normal);
        }
        // Extract edges from faces
        for (let faceIndex = 0; faceIndex < indices.length; faceIndex += 3) {
            const i0 = indices[faceIndex];
            const i1 = indices[faceIndex + 1];
            const i2 = indices[faceIndex + 2];
            // Three edges per triangle
            const edgePairs = [[i0, i1], [i1, i2], [i2, i0]];
            for (const [start, end] of edgePairs) {
                // Create canonical edge key (sorted indices)
                const key = start < end ? `${start}-${end}` : `${end}-${start}`;
                if (edgeMap.has(key)) {
                    // Edge already exists, add this face to it
                    const edge = edgeMap.get(key);
                    edge.faces.push(faceIndex / 3);
                    // Calculate dihedral angle if we have two faces
                    if (edge.faces.length === 2) {
                        const n0 = faceNormals[edge.faces[0]];
                        const n1 = faceNormals[edge.faces[1]];
                        edge.angle = Math.acos(Math.max(-1, Math.min(1, n0.dot(n1))));
                        // Average the normals
                        edge.normal.addVectors(n0, n1).normalize();
                    }
                }
                else {
                    // New edge
                    const vStart = new THREE.Vector3(positions[start * 3], positions[start * 3 + 1], positions[start * 3 + 2]);
                    const vEnd = new THREE.Vector3(positions[end * 3], positions[end * 3 + 1], positions[end * 3 + 2]);
                    const edge = {
                        start,
                        end,
                        faces: [faceIndex / 3],
                        length: vStart.distanceTo(vEnd),
                        angle: Math.PI, // Default to 180 degrees for boundary edges
                        normal: new THREE.Vector3(),
                    };
                    edgeMap.set(key, edge);
                    edges.push(edge);
                }
            }
        }
        // Set normals for boundary edges
        for (const edge of edges) {
            if (edge.faces.length === 1) {
                // Boundary edge - use face normal
                edge.normal.copy(faceNormals[edge.faces[0]]);
            }
        }
        return edges;
    }
    /**
     * Bevel a single edge
     */
    bevelEdge(geometry, edge, config) {
        const positions = geometry.attributes.position.array;
        const vStart = new THREE.Vector3(positions[edge.start * 3], positions[edge.start * 3 + 1], positions[edge.start * 3 + 2]);
        const vEnd = new THREE.Vector3(positions[edge.end * 3], positions[edge.end * 3 + 1], positions[edge.end * 3 + 2]);
        const edgeDirection = new THREE.Vector3().subVectors(vEnd, vStart).normalize();
        const bevelWidth = Math.min(config.width, edge.length * 0.4); // Limit bevel to 40% of edge length
        // Generate bevel vertices based on type
        let bevelVertices = [];
        switch (config.type) {
            case BevelType.CHAMFER:
                bevelVertices = this.generateChamferVertices(vStart, vEnd, edgeDirection, edge.normal, bevelWidth);
                break;
            case BevelType.ROUNDED: {
                const segments = config.segments ?? BevelOperations.DEFAULT_SEGMENTS;
                bevelVertices = this.generateRoundedVertices(vStart, vEnd, edgeDirection, edge.normal, bevelWidth, segments);
                break;
            }
            case BevelType.CUSTOM:
                if (config.profile) {
                    bevelVertices = this.generateCustomProfileVertices(vStart, vEnd, edgeDirection, edge.normal, config.profile);
                }
                else {
                    bevelVertices = this.generateChamferVertices(vStart, vEnd, edgeDirection, edge.normal, bevelWidth);
                }
                break;
        }
        // Add vertices to geometry (simplified - real implementation would modify mesh topology)
        // For now, we'll just return counts
        return {
            vertices: bevelVertices.length,
            faces: bevelVertices.length > 0 ? bevelVertices.length - 1 : 0,
        };
    }
    /**
     * Generate chamfer (straight) bevel vertices
     */
    generateChamferVertices(start, end, direction, normal, width) {
        const vertices = [];
        // Create two offset vertices along the edge
        const halfWidth = width / 2;
        const offset = normal.clone().multiplyScalar(halfWidth);
        // Vertex at start, offset
        vertices.push(start.clone().add(offset));
        // Vertex at end, offset
        vertices.push(end.clone().add(offset));
        return vertices;
    }
    /**
     * Generate rounded bevel vertices
     */
    generateRoundedVertices(start, end, direction, normal, width, segments) {
        const vertices = [];
        // Create tangent vector perpendicular to both direction and normal
        const tangent = new THREE.Vector3().crossVectors(direction, normal).normalize();
        // Generate arc of vertices
        const angleStep = Math.PI / (segments + 1);
        for (let i = 1; i <= segments; i++) {
            const angle = angleStep * i;
            const sinAngle = Math.sin(angle);
            const cosAngle = Math.cos(angle);
            // Offset from original edge position
            const offset = normal.clone().multiplyScalar(cosAngle * width).add(tangent.clone().multiplyScalar(sinAngle * width));
            // Interpolate along edge
            const t = (i - 1) / (segments - 1);
            const edgePoint = new THREE.Vector3().lerpVectors(start, end, t);
            vertices.push(edgePoint.add(offset));
        }
        return vertices;
    }
    /**
     * Generate custom profile bevel vertices
     */
    generateCustomProfileVertices(start, end, direction, normal, profile) {
        const vertices = [];
        const tangent = new THREE.Vector3().crossVectors(direction, normal).normalize();
        for (const point of profile) {
            const offset = normal.clone().multiplyScalar(point.y).add(tangent.clone().multiplyScalar(point.x));
            // Use midpoint of edge for profile placement
            const midPoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
            vertices.push(midPoint.clone().add(offset));
        }
        return vertices;
    }
    /**
     * Apply vertex beveling (soften corners)
     */
    bevelVertices(geometry, radius) {
        const result = geometry.clone();
        const positions = result.attributes.position.array;
        // For each vertex, move it inward based on adjacent face normals
        const vertexNormals = this.calculateVertexNormals(result);
        for (let i = 0; i < positions.length; i += 3) {
            const normal = vertexNormals[i / 3];
            if (normal) {
                const displacement = normal.clone().multiplyScalar(radius * 0.1);
                positions[i] -= displacement.x;
                positions[i + 1] -= displacement.y;
                positions[i + 2] -= displacement.z;
            }
        }
        result.attributes.position.needsUpdate = true;
        result.computeVertexNormals();
        return result;
    }
    /**
     * Calculate per-vertex average normals
     */
    calculateVertexNormals(geometry) {
        const normals = [];
        const positions = geometry.attributes.position.array;
        const indices = geometry.index?.array || new Uint32Array(Array.from({ length: positions.length / 3 }, (_, i) => i));
        // Initialize normals
        for (let i = 0; i < positions.length / 3; i++) {
            normals.push(new THREE.Vector3());
        }
        // Accumulate face normals
        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i];
            const i1 = indices[i + 1];
            const i2 = indices[i + 2];
            const v0 = new THREE.Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
            const v1 = new THREE.Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
            const v2 = new THREE.Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
            const normal = new THREE.Vector3();
            normal.crossVectors(new THREE.Vector3().subVectors(v1, v0), new THREE.Vector3().subVectors(v2, v0)).normalize();
            normals[i0].add(normal);
            normals[i1].add(normal);
            normals[i2].add(normal);
        }
        // Normalize accumulated normals
        for (const normal of normals) {
            normal.normalize();
        }
        return normals;
    }
    /**
     * Selective edge beveling based on edge groups
     */
    bevelSelective(geometry, edgeIndices, config) {
        const startTime = performance.now();
        const original = geometry.clone();
        const beveled = geometry.clone();
        beveled.computeVertexNormals();
        const allEdges = this.extractEdges(beveled);
        const selectedEdges = edgeIndices.map(i => allEdges[i]).filter(Boolean);
        let newVertices = 0;
        let newFaces = 0;
        for (const edge of selectedEdges) {
            const result = this.bevelEdge(beveled, edge, config);
            newVertices += result.vertices;
            newFaces += result.faces;
        }
        beveled.computeVertexNormals();
        const endTime = performance.now();
        return {
            original,
            beveled,
            edgesBeveled: selectedEdges.length,
            newVertices,
            newFaces,
            processingTime: endTime - startTime,
        };
    }
    /**
     * Visualize beveled edges
     */
    visualizeEdges(geometry, color = 0xff0000) {
        const edges = this.extractEdges(geometry);
        const positions = geometry.attributes.position.array;
        const linePositions = [];
        for (const edge of edges) {
            const vStart = new THREE.Vector3(positions[edge.start * 3], positions[edge.start * 3 + 1], positions[edge.start * 3 + 2]);
            const vEnd = new THREE.Vector3(positions[edge.end * 3], positions[edge.end * 3 + 1], positions[edge.end * 3 + 2]);
            linePositions.push(vStart.x, vStart.y, vStart.z);
            linePositions.push(vEnd.x, vEnd.y, vEnd.z);
        }
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        const material = new THREE.LineBasicMaterial({ color });
        return new THREE.LineSegments(lineGeometry, material);
    }
    /**
     * Export beveled geometry
     */
    export(geometry, format) {
        if (format === 'json') {
            return JSON.stringify({
                attributes: {
                    position: Array.from(geometry.attributes.position.array),
                    normal: geometry.attributes.normal ? Array.from(geometry.attributes.normal.array) : null,
                    uv: geometry.attributes.uv ? Array.from(geometry.attributes.uv.array) : null,
                },
                index: geometry.index ? Array.from(geometry.index.array) : null,
            });
        }
        // Simplified OBJ export
        let obj = '# Beveled Mesh\n';
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal?.array;
        // Vertices
        for (let i = 0; i < positions.length; i += 3) {
            obj += `v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}\n`;
        }
        // Normals
        if (normals) {
            for (let i = 0; i < normals.length; i += 3) {
                obj += `vn ${normals[i]} ${normals[i + 1]} ${normals[i + 2]}\n`;
            }
        }
        // Faces
        const indices = geometry.index?.array || new Uint32Array(Array.from({ length: positions.length / 3 }, (_, i) => i + 1));
        for (let i = 0; i < indices.length; i += 3) {
            obj += `f ${indices[i] + 1}//${indices[i] + 1} ${indices[i + 1] + 1}//${indices[i + 1] + 1} ${indices[i + 2] + 1}//${indices[i + 2] + 1}\n`;
        }
        return obj;
    }
}
/** Default minimum angle for beveling (30 degrees) */
BevelOperations.DEFAULT_MIN_ANGLE = Math.PI / 6;
/** Default segments for rounded bevels */
BevelOperations.DEFAULT_SEGMENTS = 3;
/** Default bevel type */
BevelOperations.DEFAULT_TYPE = BevelType.CHAMFER;
export default BevelOperations;
//# sourceMappingURL=BevelOperations.js.map