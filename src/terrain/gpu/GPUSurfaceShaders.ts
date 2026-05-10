/**
 * GPU Surface Shader Pipeline
 *
 * Provides GPU-accelerated evaluation of surface displacement kernels for
 * terrain rendering. Implements both WebGPU compute and CPU fallback paths.
 *
 * Key classes:
 * - `SurfaceMaterialDescriptor`: Describes a surface's displacement configuration
 * - `GPUSurfaceShaderDispatcher`: Compiles descriptors to compute shaders and
 *   dispatches GPU evaluation with proper buffer lifecycle management
 * - `compileSurfaceToShader()`: Compiles a descriptor to WGSL compute shader code
 * - `dispatchSurfaceCompute()`: Execute the compute shader on GPU
 * - CPU fallback path using NoiseUtils when WebGPU is unavailable
 *
 * Based on original Infinigen's GPU surface evaluation system.
 *
 * @module terrain/gpu/GPUSurfaceShaders
 */

import * as THREE from 'three';
import { NoiseUtils, SeededNoiseGenerator } from '@/core/util/math/noise';
import { ALL_WGSL_SDF_FUNCTIONS } from './WGSLSDFFunctions';

// ============================================================================
// Surface Material Descriptor
// ============================================================================

/**
 * Displacement type for a single surface displacement layer.
 */
export enum DisplacementType {
  /** No displacement */
  NONE = 'none',
  /** Perlin/simplex noise-based displacement */
  NOISE = 'noise',
  /** Voronoi crack displacement */
  VORONOI_CRACK = 'voronoi_crack',
  /** Wave displacement (sine-based) */
  WAVE = 'wave',
  /** Layered blend of multiple displacement sources */
  LAYERED_BLEND = 'layered_blend',
}

/**
 * A single displacement layer in a surface material descriptor.
 */
export interface DisplacementLayer {
  /** Type of displacement */
  type: DisplacementType;
  /** Amplitude of displacement (world units) */
  amplitude: number;
  /** Frequency of displacement */
  frequency: number;
  /** Number of octaves for noise-based displacement */
  octaves: number;
  /** Lacunarity for FBM noise */
  lacunarity: number;
  /** Persistence/gain for FBM noise */
  persistence: number;
  /** Seed for deterministic noise */
  seed: number;
  /** Direction for wave displacement (normalized) */
  waveDirection?: [number, number, number];
  /** Wave steepness for Gerstner waves */
  waveSteepness?: number;
  /** Voronoi crack width */
  crackWidth?: number;
  /** Voronoi crack depth */
  crackDepth?: number;
  /** Blend weight (for layered blend) */
  weight?: number;
  /** Blend mode for combining with previous layers */
  blendMode?: 'add' | 'multiply' | 'smooth_min' | 'overwrite';
  /** Smooth min k parameter */
  blendK?: number;
}

/**
 * Describes a surface's displacement configuration.
 * Used by the shader compiler to generate compute shader code.
 */
export interface SurfaceMaterialDescriptor {
  /** Unique identifier for this descriptor */
  id: string;
  /** Displacement layers (evaluated in order) */
  layers: DisplacementLayer[];
  /** Base displacement (default 0) */
  baseDisplacement: number;
  /** Scale factor applied to final displacement */
  globalScale: number;
  /** Material type index for material-dependent displacement */
  materialType: number;
  /** Whether to compute normals (default true) */
  computeNormals: boolean;
  /** Epsilon for finite-difference normal computation */
  normalEpsilon: number;
}

/**
 * Default surface material descriptor (no displacement).
 */
export const DEFAULT_SURFACE_DESCRIPTOR: SurfaceMaterialDescriptor = {
  id: 'default',
  layers: [],
  baseDisplacement: 0,
  globalScale: 1.0,
  materialType: 0,
  computeNormals: true,
  normalEpsilon: 0.5,
};

// ============================================================================
// Surface Shader Config
// ============================================================================

export interface SurfaceShaderConfig {
  maxKernelCount: number;
  textureSize: number;
  enableParallelEvaluation: boolean;
  precision: 'highp' | 'mediump' | 'lowp';
}

const DEFAULT_SHADER_CONFIG: SurfaceShaderConfig = {
  maxKernelCount: 32,
  textureSize: 512,
  enableParallelEvaluation: true,
  precision: 'highp',
};

// ============================================================================
// SDF Displacement Uniforms (existing WGSL interface)
// ============================================================================

export interface SDFDisplacementUniforms {
  vertexCount: number;
  gridSizeX: number;
  gridSizeY: number;
  gridSizeZ: number;
  boundsMinX: number;
  boundsMinY: number;
  boundsMinZ: number;
  voxelSizeX: number;
  voxelSizeY: number;
  voxelSizeZ: number;
  displacementScale: number;
  gradientEpsilon: number;
  noiseAmplitude: number;
  noiseFrequency: number;
  materialType: number;
  isoLevel: number;
}

export const DEFAULT_SDF_DISPLACEMENT_UNIFORMS: SDFDisplacementUniforms = {
  vertexCount: 0,
  gridSizeX: 0,
  gridSizeY: 0,
  gridSizeZ: 0,
  boundsMinX: 0,
  boundsMinY: 0,
  boundsMinZ: 0,
  voxelSizeX: 0,
  voxelSizeY: 0,
  voxelSizeZ: 0,
  displacementScale: 1.0,
  gradientEpsilon: 0.5,
  noiseAmplitude: 0.0,
  noiseFrequency: 1.0,
  materialType: 0,
  isoLevel: 0.0,
};

// ============================================================================
// WGSL Surface Displacement Shader (existing)
// ============================================================================

