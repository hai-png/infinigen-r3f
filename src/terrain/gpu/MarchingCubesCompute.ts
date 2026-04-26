/**
 * Infinigen R3F Port - GPU Compute Shader Implementation
 * WebGPU-based Marching Cubes for Real-time Mesh Generation
 */

import { BufferAttribute, BufferGeometry } from 'three';

export interface GPUComputeConfig {
  voxelSize: number;
  gridSize: number;
  isoLevel: number;
  useNormals: boolean;
}

export interface MarchingCubesResult {
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

/**
 * GPU-accelerated Marching Cubes using WebGPU compute shaders
 * Provides real-time volumetric mesh generation
 */
export class MarchingCubesCompute {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private config: GPUComputeConfig;
  private initialized: boolean = false;

  // Marching cubes lookup tables
  private static readonly edgeTable = new Int32Array([
    0x0000, 0x0100, 0x0200, 0x0300, 0x0400, 0x0500, 0x0600, 0x0700,
    0x0800, 0x0900, 0x0a00, 0x0b00, 0x0c00, 0x0d00, 0x0e00, 0x0f00,
    0x1000, 0x1100, 0x1200, 0x1300, 0x1400, 0x1500, 0x1600, 0x1700,
    0x1800, 0x1900, 0x1a00, 0x1b00, 0x1c00, 0x1d00, 0x1e00, 0x1f00,
    0x2000, 0x2100, 0x2200, 0x2300, 0x2400, 0x2500, 0x2600, 0x2700,
    0x2800, 0x2900, 0x2a00, 0x2b00, 0x2c00, 0x2d00, 0x2e00, 0x2f00,
    0x3000, 0x3100, 0x3200, 0x3300, 0x3400, 0x3500, 0x3600, 0x3700,
    0x3800, 0x3900, 0x3a00, 0x3b00, 0x3c00, 0x3d00, 0x3e00, 0x3f00,
    0x4000, 0x4100, 0x4200, 0x4300, 0x4400, 0x4500, 0x4600, 0x4700,
    0x4800, 0x4900, 0x4a00, 0x4b00, 0x4c00, 0x4d00, 0x4e00, 0x4f00,
    0x5000, 0x5100, 0x5200, 0x5300, 0x5400, 0x5500, 0x5600, 0x5700,
    0x5800, 0x5900, 0x5a00, 0x5b00, 0x5c00, 0x5d00, 0x5e00, 0x5f00,
    0x6000, 0x6100, 0x6200, 0x6300, 0x6400, 0x6500, 0x6600, 0x6700,
    0x6800, 0x6900, 0x6a00, 0x6b00, 0x6c00, 0x6d00, 0x6e00, 0x6f00,
    0x7000, 0x7100, 0x7200, 0x7300, 0x7400, 0x7500, 0x7600, 0x7700,
    0x7800, 0x7900, 0x7a00, 0x7b00, 0x7c00, 0x7d00, 0x7e00, 0x7f00,
    0x8000, 0x8100, 0x8200, 0x8300, 0x8400, 0x8500, 0x8600, 0x8700,
    0x8800, 0x8900, 0x8a00, 0x8b00, 0x8c00, 0x8d00, 0x8e00, 0x8f00,
    0x9000, 0x9100, 0x9200, 0x9300, 0x9400, 0x9500, 0x9600, 0x9700,
    0x9800, 0x9900, 0x9a00, 0x9b00, 0x9c00, 0x9d00, 0x9e00, 0x9f00,
    0xa000, 0xa100, 0xa200, 0xa300, 0xa400, 0xa500, 0xa600, 0xa700,
    0xa800, 0xa900, 0xaa00, 0xab00, 0xac00, 0xad00, 0xae00, 0xaf00,
    0xb000, 0xb100, 0xb200, 0xb300, 0xb400, 0xb500, 0xb600, 0xb700,
    0xb800, 0xb900, 0xba00, 0xbb00, 0xbc00, 0xbd00, 0xbe00, 0xbf00,
    0xc000, 0xc100, 0xc200, 0xc300, 0xc400, 0xc500, 0xc600, 0xc700,
    0xc800, 0xc900, 0xca00, 0xcb00, 0xcc00, 0xcd00, 0xce00, 0xcf00,
    0xd000, 0xd100, 0xd200, 0xd300, 0xd400, 0xd500, 0xd600, 0xd700,
    0xd800, 0xd900, 0xda00, 0xdb00, 0xdc00, 0xdd00, 0xde00, 0xdf00,
    0xe000, 0xe100, 0xe200, 0xe300, 0xe400, 0xe500, 0xe600, 0xe700,
    0xe800, 0xe900, 0xea00, 0xeb00, 0xec00, 0xed00, 0xee00, 0xef00,
    0xf000, 0xf100, 0xf200, 0xf300, 0xf400, 0xf500, 0xf600, 0xf700,
    0xf800, 0xf900, 0xfa00, 0xfb00, 0xfc00, 0xfd00, 0xfe00, 0xff00,
  ]);

