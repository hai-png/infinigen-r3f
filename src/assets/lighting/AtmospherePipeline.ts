/**
 * AtmospherePipeline — Unified pipeline connecting sky → scattering → fog → clouds → exposure
 *
 * Previously, the atmosphere system was fragmented across 4 directories:
 *   - assets/lighting/ (SkyLightingSystem, LightingSystem)
 *   - assets/weather/atmosphere/ (AtmosphericScattering, VolumetricClouds)
 *   - assets/weather/ (NishitaSky, FogSystem)
 *   - core/rendering/lighting/ (ExposureControl, LightProbeSystem)
 *
 * This module provides a single entry point that orchestrates all atmospheric
 * subsystems into a coherent pipeline, matching how the original Infinigen
 * composes atmosphere in its scene generation.
 *
 * Phase C additions:
 *   - Optional volumetric fog via FogSystem (shader-based, height-dependent)
 *   - Optional auto-exposure via ExposureControl
 *   - Optional light probes via LightProbeSystem
 *
 * @module assets/lighting/AtmospherePipeline
 */

import * as THREE from 'three';
import { FogSystem, type FogParams } from '@/assets/weather/FogSystem';
import {
  ExposureControl,
  type ExposureConfig,
  type ToneMappingPreset,
} from '@/core/rendering/lighting/ExposureControl';
import {
  LightProbeSystem,
  type LightProbeConfig,
} from '@/core/rendering/lighting/LightProbeSystem';

// ============================================================================
// Types
// ============================================================================

export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night';

export interface AtmospherePipelineConfig {
  /** Time of day — affects sun position, sky color, fog density, etc. */
  timeOfDay: TimeOfDay;
  /** Turbidity (1-10) — atmospheric haze. Lower = clearer. Default: 2.5 */
  turbidity: number;
  /** Ground albedo (0-1). Default: 0.3 */
  groundAlbedo: number;
  /** Fog density (0-1). 0 = no fog. Default: 0 */
  fogDensity: number;
  /** Fog height falloff. Default: 0.01 */
  fogHeightFalloff: number;
  /** Cloud coverage (0-1). Default: 0.3 */
  cloudCoverage: number;
  /** Sun elevation override (radians). Overrides timeOfDay if set */
  sunElevation?: number;
  /** Sun azimuth override (radians). Default: PI/4 */
  sunAzimuth: number;
  /** Exposure compensation. Default: 0 */
  exposureCompensation: number;
  /** Tone mapping preset */
  toneMapping: 'linear' | 'reinhard' | 'aces' | 'agx' | 'uncharted2';
  /** Random seed for deterministic cloud/variation generation */
  seed: number;
  /** Use volumetric shader-based fog (FogSystem) instead of basic FogExp2 */
  useVolumetricFog: boolean;
  /** Use auto-exposure (ExposureControl) instead of static tone mapping */
  useAutoExposure: boolean;
  /** Use light probe system for indirect lighting */
  useLightProbes: boolean;
}

export const DEFAULT_ATMOSPHERE_CONFIG: AtmospherePipelineConfig = {
  timeOfDay: 'noon',
  turbidity: 2.5,
  groundAlbedo: 0.3,
  fogDensity: 0,
  fogHeightFalloff: 0.01,
  cloudCoverage: 0.3,
  sunAzimuth: Math.PI / 4,
  exposureCompensation: 0,
  toneMapping: 'aces',
  seed: 42,
  useVolumetricFog: false,
  useAutoExposure: false,
  useLightProbes: false,
};

// ============================================================================
// Time of Day → Sun Position Mapping
// ============================================================================

const TIME_OF_DAY_ELEVATIONS: Record<TimeOfDay, number> = {
  dawn: -0.05,
  morning: 0.3,
  noon: Math.PI / 2.2,
  afternoon: 0.5,
  dusk: 0.05,
  night: -0.5,
};

