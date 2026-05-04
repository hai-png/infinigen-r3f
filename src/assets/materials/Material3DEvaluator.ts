/**
 * Material3DEvaluator - CPU fallback and GLSL shader material creation for 3D materials
 *
 * Provides two modes of operation:
 * 1. CPU fallback: evaluateMaterialAtPoint() evaluates a node graph at a specific
 *    3D point with a surface normal, returning PBR parameters. This is useful for
 *    offline rendering, baking, or validation.
 * 2. GPU shader: createShaderMaterial() builds a full THREE.ShaderMaterial that
 *    evaluates the material in 3D texture space using GLSL, with triplanar projection
 *    for seamless mapping on arbitrary mesh orientations.
 *
 * Supports:
 * - 3D texture coordinates (Object, World, Generated)
 * - 4D noise evaluation (3D position + time/seed uniform)
 * - Per-pixel displacement in the vertex shader
 * - Triplanar UV projection with seamless offset-blend
 * - All standard PBR parameters: baseColor, metallic, roughness, normalMap, emission, alpha
 * - Multi-light support (directional + point + area)
 * - IBL environment map approximation
 * - Forward and deferred rendering compatible
 */

import * as THREE from 'three';
import { SeededNoiseGenerator } from '../../core/util/math/noise';
import {
  TRIPLANAR_GLSL,
  TEXCOORD_GLSL,
  NOISE_4D_GLSL,
  IBL_GLSL,
  VERTEX_SHADER_3D,
  FRAGMENT_VARYINGS_3D,
  buildVertexShaderWithDisplacement,
} from './shaders/TriplanarProjection';
import { RuntimeMaterialBuilder, type NodeGraph3DConfig } from './RuntimeMaterialBuilder';
import type { NodeGraph } from '../../core/nodes/execution/NodeEvaluator';

// ============================================================================
// Types
// ============================================================================

/** Result of evaluating a material at a 3D point */
export interface MaterialPointEvaluation {
  color: THREE.Color;
  normal: THREE.Vector3;
  roughness: number;
  metallic: number;
  emission: THREE.Color;
  emissionStrength: number;
  alpha: number;
  ao: number;
  height: number;
}

/** Coordinate space for texture evaluation */
export enum CoordinateSpace {
  Generated = 0,
  Object = 1,
  World = 2,
  UV = 3,
}

/** Configuration for 3D material evaluation */
export interface Material3DConfig {
  /** Which coordinate space to use for texture evaluation */
  coordinateSpace: CoordinateSpace;
  /** Triplanar blend exponent (higher = sharper transitions, default 8) */
  triplanarBlendExponent: number;
  /** Texture scale applied to 3D coordinates */
  textureScale: number;
  /** Whether to enable displacement in the vertex shader */
  enableDisplacement: boolean;
  /** Displacement scale */
  displacementScale: number;
  /** Displacement offset */
  displacementOffset: number;
  /** Whether to enable animation (time uniform) */
  animated: boolean;
  /** Seed for deterministic noise */
  seed: number;
  /** Normal map strength */
  normalStrength: number;
  /** AO strength */
  aoStrength: number;
  /** Whether to use seamless triplanar (offset-blend) */
  seamlessTriplanar: boolean;
  /** Whether to enable IBL approximation */
  enableIBL: boolean;
  /** Number of directional lights for GPU shader */
  directionalLightCount: number;
  /** Number of point lights for GPU shader */
  pointLightCount: number;
}

/** Default 3D material configuration */
export const DEFAULT_3D_CONFIG: Material3DConfig = {
  coordinateSpace: CoordinateSpace.Object,
  triplanarBlendExponent: 8.0,
  textureScale: 1.0,
  enableDisplacement: false,
  displacementScale: 0.05,
  displacementOffset: 0.0,
  animated: false,
  seed: 0,
  normalStrength: 1.0,
  aoStrength: 1.0,
  seamlessTriplanar: true,
  enableIBL: true,
  directionalLightCount: 3,
  pointLightCount: 2,
};

