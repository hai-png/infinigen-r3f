/**
 * TriplanarProjection - GLSL functions for triplanar texture projection
 *
 * Projects textures from 3 world-space planes (XY, XZ, YZ) and blends
 * based on surface normal direction. This eliminates UV seams on arbitrary
 * mesh orientations, which is critical for 3D material evaluation where
 * Object/Generated/World coordinates are used instead of 2D UVs.
 *
 * The blending uses a power-based weight function to create smooth transitions
 * between the three projection planes without visible seams. The default
 * blend exponent of 8.0 gives a sharp but smooth transition that avoids
 * the "smear" artifacts of lower exponents while still being seamless.
 *
 * Enhancements over basic triplanar:
 * - Improved seam handling with offset-blend technique to avoid
 *   the "triple-imaging" artifact at blend boundaries
 * - Proper normal map triplanar projection with tangent-space reorientation
 * - 4D noise evaluation support (3D position + time/seed)
 * - Area light support helpers
 * - Forward and deferred rendering compatible
 */

// ============================================================================
// GLSL Triplanar Projection Code (injectable string)
// ============================================================================

/**
 * Complete triplanar projection GLSL functions.
 * Inject this into fragment shaders that need 3D texture coordinates.
 */
export const TRIPLANAR_GLSL = `
// ============================================================================
// Triplanar Projection - GLSL Functions
// ============================================================================

/**
 * Compute triplanar blend weights from a surface normal.
 * Uses power-based weighting for sharp but seamless transitions.
 * Higher blendExponent = sharper transitions between planes.
 *
 * @param N - Surface normal (normalized)
 * @param blendExponent - Sharpness of blend (default 8.0)
 * @return vec3 weights - Blend weights for XY, XZ, YZ planes
 */
vec3 triplanarWeights(vec3 N, float blendExponent) {
  vec3 absN = abs(N);
  // Apply exponent for sharper transitions
  vec3 w = pow(absN, vec3(blendExponent));
  // Normalize so weights sum to 1
  float sum = w.x + w.y + w.z;
  return (sum > 0.0001) ? w / sum : vec3(1.0 / 3.0);
}

/**
 * Triplanar projection for a scalar (float) value.
 * Samples the same function/texture on all three planes and blends.
 *
 * @param p - 3D position (world or object space)
 * @param N - Surface normal (normalized)
 * @param scale - Texture scale factor
 * @param blendExponent - Blend sharpness (default 8.0)
 * @param sampleFunc - A function that takes vec2 and returns float
 *
 * Usage pattern:
 *   float result = triplanarFloat(position, normal, 1.0, 8.0, myNoiseFunc);
 *   where myNoiseFunc is defined as: float myNoiseFunc(vec2 uv) { ... }
 */
float triplanarFloat(vec3 p, vec3 N, float scale, float blendExponent,
                     float sampleFunc(vec2)) {
  vec3 w = triplanarWeights(N, blendExponent);
  float xy = sampleFunc(p.xy * scale);
  float xz = sampleFunc(p.xz * scale);
  float yz = sampleFunc(p.yz * scale);
  return w.z * xy + w.y * xz + w.x * yz;
}

/**
 * Triplanar projection for a vec3 (color) value.
 * Samples the same function/texture on all three planes and blends.
 *
 * @param p - 3D position (world or object space)
 * @param N - Surface normal (normalized)
 * @param scale - Texture scale factor
 * @param blendExponent - Blend sharpness (default 8.0)
 * @param sampleFunc - A function that takes vec2 and returns vec3
 */
vec3 triplanarVec3(vec3 p, vec3 N, float scale, float blendExponent,
                    vec3 sampleFunc(vec2)) {
  vec3 w = triplanarWeights(N, blendExponent);
  vec3 xy = sampleFunc(p.xy * scale);
  vec3 xz = sampleFunc(p.xz * scale);
  vec3 yz = sampleFunc(p.yz * scale);
  return w.z * xy + w.y * xz + w.x * yz;
}

/**
 * Triplanar texture sampling for a sampler2D (color).
 * Standard triplanar projection that samples the same texture
 * on all three world-space planes and blends based on the normal.
 *
 * @param tex - Texture sampler
 * @param p - 3D position
 * @param N - Surface normal (normalized)
 * @param scale - Texture scale
 * @param blendExponent - Blend sharpness
 * @return vec4 - Blended texture color
 */
vec4 triplanarTexture(sampler2D tex, vec3 p, vec3 N, float scale,
                      float blendExponent) {
  vec3 w = triplanarWeights(N, blendExponent);
  vec4 xy = texture(tex, p.xy * scale);
  vec4 xz = texture(tex, p.xz * scale);
  vec4 yz = texture(tex, p.yz * scale);
  return w.z * xy + w.y * xz + w.x * yz;
}

/**
 * Triplanar normal map projection.
 * Unlike color projection, normal maps need their tangent-space normals
 * reoriented to match the projection plane before blending.
 * This prevents inverted or "swimming" normals at blend seams.
 *
 * Uses proper tangent-frame reconstruction for each projection plane
 * to avoid the "inverted normal" artifact at blend boundaries.
 *
 * @param tex - Normal map sampler
 * @param p - 3D position
 * @param N - Surface normal (geometric, normalized)
 * @param scale - Texture scale
 * @param blendExponent - Blend sharpness
 * @param normalStrength - Normal map intensity
 * @return vec3 - Perturbed normal in world space
 */
vec3 triplanarNormal(sampler2D tex, vec3 p, vec3 N, float scale,
                     float blendExponent, float normalStrength) {
  vec3 w = triplanarWeights(N, blendExponent);

  // Sample normal map on each plane
  vec3 txy = texture(tex, p.xy * scale).rgb * 2.0 - 1.0;
  vec3 txz = texture(tex, p.xz * scale).rgb * 2.0 - 1.0;
  vec3 tyz = texture(tex, p.yz * scale).rgb * 2.0 - 1.0;

  // Apply normal strength
  txy = mix(vec3(0.0, 0.0, 1.0), txy, normalStrength);
  txz = mix(vec3(0.0, 0.0, 1.0), txz, normalStrength);
  tyz = mix(vec3(0.0, 0.0, 1.0), tyz, normalStrength);

  // Reorient tangent-space normals to world space for each plane
  // XY plane: tangent=(1,0,0), bitangent=(0,1,0), normal=(0,0,1)
  // The sampled normal is in tangent space where Z is "up" from the plane
  vec3 nxy = normalize(vec3(txy.x, txy.y, txy.z));

  // XZ plane: tangent=(1,0,0), bitangent=(0,0,1), normal=(0,1,0)
  vec3 nxz = normalize(vec3(txz.x, txz.z, txz.y));

  // YZ plane: tangent=(0,0,1), bitangent=(0,1,0), normal=(1,0,0)
  vec3 nyz = normalize(vec3(tyz.z, tyz.y, tyz.x));

  // Blend the reoriented normals
  vec3 blended = w.z * nxy + w.y * nxz + w.x * nyz;
  return normalize(blended);
}

/**
 * Compute triplanar blend weights with bias to avoid equal-weight artifacts.
 * When the normal is near-axis-aligned, pushes weights more aggressively
 * toward the dominant axis, reducing the "triple-imaging" artifact.
 *
 * @param N - Surface normal (normalized)
 * @param blendExponent - Blend sharpness (default 8.0)
 * @param bias - Bias toward dominant axis (0 = none, 1 = max)
 * @return vec3 weights - Normalized blend weights
 */
vec3 triplanarWeightsBiased(vec3 N, float blendExponent, float bias) {
  vec3 w = triplanarWeights(N, blendExponent);
  // Find dominant axis
  float maxW = max(w.x, max(w.y, w.z));
  // Push toward dominant
  vec3 biased = mix(w, vec3(step(maxW, w.x), step(maxW, w.y), step(maxW, w.z)), bias);
  float sum = biased.x + biased.y + biased.z;
  return (sum > 0.0001) ? biased / sum : vec3(1.0 / 3.0);
}

/**
 * Seamless triplanar color sampling with offset-blend technique.
 * This avoids the "triple-imaging" artifact that appears when the
 * same texture is sampled on all three planes at the same point.
 * The offset-blend method shifts each plane's sample slightly based
 * on the third coordinate, creating unique patterns per plane.
 *
 * @param p - 3D position
 * @param N - Surface normal
 * @param scale - Texture scale
 * @param blendExponent - Blend sharpness
 * @param sampleFunc - Function that takes vec2 and returns vec3
 * @return vec3 - Blended, seamless color
 */
vec3 triplanarSeamless(vec3 p, vec3 N, float scale, float blendExponent,
                       vec3 sampleFunc(vec2)) {
  vec3 w = triplanarWeights(N, blendExponent);

  // Offset each plane sample by the perpendicular coordinate to avoid triple-imaging
  float offsetScale = 0.5;
  vec3 xy = sampleFunc((p.xy + p.z * offsetScale) * scale);
  vec3 xz = sampleFunc((p.xz + p.y * offsetScale) * scale);
  vec3 yz = sampleFunc((p.yz + p.x * offsetScale) * scale);

  return w.z * xy + w.y * xz + w.x * yz;
}

/**
 * Seamless triplanar float sampling with offset-blend technique.
 */
float triplanarSeamlessFloat(vec3 p, vec3 N, float scale, float blendExponent,
                             float sampleFunc(vec2)) {
  vec3 w = triplanarWeights(N, blendExponent);

  float offsetScale = 0.5;
  float xy = sampleFunc((p.xy + p.z * offsetScale) * scale);
  float xz = sampleFunc((p.xz + p.y * offsetScale) * scale);
  float yz = sampleFunc((p.yz + p.x * offsetScale) * scale);

  return w.z * xy + w.y * xz + w.x * yz;
}
`;

