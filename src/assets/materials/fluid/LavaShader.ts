/**
 * LavaShader — Per-Type Shader Pipeline for animated lava with Voronoi cracks
 *
 * Ports the original Infinigen's lava material with:
 * - Two layers of animated Voronoi DISTANCE_TO_EDGE for crack patterns
 * - Time-driven animation via uniform float uTime
 * - Blackbody emission color (1000-2500K) mapped through blackbody spectrum
 * - Mix shader: emission for cracks vs dark PrincipledBSDF for rock
 * - Noise-driven emission strength variation (20-60 range)
 * - Crack width variation
 * - Rock color: dark near-black with noise variation
 *
 * Phase 2, Item 2: Per-Type Shader Pipelines
 *
 * @module assets/materials/fluid
 */

import * as THREE from 'three';
import {
  SIMPLEX_3D_GLSL,
  FBM_GLSL,
  VALUE_NOISE_GLSL,
} from '../../shaders/common/NoiseGLSL';
import {
  VORONOI_2D_GLSL,
  VORONOI_ANIMATED_2D_GLSL,
} from '../../shaders/common/VoronoiGLSL';
import { BLACKBODY_GLSL } from '../../shaders/common/BlackbodyGLSL';
import { PBR_GLSL } from '../../shaders/common/PBRGLSL';

// ============================================================================
// Types
// ============================================================================

/** Lava shader configuration */
export interface LavaShaderConfig {
  /** Temperature in Kelvin for blackbody emission (1000-2500K) */
  temperature: number;
  /** Scale of the crack pattern */
  crackScale: number;
  /** Width of cracks (smaller = thinner cracks) */
  crackWidth: number;
  /** Emission strength base (20-60 range) */
  emissionStrength: number;
  /** Animation speed */
  animationSpeed: number;
  /** Rock base color */
  rockColor: THREE.Color;
  /** Scale of the second crack layer */
  crackScale2: number;
  /** Blend between crack layers (0=first only, 1=second only) */
  crackLayerBlend: number;
  /** Noise variation scale for emission strength */
  emissionNoiseScale: number;
  /** Seed for deterministic noise */
  seed: number;
}

/** Default configuration */
const DEFAULT_LAVA_CONFIG: LavaShaderConfig = {
  temperature: 1500,
  crackScale: 3.0,
  crackWidth: 0.04,
  emissionStrength: 40.0,
  animationSpeed: 0.15,
  rockColor: new THREE.Color(0.08, 0.04, 0.02),
  crackScale2: 5.0,
  crackLayerBlend: 0.3,
  emissionNoiseScale: 4.0,
  seed: 0,
};

// ============================================================================
// Lava Presets
// ============================================================================

export type LavaPreset = 'pahoehoe' | 'aa' | 'basaltic' | 'andesitic' | 'rhyolitic';

const LAVA_PRESETS: Record<LavaPreset, Partial<LavaShaderConfig>> = {
  pahoehoe: {
    temperature: 1400,
    crackScale: 2.5,
    crackWidth: 0.06,
    emissionStrength: 50.0,
    animationSpeed: 0.2,
    crackScale2: 4.0,
    crackLayerBlend: 0.4,
  },
  aa: {
    temperature: 1200,
    crackScale: 4.0,
    crackWidth: 0.03,
    emissionStrength: 30.0,
    animationSpeed: 0.1,
    crackScale2: 7.0,
    crackLayerBlend: 0.2,
  },
  basaltic: {
    temperature: 1500,
    crackScale: 3.0,
    crackWidth: 0.04,
    emissionStrength: 45.0,
    animationSpeed: 0.15,
    crackScale2: 5.0,
    crackLayerBlend: 0.3,
  },
  andesitic: {
    temperature: 1100,
    crackScale: 3.5,
    crackWidth: 0.035,
    emissionStrength: 25.0,
    animationSpeed: 0.08,
    crackScale2: 6.0,
    crackLayerBlend: 0.25,
  },
  rhyolitic: {
    temperature: 900,
    crackScale: 5.0,
    crackWidth: 0.025,
    emissionStrength: 20.0,
    animationSpeed: 0.05,
    crackScale2: 8.0,
    crackLayerBlend: 0.15,
  },
};

// ============================================================================
// GLSL Shaders
// ============================================================================

