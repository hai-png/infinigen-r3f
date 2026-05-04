/**
 * PBRGLSL — PBR lighting utility functions for GLSL shaders
 *
 * Provides injectable GLSL snippets for Cook-Torrance PBR lighting:
 * - Fresnel-Schlick approximation
 * - GGX/Trowbridge-Reitz NDF
 * - Smith-GGX geometry function
 * - Full PBR light evaluation
 * - Anisotropic GGX BRDF approximation
 *
 * Used by metal, terrain, and other PBR-based shader materials.
 *
 * @module assets/shaders/common
 */

export const PBR_GLSL = /* glsl */ `
// ============================================================================
// PBR Lighting Functions
// ============================================================================

const float PI = 3.14159265359;
const float EPSILON = 0.0001;

// Fresnel-Schlick approximation
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Fresnel with roughness (for ambient/IBL)
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// GGX/Trowbridge-Reitz Normal Distribution Function
float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;
  return a2 / max(denom, EPSILON);
}

// Schlick-GGX geometry function
float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

// Smith's method for geometry obstruction/shadowing
float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

// Compute PBR lighting for a single light direction
vec3 computePBRLight(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness,
                     vec3 lightDir, vec3 lightColor, float attenuation, vec3 F0) {
  vec3 L = lightDir;
  vec3 H = normalize(V + L);

  float NDF = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + EPSILON;
  vec3 specular = numerator / denominator;

  vec3 kS = F;
  vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);

  float NdotL = max(dot(N, L), 0.0);
  return (kD * albedo / PI + specular) * lightColor * NdotL * attenuation;
}

// ============================================================================
// Anisotropic GGX BRDF (for brushed metal)
// ============================================================================

// Anisotropic GGX NDF
float distributionGGXAniso(vec3 N, vec3 H, float roughness, float anisotropy, vec3 tangent, vec3 bitangent) {
  float ax = max(0.001, roughness * (1.0 + anisotropy));
  float ay = max(0.001, roughness * (1.0 - anisotropy));

  float NdotH = max(dot(N, H), 0.0);
  float TdotH = dot(tangent, H);
  float BdotH = dot(bitangent, H);

  float d = TdotH * TdotH / (ax * ax) + BdotH * BdotH / (ay * ay) + NdotH * NdotH;
  return 1.0 / (PI * ax * ay * d * d);
}

// Anisotropic Smith geometry
float geometrySmithAniso(vec3 N, vec3 V, vec3 L, float roughness, float anisotropy,
                         vec3 tangent, vec3 bitangent) {
  float ax = max(0.001, roughness * (1.0 + anisotropy));
  float ay = max(0.001, roughness * (1.0 - anisotropy));

  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float TdotV = dot(tangent, V);
  float BdotV = dot(bitangent, V);
  float TdotL = dot(tangent, L);
  float BdotL = dot(bitangent, L);

  float lambdaV = NdotV * length(vec3(ax * TdotV, ay * BdotV, NdotV));
  float lambdaL = NdotL * length(vec3(ax * TdotL, ay * BdotL, NdotL));

  float gv = NdotV / (NdotV + lambdaV + EPSILON);
  float gl = NdotL / (NdotL + lambdaL + EPSILON);

  return gv * gl;
}

// Full anisotropic PBR light computation
vec3 computeAnisoPBRLight(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness,
                          float anisotropy, vec3 tangent, vec3 bitangent,
                          vec3 lightDir, vec3 lightColor, float attenuation, vec3 F0) {
  vec3 L = lightDir;
  vec3 H = normalize(V + L);

  float NDF = distributionGGXAniso(N, H, roughness, anisotropy, tangent, bitangent);
  float G = geometrySmithAniso(N, V, L, roughness, anisotropy, tangent, bitangent);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + EPSILON;
  vec3 specular = numerator / denominator;

  vec3 kS = F;
  vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);

  float NdotL = max(dot(N, L), 0.0);
  return (kD * albedo / PI + specular) * lightColor * NdotL * attenuation;
}
`;
