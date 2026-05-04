/**
 * NoiseGLSL — Shared GLSL noise function strings for per-type shader pipelines
 *
 * Provides injectable GLSL snippets for:
 * - 3D Simplex noise
 * - 3D Perlin/Gradient noise
 * - FBM (Fractional Brownian Motion)
 * - Musgrave noise variants (fBm, multifractal, ridged, heterogeneous terrain)
 * - Domain warping helpers
 * - HSV ↔ RGB conversion
 *
 * All functions are self-contained (no external dependencies except math builtins).
 * Designed to be concatenated into fragment shaders via template literals.
 *
 * @module assets/shaders/common
 */

// ============================================================================
// 3D Simplex Noise
// ============================================================================

/**
 * Complete 3D simplex noise implementation.
 * Includes the permutation, gradient, and noise functions.
 */
export const SIMPLEX_3D_GLSL = /* glsl */ `
// ============================================================================
// 3D Simplex Noise
// ============================================================================

vec3 mod289_v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute_v4(vec4 x) { return mod289_v4(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt_v4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3D(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  // Permutations
  i = mod289_v3(i);
  vec4 p = permute_v4(permute_v4(permute_v4(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt_v4(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// ============================================================================
// 2D Simplex Noise
// ============================================================================

/**
 * 2D simplex noise for flat pattern generation (brushed metal, etc.)
 */
export const SIMPLEX_2D_GLSL = /* glsl */ `
// ============================================================================
// 2D Simplex Noise
// ============================================================================

vec3 mod289_2d_v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289_2d_v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute_2d_v3(vec3 x) { return mod289_2d_v3(((x * 34.0) + 10.0) * x); }

float snoise2D(vec2 v) {
  const vec4 C = vec4(0.211324865405187,
                      0.366025403784439,
                     -0.577350269189626,
                      0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  i = mod289_2d_v3(i);
  vec3 p = permute_2d_v3(permute_2d_v3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x_) - 0.5;
  vec3 ox = floor(x_ + 0.5);
  vec3 a0 = x_ - ox;

  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

// ============================================================================
// Perlin/Gradient Noise 3D
// ============================================================================

/**
 * 3D Perlin gradient noise and hash functions.
 * Lighter than simplex for some use cases.
 */
export const PERLIN_3D_GLSL = /* glsl */ `
// ============================================================================
// 3D Perlin Gradient Noise
// ============================================================================

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
`;

// ============================================================================
// FBM (Fractional Brownian Motion)
// ============================================================================

/**
 * FBM implementation using simplex noise as the base.
 * Configurable octaves, lacunarity, and gain.
 */
export const FBM_GLSL = /* glsl */ `
// ============================================================================
// FBM (Fractional Brownian Motion)
// ============================================================================

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

  return value / maxValue;
}

float fbm2D(vec2 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise2D(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}
`;

// ============================================================================
// Musgrave Noise Variants
// ============================================================================

/**
 * Musgrave noise variants as used in the original Infinigen:
 * - fBm (standard fractional Brownian motion)
 * - Multifractal
 * - Ridged multifractal
 * - Heterogeneous terrain
 */
export const MUSGRAVE_GLSL = /* glsl */ `
// ============================================================================
// Musgrave Noise Variants
// ============================================================================

float musgraveFBM(vec3 p, float scale, int octaves, float dimension, float lacunarity) {
  float gain = pow(0.5, 2.0 - dimension);
  return fbm3D(p * scale, octaves, lacunarity, gain);
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

  return value / maxValue;
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

  return value / maxValue;
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
`;

// ============================================================================
// Domain Warping
// ============================================================================

/**
 * Domain warping helpers for creating complex, organic patterns.
 */
export const DOMAIN_WARP_GLSL = /* glsl */ `
// ============================================================================
// Domain Warping
// ============================================================================

// Single-level domain warp
vec3 domainWarp(vec3 p, float strength, float scale) {
  vec3 q = vec3(
    snoise3D(p * scale),
    snoise3D(p * scale + vec3(5.2, 1.3, 2.8)),
    snoise3D(p * scale + vec3(9.1, 3.7, 7.4))
  );
  return p + strength * q;
}

// Double-level domain warp (fBm of fBm)
vec3 domainWarpDouble(vec3 p, float strength1, float strength2, float scale) {
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

// ============================================================================
// HSV <-> RGB Conversion
// ============================================================================

/**
 * HSV <-> RGB conversion for color space manipulation.
 * Used by wood shaders for realistic color variation.
 */
export const HSV_RGB_GLSL = /* glsl */ `
// ============================================================================
// HSV <-> RGB Conversion
// ============================================================================

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
// Utility: Value noise (for cases where gradient noise is not needed)
// ============================================================================

/**
 * Simple value noise for lightweight patterns.
 */
export const VALUE_NOISE_GLSL = /* glsl */ `
// ============================================================================
// Value Noise
// ============================================================================

float hash3D(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(mix(hash3D(i), hash3D(i + vec3(1,0,0)), f.x),
        mix(hash3D(i + vec3(0,1,0)), hash3D(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3D(i + vec3(0,0,1)), hash3D(i + vec3(1,0,1)), f.x),
        mix(hash3D(i + vec3(0,1,1)), hash3D(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float hash2D(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash2D(i);
  float b = hash2D(i + vec2(1.0, 0.0));
  float c = hash2D(i + vec2(0.0, 1.0));
  float d = hash2D(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/**
 * All noise GLSL snippets combined in order of dependency.
 */
export const ALL_NOISE_GLSL = [
  SIMPLEX_3D_GLSL,
  SIMPLEX_2D_GLSL,
  PERLIN_3D_GLSL,
  FBM_GLSL,
  MUSGRAVE_GLSL,
  DOMAIN_WARP_GLSL,
  HSV_RGB_GLSL,
  VALUE_NOISE_GLSL,
].join('\n');
