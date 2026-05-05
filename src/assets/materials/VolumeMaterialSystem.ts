/**
 * VolumeMaterialSystem — PrincipledVolume Material Integration for Node Graph
 *
 * Provides a comprehensive volume material type that integrates with the
 * node graph system and connects to the existing VolumetricRenderer and
 * FogVolumeSystem. Supports PrincipledVolume parameters including density,
 * emission, absorption, and scattering with full ray-marched rendering.
 *
 * Features:
 *   - PrincipledVolume parameter model (density, emission, absorption, scattering)
 *   - Per-object volume assignment with bounds and priority
 *   - Preset volume materials (fog, cloud, smoke, fire, etc.)
 *   - GLSL 300 es ray-marching shader with embedded simplex noise
 *   - Henyey-Greenstein phase function for anisotropic scattering
 *   - FBM noise for density variation
 *   - Early-out optimization and configurable step count
 *   - Node graph integration bridge
 *
 * @module assets/materials
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for a PrincipledVolume material.
 * Models the physical properties of a participating medium for
 * ray-marched volumetric rendering.
 */
export interface VolumeMaterialParams {
  /** Volume density — controls how opaque the medium is (default 1.0) */
  density: number;
  /** Optional 3D density field texture overriding constant density */
  densityTexture?: THREE.Data3DTexture;
  /** Emission color — light emitted by the medium (default black / no emission) */
  emissionColor: THREE.Color;
  /** Emission intensity multiplier (default 0) */
  emissionStrength: number;
  /** Absorption tint — wavelengths absorbed preferentially (default white = no tint) */
  absorptionColor: THREE.Color;
  /** Absorption factor — strength of absorption (default 1.0) */
  absorptionStrength: number;
  /** Scattering albedo — color of scattered light (default white) */
  scatteringColor: THREE.Color;
  /** Henyey-Greenstein anisotropy parameter g in [-1, 1]. -1 = back-scatter, 0 = isotropic, 1 = forward (default 0) */
  scatteringAnisotropy: number;
  /** Ray marching step size in world units (default 0.05) */
  stepSize: number;
  /** Maximum number of ray marching steps (default 256) */
  maxSteps: number;
  /** Jitter step offset to reduce banding artifacts (default true) */
  jitter: boolean;
  /** Animate noise over time for temporal variation (default false) */
  temporalNoise: boolean;
  /** Density noise scale vector — controls noise frequency per axis (default 1,1,1) */
  noiseScale: THREE.Vector3;
  /** FBM octaves for density noise (default 4) */
  noiseOctaves: number;
  /** FBM lacunarity — frequency multiplier per octave (default 2.0) */
  noiseLacunarity: number;
  /** FBM gain — amplitude multiplier per octave (default 0.5) */
  noiseGain: number;
}

/**
 * Per-object volume material binding. Associates a VolumeMaterial with
 * a specific object by ID, including its world-space bounds and rendering
 * priority.
 */
export interface VolumeMaterialAssignment {
  /** Unique object identifier */
  objectId: string;
  /** Volume bounds in world space — defines the ray-marching region */
  bounds: THREE.Box3;
  /** The volume material assigned to this object */
  material: VolumeMaterial;
  /** Render priority — higher priority volumes are rendered first (default 0) */
  priority: number;
}

// ============================================================================
// Default Parameters
// ============================================================================

/**
 * Default VolumeMaterialParams used when partial parameters are provided.
 */
const DEFAULT_VOLUME_PARAMS: VolumeMaterialParams = {
  density: 1.0,
  emissionColor: new THREE.Color(0, 0, 0),
  emissionStrength: 0,
  absorptionColor: new THREE.Color(1, 1, 1),
  absorptionStrength: 1.0,
  scatteringColor: new THREE.Color(1, 1, 1),
  scatteringAnisotropy: 0,
  stepSize: 0.05,
  maxSteps: 256,
  jitter: true,
  temporalNoise: false,
  noiseScale: new THREE.Vector3(1, 1, 1),
  noiseOctaves: 4,
  noiseLacunarity: 2.0,
  noiseGain: 0.5,
};

// ============================================================================
// Preset Volume Materials
// ============================================================================

/**
 * Pre-built volume material presets for common volumetric effects.
 * Each preset provides a complete set of VolumeMaterialParams tailored
 * for a specific visual appearance.
 */
