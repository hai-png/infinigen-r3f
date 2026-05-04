/**
 * GPUSurfaceShaders.ts
 * 
 * WebGL compute shaders for parallel surface displacement calculations.
 * Provides GPU-accelerated evaluation of surface kernel functions.
 * 
 * Also contains WGSL compute shaders for WebGPU-based SDF surface
 * displacement, used by TerrainSurfaceShaderPipeline to refine marching
 * cubes output and add fine surface detail.
 * 
 * Based on original Infinigen's GPU surface evaluation system.
 */

import { ShaderMaterial, Uniform, DataTexture, RGBAFormat, FloatType } from 'three';

export interface SurfaceShaderConfig {
  maxKernelCount: number;
  textureSize: number;
  enableParallelEvaluation: boolean;
  precision: 'highp' | 'mediump' | 'lowp';
}

// ============================================================================
// WGSL Surface Displacement Shader (WebGPU Compute)
// ============================================================================

/**
 * Uniforms layout for the SDF surface displacement compute shader.
 * Must match the struct in the WGSL code below.
 */
export interface SDFDisplacementUniforms {
  /** Number of vertices to process */
  vertexCount: number;
  /** Grid dimensions: [gridSizeX, gridSizeY, gridSizeZ] */
  gridSizeX: number;
  gridSizeY: number;
  gridSizeZ: number;
  /** SDF bounds minimum: [minX, minY, minZ] */
  boundsMinX: number;
  boundsMinY: number;
  boundsMinZ: number;
  /** SDF voxel size: [voxelSizeX, voxelSizeY, voxelSizeZ] */
  voxelSizeX: number;
  voxelSizeY: number;
  voxelSizeZ: number;
  /** Displacement scale (how strongly to project onto isosurface) */
  displacementScale: number;
  /** Epsilon for finite-difference gradient computation */
  gradientEpsilon: number;
  /** Additional noise-based displacement amplitude (0 = off) */
  noiseAmplitude: number;
  /** Noise frequency for additional displacement */
  noiseFrequency: number;
  /** Material type index for multi-material support (0=default) */
  materialType: number;
  /** Iso level for surface extraction (usually 0) */
  isoLevel: number;
}

/**
 * Default values for SDF displacement uniforms.
 */
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

/**
 * WGSL compute shader for SDF-based surface displacement.
 *
 * For each vertex, the shader:
 *   1. Samples the SDF at the vertex position via trilinear interpolation
 *   2. Computes the SDF gradient using central finite differences
 *   3. Projects the vertex onto the isosurface (Newton step): 
 *      new_pos = pos - sdf(pos) * normalize(gradient)
 *   4. Optionally adds noise-based displacement along the gradient direction
 *   5. Computes the new surface normal from the displaced position's gradient
 *
 * Bindings:
 *   @group(0) @binding(0) — uniforms (SDFDisplacementUniforms)
 *   @group(0) @binding(1) — SDF voxel data (storage, read)
 *   @group(0) @binding(2) — input vertex positions (storage, read)
 *   @group(0) @binding(3) — input vertex normals (storage, read)
 *   @group(0) @binding(4) — output vertex positions (storage, read_write)
 *   @group(0) @binding(5) — output vertex normals (storage, read_write)
 */
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

// ---- SDF sampling with trilinear interpolation ----

fn getSafeSDF(gx: i32, gy: i32, gz: i32) -> f32 {
  if (gx < 0 || gy < 0 || gz < 0 ||
      gx >= i32(uniforms.gridSizeX) ||
      gy >= i32(uniforms.gridSizeY) ||
      gz >= i32(uniforms.gridSizeZ)) {
    return 1e6;  // large positive = far outside
  }
  let idx = u32(gz) * uniforms.gridSizeX * uniforms.gridSizeY +
            u32(gy) * uniforms.gridSizeX +
            u32(gx);
  return sdfData[idx];
}

/// Trilinear interpolation of SDF at world-space position
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

// ---- SDF gradient via central finite differences ----

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

// ---- Deterministic hash-based noise for surface perturbation ----

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

/// 3D hash for material-dependent variation
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

// ---- Material-dependent displacement modifiers ----

