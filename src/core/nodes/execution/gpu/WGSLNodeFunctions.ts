/**
 * WGSL Node Functions Library
 *
 * Same node function library as GLSLNodeFunctions but in WGSL syntax.
 * Used by the GPU Per-Vertex Evaluator for WebGPU compute shaders.
 *
 * WGSL differences from GLSL:
 * - No #include / #version directives
 * - Types: vec3f instead of vec3, f32 instead of float, u32 instead of uint
 * - Function declarations use `fn` keyword
 * - No switch statements (use if/else chains)
 * - `let` for constants, `var` for mutable variables
 * - Array syntax differs
 * - `@builtin(global_invocation_id)` for compute shader dispatch
 *
 * @module core/nodes/execution/gpu
 */

// ============================================================================
// Common WGSL Utilities
// ============================================================================

export const WGSL_COMMON_UTILITIES = /* wgsl */ `
// ============================================================================
// Common WGSL Utilities
// ============================================================================

const PI: f32 = 3.14159265359;
const EPSILON: f32 = 0.0001;

fn saturate(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}

fn saturate3(x: vec3f) -> vec3f {
  return clamp(x, vec3f(0.0), vec3f(1.0));
}

// HSV <-> RGB Conversion
fn hsv2rgb(c: vec3f) -> vec3f {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(vec3f(c.x, c.x, c.x) + vec3f(K.x, K.y, K.z)) * 6.0 - vec3f(K.w, K.w, K.w));
  return c.z * mix(vec3f(K.x, K.x, K.x), clamp(p - vec3f(K.x, K.x, K.x), vec3f(0.0), vec3f(1.0)), vec3f(c.y, c.y, c.y));
}

fn rgb2hsv(c: vec3f) -> vec3f {
  let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4f(c.y, c.z, K.w, K.z), vec4f(c.z, c.y, K.x, K.y), select(1.0, 0.0, c.z < c.g));
  let q = mix(vec4f(p.x, p.y, p.w, c.x), vec4f(c.x, p.y, p.z, p.w), select(1.0, 0.0, p.x < c.x));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3f(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
`;

// ============================================================================
// Noise Texture WGSL
// ============================================================================

