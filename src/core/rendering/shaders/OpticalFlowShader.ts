/**
 * Optical Flow Shader for Infinigen R3F
 *
 * Implements ground truth optical flow rendering using per-object motion vectors.
 * Computes screen-space displacement between the previous and current frame
 * for each fragment, outputting normalized 2D motion vectors in the RG channels.
 *
 * Supports both forward flow (where did this pixel come from?) and
 * backward flow (where will this pixel go?).
 *
 * Based on: infinigen/core/rendering/render.py (optical flow ground truth)
 *
 * @module shaders
 */

import {
  ShaderMaterial,
  Matrix4,
  Vector2,
  UniformsUtils,
} from 'three';

// ---------------------------------------------------------------------------
// Shader source
// ---------------------------------------------------------------------------

/**
 * Vertex shader for optical flow.
 *
 * Transforms the vertex position with both the current and previous
 * model-view-projection matrices and passes the screen-space difference
 * as a varying to the fragment shader.
 *
 * Required uniforms:
 *   - prevModelMatrix : mat4  – previous frame model matrix
 *   - prevViewMatrix  : mat4  – previous frame view (camera) matrix
 *   - prevProjectionMatrix : mat4 – previous frame projection matrix
 *
 * The built-in `modelMatrix`, `modelViewMatrix`, and `projectionMatrix`
 * are automatically provided by Three.js for the current frame.
 */
export const OPTICAL_FLOW_VERTEX_SHADER = /* glsl */ `
  uniform mat4 prevModelMatrix;
  uniform mat4 prevViewMatrix;
  uniform mat4 prevProjectionMatrix;

  varying vec2 vMotionVector;
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vUv = uv;

    // Current frame clip-space position
    vec4 currClipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 currScreenPos = currClipPos.xy / currClipPos.w;

    // Previous frame clip-space position
    vec4 prevWorldPos  = prevModelMatrix * vec4(position, 1.0);
    vec4 prevViewPos   = prevViewMatrix * prevWorldPos;
    vec4 prevClipPos   = prevProjectionMatrix * prevViewPos;
    vec2 prevScreenPos = prevClipPos.xy / prevClipPos.w;

    // Normalized motion vector in [-1, 1] NDC range
    vMotionVector = currScreenPos - prevScreenPos;

    // View-space depth for the current fragment (useful for filtering)
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPos.z;

    gl_Position = currClipPos;
  }
`;

/**
 * Fragment shader for optical flow.
 *
 * Outputs the normalized 2D motion vector as RG channels:
 *   R = motion_x / width  (normalized to [-0.5, 0.5] NDC then to [0,1] for storage)
 *   G = motion_y / height
 *
 * The flow can optionally be scaled for visualization or exported at
 * floating-point precision via the `uFlowScale` uniform.
 *
 * Uniforms:
 *   - uResolution  : vec2  – render target width / height
 *   - uFlowScale   : float – multiplier for flow magnitude (default 1.0)
 *   - uForwardFlow : bool  – true = forward flow, false = backward flow
 */
