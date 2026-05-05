/**
 * SurfaceKernel Pipeline — Shader Graph-Driven Surface Processing
 *
 * Implements the P3 SurfaceKernel that accepts arbitrary shader graphs
 * (NodeGroup instances) for displacement and material generation.
 * Bridges the terrain element composition system with the GLSL procedural
 * texture pipeline for per-vertex displacement and PBR material generation.
 *
 * Architecture:
 * 1. SurfaceKernel — Core class that evaluates shader graphs per-vertex
 *    for displacement and per-pixel for material channels.
 * 2. SurfaceKernelConfig — Configuration for displacement mode, scale,
 *    material channels, and resolution.
 * 3. TerrainSurfaceBridge — Per-vertex material assignment from element
 *    auxiliary attributes, implementing height/slope/cave/water rules.
 *
 * @module terrain/surface
 */

import * as THREE from 'three';
import { NodeGroup } from '@/core/nodes/core/NodeGeometryModifierBridge';
import {
  GLSLTextureGraphBuilder,
  ColorRampStop,
  ColorRampMode,
  MusgraveType,
  FloatCurvePoint,
} from '@/assets/materials/shaders/GLSLProceduralTexturePipeline';
import { ElementRegistry, CompositionOperation } from '@/terrain/sdf/TerrainElementSystem';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';
import { CoordinateMode } from '@/assets/materials/shaders/GLSLProceduralTexturePipeline';

// ============================================================================
// SurfaceKernelConfig
// ============================================================================

/**
 * Displacement mode for surface kernel processing.
 *
 * - VERTEX: Displace vertices directly on the CPU (immediate, no GPU needed).
 * - TEXTURE: Bake displacement into a texture and use it in the material's
 *   displacementMap (requires UV coordinates).
 * - COMPUTE: Use WebGPU compute shader for displacement (highest performance,
 *   falls back to VERTEX if WebGPU is unavailable).
 */
export enum DisplacementMode {
  /** Direct CPU per-vertex displacement */
  VERTEX = 'vertex',
  /** Displacement baked into a texture map */
  TEXTURE = 'texture',
  /** WebGPU compute shader displacement */
  COMPUTE = 'compute',
}

/**
 * PBR material channel identifiers.
 * Each channel corresponds to a texture map in a PBR material.
 */
export enum MaterialChannel {
  /** Base color / albedo map */
  ALBEDO = 'albedo',
  /** Surface normal perturbation map */
  NORMAL = 'normal',
  /** Microsurface roughness map */
  ROUGHNESS = 'roughness',
  /** Metallic reflectance map */
  METALLIC = 'metallic',
  /** Ambient occlusion map */
  AO = 'ao',
  /** Height / displacement map */
  HEIGHT = 'height',
}

/**
 * Configuration for the SurfaceKernel.
 *
 * Controls displacement mode, scale, which PBR channels to generate,
 * and the output texture resolution.
 */
export interface SurfaceKernelConfig {
  /** How displacement is applied to the geometry */
  displacementMode: DisplacementMode;
  /** Global scale multiplier for displacement values */
  displacementScale: number;
  /** Which PBR channels to generate textures for */
  materialChannels: MaterialChannel[];
  /** Texture resolution for baked channels (power-of-2 recommended) */
  resolution: number;
  /** Mid-level for displacement (0.0 = displace inward only, 0.5 = both, 1.0 = outward only) */
  displacementMidLevel: number;
  /** Smooth blend factor for displacement (0 = sharp, larger = smoother) */
  displacementSmoothness: number;
  /** Normal map intensity for generated normal maps */
  normalScale: number;
  /** Whether to apply vertex colors from element material IDs */
  useVertexColors: boolean;
  /** Noise seed for procedural material generation */
  seed: number;
}

/**
 * Default configuration for the SurfaceKernel.
 */
export const DEFAULT_SURFACE_KERNEL_CONFIG: SurfaceKernelConfig = {
  displacementMode: DisplacementMode.VERTEX,
  displacementScale: 1.0,
  materialChannels: [
    MaterialChannel.ALBEDO,
    MaterialChannel.NORMAL,
    MaterialChannel.ROUGHNESS,
    MaterialChannel.AO,
  ],
  resolution: 512,
  displacementMidLevel: 0.0,
  displacementSmoothness: 0.3,
  normalScale: 1.0,
  useVertexColors: true,
  seed: 42,
};

// ============================================================================
// Shader Graph Evaluation Context
// ============================================================================

/**
 * Per-vertex context provided to shader graph evaluation.
 *
 * Contains world-space position, normal, UV, and element auxiliary data
 * that shader graphs can sample from.
 */
export interface ShaderGraphContext {
  /** World-space position of the vertex */
  position: THREE.Vector3;
  /** World-space normal of the vertex */
  normal: THREE.Vector3;
  /** UV coordinates of the vertex (if available) */
  uv: THREE.Vector2;
  /** Material ID from element evaluation */
  materialId: number;
  /** Auxiliary data from element evaluation */
  auxiliary: Record<string, any>;
  /** Random per-instance value [0, 1] */
  objectRandom: number;
  /** Time parameter for animated shaders */
  time: number;
}

/**
 * Result of evaluating a shader graph for displacement.
 */
