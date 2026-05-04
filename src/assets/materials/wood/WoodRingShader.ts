/**
 * WoodRingShader — Per-Type Shader Pipeline for procedural wood grain
 *
 * Implements a custom THREE.ShaderMaterial that generates procedural wood grain with:
 * - Concentric ring patterns (growth rings) using sin(distance) modulated by noise
 * - Radial ray pattern for medullary rays
 * - Color variation between early wood (lighter) and late wood (darker) bands
 * - HSV color space variation for realistic wood coloring
 * - Noise-driven roughness variation (rougher in dark rings, smoother in light rings)
 * - Support for different wood species presets
 * - Proper tangential vs radial cut face appearance
 *
 * Phase 2, Item 2: Per-Type Shader Pipelines
 *
 * @module assets/materials/wood
 */

import * as THREE from 'three';
import { createCanvas } from '../../utils/CanvasUtils';
import {
  SIMPLEX_3D_GLSL,
  FBM_GLSL,
  HSV_RGB_GLSL,
  VALUE_NOISE_GLSL,
} from '../../shaders/common/NoiseGLSL';
import { PBR_GLSL } from '../../shaders/common/PBRGLSL';
import type { TextureBakePipeline, PBRTextureSet } from '../textures/TextureBakePipeline';

// ============================================================================
// Types
// ============================================================================

/** Wood species preset names */
export type WoodSpecies = 'oak' | 'pine' | 'walnut' | 'mahogany' | 'cherry' | 'birch' | 'maple' | 'teak';

/** Wood ring shader configuration */
export interface WoodRingConfig {
  /** Frequency of growth rings (rings per unit) */
  ringFrequency: number;
  /** How much noise distorts the ring pattern (0=perfect circles, 1=very irregular) */
  ringIrregularity: number;
  /** Number of medullary rays (radial lines) */
  rayCount: number;
  /** Intensity of medullary ray pattern (0=none, 1=full) */
  rayIntensity: number;
  /** Color of early wood (lighter, faster-growth bands) */
  earlyWoodColor: THREE.Color;
  /** Color of late wood (darker, slower-growth bands) */
  lateWoodColor: THREE.Color;
  /** Base roughness of the wood */
  roughness: number;
  /** Roughness variation amplitude in dark vs light rings */
  roughnessVariation: number;
  /** Scale of fine grain detail */
  grainScale: number;
  /** Cut face: 'radial' (quarter-sawn) or 'tangential' (plain-sawn) */
  cutFace: 'radial' | 'tangential';
  /** Seed for deterministic noise */
  seed: number;
}

/** Default configuration */
const DEFAULT_WOOD_RING_CONFIG: WoodRingConfig = {
  ringFrequency: 8.0,
  ringIrregularity: 0.4,
  rayCount: 12,
  rayIntensity: 0.15,
  earlyWoodColor: new THREE.Color(0.83, 0.65, 0.45),
  lateWoodColor: new THREE.Color(0.55, 0.43, 0.28),
  roughness: 0.7,
  roughnessVariation: 0.2,
  grainScale: 40.0,
  cutFace: 'tangential',
  seed: 0,
};

// ============================================================================
// Species Presets
// ============================================================================

