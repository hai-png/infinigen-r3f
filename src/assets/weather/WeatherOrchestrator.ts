/**
 * Weather Orchestrator
 *
 * Unified orchestrator that connects WeatherTransitionManager events
 * to all weather subsystems (rain, snow, fog, lightning, clouds,
 * falling leaves, dust, marine snow). Provides a single update()
 * loop and high-level setWeather() API.
 *
 * Owns:
 *   - WeatherTransitionManager (state machine for smooth transitions)
 *   - TimeOfDaySystem (sun / ambient driver)
 *   - VolumetricCloudSystem (cloud rendering)
 *
 * Dispatches WeatherTransitionManager events to:
 *   - RainSystem, SnowSystem, FogSystem, LightningSystem,
 *     FallingLeavesSystem, DustSystem, MarineSnowSystem
 *
 * Replaces the disconnected WeatherSystem + VolumetricCloudSystem
 * architecture with a single coordinated weather controller.
 *
 * @module WeatherOrchestrator
 */

import * as THREE from 'three';
import {
  WeatherTransitionManager,
  WeatherStateType,
  WeatherStateValues,
  WeatherEvent,
} from './WeatherTransitionManager';
import { RainSystem } from './RainSystem';
import { SnowSystem } from './SnowSystem';
import { FogSystem } from './FogSystem';
import { LightningSystem } from './LightningSystem';
import {
  VolumetricCloudSystem,
  VolumetricCloudConfig,
} from './VolumetricCloudSystem';
import { FallingLeavesSystem } from './LeavesSystem';
import { DustSystem } from './DustSystem';
import { MarineSnowSystem } from './MarineSnowSystem';
import { TimeOfDaySystem, TimeOfDayConfig } from './TimeOfDaySystem';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WeatherOrchestratorConfig {
  /** Terrain height callback for rain/snow/leaves collision */
  terrainHeightFn: ((x: number, z: number) => number) | null;
  /** Terrain normal callback for snow accumulation direction */
  terrainNormalFn: ((x: number, z: number) => THREE.Vector3) | null;
  /** Camera for dust sunbeam visibility */
  camera: THREE.Camera | null;
  /** Cloud configuration (partial) */
  cloudConfig: Partial<VolumetricCloudConfig>;
  /** Time-of-day configuration (partial) */
  timeOfDayConfig: Partial<TimeOfDayConfig>;
  /** Initial weather state */
  initialWeather: WeatherStateType;
  /** Seed for deterministic generation */
  seed: number;
}

const DEFAULT_CONFIG: WeatherOrchestratorConfig = {
  terrainHeightFn: null,
  terrainNormalFn: null,
  camera: null,
  cloudConfig: {},
  timeOfDayConfig: {},
  initialWeather: 'Clear',
  seed: 42,
};

// ---------------------------------------------------------------------------
// WeatherOrchestrator
// ---------------------------------------------------------------------------

export class WeatherOrchestrator {
  private scene: THREE.Scene;
  private config: WeatherOrchestratorConfig;

  // Core systems (always present)
  private transitionManager: WeatherTransitionManager;
  private timeOfDaySystem: TimeOfDaySystem;

  // Subsystems (lazy — created on demand based on weather relevance)
  private rainSystem: RainSystem | null = null;
  private snowSystem: SnowSystem | null = null;
  private fogSystem: FogSystem | null = null;
  private lightningSystem: LightningSystem | null = null;
  private cloudSystem: VolumetricCloudSystem | null = null;
  private leavesSystem: FallingLeavesSystem | null = null;
  private dustSystem: DustSystem | null = null;
  private marineSnowSystem: MarineSnowSystem | null = null;

  // Tracking current values from transition manager
  private currentValues: WeatherStateValues;

  // Whether initialize() has completed
  private initialized: boolean = false;

  constructor(scene: THREE.Scene, config: Partial<WeatherOrchestratorConfig> = {}) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Core: transition state machine
    this.transitionManager = new WeatherTransitionManager(this.config.initialWeather);
    this.currentValues = this.transitionManager.getCurrentValues();

    // Core: time-of-day driver
    this.timeOfDaySystem = new TimeOfDaySystem(this.config.timeOfDayConfig);
    this.timeOfDaySystem.setWeatherManager(this.transitionManager);

    // Core: cloud system (always present — even clear skies have wisps)
    this.cloudSystem = new VolumetricCloudSystem(this.config.cloudConfig);

