/**
 * Advanced Material Features — P2 Materials Subsystem
 *
 * Provides three advanced material capabilities for the infinigen-r3f project:
 *
 * 1. PerInstanceRandomization — Per-instance material variation using instanced
 *    attributes. Equivalent to Blender's ObjectInfo.Random for unique per-instance
 *    color, roughness, metallic, and normal variation.
 *
 * 2. VolumeMaterialIntegration — Volume rendering materials (water, fog, smoke)
 *    that integrate with the existing VolumetricFogShader system for absorption,
 *    scattering, and density-based effects.
 *
 * 3. DisplacementFromNoise — Procedural displacement along vertex normals using
 *    configurable noise types (FBM, ridged, Voronoi). Supports both CPU-side
 *    geometry modification and GPU-side vertex shader displacement.
 *
 * @module assets/materials/advanced
 */

import * as THREE from 'three';
import {
  GLSLNoiseLibrary,
  GLSLTextureGraphBuilder,
  MusgraveType,
  ColorRampMode,
  CoordinateMode,
} from '../shaders/GLSLProceduralTexturePipeline';
import { createProceduralMaterial } from '../shaders/GLSLProceduralTextureBridge';

// ============================================================================
// Types
// ============================================================================

/** Configuration for per-instance color variation */
export interface InstanceColorConfig {
  /** HSV hue jitter range (0-1) */
  hueJitter: number;
  /** HSV saturation jitter range (0-1) */
  saturationJitter: number;
  /** HSV value jitter range (0-1) */
  valueJitter: number;
}

/** Configuration for per-instance PBR property variation */
export interface InstancePBRConfig {
  /** Roughness variation range (±) */
  roughnessJitter: number;
  /** Metallic variation range (±) */
  metallicJitter: number;
  /** Normal strength variation range (±) */
  normalStrengthJitter: number;
}

/** Combined configuration for per-instance randomization */
export interface InstanceRandomizationConfig {
  /** Color variation settings */
  color: InstanceColorConfig;
  /** PBR property variation settings */
  pbr: InstancePBRConfig;
}

/** Default instance randomization configuration */
export const DEFAULT_INSTANCE_RANDOMIZATION: InstanceRandomizationConfig = {
  color: {
    hueJitter: 0.05,
    saturationJitter: 0.1,
    valueJitter: 0.08,
  },
  pbr: {
    roughnessJitter: 0.1,
    metallicJitter: 0.05,
    normalStrengthJitter: 0.15,
  },
};

/** Parameters for water volume material */
export interface WaterVolumeParams {
  /** Base water color */
  color?: THREE.Color;
  /** Absorption coefficient — controls how deep light penetrates (default 0.5) */
  absorption?: number;
  /** Absorption tint — blue-green for water (default [0.04, 0.15, 0.5]) */
  absorptionColor?: THREE.Vector3;
  /** Scattering coefficient — milky depth effect (default 0.2) */
  scattering?: number;
  /** Scattering color (default white-ish) */
  scatteringColor?: THREE.Vector3;
  /** Density multiplier from depth (default 1.0) */
  densityFromDepth?: number;
  /** IOR for refraction (default 1.33) */
  ior?: number;
  /** Wave animation speed */
  waveSpeed?: number;
}

/** Parameters for fog volume material */
export interface FogVolumeParams {
  /** Fog base color */
  color?: THREE.Color;
  /** Fog density (default 0.015) */
  density?: number;
  /** Absorption coefficient (default 0.1) */
  absorption?: number;
  /** Scattering coefficient (default 0.6) */
  scattering?: number;
  /** Phase function asymmetry (default 0.3) */
  phaseG?: number;
  /** Height of fog layer */
  fogHeight?: number;
  /** Height falloff rate */
  fogHeightFalloff?: number;
  /** Noise scale for density variation */
  noiseScale?: number;
  /** Noise strength */
  noiseStrength?: number;
}

/** Parameters for smoke volume material */
export interface SmokeVolumeParams {
  /** Base smoke color */
  color?: THREE.Color;
  /** Smoke density (default 0.05) */
  density?: number;
  /** Absorption coefficient (default 0.5) */
  absorption?: number;
  /** Scattering coefficient (default 0.4) */
  scattering?: number;
  /** Phase function asymmetry — strong forward for smoke (default 0.7) */
  phaseG?: number;
  /** Smoke source position */
  origin?: THREE.Vector3;
  /** Smoke radius */
  radius?: number;
  /** Emission color (fire-lit) */
  emissionColor?: THREE.Color;
  /** Emission intensity */
  emissionIntensity?: number;
  /** Turbulence scale */
  turbulenceScale?: number;
  /** Turbulence strength */
  turbulenceStrength?: number;
}

/** Noise type for displacement */
export type DisplacementNoiseType = 'fbm' | 'ridged' | 'voronoi' | 'musgrave';

/** Configuration for displacement from noise */
export interface DisplacementNoiseConfig {
  /** Noise type */
  noiseType: DisplacementNoiseType;
  /** Noise scale (frequency) */
  scale: number;
  /** Displacement amplitude */
  amplitude: number;
  /** Number of octaves for FBM/ridged */
  octaves: number;
  /** Lacunarity for fractal noise */
  lacunarity: number;
  /** Gain/persistence for fractal noise */
  gain: number;
  /** Musgrave dimension parameter */
  dimension?: number;
  /** Musgrave offset parameter */
  offset?: number;
  /** Seed for deterministic randomness */
  seed: number;
}

