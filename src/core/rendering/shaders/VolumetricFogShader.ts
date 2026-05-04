/**
 * VolumetricFogShader — Ray-Marched Volumetric Effects Shaders
 *
 * Provides GLSL shader code for real-time ray-marched volumetric effects:
 *   - Volumetric Fog: Soft, light-scattering fog with animated noise density
 *   - Volumetric Smoke: Dense, anisotropic smoke with turbulence and emission
 *   - Atmospheric Scattering: Rayleigh + Mie scattering for terrain-atmosphere
 *
 * All shaders use the GPU noise library for density variation and integrate
 * with the depth buffer for proper scene occlusion.
 *
 * References:
 *   - "Real-Time Volumetric Rendering in Games", Hillaire 2016
 *   - "The Real-Time Volumetric Cloudscapes of Horizon", Schneider 2015
 *   - Nishita sky model for atmospheric scattering
 *
 * @module rendering/shaders
 */

import { NOISE_GLSL } from '@/core/util/math/gpu-noise-shaders';

// ============================================================================
// Shared Vertex Shader (fullscreen quad)
// ============================================================================

export const VOLUMETRIC_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// ============================================================================
// Volumetric Fog Fragment Shader
// ============================================================================

export const VOLUMETRIC_FOG_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDepth;           // scene depth buffer
uniform sampler2D tDiffuse;         // scene color buffer
uniform mat4  uInvProjection;       // inverse projection matrix
uniform mat4  uProjection;          // projection matrix
uniform mat4  uInvView;             // inverse view matrix
uniform vec3  uCameraPos;           // camera world position
uniform vec3  uLightDir;            // directional light direction (normalized)
uniform vec3  uLightColor;          // light color and intensity
uniform float uDensity;             // fog density (0..1)
uniform float uAbsorption;          // absorption coefficient
uniform float uScattering;          // scattering coefficient
uniform float uPhaseG;              // Henyey-Greenstein asymmetry parameter (-1..1)
uniform int   uStepCount;           // ray march step count (8..64)
uniform float uTime;                // time for animation
uniform float uFogHeight;           // height of fog layer (world Y)
uniform float uFogHeightFalloff;    // exponential falloff from fog base
uniform vec3  uFogColor;            // base fog color (tint)
uniform float uNoiseScale;          // scale for noise-based density variation
uniform float uNoiseStrength;       // strength of noise modulation on density
uniform vec2  uResolution;          // screen resolution

varying vec2 vUv;

${NOISE_GLSL}

// ---- Utilities ---------------------------------------------------------------

// Reconstruct view-space position from depth
vec3 reconstructViewPos(vec2 uv, float depth) {
  vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInvProjection * clipPos;
  return viewPos.xyz / viewPos.w;
}

// Reconstruct world-space position from depth
vec3 reconstructWorldPos(vec2 uv, float depth) {
  vec3 viewPos = reconstructViewPos(uv, depth);
  vec4 worldPos = uInvView * vec4(viewPos, 1.0);
  return worldPos.xyz;
}

// Henyey-Greenstein phase function
float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159265 * denom * sqrt(denom));
}

// Height-based fog density falloff
float heightDensity(float worldY) {
  return exp(-max(0.0, worldY - uFogHeight) * uFogHeightFalloff);
}

// Animated noise-based density variation
float animatedDensity(vec3 worldPos) {
  // Animate position over time for flowing fog
  vec3 animPos = worldPos + vec3(uTime * 0.05, uTime * 0.01, uTime * 0.03);
  
  // Multi-octave noise for organic density
  float n1 = perlin3D(animPos * uNoiseScale) * 0.5;
  float n2 = perlin3D(animPos * uNoiseScale * 2.0 + vec3(100.0)) * 0.25;
  float n3 = worley3D(animPos, uNoiseScale * 0.5) * 0.25;
  
  float noiseVal = n1 + n2 + n3;
  
  // Remap noise to [0, 1] and apply strength
  noiseVal = noiseVal * 0.5 + 0.5;
  return mix(1.0, noiseVal, uNoiseStrength);
}

