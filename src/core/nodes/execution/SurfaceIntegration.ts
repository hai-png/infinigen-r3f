/**
 * SurfaceIntegration - Surface/material integration matching Infinigen's `core/surface.py`
 *
 * Provides the high-level API that bridges geometry nodes and shader nodes:
 *
 * - `add_geomod`: Apply a geometry nodes modifier to a BufferGeometry
 * - `add_material`: Create a shader material using a node graph function
 * - `shaderfunc_to_material`: Convert a shader function to a Three.js material
 * - `create_surface_material`: Convenience function for common surface materials
 * - `compileShaderGraphToMaterial`: Full compilation pipeline from node graph
 *   to ShaderMaterial with uniforms, vertex/fragment shaders
 *
 * Port of: Princeton Infinigen's `core/surface.py` functions:
 *   - add_geomod()
 *   - add_material()
 *   - shaderfunc_to_material()
 */

import * as THREE from 'three';
import { NodeWrangler } from '../core/node-wrangler';
import { GeometryNodeContext, GeometryNodePipeline } from './GeometryNodeExecutor';
import { NodeShaderCompiler } from './ShaderCompiler';
import { NodeEvaluator, EvaluationMode } from './NodeEvaluator';
import { NodeGraphMaterialBridge, type BSDFOutput } from './NodeGraphMaterialBridge';
import { SeededNoiseGenerator, NoiseType } from '../../util/math/noise';

// ============================================================================
// MaterialCompileOptions
// ============================================================================

/**
 * Options for compiling a shader graph into a Three.js ShaderMaterial.
 */
export interface MaterialCompileOptions {
  /** Render as wireframe */
  wireframe?: boolean;

  /** Render both sides of faces */
  doubleSided?: boolean;

  /** Enable transparency */
  transparent?: boolean;

  /** Global opacity (1.0 = fully opaque) */
  opacity?: number;

  /** Use MeshPhysicalMaterial as fallback instead of ShaderMaterial */
  usePhysicalFallback?: boolean;
}

// ============================================================================
// add_geomod
// ============================================================================

/**
 * Apply a geometry nodes modifier to a BufferGeometry.
 *
 * Creates a NodeWrangler, passes it to `modifierFn`, then evaluates the
 * geometry node pipeline. This mirrors Infinigen's `add_geomod()` Python API.
 *
 * @param geometry   - The input geometry to modify
 * @param modifierFn - A function that builds a geometry node graph using the
 *                     provided NodeWrangler and GeometryNodeContext
 * @param name       - Optional name for the modifier (used in logging/metadata)
 * @returns The modified BufferGeometry
 *
 * @example
 * ```ts
 * const result = add_geomod(baseGeo, (nw, ctx) => {
 *   // Build geometry nodes using nw and modify ctx
 *   GeometryNodeExecutor.execute('SubdivisionSurface', { iterations: 2 }, ctx);
 *   GeometryNodeExecutor.execute('SetShadeSmooth', { smooth: true }, ctx);
 * });
 * ```
 */
export function add_geomod(
  geometry: THREE.BufferGeometry,
  modifierFn: (nw: NodeWrangler, ctx: GeometryNodeContext) => void,
  name?: string,
): THREE.BufferGeometry {
  const nw = new NodeWrangler();
  if (name) {
    nw.getActiveGroup().name = name;
  }

  const ctx = new GeometryNodeContext(geometry);

  try {
    modifierFn(nw, ctx);

    // If the modifier created nodes in the wrangler, evaluate the pipeline
    const group = nw.getActiveGroup();
    if (group.nodes.size > 0) {
      return GeometryNodePipeline.evaluate(ctx.geometry, nw);
    }

    // Otherwise, the modifier directly modified the context
    return ctx.geometry;
  } catch (error) {
    console.warn(`[add_geomod] Error in modifier${name ? ` "${name}"` : ''}:`, error);
    return geometry;
  }
}

// ============================================================================
// add_material
// ============================================================================

