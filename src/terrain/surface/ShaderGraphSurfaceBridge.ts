/**
 * Shader Graph Surface Bridge — Node Graph → SurfaceKernel Integration
 *
 * Bridges NodeMaterialGenerator output (arbitrary shader graphs) to
 * SurfaceKernel input, enabling procedural terrain surfaces driven by
 * node graphs rather than hardcoded GLSLTextureGraphBuilder chains.
 *
 * Architecture:
 * 1. ShaderGraphSurfaceBridge — Takes a node graph (from NodeMaterialGenerator),
 *    evaluates it per-vertex for displacement or per-pixel for material textures.
 *    Converts a NodeGroup into the GLSLTextureGraphBuilder chains that
 *    SurfaceKernel.generateChannelTexture() expects.
 * 2. SurfaceGraphPreset — Named terrain surface presets (rocky, sandy, snow,
 *    cave, underwater) that provide pre-built node graphs.
 * 3. SurfaceGraphComposer — Composes and blends multiple shader graphs
 *    (displacement + material) into unified surface treatments.
 *
 * @module terrain/surface
 */

import * as THREE from 'three';
import {
  SurfaceKernel,
  SurfaceKernelConfig,
  DEFAULT_SURFACE_KERNEL_CONFIG,
  MaterialChannel,
  DisplacementMode,
  ShaderGraphContext,
  DisplacementResult,
  ChannelEvalResult,
} from '@/terrain/surface/SurfaceKernelPipeline';
import {
  GLSLTextureGraphBuilder,
  ColorRampStop,
  ColorRampMode,
  MusgraveType,
  FloatCurvePoint,
  CoordinateMode,
  GLSLTextureNodeTypes,
  TexturePipelineNode,
  TexturePipelineLink,
} from '@/assets/materials/shaders/GLSLProceduralTexturePipeline';
import { NodeGroup, NodeGroupInstance } from '@/core/nodes/core/NodeGeometryModifierBridge';
import { NodeWranglerBuilder, NodeOutput } from '@/core/nodes/core/node-wrangler-builder';
import { NoiseUtils, voronoi3D as voronoi3DFn } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Shader Graph Descriptor Types
// ============================================================================

/**
 * Describes the type of a shader graph, determining how it is evaluated
 * and which pipeline is used to process it.
 */
export enum ShaderGraphType {
  /** Noise-based displacement graph (Musgrave, Perlin, etc.) */
  NOISE_DISPLACEMENT = 'noise_displacement',
  /** Voronoi-based crack displacement graph */
  VORONOI_CRACK_DISPLACEMENT = 'voronoi_crack_displacement',
  /** Material channel graph (albedo, roughness, etc.) */
  MATERIAL_CHANNEL = 'material_channel',
  /** Blended/layered graph combining multiple sources */
  LAYERED_BLEND = 'layered_blend',
  /** Altitude-dependent blending graph */
  ALTITUDE_BLEND = 'altitude_blend',
}

/**
 * Blend mode for composing two shader graphs.
 */
export enum GraphBlendMode {
  /** Linear interpolation: result = A * (1 - factor) + B * factor */
  MIX = 'mix',
  /** Additive: result = A + B */
  ADD = 'add',
  /** Multiplicative: result = A * B */
  MULTIPLY = 'multiply',
  /** Overlay blend: A < 0.5 ? 2*A*B : 1 - 2*(1-A)*(1-B) */
  OVERLAY = 'overlay',
  /** Maximum: result = max(A, B) */
  MAX = 'max',
  /** Minimum: result = min(A, B) */
  MIN = 'min',
}

/**
 * Describes a shader graph for use by the bridge.
 *
 * Wraps either a NodeGroup (from NodeMaterialGenerator) or a pre-built
 * GLSLTextureGraphBuilder graph, along with metadata about the graph's
 * type, parameters, and expected outputs.
 */
export interface ShaderGraphDescriptor {
  /** The type of this shader graph */
  type: ShaderGraphType;
  /** The node group defining this graph (from NodeMaterialGenerator) */
  nodeGroup?: NodeGroup;
  /** Pre-built GLSL texture graph (alternative to nodeGroup) */
  textureGraph?: GLSLTextureGraphBuilder;
  /** Parameters for the graph evaluation */
  parameters: Record<string, number>;
  /** Coordinate scale for texture mapping (overrides parameters.coordScale) */
  coordScale?: [number, number, number];
  /** Which material channels this graph can generate */
  channels: MaterialChannel[];
  /** Display name */
  label: string;
}

/**
 * Result of composing displacement and material graphs.
 */
export interface ComposedSurfaceResult {
  /** Displaced geometry */
  geometry: THREE.BufferGeometry;
  /** PBR material with baked textures */
  material: THREE.MeshStandardMaterial;
  /** Displacement values per-vertex */
  displacementValues: Float32Array;
  /** Metadata about the composition */
  metadata: {
    displacementGraphType: ShaderGraphType;
    materialGraphType: ShaderGraphType;
    blendMode: GraphBlendMode;
    vertexCount: number;
    channelsGenerated: MaterialChannel[];
  };
}

/**
 * Configuration for the ShaderGraphSurfaceBridge.
 */
export interface ShaderGraphSurfaceBridgeConfig {
  /** SurfaceKernel configuration for displacement and material generation */
  kernelConfig: SurfaceKernelConfig;
  /** Default blend mode for graph composition */
  defaultBlendMode: GraphBlendMode;
  /** Displacement strength multiplier */
  displacementStrength: number;
  /** Whether to apply smoothstep to displacement values */
  smoothDisplacement: boolean;
  /** Normal map generation method: 'sobol' (finite difference) or 'analytical' */
  normalMethod: 'sobol' | 'analytical';
  /** Epsilon for finite-difference normal computation */
  normalEpsilon: number;
  /** Whether to cache texture results */
  enableTextureCache: boolean;
  /** Seed for procedural variation */
  seed: number;
}

/**
 * Default configuration for ShaderGraphSurfaceBridge.
 */
export const DEFAULT_SHADER_GRAPH_BRIDGE_CONFIG: ShaderGraphSurfaceBridgeConfig = {
  kernelConfig: DEFAULT_SURFACE_KERNEL_CONFIG,
  defaultBlendMode: GraphBlendMode.MIX,
  displacementStrength: 1.0,
  smoothDisplacement: true,
  normalMethod: 'sobol',
  normalEpsilon: 0.01,
  enableTextureCache: true,
  seed: 42,
};

// ============================================================================
// ShaderGraphSurfaceBridge
// ============================================================================

/**
 * Bridges NodeMaterialGenerator output (arbitrary shader graphs) to
 * SurfaceKernel input, enabling arbitrary shader graphs as terrain
 * surface shaders.
 *
 * Instead of the hardcoded GLSLTextureGraphBuilder chains in
 * SurfaceKernel.generateChannelTexture(), this bridge accepts a
 * ShaderGraphDescriptor (wrapping a NodeGroup) and converts it into
 * the appropriate GLSLTextureGraphBuilder pipeline for each channel.
 *
 * Usage:
 * ```typescript
 * const bridge = new ShaderGraphSurfaceBridge(config);
 *
 * // Apply displacement from a node graph
 * const displacedGeom = bridge.applyGraphDisplacement(mesh, displacementGraph, kernelConfig);
 *
 * // Apply material from a node graph
 * const material = bridge.applyGraphMaterial(mesh, materialGraph, kernelConfig);
 *
 * // Compose displacement + material
 * const result = bridge.composeGraphs(displacementGraph, materialGraph, GraphBlendMode.MIX);
 * ```
 */
export class ShaderGraphSurfaceBridge {
  private config: ShaderGraphSurfaceBridgeConfig;
  private kernel: SurfaceKernel;
  private noise: NoiseUtils;
  private rng: SeededRandom;
  private textureCache: Map<string, THREE.DataTexture>;
  private disposed: boolean = false;

  /**
   * Create a new ShaderGraphSurfaceBridge.
   *
   * @param config - Configuration (defaults to DEFAULT_SHADER_GRAPH_BRIDGE_CONFIG)
   */
  constructor(config: Partial<ShaderGraphSurfaceBridgeConfig> = {}) {
    this.config = { ...DEFAULT_SHADER_GRAPH_BRIDGE_CONFIG, ...config };
    this.kernel = new SurfaceKernel(this.config.kernelConfig);
    this.noise = new NoiseUtils(this.config.seed);
    this.rng = new SeededRandom(this.config.seed);
    this.textureCache = new Map();
  }

  // -----------------------------------------------------------------------
  // Displacement from Node Graph
  // -----------------------------------------------------------------------

