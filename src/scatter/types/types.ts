/**
 * Scatter Base Types
 * Common interfaces and types for all scatter implementations
 */

import * as THREE from 'three';

export interface ScatterParams {
  /** Surface mesh to scatter on (optional, uses bounds if not provided) */
  surface?: THREE.Mesh;
  /** Bounding box for scattering (used if surface not provided) */
  bounds?: THREE.Box3;
}

export interface ScatterInstance {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  metadata?: Record<string, any>;
}

export interface ScatterResult {
  scatterObject: THREE.Group | THREE.InstancedMesh;
  instances: ScatterInstance[];
  bounds: THREE.Box3;
  count: number;
}