// ---- Main --------------------------------------------------------------------

void main() {
  float sceneDepth = texture2D(tDepth, vUv).r;
  vec3 sceneColor = texture2D(tDiffuse, vUv).rgb;
  
  // Sky pixel — still apply fog for distant atmosphere
  float maxDistance = 200.0;
  if (sceneDepth >= 1.0) {
    // For sky pixels, march a fixed distance
    vec3 rayDir = normalize(reconstructWorldPos(vUv, 0.999) - uCameraPos);
    
    vec3 accumColor = vec3(0.0);
    float accumAlpha = 0.0;
    
    float stepSize = maxDistance / float(uStepCount);
    vec3 pos = uCameraPos;
    
    for (int i = 0; i < 64; i++) {
      if (i >= uStepCount) break;
      if (accumAlpha > 0.95) break;
      
      float heightDens = heightDensity(pos.y);
      float noiseDens = animatedDensity(pos);
      float density = uDensity * heightDens * noiseDens;
      
      if (density > 0.001) {
        // Light scattering
        float cosTheta = dot(normalize(rayDir), uLightDir);
        float phase = henyeyGreenstein(cosTheta, uPhaseG);
        
        // Shadow approximation: reduce scattering below fog layer
        float shadowFactor = smoothstep(uFogHeight - 5.0, uFogHeight, pos.y);
        
        vec3 scatteredLight = uLightColor * uScattering * phase * shadowFactor;
        vec3 absorbedLight = uFogColor * uAbsorption;
        
        vec3 sampleColor = scatteredLight / max(density, 0.001) + absorbedLight * 0.05;
        
        float sampleAlpha = 1.0 - exp(-density * stepSize);
        sampleAlpha = clamp(sampleAlpha, 0.0, 1.0);
        
        accumColor += sampleColor * sampleAlpha * (1.0 - accumAlpha);
        accumAlpha += sampleAlpha * (1.0 - accumAlpha);
      }
      
      pos += rayDir * stepSize;
    }
    
    gl_FragColor = vec4(mix(sceneColor, accumColor, accumAlpha), 1.0);
    return;
  }
  
  // Reconstruct ray for scene pixels
  vec3 worldPos = reconstructWorldPos(vUv, sceneDepth);
  vec3 rayDir = normalize(worldPos - uCameraPos);
  float rayLength = length(worldPos - uCameraPos);
  
  vec3 accumColor = vec3(0.0);
  float accumAlpha = 0.0;
  
  float stepSize = rayLength / float(uStepCount);
  vec3 pos = uCameraPos;
  
  for (int i = 0; i < 64; i++) {
    if (i >= uStepCount) break;
    if (accumAlpha > 0.95) break;
    
    // Height-based density falloff
    float heightDens = heightDensity(pos.y);
    float noiseDens = animatedDensity(pos);
    float density = uDensity * heightDens * noiseDens;
    
    if (density > 0.001) {
      // Phase function for anisotropic scattering
      float cosTheta = dot(normalize(rayDir), uLightDir);
      float phase = henyeyGreenstein(cosTheta, uPhaseG);
      
      // Shadow factor — fog below objects is more shadowed
      float shadowFactor = smoothstep(uFogHeight - 5.0, uFogHeight, pos.y);
      
      // Inscattering from directional light
      vec3 scatteredLight = uLightColor * uScattering * phase * shadowFactor;
      
      // Ambient scattering (sky light approximation)
      vec3 ambientScatter = uFogColor * uScattering * 0.3 * heightDens;
      
      // Absorption (darkens fog)
      vec3 absorbedLight = uFogColor * uAbsorption;
      
      // Combined sample color
      vec3 sampleColor = (scatteredLight + ambientScatter) / max(density, 0.001) + absorbedLight * 0.02;
      
      // Beer-Lambert law for transmittance
      float sampleAlpha = 1.0 - exp(-density * stepSize);
      sampleAlpha = clamp(sampleAlpha, 0.0, 1.0);
      
      // Front-to-back compositing
      accumColor += sampleColor * sampleAlpha * (1.0 - accumAlpha);
      accumAlpha += sampleAlpha * (1.0 - accumAlpha);
    }
    
    pos += rayDir * stepSize;
  }
  
  // Composite fog over scene
  vec3 finalColor = mix(sceneColor, accumColor, accumAlpha);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ============================================================================
// Volumetric Smoke Fragment Shader
// ============================================================================

export const VOLUMETRIC_SMOKE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDepth;           // scene depth buffer
uniform sampler2D tDiffuse;         // scene color buffer
uniform mat4  uInvProjection;
uniform mat4  uProjection;
uniform mat4  uInvView;
uniform vec3  uCameraPos;
uniform vec3  uLightDir;
uniform vec3  uLightColor;
uniform float uDensity;             // smoke density (0..1, typically higher than fog)
uniform float uAbsorption;          // absorption coefficient (higher than fog)
uniform float uScattering;          // scattering coefficient
uniform float uPhaseG;              // HG asymmetry (strong forward scattering, ~0.6-0.9)
uniform int   uStepCount;
uniform float uTime;
uniform vec3  uSmokeOrigin;         // world position of smoke source
uniform float uSmokeRadius;         // radius of smoke volume
uniform vec3  uSmokeColor;          // base smoke color
uniform vec3  uEmissionColor;       // emission color (for fire-lit smoke)
uniform float uEmissionIntensity;   // emission strength
uniform float uTurbulenceScale;     // turbulence noise scale
uniform float uTurbulenceStrength;  // turbulence animation strength
uniform float uNoiseScale;
uniform float uNoiseStrength;
uniform vec2  uResolution;

varying vec2 vUv;

${NOISE_GLSL}

// ---- Utilities ---------------------------------------------------------------

vec3 reconstructViewPos(vec2 uv, float depth) {
  vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInvProjection * clipPos;
  return viewPos.xyz / viewPos.w;
}

vec3 reconstructWorldPos(vec2 uv, float depth) {
  vec3 viewPos = reconstructViewPos(uv, depth);
  vec4 worldPos = uInvView * vec4(viewPos, 1.0);
  return worldPos.xyz;
}

float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159265 * denom * sqrt(denom));
}