export const WGSL_NOISE_TEXTURE = /* wgsl */ `
// ============================================================================
// Noise Texture (Simplex 3D + Perlin 3D + FBM)
// ============================================================================

// Simplex 3D helpers
fn mod289_3(x: vec3f) -> vec3f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_4(x: vec4f) -> vec4f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute_4(x: vec4f) -> vec4f {
  return mod289_4(((x * 34.0) + 10.0) * x);
}

fn taylorInvSqrt_4(r: vec4f) -> vec4f {
  return 1.79284291400159 - 0.85373472095314 * r;
}

fn snoise3D(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);

  let i = floor(v + dot(v, vec3f(C.y, C.y, C.y)));
  let x0 = v - i + dot(i, vec3f(C.x, C.x, C.x));

  let g = step(vec3f(x0.y, x0.z, x0.x), vec3f(x0.x, x0.y, x0.z));
  let l = vec3f(1.0) - g;
  let i1 = min(g, vec3f(l.z, l.x, l.y));
  let i2 = max(g, vec3f(l.z, l.x, l.y));

  let x1 = x0 - i1 + vec3f(C.x, C.x, C.x);
  let x2 = x0 - i2 + vec3f(C.y, C.y, C.y);
  let x3 = x0 - vec3f(D.y, D.y, D.y);

  let im = mod289_3(i);
  var p = permute_4(permute_4(permute_4(
    vec4f(im.z) + vec4f(0.0, i1.z, i2.z, 1.0))
    + vec4f(im.y) + vec4f(0.0, i1.y, i2.y, 1.0))
    + vec4f(im.x) + vec4f(0.0, i1.x, i2.x, 1.0));

  let n_ = 0.142857142857;
  let ns = n_ * vec3f(D.w, D.y, D.z) - vec3f(D.x, D.z, D.x);

  let j = p - 49.0 * floor(p * vec4f(ns.z, ns.z, ns.z, ns.z));
  let x_ = floor(j * vec4f(ns.z, ns.z, ns.z, ns.z));
  let y_ = floor(j - 7.0 * x_);

  let x2d = x_ * vec4f(ns.x, ns.x, ns.x, ns.x) + vec4f(ns.y, ns.y, ns.y, ns.y);
  let y2d = y_ * vec4f(ns.x, ns.x, ns.x, ns.x) + vec4f(ns.y, ns.y, ns.y, ns.y);
  let h = 1.0 - abs(x2d) - abs(y2d);

  let b0 = vec4f(x2d.xy, y2d.xy);
  let b1 = vec4f(x2d.zw, y2d.zw);

  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));

  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;

  let p0 = vec3f(a0.xy, h.x);
  let p1 = vec3f(a0.zw, h.y);
  let p2 = vec3f(a1.xy, h.z);
  let p3 = vec3f(a1.zw, h.w);

  let norm = taylorInvSqrt_4(vec4f(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  let pp0 = p0 * norm.x;
  let pp1 = p1 * norm.y;
  let pp2 = p2 * norm.z;
  let pp3 = p3 * norm.w;

  var m = max(0.5 - vec4f(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), vec4f(0.0));
  m = m * m;
  return 105.0 * dot(m * m, vec4f(dot(pp0,x0), dot(pp1,x1), dot(pp2,x2), dot(pp3,x3)));
}

// Perlin/gradient noise 3D
fn hash33_grad(p: vec3f) -> vec3f {
  var pp = vec3f(dot(p, vec3f(127.1, 311.7, 74.7)),
                 dot(p, vec3f(269.5, 183.3, 246.1)),
                 dot(p, vec3f(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(pp) * 43758.5453123);
}

fn perlin3D(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash33_grad(i + vec3f(0,0,0)), f - vec3f(0,0,0)),
                     dot(hash33_grad(i + vec3f(1,0,0)), f - vec3f(1,0,0)), u.x),
                 mix(dot(hash33_grad(i + vec3f(0,1,0)), f - vec3f(0,1,0)),
                     dot(hash33_grad(i + vec3f(1,1,0)), f - vec3f(1,1,0)), u.x), u.y),
             mix(mix(dot(hash33_grad(i + vec3f(0,0,1)), f - vec3f(0,0,1)),
                     dot(hash33_grad(i + vec3f(1,0,1)), f - vec3f(1,0,1)), u.x),
                 mix(dot(hash33_grad(i + vec3f(0,1,1)), f - vec3f(0,1,1)),
                     dot(hash33_grad(i + vec3f(1,1,1)), f - vec3f(1,1,1)), u.x), u.y), u.z);
}

// FBM with configurable octaves
fn fbm3D(p: vec3f, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
  var value: f32 = 0.0;
  var amplitude: f32 = 1.0;
  var frequency: f32 = 1.0;
  var maxValue: f32 = 0.0;
  var pos = p;
  for (var i: i32 = 0; i < 16; i = i + 1) {
    if (i >= octaves) { break; }
    value += amplitude * snoise3D(pos * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / max(maxValue, EPSILON);
}

// Noise Texture node function
fn noiseTexture(coord: vec3f, scale: f32, detail: f32, distortion: f32, roughness: f32) -> f32 {
  var p = coord * scale;
  if (distortion > 0.0) {
    p = p + vec3f(
      snoise3D(p + vec3f(0.0, 0.0, 0.0)),
      snoise3D(p + vec3f(5.2, 1.3, 2.8)),
      snoise3D(p + vec3f(9.1, 3.7, 7.4))
    ) * distortion;
  }
  let octaves = i32(detail);
  let gain = 1.0 - roughness;
  return 0.5 + 0.5 * fbm3D(p, octaves, 2.0, gain);
}
`;

// ============================================================================
// Voronoi Texture WGSL
// ============================================================================

