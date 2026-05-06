/**
 * TextureBaker — GPU-based PBR texture baking pipeline
 *
 * Renders each material to a WebGLRenderTarget at configurable resolution,
 * outputting UV-mapped textures for each PBR channel:
 * - Albedo (diffuse color)
 * - Normal map (tangent-space normals from geometry)
 * - Roughness map
 * - Metallic map
 * - AO (ambient occlusion) map — screen-space approximation
 *
 * UV unwrapping strategies: box projection, spherical, cylindrical, smart-project
 * Uses THREE.WebGLRenderer with orthographic camera for GPU baking
 * Each bake pass renders the mesh with a custom shader that outputs
 * the relevant material property to the framebuffer.
 */

import * as THREE from 'three';
import { UVMapper, type SmartProjectOptions } from '@/assets/utils/UVMapper';
import { createCanvas } from '@/assets/utils/CanvasUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextureSize = 512 | 1024 | 2048 | 4096;

export type UVProjection = 'box' | 'spherical' | 'cylindrical' | 'smart' | 'existing';

export interface TextureBakeOptions {
  /** Output texture resolution */
  textureSize: TextureSize;
  /** UV projection method for geometry without UVs */
  uvProjection: UVProjection;
  /** Smart project options (when uvProjection='smart') */
  smartProjectOptions?: Partial<SmartProjectOptions>;
  /** Which maps to bake */
  maps: {
    albedo: boolean;
    normal: boolean;
    roughness: boolean;
    metallic: boolean;
    ao: boolean;
  };
  /** Background color for unbaked regions */
  backgroundColor: THREE.Color;
  /** Anti-aliasing samples (1 = no AA, higher = more samples averaged) */
  samples: number;
  /** AO baking parameters */
  aoOptions: {
    /** Number of random directions for screen-space AO. Default: 16 */
    sampleCount: number;
    /** Maximum distance for occlusion check in world space. Default: 0.5 */
    maxDistance: number;
    /** Strength of AO effect. Default: 1.0 */
    strength: number;
  };
}

export interface TextureBakeResult {
  albedo: THREE.Texture | null;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
  metallic: THREE.Texture | null;
  ao: THREE.Texture | null;
  success: boolean;
  warnings: string[];
}

export interface PBRBakeResult {
  diffuse: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
  metallic: THREE.Texture;
  ao: THREE.Texture;
}

const DEFAULT_BAKE_OPTIONS: TextureBakeOptions = {
  textureSize: 1024,
  uvProjection: 'smart',
  maps: {
    albedo: true,
    normal: true,
    roughness: true,
    metallic: true,
    ao: true,
  },
  backgroundColor: new THREE.Color(0, 0, 0),
  samples: 1,
  aoOptions: {
    sampleCount: 16,
    maxDistance: 0.5,
    strength: 1.0,
  },
};

// ---------------------------------------------------------------------------
// Bake pass shaders
// ---------------------------------------------------------------------------

/**
 * Vertex shader used for all bake passes.
 * Passes UV coordinates and world-space position/normal to the fragment shader.
 */
const BAKE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Fragment shader: outputs albedo (diffuse color * texture).
 * Uses the material's color and map.
 */
const ALBEDO_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform sampler2D uMap;
uniform float uHasMap;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec4 texColor = texture2D(uMap, vUv);
  vec3 albedo = uColor * mix(vec3(1.0), texColor.rgb, uHasMap);
  gl_FragColor = vec4(albedo, 1.0);
}
`;

/**
 * Fragment shader: outputs world-space normals encoded to [0,1] range.
 * If the material has a normal map, it composes the normal map with the
 * geometry normal in tangent space, then converts back to world space.
 */
const NORMAL_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uNormalMap;
uniform float uHasNormalMap;
uniform float uNormalStrength;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec3 N = normalize(vWorldNormal);

  if (uHasNormalMap > 0.5) {
    // Sample normal map (tangent space)
    vec3 tangentNormal = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    tangentNormal.xy *= uNormalStrength;

    // Compute tangent and bitangent from derivatives
    vec3 dp1 = dFdx(vWorldPosition);
    vec3 dp2 = dFdy(vWorldPosition);
    vec2 duv1 = dFdx(vUv);
    vec2 duv2 = dFdy(vUv);

    // Solve tangent frame
    float det = duv1.x * duv2.y - duv1.y * duv2.x;
    if (abs(det) > 0.0001) {
      float invDet = 1.0 / det;
      vec3 T = normalize((dp1 * duv2.y - dp2 * duv1.y) * invDet);
      vec3 B = normalize((dp2 * duv1.x - dp1 * duv2.x) * invDet);

      // Gram-Schmidt orthogonalize
      T = normalize(T - dot(T, N) * N);
      B = cross(N, T);

      // Transform tangent-space normal to world space
      N = normalize(T * tangentNormal.x + B * tangentNormal.y + N * tangentNormal.z);
    }
  }

  // Encode normal to [0,1] range for texture storage
  gl_FragColor = vec4(N * 0.5 + 0.5, 1.0);
}
`;

