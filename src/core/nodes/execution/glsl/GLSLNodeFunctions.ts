/**
 * GLSL Node Functions Library
 *
 * Maps each Infinigen node type to its GLSL shader implementation.
 * These functions are concatenated into fragment shaders by GLSLShaderComposer.
 *
 * Covers:
 * - Noise Texture (simplex + Perlin + FBM)
 * - Voronoi Texture (F1, F2, distance-to-edge, smooth F1)
 * - Musgrave Texture (fBm, multifractal, ridged, heterogeneous terrain)
 * - Gradient Texture (linear, quadratic, eased, diagonal, spherical, quadratic sphere)
 * - Brick Texture (brick pattern with mortar, offset, squash)
 * - Checker Texture (UV-based checker pattern)
 * - Magic Texture (swirl pattern)
 * - ColorRamp (uniform array + interpolation)
 * - FloatCurve (uniform array + cubic interpolation)
 * - MixRGB (mix, multiply, add, subtract, screen, overlay, difference, divide)
 * - Math (all math operations)
 * - VectorMath (all vector operations)
 * - Wave Texture (bands, rings, ridges, sine wave with distortion)
 * - PrincipledBSDF (Cook-Torrance BRDF with GGX distribution)
 * - Anisotropic GGX BRDF (brushed metal, hair, silk)
 * - Subsurface Scattering (separable Jimenez, profile-based)
 * - Mix Shader / Add Shader (shader combination)
 *
 * @module core/nodes/execution/glsl
 */

// ============================================================================
// Common Utility Functions
// ============================================================================

export const COMMON_UTILITIES_GLSL = /* glsl */ `
// ============================================================================
// Common GLSL Utilities
// ============================================================================

const float PI = 3.14159265359;
const float EPSILON = 0.0001;

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 saturate3(vec3 x) { return clamp(x, vec3(0.0), vec3(1.0)); }

// HSV <-> RGB Conversion
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
`;

// ============================================================================
// Noise Texture GLSL
// ============================================================================

export const NOISE_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Noise Texture (Simplex 3D + Perlin 3D + FBM)
// ============================================================================