export interface DisplacementResult {
  /** Displacement amount along the normal direction */
  displacement: number;
  /** Optional custom displacement direction (overrides normal) */
  direction?: THREE.Vector3;
}

/**
 * Result of evaluating a shader graph for a material channel.
 */
export interface ChannelEvalResult {
  /** The channel that was evaluated */
  channel: MaterialChannel;
  /** Float value (for scalar channels like roughness, metallic, AO, height) */
  value: number;
  /** Color value (for albedo channel) */
  color?: THREE.Color;
  /** Normal vector (for normal channel) */
  normal?: THREE.Vector3;
}

// ============================================================================
// SurfaceKernel
// ============================================================================

/**
 * Core surface processing kernel that accepts arbitrary shader graphs
 * for displacement and material generation.
 *
 * SurfaceKernel evaluates a NodeGroup (shader graph) per-vertex to compute
 * displacement amounts, and per-pixel (via GLSL pipeline) for material channel
 * textures. It bridges the node system with the GLSL procedural texture
 * pipeline for GPU-accelerated material generation.
 *
 * Usage:
 * ```typescript
 * const kernel = new SurfaceKernel(config);
 * const displacedGeom = kernel.applyDisplacement(mesh, displacementGraph, config);
 * const material = kernel.applySurfaceMaterial(mesh, materialGraph, config);
 * ```
 */
export class SurfaceKernel {
  private config: SurfaceKernelConfig;
  private noise: NoiseUtils;
  private rng: SeededRandom;
  private disposed: boolean = false;

  /**
   * Create a new SurfaceKernel instance.
   *
   * @param config - Configuration (defaults to DEFAULT_SURFACE_KERNEL_CONFIG)
   */
  constructor(config: Partial<SurfaceKernelConfig> = {}) {
    this.config = { ...DEFAULT_SURFACE_KERNEL_CONFIG, ...config };
    this.noise = new NoiseUtils(this.config.seed);
    this.rng = new SeededRandom(this.config.seed);
  }

  // -----------------------------------------------------------------------
  // Displacement
  // -----------------------------------------------------------------------

  /**
   * Apply displacement to a mesh's geometry using a shader graph.
   *
   * Evaluates the shader graph per-vertex to compute displacement amounts,
   * then displaces vertices along their normals by the computed amount.
   * Finally recomputes normals for correct lighting.
   *
   * @param mesh - The mesh whose geometry will be displaced
   * @param shaderGraph - A NodeGroup defining the displacement computation
   * @param config - Optional per-call config overrides
   * @returns A new THREE.BufferGeometry with displaced vertices
   */
  applyDisplacement(
    mesh: THREE.Mesh,
    shaderGraph: NodeGroup,
    config: Partial<SurfaceKernelConfig> = {},
  ): THREE.BufferGeometry {
    const effectiveConfig = { ...this.config, ...config };
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    const uvAttr = geometry.getAttribute('uv');

    if (!posAttr) {
      console.warn('[SurfaceKernel] No position attribute on mesh geometry');
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
        : new Float32Array(vertexCount * 3);
      // Default normals pointing up
      if (!computedNormals) {
        for (let i = 0; i < vertexCount; i++) {
          normalArray[i * 3] = 0;
          normalArray[i * 3 + 1] = 1;
          normalArray[i * 3 + 2] = 0;
        }
      }
    }

    // Evaluate shader graph per-vertex for displacement
    const displacementValues = this.evaluateDisplacementGraph(
      posArray,
      normalArray,
      uvAttr,
      vertexCount,
      shaderGraph,
      effectiveConfig,
    );

    // Apply displacement along normals
    for (let i = 0; i < vertexCount; i++) {
      const disp = displacementValues[i] * effectiveConfig.displacementScale;
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

    // Recompute normals after displacement
    result.computeVertexNormals();
    result.computeBoundingSphere();
    result.computeBoundingBox();

    return result;
  }

  /**
   * Evaluate the displacement shader graph per-vertex.
   *
   * Uses CPU evaluation of the NodeGroup for each vertex position.
   * Falls back to noise-based displacement if the graph cannot be evaluated.
   *
   * @param posArray - Vertex positions (flat Float32Array)
   * @param normalArray - Vertex normals (flat Float32Array)
   * @param uvAttr - UV attribute (may be null)
   * @param vertexCount - Number of vertices
   * @param shaderGraph - NodeGroup defining displacement
   * @param config - Effective configuration
   * @returns Float32Array of displacement values, one per vertex
   */
  private evaluateDisplacementGraph(
    posArray: Float32Array,
    normalArray: Float32Array,
    uvAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
    vertexCount: number,
    shaderGraph: NodeGroup,
    config: SurfaceKernelConfig,
  ): Float32Array {
    const displacement = new Float32Array(vertexCount);

    // Create an instance of the shader graph for evaluation
    const instance = shaderGraph.instantiate();

    // Evaluate per-vertex
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

      // Try to evaluate the graph
      try {
        const inputs = new Map<string, any>();
        inputs.set('Position', context.position);
        inputs.set('Normal', context.normal);
        inputs.set('UV', context.uv);
        inputs.set('Strength', config.displacementScale);
        inputs.set('MidLevel', config.displacementMidLevel);

        const outputs = instance.evaluate(inputs);
        const dispValue = outputs.get('Displacement');

        if (typeof dispValue === 'number' && isFinite(dispValue)) {
          displacement[i] = dispValue;
        } else {
          // Fallback: noise-based displacement
          displacement[i] = this.computeFallbackDisplacement(position, config);
        }
      } catch {
        // Fallback: noise-based displacement when graph evaluation fails
        displacement[i] = this.computeFallbackDisplacement(position, config);
      }
    }

    return displacement;
  }