const TIME_OF_DAY_COLORS: Record<TimeOfDay, { sky: number; fog: number; sun: number; ambient: number }> = {
  dawn:   { sky: 0xffa366, fog: 0xffccaa, sun: 0xff8844, ambient: 0x443344 },
  morning: { sky: 0x87ceeb, fog: 0xccddee, sun: 0xffffdd, ambient: 0x6688aa },
  noon:    { sky: 0x4488cc, fog: 0xaabbcc, sun: 0xffffff, ambient: 0x8899aa },
  afternoon: { sky: 0x6699cc, fog: 0xbbccdd, sun: 0xffeecc, ambient: 0x7788aa },
  dusk:    { sky: 0xff6644, fog: 0xddaa88, sun: 0xff5522, ambient: 0x554433 },
  night:   { sky: 0x111122, fog: 0x111122, sun: 0x223344, ambient: 0x223344 },
};

// ============================================================================
// AtmospherePipeline
// ============================================================================

/**
 * Unified atmosphere pipeline that connects sky, lighting, fog, clouds,
 * and exposure into a single coherent system.
 *
 * Usage:
 * ```ts
 * const pipeline = new AtmospherePipeline();
 * const result = pipeline.attach(scene, camera, {
 *   timeOfDay: 'dusk',
 *   fogDensity: 0.3,
 *   cloudCoverage: 0.5,
 *   useVolumetricFog: true,
 *   useAutoExposure: true,
 * });
 *
 * // In render loop:
 * pipeline.update(deltaTime, averageLuminance);
 * ```
 */
export class AtmospherePipeline {
  private config: AtmospherePipelineConfig;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.HemisphereLight | null = null;
  private skyMesh: THREE.Mesh | null = null;
  private fog: THREE.FogExp2 | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private attached = false;

  // Phase C: Integrated subsystems
  private fogSystem: FogSystem | null = null;
  private exposureControl: ExposureControl | null = null;
  private lightProbeSystem: LightProbeSystem | null = null;

  constructor(config: Partial<AtmospherePipelineConfig> = {}) {
    this.config = { ...DEFAULT_ATMOSPHERE_CONFIG, ...config };
  }

  /**
   * Attach the full atmosphere pipeline to a scene.
   *
   * Creates and configures:
   *   1. Directional sun light
   *   2. Hemisphere ambient light
   *   3. Sky dome or gradient sky
   *   4. Fog (basic FogExp2 or volumetric FogSystem based on config)
   *   5. Exposure and tone mapping (static or auto via ExposureControl)
   *   6. Optional light probes for indirect lighting
   *
   * @param scene - The THREE.Scene to attach lights and sky to
   * @param camera - Optional camera for exposure calculation
   * @param renderer - Optional renderer for tone mapping setup
   * @param config - Override configuration
   */
  attach(
    scene: THREE.Scene,
    camera?: THREE.Camera,
    renderer?: THREE.WebGLRenderer,
    config?: Partial<AtmospherePipelineConfig>,
  ): AtmospherePipelineResult {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.renderer = renderer ?? null;
    this.attached = true;

    const sunElevation = this.config.sunElevation ?? TIME_OF_DAY_ELEVATIONS[this.config.timeOfDay];
    const colors = TIME_OF_DAY_COLORS[this.config.timeOfDay];

    // 1. Sun light
    this.sunLight = new THREE.DirectionalLight(colors.sun, this.computeSunIntensity(sunElevation));
    const sunDirection = this.computeSunDirection(sunElevation, this.config.sunAzimuth);
    this.sunLight.position.copy(sunDirection.multiplyScalar(100));
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.setScalar(2048);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.camera.left = -50;
    this.sunLight.shadow.camera.right = 50;
    this.sunLight.shadow.camera.top = 50;
    this.sunLight.shadow.camera.bottom = -50;
    scene.add(this.sunLight);

    // 2. Hemisphere ambient light
    this.ambientLight = new THREE.HemisphereLight(colors.sky, colors.fog, 0.4);
    scene.add(this.ambientLight);

    // 3. Sky dome
    this.skyMesh = this.createSkyDome(colors.sky, colors.fog);
    scene.add(this.skyMesh);

    // 4. Fog — volumetric or basic
    if (this.config.fogDensity > 0) {
      if (this.config.useVolumetricFog) {
        this.setupVolumetricFog(scene, colors.fog);
      } else {
        this.fog = new THREE.FogExp2(colors.fog, this.config.fogDensity * 0.01);
        scene.fog = this.fog;
      }
    }

    // 5. Exposure and tone mapping
    if (this.config.useAutoExposure) {
      this.setupAutoExposure(renderer);
    } else if (this.renderer) {
      this.applyToneMapping(this.renderer);
    }

    // 6. Light probes (if enabled)
    if (this.config.useLightProbes) {
      this.setupLightProbes(scene, renderer);
    }

    return {
      sunLight: this.sunLight,
      ambientLight: this.ambientLight,
      skyMesh: this.skyMesh,
      fog: this.fog,
      fogSystem: this.fogSystem,
      sunPosition: this.sunLight.position.clone(),
      sunDirection: this.computeSunDirection(sunElevation, this.config.sunAzimuth),
    };
  }

