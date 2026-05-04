/**
 * Nishita Sky — P7.1: Nishita Sky Implementation
 *
 * Port of Blender's Nishita atmospheric scattering model for
 * physically-based sky rendering. Supports Rayleigh + Mie scattering,
 * ozone absorption, and animated sun position for time-of-day transitions.
 *
 * In path-traced mode: uses ProceduralEquirectTexture from three-gpu-pathtracer
 * so the sky participates in the light transport as an environment map.
 * In rasterized mode: creates a DataTexture with computed sky colors as fallback.
 *
 * @module weather
 * @phase 7
 * @p-number P7.1
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the Nishita sky model.
 * All properties use camelCase following TypeScript conventions.
 */
export interface NishitaSkyConfig {
  /** Sun elevation in degrees (0 = horizon, 90 = zenith). Default: 45 */
  sunElevation: number;
  /** Sun azimuth in degrees (0 = north, clockwise). Default: 180 */
  sunAzimuth: number;
  /** Sun intensity multiplier. Default: 1.0 */
  sunIntensity: number;
  /** Air density (Rayleigh scattering strength). Default: 1.0 */
  airDensity: number;
  /** Dust density (Mie scattering strength). Default: 1.0 */
  dustDensity: number;
  /** Ozone density (absorption strength). Default: 1.0 */
  ozoneDensity: number;
  /** Resolution of the equirectangular environment map. Default: 1024 */
  resolution: number;
  /** Whether to animate sun position automatically. Default: false */
  animate: boolean;
  /** Animation speed (hours per second) when animate is true. Default: 0.1 */
  animationSpeed: number;
}

/**
 * Backward-compatible input type that accepts both camelCase and deprecated snake_case
 * property names. The snake_case forms are deprecated and will be removed in a future version.
 *
 * @example
 * ```ts
 * // Preferred (camelCase)
 * createNishitaSkyTexture({ sunElevation: 60, airDensity: 1.2 });
 *
 * // Deprecated but still accepted (snake_case)
 * createNishitaSkyTexture({ sun_elevation: 60, air_density: 1.2 });
 * ```
 */
export type NishitaSkyConfigInput = Partial<NishitaSkyConfig> & {
  /** @deprecated Use sunElevation instead */
  sun_elevation?: number;
  /** @deprecated Use sunAzimuth instead */
  sun_azimuth?: number;
  /** @deprecated Use sunIntensity instead */
  sun_intensity?: number;
  /** @deprecated Use airDensity instead */
  air_density?: number;
  /** @deprecated Use dustDensity instead */
  dust_density?: number;
  /** @deprecated Use ozoneDensity instead */
  ozone_density?: number;
};

/**
 * Normalize a NishitaSkyConfigInput (which may contain deprecated snake_case
 * properties) into a Partial<NishitaSkyConfig> with only camelCase keys.
 * CamelCase takes precedence when both forms are provided.
 */
function normalizeConfigInput(input: NishitaSkyConfigInput): Partial<NishitaSkyConfig> {
  return {
    sunElevation: input.sunElevation ?? input.sun_elevation,
    sunAzimuth: input.sunAzimuth ?? input.sun_azimuth,
    sunIntensity: input.sunIntensity ?? input.sun_intensity,
    airDensity: input.airDensity ?? input.air_density,
    dustDensity: input.dustDensity ?? input.dust_density,
    ozoneDensity: input.ozoneDensity ?? input.ozone_density,
    resolution: input.resolution,
    animate: input.animate,
    animationSpeed: input.animationSpeed,
  };
}

// ---------------------------------------------------------------------------
// Constants — Nishita Physical Parameters
// ---------------------------------------------------------------------------

/** Rayleigh scattering coefficients per wavelength (meters) */
const RAYLEIGH_COEFFICIENTS = new THREE.Vector3(
  5.802e-6,   // red  (680nm)
  13.558e-6,  // green (550nm)
  33.100e-6   // blue (440nm)
);

/** Mie scattering coefficient */
const MIE_COEFFICIENT = 3.996e-6;

/** Ozone absorption cross-section per wavelength */
const OZONE_COEFFICIENTS = new THREE.Vector3(
  0.650,  // red
  1.882,  // green
  0.085   // blue
);

/** Rayleigh scale height in meters */
const RAYLEIGH_SCALE_HEIGHT = 8000;