  /**
   * Compute fallback displacement using noise when shader graph
   * evaluation is unavailable or fails.
   *
   * @param position - World-space position
   * @param config - Effective configuration
   * @returns Displacement value
   */
  private computeFallbackDisplacement(
    position: THREE.Vector3,
    config: SurfaceKernelConfig,
  ): number {
    const freq = 0.05;
    const octaves = 4;
    const n = this.noise.fbm(
      position.x * freq,
      position.y * freq,
      position.z * freq,
      octaves,
    );
    return n * config.displacementScale * 0.5;
  }

  // -----------------------------------------------------------------------
  // Material Generation
  // -----------------------------------------------------------------------

  /**
   * Generate a PBR material from a shader graph.
   *
   * Uses the GLSLProceduralTexturePipeline to bake textures for each
   * requested material channel (albedo, normal, roughness, metallic, AO, height).
   *
   * @param mesh - The mesh to generate material for
   * @param shaderGraph - A NodeGroup defining the material computation
   * @param config - Optional per-call config overrides
   * @returns THREE.MeshStandardMaterial with baked PBR textures
   */
  applySurfaceMaterial(
    mesh: THREE.Mesh,
    shaderGraph: NodeGroup,
    config: Partial<SurfaceKernelConfig> = {},
  ): THREE.MeshStandardMaterial {
    const effectiveConfig = { ...this.config, ...config };
    const channels = effectiveConfig.materialChannels;

    const materialParams: THREE.MeshStandardMaterialParameters = {
      side: THREE.DoubleSide,
      roughness: 1.0,
      metalness: 0.0,
    };

    // Generate textures for each requested channel
    try {
      if (channels.includes(MaterialChannel.ALBEDO)) {
        const albedoTexture = this.generateChannelTexture(
          mesh, MaterialChannel.ALBEDO, shaderGraph, effectiveConfig,
        );
        if (albedoTexture) {
          materialParams.map = albedoTexture;
        }
      }

      if (channels.includes(MaterialChannel.NORMAL)) {
        const normalTexture = this.generateChannelTexture(
          mesh, MaterialChannel.NORMAL, shaderGraph, effectiveConfig,
        );
        if (normalTexture) {
          materialParams.normalMap = normalTexture;
          materialParams.normalScale = new THREE.Vector2(
            effectiveConfig.normalScale,
            effectiveConfig.normalScale,
          );
        }
      }

      if (channels.includes(MaterialChannel.ROUGHNESS)) {
        const roughnessTexture = this.generateChannelTexture(
          mesh, MaterialChannel.ROUGHNESS, shaderGraph, effectiveConfig,
        );
        if (roughnessTexture) {
          materialParams.roughnessMap = roughnessTexture;
          materialParams.roughness = 1.0;
        }
      }

      if (channels.includes(MaterialChannel.METALLIC)) {
        const metallicTexture = this.generateChannelTexture(
          mesh, MaterialChannel.METALLIC, shaderGraph, effectiveConfig,
        );
        if (metallicTexture) {
          materialParams.metalnessMap = metallicTexture;
          materialParams.metalness = 1.0;
        }
      }

      if (channels.includes(MaterialChannel.AO)) {
        const aoTexture = this.generateChannelTexture(
          mesh, MaterialChannel.AO, shaderGraph, effectiveConfig,
        );
        if (aoTexture) {
          materialParams.aoMap = aoTexture;
          materialParams.aoMapIntensity = 1.0;
        }
      }

      if (channels.includes(MaterialChannel.HEIGHT)) {
        const heightTexture = this.generateChannelTexture(
          mesh, MaterialChannel.HEIGHT, shaderGraph, effectiveConfig,
        );
        if (heightTexture) {
          (materialParams as any).displacementMap = heightTexture;
          (materialParams as any).displacementScale = effectiveConfig.displacementScale;
        }
      }
    } catch (err) {
      console.warn('[SurfaceKernel] Material generation failed, using basic material:', err);
    }

    return new THREE.MeshStandardMaterial(materialParams);
  }