export const PRESET_VOLUME_MATERIALS: Record<string, VolumeMaterialParams> = {
  /** Thin atmospheric fog — low density, moderate scattering, isotropic */
  fog: {
    density: 0.3,
    emissionColor: new THREE.Color(0, 0, 0),
    emissionStrength: 0,
    absorptionColor: new THREE.Color(1, 1, 1),
    absorptionStrength: 0.1,
    scatteringColor: new THREE.Color(0.92, 0.94, 0.96),
    scatteringAnisotropy: 0.2,
    stepSize: 0.1,
    maxSteps: 128,
    jitter: true,
    temporalNoise: true,
    noiseScale: new THREE.Vector3(0.5, 0.3, 0.5),
    noiseOctaves: 3,
    noiseLacunarity: 2.0,
    noiseGain: 0.5,
  },

  /** Cumulus cloud — high density noise, white scattering, forward-peaked */
  cloud: {
    density: 2.0,
    emissionColor: new THREE.Color(0, 0, 0),
    emissionStrength: 0,
    absorptionColor: new THREE.Color(1, 1, 1),
    absorptionStrength: 0.5,
    scatteringColor: new THREE.Color(1, 1, 1),
    scatteringAnisotropy: 0.6,
    stepSize: 0.08,
    maxSteps: 200,
    jitter: true,
    temporalNoise: true,
    noiseScale: new THREE.Vector3(1.5, 0.8, 1.5),
    noiseOctaves: 6,
    noiseLacunarity: 2.2,
    noiseGain: 0.55,
  },

  /** Dark smoke — heavy absorption, low emission, forward scattering */
  smoke: {
    density: 1.5,
    emissionColor: new THREE.Color(0.15, 0.08, 0.02),
    emissionStrength: 0.1,
    absorptionColor: new THREE.Color(0.6, 0.55, 0.5),
    absorptionStrength: 2.0,
    scatteringColor: new THREE.Color(0.4, 0.38, 0.35),
    scatteringAnisotropy: 0.7,
    stepSize: 0.06,
    maxSteps: 200,
    jitter: true,
    temporalNoise: true,
    noiseScale: new THREE.Vector3(1.2, 1.5, 1.2),
    noiseOctaves: 5,
    noiseLacunarity: 2.5,
    noiseGain: 0.45,
  },

  /** Fire — strong orange/red emission, low density, isotropic scattering */
  fire: {
    density: 0.8,
    emissionColor: new THREE.Color(1.0, 0.45, 0.05),
    emissionStrength: 5.0,
    absorptionColor: new THREE.Color(1, 0.7, 0.3),
    absorptionStrength: 0.5,
    scatteringColor: new THREE.Color(1, 0.6, 0.2),
    scatteringAnisotropy: 0.1,
    stepSize: 0.03,
    maxSteps: 256,
    jitter: true,
    temporalNoise: true,
    noiseScale: new THREE.Vector3(1.0, 2.0, 1.0),
    noiseOctaves: 5,
    noiseLacunarity: 2.0,
    noiseGain: 0.5,
  },

  /** Underwater fog — blue-green absorption, low density, isotropic */
  underwaterFog: {
    density: 0.5,
    emissionColor: new THREE.Color(0.0, 0.05, 0.08),
    emissionStrength: 0.05,
    absorptionColor: new THREE.Color(0.2, 0.6, 0.8),
    absorptionStrength: 1.5,
    scatteringColor: new THREE.Color(0.3, 0.7, 0.8),
    scatteringAnisotropy: 0.0,
    stepSize: 0.08,
    maxSteps: 180,
    jitter: true,
    temporalNoise: true,
    noiseScale: new THREE.Vector3(0.4, 0.3, 0.4),
    noiseOctaves: 3,
    noiseLacunarity: 2.0,
    noiseGain: 0.5,
  },

  /** Sparse dusty atmosphere — very low density, subtle scattering */
  dust: {
    density: 0.15,
    emissionColor: new THREE.Color(0, 0, 0),
    emissionStrength: 0,
    absorptionColor: new THREE.Color(0.9, 0.85, 0.7),
    absorptionStrength: 0.2,
    scatteringColor: new THREE.Color(0.95, 0.9, 0.8),
    scatteringAnisotropy: 0.4,
    stepSize: 0.12,
    maxSteps: 100,
    jitter: true,
    temporalNoise: false,
    noiseScale: new THREE.Vector3(0.3, 0.2, 0.3),
    noiseOctaves: 3,
    noiseLacunarity: 2.0,
    noiseGain: 0.5,
  },

  /** Hot lava — strong red/orange emission, dense */
  lava: {
    density: 2.5,
    emissionColor: new THREE.Color(1.0, 0.3, 0.0),
    emissionStrength: 8.0,
    absorptionColor: new THREE.Color(1, 0.3, 0.05),
    absorptionStrength: 1.5,
    scatteringColor: new THREE.Color(1, 0.4, 0.1),
    scatteringAnisotropy: 0.0,
    stepSize: 0.04,
    maxSteps: 256,
    jitter: true,
    temporalNoise: true,
    noiseScale: new THREE.Vector3(1.2, 0.6, 1.2),
    noiseOctaves: 5,
    noiseLacunarity: 2.3,
    noiseGain: 0.55,
  },

  /** Toxic gas — green emission with absorption */
  toxicGas: {
    density: 1.0,
    emissionColor: new THREE.Color(0.1, 0.8, 0.1),
    emissionStrength: 2.0,
    absorptionColor: new THREE.Color(0.3, 0.9, 0.3),
    absorptionStrength: 1.2,
    scatteringColor: new THREE.Color(0.4, 0.9, 0.4),
    scatteringAnisotropy: 0.3,
    stepSize: 0.06,
    maxSteps: 180,
    jitter: true,
    temporalNoise: true,
    noiseScale: new THREE.Vector3(0.8, 1.0, 0.8),
    noiseOctaves: 4,
    noiseLacunarity: 2.0,
    noiseGain: 0.5,
  },
};

// ============================================================================
// Embedded GLSL Shader Code
// ============================================================================

