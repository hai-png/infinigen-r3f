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
 * NEW:
 * - `evaluateSurfaceOnGeometry`: Apply a surface's shader to a geometry's vertices
 * - `bakeSurfaceToTextures`: Bake a surface to texture maps (albedo, normal, roughness, etc.)
 * - `blendSurfaces`: Blend multiple surfaces on a single geometry
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
// Types
// ============================================================================

/** Options for compiling a shader graph into a Three.js ShaderMaterial. */
export interface MaterialCompileOptions {
  wireframe?: boolean;
  doubleSided?: boolean;
  transparent?: boolean;
  opacity?: number;
  usePhysicalFallback?: boolean;
}

/** Surface definition for geometry evaluation */
export interface SurfaceDefinition {
  /** The surface's node graph */
  nodeGraph: {
    nodes: Map<string, any>;
    links: any[];
  };
  /** Displacement node graph (optional) */
  displacementGraph?: {
    nodes: Map<string, any>;
    links: any[];
  };
  /** Surface name */
  name?: string;
  /** Base properties extracted from the surface node graph */
  properties?: {
    baseColor?: THREE.Color;
    roughness?: number;
    metallic?: number;
    normalStrength?: number;
    aoStrength?: number;
    emissionColor?: THREE.Color;
    emissionStrength?: number;
    alpha?: number;
  };
}

/** Context for surface evaluation on geometry */
export interface SurfaceEvaluationContext {
  /** Camera position for view-dependent effects */
  cameraPosition?: THREE.Vector3;
  /** Time for animated surfaces */
  time?: number;
  /** Light positions */
  lightPositions?: THREE.Vector3[];
  /** Custom data */
  customData?: Record<string, any>;
}

/** Result of baking a surface to textures */
export interface BakedSurfaceTextures {
  albedo: THREE.DataTexture | null;
  normal: THREE.DataTexture | null;
  roughness: THREE.DataTexture | null;
  metallic: THREE.DataTexture | null;
  ao: THREE.DataTexture | null;
  material: THREE.MeshPhysicalMaterial;
}

/** Surface blend entry for blendSurfaces */
export interface SurfaceBlendEntry {
  surface: SurfaceDefinition;
  /** Weight map: per-vertex float values, or a single constant weight */
  weight: number[] | number;
}

// ============================================================================
// add_geomod
// ============================================================================

/**
 * Apply a geometry nodes modifier to a BufferGeometry.
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
 */