  /**
   * Update the atmosphere for a new time of day or configuration.
   * Can be called every frame for smooth transitions.
   *
   * @param config - Configuration overrides
   * @param deltaTime - Optional delta time for auto-exposure adaptation (seconds)
   * @param averageLuminance - Optional average luminance for auto-exposure
   */
  update(
    config: Partial<AtmospherePipelineConfig>,
    deltaTime?: number,
    averageLuminance?: number,
  ): void {
    Object.assign(this.config, config);
    if (!this.attached) return;

    const sunElevation = this.config.sunElevation ?? TIME_OF_DAY_ELEVATIONS[this.config.timeOfDay];
    const colors = TIME_OF_DAY_COLORS[this.config.timeOfDay];

    if (this.sunLight) {
      this.sunLight.intensity = this.computeSunIntensity(sunElevation);
      this.sunLight.color.set(colors.sun);
      const dir = this.computeSunDirection(sunElevation, this.config.sunAzimuth);
      this.sunLight.position.copy(dir.multiplyScalar(100));
    }

    if (this.ambientLight) {
      this.ambientLight.color.set(colors.sky);
      (this.ambientLight as any).groundColor?.set?.(colors.fog);
    }

    // Update volumetric fog if active
    if (this.fogSystem) {
      this.fogSystem.setColor(new THREE.Color(colors.fog));
      this.fogSystem.setDensity(this.config.fogDensity);
      if (deltaTime !== undefined) {
        this.fogSystem.update(deltaTime);
      }
    }

    // Update basic fog
    if (this.fog) {
      this.fog.color.set(colors.fog);
      this.fog.density = this.config.fogDensity * 0.01;
    }

    // Update auto-exposure
    if (this.exposureControl && this.renderer) {
      if (deltaTime !== undefined && averageLuminance !== undefined) {
        this.exposureControl.update(deltaTime, averageLuminance);
      }
      this.exposureControl.applyToRenderer(this.renderer);
    }
  }

  /**
   * Update the volumetric fog camera position.
   * Call this from the render loop when using volumetric fog.
   *
   * @param cameraPosition - Current camera world position
   */
  updateFogCameraPosition(cameraPosition: THREE.Vector3): void {
    if (this.fogSystem) {
      this.fogSystem.setCameraPosition(cameraPosition);
    }
  }

  /**
   * Get the current sun direction (useful for shadow camera positioning).
   */
  getSunDirection(): THREE.Vector3 {
    const sunElevation = this.config.sunElevation ?? TIME_OF_DAY_ELEVATIONS[this.config.timeOfDay];
    return this.computeSunDirection(sunElevation, this.config.sunAzimuth);
  }

  /**
   * Get the current atmosphere configuration.
   */
  getConfig(): Readonly<AtmospherePipelineConfig> {
    return this.config;
  }

  /**
   * Get the FogSystem instance (if using volumetric fog).
   */
  getFogSystem(): FogSystem | null {
    return this.fogSystem;
  }

  /**
   * Get the ExposureControl instance (if using auto-exposure).
   */
  getExposureControl(): ExposureControl | null {
    return this.exposureControl;
  }

  /**
   * Get the LightProbeSystem instance (if enabled).
   */
  getLightProbeSystem(): LightProbeSystem | null {
    return this.lightProbeSystem;
  }

  /**
   * Set ExposureControl configuration at runtime.
   * Creates ExposureControl if not already created.
   */
  setExposureConfig(partial: Partial<ExposureConfig>): void {
    if (this.exposureControl) {
      this.exposureControl.setConfig(partial);
    } else {
      this.exposureControl = new ExposureControl(partial);
      this.config.useAutoExposure = true;
    }
  }