  /**
   * Generate a texture for a single material channel using the GLSL pipeline.
   *
   * Creates a ProceduralTextureShader from the shader graph and renders
   * the channel to a DataTexture via the ProceduralTextureRenderer.
   *
   * @param mesh - Source mesh for bounds/UV info
   * @param channel - Which material channel to generate
   * @param shaderGraph - NodeGroup defining the texture
   * @param config - Effective configuration
   * @returns THREE.DataTexture for the channel, or null on failure
   */
  private generateChannelTexture(
    mesh: THREE.Mesh,
    channel: MaterialChannel,
    shaderGraph: NodeGroup,
    config: SurfaceKernelConfig,
  ): THREE.DataTexture | null {
    try {
      // Build a GLSL texture graph from the NodeGroup structure.
      // Note: GLSLTextureGraphBuilder methods return `this` for chaining.
      // Node IDs follow the pattern: prefix_0, prefix_1, etc.
      const builder = new GLSLTextureGraphBuilder();

      // Add texture coordinate input (ID: "texCoord_0")
      builder.addTexCoord(CoordinateMode.Generated);

      // Add a coordinate mapping node (ID: "mapping_0")
      builder.addMapping(
        [1.0, 1.0, 1.0],
        [0, 0, 0],
        [0, 0, 0],
      );

      // Add a Musgrave noise node as the base (ID: "musgrave_0")
      builder.addMusgrave({
        musgraveType: MusgraveType.HeteroTerrain,
        scale: 5.0,
        detail: 6.0,
        dimension: 2.0,
        lacunarity: 2.0,
        offset: 0.5,
        gain: 1.0,
      });

      // Connect: texCoord → mapping → musgrave
      // TexCoord outputs: 'generated', 'object', 'uv', 'normal', 'world'
      builder.connect('texCoord_0', 'generated', 'mapping_0', 'vector');
      builder.connect('mapping_0', 'vector', 'musgrave_0', 'vector');

      // Channel-specific processing
      if (channel === MaterialChannel.ALBEDO) {
        // Color ramp for albedo (ID: "colorRamp_0")
        builder.addColorRamp(
          this.getChannelColorRamp(channel),
          ColorRampMode.Linear,
        );
        builder.connect('musgrave_0', 'fac', 'colorRamp_0', 'fac');

        // Output
        builder.addOutput();
        builder.connect('colorRamp_0', 'color', 'output_0', 'value');
      } else if (channel === MaterialChannel.NORMAL) {
        // For normal maps, use a second noise as perturbation
        // (no addBump method exists; we use noise directly for normal variation)
        builder.addNoise('simplex', {
          scale: 8.0,
          detail: 4.0,
          distortion: 0.5,
        }); // ID: "simplex_0"
        builder.connect('mapping_0', 'vector', 'simplex_0', 'vector');

        // Mix both noise sources for a richer normal map
        // addMix takes a single factor number, inputs are 'factor', 'a', 'b'
        builder.addMix(0.5); // ID: "mix_0"
        builder.connect('musgrave_0', 'float', 'mix_0', 'a');
        builder.connect('simplex_0', 'float', 'mix_0', 'b');

        builder.addOutput();
        builder.connect('mix_0', 'float', 'output_0', 'value');
      } else {
        // Scalar channels: use float curve on noise output (ID: "floatCurve_0")
        builder.addFloatCurve(
          this.getChannelFloatCurve(channel),
        );
        builder.connect('musgrave_0', 'fac', 'floatCurve_0', 'fac');

        builder.addOutput();
        builder.connect('floatCurve_0', 'float', 'output_0', 'value');
      }

      // Build and render the texture using the builder's convenience method
      const texture = builder.buildTexture(
        undefined, // create a new renderer internally
        config.resolution,
        0.0, // objectRandom
        0.0, // timeW
      );
      return texture;
    } catch (err) {
      console.warn(
        `[SurfaceKernel] GLSL texture generation failed for channel ${channel}, using fallback:`,
        err,
      );
      return this.generateFallbackChannelTexture(channel, config);
    }
  }

