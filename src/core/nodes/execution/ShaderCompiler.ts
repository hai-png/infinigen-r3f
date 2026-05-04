/**
 * ShaderCompiler - Compiles a node graph into GLSL fragment + vertex shaders
 *
 * Now uses GLSLShaderComposer for full node graph → GLSL generation.
 * Falls back to simplified PBR material when composer fails.
 *
 * Handles the PrincipledBSDF node as the output node and generates GLSL code
 * for each node type:
 * - Texture nodes → GLSL noise functions
 * - Color nodes → GLSL color operations
 * - Math nodes → GLSL math operations
 * - Vector nodes → GLSL vector operations
 * - Shader nodes → PBR material assembly
 *
 * Produces a complete Three.js ShaderMaterial with proper uniforms and varyings.
 * All shaders are WebGL2 compatible (no deprecated GLSL built-ins).
 *
 * Supports:
 * - IBL (Image-Based Lighting) via environment map uniforms
 * - Multi-light environments (up to 4 point lights + 1 directional)
 * - Shadow mapping for directional light
 */

import * as THREE from 'three';
import type { NodeGraph } from './NodeEvaluator';
import { NodeEvaluator, EvaluationMode } from './NodeEvaluator';
import { GLSLShaderComposer } from './glsl/GLSLShaderComposer';
import type { ShaderGraph, ComposableNode } from './glsl/GLSLShaderComposer';
import type { NodeLink } from '../core/types';

// ============================================================================
// Types
// ============================================================================

export interface ShaderCompileResult {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  material: THREE.ShaderMaterial;
  warnings: string[];
  errors: string[];
}

export interface ShaderCompileOptions {
  /** Enable IBL (Image-Based Lighting) */
  enableIBL?: boolean;
  /** Enable shadow mapping */
  enableShadows?: boolean;
  /** Environment map for IBL */
  envMap?: THREE.Texture;
  /** Use the full GLSLShaderComposer (true) or simplified mode (false) */
  useComposer?: boolean;
}

interface UniformInfo {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D' | 'int';
  value: any;
}

// ============================================================================
// GLSL Code Templates (simplified fallback)
// ============================================================================

const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