    // Wire up transition manager events → subsystem dispatch
    this.transitionManager.on('stateChange', (event: WeatherEvent) => {
      this.onWeatherStateChange(event.currentValues);
    });
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Attach all systems to the scene. Must be called once after construction.
   * Cloud system attachment is async because it may load optional modules.
   */
  async initialize(): Promise<void> {
    // Attach time-of-day lights to scene
    this.timeOfDaySystem.attachToScene(this.scene);

    // Attach cloud system
    if (this.cloudSystem) {
      await this.cloudSystem.attach(this.scene);
    }

    // Dispatch initial weather state to subsystems
    this.onWeatherStateChange(this.currentValues);

    this.initialized = true;
  }

  // -------------------------------------------------------------------------
  // High-level API
  // -------------------------------------------------------------------------

  /**
   * Transition to a new weather state over the given duration.
   * This is the primary public API for changing weather.
   *
   * @param type              Target weather state
   * @param transitionDuration Seconds for the smooth transition
   */
  setWeather(type: WeatherStateType, transitionDuration: number = 5.0): void {
    this.transitionManager.transitionTo(type, transitionDuration);
  }

  /**
   * Set the current hour of the day (0-24).
   * Delegates to TimeOfDaySystem.
   */
  setTimeOfDay(hour: number): void {
    this.timeOfDaySystem.setHour(hour);
  }

  /**
   * Get the current hour of the day.
   */
  getTimeOfDay(): number {
    return this.timeOfDaySystem.getHour();
  }

  // -------------------------------------------------------------------------
  // Frame Update
  // -------------------------------------------------------------------------

  /**
   * Update all systems. Call once per frame with deltaTime in seconds.
   */
  update(deltaTime: number): void {
    // 1. Advance time-of-day (drives sun position, ambient, fog)
    this.timeOfDaySystem.update(deltaTime);

    // 2. Advance weather transition (emits stateChange → dispatch)
    this.transitionManager.update(deltaTime);
    this.currentValues = this.transitionManager.getCurrentValues();

    // 3. Update time-of-day-aware subsystems (sun direction for dust)
    if (this.dustSystem && this.timeOfDaySystem.getSunElevation() > 0) {
      this.dustSystem.setSunDirection(this.timeOfDaySystem.getSunPosition().normalize());
    }

    // 4. Update fog camera position for distance-based rendering
    if (this.fogSystem && this.config.camera) {
      this.fogSystem.setCameraPosition(this.config.camera.position);
    }

    // 5. Update all active subsystems
    this.rainSystem?.update(deltaTime);
    this.snowSystem?.update(deltaTime);
    this.fogSystem?.update(deltaTime);
    this.lightningSystem?.update(deltaTime);
    this.cloudSystem?.update(deltaTime);
    this.leavesSystem?.update(deltaTime);
    this.dustSystem?.update(deltaTime);
    this.marineSnowSystem?.update(deltaTime);
  }

  // -------------------------------------------------------------------------
  // Weather → Subsystem Dispatch
  // -------------------------------------------------------------------------