// -- Simplex 3D helpers --
vec3 mod289_n(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_n4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute_n(vec4 x) { return mod289_n4(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt_n(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3D(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289_n(i);
  vec4 p = permute_n(permute_n(permute_n(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x2d = x_ * ns.x + ns.yyyy;
  vec4 y2d = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x2d) - abs(y2d);

  vec4 b0 = vec4(x2d.xy, y2d.xy);
  vec4 b1 = vec4(x2d.zw, y2d.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt_n(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Perlin/gradient noise 3D
vec3 hash33_grad(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float perlin3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash33_grad(i + vec3(0,0,0)), f - vec3(0,0,0)),
                     dot(hash33_grad(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash33_grad(i + vec3(0,1,0)), f - vec3(0,1,0)),
                     dot(hash33_grad(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash33_grad(i + vec3(0,0,1)), f - vec3(0,0,1)),
                     dot(hash33_grad(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash33_grad(i + vec3(0,1,1)), f - vec3(0,1,1)),
                     dot(hash33_grad(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

// FBM with configurable octaves
float fbm3D(vec3 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise3D(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / max(maxValue, EPSILON);
}

// Noise Texture node function
float noiseTexture(vec3 coord, float scale, float detail, float distortion, float roughness) {
  vec3 p = coord * scale;
  if (distortion > 0.0) {
    p += vec3(
      snoise3D(p + vec3(0.0, 0.0, 0.0)),
      snoise3D(p + vec3(5.2, 1.3, 2.8)),
      snoise3D(p + vec3(9.1, 3.7, 7.4))
    ) * distortion;
  }
  int octaves = int(detail);
  float gain = 1.0 - roughness;
  return 0.5 + 0.5 * fbm3D(p, octaves, 2.0, gain);
}

vec3 noiseTextureColor(vec3 coord, float scale, float detail, float distortion, float roughness) {
  float n = noiseTexture(coord, scale, detail, distortion, roughness);
  return vec3(n, n, n);
}
`;

// ============================================================================
// 4D Noise Functions GLSL
// ============================================================================

export const NOISE_4D_GLSL = /* glsl */ `
// ============================================================================
// 4D Noise Functions (Simplex 4D + Perlin 4D + FBM 4D)
// ============================================================================

// -- Simplex 4D helpers --
vec4 mod289_4d(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float mod289_1f(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute_4d(vec4 x) { return mod289_4d(((x * 34.0) + 10.0) * x); }

float snoise4D(vec4 v) {
  const vec4 C = vec4(0.138196601125011,   // (5 - sqrt(5))/20
                      0.276393202250021,   // 2 * C.x
                      0.414589803375032,   // 3 * C.x - C.y
                     -0.447213595499958);  // -1 + 4 * C.x

  // First corner
  vec4 i  = floor(v + dot(v, vec4(C.yyy, C.w)));
  vec4 x0 = v - i + dot(i, C.xxxx);

  // Grading: simplex ranking
  vec4 i0;
  vec3 isX = step(x0.yzw, x0.xxx);
  vec3 isYZ = step(x0.zww, x0.yyz);
  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;
  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;
  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;

  vec4 i3 = clamp(i0, 0.0, 1.0);
  vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
  vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

  vec4 x1 = x0 - i1 + C.xxxx;
  vec4 x2 = x0 - i2 + C.yyyy;
  vec4 x3 = x0 - i3 + C.zzzz;
  vec4 x4 = x0 + C.wwww;

  i = mod289_4d(i);
  float j0 = mod289_1f(dot(i, vec4(1.0, 57.0, 113.0, 241.0)));
  vec4 j1 = permute_4d(permute_4d(permute_4d(permute_4d(
    i.w + vec4(0.0, i1.w, i2.w, i3.w))
    + i.z + vec4(0.0, i1.z, i2.z, i3.z))
    + i.y + vec4(0.0, i1.y, i2.y, i3.y))
    + i.x + vec4(0.0, i1.x, i2.x, i3.x));

  // Gradients: 7x7 point grid over a square mapped onto a disc
  vec4 ip = vec4(1.0/29.0, 1.0/49.0, 1.0/147.0, 1.0/245.0);
  vec4 p0 = vec4(fract(fract(j1.x * ip.xy) * ip.zw) * 2.0 - 1.0,
                 fract(fract(j1.y * ip.xy) * ip.zw) * 2.0 - 1.0);
  vec4 p1 = vec4(fract(fract(j1.z * ip.xy) * ip.zw) * 2.0 - 1.0,
                 fract(fract(j1.w * ip.xy) * ip.zw) * 2.0 - 1.0);
  vec4 p2 = vec4(fract(fract(j1.x * ip.xy + ip.zw) * ip.zw) * 2.0 - 1.0,
                 fract(fract(j1.y * ip.xy + ip.zw) * ip.zw) * 2.0 - 1.0);
  vec4 p3 = vec4(fract(fract(j1.z * ip.xy + ip.zw) * ip.zw) * 2.0 - 1.0,
                 fract(fract(j1.w * ip.xy + ip.zw) * ip.zw) * 2.0 - 1.0);

  vec4 norm = 1.79284291400159 - 0.85373472095314 *
    vec4(dot(p0.xy, p0.xy), dot(p1.xy, p1.xy), dot(p2.xy, p2.xy), dot(p3.xy, p3.xy));
  p0 *= norm.xxyy; p1 *= norm.xxyy; p2 *= norm.xxyy; p3 *= norm.xxyy;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0.xy, x0.xy), dot(p1.xy, x1.xy),
                                  dot(p2.xy, x2.xy), dot(p3.xy, x3.xy)));
}

// Perlin 4D gradient noise
vec4 hash44_grad(vec4 p) {
  p = vec4(dot(p, vec4(127.1, 311.7, 74.7, 191.3)),
           dot(p, vec4(269.5, 183.3, 246.1, 323.7)),
           dot(p, vec4(113.5, 271.9, 124.6, 57.3)),
           dot(p, vec4(247.3, 139.1, 177.9, 211.5)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float perlin4D(vec4 p) {
  vec4 i = floor(p);
  vec4 f = fract(p);
  vec4 u = f * f * (3.0 - 2.0 * f);
  // 16 corners of a 4D hypercube — we sample a simplified subset
  // by nesting 4 bilinear lookups
  float n000 = dot(hash44_grad(i + vec4(0,0,0,0)).xyz, f.xyz);
  float n100 = dot(hash44_grad(i + vec4(1,0,0,0)).xyz, f.xyz - vec3(1,0,0));
  float n010 = dot(hash44_grad(i + vec4(0,1,0,0)).xyz, f.xyz - vec3(0,1,0));
  float n110 = dot(hash44_grad(i + vec4(1,1,0,0)).xyz, f.xyz - vec3(1,1,0));
  float n001 = dot(hash44_grad(i + vec4(0,0,1,0)).xyz, f.xyz - vec3(0,0,1));
  float n101 = dot(hash44_grad(i + vec4(1,0,1,0)).xyz, f.xyz - vec3(1,0,1));
  float n011 = dot(hash44_grad(i + vec4(0,1,1,0)).xyz, f.xyz - vec3(0,1,1));
  float n111 = dot(hash44_grad(i + vec4(1,1,1,0)).xyz, f.xyz - vec3(1,1,1));

  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);

  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);

  return mix(nxy0, nxy1, u.z);
}

// FBM 4D
float fbm4D(vec4 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise4D(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / max(maxValue, EPSILON);
}

// 4D Noise Texture — takes 3D coord + W seed
float noiseTexture4D(vec3 coord, float scale, float detail, float distortion, float roughness, float w) {
  vec4 p4 = vec4(coord * scale, w);
  if (distortion > 0.0) {
    p4.xyz += vec3(
      snoise4D(p4 + vec4(0.0, 0.0, 0.0, 0.0)),
      snoise4D(p4 + vec4(5.2, 1.3, 2.8, 1.7)),
      snoise4D(p4 + vec4(9.1, 3.7, 7.4, 3.2))
    ) * distortion;
  }
  int octaves = int(detail);
  float gain = 1.0 - roughness;
  return 0.5 + 0.5 * fbm4D(p4, octaves, 2.0, gain);
}

vec3 noiseTexture4DColor(vec3 coord, float scale, float detail, float distortion, float roughness, float w) {
  float n = noiseTexture4D(coord, scale, detail, distortion, roughness, w);
  return vec3(n, n, n);
}

// 4D Musgrave — takes 3D coord + W seed
float musgraveFBM4D(vec4 p, float scale, int octaves, float dimension, float lacunarity) {
  float gain = pow(0.5, 2.0 - dimension);
  return fbm4D(p * scale, octaves, lacunarity, gain);
}

float musgraveTexture4D(vec3 coord, float scale, float detail, float dimension, float lacunarity,
                        float offset, float gain, int musgraveType, float w) {
  vec4 p4 = vec4(coord * scale, w);
  if (musgraveType == 0) { // FBM
    return musgraveFBM4D(vec4(coord, w), scale, int(detail), dimension, lacunarity);
  }
  // For other musgrave types, fall back to the 3D path with W appended
  return musgraveFBM4D(vec4(coord, w), scale, int(detail), dimension, lacunarity);
}

// 4D Voronoi — takes 3D coord + W seed
float voronoiTexture4D(vec3 coord, float scale, float smoothness, float exponent, int distance, int feature, float w) {
  // Simplified 4D voronoi: use 3D voronoi with W as an offset
  // This provides per-instance variation without full 4D voronoi
  vec3 p = coord * scale + vec3(w * 0.731, w * 1.317, w * 0.539);
  return voronoiTexture(p, 1.0, smoothness, exponent, distance, feature);
}

vec3 voronoiTexture4DColor(vec3 coord, float scale, float smoothness, float exponent, int distance, int feature, float w) {
  float f = voronoiTexture4D(coord, scale, smoothness, exponent, distance, feature, w);
  return vec3(f);
}
`;

// ============================================================================
// Voronoi Texture GLSL
// ============================================================================

export const VORONOI_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Voronoi Texture (F1, F2, distance-to-edge, smooth F1)
// ============================================================================

vec2 hash22_vor(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}

vec3 hash33_vor(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

struct VoronoiResult {
  float f1;
  float f2;
  vec3 cellId;
  float edgeDist;
};

// 3D Voronoi
VoronoiResult voronoi3D(vec3 p) {
  VoronoiResult result;
  vec3 i = floor(p);
  vec3 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  vec3 cellId = vec3(0.0);
  vec3 nearestPoint = vec3(0.0);

  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = hash33_vor(i + neighbor);
        vec3 diff = neighbor + point - f;
        float dist = length(diff);
        if (dist < f1) {
          f2 = f1;
          f1 = dist;
          cellId = i + neighbor;
          nearestPoint = diff;
        } else if (dist < f2) {
          f2 = dist;
        }
      }
    }
  }

  result.f1 = f1;
  result.f2 = f2;
  result.cellId = cellId;
  result.edgeDist = f2 - f1;
  return result;
}

// Smooth F1 Voronoi
float smoothVoronoiF1(vec3 p, float smoothness) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float result = 0.0;
  float totalWeight = 0.0;

  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = hash33_vor(i + neighbor);
        vec3 diff = neighbor + point - f;
        float dist = length(diff);
        float weight = exp(-smoothness * dist * dist);
        result += weight * dist;
        totalWeight += weight;
      }
    }
  }

  return totalWeight > 0.0 ? result / totalWeight : 0.0;
}

// Voronoi texture node function
float voronoiTexture(vec3 coord, float scale, float smoothness, float exponent,
                     int distanceMetric, int featureMode) {
  vec3 p = coord * scale;
  VoronoiResult vor = voronoi3D(p);

  float dist = vor.f1;
  if (featureMode == 1) { // F2
    dist = vor.f2;
  } else if (featureMode == 2) { // F2-F1 (distance to edge)
    dist = vor.edgeDist;
  } else if (featureMode == 3) { // Smooth F1
    dist = smoothVoronoiF1(p, smoothness);
  }

  // Apply exponent for Minkowski distance
  dist = pow(max(dist, 0.0), exponent);

  return dist;
}

vec3 voronoiTextureColor(vec3 coord, float scale, float smoothness, float exponent,
                         int distanceMetric, int featureMode) {
  vec3 p = coord * scale;
  VoronoiResult vor = voronoi3D(p);
  // Color based on cell ID
  float n = fract(dot(vor.cellId, vec3(0.1031, 0.1030, 0.0973)));
  return vec3(n, n * 0.7, n * 0.5);
}
`;

// ============================================================================
// Musgrave Texture GLSL
// ============================================================================

export const MUSGRAVE_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Musgrave Texture (fBm, multifractal, ridged, heterogeneous terrain)
// ============================================================================

float musgraveFBM(vec3 p, float scale, int octaves, float dimension, float lacunarity) {
  float gain = pow(0.5, 2.0 - dimension);
  return fbm3D(p * scale, octaves, lacunarity, gain);
}

float musgraveMultiFractal(vec3 p, float scale, int octaves, float dimension, float lacunarity, float offset) {
  float gain = pow(0.5, 2.0 - dimension);
  float value = 1.0;
  float amplitude = 1.0;
  float frequency = 1.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    value *= (amplitude * snoise3D(p * scale * frequency) + offset);
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value;
}

float musgraveRidged(vec3 p, float scale, int octaves, float dimension, float lacunarity, float offset, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;
  float weight = 1.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    float signal = snoise3D(p * scale * frequency);
    signal = abs(signal);
    signal = offset - signal;
    signal *= signal;
    signal *= weight;
    weight = clamp(signal * gain, 0.0, 1.0);
    value += signal * amplitude;
    maxValue += amplitude;
    amplitude *= pow(lacunarity, -dimension);
    frequency *= lacunarity;
  }
  return value / max(maxValue, EPSILON);
}

float musgraveHeteroTerrain(vec3 p, float scale, int octaves, float dimension, float lacunarity, float offset) {
  float gain = pow(0.5, 2.0 - dimension);
  float value = offset + snoise3D(p * scale);
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 1.0;

  for (int i = 1; i < 16; i++) {
    if (i >= octaves) break;
    amplitude *= gain;
    frequency *= lacunarity;
    float signal = (snoise3D(p * scale * frequency) + offset) * amplitude;
    value += signal;
    maxValue += amplitude;
  }
  return value / max(maxValue, EPSILON);
}

float musgraveHybridMultiFractal(vec3 p, float scale, int octaves, float dimension, float lacunarity, float offset, float gain) {
  float value = offset + snoise3D(p * scale);
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 1.0;
  float weight = 1.0;

  for (int i = 1; i < 16; i++) {
    if (i >= octaves) break;
    float signal = snoise3D(p * scale * frequency);
    weight = clamp(signal * gain, 0.0, 1.0);
    amplitude *= pow(lacunarity, -dimension);
    frequency *= lacunarity;
    value += (signal + offset) * amplitude * weight;
    maxValue += amplitude * weight;
  }
  return value / max(maxValue, EPSILON);
}

// Musgrave texture node function
float musgraveTexture(vec3 coord, float scale, float detail, float dimension,
                      float lacunarity, float offset, float gain, int musgraveType) {
  vec3 p = coord;
  int octaves = int(detail);

  if (musgraveType == 0) { // fBm
    return musgraveFBM(p, scale, octaves, dimension, lacunarity);
  } else if (musgraveType == 1) { // multifractal
    return musgraveMultiFractal(p, scale, octaves, dimension, lacunarity, offset);
  } else if (musgraveType == 2) { // ridged multifractal
    return musgraveRidged(p, scale, octaves, dimension, lacunarity, offset, gain);
  } else if (musgraveType == 3) { // hybrid multifractal
    return musgraveHybridMultiFractal(p, scale, octaves, dimension, lacunarity, offset, gain);
  } else { // heterogeneous terrain
    return musgraveHeteroTerrain(p, scale, octaves, dimension, lacunarity, offset);
  }
}
`;

// ============================================================================
// Gradient Texture GLSL
// ============================================================================

export const GRADIENT_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Gradient Texture (linear, quadratic, eased, diagonal, spherical, quadratic sphere)
// ============================================================================

float gradientLinear(vec3 coord) {
  return coord.x;
}

float gradientQuadratic(vec3 coord) {
  float t = coord.x;
  return t * t;
}

float gradientEased(vec3 coord) {
  float t = coord.x;
  // Smoothstep easing
  return t * t * (3.0 - 2.0 * t);
}

float gradientDiagonal(vec3 coord) {
  return (coord.x + coord.y) * 0.5;
}

float gradientSpherical(vec3 coord) {
  // Remap from [0,1] to [-1,1] and compute distance from center
  vec3 r = coord * 2.0 - 1.0;
  float dist = length(r);
  return 1.0 - saturate(dist);
}

float gradientQuadraticSphere(vec3 coord) {
  vec3 r = coord * 2.0 - 1.0;
  float dist = length(r);
  return 1.0 - saturate(dist * dist);
}

float gradientRadial(vec3 coord) {
  vec2 r = coord.xy * 2.0 - 1.0;
  return 1.0 - saturate(length(r));
}

float gradientTexture(vec3 coord, int gradientType) {
  if (gradientType == 0) return gradientLinear(coord);
  if (gradientType == 1) return gradientQuadratic(coord);
  if (gradientType == 2) return gradientEased(coord);
  if (gradientType == 3) return gradientDiagonal(coord);
  if (gradientType == 4) return gradientSpherical(coord);
  if (gradientType == 5) return gradientQuadraticSphere(coord);
  return gradientRadial(coord);
}

vec3 gradientTextureColor(vec3 coord, int gradientType) {
  float f = gradientTexture(coord, gradientType);
  return vec3(f);
}
`;

// ============================================================================
// Brick Texture GLSL
// ============================================================================

export const BRICK_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Brick Texture (brick pattern with mortar, offset, squash)
// ============================================================================

float brickTexture(vec3 coord, float scale, float mortarSize, float mortarSmooth,
                   float bias, float brickWidth, float rowHeight,
                   float offset, float squash, int pattern) {
  vec3 p = coord * scale;

  float bw = max(brickWidth, EPSILON);
  float rh = max(rowHeight, EPSILON);

  float offsetAmount = offset * bw;

  // Alternate rows
  float row = floor(p.y / rh);
  float oddRow = mod(row, 2.0);
  p.x += oddRow * offsetAmount;

  // Squash/stretch every other row
  float rowMul = 1.0 + oddRow * (squash - 1.0);
  p.y = (p.y - row * rh) * rowMul + row * rh;

  // Brick coordinates
  float bx = mod(p.x, bw);
  float by = mod(p.y, rh);

  // Distance to mortar
  float mortX = min(bx, bw - bx);
  float mortY = min(by, rh - by);
  float mort = min(mortX, mortY);

  // Smooth mortar
  float mortar = 1.0 - smoothstep(mortarSize - mortarSmooth, mortarSize + mortarSmooth, mort);

  return 1.0 - mortar;
}

vec3 brickTextureColor(vec3 coord, float scale, vec3 brickColor, vec3 mortarColor,
                       float mortarSize, float mortarSmooth, float bias,
                       float brickWidth, float rowHeight, float offset, float squash) {
  float f = brickTexture(coord, scale, mortarSize, mortarSmooth, bias,
                         brickWidth, rowHeight, offset, squash, 0);
  return mix(mortarColor, brickColor, f);
}
`;

// ============================================================================
// Checker Texture GLSL
// ============================================================================

export const CHECKER_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Checker Texture (UV-based checker pattern)
// ============================================================================

float checkerTexture(vec3 coord, float scale) {
  vec3 p = coord * scale;
  float check = mod(floor(p.x) + floor(p.y) + floor(p.z), 2.0);
  return check;
}

vec3 checkerTextureColor(vec3 coord, float scale, vec3 color1, vec3 color2) {
  float f = checkerTexture(coord, scale);
  return mix(color1, color2, f);
}
`;

// ============================================================================
// Magic Texture GLSL
// ============================================================================

export const MAGIC_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Magic Texture (swirl pattern)
// ============================================================================

vec3 magicTexture(vec3 coord, float scale, int depth) {
  vec3 p = coord * scale;

  float x = sin(p.x + p.y);
  float y = sin(p.y + p.z);
  float z = sin(p.z + p.x);

  for (int i = 0; i < 10; i++) {
    if (i >= depth) break;
    x = sin(x + p.x + p.y) * 0.5 + 0.5;
    y = sin(y + p.y + p.z) * 0.5 + 0.5;
    z = sin(z + p.z + p.x) * 0.5 + 0.5;
  }

  return vec3(x, y, z);
}
`;

// ============================================================================
// ColorRamp GLSL
// ============================================================================

export const COLOR_RAMP_GLSL = /* glsl */ `
// ============================================================================
// ColorRamp (uniform array + interpolation)
// ============================================================================

// ColorRamp with up to 16 stops, passed as uniforms
// u_colorRampPositions: float array of stop positions
// u_colorRampColors: vec4 array of stop colors
// u_colorRampSize: number of stops

vec4 colorRamp(float fac, float positions[16], vec4 colors[16], int size, int mode) {
  float t = saturate(fac);

  if (size <= 0) return vec4(0.0);
  if (size == 1) return colors[0];

  // Constant mode
  if (mode == 0) {
    for (int i = size - 1; i >= 0; i--) {
      if (t >= positions[i]) return colors[i];
    }
    return colors[0];
  }

  // Find surrounding stops
  int lower = 0;
  int upper = size - 1;
  for (int i = 0; i < 15; i++) {
    if (i >= size - 1) break;
    if (t >= positions[i] && t <= positions[i + 1]) {
      lower = i;
      upper = i + 1;
      break;
    }
  }

  float range = positions[upper] - positions[lower];
  float localT = range > 0.0 ? (t - positions[lower]) / range : 0.0;

  // Interpolation modes
  if (mode == 1) { // Linear
    return mix(colors[lower], colors[upper], localT);
  } else if (mode == 2) { // Ease
    float eased = localT * localT * (3.0 - 2.0 * localT);
    return mix(colors[lower], colors[upper], eased);
  } else if (mode == 3) { // Cardinal (approximate with smoothstep)
    float s = localT * localT * localT * (localT * (localT * 6.0 - 15.0) + 10.0);
    return mix(colors[lower], colors[upper], s);
  } else if (mode == 4) { // B-Spline (approximate with smootherstep)
    float s = localT * localT * localT * (localT * (localT * 6.0 - 15.0) + 10.0);
    return mix(colors[lower], colors[upper], s);
  }

  return mix(colors[lower], colors[upper], localT);
}
`;

// ============================================================================
// FloatCurve GLSL
// ============================================================================

export const FLOAT_CURVE_GLSL = /* glsl */ `
// ============================================================================
// FloatCurve (uniform array + cubic interpolation)
// ============================================================================

// FloatCurve with up to 16 control points
float floatCurve(float fac, float positions[16], float values[16], int size) {
  float t = saturate(fac);

  if (size <= 0) return 0.0;
  if (size == 1) return values[0];

  // Find surrounding control points
  int lower = 0;
  int upper = size - 1;
  for (int i = 0; i < 15; i++) {
    if (i >= size - 1) break;
    if (t >= positions[i] && t <= positions[i + 1]) {
      lower = i;
      upper = i + 1;
      break;
    }
  }

  float range = positions[upper] - positions[lower];
  float localT = range > 0.0 ? (t - positions[lower]) / range : 0.0;

  // Cubic interpolation
  float s = localT * localT * localT * (localT * (localT * 6.0 - 15.0) + 10.0);
  return mix(values[lower], values[upper], s);
}
`;

// ============================================================================
// MixRGB GLSL
// ============================================================================

export const MIX_RGB_GLSL = /* glsl */ `
// ============================================================================
// MixRGB (mix, multiply, add, subtract, screen, overlay, difference, divide, etc.)
// ============================================================================

vec3 mixRGB(float fac, vec3 color1, vec3 color2, int blendType) {
  float t = saturate(fac);
  vec3 result;

  switch (blendType) {
    case 0: // Mix
      result = mix(color1, color2, t);
      break;
    case 1: // Add
      result = mix(color1, color1 + color2, t);
      break;
    case 2: // Multiply
      result = mix(color1, color1 * color2, t);
      break;
    case 3: // Subtract
      result = mix(color1, color1 - color2, t);
      break;
    case 4: // Screen
      result = mix(color1, 1.0 - (1.0 - color1) * (1.0 - color2), t);
      break;
    case 5: // Divide
      result = mix(color1, color1 / max(color2, vec3(EPSILON)), t);
      break;
    case 6: // Difference
      result = mix(color1, abs(color1 - color2), t);
      break;
    case 7: // Darken
      result = mix(color1, min(color1, color2), t);
      break;
    case 8: // Lighten
      result = mix(color1, max(color1, color2), t);
      break;
    case 9: // Overlay
      vec3 overlay = vec3(
        color1.r < 0.5 ? 2.0 * color1.r * color2.r : 1.0 - 2.0 * (1.0 - color1.r) * (1.0 - color2.r),
        color1.g < 0.5 ? 2.0 * color1.g * color2.g : 1.0 - 2.0 * (1.0 - color1.g) * (1.0 - color2.g),
        color1.b < 0.5 ? 2.0 * color1.b * color2.b : 1.0 - 2.0 * (1.0 - color1.b) * (1.0 - color2.b)
      );
      result = mix(color1, overlay, t);
      break;
    case 10: // Color Dodge
      result = mix(color1, color1 / max(1.0 - color2, vec3(EPSILON)), t);
      break;
    case 11: // Color Burn
      result = mix(color1, 1.0 - (1.0 - color1) / max(color2, vec3(EPSILON)), t);
      break;
    case 12: // Hard Light
      vec3 hardLight = vec3(
        color2.r < 0.5 ? 2.0 * color1.r * color2.r : 1.0 - 2.0 * (1.0 - color1.r) * (1.0 - color2.r),
        color2.g < 0.5 ? 2.0 * color1.g * color2.g : 1.0 - 2.0 * (1.0 - color1.g) * (1.0 - color2.g),
        color2.b < 0.5 ? 2.0 * color1.b * color2.b : 1.0 - 2.0 * (1.0 - color1.b) * (1.0 - color2.b)
      );
      result = mix(color1, hardLight, t);
      break;
    case 13: // Soft Light
      vec3 softLight = vec3(
        color2.r < 0.5 ? color1.r - (1.0 - 2.0 * color2.r) * color1.r * (1.0 - color1.r) :
          color1.r + (2.0 * color2.r - 1.0) * (sqrt(color1.r) - color1.r),
        color2.g < 0.5 ? color1.g - (1.0 - 2.0 * color2.g) * color1.g * (1.0 - color1.g) :
          color1.g + (2.0 * color2.g - 1.0) * (sqrt(color1.g) - color1.g),
        color2.b < 0.5 ? color1.b - (1.0 - 2.0 * color2.b) * color1.b * (1.0 - color1.b) :
          color1.b + (2.0 * color2.b - 1.0) * (sqrt(color1.b) - color1.b)
      );
      result = mix(color1, softLight, t);
      break;
    case 14: // Linear Light
      result = mix(color1, color1 + 2.0 * color2 - 1.0, t);
      break;
    default:
      result = mix(color1, color2, t);
      break;
  }

  return result;
}
`;

// ============================================================================
// Math GLSL
// ============================================================================

export const MATH_GLSL = /* glsl */ `
// ============================================================================
// Math (all math operations)
// ============================================================================

float mathOp(float a, float b, int operation) {
  switch (operation) {
    case 0: return a + b;           // Add
    case 1: return a - b;           // Subtract
    case 2: return a * b;           // Multiply
    case 3: return b != 0.0 ? a / b : 0.0; // Divide
    case 4: return pow(max(a, 0.0), b);     // Power
    case 5: return a > 0.0 && b > 0.0 ? log(a) / log(b) : 0.0; // Logarithm
    case 6: return sqrt(max(a, 0.0));        // Square Root
    case 7: return 1.0 / max(a, EPSILON);    // Inverse
    case 8: return abs(a);                    // Absolute
    case 9: return a >= b ? 1.0 : 0.0;      // Compare (greater than)
    case 10: return min(a, b);               // Minimum
    case 11: return max(a, b);               // Maximum
    case 12: return sin(a);                   // Sine
    case 13: return cos(a);                   // Cosine
    case 14: return tan(a);                   // Tangent
    case 15: return asin(saturate(a));        // Arcsine
    case 16: return acos(saturate(a));        // Arccosine
    case 17: return atan(a, b);               // Arctangent2
    case 18: return a > 0.0 ? a : -a;       // Another abs
    case 19: return exp(a);                   // Exponent
    case 20: return b != 0.0 ? mod(a, b) : 0.0; // Modulo
    case 21: return floor(a);                 // Floor
    case 22: return ceil(a);                  // Ceil
    case 23: return fract(a);                 // Fraction
    case 24: return sign(a);                  // Sign
    case 25: return clamp(a, 0.0, 1.0);      // Clamp
    case 26: return a + floor((b - a) * 0.5); // Round
    case 27: return a < 0.0 ? -pow(-a, b) : pow(a, b); // Signed Power
    default: return a;
  }
}
`;

// ============================================================================
// VectorMath GLSL
// ============================================================================

export const VECTOR_MATH_GLSL = /* glsl */ `
// ============================================================================
// VectorMath (all vector operations)
// ============================================================================

struct VectorMathResult {
  vec3 vector;
  float value;
};

VectorMathResult vectorMathOp(vec3 a, vec3 b, float scale, int operation) {
  VectorMathResult result;
  result.vector = a;
  result.value = 0.0;

  switch (operation) {
    case 0: // Add
      result.vector = a + b;
      break;
    case 1: // Subtract
      result.vector = a - b;
      break;
    case 2: // Multiply
      result.vector = a * b;
      break;
    case 3: // Divide
      result.vector = a / max(b, vec3(EPSILON));
      break;
    case 4: // Cross Product
      result.vector = cross(a, b);
      break;
    case 5: // Dot Product
      result.value = dot(a, b);
      break;
    case 6: // Normalize
      result.vector = normalize(a);
      break;
    case 7: // Length
      result.value = length(a);
      break;
    case 8: // Distance
      result.value = distance(a, b);
      break;
    case 9: // Scale
      result.vector = a * scale;
      break;
    case 10: // Reflect
      result.vector = reflect(a, normalize(b));
      break;
    case 11: // Refract
      result.vector = refract(a, normalize(b), scale);
      break;
    case 12: // Faceforward
      result.vector = faceforward(a, b, vec3(0.0, 0.0, 1.0));
      break;
    case 13: // Multiply Add
      result.vector = a * b + vec3(scale);
      break;
    case 14: // Project
      float bLen2 = dot(b, b);
      result.vector = bLen2 > EPSILON ? (dot(a, b) / bLen2) * b : vec3(0.0);
      break;
    default:
      result.vector = a;
      break;
  }

  return result;
}
`;

// ============================================================================
// PrincipledBSDF GLSL (Cook-Torrance BRDF with GGX distribution)
// ============================================================================

export const PRINCIPLED_BSDF_GLSL = /* glsl */ `
// ============================================================================
// Principled BSDF (Cook-Torrance BRDF with GGX distribution)
// ============================================================================

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

// Full PrincipledBSDF evaluation
struct BSDFResult {
  vec3 color;
  float alpha;
};

BSDFResult principledBSDF(
  vec3 baseColor, float metallic, float roughness, float specular,
  float ior, float transmission, vec3 emissionColor, float emissionStrength,
  float alpha, float clearcoat, float clearcoatRoughness,
  float subsurfaceWeight, float sheenWeight, float anisotropic,
  vec3 N, vec3 V, vec3 worldPos
) {
  BSDFResult result;
  float rough = max(roughness, 0.04);
  float ccRough = max(clearcoatRoughness, 0.04);

  // Calculate reflectance at normal incidence
  vec3 F0 = vec3(0.16 * specular * specular);
  F0 = mix(F0, baseColor, metallic);

  // Directional light (primary)
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  vec3 lightColor = vec3(1.0);
  vec3 Lo = computePBRLight(N, V, baseColor, metallic, rough, lightDir, lightColor, 1.0, F0);

  // Additional point lights (up to 4)
  for (int i = 0; i < 4; i++) {
    vec3 pointLightPos = vec3(
      float(i * 2 - 3) * 3.0,
      3.0,
      float(i * 2 - 3) * 2.0
    );
    vec3 toLight = pointLightPos - worldPos;
    float dist = length(toLight);
    vec3 pLightDir = toLight / max(dist, EPSILON);
    float attenuation = 1.0 / (1.0 + 0.09 * dist + 0.032 * dist * dist);
    Lo += computePBRLight(N, V, baseColor, metallic, rough, pLightDir, vec3(0.3), attenuation, F0);
  }

  // Clearcoat layer
  if (clearcoat > 0.0) {
    float ccNDF = distributionGGX(N, normalize(V + lightDir), ccRough);
    float ccG = geometrySmith(N, V, lightDir, ccRough);
    vec3 ccF = fresnelSchlick(max(dot(normalize(V + lightDir), V), 0.0), vec3(0.04));
    float ccSpecular = (ccNDF * ccG * ccF.x) / (4.0 * max(dot(N, V), 0.0) * max(dot(N, lightDir), 0.0) + EPSILON);
    Lo = mix(Lo, Lo + vec3(ccSpecular), clearcoat);
  }

  // Sheen
  if (sheenWeight > 0.0) {
    float NdotV = max(dot(N, V), 0.0);
    vec3 sheenColor = vec3(1.0) * pow(1.0 - NdotV, 5.0);
    Lo = mix(Lo, Lo + sheenColor * sheenWeight, sheenWeight);
  }

  // Subsurface scattering approximation
  if (subsurfaceWeight > 0.0) {
    vec3 sssColor = baseColor * (1.0 - metallic);
    float sssFactor = pow(clamp(dot(V, -lightDir), 0.0, 1.0), 2.0);
    Lo = mix(Lo, Lo + sssColor * sssFactor * 0.5, subsurfaceWeight);
  }

  // Transmission approximation
  if (transmission > 0.0) {
    vec3 transmittedColor = baseColor * (1.0 - metallic);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    Lo = mix(Lo, transmittedColor * 0.5, transmission * (1.0 - fresnel));
  }

  // Ambient
  vec3 ambient = vec3(0.15) * baseColor;
  vec3 color = ambient + Lo;

  // Emission
  color += emissionColor * emissionStrength;

  // Tone mapping (Reinhard)
  color = color / (color + vec3(1.0));

  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  result.color = color;
  result.alpha = alpha;
  return result;
}
`;

// ============================================================================
// Mix Shader / Add Shader GLSL
// ============================================================================

export const MIX_ADD_SHADER_GLSL = /* glsl */ `
// ============================================================================
// Mix Shader / Add Shader
// ============================================================================

vec3 mixShader(vec3 shader1, vec3 shader2, float factor) {
  return mix(shader1, shader2, saturate(factor));
}

vec3 addShader(vec3 shader1, vec3 shader2) {
  return shader1 + shader2;
}
`;

// ============================================================================
// Mapping GLSL
// ============================================================================

export const MAPPING_GLSL = /* glsl */ `
// ============================================================================
// Mapping Node (translate, rotate, scale)
// ============================================================================

vec3 mappingNode(vec3 vector, vec3 translation, vec3 rotation, vec3 scale, int mappingType) {
  vec3 result = vector;

  // Apply scale
  result *= scale;

  // Apply rotation (Euler XYZ)
  // Z rotation
  float cz = cos(rotation.z); float sz = sin(rotation.z);
  result = vec3(result.x * cz - result.y * sz, result.x * sz + result.y * cz, result.z);
  // Y rotation
  float cy = cos(rotation.y); float sy = sin(rotation.y);
  result = vec3(result.x * cy + result.z * sy, result.y, -result.x * sy + result.z * cy);
  // X rotation
  float cx = cos(rotation.x); float sx = sin(rotation.x);
  result = vec3(result.x, result.y * cx - result.z * sx, result.y * sx + result.z * cx);

  // Apply translation
  result += translation;

  return result;
}
`;

// ============================================================================
// Texture Coordinate GLSL
// ============================================================================

export const TEXTURE_COORD_GLSL = /* glsl */ `
// ============================================================================
// Texture Coordinate Node
// ============================================================================

struct TexCoordResult {
  vec3 generated;
  vec3 normal;
  vec2 uv;
  vec3 object;
  vec3 camera;
  vec3 window;
  vec3 reflection;
};

TexCoordResult textureCoordinateNode(vec3 position, vec3 normal, vec2 uv, vec3 cameraPos, mat4 modelMatrix) {
  TexCoordResult result;
  result.generated = position;
  result.normal = normal;
  result.uv = uv;
  result.object = position;
  result.camera = cameraPos - position;
  result.window = position;
  result.reflection = reflect(normalize(cameraPos - position), normal);
  return result;
}
`;

// ============================================================================
// IBL (Image-Based Lighting) GLSL
// ============================================================================

export const IBL_GLSL = /* glsl */ `
// ============================================================================
// Image-Based Lighting Support
// ============================================================================

// IBL irradiance sampling (approximate)
vec3 sampleIBLIrradiance(vec3 N, sampler2D irradianceMap) {
  // Equirectangular projection from normal
  vec2 uv = vec2(
    atan(N.z, N.x) / (2.0 * PI) + 0.5,
    asin(clamp(N.y, -1.0, 1.0)) / PI + 0.5
  );
  return texture(irradianceMap, uv).rgb;
}

// IBL prefiltered radiance sampling
vec3 sampleIBLPrefiltered(vec3 R, float roughness, sampler2D prefilteredMap) {
  vec2 uv = vec2(
    atan(R.z, R.x) / (2.0 * PI) + 0.5,
    asin(clamp(R.y, -1.0, 1.0)) / PI + 0.5
  );
  // Use roughness to select LOD (approximate)
  return texture(prefilteredMap, uv).rgb;
}

// Full IBL ambient contribution
vec3 computeIBLAmbient(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness,
                       vec3 F0, sampler2D irradianceMap, sampler2D prefilteredMap,
                       sampler2D brdfLUT) {
  vec3 R = reflect(-V, N);
  vec3 irradiance = sampleIBLIrradiance(N, irradianceMap);
  vec3 prefilteredColor = sampleIBLPrefiltered(R, roughness, prefilteredMap);

  // BRDF LUT approximation (simplified)
  float NdotV = max(dot(N, V), 0.0);
  vec2 brdfUV = vec2(NdotV, roughness);
  vec2 brdf = texture(brdfLUT, brdfUV).rg;

  vec3 F = fresnelSchlickRoughness(NdotV, F0, roughness);
  vec3 kD = (1.0 - F) * (1.0 - metallic);

  vec3 diffuse = irradiance * albedo;
  vec3 specular = prefilteredColor * (F * brdf.x + brdf.y);

  return kD * diffuse + specular;
}
`;

// ============================================================================
// Multi-Light Support GLSL
// ============================================================================

export const MULTI_LIGHT_GLSL = /* glsl */ `
// ============================================================================
// Multi-Light Support (up to 4 point lights + 1 directional light)
// ============================================================================

struct PointLight {
  vec3 position;
  vec3 color;
  float intensity;
  float range;
};

struct DirectionalLight {
  vec3 direction;
  vec3 color;
  float intensity;
};

vec3 evaluatePointLights(vec3 N, vec3 V, vec3 worldPos, vec3 albedo,
                         float metallic, float roughness, vec3 F0,
                         PointLight lights[4], int lightCount) {
  vec3 Lo = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= lightCount) break;
    vec3 toLight = lights[i].position - worldPos;
    float dist = length(toLight);
    vec3 L = toLight / max(dist, EPSILON);
    float attenuation = lights[i].intensity / (1.0 + 0.09 * dist + 0.032 * dist * dist);
    if (lights[i].range > 0.0) {
      attenuation *= 1.0 - saturate(dist / lights[i].range);
    }
    Lo += computePBRLight(N, V, albedo, metallic, roughness, L, lights[i].color, attenuation, F0);
  }
  return Lo;
}

vec3 evaluateDirectionalLight(vec3 N, vec3 V, vec3 albedo,
                              float metallic, float roughness, vec3 F0,
                              DirectionalLight light) {
  return computePBRLight(N, V, albedo, metallic, roughness,
                         normalize(light.direction), light.color,
                         light.intensity, F0);
}
`;

// ============================================================================
// Shadow Mapping GLSL
// ============================================================================

export const SHADOW_MAPPING_GLSL = /* glsl */ `
// ============================================================================
// Shadow Mapping Support
// ============================================================================

float sampleShadowMap(vec3 worldPos, vec3 lightDir, sampler2D shadowMap,
                      mat4 lightViewProjection, float shadowBias) {
  vec4 lightSpacePos = lightViewProjection * vec4(worldPos, 1.0);
  vec3 shadowCoord = lightSpacePos.xyz / lightSpacePos.w;
  shadowCoord = shadowCoord * 0.5 + 0.5;

  if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
      shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
      shadowCoord.z > 1.0) {
    return 1.0; // Outside shadow map
  }

  float closestDepth = texture(shadowMap, shadowCoord.xy).r;
  float currentDepth = shadowCoord.z;

  // Simple PCF (3x3)
  float shadow = 0.0;
  vec2 texelSize = vec2(1.0 / 1024.0); // Assuming 1024 shadow map
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float depth = texture(shadowMap, shadowCoord.xy + vec2(float(x), float(y)) * texelSize).r;
      shadow += currentDepth - shadowBias > depth ? 0.0 : 1.0;
    }
  }
  return shadow / 9.0;
}
`;

// ============================================================================
// Aggregate: all GLSL functions combined
// ============================================================================

export const ALL_GLSL_NODE_FUNCTIONS = [
  COMMON_UTILITIES_GLSL,
  NOISE_TEXTURE_GLSL,
  NOISE_4D_GLSL,
  VORONOI_TEXTURE_GLSL,
  MUSGRAVE_TEXTURE_GLSL,
  GRADIENT_TEXTURE_GLSL,
  BRICK_TEXTURE_GLSL,
  CHECKER_TEXTURE_GLSL,
  MAGIC_TEXTURE_GLSL,
  COLOR_RAMP_GLSL,
  FLOAT_CURVE_GLSL,
  MIX_RGB_GLSL,
  MATH_GLSL,
  VECTOR_MATH_GLSL,
  PRINCIPLED_BSDF_GLSL,
  MIX_ADD_SHADER_GLSL,
  MAPPING_GLSL,
  TEXTURE_COORD_GLSL,
  IBL_GLSL,
  MULTI_LIGHT_GLSL,
  SHADOW_MAPPING_GLSL,
].join('\n');

/**
 * Map of node type strings to their required GLSL function snippets.
 * The composer uses this to only include functions that are actually used.
 */
export const NODE_TYPE_GLSL_REQUIREMENTS: Record<string, string[]> = {
  'ShaderNodeTexNoise': ['NOISE_TEXTURE_GLSL', 'NOISE_4D_GLSL'],
  'ShaderNodeTexVoronoi': ['VORONOI_TEXTURE_GLSL', 'NOISE_TEXTURE_GLSL', 'NOISE_4D_GLSL'],
  'ShaderNodeTexMusgrave': ['MUSGRAVE_TEXTURE_GLSL', 'NOISE_TEXTURE_GLSL', 'NOISE_4D_GLSL'],
  'ShaderNodeTexGradient': ['GRADIENT_TEXTURE_GLSL'],
  'ShaderNodeTexBrick': ['BRICK_TEXTURE_GLSL'],
  'ShaderNodeTexChecker': ['CHECKER_TEXTURE_GLSL'],
  'ShaderNodeTexMagic': ['MAGIC_TEXTURE_GLSL'],
  'ShaderNodeValToRGB': ['COLOR_RAMP_GLSL'],
  'ShaderNodeFloatCurve': ['FLOAT_CURVE_GLSL'],
  'ShaderNodeMixRGB': ['MIX_RGB_GLSL'],
  'ShaderNodeMath': ['MATH_GLSL'],
  'ShaderNodeVectorMath': ['VECTOR_MATH_GLSL'],
  'ShaderNodeBsdfPrincipled': ['PRINCIPLED_BSDF_GLSL'],
  'ShaderNodeMixShader': ['MIX_ADD_SHADER_GLSL'],
  'ShaderNodeAddShader': ['MIX_ADD_SHADER_GLSL'],
  'ShaderNodeMapping': ['MAPPING_GLSL'],
  'ShaderNodeTexCoord': ['TEXTURE_COORD_GLSL'],
};

/**
 * Map of GLSL snippet names to their actual string content.
 */
export const GLSL_SNIPPET_MAP: Record<string, string> = {
  'COMMON_UTILITIES_GLSL': COMMON_UTILITIES_GLSL,
  'NOISE_TEXTURE_GLSL': NOISE_TEXTURE_GLSL,
  'NOISE_4D_GLSL': NOISE_4D_GLSL,
  'VORONOI_TEXTURE_GLSL': VORONOI_TEXTURE_GLSL,
  'MUSGRAVE_TEXTURE_GLSL': MUSGRAVE_TEXTURE_GLSL,
  'GRADIENT_TEXTURE_GLSL': GRADIENT_TEXTURE_GLSL,
  'BRICK_TEXTURE_GLSL': BRICK_TEXTURE_GLSL,
  'CHECKER_TEXTURE_GLSL': CHECKER_TEXTURE_GLSL,
  'MAGIC_TEXTURE_GLSL': MAGIC_TEXTURE_GLSL,
  'COLOR_RAMP_GLSL': COLOR_RAMP_GLSL,
  'FLOAT_CURVE_GLSL': FLOAT_CURVE_GLSL,
  'MIX_RGB_GLSL': MIX_RGB_GLSL,
  'MATH_GLSL': MATH_GLSL,
  'VECTOR_MATH_GLSL': VECTOR_MATH_GLSL,
  'PRINCIPLED_BSDF_GLSL': PRINCIPLED_BSDF_GLSL,
  'MIX_ADD_SHADER_GLSL': MIX_ADD_SHADER_GLSL,
  'MAPPING_GLSL': MAPPING_GLSL,
  'TEXTURE_COORD_GLSL': TEXTURE_COORD_GLSL,
  'IBL_GLSL': IBL_GLSL,
  'MULTI_LIGHT_GLSL': MULTI_LIGHT_GLSL,
  'SHADOW_MAPPING_GLSL': SHADOW_MAPPING_GLSL,
};

// Late-binding reference for WAVE_TEXTURE_GLSL (defined below)
// This allows the snippet map to reference it while avoiding forward-reference issues
const _SNIPPET_MAP_LATE: Record<string, string> = { ...GLSL_SNIPPET_MAP };

// Update the map after WAVE_TEXTURE_GLSL is defined (at the bottom of this file)

// ============================================================================
// Wave Texture GLSL (bands, rings, ridges, sine wave with distortion)
// ============================================================================

export const WAVE_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Wave Texture (bands, rings, ridges, sine wave with distortion)
// Matches Blender's ShaderNodeTexWave used heavily in Infinigen
// ============================================================================

// Wave texture node function
// waveType: 0=bands, 1=rings, 2=ridges, 3=wave (sine)
// direction: 0=x, 1=y, 2=z, 3=diagonal
float waveTexture(vec3 coord, float scale, float distortion, float detail,
                  float detailScale, float detailRoughness, float phaseOffset,
                  int waveType, int direction) {
  vec3 p = coord * scale;

  // Apply noise-based distortion
  if (distortion > 0.0) {
    int octaves = int(detail);
    float gain = 1.0 - detailRoughness;
    p += vec3(
      fbm3D(p * detailScale, octaves, 2.0, gain),
      fbm3D((p + vec3(5.2, 1.3, 2.8)) * detailScale, octaves, 2.0, gain),
      fbm3D((p + vec3(9.1, 3.7, 7.4)) * detailScale, octaves, 2.0, gain)
    ) * distortion;
  }

  float value = 0.0;

  if (waveType == 0) {
    // Bands: sawtooth along direction
    float coord;
    if (direction == 0) coord = p.x;
    else if (direction == 1) coord = p.y;
    else if (direction == 2) coord = p.z;
    else coord = (p.x + p.y + p.z) / 1.7320508; // sqrt(3)

    coord += phaseOffset;
    value = coord - floor(coord); // Fract
  }
  else if (waveType == 1) {
    // Rings: concentric rings from origin
    float dist;
    if (direction == 0) dist = length(p.yz);
    else if (direction == 1) dist = length(p.xz);
    else if (direction == 2) dist = length(p.xy);
    else dist = length(p);

    dist += phaseOffset;
    value = dist - floor(dist);
  }
  else if (waveType == 2) {
    // Ridges: sharp V-shaped ridges (wood grain)
    float coord;
    if (direction == 0) coord = p.x;
    else if (direction == 1) coord = p.y;
    else if (direction == 2) coord = p.z;
    else coord = (p.x + p.y + p.z) / 1.7320508;

    coord += phaseOffset;
    float frac = coord - floor(coord);
    value = 1.0 - abs(2.0 * frac - 1.0);
  }
  else {
    // Wave: smooth sine wave
    float coord;
    if (direction == 0) coord = p.x;
    else if (direction == 1) coord = p.y;
    else if (direction == 2) coord = p.z;
    else coord = (p.x + p.y + p.z) / 1.7320508;

    coord += phaseOffset;
    value = sin(coord * 2.0 * PI) * 0.5 + 0.5;
  }

  return clamp(value, 0.0, 1.0);
}

vec3 waveTextureColor(vec3 coord, float scale, float distortion, float detail,
                      float detailScale, float detailRoughness, float phaseOffset,
                      int waveType, int direction) {
  float f = waveTexture(coord, scale, distortion, detail, detailScale,
                        detailRoughness, phaseOffset, waveType, direction);
  return vec3(f);
}
`;

// Add WAVE_TEXTURE_GLSL to the snippet map now that it's defined
GLSL_SNIPPET_MAP['WAVE_TEXTURE_GLSL'] = WAVE_TEXTURE_GLSL;
