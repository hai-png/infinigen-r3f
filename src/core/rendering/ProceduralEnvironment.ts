/**
 * ProceduralEnvironment — Dynamic Procedural Environment Maps
 *
 * Replaces fixed HDRI with dynamic procedural environments using
 * ProceduralEquirectTexture from three-gpu-pathtracer.
 * Implements Nishita-style atmospheric scattering as generation callback.
 *
 * Phase 1 — P1.2: Environment Map Pipeline
 *
 * @module rendering
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AtmosphereParams {
  /** Sun elevation in radians (0=horizon, PI/2=zenith) */
  sunElevation: number;
  /** Sun azimuth in radians */
  sunAzimuth: number;
  /** Sun intensity multiplier */
  sunIntensity: number;
  /** Rayleigh scattering coefficient (air density) */
  rayleighCoeff: number;
  /** Mie scattering coefficient (dust/aerosol density) */
  mieCoeff: number;
  /** Mie scattering asymmetry parameter (-1..1) */
  mieG: number;
  /** Ozone absorption coefficient */
  ozoneCoeff: number;
  /** Primary wavelength for Rayleigh scattering (nm) — stored as color */
  wavelengths: THREE.Vector3;
}

export const DEFAULT_ATMOSPHERE: AtmosphereParams = {
  sunElevation: Math.PI / 4,
  sunAzimuth: 0,
  sunIntensity: 10.0,
  rayleighCoeff: 5.5,
  mieCoeff: 0.003,
  mieG: 0.76,
  ozoneCoeff: 0.35,
  wavelengths: new THREE.Vector3(680, 550, 440), // nm
};

// ---------------------------------------------------------------------------
// Nishita Atmospheric Scattering
// ---------------------------------------------------------------------------

/**
 * Compute Nishita-style atmospheric scattering for a given direction.
 * This is a simplified implementation suitable for real-time environment map generation.
 *
 * Reference: https://github.com/mrdoob/three.js/blob/dev/src/scenes/Sky.js
 */
