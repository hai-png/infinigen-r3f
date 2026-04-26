// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.
/**
 * Axis-Aligned Bounding Box
 */
export class BBox {
    constructor(min, max) {
        if (min && max) {
            this.min = { ...min };
            this.max = { ...max };
        }
        else {
            // Empty bbox by default
            this.min = { x: Infinity, y: Infinity, z: Infinity };
            this.max = { x: -Infinity, y: -Infinity, z: -Infinity };
        }
    }
    /**
     * Create a bbox from two points
     */
    static fromPoints(p1, p2) {
        return new BBox({
            x: Math.min(p1.x, p2.x),
            y: Math.min(p1.y, p2.y),
            z: Math.min(p1.z, p2.z)
        }, {
            x: Math.max(p1.x, p2.x),
            y: Math.max(p1.y, p2.y),
            z: Math.max(p1.z, p2.z)
        });
    }
    /**
     * Create a bbox from center and size
     */
    static fromCenterSize(center, size) {
        const halfSize = {
            x: size.x / 2,
            y: size.y / 2,
            z: size.z / 2
        };
        return new BBox({
            x: center.x - halfSize.x,
            y: center.y - halfSize.y,
            z: center.z - halfSize.z
        }, {
            x: center.x + halfSize.x,
            y: center.y + halfSize.y,
            z: center.z + halfSize.z
        });
    }
    /**
     * Check if bbox is empty (invalid)
     */
    isEmpty() {
        return this.min.x > this.max.x ||
            this.min.y > this.max.y ||
            this.min.z > this.max.z;
    }
    /**
     * Get the center of the bbox
     */
    center() {
        if (this.isEmpty()) {
            return { x: 0, y: 0, z: 0 };
        }
        return {
            x: (this.min.x + this.max.x) / 2,
            y: (this.min.y + this.max.y) / 2,
            z: (this.min.z + this.max.z) / 2
        };
    }
    /**
     * Get the size of the bbox
     */
    size() {
        if (this.isEmpty()) {
            return { x: 0, y: 0, z: 0 };
        }
        return {
            x: this.max.x - this.min.x,
            y: this.max.y - this.min.y,
            z: this.max.z - this.min.z
        };
    }
    /**
     * Get the volume of the bbox
     */
    volume() {
        if (this.isEmpty()) {
            return 0;
        }
        const size = this.size();
        return size.x * size.y * size.z;
    }
    /**
     * Get the longest dimension of the bbox
     */
    longestDimension() {
        const size = this.size();
        if (size.x >= size.y && size.x >= size.z)
            return 'x';
        if (size.y >= size.x && size.y >= size.z)
            return 'y';
        return 'z';
    }
    /**
     * Check if a point is inside the bbox
     */
    containsPoint(point) {
        return point.x >= this.min.x && point.x <= this.max.x &&
            point.y >= this.min.y && point.y <= this.max.y &&
            point.z >= this.min.z && point.z <= this.max.z;
    }
    /**
     * Check if another bbox is fully contained within this bbox
     */
    containsBBox(other) {
        if (other.isEmpty())
            return true;
        if (this.isEmpty())
            return false;
        return other.min.x >= this.min.x && other.max.x <= this.max.x &&
            other.min.y >= this.min.y && other.max.y <= this.max.y &&
            other.min.z >= this.min.z && other.max.z <= this.max.z;
    }
    /**
     * Check if this bbox intersects with another bbox
     */
    intersects(other) {
        if (this.isEmpty() || other.isEmpty())
            return false;
        return this.min.x <= other.max.x && this.max.x >= other.min.x &&
            this.min.y <= other.max.y && this.max.y >= other.min.y &&
            this.min.z <= other.max.z && this.max.z >= other.min.z;
    }
    /**
     * Union with another bbox
     */
    union(other) {
        if (this.isEmpty())
            return new BBox(other.min, other.max);
        if (other.isEmpty())
            return new BBox(this.min, this.max);
        return new BBox({
            x: Math.min(this.min.x, other.min.x),
            y: Math.min(this.min.y, other.min.y),
            z: Math.min(this.min.z, other.min.z)
        }, {
            x: Math.max(this.max.x, other.max.x),
            y: Math.max(this.max.y, other.max.y),
            z: Math.max(this.max.z, other.max.z)
        });
    }
    /**
     * Intersection with another bbox
     */
    intersection(other) {
        if (this.isEmpty() || other.isEmpty()) {
            return new BBox();
        }
        const result = new BBox({
            x: Math.max(this.min.x, other.min.x),
            y: Math.max(this.min.y, other.min.y),
            z: Math.max(this.min.z, other.min.z)
        }, {
            x: Math.min(this.max.x, other.max.x),
            y: Math.min(this.max.y, other.max.y),
            z: Math.min(this.max.z, other.max.z)
        });
        if (result.isEmpty()) {
            return new BBox();
        }
        return result;
    }
    /**
     * Expand the bbox by a margin
     */
    expand(margin) {
        return new BBox({
            x: this.min.x - margin,
            y: this.min.y - margin,
            z: this.min.z - margin
        }, {
            x: this.max.x + margin,
            y: this.max.y + margin,
            z: this.max.z + margin
        });
    }
    /**
     * Get the closest point on the bbox to a given point
     */
    closestPoint(point) {
        return {
            x: Math.max(this.min.x, Math.min(point.x, this.max.x)),
            y: Math.max(this.min.y, Math.min(point.y, this.max.y)),
            z: Math.max(this.min.z, Math.min(point.z, this.max.z))
        };
    }
    /**
     * Get distance from a point to the bbox
     */
    distanceToPoint(point) {
        const closest = this.closestPoint(point);
        const dx = point.x - closest.x;
        const dy = point.y - closest.y;
        const dz = point.z - closest.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    /**
     * Serialize bbox to array [minX, minY, minZ, maxX, maxY, maxZ]
     */
    toArray() {
        return [this.min.x, this.min.y, this.min.z, this.max.x, this.max.y, this.max.z];
    }
    /**
     * Create bbox from array [minX, minY, minZ, maxX, maxY, maxZ]
     */
    static fromArray(arr) {
        return new BBox({ x: arr[0], y: arr[1], z: arr[2] }, { x: arr[3], y: arr[4], z: arr[5] });
    }
    /**
     * Clone the bbox
     */
    clone() {
        return new BBox({ ...this.min }, { ...this.max });
    }
    /**
     * Check equality with another bbox
     */
    equals(other, epsilon = 1e-6) {
        if (this.isEmpty() && other.isEmpty())
            return true;
        if (this.isEmpty() !== other.isEmpty())
            return false;
        return Math.abs(this.min.x - other.min.x) < epsilon &&
            Math.abs(this.min.y - other.min.y) < epsilon &&
            Math.abs(this.min.z - other.min.z) < epsilon &&
            Math.abs(this.max.x - other.max.x) < epsilon &&
            Math.abs(this.max.y - other.max.y) < epsilon &&
            Math.abs(this.max.z - other.max.z) < epsilon;
    }
}
/**
 * Compute the union of multiple bboxes
 */
export function unionBBoxes(bboxes) {
    if (bboxes.length === 0) {
        return new BBox();
    }
    let result = bboxes[0].clone();
    for (let i = 1; i < bboxes.length; i++) {
        result = result.union(bboxes[i]);
    }
    return result;
}
/**
 * Compute the intersection of multiple bboxes
 */
export function intersectBBoxes(bboxes) {
    if (bboxes.length === 0) {
        return new BBox();
    }
    let result = bboxes[0].clone();
    for (let i = 1; i < bboxes.length; i++) {
        result = result.intersection(bboxes[i]);
        if (result.isEmpty()) {
            return new BBox();
        }
    }
    return result;
}
//# sourceMappingURL=bbox.js.map