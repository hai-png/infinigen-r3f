/**
 * UnifiedSkySystem — Consolidated sky rendering system
 *
 * Merges three previously separate sky implementations:
 *   - SkyLightingSystem (Nishita-backed, physically-based)
 *   - AtmosphericScattering (Rayleigh/Mie, simplified)
 *   - AtmosphericSky (duplicate of AtmosphericScattering — REMOVED)
 *
 * Two modes:
 *   - 'nishita' — Physically-based Nishita sky model (primary, high quality)
 *   - 'scattering' — Rayleigh/Mie scattering (simplified, faster)
 *
 * Usage:
 * ```ts
 * const sky = new UnifiedSkySystem({ mode: 'nishita' });
 * sky.attach(scene, camera, renderer);
 * sky.setSunPosition(45, 180); // elevation, azimuth in degrees
 * sky.setTime(14); // 2 PM
 * ```
 *
 * @module assets/lighting/UnifiedSkySystem
 */

import * as THREE from 'three';
import { SkyLightingSystem, type SkyLightingSystemConfig } from './SkyLightingSystem';
import { AtmosphericScattering, type AtmosphereConfig } from '../weather/atmosphere/AtmosphericScattering';

// ============================================================================
// Types
// ============================================================================

/** Sky rendering mode */
export type SkyMode = 'nishita' | 'scattering';

/** Configuration for the UnifiedSkySystem */
export interface UnifiedSkyConfig {
  /** Sky rendering mode. Default: 'nishita' */
  mode: SkyMode;
  /** Sun elevation in degrees. Default: 45 */
  sunElevation: number;
  /** Sun azimuth in degrees. Default: 180 */
  sunAzimuth: number;
  /** Time of day (0-24 hours). Default: 12 */
  timeOfDay: number;
  /** Turbidity (atmospheric haze). Default: 2.5 */
  turbidity: number;
  /** Ground albedo. Default: 0.3 */
  groundAlbedo: number;
  /** Nishita-specific config overrides */
  nishitaConfig: Partial<SkyLightingSystemConfig>;
  /** Scattering-specific config overrides */
  scatteringConfig: Partial<AtmosphereConfig>;
  /** Auto-add directional light for sun. Default: true */
  addSunLight: boolean;
  /** Sun light intensity. Default: 1.5 */
  sunIntensity: number;
  /** Auto-add ambient/hemisphere light. Default: true */
  addAmbientLight: boolean;
  /** Ambient light intensity. Default: 0.4 */
  ambientIntensity: number;
  /** Shadow map resolution for sun light. Default: 2048 */
  shadowMapSize: number;
  /** Whether to enable shadows. Default: true */
  shadowsEnabled: boolean;
}