// ============================================================================
// Material3DEvaluator
// ============================================================================

export class Material3DEvaluator {
  private noise: SeededNoiseGenerator;
  private config: Material3DConfig;
  private builder: RuntimeMaterialBuilder;

  constructor(config: Partial<Material3DConfig> = {}) {
    this.config = { ...DEFAULT_3D_CONFIG, ...config };
    this.noise = new SeededNoiseGenerator(this.config.seed);
    this.builder = new RuntimeMaterialBuilder(this.config);
  }

  // ==========================================================================
  // CPU Fallback: Evaluate Material at a Single 3D Point
  // ==========================================================================

  /**
   * Evaluate a material at a specific 3D point and normal.
   * CPU fallback for when GPU evaluation is not available or for offline use.
   *
   * @param nodeGraph - The node graph defining the material
   * @param point - 3D position in the chosen coordinate space
   * @param normal - Surface normal at the point
   * @returns PBR parameters at the given point
   */
  evaluateMaterialAtPoint(
    _nodeGraph: NodeGraph,
    point: THREE.Vector3,
    normal: THREE.Vector3
  ): MaterialPointEvaluation {
    // Use triplanar projection to compute noise values at this point
    const p = point.clone().multiplyScalar(this.config.textureScale);
    const n = normal.clone().normalize();

    // Compute triplanar weights (same formula as the GLSL version)
    const absN = new THREE.Vector3(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
    const exp = this.config.triplanarBlendExponent;
    const w = new THREE.Vector3(
      Math.pow(absN.x, exp),
      Math.pow(absN.y, exp),
      Math.pow(absN.z, exp)
    );
    const sum = w.x + w.y + w.z;
    if (sum > 0.0001) {
      w.divideScalar(sum);
    } else {
      w.set(1 / 3, 1 / 3, 1 / 3);
    }

    // Evaluate noise on all three planes and blend
    // Use seamless offset-blend if enabled
    const offsetScale = this.config.seamlessTriplanar ? 0.5 : 0.0;

    const noiseXY = this.noise.fbm(
      (p.x + (this.config.seamlessTriplanar ? p.z * offsetScale : 0)),
      p.y, 0, { octaves: 5, gain: 0.5 }
    );
    const noiseXZ = this.noise.fbm(
      (p.x + (this.config.seamlessTriplanar ? p.y * offsetScale : 0)),
      p.z, 0, { octaves: 5, gain: 0.5 }
    );
    const noiseYZ = this.noise.fbm(
      (p.y + (this.config.seamlessTriplanar ? p.x * offsetScale : 0)),
      p.z, 0, { octaves: 5, gain: 0.5 }
    );
    const blendedNoise = w.z * noiseXY + w.y * noiseXZ + w.x * noiseYZ;

    // Compute roughness variation
    const roughNoiseXY = this.noise.fbm(p.x * 2, p.y * 2, 0, { octaves: 3, gain: 0.5 });
    const roughNoiseXZ = this.noise.fbm(p.x * 2, p.z * 2, 0, { octaves: 3, gain: 0.5 });
    const roughNoiseYZ = this.noise.fbm(p.y * 2, p.z * 2, 0, { octaves: 3, gain: 0.5 });
    const roughNoise = w.z * roughNoiseXY + w.y * roughNoiseXZ + w.x * roughNoiseYZ;

    // Compute height for normal perturbation
    const eps = 0.01;
    const heightFn = (px: number, py: number, pz: number) => {
      const nxy = this.noise.fbm(px * this.config.textureScale, py * this.config.textureScale, 0, { octaves: 5 });
      const nxz = this.noise.fbm(px * this.config.textureScale, pz * this.config.textureScale, 0, { octaves: 5 });
      const nyz = this.noise.fbm(py * this.config.textureScale, pz * this.config.textureScale, 0, { octaves: 5 });
      return w.z * nxy + w.y * nxz + w.x * nyz;
    };

    const hC = heightFn(point.x, point.y, point.z);
    const hR = heightFn(point.x + eps, point.y, point.z);
    const hU = heightFn(point.x, point.y + eps, point.z);
    const hF = heightFn(point.x, point.y, point.z + eps);

    // Perturbed normal from height field gradient
    const perturbX = (hR - hC) / eps * this.config.normalStrength;
    const perturbY = (hU - hC) / eps * this.config.normalStrength;
    const perturbZ = (hF - hC) / eps * this.config.normalStrength;
    const perturbedNormal = new THREE.Vector3(
      n.x - perturbX,
      n.y - perturbY,
      n.z - perturbZ
    ).normalize();

    // Compute AO from low-frequency noise
    const aoNoise = (this.noise.fbm(p.x * 0.5, p.y * 0.5, p.z * 0.5, { octaves: 3, gain: 0.7 }) + 1) / 2;

    // Base color variation from noise
    const colorVar = 0.9 + (blendedNoise + 1) * 0.1; // +/- 10%
    const baseColor = new THREE.Color(0.5 * colorVar, 0.5 * colorVar, 0.5 * colorVar);

    return {
      color: baseColor,
      normal: perturbedNormal,
      roughness: Math.max(0.04, 0.5 + (roughNoise) * 0.3),
      metallic: 0.0,
      emission: new THREE.Color(0, 0, 0),
      emissionStrength: 0.0,
      alpha: 1.0,
      ao: 1.0 - aoNoise * this.config.aoStrength * 0.5,
      height: (blendedNoise + 1) / 2 * this.config.displacementScale,
    };
  }

  /**
   * Evaluate a material with a preset PBR parameter set at a given point.
   * Uses the PBR params from MaterialPresetLibrary to produce realistic results.
   */
  evaluatePresetAtPoint(
    baseParams: {
      baseColor: THREE.Color;
      roughness: number;
      metallic: number;
      noiseScale: number;
      noiseDetail: number;
      distortion: number;
      warpStrength: number;
      normalStrength: number;
      aoStrength: number;
      heightScale: number;
      emissionColor: THREE.Color | null;
      emissionStrength: number;
    },
    point: THREE.Vector3,
    normal: THREE.Vector3
  ): MaterialPointEvaluation {
    const p = point.clone();
    const n = normal.clone().normalize();

    // Triplanar weights
    const absN = new THREE.Vector3(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
    const exp = this.config.triplanarBlendExponent;
    const w = new THREE.Vector3(
      Math.pow(absN.x, exp),
      Math.pow(absN.y, exp),
      Math.pow(absN.z, exp)
    );
    const sum = w.x + w.y + w.z;
    if (sum > 0.0001) w.divideScalar(sum);
    else w.set(1 / 3, 1 / 3, 1 / 3);

    const scale = baseParams.noiseScale;
    const detail = baseParams.noiseDetail;

    // Evaluate noise on all three planes
    const offsetScale = this.config.seamlessTriplanar ? 0.5 : 0;
    const noiseXY = this.noise.fbm(
      (p.x * scale + (this.config.seamlessTriplanar ? p.z * scale * offsetScale : 0)),
      p.y * scale, 0, { octaves: detail, gain: 0.5 }
    );
    const noiseXZ = this.noise.fbm(
      (p.x * scale + (this.config.seamlessTriplanar ? p.y * scale * offsetScale : 0)),
      p.z * scale, 0, { octaves: detail, gain: 0.5 }
    );
    const noiseYZ = this.noise.fbm(
      (p.y * scale + (this.config.seamlessTriplanar ? p.x * scale * offsetScale : 0)),
      p.z * scale, 0, { octaves: detail, gain: 0.5 }
    );
    const blendedNoise = w.z * noiseXY + w.y * noiseXZ + w.x * noiseYZ;

    // Domain warping if warpStrength > 0
    let warpedNoise = blendedNoise;
    if (baseParams.warpStrength > 0) {
      const ws = baseParams.warpStrength;
      const qx = this.noise.perlin3D(p.x * scale + 5.2, p.y * scale + 1.3, p.z * scale + 2.8);
      const qy = this.noise.perlin3D(p.x * scale + 9.1, p.y * scale + 3.7, p.z * scale + 7.4);
      const qz = this.noise.perlin3D(p.x * scale + 2.4, p.y * scale + 8.1, p.z * scale + 4.6);
      warpedNoise = this.noise.fbm(
        p.x * scale + ws * qx,
        p.y * scale + ws * qy,
        p.z * scale + ws * qz,
        { octaves: detail, gain: 0.5 }
      );
    }

    // Base color with noise variation
    const variation = 0.9 + (warpedNoise + 1) * 0.1;
    const baseColor = baseParams.baseColor.clone().multiplyScalar(variation);

    // Roughness variation
    const roughNoiseXY = this.noise.perlin2D(p.x * scale * 2, p.y * scale * 2);
    const roughNoiseXZ = this.noise.perlin2D(p.x * scale * 2, p.z * scale * 2);
    const roughNoiseYZ = this.noise.perlin2D(p.y * scale * 2, p.z * scale * 2);
    const roughNoise = w.z * roughNoiseXY + w.y * roughNoiseXZ + w.x * roughNoiseYZ;
    const roughness = Math.max(0.04, baseParams.roughness + roughNoise * 0.15);

    // Normal perturbation
    const eps = 0.01;
    const heightFn = (px: number, py: number, pz: number) => {
      const nxy = this.noise.fbm(px * scale, py * scale, 0, { octaves: detail });
      const nxz = this.noise.fbm(px * scale, pz * scale, 0, { octaves: detail });
      const nyz = this.noise.fbm(py * scale, pz * scale, 0, { octaves: detail });
      return w.z * nxy + w.y * nxz + w.x * nyz;
    };

    const hC = heightFn(point.x, point.y, point.z);
    const hR = heightFn(point.x + eps, point.y, point.z);
    const hU = heightFn(point.x, point.y + eps, point.z);
    const hF = heightFn(point.x, point.y, point.z + eps);

    const perturbX = (hR - hC) / eps * baseParams.normalStrength;
    const perturbY = (hU - hC) / eps * baseParams.normalStrength;
    const perturbZ = (hF - hC) / eps * baseParams.normalStrength;
    const perturbedNormal = new THREE.Vector3(
      n.x - perturbX,
      n.y - perturbY,
      n.z - perturbZ
    ).normalize();

    // AO from low-frequency noise
    const aoNoise = (this.noise.fbm(p.x * scale * 0.5, p.y * scale * 0.5, p.z * scale * 0.5, { octaves: 3, gain: 0.7 }) + 1) / 2;

    // Emission
    const emissionColor = baseParams.emissionColor?.clone() ?? new THREE.Color(0, 0, 0);
    if (baseParams.emissionStrength > 0 && baseParams.emissionColor) {
      const emNoise = (warpedNoise + 1) / 2;
      emissionColor.multiplyScalar(emNoise);
    }

    return {
      color: baseColor,
      normal: perturbedNormal,
      roughness,
      metallic: baseParams.metallic,
      emission: emissionColor,
      emissionStrength: baseParams.emissionStrength,
      alpha: 1.0,
      ao: 1.0 - aoNoise * baseParams.aoStrength * 0.5,
      height: (warpedNoise + 1) / 2 * baseParams.heightScale,
    };
  }

  // ==========================================================================
  // GPU: Create a ShaderMaterial from a Node Graph
  // ==========================================================================

  /**
   * Create a THREE.ShaderMaterial from a node graph that evaluates the material
   * in 3D texture space using GLSL. Uses triplanar projection for seamless
   * mapping on arbitrary mesh orientations.
   *
   * @param nodeGraph - The node graph defining the material
   * @param config - Optional configuration overrides
   * @returns THREE.ShaderMaterial with 3D evaluation
   */
  createShaderMaterial(
    nodeGraph: NodeGraph,
    config?: Partial<NodeGraph3DConfig>
  ): THREE.ShaderMaterial {
    return this.builder.buildFromNodeGraph(nodeGraph, config);
  }

  /**
   * Create a simple 3D ShaderMaterial from PBR parameters.
   * This is a convenience method that creates a material directly from PBR params
   * without requiring a full node graph.
   */
  createShaderMaterialFromParams(
    params: {
      baseColor: THREE.Color;
      roughness: number;
      metallic: number;
      noiseScale: number;
      noiseDetail: number;
      normalStrength: number;
      aoStrength: number;
      heightScale: number;
      emissionColor: THREE.Color | null;
      emissionStrength: number;
    },
    config?: Partial<Material3DConfig>
  ): THREE.ShaderMaterial {
    const cfg = { ...this.config, ...config };
    const uniforms = this.buildPBRUniforms(params, cfg);

    const vertexShader = cfg.enableDisplacement
      ? buildVertexShaderWithDisplacement(this.getDisplacementGLSL(params))
      : VERTEX_SHADER_3D;

    const fragmentShader = this.buildPBRFragmentShader(params, cfg);

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.FrontSide,
      transparent: params.emissionStrength > 0,
    });
  }

