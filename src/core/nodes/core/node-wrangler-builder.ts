/**
 * NodeWrangler Builder - Fluent API for constructing node graphs
 *
 * This module provides a high-level, chainable API inspired by Blender's
 * Python NodeWrangler (`infinigen/core/nodes/node_wrangler.py`). It enables
 * asset authors to write concise, readable code like:
 *
 * ```typescript
 * const nw = new NodeWranglerBuilder();
 * const n1 = nw.noise({ scale: 5, detail: 4 });
 * const n2 = nw.musgrave({ scale: 3, octaves: 8 });
 * const blended = n1.mix(n2, 0.5);
 * const ramped = blended.colorRamp([
 *   { position: 0, color: [0.2, 0.1, 0.05] },
 *   { position: 1, color: [0.6, 0.4, 0.2] },
 * ]);
 * nw.principledBSDF({ baseColor: ramped, roughness: 0.7 });
 * ```
 *
 * The builder delegates all node creation and connection to the underlying
 * `NodeWrangler`, so graphs built with this API are fully compatible with
 * the existing evaluation pipeline.
 *
 * @module node-wrangler-builder
 */

import { NodeWrangler, NodeInstance, NodeLink } from './node-wrangler';
import { NodeTypes } from './node-types';
import { SocketType } from './socket-types';
import * as THREE from 'three';

// ============================================================================
// Public type definitions
// ============================================================================

/**
 * A color stop in a ColorRamp.
 *
 * @example
 * ```typescript
 * const stops: ColorRampStop[] = [
 *   { position: 0.0, color: [0.1, 0.1, 0.1] },
 *   { position: 0.5, color: [0.5, 0.3, 0.1] },
 *   { position: 1.0, color: [0.9, 0.8, 0.6, 1.0] },
 * ];
 * ```
 */
export interface ColorRampStop {
  /** Position on the ramp in the range [0, 1] */
  position: number;
  /** RGB or RGBA color. Alpha defaults to 1.0 if omitted. */
  color: [number, number, number] | [number, number, number, number];
}

/**
 * Parameters for a Principled BSDF shader node.
 *
 * Each field accepts either a `NodeOutput` (for procedural connections)
 * or a static value. All fields are optional; sensible defaults are used
 * when omitted.
 */
export interface PrincipledBSDFParams {
  /** Base color of the material. Default: [0.8, 0.8, 0.8] */
  baseColor?: NodeOutput | [number, number, number];
  /** Metallic factor in [0, 1]. Default: 0 */
  metallic?: NodeOutput | number;
  /** Roughness in [0, 1]. Default: 0.5 */
  roughness?: NodeOutput | number;
  /** Specular intensity. Default: 0.5 */
  specular?: NodeOutput | number;
  /** Specular tint. Default: 0 */
  specularTint?: NodeOutput | number;
  /** Index of refraction. Default: 1.45 */
  ior?: NodeOutput | number;
  /** Transmission factor. Default: 0 */
  transmission?: NodeOutput | number;
  /** Transmission roughness. Default: 0 */
  transmissionRoughness?: NodeOutput | number;
  /** Subsurface scattering weight. Default: 0 */
  subsurface?: NodeOutput | number;
  /** Subsurface radius (RGB). Default: [1, 0.2, 0.1] */
  subsurfaceRadius?: NodeOutput | [number, number, number];
  /** Subsurface color. Default: [0.8, 0.8, 0.8] */
  subsurfaceColor?: NodeOutput | [number, number, number];
  /** Anisotropic factor. Default: 0 */
  anisotropic?: NodeOutput | number;
  /** Anisotropic rotation in [0, 1]. Default: 0 */
  anisotropicRotation?: NodeOutput | number;
  /** Sheen factor. Default: 0 */
  sheen?: NodeOutput | number;
  /** Sheen tint. Default: 0.5 */
  sheenTint?: NodeOutput | number;
  /** Clearcoat factor. Default: 0 */
  clearcoat?: NodeOutput | number;
  /** Clearcoat roughness. Default: 0.03 */
  clearcoatRoughness?: NodeOutput | number;
  /** Emission color. Default: [0, 0, 0] */
  emission?: NodeOutput | [number, number, number];
  /** Emission strength. Default: 1 */
  emissionStrength?: NodeOutput | number;
  /** Alpha in [0, 1]. Default: 1 */
  alpha?: NodeOutput | number;
  /** Custom normal input. */
  normal?: NodeOutput;
  /** Displacement input. */
  displacement?: NodeOutput;
  /** Tangent input. */
  tangent?: NodeOutput;
}

/**
 * Parameters for Noise Texture node.
 */
export interface NoiseTextureParams {
  /** Scale of the noise. Default: 5 */
  scale?: NodeOutput | number;
  /** Level of detail (octaves). Default: 2 */
  detail?: NodeOutput | number;
  /** Roughness of the noise. Default: 0.5 */
  roughness?: NodeOutput | number;
  /** Distortion amount. Default: 0 */
  distortion?: NodeOutput | number;
  /** Noise type: 'MULTIFRACTAL', 'RIDGED_MULTIFRACTAL', 'HYBRID_MULTIFRACTAL', 'FBM'. Default: 'MULTIFRACTAL' */
  noiseType?: string;
  /** Vector input for noise coordinates. */
  vector?: NodeOutput;
}

/**
 * Parameters for Musgrave Texture node.
 */
export interface MusgraveTextureParams {
  /** Scale. Default: 5 */
  scale?: NodeOutput | number;
  /** Detail (octaves). Default: 2 */
  detail?: NodeOutput | number;
  /** Dimension (highest fractal dimension). Default: 2 */
  dimension?: NodeOutput | number;
  /** Lacunarity (gap between successive octaves). Default: 2 */
  lacunarity?: NodeOutput | number;
  /** Octaves. Default: 8 */
  octaves?: NodeOutput | number;
  /** Musgrave type. Default: 'FBM' */
  musgraveType?: string;
  /** Vector input. */
  vector?: NodeOutput;
}

/**
 * Parameters for Voronoi Texture node.
 */
export interface VoronoiTextureParams {
  /** Scale. Default: 5 */
  scale?: NodeOutput | number;
  /** Smoothness. Default: 0 */
  smoothness?: NodeOutput | number;
  /** Exponent. Default: 0.5 */
  exponent?: NodeOutput | number;
  /** Distance metric. Default: 'EUCLIDEAN' */
  distance?: string;
  /** Feature. Default: 'F1' */
  feature?: string;
  /** Vector input. */
  vector?: NodeOutput;
}

/**
 * Parameters for Wave Texture node.
 */
export interface WaveTextureParams {
  /** Scale. Default: 5 */
  scale?: NodeOutput | number;
  /** Distortion. Default: 0 */
  distortion?: NodeOutput | number;
  /** Detail. Default: 2 */
  detail?: NodeOutput | number;
  /** Detail scale. Default: 1 */
  detailScale?: NodeOutput | number;
  /** Wave type: 'BANDS' or 'RINGS'. Default: 'BANDS' */
  waveType?: string;
  /** Bands/rings direction. Default: 'X' */
  bandsDirection?: string;
  /** Vector input. */
  vector?: NodeOutput;
}

/**
 * Attribute domain for read/write operations.
 */
export type AttributeDomainType = 'POINT' | 'EDGE' | 'FACE' | 'CORNER' | 'CURVE' | 'INSTANCE';

/**
 * Input value that can be either a NodeOutput connection or a static value.
 */
export type NodeInputValue = NodeOutput | number | [number, number, number] | [number, number, number, number] | boolean | string;

// ============================================================================
// NodeOutput class
// ============================================================================

/**
 * Represents a reference to a specific output socket of a node.
 *
 * This is the key abstraction that enables the fluent API. Every method that
 * creates a node returns a `NodeOutput`, and calling arithmetic or utility
 * methods on it creates new nodes connected to this output automatically.
 *
 * @example
 * ```typescript
 * const nw = new NodeWranglerBuilder();
 * const noise = nw.noise({ scale: 5 });
 * // noise is a NodeOutput pointing to NoiseTexture's "Fac" output
 *
 * // Arithmetic creates new Math nodes automatically:
 * const doubled = noise.multiply(2);
 * const clamped = doubled.clamp(0, 1);
 * const colored = clamped.colorRamp([
 *   { position: 0, color: [0, 0, 0] },
 *   { position: 1, color: [1, 1, 1] },
 * ]);
 * ```
 */
export class NodeOutput {
  /** The ID of the node this output belongs to */
  readonly nodeId: string;
  /** The name of the output socket on the node */
  readonly socketName: string;
  /** The socket type (FLOAT, COLOR, VECTOR, etc.) */
  readonly type: SocketType | string;
  /** Reference back to the builder that created this output */
  readonly wrangler: NodeWranglerBuilder;

