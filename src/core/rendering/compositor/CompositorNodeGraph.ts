/**
 * Compositor Node Graph System for Infinigen R3F
 *
 * Implements a Blender-style compositor node graph that chains render passes
 * for ground truth data generation. Matches the original Infinigen's Blender
 * compositor pipeline for post-processing, normalization, visualization, and
 * multi-pass output.
 *
 * Key components:
 * - CompositorNode: Abstract base class for all compositor operations
 * - TextureData: Unified render target wrapper with CPU readback support
 * - Concrete nodes: RenderLayer, Blur, Dilate, Composite, Threshold,
 *   ColorRamp, Normalize, Output
 * - CompositorGraph: Directed acyclic graph with topological sort evaluation
 * - CompositorBuilder: Fluent API for constructing graphs
 * - CompositorPresets: Factory methods for common ground truth pipelines
 *
 * Based on: infinigen/core/rendering/render.py (Blender compositor pipeline)
 *
 * @module compositor
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Enums & Type Literals
// ---------------------------------------------------------------------------

/**
 * Enum of all compositor node types.
 * Each type corresponds to a specific image processing operation.
 */
export enum CompositorNodeType {
  /** Captures a render pass (beauty, depth, normal, etc.) */
  RenderLayer = 'RenderLayer',
  /** Gaussian blur filter */
  Blur = 'Blur',
  /** Morphological dilation for masks */
  Dilate = 'Dilate',
  /** Alpha / additive / multiply / screen / overlay blending */
  Composite = 'Composite',
  /** Binary threshold for mask generation */
  Threshold = 'Threshold',
  /** Scalar-to-color mapping via color ramp */
  ColorRamp = 'ColorRamp',
  /** Normalize depth/flow to 0-1 range */
  Normalize = 'Normalize',
  /** Final output with format selection */
  Output = 'Output',
}

/**
 * Input socket type — either a texture or a scalar value.
 */
export type CompositorInputType = 'texture' | 'value';

/**
 * Output socket type — mirrors input types.
 */
export type CompositorOutputType = 'texture' | 'value';

/**
 * Blend mode for the CompositeNode.
 */
export type BlendMode = 'alpha' | 'additive' | 'multiply' | 'screen' | 'overlay';

/**
 * Interpolation mode for the ColorRampNode.
 */
export type ColorRampInterpolation = 'linear' | 'constant' | 'ease';

/**
 * Output format for the OutputNode.
 */
export type OutputFormat = 'png' | 'exr' | 'npy';

/**
 * Bit depth for the OutputNode.
 */
export type BitDepth = 8 | 16 | 32;

// ---------------------------------------------------------------------------
// ColorRampStop
// ---------------------------------------------------------------------------

/**
 * A single stop in a color ramp.
 * Maps a scalar position [0,1] to an RGB color.
 */
export interface ColorRampStop {
  /** Position along the ramp [0, 1] */
  position: number;
  /** Color at this position */
  color: THREE.Color;
}

// ---------------------------------------------------------------------------
// Connection Reference
// ---------------------------------------------------------------------------

/**
 * Reference to an output socket on another node.
 * Used to describe where an input connection originates.
 */
export interface ConnectionRef {
  /** ID of the source node */
  nodeId: string;
  /** Name of the output socket on the source node */
  outputName: string;
}

// ---------------------------------------------------------------------------
// CompositorInput
// ---------------------------------------------------------------------------

/**
 * An input socket on a compositor node.
 * May be connected to an output on another node, or use a default value.
 */
export class CompositorInput {
  /** Socket name (e.g. "image", "factor") */
  readonly name: string;
  /** Socket data type */
  readonly type: CompositorInputType;
  /** Default value when not connected (TextureData for texture, number for value) */
  readonly defaultValue: TextureData | number;
  /** Connection to a source node output, or null if unconnected */
  connectedFrom: ConnectionRef | null;

  constructor(
    name: string,
    type: CompositorInputType,
    defaultValue: TextureData | number,
    connectedFrom: ConnectionRef | null = null,
  ) {
    this.name = name;
    this.type = type;
    this.defaultValue = defaultValue;
    this.connectedFrom = connectedFrom;
  }
}

// ---------------------------------------------------------------------------
// CompositorOutput
// ---------------------------------------------------------------------------

/**
 * An output socket on a compositor node.
 * After evaluation, holds the computed TextureData or value.
 */
export class CompositorOutput {
  /** Socket name (e.g. "image", "mask") */
  readonly name: string;
  /** Socket data type */
  readonly type: CompositorOutputType;
  /** Computed value after evaluation */
  value: TextureData | number;

  constructor(name: string, type: CompositorOutputType, value: TextureData | number = 0) {
    this.name = name;
    this.type = type;
    this.value = value;
  }
}

// ---------------------------------------------------------------------------
// TextureData
// ---------------------------------------------------------------------------

/**
 * Unified render target wrapper for passing texture data between nodes.
 *
 * Wraps a THREE.Texture (from a render target or data texture) with
 * metadata about its format, dimensions, and channel count.
 * Supports GPU→CPU readback for export pipelines.
 */
export class TextureData {
  /** The underlying GPU texture */
  texture: THREE.Texture;
  /** Texture width in pixels */
  width: number;
  /** Texture height in pixels */
  height: number;
  /** Pixel format (e.g. THREE.RGBAFormat) */
  format: THREE.AnyPixelFormat;
  /** Data type (e.g. THREE.FloatType, THREE.UnsignedByteType) */
  type: THREE.TextureDataType;
  /** Number of channels (1, 2, 3, or 4) */
  channels: 1 | 2 | 3 | 4;
  /** CPU-side pixel data (populated by readPixels) */
  data?: Float32Array;
  /** Internal render target reference (for disposal) */
  private renderTarget?: THREE.WebGLRenderTarget;

  constructor(
    texture: THREE.Texture,
    width: number,
    height: number,
    format: THREE.AnyPixelFormat = THREE.RGBAFormat,
    type: THREE.TextureDataType = THREE.FloatType,
    channels: 1 | 2 | 3 | 4 = 4,
  ) {
    this.texture = texture;
    this.width = width;
    this.height = height;
    this.format = format;
    this.type = type;
    this.channels = channels;
  }

  /**
   * Create TextureData from an existing WebGLRenderTarget.
   * Stores a reference to the render target for later disposal.
   *
   * @param rt - The WebGL render target to wrap
   * @param channels - Number of channels in the target (default 4)
   * @returns A TextureData instance wrapping the render target's texture
   */
  static fromRenderTarget(rt: THREE.WebGLRenderTarget, channels: 1 | 2 | 3 | 4 = 4): TextureData {
    const td = new TextureData(
      rt.texture,
      rt.width,
      rt.height,
      rt.texture.format as THREE.AnyPixelFormat,
      rt.texture.type,
      channels,
    );
    td.renderTarget = rt;
    return td;
  }

  /**
   * Create TextureData from an existing DataTexture.
   *
   * @param dt - The data texture to wrap
   * @param channels - Number of channels (default 4)
   * @returns A TextureData instance wrapping the data texture
   */
  static fromDataTexture(dt: THREE.DataTexture, channels: 1 | 2 | 3 | 4 = 4): TextureData {
    const width = dt.image.width;
    const height = dt.image.height;
    const td = new TextureData(
      dt,
      width,
      height,
      dt.format as THREE.AnyPixelFormat,
      dt.type,
      channels,
    );
    // Data textures already have CPU-side data
    if (dt.image.data instanceof Float32Array) {
      td.data = dt.image.data;
    }
    return td;
  }

  /**
   * Create a new TextureData with a fresh render target.
   *
   * @param width - Texture width
   * @param height - Texture height
   * @param options - Optional configuration for the render target
   * @returns A TextureData instance backed by a new render target
   */
  static create(
    width: number,
    height: number,
    options?: {
      format?: THREE.AnyPixelFormat;
      type?: THREE.TextureDataType;
      channels?: 1 | 2 | 3 | 4;
      minFilter?: THREE.TextureFilter;
      magFilter?: THREE.MagnificationTextureFilter;
      wrapS?: THREE.Wrapping;
      wrapT?: THREE.Wrapping;
    },
  ): TextureData {
    const opts = options ?? {};
    const format = opts.format ?? THREE.RGBAFormat;
    const type = opts.type ?? THREE.FloatType;
    const channels = opts.channels ?? 4;

    const rt = new THREE.WebGLRenderTarget(width, height, {
      format: format as THREE.PixelFormat,
      type,
      minFilter: opts.minFilter ?? THREE.LinearFilter as THREE.MinificationTextureFilter,
      magFilter: opts.magFilter ?? THREE.LinearFilter,
      wrapS: opts.wrapS ?? THREE.ClampToEdgeWrapping,
      wrapT: opts.wrapT ?? THREE.ClampToEdgeWrapping,
    });

    return TextureData.fromRenderTarget(rt, channels);
  }