  // ==========================================================================
  // Internal: Shader Building
  // ==========================================================================

  private buildPBRUniforms(
    params: {
      baseColor: THREE.Color;
      roughness: number;
      metallic: number;
      noiseScale: number;
      noiseDetail: number;
      normalStrength: number;
      aoStrength: number;
      heightScale: number;
      emissionColor: THREE.Color | null;
      emissionStrength: number;
    },
    cfg: Material3DConfig
  ): Record<string, THREE.IUniform> {
    return {
      // PBR parameters
      uBaseColor: { value: new THREE.Vector3(params.baseColor.r, params.baseColor.g, params.baseColor.b) },
      uRoughness: { value: params.roughness },
      uMetallic: { value: params.metallic },
      uNormalStrength: { value: params.normalStrength },
      uAOStrength: { value: params.aoStrength },
      uHeightScale: { value: params.heightScale },
      uEmissionColor: { value: new THREE.Vector3(
        (params.emissionColor?.r ?? 0),
        (params.emissionColor?.g ?? 0),
        (params.emissionColor?.b ?? 0)
      ) },
      uEmissionStrength: { value: params.emissionStrength },
      uAlpha: { value: 1.0 },

      // Noise parameters
      uNoiseScale: { value: params.noiseScale },
      uNoiseDetail: { value: params.noiseDetail },
      uSeed: { value: cfg.seed },

      // Coordinate space
      uCoordSpace: { value: cfg.coordinateSpace },
      uTriplanarBlendExponent: { value: cfg.triplanarBlendExponent },
      uTextureScale: { value: cfg.textureScale },
      uSeamlessTriplanar: { value: cfg.seamlessTriplanar ? 1 : 0 },

      // Displacement
      uDisplacementScale: { value: cfg.displacementScale },
      uDisplacementOffset: { value: cfg.displacementOffset },

      // Animation
      uTime: { value: 0.0 },
      uAnimated: { value: cfg.animated ? 1 : 0 },

      // IBL
      uEnableIBL: { value: cfg.enableIBL ? 1 : 0 },
      uEnvMapIntensity: { value: 1.0 },

      // Camera (auto-set by Three.js)
      cameraPosition: { value: new THREE.Vector3() },
    };
  }