export const OPTICAL_FLOW_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec2  uResolution;
  uniform float uFlowScale;
  uniform bool  uForwardFlow;

  varying vec2  vMotionVector;
  varying vec2  vUv;
  varying float vDepth;

  void main() {
    vec2 flow = vMotionVector;

    // For backward flow, negate the direction
    if (!uForwardFlow) {
      flow = -flow;
    }

    // Convert NDC motion [-2,2] to pixel motion, then normalize by resolution.
    // NDC range is [-1,1] so screen-space displacement in NDC * 0.5 = [0,1] range.
    // We scale by resolution to get pixel-accurate flow, then normalize for storage.
    flow = flow * 0.5 * uFlowScale;

    // Encode: R = horizontal flow, G = vertical flow
    // Values are stored as-is for floating-point render targets (EXR).
    // For 8-bit targets, add 0.5 to shift from [-0.5,0.5] to [0,1].
    gl_FragColor = vec4(flow, 0.0, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Composite shader – computes flow from two position textures
// ---------------------------------------------------------------------------

/**
 * Full-screen composite vertex shader (used by OpticalFlowPass).
 */
export const COMPOSITE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Full-screen composite fragment shader that computes optical flow
 * from a current-frame and previous-frame screen-space position buffer.
 */
export const COMPOSITE_FLOW_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D tCurrentPosition;
  uniform sampler2D tPreviousPosition;
  uniform sampler2D tDepth;
  uniform vec2  uResolution;
  uniform float uFlowScale;
  uniform bool  uForwardFlow;
  uniform mat4  uCurrInvProjView;
  uniform mat4  uPrevProjView;

  varying vec2 vUv;

  void main() {
    float depth = texture2D(tDepth, vUv).r;

    // Sky pixels → zero flow
    if (depth >= 1.0 || depth <= 0.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    // Read current screen-space position
    vec4 currPosFull = texture2D(tCurrentPosition, vUv);
    vec3 currWorldPos = currPosFull.rgb;

    // Read previous screen-space position at the same UV
    vec4 prevPosFull = texture2D(tPreviousPosition, vUv);
    vec3 prevWorldPos = prevPosFull.rgb;

    // Compute flow as the difference in screen space
    // Project current world pos to previous screen space
    vec4 prevClipPos = uPrevProjView * vec4(currWorldPos, 1.0);
    vec2 prevScreenPos = prevClipPos.xy / prevClipPos.w;

    // Current UV is already in screen space
    vec2 currScreenPos = vUv * 2.0 - 1.0;

    vec2 flow = currScreenPos - prevScreenPos;

    if (!uForwardFlow) {
      flow = -flow;
    }

    flow = flow * 0.5 * uFlowScale;

    gl_FragColor = vec4(flow, 0.0, 1.0);
  }
`;

/**
 * Simple position encoding fragment shader.
 * Renders world-space position to an RGBA float buffer for the
 * optical flow position pre-pass.
 */
export const POSITION_ENCODE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vWorldPosition;
  varying float vDepth;

  void main() {
    // Encode world position directly; alpha = linear depth
    gl_FragColor = vec4(vWorldPosition, vDepth);
  }
`;

/**
 * Vertex shader for the position pre-pass.
 * Outputs world-space position and view-space depth.
 */
export const POSITION_ENCODE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  varying float vDepth;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPos.z;

    gl_Position = projectionMatrix * mvPos;
  }
`;

// ---------------------------------------------------------------------------
// Material class
// ---------------------------------------------------------------------------

/**
 * Optical flow shader material.
 *
 * Attach this material to scene meshes to render per-fragment motion vectors.
 * The material requires the previous-frame model, view, and projection matrices
 * to be set before rendering.
 *
 * Usage:
 * ```ts
 * const mat = new GTOpticalFlowMaterial(width, height);
 * mat.setPrevMatrices(prevModelMatrix, prevViewMatrix, prevProjectionMatrix);
 * mesh.material = mat;
 * renderer.render(scene, camera);
 * ```
 */
export class GTOpticalFlowMaterial extends ShaderMaterial {
  constructor(
    width: number = 1920,
    height: number = 1080,
    flowScale: number = 1.0,
    forwardFlow: boolean = true,
  ) {
    super({
      uniforms: UniformsUtils.clone({
        prevModelMatrix: { value: new Matrix4() },
        prevViewMatrix: { value: new Matrix4() },
        prevProjectionMatrix: { value: new Matrix4() },
        uResolution: { value: new Vector2(width, height) },
        uFlowScale: { value: flowScale },
        uForwardFlow: { value: forwardFlow },
      }),
      vertexShader: OPTICAL_FLOW_VERTEX_SHADER,
      fragmentShader: OPTICAL_FLOW_FRAGMENT_SHADER,
      depthWrite: true,
      depthTest: true,
    });
  }

  // -----------------------------------------------------------------------
  // Convenience setters
  // -----------------------------------------------------------------------

  /**
   * Set all previous-frame matrices at once.
   */
  setPrevMatrices(
    prevModelMatrix: Matrix4,
    prevViewMatrix: Matrix4,
    prevProjectionMatrix: Matrix4,
  ): void {
    this.uniforms.prevModelMatrix.value.copy(prevModelMatrix);
    this.uniforms.prevViewMatrix.value.copy(prevViewMatrix);
    this.uniforms.prevProjectionMatrix.value.copy(prevProjectionMatrix);
  }

  /**
   * Set the previous-frame model matrix.
   */
  setPrevModelMatrix(m: Matrix4): void {
    this.uniforms.prevModelMatrix.value.copy(m);
  }

  /**
   * Set the previous-frame view matrix.
   */
  setPrevViewMatrix(m: Matrix4): void {
    this.uniforms.prevViewMatrix.value.copy(m);
  }

  /**
   * Set the previous-frame projection matrix.
   */
  setPrevProjectionMatrix(m: Matrix4): void {
    this.uniforms.prevProjectionMatrix.value.copy(m);
  }

  /**
   * Update the render resolution (affects flow normalization).
   */
  setResolution(width: number, height: number): void {
    this.uniforms.uResolution.value.set(width, height);
  }

  /**
   * Set the flow scale multiplier.
   * A value > 1 amplifies flow for visualization.
   */
  setFlowScale(scale: number): void {
    this.uniforms.uFlowScale.value = scale;
  }

  /**
   * Toggle between forward and backward optical flow.
   * Forward: where did the pixel come from?
   * Backward: where will the pixel go?
   */
  setForwardFlow(forward: boolean): void {
    this.uniforms.uForwardFlow.value = forward;
  }
}

/**
 * Position encode material for the two-pass optical flow pipeline.
 * Renders world-space positions to a float buffer.
 */
export class GTPositionEncodeMaterial extends ShaderMaterial {
  constructor() {
    super({
      uniforms: {},
      vertexShader: POSITION_ENCODE_VERTEX_SHADER,
      fragmentShader: POSITION_ENCODE_FRAGMENT_SHADER,
      depthWrite: true,
      depthTest: true,
    });
  }
}

/**
 * Default export – GTOpticalFlowMaterial, the primary class in this module.
 *
 * Previously this file exported a bag-of-symbols object as default.  All
 * symbols remain available as named exports.
 */
export default GTOpticalFlowMaterial;
