/**
 * HammeredMetalShader — Per-Type Shader Pipeline for hammered metal
 *
 * Implements a custom THREE.ShaderMaterial for hammered metal with:
 * - Voronoi-based dimple pattern
 * - Variable dimple depth and size
 * - Proper normal map generation for each dimple
 * - Tarnish/patina variation between dimples
 *
 * Phase 2, Item 2: Per-Type Shader Pipelines
 *
 * @module assets/materials/metal
 */

import * as THREE from 'three';
import { createCanvas } from '../../utils/CanvasUtils';
import {
  SIMPLEX_3D_GLSL,
  FBM_GLSL,
} from '../../shaders/common/NoiseGLSL';
import {
  VORONOI_2D_GLSL,
} from '../../shaders/common/VoronoiGLSL';
import { PBR_GLSL } from '../../shaders/common/PBRGLSL';

// ============================================================================
// Types
// ============================================================================

/** Hammered metal configuration */
export interface HammeredMetalConfig {
  /** Scale of the dimple pattern */
  dimpleScale: number;
  /** Minimum dimple size */
  dimpleMinSize: number;
  /** Maximum dimple size */
  dimpleMaxSize: number;
  /** Depth of dimples (0=flat, 1=deep) */
  dimpleDepth: number;
  /** Base color of the metal */
  baseColor: THREE.Color;
  /** Edge tint for Fresnel */
  edgeTint: THREE.Color;
  /** Base roughness */
  baseRoughness: number;
  /** Roughness inside dimples */
  dimpleRoughness: number;
  /** Tarnish/patina intensity (0=none, 1=heavy) */
  tarnishIntensity: number;
  /** Tarnish color */
  tarnishColor: THREE.Color;
  /** Seed for deterministic noise */
  seed: number;
}

/** Default configuration */
const DEFAULT_HAMMERED_METAL_CONFIG: HammeredMetalConfig = {
  dimpleScale: 8.0,
  dimpleMinSize: 0.3,
  dimpleMaxSize: 0.8,
  dimpleDepth: 0.5,
  baseColor: new THREE.Color(0.78, 0.75, 0.70),
  edgeTint: new THREE.Color(0.92, 0.88, 0.85),
  baseRoughness: 0.35,
  dimpleRoughness: 0.55,
  tarnishIntensity: 0.2,
  tarnishColor: new THREE.Color(0.45, 0.40, 0.35),
  seed: 0,
};

// ============================================================================
// GLSL Shaders
// ============================================================================