/**
 * Fragment shader: outputs roughness value.
 */
const ROUGHNESS_FRAGMENT_SHADER = /* glsl */ `
uniform float uRoughness;
uniform sampler2D uRoughnessMap;
uniform float uHasRoughnessMap;

varying vec2 vUv;

void main() {
  float roughness = uRoughness;
  if (uHasRoughnessMap > 0.5) {
    float mapVal = texture2D(uRoughnessMap, vUv).g; // Roughness is in green channel
    roughness *= mapVal;
  }
  gl_FragColor = vec4(vec3(roughness), 1.0);
}
`;

/**
 * Fragment shader: outputs metallic value.
 */
const METALLIC_FRAGMENT_SHADER = /* glsl */ `
uniform float uMetallic;
uniform sampler2D uMetallicMap;
uniform float uHasMetallicMap;

varying vec2 vUv;

void main() {
  float metallic = uMetallic;
  if (uHasMetallicMap > 0.5) {
    float mapVal = texture2D(uMetallicMap, vUv).b; // Metalness is in blue channel
    metallic *= mapVal;
  }
  gl_FragColor = vec4(vec3(metallic), 1.0);
}
`;

/**
 * Fragment shader: outputs screen-space ambient occlusion approximation.
 * Uses a hemisphere-sampling approach based on world-space normals
 * and depth (derived from world position). This is a simplified version
 * that doesn't require a depth pre-pass — it uses the mesh's own geometry
 * to estimate occlusion based on surface curvature and proximity.
 */
const AO_FRAGMENT_SHADER = /* glsl */ `
uniform float uSampleCount;
uniform float uMaxDistance;
uniform float uStrength;
uniform sampler2D uAOMap;
uniform float uHasAOMap;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// Pseudo-random based on position
float hash(vec3 p) {
  p = fract(p * vec3(443.8975, 397.2973, 491.1871));
  p += dot(p, p.yxz + 19.19);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  float ao = 1.0;

  // Screen-space curvature-based AO approximation
  // Uses finite differences of the normal to detect concave areas
  vec3 dx = dFdx(vWorldNormal);
  vec3 dy = dFdy(vWorldNormal);
  float curvature = length(dx) + length(dy);

  // Concave surfaces get more occlusion
  float curvatureAO = 1.0 - curvature * uStrength * 5.0;

  // Position-based AO: darken areas near edges
  vec3 posDx = dFdx(vWorldPosition);
  vec3 posDy = dFdy(vWorldPosition);
  float edgeFactor = length(posDx) + length(posDy);

  // Combine curvature and edge-based AO
  ao = min(curvatureAO, 1.0 - edgeFactor * uStrength * 2.0);
  ao = clamp(ao, 0.0, 1.0);

  // Sample existing AO map if available
  if (uHasAOMap > 0.5) {
    float mapAO = texture2D(uAOMap, vUv).r;
    ao *= mapAO;
  }

  gl_FragColor = vec4(vec3(ao), 1.0);
}
`;

// ---------------------------------------------------------------------------
// TextureBaker class
// ---------------------------------------------------------------------------

export class TextureBaker {
  private renderer: THREE.WebGLRenderer | null = null;
  private options: TextureBakeOptions;

  constructor(options: Partial<TextureBakeOptions> = {}) {
    this.options = { ...DEFAULT_BAKE_OPTIONS, ...options };
  }