export const SDF_SURFACE_DISPLACEMENT_WGSL = /* wgsl */`

struct Uniforms {
  vertexCount: u32,
  gridSizeX: u32,
  gridSizeY: u32,
  gridSizeZ: u32,
  boundsMinX: f32,
  boundsMinY: f32,
  boundsMinZ: f32,
  voxelSizeX: f32,
  voxelSizeY: f32,
  voxelSizeZ: f32,
  displacementScale: f32,
  gradientEpsilon: f32,
  noiseAmplitude: f32,
  noiseFrequency: f32,
  materialType: u32,
  isoLevel: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> sdfData: array<f32>;
@group(0) @binding(2) var<storage, read> inPositions: array<f32>;
@group(0) @binding(3) var<storage, read> inNormals: array<f32>;
@group(0) @binding(4) var<storage, read_write> outPositions: array<f32>;
@group(0) @binding(5) var<storage, read_write> outNormals: array<f32>;

fn getSafeSDF(gx: i32, gy: i32, gz: i32) -> f32 {
  if (gx < 0 || gy < 0 || gz < 0 ||
      gx >= i32(uniforms.gridSizeX) ||
      gy >= i32(uniforms.gridSizeY) ||
      gz >= i32(uniforms.gridSizeZ)) {
    return 1e6;
  }
  let idx = u32(gz) * uniforms.gridSizeX * uniforms.gridSizeY +
            u32(gy) * uniforms.gridSizeX +
            u32(gx);
  return sdfData[idx];
}

fn sampleSDF(pos: vec3<f32>) -> f32 {
  let fx = (pos.x - uniforms.boundsMinX) / uniforms.voxelSizeX - 0.5;
  let fy = (pos.y - uniforms.boundsMinY) / uniforms.voxelSizeY - 0.5;
  let fz = (pos.z - uniforms.boundsMinZ) / uniforms.voxelSizeZ - 0.5;

  let x0 = i32(floor(fx));
  let y0 = i32(floor(fy));
  let z0 = i32(floor(fz));
  let x1 = x0 + 1;
  let y1 = y0 + 1;
  let z1 = z0 + 1;

  let dx = fx - f32(x0);
  let dy = fy - f32(y0);
  let dz = fz - f32(z0);

  let v000 = getSafeSDF(x0, y0, z0);
  let v100 = getSafeSDF(x1, y0, z0);
  let v010 = getSafeSDF(x0, y1, z0);
  let v110 = getSafeSDF(x1, y1, z0);
  let v001 = getSafeSDF(x0, y0, z1);
  let v101 = getSafeSDF(x1, y0, z1);
  let v011 = getSafeSDF(x0, y1, z1);
  let v111 = getSafeSDF(x1, y1, z1);

  let v00 = mix(v000, v100, dx);
  let v01 = mix(v010, v110, dx);
  let v10 = mix(v001, v101, dx);
  let v11 = mix(v011, v111, dx);

  let v0 = mix(v00, v01, dy);
  let v1 = mix(v10, v11, dy);

  return mix(v0, v1, dz);
}

fn computeGradient(pos: vec3<f32>) -> vec3<f32> {
  let eps = uniforms.gradientEpsilon;
  let dxp = sampleSDF(pos + vec3<f32>(eps, 0.0, 0.0));
  let dxm = sampleSDF(pos - vec3<f32>(eps, 0.0, 0.0));
  let dyp = sampleSDF(pos + vec3<f32>(0.0, eps, 0.0));
  let dym = sampleSDF(pos - vec3<f32>(0.0, eps, 0.0));
  let dzp = sampleSDF(pos + vec3<f32>(0.0, 0.0, eps));
  let dzm = sampleSDF(pos - vec3<f32>(0.0, 0.0, eps));
  let n = vec3<f32>(dxp - dxm, dyp - dym, dzp - dzm);
  let len = length(n);
  if (len < 1e-8) {
    return vec3<f32>(0.0, 1.0, 0.0);
  }
  return n / len;
}

fn hash2(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn valueNoise2D(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);

  let a = hash2(i);
  let b = hash2(i + vec2<f32>(1.0, 0.0));
  let c = hash2(i + vec2<f32>(0.0, 1.0));
  let d = hash2(i + vec2<f32>(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbmNoise2D(p: vec2<f32>) -> f32 {
  var total = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  var pos = p;

  for (var i = 0; i < 4; i++) {
    total += valueNoise2D(pos * freq) * amp;
    freq *= 2.0;
    amp *= 0.5;
    pos = pos + vec2<f32>(1.7, 9.2);
  }

  return total;
}

fn hash3(p: vec3<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.z) * 0.1031);
  p3 = p3 + dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn valueNoise3D(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);

  let n000 = hash3(i + vec3<f32>(0.0, 0.0, 0.0));
  let n100 = hash3(i + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = hash3(i + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = hash3(i + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = hash3(i + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = hash3(i + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = hash3(i + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = hash3(i + vec3<f32>(1.0, 1.0, 1.0));

  let v00 = mix(n000, n100, u.x);
  let v01 = mix(n010, n110, u.x);
  let v10 = mix(n001, n101, u.x);
  let v11 = mix(n011, n111, u.x);

  let v0 = mix(v00, v01, u.y);
  let v1 = mix(v10, v11, u.y);

  return mix(v0, v1, u.z);
}

fn fbmNoise3D(p: vec3<f32>) -> f32 {
  var total = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  var pos = p;

  for (var i = 0; i < 4; i++) {
    total += valueNoise3D(pos * freq) * amp;
    freq *= 2.0;
    amp *= 0.5;
    pos = pos + vec3<f32>(1.7, 9.2, 4.1);
  }

  return total;
}

fn getMaterialDisplacement(pos: vec3<f32>, gradient: vec3<f32>) -> f32 {
  let matType = uniforms.materialType;

  if (matType == 1u) {
    return fbmNoise3D(pos * uniforms.noiseFrequency * 3.0) * 0.7;
  } else if (matType == 2u) {
    return fbmNoise2D(pos.xz * uniforms.noiseFrequency * 0.5) * 0.5;
  } else if (matType == 3u) {
    return fbmNoise3D(pos * uniforms.noiseFrequency * 0.3) * 0.2;
  } else if (matType == 4u) {
    let base = fbmNoise3D(pos * uniforms.noiseFrequency * 2.0) * 0.6;
    let striation = sin(pos.y * 20.0) * 0.05;
    return base + striation;
  }
  return fbmNoise3D(pos * uniforms.noiseFrequency) * 0.5;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let vertexIdx = gid.x;
  if (vertexIdx >= uniforms.vertexCount) {
    return;
  }

  let inBase = vertexIdx * 3u;
  let pos = vec3<f32>(
    inPositions[inBase],
    inPositions[inBase + 1u],
    inPositions[inBase + 2u]
  );

  let sdfValue = sampleSDF(pos);
  let gradient = computeGradient(pos);

  var displacedPos = pos - (sdfValue - uniforms.isoLevel) * gradient * uniforms.displacementScale;

  if (uniforms.noiseAmplitude > 0.0) {
    let noiseDisp = getMaterialDisplacement(displacedPos, gradient);
    displacedPos = displacedPos + gradient * noiseDisp * uniforms.noiseAmplitude;
  }

  outPositions[inBase]      = displacedPos.x;
  outPositions[inBase + 1u] = displacedPos.y;
  outPositions[inBase + 2u] = displacedPos.z;

  let newGradient = computeGradient(displacedPos);
  outNormals[inBase]      = newGradient.x;
  outNormals[inBase + 1u] = newGradient.y;
  outNormals[inBase + 2u] = newGradient.z;
}
`;

// ============================================================================
// WGSL Surface Displacement Shader (dynamic compilation)
// ============================================================================

/**
 * WGSL noise functions library for surface displacement shaders.
 * These mirror the TypeScript NoiseUtils implementations.
 */
