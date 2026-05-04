/**
 * TerrainSurfaceShaderPipeline.ts
 *
 * GPU compute pipeline for SDF-based surface displacement on terrain meshes.
 *
 * Takes a terrain mesh produced by Marching Cubes and refines it by:
 *   1. Projecting vertices onto the true SDF isosurface (Newton step)
 *   2. Optionally adding noise-based displacement for surface detail
 *   3. Recomputing normals from the SDF gradient at displaced positions
 *
 * When WebGPU is available the displacement runs as a WGSL compute shader;
 * otherwise the identical algorithm runs on the CPU as a synchronous fallback.
 *
 * The pipeline is **optional** — terrain generation works without it. Call
 * `computeDisplacement()` after building the initial mesh and it will either
 * return the refined geometry or, if the pipeline is disabled / GPU init
 * failed, return the original geometry unchanged.
 */

import * as THREE from 'three';
import { BufferAttribute, BufferGeometry } from 'three';
import {
  SDF_SURFACE_DISPLACEMENT_WGSL,
  SDFDisplacementUniforms,
  DEFAULT_SDF_DISPLACEMENT_UNIFORMS,
} from './GPUSurfaceShaders';
import type { SignedDistanceField } from '../sdf/sdf-operations';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Configuration for the terrain surface shader pipeline.
 */
export interface TerrainSurfaceConfig {
  /** Whether the surface shader pipeline is enabled */
  enabled: boolean;
  /** Scale for projecting vertices onto the isosurface (1.0 = full projection) */
  displacementScale: number;
  /** Epsilon for finite-difference gradient computation (in world units) */
  gradientEpsilon: number;
  /** Amplitude for noise-based surface detail (0 = no noise displacement) */
  noiseAmplitude: number;
  /** Frequency for noise-based surface detail */
  noiseFrequency: number;
  /** Material type for multi-material displacement (0=default, 1=rocky, 2=sandy, 3=snowy, 4=clay) */
  materialType: number;
  /** Iso level for surface extraction (usually 0) */
  isoLevel: number;
  /** Number of Newton projection iterations (1 is usually enough) */
  projectionIterations: number;
}

/**
 * Default configuration for the terrain surface shader pipeline.
 */
export const DEFAULT_TERRAIN_SURFACE_CONFIG: TerrainSurfaceConfig = {
  enabled: true,
  displacementScale: 1.0,
  gradientEpsilon: 0.5,
  noiseAmplitude: 0.0,
  noiseFrequency: 1.0,
  materialType: 0,
  isoLevel: 0.0,
  projectionIterations: 1,
};

// ============================================================================
// Uniforms buffer layout (must match the WGSL struct exactly)
// ============================================================================

/**
 * Size of the uniform struct in bytes.
 * Layout: 4 u32 (16 bytes) + 3 f32 (12 bytes) + 3 f32 (12 bytes) + 4 f32 (16 bytes) + 3 f32 (12 bytes) + 1 u32 (4 bytes) + 1 f32 (4 bytes)
 * Total: 16 + 12 + 12 + 16 + 12 + 4 + 4 = 76 → padded to 80 for alignment
 * Actually let's calculate exactly:
 *   vertexCount: u32  (4)
 *   gridSizeX: u32    (4)
 *   gridSizeY: u32    (4)
 *   gridSizeZ: u32    (4)
 *   boundsMinX: f32   (4)
 *   boundsMinY: f32   (4)
 *   boundsMinZ: f32   (4)
 *   voxelSizeX: f32   (4)
 *   voxelSizeY: f32   (4)
 *   voxelSizeZ: f32   (4)
 *   displacementScale: f32 (4)
 *   gradientEpsilon: f32   (4)
 *   noiseAmplitude: f32    (4)
 *   noiseFrequency: f32    (4)
 *   materialType: u32      (4)
 *   isoLevel: f32          (4)
 * Total = 16 * 4 = 64 bytes
 */
const UNIFORM_BUFFER_SIZE = 64;

// ============================================================================
// TerrainSurfaceShaderPipeline
// ============================================================================

/**
 * GPU compute pipeline for SDF-based surface displacement on terrain meshes.
 *
 * Usage:
 * ```ts
 * const pipeline = new TerrainSurfaceShaderPipeline({
 *   enabled: true,
 *   displacementScale: 1.0,
 *   noiseAmplitude: 0.3,
 * });
 *
 * await pipeline.initialize();
 *
 * const refinedGeometry = await pipeline.computeDisplacement(
 *   initialGeometry,
 *   sdf,
 * );
 * ```
 */