export const WGSL_VORONOI_TEXTURE = /* wgsl */ `
// ============================================================================
// Voronoi Texture (F1, F2, distance-to-edge, smooth F1)
// ============================================================================

fn hash33_vor(p: vec3f) -> vec3f {
  var pp = vec3f(dot(p, vec3f(127.1, 311.7, 74.7)),
                 dot(p, vec3f(269.5, 183.3, 246.1)),
                 dot(p, vec3f(113.5, 271.9, 124.6)));
  return fract(sin(pp) * 43758.5453123);
}

struct VoronoiResult {
  f1: f32,
  f2: f32,
  cellId: vec3f,
  edgeDist: f32,
};

fn voronoi3D(p: vec3f) -> VoronoiResult {
  let i = floor(p);
  let f = fract(p);
  var f1: f32 = 8.0;
  var f2: f32 = 8.0;
  var cellId: vec3f = vec3f(0.0);

  for (var z: i32 = -1; z <= 1; z = z + 1) {
    for (var y: i32 = -1; y <= 1; y = y + 1) {
      for (var x: i32 = -1; x <= 1; x = x + 1) {
        let neighbor = vec3f(f32(x), f32(y), f32(z));
        let point = hash33_vor(i + neighbor);
        let diff = neighbor + point - f;
        let dist = length(diff);
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

  return VoronoiResult(f1, f2, cellId, f2 - f1);
}

fn smoothVoronoiF1(p: vec3f, smoothness: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  var result: f32 = 0.0;
  var totalWeight: f32 = 0.0;

  for (var z: i32 = -1; z <= 1; z = z + 1) {
    for (var y: i32 = -1; y <= 1; y = y + 1) {
      for (var x: i32 = -1; x <= 1; x = x + 1) {
        let neighbor = vec3f(f32(x), f32(y), f32(z));
        let point = hash33_vor(i + neighbor);
        let diff = neighbor + point - f;
        let dist = length(diff);
        let weight = exp(-smoothness * dist * dist);
        result += weight * dist;
        totalWeight += weight;
      }
    }
  }

  return select(result / totalWeight, 0.0, totalWeight <= 0.0);
}

fn voronoiTexture(coord: vec3f, scale: f32, smoothness: f32, exponent: f32,
                  distanceMetric: i32, featureMode: i32) -> f32 {
  let p = coord * scale;
  let vor = voronoi3D(p);

  var dist: f32 = vor.f1;
  if (featureMode == 1) { // F2
    dist = vor.f2;
  } else if (featureMode == 2) { // Distance to edge
    dist = vor.edgeDist;
  } else if (featureMode == 3) { // Smooth F1
    dist = smoothVoronoiF1(p, smoothness);
  }

  return pow(max(dist, 0.0), exponent);
}
`;

// ============================================================================
// Musgrave Texture WGSL
// ============================================================================

export const WGSL_MUSGRAVE_TEXTURE = /* wgsl */ `
// ============================================================================
// Musgrave Texture (fBm, multifractal, ridged, heterogeneous terrain)
// ============================================================================

fn musgraveFBM(p: vec3f, scale: f32, octaves: i32, dimension: f32, lacunarity: f32) -> f32 {
  let gain = pow(0.5, 2.0 - dimension);
  return fbm3D(p * scale, octaves, lacunarity, gain);
}

fn musgraveRidged(p: vec3f, scale: f32, octaves: i32, dimension: f32, lacunarity: f32, offset: f32, gain: f32) -> f32 {
  var value: f32 = 0.0;
  var amplitude: f32 = 1.0;
  var frequency: f32 = 1.0;
  var maxValue: f32 = 0.0;
  var weight: f32 = 1.0;
  var pos = p;

  for (var i: i32 = 0; i < 16; i = i + 1) {
    if (i >= octaves) { break; }
    var signal = snoise3D(pos * scale * frequency);
    signal = abs(signal);
    signal = offset - signal;
    signal = signal * signal;
    signal = signal * weight;
    weight = clamp(signal * gain, 0.0, 1.0);
    value += signal * amplitude;
    maxValue += amplitude;
    amplitude *= pow(lacunarity, -dimension);
    frequency *= lacunarity;
  }
  return value / max(maxValue, EPSILON);
}

fn musgraveHeteroTerrain(p: vec3f, scale: f32, octaves: i32, dimension: f32, lacunarity: f32, offset: f32) -> f32 {
  let gain = pow(0.5, 2.0 - dimension);
  var value: f32 = offset + snoise3D(p * scale);
  var amplitude: f32 = 1.0;
  var frequency: f32 = 1.0;
  var maxValue: f32 = 1.0;
  var pos = p;

  for (var i: i32 = 1; i < 16; i = i + 1) {
    if (i >= octaves) { break; }
    amplitude *= gain;
    frequency *= lacunarity;
    let signal = (snoise3D(pos * scale * frequency) + offset) * amplitude;
    value += signal;
    maxValue += amplitude;
  }
  return value / max(maxValue, EPSILON);
}

fn musgraveMultiFractal(p: vec3f, scale: f32, octaves: i32, dimension: f32, lacunarity: f32, offset: f32) -> f32 {
  let gain = pow(0.5, 2.0 - dimension);
  var value: f32 = 1.0;
  var amplitude: f32 = 1.0;
  var frequency: f32 = 1.0;
  var pos = p;

  for (var i: i32 = 0; i < 16; i = i + 1) {
    if (i >= octaves) { break; }
    value *= (amplitude * snoise3D(pos * scale * frequency) + offset);
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value;
}

fn musgraveTexture(coord: vec3f, scale: f32, detail: f32, dimension: f32,
                   lacunarity: f32, offset: f32, gain: f32, musgraveType: i32) -> f32 {
  let p = coord;
  let octaves = i32(detail);

  if (musgraveType == 0) {
    return musgraveFBM(p, scale, octaves, dimension, lacunarity);
  } else if (musgraveType == 1) {
    return musgraveMultiFractal(p, scale, octaves, dimension, lacunarity, offset);
  } else if (musgraveType == 2) {
    return musgraveRidged(p, scale, octaves, dimension, lacunarity, offset, gain);
  } else {
    return musgraveHeteroTerrain(p, scale, octaves, dimension, lacunarity, offset);
  }
}
`;