// ============================================================================
// Coordinate Space Helpers (GLSL strings)
// ============================================================================

/**
 * GLSL snippet for computing 3D texture coordinates from various spaces.
 * Inject alongside the triplanar functions.
 */
export const TEXCOORD_GLSL = `
// ============================================================================
// 3D Texture Coordinate Computation
// ============================================================================

/**
 * Get texture coordinates in the specified coordinate space.
 *
 * @param coordSpace - 0=Generated, 1=Object, 2=World, 3=UV (2D fallback)
 * @param objPos - Object-space position (from vertex shader)
 * @param worldPos - World-space position (from vertex shader)
 * @param uv - UV coordinates (from vertex shader)
 * @return vec3 - 3D texture coordinates
 */
vec3 getTexCoord3D(int coordSpace, vec3 objPos, vec3 worldPos, vec2 uv) {
  if (coordSpace == 0) {
    // Generated: use object position, normalized to [0,1] range
    // This mimics Blender's Generated coordinates
    return objPos;
  } else if (coordSpace == 1) {
    // Object space
    return objPos;
  } else if (coordSpace == 2) {
    // World space
    return worldPos;
  } else {
    // UV: extend to 3D with z=0 (loses the 3D benefit but is a fallback)
    return vec3(uv, 0.0);
  }
}

/**
 * Get triplanar position from coordinate space.
 * For UV mode, uses a projection that extends 2D UVs into a pseudo-3D space.
 *
 * @param coordSpace - 0=Generated, 1=Object, 2=World, 3=UV
 * @param objPos - Object-space position
 * @param worldPos - World-space position
 * @param normal - Surface normal (world space)
 * @param uv - UV coordinates
 * @return vec3 - Position for triplanar projection
 */
vec3 getTriplanarPosition(int coordSpace, vec3 objPos, vec3 worldPos,
                          vec3 normal, vec2 uv) {
  if (coordSpace == 3) {
    // For UV mode, create a pseudo-3D position by projecting UV
    // along the dominant normal axis
    vec3 absN = abs(normal);
    if (absN.x >= absN.y && absN.x >= absN.z) {
      return vec3(uv.yx * 10.0, 0.0); // YZ plane
    } else if (absN.y >= absN.z) {
      return vec3(uv * 10.0, 0.0);     // XZ plane
    } else {
      return vec3(uv * 10.0, 0.0);     // XY plane
    }
  }
  return getTexCoord3D(coordSpace, objPos, worldPos, uv);
}
`;