export class TerrainSurfaceShaderPipeline {
  private config: TerrainSurfaceConfig;
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private initialized: boolean = false;
  private gpuAvailable: boolean = false;

  constructor(config: Partial<TerrainSurfaceConfig> = {}) {
    this.config = { ...DEFAULT_TERRAIN_SURFACE_CONFIG, ...config };
  }

  // ========================================================================
  // Public API
  // ========================================================================

  /**
   * Initialize the GPU compute pipeline.
   *
   * If WebGPU is not available or shader compilation fails, the pipeline
   * will fall back to CPU computation automatically. Shader compilation
   * errors are caught and logged — they never crash.
   *
   * @param device - Optional pre-existing GPUDevice. If not provided,
   *                 the pipeline will try to acquire one from the browser.
   * @returns true if GPU pipeline was created, false if falling back to CPU
   */
  async initialize(device?: GPUDevice): Promise<boolean> {
    if (!this.config.enabled) {
      console.log('[TerrainSurfaceShaderPipeline] Disabled by config; will use CPU fallback');
      this.initialized = true;
      this.gpuAvailable = false;
      return false;
    }

    // Try to get a GPU device
    try {
      if (device) {
        this.device = device;
      } else {
        if (typeof navigator === 'undefined' || !navigator.gpu) {
          this.initialized = true;
          this.gpuAvailable = false;
          return false;
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          this.initialized = true;
          this.gpuAvailable = false;
          return false;
        }

        this.device = await adapter.requestDevice();
      }

      // Compile the WGSL shader
      try {
        const shaderModule = this.device.createShaderModule({
          code: SDF_SURFACE_DISPLACEMENT_WGSL,
        });

        // Check for compilation errors
        const compilationInfo = await shaderModule.getCompilationInfo();
        const errors = compilationInfo.messages.filter((m) => m.type === 'error');
        if (errors.length > 0) {
          console.error(
            '[TerrainSurfaceShaderPipeline] WGSL compilation errors:',
            errors.map((e) => `${e.lineNum}:${e.linePos} — ${e.message}`).join('\n'),
          );
          this.device = null;
          this.initialized = true;
          this.gpuAvailable = false;
          return false;
        }

        this.pipeline = this.device.createComputePipeline({
          layout: 'auto',
          compute: { module: shaderModule, entryPoint: 'main' },
        });

        this.gpuAvailable = true;
        this.initialized = true;
        console.log('[TerrainSurfaceShaderPipeline] WebGPU pipeline initialized successfully');
        return true;
      } catch (shaderError) {
        console.warn(
          '[TerrainSurfaceShaderPipeline] Shader compilation failed, will use CPU fallback:',
          shaderError,
        );
        this.device = null;
        this.pipeline = null;
        this.initialized = true;
        this.gpuAvailable = false;
        return false;
      }
    } catch (err) {
      console.warn(
        '[TerrainSurfaceShaderPipeline] WebGPU not available, will use CPU fallback:',
        err,
      );
      this.device = null;
      this.pipeline = null;
      this.initialized = true;
      this.gpuAvailable = false;
      return false;
    }
  }

  /**
   * Compute displacement on the terrain geometry.
   *
   * If the GPU pipeline is available, runs the WGSL compute shader.
   * Otherwise, falls back to CPU computation using the SDF's sample()
   * method for trilinear interpolation.
   *
   * Returns a **new** BufferGeometry with displaced positions and normals.
   * The input geometry is not modified.
   *
   * If the pipeline is disabled, returns the input geometry unchanged.
   *
   * @param geometry  - The terrain mesh geometry from marching cubes
   * @param sdf       - The signed distance field used to build the terrain
   * @returns         Displaced geometry (or original if pipeline disabled)
   */
  async computeDisplacement(
    geometry: THREE.BufferGeometry,
    sdf: SignedDistanceField,
  ): Promise<THREE.BufferGeometry> {
    if (!this.config.enabled) {
      return geometry;
    }

    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!positionAttr || positionAttr.count === 0) {
      return geometry;
    }

