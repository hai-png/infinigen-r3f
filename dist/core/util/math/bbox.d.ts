/**
 * Bounding Box utilities
 *
 * Ports: infinigen/core/util/math.py - BBox class
 *
 * Provides axis-aligned bounding box operations for collision detection,
 * spatial queries, and geometric computations.
 */
import { Vector3 } from './vector.js';
/**
 * Axis-Aligned Bounding Box
 */
export declare class BBox {
    min: Vector3;
    max: Vector3;
    constructor(min?: Vector3, max?: Vector3);
    /**
     * Create a bbox from two points
     */
    static fromPoints(p1: Vector3, p2: Vector3): BBox;
    /**
     * Create a bbox from center and size
     */
    static fromCenterSize(center: Vector3, size: Vector3): BBox;
    /**
     * Check if bbox is empty (invalid)
     */
    isEmpty(): boolean;
    /**
     * Get the center of the bbox
     */
    center(): Vector3;
    /**
     * Get the size of the bbox
     */
    size(): Vector3;
    /**
     * Get the volume of the bbox
     */
    volume(): number;
    /**
     * Get the longest dimension of the bbox
     */
    longestDimension(): 'x' | 'y' | 'z';
    /**
     * Check if a point is inside the bbox
     */
    containsPoint(point: Vector3): boolean;
    /**
     * Check if another bbox is fully contained within this bbox
     */
    containsBBox(other: BBox): boolean;
    /**
     * Check if this bbox intersects with another bbox
     */
    intersects(other: BBox): boolean;
    /**
     * Union with another bbox
     */
    union(other: BBox): BBox;
    /**
     * Intersection with another bbox
     */
    intersection(other: BBox): BBox;
    /**
     * Expand the bbox by a margin
     */
    expand(margin: number): BBox;
    /**
     * Get the closest point on the bbox to a given point
     */
    closestPoint(point: Vector3): Vector3;
    /**
     * Get distance from a point to the bbox
     */
    distanceToPoint(point: Vector3): number;
    /**
     * Serialize bbox to array [minX, minY, minZ, maxX, maxY, maxZ]
     */
    toArray(): number[];
    /**
     * Create bbox from array [minX, minY, minZ, maxX, maxY, maxZ]
     */
    static fromArray(arr: number[]): BBox;
    /**
     * Clone the bbox
     */
    clone(): BBox;
    /**
     * Check equality with another bbox
     */
    equals(other: BBox, epsilon?: number): boolean;
}
/**
 * Compute the union of multiple bboxes
 */
export declare function unionBBoxes(bboxes: BBox[]): BBox;
/**
 * Compute the intersection of multiple bboxes
 */
export declare function intersectBBoxes(bboxes: BBox[]): BBox;
//# sourceMappingURL=bbox.d.ts.map