// ============================================================================
// 4D Noise Support (GLSL string for animated materials)
// ============================================================================

/**
 * GLSL snippet for 4D noise evaluation (3D position + time/seed).
 * Inject when animated materials are needed.
 */
export const NOISE_4D_GLSL = `
// ============================================================================
// 4D Noise Functions (3D position + time/seed dimension)
// ============================================================================

// 4D hash function for animated noise
vec4 hash44(vec4 p) {
  p = vec4(dot(p, vec4(127.1, 311.7, 74.7, 213.5)),
           dot(p, vec4(269.5, 183.3, 246.1, 53.7)),
           dot(p, vec4(113.5, 271.9, 124.6, 317.3)),
           dot(p, vec4(43.1, 95.7, 183.4, 271.9)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// 4D Perlin gradient noise
float perlinNoise4D(vec4 p) {
  vec4 i = floor(p);
  vec4 f = fract(p);
  vec4 u = f * f * (3.0 - 2.0 * f);

  // 16 corners of a 4D hypercube
  float n0000 = dot(hash44(i + vec4(0,0,0,0)), f - vec4(0,0,0,0));
  float n1000 = dot(hash44(i + vec4(1,0,0,0)), f - vec4(1,0,0,0));
  float n0100 = dot(hash44(i + vec4(0,1,0,0)), f - vec4(0,1,0,0));
  float n1100 = dot(hash44(i + vec4(1,1,0,0)), f - vec4(1,1,0,0));
  float n0010 = dot(hash44(i + vec4(0,0,1,0)), f - vec4(0,0,1,0));
  float n1010 = dot(hash44(i + vec4(1,0,1,0)), f - vec4(1,0,1,0));
  float n0110 = dot(hash44(i + vec4(0,1,1,0)), f - vec4(0,1,1,0));
  float n1110 = dot(hash44(i + vec4(1,1,1,0)), f - vec4(1,1,1,0));
  float n0001 = dot(hash44(i + vec4(0,0,0,1)), f - vec4(0,0,0,1));
  float n1001 = dot(hash44(i + vec4(1,0,0,1)), f - vec4(1,0,0,1));
  float n0101 = dot(hash44(i + vec4(0,1,0,1)), f - vec4(0,1,0,1));
  float n1101 = dot(hash44(i + vec4(1,1,0,1)), f - vec4(1,1,0,1));
  float n0011 = dot(hash44(i + vec4(0,0,1,1)), f - vec4(0,0,1,1));
  float n1011 = dot(hash44(i + vec4(1,0,1,1)), f - vec4(1,0,1,1));
  float n0111 = dot(hash44(i + vec4(0,1,1,1)), f - vec4(0,1,1,1));
  float n1111 = dot(hash44(i + vec4(1,1,1,1)), f - vec4(1,1,1,1));

  // Interpolate
  float x00 = mix(mix(n0000, n1000, u.x), mix(n0100, n1100, u.x), u.y);
  float x10 = mix(mix(n0010, n1010, u.x), mix(n0110, n1110, u.x), u.y);
  float x01 = mix(mix(n0001, n1001, u.x), mix(n0101, n1101, u.x), u.y);
  float x11 = mix(mix(n0011, n1011, u.x), mix(n0111, n1111, u.x), u.y);

  float y0 = mix(x00, x10, u.z);
  float y1 = mix(x01, x11, u.z);

  return mix(y0, y1, u.w);
}

// 4D FBM (animated FBM using 4D position + time)
float fbm4D(vec4 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    value += amplitude * perlinNoise4D(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// Triplanar 4D FBM (for animated materials)
float triplanarFBM4D(vec3 p, vec3 N, float scale, int octaves, float time) {
  vec3 w = triplanarWeights(N, 8.0);
  float xy = fbm4D(vec4(p.xy * scale, 0.0, time), octaves, 2.0, 0.5);
  float xz = fbm4D(vec4(p.xz * scale, 0.0, time), octaves, 2.0, 0.5);
  float yz = fbm4D(vec4(p.yz * scale, 0.0, time), octaves, 2.0, 0.5);
  return w.z * xy + w.y * xz + w.x * yz;
}
`;

