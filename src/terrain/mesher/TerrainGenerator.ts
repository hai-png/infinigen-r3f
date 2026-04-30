/**
 * Terrain Generator - Core terrain data structures
 * 
 * Provides height map, normal map, and terrain data types
 * used by the TerrainMesher for adaptive mesh generation.
 */

import * as THREE from 'three';

export interface HeightMap {
  data: Float32Array;
  width: number;
  height: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface NormalMap {
  data: Float32Array;
  width: number;
  height: number;
}

export interface TerrainData {
  heightMap: HeightMap;
  normalMap: NormalMap;
  materialMap?: Uint8Array;
  waterLevel?: number;
  bounds: THREE.Box3;
  width: number;
  height: number;
}

export class TerrainGenerator {
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  generate(size: number, resolution: number): TerrainData {
    const width = resolution;
    const height = resolution;
    const heightData = new Float32Array(width * height);
    const normalData = new Float32Array(width * height * 3);

    // Simple placeholder terrain generation
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const idx = z * width + x;
        const nx = x / width;
        const nz = z / height;
        heightData[idx] = Math.sin(nx * Math.PI * 4) * Math.cos(nz * Math.PI * 4) * size * 0.1;
      }
    }

    return {
      heightMap: {
        data: heightData,
        width,
        height,
        bounds: { minX: 0, maxX: size, minZ: 0, maxZ: size },
      },
      normalMap: {
        data: normalData,
        width,
        height,
      },
      bounds: new THREE.Box3(
        new THREE.Vector3(0, -size, 0),
        new THREE.Vector3(size, size, size)
      ),
      width,
      height,
    };
  }
}