  /**
   * Read pixels from GPU to CPU.
   * Populates the `data` field with a Float32Array of pixel values.
   *
   * @param renderer - The WebGL renderer to use for readback
   * @param bounds - Optional sub-region [x, y, width, height] to read
   * @returns Float32Array with pixel data
   */
  readPixels(renderer: THREE.WebGLRenderer, bounds?: [number, number, number, number]): Float32Array {
    const [x, y, w, h] = bounds ?? [0, 0, this.width, this.height];
    const size = w * h * this.channels;
    const data = new Float32Array(size);

    // Save current render target
    const prevRT = renderer.getRenderTarget();

    if (this.renderTarget) {
      renderer.setRenderTarget(this.renderTarget);
    }

    const target = this.renderTarget ?? new THREE.WebGLRenderTarget(this.width, this.height);
    renderer.readRenderTargetPixels(
      target as THREE.WebGLRenderTarget<THREE.Texture>,
      x, y, w, h,
      data,
    );

    // Restore previous render target
    renderer.setRenderTarget(prevRT);

    this.data = data;
    return data;
  }

  /**
   * Get the internal render target, if any.
   */
  getRenderTarget(): THREE.WebGLRenderTarget | undefined {
    return this.renderTarget;
  }

  /**
   * Dispose GPU resources held by this TextureData.
   * Safe to call multiple times.
   */
  dispose(): void {
    if (this.renderTarget) {
      this.renderTarget.dispose();
      this.renderTarget = undefined as any;
    }
    this.texture.dispose();
    this.data = undefined;
  }
}

// ---------------------------------------------------------------------------
// CompositorNode (abstract base)
// ---------------------------------------------------------------------------

/**
 * Abstract base class for all compositor nodes.
 *
 * Each node has named input and output sockets. During evaluation,
 * the graph provides resolved input values, and the node produces
 * output values (typically TextureData instances).
 *
 * Subclasses must implement:
 * - `evaluate(inputs, renderer)` — perform the node's operation
 * - `dispose()` — clean up GPU resources
 */
export abstract class CompositorNode {
  /** Unique node identifier */
  readonly id: string;
  /** Node type discriminator */
  readonly type: CompositorNodeType;
  /** Named input sockets */
  inputs: Map<string, CompositorInput>;
  /** Named output sockets */
  outputs: Map<string, CompositorOutput>;

  constructor(id: string, type: CompositorNodeType) {
    this.id = id;
    this.type = type;
    this.inputs = new Map();
    this.outputs = new Map();
  }

  /**
   * Evaluate this node's operation given resolved input values.
   *
   * @param inputs - Map of input socket names to their resolved values
   * @param renderer - The WebGL renderer for GPU operations
   * @returns Map of output socket names to their computed values
   */
  abstract evaluate(
    inputs: Map<string, TextureData | number>,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData | number>;

  /**
   * Dispose GPU resources held by this node.
   */
  abstract dispose(): void;

  /**
   * Get the names of all input sockets.
   */
  getInputKeys(): string[] {
    return Array.from(this.inputs.keys());
  }

  /**
   * Get the names of all output sockets.
   */
  getOutputKeys(): string[] {
    return Array.from(this.outputs.keys());
  }

  /**
   * Helper to register an input socket.
   */
  protected addInput(name: string, type: CompositorInputType, defaultValue: TextureData | number): void {
    this.inputs.set(name, new CompositorInput(name, type, defaultValue));
  }

  /**
   * Helper to register an output socket.
   */
  protected addOutput(name: string, type: CompositorOutputType, defaultValue: TextureData | number = 0): void {
    this.outputs.set(name, new CompositorOutput(name, type, defaultValue));
  }
}

// ---------------------------------------------------------------------------
// RenderLayerNode
// ---------------------------------------------------------------------------

/**
 * Captures a render pass from the scene.
 *
 * Supports different layer types (beauty, depth, normal, segmentation, flow, etc.)
 * with optional material override for ground truth passes.
 *
 * Based on: infinigen/core/rendering/render.py (render_layer with overrideMaterial)
 */
export class RenderLayerNode extends CompositorNode {
  /** The render layer type (beauty, depth, normal, segmentation, flow, etc.) */
  layer: string;
  /** Optional material override for GT passes */
  overrideMaterial?: THREE.Material;
  /** Reference to the scene to render */
  private scene?: THREE.Scene;
  /** Reference to the camera to render with */
  private camera?: THREE.Camera;
  /** Internal render target for capturing the pass */
  private renderTarget?: THREE.WebGLRenderTarget;

  constructor(id: string, layer: string, overrideMaterial?: THREE.Material) {
    super(id, CompositorNodeType.RenderLayer);
    this.layer = layer;
    this.overrideMaterial = overrideMaterial;
    // RenderLayer nodes have no inputs — they produce output from the scene
    this.addOutput('image', 'texture');
  }

  /**
   * Set the scene and camera for rendering.
   * Must be called before evaluate().
   */
  setSceneAndCamera(scene: THREE.Scene, camera: THREE.Camera): void {
    this.scene = scene;
    this.camera = camera;
  }

  /**
   * Render the scene with the configured layer and material override.
   *
   * @param _inputs - Unused (RenderLayer has no inputs)
   * @param renderer - The WebGL renderer
   * @returns Map with "image" output containing the rendered texture
   */
  evaluate(
    _inputs: Map<string, TextureData | number>,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData | number> {
    if (!this.scene || !this.camera) {
      throw new Error(`RenderLayerNode "${this.id}": scene and camera must be set via setSceneAndCamera() before evaluate()`);
    }

    const width = renderer.domElement.width;
    const height = renderer.domElement.height;

    // Create or resize render target
    if (!this.renderTarget || this.renderTarget.width !== width || this.renderTarget.height !== height) {
      this.renderTarget?.dispose();
      const isFloat = this.layer === 'depth' || this.layer === 'float_depth' || this.layer === 'flow' || this.layer === 'normal';
      this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: isFloat ? THREE.FloatType : THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }

    // Apply material override if provided
    const originalOverride = this.scene.overrideMaterial;
    if (this.overrideMaterial) {
      this.scene.overrideMaterial = this.overrideMaterial;
    }

    // Render to target
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);

    // Restore original override
    this.scene.overrideMaterial = originalOverride;

    const textureData = TextureData.fromRenderTarget(this.renderTarget);
    const result = new Map<string, TextureData | number>();
    result.set('image', textureData);
    this.outputs.get('image')!.value = textureData;
    return result;
  }

  dispose(): void {
    this.renderTarget?.dispose();
    this.renderTarget = undefined;
  }
}

// ---------------------------------------------------------------------------
// BlurNode
// ---------------------------------------------------------------------------

/**
 * Gaussian blur compositor node.
 *
 * Implements separable two-pass Gaussian blur via ping-pong render targets.
 * Generates Gaussian kernel weights from sigma parameter.
 *
 * Based on: Blender's Blur node and infinigen's compositor blur passes.
 */
export class BlurNode extends CompositorNode {
  /** Blur radius in pixels */
  radius: number;
  /** Gaussian sigma (standard deviation) */
  sigma: number;
  /** Number of blur passes (each pass = horizontal + vertical) */
  passes: number;
  /** Internal horizontal blur material */
  private hBlurMaterial: THREE.ShaderMaterial;
  /** Internal vertical blur material */
  private vBlurMaterial: THREE.ShaderMaterial;
  /** Internal full-screen quad */
  private quad: THREE.Mesh;
  /** Internal scene for rendering */
  private scene: THREE.Scene;
  /** Internal camera for rendering */
  private camera: THREE.OrthographicCamera;
  /** Ping-pong render targets */
  private rtA?: THREE.WebGLRenderTarget;
  private rtB?: THREE.WebGLRenderTarget;