const HAMMERED_METAL_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HAMMERED_METAL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uBaseColor;
  uniform vec3 uEdgeTint;
  uniform float uDimpleScale;
  uniform float uDimpleMinSize;
  uniform float uDimpleMaxSize;
  uniform float uDimpleDepth;
  uniform float uBaseRoughness;
  uniform float uDimpleRoughness;
  uniform float uTarnishIntensity;
  uniform vec3 uTarnishColor;
  uniform float uSeed;
  uniform vec3 uLightDir;
  uniform vec3 uCameraPosition;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  ${SIMPLEX_3D_GLSL}
  ${FBM_GLSL}
  ${VORONOI_2D_GLSL}
  ${PBR_GLSL}

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCameraPosition - vWorldPosition);

    // --- Voronoi dimple pattern ---
    vec2 voronoiPos = vUv * uDimpleScale + vec2(uSeed * 0.1);
    VoronoiResult2D voronoi = voronoi2D(voronoiPos);

    // Dimple shape: smooth bowl-like depression
    float dimpleRadius = mix(uDimpleMinSize, uDimpleMaxSize,
      hash22_voronoi2d(voronoi.cellId).x);
    float normalizedDist = voronoi.f1 / dimpleRadius;

    // Smooth dimple shape (parabolic)
    float dimple = 1.0 - smoothstep(0.0, 1.0, normalizedDist);
    dimple = dimple * dimple; // Sharper falloff

    // Height displacement for dimple
    float height = -dimple * uDimpleDepth;

    // --- Normal perturbation from dimple ---
    float eps = 0.01;
    vec2 pR = vUv * uDimpleScale + vec2(eps, 0.0) + vec2(uSeed * 0.1);
    vec2 pU = vUv * uDimpleScale + vec2(0.0, eps) + vec2(uSeed * 0.1);
    vec2 pL = vUv * uDimpleScale + vec2(-eps, 0.0) + vec2(uSeed * 0.1);
    vec2 pD = vUv * uDimpleScale + vec2(0.0, -eps) + vec2(uSeed * 0.1);

    float hR = 1.0 - pow(1.0 - smoothstep(0.0, 1.0, voronoi2D(pR).f1 / dimpleRadius), 2.0);
    float hU = 1.0 - pow(1.0 - smoothstep(0.0, 1.0, voronoi2D(pU).f1 / dimpleRadius), 2.0);
    float hL = 1.0 - pow(1.0 - smoothstep(0.0, 1.0, voronoi2D(pL).f1 / dimpleRadius), 2.0);
    float hD = 1.0 - pow(1.0 - smoothstep(0.0, 1.0, voronoi2D(pD).f1 / dimpleRadius), 2.0);

    vec3 perturbNormal = normalize(N - vec3(
      (hR - hL) / (2.0 * eps) * uDimpleDepth * 0.5,
      (hU - hD) / (2.0 * eps) * uDimpleDepth * 0.5,
      0.0
    ));

    // --- Roughness variation ---
    // Dimples are rougher, flat areas are smoother
    float roughness = mix(uBaseRoughness, uDimpleRoughness, dimple);

    // Add micro roughness variation
    roughness += snoise3D(vec3(vUv * 50.0, uSeed)) * 0.03;
    roughness = clamp(roughness, 0.04, 1.0);

    // --- Tarnish/patina between dimples ---
    float tarnishMask = 1.0 - dimple;
    // Tarnish accumulates in the flat areas between dimples
    float tarnishNoise = snoise3D(vec3(vUv * 5.0, uSeed + 10.0)) * 0.5 + 0.5;
    tarnishMask *= tarnishNoise * uTarnishIntensity;

    // --- Color ---
    float cosTheta = max(dot(N, V), 0.0);
    vec3 F0 = uBaseColor;
    vec3 metalColor = mix(uBaseColor, uEdgeTint, pow(1.0 - cosTheta, 5.0) * 0.5);

    // Apply tarnish
    metalColor = mix(metalColor, uTarnishColor, tarnishMask);

    // --- PBR Lighting ---
    vec3 lightDir = normalize(uLightDir);
    vec3 lightColor = vec3(1.0, 0.98, 0.95);

    vec3 Lo = computePBRLight(perturbNormal, V, metalColor, 1.0, roughness,
                              lightDir, lightColor, 1.0, F0);

    // Fill light
    vec3 fillDir = normalize(vec3(-0.3, 0.5, -0.6));
    vec3 fillColor = vec3(0.25, 0.25, 0.27);
    Lo += computePBRLight(perturbNormal, V, metalColor, 1.0, roughness,
                          fillDir, fillColor, 1.0, F0);

    // Ambient
    vec3 ambient = vec3(0.08) * metalColor * (1.0 + pow(1.0 - cosTheta, 5.0) * 0.3);

    vec3 color = ambient + Lo;

    // Tone mapping
    color = color / (color + vec3(1.0));

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// HammeredMetalFactory
// ============================================================================

/**
 * Factory class for creating hammered metal shader materials.
 *
 * Generates THREE.ShaderMaterial instances with Voronoi-based dimple patterns
 * that simulate hammered/coppered metal surfaces.
 *
 * @example
 * ```ts
 * const factory = new HammeredMetalFactory({ seed: 42 });
 * const material = factory.create();
 * ```
 */
export class HammeredMetalFactory {
  private config: HammeredMetalConfig;
  private material: THREE.ShaderMaterial | null = null;

  constructor(config: Partial<HammeredMetalConfig> = {}) {
    this.config = { ...DEFAULT_HAMMERED_METAL_CONFIG, ...config };
  }