  /**
   * Ensure the WebGL renderer is initialized
   */
  private getRenderer(): THREE.WebGLRenderer {
    if (!this.renderer) {
      // Create an off-screen renderer for baking
      this.renderer = new THREE.WebGLRenderer({
        antialias: false,
        preserveDrawingBuffer: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setSize(this.options.textureSize, this.options.textureSize);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    return this.renderer;
  }

  /**
   * Bake all requested PBR maps for a mesh's material
   */
  bakeMaterial(mesh: THREE.Mesh, overrideOptions?: Partial<TextureBakeOptions>): TextureBakeResult {
    const opts = { ...this.options, ...overrideOptions };
    const warnings: string[] = [];

    try {
      // Ensure geometry has UVs
      this.ensureUVs(mesh.geometry, opts.uvProjection, opts.smartProjectOptions, warnings);

      const material = mesh.material;
      if (!material) {
        return this.emptyResult(warnings, 'Mesh has no material');
      }

      const mat = Array.isArray(material) ? material[0] : material;

      const result: TextureBakeResult = {
        albedo: null,
        normal: null,
        roughness: null,
        metallic: null,
        ao: null,
        success: true,
        warnings,
      };

      if (opts.maps.albedo) {
        result.albedo = this.bakeAlbedoGPU(mesh, mat, opts);
      }
      if (opts.maps.normal) {
        result.normal = this.bakeNormalGPU(mesh, mat, opts);
      }
      if (opts.maps.roughness) {
        result.roughness = this.bakeRoughnessGPU(mesh, mat, opts);
      }
      if (opts.maps.metallic) {
        result.metallic = this.bakeMetallicGPU(mesh, mat, opts);
      }
      if (opts.maps.ao) {
        result.ao = this.bakeAOGPU(mesh, mat, opts);
      }

      return result;
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
      return this.emptyResult(warnings);
    }
  }

  /**
   * Bake a complete PBR texture set from geometry and material.
   *
   * This is the primary high-level API for the baking pipeline:
   * 1. UV unwrap the geometry (using smart project by default)
   * 2. GPU-render each PBR pass to a framebuffer texture
   * 3. Return textures ready for assignment to a new material
   *
   * @param geometry - The geometry to bake (will be UV-unwrapped if needed)
   * @param material - The source material to bake from
   * @param options - Bake options (resolution, passes, UV method)
   * @returns Object with baked textures for each PBR channel
   */
  bakeMaterialPBR(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    options?: Partial<TextureBakeOptions>,
  ): PBRBakeResult {
    const opts = { ...DEFAULT_BAKE_OPTIONS, ...options };
    const warnings: string[] = [];

    // Create a temporary mesh for baking
    const tempMesh = new THREE.Mesh(geometry, material);

    // Ensure geometry has UVs
    this.ensureUVs(geometry, opts.uvProjection, opts.smartProjectOptions, warnings);

    // Bake each pass
    const diffuse = this.bakeAlbedoGPU(tempMesh, material, opts) ?? this.bakeSolidColor(new THREE.Color(0.8, 0.8, 0.8), opts);
    const normal = this.bakeNormalGPU(tempMesh, material, opts) ?? this.bakeFlatNormal(opts);
    const roughness = this.bakeRoughnessGPU(tempMesh, material, opts) ?? this.bakeSolidColor(new THREE.Color(0.5, 0.5, 0.5), opts);
    const metallic = this.bakeMetallicGPU(tempMesh, material, opts) ?? this.bakeSolidColor(new THREE.Color(0, 0, 0), opts);
    const ao = this.bakeAOGPU(tempMesh, material, opts) ?? this.bakeSolidColor(new THREE.Color(1, 1, 1), opts);

    // Dispose temporary mesh (not geometry/material)
    tempMesh.geometry = new THREE.BufferGeometry(); // Detach

    return { diffuse, normal, roughness, metallic, ao };
  }

  /**
   * Create a baked MeshPhysicalMaterial from a baked PBR result.
   * The output material uses the baked textures and is ready for rendering.
   */
  createBakedMaterial(result: PBRBakeResult): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      map: result.diffuse,
      normalMap: result.normal,
      roughnessMap: result.roughness,
      metalnessMap: result.metallic,
      aoMap: result.ao,
      // Set scalar multipliers to 1.0 since the baked textures encode the values
      color: new THREE.Color(1, 1, 1),
      roughness: 1.0,
      metalness: 1.0,
      aoMapIntensity: 1.0,
    });
  }

