/**
 * RuntimeMaterialBuilder - Converts node graphs into THREE.ShaderMaterial
 * with full GLSL shader pipeline for 3D material evaluation.
 *
 * This is the main entry point for creating GPU-evaluated 3D materials.
 * It takes a NodeGraph definition and produces a THREE.ShaderMaterial
 * that evaluates the material per-pixel in 3D texture space using:
 * - Triplanar projection for seamless mapping on arbitrary mesh orientations
 * - 3D/4D noise evaluation (3D position + time/seed uniform)
 * - Per-pixel displacement in the vertex shader
 * - Full PBR lighting with multi-light support (directional + point + area)
 * - IBL environment map approximation
 *
 * The builder traverses the node graph, generates GLSL code for each node type,
 * and assembles a complete vertex + fragment shader pair with proper uniforms.
 *
 * Compatible with both forward and deferred rendering pipelines.
 */

import * as THREE from 'three';
import type { NodeGraph } from '../../core/nodes/execution/NodeEvaluator';
import type { NodeInstance, NodeLink } from '../../core/nodes/core/types';
import {
  TRIPLANAR_GLSL,
  TEXCOORD_GLSL,
  NOISE_4D_GLSL,
  IBL_GLSL,
  VERTEX_SHADER_3D,
  FRAGMENT_VARYINGS_3D,
  buildVertexShaderWithDisplacement,
} from './shaders/TriplanarProjection';
import { CoordinateSpace, type Material3DConfig, DEFAULT_3D_CONFIG } from './Material3DEvaluator';

// ============================================================================
// Types
// ============================================================================

/** Configuration for RuntimeMaterialBuilder */
export interface NodeGraph3DConfig extends Material3DConfig {
  /** Whether to enable IBL (image-based lighting) environment map */
  enableIBL: boolean;
  /** Maximum number of point lights */
  maxPointLights: number;
  /** Maximum number of directional lights */
  maxDirectionalLights: number;
  /** Whether to generate debug output (visualize normals, UVs, etc.) */
  debugMode: 'none' | 'normals' | 'uv' | 'noise';
}

/** Default config for the builder */
export const DEFAULT_NODEGRAPH_3D_CONFIG: NodeGraph3DConfig = {
  ...DEFAULT_3D_CONFIG,
  enableIBL: true,
  maxPointLights: 4,
  maxDirectionalLights: 3,
  debugMode: 'none',
};

/** Internal representation of a compiled node */
interface CompiledNode {
  glslCode: string;
  outputVar: string;
  outputType: 'float' | 'vec2' | 'vec3' | 'vec4';
  uniforms: Map<string, { type: string; value: any }>;
  functions: Set<string>;
}

/** Shader compilation result */
interface ShaderBuildResult {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  warnings: string[];
  errors: string[];
}

// ============================================================================
// GLSL Noise Library (matches CPU SeededNoiseGenerator)
// ============================================================================

const NOISE_GLSL = `
// ============================================================================
// Noise Functions (matching CPU SeededNoiseGenerator)
// ============================================================================

vec3 _hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

vec2 _hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float _hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

// 3D Perlin gradient noise
float perlinNoise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  return mix(mix(mix(dot(_hash33(i + vec3(0,0,0)), f - vec3(0,0,0)),
                     dot(_hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(_hash33(i + vec3(0,1,0)), f - vec3(0,1,0)),
                     dot(_hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(_hash33(i + vec3(0,0,1)), f - vec3(0,0,1)),
                     dot(_hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(_hash33(i + vec3(0,1,1)), f - vec3(0,1,1)),
                     dot(_hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

// 2D Perlin gradient noise
float perlinNoise2D(vec2 p) {
  vec3 p3 = vec3(p, 0.0);
  return perlinNoise3D(p3);
}

// FBM (Fractional Brownian Motion) - 3D
float fbm3D(vec3 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    value += amplitude * perlinNoise3D(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// FBM - 2D
float fbm2D(vec2 p, int octaves, float lacunarity, float gain) {
  return fbm3D(vec3(p, 0.0), octaves, lacunarity, gain);
}

// Ridged Multifractal - 3D
float ridgedMultifractal3D(vec3 p, int octaves, float lacunarity, float gain, float offset, float roughness) {
  float signal = 0.0;
  float weight = 1.0;
  float frequency = 1.0;
  float amplitude = 1.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    float n = offset - abs(perlinNoise3D(p * frequency));
    n *= weight;
    signal += n * amplitude;
    weight = clamp(n * gain, 0.0, 1.0);
    frequency *= lacunarity;
    amplitude *= gain;
  }

  float maxSignal = 1.0 / (1.0 - gain);
  return clamp(signal / maxSignal, 0.0, 1.0) * roughness;
}

// Turbulence - 3D
float turbulence3D(vec3 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    value += amplitude * abs(perlinNoise3D(p * frequency));
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// Voronoi noise - 3D
float voronoi3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float minDist = 1.0;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = _hash33(i + neighbor) * 0.5 + 0.5;
        vec3 diff = neighbor + point - f;
        float dist = length(diff);
        minDist = min(minDist, dist);
      }
    }
  }

  return minDist;
}

// Voronoi noise - 2D
float voronoi2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = _hash22(i + neighbor);
      vec2 diff = neighbor + point - f;
      float dist = length(diff);
      minDist = min(minDist, dist);
    }
  }

  return minDist;
}

// Musgrave noise (delegates to FBM with dimension-based gain)
float musgraveFBM(vec3 p, float dimension, float lacunarity, int octaves) {
  float gain = pow(0.5, 2.0 - dimension);
  return fbm3D(p, octaves, lacunarity, gain);
}

float musgraveRidged(vec3 p, float dimension, float lacunarity, int octaves, float offset, float gain) {
  return ridgedMultifractal3D(p, octaves, lacunarity, gain, offset, 1.0);
}

float musgraveHetero(vec3 p, float dimension, float lacunarity, int octaves, float offset) {
  float gain = pow(0.5, 2.0 - dimension);
  float value = offset + perlinNoise3D(p);
  float amplitude = 1.0;
  float frequency = 1.0;

  for (int i = 1; i < 16; i++) {
    if (i >= octaves) break;
    frequency *= lacunarity;
    amplitude *= gain;
    value += (offset + amplitude * perlinNoise3D(p * frequency)) * value;
  }

  return value;
}

// Domain warping
vec3 domainWarp3D(vec3 p, float warpStrength, float warpScale, int octaves) {
  float qx = fbm3D(p * warpScale, octaves, 2.0, 0.5);
  float qy = fbm3D(p * warpScale + vec3(5.2, 1.3, 2.8), octaves, 2.0, 0.5);
  float qz = fbm3D(p * warpScale + vec3(9.1, 3.7, 7.4), octaves, 2.0, 0.5);
  return p + vec3(qx, qy, qz) * warpStrength;
}
`;

// ============================================================================
// PBR Lighting GLSL
// ============================================================================