// ============================================================================
// Gradient Texture WGSL
// ============================================================================

export const WGSL_GRADIENT_TEXTURE = /* wgsl */ `
// ============================================================================
// Gradient Texture
// ============================================================================

fn gradientLinear(coord: vec3f) -> f32 { return coord.x; }
fn gradientQuadratic(coord: vec3f) -> f32 { let t = coord.x; return t * t; }
fn gradientEased(coord: vec3f) -> f32 { let t = coord.x; return t * t * (3.0 - 2.0 * t); }
fn gradientDiagonal(coord: vec3f) -> f32 { return (coord.x + coord.y) * 0.5; }
fn gradientSpherical(coord: vec3f) -> f32 {
  let r = coord * 2.0 - 1.0;
  return 1.0 - saturate(length(r));
}
fn gradientQuadraticSphere(coord: vec3f) -> f32 {
  let r = coord * 2.0 - 1.0;
  let dist = length(r);
  return 1.0 - saturate(dist * dist);
}

fn gradientTexture(coord: vec3f, gradientType: i32) -> f32 {
  if (gradientType == 0) { return gradientLinear(coord); }
  if (gradientType == 1) { return gradientQuadratic(coord); }
  if (gradientType == 2) { return gradientEased(coord); }
  if (gradientType == 3) { return gradientDiagonal(coord); }
  if (gradientType == 4) { return gradientSpherical(coord); }
  return gradientQuadraticSphere(coord);
}
`;

// ============================================================================
// Math WGSL
// ============================================================================

export const WGSL_MATH = /* wgsl */ `
// ============================================================================
// Math operations
// ============================================================================

fn mathOp(a: f32, b: f32, operation: i32) -> f32 {
  if (operation == 0) { return a + b; }
  if (operation == 1) { return a - b; }
  if (operation == 2) { return a * b; }
  if (operation == 3) { return select(a / b, 0.0, b == 0.0); }
  if (operation == 4) { return pow(max(a, 0.0), b); }
  if (operation == 5) { return select(log(a) / log(b), 0.0, a <= 0.0 || b <= 0.0); }
  if (operation == 6) { return sqrt(max(a, 0.0)); }
  if (operation == 7) { return 1.0 / max(a, EPSILON); }
  if (operation == 8) { return abs(a); }
  if (operation == 10) { return min(a, b); }
  if (operation == 11) { return max(a, b); }
  if (operation == 12) { return sin(a); }
  if (operation == 13) { return cos(a); }
  if (operation == 14) { return tan(a); }
  if (operation == 19) { return exp(a); }
  if (operation == 20) { return select(a - b * floor(a / b), 0.0, b == 0.0); }
  if (operation == 21) { return floor(a); }
  if (operation == 22) { return ceil(a); }
  if (operation == 23) { return fract(a); }
  if (operation == 24) { return sign(a); }
  if (operation == 25) { return clamp(a, 0.0, 1.0); }
  return a;
}
`;

// ============================================================================
// Vector Math WGSL
// ============================================================================