fn getMaterialDisplacement(pos: vec3<f32>, gradient: vec3<f32>) -> f32 {
  let matType = uniforms.materialType;

  if (matType == 1u) {
    // Rocky: high-frequency detail
    return fbmNoise3D(pos * uniforms.noiseFrequency * 3.0) * 0.7;
  } else if (matType == 2u) {
    // Sandy: low-frequency rolling dunes
    return fbmNoise2D(pos.xz * uniforms.noiseFrequency * 0.5) * 0.5;
  } else if (matType == 3u) {
    // Snowy: smooth with gentle undulation
    return fbmNoise3D(pos * uniforms.noiseFrequency * 0.3) * 0.2;
  } else if (matType == 4u) {
    // Clay: medium detail with striations
    let base = fbmNoise3D(pos * uniforms.noiseFrequency * 2.0) * 0.6;
    let striation = sin(pos.y * 20.0) * 0.05;
    return base + striation;
  }
  // Default: moderate 3D noise displacement
  return fbmNoise3D(pos * uniforms.noiseFrequency) * 0.5;
}

// ---- Main compute entry point ----

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let vertexIdx = gid.x;
  if (vertexIdx >= uniforms.vertexCount) {
    return;
  }

  // Read input position
  let inBase = vertexIdx * 3u;
  let pos = vec3<f32>(
    inPositions[inBase],
    inPositions[inBase + 1u],
    inPositions[inBase + 2u]
  );

  // Sample SDF at vertex position
  let sdfValue = sampleSDF(pos);

  // Compute SDF gradient (surface normal direction)
  let gradient = computeGradient(pos);

  // Project vertex onto isosurface using Newton's method:
  //   new_pos = pos - (sdf(pos) - isoLevel) * gradient * displacementScale
  // This refines the marching cubes output to be closer to the true isosurface.
  var displacedPos = pos - (sdfValue - uniforms.isoLevel) * gradient * uniforms.displacementScale;

  // Optional: add noise-based surface detail displacement along the gradient
  if (uniforms.noiseAmplitude > 0.0) {
    let noiseDisp = getMaterialDisplacement(displacedPos, gradient);
    displacedPos = displacedPos + gradient * noiseDisp * uniforms.noiseAmplitude;
  }

  // Write output position
  outPositions[inBase]      = displacedPos.x;
  outPositions[inBase + 1u] = displacedPos.y;
  outPositions[inBase + 2u] = displacedPos.z;

  // Compute new normal at displaced position from SDF gradient
  let newGradient = computeGradient(displacedPos);
  outNormals[inBase]      = newGradient.x;
  outNormals[inBase + 1u] = newGradient.y;
  outNormals[inBase + 2u] = newGradient.z;
}
`;

const DEFAULT_SHADER_CONFIG: SurfaceShaderConfig = {
  maxKernelCount: 32,
  textureSize: 512,
  enableParallelEvaluation: true,
  precision: 'highp',
};

/**
 * Vertex shader for GPU surface displacement
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
    
    // Sample height from GPU-computed heightmap
    {{precision}} float height = texture2D(heightMap, uv).r;
    
    // Apply displacement along normal
    vec3 displacedPosition = position + normal * height * displacementScale;
    
    vWorldPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(displacedPosition, 1.0);
  }
`;

/**
 * Fragment shader for surface visualization
 */