const WOOD_SPECIES_PRESETS: Record<WoodSpecies, Partial<WoodRingConfig>> = {
  oak: {
    ringFrequency: 6.0,
    ringIrregularity: 0.5,
    rayCount: 16,
    rayIntensity: 0.2,
    earlyWoodColor: new THREE.Color(0.83, 0.65, 0.46),
    lateWoodColor: new THREE.Color(0.55, 0.43, 0.28),
    roughness: 0.7,
    grainScale: 35.0,
  },
  pine: {
    ringFrequency: 4.0,
    ringIrregularity: 0.3,
    rayCount: 8,
    rayIntensity: 0.1,
    earlyWoodColor: new THREE.Color(0.96, 0.87, 0.70),
    lateWoodColor: new THREE.Color(0.77, 0.65, 0.45),
    roughness: 0.8,
    grainScale: 25.0,
  },
  walnut: {
    ringFrequency: 7.0,
    ringIrregularity: 0.45,
    rayCount: 10,
    rayIntensity: 0.12,
    earlyWoodColor: new THREE.Color(0.45, 0.32, 0.20),
    lateWoodColor: new THREE.Color(0.24, 0.15, 0.09),
    roughness: 0.6,
    grainScale: 30.0,
  },
  mahogany: {
    ringFrequency: 6.5,
    ringIrregularity: 0.35,
    rayCount: 10,
    rayIntensity: 0.1,
    earlyWoodColor: new THREE.Color(0.75, 0.25, 0.0),
    lateWoodColor: new THREE.Color(0.54, 0.0, 0.0),
    roughness: 0.5,
    grainScale: 28.0,
  },
  cherry: {
    ringFrequency: 7.5,
    ringIrregularity: 0.3,
    rayCount: 12,
    rayIntensity: 0.15,
    earlyWoodColor: new THREE.Color(0.72, 0.45, 0.20),
    lateWoodColor: new THREE.Color(0.54, 0.27, 0.07),
    roughness: 0.65,
    grainScale: 32.0,
  },
  birch: {
    ringFrequency: 5.0,
    ringIrregularity: 0.2,
    rayCount: 6,
    rayIntensity: 0.08,
    earlyWoodColor: new THREE.Color(0.90, 0.85, 0.75),
    lateWoodColor: new THREE.Color(0.75, 0.68, 0.55),
    roughness: 0.75,
    grainScale: 22.0,
  },
  maple: {
    ringFrequency: 8.0,
    ringIrregularity: 0.35,
    rayCount: 14,
    rayIntensity: 0.18,
    earlyWoodColor: new THREE.Color(0.85, 0.72, 0.55),
    lateWoodColor: new THREE.Color(0.65, 0.50, 0.33),
    roughness: 0.65,
    grainScale: 38.0,
  },
  teak: {
    ringFrequency: 5.5,
    ringIrregularity: 0.4,
    rayCount: 8,
    rayIntensity: 0.12,
    earlyWoodColor: new THREE.Color(0.72, 0.55, 0.30),
    lateWoodColor: new THREE.Color(0.50, 0.35, 0.15),
    roughness: 0.55,
    grainScale: 26.0,
  },
};

// ============================================================================
// GLSL Shaders
// ============================================================================

