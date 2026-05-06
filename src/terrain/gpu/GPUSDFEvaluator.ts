/**
 * GPUSDFEvaluator — GPU-Accelerated SDF Grid Evaluation
 *
 * Evaluates SDF compositions on the GPU using WebGPU compute shaders.
 * Takes a terrain element composition (list of SDF primitives with transforms
 * and combinators), generates a WGSL compute shader, dispatches it on the
 * GPU, reads back SDF values for each grid point, and returns a
 * SignedDistanceField compatible with extractIsosurface().
 *
 * Architecture:
 *   1. Convert terrain elements into a flat composition buffer
 *   2. Upload the buffer to the GPU as a storage buffer
 *   3. Dispatch a compute shader that evaluates all elements at each
 *      grid point in parallel
 *   4. Read back the SDF values into a Float32Array
 *   5. Wrap in a SignedDistanceField instance
 *
 * The compute shader evaluates each element sequentially per grid point,
 * but all grid points are evaluated in parallel. For a 64³ grid that's
 * 262,144 parallel evaluations, providing orders-of-magnitude speedup
 * over sequential TypeScript evaluation.
 *
 * Fallback: When WebGPU is unavailable, falls back to CPU evaluation
 * using the existing ElementRegistry/CompositionOperation system.
 *
 * @module terrain/gpu
 */

import * as THREE from 'three';
import { SignedDistanceField } from '@/terrain/sdf/sdf-operations';
import {
  ALL_WGSL_SDF_FUNCTIONS,
  SDF_ELEMENT_FLOATS,
  SDFPrimitiveType,
  SDFCombinatorType,
  type SDFElementDesc,
} from './WGSLSDFFunctions';
import {
  ElementRegistry,
  CompositionOperation,
  type ElementEvalResult,
} from '@/terrain/sdf/TerrainElementSystem';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Configuration for the GPU SDF evaluator.
 */
export interface GPUSDFEvaluatorConfig {
  /** Whether GPU evaluation is enabled (default true) */
  enabled: boolean;
  /** Workgroup size for the compute shader (default 64) */
  workgroupSize: number;
  /** Maximum number of SDF elements in a composition (default 256) */
  maxElements: number;
  /** Smooth blend factor for element composition (default 0.3) */
  defaultBlendFactor: number;
}

/**
 * Default configuration for the GPU SDF evaluator.
 */
export const DEFAULT_GPU_SDF_EVALUATOR_CONFIG: GPUSDFEvaluatorConfig = {
  enabled: true,
  workgroupSize: 64,
  maxElements: 256,
  defaultBlendFactor: 0.3,
};

/**
 * Result of SDF grid evaluation.
 */
export interface SDFEvaluationResult {
  /** The computed SDF grid data */
  sdf: SignedDistanceField;
  /** Whether GPU was used */
  gpuUsed: boolean;
  /** Wall-clock time for evaluation in ms */
  executionTimeMs: number;
}

// ============================================================================
// WGSL Compute Shader Template
// ============================================================================

/**
 * Generate the WGSL compute shader for SDF grid evaluation.
 *
 * The shader reads the composition buffer and evaluates all SDF elements
 * at each grid point in parallel. Grid coordinates are computed from the
 * global invocation ID.
 *
 * Bindings:
 *   @group(0) @binding(0) — uniforms (grid params)
 *   @group(0) @binding(1) — composition buffer (SDF element data)
 *   @group(0) @binding(2) — output SDF grid
 */