const WGSL_NOISE_FUNCTIONS = /* wgsl */`
// ============================================================================
// Surface Noise Functions (WGSL)
// ============================================================================

fn hash_f2(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn hash_f3(p: vec3<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.z) * 0.1031);
  p3 = p3 + dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn perlin2D(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash_f2(i);
  let b = hash_f2(i + vec2<f32>(1.0, 0.0));
  let c = hash_f2(i + vec2<f32>(0.0, 1.0));
  let d = hash_f2(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

fn perlin3D(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash_f3(i);
  let n100 = hash_f3(i + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = hash_f3(i + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = hash_f3(i + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = hash_f3(i + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = hash_f3(i + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = hash_f3(i + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = hash_f3(i + vec3<f32>(1.0, 1.0, 1.0));
  let v00 = mix(n000, n100, u.x);
  let v01 = mix(n010, n110, u.x);
  let v10 = mix(n001, n101, u.x);
  let v11 = mix(n011, n111, u.x);
  let v0 = mix(v00, v01, u.y);
  let v1 = mix(v10, v11, u.y);
  return mix(v0, v1, u.z) * 2.0 - 1.0;
}

fn fbm2D(p: vec2<f32>, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
  var total = 0.0;
  var amp = 1.0;
  var freq = 1.0;
  var maxVal = 0.0;
  var pos = p;
  for (var i = 0; i < octaves; i++) {
    total += perlin2D(pos * freq) * amp;
    maxVal += amp;
    amp *= persistence;
    freq *= lacunarity;
    pos = pos + vec2<f32>(1.7, 9.2);
  }
  return total / maxVal;
}

fn fbm3D(p: vec3<f32>, octaves: i32, lacunarity: f32, persistence: f32) -> f32 {
  var total = 0.0;
  var amp = 1.0;
  var freq = 1.0;
  var maxVal = 0.0;
  var pos = p;
  for (var i = 0; i < octaves; i++) {
    total += perlin3D(pos * freq) * amp;
    maxVal += amp;
    amp *= persistence;
    freq *= lacunarity;
    pos = pos + vec3<f32>(1.7, 9.2, 4.1);
  }
  return total / maxVal;
}

// Voronoi noise (2D)
fn voronoi2D(p: vec2<f32>) -> f32 {
  let cellX = floor(p.x);
  let cellY = floor(p.y);
  var minDist = 1e6;
  for (var dx = -1; dx <= 1; dx++) {
    for (var dy = -1; dy <= 1; dy++) {
      let nx = cellX + f32(dx);
      let ny = cellY + f32(dy);
      let fp = vec2<f32>(hash_f2(vec2<f32>(nx, ny)), hash_f2(vec2<f32>(nx + 31.0, ny + 17.0)));
      let diff = vec2<f32>(p.x - nx - fp.x, p.y - ny - fp.y);
      minDist = min(minDist, length(diff));
    }
  }
  return minDist;
}

// Voronoi crack displacement
fn voronoiCrack(p: vec3<f32>, width: f32, depth: f32, freq: f32) -> f32 {
  let d = voronoi2D(p.xz * freq);
  let crack = 1.0 - smoothstep(0.0, width, d);
  return crack * depth;
}

// Gerstner wave displacement
fn gerstnerWave(p: vec3<f32>, dir: vec2<f32>, steepness: f32, wavelength: f32) -> vec3<f32> {
  let k = 6.28318 / wavelength;
  let c = sqrt(9.81 / k);
  let f = k * (dot(dir, p.xz) - c * 0.0); // time=0 for static
  let a = steepness / k;
  return vec3<f32>(
    dir.x * a * cos(f),
    a * sin(f),
    dir.y * a * cos(f)
  );
}

// Smooth min (polynomial)
fn smoothMin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp((b - a + k) / (2.0 * k), 0.0, 1.0);
  return b + (a - b) * h - k * h * (1.0 - h);
}
`;

/**
 * Uniform struct for the surface displacement compute shader.
 */
const SURFACE_UNIFORM_STRUCT = /* wgsl */`
struct SurfaceUniforms {
  vertexCount: u32,
  materialType: u32,
  globalScale: f32,
  normalEpsilon: f32,
  layerCount: u32,
  baseDisplacement: f32,
  padding0: f32,
  padding1: f32,
};
`;

/**
 * Layer parameter struct for the surface displacement compute shader.
 */
const SURFACE_LAYER_STRUCT = /* wgsl */`
struct DisplacementLayerData {
  layerType: u32,     // DisplacementType as u32
  amplitude: f32,
  frequency: f32,
  octaves: u32,
  lacunarity: f32,
  persistence: f32,
  seed: f32,
  weight: f32,
  blendMode: u32,     // 0=add, 1=multiply, 2=smooth_min, 3=overwrite
  blendK: f32,
  waveDirX: f32,
  waveDirZ: f32,
  waveSteepness: f32,
  crackWidth: f32,
  crackDepth: f32,
  padding0: f32,
  padding1: f32,
};
`;

// ============================================================================
// compileSurfaceToShader
// ============================================================================

/**
 * Compile a SurfaceMaterialDescriptor to a WGSL compute shader.
 *
 * The generated shader evaluates all displacement layers in order,
 * combining them with the specified blend modes, and optionally
 * computing surface normals via finite differences.
 *
 * @param descriptor - The surface material descriptor to compile
 * @returns WGSL compute shader code string
 */
export function compileSurfaceToShader(descriptor: SurfaceMaterialDescriptor): string {
  const layerEvaluators: string[] = [];

  // Generate displacement evaluation code for each layer
  for (let i = 0; i < descriptor.layers.length; i++) {
    const layer = descriptor.layers[i];
    const layerVar = `layer_${i}`;

    switch (layer.type) {
      case DisplacementType.NOISE:
        layerEvaluators.push(`
      // Layer ${i}: Noise displacement
      {
        let freq = layers[${i}].frequency;
        let amp = layers[${i}].amplitude;
        let oct = i32(layers[${i}].octaves);
        let lac = layers[${i}].lacunarity;
        let per = layers[${i}].persistence;
        let seed = layers[${i}].seed;
        let noiseVal = fbm3D(pos * freq + vec3<f32>(seed, seed * 2.0, seed * 3.0), oct, lac, per);
        let ${layerVar} = noiseVal * amp;
        totalDisp = applyBlend(totalDisp, ${layerVar}, layers[${i}].blendMode, layers[${i}].blendK, layers[${i}].weight);
      }`);

      case DisplacementType.VORONOI_CRACK:
        layerEvaluators.push(`
      // Layer ${i}: Voronoi crack displacement
      {
        let freq = layers[${i}].frequency;
        let amp = layers[${i}].amplitude;
        let cw = layers[${i}].crackWidth;
        let cd = layers[${i}].crackDepth;
        let crackDisp = voronoiCrack(pos, cw, cd, freq) * amp;
        let ${layerVar} = crackDisp;
        totalDisp = applyBlend(totalDisp, ${layerVar}, layers[${i}].blendMode, layers[${i}].blendK, layers[${i}].weight);
      }`);
        break;

      case DisplacementType.WAVE:
        layerEvaluators.push(`
      // Layer ${i}: Wave displacement
      {
        let amp = layers[${i}].amplitude;
        let steepness = layers[${i}].waveSteepness;
        let waveDir = vec2<f32>(layers[${i}].waveDirX, layers[${i}].waveDirZ);
        let waveDisp = gerstnerWave(pos, waveDir, steepness, 1.0 / layers[${i}].frequency);
        let ${layerVar} = waveDisp.y * amp;
        totalDisp = applyBlend(totalDisp, ${layerVar}, layers[${i}].blendMode, layers[${i}].blendK, layers[${i}].weight);
      }`);
        break;

      case DisplacementType.LAYERED_BLEND:
        layerEvaluators.push(`
      // Layer ${i}: Layered blend (weighted sum of noise frequencies)
      {
        let freq = layers[${i}].frequency;
        let amp = layers[${i}].amplitude;
        let oct = i32(layers[${i}].octaves);
        let lac = layers[${i}].lacunarity;
        let per = layers[${i}].persistence;
        let seed = layers[${i}].seed;
        var blendVal = fbm3D(pos * freq + vec3<f32>(seed, seed * 2.0, seed * 3.0), oct, lac, per);
        // Add secondary frequency
        blendVal += fbm3D(pos * freq * 3.0 + vec3<f32>(seed + 50.0, seed + 100.0, seed + 150.0), max(1, oct - 2), lac, per) * 0.3;
        let ${layerVar} = blendVal * amp;
        totalDisp = applyBlend(totalDisp, ${layerVar}, layers[${i}].blendMode, layers[${i}].blendK, layers[${i}].weight);
      }`);
        break;

      case DisplacementType.NONE:
      default:
        // No displacement for this layer
        break;
    }
  }

  // Generate the full compute shader
  const shader = /* wgsl */`
${SURFACE_UNIFORM_STRUCT}
${SURFACE_LAYER_STRUCT}
${WGSL_NOISE_FUNCTIONS}

@group(0) @binding(0) var<uniform> uniforms: SurfaceUniforms;
@group(0) @binding(1) var<storage, read> layers: array<DisplacementLayerData>;
@group(0) @binding(2) var<storage, read> inPositions: array<f32>;
@group(0) @binding(3) var<storage, read> inNormals: array<f32>;
@group(0) @binding(4) var<storage, read_write> outPositions: array<f32>;
@group(0) @binding(5) var<storage, read_write> outNormals: array<f32>;

fn applyBlend(current: f32, layerVal: f32, blendMode: u32, blendK: f32, weight: f32) -> f32 {
  let weighted = layerVal * weight;
  if (blendMode == 0u) {
    // Add
    return current + weighted;
  } else if (blendMode == 1u) {
    // Multiply
    return current * (1.0 + weighted);
  } else if (blendMode == 2u) {
    // Smooth min
    return smoothMin(current, weighted, blendK);
  } else if (blendMode == 3u) {
    // Overwrite
    return weighted;
  }
  return current + weighted;
}

fn evaluateDisplacement(pos: vec3<f32>) -> f32 {
  var totalDisp = uniforms.baseDisplacement;
  ${layerEvaluators.join('\n')}
  return totalDisp * uniforms.globalScale;
}

// Compute normal via finite differences of the displacement field
fn computeDisplacedNormal(pos: vec3<f32>) -> vec3<f32> {
  let eps = uniforms.normalEpsilon;
  let originalNormal = vec3<f32>(
    inNormals[0u], // We'll compute from displacement instead
    1.0,
    0.0
  );

  // Sample displacement at offset positions
  let d0 = evaluateDisplacement(pos);
  let dxp = evaluateDisplacement(pos + vec3<f32>(eps, 0.0, 0.0));
  let dxm = evaluateDisplacement(pos - vec3<f32>(eps, 0.0, 0.0));
  let dyp = evaluateDisplacement(pos + vec3<f32>(0.0, eps, 0.0));
  let dym = evaluateDisplacement(pos - vec3<f32>(0.0, eps, 0.0));
  let dzp = evaluateDisplacement(pos + vec3<f32>(0.0, 0.0, eps));
  let dzm = evaluateDisplacement(pos - vec3<f32>(0.0, 0.0, eps));

  let gradient = vec3<f32>(
    (dxp - dxm) / (2.0 * eps),
    (dyp - dym) / (2.0 * eps),
    (dzp - dzm) / (2.0 * eps)
  );

  // Normal = original normal - gradient (displace along normal, gradient is in tangent space)
  let n = vec3<f32>(0.0, 1.0, 0.0) - gradient;
  let len = length(n);
  if (len < 1e-8) {
    return vec3<f32>(0.0, 1.0, 0.0);
  }
  return n / len;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let vertexIdx = gid.x;
  if (vertexIdx >= uniforms.vertexCount) {
    return;
  }

  let inBase = vertexIdx * 3u;
  let pos = vec3<f32>(
    inPositions[inBase],
    inPositions[inBase + 1u],
    inPositions[inBase + 2u]
  );

  // Evaluate displacement
  let displacement = evaluateDisplacement(pos);

  // Get input normal
  let normal = vec3<f32>(
    inNormals[inBase],
    inNormals[inBase + 1u],
    inNormals[inBase + 2u]
  );

  // Apply displacement along normal direction
  let displacedPos = pos + normal * displacement;

  // Write output position
  outPositions[inBase]      = displacedPos.x;
  outPositions[inBase + 1u] = displacedPos.y;
  outPositions[inBase + 2u] = displacedPos.z;

  // Compute and write output normal
  if (uniforms.materialType > 0u) {
    let newNormal = computeDisplacedNormal(pos);
    outNormals[inBase]      = newNormal.x;
    outNormals[inBase + 1u] = newNormal.y;
    outNormals[inBase + 2u] = newNormal.z;
  } else {
    outNormals[inBase]      = normal.x;
    outNormals[inBase + 1u] = normal.y;
    outNormals[inBase + 2u] = normal.z;
  }
}
`;

  return shader;
}