  /**
   * Called whenever WeatherTransitionManager emits a stateChange event.
   * Creates, enables, disables, and configures subsystems based on the
   * current interpolated weather values.
   */
  private onWeatherStateChange(values: WeatherStateValues): void {
    const {
      precipitationIntensity,
      fogDensity,
      fogColor,
      windSpeed,
      windDirection,
      temperature,
      cloudCoverage,
      cloudDensity,
      sunIntensityMultiplier,
    } = values;

    // --- Rain: active when precipitation > 0 and temperature > 0 ---
    const shouldRain = precipitationIntensity > 0.01 && temperature > 0;
    if (shouldRain) {
      if (!this.rainSystem) {
        this.rainSystem = new RainSystem(
          this.scene,
          { intensity: 0 },
          this.config.seed,
          this.config.terrainHeightFn,
        );
      }
      this.rainSystem.setIntensity(precipitationIntensity);
      this.rainSystem.setWind(windSpeed, windDirection);
    } else if (this.rainSystem) {
      this.rainSystem.setIntensity(0);
    }

    // --- Snow: active when precipitation > 0 and temperature <= 0 ---
    const shouldSnow = precipitationIntensity > 0.01 && temperature <= 0;
    if (shouldSnow) {
      if (!this.snowSystem) {
        this.snowSystem = new SnowSystem(
          this.scene,
          { intensity: 0 },
          this.config.seed + 100,
          this.config.terrainHeightFn,
          this.config.terrainNormalFn,
        );
      }
      this.snowSystem.setIntensity(precipitationIntensity);
      this.snowSystem.setWind(windSpeed, windDirection);
      this.snowSystem.setTemperature(temperature);
    } else if (this.snowSystem) {
      this.snowSystem.setIntensity(0);
    }

    // --- Fog: active when fogDensity exceeds threshold ---
    if (fogDensity > 0.02) {
      if (!this.fogSystem) {
        this.fogSystem = new FogSystem(this.scene, {}, this.config.seed + 150);
      }
      this.fogSystem.applyWeatherTransition({
        fogDensity,
        fogColor,
        windSpeed,
        windDirection,
      });
    } else if (this.fogSystem) {
      this.fogSystem.setDensity(0);
      this.fogSystem.setEnabled(false);
    }

    // --- Lightning: active during storms (high precipitation + high wind) ---
    const isStorm = precipitationIntensity > 0.7 && windSpeed > 15;
    if (isStorm) {
      if (!this.lightningSystem) {
        this.lightningSystem = new LightningSystem(
          this.scene,
          { stormIntensity: 0 },
          this.config.seed + 175,
        );
      }
      this.lightningSystem.setEnabled(true);
      this.lightningSystem.setStormIntensity(
        Math.min(precipitationIntensity, windSpeed / 25),
      );
    } else if (this.lightningSystem) {
      this.lightningSystem.setEnabled(false);
    }

    // --- Clouds: always present, adjust coverage and density ---
    if (this.cloudSystem) {
      this.cloudSystem.updateConfig({
        coverage: cloudCoverage,
        density: cloudDensity * 0.03,
        windSpeed: windSpeed * 0.3,
        windDirection: windDirection.clone(),
      });
    }

    // --- Falling leaves: subtle during autumn-like conditions ---
    const isAutumnLike = temperature > 0 && temperature < 15 && windSpeed > 3;
    if (isAutumnLike) {
      if (!this.leavesSystem) {
        this.leavesSystem = new FallingLeavesSystem(
          this.scene,
          { intensity: 0, season: 'autumn' },
          this.config.seed + 200,
          this.config.terrainHeightFn,
        );
      }
      this.leavesSystem.setIntensity(Math.min(windSpeed / 20, 0.5));
      this.leavesSystem.setWind(windSpeed, windDirection);
    } else if (this.leavesSystem) {
      this.leavesSystem.setIntensity(0);
    }

    // --- Dust: active during clear/partly cloudy weather ---
    const isClear = cloudCoverage < 0.5 && precipitationIntensity < 0.1;
    if (isClear) {
      if (!this.dustSystem) {
        this.dustSystem = new DustSystem(
          this.scene,
          { intensity: 0 },
          this.config.seed + 300,
        );
        if (this.config.camera) {
          this.dustSystem.setCamera(this.config.camera);
        }
      }
      // Brighter dust when sun is strong
      const dustIntensity = (0.3 + (1 - cloudCoverage) * 0.3) * sunIntensityMultiplier;
      this.dustSystem.setIntensity(dustIntensity);
      this.dustSystem.setWind(windSpeed * 0.2, windDirection);
      // Sun direction will be updated in update() from TimeOfDaySystem
    } else if (this.dustSystem) {
      this.dustSystem.setIntensity(0);
    }

    // --- Marine snow: NOT auto-created — requires explicit underwater context ---
    // Use enableMarineSnow() / disableMarineSnow() for underwater scenes.
  }

  // -------------------------------------------------------------------------
  // Public Getters
  // -------------------------------------------------------------------------

  /** Current weather state type (may lag during transition). */
  getCurrentWeather(): WeatherStateType {
    return this.transitionManager.getCurrentState();
  }

  /** Target weather state type (what we're transitioning toward). */
  getTargetWeather(): WeatherStateType {
    return this.transitionManager.getTargetState();
  }

  /** Whether a weather transition is in progress. */
  isTransitioning(): boolean {
    return this.transitionManager.getIsTransitioning();
  }

  /** Transition progress (0–1), or 1 if not transitioning. */
  getTransitionProgress(): number {
    return this.transitionManager.getTransitionProgress();
  }

  /** Current interpolated weather values. */
  getCurrentValues(): WeatherStateValues {
    return this.currentValues;
  }

  /** The transition state machine. */
  getTransitionManager(): WeatherTransitionManager {
    return this.transitionManager;
  }

  /** The time-of-day system. */
  getTimeOfDaySystem(): TimeOfDaySystem {
    return this.timeOfDaySystem;
  }

  /** The volumetric cloud system (always present). */
  getCloudSystem(): VolumetricCloudSystem | null {
    return this.cloudSystem;
  }

  /** The rain subsystem (null until rain is first needed). */
  getRainSystem(): RainSystem | null {
    return this.rainSystem;
  }

  /** The snow subsystem (null until snow is first needed). */
  getSnowSystem(): SnowSystem | null {
    return this.snowSystem;
  }

  /** The fog subsystem (null until fog is first needed). */
  getFogSystem(): FogSystem | null {
    return this.fogSystem;
  }