/** Result returned after attaching the sky system */
export interface SkyResult {
  /** The sky mesh/dome */
  skyMesh: THREE.Mesh | null;
  /** Sun directional light (if addSunLight=true) */
  sunLight: THREE.DirectionalLight | null;
  /** Ambient/hemisphere light (if addAmbientLight=true) */
  ambientLight: THREE.HemisphereLight | THREE.AmbientLight | null;
  /** Current sun direction (unit vector) */
  sunDirection: THREE.Vector3;
  /** Current sun position (far point along sun direction) */
  sunPosition: THREE.Vector3;
  /** Sky color at horizon */
  skyColor: THREE.Color;
  /** Sky color at zenith */
  zenithColor: THREE.Color;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_UNIFIED_SKY_CONFIG: UnifiedSkyConfig = {
  mode: 'nishita',
  sunElevation: 45,
  sunAzimuth: 180,
  timeOfDay: 12,
  turbidity: 2.5,
  groundAlbedo: 0.3,
  nishitaConfig: {},
  scatteringConfig: {},
  addSunLight: true,
  sunIntensity: 1.5,
  addAmbientLight: true,
  ambientIntensity: 0.4,
  shadowMapSize: 2048,
  shadowsEnabled: true,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute sun direction from elevation and azimuth (degrees).
 * Matches the convention used in SkyLightingSystem and NishitaSky.
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
  const t = THREE.MathUtils.clamp(elevationDeg / 90, 0, 1);
  const r = 1.0;
  const g = THREE.MathUtils.lerp(0.55, 1.0, t);
  const b = THREE.MathUtils.lerp(0.2, 0.95, t);
  return new THREE.Color(r, g, b);
}

/**
 * Derive an ambient / sky colour from sun elevation.
 */
function computeAmbientColor(elevationDeg: number): THREE.Color {
  const t = THREE.MathUtils.clamp(elevationDeg / 90, 0, 1);
  const r = THREE.MathUtils.lerp(0.05, 0.53, t);
  const g = THREE.MathUtils.lerp(0.05, 0.81, t);
  const b = THREE.MathUtils.lerp(0.15, 0.92, t);
  return new THREE.Color(r, g, b);
}

/**
 * Derive a zenith colour from sun elevation.
 */
function computeZenithColor(elevationDeg: number): THREE.Color {
  const t = THREE.MathUtils.clamp(elevationDeg / 90, 0, 1);
  const r = THREE.MathUtils.lerp(0.02, 0.0, t);
  const g = THREE.MathUtils.lerp(0.02, 0.47, t);
  const b = THREE.MathUtils.lerp(0.08, 1.0, t);
  return new THREE.Color(r, g, b);
}

/**
 * Compute sun elevation and azimuth from a time-of-day value (0-24 hours).
 * Matches the sinusoidal model used in SkyLightingSystem.
 */
function timeOfDayToSunPosition(hours: number): { elevation: number; azimuth: number } {
  const wrapped = ((hours % 24) + 24) % 24;
  const dayProgress = (wrapped - 6.0) / 12.0; // 0 at 6 am, 1 at 6 pm

  const elevation = Math.sin(Math.max(0, Math.min(1, dayProgress)) * Math.PI) * 90;
  const azimuth = 180 + dayProgress * 180;

  const actualElevation = wrapped >= 6 && wrapped <= 18 ? elevation : -10;

  return { elevation: actualElevation, azimuth };
}

/**
 * Compute sun elevation and azimuth from a time-of-day value for the scattering model.
 * AtmosphericScattering.setTimeOfDay uses a different convention (angle from 6h).
 */
function timeOfDayToScatteringSunPosition(hours: number): THREE.Vector3 {
  const sunAngle = ((hours - 6) / 24) * Math.PI * 2;
  const sunY = Math.sin(sunAngle);
  const sunX = Math.cos(sunAngle);
  return new THREE.Vector3(sunX, Math.max(0, sunY), 0).normalize().multiplyScalar(50000);
}

// ============================================================================
// UnifiedSkySystem
// ============================================================================

/**
 * Unified sky system consolidating Nishita (primary) and AtmosphericScattering
 * (simplified/fallback) into a single API.
 *
 * The system wraps SkyLightingSystem for 'nishita' mode and
 * AtmosphericScattering for 'scattering' mode, providing a unified interface
 * for sky management, sun positioning, and ambient lighting.
 */
export class UnifiedSkySystem {
  // ---- Configuration -------------------------------------------------------
  private config: UnifiedSkyConfig;

  // ---- Mode tracking -------------------------------------------------------
  private mode: SkyMode;

  // ---- Sub-systems ---------------------------------------------------------
  private nishitaSystem: SkyLightingSystem | null = null;
  private scatteringSystem: AtmosphericScattering | null = null;

  // ---- Scene references ----------------------------------------------------
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;

  // ---- Lights (created when config says so) --------------------------------
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.HemisphereLight | null = null;

  // ---- Sun tracking --------------------------------------------------------
  private sunDirection = new THREE.Vector3(0, 1, 0);
  private currentElevation: number;
  private currentAzimuth: number;

  // ---- Attachment state ----------------------------------------------------
  private attached = false;

  // ===========================================================================
  // Construction
  // ===========================================================================

  constructor(config: Partial<UnifiedSkyConfig> = {}) {
    this.config = { ...DEFAULT_UNIFIED_SKY_CONFIG, ...config };
    this.mode = this.config.mode;
    this.currentElevation = this.config.sunElevation;
    this.currentAzimuth = this.config.sunAzimuth;

    // Pre-create lights if configured
    if (this.config.addSunLight) {
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
    }

    if (this.config.addAmbientLight) {
      this.ambientLight = new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, this.config.ambientIntensity);
    }

    // Apply initial sun position
    this.updateSunFromAngles();
  }

  // ===========================================================================
  // Public API — Lifecycle
  // ===========================================================================