// ============================================================================
// Multi-Light Support (GLSL string)
// ============================================================================

/**
 * GLSL snippet for multi-light PBR evaluation with directional + point + area lights.
 * Inject alongside the PBR lighting functions.
 */
export const MULTI_LIGHT_GLSL = `
// ============================================================================
// Multi-Light Support (Directional + Point + Area)
// ============================================================================

struct DirectionalLight {
  vec3 direction;
  vec3 color;
  float intensity;
};

struct PointLight {
  vec3 position;
  vec3 color;
  float intensity;
  float range;
  float decay;
};

struct AreaLight {
  vec3 position;
  vec3 direction;
  vec3 color;
  float intensity;
  float width;
  float height;
};

// Evaluate all directional lights
vec3 evaluateDirectionalLights(
  vec3 N, vec3 V, vec3 albedo, float metallic, float roughness, vec3 F0,
  DirectionalLight lights[MAX_DIR_LIGHTS], int count
) {
  vec3 result = vec3(0.0);
  for (int i = 0; i < MAX_DIR_LIGHTS; i++) {
    if (i >= count) break;
    result += computePBRLight(N, V, albedo, metallic, roughness,
                              lights[i].direction, lights[i].color,
                              lights[i].intensity, F0);
  }
  return result;
}

// Evaluate all point lights with distance attenuation
vec3 evaluatePointLights(
  vec3 N, vec3 V, vec3 worldPos, vec3 albedo, float metallic, float roughness, vec3 F0,
  PointLight lights[MAX_POINT_LIGHTS], int count
) {
  vec3 result = vec3(0.0);
  for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
    if (i >= count) break;
    vec3 toLight = lights[i].position - worldPos;
    float dist = length(toLight);
    vec3 L = toLight / max(dist, 0.001);

    // Distance attenuation (physically-based)
    float attenuation = lights[i].intensity;
    if (lights[i].range > 0.0) {
      float distRatio = dist / lights[i].range;
      float fade = 1.0 - distRatio * distRatio;
      attenuation *= max(0.0, fade * fade);
    }
    // Decay (default: inverse square)
    float decay = lights[i].decay > 0.0 ? lights[i].decay : 2.0;
    attenuation *= 1.0 / (1.0 + pow(dist / max(lights[i].range, 1.0), decay));

    result += computePBRLight(N, V, albedo, metallic, roughness,
                              L, lights[i].color, attenuation, F0);
  }
  return result;
}

// Approximate area light contribution (LTC approximation)
vec3 evaluateAreaLight(
  vec3 N, vec3 V, vec3 worldPos, vec3 albedo, float metallic, float roughness, vec3 F0,
  AreaLight light
) {
  // Simplified area light: sample the center and edges
  vec3 L = normalize(light.position - worldPos);
  float NdotL = max(dot(N, L), 0.0);

  // Approximate area light with a soft directional
  float halfWidth = light.width * 0.5;
  float halfHeight = light.height * 0.5;

  // Simple cosine-weighted approximation
  float areaFactor = (halfWidth * halfHeight) / max(dot(light.direction, L), 0.01);
  float attenuation = light.intensity / max(areaFactor, 1.0);

  return computePBRLight(N, V, albedo, metallic, roughness,
                         L, light.color, min(attenuation, 4.0), F0);
}
`;

