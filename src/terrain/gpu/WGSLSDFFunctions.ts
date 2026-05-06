/**
 * WGSL SDF Functions Library
 *
 * Provides WGSL shader implementations of SDF primitives and combinators
 * for GPU-accelerated terrain evaluation. These mirror the TypeScript
 * implementations in SDFPrimitives.ts and SDFCombinators.ts exactly,
 * enabling the GPU to evaluate terrain SDFs in parallel.
 *
 * Primitives: sphere, box, cylinder, torus, cone, plane, capsule, ellipsoid
 * Combinators: union, subtraction, intersection, smooth_union, smooth_subtraction,
 *              smooth_intersection, exp_smooth_union
 * Transforms: translate, rotate_y, scale, apply_transform
 *
 * Used by GPUSDFEvaluator to generate compute shaders for SDF grid evaluation.
 *
 * @module terrain/gpu
 */

// ============================================================================
// WGSL SDF Primitives
// ============================================================================

/**
 * WGSL SDF primitive functions.
 *
 * Each function takes a point in local (un-transformed) space and returns
 * the signed distance. Conventions match Inigo Quilez's reference:
 *   - Negative inside, positive outside
 *   - Functions prefixed with `sdf_` for namespace clarity
 */
export const WGSL_SDF_PRIMITIVES = /* wgsl */ `
// ============================================================================
// SDF Primitives
// ============================================================================

/// Sphere SDF: distance from the surface of a sphere centered at origin.
fn sdf_sphere(p: vec3f, radius: f32) -> f32 {
  return length(p) - radius;
}

/// Box SDF: axis-aligned box with half-extents b.
/// Exact signed distance (not a bound).
fn sdf_box(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

/// Rounded box SDF: box with rounded corners.
fn sdf_rounded_box(p: vec3f, b: vec3f, r: f32) -> f32 {
  let q = abs(p) - b + r;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

/// Torus SDF: torus in the XZ plane with major radius R and minor radius r.
fn sdf_torus(p: vec3f, R: f32, r: f32) -> f32 {
  let q = vec2f(length(p.xz) - R, p.y);
  return length(q) - r;
}

/// Cylinder SDF: cylinder along the Y axis with radius r and half-height h.
/// Capped (finite) cylinder.
fn sdf_cylinder(p: vec3f, r: f32, h: f32) -> f32 {
  let d = vec2f(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
}

/// Cone SDF: cone tip at origin, base at y = -height, with base radius.
/// Exact signed distance.
fn sdf_cone(p: vec3f, radius: f32, height: f32) -> f32 {
  let q = vec2f(length(p.xz), p.y);
  let tip = q - vec2f(0.0, -height);
  let base = q - vec2f(radius, 0.0);
  let h = select(
    select(
      abs(q.x * radius - q.y * height) / sqrt(radius * radius + height * height),
      base.length(),
      base.dot(tip) < 0.0
    ),
    tip.length(),
    tip.dot(base) < 0.0
  );
  return h * sign(q.y);
}

/// Plane SDF: infinite ground plane at y = 0.
fn sdf_plane(p: vec3f) -> f32 {
  return p.y;
}

/// Capsule SDF: cylinder with hemispherical caps, along Y axis.
fn sdf_capsule(p: vec3f, r: f32, h: f32) -> f32 {
  let py = abs(p.y) - h;
  let d = vec2f(length(p.xz) - r, py);
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
}

/// Ellipsoid SDF: approximate signed distance to an ellipsoid with radii r.
/// Uses the quadratic approximation from IQ.
fn sdf_ellipsoid(p: vec3f, r: vec3f) -> f32 {
  let k0 = length(p / r);
  let k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

/// Line segment SDF: distance to a line segment from a to b, with radius r.
/// Useful for tunnel/cave SDFs.
fn sdf_segment(p: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

/// Capped cone SDF: cone with caps for precise control.
fn sdf_capped_cone(p: vec3f, h: f32, r1: f32, r2: f32) -> f32 {
  let q = vec2f(length(p.xz), p.y);
  let k1 = vec2f(r2, h);
  let k2 = vec2f(r2 - r1, 2.0 * h);
  let ca = vec2f(q.x - min(q.x, select(r1, r2, q.y < 0.0)), abs(q.y) - h);
  let cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  let s = select(-1.0, 1.0, cb.x < 0.0 && ca.y < 0.0);
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
`;