  private buildPBRFragmentShader(
    params: {
      baseColor: THREE.Color;
      roughness: number;
      metallic: number;
      noiseScale: number;
      noiseDetail: number;
      normalStrength: number;
      aoStrength: number;
      heightScale: number;
      emissionColor: THREE.Color | null;
      emissionStrength: number;
    },
    cfg: Material3DConfig
  ): string {
    // Include 4D noise for animated materials
    const noise4DInclude = cfg.animated ? NOISE_4D_GLSL : '';
    // Include IBL for environment lighting
    const iblInclude = cfg.enableIBL ? IBL_GLSL : '';

    return `#version 300 es
precision highp float;
precision highp int;

${FRAGMENT_VARYINGS_3D}

// Output
out vec4 fragColor;

// Material uniforms
uniform vec3 uBaseColor;
uniform float uRoughness;
uniform float uMetallic;
uniform float uNormalStrength;
uniform float uAOStrength;
uniform float uHeightScale;
uniform vec3 uEmissionColor;
uniform float uEmissionStrength;
uniform float uAlpha;

// Noise parameters
uniform float uNoiseScale;
uniform int uNoiseDetail;
uniform float uSeed;

// Coordinate space
uniform int uCoordSpace;
uniform float uTriplanarBlendExponent;
uniform float uTextureScale;
uniform int uSeamlessTriplanar;

// Animation
uniform float uTime;
uniform int uAnimated;

// IBL
uniform int uEnableIBL;
uniform float uEnvMapIntensity;

// Camera
uniform vec3 cameraPosition;

${TRIPLANAR_GLSL}

${TEXCOORD_GLSL}

${noise4DInclude}

${iblInclude}

// ============================================================================
// Noise Functions (matching CPU SeededNoiseGenerator)
// ============================================================================

// Hash function for noise
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// 3D Gradient noise (Perlin-style)
float gradientNoise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  return mix(mix(mix(dot(hash33(i + vec3(0,0,0)), f - vec3(0,0,0)),
                     dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)),
                     dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)),
                     dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)),
                     dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

// FBM (Fractional Brownian Motion)
float fbm3D(vec3 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    value += amplitude * gradientNoise3D(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// Voronoi noise (3D)
vec3 hash33forVoronoi(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

float voronoi3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float minDist = 1.0;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = hash33forVoronoi(i + neighbor);
        vec3 diff = neighbor + point - f;
        float dist = length(diff);
        minDist = min(minDist, dist);
      }
    }
  }

  return minDist;
}

// Musgrave noise types
float musgraveFBM(vec3 p, float scale, int octaves, float dimension, float lacunarity) {
  float gain = pow(0.5, 2.0 - dimension);
  return fbm3D(p * scale, octaves, lacunarity, gain);
}

// ============================================================================
// Triplanar Noise Wrappers
// ============================================================================

float triplanarFBM(vec3 p, vec3 N, float scale, int octaves) {
  vec3 w = triplanarWeights(N, uTriplanarBlendExponent);
  if (uSeamlessTriplanar > 0) {
    float offsetScale = 0.5;
    float xy = fbm3D((p.xy + p.z * offsetScale) * scale, octaves, 2.0, 0.5);
    float xz = fbm3D((p.xz + p.y * offsetScale) * scale, octaves, 2.0, 0.5);
    float yz = fbm3D((p.yz + p.x * offsetScale) * scale, octaves, 2.0, 0.5);
    return w.z * xy + w.y * xz + w.x * yz;
  }
  float xy = fbm3D(p.xy * scale, octaves, 2.0, 0.5);
  float xz = fbm3D(p.xz * scale, octaves, 2.0, 0.5);
  float yz = fbm3D(p.yz * scale, octaves, 2.0, 0.5);
  return w.z * xy + w.y * xz + w.x * yz;
}

// Animated triplanar FBM (uses 4D noise if animated)
float triplanarFBMAnimated(vec3 p, vec3 N, float scale, int octaves, float time) {
  if (uAnimated > 0) {
    // Use 4D noise for animated evaluation
    vec3 w = triplanarWeights(N, uTriplanarBlendExponent);
    float offsetScale = uSeamlessTriplanar > 0 ? 0.5 : 0.0;
    float xy = fbm4D(vec4((p.xy + p.z * offsetScale) * scale, 0.0, time), octaves, 2.0, 0.5);
    float xz = fbm4D(vec4((p.xz + p.y * offsetScale) * scale, 0.0, time), octaves, 2.0, 0.5);
    float yz = fbm4D(vec4((p.yz + p.x * offsetScale) * scale, 0.0, time), octaves, 2.0, 0.5);
    return w.z * xy + w.y * xz + w.x * yz;
  }
  return triplanarFBM(p, N, scale, octaves);
}

// ============================================================================
// PBR Lighting Functions
// ============================================================================

const float PI = 3.14159265359;

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;
  return a2 / max(denom, 0.0001);
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

// Compute PBR lighting for a single light
vec3 computePBRLight(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness,
                     vec3 lightDir, vec3 lightColor, float attenuation, vec3 F0) {
  vec3 L = lightDir;
  vec3 H = normalize(V + L);

  float NDF = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  vec3 specular = numerator / denominator;

  vec3 kS = F;
  vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);

  float NdotL = max(dot(N, L), 0.0);
  return (kD * albedo / PI + specular) * lightColor * NdotL * attenuation;
}

// ============================================================================
// Main Fragment Shader
// ============================================================================

void main() {
  // Get 3D position and normal
  vec3 pos3D = getTexCoord3D(uCoordSpace, vObjectPosition, vWorldPosition, vTexCoord);
  vec3 N = normalize(vWorldNormal);

  // Evaluate noise using triplanar projection (with animation support)
  float noiseVal = triplanarFBMAnimated(pos3D, N, uNoiseScale, uNoiseDetail, uTime);

  // Base color with noise variation
  float variation = 0.9 + (noiseVal + 1.0) * 0.1;
  vec3 albedo = uBaseColor * variation;

  // Roughness variation
  float roughNoise = triplanarFBM(pos3D * 2.0, N, uNoiseScale * 2.0, max(2, uNoiseDetail - 2));
  float roughness = max(0.04, uRoughness + roughNoise * 0.15);

  // AO from low-frequency noise
  float aoNoise = triplanarFBM(pos3D * 0.5, N, uNoiseScale * 0.5, 3);
  float ao = 1.0 - max(0.0, (aoNoise + 1.0) * 0.5) * uAOStrength * 0.5;

  // Normal perturbation from height field
  float eps = 0.01;
  vec3 pR = pos3D + vec3(eps, 0.0, 0.0);
  vec3 pU = pos3D + vec3(0.0, eps, 0.0);
  vec3 pF = pos3D + vec3(0.0, 0.0, eps);

  float hC = triplanarFBMAnimated(pos3D, N, uNoiseScale, uNoiseDetail, uTime);
  float hR = triplanarFBMAnimated(pR, N, uNoiseScale, uNoiseDetail, uTime);
  float hU = triplanarFBMAnimated(pU, N, uNoiseScale, uNoiseDetail, uTime);
  float hF = triplanarFBMAnimated(pF, N, uNoiseScale, uNoiseDetail, uTime);

  vec3 perturbNormal = normalize(N - vec3(
    (hR - hC) / eps,
    (hU - hC) / eps,
    (hF - hC) / eps
  ) * uNormalStrength);

  // PBR Lighting
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float metallic = uMetallic;

  // F0 (reflectance at normal incidence)
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);

  // Directional light 1 (key light)
  vec3 lightDir1 = normalize(vec3(0.5, 1.0, 0.8));
  vec3 lightColor1 = vec3(1.0) * ao;
  vec3 Lo1 = computePBRLight(perturbNormal, V, albedo, metallic, roughness,
                              lightDir1, lightColor1, 1.0, F0);

  // Fill light (softer, from the opposite side)
  vec3 lightDir2 = normalize(vec3(-0.3, 0.5, -0.6));
  vec3 lightColor2 = vec3(0.3);
  vec3 Lo2 = computePBRLight(perturbNormal, V, albedo, metallic, roughness,
                              lightDir2, lightColor2, 1.0, F0);

  // Point light approximation (from above)
  vec3 pointLightPos = vec3(0.0, 5.0, 0.0);
  vec3 toPointLight = pointLightPos - vWorldPosition;
  float pointDist = length(toPointLight);
  vec3 pointLightDir = toPointLight / max(pointDist, 0.001);
  float pointAttenuation = 1.0 / (1.0 + 0.09 * pointDist + 0.032 * pointDist * pointDist);
  vec3 Lo3 = computePBRLight(perturbNormal, V, albedo, metallic, roughness,
                              pointLightDir, vec3(0.4, 0.38, 0.35), pointAttenuation, F0);

  // Ambient
  vec3 ambient = vec3(0.15) * albedo * ao;

  // IBL approximation
  vec3 ibl = vec3(0.0);
  if (uEnableIBL > 0) {
    ibl = approximateIBL(perturbNormal, V, albedo, metallic, roughness, F0, ao);
  }

  vec3 color = ambient + Lo1 + Lo2 + Lo3 + ibl;

  // Emission
  if (uEmissionStrength > 0.0) {
    float emNoise = (noiseVal + 1.0) * 0.5;
    color += uEmissionColor * uEmissionStrength * emNoise;
  }

  // Tone mapping (Reinhard)
  color = color / (color + vec3(1.0));

  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  fragColor = vec4(color, uAlpha);
}
`;
  }