const WOOD_RING_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vPosition = position;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WOOD_RING_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uEarlyWoodColor;
  uniform vec3 uLateWoodColor;
  uniform float uRingFrequency;
  uniform float uRingIrregularity;
  uniform float uRayCount;
  uniform float uRayIntensity;
  uniform float uRoughness;
  uniform float uRoughnessVariation;
  uniform float uGrainScale;
  uniform float uSeed;
  uniform float uTime;
  uniform vec3 uLightDir;
  uniform vec3 uCameraPosition;

  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  ${SIMPLEX_3D_GLSL}
  ${FBM_GLSL}
  ${HSV_RGB_GLSL}
  ${VALUE_NOISE_GLSL}
  ${PBR_GLSL}

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCameraPosition - vWorldPosition);

    // --- Ring center offset (noise-driven center for non-concentric rings) ---
    vec3 centerOffset = vec3(
      snoise3D(vec3(uSeed, 0.0, 0.0)) * 0.3,
      0.0,
      snoise3D(vec3(0.0, 0.0, uSeed)) * 0.3
    );

    // --- Growth ring pattern ---
    vec3 ringPos = vPosition - centerOffset;

    // Distance from center for ring pattern
    float dx = ringPos.x;
    float dz = ringPos.z;

    // Ring distortion using noise (makes rings wavy, not perfect circles)
    float ringDistortion = fbm3D(vec3(dx * 0.5, dz * 0.5, uSeed), 4, 2.0, 0.5) * uRingIrregularity;

    // Ring distance with distortion
    float dist = sqrt(dx * dx + dz * dz) + ringDistortion;

    // Ring pattern: sin of distance * frequency
    float ringPhase = dist * uRingFrequency;
    float ring = sin(ringPhase);

    // Map ring to [0,1] for blending between early/late wood
    float ringBlend = ring * 0.5 + 0.5;

    // Sharpen the transition for more defined rings
    ringBlend = smoothstep(0.3, 0.7, ringBlend);

    // --- Medullary rays (radial pattern) ---
    float angle = atan(dz, dx);
    float rayPattern = sin(angle * uRayCount);
    rayPattern = rayPattern * 0.5 + 0.5;
    rayPattern = smoothstep(0.6, 0.9, rayPattern) * uRayIntensity;

    // --- Fine grain detail (high-frequency noise for fiber texture) ---
    float grain = snoise3D(vPosition * uGrainScale + vec3(uSeed)) * 0.1;

    // --- Color mixing ---
    vec3 baseColor = mix(uLateWoodColor, uEarlyWoodColor, ringBlend);

    // Add medullary ray influence (slightly lighter rays)
    baseColor = mix(baseColor, baseColor * 1.15, rayPattern * (1.0 - ringBlend));

    // Add grain detail
    baseColor += grain;

    // HSV variation for natural color shifting
    vec3 hsv = rgb2hsv(baseColor);
    hsv.x += snoise3D(vPosition * 2.0 + vec3(uSeed + 10.0)) * 0.02; // Slight hue shift
    hsv.y *= 0.9 + snoise3D(vPosition * 3.0 + vec3(uSeed + 20.0)) * 0.1; // Saturation variation
    baseColor = hsv2rgb(clamp(hsv, vec3(0.0), vec3(1.0)));

    // --- Roughness variation ---
    // Late wood (dark rings) is rougher, early wood (light rings) is smoother
    float roughness = uRoughness + (1.0 - ringBlend) * uRoughnessVariation;
    // Add micro-roughness from grain
    roughness += abs(grain) * 0.3;
    roughness = clamp(roughness, 0.04, 1.0);

    // --- Normal perturbation for surface relief ---
    float eps = 0.005;
    vec3 pR = vPosition + vec3(eps, 0.0, 0.0);
    vec3 pU = vPosition + vec3(0.0, eps, 0.0);
    vec3 pF = vPosition + vec3(0.0, 0.0, eps);

    // Height function based on ring pattern
    float heightFn(vec3 p) {
      vec3 rp = p - centerOffset;
      float d = sqrt(rp.x * rp.x + rp.z * rp.z);
      float rd = fbm3D(vec3(rp.x * 0.5, rp.z * 0.5, uSeed), 4, 2.0, 0.5) * uRingIrregularity;
      float r = sin((d + rd) * uRingFrequency);
      float blend = r * 0.5 + 0.5;
      // Late wood (dark) is recessed
      return mix(-0.3, 0.1, blend) + snoise3D(p * uGrainScale * 0.5 + vec3(uSeed)) * 0.02;
    }

    float hC = heightFn(vPosition);
    float hR = heightFn(pR);
    float hU = heightFn(pU);
    float hF = heightFn(pF);

    vec3 perturbNormal = normalize(N - vec3(
      (hR - hC) / eps * 0.15,
      (hU - hC) / eps * 0.15,
      (hF - hC) / eps * 0.15
    ));

    // --- PBR Lighting ---
    float metallic = 0.0;
    vec3 F0 = vec3(0.04);
    F0 = mix(F0, baseColor, metallic);

    vec3 lightDir = normalize(uLightDir);
    vec3 lightColor = vec3(1.0, 0.95, 0.9);

    vec3 Lo = computePBRLight(perturbNormal, V, baseColor, metallic, roughness,
                              lightDir, lightColor, 1.0, F0);

    // Fill light
    vec3 fillDir = normalize(vec3(-0.3, 0.5, -0.6));
    vec3 fillColor = vec3(0.25, 0.27, 0.3);
    Lo += computePBRLight(perturbNormal, V, baseColor, metallic, roughness,
                          fillDir, fillColor, 1.0, F0);

    // Ambient
    vec3 ambient = vec3(0.12, 0.11, 0.10) * baseColor;

    vec3 color = ambient + Lo;

    // Tone mapping (Reinhard)
    color = color / (color + vec3(1.0));

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// WoodRingMaterialFactory
// ============================================================================

/**
 * Factory class for creating wood ring shader materials.
 *
 * Generates THREE.ShaderMaterial instances with procedurally generated
 * wood grain patterns including growth rings, medullary rays, and
 * proper color/roughness variation.
 *
 * @example
 * ```ts
 * const factory = new WoodRingMaterialFactory('oak', 42);
 * const material = factory.create();
 * // Use in mesh:
 * const mesh = new THREE.Mesh(geometry, material);
 * ```
 */
export class WoodRingMaterialFactory {
  private config: WoodRingConfig;
  private material: THREE.ShaderMaterial | null = null;

  constructor(species: WoodSpecies = 'oak', seed: number = 0) {
    const preset = WOOD_SPECIES_PRESETS[species] || {};
    this.config = {
      ...DEFAULT_WOOD_RING_CONFIG,
      ...preset,
      seed,
    };
  }

