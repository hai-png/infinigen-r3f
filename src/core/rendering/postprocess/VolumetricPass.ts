/**
 * VolumetricPass — Full-Screen Post-Processing Pass for Volumetric Effects
 *
 * Renders ray-marched volumetric effects (fog, smoke, atmosphere) as a
 * full-screen post-processing pass. Composites the volumetric result
 * over the rendered scene using the depth buffer for proper occlusion.
 *
 * The pass supports three independent volumetric layers that are composited
 * together:
 *   1. Atmosphere (background, affects everything)
 *   2. Fog (mid-ground, height-based)
 *   3. Smoke (foreground, localized)
 *
 * Each layer can be enabled/disabled independently and has its own
 * parameter set that can be updated at runtime.
 *
 * Usage:
 *   const pass = new VolumetricPass(1920, 1080);
 *   pass.setFogParams({ density: 0.02 });
 *   pass.render(renderer, scene, camera, depthTexture);
 *   const result = pass.getResult();
 *
 * @module rendering/postprocess
 */

import * as THREE from 'three';
import {
  VOLUMETRIC_VERTEX_SHADER,
  VOLUMETRIC_FOG_FRAGMENT_SHADER,
  VOLUMETRIC_SMOKE_FRAGMENT_SHADER,
  ATMOSPHERIC_SCATTERING_FRAGMENT_SHADER,
  VOLUMETRIC_COMPOSITE_FRAGMENT_SHADER,
  DEFAULT_FOG_PARAMS,
  DEFAULT_SMOKE_PARAMS,
  DEFAULT_ATMOSPHERE_PARAMS,
  type VolumetricFogUniforms,
  type VolumetricSmokeUniforms,
  type AtmosphericScatteringUniforms,
} from '../shaders/VolumetricFogShader';

// ============================================================================
// Types
// ============================================================================

export interface VolumetricFogParams extends Partial<Omit<VolumetricFogUniforms, 'tDepth' | 'tDiffuse' | 'uInvProjection' | 'uProjection' | 'uInvView' | 'uCameraPos' | 'uResolution'>> {}
export interface VolumetricSmokeParams extends Partial<Omit<VolumetricSmokeUniforms, 'tDepth' | 'tDiffuse' | 'uInvProjection' | 'uProjection' | 'uInvView' | 'uCameraPos' | 'uResolution'>> {}
export interface VolumetricAtmosphereParams extends Partial<Omit<AtmosphericScatteringUniforms, 'tDepth' | 'tDiffuse' | 'uInvProjection' | 'uProjection' | 'uInvView' | 'uCameraPos' | 'uResolution'>> {}

export interface VolumetricPassConfig {
  /** Enable fog layer (default: true) */
  fogEnabled: boolean;
  /** Enable smoke layer (default: false) */
  smokeEnabled: boolean;
  /** Enable atmosphere layer (default: true) */
  atmosphereEnabled: boolean;
  /** Resolution scale for volumetric passes (default: 0.5 = half-res for perf) */
  resolution: number;
  /** Global blend factor for volumetric effects (default: 1.0) */
  blendFactor: number;
}

const DEFAULT_CONFIG: VolumetricPassConfig = {
  fogEnabled: true,
  smokeEnabled: false,
  atmosphereEnabled: true,
  resolution: 0.5,
  blendFactor: 1.0,
};

// ============================================================================
// Shared Geometry
// ============================================================================

const _quadGeom = new THREE.PlaneGeometry(2, 2);

// ============================================================================
// VolumetricPass
// ============================================================================

export class VolumetricPass {
  readonly config: VolumetricPassConfig;

  // Render targets
  private fogRT: THREE.WebGLRenderTarget;
  private smokeRT: THREE.WebGLRenderTarget;
  private atmosphereRT: THREE.WebGLRenderTarget;
  private compositeRT: THREE.WebGLRenderTarget;

  // Materials
  private fogMaterial: THREE.ShaderMaterial;
  private smokeMaterial: THREE.ShaderMaterial;
  private atmosphereMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;

  // Fullscreen quad
  private quad: THREE.Mesh;
  private _quadScene: THREE.Scene | null = null;

  // Camera for fullscreen projection
  private _camera: THREE.OrthographicCamera;