  /**
   * Create a hammered metal ShaderMaterial.
   */
  create(config?: Partial<HammeredMetalConfig>): THREE.ShaderMaterial {
    const finalConfig = { ...this.config, ...config };

    const uniforms: Record<string, THREE.IUniform> = {
      uBaseColor: { value: new THREE.Vector3(finalConfig.baseColor.r, finalConfig.baseColor.g, finalConfig.baseColor.b) },
      uEdgeTint: { value: new THREE.Vector3(finalConfig.edgeTint.r, finalConfig.edgeTint.g, finalConfig.edgeTint.b) },
      uDimpleScale: { value: finalConfig.dimpleScale },
      uDimpleMinSize: { value: finalConfig.dimpleMinSize },
      uDimpleMaxSize: { value: finalConfig.dimpleMaxSize },
      uDimpleDepth: { value: finalConfig.dimpleDepth },
      uBaseRoughness: { value: finalConfig.baseRoughness },
      uDimpleRoughness: { value: finalConfig.dimpleRoughness },
      uTarnishIntensity: { value: finalConfig.tarnishIntensity },
      uTarnishColor: { value: new THREE.Vector3(finalConfig.tarnishColor.r, finalConfig.tarnishColor.g, finalConfig.tarnishColor.b) },
      uSeed: { value: finalConfig.seed },
      uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.8).normalize() },
      uCameraPosition: { value: new THREE.Vector3() },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: HAMMERED_METAL_VERTEX_SHADER,
      fragmentShader: HAMMERED_METAL_FRAGMENT_SHADER,
      uniforms,
      side: THREE.FrontSide,
    });

    this.material.name = `HammeredMetal_${finalConfig.seed}`;
    return this.material;
  }

  /**
   * Generate a normal map texture with dimple patterns for MeshPhysicalMaterial.
   */
  generateNormalMap(resolution: number = 512): THREE.CanvasTexture {
    const canvas = createCanvas();
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(resolution, resolution);
    const { dimpleScale, dimpleDepth, seed } = this.config;

    // Height field for normal computation
    const heightField = new Float32Array(resolution * resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const u = x / resolution;
        const v = y / resolution;

        // Simple voronoi approximation for height field
        const scale = dimpleScale;
        const ix = Math.floor(u * scale);
        const iy = Math.floor(v * scale);
        const fx = (u * scale) - ix;
        const fy = (v * scale) - iy;

        let minDist = 1.0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = ix + dx;
            const ny = iy + dy;
            const hash = ((Math.sin(nx * 127.1 + ny * 311.7 + seed) * 43758.5453) % 1 + 1) % 1;
            const hash2 = ((Math.sin(nx * 269.5 + ny * 183.3 + seed) * 43758.5453) % 1 + 1) % 1;
            const px = dx + hash - fx;
            const py = dy + hash2 - fy;
            const dist = Math.sqrt(px * px + py * py);
            minDist = Math.min(minDist, dist);
          }
        }

        // Dimple shape (parabolic)
        const dimple = Math.max(0, 1.0 - minDist);
        heightField[y * resolution + x] = -dimple * dimple * dimpleDepth;
      }
    }

    // Compute normals from height field
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (y * resolution + x) * 4;
        const left = heightField[y * resolution + ((x - 1 + resolution) % resolution)];
        const right = heightField[y * resolution + ((x + 1) % resolution)];
        const up = heightField[((y - 1 + resolution) % resolution) * resolution + x];
        const down = heightField[((y + 1) % resolution) * resolution + x];

        const ndx = (right - left) * 3.0;
        const ndy = (down - up) * 3.0;
        const ndz = 1.0;
        const len = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz);

        imageData.data[idx] = Math.floor(((ndx / len) * 0.5 + 0.5) * 255);
        imageData.data[idx + 1] = Math.floor(((ndy / len) * 0.5 + 0.5) * 255);
        imageData.data[idx + 2] = Math.floor(((ndz / len) * 0.5 + 0.5) * 255);
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  /**
   * Create a MeshPhysicalMaterial with baked dimple normal map.
   */
  createPhysicalMaterial(config?: Partial<HammeredMetalConfig>): THREE.MeshPhysicalMaterial {
    const finalConfig = { ...this.config, ...config };
    const normalMap = this.generateNormalMap(512);

    return new THREE.MeshPhysicalMaterial({
      color: finalConfig.baseColor,
      metalness: 1.0,
      roughness: finalConfig.baseRoughness,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(1.5, 1.5),
      name: `HammeredMetal_Phys_${finalConfig.seed}`,
    });
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
   * Dispose of created materials and textures.
   */
  dispose(): void {
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}
