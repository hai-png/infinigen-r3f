import * as THREE from 'three';
export interface BBoxInterface {
    min: THREE.Vector3;
    max: THREE.Vector3;
    isEmpty(): boolean;
    center(): THREE.Vector3;
    size(): THREE.Vector3;
    volume(): number;
    expandByPoint(point: THREE.Vector3): BBoxInterface;
    clone(): BBoxInterface;
    union(box: BBoxInterface): BBoxInterface;
    intersects(box: BBoxInterface): boolean;
    containsPoint(point: THREE.Vector3): boolean;
    applyMatrix4(matrix: THREE.Matrix4): BBoxInterface;
    translate(offset: THREE.Vector3): BBoxInterface;
}
export declare class BBox implements BBoxInterface {
    min: THREE.Vector3;
    max: THREE.Vector3;
    constructor(min?: THREE.Vector3, max?: THREE.Vector3);
    isEmpty(): boolean;
    center(): THREE.Vector3;
    size(): THREE.Vector3;
    volume(): number;
    expandByPoint(point: THREE.Vector3): BBox;
    clone(): BBox;
    union(box: BBoxInterface): BBox;
    intersects(box: BBoxInterface): boolean;
    containsPoint(point: THREE.Vector3): boolean;
    applyMatrix4(matrix: THREE.Matrix4): BBox;
    translate(offset: THREE.Vector3): BBox;
    setFromPoints(points: THREE.Vector3[]): BBox;
    setFromObject(object: THREE.Object3D, precise?: boolean): BBox;
}
export declare function computeBBox(geometry: THREE.BufferGeometry): BBox;
export declare function computeBBoxFromObject(object: THREE.Object3D, precise?: boolean): BBox;
export declare function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry;
export declare function createBBoxFromMinMax(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): BBox;
//# sourceMappingURL=BBox.d.ts.map