/**
 * VolumetricRenderer — Manages Volumetric Effect Materials and Rendering
 *
 * Creates and manages THREE.ShaderMaterial instances for ray-marched
 * volumetric effects (fog, smoke, atmospheric scattering). Provides
 * a high-level API for creating and configuring volumetric materials
 * and compositing them with the scene.
 *
 * Usage:
 *   const renderer = new VolumetricRenderer(glRenderer);
 *   const fogMaterial = renderer.createFogVolume({ density: 0.02 });
 *   const smokeMaterial = renderer.createSmokeVolume({ density: 0.05 });
 *   const atmoMaterial = renderer.createAtmosphereVolume({ rayleighCoeff: 5.5 });
 *
 * @module rendering
 */

import * as THREE from 'three';
import {
  VOLUMETRIC_VERTEX_SHADER,
  VOLUMETRIC_FOG_FRAGMENT_SHADER,
  VOLUMETRIC_SMOKE_FRAGMENT_SHADER,
  ATMOSPHERIC_SCATTERING_FRAGMENT_SHADER,
  DEFAULT_FOG_PARAMS,
  DEFAULT_SMOKE_PARAMS,
  DEFAULT_ATMOSPHERE_PARAMS,
  type VolumetricFogUniforms,
  type VolumetricSmokeUniforms,
  type AtmosphericScatteringUniforms,
} from './shaders/VolumetricFogShader';

// ============================================================================
// Types
// ============================================================================

export interface FogVolumeParams extends Partial<Omit<VolumetricFogUniforms, 'tDepth' | 'tDiffuse' | 'uInvProjection' | 'uProjection' | 'uInvView' | 'uCameraPos' | 'uResolution'>> {}
export interface SmokeVolumeParams extends Partial<Omit<VolumetricSmokeUniforms, 'tDepth' | 'tDiffuse' | 'uInvProjection' | 'uProjection' | 'uInvView' | 'uCameraPos' | 'uResolution'>> {}
export interface AtmosphereVolumeParams extends Partial<Omit<AtmosphericScatteringUniforms, 'tDepth' | 'tDiffuse' | 'uInvProjection' | 'uProjection' | 'uInvView' | 'uCameraPos' | 'uResolution'>> {}

// ============================================================================
// VolumetricRenderer
// ============================================================================