function generateSDFComputeShader(workgroupSize: number): string {
  return /* wgsl */ `
// ============================================================================
// GPU SDF Grid Evaluation Compute Shader
// ============================================================================

struct Uniforms {
  gridSizeX: u32,
  gridSizeY: u32,
  gridSizeZ: u32,
  totalPoints: u32,
  boundsMinX: f32,
  boundsMinY: f32,
  boundsMinZ: f32,
  voxelSizeX: f32,
  voxelSizeY: f32,
  voxelSizeZ: f32,
  elementCount: u32,
  defaultBlendFactor: f32,
  padding1: f32,
  padding2: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> composition: array<f32>;
@group(0) @binding(2) var<storage, read_write> outputSDF: array<f32>;

${ALL_WGSL_SDF_FUNCTIONS}

// ---- Element evaluation ----

/// Evaluate a single SDF element at point p.
/// The element data is read from the composition buffer at the given offset.
fn evaluate_element(p: vec3f, elementOffset: u32) -> f32 {
  // Read element header
  let primitiveType = u32(composition[elementOffset]);
  // Params are at offsets [1..10]
  let p0 = composition[elementOffset + 1u];
  let p1 = composition[elementOffset + 2u];
  let p2 = composition[elementOffset + 3u];
  let p3 = composition[elementOffset + 4u];
  let p4 = composition[elementOffset + 5u];
  let p5 = composition[elementOffset + 6u];
  let p6 = composition[elementOffset + 7u];
  let p7 = composition[elementOffset + 8u];
  let p8 = composition[elementOffset + 9u];
  let p9 = composition[elementOffset + 10u];

  // Read transform
  let posX = composition[elementOffset + 11u];
  let posY = composition[elementOffset + 12u];
  let posZ = composition[elementOffset + 13u];
  let rotX = composition[elementOffset + 14u];
  let rotY = composition[elementOffset + 15u];
  let rotZ = composition[elementOffset + 16u];
  let scl  = composition[elementOffset + 17u];

  // Apply inverse transform: scale → rotate → translate
  var q = sdf_translate(p, vec3f(posX, posY, posZ));
  q = sdf_rotate_y(q, -rotY);
  q = sdf_rotate_x(q, -rotX);
  q = sdf_rotate_z(q, -rotZ);
  q = sdf_scale(q, scl);

  // Evaluate primitive
  var dist: f32;
  switch primitiveType {
    case 0u: { // SPHERE
      dist = sdf_sphere(q, p0);
    }
    case 1u: { // BOX
      dist = sdf_box(q, vec3f(p0, p1, p2));
    }
    case 2u: { // CYLINDER
      dist = sdf_cylinder(q, p0, p1);
    }
    case 3u: { // TORUS
      dist = sdf_torus(q, p0, p1);
    }
    case 4u: { // CONE
      dist = sdf_cone(q, p0, p1);
    }
    case 5u: { // PLANE
      dist = sdf_plane(q);
    }
    case 6u: { // CAPSULE
      dist = sdf_capsule(q, p0, p1);
    }
    case 7u: { // ELLIPSOID
      dist = sdf_ellipsoid(q, vec3f(p0, p1, p2));
    }
    case 8u: { // SEGMENT (line segment)
      // params: a.x, a.y, a.z, b.x, b.y, b.z, radius
      dist = sdf_segment(q, vec3f(p0, p1, p2), vec3f(p3, p4, p5), p6);
    }
    case 9u: { // CAPPED_CONE
      dist = sdf_capped_cone(q, p0, p1, p2);
    }
    default: {
      dist = 1e6; // far outside
    }
  }

  // Compensate for scale: distances must be divided by scale
  dist = dist / max(scl, 0.0001);

  return dist;
}

/// Combine two distance values using the specified combinator.
fn combine_sdf(current: f32, element_dist: f32, combinator: u32, param: f32) -> f32 {
  switch combinator {
    case 0u: { // UNION
      return sdf_union(current, element_dist);
    }
    case 1u: { // SUBTRACTION
      return sdf_subtraction(current, element_dist);
    }
    case 2u: { // INTERSECTION
      return sdf_intersection(current, element_dist);
    }
    case 3u: { // SMOOTH_UNION
      return sdf_smooth_union(current, element_dist, param);
    }
    case 4u: { // SMOOTH_SUBTRACTION
      return sdf_smooth_subtraction(current, element_dist, param);
    }
    case 5u: { // SMOOTH_INTERSECTION
      return sdf_smooth_intersection(current, element_dist, param);
    }
    case 6u: { // EXP_SMOOTH_UNION
      return sdf_exp_smooth_union(current, element_dist, param);
    }
    default: {
      return sdf_union(current, element_dist);
    }
  }
}

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= uniforms.totalPoints) {
    return;
  }

  // Compute grid coordinates from linear index
  let gsx = uniforms.gridSizeX;
  let gsy = uniforms.gridSizeY;
  let gsz = uniforms.gridSizeZ;

  let gz = idx / (gsx * gsy);
  let rem = idx % (gsx * gsy);
  let gy = rem / gsx;
  let gx = rem % gsx;

  // Compute world position (center of voxel)
  let worldX = uniforms.boundsMinX + (f32(gx) + 0.5) * uniforms.voxelSizeX;
  let worldY = uniforms.boundsMinY + (f32(gy) + 0.5) * uniforms.voxelSizeY;
  let worldZ = uniforms.boundsMinZ + (f32(gz) + 0.5) * uniforms.voxelSizeZ;
  let pos = vec3f(worldX, worldY, worldZ);

  // Evaluate all elements in the composition
  let elementCount = uniforms.elementCount;
  let floatsPerElement = ${SDF_ELEMENT_FLOATS}u;

  // Initialize with far-outside distance
  var result = 1e6;

  for (var i = 0u; i < elementCount; i = i + 1u) {
    let elementOffset = i * floatsPerElement;

    // Evaluate this element
    let elementDist = evaluate_element(pos, elementOffset);

    // Read combinator type and param from the composition buffer
    let combinator = u32(composition[elementOffset + 18u]);
    let combinatorParam = composition[elementOffset + 19u];

    // Combine with running result
    result = combine_sdf(result, elementDist, combinator, combinatorParam);
  }

  // Write output
  outputSDF[idx] = result;
}
`;
}