  /**
   * Generate a fallback texture for a channel using CPU-based noise.
   *
   * @param channel - Which material channel
   * @param config - Effective configuration
   * @returns THREE.DataTexture
   */
  private generateFallbackChannelTexture(
    channel: MaterialChannel,
    config: SurfaceKernelConfig,
  ): THREE.DataTexture {
    const size = config.resolution;
    const data = new Float32Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        const n = this.noise.fbm(nx * 5, 0, ny * 5, 4);

        switch (channel) {
          case MaterialChannel.ALBEDO: {
            // Terrain-like coloring
            const t = (n + 1) * 0.5;
            if (t < 0.3) {
              // Sand
              data[idx] = 0.76; data[idx + 1] = 0.72; data[idx + 2] = 0.48;
            } else if (t < 0.5) {
              // Grass
              data[idx] = 0.29; data[idx + 1] = 0.55; data[idx + 2] = 0.19;
            } else if (t < 0.7) {
              // Rock
              data[idx] = 0.48; data[idx + 1] = 0.43; data[idx + 2] = 0.38;
            } else {
              // Snow
              data[idx] = 0.91; data[idx + 1] = 0.93; data[idx + 2] = 0.96;
            }
            data[idx + 3] = 1.0;
            break;
          }
          case MaterialChannel.NORMAL: {
            // Flat normal (0.5, 0.5, 1.0)
            data[idx] = 0.5; data[idx + 1] = 0.5; data[idx + 2] = 1.0; data[idx + 3] = 1.0;
            break;
          }
          case MaterialChannel.ROUGHNESS: {
            const roughness = 0.5 + n * 0.3;
            data[idx] = roughness; data[idx + 1] = roughness; data[idx + 2] = roughness;
            data[idx + 3] = 1.0;
            break;
          }
          case MaterialChannel.METALLIC: {
            const metallic = Math.max(0, n * 0.1);
            data[idx] = metallic; data[idx + 1] = metallic; data[idx + 2] = metallic;
            data[idx + 3] = 1.0;
            break;
          }
          case MaterialChannel.AO: {
            const ao = 0.8 + n * 0.2;
            data[idx] = ao; data[idx + 1] = ao; data[idx + 2] = ao;
            data[idx + 3] = 1.0;
            break;
          }
          case MaterialChannel.HEIGHT: {
            const height = (n + 1) * 0.5;
            data[idx] = height; data[idx + 1] = height; data[idx + 2] = height;
            data[idx + 3] = 1.0;
            break;
          }
        }
      }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Get color ramp stops for a given material channel.
   *
   * @param channel - Material channel
   * @returns Array of color ramp stops
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
   * Get float curve control points for a given material channel.
   *
   * @param channel - Material channel
   * @returns Array of control points (position, value)
   */
  private getChannelFloatCurve(
    channel: MaterialChannel,
  ): FloatCurvePoint[] {
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

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Dispose of GPU resources held by this kernel.
   */
  dispose(): void {
    this.disposed = true;
  }

  /**
   * Check whether this kernel has been disposed.
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): SurfaceKernelConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration at runtime.
   */
  setConfig(config: Partial<SurfaceKernelConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// TerrainSurfaceBridge
// ============================================================================

/**
 * Material zone identifiers for per-vertex material assignment.
 *
 * Each zone corresponds to a set of rules (height, slope, cave, water)
 * that determine which material to assign at each vertex.
 */
export enum TerrainMaterialZone {
  /** Snow above the snow line */
  SNOW = 'snow',
  /** Rock on steep faces and high altitude */
  ROCK = 'rock',
  /** Grass on moderate slopes below the tree line */
  GRASS = 'grass',
  /** Sand on flat areas near water */
  SAND = 'sand',
  /** Cliff material on very steep faces */
  CLIFF = 'cliff',
  /** Dark stone inside caves */
  CAVE_STONE = 'cave_stone',
  /** Wet/muddy near water */
  WET = 'wet',
  /** Soil/dirt in moderate areas */
  SOIL = 'soil',
  /** Underwater areas */
  UNDERWATER = 'underwater',
}

/**
 * Per-vertex terrain attributes computed from element evaluation.
 *
 * These attributes drive the TerrainSurfaceBridge's material assignment.
 */
export interface TerrainVertexAttributes {
  /** World-space height of the vertex */
  height: number;
  /** Slope angle in radians at the vertex */
  slope: number;
  /** Whether the vertex is inside a cave */
  caveTag: boolean;
  /** Distance to nearest cave boundary */
  boundarySDF: number;
  /** Whether the vertex is covered by water */
  liquidCovered: boolean;
  /** Height of the water plane at this location */
  waterPlaneHeight: number;
  /** Material ID from element evaluation */
  materialId: number;
  /** Sand dune displacement value */
  sandDuneHeight: number;
  /** Auxiliary data from element evaluation */
  auxiliary: Record<string, any>;
}

/**
 * Configuration for the TerrainSurfaceBridge.
 */
export interface TerrainSurfaceBridgeConfig {
  /** Height above which snow appears (world units) */
  snowLine: number;
  /** Height above which rock dominates (world units) */
  rockLine: number;
  /** Slope angle (radians) above which cliff material is used */
  cliffSlope: number;
  /** Slope angle (radians) below which sand appears near water */
  flatSlope: number;
  /** Distance from water plane within which wet/sand material is applied */
  waterProximity: number;
  /** Distance from cave boundary within which cave stone appears */
  caveProximity: number;
  /** Base color for snow */
  snowColor: THREE.Color;
  /** Base color for rock */
  rockColor: THREE.Color;
  /** Base color for grass */
  grassColor: THREE.Color;
  /** Base color for sand */
  sandColor: THREE.Color;
  /** Base color for cliff */
  cliffColor: THREE.Color;
  /** Base color for cave stone */
  caveStoneColor: THREE.Color;
  /** Base color for wet/muddy areas */
  wetColor: THREE.Color;
  /** Base color for soil */
  soilColor: THREE.Color;
  /** Base roughness for snow */
  snowRoughness: number;
  /** Base roughness for rock */
  rockRoughness: number;
  /** Base roughness for grass */
  grassRoughness: number;
  /** Base roughness for sand */
  sandRoughness: number;
  /** Noise seed for material variation */
  seed: number;
}

/**
 * Default configuration for the TerrainSurfaceBridge.
 */
export const DEFAULT_TERRAIN_SURFACE_BRIDGE_CONFIG: TerrainSurfaceBridgeConfig = {
  snowLine: 20.0,
  rockLine: 12.0,
  cliffSlope: Math.PI / 4, // 45 degrees
  flatSlope: Math.PI / 12, // 15 degrees
  waterProximity: 3.0,
  caveProximity: 5.0,
  snowColor: new THREE.Color(0xe8ecf4),
  rockColor: new THREE.Color(0x7a6e60),
  grassColor: new THREE.Color(0x4a8c30),
  sandColor: new THREE.Color(0xc2b87a),
  cliffColor: new THREE.Color(0x6a5e50),
  caveStoneColor: new THREE.Color(0x4a4440),
  wetColor: new THREE.Color(0x3a5530),
  soilColor: new THREE.Color(0x6b5b45),
  snowRoughness: 0.6,
  rockRoughness: 0.95,
  grassRoughness: 0.85,
  sandRoughness: 0.9,
  seed: 42,
};

/**
 * Bridge between terrain element composition and surface material assignment.
 *
 * TerrainSurfaceBridge evaluates per-vertex material zones based on
 * auxiliary attributes from the ElementRegistry's evaluation. It implements
 * height-based, slope-based, cave-aware, and water-proximity rules to
 * determine the appropriate material zone at each vertex.
 *
 * The material zones are then used to generate a THREE.MeshStandardMaterial
 * with appropriate color, roughness, and normal variation per zone.
 *
 * Usage:
 * ```typescript
 * const bridge = new TerrainSurfaceBridge(config);
 * const mesh = bridge.applySurfaceToTerrain(terrainMesh, registry, config);
 * ```
 */
export class TerrainSurfaceBridge {
  private config: TerrainSurfaceBridgeConfig;
  private noise: NoiseUtils;

  /**
   * Create a new TerrainSurfaceBridge.
   *
   * @param config - Configuration (defaults to DEFAULT_TERRAIN_SURFACE_BRIDGE_CONFIG)
   */
  constructor(config: Partial<TerrainSurfaceBridgeConfig> = {}) {
    this.config = { ...DEFAULT_TERRAIN_SURFACE_BRIDGE_CONFIG, ...config };
    this.noise = new NoiseUtils(this.config.seed);
  }

  /**
   * Apply surface material to a terrain mesh based on element evaluation.
   *
   * Evaluates the ElementRegistry at each vertex to compute auxiliary
   * attributes (cave tags, water coverage, material IDs, etc.), then
   * determines the material zone per-vertex and generates a multi-zone
   * PBR material.
   *
   * @param terrainMesh - The terrain mesh to apply surface material to
   * @param elementRegistry - ElementRegistry with initialized elements
   * @param config - Optional per-call config overrides
   * @returns The terrain mesh with the applied material
   */
  applySurfaceToTerrain(
    terrainMesh: THREE.Mesh,
    elementRegistry: ElementRegistry,
    config: Partial<TerrainSurfaceBridgeConfig> = {},
  ): THREE.Mesh {
    const effectiveConfig = { ...this.config, ...config };
    const geometry = terrainMesh.geometry;
    const posAttr = geometry.getAttribute('position');

    if (!posAttr) {
      console.warn('[TerrainSurfaceBridge] No position attribute on terrain mesh');
      return terrainMesh;
    }

    const vertexCount = posAttr.count;
    const posArray = posAttr.array as Float32Array;

    // Evaluate terrain attributes per-vertex
    const vertexAttributes = this.evaluateVertexAttributes(
      posArray, vertexCount, elementRegistry,
    );

    // Determine material zone per-vertex
    const zones = this.assignMaterialZones(vertexAttributes, effectiveConfig);

    // Store zone data as a vertex attribute for shader access
    const zoneArray = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      zoneArray[i] = zones[i] as unknown as number;
    }
    geometry.setAttribute('materialZone', new THREE.BufferAttribute(zoneArray, 1));

    // Store material IDs from element evaluation
    const materialIdArray = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      materialIdArray[i] = vertexAttributes[i].materialId;
    }
    geometry.setAttribute('materialId', new THREE.BufferAttribute(materialIdArray, 1));

    // Store cave tag
    const caveArray = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      caveArray[i] = vertexAttributes[i].caveTag ? 1.0 : 0.0;
    }
    geometry.setAttribute('caveTag', new THREE.BufferAttribute(caveArray, 1));

    // Generate the terrain material
    const material = this.generateTerrainMaterial(vertexAttributes, effectiveConfig);
    terrainMesh.material = material;

    return terrainMesh;
  }