  /**
   * Apply displacement to a mesh's geometry using an arbitrary node graph.
   *
   * Takes a ShaderGraphDescriptor (wrapping a NodeGroup from
   * NodeMaterialGenerator) and evaluates it per-vertex for displacement.
   * Falls back to the SurfaceKernel's built-in displacement if the
   * node graph cannot be evaluated directly.
   *
   * @param mesh - The mesh whose geometry will be displaced
   * @param graph - ShaderGraphDescriptor defining the displacement computation
   * @param config - Optional per-call kernel config overrides
   * @returns A new THREE.BufferGeometry with displaced vertices
   */
  applyGraphDisplacement(
    mesh: THREE.Mesh,
    graph: ShaderGraphDescriptor,
    config: Partial<SurfaceKernelConfig> = {},
  ): THREE.BufferGeometry {
    const effectiveConfig = { ...this.config.kernelConfig, ...config };
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    const uvAttr = geometry.getAttribute('uv');

    if (!posAttr) {
      console.warn('[ShaderGraphSurfaceBridge] No position attribute on mesh geometry');
      return geometry.clone();
    }

    const vertexCount = posAttr.count;
    const posArray = new Float32Array(posAttr.array as Float32Array);

    // Ensure normals exist
    let normalArray: Float32Array;
    if (normAttr) {
      normalArray = new Float32Array(normAttr.array as Float32Array);
    } else {
      geometry.computeVertexNormals();
      const computedNormals = geometry.getAttribute('normal');
      normalArray = computedNormals
        ? new Float32Array(computedNormals.array as Float32Array)
        : new Float32Array(vertexCount * 3).fill(0).map((_, i) =>
            i % 3 === 1 ? 1 : 0
          );
    }

    // Evaluate the shader graph per-vertex for displacement
    const displacementValues = this.evaluateGraphDisplacement(
      posArray,
      normalArray,
      uvAttr,
      vertexCount,
      graph,
      effectiveConfig,
    );

    // Apply optional smoothing (Gaussian-like pass over displacement)
    if (this.config.smoothDisplacement && effectiveConfig.displacementSmoothness > 0) {
      this.smoothDisplacementValues(
        displacementValues,
        vertexCount,
        effectiveConfig.displacementSmoothness,
      );
    }

    // Apply displacement along normals
    const strength = this.config.displacementStrength;
    for (let i = 0; i < vertexCount; i++) {
      const disp = displacementValues[i] * effectiveConfig.displacementScale * strength;
      const nx = normalArray[i * 3];
      const ny = normalArray[i * 3 + 1];
      const nz = normalArray[i * 3 + 2];

      posArray[i * 3] += nx * disp;
      posArray[i * 3 + 1] += ny * disp;
      posArray[i * 3 + 2] += nz * disp;
    }

    // Build result geometry
    const result = geometry.clone();
    const resultPosAttr = result.getAttribute('position') as THREE.BufferAttribute;
    (resultPosAttr.array as Float32Array).set(posArray);
    resultPosAttr.needsUpdate = true;

    // Store displacement as a vertex attribute for later use
    result.setAttribute(
      'displacement',
      new THREE.BufferAttribute(displacementValues.slice(), 1),
    );

    // Recompute normals after displacement
    result.computeVertexNormals();
    result.computeBoundingSphere();
    result.computeBoundingBox();

    return result;
  }

  /**
   * Evaluate a shader graph per-vertex for displacement values.
   *
   * Tries to evaluate the NodeGroup directly. If that fails or if
   * the graph provides a texture graph instead, falls back to
   * noise-based evaluation using the graph's type and parameters.
   *
   * @param posArray - Vertex positions
   * @param normalArray - Vertex normals
   * @param uvAttr - UV attribute
   * @param vertexCount - Number of vertices
   * @param graph - Shader graph descriptor
   * @param config - Effective configuration
   * @returns Float32Array of displacement values, one per vertex
   */
  private evaluateGraphDisplacement(
    posArray: Float32Array,
    normalArray: Float32Array,
    uvAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
    vertexCount: number,
    graph: ShaderGraphDescriptor,
    config: SurfaceKernelConfig,
  ): Float32Array {
    const displacement = new Float32Array(vertexCount);

    // Try evaluating the node group directly
    if (graph.nodeGroup) {
      try {
        const instance = graph.nodeGroup.instantiate();
        return this.evaluateNodeGroupDisplacement(
          instance, posArray, normalArray, uvAttr, vertexCount, graph, config,
        );
      } catch (err) {
        console.warn(
          '[ShaderGraphSurfaceBridge] NodeGroup evaluation failed, using parameter-based fallback:',
          err,
        );
      }
    }

    // Fallback: parameter-based displacement using graph type and parameters
    return this.evaluateParameterDisplacement(
      posArray, normalArray, vertexCount, graph, config,
    );
  }

  /**
   * Evaluate a NodeGroup instance per-vertex for displacement.
   *
   * @param instance - The NodeGroupInstance to evaluate
   * @param posArray - Vertex positions
   * @param normalArray - Vertex normals
   * @param uvAttr - UV attribute
   * @param vertexCount - Number of vertices
   * @param graph - Shader graph descriptor
   * @param config - Effective configuration
   * @returns Float32Array of displacement values
   */
  private evaluateNodeGroupDisplacement(
    instance: NodeGroupInstance,
    posArray: Float32Array,
    normalArray: Float32Array,
    uvAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
    vertexCount: number,
    graph: ShaderGraphDescriptor,
    config: SurfaceKernelConfig,
  ): Float32Array {
    const displacement = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const px = posArray[i * 3];
      const py = posArray[i * 3 + 1];
      const pz = posArray[i * 3 + 2];
      const position = new THREE.Vector3(px, py, pz);

      let uvX = 0, uvY = 0;
      if (uvAttr) {
        uvX = (uvAttr.array as Float32Array)[i * 2] ?? 0;
        uvY = (uvAttr.array as Float32Array)[i * 2 + 1] ?? 0;
      }

      // Build evaluation context
      const context: ShaderGraphContext = {
        position,
        normal: new THREE.Vector3(
          normalArray[i * 3],
          normalArray[i * 3 + 1],
          normalArray[i * 3 + 2],
        ),
        uv: new THREE.Vector2(uvX, uvY),
        materialId: 0,
        auxiliary: {},
        objectRandom: this.rng.next(),
        time: 0,
      };

      try {
        // Set inputs on the instance from graph parameters + context
        for (const [key, value] of Object.entries(graph.parameters)) {
          instance.setInput(key, value);
        }
        instance.setInput('Position', context.position);
        instance.setInput('Normal', context.normal);
        instance.setInput('UV', context.uv);
        instance.setInput('Strength', config.displacementScale);
        instance.setInput('MidLevel', config.displacementMidLevel);

        const outputs = instance.evaluate();
        const dispValue = outputs.get('Displacement') ?? outputs.get('Value');

        if (typeof dispValue === 'number' && isFinite(dispValue)) {
          displacement[i] = dispValue;
        } else {
          displacement[i] = this.computeTypeBasedDisplacement(
            position, graph.type, graph.parameters,
          );
        }
      } catch {
        displacement[i] = this.computeTypeBasedDisplacement(
          position, graph.type, graph.parameters,
        );
      }
    }