  // Frame counter for temporal effects
  private frameIndex: number = 0;

  constructor(width: number, height: number, config: Partial<VolumetricPassConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const resScale = this.config.resolution;
    const w = Math.max(1, Math.floor(width * resScale));
    const h = Math.max(1, Math.floor(height * resScale));

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };

    this.fogRT = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.smokeRT = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.atmosphereRT = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.compositeRT = new THREE.WebGLRenderTarget(width, height, rtOpts);

    // Fog material
    this.fogMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        tDiffuse: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uLightDir: { value: DEFAULT_FOG_PARAMS.uLightDir.clone() },
        uLightColor: { value: DEFAULT_FOG_PARAMS.uLightColor.clone() },
        uDensity: { value: DEFAULT_FOG_PARAMS.uDensity },
        uAbsorption: { value: DEFAULT_FOG_PARAMS.uAbsorption },
        uScattering: { value: DEFAULT_FOG_PARAMS.uScattering },
        uPhaseG: { value: DEFAULT_FOG_PARAMS.uPhaseG },
        uStepCount: { value: DEFAULT_FOG_PARAMS.uStepCount },
        uTime: { value: 0.0 },
        uFogHeight: { value: DEFAULT_FOG_PARAMS.uFogHeight },
        uFogHeightFalloff: { value: DEFAULT_FOG_PARAMS.uFogHeightFalloff },
        uFogColor: { value: DEFAULT_FOG_PARAMS.uFogColor.clone() },
        uNoiseScale: { value: DEFAULT_FOG_PARAMS.uNoiseScale },
        uNoiseStrength: { value: DEFAULT_FOG_PARAMS.uNoiseStrength },
        uResolution: { value: new THREE.Vector2(w, h) },
        u_noiseSeed: { value: 0 },
      },
      vertexShader: VOLUMETRIC_VERTEX_SHADER,
      fragmentShader: VOLUMETRIC_FOG_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // Smoke material
    this.smokeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        tDiffuse: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uLightDir: { value: DEFAULT_SMOKE_PARAMS.uLightDir.clone() },
        uLightColor: { value: DEFAULT_SMOKE_PARAMS.uLightColor.clone() },
        uDensity: { value: DEFAULT_SMOKE_PARAMS.uDensity },
        uAbsorption: { value: DEFAULT_SMOKE_PARAMS.uAbsorption },
        uScattering: { value: DEFAULT_SMOKE_PARAMS.uScattering },
        uPhaseG: { value: DEFAULT_SMOKE_PARAMS.uPhaseG },
        uStepCount: { value: DEFAULT_SMOKE_PARAMS.uStepCount },
        uTime: { value: 0.0 },
        uSmokeOrigin: { value: DEFAULT_SMOKE_PARAMS.uSmokeOrigin.clone() },
        uSmokeRadius: { value: DEFAULT_SMOKE_PARAMS.uSmokeRadius },
        uSmokeColor: { value: DEFAULT_SMOKE_PARAMS.uSmokeColor.clone() },
        uEmissionColor: { value: DEFAULT_SMOKE_PARAMS.uEmissionColor.clone() },
        uEmissionIntensity: { value: DEFAULT_SMOKE_PARAMS.uEmissionIntensity },
        uTurbulenceScale: { value: DEFAULT_SMOKE_PARAMS.uTurbulenceScale },
        uTurbulenceStrength: { value: DEFAULT_SMOKE_PARAMS.uTurbulenceStrength },
        uNoiseScale: { value: DEFAULT_SMOKE_PARAMS.uNoiseScale },
        uNoiseStrength: { value: DEFAULT_SMOKE_PARAMS.uNoiseStrength },
        uResolution: { value: new THREE.Vector2(w, h) },
        u_noiseSeed: { value: 0 },
      },
      vertexShader: VOLUMETRIC_VERTEX_SHADER,
      fragmentShader: VOLUMETRIC_SMOKE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // Atmosphere material
    this.atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        tDiffuse: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uSunDirection: { value: DEFAULT_ATMOSPHERE_PARAMS.uSunDirection.clone() },
        uSunColor: { value: DEFAULT_ATMOSPHERE_PARAMS.uSunColor.clone() },
        uRayleighCoeff: { value: DEFAULT_ATMOSPHERE_PARAMS.uRayleighCoeff },
        uMieCoeff: { value: DEFAULT_ATMOSPHERE_PARAMS.uMieCoeff },
        uMieG: { value: DEFAULT_ATMOSPHERE_PARAMS.uMieG },
        uAtmosphereHeight: { value: DEFAULT_ATMOSPHERE_PARAMS.uAtmosphereHeight },
        uDensity: { value: DEFAULT_ATMOSPHERE_PARAMS.uDensity },
        uStepCount: { value: DEFAULT_ATMOSPHERE_PARAMS.uStepCount },
        uTime: { value: 0.0 },
        uWavelengths: { value: DEFAULT_ATMOSPHERE_PARAMS.uWavelengths.clone() },
        uResolution: { value: new THREE.Vector2(w, h) },
      },
      vertexShader: VOLUMETRIC_VERTEX_SHADER,
      fragmentShader: ATMOSPHERIC_SCATTERING_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // Composite material
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tVolumetric: { value: null },
        uBlendFactor: { value: this.config.blendFactor },
      },
      vertexShader: VOLUMETRIC_VERTEX_SHADER,
      fragmentShader: VOLUMETRIC_COMPOSITE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // Fullscreen quad
    this.quad = new THREE.Mesh(_quadGeom, this.fogMaterial);
    this.quad.frustumCulled = false;

    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Update fog parameters at runtime.
   */
  setFogParams(params: VolumetricFogParams): void {
    const u = this.fogMaterial.uniforms;
    if (params.uLightDir !== undefined) u.uLightDir.value.copy(params.uLightDir);
    if (params.uLightColor !== undefined) u.uLightColor.value.copy(params.uLightColor);
    if (params.uDensity !== undefined) u.uDensity.value = params.uDensity;
    if (params.uAbsorption !== undefined) u.uAbsorption.value = params.uAbsorption;
    if (params.uScattering !== undefined) u.uScattering.value = params.uScattering;
    if (params.uPhaseG !== undefined) u.uPhaseG.value = params.uPhaseG;
    if (params.uStepCount !== undefined) u.uStepCount.value = params.uStepCount;
    if (params.uFogHeight !== undefined) u.uFogHeight.value = params.uFogHeight;
    if (params.uFogHeightFalloff !== undefined) u.uFogHeightFalloff.value = params.uFogHeightFalloff;
    if (params.uFogColor !== undefined) u.uFogColor.value.copy(params.uFogColor);
    if (params.uNoiseScale !== undefined) u.uNoiseScale.value = params.uNoiseScale;
    if (params.uNoiseStrength !== undefined) u.uNoiseStrength.value = params.uNoiseStrength;
    if (params.u_noiseSeed !== undefined) u.u_noiseSeed.value = params.u_noiseSeed;
  }

  /**
   * Update smoke parameters at runtime.
   */
  setSmokeParams(params: VolumetricSmokeParams): void {
    const u = this.smokeMaterial.uniforms;
    if (params.uLightDir !== undefined) u.uLightDir.value.copy(params.uLightDir);
    if (params.uLightColor !== undefined) u.uLightColor.value.copy(params.uLightColor);
    if (params.uDensity !== undefined) u.uDensity.value = params.uDensity;
    if (params.uAbsorption !== undefined) u.uAbsorption.value = params.uAbsorption;
    if (params.uScattering !== undefined) u.uScattering.value = params.uScattering;
    if (params.uPhaseG !== undefined) u.uPhaseG.value = params.uPhaseG;
    if (params.uStepCount !== undefined) u.uStepCount.value = params.uStepCount;
    if (params.uSmokeOrigin !== undefined) u.uSmokeOrigin.value.copy(params.uSmokeOrigin);
    if (params.uSmokeRadius !== undefined) u.uSmokeRadius.value = params.uSmokeRadius;
    if (params.uSmokeColor !== undefined) u.uSmokeColor.value.copy(params.uSmokeColor);
    if (params.uEmissionColor !== undefined) u.uEmissionColor.value.copy(params.uEmissionColor);
    if (params.uEmissionIntensity !== undefined) u.uEmissionIntensity.value = params.uEmissionIntensity;
    if (params.uTurbulenceScale !== undefined) u.uTurbulenceScale.value = params.uTurbulenceScale;
    if (params.uTurbulenceStrength !== undefined) u.uTurbulenceStrength.value = params.uTurbulenceStrength;
    if (params.uNoiseScale !== undefined) u.uNoiseScale.value = params.uNoiseScale;
    if (params.uNoiseStrength !== undefined) u.uNoiseStrength.value = params.uNoiseStrength;
    if (params.u_noiseSeed !== undefined) u.u_noiseSeed.value = params.u_noiseSeed;
  }

  /**
   * Update atmosphere parameters at runtime.
   */
  setAtmosphereParams(params: VolumetricAtmosphereParams): void {
    const u = this.atmosphereMaterial.uniforms;
    if (params.uSunDirection !== undefined) u.uSunDirection.value.copy(params.uSunDirection);
    if (params.uSunColor !== undefined) u.uSunColor.value.copy(params.uSunColor);
    if (params.uRayleighCoeff !== undefined) u.uRayleighCoeff.value = params.uRayleighCoeff;
    if (params.uMieCoeff !== undefined) u.uMieCoeff.value = params.uMieCoeff;
    if (params.uMieG !== undefined) u.uMieG.value = params.uMieG;
    if (params.uAtmosphereHeight !== undefined) u.uAtmosphereHeight.value = params.uAtmosphereHeight;
    if (params.uDensity !== undefined) u.uDensity.value = params.uDensity;
    if (params.uStepCount !== undefined) u.uStepCount.value = params.uStepCount;
    if (params.uWavelengths !== undefined) u.uWavelengths.value.copy(params.uWavelengths);
  }

  /**
   * Execute the volumetric rendering pass.
   *
   * Renders volumetric effects and composites them over the scene.
   *
   * @param renderer The WebGL renderer
   * @param scene The scene (unused directly, camera provides matrices)
   * @param camera The camera
   * @param depthTexture Scene depth buffer texture
   * @param colorTexture Scene color buffer texture (optional; uses composite RT if not provided)
   * @param time Current time for animation
   */
  render(
    renderer: THREE.WebGLRenderer,
    _scene: THREE.Scene,
    camera: THREE.Camera,
    depthTexture: THREE.Texture,
    colorTexture?: THREE.Texture,
    time?: number,
  ): void {
    this.frameIndex++;
    const currentTime = time ?? performance.now() * 0.001;

    // Update camera-dependent uniforms
    const viewMatrix = camera.matrixWorldInverse.clone();
    const projMatrix = (camera as THREE.PerspectiveCamera).projectionMatrix.clone();
    const invProj = projMatrix.clone().invert();
    const invView = camera.matrixWorld.clone();
    const size = renderer.getSize(new THREE.Vector2());

    // Set uniforms for all volumetric materials
    const materials = [this.fogMaterial, this.smokeMaterial, this.atmosphereMaterial];
    for (const mat of materials) {
      const u = mat.uniforms;
      if (u.uInvProjection) u.uInvProjection.value.copy(invProj);
      if (u.uProjection) u.uProjection.value.copy(projMatrix);
      if (u.uInvView) u.uInvView.value.copy(invView);
      if (u.uCameraPos) u.uCameraPos.value.copy(camera.position);
      if (u.uResolution) u.uResolution.value.set(size.x, size.y);
      if (u.uTime) u.uTime.value = currentTime;
      if (u.tDepth) u.tDepth.value = depthTexture;
      if (u.tDiffuse && colorTexture) u.tDiffuse.value = colorTexture;
    }

    // Store original auto-clear state
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;

    // --- Pass 1: Atmosphere (if enabled) ---
    if (this.config.atmosphereEnabled) {
      this.quad.material = this.atmosphereMaterial;
      this.atmosphereMaterial.uniforms.tDiffuse.value = colorTexture ?? null;
      renderer.setRenderTarget(this.atmosphereRT);
      renderer.render(this.getQuadScene(), this._camera);
    }

    // --- Pass 2: Fog (if enabled) ---
    if (this.config.fogEnabled) {
      this.quad.material = this.fogMaterial;
      // Fog reads the scene color + atmosphere as input
      const fogInputColor = this.config.atmosphereEnabled
        ? this.atmosphereRT.texture
        : (colorTexture ?? null);
      this.fogMaterial.uniforms.tDiffuse.value = fogInputColor;
      renderer.setRenderTarget(this.fogRT);
      renderer.render(this.getQuadScene(), this._camera);
    }

    // --- Pass 3: Smoke (if enabled) ---
    if (this.config.smokeEnabled) {
      this.quad.material = this.smokeMaterial;
      // Smoke reads scene + atmosphere + fog as input
      const smokeInputColor = this.config.fogEnabled
        ? this.fogRT.texture
        : (this.config.atmosphereEnabled
            ? this.atmosphereRT.texture
            : (colorTexture ?? null));
      this.smokeMaterial.uniforms.tDiffuse.value = smokeInputColor;
      renderer.setRenderTarget(this.smokeRT);
      renderer.render(this.getQuadScene(), this._camera);
    }

    // --- Pass 4: Composite ---
    // Determine which volumetric result to use as final
    let volResult: THREE.Texture;
    if (this.config.smokeEnabled) {
      volResult = this.smokeRT.texture;
    } else if (this.config.fogEnabled) {
      volResult = this.fogRT.texture;
    } else if (this.config.atmosphereEnabled) {
      volResult = this.atmosphereRT.texture;
    } else {
      // No volumetric effects enabled — just pass through scene color
      renderer.autoClear = autoClear;
      return;
    }

    this.compositeMaterial.uniforms.tDiffuse.value = colorTexture ?? null;
    this.compositeMaterial.uniforms.tVolumetric.value = volResult;
    this.compositeMaterial.uniforms.uBlendFactor.value = this.config.blendFactor;

    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.compositeRT);
    renderer.render(this.getQuadScene(), this._camera);

    // Restore auto-clear
    renderer.autoClear = autoClear;
  }

  /**
   * Get the final composited result texture.
   */
  getResult(): THREE.Texture {
    return this.compositeRT.texture;
  }

  /**
   * Get the fog-only result texture (for debug or custom compositing).
   */
  getFogResult(): THREE.Texture {
    return this.fogRT.texture;
  }

  /**
   * Get the smoke-only result texture.
   */
  getSmokeResult(): THREE.Texture {
    return this.smokeRT.texture;
  }

  /**
   * Get the atmosphere-only result texture.
   */
  getAtmosphereResult(): THREE.Texture {
    return this.atmosphereRT.texture;
  }

  /**
   * Update the pass configuration at runtime.
   */
  setConfig(partial: Partial<VolumetricPassConfig>): void {
    Object.assign(this.config, partial);
    this.compositeMaterial.uniforms.uBlendFactor.value = this.config.blendFactor;
  }

  /**
   * Resize internal render targets.
   */
  setSize(width: number, height: number): void {
    const resScale = this.config.resolution;
    const w = Math.max(1, Math.floor(width * resScale));
    const h = Math.max(1, Math.floor(height * resScale));

    this.fogRT.setSize(w, h);
    this.smokeRT.setSize(w, h);
    this.atmosphereRT.setSize(w, h);
    this.compositeRT.setSize(width, height);

    // Update resolution uniforms
    const materials = [this.fogMaterial, this.smokeMaterial, this.atmosphereMaterial];
    for (const mat of materials) {
      if (mat.uniforms.uResolution) {
        mat.uniforms.uResolution.value.set(w, h);
      }
    }
  }

  /**
   * Dispose all GPU resources.
   */
  dispose(): void {
    this.fogRT.dispose();
    this.smokeRT.dispose();
    this.atmosphereRT.dispose();
    this.compositeRT.dispose();

    this.fogMaterial.dispose();
    this.smokeMaterial.dispose();
    this.atmosphereMaterial.dispose();
    this.compositeMaterial.dispose();

    _quadGeom.dispose();
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private getQuadScene(): THREE.Scene {
    if (!this._quadScene) {
      this._quadScene = new THREE.Scene();
      this._quadScene.add(this.quad);
    }
    return this._quadScene;
  }
}

export default VolumetricPass;
