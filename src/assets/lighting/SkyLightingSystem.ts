/**
 * Sky Lighting System — Nishita-integrated sky and atmospheric lighting
 *
 * Provides a unified sky lighting solution that integrates the physically-based
 * Nishita sky model (Rayleigh + Mie scattering, ozone absorption) with directional
 * and ambient lighting. Falls back to a simple gradient sky + DirectionalLight if
 * the Nishita model fails to initialise.
 *
 * @module lighting
 */

import * as THREE from 'three';
import {
  NishitaSkyHelper,
  createNishitaSkyTexture,
  type NishitaSkyConfig,
} from '../weather/NishitaSky';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the Nishita-backed SkyLightingSystem.
 */
export interface SkyLightingSystemConfig {
  /** Nishita atmospheric parameters (passed through to NishitaSkyHelper) */
  nishita: Partial<NishitaSkyConfig>;

  /** Intensity of the directional sun light. Default: 1.5 */
  sunIntensity: number;

  /** Intensity of the ambient fill light. Default: 0.4 */
  ambientIntensity: number;

  /** Shadow map resolution. Default: 2048 */
  shadowMapSize: number;

  /** Whether to enable shadows. Default: true */
  shadowsEnabled: boolean;

  /** Whether to use Nishita sky. If false, uses legacy fallback. Default: true */
  useNishita: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SKY_LIGHTING_CONFIG: SkyLightingSystemConfig = {
  nishita: {},
  sunIntensity: 1.5,
  ambientIntensity: 0.4,
  shadowMapSize: 2048,
  shadowsEnabled: true,
  useNishita: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute sun direction from elevation and azimuth (same math as NishitaSky).
 * Duplicated here because NishitaSky.computeSunDirection is module-private.
 */
function computeSunDirection(elevationDeg: number, azimuthDeg: number): THREE.Vector3 {
  const elevRad = elevationDeg * (Math.PI / 180);
  const azimRad = azimuthDeg * (Math.PI / 180);

  return new THREE.Vector3(
    Math.cos(elevRad) * Math.sin(azimRad),
    Math.sin(elevRad),
    -Math.cos(elevRad) * Math.cos(azimRad),
  ).normalize();
}

/**
 * Derive a sun colour based on elevation.
 * - Low elevation → warm orange/red (atmospheric scattering removes blue)
 * - High elevation → near-white
 */
function computeSunColor(elevationDeg: number): THREE.Color {
  const t = THREE.MathUtils.clamp(elevationDeg / 90, 0, 1); // 0 at horizon, 1 at zenith

  // Warm orange at horizon → white at zenith
  const r = 1.0;
  const g = THREE.MathUtils.lerp(0.55, 1.0, t);
  const b = THREE.MathUtils.lerp(0.2, 0.95, t);

  return new THREE.Color(r, g, b);
}

/**
 * Derive an ambient light colour from the Nishita sky configuration.
 * Approximates the average sky colour based on sun elevation.
 */
function computeAmbientColor(elevationDeg: number): THREE.Color {
  const t = THREE.MathUtils.clamp(elevationDeg / 90, 0, 1);

  // Twilight → deep blue, noon → light sky blue
  const r = THREE.MathUtils.lerp(0.05, 0.53, t);
  const g = THREE.MathUtils.lerp(0.05, 0.81, t);
  const b = THREE.MathUtils.lerp(0.15, 0.92, t);

  return new THREE.Color(r, g, b);
}

/**
 * Compute sun elevation and azimuth from a time-of-day value (0-24 hours).
 * Matches the same sinusoidal model used in NishitaSkyHelper.setTimeOfDay.
 */
function timeOfDayToSunPosition(hours: number): { elevation: number; azimuth: number } {
  const wrapped = ((hours % 24) + 24) % 24;
  const dayProgress = (wrapped - 6.0) / 12.0; // 0 at 6 am, 1 at 6 pm

  const elevation = Math.sin(Math.max(0, Math.min(1, dayProgress)) * Math.PI) * 90;
  const azimuth = 180 + dayProgress * 180;

  const actualElevation = wrapped >= 6 && wrapped <= 18 ? elevation : -10;

  return { elevation: actualElevation, azimuth };
}

// ---------------------------------------------------------------------------
// SkyLightingSystem
// ---------------------------------------------------------------------------

/**
 * Unified sky lighting system backed by the Nishita atmospheric model.
 *
 * Responsibilities:
 * - Creates and manages the Nishita sky environment texture (scene.background + scene.environment)
 * - Positions a DirectionalLight at the computed sun direction
 * - Provides an AmbientLight with sky-appropriate colour derived from sun elevation
 * - Supports smooth time-of-day transitions (delegated to NishitaSkyHelper)
 * - Falls back to a simple gradient sphere + DirectionalLight if Nishita init fails
 */
export class SkyLightingSystem {
  // ---- Configuration -------------------------------------------------------
  private config: SkyLightingSystemConfig;

  // ---- Nishita sky ---------------------------------------------------------
  private nishitaHelper: NishitaSkyHelper | null = null;
  private nishitaReady = false;

  // ---- Lights --------------------------------------------------------------
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  // ---- Fallback gradient sky -----------------------------------------------
  private fallbackSkyMesh: THREE.Mesh | null = null;
  private usingFallback = false;

  // ---- Sun tracking --------------------------------------------------------
  private sunDirection = new THREE.Vector3(0, 1, 0);
  private currentElevation = 45;
  private currentAzimuth = 180;

  // ---- Scene reference -----------------------------------------------------
  private scene: THREE.Scene | null = null;

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  constructor(config: Partial<SkyLightingSystemConfig> = {}) {
    this.config = { ...DEFAULT_SKY_LIGHTING_CONFIG, ...config };

    // Create sun directional light
    this.sunLight = new THREE.DirectionalLight(0xffffff, this.config.sunIntensity);
    this.sunLight.castShadow = this.config.shadowsEnabled;
    this.sunLight.shadow.mapSize.width = this.config.shadowMapSize;
    this.sunLight.shadow.mapSize.height = this.config.shadowMapSize;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.camera.left = -100;
    this.sunLight.shadow.camera.right = 100;
    this.sunLight.shadow.camera.top = 100;
    this.sunLight.shadow.camera.bottom = -100;

    // Create ambient light
    this.ambientLight = new THREE.AmbientLight(0x87ceeb, this.config.ambientIntensity);

    // Apply initial sun position from nishita config if present
    const nishitaCfg = this.config.nishita;
    if (nishitaCfg.sun_elevation !== undefined) {
      this.currentElevation = nishitaCfg.sun_elevation;
    }
    if (nishitaCfg.sun_azimuth !== undefined) {
      this.currentAzimuth = nishitaCfg.sun_azimuth;
    }
    this.updateSunFromAngles();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Attach the sky lighting system to a scene.
   *
   * Tries to initialise the Nishita sky environment texture. If that fails,
   * falls back to a simple gradient sphere.
   *
   * This method is **async** because creating the Nishita texture may require
   * loading external modules (three-gpu-pathtracer) or computing the texture
   * on the CPU.
   */
  async attach(scene: THREE.Scene): Promise<void> {
    this.scene = scene;

    // Add lights to the scene immediately (they work regardless of sky mode)
    scene.add(this.sunLight);
    scene.add(this.ambientLight);

    if (this.config.useNishita) {
      try {
        this.nishitaHelper = new NishitaSkyHelper(this.config.nishita);
        await this.nishitaHelper.attach(scene);
        this.nishitaReady = true;

        // Remove fallback if it was previously added
        this.removeFallbackSky();

        // Sync sun direction from Nishita config
        const nishitaConfig = this.nishitaHelper.getConfig();
        this.currentElevation = nishitaConfig.sun_elevation;
        this.currentAzimuth = nishitaConfig.sun_azimuth;
        this.updateSunFromAngles();

        console.info('[SkyLightingSystem] Nishita sky attached successfully');
      } catch (err) {
        console.warn('[SkyLightingSystem] Nishita sky failed, using fallback:', err);
        this.nishitaHelper = null;
        this.nishitaReady = false;
        this.createFallbackSky(scene);
      }
    } else {
      this.createFallbackSky(scene);
    }
  }

  /**
   * Detach the sky lighting system from the scene.
   * Removes all lights and sky elements but does **not** dispose resources.
   */
  detach(): void {
    if (this.nishitaHelper && this.nishitaReady) {
      this.nishitaHelper.detach();
    }

    if (this.scene) {
      this.scene.remove(this.sunLight);
      this.scene.remove(this.ambientLight);

      // Clear environment/background if we set them
      if (this.usingFallback) {
        this.scene.environment = null;
        this.scene.background = null;
      }

      this.removeFallbackSky();
    }

    this.scene = null;
  }

  /**
   * Set the time of day (0-24 hours) and update sun position + sky accordingly.
   *
   * Delegates to NishitaSkyHelper when available; otherwise updates the
   * fallback gradient sky and light colours manually.
   */
  async setTimeOfDay(hours: number): Promise<void> {
    const { elevation, azimuth } = timeOfDayToSunPosition(hours);
    this.currentElevation = elevation;
    this.currentAzimuth = azimuth;

    if (this.nishitaHelper && this.nishitaReady) {
      await this.nishitaHelper.setTimeOfDay(hours);

      // Re-read the actual elevation/azimuth after Nishita processes it
      const nishitaConfig = this.nishitaHelper.getConfig();
      this.currentElevation = nishitaConfig.sun_elevation;
      this.currentAzimuth = nishitaConfig.sun_azimuth;
    }

    this.updateSunFromAngles();
    this.updateFallbackColors();
  }

  /**
   * Update atmospheric / Nishita parameters and rebuild the sky texture.
   */
  async updateParams(params: Partial<NishitaSkyConfig>): Promise<void> {
    if (this.nishitaHelper && this.nishitaReady) {
      await this.nishitaHelper.updateParams(params);

      const nishitaConfig = this.nishitaHelper.getConfig();
      this.currentElevation = nishitaConfig.sun_elevation;
      this.currentAzimuth = nishitaConfig.sun_azimuth;
    } else {
      // Merge into config for future Nishita init
      this.config.nishita = { ...this.config.nishita, ...params };
      if (params.sun_elevation !== undefined) this.currentElevation = params.sun_elevation;
      if (params.sun_azimuth !== undefined) this.currentAzimuth = params.sun_azimuth;
    }

    this.updateSunFromAngles();
    this.updateFallbackColors();
  }

  /**
   * Advance the sky animation by one frame.
   * Delegates to NishitaSkyHelper.animate() when available.
   *
   * @param deltaTime - Seconds elapsed since the last frame
   */
  async animate(deltaTime: number): Promise<void> {
    if (this.nishitaHelper && this.nishitaReady) {
      await this.nishitaHelper.animate(deltaTime);

      // Keep sun light in sync after animation
      const nishitaConfig = this.nishitaHelper.getConfig();
      this.currentElevation = nishitaConfig.sun_elevation;
      this.currentAzimuth = nishitaConfig.sun_azimuth;
      this.updateSunFromAngles();
    }
  }

  /**
   * Get the current sun direction as a unit vector.
   * Useful for shadow camera positioning, lens flare placement, etc.
   */
  getSunDirection(): THREE.Vector3 {
    return this.sunDirection.clone();
  }

  /**
   * Get the current sun elevation in degrees.
   */
  getSunElevation(): number {
    return this.currentElevation;
  }

  /**
   * Get the current sun azimuth in degrees.
   */
  getSunAzimuth(): number {
    return this.currentAzimuth;
  }

  /**
   * Get the Nishita sky texture, if available.
   * Returns null when using fallback.
   */
  getSkyTexture(): THREE.Texture | null {
    if (this.nishitaHelper && this.nishitaReady) {
      return this.nishitaHelper.getTexture();
    }
    return null;
  }

  /**
   * Get the current time of day in hours according to the Nishita helper.
   */
  getCurrentTimeHours(): number {
    if (this.nishitaHelper && this.nishitaReady) {
      return this.nishitaHelper.getCurrentTimeHours();
    }
    // Rough reverse mapping from elevation
    if (this.currentElevation <= 0) return 0;
    const t = Math.asin(this.currentElevation / 90) / Math.PI;
    return 6 + t * 12;
  }

  /**
   * Whether the system is currently using the Nishita sky (true) or fallback (false).
   */
  isNishitaActive(): boolean {
    return this.nishitaReady;
  }

  /**
   * Get the directional sun light instance.
   */
  getSunLight(): THREE.DirectionalLight {
    return this.sunLight;
  }

  /**
   * Get the ambient light instance.
   */
  getAmbientLight(): THREE.AmbientLight {
    return this.ambientLight;
  }

  /**
   * Start or stop automatic sun animation.
   */
  setAnimating(animate: boolean, speed?: number): void {
    if (this.nishitaHelper && this.nishitaReady) {
      this.nishitaHelper.setAnimating(animate, speed);
    }
  }

  /**
   * Dispose all GPU resources held by the system.
   */
  dispose(): void {
    this.detach();

    if (this.nishitaHelper) {
      this.nishitaHelper.dispose();
      this.nishitaHelper = null;
      this.nishitaReady = false;
    }

    this.sunLight.dispose();
    this.disposeFallbackSky();
  }

  // -------------------------------------------------------------------------
  // Private — sun tracking
  // -------------------------------------------------------------------------

  /**
   * Recompute sun direction, sun light position, sun colour, and ambient colour
   * from the current elevation / azimuth values.
   */
  private updateSunFromAngles(): void {
    this.sunDirection = computeSunDirection(this.currentElevation, this.currentAzimuth);

    // Position the directional light far away along the sun direction
    const lightDistance = 100;
    this.sunLight.position.copy(this.sunDirection).multiplyScalar(lightDistance);

    // Sun colour varies with elevation
    const sunColor = computeSunColor(this.currentElevation);
    this.sunLight.color.copy(sunColor);

    // Reduce intensity when sun is near/below horizon
    const horizonFade = THREE.MathUtils.smoothstep(this.currentElevation, -5, 15);
    this.sunLight.intensity = this.config.sunIntensity * horizonFade;

    // Ambient colour follows sky colour
    const ambientColor = computeAmbientColor(this.currentElevation);
    this.ambientLight.color.copy(ambientColor);

    // Ambient intensity also fades at night
    this.ambientLight.intensity = this.config.ambientIntensity * THREE.MathUtils.lerp(0.15, 1.0, horizonFade);
  }

  // -------------------------------------------------------------------------
  // Private — fallback gradient sky
  // -------------------------------------------------------------------------

  /**
   * Create a simple gradient sphere as the sky background when Nishita is unavailable.
   */
  private createFallbackSky(scene: THREE.Scene): void {
    this.usingFallback = true;

    if (this.fallbackSkyMesh) return;

    const skyGeometry = new THREE.SphereGeometry(400, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        offset: { value: 20 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.fallbackSkyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(this.fallbackSkyMesh);
    scene.background = null; // Use mesh, not scene.background for fallback

    this.updateFallbackColors();
  }

  /**
   * Update fallback sky colours to match current sun elevation.
   */
  private updateFallbackColors(): void {
    if (!this.fallbackSkyMesh || !this.usingFallback) return;

    const material = (this.fallbackSkyMesh as THREE.Mesh).material as THREE.ShaderMaterial;
    if (!material.uniforms) return;

    const t = THREE.MathUtils.clamp(this.currentElevation / 90, 0, 1);

    // Top of sky: deep blue at night → bright blue at noon
    const topColor = new THREE.Color(
      THREE.MathUtils.lerp(0.02, 0.0, t),
      THREE.MathUtils.lerp(0.02, 0.47, t),
      THREE.MathUtils.lerp(0.08, 1.0, t),
    );

    // Horizon: warm at low sun → white-ish at high sun
    const bottomColor = new THREE.Color(
      THREE.MathUtils.lerp(0.8, 1.0, t),
      THREE.MathUtils.lerp(0.4, 1.0, t),
      THREE.MathUtils.lerp(0.2, 0.95, t),
    );

    material.uniforms.topColor.value.copy(topColor);
    material.uniforms.bottomColor.value.copy(bottomColor);
  }

  /**
   * Remove the fallback gradient sky from the scene.
   */
  private removeFallbackSky(): void {
    if (this.fallbackSkyMesh && this.scene) {
      this.scene.remove(this.fallbackSkyMesh);
    }
    this.usingFallback = false;
  }

  /**
   * Dispose fallback sky geometry + material.
   */
  private disposeFallbackSky(): void {
    if (this.fallbackSkyMesh) {
      (this.fallbackSkyMesh as THREE.Mesh).geometry.dispose();
      ((this.fallbackSkyMesh as THREE.Mesh).material as THREE.Material).dispose();
      this.fallbackSkyMesh = null;
    }
  }
}

export default SkyLightingSystem;