  constructor(id: string, radius: number = 5, sigma: number = -1, passes: number = 1) {
    super(id, CompositorNodeType.Blur);
    this.radius = radius;
    this.sigma = sigma > 0 ? sigma : radius * 0.25;
    this.passes = passes;

    this.addInput('image', 'texture', TextureData.create(1, 1));
    this.addOutput('image', 'texture');

    // Generate Gaussian kernel weights
    const kernel = this.generateKernel();
    const kernelWeights = kernel.map((w) => w.toFixed(8)).join(', ');
    const kernelSize = kernel.length;

    // Shared vertex shader for full-screen quad
    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // Horizontal blur fragment shader
    const hFragShader = /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      varying vec2 vUv;
      const int KERNEL_SIZE = ${kernelSize};
      const float kernelWeights[KERNEL_SIZE] = float[KERNEL_SIZE](${kernelWeights});

      void main() {
        vec4 color = vec4(0.0);
        float totalWeight = 0.0;
        float pixelSize = 1.0 / resolution.x;
        int halfKernel = KERNEL_SIZE / 2;

        for (int i = 0; i < KERNEL_SIZE; i++) {
          float offset = float(i - halfKernel) * pixelSize * ${radius.toFixed(1)};
          float weight = kernelWeights[i];
          color += texture2D(tDiffuse, vUv + vec2(offset, 0.0)) * weight;
          totalWeight += weight;
        }

        gl_FragColor = color / totalWeight;
      }
    `;

    // Vertical blur fragment shader
    const vFragShader = /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      varying vec2 vUv;
      const int KERNEL_SIZE = ${kernelSize};
      const float kernelWeights[KERNEL_SIZE] = float[KERNEL_SIZE](${kernelWeights});

      void main() {
        vec4 color = vec4(0.0);
        float totalWeight = 0.0;
        float pixelSize = 1.0 / resolution.y;
        int halfKernel = KERNEL_SIZE / 2;

        for (int i = 0; i < KERNEL_SIZE; i++) {
          float offset = float(i - halfKernel) * pixelSize * ${radius.toFixed(1)};
          float weight = kernelWeights[i];
          color += texture2D(tDiffuse, vUv + vec2(0.0, offset)) * weight;
          totalWeight += weight;
        }

        gl_FragColor = color / totalWeight;
      }
    `;

    this.hBlurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader,
      fragmentShader: hFragShader,
    });

    this.vBlurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader,
      fragmentShader: vFragShader,
    });

    // Create full-screen quad and scene
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.hBlurMaterial);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Generate 1D Gaussian kernel weights.
   * @returns Array of normalized weights
   */
  private generateKernel(): number[] {
    const halfSize = Math.max(3, Math.ceil(this.sigma * 3));
    const weights: number[] = [];
    let sum = 0;

    for (let i = -halfSize; i <= halfSize; i++) {
      const w = Math.exp(-(i * i) / (2 * this.sigma * this.sigma));
      weights.push(w);
      sum += w;
    }

    // Normalize
    return weights.map((w) => w / sum);
  }

  /**
   * Apply separable Gaussian blur to the input texture.
   */
  evaluate(
    inputs: Map<string, TextureData | number>,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData | number> {
    const input = inputs.get('image') as TextureData;
    if (!input) {
      throw new Error(`BlurNode "${this.id}": missing "image" input`);
    }

    const width = input.width;
    const height = input.height;

    // Create or resize ping-pong render targets
    if (!this.rtA || this.rtA.width !== width || this.rtA.height !== height) {
      this.rtA?.dispose();
      this.rtB?.dispose();
      this.rtA = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      this.rtB = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }

    // Set resolution uniforms
    this.hBlurMaterial.uniforms.resolution.value.set(width, height);
    this.vBlurMaterial.uniforms.resolution.value.set(width, height);

    // Perform blur passes (each pass = horizontal + vertical)
    let source: THREE.Texture = input.texture;

    for (let p = 0; p < this.passes; p++) {
      // Horizontal pass: source → rtA
      this.quad.material = this.hBlurMaterial;
      this.hBlurMaterial.uniforms.tDiffuse.value = source;
      renderer.setRenderTarget(this.rtA);
      renderer.render(this.scene, this.camera);

      // Vertical pass: rtA → rtB
      this.quad.material = this.vBlurMaterial;
      this.vBlurMaterial.uniforms.tDiffuse.value = this.rtA.texture;
      renderer.setRenderTarget(this.rtB);
      renderer.render(this.scene, this.camera);

      source = this.rtB.texture;
    }

    renderer.setRenderTarget(null);

    const result = TextureData.fromRenderTarget(this.rtB);
    const output = new Map<string, TextureData | number>();
    output.set('image', result);
    this.outputs.get('image')!.value = result;
    return output;
  }

  dispose(): void {
    this.hBlurMaterial.dispose();
    this.vBlurMaterial.dispose();
    this.quad.geometry.dispose();
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.rtA = undefined;
    this.rtB = undefined;
  }
}

// ---------------------------------------------------------------------------
// DilateNode
// ---------------------------------------------------------------------------

/**
 * Morphological dilation node for expanding bright regions in masks.
 *
 * Uses a max filter over a square kernel for the specified number of iterations.
 * Based on: Blender's Dilate/Erode node and Infinigen's mask processing.
 */
export class DilateNode extends CompositorNode {
  /** Dilation radius in pixels */
  radius: number;
  /** Number of dilation iterations */
  iterations: number;
  /** Internal dilation material */
  private dilateMaterial: THREE.ShaderMaterial;
  /** Full-screen quad and rendering infrastructure */
  private quad: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private rtA?: THREE.WebGLRenderTarget;
  private rtB?: THREE.WebGLRenderTarget;

  constructor(id: string, radius: number = 3, iterations: number = 1) {
    super(id, CompositorNodeType.Dilate);
    this.radius = radius;
    this.iterations = iterations;

    this.addInput('image', 'texture', TextureData.create(1, 1));
    this.addOutput('image', 'texture');

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      uniform float radius;
      varying vec2 vUv;

      void main() {
        vec4 maxColor = vec4(0.0);
        int r = int(radius);

        for (int x = -r; x <= r; x++) {
          for (int y = -r; y <= r; y++) {
            vec2 offset = vec2(float(x), float(y)) / resolution;
            vec4 sampleColor = texture2D(tDiffuse, vUv + offset);
            maxColor = max(maxColor, sampleColor);
          }
        }

        gl_FragColor = maxColor;
      }
    `;

    this.dilateMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        radius: { value: this.radius },
      },
      vertexShader,
      fragmentShader,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.dilateMaterial);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Apply morphological dilation.
   */
  evaluate(
    inputs: Map<string, TextureData | number>,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData | number> {
    const input = inputs.get('image') as TextureData;
    if (!input) {
      throw new Error(`DilateNode "${this.id}": missing "image" input`);
    }

    const width = input.width;
    const height = input.height;

    if (!this.rtA || this.rtA.width !== width || this.rtA.height !== height) {
      this.rtA?.dispose();
      this.rtB?.dispose();
      this.rtA = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      this.rtB = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }

    this.dilateMaterial.uniforms.resolution.value.set(width, height);
    this.dilateMaterial.uniforms.radius.value = this.radius;
    this.quad.material = this.dilateMaterial;

    let source: THREE.Texture = input.texture;

    for (let i = 0; i < this.iterations; i++) {
      const destRT = (i % 2 === 0) ? this.rtA : this.rtB;
      this.dilateMaterial.uniforms.tDiffuse.value = source;
      renderer.setRenderTarget(destRT);
      renderer.render(this.scene, this.camera);
      source = destRT.texture;
    }

    renderer.setRenderTarget(null);

    const finalRT = ((this.iterations - 1) % 2 === 0) ? this.rtA : this.rtB;
    const result = TextureData.fromRenderTarget(finalRT);
    const output = new Map<string, TextureData | number>();
    output.set('image', result);
    this.outputs.get('image')!.value = result;
    return output;
  }

  dispose(): void {
    this.dilateMaterial.dispose();
    this.quad.geometry.dispose();
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.rtA = undefined;
    this.rtB = undefined;
  }
}

// ---------------------------------------------------------------------------
// CompositeNode
// ---------------------------------------------------------------------------

/**
 * Alpha blending / additive / multiply / screen / overlay composite node.
 *
 * Takes two inputs (A and B) and blends them using the specified mode.
 * The blend factor controls the mix ratio (0 = all A, 1 = all B for alpha blend).
 *
 * Based on: Blender's Mix node and Alpha Over node.
 */
export class CompositeNode extends CompositorNode {
  /** Blend mode */
  blendMode: BlendMode;
  /** Blend factor (0-1 for alpha blend) */
  blendFactor: number;
  /** Internal composite material */
  private compositeMaterial: THREE.ShaderMaterial;
  /** Full-screen quad and rendering infrastructure */
  private quad: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderTarget?: THREE.WebGLRenderTarget;

  constructor(id: string, blendMode: BlendMode = 'alpha', blendFactor: number = 0.5) {
    super(id, CompositorNodeType.Composite);
    this.blendMode = blendMode;
    this.blendFactor = blendFactor;

    this.addInput('A', 'texture', TextureData.create(1, 1));
    this.addInput('B', 'texture', TextureData.create(1, 1));
    this.addOutput('image', 'texture');

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform sampler2D tDiffuseA;
      uniform sampler2D tDiffuseB;
      uniform float blendFactor;
      varying vec2 vUv;

      vec3 screenBlend(vec3 a, vec3 b) {
        return 1.0 - (1.0 - a) * (1.0 - b);
      }

      vec3 overlayBlend(vec3 a, vec3 b) {
        vec3 result;
        result.r = a.r < 0.5 ? 2.0 * a.r * b.r : 1.0 - 2.0 * (1.0 - a.r) * (1.0 - b.r);
        result.g = a.g < 0.5 ? 2.0 * a.g * b.g : 1.0 - 2.0 * (1.0 - a.g) * (1.0 - b.g);
        result.b = a.b < 0.5 ? 2.0 * a.b * b.b : 1.0 - 2.0 * (1.0 - a.b) * (1.0 - b.b);
        return result;
      }

      void main() {
        vec4 colorA = texture2D(tDiffuseA, vUv);
        vec4 colorB = texture2D(tDiffuseB, vUv);
        vec4 result;

        int mode = ${this.getBlendModeInt()};

        if (mode == 0) {
          // Alpha blend: B over A
          float alpha = blendFactor * colorB.a;
          result.rgb = colorA.rgb * (1.0 - alpha) + colorB.rgb * alpha;
          result.a = colorA.a * (1.0 - alpha) + colorB.a * alpha;
        } else if (mode == 1) {
          // Additive
          result.rgb = colorA.rgb + colorB.rgb * blendFactor;
          result.a = max(colorA.a, colorB.a);
        } else if (mode == 2) {
          // Multiply
          result.rgb = colorA.rgb * mix(vec3(1.0), colorB.rgb, blendFactor);
          result.a = colorA.a * colorB.a;
        } else if (mode == 3) {
          // Screen
          result.rgb = mix(colorA.rgb, screenBlend(colorA.rgb, colorB.rgb), blendFactor);
          result.a = max(colorA.a, colorB.a);
        } else {
          // Overlay
          result.rgb = mix(colorA.rgb, overlayBlend(colorA.rgb, colorB.rgb), blendFactor);
          result.a = max(colorA.a, colorB.a);
        }

        gl_FragColor = result;
      }
    `;

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuseA: { value: null },
        tDiffuseB: { value: null },
        blendFactor: { value: this.blendFactor },
      },
      vertexShader,
      fragmentShader,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.compositeMaterial);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Map blend mode enum to GLSL integer constant.
   */
  private getBlendModeInt(): string {
    switch (this.blendMode) {
      case 'alpha': return '0';
      case 'additive': return '1';
      case 'multiply': return '2';
      case 'screen': return '3';
      case 'overlay': return '4';
      default: return '0';
    }
  }

  /**
   * Blend two input textures using the configured blend mode.
   */
  evaluate(
    inputs: Map<string, TextureData | number>,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData | number> {
    const inputA = inputs.get('A') as TextureData;
    const inputB = inputs.get('B') as TextureData;

    if (!inputA || !inputB) {
      throw new Error(`CompositeNode "${this.id}": requires both "A" and "B" inputs`);
    }

    const width = Math.max(inputA.width, inputB.width);
    const height = Math.max(inputA.height, inputB.height);

    if (!this.renderTarget || this.renderTarget.width !== width || this.renderTarget.height !== height) {
      this.renderTarget?.dispose();
      this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }

    this.compositeMaterial.uniforms.tDiffuseA.value = inputA.texture;
    this.compositeMaterial.uniforms.tDiffuseB.value = inputB.texture;
    this.compositeMaterial.uniforms.blendFactor.value = this.blendFactor;

    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);

    const result = TextureData.fromRenderTarget(this.renderTarget);
    const output = new Map<string, TextureData | number>();
    output.set('image', result);
    this.outputs.get('image')!.value = result;
    return output;
  }

  dispose(): void {
    this.compositeMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderTarget?.dispose();
    this.renderTarget = undefined;
  }
}

