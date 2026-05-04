/**
 * BrushedMetalShader — Per-Type Shader Pipeline for brushed metal
 *
 * Implements a custom THREE.ShaderMaterial for brushed metal with:
 * - Anisotropic brushing direction (horizontal, vertical, radial, cross-hatched)
 * - Brush line density and variation
 * - Anisotropic GGX BRDF approximation
 * - Noise-driven roughness variation along brush lines
 * - Support for metal types: stainless steel, aluminum, titanium, nickel
 * - Fresnel reflection with IOR for metals
 *
 * Phase 2, Item 2: Per-Type Shader Pipelines
 *
 * @module assets/materials/metal
 */

import * as THREE from 'three';
import { createCanvas } from '../../utils/CanvasUtils';
import {
  SIMPLEX_2D_GLSL,
  VALUE_NOISE_GLSL,
} from '../../shaders/common/NoiseGLSL';
import { PBR_GLSL } from '../../shaders/common/PBRGLSL';

// ============================================================================
// Types
// ============================================================================

/** Brush direction for anisotropic brushing */
export type BrushDirection = 'horizontal' | 'vertical' | 'radial' | 'cross-hatched';

/** Metal type presets */
export type BrushedMetalType = 'stainless_steel' | 'aluminum' | 'titanium' | 'nickel';

/** Brushed metal shader configuration */
export interface BrushedMetalConfig {
  /** Direction of brush lines */
  brushDirection: BrushDirection;
  /** Density of brush lines (higher = finer lines) */
  brushDensity: number;
  /** Variation in brush line intensity */
  brushVariation: number;
  /** Base roughness of the metal */
  baseRoughness: number;
  /** Strength of anisotropic reflection */
  anisotropyStrength: number;
  /** Base color of the metal */
  baseColor: THREE.Color;
  /** Edge tint color (Fresnel reflection color for metals) */
  edgeTint: THREE.Color;
  /** IOR for the metal (affects Fresnel) */
  ior: number;
  /** Seed for deterministic noise */
  seed: number;
}

/** Default configuration */
const DEFAULT_BRUSHED_METAL_CONFIG: BrushedMetalConfig = {
  brushDirection: 'horizontal',
  brushDensity: 80.0,
  brushVariation: 0.3,
  baseRoughness: 0.25,
  anisotropyStrength: 0.8,
  baseColor: new THREE.Color(0.78, 0.78, 0.80),
  edgeTint: new THREE.Color(0.95, 0.93, 0.90),
  ior: 2.5,
  seed: 0,
};

// ============================================================================
// Metal Type Presets
// ============================================================================

const BRUSHED_METAL_PRESETS: Record<BrushedMetalType, Partial<BrushedMetalConfig>> = {
  stainless_steel: {
    baseColor: new THREE.Color(0.78, 0.78, 0.80),
    edgeTint: new THREE.Color(0.95, 0.93, 0.90),
    baseRoughness: 0.25,
    anisotropyStrength: 0.8,
    ior: 2.5,
    brushDensity: 80.0,
  },
  aluminum: {
    baseColor: new THREE.Color(0.91, 0.91, 0.93),
    edgeTint: new THREE.Color(0.98, 0.97, 0.95),
    baseRoughness: 0.3,
    anisotropyStrength: 0.7,
    ior: 1.5,
    brushDensity: 60.0,
  },
  titanium: {
    baseColor: new THREE.Color(0.69, 0.70, 0.72),
    edgeTint: new THREE.Color(0.85, 0.83, 0.88),
    baseRoughness: 0.2,
    anisotropyStrength: 0.85,
    ior: 2.2,
    brushDensity: 90.0,
  },
  nickel: {
    baseColor: new THREE.Color(0.83, 0.81, 0.77),
    edgeTint: new THREE.Color(0.95, 0.92, 0.88),
    baseRoughness: 0.22,
    anisotropyStrength: 0.75,
    ior: 1.8,
    brushDensity: 70.0,
  },
};

// ============================================================================
// GLSL Shaders
// ============================================================================

