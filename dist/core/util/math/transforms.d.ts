/**
 * Transform utilities for 3D objects
 */
import * as THREE from 'three';
export declare function applyTransform(object: THREE.Object3D, position?: THREE.Vector3, rotation?: THREE.Euler, scale?: THREE.Vector3): void;
export declare function createTransformMatrix(position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3): THREE.Matrix4;
export declare function decomposeTransform(matrix: THREE.Matrix4): {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
};
export declare function getWorldTransform(object: THREE.Object3D): THREE.Matrix4;
export declare function setWorldTransform(object: THREE.Object3D, matrix: THREE.Matrix4): void;
//# sourceMappingURL=transforms.d.ts.map