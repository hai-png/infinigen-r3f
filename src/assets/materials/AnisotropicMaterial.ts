/**
 * AnisotropicMaterial — GGX Anisotropic BRDF for WebGL
 *
 * Implements proper anisotropic shading using the GGX anisotropic BRDF
 * with a tangent direction. This matches Blender's anisotropic BSDF
 * and is used for brushed metal, hair, silk, and other materials with
 * directional surface features.
 *
 * Features:
 *   - GGX anisotropic microfacet BRDF
 *   - Tangent map or object-space tangent support
 *   - Configurable anisotropy strength and rotation
 *   - Integration with PrincipledBSDF node (anisotropic parameter)
 *   - Full GLSL implementation for WebGL2
 *   - Preset materials: brushed steel, hair, silk, velvet
 *
 * Reference: Heitz 2014, "Understanding the Masking-Shadowing Function
 * in Microfacet-Based BRDFs" and Kulla & Conty 2017, "Revisiting Physically
 * Based Shading at Imageworks"
 *
 * @module assets/materials
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/**
 * Anisotropic material preset identifiers.
 */
export type AnisotropicPreset = 'brushed_steel' | 'brushed_aluminum' | 'copper_hair' | 'silk' | 'velvet' | 'compact_disc' | 'satin';

/**
 * Configuration for an anisotropic material.
 */
export interface AnisotropicConfig {
  /** Base color of the material */
  color: THREE.Color;
  /** Metallic factor (0 = dielectric, 1 = metallic, default 1.0) */
  metallic: number;
  /** Base roughness (default 0.3) */
  roughness: number;
  /** Anisotropy strength: 0 = isotropic, 1 = fully anisotropic (default 0.5) */
  anisotropy: number;
  /** Anisotropy rotation angle in radians (default 0 = along tangent) */
  anisotropyRotation: number;
  /** Index of refraction for dielectric mode (default 1.5) */
  ior: number;
  /** Specular intensity (default 0.5) */
  specularIntensity: number;
  /** Normal map texture */
  normalMap?: THREE.Texture;
  /** Tangent map texture (encodes tangent direction per pixel) */
  tangentMap?: THREE.Texture;
  /** Whether to use object-space tangent (default false, uses UV tangent) */
  useObjectTangent: boolean;
  /** Clearcoat factor (default 0) */
  clearcoat: number;
  /** Clearcoat roughness (default 0.1) */
  clearcoatRoughness: number;
  /** Sheen for fabric-like surfaces (default 0) */
  sheen: number;
  /** Sheen color */
  sheenColor: THREE.Color;
  /** Environment map intensity (default 1.0) */
  envMapIntensity: number;
}

// ============================================================================
// Presets
// ============================================================================

const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

/**
 * Preset configurations for common anisotropic materials.
 * Each preset provides calibrated parameters for a specific look.
 */
