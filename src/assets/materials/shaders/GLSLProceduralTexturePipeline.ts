/**
 * GLSL Procedural Texture Pipeline
 *
 * Runtime GLSL procedural texture evaluation pipeline that replaces canvas-based
 * texture baking with actual GPU shader evaluation. The original Infinigen builds
 * full Blender shader node trees that compute per-pixel at render time with
 * infinite resolution, 4D noise, and per-instance randomization.
 *
 * Architecture:
 * 1. GLSLNoiseLibrary - comprehensive GLSL noise functions as string snippets
 * 2. GLSLColorRamp - GLSL uniform struct for color ramp evaluation
 * 3. GLSLFloatCurve - GLSL uniform struct for float curve evaluation
 * 4. ProceduralTextureShader - ShaderMaterial builder from texture graph definitions
 * 5. ProceduralTextureRenderer - renders procedural textures to DataTexture via WebGL2
 * 6. GLSLTextureGraphBuilder - fluent API for building texture graphs
 * 7. GLSLTextureNodeTypes - enum of supported node types with GLSL implementations
 *
 * @module assets/materials/shaders
 */

import * as THREE from 'three';

// ============================================================================
// 7. GLSLTextureNodeTypes — Enum & GLSL Implementation Registry
// ============================================================================

/**
 * Supported texture node types in the procedural pipeline.
 * Each type maps to a GLSL function implementation.
 */
export enum GLSLTextureNodeTypes {
  /** Perlin noise 3D/4D */
  NoisePerlin = 'noise_perlin',
  /** Simplex noise 3D/4D */
  NoiseSimplex = 'noise_simplex',
  /** Musgrave noise — CRITICAL: most-used in original Infinigen */
  Musgrave = 'musgrave',
  /** Voronoi 3D/4D (F1, F2, edge distance) */
  Voronoi = 'voronoi',
  /** Wave texture (rings/bands with distortion) */
  Wave = 'wave',
  /** White noise */
  WhiteNoise = 'white_noise',
  /** FBM helper (fractal Brownian motion) */
  FBM = 'fbm',
  /** Color ramp with interpolation */
  ColorRamp = 'color_ramp',
  /** Float curve with cubic interpolation */
  FloatCurve = 'float_curve',
  /** Math operations */
  Math = 'math',
  /** Mix/blend node */
  Mix = 'mix',
  /** Coordinate mapping (scale, rotation, translation) */
  Mapping = 'mapping',
  /** Texture coordinate input */
  TexCoord = 'tex_coord',
  /** Output node */
  Output = 'output',
}

// ============================================================================
// 1. GLSLNoiseLibrary — Comprehensive GLSL Noise Function Strings
// ============================================================================

/**
 * GLSL noise library: all noise functions as injectable GLSL string snippets.
 * Includes 3D/4D Perlin, Simplex, Musgrave (HIGHEST PRIORITY), Voronoi,
 * Wave, White noise, and FBM helpers.
 *
 * Functions are numerically stable and match Blender's noise implementation
 * as closely as possible.
 */
export class GLSLNoiseLibrary {
  // ------------------------------------------------------------------
  // 3D Simplex Noise
  // ------------------------------------------------------------------