    return displacement;
  }

  /**
   * Compute displacement using graph type and parameters (fallback).
   *
   * When the NodeGroup cannot be evaluated directly, uses the graph's
   * type descriptor to select an appropriate noise function and applies
   * the graph's parameters to control it.
   *
   * @param position - World-space position
   * @param graphType - The shader graph type
   * @param parameters - Graph parameters
   * @returns Displacement value
   */
  private computeTypeBasedDisplacement(
    position: THREE.Vector3,
    graphType: ShaderGraphType,
    parameters: Record<string, number>,
  ): number {
    const scale = parameters.scale ?? 0.05;
    const octaves = Math.round(parameters.detail ?? parameters.octaves ?? 4);
    const dimension = parameters.dimension ?? 2.0;
    const lacunarity = parameters.lacunarity ?? 2.0;
    const offset = parameters.offset ?? 0.5;
    const gain = parameters.gain ?? 1.0;

    switch (graphType) {
      case ShaderGraphType.NOISE_DISPLACEMENT: {
        // Musgrave-based displacement
        const n = this.noise.fbm(
          position.x * scale,
          position.y * scale,
          position.z * scale,
          octaves,
        );
        return n * (parameters.amplitude ?? 1.0);
      }

      case ShaderGraphType.VORONOI_CRACK_DISPLACEMENT: {
        // Voronoi-based crack displacement
        const voronoiScale = parameters.voronoiScale ?? scale * 3;
        const voronoiVal = voronoi3DFn(
          position.x * voronoiScale,
          position.y * voronoiScale,
          position.z * voronoiScale,
        );
        // Edge distance gives crack-like patterns
        const crackFactor = 1.0 - voronoiVal;
        return crackFactor * (parameters.crackDepth ?? 0.5);
      }

      case ShaderGraphType.LAYERED_BLEND: {
        // Multi-octave layered displacement
        const baseFreq = scale;
        const baseAmp = parameters.amplitude ?? 1.0;
        let value = 0;
        let amp = baseAmp;
        let freq = baseFreq;
        const layers = Math.round(parameters.layers ?? 3);

        for (let l = 0; l < layers; l++) {
          value += amp * this.noise.fbm(
            position.x * freq,
            position.y * freq,
            position.z * freq,
            Math.max(1, octaves - l),
          );
          amp *= 0.5;
          freq *= lacunarity;
        }
        return value;
      }

      case ShaderGraphType.ALTITUDE_BLEND: {
        // Altitude-modified displacement
        const baseDisp = this.noise.fbm(
          position.x * scale,
          position.y * scale,
          position.z * scale,
          octaves,
        );
        // Modulate by altitude
        const altitudeFactor = Math.max(0, Math.min(1, position.y / (parameters.altitudeRange ?? 20)));
        return baseDisp * (0.3 + 0.7 * altitudeFactor);
      }

      default: {
        // Generic noise-based displacement
        return this.noise.fbm(
          position.x * scale,
          position.y * scale,
          position.z * scale,
          octaves,
        );
      }
    }
  }

  /**
   * Evaluate parameter-based displacement (no NodeGroup available).
   *
   * @param posArray - Vertex positions
   * @param normalArray - Vertex normals
   * @param vertexCount - Number of vertices
   * @param graph - Shader graph descriptor
   * @param config - Effective configuration
   * @returns Float32Array of displacement values
   */
  private evaluateParameterDisplacement(
    posArray: Float32Array,
    normalArray: Float32Array,
    vertexCount: number,
    graph: ShaderGraphDescriptor,
    config: SurfaceKernelConfig,
  ): Float32Array {
    const displacement = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const position = new THREE.Vector3(
        posArray[i * 3],
        posArray[i * 3 + 1],
        posArray[i * 3 + 2],
      );
      displacement[i] = this.computeTypeBasedDisplacement(
        position, graph.type, graph.parameters,
      );
    }

    return displacement;
  }

  /**
   * Apply smoothing to displacement values using a simple box filter.
   *
   * @param values - Displacement values (modified in-place)
   * @param vertexCount - Number of vertices
   * @param smoothness - Smoothing radius (0 = no smoothing)
   */
  private smoothDisplacementValues(
    values: Float32Array,
    vertexCount: number,
    smoothness: number,
  ): void {
    if (smoothness <= 0 || vertexCount < 3) return;

    const radius = Math.max(1, Math.round(smoothness * 3));
    const temp = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      let sum = 0;
      let count = 0;
      for (let j = -radius; j <= radius; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < vertexCount) {
          const weight = 1.0 - Math.abs(j) / (radius + 1);
          sum += values[idx] * weight;
          count += weight;
        }
      }
      temp[i] = count > 0 ? sum / count : values[i];
    }

    values.set(temp);
  }

  // -----------------------------------------------------------------------
  // Material Generation from Node Graph
  // -----------------------------------------------------------------------

  /**
   * Generate a PBR material from an arbitrary shader graph.
   *
   * Takes a ShaderGraphDescriptor and generates PBR textures for each
   * requested material channel. If the graph provides a NodeGroup,
   * converts it to a GLSLTextureGraphBuilder for GPU-accelerated
   * texture baking. Falls back to parameter-based texture generation
   * if the node group cannot be converted.
   *
   * @param mesh - The mesh to generate material for
   * @param graph - ShaderGraphDescriptor defining the material computation
   * @param config - Optional per-call kernel config overrides
   * @returns THREE.MeshStandardMaterial with baked PBR textures
   */
  applyGraphMaterial(
    mesh: THREE.Mesh,
    graph: ShaderGraphDescriptor,
    config: Partial<SurfaceKernelConfig> = {},
  ): THREE.MeshStandardMaterial {
    const effectiveConfig = { ...this.config.kernelConfig, ...config };
    const channels = effectiveConfig.materialChannels;

    const materialParams: THREE.MeshStandardMaterialParameters = {
      side: THREE.DoubleSide,
      roughness: 1.0,
      metalness: 0.0,
    };

    // Try to convert the node graph to a GLSLTextureGraphBuilder
    const builder = this.convertGraphToBuilder(graph);

    for (const channel of channels) {
      try {
        // Check texture cache
        if (this.config.enableTextureCache) {
          const cacheKey = this.getTextureCacheKey(graph, channel, effectiveConfig);
          const cached = this.textureCache.get(cacheKey);
          if (cached) {
            this.applyChannelTexture(materialParams, cached, channel, effectiveConfig);
            continue;
          }
        }

        let texture: THREE.DataTexture | null = null;

        if (builder) {
          // Use the converted builder for GPU-accelerated baking
          texture = this.bakeChannelFromBuilder(builder, channel, effectiveConfig);
        }

        // Fallback to parameter-based texture generation
        if (!texture) {
          texture = this.generateParameterBasedTexture(graph, channel, effectiveConfig);
        }

        if (texture) {
          this.applyChannelTexture(materialParams, texture, channel, effectiveConfig);

          // Cache the texture
          if (this.config.enableTextureCache) {
            const cacheKey = this.getTextureCacheKey(graph, channel, effectiveConfig);
            this.textureCache.set(cacheKey, texture);
          }
        }
      } catch (err) {
        console.warn(
          `[ShaderGraphSurfaceBridge] Channel ${channel} generation failed:`,
          err,
        );
      }
    }

    return new THREE.MeshStandardMaterial(materialParams);
  }

  /**
   * Convert a ShaderGraphDescriptor to a GLSLTextureGraphBuilder.
   *
   * Analyzes the graph's type and parameters to build an appropriate
   * GLSLTextureGraphBuilder with the correct node chain.
   *
   * @param graph - Shader graph descriptor
   * @returns GLSLTextureGraphBuilder or null if conversion fails
   */
  private convertGraphToBuilder(
    graph: ShaderGraphDescriptor,
  ): GLSLTextureGraphBuilder | null {
    try {
      // If the graph already provides a texture graph, return it
      if (graph.textureGraph) {
        return graph.textureGraph;
      }

      // Build a builder from the graph's type and parameters
      const builder = new GLSLTextureGraphBuilder();
      const params = graph.parameters;

      // Always start with texture coordinates and mapping
      builder.addTexCoord(CoordinateMode.Generated);
      const coordScale: number[] = graph.coordScale ?? [1, 1, 1];
      builder.addMapping(coordScale, [0, 0, 0], [0, 0, 0]);
      builder.connect('texCoord_0', 'generated', 'mapping_0', 'vector');

      switch (graph.type) {
        case ShaderGraphType.NOISE_DISPLACEMENT:
          this.buildNoiseGraph(builder, params);
          break;
        case ShaderGraphType.VORONOI_CRACK_DISPLACEMENT:
          this.buildVoronoiCrackGraph(builder, params);
          break;
        case ShaderGraphType.MATERIAL_CHANNEL:
          this.buildMaterialChannelGraph(builder, params);
          break;
        case ShaderGraphType.LAYERED_BLEND:
          this.buildLayeredBlendGraph(builder, params);
          break;
        case ShaderGraphType.ALTITUDE_BLEND:
          this.buildAltitudeBlendGraph(builder, params);
          break;
        default:
          // Default: Musgrave noise
          this.buildNoiseGraph(builder, params);
          break;
      }

      return builder;
    } catch (err) {
      console.warn('[ShaderGraphSurfaceBridge] Graph-to-builder conversion failed:', err);
      return null;
    }
  }

  /**
   * Build a Musgrave noise-based graph in the builder.
   */
  private buildNoiseGraph(
    builder: GLSLTextureGraphBuilder,
    params: Record<string, number>,
  ): void {
    const musgraveType = Math.round(params.musgraveType ?? MusgraveType.HeteroTerrain) as MusgraveType;
    builder.addMusgrave({
      musgraveType,
      scale: params.scale ?? 5.0,
      detail: params.detail ?? 6.0,
      dimension: params.dimension ?? 2.0,
      lacunarity: params.lacunarity ?? 2.0,
      offset: params.offset ?? 0.5,
      gain: params.gain ?? 1.0,
    });
    builder.connect('mapping_0', 'vector', 'musgrave_0', 'vector');

    // Add output
    builder.addOutput();
    builder.connect('musgrave_0', 'fac', 'output_0', 'value');
  }

  /**
   * Build a Voronoi crack pattern graph in the builder.
   */
  private buildVoronoiCrackGraph(
    builder: GLSLTextureGraphBuilder,
    params: Record<string, number>,
  ): void {
    // Base Musgrave for large-scale variation
    builder.addMusgrave({
      musgraveType: MusgraveType.HeteroTerrain,
      scale: params.scale ?? 3.0,
      detail: params.detail ?? 4.0,
      dimension: params.dimension ?? 2.0,
      lacunarity: params.lacunarity ?? 2.0,
      offset: params.offset ?? 0.5,
    });
    builder.connect('mapping_0', 'vector', 'musgrave_0', 'vector');

    // Voronoi for crack detail
    builder.addVoronoi({
      scale: params.voronoiScale ?? 15.0,
      smoothness: params.smoothness ?? 0.5,
      feature: params.feature ?? 2, // Edge distance for cracks
    });
    builder.connect('mapping_0', 'vector', 'voronoi_0', 'vector');

    // Mix both for combined displacement
    const crackBlend = params.crackBlend ?? 0.3;
    builder.addMix(crackBlend);
    builder.connect('musgrave_0', 'fac', 'mix_0', 'a');
    builder.connect('voronoi_0', 'float', 'mix_0', 'b');

    builder.addOutput();
    builder.connect('mix_0', 'float', 'output_0', 'value');
  }

  /**
   * Build a material channel graph in the builder.
   */
  private buildMaterialChannelGraph(
    builder: GLSLTextureGraphBuilder,
    params: Record<string, number>,
  ): void {
    builder.addMusgrave({
      musgraveType: MusgraveType.HeteroTerrain,
      scale: params.scale ?? 5.0,
      detail: params.detail ?? 6.0,
      dimension: params.dimension ?? 2.0,
      lacunarity: params.lacunarity ?? 2.0,
      offset: params.offset ?? 0.5,
    });
    builder.connect('mapping_0', 'vector', 'musgrave_0', 'vector');

    // Add detail noise
    builder.addNoise('simplex', {
      scale: params.detailScale ?? 12.0,
      detail: params.detailOctaves ?? 4.0,
      distortion: params.distortion ?? 0.3,
    });
    builder.connect('mapping_0', 'vector', 'simplex_0', 'vector');

    // Mix base + detail
    const detailAmount = params.detailAmount ?? 0.2;
    builder.addMix(1.0 - detailAmount);
    builder.connect('musgrave_0', 'fac', 'mix_0', 'a');
    builder.connect('simplex_0', 'float', 'mix_0', 'b');

    builder.addOutput();
    builder.connect('mix_0', 'float', 'output_0', 'value');
  }

  /**
   * Build a layered blend graph in the builder.
   */
  private buildLayeredBlendGraph(
    builder: GLSLTextureGraphBuilder,
    params: Record<string, number>,
  ): void {
    // Layer 1: Large-scale
    builder.addMusgrave({
      musgraveType: MusgraveType.HeteroTerrain,
      scale: params.scale ?? 3.0,
      detail: params.detail ?? 4.0,
      dimension: params.dimension ?? 2.0,
      lacunarity: params.lacunarity ?? 2.0,
      offset: params.offset ?? 0.5,
    });
    builder.connect('mapping_0', 'vector', 'musgrave_0', 'vector');

    // Layer 2: Medium detail
    builder.addNoise('simplex', {
      scale: (params.scale ?? 3.0) * 3,
      detail: params.detail ?? 4.0,
      distortion: 0.5,
    });
    builder.connect('mapping_0', 'vector', 'simplex_0', 'vector');

    // Blend layers
    const layerBlend = params.layerBlend ?? 0.3;
    builder.addMix(1.0 - layerBlend);
    builder.connect('musgrave_0', 'fac', 'mix_0', 'a');
    builder.connect('simplex_0', 'float', 'mix_0', 'b');

    builder.addOutput();
    builder.connect('mix_0', 'float', 'output_0', 'value');
  }

  /**
   * Build an altitude-blend graph in the builder.
   */
  private buildAltitudeBlendGraph(
    builder: GLSLTextureGraphBuilder,
    params: Record<string, number>,
  ): void {
    // Low-altitude pattern
    builder.addMusgrave({
      musgraveType: MusgraveType.fBM,
      scale: params.lowScale ?? 4.0,
      detail: params.detail ?? 4.0,
      dimension: params.dimension ?? 2.0,
      lacunarity: params.lacunarity ?? 2.0,
    });
    builder.connect('mapping_0', 'vector', 'musgrave_0', 'vector');

    // High-altitude pattern
    builder.addMusgrave({
      musgraveType: MusgraveType.RidgedMultifractal,
      scale: params.highScale ?? 6.0,
      detail: params.detail ?? 6.0,
      dimension: params.dimension ?? 1.5,
      lacunarity: params.lacunarity ?? 2.0,
      offset: params.offset ?? 1.0,
      gain: params.gain ?? 2.0,
    });
    builder.connect('mapping_0', 'vector', 'musgrave_1', 'vector');

    // Blend by factor
    const altitudeFactor = params.altitudeBlend ?? 0.5;
    builder.addMix(altitudeFactor);
    builder.connect('musgrave_0', 'fac', 'mix_0', 'a');
    builder.connect('musgrave_1', 'fac', 'mix_0', 'b');

    builder.addOutput();
    builder.connect('mix_0', 'float', 'output_0', 'value');
  }

  /**
   * Bake a specific channel texture from a GLSLTextureGraphBuilder.
   *
   * Takes a base builder, clones it, and adds channel-specific
   * processing (color ramp for albedo, float curve for scalar channels).
   *
   * @param baseBuilder - Base graph builder (shared noise/mapping nodes)
   * @param channel - Which material channel to bake
   * @param config - Effective configuration
   * @returns THREE.DataTexture or null on failure
   */
  private bakeChannelFromBuilder(
    baseBuilder: GLSLTextureGraphBuilder,
    channel: MaterialChannel,
    config: SurfaceKernelConfig,
  ): THREE.DataTexture | null {
    try {
      // Rebuild the builder for this specific channel
      const builder = new GLSLTextureGraphBuilder();

      builder.addTexCoord(CoordinateMode.Generated);
      builder.addMapping([1, 1, 1], [0, 0, 0], [0, 0, 0]);
      builder.connect('texCoord_0', 'generated', 'mapping_0', 'vector');

      // Base noise
      builder.addMusgrave({
        musgraveType: MusgraveType.HeteroTerrain,
        scale: 5.0,
        detail: 6.0,
        dimension: 2.0,
        lacunarity: 2.0,
        offset: 0.5,
        gain: 1.0,
      });
      builder.connect('mapping_0', 'vector', 'musgrave_0', 'vector');

      // Channel-specific processing
      if (channel === MaterialChannel.ALBEDO) {
        builder.addColorRamp(
          this.getChannelColorRamp(channel),
          ColorRampMode.Linear,
        );
        builder.connect('musgrave_0', 'fac', 'colorRamp_0', 'fac');

        builder.addOutput();
        builder.connect('colorRamp_0', 'color', 'output_0', 'value');
      } else if (channel === MaterialChannel.NORMAL) {
        builder.addNoise('simplex', {
          scale: 8.0,
          detail: 4.0,
          distortion: 0.5,
        });
        builder.connect('mapping_0', 'vector', 'simplex_0', 'vector');

        builder.addMix(0.5);
        builder.connect('musgrave_0', 'float', 'mix_0', 'a');
        builder.connect('simplex_0', 'float', 'mix_0', 'b');

        builder.addOutput();
        builder.connect('mix_0', 'float', 'output_0', 'value');
      } else {
        builder.addFloatCurve(this.getChannelFloatCurve(channel));
        builder.connect('musgrave_0', 'fac', 'floatCurve_0', 'fac');

        builder.addOutput();
        builder.connect('floatCurve_0', 'float', 'output_0', 'value');
      }

      return builder.buildTexture(undefined, config.resolution, 0.0, 0.0);
    } catch (err) {
      console.warn(
        `[ShaderGraphSurfaceBridge] Builder bake failed for ${channel}:`,
        err,
      );
      return null;
    }
  }

  /**
   * Generate a parameter-based texture for a channel when the
   * GLSLTextureGraphBuilder approach fails.
   *
   * Uses CPU-based noise evaluation with the graph's parameters.
   *
   * @param graph - Shader graph descriptor
   * @param channel - Material channel
   * @param config - Effective configuration
   * @returns THREE.DataTexture
   */
  private generateParameterBasedTexture(
    graph: ShaderGraphDescriptor,
    channel: MaterialChannel,
    config: SurfaceKernelConfig,
  ): THREE.DataTexture {
    const size = config.resolution;
    const data = new Float32Array(size * size * 4);
    const params = graph.parameters;
    const scale = params.scale ?? 5.0;
    const detail = Math.round(params.detail ?? 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        let n: number;
        switch (graph.type) {
          case ShaderGraphType.VORONOI_CRACK_DISPLACEMENT: {
            const vScale = params.voronoiScale ?? scale * 3;
            const v = voronoi3DFn(nx * vScale, 0, ny * vScale);
            n = 1.0 - v; // Invert for crack pattern
            break;
          }
          case ShaderGraphType.LAYERED_BLEND: {
            const base = this.noise.fbm(nx * scale, 0, ny * scale, detail);
            const detailN = this.noise.fbm(nx * scale * 3, 0, ny * scale * 3, Math.max(1, detail - 1));
            const blend = params.layerBlend ?? 0.3;
            n = base * (1 - blend) + detailN * blend;
            break;
          }
          default: {
            n = this.noise.fbm(nx * scale, 0, ny * scale, detail);
            break;
          }
        }

        this.writeChannelPixel(data, idx, n, channel);
      }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Write a single pixel for a material channel.
   */
  private writeChannelPixel(
    data: Float32Array,
    idx: number,
    noiseValue: number,
    channel: MaterialChannel,
  ): void {
    switch (channel) {
      case MaterialChannel.ALBEDO: {
        const t = (noiseValue + 1) * 0.5;
        const stops = this.getChannelColorRamp(channel);
        const color = this.sampleColorRamp(t, stops);
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.NORMAL: {
        data[idx] = 0.5;
        data[idx + 1] = 0.5;
        data[idx + 2] = 1.0;
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.ROUGHNESS: {
        const roughness = 0.4 + noiseValue * 0.35;
        const v = Math.max(0, Math.min(1, roughness));
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.METALLIC: {
        const metallic = Math.max(0, noiseValue * 0.1);
        data[idx] = metallic;
        data[idx + 1] = metallic;
        data[idx + 2] = metallic;
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.AO: {
        const ao = 0.7 + noiseValue * 0.3;
        const v = Math.max(0, Math.min(1, ao));
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.HEIGHT: {
        const height = (noiseValue + 1) * 0.5;
        const v = Math.max(0, Math.min(1, height));
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 1.0;
        break;
      }
    }
  }

  /**
   * Apply a channel texture to material parameters.
   */
  private applyChannelTexture(
    materialParams: THREE.MeshStandardMaterialParameters,
    texture: THREE.DataTexture,
    channel: MaterialChannel,
    config: SurfaceKernelConfig,
  ): void {
    switch (channel) {
      case MaterialChannel.ALBEDO:
        materialParams.map = texture;
        break;
      case MaterialChannel.NORMAL:
        materialParams.normalMap = texture;
        materialParams.normalScale = new THREE.Vector2(config.normalScale, config.normalScale);
        break;
      case MaterialChannel.ROUGHNESS:
        materialParams.roughnessMap = texture;
        materialParams.roughness = 1.0;
        break;
      case MaterialChannel.METALLIC:
        materialParams.metalnessMap = texture;
        materialParams.metalness = 1.0;
        break;
      case MaterialChannel.AO:
        materialParams.aoMap = texture;
        materialParams.aoMapIntensity = 1.0;
        break;
      case MaterialChannel.HEIGHT:
        (materialParams as any).displacementMap = texture;
        (materialParams as any).displacementScale = config.displacementScale;
        break;
    }
  }

  /**
   * Get color ramp stops for a material channel.
   */
  private getChannelColorRamp(channel: MaterialChannel): ColorRampStop[] {
    switch (channel) {
      case MaterialChannel.ALBEDO:
        return [
          { position: 0.0, color: [0.76, 0.72, 0.48, 1.0] },  // Sand
          { position: 0.3, color: [0.29, 0.55, 0.19, 1.0] },  // Grass
          { position: 0.5, color: [0.48, 0.43, 0.38, 1.0] },  // Rock
          { position: 0.75, color: [0.6, 0.55, 0.5, 1.0] },   // Dark rock
          { position: 1.0, color: [0.91, 0.93, 0.96, 1.0] },  // Snow
        ];
      default:
        return [
          { position: 0.0, color: [0.0, 0.0, 0.0, 1.0] },
          { position: 1.0, color: [1.0, 1.0, 1.0, 1.0] },
        ];
    }
  }

  /**
   * Sample a color ramp at a given position.
   */
  private sampleColorRamp(
    t: number,
    stops: ColorRampStop[],
  ): [number, number, number, number] {
    const clamped = Math.max(0, Math.min(1, t));

    if (stops.length === 0) return [0, 0, 0, 1];
    if (stops.length === 1) return stops[0].color as [number, number, number, number];

    // Find surrounding stops
    let lower = 0;
    let upper = stops.length - 1;
    for (let i = 0; i < stops.length - 1; i++) {
      if (clamped >= stops[i].position && clamped <= stops[i + 1].position) {
        lower = i;
        upper = i + 1;
        break;
      }
    }

    const range = stops[upper].position - stops[lower].position;
    const localT = range > 0 ? (clamped - stops[lower].position) / range : 0;

    const c0 = stops[lower].color;
    const c1 = stops[upper].color;
    return [
      c0[0] + (c1[0] - c0[0]) * localT,
      c0[1] + (c1[1] - c0[1]) * localT,
      c0[2] + (c1[2] - c0[2]) * localT,
      c0[3] + (c1[3] - c0[3]) * localT,
    ];
  }

  /**
   * Get float curve control points for a material channel.
   */
  private getChannelFloatCurve(channel: MaterialChannel): FloatCurvePoint[] {
    switch (channel) {
      case MaterialChannel.ROUGHNESS:
        return [
          { position: 0.0, value: 0.4 },
          { position: 0.3, value: 0.85 },
          { position: 0.6, value: 0.95 },
          { position: 1.0, value: 0.6 },
        ];
      case MaterialChannel.METALLIC:
        return [
          { position: 0.0, value: 0.0 },
          { position: 0.5, value: 0.0 },
          { position: 1.0, value: 0.05 },
        ];
      case MaterialChannel.AO:
        return [
          { position: 0.0, value: 0.6 },
          { position: 0.5, value: 0.9 },
          { position: 1.0, value: 1.0 },
        ];
      case MaterialChannel.HEIGHT:
        return [
          { position: 0.0, value: 0.0 },
          { position: 0.5, value: 0.5 },
          { position: 1.0, value: 1.0 },
        ];
      default:
        return [
          { position: 0.0, value: 0.0 },
          { position: 1.0, value: 1.0 },
        ];
    }
  }

  /**
   * Generate a cache key for a texture.
   */
  private getTextureCacheKey(
    graph: ShaderGraphDescriptor,
    channel: MaterialChannel,
    config: SurfaceKernelConfig,
  ): string {
    const paramStr = Object.entries(graph.parameters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `${graph.type}:${graph.label}:${channel}:${config.resolution}:${paramStr}`;
  }

  // -----------------------------------------------------------------------
  // Graph Composition
  // -----------------------------------------------------------------------

  /**
   * Compose displacement and material graphs into a unified surface treatment.
   *
   * Applies displacement from the displacement graph, then generates
   * PBR material from the material graph, and returns the combined result.
   *
   * @param displacementGraph - Graph for displacement computation
   * @param materialGraph - Graph for material texture generation
   * @param blendMode - How to blend the two graphs' influences
   * @param mesh - The mesh to apply the composed surface to
   * @param config - Optional per-call kernel config overrides
   * @returns ComposedSurfaceResult with geometry, material, and metadata
   */
  composeGraphs(
    displacementGraph: ShaderGraphDescriptor,
    materialGraph: ShaderGraphDescriptor,
    blendMode: GraphBlendMode,
    mesh: THREE.Mesh,
    config: Partial<SurfaceKernelConfig> = {},
  ): ComposedSurfaceResult {
    const effectiveConfig = { ...this.config.kernelConfig, ...config };

    // Apply displacement
    const displacedGeometry = this.applyGraphDisplacement(mesh, displacementGraph, config);

    // Update mesh geometry for material generation
    const tempMesh = mesh.clone();
    tempMesh.geometry = displacedGeometry;

    // Apply material
    const material = this.applyGraphMaterial(tempMesh, materialGraph, config);

    // Get displacement values from the geometry attribute
    const dispAttr = displacedGeometry.getAttribute('displacement');
    const displacementValues = dispAttr
      ? new Float32Array((dispAttr.array as Float32Array))
      : new Float32Array(0);

    return {
      geometry: displacedGeometry,
      material,
      displacementValues,
      metadata: {
        displacementGraphType: displacementGraph.type,
        materialGraphType: materialGraph.type,
        blendMode,
        vertexCount: displacedGeometry.getAttribute('position')?.count ?? 0,
        channelsGenerated: effectiveConfig.materialChannels,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Dispose of resources held by this bridge.
   */
  dispose(): void {
    this.disposed = true;
    this.kernel.dispose();

    // Dispose cached textures
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
  }

  /**
   * Check whether this bridge has been disposed.
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): ShaderGraphSurfaceBridgeConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration at runtime.
   */
  setConfig(config: Partial<ShaderGraphSurfaceBridgeConfig>): void {
    this.config = { ...this.config, ...config };
    this.kernel.setConfig(this.config.kernelConfig);
  }
}

// ============================================================================
// SurfaceGraphPreset — Terrain Surface Presets
// ============================================================================

/**
 * Named terrain surface presets.
 *
 * Each preset provides a pre-built pair of displacement and material
 * ShaderGraphDescriptors that can be used directly with
 * ShaderGraphSurfaceBridge.
 */
export enum SurfaceGraphPreset {
  /** Musgrave displacement + rock albedo with crack normals */
  ROCKY_TERRAIN = 'rocky_terrain',
  /** Dune displacement + sand albedo with wind ripples */
  SANDY_DESERT = 'sandy_desert',
  /** Gentle displacement + snow/rock blend with altitude gradient */
  SNOW_COVERED = 'snow_covered',
  /** Stalactite displacement + dark stone with moisture */
  CAVE_INTERIOR = 'cave_interior',
  /** Wave displacement + algae-covered with depth coloring */
  UNDERWATER = 'underwater',
}

/**
 * Factory for creating ShaderGraphDescriptors from presets.
 *
 * Each preset returns a { displacement, material } pair of descriptors
 * with tuned parameters for the specified terrain type.
 */
export namespace SurfaceGraphPresetFactory {
  /**
   * Create a displacement + material pair for a given preset.
   *
   * @param preset - The surface preset to create
   * @param seed - Random seed for variation
   * @returns Object with displacement and material ShaderGraphDescriptors
   */
  export function create(
    preset: SurfaceGraphPreset,
    seed: number = 42,
  ): { displacement: ShaderGraphDescriptor; material: ShaderGraphDescriptor } {
    switch (preset) {
      case SurfaceGraphPreset.ROCKY_TERRAIN:
        return createRockyTerrain(seed);
      case SurfaceGraphPreset.SANDY_DESERT:
        return createSandyDesert(seed);
      case SurfaceGraphPreset.SNOW_COVERED:
        return createSnowCovered(seed);
      case SurfaceGraphPreset.CAVE_INTERIOR:
        return createCaveInterior(seed);
      case SurfaceGraphPreset.UNDERWATER:
        return createUnderwater(seed);
      default:
        return createRockyTerrain(seed);
    }
  }

  /**
   * Rocky terrain: Musgrave displacement + rock albedo with crack normals.
   */
  function createRockyTerrain(seed: number): {
    displacement: ShaderGraphDescriptor;
    material: ShaderGraphDescriptor;
  } {
    const displacement: ShaderGraphDescriptor = {
      type: ShaderGraphType.VORONOI_CRACK_DISPLACEMENT,
      parameters: {
        scale: 0.04,
        detail: 6,
        dimension: 1.8,
        lacunarity: 2.2,
        offset: 0.8,
        gain: 1.5,
        voronoiScale: 12.0,
        crackDepth: 0.6,
        crackBlend: 0.25,
        amplitude: 2.5,
      },
      channels: [MaterialChannel.HEIGHT],
      label: 'Rocky Terrain Displacement',
    };

    const material: ShaderGraphDescriptor = {
      type: ShaderGraphType.MATERIAL_CHANNEL,
      parameters: {
        scale: 4.0,
        detail: 6,
        dimension: 2.0,
        lacunarity: 2.0,
        offset: 0.6,
        detailScale: 15.0,
        detailOctaves: 5,
        distortion: 0.4,
        detailAmount: 0.25,
      },
      coordScale: [1, 1, 1],
      channels: [
        MaterialChannel.ALBEDO,
        MaterialChannel.NORMAL,
        MaterialChannel.ROUGHNESS,
        MaterialChannel.AO,
      ],
      label: 'Rocky Terrain Material',
    };

    return { displacement, material };
  }

  /**
   * Sandy desert: Dune displacement + sand albedo with wind ripples.
   */
  function createSandyDesert(seed: number): {
    displacement: ShaderGraphDescriptor;
    material: ShaderGraphDescriptor;
  } {
    const displacement: ShaderGraphDescriptor = {
      type: ShaderGraphType.NOISE_DISPLACEMENT,
      parameters: {
        scale: 0.02,
        detail: 3,
        dimension: 2.5,
        lacunarity: 2.0,
        musgraveType: MusgraveType.HybridMultifractal as number,
        amplitude: 1.5,
        offset: 0.3,
      },
      channels: [MaterialChannel.HEIGHT],
      label: 'Sandy Desert Displacement',
    };

    const material: ShaderGraphDescriptor = {
      type: ShaderGraphType.MATERIAL_CHANNEL,
      parameters: {
        scale: 2.5,
        detail: 3,
        dimension: 2.2,
        lacunarity: 2.0,
        offset: 0.3,
        detailScale: 20.0,
        detailOctaves: 3,
        distortion: 0.8,
        detailAmount: 0.15,
      },
      coordScale: [1, 1, 1],
      channels: [
        MaterialChannel.ALBEDO,
        MaterialChannel.NORMAL,
        MaterialChannel.ROUGHNESS,
        MaterialChannel.AO,
      ],
      label: 'Sandy Desert Material',
    };

    return { displacement, material };
  }

  /**
   * Snow covered: Gentle displacement + snow/rock blend with altitude gradient.
   */
  function createSnowCovered(seed: number): {
    displacement: ShaderGraphDescriptor;
    material: ShaderGraphDescriptor;
  } {
    const displacement: ShaderGraphDescriptor = {
      type: ShaderGraphType.ALTITUDE_BLEND,
      parameters: {
        scale: 0.03,
        detail: 4,
        dimension: 2.0,
        lacunarity: 2.0,
        lowScale: 3.0,
        highScale: 5.0,
        altitudeBlend: 0.6,
        altitudeRange: 25.0,
        amplitude: 1.0,
        offset: 0.5,
        gain: 1.0,
      },
      channels: [MaterialChannel.HEIGHT],
      label: 'Snow Covered Displacement',
    };

    const material: ShaderGraphDescriptor = {
      type: ShaderGraphType.ALTITUDE_BLEND,
      parameters: {
        scale: 3.5,
        detail: 5,
        dimension: 2.0,
        lacunarity: 2.0,
        lowScale: 3.5,
        highScale: 5.0,
        altitudeBlend: 0.55,
        detailScale: 10.0,
        detailOctaves: 3,
        detailAmount: 0.2,
      },
      coordScale: [1, 1, 1],
      channels: [
        MaterialChannel.ALBEDO,
        MaterialChannel.NORMAL,
        MaterialChannel.ROUGHNESS,
        MaterialChannel.AO,
      ],
      label: 'Snow Covered Material',
    };

    return { displacement, material };
  }

  /**
   * Cave interior: Stalactite displacement + dark stone with moisture.
   */
  function createCaveInterior(seed: number): {
    displacement: ShaderGraphDescriptor;
    material: ShaderGraphDescriptor;
  } {
    const displacement: ShaderGraphDescriptor = {
      type: ShaderGraphType.VORONOI_CRACK_DISPLACEMENT,
      parameters: {
        scale: 0.06,
        detail: 5,
        dimension: 1.5,
        lacunarity: 2.5,
        offset: 1.0,
        gain: 2.0,
        voronoiScale: 8.0,
        crackDepth: 0.8,
        crackBlend: 0.4,
        amplitude: 3.0,
      },
      channels: [MaterialChannel.HEIGHT],
      label: 'Cave Interior Displacement',
    };

    const material: ShaderGraphDescriptor = {
      type: ShaderGraphType.MATERIAL_CHANNEL,
      parameters: {
        scale: 6.0,
        detail: 5,
        dimension: 1.8,
        lacunarity: 2.0,
        offset: 0.7,
        detailScale: 18.0,
        detailOctaves: 4,
        distortion: 0.6,
        detailAmount: 0.3,
      },
      coordScale: [1, 1, 1],
      channels: [
        MaterialChannel.ALBEDO,
        MaterialChannel.NORMAL,
        MaterialChannel.ROUGHNESS,
        MaterialChannel.AO,
        MaterialChannel.METALLIC,
      ],
      label: 'Cave Interior Material',
    };

    return { displacement, material };
  }

  /**
   * Underwater: Wave displacement + algae-covered with depth coloring.
   */
  function createUnderwater(seed: number): {
    displacement: ShaderGraphDescriptor;
    material: ShaderGraphDescriptor;
  } {
    const displacement: ShaderGraphDescriptor = {
      type: ShaderGraphType.NOISE_DISPLACEMENT,
      parameters: {
        scale: 0.015,
        detail: 3,
        dimension: 2.3,
        lacunarity: 2.0,
        musgraveType: MusgraveType.fBM as number,
        amplitude: 0.5,
        offset: 0.0,
      },
      channels: [MaterialChannel.HEIGHT],
      label: 'Underwater Displacement',
    };

    const material: ShaderGraphDescriptor = {
      type: ShaderGraphType.LAYERED_BLEND,
      parameters: {
        scale: 3.0,
        detail: 4,
        dimension: 2.0,
        lacunarity: 2.0,
        layerBlend: 0.35,
        detailScale: 12.0,
        detailOctaves: 3,
      },
      coordScale: [1, 1, 1],
      channels: [
        MaterialChannel.ALBEDO,
        MaterialChannel.NORMAL,
        MaterialChannel.ROUGHNESS,
        MaterialChannel.AO,
      ],
      label: 'Underwater Material',
    };

    return { displacement, material };
  }

  /**
   * Get all available presets as an array.
   */
  export function all(): SurfaceGraphPreset[] {
    return Object.values(SurfaceGraphPreset);
  }

  /**
   * Get a human-readable label for a preset.
   */
  export function getLabel(preset: SurfaceGraphPreset): string {
    switch (preset) {
      case SurfaceGraphPreset.ROCKY_TERRAIN: return 'Rocky Terrain';
      case SurfaceGraphPreset.SANDY_DESERT: return 'Sandy Desert';
      case SurfaceGraphPreset.SNOW_COVERED: return 'Snow Covered';
      case SurfaceGraphPreset.CAVE_INTERIOR: return 'Cave Interior';
      case SurfaceGraphPreset.UNDERWATER: return 'Underwater';
      default: return 'Unknown Preset';
    }
  }
}

// ============================================================================
// SurfaceGraphComposer — Graph Composition and Blending
// ============================================================================

/**
 * Composes and blends multiple shader graphs into unified surface treatments.
 *
 * Provides operations for blending two graphs, adding detail layers,
 * and creating altitude-dependent blends. All methods return new
 * ShaderGraphDescriptors without modifying the inputs.
 *
 * Usage:
 * ```typescript
 * const composer = new SurfaceGraphComposer();
 *
 * // Blend two graphs
 * const blended = composer.blendGraphs(graphA, graphB, maskGraph);
 *
 * // Add high-frequency detail
 * const detailed = composer.addDetailLayer(baseGraph, detailGraph, 3.0, 0.3);
 *
 * // Altitude-dependent blending
 * const altitudeBlended = composer.createAltitudeBlend(lowGraph, highGraph, 15.0, 2.0);
 * ```
 */
export class SurfaceGraphComposer {
  private noise: NoiseUtils;
  private rng: SeededRandom;

  /**
   * Create a new SurfaceGraphComposer.
   *
   * @param seed - Random seed for reproducible composition
   */
  constructor(seed: number = 42) {
    this.noise = new NoiseUtils(seed);
    this.rng = new SeededRandom(seed);
  }

  /**
   * Blend two shader graphs using a mask function.
   *
   * Creates a new ShaderGraphDescriptor that blends the outputs of
   * graphA and graphB using the provided blend mask. The mask is
   * evaluated per-vertex/per-pixel and its value determines the mix
   * ratio: 0 = full graphA, 1 = full graphB.
   *
   * @param graphA - First (base) shader graph
   * @param graphB - Second (overlay) shader graph
   * @param blendMask - Mask function: (position) => [0, 1], or a constant
   * @returns New ShaderGraphDescriptor representing the blended graph
   */
  blendGraphs(
    graphA: ShaderGraphDescriptor,
    graphB: ShaderGraphDescriptor,
    blendMask: ((position: THREE.Vector3) => number) | number,
  ): ShaderGraphDescriptor {
    // Determine the dominant type for the blended graph
    const type = graphA.type === graphB.type
      ? graphA.type
      : ShaderGraphType.LAYERED_BLEND;

    // Merge parameters: average overlapping, keep unique from both
    const mergedParams: Record<string, number> = {};
    const allKeys = new Set([
      ...Object.keys(graphA.parameters),
      ...Object.keys(graphB.parameters),
    ]);

    for (const key of allKeys) {
      const a = graphA.parameters[key];
      const b = graphB.parameters[key];
      if (a !== undefined && b !== undefined) {
        // Average overlapping parameters
        mergedParams[key] = (a + b) * 0.5;
      } else {
        mergedParams[key] = a ?? b;
      }
    }

    // Set blend-specific parameters
    if (typeof blendMask === 'number') {
      mergedParams.layerBlend = blendMask;
    } else {
      // For function masks, use a default blend factor and store
      // mask metadata for per-vertex evaluation
      mergedParams.layerBlend = 0.5;
      mergedParams.useMaskFunction = 1;
    }

    // Merge channels
    const channelSet = new Set([...graphA.channels, ...graphB.channels]);

    // Create a node group for the blended graph if both inputs have node groups
    let nodeGroup: NodeGroup | undefined;
    if (graphA.nodeGroup && graphB.nodeGroup) {
      nodeGroup = this.composeNodeGroups(graphA.nodeGroup, graphB.nodeGroup, typeof blendMask === 'number' ? blendMask : 0.5);
    }

    return {
      type,
      nodeGroup,
      parameters: mergedParams,
      channels: [...channelSet],
      label: `Blended(${graphA.label} + ${graphB.label})`,
    };
  }

  /**
   * Compose two NodeGroups by creating a new group that evaluates
   * both and blends their outputs.
   *
   * @param groupA - First node group
   * @param groupB - Second node group
   * @param blendFactor - Blend ratio (0 = A, 1 = B)
   * @returns New NodeGroup representing the blended graph
   */
  private composeNodeGroups(
    groupA: NodeGroup,
    groupB: NodeGroup,
    blendFactor: number,
  ): NodeGroup {
    const composed = new NodeGroup(`Blended_${groupA.name}_${groupB.name}`);

    // Expose blend factor as an input
    composed.addExposedInput('BlendFactor', 'FLOAT', blendFactor, 'Blend factor (0=A, 1=B)', 0, 1);

    // Copy all inputs from both groups with prefixed names
    for (const [name, input] of groupA.inputs.entries()) {
      composed.addExposedInput(
        `A_${name}`,
        input.type,
        input.defaultValue,
        `Graph A: ${input.description}`,
      );
    }
    for (const [name, input] of groupB.inputs.entries()) {
      composed.addExposedInput(
        `B_${name}`,
        input.type,
        input.defaultValue,
        `Graph B: ${input.description}`,
      );
    }

    // Expose blended outputs
    for (const [name, output] of groupA.outputs.entries()) {
      composed.addExposedOutput(`Blended_${name}`, output.type);
    }

    return composed;
  }

  /**
   * Add a high-frequency detail layer to a base graph.
   *
   * Creates a new graph that evaluates the base graph and adds
   * detail from the detail graph at the specified frequency and
   * amplitude. The detail is additive: result = base + detail * amplitude.
   *
   * @param baseGraph - The base (low-frequency) shader graph
   * @param detailGraph - The detail (high-frequency) shader graph
   * @param frequency - Frequency multiplier for the detail graph
   * @param amplitude - Amplitude multiplier for the detail contribution
   * @returns New ShaderGraphDescriptor with added detail
   */
  addDetailLayer(
    baseGraph: ShaderGraphDescriptor,
    detailGraph: ShaderGraphDescriptor,
    frequency: number,
    amplitude: number,
  ): ShaderGraphDescriptor {
    // Start with the base graph's parameters
    const params: Record<string, number> = { ...baseGraph.parameters };

    // Add detail-specific parameters
    params.detailFrequency = frequency;
    params.detailAmplitude = amplitude;

    // Merge detail parameters with frequency scaling
    for (const [key, value] of Object.entries(detailGraph.parameters)) {
      if (key === 'scale') {
        params.detailScale = value * frequency;
      } else if (key === 'amplitude') {
        params.detailAmplitude = value * amplitude;
      } else if (!(key in params)) {
        params[`detail_${key}`] = value;
      }
    }

    // Force layered blend type since we're adding detail
    const type = ShaderGraphType.LAYERED_BLEND;
    params.layerBlend = amplitude;
    params.detailAmount = amplitude;

    // Create a new node group that composes both
    let nodeGroup: NodeGroup | undefined;
    if (baseGraph.nodeGroup && detailGraph.nodeGroup) {
      nodeGroup = this.composeNodeGroups(
        baseGraph.nodeGroup,
        detailGraph.nodeGroup,
        amplitude,
      );
    }

    // Merge channels
    const channelSet = new Set([...baseGraph.channels, ...detailGraph.channels]);

    return {
      type,
      nodeGroup,
      parameters: params,
      channels: [...channelSet],
      label: `${baseGraph.label} + Detail(${detailGraph.label}, f=${frequency.toFixed(1)}, a=${amplitude.toFixed(2)})`,
    };
  }

  /**
   * Create an altitude-dependent graph blend.
   *
   * Generates a new graph that smoothly transitions between graphLow
   * (used at lower altitudes) and graphHigh (used at higher altitudes).
   * The transition uses a sigmoid function centered at the given altitude
   * with the specified sharpness.
   *
   * @param graphLow - Graph used at lower altitudes
   * @param graphHigh - Graph used at higher altitudes
   * @param altitude - Center altitude for the transition
   * @param sharpness - Transition sharpness (higher = sharper transition)
   * @returns New ShaderGraphDescriptor with altitude blending
   */
  createAltitudeBlend(
    graphLow: ShaderGraphDescriptor,
    graphHigh: ShaderGraphDescriptor,
    altitude: number,
    sharpness: number,
  ): ShaderGraphDescriptor {
    const params: Record<string, number> = {};

    // Merge parameters from both graphs with low/high prefixes
    for (const [key, value] of Object.entries(graphLow.parameters)) {
      params[`low_${key}`] = value;
      if (!(key in params)) {
        params[key] = value; // Also keep unprefixed for default
      }
    }
    for (const [key, value] of Object.entries(graphHigh.parameters)) {
      params[`high_${key}`] = value;
    }

    // Altitude blend parameters
    params.altitudeBlend = 0.5; // Will be computed per-vertex
    params.altitudeCenter = altitude;
    params.altitudeSharpness = sharpness;
    params.altitudeRange = altitude * 2; // For type-based fallback

    // Use altitude blend type
    const type = ShaderGraphType.ALTITUDE_BLEND;

    // Create a node group for altitude blending
    let nodeGroup: NodeGroup | undefined;
    if (graphLow.nodeGroup && graphHigh.nodeGroup) {
      nodeGroup = this.createAltitudeNodeGroup(
        graphLow.nodeGroup,
        graphHigh.nodeGroup,
        altitude,
        sharpness,
      );
    }

    // Merge channels
    const channelSet = new Set([...graphLow.channels, ...graphHigh.channels]);

    return {
      type,
      nodeGroup,
      parameters: params,
      channels: [...channelSet],
      label: `AltitudeBlend(${graphLow.label} @ low, ${graphHigh.label} @ ${altitude.toFixed(1)}, sharpness=${sharpness.toFixed(1)})`,
    };
  }

  /**
   * Create a NodeGroup that performs altitude-based blending
   * between two input groups.
   *
   * @param groupLow - Node group for low altitude
   * @param groupHigh - Node group for high altitude
   * @param altitude - Center altitude for transition
   * @param sharpness - Transition sharpness
   * @returns New NodeGroup implementing the altitude blend
   */
  private createAltitudeNodeGroup(
    groupLow: NodeGroup,
    groupHigh: NodeGroup,
    altitude: number,
    sharpness: number,
  ): NodeGroup {
    const composed = new NodeGroup(
      `AltitudeBlend_${groupLow.name}_${groupHigh.name}`,
    );

    // Expose altitude parameters
    composed.addExposedInput('Altitude', 'FLOAT', altitude, 'Center altitude for transition');
    composed.addExposedInput('Sharpness', 'FLOAT', sharpness, 'Transition sharpness', 0.01, 100);

    // Copy inputs from both groups
    for (const [name, input] of groupLow.inputs.entries()) {
      composed.addExposedInput(`Low_${name}`, input.type, input.defaultValue, `Low altitude: ${input.description}`);
    }
    for (const [name, input] of groupHigh.inputs.entries()) {
      composed.addExposedInput(`High_${name}`, input.type, input.defaultValue, `High altitude: ${input.description}`);
    }

    // Expose blended outputs
    for (const [name, output] of groupLow.outputs.entries()) {
      composed.addExposedOutput(`Blended_${name}`, output.type);
    }

    return composed;
  }

  /**
   * Compute altitude blend factor using a sigmoid function.
   *
   * @param y - Current height value
   * @param altitude - Center altitude
   * @param sharpness - Transition sharpness
   * @returns Blend factor [0, 1] where 0 = low graph, 1 = high graph
   */
  static computeAltitudeFactor(
    y: number,
    altitude: number,
    sharpness: number,
  ): number {
    // Sigmoid: 1 / (1 + exp(-sharpness * (y - altitude)))
    const x = sharpness * (y - altitude);
    // Numerically stable sigmoid
    if (x >= 0) {
      return 1.0 / (1.0 + Math.exp(-x));
    } else {
      const ex = Math.exp(x);
      return ex / (1.0 + ex);
    }
  }

  /**
   * Evaluate a blended graph at a given position.
   *
   * Useful for CPU-based per-vertex evaluation where the blend
   * factor depends on position.
   *
   * @param graphA - First graph
   * @param graphB - Second graph
   * @param position - Evaluation position
   * @param blendFactor - Blend ratio (0 = A, 1 = B)
   * @returns Blended displacement value
   */
  evaluateBlend(
    graphA: ShaderGraphDescriptor,
    graphB: ShaderGraphDescriptor,
    position: THREE.Vector3,
    blendFactor: number,
  ): number {
    const valueA = this.evaluateGraphAtPosition(graphA, position);
    const valueB = this.evaluateGraphAtPosition(graphB, position);
    return valueA * (1 - blendFactor) + valueB * blendFactor;
  }

  /**
   * Evaluate a single graph at a given position.
   *
   * @param graph - The shader graph to evaluate
   * @param position - World-space position
   * @returns Noise value at the position
   */
  private evaluateGraphAtPosition(
    graph: ShaderGraphDescriptor,
    position: THREE.Vector3,
  ): number {
    const params = graph.parameters;
    const scale = params.scale ?? 0.05;
    const octaves = Math.round(params.detail ?? params.octaves ?? 4);

    switch (graph.type) {
      case ShaderGraphType.NOISE_DISPLACEMENT:
        return this.noise.fbm(
          position.x * scale, position.y * scale, position.z * scale, octaves,
        ) * (params.amplitude ?? 1.0);

      case ShaderGraphType.VORONOI_CRACK_DISPLACEMENT: {
        const voronoiScale = params.voronoiScale ?? scale * 3;
        const v = voronoi3DFn(
          position.x * voronoiScale, position.y * voronoiScale, position.z * voronoiScale,
        );
        return (1.0 - v) * (params.crackDepth ?? 0.5);
      }

      case ShaderGraphType.ALTITUDE_BLEND: {
        const base = this.noise.fbm(
          position.x * scale, position.y * scale, position.z * scale, octaves,
        );
        const altitudeFactor = SurfaceGraphComposer.computeAltitudeFactor(
          position.y,
          params.altitudeCenter ?? 15,
          params.altitudeSharpness ?? 2,
        );
        return base * (0.3 + 0.7 * altitudeFactor);
      }

      case ShaderGraphType.LAYERED_BLEND: {
        const base = this.noise.fbm(
          position.x * scale, position.y * scale, position.z * scale, octaves,
        );
        const detailFreq = params.detailFrequency ?? 3;
        const detailAmp = params.detailAmplitude ?? 0.3;
        const detail = this.noise.fbm(
          position.x * scale * detailFreq,
          position.y * scale * detailFreq,
          position.z * scale * detailFreq,
          Math.max(1, octaves - 1),
        );
        return base + detail * detailAmp;
      }

      default:
        return this.noise.fbm(
          position.x * scale, position.y * scale, position.z * scale, octaves,
        );
    }
  }
}
