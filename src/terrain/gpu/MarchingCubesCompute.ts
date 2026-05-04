/**
 * Infinigen R3F Port - GPU Compute Shader Implementation
 * WebGPU-based Marching Cubes for Real-time Mesh Generation
 *
 * Two-pass GPU approach:
 *   Pass 1 (classify): Count triangles per cell using atomic counters
 *   Pass 2 (generate): Write vertex positions + normals using prefix-sum offsets
 *
 * Falls back to a robust CPU implementation when WebGPU is unavailable.
 * The CPU path is the primary/default; GPU is an optional acceleration.
 */

import * as THREE from 'three';
import { BufferAttribute, BufferGeometry } from 'three';
import { EDGE_TABLE, TRIANGLE_TABLE, EDGE_VERTICES, CORNER_OFFSETS } from '../mesher/MarchingCubesLUTs';

// ============================================================================
// Public Types
// ============================================================================

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

// ============================================================================
// Marching Cubes Compute (GPU + CPU fallback)
// ============================================================================

export class MarchingCubesCompute {
  // WebGPU handles (typed as `any` because WebGPU types are not in the
  // standard TypeScript library and may not exist at runtime)
  private device: any = null;
  private classifyPipeline: any = null;
  private generatePipeline: any = null;
  private config: GPUComputeConfig;
  private initialized: boolean = false;

  constructor(config: Partial<GPUComputeConfig> = {}) {
    this.config = {
      voxelSize: 0.1,
      gridSize: 64,
      isoLevel: 0.0,
      useNormals: true,
      ...config,
    };
  }

  // ========================================================================
  // Public API
  // ========================================================================