// ============================================================================
// Uniform Buffer Layout (must match the WGSL struct exactly)
// ============================================================================

/**
 * Size of the uniform buffer in bytes.
 * 4 u32 (16) + 3 f32 (12) + 3 f32 (12) + 1 u32 (4) + 1 f32 (4) + 3 f32 (12)
 * = 16 + 12 + 12 + 4 + 4 + 12 = 60 → padded to 64 for alignment
 */
const UNIFORM_BUFFER_SIZE = 64;

// ============================================================================
// GPUSDFEvaluator
// ============================================================================

/**
 * GPU-accelerated SDF grid evaluator using WebGPU compute shaders.
 *
 * Takes a terrain element composition (list of SDF primitives with
 * transforms and combinators), generates a WGSL compute shader from
 * the composition, dispatches the compute shader on the GPU, reads
 * back the SDF values for each grid point, and returns a
 * SignedDistanceField compatible with extractIsosurface().
 *
 * Usage:
 * ```typescript
 * const evaluator = new GPUSDFEvaluator();
 * await evaluator.initialize();
 *
 * // Build composition from terrain elements
 * const elements = buildComposition(registry);
 *
 * // Evaluate on the GPU
 * const result = await evaluator.evaluate(
 *   elements,
 *   bounds,
 *   resolution,
 * );
 *
 * // Extract mesh
 * const geometry = extractIsosurface(result.sdf, 0);
 * ```
 */
export class GPUSDFEvaluator {
  private config: GPUSDFEvaluatorConfig;
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private initialized: boolean = false;
  private gpuAvailable: boolean = false;

  constructor(config: Partial<GPUSDFEvaluatorConfig> = {}) {
    this.config = { ...DEFAULT_GPU_SDF_EVALUATOR_CONFIG, ...config };
  }

  // ========================================================================
  // Public API
  // ========================================================================