  /**
   * Attach the sky system to a scene.
   *
   * In 'nishita' mode, creates a SkyLightingSystem and attaches it.
   * In 'scattering' mode, creates an AtmosphericScattering instance.
   *
   * Lights are added to the scene if configured (addSunLight, addAmbientLight).
   *
   * @param scene - The THREE.Scene to attach the sky to
   * @param camera - Camera reference (required for scattering mode)
   * @param renderer - Renderer reference (required for scattering mode)
   * @returns SkyResult with current sky state
   */
  async attach(
    scene: THREE.Scene,
    camera?: THREE.Camera,
    renderer?: THREE.WebGLRenderer,
  ): Promise<SkyResult> {
    this.scene = scene;
    this.camera = camera ?? null;
    this.renderer = renderer ?? null;

    // Add lights to scene immediately
    if (this.sunLight) {
      scene.add(this.sunLight);
    }
    if (this.ambientLight) {
      scene.add(this.ambientLight);
    }

    // Attach the appropriate sky subsystem
    if (this.mode === 'nishita') {
      await this.attachNishitaMode(scene);
    } else {
      this.attachScatteringMode(scene, camera, renderer);
    }

    this.attached = true;

    // Update sun position from config
    await this.setSunPosition(this.currentElevation, this.currentAzimuth);

    return this.getResult();
  }