  /**
   * Initialize WebGPU device and compute pipelines.
   * Returns `true` if GPU is available, `false` otherwise.
   */
  async initialize(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;

      this.device = await adapter.requestDevice();

      // Classify pipeline (pass 1): counts triangles per cell
      const classifyModule = this.device.createShaderModule({
        code: this.getClassifyWGSL(),
      });

      this.classifyPipeline = this.device.createComputePipeline({
        layout: 'auto',
        compute: { module: classifyModule, entryPoint: 'classify_main' },
      });

      // Generate pipeline (pass 2): writes vertex data
      const generateModule = this.device.createShaderModule({
        code: this.getGenerateWGSL(),
      });

      this.generatePipeline = this.device.createComputePipeline({
        layout: 'auto',
        compute: { module: generateModule, entryPoint: 'generate_main' },
      });

      this.initialized = true;
      return true;
    } catch (error) {
      console.warn('WebGPU Marching Cubes initialization failed, will use CPU fallback:', error);
      this.device = null;
      this.initialized = false;
      return false;
    }
  }

  /**
   * Execute marching cubes – tries GPU first, falls back to CPU.
   */
  async execute(voxelData: Float32Array): Promise<MarchingCubesResult> {
    if (this.initialized && this.device) {
      try {
        return await this.executeGPU(voxelData);
      } catch (err) {
        console.warn('GPU marching cubes failed, falling back to CPU:', err);
      }
    }
    return this.executeCPU(voxelData);
  }

  /**
   * CPU-only execution (guaranteed to work everywhere).
   */
  public executeCPU(voxelData: Float32Array): MarchingCubesResult {
    const gs = this.config.gridSize;
    const isoLevel = this.config.isoLevel;
    const vs = this.config.voxelSize;

    const positions: number[] = [];
    const normalData: number[] = [];
    const indexData: number[] = [];
    let vertexIndex = 0;

    const getVoxel = (x: number, y: number, z: number): number => {
      if (x < 0 || x >= gs || y < 0 || y >= gs || z < 0 || z >= gs) {
        return isoLevel;
      }
      return voxelData[z * gs * gs + y * gs + x];
    };

    /** Sample the SDF at a world-space position (nearest-neighbor) */
    const sampleWorld = (wx: number, wy: number, wz: number): number => {
      const gx = Math.floor(wx / vs);
      const gy = Math.floor(wy / vs);
      const gz = Math.floor(wz / vs);
      return getVoxel(gx, gy, gz);
    };

    /** Compute SDF gradient via central differences for normal estimation */
    const computeNormal = (wx: number, wy: number, wz: number): [number, number, number] => {
      const eps = vs * 0.5;
      const dxp = sampleWorld(wx + eps, wy, wz);
      const dxm = sampleWorld(wx - eps, wy, wz);
      const dyp = sampleWorld(wx, wy + eps, wz);
      const dym = sampleWorld(wx, wy - eps, wz);
      const dzp = sampleWorld(wx, wy, wz + eps);
      const dzm = sampleWorld(wx, wy, wz - eps);
      const nx = dxp - dxm;
      const ny = dyp - dym;
      const nz = dzp - dzm;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-10) return [0, 1, 0];
      return [nx / len, ny / len, nz / len];
    };

    for (let z = 0; z < gs - 1; z++) {
      for (let y = 0; y < gs - 1; y++) {
        for (let x = 0; x < gs - 1; x++) {
          // Get 8 corner SDF values
          const cornerValues = new Float64Array(8);
          for (let i = 0; i < 8; i++) {
            cornerValues[i] = getVoxel(
              x + CORNER_OFFSETS[i][0],
              y + CORNER_OFFSETS[i][1],
              z + CORNER_OFFSETS[i][2],
            );
          }

          // Determine case index: bit i set if corner i is INSIDE (below isoLevel)
          let caseIndex = 0;
          for (let i = 0; i < 8; i++) {
            if (cornerValues[i] < isoLevel) {
              caseIndex |= (1 << i);
            }
          }

          if (caseIndex === 0 || caseIndex === 255) continue;

          // Get edge flags from lookup table
          const edgeFlags = EDGE_TABLE[caseIndex];
          if (edgeFlags === 0) continue;

          // Compute intersection points on intersected edges
          const edgeVerts = new Array<{ x: number; y: number; z: number } | null>(12).fill(null);

          for (let edge = 0; edge < 12; edge++) {
            if ((edgeFlags & (1 << edge)) === 0) continue;

            const v0idx = EDGE_VERTICES[edge * 2];
            const v1idx = EDGE_VERTICES[edge * 2 + 1];

            const d0 = cornerValues[v0idx];
            const d1 = cornerValues[v1idx];
            const diff = d0 - d1;
            const t = Math.abs(diff) > 1e-10 ? (d0 - isoLevel) / diff : 0.5;

            const p0x = (x + CORNER_OFFSETS[v0idx][0]) * vs;
            const p0y = (y + CORNER_OFFSETS[v0idx][1]) * vs;
            const p0z = (z + CORNER_OFFSETS[v0idx][2]) * vs;

            const p1x = (x + CORNER_OFFSETS[v1idx][0]) * vs;
            const p1y = (y + CORNER_OFFSETS[v1idx][1]) * vs;
            const p1z = (z + CORNER_OFFSETS[v1idx][2]) * vs;

            edgeVerts[edge] = {
              x: p0x + t * (p1x - p0x),
              y: p0y + t * (p1y - p0y),
              z: p0z + t * (p1z - p0z),
            };
          }

          // Generate triangles from the triangle table
          const base = caseIndex * 16;
          for (let i = 0; i < 16; i += 3) {
            const e0 = TRIANGLE_TABLE[base + i];
            if (e0 === -1) break;

            const e1 = TRIANGLE_TABLE[base + i + 1];
            const e2 = TRIANGLE_TABLE[base + i + 2];

            const p0 = edgeVerts[e0];
            const p1 = edgeVerts[e1];
            const p2 = edgeVerts[e2];

            if (!p0 || !p1 || !p2) continue;

            positions.push(p0.x, p0.y, p0.z);
            positions.push(p1.x, p1.y, p1.z);
            positions.push(p2.x, p2.y, p2.z);

            // Compute normals via SDF gradient
            if (this.config.useNormals) {
              const n0 = computeNormal(p0.x, p0.y, p0.z);
              const n1 = computeNormal(p1.x, p1.y, p1.z);
              const n2 = computeNormal(p2.x, p2.y, p2.z);
              normalData.push(n0[0], n0[1], n0[2]);
              normalData.push(n1[0], n1[1], n1[2]);
              normalData.push(n2[0], n2[1], n2[2]);
            }

            indexData.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
            vertexIndex += 3;
          }
        }
      }
    }

    return {
      vertices: new Float32Array(positions),
      normals: new Float32Array(normalData),
      indices: new Uint32Array(indexData),
      vertexCount: positions.length / 3,
      triangleCount: indexData.length / 3,
    };
  }

  /**
   * Convert a MarchingCubesResult to a Three.js BufferGeometry.
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
   * Check if WebGPU is available in the current environment.
   */
  public static isWebGPUSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }

  // ========================================================================
  // GPU Implementation
  // ========================================================================

  private async executeGPU(voxelData: Float32Array): Promise<MarchingCubesResult> {
    const gs = this.config.gridSize;
    const totalCells = (gs - 1) * (gs - 1) * (gs - 1);
    const dev = this.device;

    // --- Upload voxel data ---
    const voxelBuffer = dev.createBuffer({
      size: voxelData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(voxelBuffer, 0, voxelData);

    // --- Upload uniforms (16 bytes) ---
    const uniformBuf = dev.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniAB = new ArrayBuffer(16);
    const uniDV = new DataView(uniAB);
    uniDV.setUint32(0, gs, true);
    uniDV.setFloat32(4, this.config.voxelSize, true);
    uniDV.setFloat32(8, this.config.isoLevel, true);
    uniDV.setUint32(12, 0, true);
    dev.queue.writeBuffer(uniformBuf, 0, uniAB);

    // --- Upload lookup tables as i32 storage buffers ---
    // Edge table: 256 u16 values → 256 i32 values
    const edgeTableI32 = new Int32Array(256);
    for (let i = 0; i < 256; i++) edgeTableI32[i] = EDGE_TABLE[i];
    const edgeTableBuf = dev.createBuffer({
      size: 256 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(edgeTableBuf, 0, edgeTableI32);

    // Triangle table: 4096 Int8 values → 4096 i32 values
    const triTableI32 = new Int32Array(256 * 16);
    for (let i = 0; i < 256 * 16; i++) triTableI32[i] = TRIANGLE_TABLE[i];
    const triTableBuf = dev.createBuffer({
      size: 256 * 16 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(triTableBuf, 0, triTableI32);

    // ================================================================
    // Pass 1: Classify cells – count triangles per cell
    // ================================================================
    const triCountBuf = dev.createBuffer({
      size: totalCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const totalTriBuf = dev.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(totalTriBuf, 0, new Uint32Array([0]));

    const classifyBG = dev.createBindGroup({
      layout: this.classifyPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: voxelBuffer } },
        { binding: 1, resource: { buffer: triCountBuf } },
        { binding: 2, resource: { buffer: uniformBuf } },
        { binding: 3, resource: { buffer: totalTriBuf } },
        { binding: 4, resource: { buffer: edgeTableBuf } },
      ],
    });

    const wgSize = 4;
    const dx = Math.ceil((gs - 1) / wgSize);
    const dy = Math.ceil((gs - 1) / wgSize);
    const dz = Math.ceil((gs - 1) / wgSize);

    const enc1 = dev.createCommandEncoder();
    const p1 = enc1.beginComputePass();
    p1.setPipeline(this.classifyPipeline);
    p1.setBindGroup(0, classifyBG);
    p1.dispatchWorkgroups(dx, dy, dz);
    p1.end();

    // Read back total triangle count
    const totalTriRead = dev.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    enc1.copyBufferToBuffer(totalTriBuf, 0, totalTriRead, 0, 4);
    dev.queue.submit([enc1.finish()]);

    await totalTriRead.mapAsync(GPUMapMode.READ);
    const totalTri = new Uint32Array(totalTriRead.getMappedRange())[0];
    totalTriRead.unmap();
    totalTriRead.destroy();

    if (totalTri === 0) {
      this.destroyBuffers(voxelBuffer, uniformBuf, edgeTableBuf, triTableBuf, triCountBuf, totalTriBuf);
      return { vertices: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), vertexCount: 0, triangleCount: 0 };
    }

    // ================================================================
    // CPU prefix-sum of per-cell triangle counts → vertex offsets
    // ================================================================
    const triCountRead = dev.createBuffer({
      size: totalCells * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encPfx = dev.createCommandEncoder();
    encPfx.copyBufferToBuffer(triCountBuf, 0, triCountRead, 0, totalCells * 4);
    dev.queue.submit([encPfx.finish()]);

    await triCountRead.mapAsync(GPUMapMode.READ);
    const triCounts = new Uint32Array(triCountRead.getMappedRange()).slice();
    triCountRead.unmap();
    triCountRead.destroy();

    const vertexOffsets = new Uint32Array(totalCells);
    let running = 0;
    for (let i = 0; i < totalCells; i++) {
      vertexOffsets[i] = running * 3;
      running += triCounts[i];
    }

    const offsetBuf = dev.createBuffer({
      size: totalCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(offsetBuf, 0, vertexOffsets);

    // ================================================================
    // Pass 2: Generate vertices + normals
    // ================================================================
    const maxVerts = Math.min(totalTri, (gs - 1) ** 3 * 5) * 3;
    const vertBuf = dev.createBuffer({
      size: maxVerts * 3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const normBuf = dev.createBuffer({
      size: maxVerts * 3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const generateBG = dev.createBindGroup({
      layout: this.generatePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: voxelBuffer } },
        { binding: 1, resource: { buffer: offsetBuf } },
        { binding: 2, resource: { buffer: uniformBuf } },
        { binding: 3, resource: { buffer: triTableBuf } },
        { binding: 4, resource: { buffer: vertBuf } },
        { binding: 5, resource: { buffer: normBuf } },
      ],
    });

    const enc2 = dev.createCommandEncoder();
    const p2 = enc2.beginComputePass();
    p2.setPipeline(this.generatePipeline);
    p2.setBindGroup(0, generateBG);
    p2.dispatchWorkgroups(dx, dy, dz);
    p2.end();

    const vertRead = dev.createBuffer({
      size: maxVerts * 3 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const normRead = dev.createBuffer({
      size: maxVerts * 3 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    enc2.copyBufferToBuffer(vertBuf, 0, vertRead, 0, maxVerts * 3 * 4);
    enc2.copyBufferToBuffer(normBuf, 0, normRead, 0, maxVerts * 3 * 4);
    dev.queue.submit([enc2.finish()]);

    await vertRead.mapAsync(GPUMapMode.READ);
    const gpuVerts = new Float32Array(vertRead.getMappedRange()).slice(0, maxVerts * 3);
    vertRead.unmap();
    vertRead.destroy();

    await normRead.mapAsync(GPUMapMode.READ);
    const gpuNorms = new Float32Array(normRead.getMappedRange()).slice(0, maxVerts * 3);
    normRead.unmap();
    normRead.destroy();

    // Generate sequential indices
    const idxData = new Uint32Array(maxVerts);
    for (let i = 0; i < maxVerts; i++) idxData[i] = i;

    // Cleanup
    this.destroyBuffers(voxelBuffer, uniformBuf, edgeTableBuf, triTableBuf, triCountBuf, totalTriBuf, offsetBuf, vertBuf, normBuf);

    return {
      vertices: gpuVerts,
      normals: gpuNorms,
      indices: idxData,
      vertexCount: maxVerts,
      triangleCount: maxVerts / 3,
    };
  }

  private destroyBuffers(...buffers: any[]): void {
    for (const b of buffers) {
      try { if (b && typeof b.destroy === 'function') b.destroy(); } catch (err) { if (process.env.NODE_ENV === 'development') console.debug('[MarchingCubesCompute] buffer destroy fallback:', err); }
    }
  }

  // ========================================================================
  // WGSL Compute Shaders
  // ========================================================================

  /**
   * Pass 1: For each cell, determine the marching cubes case and count
   * the number of triangles. Writes per-cell counts and atomically
   * accumulates the total.
   */
  private getClassifyWGSL(): string {
    return `
      struct Uniforms {
        gridSize: u32,
        voxelSize: f32,
        isoLevel: f32,
        padding: u32,
      };

      @group(0) @binding(0) var<storage, read> voxels: array<f32>;
      @group(0) @binding(1) var<storage, read_write> triCounts: array<atomic<u32>>;
      @group(0) @binding(2) var<uniform> uniforms: Uniforms;
      @group(0) @binding(3) var<storage, read_write> totalTriangles: atomic<u32>;
      @group(0) @binding(4) var<storage, read> edgeTable: array<i32>;

      fn getVoxel(x: u32, y: u32, z: u32) -> f32 {
        if (x >= uniforms.gridSize || y >= uniforms.gridSize || z >= uniforms.gridSize) {
          return uniforms.isoLevel;
        }
        return voxels[z * uniforms.gridSize * uniforms.gridSize + y * uniforms.gridSize + x];
      }

      fn countTrianglesForCase(caseIdx: u32) -> u32 {
        if (caseIdx == 0u || caseIdx == 255u) { return 0u; }
        // Count triangles by scanning the triangle table.
        // The tri table is stored in edgeTable buffer starting at offset 256.
        var count: u32 = 0u;
        for (var i = 0u; i < 16u; i += 3u) {
          let entry = edgeTable[256u + caseIdx * 16u + i];
          if (entry == -1) { break; }
          count = count + 1u;
        }
        return count;
      }

      @compute @workgroup_size(4, 4, 4)
      fn classify_main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let gs = uniforms.gridSize;
        if (gid.x >= gs - 1u || gid.y >= gs - 1u || gid.z >= gs - 1u) { return; }

        let x = gid.x; let y = gid.y; let z = gid.z;

        let v0 = getVoxel(x,     y,     z);
        let v1 = getVoxel(x+1u,  y,     z);
        let v2 = getVoxel(x+1u,  y+1u,  z);
        let v3 = getVoxel(x,     y+1u,  z);
        let v4 = getVoxel(x,     y,     z+1u);
        let v5 = getVoxel(x+1u,  y,     z+1u);
        let v6 = getVoxel(x+1u,  y+1u,  z+1u);
        let v7 = getVoxel(x,     y+1u,  z+1u);

        var caseIdx: u32 = 0u;
        if (v0 < uniforms.isoLevel) { caseIdx = caseIdx | 1u; }
        if (v1 < uniforms.isoLevel) { caseIdx = caseIdx | 2u; }
        if (v2 < uniforms.isoLevel) { caseIdx = caseIdx | 4u; }
        if (v3 < uniforms.isoLevel) { caseIdx = caseIdx | 8u; }
        if (v4 < uniforms.isoLevel) { caseIdx = caseIdx | 16u; }
        if (v5 < uniforms.isoLevel) { caseIdx = caseIdx | 32u; }
        if (v6 < uniforms.isoLevel) { caseIdx = caseIdx | 64u; }
        if (v7 < uniforms.isoLevel) { caseIdx = caseIdx | 128u; }

        let cellIdx = z * (gs - 1u) * (gs - 1u) + y * (gs - 1u) + x;
        let triCount = countTrianglesForCase(caseIdx);

        atomicStore(&triCounts[cellIdx], triCount);
        atomicAdd(&totalTriangles, triCount);
      }
    `;
  }

  /**
   * Pass 2: For each cell, generate vertex positions and normals for
   * all triangles. Uses the prefix-sum offsets (binding 1) to determine
   * where in the output buffer to write.
   */
  private getGenerateWGSL(): string {
    return `
      struct Uniforms {
        gridSize: u32,
        voxelSize: f32,
        isoLevel: f32,
        padding: u32,
      };

      @group(0) @binding(0) var<storage, read> voxels: array<f32>;
      @group(0) @binding(1) var<storage, read> vertexOffsets: array<u32>;
      @group(0) @binding(2) var<uniform> uniforms: Uniforms;
      @group(0) @binding(3) var<storage, read> triTable: array<i32>;
      @group(0) @binding(4) var<storage, read_write> outPositions: array<f32>;
      @group(0) @binding(5) var<storage, read_write> outNormals: array<f32>;

      fn getVoxel(x: u32, y: u32, z: u32) -> f32 {
        if (x >= uniforms.gridSize || y >= uniforms.gridSize || z >= uniforms.gridSize) {
          return uniforms.isoLevel;
        }
        return voxels[z * uniforms.gridSize * uniforms.gridSize + y * uniforms.gridSize + x];
      }

      fn getVoxelWorld(gx: f32, gy: f32, gz: f32) -> f32 {
        let ix = i32(gx / uniforms.voxelSize);
        let iy = i32(gy / uniforms.voxelSize);
        let iz = i32(gz / uniforms.voxelSize);
        let gs = i32(uniforms.gridSize);
        if (ix < 0 || iy < 0 || iz < 0 || ix >= gs || iy >= gs || iz >= gs) {
          return uniforms.isoLevel;
        }
        return voxels[u32(iz) * uniforms.gridSize * uniforms.gridSize + u32(iy) * uniforms.gridSize + u32(ix)];
      }

      fn vertexInterp(p1: vec3<f32>, p2: vec3<f32>, v1: f32, v2: f32) -> vec3<f32> {
        if (abs(v1 - v2) < 0.00001) { return p1; }
        let t = (uniforms.isoLevel - v1) / (v2 - v1);
        return p1 + (p2 - p1) * t;
      }

      fn computeNormal(px: f32, py: f32, pz: f32) -> vec3<f32> {
        let eps = uniforms.voxelSize * 0.5;
        let dxp = getVoxelWorld(px + eps, py, pz);
        let dxm = getVoxelWorld(px - eps, py, pz);
        let dyp = getVoxelWorld(px, py + eps, pz);
        let dym = getVoxelWorld(px, py - eps, pz);
        let dzp = getVoxelWorld(px, py, pz + eps);
        let dzm = getVoxelWorld(px, py, pz - eps);
        let n = vec3<f32>(dxp - dxm, dyp - dym, dzp - dzm);
        let len = length(n);
        if (len < 0.00001) { return vec3<f32>(0.0, 1.0, 0.0); }
        return n / len;
      }

      @compute @workgroup_size(4, 4, 4)
      fn generate_main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let gs = uniforms.gridSize;
        if (gid.x >= gs - 1u || gid.y >= gs - 1u || gid.z >= gs - 1u) { return; }

        let x = gid.x; let y = gid.y; let z = gid.z;
        let vs = uniforms.voxelSize;

        // 8 corner positions (world space)
        let p0 = vec3<f32>(f32(x)   * vs, f32(y)   * vs, f32(z)   * vs);
        let p1 = vec3<f32>(f32(x+1u) * vs, f32(y)   * vs, f32(z)   * vs);
        let p2 = vec3<f32>(f32(x+1u) * vs, f32(y+1u) * vs, f32(z)   * vs);
        let p3 = vec3<f32>(f32(x)   * vs, f32(y+1u) * vs, f32(z)   * vs);
        let p4 = vec3<f32>(f32(x)   * vs, f32(y)   * vs, f32(z+1u) * vs);
        let p5 = vec3<f32>(f32(x+1u) * vs, f32(y)   * vs, f32(z+1u) * vs);
        let p6 = vec3<f32>(f32(x+1u) * vs, f32(y+1u) * vs, f32(z+1u) * vs);
        let p7 = vec3<f32>(f32(x)   * vs, f32(y+1u) * vs, f32(z+1u) * vs);

        let v0 = getVoxel(x,     y,     z);
        let v1 = getVoxel(x+1u,  y,     z);
        let v2 = getVoxel(x+1u,  y+1u,  z);
        let v3 = getVoxel(x,     y+1u,  z);
        let v4 = getVoxel(x,     y,     z+1u);
        let v5 = getVoxel(x+1u,  y,     z+1u);
        let v6 = getVoxel(x+1u,  y+1u,  z+1u);
        let v7 = getVoxel(x,     y+1u,  z+1u);

        var caseIdx: u32 = 0u;
        if (v0 < uniforms.isoLevel) { caseIdx = caseIdx | 1u; }
        if (v1 < uniforms.isoLevel) { caseIdx = caseIdx | 2u; }
        if (v2 < uniforms.isoLevel) { caseIdx = caseIdx | 4u; }
        if (v3 < uniforms.isoLevel) { caseIdx = caseIdx | 8u; }
        if (v4 < uniforms.isoLevel) { caseIdx = caseIdx | 16u; }
        if (v5 < uniforms.isoLevel) { caseIdx = caseIdx | 32u; }
        if (v6 < uniforms.isoLevel) { caseIdx = caseIdx | 64u; }
        if (v7 < uniforms.isoLevel) { caseIdx = caseIdx | 128u; }

        if (caseIdx == 0u || caseIdx == 255u) { return; }

        // Edge intersection points
        var edgeVerts: array<vec3<f32>, 12>;
        edgeVerts[0]  = vertexInterp(p0, p1, v0, v1);
        edgeVerts[1]  = vertexInterp(p1, p2, v1, v2);
        edgeVerts[2]  = vertexInterp(p2, p3, v2, v3);
        edgeVerts[3]  = vertexInterp(p3, p0, v3, v0);
        edgeVerts[4]  = vertexInterp(p4, p5, v4, v5);
        edgeVerts[5]  = vertexInterp(p5, p6, v5, v6);
        edgeVerts[6]  = vertexInterp(p6, p7, v6, v7);
        edgeVerts[7]  = vertexInterp(p7, p4, v7, v4);
        edgeVerts[8]  = vertexInterp(p0, p4, v0, v4);
        edgeVerts[9]  = vertexInterp(p1, p5, v1, v5);
        edgeVerts[10] = vertexInterp(p2, p6, v2, v6);
        edgeVerts[11] = vertexInterp(p3, p7, v3, v7);

        // Get vertex offset for this cell
        let cellIdx = z * (gs - 1u) * (gs - 1u) + y * (gs - 1u) + x;
        var vertIdx = vertexOffsets[cellIdx];

        // Generate triangles
        for (var triIdx = 0u; triIdx < 5u; triIdx++) {
          let base = caseIdx * 16u + triIdx * 3u;
          let e0 = triTable[base];
          if (e0 < 0) { break; }
          let e1 = triTable[base + 1u];
          let e2 = triTable[base + 2u];

          let v0p = edgeVerts[u32(e0)];
          let v1p = edgeVerts[u32(e1)];
          let v2p = edgeVerts[u32(e2)];

          // Write positions
          let o = vertIdx * 3u;
          outPositions[o]      = v0p.x;
          outPositions[o + 1u] = v0p.y;
          outPositions[o + 2u] = v0p.z;
          outPositions[o + 3u] = v1p.x;
          outPositions[o + 4u] = v1p.y;
          outPositions[o + 5u] = v1p.z;
          outPositions[o + 6u] = v2p.x;
          outPositions[o + 7u] = v2p.y;
          outPositions[o + 8u] = v2p.z;

          // Write normals via SDF gradient
          let n0 = computeNormal(v0p.x, v0p.y, v0p.z);
          let n1 = computeNormal(v1p.x, v1p.y, v1p.z);
          let n2 = computeNormal(v2p.x, v2p.y, v2p.z);

          outNormals[o]      = n0.x;
          outNormals[o + 1u] = n0.y;
          outNormals[o + 2u] = n0.z;
          outNormals[o + 3u] = n1.x;
          outNormals[o + 4u] = n1.y;
          outNormals[o + 5u] = n1.z;
          outNormals[o + 6u] = n2.x;
          outNormals[o + 7u] = n2.y;
          outNormals[o + 8u] = n2.z;

          vertIdx += 3u;
        }
      }
    `;
  }
}
