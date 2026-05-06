/**
 * Ground Truth Renderer for Infinigen R3F
 *
 * MRT (Multiple Render Targets) ground truth rendering using WebGL2.
 * Renders all GT channels in a single pass:
 *   - Depth (linear Z, Float32)
 *   - Normal (camera-space normals, RGB = XYZ)
 *   - Flow (optical flow from motion vectors, RG = XY)
 *   - Optical Flow (per-object velocity buffers, Float32)
 *   - Object Segmentation (unique color per object)
 *   - Instance Segmentation (unique color per instance)
 *   - Material Segmentation (unique color per material type)
 *
 * Falls back to multi-pass rendering if MRT is not available.
 *
 * Phase 4.2 — Ground Truth
 */

import * as THREE from 'three';
import { createCanvas } from '@/assets/utils/CanvasUtils';
import { OpticalFlowPass, type OpticalFlowConfig } from '../../core/rendering/postprocess/OpticalFlowPass';
import { VelocityBuffer, type CameraVelocityData } from '../../core/rendering/VelocityBuffer';
import { encodeEXR } from './EXREncoder';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GTRenderConfig {
  /** Render resolution */
  width: number;
  height: number;
  /** Which channels to render */
  channels: GTChannel[];
  /** Use MRT if available */
  useMRT: boolean;
}

export type GTChannel =
  | 'depth'
  | 'normal'
  | 'flow'
  | 'optical_flow'
  | 'object_segmentation'
  | 'instance_segmentation'
  | 'material_segmentation';

export interface GTRenderResult {
  depth?: Float32Array;
  normal?: Float32Array;
  flow?: Float32Array;
  /** Per-fragment optical flow (2 channels per pixel: dx, dy) from VelocityBuffer */
  opticalFlow?: Float32Array;
  objectSegmentation?: Uint8Array;
  instanceSegmentation?: Uint8Array;
  materialSegmentation?: Uint8Array;
  width: number;
  height: number;
  objectMap: Map<number, string>;
  instanceMap: Map<number, string>;
  materialMap: Map<number, string>;
}

/**
 * EXR export format configuration.
 * Depth and flow passes default to EXR (float precision); segmentation masks can remain as PNG.
 */
export type GTExportFormat = 'png' | 'exr';

export interface GTExportConfig {
  /** Per-channel export format. Defaults to PNG for segmentation, EXR for depth/flow. */
  formats?: Partial<Record<GTChannel, GTExportFormat>>;
  /** Whether to include EXR float data alongside PNG for channels set to 'exr' */
  includeEXRData?: boolean;
}

/**
 * Result of exporting GT channels, including both PNG data URLs and raw EXR-compatible float buffers.
 */
export interface GTExportResult {
  /** PNG data URLs (always available) */
  pngs: Map<string, string>;
  /** Raw float buffers for EXR export (depth, flow, normal, opticalFlow) */
  exrBuffers: Map<string, { data: Float32Array; width: number; height: number; channels: number }>;
  /** Serialized EXR file data for channels that requested EXR format */
  exrFiles: Map<string, ArrayBuffer>;
}

/**
 * Options for optical flow rendering.
 * Passed to GroundTruthRenderer.render() when the 'optical_flow' channel is requested.
 */
export interface OpticalFlowRenderOptions {
  /** VelocityBuffer with per-object previous/current transforms */
  velocityBuffer?: VelocityBuffer;
  /** Flow scale multiplier (default 1.0) */
  flowScale?: number;
  /** Render forward flow (true) or backward flow (false) */
  forwardFlow?: boolean;
  /** Export format: 'png' for 8-bit visualization, 'exr' for float precision */
  exportFormat?: 'png' | 'exr';
}

// ---------------------------------------------------------------------------
// MRT Shaders
// ---------------------------------------------------------------------------

