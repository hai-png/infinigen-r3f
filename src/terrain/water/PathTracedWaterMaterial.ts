/**
 * PathTracedWaterMaterial — P3.1: Path-Traced Ocean Material
 *
 * Provides MeshPhysicalMaterial configurations for physically-based water
 * rendering under the three-gpu-pathtracer pipeline. In path-trace mode
 * the material relies on transmission, IOR, and attenuation to produce
 * realistic refraction, caustics, and depth-colouring automatically.
 *
 * In rasterize mode a fallback ShaderMaterial is returned that approximates
 * the same look using Fresnel blending and Gerstner wave displacement on
 * the GPU – matching the visual style of the existing OceanSurface shader.
 *
 * Phase 3 — P3.1: Path-Traced Ocean Material
 *
 * @module terrain/water
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for a path-traced water material.
 */
export interface WaterMaterialConfig {
  /** Index of refraction (default 1.33 for water) */
  ior: number;
  /** Base roughness (default 0.05 — nearly mirror-smooth) */
  roughness: number;
  /** Transmission — 1.0 = fully transmissive for path tracing (default 1.0) */
  transmission: number;
  /** Material thickness for refraction ray marching (default 2.0) */
  thickness: number;
  /** Colour absorbed per unit distance through the volume */
  attenuationColor: THREE.Color;
  /** Distance (in world units) at which attenuation reaches ~63 % (default 1.0) */
  attenuationDistance: number;
  /** Optional specular tint for metallic-like coating (default 0xffffff) */
  specularColor: THREE.Color;
  /** Clearcoat intensity (default 1.0) */
  clearcoat: number;
  /** Clearcoat roughness (default 0.05) */
  clearcoatRoughness: number;
  /** Whether the surface is double-sided (default true) */
  doubleSide: boolean;
}

/**
 * Named presets for common water types.
 */
export type WaterMaterialPreset = 'ocean' | 'river' | 'lake' | 'shallow-pool' | 'deep-ocean';

// ============================================================================
// Preset Configurations
// ============================================================================

const PRESETS: Record<WaterMaterialPreset, Partial<WaterMaterialConfig>> = {
  ocean: {
    ior: 1.33,
    roughness: 0.05,
    transmission: 1.0,
    thickness: 4.0,
    attenuationColor: new THREE.Color(0x001830),
    attenuationDistance: 2.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  },
  'deep-ocean': {
    ior: 1.33,
    roughness: 0.04,
    transmission: 1.0,
    thickness: 8.0,
    attenuationColor: new THREE.Color(0x000c1e),
    attenuationDistance: 1.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
  },
  river: {
    ior: 1.33,
    roughness: 0.08,
    transmission: 1.0,
    thickness: 1.5,
    attenuationColor: new THREE.Color(0x0a3d2a),
    attenuationDistance: 1.8,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  },
  lake: {
    ior: 1.33,
    roughness: 0.06,
    transmission: 1.0,
    thickness: 3.0,
    attenuationColor: new THREE.Color(0x0a2f4c),
    attenuationDistance: 2.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.07,
  },
  'shallow-pool': {
    ior: 1.33,
    roughness: 0.1,
    transmission: 1.0,
    thickness: 0.5,
    attenuationColor: new THREE.Color(0x20aa70),
    attenuationDistance: 3.0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.15,
  },
};

// ============================================================================
// Lazy path-tracer import
// ============================================================================

let pathTracerAvailable: boolean | null = null;

/**
 * Check whether three-gpu-pathtracer is available.
 * Result is cached after the first check.
 */
async function isPathTracerAvailable(): Promise<boolean> {
  if (pathTracerAvailable !== null) return pathTracerAvailable;
  try {
    await import('three-gpu-pathtracer');
    pathTracerAvailable = true;
  } catch (err) {
    // Expected fallback in rendering pipeline
    if (process.env.NODE_ENV === 'development') console.debug('[PathTracedWaterMaterial] three-gpu-pathtracer import fallback:', err);
    pathTracerAvailable = false;
  }
  return pathTracerAvailable;
}

// ============================================================================
// Path-Traced Material Factory
// ============================================================================

/**
 * Create a MeshPhysicalMaterial suitable for path-traced rendering.
 *
 * When three-gpu-pathtracer is present the material uses:
 * - `transmission = 1.0` for full refraction
 * - `ior = 1.33` (water)
 * - `attenuationColor` / `attenuationDistance` for volumetric depth tint
 *
 * If the path tracer is unavailable the function still returns a valid
 * MeshPhysicalMaterial that renders reasonably in rasterized mode.
 *
 * @param preset Named preset or explicit config overrides
 * @param overrides Additional config overrides applied on top of the preset
 */
