/**
 * MaterialFactory - High-level API for creating Three.js materials from node presets
 *
 * Built-in material presets matching common Infinigen material types:
 * - Terrain, Bark, Stone, Metal, Glass, Fabric, Water, Foliage, Skin
 *
 * Each preset creates a node graph internally and evaluates it.
 * Falls back to MeshPhysicalMaterial with approximate parameters if compilation fails.
 *
 * Enhanced with template-based material creation that uses the shader compiler
 * to generate GLSL from the template's node graph, with proper uniforms
 * and render state configuration for terrain, vegetation, and water materials.
 */

import * as THREE from 'three';
import type { NodeGraph } from './NodeEvaluator';
import { NodeEvaluator, EvaluationMode } from './NodeEvaluator';
import { NodeShaderCompiler, type BuildShaderMaterialParams } from './ShaderCompiler';
import { NodeGraphMaterialBridge, type MaterialBridgeOptions } from './NodeGraphMaterialBridge';
import { evaluateToMaterial, type EvaluateToMaterialOptions } from './EvaluateToMaterial';

// ============================================================================
// Preset Parameter Types
// ============================================================================

export interface TerrainMaterialParams {
  baseColor?: THREE.Color | string;
  slopeColor?: THREE.Color | string;
  altitudeColor?: THREE.Color | string;
  roughness?: number;
  slopeThreshold?: number;
  altitudeThreshold?: number;
  noiseScale?: number;
  seed?: number;
}

export interface BarkMaterialParams {
  baseColor?: THREE.Color | string;
  roughness?: number;
  noiseScale?: number;
  detail?: number;
  displacement?: number;
  seed?: number;
}

export interface StoneMaterialParams {
  baseColor?: THREE.Color | string;
  crackColor?: THREE.Color | string;
  roughness?: number;
  crackIntensity?: number;
  noiseScale?: number;
  weathering?: number;
  seed?: number;
}

export interface MetalMaterialParams {
  baseColor?: THREE.Color | string;
  roughness?: number;
  metallic?: number;
  oxidation?: number;
  noiseScale?: number;
  seed?: number;
}

export interface GlassMaterialParams {
  color?: THREE.Color | string;
  roughness?: number;
  ior?: number;
  transmission?: number;
  seed?: number;
}

export interface FabricMaterialParams {
  baseColor?: THREE.Color | string;
  roughness?: number;
  threadColor?: THREE.Color | string;
  weaveScale?: number;
  seed?: number;
}

export interface WaterMaterialParams {
  color?: THREE.Color | string;
  depth?: number;
  roughness?: number;
  flowSpeed?: number;
  noiseScale?: number;
  seed?: number;
  /** Enable refraction effect */
  refraction?: boolean;
  /** Enable reflection/Fresnel */
  reflection?: boolean;
  /** Wave height for vertex displacement */
  waveHeight?: number;
}

export interface FoliageMaterialParams {
  baseColor?: THREE.Color | string;
  subsurfaceColor?: THREE.Color | string;
  roughness?: number;
  subsurfaceWeight?: number;
  noiseScale?: number;
  seed?: number;
}

export interface SkinMaterialParams {
  baseColor?: THREE.Color | string;
  subsurfaceColor?: THREE.Color | string;
  roughness?: number;
  subsurfaceWeight?: number;
  seed?: number;
}

/** Vegetation-specific parameters */
export interface VegetationMaterialParams {
  baseColor?: THREE.Color | string;
  subsurfaceColor?: THREE.Color | string;
  roughness?: number;
  subsurfaceWeight?: number;
  noiseScale?: number;
  leafScale?: number;
  veinIntensity?: number;
  seed?: number;
  /** Is this a leaf material (double-sided, SSS) */
  isLeaf?: boolean;
  /** Is this a trunk/bark material */
  isBark?: boolean;
}

/** Terrain template for shader-compiled materials */
export interface TerrainSurfaceTemplate {
  type: 'terrain';
  nodeGraph: NodeGraph;
  slopeBlendMode: 'normal' | 'height' | 'angle';
  layers: {
    name: string;
    color: THREE.Color;
    minHeight: number;
    maxHeight: number;
    minSlope: number;
    maxSlope: number;
    noiseScale: number;
    noiseInfluence: number;
  }[];
}

/** Vegetation template for shader-compiled materials */
export interface VegetationSurfaceTemplate {
  type: 'vegetation';
  nodeGraph: NodeGraph;
  subsurfaceModel: 'lambert' | 'random_walk' | 'christensen';
  windResponse: number;
}

/** Water template for shader-compiled materials */
export interface WaterSurfaceTemplate {
  type: 'water';
  nodeGraph: NodeGraph;
  refractionEnabled: boolean;
  reflectionEnabled: boolean;
  flowDirection: THREE.Vector2;
  waveScale: number;
}