  private getDisplacementGLSL(
    params: {
      noiseScale: number;
      noiseDetail: number;
    }
  ): string {
    return `
// Displacement function
float displacement(vec3 p, vec3 n) {
  // Triplanar FBM-based displacement for seamless displacement on arbitrary orientations
  vec3 absN = abs(n);
  vec3 w = pow(absN, vec3(8.0));
  float sum = w.x + w.y + w.z;
  w = (sum > 0.0001) ? w / sum : vec3(1.0 / 3.0);

  float scale = ${params.noiseScale.toFixed(1)};

  vec3 hash33d(vec3 pp) {
    pp = vec3(dot(pp, vec3(127.1, 311.7, 74.7)),
             dot(pp, vec3(269.5, 183.3, 246.1)),
             dot(pp, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(pp) * 43758.5453123);
  }

  float gnoise(vec3 pp) {
    vec3 i = floor(pp);
    vec3 f = fract(pp);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dot(hash33d(i + vec3(0,0,0)), f - vec3(0,0,0)),
                       dot(hash33d(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                   mix(dot(hash33d(i + vec3(0,1,0)), f - vec3(0,1,0)),
                       dot(hash33d(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
               mix(mix(dot(hash33d(i + vec3(0,0,1)), f - vec3(0,0,1)),
                       dot(hash33d(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                   mix(dot(hash33d(i + vec3(0,1,1)), f - vec3(0,1,1)),
                       dot(hash33d(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
  }

  float fbmd(vec3 pp) {
    float value = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float maxValue = 0.0;
    for (int i = 0; i < ${Math.min(params.noiseDetail, 8)}; i++) {
      value += amplitude * gnoise(pp * frequency);
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value / maxValue;
  }

  // Offset-blend for seamless displacement
  float offsetScale = 0.5;
  float xy = fbmd((p.xy + p.z * offsetScale) * scale);
  float xz = fbmd((p.xz + p.y * offsetScale) * scale);
  float yz = fbmd((p.yz + p.x * offsetScale) * scale);
  return w.z * xy + w.y * xz + w.x * yz;
}
`;
  }

  /**
   * Update the time uniform for animated materials.
   * Call this in the render loop when the material is animated.
   */
  updateTime(material: THREE.ShaderMaterial, time: number): void {
    if (material.uniforms.uTime) {
      material.uniforms.uTime.value = time;
    }
  }

  /**
   * Update the camera position uniform.
   * Call this when the camera moves.
   */
  updateCamera(material: THREE.ShaderMaterial, camera: THREE.Camera): void {
    if (material.uniforms.cameraPosition) {
      material.uniforms.cameraPosition.value.copy(camera.position);
    }
  }
}