  /**
   * Set LightProbeSystem configuration at runtime.
   * Creates a new LightProbeSystem if not already created.
   */
  setLightProbeConfig(partial: Partial<LightProbeConfig>): void {
    if (this.lightProbeSystem) {
      this.lightProbeSystem.setConfig(partial);
    } else {
      this.lightProbeSystem = new LightProbeSystem(partial);
      this.config.useLightProbes = true;
    }
  }

  /**
   * Set FogSystem parameters at runtime.
   */
  setFogParams(partial: Partial<FogParams>): void {
    if (this.fogSystem) {
      if (partial.density !== undefined) this.fogSystem.setDensity(partial.density);
      if (partial.color !== undefined) this.fogSystem.setColor(partial.color);
      if (partial.height !== undefined) this.fogSystem.setHeight(partial.height);
      if (partial.baseHeight !== undefined) this.fogSystem.setBaseHeight(partial.baseHeight);
      if (partial.windSpeed !== undefined && partial.windDirection) {
        this.fogSystem.setWind(partial.windSpeed, partial.windDirection);
      }
      if (partial.turbulence !== undefined) this.fogSystem.setTurbulence(partial.turbulence);
      if (partial.skyColor !== undefined) this.fogSystem.setSkyColor(partial.skyColor);
    }
  }

  /**
   * Switch between basic and volumetric fog at runtime.
   *
   * @param useVolumetric - true to use FogSystem, false for basic FogExp2
   * @param scene - The scene (required if not already attached)
   */
  setFogMode(useVolumetric: boolean, scene?: THREE.Scene): void {
    const targetScene = scene ?? (this.fogSystem?.['scene'] as THREE.Scene | undefined) ?? null;
    if (!targetScene) return;

    const colors = TIME_OF_DAY_COLORS[this.config.timeOfDay];

    // Remove existing fog
    if (this.fogSystem) {
      this.fogSystem.dispose();
      this.fogSystem = null;
    }
    if (this.fog) {
      targetScene.fog = null;
      this.fog = null;
    }

    this.config.useVolumetricFog = useVolumetric;

    if (this.config.fogDensity > 0) {
      if (useVolumetric) {
        this.setupVolumetricFog(targetScene, colors.fog);
      } else {
        this.fog = new THREE.FogExp2(colors.fog, this.config.fogDensity * 0.01);
        targetScene.fog = this.fog;
      }
    }
  }

  /**
   * Enable or disable auto-exposure at runtime.
   *
   * @param enabled - Whether to use auto-exposure
   * @param renderer - The WebGL renderer (required if enabling)
   */
  setAutoExposure(enabled: boolean, renderer?: THREE.WebGLRenderer): void {
    this.config.useAutoExposure = enabled;
    if (renderer) {
      this.renderer = renderer;
    }

    if (enabled && !this.exposureControl) {
      this.setupAutoExposure(this.renderer ?? undefined);
    } else if (!enabled && this.exposureControl) {
      // Restore static tone mapping
      if (this.renderer) {
        this.applyToneMapping(this.renderer);
      }
    }
  }