/** Mie scale height in meters */
const MIE_SCALE_HEIGHT = 1200;

/** Earth radius in meters */
const EARTH_RADIUS = 6360000;

/** Atmosphere outer radius in meters */
const ATMOSPHERE_RADIUS = 6420000;

/** Ozone layer center height in meters */
const OZONE_CENTER_HEIGHT = 25000;

/** Ozone layer half-width in meters */
const OZONE_HALF_WIDTH = 15000;

/** Number of primary ray steps */
const PRIMARY_STEPS = 16;

/** Number of light ray steps */
const LIGHT_STEPS = 8;

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: NishitaSkyConfig = {
  sunElevation: 45,
  sunAzimuth: 180,
  sunIntensity: 1.0,
  airDensity: 1.0,
  dustDensity: 1.0,
  ozoneDensity: 1.0,
  resolution: 1024,
  animate: false,
  animationSpeed: 0.1,
};

// ---------------------------------------------------------------------------
// Internal: Nishita Sky Computation
// ---------------------------------------------------------------------------

/**
 * Compute atmospheric density at a given altitude.
 * @param altitude - Altitude above sea level in meters
 * @param scaleHeight - Scale height for the atmospheric component
 * @returns Density factor
 */
function atmosphericDensity(altitude: number, scaleHeight: number): number {
  return Math.exp(-Math.max(altitude, 0) / scaleHeight);
}

/**
 * Compute ozone density at a given altitude (Gaussian distribution).
 * @param altitude - Altitude above sea level in meters
 * @returns Ozone density factor
 */
function ozoneDensity(altitude: number): number {
  const centerDist = altitude - OZONE_CENTER_HEIGHT;
  const sigma = OZONE_HALF_WIDTH / 3.0;
  return Math.exp(-(centerDist * centerDist) / (2.0 * sigma * sigma));
}

/**
 * Compute the intersection of a ray with the atmosphere sphere.
 * @param rayOrigin - Ray origin in world space
 * @param rayDir - Normalized ray direction
 * @returns Distance to atmosphere boundary (or -1 if no intersection)
 */
function rayAtmosphereIntersection(
  rayOrigin: THREE.Vector3,
  rayDir: THREE.Vector3
): number {
  const b = rayOrigin.dot(rayDir);
  const c = rayOrigin.dot(rayOrigin) - ATMOSPHERE_RADIUS * ATMOSPHERE_RADIUS;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b + Math.sqrt(Math.max(0, disc));
  return t > 0 ? t : -1;
}

/**
 * Compute sky color for a given view direction using the Nishita model.
 * Performs numerical integration through the atmosphere.
 *
 * @param viewDir - Normalized view direction
 * @param sunDir - Normalized sun direction
 * @param config - Sky configuration
 * @returns Computed sky color as THREE.Color
 */