// ---------------------------------------------------------------------------
// ThresholdNode
// ---------------------------------------------------------------------------

/**
 * Binary threshold node for mask generation.
 *
 * Converts a scalar or color input into a black/white mask based on a threshold value.
 * Optionally inverts the output.
 *
 * Based on: Blender's Threshold node and Infinigen's mask generation pipeline.
 */
export class ThresholdNode extends CompositorNode {
  /** Threshold value for the binary split */
  threshold: number;
  /** Whether to invert the output mask */
  invert: boolean;
  /** Internal threshold material */
  private thresholdMaterial: THREE.ShaderMaterial;
  /** Full-screen quad and rendering infrastructure */
  private quad: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderTarget?: THREE.WebGLRenderTarget;

  constructor(id: string, threshold: number = 0.5, invert: boolean = false) {
    super(id, CompositorNodeType.Threshold);
    this.threshold = threshold;
    this.invert = invert;

    this.addInput('image', 'texture', TextureData.create(1, 1));
    this.addOutput('image', 'texture');

    const invertStr = invert ? '1' : '0';

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float threshold;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        float mask = step(threshold, luminance);
        ${invertStr === '1' ? 'mask = 1.0 - mask;' : ''}
        gl_FragColor = vec4(vec3(mask), 1.0);
      }
    `;

    this.thresholdMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: this.threshold },
      },
      vertexShader,
      fragmentShader,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.thresholdMaterial);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Apply binary threshold to input.
   */
  evaluate(
    inputs: Map<string, TextureData | number>,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData | number> {
    const input = inputs.get('image') as TextureData;
    if (!input) {
      throw new Error(`ThresholdNode "${this.id}": missing "image" input`);
    }

    const width = input.width;
    const height = input.height;

    if (!this.renderTarget || this.renderTarget.width !== width || this.renderTarget.height !== height) {
      this.renderTarget?.dispose();
      this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }

    this.thresholdMaterial.uniforms.tDiffuse.value = input.texture;
    this.thresholdMaterial.uniforms.threshold.value = this.threshold;

    this.quad.material = this.thresholdMaterial;
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);

    const result = TextureData.fromRenderTarget(this.renderTarget);
    const output = new Map<string, TextureData | number>();
    output.set('image', result);
    this.outputs.get('image')!.value = result;
    return output;
  }

  dispose(): void {
    this.thresholdMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderTarget?.dispose();
    this.renderTarget = undefined;
  }
}

// ---------------------------------------------------------------------------
// ColorRampNode
// ---------------------------------------------------------------------------

/**
 * Scalar-to-color mapping via a color ramp.
 *
 * Takes a scalar input texture and maps each pixel's value through a
 * series of color stops with configurable interpolation.
 *
 * Based on: Blender's ColorRamp node used extensively in Infinigen's
 * compositor for visualization of depth, flow, and segmentation.
 */
export class ColorRampNode extends CompositorNode {
  /** Color ramp stops, sorted by position */
  stops: ColorRampStop[];
  /** Interpolation mode between stops */
  interpolation: ColorRampInterpolation;
  /** Internal color ramp material */
  private colorRampMaterial: THREE.ShaderMaterial;
  /** Full-screen quad and rendering infrastructure */
  private quad: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderTarget?: THREE.WebGLRenderTarget;

  constructor(id: string, stops: ColorRampStop[], interpolation: ColorRampInterpolation = 'linear') {
    super(id, CompositorNodeType.ColorRamp);
    this.stops = [...stops].sort((a, b) => a.position - b.position);
    this.interpolation = interpolation;

    this.addInput('fac', 'texture', TextureData.create(1, 1));
    this.addOutput('image', 'texture');

    // Build GLSL for color ramp
    const maxStops = 16;
    const numStops = Math.min(this.stops.length, maxStops);

    // Build uniforms for stop positions and colors
    const stopPositions: number[] = [];
    const stopColors: number[] = [];
    for (let i = 0; i < maxStops; i++) {
      if (i < numStops) {
        stopPositions.push(this.stops[i].position);
        stopColors.push(this.stops[i].color.r, this.stops[i].color.g, this.stops[i].color.b);
      } else {
        stopPositions.push(1.0);
        stopColors.push(1.0, 1.0, 1.0);
      }
    }

    const interpCode = this.getInterpGLSL();

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float stopPositions[${maxStops}];
      uniform vec3 stopColors[${maxStops}];
      uniform int numStops;
      varying vec2 vUv;

      ${interpCode}

      void main() {
        vec4 inputValue = texture2D(tDiffuse, vUv);
        float fac = inputValue.r; // Use red channel as factor
        fac = clamp(fac, 0.0, 1.0);
        vec3 color = evaluateRamp(fac);
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    this.colorRampMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        stopPositions: { value: stopPositions },
        stopColors: { value: stopColors },
        numStops: { value: numStops },
      },
      vertexShader,
      fragmentShader,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.colorRampMaterial);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Generate GLSL code for the color ramp evaluation function.
   */
  private getInterpGLSL(): string {
    switch (this.interpolation) {
      case 'constant':
        return `
          vec3 evaluateRamp(float fac) {
            for (int i = numStops - 1; i >= 0; i--) {
              if (fac >= stopPositions[i]) return stopColors[i];
            }
            return stopColors[0];
          }
        `;
      case 'ease':
        return `
          vec3 evaluateRamp(float fac) {
            if (fac <= stopPositions[0]) return stopColors[0];
            if (fac >= stopPositions[numStops - 1]) return stopColors[numStops - 1];
            for (int i = 0; i < numStops - 1; i++) {
              if (fac >= stopPositions[i] && fac <= stopPositions[i + 1]) {
                float t = (fac - stopPositions[i]) / (stopPositions[i + 1] - stopPositions[i]);
                t = t * t * (3.0 - 2.0 * t); // smoothstep
                return mix(stopColors[i], stopColors[i + 1], t);
              }
            }
            return stopColors[numStops - 1];
          }
        `;
      case 'linear':
      default:
        return `
          vec3 evaluateRamp(float fac) {
            if (fac <= stopPositions[0]) return stopColors[0];
            if (fac >= stopPositions[numStops - 1]) return stopColors[numStops - 1];
            for (int i = 0; i < numStops - 1; i++) {
              if (fac >= stopPositions[i] && fac <= stopPositions[i + 1]) {
                float t = (fac - stopPositions[i]) / (stopPositions[i + 1] - stopPositions[i]);
                return mix(stopColors[i], stopColors[i + 1], t);
              }
            }
            return stopColors[numStops - 1];
          }
        `;
    }
  }

  /**
   * Map scalar input to color via the color ramp.
   */
  evaluate(
    inputs: Map<string, TextureData | number>,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData | number> {
    const input = inputs.get('fac') as TextureData;
    if (!input) {
      throw new Error(`ColorRampNode "${this.id}": missing "fac" input`);
    }

    const width = input.width;
    const height = input.height;

    if (!this.renderTarget || this.renderTarget.width !== width || this.renderTarget.height !== height) {
      this.renderTarget?.dispose();
      this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }

    this.colorRampMaterial.uniforms.tDiffuse.value = input.texture;

    this.quad.material = this.colorRampMaterial;
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);

    const result = TextureData.fromRenderTarget(this.renderTarget);
    const output = new Map<string, TextureData | number>();
    output.set('image', result);
    this.outputs.get('image')!.value = result;
    return output;
  }

  dispose(): void {
    this.colorRampMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderTarget?.dispose();
    this.renderTarget = undefined;
  }
}

// ---------------------------------------------------------------------------
// NormalizeNode
// ---------------------------------------------------------------------------

/**
 * Normalize depth/flow data to the [0, 1] range.
 *
 * Supports both manual range specification and auto-range mode
 * which scans the input to find actual min/max values.
 *
 * Based on: infinigen's Map Value node for depth normalization.
 */
export class NormalizeNode extends CompositorNode {
  /** Manual minimum value (used when autoRange is false) */
  minValue: number;
  /** Manual maximum value (used when autoRange is false) */
  maxValue: number;
  /** Whether to auto-detect range from input data */
  autoRange: boolean;
  /** Internal normalize material */
  private normalizeMaterial: THREE.ShaderMaterial;
  /** Full-screen quad and rendering infrastructure */
  private quad: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderTarget?: THREE.WebGLRenderTarget;

  constructor(id: string, minValue: number = 0, maxValue: number = 1, autoRange: boolean = true) {
    super(id, CompositorNodeType.Normalize);
    this.minValue = minValue;
    this.maxValue = maxValue;
    this.autoRange = autoRange;

    this.addInput('image', 'texture', TextureData.create(1, 1));
    this.addOutput('image', 'texture');

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float minVal;
      uniform float maxVal;
      uniform float range; // 1.0 / (maxVal - minVal)
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        float val = color.r;
        float normalized = clamp((val - minVal) * range, 0.0, 1.0);
        gl_FragColor = vec4(vec3(normalized), 1.0);
      }
    `;