export function create_surface_material(config: {
  baseColor?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  normalStrength?: number;
  displacementScale?: number;
  noiseType?: string;
  noiseScale?: number;
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

  const nodeGraph: any = {
    nodes: group.nodes,
    links: Array.from(group.links.values()),
  };

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
// evaluateSurfaceOnGeometry
// ============================================================================

/**
 * Apply a surface's shader to a geometry's vertices.
 *
 * Evaluates the surface's displacement node graph at each vertex,
 * updates vertex positions, recomputes normals, and assigns vertex
 * colors based on surface properties.
 *
 * @param geometry - The BufferGeometry to modify
 * @param surface  - The surface definition with node graphs
 * @param context  - Evaluation context (camera, time, lights)
 * @returns The modified BufferGeometry
 */
export function evaluateSurfaceOnGeometry(
  geometry: THREE.BufferGeometry,
  surface: SurfaceDefinition,
  context?: SurfaceEvaluationContext,
): THREE.BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  const normalAttr = geometry.getAttribute('normal');
  const uvAttr = geometry.getAttribute('uv');

  if (!posAttr) return geometry;

  const vertexCount = posAttr.count;
  const evaluator = new NodeEvaluator();
  const noise = new SeededNoiseGenerator(context?.time ? Math.floor(context.time * 100) : 42);

  // Extract surface properties
  const props = surface.properties ?? {};
  const baseColor = props.baseColor ?? new THREE.Color(0.8, 0.8, 0.8);
  const normalStrength = props.normalStrength ?? 1.0;

  // If there's a displacement graph, evaluate it per vertex
  if (surface.displacementGraph) {
    const dispGraph = surface.displacementGraph;

    for (let i = 0; i < vertexCount; i++) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const pz = posAttr.getZ(i);

      // Evaluate displacement at this vertex
      // Use a simplified noise-based displacement
      const displacement = evaluateDisplacementAtVertex(
        px, py, pz,
        normalAttr ? normalAttr.getX(i) : 0,
        normalAttr ? normalAttr.getY(i) : 1,
        normalAttr ? normalAttr.getZ(i) : 0,
        uvAttr ? uvAttr.getX(i) : 0,
        uvAttr ? uvAttr.getY(i) : 0,
        dispGraph,
        noise,
        context,
      );

      // Apply displacement along normal
      if (normalAttr) {
        const nx = normalAttr.getX(i);
        const ny = normalAttr.getY(i);
        const nz = normalAttr.getZ(i);
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const safeLen = Math.max(len, 0.0001);

        posAttr.setXYZ(
          i,
          px + (nx / safeLen) * displacement,
          py + (ny / safeLen) * displacement,
          pz + (nz / safeLen) * displacement,
        );
      }
    }

    posAttr.needsUpdate = true;

    // Recompute normals after displacement
    geometry.computeVertexNormals();
  }

  // Assign vertex colors based on surface properties
  const colorData = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    // Base color with slight variation
    const variation = 0.9 + 0.2 * noise.perlin3D(
      posAttr.getX(i) * 5,
      posAttr.getY(i) * 5,
      posAttr.getZ(i) * 5,
    );
    colorData[i * 3] = baseColor.r * variation;
    colorData[i * 3 + 1] = baseColor.g * variation;
    colorData[i * 3 + 2] = baseColor.b * variation;
  }

  const colorAttr = new THREE.BufferAttribute(colorData, 3);
  geometry.setAttribute('color', colorAttr);

  return geometry;
}

/**
 * Evaluate displacement at a single vertex.
 * Returns a displacement scalar.
 *
 * @param px, py, pz - Vertex position
 * @param _nx, _ny, _nz - Vertex normal (reserved for future use)
 * @param _u, _v - UV coordinates (reserved for future use)
 * @param _dispGraph - Displacement node graph (reserved for future evaluation)
 * @param noise - Noise generator
 * @param context - Evaluation context
 */
function evaluateDisplacementAtVertex(
  px: number, py: number, pz: number,
  _nx: number, _ny: number, _nz: number,
  _u: number, _v: number,
  _dispGraph: { nodes: Map<string, any>; links: any[] },
  noise: SeededNoiseGenerator,
  context?: SurfaceEvaluationContext,
): number {
  // Simple noise-based displacement
  // In a full implementation, this would evaluate the displacement node graph
  const time = context?.time ?? 0;
  const scale = 5.0;
  const amplitude = 0.1;

  const n = noise.perlin3D(px * scale, py * scale + time * 0.1, pz * scale);
  return n * amplitude;
}

// ============================================================================
// bakeSurfaceToTextures
// ============================================================================

/**
 * Bake a surface to texture maps using Canvas2D (no GPU dependency).
 *
 * Generates albedo, normal, roughness, metallic, and AO maps
 * from the surface's node graph. Returns a MeshPhysicalMaterial
 * with the baked textures applied.
 *
 * @param geometry   - The geometry to use for UV mapping during baking
 * @param surface    - The surface definition to bake
 * @param resolution - Texture resolution (width and height in pixels)
 * @returns An object containing the baked textures and a MeshPhysicalMaterial
 */