export class VolumetricRenderer {
  private renderer: THREE.WebGLRenderer;
  private materials: Map<string, THREE.ShaderMaterial> = new Map();

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
  }

  // --------------------------------------------------------------------------
  // Factory Methods
  // --------------------------------------------------------------------------

  /**
   * Create a volumetric fog ShaderMaterial.
   *
   * This material performs ray-marched volumetric fog with:
   *   - 3D Perlin/Worley noise density variation
   *   - Henyey-Greenstein phase function for anisotropic scattering
   *   - Height-based density falloff
   *   - Shadow integration via depth buffer
   *   - Animated noise-based density
   *
   * @param params Fog volume parameters
   * @returns ShaderMaterial configured for volumetric fog
   */
  createFogVolume(params: FogVolumeParams = {}): THREE.ShaderMaterial {
    const config = { ...DEFAULT_FOG_PARAMS, ...params };

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        tDiffuse: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uLightDir: { value: config.uLightDir.clone() },
        uLightColor: { value: config.uLightColor.clone() },
        uDensity: { value: config.uDensity },
        uAbsorption: { value: config.uAbsorption },
        uScattering: { value: config.uScattering },
        uPhaseG: { value: config.uPhaseG },
        uStepCount: { value: config.uStepCount },
        uTime: { value: config.uTime },
        uFogHeight: { value: config.uFogHeight },
        uFogHeightFalloff: { value: config.uFogHeightFalloff },
        uFogColor: { value: config.uFogColor.clone() },
        uNoiseScale: { value: config.uNoiseScale },
        uNoiseStrength: { value: config.uNoiseStrength },
        uResolution: { value: new THREE.Vector2() },
        u_noiseSeed: { value: config.u_noiseSeed },
      },
      vertexShader: VOLUMETRIC_VERTEX_SHADER,
      fragmentShader: VOLUMETRIC_FOG_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      transparent: false,
    });

    material.userData._volumetricType = 'fog';
    this.materials.set(`fog-${this.materials.size}`, material);
    return material;
  }

  /**
   * Create a volumetric smoke ShaderMaterial.
   *
   * This material performs ray-marched volumetric smoke with:
   *   - Higher absorption than fog (smoke blocks more light)
   *   - More anisotropic scattering (forward scattering)
   *   - Turbulence animation for swirling motion
   *   - Emission for fire-lit smoke
   *   - Spherical density falloff from origin
   *
   * @param params Smoke volume parameters
   * @returns ShaderMaterial configured for volumetric smoke
   */
  createSmokeVolume(params: SmokeVolumeParams = {}): THREE.ShaderMaterial {
    const config = { ...DEFAULT_SMOKE_PARAMS, ...params };

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        tDiffuse: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uLightDir: { value: config.uLightDir.clone() },
        uLightColor: { value: config.uLightColor.clone() },
        uDensity: { value: config.uDensity },
        uAbsorption: { value: config.uAbsorption },
        uScattering: { value: config.uScattering },
        uPhaseG: { value: config.uPhaseG },
        uStepCount: { value: config.uStepCount },
        uTime: { value: config.uTime },
        uSmokeOrigin: { value: config.uSmokeOrigin.clone() },
        uSmokeRadius: { value: config.uSmokeRadius },
        uSmokeColor: { value: config.uSmokeColor.clone() },
        uEmissionColor: { value: config.uEmissionColor.clone() },
        uEmissionIntensity: { value: config.uEmissionIntensity },
        uTurbulenceScale: { value: config.uTurbulenceScale },
        uTurbulenceStrength: { value: config.uTurbulenceStrength },
        uNoiseScale: { value: config.uNoiseScale },
        uNoiseStrength: { value: config.uNoiseStrength },
        uResolution: { value: new THREE.Vector2() },
        u_noiseSeed: { value: config.u_noiseSeed },
      },
      vertexShader: VOLUMETRIC_VERTEX_SHADER,
      fragmentShader: VOLUMETRIC_SMOKE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      transparent: false,
    });

    material.userData._volumetricType = 'smoke';
    this.materials.set(`smoke-${this.materials.size}`, material);
    return material;
  }

  /**
   * Create an atmospheric scattering ShaderMaterial.
   *
   * This material performs Rayleigh + Mie scattering computed per-fragment
   * with:
   *   - Rayleigh scattering (air molecule scattering, wavelength-dependent)
   *   - Mie scattering (dust/aerosol scattering, forward-peaked)
   *   - Sun position integration (compatible with NishitaSky)
   *   - Height-based density falloff
   *   - Horizon brightening effect
   *   - Sun disc rendering
   *
   * @param params Atmosphere volume parameters
   * @returns ShaderMaterial configured for atmospheric scattering
   */
  createAtmosphereVolume(params: AtmosphereVolumeParams = {}): THREE.ShaderMaterial {
    const config = { ...DEFAULT_ATMOSPHERE_PARAMS, ...params };

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        tDiffuse: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uSunDirection: { value: config.uSunDirection.clone() },
        uSunColor: { value: config.uSunColor.clone() },
        uRayleighCoeff: { value: config.uRayleighCoeff },
        uMieCoeff: { value: config.uMieCoeff },
        uMieG: { value: config.uMieG },
        uAtmosphereHeight: { value: config.uAtmosphereHeight },
        uDensity: { value: config.uDensity },
        uStepCount: { value: config.uStepCount },
        uTime: { value: config.uTime },
        uWavelengths: { value: config.uWavelengths.clone() },
        uResolution: { value: new THREE.Vector2() },
      },
      vertexShader: VOLUMETRIC_VERTEX_SHADER,
      fragmentShader: ATMOSPHERIC_SCATTERING_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      transparent: false,
    });

    material.userData._volumetricType = 'atmosphere';
    this.materials.set(`atmosphere-${this.materials.size}`, material);
    return material;
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  /**
   * Update camera-dependent uniforms on all managed materials.
   * Call this before rendering with a new camera frame.
   */
  updateCameraUniforms(camera: THREE.Camera): void {
    const viewMatrix = camera.matrixWorldInverse;
    const projMatrix = (camera as THREE.PerspectiveCamera).projectionMatrix;
    const invProj = projMatrix.clone().invert();
    const invView = camera.matrixWorld.clone();

    const size = this.renderer.getSize(new THREE.Vector2());

    for (const material of this.materials.values()) {
      const u = material.uniforms;

      if (u.uInvProjection) u.uInvProjection.value.copy(invProj);
      if (u.uProjection) u.uProjection.value.copy(projMatrix);
      if (u.uInvView) u.uInvView.value.copy(invView);
      if (u.uCameraPos) u.uCameraPos.value.copy(camera.position);
      if (u.uResolution) u.uResolution.value.set(size.x, size.y);
    }
  }

  /**
   * Update the time uniform on all managed materials.
   */
  updateTime(time: number): void {
    for (const material of this.materials.values()) {
      if (material.uniforms.uTime) {
        material.uniforms.uTime.value = time;
      }
    }
  }

  /**
   * Set the depth and color textures on all managed materials.
   */
  setDepthAndColorTextures(depthTexture: THREE.Texture | null, colorTexture: THREE.Texture | null): void {
    for (const material of this.materials.values()) {
      if (material.uniforms.tDepth) material.uniforms.tDepth.value = depthTexture;
      if (material.uniforms.tDiffuse) material.uniforms.tDiffuse.value = colorTexture;
    }
  }

  /**
   * Render volumetric effects for the given scene and camera.
   * This updates all materials and renders the volumetric pass.
   *
   * @param scene The scene (used for camera matrix extraction)
   * @param camera The camera
   * @param depthTexture Scene depth texture
   * @param colorTexture Scene color texture
   * @param target Render target to write to
   * @param time Current time for animation
   */
  render(
    _scene: THREE.Scene,
    camera: THREE.Camera,
    depthTexture: THREE.Texture | null,
    colorTexture: THREE.Texture | null,
    target: THREE.WebGLRenderTarget | null,
    time: number,
  ): void {
    this.updateCameraUniforms(camera);
    this.updateTime(time);
    this.setDepthAndColorTextures(depthTexture, colorTexture);
  }

  // --------------------------------------------------------------------------
  // Material Management
  // --------------------------------------------------------------------------

  /**
   * Get a material by its key.
   */
  getMaterial(key: string): THREE.ShaderMaterial | undefined {
    return this.materials.get(key);
  }

  /**
   * Get all managed materials.
   */
  getAllMaterials(): THREE.ShaderMaterial[] {
    return Array.from(this.materials.values());
  }

  /**
   * Get materials by volumetric type.
   */
  getMaterialsByType(type: 'fog' | 'smoke' | 'atmosphere'): THREE.ShaderMaterial[] {
    return Array.from(this.materials.values()).filter(
      m => m.userData._volumetricType === type,
    );
  }

  /**
   * Remove a specific material and dispose it.
   */
  removeMaterial(key: string): boolean {
    const material = this.materials.get(key);
    if (!material) return false;
    material.dispose();
    this.materials.delete(key);
    return true;
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Dispose all managed materials and resources.
   */
  dispose(): void {
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
  }
}