const BRUSHED_METAL_VERTEX_SHADER = /* glsl */ `
  attribute vec4 tangent;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldTangent;
  varying vec3 vWorldBitangent;

  void main() {
    vUv = uv;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;

    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldTangent = normalize(mat3(modelMatrix) * tangent.xyz);
    vWorldBitangent = normalize(cross(vWorldNormal, vWorldTangent) * tangent.w);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BRUSHED_METAL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uBaseColor;
  uniform vec3 uEdgeTint;
  uniform float uBrushDensity;
  uniform float uBrushVariation;
  uniform float uBaseRoughness;
  uniform float uAnisotropyStrength;
  uniform float uIOR;
  uniform float uSeed;
  uniform float uBrushDirection; // 0=horizontal, 1=vertical, 2=radial, 3=cross-hatched
  uniform vec3 uLightDir;
  uniform vec3 uCameraPosition;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldTangent;
  varying vec3 vWorldBitangent;

  ${SIMPLEX_2D_GLSL}
  ${VALUE_NOISE_GLSL}
  ${PBR_GLSL}

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCameraPosition - vWorldPosition);
    vec3 T = normalize(vWorldTangent);
    vec3 B = normalize(vWorldBitangent);

    // --- Brush line pattern ---
    vec2 brushUV = vUv * uBrushDensity;
    float brushLine = 0.0;

    if (uBrushDirection < 0.5) {
      // Horizontal brush lines
      float line = fract(brushUV.y + snoise2D(vec2(brushUV.x * 0.1, uSeed)) * uBrushVariation);
      brushLine = smoothstep(0.0, 0.15, line) * smoothstep(1.0, 0.85, line);
    } else if (uBrushDirection < 1.5) {
      // Vertical brush lines
      float line = fract(brushUV.x + snoise2D(vec2(brushUV.y * 0.1, uSeed)) * uBrushVariation);
      brushLine = smoothstep(0.0, 0.15, line) * smoothstep(1.0, 0.85, line);
    } else if (uBrushDirection < 2.5) {
      // Radial brush lines
      vec2 center = vec2(0.5);
      vec2 toCenter = vUv - center;
      float angle = atan(toCenter.y, toCenter.x);
      float dist = length(toCenter) * uBrushDensity;
      float radialLine = fract(angle * uBrushDensity * 0.1 + snoise2D(vec2(dist * 0.1, uSeed)) * uBrushVariation);
      brushLine = smoothstep(0.0, 0.15, radialLine) * smoothstep(1.0, 0.85, radialLine);
    } else {
      // Cross-hatched
      float line1 = fract(brushUV.y + snoise2D(vec2(brushUV.x * 0.1, uSeed)) * uBrushVariation);
      float line2 = fract(brushUV.x + snoise2D(vec2(brushUV.y * 0.1, uSeed + 10.0)) * uBrushVariation);
      float b1 = smoothstep(0.0, 0.15, line1) * smoothstep(1.0, 0.85, line1);
      float b2 = smoothstep(0.0, 0.15, line2) * smoothstep(1.0, 0.85, line2);
      brushLine = mix(b1, b2, 0.5);
    }

    // --- Roughness variation along brush lines ---
    float roughnessMod = uBaseRoughness + (1.0 - brushLine) * 0.15;
    roughnessMod = clamp(roughnessMod, 0.04, 1.0);

    // --- Micro roughness variation from noise ---
    float microNoise = snoise2D(vUv * 200.0 + vec2(uSeed)) * 0.02;
    roughnessMod += microNoise;

    // --- Fresnel for metals (colored Fresnel) ---
    float cosTheta = max(dot(N, V), 0.0);
    vec3 F0 = uBaseColor; // For metals, F0 = albedo
    vec3 F = fresnelSchlick(cosTheta, F0);

    // Mix with edge tint at grazing angles
    float fresnelFactor = pow(1.0 - cosTheta, 5.0);
    vec3 metalColor = mix(uBaseColor, uEdgeTint, fresnelFactor * 0.5);

    // --- Anisotropic PBR Lighting ---
    float anisotropy = uAnisotropyStrength;

    // Key light
    vec3 lightDir = normalize(uLightDir);
    vec3 lightColor = vec3(1.0, 0.98, 0.95);
    vec3 Lo = computeAnisoPBRLight(N, V, metalColor, 1.0, roughnessMod,
                                    anisotropy, T, B,
                                    lightDir, lightColor, 1.0, F0);

    // Fill light
    vec3 fillDir = normalize(vec3(-0.3, 0.5, -0.6));
    vec3 fillColor = vec3(0.3, 0.30, 0.32);
    Lo += computeAnisoPBRLight(N, V, metalColor, 1.0, roughnessMod,
                                anisotropy, T, B,
                                fillDir, fillColor, 1.0, F0);

    // Ambient
    vec3 ambient = vec3(0.08) * metalColor * (1.0 + fresnelFactor * 0.5);

    vec3 color = ambient + Lo;

    // Tone mapping
    color = color / (color + vec3(1.0));

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// BrushedMetalFactory
// ============================================================================

/**
 * Factory class for creating brushed metal shader materials.
 *
 * Generates THREE.ShaderMaterial instances with anisotropic brushed metal
 * appearance, supporting multiple brush directions and metal type presets.
 *
 * @example
 * ```ts
 * const factory = new BrushedMetalFactory('stainless_steel', 42);
 * const material = factory.create({ brushDirection: 'horizontal' });
 * ```
 */
export class BrushedMetalFactory {
  private config: BrushedMetalConfig;
  private material: THREE.ShaderMaterial | null = null;

  constructor(metalType: BrushedMetalType = 'stainless_steel', seed: number = 0) {
    const preset = BRUSHED_METAL_PRESETS[metalType] || {};
    this.config = {
      ...DEFAULT_BRUSHED_METAL_CONFIG,
      ...preset,
      seed,
    };
  }

  /**
   * Create a brushed metal ShaderMaterial.
   */
  create(config?: Partial<BrushedMetalConfig>): THREE.ShaderMaterial {
    const finalConfig = { ...this.config, ...config };

    // Convert brush direction to float
    const dirMap: Record<BrushDirection, number> = {
      horizontal: 0,
      vertical: 1,
      radial: 2,
      'cross-hatched': 3,
    };

    const uniforms: Record<string, THREE.IUniform> = {
      uBaseColor: { value: new THREE.Vector3(finalConfig.baseColor.r, finalConfig.baseColor.g, finalConfig.baseColor.b) },
      uEdgeTint: { value: new THREE.Vector3(finalConfig.edgeTint.r, finalConfig.edgeTint.g, finalConfig.edgeTint.b) },
      uBrushDensity: { value: finalConfig.brushDensity },
      uBrushVariation: { value: finalConfig.brushVariation },
      uBaseRoughness: { value: finalConfig.baseRoughness },
      uAnisotropyStrength: { value: finalConfig.anisotropyStrength },
      uIOR: { value: finalConfig.ior },
      uSeed: { value: finalConfig.seed },
      uBrushDirection: { value: dirMap[finalConfig.brushDirection] },
      uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.8).normalize() },
      uCameraPosition: { value: new THREE.Vector3() },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: BRUSHED_METAL_VERTEX_SHADER,
      fragmentShader: BRUSHED_METAL_FRAGMENT_SHADER,
      uniforms,
      side: THREE.FrontSide,
    });

    this.material.name = `BrushedMetal_${finalConfig.seed}`;
    return this.material;
  }

  /**
   * Create a MeshPhysicalMaterial with anisotropy for native Three.js rendering.
   * Uses the brush direction encoded in tangent-space normal map.
   */
  createPhysicalMaterial(config?: Partial<BrushedMetalConfig>): THREE.MeshPhysicalMaterial {
    const finalConfig = { ...this.config, ...config };
    const normalMap = this.generateNormalMap(512);

    return new THREE.MeshPhysicalMaterial({
      color: finalConfig.baseColor,
      metalness: 1.0,
      roughness: finalConfig.baseRoughness,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
      anisotropy: finalConfig.anisotropyStrength,
      anisotropyRotation: finalConfig.brushDirection === 'vertical' ? Math.PI / 2 : 0,
      name: `BrushedMetal_Phys_${finalConfig.seed}`,
    });
  }

  /**
   * Generate a normal map texture with brush direction encoded as tangent-space normals.
   */
  generateNormalMap(resolution: number = 512): THREE.CanvasTexture {
    const canvas = createCanvas();
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(resolution, resolution);
    const { brushDensity, brushVariation, brushDirection, seed } = this.config;

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const u = x / resolution;
        const v = y / resolution;
        const idx = (y * resolution + x) * 4;

        // Generate brush line perturbation
        let nx = 0;
        let ny = 0;

        const lineScale = brushDensity / 10;

        if (brushDirection === 'horizontal') {
          // Horizontal lines perturb Y normal
          const line = Math.sin(v * brushDensity * Math.PI * 2 + Math.sin(u * lineScale) * brushVariation * 10);
          ny = line * 0.02;
        } else if (brushDirection === 'vertical') {
          // Vertical lines perturb X normal
          const line = Math.sin(u * brushDensity * Math.PI * 2 + Math.sin(v * lineScale) * brushVariation * 10);
          nx = line * 0.02;
        } else if (brushDirection === 'radial') {
          // Radial lines perturb tangent to circle
          const cx = 0.5;
          const cy = 0.5;
          const dx = u - cx;
          const dy = v - cy;
          const angle = Math.atan2(dy, dx);
          const dist = Math.sqrt(dx * dx + dy * dy);
          const line = Math.sin(angle * brushDensity * 0.5 + Math.sin(dist * lineScale) * brushVariation * 10);
          nx = line * 0.02 * -Math.sin(angle);
          ny = line * 0.02 * Math.cos(angle);
        } else {
          // Cross-hatched
          const line1 = Math.sin(v * brushDensity * Math.PI * 2 + Math.sin(u * lineScale) * brushVariation * 10);
          const line2 = Math.sin(u * brushDensity * Math.PI * 2 + Math.sin(v * lineScale) * brushVariation * 10);
          nx = line2 * 0.015;
          ny = line1 * 0.015;
        }

        // Encode as tangent-space normal [0,1] range
        const nxf = nx * 0.5 + 0.5;
        const nyf = ny * 0.5 + 0.5;
        const nzf = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.5 + 0.5;

        imageData.data[idx] = Math.floor(nxf * 255);
        imageData.data[idx + 1] = Math.floor(nyf * 255);
        imageData.data[idx + 2] = Math.floor(nzf * 255);
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
   * Update the camera position for proper PBR lighting.
   */
  updateCamera(camera: THREE.Camera): void {
    if (this.material && this.material.uniforms.uCameraPosition) {
      this.material.uniforms.uCameraPosition.value.copy(camera.position);
    }
  }

  /**
   * Get the preset for a given metal type.
   */
  static getPreset(metalType: BrushedMetalType): Partial<BrushedMetalConfig> {
    return BRUSHED_METAL_PRESETS[metalType] || {};
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
