/**
 * DenoisePipeline — Path Tracer Denoising Post-Process
 *
 * Applies denoising to the path-traced rendering pipeline using
 * DenoiseMaterial from three-gpu-pathtracer. Provides configurable
 * parameters and auto-adjustment based on sample count.
 *
 * Phase 1 — P1.5: Denoising Post-Process
 *
 * @module rendering
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DenoiseStrength = 'off' | 'light' | 'medium' | 'heavy';

export interface DenoiseConfig {
  /** Standard deviation for Gaussian kernel (default: 5.0) */
  sigma: number;
  /** Sigma coefficient; kSigma * sigma = kernel radius (default: 1.0) */
  kSigma: number;
  /** Edge sharpening threshold (default: 0.03) */
  threshold: number;
  /** Strength preset */
  strength: DenoiseStrength;
  /** Auto-adjust parameters based on sample count */
  autoAdjust: boolean;
  /** Skip denoising when samples exceed this threshold (default: 500) */
  skipAboveSamples: number;
}

export const DENOISE_PRESETS: Record<DenoiseStrength, Omit<DenoiseConfig, 'strength' | 'autoAdjust' | 'skipAboveSamples'>> = {
  off: { sigma: 0, kSigma: 0, threshold: 0 },
  light: { sigma: 3.0, kSigma: 0.75, threshold: 0.05 },
  medium: { sigma: 5.0, kSigma: 1.0, threshold: 0.03 },
  heavy: { sigma: 8.0, kSigma: 1.5, threshold: 0.02 },
};

export const DEFAULT_DENOISE_CONFIG: DenoiseConfig = {
  ...DENOISE_PRESETS.medium,
  strength: 'medium',
  autoAdjust: true,
  skipAboveSamples: 500,
};

// ---------------------------------------------------------------------------
// DenoisePipeline
// ---------------------------------------------------------------------------

/**
 * Manages denoising of path-tracer output using DenoiseMaterial
 * from three-gpu-pathtracer.
 */
export class DenoisePipeline {
  private config: DenoiseConfig;
  private denoiseMaterial: any = null;
  private quad: THREE.Mesh | null = null;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private initialized = false;

  constructor(config: Partial<DenoiseConfig> = {}) {
    this.config = { ...DEFAULT_DENOISE_CONFIG, ...config };

    // Create a simple orthographic scene for the denoise pass
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Initialize the denoise pipeline with a WebGL renderer.
   */
  async init(renderer: THREE.WebGLRenderer): Promise<boolean> {
    try {
      const { DenoiseMaterial } = await import('three-gpu-pathtracer');

      this.denoiseMaterial = new DenoiseMaterial({
        sigma: this.config.sigma,
        kSigma: this.config.kSigma,
        threshold: this.config.threshold,
      });

      this.quad = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        this.denoiseMaterial,
      );
      this.scene.add(this.quad);
      this.initialized = true;
      return true;
    } catch (err) {
      console.warn('[DenoisePipeline] DenoiseMaterial not available, denoising disabled:', err);
      return false;
    }
  }

  /**
   * Apply denoising to a path-tracer render target.
   * Returns the denoised texture (or the original if denoising is skipped).
   */
  denoise(
    renderer: THREE.WebGLRenderer,
    sourceTarget: THREE.WebGLRenderTarget,
    outputTarget: THREE.WebGLRenderTarget,
    currentSamples: number,
  ): THREE.WebGLRenderTarget {
    if (!this.initialized || !this.denoiseMaterial || !this.quad) {
      return sourceTarget;
    }

    // Skip denoising if above sample threshold
    if (this.config.strength === 'off' || currentSamples >= this.config.skipAboveSamples) {
      return sourceTarget;
    }

    // Auto-adjust parameters based on sample count
    if (this.config.autoAdjust) {
      this.autoAdjustParams(currentSamples);
    }

    // Set the source texture
    this.denoiseMaterial.map = sourceTarget.texture;

    // Render denoise pass
    renderer.setRenderTarget(outputTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);

    return outputTarget;
  }

  /**
   * Auto-adjust denoise parameters based on current sample count.
   * Reduces denoising strength as the image converges.
   */
  private autoAdjustParams(samples: number): void {
    if (!this.denoiseMaterial) return;

    const preset = DENOISE_PRESETS[this.config.strength];
    if (this.config.strength === 'off') return;

    // Scale sigma down as samples increase
    const convergenceFactor = Math.max(0, 1.0 - samples / this.config.skipAboveSamples);
    const adjustedSigma = preset.sigma * convergenceFactor;
    const adjustedKSigma = preset.kSigma;

    this.denoiseMaterial.sigma = adjustedSigma;
    this.denoiseMaterial.kSigma = adjustedKSigma;
    this.denoiseMaterial.threshold = preset.threshold;
  }

  /**
   * Update the denoise configuration.
   */
  updateConfig(config: Partial<DenoiseConfig>): void {
    this.config = { ...this.config, ...config };

    // Apply preset if strength changed
    if (config.strength && config.strength !== this.config.strength) {
      const preset = DENOISE_PRESETS[config.strength];
      this.config.sigma = preset.sigma;
      this.config.kSigma = preset.kSigma;
      this.config.threshold = preset.threshold;
    }

    // Apply to material
    if (this.denoiseMaterial) {
      this.denoiseMaterial.sigma = this.config.sigma;
      this.denoiseMaterial.kSigma = this.config.kSigma;
      this.denoiseMaterial.threshold = this.config.threshold;
    }
  }

  /**
   * Set the denoise strength preset.
   */
  setStrength(strength: DenoiseStrength): void {
    this.updateConfig({ strength });
  }

  /**
   * Get the current configuration.
   */
  getConfig(): DenoiseConfig {
    return { ...this.config };
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    if (this.quad) {
      this.quad.geometry.dispose();
      this.scene.remove(this.quad);
    }
    if (this.denoiseMaterial) {
      this.denoiseMaterial.dispose();
    }
    this.quad = null;
    this.denoiseMaterial = null;
    this.initialized = false;
  }
}

// ---------------------------------------------------------------------------
// Convenience Function
// ---------------------------------------------------------------------------

/**
 * Create and initialize a DenoisePipeline with default settings.
 */
export async function createDenoisePipeline(
  config: Partial<DenoiseConfig> = {}
): Promise<DenoisePipeline | null> {
  const pipeline = new DenoisePipeline(config);

  // Create a temporary renderer for initialization
  try {
    const tempRenderer = new THREE.WebGLRenderer({ alpha: true });
    const success = await pipeline.init(tempRenderer);
    tempRenderer.dispose();

    if (!success) return null;
    return pipeline;
  } catch (err) {
    // Silently fall back - DenoisePipeline creation may fail without WebGL support
    if (process.env.NODE_ENV === 'development') console.debug('[DenoisePipeline] createDenoisePipeline fallback:', err);
    return null;
  }
}