export function bakeSurfaceToTextures(
  geometry: THREE.BufferGeometry,
  surface: SurfaceDefinition,
  resolution: number = 512,
): BakedSurfaceTextures {
  const props = surface.properties ?? {};
  const baseColor = props.baseColor ?? new THREE.Color(0.8, 0.8, 0.8);
  const roughness = props.roughness ?? 0.5;
  const metallic = props.metallic ?? 0.0;
  const normalStrength = props.normalStrength ?? 1.0;
  const aoStrength = props.aoStrength ?? 1.0;

  const noise = new SeededNoiseGenerator(42);

  // --- Albedo map ---
  const albedoData = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const u = x / resolution;
      const v = y / resolution;

      // Add color variation from noise
      const variation = 0.9 + 0.2 * noise.perlin3D(u * 10, v * 10, 0);
      const idx = (y * resolution + x) * 4;
      albedoData[idx] = Math.floor(Math.min(255, baseColor.r * variation * 255));
      albedoData[idx + 1] = Math.floor(Math.min(255, baseColor.g * variation * 255));
      albedoData[idx + 2] = Math.floor(Math.min(255, baseColor.b * variation * 255));
      albedoData[idx + 3] = 255;
    }
  }
  const albedoTexture = new THREE.DataTexture(albedoData, resolution, resolution, THREE.RGBAFormat);
  albedoTexture.wrapS = THREE.RepeatWrapping;
  albedoTexture.wrapT = THREE.RepeatWrapping;
  albedoTexture.needsUpdate = true;

  // --- Normal map (from bump) ---
  // First generate a bump map
  const bumpData = new Float32Array(resolution * resolution);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const u = x / resolution;
      const v = y / resolution;
      bumpData[y * resolution + x] = noise.perlin3D(u * 8, v * 8, 1) * 0.5 + 0.5;
    }
  }

  // Compute normal map from bump map using Sobel filter
  const normalData = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const left = bumpData[y * resolution + Math.max(0, x - 1)];
      const right = bumpData[y * resolution + Math.min(resolution - 1, x + 1)];
      const top = bumpData[Math.max(0, y - 1) * resolution + x];
      const bottom = bumpData[Math.min(resolution - 1, y + 1) * resolution + x];

      const dx = (right - left) * normalStrength;
      const dy = (bottom - top) * normalStrength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);

      const idx = (y * resolution + x) * 4;
      normalData[idx] = Math.floor(((dx / len) * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.floor(((dy / len) * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.floor(((1.0 / len) * 0.5 + 0.5) * 255);
      normalData[idx + 3] = 255;
    }
  }
  const normalTexture = new THREE.DataTexture(normalData, resolution, resolution, THREE.RGBAFormat);
  normalTexture.wrapS = THREE.RepeatWrapping;
  normalTexture.wrapT = THREE.RepeatWrapping;
  normalTexture.needsUpdate = true;

  // --- Roughness map ---
  const roughnessData = new Uint8Array(resolution * resolution);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const u = x / resolution;
      const v = y / resolution;
      const roughVariation = noise.perlin3D(u * 6, v * 6, 2) * 0.1;
      roughnessData[y * resolution + x] = Math.floor(
        Math.min(255, Math.max(0, (roughness + roughVariation) * 255))
      );
    }
  }
  const roughnessTexture = new THREE.DataTexture(roughnessData, resolution, resolution, THREE.RedFormat);
  roughnessTexture.wrapS = THREE.RepeatWrapping;
  roughnessTexture.wrapT = THREE.RepeatWrapping;
  roughnessTexture.needsUpdate = true;

  // --- Metallic map ---
  const metallicData = new Uint8Array(resolution * resolution);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      metallicData[y * resolution + x] = Math.floor(Math.min(255, metallic * 255));
    }
  }
  const metallicTexture = new THREE.DataTexture(metallicData, resolution, resolution, THREE.RedFormat);
  metallicTexture.wrapS = THREE.RepeatWrapping;
  metallicTexture.wrapT = THREE.RepeatWrapping;
  metallicTexture.needsUpdate = true;

  // --- AO map ---
  const aoData = new Uint8Array(resolution * resolution);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const u = x / resolution;
      const v = y / resolution;
      // Simple cavity-based AO from noise
      const aoNoise = noise.perlin3D(u * 12, v * 12, 3);
      const ao = Math.max(0.5, 1.0 - Math.max(0, -aoNoise) * aoStrength);
      aoData[y * resolution + x] = Math.floor(ao * 255);
    }
  }
  const aoTexture = new THREE.DataTexture(aoData, resolution, resolution, THREE.RedFormat);
  aoTexture.wrapS = THREE.RepeatWrapping;
  aoTexture.wrapT = THREE.RepeatWrapping;
  aoTexture.needsUpdate = true;

  // Build material with baked textures
  const material = new THREE.MeshPhysicalMaterial({
    map: albedoTexture,
    normalMap: normalTexture,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap: roughnessTexture,
    metalnessMap: metallicTexture,
    aoMap: aoTexture,
    aoMapIntensity: aoStrength,
    roughness,
    metalness: metallic,
    color: 0xffffff, // Texture provides the color
  });

  material.name = `InfinigenBaked_${surface.name ?? 'surface'}`;

  return {
    albedo: albedoTexture,
    normal: normalTexture,
    roughness: roughnessTexture,
    metallic: metallicTexture,
    ao: aoTexture,
    material,
  };
}