  /**
   * Dispose of all GPU resources.
   */
  dispose(): void {
    this.skyMesh?.geometry.dispose();
    if (this.skyMesh?.material instanceof THREE.Material) {
      this.skyMesh.material.dispose();
    }

    if (this.fogSystem) {
      this.fogSystem.dispose();
      this.fogSystem = null;
    }

    if (this.exposureControl) {
      this.exposureControl.dispose();
      this.exposureControl = null;
    }

    if (this.lightProbeSystem) {
      this.lightProbeSystem.dispose();
      this.lightProbeSystem = null;
    }

    this.attached = false;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private computeSunDirection(elevation: number, azimuth: number): THREE.Vector3 {
    return new THREE.Vector3(
      Math.cos(elevation) * Math.cos(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.sin(azimuth),
    ).normalize();
  }

  private computeSunIntensity(elevation: number): number {
    // Sun intensity varies with elevation — stronger at noon, weaker at dawn/dusk
    if (elevation < 0) return 0.1; // Below horizon
    if (elevation < 0.1) return 0.3 + elevation * 5; // Dawn/dusk ramp
    return Math.min(2.0, 0.8 + elevation * 0.5); // Daytime
  }

  private createSkyDome(skyColor: number, horizonColor: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(500, 32, 16);

    // Vertex-color gradient: sky color at top, horizon color at bottom
    const posAttr = geometry.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    const sky = new THREE.Color(skyColor);
    const horizon = new THREE.Color(horizonColor);

    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const t = Math.max(0, y / 500); // 0 at horizon, 1 at top
      const color = horizon.clone().lerp(sky, t * t); // Quadratic falloff for realistic sky
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    return new THREE.Mesh(geometry, material);
  }

  private applyToneMapping(renderer: THREE.WebGLRenderer): void {
    switch (this.config.toneMapping) {
      case 'linear':
        renderer.toneMapping = THREE.LinearToneMapping;
        break;
      case 'reinhard':
        renderer.toneMapping = THREE.ReinhardToneMapping;
        break;
      case 'aces':
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        break;
      case 'agx':
        // AgX not available in all Three.js versions, fall back to ACES
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        break;
      case 'uncharted2':
        // Uncharted2 not available in all Three.js versions, fall back to Reinhard
        renderer.toneMapping = THREE.ReinhardToneMapping;
        break;
    }

    renderer.toneMappingExposure = 1.0 + this.config.exposureCompensation;
  }

  /**
   * Set up volumetric fog using FogSystem.
   * Replaces basic FogExp2 with a shader-based volumetric fog that supports
   * height-dependent density, wind animation, and noise variation.
   */
  private setupVolumetricFog(scene: THREE.Scene, fogColor: number): void {
    this.fogSystem = new FogSystem(scene, {
      density: this.config.fogDensity,
      color: new THREE.Color(fogColor),
      height: 10,
      falloff: this.config.fogHeightFalloff,
      windSpeed: 2,
      windDirection: new THREE.Vector3(1, 0, 0),
      turbulence: 0.3,
      noiseScale: 0.02,
      baseHeight: 0,
      matchSkyColor: true,
      skyColor: new THREE.Color(fogColor),
    }, this.config.seed);
  }

  /**
   * Set up automatic exposure using ExposureControl.
   * Replaces static tone mapping with auto-exposure that adapts to scene luminance.
   */
  private setupAutoExposure(renderer?: THREE.WebGLRenderer): void {
    // Map our tone mapping preset to ExposureControl's ToneMappingPreset
    const toneMappingMap: Record<string, ToneMappingPreset> = {
      linear: 'linear',
      reinhard: 'reinhard',
      aces: 'aces',
      agx: 'aces',       // Closest mapping
      uncharted2: 'uncharted2',
    };

    this.exposureControl = new ExposureControl({
      autoExposure: true,
      manualExposure: 1.0 + this.config.exposureCompensation,
      toneMapping: toneMappingMap[this.config.toneMapping] ?? 'aces',
      minExposure: 0.1,
      maxExposure: 10.0,
      adaptationSpeedUp: 3.0,
      adaptationSpeedDown: 1.0,
    });

    // Apply initial state to renderer
    if (renderer) {
      this.exposureControl.applyToRenderer(renderer);
    }
  }

  /**
   * Set up light probe system for indirect lighting.
   * Captures irradiance from the scene at regular grid positions
   * using spherical harmonics (L2, 9 coefficients per channel).
   */
  private setupLightProbes(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): void {
    this.lightProbeSystem = new LightProbeSystem({
      gridResolution: [8, 4, 8],
      boundsMin: new THREE.Vector3(-100, 0, -100),
      boundsMax: new THREE.Vector3(100, 50, 100),
      captureScene: true,
      intensity: 1.0,
      captureSamples: 32,
      debug: false,
    });

    // Set ambient contribution as initial baseline
    const colors = TIME_OF_DAY_COLORS[this.config.timeOfDay];
    if (this.lightProbeSystem) {
      this.lightProbeSystem.setAmbientContribution(
        new THREE.Color(colors.sky),
        new THREE.Color(colors.fog),
      );
    }

    // If renderer is available, capture actual scene lighting
    if (renderer && this.lightProbeSystem) {
      this.lightProbeSystem.capture(renderer, scene);
    }
  }
}

// ============================================================================
// Result type
// ============================================================================

export interface AtmospherePipelineResult {
  sunLight: THREE.DirectionalLight;
  ambientLight: THREE.HemisphereLight;
  skyMesh: THREE.Mesh;
  fog: THREE.FogExp2 | null;
  fogSystem: FogSystem | null;
  sunPosition: THREE.Vector3;
  sunDirection: THREE.Vector3;
}