const MRT_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;

    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewNormal = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const MRT_FRAGMENT_SHADER = /* glsl */ `
  #extension GL_EXT_draw_buffers : require

  precision highp float;

  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  varying vec2 vUv;

  uniform float objectId;
  uniform float instanceId;
  uniform float materialId;
  uniform float nearPlane;
  uniform float farPlane;

  void main() {
    // gl_FragData[0] = Depth (linear Z)
    float linearDepth = length(vViewPosition);
    gl_FragData[0] = vec4(linearDepth, linearDepth, linearDepth, 1.0);

    // gl_FragData[1] = Normal (camera-space, encoded to [0,1])
    vec3 viewNormal = normalize(vViewNormal) * 0.5 + 0.5;
    gl_FragData[1] = vec4(viewNormal, 1.0);

    // gl_FragData[2] = Flow (zero for static scenes; populated externally)
    gl_FragData[2] = vec4(0.0, 0.0, 0.0, 1.0);

    // gl_FragData[3] = Object Segmentation
    float objR = mod(objectId, 256.0) / 255.0;
    float objG = floor(objectId / 256.0) / 255.0;
    gl_FragData[3] = vec4(objR, objG, 0.0, 1.0);

    // gl_FragData[4] = Instance Segmentation
    float instR = mod(instanceId, 256.0) / 255.0;
    float instG = floor(instanceId / 256.0) / 255.0;
    gl_FragData[4] = vec4(instR, instG, 0.0, 1.0);

    // gl_FragData[5] = Material Segmentation
    float matR = mod(materialId, 256.0) / 255.0;
    float matG = floor(materialId / 256.0) / 255.0;
    gl_FragData[5] = vec4(matR, matG, 0.0, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Fallback single-pass shaders
// ---------------------------------------------------------------------------

const DEPTH_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vViewPosition;
  void main() {
    float d = length(vViewPosition);
    gl_FragColor = vec4(d, d, d, 1.0);
  }
`;

const NORMAL_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vViewNormal;
  void main() {
    vec3 n = normalize(vViewNormal) * 0.5 + 0.5;
    gl_FragColor = vec4(n, 1.0);
  }