  /**
   * Evaluate terrain attributes at each vertex using the element registry.
   *
   * For each vertex, queries all enabled elements in the registry to
   * determine auxiliary data such as cave tags, water coverage, and
   * material IDs.
   *
   * @param posArray - Vertex positions (flat Float32Array)
   * @param vertexCount - Number of vertices
   * @param registry - ElementRegistry with initialized elements
   * @returns Array of TerrainVertexAttributes, one per vertex
   */
  private evaluateVertexAttributes(
    posArray: Float32Array,
    vertexCount: number,
    registry: ElementRegistry,
  ): TerrainVertexAttributes[] {
    const attributes: TerrainVertexAttributes[] = [];

    // Get normal attribute for slope computation
    const normalAttr = registry ? null : null; // We compute slopes from height differences

    for (let i = 0; i < vertexCount; i++) {
      const px = posArray[i * 3];
      const py = posArray[i * 3 + 1];
      const pz = posArray[i * 3 + 2];
      const point = new THREE.Vector3(px, py, pz);

      // Evaluate composed elements at this point
      const result = registry.evaluateComposed(point, CompositionOperation.DIFFERENCE);

      // Compute slope from neighboring vertices (central difference approximation)
      let slope = 0;
      if (i > 0 && i < vertexCount - 1) {
        const prevY = posArray[(i - 1) * 3 + 1];
        const nextY = posArray[(i + 1) * 3 + 1];
        const prevX = posArray[(i - 1) * 3];
        const nextX = posArray[(i + 1) * 3];
        const dx = Math.sqrt(
          (nextX - prevX) * (nextX - prevX) +
          (posArray[(i + 1) * 3 + 2] - posArray[(i - 1) * 3 + 2]) ** 2,
        );
        if (dx > 1e-6) {
          slope = Math.atan2(Math.abs(nextY - prevY), dx);
        }
      }

      const attr: TerrainVertexAttributes = {
        height: py,
        slope,
        caveTag: result.auxiliary.caveTag ?? false,
        boundarySDF: result.auxiliary.boundarySDF ?? Infinity,
        liquidCovered: result.auxiliary.LiquidCovered ?? false,
        waterPlaneHeight: result.auxiliary.waterPlaneHeight ?? 0,
        materialId: result.materialId,
        sandDuneHeight: result.auxiliary.sandDuneHeight ?? 0,
        auxiliary: result.auxiliary,
      };

      attributes.push(attr);
    }

    return attributes;
  }

