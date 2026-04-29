import * as THREE from 'three';
export class BBox {
    constructor(min, max) {
        this.min = min ? min.clone() : new THREE.Vector3(Infinity, Infinity, Infinity);
        this.max = max ? max.clone() : new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    }
    isEmpty() {
        return this.min.x > this.max.x || this.min.y > this.max.y || this.min.z > this.max.z;
    }
    center() {
        if (this.isEmpty()) {
            return new THREE.Vector3(0, 0, 0);
        }
        return this.min.clone().add(this.max).multiplyScalar(0.5);
    }
    size() {
        if (this.isEmpty()) {
            return new THREE.Vector3(0, 0, 0);
        }
        return this.max.clone().sub(this.min);
    }
    volume() {
        if (this.isEmpty()) {
            return 0;
        }
        const size = this.size();
        return size.x * size.y * size.z;
    }
    expandByPoint(point) {
        this.min.min(point);
        this.max.max(point);
        return this;
    }
    clone() {
        return new BBox(this.min.clone(), this.max.clone());
    }
    union(box) {
        this.min.min(box.min);
        this.max.max(box.max);
        return this;
    }
    intersects(box) {
        if (this.isEmpty() || box.isEmpty()) {
            return false;
        }
        return (this.min.x <= box.max.x && this.max.x >= box.min.x &&
            this.min.y <= box.max.y && this.max.y >= box.min.y &&
            this.min.z <= box.max.z && this.max.z >= box.min.z);
    }
    containsPoint(point) {
        if (this.isEmpty()) {
            return false;
        }
        return (point.x >= this.min.x && point.x <= this.max.x &&
            point.y >= this.min.y && point.y <= this.max.y &&
            point.z >= this.min.z && point.z <= this.max.z);
    }
    applyMatrix4(matrix) {
        const points = [
            new THREE.Vector3(this.min.x, this.min.y, this.min.z),
            new THREE.Vector3(this.max.x, this.min.y, this.min.z),
            new THREE.Vector3(this.min.x, this.max.y, this.min.z),
            new THREE.Vector3(this.max.x, this.max.y, this.min.z),
            new THREE.Vector3(this.min.x, this.min.y, this.max.z),
            new THREE.Vector3(this.max.x, this.min.y, this.max.z),
            new THREE.Vector3(this.min.x, this.max.y, this.max.z),
            new THREE.Vector3(this.max.x, this.max.y, this.max.z)
        ];
        this.min.set(Infinity, Infinity, Infinity);
        this.max.set(-Infinity, -Infinity, -Infinity);
        for (const point of points) {
            point.applyMatrix4(matrix);
            this.expandByPoint(point);
        }
        return this;
    }
    translate(offset) {
        this.min.add(offset);
        this.max.add(offset);
        return this;
    }
    setFromPoints(points) {
        this.min.set(Infinity, Infinity, Infinity);
        this.max.set(-Infinity, -Infinity, -Infinity);
        for (const point of points) {
            this.expandByPoint(point);
        }
        return this;
    }
    setFromObject(object, precise = false) {
        object.updateWorldMatrix(true, false);
        if (object instanceof THREE.Mesh && precise) {
            const geometry = object.geometry;
            if (geometry) {
                const position = geometry.getAttribute('position');
                for (let i = 0; i < position.count; i++) {
                    const vertex = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
                    vertex.applyMatrix4(object.matrixWorld);
                    this.expandByPoint(vertex);
                }
            }
        }
        else {
            const box = new THREE.Box3().setFromObject(object);
            this.min.copy(box.min);
            this.max.copy(box.max);
        }
        return this;
    }
}
export function computeBBox(geometry) {
    const bbox = new BBox();
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
        const vertex = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
        bbox.expandByPoint(vertex);
    }
    return bbox;
}
export function computeBBoxFromObject(object, precise = false) {
    const bbox = new BBox();
    return bbox.setFromObject(object, precise);
}
export function mergeGeometries(geometries) {
    if (geometries.length === 0)
        return new THREE.BufferGeometry();
    if (geometries.length === 1)
        return geometries[0].clone();
    const mergedGeometry = new THREE.BufferGeometry();
    const attributes = {};
    for (const geom of geometries) {
        for (const attributeName in geom.attributes) {
            if (!attributes[attributeName]) {
                attributes[attributeName] = [];
            }
            attributes[attributeName].push(geom.attributes[attributeName]);
        }
    }
    for (const attributeName in attributes) {
        const allValues = [];
        for (const attr of attributes[attributeName]) {
            const array = attr.array;
            for (let i = 0; i < attr.count; i++) {
                for (let c = 0; c < attr.itemSize; c++) {
                    allValues.push(array[i * attr.itemSize + c]);
                }
            }
        }
        mergedGeometry.setAttribute(attributeName, new THREE.Float32BufferAttribute(allValues, attributes[attributeName][0].itemSize));
    }
    return mergedGeometry;
}
export function createBBoxFromMinMax(minX, minY, minZ, maxX, maxY, maxZ) {
    return new BBox(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
}
//# sourceMappingURL=BBox.js.map