// ============================================================================
// GPU Buffer Management
// ============================================================================

/**
 * Manages GPU buffer lifecycle for compute shader dispatch.
 * Handles creation, updating, and destruction of GPU buffers.
 */
class GPUBufferManager {
  private device: GPUDevice | null = null;
  private buffers: Map<string, GPUBuffer> = new Map();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Create or update a GPU buffer with the given data.
   */
  createOrUpdateBuffer(
    name: string,
    data: ArrayBuffer | SharedArrayBuffer,
    usage: GPUBufferUsageFlags
  ): GPUBuffer | null {
    if (!this.device) return null;

    // Destroy existing buffer if present
    this.destroyBuffer(name);

    const byteSize = data.byteLength;
    const buffer = this.device.createBuffer({
      size: byteSize,
      usage,
      mappedAtCreation: true,
    });

    // Copy data to buffer
    const mappedRange = buffer.getMappedRange();
    new Uint8Array(mappedRange).set(new Uint8Array(data));
    buffer.unmap();

    this.buffers.set(name, buffer);
    return buffer;
  }

  /**
   * Create a GPU buffer for readback.
   */
  createReadbackBuffer(name: string, size: number): GPUBuffer | null {
    if (!this.device) return null;

    this.destroyBuffer(name);

    const buffer = this.device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.buffers.set(name, buffer);
    return buffer;
  }

  /**
   * Get a buffer by name.
   */
  getBuffer(name: string): GPUBuffer | undefined {
    return this.buffers.get(name);
  }

  /**
   * Destroy a specific buffer.
   */
  destroyBuffer(name: string): void {
    const buffer = this.buffers.get(name);
    if (buffer) {
      buffer.destroy();
      this.buffers.delete(name);
    }
  }

  /**
   * Destroy all managed buffers.
   */
  destroyAll(): void {
    for (const buffer of this.buffers.values()) {
      buffer.destroy();
    }
    this.buffers.clear();
  }
}

// ============================================================================
// GPUSurfaceShaderDispatcher
// ============================================================================

/**
 * GPU Surface Shader Dispatcher.
 *
 * Takes a SurfaceMaterialDescriptor and compiles its displacement configuration
 * to a compute shader. Uses WebGPU compute pipeline when available, falls back
 * to CPU evaluation.
 *
 * Lifecycle:
 * 1. Construct with optional WebGPU device
 * 2. Call `compile(descriptor)` to create the compute pipeline
 * 3. Call `dispatch(positions, normals, params)` to evaluate displacement
 * 4. Call `readResults()` to get displaced positions/normals
 * 5. Call `dispose()` to clean up GPU resources
 */
export class GPUSurfaceShaderDispatcher {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private bufferManager: GPUBufferManager | null = null;
  private compiledDescriptor: SurfaceMaterialDescriptor | null = null;
  private compiledShader: string | '';
  private vertexCount: number = 0;
  private outputPositions: Float32Array = new Float32Array(0);
  private outputNormals: Float32Array = new Float32Array(0);

  // CPU fallback state
  private cpuNoiseGenerators: Map<number, NoiseUtils> = new Map();

  constructor(device?: GPUDevice) {
    if (device) {
      this.device = device;
      this.bufferManager = new GPUBufferManager(device);
    }
  }

  /**
   * Check if WebGPU is available for compute dispatch.
   */
  isGPUAvailable(): boolean {
    return this.device !== null;
  }

