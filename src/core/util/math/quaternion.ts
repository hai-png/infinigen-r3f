/**
 * Quaternion Utilities
 * Re-exports THREE.Quaternion with additional helper functions
 */

import * as THREE from 'three';

export { Quaternion } from 'three';

/**
 * Creates a quaternion from axis-angle representation
 */
export function fromAxisAngle(axis: THREE.Vector3, angle: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

/**
 * Creates a quaternion from Euler angles
 */
export function fromEuler(x: number, y: number, z: number, order?: THREE.EulerOrder): THREE.Quaternion {
  const euler = new THREE.Euler(x, y, z, order);
  return new THREE.Quaternion().setFromEuler(euler);
}

/**
 * Creates a quaternion from two vectors (shortest arc)
 */
export function fromVectors(v1: THREE.Vector3, v2: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(v1.clone().normalize(), v2.clone().normalize());
}

/**
 * Spherical linear interpolation between two quaternions
 */
export function slerp(q1: THREE.Quaternion, q2: THREE.Quaternion, t: number): THREE.Quaternion {
  return q1.clone().slerp(q2, t);
}

/**
 * Creates an identity quaternion
 */
export function identity(): THREE.Quaternion {
  return new THREE.Quaternion();
}

/**
 * Creates a random rotation quaternion
 */
export function random(): THREE.Quaternion {
  const q = new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  ));
  return q;
}