const LAVA_VERTEX_SHADER = /* glsl */ `
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

const LAVA_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTemperature;
  uniform float uCrackScale;
  uniform float uCrackWidth;
  uniform float uEmissionStrength;
  uniform float uAnimationSpeed;
  uniform vec3 uRockColor;
  uniform float uCrackScale2;
  uniform float uCrackLayerBlend;
  uniform float uEmissionNoiseScale;
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
  ${VALUE_NOISE_GLSL}
  ${VORONOI_2D_GLSL}
  ${VORONOI_ANIMATED_2D_GLSL}
  ${BLACKBODY_GLSL}
  ${PBR_GLSL}

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCameraPosition - vWorldPosition);

    float animTime = uTime * uAnimationSpeed;

    // === Layer 1: Primary crack pattern (animated Voronoi) ===
    vec2 crackPos1 = vUv * uCrackScale + vec2(uSeed * 0.1);
    VoronoiResult2D voronoi1 = voronoi2DAnimated(crackPos1, animTime);
    float crackMask1 = 1.0 - smoothstep(0.0, uCrackWidth, voronoi1.edgeDist);

    // === Layer 2: Secondary finer crack pattern ===
    vec2 crackPos2 = vUv * uCrackScale2 + vec2(uSeed * 0.17 + 5.0);
    VoronoiResult2D voronoi2 = voronoi2DAnimated(crackPos2, animTime * 1.3);
    float crackMask2 = 1.0 - smoothstep(0.0, uCrackWidth * 0.7, voronoi2.edgeDist);

    // === Combine crack layers ===
    float crackMask = mix(crackMask1, crackMask2, uCrackLayerBlend);
    // Use max for additive crack visibility
    crackMask = max(crackMask, crackMask2 * (1.0 - uCrackLayerBlend) * 0.5);

    // === Emission from cracks ===
    // Noise-driven emission strength variation (matching original's 20-60 range)
    float emissionNoise = snoise3D(vec3(vUv * uEmissionNoiseScale, uSeed)) * 0.5 + 0.5;
    float localEmission = uEmissionStrength * (0.5 + emissionNoise * 0.5);

    // Blackbody emission color
    vec3 emissionColor = blackbodyColor(uTemperature);

    // Emission intensity scales with crack visibility
    vec3 emission = emissionColor * crackMask * localEmission;

    // === Rock surface ===
    // Dark near-black with noise variation
    float rockNoise = snoise3D(vec3(vUv * 8.0, uSeed + 50.0)) * 0.05;
    vec3 rockColor = uRockColor + rockNoise;

    // Add subtle temperature variation to rock near cracks
    float heatBleed = smoothstep(uCrackWidth * 3.0, 0.0, min(voronoi1.edgeDist, voronoi2.edgeDist));
    vec3 heatedRock = mix(rockColor, emissionColor * 0.15, heatBleed * 0.5);

    // === Mix: emission for cracks vs dark rock ===
    vec3 finalColor = mix(heatedRock, emissionColor, crackMask);

    // Add emissive component (HDR, will be tone-mapped)
    finalColor += emission;

    // === Roughness: rougher rock, slightly smoother at cracks ===
    float roughness = 0.9 - crackMask * 0.4;

    // === Normal perturbation from crack pattern ===
    float eps = 0.01;
    vec2 pR = vUv * uCrackScale + vec2(eps, 0.0) + vec2(uSeed * 0.1);
    vec2 pL = vUv * uCrackScale + vec2(-eps, 0.0) + vec2(uSeed * 0.1);
    vec2 pU = vUv * uCrackScale + vec2(0.0, eps) + vec2(uSeed * 0.1);
    vec2 pD = vUv * uCrackScale + vec2(0.0, -eps) + vec2(uSeed * 0.1);

    float edgeR = voronoi2DAnimated(pR, animTime).edgeDist;
    float edgeL = voronoi2DAnimated(pL, animTime).edgeDist;
    float edgeU = voronoi2DAnimated(pU, animTime).edgeDist;
    float edgeD = voronoi2DAnimated(pD, animTime).edgeDist;

    vec3 perturbNormal = normalize(N - vec3(
      (edgeR - edgeL) / (2.0 * eps) * 0.3,
      (edgeU - edgeD) / (2.0 * eps) * 0.3,
      0.0
    ));

    // === PBR Lighting for rock areas (not for cracks, which are emissive) ===
    float metallic = 0.0;
    vec3 F0 = vec3(0.04);

    vec3 lightDir = normalize(uLightDir);
    vec3 lightColor = vec3(1.0, 0.95, 0.90);

    // Only apply PBR to rock, not to emissive cracks
    vec3 rockLo = computePBRLight(perturbNormal, V, heatedRock, metallic, roughness,
                                   lightDir, lightColor, 1.0, F0);

    // Ambient for rock
    vec3 ambient = vec3(0.05) * heatedRock;

    // Combine: rock gets PBR lighting, cracks are emissive
    vec3 rockLit = ambient + rockLo;
    vec3 color = mix(rockLit, finalColor, crackMask);
    // Add emission on top (cracks glow regardless of lighting)
    color += emission * (1.0 - crackMask * 0.3);

    // === Tone mapping (important for HDR emission) ===
    color = color / (color + vec3(1.0));

    // === Gamma correction ===
    color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// LavaShaderFactory
// ============================================================================

/**
 * Factory class for creating lava shader materials with animated Voronoi cracks.
 *
 * @example
 * ```ts
 * const factory = new LavaShaderFactory('basaltic', 42);
 * const material = factory.create();
 *
 * // In render loop:
 * * factory.updateTime(deltaTime);
 * ```
 */
export class LavaShaderFactory {
  private config: LavaShaderConfig;
  private material: THREE.ShaderMaterial | null = null;
  private timeAccumulator: number = 0;

  constructor(preset: LavaPreset = 'basaltic', seed: number = 0) {
    const presetConfig = LAVA_PRESETS[preset] || {};
    this.config = { ...DEFAULT_LAVA_CONFIG, ...presetConfig, seed };
  }

  /**
   * Create a lava shader material with animated Voronoi cracks.
   */
  create(config?: Partial<LavaShaderConfig>): THREE.ShaderMaterial {
    const finalConfig = { ...this.config, ...config };

    const uniforms: Record<string, THREE.IUniform> = {
      uTemperature: { value: finalConfig.temperature },
      uCrackScale: { value: finalConfig.crackScale },
      uCrackWidth: { value: finalConfig.crackWidth },
      uEmissionStrength: { value: finalConfig.emissionStrength / 50.0 }, // Normalize to 0-1ish range
      uAnimationSpeed: { value: finalConfig.animationSpeed },
      uRockColor: { value: new THREE.Vector3(finalConfig.rockColor.r, finalConfig.rockColor.g, finalConfig.rockColor.b) },
      uCrackScale2: { value: finalConfig.crackScale2 },
      uCrackLayerBlend: { value: finalConfig.crackLayerBlend },
      uEmissionNoiseScale: { value: finalConfig.emissionNoiseScale },
      uSeed: { value: finalConfig.seed },
      uTime: { value: 0.0 },
      uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.8).normalize() },
      uCameraPosition: { value: new THREE.Vector3() },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: LAVA_VERTEX_SHADER,
      fragmentShader: LAVA_FRAGMENT_SHADER,
      uniforms,
      side: THREE.FrontSide,
    });

    this.material.name = `Lava_${finalConfig.seed}`;
    return this.material;
  }

  /**
   * Update the time uniform for animation.
   * Call this each frame with the delta time.
   */
  updateTime(deltaTime: number): void {
    this.timeAccumulator += deltaTime;
    if (this.material && this.material.uniforms.uTime) {
      this.material.uniforms.uTime.value = this.timeAccumulator;
    }
  }

  /**
   * Update the camera position.
   */
  updateCamera(camera: THREE.Camera): void {
    if (this.material && this.material.uniforms.uCameraPosition) {
      this.material.uniforms.uCameraPosition.value.copy(camera.position);
    }
  }

  /**
   * Get a preset configuration.
   */
  static getPreset(preset: LavaPreset): Partial<LavaShaderConfig> {
    return LAVA_PRESETS[preset] || {};
  }

  /**
   * List all lava presets.
   */
  static listPresets(): LavaPreset[] {
    return Object.keys(LAVA_PRESETS) as LavaPreset[];
  }

  /**
   * Dispose of created materials.
   */
  dispose(): void {
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}
