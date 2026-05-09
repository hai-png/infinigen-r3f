/**
 * Nature Atmosphere Subsystem — Handles clouds, weather, wind, and lighting.
 *
 * Extracted from NatureSceneComposer (Phase C decomposition).
 * Responsible for:
 *   - addClouds() — cloud scatter mask generation
 *   - configureLighting() — seasonal lighting adjustments
 *   - addWeatherParticles() — snow/rain/fog particle selection
 *   - addWindEffectors() — wind parameter pass-through
 *   - chooseSeason() — deterministic season selection
 *
 * @module composition/subsystems/NatureAtmosphereSubsystem
 */

import type {
  CloudParams,
  LightingParams,
  WindParams,
  WeatherParticleParams,
  Season,
  ScatterMaskData,
} from '../NatureSceneComposer';

// ============================================================================
// Seeded RNG (shared lightweight deterministic RNG)
// ============================================================================

class AtmosphereRNG {
  private s: number;
  constructor(seed: number) { this.s = seed; }
  next(): number {
    const x = Math.sin(this.s++) * 10000;
    return x - Math.floor(x);
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ============================================================================
// NatureAtmosphereSubsystem
// ============================================================================

/**
 * NatureAtmosphereSubsystem — handles clouds, weather, wind, and lighting.
 *
 * Extracted from NatureSceneComposer so the composer can remain a thin orchestrator.
 */
export class NatureAtmosphereSubsystem {
  private rng: AtmosphereRNG;
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new AtmosphereRNG(seed);
  }

  /** Re-initialize with a new seed */
  resetSeed(seed: number): void {
    this.seed = seed;
    this.rng = new AtmosphereRNG(seed);
  }

  // -----------------------------------------------------------------------
  // Clouds
  // -----------------------------------------------------------------------

  /**
   * Generate cloud positions as a scatter mask.
   *
   * Produces a 64×64 cloud density mask using deterministic noise.
   */
  addClouds(cloudConfig: CloudParams, seed: number): ScatterMaskData | null {
    if (!cloudConfig.enabled) return null;

    const cloudMask = new Float32Array(64 * 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const nx = x / 64 * 4;
        const ny = y / 64 * 4;
        const v = (Math.sin(nx * 2.7 + seed) * Math.cos(ny * 3.1 + seed) + 1) * 0.5;
        cloudMask[y * 64 + x] = v > 0.6 ? v : 0;
      }
    }
    return { name: 'clouds', resolution: 64, data: cloudMask };
  }

  // -----------------------------------------------------------------------
  // Season
  // -----------------------------------------------------------------------

  /**
   * Choose season deterministically from seed, or use configured season.
   */
  chooseSeason(configuredSeason: Season | undefined): Season {
    if (configuredSeason) return configuredSeason;
    const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
    return this.rng.pick(seasons);
  }

  // -----------------------------------------------------------------------
  // Lighting
  // -----------------------------------------------------------------------

  /**
   * Configure lighting based on season.
   *
   * Applies seasonal color and intensity adjustments to the lighting params.
   */
  configureLighting(light: LightingParams, season: Season): LightingParams {
    switch (season) {
      case 'winter':
        light.sunIntensity = 1.2;
        light.sunColor = '#e0e8f0';
        light.ambientIntensity = 0.5;
        light.ambientColor = '#c0d0e0';
        break;
      case 'autumn':
        light.sunIntensity = 1.5;
        light.sunColor = '#ffddaa';
        light.ambientIntensity = 0.4;
        light.ambientColor = '#c8a878';
        break;
      case 'spring':
        light.sunIntensity = 1.7;
        light.sunColor = '#fff5e0';
        light.ambientIntensity = 0.4;
        light.ambientColor = '#b8d4e8';
        break;
      case 'summer':
      default:
        // Keep defaults
        break;
    }

    return light;
  }

  // -----------------------------------------------------------------------
  // Weather particles
  // -----------------------------------------------------------------------

  /**
   * Determine weather particle configuration.
   *
   * If config specifies weather, use it. Otherwise, auto-choose based on
   * season: winter → snow, autumn → rain, otherwise → possible fog.
   */
  addWeatherParticles(
    configuredWeather: WeatherParticleParams | null,
    season: Season,
  ): WeatherParticleParams | null {
    if (configuredWeather) {
      return configuredWeather;
    }

    // Auto-choose weather based on season
    if (season === 'winter' && this.rng.next() > 0.4) {
      return { type: 'snow', intensity: 0.7, density: 2000 };
    } else if (season === 'autumn' && this.rng.next() > 0.6) {
      return { type: 'rain', intensity: 0.4, density: 1500 };
    } else if (this.rng.next() > 0.8) {
      return { type: 'fog', intensity: 0.3, density: 100 };
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Wind
  // -----------------------------------------------------------------------

  /**
   * Return wind configuration (pass-through for now).
   *
   * Wind parameters are fully defined by config; no procedural generation needed.
   */
  addWindEffectors(windConfig: WindParams): WindParams {
    return windConfig;
  }
}