    // Try GPU path
    if (this.gpuAvailable && this.device && this.pipeline) {
      try {
        return await this.computeDisplacementGPU(geometry, sdf);
      } catch (err) {
        console.warn(
          '[TerrainSurfaceShaderPipeline] GPU displacement failed, falling back to CPU:',
          err,
        );
      }
    }

    // CPU fallback
    return this.computeDisplacementCPU(geometry, sdf);
  }

  /**
   * CPU fallback for surface displacement.
   *
   * Implements the same algorithm as the WGSL shader:
   *   1. Sample the SDF at each vertex via trilinear interpolation
   *   2. Compute the SDF gradient via central finite differences
   *   3. Project the vertex onto the isosurface (Newton step)
   *   4. Optionally add noise-based displacement
   *   5. Compute new normal from the displaced position's gradient
   *
   * This is deterministic given the same SDF and config.
   *
   * @param geometry  - Input terrain geometry
   * @param sdf       - The signed distance field
   * @returns         New geometry with displaced positions and normals
   */
  computeDisplacementCPU(
    geometry: THREE.BufferGeometry,
    sdf: SignedDistanceField,
  ): THREE.BufferGeometry {
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const vertexCount = positionAttr.count;
    const positions = positionAttr.array as Float32Array;

    // Clone geometry to avoid mutating the input
    const result = geometry.clone();
    const outPositions = (result.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;

    // Prepare or allocate normal attribute
    let outNormals: Float32Array;
    const normalAttr = result.getAttribute('normal') as THREE.BufferAttribute | null;
    if (normalAttr) {
      outNormals = normalAttr.array as Float32Array;
    } else {
      outNormals = new Float32Array(vertexCount * 3);
      result.setAttribute('normal', new THREE.BufferAttribute(outNormals, 3));
    }

    const { displacementScale, gradientEpsilon, noiseAmplitude, noiseFrequency, materialType, isoLevel, projectionIterations } = this.config;

    const eps = gradientEpsilon * Math.min(sdf.voxelSize.x, sdf.voxelSize.y, sdf.voxelSize.z);

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      let px = positions[i3];
      let py = positions[i3 + 1];
      let pz = positions[i3 + 2];

      // Iterative Newton projection onto isosurface
      for (let iter = 0; iter < projectionIterations; iter++) {
        const pos = new THREE.Vector3(px, py, pz);
        const sdfValue = sdf.sample(pos);
        const gradient = this.computeSDFAgradent(sdf, pos, eps);

        const gLen = gradient.length();
        if (gLen < 1e-10) break;

        const normal = gradient.clone().divideScalar(gLen);

        // Newton step: project onto isosurface
        px = px - (sdfValue - isoLevel) * normal.x * displacementScale;
        py = py - (sdfValue - isoLevel) * normal.y * displacementScale;
        pz = pz - (sdfValue - isoLevel) * normal.z * displacementScale;
      }

      // Optional noise displacement
      if (noiseAmplitude > 0) {
        const displacedPos = new THREE.Vector3(px, py, pz);
        const gradient = this.computeSDFAgradent(sdf, displacedPos, eps);
        const gLen = gradient.length();
        if (gLen > 1e-10) {
          const normal = gradient.clone().divideScalar(gLen);
          const noiseDisp = this.computeMaterialNoise(displacedPos, noiseFrequency, materialType);
          px += normal.x * noiseDisp * noiseAmplitude;
          py += normal.y * noiseDisp * noiseAmplitude;
          pz += normal.z * noiseDisp * noiseAmplitude;
        }
      }

      outPositions[i3] = px;
      outPositions[i3 + 1] = py;
      outPositions[i3 + 2] = pz;

      // Compute new normal at displaced position
      const displacedPos = new THREE.Vector3(px, py, pz);
      const newGradient = this.computeSDFAgradent(sdf, displacedPos, eps);
      const newGLen = newGradient.length();
      if (newGLen > 1e-10) {
        outNormals[i3] = newGradient.x / newGLen;
        outNormals[i3 + 1] = newGradient.y / newGLen;
        outNormals[i3 + 2] = newGradient.z / newGLen;
      } else {
        outNormals[i3] = 0;
        outNormals[i3 + 1] = 1;
        outNormals[i3 + 2] = 0;
      }
    }

    // Mark attributes as needing update
    (result.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    if (result.getAttribute('normal')) {
      (result.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    }

    return result;
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    if (this.device) {
      // Note: we don't destroy the device since it may be shared
      this.device = null;
    }
    this.pipeline = null;
    this.initialized = false;
    this.gpuAvailable = false;
  }

  /**
   * Check if the GPU pipeline is available.
   */
  isGPUAvailable(): boolean {
    return this.gpuAvailable;
  }

  /**
   * Check if the pipeline has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Update the pipeline configuration. Changes take effect on the next
   * `computeDisplacement()` call.
   */
  setConfig(config: Partial<TerrainSurfaceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get the current configuration.
   */
  getConfig(): TerrainSurfaceConfig {
    return { ...this.config };
  }

  /**
   * Check if WebGPU is available in the current environment.
   */
  static isWebGPUAvailable(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }

  // ========================================================================
  // GPU Implementation
  // ========================================================================

  private async computeDisplacementGPU(
    geometry: THREE.BufferGeometry,
    sdf: SignedDistanceField,
  ): Promise<THREE.BufferGeometry> {
    const dev = this.device!;
    const pipe = this.pipeline!;

    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const vertexCount = positionAttr.count;
    const positions = positionAttr.array as Float32Array;
    const normals = normalAttr ? (normalAttr.array as Float32Array) : new Float32Array(vertexCount * 3);

    // Pad vertex count to multiple of 64 (workgroup size) for the dispatch
    const paddedVertexCount = Math.ceil(vertexCount / 64) * 64;

    // --- Upload uniforms ---
    const uniformData = this.buildUniformBuffer(vertexCount, sdf);
    const uniformBuf = dev.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(uniformBuf, 0, uniformData);

    // --- Upload SDF voxel data ---
    const sdfBuf = dev.createBuffer({
      size: sdf.data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(sdfBuf, 0, sdf.data);

    // --- Upload input positions ---
    // Pad to paddedVertexCount * 3 floats
    const paddedPositions = new Float32Array(paddedVertexCount * 3);
    paddedPositions.set(positions);
    const inPosBuf = dev.createBuffer({
      size: paddedPositions.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(inPosBuf, 0, paddedPositions);

    // --- Upload input normals ---
    const paddedNormals = new Float32Array(paddedVertexCount * 3);
    paddedNormals.set(normals);
    const inNormBuf = dev.createBuffer({
      size: paddedNormals.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(inNormBuf, 0, paddedNormals);

    // --- Create output buffers ---
    const outPosBuf = dev.createBuffer({
      size: paddedPositions.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const outNormBuf = dev.createBuffer({
      size: paddedNormals.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // --- Create bind group ---
    const bindGroup = dev.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: { buffer: sdfBuf } },
        { binding: 2, resource: { buffer: inPosBuf } },
        { binding: 3, resource: { buffer: inNormBuf } },
        { binding: 4, resource: { buffer: outPosBuf } },
        { binding: 5, resource: { buffer: outNormBuf } },
      ],
    });

    // --- Dispatch compute ---
    const workgroupCount = Math.ceil(paddedVertexCount / 64);
    const encoder = dev.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();

    // --- Read back results ---
    const outPosRead = dev.createBuffer({
      size: paddedPositions.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const outNormRead = dev.createBuffer({
      size: paddedNormals.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    encoder.copyBufferToBuffer(outPosBuf, 0, outPosRead, 0, paddedPositions.byteLength);
    encoder.copyBufferToBuffer(outNormBuf, 0, outNormRead, 0, paddedNormals.byteLength);

    dev.queue.submit([encoder.finish()]);

    // Map and read
    await outPosRead.mapAsync(GPUMapMode.READ);
    const gpuPositions = new Float32Array(outPosRead.getMappedRange()).slice(0, vertexCount * 3);
    outPosRead.unmap();

    await outNormRead.mapAsync(GPUMapMode.READ);
    const gpuNormals = new Float32Array(outNormRead.getMappedRange()).slice(0, vertexCount * 3);
    outNormRead.unmap();

    // --- Build result geometry ---
    const result = geometry.clone();
    const resultPosAttr = result.getAttribute('position') as THREE.BufferAttribute;
    (resultPosAttr.array as Float32Array).set(gpuPositions);
    resultPosAttr.needsUpdate = true;

    const resultNormAttr = result.getAttribute('normal') as THREE.BufferAttribute | null;
    if (resultNormAttr) {
      (resultNormAttr.array as Float32Array).set(gpuNormals);
      resultNormAttr.needsUpdate = true;
    } else {
      result.setAttribute('normal', new THREE.BufferAttribute(gpuNormals, 3));
    }

    // Cleanup GPU resources
    this.destroyGPUBuffers(sdfBuf, inPosBuf, inNormBuf, outPosBuf, outNormBuf, uniformBuf, outPosRead, outNormRead);

    return result;
  }

  /**
   * Build the uniform buffer from current config and SDF parameters.
   */
  private buildUniformBuffer(vertexCount: number, sdf: SignedDistanceField): ArrayBuffer {
    const buf = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
    const dv = new DataView(buf);
    let offset = 0;

    // u32 fields
    dv.setUint32(offset, vertexCount, true); offset += 4;
    dv.setUint32(offset, sdf.gridSize[0], true); offset += 4;
    dv.setUint32(offset, sdf.gridSize[1], true); offset += 4;
    dv.setUint32(offset, sdf.gridSize[2], true); offset += 4;

    // f32 fields
    dv.setFloat32(offset, sdf.bounds.min.x, true); offset += 4;
    dv.setFloat32(offset, sdf.bounds.min.y, true); offset += 4;
    dv.setFloat32(offset, sdf.bounds.min.z, true); offset += 4;

    dv.setFloat32(offset, sdf.voxelSize.x, true); offset += 4;
    dv.setFloat32(offset, sdf.voxelSize.y, true); offset += 4;
    dv.setFloat32(offset, sdf.voxelSize.z, true); offset += 4;

    dv.setFloat32(offset, this.config.displacementScale, true); offset += 4;
    dv.setFloat32(offset, this.config.gradientEpsilon * Math.min(sdf.voxelSize.x, sdf.voxelSize.y, sdf.voxelSize.z), true); offset += 4;
    dv.setFloat32(offset, this.config.noiseAmplitude, true); offset += 4;
    dv.setFloat32(offset, this.config.noiseFrequency, true); offset += 4;

    // u32 materialType + f32 isoLevel
    dv.setUint32(offset, this.config.materialType, true); offset += 4;
    dv.setFloat32(offset, this.config.isoLevel, true); offset += 4;

    return buf;
  }

  /**
   * Compute SDF gradient at a world-space position using central differences.
   */
  private computeSDFAgradent(sdf: SignedDistanceField, pos: THREE.Vector3, eps: number): THREE.Vector3 {
    const dxp = sdf.sample(new THREE.Vector3(pos.x + eps, pos.y, pos.z));
    const dxm = sdf.sample(new THREE.Vector3(pos.x - eps, pos.y, pos.z));
    const dyp = sdf.sample(new THREE.Vector3(pos.x, pos.y + eps, pos.z));
    const dym = sdf.sample(new THREE.Vector3(pos.x, pos.y - eps, pos.z));
    const dzp = sdf.sample(new THREE.Vector3(pos.x, pos.y, pos.z + eps));
    const dzm = sdf.sample(new THREE.Vector3(pos.x, pos.y, pos.z - eps));

    return new THREE.Vector3(dxp - dxm, dyp - dym, dzp - dzm);
  }

  /**
   * Compute noise-based displacement for a given position and material type.
   * Deterministic given the same position, frequency, and material.
   */
  private computeMaterialNoise(pos: THREE.Vector3, frequency: number, materialType: number): number {
    switch (materialType) {
      case 1: // Rocky: high-frequency detail
        return this.fbmNoise3D(pos.x * frequency * 3, pos.y * frequency * 3, pos.z * frequency * 3) * 0.7;
      case 2: // Sandy: low-frequency rolling dunes
        return this.fbmNoise2D(pos.x * frequency * 0.5, pos.z * frequency * 0.5) * 0.5;
      case 3: // Snowy: smooth with gentle undulation
        return this.fbmNoise3D(pos.x * frequency * 0.3, pos.y * frequency * 0.3, pos.z * frequency * 0.3) * 0.2;
      case 4: { // Clay: medium detail with striations
        const base = this.fbmNoise3D(pos.x * frequency * 2, pos.y * frequency * 2, pos.z * frequency * 2) * 0.6;
        const striation = Math.sin(pos.y * 20) * 0.05;
        return base + striation;
      }
      default: // Default: moderate 3D noise
        return this.fbmNoise3D(pos.x * frequency, pos.y * frequency, pos.z * frequency) * 0.5;
    }
  }

  // ---- Deterministic noise functions (matching the WGSL shader) ----

  private hash2(x: number, y: number): number {
    // Match WGSL: fract(vec3(p.x, p.y, p.x) * 0.1031) then dot and fract
    let p3x = this.fract(x * 0.1031);
    let p3y = this.fract(y * 0.1031);
    let p3z = this.fract(x * 0.1031);
    p3x += (p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33));
    p3y += (p3y * (p3z + 33.33) + p3z * (p3x + 33.33) + p3x * (p3y + 33.33));
    p3z += (p3z * (p3x + 33.33) + p3x * (p3y + 33.33) + p3y * (p3z + 33.33));
    return this.fract((p3x + p3y) * p3z);
  }

  private hash3(x: number, y: number, z: number): number {
    let p3x = this.fract(x * 0.1031);
    let p3y = this.fract(y * 0.1031);
    let p3z = this.fract(z * 0.1031);
    p3x += (p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33));
    p3y += (p3y * (p3z + 33.33) + p3z * (p3x + 33.33) + p3x * (p3y + 33.33));
    p3z += (p3z * (p3x + 33.33) + p3x * (p3y + 33.33) + p3y * (p3z + 33.33));
    return this.fract((p3x + p3y) * p3z);
  }

  private valueNoise2D(px: number, py: number): number {
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    const a = this.hash2(ix, iy);
    const b = this.hash2(ix + 1, iy);
    const c = this.hash2(ix, iy + 1);
    const d = this.hash2(ix + 1, iy + 1);

    return this.lerp(this.lerp(a, b, ux), this.lerp(c, d, ux), uy);
  }

  private valueNoise3D(px: number, py: number, pz: number): number {
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const iz = Math.floor(pz);
    const fx = px - ix;
    const fy = py - iy;
    const fz = pz - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);

    const n000 = this.hash3(ix, iy, iz);
    const n100 = this.hash3(ix + 1, iy, iz);
    const n010 = this.hash3(ix, iy + 1, iz);
    const n110 = this.hash3(ix + 1, iy + 1, iz);
    const n001 = this.hash3(ix, iy, iz + 1);
    const n101 = this.hash3(ix + 1, iy, iz + 1);
    const n011 = this.hash3(ix, iy + 1, iz + 1);
    const n111 = this.hash3(ix + 1, iy + 1, iz + 1);

    const v00 = this.lerp(n000, n100, ux);
    const v01 = this.lerp(n010, n110, ux);
    const v10 = this.lerp(n001, n101, ux);
    const v11 = this.lerp(n011, n111, ux);
    const v0 = this.lerp(v00, v01, uy);
    const v1 = this.lerp(v10, v11, uy);

    return this.lerp(v0, v1, uz);
  }

  private fbmNoise2D(px: number, py: number): number {
    let total = 0;
    let amp = 0.5;
    let freq = 1.0;
    let cx = px;
    let cy = py;

    for (let i = 0; i < 4; i++) {
      total += this.valueNoise2D(cx * freq, cy * freq) * amp;
      freq *= 2;
      amp *= 0.5;
      cx += 1.7;
      cy += 9.2;
    }

    return total;
  }

  private fbmNoise3D(px: number, py: number, pz: number): number {
    let total = 0;
    let amp = 0.5;
    let freq = 1.0;
    let cx = px;
    let cy = py;
    let cz = pz;

    for (let i = 0; i < 4; i++) {
      total += this.valueNoise3D(cx * freq, cy * freq, cz * freq) * amp;
      freq *= 2;
      amp *= 0.5;
      cx += 1.7;
      cy += 9.2;
      cz += 4.1;
    }

    return total;
  }

  private fract(x: number): number {
    return x - Math.floor(x);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private destroyGPUBuffers(...buffers: GPUBuffer[]): void {
    for (const b of buffers) {
      try {
        if (b && typeof b.destroy === 'function') b.destroy();
      } catch (err) {
        // Silently ignore cleanup errors
        if (process.env.NODE_ENV === 'development') console.debug('[TerrainSurfaceShaderPipeline] GPU buffer destroy fallback:', err);
      }
    }
  }
}

export default TerrainSurfaceShaderPipeline;