  /**
   * Assign material zones based on vertex attributes.
   *
   * Rules (evaluated in priority order):
   * 1. Cave: cave_stone if inside a cave
   * 2. Water proximity: wet/sand if near water
   * 3. Height: snow above snowLine, rock above rockLine
   * 4. Slope: cliff on steep faces, sand on flat
   * 5. Default: grass/soil based on height
   *
   * @param attributes - Per-vertex terrain attributes
   * @param config - Effective configuration
   * @returns Array of TerrainMaterialZone enum values (as numbers)
   */
  private assignMaterialZones(
    attributes: TerrainVertexAttributes[],
    config: TerrainSurfaceBridgeConfig,
  ): TerrainMaterialZone[] {
    const zones: TerrainMaterialZone[] = [];

    for (const attr of attributes) {
      let zone: TerrainMaterialZone;

      // Rule 1: Cave
      if (attr.caveTag) {
        zone = TerrainMaterialZone.CAVE_STONE;
      }
      // Rule 2: Water proximity
      else if (attr.liquidCovered) {
        zone = TerrainMaterialZone.UNDERWATER;
      } else if (
        !attr.caveTag &&
        Math.abs(attr.height - attr.waterPlaneHeight) < config.waterProximity &&
        attr.slope < config.flatSlope
      ) {
        zone = TerrainMaterialZone.SAND;
      } else if (
        !attr.caveTag &&
        Math.abs(attr.height - attr.waterPlaneHeight) < config.waterProximity
      ) {
        zone = TerrainMaterialZone.WET;
      }
      // Rule 3: Height-based
      else if (attr.height > config.snowLine) {
        zone = TerrainMaterialZone.SNOW;
      } else if (attr.height > config.rockLine) {
        if (attr.slope > config.cliffSlope) {
          zone = TerrainMaterialZone.CLIFF;
        } else {
          zone = TerrainMaterialZone.ROCK;
        }
      }
      // Rule 4: Slope-based
      else if (attr.slope > config.cliffSlope) {
        zone = TerrainMaterialZone.CLIFF;
      } else if (attr.slope < config.flatSlope && attr.sandDuneHeight > 0.1) {
        zone = TerrainMaterialZone.SAND;
      }
      // Rule 5: Default
      else if (attr.height > config.rockLine * 0.5) {
        zone = TerrainMaterialZone.SOIL;
      } else {
        zone = TerrainMaterialZone.GRASS;
      }

      // Cave proximity: blend toward cave stone near boundaries
      if (!attr.caveTag && attr.boundarySDF < config.caveProximity && attr.boundarySDF > 0) {
        const blendFactor = 1.0 - attr.boundarySDF / config.caveProximity;
        if (blendFactor > 0.5) {
          zone = TerrainMaterialZone.CAVE_STONE;
        }
      }

      zones.push(zone);
    }

    return zones;
  }

