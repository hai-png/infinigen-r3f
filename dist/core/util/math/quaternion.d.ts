/**
 * Quaternion Utilities
 * Re-exports THREE.Quaternion with additional helper functions
 */
import * as THREE from 'three';
export { Quaternion } from 'three';
/**
 * Creates a quaternion from axis-angle representation
 */
export declare function fromAxisAngle(axis: THREE.Vector3, angle: number): THREE.Quaternion;
/**
 * Creates a quaternion from Euler angles
 */
export declare function fromEuler(x: number, y: number, z: number, order?: THREE.EulerOrder): THREE.Quaternion;
/**
 * Creates a quaternion from two vectors (shortest arc)
 */
export declare function fromVectors(v1: THREE.Vector3, v2: THREE.Vector3): THREE.Quaternion;
/**
 * Spherical linear interpolation between two quaternions
 */
export declare function slerp(q1: THREE.Quaternion, q2: THREE.Quaternion, t: number): THREE.Quaternion;
/**
 * Creates an identity quaternion
 */
export declare function identity(): THREE.Quaternion;
/**
 * Creates a random rotation quaternion
 */
export declare function random(): THREE.Quaternion;
//# sourceMappingURL=quaternion.d.ts.map