export function createWaterMaterial(
  preset: WaterMaterialPreset = 'ocean',
  overrides?: Partial<WaterMaterialConfig>,
): THREE.MeshPhysicalMaterial {
  const presetValues = PRESETS[preset] ?? PRESETS.ocean;
  const merged: WaterMaterialConfig = {
    ior: 1.33,
    roughness: 0.05,
    transmission: 1.0,
    thickness: 2.0,
    attenuationColor: new THREE.Color(0x001830),
    attenuationDistance: 1.0,
    specularColor: new THREE.Color(0xffffff),
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    doubleSide: true,
    ...presetValues,
    ...overrides,
  };

  const material = new THREE.MeshPhysicalMaterial({
    // Base PBR
    color: new THREE.Color(0xffffff),
    roughness: merged.roughness,
    metalness: 0.0,

    // Transmission (path-trace key)
    transmission: merged.transmission,
    thickness: merged.thickness,
    ior: merged.ior,

    // Volumetric attenuation
    attenuationColor: merged.attenuationColor,
    attenuationDistance: merged.attenuationDistance,

    // Specular
    specularColor: merged.specularColor,
    specularIntensity: 1.0,

    // Clearcoat (wet surface sheen)
    clearcoat: merged.clearcoat,
    clearcoatRoughness: merged.clearcoatRoughness,

    // Rendering hints
    transparent: true,
    opacity: 0.95,
    side: merged.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: false,
    envMapIntensity: 1.5,
  });

  return material;
}

// ============================================================================
// Rasterize Fallback Shader Material
// ============================================================================

/**
 * Create a rasterize-mode ShaderMaterial that approximates the look of
 * path-traced water using:
 * - Fresnel-based reflection/refraction blending (Schlick)
 * - Gerstner wave vertex displacement
 * - Depth-based colour tinting
 * - Simple foam at wave crests
 *
 * This is intended as the rasterize-path fallback when the path tracer
 * is unavailable or the user explicitly prefers rasterized rendering.
 *
 * @param preset Named water preset
 * @param waveCount Number of Gerstner wave components (default 6)
 */
