/**
 * Boulder Factory - Procedural boulder generation
 * 
 * Creates various boulder and rock geometries with
 * different shapes, sizes, and surface characteristics.
 */

import * as THREE from 'three';

export interface BoulderConfig {
  size: number;
  roughness: number;
  flatness: number;
  detail: number;
  seed: number;
}

export class BoulderFactory {
  private config: BoulderConfig;

  constructor(config: Partial<BoulderConfig> = {}) {
    this.config = {
      size: 1,
      roughness: 0.5,
      flatness: 0.7,
      detail: 2,
      seed: 42,
      ...config,
    };
  }

  generate(config: Partial<BoulderConfig> = {}): THREE.BufferGeometry {
    const fullConfig = { ...this.config, ...config };
    // Create a deformed icosahedron as a boulder
    const geometry = new THREE.IcosahedronGeometry(fullConfig.size, fullConfig.detail);
    return geometry;
  }

  createInstancedBoulders(
    count: number,
    area: { width: number; depth: number },
    config?: Partial<BoulderConfig>
  ): THREE.InstancedMesh {
    const geometry = this.generate(config);
    const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    return mesh;
  }
}