  constructor(
    nodeId: string,
    socketName: string,
    type: SocketType | string,
    wrangler: NodeWranglerBuilder,
  ) {
    this.nodeId = nodeId;
    this.socketName = socketName;
    this.type = type;
    this.wrangler = wrangler;
  }

  // --------------------------------------------------------------------------
  // Arithmetic operations — create Math nodes automatically
  // --------------------------------------------------------------------------

  /**
   * Add this output to another value. Creates a Math(ADD) node.
   *
   * @param other - A NodeOutput, number, or vector to add.
   * @returns NodeOutput pointing to the result.
   *
   * @example
   * ```typescript
   * const sum = noise1.add(noise2);
   * const offset = noise.add(0.5);
   * ```
   */
  add(other: NodeOutput | number | [number, number, number] | [number, number, number, number]): NodeOutput {
    if (Array.isArray(other)) {
      // For vector addition, create a VectorMath(ADD) node
      return this.wrangler.createVectorMathNode('ADD', this, other);
    }
    return this.wrangler.createMathNode('ADD', this, other);
  }

  /**
   * Subtract another value from this output. Creates a Math(SUBTRACT) node.
   *
   * @param other - A NodeOutput or number to subtract.
   * @returns NodeOutput pointing to the result.
   *
   * @example
   * ```typescript
   * const diff = noise1.subtract(noise2);
   * ```
   */
  subtract(other: NodeOutput | number): NodeOutput {
    return this.wrangler.createMathNode('SUBTRACT', this, other);
  }

  /**
   * Multiply this output by another value. Creates a Math(MULTIPLY) node.
   *
   * @param other - A NodeOutput or number to multiply by.
   * @returns NodeOutput pointing to the result.
   *
   * @example
   * ```typescript
   * const scaled = noise.multiply(5);
   * const product = noise1.multiply(noise2);
   * ```
   */
  multiply(other: NodeOutput | number): NodeOutput {
    return this.wrangler.createMathNode('MULTIPLY', this, other);
  }

  /**
   * Divide this output by another value. Creates a Math(DIVIDE) node.
   *
   * @param other - A NodeOutput or number to divide by.
   * @returns NodeOutput pointing to the result.
   */
  divide(other: NodeOutput | number): NodeOutput {
    return this.wrangler.createMathNode('DIVIDE', this, other);
  }

  /**
   * Raise this output to a power. Creates a Math(POWER) node.
   *
   * @param exponent - A NodeOutput or number for the exponent.
   * @returns NodeOutput pointing to the result.
   *
   * @example
   * ```typescript
   * const squared = noise.power(2);
   * ```
   */
  power(exponent: NodeOutput | number): NodeOutput {
    return this.wrangler.createMathNode('POWER', this, exponent);
  }

  /**
   * Clamp this output between min and max. Creates a Math(CLAMP) node
   * or a Clamp node depending on the operation mode.
   *
   * @param min - Minimum value. Default: 0
   * @param max - Maximum value. Default: 1
   * @returns NodeOutput pointing to the clamped result.
   *
   * @example
   * ```typescript
   * const clamped = noise.clamp(0, 1);
   * ```
   */
  clamp(min: number = 0, max: number = 1): NodeOutput {
    // Use MapRange with clamping for general min/max clamping
    return this.wrangler.createMapRange(this, min, max, min, max, true);
  }

  /**
   * Mix this output with another value using a factor. Creates a Mix node.
   *
   * @param other - The second value to mix with.
   * @param factor - Mix factor (0 = this, 1 = other). Can be NodeOutput or number.
   * @returns NodeOutput pointing to the mixed result.
   *
   * @example
   * ```typescript
   * const blended = noise1.mix(noise2, 0.5);
   * const animated = noise1.mix(noise2, timeOutput);
   * ```
   */
  mix(other: NodeOutput, factor: NodeOutput | number): NodeOutput {
    return this.wrangler.createMixNode(this, other, factor);
  }

  /**
   * Apply a color ramp to this output. Creates a ColorRamp node.
   *
   * @param stops - Array of color stops defining the ramp.
   * @returns NodeOutput pointing to the Color output of the ColorRamp.
   *
   * @example
   * ```typescript
   * const ramped = noise.colorRamp([
   *   { position: 0, color: [0.1, 0.1, 0.1] },
   *   { position: 0.5, color: [0.5, 0.3, 0.1] },
   *   { position: 1, color: [0.9, 0.8, 0.6] },
   * ]);
   * ```
   */
  colorRamp(stops: ColorRampStop[]): NodeOutput {
    return this.wrangler.createColorRampNode(this, stops);
  }

  /**
   * Map this output from one range to another. Creates a MapRange node.
   *
   * @param fromMin - Source range minimum.
   * @param fromMax - Source range maximum.
   * @param toMin - Target range minimum.
   * @param toMax - Target range maximum.
   * @returns NodeOutput pointing to the mapped result.
   *
   * @example
   * ```typescript
   * // Map noise from [0,1] to [10,20]
   * const mapped = noise.mapRange(0, 1, 10, 20);
   * ```
   */
  mapRange(fromMin: number, fromMax: number, toMin: number, toMax: number): NodeOutput {
    return this.wrangler.createMapRange(this, fromMin, fromMax, toMin, toMax);
  }

  /**
   * Apply a float curve to this output. Creates a FloatCurve node.
   *
   * @param points - Array of [x, y] control points for the curve.
   * @returns NodeOutput pointing to the curved result.
   *
   * @example
   * ```typescript
   * const curved = noise.floatCurve([
   *   [0, 0], [0.25, 0.1], [0.5, 0.8], [0.75, 0.95], [1, 1]
   * ]);
   * ```
   */
  floatCurve(points: [number, number][]): NodeOutput {
    return this.wrangler.createFloatCurveNode(this, points);
  }

  /**
   * Get the absolute value of this output. Creates a Math(ABSOLUTE) node.
   *
   * @returns NodeOutput pointing to the absolute value.
   */
  abs(): NodeOutput {
    return this.wrangler.createMathNode('ABSOLUTE', this);
  }

  /**
   * Get the square root of this output. Creates a Math(SQRT) node.
   *
   * @returns NodeOutput pointing to the square root.
   */
  sqrt(): NodeOutput {
    return this.wrangler.createMathNode('SQRT', this);
  }

  /**
   * Get the sine of this output (input in radians). Creates a Math(SINE) node.
   *
   * @returns NodeOutput pointing to the sine result.
   */
  sin(): NodeOutput {
    return this.wrangler.createMathNode('SINE', this);
  }

  /**
   * Get the cosine of this output (input in radians). Creates a Math(COSINE) node.
   *
   * @returns NodeOutput pointing to the cosine result.
   */
  cos(): NodeOutput {
    return this.wrangler.createMathNode('COSINE', this);
  }

  /**
   * Negate this output (multiply by -1). Creates a Math(MULTIPLY) node.
   *
   * @returns NodeOutput pointing to the negated result.
   */
  negate(): NodeOutput {
    return this.wrangler.createMathNode('MULTIPLY', this, -1);
  }

  /**
   * Get the fractional part of this output. Creates a Math(FRACTION) node.
   *
   * @returns NodeOutput pointing to the fractional result.
   */
  fraction(): NodeOutput {
    return this.wrangler.createMathNode('FRACTION', this);
  }

  /**
   * Get the modulo of this output divided by another value. Creates a Math(MODULO) node.
   *
   * @param other - A NodeOutput or number to modulo by.
   * @returns NodeOutput pointing to the modulo result.
   */
  modulo(other: NodeOutput | number): NodeOutput {
    return this.wrangler.createMathNode('MODULO', this, other);
  }

  /**
   * Get the minimum of this output and another value. Creates a Math(MINIMUM) node.
   *
   * @param other - A NodeOutput or number.
   * @returns NodeOutput pointing to the minimum result.
   */
  min(other: NodeOutput | number): NodeOutput {
    return this.wrangler.createMathNode('MINIMUM', this, other);
  }

  /**
   * Get the maximum of this output and another value. Creates a Math(MAXIMUM) node.
   *
   * @param other - A NodeOutput or number.
   * @returns NodeOutput pointing to the maximum result.
   */
  max(other: NodeOutput | number): NodeOutput {
    return this.wrangler.createMathNode('MAXIMUM', this, other);
  }

