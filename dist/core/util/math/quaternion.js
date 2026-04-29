/**
 * Quaternion Utilities
 * Re-exports THREE.Quaternion with additional helper functions
 */
import * as THREE from 'three';
export { Quaternion } from 'three';
/**
 * Creates a quaternion from axis-angle representation
 */
export function fromAxisAngle(axis, angle) {
    return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}
/**
 * Creates a quaternion from Euler angles
 */
export function fromEuler(x, y, z, order) {
    const euler = new THREE.Euler(x, y, z, order);
    return new THREE.Quaternion().setFromEuler(euler);
}
/**
 * Creates a quaternion from two vectors (shortest arc)
 */
export function fromVectors(v1, v2) {
    return new THREE.Quaternion().setFromUnitVectors(v1.clone().normalize(), v2.clone().normalize());
}
/**
 * Spherical linear interpolation between two quaternions
 */
export function slerp(q1, q2, t) {
    return q1.clone().slerp(q2, t);
}
/**
 * Creates an identity quaternion
 */
export function identity() {
    return new THREE.Quaternion();
}
/**
 * Creates a random rotation quaternion
 */
export function random() {
    const q = new THREE.Quaternion();
    q.setFromEuler(new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2));
    return q;
}
//# sourceMappingURL=quaternion.js.map