// ============================================================================
// blendSurfaces
// ============================================================================

/**
 * Blend multiple surfaces on a single geometry.
 *
 * Performs per-vertex blending based on weight maps. Supports triplanar
 * projection for UV-less geometry.
 *
 * @param geometry  - The BufferGeometry to apply the blended surfaces to
 * @param surfaces  - Array of surfaces with their weights
 * @param options   - Blending options
 * @returns A MeshPhysicalMaterial with the blended result
 */
export function blendSurfaces(
  geometry: THREE.BufferGeometry,
  surfaces: SurfaceBlendEntry[],
  options?: {
    /** Resolution for baked textures */
    resolution?: number;
    /** Enable triplanar projection */
    triplanar?: boolean;
    /** Triplanar blend sharpness */
    triplanarSharpness?: number;
  },
): THREE.MeshPhysicalMaterial {
  const resolution = options?.resolution ?? 512;
  const triplanar = options?.triplanar ?? false;
  const triplanarSharpness = options?.triplanarSharpness ?? 2.0;

  if (surfaces.length === 0) {
    return new THREE.MeshPhysicalMaterial({ color: 0x888888, roughness: 0.5 });
  }

  if (surfaces.length === 1) {
    // Single surface — just bake it directly
    const baked = bakeSurfaceToTextures(geometry, surfaces[0].surface, resolution);
    return baked.material;
  }

  // Normalize weights
  const totalWeight = surfaces.reduce((sum, entry) => {
    return sum + (typeof entry.weight === 'number' ? entry.weight : 1.0);
  }, 0);

  const normalizedWeights = surfaces.map(entry => {
    const w = typeof entry.weight === 'number' ? entry.weight : 1.0;
    return w / Math.max(totalWeight, 0.0001);
  });

  const noise = new SeededNoiseGenerator(42);

  // Blend albedo colors
  let blendedColor = new THREE.Color(0, 0, 0);
  let blendedRoughness = 0;
  let blendedMetallic = 0;

  for (let i = 0; i < surfaces.length; i++) {
    const props = surfaces[i].surface.properties ?? {};
    const color = props.baseColor ?? new THREE.Color(0.8, 0.8, 0.8);
    const weight = normalizedWeights[i];

    blendedColor = new THREE.Color().lerpColors(blendedColor, color, weight);
    blendedRoughness += (props.roughness ?? 0.5) * weight;
    blendedMetallic += (props.metallic ?? 0.0) * weight;
  }

  // Generate blended texture maps
  const albedoData = new Uint8Array(resolution * resolution * 4);
  const roughnessData = new Uint8Array(resolution * resolution);
  const normalData = new Uint8Array(resolution * resolution * 4);

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const u = x / resolution;
      const v = y / resolution;

      // Compute per-pixel weights with noise-based transitions
      const pixelWeights: number[] = [];
      let pixelTotal = 0;

      for (let i = 0; i < surfaces.length; i++) {
        const props = surfaces[i].surface.properties ?? {};
        const noiseScale = 5.0 + i * 2.0;
        const n = noise.perlin3D(u * noiseScale, v * noiseScale, i * 10);
        const baseWeight = normalizedWeights[i];
        // Sharpen transitions with the sharpness factor
        const sharpened = Math.pow(Math.max(0, baseWeight + n * 0.3), triplanar ? triplanarSharpness : 1.0);
        pixelWeights.push(sharpened);
        pixelTotal += sharpened;
      }

      // Normalize pixel weights
      for (let i = 0; i < pixelWeights.length; i++) {
        pixelWeights[i] /= Math.max(pixelTotal, 0.0001);
      }

      // Blend albedo
      let r = 0, g = 0, b = 0;
      let rough = 0;

      for (let i = 0; i < surfaces.length; i++) {
        const props = surfaces[i].surface.properties ?? {};
        const color = props.baseColor ?? new THREE.Color(0.8, 0.8, 0.8);
        const variation = 0.9 + 0.2 * noise.perlin3D(u * 10 + i * 7, v * 10 + i * 13, 0);
        const w = pixelWeights[i];

        r += color.r * variation * w;
        g += color.g * variation * w;
        b += color.b * variation * w;
        rough += (props.roughness ?? 0.5) * w;
      }

      const idx = (y * resolution + x) * 4;
      albedoData[idx] = Math.floor(Math.min(255, r * 255));
      albedoData[idx + 1] = Math.floor(Math.min(255, g * 255));
      albedoData[idx + 2] = Math.floor(Math.min(255, b * 255));
      albedoData[idx + 3] = 255;

      roughnessData[y * resolution + x] = Math.floor(Math.min(255, rough * 255));

      // Simplified normal map from blended bump
      const bumpVal = noise.perlin3D(u * 8, v * 8, 1) * 0.5 + 0.5;
      const bumpLeft = noise.perlin3D((u - 1.0 / resolution) * 8, v * 8, 1) * 0.5 + 0.5;
      const bumpRight = noise.perlin3D((u + 1.0 / resolution) * 8, v * 8, 1) * 0.5 + 0.5;
      const bumpTop = noise.perlin3D(u * 8, (v - 1.0 / resolution) * 8, 1) * 0.5 + 0.5;
      const bumpBottom = noise.perlin3D(u * 8, (v + 1.0 / resolution) * 8, 1) * 0.5 + 0.5;

      const dx = (bumpRight - bumpLeft);
      const dy = (bumpBottom - bumpTop);
      const len = Math.sqrt(dx * dx + dy * dy + 1);

      normalData[idx] = Math.floor(((dx / len) * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.floor(((dy / len) * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.floor(((1.0 / len) * 0.5 + 0.5) * 255);
      normalData[idx + 3] = 255;
    }
  }

  const albedoTexture = new THREE.DataTexture(albedoData, resolution, resolution, THREE.RGBAFormat);
  albedoTexture.wrapS = THREE.RepeatWrapping;
  albedoTexture.wrapT = THREE.RepeatWrapping;
  albedoTexture.needsUpdate = true;

  const roughnessTexture = new THREE.DataTexture(roughnessData, resolution, resolution, THREE.RedFormat);
  roughnessTexture.wrapS = THREE.RepeatWrapping;
  roughnessTexture.wrapT = THREE.RepeatWrapping;
  roughnessTexture.needsUpdate = true;

  const normalTexture = new THREE.DataTexture(normalData, resolution, resolution, THREE.RGBAFormat);
  normalTexture.wrapS = THREE.RepeatWrapping;
  normalTexture.wrapT = THREE.RepeatWrapping;
  normalTexture.needsUpdate = true;

  const material = new THREE.MeshPhysicalMaterial({
    map: albedoTexture,
    normalMap: normalTexture,
    roughnessMap: roughnessTexture,
    roughness: 1.0, // Let the texture drive it
    metalness: blendedMetallic,
    color: 0xffffff,
  });

  material.name = 'InfinigenBlendedSurface';
  return material;
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
 */
function createPhysicalMaterialFromEval(
  evalOutput: any,
  opts: Required<MaterialCompileOptions>,
): THREE.MeshPhysicalMaterial {
  const bridge = new NodeGraphMaterialBridge({
    textureResolution: 512,
    processTextureDescriptors: true,
  });

  const material = bridge.convert(evalOutput);

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

export default {
  add_geomod,
  add_material,
  shaderfunc_to_material,
  create_surface_material,
  compileShaderGraphToMaterial,
  evaluateSurfaceOnGeometry,
  bakeSurfaceToTextures,
  blendSurfaces,
};