  /**
   * Invert this output (1 - value). Creates a Math(SUBTRACT) node.
   *
   * @returns NodeOutput pointing to the inverted result.
   *
   * @example
   * ```typescript
   * const inverted = noise.invert();
   * ```
   */
  invert(): NodeOutput {
    return this.wrangler.createMathNode('SUBTRACT', 1, this);
  }

  /**
   * Get a specific output socket from the same node.
   * Useful when a node has multiple outputs (e.g., Voronoi has Distance, Color, Position).
   *
   * @param socketName - Name of the output socket to reference.
   * @param type - Socket type of the output.
   * @returns NodeOutput pointing to the specified socket.
   *
   * @example
   * ```typescript
   * const voronoi = nw.voronoi({ scale: 5 });
   * const distance = voronoi.output('Distance', SocketType.FLOAT);
   * const color = voronoi.output('Color', SocketType.COLOR);
   * ```
   */
  output(socketName: string, type?: SocketType | string): NodeOutput {
    return new NodeOutput(this.nodeId, socketName, type || this.type, this.wrangler);
  }

  /**
   * Connect this output to a specific input socket on a target node.
   * Low-level connection helper for cases not covered by the fluent API.
   *
   * @param targetNodeId - ID of the target node.
   * @param targetSocketName - Name of the input socket on the target node.
   */
  connectTo(targetNodeId: string, targetSocketName: string): NodeLink {
    return this.wrangler.nw.connect(this.nodeId, this.socketName, targetNodeId, targetSocketName);
  }
}

// ============================================================================
// NodeWranglerBuilder class
// ============================================================================

/**
 * Fluent builder API for constructing node graphs.
 *
 * Wraps the existing `NodeWrangler` with a high-level, chainable interface
 * inspired by Blender's Python NodeWrangler. Each method that creates a node
 * returns a `NodeOutput` representing a specific output socket, enabling
 * arithmetic and utility methods to be called directly.
 *
 * @example
 * ```typescript
 * // Create a procedural rock material
 * const nw = new NodeWranglerBuilder();
 *
 * const n1 = nw.noise({ scale: 5, detail: 4 });
 * const n2 = nw.musgrave({ scale: 3, octaves: 8 });
 * const blended = n1.mix(n2, 0.5);
 * const ramped = blended.colorRamp([
 *   { position: 0, color: [0.2, 0.1, 0.05] },
 *   { position: 1, color: [0.6, 0.4, 0.2] },
 * ]);
 * nw.principledBSDF({ baseColor: ramped, roughness: 0.7 });
 *
 * // Evaluate the graph
 * const result = nw.evaluate();
 * ```
 */
export class NodeWranglerBuilder {
  /** The underlying NodeWrangler that handles node creation and connections */
  readonly nw: NodeWrangler;

  /** X position for auto-layout of the next node */
  private nextX: number = 0;
  /** Y position for auto-layout (used for secondary rows) */
  private nextY: number = 0;
  /** Horizontal spacing between nodes in the auto-layout */
  private readonly NODE_SPACING_X: number = 300;
  /** Vertical spacing for sub-rows */
  private readonly NODE_SPACING_Y: number = 200;
  /** Current Y row index (incremented for each "row" of operations) */
  private rowY: number = 0;
  /** GroupInput node ID, lazily created */
  private groupInputNodeId: string | null = null;
  /** Exposed inputs on the group (name → { type, defaultValue }) */
  private exposedInputs: Map<string, { type: SocketType | string; defaultValue: any; nodeId: string; socketName: string }> = new Map();
  /** Material outputs accumulated via addMaterial */
  private materialOutputs: { shader: NodeOutput; selection?: string }[] = [];
  /** Geometry modifiers accumulated via addGeomod */
  private geometryModifiers: NodeOutput[] = [];

  /**
   * Create a new NodeWranglerBuilder.
   *
   * @param nw - Optional existing NodeWrangler to wrap. If omitted, a new one is created.
   *
   * @example
   * ```typescript
   * const builder = new NodeWranglerBuilder();
   * // or wrap an existing wrangler:
   * const builder = new NodeWranglerBuilder(existingWrangler);
   * ```
   */
  constructor(nw?: NodeWrangler) {
    this.nw = nw || new NodeWrangler();
  }

  // ==========================================================================
  // Core: create a node and return a NodeOutput
  // ==========================================================================