// ============================================================================
// IBL Environment Map Support (GLSL string)
// ============================================================================

/**
 * GLSL snippet for IBL (Image-Based Lighting) environment map evaluation.
 * Inject alongside the PBR lighting functions.
 */
export const IBL_GLSL = `
// ============================================================================
// IBL (Image-Based Lighting) - Environment Map
// ============================================================================

// Pre-filtered environment map (mip-mapped for roughness)
uniform sampler2D uBRDFLUT;       // BRDF integration LUT
uniform samplerCube uEnvMap;      // Environment cubemap
uniform float uEnvMapIntensity;   // Environment map intensity

// Sample pre-filtered environment map at a given roughness level
vec3 samplePrefilteredEnv(vec3 R, float roughness) {
  // Convert roughness to mip level
  float mipLevel = roughness * 4.0; // Assuming 5 mip levels
  return textureLod(uEnvMap, R, mipLevel).rgb * uEnvMapIntensity;
}

// Approximate IBL without cubemap (fallback)
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
  vec2 envBRDF = vec2(0.04, 0.0); // Simplified
  if (roughness < 0.5) envBRDF.x = 0.1;
  vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);

  return (diffuse + specular) * ao;
}

// Full IBL with cubemap
vec3 evaluateIBL(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness, vec3 F0, float ao) {
  vec3 F = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);
  vec3 kD = (1.0 - F) * (1.0 - metallic);

  // Diffuse IBL
  vec3 irradiance = textureLod(uEnvMap, N, 4.0).rgb * uEnvMapIntensity;
  vec3 diffuse = kD * irradiance * albedo;

  // Specular IBL
  vec3 R = reflect(-V, N);
  vec3 prefilteredColor = samplePrefilteredEnv(R, roughness);
  vec2 envBRDF = texture(uBRDFLUT, vec2(max(dot(N, V), 0.0), roughness)).rg;
  vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);

  return (diffuse + specular) * ao;
}
`;

// ============================================================================
// Vertex Shader Varying Declarations
// ============================================================================

/**
 * GLSL varying declarations needed in the vertex shader for 3D material evaluation.
 * These must be declared in the vertex shader and matched in the fragment shader.
 */