/**
 * GLSL 300 es simplex noise implementation embedded directly in the shader.
 * Avoids external texture lookups for density noise, keeping the material
 * self-contained and compatible with WebGL2.
 */
const VOLUME_NOISE_GLSL = /* glsl */ `
// ============================================================================
// 3D Simplex Noise (embedded for volume shader)
// ============================================================================

vec3 mod289_vol(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_vol4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute_vol(vec4 x) { return mod289_vol4(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt_vol(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289_vol(i);
  vec4 p = permute_vol(permute_vol(permute_vol(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt_vol(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// ============================================================================
// FBM (Fractional Brownian Motion) for density variation
// ============================================================================

float volumeFBM(vec3 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / max(maxValue, 0.001);
}
`;

/**
 * Vertex shader for volume rendering.
 * Transforms the bounding box geometry and passes world position
 * and local coordinates to the fragment shader for ray setup.
 */
const VOLUME_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec3 position;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

out vec3 vWorldPos;
out vec3 vLocalPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vLocalPos = position;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

/**
 * Fragment shader for volume rendering.
 * Performs ray marching through the volume with:
 *   - Density sampling (constant or from 3D texture + FBM noise)
 *   - Henyey-Greenstein phase function for scattering
 *   - Absorption + emission + scattering integration
 *   - Jittered step offsets to reduce banding
 *   - Early-out when accumulated opacity > 0.99
 */
const VOLUME_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uDensity;
uniform vec3 uEmissionColor;
uniform float uEmissionStrength;
uniform vec3 uAbsorptionColor;
uniform float uAbsorptionStrength;
uniform vec3 uScatteringColor;
uniform float uScatteringAnisotropy;
uniform float uStepSize;
uniform int uMaxSteps;
uniform bool uJitter;
uniform bool uTemporalNoise;
uniform float uTime;
uniform vec3 uNoiseScale;
uniform int uNoiseOctaves;
uniform float uNoiseLacunarity;
uniform float uNoiseGain;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
uniform bool uHasDensityTexture;
uniform sampler3D uDensityTexture;

in vec3 vWorldPos;
in vec3 vLocalPos;

out vec4 fragColor;

${VOLUME_NOISE_GLSL}

// ============================================================================
// Ray-Box Intersection
// ============================================================================

struct RayBoxHit {
  float tNear;
  float tFar;
  bool hit;
};

RayBoxHit intersectRayBox(vec3 rayOrigin, vec3 rayDir, vec3 boxMin, vec3 boxMax) {
  vec3 invDir = 1.0 / rayDir;

  vec3 tMinTmp = (boxMin - rayOrigin) * invDir;
  vec3 tMaxTmp = (boxMax - rayOrigin) * invDir;

  vec3 tMinV = min(tMinTmp, tMaxTmp);
  vec3 tMaxV = max(tMinTmp, tMaxTmp);

  float tNear = max(max(tMinV.x, tMinV.y), tMinV.z);
  float tFar  = min(min(tMaxV.x, tMaxV.y), tMaxV.z);

  RayBoxHit result;
  result.tNear = tNear;
  result.tFar = tFar;
  result.hit = tFar >= tNear && tFar > 0.0;
  return result;
}

// ============================================================================
// Henyey-Greenstein Phase Function
// ============================================================================

float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  // Clamp denominator to avoid division by zero
  denom = max(denom, 0.0001);
  return (1.0 - g2) / (4.0 * 3.14159265 * denom * sqrt(denom));
}

// ============================================================================
// Density Sampling
// ============================================================================

float sampleDensity(vec3 pos) {
  float baseDensity = uDensity;

  // Sample from 3D texture if available
  if (uHasDensityTexture) {
    // Map world position to texture coordinates [0, 1]
    vec3 uvw = (pos - uBoundsMin) / max(uBoundsMax - uBoundsMin, vec3(0.001));
    uvw = clamp(uvw, 0.0, 1.0);
    baseDensity *= texture(uDensityTexture, uvw).r;
  }

  // Apply FBM noise for density variation
  vec3 noisePos = pos * uNoiseScale;
  if (uTemporalNoise) {
    noisePos += vec3(uTime * 0.05, uTime * 0.02, uTime * 0.04);
  }

  float noiseVal = volumeFBM(noisePos, uNoiseOctaves, uNoiseLacunarity, uNoiseGain);
  // Remap from [-1,1] to [0,1]
  noiseVal = noiseVal * 0.5 + 0.5;

  // Modulate density by noise — densities below a threshold are cut away
  float noiseDensity = baseDensity * noiseVal;

  return max(noiseDensity, 0.0);
}

// ============================================================================
// Main Ray-Marching Loop
// ============================================================================