    this.normalizeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        minVal: { value: 0 },
        maxVal: { value: 1 },
        range: { value: 1 },
      },
      vertexShader,
      fragmentShader,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.normalizeMaterial);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Auto-detect min/max from a TextureData by reading pixels on the GPU.
   */
  private autoDetectRange(input: TextureData, renderer: THREE.WebGLRenderer): { min: number; max: number } {
    // Read back pixel data from the input
    const pixelData = input.readPixels(renderer);

    if (!pixelData || pixelData.length === 0) {
      return { min: 0, max: 1 };
    }

    let min = Infinity;
    let max = -Infinity;

    // Sample every 4th pixel for performance (red channel only)
    const step = 4; // RGBA interleaved
    for (let i = 0; i < pixelData.length; i += step) {
      const val = pixelData[i]; // Red channel
      if (isFinite(val)) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    // Safety fallback
    if (!isFinite(min) || !isFinite(max) || min === max) {
      return { min: 0, max: 1 };
    }

    return { min, max };
  }

  /**
   * Normalize input to [0, 1] range.
   */
  evaluate(
    inputs: Map<string, TextureData | number>,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData | number> {
    const input = inputs.get('image') as TextureData;
    if (!input) {
      throw new Error(`NormalizeNode "${this.id}": missing "image" input`);
    }

    const width = input.width;
    const height = input.height;

    if (!this.renderTarget || this.renderTarget.width !== width || this.renderTarget.height !== height) {
      this.renderTarget?.dispose();
      this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }

    // Determine range
    let minVal = this.minValue;
    let maxVal = this.maxValue;

    if (this.autoRange) {
      const range = this.autoDetectRange(input, renderer);
      minVal = range.min;
      maxVal = range.max;
    }

    const range = maxVal - minVal;
    const invRange = range > 0 ? 1.0 / range : 1.0;

    this.normalizeMaterial.uniforms.tDiffuse.value = input.texture;
    this.normalizeMaterial.uniforms.minVal.value = minVal;
    this.normalizeMaterial.uniforms.maxVal.value = maxVal;
    this.normalizeMaterial.uniforms.range.value = invRange;

    this.quad.material = this.normalizeMaterial;
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);

    const result = TextureData.fromRenderTarget(this.renderTarget);
    const output = new Map<string, TextureData | number>();
    output.set('image', result);
    this.outputs.get('image')!.value = result;
    return output;
  }

  dispose(): void {
    this.normalizeMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderTarget?.dispose();
    this.renderTarget = undefined;
  }
}

// ---------------------------------------------------------------------------
// OutputNode
// ---------------------------------------------------------------------------

/**
 * Final output node with format selection.
 *
 * Performs CPU readback for export and stores the result in a
 * format-appropriate data structure.
 *
 * Based on: infinigen's Output node with PNG/EXR/NPY format support.
 */
export class OutputNode extends CompositorNode {
  /** Output file format */
  format: OutputFormat;
  /** Bit depth for the output */
  bitDepth: BitDepth;
  /** Internal render target for format conversion */
  private renderTarget?: THREE.WebGLRenderTarget;
  /** Internal format conversion material */
  private convertMaterial: THREE.ShaderMaterial;
  /** Full-screen quad and rendering infrastructure */
  private quad: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  /** Cached output data after evaluate() */
  private _outputData: { data: Float32Array; width: number; height: number; channels: number } | null = null;