function computeNishitaSkyColor(
  viewDir: THREE.Vector3,
  sunDir: THREE.Vector3,
  config: NishitaSkyConfig
): THREE.Color {
  const cosTheta = THREE.MathUtils.clamp(viewDir.dot(sunDir), -1, 1);

  // Ray origin on Earth surface
  const rayOrigin = new THREE.Vector3(0, EARTH_RADIUS, 0);
  const tAtmo = rayAtmosphereIntersection(rayOrigin, viewDir);

  if (tAtmo < 0) {
    // View ray doesn't hit atmosphere — return black (space)
    return new THREE.Color(0x000000);
  }

  const stepSize = tAtmo / PRIMARY_STEPS;

  // Accumulated optical depth
  const rayleighOD = new THREE.Vector3(0, 0, 0);
  const mieOD = 0;
  let mieODAccum = 0;

  const rayleighAccum = new THREE.Vector3(0, 0, 0);
  const mieAccum = new THREE.Vector3(0, 0, 0);

  // Primary ray march
  for (let i = 0; i < PRIMARY_STEPS; i++) {
    const t = (i + 0.5) * stepSize;
    const samplePos = rayOrigin.clone().addScaledVector(viewDir, t);
    const altitude = samplePos.length() - EARTH_RADIUS;
    const altitudeClamped = Math.max(altitude, 0);

    // Densities
    const rayDensity = atmosphericDensity(altitudeClamped, RAYLEIGH_SCALE_HEIGHT) * config.airDensity;
    const mieDensity = atmosphericDensity(altitudeClamped, MIE_SCALE_HEIGHT) * config.dustDensity;
    const ozDensity = ozoneDensity(altitudeClamped) * config.ozoneDensity;

    // Accumulate optical depth along primary ray
    const rayleighStep = RAYLEIGH_COEFFICIENTS.clone().multiplyScalar(rayDensity * stepSize);
    rayleighOD.add(rayleighStep);
    mieODAccum += MIE_COEFFICIENT * mieDensity * stepSize;

    // Light ray march toward sun
    const sunDirNorm = sunDir.clone().normalize();
    const lightTAtmo = rayAtmosphereIntersection(samplePos, sunDirNorm);

    if (lightTAtmo <= 0) continue;

    const lightStepSize = lightTAtmo / LIGHT_STEPS;
    const lightRayleighOD = new THREE.Vector3(0, 0, 0);
    let lightMieOD = 0;
    let lightOzoneOD = 0;

    for (let j = 0; j < LIGHT_STEPS; j++) {
      const lt = (j + 0.5) * lightStepSize;
      const lightSamplePos = samplePos.clone().addScaledVector(sunDirNorm, lt);
      const lightAltitude = Math.max(lightSamplePos.length() - EARTH_RADIUS, 0);

      const lRayDensity = atmosphericDensity(lightAltitude, RAYLEIGH_SCALE_HEIGHT) * config.airDensity;
      const lMieDensity = atmosphericDensity(lightAltitude, MIE_SCALE_HEIGHT) * config.dustDensity;
      const lOzDensity = ozoneDensity(lightAltitude) * config.ozoneDensity;

      lightRayleighOD.addScaledVector(RAYLEIGH_COEFFICIENTS, lRayDensity * lightStepSize);
      lightMieOD += MIE_COEFFICIENT * lMieDensity * lightStepSize;
      lightOzoneOD += OZONE_COEFFICIENTS.clone().multiplyScalar(lOzDensity * lightStepSize).length();
    }

    // Combined transmittance for this sample
    const totalRayleighOD = rayleighOD.clone().add(lightRayleighOD);
    const totalMieOD = mieODAccum + lightMieOD;

    const transmittance = new THREE.Vector3(
      Math.exp(-totalRayleighOD.x - totalMieOD * 1.1 - lightOzoneOD),
      Math.exp(-totalRayleighOD.y - totalMieOD * 1.1 - lightOzoneOD),
      Math.exp(-totalRayleighOD.z - totalMieOD * 1.1 - lightOzoneOD)
    );

    // In-scattering contributions
    const phaseRayleigh = 3.0 / (16.0 * Math.PI) * (1.0 + cosTheta * cosTheta);
    const g = 0.76;
    const g2 = g * g;
    const phaseMie = (1.0 - g2) / (4.0 * Math.PI * Math.pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));

    // Accumulate in-scattering
    const rayleighScatter = RAYLEIGH_COEFFICIENTS.clone()
      .multiplyScalar(rayDensity * stepSize * phaseRayleigh);
    rayleighAccum.add(rayleighScatter.multiply(transmittance));

    const mieScatter = MIE_COEFFICIENT * mieDensity * stepSize * phaseMie;
    mieAccum.addScaledVector(transmittance, mieScatter);
  }

  // Combine Rayleigh and Mie contributions
  const result = rayleighAccum.add(mieAccum);
  result.multiplyScalar(config.sunIntensity * 20.0);

  // Tone mapping (simple Reinhard)
  result.x = result.x / (1.0 + result.x);
  result.y = result.y / (1.0 + result.y);
  result.z = result.z / (1.0 + result.z);

  return new THREE.Color(
    THREE.MathUtils.clamp(result.x, 0, 1),
    THREE.MathUtils.clamp(result.y, 0, 1),
    THREE.MathUtils.clamp(result.z, 0, 1)
  );
}

/**
 * Compute sun direction from elevation and azimuth.
 */
function computeSunDirection(elevationDeg: number, azimuthDeg: number): THREE.Vector3 {
  const elevRad = elevationDeg * (Math.PI / 180);
  const azimRad = azimuthDeg * (Math.PI / 180);

  return new THREE.Vector3(
    Math.cos(elevRad) * Math.sin(azimRad),
    Math.sin(elevRad),
    -Math.cos(elevRad) * Math.cos(azimRad)
  ).normalize();
}