// ============================================================================
// WGSL SDF Combinators
// ============================================================================

/**
 * WGSL SDF combinator functions.
 *
 * Implements sharp and smooth boolean operations matching the TypeScript
 * versions in SDFCombinators.ts exactly. Smooth operations use the
 * polynomial smooth min/max from Inigo Quilez.
 */
export const WGSL_SDF_COMBINATORS = /* wgsl */ `
// ============================================================================
// SDF Combinators
// ============================================================================

// ---- Sharp Boolean Operations ----

/// Sharp union: min(d1, d2)
fn sdf_union(d1: f32, d2: f32) -> f32 {
  return min(d1, d2);
}

/// Sharp intersection: max(d1, d2)
fn sdf_intersection(d1: f32, d2: f32) -> f32 {
  return max(d1, d2);
}

/// Sharp subtraction: max(d1, -d2) — keeps d1 where d2 is outside
fn sdf_subtraction(d1: f32, d2: f32) -> f32 {
  return max(d1, -d2);
}

/// Reverse subtraction: max(-d1, d2) — keeps d2 where d1 is outside
fn sdf_reverse_subtraction(d1: f32, d2: f32) -> f32 {
  return max(-d1, d2);
}

// ---- Smooth Boolean Operations (polynomial smooth min) ----
// Reference: Inigo Quilez — https://iquilezles.org/articles/smin/

/// Polynomial smooth minimum.
/// Blends two distance fields with configurable smoothness k.
/// k = 0 → sharp min, larger k → smoother blend.
fn sdf_smooth_union(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0) { return min(a, b); }
  let h = clamp((b - a + k) / (2.0 * k), 0.0, 1.0);
  return b + (a - b) * h - k * h * (1.0 - h);
}

/// Polynomial smooth maximum (smooth intersection).
fn sdf_smooth_intersection(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0) { return max(a, b); }
  let h = clamp((b - a + k) / (2.0 * k), 0.0, 1.0);
  return b + (a - b) * h + k * h * (1.0 - h);
}

/// Polynomial smooth subtraction.
fn sdf_smooth_subtraction(a: f32, b: f32, k: f32) -> f32 {
  return sdf_smooth_intersection(a, -b, k);
}

/// Exponential smooth minimum — alternative blending with exponential decay.
/// Produces smoother results than polynomial for large k values.
fn sdf_exp_smooth_union(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0) { return min(a, b); }
  let res = exp(-k * a) + exp(-k * b);
  return -log(res) / k;
}

// ---- Smooth lerp between two SDFs ----

/// Smooth lerp: blends between two SDFs based on a [0,1] factor.
/// factor = 0 → d1, factor = 1 → d2, with smooth transition.
fn sdf_smooth_lerp(d1: f32, d2: f32, factor: f32) -> f32 {
  return mix(d1, d2, factor);
}
`;

// ============================================================================
// WGSL SDF Transform Helpers
// ============================================================================

/**
 * WGSL helper functions for transforming SDF query points.
 *
 * SDF transforms work by inverse-transforming the query point
 * before evaluating the SDF. This module provides common transforms
 * (translate, rotate, scale) and a general 4x4 matrix transform.
 */
export const WGSL_SDF_TRANSFORMS = /* wgsl */ `
// ============================================================================
// SDF Transform Helpers
// ============================================================================

/// Translate: move the SDF by offset t.
/// Usage: evaluate sdf(p - t) to get the SDF at (p - t).
fn sdf_translate(p: vec3f, t: vec3f) -> vec3f {
  return p - t;
}

/// Rotate around Y axis by angle theta.
fn sdf_rotate_y(p: vec3f, theta: f32) -> vec3f {
  let c = cos(theta);
  let s = sin(theta);
  return vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

/// Rotate around X axis by angle theta.
fn sdf_rotate_x(p: vec3f, theta: f32) -> vec3f {
  let c = cos(theta);
  let s = sin(theta);
  return vec3f(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

/// Rotate around Z axis by angle theta.
fn sdf_rotate_z(p: vec3f, theta: f32) -> vec3f {
  let c = cos(theta);
  let s = sin(theta);
  return vec3f(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

/// Uniform scale: scale the SDF by factor s.
/// Note: SDFs must be divided by s after evaluation to preserve distance properties.
/// Usage: return sdf(p / s) / s;
fn sdf_scale(p: vec3f, s: f32) -> vec3f {
  return p / s;
}

/// Apply a 4x4 matrix transform (stored as mat4x4f) to a point.
/// Returns the inverse-transformed point for SDF evaluation.
fn sdf_apply_transform(p: vec3f, m: mat4x4f) -> vec3f {
  // For SDF, we need the inverse transform.
  // Since we construct the matrix as a forward transform, we invert it here.
  // For translation-only or simple transforms, use the specific functions instead.
  let inv = inverse(m);
  return (inv * vec4f(p, 1.0)).xyz;
}
`;