const PBR_LIGHTING_GLSL = `
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
vec3 computePBRLight(
  vec3 N, vec3 V,
  vec3 albedo, float metallic, float roughness,
  vec3 lightDir, vec3 lightColor, float attenuation,
  vec3 F0
) {
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

// Approximate IBL without cubemap
vec3 approximateIBL(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness, vec3 F0, float ao) {
  vec3 F = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);
  vec3 kD = (1.0 - F) * (1.0 - metallic);

  // Approximate diffuse IBL (ambient hemisphere)
  vec3 irradiance = vec3(0.3, 0.3, 0.35) * (0.5 + 0.5 * dot(N, vec3(0.0, 1.0, 0.0)));
  vec3 diffuse = kD * irradiance * albedo;

  // Approximate specular IBL
  vec3 R = reflect(-V, N);
  vec3 prefilteredColor = vec3(0.2, 0.2, 0.25) * (0.5 + 0.5 * dot(R, vec3(0.0, 1.0, 0.0)));

  // BRDF LUT approximation (split-sum)
  vec2 envBRDF = vec2(0.04, 0.0);
  if (roughness < 0.5) envBRDF.x = 0.1;
  vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);

  return (diffuse + specular) * ao;
}
`;

// ============================================================================
// RuntimeMaterialBuilder
// ============================================================================

export class RuntimeMaterialBuilder {
  private config: NodeGraph3DConfig;
  private uniforms: Map<string, { type: string; value: any }>;
  private functions: Set<string>;
  private warnings: string[];
  private errors: string[];
  private varCounter: number;
  private nodeOutputs: Map<string, CompiledNode>;

  constructor(config: Partial<NodeGraph3DConfig> = {}) {
    this.config = { ...DEFAULT_NODEGRAPH_3D_CONFIG, ...config };
    this.uniforms = new Map();
    this.functions = new Set();
    this.warnings = [];
    this.errors = [];
    this.varCounter = 0;
    this.nodeOutputs = new Map();
  }

  /**
   * Build a THREE.ShaderMaterial from a node graph.
   * This is the main entry point for 3D material creation.
   *
   * @param graph - The node graph defining the material
   * @param config - Optional configuration overrides
   * @returns THREE.ShaderMaterial with 3D evaluation
   */
  buildFromNodeGraph(
    graph: NodeGraph,
    config?: Partial<NodeGraph3DConfig>
  ): THREE.ShaderMaterial {
    // Reset state
    this.uniforms = new Map();
    this.functions = new Set();
    this.warnings = [];
    this.errors = [];
    this.varCounter = 0;
    this.nodeOutputs = new Map();

    // Merge config
    const cfg = config ? { ...this.config, ...config } : this.config;

    // Build shader
    const result = this.buildShaders(graph, cfg);

    if (result.errors.length > 0) {
      console.warn('RuntimeMaterialBuilder: Errors during shader build:', result.errors);
      // Return a fallback material
      return this.createFallbackMaterial();
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: result.vertexShader,
      fragmentShader: result.fragmentShader,
      uniforms: result.uniforms,
      side: THREE.FrontSide,
      transparent: false,
      glslVersion: THREE.GLSL3,
    });