const VERTEX_SHADER_TEMPLATE = `${GLSL_HEADER}

// Vertex attributes
in vec3 position;
in vec3 normal;
in vec2 uv;

// Uniforms
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// Varyings
out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// ============================================================================
// ShaderCompiler
// ============================================================================

export class NodeShaderCompiler {
  private evaluator: NodeEvaluator;
  private composer: GLSLShaderComposer;
  private uniforms: Map<string, UniformInfo> = new Map();
  private functions: Set<string> = new Set();
  private warnings: string[] = [];
  private errors: string[] = [];
  private uniformCounter: number = 0;

  constructor(evaluator?: NodeEvaluator) {
    this.evaluator = evaluator ?? new NodeEvaluator();
    this.composer = new GLSLShaderComposer();
  }

  /**
   * Compile a node graph into a ShaderMaterial using the full GLSLShaderComposer
   */
  compileToGLSL(graph: ShaderGraph): string {
    const result = this.composer.compose(graph);
    return result.fragmentShader;
  }

  /**
   * Compile a node graph into a usable Three.js ShaderMaterial
   * Uses the full GLSLShaderComposer for complete node graph traversal
   */
  compileToMaterial(graph: ShaderGraph, options?: ShaderCompileOptions): THREE.Material {
    try {
      const composed = this.composer.compose(graph, {
        enableIBL: options?.enableIBL,
        enableShadows: options?.enableShadows,
      });

      this.warnings = composed.warnings;
      this.errors = composed.errors;

      const materialOptions: THREE.ShaderMaterialParameters = {
        vertexShader: composed.vertexShader,
        fragmentShader: composed.fragmentShader,
        uniforms: composed.uniforms,
        side: THREE.FrontSide,
        transparent: false,
      };

      // Check if any alpha < 1 or transmission
      const fragStr = composed.fragmentShader;
      if (fragStr.includes('transmission') || fragStr.includes('alpha')) {
        materialOptions.transparent = true;
        materialOptions.side = THREE.DoubleSide;
      }

      // Add environment map if provided
      if (options?.envMap) {
        composed.uniforms['u_envMap'] = { value: options.envMap };
      }

      const material = new THREE.ShaderMaterial(materialOptions);

      if (composed.errors.length > 0) {
        console.warn('[ShaderCompiler] Errors during composition:', composed.errors);
      }

      return material;
    } catch (error: any) {
      console.warn('[ShaderCompiler] Full composition failed, using fallback:', error.message);
      return this.createFallbackMaterial();
    }
  }

  /**
   * Compile a node graph using the legacy (simplified) path.
   * This evaluates the graph through NodeEvaluator and generates
   * a simplified PBR shader from the extracted BSDF parameters.
   */
  compile(graph: NodeGraph): ShaderCompileResult {
    this.uniforms.clear();
    this.functions.clear();
    this.warnings = [];
    this.errors = [];
    this.uniformCounter = 0;

    try {
      // Evaluate the node graph first to extract parameters
      const evalResult = this.evaluator.evaluate(graph, EvaluationMode.MATERIAL);
      this.warnings.push(...evalResult.warnings);
      this.errors.push(...evalResult.errors);

      // Extract material parameters from evaluated BSDF
      const bsdfParams = this.extractBSDFParameters(evalResult.value);

      // Generate fragment shader
      const fragmentShader = this.generateFragmentShader(bsdfParams);

      // Build uniforms
      const threeUniforms = this.buildThreeUniforms(bsdfParams);

      // Create ShaderMaterial
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER_TEMPLATE,
        fragmentShader,
        uniforms: threeUniforms,
        side: bsdfParams.transmission > 0 ? THREE.DoubleSide : THREE.FrontSide,
        transparent: bsdfParams.alpha < 1.0 || bsdfParams.transmission > 0,
      });

      return {
        vertexShader: VERTEX_SHADER_TEMPLATE,
        fragmentShader,
        uniforms: threeUniforms,
        material,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    } catch (error: any) {
      this.errors.push(error.message);

      // Return fallback material
      const fallbackMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x888888,
        roughness: 0.5,
        metalness: 0.0,
      });

      return {
        vertexShader: '',
        fragmentShader: '',
        uniforms: {},
        material: fallbackMaterial as any,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }
  }

  /**
   * Compile a node graph, falling back to MeshPhysicalMaterial on failure
   */
  compileWithFallback(graph: NodeGraph): THREE.Material {
    const result = this.compile(graph);

    if (result.errors.length > 0) {
      // Fall back to MeshPhysicalMaterial with approximate parameters
      const evalResult = this.evaluator.evaluate(graph, EvaluationMode.MATERIAL);
      return this.createFallbackMaterialFromBSDF(evalResult.value);
    }

    return result.material;
  }

  // ==========================================================================
  // Convert NodeGraph to ShaderGraph for the composer
  // ==========================================================================

  /**
   * Convert a NodeGraph (from NodeEvaluator) to a ShaderGraph (for GLSLShaderComposer)
   */
  private nodeGraphToShaderGraph(graph: NodeGraph): ShaderGraph {
    const nodes: Map<string, ComposableNode> = new Map();
    const links: NodeLink[] = [];

    for (const [id, nodeInst] of graph.nodes) {
      const composableNode: ComposableNode = {
        id,
        type: nodeInst.type,
        name: nodeInst.name,
        inputs: new Map(),
        outputs: new Map(),
        settings: nodeInst.settings,
      };

      // Convert inputs
      if (nodeInst.inputs instanceof Map) {
        for (const [key, value] of nodeInst.inputs) {
          composableNode.inputs.set(key, {
            type: 'FLOAT',
            value,
            connectedLinks: [],
          });
        }
      }

      // Convert outputs
      if (nodeInst.outputs instanceof Map) {
        for (const [key, value] of nodeInst.outputs) {
          composableNode.outputs.set(key, {
            type: 'FLOAT',
            value,
            connectedLinks: [],
          });
        }
      }

      nodes.set(id, composableNode);
    }

    // Copy links
    for (const link of graph.links) {
      links.push({ ...link });
    }

    return { nodes, links };
  }

  // ==========================================================================
  // BSDF Parameter Extraction (legacy path)
  // ==========================================================================

  private extractBSDFParameters(evalOutput: any): BSDFParams {
    const defaultParams: BSDFParams = {
      baseColor: new THREE.Color(0.8, 0.8, 0.8),
      metallic: 0.0,
      roughness: 0.5,
      specular: 0.5,
      ior: 1.45,
      transmission: 0.0,
      emissionColor: new THREE.Color(0, 0, 0),
      emissionStrength: 0.0,
      alpha: 1.0,
      clearcoat: 0.0,
      clearcoatRoughness: 0.03,
      subsurfaceWeight: 0.0,
      sheen: 0.0,
      anisotropic: 0.0,
    };

    if (!evalOutput) return defaultParams;

    // Navigate through the eval output to find BSDF params
    let bsdf = evalOutput;

    // Handle material_output node wrapping
    if (evalOutput.BSDF) bsdf = evalOutput.BSDF;
    else if (evalOutput.Surface) bsdf = evalOutput.Surface;
    else if (evalOutput.Shader) bsdf = evalOutput.Shader;

    // Handle mix_shader/add_shader wrapping
    if (bsdf.shader1 || bsdf.shader2) {
      // For mix shaders, use the first shader's params weighted by factor
      const factor = bsdf.factor ?? 0.5;
      const p1 = this.extractBSDFParameters(bsdf.shader1);
      const p2 = this.extractBSDFParameters(bsdf.shader2);
      return this.blendBSDFParams(p1, p2, factor);
    }

    return {
      baseColor: this.resolveColorValue(bsdf.baseColor, defaultParams.baseColor),
      metallic: bsdf.metallic ?? defaultParams.metallic,
      roughness: Math.max(0.04, bsdf.roughness ?? defaultParams.roughness),
      specular: bsdf.specular ?? defaultParams.specular,
      ior: bsdf.ior ?? defaultParams.ior,
      transmission: bsdf.transmission ?? defaultParams.transmission,
      emissionColor: this.resolveColorValue(bsdf.emissionColor, defaultParams.emissionColor),
      emissionStrength: bsdf.emissionStrength ?? defaultParams.emissionStrength,
      alpha: bsdf.alpha ?? defaultParams.alpha,
      clearcoat: bsdf.clearcoat ?? defaultParams.clearcoat,
      clearcoatRoughness: bsdf.clearcoatRoughness ?? defaultParams.clearcoatRoughness,
      subsurfaceWeight: bsdf.subsurfaceWeight ?? defaultParams.subsurfaceWeight,
      sheen: bsdf.sheen ?? defaultParams.sheen,
      anisotropic: bsdf.anisotropic ?? defaultParams.anisotropic,
    };
  }

  private blendBSDFParams(a: BSDFParams, b: BSDFParams, factor: number): BSDFParams {
    return {
      baseColor: new THREE.Color().lerpColors(a.baseColor, b.baseColor, factor),
      metallic: a.metallic + factor * (b.metallic - a.metallic),
      roughness: a.roughness + factor * (b.roughness - a.roughness),
      specular: a.specular + factor * (b.specular - a.specular),
      ior: a.ior + factor * (b.ior - a.ior),
      transmission: a.transmission + factor * (b.transmission - a.transmission),
      emissionColor: new THREE.Color().lerpColors(a.emissionColor, b.emissionColor, factor),
      emissionStrength: a.emissionStrength + factor * (b.emissionStrength - a.emissionStrength),
      alpha: a.alpha + factor * (b.alpha - a.alpha),
      clearcoat: a.clearcoat + factor * (b.clearcoat - a.clearcoat),
      clearcoatRoughness: a.clearcoatRoughness + factor * (b.clearcoatRoughness - a.clearcoatRoughness),
      subsurfaceWeight: a.subsurfaceWeight + factor * (b.subsurfaceWeight - a.subsurfaceWeight),
      sheen: a.sheen + factor * (b.sheen - a.sheen),
      anisotropic: a.anisotropic + factor * (b.anisotropic - a.anisotropic),
    };
  }

  // ==========================================================================
  // Fragment Shader Generation (simplified legacy path)
  // ==========================================================================

  private generateFragmentShader(params: BSDFParams): string {
    // Register uniforms from params
    const baseColorUniform = this.addUniform('baseColor', 'vec3', params.baseColor);
    const metallicUniform = this.addUniform('metallic', 'float', params.metallic);
    const roughnessUniform = this.addUniform('roughness', 'float', params.roughness);
    const specularUniform = this.addUniform('specular', 'float', params.specular);
    const iorUniform = this.addUniform('ior', 'float', params.ior);
    const transmissionUniform = this.addUniform('transmission', 'float', params.transmission);
    const emissionColorUniform = this.addUniform('emissionColor', 'vec3', params.emissionColor);
    const emissionStrengthUniform = this.addUniform('emissionStrength', 'float', params.emissionStrength);
    const alphaUniform = this.addUniform('alpha', 'float', params.alpha);
    const clearcoatUniform = this.addUniform('clearcoat', 'float', params.clearcoat);
    const clearcoatRoughnessUniform = this.addUniform('clearcoatRoughness', 'float', params.clearcoatRoughness);
    const subsurfaceWeightUniform = this.addUniform('subsurfaceWeight', 'float', params.subsurfaceWeight);
    const sheenUniform = this.addUniform('sheen', 'float', params.sheen);

    // Build fragment shader
    const frag = `${GLSL_HEADER}