  /**
   * Create a new node and return a reference to its first output socket.
   *
   * This is the fundamental building block of the fluent API. It creates a
   * node in the underlying NodeWrangler graph, applies the given parameters,
   * and returns a `NodeOutput` pointing to the first (default) output.
   *
   * @param nodeType - The type of node to create (from NodeTypes enum).
   * @param params - Optional parameters: properties to set on the node, and
   *                 NodeOutput values to connect to the node's inputs.
   * @param defaultOutput - Name of the output socket to reference. If omitted,
   *                        the first output is used.
   * @param outputType - Socket type of the output.
   * @returns NodeOutput referencing the specified output socket.
   *
   * @example
   * ```typescript
   * // Create a NoiseTexture node and get its Fac output
   * const noise = nw.new(NodeTypes.TextureNoise, { scale: 5, detail: 4 });
   *
   * // Connect a NodeOutput to an input
   * const mapped = nw.new(NodeTypes.Mapping, { Vector: coord });
   * ```
   */
  new(
    nodeType: NodeTypes | string,
    params?: Record<string, any>,
    defaultOutput?: string,
    outputType?: SocketType | string,
  ): NodeOutput {
    // Separate NodeOutput connections from static properties
    const properties: Record<string, any> = {};
    const connections: Array<{ inputName: string; output: NodeOutput }> = [];

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value instanceof NodeOutput) {
          connections.push({ inputName: key, output: value });
        } else {
          properties[key] = value;
        }
      }
    }

    // Create the node with auto-positioning
    const location: [number, number] = [this.nextX, this.rowY];
    const node = this.nw.newNode(nodeType as NodeTypes, undefined, location, properties);

    // Apply additional properties
    for (const [key, value] of Object.entries(properties)) {
      node.properties[key] = value;
    }

    // Connect NodeOutput inputs
    for (const { inputName, output } of connections) {
      this.nw.connect(output.nodeId, output.socketName, node.id, inputName);
    }

    // Advance X position for next node
    this.nextX += this.NODE_SPACING_X;

    // Determine the output socket name
    const socketName = defaultOutput || this.getFirstOutputName(node);
    const socketType = outputType || this.getOutputType(node, socketName);

    return new NodeOutput(node.id, socketName, socketType, this);
  }

  // ==========================================================================
  // Convenience methods for common texture nodes
  // ==========================================================================

  /**
   * Create a Noise Texture node.
   *
   * @param params - Noise texture parameters (scale, detail, roughness, distortion, noiseType, vector).
   * @returns NodeOutput pointing to the "Fac" (float) output.
   *
   * @example
   * ```typescript
   * const n = nw.noise({ scale: 5, detail: 4, roughness: 0.6 });
   * const color = n.output('Color', SocketType.COLOR); // Get the Color output instead
   * ```
   */
  noise(params: NoiseTextureParams = {}): NodeOutput {
    const { noiseType, vector, ...rest } = params;
    const nodeParams: Record<string, any> = {};

    // Map convenience params to socket names
    if (noiseType) nodeParams.noise_type = noiseType;

    // Handle NodeOutput vs static values for inputs
    for (const [key, value] of Object.entries(rest)) {
      if (value instanceof NodeOutput) {
        nodeParams[key.charAt(0).toUpperCase() + key.slice(1)] = value;
      } else if (value !== undefined) {
        nodeParams[key.charAt(0).toUpperCase() + key.slice(1)] = value;
      }
    }
    if (vector) nodeParams.Vector = vector;

    return this.new(NodeTypes.TextureNoise, nodeParams, 'Fac', SocketType.FLOAT);
  }

  /**
   * Create a Musgrave Texture node.
   *
   * @param params - Musgrave texture parameters.
   * @returns NodeOutput pointing to the "Fac" (float) output.
   *
   * @example
   * ```typescript
   * const m = nw.musgrave({ scale: 3, octaves: 8, musgraveType: 'RIDGED_MULTIFRACTAL' });
   * ```
   */
  musgrave(params: MusgraveTextureParams = {}): NodeOutput {
    const { musgraveType, vector, ...rest } = params;
    const nodeParams: Record<string, any> = {};
    if (musgraveType) nodeParams.musgrave_type = musgraveType;

    for (const [key, value] of Object.entries(rest)) {
      if (value instanceof NodeOutput) {
        nodeParams[key.charAt(0).toUpperCase() + key.slice(1)] = value;
      } else if (value !== undefined) {
        nodeParams[key.charAt(0).toUpperCase() + key.slice(1)] = value;
      }
    }
    if (vector) nodeParams.Vector = vector;

    return this.new(NodeTypes.TextureMusgrave, nodeParams, 'Fac', SocketType.FLOAT);
  }

  /**
   * Create a Voronoi Texture node.
   *
   * @param params - Voronoi texture parameters.
   * @returns NodeOutput pointing to the "Distance" (float) output.
   *
   * @example
   * ```typescript
   * const v = nw.voronoi({ scale: 5, feature: 'F2' });
   * ```
   */
  voronoi(params: VoronoiTextureParams = {}): NodeOutput {
    const { distance, feature, vector, ...rest } = params;
    const nodeParams: Record<string, any> = {};
    if (distance) nodeParams.distance = distance;
    if (feature) nodeParams.feature = feature;

    for (const [key, value] of Object.entries(rest)) {
      if (value instanceof NodeOutput) {
        nodeParams[key.charAt(0).toUpperCase() + key.slice(1)] = value;
      } else if (value !== undefined) {
        nodeParams[key.charAt(0).toUpperCase() + key.slice(1)] = value;
      }
    }
    if (vector) nodeParams.Vector = vector;

    return this.new(NodeTypes.TextureVoronoi, nodeParams, 'Distance', SocketType.FLOAT);
  }

  /**
   * Create a Wave Texture node.
   *
   * @param params - Wave texture parameters.
   * @returns NodeOutput pointing to the "Fac" (float) output.
   *
   * @example
   * ```typescript
   * const w = nw.wave({ scale: 2, distortion: 1.5, waveType: 'RINGS' });
   * ```
   */
  wave(params: WaveTextureParams = {}): NodeOutput {
    const { waveType, bandsDirection, vector, ...rest } = params;
    const nodeParams: Record<string, any> = {};
    if (waveType) nodeParams.wave_type = waveType;
    if (bandsDirection) nodeParams.bands_direction = bandsDirection;

    for (const [key, value] of Object.entries(rest)) {
      if (value instanceof NodeOutput) {
        nodeParams[key.charAt(0).toUpperCase() + key.slice(1)] = value;
      } else if (value !== undefined) {
        nodeParams[key.charAt(0).toUpperCase() + key.slice(1)] = value;
      }
    }
    if (vector) nodeParams.Vector = vector;

    return this.new(NodeTypes.TextureWave, nodeParams, 'Fac', SocketType.FLOAT);
  }

  /**
   * Create a ColorRamp node with the given stops.
   *
   * @param stops - Array of color stops.
   * @param fac - Input factor (0-1). Can be a NodeOutput or number.
   * @returns NodeOutput pointing to the "Color" output.
   *
   * @example
   * ```typescript
   * const ramp = nw.colorRamp([
   *   { position: 0, color: [0, 0, 0] },
   *   { position: 1, color: [1, 1, 1] },
   * ], noiseOutput);
   * ```
   */
  colorRamp(stops: ColorRampStop[], fac?: NodeOutput | number): NodeOutput {
    const params: Record<string, any> = {
      stops: stops.map(s => ({
        position: s.position,
        color: s.color.length === 3
          ? [s.color[0], s.color[1], s.color[2], 1.0]
          : [...s.color],
      })),
    };
    if (fac !== undefined) {
      params.Fac = fac;
    }
    return this.new(NodeTypes.ColorRamp, params, 'Color', SocketType.COLOR);
  }

  /**
   * Create a Float Curve node with the given control points.
   *
   * @param points - Array of [x, y] control points for the curve.
   * @param fac - Input factor. Can be a NodeOutput or number.
   * @returns NodeOutput pointing to the result output.
   *
   * @example
   * ```typescript
   * const curved = nw.floatCurve(
   *   [[0, 0], [0.3, 0.1], [0.7, 0.9], [1, 1]],
   *   noiseOutput
   * );
   * ```
   */
  floatCurve(points: [number, number][], fac?: NodeOutput | number): NodeOutput {
    const params: Record<string, any> = {
      curve_points: points,
    };
    if (fac !== undefined) {
      params.Fac = fac;
    }
    return this.new('ShaderNodeFloatCurve' as any, params, 'Value', SocketType.FLOAT);
  }

  /**
   * Create a Mapping node for transforming texture coordinates.
   *
   * @param scale - Scale vector. Default: [1, 1, 1]
   * @param rotation - Rotation vector (Euler angles in radians). Default: [0, 0, 0]
   * @param translation - Translation vector. Default: [0, 0, 0]
   * @param vector - Input vector (usually from textureCoord()). Can be a NodeOutput.
   * @returns NodeOutput pointing to the "Vector" output.
   *
   * @example
   * ```typescript
   * const coord = nw.textureCoord('Generated');
   * const mapped = nw.mapping({ scale: [5, 5, 5] }, coord);
   * ```
   */
  mapping(
    scale?: [number, number, number],
    rotation?: [number, number, number],
    translation?: [number, number, number],
    vector?: NodeOutput,
  ): NodeOutput {
    const params: Record<string, any> = {};
    if (scale) params.Scale = scale;
    if (rotation) params.Rotation = rotation;
    if (translation) params.Translation = translation;
    if (vector) params.Vector = vector;
    return this.new(NodeTypes.Mapping, params, 'Vector', SocketType.VECTOR);
  }

  /**
   * Create a Texture Coordinate node.
   *
   * @param coordType - Which coordinate output to return:
   *   'Generated', 'Normal', 'UV', 'Object', 'Camera', 'Window', 'Reflection'.
   *   Default: 'Generated'.
   * @returns NodeOutput pointing to the specified coordinate output.
   *
   * @example
   * ```typescript
   * const uv = nw.textureCoord('UV');
   * const generated = nw.textureCoord('Generated');
   * ```
   */
  textureCoord(coordType: string = 'Generated'): NodeOutput {
    const node = this.nw.newNode(
      NodeTypes.TextureCoord,
      undefined,
      [this.nextX, this.rowY],
      {},
    );
    this.nextX += this.NODE_SPACING_X;
    return new NodeOutput(node.id, coordType, SocketType.VECTOR, this);
  }

  // ==========================================================================
  // Shader output nodes
  // ==========================================================================

  /**
   * Create a Principled BSDF shader node with the given parameters.
   *
   * This is the primary way to define PBR materials. Each parameter accepts
   * either a `NodeOutput` (for procedural connections) or a static value.
   *
   * @param params - PBR parameters (baseColor, metallic, roughness, etc.).
   * @returns NodeOutput pointing to the "BSDF" shader output.
   *
   * @example
   * ```typescript
   * const nw = new NodeWranglerBuilder();
   * const noise = nw.noise({ scale: 5 });
   * const color = noise.colorRamp([
   *   { position: 0, color: [0.2, 0.1, 0.05] },
   *   { position: 1, color: [0.6, 0.4, 0.2] },
   * ]);
   * nw.principledBSDF({
   *   baseColor: color,
   *   roughness: 0.7,
   *   metallic: 0.1,
   * });
   * ```
   */
  principledBSDF(params: PrincipledBSDFParams = {}): NodeOutput {
    const bsdfParams: Record<string, any> = {};

    // Map params to node input names
    const paramMap: Record<string, string> = {
      baseColor: 'Base Color',
      metallic: 'Metallic',
      roughness: 'Roughness',
      specular: 'Specular',
      specularTint: 'Specular Tint',
      ior: 'IOR',
      transmission: 'Transmission',
      transmissionRoughness: 'Transmission Roughness',
      subsurface: 'Subsurface',
      subsurfaceRadius: 'Subsurface Radius',
      subsurfaceColor: 'Subsurface Color',
      anisotropic: 'Anisotropic',
      anisotropicRotation: 'Anisotropic Rotation',
      sheen: 'Sheen',
      sheenTint: 'Sheen Tint',
      clearcoat: 'Clearcoat',
      clearcoatRoughness: 'Clearcoat Roughness',
      emission: 'Emission',
      emissionStrength: 'Emission Strength',
      alpha: 'Alpha',
      normal: 'Normal',
      tangent: 'Tangent',
    };

    for (const [paramKey, inputName] of Object.entries(paramMap)) {
      const value = (params as any)[paramKey];
      if (value !== undefined) {
        bsdfParams[inputName] = value;
      }
    }

    const bsdfOutput = this.new(NodeTypes.PrincipledBSDF, bsdfParams, 'BSDF', SocketType.SHADER);

    // Handle displacement separately (it creates a Displacement node + Material Output)
    if (params.displacement) {
      this.displacement(params.displacement);
    }

    return bsdfOutput;
  }

  /**
   * Create a Displacement node and connect it to a Material Output.
   *
   * @param height - Height input for displacement.
   * @param scale - Displacement scale. Default: 1.
   * @param midlevel - Midlevel for displacement. Default: 0.
   *
   * @example
   * ```typescript
   * const height = nw.noise({ scale: 2 });
   * nw.displacement(height, 0.5, 0);
   * ```
   */
  displacement(height: NodeOutput, scale: number = 1, midlevel: number = 0): void {
    const dispParams: Record<string, any> = {
      Height: height,
    };
    const dispOutput = this.new(NodeTypes.Displacement, dispParams, 'Displacement', SocketType.SHADER);
    // Set scale and midlevel as properties
    const dispNode = this.nw.getNode(dispOutput.nodeId);
    dispNode.properties.scale = scale;
    dispNode.properties.midlevel = midlevel;
  }

  /**
   * Create a Material Output node and connect a shader to it.
   *
   * @param shader - The shader NodeOutput to connect to the Surface input.
   *
   * @example
   * ```typescript
   * const bsdf = nw.principledBSDF({ baseColor: color, roughness: 0.5 });
   * nw.materialOutput(bsdf);
   * ```
   */
  materialOutput(shader: NodeOutput): void {
    const params: Record<string, any> = {
      Surface: shader,
    };
    this.new(NodeTypes.MaterialOutput, params, 'Surface', SocketType.SHADER);
  }

  // ==========================================================================
  // Group I/O
  // ==========================================================================

  /**
   * Get a reference to the group's input node.
   *
   * Creates a GroupInput node if one doesn't already exist. This is the
   * entry point for parameterized sub-graphs (reusable node groups).
   *
   * @returns NodeOutput referencing the GroupInput node's first output.
   *
   * @example
   * ```typescript
   * const nw = new NodeWranglerBuilder();
   * const input = nw.groupInput();
   * // Then use exposeInput() to add specific parameters
   * ```
   */
  groupInput(): NodeOutput {
    if (!this.groupInputNodeId) {
      const node = this.nw.newNode(
        NodeTypes.GroupInput,
        undefined,
        [0, 0],
        {},
      );
      this.groupInputNodeId = node.id;
    }
    // Return a reference; the actual output socket depends on what's exposed
    return new NodeOutput(this.groupInputNodeId, '__group_input__', SocketType.ANY, this);
  }

  /**
   * Connect a NodeOutput to the group's output.
   *
   * Creates a GroupOutput node if needed, and connects the given output to it.
   *
   * @param output - The NodeOutput to connect to the group output.
   *
   * @example
   * ```typescript
   * const nw = new NodeWranglerBuilder();
   * const color = nw.noise({ scale: 5 }).colorRamp([...]);
   * nw.groupOutput(color);
   * ```
   */
  groupOutput(output: NodeOutput): void {
    const params: Record<string, any> = {
      'Output_0': output,
    };
    this.new(NodeTypes.GroupOutput, params);
  }

  /**
   * Expose an input parameter on the group interface.
   *
   * This creates a named parameter that users of the node group can set
   * when they instantiate it. Returns a NodeOutput that can be connected
   * to other nodes within the group.
   *
   * @param name - The name of the exposed input.
   * @param type - The socket type of the input.
   * @param defaultValue - Default value when no connection is made.
   * @returns NodeOutput that can be connected within the group.
   *
   * @example
   * ```typescript
   * const nw = new NodeWranglerBuilder();
   * const scale = nw.exposeInput('Scale', SocketType.FLOAT, 5.0);
   * const noise = nw.noise({ scale }); // Connects the exposed input
   * ```
   */
  exposeInput(name: string, type: SocketType | string, defaultValue: any): NodeOutput {
    // Ensure GroupInput node exists
    this.groupInput();

    // Create a Value/Vector/Color node to hold the default
    let holderNode: NodeInstance;
    const location: [number, number] = [0, this.nextY];
    this.nextY += this.NODE_SPACING_Y;

    switch (type) {
      case SocketType.FLOAT:
      case SocketType.VALUE:
        holderNode = this.nw.newNode(NodeTypes.Value, undefined, location, { default_value: defaultValue ?? 0 });
        break;
      case SocketType.COLOR:
      case SocketType.RGB:
      case SocketType.RGBA:
        holderNode = this.nw.newNode(NodeTypes.RGB, undefined, location, {
          default_value: defaultValue ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 },
        });
        break;
      case SocketType.VECTOR:
        holderNode = this.nw.newNode(NodeTypes.Vector, undefined, location, {
          default_value: defaultValue ?? [0, 0, 0],
        });
        break;
      case SocketType.INTEGER:
      case SocketType.INT:
        holderNode = this.nw.newNode(NodeTypes.Integer, undefined, location, {
          integer: defaultValue ?? 0,
        });
        break;
      case SocketType.BOOLEAN:
        holderNode = this.nw.newNode(NodeTypes.Boolean, undefined, location, {
          boolean: defaultValue ?? false,
        });
        break;
      default:
        holderNode = this.nw.newNode(NodeTypes.Value, undefined, location, { default_value: defaultValue ?? 0 });
    }

    // Register the exposed input
    const firstOutput = this.getFirstOutputName(holderNode);
    this.exposedInputs.set(name, {
      type,
      defaultValue,
      nodeId: holderNode.id,
      socketName: firstOutput,
    });

    // Also expose on the NodeWrangler's group if applicable
    try {
      const group = this.nw.getActiveGroup();
      const exposedSocket = {
        id: `group_input_${name}`,
        name,
        type,
        value: defaultValue,
        defaultValue,
        isInput: true,
      };
      group.inputs.set(name, exposedSocket as any);
    } catch {
      // Group may not support this operation yet
    }

    const socketType = this.getOutputType(holderNode, firstOutput);
    return new NodeOutput(holderNode.id, firstOutput, socketType, this);
  }

  // ==========================================================================
  // Material/Geometry modifier integration
  // ==========================================================================

  /**
   * Add a material defined by a shader function.
   *
   * Creates a sub-graph using the provided function, which receives a fresh
   * NodeWranglerBuilder and returns the final shader output. The resulting
   * material can optionally be applied to a selection of the geometry.
   *
   * @param shaderFunc - Function that builds a shader graph and returns its output.
   * @param selection - Optional selection attribute name for partial material application.
   * @returns A THREE.MeshStandardMaterial (constructed after evaluation).
   *
   * @example
   * ```typescript
   * const mat = nw.addMaterial(
   *   (nw) => {
   *     const n = nw.noise({ scale: 5 });
   *     const color = n.colorRamp([
   *       { position: 0, color: [0.2, 0.1, 0.05] },
   *       { position: 1, color: [0.6, 0.4, 0.2] },
   *     ]);
   *     return nw.principledBSDF({ baseColor: color, roughness: 0.7 });
   *   },
   *   'face_selection' // Optional: only apply to faces where this attribute is true
   * );
   * ```
   */
  addMaterial(
    shaderFunc: (nw: NodeWranglerBuilder) => NodeOutput,
    selection?: string,
  ): THREE.MeshStandardMaterial {
    // Create a sub-builder for the shader graph
    const shaderNw = new NodeWranglerBuilder();

    // Build the shader graph
    const shaderOutput = shaderFunc(shaderNw);

    // Connect to material output
    shaderNw.materialOutput(shaderOutput);

    // Evaluate the shader graph to produce material parameters
    const results = shaderNw.evaluate();

    // Find the BSDF output to extract material properties
    let baseColor: [number, number, number] = [0.8, 0.8, 0.8];
    let roughness = 0.5;
    let metallic = 0.0;

    // Search for Principled BSDF node results
    for (const [nodeId, outputs] of results.entries()) {
      const group = shaderNw.nw.getActiveGroup();
      const node = group.nodes.get(nodeId);
      if (node && String(node.type) === NodeTypes.PrincipledBSDF) {
        // Extract values from the BSDF properties/inputs
        const bc = outputs['Base Color'] ?? node.properties['Base Color'];
        if (bc) {
          if (Array.isArray(bc)) {
            baseColor = [bc[0], bc[1], bc[2]];
          } else if (typeof bc === 'object' && 'r' in bc) {
            baseColor = [bc.r, bc.g, bc.b];
          }
        }
        roughness = outputs['Roughness'] ?? node.properties['Roughness'] ?? 0.5;
        metallic = outputs['Metallic'] ?? node.properties['Metallic'] ?? 0.0;
      }
    }

    // Create the Three.js material
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseColor[0], baseColor[1], baseColor[2]),
      roughness: typeof roughness === 'number' ? roughness : 0.5,
      metalness: typeof metallic === 'number' ? metallic : 0.0,
    });

    // Store for potential later use with SetMaterial nodes
    this.materialOutputs.push({ shader: shaderOutput, selection });

    return material;
  }

  /**
   * Add a geometry modifier defined by a function.
   *
   * Creates a sub-graph using the provided function, which receives a fresh
   * NodeWranglerBuilder and returns the final geometry output. This is the
   * TypeScript equivalent of the Python `add_geomod` function.
   *
   * @param geometryFunc - Function that builds a geometry node graph and returns its output.
   *
   * @example
   * ```typescript
   * nw.addGeomod((nw) => {
   *   const pos = nw.getPosition();
   *   const offset = nw.noise({ scale: 2 }).multiply(0.1);
   *   const newPos = pos.add(offset);
   *   return nw.writeAttribute('position', newPos);
   * });
   * ```
   */
  addGeomod(geometryFunc: (nw: NodeWranglerBuilder) => NodeOutput): void {
    const geomodNw = new NodeWranglerBuilder();

    // Build the geometry modifier graph
    const geomOutput = geometryFunc(geomodNw);

    // Store for accumulation
    this.geometryModifiers.push(geomOutput);
  }

  // ==========================================================================
  // Attribute I/O
  // ==========================================================================

  /**
   * Write a value to a named attribute on the geometry.
   *
   * Creates a StoreNamedAttribute node that writes the given value to
   * per-vertex data on the BufferGeometry.
   *
   * @param name - The attribute name to write.
   * @param value - The NodeOutput containing the value to write.
   * @param domain - The attribute domain. Default: 'POINT'.
   * @returns NodeOutput pointing to the Geometry output (for chaining).
   *
   * @example
   * ```typescript
   * const noise = nw.noise({ scale: 5 });
   * const geom = nw.writeAttribute('custom_color', noise.colorRamp([...]), 'POINT');
   * ```
   */
  writeAttribute(name: string, value: NodeOutput, domain: AttributeDomainType = 'POINT'): NodeOutput {
    const params: Record<string, any> = {
      Value: value,
    };
    const properties: Record<string, any> = {
      attribute_name: name,
      domain,
    };

    // Determine data_type from the value's socket type
    let dataType = 'FLOAT';
    if (value.type === SocketType.VECTOR) dataType = 'FLOAT_VECTOR';
    else if (value.type === SocketType.COLOR || value.type === SocketType.RGBA || value.type === SocketType.RGB) dataType = 'FLOAT_COLOR';
    else if (value.type === SocketType.INTEGER || value.type === SocketType.INT) dataType = 'INT';
    else if (value.type === SocketType.BOOLEAN) dataType = 'BOOLEAN';
    properties.data_type = dataType;

    return this.new(NodeTypes.StoreNamedAttribute, { ...params, ...properties }, 'Geometry', SocketType.GEOMETRY);
  }

  /**
   * Read a named attribute from the geometry.
   *
   * Creates a NamedAttribute node that reads per-vertex data.
   *
   * @param name - The attribute name to read.
   * @param domain - The attribute domain. Default: 'POINT'.
   * @param dataType - The data type of the attribute. Default: 'FLOAT'.
   * @returns NodeOutput pointing to the Attribute output.
   *
   * @example
   * ```typescript
   * const customVal = nw.readAttribute('custom_color', 'POINT', 'FLOAT_COLOR');
   * ```
   */
  readAttribute(name: string, domain: AttributeDomainType = 'POINT', dataType: string = 'FLOAT'): NodeOutput {
    const properties: Record<string, any> = {
      attribute_name: name,
      domain,
      data_type: dataType,
    };

    const socketType = dataType === 'FLOAT_VECTOR' ? SocketType.VECTOR
      : dataType === 'FLOAT_COLOR' ? SocketType.COLOR
      : dataType === 'INT' ? SocketType.INTEGER
      : dataType === 'BOOLEAN' ? SocketType.BOOLEAN
      : SocketType.FLOAT;

    return this.new(NodeTypes.NamedAttribute, properties, 'Attribute', socketType);
  }

  // ==========================================================================
  // Utility / input nodes
  // ==========================================================================

  /**
   * Get the object's random value (equivalent to ObjectInfo.Random).
   *
   * @returns NodeOutput pointing to a random float per object instance.
   *
   * @example
   * ```typescript
   * const rand = nw.getObjectRandom();
   * const varied = baseColor.mix(altColor, rand);
   * ```
   */
  getObjectRandom(): NodeOutput {
    const node = this.nw.newNode(
      NodeTypes.ObjectInfo,
      undefined,
      [this.nextX, this.rowY],
      {},
    );
    this.nextX += this.NODE_SPACING_X;
    // ObjectInfo doesn't have a "Random" output in the current registry,
    // but we create a RandomValue node as an equivalent
    const randNode = this.nw.newNode(
      NodeTypes.RandomValue,
      undefined,
      [this.nextX, this.rowY],
      { data_type: 'FLOAT' },
    );
    this.nextX += this.NODE_SPACING_X;
    return new NodeOutput(randNode.id, 'Value', SocketType.FLOAT, this);
  }

  /**
   * Get the position output (world-space vertex positions).
   *
   * @returns NodeOutput pointing to the Position vector output.
   *
   * @example
   * ```typescript
   * const pos = nw.getPosition();
   * const displaced = pos.add(nw.noise({ scale: 2 }).multiply(0.5));
   * ```
   */
  getPosition(): NodeOutput {
    return this.new(NodeTypes.InputPosition, {}, 'Position', SocketType.VECTOR);
  }

  /**
   * Get the normal output (vertex normals).
   *
   * @returns NodeOutput pointing to the Normal vector output.
   *
   * @example
   * ```typescript
   * const normal = nw.getNormal();
   * const dot = normal.dot(nw.textureCoord('Generated'));
   * ```
   */
  getNormal(): NodeOutput {
    return this.new(NodeTypes.InputNormal, {}, 'Normal', SocketType.VECTOR);
  }

  /**
   * Create a Value node with a static float value.
   *
   * @param value - The float value.
   * @returns NodeOutput pointing to the Value output.
   *
   * @example
   * ```typescript
   * const five = nw.value(5.0);
   * const result = noise.multiply(five);
   * ```
   */
  value(value: number): NodeOutput {
    return this.new(NodeTypes.Value, { default_value: value }, 'Value', SocketType.FLOAT);
  }

  /**
   * Create a Vector node with static XYZ values.
   *
   * @param x - X component. Default: 0.
   * @param y - Y component. Default: 0.
   * @param z - Z component. Default: 0.
   * @returns NodeOutput pointing to the Vector output.
   *
   * @example
   * ```typescript
   * const up = nw.vector(0, 1, 0);
   * ```
   */
  vector(x: number = 0, y: number = 0, z: number = 0): NodeOutput {
    return this.new(NodeTypes.Vector, { default_value: [x, y, z] }, 'Vector', SocketType.VECTOR);
  }

  /**
   * Create a Color node with static RGBA values.
   *
   * @param r - Red (0-1). Default: 0.5.
   * @param g - Green (0-1). Default: 0.5.
   * @param b - Blue (0-1). Default: 0.5.
   * @param a - Alpha (0-1). Default: 1.0.
   * @returns NodeOutput pointing to the Color output.
   *
   * @example
   * ```typescript
   * const red = nw.color(1, 0, 0);
   * const semiTransparentBlue = nw.color(0, 0, 1, 0.5);
   * ```
   */
  color(r: number = 0.5, g: number = 0.5, b: number = 0.5, a: number = 1.0): NodeOutput {
    return this.new(NodeTypes.RGB, { default_value: { r, g, b, a } }, 'Color', SocketType.COLOR);
  }

  /**
   * Create a separate XYZ node to decompose a vector.
   *
   * @param vector - The vector NodeOutput to separate.
   * @returns Object with x, y, z NodeOutputs.
   *
   * @example
   * ```typescript
   * const pos = nw.getPosition();
   * const { x, y, z } = nw.separateXYZ(pos);
   * ```
   */
  separateXYZ(vector: NodeOutput): { x: NodeOutput; y: NodeOutput; z: NodeOutput } {
    const params: Record<string, any> = { Vector: vector };
    const base = this.new(NodeTypes.SeparateXYZ, params, 'X', SocketType.FLOAT);
    return {
      x: base,
      y: base.output('Y', SocketType.FLOAT),
      z: base.output('Z', SocketType.FLOAT),
    };
  }

  /**
   * Create a combine XYZ node to compose a vector from three floats.
   *
   * @param x - X component (NodeOutput or number).
   * @param y - Y component (NodeOutput or number).
   * @param z - Z component (NodeOutput or number).
   * @returns NodeOutput pointing to the Vector output.
   *
   * @example
   * ```typescript
   * const v = nw.combineXYZ(1, 0, noise);
   * ```
   */
  combineXYZ(x?: NodeOutput | number, y?: NodeOutput | number, z?: NodeOutput | number): NodeOutput {
    const params: Record<string, any> = {};
    if (x !== undefined) params.X = x;
    if (y !== undefined) params.Y = y;
    if (z !== undefined) params.Z = z;
    return this.new(NodeTypes.CombineXYZ, params, 'Vector', SocketType.VECTOR);
  }

  /**
   * Create a Bump node for normal mapping.
   *
   * @param strength - Bump strength. Default: 1.
   * @param height - Height input (NodeOutput).
   * @param normal - Optional normal input (NodeOutput).
   * @returns NodeOutput pointing to the Normal output.
   *
   * @example
   * ```typescript
   * const bumpNormal = nw.bump(0.5, noiseOutput);
   * nw.principledBSDF({ baseColor: color, normal: bumpNormal });
   * ```
   */
  bump(strength: number = 1, height?: NodeOutput, normal?: NodeOutput): NodeOutput {
    const params: Record<string, any> = { Strength: strength };
    if (height) params.Height = height;
    if (normal) params.Normal = normal;
    return this.new(NodeTypes.Bump, params, 'Normal', SocketType.VECTOR);
  }

  /**
   * Create a Normal Map node.
   *
   * @param strength - Normal map strength. Default: 1.
   * @param color - Normal map color input (NodeOutput).
   * @returns NodeOutput pointing to the Normal output.
   */
  normalMap(strength: number = 1, color?: NodeOutput): NodeOutput {
    const params: Record<string, any> = { Strength: strength };
    if (color) params.Color = color;
    return this.new(NodeTypes.NormalMap, params, 'Normal', SocketType.VECTOR);
  }

  // ==========================================================================
  // Internal helper: create math nodes
  // ==========================================================================

  /**
   * Create a Math node with the given operation.
   *
   * @internal This is called by NodeOutput arithmetic methods.
   *
   * @param operation - The math operation (ADD, SUBTRACT, MULTIPLY, etc.).
   * @param input0 - First input value.
   * @param input1 - Second input value (for binary operations).
   * @returns NodeOutput pointing to the Value output.
   */
  createMathNode(
    operation: string,
    input0: NodeOutput | number,
    input1?: NodeOutput | number,
  ): NodeOutput {
    const params: Record<string, any> = {
      operation,
    };

    if (input0 instanceof NodeOutput) {
      params.Value = input0;
    } else {
      params.Value = input0;
    }

    if (input1 !== undefined) {
      if (input1 instanceof NodeOutput) {
        params.Value_001 = input1;
      } else {
        params.Value_001 = input1;
      }
    }

    // Set static values as properties on the node
    const properties: Record<string, any> = { operation };
    if (typeof input0 === 'number') properties['Input_0'] = input0;
    if (input1 !== undefined && typeof input1 === 'number') properties['Input_1'] = input1;

    // Create a Math node via a generic node type
    const nodeParams: Record<string, any> = { ...params, ...properties };

    // Use a generic approach - create a node with Math type
    const location: [number, number] = [this.nextX, this.rowY];
    const node = this.nw.newNode(
      'ShaderNodeMath' as any, // Scalar math node type from Blender
      undefined,
      location,
      { operation, ...properties },
    );

    // Connect inputs
    if (input0 instanceof NodeOutput) {
      // Try to connect to the first input
      const inputSocketName = this.getFirstInputName(node);
      if (inputSocketName) {
        this.nw.connect(input0.nodeId, input0.socketName, node.id, inputSocketName);
      }
    }
    if (input1 !== undefined && input1 instanceof NodeOutput) {
      // Try to connect to the second input
      const inputNames = Array.from(node.inputs.keys());
      if (inputNames.length > 1) {
        this.nw.connect(input1.nodeId, input1.socketName, node.id, inputNames[1]);
      }
    }

    // Set static input values
    if (typeof input0 === 'number') {
      const inputSocketName = this.getFirstInputName(node);
      const socket = node.inputs.get(inputSocketName);
      if (socket) socket.value = input0;
    }
    if (input1 !== undefined && typeof input1 === 'number') {
      const inputNames = Array.from(node.inputs.keys());
      if (inputNames.length > 1) {
        const socket = node.inputs.get(inputNames[1]);
        if (socket) socket.value = input1;
      }
    }

    this.nextX += this.NODE_SPACING_X;

    const outputName = this.getFirstOutputName(node);
    return new NodeOutput(node.id, outputName, SocketType.FLOAT, this);
  }

  /**
   * Create a Vector Math node with the given operation.
   *
   * @internal Called by NodeOutput.add() when adding vector values.
   *
   * @param operation - The vector math operation (ADD, SUBTRACT, MULTIPLY, etc.).
   * @param input0 - First input value.
   * @param input1 - Second input value (for binary operations).
   * @returns NodeOutput pointing to the Vector output.
   */
  createVectorMathNode(
    operation: string,
    input0: NodeOutput | number | [number, number, number] | [number, number, number, number],
    input1?: NodeOutput | number | [number, number, number] | [number, number, number, number],
  ): NodeOutput {
    const location: [number, number] = [this.nextX, this.rowY];

    const node = this.nw.newNode(
      NodeTypes.VectorMath,
      undefined,
      location,
      { operation },
    );

    // Connect inputs
    const inputNames = Array.from(node.inputs.keys());

    if (input0 instanceof NodeOutput && inputNames.length > 0) {
      this.nw.connect(input0.nodeId, input0.socketName, node.id, inputNames[0]);
    } else if (Array.isArray(input0) && inputNames.length > 0) {
      const socket = node.inputs.get(inputNames[0]);
      if (socket) socket.value = [input0[0], input0[1], input0[2]];
    } else if (typeof input0 === 'number' && inputNames.length > 0) {
      const socket = node.inputs.get(inputNames[0]);
      if (socket) socket.value = { x: input0, y: input0, z: input0 };
    }

    if (input1 !== undefined) {
      if (input1 instanceof NodeOutput && inputNames.length > 1) {
        this.nw.connect(input1.nodeId, input1.socketName, node.id, inputNames[1]);
      } else if (Array.isArray(input1) && inputNames.length > 1) {
        const socket = node.inputs.get(inputNames[1]);
        if (socket) socket.value = [input1[0], input1[1], input1[2]];
      } else if (typeof input1 === 'number' && inputNames.length > 1) {
        const socket = node.inputs.get(inputNames[1]);
        if (socket) socket.value = { x: input1, y: input1, z: input1 };
      }
    }

    this.nextX += this.NODE_SPACING_X;

    const outputName = this.getFirstOutputName(node);
    return new NodeOutput(node.id, outputName, SocketType.VECTOR, this);
  }

  /**
   * Create a Mix node for blending two values.
   *
   * @internal
   */
  createMixNode(a: NodeOutput, b: NodeOutput, factor: NodeOutput | number): NodeOutput {
    const location: [number, number] = [this.nextX, this.rowY];

    const node = this.nw.newNode(
      NodeTypes.Mix as any,
      undefined,
      location,
      { data_type: 'FLOAT', blend_type: 'MIX' },
    );

    // Connect inputs: Factor, A, B
    const inputNames = Array.from(node.inputs.keys());

    if (inputNames.length >= 3) {
      // Connect Factor
      if (factor instanceof NodeOutput) {
        this.nw.connect(factor.nodeId, factor.socketName, node.id, inputNames[0]);
      } else {
        const socket = node.inputs.get(inputNames[0]);
        if (socket) socket.value = factor;
      }

      // Connect A
      this.nw.connect(a.nodeId, a.socketName, node.id, inputNames[1]);

      // Connect B
      this.nw.connect(b.nodeId, b.socketName, node.id, inputNames[2]);
    }

    this.nextX += this.NODE_SPACING_X;

    const outputName = this.getFirstOutputName(node);
    // Determine output type based on inputs
    const outputType = (a.type === SocketType.COLOR || b.type === SocketType.COLOR)
      ? SocketType.COLOR
      : a.type;
    return new NodeOutput(node.id, outputName, outputType, this);
  }

  /**
   * Create a ColorRamp node.
   *
   * @internal
   */
  createColorRampNode(fac: NodeOutput, stops: ColorRampStop[]): NodeOutput {
    const location: [number, number] = [this.nextX, this.rowY];

    const node = this.nw.newNode(
      NodeTypes.ColorRamp,
      undefined,
      location,
      {
        stops: stops.map(s => ({
          position: s.position,
          color: s.color.length === 3
            ? [s.color[0], s.color[1], s.color[2], 1.0]
            : [...s.color],
        })),
      },
    );

    // Connect the Fac input
    this.nw.connect(fac.nodeId, fac.socketName, node.id, 'Fac');

    this.nextX += this.NODE_SPACING_X;

    return new NodeOutput(node.id, 'Color', SocketType.COLOR, this);
  }

  /**
   * Create a MapRange node.
   *
   * @internal
   */
  createMapRange(
    value: NodeOutput,
    fromMin: number,
    fromMax: number,
    toMin: number,
    toMax: number,
    clamp: boolean = false,
  ): NodeOutput {
    const location: [number, number] = [this.nextX, this.rowY];

    const node = this.nw.newNode(
      'ShaderNodeMapRange' as any,
      undefined,
      location,
      { clamp },
    );

    // Connect the Value input
    const inputNames = Array.from(node.inputs.keys());
    if (inputNames.length > 0) {
      this.nw.connect(value.nodeId, value.socketName, node.id, inputNames[0]);
    }

    // Set range values
    if (inputNames.length > 1) {
      const socket = node.inputs.get(inputNames[1]);
      if (socket) socket.value = fromMin;
    }
    if (inputNames.length > 2) {
      const socket = node.inputs.get(inputNames[2]);
      if (socket) socket.value = fromMax;
    }
    if (inputNames.length > 3) {
      const socket = node.inputs.get(inputNames[3]);
      if (socket) socket.value = toMin;
    }
    if (inputNames.length > 4) {
      const socket = node.inputs.get(inputNames[4]);
      if (socket) socket.value = toMax;
    }

    this.nextX += this.NODE_SPACING_X;

    const outputName = this.getFirstOutputName(node);
    return new NodeOutput(node.id, outputName, SocketType.FLOAT, this);
  }

  /**
   * Create a FloatCurve node.
   *
   * @internal
   */
  createFloatCurveNode(value: NodeOutput, points: [number, number][]): NodeOutput {
    const location: [number, number] = [this.nextX, this.rowY];

    const node = this.nw.newNode(
      'ShaderNodeFloatCurve' as any,
      undefined,
      location,
      { curve_points: points },
    );

    // Connect the Fac input
    const inputNames = Array.from(node.inputs.keys());
    if (inputNames.length > 0) {
      this.nw.connect(value.nodeId, value.socketName, node.id, inputNames[0]);
    }

    this.nextX += this.NODE_SPACING_X;

    const outputName = this.getFirstOutputName(node);
    return new NodeOutput(node.id, outputName, SocketType.FLOAT, this);
  }

  // ==========================================================================
  // Build / Evaluate
  // ==========================================================================

  /**
   * Build and return the underlying NodeWrangler.
   *
   * After constructing the node graph with the fluent API, call this to
   * get the NodeWrangler for use with the existing evaluation pipeline.
   *
   * @returns The NodeWrangler with the complete node graph.
   *
   * @example
   * ```typescript
   * const nw = new NodeWranglerBuilder();
   * nw.noise({ scale: 5 });
   * const wrangler = nw.build();
   * // Now use wrangler.evaluate(), wrangler.getOutput(), etc.
   * ```
   */
  build(): NodeWrangler {
    return this.nw;
  }

  /**
   * Evaluate the node graph and return all node outputs.
   *
   * Delegates to the underlying NodeWrangler's evaluate method.
   *
   * @returns Map of nodeId → output socket values.
   *
   * @example
   * ```typescript
   * const nw = new NodeWranglerBuilder();
   * const noise = nw.noise({ scale: 5 });
   * const results = nw.evaluate();
   * console.log(results.get(noise.nodeId));
   * ```
   */
  evaluate(): Map<string, Record<string, any>> {
    return this.nw.evaluate();
  }

  /**
   * Get the final output of the node graph.
   *
   * Finds the output node (GroupOutput or MaterialOutput) and returns
   * its input values. Delegates to the underlying NodeWrangler.
   *
   * @returns Record of output socket name → value.
   *
   * @example
   * ```typescript
   * const nw = new NodeWranglerBuilder();
   * const bsdf = nw.principledBSDF({ baseColor: color, roughness: 0.7 });
   * nw.materialOutput(bsdf);
   * const output = nw.getOutput();
   * ```
   */
  getOutput(): Record<string, any> {
    return this.nw.getOutput();
  }

  // ==========================================================================
  // Layout helpers
  // ==========================================================================

  /**
   * Set the Y row for the next group of nodes.
   * Useful for organizing nodes into visual rows in the graph editor.
   *
   * @param row - Row index (0-based).
   *
   * @example
   * ```typescript
   * nw.setRow(0);  // Top row for textures
   * const n1 = nw.noise({ scale: 5 });
   * nw.setRow(1);  // Second row for math
   * const result = n1.multiply(2);
   * ```
   */
  setRow(row: number): void {
    this.rowY = row * this.NODE_SPACING_Y;
  }

  /**
   * Reset the layout position counter.
   * Useful when building multiple disconnected sub-graphs.
   */
  resetLayout(): void {
    this.nextX = 0;
    this.rowY = 0;
    this.nextY = 0;
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Get the name of the first output socket on a node.
   */
  private getFirstOutputName(node: NodeInstance): string {
    const outputNames = Array.from(node.outputs.keys());
    return outputNames.length > 0 ? outputNames[0] : 'Value';
  }

  /**
   * Get the name of the first input socket on a node.
   */
  private getFirstInputName(node: NodeInstance): string {
    const inputNames = Array.from(node.inputs.keys());
    return inputNames.length > 0 ? inputNames[0] : 'Value';
  }

  /**
   * Get the socket type of a specific output on a node.
   */
  private getOutputType(node: NodeInstance, socketName: string): SocketType | string {
    const socket = node.outputs.get(socketName);
    return socket ? socket.type : SocketType.ANY;
  }
}