// Distance from smoke origin with animated turbulence displacement
float smokeDensityField(vec3 worldPos) {
  vec3 offset = worldPos - uSmokeOrigin;
  float dist = length(offset);
  
  // Spherical falloff from origin
  float radialDensity = 1.0 - smoothstep(0.0, uSmokeRadius, dist);
  
  // Upward drift — smoke rises
  float upBias = max(0.0, offset.y) * 0.02;
  radialDensity *= exp(-upBias);
  
  // Turbulence displacement — animated
  vec3 turbPos = worldPos * uTurbulenceScale;
  turbPos += vec3(
    perlin3D(turbPos + vec3(uTime * 0.3, 0.0, 0.0)),
    perlin3D(turbPos + vec3(0.0, uTime * 0.2, 0.0)),
    perlin3D(turbPos + vec3(0.0, 0.0, uTime * 0.25))
  ) * uTurbulenceStrength;
  
  // Multi-octave noise for smoke density
  float n1 = perlin3D(turbPos * uNoiseScale) * 0.4;
  float n2 = perlin3D(turbPos * uNoiseScale * 2.5 + vec3(50.0)) * 0.3;
  float n3 = worley3D(turbPos, uNoiseScale * 1.5) * 0.3;
  float noiseVal = n1 + n2 + n3;
  noiseVal = noiseVal * 0.5 + 0.5; // remap to [0,1]
  
  // Apply noise strength
  float density = uDensity * radialDensity * mix(1.0, noiseVal, uNoiseStrength);
  
  return max(0.0, density);
}

