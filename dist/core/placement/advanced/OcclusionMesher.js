/**
 * Occlusion Mesher for InfiniGen R3F
 *
 * Generates simplified collision meshes from complex geometry:
 * - Voxel-based simplification
 * - Convex decomposition
 * - LOD generation for physics
 */
import { Vector3, Box3, Mesh, BufferGeometry } from 'three';
import { BBox } from '../util/math/bbox';
// ============================================================================
// Voxel Grid Implementation
// ============================================================================
class VoxelGrid {
    constructor(voxelSize) {
        this.voxelSize = voxelSize;
        this.voxels = new Set();
        this.bounds = new Box3();
    }
    /**
     * Add a point to the voxel grid
     */
    addPoint(point) {
        const key = this.voxelKey(point);
        this.voxels.add(key);
        // Update bounds
        const voxelCenter = this.keyToPosition(key);
        this.bounds.expandByPoint(voxelCenter);
    }
    /**
     * Check if a voxel exists
     */
    hasVoxel(point) {
        return this.voxels.has(this.voxelKey(point));
    }
    /**
     * Get all voxel positions
     */
    getVoxelPositions() {
        const positions = [];
        for (const key of this.voxels) {
            positions.push(this.keyToPosition(key));
        }
        return positions;
    }
    /**
     * Get voxel count
     */
    getVoxelCount() {
        return this.voxels.size;
    }
    /**
     * Clear all voxels
     */
    clear() {
        this.voxels.clear();
        this.bounds.makeEmpty();
    }
    voxelKey(point) {
        const x = Math.floor(point.x / this.voxelSize);
        const y = Math.floor(point.y / this.voxelSize);
        const z = Math.floor(point.z / this.voxelSize);
        return `${x},${y},${z}`;
    }
    keyToPosition(key) {
        const [x, y, z] = key.split(',').map(Number);
        return new Vector3((x + 0.5) * this.voxelSize, (y + 0.5) * this.voxelSize, (z + 0.5) * this.voxelSize);
    }
    getBounds() {
        return this.bounds.clone();
    }
}
// ============================================================================
// Voxelizer
// ============================================================================
export class Voxelizer {
    constructor(config) {
        this.config = config;
        this.grid = new VoxelGrid(config.voxelSize);
    }
    /**
     * Voxelize a mesh
     */
    voxelize(mesh) {
        this.grid.clear();
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position.array;
        const indices = geometry.index?.array || new Array(positions.length / 3).fill(0).map((_, i) => i);
        // Transform matrix
        const matrix = mesh.matrixWorld;
        // Sample points on triangles
        const sampleCount = Math.min(10000, indices.length / 3 * 4);
        for (let i = 0; i < sampleCount; i++) {
            // Pick random triangle
            const triIndex = Math.floor(Math.random() * (indices.length / 3)) * 3;
            // Get triangle vertices
            const v0 = new Vector3(positions[indices[triIndex] * 3], positions[indices[triIndex] * 3 + 1], positions[indices[triIndex] * 3 + 2]).applyMatrix4(matrix);
            const v1 = new Vector3(positions[indices[triIndex + 1] * 3], positions[indices[triIndex + 1] * 3 + 1], positions[indices[triIndex + 1] * 3 + 2]).applyMatrix4(matrix);
            const v2 = new Vector3(positions[indices[triIndex + 2] * 3], positions[indices[triIndex + 2] * 3 + 1], positions[indices[triIndex + 2] * 3 + 2]).applyMatrix4(matrix);
            // Random point in triangle using barycentric coordinates
            const r1 = Math.random();
            const r2 = Math.random();
            const sqrtR1 = Math.sqrt(r1);
            const u = 1 - sqrtR1;
            const v = sqrtR1 * (1 - r2);
            const w = sqrtR1 * r2;
            const point = new Vector3(u * v0.x + v * v1.x + w * v2.x, u * v0.y + v * v1.y + w * v2.y, u * v0.z + v * v1.z + w * v2.z);
            this.grid.addPoint(point);
            // Check voxel limit
            if (this.grid.getVoxelCount() >= this.config.maxVoxels) {
                break;
            }
        }
        // Optionally merge adjacent voxels
        if (this.config.mergeVoxels) {
            this.mergeAdjacentVoxels();
        }
        return this.grid.getVoxelPositions();
    }
    mergeAdjacentVoxels() {
        // Simplified merging - could be enhanced with union-find
        // For now, just remove isolated voxels
        const positions = this.grid.getVoxelPositions();
        const neighborThreshold = 2;
        for (const pos of positions) {
            let neighbors = 0;
            // Check 6-connected neighbors
            const directions = [
                new Vector3(1, 0, 0),
                new Vector3(-1, 0, 0),
                new Vector3(0, 1, 0),
                new Vector3(0, -1, 0),
                new Vector3(0, 0, 1),
                new Vector3(0, 0, -1)
            ];
            for (const dir of directions) {
                const neighbor = pos.clone().add(dir.multiplyScalar(this.config.voxelSize));
                if (this.grid.hasVoxel(neighbor)) {
                    neighbors++;
                }
            }
            // Remove isolated voxels (optional refinement)
            if (neighbors < neighborThreshold) {
                // Could remove here, but keeping simple for now
            }
        }
    }
    /**
     * Generate box geometry from voxels
     */
    generateBoxGeometry(voxels) {
        const positions = [];
        const normals = [];
        const indices = [];
        let vertexCount = 0;
        for (const voxel of voxels) {
            const halfSize = this.config.voxelSize / 2;
            // Create box vertices
            const boxVertices = [
                // Front face
                [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
                // Back face
                [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1],
                // Top face
                [-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1],
                // Bottom face
                [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
                // Right face
                [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1],
                // Left face
                [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]
            ];
            const baseVertex = vertexCount;
            for (const vert of boxVertices) {
                positions.push(voxel.x + vert[0] * halfSize, voxel.y + vert[1] * halfSize, voxel.z + vert[2] * halfSize);
            }
            // Normals for each face
            const faceNormals = [
                [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]
            ];
            for (const normal of faceNormals) {
                for (let i = 0; i < 4; i++) {
                    normals.push(...normal);
                }
            }
            // Indices for each face (2 triangles per face)
            const faceIndices = [
                [0, 1, 2, 0, 2, 3],
                [4, 5, 6, 4, 6, 7],
                [8, 9, 10, 8, 10, 11],
                [12, 13, 14, 12, 14, 15],
                [16, 17, 18, 16, 18, 19],
                [20, 21, 22, 20, 22, 23]
            ];
            for (const face of faceIndices) {
                for (const idx of face) {
                    indices.push(baseVertex + idx);
                }
            }
            vertexCount += 24;
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
        geometry.setIndex(indices);
        return geometry;
    }
}
// ============================================================================
// Convex Decomposer (Simplified)
// ============================================================================
export class ConvexDecomposer {
    constructor(config) {
        this.config = config;
    }
    /**
     * Decompose mesh into convex hulls
     * Note: This is a simplified implementation. Production use should leverage
     * libraries like ammo.js or rapier for proper convex decomposition.
     */
    decompose(mesh) {
        const result = [];
        // For simplicity, create bounding box as single convex hull
        // In production, this would use HACD or similar algorithm
        const bbox = new Box3().setFromObject(mesh);
        const center = bbox.getCenter(new Vector3());
        const size = bbox.getSize(new Vector3());
        // Create box geometry
        const geometry = new BoxGeometry(size.x, size.y, size.z);
        result.push({
            geometry,
            bbox: new BBox(bbox.min, bbox.max),
            triangleCount: geometry.index?.count || 0,
            isConvex: true
        });
        return result;
    }
    /**
     * Generate multiple convex hulls based on clustering
     */
    decomposeMulti(mesh) {
        const result = [];
        // Simplified: split along largest axis
        const bbox = new Box3().setFromObject(mesh);
        const size = bbox.getSize(new Vector3());
        // Determine split axis
        let splitAxis = 'y';
        if (size.x > size.y && size.x > size.z)
            splitAxis = 'x';
        else if (size.z > size.y)
            splitAxis = 'z';
        const center = bbox.getCenter(new Vector3());
        const splits = Math.min(this.config.maxHulls, 4);
        for (let i = 0; i < splits; i++) {
            const t = i / splits;
            const u = (i + 1) / splits;
            const min = bbox.min.clone();
            const max = bbox.max.clone();
            // Split along chosen axis
            if (splitAxis === 'x') {
                min.x = center.x + (t - 0.5) * size.x;
                max.x = center.x + (u - 0.5) * size.x;
            }
            else if (splitAxis === 'y') {
                min.y = center.y + (t - 0.5) * size.y;
                max.y = center.y + (u - 0.5) * size.y;
            }
            else {
                min.z = center.z + (t - 0.5) * size.z;
                max.z = center.z + (u - 0.5) * size.z;
            }
            const subSize = new Vector3(max.x - min.x, max.y - min.y, max.z - min.z);
            const subGeometry = new BoxGeometry(subSize.x, subSize.y, subSize.z);
            subGeometry.translate((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
            result.push({
                geometry: subGeometry,
                bbox: new BBox(min, max),
                triangleCount: subGeometry.index?.count || 0,
                isConvex: true
            });
        }
        return result;
    }
}
export class OcclusionMesher {
    constructor(config) {
        this.config = config;
        this.voxelizer = config.voxel ? new Voxelizer(config.voxel) : null;
        this.decomposer = config.convex ? new ConvexDecomposer(config.convex) : null;
    }
    /**
     * Generate occlusion mesh from input mesh
     */
    generate(mesh) {
        if (this.config.useVoxels && this.voxelizer) {
            return this.generateVoxelized(mesh);
        }
        else if (this.decomposer) {
            return this.decomposer.decomposeMulti(mesh);
        }
        else {
            // Fallback: simple bounding box
            return [this.generateBoundingBox(mesh)];
        }
    }
    generateVoxelized(mesh) {
        if (!this.voxelizer) {
            return [this.generateBoundingBox(mesh)];
        }
        // Voxelize
        const voxels = this.voxelizer.voxelize(mesh);
        // Generate geometry
        const geometry = this.voxelizer.generateBoxGeometry(voxels);
        // Calculate bounds
        const bbox = new Box3().setFromObject(new Mesh(geometry));
        return [{
                geometry,
                bbox: new BBox(bbox.min, bbox.max),
                triangleCount: geometry.index?.count || 0,
                isConvex: false
            }];
    }
    generateBoundingBox(mesh) {
        const bbox = new Box3().setFromObject(mesh);
        const size = bbox.getSize(new Vector3());
        const center = bbox.getCenter(new Vector3());
        const geometry = new BoxGeometry(size.x, size.y, size.z);
        geometry.translate(center.x, center.y, center.z);
        return {
            geometry,
            bbox: new BBox(bbox.min, bbox.max),
            triangleCount: geometry.index?.count || 0,
            isConvex: true
        };
    }
    /**
     * Generate LOD chain for mesh
     */
    generateLODChain(mesh) {
        const result = [];
        for (let level = 0; level < this.config.lodLevels; level++) {
            const t = level / (this.config.lodLevels - 1);
            // Adjust configuration based on LOD level
            if (this.config.useVoxels && this.voxelizer) {
                // Increase voxel size for lower LODs
                const lodConfig = {
                    ...this.config.voxel,
                    voxelSize: this.config.voxel.voxelSize * (1 + t * 2)
                };
                const lodVoxelizer = new Voxelizer(lodConfig);
                const voxels = lodVoxelizer.voxelize(mesh);
                const geometry = lodVoxelizer.generateBoxGeometry(voxels);
                const bbox = new Box3().setFromObject(new Mesh(geometry));
                result.push([{
                        geometry,
                        bbox: new BBox(bbox.min, bbox.max),
                        triangleCount: geometry.index?.count || 0,
                        isConvex: false
                    }]);
            }
            else {
                result.push(this.generate(mesh));
            }
        }
        return result;
    }
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Create default voxel configuration
 */
export function createDefaultVoxelConfig() {
    return {
        voxelSize: 0.5,
        maxVoxels: 1000,
        mergeVoxels: true
    };
}
/**
 * Create default convex decomposition configuration
 */
export function createDefaultConvexConfig() {
    return {
        maxHulls: 4,
        concavity: 0.001,
        planeDownsampling: 4,
        simplificationTarget: 0.9
    };
}
/**
 * Quick occlusion mesh generation
 */
export function quickOcclude(mesh, useVoxels = true) {
    const config = {
        voxel: createDefaultVoxelConfig(),
        convex: createDefaultConvexConfig(),
        useVoxels,
        lodLevels: 1
    };
    const mesher = new OcclusionMesher(config);
    const meshes = mesher.generate(mesh);
    return meshes[0];
}
//# sourceMappingURL=OcclusionMesher.js.map