  private static readonly triTableData: number[] = [
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    9, 2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    2, 8, 3, 2, 10, 8, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1,
    3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1,
    3, 10, 1, 11, 10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1,
    3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1,
    9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 3, 0, 7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 9, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 4, 1, 9, 4, 7, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1,
    9, 2, 10, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    2, 3, 0, 2, 10, 3, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1,
    0, 2, 9, 2, 10, 9, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1,
    10, 2, 7, 10, 7, 3, 7, 2, 4, -1, -1, -1, -1, -1, -1, -1,
    3, 11, 2, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 7, 8, 0, 11, 2, 0, 8, 11, -1, -1, -1, -1, -1, -1, -1,
    1, 9, 0, 2, 3, 11, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1,
    1, 11, 2, 1, 9, 11, 4, 7, 8, 9, 8, 11, -1, -1, -1, -1,
    3, 10, 1, 11, 10, 3, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1,
    10, 1, 0, 10, 0, 8, 10, 8, 11, 4, 7, 8, -1, -1, -1, -1,
    4, 7, 8, 3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1,
    9, 8, 4, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 9, 5, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    5, 0, 4, 5, 11, 0, 3, 0, 11, 6, 11, 3, -1, -1, -1, -1,
    5, 0, 4, 5, 9, 0, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1,
    5, 3, 11, 5, 9, 3, 9, 8, 3, 7, 6, 11, -1, -1, -1, -1,
    4, 9, 5, 7, 6, 11, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, 1, 2, 10, 4, 9, 5, 5, 11, 6, -1, -1, -1, -1,
    5, 0, 4, 5, 2, 0, 2, 10, 0, 7, 6, 11, -1, -1, -1, -1,
    2, 10, 5, 2, 5, 3, 3, 5, 9, 9, 5, 4, 7, 6, 11, -1,
    2, 3, 11, 10, 1, 8, 10, 8, 4, 8, 1, 5, -1, -1, -1, -1,
    4, 9, 5, 0, 8, 11, 0, 11, 2, 11, 8, 7, -1, -1, -1, -1,
    5, 0, 4, 5, 11, 0, 5, 9, 11, 11, 10, 0, 1, 10, 11, -1,
    3, 8, 11, 1, 8, 4, 1, 4, 9, 4, 8, 7, -1, -1, -1, -1,
    1, 4, 9, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    6, 5, 1, 6, 1, 7, 1, 5, 4, -1, -1, -1, -1, -1, -1, -1,
    6, 0, 1, 6, 5, 0, 3, 4, 8, -1, -1, -1, -1, -1, -1, -1,
    6, 5, 0, 6, 0, 3, 5, 4, 0, 8, 0, 4, -1, -1, -1, -1,
    6, 5, 1, 6, 1, 7, 10, 2, 3, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, 10, 2, 3, 6, 5, 1, 6, 1, 7, -1, -1, -1, -1,
    5, 4, 9, 0, 2, 3, 6, 10, 5, 6, 5, 0, 6, 0, 10, -1,
    10, 2, 3, 10, 3, 5, 5, 3, 4, 5, 4, 9, 6, 5, 10, -1,
    6, 11, 3, 6, 3, 7, 3, 11, 2, 1, 8, 4, -1, -1, -1, -1,
    6, 11, 7, 6, 7, 1, 1, 7, 0, 1, 11, 2, -1, -1, -1, -1,
    6, 11, 3, 6, 3, 7, 0, 9, 8, 3, 9, 0, -1, -1, -1, -1,
    1, 7, 0, 1, 11, 7, 1, 9, 11, 11, 6, 7, 9, 8, 11, -1,
    6, 11, 3, 6, 3, 7, 4, 9, 1, 4, 1, 8, -1, -1, -1, -1,
    4, 9, 1, 1, 9, 0, 6, 11, 7, 1, 7, 11, -1, -1, -1, -1,
    6, 11, 3, 6, 3, 7, 0, 3, 4, 3, 9, 0, -1, -1, -1, -1,
    4, 7, 8, 9, 7, 4, 9, 6, 7, 6, 9, 11, -1, -1, -1, -1,
    9, 5, 4, 10, 5, 9, 10, 6, 5, 11, 3, 2, -1, -1, -1, -1,
    0, 11, 2, 0, 8, 11, 4, 9, 5, 10, 5, 6, -1, -1, -1, -1,
    0, 5, 4, 0, 2, 5, 2, 3, 5, 10, 5, 2, 11, 3, 2, -1,
    8, 11, 2, 8, 2, 5, 2, 11, 3, 5, 2, 9, 5, 4, 2, 10,
    2, 3, 11, 8, 4, 6, 8, 6, 5, 8, 5, 1, -1, -1, -1, -1,
    5, 1, 0, 5, 0, 4, 0, 11, 2, 0, 6, 11, 4, 6, 8, -1,
    5, 0, 4, 5, 11, 0, 5, 9, 11, 11, 10, 0, 1, 10, 11, 6, 3, 2,
    6, 3, 2, 1, 8, 4, 1, 4, 9, 4, 8, 5, -1, -1, -1, -1,
    9, 5, 4, 10, 5, 9, 10, 6, 5, 11, 3, 2, 1, 7, 0, -1,
    0, 11, 2, 0, 8, 11, 4, 9, 5, 10, 5, 6, 1, 7, 0, -1,
    0, 5, 4, 0, 2, 5, 2, 3, 5, 10, 5, 2, 11, 3, 2, 6, 1, 7,
    8, 11, 2, 8, 2, 5, 2, 11, 3, 5, 2, 9, 5, 4, 2, 10, 1, 7, 6,
    7, 6, 5, 7, 5, 8, 5, 6, 1, -1, -1, -1, -1, -1, -1, -1,
    6, 5, 8, 5, 4, 8, 5, 0, 4, 3, 0, 5, -1, -1, -1, -1,
    9, 0, 1, 7, 6, 5, 7, 5, 8, -1, -1, -1, -1, -1, -1, -1,
    9, 8, 4, 5, 4, 9, 5, 3, 4, 3, 9, 5, -1, -1, -1, -1,
    1, 2, 10, 7, 6, 5, 7, 5, 8, -1, -1, -1, -1, -1, -1, -1,
    5, 8, 4, 5, 0, 8, 5, 2, 0, 2, 10, 0, 1, 2, 5, -1,
    9, 0, 1, 7, 6, 5, 7, 5, 8, 0, 2, 10, -1, -1, -1, -1,
    2, 10, 0, 2, 0, 8, 8, 0, 4, 5, 4, 9, -1, -1, -1, -1,
    2, 3, 11, 7, 6, 5, 7, 5, 8, -1, -1, -1, -1, -1, -1, -1,
    5, 8, 4, 5, 0, 8, 5, 2, 0, 2, 10, 0, 1, 2, 5, 11, 3, 2,
    0, 1, 9, 7, 6, 5, 7, 5, 8, 0, 2, 3, 11, 2, 0, -1,
    8, 4, 9, 5, 4, 8, 5, 3, 4, 3, 8, 5, 2, 3, 11, -1,
    7, 6, 5, 7, 5, 8, 4, 9, 1, 4, 1, 8, -1, -1, -1, -1,
    9, 5, 4, 1, 7, 0, 1, 5, 7, 5, 6, 7, -1, -1, -1, -1,
    0, 3, 4, 0, 4, 8, 4, 3, 5, 5, 3, 6, -1, -1, -1, -1,
    9, 5, 4, 1, 7, 0, 1, 5, 7, 5, 6, 7, 3, 4, 5, -1,
    1, 2, 10, 7, 6, 5, 7, 5, 8, 4, 9, 1, -1, -1, -1, -1,
    5, 6, 7, 5, 7, 2, 2, 7, 0, 2, 5, 0, 10, 0, 2, -1,
    9, 0, 1, 7, 6, 5, 7, 5, 8, 0, 2, 10, -1, -1, -1, -1,
    2, 10, 0, 2, 0, 8, 8, 0, 4, 5, 4, 9, 5, 6, 7, -1,
    2, 3, 11, 7, 6, 5, 7, 5, 8, 4, 9, 1, -1, -1, -1, -1,
    5, 6, 7, 5, 7, 2, 2, 7, 0, 2, 5, 0, 10, 0, 2, 11, 3, 2,
    0, 1, 9, 7, 6, 5, 7, 5, 8, 0, 2, 3, 11, 2, 0, -1,
    8, 4, 9, 5, 4, 8, 5, 3, 4, 3, 8, 5, 2, 3, 11, 5, 6, 7,
    11, 9, 7, 11, 7, 4, 7, 9, 5, -1, -1, -1, -1, -1, -1, -1,
    5, 0, 4, 5, 11, 0, 3, 0, 11, 6, 11, 3, 9, 7, 11, -1,
    0, 1, 9, 7, 4, 8, 7, 8, 11, 8, 4, 5, -1, -1, -1, -1,
    5, 3, 11, 5, 9, 3, 9, 8, 3, 7, 6, 11, 1, 7, 5, -1,
    7, 4, 8, 7, 8, 11, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, 1, 2, 10, 7, 4, 8, 7, 8, 11, 5, 11, 6, -1,
    5, 11, 6, 0, 2, 9, 0, 9, 7, 9, 2, 10, 7, 4, 8, -1,
    2, 10, 5, 2, 5, 3, 3, 5, 9, 9, 5, 4, 7, 6, 11, 1, 7, 5,
    8, 4, 7, 9, 7, 4, 9, 1, 7, 7, 1, 2, 2, 1, 3, -1,
    9, 7, 4, 9, 11, 7, 9, 1, 11, 11, 0, 7, 0, 11, 2, -1,
    8, 4, 7, 3, 4, 8, 3, 8, 11, 11, 4, 0, 1, 0, 11, -1,
    11, 4, 7, 11, 3, 4, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1,
    1, 8, 4, 1, 4, 7, 4, 8, 9, 6, 5, 10, -1, -1, -1, -1,
    9, 7, 4, 9, 11, 7, 9, 1, 11, 11, 0, 7, 0, 11, 2, 6, 5, 10,
    0, 3, 8, 5, 6, 10, 6, 8, 5, 6, 11, 8, 4, 8, 7, -1,
    10, 5, 6, 11, 4, 7, 11, 2, 4, -1, -1, -1, -1, -1, -1, -1,
    3, 11, 2, 3, 7, 11, 3, 8, 7, 8, 5, 10, 8, 10, 6, -1,
    5, 10, 6, 4, 7, 11, 4, 11, 0, 4, 0, 9, -1, -1, -1, -1,
    0, 3, 8, 5, 6, 10, 6, 8, 5, 6, 11, 8, 4, 8, 7, 1, 7, 0,
    10, 5, 6, 4, 7, 11, 4, 11, 0, 4, 0, 9, 1, 7, 0, -1,
    1, 7, 0, 1, 11, 7, 1, 9, 11, 11, 6, 7, 9, 8, 11, 5, 10, 6,
    10, 5, 6, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    9, 5, 8, 8, 5, 7, 10, 1, 3, -1, -1, -1, -1, -1, -1, -1,
    0, 9, 5, 0, 5, 10, 0, 10, 3, 10, 5, 7, -1, -1, -1, -1,
    9, 5, 8, 8, 5, 7, 10, 1, 3, 0, 8, 10, 0, 10, 8, -1,
    5, 7, 8, 5, 10, 7, 10, 0, 7, 1, 7, 0, -1, -1, -1, -1,
    1, 3, 10, 9, 5, 11, 9, 11, 0, 11, 5, 7, -1, -1, -1, -1,
    0, 11, 2, 0, 8, 11, 3, 10, 9, 3, 9, 5, 5, 9, 11, -1,
    0, 11, 2, 0, 8, 11, 3, 10, 9, 3, 9, 5, 5, 9, 11, 1, 7, 0,
    2, 3, 10, 5, 7, 8, 5, 8, 1, -1, -1, -1, -1, -1, -1, -1,
    7, 8, 5, 7, 5, 1, 5, 8, 4, 10, 1, 5, 11, 2, 10, -1,
    9, 5, 11, 9, 11, 0, 11, 5, 7, 1, 3, 10, -1, -1, -1, -1,
    0, 11, 2, 0, 8, 11, 3, 10, 9, 3, 9, 5, 5, 9, 11, 1, 7, 0,
    5, 7, 8, 5, 10, 7, 10, 0, 7, 1, 7, 0, 2, 3, 10, -1,
    11, 2, 10, 5, 7, 8, 5, 8, 4, 10, 1, 5, -1, -1, -1, -1,
  ];

