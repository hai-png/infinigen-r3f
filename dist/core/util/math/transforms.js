/**
 * Transform utilities for 3D objects
 */
import * as THREE from 'three';
export function applyTransform(object, position, rotation, scale) {
    if (position)
        object.position.copy(position);
    if (rotation)
        object.rotation.copy(rotation);
    if (scale)
        object.scale.copy(scale);
}
export function createTransformMatrix(position, rotation, scale) {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);
    matrix.compose(position, quaternion, scale);
    return matrix;
}
export function decomposeTransform(matrix) {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    const rotation = new THREE.Euler().setFromQuaternion(quaternion);
    return { position, rotation, scale };
}
// Additional transform utilities
export function getWorldTransform(object) {
    return object.matrixWorld.clone();
}
export function setWorldTransform(object, matrix) {
    object.matrixWorld.copy(matrix);
    object.matrixAutoUpdate = false;
}
//# sourceMappingURL=transforms.js.map