// Varyings from vertex shader
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;

// Output
out vec4 fragColor;

// Material uniforms
uniform vec3 ${baseColorUniform};
uniform float ${metallicUniform};
uniform float ${roughnessUniform};
uniform float ${specularUniform};
uniform float ${iorUniform};
uniform float ${transmissionUniform};
uniform vec3 ${emissionColorUniform};
uniform float ${emissionStrengthUniform};
uniform float ${alphaUniform};
uniform float ${clearcoatUniform};
uniform float ${clearcoatRoughnessUniform};
uniform float ${subsurfaceWeightUniform};
uniform float ${sheenUniform};

// Camera uniforms (auto-set by Three.js)
uniform vec3 cameraPosition;

${this.getNoiseFunctions()}

// PBR lighting functions
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
  float num = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;
  return num / max(denom, 0.0001);
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx2 = geometrySchlickGGX(NdotV, roughness);
  float ggx1 = geometrySchlickGGX(NdotL, roughness);
  return ggx1 * ggx2;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  // Base material properties
  vec3 albedo = ${baseColorUniform};
  float metallic = ${metallicUniform};
  float roughness = max(0.04, ${roughnessUniform});
  float transmission = ${transmissionUniform};
  float clearcoat = ${clearcoatUniform};
  float clearcoatRoughness = max(0.04, ${clearcoatRoughnessUniform});
  float subsurfaceWeight = ${subsurfaceWeightUniform};
  float sheenWeight = ${sheenUniform};

  // Calculate reflectance at normal incidence
  vec3 F0 = vec3(0.16 * ${specularUniform} * ${specularUniform});
  F0 = mix(F0, albedo, metallic);

  // Simple directional + ambient lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  vec3 lightColor = vec3(1.0);
  vec3 ambientColor = vec3(0.15);

  vec3 L = lightDir;
  vec3 H = normalize(V + L);

  // Cook-Torrance BRDF
  float NDF = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  vec3 specularBRDF = numerator / denominator;

  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
  kD *= 1.0 - metallic;

  float NdotL = max(dot(N, L), 0.0);

  vec3 Lo = (kD * albedo / PI + specularBRDF) * lightColor * NdotL;

  // Clearcoat layer
  if (clearcoat > 0.0) {
    float ccNDF = distributionGGX(N, H, clearcoatRoughness);
    float ccG = geometrySmith(N, V, L, clearcoatRoughness);
    vec3 ccF = fresnelSchlick(max(dot(H, V), 0.0), vec3(0.04));
    float ccSpecular = (ccNDF * ccG * ccF.x) / (4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001);
    Lo = mix(Lo, Lo + vec3(ccSpecular), clearcoat);
  }

  // Sheen
  if (sheenWeight > 0.0) {
    float NdotV = max(dot(N, V), 0.0);
    vec3 sheenColor = vec3(1.0, 1.0, 1.0) * pow(1.0 - NdotV, 5.0);
    Lo = mix(Lo, Lo + sheenColor * sheenWeight, sheenWeight);
  }

  // Subsurface scattering approximation
  if (subsurfaceWeight > 0.0) {
    vec3 sssColor = albedo * (1.0 - metallic);
    float sssFactor = pow(clamp(dot(V, -L), 0.0, 1.0), 2.0);
    Lo = mix(Lo, Lo + sssColor * sssFactor * 0.5, subsurfaceWeight);
  }

  // Transmission approximation
  if (transmission > 0.0) {
    vec3 transmittedColor = albedo * (1.0 - metallic);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    Lo = mix(Lo, transmittedColor * 0.5, transmission * (1.0 - fresnel));
  }

  // Ambient
  vec3 ambient = ambientColor * albedo;
  vec3 color = ambient + Lo;

  // Emission
  color += ${emissionColorUniform} * ${emissionStrengthUniform};

  // Tone mapping (simple Reinhard)
  color = color / (color + vec3(1.0));

  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  fragColor = vec4(color, ${alphaUniform});
}
`;

    return frag;
  }

  // ==========================================================================
  // Uniform Management
  // ==========================================================================

  private addUniform(name: string, type: UniformInfo['type'], value: any): string {
    const uniformName = `u_${name}`;
    let uniformValue: any;

    switch (type) {
      case 'float':
        uniformValue = { value: typeof value === 'number' ? value : 0.0 };
        break;
      case 'vec2':
        uniformValue = { value: value instanceof THREE.Vector2 ? value : new THREE.Vector2(0, 0) };
        break;
      case 'vec3':
        uniformValue = {
          value: value instanceof THREE.Color
            ? new THREE.Vector3(value.r, value.g, value.b)
            : value instanceof THREE.Vector3
              ? value
              : new THREE.Vector3(0, 0, 0),
        };
        break;
      case 'vec4':
        uniformValue = { value: value instanceof THREE.Vector4 ? value : new THREE.Vector4(0, 0, 0, 1) };
        break;
      case 'int':
        uniformValue = { value: typeof value === 'number' ? value : 0 };
        break;
      case 'sampler2D':
        uniformValue = { value: value instanceof THREE.Texture ? value : null };
        break;
      default:
        uniformValue = { value };
    }

    this.uniforms.set(uniformName, { name: uniformName, type, value: uniformValue });
    return uniformName;
  }

  private buildThreeUniforms(params: BSDFParams): Record<string, THREE.IUniform> {
    const result: Record<string, THREE.IUniform> = {};

    for (const [, info] of this.uniforms) {
      result[info.name] = info.value as THREE.IUniform;
    }

    return result;
  }

  // ==========================================================================
  // GLSL Noise Functions (simplified legacy)
  // ==========================================================================

  private getNoiseFunctions(): string {
    return `