function computeAtmosphericColor(
  direction: THREE.Vector3,
  sunDirection: THREE.Vector3,
  params: AtmosphereParams
): THREE.Color {
  const result = new THREE.Color(0, 0, 0);

  // Compute sun-dot-direction
  const cosTheta = direction.dot(sunDirection);

  // Rayleigh scattering phase function
  const rayleighPhase = 3.0 / (16.0 * Math.PI) * (1.0 + cosTheta * cosTheta);

  // Mie scattering phase function (Henyey-Greenstein)
  const miePhase = (() => {
    const g = params.mieG;
    const g2 = g * g;
    const num = (1.0 - g2) * 0.25 / Math.PI;
    const denom = 1.0 + g2 - 2.0 * g * cosTheta;
    return num / (denom * Math.sqrt(denom));
  })();

  // Optical depth approximation
  const sunAboveHorizon = sunDirection.y > 0 ? 1.0 : 0.0;
  const dirAboveHorizon = direction.y > 0 ? 1.0 : 0.0;

  // Rayleigh scattering
  const rayleighCoeff = new THREE.Vector3(
    params.rayleighCoeff * Math.pow(680 / params.wavelengths.x, 4),
    params.rayleighCoeff * Math.pow(680 / params.wavelengths.y, 4),
    params.rayleighCoeff * Math.pow(680 / params.wavelengths.z, 4)
  );

  // Approximate optical depth based on elevation
  const opticalDepthRayleigh = Math.exp(
    -rayleighCoeff.x * 0.25 / Math.max(direction.y, 0.01),
  ) * 0.1;
  const opticalDepthMie = Math.exp(-params.mieCoeff * 0.25 / Math.max(direction.y, 0.01)) * 0.1;

  // Transmittance
  const transmittance = new THREE.Vector3(
    Math.exp(-rayleighCoeff.x * opticalDepthRayleigh * 8.0 - params.mieCoeff * opticalDepthMie * 1.25),
    Math.exp(-rayleighCoeff.y * opticalDepthRayleigh * 8.0 - params.mieCoeff * opticalDepthMie * 1.25),
    Math.exp(-rayleighCoeff.z * opticalDepthRayleigh * 8.0 - params.mieCoeff * opticalDepthMie * 1.25),
  );

  // Inscattering
  const rayleighScatter = new THREE.Vector3(
    rayleighCoeff.x * rayleighPhase,
    rayleighCoeff.y * rayleighPhase,
    rayleighCoeff.z * rayleighPhase,
  );

  const mieScatter = params.mieCoeff * miePhase;

  // Combine
  const scatter = new THREE.Vector3(
    rayleighScatter.x + mieScatter,
    rayleighScatter.y + mieScatter,
    rayleighScatter.z + mieScatter,
  );

  const sunIrradiance = params.sunIntensity * sunAboveHorizon;
  result.setRGB(
    scatter.x * transmittance.x * sunIrradiance,
    scatter.y * transmittance.y * sunIrradiance,
    scatter.z * transmittance.z * sunIrradiance,
  );

  // Add ground bounce light for directions near horizon
  if (direction.y < 0.1 && direction.y > -0.1) {
    const horizonFade = 1.0 - Math.abs(direction.y) * 10.0;
    const horizonColor = new THREE.Color(
      0.4 * transmittance.x,
      0.3 * transmittance.y,
      0.2 * transmittance.z
    );
    result.add(horizonColor.multiplyScalar(horizonFade * sunIrradiance * 0.05));
  }

  // Sun disc
  const sunAngularRadius = 0.00465; // radians
  const sunCosTheta = Math.cos(sunAngularRadius);
  if (cosTheta > sunCosTheta) {
    const sunIntensity = params.sunIntensity * Math.pow(Math.max(0, (cosTheta - sunCosTheta) / (1 - sunCosTheta)), 2);
    result.setRGB(
      result.r + sunIntensity * 1.0,
      result.g + sunIntensity * 0.95,
      result.b + sunIntensity * 0.85,
    );
  }

  // Night sky (when sun is below horizon)
  if (sunDirection.y < 0) {
    const nightFactor = Math.min(1, -sunDirection.y * 3);
    const nightColor = new THREE.Color(0.01, 0.01, 0.03);
    result.lerp(nightColor, nightFactor * 0.8);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Procedural Environment Map
// ---------------------------------------------------------------------------

/**
 * Creates a procedural equirectangular environment map using
 * Nishita-style atmospheric scattering.
 *
 * Uses ProceduralEquirectTexture from three-gpu-pathtracer if available,
 * otherwise generates a DataTexture.
 */
export async function createProceduralEnvironment(
  params: Partial<AtmosphereParams> = {},
  resolution: number = 512
): Promise<THREE.Texture> {
  const fullParams: AtmosphereParams = { ...DEFAULT_ATMOSPHERE, ...params };

  // Compute sun direction from elevation and azimuth
  const sunDirection = new THREE.Vector3(
    Math.cos(fullParams.sunElevation) * Math.sin(fullParams.sunAzimuth),
    Math.sin(fullParams.sunElevation),
    Math.cos(fullParams.sunElevation) * Math.cos(fullParams.sunAzimuth),
  );

  // Try to use ProceduralEquirectTexture
  try {
    const { ProceduralEquirectTexture } = await import('three-gpu-pathtracer');

    const texture = new ProceduralEquirectTexture(resolution, resolution);

    texture.generationCallback = (
      polar: { theta: number; phi: number; radius: number },
      uv: { x: number; y: number },
      coord: { x: number; y: number },
      color: THREE.Color
    ) => {
      // Convert polar coordinates to direction
      const phi = polar.theta; // polar theta = azimuthal angle
      const theta = polar.phi; // polar phi = polar angle

      const dir = new THREE.Vector3(
        Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi),
      );

      const skyColor = computeAtmosphericColor(dir, sunDirection, fullParams);
      color.copy(skyColor);
    };

    texture.update();
    return texture;
  } catch (err) {
    // Silently fall back - ProceduralEquirectTexture not available, using DataTexture fallback
    console.warn('[ProceduralEnvironment] ProceduralEquirectTexture not available, using DataTexture fallback:', err);
    return createFallbackEnvironment(fullParams, sunDirection, resolution);
  }
}

/**
 * Fallback environment map using DataTexture.
 */
function createFallbackEnvironment(
  params: AtmosphereParams,
  sunDirection: THREE.Vector3,
  resolution: number
): THREE.DataTexture {
  const width = resolution * 2;
  const height = resolution;
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;

      // Equirectangular mapping
      const phi = u * Math.PI * 2;
      const theta = v * Math.PI;

      const dir = new THREE.Vector3(
        Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi),
      );

      const color = computeAtmosphericColor(dir, sunDirection, params);

      const idx = (y * width + x) * 4;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 1.0;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// Blurred Environment Map Generator
// ---------------------------------------------------------------------------

/**
 * Generate a blurred version of an environment map for faster path tracer convergence.
 * Uses BlurredEnvMapGenerator from three-gpu-pathtracer if available.
 */
export async function createBlurredEnvironment(
  sourceTexture: THREE.Texture,
  blurAmount: number = 0.35
): Promise<THREE.Texture | null> {
  try {
    const { BlurredEnvMapGenerator } = await import('three-gpu-pathtracer');
    const renderer = getOrCreateTempRenderer();
    if (!renderer) return null;

    const generator = new BlurredEnvMapGenerator(renderer);
    const blurred = generator.generate(sourceTexture, blurAmount);
    generator.dispose();
    return blurred;
  } catch (err) {
    // Silently fall back - BlurredEnvMapGenerator not available
    console.warn('[ProceduralEnvironment] BlurredEnvMapGenerator not available:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Studio / Gradient Environment
// ---------------------------------------------------------------------------

export interface StudioEnvironmentConfig {
  /** Top color (zenith) */
  topColor: THREE.ColorRepresentation;
  /** Bottom color (nadir) */
  bottomColor: THREE.ColorRepresentation;
  /** Gradient exponent */
  exponent: number;
  /** Resolution */
  resolution: number;
}

/**
 * Create a simple gradient environment for studio/indoor lighting.
 */
export async function createStudioEnvironment(
  config: Partial<StudioEnvironmentConfig> = {}
): Promise<THREE.Texture> {
  const fullConfig: StudioEnvironmentConfig = {
    topColor: 0xffffff,
    bottomColor: 0x444444,
    exponent: 2,
    resolution: 256,
    ...config,
  };

  try {
    const { GradientEquirectTexture } = await import('three-gpu-pathtracer');
    const texture = new GradientEquirectTexture(fullConfig.resolution);
    texture.topColor = new THREE.Color(fullConfig.topColor);
    texture.bottomColor = new THREE.Color(fullConfig.bottomColor);
    texture.exponent = fullConfig.exponent;
    texture.update();
    return texture;
  } catch (err) {
    // Silently fall back - GradientEquirectTexture not available, using DataTexture
    if (process.env.NODE_ENV === 'development') console.debug('[ProceduralEnvironment] createStudioEnvironment fallback:', err);
    return createGradientDataTexture(fullConfig);
  }
}

function createGradientDataTexture(config: StudioEnvironmentConfig): THREE.DataTexture {
  const width = config.resolution * 2;
  const height = config.resolution;
  const data = new Float32Array(width * height * 4);

  const topColor = new THREE.Color(config.topColor);
  const bottomColor = new THREE.Color(config.bottomColor);

  for (let y = 0; y < height; y++) {
    const t = Math.pow(y / height, config.exponent);
    const r = THREE.MathUtils.lerp(bottomColor.r, topColor.r, t);
    const g = THREE.MathUtils.lerp(bottomColor.g, topColor.g, t);
    const b = THREE.MathUtils.lerp(bottomColor.b, topColor.b, t);

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 1.0;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempRenderer: THREE.WebGLRenderer | null = null;

function getOrCreateTempRenderer(): THREE.WebGLRenderer | null {
  if (!tempRenderer) {
    try {
      tempRenderer = new THREE.WebGLRenderer({ alpha: true });
    } catch (err) {
      // Silently fall back - WebGLRenderer creation may fail in headless environments
      if (process.env.NODE_ENV === 'development') console.debug('[ProceduralEnvironment] tempRenderer creation fallback:', err);
      return null;
    }
  }
  return tempRenderer;
}

/**
 * Dispose of temporary resources.
 */
export function disposeProceduralEnvironmentResources(): void {
  if (tempRenderer) {
    tempRenderer.dispose();
    tempRenderer = null;
  }
}

/**
 * Convert AtmosphereParams to a sun direction vector.
 */
export function atmosphereToSunDirection(params: AtmosphereParams): THREE.Vector3 {
  return new THREE.Vector3(
    Math.cos(params.sunElevation) * Math.sin(params.sunAzimuth),
    Math.sin(params.sunElevation),
    Math.cos(params.sunElevation) * Math.cos(params.sunAzimuth),
  );
}