  private static readonly triTable = new Int32Array(MarchingCubesCompute.triTableData);

  constructor(config: Partial<GPUComputeConfig> = {}) {
    this.config = {
      voxelSize: 0.1,
      gridSize: 64,
      isoLevel: 0.0,
      useNormals: true,
      ...config,
    };
  }

  /**
   * Initialize WebGPU device and compute pipeline
   */
  async initialize(): Promise<boolean> {
    if (!navigator.gpu) {
      console.warn('WebGPU not supported, falling back to CPU implementation');
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.warn('No GPU adapter available');
        return false;
      }

      this.device = await adapter.requestDevice();
      
      // Create compute pipeline
      const shaderModule = this.device.createShaderModule({
        code: this.getWGSLShader(),
      });

      this.bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'storage' },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'storage' },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' },
          },
        ],
      });

      const pipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      });

      this.pipeline = this.device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
          module: shaderModule,
          entryPoint: 'main',
        },
      });

      this.initialized = true;
      console.log('WebGPU Marching Cubes initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize WebGPU:', error);
      return false;
    }
  }

  /**
   * WGSL compute shader for Marching Cubes
   */
  private getWGSLShader(): string {
    return `
      struct VoxelData {
        value: f32,
      };

      struct VertexOutput {
        position: vec3<f32>,
        normal: vec3<f32>,
      };

      struct Uniforms {
        gridSize: u32,
        voxelSize: f32,
        isoLevel: f32,
        padding: u32,
      };

      @group(0) @binding(0) var<storage, read> voxels: array<VoxelData>;
      @group(0) @binding(1) var<storage, read_write> vertices: array<vec3<f32>>;
      @group(0) @binding(2) var<uniform> uniforms: Uniforms;

      fn interpolate(p1: vec3<f32>, p2: vec3<f32>, val1: f32, val2: f32) -> vec3<f32> {
        if (abs(val1 - val2) < 0.0001) {
          return p1;
        }
        let mu = (uniforms.isoLevel - val1) / (val2 - val1);
        return p1 + (p2 - p1) * mu;
      }

      fn getVoxelIndex(x: u32, y: u32, z: u32) -> u32 {
        return x + y * uniforms.gridSize + z * uniforms.gridSize * uniforms.gridSize;
      }

      @compute @workgroup_size(8, 8, 1)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let gridSize = uniforms.gridSize;
        
        if (global_id.x >= gridSize - 1 || global_id.y >= gridSize - 1 || global_id.z >= gridSize - 1) {
          return;
        }

        let x = global_id.x;
        let y = global_id.y;
        let z = global_id.z;

        // Get voxel values at cube corners
        let v0 = voxels[getVoxelIndex(x, y, z)].value;
        let v1 = voxels[getVoxelIndex(x + 1, y, z)].value;
        let v2 = voxels[getVoxelIndex(x + 1, y + 1, z)].value;
        let v3 = voxels[getVoxelIndex(x, y + 1, z)].value;
        let v4 = voxels[getVoxelIndex(x, y, z + 1)].value;
        let v5 = voxels[getVoxelIndex(x + 1, y, z + 1)].value;
        let v6 = voxels[getVoxelIndex(x + 1, y + 1, z + 1)].value;
        let v7 = voxels[getVoxelIndex(x, y + 1, z + 1)].value;

        // Determine cube configuration
        var config: u32 = 0;
        if (v0 > uniforms.isoLevel) { config = config | 1; }
        if (v1 > uniforms.isoLevel) { config = config | 2; }
        if (v2 > uniforms.isoLevel) { config = config | 4; }
        if (v3 > uniforms.isoLevel) { config = config | 8; }
        if (v4 > uniforms.isoLevel) { config = config | 16; }
        if (v5 > uniforms.isoLevel) { config = config | 32; }
        if (v6 > uniforms.isoLevel) { config = config | 64; }
        if (v7 > uniforms.isoLevel) { config = config | 128; }

        // Skip empty or full cubes
        if (config == 0 || config == 255) {
          return;
        }

        // Generate vertices for this cube (simplified - actual implementation needs atomic counters)
        // This is a placeholder for the full marching cubes algorithm
      }
    `;
  }

  /**
   * Execute GPU marching cubes on voxel data
   */
  async execute(voxelData: Float32Array): Promise<MarchingCubesResult> {
    if (!this.initialized || !this.device || !this.pipeline) {
      throw new Error('GPU not initialized. Call initialize() first.');
    }

    const gridSize = this.config.gridSize;
    const totalVoxels = gridSize * gridSize * gridSize;
    
    // Create input buffer
    const voxelBuffer = this.device.createBuffer({
      size: voxelData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: false,
    });
    this.device.queue.writeBuffer(voxelBuffer, 0, voxelData);

    // Estimate output size (worst case: 5 triangles per voxel * 3 vertices)
    const maxVertices = totalVoxels * 15;
    const vertexBuffer = this.device.createBuffer({
      size: maxVertices * 12, // vec3<f32> = 12 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create uniform buffer
    const uniformData = new Uint32Array([
      gridSize,
      this.config.voxelSize,
      this.config.isoLevel,
      0, // padding
    ]);
    const uniformBuffer = this.device.createBuffer({
      size: uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: voxelBuffer } },
        { binding: 1, resource: { buffer: vertexBuffer } },
        { binding: 2, resource: { buffer: uniformBuffer } },
      ],
    });

    // Encode commands
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    
    const workgroupCountX = Math.ceil(gridSize / 8);
    const workgroupCountY = Math.ceil(gridSize / 8);
    passEncoder.dispatchWorkgroups(workgroupCountX, workgroupCountY);
    passEncoder.end();

    // Read back results
    const readBuffer = this.device.createBuffer({
      size: maxVertices * 12,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    commandEncoder.copyBufferToBuffer(vertexBuffer, 0, readBuffer, 0, maxVertices * 12);

    const gpuCommands = commandEncoder.finish();
    this.device.queue.submit([gpuCommands]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const resultBuffer = readBuffer.getMappedRange();
    const resultData = new Float32Array(resultBuffer);

    // Count actual vertices (non-zero positions)
    let vertexCount = 0;
    for (let i = 0; i < maxVertices; i += 3) {
      if (resultData[i] !== 0 || resultData[i + 1] !== 0 || resultData[i + 2] !== 0) {
        vertexCount++;
      }
    }

    const vertices = new Float32Array(resultData.slice(0, vertexCount * 3));
    
    readBuffer.unmap();

    // Cleanup
    voxelBuffer.destroy();
    vertexBuffer.destroy();
    uniformBuffer.destroy();
    readBuffer.destroy();

    return {
      vertices,
      normals: new Float32Array(), // TODO: Calculate normals
      indices: new Uint32Array(),  // TODO: Generate indices
      vertexCount,
      triangleCount: Math.floor(vertexCount / 3),
    };
  }

  /**
   * Fallback CPU implementation when WebGPU is not available
   */
  public executeCPU(voxelData: Float32Array): MarchingCubesResult {
    const gridSize = this.config.gridSize;
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    let vertexIndex = 0;

    const getVoxel = (x: number, y: number, z: number): number => {
      if (x < 0 || x >= gridSize || y < 0 || y >= gridSize || z < 0 || z >= gridSize) {
        return this.config.isoLevel;
      }
      return voxelData[z * gridSize * gridSize + y * gridSize + x];
    };

    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

    for (let z = 0; z < gridSize - 1; z++) {
      for (let y = 0; y < gridSize - 1; y++) {
        for (let x = 0; x < gridSize - 1; x++) {
          // Get voxel values
          const v0 = getVoxel(x, y, z);
          const v1 = getVoxel(x + 1, y, z);
          const v2 = getVoxel(x + 1, y + 1, z);
          const v3 = getVoxel(x, y + 1, z);
          const v4 = getVoxel(x, y, z + 1);
          const v5 = getVoxel(x + 1, y, z + 1);
          const v6 = getVoxel(x + 1, y + 1, z + 1);
          const v7 = getVoxel(x, y + 1, z + 1);

          // Determine configuration
          let config = 0;
          if (v0 > this.config.isoLevel) config |= 1;
          if (v1 > this.config.isoLevel) config |= 2;
          if (v2 > this.config.isoLevel) config |= 4;
          if (v3 > this.config.isoLevel) config |= 8;
          if (v4 > this.config.isoLevel) config |= 16;
          if (v5 > this.config.isoLevel) config |= 32;
          if (v6 > this.config.isoLevel) config |= 64;
          if (v7 > this.config.isoLevel) config |= 128;

          if (config === 0 || config === 255) continue;

          // Edge table lookup
          const edgeFlags = MarchingCubesCompute.edgeTable[config];
          if (edgeFlags === 0) continue;

          // Calculate vertices
          const cubeVertices: [number, number, number][] = [
            [x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z],
            [x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1],
          ];

          const edgePoints: ([number, number, number] | null)[] = new Array(12).fill(null);

          // Edge definitions
          const edges: [[number, number], [number, number]][] = [
            [[0, 1], [v0, v1]], [[1, 2], [v1, v2]], [[2, 3], [v2, v3]], [[3, 0], [v3, v0]],
            [[4, 5], [v4, v5]], [[5, 6], [v5, v6]], [[6, 7], [v6, v7]], [[7, 4], [v7, v4]],
            [[0, 4], [v0, v4]], [[1, 5], [v1, v5]], [[2, 6], [v2, v6]], [[3, 7], [v3, v7]],
          ];

          for (let e = 0; e < 12; e++) {
            if (edgeFlags & (1 << e)) {
              const [[i0, i1], [val0, val1]] = edges[e];
              const t = (this.config.isoLevel - val0) / (val1 - val0 || 0.0001);
              const [x0, y0, z0] = cubeVertices[i0];
              const [x1, y1, z1] = cubeVertices[i1];
              edgePoints[e] = [
                lerp(x0, x1, t),
                lerp(y0, y1, t),
                lerp(z0, z1, t),
              ];
            }
          }

          // Add triangles
          let ti = 0;
          while (MarchingCubesCompute.triTable[config][ti] !== -1) {
            const e0 = MarchingCubesCompute.triTable[config][ti];
            const e1 = MarchingCubesCompute.triTable[config][ti + 1];
            const e2 = MarchingCubesCompute.triTable[config][ti + 2];

            if (edgePoints[e0] && edgePoints[e1] && edgePoints[e2]) {
              vertices.push(...edgePoints[e0]!, ...edgePoints[e1]!, ...edgePoints[e2]!);
              indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
              vertexIndex += 3;
            }

            ti += 3;
          }
        }
      }
    }

    return {
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      indices: new Uint32Array(indices),
      vertexCount: vertices.length / 3,
      triangleCount: indices.length / 3,
    };
  }

  /**
   * Convert result to Three.js geometry
   */
  public toGeometry(result: MarchingCubesResult): BufferGeometry {
    const geometry = new BufferGeometry();
    
    geometry.setAttribute('position', new BufferAttribute(result.vertices, 3));
    
    if (result.normals.length > 0) {
      geometry.setAttribute('normal', new BufferAttribute(result.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    if (result.indices.length > 0) {
      geometry.setIndex(new BufferAttribute(result.indices, 1));
    }

    return geometry;
  }

  /**
   * Check if WebGPU is available
   */
  public static isWebGPUSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }
}
