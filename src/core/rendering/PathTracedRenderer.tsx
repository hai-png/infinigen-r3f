/**
 * PathTracedRenderer — Core Path Tracer Setup
 *
 * Integrates three-gpu-pathtracer as the primary rendering option.
 * Provides both imperative API and R3F component for path-traced rendering.
 *
 * Phase 1 — P1.1: Core PathTracer Setup
 *
 * @module rendering
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PathTracerConfig {
  /** Maximum light bounces per path (default: 8) */
  bounces: number;
  /** Additional bounces for transmissive surfaces (default: 10) */
  transmissiveBounces: number;
  /** Filter glossy factor to reduce fireflies (default: 0.1) */
  filterGlossyFactor: number;
  /** Enable multiple importance sampling (default: true) */
  multipleImportanceSampling: boolean;
  /** Minimum samples before displaying (default: 1) */
  minSamples: number;
  /** Render scale relative to canvas (default: 1.0) */
  renderScale: number;
  /** Progressive tiling [x, y] (default: [3, 3]) */
  tiles: [number, number];
  /** Target sample count for "converged" (default: 500) */
  targetSamples: number;
}

export const DEFAULT_PATHTRACER_CONFIG: PathTracerConfig = {
  bounces: 8,
  transmissiveBounces: 10,
  filterGlossyFactor: 0.1,
  multipleImportanceSampling: true,
  minSamples: 1,
  renderScale: 1.0,
  tiles: [3, 3],
  targetSamples: 500,
};

// ---------------------------------------------------------------------------
// PathTracerManager — Imperative API
// ---------------------------------------------------------------------------

/**
 * Manages a WebGLPathTracer instance with proper lifecycle management.
 * This is the core imperative API used by the R3F component and
 * also available for programmatic use.
 */
export class PathTracerManager {
  private pathTracer: any = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private _isSetup = false;
  private _disposed = false;
  private config: PathTracerConfig;

  constructor(config: Partial<PathTracerConfig> = {}) {
    this.config = { ...DEFAULT_PATHTRACER_CONFIG, ...config };
  }

  /**
   * Initialize the path tracer with a WebGL renderer.
   */
  async init(renderer: THREE.WebGLRenderer): Promise<boolean> {
    if (this._disposed) return false;
    this.renderer = renderer;

    try {
      const { WebGLPathTracer } = await import('three-gpu-pathtracer');
      this.pathTracer = new WebGLPathTracer(renderer);
      this.applyConfig();
      return true;
    } catch (err) {
      console.error('[PathTracerManager] Failed to initialize:', err);
      return false;
    }
  }

  /**
   * Apply the current configuration to the path tracer.
   */
  private applyConfig(): void {
    if (!this.pathTracer) return;

    this.pathTracer.bounces = this.config.bounces;
    this.pathTracer.transmissiveBounces = this.config.transmissiveBounces;
    this.pathTracer.filterGlossyFactor = this.config.filterGlossyFactor;
    this.pathTracer.multipleImportanceSampling = this.config.multipleImportanceSampling;
    this.pathTracer.minSamples = this.config.minSamples;
    this.pathTracer.renderScale = this.config.renderScale;
    this.pathTracer.tiles.set(this.config.tiles[0], this.config.tiles[1]);
  }

  /**
   * Set the scene and camera for path tracing.
   * This is expensive — only call when geometry changes.
   */
  setScene(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.pathTracer) return;