// ---- Main --------------------------------------------------------------------

void main() {
  float sceneDepth = texture2D(tDepth, vUv).r;
  vec3 sceneColor = texture2D(tDiffuse, vUv).rgb;
  
  // Reconstruct ray
  vec3 worldPos;
  float maxRayDist;
  
  if (sceneDepth >= 1.0) {
    // Sky pixel
    worldPos = reconstructWorldPos(vUv, 0.999);
    maxRayDist = 300.0;
  } else {
    worldPos = reconstructWorldPos(vUv, sceneDepth);
    maxRayDist = length(worldPos - uCameraPos);
  }
  
  vec3 rayDir = normalize(worldPos - uCameraPos);
  float stepSize = maxRayDist / float(uStepCount);
  
  vec3 accumColor = vec3(0.0);
  float accumAlpha = 0.0;
  vec3 pos = uCameraPos;
  
  // Quick check: is the ray even close to the smoke volume?
  vec3 toOrigin = uSmokeOrigin - uCameraPos;
  float projLen = dot(toOrigin, rayDir);
  float closestDist = length(toOrigin - rayDir * projLen);
  if (closestDist > uSmokeRadius * 1.5) {
    gl_FragColor = vec4(sceneColor, 1.0);
    return;
  }
  
  for (int i = 0; i < 64; i++) {
    if (i >= uStepCount) break;
    if (accumAlpha > 0.95) break;
    
    float density = smokeDensityField(pos);
    
    if (density > 0.001) {
      // Phase function — smoke has strong forward scattering
      float cosTheta = dot(rayDir, uLightDir);
      float phase = henyeyGreenstein(cosTheta, uPhaseG);
      // Add isotropic component for more realistic multi-scattering
      float isotropicPhase = 1.0 / (4.0 * 3.14159265);
      phase = mix(isotropicPhase, phase, 0.8);
      
      // Scattering from light
      vec3 scatteredLight = uLightColor * uScattering * phase;
      
      // Ambient contribution
      vec3 ambientScatter = uSmokeColor * uScattering * 0.15;
      
      // Emission (fire-lit smoke near origin)
      float distToOrigin = length(pos - uSmokeOrigin);
      float emissionFalloff = exp(-distToOrigin / (uSmokeRadius * 0.3));
      vec3 emission = uEmissionColor * uEmissionIntensity * emissionFalloff;
      
      // Absorption — smoke absorbs more light than fog
      vec3 absorptionColor = vec3(1.0) - uSmokeColor * uAbsorption;
      
      // Combined sample
      vec3 sampleColor = (scatteredLight + ambientScatter) * absorptionColor + emission;
      
      // Beer-Lambert transmittance
      float sampleAlpha = 1.0 - exp(-density * stepSize);
      sampleAlpha = clamp(sampleAlpha, 0.0, 1.0);
      
      accumColor += sampleColor * sampleAlpha * (1.0 - accumAlpha);
      accumAlpha += sampleAlpha * (1.0 - accumAlpha);
    }
    
    pos += rayDir * stepSize;
  }
  
  vec3 finalColor = mix(sceneColor, accumColor, accumAlpha);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ============================================================================
// Atmospheric Scattering Fragment Shader
// ============================================================================

export const ATMOSPHERIC_SCATTERING_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDepth;
uniform sampler2D tDiffuse;
uniform mat4  uInvProjection;
uniform mat4  uProjection;
uniform mat4  uInvView;
uniform vec3  uCameraPos;
uniform vec3  uSunDirection;       // normalized sun direction
uniform vec3  uSunColor;           // sun color with intensity
uniform float uRayleighCoeff;      // Rayleigh scattering coefficient
uniform float uMieCoeff;           // Mie scattering coefficient
uniform float uMieG;               // Mie asymmetry parameter
uniform float uAtmosphereHeight;   // effective atmosphere height (world units)
uniform float uDensity;            // overall atmosphere density multiplier
uniform int   uStepCount;          // ray march steps
uniform float uTime;               // time for subtle animation
uniform vec3  uWavelengths;        // primary wavelengths (nm) for Rayleigh
uniform vec2  uResolution;

varying vec2 vUv;

// ---- Rayleigh + Mie Scattering -----------------------------------------------

// Rayleigh phase function
float rayleighPhase(float cosTheta) {
  return 3.0 / (16.0 * 3.14159265) * (1.0 + cosTheta * cosTheta);
}

// Mie phase function (Henyey-Greenstein)
float miePhase(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159265 * denom * sqrt(denom));
}