  /**
   * Initialize the GPU evaluator.
   *
   * Attempts to acquire a WebGPU device and compile the compute shader.
   * If WebGPU is unavailable, the evaluator will fall back to CPU evaluation.
   *
   * @param device - Optional pre-existing GPUDevice
   * @returns true if GPU pipeline was created, false if falling back to CPU
   */
  async initialize(device?: GPUDevice): Promise<boolean> {
    if (!this.config.enabled) {
      console.log('[GPUSDFEvaluator] Disabled by config; will use CPU fallback');
      this.initialized = true;
      this.gpuAvailable = false;
      return false;
    }

    try {
      if (device) {
        this.device = device;
      } else {
        if (typeof navigator === 'undefined' || !navigator.gpu) {
          this.initialized = true;
          this.gpuAvailable = false;
          return false;
        }

        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: 'high-performance',
        });

        if (!adapter) {
          this.initialized = true;
          this.gpuAvailable = false;
          return false;
        }

        this.device = await adapter.requestDevice();
      }

      // Compile the compute shader
      try {
        const shaderCode = generateSDFComputeShader(this.config.workgroupSize);
        const shaderModule = this.device.createShaderModule({ code: shaderCode });

        // Check for compilation errors
        const compilationInfo = await shaderModule.getCompilationInfo();
        const errors = compilationInfo.messages.filter((m) => m.type === 'error');

        if (errors.length > 0) {
          console.error(
            '[GPUSDFEvaluator] WGSL compilation errors:',
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
        console.log('[GPUSDFEvaluator] WebGPU pipeline initialized successfully');
        return true;
      } catch (shaderError) {
        console.warn('[GPUSDFEvaluator] Shader compilation failed, will use CPU fallback:', shaderError);
        this.device = null;
        this.pipeline = null;
        this.initialized = true;
        this.gpuAvailable = false;
        return false;
      }
    } catch (err) {
      console.warn('[GPUSDFEvaluator] WebGPU not available, will use CPU fallback:', err);
      this.device = null;
      this.pipeline = null;
      this.initialized = true;
      this.gpuAvailable = false;
      return false;
    }
  }