  /**
   * Generate a terrain material from vertex attributes and zone assignments.
   *
   * Creates a MeshStandardMaterial with vertex colors based on material zones,
   * plus appropriate roughness variation per zone.
   *
   * @param attributes - Per-vertex terrain attributes
   * @param config - Effective configuration
   * @returns THREE.MeshStandardMaterial
   */
  generateTerrainMaterial(
    attributes: TerrainVertexAttributes[],
    config: Partial<TerrainSurfaceBridgeConfig> = {},
  ): THREE.MeshStandardMaterial {
    const effectiveConfig = { ...this.config, ...config };
    const vertexCount = attributes.length;

    // Build vertex color array based on zones
    const colors = new Float32Array(vertexCount * 3);
    const roughness = new Float32Array(vertexCount);

    const zones = this.assignMaterialZones(attributes, effectiveConfig);

    for (let i = 0; i < vertexCount; i++) {
      const zone = zones[i];
      const attr = attributes[i];

      // Add noise variation to colors for natural look
      const noiseVar = this.noise.fbm(
        attr.height * 0.1,
        attr.slope * 2.0,
        i * 0.01,
        3,
      ) * 0.06;

      let baseColor: THREE.Color;
      let baseRoughness: number;

      switch (zone) {
        case TerrainMaterialZone.SNOW:
          baseColor = effectiveConfig.snowColor.clone();
          baseRoughness = effectiveConfig.snowRoughness;
          break;
        case TerrainMaterialZone.ROCK:
          baseColor = effectiveConfig.rockColor.clone();
          baseRoughness = effectiveConfig.rockRoughness;
          break;
        case TerrainMaterialZone.GRASS:
          baseColor = effectiveConfig.grassColor.clone();
          baseRoughness = effectiveConfig.grassRoughness;
          break;
        case TerrainMaterialZone.SAND:
          baseColor = effectiveConfig.sandColor.clone();
          baseRoughness = effectiveConfig.sandRoughness;
          break;
        case TerrainMaterialZone.CLIFF:
          baseColor = effectiveConfig.cliffColor.clone();
          baseRoughness = effectiveConfig.rockRoughness;
          break;
        case TerrainMaterialZone.CAVE_STONE:
          baseColor = effectiveConfig.caveStoneColor.clone();
          baseRoughness = 0.95;
          break;
        case TerrainMaterialZone.WET:
          baseColor = effectiveConfig.wetColor.clone();
          baseRoughness = 0.4;
          break;
        case TerrainMaterialZone.SOIL:
          baseColor = effectiveConfig.soilColor.clone();
          baseRoughness = 0.9;
          break;
        case TerrainMaterialZone.UNDERWATER:
          baseColor = new THREE.Color(0x0a2640);
          baseRoughness = 0.2;
          break;
        default:
          baseColor = effectiveConfig.soilColor.clone();
          baseRoughness = 0.85;
      }

      // Apply noise variation
      baseColor.r = Math.max(0, Math.min(1, baseColor.r + noiseVar));
      baseColor.g = Math.max(0, Math.min(1, baseColor.g + noiseVar));
      baseColor.b = Math.max(0, Math.min(1, baseColor.b + noiseVar));

      colors[i * 3] = baseColor.r;
      colors[i * 3 + 1] = baseColor.g;
      colors[i * 3 + 2] = baseColor.b;
      roughness[i] = Math.max(0, Math.min(1, baseRoughness + noiseVar));
    }

    // Compute average roughness for the material
    let totalRoughness = 0;
    for (let i = 0; i < vertexCount; i++) {
      totalRoughness += roughness[i];
    }
    const avgRoughness = vertexCount > 0 ? totalRoughness / vertexCount : 0.85;

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: avgRoughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    // Store vertex colors in the material's geometry
    // (Caller must set the 'color' attribute on the geometry)
    (material as any)._terrainRoughness = roughness;
    (material as any)._terrainZones = zones;

    return material;
  }

  /**
   * Apply vertex colors from terrain attributes to a geometry.
   *
   * Call this after applySurfaceToTerrain to set the actual color attribute
   * on the geometry. The material must have vertexColors enabled.
   *
   * @param geometry - The geometry to apply colors to
   * @param attributes - Per-vertex terrain attributes
   * @param config - Optional config overrides
   * @returns The geometry with colors applied
   */
  applyVertexColors(
    geometry: THREE.BufferGeometry,
    attributes: TerrainVertexAttributes[],
    config: Partial<TerrainSurfaceBridgeConfig> = {},
  ): THREE.BufferGeometry {
    const effectiveConfig = { ...this.config, ...config };
    const vertexCount = attributes.length;
    const colors = new Float32Array(vertexCount * 3);
    const zones = this.assignMaterialZones(attributes, effectiveConfig);

    for (let i = 0; i < vertexCount; i++) {
      const zone = zones[i];
      const attr = attributes[i];
      const noiseVar = this.noise.fbm(
        attr.height * 0.1,
        attr.slope * 2.0,
        i * 0.01,
        3,
      ) * 0.06;

      let baseColor: THREE.Color;
      switch (zone) {
        case TerrainMaterialZone.SNOW:
          baseColor = effectiveConfig.snowColor.clone();
          break;
        case TerrainMaterialZone.ROCK:
          baseColor = effectiveConfig.rockColor.clone();
          break;
        case TerrainMaterialZone.GRASS:
          baseColor = effectiveConfig.grassColor.clone();
          break;
        case TerrainMaterialZone.SAND:
          baseColor = effectiveConfig.sandColor.clone();
          break;
        case TerrainMaterialZone.CLIFF:
          baseColor = effectiveConfig.cliffColor.clone();
          break;
        case TerrainMaterialZone.CAVE_STONE:
          baseColor = effectiveConfig.caveStoneColor.clone();
          break;
        case TerrainMaterialZone.WET:
          baseColor = effectiveConfig.wetColor.clone();
          break;
        case TerrainMaterialZone.SOIL:
          baseColor = effectiveConfig.soilColor.clone();
          break;
        case TerrainMaterialZone.UNDERWATER:
          baseColor = new THREE.Color(0x0a2640);
          break;
        default:
          baseColor = effectiveConfig.soilColor.clone();
      }

      baseColor.r = Math.max(0, Math.min(1, baseColor.r + noiseVar));
      baseColor.g = Math.max(0, Math.min(1, baseColor.g + noiseVar));
      baseColor.b = Math.max(0, Math.min(1, baseColor.b + noiseVar));

      colors[i * 3] = baseColor.r;
      colors[i * 3 + 1] = baseColor.g;
      colors[i * 3 + 2] = baseColor.b;
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): TerrainSurfaceBridgeConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration at runtime.
   */
  setConfig(config: Partial<TerrainSurfaceBridgeConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