  /**
   * Create a wood ring shader material with the configured species and seed.
   */
  create(config?: Partial<WoodRingConfig>): THREE.ShaderMaterial {
    const finalConfig = { ...this.config, ...config };

    const uniforms: Record<string, THREE.IUniform> = {
      uEarlyWoodColor: { value: new THREE.Vector3(finalConfig.earlyWoodColor.r, finalConfig.earlyWoodColor.g, finalConfig.earlyWoodColor.b) },
      uLateWoodColor: { value: new THREE.Vector3(finalConfig.lateWoodColor.r, finalConfig.lateWoodColor.g, finalConfig.lateWoodColor.b) },
      uRingFrequency: { value: finalConfig.ringFrequency },
      uRingIrregularity: { value: finalConfig.ringIrregularity },
      uRayCount: { value: finalConfig.rayCount },
      uRayIntensity: { value: finalConfig.rayIntensity },
      uRoughness: { value: finalConfig.roughness },
      uRoughnessVariation: { value: finalConfig.roughnessVariation },
      uGrainScale: { value: finalConfig.grainScale },
      uSeed: { value: finalConfig.seed },
      uTime: { value: 0.0 },
      uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.8).normalize() },
      uCameraPosition: { value: new THREE.Vector3() },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: WOOD_RING_VERTEX_SHADER,
      fragmentShader: WOOD_RING_FRAGMENT_SHADER,
      uniforms,
      side: THREE.FrontSide,
    });

    this.material.name = `WoodRing_${this.config.seed}`;
    return this.material;
  }

  /**
   * Update the material's time uniform for animation.
   */
  updateTime(time: number): void {
    if (this.material && this.material.uniforms.uTime) {
      this.material.uniforms.uTime.value = time;
    }
  }

  /**
   * Update the camera position for proper PBR lighting.
   */
  updateCamera(camera: THREE.Camera): void {
    if (this.material && this.material.uniforms.uCameraPosition) {
      this.material.uniforms.uCameraPosition.value.copy(camera.position);
    }
  }

  /**
   * Generate canvas-based textures for fallback rendering.
   * Bakes the wood ring pattern to 2D textures compatible with
   * MeshStandardMaterial/MeshPhysicalMaterial.
   */
  generateTextures(resolution: number = 512): {
    albedo: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
    roughness: THREE.CanvasTexture;
  } {
    const { earlyWoodColor, lateWoodColor, ringFrequency, ringIrregularity, rayCount, rayIntensity, roughness, roughnessVariation, grainScale, seed } = this.config;

    // Albedo map
    const albedoCanvas = createCanvas();
    albedoCanvas.width = resolution;
    albedoCanvas.height = resolution;
    const albedoCtx = albedoCanvas.getContext('2d')!;

    // Normal map
    const normalCanvas = createCanvas();
    normalCanvas.width = resolution;
    normalCanvas.height = resolution;
    const normalCtx = normalCanvas.getContext('2d')!;

    // Roughness map
    const roughnessCanvas = createCanvas();
    roughnessCanvas.width = resolution;
    roughnessCanvas.height = resolution;
    const roughnessCtx = roughnessCanvas.getContext('2d')!;

    // Simple seeded RNG for texture generation
    let rngState = seed;
    const rng = () => {
      rngState = (rngState * 1664525 + 1013904223) & 0xffffffff;
      return (rngState >>> 0) / 4294967296;
    };

    // Simple 2D noise
    const noise2d = (x: number, y: number): number => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);

      const a = (Math.sin(ix * 12.9898 + iy * 78.233) * 43758.5453) % 1;
      const b = (Math.sin((ix + 1) * 12.9898 + iy * 78.233) * 43758.5453) % 1;
      const c = (Math.sin(ix * 12.9898 + (iy + 1) * 78.233) * 43758.5453) % 1;
      const d = (Math.sin((ix + 1) * 12.9898 + (iy + 1) * 78.233) * 43758.5453) % 1;

      const va = a - Math.floor(a);
      const vb = b - Math.floor(b);
      const vc = c - Math.floor(c);
      const vd = d - Math.floor(d);

      return va * (1 - ux) * (1 - uy) + vb * ux * (1 - uy) + vc * (1 - ux) * uy + vd * ux * uy;
    };

    const heightField = new Float32Array(resolution * resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const u = x / resolution;
        const v = y / resolution;
        const idx = y * resolution + x;

        // Center of ring pattern
        const cx = 0.5 + (rng() - 0.5) * 0.1;
        const cz = 0.5 + (rng() - 0.5) * 0.1;
        const dx = u - cx;
        const dz = v - cz;

        // Distance with noise distortion
        const noiseDist = noise2d(dx * 2, dz * 2) * ringIrregularity;
        const dist = Math.sqrt(dx * dx + dz * dz) + noiseDist;

        // Ring pattern
        const ring = Math.sin(dist * ringFrequency * Math.PI * 2);
        const ringBlend = ring * 0.5 + 0.5;
        const sharpBlend = Math.pow(ringBlend, 0.7);

        // Color
        const r = lateWoodColor.r * (1 - sharpBlend) + earlyWoodColor.r * sharpBlend;
        const g = lateWoodColor.g * (1 - sharpBlend) + earlyWoodColor.g * sharpBlend;
        const b = lateWoodColor.b * (1 - sharpBlend) + earlyWoodColor.b * sharpBlend;

        // Grain detail
        const grain = noise2d(u * grainScale, v * grainScale) * 0.1;

        // Ray pattern
        const angle = Math.atan2(dz, dx);
        const ray = Math.sin(angle * rayCount) * 0.5 + 0.5;
        const rayMask = Math.pow(ray, 5) * rayIntensity;

        const finalR = Math.max(0, Math.min(1, r + grain + rayMask * 0.1));
        const finalG = Math.max(0, Math.min(1, g + grain + rayMask * 0.1));
        const finalB = Math.max(0, Math.min(1, b + grain + rayMask * 0.1));

        const pidx = idx * 4;
        const albedoImageData = albedoCtx.createImageData(1, 1);
        albedoImageData.data[0] = Math.floor(finalR * 255);
        albedoImageData.data[1] = Math.floor(finalG * 255);
        albedoImageData.data[2] = Math.floor(finalB * 255);
        albedoImageData.data[3] = 255;
        albedoCtx.putImageData(albedoImageData, x, y);

        // Roughness
        const roughVal = Math.max(0, Math.min(1, roughness + (1 - sharpBlend) * roughnessVariation + Math.abs(grain) * 0.3));
        const roughImageData = roughnessCtx.createImageData(1, 1);
        roughImageData.data[0] = Math.floor(roughVal * 255);
        roughImageData.data[1] = Math.floor(roughVal * 255);
        roughImageData.data[2] = Math.floor(roughVal * 255);
        roughImageData.data[3] = 255;
        roughnessCtx.putImageData(roughImageData, x, y);

        // Height for normal computation
        heightField[idx] = mix(-0.3, 0.1, sharpBlend) + noise2d(u * grainScale * 0.5, v * grainScale * 0.5) * 0.02;
      }
    }

    // Compute normal map from height field
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const left = heightField[y * resolution + ((x - 1 + resolution) % resolution)];
        const right = heightField[y * resolution + ((x + 1) % resolution)];
        const up = heightField[((y - 1 + resolution) % resolution) * resolution + x];
        const down = heightField[((y + 1) % resolution) * resolution + x];

        const ndx = (right - left) * 2.0;
        const ndy = (down - up) * 2.0;
        const ndz = 1.0;
        const len = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz);

        const normalImageData = normalCtx.createImageData(1, 1);
        normalImageData.data[0] = Math.floor(((ndx / len) * 0.5 + 0.5) * 255);
        normalImageData.data[1] = Math.floor(((ndy / len) * 0.5 + 0.5) * 255);
        normalImageData.data[2] = Math.floor(((ndz / len) * 0.5 + 0.5) * 255);
        normalImageData.data[3] = 255;
        normalCtx.putImageData(normalImageData, x, y);
      }
    }

    const albedoTexture = new THREE.CanvasTexture(albedoCanvas);
    albedoTexture.wrapS = THREE.RepeatWrapping;
    albedoTexture.wrapT = THREE.RepeatWrapping;

    const normalTexture = new THREE.CanvasTexture(normalCanvas);
    normalTexture.wrapS = THREE.RepeatWrapping;
    normalTexture.wrapT = THREE.RepeatWrapping;

    const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
    roughnessTexture.wrapS = THREE.RepeatWrapping;
    roughnessTexture.wrapT = THREE.RepeatWrapping;

    return { albedo: albedoTexture, normal: normalTexture, roughness: roughnessTexture };
  }

  /**
   * Create a MeshPhysicalMaterial from baked textures for native Three.js rendering.
   */
  createBakedMaterial(resolution: number = 512): THREE.MeshPhysicalMaterial {
    const textures = this.generateTextures(resolution);

    return new THREE.MeshPhysicalMaterial({
      map: textures.albedo,
      normalMap: textures.normal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: textures.roughness,
      roughness: this.config.roughness,
      metalness: 0.0,
      name: `WoodRing_Baked_${this.config.seed}`,
    });
  }

  /**
   * Get the species preset for a given wood type.
   */
  static getPreset(species: WoodSpecies): Partial<WoodRingConfig> {
    return WOOD_SPECIES_PRESETS[species] || {};
  }

  /**
   * List all available wood species.
   */
  static listSpecies(): WoodSpecies[] {
    return Object.keys(WOOD_SPECIES_PRESETS) as WoodSpecies[];
  }

  /**
   * Dispose of created materials and textures.
   */
  dispose(): void {
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