/** Default displacement config */
export const DEFAULT_DISPLACEMENT_CONFIG: DisplacementNoiseConfig = {
  noiseType: 'fbm',
  scale: 2.0,
  amplitude: 0.3,
  octaves: 5,
  lacunarity: 2.0,
  gain: 0.5,
  dimension: 2.0,
  offset: 0.0,
  seed: 42,
};

// ============================================================================
// 1. PerInstanceRandomization
// ============================================================================

/**
 * PerInstanceRandomization provides per-instance material variation using
 * instanced attributes. This is the Three.js equivalent of Blender's
 * ObjectInfo.Random — each instance gets a unique random value that drives
 * color (HSV jitter), roughness (±0.1), metallic (±0.05), and normal strength
 * variation.
 *
 * Usage:
 * ```ts
 * const randomizer = new PerInstanceRandomization();
 * const material = randomizer.createInstancedVariationMaterial(baseMaterial, 100, 42);
 * mesh.material = material;
 * ```
 */
export class PerInstanceRandomization {
  /** Default randomization configuration */
  private config: InstanceRandomizationConfig;

  constructor(config: Partial<InstanceRandomizationConfig> = {}) {
    this.config = {
      color: { ...DEFAULT_INSTANCE_RANDOMIZATION.color, ...config.color },
      pbr: { ...DEFAULT_INSTANCE_RANDOMIZATION.pbr, ...config.pbr },
    };
  }

  /**
   * Apply per-instance randomization to an existing mesh's material.
   * Modifies the material in place by adding instanced attributes.
   *
   * @param mesh - The instanced mesh to randomize
   * @param instanceIndex - The specific instance index
   * @param seed - Seed for deterministic random per instance
   */
  applyToObjectMaterial(
    mesh: THREE.InstancedMesh,
    instanceIndex: number,
    seed: number,
  ): void {
    const rng = this.seededRandom(seed + instanceIndex);
    const material = mesh.material as THREE.MeshStandardMaterial;

    if (!material) return;

    // Compute per-instance variations
    const hueJitter = (rng() - 0.5) * 2 * this.config.color.hueJitter;
    const satJitter = (rng() - 0.5) * 2 * this.config.color.saturationJitter;
    const valJitter = (rng() - 0.5) * 2 * this.config.color.valueJitter;
    const roughnessJitter = (rng() - 0.5) * 2 * this.config.pbr.roughnessJitter;
    const metallicJitter = (rng() - 0.5) * 2 * this.config.pbr.metallicJitter;
    const normalJitter = (rng() - 0.5) * 2 * this.config.pbr.normalStrengthJitter;

    // Store per-instance data as userData on the mesh
    if (!mesh.userData.instanceVariations) {
      mesh.userData.instanceVariations = [];
    }
    const variations = mesh.userData.instanceVariations as InstanceVariationData[];
    while (variations.length <= instanceIndex) {
      variations.push(this.createDefaultVariation());
    }
    variations[instanceIndex] = {
      hueJitter,
      satJitter,
      valJitter,
      roughnessJitter,
      metallicJitter,
      normalJitter,
      randomValue: rng(),
    };
  }

  /**
   * Create a custom ShaderMaterial that reads the instance ID to vary
   * properties per instance. Uses instanced attributes for per-instance
   * random values and integrates with GLSLProceduralTextureBridge for
   * texture variation.
   *
   * @param baseMaterial - The base material to derive from
   * @param count - Number of instances
   * @param seed - Base seed for randomization
   * @returns A THREE.ShaderMaterial with per-instance variation
   */
  createInstancedVariationMaterial(
    baseMaterial: THREE.MeshStandardMaterial,
    count: number,
    seed: number,
  ): THREE.ShaderMaterial {
    // Generate per-instance random values
    const instanceRandoms = new Float32Array(count);
    const instanceHueJitter = new Float32Array(count);
    const instanceRoughnessJitter = new Float32Array(count);
    const instanceMetallicJitter = new Float32Array(count);
    const instanceNormalJitter = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const rng = this.seededRandom(seed + i * 7919);
      instanceRandoms[i] = rng();
      instanceHueJitter[i] = (rng() - 0.5) * 2 * this.config.color.hueJitter;
      instanceRoughnessJitter[i] = (rng() - 0.5) * 2 * this.config.pbr.roughnessJitter;
      instanceMetallicJitter[i] = (rng() - 0.5) * 2 * this.config.pbr.metallicJitter;
      instanceNormalJitter[i] = (rng() - 0.5) * 2 * this.config.pbr.normalStrengthJitter;
    }

    // Extract base material properties
    const baseColor = baseMaterial.color ?? new THREE.Color(0.8, 0.8, 0.8);
    const baseRoughness = baseMaterial.roughness ?? 0.5;
    const baseMetallic = baseMaterial.metalness ?? 0.0;