// ---------------------------------------------------------------------------
// ProceduralEquirectTexture — lazy import from three-gpu-pathtracer
// ---------------------------------------------------------------------------

let ProceduralEquirectTextureClass: any = null;
let proceduralLoadAttempted = false;

async function loadProceduralEquirectTexture(): Promise<any> {
  if (ProceduralEquirectTextureClass) return ProceduralEquirectTextureClass;
  if (proceduralLoadAttempted) return null;

  proceduralLoadAttempted = true;
  try {
    const module = await import('three-gpu-pathtracer');
    ProceduralEquirectTextureClass = module.ProceduralEquirectTexture;
    return ProceduralEquirectTextureClass;
  } catch (err) {
    console.warn('[NishitaSky] Failed to load ProceduralEquirectTexture from three-gpu-pathtracer:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fallback: DataTexture Sky
// ---------------------------------------------------------------------------

/**
 * Create a fallback DataTexture with computed Nishita sky colors.
 * Used when three-gpu-pathtracer is not available.
 */
function createFallbackDataTexture(config: NishitaSkyConfig): THREE.DataTexture {
  const width = config.resolution;
  const height = width / 2;
  const data = new Float32Array(width * height * 4);

  const sunDir = computeSunDirection(config.sunElevation, config.sunAzimuth);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;

      // Equirectangular mapping
      const theta = u * 2.0 * Math.PI;
      const phi = v * Math.PI;

      const viewDir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();

      const color = computeNishitaSkyColor(viewDir, sunDir, config);

      const idx = (x + y * width) * 4;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 1.0;
    }
  }

  const texture = new THREE.DataTexture(data, width, height);
  texture.type = THREE.FloatType;
  texture.format = THREE.RGBAFormat;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

// ---------------------------------------------------------------------------
// Public API: createNishitaSkyTexture
// ---------------------------------------------------------------------------

/**
 * Create a Nishita sky environment texture.
 *
 * Tries to use ProceduralEquirectTexture from three-gpu-pathtracer for
 * GPU-accelerated sky generation. Falls back to a CPU-computed DataTexture
 * if the pathtracer library is not available.
 *
 * @param config - Sky configuration (partial, defaults applied)
 * @returns Environment texture suitable for scene.environment / scene.background
 */
export async function createNishitaSkyTexture(
  config: NishitaSkyConfigInput = {}
): Promise<THREE.Texture> {
  const normalized = normalizeConfigInput(config);
  const fullConfig: NishitaSkyConfig = { ...DEFAULT_CONFIG, ...normalized };

  // Try to use ProceduralEquirectTexture for GPU-based generation
  const ProceduralEquirectTexture = await loadProceduralEquirectTexture();

  if (ProceduralEquirectTexture) {
    try {
      const width = fullConfig.resolution;
      const height = width / 2;

      const texture = new ProceduralEquirectTexture(width, height);

      // Set up the generation callback that computes sky colors.
      // ProceduralEquirectTexture.generationCallback signature:
      //   (polar: Spherical, uv: Vector2, coord: Vector2, color: Color) => void
      texture.generationCallback = (
        _polar: THREE.Spherical,
        uv: THREE.Vector2,
        _coord: THREE.Vector2,
        outColor: THREE.Color
      ) => {
        const sunDir = computeSunDirection(fullConfig.sunElevation, fullConfig.sunAzimuth);

        const theta = uv.x * 2.0 * Math.PI;
        const phi = uv.y * Math.PI;

        const viewDir = new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta)
        ).normalize();

        const skyColor = computeNishitaSkyColor(viewDir, sunDir, fullConfig);
        outColor.copy(skyColor);
      };

      texture.multipleImportanceSampling = true;
      texture.update();

      return texture as THREE.Texture;
    } catch (err) {
      console.warn('[NishitaSky] ProceduralEquirectTexture failed, using fallback:', err);
    }
  }

  // Fallback: CPU-computed DataTexture
  return createFallbackDataTexture(fullConfig);
}

// ---------------------------------------------------------------------------
// NishitaSkyHelper Class
// ---------------------------------------------------------------------------

/**
 * Helper class for managing a Nishita sky in a THREE.js scene.
 *
 * Handles creation, animation, and updates of the sky environment texture.
 * Supports time-of-day transitions with smooth sun position interpolation.
 *
 * @phase 7
 * @p-number P7.1
 */