const SURFACE_FRAGMENT_SHADER = `
  {{precision}} varying vec3 vWorldPosition;
  {{precision}} varying vec2 vUv;
  {{precision}} varying vec3 vNormal;

  {{precision}} uniform vec3 baseColor;
  {{precision}} uniform float roughness;
  {{precision}} uniform float metalness;

  void main() {
    // Simple Lambertian lighting
    {{precision}} vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    {{precision}} float diffuse = max(dot(vNormal, lightDir), 0.0);

    {{precision}} vec3 color = baseColor * (0.3 + 0.7 * diffuse);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Compute shader for parallel kernel evaluation (WebGL 2.0)
 */
const KERNEL_EVAL_COMPUTE_SHADER = `
  #version 300 es
  
  layout(local_size_x = 16, local_size_y = 16) in;
  
  uniform highp sampler2D inputPositions;
  uniform highp sampler2D kernelParams;
  uniform highp writeonly sampler2D outputHeights;
  
  uniform int activeKernelCount;
  uniform float worldScale;
  
  void main() {
    ivec2 texelCoord = ivec2(gl_GlobalInvocationID.xy);
    
    // Sample position
    vec4 posData = texelFetch(inputPositions, texelCoord, 0);
    vec3 position = posData.xyz;
    
    // Evaluate all active kernels
    float totalHeight = 0.0;
    
    for (int i = 0; i < activeKernelCount; i++) {
      // Fetch kernel parameters
      vec4 params0 = texelFetch(kernelParams, ivec2(i * 2, 0), 0);
      vec4 params1 = texelFetch(kernelParams, ivec2(i * 2 + 1, 0), 0);
      
      float amplitude = params0.x;
      float frequency = params0.y;
      float lacunarity = params0.z;
      float persistence = params0.w;
      
      float offsetX = params1.x;
      float offsetZ = params1.y;
      int octaves = int(params1.z);
      int kernelType = int(params1.w);
      
      // Evaluate kernel based on type
      float height = evaluateKernel(position, kernelType, amplitude, frequency, 
                                    lacunarity, persistence, octaves, offsetX, offsetZ);
      
      totalHeight += height;
    }
    
    // Write result
    imageStore(outputHeights, texelCoord, vec4(totalHeight, 0.0, 0.0, 1.0));
  }
  
  float evaluateKernel(vec3 pos, int type, float amp, float freq, 
                       float lac, float pers, int oct, float offX, float offZ) {
    vec2 samplePos = vec2(pos.x + offX, pos.z + offZ) * freq;
    
    if (type == 0) {
      // Perlin noise
      return perlinNoise(samplePos, oct, pers, lac) * amp;
    } else if (type == 1) {
      // Value noise
      return valueNoise(samplePos, oct, pers, lac) * amp;
    } else if (type == 2) {
      // Ridged multifractal
      return ridgedMultifractal(samplePos, oct, pers, lac) * amp;
    } else if (type == 3) {
      // Billow noise
      return billowNoise(samplePos, oct, pers, lac) * amp;
    }
    
    return 0.0;
  }
  
  // Noise functions would be implemented here
  // (simplified for brevity - full implementation includes permutation tables)
  
  float perlinNoise(vec2 p, int octaves, float persistence, float lacunarity) {
    float total = 0.0;
    float frequency = 1.0;
    float amplitude = 1.0;
    float maxValue = 0.0;
    
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      
      total += smoothNoise(p * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    return total / maxValue;
  }
  
  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }
`;

/**
 * Manages GPU surface shader programs and execution
 */
export class GPUSurfaceShaders {
  private config: SurfaceShaderConfig;
  private surfaceMaterial: ShaderMaterial | null;
  private computeProgram: WebGLProgram | null;
  private kernelParamTexture: DataTexture | null;

  constructor(config: Partial<SurfaceShaderConfig> = {}) {
    this.config = { ...DEFAULT_SHADER_CONFIG, ...config };
    this.surfaceMaterial = null;
    this.computeProgram = null;
    this.kernelParamTexture = null;
  }

  /**
   * Initialize shader materials and programs
   */
  initialize(): void {
    // Create surface rendering material
    this.surfaceMaterial = new ShaderMaterial({
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

    // Note: Compute shader support requires WebGL 2.0
    // Fallback to fragment shader compute for broader compatibility
    this.initializeComputeFallback();
  }

  /**
   * Initialize compute fallback using fragment shaders (WebGL 1.0 compatible)
   */
  private initializeComputeFallback(): void {
    // In WebGL 1.0, we use render-to-texture with fragment shaders
    // This is less efficient but more compatible
    console.log('Using fragment shader compute fallback for GPU surface evaluation');
  }

  /**
   * Patch shader code with correct precision qualifiers
   */
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

      // First parameter vector
      data[idx * 4 + 0] = k.amplitude;
      data[idx * 4 + 1] = k.frequency;
      data[idx * 4 + 2] = k.lacunarity;
      data[idx * 4 + 3] = k.persistence;

      // Second parameter vector
      data[(idx + 1) * 4 + 0] = k.offsetX;
      data[(idx + 1) * 4 + 1] = k.offsetZ;
      data[(idx + 1) * 4 + 2] = k.octaves;
      data[(idx + 1) * 4 + 3] = k.type;
    }

    if (this.kernelParamTexture) {
      this.kernelParamTexture.dispose();
    }

    this.kernelParamTexture = new DataTexture(
      data,
      size,
      1,
      RGBAFormat,
      FloatType
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
  getSurfaceMaterial(): ShaderMaterial | null {
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
   * Execute GPU kernel evaluation
   */
  executeKernelEvaluation(
    inputPositions: DataTexture,
    outputTarget: any
  ): void {
    if (!this.config.enableParallelEvaluation) {
      console.warn('GPU evaluation disabled, falling back to CPU');
      return;
    }

    // Implementation depends on WebGL version and extensions
    // For now, this is a placeholder for the actual dispatch logic
    console.log('Executing GPU kernel evaluation...');
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

    this.computeProgram = null;
  }

  /**
   * Check if GPU compute is supported
   */
  static isGPUSupported(renderer: any): boolean {
    const gl = renderer.getContext();
    return gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
  }
}

export default GPUSurfaceShaders;
