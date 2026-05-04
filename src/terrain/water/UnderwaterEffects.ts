/**
 * UnderwaterEffects - Post-processing style component for underwater camera
 *
 * Provides visual effects when the camera is below water level:
 * - Fog effect that increases with depth below water surface
 * - Color shift (blue/green tint) proportional to depth
 * - Caustic light patterns projected on surfaces
 * - Detects when camera is below water level
 *
 * This is a React-compatible component that manages Three.js scene
 * properties (fog, background) and provides caustic overlay.
 */

import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { createCanvas } from '@/assets/utils/CanvasUtils';

// ============================================================================
// Configuration
// ============================================================================

export interface UnderwaterEffectsConfig {
  /** Global water level (Y coordinate) for the scene (default 0) */
  waterLevel: number;
  /** Base fog density when underwater (default 0.04) */
  fogDensity: number;
  /** Maximum fog density at great depth (default 0.15) */
  maxFogDensity: number;
  /** Underwater fog color (default deep blue-green) */
  fogColor: THREE.Color;
  /** Color tint strength (0 = none, 1 = full) (default 0.5) */
  tintStrength: number;
  /** Depth scale for fog density ramp (default 20) */
  depthScale: number;
  /** Caustic pattern intensity (default 0.3) */
  causticIntensity: number;
  /** Caustic animation speed (default 0.3) */
  causticSpeed: number;
  /** Caustic pattern scale (default 0.05) */
  causticScale: number;
  /** Caustic overlay opacity (default 0.15) */
  causticOpacity: number;
  /** Transition smoothness when crossing water surface (default 0.5) */
  transitionSpeed: number;
}

// ============================================================================
// UnderwaterEffects
// ============================================================================

export class UnderwaterEffects {
  private config: UnderwaterEffectsConfig;
  private noise: NoiseUtils;
  private time: number = 0;
  private isUnderwater: boolean = false;
  private currentBlend: number = 0; // 0 = above water, 1 = fully underwater
  private savedFog: THREE.Fog | THREE.FogExp2 | null = null;
  private savedBgColor: THREE.Color | null = null;
  private causticTexture: THREE.CanvasTexture | null = null;
  private causticOverlay: THREE.Mesh | null = null;
  private underwaterFog: THREE.FogExp2;