  /**
   * Compile a SurfaceMaterialDescriptor into a GPU compute pipeline.
   *
   * @param descriptor - The surface material descriptor
   * @returns The compiled WGSL shader code (for inspection/debugging)
   */
  compile(descriptor: SurfaceMaterialDescriptor): string {
    this.compiledDescriptor = descriptor;

    // Compile descriptor to WGSL shader
    this.compiledShader = compileSurfaceToShader(descriptor);

    // Create GPU compute pipeline if device is available
    if (this.device) {
      try {
        const shaderModule = this.device.createShaderModule({
          code: this.compiledShader,
        });

        // Check for compilation errors
        shaderModule.getCompilationInfo().then((info) => {
          for (const message of info.messages) {
            if (message.type === 'error') {
              console.error(`Shader compilation error: ${message.message}`);
            }
          }
        });

        this.pipeline = this.device.createComputePipeline({
          layout: 'auto',
          compute: {
            module: shaderModule,
            entryPoint: 'main',
          },
        });
      } catch (e) {
        console.warn('Failed to create GPU compute pipeline, will use CPU fallback:', e);
        this.pipeline = null;
      }
    }

    // Prepare CPU fallback noise generators
    this.cpuNoiseGenerators.clear();
    for (let i = 0; i < descriptor.layers.length; i++) {
      const layer = descriptor.layers[i];
      if (!this.cpuNoiseGenerators.has(layer.seed)) {
        this.cpuNoiseGenerators.set(layer.seed, new NoiseUtils(layer.seed));
      }
    }

    return this.compiledShader;
  }

  /**
   * Dispatch the surface compute shader.
   *
   * @param positions - Input vertex positions (flat Float32Array, 3 floats per vertex)
   * @param normals - Input vertex normals (flat Float32Array, 3 floats per vertex)
   * @param params - Dispatch parameters
   * @returns Displaced positions and normals
   */
  async dispatch(
    positions: Float32Array,
    normals: Float32Array,
    params: {
      vertexCount?: number;
      globalScale?: number;
      normalEpsilon?: number;
    } = {}
  ): Promise<{ positions: Float32Array; normals: Float32Array }> {
    const vertexCount = params.vertexCount ?? Math.floor(positions.length / 3);

    if (!this.compiledDescriptor) {
      throw new Error('No descriptor compiled. Call compile() first.');
    }

    // Use GPU if available and pipeline was created
    if (this.device && this.pipeline && this.bufferManager) {
      return this.dispatchGPU(positions, normals, vertexCount, params);
    }

    // CPU fallback
    return this.dispatchCPU(positions, normals, vertexCount, params);
  }

  // --------------------------------------------------------------------------
  // GPU Dispatch
  // --------------------------------------------------------------------------