  /**
   * Evaluate SDF on a grid using GPU compute shader.
   *
   * Takes a list of SDF element descriptions, bounds, and resolution,
   * and returns a SignedDistanceField with the evaluated values.
   *
   * If GPU is unavailable, falls back to CPU evaluation using the
   * provided ElementRegistry.
   *
   * @param elements - Array of SDF element descriptions
   * @param bounds - World-space bounds for the SDF grid
   * @param resolution - Voxel size in world units
   * @param registry - Optional ElementRegistry for CPU fallback
   * @param operation - Composition operation for CPU fallback (default DIFFERENCE)
   * @returns Evaluation result with SDF and metadata
   */
  async evaluate(
    elements: SDFElementDesc[],
    bounds: THREE.Box3,
    resolution: number,
    registry?: ElementRegistry,
    operation: CompositionOperation = CompositionOperation.DIFFERENCE,
  ): Promise<SDFEvaluationResult> {
    const startTime = performance.now();

    if (!this.initialized) {
      await this.initialize();
    }

    // Create the SDF grid structure
    const size = bounds.getSize(new THREE.Vector3());
    const gridSize: [number, number, number] = [
      Math.floor(size.x / resolution),
      Math.floor(size.y / resolution),
      Math.floor(size.z / resolution),
    ];
    const voxelSize = new THREE.Vector3(
      size.x / gridSize[0],
      size.y / gridSize[1],
      size.z / gridSize[2],
    );

    const totalPoints = gridSize[0] * gridSize[1] * gridSize[2];

    // Try GPU path
    if (this.gpuAvailable && this.device && this.pipeline && elements.length > 0) {
      try {
        const sdfData = await this.evaluateGPU(elements, bounds, gridSize, voxelSize, totalPoints);
        const sdf = this.buildSDF(sdfData, gridSize, bounds, resolution, voxelSize);
        return {
          sdf,
          gpuUsed: true,
          executionTimeMs: performance.now() - startTime,
        };
      } catch (err) {
        console.warn('[GPUSDFEvaluator] GPU evaluation failed, falling back to CPU:', err);
      }
    }

    // CPU fallback using ElementRegistry
    const sdfData = this.evaluateCPU(registry, bounds, gridSize, voxelSize, operation);
    const sdf = this.buildSDF(sdfData, gridSize, bounds, resolution, voxelSize);
    return {
      sdf,
      gpuUsed: false,
      executionTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Evaluate SDF using the CPU fallback path.
   *
   * Uses the existing ElementRegistry to evaluate SDF values at each
   * grid point. This is the same algorithm as SDFTerrainGenerator.buildSDF()
   * but factored out for reuse.
   *
   * @param registry - Element registry for evaluation
   * @param bounds - World-space bounds
   * @param gridSize - Grid dimensions [x, y, z]
   * @param voxelSize - Voxel size per axis
   * @param operation - Composition operation
   * @returns Float32Array of SDF values in [z][y][x] order
   */
  evaluateCPU(
    registry: ElementRegistry | null | undefined,
    bounds: THREE.Box3,
    gridSize: [number, number, number],
    voxelSize: THREE.Vector3,
    operation: CompositionOperation = CompositionOperation.DIFFERENCE,
  ): Float32Array {
    const totalPoints = gridSize[0] * gridSize[1] * gridSize[2];
    const data = new Float32Array(totalPoints);

    if (!registry) {
      // No registry — fill with large positive distance (empty space)
      data.fill(1e6);
      return data;
    }

    for (let gz = 0; gz < gridSize[2]; gz++) {
      for (let gy = 0; gy < gridSize[1]; gy++) {
        for (let gx = 0; gx < gridSize[0]; gx++) {
          const pos = new THREE.Vector3(
            bounds.min.x + (gx + 0.5) * voxelSize.x,
            bounds.min.y + (gy + 0.5) * voxelSize.y,
            bounds.min.z + (gz + 0.5) * voxelSize.z,
          );

          const result: ElementEvalResult = registry.evaluateComposed(pos, operation);
          const idx = gz * gridSize[0] * gridSize[1] + gy * gridSize[0] + gx;
          data[idx] = result.distance;
        }
      }
    }

    return data;
  }

  /**
   * Check if the GPU pipeline is available.
   */
  isGPUAvailable(): boolean {
    return this.gpuAvailable;
  }

  /**
   * Check if the evaluator has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    // Don't destroy the device since it may be shared
    this.device = null;
    this.pipeline = null;
    this.initialized = false;
    this.gpuAvailable = false;
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

  private async evaluateGPU(
    elements: SDFElementDesc[],
    bounds: THREE.Box3,
    gridSize: [number, number, number],
    voxelSize: THREE.Vector3,
    totalPoints: number,
  ): Promise<Float32Array> {
    const dev = this.device!;
    const pipe = this.pipeline!;

    // --- Build composition buffer ---
    const compositionData = this.buildCompositionBuffer(elements);

    // --- Upload uniforms ---
    const uniformData = this.buildUniformBuffer(gridSize, bounds, voxelSize, elements.length);

    // --- Create GPU buffers ---
    const uniformBuf = dev.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(uniformBuf, 0, uniformData);

    const compositionBuf = dev.createBuffer({
      size: compositionData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    dev.queue.writeBuffer(compositionBuf, 0, compositionData);

    const outputBuf = dev.createBuffer({
      size: totalPoints * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // --- Create bind group ---
    const bindGroup = dev.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: { buffer: compositionBuf } },
        { binding: 2, resource: { buffer: outputBuf } },
      ],
    });

    // --- Dispatch compute ---
    const workgroupCount = Math.ceil(totalPoints / this.config.workgroupSize);

    const encoder = dev.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();

    // --- Read back results ---
    const readBuf = dev.createBuffer({
      size: totalPoints * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    encoder.copyBufferToBuffer(outputBuf, 0, readBuf, 0, totalPoints * 4);
    dev.queue.submit([encoder.finish()]);

    await readBuf.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();

    // Cleanup
    this.destroyBuffers(uniformBuf, compositionBuf, outputBuf, readBuf);

    return resultData;
  }

  /**
   * Build the composition buffer from SDF element descriptions.
   *
   * Each element is packed as SDF_ELEMENT_FLOATS floats:
   *   [0]     primitiveType (u32 as f32 bits)
   *   [1-10]  params (10 floats)
   *   [11-13] position (3 floats)
   *   [14-16] rotation (3 floats)
   *   [17]    scale (1 float)
   *   [18]    combinator (u32 as f32 bits)
   *   [19]    combinatorParam (1 float)
   */
  private buildCompositionBuffer(elements: SDFElementDesc[]): Float32Array {
    const data = new Float32Array(elements.length * SDF_ELEMENT_FLOATS);

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const base = i * SDF_ELEMENT_FLOATS;

      // Primitive type (store as u32 bits in f32 slot)
      data[base + 0] = el.primitiveType;

      // Params (up to 10 floats, zero-padded)
      for (let j = 0; j < 10; j++) {
        data[base + 1 + j] = j < el.params.length ? el.params[j] : 0;
      }

      // Position
      data[base + 11] = el.position[0];
      data[base + 12] = el.position[1];
      data[base + 13] = el.position[2];

      // Rotation
      data[base + 14] = el.rotation[0];
      data[base + 15] = el.rotation[1];
      data[base + 16] = el.rotation[2];

      // Scale
      data[base + 17] = el.scale;

      // Combinator type
      data[base + 18] = el.combinator;

      // Combinator parameter
      data[base + 19] = el.combinatorParam;
    }

    return data;
  }

  /**
   * Build the uniform buffer from grid parameters.
   */
  private buildUniformBuffer(
    gridSize: [number, number, number],
    bounds: THREE.Box3,
    voxelSize: THREE.Vector3,
    elementCount: number,
  ): ArrayBuffer {
    const buf = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
    const dv = new DataView(buf);
    let offset = 0;

    // u32 fields
    dv.setUint32(offset, gridSize[0], true); offset += 4;
    dv.setUint32(offset, gridSize[1], true); offset += 4;
    dv.setUint32(offset, gridSize[2], true); offset += 4;
    dv.setUint32(offset, gridSize[0] * gridSize[1] * gridSize[2], true); offset += 4;

    // f32 fields: bounds min
    dv.setFloat32(offset, bounds.min.x, true); offset += 4;
    dv.setFloat32(offset, bounds.min.y, true); offset += 4;
    dv.setFloat32(offset, bounds.min.z, true); offset += 4;

    // f32 fields: voxel size
    dv.setFloat32(offset, voxelSize.x, true); offset += 4;
    dv.setFloat32(offset, voxelSize.y, true); offset += 4;
    dv.setFloat32(offset, voxelSize.z, true); offset += 4;

    // u32 element count
    dv.setUint32(offset, elementCount, true); offset += 4;

    // f32 default blend factor
    dv.setFloat32(offset, this.config.defaultBlendFactor, true); offset += 4;

    // padding
    dv.setFloat32(offset, 0, true); offset += 4;
    dv.setFloat32(offset, 0, true); offset += 4;

    return buf;
  }

  /**
   * Build a SignedDistanceField from raw evaluation data.
   */
  private buildSDF(
    data: Float32Array,
    gridSize: [number, number, number],
    bounds: THREE.Box3,
    resolution: number,
    voxelSize: THREE.Vector3,
  ): SignedDistanceField {
    const sdf = new SignedDistanceField({
      resolution,
      bounds,
      maxDistance: 1e6,
    });

    // Copy data into the SDF
    // The SDF's grid size should match our computed grid size
    // (SignedDistanceField computes its own gridSize from bounds/resolution,
    // which may differ slightly from ours due to rounding. We need to copy
    // the data into the actual SDF grid.)
    const actualSize = gridSize[0] * gridSize[1] * gridSize[2];

    // Ensure data fits
    if (sdf.data.length >= actualSize) {
      sdf.data.set(data.subarray(0, actualSize));
    } else {
      // Grid size mismatch — copy point by point
      for (let gz = 0; gz < Math.min(gridSize[2], sdf.gridSize[2]); gz++) {
        for (let gy = 0; gy < Math.min(gridSize[1], sdf.gridSize[1]); gy++) {
          for (let gx = 0; gx < Math.min(gridSize[0], sdf.gridSize[0]); gx++) {
            const srcIdx = gz * gridSize[0] * gridSize[1] + gy * gridSize[0] + gx;
            sdf.setValueAtGrid(gx, gy, gz, data[srcIdx]);
          }
        }
      }
    }

    return sdf;
  }

  /**
   * Destroy GPU buffers safely.
   */
  private destroyBuffers(...buffers: GPUBuffer[]): void {
    for (const b of buffers) {
      try {
        if (b && typeof b.destroy === 'function') b.destroy();
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[GPUSDFEvaluator] Buffer destroy fallback:', err);
        }
      }
    }
  }
}