/**
 * Create a shader material using a node graph function.
 *
 * Calls `shaderFn(nw)` to build the shader graph, then compiles it.
 * This mirrors Infinigen's `add_material()` Python API.
 *
 * @param nw        - A NodeWrangler to use for building the shader graph
 * @param shaderFn  - A function that builds a shader node graph
 * @param name      - Optional material name
 * @param selection - Optional selection mask (reserved for future use)
 * @returns The compiled node output (may be a BSDF descriptor or similar)
 */
export function add_material(
  nw: NodeWrangler,
  shaderFn: (nw: NodeWrangler) => any,
  name?: string,
  selection?: any,
): any {
  try {
    const result = shaderFn(nw);
    return result;
  } catch (error) {
    console.warn(`[add_material] Error building shader graph${name ? ` "${name}"` : ''}:`, error);
    return null;
  }
}

// ============================================================================
// shaderfunc_to_material
// ============================================================================

/**
 * Convert a shader function to a Three.js Material.
 *
 * Creates a NodeWrangler, builds the shader graph by calling `shaderFn(nw)`,
 * then compiles the graph into a ShaderMaterial (or MeshPhysicalMaterial
 * as fallback).
 *
 * This mirrors Infinigen's `shaderfunc_to_material()` Python API.
 *
 * @param shaderFn - A function that takes a NodeWrangler and builds a shader graph
 * @param name     - Optional material name
 * @returns A compiled Three.js Material
 */
export function shaderfunc_to_material(
  shaderFn: (nw: NodeWrangler) => any,
  name?: string,
): THREE.Material {
  const nw = new NodeWrangler();
  if (name) {
    nw.getActiveGroup().name = name;
  }

  try {
    // Build the shader graph
    shaderFn(nw);

    // Convert NodeWrangler graph to NodeGraph for the compiler
    const group = nw.getActiveGroup();
    const nodeGraph = {
      nodes: group.nodes,
      links: Array.from(group.links.values()),
    };

    return compileShaderGraphToMaterial(nw, {
      transparent: false,
      doubleSided: false,
    });
  } catch (error) {
    console.warn(`[shaderfunc_to_material] Error${name ? ` for "${name}"` : ''}:`, error);
    return createFallbackMaterial();
  }
}

// ============================================================================
// create_surface_material
// ============================================================================

/**
 * Convenience function for creating common surface materials with noise-based detail.
 *
 * Generates a MeshPhysicalMaterial with optional noise perturbation on the
 * base color, roughness, and normal. Uses SeededNoiseGenerator for
 * deterministic output.
 *
 * @param config - Surface material configuration
 * @returns A configured Three.js Material
 */
export function create_surface_material(config: {
  /** Base albedo color */
  baseColor?: THREE.ColorRepresentation;
  /** Microfacet roughness [0,1] */
  roughness?: number;
  /** Metalness [0,1] */
  metalness?: number;
  /** Normal map strength */
  normalStrength?: number;
  /** Displacement scale */
  displacementScale?: number;
  /** Noise algorithm to use */
  noiseType?: string;
  /** Noise spatial frequency */
  noiseScale?: number;
  /** Random seed for deterministic output */
  seed?: number;
}): THREE.Material {
  const {
    baseColor = 0x808080,
    roughness = 0.5,
    metalness = 0.0,
    normalStrength = 1.0,
    displacementScale = 0.0,
    noiseType = 'perlin',
    noiseScale = 5.0,
    seed = 42,
  } = config;

  // If no noise detail is requested, return a simple MeshPhysicalMaterial
  if (noiseScale <= 0 || displacementScale <= 0) {
    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness,
      metalness,
      flatShading: false,
    });
    material.name = 'InfinigenSurface';
    return material;
  }

  // Create a procedural normal map using noise
  const noise = new SeededNoiseGenerator(seed);
  const size = 256;
  const normalData = new Float32Array(size * size * 4);
  const bumpData = new Float32Array(size * size);

  // Generate bump map from noise
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      const noiseFn = getNoiseFn(noise, noiseType);
      const val = noiseFn(u * noiseScale, v * noiseScale, seed * 0.01);
      bumpData[y * size + x] = val * 0.5 + 0.5; // Remap to [0, 1]
    }
  }

  // Compute normal map from bump map (Sobel filter)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x);
      const left = bumpData[y * size + Math.max(0, x - 1)];
      const right = bumpData[y * size + Math.min(size - 1, x + 1)];
      const top = bumpData[Math.max(0, y - 1) * size + x];
      const bottom = bumpData[Math.min(size - 1, y + 1) * size + x];

      const dx = (right - left) * normalStrength;
      const dy = (bottom - top) * normalStrength;

      // Normal map format: [dx, dy, 1] normalized, remapped to [0,1]
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      normalData[idx * 4] = (dx / len) * 0.5 + 0.5;
      normalData[idx * 4 + 1] = (dy / len) * 0.5 + 0.5;
      normalData[idx * 4 + 2] = (1.0 / len) * 0.5 + 0.5;
      normalData[idx * 4 + 3] = 1.0;
    }
  }

  // Create normal map texture
  const normalTexture = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  normalTexture.wrapS = THREE.RepeatWrapping;
  normalTexture.wrapT = THREE.RepeatWrapping;
  normalTexture.needsUpdate = true;

  const material = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    roughness,
    metalness,
    normalMap: normalTexture,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    flatShading: false,
  });

  if (displacementScale > 0) {
    // Create displacement map from bump data
    const dispTexture = new THREE.DataTexture(bumpData, size, size, THREE.RedFormat);
    dispTexture.wrapS = THREE.RepeatWrapping;
    dispTexture.wrapT = THREE.RepeatWrapping;
    dispTexture.needsUpdate = true;
    material.displacementMap = dispTexture;
    material.displacementScale = displacementScale;
  }

  material.name = 'InfinigenSurface';
  return material;
}