  /**
   * Execute the compute shader on GPU via WebGPU.
   */
  private async dispatchGPU(
    positions: Float32Array,
    normals: Float32Array,
    vertexCount: number,
    params: { globalScale?: number; normalEpsilon?: number }
  ): Promise<{ positions: Float32Array; normals: Float32Array }> {
    if (!this.device || !this.pipeline || !this.bufferManager) {
      throw new Error('GPU not available');
    }

    const descriptor = this.compiledDescriptor!;

    // Create uniform buffer
    const uniformData = new ArrayBuffer(48); // SurfaceUniforms size (aligned to 16 bytes)
    const uniformView = new DataView(uniformData);
    uniformView.setUint32(0, vertexCount, true);
    uniformView.setUint32(4, descriptor.materialType, true);
    uniformView.setFloat32(8, params.globalScale ?? descriptor.globalScale, true);
    uniformView.setFloat32(12, params.normalEpsilon ?? descriptor.normalEpsilon, true);
    uniformView.setUint32(16, descriptor.layers.length, true);
    uniformView.setFloat32(20, descriptor.baseDisplacement, true);
    // padding at 24, 28, 32

    this.bufferManager.createOrUpdateBuffer(
      'uniforms',
      uniformData,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    );

    // Create layer data buffer
    const LAYER_SIZE = 80; // DisplacementLayerData struct size (20 floats = 80 bytes, aligned)
    const layerDataSize = descriptor.layers.length * LAYER_SIZE;
    const layerData = new ArrayBuffer(layerDataSize);
    const layerView = new DataView(layerData);

    for (let i = 0; i < descriptor.layers.length; i++) {
      const layer = descriptor.layers[i];
      const offset = i * LAYER_SIZE;

      layerView.setUint32(offset + 0, layerTypeToUint(layer.type), true);
      layerView.setFloat32(offset + 4, layer.amplitude, true);
      layerView.setFloat32(offset + 8, layer.frequency, true);
      layerView.setUint32(offset + 12, layer.octaves, true);
      layerView.setFloat32(offset + 16, layer.lacunarity, true);
      layerView.setFloat32(offset + 20, layer.persistence, true);
      layerView.setFloat32(offset + 24, layer.seed, true);
      layerView.setFloat32(offset + 28, layer.weight ?? 1.0, true);
      layerView.setUint32(offset + 32, blendModeToUint(layer.blendMode), true);
      layerView.setFloat32(offset + 36, layer.blendK ?? 0.5, true);
      layerView.setFloat32(offset + 40, layer.waveDirection?.[0] ?? 1.0, true);
      layerView.setFloat32(offset + 44, layer.waveDirection?.[2] ?? 0.0, true);
      layerView.setFloat32(offset + 48, layer.waveSteepness ?? 0.5, true);
      layerView.setFloat32(offset + 52, layer.crackWidth ?? 0.1, true);
      layerView.setFloat32(offset + 56, layer.crackDepth ?? 0.5, true);
    }

    this.bufferManager.createOrUpdateBuffer(
      'layers',
      layerData,
      GPUBufferUsage.STORAGE
    );

    // Create input position buffer
    this.bufferManager.createOrUpdateBuffer(
      'inPositions',
      positions.buffer,
      GPUBufferUsage.STORAGE
    );

    // Create input normals buffer
    this.bufferManager.createOrUpdateBuffer(
      'inNormals',
      normals.buffer,
      GPUBufferUsage.STORAGE
    );

    // Create output buffers
    const outPositionBuffer = this.bufferManager.createOrUpdateBuffer(
      'outPositions',
      new ArrayBuffer(positions.byteLength),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    );

    const outNormalBuffer = this.bufferManager.createOrUpdateBuffer(
      'outNormals',
      new ArrayBuffer(normals.byteLength),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    );

    // Create readback buffers
    const readbackPosBuffer = this.bufferManager.createReadbackBuffer(
      'readbackPos',
      positions.byteLength
    );
    const readbackNormBuffer = this.bufferManager.createReadbackBuffer(
      'readbackNorm',
      normals.byteLength
    );

    // Get buffers
    const uniformBuffer = this.bufferManager.getBuffer('uniforms')!;
    const layerBuffer = this.bufferManager.getBuffer('layers')!;
    const inPosBuffer = this.bufferManager.getBuffer('inPositions')!;
    const inNormBuffer = this.bufferManager.getBuffer('inNormals')!;

    // Create bind group
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: layerBuffer } },
        { binding: 2, resource: { buffer: inPosBuffer } },
        { binding: 3, resource: { buffer: inNormBuffer } },
        { binding: 4, resource: { buffer: outPositionBuffer! } },
        { binding: 5, resource: { buffer: outNormalBuffer! } },
      ],
    });

    // Encode and submit commands
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);

    // Dispatch with workgroup size 64
    const workgroupCount = Math.ceil(vertexCount / 64);
    passEncoder.dispatchWorkgroups(workgroupCount);
    passEncoder.end();

    // Copy results to readback buffers
    commandEncoder.copyBufferToBuffer(
      outPositionBuffer!, 0, readbackPosBuffer!, 0, positions.byteLength
    );
    commandEncoder.copyBufferToBuffer(
      outNormalBuffer!, 0, readbackNormBuffer!, 0, normals.byteLength
    );

    this.device.queue.submit([commandEncoder.finish()]);

    // Read back results
    await readbackPosBuffer!.mapAsync(GPUMapMode.READ);
    await readbackNormBuffer!.mapAsync(GPUMapMode.READ);

    const outPositions = new Float32Array(readbackPosBuffer!.getMappedRange().slice(0));
    const outNormals = new Float32Array(readbackNormBuffer!.getMappedRange().slice(0));

    readbackPosBuffer!.unmap();
    readbackNormBuffer!.unmap();

    this.outputPositions = outPositions;
    this.outputNormals = outNormals;
    this.vertexCount = vertexCount;

    return { positions: outPositions, normals: outNormals };
  }

  // --------------------------------------------------------------------------
  // CPU Fallback Dispatch
  // --------------------------------------------------------------------------

  /**
   * Evaluate surface displacement on CPU using NoiseUtils.
   * Used when WebGPU is not available.
   */
  private dispatchCPU(
    positions: Float32Array,
    normals: Float32Array,
    vertexCount: number,
    params: { globalScale?: number; normalEpsilon?: number }
  ): { positions: Float32Array; normals: Float32Array } {
    const descriptor = this.compiledDescriptor!;
    const globalScale = params.globalScale ?? descriptor.globalScale;
    const normalEpsilon = params.normalEpsilon ?? descriptor.normalEpsilon;

    const outPositions = new Float32Array(positions.length);
    const outNormals = new Float32Array(normals.length);

    for (let v = 0; v < vertexCount; v++) {
      const baseIdx = v * 3;
      const px = positions[baseIdx];
      const py = positions[baseIdx + 1];
      const pz = positions[baseIdx + 2];

      const nx = normals[baseIdx];
      const ny = normals[baseIdx + 1];
      const nz = normals[baseIdx + 2];

      // Evaluate displacement
      const displacement = this.evaluateCPUDisplacement(px, py, pz, descriptor);

      // Apply displacement along normal
      const displacedX = px + nx * displacement * globalScale;
      const displacedY = py + ny * displacement * globalScale;
      const displacedZ = pz + nz * displacement * globalScale;

      outPositions[baseIdx] = displacedX;
      outPositions[baseIdx + 1] = displacedY;
      outPositions[baseIdx + 2] = displacedZ;

      // Compute displaced normal via finite differences if needed
      if (descriptor.computeNormals) {
        const eps = normalEpsilon;

        const d0 = this.evaluateCPUDisplacement(px, py, pz, descriptor);
        const dxp = this.evaluateCPUDisplacement(px + eps, py, pz, descriptor);
        const dxm = this.evaluateCPUDisplacement(px - eps, py, pz, descriptor);
        const dyp = this.evaluateCPUDisplacement(px, py + eps, pz, descriptor);
        const dym = this.evaluateCPUDisplacement(px, py - eps, pz, descriptor);
        const dzp = this.evaluateCPUDisplacement(px, py, pz + eps, descriptor);
        const dzm = this.evaluateCPUDisplacement(px, py, pz - eps, descriptor);

        const gradX = (dxp - dxm) / (2 * eps);
        const gradY = (dyp - dym) / (2 * eps);
        const gradZ = (dzp - dzm) / (2 * eps);

        // N = original_normal - gradient (project gradient onto tangent space)
        let newNx = nx - gradX;
        let newNy = ny - gradY;
        let newNz = nz - gradZ;

        const len = Math.sqrt(newNx * newNx + newNy * newNy + newNz * newNz);
        if (len > 1e-8) {
          newNx /= len;
          newNy /= len;
          newNz /= len;
        } else {
          newNx = nx;
          newNy = ny;
          newNz = nz;
        }

        outNormals[baseIdx] = newNx;
        outNormals[baseIdx + 1] = newNy;
        outNormals[baseIdx + 2] = newNz;
      } else {
        outNormals[baseIdx] = nx;
        outNormals[baseIdx + 1] = ny;
        outNormals[baseIdx + 2] = nz;
      }
    }

    this.outputPositions = outPositions;
    this.outputNormals = outNormals;
    this.vertexCount = vertexCount;

    return { positions: outPositions, normals: outNormals };
  }

  /**
   * Evaluate displacement for a single point on CPU.
   */
  private evaluateCPUDisplacement(
    x: number, y: number, z: number,
    descriptor: SurfaceMaterialDescriptor
  ): number {
    let totalDisp = descriptor.baseDisplacement;

    for (const layer of descriptor.layers) {
      const noise = this.cpuNoiseGenerators.get(layer.seed) ?? new NoiseUtils(layer.seed);
      let layerDisp = 0;

      switch (layer.type) {
        case DisplacementType.NOISE: {
          layerDisp = noise.fbm(
            x * layer.frequency + layer.seed,
            y * layer.frequency + layer.seed * 2,
            z * layer.frequency + layer.seed * 3,
            layer.octaves
          ) * layer.amplitude;
          break;
        }

        case DisplacementType.VORONOI_CRACK: {
          const voronoiGen = new SeededNoiseGenerator(layer.seed);
          const voronoiVal = voronoiGen.voronoi2D(
            x * layer.frequency,
            z * layer.frequency,
            1.0
          );
          const crackWidth = layer.crackWidth ?? 0.1;
          const crackDepth = layer.crackDepth ?? 0.5;
          const crackFactor = Math.max(0, 1.0 - voronoiVal / crackWidth);
          layerDisp = crackFactor * crackDepth * layer.amplitude;
          break;
        }

        case DisplacementType.WAVE: {
          const dirX = layer.waveDirection?.[0] ?? 1.0;
          const dirZ = layer.waveDirection?.[2] ?? 0.0;
          const steepness = layer.waveSteepness ?? 0.5;
          const wavelength = 1.0 / layer.frequency;
          const k = (2 * Math.PI) / wavelength;
          const c = Math.sqrt(9.81 / k);
          const f = k * (dirX * x + dirZ * z - c * 0);
          const a = steepness / k;
          layerDisp = a * Math.sin(f) * layer.amplitude;
          break;
        }

        case DisplacementType.LAYERED_BLEND: {
          // Primary frequency
          const primary = noise.fbm(
            x * layer.frequency + layer.seed,
            y * layer.frequency + layer.seed * 2,
            z * layer.frequency + layer.seed * 3,
            layer.octaves
          );
          // Secondary frequency
          const secondary = noise.fbm(
            x * layer.frequency * 3 + layer.seed + 50,
            y * layer.frequency * 3 + layer.seed + 100,
            z * layer.frequency * 3 + layer.seed + 150,
            Math.max(1, layer.octaves - 2)
          ) * 0.3;
          layerDisp = (primary + secondary) * layer.amplitude;
          break;
        }

        case DisplacementType.NONE:
        default:
          break;
      }

      // Apply blend mode
      const weight = layer.weight ?? 1.0;
      const blendMode = layer.blendMode ?? 'add';
      const blendK = layer.blendK ?? 0.5;

      switch (blendMode) {
        case 'add':
          totalDisp += layerDisp * weight;
          break;
        case 'multiply':
          totalDisp *= (1.0 + layerDisp * weight);
          break;
        case 'smooth_min':
          totalDisp = smoothMinCPU(totalDisp, layerDisp * weight, blendK);
          break;
        case 'overwrite':
          totalDisp = layerDisp * weight;
          break;
      }
    }

    return totalDisp;
  }

  // --------------------------------------------------------------------------
  // Results
  // --------------------------------------------------------------------------

  /**
   * Get the last dispatch results.
   */
  getResults(): { positions: Float32Array; normals: Float32Array } {
    return {
      positions: this.outputPositions,
      normals: this.outputNormals,
    };
  }

  /**
   * Get the compiled WGSL shader code.
   */
  getShaderCode(): string {
    return this.compiledShader;
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Dispose all GPU resources.
   */
  dispose(): void {
    if (this.bufferManager) {
      this.bufferManager.destroyAll();
    }
    this.pipeline = null;
    this.bindGroup = null;
    this.compiledDescriptor = null;
    this.compiledShader = '';
    this.cpuNoiseGenerators.clear();
    this.outputPositions = new Float32Array(0);
    this.outputNormals = new Float32Array(0);
  }
}

