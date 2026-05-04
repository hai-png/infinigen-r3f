/**
 * OpticalFlowPass — Screen-Space Optical Flow Ground Truth
 *
 * Renders per-fragment motion vectors (optical flow) by comparing
 * each object's current and previous frame transforms.
 *
 * Two rendering strategies are supported:
 *
 *   1. **Per-object shader pass** (default, high quality):
 *      Replaces each mesh's material with `GTOpticalFlowMaterial` and
 *      renders the scene directly. The vertex shader projects each vertex
 *      through both current and previous MVP matrices to compute the
 *      screen-space displacement per fragment.
 *
 *   2. **Position-buffer composite** (fallback):
 *      Renders world-space positions to two float render targets (current
 *      and previous frame), then composites the difference in a full-screen
 *      pass. Useful when per-object matrix injection is impractical.
 *
 * The output is a floating-point texture where:
 *   R = normalized horizontal flow
 *   G = normalized vertical flow
 *   B = 0
 *   A = 1
 *
 * @module rendering/postprocess
 */

import * as THREE from 'three';
import {
  GTOpticalFlowMaterial,
  COMPOSITE_VERTEX_SHADER,
  COMPOSITE_FLOW_FRAGMENT_SHADER,
  POSITION_ENCODE_VERTEX_SHADER,
  POSITION_ENCODE_FRAGMENT_SHADER,
} from '../shaders/OpticalFlowShader';
import type { VelocityBuffer, CameraVelocityData } from '../VelocityBuffer';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface OpticalFlowConfig {
  /** Flow scale multiplier (default 1.0 — no amplification) */
  flowScale: number;
  /** Render forward flow (true) or backward flow (false) */
  forwardFlow: boolean;
  /** Use the per-object shader pass (true) or position-buffer composite (false) */
  usePerObjectPass: boolean;
  /** Resolution scale for internal render targets (default 1.0) */
  resolution: number;
}

const DEFAULT_OPTICAL_FLOW_CONFIG: OpticalFlowConfig = {
  flowScale: 1.0,
  forwardFlow: true,
  usePerObjectPass: true,
  resolution: 1.0,
};

// ---------------------------------------------------------------------------
// Shared geometry
// ---------------------------------------------------------------------------

const _quadGeom = new THREE.PlaneGeometry(2, 2);

// ---------------------------------------------------------------------------
// OpticalFlowPass
// ---------------------------------------------------------------------------

export class OpticalFlowPass {
  readonly config: OpticalFlowConfig;

  // Render targets
  private flowRT: THREE.WebGLRenderTarget;
  private currPositionRT: THREE.WebGLRenderTarget;
  private prevPositionRT: THREE.WebGLRenderTarget;

  // Materials
  private flowMaterial: GTOpticalFlowMaterial;
  private positionEncodeMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;

  // Full-screen quad helpers
  private quad: THREE.Mesh;
  private _quadScene: THREE.Scene | null = null;
  private _positionScene: THREE.Scene | null = null;

  // Cached camera data for the composite path
  private prevProjView: THREE.Matrix4 = new THREE.Matrix4();
  private currInvProjView: THREE.Matrix4 = new THREE.Matrix4();

  constructor(
    width: number = 1920,
    height: number = 1080,
    config: Partial<OpticalFlowConfig> = {},
  ) {
    this.config = { ...DEFAULT_OPTICAL_FLOW_CONFIG, ...config };

    const w = Math.max(1, Math.floor(width * this.config.resolution));
    const h = Math.max(1, Math.floor(height * this.config.resolution));

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    };

    this.flowRT = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.currPositionRT = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.prevPositionRT = new THREE.WebGLRenderTarget(w, h, rtOpts);

    // Per-object optical flow material
    this.flowMaterial = new GTOpticalFlowMaterial(
      w,
      h,
      this.config.flowScale,
      this.config.forwardFlow,
    );

