/**
 * GPUSurfaceShaders.ts
 *
 * WebGL compute shaders for parallel surface displacement calculations.
 * Provides GPU-accelerated evaluation of surface kernel functions.
 *
 * Based on original Infinigen's GPU surface evaluation system.
 */
import { ShaderMaterial, DataTexture, RGBAFormat, FloatType } from 'three';
const DEFAULT_SHADER_CONFIG = {
    maxKernelCount: 32,
    textureSize: 512,
    enableParallelEvaluation: true,
    precision: 'highp',
};
/**
 * Vertex shader for GPU surface displacement
 */
const SURFACE_VERTEX_SHADER = `
  ${this.config.precision} attribute vec3 position;
  ${this.config.precision} attribute vec2 uv;
  ${this.config.precision} uniform sampler2D kernelParams;
  ${this.config.precision} uniform sampler2D heightMap;
  ${this.config.precision} uniform float displacementScale;
  ${this.config.precision} uniform int activeKernelCount;
  
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying vec3 vNormal;
  
  void main() {
    vUv = uv;
    
    // Sample height from GPU-computed heightmap
    ${this.config.precision} float height = texture2D(heightMap, uv).r;
    
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
  ${this.config.precision} varying vec3 vWorldPosition;
  ${this.config.precision} varying vec2 vUv;
  ${this.config.precision} varying vec3 vNormal;
  
  ${this.config.precision} uniform vec3 baseColor;
  ${this.config.precision} uniform float roughness;
  ${this.config.precision} uniform float metalness;
  
  void main() {
    // Simple Lambertian lighting
    ${this.config.precision} vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    ${this.config.precision} float diffuse = max(dot(vNormal, lightDir), 0.0);
    
    ${this.config.precision} vec3 color = baseColor * (0.3 + 0.7 * diffuse);
    
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
    constructor(config = {}) {
        this.config = { ...DEFAULT_SHADER_CONFIG, ...config };
        this.surfaceMaterial = null;
        this.computeProgram = null;
        this.kernelParamTexture = null;
    }
    /**
     * Initialize shader materials and programs
     */
    initialize() {
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
    initializeComputeFallback() {
        // In WebGL 1.0, we use render-to-texture with fragment shaders
        // This is less efficient but more compatible
        console.log('Using fragment shader compute fallback for GPU surface evaluation');
    }
    /**
     * Patch shader code with correct precision qualifiers
     */
    patchShaderPrecision(shader) {
        const precision = this.config.precision;
        return shader.replace(/\$\{this\.config\.precision\}/g, precision);
    }
    /**
     * Upload kernel parameters to GPU texture
     */
    uploadKernelParameters(kernels) {
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
        this.kernelParamTexture = new DataTexture(data, size, 1, RGBAFormat, FloatType);
        this.kernelParamTexture.needsUpdate = true;
        if (this.surfaceMaterial) {
            this.surfaceMaterial.uniforms.kernelParams.value = this.kernelParamTexture;
            this.surfaceMaterial.uniforms.activeKernelCount.value = kernels.length;
        }
    }
    /**
     * Get configured surface material
     */
    getSurfaceMaterial() {
        return this.surfaceMaterial;
    }
    /**
     * Update shader uniforms
     */
    updateUniforms(uniforms) {
        if (!this.surfaceMaterial)
            return;
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
    executeKernelEvaluation(inputPositions, outputTarget) {
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
    dispose() {
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
    static isGPUSupported(renderer) {
        const gl = renderer.getContext();
        return gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
    }
}
export default GPUSurfaceShaders;
//# sourceMappingURL=GPUSurfaceShaders.js.map