// Hash function for noise
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// 3D Gradient noise
float gradientNoise(vec3 p) {
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
float fbm(vec3 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value += amplitude * gradientNoise(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// Voronoi noise
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float voronoi(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash22(i + neighbor);
      vec2 diff = neighbor + point - f;
      float dist = length(diff);
      minDist = min(minDist, dist);
    }
  }

  return minDist;
}
`;
  }

  // ==========================================================================
  // Fallback Material
  // ==========================================================================

  private createFallbackMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      roughness: 0.5,
      metalness: 0.0,
    });
  }

  private createFallbackMaterialFromBSDF(evalOutput: any): THREE.MeshPhysicalMaterial {
    const params = this.extractBSDFParameters(evalOutput);

    const materialParams: THREE.MeshPhysicalMaterialParameters = {
      color: params.baseColor,
      metalness: params.metallic,
      roughness: Math.max(0.04, params.roughness),
      emissive: params.emissionColor,
      emissiveIntensity: params.emissionStrength,
      opacity: params.alpha,
      transparent: params.alpha < 1.0,
      clearcoat: params.clearcoat,
      clearcoatRoughness: params.clearcoatRoughness,
      ior: params.ior,
      sheen: params.sheen,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(1, 1, 1),
    };

    if (params.transmission > 0) {
      materialParams.transmission = params.transmission;
      materialParams.transparent = true;
    }

    return new THREE.MeshPhysicalMaterial(materialParams);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private resolveColorValue(value: any, defaultColor: THREE.Color): THREE.Color {
    if (value instanceof THREE.Color) return value.clone();
    if (typeof value === 'string') return new THREE.Color(value);
    if (typeof value === 'number') return new THREE.Color(value);
    if (value && typeof value === 'object') {
      if ('r' in value && 'g' in value && 'b' in value) {
        return new THREE.Color(value.r, value.g, value.b);
      }
    }
    return defaultColor.clone();
  }
}

// ============================================================================
// BSDF Parameters Interface
// ============================================================================

interface BSDFParams {
  baseColor: THREE.Color;
  metallic: number;
  roughness: number;
  specular: number;
  ior: number;
  transmission: number;
  emissionColor: THREE.Color;
  emissionStrength: number;
  alpha: number;
  clearcoat: number;
  clearcoatRoughness: number;
  subsurfaceWeight: number;
  sheen: number;
  anisotropic: number;
}
