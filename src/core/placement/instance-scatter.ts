/**
 * Instance Scatter - Object scattering with instanced rendering
 * 
 * Provides utilities for scattering objects across surfaces
 * with instanced rendering for performance.
 */

import * as THREE from 'three';

export interface ScatterConfig {
  density: number;
  area: number;
  seed: number;
  minScale: number;
  maxScale: number;
  normalAlignment: boolean;
  upVector: THREE.Vector3;
  castShadows: boolean;
  receiveShadows: boolean;
}

export class InstanceScatter {
  private config: ScatterConfig;

  constructor(config: Partial<ScatterConfig> = {}) {
    this.config = {
      density: 1,
      area: 100,
      seed: 42,
      minScale: 0.8,
      maxScale: 1.2,
      normalAlignment: true,
      upVector: new THREE.Vector3(0, 1, 0),
      castShadows: true,
      receiveShadows: true,
      ...config,
    };
  }

  scatter(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    surface: THREE.BufferGeometry
  ): THREE.InstancedMesh {
    const count = Math.floor(this.config.density * this.config.area);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = this.config.castShadows;
    mesh.receiveShadow = this.config.receiveShadows;
    return mesh;
  }
}