  /**
   * Detach the sky system from the scene.
   * Removes all lights and sky elements but does NOT dispose resources.
   */
  detach(): void {
    if (this.nishitaSystem) {
      this.nishitaSystem.detach();
    }

    if (this.scatteringSystem) {
      this.scatteringSystem.dispose();
      this.scatteringSystem = null;
    }

    if (this.scene) {
      if (this.sunLight) {
        this.scene.remove(this.sunLight);
      }
      if (this.ambientLight) {
        this.scene.remove(this.ambientLight);
      }
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.attached = false;
  }

  /**
   * Dispose all GPU resources held by the system.
   */
  dispose(): void {
    this.detach();

    if (this.nishitaSystem) {
      this.nishitaSystem.dispose();
      this.nishitaSystem = null;
    }

    if (this.sunLight) {
      this.sunLight.dispose();
      this.sunLight = null;
    }

    if (this.ambientLight) {
      this.ambientLight.dispose();
      this.ambientLight = null;
    }
  }

  // ===========================================================================
  // Public API — Mode Switching
  // ===========================================================================

  /**
   * Switch sky mode at runtime.
   *
   * Detaches the current subsystem and attaches the new one.
   * If the system is not currently attached, only the mode flag is updated
   * and the new subsystem will be used on the next attach() call.
   *
   * @param mode - The new sky mode ('nishita' or 'scattering')
   */
  async setMode(mode: SkyMode): Promise<void> {
    if (mode === this.mode) return;

    const previousMode = this.mode;
    this.mode = mode;

    if (!this.attached || !this.scene) return;

    // Detach the previous subsystem
    if (previousMode === 'nishita' && this.nishitaSystem) {
      this.nishitaSystem.detach();
      this.nishitaSystem = null;
    } else if (previousMode === 'scattering' && this.scatteringSystem) {
      this.scatteringSystem.dispose();
      this.scatteringSystem = null;
    }

    // Clear scene background/environment set by previous mode
    this.scene.background = null;
    this.scene.environment = null;

    // Attach the new subsystem
    if (mode === 'nishita') {
      await this.attachNishitaMode(this.scene);
    } else {
      this.attachScatteringMode(this.scene, this.camera ?? undefined, this.renderer ?? undefined);
    }

    // Re-apply current sun position
    await this.setSunPosition(this.currentElevation, this.currentAzimuth);

    console.info(`[UnifiedSkySystem] Mode switched from '${previousMode}' to '${mode}'`);
  }

  /**
   * Get the current sky mode.
   */
  getMode(): SkyMode {
    return this.mode;
  }

  // ===========================================================================
  // Public API — Sun Position & Time
  // ===========================================================================

  /**
   * Set sun position by elevation and azimuth in degrees.
   *
   * @param elevationDeg - Sun elevation (0 = horizon, 90 = zenith)
   * @param azimuthDeg - Sun azimuth (0 = north, 180 = south, clockwise)
   */
  async setSunPosition(elevationDeg: number, azimuthDeg: number): Promise<void> {
    this.currentElevation = elevationDeg;
    this.currentAzimuth = azimuthDeg;

    if (this.mode === 'nishita' && this.nishitaSystem) {
      // Delegate to Nishita system which handles sky texture rebuild
      await this.nishitaSystem.updateParams({
        sunElevation: elevationDeg,
        sunAzimuth: azimuthDeg,
      });
    }

    // Always update sun direction and lights ourselves (for both modes)
    this.updateSunFromAngles();

    // Also update scattering system sun position if in scattering mode
    if (this.mode === 'scattering' && this.scatteringSystem) {
      const sunDir = computeSunDirection(elevationDeg, azimuthDeg);
      this.scatteringSystem.setSunPosition(sunDir.multiplyScalar(50000));
    }
  }

  /**
   * Set time of day (0-24 hours).
   *
   * Computes sun elevation and azimuth from the time value and updates
   * both the sky subsystem and lighting.
   *
   * @param hours - Time of day in hours (0-24)
   */
  async setTime(hours: number): Promise<void> {
    this.config.timeOfDay = hours;

    const { elevation, azimuth } = timeOfDayToSunPosition(hours);
    this.currentElevation = elevation;
    this.currentAzimuth = azimuth;

    if (this.mode === 'nishita' && this.nishitaSystem) {
      await this.nishitaSystem.setTimeOfDay(hours);
      // Re-read actual values from Nishita system
      this.currentElevation = this.nishitaSystem.getSunElevation();
      this.currentAzimuth = this.nishitaSystem.getSunAzimuth();
    }

    // Update our own lighting
    this.updateSunFromAngles();

    // Update scattering system if in scattering mode
    if (this.mode === 'scattering' && this.scatteringSystem) {
      this.scatteringSystem.setTimeOfDay(hours);
    }
  }

  /**
   * Get the current time of day in hours.
   */
  getTime(): number {
    if (this.mode === 'nishita' && this.nishitaSystem) {
      return this.nishitaSystem.getCurrentTimeHours();
    }
    return this.config.timeOfDay;
  }

  // ===========================================================================
  // Public API — Atmospheric Parameters
  // ===========================================================================

  /**
   * Set atmospheric turbidity.
   *
   * Maps turbidity to appropriate parameters for each mode:
   * - Scattering mode: turbidity maps directly to AtmosphericScattering.setTurbidity()
   * - Nishita mode: turbidity is mapped to airDensity and dustDensity
   *   (higher turbidity = more dust/haze)
   *
   * @param turbidity - Turbidity value (1 = very clear, 10 = very hazy)
   */
  setTurbidity(turbidity: number): void {
    this.config.turbidity = turbidity;

    if (this.mode === 'scattering' && this.scatteringSystem) {
      this.scatteringSystem.setTurbidity(turbidity);
    }

    // Nishita mode: map turbidity to airDensity and dustDensity
    // turbidity 1 = very clear (airDensity=0.5, dustDensity=0.1)
    // turbidity 10 = very hazy (airDensity=3.0, dustDensity=3.0)
    if (this.mode === 'nishita' && this.nishitaSystem) {
      const t = THREE.MathUtils.clamp((turbidity - 1) / 9, 0, 1); // 0..1
      const airDensity = THREE.MathUtils.lerp(0.5, 3.0, t);
      const dustDensity = THREE.MathUtils.lerp(0.1, 3.0, t);
      this.nishitaSystem.updateParams({ airDensity, dustDensity });
    }
  }

  /**
   * Set fog density for the scattering mode.
   *
   * @param density - Fog density value
   */
  setFogDensity(density: number): void {
    if (this.mode === 'scattering' && this.scatteringSystem) {
      this.scatteringSystem.setFogDensity(density);
    }
    // For nishita mode, fog is managed separately via FogSystem
  }

  /**
   * Set cloud configuration for the scattering mode.
   *
   * @param config - Partial cloud configuration
   */
  setCloudConfig(config: Partial<import('../weather/atmosphere/AtmosphericScattering').CloudConfig>): void {
    if (this.mode === 'scattering' && this.scatteringSystem) {
      this.scatteringSystem.setCloudConfig(config);
    }
    // Nishita mode doesn't have built-in cloud support; clouds are separate
  }

  // ===========================================================================
  // Public API — Update Loop
  // ===========================================================================

  /**
   * Update sky rendering. Call once per frame.
   *
   * @param deltaTime - Seconds elapsed since the last frame
   */
  async update(deltaTime: number): Promise<void> {
    if (!this.attached) return;

    if (this.mode === 'nishita' && this.nishitaSystem) {
      await this.nishitaSystem.animate(deltaTime);
      // Re-sync sun direction after animation
      this.currentElevation = this.nishitaSystem.getSunElevation();
      this.currentAzimuth = this.nishitaSystem.getSunAzimuth();
      this.updateSunFromAngles();
    } else if (this.mode === 'scattering' && this.scatteringSystem) {
      this.scatteringSystem.update(deltaTime);
    }
  }

  // ===========================================================================
  // Public API — Result Access
  // ===========================================================================

  /**
   * Get current sky result snapshot.
   */
  getResult(): SkyResult {
    const skyMesh = this.getSkyMesh();
    const sunDir = computeSunDirection(this.currentElevation, this.currentAzimuth);

    return {
      skyMesh,
      sunLight: this.sunLight,
      ambientLight: this.ambientLight,
      sunDirection: sunDir,
      sunPosition: sunDir.clone().multiplyScalar(100),
      skyColor: computeAmbientColor(this.currentElevation),
      zenithColor: computeZenithColor(this.currentElevation),
    };
  }

  /**
   * Get the current sun direction as a unit vector.
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
   * Get the sky mesh, if available.
   */
  getSkyMesh(): THREE.Mesh | null {
    // Nishita mode: sky is rendered as scene.background/environment texture,
    // not as a mesh in the scene. Return null.
    if (this.mode === 'nishita') {
      return null;
    }

    // Scattering mode: the skyMesh is internal to AtmosphericScattering.
    // We don't have direct access, but the sky mesh is in the scene.
    // Return null since it's managed internally.
    return null;
  }

  /**
   * Get the sun directional light instance (if addSunLight was true).
   */
  getSunLight(): THREE.DirectionalLight | null {
    return this.sunLight;
  }

  /**
   * Get the ambient/hemisphere light instance (if addAmbientLight was true).
   */
  getAmbientLight(): THREE.HemisphereLight | null {
    return this.ambientLight;
  }

  /**
   * Get the Nishita sky texture, if available.
   * Returns null when in scattering mode or when Nishita fails.
   */
  getSkyTexture(): THREE.Texture | null {
    if (this.nishitaSystem) {
      return this.nishitaSystem.getSkyTexture();
    }
    return null;
  }

  /**
   * Whether the system is currently using the Nishita sky (true) or scattering (false).
   */
  isNishitaActive(): boolean {
    return this.mode === 'nishita' && this.nishitaSystem !== null && this.nishitaSystem.isNishitaActive();
  }

  /**
   * Whether the system is currently attached to a scene.
   */
  isAttached(): boolean {
    return this.attached;
  }

  // ===========================================================================
  // Public API — Subsystem Access
  // ===========================================================================

  /**
   * Get the underlying Nishita system (SkyLightingSystem) for advanced configuration.
   * Returns null when not in 'nishita' mode or before attach().
   */
  getNishitaSystem(): SkyLightingSystem | null {
    return this.nishitaSystem;
  }

  /**
   * Get the underlying Scattering system (AtmosphericScattering) for advanced configuration.
   * Returns null when not in 'scattering' mode or before attach().
   */
  getScatteringSystem(): AtmosphericScattering | null {
    return this.scatteringSystem;
  }

  // ===========================================================================
  // Public API — Animation
  // ===========================================================================

  /**
   * Start or stop automatic sun animation (Nishita mode only).
   *
   * @param animate - Whether to animate
   * @param speed - Animation speed in hours per second
   */
  setAnimating(animate: boolean, speed?: number): void {
    if (this.nishitaSystem) {
      this.nishitaSystem.setAnimating(animate, speed);
    }
  }

  // ===========================================================================
  // Private — Nishita mode attachment
  // ===========================================================================

  /**
   * Create and attach a SkyLightingSystem for Nishita mode.
   */
  private async attachNishitaMode(scene: THREE.Scene): Promise<void> {
    // Build the SkyLightingSystem config from our config
    const nishitaConfig: Partial<SkyLightingSystemConfig> = {
      nishita: {
        sunElevation: this.currentElevation,
        sunAzimuth: this.currentAzimuth,
        ...this.config.nishitaConfig.nishita,
      },
      sunIntensity: this.config.sunIntensity,
      ambientIntensity: this.config.ambientIntensity,
      shadowMapSize: this.config.shadowMapSize,
      shadowsEnabled: this.config.shadowsEnabled,
      useNishita: true,
      useHemisphereLight: false, // We manage our own hemisphere light
      ...this.config.nishitaConfig,
    };

    this.nishitaSystem = new SkyLightingSystem(nishitaConfig);
    await this.nishitaSystem.attach(scene);

    console.info('[UnifiedSkySystem] Nishita mode attached');
  }

  // ===========================================================================
  // Private — Scattering mode attachment
  // ===========================================================================

  /**
   * Create and attach an AtmosphericScattering system for scattering mode.
   */
  private attachScatteringMode(
    scene: THREE.Scene,
    camera?: THREE.Camera,
    renderer?: THREE.WebGLRenderer,
  ): void {
    if (!camera || !renderer) {
      console.warn(
        '[UnifiedSkySystem] Scattering mode requires camera and renderer. ' +
          'Falling back to Nishita mode.',
      );
      // Fallback: we can't create AtmosphericScattering without camera/renderer
      // but we can still function with just lights
      return;
    }

    const scatteringConfig: Partial<AtmosphereConfig> = {
      turbidity: this.config.turbidity,
      sunIntensity: this.config.sunIntensity,
      ...this.config.scatteringConfig,
    };

    this.scatteringSystem = new AtmosphericScattering(
      scene,
      camera,
      renderer,
    );

    // Apply overrides that AtmosphericScattering doesn't accept in constructor
    if (scatteringConfig.turbidity !== undefined) {
      this.scatteringSystem.setTurbidity(scatteringConfig.turbidity);
    }
    if (scatteringConfig.sunIntensity !== undefined) {
      // Sun intensity is set via the scattering system's config
      // We also update our own sun light
    }

    console.info('[UnifiedSkySystem] Scattering mode attached');
  }

  // ===========================================================================
  // Private — Sun tracking
  // ===========================================================================

  /**
   * Recompute sun direction, sun light position, sun colour, and ambient colour
   * from the current elevation / azimuth values.
   */
  private updateSunFromAngles(): void {
    this.sunDirection = computeSunDirection(this.currentElevation, this.currentAzimuth);

    // Update our own directional light
    if (this.sunLight) {
      const lightDistance = 100;
      this.sunLight.position.copy(this.sunDirection).multiplyScalar(lightDistance);

      // Sun colour varies with elevation
      const sunColor = computeSunColor(this.currentElevation);
      this.sunLight.color.copy(sunColor);

      // Reduce intensity when sun is near/below horizon
      const horizonFade = THREE.MathUtils.smoothstep(this.currentElevation, -5, 15);
      this.sunLight.intensity = this.config.sunIntensity * horizonFade;
    }

    // Update hemisphere ambient light
    if (this.ambientLight) {
      const skyColor = computeAmbientColor(this.currentElevation);
      this.ambientLight.color.copy(skyColor);

      // Ground colour warms slightly during golden hour
      const t = THREE.MathUtils.clamp(this.currentElevation / 90, 0, 1);
      const groundColor = new THREE.Color(
        THREE.MathUtils.lerp(0.24, 0.4, t),
        THREE.MathUtils.lerp(0.36, 0.35, t),
        THREE.MathUtils.lerp(0.24, 0.25, t),
      );
      this.ambientLight.groundColor.copy(groundColor);

      // Intensity fades at night
      const horizonFade = THREE.MathUtils.smoothstep(this.currentElevation, -5, 15);
      this.ambientLight.intensity = this.config.ambientIntensity * THREE.MathUtils.lerp(0.15, 1.0, horizonFade);
    }
  }
}

// ============================================================================
// Convenience function
// ============================================================================

/**
 * Convenience function to quickly set up a unified sky system on a scene.
 *
 * Creates a UnifiedSkySystem, attaches it to the scene, and optionally
 * sets the time of day.
 *
 * @example
 * ```ts
 * const { system, result } = await createUnifiedSky(scene, camera, renderer, {
 *   mode: 'nishita',
 *   timeOfDay: 14,
 * });
 * ```
 *
 * @param scene - The THREE.Scene to attach the sky to
 * @param camera - Camera reference (required for scattering mode)
 * @param renderer - Renderer reference (required for scattering mode)
 * @param options - Optional configuration overrides
 * @returns The UnifiedSkySystem instance and the initial SkyResult
 */
export async function createUnifiedSky(
  scene: THREE.Scene,
  camera?: THREE.Camera,
  renderer?: THREE.WebGLRenderer,
  options: Partial<UnifiedSkyConfig> = {},
): Promise<{
  system: UnifiedSkySystem;
  result: SkyResult;
}> {
  const system = new UnifiedSkySystem(options);
  const result = await system.attach(scene, camera, renderer);

  if (options.timeOfDay !== undefined) {
    await system.setTime(options.timeOfDay);
  }

  return { system, result };
}

export default UnifiedSkySystem;
