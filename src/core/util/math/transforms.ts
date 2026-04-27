/**
 * Transform utilities for 3D objects
 */

import * as THREE from 'three';

export function applyTransform(
  object: THREE.Object3D,
  position?: THREE.Vector3,
  rotation?: THREE.Euler,
  scale?: THREE.Vector3
): void {
  if (position) object.position.copy(position);
  if (rotation) object.rotation.copy(rotation);
  if (scale) object.scale.copy(scale);
}

export function createTransformMatrix(
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3
): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(rotation);
  matrix.compose(position, quaternion, scale);
  return matrix;
}

export function decomposeTransform(
  matrix: THREE.Matrix4
): { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  const rotation = new THREE.Euler().setFromQuaternion(quaternion);
  return { position, rotation, scale };
}

// Additional transform utilities
export function getWorldTransform(object: THREE.Object3D): THREE.Matrix4 {
  return object.matrixWorld.clone();
}

export function setWorldTransform(object: THREE.Object3D, matrix: THREE.Matrix4): void {
  object.matrixWorld.copy(matrix);
  object.matrixAutoUpdate = false;
}