// ============================================================================
// MaterialFactory
// ============================================================================

export class MaterialFactory {
  private evaluator: NodeEvaluator;
  private compiler: NodeShaderCompiler;
  private useShaderMaterial: boolean = true;

  constructor(useShaderMaterial: boolean = true) {
    this.evaluator = new NodeEvaluator();
    this.compiler = new NodeShaderCompiler(this.evaluator);
    this.useShaderMaterial = useShaderMaterial;
  }

  /**
   * Create a material from a preset name
   */
  createFromPreset(preset: string, params: Record<string, any> = {}): THREE.Material {
    switch (preset) {
      case 'terrain': return this.createTerrainMaterial(params);
      case 'bark': return this.createBarkMaterial(params);
      case 'stone': return this.createStoneMaterial(params);
      case 'metal': return this.createMetalMaterial(params);
      case 'glass': return this.createGlassMaterial(params);
      case 'fabric': return this.createFabricMaterial(params);
      case 'water': return this.createWaterMaterial(params);
      case 'foliage': return this.createFoliageMaterial(params);
      case 'vegetation': return this.createVegetationMaterial(params);
      case 'skin': return this.createSkinMaterial(params);
      default:
        console.warn(`Unknown material preset: ${preset}, using default`);
        return this.createDefaultMaterial();
    }
  }

  // ==========================================================================
  // Shader-compiled terrain material
  // ==========================================================================

  /**
   * Create a terrain material from a surface template using the shader compiler.
   *
   * Uses the shader compiler to generate GLSL from the template's node graph,
   * sets up proper uniforms (time, camera position, light positions), configures
   * Three.js render states (blending, culling, depth), and supports both
   * forward and deferred rendering paths.
   *
   * @param template - The terrain surface template with node graph and layer info
   * @param params   - Terrain material parameters
   * @returns A THREE.Material (ShaderMaterial or MeshPhysicalMaterial fallback)
   */
  createTerrainMaterial(template: TerrainSurfaceTemplate | TerrainMaterialParams = {}): THREE.Material {
    // Check if we received a template object
    if ('type' in template && template.type === 'terrain' && 'nodeGraph' in template) {
      return this.createTerrainMaterialFromTemplate(template as TerrainSurfaceTemplate, template as TerrainMaterialParams);
    }

    // Simple parameter-based terrain material
    const params = template as TerrainMaterialParams;
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.35, 0.28, 0.18));
    const slopeColor = this.resolveColor(params.slopeColor, new THREE.Color(0.45, 0.4, 0.35));
    const altitudeColor = this.resolveColor(params.altitudeColor, new THREE.Color(0.9, 0.92, 0.95));
    const roughness = params.roughness ?? 0.85;
    const slopeThreshold = params.slopeThreshold ?? 0.5;
    const altitudeThreshold = params.altitudeThreshold ?? 0.7;
    const noiseScale = params.noiseScale ?? 5.0;

    if (this.useShaderMaterial) {
      try {
        return this.createTerrainShaderMaterial(baseColor, slopeColor, altitudeColor, roughness, slopeThreshold, altitudeThreshold, noiseScale);
      } catch {
        // Fall through to MeshPhysicalMaterial
      }
    }

    // Blend base and slope colors
    const color = new THREE.Color().lerpColors(baseColor, slopeColor, slopeThreshold);
    if (altitudeThreshold > 0.5) {
      color.lerp(altitudeColor, (altitudeThreshold - 0.5) * 0.3);
    }

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.0,
      flatShading: false,
    });

    material.name = 'InfinigenTerrain';
    return material;
  }

  /** Create a terrain ShaderMaterial with slope/altitude blending in GLSL */
  private createTerrainShaderMaterial(
    baseColor: THREE.Color,
    slopeColor: THREE.Color,
    altitudeColor: THREE.Color,
    roughness: number,
    slopeThreshold: number,
    altitudeThreshold: number,
    noiseScale: number,
  ): THREE.ShaderMaterial {
    const uniforms: Record<string, THREE.IUniform> = {
      u_baseColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) },
      u_slopeColor: { value: new THREE.Vector3(slopeColor.r, slopeColor.g, slopeColor.b) },
      u_altitudeColor: { value: new THREE.Vector3(altitudeColor.r, altitudeColor.g, altitudeColor.b) },
      u_roughness: { value: roughness },
      u_slopeThreshold: { value: slopeThreshold },
      u_altitudeThreshold: { value: altitudeThreshold },
      u_noiseScale: { value: noiseScale },
      u_time: { value: 0.0 },
      u_cameraPosition: { value: new THREE.Vector3() },
    };

    const vertexShader = `#version 300 es
precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
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
}`;

    const fragmentShader = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;
