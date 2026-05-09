import * as THREE from 'three';
import { GeometryPipeline } from './GeometryPipeline';

/**
 * Merge multiple BufferGeometries into one.
 * Delegates to the canonical GeometryPipeline.mergeGeometries().
 */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return GeometryPipeline.mergeGeometries(geometries);
}

export function computeTangents(geometry: THREE.BufferGeometry): void {
  geometry.computeTangents();
}

export function centerGeometry(object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
}

export function applyMirror(geometry: THREE.BufferGeometry, axis: 'x' | 'y' | 'z'): THREE.BufferGeometry {
  // Clone the geometry and mirror it along the specified axis
  const mirrored = geometry.clone();
  const positionAttr = mirrored.getAttribute('position');

  for (let i = 0; i < positionAttr.count; i++) {
    const x = positionAttr.getX(i);
    const y = positionAttr.getY(i);
    const z = positionAttr.getZ(i);
    if (axis === 'x') positionAttr.setXYZ(i, -x, y, z);
    else if (axis === 'y') positionAttr.setXYZ(i, x, -y, z);
    else positionAttr.setXYZ(i, x, y, -z);
  }

  positionAttr.needsUpdate = true;
  return mirrored;
}

export const MeshUtils = {
  mergeGeometries,
  computeTangents,
  centerGeometry,
  applyMirror
};