// ============================================================================
// dispatchSurfaceCompute (standalone function)
// ============================================================================

/**
 * Execute a surface compute shader on GPU.
 *
 * Creates GPU buffers from position data, creates uniform buffer for shader
 * parameters, dispatches compute, and reads back results.
 *
 * @param pipeline - Pre-compiled GPU compute pipeline
 * @param positions - Input vertex positions
 * @param params - Shader parameters (uniforms)
 * @param device - WebGPU device
 * @returns Displaced positions and normals
 */
export async function dispatchSurfaceCompute(
  pipeline: GPUComputePipeline,
  positions: Float32Array,
  params: {
    normals?: Float32Array;
    sdfData?: Float32Array;
    gridSize?: [number, number, number];
    bounds?: { min: [number, number, number]; max: [number, number, number] };
    displacementScale?: number;
    noiseAmplitude?: number;
    noiseFrequency?: number;
    materialType?: number;
    normalEpsilon?: number;
  },
  device: GPUDevice
): Promise<{ positions: Float32Array; normals: Float32Array }> {
  const vertexCount = Math.floor(positions.length / 3);
  const normals = params.normals ?? new Float32Array(positions.length).fill(0);
  // Set default normals to (0,1,0) if not provided
  if (!params.normals) {
    for (let i = 0; i < vertexCount; i++) {
      normals[i * 3 + 1] = 1.0;
    }
  }

  // Create buffer manager
  const bufferMgr = new GPUBufferManager(device);

  try {
    // Create input position buffer
    bufferMgr.createOrUpdateBuffer(
      'inPositions',
      positions.buffer,
      GPUBufferUsage.STORAGE
    );

    // Create input normals buffer
    bufferMgr.createOrUpdateBuffer(
      'inNormals',
      normals.buffer,
      GPUBufferUsage.STORAGE
    );

    // Create output buffers
    bufferMgr.createOrUpdateBuffer(
      'outPositions',
      new ArrayBuffer(positions.byteLength),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    );
    bufferMgr.createOrUpdateBuffer(
      'outNormals',
      new ArrayBuffer(normals.byteLength),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    );

    // Create SDF data buffer if provided
    if (params.sdfData) {
      bufferMgr.createOrUpdateBuffer(
        'sdfData',
        params.sdfData.buffer,
        GPUBufferUsage.STORAGE
      );
    }

    // Create uniform buffer (SDFDisplacementUniforms format)
    const uniformData = new ArrayBuffer(64);
    const view = new DataView(uniformData);
    view.setUint32(0, vertexCount, true);
    view.setUint32(4, params.gridSize?.[0] ?? 0, true);
    view.setUint32(8, params.gridSize?.[1] ?? 0, true);
    view.setUint32(12, params.gridSize?.[2] ?? 0, true);
    view.setFloat32(16, params.bounds?.min[0] ?? 0, true);
    view.setFloat32(20, params.bounds?.min[1] ?? 0, true);
    view.setFloat32(24, params.bounds?.min[2] ?? 0, true);
    view.setFloat32(28, 1.0, true); // voxelSizeX
    view.setFloat32(32, 1.0, true); // voxelSizeY
    view.setFloat32(36, 1.0, true); // voxelSizeZ
    view.setFloat32(40, params.displacementScale ?? 1.0, true);
    view.setFloat32(44, params.normalEpsilon ?? 0.5, true);
    view.setFloat32(48, params.noiseAmplitude ?? 0.0, true);
    view.setFloat32(52, params.noiseFrequency ?? 1.0, true);
    view.setUint32(56, params.materialType ?? 0, true);
    view.setFloat32(60, 0.0, true); // isoLevel

    bufferMgr.createOrUpdateBuffer(
      'uniforms',
      uniformData,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    );

    // Create readback buffers
    bufferMgr.createReadbackBuffer('readbackPos', positions.byteLength);
    bufferMgr.createReadbackBuffer('readbackNorm', normals.byteLength);

    // Get all buffers
    const uniformBuffer = bufferMgr.getBuffer('uniforms')!;
    const sdfBuffer = bufferMgr.getBuffer('sdfData');
    const inPosBuffer = bufferMgr.getBuffer('inPositions')!;
    const inNormBuffer = bufferMgr.getBuffer('inNormals')!;
    const outPosBuffer = bufferMgr.getBuffer('outPositions')!;
    const outNormBuffer = bufferMgr.getBuffer('outNormals')!;

    // Create bind group
    const bindGroupEntries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: uniformBuffer } },
    ];

    if (sdfBuffer) {
      bindGroupEntries.push({ binding: 1, resource: { buffer: sdfBuffer } });
    }

    bindGroupEntries.push(
      { binding: 2, resource: { buffer: inPosBuffer } },
      { binding: 3, resource: { buffer: inNormBuffer } },
      { binding: 4, resource: { buffer: outPosBuffer } },
      { binding: 5, resource: { buffer: outNormBuffer } }
    );

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: bindGroupEntries,
    });

    // Encode commands
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);

    const workgroupCount = Math.ceil(vertexCount / 64);
    passEncoder.dispatchWorkgroups(workgroupCount);
    passEncoder.end();

    // Copy results
    const readbackPos = bufferMgr.getBuffer('readbackPos')!;
    const readbackNorm = bufferMgr.getBuffer('readbackNorm')!;

    commandEncoder.copyBufferToBuffer(outPosBuffer, 0, readbackPos, 0, positions.byteLength);
    commandEncoder.copyBufferToBuffer(outNormBuffer, 0, readbackNorm, 0, normals.byteLength);

    device.queue.submit([commandEncoder.finish()]);

    // Read back
    await readbackPos.mapAsync(GPUMapMode.READ);
    await readbackNorm.mapAsync(GPUMapMode.READ);

    const resultPositions = new Float32Array(readbackPos.getMappedRange().slice(0));
    const resultNormals = new Float32Array(readbackNorm.getMappedRange().slice(0));

    readbackPos.unmap();
    readbackNorm.unmap();

    return { positions: resultPositions, normals: resultNormals };
  } finally {
    bufferMgr.destroyAll();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert DisplacementType to uint for WGSL layer data.
 */
function layerTypeToUint(type: DisplacementType): number {
  switch (type) {
    case DisplacementType.NONE: return 0;
    case DisplacementType.NOISE: return 1;
    case DisplacementType.VORONOI_CRACK: return 2;
    case DisplacementType.WAVE: return 3;
    case DisplacementType.LAYERED_BLEND: return 4;
    default: return 0;
  }
}

/**
 * Convert blend mode string to uint for WGSL layer data.
 */
function blendModeToUint(mode?: string): number {
  switch (mode) {
    case 'add': return 0;
    case 'multiply': return 1;
    case 'smooth_min': return 2;
    case 'overwrite': return 3;
    default: return 0;
  }
}

/**
 * CPU smooth min (polynomial).
 */
function smoothMinCPU(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, (b - a + k) / (2 * k)));
  return b + (a - b) * h - k * h * (1 - h);
}

// ============================================================================
// Legacy GPUSurfaceShaders class (backward compatibility)
// ============================================================================

/**
 * Legacy vertex shader for GPU surface displacement
 */