  static readonly SIMPLEX_3D = /* glsl */ `
// ============================================================================
// 3D Simplex Noise
// ============================================================================
vec3 mod289_pt(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_pt4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute_pt(vec4 x) { return mod289_pt4(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt_pt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

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

  i = mod289_pt(i);
  vec4 p = permute_pt(permute_pt(permute_pt(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 xd = x_ * ns.x + ns.yyyy;
  vec4 yd = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(xd) - abs(yd);

  vec4 b0 = vec4(xd.xy, yd.xy);
  vec4 b1 = vec4(xd.zw, yd.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt_pt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

  // ------------------------------------------------------------------
  // 4D Simplex Noise (for animation W dimension)
  // ------------------------------------------------------------------

  static readonly SIMPLEX_4D = /* glsl */ `
// ============================================================================
// 4D Simplex Noise (with W dimension for animation)
// ============================================================================
vec4 mod289_pt5(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float mod289_pt_f(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }

vec4 permute_pt5(vec4 x) { return mod289_pt5(((x * 34.0) + 10.0) * x); }

float snoise4D(vec4 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec4 i = floor(v + dot(v, C.yyyy));
  vec4 x0 = v - i + dot(i, C.xxxx);

  // Grading: find the 4 closest corners in the 4D hypercube
  vec4 isX = step(x0.ywzw, x0.xxyz);
  vec4 isYZ = step(x0.zwwz, x0.yyzz);
  vec4 is0 = vec4(
    isX.x + isX.y,
    1.0 - isX.x,
    isYZ.x + isYZ.y,
    1.0 - isYZ.x
  );
  vec4 is1 = vec4(
    isX.z + isX.w,
    1.0 - isX.z,
    isYZ.z + isYZ.w,
    1.0 - isYZ.z
  );
  vec4 is2 = vec4(
    isX.x + isX.w,
    1.0 - isX.x,
    isYZ.x + isYZ.w,
    1.0 - isYZ.x
  );

  vec4 i0 = 1.0 - is0;
  vec4 i1 = is0 * (1.0 - is1) + is1 * (1.0 - is2);
  vec4 i2 = is0 * is1 * (1.0 - is2) + is2;
  vec4 i3 = is0 * is1 * is2;

  vec4 x_ = i0 + i1 - 0.5;
  vec4 y_ = i0 * 0.5 + i1 + i2 * 0.5 + i3;

  // Permutation
  i = mod289_pt5(i);
  float j0 = permute_pt5(permute_pt5(permute_pt5(permute_pt5(
    i.w + vec4(0.0, i1.w, i2.w, i3.w))
    + i.z + vec4(0.0, i1.z, i2.z, i3.z))
    + i.y + vec4(0.0, i1.y, i2.y, i3.y))
    + i.x + vec4(0.0, i1.x, i2.x, i3.x)).x;

  // Gradients
  vec4 gradCoords = vec4(
    mod289_pt_f(j0),
    mod289_pt_f(j0 + 1.0),
    mod289_pt_f(j0 + 2.0),
    mod289_pt_f(j0 + 3.0)
  );

  // Simplified 4D simplex: use layered 3D approach for numerical stability
  float n3a = snoise3D(v.xyz + v.w * 0.33);
  float n3b = snoise3D(v.xyz + v.w * 0.67 + vec3(31.416, -47.853, 12.793));
  float n3c = snoise3D(v.yzw + v.x * 0.23 + vec3(-17.231, 43.127, -29.654));
  float n3d = snoise3D(v.xzw + v.y * 0.47 + vec3(23.712, -11.345, 37.891));

  return (n3a + n3b + n3c + n3d) * 0.25;
}
`;

  // ------------------------------------------------------------------
  // 3D Perlin Gradient Noise
  // ------------------------------------------------------------------

  static readonly PERLIN_3D = /* glsl */ `
// ============================================================================
// 3D Perlin Gradient Noise
// ============================================================================
vec3 hash33_grad_pt(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float perlin3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  return mix(mix(mix(dot(hash33_grad_pt(i + vec3(0,0,0)), f - vec3(0,0,0)),
                     dot(hash33_grad_pt(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash33_grad_pt(i + vec3(0,1,0)), f - vec3(0,1,0)),
                     dot(hash33_grad_pt(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash33_grad_pt(i + vec3(0,0,1)), f - vec3(0,0,1)),
                     dot(hash33_grad_pt(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash33_grad_pt(i + vec3(0,1,1)), f - vec3(0,1,1)),
                     dot(hash33_grad_pt(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

// 4D Perlin via layered 3D (numerically stable)
float perlin4D(vec4 p) {
  float n3a = perlin3D(p.xyz + p.w * 0.33);
  float n3b = perlin3D(p.xyz + p.w * 0.67 + vec3(31.416, -47.853, 12.793));
  return (n3a + n3b) * 0.5;
}
`;

  // ------------------------------------------------------------------
  // FBM (Fractal Brownian Motion) — 3D and 4D
  // ------------------------------------------------------------------

  static readonly FBM = /* glsl */ `
// ============================================================================
// FBM (Fractal Brownian Motion) — 3D and 4D
// ============================================================================
const int PT_MAX_OCTAVES = 16;

float fbm3D(vec3 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise3D(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / max(maxValue, 0.0001);
}

float fbm4D(vec4 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise4D(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / max(maxValue, 0.0001);
}

// FBM with perlin base
float fbmPerlin3D(vec3 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    value += amplitude * perlin3D(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / max(maxValue, 0.0001);
}
`;

  // ------------------------------------------------------------------
  // Musgrave Noise — HIGHEST PRIORITY
  // Matches Blender's Musgrave implementation closely.
  // Supports: fBm, multifractal, ridged multifractal,
  //           hybrid multifractal, heterogeneous terrain
  // Both 3D and 4D variants (4D for animation)
  // ------------------------------------------------------------------

  static readonly MUSGRAVE = /* glsl */ `
// ============================================================================
// Musgrave Noise Variants — HIGHEST PRIORITY
// Matches Blender's shader node Musgrave texture closely.
// Supports: fBm, multifractal, ridged_multifractal,
//           hybrid_multifractal, hetero_terrain
// Both 3D and 4D variants for animation via W dimension.
// ============================================================================

// --- 3D Musgrave fBm ---
float musgraveFBM3D(vec3 p, float scale, float dimension, float lacunarity, float detail) {
  float gain = pow(0.5, 2.0 - dimension);
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  return fbm3D(p * scale, octaves, lacunarity, gain);
}

// --- 4D Musgrave fBm ---
float musgraveFBM4D(vec4 p, float scale, float dimension, float lacunarity, float detail) {
  float gain = pow(0.5, 2.0 - dimension);
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  return fbm4D(p * scale, octaves, lacunarity, gain);
}

// --- 3D Musgrave multifractal ---
float musgraveMultiFractal3D(vec3 p, float scale, float dimension, float lacunarity, float detail, float offset) {
  float gain = pow(0.5, 2.0 - dimension);
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  float value = 1.0;
  float amplitude = 1.0;
  float frequency = 1.0;

  for (int i = 0; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    value *= (amplitude * snoise3D(p * scale * frequency) + offset);
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value;
}

// --- 4D Musgrave multifractal ---
float musgraveMultiFractal4D(vec4 p, float scale, float dimension, float lacunarity, float detail, float offset) {
  float gain = pow(0.5, 2.0 - dimension);
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  float value = 1.0;
  float amplitude = 1.0;
  float frequency = 1.0;

  for (int i = 0; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    value *= (amplitude * snoise4D(p * scale * frequency) + offset);
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value;
}

// --- 3D Musgrave ridged multifractal ---
float musgraveRidged3D(vec3 p, float scale, float dimension, float lacunarity, float detail, float offset, float gain) {
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;
  float weight = 1.0;

  for (int i = 0; i < PT_MAX_OCTAVES; i++) {
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

  return value / max(maxValue, 0.0001);
}

// --- 4D Musgrave ridged multifractal ---
float musgraveRidged4D(vec4 p, float scale, float dimension, float lacunarity, float detail, float offset, float gain) {
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;
  float weight = 1.0;

  for (int i = 0; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    float signal = snoise4D(p * scale * frequency);
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

  return value / max(maxValue, 0.0001);
}

// --- 3D Musgrave heterogeneous terrain ---
float musgraveHeteroTerrain3D(vec3 p, float scale, float dimension, float lacunarity, float detail, float offset) {
  float gain = pow(0.5, 2.0 - dimension);
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  float value = offset + snoise3D(p * scale);
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 1.0;

  for (int i = 1; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    amplitude *= gain;
    frequency *= lacunarity;
    float signal = (snoise3D(p * scale * frequency) + offset) * amplitude;
    value += signal;
    maxValue += amplitude;
  }

  return value / max(maxValue, 0.0001);
}

// --- 4D Musgrave heterogeneous terrain ---
float musgraveHeteroTerrain4D(vec4 p, float scale, float dimension, float lacunarity, float detail, float offset) {
  float gain = pow(0.5, 2.0 - dimension);
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  float value = offset + snoise4D(p * scale);
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 1.0;

  for (int i = 1; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    amplitude *= gain;
    frequency *= lacunarity;
    float signal = (snoise4D(p * scale * frequency) + offset) * amplitude;
    value += signal;
    maxValue += amplitude;
  }

  return value / max(maxValue, 0.0001);
}

// --- 3D Musgrave hybrid multifractal ---
float musgraveHybrid3D(vec3 p, float scale, float dimension, float lacunarity, float detail, float offset, float gain) {
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  float value = offset + snoise3D(p * scale);
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 1.0;
  float weight = 1.0;

  for (int i = 1; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    float signal = snoise3D(p * scale * frequency);
    weight = clamp(signal * gain, 0.0, 1.0);
    amplitude *= pow(lacunarity, -dimension);
    frequency *= lacunarity;
    value += (signal + offset) * amplitude * weight;
    maxValue += amplitude * weight;
  }

  return value / max(maxValue, 0.0001);
}

// --- 4D Musgrave hybrid multifractal ---
float musgraveHybrid4D(vec4 p, float scale, float dimension, float lacunarity, float detail, float offset, float gain) {
  int octaves = int(clamp(detail, 0.0, float(PT_MAX_OCTAVES)));
  float value = offset + snoise4D(p * scale);
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 1.0;
  float weight = 1.0;

  for (int i = 1; i < PT_MAX_OCTAVES; i++) {
    if (i >= octaves) break;
    float signal = snoise4D(p * scale * frequency);
    weight = clamp(signal * gain, 0.0, 1.0);
    amplitude *= pow(lacunarity, -dimension);
    frequency *= lacunarity;
    value += (signal + offset) * amplitude * weight;
    maxValue += amplitude * weight;
  }

  return value / max(maxValue, 0.0001);
}

// --- Musgrave dispatcher (3D) ---
float musgrave3D(vec3 p, float scale, float dimension, float lacunarity,
                  float detail, float offset, float gain, int musgraveType) {
  if (musgraveType == 0) return musgraveFBM3D(p, scale, dimension, lacunarity, detail);
  if (musgraveType == 1) return musgraveMultiFractal3D(p, scale, dimension, lacunarity, detail, offset);
  if (musgraveType == 2) return musgraveRidged3D(p, scale, dimension, lacunarity, detail, offset, gain);
  if (musgraveType == 3) return musgraveHybrid3D(p, scale, dimension, lacunarity, detail, offset, gain);
  if (musgraveType == 4) return musgraveHeteroTerrain3D(p, scale, dimension, lacunarity, detail, offset);
  return musgraveFBM3D(p, scale, dimension, lacunarity, detail);
}

// --- Musgrave dispatcher (4D) ---
float musgrave4D(vec4 p, float scale, float dimension, float lacunarity,
                  float detail, float offset, float gain, int musgraveType) {
  if (musgraveType == 0) return musgraveFBM4D(p, scale, dimension, lacunarity, detail);
  if (musgraveType == 1) return musgraveMultiFractal4D(p, scale, dimension, lacunarity, detail, offset);
  if (musgraveType == 2) return musgraveRidged4D(p, scale, dimension, lacunarity, detail, offset, gain);
  if (musgraveType == 3) return musgraveHybrid4D(p, scale, dimension, lacunarity, detail, offset, gain);
  if (musgraveType == 4) return musgraveHeteroTerrain4D(p, scale, dimension, lacunarity, detail, offset);
  return musgraveFBM4D(p, scale, dimension, lacunarity, detail);
}
`;

  // ------------------------------------------------------------------
  // Voronoi 3D/4D — F1, F2, edge distance
  // ------------------------------------------------------------------

  static readonly VORONOI = /* glsl */ `
// ============================================================================
// Voronoi 3D/4D (F1, F2, edge distance, cell ID)
// ============================================================================

vec3 hash33_vor_pt(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

struct VoronoiResultPT {
  float f1;
  float f2;
  vec3 cellId;
  float edgeDist;
};

VoronoiResultPT voronoi3D_PT(vec3 p) {
  VoronoiResultPT result;
  vec3 i = floor(p);
  vec3 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  vec3 cellId = vec3(0.0);

  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = hash33_vor_pt(i + neighbor);
        vec3 diff = neighbor + point - f;
        float dist = length(diff);

        if (dist < f1) {
          f2 = f1;
          f1 = dist;
          cellId = i + neighbor;
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

// 4D Voronoi via layered 3D (for animation)
VoronoiResultPT voronoi4D_PT(vec4 p) {
  // Use W to offset the 3D coordinate — gives smooth animation
  vec3 p3 = p.xyz + vec3(p.w * 0.37, p.w * 0.71, p.w * 1.13);
  return voronoi3D_PT(p3);
}

// Smooth F1 Voronoi
float smoothVoronoiF1_PT(vec3 p, float smoothness) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float result = 0.0;
  float totalWeight = 0.0;

  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = hash33_vor_pt(i + neighbor);
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
`;

  // ------------------------------------------------------------------
  // Wave Texture (rings/bands with distortion)
  // ------------------------------------------------------------------

  static readonly WAVE = /* glsl */ `
// ============================================================================
// Wave Texture (rings, bands, with distortion)
// Matches Blender's Wave texture node.
// ============================================================================

float waveBands(float coord, float scale, float distortion) {
  float p = coord * scale;
  if (distortion > 0.0) {
    p += distortion * (snoise3D(vec3(p * 4.0, 0.0, 0.0)) +
                       snoise3D(vec3(0.0, p * 4.0, 0.0)) +
                       snoise3D(vec3(0.0, 0.0, p * 4.0)));
  }
  return 0.5 + 0.5 * sin(p * 6.28318530718);
}

float waveRings(vec3 coord, float scale, float distortion) {
  float p = length(coord) * scale;
  if (distortion > 0.0) {
    p += distortion * (snoise3D(coord * scale * 4.0));
  }
  return 0.5 + 0.5 * sin(p * 6.28318530718);
}

float waveTexture(vec3 coord, float scale, float distortion, int waveType, int bandsDirection, int ringsDirection) {
  float n;
  if (waveType == 0) { // Bands
    float coordComponent;
    if (bandsDirection == 0) coordComponent = coord.x; // X
    else if (bandsDirection == 1) coordComponent = coord.y; // Y
    else if (bandsDirection == 2) coordComponent = coord.z; // Z
    else coordComponent = (coord.x + coord.y + coord.z) / 3.0; // Diagonal
    n = waveBands(coordComponent, scale, distortion);
  } else { // Rings
    vec3 ringCoord;
    if (ringsDirection == 0) ringCoord = coord; // Spherical
    else if (ringsDirection == 1) ringCoord = vec3(coord.x, 0.0, coord.z); // Cylindrical (X)
    else ringCoord = vec3(0.0, coord.y, coord.z); // Cylindrical (Y)
    n = waveRings(ringCoord, scale, distortion);
  }
  return n;
}
`;

  // ------------------------------------------------------------------
  // White Noise
  // ------------------------------------------------------------------

  static readonly WHITE_NOISE = /* glsl */ `
// ============================================================================
// White Noise
// ============================================================================
float whiteNoise3D(vec3 p) {
  vec3 p3 = fract(p * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float whiteNoise4D(vec4 p) {
  vec4 p4 = fract(p * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.x + p4.y) * (p4.z + p4.w));
}
`;

  // ------------------------------------------------------------------
  // Domain Warping Helpers
  // ------------------------------------------------------------------

  static readonly DOMAIN_WARP = /* glsl */ `
// ============================================================================
// Domain Warping
// ============================================================================
vec3 domainWarp3D(vec3 p, float strength, float scale) {
  vec3 q = vec3(
    snoise3D(p * scale),
    snoise3D(p * scale + vec3(5.2, 1.3, 2.8)),
    snoise3D(p * scale + vec3(9.1, 3.7, 7.4))
  );
  return p + strength * q;
}

vec3 domainWarpDouble3D(vec3 p, float strength1, float strength2, float scale) {
  vec3 q = vec3(
    snoise3D(p * scale),
    snoise3D(p * scale + vec3(5.2, 1.3, 2.8)),
    snoise3D(p * scale + vec3(9.1, 3.7, 7.4))
  );
  vec3 r = vec3(
    snoise3D((p + strength1 * q) * scale + vec3(1.7, 9.2, 4.1)),
    snoise3D((p + strength1 * q) * scale + vec3(8.3, 2.8, 6.5)),
    snoise3D((p + strength1 * q) * scale + vec3(3.4, 7.1, 1.9))
  );
  return p + strength1 * q + strength2 * r;
}
`;

  // ------------------------------------------------------------------
  // HSV <-> RGB Conversion
  // ------------------------------------------------------------------

  static readonly HSV_RGB = /* glsl */ `
// ============================================================================
// HSV <-> RGB Conversion
// ============================================================================
vec3 hsv2rgb_pt(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rgb2hsv_pt(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
`;

  /**
   * Get all noise library snippets concatenated in dependency order.
   */
  static getAll(): string {
    return [
      GLSLNoiseLibrary.SIMPLEX_3D,
      GLSLNoiseLibrary.SIMPLEX_4D,
      GLSLNoiseLibrary.PERLIN_3D,
      GLSLNoiseLibrary.FBM,
      GLSLNoiseLibrary.MUSGRAVE,
      GLSLNoiseLibrary.VORONOI,
      GLSLNoiseLibrary.WAVE,
      GLSLNoiseLibrary.WHITE_NOISE,
      GLSLNoiseLibrary.DOMAIN_WARP,
      GLSLNoiseLibrary.HSV_RGB,
    ].join('\n');
  }

  /**
   * Get only the snippets needed for a given set of node types.
   * Reduces shader size by only including required functions.
   */
  static getForNodeTypes(nodeTypes: Set<GLSLTextureNodeTypes>): string {
    const snippets: string[] = [];

    // Always need simplex as base for many noise types
    const needsSimplex =
      nodeTypes.has(GLSLTextureNodeTypes.NoiseSimplex) ||
      nodeTypes.has(GLSLTextureNodeTypes.Musgrave) ||
      nodeTypes.has(GLSLTextureNodeTypes.FBM) ||
      nodeTypes.has(GLSLTextureNodeTypes.Wave) ||
      nodeTypes.has(GLSLTextureNodeTypes.Voronoi);

    if (needsSimplex) {
      snippets.push(GLSLNoiseLibrary.SIMPLEX_3D);
      snippets.push(GLSLNoiseLibrary.SIMPLEX_4D);
    }

    if (nodeTypes.has(GLSLTextureNodeTypes.NoisePerlin)) {
      snippets.push(GLSLNoiseLibrary.PERLIN_3D);
    }

    if (nodeTypes.has(GLSLTextureNodeTypes.FBM)) {
      snippets.push(GLSLNoiseLibrary.FBM);
    }

    // Musgrave depends on FBM + Simplex
    if (nodeTypes.has(GLSLTextureNodeTypes.Musgrave)) {
      snippets.push(GLSLNoiseLibrary.FBM);
      snippets.push(GLSLNoiseLibrary.MUSGRAVE);
    }

    if (nodeTypes.has(GLSLTextureNodeTypes.Voronoi)) {
      snippets.push(GLSLNoiseLibrary.VORONOI);
    }

    if (nodeTypes.has(GLSLTextureNodeTypes.Wave)) {
      snippets.push(GLSLNoiseLibrary.WAVE);
    }

    if (nodeTypes.has(GLSLTextureNodeTypes.WhiteNoise)) {
      snippets.push(GLSLNoiseLibrary.WHITE_NOISE);
    }

    // Always include HSV for color operations
    snippets.push(GLSLNoiseLibrary.HSV_RGB);

    // Deduplicate
    const unique = [...new Set(snippets)];
    return unique.join('\n');
  }
}

// ============================================================================
// 2. GLSLColorRamp — GLSL Color Ramp Evaluation
// ============================================================================

/**
 * Color ramp stop definition
 */
export interface ColorRampStop {
  position: number;
  color: [number, number, number, number]; // RGBA
}

/**
 * Color ramp interpolation mode
 */
export enum ColorRampMode {
  Constant = 0,
  Linear = 1,
  Ease = 2,
  Cardinal = 3,
  BSpline = 4,
}

/**
 * GLSLColorRamp provides GLSL code and uniform data for color ramp evaluation.
 * Supports up to 16 stops with constant, linear, ease, cardinal, and B-spline interpolation.
 */
export class GLSLColorRamp {
  readonly stops: ColorRampStop[];
  readonly mode: ColorRampMode;
  readonly maxStops = 16;

  constructor(stops: ColorRampStop[], mode: ColorRampMode = ColorRampMode.Linear) {
    this.stops = stops.slice(0, this.maxStops);
    this.mode = mode;
  }

  /**
   * GLSL function for color ramp evaluation
   */
  static readonly GLSL_CODE = /* glsl */ `
// ============================================================================
// Color Ramp Evaluation
// ============================================================================
vec4 colorRampPT(float fac, float positions[${16}], vec4 colors[${16}], int size, int mode) {
  float t = clamp(fac, 0.0, 1.0);

  if (size <= 0) return vec4(0.0);
  if (size == 1) return colors[0];

  // Constant mode — no interpolation
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
  } else if (mode == 2) { // Ease (smoothstep)
    float eased = localT * localT * (3.0 - 2.0 * localT);
    return mix(colors[lower], colors[upper], eased);
  } else if (mode == 3) { // Cardinal (smootherstep)
    float s = localT * localT * localT * (localT * (localT * 6.0 - 15.0) + 10.0);
    return mix(colors[lower], colors[upper], s);
  } else if (mode == 4) { // B-Spline (even smoother)
    float s = localT * localT * localT * (localT * (localT * 6.0 - 15.0) + 10.0);
    return mix(colors[lower], colors[upper], s);
  }

  return mix(colors[lower], colors[upper], localT);
}
`;

  /**
   * Generate GLSL uniform declarations for this color ramp
   */
  generateUniformDeclarations(prefix: string): string {
    const lines: string[] = [];
    for (let i = 0; i < this.maxStops; i++) {
      lines.push(`uniform float u_${prefix}_crPos_${i};`);
      lines.push(`uniform vec4 u_${prefix}_crCol_${i};`);
    }
    lines.push(`uniform int u_${prefix}_crSize;`);
    lines.push(`uniform int u_${prefix}_crMode;`);
    return lines.join('\n');
  }

  /**
   * Generate the GLSL evaluation call for this color ramp
   */
  generateEvalCall(prefix: string, facVar: string): string {
    const positionsInit = Array.from({ length: this.maxStops }, (_, i) =>
      i < this.stops.length ? `u_${prefix}_crPos_${i}` : '0.0'
    ).join(', ');

    const colorsInit = Array.from({ length: this.maxStops }, (_, i) =>
      i < this.stops.length ? `u_${prefix}_crCol_${i}` : 'vec4(0.0)'
    ).join(', ');

    return `
    float ${prefix}_crPositions[${this.maxStops}] = float[${this.maxStops}](${positionsInit});
    vec4 ${prefix}_crColors[${this.maxStops}] = vec4[${this.maxStops}](${colorsInit});
    vec4 ${prefix}_color4 = colorRampPT(${facVar}, ${prefix}_crPositions, ${prefix}_crColors, u_${prefix}_crSize, u_${prefix}_crMode);
    vec3 ${prefix}_color = ${prefix}_color4.rgb;
    float ${prefix}_alpha = ${prefix}_color4.a;
    `;
  }

  /**
   * Build Three.js uniform map for this color ramp
   */
  buildUniforms(prefix: string): Record<string, THREE.IUniform> {
    const uniforms: Record<string, THREE.IUniform> = {};

    for (let i = 0; i < this.stops.length; i++) {
      uniforms[`u_${prefix}_crPos_${i}`] = { value: this.stops[i].position };
      const c = this.stops[i].color;
      uniforms[`u_${prefix}_crCol_${i}`] = {
        value: new THREE.Vector4(c[0], c[1], c[2], c[3]),
      };
    }
    // Fill remaining slots with defaults
    for (let i = this.stops.length; i < this.maxStops; i++) {
      uniforms[`u_${prefix}_crPos_${i}`] = { value: i === 0 ? 0.0 : 1.0 };
      uniforms[`u_${prefix}_crCol_${i}`] = { value: new THREE.Vector4(0, 0, 0, 1) };
    }

    uniforms[`u_${prefix}_crSize`] = { value: this.stops.length };
    uniforms[`u_${prefix}_crMode`] = { value: this.mode };

    return uniforms;
  }
}

// ============================================================================
// 3. GLSLFloatCurve — GLSL Float Curve Evaluation
// ============================================================================

/**
 * Float curve control point
 */
export interface FloatCurvePoint {
  position: number;
  value: number;
}

/**
 * GLSLFloatCurve provides GLSL code and uniform data for float curve evaluation.
 * Supports up to 16 control points with cubic interpolation.
 */
export class GLSLFloatCurve {
  readonly points: FloatCurvePoint[];
  readonly maxPoints = 16;

  constructor(points: FloatCurvePoint[]) {
    this.points = points.slice(0, this.maxPoints);
  }

  /**
   * GLSL function for float curve evaluation
   */
  static readonly GLSL_CODE = /* glsl */ `
// ============================================================================
// Float Curve Evaluation (cubic interpolation)
// ============================================================================
float floatCurvePT(float fac, float positions[${16}], float values[${16}], int size) {
  float t = clamp(fac, 0.0, 1.0);

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

  // Catmull-Rom cubic interpolation
  float p0 = lower > 0 ? values[lower - 1] : values[lower];
  float p1 = values[lower];
  float p2 = values[upper];
  float p3 = upper < size - 1 ? values[upper + 1] : values[upper];

  float t2 = localT * localT;
  float t3 = t2 * localT;

  // Catmull-Rom spline
  float result = 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * localT +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );

  return result;
}
`;

  /**
   * Generate GLSL uniform declarations for this float curve
   */
  generateUniformDeclarations(prefix: string): string {
    const lines: string[] = [];
    for (let i = 0; i < this.maxPoints; i++) {
      lines.push(`uniform float u_${prefix}_fcPos_${i};`);
      lines.push(`uniform float u_${prefix}_fcVal_${i};`);
    }
    lines.push(`uniform int u_${prefix}_fcSize;`);
    return lines.join('\n');
  }

  /**
   * Generate the GLSL evaluation call for this float curve
   */
  generateEvalCall(prefix: string, facVar: string): string {
    const positionsInit = Array.from({ length: this.maxPoints }, (_, i) =>
      i < this.points.length ? `u_${prefix}_fcPos_${i}` : '0.0'
    ).join(', ');

    const valuesInit = Array.from({ length: this.maxPoints }, (_, i) =>
      i < this.points.length ? `u_${prefix}_fcVal_${i}` : '0.0'
    ).join(', ');

    return `
    float ${prefix}_fcPositions[${this.maxPoints}] = float[${this.maxPoints}](${positionsInit});
    float ${prefix}_fcValues[${this.maxPoints}] = float[${this.maxPoints}](${valuesInit});
    float ${prefix}_float = floatCurvePT(${facVar}, ${prefix}_fcPositions, ${prefix}_fcValues, u_${prefix}_fcSize);
    `;
  }

  /**
   * Build Three.js uniform map for this float curve
   */
  buildUniforms(prefix: string): Record<string, THREE.IUniform> {
    const uniforms: Record<string, THREE.IUniform> = {};

    for (let i = 0; i < this.points.length; i++) {
      uniforms[`u_${prefix}_fcPos_${i}`] = { value: this.points[i].position };
      uniforms[`u_${prefix}_fcVal_${i}`] = { value: this.points[i].value };
    }
    for (let i = this.points.length; i < this.maxPoints; i++) {
      uniforms[`u_${prefix}_fcPos_${i}`] = { value: i === 0 ? 0.0 : 1.0 };
      uniforms[`u_${prefix}_fcVal_${i}`] = { value: 0.0 };
    }

    uniforms[`u_${prefix}_fcSize`] = { value: this.points.length };

    return uniforms;
  }
}

// ============================================================================
// Texture Graph Node & Link Types
// ============================================================================

/**
 * Socket type for graph node connections
 */
export type SocketType = 'float' | 'vec3' | 'vec4' | 'color' | 'any';

/**
 * Graph node socket definition
 */
export interface TextureNodeSocket {
  name: string;
  type: SocketType;
  defaultValue?: number | number[];
}

/**
 * Internal graph node for the texture pipeline
 */
export interface TexturePipelineNode {
  id: string;
  type: GLSLTextureNodeTypes;
  params: Record<string, number | number[] | string | boolean>;
  inputs: TextureNodeSocket[];
  outputs: TextureNodeSocket[];
}

/**
 * Internal graph link
 */
export interface TexturePipelineLink {
  fromNode: string;
  fromOutput: string;
  toNode: string;
  toInput: string;
}

/**
 * Coordinate mode for texture evaluation
 */
export enum CoordinateMode {
  /** Object-space position */
  Object = 'object',
  /** Generated (model-space) coordinates */
  Generated = 'generated',
  /** UV coordinates */
  UV = 'uv',
  /** World-space position */
  World = 'world',
  /** Normal direction */
  Normal = 'normal',
}

/**
 * Musgrave type enum matching Blender's
 */
export enum MusgraveType {
  fBM = 0,
  Multifractal = 1,
  RidgedMultifractal = 2,
  HybridMultifractal = 3,
  HeteroTerrain = 4,
}

/**
 * Wave type enum matching Blender's
 */
export enum WaveType {
  Bands = 0,
  Rings = 1,
}

/**
 * Math operation types
 */
export enum MathOperation {
  Add = 0,
  Subtract = 1,
  Multiply = 2,
  Divide = 3,
  Power = 4,
  Logarithm = 5,
  Sqrt = 6,
  Inverse = 7,
  Absolute = 8,
  Modulo = 20,
  Sine = 12,
  Cosine = 13,
  Tangent = 14,
  Floor = 21,
  Ceil = 22,
  Fraction = 23,
  Minimum = 10,
  Maximum = 11,
  Clamp = 25,
  Smoothstep = 28,
}

// ============================================================================
// 4. ProceduralTextureShader — ShaderMaterial Builder
// ============================================================================

/**
 * ProceduralTextureShader takes a texture graph definition (nodes + links)
 * and generates a complete GLSL fragment shader, then compiles it into
 * a Three.js ShaderMaterial.
 *
 * Features:
 * - Generates GLSL fragment shader code from the graph
 * - Supports Object/Generated/UV coordinate modes
 * - Adds 4D noise W dimension uniform for animation
 * - Per-instance randomization via ObjectInfo.Random uniform
 */
export class ProceduralTextureShader {
  private nodes: TexturePipelineNode[];
  private links: TexturePipelineLink[];
  private coordinateMode: CoordinateMode;
  private uniforms: Record<string, THREE.IUniform>;
  private colorRamps: Map<string, GLSLColorRamp>;
  private floatCurves: Map<string, GLSLFloatCurve>;

  constructor(
    nodes: TexturePipelineNode[],
    links: TexturePipelineLink[],
    coordinateMode: CoordinateMode = CoordinateMode.Generated,
    colorRamps: Map<string, GLSLColorRamp> = new Map(),
    floatCurves: Map<string, GLSLFloatCurve> = new Map(),
  ) {
    this.nodes = nodes;
    this.links = links;
    this.coordinateMode = coordinateMode;
    this.uniforms = {};
    this.colorRamps = colorRamps;
    this.floatCurves = floatCurves;
  }

  /**
   * Build a ShaderMaterial from the texture graph
   */
  build(): THREE.ShaderMaterial {
    const sortedNodeIds = this.topologicalSort();
    const usedNodeTypes = this.collectUsedNodeTypes();

    // Build GLSL fragments
    const noiseLibrary = GLSLNoiseLibrary.getForNodeTypes(usedNodeTypes);
    const uniformDecls = this.generateUniformDeclarations();
    const bodyCode = this.generateBodyCode(sortedNodeIds);

    // Find output node
    const outputNode = this.nodes.find(n => n.type === GLSLTextureNodeTypes.Output);
    const outputPrefix = outputNode ? this.getNodePrefix(outputNode.id) : 'n0';

    // Build complete shaders
    const vertexShader = this.generateVertexShader();
    const fragmentShader = this.generateFragmentShader(
      noiseLibrary, uniformDecls, bodyCode, outputPrefix
    );

    // Build uniforms
    this.buildAllUniforms();

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Topologically sort the graph nodes (Kahn's algorithm)
   */
  private topologicalSort(): string[] {
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();

    for (const node of this.nodes) {
      inDegree.set(node.id, 0);
    }

    for (const link of this.links) {
      inDegree.set(link.toNode, (inDegree.get(link.toNode) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      sorted.push(current);

      for (const link of this.links) {
        if (link.fromNode === current) {
          const newDeg = (inDegree.get(link.toNode) ?? 1) - 1;
          inDegree.set(link.toNode, newDeg);
          if (newDeg === 0 && !visited.has(link.toNode)) {
            queue.push(link.toNode);
          }
        }
      }
    }

    return sorted;
  }

  /**
   * Collect all node types used in the graph
   */
  private collectUsedNodeTypes(): Set<GLSLTextureNodeTypes> {
    const types = new Set<GLSLTextureNodeTypes>();
    for (const node of this.nodes) {
      types.add(node.type);
    }
    return types;
  }

  /**
   * Generate a consistent prefix for a node ID
   */
  private getNodePrefix(nodeId: string): string {
    let hash = 0;
    for (let i = 0; i < nodeId.length; i++) {
      hash = ((hash << 5) - hash) + nodeId.charCodeAt(i);
      hash = hash & hash;
    }
    return `n${Math.abs(hash) % 10000}`;
  }

  /**
   * Resolve an input: find connected upstream variable or use default
   */
  private resolveInput(
    nodeId: string,
    inputName: string,
    nodeFns: Map<string, string>,
  ): string {
    // Find a link targeting this input
    for (const link of this.links) {
      if (link.toNode === nodeId && link.toInput === inputName) {
        const sourcePrefix = this.getNodePrefix(link.fromNode);
        return `${sourcePrefix}_${link.fromOutput}`;
      }
    }

    // No connection — use default value
    const node = this.nodes.find(n => n.id === nodeId);
    const input = node?.inputs.find(inp => inp.name === inputName);

    if (inputName === 'vector' || inputName === 'coords') {
      return this.getCoordinateVarying();
    }

    if (input?.defaultValue !== undefined) {
      if (typeof input.defaultValue === 'number') {
        return this.formatFloat(input.defaultValue);
      }
      if (Array.isArray(input.defaultValue)) {
        if (input.defaultValue.length === 3) {
          return `vec3(${input.defaultValue.map(v => this.formatFloat(v)).join(', ')})`;
        }
        if (input.defaultValue.length === 4) {
          return `vec4(${input.defaultValue.map(v => this.formatFloat(v)).join(', ')})`;
        }
      }
    }

    return '0.0';
  }

  /**
   * Get the varying name for the selected coordinate mode
   */
  private getCoordinateVarying(): string {
    switch (this.coordinateMode) {
      case CoordinateMode.Object:
        return 'vObjectPosition';
      case CoordinateMode.Generated:
        return 'vPosition';
      case CoordinateMode.UV:
        return 'vec3(vUV, 0.0)';
      case CoordinateMode.World:
        return 'vWorldPosition';
      case CoordinateMode.Normal:
        return 'vNormal';
      default:
        return 'vPosition';
    }
  }

  /**
   * Format a float for GLSL
   */
  private formatFloat(v: number): string {
    const s = v.toFixed(6);
    return s.includes('.') ? s : s + '.0';
  }

  /**
   * Generate GLSL body code for all nodes in topological order
   */
  private generateBodyCode(sortedIds: string[]): string {
    const lines: string[] = [];
    const nodeFns = new Map<string, string>();

    for (const nodeId of sortedIds) {
      const node = this.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      const prefix = this.getNodePrefix(nodeId);
      const code = this.generateNodeGLSL(nodeId, node, prefix, nodeFns);
      lines.push(code);
      nodeFns.set(nodeId, code);
    }

    return lines.join('\n');
  }

  /**
   * Generate GLSL code for a single node
   */
  private generateNodeGLSL(
    nodeId: string,
    node: TexturePipelineNode,
    prefix: string,
    nodeFns: Map<string, string>,
  ): string {
    const lines: string[] = [`  // Node: ${node.id} (${node.type})`];

    switch (node.type) {
      case GLSLTextureNodeTypes.NoiseSimplex: {
        const scale = this.resolveInput(nodeId, 'scale', nodeFns);
        const detail = this.resolveInput(nodeId, 'detail', nodeFns);
        const roughness = this.resolveInput(nodeId, 'roughness', nodeFns);
        const distortion = this.resolveInput(nodeId, 'distortion', nodeFns);
        const coords = this.resolveInput(nodeId, 'vector', nodeFns);
        lines.push(`  vec3 pt_nCoord_${prefix} = ${coords} * ${scale};`);
        lines.push(`  if (${distortion} > 0.0) {`);
        lines.push(`    pt_nCoord_${prefix} += vec3(snoise3D(pt_nCoord_${prefix}), snoise3D(pt_nCoord_${prefix} + vec3(5.2, 1.3, 2.8)), snoise3D(pt_nCoord_${prefix} + vec3(9.1, 3.7, 7.4))) * ${distortion};`);
        lines.push(`  }`);
        lines.push(`  float ${prefix}_float = 0.5 + 0.5 * fbm3D(pt_nCoord_${prefix}, int(${detail}), 2.0, 1.0 - ${roughness});`);
        lines.push(`  vec3 ${prefix}_color = vec3(${prefix}_float);`);
        break;
      }

      case GLSLTextureNodeTypes.NoisePerlin: {
        const scale = this.resolveInput(nodeId, 'scale', nodeFns);
        const detail = this.resolveInput(nodeId, 'detail', nodeFns);
        const roughness = this.resolveInput(nodeId, 'roughness', nodeFns);
        const distortion = this.resolveInput(nodeId, 'distortion', nodeFns);
        const coords = this.resolveInput(nodeId, 'vector', nodeFns);
        lines.push(`  vec3 pt_pCoord_${prefix} = ${coords} * ${scale};`);
        lines.push(`  if (${distortion} > 0.0) {`);
        lines.push(`    pt_pCoord_${prefix} += vec3(perlin3D(pt_pCoord_${prefix} + vec3(0.0)), perlin3D(pt_pCoord_${prefix} + vec3(5.2)), perlin3D(pt_pCoord_${prefix} + vec3(9.1))) * ${distortion};`);
        lines.push(`  }`);
        lines.push(`  float ${prefix}_float = 0.5 + 0.5 * fbmPerlin3D(pt_pCoord_${prefix}, int(${detail}), 2.0, 1.0 - ${roughness});`);
        lines.push(`  vec3 ${prefix}_color = vec3(${prefix}_float);`);
        break;
      }

      case GLSLTextureNodeTypes.Musgrave: {
        const scale = this.resolveInput(nodeId, 'scale', nodeFns);
        const dimension = this.resolveInput(nodeId, 'dimension', nodeFns);
        const lacunarity = this.resolveInput(nodeId, 'lacunarity', nodeFns);
        const detail = this.resolveInput(nodeId, 'detail', nodeFns);
        const offset = this.resolveInput(nodeId, 'offset', nodeFns);
        const gain = this.resolveInput(nodeId, 'gain', nodeFns);
        const coords = this.resolveInput(nodeId, 'vector', nodeFns);
        const musgraveType = (node.params.musgraveType as number) ?? MusgraveType.fBM;
        const use4D = Boolean(node.params.use4D) ?? false;

        if (use4D) {
          lines.push(`  vec4 pt_mCoord_${prefix} = vec4(${coords}, u_time_w);`);
          lines.push(`  float ${prefix}_float = musgrave4D(pt_mCoord_${prefix}, ${scale}, ${dimension}, ${lacunarity}, ${detail}, ${offset}, ${gain}, ${Math.round(musgraveType)});`);
        } else {
          lines.push(`  float ${prefix}_float = musgrave3D(${coords}, ${scale}, ${dimension}, ${lacunarity}, ${detail}, ${offset}, ${gain}, ${Math.round(musgraveType)});`);
        }
        lines.push(`  vec3 ${prefix}_color = vec3(${prefix}_float);`);
        break;
      }

      case GLSLTextureNodeTypes.Voronoi: {
        const scale = this.resolveInput(nodeId, 'scale', nodeFns);
        const smoothness = this.resolveInput(nodeId, 'smoothness', nodeFns);
        const exponent = this.resolveInput(nodeId, 'exponent', nodeFns);
        const coords = this.resolveInput(nodeId, 'vector', nodeFns);
        const feature = (node.params.feature as number) ?? 0; // 0=F1, 1=F2, 2=edge, 3=smooth
        const use4D = Boolean(node.params.use4D) ?? false;

        if (use4D) {
          lines.push(`  vec4 pt_vCoord_${prefix} = vec4(${coords} * ${scale}, u_time_w);`);
          lines.push(`  VoronoiResultPT pt_vor_${prefix} = voronoi4D_PT(pt_vCoord_${prefix});`);
        } else {
          lines.push(`  VoronoiResultPT pt_vor_${prefix} = voronoi3D_PT(${coords} * ${scale});`);
        }

        if (feature === 0) {
          lines.push(`  float ${prefix}_float = pt_vor_${prefix}.f1;`);
        } else if (feature === 1) {
          lines.push(`  float ${prefix}_float = pt_vor_${prefix}.f2;`);
        } else if (feature === 2) {
          lines.push(`  float ${prefix}_float = pt_vor_${prefix}.edgeDist;`);
        } else {
          lines.push(`  float ${prefix}_float = smoothVoronoiF1_PT(${coords} * ${scale}, ${smoothness});`);
        }

        lines.push(`  vec3 ${prefix}_color = vec3(fract(dot(pt_vor_${prefix}.cellId, vec3(0.1031, 0.1030, 0.0973))));`);
        break;
      }

      case GLSLTextureNodeTypes.Wave: {
        const scale = this.resolveInput(nodeId, 'scale', nodeFns);
        const distortion = this.resolveInput(nodeId, 'distortion', nodeFns);
        const coords = this.resolveInput(nodeId, 'vector', nodeFns);
        const waveType = (node.params.waveType as number) ?? WaveType.Bands;
        const bandsDirection = (node.params.bandsDirection as number) ?? 0;
        const ringsDirection = (node.params.ringsDirection as number) ?? 0;
        lines.push(`  float ${prefix}_float = waveTexture(${coords}, ${scale}, ${distortion}, ${Math.round(waveType)}, ${Math.round(bandsDirection)}, ${Math.round(ringsDirection)});`);
        lines.push(`  vec3 ${prefix}_color = vec3(${prefix}_float);`);
        break;
      }

      case GLSLTextureNodeTypes.WhiteNoise: {
        const coords = this.resolveInput(nodeId, 'vector', nodeFns);
        const use4D = Boolean(node.params.use4D) ?? false;
        if (use4D) {
          lines.push(`  float ${prefix}_float = whiteNoise4D(vec4(${coords}, u_time_w));`);
        } else {
          lines.push(`  float ${prefix}_float = whiteNoise3D(${coords});`);
        }
        lines.push(`  vec3 ${prefix}_color = vec3(${prefix}_float);`);
        break;
      }

      case GLSLTextureNodeTypes.FBM: {
        const scale = this.resolveInput(nodeId, 'scale', nodeFns);
        const octaves = this.resolveInput(nodeId, 'octaves', nodeFns);
        const lacunarity = this.resolveInput(nodeId, 'lacunarity', nodeFns);
        const gain = this.resolveInput(nodeId, 'gain', nodeFns);
        const coords = this.resolveInput(nodeId, 'vector', nodeFns);
        const use4D = Boolean(node.params.use4D) ?? false;
        if (use4D) {
          lines.push(`  float ${prefix}_float = 0.5 + 0.5 * fbm4D(vec4(${coords}, u_time_w) * ${scale}, int(${octaves}), ${lacunarity}, ${gain});`);
        } else {
          lines.push(`  float ${prefix}_float = 0.5 + 0.5 * fbm3D(${coords} * ${scale}, int(${octaves}), ${lacunarity}, ${gain});`);
        }
        lines.push(`  vec3 ${prefix}_color = vec3(${prefix}_float);`);
        break;
      }

      case GLSLTextureNodeTypes.ColorRamp: {
        const crKey = node.params.colorRampKey as string ?? nodeId;
        const cr = this.colorRamps.get(crKey);
        const fac = this.resolveInput(nodeId, 'fac', nodeFns);
        if (cr) {
          lines.push(cr.generateEvalCall(prefix, fac));
        } else {
          lines.push(`  vec4 ${prefix}_color4 = vec4(${fac}, ${fac}, ${fac}, 1.0);`);
          lines.push(`  vec3 ${prefix}_color = ${prefix}_color4.rgb;`);
          lines.push(`  float ${prefix}_alpha = ${prefix}_color4.a;`);
        }
        break;
      }

      case GLSLTextureNodeTypes.FloatCurve: {
        const fcKey = node.params.floatCurveKey as string ?? nodeId;
        const fc = this.floatCurves.get(fcKey);
        const fac = this.resolveInput(nodeId, 'fac', nodeFns);
        if (fc) {
          lines.push(fc.generateEvalCall(prefix, fac));
        } else {
          lines.push(`  float ${prefix}_float = ${fac};`);
        }
        break;
      }

      case GLSLTextureNodeTypes.Math: {
        const a = this.resolveInput(nodeId, 'value', nodeFns);
        const b = this.resolveInput(nodeId, 'value_1', nodeFns);
        const operation = (node.params.operation as number) ?? MathOperation.Add;
        lines.push(`  float ${prefix}_float = mathOpPT(${a}, ${b}, ${Math.round(operation)});`);
        break;
      }

      case GLSLTextureNodeTypes.Mix: {
        const factor = this.resolveInput(nodeId, 'factor', nodeFns);
        const a = this.resolveInput(nodeId, 'a', nodeFns);
        const b = this.resolveInput(nodeId, 'b', nodeFns);
        lines.push(`  float ${prefix}_float = mix(${a}, ${b}, clamp(${factor}, 0.0, 1.0));`);
        break;
      }

      case GLSLTextureNodeTypes.Mapping: {
        const vector = this.resolveInput(nodeId, 'vector', nodeFns);
        const scale = this.resolveInput(nodeId, 'scale', nodeFns);
        const rotation = this.resolveInput(nodeId, 'rotation', nodeFns);
        const translation = this.resolveInput(nodeId, 'translation', nodeFns);
        lines.push(`  vec3 ${prefix}_vector = mappingNodePT(${vector}, ${translation}, ${rotation}, ${scale});`);
        break;
      }

      case GLSLTextureNodeTypes.TexCoord: {
        const mode = (node.params.coordMode as string) ?? this.coordinateMode;
        lines.push(`  vec3 ${prefix}_generated = vPosition;`);
        lines.push(`  vec3 ${prefix}_object = vObjectPosition;`);
        lines.push(`  vec2 ${prefix}_uv = vUV;`);
        lines.push(`  vec3 ${prefix}_normal = vNormal;`);
        lines.push(`  vec3 ${prefix}_world = vWorldPosition;`);
        break;
      }

      case GLSLTextureNodeTypes.Output: {
        const value = this.resolveInput(nodeId, 'value', nodeFns);
        lines.push(`  float ${prefix}_value = ${value};`);
        lines.push(`  vec3 ${prefix}_color = vec3(${value});`);
        break;
      }

      default:
        lines.push(`  // Unknown node type: ${node.type}`);
        lines.push(`  float ${prefix}_float = 0.0;`);
        break;
    }

    return lines.join('\n');
  }

  /**
   * Generate uniform declarations for all nodes
   */
  private generateUniformDeclarations(): string {
    const lines: string[] = [];

    // Global uniforms
    lines.push('uniform float u_time_w; // 4D W dimension for animation');
    lines.push('uniform float u_object_random; // per-instance randomization');

    // Per-node uniforms
    for (const node of this.nodes) {
      const prefix = this.getNodePrefix(node.id);

      switch (node.type) {
        case GLSLTextureNodeTypes.NoiseSimplex:
        case GLSLTextureNodeTypes.NoisePerlin:
          lines.push(`uniform float u_${prefix}_scale;`);
          lines.push(`uniform float u_${prefix}_detail;`);
          lines.push(`uniform float u_${prefix}_roughness;`);
          lines.push(`uniform float u_${prefix}_distortion;`);
          break;

        case GLSLTextureNodeTypes.Musgrave:
          lines.push(`uniform float u_${prefix}_scale;`);
          lines.push(`uniform float u_${prefix}_dimension;`);
          lines.push(`uniform float u_${prefix}_lacunarity;`);
          lines.push(`uniform float u_${prefix}_detail;`);
          lines.push(`uniform float u_${prefix}_offset;`);
          lines.push(`uniform float u_${prefix}_gain;`);
          break;

        case GLSLTextureNodeTypes.Voronoi:
          lines.push(`uniform float u_${prefix}_scale;`);
          lines.push(`uniform float u_${prefix}_smoothness;`);
          lines.push(`uniform float u_${prefix}_exponent;`);
          break;

        case GLSLTextureNodeTypes.Wave:
          lines.push(`uniform float u_${prefix}_scale;`);
          lines.push(`uniform float u_${prefix}_distortion;`);
          break;

        case GLSLTextureNodeTypes.FBM:
          lines.push(`uniform float u_${prefix}_scale;`);
          lines.push(`uniform float u_${prefix}_octaves;`);
          lines.push(`uniform float u_${prefix}_lacunarity;`);
          lines.push(`uniform float u_${prefix}_gain;`);
          break;

        case GLSLTextureNodeTypes.Math:
          // Math uniforms are inline
          break;

        case GLSLTextureNodeTypes.Mix:
          lines.push(`uniform float u_${prefix}_factor;`);
          break;

        case GLSLTextureNodeTypes.Mapping:
          lines.push(`uniform vec3 u_${prefix}_scale;`);
          lines.push(`uniform vec3 u_${prefix}_rotation;`);
          lines.push(`uniform vec3 u_${prefix}_translation;`);
          break;

        case GLSLTextureNodeTypes.ColorRamp: {
          const crKey = node.params.colorRampKey as string ?? node.id;
          const cr = this.colorRamps.get(crKey);
          if (cr) {
            lines.push(cr.generateUniformDeclarations(prefix));
          }
          break;
        }

        case GLSLTextureNodeTypes.FloatCurve: {
          const fcKey = node.params.floatCurveKey as string ?? node.id;
          const fc = this.floatCurves.get(fcKey);
          if (fc) {
            lines.push(fc.generateUniformDeclarations(prefix));
          }
          break;
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Build all Three.js uniforms
   */
  private buildAllUniforms(): void {
    // Global uniforms
    this.uniforms['u_time_w'] = { value: 0.0 };
    this.uniforms['u_object_random'] = { value: 0.0 };

    // Per-node uniforms
    for (const node of this.nodes) {
      const prefix = this.getNodePrefix(node.id);

      switch (node.type) {
        case GLSLTextureNodeTypes.NoiseSimplex:
        case GLSLTextureNodeTypes.NoisePerlin:
          this.uniforms[`u_${prefix}_scale`] = { value: (node.params.scale as number) ?? 5.0 };
          this.uniforms[`u_${prefix}_detail`] = { value: (node.params.detail as number) ?? 4.0 };
          this.uniforms[`u_${prefix}_roughness`] = { value: (node.params.roughness as number) ?? 0.5 };
          this.uniforms[`u_${prefix}_distortion`] = { value: (node.params.distortion as number) ?? 0.0 };
          break;

        case GLSLTextureNodeTypes.Musgrave:
          this.uniforms[`u_${prefix}_scale`] = { value: (node.params.scale as number) ?? 1.0 };
          this.uniforms[`u_${prefix}_dimension`] = { value: (node.params.dimension as number) ?? 2.0 };
          this.uniforms[`u_${prefix}_lacunarity`] = { value: (node.params.lacunarity as number) ?? 2.0 };
          this.uniforms[`u_${prefix}_detail`] = { value: (node.params.detail as number) ?? 2.0 };
          this.uniforms[`u_${prefix}_offset`] = { value: (node.params.offset as number) ?? 0.0 };
          this.uniforms[`u_${prefix}_gain`] = { value: (node.params.gain as number) ?? 1.0 };
          break;

        case GLSLTextureNodeTypes.Voronoi:
          this.uniforms[`u_${prefix}_scale`] = { value: (node.params.scale as number) ?? 5.0 };
          this.uniforms[`u_${prefix}_smoothness`] = { value: (node.params.smoothness as number) ?? 1.0 };
          this.uniforms[`u_${prefix}_exponent`] = { value: (node.params.exponent as number) ?? 0.5 };
          break;

        case GLSLTextureNodeTypes.Wave:
          this.uniforms[`u_${prefix}_scale`] = { value: (node.params.scale as number) ?? 5.0 };
          this.uniforms[`u_${prefix}_distortion`] = { value: (node.params.distortion as number) ?? 0.0 };
          break;

        case GLSLTextureNodeTypes.FBM:
          this.uniforms[`u_${prefix}_scale`] = { value: (node.params.scale as number) ?? 1.0 };
          this.uniforms[`u_${prefix}_octaves`] = { value: (node.params.octaves as number) ?? 6.0 };
          this.uniforms[`u_${prefix}_lacunarity`] = { value: (node.params.lacunarity as number) ?? 2.0 };
          this.uniforms[`u_${prefix}_gain`] = { value: (node.params.gain as number) ?? 0.5 };
          break;

        case GLSLTextureNodeTypes.Mix:
          this.uniforms[`u_${prefix}_factor`] = { value: (node.params.factor as number) ?? 0.5 };
          break;

        case GLSLTextureNodeTypes.Mapping: {
          const s = (node.params.scale as number[]) ?? [1, 1, 1];
          const r = (node.params.rotation as number[]) ?? [0, 0, 0];
          const t = (node.params.translation as number[]) ?? [0, 0, 0];
          this.uniforms[`u_${prefix}_scale`] = { value: new THREE.Vector3(s[0], s[1], s[2]) };
          this.uniforms[`u_${prefix}_rotation`] = { value: new THREE.Vector3(r[0], r[1], r[2]) };
          this.uniforms[`u_${prefix}_translation`] = { value: new THREE.Vector3(t[0], t[1], t[2]) };
          break;
        }

        case GLSLTextureNodeTypes.ColorRamp: {
          const crKey = node.params.colorRampKey as string ?? node.id;
          const cr = this.colorRamps.get(crKey);
          if (cr) {
            Object.assign(this.uniforms, cr.buildUniforms(prefix));
          }
          break;
        }

        case GLSLTextureNodeTypes.FloatCurve: {
          const fcKey = node.params.floatCurveKey as string ?? node.id;
          const fc = this.floatCurves.get(fcKey);
          if (fc) {
            Object.assign(this.uniforms, fc.buildUniforms(prefix));
          }
          break;
        }
      }
    }
  }

  /**
   * Generate the vertex shader
   */
  private generateVertexShader(): string {
    return /* glsl */ `#version 300 es
precision highp float;
precision highp int;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vPosition;
out vec3 vObjectPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vObjectPosition = position;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
  }

  /**
   * Generate the complete fragment shader
   */
  private generateFragmentShader(
    noiseLibrary: string,
    uniformDecls: string,
    bodyCode: string,
    outputPrefix: string,
  ): string {
    const colorRampGLSL = this.colorRamps.size > 0 ? GLSLColorRamp.GLSL_CODE : '';
    const floatCurveGLSL = this.floatCurves.size > 0 ? GLSLFloatCurve.GLSL_CODE : '';
    const mathGLSL = this.nodes.some(n => n.type === GLSLTextureNodeTypes.Math) ? this.MATH_GLSL : '';
    const mappingGLSL = this.nodes.some(n => n.type === GLSLTextureNodeTypes.Mapping) ? this.MAPPING_GLSL : '';

    return /* glsl */ `#version 300 es
precision highp float;
precision highp int;

in vec3 vPosition;
in vec3 vObjectPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;

out vec4 fragColor;

// ============================================================================
// Uniforms
// ============================================================================
${uniformDecls}

// ============================================================================
// Noise Library
// ============================================================================
${noiseLibrary}

// ============================================================================
// Color Ramp
// ============================================================================
${colorRampGLSL}

// ============================================================================
// Float Curve
// ============================================================================
${floatCurveGLSL}

// ============================================================================
// Math
// ============================================================================
${mathGLSL}

// ============================================================================
// Mapping
// ============================================================================
${mappingGLSL}

// ============================================================================
// Main
// ============================================================================
void main() {
${bodyCode}

  // Output
  fragColor = vec4(${outputPrefix}_color, 1.0);
}
`;
  }

  /** GLSL for math operations */
  private readonly MATH_GLSL = /* glsl */ `
float mathOpPT(float a, float b, int operation) {
  switch (operation) {
    case 0: return a + b;
    case 1: return a - b;
    case 2: return a * b;
    case 3: return b != 0.0 ? a / b : 0.0;
    case 4: return pow(max(a, 0.0), b);
    case 5: return a > 0.0 && b > 0.0 ? log(a) / log(b) : 0.0;
    case 6: return sqrt(max(a, 0.0));
    case 7: return 1.0 / max(a, 0.0001);
    case 8: return abs(a);
    case 10: return min(a, b);
    case 11: return max(a, b);
    case 12: return sin(a);
    case 13: return cos(a);
    case 14: return tan(a);
    case 20: return b != 0.0 ? mod(a, b) : 0.0;
    case 21: return floor(a);
    case 22: return ceil(a);
    case 23: return fract(a);
    case 25: return clamp(a, 0.0, 1.0);
    case 28: return smoothstep(0.0, 1.0, a);
    default: return a;
  }
}
`;

  /** GLSL for mapping node */
  private readonly MAPPING_GLSL = /* glsl */ `
vec3 mappingNodePT(vec3 vector, vec3 translation, vec3 rotation, vec3 scale) {
  vec3 result = vector * scale;
  // Z rotation
  float cz = cos(rotation.z); float sz = sin(rotation.z);
  result = vec3(result.x * cz - result.y * sz, result.x * sz + result.y * cz, result.z);
  // Y rotation
  float cy = cos(rotation.y); float sy = sin(rotation.y);
  result = vec3(result.x * cy + result.z * sy, result.y, -result.x * sy + result.z * cy);
  // X rotation
  float cx = cos(rotation.x); float sx = sin(rotation.x);
  result = vec3(result.x, result.y * cx - result.z * sx, result.y * sx + result.z * cx);
  return result + translation;
}
`;
}

// ============================================================================
// 5. ProceduralTextureRenderer — Renders Procedural Textures to DataTexture
// ============================================================================

/**
 * ProceduralTextureRenderer renders procedural textures to DataTexture
 * using WebGL2 render targets with FLOAT textures.
 *
 * Features:
 * - Uses WebGL2 render target with FLOAT textures
 * - Renders a full-screen quad with the procedural shader
 * - Reads back pixels as Float32Array
 * - Supports arbitrary resolution (256 to 4096)
 * - Can render per-instance by setting ObjectInfo.Random uniform
 */
export class ProceduralTextureRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private resolution: number;

  constructor(renderer?: THREE.WebGLRenderer, resolution: number = 512) {
    this.resolution = Math.max(256, Math.min(4096, resolution));
    this.renderer = renderer ?? new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Full-screen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.quad = new THREE.Mesh(geometry, material);
    this.scene.add(this.quad);

    // Create render target
    this.ensureRenderTarget();
  }

  /**
   * Ensure the render target exists at the correct resolution
   */
  private ensureRenderTarget(): void {
    if (
      !this.renderTarget ||
      this.renderTarget.width !== this.resolution ||
      this.renderTarget.height !== this.resolution
    ) {
      if (this.renderTarget) {
        this.renderTarget.dispose();
      }

      this.renderTarget = new THREE.WebGLRenderTarget(
        this.resolution,
        this.resolution,
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.FloatType,
          depthBuffer: false,
          stencilBuffer: false,
        },
      );
    }
  }

  /**
   * Render a procedural texture shader to a DataTexture
   *
   * @param shaderMaterial The procedural ShaderMaterial to render
   * @param objectRandom Per-instance randomization value (0-1)
   * @param timeW 4D W dimension for animation
   * @returns DataTexture containing the rendered result
   */
  render(
    shaderMaterial: THREE.ShaderMaterial,
    objectRandom: number = 0.0,
    timeW: number = 0.0,
  ): THREE.DataTexture {
    this.ensureRenderTarget();

    // Set uniforms
    if (shaderMaterial.uniforms['u_object_random']) {
      shaderMaterial.uniforms['u_object_random'].value = objectRandom;
    }
    if (shaderMaterial.uniforms['u_time_w']) {
      shaderMaterial.uniforms['u_time_w'].value = timeW;
    }

    // Replace quad material
    const oldMaterial = this.quad.material;
    this.quad.material = shaderMaterial;

    // Render
    const currentTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(currentTarget);

    // Read back pixels
    const buffer = new Float32Array(this.resolution * this.resolution * 4);
    this.renderer.readRenderTargetPixels(
      this.renderTarget,
      0,
      0,
      this.resolution,
      this.resolution,
      buffer,
    );

    // Restore material
    this.quad.material = oldMaterial;

    // Create DataTexture
    const texture = new THREE.DataTexture(
      buffer,
      this.resolution,
      this.resolution,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.name = 'ProceduralTexture';

    return texture;
  }

  /**
   * Render multiple PBR channels from the same graph
   *
   * @param shaderMaterial The procedural ShaderMaterial
   * @param channels Which channels to render (albedo, normal, roughness, metallic, ao, height)
   * @param objectRandom Per-instance randomization
   * @param timeW 4D W dimension for animation
   * @returns Map of channel name to DataTexture
   */
  renderPBRChannels(
    shaderMaterial: THREE.ShaderMaterial,
    channels: string[] = ['albedo', 'roughness', 'metallic', 'ao', 'height', 'normal'],
    objectRandom: number = 0.0,
    timeW: number = 0.0,
  ): Map<string, THREE.DataTexture> {
    const results = new Map<string, THREE.DataTexture>();

    // For a full PBR render, we would need separate shader materials
    // for each channel. For now, render the base texture for each channel.
    // In a complete implementation, each channel would have its own graph.
    for (const channel of channels) {
      const texture = this.render(shaderMaterial, objectRandom, timeW);
      texture.name = `Procedural_${channel}`;
      results.set(channel, texture);
    }

    return results;
  }

  /**
   * Render a batch of per-instance textures
   *
   * @param shaderMaterial The procedural ShaderMaterial
   * @param count Number of instances to render
   * @param seed Random seed for instance variation
   * @param timeW 4D W dimension for animation
   * @returns Array of DataTextures, one per instance
   */
  renderInstanceBatch(
    shaderMaterial: THREE.ShaderMaterial,
    count: number,
    seed: number = 0,
    timeW: number = 0.0,
  ): THREE.DataTexture[] {
    const textures: THREE.DataTexture[] = [];
    // Simple seeded random for instance IDs
    let rng = seed;
    const nextRandom = () => {
      rng = (rng * 1664525 + 1013904223) & 0xffffffff;
      return (rng >>> 0) / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const objectRandom = nextRandom();
      const texture = this.render(shaderMaterial, objectRandom, timeW);
      texture.name = `Procedural_instance_${i}`;
      textures.push(texture);
    }

    return textures;
  }

  /**
   * Change the render resolution
   */
  setResolution(resolution: number): void {
    this.resolution = Math.max(256, Math.min(4096, resolution));
    this.ensureRenderTarget();
  }

  /**
   * Get the current resolution
   */
  getResolution(): number {
    return this.resolution;
  }

  /**
   * Dispose of GPU resources
   */
  dispose(): void {
    if (this.renderTarget) {
      this.renderTarget.dispose();
    }
    this.quad.geometry.dispose();
    (this.quad.material as THREE.Material).dispose();
  }
}

// ============================================================================
// 6. GLSLTextureGraphBuilder — Fluent API for Building Texture Graphs
// ============================================================================

/**
 * Fluent builder for texture graphs. Construct a graph step-by-step,
 * then compile it into a ShaderMaterial or DataTexture.
 *
 * Usage:
 * ```ts
 * const material = new GLSLTextureGraphBuilder()
 *   .addMusgrave({ musgraveType: MusgraveType.fBM, scale: 5, detail: 8 })
 *   .addColorRamp(stops)
 *   .connect('musgrave_0', 'float', 'colorRamp_0', 'fac')
 *   .addOutput()
 *   .connect('colorRamp_0', 'color', 'output_0', 'value')
 *   .buildMaterial();
 * ```
 */
export class GLSLTextureGraphBuilder {
  private nodes: TexturePipelineNode[] = [];
  private links: TexturePipelineLink[] = [];
  private colorRamps: Map<string, GLSLColorRamp> = new Map();
  private floatCurves: Map<string, GLSLFloatCurve> = new Map();
  private coordinateMode: CoordinateMode = CoordinateMode.Generated;
  private counters: Map<GLSLTextureNodeTypes, number> = new Map();

  /**
   * Get the next ID for a node type
   */
  private nextId(type: GLSLTextureNodeTypes): string {
    const count = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, count);

    const prefix = this.typeToPrefix(type);
    return `${prefix}_${count - 1}`;
  }

  private typeToPrefix(type: GLSLTextureNodeTypes): string {
    switch (type) {
      case GLSLTextureNodeTypes.NoiseSimplex: return 'simplex';
      case GLSLTextureNodeTypes.NoisePerlin: return 'perlin';
      case GLSLTextureNodeTypes.Musgrave: return 'musgrave';
      case GLSLTextureNodeTypes.Voronoi: return 'voronoi';
      case GLSLTextureNodeTypes.Wave: return 'wave';
      case GLSLTextureNodeTypes.WhiteNoise: return 'whiteNoise';
      case GLSLTextureNodeTypes.FBM: return 'fbm';
      case GLSLTextureNodeTypes.ColorRamp: return 'colorRamp';
      case GLSLTextureNodeTypes.FloatCurve: return 'floatCurve';
      case GLSLTextureNodeTypes.Math: return 'math';
      case GLSLTextureNodeTypes.Mix: return 'mix';
      case GLSLTextureNodeTypes.Mapping: return 'mapping';
      case GLSLTextureNodeTypes.TexCoord: return 'texCoord';
      case GLSLTextureNodeTypes.Output: return 'output';
      default: return 'node';
    }
  }

  /**
   * Add a noise node (simplex or perlin)
   */
  addNoise(
    type: 'simplex' | 'perlin' = 'simplex',
    params: {
      scale?: number;
      detail?: number;
      roughness?: number;
      distortion?: number;
    } = {},
  ): this {
    const nodeType = type === 'simplex'
      ? GLSLTextureNodeTypes.NoiseSimplex
      : GLSLTextureNodeTypes.NoisePerlin;

    const id = this.nextId(nodeType);
    this.nodes.push({
      id,
      type: nodeType,
      params: {
        scale: params.scale ?? 5.0,
        detail: params.detail ?? 4.0,
        roughness: params.roughness ?? 0.5,
        distortion: params.distortion ?? 0.0,
      },
      inputs: [
        { name: 'vector', type: 'vec3' },
        { name: 'scale', type: 'float', defaultValue: params.scale ?? 5.0 },
        { name: 'detail', type: 'float', defaultValue: params.detail ?? 4.0 },
        { name: 'roughness', type: 'float', defaultValue: params.roughness ?? 0.5 },
        { name: 'distortion', type: 'float', defaultValue: params.distortion ?? 0.0 },
      ],
      outputs: [
        { name: 'float', type: 'float' },
        { name: 'color', type: 'vec3' },
      ],
    });
    return this;
  }

  /**
   * Add a Musgrave noise node — CRITICAL, most-used in original Infinigen
   */
  addMusgrave(
    params: {
      musgraveType?: MusgraveType;
      scale?: number;
      dimension?: number;
      lacunarity?: number;
      detail?: number;
      offset?: number;
      gain?: number;
      use4D?: boolean;
    } = {},
  ): this {
    const id = this.nextId(GLSLTextureNodeTypes.Musgrave);
    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.Musgrave,
      params: {
        musgraveType: params.musgraveType ?? MusgraveType.fBM,
        scale: params.scale ?? 1.0,
        dimension: params.dimension ?? 2.0,
        lacunarity: params.lacunarity ?? 2.0,
        detail: params.detail ?? 2.0,
        offset: params.offset ?? 0.0,
        gain: params.gain ?? 1.0,
        use4D: params.use4D ?? false,
      },
      inputs: [
        { name: 'vector', type: 'vec3' },
        { name: 'scale', type: 'float', defaultValue: params.scale ?? 1.0 },
        { name: 'dimension', type: 'float', defaultValue: params.dimension ?? 2.0 },
        { name: 'lacunarity', type: 'float', defaultValue: params.lacunarity ?? 2.0 },
        { name: 'detail', type: 'float', defaultValue: params.detail ?? 2.0 },
        { name: 'offset', type: 'float', defaultValue: params.offset ?? 0.0 },
        { name: 'gain', type: 'float', defaultValue: params.gain ?? 1.0 },
      ],
      outputs: [
        { name: 'float', type: 'float' },
        { name: 'color', type: 'vec3' },
      ],
    });
    return this;
  }

  /**
   * Add a Voronoi noise node
   */
  addVoronoi(
    params: {
      scale?: number;
      smoothness?: number;
      exponent?: number;
      feature?: number; // 0=F1, 1=F2, 2=edge, 3=smooth
      use4D?: boolean;
    } = {},
  ): this {
    const id = this.nextId(GLSLTextureNodeTypes.Voronoi);
    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.Voronoi,
      params: {
        scale: params.scale ?? 5.0,
        smoothness: params.smoothness ?? 1.0,
        exponent: params.exponent ?? 0.5,
        feature: params.feature ?? 0,
        use4D: params.use4D ?? false,
      },
      inputs: [
        { name: 'vector', type: 'vec3' },
        { name: 'scale', type: 'float', defaultValue: params.scale ?? 5.0 },
        { name: 'smoothness', type: 'float', defaultValue: params.smoothness ?? 1.0 },
        { name: 'exponent', type: 'float', defaultValue: params.exponent ?? 0.5 },
      ],
      outputs: [
        { name: 'float', type: 'float' },
        { name: 'color', type: 'vec3' },
      ],
    });
    return this;
  }

  /**
   * Add a Wave texture node
   */
  addWave(
    params: {
      scale?: number;
      distortion?: number;
      waveType?: WaveType;
      bandsDirection?: number;
      ringsDirection?: number;
    } = {},
  ): this {
    const id = this.nextId(GLSLTextureNodeTypes.Wave);
    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.Wave,
      params: {
        scale: params.scale ?? 5.0,
        distortion: params.distortion ?? 0.0,
        waveType: params.waveType ?? WaveType.Bands,
        bandsDirection: params.bandsDirection ?? 0,
        ringsDirection: params.ringsDirection ?? 0,
      },
      inputs: [
        { name: 'vector', type: 'vec3' },
        { name: 'scale', type: 'float', defaultValue: params.scale ?? 5.0 },
        { name: 'distortion', type: 'float', defaultValue: params.distortion ?? 0.0 },
      ],
      outputs: [
        { name: 'float', type: 'float' },
        { name: 'color', type: 'vec3' },
      ],
    });
    return this;
  }

  /**
   * Add a ColorRamp node
   */
  addColorRamp(
    stops: ColorRampStop[],
    mode: ColorRampMode = ColorRampMode.Linear,
  ): this {
    const id = this.nextId(GLSLTextureNodeTypes.ColorRamp);
    const cr = new GLSLColorRamp(stops, mode);
    this.colorRamps.set(id, cr);

    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.ColorRamp,
      params: {
        colorRampKey: id,
      },
      inputs: [
        { name: 'fac', type: 'float', defaultValue: 0.5 },
      ],
      outputs: [
        { name: 'color', type: 'vec3' },
        { name: 'alpha', type: 'float' },
      ],
    });
    return this;
  }

  /**
   * Add a FloatCurve node
   */
  addFloatCurve(points: FloatCurvePoint[]): this {
    const id = this.nextId(GLSLTextureNodeTypes.FloatCurve);
    const fc = new GLSLFloatCurve(points);
    this.floatCurves.set(id, fc);

    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.FloatCurve,
      params: {
        floatCurveKey: id,
      },
      inputs: [
        { name: 'fac', type: 'float', defaultValue: 0.5 },
      ],
      outputs: [
        { name: 'float', type: 'float' },
      ],
    });
    return this;
  }

  /**
   * Add a Math node
   */
  addMath(
    operation: MathOperation = MathOperation.Multiply,
    value: number = 1.0,
  ): this {
    const id = this.nextId(GLSLTextureNodeTypes.Math);
    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.Math,
      params: {
        operation,
      },
      inputs: [
        { name: 'value', type: 'float', defaultValue: 0.5 },
        { name: 'value_1', type: 'float', defaultValue: value },
      ],
      outputs: [
        { name: 'float', type: 'float' },
      ],
    });
    return this;
  }

  /**
   * Add a Mix/blend node
   */
  addMix(factor: number = 0.5): this {
    const id = this.nextId(GLSLTextureNodeTypes.Mix);
    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.Mix,
      params: {
        factor,
      },
      inputs: [
        { name: 'factor', type: 'float', defaultValue: factor },
        { name: 'a', type: 'float', defaultValue: 0.0 },
        { name: 'b', type: 'float', defaultValue: 1.0 },
      ],
      outputs: [
        { name: 'float', type: 'float' },
      ],
    });
    return this;
  }

  /**
   * Add a Mapping node (scale, rotation, translation)
   */
  addMapping(
    scale: number[] = [1, 1, 1],
    rotation: number[] = [0, 0, 0],
    translation: number[] = [0, 0, 0],
  ): this {
    const id = this.nextId(GLSLTextureNodeTypes.Mapping);
    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.Mapping,
      params: {
        scale,
        rotation,
        translation,
      },
      inputs: [
        { name: 'vector', type: 'vec3' },
        { name: 'scale', type: 'vec3', defaultValue: scale },
        { name: 'rotation', type: 'vec3', defaultValue: rotation },
        { name: 'translation', type: 'vec3', defaultValue: translation },
      ],
      outputs: [
        { name: 'vector', type: 'vec3' },
      ],
    });
    return this;
  }

  /**
   * Add a Texture Coordinate input node
   */
  addTexCoord(coordMode?: CoordinateMode): this {
    const id = this.nextId(GLSLTextureNodeTypes.TexCoord);
    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.TexCoord,
      params: {
        coordMode: coordMode ?? this.coordinateMode,
      },
      inputs: [],
      outputs: [
        { name: 'generated', type: 'vec3' },
        { name: 'object', type: 'vec3' },
        { name: 'uv', type: 'vec3' },
        { name: 'normal', type: 'vec3' },
        { name: 'world', type: 'vec3' },
      ],
    });
    return this;
  }

  /**
   * Add an Output node
   */
  addOutput(): this {
    const id = this.nextId(GLSLTextureNodeTypes.Output);
    this.nodes.push({
      id,
      type: GLSLTextureNodeTypes.Output,
      params: {},
      inputs: [
        { name: 'value', type: 'float', defaultValue: 0.5 },
      ],
      outputs: [
        { name: 'color', type: 'vec3' },
      ],
    });
    return this;
  }

  /**
   * Connect two nodes
   */
  connect(
    fromNode: string,
    fromOutput: string,
    toNode: string,
    toInput: string,
  ): this {
    this.links.push({
      fromNode,
      fromOutput,
      toNode,
      toInput,
    });
    return this;
  }

  /**
   * Set coordinate mode
   */
  setCoordinateMode(mode: CoordinateMode): this {
    this.coordinateMode = mode;
    return this;
  }

  /**
   * Build the texture graph and return a ShaderMaterial
   */
  buildMaterial(): THREE.ShaderMaterial {
    const shader = new ProceduralTextureShader(
      this.nodes,
      this.links,
      this.coordinateMode,
      this.colorRamps,
      this.floatCurves,
    );
    return shader.build();
  }

  /**
   * Build the texture graph and render to a DataTexture
   *
   * @param renderer Optional WebGLRenderer (creates one if not provided)
   * @param resolution Texture resolution (256-4096)
   * @param objectRandom Per-instance randomization
   * @param timeW 4D W dimension for animation
   */
  buildTexture(
    renderer?: THREE.WebGLRenderer,
    resolution: number = 512,
    objectRandom: number = 0.0,
    timeW: number = 0.0,
  ): THREE.DataTexture {
    const material = this.buildMaterial();
    const textureRenderer = new ProceduralTextureRenderer(renderer, resolution);
    const texture = textureRenderer.render(material, objectRandom, timeW);
    return texture;
  }

  /**
   * Get the internal graph (nodes + links) for inspection
   */
  getGraph(): { nodes: TexturePipelineNode[]; links: TexturePipelineLink[] } {
    return {
      nodes: [...this.nodes],
      links: [...this.links],
    };
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.nodes = [];
    this.links = [];
    this.colorRamps = new Map();
    this.floatCurves = new Map();
    this.counters = new Map();
    return this;
  }
}

// ============================================================================
// Convenience Presets
// ============================================================================

/**
 * Preset graphs for common procedural textures
 */
export namespace ProceduralTexturePresets {
  /**
   * Create a Musgrave-based terrain material
   * Uses heterogeneous terrain Musgrave — the most common Infinigen pattern
   */
  export function terrainMaterial(
    scale: number = 3.0,
    detail: number = 8.0,
    dimension: number = 0.8,
    lacunarity: number = 2.0,
  ): THREE.ShaderMaterial {
    return new GLSLTextureGraphBuilder()
      .addMusgrave({
        musgraveType: MusgraveType.HeteroTerrain,
        scale,
        detail,
        dimension,
        lacunarity,
        offset: 0.5,
      })
      .addColorRamp([
        { position: 0.0, color: [0.15, 0.10, 0.05, 1.0] },
        { position: 0.3, color: [0.35, 0.28, 0.18, 1.0] },
        { position: 0.5, color: [0.45, 0.50, 0.30, 1.0] },
        { position: 0.7, color: [0.55, 0.50, 0.45, 1.0] },
        { position: 1.0, color: [0.90, 0.90, 0.92, 1.0] },
      ], ColorRampMode.Linear)
      .connect('musgrave_0', 'float', 'colorRamp_0', 'fac')
      .addOutput()
      .connect('colorRamp_0', 'color', 'output_0', 'value')
      .buildMaterial();
  }

  /**
   * Create a Musgrave-based rocky surface
   * Uses ridged multifractal for sharp features
   */
  export function rockySurface(
    scale: number = 5.0,
    detail: number = 6.0,
  ): THREE.ShaderMaterial {
    return new GLSLTextureGraphBuilder()
      .addMusgrave({
        musgraveType: MusgraveType.RidgedMultifractal,
        scale,
        detail,
        dimension: 0.8,
        lacunarity: 2.5,
        offset: 1.0,
        gain: 2.0,
      })
      .addOutput()
      .connect('musgrave_0', 'float', 'output_0', 'value')
      .buildMaterial();
  }

  /**
   * Create a Voronoi-based cell pattern
   */
  export function cellPattern(
    scale: number = 8.0,
    feature: number = 2, // edge distance
  ): THREE.ShaderMaterial {
    return new GLSLTextureGraphBuilder()
      .addVoronoi({ scale, feature })
      .addOutput()
      .connect('voronoi_0', 'float', 'output_0', 'value')
      .buildMaterial();
  }

  /**
   * Create a blended noise material (two Musgrave layers mixed)
   */
  export function blendedMusgrave(
    scale1: number = 3.0,
    scale2: number = 10.0,
    mixFactor: number = 0.5,
  ): THREE.ShaderMaterial {
    return new GLSLTextureGraphBuilder()
      .addMusgrave({
        musgraveType: MusgraveType.fBM,
        scale: scale1,
        detail: 6,
      })
      .addMusgrave({
        musgraveType: MusgraveType.RidgedMultifractal,
        scale: scale2,
        detail: 4,
        offset: 1.0,
        gain: 2.0,
      })
      .addMix(mixFactor)
      .connect('musgrave_0', 'float', 'mix_0', 'a')
      .connect('musgrave_1', 'float', 'mix_0', 'b')
      .addOutput()
      .connect('mix_0', 'float', 'output_0', 'value')
      .buildMaterial();
  }

  /**
   * Create an animated noise material (uses 4D W dimension)
   */
  export function animatedNoise(
    scale: number = 5.0,
    detail: number = 4,
    use4D: boolean = true,
  ): THREE.ShaderMaterial {
    return new GLSLTextureGraphBuilder()
      .addMusgrave({
        musgraveType: MusgraveType.fBM,
        scale,
        detail,
        use4D,
      })
      .addOutput()
      .connect('musgrave_0', 'float', 'output_0', 'value')
      .buildMaterial();
  }
}
