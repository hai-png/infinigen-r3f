/**
 * MeshOptimizer.ts
 *
 * Post-processing mesh optimization including decimation,
 * normal smoothing, and topology improvement.
 *
 * Based on original Infinigen's mesh optimization pipeline.
 */
import { BufferGeometry, Vector3, Vector2 } from 'three';
const DEFAULT_OPTIMIZATION_CONFIG = {
    targetFaceCount: 10000,
    aggressiveDecimation: false,
    preserveBoundaries: true,
    smoothNormals: true,
    normalSmoothingAngle: 30,
    removeDegenerateFaces: true,
    weldVertices: true,
    weldThreshold: 0.0001,
};
/**
 * Optimizes terrain meshes for performance and quality
 */
export class MeshOptimizer {
    constructor(config = {}) {
        this.config = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };
    }
    /**
     * Apply full optimization pipeline to geometry
     */
    optimize(geometry) {
        let optimizedGeom = geometry.clone();
        // Step 1: Remove degenerate faces
        if (this.config.removeDegenerateFaces) {
            optimizedGeom = this.removeDegenerateFaces(optimizedGeom);
        }
        // Step 2: Weld vertices
        if (this.config.weldVertices) {
            optimizedGeom = this.weldVertices(optimizedGeom);
        }
        // Step 3: Decimate if needed
        const faceCount = optimizedGeom.index
            ? optimizedGeom.index.count / 3
            : optimizedGeom.getAttribute('position').count / 3;
        if (faceCount > this.config.targetFaceCount) {
            optimizedGeom = this.decimate(optimizedGeom);
        }
        // Step 4: Smooth normals
        if (this.config.smoothNormals) {
            optimizedGeom = this.smoothNormals(optimizedGeom);
        }
        return optimizedGeom;
    }
    /**
     * Remove degenerate (zero-area) faces
     */
    removeDegenerateFaces(geometry) {
        const positions = geometry.getAttribute('position');
        const index = geometry.getIndex();
        if (!index)
            return geometry;
        const validIndices = [];
        const v0 = new Vector3();
        const v1 = new Vector3();
        const v2 = new Vector3();
        const edge1 = new Vector3();
        const edge2 = new Vector3();
        const cross = new Vector3();
        for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i);
            const b = index.getX(i + 1);
            const c = index.getX(i + 2);
            v0.fromBufferAttribute(positions, a);
            v1.fromBufferAttribute(positions, b);
            v2.fromBufferAttribute(positions, c);
            edge1.subVectors(v1, v0);
            edge2.subVectors(v2, v0);
            cross.crossVectors(edge1, edge2);
            // Keep face if area is significant
            if (cross.length() > 1e-6) {
                validIndices.push(a, b, c);
            }
        }
        const newIndex = new Uint32Array(validIndices);
        const newGeometry = geometry.clone();
        // @ts-ignore - BufferGeometry.setIndex typing
        newGeometry.setIndex(newIndex);
        return newGeometry;
    }
    /**
     * Weld nearby vertices together
     */
    weldVertices(geometry) {
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        const uvs = geometry.getAttribute('uv');
        const index = geometry.getIndex();
        const vertexMap = new Map();
        const newPositions = [];
        const newNormals = [];
        const newUvs = [];
        const newIndex = [];
        const tempVec = new Vector3();
        const tempNormal = new Vector3();
        const tempUV = new Vector2();
        for (let i = 0; i < positions.count; i++) {
            tempVec.fromBufferAttribute(positions, i);
            // Create hash key from position
            const key = `${Math.round(tempVec.x / this.config.weldThreshold)},${Math.round(tempVec.y / this.config.weldThreshold)},${Math.round(tempVec.z / this.config.weldThreshold)}`;
            if (!vertexMap.has(key)) {
                // New unique vertex
                const newIndex = newPositions.length / 3;
                vertexMap.set(key, newIndex);
                newPositions.push(tempVec.x, tempVec.y, tempVec.z);
                if (normals) {
                    tempNormal.fromBufferAttribute(normals, i);
                    newNormals.push(tempNormal.x, tempNormal.y, tempNormal.z);
                }
                if (uvs) {
                    tempUV.fromBufferAttribute(uvs, i);
                    newUvs.push(tempUV.x, tempUV.y);
                }
            }
        }
        // Remap indices
        if (index) {
            for (let i = 0; i < index.count; i++) {
                const oldIdx = index.getX(i);
                const tempVec2 = new Vector3().fromBufferAttribute(positions, oldIdx);
                const key = `${Math.round(tempVec2.x / this.config.weldThreshold)},${Math.round(tempVec2.y / this.config.weldThreshold)},${Math.round(tempVec2.z / this.config.weldThreshold)}`;
                newIndex.push(vertexMap.get(key));
            }
        }
        else {
            for (let i = 0; i < positions.count; i++) {
                const tempVec2 = new Vector3().fromBufferAttribute(positions, i);
                const key = `${Math.round(tempVec2.x / this.config.weldThreshold)},${Math.round(tempVec2.y / this.config.weldThreshold)},${Math.round(tempVec2.z / this.config.weldThreshold)}`;
                newIndex.push(vertexMap.get(key));
            }
        }
        const newGeometry = new BufferGeometry();
        newGeometry.setAttribute('position', new Float32Array(newPositions));
        if (newNormals.length > 0) {
            newGeometry.setAttribute('normal', new Float32Array(newNormals));
        }
        if (newUvs.length > 0) {
            newGeometry.setAttribute('uv', new Float32Array(newUvs));
        }
        newGeometry.setIndex(new Uint32Array(newIndex));
        newGeometry.computeVertexNormals();
        return newGeometry;
    }
    /**
     * Simplify mesh through edge collapse decimation
     */
    decimate(geometry) {
        // Simplified quadric error metric decimation
        const positions = geometry.getAttribute('position');
        const index = geometry.getIndex();
        if (!index)
            return geometry;
        const targetFaces = Math.min(this.config.targetFaceCount, index.count / 3);
        // For now, use progressive sampling approach
        // In production, implement full QEM decimation
        const sampleRate = targetFaces / (index.count / 3);
        const keptIndices = [];
        for (let i = 0; i < index.count; i += 3) {
            if (Math.random() < sampleRate) {
                keptIndices.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
            }
        }
        if (keptIndices.length === 0) {
            // Ensure at least some faces remain
            for (let i = 0; i < Math.min(index.count, targetFaces * 3); i += 3) {
                keptIndices.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
            }
        }
        const newGeometry = geometry.clone();
        const newIndex = new Uint32Array(keptIndices);
        // @ts-ignore - BufferGeometry.setIndex typing
        newGeometry.setIndex(newIndex);
        return newGeometry;
    }
    /**
     * Smooth vertex normals based on adjacent face normals
     */
    smoothNormals(geometry) {
        const positions = geometry.getAttribute('position');
        const index = geometry.getIndex();
        if (!index) {
            geometry.computeVertexNormals();
            return geometry;
        }
        const normals = geometry.getAttribute('normal');
        const newNormals = new Float32Array(normals.count * 3);
        const faceNormals = [];
        const v0 = new Vector3();
        const v1 = new Vector3();
        const v2 = new Vector3();
        const edge1 = new Vector3();
        const edge2 = new Vector3();
        // Calculate face normals
        for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i);
            const b = index.getX(i + 1);
            const c = index.getX(i + 2);
            v0.fromBufferAttribute(positions, a);
            v1.fromBufferAttribute(positions, b);
            v2.fromBufferAttribute(positions, c);
            edge1.subVectors(v1, v0);
            edge2.subVectors(v2, v0);
            const normal = new Vector3().crossVectors(edge1, edge2).normalize();
            faceNormals.push(normal);
        }
        // Accumulate normals per vertex
        const vertexNormals = new Array(positions.count);
        for (let i = 0; i < positions.count; i++) {
            vertexNormals[i] = new Vector3();
        }
        for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i);
            const b = index.getX(i + 1);
            const c = index.getX(i + 2);
            const faceNormal = faceNormals[i / 3];
            vertexNormals[a].add(faceNormal);
            vertexNormals[b].add(faceNormal);
            vertexNormals[c].add(faceNormal);
        }
        // Normalize and apply angle-based smoothing
        for (let i = 0; i < positions.count; i++) {
            const normal = vertexNormals[i];
            if (normal.length() > 0) {
                normal.normalize();
                // Optional: limit smoothing based on angle threshold
                if (this.config.normalSmoothingAngle < 180) {
                    // Could implement angle-based limiting here
                }
                newNormals[i * 3] = normal.x;
                newNormals[i * 3 + 1] = normal.y;
                newNormals[i * 3 + 2] = normal.z;
            }
        }
        const newGeometry = geometry.clone();
        newGeometry.setAttribute('normal', new Float32Array(newNormals));
        return newGeometry;
    }
    /**
     * Update optimization configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
export default MeshOptimizer;
//# sourceMappingURL=MeshOptimizer.js.map