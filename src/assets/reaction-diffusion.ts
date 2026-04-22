/**
 * Reaction-Diffusion System for Procedural Pattern Generation
 * 
 * Implements the Gray-Scott model for generating organic patterns
 * on mesh surfaces. Equivalent to Blender's texture nodes but CPU/GPU based.
 */

import * as THREE from 'three';

export interface ReactionDiffusionParams {
  /** Feed rate (typically 0.03-0.06) */
  feedRate: number;
  /** Kill rate (typically 0.057-0.062) */
  killRate: number;
  /** Diffusion rate for chemical A */
  diffA: number;
  /** Diffusion rate for chemical B */
  diffB: number;
  /** Number of simulation steps */
  steps: number;
  /** Resolution of the simulation grid */
  resolution: number;
}

const DEFAULT_PARAMS: ReactionDiffusionParams = {
  feedRate: 0.055,
  killRate: 0.062,
  diffA: 1.0,
  diffB: 0.5,
  steps: 1000,
  resolution: 256
};

/**
 * Simulates reaction-diffusion on a 2D grid using the Gray-Scott model.
 * @param params Simulation parameters
 * @returns Uint8Array representing the final pattern (grayscale)
 */
export function simulateReactionDiffusion(
  params: Partial<ReactionDiffusionParams> = {}
): Uint8Array {
  const config = { ...DEFAULT_PARAMS, ...params };
  const size = config.resolution;
  const total = size * size;
  
  // Initialize two grids (current and next state)
  let gridA = new Float32Array(total);
  let gridB = new Float32Array(total);
  
  // Initialize with mostly A, some B in center
  for (let i = 0; i < total; i++) {
    gridA[i] = 1.0;
    gridB[i] = 0.0;
  }
  
  // Seed center with B
  const centerX = Math.floor(size / 2);
  const centerY = Math.floor(size / 2);
  const seedRadius = Math.floor(size / 8);
  
  for (let y = centerY - seedRadius; y <= centerY + seedRadius; y++) {
    for (let x = centerX - seedRadius; x <= centerX + seedRadius; x++) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= seedRadius ** 2) {
        const idx = y * size + x;
        gridB[idx] = 1.0;
      }
    }
  }
  
  // Laplacian convolution kernel
  const laplacian = [
    0.05, 0.2, 0.05,
    0.2, -1.0, 0.2,
    0.05, 0.2, 0.05
  ];
  
  // Temporary grids for computation
  const nextA = new Float32Array(total);
  const nextB = new Float32Array(total);
  const lapA = new Float32Array(total);
  const lapB = new Float32Array(total);
  
  // Run simulation
  for (let step = 0; step < config.steps; step++) {
    // Compute Laplacian for both grids
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;
        
        let la = 0.0;
        let lb = 0.0;
        let k = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nidx = (y + dy) * size + (x + dx);
            la += gridA[nidx] * laplacian[k];
            lb += gridB[nidx] * laplacian[k];
            k++;
          }
        }
        
        lapA[idx] = la;
        lapB[idx] = lb;
      }
    }
    
    // Update grid values using Gray-Scott equations
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;
        const a = gridA[idx];
        const b = gridB[idx];
        
        const reaction = a * b * b;
        
        nextA[idx] = a + (config.diffA * lapA[idx] - reaction + config.feedRate * (1 - a));
        nextB[idx] = b + (config.diffB * lapB[idx] + reaction - (config.killRate + config.feedRate) * b);
        
        // Clamp values
        nextA[idx] = Math.max(0, Math.min(1, nextA[idx]));
        nextB[idx] = Math.max(0, Math.min(1, nextB[idx]));
      }
    }
    
    // Swap grids
    [gridA, nextA] = [nextA, gridA];
    [gridB, nextB] = [nextB, gridB];
  }
  
  // Convert to grayscale image (using B concentration)
  const result = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    result[i] = Math.floor(gridB[i] * 255);
  }
  
  return result;
}

/**
 * Creates a texture from reaction-diffusion simulation.
 * @param params Simulation parameters
 * @returns THREE.DataTexture
 */
export function createReactionDiffusionTexture(
  params: Partial<ReactionDiffusionParams> = {}
): THREE.DataTexture {
  const data = simulateReactionDiffusion(params);
  const resolution = params.resolution || DEFAULT_PARAMS.resolution;
  
  const texture = new THREE.DataTexture(
    data,
    resolution,
    resolution,
    THREE.LuminanceFormat,
    THREE.UnsignedByteType
  );
  
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  
  return texture;
}

/**
 * Applies reaction-diffusion pattern to a mesh's material.
 * @param mesh Target mesh
 * @param params Simulation parameters
 */
export function applyReactionDiffusionToMesh(
  mesh: THREE.Mesh,
  params: Partial<ReactionDiffusionParams> = {}
): void {
  const texture = createReactionDiffusionTexture(params);
  
  if (mesh.material instanceof THREE.MeshStandardMaterial) {
    mesh.material.displacementMap = texture;
    mesh.material.displacementScale = 0.1;
    mesh.material.needsUpdate = true;
  } else if (mesh.material instanceof THREE.MeshBasicMaterial) {
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
  } else {
    // Create new material with pattern
    mesh.material = new THREE.MeshStandardMaterial({
      map: texture,
      displacementMap: texture,
      displacementScale: 0.1
    });
  }
}

/**
 * GPU-accelerated reaction-diffusion using WebGL shaders.
 * For high-resolution simulations.
 */