export const WGSL_VECTOR_MATH = /* wgsl */ `
// ============================================================================
// Vector Math operations
// ============================================================================

struct VectorMathResult {
  vector: vec3f,
  value: f32,
};

fn vectorMathOp(a: vec3f, b: vec3f, scale: f32, operation: i32) -> VectorMathResult {
  if (operation == 0) { return VectorMathResult(a + b, 0.0); }
  if (operation == 1) { return VectorMathResult(a - b, 0.0); }
  if (operation == 2) { return VectorMathResult(a * b, 0.0); }
  if (operation == 3) { return VectorMathResult(a / max(b, vec3f(EPSILON)), 0.0); }
  if (operation == 4) { return VectorMathResult(cross(a, b), 0.0); }
  if (operation == 5) { return VectorMathResult(a, dot(a, b)); }
  if (operation == 6) { return VectorMathResult(normalize(a), 0.0); }
  if (operation == 7) { return VectorMathResult(a, length(a)); }
  if (operation == 8) { return VectorMathResult(a, distance(a, b)); }
  if (operation == 9) { return VectorMathResult(a * scale, 0.0); }
  return VectorMathResult(a, 0.0);
}
`;

// ============================================================================
// Brick Texture WGSL
// ============================================================================

export const WGSL_BRICK_TEXTURE = /* wgsl */ `
// ============================================================================
// Brick Texture
// ============================================================================

fn brickTexture(coord: vec3f, scale: f32, mortarSize: f32, mortarSmooth: f32,
                bias: f32, brickWidth: f32, rowHeight: f32,
                offset: f32, squash: f32) -> f32 {
  var p = coord * scale;

  let bw = max(brickWidth, EPSILON);
  let rh = max(rowHeight, EPSILON);

  let offsetAmount = offset * bw;

  let row = floor(p.y / rh);
  let oddRow = row % 2.0;
  p.x = p.x + oddRow * offsetAmount;

  let rowMul = 1.0 + oddRow * (squash - 1.0);
  p.y = (p.y - row * rh) * rowMul + row * rh;

  let bx = p.x % bw;
  let by = p.y % rh;

  let mortX = min(bx, bw - bx);
  let mortY = min(by, rh - by);
  let mort = min(mortX, mortY);

  let mortar = 1.0 - smoothstep(mortarSize - mortarSmooth, mortarSize + mortarSmooth, mort);

  return 1.0 - mortar;
}
`;

// ============================================================================
// Checker Texture WGSL
// ============================================================================

export const WGSL_CHECKER_TEXTURE = /* wgsl */ `
// ============================================================================
// Checker Texture
// ============================================================================

fn checkerTexture(coord: vec3f, scale: f32) -> f32 {
  let p = coord * scale;
  return f32(i32(floor(p.x)) + i32(floor(p.y)) + i32(floor(p.z))) % 2.0;
}
`;

// ============================================================================
// Mapping WGSL
// ============================================================================

export const WGSL_MAPPING = /* wgsl */ `
// ============================================================================
// Mapping Node
// ============================================================================

fn mappingNode(vector: vec3f, translation: vec3f, rotation: vec3f, scale: vec3f) -> vec3f {
  var result = vector * scale;

  // Z rotation
  let cz = cos(rotation.z);
  let sz = sin(rotation.z);
  result = vec3f(result.x * cz - result.y * sz, result.x * sz + result.y * cz, result.z);

  // Y rotation
  let cy = cos(rotation.y);
  let sy = sin(rotation.y);
  result = vec3f(result.x * cy + result.z * sy, result.y, -result.x * sy + result.z * cy);

  // X rotation
  let cx = cos(rotation.x);
  let sx = sin(rotation.x);
  result = vec3f(result.x, result.y * cx - result.z * sx, result.y * sx + result.z * cx);

  return result + translation;
}
`;

// ============================================================================
// Aggregate: all WGSL functions combined
// ============================================================================

export const ALL_WGSL_NODE_FUNCTIONS = [
  WGSL_COMMON_UTILITIES,
  WGSL_NOISE_TEXTURE,
  WGSL_VORONOI_TEXTURE,
  WGSL_MUSGRAVE_TEXTURE,
  WGSL_GRADIENT_TEXTURE,
  WGSL_MATH,
  WGSL_VECTOR_MATH,
  WGSL_BRICK_TEXTURE,
  WGSL_CHECKER_TEXTURE,
  WGSL_MAPPING,
].join('\n');