  /** The lightning subsystem (null until a storm occurs). */
  getLightningSystem(): LightningSystem | null {
    return this.lightningSystem;
  }

  /** The falling leaves subsystem (null until autumn-like conditions). */
  getLeavesSystem(): FallingLeavesSystem | null {
    return this.leavesSystem;
  }

  /** The dust subsystem (null until clear weather). */
  getDustSystem(): DustSystem | null {
    return this.dustSystem;
  }

  /** The marine snow subsystem (null until explicitly enabled). */
  getMarineSnowSystem(): MarineSnowSystem | null {
    return this.marineSnowSystem;
  }

  // -------------------------------------------------------------------------
  // Marine Snow (explicit underwater control)
  // -------------------------------------------------------------------------

  /**
   * Enable marine snow for underwater scenes.
   * Marine snow is not auto-activated by weather transitions because
   * it depends on scene context (above vs. below water).
   */
  enableMarineSnow(intensity: number = 0.6): void {
    if (!this.marineSnowSystem) {
      this.marineSnowSystem = new MarineSnowSystem(
        this.scene,
        { intensity: 0 },
        this.config.seed + 400,
      );
    }
    this.marineSnowSystem.setIntensity(intensity);
  }

  /**
   * Disable marine snow.
   */
  disableMarineSnow(): void {
    if (this.marineSnowSystem) {
      this.marineSnowSystem.setIntensity(0);
    }
  }

  // -------------------------------------------------------------------------
  // Camera & Terrain Callbacks
  // -------------------------------------------------------------------------

  /**
   * Update the camera reference. Affects dust sunbeam visibility
   * and fog distance-based rendering.
   */
  setCamera(camera: THREE.Camera): void {
    this.config.camera = camera;
    if (this.dustSystem) {
      this.dustSystem.setCamera(camera);
    }
  }

  /**
   * Set the terrain height callback. Affects rain/snow/leaves collision.
   */
  setTerrainHeightFn(fn: (x: number, z: number) => number): void {
    this.config.terrainHeightFn = fn;
    if (this.rainSystem) this.rainSystem.setTerrainHeightFn(fn);
    if (this.snowSystem) this.snowSystem.setTerrainHeightFn(fn);
    if (this.leavesSystem) this.leavesSystem.setTerrainHeightFn(fn);
  }

  /**
   * Set the terrain normal callback. Affects snow accumulation direction.
   */
  setTerrainNormalFn(fn: (x: number, z: number) => THREE.Vector3): void {
    this.config.terrainNormalFn = fn;
    if (this.snowSystem) this.snowSystem.setTerrainNormalFn(fn);
  }

  // -------------------------------------------------------------------------
  // Event Forwarding
  // -------------------------------------------------------------------------

  /**
   * Subscribe to weather transition events.
   * Events: 'stateChange' | 'transitionStart' | 'transitionComplete'
   */
  on(event: 'stateChange' | 'transitionStart' | 'transitionComplete', listener: (event: WeatherEvent) => void): void {
    this.transitionManager.on(event, listener);
  }

  /**
   * Unsubscribe from weather transition events.
   */
  off(event: 'stateChange' | 'transitionStart' | 'transitionComplete', listener: (event: WeatherEvent) => void): void {
    this.transitionManager.off(event, listener);
  }

  /**
   * Subscribe to time-of-day changes.
   */
  onTimeChange(callback: (hour: number, state: string) => void): void {
    this.timeOfDaySystem.onTimeChange(callback);
  }

  /**
   * Unsubscribe from time-of-day changes.
   */
  offTimeChange(callback: (hour: number, state: string) => void): void {
    this.timeOfDaySystem.offTimeChange(callback);
  }

  // -------------------------------------------------------------------------
  // Available States
  // -------------------------------------------------------------------------

  /**
   * Get all available weather state types.
   */
  getAvailableWeatherStates(): WeatherStateType[] {
    return this.transitionManager.getAvailableStates();
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  /**
   * Dispose all subsystem resources and remove from scene.
   * The orchestrator cannot be used after disposal.
   */
  dispose(): void {
    this.timeOfDaySystem.dispose();

    this.rainSystem?.dispose();
    this.rainSystem = null;

    this.snowSystem?.dispose();
    this.snowSystem = null;

    this.fogSystem?.dispose();
    this.fogSystem = null;

    this.lightningSystem?.dispose();
    this.lightningSystem = null;

    this.cloudSystem?.dispose();
    this.cloudSystem = null;

    this.leavesSystem?.dispose();
    this.leavesSystem = null;

    this.dustSystem?.dispose();
    this.dustSystem = null;

    this.marineSnowSystem?.dispose();
    this.marineSnowSystem = null;
  }
}

export default WeatherOrchestrator;