// ============================================================================
// compileShaderGraphToMaterial
// ============================================================================

/**
 * Full compilation pipeline from a NodeWrangler node graph to a
 * THREE.ShaderMaterial with uniforms, vertex shader, and fragment shader.
 *
 * This is the primary bridge between the node system and Three.js rendering.
 * It:
 * 1. Extracts the node graph from the NodeWrangler
 * 2. Evaluates the graph using NodeEvaluator
 * 3. Extracts BSDF parameters from the evaluation result
 * 4. Generates GLSL shaders via NodeShaderCompiler
 * 5. Assembles a ShaderMaterial with proper uniforms
 *
 * Falls back to MeshPhysicalMaterial if compilation fails.
 *
 * @param nw      - The NodeWrangler containing the shader graph
 * @param options - Compile options (wireframe, transparency, etc.)
 * @returns A compiled Three.js ShaderMaterial (or MeshPhysicalMaterial fallback)
 */
export function compileShaderGraphToMaterial(
  nw: NodeWrangler,
  options?: MaterialCompileOptions,
): THREE.ShaderMaterial {
  const opts: Required<MaterialCompileOptions> = {
    wireframe: options?.wireframe ?? false,
    doubleSided: options?.doubleSided ?? false,
    transparent: options?.transparent ?? false,
    opacity: options?.opacity ?? 1.0,
    usePhysicalFallback: options?.usePhysicalFallback ?? false,
  };

  const group = nw.getActiveGroup();

  // Convert NodeWrangler group to the NodeGraph format expected by the compiler.
  // NodeWrangler uses its own NodeInstance/NodeLink types internally, which
  // differ from the core/types definitions. We adapt here by using `as any`
  // since the evaluator/compiler access the same fields at runtime.
  const nodeGraph: any = {
    nodes: group.nodes,
    links: Array.from(group.links.values()),
  };

  // Use the existing shader compiler pipeline
  const evaluator = new NodeEvaluator();
  const compiler = new NodeShaderCompiler(evaluator);

  try {
    const result = compiler.compile(nodeGraph);

    if (result.errors.length > 0 || opts.usePhysicalFallback) {
      // Fall back to MeshPhysicalMaterial
      const evalResult = evaluator.evaluate(nodeGraph, EvaluationMode.MATERIAL);
      return createPhysicalMaterialFromEval(evalResult.value, opts) as any;
    }

    // Apply compile options to the generated material
    const material = result.material;
    material.wireframe = opts.wireframe;
    material.side = opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    material.transparent = opts.transparent || opts.opacity < 1.0;

    if (opts.opacity < 1.0 && material.uniforms.u_alpha) {
      material.uniforms.u_alpha.value = opts.opacity;
    }

    return material;
  } catch (error) {
    console.warn('[compileShaderGraphToMaterial] Compilation failed, using fallback:', error);
    return createFallbackShaderMaterial(opts) as any;
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Get the appropriate noise function based on type string.
 */
function getNoiseFn(
  noise: SeededNoiseGenerator,
  noiseType: string,
): (x: number, y: number, z: number) => number {
  switch (noiseType.toLowerCase()) {
    case 'simplex':
      return (x, y, z) => noise.simplex3D(x, y, z);
    case 'voronoi':
    case 'worley':
      return (x, y, z) => noise.voronoi3D(x, y, z);
    case 'perlin':
    default:
      return (x, y, z) => noise.perlin3D(x, y, z);
  }
}

/**
 * Create a MeshPhysicalMaterial from the evaluation output of a shader graph.
 * Now uses the NodeGraphMaterialBridge for consistent property mapping.
 */
function createPhysicalMaterialFromEval(
  evalOutput: any,
  opts: Required<MaterialCompileOptions>,
): THREE.MeshPhysicalMaterial {
  // Use the new bridge for consistent conversion
  const bridge = new NodeGraphMaterialBridge({
    textureResolution: 512,
    processTextureDescriptors: true,
  });

  const material = bridge.convert(evalOutput);

  // Apply compile options
  material.wireframe = opts.wireframe;
  material.side = opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  if (opts.transparent || opts.opacity < 1.0) {
    material.transparent = true;
  }
  if (opts.opacity < 1.0) {
    material.opacity = opts.opacity;
  }

  return material;
}

/**
 * Create a simple fallback material.
 */
function createFallbackMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x888888,
    roughness: 0.5,
    metalness: 0.0,
  });
}