export function createRasterizeWaterMaterial(
  preset: WaterMaterialPreset = 'ocean',
  waveCount: number = 6,
): THREE.ShaderMaterial {
  const presetValues = PRESETS[preset] ?? PRESETS.ocean;
  const deepColor = presetValues.attenuationColor ?? new THREE.Color(0x001830);
  const shallowColor = new THREE.Color(0x40c0b0);
  const foamColor = new THREE.Color(0xffffff);
  const ior = presetValues.ior ?? 1.33;

  // Generate Gerstner wave parameters
  const maxWaves = 8;
  const count = Math.min(waveCount, maxWaves);
  const uAmplitudes = new Float32Array(maxWaves);
  const uWavelengths = new Float32Array(maxWaves);
  const uSpeeds = new Float32Array(maxWaves);
  const uDirections = new Float32Array(maxWaves * 2);
  const uSteepnesses = new Float32Array(maxWaves);

  const baseWavelength = 30;
  const baseAmplitude = 2.0;
  const windAngle = 0;

  for (let i = 0; i < maxWaves; i++) {
    if (i < count) {
      const freqMul = Math.pow(2, i);
      const wl = baseWavelength / freqMul;
      const amp = baseAmplitude / freqMul;
      const spd = Math.sqrt((9.81 * wl) / (2 * Math.PI));
      const angleOffset = (i - count / 2) * 0.15 + windAngle;

      uAmplitudes[i] = amp;
      uWavelengths[i] = wl;
      uSpeeds[i] = spd;
      uDirections[i * 2] = Math.cos(angleOffset);
      uDirections[i * 2 + 1] = Math.sin(angleOffset);
      uSteepnesses[i] = Math.min(1.0, (i + 1) * 0.15);
    }
  }

  const uniforms = {
    uTime: { value: 0 },
    uWaveCount: { value: count },
    uAmplitudes: { value: uAmplitudes },
    uWavelengths: { value: uWavelengths },
    uSpeeds: { value: uSpeeds },
    uDirections: { value: uDirections },
    uSteepnesses: { value: uSteepnesses },
    uDeepColor: { value: deepColor },
    uShallowColor: { value: shallowColor },
    uFoamColor: { value: foamColor },
    uIor: { value: ior },
    uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
    uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
    uCameraPosition: { value: new THREE.Vector3() },
  };

  // ---- Vertex Shader ----
  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform int uWaveCount;
    uniform float uAmplitudes[8];
    uniform float uWavelengths[8];
    uniform float uSpeeds[8];
    uniform float uDirections[16];
    uniform float uSteepnesses[8];

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vWaveHeight;
    varying float vFoam;

    vec3 gerstnerWave(int idx, vec3 pos, float time, out vec3 tangent, out vec3 binormal) {
      float A = uAmplitudes[idx];
      float L = uWavelengths[idx];
      float S = uSpeeds[idx];
      float Dx = uDirections[idx * 2];
      float Dz = uDirections[idx * 2 + 1];
      float Q = uSteepnesses[idx];

      float k = 2.0 * 3.14159265 / L;
      float w = k * S;
      float f = w * time - k * (Dx * pos.x + Dz * pos.z);

      float sinF = sin(f);
      float cosF = cos(f);

      vec3 displacement;
      displacement.x = Q * A * Dx * cosF;
      displacement.z = Q * A * Dz * cosF;
      displacement.y = A * sinF;

      float WAk = w * A / k;
      tangent = vec3(
        1.0 - Q * Dx * Dx * WAk * sinF,
        Dx * WAk * cosF,
        -Q * Dx * Dz * WAk * sinF
      );
      binormal = vec3(
        -Q * Dx * Dz * WAk * sinF,
        Dz * WAk * cosF,
        1.0 - Q * Dz * Dz * WAk * sinF
      );

      return displacement;
    }

    void main() {
      vec3 pos = position;
      vec3 totalDisplacement = vec3(0.0);
      vec3 totalTangent = vec3(1.0, 0.0, 0.0);
      vec3 totalBinormal = vec3(0.0, 0.0, 1.0);

      for (int i = 0; i < 8; i++) {
        if (i >= uWaveCount) break;
        vec3 tangent;
        vec3 binormal;
        vec3 displacement = gerstnerWave(i, pos, uTime, tangent, binormal);
        totalDisplacement += displacement;
        totalTangent += tangent;
        totalBinormal += binormal;
      }

      vec3 displaced = pos + totalDisplacement;
      vNormal = normalize(cross(totalBinormal, totalTangent));
      vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
      vWaveHeight = totalDisplacement.y;

      float normalizedHeight = totalDisplacement.y / max(2.0, 0.001);
      vFoam = smoothstep(0.8, 1.0, normalizedHeight);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `;

  // ---- Fragment Shader ----
  const fragmentShader = /* glsl */ `
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform vec3 uFoamColor;
    uniform float uIor;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uCameraPosition;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vWaveHeight;
    varying float vFoam;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(uCameraPosition - vWorldPosition);

      // Depth colour
      float depthFactor = 1.0 - exp(-max(vWaveHeight + 2.0, 0.0) * 0.3);
      depthFactor = clamp(depthFactor, 0.0, 1.0);
      vec3 waterColor = mix(uShallowColor, uDeepColor, depthFactor);

      // Fresnel (Schlick)
      float R0 = pow((1.0 - uIor) / (1.0 + uIor), 2.0);
      float cosTheta = max(dot(viewDir, normal), 0.0);
      float fresnel = R0 + (1.0 - R0) * pow(1.0 - cosTheta, 5.0);

      vec3 skyColor = vec3(0.5, 0.7, 0.9);
      waterColor = mix(waterColor, skyColor, fresnel * 0.6);

      // Specular
      vec3 halfDir = normalize(uSunDirection + viewDir);
      float specAngle = max(dot(normal, halfDir), 0.0);
      float specBroad = pow(specAngle, 64.0) * 0.4;
      float specSharp = pow(specAngle, 512.0) * 1.5;
      vec3 specular = uSunColor * (specBroad + specSharp);

      // Subsurface scattering approximation
      float sssDot = max(dot(viewDir, -uSunDirection), 0.0);
      float sss = pow(sssDot, 4.0) * 0.25;
      vec3 sssColor = vec3(0.0, 0.6, 0.4) * sss * (1.0 - depthFactor);

      vec3 finalColor = waterColor + specular + sssColor;
      finalColor = mix(finalColor, uFoamColor, vFoam);

      float alpha = mix(0.7, 0.95, 1.0 - fresnel);
      alpha = mix(alpha, 1.0, vFoam);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

// ============================================================================
// Dual-Mode Material Helper
// ============================================================================

/**
 * Asynchronously create the best water material for the current render mode.
 *
 * If three-gpu-pathtracer is available this returns a MeshPhysicalMaterial
 * configured for path tracing (transmission, IOR, attenuation).
 * Otherwise it returns a ShaderMaterial fallback with Fresnel + Gerstner.
 *
 * @param preset Named water preset
 * @param overrides Optional config overrides
 */
export async function createBestWaterMaterial(
  preset: WaterMaterialPreset = 'ocean',
  overrides?: Partial<WaterMaterialConfig>,
): Promise<THREE.MeshPhysicalMaterial | THREE.ShaderMaterial> {
  const available = await isPathTracerAvailable();
  if (available) {
    return createWaterMaterial(preset, overrides);
  }
  return createRasterizeWaterMaterial(preset);
}

// ============================================================================
// Preset Lookup
// ============================================================================

/**
 * Return the full config for a named preset, merged with optional overrides.
 */
export function getPresetConfig(
  preset: WaterMaterialPreset,
  overrides?: Partial<WaterMaterialConfig>,
): WaterMaterialConfig {
  const presetValues = PRESETS[preset] ?? PRESETS.ocean;
  return {
    ior: 1.33,
    roughness: 0.05,
    transmission: 1.0,
    thickness: 2.0,
    attenuationColor: new THREE.Color(0x001830),
    attenuationDistance: 1.0,
    specularColor: new THREE.Color(0xffffff),
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    doubleSide: true,
    ...presetValues,
    ...overrides,
  };
}

/**
 * List all available preset names.
 */
export function listPresets(): WaterMaterialPreset[] {
  return Object.keys(PRESETS) as WaterMaterialPreset[];
}