// Height-based density for atmosphere (exponential falloff from sea level)
float atmosphereDensity(float worldY) {
  // Scale height ~8.5km for Rayleigh, ~1.2km for Mie
  // We use world units scaled for the scene
  float scaleHeight = uAtmosphereHeight * 0.2;
  return exp(-max(0.0, worldY) / scaleHeight) * uDensity;
}

// ---- Utilities ---------------------------------------------------------------

vec3 reconstructViewPos(vec2 uv, float depth) {
  vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInvProjection * clipPos;
  return viewPos.xyz / viewPos.w;
}

vec3 reconstructWorldPos(vec2 uv, float depth) {
  vec3 viewPos = reconstructViewPos(uv, depth);
  vec4 worldPos = uInvView * vec4(viewPos, 1.0);
  return worldPos.xyz;
}

// Compute atmospheric scattering for a single ray step
vec3 computeScattering(
  vec3 rayDir,
  vec3 sunDir,
  float density,
  float stepSize
) {
  float cosTheta = dot(rayDir, sunDir);
  
  // Wavelength-dependent Rayleigh scattering
  // sigma_s ~ 1/lambda^4
  vec3 rayleighSigma = vec3(
    uRayleighCoeff * pow(680.0 / uWavelengths.x, 4.0),
    uRayleighCoeff * pow(680.0 / uWavelengths.y, 4.0),
    uRayleighCoeff * pow(680.0 / uWavelengths.z, 4.0)
  );
  
  // Phase functions
  float rPhase = rayleighPhase(cosTheta);
  float mPhase = miePhase(cosTheta, uMieG);
  
  // Scattering coefficients (density-scaled)
  vec3 rayleighScatter = rayleighSigma * rPhase * density * stepSize;
  float mieScatter = uMieCoeff * mPhase * density * stepSize;
  
  // Combine scattering from sun
  vec3 scatteredSun = uSunColor * (rayleighScatter + vec3(mieScatter));
  
  // Horizon brightening — more scattering near horizon due to longer path
  float horizonFactor = 1.0 - abs(rayDir.y);
  horizonFactor = pow(horizonFactor, 2.0);
  vec3 horizonColor = uSunColor * rayleighSigma * 0.1 * horizonFactor * density * stepSize;
  
  return scatteredSun + horizonColor;
}

// ---- Main --------------------------------------------------------------------