/**
 * Create a minimal fallback ShaderMaterial with basic PBR lighting.
 */
function createFallbackShaderMaterial(
  opts: Required<MaterialCompileOptions>,
): THREE.ShaderMaterial {
  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    precision highp float;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    uniform vec3 cameraPosition;
    uniform vec3 uBaseColor;
    uniform float uRoughness;
    uniform float uMetallic;
    uniform float uOpacity;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorldPosition);
      vec3 L = normalize(vec3(0.5, 1.0, 0.8));

      float NdotL = max(dot(N, L), 0.0);
      vec3 diffuse = uBaseColor * NdotL / 3.14159;
      vec3 ambient = uBaseColor * 0.15;
      vec3 color = ambient + diffuse;

      // Simple specular
      vec3 H = normalize(V + L);
      float spec = pow(max(dot(N, H), 0.0), mix(256.0, 4.0, uRoughness));
      vec3 F = mix(vec3(0.04), uBaseColor, uMetallic);
      color += F * spec * NdotL;

      // Tone mapping
      color = color / (color + vec3(1.0));
      color = pow(color, vec3(1.0 / 2.2));

      gl_FragColor = vec4(color, uOpacity);
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uBaseColor: { value: new THREE.Vector3(0.53, 0.53, 0.53) },
      uRoughness: { value: 0.5 },
      uMetallic: { value: 0.0 },
      uOpacity: { value: opts.opacity },
    },
    wireframe: opts.wireframe,
    side: opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    transparent: opts.transparent || opts.opacity < 1.0,
  });
}

/**
 * Resolve a color value to a THREE.Color.
 */
function resolveColor(value: any): THREE.Color {
  if (value instanceof THREE.Color) return value.clone();
  if (typeof value === 'string') return new THREE.Color(value);
  if (typeof value === 'number') return new THREE.Color(value);
  if (value && typeof value === 'object') {
    if ('r' in value && 'g' in value && 'b' in value) {
      return new THREE.Color(value.r, value.g, value.b);
    }
  }
  return new THREE.Color(0.53, 0.53, 0.53);
}

export default {
  add_geomod,
  add_material,
  shaderfunc_to_material,
  create_surface_material,
  compileShaderGraphToMaterial,
};
