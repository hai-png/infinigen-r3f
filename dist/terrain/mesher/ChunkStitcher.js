/**
 * ChunkStitcher.ts
 *
 * Prevents cracks between adjacent terrain chunks at different LOD levels.
 * Implements edge stitching algorithms to ensure seamless transitions.
 *
 * Based on original Infinigen's chunk stitching logic adapted for Three.js/R3F.
 */
import { Vector3 } from 'three';
const DEFAULT_STITCH_CONFIG = {
    stitchThreshold: 0.01,
    maxStitchDistance: 2.0,
    enableDiagonalStitching: true,
};
/**
 * Manages stitching between adjacent terrain chunks to prevent visible cracks
 */
export class ChunkStitcher {
    constructor(config = {}) {
        this.config = { ...DEFAULT_STITCH_CONFIG, ...config };
        this.stitchCache = new Map();
    }
    /**
     * Stitch two adjacent chunk geometries together
     */
    stitchChunks(primaryGeom, neighborGeom, direction) {
        const primaryPositions = primaryGeom.getAttribute('position');
        const neighborPositions = neighborGeom.getAttribute('position');
        if (!primaryPositions || !neighborPositions) {
            return primaryGeom;
        }
        const primaryVertices = this.extractBoundaryVertices(primaryPositions, direction, true);
        const neighborVertices = this.extractBoundaryVertices(neighborPositions, this.getOppositeDirection(direction), false);
        const stitchPoints = this.findStitchPoints(primaryVertices, neighborVertices);
        if (stitchPoints.length === 0) {
            return primaryGeom;
        }
        return this.applyStitching(primaryGeom, stitchPoints, direction);
    }
    /**
     * Extract vertices along a specific boundary edge
     */
    extractBoundaryVertices(positions, direction, isPrimary) {
        const vertices = [];
        const count = positions.count;
        for (let i = 0; i < count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            // Determine if vertex is on the boundary based on direction
            if (this.isOnBoundary(x, z, direction, isPrimary)) {
                vertices.push(new Vector3(x, y, z));
            }
        }
        return vertices.sort((a, b) => this.sortBoundaryVertices(a, b, direction));
    }
    /**
     * Check if a vertex lies on the specified boundary
     */
    isOnBoundary(x, z, direction, isPrimary) {
        const threshold = this.config.stitchThreshold;
        switch (direction) {
            case 'left':
                return isPrimary ? x < threshold : x > -threshold;
            case 'right':
                return isPrimary ? x > -threshold : x < threshold;
            case 'top':
                return isPrimary ? z > -threshold : z < threshold;
            case 'bottom':
                return isPrimary ? z < threshold : z > -threshold;
            default:
                return false;
        }
    }
    /**
     * Sort boundary vertices in consistent order
     */
    sortBoundaryVertices(a, b, direction) {
        switch (direction) {
            case 'left':
            case 'right':
                return a.z - b.z;
            case 'top':
            case 'bottom':
                return a.x - b.x;
            default:
                return 0;
        }
    }
    /**
     * Find points where stitching should occur
     */
    findStitchPoints(primaryVerts, neighborVerts) {
        const stitchPoints = [];
        for (let i = 0; i < primaryVerts.length; i++) {
            const primaryVert = primaryVerts[i];
            let closestDist = Infinity;
            let closestIdx = -1;
            for (let j = 0; j < neighborVerts.length; j++) {
                const dist = primaryVert.distanceTo(neighborVerts[j]);
                if (dist < closestDist && dist <= this.config.maxStitchDistance) {
                    closestDist = dist;
                    closestIdx = j;
                }
            }
            if (closestIdx !== -1) {
                const midPoint = new Vector3()
                    .addVectors(primaryVert, neighborVerts[closestIdx])
                    .multiplyScalar(0.5);
                stitchPoints.push({
                    primary: i,
                    neighbor: closestIdx,
                    position: midPoint,
                });
            }
        }
        return stitchPoints;
    }
    /**
     * Apply stitching modifications to geometry
     */
    applyStitching(geom, stitchPoints, direction) {
        const positions = geom.getAttribute('position');
        if (!positions)
            return geom;
        // Create new geometry to avoid modifying original
        const stitchedGeom = geom.clone();
        const stitchedPositions = stitchedGeom.getAttribute('position');
        for (const stitch of stitchPoints) {
            // Update primary vertex to midpoint
            stitchedPositions.setXYZ(stitch.primary, stitch.position.x, stitch.position.y, stitch.position.z);
        }
        stitchedPositions.needsUpdate = true;
        stitchedGeom.computeVertexNormals();
        return stitchedGeom;
    }
    /**
     * Get opposite direction for neighbor matching
     */
    getOppositeDirection(direction) {
        switch (direction) {
            case 'left':
                return 'right';
            case 'right':
                return 'left';
            case 'top':
                return 'bottom';
            case 'bottom':
                return 'top';
            default:
                return direction;
        }
    }
    /**
     * Clear stitching cache
     */
    clearCache() {
        this.stitchCache.clear();
    }
    /**
     * Generate cache key for stitch pair
     */
    getCacheKey(primaryId, neighborId, direction) {
        return `${primaryId}_${neighborId}_${direction}`;
    }
}
export default ChunkStitcher;
//# sourceMappingURL=ChunkStitcher.js.map