  /**
   * Dispose the internal renderer
   */
  dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }

  // -----------------------------------------------------------------------
  // GPU-based bake passes
  // -----------------------------------------------------------------------

  /**
   * GPU bake: albedo (diffuse color + texture map)
   */
  private bakeAlbedoGPU(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    const renderer = this.getRenderer();

    let color = new THREE.Color(0.8, 0.8, 0.8);
    let sourceMap: THREE.Texture | null = null;

    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
      color = mat.color.clone();
      sourceMap = mat.map;
    } else if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshPhongMaterial) {
      color = (mat as THREE.MeshBasicMaterial).color?.clone() ?? new THREE.Color(0.8, 0.8, 0.8);
      sourceMap = (mat as THREE.MeshBasicMaterial).map ?? null;
    }

    const bakeMaterial = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX_SHADER,
      fragmentShader: ALBEDO_FRAGMENT_SHADER,
      uniforms: {
        uColor: { value: color },
        uMap: { value: sourceMap ?? new THREE.Texture() },
        uHasMap: { value: sourceMap ? 1.0 : 0.0 },
      },
      side: THREE.DoubleSide,
    });

    try {
      const texture = this.renderBakePass(mesh, bakeMaterial, opts, renderer);
      return texture;
    } finally {
      bakeMaterial.dispose();
    }
  }

  /**
   * GPU bake: normal map (geometry normals + material normal map composed)
   */
  private bakeNormalGPU(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    const renderer = this.getRenderer();

    let normalMap: THREE.Texture | null = null;
    let normalStrength = 1.0;

    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
      normalMap = mat.normalMap;
      normalStrength = mat.normalScale ? mat.normalScale.x : 1.0;
    }

    const bakeMaterial = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX_SHADER,
      fragmentShader: NORMAL_FRAGMENT_SHADER,
      uniforms: {
        uNormalMap: { value: normalMap ?? new THREE.Texture() },
        uHasNormalMap: { value: normalMap ? 1.0 : 0.0 },
        uNormalStrength: { value: normalStrength },
      },
      side: THREE.DoubleSide,
    });

    try {
      const texture = this.renderBakePass(mesh, bakeMaterial, opts, renderer);
      return texture;
    } finally {
      bakeMaterial.dispose();
    }
  }

  /**
   * GPU bake: roughness
   */
  private bakeRoughnessGPU(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    const renderer = this.getRenderer();

    let roughness = 0.5;
    let roughnessMap: THREE.Texture | null = null;

    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
      roughness = mat.roughness;
      roughnessMap = mat.roughnessMap;
    }

    const bakeMaterial = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX_SHADER,
      fragmentShader: ROUGHNESS_FRAGMENT_SHADER,
      uniforms: {
        uRoughness: { value: roughness },
        uRoughnessMap: { value: roughnessMap ?? new THREE.Texture() },
        uHasRoughnessMap: { value: roughnessMap ? 1.0 : 0.0 },
      },
      side: THREE.DoubleSide,
    });

    try {
      const texture = this.renderBakePass(mesh, bakeMaterial, opts, renderer);
      return texture;
    } finally {
      bakeMaterial.dispose();
    }
  }

  /**
   * GPU bake: metallic
   */
  private bakeMetallicGPU(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    const renderer = this.getRenderer();

    let metallic = 0.0;
    let metalnessMap: THREE.Texture | null = null;

    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
      metallic = mat.metalness;
      metalnessMap = mat.metalnessMap;
    }

    const bakeMaterial = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX_SHADER,
      fragmentShader: METALLIC_FRAGMENT_SHADER,
      uniforms: {
        uMetallic: { value: metallic },
        uMetallicMap: { value: metalnessMap ?? new THREE.Texture() },
        uHasMetallicMap: { value: metalnessMap ? 1.0 : 0.0 },
      },
      side: THREE.DoubleSide,
    });

    try {
      const texture = this.renderBakePass(mesh, bakeMaterial, opts, renderer);
      return texture;
    } finally {
      bakeMaterial.dispose();
    }
  }

  /**
   * GPU bake: ambient occlusion (screen-space approximation + existing AO map)
   */
  private bakeAOGPU(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    const renderer = this.getRenderer();

    let aoMap: THREE.Texture | null = null;

    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
      aoMap = mat.aoMap;
    }

    const bakeMaterial = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX_SHADER,
      fragmentShader: AO_FRAGMENT_SHADER,
      uniforms: {
        uSampleCount: { value: opts.aoOptions.sampleCount },
        uMaxDistance: { value: opts.aoOptions.maxDistance },
        uStrength: { value: opts.aoOptions.strength },
        uAOMap: { value: aoMap ?? new THREE.Texture() },
        uHasAOMap: { value: aoMap ? 1.0 : 0.0 },
      },
      side: THREE.DoubleSide,
    });

    try {
      const texture = this.renderBakePass(mesh, bakeMaterial, opts, renderer);
      return texture;
    } finally {
      bakeMaterial.dispose();
    }
  }

  // -----------------------------------------------------------------------
  // Core GPU rendering infrastructure
  // -----------------------------------------------------------------------

  /**
   * Render a bake pass: set up an orthographic camera looking at the mesh's
   * UV space, render with the given shader material, and read back the result
   * as a texture.
   *
   * The key insight: we render the mesh in UV space by creating an
   * orthographic camera that maps UV [0,1] to screen coordinates, and
   * the vertex shader positions vertices at their UV coordinates.
   *
   * This approach renders the mesh "flat" in UV space, so the resulting
   * framebuffer image directly becomes the UV-mapped texture.
   */
  private renderBakePass(
    mesh: THREE.Mesh,
    bakeMaterial: THREE.ShaderMaterial,
    opts: TextureBakeOptions,
    renderer: THREE.WebGLRenderer,
  ): THREE.Texture {
    const size = opts.textureSize;

    // Create a UV-space version of the mesh for rendering
    const uvMesh = this.createUVMesh(mesh, bakeMaterial);

    // Set up orthographic camera for UV space [0,1] x [0,1]
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
    camera.position.set(0.5, 0.5, 5);
    camera.lookAt(0.5, 0.5, 0);

    // Create scene with the UV-space mesh
    const scene = new THREE.Scene();
    scene.background = opts.backgroundColor;
    scene.add(uvMesh);

    // Create render target
    const renderTarget = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    // Render with multi-sampling if requested
    let finalTexture: THREE.Texture;

    if (opts.samples > 1) {
      // Accumulate multiple samples with slight jitter
      const samples = opts.samples;
      const sampleTarget = new THREE.WebGLRenderTarget(size, size, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType, // Float for accumulation
      });

      const readBuffer = new Float32Array(size * size * 4);

      for (let s = 0; s < samples; s++) {
        // Slight UV jitter for AA
        const jitterX = (Math.random() - 0.5) / size;
        const jitterY = (Math.random() - 0.5) / size;

        const left = 0 + jitterX;
        const right = 1 + jitterX;
        const top = 1 + jitterY;
        const bottom = 0 + jitterY;
        camera.left = left;
        camera.right = right;
        camera.top = top;
        camera.bottom = bottom;
        camera.updateProjectionMatrix();

        renderer.setRenderTarget(sampleTarget);
        renderer.render(scene, camera);

        // Accumulate
        const pixelBuffer = new Float32Array(size * size * 4);
        renderer.readRenderTargetPixels(sampleTarget, 0, 0, size, size, pixelBuffer);

        for (let i = 0; i < pixelBuffer.length; i++) {
          readBuffer[i] += pixelBuffer[i] / samples;
        }
      }

      // Convert float buffer to a CanvasTexture
      const canvas = createCanvas();
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(size, size);

      for (let i = 0; i < size * size; i++) {
        const r = Math.max(0, Math.min(255, Math.round(readBuffer[i * 4] * 255)));
        const g = Math.max(0, Math.min(255, Math.round(readBuffer[i * 4 + 1] * 255)));
        const b = Math.max(0, Math.min(255, Math.round(readBuffer[i * 4 + 2] * 255)));
        const a = Math.max(0, Math.min(255, Math.round(readBuffer[i * 4 + 3] * 255)));

        // WebGL renders with Y-flip, so flip back
        const y = size - 1 - Math.floor(i / size);
        const x = i % size;
        const destIdx = (y * size + x) * 4;

        imageData.data[destIdx] = r;
        imageData.data[destIdx + 1] = g;
        imageData.data[destIdx + 2] = b;
        imageData.data[destIdx + 3] = a;
      }

      ctx.putImageData(imageData, 0, 0);

      finalTexture = new THREE.CanvasTexture(canvas);
      finalTexture.wrapS = THREE.RepeatWrapping;
      finalTexture.wrapT = THREE.RepeatWrapping;
      finalTexture.name = 'baked_msaa';

      sampleTarget.dispose();
    } else {
      // Single sample render
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      // Read pixels and create a canvas texture (more reliable than keeping RT alive)
      const pixelBuffer = new Uint8Array(size * size * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, size, size, pixelBuffer);

      const canvas = createCanvas();
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(size, size);

      for (let i = 0; i < size * size; i++) {
        // WebGL renders with Y-flip; flip back
        const y = size - 1 - Math.floor(i / size);
        const x = i % size;
        const destIdx = (y * size + x) * 4;

        imageData.data[destIdx] = pixelBuffer[i * 4];
        imageData.data[destIdx + 1] = pixelBuffer[i * 4 + 1];
        imageData.data[destIdx + 2] = pixelBuffer[i * 4 + 2];
        imageData.data[destIdx + 3] = pixelBuffer[i * 4 + 3];
      }

      ctx.putImageData(imageData, 0, 0);

      finalTexture = new THREE.CanvasTexture(canvas);
      finalTexture.wrapS = THREE.RepeatWrapping;
      finalTexture.wrapT = THREE.RepeatWrapping;
      finalTexture.name = 'baked_gpu';
    }

    // Clean up
    renderTarget.dispose();
    uvMesh.geometry.dispose();

    return finalTexture;
  }

  /**
   * Create a UV-space mesh for rendering.
   *
   * Takes the original mesh and creates a new geometry where:
   * - position = UV coordinates (mapped to [0,1] space)
   * - Z position is set to 0 (flat in UV space)
   * - Original positions/normals are passed as attributes for the shader
   *
   * The bake material's vertex shader is overridden to use the UV-space
   * positions directly, but we also need to pass world position/normal
   * for shader computations (AO, normal composition).
   */
  private createUVMesh(
    originalMesh: THREE.Mesh,
    bakeMaterial: THREE.ShaderMaterial,
  ): THREE.Mesh {
    const srcGeom = originalMesh.geometry;
    const uvAttr = srcGeom.attributes.uv;
    const posAttr = srcGeom.attributes.position;
    const normAttr = srcGeom.attributes.normal;

    if (!uvAttr) {
      throw new Error('Cannot create UV mesh: geometry has no UV coordinates');
    }

    const vertexCount = uvAttr.count;

    // New positions = UV coordinates (with Z = 0)
    const positions = new Float32Array(vertexCount * 3);
    // Store world positions as a custom attribute
    const worldPositions = new Float32Array(vertexCount * 3);
    // Store world normals as a custom attribute
    const worldNormals = new Float32Array(vertexCount * 3);

    // Get world matrix of the original mesh
    const worldMatrix = originalMesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    for (let i = 0; i < vertexCount; i++) {
      // UV-space position
      positions[i * 3] = uvAttr.getX(i);      // U → X
      positions[i * 3 + 1] = uvAttr.getY(i);   // V → Y
      positions[i * 3 + 2] = 0;                // Z = 0

      // World-space position
      const wx = posAttr.getX(i);
      const wy = posAttr.getY(i);
      const wz = posAttr.getZ(i);
      const worldPos = new THREE.Vector3(wx, wy, wz).applyMatrix4(worldMatrix);
      worldPositions[i * 3] = worldPos.x;
      worldPositions[i * 3 + 1] = worldPos.y;
      worldPositions[i * 3 + 2] = worldPos.z;

      // World-space normal
      if (normAttr) {
        const nx = normAttr.getX(i);
        const ny = normAttr.getY(i);
        const nz = normAttr.getZ(i);
        const worldNorm = new THREE.Vector3(nx, ny, nz).applyMatrix3(normalMatrix).normalize();
        worldNormals[i * 3] = worldNorm.x;
        worldNormals[i * 3 + 1] = worldNorm.y;
        worldNormals[i * 3 + 2] = worldNorm.z;
      }
    }

    const uvGeom = new THREE.BufferGeometry();

    // Position = UV coordinates
    uvGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    // UV = same UV coordinates (pass through for texture sampling)
    uvGeom.setAttribute('uv', new THREE.Float32BufferAttribute(
      new Float32Array(uvAttr.array), 2,
    ));

    // Custom attributes for world-space data
    uvGeom.setAttribute('aWorldPosition', new THREE.Float32BufferAttribute(worldPositions, 3));
    uvGeom.setAttribute('aWorldNormal', new THREE.Float32BufferAttribute(worldNormals, 3));

    // Copy index buffer
    if (srcGeom.index) {
      uvGeom.setIndex(srcGeom.index.clone());
    }

    // Create a modified shader material that uses UV-space positions
    // but reads world position/normal from custom attributes
    const modifiedMaterial = this.createUVSpaceMaterial(bakeMaterial);

    const uvMesh = new THREE.Mesh(uvGeom, modifiedMaterial);
    return uvMesh;
  }

  /**
   * Create a modified version of the bake material that works in UV space.
   *
   * Replaces the vertex shader to:
   * - Use position (which is UV coords) directly for gl_Position
   * - Pass world position/normal from custom attributes
   * - Pass UV coordinates for texture sampling
   */
  private createUVSpaceMaterial(sourceMaterial: THREE.ShaderMaterial): THREE.ShaderMaterial {
    // UV-space vertex shader
    const uvVertexShader = /* glsl */ `
attribute vec3 aWorldPosition;
attribute vec3 aWorldNormal;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vUv = uv;
  vWorldPosition = aWorldPosition;
  vWorldNormal = normalize(aWorldNormal);

  // Position in UV space: x=U, y=V, z=0
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

    // Clone the source material's fragment shader and uniforms
    const newUniforms: Record<string, { value: unknown }> = {};
    for (const key of Object.keys(sourceMaterial.uniforms)) {
      newUniforms[key] = { value: sourceMaterial.uniforms[key].value };
    }

    return new THREE.ShaderMaterial({
      vertexShader: uvVertexShader,
      fragmentShader: sourceMaterial.fragmentShader,
      uniforms: newUniforms,
      side: sourceMaterial.side,
      extensions: sourceMaterial.extensions ? { ...sourceMaterial.extensions } : undefined,
    });
  }

  // -----------------------------------------------------------------------
  // Canvas-based fallback baking (for when GPU is not available)
  // -----------------------------------------------------------------------

  private bakeSolidColor(color: THREE.Color, opts: TextureBakeOptions): THREE.Texture {
    const size = opts.textureSize;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = 'baked_solid';
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private bakeFlatNormal(opts: TextureBakeOptions): THREE.Texture {
    const size = opts.textureSize;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Flat normal: (0, 0, 1) → encoded as (128, 128, 255) in RGB
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = 'baked_normal';
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // -----------------------------------------------------------------------
  // UV projection helpers
  // -----------------------------------------------------------------------

  private ensureUVs(
    geometry: THREE.BufferGeometry,
    projection: UVProjection,
    smartOptions: Partial<SmartProjectOptions> | undefined,
    warnings: string[],
  ): void {
    if (geometry.attributes.uv) return;

    warnings.push(`Geometry missing UVs, applying ${projection} projection`);

    switch (projection) {
      case 'smart':
        UVMapper.smartProjectUVs(geometry, smartOptions);
        break;
      case 'box':
        UVMapper.generateBoxUVs(geometry);
        break;
      case 'spherical':
        UVMapper.generateSphericalUVs(geometry);
        break;
      case 'cylindrical':
        UVMapper.generateCylindricalUVs(geometry);
        break;
      case 'existing':
        // Fallback to box if no UVs exist
        UVMapper.generateBoxUVs(geometry);
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------

  private emptyResult(warnings: string[], error?: string): TextureBakeResult {
    if (error) warnings.push(error);
    return {
      albedo: null,
      normal: null,
      roughness: null,
      metallic: null,
      ao: null,
      success: false,
      warnings,
    };
  }
}