// ============================================================================
// Composition Builder — Convert ElementRegistry to SDFElementDesc[]
// ============================================================================

/**
 * Build a list of SDF element descriptions from an ElementRegistry.
 *
 * This converts the high-level terrain element system (GroundElement,
 * MountainElement, CaveElement, etc.) into the low-level SDF primitive
 * composition format that the GPU compute shader can evaluate.
 *
 * Since the GPU shader only supports primitive SDFs (sphere, box, cylinder,
 * etc.), complex elements like GroundElement (which uses FBM noise) are
 * approximated using a combination of primitives. For exact FBM-based
 * evaluation, the CPU fallback path should be used.
 *
 * This function is primarily useful for compositions that consist of
 * simple geometric primitives (caves as cylinders, arches as torus sections,
 * rocks as ellipsoids/spheres, etc.).
 *
 * @param registry - Configured ElementRegistry
 * @param blendFactor - Smooth blend factor for unions (default 0.3)
 * @returns Array of SDF element descriptions for GPU evaluation
 */
export function buildCompositionFromRegistry(
  registry: ElementRegistry,
  blendFactor: number = 0.3,
): SDFElementDesc[] {
  const elements: SDFElementDesc[] = [];

  // Get all registered elements
  const elementList = registry.getEnabled();

  for (const element of elementList) {
    if (!element.enabled) continue;

    const name = element.name;

    // Convert each element type to primitive SDF descriptions
    switch (name) {
      case 'Ground':
        // Ground is represented as a plane (infinite ground)
        // Note: FBM noise displacement is not supported in GPU path;
        // this is a simplified representation
        elements.push({
          primitiveType: SDFPrimitiveType.PLANE,
          params: new Float32Array(10),
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: 1,
          combinator: SDFCombinatorType.SMOOTH_UNION,
          combinatorParam: blendFactor,
        });
        break;

      case 'Caves':
        // Caves are cylinders — but we need access to their tunnel data.
        // Since the GPU path can't access the element's internal tunnel data,
        // this is a placeholder. For cave evaluation, use CPU path.
        // Alternatively, the caller can manually add cylinder segments.
        break;

      case 'VoronoiRocks':
        // Rocks are ellipsoids/spheres — but cell centers are internal.
        // For GPU path, caller should manually add rock primitives.
        break;

      case 'Waterbody':
        // Water is an ellipsoid
        elements.push({
          primitiveType: SDFPrimitiveType.ELLIPSOID,
          params: new Float32Array([15, 3, 15, 0, 0, 0, 0, 0, 0, 0]),
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: 1,
          combinator: SDFCombinatorType.SUBTRACTION,
          combinatorParam: 0,
        });
        break;

      case 'Mountains':
        // Mountains are complex FBM shapes — cannot be represented as
        // simple primitives. Use CPU path for mountain evaluation.
        break;
    }
  }

  return elements;
}