    // Position encode material (for composite path)
    this.positionEncodeMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: POSITION_ENCODE_VERTEX_SHADER,
      fragmentShader: POSITION_ENCODE_FRAGMENT_SHADER,
      depthWrite: true,
      depthTest: true,
    });

    // Composite material (position-buffer path)
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tCurrentPosition: { value: null },
        tPreviousPosition: { value: null },
        tDepth: { value: null },
        uResolution: { value: new THREE.Vector2(w, h) },
        uFlowScale: { value: this.config.flowScale },
        uForwardFlow: { value: this.config.forwardFlow },
        uCurrInvProjView: { value: new THREE.Matrix4() },
        uPrevProjView: { value: new THREE.Matrix4() },
      },
      vertexShader: COMPOSITE_VERTEX_SHADER,
      fragmentShader: COMPOSITE_FLOW_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    this.quad = new THREE.Mesh(_quadGeom, this.compositeMaterial);
    this.quad.frustumCulled = false;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Register per-object velocity data from a VelocityBuffer.
   * This updates the prevModelMatrix uniform on each mesh's optical flow material.
   */
  setObjectVelocities(
    velocities: Map<THREE.Object3D, { prevMatrix: THREE.Matrix4; currMatrix: THREE.Matrix4 }>,
  ): void {
    // Store for use during render — materials are set up per-mesh in render()
    this._pendingVelocities = velocities;
  }

  /**
   * Set camera velocity data for separating object vs camera motion
   * in the composite path.
   */
  setCameraData(cameraData: CameraVelocityData): void {
    // Previous frame: projection × view
    this.prevProjView.multiplyMatrices(
      cameraData.prevProjectionMatrix,
      cameraData.prevMatrixWorldInverse,
    );
    // Current frame: (projection × view)⁻¹
    this.currInvProjView.copy(this.prevProjView).invert();
    // Actually compute from current matrices:
    const currProjView = new THREE.Matrix4().multiplyMatrices(
      cameraData.currProjectionMatrix,
      cameraData.currMatrixWorldInverse,
    );
    this.currInvProjView.copy(currProjView).invert();
  }

  /**
   * Render the optical flow pass.
   *
   * @param renderer  - The WebGL renderer
   * @param scene     - The scene to render
   * @param camera    - The current frame's camera
   * @param velocityBuffer - Optional VelocityBuffer for automatic matrix lookup
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    velocityBuffer?: VelocityBuffer,
  ): void {
    if (this.config.usePerObjectPass) {
      this.renderPerObjectPass(renderer, scene, camera, velocityBuffer);
    } else {
      this.renderCompositePass(renderer, scene, camera, velocityBuffer);
    }
  }

  /**
   * Get the flow texture (the result of the most recent render).
   */
  getFlowTexture(): THREE.Texture {
    return this.flowRT.texture;
  }

  /**
   * Get the flow render target.
   */
  getFlowRenderTarget(): THREE.WebGLRenderTarget {
    return this.flowRT;
  }

  /**
   * Read back flow data as a Float32Array.
   * Each pixel has 4 components: R=flow_x, G=flow_y, B=0, A=1.
   */
  readFlowData(renderer: THREE.WebGLRenderer): Float32Array {
    const { width, height } = this.flowRT;
    const pixels = new Float32Array(width * height * 4);
    renderer.readRenderTargetPixels(this.flowRT, 0, 0, width, height, pixels);
    return pixels;
  }

  /**
   * Get a DataTexture containing the flow data.
   * Useful for downstream consumers that need a Three.js texture.
   */
  getFlowDataTexture(renderer: THREE.WebGLRenderer): THREE.DataTexture {
    const pixels = this.readFlowData(renderer);
    const { width, height } = this.flowRT;
    const dataTex = new THREE.DataTexture(
      pixels,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    dataTex.needsUpdate = true;
    return dataTex;
  }

  /**
   * Update configuration at runtime.
   */
  setConfig(partial: Partial<OpticalFlowConfig>): void {
    Object.assign(this.config, partial);
    this.flowMaterial.setFlowScale(this.config.flowScale);
    this.flowMaterial.setForwardFlow(this.config.forwardFlow);
    this.compositeMaterial.uniforms.uFlowScale.value = this.config.flowScale;
    this.compositeMaterial.uniforms.uForwardFlow.value = this.config.forwardFlow;
  }

  /**
   * Resize internal render targets.
   */
  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width * this.config.resolution));
    const h = Math.max(1, Math.floor(height * this.config.resolution));
    this.flowRT.setSize(w, h);
    this.currPositionRT.setSize(w, h);
    this.prevPositionRT.setSize(w, h);
    this.flowMaterial.setResolution(w, h);
    this.compositeMaterial.uniforms.uResolution.value.set(w, h);
  }

  /**
   * Dispose of all GPU resources.
   */
  dispose(): void {
    this.flowRT.dispose();
    this.currPositionRT.dispose();
    this.prevPositionRT.dispose();
    this.flowMaterial.dispose();
    this.positionEncodeMaterial.dispose();
    this.compositeMaterial.dispose();
    _quadGeom.dispose();
  }

  // -----------------------------------------------------------------------
  // Per-Object Shader Pass
  // -----------------------------------------------------------------------

  private _pendingVelocities: Map<THREE.Object3D, { prevMatrix: THREE.Matrix4; currMatrix: THREE.Matrix4 }> | null = null;

  private renderPerObjectPass(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    velocityBuffer?: VelocityBuffer,
  ): void {
    const velocities = this._pendingVelocities;

    // Get camera data for prev view/proj matrices
    const prevViewMatrix = velocityBuffer?.getPrevViewMatrix() ?? camera.matrixWorldInverse;
    const prevProjMatrix = velocityBuffer?.getPrevProjectionMatrix() ??
      (camera as THREE.PerspectiveCamera).projectionMatrix;

    // Save original materials
    const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();

    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.visible) return;

      originalMaterials.set(mesh, mesh.material);

      // Create per-object flow material
      const flowMat = this.flowMaterial.clone() as GTOpticalFlowMaterial;

      // Set previous model matrix from velocity data
      let prevModelMatrix: THREE.Matrix4;
      if (velocities && velocities.has(mesh)) {
        prevModelMatrix = velocities.get(mesh)!.prevMatrix;
      } else if (velocityBuffer && velocityBuffer.hasObject(mesh)) {
        prevModelMatrix = velocityBuffer.getPrevMatrix(mesh);
      } else {
        // No previous data – use current matrix (zero flow)
        prevModelMatrix = mesh.matrixWorld;
      }

      flowMat.setPrevMatrices(prevModelMatrix, prevViewMatrix, prevProjMatrix);
      mesh.material = flowMat;
    });

    // Render to flow RT
    renderer.setRenderTarget(this.flowRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // Restore original materials
    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const original = originalMaterials.get(mesh);
      if (original) {
        mesh.material = original;
        // Dispose the cloned flow material
        const flowMat = mesh.material;
        if (flowMat !== original && flowMat instanceof THREE.ShaderMaterial) {
          flowMat.dispose();
        }
        mesh.material = original;
      }
    });
  }

  // -----------------------------------------------------------------------
  // Position-Buffer Composite Pass
  // -----------------------------------------------------------------------

  private renderCompositePass(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    velocityBuffer?: VelocityBuffer,
  ): void {
    // --- Step 1: Render current-frame world positions ---
    this.renderPositionBuffer(renderer, scene, camera, this.currPositionRT);

    // --- Step 2: Render previous-frame world positions ---
    // We need to render with previous-frame transforms
    this.renderPreviousPositionBuffer(renderer, scene, camera, velocityBuffer);

    // --- Step 3: Composite flow from position buffers ---
    this.compositeMaterial.uniforms.tCurrentPosition.value = this.currPositionRT.texture;
    this.compositeMaterial.uniforms.tPreviousPosition.value = this.prevPositionRT.texture;
    this.compositeMaterial.uniforms.tDepth.value = this.currPositionRT.texture; // Reuse position RT alpha
    this.compositeMaterial.uniforms.uCurrInvProjView.value.copy(this.currInvProjView);
    this.compositeMaterial.uniforms.uPrevProjView.value.copy(this.prevProjView);

    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.flowRT);
    renderer.clear();
    renderer.render(this.getQuadScene(), this.getQuadCamera());
    renderer.setRenderTarget(null);
  }

  private renderPositionBuffer(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    target: THREE.WebGLRenderTarget,
  ): void {
    const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();

    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.visible) return;
      originalMaterials.set(mesh, mesh.material);
      mesh.material = this.positionEncodeMaterial;
    });

    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // Restore
    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const original = originalMaterials.get(mesh);
      if (original) mesh.material = original;
    });
  }

  private renderPreviousPositionBuffer(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    velocityBuffer?: VelocityBuffer,
  ): void {
    const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
    const originalMatrices = new Map<THREE.Object3D, THREE.Matrix4>();

    // Get previous camera matrices
    const prevViewMatrix = velocityBuffer?.getPrevViewMatrix() ?? camera.matrixWorldInverse;
    const prevProjMatrix = velocityBuffer?.getPrevProjectionMatrix() ??
      (camera as THREE.PerspectiveCamera).projectionMatrix;

    // Create a custom position material that uses previous-frame transforms
    const prevPositionMat = new THREE.ShaderMaterial({
      uniforms: {
        prevModelMatrix: { value: new THREE.Matrix4() },
        prevViewMatrix: { value: prevViewMatrix.clone() },
        prevProjectionMatrix: { value: prevProjMatrix.clone() },
      },
      vertexShader: `
        uniform mat4 prevModelMatrix;
        uniform mat4 prevViewMatrix;
        uniform mat4 prevProjectionMatrix;

        varying vec3 vWorldPosition;
        varying float vDepth;

        void main() {
          // Use previous frame model matrix for world position
          vec4 worldPos = prevModelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;

          vec4 viewPos = prevViewMatrix * worldPos;
          vDepth = -viewPos.z;

          gl_Position = prevProjectionMatrix * viewPos;
        }
      `,
      fragmentShader: POSITION_ENCODE_FRAGMENT_SHADER,
      depthWrite: true,
      depthTest: true,
    });

    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.visible) return;

      originalMaterials.set(mesh, mesh.material);
      originalMatrices.set(mesh, mesh.matrixWorld.clone());

      // Create a per-object clone with the correct previous model matrix
      const mat = prevPositionMat.clone();
      let prevModelMatrix: THREE.Matrix4;
      if (velocityBuffer && velocityBuffer.hasObject(mesh)) {
        prevModelMatrix = velocityBuffer.getPrevMatrix(mesh);
      } else if (this._pendingVelocities && this._pendingVelocities.has(mesh)) {
        prevModelMatrix = this._pendingVelocities.get(mesh)!.prevMatrix;
      } else {
        prevModelMatrix = mesh.matrixWorld;
      }
      mat.uniforms.prevModelMatrix.value = prevModelMatrix.clone();

      mesh.material = mat;
    });

    // Use a camera configured with previous frame matrices
    const prevCamera = camera.clone();
    prevCamera.matrixWorldInverse.copy(prevViewMatrix);
    prevCamera.matrixWorld.copy(prevViewMatrix.clone().invert());
    if (camera instanceof THREE.PerspectiveCamera) {
      (prevCamera as THREE.PerspectiveCamera).projectionMatrix.copy(prevProjMatrix);
    }

    renderer.setRenderTarget(this.prevPositionRT);
    renderer.clear();
    renderer.render(scene, prevCamera);
    renderer.setRenderTarget(null);

    // Restore materials and dispose clones
    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const original = originalMaterials.get(mesh);
      if (original) {
        const current = mesh.material;
        mesh.material = original;
        if (current !== original && current instanceof THREE.ShaderMaterial) {
          current.dispose();
        }
      }
    });

    prevPositionMat.dispose();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private _quadCamera: THREE.OrthographicCamera | null = null;

  private getQuadScene(): THREE.Scene {
    if (!this._quadScene) {
      this._quadScene = new THREE.Scene();
      this._quadScene.add(this.quad);
    }
    return this._quadScene;
  }

  private getQuadCamera(): THREE.Camera {
    if (!this._quadCamera) {
      this._quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    return this._quadCamera;
  }
}

export default OpticalFlowPass;