export class GPUReactionDiffusion {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private pingpong: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  
  constructor(
    renderer: THREE.WebGLRenderer,
    resolution: number = 512
  ) {
    this.renderer = renderer;
    
    // Setup orthographic camera for fullscreen quad
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    
    // Shader material for reaction-diffusion
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: null },
        uFeedRate: { value: 0.055 },
        uKillRate: { value: 0.062 },
        uDiffA: { value: 1.0 },
        uDiffB: { value: 0.5 },
        uDelta: { value: 1.0 / resolution },
        uStep: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform float uFeedRate;
        uniform float uKillRate;
        uniform float uDiffA;
        uniform float uDiffB;
        uniform float uDelta;
        uniform int uStep;
        varying vec2 vUv;
        
        void main() {
          vec2 texel = vec2(uDelta);
          
          // Sample current state
          vec4 center = texture2D(uTexture, vUv);
          float a = center.r;
          float b = center.g;
          
          // Compute Laplacian
          float lapA = 0.0;
          float lapB = 0.0;
          
          lapA += texture2D(uTexture, vUv + vec2(-uDelta, 0.0)).r * 0.05;
          lapA += texture2D(uTexture, vUv + vec2(uDelta, 0.0)).r * 0.05;
          lapA += texture2D(uTexture, vUv + vec2(0.0, -uDelta)).r * 0.05;
          lapA += texture2D(uTexture, vUv + vec2(0.0, uDelta)).r * 0.05;
          lapA += texture2D(uTexture, vUv + vec2(-uDelta, -uDelta)).r * 0.2;
          lapA += texture2D(uTexture, vUv + vec2(uDelta, -uDelta)).r * 0.2;
          lapA += texture2D(uTexture, vUv + vec2(-uDelta, uDelta)).r * 0.2;
          lapA += texture2D(uTexture, vUv + vec2(uDelta, uDelta)).r * 0.2;
          lapA -= a;
          
          lapB += texture2D(uTexture, vUv + vec2(-uDelta, 0.0)).g * 0.05;
          lapB += texture2D(uTexture, vUv + vec2(uDelta, 0.0)).g * 0.05;
          lapB += texture2D(uTexture, vUv + vec2(0.0, -uDelta)).g * 0.05;
          lapB += texture2D(uTexture, vUv + vec2(0.0, uDelta)).g * 0.05;
          lapB += texture2D(uTexture, vUv + vec2(-uDelta, -uDelta)).g * 0.2;
          lapB += texture2D(uTexture, vUv + vec2(uDelta, -uDelta)).g * 0.2;
          lapB += texture2D(uTexture, vUv + vec2(-uDelta, uDelta)).g * 0.2;
          lapB += texture2D(uTexture, vUv + vec2(uDelta, uDelta)).g * 0.2;
          lapB -= b;
          
          // Gray-Scott equations
          float reaction = a * b * b;
          
          float newA = a + (uDiffA * lapA - reaction + uFeedRate * (1.0 - a));
          float newB = b + (uDiffB * lapB + reaction - (uKillRate + uFeedRate) * b);
          
          // Clamp
          newA = clamp(newA, 0.0, 1.0);
          newB = clamp(newB, 0.0, 1.0);
          
          gl_FragColor = vec4(newA, newB, 0.0, 1.0);
        }
      `
    });
    
    // Fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.quad);
    
    // Ping-pong render targets
    this.pingpong = [
      new THREE.WebGLRenderTarget(resolution, resolution, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType
      }),
      new THREE.WebGLRenderTarget(resolution, resolution, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType
      })
    ];
    
    // Initialize with seed pattern
    this.initializeSeed(resolution);
  }
  
  private initializeSeed(resolution: number): void {
    const data = new Float32Array(resolution * resolution * 4);
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 1.0;     // A = 1
      data[i + 1] = 0.0; // B = 0
      data[i + 2] = 0.0;
      data[i + 3] = 1.0;
    }
    
    // Seed center
    const centerX = Math.floor(resolution / 2);
    const centerY = Math.floor(resolution / 2);
    const seedRadius = Math.floor(resolution / 8);
    
    for (let y = centerY - seedRadius; y <= centerY + seedRadius; y++) {
      for (let x = centerX - seedRadius; x <= centerX + seedRadius; x++) {
        if ((x - centerX) ** 2 + (y - centerY) ** 2 <= seedRadius ** 2) {
          const idx = (y * resolution + x) * 4;
          data[idx + 1] = 1.0; // B = 1
        }
      }
    }
    
    const texture = new THREE.DataTexture(
      data,
      resolution,
      resolution,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    texture.needsUpdate = true;
    
    this.material.uniforms.uTexture.value = texture;
  }
  
  /**
   * Run simulation for specified number of steps.
   * @param steps Number of iterations
   */
  public step(steps: number = 1): void {
    for (let i = 0; i < steps; i++) {
      this.material.uniforms.uStep.value = i;
      
      // Render to pingpong target
      const read = this.pingpong[i % 2];
      const write = this.pingpong[(i + 1) % 2];
      
      this.material.uniforms.uTexture.value = read.texture;
      
      this.renderer.setRenderTarget(write);
      this.renderer.render(this.scene, this.camera);
    }
    
    this.renderer.setRenderTarget(null);
  }
  
  /**
   * Get current state as texture.
   */
  public getTexture(): THREE.Texture {
    return this.pingpong[0].texture;
  }
  
  /**
   * Cleanup resources.
   */
  public dispose(): void {
    this.pingpong[0].dispose();
    this.pingpong[1].dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