/**
 * Helper to create an SDF element description for a sphere.
 */
export function makeSphereElement(
  position: [number, number, number],
  radius: number,
  combinator: SDFCombinatorType = SDFCombinatorType.SMOOTH_UNION,
  blendFactor: number = 0.3,
): SDFElementDesc {
  const params = new Float32Array(10);
  params[0] = radius;
  return {
    primitiveType: SDFPrimitiveType.SPHERE,
    params,
    position,
    rotation: [0, 0, 0],
    scale: 1,
    combinator,
    combinatorParam: blendFactor,
  };
}

/**
 * Helper to create an SDF element description for a box.
 */
export function makeBoxElement(
  position: [number, number, number],
  halfExtents: [number, number, number],
  combinator: SDFCombinatorType = SDFCombinatorType.SMOOTH_UNION,
  blendFactor: number = 0.3,
): SDFElementDesc {
  const params = new Float32Array(10);
  params[0] = halfExtents[0];
  params[1] = halfExtents[1];
  params[2] = halfExtents[2];
  return {
    primitiveType: SDFPrimitiveType.BOX,
    params,
    position,
    rotation: [0, 0, 0],
    scale: 1,
    combinator,
    combinatorParam: blendFactor,
  };
}

/**
 * Helper to create an SDF element description for a cylinder (capped).
 */