// ============================================================================
// Factory functions
// ============================================================================

/**
 * Create a new NodeWranglerBuilder for a material shader graph.
 *
 * @param name - Optional name for the material node tree.
 * @returns A fresh NodeWranglerBuilder configured for shader authoring.
 *
 * @example
 * ```typescript
 * const nw = createMaterialBuilder('RockMaterial');
 * const n = nw.noise({ scale: 5 });
 * const color = n.colorRamp([
 *   { position: 0, color: [0.2, 0.1, 0.05] },
 *   { position: 1, color: [0.6, 0.4, 0.2] },
 * ]);
 * const bsdf = nw.principledBSDF({ baseColor: color, roughness: 0.7 });
 * nw.materialOutput(bsdf);
 * ```
 */
export function createMaterialBuilder(name?: string): NodeWranglerBuilder {
  const nw = new NodeWranglerBuilder();
  if (name) {
    const group = nw.nw.getActiveGroup();
    group.name = name;
  }
  return nw;
}

/**
 * Create a new NodeWranglerBuilder for a geometry node graph.
 *
 * @param name - Optional name for the geometry node tree.
 * @returns A fresh NodeWranglerBuilder configured for geometry authoring.
 *
 * @example
 * ```typescript
 * const nw = createGeometryBuilder('DisplaceModifier');
 * const pos = nw.getPosition();
 * const offset = nw.noise({ scale: 2 }).multiply(0.1);
 * // Apply displacement...
 * ```
 */