void main() {
  // Compute ray from camera through fragment world position
  vec3 rayOrigin = uCameraPos;
  vec3 rayDir = normalize(vWorldPos - uCameraPos);

  // Intersect ray with volume bounds
  RayBoxHit hit = intersectRayBox(rayOrigin, rayDir, uBoundsMin, uBoundsMax);
  if (!hit.hit) {
    discard;
  }

  // Clamp entry point to positive t
  float tStart = max(hit.tNear, 0.0);
  float tEnd = hit.tFar;

  float stepSize = uStepSize;

  // Apply jitter to reduce banding artifacts
  float jitterOffset = 0.0;
  if (uJitter) {
    // Pseudo-random jitter based on screen position
    jitterOffset = fract(sin(dot(vWorldPos.xy, vec2(12.9898, 78.233))) * 43758.5453) * stepSize;
  }

  // Initialize accumulators for front-to-back compositing
  vec3 accumColor = vec3(0.0);
  float accumAlpha = 0.0;

  vec3 pos = rayOrigin + rayDir * (tStart + jitterOffset);
  float t = tStart + jitterOffset;

  // Ray march through the volume
  for (int i = 0; i < 512; i++) {
    if (i >= uMaxSteps) break;
    if (t >= tEnd) break;
    if (accumAlpha > 0.99) break;

    // Sample density at current position
    float density = sampleDensity(pos);

    if (density > 0.001) {
      // --- Absorption ---
      vec3 absorption = uAbsorptionColor * uAbsorptionStrength * density;

      // --- Emission ---
      vec3 emission = uEmissionColor * uEmissionStrength * density;

      // --- Scattering ---
      // Phase function for single scattering from directional light
      float cosTheta = dot(rayDir, uLightDir);
      float phase = henyeyGreenstein(cosTheta, uScatteringAnisotropy);

      // Add isotropic component for multi-scattering approximation
      float isotropicPhase = 1.0 / (4.0 * 3.14159265);
      phase = mix(isotropicPhase, phase, 0.8);

      vec3 scattering = uScatteringColor * uLightColor * phase * density;

      // Ambient scattering approximation (sky light)
      vec3 ambientScatter = uScatteringColor * 0.15 * density;

      // --- Beer-Lambert transmittance for this step ---
      vec3 extinction = absorption + uScatteringColor * density;
      float sampleAlpha = 1.0 - exp(-dot(extinction, vec3(0.333)) * stepSize);
      sampleAlpha = clamp(sampleAlpha, 0.0, 1.0);

      // --- Combined sample color ---
      vec3 sampleColor = (scattering + ambientScatter + emission);

      // --- Front-to-back compositing ---
      float alphaContrib = sampleAlpha * (1.0 - accumAlpha);
      accumColor += sampleColor * alphaContrib;
      accumAlpha += alphaContrib;
    }

    // Advance along ray
    pos += rayDir * stepSize;
    t += stepSize;
  }

  // Output composited result
  fragColor = vec4(accumColor, accumAlpha);
}
`;

// ============================================================================
// VolumeMaterial Class
// ============================================================================

/**
 * VolumeMaterial — A standalone volume material that creates a THREE.ShaderMaterial
 * for ray-marched volumetric rendering with PrincipledVolume parameters.
 *
 * This material performs per-fragment ray marching through a bounded volume
 * with physically-based absorption, emission, and scattering. It supports
 * constant or 3D-texture-driven density fields with FBM noise modulation.
 *
 * @example
 * ```ts
 * const volMat = new VolumeMaterial({
 *   density: 0.5,
 *   emissionColor: new THREE.Color(1, 0.5, 0),
 *   emissionStrength: 2.0,
 * });
 * const shaderMat = volMat.createShaderMaterial();
 * ```
 */
export class VolumeMaterial {
  /** The resolved (defaulted) parameters for this volume material */
  readonly params: VolumeMaterialParams;

  /** The underlying ShaderMaterial, lazily created */
  private shaderMaterial: THREE.ShaderMaterial | null = null;

  /**
   * Create a new VolumeMaterial with the given parameters.
   * Missing parameters fall back to sensible defaults.
   *
   * @param params - Partial volume material parameters
   */
  constructor(params: Partial<VolumeMaterialParams> = {}) {
    this.params = {
      density: params.density ?? DEFAULT_VOLUME_PARAMS.density,
      densityTexture: params.densityTexture,
      emissionColor: params.emissionColor?.clone() ?? DEFAULT_VOLUME_PARAMS.emissionColor.clone(),
      emissionStrength: params.emissionStrength ?? DEFAULT_VOLUME_PARAMS.emissionStrength,
      absorptionColor: params.absorptionColor?.clone() ?? DEFAULT_VOLUME_PARAMS.absorptionColor.clone(),
      absorptionStrength: params.absorptionStrength ?? DEFAULT_VOLUME_PARAMS.absorptionStrength,
      scatteringColor: params.scatteringColor?.clone() ?? DEFAULT_VOLUME_PARAMS.scatteringColor.clone(),
      scatteringAnisotropy: params.scatteringAnisotropy ?? DEFAULT_VOLUME_PARAMS.scatteringAnisotropy,
      stepSize: params.stepSize ?? DEFAULT_VOLUME_PARAMS.stepSize,
      maxSteps: params.maxSteps ?? DEFAULT_VOLUME_PARAMS.maxSteps,
      jitter: params.jitter ?? DEFAULT_VOLUME_PARAMS.jitter,
      temporalNoise: params.temporalNoise ?? DEFAULT_VOLUME_PARAMS.temporalNoise,
      noiseScale: params.noiseScale?.clone() ?? DEFAULT_VOLUME_PARAMS.noiseScale.clone(),
      noiseOctaves: params.noiseOctaves ?? DEFAULT_VOLUME_PARAMS.noiseOctaves,
      noiseLacunarity: params.noiseLacunarity ?? DEFAULT_VOLUME_PARAMS.noiseLacunarity,
      noiseGain: params.noiseGain ?? DEFAULT_VOLUME_PARAMS.noiseGain,
    };
  }

  /**
   * Creates a THREE.ShaderMaterial configured for volume rendering.
   * The material uses a ray-marching fragment shader with embedded
   * simplex noise for density variation.
   *
   * The material is transparent, depth-write disabled, and uses
   * additive blending for proper volumetric compositing.
   *
   * @returns A ShaderMaterial ready for use on a bounding box mesh
   */
  createShaderMaterial(): THREE.ShaderMaterial {
    if (this.shaderMaterial) {
      return this.shaderMaterial;
    }

    this.shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uCameraPos: { value: new THREE.Vector3() },
        uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uLightColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
        uDensity: { value: this.params.density },
        uEmissionColor: { value: this.params.emissionColor.clone() },
        uEmissionStrength: { value: this.params.emissionStrength },
        uAbsorptionColor: { value: this.params.absorptionColor.clone() },
        uAbsorptionStrength: { value: this.params.absorptionStrength },
        uScatteringColor: { value: this.params.scatteringColor.clone() },
        uScatteringAnisotropy: { value: this.params.scatteringAnisotropy },
        uStepSize: { value: this.params.stepSize },
        uMaxSteps: { value: this.params.maxSteps },
        uJitter: { value: this.params.jitter },
        uTemporalNoise: { value: this.params.temporalNoise },
        uTime: { value: 0.0 },
        uNoiseScale: { value: this.params.noiseScale.clone() },
        uNoiseOctaves: { value: this.params.noiseOctaves },
        uNoiseLacunarity: { value: this.params.noiseLacunarity },
        uNoiseGain: { value: this.params.noiseGain },
        uBoundsMin: { value: new THREE.Vector3(-0.5, -0.5, -0.5) },
        uBoundsMax: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
        uHasDensityTexture: { value: this.params.densityTexture !== undefined },
        uDensityTexture: { value: this.params.densityTexture ?? null },
      },
      vertexShader: VOLUME_VERTEX_SHADER,
      fragmentShader: VOLUME_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });

    this.shaderMaterial.userData._isVolumeMaterial = true;
    this.shaderMaterial.userData._volumeParams = this.params;

    return this.shaderMaterial;
  }

  /**
   * Update time-dependent uniforms for animated volume effects.
   * Call this once per frame with the current elapsed time.
   *
   * @param time - Current time in seconds
   */
  update(time: number): void {
    if (!this.shaderMaterial) return;
    const u = this.shaderMaterial.uniforms;
    u.uTime.value = time;
  }

  /**
   * Set a 3D density field texture to override constant density.
   * When set, the density is multiplied by the texture value at each
   * sample point during ray marching.
   *
   * @param texture - A THREE.Data3DTexture containing density values
   */
  setDensityTexture(texture: THREE.Data3DTexture): void {
    this.params.densityTexture = texture;
    if (this.shaderMaterial) {
      this.shaderMaterial.uniforms.uDensityTexture.value = texture;
      this.shaderMaterial.uniforms.uHasDensityTexture.value = true;
    }
  }

  /**
   * Create a deep copy of this VolumeMaterial with identical parameters.
   * The returned material is independent — modifying it will not affect
   * the original.
   *
   * @returns A new VolumeMaterial with the same parameters
   */
  clone(): VolumeMaterial {
    return new VolumeMaterial({
      density: this.params.density,
      densityTexture: this.params.densityTexture,
      emissionColor: this.params.emissionColor.clone(),
      emissionStrength: this.params.emissionStrength,
      absorptionColor: this.params.absorptionColor.clone(),
      absorptionStrength: this.params.absorptionStrength,
      scatteringColor: this.params.scatteringColor.clone(),
      scatteringAnisotropy: this.params.scatteringAnisotropy,
      stepSize: this.params.stepSize,
      maxSteps: this.params.maxSteps,
      jitter: this.params.jitter,
      temporalNoise: this.params.temporalNoise,
      noiseScale: this.params.noiseScale.clone(),
      noiseOctaves: this.params.noiseOctaves,
      noiseLacunarity: this.params.noiseLacunarity,
      noiseGain: this.params.noiseGain,
    });
  }

  /**
   * Dispose the underlying ShaderMaterial and free GPU resources.
   * The VolumeMaterial instance should not be used after disposal.
   */
  dispose(): void {
    if (this.shaderMaterial) {
      this.shaderMaterial.dispose();
      this.shaderMaterial = null;
    }
    if (this.params.densityTexture) {
      this.params.densityTexture.dispose();
    }
  }
}

// ============================================================================
// VolumeMaterialManager
// ============================================================================

/**
 * VolumeMaterialManager — Orchestrates volume material rendering across
 * multiple objects in a scene. Manages per-object volume assignments with
 * bounds and priority, and creates efficient merged volume meshes.
 *
 * @example
 * ```ts
 * const manager = new VolumeMaterialManager();
 * const vol = manager.assign('fog1', new THREE.Box3(...), { density: 0.3 });
 * const group = manager.createSceneVolumeMesh();
 * scene.add(group);
 *
 * // In render loop:
 * manager.update(time);
 * ```
 */
export class VolumeMaterialManager {
  /** Map of object IDs to their volume material assignments */
  private assignments: Map<string, VolumeMaterialAssignment> = new Map();

  /** Cached scene volume mesh group */
  private sceneGroup: THREE.Group | null = null;

  /** Flag indicating the scene group needs rebuilding */
  private dirty: boolean = true;

  /**
   * Assign a volume material to an object by its ID and world-space bounds.
   * If an assignment already exists for the given objectId, it is replaced.
   *
   * @param objectId - Unique identifier for the object
   * @param bounds - World-space bounding box for the volume
   * @param params - Partial volume material parameters
   * @param priority - Render priority (higher = rendered first, default 0)
   * @returns The created VolumeMaterial instance
   */
  assign(
    objectId: string,
    bounds: THREE.Box3,
    params: Partial<VolumeMaterialParams> = {},
    priority: number = 0,
  ): VolumeMaterial {
    // Remove existing assignment if present
    if (this.assignments.has(objectId)) {
      this.remove(objectId);
    }

    const material = new VolumeMaterial(params);

    this.assignments.set(objectId, {
      objectId,
      bounds: bounds.clone(),
      material,
      priority,
    });

    this.dirty = true;
    return material;
  }

  /**
   * Remove a volume material assignment by object ID.
   * Disposes the associated material resources.
   *
   * @param objectId - The object identifier to remove
   * @returns True if the assignment was found and removed
   */
  remove(objectId: string): boolean {
    const assignment = this.assignments.get(objectId);
    if (!assignment) return false;

    assignment.material.dispose();
    this.assignments.delete(objectId);
    this.dirty = true;
    return true;
  }

  /**
   * Get the VolumeMaterial assigned to a specific object.
   *
   * @param objectId - The object identifier
   * @returns The VolumeMaterial, or undefined if not assigned
   */
  getMaterial(objectId: string): VolumeMaterial | undefined {
    return this.assignments.get(objectId)?.material;
  }

  /**
   * Get all current volume material assignments.
   * Returns a sorted array by priority (highest first).
   *
   * @returns Array of all assignments
   */
  getAllAssignments(): VolumeMaterialAssignment[] {
    return Array.from(this.assignments.values()).sort(
      (a, b) => b.priority - a.priority,
    );
  }

  /**
   * Creates a THREE.Group containing mesh instances for all volume assignments.
   * Each assignment becomes a BoxGeometry mesh with the appropriate volume
   * shader material and transforms matching the assigned bounds.
   *
   * The group is cached and only rebuilt when assignments change (dirty flag).
   *
   * @returns A THREE.Group containing all volume meshes
   */
  createSceneVolumeMesh(): THREE.Group {
    if (!this.dirty && this.sceneGroup) {
      return this.sceneGroup;
    }

    // Dispose old group
    if (this.sceneGroup) {
      this.disposeGroup(this.sceneGroup);
    }

    this.sceneGroup = new THREE.Group();
    this.sceneGroup.name = 'volume-materials';

    const sorted = this.getAllAssignments();

    for (const assignment of sorted) {
      const { bounds, material } = assignment;

      // Create bounding box geometry matching the volume bounds
      const size = new THREE.Vector3();
      bounds.getSize(size);

      // Skip zero-size bounds
      if (size.x <= 0 || size.y <= 0 || size.z <= 0) continue;

      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      const shaderMaterial = material.createShaderMaterial();

      // Set bounds uniforms
      shaderMaterial.uniforms.uBoundsMin.value.copy(bounds.min);
      shaderMaterial.uniforms.uBoundsMax.value.copy(bounds.max);

      const mesh = new THREE.Mesh(geometry, shaderMaterial);
      mesh.name = `volume-${assignment.objectId}`;

      // Position mesh at the center of the bounds
      const center = new THREE.Vector3();
      bounds.getCenter(center);
      mesh.position.copy(center);

      mesh.userData._volumeAssignmentId = assignment.objectId;

      this.sceneGroup.add(mesh);
    }

    this.dirty = false;
    return this.sceneGroup;
  }

  /**
   * Update all volume materials with the current time.
   * Also updates camera position uniforms on all materials.
   *
   * @param time - Current time in seconds
   * @param camera - Optional camera for updating camera-dependent uniforms
   */
  update(time: number, camera?: THREE.Camera): void {
    for (const assignment of this.assignments.values()) {
      assignment.material.update(time);
    }

    // Update camera position on all shader materials in the group
    if (camera && this.sceneGroup) {
      this.sceneGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
          if (child.material.uniforms.uCameraPos) {
            child.material.uniforms.uCameraPos.value.copy(camera.position);
          }
        }
      });
    }
  }

  /**
   * Dispose all volume material assignments and the scene group.
   * Frees all GPU resources.
   */
  dispose(): void {
    for (const assignment of this.assignments.values()) {
      assignment.material.dispose();
    }
    this.assignments.clear();

    if (this.sceneGroup) {
      this.disposeGroup(this.sceneGroup);
      this.sceneGroup = null;
    }

    this.dirty = true;
  }

  /**
   * Dispose all meshes and geometries within a group.
   */
  private disposeGroup(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        // Material is owned by VolumeMaterial — don't double-dispose
      }
    });
  }

  /**
   * Mark the manager as needing a rebuild of the scene volume mesh.
   * Call this after manually modifying assignment bounds.
   */
  markDirty(): void {
    this.dirty = true;
  }
}

// ============================================================================
// Node Graph Integration
// ============================================================================

/**
 * Node graph output keys that map to VolumeMaterialParams fields.
 * Used by the node graph bridge to convert evaluated node outputs
 * into volume material parameters.
 */
const NODE_GRAPH_PARAM_MAP: Record<string, keyof VolumeMaterialParams> = {
  density: 'density',
  emissionColor: 'emissionColor',
  emissionStrength: 'emissionStrength',
  absorptionColor: 'absorptionColor',
  absorptionStrength: 'absorptionStrength',
  scatteringColor: 'scatteringColor',
  scatteringAnisotropy: 'scatteringAnisotropy',
  stepSize: 'stepSize',
  maxSteps: 'maxSteps',
  anisotropy: 'scatteringAnisotropy',
  phaseG: 'scatteringAnisotropy',
  noiseScale: 'noiseScale',
  noiseOctaves: 'noiseOctaves',
  lacunarity: 'noiseLacunarity',
  gain: 'noiseGain',
};

/**
 * Creates a VolumeMaterial from node graph evaluation outputs.
 * This function bridges the node graph system (NodeEvaluator) to the
 * volume material system, mapping node output values to VolumeMaterialParams.
 *
 * Supports the following output keys from node evaluations:
 *   - `density` (number): Volume density
 *   - `emissionColor` (THREE.Color | [r,g,b]): Emission color
 *   - `emissionStrength` (number): Emission intensity
 *   - `absorptionColor` (THREE.Color | [r,g,b]): Absorption tint
 *   - `absorptionStrength` (number): Absorption factor
 *   - `scatteringColor` (THREE.Color | [r,g,b]): Scattering albedo
 *   - `scatteringAnisotropy` / `anisotropy` / `phaseG` (number): HG g parameter
 *   - `stepSize` (number): Ray step size
 *   - `maxSteps` (number): Maximum ray steps
 *   - `noiseScale` (THREE.Vector3 | [x,y,z]): Noise scale
 *   - `noiseOctaves` (number): FBM octaves
 *   - `lacunarity` (number): FBM lacunarity
 *   - `gain` (number): FBM gain
 *   - `densityTexture` (THREE.Data3DTexture): 3D density field
 *
 * @param nodeOutputs - Record of node output names to their evaluated values
 * @returns A new VolumeMaterial constructed from the node graph outputs
 *
 * @example
 * ```ts
 * const result = nodeEvaluator.evaluate(graph, EvaluationMode.MATERIAL);
 * const volMat = createVolumeMaterialFromNodeGraph(result.value);
 * ```
 */
export function createVolumeMaterialFromNodeGraph(
  nodeOutputs: Record<string, any>,
): VolumeMaterial {
  const params: Partial<VolumeMaterialParams> = {};

  for (const [key, value] of Object.entries(nodeOutputs)) {
    if (value === undefined || value === null) continue;

    // Map node output key to VolumeMaterialParams key
    const mappedKey = NODE_GRAPH_PARAM_MAP[key];
    const paramKey = mappedKey ?? key;

    if (paramKey in DEFAULT_VOLUME_PARAMS) {
      // Convert value types as needed
      if (
        paramKey === 'emissionColor' ||
        paramKey === 'absorptionColor' ||
        paramKey === 'scatteringColor'
      ) {
        if (value instanceof THREE.Color) {
          (params as any)[paramKey] = value.clone();
        } else if (Array.isArray(value)) {
          (params as any)[paramKey] = new THREE.Color(value[0], value[1], value[2]);
        } else if (typeof value === 'number') {
          (params as any)[paramKey] = new THREE.Color(value);
        }
      } else if (paramKey === 'noiseScale') {
        if (value instanceof THREE.Vector3) {
          (params as any)[paramKey] = value.clone();
        } else if (Array.isArray(value)) {
          (params as any)[paramKey] = new THREE.Vector3(value[0], value[1], value[2]);
        }
      } else if (paramKey === 'densityTexture') {
        if (value instanceof THREE.Data3DTexture) {
          (params as any)[paramKey] = value;
        }
      } else {
        (params as any)[paramKey] = value;
      }
    }
  }

  // If a preset name was specified, use it as a base and override with node outputs
  const presetName = nodeOutputs.preset ?? nodeOutputs.volumePreset;
  if (
    typeof presetName === 'string' &&
    presetName in PRESET_VOLUME_MATERIALS
  ) {
    const preset = PRESET_VOLUME_MATERIALS[presetName];
    return new VolumeMaterial({
      density: preset.density,
      emissionColor: preset.emissionColor.clone(),
      emissionStrength: preset.emissionStrength,
      absorptionColor: preset.absorptionColor.clone(),
      absorptionStrength: preset.absorptionStrength,
      scatteringColor: preset.scatteringColor.clone(),
      scatteringAnisotropy: preset.scatteringAnisotropy,
      stepSize: preset.stepSize,
      maxSteps: preset.maxSteps,
      jitter: preset.jitter,
      temporalNoise: preset.temporalNoise,
      noiseScale: preset.noiseScale.clone(),
      noiseOctaves: preset.noiseOctaves,
      noiseLacunarity: preset.noiseLacunarity,
      noiseGain: preset.noiseGain,
      ...params,
    });
  }

  return new VolumeMaterial(params);
}

// ============================================================================
// Utility: Create Density Texture
// ============================================================================

/**
 * Creates a 3D density texture from a noise function evaluated on a regular grid.
 * Useful for pre-computing density fields for complex volume shapes.
 *
 * @param resolution - Per-axis resolution of the 3D texture (default 32)
 * @param noiseFn - A function taking (x, y, z) and returning density [0, 1]
 * @param bounds - Optional bounding box to map texture coordinates to world space
 * @returns A THREE.Data3DTexture containing the density field
 */
export function createDensityTexture(
  resolution: number = 32,
  noiseFn?: (x: number, y: number, z: number) => number,
  bounds?: THREE.Box3,
): THREE.Data3DTexture {
  const size = resolution;
  const data = new Float32Array(size * size * size);

  const rng = new SeededRandom(42);

  const boundsMin = bounds?.min ?? new THREE.Vector3(0, 0, 0);
  const boundsSize = new THREE.Vector3();
  if (bounds) {
    bounds.getSize(boundsSize);
  } else {
    boundsSize.set(1, 1, 1);
  }

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = x + y * size + z * size * size;

        // Map grid coordinates to [0, 1]
        const u = x / (size - 1);
        const v = y / (size - 1);
        const w = z / (size - 1);

        if (noiseFn) {
          // Map to world-space coordinates within bounds
          const wx = boundsMin.x + u * boundsSize.x;
          const wy = boundsMin.y + v * boundsSize.y;
          const wz = boundsMin.z + w * boundsSize.z;
          data[idx] = Math.max(0, Math.min(1, noiseFn(wx, wy, wz)));
        } else {
          // Default: simple FBM-like noise
          const n1 = rng.next() * 0.3;
          const n2 = Math.sin(u * 6.28 * 2) * Math.cos(v * 6.28 * 3) * Math.sin(w * 6.28) * 0.3 + 0.5;
          data[idx] = Math.max(0, Math.min(1, n1 + n2 * 0.7));
        }
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RedFormat;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.type = THREE.FloatType;
  texture.needsUpdate = true;

  return texture;
}

// ============================================================================
// VolumetricRenderer Integration Helpers
// ============================================================================

/**
 * Creates a VolumeMaterial that is compatible with the existing
 * VolumetricRenderer's uniform structure. This allows VolumeMaterial
 * instances to be used alongside the existing fog, smoke, and atmosphere
 * materials managed by VolumetricRenderer.
 *
 * @param volumetricType - The type of volumetric effect ('fog' | 'smoke' | 'atmosphere')
 * @param params - Additional volume material parameters
 * @returns A VolumeMaterial configured for VolumetricRenderer integration
 */
export function createVolumeMaterialForRenderer(
  volumetricType: 'fog' | 'smoke' | 'atmosphere',
  params: Partial<VolumeMaterialParams> = {},
): VolumeMaterial {
  // Start with the corresponding preset if available
  const presetMap: Record<string, string> = {
    fog: 'fog',
    smoke: 'smoke',
    atmosphere: 'underwaterFog',
  };

  const presetName = presetMap[volumetricType] ?? 'fog';
  const preset = PRESET_VOLUME_MATERIALS[presetName];

  return new VolumeMaterial({
    density: preset.density,
    emissionColor: preset.emissionColor.clone(),
    emissionStrength: preset.emissionStrength,
    absorptionColor: preset.absorptionColor.clone(),
    absorptionStrength: preset.absorptionStrength,
    scatteringColor: preset.scatteringColor.clone(),
    scatteringAnisotropy: preset.scatteringAnisotropy,
    ...params,
  });
}

/**
 * Creates a VolumeMaterial from the existing FogVolumeSystem's configuration.
 * This bridges FogVolumeConfig to VolumeMaterialParams, enabling a smooth
 * migration path from FogVolumeSystem to VolumeMaterialManager.
 *
 * @param fogConfig - A FogVolumeConfig from the existing FogVolumeSystem
 * @returns A VolumeMaterial approximating the fog volume configuration
 */
export function createVolumeMaterialFromFogConfig(fogConfig: {
  density: number;
  color: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  opacity?: number;
}): VolumeMaterial {
  const fogColor = new THREE.Color(fogConfig.color);
  const emissiveColor = fogConfig.emissive
    ? new THREE.Color(fogConfig.emissive)
    : new THREE.Color(0, 0, 0);

  return new VolumeMaterial({
    density: fogConfig.density * 10, // Scale up: FogVolumeSystem uses low density values
    emissionColor: emissiveColor,
    emissionStrength: fogConfig.emissiveIntensity ?? 0,
    absorptionColor: new THREE.Color(1, 1, 1),
    absorptionStrength: 0.5,
    scatteringColor: fogColor,
    scatteringAnisotropy: 0.2, // Slight forward scattering for fog
  });
}