export function makeCylinderElement(
  position: [number, number, number],
  radius: number,
  halfHeight: number,
  rotation: [number, number, number] = [0, 0, 0],
  combinator: SDFCombinatorType = SDFCombinatorType.SMOOTH_UNION,
  blendFactor: number = 0.3,
): SDFElementDesc {
  const params = new Float32Array(10);
  params[0] = radius;
  params[1] = halfHeight;
  return {
    primitiveType: SDFPrimitiveType.CYLINDER,
    params,
    position,
    rotation,
    scale: 1,
    combinator,
    combinatorParam: blendFactor,
  };
}

/**
 * Helper to create an SDF element description for a torus.
 */
export function makeTorusElement(
  position: [number, number, number],
  majorRadius: number,
  minorRadius: number,
  rotation: [number, number, number] = [0, 0, 0],
  combinator: SDFCombinatorType = SDFCombinatorType.SMOOTH_UNION,
  blendFactor: number = 0.3,
): SDFElementDesc {
  const params = new Float32Array(10);
  params[0] = majorRadius;
  params[1] = minorRadius;
  return {
    primitiveType: SDFPrimitiveType.TORUS,
    params,
    position,
    rotation,
    scale: 1,
    combinator,
    combinatorParam: blendFactor,
  };
}

/**
 * Helper to create an SDF element description for a cone.
 */
export function makeConeElement(
  position: [number, number, number],
  radius: number,
  height: number,
  rotation: [number, number, number] = [0, 0, 0],
  combinator: SDFCombinatorType = SDFCombinatorType.SMOOTH_UNION,
  blendFactor: number = 0.3,
): SDFElementDesc {
  const params = new Float32Array(10);
  params[0] = radius;
  params[1] = height;
  return {
    primitiveType: SDFPrimitiveType.CONE,
    params,
    position,
    rotation,
    scale: 1,
    combinator,
    combinatorParam: blendFactor,
  };
}

/**
 * Helper to create an SDF element description for a line segment (tunnel).
 */
export function makeSegmentElement(
  start: [number, number, number],
  end: [number, number, number],
  radius: number,
  combinator: SDFCombinatorType = SDFCombinatorType.SUBTRACTION,
  blendFactor: number = 0.3,
): SDFElementDesc {
  const params = new Float32Array(10);
  params[0] = start[0];
  params[1] = start[1];
  params[2] = start[2];
  params[3] = end[0];
  params[4] = end[1];
  params[5] = end[2];
  params[6] = radius;
  return {
    primitiveType: SDFPrimitiveType.SEGMENT,
    params,
    position: [0, 0, 0], // position is baked into segment endpoints
    rotation: [0, 0, 0],
    scale: 1,
    combinator,
    combinatorParam: blendFactor,
  };
}

export default GPUSDFEvaluator;