export class NishitaSkyHelper {
  private config: NishitaSkyConfig;
  private scene: THREE.Scene | null = null;
  private texture: THREE.Texture | null = null;
  private currentTimeHours: number = 12;
  private isAnimating: boolean = false;

  constructor(config: NishitaSkyConfigInput = {}) {
    const normalized = normalizeConfigInput(config);
    this.config = { ...DEFAULT_CONFIG, ...normalized };
    this.currentTimeHours = this.config.sunElevation;
  }

  /**
   * Attach the sky to a THREE.js scene.
   * Sets both scene.environment and scene.background.
   */
  async attach(scene: THREE.Scene): Promise<void> {
    this.scene = scene;
    await this.rebuildTexture();

    if (this.texture) {
      scene.environment = this.texture;
      scene.background = this.texture;
    }
  }

  /**
   * Detach the sky from the scene.
   */
  detach(): void {
    if (this.scene) {
      this.scene.environment = null;
      this.scene.background = null;
      this.scene = null;
    }
  }

  /**
   * Update sun position for time-of-day transitions.
   * @param elevation - Sun elevation in degrees
   * @param azimuth - Sun azimuth in degrees
   */
  async setSunPosition(elevation: number, azimuth: number): Promise<void> {
    this.config.sunElevation = elevation;
    this.config.sunAzimuth = azimuth;
    await this.rebuildTexture();
    this.applyTexture();
  }

  /**
   * Set the time of day (0-24 hours) and update sun position accordingly.
   * Uses a sinusoidal model: sunrise ~6h, sunset ~18h.
   */
  async setTimeOfDay(hours: number): Promise<void> {
    this.currentTimeHours = ((hours % 24) + 24) % 24;

    // Map hours to sun elevation and azimuth
    // Sunrise at 6h (0° elevation), noon at 12h (90° elevation), sunset at 18h (0°)
    const dayProgress = (this.currentTimeHours - 6.0) / 12.0; // 0 at 6am, 1 at 6pm
    const elevation = Math.sin(Math.max(0, Math.min(1, dayProgress)) * Math.PI) * 90;
    const azimuth = 180 + dayProgress * 180; // East to West

    // At night, sun is below horizon
    const actualElevation = (this.currentTimeHours >= 6 && this.currentTimeHours <= 18)
      ? elevation
      : -10; // Below horizon

    await this.setSunPosition(actualElevation, azimuth);
  }

  /**
   * Update atmospheric parameters.
   */
  async updateParams(params: NishitaSkyConfigInput): Promise<void> {
    const normalized = normalizeConfigInput(params);
    this.config = { ...this.config, ...normalized };
    await this.rebuildTexture();
    this.applyTexture();
  }

  /**
   * Animate the sky over time (call once per frame).
   * @param deltaTime - Time elapsed since last frame in seconds
   */
  async animate(deltaTime: number): Promise<void> {
    if (!this.config.animate) return;

    this.currentTimeHours += deltaTime * this.config.animationSpeed;
    await this.setTimeOfDay(this.currentTimeHours);
  }

  /**
   * Get current config (read-only copy).
   */
  getConfig(): Readonly<NishitaSkyConfig> {
    return { ...this.config };
  }

  /**
   * Get current time of day in hours.
   */
  getCurrentTimeHours(): number {
    return this.currentTimeHours;
  }

  /**
   * Get the current sky texture (may be null before attach).
   */
  getTexture(): THREE.Texture | null {
    return this.texture;
  }

  /**
   * Start/stop automatic sun animation.
   */
  setAnimating(animate: boolean, speed?: number): void {
    this.config.animate = animate;
    if (speed !== undefined) {
      this.config.animationSpeed = speed;
    }
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private async rebuildTexture(): Promise<void> {
    // Dispose old texture
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }

    this.texture = await createNishitaSkyTexture(this.config);
  }

  private applyTexture(): void {
    if (this.scene && this.texture) {
      this.scene.environment = this.texture;
      this.scene.background = this.texture;
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.detach();
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }
}

/**
 * Filename-matching alias for backward compat.
 * `import NishitaSky from './NishitaSky'` and
 * `import { NishitaSky } from './NishitaSky'` both work.
 */
export { NishitaSkyHelper as NishitaSky };
export default NishitaSky;