export const VERTEX_VARYINGS_3D = `
// 3D Material Evaluation varyings
out vec3 vObjectPosition;
out vec3 vWorldPosition;
out vec3 vWorldNormal;
out vec2 vTexCoord;
out mat3 vTangentToWorld;
`;

/**
 * GLSL vertex shader code for computing 3D material varyings.
 * Add this to the vertex shader's main() function.
 */
export const VERTEX_MAIN_3D = `
  // Object-space position
  vObjectPosition = position;

  // World-space position
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;

  // World-space normal
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  // Texture coordinate
  vTexCoord = uv;

  // Tangent-to-world matrix for normal mapping
  vec3 T = normalize(mat3(modelMatrix) * tangent);
  vec3 B = normalize(mat3(modelMatrix) * bitangent);
  vec3 N = vWorldNormal;
  vTangentToWorld = mat3(T, B, N);
`;

/**
 * GLSL fragment shader varying declarations (matching the vertex output).
 */
export const FRAGMENT_VARYINGS_3D = `
// 3D Material Evaluation varyings (from vertex shader)
in vec3 vObjectPosition;
in vec3 vWorldPosition;
in vec3 vWorldNormal;
in vec2 vTexCoord;
in mat3 vTangentToWorld;
`;

// ============================================================================
// Default Vertex Shader for 3D Materials
// ============================================================================

/**
 * Complete vertex shader for 3D material evaluation.
 * Includes all necessary varyings for triplanar projection and PBR lighting.
 * Supports optional displacement via a uniform.
 *
 * Compatible with both forward and deferred rendering pipelines:
 * - Forward: Outputs world position/normal for per-pixel PBR in fragment shader
 * - Deferred: Same varyings can be written to G-buffers
 */
export const VERTEX_SHADER_3D = `#version 300 es
precision highp float;
precision highp int;

// Vertex attributes
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec3 tangent;
in vec3 bitangent;

// Uniforms
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uDisplacementScale;
uniform float uDisplacementOffset;

// Displacement function (to be defined by the material)
// float displacement(vec3 p, vec3 n) { return 0.0; }

${VERTEX_VARYINGS_3D}

void main() {
  // Compute object and world positions
  vec3 objPos = position;
  vec3 worldNormal = normalize(mat3(modelMatrix) * normal);

  // Optional displacement (function must be defined before this shader is used)
  // vec3 displacedPos = position + normal * (displacement(position, worldNormal) * uDisplacementScale + uDisplacementOffset);

  vec4 worldPos = modelMatrix * vec4(position, 1.0);

  // Set varyings
  vObjectPosition = objPos;
  vWorldPosition = worldPos.xyz;
  vWorldNormal = worldNormal;
  vTexCoord = uv;

  // Tangent-to-world matrix
  vec3 T = normalize(mat3(modelMatrix) * tangent);
  vec3 B = normalize(mat3(modelMatrix) * bitangent);
  vec3 N = vWorldNormal;
  vTangentToWorld = mat3(T, B, N);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// ============================================================================
// Utility: Build a complete vertex shader with displacement
// ============================================================================

/**
 * Build a vertex shader string with displacement support.
 * The displacementGLSL parameter should define a `float displacement(vec3 p, vec3 n)` function.
 */
export function buildVertexShaderWithDisplacement(displacementGLSL: string): string {
  return `#version 300 es
precision highp float;
precision highp int;

// Vertex attributes
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec3 tangent;
in vec3 bitangent;

// Uniforms
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uDisplacementScale;
uniform float uDisplacementOffset;

${displacementGLSL}

${VERTEX_VARYINGS_3D}

void main() {
  // Compute displacement
  float disp = displacement(position, normalize(mat3(modelMatrix) * normal));
  vec3 displacedPos = position + normal * (disp * uDisplacementScale + uDisplacementOffset);

  vec4 worldPos = modelMatrix * vec4(displacedPos, 1.0);
  vec3 worldNormal = normalize(mat3(modelMatrix) * normal);

  vObjectPosition = position; // Use undisplaced position for texture coords
  vWorldPosition = worldPos.xyz;
  vWorldNormal = worldNormal;
  vTexCoord = uv;

  vec3 T = normalize(mat3(modelMatrix) * tangent);
  vec3 B = normalize(mat3(modelMatrix) * bitangent);
  vec3 N = vWorldNormal;
  vTangentToWorld = mat3(T, B, N);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
}