    try {
      this.pathTracer.setScene(scene, camera);
      this._isSetup = true;
    } catch (err) {
      console.error('[PathTracerManager] Failed to set scene:', err);
    }
  }

  /**
   * Set the scene asynchronously (requires BVH worker).
   */
  async setSceneAsync(
    scene: THREE.Scene,
    camera: THREE.Camera,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!this.pathTracer) return;

    try {
      await this.pathTracer.setSceneAsync(scene, camera, {
        onProgress,
      });
      this._isSetup = true;
    } catch (err) {
      console.error('[PathTracerManager] Failed to set scene async:', err);
      // Fallback to synchronous
      this.setScene(scene, camera);
    }
  }

  /**
   * Set a BVH worker for async scene generation.
   */
  async setBVHWorker(): Promise<void> {
    if (!this.pathTracer) return;

    try {
      const { PathTracingSceneWorker } = await import('three-gpu-pathtracer');
      const worker = new PathTracingSceneWorker();
      this.pathTracer.setBVHWorker(worker);
    } catch (err) {
      // Silently fall back - BVH Worker not available, will use synchronous generation
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracedRenderer] setBVHWorker fallback:', err);
    }
  }

  /**
   * Render one sample. Call this in the render loop.
   * Returns the current sample count.
   */
  renderSample(): number {
    if (!this.pathTracer || !this._isSetup) return 0;

    try {
      this.pathTracer.renderSample();
      return this.pathTracer.samples ?? 0;
    } catch (err) {
      // Silently fall back - renderSample may fail before pathTracer is ready
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracedRenderer] renderSample fallback:', err);
      return 0;
    }
  }

  /**
   * Reset accumulation (call when scene/camera changes).
   */
  reset(): void {
    if (!this.pathTracer) return;
    try {
      this.pathTracer.reset();
    } catch (err) {
      // Silently fall back - reset may fail if pathTracer is in bad state
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracedRenderer] reset fallback:', err);
    }
  }

  /**
   * Update camera parameters after changes.
   */
  updateCamera(): void {
    if (!this.pathTracer) return;
    try {
      this.pathTracer.updateCamera();
    } catch (err) {
      // Silently fall back - camera update may not be supported in all versions
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracedRenderer] updateCamera fallback:', err);
    }
  }

  /**
   * Update material data after property changes.
   */
  updateMaterials(): void {
    if (!this.pathTracer) return;
    try {
      this.pathTracer.updateMaterials();
    } catch (err) {
      // Silently fall back - material update may fail with unsupported materials
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracedRenderer] updateMaterials fallback:', err);
    }
  }

  /**
   * Update light data after changes.
   */
  updateLights(): void {
    if (!this.pathTracer) return;
    try {
      this.pathTracer.updateLights();
    } catch (err) {
      // Silently fall back - light update may fail with unsupported light types
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracedRenderer] updateLights fallback:', err);
    }
  }

  /**
   * Update environment map.
   */
  updateEnvironment(): void {
    if (!this.pathTracer) return;
    try {
      this.pathTracer.updateEnvironment();
    } catch (err) {
      // Silently fall back - environment update may fail with missing env map
      if (process.env.NODE_ENV === 'development') console.debug('[PathTracedRenderer] updateEnvironment fallback:', err);
    }
  }

  /**
   * Update the configuration and apply to the path tracer.
   */
  updateConfig(config: Partial<PathTracerConfig>): void {
    this.config = { ...this.config, ...config };
    this.applyConfig();
  }

  /**
   * Get the current sample count.
   */
  get samples(): number {
    return this.pathTracer?.samples ?? 0;
  }

  /**
   * Whether the image is considered converged.
   */
  get isConverged(): boolean {
    return this.samples >= this.config.targetSamples;
  }

  /**
   * Convergence ratio 0..1.
   */
  get convergence(): number {
    return Math.min(this.samples / this.config.targetSamples, 1.0);
  }

  /**
   * Whether the path tracer is set up and ready.
   */
  get isSetup(): boolean {
    return this._isSetup;
  }

  /**
   * Get the internal path tracer instance (for advanced usage).
   */
  get rawPathTracer(): any {
    return this.pathTracer;
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this._disposed = true;
    if (this.pathTracer) {
      try {
        this.pathTracer.dispose();
      } catch (err) {
        // Silently fall back - dispose may fail if resources already freed
        if (process.env.NODE_ENV === 'development') console.debug('[PathTracedRenderer] dispose fallback:', err);
      }
      this.pathTracer = null;
    }
    this._isSetup = false;
    this.renderer = null;
  }
}

// ---------------------------------------------------------------------------
// GPU Capability Detection
// ---------------------------------------------------------------------------

export interface GPUCapabilities {
  /** Path tracing is supported */
  pathTraceSupported: boolean;
  /** WebGL2 is available */
  webgl2: boolean;
  /** Float render targets are supported */
  floatRenderTarget: boolean;
  /** Recommended render scale (0.5 for mobile, 1.0 for desktop) */
  recommendedRenderScale: number;
  /** Max texture size */
  maxTextureSize: number;
  /** Estimated GPU tier (1=low, 2=mid, 3=high) */
  gpuTier: number;
}

/**
 * Detect GPU capabilities for path tracing.
 */
export function detectGPUCapabilities(): GPUCapabilities {
  const defaults: GPUCapabilities = {
    pathTraceSupported: false,
    webgl2: false,
    floatRenderTarget: false,
    recommendedRenderScale: 0.5,
    maxTextureSize: 4096,
    gpuTier: 1,
  };

  if (typeof window === 'undefined') return defaults;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return defaults;

    defaults.webgl2 = true;

    const colorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    const floatBlend = gl.getExtension('EXT_float_blend');

    defaults.floatRenderTarget = !!(colorBufferFloat && floatBlend);
    defaults.pathTraceSupported = defaults.floatRenderTarget;

    defaults.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

    // GPU tier estimation
    const renderer = gl.getParameter(gl.RENDERER) || '';
    const nav = navigator as { deviceMemory?: number; hardwareConcurrency?: number };
    const isMobile = /Mali|Adreno|PowerVR|Apple GPU/i.test(renderer);
    const isDiscrete = /NVIDIA|GeForce|Radeon|RTX|GTX/i.test(renderer);

    if (isDiscrete) {
      defaults.gpuTier = 3;
      defaults.recommendedRenderScale = 1.0;
    } else if (!isMobile && nav.hardwareConcurrency && nav.hardwareConcurrency >= 8) {
      defaults.gpuTier = 2;
      defaults.recommendedRenderScale = 0.75;
    } else {
      defaults.gpuTier = 1;
      defaults.recommendedRenderScale = 0.5;
    }

    canvas.remove();
    return defaults;
  } catch (err) {
    // Silently fall back - GPU capability detection may fail in restricted environments
    if (process.env.NODE_ENV === 'development') console.debug('[PathTracedRenderer] detectGPUCapabilities fallback:', err);
    return defaults;
  }
}
