/**
 * Infinigen R3F Port - Enhanced Mesher Systems
 * LOD (Level of Detail) Mesher with Adaptive Resolution
 *
 * Based on original: infinigen/terrain/mesher/lod_mesher.py
 * Implements adaptive mesh refinement based on camera distance and screen space error
 */
import { Vector3, BufferGeometry, Float32BufferAttribute, Box3, Sphere } from 'three';
import { SphericalMesher } from './SphericalMesher';
export class LODMesher extends SphericalMesher {
    constructor(cameraPose, bounds, config = {}) {
        super(cameraPose, bounds, config);
        this.lodConfig = {
            maxLOD: 5,
            minLOD: 0,
            screenSpaceError: 2.0, // pixels
            lodTransitionDistance: 0.2,
            borderStitching: true,
            ...config,
        };
        this.rootChunk = null;
        this.activeChunks = [];
    }
    /**
     * Generate hierarchical LOD mesh structure
     */
    generateLODMesh(kernels) {
        const { rMin, rMax } = this.config;
        const { maxLOD, minLOD } = this.lodConfig;
        // Create root chunk covering entire sphere
        this.rootChunk = this.createChunk(kernels, minLOD, new Box3(new Vector3(-rMax, -rMax, -rMax), new Vector3(rMax, rMax, rMax)), null);
        // Update visibility based on camera
        this.updateLODVisibility(this.cameraPose.position);
        return this.rootChunk;
    }
    /**
     * Create a chunk at specified LOD level
     */
    createChunk(kernels, lodLevel, bounds, parent) {
        const center = bounds.getCenter(new Vector3());
        const size = new Vector3();
        bounds.getSize(size);
        const radius = size.length() / 2;
        // Calculate resolution for this LOD level
        const resolution = this.calculateResolution(lodLevel);
        // Generate geometry for this chunk
        const geometry = this.generateChunkGeometry(kernels, bounds, resolution, lodLevel);
        const chunk = {
            geometry,
            lodLevel,
            bounds,
            boundingSphere: new Sphere(center, radius),
            children: [],
            parent,
            visible: false,
            needsUpdate: false,
        };
        // Recursively create children if not at max LOD
        if (lodLevel < this.lodConfig.maxLOD) {
            const subChunks = this.subdivideBounds(bounds);
            for (const subBounds of subChunks) {
                const child = this.createChunk(kernels, lodLevel + 1, subBounds, chunk);
                chunk.children.push(child);
            }
        }
        return chunk;
    }
    /**
     * Generate geometry for a single chunk
     */
    generateChunkGeometry(kernels, bounds, resolution, lodLevel) {
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        const { rMin, rMax } = this.config;
        const center = bounds.getCenter(new Vector3());
        const size = new Vector3();
        bounds.getSize(size);
        // Generate grid within chunk bounds
        for (let y = 0; y <= resolution; y++) {
            for (let x = 0; x <= resolution; x++) {
                // Calculate position in chunk space
                const u = x / resolution;
                const v = y / resolution;
                // Map to spherical coordinates relative to chunk
                const theta = u * Math.PI * 2;
                const phi = v * Math.PI;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);
                const sinTheta = Math.sin(theta);
                const cosTheta = Math.cos(theta);
                const direction = new Vector3(sinPhi * cosTheta, cosPhi, sinPhi * sinTheta);
                // Ray march from camera position
                const rayDir = direction.clone().applyMatrix4(this.cameraPose.rotation);
                const distance = this.rayMarchSurface(kernels, rayDir, rMin, rMax, this.config.testDownscale);
                const position = this.cameraPose.position.clone().add(rayDir.multiplyScalar(distance));
                vertices.push(position.x, position.y, position.z);
                // Calculate normal
                const normal = this.calculateNormal(kernels, position, rayDir);
                normals.push(normal.x, normal.y, normal.z);
                // UV coordinates
                uvs.push(u, v);
            }
        }
        // Generate indices
        for (let y = 0; y < resolution; y++) {
            for (let x = 0; x < resolution; x++) {
                const current = y * (resolution + 1) + x;
                const next = current + 1;
                const below = (y + 1) * (resolution + 1) + x;
                const belowNext = below + 1;
                indices.push(current, below, next);
                indices.push(next, below, belowNext);
            }
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        return geometry;
    }
    /**
     * Calculate resolution for LOD level
     */
    calculateResolution(lodLevel) {
        const { base90dResolution, maxLOD } = this.config;
        const { minLOD } = this.lodConfig;
        // Resolution decreases with higher LOD levels
        const normalizedLevel = (lodLevel - minLOD) / (maxLOD - minLOD);
        const factor = Math.pow(0.5, normalizedLevel * 2);
        return Math.max(8, Math.floor(base90dResolution * factor));
    }
    /**
     * Subdivide bounds into 4 sub-chunks
     */
    subdivideBounds(bounds) {
        const center = bounds.getCenter(new Vector3());
        const min = bounds.min;
        const max = bounds.max;
        // For spherical subdivision, we use angular subdivision
        // This is simplified - proper implementation would use spherical coordinates
        return [
            new Box3(new Vector3(min.x, min.y, min.z), new Vector3(center.x, center.y, center.z)),
            new Box3(new Vector3(center.x, min.y, min.z), new Vector3(max.x, center.y, center.z)),
            new Box3(new Vector3(min.x, center.y, min.z), new Vector3(center.x, max.y, center.z)),
            new Box3(new Vector3(center.x, center.y, min.z), new Vector3(max.x, max.y, center.z)),
        ];
    }
    /**
     * Update LOD visibility based on camera position
     */
    updateLODVisibility(cameraPosition) {
        this.activeChunks = [];
        this.traverseLODTree(this.rootChunk, cameraPosition);
        // Apply border stitching if enabled
        if (this.lodConfig.borderStitching) {
            this.applyBorderStitching();
        }
    }
    /**
     * Traverse LOD tree and determine visible chunks
     */
    traverseLODTree(chunk, cameraPosition) {
        if (!chunk)
            return;
        const distance = cameraPosition.distanceTo(chunk.boundingSphere.center);
        const radius = chunk.boundingSphere.radius;
        // Calculate screen space error
        const screenSpaceError = this.calculateScreenSpaceError(radius, distance);
        // Determine if this LOD is appropriate
        const shouldUseThisLOD = screenSpaceError <= this.lodConfig.screenSpaceError;
        const hasChildren = chunk.children.length > 0;
        if (shouldUseThisLOD || !hasChildren) {
            // Use this chunk
            chunk.visible = true;
            this.activeChunks.push(chunk);
            // Hide children
            for (const child of chunk.children) {
                child.visible = false;
            }
        }
        else {
            // Use children instead
            chunk.visible = false;
            for (const child of chunk.children) {
                this.traverseLODTree(child, cameraPosition);
            }
        }
    }
    /**
     * Calculate screen space error for a chunk
     */
    calculateScreenSpaceError(radius, distance) {
        const fov = this.cameraPose.fov * (Math.PI / 180);
        const screenHeight = this.config.renderHeight || 1080;
        // Projected size in pixels
        const projectedSize = (radius / distance) * (screenHeight / (2 * Math.tan(fov / 2)));
        return projectedSize;
    }
    /**
     * Apply border stitching between different LOD levels
     * Prevents cracks at LOD boundaries
     */
    applyBorderStitching() {
        // Group adjacent chunks by LOD level
        const chunksByLOD = new Map();
        for (const chunk of this.activeChunks) {
            if (!chunksByLOD.has(chunk.lodLevel)) {
                chunksByLOD.set(chunk.lodLevel, []);
            }
            chunksByLOD.get(chunk.lodLevel).push(chunk);
        }
        // For each pair of adjacent chunks with different LOD levels
        for (const [lodLevel, chunks] of chunksByLOD.entries()) {
            if (lodLevel >= this.lodConfig.maxLOD)
                continue;
            for (const chunk of chunks) {
                // Find neighboring chunks at higher LOD
                const neighbors = this.findHigherLODNeighbors(chunk);
                for (const neighbor of neighbors) {
                    // Stitch borders
                    this.stitchChunkBorders(chunk, neighbor);
                }
            }
        }
    }
    /**
     * Find neighboring chunks at higher LOD levels
     */
    findHigherLODNeighbors(chunk) {
        const neighbors = [];
        // Check all active chunks for adjacency
        for (const other of this.activeChunks) {
            if (other.lodLevel > chunk.lodLevel && this.areAdjacent(chunk, other)) {
                neighbors.push(other);
            }
        }
        return neighbors;
    }
    /**
     * Check if two chunks are adjacent
     */
    areAdjacent(chunk1, chunk2) {
        // Simplified adjacency check - proper implementation would use spatial hashing
        const bounds1 = chunk1.bounds;
        const bounds2 = chunk2.bounds;
        return bounds1.intersectsBox(bounds2);
    }
    /**
     * Stitch borders between chunks to prevent cracks
     */
    stitchChunkBorders(lowLODChunk, highLODChunk) {
        // Modify vertex positions along shared edges to match
        // This is a simplified implementation - full version would modify geometry buffers
        const lowGeom = lowLODChunk.geometry;
        const highGeom = highLODChunk.geometry;
        // In a full implementation, we would:
        // 1. Identify shared edge vertices
        // 2. Interpolate high-LOD vertices to match low-LOD edge
        // 3. Update geometry buffers
        // For now, mark chunks as needing update
        lowLODChunk.needsUpdate = true;
        highLODChunk.needsUpdate = true;
    }
    /**
     * Get all visible geometries for rendering
     */
    getVisibleGeometries() {
        return this.activeChunks
            .filter(chunk => chunk.visible)
            .map(chunk => chunk.geometry);
    }
    /**
     * Update chunk geometries marked as needing update
     */
    updatePendingChunks(kernels) {
        for (const chunk of this.activeChunks) {
            if (chunk.needsUpdate && chunk.parent) {
                const resolution = this.calculateResolution(chunk.lodLevel);
                chunk.geometry = this.generateChunkGeometry(kernels, chunk.bounds, resolution, chunk.lodLevel);
                chunk.needsUpdate = false;
            }
        }
    }
}
//# sourceMappingURL=LODMesher.js.map