// ============================================================================
// SDF Composition Element Types (for shader generation)
// ============================================================================

/**
 * Enum for SDF primitive types that can be evaluated on the GPU.
 * These map directly to the WGSL primitive functions above.
 *
 * The numeric values are used in the composition buffer to identify
 * which primitive function to call for each element.
 */
export enum SDFPrimitiveType {
  /** Sphere SDF */
  SPHERE = 0,
  /** Box SDF */
  BOX = 1,
  /** Cylinder SDF (capped) */
  CYLINDER = 2,
  /** Torus SDF */
  TORUS = 3,
  /** Cone SDF */
  CONE = 4,
  /** Infinite plane SDF */
  PLANE = 5,
  /** Capsule SDF */
  CAPSULE = 6,
  /** Ellipsoid SDF */
  ELLIPSOID = 7,
  /** Line segment SDF (tunnels) */
  SEGMENT = 8,
  /** Capped cone SDF */
  CAPPED_CONE = 9,
}

/**
 * Enum for SDF combinator operations used in the composition buffer.
 * These map to the WGSL combinator functions above.
 */
export enum SDFCombinatorType {
  /** Sharp union (min) */
  UNION = 0,
  /** Sharp subtraction (max(d1, -d2)) */
  SUBTRACTION = 1,
  /** Sharp intersection (max) */
  INTERSECTION = 2,
  /** Smooth union (polynomial smin) */
  SMOOTH_UNION = 3,
  /** Smooth subtraction */
  SMOOTH_SUBTRACTION = 4,
  /** Smooth intersection */
  SMOOTH_INTERSECTION = 5,
  /** Exponential smooth union */
  EXP_SMOOTH_UNION = 6,
}

/**
 * Description of a single SDF element in the composition.
 * Used to generate the WGSL shader code and the composition buffer.
 *
 * Each element has:
 * - A primitive type (which WGSL function to call)
 * - Primitive parameters (radius, half-extents, etc.)
 * - A transform (position + rotation) to apply before evaluation
 * - A combinator type (how to combine with the running result)
 * - A combinator parameter (e.g., blend factor k for smooth operations)
 */
export interface SDFElementDesc {
  /** Which primitive to use */
  primitiveType: SDFPrimitiveType;
  /** Parameters for the primitive function (interpretation depends on type) */
  params: Float32Array; // up to 10 floats
  /** Translation offset (3 floats) */
  position: [number, number, number];
  /** Euler rotation angles in radians (3 floats: rx, ry, rz) */
  rotation: [number, number, number];
  /** Uniform scale factor */
  scale: number;
  /** How to combine with the running result */
  combinator: SDFCombinatorType;
  /** Blend factor for smooth operations */
  combinatorParam: number;
}

/**
 * Size of a single SDF element in the composition buffer (in floats).
 *
 * Layout per element:
 *   [0]     primitiveType: u32 (as f32 bits)
 *   [1-10]  params: 10 floats
 *   [11-13] position: 3 floats
 *   [14-16] rotation: 3 floats
 *   [17]    scale: 1 float
 *   [18]    combinator: u32 (as f32 bits)
 *   [19]    combinatorParam: 1 float
 *   Total: 20 floats = 80 bytes per element
 */
export const SDF_ELEMENT_FLOATS = 20;

// ============================================================================
// Aggregate: all WGSL SDF functions combined
// ============================================================================

/**
 * All WGSL SDF functions combined into a single string for inclusion
 * in compute shaders.
 */
export const ALL_WGSL_SDF_FUNCTIONS = [
  WGSL_SDF_PRIMITIVES,
  WGSL_SDF_COMBINATORS,
  WGSL_SDF_TRANSFORMS,
].join('\n');