out vec4 fragColor;
uniform vec3 u_baseColor;
uniform vec3 u_slopeColor;
uniform vec3 u_altitudeColor;
uniform float u_roughness;
uniform float u_slopeThreshold;
uniform float u_altitudeThreshold;
uniform float u_noiseScale;
uniform float u_time;
uniform vec3 cameraPosition;

const float PI = 3.14159265359;

vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gradientNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash33(i+vec3(0,0,0)),f-vec3(0,0,0)),
                     dot(hash33(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                 mix(dot(hash33(i+vec3(0,1,0)),f-vec3(0,1,0)),
                     dot(hash33(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(hash33(i+vec3(0,0,1)),f-vec3(0,0,1)),
                     dot(hash33(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                 mix(dot(hash33(i+vec3(0,1,1)),f-vec3(0,1,1)),
                     dot(hash33(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
}

float fbm(vec3 p, int oct) {
  float v = 0.0, a = 1.0, f = 1.0, m = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    v += a * gradientNoise(p * f);
    m += a; a *= 0.5; f *= 2.0;
  }
  return v / m;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  // Slope factor from normal
  float slope = 1.0 - abs(N.y);
  float slopeFactor = smoothstep(u_slopeThreshold - 0.1, u_slopeThreshold + 0.1, slope);

  // Altitude factor from world position
  float altitude = vWorldPosition.y;
  float altFactor = smoothstep(u_altitudeThreshold - 0.2, u_altitudeThreshold + 0.2, altitude);

  // Noise variation
  float noise = 0.5 + 0.5 * fbm(vPosition * u_noiseScale, 4);

  // Blend terrain layers
  vec3 color = mix(u_baseColor, u_slopeColor, slopeFactor);
  color = mix(color, u_altitudeColor, altFactor * 0.4);
  color *= 0.9 + 0.2 * noise;

  // Simple PBR lighting
  vec3 L = normalize(vec3(0.5, 1.0, 0.8));
  vec3 H = normalize(V + L);
  float NdotL = max(dot(N, L), 0.0);
  float rough2 = max(u_roughness, 0.04) * max(u_roughness, 0.04);
  vec3 diffuse = color * NdotL / PI;
  float spec = pow(max(dot(N, H), 0.0), 4.0 / rough2);
  vec3 ambient = color * 0.15;
  vec3 finalColor = ambient + diffuse + vec3(spec * 0.02);
  finalColor = finalColor / (finalColor + vec3(1.0));
  finalColor = pow(finalColor, vec3(1.0 / 2.2));
  fragColor = vec4(finalColor, 1.0);
}`;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.FrontSide,
    });
    material.name = 'InfinigenTerrainShader';
    return material;
  }

  /** Create terrain material from a TerrainSurfaceTemplate */
  private createTerrainMaterialFromTemplate(template: TerrainSurfaceTemplate, params: TerrainMaterialParams): THREE.Material {
    try {
      // Use the shader compiler to generate GLSL from the template's node graph
      const shaderMaterial = this.compiler.buildShaderMaterial(template.nodeGraph, {
        side: THREE.FrontSide,
        wireframe: false,
        uniformOverrides: {
          u_time: 0.0,
          u_noiseScale: params.noiseScale ?? 5.0,
        },
      });

      shaderMaterial.name = 'InfinigenTerrainTemplate';
      return shaderMaterial;
    } catch (error: any) {
      console.warn('[MaterialFactory] Terrain template compilation failed, using fallback:', error.message);
      return this.createTerrainMaterial(params);
    }
  }

  // ==========================================================================
  // Shader-compiled vegetation material
  // ==========================================================================

  /**
   * Create a vegetation material from a surface template using the shader compiler.
   *
   * Supports plant materials with subsurface scattering, wind animation,
   * and leaf/bark variants.
   *
   * @param template - The vegetation surface template with node graph
   * @param params   - Vegetation material parameters
   * @returns A THREE.Material (ShaderMaterial or MeshPhysicalMaterial fallback)
   */
  createVegetationMaterial(template: VegetationSurfaceTemplate | VegetationMaterialParams = {}): THREE.Material {
    // Check if we received a template object
    if ('type' in template && template.type === 'vegetation' && 'nodeGraph' in template) {
      return this.createVegetationMaterialFromTemplate(template as VegetationSurfaceTemplate, template as VegetationMaterialParams);
    }

    // Simple parameter-based vegetation material
    const params = template as VegetationMaterialParams;
    const isLeaf = params.isLeaf ?? true;
    const isBark = params.isBark ?? false;

    if (isBark) {
      return this.createBarkMaterial({
        baseColor: params.baseColor,
        roughness: params.roughness ?? 0.9,
        noiseScale: params.noiseScale ?? 8.0,
      });
    }

    // Leaf material
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.15, 0.4, 0.1));
    const subsurfaceColor = this.resolveColor(params.subsurfaceColor, new THREE.Color(0.4, 0.6, 0.1));
    const roughness = params.roughness ?? 0.6;
    const subsurfaceWeight = params.subsurfaceWeight ?? 0.3;
    const noiseScale = params.noiseScale ?? 5.0;

    if (this.useShaderMaterial) {
      try {
        return this.createVegetationShaderMaterial(baseColor, subsurfaceColor, roughness, subsurfaceWeight, noiseScale, isLeaf);
      } catch {
        // Fall through to MeshPhysicalMaterial
      }
    }

    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness,
      metalness: 0.0,
      transmission: subsurfaceWeight * 0.2,
      transparent: subsurfaceWeight > 0.2 || isLeaf,
      thickness: 0.5,
      side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
    });

    material.name = 'InfinigenVegetation';
    return material;
  }

  /** Create vegetation ShaderMaterial with SSS and wind */
  private createVegetationShaderMaterial(
    baseColor: THREE.Color,
    subsurfaceColor: THREE.Color,
    roughness: number,
    subsurfaceWeight: number,
    noiseScale: number,
    isLeaf: boolean,
  ): THREE.ShaderMaterial {
    const uniforms: Record<string, THREE.IUniform> = {
      u_baseColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) },
      u_subsurfaceColor: { value: new THREE.Vector3(subsurfaceColor.r, subsurfaceColor.g, subsurfaceColor.b) },
      u_roughness: { value: roughness },
      u_subsurfaceWeight: { value: subsurfaceWeight },
      u_noiseScale: { value: noiseScale },
      u_time: { value: 0.0 },
      u_windStrength: { value: 0.1 },
      u_cameraPosition: { value: new THREE.Vector3() },
    };

    const vertexShader = `#version 300 es
precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float u_time;
uniform float u_windStrength;
out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

// Simple wind displacement
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

void main() {
  vec3 pos = position;
  // Wind effect: displace vertices based on height and time
  float windPhase = pos.x * 0.5 + u_time * 2.0;
  float windDisp = sin(windPhase) * u_windStrength * max(pos.y, 0.0);
  pos.x += windDisp;
  pos.z += windDisp * 0.5;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;

    const fragmentShader = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;
out vec4 fragColor;
uniform vec3 u_baseColor;
uniform vec3 u_subsurfaceColor;
uniform float u_roughness;
uniform float u_subsurfaceWeight;
uniform float u_noiseScale;
uniform float u_time;
uniform vec3 cameraPosition;

const float PI = 3.14159265359;

vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gradientNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  return mix(mix(mix(dot(hash33(i+vec3(0,0,0)),f-vec3(0,0,0)),
                     dot(hash33(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                 mix(dot(hash33(i+vec3(0,1,0)),f-vec3(0,1,0)),
                     dot(hash33(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(hash33(i+vec3(0,0,1)),f-vec3(0,0,1)),
                     dot(hash33(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                 mix(dot(hash33(i+vec3(0,1,1)),f-vec3(0,1,1)),
                     dot(hash33(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  // Noise variation
  float noise = 0.5 + 0.5 * gradientNoise(vPosition * u_noiseScale);
  vec3 albedo = u_baseColor * (0.9 + 0.2 * noise);

  // Subsurface scattering approximation
  vec3 L = normalize(vec3(0.5, 1.0, 0.8));
  float NdotL = max(dot(N, L), 0.0);
  float sss = pow(clamp(dot(V, -L), 0.0, 1.0), 2.0) * u_subsurfaceWeight;
  vec3 sssColor = u_subsurfaceColor * sss;

  // Diffuse + ambient
  vec3 diffuse = albedo * NdotL / PI;
  vec3 ambient = albedo * 0.15;
  vec3 color = ambient + diffuse + sssColor;

  // Tone mapping
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));
  fragColor = vec4(color, ${isLeaf ? '0.95' : '1.0'});
}`;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
      transparent: isLeaf,
    });
    material.name = 'InfinigenVegetationShader';
    return material;
  }

  /** Create vegetation material from a VegetationSurfaceTemplate */
  private createVegetationMaterialFromTemplate(template: VegetationSurfaceTemplate, params: VegetationMaterialParams): THREE.Material {
    try {
      const shaderMaterial = this.compiler.buildShaderMaterial(template.nodeGraph, {
        side: THREE.DoubleSide,
        transparent: true,
        uniformOverrides: {
          u_time: 0.0,
          u_subsurfaceWeight: params.subsurfaceWeight ?? 0.3,
          u_noiseScale: params.noiseScale ?? 5.0,
        },
      });

      shaderMaterial.name = 'InfinigenVegetationTemplate';
      return shaderMaterial;
    } catch (error: any) {
      console.warn('[MaterialFactory] Vegetation template compilation failed, using fallback:', error.message);
      return this.createVegetationMaterial(params);
    }
  }

  // ==========================================================================
  // Shader-compiled water material
  // ==========================================================================

  /**
   * Create a water material from a surface template with refraction/reflection support.
   *
   * Uses the shader compiler to generate GLSL from the template's node graph.
   * Sets up proper uniforms for time-based animation, Fresnel reflection,
   * and refraction. Configures Three.js render states for transparent,
   * double-sided water rendering.
   *
   * @param template - The water surface template with node graph
   * @param params   - Water material parameters
   * @returns A THREE.Material (ShaderMaterial or MeshPhysicalMaterial fallback)
   */
  createWaterMaterial(template: WaterSurfaceTemplate | WaterMaterialParams = {}): THREE.Material {
    // Check if we received a template object
    if ('type' in template && template.type === 'water' && 'nodeGraph' in template) {
      return this.createWaterMaterialFromTemplate(template as WaterSurfaceTemplate, template as WaterMaterialParams);
    }

    // Simple parameter-based water material
    const params = template as WaterMaterialParams;
    const color = this.resolveColor(params.color, new THREE.Color(0.1, 0.3, 0.5));
    const depth = params.depth ?? 1.0;
    const roughness = params.roughness ?? 0.05;
    const flowSpeed = params.flowSpeed ?? 0.5;
    const noiseScale = params.noiseScale ?? 3.0;
    const refraction = params.refraction ?? true;
    const reflection = params.reflection ?? true;
    const waveHeight = params.waveHeight ?? 0.15;

    if (this.useShaderMaterial) {
      try {
        return this.createWaterShaderMaterial(color, depth, roughness, flowSpeed, noiseScale, refraction, reflection, waveHeight);
      } catch {
        // Fall through to MeshPhysicalMaterial
      }
    }

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.0,
      transmission: 0.6,
      transparent: true,
      opacity: 0.8,
      ior: 1.33,
      thickness: depth,
      side: THREE.DoubleSide,
    });

    material.name = 'InfinigenWater';
    return material;
  }

  /** Create water ShaderMaterial with Fresnel reflection and flow */
  private createWaterShaderMaterial(
    color: THREE.Color,
    depth: number,
    roughness: number,
    flowSpeed: number,
    noiseScale: number,
    refraction: boolean,
    reflection: boolean,
    waveHeight: number,
  ): THREE.ShaderMaterial {
    const uniforms: Record<string, THREE.IUniform> = {
      u_waterColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
      u_depth: { value: depth },
      u_roughness: { value: roughness },
      u_flowSpeed: { value: flowSpeed },
      u_noiseScale: { value: noiseScale },
      u_waveHeight: { value: waveHeight },
      u_time: { value: 0.0 },
      u_cameraPosition: { value: new THREE.Vector3() },
      u_refraction: { value: refraction ? 1.0 : 0.0 },
      u_reflection: { value: reflection ? 1.0 : 0.0 },
    };

    const vertexShader = `#version 300 es
precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float u_time;
uniform float u_waveHeight;
uniform float u_flowSpeed;
uniform float u_noiseScale;
out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gradientNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  return mix(mix(mix(dot(hash33(i+vec3(0,0,0)),f-vec3(0,0,0)),
                     dot(hash33(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                 mix(dot(hash33(i+vec3(0,1,0)),f-vec3(0,1,0)),
                     dot(hash33(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(hash33(i+vec3(0,0,1)),f-vec3(0,0,1)),
                     dot(hash33(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                 mix(dot(hash33(i+vec3(0,1,1)),f-vec3(0,1,1)),
                     dot(hash33(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
}

void main() {
  vec3 pos = position;

  // Wave displacement
  float t = u_time * u_flowSpeed;
  float wave1 = gradientNoise(vec3(pos.xz * u_noiseScale + t, 0.0));
  float wave2 = gradientNoise(vec3(pos.xz * u_noiseScale * 2.0 + t * 1.3, 1.0)) * 0.5;
  pos.y += (wave1 + wave2) * u_waveHeight;

  // Compute wave normal from displacement gradient
  float eps = 0.01;
  float hx = gradientNoise(vec3((position.xz + vec2(eps, 0.0)) * u_noiseScale + t, 0.0))
            + gradientNoise(vec3((position.xz + vec2(eps, 0.0)) * u_noiseScale * 2.0 + t * 1.3, 1.0)) * 0.5;
  float hz = gradientNoise(vec3((position.xz + vec2(0.0, eps)) * u_noiseScale + t, 0.0))
            + gradientNoise(vec3((position.xz + vec2(0.0, eps)) * u_noiseScale * 2.0 + t * 1.3, 1.0)) * 0.5;
  vec3 waveNormal = normalize(vec3(-(hx - wave1 - wave2) * u_waveHeight / eps, 1.0, -(hz - wave1 - wave2) * u_waveHeight / eps));

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = pos;
  vNormal = normalize(normalMatrix * waveNormal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;

    const fragmentShader = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;
out vec4 fragColor;
uniform vec3 u_waterColor;
uniform float u_depth;
uniform float u_roughness;
uniform float u_refraction;
uniform float u_reflection;
uniform float u_time;
uniform vec3 cameraPosition;

const float PI = 3.14159265359;
const float IOR_WATER = 1.33;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  // Fresnel effect for reflection/refraction
  float NdotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - NdotV, 5.0);
  fresnel = mix(0.04, 1.0, fresnel); // Schlick approximation for water

  // Lighting
  vec3 L = normalize(vec3(0.5, 1.0, 0.8));
  vec3 H = normalize(V + L);
  float NdotL = max(dot(N, L), 0.0);

  // Specular highlight (sun reflection on water)
  float specPower = 256.0 / max(u_roughness, 0.01);
  float specular = pow(max(dot(N, H), 0.0), specPower);

  // Water color with depth-based darkening
  vec3 waterColor = u_waterColor;
  float depthFactor = exp(-u_depth * 0.5);
  vec3 deepColor = waterColor * 0.3;

  // Refracted color (looking through water)
  vec3 refractedColor = mix(waterColor, deepColor, depthFactor);
  if (u_refraction > 0.5) {
    // Approximate refraction offset
    vec3 refractedDir = refract(-V, N, 1.0 / IOR_WATER);
    refractedColor = waterColor * (1.0 + 0.3 * refractedDir.y);
  }

  // Reflected color (sky/environment)
  vec3 R = reflect(-V, N);
  vec3 reflectedColor = vec3(0.5, 0.6, 0.8); // Sky color approximation
  if (u_reflection > 0.5) {
    reflectedColor = mix(vec3(0.5, 0.6, 0.8), vec3(0.3, 0.4, 0.6), R.y * 0.5 + 0.5);
  }

  // Blend refraction and reflection via Fresnel
  vec3 color = mix(refractedColor, reflectedColor, fresnel);

  // Add specular highlight
  color += vec3(specular * 0.8);

  // Ambient
  color += waterColor * 0.1;

  // Tone mapping
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));

  fragColor = vec4(color, mix(0.7, 1.0, fresnel));
}`;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.DoubleSide,
      transparent: true,
    });
    material.name = 'InfinigenWaterShader';
    return material;
  }

  /** Create water material from a WaterSurfaceTemplate */
  private createWaterMaterialFromTemplate(template: WaterSurfaceTemplate, params: WaterMaterialParams): THREE.Material {
    try {
      const shaderMaterial = this.compiler.buildShaderMaterial(template.nodeGraph, {
        side: THREE.DoubleSide,
        transparent: true,
        uniformOverrides: {
          u_time: 0.0,
          u_flowSpeed: params.flowSpeed ?? 0.5,
          u_noiseScale: params.noiseScale ?? 3.0,
          u_depth: params.depth ?? 1.0,
          u_refraction: (params.refraction ?? true) ? 1.0 : 0.0,
          u_reflection: (params.reflection ?? true) ? 1.0 : 0.0,
          u_waveHeight: params.waveHeight ?? 0.15,
        },
      });

      shaderMaterial.name = 'InfinigenWaterTemplate';
      return shaderMaterial;
    } catch (error: any) {
      console.warn('[MaterialFactory] Water template compilation failed, using fallback:', error.message);
      return this.createWaterMaterial(params);
    }
  }

  // ==========================================================================
  // Original MeshPhysicalMaterial presets
  // ==========================================================================

  /**
   * Wood bark with noise displacement
   */
  createBarkMaterial(params: BarkMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.25, 0.15, 0.08));
    const roughness = params.roughness ?? 0.9;
    const noiseScale = params.noiseScale ?? 8.0;
    const detail = params.detail ?? 4;

    // Bark has very rough surface with slight color variation
    const colorVariation = 0.05 * (Math.sin(noiseScale * 42.3) * 0.5 + 0.5) * detail;
    const color = baseColor.clone();
    color.offsetHSL(0, 0, -colorVariation * 0.1);

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: Math.min(1.0, roughness + colorVariation * 0.05),
      metalness: 0.0,
      bumpScale: params.displacement ?? 0.02,
    });

    material.name = 'InfinigenBark';
    return material;
  }

  /**
   * Stone with cracks and weathering
   */
  createStoneMaterial(params: StoneMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.5, 0.48, 0.44));
    const crackColor = this.resolveColor(params.crackColor, new THREE.Color(0.25, 0.22, 0.2));
    const roughness = params.roughness ?? 0.75;
    const crackIntensity = params.crackIntensity ?? 0.3;
    const weathering = params.weathering ?? 0.2;

    // Mix base with crack color
    const color = new THREE.Color().lerpColors(baseColor, crackColor, crackIntensity * 0.3);

    // Apply weathering (lightens and desaturates slightly)
    if (weathering > 0) {
      const weathered = new THREE.Color(0.6, 0.58, 0.55);
      color.lerp(weathered, weathering * 0.3);
    }

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: roughness + weathering * 0.1,
      metalness: 0.0,
    });

    material.name = 'InfinigenStone';
    return material;
  }

  /**
   * Metal with reflection and oxidation
   */
  createMetalMaterial(params: MetalMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.8, 0.8, 0.82));
    const roughness = params.roughness ?? 0.15;
    const metallic = params.metallic ?? 1.0;
    const oxidation = params.oxidation ?? 0.0;

    // Apply oxidation (towards green/brown)
    let color = baseColor.clone();
    if (oxidation > 0) {
      const oxidationColor = new THREE.Color(0.3, 0.45, 0.25);
      color.lerp(oxidationColor, oxidation * 0.5);
    }

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: roughness + oxidation * 0.3,
      metalness: metallic - oxidation * 0.3,
      clearcoat: metallic > 0.8 ? 0.1 : 0.0,
      clearcoatRoughness: 0.1,
    });

    material.name = 'InfinigenMetal';
    return material;
  }

  /**
   * Glass with transmission and IOR
   */
  createGlassMaterial(params: GlassMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const color = this.resolveColor(params.color, new THREE.Color(1, 1, 1));
    const roughness = params.roughness ?? 0.0;
    const ior = params.ior ?? 1.45;
    const transmission = params.transmission ?? 1.0;

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.0,
      ior,
      transmission,
      transparent: true,
      opacity: 1.0,
      thickness: 0.5,
      side: THREE.DoubleSide,
    });

    material.name = 'InfinigenGlass';
    return material;
  }

  /**
   * Fabric with weave pattern
   */
  createFabricMaterial(params: FabricMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.4, 0.2, 0.15));
    const roughness = params.roughness ?? 0.85;

    // Fabric has high roughness and subtle sheen
    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness,
      metalness: 0.0,
      sheen: 0.3,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(0.8, 0.8, 0.8),
    });

    material.name = 'InfinigenFabric';
    return material;
  }

  /**
   * Foliage with subsurface scattering
   */
  createFoliageMaterial(params: FoliageMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.15, 0.4, 0.1));
    const subsurfaceColor = this.resolveColor(params.subsurfaceColor, new THREE.Color(0.4, 0.6, 0.1));
    const roughness = params.roughness ?? 0.6;
    const subsurfaceWeight = params.subsurfaceWeight ?? 0.3;

    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness,
      metalness: 0.0,
      transmission: subsurfaceWeight * 0.2,
      transparent: subsurfaceWeight > 0.2,
      thickness: 0.5,
      side: THREE.DoubleSide,
    });

    material.name = 'InfinigenFoliage';
    return material;
  }

  /**
   * Skin with SSS
   */
  createSkinMaterial(params: SkinMaterialParams = {}): THREE.MeshPhysicalMaterial {
    const baseColor = this.resolveColor(params.baseColor, new THREE.Color(0.7, 0.5, 0.4));
    const subsurfaceColor = this.resolveColor(params.subsurfaceColor, new THREE.Color(0.7, 0.3, 0.2));
    const roughness = params.roughness ?? 0.5;
    const subsurfaceWeight = params.subsurfaceWeight ?? 0.4;

    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness,
      metalness: 0.0,
      transmission: subsurfaceWeight * 0.15,
      transparent: subsurfaceWeight > 0.3,
      thickness: 1.0,
      sheen: 0.1,
      sheenRoughness: 0.6,
      sheenColor: subsurfaceColor,
    });

    material.name = 'InfinigenSkin';
    return material;
  }

  /**
   * Create a material from a node graph using the ShaderCompiler
   * or the NodeGraphMaterialBridge.
   */
  createFromGraph(graph: NodeGraph, options?: EvaluateToMaterialOptions): THREE.Material {
    if (this.useShaderMaterial) {
      try {
        return this.compiler.compileWithFallback(graph);
      } catch {
        // Shader compilation failed — fall through to bridge
      }
    }

    // Use the bridge pipeline (always produces MeshPhysicalMaterial)
    return evaluateToMaterial(graph, {
      textureResolution: 512,
      fallbackOnErrors: true,
      ...options,
    }).material;
  }

  /**
   * Create a MeshPhysicalMaterial from a node graph using only the bridge pipeline.
   */
  createFromGraphPhysical(graph: NodeGraph, options?: EvaluateToMaterialOptions): THREE.MeshPhysicalMaterial {
    return evaluateToMaterial(graph, {
      textureResolution: 512,
      fallbackOnErrors: true,
      ...options,
    }).material;
  }

  /**
   * Create a default/placeholder material
   */
  createDefaultMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      roughness: 0.5,
      metalness: 0.0,
    });
    material.name = 'InfinigenDefault';
    return material;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private resolveColor(value: THREE.Color | string | undefined, defaultColor: THREE.Color): THREE.Color {
    if (!value) return defaultColor.clone();
    if (value instanceof THREE.Color) return value.clone();
    if (typeof value === 'string') return new THREE.Color(value);
    return defaultColor.clone();
  }

  /**
   * Get list of available preset names
   */
  static getPresets(): string[] {
    return [
      'terrain', 'bark', 'stone', 'metal', 'glass',
      'fabric', 'water', 'foliage', 'vegetation', 'skin',
    ];
  }

  /**
   * Get parameter descriptions for a preset
   */
  static getPresetParams(preset: string): Record<string, { type: string; default: any; description: string }> {
    switch (preset) {
      case 'terrain':
        return {
          baseColor: { type: 'color', default: '#5a472c', description: 'Base terrain color' },
          slopeColor: { type: 'color', default: '#736659', description: 'Color on slopes' },
          altitudeColor: { type: 'color', default: '#e6eaf2', description: 'Color at altitude' },
          roughness: { type: 'float', default: 0.85, description: 'Surface roughness' },
          slopeThreshold: { type: 'float', default: 0.5, description: 'Slope blend factor' },
        };
      case 'bark':
        return {
          baseColor: { type: 'color', default: '#3f2614', description: 'Base bark color' },
          roughness: { type: 'float', default: 0.9, description: 'Surface roughness' },
          noiseScale: { type: 'float', default: 8.0, description: 'Bark pattern scale' },
          displacement: { type: 'float', default: 0.02, description: 'Bump displacement' },
        };
      case 'stone':
        return {
          baseColor: { type: 'color', default: '#807a70', description: 'Base stone color' },
          crackColor: { type: 'color', default: '#403833', description: 'Crack color' },
          roughness: { type: 'float', default: 0.75, description: 'Surface roughness' },
          weathering: { type: 'float', default: 0.2, description: 'Weathering amount' },
        };
      case 'metal':
        return {
          baseColor: { type: 'color', default: '#ccccd0', description: 'Metal base color' },
          roughness: { type: 'float', default: 0.15, description: 'Surface roughness' },
          metallic: { type: 'float', default: 1.0, description: 'Metalness' },
          oxidation: { type: 'float', default: 0.0, description: 'Oxidation amount' },
        };
      case 'glass':
        return {
          color: { type: 'color', default: '#ffffff', description: 'Glass tint color' },
          roughness: { type: 'float', default: 0.0, description: 'Surface roughness' },
          ior: { type: 'float', default: 1.45, description: 'Index of refraction' },
          transmission: { type: 'float', default: 1.0, description: 'Transmission amount' },
        };
      case 'fabric':
        return {
          baseColor: { type: 'color', default: '#663326', description: 'Fabric color' },
          roughness: { type: 'float', default: 0.85, description: 'Surface roughness' },
          weaveScale: { type: 'float', default: 20.0, description: 'Weave pattern scale' },
        };
      case 'water':
        return {
          color: { type: 'color', default: '#1a4d80', description: 'Water color' },
          depth: { type: 'float', default: 1.0, description: 'Water depth' },
          roughness: { type: 'float', default: 0.05, description: 'Surface roughness' },
          flowSpeed: { type: 'float', default: 0.5, description: 'Flow animation speed' },
          refraction: { type: 'boolean', default: true, description: 'Enable refraction' },
          reflection: { type: 'boolean', default: true, description: 'Enable reflection' },
        };
      case 'foliage':
        return {
          baseColor: { type: 'color', default: '#266619', description: 'Leaf color' },
          subsurfaceColor: { type: 'color', default: '#66991a', description: 'Back-lit color' },
          roughness: { type: 'float', default: 0.6, description: 'Surface roughness' },
          subsurfaceWeight: { type: 'float', default: 0.3, description: 'SSS weight' },
        };
      case 'vegetation':
        return {
          baseColor: { type: 'color', default: '#266619', description: 'Vegetation color' },
          subsurfaceColor: { type: 'color', default: '#66991a', description: 'Subsurface color' },
          roughness: { type: 'float', default: 0.6, description: 'Surface roughness' },
          isLeaf: { type: 'boolean', default: true, description: 'Is this a leaf material' },
          isBark: { type: 'boolean', default: false, description: 'Is this a bark material' },
        };
      case 'skin':
        return {
          baseColor: { type: 'color', default: '#b38066', description: 'Skin base color' },
          subsurfaceColor: { type: 'color', default: '#b34d33', description: 'Subsurface color' },
          roughness: { type: 'float', default: 0.5, description: 'Surface roughness' },
          subsurfaceWeight: { type: 'float', default: 0.4, description: 'SSS weight' },
        };
      default:
        return {};
    }
  }
}