export function createGeometryBuilder(name?: string): NodeWranglerBuilder {
  const nw = new NodeWranglerBuilder();
  if (name) {
    const group = nw.nw.getActiveGroup();
    group.name = name;
  }
  return nw;
}

/**
 * Build a shader function using the fluent API and return the resulting
 * NodeWrangler. This is the most concise entry point for defining materials.
 *
 * @param buildFunc - Function that receives a NodeWranglerBuilder and builds
 *                    a shader graph. Should end with a principledBSDF() call.
 * @returns The built NodeWrangler with the complete graph.
 *
 * @example
 * ```typescript
 * const wrangler = buildShader((nw) => {
 *   const n = nw.noise({ scale: 5, detail: 4 });
 *   const color = n.colorRamp([
 *     { position: 0, color: [0.2, 0.1, 0.05] },
 *     { position: 1, color: [0.6, 0.4, 0.2] },
 *   ]);
 *   const bsdf = nw.principledBSDF({ baseColor: color, roughness: 0.7 });
 *   nw.materialOutput(bsdf);
 * });
 * const result = wrangler.getOutput();
 * ```
 */
export function buildShader(
  buildFunc: (nw: NodeWranglerBuilder) => void,
): NodeWrangler {
  const builder = new NodeWranglerBuilder();
  buildFunc(builder);
  return builder.build();
}

export default NodeWranglerBuilder;