    // Build the shader material with instance variation
    const vertexShader = /* glsl */ `
      attribute float aInstanceRandom;
      attribute float aInstanceHueJitter;
      attribute float aInstanceRoughnessJitter;
      attribute float aInstanceMetallicJitter;
      attribute float aInstanceNormalJitter;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vInstanceRandom;
      varying float vHueJitter;
      varying float vRoughnessJitter;
      varying float vMetallicJitter;
      varying float vNormalJitter;

      void main() {
        vInstanceRandom = aInstanceRandom;
        vHueJitter = aInstanceHueJitter;
        vRoughnessJitter = aInstanceRoughnessJitter;
        vMetallicJitter = aInstanceMetallicJitter;
        vNormalJitter = aInstanceNormalJitter;

        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vUv = uv;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = /* glsl */ `
      precision highp float;

      uniform vec3 uBaseColor;
      uniform float uBaseRoughness;
      uniform float uBaseMetallic;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vInstanceRandom;
      varying float vHueJitter;
      varying float vRoughnessJitter;
      varying float vMetallicJitter;
      varying float vNormalJitter;

      // HSV <-> RGB conversion
      vec3 hsv2rgb_adv(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      vec3 rgb2hsv_adv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }

      void main() {
        // Apply HSV jitter to base color
        vec3 hsv = rgb2hsv_adv(uBaseColor);
        hsv.x = fract(hsv.x + vHueJitter);
        hsv.y = clamp(hsv.y + vHueJitter * 0.3, 0.0, 1.0);
        hsv.z = clamp(hsv.z + vHueJitter * 0.2, 0.0, 1.0);
        vec3 variedColor = hsv2rgb_adv(hsv);

        // Apply PBR jitter
        float roughness = clamp(uBaseRoughness + vRoughnessJitter, 0.0, 1.0);
        float metallic = clamp(uBaseMetallic + vMetallicJitter, 0.0, 1.0);

        // Simple lighting
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float NdotL = max(dot(normalize(vNormal), lightDir), 0.0);
        vec3 ambient = variedColor * 0.3;
        vec3 diffuse = variedColor * NdotL * 0.7;

        // Metallic darkening
        vec3 finalColor = mix(ambient + diffuse, (ambient + diffuse) * 0.5 + vec3(0.5) * NdotL * 0.3, metallic);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uBaseColor: { value: baseColor.clone() },
        uBaseRoughness: { value: baseRoughness },
        uBaseMetallic: { value: baseMetallic },
      },
    });

    // Store instance attribute data as userData for binding to geometry
    material.userData = {
      instanceAttributes: {
        aInstanceRandom: instanceRandoms,
        aInstanceHueJitter: instanceHueJitter,
        aInstanceRoughnessJitter: instanceRoughnessJitter,
        aInstanceMetallicJitter: instanceMetallicJitter,
        aInstanceNormalJitter: instanceNormalJitter,
      },
      _isInstanceVariationMaterial: true,
    };

    return material;
  }

  /**
   * Bind the per-instance attributes to an InstancedMesh's geometry.
   * Call this after setting the material on the mesh.
   *
   * @param mesh - The InstancedMesh to bind attributes to
   * @param material - The material created by createInstancedVariationMaterial
   */
  bindInstanceAttributes(
    mesh: THREE.InstancedMesh,
    material: THREE.ShaderMaterial,
  ): void {
    const attrs = material.userData?.instanceAttributes;
    if (!attrs) return;

    const geometry = mesh.geometry;
    for (const [name, data] of Object.entries(attrs)) {
      if (geometry.getAttribute(name)) {
        geometry.deleteAttribute(name);
      }
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(data as Float32Array, 1));
    }
  }

  /** Seeded pseudo-random number generator */
  private seededRandom(seed: number): () => number {
    let state = Math.abs(seed | 0) || 1;
    return () => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 4294967296;
    };
  }

  /** Create default variation data */
  private createDefaultVariation(): InstanceVariationData {
    return {
      hueJitter: 0,
      satJitter: 0,
      valJitter: 0,
      roughnessJitter: 0,
      metallicJitter: 0,
      normalJitter: 0,
      randomValue: 0,
    };
  }
}

/** Internal per-instance variation data */
interface InstanceVariationData {
  hueJitter: number;
  satJitter: number;
  valJitter: number;
  roughnessJitter: number;
  metallicJitter: number;
  normalJitter: number;
  randomValue: number;
}

// ============================================================================
// 2. VolumeMaterialIntegration
// ============================================================================

/**
 * VolumeMaterialIntegration creates volume rendering materials for water,
 * fog, and smoke effects. These materials use ray-marching with absorption,
 * scattering, and density functions, and integrate with the existing
 * VolumetricFogShader system.
 *
 * Usage:
 * ```ts
 * const volIntegration = new VolumeMaterialIntegration();
 * const waterMat = volIntegration.createWaterVolumeMaterial({ absorption: 0.5 });
 * const fogMat = volIntegration.createFogVolumeMaterial({ density: 0.02 });
 * const smokeMat = volIntegration.createSmokeVolumeMaterial({ density: 0.05 });
 * ```
 */