const SURFACE_VERTEX_SHADER = `
  {{precision}} attribute vec3 position;
  {{precision}} attribute vec2 uv;
  {{precision}} uniform sampler2D kernelParams;
  {{precision}} uniform sampler2D heightMap;
  {{precision}} uniform float displacementScale;
  {{precision}} uniform int activeKernelCount;
  
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying vec3 vNormal;
  
  void main() {
    vUv = uv;
    {{precision}} float height = texture2D(heightMap, uv).r;
    vec3 displacedPosition = position + normal * height * displacementScale;
    vWorldPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(displacedPosition, 1.0);
  }
`;

/**
 * Legacy fragment shader for surface visualization
 */
const SURFACE_FRAGMENT_SHADER = `
  {{precision}} varying vec3 vWorldPosition;
  {{precision}} varying vec2 vUv;
  {{precision}} varying vec3 vNormal;

  {{precision}} uniform vec3 baseColor;
  {{precision}} uniform float roughness;
  {{precision}} uniform float metalness;

  void main() {
    {{precision}} vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    {{precision}} float diffuse = max(dot(vNormal, lightDir), 0.0);
    {{precision}} vec3 color = baseColor * (0.3 + 0.7 * diffuse);
    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Legacy GPUSurfaceShaders class (backward compatibility).
 * Delegates to the new GPUSurfaceShaderDispatcher.
 */
export class GPUSurfaceShaders {
  private config: SurfaceShaderConfig;
  private surfaceMaterial: THREE.ShaderMaterial | null;
  private computeProgram: WebGLProgram | null;
  private kernelParamTexture: THREE.DataTexture | null;
  private dispatcher: GPUSurfaceShaderDispatcher | null;

  constructor(config: Partial<SurfaceShaderConfig> = {}) {
    this.config = { ...DEFAULT_SHADER_CONFIG, ...config };
    this.surfaceMaterial = null;
    this.computeProgram = null;
    this.kernelParamTexture = null;
    this.dispatcher = null;
  }

  /**
   * Initialize shader materials and programs
   */
  initialize(): void {
    this.surfaceMaterial = new THREE.ShaderMaterial({
      vertexShader: this.patchShaderPrecision(SURFACE_VERTEX_SHADER),
      fragmentShader: this.patchShaderPrecision(SURFACE_FRAGMENT_SHADER),
      uniforms: {
        kernelParams: { value: null },
        heightMap: { value: null },
        displacementScale: { value: 1.0 },
        activeKernelCount: { value: 0 },
        baseColor: { value: [0.5, 0.5, 0.5] },
        roughness: { value: 0.8 },
        metalness: { value: 0.0 },
      },
    });

    // Try to initialize WebGPU dispatcher
    this.initializeDispatcher();
  }

  /**
   * Initialize the GPUSurfaceShaderDispatcher.
   * Attempts to get a WebGPU device; falls back to CPU if unavailable.
   */
  private async initializeDispatcher(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          const device = await adapter.requestDevice();
          this.dispatcher = new GPUSurfaceShaderDispatcher(device);
        }
      }
    } catch (e) {
      console.warn('WebGPU not available, using CPU fallback for surface shaders:', e);
    }

    if (!this.dispatcher) {
      this.dispatcher = new GPUSurfaceShaderDispatcher();
    }
  }

  /**
   * Get the dispatcher instance.
   */
  getDispatcher(): GPUSurfaceShaderDispatcher | null {
    return this.dispatcher;
  }

  private patchShaderPrecision(shader: string): string {
    const precision = this.config.precision;
    return shader.replace(/\{\{precision\}\}/g, precision);
  }

  /**
   * Upload kernel parameters to GPU texture
   */
  uploadKernelParameters(kernels: Array<{
    amplitude: number;
    frequency: number;
    lacunarity: number;
    persistence: number;
    offsetX: number;
    offsetZ: number;
    octaves: number;
    type: number;
  }>): void {
    const size = this.config.maxKernelCount * 2;
    const data = new Float32Array(size * 4);

    for (let i = 0; i < Math.min(kernels.length, this.config.maxKernelCount); i++) {
      const k = kernels[i];
      const idx = i * 2;

      data[idx * 4 + 0] = k.amplitude;
      data[idx * 4 + 1] = k.frequency;
      data[idx * 4 + 2] = k.lacunarity;
      data[idx * 4 + 3] = k.persistence;

      data[(idx + 1) * 4 + 0] = k.offsetX;
      data[(idx + 1) * 4 + 1] = k.offsetZ;
      data[(idx + 1) * 4 + 2] = k.octaves;
      data[(idx + 1) * 4 + 3] = k.type;
    }

    if (this.kernelParamTexture) {
      this.kernelParamTexture.dispose();
    }

    this.kernelParamTexture = new THREE.DataTexture(
      data,
      size,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.kernelParamTexture.needsUpdate = true;

    if (this.surfaceMaterial) {
      this.surfaceMaterial.uniforms.kernelParams.value = this.kernelParamTexture;
      this.surfaceMaterial.uniforms.activeKernelCount.value = kernels.length;
    }
  }

  /**
   * Get configured surface material
   */
  getSurfaceMaterial(): THREE.ShaderMaterial | null {
    return this.surfaceMaterial;
  }

  /**
   * Update shader uniforms
   */
  updateUniforms(uniforms: {
    heightMap?: any;
    displacementScale?: number;
    baseColor?: [number, number, number];
    roughness?: number;
    metalness?: number;
  }): void {
    if (!this.surfaceMaterial) return;

    if (uniforms.heightMap !== undefined) {
      this.surfaceMaterial.uniforms.heightMap.value = uniforms.heightMap;
    }
    if (uniforms.displacementScale !== undefined) {
      this.surfaceMaterial.uniforms.displacementScale.value = uniforms.displacementScale;
    }
    if (uniforms.baseColor !== undefined) {
      this.surfaceMaterial.uniforms.baseColor.value = uniforms.baseColor;
    }
    if (uniforms.roughness !== undefined) {
      this.surfaceMaterial.uniforms.roughness.value = uniforms.roughness;
    }
    if (uniforms.metalness !== undefined) {
      this.surfaceMaterial.uniforms.metalness.value = uniforms.metalness;
    }
  }

  /**
   * Execute GPU kernel evaluation.
   * Now delegates to GPUSurfaceShaderDispatcher with CPU fallback.
   */
  async executeKernelEvaluation(
    positions: Float32Array,
    normals: Float32Array,
    descriptor?: SurfaceMaterialDescriptor
  ): Promise<{ positions: Float32Array; normals: Float32Array } | null> {
    if (!this.config.enableParallelEvaluation) {
      console.warn('GPU evaluation disabled, falling back to CPU');
      return null;
    }

    if (this.dispatcher && descriptor) {
      // Compile and dispatch using the new system
      this.dispatcher.compile(descriptor);
      return this.dispatcher.dispatch(positions, normals);
    }

    // Fallback: no dispatcher available
    console.log('Executing GPU kernel evaluation (CPU fallback)...');
    return null;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.surfaceMaterial) {
      this.surfaceMaterial.dispose();
      this.surfaceMaterial = null;
    }

    if (this.kernelParamTexture) {
      this.kernelParamTexture.dispose();
      this.kernelParamTexture = null;
    }

    if (this.dispatcher) {
      this.dispatcher.dispose();
      this.dispatcher = null;
    }

    this.computeProgram = null;
  }

  /**
   * Check if GPU compute is supported
   */
  static isGPUSupported(renderer: any): boolean {
    const gl = renderer.getContext();
    return gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
  }

  /**
   * Check if WebGPU is available for compute shaders.
   */
  static async isWebGPUAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return false;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }
}

export default GPUSurfaceShaders;