    material.name = `Runtime3D_${Date.now()}`;
    return material;
  }

  // ==========================================================================
  // Shader Building Pipeline
  // ==========================================================================

  private buildShaders(graph: NodeGraph, cfg: NodeGraph3DConfig): ShaderBuildResult {
    try {
      // 1. Topological sort the nodes
      const sortedNodeIds = this.topologicalSort(graph);

      // 2. Register global uniforms
      this.registerGlobalUniforms(cfg);

      // 3. Compile each node to GLSL
      const nodeGLSL: string[] = [];
      for (const nodeId of sortedNodeIds) {
        const node = graph.nodes.get(nodeId);
        if (!node) continue;

        const compiled = this.compileNode(node, graph, cfg);
        if (compiled) {
          this.nodeOutputs.set(nodeId, compiled);
          nodeGLSL.push(compiled.glslCode);
        }
      }

      // 4. Find the output node and extract final values
      const outputNode = this.findOutputNode(graph);
      if (!outputNode) {
        this.errors.push('No output node found in graph');
        return this.createErrorResult();
      }

      // 5. Get BSDF parameters from the node graph
      const bsdfGLSL = this.assembleBSDFOutput(outputNode, graph, cfg);

      // 6. Build vertex shader
      const vertexShader = cfg.enableDisplacement
        ? buildVertexShaderWithDisplacement(this.getDisplacementGLSL(outputNode, graph, cfg))
        : VERTEX_SHADER_3D;

      // 7. Build fragment shader
      const fragmentShader = this.buildFragmentShader(nodeGLSL, bsdfGLSL, cfg);

      // 8. Build uniforms object
      const uniformsObj = this.buildUniformsObject();

      return {
        vertexShader,
        fragmentShader,
        uniforms: uniformsObj,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    } catch (error: any) {
      this.errors.push(error.message);
      return this.createErrorResult();
    }
  }

  // ==========================================================================
  // Node Compilation (Node Type → GLSL)
  // ==========================================================================

  private compileNode(
    node: NodeInstance,
    _graph: NodeGraph,
    _cfg: NodeGraph3DConfig
  ): CompiledNode | null {
    const nodeType = this.normalizeNodeType(node.type);
    const varName = `n${this.varCounter++}_${nodeType}`;

    switch (nodeType) {
      // ── Texture Nodes ──
      case 'noise_texture':
        return this.compileNoiseTexture(node, varName);
      case 'voronoi_texture':
        return this.compileVoronoiTexture(node, varName);
      case 'musgrave_texture':
        return this.compileMusgraveTexture(node, varName);
      case 'gradient_texture':
        return this.compileGradientTexture(node, varName);
      case 'brick_texture':
        return this.compileBrickTexture(node, varName);
      case 'checker_texture':
        return this.compileCheckerTexture(node, varName);
      case 'magic_texture':
        return this.compileMagicTexture(node, varName);
      case 'image_texture':
        return this.compileImageTexture(node, varName);

      // ── Color Nodes ──
      case 'mix_rgb':
        return this.compileMixRGB(node, varName);
      case 'color_ramp':
        return this.compileColorRamp(node, varName);
      case 'hue_saturation':
        return this.compileHueSaturation(node, varName);
      case 'invert':
        return this.compileInvert(node, varName);
      case 'bright_contrast':
        return this.compileBrightContrast(node, varName);

      // ── Math Nodes ──
      case 'math':
        return this.compileMath(node, varName);
      case 'vector_math':
        return this.compileVectorMath(node, varName);

      // ── Vector Nodes ──
      case 'mapping':
        return this.compileMapping(node, varName);
      case 'combine_xyz':
        return this.compileCombineXYZ(node, varName);
      case 'separate_xyz':
        return this.compileSeparateXYZ(node, varName);
      case 'bump':
        return this.compileBump(node, varName);
      case 'normal_map':
        return this.compileNormalMap(node, varName);

      // ── Shader Nodes ──
      case 'principled_bsdf':
        return this.compilePrincipledBSDF(node, varName);
      case 'emission':
        return this.compileEmission(node, varName);
      case 'mix_shader':
        return this.compileMixShader(node, varName);
      case 'add_shader':
        return this.compileAddShader(node, varName);

      // ── Input Nodes ──
      case 'texture_coordinate':
        return this.compileTextureCoordinate(node, varName);
      case 'value':
        return this.compileValue(node, varName);
      case 'rgb':
        return this.compileRGB(node, varName);

      // ── Output Nodes ──
      case 'material_output':
        return this.compileMaterialOutput(node, varName);

      default:
        this.warnings.push(`Unknown node type "${node.type}", skipping`);
        return null;
    }
  }

  // ── Texture Node Compilers ──

  private compileNoiseTexture(node: NodeInstance, varName: string): CompiledNode {
    const scale = this.getNodeSetting(node, 'scale', 5.0);
    const detail = this.getNodeSetting(node, 'detail', 2);
    const roughness = this.getNodeSetting(node, 'roughness', 0.5);
    const distortion = this.getNodeSetting(node, 'distortion', 0.0);

    this.addUniform(`${varName}_scale`, 'float', scale);
    this.addUniform(`${varName}_detail`, 'int', detail);

    const glslCode = `
  // Noise Texture: ${node.id}
  float ${varName}_base = fbm3D(pos3D * ${varName}_scale, ${varName}_detail, 2.0, ${roughness.toFixed(2)});
  ${distortion > 0 ? `float ${varName}_dist = fbm3D((pos3D + ${varName}_base * ${distortion.toFixed(2)}) * ${varName}_scale, ${varName}_detail, 2.0, ${roughness.toFixed(2)});` : ''}
  float ${varName}_fac = ${distortion > 0 ? `${varName}_dist` : `${varName}_base`};
  vec3 ${varName}_color = vec3(${varName}_fac * 0.5 + 0.5);
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(['fbm3D']),
    };
  }

  private compileVoronoiTexture(node: NodeInstance, varName: string): CompiledNode {
    const scale = this.getNodeSetting(node, 'scale', 5.0);

    this.addUniform(`${varName}_scale`, 'float', scale);

    const glslCode = `
  // Voronoi Texture: ${node.id}
  float ${varName}_fac = voronoi3D(pos3D * ${varName}_scale);
  vec3 ${varName}_color = vec3(${varName}_fac);
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(['voronoi3D']),
    };
  }

  private compileMusgraveTexture(node: NodeInstance, varName: string): CompiledNode {
    const scale = this.getNodeSetting(node, 'scale', 5.0);
    const detail = this.getNodeSetting(node, 'detail', 2);
    const dimension = this.getNodeSetting(node, 'dimension', 2.0);
    const lacunarity = this.getNodeSetting(node, 'lacunarity', 2.0);
    const musgraveType = this.getNodeSetting(node, 'musgraveType', 'fbm');

    this.addUniform(`${varName}_scale`, 'float', scale);
    this.addUniform(`${varName}_detail`, 'int', detail);
    this.addUniform(`${varName}_dimension`, 'float', dimension);
    this.addUniform(`${varName}_lacunarity`, 'float', lacunarity);

    let noiseCall: string;
    switch (musgraveType) {
      case 'ridged':
        noiseCall = `musgraveRidged(pos3D * ${varName}_scale, ${varName}_dimension, ${varName}_lacunarity, ${varName}_detail, 1.0, 0.5)`;
        break;
      case 'hetero':
        noiseCall = `musgraveHetero(pos3D * ${varName}_scale, ${varName}_dimension, ${varName}_lacunarity, ${varName}_detail, 1.0)`;
        break;
      default: // 'fbm'
        noiseCall = `musgraveFBM(pos3D * ${varName}_scale, ${varName}_dimension, ${varName}_lacunarity, ${varName}_detail)`;
    }

    const glslCode = `
  // Musgrave Texture: ${node.id}
  float ${varName}_fac = ${noiseCall};
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileGradientTexture(node: NodeInstance, varName: string): CompiledNode {
    const gradientType = this.getNodeSetting(node, 'gradientType', 'linear');

    let glslExpr: string;
    switch (gradientType) {
      case 'quadratic':
        glslExpr = 'pos3D.x * pos3D.x';
        break;
      case 'spherical':
        glslExpr = 'length(pos3D)';
        break;
      case 'radial':
        glslExpr = 'atan(pos3D.y, pos3D.x) / (2.0 * PI) + 0.5';
        break;
      default: // 'linear'
        glslExpr = 'pos3D.x';
    }

    const glslCode = `
  // Gradient Texture: ${node.id}
  float ${varName}_fac = clamp(${glslExpr}, 0.0, 1.0);
  vec3 ${varName}_color = vec3(${varName}_fac);
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileBrickTexture(node: NodeInstance, varName: string): CompiledNode {
    const scale = this.getNodeSetting(node, 'scale', 5.0);
    const mortarSize = this.getNodeSetting(node, 'mortarSize', 0.02);
    const brickWidth = this.getNodeSetting(node, 'brickWidth', 0.5);
    const brickHeight = this.getNodeSetting(node, 'brickHeight', 0.25);

    this.addUniform(`${varName}_scale`, 'float', scale);
    this.addUniform(`${varName}_mortarSize`, 'float', mortarSize);

    const glslCode = `
  // Brick Texture: ${node.id}
  vec2 ${varName}_uv = pos3D.xz * ${varName}_scale;
  vec2 ${varName}_brickSize = vec2(${brickWidth.toFixed(3)}, ${brickHeight.toFixed(3)});
  vec2 ${varName}_bi = floor(${varName}_uv / ${varName}_brickSize);
  vec2 ${varName}_bf = fract(${varName}_uv / ${varName}_brickSize);
  // Offset odd rows
  if (mod(${varName}_bi.y, 2.0) > 0.5) {
    ${varName}_bf.x += 0.5;
    if (${varName}_bf.x > 1.0) { ${varName}_bf.x -= 1.0; ${varName}_bi.x += 1.0; }
  }
  float ${varName}_mortar = step(${varName}_mortarSize, ${varName}_bf.x) * step(${varName}_mortarSize, ${varName}_bf.y)
                          * step(${varName}_bf.x, 1.0 - ${varName}_mortarSize) * step(${varName}_bf.y, 1.0 - ${varName}_mortarSize);
  float ${varName}_fac = ${varName}_mortar;
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileCheckerTexture(node: NodeInstance, varName: string): CompiledNode {
    const scale = this.getNodeSetting(node, 'scale', 5.0);

    this.addUniform(`${varName}_scale`, 'float', scale);

    const glslCode = `
  // Checker Texture: ${node.id}
  vec3 ${varName}_p = floor(pos3D * ${varName}_scale);
  float ${varName}_fac = mod(${varName}_p.x + ${varName}_p.y + ${varName}_p.z, 2.0);
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileMagicTexture(node: NodeInstance, varName: string): CompiledNode {
    const scale = this.getNodeSetting(node, 'scale', 5.0);
    const distortion = this.getNodeSetting(node, 'distortion', 2.0);

    this.addUniform(`${varName}_scale`, 'float', scale);

    const glslCode = `
  // Magic Texture: ${node.id}
  vec3 ${varName}_p = pos3D * ${varName}_scale;
  float ${varName}_r = (sin(${varName}_p.x + sin(${varName}_p.y + ${distortion.toFixed(2)} * sin(${varName}_p.z))) + 1.0) * 0.5;
  float ${varName}_g = (sin(${varName}_p.y + sin(${varName}_p.z + ${distortion.toFixed(2)} * sin(${varName}_p.x))) + 1.0) * 0.5;
  float ${varName}_b = (sin(${varName}_p.z + sin(${varName}_p.x + ${distortion.toFixed(2)} * sin(${varName}_p.y))) + 1.0) * 0.5;
  vec3 ${varName}_color = vec3(${varName}_r, ${varName}_g, ${varName}_b);
  float ${varName}_fac = dot(${varName}_color, vec3(0.299, 0.587, 0.114));
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileImageTexture(node: NodeInstance, varName: string): CompiledNode {
    // Image textures need a sampler2D uniform
    this.addUniform(`${varName}_tex`, 'sampler2D', null);
    this.addUniform(`${varName}_useTexture`, 'int', 0);

    const glslCode = `
  // Image Texture: ${node.id}
  // For 3D evaluation, image textures use triplanar projection
  vec4 ${varName}_sample = ${varName}_useTexture > 0
    ? triplanarTexture(${varName}_tex, pos3D, N, 1.0, uTriplanarBlendExponent)
    : vec4(0.5, 0.5, 0.5, 1.0);
  vec3 ${varName}_color = ${varName}_sample.rgb;
  float ${varName}_alpha = ${varName}_sample.a;
  float ${varName}_fac = dot(${varName}_color, vec3(0.299, 0.587, 0.114));
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(['triplanarTexture']),
    };
  }

  // ── Color Node Compilers ──

  private compileMixRGB(node: NodeInstance, varName: string): CompiledNode {
    const factor = this.getNodeSetting(node, 'factor', 0.5);
    const blendType = this.getNodeSetting(node, 'blendType', 'mix');

    this.addUniform(`${varName}_factor`, 'float', factor);

    let blendExpr: string;
    switch (blendType) {
      case 'add':
        blendExpr = `${varName}_c1 + ${varName}_c2`;
        break;
      case 'multiply':
        blendExpr = `${varName}_c1 * ${varName}_c2`;
        break;
      case 'screen':
        blendExpr = `1.0 - (1.0 - ${varName}_c1) * (1.0 - ${varName}_c2)`;
        break;
      case 'subtract':
        blendExpr = `${varName}_c1 - ${varName}_c2`;
        break;
      default: // 'mix'
        blendExpr = `mix(${varName}_c1, ${varName}_c2, ${varName}_factor)`;
    }

    const glslCode = `
  // Mix RGB: ${node.id}
  vec3 ${varName}_c1 = vec3(0.5); // Default, will be overridden by connections
  vec3 ${varName}_c2 = vec3(0.5);
  vec3 ${varName}_color = ${blendExpr};
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileColorRamp(node: NodeInstance, varName: string): CompiledNode {
    const stops = this.getNodeSetting(node, 'stops', [
      { position: 0, color: { r: 0, g: 0, b: 0 } },
      { position: 1, color: { r: 1, g: 1, b: 1 } },
    ]);

    // Build GLSL color ramp code
    const rampStops = Array.isArray(stops) ? stops : [
      { position: 0, color: { r: 0, g: 0, b: 0 } },
      { position: 1, color: { r: 1, g: 1, b: 1 } },
    ];

    let rampCode = '';
    for (const stop of rampStops) {
      const pos = typeof stop.position === 'number' ? stop.position : 0;
      const c = stop.color || { r: 0, g: 0, b: 0 };
      this.addUniform(`${varName}_stop_${pos.toFixed(2)}`, 'vec3', new THREE.Vector3(c.r, c.g, c.b));
      rampCode += `  if (fac <= ${pos.toFixed(4)}) return ${varName}_stop_${pos.toFixed(2)};\n`;
    }

    const lastStopPos = rampStops[rampStops.length - 1]?.position?.toFixed(2) ?? '1.00';

    const glslCode = `
  // Color Ramp: ${node.id}
  vec3 ${varName}_ramp(float fac) {
    fac = clamp(fac, 0.0, 1.0);
${rampCode}
    return ${varName}_stop_${lastStopPos};
  }
  float ${varName}_fac_in = 0.5; // Default, overridden by connection
  vec3 ${varName}_color = ${varName}_ramp(${varName}_fac_in);
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileHueSaturation(node: NodeInstance, varName: string): CompiledNode {
    const hue = this.getNodeSetting(node, 'hue', 0.5);
    const saturation = this.getNodeSetting(node, 'saturation', 1.0);
    const value = this.getNodeSetting(node, 'value', 1.0);

    const hueShift = (hue - 0.5).toFixed(3);
    const satShift = (saturation - 1).toFixed(3);
    const valShift = (value - 1).toFixed(3);

    const glslCode = `
  // Hue/Saturation: ${node.id}
  vec3 ${varName}_input = vec3(0.5); // Default, overridden by connection
  // Approximate HSV adjustment in GLSL
  vec3 ${varName}_hsv = ${varName}_input;
  ${varName}_hsv = clamp(${varName}_hsv + vec3(${hueShift}, ${satShift}, ${valShift}), 0.0, 1.0);
  vec3 ${varName}_color = ${varName}_hsv;
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileInvert(node: NodeInstance, varName: string): CompiledNode {
    const factor = this.getNodeSetting(node, 'factor', 1.0);

    const glslCode = `
  // Invert: ${node.id}
  vec3 ${varName}_input = vec3(0.5);
  vec3 ${varName}_color = mix(${varName}_input, 1.0 - ${varName}_input, ${factor.toFixed(3)});
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileBrightContrast(node: NodeInstance, varName: string): CompiledNode {
    const bright = this.getNodeSetting(node, 'bright', 0.0);
    const contrast = this.getNodeSetting(node, 'contrast', 0.0);

    const glslCode = `
  // Bright/Contrast: ${node.id}
  vec3 ${varName}_input = vec3(0.5);
  vec3 ${varName}_color = (${varName}_input + ${(bright.toFixed(3))}) * ${(1 + contrast).toFixed(3)};
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  // ── Math Node Compilers ──

  private compileMath(node: NodeInstance, varName: string): CompiledNode {
    const operation = this.getNodeSetting(node, 'operation', 'add');

    let expr: string;
    switch (operation) {
      case 'add': expr = 'v1 + v2'; break;
      case 'subtract': expr = 'v1 - v2'; break;
      case 'multiply': expr = 'v1 * v2'; break;
      case 'divide': expr = 'v2 != 0.0 ? v1 / v2 : 0.0'; break;
      case 'power': expr = 'pow(v1, v2)'; break;
      case 'sqrt': expr = 'sqrt(max(0.0, v1))'; break;
      case 'abs': expr = 'abs(v1)'; break;
      case 'min': expr = 'min(v1, v2)'; break;
      case 'max': expr = 'max(v1, v2)'; break;
      case 'sin': expr = 'sin(v1)'; break;
      case 'cos': expr = 'cos(v1)'; break;
      case 'tan': expr = 'tan(v1)'; break;
      case 'modulo': expr = 'v2 != 0.0 ? mod(v1, v2) : 0.0'; break;
      case 'floor': expr = 'floor(v1)'; break;
      case 'ceil': expr = 'ceil(v1)'; break;
      case 'round': expr = 'floor(v1 + 0.5)'; break;
      case 'clamp': expr = 'clamp(v1, 0.0, 1.0)'; break;
      default: expr = 'v1';
    }

    const glslCode = `
  // Math: ${node.id} (${operation})
  float ${varName}_v1 = 0.0; // Default, overridden by connections
  float ${varName}_v2 = 0.0;
  float ${varName}_value = ${expr};
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileVectorMath(node: NodeInstance, varName: string): CompiledNode {
    const operation = this.getNodeSetting(node, 'operation', 'add');

    let expr: string;
    switch (operation) {
      case 'add': expr = 'v1 + v2'; break;
      case 'subtract': expr = 'v1 - v2'; break;
      case 'multiply': expr = 'v1 * v2'; break;
      case 'divide': expr = 'v2 != vec3(0.0) ? v1 / v2 : vec3(0.0)'; break;
      case 'cross': expr = 'cross(v1, v2)'; break;
      case 'normalize': expr = 'normalize(v1)'; break;
      case 'length': expr = 'vec3(length(v1))'; break;
      case 'scale': expr = 'v1 * 1.0'; break;
      default: expr = 'v1';
    }

    const glslCode = `
  // Vector Math: ${node.id} (${operation})
  vec3 ${varName}_v1 = vec3(0.0);
  vec3 ${varName}_v2 = vec3(0.0);
  vec3 ${varName}_vector = ${expr};
  float ${varName}_value = length(${varName}_vector);
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  // ── Vector Node Compilers ──

  private compileMapping(node: NodeInstance, varName: string): CompiledNode {
    const translation = this.getNodeSetting(node, 'translation', { x: 0, y: 0, z: 0 });
    const scale = this.getNodeSetting(node, 'scale', { x: 1, y: 1, z: 1 });

    const glslCode = `
  // Mapping: ${node.id}
  vec3 ${varName}_result = pos3D * vec3(${scale.x}, ${scale.y}, ${scale.z}) + vec3(${translation.x}, ${translation.y}, ${translation.z});
  vec3 ${varName}_vector = ${varName}_result;
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileCombineXYZ(node: NodeInstance, varName: string): CompiledNode {
    const glslCode = `
  // Combine XYZ: ${node.id}
  float ${varName}_x = 0.0;
  float ${varName}_y = 0.0;
  float ${varName}_z = 0.0;
  vec3 ${varName}_vector = vec3(${varName}_x, ${varName}_y, ${varName}_z);
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileSeparateXYZ(node: NodeInstance, varName: string): CompiledNode {
    const glslCode = `
  // Separate XYZ: ${node.id}
  vec3 ${varName}_input = vec3(0.0);
  float ${varName}_x = ${varName}_input.x;
  float ${varName}_y = ${varName}_input.y;
  float ${varName}_z = ${varName}_input.z;
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileBump(node: NodeInstance, varName: string): CompiledNode {
    const strength = this.getNodeSetting(node, 'strength', 1.0);

    const glslCode = `
  // Bump: ${node.id}
  float ${varName}_height = 0.0;
  float ${varName}_strength = ${strength.toFixed(3)};
  vec3 ${varName}_normal = perturbNormal(N, pos3D, ${varName}_height, ${varName}_strength);
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileNormalMap(node: NodeInstance, varName: string): CompiledNode {
    const strength = this.getNodeSetting(node, 'strength', 1.0);

    const glslCode = `
  // Normal Map: ${node.id}
  float ${varName}_strength = ${strength.toFixed(3)};
  vec3 ${varName}_normal = N; // Will be overridden if texture is connected
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  // ── Shader Node Compilers ──

  private compilePrincipledBSDF(node: NodeInstance, varName: string): CompiledNode {
    const baseColor = this.getNodeSetting(node, 'baseColor', { r: 0.8, g: 0.8, b: 0.8 });
    const roughness = this.getNodeSetting(node, 'roughness', 0.5);
    const metallic = this.getNodeSetting(node, 'metallic', 0.0);
    const specular = this.getNodeSetting(node, 'specular', 0.5);
    const ior = this.getNodeSetting(node, 'ior', 1.45);
    const transmission = this.getNodeSetting(node, 'transmission', 0.0);
    const clearcoat = this.getNodeSetting(node, 'clearcoat', 0.0);
    const clearcoatRoughness = this.getNodeSetting(node, 'clearcoatRoughness', 0.03);
    const emissionStrength = this.getNodeSetting(node, 'emissionStrength', 0.0);
    const alpha = this.getNodeSetting(node, 'alpha', 1.0);
    const sheen = this.getNodeSetting(node, 'sheen', 0.0);

    this.addUniform(`${varName}_baseColor`, 'vec3', new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b));
    this.addUniform(`${varName}_roughness`, 'float', roughness);
    this.addUniform(`${varName}_metallic`, 'float', metallic);
    this.addUniform(`${varName}_specular`, 'float', specular);
    this.addUniform(`${varName}_ior`, 'float', ior);
    this.addUniform(`${varName}_transmission`, 'float', transmission);
    this.addUniform(`${varName}_clearcoat`, 'float', clearcoat);
    this.addUniform(`${varName}_clearcoatRoughness`, 'float', clearcoatRoughness);
    this.addUniform(`${varName}_emissionStrength`, 'float', emissionStrength);
    this.addUniform(`${varName}_alpha`, 'float', alpha);
    this.addUniform(`${varName}_sheen`, 'float', sheen);

    const glslCode = `
  // Principled BSDF: ${node.id}
  vec3 ${varName}_albedo = ${varName}_baseColor;
  float ${varName}_rough = max(0.04, ${varName}_roughness);
  float ${varName}_metal = ${varName}_metallic;
  float ${varName}_spec = ${varName}_specular;
  float ${varName}_trans = ${varName}_transmission;
  float ${varName}_cc = ${varName}_clearcoat;
  float ${varName}_ccRough = max(0.04, ${varName}_clearcoatRoughness);
  vec3 ${varName}_emissionColor = vec3(0.0);
  float ${varName}_emStr = ${varName}_emissionStrength;
  float ${varName}_alphaVal = ${varName}_alpha;
  float ${varName}_sheenVal = ${varName}_sheen;
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileEmission(node: NodeInstance, varName: string): CompiledNode {
    const color = this.getNodeSetting(node, 'color', { r: 1, g: 1, b: 1 });
    const strength = this.getNodeSetting(node, 'strength', 1.0);

    this.addUniform(`${varName}_color`, 'vec3', new THREE.Vector3(color.r, color.g, color.b));
    this.addUniform(`${varName}_strength`, 'float', strength);

    const glslCode = `
  // Emission: ${node.id}
  vec3 ${varName}_emissionColor = ${varName}_color;
  float ${varName}_emissionStrength = ${varName}_strength;
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileMixShader(node: NodeInstance, varName: string): CompiledNode {
    const factor = this.getNodeSetting(node, 'factor', 0.5);

    this.addUniform(`${varName}_factor`, 'float', factor);

    const glslCode = `
  // Mix Shader: ${node.id}
  float ${varName}_fac = ${varName}_factor;
  // Shader mixing happens during BSDF assembly
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileAddShader(node: NodeInstance, varName: string): CompiledNode {
    const glslCode = `
  // Add Shader: ${node.id}
  // Shader addition happens during BSDF assembly
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  // ── Input Node Compilers ──

  private compileTextureCoordinate(node: NodeInstance, varName: string): CompiledNode {
    const glslCode = `
  // Texture Coordinate: ${node.id}
  vec3 ${varName}_generated = vObjectPosition;
  vec3 ${varName}_object = vObjectPosition;
  vec3 ${varName}_world = vWorldPosition;
  vec3 ${varName}_uv = vec3(vTexCoord, 0.0);
  vec3 ${varName}_normal = vWorldNormal;
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileValue(node: NodeInstance, varName: string): CompiledNode {
    const value = this.getNodeSetting(node, 'value', 0.0);

    this.addUniform(`${varName}_value`, 'float', value);

    const glslCode = `
  // Value: ${node.id}
  float ${varName}_val = ${varName}_value;
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'float',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  private compileRGB(node: NodeInstance, varName: string): CompiledNode {
    const color = this.getNodeSetting(node, 'color', [1, 1, 1, 1]);
    const c = Array.isArray(color) ? color : [1, 1, 1, 1];

    this.addUniform(`${varName}_color`, 'vec3', new THREE.Vector3(c[0], c[1], c[2]));

    const glslCode = `
  // RGB: ${node.id}
  vec3 ${varName}_color_val = ${varName}_color;
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  // ── Output Node Compiler ──

  private compileMaterialOutput(node: NodeInstance, varName: string): CompiledNode {
    const glslCode = `
  // Material Output: ${node.id}
  // Output is handled during BSDF assembly
`;

    return {
      glslCode,
      outputVar: varName,
      outputType: 'vec3',
      uniforms: new Map(),
      functions: new Set(),
    };
  }

  // ==========================================================================
  // BSDF Assembly
  // ==========================================================================

  private assembleBSDFOutput(
    _outputNodeId: string,
    _graph: NodeGraph,
    cfg: NodeGraph3DConfig
  ): string {
    // Generate the BSDF evaluation code that reads from compiled node variables
    // and produces the final PBR output

    const bsdfGLSL = `
  // ========================================================================
  // BSDF Output Assembly
  // ========================================================================

  // Default PBR parameters (overridden by node connections)
  vec3 albedo = vec3(0.8);
  float roughness = 0.5;
  float metallic = 0.0;
  float specular = 0.5;
  float transmission = 0.0;
  float clearcoat = 0.0;
  float clearcoatRoughness = 0.03;
  float alpha = 1.0;
  vec3 emissionColor = vec3(0.0);
  float emissionStrength = 0.0;
  float sheen = 0.0;
  float ao = 1.0;

  // Find and apply the Principled BSDF node output (if compiled)
  ${this.findAndApplyBSDFNode()}

  // Compute triplanar noise for base material properties
  float noiseVal;
  if (uAnimated > 0) {
    noiseVal = triplanarFBM4D(pos3D, N, uNoiseScale, uNoiseDetail, uTime);
  } else {
    noiseVal = triplanarFBM(pos3D, N, uNoiseScale, uNoiseDetail);
  }

  // Apply noise variation to albedo
  float variation = 0.9 + (noiseVal + 1.0) * 0.1;
  albedo *= variation;

  // Apply roughness variation from higher frequency noise
  float roughNoise = triplanarFBM(pos3D * 2.0, N, uNoiseScale * 2.0, max(2, uNoiseDetail - 2));
  roughness = max(0.04, roughness + roughNoise * 0.15);

  // Apply AO from low-frequency noise
  float aoNoise = triplanarFBM(pos3D * 0.5, N, uNoiseScale * 0.5, 3);
  ao = 1.0 - max(0.0, (aoNoise + 1.0) * 0.5) * uAOStrength * 0.5;
`;

    return bsdfGLSL;
  }

  private findAndApplyBSDFNode(): string {
    // Look for a compiled Principled BSDF node and extract its variables
    let result = '';
    for (const [nodeId, compiled] of this.nodeOutputs) {
      const v = compiled.outputVar;
      if (v.includes('principled_bsdf')) {
        result = `
  // Apply Principled BSDF from node: ${nodeId}
  albedo = ${v}_albedo;
  roughness = ${v}_rough;
  metallic = ${v}_metal;
  specular = ${v}_spec;
  transmission = ${v}_trans;
  clearcoat = ${v}_cc;
  clearcoatRoughness = ${v}_ccRough;
  alpha = ${v}_alphaVal;
  sheen = ${v}_sheenVal;
  if (${v}_emStr > 0.0) {
    emissionColor = ${v}_emissionColor;
    emissionStrength = ${v}_emStr;
  }
`;
        break;
      }
    }
    return result;
  }

  // ==========================================================================
  // Fragment Shader Assembly
  // ==========================================================================

  private buildFragmentShader(
    nodeGLSL: string[],
    bsdfGLSL: string,
    cfg: NodeGraph3DConfig
  ): string {
    const debugOutput = this.getDebugOutput(cfg);
    // Include 4D noise for animated materials
    const noise4DInclude = cfg.animated ? NOISE_4D_GLSL : '';

    return `#version 300 es
precision highp float;
precision highp int;

${FRAGMENT_VARYINGS_3D}

// Output
out vec4 fragColor;

// Global uniforms
uniform int uCoordSpace;
uniform float uTriplanarBlendExponent;
uniform float uTextureScale;
uniform float uNoiseScale;
uniform int uNoiseDetail;
uniform float uSeed;
uniform float uAOStrength;
uniform float uNormalStrength;
uniform int uSeamlessTriplanar;
uniform float uTime;
uniform int uAnimated;
uniform int uEnableIBL;
uniform vec3 cameraPosition;

// Node-specific uniforms
${this.getUniformDeclarations()}

${NOISE_GLSL}

${TRIPLANAR_GLSL}

${TEXCOORD_GLSL}

${noise4DInclude}

${PBR_LIGHTING_GLSL}

// Normal perturbation helper
vec3 perturbNormal(vec3 normal, vec3 position, float height, float strength) {
  float eps = 0.01;
  float hR = fbm3D((position + vec3(eps, 0.0, 0.0)) * uNoiseScale, uNoiseDetail, 2.0, 0.5);
  float hU = fbm3D((position + vec3(0.0, eps, 0.0)) * uNoiseScale, uNoiseDetail, 2.0, 0.5);
  vec3 dpdx = vec3(eps, 0.0, (hR - height) * strength);
  vec3 dpdy = vec3(0.0, eps, (hU - height) * strength);
  return normalize(cross(dpdx, dpdy));
}

// Triplanar FBM wrapper (with seamless support)
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

void main() {
  // Get 3D position and normal
  vec3 pos3D = getTexCoord3D(uCoordSpace, vObjectPosition, vWorldPosition, vTexCoord);
  vec3 N = normalize(vWorldNormal);

  // ── Node Evaluations ──
  ${nodeGLSL.join('\n')}

  // ── BSDF Assembly ──
  ${bsdfGLSL}

  // ── PBR Lighting ──
  vec3 V = normalize(cameraPosition - vWorldPosition);

  // Normal perturbation from noise height field
  float hC;
  if (uAnimated > 0) {
    hC = triplanarFBM4D(pos3D, N, uNoiseScale, uNoiseDetail, uTime);
  } else {
    hC = triplanarFBM(pos3D, N, uNoiseScale, uNoiseDetail);
  }
  vec3 perturbedNormal = perturbNormal(N, pos3D, hC, uNormalStrength);

  // F0 (reflectance at normal incidence)
  vec3 F0 = vec3(0.16 * specular * specular);
  F0 = mix(F0, albedo, metallic);

  // ── Directional Lights ──

  // Directional light 1 (key light)
  vec3 lightDir1 = normalize(vec3(0.5, 1.0, 0.8));
  vec3 lightColor1 = vec3(1.0);
  vec3 Lo1 = computePBRLight(perturbedNormal, V, albedo, metallic, roughness,
                              lightDir1, lightColor1, 1.0, F0);

  // Directional light 2 (fill light)
  vec3 lightDir2 = normalize(vec3(-0.3, 0.5, -0.6));
  vec3 lightColor2 = vec3(0.3);
  vec3 Lo2 = computePBRLight(perturbedNormal, V, albedo, metallic, roughness,
                              lightDir2, lightColor2, 1.0, F0);

  // Directional light 3 (rim light)
  vec3 lightDir3 = normalize(vec3(-0.7, 0.2, 0.5));
  vec3 lightColor3 = vec3(0.2);
  vec3 Lo3 = computePBRLight(perturbedNormal, V, albedo, metallic, roughness,
                              lightDir3, lightColor3, 1.0, F0);

  // ── Point Lights ──

  // Point light 1 (above)
  vec3 pointLightPos1 = vec3(2.0, 5.0, 2.0);
  vec3 toPointLight1 = pointLightPos1 - vWorldPosition;
  float pointDist1 = length(toPointLight1);
  vec3 pointLightDir1 = toPointLight1 / max(pointDist1, 0.001);
  float pointAtten1 = 1.0 / (1.0 + 0.09 * pointDist1 + 0.032 * pointDist1 * pointDist1);
  vec3 Lo4 = computePBRLight(perturbedNormal, V, albedo, metallic, roughness,
                              pointLightDir1, vec3(0.4, 0.38, 0.35), pointAtten1, F0);

  // ── Ambient ──
  vec3 ambient = vec3(0.1) * albedo * ao;

  // ── IBL ──
  vec3 ibl = vec3(0.0);
  if (uEnableIBL > 0) {
    ibl = approximateIBL(perturbedNormal, V, albedo, metallic, roughness, F0, ao);
  }

  vec3 color = ambient + Lo1 + Lo2 + Lo3 + Lo4 + ibl;

  // Clearcoat layer
  if (clearcoat > 0.0) {
    vec3 H1 = normalize(V + lightDir1);
    float ccNDF = distributionGGX(perturbedNormal, H1, clearcoatRoughness);
    float ccG = geometrySmith(perturbedNormal, V, lightDir1, clearcoatRoughness);
    vec3 ccF = fresnelSchlick(max(dot(H1, V), 0.0), vec3(0.04));
    float ccSpec = (ccNDF * ccG * ccF.x) / (4.0 * max(dot(perturbedNormal, V), 0.0) * max(dot(perturbedNormal, lightDir1), 0.0) + 0.0001);
    color = mix(color, color + vec3(ccSpec), clearcoat);
  }

  // Sheen
  if (sheen > 0.0) {
    float NdotV = max(dot(perturbedNormal, V), 0.0);
    vec3 sheenColor = vec3(1.0) * pow(1.0 - NdotV, 5.0);
    color = mix(color, color + sheenColor * sheen, sheen);
  }

  // Transmission approximation
  if (transmission > 0.0) {
    vec3 transmittedColor = albedo * (1.0 - metallic);
    float fresnel = pow(1.0 - max(dot(perturbedNormal, V), 0.0), 5.0);
    color = mix(color, transmittedColor * 0.5, transmission * (1.0 - fresnel));
  }

  // Emission
  if (emissionStrength > 0.0) {
    float emNoise = (hC + 1.0) * 0.5;
    color += emissionColor * emissionStrength * emNoise;
  }

  // Tone mapping (Reinhard)
  color = color / (color + vec3(1.0));

  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  ${debugOutput}

  fragColor = vec4(color, alpha);
}
`;
  }

  private getDebugOutput(cfg: NodeGraph3DConfig): string {
    switch (cfg.debugMode) {
      case 'normals':
        return 'color = perturbedNormal * 0.5 + 0.5;';
      case 'uv':
        return 'color = vec3(vTexCoord, 0.0);';
      case 'noise':
        return 'color = vec3((hC + 1.0) * 0.5);';
      default:
        return '';
    }
  }

  private getDisplacementGLSL(
    _outputNodeId: string,
    _graph: NodeGraph,
    _cfg: NodeGraph3DConfig
  ): string {
    return `
float displacement(vec3 p, vec3 n) {
  vec3 absN = abs(n);
  vec3 w = pow(absN, vec3(8.0));
  float sum = w.x + w.y + w.z;
  w = (sum > 0.0001) ? w / sum : vec3(1.0 / 3.0);
  // Seamless offset-blend displacement
  float offsetScale = 0.5;
  float xy = perlinNoise3D((p.xy + p.z * offsetScale) * 5.0);
  float xz = perlinNoise3D((p.xz + p.y * offsetScale) * 5.0);
  float yz = perlinNoise3D((p.yz + p.x * offsetScale) * 5.0);
  return w.z * xy + w.y * xz + w.x * yz;
}
`;
  }

  // ==========================================================================
  // Uniform Management
  // ==========================================================================

  private registerGlobalUniforms(cfg: NodeGraph3DConfig): void {
    this.addUniform('uCoordSpace', 'int', cfg.coordinateSpace);
    this.addUniform('uTriplanarBlendExponent', 'float', cfg.triplanarBlendExponent);
    this.addUniform('uTextureScale', 'float', cfg.textureScale);
    this.addUniform('uNoiseScale', 'float', 5.0);
    this.addUniform('uNoiseDetail', 'int', 5);
    this.addUniform('uSeed', 'float', cfg.seed);
    this.addUniform('uAOStrength', 'float', cfg.aoStrength);
    this.addUniform('uNormalStrength', 'float', cfg.normalStrength);
    this.addUniform('uSeamlessTriplanar', 'int', cfg.seamlessTriplanar ? 1 : 0);
    this.addUniform('uDisplacementScale', 'float', cfg.displacementScale);
    this.addUniform('uDisplacementOffset', 'float', cfg.displacementOffset);
    this.addUniform('uTime', 'float', 0.0);
    this.addUniform('uAnimated', 'int', cfg.animated ? 1 : 0);
    this.addUniform('uEnableIBL', 'int', cfg.enableIBL ? 1 : 0);
    this.addUniform('cameraPosition', 'vec3', new THREE.Vector3());
  }

  private addUniform(name: string, type: string, value: any): void {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, { type, value });
    }
  }

  private getUniformDeclarations(): string {
    const lines: string[] = [];
    for (const [name, info] of this.uniforms) {
      if (name === 'cameraPosition') continue; // Auto-set by Three.js
      const glslType = this.uniformTypeToGLSL(info.type, name);
      lines.push(`uniform ${glslType} ${name};`);
    }
    return lines.join('\n');
  }

  private uniformTypeToGLSL(type: string, _name: string): string {
    switch (type) {
      case 'float': return 'float';
      case 'int': return 'int';
      case 'vec2': return 'vec2';
      case 'vec3': return 'vec3';
      case 'vec4': return 'vec4';
      case 'sampler2D': return 'sampler2D';
      default: return 'float';
    }
  }

  private buildUniformsObject(): Record<string, THREE.IUniform> {
    const result: Record<string, THREE.IUniform> = {};

    for (const [name, info] of this.uniforms) {
      let uniformValue: any;
      switch (info.type) {
        case 'float':
          uniformValue = { value: typeof info.value === 'number' ? info.value : 0.0 };
          break;
        case 'int':
          uniformValue = { value: typeof info.value === 'number' ? info.value : 0 };
          break;
        case 'vec2':
          uniformValue = { value: info.value instanceof THREE.Vector2 ? info.value : new THREE.Vector2() };
          break;
        case 'vec3':
          uniformValue = {
            value: info.value instanceof THREE.Vector3
              ? info.value
              : info.value instanceof THREE.Color
                ? new THREE.Vector3(info.value.r, info.value.g, info.value.b)
                : new THREE.Vector3(),
          };
          break;
        case 'sampler2D':
          uniformValue = { value: info.value instanceof THREE.Texture ? info.value : null };
          break;
        default:
          uniformValue = { value: info.value ?? 0 };
      }
      result[name] = uniformValue;
    }

    // Add camera position (auto-set by Three.js)
    result['cameraPosition'] = { value: new THREE.Vector3() };

    return result;
  }

  // ==========================================================================
  // Graph Traversal
  // ==========================================================================

  private topologicalSort(graph: NodeGraph): string[] {
    const nodes = graph.nodes;
    const links = graph.links;

    const adj = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const [id] of nodes) {
      adj.set(id, new Set());
      inDegree.set(id, 0);
    }

    for (const link of links) {
      adj.get(link.fromNode)?.add(link.toNode);
      inDegree.set(link.toNode, (inDegree.get(link.toNode) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      sorted.push(current);

      const neighbors = adj.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) || 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0 && !visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    return sorted;
  }

  private findOutputNode(graph: NodeGraph): string | null {
    for (const [nodeId, node] of graph.nodes) {
      const type = this.normalizeNodeType(node.type);
      if (type === 'material_output') return nodeId;
    }
    // If no explicit output node, return the last node
    const nodeIds = Array.from(graph.nodes.keys());
    return nodeIds.length > 0 ? nodeIds[nodeIds.length - 1] : null;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private normalizeNodeType(type: string): string {
    // Map Blender-style node names to our simplified names
    const mapping: Record<string, string> = {
      'ShaderNodeBsdfPrincipled': 'principled_bsdf',
      'ShaderNodeTexNoise': 'noise_texture',
      'ShaderNodeTexVoronoi': 'voronoi_texture',
      'ShaderNodeTexMusgrave': 'musgrave_texture',
      'ShaderNodeTexGradient': 'gradient_texture',
      'ShaderNodeTexBrick': 'brick_texture',
      'ShaderNodeTexChecker': 'checker_texture',
      'ShaderNodeTexMagic': 'magic_texture',
      'ShaderNodeTexImage': 'image_texture',
      'ShaderNodeMixRGB': 'mix_rgb',
      'ShaderNodeValToRGB': 'color_ramp',
      'ShaderNodeHueSaturation': 'hue_saturation',
      'ShaderNodeInvert': 'invert',
      'CompositorNodeBrightContrast': 'bright_contrast',
      'ShaderNodeMath': 'math',
      'ShaderNodeVectorMath': 'vector_math',
      'ShaderNodeMapping': 'mapping',
      'ShaderNodeCombineXYZ': 'combine_xyz',
      'ShaderNodeSeparateXYZ': 'separate_xyz',
      'ShaderNodeBump': 'bump',
      'ShaderNodeNormalMap': 'normal_map',
      'ShaderNodeEmission': 'emission',
      'ShaderNodeMixShader': 'mix_shader',
      'ShaderNodeAddShader': 'add_shader',
      'ShaderNodeTexCoord': 'texture_coordinate',
      'ShaderNodeValue': 'value',
      'ShaderNodeRGB': 'rgb',
      'ShaderNodeOutputMaterial': 'material_output',
      'ShaderNodeDisplacement': 'displacement',
    };

    return mapping[type] ?? type;
  }

  private getNodeSetting(node: NodeInstance, key: string, defaultValue: any): any {
    const settings = node.settings ?? {};
    if (settings[key] !== undefined) return settings[key];

    const inputs = node.inputs;
    if (inputs instanceof Map && inputs.has(key)) return inputs.get(key);
    if (typeof inputs === 'object' && inputs !== null && key in inputs) return (inputs as any)[key];

    return defaultValue;
  }

  private createFallbackMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER_3D,
      fragmentShader: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.5, 0.5, 0.5, 1.0);
}
`,
      uniforms: {},
      glslVersion: THREE.GLSL3,
    });
  }

  private createErrorResult(): ShaderBuildResult {
    return {
      vertexShader: '',
      fragmentShader: '',
      uniforms: {},
      warnings: [...this.warnings],
      errors: [...this.errors],
    };
  }
}
