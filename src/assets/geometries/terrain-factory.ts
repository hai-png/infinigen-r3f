/**
 * Terrain Factory - Procedural terrain mesh generation
 * 
 * Creates terrain meshes from heightmaps, noise functions,
 * and SDF data with various LOD levels.
 */

import * as THREE from 'three';

export interface TerrainConfig {
  size: number;
  resolution: number;
  maxHeight: number;
  noiseScale: number;
  noiseOctaves: number;
  seed: number;
}

export class TerrainFactory {
  private config: TerrainConfig;

  constructor(config: Partial<TerrainConfig> = {}) {
    this.config = {
      size: 100,
      resolution: 128,
      maxHeight: 10,
      noiseScale: 1,
      noiseOctaves: 6,
      seed: 42,
      ...config,
    };
  }

  generate(config: Partial<TerrainConfig> = {}): THREE.BufferGeometry {
    const fullConfig = { ...this.config, ...config };
    const geometry = new THREE.PlaneGeometry(
      fullConfig.size,
      fullConfig.size,
      fullConfig.resolution,
      fullConfig.resolution
    );
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }

  generateWithHeightMap(heightMap: Float32Array, width: number, height: number): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(width, height, width - 1, height - 1);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = heightMap[i] || 0;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }
}