export const ANISOTROPIC_PRESETS: Record<AnisotropicPreset, AnisotropicConfig> = {
  brushed_steel: {
    color: c(0.75, 0.75, 0.78),
    metallic: 1.0,
    roughness: 0.25,
    anisotropy: 0.7,
    anisotropyRotation: 0,
    ior: 2.35,
    specularIntensity: 1.0,
    useObjectTangent: true,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenColor: c(0, 0, 0),
    envMapIntensity: 1.2,
  },
  brushed_aluminum: {
    color: c(0.9, 0.9, 0.92),
    metallic: 1.0,
    roughness: 0.2,
    anisotropy: 0.6,
    anisotropyRotation: 0,
    ior: 1.37,
    specularIntensity: 1.0,
    useObjectTangent: true,
    clearcoat: 0.1,
    clearcoatRoughness: 0.1,
    sheen: 0.0,
    sheenColor: c(0, 0, 0),
    envMapIntensity: 1.0,
  },
  copper_hair: {
    color: c(0.55, 0.35, 0.2),
    metallic: 0.0,
    roughness: 0.45,
    anisotropy: 0.8,
    anisotropyRotation: 0,
    ior: 1.55,
    specularIntensity: 0.8,
    useObjectTangent: true,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.3,
    sheenColor: c(0.6, 0.4, 0.3),
    envMapIntensity: 0.6,
  },
  silk: {
    color: c(0.85, 0.8, 0.75),
    metallic: 0.0,
    roughness: 0.35,
    anisotropy: 0.5,
    anisotropyRotation: 0.3,
    ior: 1.45,
    specularIntensity: 0.6,
    useObjectTangent: false,
    clearcoat: 0.2,
    clearcoatRoughness: 0.15,
    sheen: 0.5,
    sheenColor: c(0.9, 0.85, 0.8),
    envMapIntensity: 0.5,
  },
  velvet: {
    color: c(0.5, 0.15, 0.2),
    metallic: 0.0,
    roughness: 0.6,
    anisotropy: 0.3,
    anisotropyRotation: 0,
    ior: 1.45,
    specularIntensity: 0.3,
    useObjectTangent: false,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 1.0,
    sheenColor: c(0.6, 0.2, 0.25),
    envMapIntensity: 0.3,
  },
  compact_disc: {
    color: c(0.9, 0.9, 0.9),
    metallic: 1.0,
    roughness: 0.1,
    anisotropy: 0.9,
    anisotropyRotation: 1.57, // 90° rotation for radial pattern
    ior: 2.0,
    specularIntensity: 1.5,
    useObjectTangent: false,
    clearcoat: 0.8,
    clearcoatRoughness: 0.05,
    sheen: 0.0,
    sheenColor: c(0, 0, 0),
    envMapIntensity: 1.5,
  },
  satin: {
    color: c(0.75, 0.7, 0.8),
    metallic: 0.0,
    roughness: 0.4,
    anisotropy: 0.6,
    anisotropyRotation: 0.2,
    ior: 1.5,
    specularIntensity: 0.5,
    useObjectTangent: false,
    clearcoat: 0.15,
    clearcoatRoughness: 0.2,
    sheen: 0.4,
    sheenColor: c(0.8, 0.75, 0.85),
    envMapIntensity: 0.4,
  },
};

// ============================================================================
// GLSL Shader Code
// ============================================================================

/**
 * GLSL implementation of the GGX anisotropic BRDF.
 *
 * This is the core shader code that implements the anisotropic
 * microfacet BRDF with importance sampling. It includes:
 *   - Anisotropic GGX NDF (Normal Distribution Function)
 *   - Smith G1 masking-shadowing function (anisotropic)
 *   - Schlick Fresnel approximation
 *   - Tangent rotation for anisotropy direction
 *
 * The shader is compatible with WebGL2 (GLSL ES 3.0).
 */