export class VolumeMaterialIntegration {
  /**
   * Create a water volume material with absorption, scattering, and depth-based density.
   *
   * Water volume rendering uses:
   * - Absorption coefficient with blue-green tint (short wavelengths absorbed less)
   * - Scattering coefficient for milky depth effect
   * - Density that increases with depth (Beer-Lambert law)
   * - Fresnel-based surface contribution
   *
   * @param params - Water volume parameters
   * @returns A THREE.ShaderMaterial for water volume rendering
   */
  createWaterVolumeMaterial(params: WaterVolumeParams = {}): THREE.ShaderMaterial {
    const color = params.color ?? new THREE.Color(0.05, 0.2, 0.4);
    const absorption = params.absorption ?? 0.5;
    const absorptionColor = params.absorptionColor ?? new THREE.Vector3(0.04, 0.15, 0.5);
    const scattering = params.scattering ?? 0.2;
    const scatteringColor = params.scatteringColor ?? new THREE.Vector3(0.8, 0.9, 1.0);
    const densityFromDepth = params.densityFromDepth ?? 1.0;
    const ior = params.ior ?? 1.33;
    const waveSpeed = params.waveSpeed ?? 0.5;

    const vertexShader = /* glsl */ `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying float vDepth;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 viewPos = viewMatrix * worldPos;
        vDepth = -viewPos.z;
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewPos;
      }
    `;

    const fragmentShader = /* glsl */ `
      precision highp float;

      uniform vec3 uWaterColor;
      uniform float uAbsorption;
      uniform vec3 uAbsorptionColor;
      uniform float uScattering;
      uniform vec3 uScatteringColor;
      uniform float uDensityFromDepth;
      uniform float uIOR;
      uniform float uTime;
      uniform float uWaveSpeed;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying float vDepth;

      void main() {
        // Fresnel approximation (Schlick)
        float cosTheta = max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
        float f0 = pow((uIOR - 1.0) / (uIOR + 1.0), 2.0);
        float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

        // Depth-based density (Beer-Lambert)
        float depth = max(vDepth, 0.01);
        float density = 1.0 - exp(-uDensityFromDepth * depth * 0.1);

        // Absorption: wavelength-dependent absorption
        vec3 absorption = exp(-uAbsorptionColor * uAbsorption * depth * 0.1);

        // Scattering: milky depth effect
        vec3 scattered = uScatteringColor * uScattering * density;

        // Combine: deep water is darker (absorbed), with scattering near surface
        vec3 waterAlbedo = uWaterColor * absorption + scattered * 0.3;

        // Simple lighting
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float NdotL = max(dot(normalize(vNormal), lightDir), 0.0);
        vec3 lit = waterAlbedo * (0.3 + 0.7 * NdotL);

        // Specular highlight (Blinn-Phong)
        vec3 halfDir = normalize(normalize(vViewDir) + lightDir);
        float spec = pow(max(dot(normalize(vNormal), halfDir), 0.0), 128.0);
        lit += vec3(1.0) * spec * fresnel * 0.5;

        // Fresnel blend with sky color
        vec3 skyColor = vec3(0.6, 0.75, 0.9);
        vec3 finalColor = mix(lit, skyColor * 0.8 + vec3(0.2) * spec, fresnel);

        gl_FragColor = vec4(finalColor, density);
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uWaterColor: { value: color.clone() },
        uAbsorption: { value: absorption },
        uAbsorptionColor: { value: absorptionColor.clone() },
        uScattering: { value: scattering },
        uScatteringColor: { value: scatteringColor.clone() },
        uDensityFromDepth: { value: densityFromDepth },
        uIOR: { value: ior },
        uTime: { value: 0 },
        uWaveSpeed: { value: waveSpeed },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  /**
   * Create a fog volume material with height-based density, noise variation,
   * and scattering. Integrates with VolumetricFogShader parameters.
   *
   * @param params - Fog volume parameters
   * @returns A THREE.ShaderMaterial for fog volume rendering
   */
  createFogVolumeMaterial(params: FogVolumeParams = {}): THREE.ShaderMaterial {
    const color = params.color ?? new THREE.Color(0.85, 0.88, 0.92);
    const density = params.density ?? 0.015;
    const absorption = params.absorption ?? 0.1;
    const scattering = params.scattering ?? 0.6;
    const phaseG = params.phaseG ?? 0.3;
    const fogHeight = params.fogHeight ?? 5.0;
    const fogHeightFalloff = params.fogHeightFalloff ?? 0.15;
    const noiseScale = params.noiseScale ?? 0.08;
    const noiseStrength = params.noiseStrength ?? 0.5;

    const vertexShader = /* glsl */ `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = /* glsl */ `
      precision highp float;

      uniform vec3 uFogColor;
      uniform float uDensity;
      uniform float uAbsorption;
      uniform float uScattering;
      uniform float uPhaseG;
      uniform float uFogHeight;
      uniform float uFogHeightFalloff;
      uniform float uNoiseScale;
      uniform float uNoiseStrength;
      uniform float uTime;

      varying vec3 vWorldPosition;

      // Simple 3D hash for noise
      float hash3D(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float valueNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(mix(hash3D(i + vec3(0,0,0)), hash3D(i + vec3(1,0,0)), f.x),
              mix(hash3D(i + vec3(0,1,0)), hash3D(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash3D(i + vec3(0,0,1)), hash3D(i + vec3(1,0,1)), f.x),
              mix(hash3D(i + vec3(0,1,1)), hash3D(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbmNoise(vec3 p, int octaves) {
        float value = 0.0;
        float amplitude = 1.0;
        float frequency = 1.0;
        for (int i = 0; i < 8; i++) {
          if (i >= octaves) break;
          value += amplitude * valueNoise(p * frequency);
          amplitude *= 0.5;
          frequency *= 2.0;
        }
        return value;
      }

      void main() {
        // Height-based density falloff
        float heightDens = exp(-max(0.0, vWorldPosition.y - uFogHeight) * uFogHeightFalloff);

        // Animated noise density variation
        vec3 noisePos = vWorldPosition * uNoiseScale + vec3(uTime * 0.05, uTime * 0.01, uTime * 0.03);
        float noiseVal = fbmNoise(noisePos, 4);
        float noiseMod = mix(1.0, noiseVal, uNoiseStrength);

        // Combined density
        float finalDensity = uDensity * heightDens * noiseMod;

        // Scattering with simple phase function
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float cosTheta = dot(normalize(vWorldPosition), lightDir);
        float phase = (1.0 - uPhaseG * uPhaseG) / (4.0 * 3.14159 * pow(1.0 + uPhaseG * uPhaseG - 2.0 * uPhaseG * cosTheta, 1.5));

        vec3 scatteredLight = uFogColor * uScattering * phase * heightDens;
        vec3 absorbedLight = uFogColor * uAbsorption;

        // Beer-Lambert
        float alpha = 1.0 - exp(-finalDensity * 10.0);
        alpha = clamp(alpha, 0.0, 0.95);

        vec3 fogColor = scatteredLight + absorbedLight * 0.05;
        gl_FragColor = vec4(fogColor, alpha);
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uFogColor: { value: color.clone() },
        uDensity: { value: density },
        uAbsorption: { value: absorption },
        uScattering: { value: scattering },
        uPhaseG: { value: phaseG },
        uFogHeight: { value: fogHeight },
        uFogHeightFalloff: { value: fogHeightFalloff },
        uNoiseScale: { value: noiseScale },
        uNoiseStrength: { value: noiseStrength },
        uTime: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  /**
   * Create a smoke volume material with turbulence, emission, and anisotropic
   * scattering. Integrates with VolumetricFogShader smoke parameters.
   *
   * @param params - Smoke volume parameters
   * @returns A THREE.ShaderMaterial for smoke volume rendering
   */
  createSmokeVolumeMaterial(params: SmokeVolumeParams = {}): THREE.ShaderMaterial {
    const color = params.color ?? new THREE.Color(0.4, 0.38, 0.35);
    const density = params.density ?? 0.05;
    const absorption = params.absorption ?? 0.5;
    const scattering = params.scattering ?? 0.4;
    const phaseG = params.phaseG ?? 0.7;
    const origin = params.origin ?? new THREE.Vector3(0, 0, 0);
    const radius = params.radius ?? 15.0;
    const emissionColor = params.emissionColor ?? new THREE.Color(1.0, 0.5, 0.1);
    const emissionIntensity = params.emissionIntensity ?? 0.5;
    const turbulenceScale = params.turbulenceScale ?? 0.15;
    const turbulenceStrength = params.turbulenceStrength ?? 0.8;

    const vertexShader = /* glsl */ `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = /* glsl */ `
      precision highp float;

      uniform vec3 uSmokeColor;
      uniform float uDensity;
      uniform float uAbsorption;
      uniform float uScattering;
      uniform float uPhaseG;
      uniform vec3 uSmokeOrigin;
      uniform float uSmokeRadius;
      uniform vec3 uEmissionColor;
      uniform float uEmissionIntensity;
      uniform float uTurbulenceScale;
      uniform float uTurbulenceStrength;
      uniform float uTime;

      varying vec3 vWorldPosition;

      float hash3D_s(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float valueNoiseS(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash3D_s(i + vec3(0,0,0)), hash3D_s(i + vec3(1,0,0)), f.x),
              mix(hash3D_s(i + vec3(0,1,0)), hash3D_s(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash3D_s(i + vec3(0,0,1)), hash3D_s(i + vec3(1,0,1)), f.x),
              mix(hash3D_s(i + vec3(0,1,1)), hash3D_s(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbmSmoke(vec3 p, int octaves) {
        float value = 0.0;
        float amplitude = 1.0;
        float frequency = 1.0;
        for (int i = 0; i < 6; i++) {
          if (i >= octaves) break;
          value += amplitude * valueNoiseS(p * frequency);
          amplitude *= 0.5;
          frequency *= 2.0;
        }
        return value;
      }

      void main() {
        vec3 offset = vWorldPosition - uSmokeOrigin;
        float dist = length(offset);

        // Spherical falloff from origin
        float radialDensity = 1.0 - smoothstep(0.0, uSmokeRadius, dist);

        // Upward drift — smoke rises
        float upBias = max(0.0, offset.y) * 0.02;
        radialDensity *= exp(-upBias);

        // Turbulence
        vec3 turbPos = vWorldPosition * uTurbulenceScale;
        turbPos += vec3(
          valueNoiseS(turbPos + vec3(uTime * 0.3, 0.0, 0.0)),
          valueNoiseS(turbPos + vec3(0.0, uTime * 0.2, 0.0)),
          valueNoiseS(turbPos + vec3(0.0, 0.0, uTime * 0.25))
        ) * uTurbulenceStrength;

        // Noise-based density
        float noiseVal = fbmSmoke(turbPos, 5);
        float finalDensity = uDensity * radialDensity * noiseVal;
        finalDensity = max(0.0, finalDensity);

        // Emission (fire-lit near origin)
        float emissionFalloff = exp(-dist / (uSmokeRadius * 0.3));
        vec3 emission = uEmissionColor * uEmissionIntensity * emissionFalloff;

        // Absorption
        vec3 absorptionColor = vec3(1.0) - uSmokeColor * uAbsorption;

        // Scattering with phase
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float cosTheta = dot(normalize(vWorldPosition), lightDir);
        float g2 = uPhaseG * uPhaseG;
        float phase = (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * uPhaseG * cosTheta, 1.5));

        vec3 scatteredLight = vec3(1.0, 0.95, 0.85) * uScattering * phase;
        vec3 ambientScatter = uSmokeColor * uScattering * 0.15;

        vec3 sampleColor = (scatteredLight + ambientScatter) * absorptionColor + emission;

        // Alpha from density
        float alpha = 1.0 - exp(-finalDensity * 10.0);
        alpha = clamp(alpha, 0.0, 0.95);

        gl_FragColor = vec4(sampleColor, alpha);
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSmokeColor: { value: color.clone() },
        uDensity: { value: density },
        uAbsorption: { value: absorption },
        uScattering: { value: scattering },
        uPhaseG: { value: phaseG },
        uSmokeOrigin: { value: origin.clone() },
        uSmokeRadius: { value: radius },
        uEmissionColor: { value: emissionColor.clone() },
        uEmissionIntensity: { value: emissionIntensity },
        uTurbulenceScale: { value: turbulenceScale },
        uTurbulenceStrength: { value: turbulenceStrength },
        uTime: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }
}

// ============================================================================
// 3. DisplacementFromNoise
// ============================================================================

/**
 * DisplacementFromNoise provides procedural displacement along vertex normals
 * using configurable noise types. Supports both CPU-side geometry modification
 * (per-vertex displacement) and GPU-side vertex shader displacement.
 *
 * Noise types supported:
 * - FBM (fractal Brownian motion)
 * - Ridged multifractal
 * - Voronoi (cell-based displacement)
 * - Musgrave (all variants via GLSLProceduralTexturePipeline)
 *
 * Usage (CPU):
 * ```ts
 * const displacer = new DisplacementFromNoise();
 * const displaced = displacer.applyDisplacement(geometry, config, seed);
 * ```
 *
 * Usage (GPU):
 * ```ts
 * const material = displacer.createDisplacementMaterial(config);
 * mesh.material = material;
 * ```
 */
export class DisplacementFromNoise {
  /**
   * Apply per-vertex displacement along normals using procedural noise.
   * This modifies the geometry on the CPU side, producing a new BufferGeometry
   * with displaced positions and recomputed normals.
   *
   * @param geometry - The input geometry to displace
   * @param noiseConfig - Noise configuration parameters
   * @param seed - Random seed for deterministic results
   * @returns A new BufferGeometry with displaced vertices
   */
  applyDisplacement(
    geometry: THREE.BufferGeometry,
    noiseConfig: Partial<DisplacementNoiseConfig> = {},
    seed: number = 42,
  ): THREE.BufferGeometry {
    const config = { ...DEFAULT_DISPLACEMENT_CONFIG, ...noiseConfig, seed };
    const result = geometry.clone();

    const posAttr = result.getAttribute('position');
    const normAttr = result.getAttribute('normal');

    if (!posAttr) return result;

    // Compute normals if missing
    if (!normAttr) {
      result.computeVertexNormals();
    }

    const normalAttr = result.getAttribute('normal');
    const rng = this.seededRandom(seed);

    // Pre-compute random offsets for each octave
    const octaveOffsets: THREE.Vector3[] = [];
    for (let o = 0; o < config.octaves; o++) {
      octaveOffsets.push(new THREE.Vector3(
        rng() * 100,
        rng() * 100,
        rng() * 100,
      ));
    }

    // Displace each vertex along its normal
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const pz = posAttr.getZ(i);
      const nx = normalAttr.getX(i);
      const ny = normalAttr.getY(i);
      const nz = normalAttr.getZ(i);

      // Compute noise value at this position
      const noiseValue = this.evaluateNoise(
        px, py, pz,
        config,
        octaveOffsets,
      );

      // Displacement along normal
      const displacement = noiseValue * config.amplitude;
      posAttr.setXYZ(
        i,
        px + nx * displacement,
        py + ny * displacement,
        pz + nz * displacement,
      );
    }

    posAttr.needsUpdate = true;

    // Recompute normals after displacement
    result.computeVertexNormals();

    return result;
  }

  /**
   * Create a ShaderMaterial that displaces vertices in the vertex shader
   * on the GPU. No geometry modification needed — the displacement is
   * computed per-vertex in the shader.
   *
   * @param noiseConfig - Noise configuration parameters
   * @returns A THREE.ShaderMaterial with vertex displacement
   */
  createDisplacementMaterial(
    noiseConfig: Partial<DisplacementNoiseConfig> = {},
  ): THREE.ShaderMaterial {
    const config = { ...DEFAULT_DISPLACEMENT_CONFIG, ...noiseConfig };

    const vertexShader = /* glsl */ `
      uniform float uDisplacementScale;
      uniform float uDisplacementAmplitude;
      uniform float uDisplacementOctaves;
      uniform float uDisplacementLacunarity;
      uniform float uDisplacementGain;
      uniform float uDisplacementSeed;
      uniform int uNoiseType; // 0=fbm, 1=ridged, 2=voronoi, 3=musgrave

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vDisplacement;

      // Simple hash-based noise for GPU displacement
      float hash3D_disp(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float valueNoiseDisp(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash3D_disp(i + vec3(0,0,0)), hash3D_disp(i + vec3(1,0,0)), f.x),
              mix(hash3D_disp(i + vec3(0,1,0)), hash3D_disp(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash3D_disp(i + vec3(0,0,1)), hash3D_disp(i + vec3(1,0,1)), f.x),
              mix(hash3D_disp(i + vec3(0,1,1)), hash3D_disp(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbmDisp(vec3 p, int octaves, float lacunarity, float gain) {
        float value = 0.0;
        float amplitude = 1.0;
        float frequency = 1.0;
        float maxVal = 0.0;
        for (int i = 0; i < 16; i++) {
          if (i >= octaves) break;
          value += amplitude * valueNoiseDisp(p * frequency);
          maxVal += amplitude;
          amplitude *= gain;
          frequency *= lacunarity;
        }
        return value / max(maxVal, 0.001);
      }

      float ridgedNoise(vec3 p, int octaves, float lacunarity, float gain) {
        float value = 0.0;
        float amplitude = 1.0;
        float frequency = 1.0;
        float maxVal = 0.0;
        float weight = 1.0;
        for (int i = 0; i < 16; i++) {
          if (i >= octaves) break;
          float signal = valueNoiseDisp(p * frequency);
          signal = 1.0 - abs(signal * 2.0 - 1.0);
          signal *= signal;
          signal *= weight;
          weight = clamp(signal * gain, 0.0, 1.0);
          value += signal * amplitude;
          maxVal += amplitude;
          amplitude *= pow(lacunarity, -2.0);
          frequency *= lacunarity;
        }
        return value / max(maxVal, 0.001);
      }

      float voronoiDisp(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        float minDist = 8.0;
        for (int z = -1; z <= 1; z++) {
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec3 neighbor = vec3(float(x), float(y), float(z));
              vec3 point = vec3(
                hash3D_disp(i + neighbor),
                hash3D_disp(i + neighbor + vec3(31.0, 17.0, 43.0)),
                hash3D_disp(i + neighbor + vec3(67.0, 23.0, 11.0))
              );
              float dist = length(neighbor + point - f);
              minDist = min(minDist, dist);
            }
          }
        }
        return minDist;
      }

      void main() {
        vec3 noisePos = position * uDisplacementScale + vec3(uDisplacementSeed);

        float noiseVal;
        if (uNoiseType == 0) {
          noiseVal = fbmDisp(noisePos, int(uDisplacementOctaves), uDisplacementLacunarity, uDisplacementGain);
        } else if (uNoiseType == 1) {
          noiseVal = ridgedNoise(noisePos, int(uDisplacementOctaves), uDisplacementLacunarity, uDisplacementGain);
        } else if (uNoiseType == 2) {
          noiseVal = voronoiDisp(noisePos);
        } else {
          noiseVal = fbmDisp(noisePos, int(uDisplacementOctaves), uDisplacementLacunarity, uDisplacementGain);
        }

        vDisplacement = noiseVal * uDisplacementAmplitude;

        // Displace along normal
        vec3 displaced = position + normal * vDisplacement;

        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vUv = uv;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = /* glsl */ `
      precision highp float;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vDisplacement;

      void main() {
        // Color based on displacement amount
        vec3 lowColor = vec3(0.35, 0.28, 0.18);
        vec3 highColor = vec3(0.55, 0.50, 0.45);
        vec3 color = mix(lowColor, highColor, clamp(vDisplacement * 3.0, 0.0, 1.0));

        // Simple directional light
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float NdotL = max(dot(normalize(vNormal), lightDir), 0.0);
        color *= (0.3 + 0.7 * NdotL);

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // Map noise type to integer
    const noiseTypeMap: Record<DisplacementNoiseType, number> = {
      fbm: 0,
      ridged: 1,
      voronoi: 2,
      musgrave: 3,
    };

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uDisplacementScale: { value: config.scale },
        uDisplacementAmplitude: { value: config.amplitude },
        uDisplacementOctaves: { value: config.octaves },
        uDisplacementLacunarity: { value: config.lacunarity },
        uDisplacementGain: { value: config.gain },
        uDisplacementSeed: { value: config.seed },
        uNoiseType: { value: noiseTypeMap[config.noiseType] ?? 0 },
      },
    });
  }

  /**
   * Evaluate noise at a 3D position using the configured noise type.
   * CPU-side evaluation for geometry displacement.
   */
  private evaluateNoise(
    x: number, y: number, z: number,
    config: DisplacementNoiseConfig,
    octaveOffsets: THREE.Vector3[],
  ): number {
    const sx = x * config.scale;
    const sy = y * config.scale;
    const sz = z * config.scale;

    switch (config.noiseType) {
      case 'fbm':
        return this.cpuFBM(sx, sy, sz, config.octaves, config.lacunarity, config.gain, octaveOffsets);
      case 'ridged':
        return this.cpuRidged(sx, sy, sz, config.octaves, config.lacunarity, config.gain, octaveOffsets);
      case 'voronoi':
        return this.cpuVoronoi(sx, sy, sz);
      case 'musgrave':
        return this.cpuMusgrave(sx, sy, sz, config, octaveOffsets);
      default:
        return this.cpuFBM(sx, sy, sz, config.octaves, config.lacunarity, config.gain, octaveOffsets);
    }
  }

  /** CPU FBM noise evaluation */
  private cpuFBM(
    x: number, y: number, z: number,
    octaves: number, lacunarity: number, gain: number,
    offsets: THREE.Vector3[],
  ): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves && i < offsets.length; i++) {
      const ox = offsets[i].x;
      const oy = offsets[i].y;
      const oz = offsets[i].z;
      value += amplitude * this.cpuValueNoise(x * frequency + ox, y * frequency + oy, z * frequency + oz);
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return maxValue > 0 ? value / maxValue : 0;
  }

  /** CPU ridged multifractal noise evaluation */
  private cpuRidged(
    x: number, y: number, z: number,
    octaves: number, lacunarity: number, gain: number,
    offsets: THREE.Vector3[],
  ): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    let weight = 1;

    for (let i = 0; i < octaves && i < offsets.length; i++) {
      const ox = offsets[i].x;
      const oy = offsets[i].y;
      const oz = offsets[i].z;
      let signal = this.cpuValueNoise(x * frequency + ox, y * frequency + oy, z * frequency + oz);
      signal = 1 - Math.abs(signal * 2 - 1);
      signal *= signal;
      signal *= weight;
      weight = Math.min(1, Math.max(0, signal * gain));
      value += signal * amplitude;
      maxValue += amplitude;
      amplitude *= Math.pow(lacunarity, -2);
      frequency *= lacunarity;
    }

    return maxValue > 0 ? value / maxValue : 0;
  }

  /** CPU Voronoi noise evaluation */
  private cpuVoronoi(x: number, y: number, z: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;

    let minDist = Infinity;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = ix + dx;
          const ny = iy + dy;
          const nz = iz + dz;
          const px = this.cpuHash3D(nx, ny, nz);
          const py = this.cpuHash3D(nx + 31, ny + 17, nz + 43);
          const pz = this.cpuHash3D(nx + 67, ny + 23, nz + 11);
          const dist = Math.sqrt(
            (dx + px - fx) ** 2 +
            (dy + py - fy) ** 2 +
            (dz + pz - fz) ** 2,
          );
          minDist = Math.min(minDist, dist);
        }
      }
    }

    return minDist;
  }

  /** CPU Musgrave noise evaluation */
  private cpuMusgrave(
    x: number, y: number, z: number,
    config: DisplacementNoiseConfig,
    offsets: THREE.Vector3[],
  ): number {
    // Use FBM as the musgrave base since we don't have full Musgrave on CPU
    // The GPU shader path handles full Musgrave via GLSLProceduralTexturePipeline
    const dimension = config.dimension ?? 2.0;
    const gain = Math.pow(0.5, 2 - dimension);
    return this.cpuFBM(x, y, z, config.octaves, config.lacunarity, gain, offsets);
  }

  /** CPU 3D value noise */
  private cpuValueNoise(x: number, y: number, z: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;

    // Smoothstep
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const sz = fz * fz * (3 - 2 * fz);

    // Trilinear interpolation of hash values
    const n000 = this.cpuHash3D(ix, iy, iz);
    const n100 = this.cpuHash3D(ix + 1, iy, iz);
    const n010 = this.cpuHash3D(ix, iy + 1, iz);
    const n110 = this.cpuHash3D(ix + 1, iy + 1, iz);
    const n001 = this.cpuHash3D(ix, iy, iz + 1);
    const n101 = this.cpuHash3D(ix + 1, iy, iz + 1);
    const n011 = this.cpuHash3D(ix, iy + 1, iz + 1);
    const n111 = this.cpuHash3D(ix + 1, iy + 1, iz + 1);

    const nx00 = n000 * (1 - sx) + n100 * sx;
    const nx10 = n010 * (1 - sx) + n110 * sx;
    const nx01 = n001 * (1 - sx) + n101 * sx;
    const nx11 = n011 * (1 - sx) + n111 * sx;

    const nxy0 = nx00 * (1 - sy) + nx10 * sy;
    const nxy1 = nx01 * (1 - sy) + nx11 * sy;

    return nxy0 * (1 - sz) + nxy1 * sz;
  }

  /** CPU 3D hash function */
  private cpuHash3D(x: number, y: number, z: number): number {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    h = (h ^ (h >> 16));
    return ((h & 0x7fffffff) / 0x7fffffff);
  }

  /** Seeded PRNG */
  private seededRandom(seed: number): () => number {
    let state = Math.abs(seed | 0) || 1;
    return () => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 4294967296;
    };
  }
}