void main() {
  float sceneDepth = texture2D(tDepth, vUv).r;
  vec3 sceneColor = texture2D(tDiffuse, vUv).rgb;
  
  // Reconstruct ray
  vec3 worldPos;
  float maxRayDist;
  
  if (sceneDepth >= 1.0) {
    worldPos = reconstructWorldPos(vUv, 0.999);
    maxRayDist = 500.0; // Long distance for atmosphere
  } else {
    worldPos = reconstructWorldPos(vUv, sceneDepth);
    maxRayDist = length(worldPos - uCameraPos);
  }
  
  vec3 rayDir = normalize(worldPos - uCameraPos);
  float stepSize = maxRayDist / float(uStepCount);
  
  // Accumulated scattering and transmittance
  vec3 accumScatter = vec3(0.0);
  vec3 transmittance = vec3(1.0);
  
  // Rayleigh extinction coefficients
  vec3 rayleighSigma = vec3(
    uRayleighCoeff * pow(680.0 / uWavelengths.x, 4.0),
    uRayleighCoeff * pow(680.0 / uWavelengths.y, 4.0),
    uRayleighCoeff * pow(680.0 / uWavelengths.z, 4.0)
  );
  
  vec3 pos = uCameraPos;
  
  for (int i = 0; i < 64; i++) {
    if (i >= uStepCount) break;
    if (length(transmittance) < 0.01) break;
    
    float density = atmosphereDensity(pos.y);
    
    if (density > 0.0001) {
      // Compute scattering contribution
      vec3 scattering = computeScattering(rayDir, uSunDirection, density, stepSize);
      
      // Extinction (Beer-Lambert)
      vec3 extinction = exp(-(rayleighSigma + vec3(uMieCoeff * 1.1)) * density * stepSize);
      
      // Accumulate scattering with transmittance weighting
      accumScatter += transmittance * scattering;
      
      // Update transmittance
      transmittance *= extinction;
    }
    
    pos += rayDir * stepSize;
  }
  
  // Composite atmosphere over scene
  vec3 finalColor = sceneColor * transmittance + accumScatter;
  
  // Sun disc — add a bright disc for the sun
  float cosSunAngle = dot(rayDir, uSunDirection);
  float sunAngularRadius = 0.00465; // radians (~0.27 degrees)
  float sunCosTheta = cos(sunAngularRadius);
  if (cosSunAngle > sunCosTheta) {
    float sunIntensity = pow((cosSunAngle - sunCosTheta) / (1.0 - sunCosTheta), 2.0);
    finalColor += uSunColor * sunIntensity * 5.0;
  }
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ============================================================================
// Composite Shader (volumetric result over scene)
// ============================================================================

export const VOLUMETRIC_COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;     // original scene
uniform sampler2D tVolumetric;  // volumetric pass result
uniform float uBlendFactor;     // blend factor (0..1)

varying vec2 vUv;

void main() {
  vec3 sceneColor = texture2D(tDiffuse, vUv).rgb;
  vec3 volColor = texture2D(tVolumetric, vUv).rgb;
  
  gl_FragColor = vec4(mix(sceneColor, volColor, uBlendFactor), 1.0);
}
`;

// ============================================================================
// Types & Defaults
// ============================================================================

export interface VolumetricFogUniforms {
  tDepth: THREE.Texture | null;
  tDiffuse: THREE.Texture | null;
  uInvProjection: THREE.Matrix4;
  uProjection: THREE.Matrix4;
  uInvView: THREE.Matrix4;
  uCameraPos: THREE.Vector3;
  uLightDir: THREE.Vector3;
  uLightColor: THREE.Color;
  uDensity: number;
  uAbsorption: number;
  uScattering: number;
  uPhaseG: number;
  uStepCount: number;
  uTime: number;
  uFogHeight: number;
  uFogHeightFalloff: number;
  uFogColor: THREE.Color;
  uNoiseScale: number;
  uNoiseStrength: number;
  uResolution: THREE.Vector2;
  u_noiseSeed: number;
}

export interface VolumetricSmokeUniforms {
  tDepth: THREE.Texture | null;
  tDiffuse: THREE.Texture | null;
  uInvProjection: THREE.Matrix4;
  uProjection: THREE.Matrix4;
  uInvView: THREE.Matrix4;
  uCameraPos: THREE.Vector3;
  uLightDir: THREE.Vector3;
  uLightColor: THREE.Color;
  uDensity: number;
  uAbsorption: number;
  uScattering: number;
  uPhaseG: number;
  uStepCount: number;
  uTime: number;
  uSmokeOrigin: THREE.Vector3;
  uSmokeRadius: number;
  uSmokeColor: THREE.Color;
  uEmissionColor: THREE.Color;
  uEmissionIntensity: number;
  uTurbulenceScale: number;
  uTurbulenceStrength: number;
  uNoiseScale: number;
  uNoiseStrength: number;
  uResolution: THREE.Vector2;
  u_noiseSeed: number;
}

export interface AtmosphericScatteringUniforms {
  tDepth: THREE.Texture | null;
  tDiffuse: THREE.Texture | null;
  uInvProjection: THREE.Matrix4;
  uProjection: THREE.Matrix4;
  uInvView: THREE.Matrix4;
  uCameraPos: THREE.Vector3;
  uSunDirection: THREE.Vector3;
  uSunColor: THREE.Color;
  uRayleighCoeff: number;
  uMieCoeff: number;
  uMieG: number;
  uAtmosphereHeight: number;
  uDensity: number;
  uStepCount: number;
  uTime: number;
  uWavelengths: THREE.Vector3;
  uResolution: THREE.Vector2;
}

/** Default parameters for volumetric fog */
export const DEFAULT_FOG_PARAMS: Omit<VolumetricFogUniforms, 'tDepth' | 'tDiffuse' | 'uInvProjection' | 'uProjection' | 'uInvView' | 'uCameraPos' | 'uResolution'> = {
  uLightDir: new THREE.Vector3(0.5, 0.8, 0.3).normalize(),
  uLightColor: new THREE.Color(1.0, 0.95, 0.85),
  uDensity: 0.015,
  uAbsorption: 0.1,
  uScattering: 0.6,
  uPhaseG: 0.3,
  uStepCount: 24,
  uTime: 0.0,
  uFogHeight: 5.0,
  uFogHeightFalloff: 0.15,
  uFogColor: new THREE.Color(0.85, 0.88, 0.92),
  uNoiseScale: 0.08,
  uNoiseStrength: 0.5,
  u_noiseSeed: 0,
};

/** Default parameters for volumetric smoke */
export const DEFAULT_SMOKE_PARAMS: Omit<VolumetricSmokeUniforms, 'tDepth' | 'tDiffuse' | 'uInvProjection' | 'uProjection' | 'uInvView' | 'uCameraPos' | 'uResolution'> = {
  uLightDir: new THREE.Vector3(0.5, 0.8, 0.3).normalize(),
  uLightColor: new THREE.Color(1.0, 0.9, 0.7),
  uDensity: 0.05,
  uAbsorption: 0.5,
  uScattering: 0.4,
  uPhaseG: 0.7,
  uStepCount: 32,
  uTime: 0.0,
  uSmokeOrigin: new THREE.Vector3(0, 0, 0),
  uSmokeRadius: 15.0,
  uSmokeColor: new THREE.Color(0.4, 0.38, 0.35),
  uEmissionColor: new THREE.Color(1.0, 0.5, 0.1),
  uEmissionIntensity: 0.5,
  uTurbulenceScale: 0.15,
  uTurbulenceStrength: 0.8,
  uNoiseScale: 0.12,
  uNoiseStrength: 0.7,
  u_noiseSeed: 0,
};

/** Default parameters for atmospheric scattering */
export const DEFAULT_ATMOSPHERE_PARAMS: Omit<AtmosphericScatteringUniforms, 'tDepth' | 'tDiffuse' | 'uInvProjection' | 'uProjection' | 'uInvView' | 'uCameraPos' | 'uResolution'> = {
  uSunDirection: new THREE.Vector3(0.5, 0.8, 0.3).normalize(),
  uSunColor: new THREE.Color(1.0, 0.95, 0.85).multiplyScalar(10.0),
  uRayleighCoeff: 5.5,
  uMieCoeff: 0.003,
  uMieG: 0.76,
  uAtmosphereHeight: 100.0,
  uDensity: 1.0,
  uStepCount: 16,
  uTime: 0.0,
  uWavelengths: new THREE.Vector3(680, 550, 440),
};

// We need THREE for the type imports above
import * as THREE from 'three';