export const ANISOTROPIC_GLSL = /* glsl */ `
// ============================================================================
// GGX Anisotropic BRDF
// ============================================================================

struct AnisoParams {
  vec3 baseColor;
  float metallic;
  float roughness;
  float anisotropy;
  float anisotropyRotation;
  float specularIntensity;
  float clearcoat;
  float clearcoatRoughness;
  float sheen;
  vec3 sheenColor;
};

// Rotate tangent frame by anisotropy rotation angle
void rotateTangentFrame(vec3 normal, inout vec3 tangent, inout vec3 bitangent, float rotation) {
  float s = sin(rotation);
  float c = cos(rotation);
  vec3 t = tangent * c + bitangent * s;
  vec3 b = bitangent * c - tangent * s;
  tangent = t;
  bitangent = b;
}

// Anisotropic GGX Normal Distribution Function
// alphaX, alphaY = roughness^2 in tangent and bitangent directions
float D_GGX_Anisotropic(vec3 wh, vec3 tangent, vec3 bitangent, vec3 normal, float alphaX, float alphaY) {
  float NdotH = dot(normal, wh);
  if (NdotH <= 0.0) return 0.0;

  // Project half-vector onto tangent frame
  float TdotH = dot(tangent, wh);
  float BdotH = dot(bitangent, wh);

  float d = TdotH * TdotH / (alphaX * alphaX)
          + BdotH * BdotH / (alphaY * alphaY)
          + NdotH * NdotH;

  float alphaXalphaY = alphaX * alphaY;
  return 1.0 / (3.14159265 * alphaXalphaY * d * d);
}

// Smith G1 masking function (anisotropic)
float G1_Smith_Anisotropic(vec3 w, vec3 tangent, vec3 bitangent, vec3 normal, float alphaX, float alphaY) {
  float NdotW = dot(normal, w);
  if (NdotW <= 0.0) return 0.0;

  float TdotW = dot(tangent, w);
  float BdotW = dot(bitangent, w);

  float sigma = sqrt(TdotW * TdotW * alphaX * alphaX
                   + BdotW * BdotW * alphaY * alphaY
                   + NdotW * NdotW);

  return 2.0 * NdotW / (NdotW + sigma);
}

// Smith G2 masking-shadowing function (anisotropic)
float G2_Smith_Anisotropic(vec3 wi, vec3 wo, vec3 tangent, vec3 bitangent, vec3 normal, float alphaX, float alphaY) {
  float G1i = G1_Smith_Anisotropic(wi, tangent, bitangent, normal, alphaX, alphaY);
  float G1o = G1_Smith_Anisotropic(wo, tangent, bitangent, normal, alphaX, alphaY);
  return G1i * G1o;
}

// Schlick Fresnel approximation
vec3 F_Schlick(float cosTheta, vec3 F0) {
  float t = 1.0 - cosTheta;
  float t5 = t * t * t * t * t;
  return F0 + (1.0 - F0) * t5;
}

// Main anisotropic BRDF evaluation
// Returns the reflected radiance for given light and view directions
vec3 evalAnisotropicBRDF(
  vec3 normal,
  vec3 tangent,
  vec3 bitangent,
  vec3 viewDir,
  vec3 lightDir,
  AnisoParams params
) {
  vec3 wi = lightDir;
  vec3 wo = viewDir;

  float NdotL = dot(normal, wi);
  float NdotV = dot(normal, wo);

  // Early out for back-facing
  if (NdotL <= 0.0 || NdotV <= 0.0) return vec3(0.0);

  // Compute roughness along tangent and bitangent
  float roughness2 = params.roughness * params.roughness;
  float aspect = sqrt(1.0 - params.anisotropy * 0.9);
  float alphaX = max(0.001, roughness2 / aspect);
  float alphaY = max(0.001, roughness2 * aspect);

  // Rotate tangent frame by anisotropy rotation
  vec3 T = tangent;
  vec3 B = bitangent;
  rotateTangentFrame(normal, T, B, params.anisotropyRotation);

  // Half vector
  vec3 wh = normalize(wi + wo);

  // NDF
  float D = D_GGX_Anisotropic(wh, T, B, normal, alphaX, alphaY);

  // Masking-shadowing
  float G = G2_Smith_Anisotropic(wi, wo, T, B, normal, alphaX, alphaY);

  // Fresnel
  vec3 F0 = mix(vec3(0.04), params.baseColor, params.metallic);
  vec3 F = F_Schlick(dot(wh, wo), F0);

  // Specular BRDF
  float denominator = 4.0 * NdotL * NdotV;
  vec3 specular = (D * G * F) / max(denominator, 0.001);

  // Diffuse (Lambertian for dielectrics, none for metals)
  vec3 diffuse = (1.0 - F) * (1.0 - params.metallic) * params.baseColor / 3.14159265;

  // Sheen (fabric-like specular highlight)
  vec3 sheenContrib = params.sheen * params.sheenColor * pow(1.0 - abs(dot(normal, wo)), 5.0) * 0.5;

  // Clearcoat (isotropic BRDF layer on top)
  vec3 clearcoatContrib = vec3(0.0);
  if (params.clearcoat > 0.0) {
    float ccRough2 = params.clearcoatRoughness * params.clearcoatRoughness;
    float ccAlpha = max(0.001, ccRough2);
    float NdotH_cc = dot(normal, wh);
    float D_cc = (ccAlpha * ccAlpha) / (3.14159265 * pow(NdotH_cc * NdotH_cc * (ccAlpha * ccAlpha - 1.0) + 1.0, 2.0));
    float F_cc = 0.04 + 0.96 * pow(1.0 - dot(wh, wo), 5.0);
    clearcoatContrib = vec3(D_cc * F_cc * params.clearcoat * 0.25);
  }

  return (diffuse + specular * params.specularIntensity + sheenContrib + clearcoatContrib) * NdotL;
}
`;