`;

const ID_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float idValue;
  void main() {
    float r = mod(idValue, 256.0) / 255.0;
    float g = floor(idValue / 256.0) / 255.0;
    gl_FragColor = vec4(r, g, 0.0, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// GroundTruthRenderer
// ---------------------------------------------------------------------------

export class GroundTruthRenderer {
  private renderer: THREE.WebGLRenderer;
  private config: GTRenderConfig;
  private mrtSupported: boolean = false;
  private mrtMaterial: THREE.ShaderMaterial | null = null;

  /** ID maps for decoding */
  private objectIdMap = new Map<number, string>();
  private instanceIdMap = new Map<number, string>();
  private materialIdMap = new Map<number, string>();

  /** Optical flow rendering pass (lazily created) */
  private opticalFlowPass: OpticalFlowPass | null = null;

  /** Internal velocity buffer for tracking object transforms */
  private velocityBuffer: VelocityBuffer;

  /** Last render result, stored for convenience EXR export via exportToEXR(passName) */
  private lastResult: GTRenderResult | null = null;

  constructor(renderer: THREE.WebGLRenderer, config: Partial<GTRenderConfig> = {}) {
    this.renderer = renderer;
    this.config = {
      width: config.width ?? 1920,
      height: config.height ?? 1080,
      channels: config.channels ?? [
        'depth',
        'normal',
        'object_segmentation',
        'instance_segmentation',
        'material_segmentation',
      ],
      useMRT: config.useMRT ?? true,
    };

    this.velocityBuffer = new VelocityBuffer();
    this.checkMRTOsupport();
  }

  // -----------------------------------------------------------------------
  // MRT Support Detection
  // -----------------------------------------------------------------------

  private checkMRTOsupport(): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext | WebGLRenderingContext;

    if ('drawBuffers' in gl) {
      // WebGL2 natively supports drawBuffers
      this.mrtSupported = true;
    } else {
      const ext = gl.getExtension('EXT_draw_buffers');
      if (ext) {
        this.mrtSupported = true;
      }
    }

    // Also check max draw buffers
    if (this.mrtSupported) {
      const gl2 = gl as WebGL2RenderingContext;
      const maxBuffers = gl2.getParameter(gl2.MAX_DRAW_BUFFERS) ?? 1;
      if (maxBuffers < 6) {
        // Not enough buffers for all GT channels
        this.mrtSupported = false;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Main Render
  // -----------------------------------------------------------------------

  render(
    scene: THREE.Scene,
    camera: THREE.Camera,
    opticalFlowOptions?: OpticalFlowRenderOptions,
  ): GTRenderResult {
    // Update velocity buffer for this frame
    if (this.config.channels.includes('optical_flow') || this.config.channels.includes('flow')) {
      const objects: THREE.Object3D[] = [];
      scene.traverse((obj) => objects.push(obj));
      this.velocityBuffer.updateFrame(objects);
      this.velocityBuffer.updateCamera(camera);
    }

    const result = this.mrtSupported && this.config.useMRT
      ? this.renderMRT(scene, camera)
      : this.renderFallback(scene, camera);

    // Optical flow pass (uses OpticalFlowPass with VelocityBuffer)
    if (this.config.channels.includes('optical_flow')) {
      result.opticalFlow = this.renderOpticalFlow(
        scene,
        camera,
        opticalFlowOptions?.velocityBuffer ?? this.velocityBuffer,
        opticalFlowOptions,
      );
    }

    // Store for convenience EXR export
    this.lastResult = result;

    return result;
  }

  // -----------------------------------------------------------------------
  // MRT Render Path
  // -----------------------------------------------------------------------

  private renderMRT(scene: THREE.Scene, camera: THREE.Camera): GTRenderResult {
    const { width, height } = this.config;

    // Create MRT material
    if (!this.mrtMaterial) {
      this.mrtMaterial = new THREE.ShaderMaterial({
        uniforms: {
          objectId: { value: 0 },
          instanceId: { value: 0 },
          materialId: { value: 0 },
          nearPlane: { value: 0.1 },
          farPlane: { value: 1000 },
        },
        vertexShader: MRT_VERTEX_SHADER,
        fragmentShader: MRT_FRAGMENT_SHADER,
      });
    }

    // Use THREE.WebGLMultipleRenderTargets
    const renderTarget = new (THREE as any).WebGLMultipleRenderTargets(
      width,
      height,
      6,
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      },
    );

    // Assign unique IDs to scene objects
    const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
    let objectCounter = 1;
    let instanceCounter = 1;
    let materialCounter = 1;

    this.objectIdMap.clear();
    this.instanceIdMap.clear();
    this.materialIdMap.clear();

    // Store material ID mapping
    const materialIdMapping = new Map<string, number>();

    scene.traverse((obj) => {
      if ((obj as any).isMesh) {
        const mesh = obj as THREE.Mesh;
        originalMaterials.set(mesh, mesh.material);

        // Object ID
        const objId = objectCounter++;
        this.objectIdMap.set(objId, mesh.name || mesh.uuid);

        // Instance ID
        const instId = instanceCounter++;
        this.instanceIdMap.set(instId, mesh.name || mesh.uuid);

        // Material ID (shared by material UUID)
        const matUuid = Array.isArray(mesh.material)
          ? mesh.material[0]?.uuid ?? 'unknown'
          : mesh.material?.uuid ?? 'unknown';

        let matId: number;
        if (materialIdMapping.has(matUuid)) {
          matId = materialIdMapping.get(matUuid)!;
        } else {
          matId = materialCounter++;
          materialIdMapping.set(matUuid, matId);
          const matName = Array.isArray(mesh.material)
            ? (mesh.material[0] as any)?.name ?? matUuid
            : (mesh.material as any)?.name ?? matUuid;
          this.materialIdMap.set(matId, matName);
        }

        // Clone material and set IDs
        const mrtMat = this.mrtMaterial!.clone();
        mrtMat.uniforms.objectId.value = objId;
        mrtMat.uniforms.instanceId.value = instId;
        mrtMat.uniforms.materialId.value = matId;
        mesh.material = mrtMat;
      }
    });

    // Render
    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    // Read back all render targets
    const result: GTRenderResult = {
      width,
      height,
      objectMap: this.objectIdMap,
      instanceMap: this.instanceIdMap,
      materialMap: this.materialIdMap,
    };

    const channels = this.config.channels;

    if (channels.includes('depth')) {
      result.depth = this.readRenderTarget(renderTarget, 0, width, height);
    }
    if (channels.includes('normal')) {
      result.normal = this.readRenderTarget(renderTarget, 1, width, height);
    }
    if (channels.includes('flow')) {
      result.flow = this.readRenderTarget(renderTarget, 2, width, height);
    }
    if (channels.includes('object_segmentation')) {
      result.objectSegmentation = this.readRenderTargetUint8(renderTarget, 3, width, height);
    }
    if (channels.includes('instance_segmentation')) {
      result.instanceSegmentation = this.readRenderTargetUint8(renderTarget, 4, width, height);
    }
    if (channels.includes('material_segmentation')) {
      result.materialSegmentation = this.readRenderTargetUint8(renderTarget, 5, width, height);
    }

    // Restore materials
    scene.traverse((obj) => {
      if ((obj as any).isMesh && originalMaterials.has(obj)) {
        (obj as THREE.Mesh).material = originalMaterials.get(obj)!;
      }
    });

    // Cleanup
    renderTarget.dispose();

    return result;
  }

  // -----------------------------------------------------------------------
  // Fallback Multi-Pass Render
  // -----------------------------------------------------------------------

  private renderFallback(scene: THREE.Scene, camera: THREE.Camera): GTRenderResult {
    const { width, height } = this.config;
    const result: GTRenderResult = {
      width,
      height,
      objectMap: this.objectIdMap,
      instanceMap: this.instanceIdMap,
      materialMap: this.materialIdMap,
    };

    const channels = this.config.channels;

    // Depth pass
    if (channels.includes('depth')) {
      result.depth = this.renderChannelFallback(scene, camera, 'depth', width, height);
    }

    // Normal pass
    if (channels.includes('normal')) {
      result.normal = this.renderChannelFallback(scene, camera, 'normal', width, height);
    }

    // Segmentation passes
    if (
      channels.includes('object_segmentation') ||
      channels.includes('instance_segmentation') ||
      channels.includes('material_segmentation')
    ) {
      const segResult = this.renderSegmentationFallback(scene, camera, width, height);
      if (channels.includes('object_segmentation')) {
        result.objectSegmentation = segResult.object;
      }
      if (channels.includes('instance_segmentation')) {
        result.instanceSegmentation = segResult.instance;
      }
      if (channels.includes('material_segmentation')) {
        result.materialSegmentation = segResult.material;
      }
    }

    // Flow (zero for static fallback without velocity data)
    if (channels.includes('flow')) {
      result.flow = new Float32Array(width * height * 2);
    }

    return result;
  }

  private renderChannelFallback(
    scene: THREE.Scene,
    camera: THREE.Camera,
    channel: 'depth' | 'normal',
    width: number,
    height: number,
  ): Float32Array {
    const rt = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    });

    const vertShader = MRT_VERTEX_SHADER;
    const fragShader = channel === 'depth' ? DEPTH_FRAGMENT : NORMAL_FRAGMENT;

    const material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: vertShader,
      fragmentShader: fragShader,
    });

    const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
    scene.traverse((obj) => {
      if ((obj as any).isMesh) {
        const mesh = obj as THREE.Mesh;
        originalMaterials.set(mesh, mesh.material);
        mesh.material = material;
      }
    });

    this.renderer.setRenderTarget(rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);

    const pixels = new Float32Array(width * height * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, pixels);

    // Extract channel data
    const output = new Float32Array(width * height * (channel === 'normal' ? 3 : 1));
    for (let i = 0; i < width * height; i++) {
      if (channel === 'depth') {
        output[i] = pixels[i * 4];
      } else {
        output[i * 3] = pixels[i * 4];
        output[i * 3 + 1] = pixels[i * 4 + 1];
        output[i * 3 + 2] = pixels[i * 4 + 2];
      }
    }

    // Restore
    scene.traverse((obj) => {
      if ((obj as any).isMesh && originalMaterials.has(obj)) {
        (obj as THREE.Mesh).material = originalMaterials.get(obj)!;
      }
    });

    rt.dispose();
    material.dispose();

    return output;
  }

  private renderSegmentationFallback(
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
  ): { object: Uint8Array; instance: Uint8Array; material: Uint8Array } {
    const rt = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    const objectResult = new Uint8Array(width * height);
    const instanceResult = new Uint8Array(width * height);
    const materialResult = new Uint8Array(width * height);

    this.objectIdMap.clear();
    this.instanceIdMap.clear();
    this.materialIdMap.clear();

    const meshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      if ((obj as any).isMesh) meshes.push(obj as THREE.Mesh);
    });

    const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
    for (const mesh of meshes) {
      originalMaterials.set(mesh, mesh.material);
    }

    // Render each mesh individually for segmentation
    let objId = 1;
    let instId = 1;
    const materialIdMapping = new Map<string, number>();
    let matCounter = 1;

    for (const mesh of meshes) {
      this.objectIdMap.set(objId, mesh.name || mesh.uuid);
      this.instanceIdMap.set(instId, mesh.name || mesh.uuid);

      const matUuid = Array.isArray(mesh.material)
          ? mesh.material[0]?.uuid ?? 'unknown'
          : mesh.material?.uuid ?? 'unknown';
      let matId: number;
      if (materialIdMapping.has(matUuid)) {
        matId = materialIdMapping.get(matUuid)!;
      } else {
        matId = matCounter++;
        materialIdMapping.set(matUuid, matId);
        this.materialIdMap.set(matId, (mesh.material as any)?.name ?? matUuid);
      }

      // Hide all other meshes
      for (const m of meshes) {
        m.visible = m === mesh;
      }

      // Render with flat color
      const color = new THREE.Color(objId / 255, instId / 255, matId / 255);
      const mat = new THREE.MeshBasicMaterial({ color });
      mesh.material = mat;

      this.renderer.setRenderTarget(rt);
      this.renderer.render(scene, camera);
      this.renderer.setRenderTarget(null);

      const pixels = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, pixels);

      // Find pixels belonging to this mesh
      for (let i = 0; i < width * height; i++) {
        const r = pixels[i * 4];
        if (r > 0) {
          objectResult[i] = objId;
          instanceResult[i] = instId;
          materialResult[i] = matId;
        }
      }

      mat.dispose();
      objId++;
      instId++;
    }

    // Restore visibility and materials
    for (const mesh of meshes) {
      mesh.visible = true;
      if (originalMaterials.has(mesh)) {
        mesh.material = originalMaterials.get(mesh)!;
      }
    }

    rt.dispose();

    return { object: objectResult, instance: instanceResult, material: materialResult };
  }

  // -----------------------------------------------------------------------
  // Optical Flow Rendering
  // -----------------------------------------------------------------------

  /**
   * Render optical flow using the OpticalFlowPass.
   *
   * @param scene          - The scene to render
   * @param camera         - The current frame's camera
   * @param velocityBuffer - VelocityBuffer with per-object transforms
   * @param options        - Optional configuration for flow rendering
   * @returns Float32Array with 2 channels per pixel (dx, dy)
   */
  private renderOpticalFlow(
    scene: THREE.Scene,
    camera: THREE.Camera,
    velocityBuffer: VelocityBuffer,
    options?: OpticalFlowRenderOptions,
  ): Float32Array {
    const { width, height } = this.config;

    // Lazily create the optical flow pass
    if (!this.opticalFlowPass) {
      this.opticalFlowPass = new OpticalFlowPass(width, height, {
        flowScale: options?.flowScale ?? 1.0,
        forwardFlow: options?.forwardFlow ?? true,
        usePerObjectPass: true,
        resolution: 1.0,
      });
    }

    // Update config if options provided
    if (options) {
      this.opticalFlowPass.setConfig({
        flowScale: options.flowScale ?? 1.0,
        forwardFlow: options.forwardFlow ?? true,
      });
    }

    // Set camera velocity data
    const cameraData = velocityBuffer.getCameraData();
    if (cameraData) {
      this.opticalFlowPass.setCameraData(cameraData);
    }

    // Set per-object velocities
    this.opticalFlowPass.setObjectVelocities(velocityBuffer.getVelocityMap());

    // Render the optical flow pass
    this.opticalFlowPass.render(this.renderer, scene, camera, velocityBuffer);

    // Read back the flow data
    const flowRGBA = this.opticalFlowPass.readFlowData(this.renderer);

    // Extract just the 2-channel flow (R, G) from RGBA
    const flow = new Float32Array(width * height * 2);
    for (let i = 0; i < width * height; i++) {
      flow[i * 2] = flowRGBA[i * 4];       // dx
      flow[i * 2 + 1] = flowRGBA[i * 4 + 1]; // dy
    }

    return flow;
  }

  /**
   * Get the internal VelocityBuffer for external frame tracking.
   * Use this to update transforms between frames.
   */
  getVelocityBuffer(): VelocityBuffer {
    return this.velocityBuffer;
  }

  /**
   * Get the OpticalFlowPass (if created) for direct access.
   */
  getOpticalFlowPass(): OpticalFlowPass | null {
    return this.opticalFlowPass;
  }

  /**
   * Export a pass as EXR-encoded data.
   *
   * Two calling conventions:
   *
   * 1. Convenience — pass name only (uses last render result):
   *    `exportToEXR('depth')` — encodes depth from the most recent render().
   *    Supported pass names: 'depth', 'normal', 'flow', 'optical_flow'.
   *    Segmentation passes ('object_segmentation', etc.) throw because they
   *    use integer IDs and should be exported as PNG.
   *
   * 2. Explicit — provide raw data:
   *    `exportToEXR('depth', data, width, height, 1)`
   *    `exportToEXR('flow', data, width, height, 2)`
   *
   * @param passName - Channel identifier (e.g. 'depth', 'flow', 'normal', 'optical_flow')
   * @param data     - Float32Array of pixel data (row-major, channels interleaved).
   *                   If omitted, reads from the last render result.
   * @param width    - Image width in pixels (required if data is provided)
   * @param height   - Image height in pixels (required if data is provided)
   * @param channels - Number of channels: 1 (depth), 2 (flow), 3 (normal/RGB), or 4 (RGBA).
   *                   Defaults to 1. Ignored when using convenience form.
   * @returns ArrayBuffer containing the EXR file bytes
   * @throws Error if convenience form is used without a prior render, or for segmentation passes
   */
  exportToEXR(
    passName: string,
    data?: Float32Array,
    width?: number,
    height?: number,
    channels?: number,
  ): ArrayBuffer {
    // Convenience form: encode from last render result
    if (data === undefined) {
      if (!this.lastResult) {
        throw new Error(`exportToEXR('${passName}'): no render result available. Call render() first.`);
      }
      return GroundTruthRenderer.passToEXR(passName, this.lastResult);
    }

    // Explicit form
    const w = width ?? this.config.width;
    const h = height ?? this.config.height;
    const ch = channels ?? 1;
    const channelNames = ch === 1 ? ['Y'] : ch === 2 ? ['R', 'G'] : ch === 3 ? ['R', 'G', 'B'] : ['R', 'G', 'B', 'A'];
    return encodeEXR(data, w, h, channelNames);
  }

  /**
   * Export optical flow as EXR-encoded data (floating-point precision).
   *
   * Produces a proper 2-channel (R, G) EXR file containing the flow vectors.
   *
   * @param result - The GT render result containing opticalFlow data
   * @returns ArrayBuffer with EXR-encoded flow data, or null if no flow data
   */
  static flowToEXR(result: GTRenderResult): ArrayBuffer | null {
    if (!result.opticalFlow) return null;

    const { width, height, opticalFlow } = result;
    return encodeEXR(opticalFlow, width, height, ['R', 'G']);
  }

  /**
   * Export depth as EXR-encoded data (32-bit float, single-channel).
   *
   * @param result - The GT render result containing depth data
   * @returns ArrayBuffer with EXR-encoded depth data, or null if no depth data
   */
  static depthToEXR(result: GTRenderResult): ArrayBuffer | null {
    if (!result.depth) return null;
    return encodeEXR(result.depth, result.width, result.height, ['Y']);
  }

  /**
   * Export a named pass from a GTRenderResult as EXR-encoded data.
   *
   * Supported pass names: 'depth', 'normal', 'flow', 'optical_flow'.
   * Segmentation passes are not supported (use PNG instead).
   *
   * @param passName - Channel identifier
   * @param result   - The GT render result
   * @returns ArrayBuffer with EXR-encoded data
   * @throws Error for unsupported pass names or missing data
   */
  static passToEXR(passName: string, result: GTRenderResult): ArrayBuffer {
    switch (passName) {
      case 'depth':
        if (!result.depth) throw new Error("passToEXR('depth'): no depth data in result");
        return encodeEXR(result.depth, result.width, result.height, ['Y']);

      case 'normal':
        if (!result.normal) throw new Error("passToEXR('normal'): no normal data in result");
        return encodeEXR(result.normal, result.width, result.height, ['R', 'G', 'B']);

      case 'flow':
        if (!result.flow) throw new Error("passToEXR('flow'): no flow data in result");
        return encodeEXR(result.flow, result.width, result.height, ['R', 'G']);

      case 'optical_flow':
        if (!result.opticalFlow) throw new Error("passToEXR('optical_flow'): no opticalFlow data in result");
        return encodeEXR(result.opticalFlow, result.width, result.height, ['R', 'G']);

      default:
        if (passName.endsWith('_segmentation')) {
          throw new Error(
            `passToEXR('${passName}'): segmentation masks use integer IDs — export as PNG instead`,
          );
        }
        throw new Error(`passToEXR('${passName}'): unknown pass name`);
    }
  }

  // -----------------------------------------------------------------------
  // Render Target Read Helpers
  // -----------------------------------------------------------------------

  private readRenderTarget(
    mrt: any,
    index: number,
    width: number,
    height: number,
  ): Float32Array {
    const buffer = new Float32Array(width * height * 4);

    // For MRT, read the specific texture
    if (mrt.texture && Array.isArray(mrt.texture)) {
      const rt = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      });

      // Copy from MRT target to single target
      const copyMat = new THREE.MeshBasicMaterial({
        map: mrt.texture[index],
        depthWrite: false,
        depthTest: false,
      });
      const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat);
      const copyScene = new THREE.Scene();
      copyScene.add(copyQuad);
      const copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      this.renderer.setRenderTarget(rt);
      this.renderer.render(copyScene, copyCam);
      this.renderer.setRenderTarget(null);

      this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, buffer);

      copyMat.dispose();
      copyQuad.geometry.dispose();
      rt.dispose();
    }

    return buffer;
  }

  private readRenderTargetUint8(
    mrt: any,
    index: number,
    width: number,
    height: number,
  ): Uint8Array {
    const floatData = this.readRenderTarget(mrt, index, width, height);
    const result = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      // Decode: id = R + G * 256
      const r = Math.round(floatData[i * 4] * 255);
      const g = Math.round(floatData[i * 4 + 1] * 255);
      result[i] = Math.min(255, r + g * 256);
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------

  getConfig(): GTRenderConfig {
    return { ...this.config };
  }

  isMRTSupported(): boolean {
    return this.mrtSupported;
  }

  updateConfig(partial: Partial<GTRenderConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /** Convert a GT result to downloadable PNGs (using createCanvas) */
  static resultToPNGs(result: GTRenderResult): Map<string, string> {
    const pngs = new Map<string, string>();
    const { width, height } = result;

    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Depth → grayscale PNG
    if (result.depth) {
      const imgData = ctx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const v = Math.min(255, Math.max(0, Math.floor(result.depth[i] * 2.55)));
        imgData.data[i * 4] = v;
        imgData.data[i * 4 + 1] = v;
        imgData.data[i * 4 + 2] = v;
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      pngs.set('depth', canvas.toDataURL('image/png'));
    }

    // Normal → RGB PNG
    if (result.normal) {
      const imgData = ctx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        imgData.data[i * 4] = Math.floor(Math.max(0, Math.min(1, result.normal[i * 3])) * 255);
        imgData.data[i * 4 + 1] = Math.floor(Math.max(0, Math.min(1, result.normal[i * 3 + 1])) * 255);
        imgData.data[i * 4 + 2] = Math.floor(Math.max(0, Math.min(1, result.normal[i * 3 + 2])) * 255);
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      pngs.set('normal', canvas.toDataURL('image/png'));
    }

    // Object Segmentation → colored PNG
    if (result.objectSegmentation) {
      const imgData = ctx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const id = result.objectSegmentation[i];
        // Generate deterministic color from ID
        const h = (id * 137.508) % 360;
        const rgb = hslToRgb(h / 360, 0.8, 0.5);
        imgData.data[i * 4] = rgb[0];
        imgData.data[i * 4 + 1] = rgb[1];
        imgData.data[i * 4 + 2] = rgb[2];
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      pngs.set('object_segmentation', canvas.toDataURL('image/png'));
    }

    // Instance Segmentation → colored PNG
    if (result.instanceSegmentation) {
      const imgData = ctx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const id = result.instanceSegmentation[i];
        const h = (id * 137.508 + 60) % 360;
        const rgb = hslToRgb(h / 360, 0.7, 0.5);
        imgData.data[i * 4] = rgb[0];
        imgData.data[i * 4 + 1] = rgb[1];
        imgData.data[i * 4 + 2] = rgb[2];
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      pngs.set('instance_segmentation', canvas.toDataURL('image/png'));
    }

    // Material Segmentation → colored PNG
    if (result.materialSegmentation) {
      const imgData = ctx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const id = result.materialSegmentation[i];
        const h = (id * 137.508 + 120) % 360;
        const rgb = hslToRgb(h / 360, 0.6, 0.5);
        imgData.data[i * 4] = rgb[0];
        imgData.data[i * 4 + 1] = rgb[1];
        imgData.data[i * 4 + 2] = rgb[2];
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      pngs.set('material_segmentation', canvas.toDataURL('image/png'));
    }

    // Flow → HSV colorized PNG
    if (result.flow) {
      const imgData = ctx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const fx = result.flow[i * 2];
        const fy = result.flow[i * 2 + 1];
        const magnitude = Math.sqrt(fx * fx + fy * fy);
        const angle = Math.atan2(fy, fx);
        const h = (angle / Math.PI + 1) / 2;
        const rgb = hslToRgb(h, Math.min(1, magnitude * 10), 0.5);
        imgData.data[i * 4] = rgb[0];
        imgData.data[i * 4 + 1] = rgb[1];
        imgData.data[i * 4 + 2] = rgb[2];
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      pngs.set('flow', canvas.toDataURL('image/png'));
    }

    // Optical Flow → HSV colorized PNG (same colorization as flow)
    if (result.opticalFlow) {
      const imgData = ctx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const fx = result.opticalFlow[i * 2];
        const fy = result.opticalFlow[i * 2 + 1];
        const magnitude = Math.sqrt(fx * fx + fy * fy);
        const angle = Math.atan2(fy, fx);
        const h = (angle / Math.PI + 1) / 2;
        // Use higher sensitivity for optical flow (velocity-based)
        const rgb = hslToRgb(h, Math.min(1, magnitude * 20), 0.5);
        imgData.data[i * 4] = rgb[0];
        imgData.data[i * 4 + 1] = rgb[1];
        imgData.data[i * 4 + 2] = rgb[2];
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      pngs.set('optical_flow', canvas.toDataURL('image/png'));
    }

    return pngs;
  }

  // -----------------------------------------------------------------------
  // EXR Export Support
  // -----------------------------------------------------------------------

  /**
   * Export GT result with configurable per-channel format (PNG or EXR).
   *
   * Depth and flow passes default to EXR (float precision).
   * Segmentation masks default to PNG.
   *
   * The EXR encoder is a minimal JavaScript implementation that writes
   * scan-line based OpenEXR 2.0 files with 32-bit float pixel data.
   * For production use, a Python bridge approach can be used instead
   * (send raw pixel data to Python via sendFloatDataToPythonBridge).
   *
   * @param result - The GT render result
   * @param config - Export configuration with per-channel format overrides
   */
  static resultToExport(result: GTRenderResult, config: GTExportConfig = {}): GTExportResult {
    // Always generate PNGs (for visualization)
    const pngs = GroundTruthRenderer.resultToPNGs(result);

    // Build EXR float buffers
    const exrBuffers = new Map<string, { data: Float32Array; width: number; height: number; channels: number }>();

    // Depth → 1-channel float EXR
    if (result.depth) {
      exrBuffers.set('depth', {
        data: result.depth,
        width: result.width,
        height: result.height,
        channels: 1,
      });
    }

    // Normal → 3-channel float EXR
    if (result.normal) {
      exrBuffers.set('normal', {
        data: result.normal,
        width: result.width,
        height: result.height,
        channels: 3,
      });
    }

    // Flow → 2-channel float EXR
    if (result.flow) {
      exrBuffers.set('flow', {
        data: result.flow,
        width: result.width,
        height: result.height,
        channels: 2,
      });
    }

    // Optical flow → 2-channel float EXR
    if (result.opticalFlow) {
      exrBuffers.set('optical_flow', {
        data: result.opticalFlow,
        width: result.width,
        height: result.height,
        channels: 2,
      });
    }

    // Determine default format per channel
    const defaultFormats: Record<GTChannel, GTExportFormat> = {
      depth: 'exr',
      normal: 'exr',
      flow: 'exr',
      optical_flow: 'exr',
      object_segmentation: 'png',
      instance_segmentation: 'png',
      material_segmentation: 'png',
    };

    // Build serialized EXR files for channels that need EXR format
    const exrFiles = new Map<string, ArrayBuffer>();
    const formats = config.formats ?? {};

    for (const [channelName, bufferInfo] of exrBuffers) {
      const channel = channelName as GTChannel;
      const format = formats[channel] ?? defaultFormats[channel] ?? 'png';

      if (format === 'exr') {
        const channelNames =
          bufferInfo.channels === 1 ? ['Y'] :
          bufferInfo.channels === 2 ? ['R', 'G'] :
          bufferInfo.channels === 3 ? ['R', 'G', 'B'] :
          ['R', 'G', 'B', 'A'];
        const exrData = encodeEXR(
          bufferInfo.data,
          bufferInfo.width,
          bufferInfo.height,
          channelNames,
        );
        exrFiles.set(channelName, exrData);
      }
    }

    return { pngs, exrBuffers, exrFiles };
  }

  /**
   * Send raw float pixel data to a Python backend for high-quality EXR encoding.
   * Use this if the minimal JS EXR encoder doesn't meet requirements.
   *
   * The Python backend should receive: { channel, width, height, channels, data: base64 }
   * and use OpenEXR or OpenImageIO to write the file.
   *
   * @param channelName - Channel identifier (e.g., 'depth', 'flow')
   * @param data - Float32Array of pixel data
   * @param width - Image width
   * @param height - Image height
   * @param channels - Number of channels (1=grayscale, 2=flow, 3=RGB)
   * @returns A request object suitable for sending to the Python bridge
   */
  static preparePythonBridgePayload(
    channelName: string,
    data: Float32Array,
    width: number,
    height: number,
    channels: number,
  ): { channel: string; width: number; height: number; channels: number; dataBase64: string } {
    // Convert Float32Array to base64 for JSON transport
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const dataBase64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');

    return {
      channel: channelName,
      width,
      height,
      channels,
      dataBase64,
    };
  }
}

// ---------------------------------------------------------------------------
// HSL → RGB helper
// ---------------------------------------------------------------------------

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export default GroundTruthRenderer;