  constructor(id: string, format: OutputFormat = 'exr', bitDepth: BitDepth = 32) {
    super(id, CompositorNodeType.Output);
    this.format = format;
    this.bitDepth = bitDepth;

    this.addInput('image', 'texture', TextureData.create(1, 1));
    this.addOutput('image', 'texture');

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tDiffuse, vUv);
      }
    `;

    this.convertMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader,
      fragmentShader,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.convertMaterial);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Process the input and prepare for export.
   */
  evaluate(
    inputs: Map<string, TextureData | number>,
    renderer: THREE.WebGLRenderer,
  ): Map<string, TextureData | number> {
    const input = inputs.get('image') as TextureData;
    if (!input) {
      throw new Error(`OutputNode "${this.id}": missing "image" input`);
    }

    const width = input.width;
    const height = input.height;

    // Determine output texture type based on format/bitDepth
    let texType: THREE.TextureDataType = THREE.FloatType;
    if (this.format === 'png') {
      texType = this.bitDepth <= 8 ? THREE.UnsignedByteType : THREE.FloatType;
    }

    if (!this.renderTarget || this.renderTarget.width !== width || this.renderTarget.height !== height) {
      this.renderTarget?.dispose();
      this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: texType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }

    // Pass through (format conversion happens in saveToData)
    this.convertMaterial.uniforms.tDiffuse.value = input.texture;
    this.quad.material = this.convertMaterial;
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);

    const result = TextureData.fromRenderTarget(this.renderTarget);
    const output = new Map<string, TextureData | number>();
    output.set('image', result);
    this.outputs.get('image')!.value = result;
    return output;
  }

  /**
   * Read pixel data from the output for export.
   * Must be called after evaluate().
   *
   * @param renderer - The WebGL renderer for readback
   * @returns Object with data, width, height, and channels
   */
  saveToData(renderer: THREE.WebGLRenderer): { data: Float32Array; width: number; height: number; channels: number } {
    const outputValue = this.outputs.get('image')?.value as TextureData | undefined;
    if (!outputValue) {
      throw new Error(`OutputNode "${this.id}": no output data available. Call evaluate() first.`);
    }

    const pixelData = outputValue.readPixels(renderer);
    const channels = outputValue.channels;

    // Apply bit depth conversion if needed
    let data = pixelData;
    if (this.bitDepth === 8) {
      // Clamp to [0, 1] and convert
      const clamped = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) {
        clamped[i] = Math.max(0, Math.min(1, data[i]));
      }
      data = clamped;
    } else if (this.bitDepth === 16) {
      // Clamp to [0, 1] for 16-bit (storage format is handled by exporter)
      const clamped = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) {
        clamped[i] = Math.max(0, Math.min(1, data[i]));
      }
      data = clamped;
    }

    this._outputData = {
      data,
      width: outputValue.width,
      height: outputValue.height,
      channels,
    };

    return this._outputData;
  }

  /**
   * Get cached output data (from last saveToData call).
   */
  getOutputData(): { data: Float32Array; width: number; height: number; channels: number } | null {
    return this._outputData;
  }

  dispose(): void {
    this.convertMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderTarget?.dispose();
    this.renderTarget = undefined;
    this._outputData = null;
  }
}

// ---------------------------------------------------------------------------
// CompositorGraph
// ---------------------------------------------------------------------------

/**
 * Directed acyclic graph of compositor nodes.
 *
 * Manages node addition/removal, connections between node sockets,
 * and evaluation via topological sort (Kahn's algorithm).
 *
 * Based on: Blender's compositor node tree and Infinigen's node graph evaluation.
 */
export class CompositorGraph {
  /** Map of node IDs to nodes */
  private nodes: Map<string, CompositorNode> = new Map();
  /** Adjacency list: nodeId → Set of downstream node IDs */
  private adjacency: Map<string, Set<string>> = new Map();
  /** Reverse adjacency: nodeId → Set of upstream node IDs */
  private reverseAdjacency: Map<string, Set<string>> = new Map();
  /** Cached evaluation order (invalidated on graph mutation) */
  private cachedOrder: CompositorNode[] | null = null;

  /**
   * Add a node to the graph.
   *
   * @param node - The compositor node to add
   * @throws Error if a node with the same ID already exists
   */
  addNode(node: CompositorNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`CompositorGraph: node with ID "${node.id}" already exists`);
    }
    this.nodes.set(node.id, node);
    this.adjacency.set(node.id, new Set());
    this.reverseAdjacency.set(node.id, new Set());
    this.cachedOrder = null;
  }

  /**
   * Remove a node from the graph.
   * Disconnects all connections to/from the removed node.
   *
   * @param id - The ID of the node to remove
   */
  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Disconnect all inputs
    for (const [inputName, input] of node.inputs) {
      if (input.connectedFrom) {
        this.disconnect(id, inputName);
      }
    }

    // Disconnect all downstream connections
    const downstream = this.adjacency.get(id);
    if (downstream) {
      for (const downId of downstream) {
        const downNode = this.nodes.get(downId);
        if (downNode) {
          for (const [inputName, input] of downNode.inputs) {
            if (input.connectedFrom && input.connectedFrom.nodeId === id) {
              input.connectedFrom = null;
            }
          }
        }
      }
    }

    // Remove from adjacency lists
    this.adjacency.delete(id);
    this.reverseAdjacency.delete(id);

    // Remove references in other nodes' adjacency
    for (const [nodeId, neighbors] of this.adjacency) {
      neighbors.delete(id);
    }
    for (const [nodeId, neighbors] of this.reverseAdjacency) {
      neighbors.delete(id);
    }

    // Dispose and remove
    node.dispose();
    this.nodes.delete(id);
    this.cachedOrder = null;
  }

  /**
   * Connect an output socket on one node to an input socket on another.
   *
   * @param fromNodeId - Source node ID
   * @param fromOutput - Source output socket name
   * @param toNodeId - Destination node ID
   * @param toInput - Destination input socket name
   * @throws Error if either node doesn't exist or the input is already connected
   */
  connect(fromNodeId: string, fromOutput: string, toNodeId: string, toInput: string): void {
    const fromNode = this.nodes.get(fromNodeId);
    const toNode = this.nodes.get(toNodeId);

    if (!fromNode) {
      throw new Error(`CompositorGraph: source node "${fromNodeId}" not found`);
    }
    if (!toNode) {
      throw new Error(`CompositorGraph: destination node "${toNodeId}" not found`);
    }
    if (!fromNode.outputs.has(fromOutput)) {
      throw new Error(`CompositorGraph: output "${fromOutput}" not found on node "${fromNodeId}"`);
    }
    if (!toNode.inputs.has(toInput)) {
      throw new Error(`CompositorGraph: input "${toInput}" not found on node "${toNodeId}"`);
    }

    // Disconnect existing connection on the input
    const input = toNode.inputs.get(toInput)!;
    if (input.connectedFrom) {
      this.disconnect(toNodeId, toInput);
    }

    // Set connection
    input.connectedFrom = { nodeId: fromNodeId, outputName: fromOutput };

    // Update adjacency lists
    this.adjacency.get(fromNodeId)!.add(toNodeId);
    this.reverseAdjacency.get(toNodeId)!.add(fromNodeId);

    this.cachedOrder = null;
  }

  /**
   * Disconnect an input socket.
   *
   * @param toNodeId - Node ID whose input to disconnect
   * @param toInput - Input socket name to disconnect
   */
  disconnect(toNodeId: string, toInput: string): void {
    const toNode = this.nodes.get(toNodeId);
    if (!toNode) return;

    const input = toNode.inputs.get(toInput);
    if (!input || !input.connectedFrom) return;

    const fromNodeId = input.connectedFrom.nodeId;
    input.connectedFrom = null;

    // Check if there are other connections from fromNodeId to toNodeId
    let hasOtherConnection = false;
    for (const [, inp] of toNode.inputs) {
      if (inp.connectedFrom && inp.connectedFrom.nodeId === fromNodeId) {
        hasOtherConnection = true;
        break;
      }
    }

    // Update adjacency if no other connections remain
    if (!hasOtherConnection) {
      this.adjacency.get(fromNodeId)?.delete(toNodeId);
      this.reverseAdjacency.get(toNodeId)?.delete(fromNodeId);
    }

    this.cachedOrder = null;
  }

  /**
   * Get a node by ID.
   */
  getNode(id: string): CompositorNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes in the graph.
   */
  getAllNodes(): CompositorNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get the number of nodes in the graph.
   */
  get nodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Evaluate the entire graph using topological sort.
   *
   * Each node's inputs are resolved from upstream outputs before evaluation.
   * Output nodes' results are collected and returned.
   *
   * @param renderer - The WebGL renderer for GPU operations
   * @returns Map of output node IDs to their output TextureData
   */
  evaluate(renderer: THREE.WebGLRenderer): Map<string, TextureData> {
    const order = this.getExecutionOrder();
    const outputResults = new Map<string, TextureData>();

    // Store evaluated outputs for each node
    const nodeOutputs = new Map<string, Map<string, TextureData | number>>();

    for (const node of order) {
      // Resolve inputs from upstream outputs
      const resolvedInputs = new Map<string, TextureData | number>();

      for (const [inputName, input] of node.inputs) {
        if (input.connectedFrom) {
          const upstreamOutputs = nodeOutputs.get(input.connectedFrom.nodeId);
          if (upstreamOutputs) {
            const upstreamValue = upstreamOutputs.get(input.connectedFrom.outputName);
            if (upstreamValue !== undefined) {
              resolvedInputs.set(inputName, upstreamValue);
            } else {
              resolvedInputs.set(inputName, input.defaultValue);
            }
          } else {
            resolvedInputs.set(inputName, input.defaultValue);
          }
        } else {
          resolvedInputs.set(inputName, input.defaultValue);
        }
      }

      // Evaluate the node
      const outputs = node.evaluate(resolvedInputs, renderer);
      nodeOutputs.set(node.id, outputs);

      // If this is an output node, collect the result
      if (node.type === CompositorNodeType.Output) {
        const imageOutput = outputs.get('image');
        if (imageOutput instanceof TextureData) {
          outputResults.set(node.id, imageOutput);
        }
      }
    }

    return outputResults;
  }

  /**
   * Get the execution order using Kahn's algorithm for topological sort.
   *
   * @returns Array of nodes in evaluation order (leaf nodes first)
   * @throws Error if the graph contains a cycle
   */
  getExecutionOrder(): CompositorNode[] {
    if (this.cachedOrder) return this.cachedOrder;

    // Compute in-degrees
    const inDegree = new Map<string, number>();
    for (const [nodeId] of this.nodes) {
      inDegree.set(nodeId, 0);
    }
    for (const [, neighbors] of this.adjacency) {
      for (const neighborId of neighbors) {
        inDegree.set(neighborId, (inDegree.get(neighborId) ?? 0) + 1);
      }
    }

    // Initialize queue with zero in-degree nodes
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const sortedIds: string[] = [];
    const adjacencyCopy = new Map<string, Set<string>>();
    for (const [nodeId, neighbors] of this.adjacency) {
      adjacencyCopy.set(nodeId, new Set(neighbors));
    }

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      sortedIds.push(currentId);

      const neighbors = adjacencyCopy.get(currentId);
      if (neighbors) {
        for (const neighborId of neighbors) {
          const newDegree = (inDegree.get(neighborId) ?? 1) - 1;
          inDegree.set(neighborId, newDegree);
          if (newDegree === 0) {
            queue.push(neighborId);
          }
        }
      }
    }

    if (sortedIds.length !== this.nodes.size) {
      throw new Error('CompositorGraph: cycle detected in node graph');
    }

    this.cachedOrder = sortedIds.map((id) => this.nodes.get(id)!);
    return this.cachedOrder;
  }

  /**
   * Validate the graph for errors.
   *
   * Checks for:
   * - Cycles in the graph
   * - Missing required inputs
   * - Type mismatches between connected sockets
   *
   * @returns Array of validation error messages (empty if valid)
   */
  validate(): string[] {
    const errors: string[] = [];

    // Check for cycles
    try {
      this.getExecutionOrder();
    } catch (e) {
      errors.push((e as Error).message);
    }

    // Check for missing required inputs
    for (const [nodeId, node] of this.nodes) {
      for (const [inputName, input] of node.inputs) {
        if (!input.connectedFrom && input.defaultValue === undefined) {
          errors.push(`Node "${nodeId}": input "${inputName}" is not connected and has no default value`);
        }
      }
    }

    // Check type mismatches
    for (const [nodeId, node] of this.nodes) {
      for (const [inputName, input] of node.inputs) {
        if (input.connectedFrom) {
          const sourceNode = this.nodes.get(input.connectedFrom.nodeId);
          if (sourceNode) {
            const sourceOutput = sourceNode.outputs.get(input.connectedFrom.outputName);
            if (sourceOutput && sourceOutput.type !== input.type) {
              errors.push(
                `Type mismatch: node "${nodeId}" input "${inputName}" (${input.type}) ` +
                `connected to node "${input.connectedFrom.nodeId}" output "${input.connectedFrom.outputName}" (${sourceOutput.type})`
              );
            }
          }
        }
      }
    }

    // Check for disconnected output nodes
    for (const [nodeId, node] of this.nodes) {
      if (node.type === CompositorNodeType.Output) {
        const imageInput = node.inputs.get('image');
        if (!imageInput?.connectedFrom) {
          errors.push(`Output node "${nodeId}" has no input connected`);
        }
      }
    }

    return errors;
  }

  /**
   * Dispose all nodes and reset the graph.
   */
  dispose(): void {
    for (const [, node] of this.nodes) {
      node.dispose();
    }
    this.nodes.clear();
    this.adjacency.clear();
    this.reverseAdjacency.clear();
    this.cachedOrder = null;
  }
}

// ---------------------------------------------------------------------------
// CompositorBuilder
// ---------------------------------------------------------------------------

/**
 * Fluent builder API for constructing CompositorGraph instances.
 *
 * Provides convenience methods for adding each node type and
 * connecting them, then building the final graph.
 *
 * @example
 * ```ts
 * const graph = new CompositorBuilder()
 *   .addRenderLayer('depth', depthMaterial)
 *   .addNormalize(true)
 *   .addOutput('exr', 32)
 *   .connect('depth', 'image', 'normalize', 'image')
 *   .connect('normalize', 'image', 'output', 'image')
 *   .build();
 * ```
 */
export class CompositorBuilder {
  /** Pending nodes to add to the graph */
  private pendingNodes: CompositorNode[] = [];
  /** Pending connections to make */
  private pendingConnections: Array<{
    fromNodeId: string;
    fromOutput: string;
    toNodeId: string;
    toInput: string;
  }> = [];
  /** Auto-incrementing counter for node IDs */
  private idCounter: number = 0;

  /**
   * Generate a unique node ID.
   */
  private nextId(prefix: string): string {
    this.idCounter++;
    return `${prefix}_${this.idCounter}`;
  }

  /**
   * Add a RenderLayer node.
   *
   * @param name - Layer name (beauty, depth, normal, etc.)
   * @param overrideMaterial - Optional material override for GT passes
   * @param id - Optional custom node ID
   * @returns This builder for chaining
   */
  addRenderLayer(name: string, overrideMaterial?: THREE.Material, id?: string): CompositorBuilder {
    const nodeId = id ?? this.nextId('renderLayer');
    this.pendingNodes.push(new RenderLayerNode(nodeId, name, overrideMaterial));
    return this;
  }

  /**
   * Add a Blur node.
   *
   * @param radius - Blur radius in pixels
   * @param sigma - Gaussian sigma (default: auto from radius)
   * @param passes - Number of blur passes
   * @param id - Optional custom node ID
   * @returns This builder for chaining
   */
  addBlur(radius: number = 5, sigma: number = -1, passes: number = 1, id?: string): CompositorBuilder {
    const nodeId = id ?? this.nextId('blur');
    this.pendingNodes.push(new BlurNode(nodeId, radius, sigma, passes));
    return this;
  }

  /**
   * Add a Dilate node.
   *
   * @param radius - Dilation radius in pixels
   * @param iterations - Number of dilation iterations
   * @param id - Optional custom node ID
   * @returns This builder for chaining
   */
  addDilate(radius: number = 3, iterations: number = 1, id?: string): CompositorBuilder {
    const nodeId = id ?? this.nextId('dilate');
    this.pendingNodes.push(new DilateNode(nodeId, radius, iterations));
    return this;
  }

  /**
   * Add a Composite node.
   *
   * @param mode - Blend mode
   * @param factor - Blend factor (0-1)
   * @param id - Optional custom node ID
   * @returns This builder for chaining
   */
  addComposite(mode: BlendMode = 'alpha', factor: number = 0.5, id?: string): CompositorBuilder {
    const nodeId = id ?? this.nextId('composite');
    this.pendingNodes.push(new CompositeNode(nodeId, mode, factor));
    return this;
  }

  /**
   * Add a Threshold node.
   *
   * @param value - Threshold value
   * @param invert - Whether to invert the mask
   * @param id - Optional custom node ID
   * @returns This builder for chaining
   */
  addThreshold(value: number = 0.5, invert: boolean = false, id?: string): CompositorBuilder {
    const nodeId = id ?? this.nextId('threshold');
    this.pendingNodes.push(new ThresholdNode(nodeId, value, invert));
    return this;
  }

  /**
   * Add a ColorRamp node.
   *
   * @param stops - Array of color ramp stops
   * @param interpolation - Interpolation mode
   * @param id - Optional custom node ID
   * @returns This builder for chaining
   */
  addColorRamp(stops: ColorRampStop[], interpolation: ColorRampInterpolation = 'linear', id?: string): CompositorBuilder {
    const nodeId = id ?? this.nextId('colorRamp');
    this.pendingNodes.push(new ColorRampNode(nodeId, stops, interpolation));
    return this;
  }

  /**
   * Add a Normalize node.
   *
   * @param auto - Whether to auto-detect range
   * @param min - Manual minimum value
   * @param max - Manual maximum value
   * @param id - Optional custom node ID
   * @returns This builder for chaining
   */
  addNormalize(auto: boolean = true, min: number = 0, max: number = 1, id?: string): CompositorBuilder {
    const nodeId = id ?? this.nextId('normalize');
    this.pendingNodes.push(new NormalizeNode(nodeId, min, max, auto));
    return this;
  }

  /**
   * Add an Output node.
   *
   * @param format - Output format (png, exr, npy)
   * @param bitDepth - Output bit depth
   * @param id - Optional custom node ID
   * @returns This builder for chaining
   */
  addOutput(format: OutputFormat = 'exr', bitDepth: BitDepth = 32, id?: string): CompositorBuilder {
    const nodeId = id ?? this.nextId('output');
    this.pendingNodes.push(new OutputNode(nodeId, format, bitDepth));
    return this;
  }

  /**
   * Queue a connection between two node sockets.
   *
   * @param fromNodeId - Source node ID
   * @param fromOutput - Source output socket name
   * @param toNodeId - Destination node ID
   * @param toInput - Destination input socket name
   * @returns This builder for chaining
   */
  connect(fromNodeId: string, fromOutput: string, toNodeId: string, toInput: string): CompositorBuilder {
    this.pendingConnections.push({ fromNodeId, fromOutput, toNodeId, toInput });
    return this;
  }

  /**
   * Build the CompositorGraph from all pending nodes and connections.
   *
   * @returns A fully constructed CompositorGraph
   * @throws Error if any connection references a non-existent node
   */
  build(): CompositorGraph {
    const graph = new CompositorGraph();

    // Add all nodes
    for (const node of this.pendingNodes) {
      graph.addNode(node);
    }

    // Apply all connections
    for (const conn of this.pendingConnections) {
      graph.connect(conn.fromNodeId, conn.fromOutput, conn.toNodeId, conn.toInput);
    }

    return graph;
  }

  /**
   * Reset the builder for reuse.
   */
  reset(): CompositorBuilder {
    this.pendingNodes = [];
    this.pendingConnections = [];
    this.idCounter = 0;
    return this;
  }
}

// ---------------------------------------------------------------------------
// CompositorPresets
// ---------------------------------------------------------------------------

/**
 * Preset compositor graph factories for common ground truth pipelines.
 *
 * Each static method returns a CompositorBuilder that can be further
 * customized or built directly.
 *
 * Based on: infinigen's compositor node groups for ground truth output.
 */
export class CompositorPresets {
  /**
   * Full ground truth pipeline: beauty + depth + normal + segmentation + flow.
   *
   * Creates separate render layer nodes for each GT pass, normalizes depth
   * and flow to [0,1], and outputs each as a separate EXR channel.
   *
   * @returns A CompositorBuilder configured for the full GT pipeline
   */
  static groundTruthPipeline(): CompositorBuilder {
    const builder = new CompositorBuilder();

    // Render layers
    builder.addRenderLayer('beauty', undefined, 'rl_beauty');
    builder.addRenderLayer('depth', undefined, 'rl_depth');
    builder.addRenderLayer('normal', undefined, 'rl_normal');
    builder.addRenderLayer('segmentation', undefined, 'rl_segmentation');
    builder.addRenderLayer('flow', undefined, 'rl_flow');

    // Normalize depth to [0, 1]
    builder.addNormalize(true, 0, 1, 'norm_depth');
    builder.connect('rl_depth', 'image', 'norm_depth', 'image');

    // Normalize flow to [0, 1]
    builder.addNormalize(true, 0, 1, 'norm_flow');
    builder.connect('rl_flow', 'image', 'norm_flow', 'image');

    // Outputs
    builder.addOutput('exr', 32, 'out_beauty');
    builder.connect('rl_beauty', 'image', 'out_beauty', 'image');

    builder.addOutput('exr', 32, 'out_depth');
    builder.connect('norm_depth', 'image', 'out_depth', 'image');

    builder.addOutput('exr', 32, 'out_normal');
    builder.connect('rl_normal', 'image', 'out_normal', 'image');

    builder.addOutput('png', 8, 'out_segmentation');
    builder.connect('rl_segmentation', 'image', 'out_segmentation', 'image');

    builder.addOutput('exr', 32, 'out_flow');
    builder.connect('norm_flow', 'image', 'out_flow', 'image');

    return builder;
  }

  /**
   * Depth normalization pipeline: float depth → normalized 0-1 RGBA.
   *
   * Takes raw float depth, auto-detects range, normalizes to [0,1],
   * and outputs as RGBA texture suitable for PNG or EXR export.
   *
   * @returns A CompositorBuilder configured for depth normalization
   */
  static depthNormalization(): CompositorBuilder {
    const builder = new CompositorBuilder();

    builder.addRenderLayer('depth', undefined, 'rl_depth');
    builder.addNormalize(true, 0, 1, 'norm_depth');
    builder.addOutput('exr', 32, 'out_depth');

    builder.connect('rl_depth', 'image', 'norm_depth', 'image');
    builder.connect('norm_depth', 'image', 'out_depth', 'image');

    return builder;
  }

  /**
   * Normal visualization pipeline: camera-space normals → RGB visualization.
   *
   * Camera-space normals are in [-1,1] per component. This pipeline
   * maps them to [0,1] for RGB visualization (the GT normal material
   * already does this, so this is mainly a pass-through with optional
   * color ramp overlay for emphasis).
   *
   * @returns A CompositorBuilder configured for normal visualization
   */
  static normalVisualization(): CompositorBuilder {
    const builder = new CompositorBuilder();

    builder.addRenderLayer('normal', undefined, 'rl_normal');
    builder.addOutput('exr', 32, 'out_normal');

    builder.connect('rl_normal', 'image', 'out_normal', 'image');

    return builder;
  }

  /**
   * Foam from flow pipeline: flow magnitude → threshold → dilate → composite onto beauty.
   *
   * Computes optical flow magnitude, thresholds it to find high-motion
   * regions (foam candidates), dilates the mask, and composites a
   * white foam color onto the beauty render using alpha blending.
   *
   * @returns A CompositorBuilder configured for foam-from-flow
   */
  static foamFromFlow(): CompositorBuilder {
    const builder = new CompositorBuilder();

    // Render layers
    builder.addRenderLayer('beauty', undefined, 'rl_beauty');
    builder.addRenderLayer('flow', undefined, 'rl_flow');

    // Threshold flow magnitude to create foam mask
    builder.addThreshold(0.3, false, 'threshold_flow');
    builder.connect('rl_flow', 'image', 'threshold_flow', 'image');

    // Dilate the mask for wider foam regions
    builder.addDilate(4, 2, 'dilate_foam');
    builder.connect('threshold_flow', 'image', 'dilate_foam', 'image');

    // Blur the mask for soft edges
    builder.addBlur(3, -1, 1, 'blur_foam');
    builder.connect('dilate_foam', 'image', 'blur_foam', 'image');

    // Composite foam onto beauty
    builder.addComposite('alpha', 0.6, 'composite_foam');
    builder.connect('rl_beauty', 'image', 'composite_foam', 'A');
    builder.connect('blur_foam', 'image', 'composite_foam', 'B');

    // Output
    builder.addOutput('exr', 32, 'out_foam');
    builder.connect('composite_foam', 'image', 'out_foam', 'image');

    return builder;
  }

  /**
   * Underwater caustics pipeline: depth difference → threshold → blur → color ramp → composite.
   *
   * Simulates caustic patterns by computing depth differences (sharp
   * changes indicate caustic edges), thresholding to find edges,
   * blurring for soft caustic patterns, applying a blue-white color
   * ramp for the underwater look, and compositing onto the beauty render.
   *
   * @returns A CompositorBuilder configured for underwater caustics
   */
  static underwaterCaustics(): CompositorBuilder {
    const builder = new CompositorBuilder();

    // Render layers
    builder.addRenderLayer('beauty', undefined, 'rl_beauty');
    builder.addRenderLayer('depth', undefined, 'rl_depth');

    // Normalize depth for processing
    builder.addNormalize(true, 0, 1, 'norm_depth');
    builder.connect('rl_depth', 'image', 'norm_depth', 'image');

    // Threshold depth to find caustic-like regions (shallow depth areas)
    builder.addThreshold(0.4, false, 'threshold_caustics');
    builder.connect('norm_depth', 'image', 'threshold_caustics', 'image');

    // Dilate for wider caustic patches
    builder.addDilate(6, 1, 'dilate_caustics');
    builder.connect('threshold_caustics', 'image', 'dilate_caustics', 'image');

    // Blur for soft caustic look
    builder.addBlur(8, -1, 2, 'blur_caustics');
    builder.connect('dilate_caustics', 'image', 'blur_caustics', 'image');

    // Color ramp: map caustic intensity to blue-white underwater palette
    builder.addColorRamp(
      [
        { position: 0.0, color: new THREE.Color(0.0, 0.05, 0.15) },
        { position: 0.3, color: new THREE.Color(0.0, 0.2, 0.5) },
        { position: 0.6, color: new THREE.Color(0.3, 0.6, 0.9) },
        { position: 0.85, color: new THREE.Color(0.7, 0.85, 1.0) },
        { position: 1.0, color: new THREE.Color(1.0, 1.0, 1.0) },
      ],
      'ease',
      'ramp_caustics',
    );
    builder.connect('blur_caustics', 'image', 'ramp_caustics', 'fac');

    // Composite caustics onto beauty with screen blend
    builder.addComposite('screen', 0.3, 'composite_caustics');
    builder.connect('rl_beauty', 'image', 'composite_caustics', 'A');
    builder.connect('ramp_caustics', 'image', 'composite_caustics', 'B');

    // Output
    builder.addOutput('exr', 32, 'out_caustics');
    builder.connect('composite_caustics', 'image', 'out_caustics', 'image');

    return builder;
  }
}