  constructor(config: Partial<UnderwaterEffectsConfig> = {}) {
    this.config = {
      waterLevel: 0,
      fogDensity: 0.04,
      maxFogDensity: 0.15,
      fogColor: new THREE.Color(0x0a3d5c),
      tintStrength: 0.5,
      depthScale: 20,
      causticIntensity: 0.3,
      causticSpeed: 0.3,
      causticScale: 0.05,
      causticOpacity: 0.15,
      transitionSpeed: 0.5,
      ...config,
    };
    this.noise = new NoiseUtils(42);
    this.underwaterFog = new THREE.FogExp2(
      this.config.fogColor.getHex(),
      this.config.fogDensity
    );
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Update underwater effects based on camera position.
   * Call each frame from useFrame.
   *
   * @param camera - The scene camera
   * @param scene - The Three.js scene (for fog/background changes)
   * @param dt - Delta time in seconds
   */
  update(camera: THREE.Camera, scene: THREE.Scene, dt: number): void {
    this.time += dt;

    const cameraY = camera.position.y;
    const depthBelowSurface = this.config.waterLevel - cameraY;

    // Determine if underwater
    this.isUnderwater = depthBelowSurface > 0;

    // Smooth transition blend
    const targetBlend = this.isUnderwater ? 1.0 : 0.0;
    const blendSpeed = this.config.transitionSpeed;
    this.currentBlend += (targetBlend - this.currentBlend) * blendSpeed * dt * 3.0;
    this.currentBlend = Math.max(0, Math.min(1, this.currentBlend));

    if (this.currentBlend > 0.01) {
      // Apply underwater effects
      this.applyUnderwaterEffects(scene, depthBelowSurface);
    } else if (this.currentBlend < 0.01 && this.savedFog !== null) {
      // Restore above-water settings
      this.restoreAboveWaterEffects(scene);
    }

    // Update caustic overlay
    if (this.causticOverlay && this.isUnderwater) {
      this.updateCausticOverlay(depthBelowSurface);
    }
  }

  /**
   * Check if the camera is currently underwater
   */
  isCameraUnderwater(): boolean {
    return this.isUnderwater;
  }

  /**
   * Get the current depth below water surface (0 if above)
   */
  getDepthBelowSurface(cameraY: number): number {
    return Math.max(0, this.config.waterLevel - cameraY);
  }

  /**
   * Get the current underwater blend factor (0-1)
   */
  getBlendFactor(): number {
    return this.currentBlend;
  }

  /**
   * Create a caustic overlay plane that sits in front of the camera
   * for simulating caustic light patterns when underwater
   */
  createCausticOverlay(): THREE.Mesh | null {
    try {
      this.causticTexture = this.createCausticTexture();

      const geometry = new THREE.PlaneGeometry(2, 2);
      const material = new THREE.MeshBasicMaterial({
        map: this.causticTexture,
        transparent: true,
        opacity: this.config.causticOpacity,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      this.causticOverlay = new THREE.Mesh(geometry, material);
      this.causticOverlay.renderOrder = 9999;
      this.causticOverlay.visible = false;
      return this.causticOverlay;
    } catch (err) {
      // Expected fallback in rendering pipeline
      if (process.env.NODE_ENV === 'development') console.debug('[UnderwaterEffects] caustic overlay creation fallback:', err);
      return null;
    }
  }

  /**
   * Position the caustic overlay relative to camera (call each frame)
   */
  positionCausticOverlay(camera: THREE.Camera): void {
    if (!this.causticOverlay) return;

    if (this.isUnderwater) {
      this.causticOverlay.visible = true;

      // Position overlay in front of camera
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      this.causticOverlay.position.copy(camera.position).add(dir.multiplyScalar(1.0));
      this.causticOverlay.lookAt(camera.position);
    } else {
      this.causticOverlay.visible = false;
    }
  }

  /**
   * Query if a world position is below water
   */
  isPositionUnderwater(y: number): boolean {
    return y < this.config.waterLevel;
  }

  /**
   * Get depth-based color tint for a position
   */
  getUnderwaterTint(y: number): THREE.Color {
    const depth = Math.max(0, this.config.waterLevel - y);
    const normalizedDepth = Math.min(depth / this.config.depthScale, 1.0);
    const tint = new THREE.Color(this.config.fogColor);
    tint.multiplyScalar(normalizedDepth * this.config.tintStrength);
    return tint;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    if (this.causticTexture) {
      this.causticTexture.dispose();
    }
    if (this.causticOverlay) {
      this.causticOverlay.geometry.dispose();
      (this.causticOverlay.material as THREE.MeshBasicMaterial).dispose();
    }
  }

  // ------------------------------------------------------------------
  // Internal Methods
  // ------------------------------------------------------------------

  /**
   * Apply underwater fog and color effects to the scene
   */
  private applyUnderwaterEffects(scene: THREE.Scene, depthBelowSurface: number): void {
    // Save original fog/bg on first transition
    if (this.savedFog === null) {
      this.savedFog = scene.fog as THREE.Fog | THREE.FogExp2 | null;
      this.savedBgColor = scene.background instanceof THREE.Color
        ? scene.background.clone()
        : new THREE.Color(0x87ceeb);
    }

    // Compute depth-based fog density
    const normalizedDepth = Math.min(
      Math.max(depthBelowSurface, 0) / this.config.depthScale,
      1.0
    );
    const fogDensity = this.config.fogDensity +
      (this.config.maxFogDensity - this.config.fogDensity) * normalizedDepth;

    // Blend fog
    this.underwaterFog.density = fogDensity;
    this.underwaterFog.color.copy(this.config.fogColor);

    // Apply blended fog
    if (this.currentBlend > 0.5) {
      scene.fog = this.underwaterFog;
    }

    // Blend background color toward underwater color
    if (this.savedBgColor && scene.background instanceof THREE.Color) {
      scene.background.copy(this.savedBgColor).lerp(
        this.config.fogColor,
        this.currentBlend * this.config.tintStrength
      );
    }
  }

  /**
   * Restore above-water scene settings
   */
  private restoreAboveWaterEffects(scene: THREE.Scene): void {
    if (this.savedFog !== null) {
      scene.fog = this.savedFog;
      this.savedFog = null;
    }
    if (this.savedBgColor && scene.background instanceof THREE.Color) {
      scene.background.copy(this.savedBgColor);
    }
    this.savedBgColor = null;
  }

  /**
   * Update caustic overlay appearance based on depth
   */
  private updateCausticOverlay(depthBelowSurface: number): void {
    if (!this.causticOverlay || !this.causticTexture) return;

    const material = this.causticOverlay.material as THREE.MeshBasicMaterial;

    // Reduce caustic intensity with depth (less light penetrates deeper)
    const normalizedDepth = Math.min(
      Math.max(depthBelowSurface, 0) / this.config.depthScale,
      1.0
    );
    const intensity = this.config.causticIntensity * (1.0 - normalizedDepth * 0.7);
    material.opacity = this.config.causticOpacity * intensity * this.currentBlend;

    // Update caustic texture animation
    this.updateCausticTexture();
  }

  /**
   * Create a caustic pattern texture
   */
  private createCausticTexture(): THREE.CanvasTexture | null {
    try {
      const canvas = createCanvas();
      const res = 256;
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Fill with initial caustic pattern
      this.renderCausticToCanvas(ctx, res);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);

      return texture;
    } catch (err) {
      // Expected fallback in rendering pipeline
      if (process.env.NODE_ENV === 'development') console.debug('[UnderwaterEffects] caustic texture creation fallback:', err);
      return null;
    }
  }

  /**
   * Update the caustic texture with animation
   */
  private updateCausticTexture(): void {
    if (!this.causticTexture) return;

    const canvas = this.causticTexture.image as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.renderCausticToCanvas(ctx, canvas.width);
    this.causticTexture.needsUpdate = true;
  }

  /**
   * Render caustic pattern to a canvas context
   */
  private renderCausticToCanvas(ctx: CanvasRenderingContext2D, res: number): void {
    const imageData = ctx.createImageData(res, res);
    const data = imageData.data;
    const t = this.time * this.config.causticSpeed;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;

        // Two overlapping noise fields create caustic-like patterns
        const n1 = this.noise.perlin2D(
          x * this.config.causticScale + t,
          y * this.config.causticScale + t * 0.7
        );
        const n2 = this.noise.perlin2D(
          x * this.config.causticScale * 1.5 + t * 0.5 + 50,
          y * this.config.causticScale * 1.5 + t * 0.3 + 50
        );

        // Combine to create bright caustic lines
        const caustic = Math.pow(Math.abs(n1 + n2), 0.5) * this.config.causticIntensity;

        // Bright cyan-white caustic light
        const brightness = Math.min(caustic * 255, 255);
        data[idx] = brightness * 0.7;     // R
        data[idx + 1] = brightness * 0.9;  // G
        data[idx + 2] = brightness;        // B
        data[idx + 3] = 255;               // A
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  updateConfig(partial: Partial<UnderwaterEffectsConfig>): void {
    Object.assign(this.config, partial);
    this.underwaterFog.color.copy(this.config.fogColor);
    this.underwaterFog.density = this.config.fogDensity;
  }

  getConfig(): UnderwaterEffectsConfig {
    return { ...this.config };
  }
}