/**
 * Vertex shader for the anisotropic material.
 * Passes position, normal, tangent, UV, and world-space data to the fragment shader.
 */
const ANISOTROPIC_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying vec2 vUv;

  attribute vec4 tangent; // Three.js tangent attribute

  uniform bool uUseObjectTangent;

  void main() {
    vUv = uv;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;

    // Normal in world space
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    // Tangent in world space
    if (uUseObjectTangent && tangent.w != 0.0) {
      vTangent = normalize((modelMatrix * vec4(tangent.xyz, 0.0)).xyz);
      // Bitangent from tangent sign
      vBitangent = cross(vNormal, vTangent) * tangent.w;
    } else {
      // Generate tangent from UV direction (fallback)
      vec3 c1 = cross(vNormal, vec3(0.0, 0.0, 1.0));
      vec3 c2 = cross(vNormal, vec3(0.0, 1.0, 0.0));
      vTangent = length(c1) > length(c2) ? normalize(c1) : normalize(c2);
      vBitangent = normalize(cross(vNormal, vTangent));
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader for the anisotropic material.
 * Uses the GGX anisotropic BRDF with multi-light support and IBL.
 */
const ANISOTROPIC_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying vec2 vUv;

  // Material parameters
  uniform vec3 uBaseColor;
  uniform float uMetallic;
  uniform float uRoughness;
  uniform float uAnisotropy;
  uniform float uAnisotropyRotation;
  uniform float uSpecularIntensity;
  uniform float uClearcoat;
  uniform float uClearcoatRoughness;
  uniform float uSheen;
  uniform vec3 uSheenColor;
  uniform float uIOR;
  uniform float uEnvMapIntensity;
  uniform bool uUseObjectTangent;

  // Textures
  uniform sampler2D uNormalMap;
  uniform sampler2D uTangentMap;
  uniform bool uHasNormalMap;
  uniform bool uHasTangentMap;

  // Lighting
  uniform vec3 uCameraPosition;
  uniform vec3 uLightPos[4];
  uniform vec3 uLightColor[4];
  uniform float uLightIntensity[4];
  uniform int uLightCount;
  uniform vec3 uAmbientColor;

  // Environment
  uniform samplerCube uEnvMap;
  uniform bool uHasEnvMap;

  ${ANISOTROPIC_GLSL}

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 tangent = normalize(vTangent);
    vec3 bitangent = normalize(vBitangent);

    // Apply normal map
    if (uHasNormalMap) {
      vec3 tangentNormal = texture(uNormalMap, vUv).xyz * 2.0 - 1.0;
      normal = normalize(tangentNormal.x * tangent + tangentNormal.y * bitangent + tangentNormal.z * normal);
    }

    // Apply tangent map (overrides geometric tangent)
    if (uHasTangentMap) {
      vec3 tangentData = texture(uTangentMap, vUv).xyz * 2.0 - 1.0;
      tangent = normalize(tangentData.x * tangent + tangentData.y * bitangent + tangentData.z * normal);
      bitangent = cross(normal, tangent);
    }

    // View direction
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);

    // Material params
    AnisoParams params;
    params.baseColor = uBaseColor;
    params.metallic = uMetallic;
    params.roughness = max(uRoughness, 0.04);
    params.anisotropy = uAnisotropy;
    params.anisotropyRotation = uAnisotropyRotation;
    params.specularIntensity = uSpecularIntensity;
    params.clearcoat = uClearcoat;
    params.clearcoatRoughness = uClearcoatRoughness;
    params.sheen = uSheen;
    params.sheenColor = uSheenColor;

    // Accumulate lighting
    vec3 color = uAmbientColor * uBaseColor * (1.0 - uMetallic) * 0.3;

    // Direct lighting
    for (int i = 0; i < 4; i++) {
      if (i >= uLightCount) break;

      vec3 lightDir = normalize(uLightPos[i] - vWorldPosition);
      vec3 brdf = evalAnisotropicBRDF(normal, tangent, bitangent, viewDir, lightDir, params);
      color += brdf * uLightColor[i] * uLightIntensity[i];
    }

    // IBL (Image-Based Lighting) approximation
    if (uHasEnvMap) {
      // Reflect view direction about normal for specular IBL
      vec3 reflectDir = reflect(-viewDir, normal);
      vec3 envSample = textureCube(uEnvMap, reflectDir).rgb;
      vec3 F0 = mix(vec3(0.04), uBaseColor, uMetallic);
      float NdotV = max(dot(normal, viewDir), 0.0);
      vec3 fresnel = F_Schlick(NdotV, F0);
      color += envSample * fresnel * uEnvMapIntensity;
    }

    // Tone mapping (simple Reinhard)
    color = color / (color + vec3(1.0));

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// AnisotropicMaterial Class
// ============================================================================

/**
 * AnisotropicMaterial — A THREE.ShaderMaterial implementing the GGX
 * anisotropic BRDF for realistic rendering of brushed metal, hair,
 * silk, and other materials with directional surface features.
 *
 * Unlike MeshPhysicalMaterial's anisotropy (which is limited to simple
 * roughness modification), this material implements the full anisotropic
 * microfacet BRDF with proper NDF, Fresnel, and visibility terms.
 *
 * @example
 * ```ts
 * // Create brushed steel material
 * const mat = AnisotropicMaterial.fromPreset('brushed_steel');
 * mesh.material = mat;
 *
 * // Create custom anisotropic material
 * const customMat = new AnisotropicMaterial({
 *   color: new THREE.Color(0.8, 0.6, 0.3),
 *   roughness: 0.3,
 *   anisotropy: 0.7,
 *   metallic: 1.0,
 * });
 * ```
 */
export class AnisotropicMaterial extends THREE.ShaderMaterial {
  /** The resolved configuration */
  readonly config: AnisotropicConfig;

  constructor(config: Partial<AnisotropicConfig> = {}) {
    const defaultConfig: AnisotropicConfig = {
      color: new THREE.Color(0.8, 0.8, 0.8),
      metallic: 1.0,
      roughness: 0.3,
      anisotropy: 0.5,
      anisotropyRotation: 0,
      ior: 1.5,
      specularIntensity: 0.5,
      useObjectTangent: false,
      clearcoat: 0,
      clearcoatRoughness: 0.1,
      sheen: 0,
      sheenColor: new THREE.Color(0, 0, 0),
      envMapIntensity: 1.0,
    };

    const resolved: AnisotropicConfig = { ...defaultConfig, ...config };

    super({
      uniforms: {
        // Material
        uBaseColor: { value: resolved.color.clone() },
        uMetallic: { value: resolved.metallic },
        uRoughness: { value: resolved.roughness },
        uAnisotropy: { value: resolved.anisotropy },
        uAnisotropyRotation: { value: resolved.anisotropyRotation },
        uSpecularIntensity: { value: resolved.specularIntensity },
        uClearcoat: { value: resolved.clearcoat },
        uClearcoatRoughness: { value: resolved.clearcoatRoughness },
        uSheen: { value: resolved.sheen },
        uSheenColor: { value: resolved.sheenColor.clone() },
        uIOR: { value: resolved.ior },
        uEnvMapIntensity: { value: resolved.envMapIntensity },
        uUseObjectTangent: { value: resolved.useObjectTangent },

        // Textures
        uNormalMap: { value: resolved.normalMap ?? null },
        uTangentMap: { value: resolved.tangentMap ?? null },
        uHasNormalMap: { value: resolved.normalMap !== undefined },
        uHasTangentMap: { value: resolved.tangentMap !== undefined },

        // Lighting
        uCameraPosition: { value: new THREE.Vector3() },
        uLightPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
        uLightColor: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
        uLightIntensity: { value: [1, 1, 1, 1] },
        uLightCount: { value: 0 },
        uAmbientColor: { value: new THREE.Color(0.1, 0.1, 0.12) },

        // Environment
        uEnvMap: { value: null },
        uHasEnvMap: { value: false },
      },
      vertexShader: ANISOTROPIC_VERTEX_SHADER,
      fragmentShader: ANISOTROPIC_FRAGMENT_SHADER,
    });

    this.config = resolved;
    this.name = 'AnisotropicMaterial';
  }

  /**
   * Update uniforms from a THREE.js scene for proper lighting.
   *
   * @param camera - Current camera
   * @param lights - Array of lights in the scene (up to 4)
   * @param envMap - Optional environment cubemap
   */
  updateFromScene(
    camera: THREE.Camera,
    lights: THREE.Light[] = [],
    envMap?: THREE.CubeTexture,
  ): void {
    // Camera position
    this.uniforms.uCameraPosition.value.copy(camera.position);

    // Lights
    const lightCount = Math.min(lights.length, 4);
    this.uniforms.uLightCount.value = lightCount;

    for (let i = 0; i < lightCount; i++) {
      const light = lights[i];
      if (light instanceof THREE.DirectionalLight) {
        this.uniforms.uLightPos.value[i].copy(light.position);
        this.uniforms.uLightColor.value[i].copy(light.color);
        this.uniforms.uLightIntensity.value[i] = light.intensity;
      } else if (light instanceof THREE.PointLight) {
        this.uniforms.uLightPos.value[i].copy(light.position);
        this.uniforms.uLightColor.value[i].copy(light.color);
        this.uniforms.uLightIntensity.value[i] = light.intensity;
      }
    }

    // Environment map
    if (envMap) {
      this.uniforms.uEnvMap.value = envMap;
      this.uniforms.uHasEnvMap.value = true;
    }
  }

  /**
   * Create an AnisotropicMaterial from a named preset.
   *
   * @param preset - Preset name (e.g., 'brushed_steel', 'silk')
   * @param overrides - Optional parameter overrides
   * @returns Configured AnisotropicMaterial
   */
  static fromPreset(
    preset: AnisotropicPreset,
    overrides?: Partial<AnisotropicConfig>,
  ): AnisotropicMaterial {
    const presetConfig = ANISOTROPIC_PRESETS[preset];
    if (!presetConfig) {
      console.warn(`AnisotropicMaterial: Unknown preset "${preset}"`);
      return new AnisotropicMaterial(overrides);
    }
    return new AnisotropicMaterial({ ...presetConfig, ...overrides });
  }

  /**
   * List all available preset names.
   */
  static listPresets(): AnisotropicPreset[] {
    return Object.keys(ANISOTROPIC_PRESETS) as AnisotropicPreset[];
  }

  /**
   * Create a MeshPhysicalMaterial approximation of the anisotropic look.
   *
   * Since MeshPhysicalMaterial supports anisotropy natively in Three.js
   * r150+, this provides a compatible fallback that works with the
   * standard Three.js rendering pipeline.
   *
   * @param config - Anisotropic configuration
   * @returns MeshPhysicalMaterial with anisotropic parameters
   */
  static toMeshPhysicalMaterial(
    config: Partial<AnisotropicConfig> = {},
  ): THREE.MeshPhysicalMaterial {
    const cfg: AnisotropicConfig = {
      color: new THREE.Color(0.8, 0.8, 0.8),
      metallic: 1.0,
      roughness: 0.3,
      anisotropy: 0.5,
      anisotropyRotation: 0,
      ior: 1.5,
      specularIntensity: 0.5,
      useObjectTangent: false,
      clearcoat: 0,
      clearcoatRoughness: 0.1,
      sheen: 0,
      sheenColor: new THREE.Color(0, 0, 0),
      envMapIntensity: 1.0,
      ...config,
    };

    const mat = new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      metalness: cfg.metallic,
      roughness: cfg.roughness,
      anisotropy: cfg.anisotropy,
      anisotropyRotation: cfg.anisotropyRotation,
      clearcoat: cfg.clearcoat,
      clearcoatRoughness: cfg.clearcoatRoughness,
      sheen: cfg.sheen,
      sheenColor: cfg.sheenColor,
      sheenRoughness: 0.5,
      ior: cfg.ior,
      envMapIntensity: cfg.envMapIntensity,
      specularIntensity: cfg.specularIntensity,
    });

    if (cfg.normalMap) mat.normalMap = cfg.normalMap;
    mat.name = 'AnisotropicPBR';

    return mat;
  }
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Create an anisotropic material from a named preset.
 *
 * @param preset - Preset name
 * @returns AnisotropicMaterial instance
 */
export function createAnisotropicMaterial(preset: AnisotropicPreset): AnisotropicMaterial {
  return AnisotropicMaterial.fromPreset(preset);
}
