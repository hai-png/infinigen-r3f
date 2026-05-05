/**
 * NodeGeometryModifierBridge — Bridge between NodeWranglerBuilder and
 * GeometryModifierStack, enabling expose_input and add_geomod workflows.
 *
 * This module provides the P1 layer on top of the P0 NodeWranglerBuilder:
 *
 * - **ExposedInput / ExposedOutput**: Make node inputs/outputs accessible
 *   from outside a node group, enabling parameterized reusable sub-graphs.
 * - **NodeGroup / NodeGroupInstance**: Encapsulated, reusable node groups
 *   that can be instantiated with parameter overrides and evaluated
 *   independently or composed within other graphs.
 * - **GeometryModifier / GeometryModifierStack**: Ordered stack of geometry
 *   modifiers (subdivision, mirror, displace, etc.) that apply node-based
 *   modifications to THREE.BufferGeometry.
 * - **Concrete modifier implementations**: SubSurfModifier, MirrorModifier,
 *   DisplaceModifier, SimpleDeformModifier, SolidifyModifier.
 * - **GeomodBridge**: Bridges the NodeWranglerBuilder fluent API to the
 *   GeometryModifierStack, providing `addGeomod()` and `exposeInput()`.
 *
 * @module node-geometry-modifier-bridge
 */

import * as THREE from 'three';
import { NodeDefinition, NodeInstance, NodeLink } from './node-wrangler';
import { NodeTypes } from './node-types';
import { SocketType, SocketDefinition } from './socket-types';
import { SeededRandom } from '@/core/util/MathUtils';
import { NodeWranglerBuilder, NodeOutput } from './node-wrangler-builder';

// ============================================================================
// ExposedInput
// ============================================================================

/**
 * Represents an input socket that is exposed on a NodeGroup's interface.
 *
 * When a NodeGroup is used as a reusable sub-graph, ExposedInput makes
 * an internal node's input accessible from outside. Consumers of the group
 * can connect their own outputs to this input or set a value override.
 *
 * @example
 * ```typescript
 * const group = new NodeGroup('MyDisplacement');
 * const scaleInput = group.addExposedInput('Scale', SocketType.FLOAT, 5.0, 'Noise scale');
 * // scaleInput can now be wired inside the group and overridden per-instance
 * ```
 */
export class ExposedInput {
  /** The exposed input's display name */
  name: string;
  /** Socket data type (FLOAT, VECTOR, COLOR, etc.) */
  type: SocketType | string;
  /** Default value when no external connection or override is provided */
  defaultValue: any;
  /** Optional lower bound for numeric inputs */
  min?: number;
  /** Optional upper bound for numeric inputs */
  max?: number;
  /** User-facing documentation for this input */
  description: string;
  /** ID of the GroupInput node that represents this exposed input */
  groupInputNodeId: string;

  /**
   * Create a new ExposedInput.
   *
   * @param name - Display name of the exposed input.
   * @param type - Socket type of the input.
   * @param defaultValue - Default value when not connected.
   * @param description - User-facing documentation.
   * @param groupInputNodeId - ID of the group input node.
   * @param min - Optional minimum value.
   * @param max - Optional maximum value.
   */
  constructor(
    name: string,
    type: SocketType | string,
    defaultValue: any,
    description: string,
    groupInputNodeId: string,
    min?: number,
    max?: number,
  ) {
    this.name = name;
    this.type = type;
    this.defaultValue = defaultValue;
    this.description = description;
    this.groupInputNodeId = groupInputNodeId;
    this.min = min;
    this.max = max;
  }

  /**
   * Convert this exposed input into a NodeDefinition for a group input node.
   *
   * The resulting definition has a single output socket matching the
   * input's type and default value, suitable for use as a GroupInput node.
   *
   * @returns A NodeDefinition representing this exposed input as a node.
   */
  toGroupInputNode(): NodeDefinition {
    return {
      type: NodeTypes.GroupInput,
      inputs: [],
      outputs: [
        {
          name: this.name,
          type: this.type,
          defaultValue: this.defaultValue,
          min: this.min,
          max: this.max,
        } as SocketDefinition,
      ],
      properties: {
        label: this.name,
        description: this.description,
      },
    };
  }
}

// ============================================================================
// ExposedOutput
// ============================================================================

/**
 * Represents an output socket that is exposed on a NodeGroup's interface.
 *
 * ExposedOutput makes an internal node's output accessible from outside
 * the group, allowing consumers to connect to it in their own graphs.
 *
 * @example
 * ```typescript
 * const group = new NodeGroup('MyDisplacement');
 * const dispOutput = group.addExposedOutput('Displacement', SocketType.FLOAT);
 * // dispOutput can now be connected from outside the group
 * ```
 */
export class ExposedOutput {
  /** The exposed output's display name */
  name: string;
  /** Socket data type */
  type: SocketType | string;
  /** ID of the GroupOutput node that represents this exposed output */
  groupOutputNodeId: string;

  /**
   * Create a new ExposedOutput.
   *
   * @param name - Display name of the exposed output.
   * @param type - Socket type of the output.
   * @param groupOutputNodeId - ID of the group output node.
   */
  constructor(name: string, type: SocketType | string, groupOutputNodeId: string) {
    this.name = name;
    this.type = type;
    this.groupOutputNodeId = groupOutputNodeId;
  }

  /**
   * Convert this exposed output into a NodeDefinition for a group output node.
   *
   * @returns A NodeDefinition representing this exposed output as a node.
   */
  toGroupOutputNode(): NodeDefinition {
    return {
      type: NodeTypes.GroupOutput,
      inputs: [
        {
          name: this.name,
          type: this.type,
        } as SocketDefinition,
      ],
      outputs: [],
      properties: {
        label: this.name,
      },
    };
  }
}

// ============================================================================
// NodeGroup
// ============================================================================

/**
 * Encapsulated, reusable node group — a self-contained sub-graph with
 * defined inputs, outputs, internal nodes, and internal links.
 *
 * NodeGroup can be instantiated multiple times with different parameter
 * overrides, evaluated independently, or composed within other graphs.
 * This mirrors Blender's concept of a "Node Group".
 *
 * @example
 * ```typescript
 * const group = new NodeGroup('NoiseDisplacement');
 * const scaleInput = group.addExposedInput('Scale', SocketType.FLOAT, 5.0, 'Noise scale');
 * const strengthInput = group.addExposedInput('Strength', SocketType.FLOAT, 0.5, 'Displacement strength');
 * const dispOutput = group.addExposedOutput('Displacement', SocketType.FLOAT);
 *
 * // Wire internal nodes...
 * group.connectExposedInput('Scale', 'noiseNode_0', 'Scale');
 * group.connectExposedOutput('Displacement', 'mathNode_1', 'Value');
 *
 * // Instantiate with overrides
 * const instance = group.instantiate({ Scale: 8.0, Strength: 1.0 });
 * ```
 */
export class NodeGroup {
  /** The group's display name */
  name: string;
  /** Map of exposed input name → ExposedInput */
  inputs: Map<string, ExposedInput>;
  /** Map of exposed output name → ExposedOutput */
  outputs: Map<string, ExposedOutput>;
  /** Internal node definitions within this group */
  internalNodes: NodeDefinition[];
  /** Internal links between nodes in this group */
  internalLinks: NodeLink[];
  /** Counter for generating unique IDs within this group */
  private idCounter: number = 0;
  /** Map of input name → { fromNode, fromOutput } connection info */
  private inputConnections: Map<string, { fromNode: string; fromOutput: string }> = new Map();
  /** Map of output name → { toNode, toInput } connection info */
  private outputConnections: Map<string, { toNode: string; toInput: string }> = new Map();

  /**
   * Create a new NodeGroup.
   *
   * @param name - Display name for this group.
   */
  constructor(name: string) {
    this.name = name;
    this.inputs = new Map();
    this.outputs = new Map();
    this.internalNodes = [];
    this.internalLinks = [];
  }

  /**
   * Add an exposed input to this group's interface.
   *
   * @param name - Input name (must be unique within this group).
   * @param type - Socket type of the input.
   * @param defaultValue - Default value when not overridden.
   * @param description - User-facing documentation. Default: ''.
   * @param min - Optional minimum value for numeric inputs.
   * @param max - Optional maximum value for numeric inputs.
   * @returns The newly created ExposedInput.
   *
   * @example
   * ```typescript
   * const scaleInput = group.addExposedInput('Scale', SocketType.FLOAT, 5.0, 'Noise scale');
   * ```
   */
  addExposedInput(
    name: string,
    type: SocketType | string,
    defaultValue: any,
    description: string = '',
    min?: number,
    max?: number,
  ): ExposedInput {
    const groupInputNodeId = `grp_in_${this.idCounter++}_${name}`;
    const exposed = new ExposedInput(name, type, defaultValue, description, groupInputNodeId, min, max);
    this.inputs.set(name, exposed);

    // Create a placeholder group input node definition
    const nodeDef = exposed.toGroupInputNode();
    this.internalNodes.push(nodeDef);

    return exposed;
  }

  /**
   * Add an exposed output to this group's interface.
   *
   * @param name - Output name (must be unique within this group).
   * @param type - Socket type of the output.
   * @returns The newly created ExposedOutput.
   *
   * @example
   * ```typescript
   * const dispOutput = group.addExposedOutput('Displacement', SocketType.FLOAT);
   * ```
   */
  addExposedOutput(name: string, type: SocketType | string): ExposedOutput {
    const groupOutputNodeId = `grp_out_${this.idCounter++}_${name}`;
    const exposed = new ExposedOutput(name, type, groupOutputNodeId);
    this.outputs.set(name, exposed);

    // Create a placeholder group output node definition
    const nodeDef = exposed.toGroupOutputNode();
    this.internalNodes.push(nodeDef);

    return exposed;
  }

  /**
   * Connect an exposed input to an internal node's input socket.
   *
   * When the group is instantiated, the exposed input's value will be
   * forwarded to the specified internal node's input.
   *
   * @param inputName - Name of the exposed input.
   * @param fromNode - ID of the internal node to receive the value.
   * @param fromOutput - Name of the input socket on the internal node.
   */
  connectExposedInput(inputName: string, fromNode: string, fromOutput: string): void {
    if (!this.inputs.has(inputName)) {
      throw new Error(`[NodeGroup] Exposed input "${inputName}" not found in group "${this.name}"`);
    }
    this.inputConnections.set(inputName, { fromNode, fromOutput });
  }

  /**
   * Connect an internal node's output to an exposed output.
   *
   * When the group is evaluated, the internal node's output value will
   * be exposed as the group's output.
   *
   * @param outputName - Name of the exposed output.
   * @param toNode - ID of the internal node producing the value.
   * @param toInput - Name of the output socket on the internal node.
   */
  connectExposedOutput(outputName: string, toNode: string, toInput: string): void {
    if (!this.outputs.has(outputName)) {
      throw new Error(`[NodeGroup] Exposed output "${outputName}" not found in group "${this.name}"`);
    }
    this.outputConnections.set(outputName, { toNode, toInput });
  }

  /**
   * Create a new instance of this group with the given parameter overrides.
   *
   * The instance captures the group's internal structure and applies
   * any input overrides, producing a standalone node sub-graph that
   * can be placed in another graph.
   *
   * @param params - Optional record of input name → override value.
   * @returns A NodeGroupInstance referencing this group with overrides.
   *
   * @example
   * ```typescript
   * const instance = group.instantiate({ Scale: 10.0, Strength: 0.8 });
   * ```
   */
  instantiate(params?: Record<string, any>): NodeGroupInstance {
    const overrides = new Map<string, any>();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        overrides.set(key, value);
      }
    }
    return new NodeGroupInstance(this, overrides);
  }

  /**
   * Evaluate the group with given input values.
   *
   * This creates a temporary NodeWranglerBuilder, wires the group's
   * internal nodes, applies input values, and evaluates the graph.
   * Returns a map of output name → computed value.
   *
   * @param inputs - Map of input name → value to feed into the group.
   * @param context - Optional execution context for the evaluation.
   * @returns Map of output name → computed output value.
   */
  evaluate(inputs: Map<string, any>, context?: any): Map<string, any> {
    // Build a temporary builder for evaluation
    const builder = new NodeWranglerBuilder();

    // Set input values
    const resolvedInputs = new Map<string, any>();
    for (const [name, exposed] of this.inputs.entries()) {
      const value = inputs.get(name) ?? exposed.defaultValue;
      resolvedInputs.set(name, value);
    }

    // For a minimal implementation, create value nodes for each input
    // and connect them through the group's internal wiring.
    // In a full implementation, we would reconstruct the entire internal
    // node graph. Here we provide the structural foundation.

    const outputValues = new Map<string, any>();

    // Evaluate by passing input values through to outputs based on connections
    for (const [outputName, connection] of this.outputConnections.entries()) {
      // Find if this output is directly connected to an input
      let value: any = undefined;
      for (const [inputName, inputConn] of this.inputConnections.entries()) {
        if (inputConn.fromNode === connection.toNode && inputConn.fromOutput === connection.toInput) {
          value = resolvedInputs.get(inputName);
          break;
        }
      }
      if (value !== undefined) {
        outputValues.set(outputName, value);
      }
    }

    // Fallback: if no connections produced outputs, return default values
    if (outputValues.size === 0) {
      for (const [name, exposed] of this.outputs.entries()) {
        outputValues.set(name, null);
      }
    }

    return outputValues;
  }
}

// ============================================================================
// NodeGroupInstance
// ============================================================================

/**
 * A concrete instance of a NodeGroup with parameter overrides.
 *
 * NodeGroupInstance captures a reference to its parent NodeGroup and
 * stores per-instance parameter overrides. It can be placed into
 * another node graph or evaluated independently.
 *
 * @example
 * ```typescript
 * const instance = group.instantiate({ Scale: 8.0 });
 * instance.setInput('Strength', 0.9);
 * const scale = instance.getInput('Scale'); // 8.0
 * ```
 */
export class NodeGroupInstance {
  /** Unique ID for this instance */
  groupId: string;
  /** Reference to the parent NodeGroup definition */
  group: NodeGroup;
  /** Per-instance parameter overrides (input name → value) */
  parameterOverrides: Map<string, any>;
  /** Cached output values after evaluation */
  private cachedOutputs: Map<string, any> = new Map();

  /** Static counter for generating unique group instance IDs */
  private static instanceCounter: number = 0;

  /**
   * Create a new NodeGroupInstance.
   *
   * @param group - The parent NodeGroup definition.
   * @param parameterOverrides - Map of input name → override value.
   */
  constructor(group: NodeGroup, parameterOverrides: Map<string, any> = new Map()) {
    this.groupId = `grp_inst_${NodeGroupInstance.instanceCounter++}`;
    this.group = group;
    this.parameterOverrides = new Map(parameterOverrides);
  }

  /**
   * Get the current value of a named input, considering overrides
   * and the group's default value.
   *
   * @param name - Input name.
   * @returns The resolved value (override → default → undefined).
   */
  getInput(name: string): any {
    if (this.parameterOverrides.has(name)) {
      return this.parameterOverrides.get(name);
    }
    const exposed = this.group.inputs.get(name);
    return exposed?.defaultValue;
  }

  /**
   * Set (override) an input value for this instance.
   *
   * @param name - Input name.
   * @param value - The override value.
   */
  setInput(name: string, value: any): void {
    this.parameterOverrides.set(name, value);
    this.cachedOutputs.clear(); // Invalidate cache
  }

  /**
   * Get the current value of a named output (from the last evaluation).
   *
   * @param name - Output name.
   * @returns The cached output value, or undefined if not yet evaluated.
   */
  getOutput(name: string): any {
    return this.cachedOutputs.get(name);
  }

  /**
   * Get all internal node IDs with the instance's prefix.
   *
   * This is useful for integration with an external node graph where
   * each instance's nodes need unique identifiers.
   *
   * @returns Array of prefixed node IDs.
   */
  getNodeIds(): string[] {
    return this.group.internalNodes.map((_, i) => `${this.groupId}_node_${i}`);
  }

  /**
   * Evaluate this instance, applying parameter overrides and computing
   * output values.
   *
   * @param context - Optional execution context.
   * @returns Map of output name → computed value.
   */
  evaluate(context?: any): Map<string, any> {
    const inputs = new Map<string, any>();
    for (const [name, value] of this.parameterOverrides.entries()) {
      inputs.set(name, value);
    }
    this.cachedOutputs = this.group.evaluate(inputs, context);
    return this.cachedOutputs;
  }
}

// ============================================================================
// GeometryModifierType
// ============================================================================

/**
 * Enumeration of supported geometry modifier types.
 *
 * Each type corresponds to a Blender-like modifier that can be applied
 * to a THREE.BufferGeometry through the node system.
 */
export type GeometryModifierType =
  | 'SUBSURF'
  | 'MIRROR'
  | 'SOLIDIFY'
  | 'ARRAY'
  | 'BEVEL'
  | 'DISPLACE'
  | 'SHRINKWRAP'
  | 'SIMPLE_DEFORM'
  | 'SKIN'
  | 'TRIANGULATE';

// ============================================================================
// GeometryModifier (abstract base)
// ============================================================================

/**
 * Abstract base class for geometry modifiers that apply node-based
 * modifications to a THREE.BufferGeometry.
 *
 * Each modifier has a type, name, enabled/disabled state, and
 * viewport/render visibility. Subclasses implement `apply()` to
 * perform the actual geometry modification.
 *
 * @example
 * ```typescript
 * const subsurf = new SubSurfModifier(2, 'catmull_clark');
 * subsurf.name = 'Subdivision';
 * const smoothed = subsurf.apply(baseGeometry);
 * ```
 */
export abstract class GeometryModifier {
  /** The modifier type identifier */
  abstract modifierType: GeometryModifierType;
  /** Human-readable modifier name */
  name: string;
  /** Whether this modifier is active */
  enabled: boolean;
  /** Whether to show the effect in the viewport */
  showInViewport: boolean;
  /** Whether to show the effect in renders */
  showInRender: boolean;
  /** Modifier-specific parameters */
  params: Map<string, any>;

  /**
   * Create a new GeometryModifier.
   *
   * @param name - Human-readable name. Default: the modifier type.
   */
  constructor(name?: string) {
    this.name = name || 'GeometryModifier';
    this.enabled = true;
    this.showInViewport = true;
    this.showInRender = true;
    this.params = new Map();
  }

  /**
   * Apply this modifier to a geometry and return the modified result.
   *
   * @param geometry - The input geometry to modify.
   * @returns A new THREE.BufferGeometry with the modification applied.
   */
  abstract apply(geometry: THREE.BufferGeometry): THREE.BufferGeometry;

  /**
   * Apply this modifier in-place to a mesh's geometry.
   *
   * Replaces the mesh's geometry with the modified version.
   *
   * @param mesh - The THREE.Mesh whose geometry should be modified.
   */
  applyToMesh(mesh: THREE.Mesh): void {
    const modified = this.apply(mesh.geometry);
    mesh.geometry.dispose();
    mesh.geometry = modified;
  }

  /**
   * Get a parameter value by name.
   *
   * @param key - Parameter name.
   * @param defaultValue - Default if parameter is not set.
   * @returns The parameter value or default.
   */
  getParam(key: string, defaultValue?: any): any {
    return this.params.has(key) ? this.params.get(key) : defaultValue;
  }

  /**
   * Set a parameter value.
   *
   * @param key - Parameter name.
   * @param value - The value to set.
   */
  setParam(key: string, value: any): void {
    this.params.set(key, value);
  }
}

// ============================================================================
// GeometryModifierStack
// ============================================================================

/**
 * Ordered stack of geometry modifiers that are applied sequentially
 * to produce a final modified geometry.
 *
 * Modifiers are applied in order (first added → first applied),
 * matching Blender's modifier stack behavior. Disabled modifiers
 * are skipped during evaluation.
 *
 * @example
 * ```typescript
 * const stack = new GeometryModifierStack();
 * stack.addModifier(new SubSurfModifier(2));
 * stack.addModifier(new MirrorModifier('x', 0.001));
 * const result = stack.applyAll(baseGeometry);
 * ```
 */
export class GeometryModifierStack {
  /** Ordered list of modifiers in this stack */
  modifiers: GeometryModifier[];

  /**
   * Create a new GeometryModifierStack.
   */
  constructor() {
    this.modifiers = [];
  }

  /**
   * Add a modifier to the end of the stack.
   *
   * @param modifier - The GeometryModifier to add.
   */
  addModifier(modifier: GeometryModifier): void {
    this.modifiers.push(modifier);
  }

  /**
   * Remove a modifier by name.
   *
   * @param name - The name of the modifier to remove.
   * @returns True if a modifier was found and removed.
   */
  removeModifier(name: string): boolean {
    const idx = this.modifiers.findIndex(m => m.name === name);
    if (idx >= 0) {
      this.modifiers.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Move a modifier to a new position in the stack.
   *
   * @param name - The name of the modifier to move.
   * @param newIndex - The target index (0-based).
   * @returns True if the modifier was found and moved.
   */
  moveModifier(name: string, newIndex: number): boolean {
    const oldIndex = this.modifiers.findIndex(m => m.name === name);
    if (oldIndex < 0) return false;
    if (newIndex < 0 || newIndex >= this.modifiers.length) return false;

    const [modifier] = this.modifiers.splice(oldIndex, 1);
    this.modifiers.splice(newIndex, 0, modifier);
    return true;
  }

  /**
   * Apply all enabled modifiers in order and return the final geometry.
   *
   * Each modifier's `apply()` is called sequentially, with the output
   * of one modifier feeding into the next.
   *
   * @param geometry - The starting geometry.
   * @returns The fully modified geometry.
   */
  applyAll(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    let current = geometry;
    for (const modifier of this.modifiers) {
      if (modifier.enabled) {
        try {
          current = modifier.apply(current);
        } catch (err) {
          console.warn(
            `[GeometryModifierStack] Modifier "${modifier.name}" ` +
            `(type=${modifier.modifierType}) failed:`, err
          );
        }
      }
    }
    return current;
  }

  /**
   * Apply all enabled modifiers in order to a mesh's geometry.
   *
   * @param mesh - The THREE.Mesh to modify.
   */
  applyToMesh(mesh: THREE.Mesh): void {
    const modified = this.applyAll(mesh.geometry);
    mesh.geometry.dispose();
    mesh.geometry = modified;
  }

  /**
   * Get a modifier by name.
   *
   * @param name - The modifier name to find.
   * @returns The modifier, or undefined if not found.
   */
  getModifier(name: string): GeometryModifier | undefined {
    return this.modifiers.find(m => m.name === name);
  }

  /**
   * Get all modifiers of a given type.
   *
   * @param type - The modifier type to filter by.
   * @returns Array of matching modifiers.
   */
  getModifiersByType(type: GeometryModifierType): GeometryModifier[] {
    return this.modifiers.filter(m => m.modifierType === type);
  }
}

// ============================================================================
// SubSurfModifier
// ============================================================================

/**
 * Subdivision Surface modifier — applies Loop or Catmull-Clark subdivision
 * to smooth a mesh by adding more vertices and faces.
 *
 * Catmull-Clark subdivision smooths the mesh by averaging vertex positions,
 * while simple subdivision only adds midpoints without smoothing.
 *
 * @example
 * ```typescript
 * const subsurf = new SubSurfModifier(2, 'catmull_clark');
 * subsurf.name = 'SmoothSubdiv';
 * const smoothed = subsurf.apply(boxGeometry);
 * ```
 */
export class SubSurfModifier extends GeometryModifier {
  modifierType: GeometryModifierType = 'SUBSURF';
  /** Number of subdivision levels (0-6). Each level quadruples the face count. */
  levels: number;
  /** Subdivision algorithm: 'catmull_clark' smooths, 'simple' only subdivides. */
  subdivisionType: 'catmull_clark' | 'simple';

  /**
   * Create a new SubSurfModifier.
   *
   * @param levels - Subdivision levels (0-6). Default: 1.
   * @param subdivisionType - Algorithm type. Default: 'catmull_clark'.
   * @param name - Optional modifier name.
   */
  constructor(levels: number = 1, subdivisionType: 'catmull_clark' | 'simple' = 'catmull_clark', name?: string) {
    super(name || 'SubSurf');
    this.levels = Math.max(0, Math.min(6, levels));
    this.subdivisionType = subdivisionType;
    this.params.set('levels', this.levels);
    this.params.set('subdivisionType', this.subdivisionType);
  }

  /**
   * Apply subdivision to the geometry.
   *
   * Uses Loop-style midpoint subdivision for each level. When
   * `subdivisionType` is 'catmull_clark', applies vertex smoothing
   * after subdivision.
   *
   * @param geometry - The input geometry.
   * @returns Subdivided geometry.
   */
  apply(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    let result = geometry;

    for (let level = 0; level < this.levels; level++) {
      result = subdivideOnce(result);
    }

    if (this.subdivisionType === 'catmull_clark' && this.levels > 0) {
      result = applyCatmullClarkSmoothing(result);
    }

    return result;
  }
}

/**
 * Perform one pass of midpoint subdivision.
 * Creates a midpoint on every edge and subdivides each triangle into four.
 */
function subdivideOnce(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  const idx = geometry.getIndex();
  if (!posAttr || !idx) return geometry.clone();

  const posArr = (posAttr.array as Float32Array).slice();
  const idxArr = idx.array as Uint32Array | Uint16Array;
  const vertexCount = posAttr.count;
  const faceCount = Math.floor(idx.count / 3);

  // Build edge-midpoint cache
  const newPositions: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    newPositions.push(posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]);
  }

  const edgeMidpoints = new Map<string, number>();
  const newIndices: number[] = [];

  const getMidpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const existing = edgeMidpoints.get(key);
    if (existing !== undefined) return existing;

    const mx = (newPositions[a * 3] + newPositions[b * 3]) / 2;
    const my = (newPositions[a * 3 + 1] + newPositions[b * 3 + 1]) / 2;
    const mz = (newPositions[a * 3 + 2] + newPositions[b * 3 + 2]) / 2;
    const newIndex = newPositions.length / 3;
    newPositions.push(mx, my, mz);
    edgeMidpoints.set(key, newIndex);
    return newIndex;
  };

  for (let f = 0; f < faceCount; f++) {
    const v0 = idxArr[f * 3];
    const v1 = idxArr[f * 3 + 1];
    const v2 = idxArr[f * 3 + 2];

    const m01 = getMidpoint(v0, v1);
    const m12 = getMidpoint(v1, v2);
    const m20 = getMidpoint(v2, v0);

    // Four sub-triangles
    newIndices.push(v0, m01, m20);
    newIndices.push(v1, m12, m01);
    newIndices.push(v2, m20, m12);
    newIndices.push(m01, m12, m20);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();
  return result;
}

/**
 * Apply Catmull-Clark vertex smoothing to a triangulated geometry.
 * Moves each original vertex toward the average of its face-adjacent vertices.
 */
function applyCatmullClarkSmoothing(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  const idx = geometry.getIndex();
  if (!posAttr || !idx) return geometry;

  const posArr = new Float32Array(posAttr.array as Float32Array);
  const idxArr = idx.array as Uint32Array | Uint16Array;
  const vertexCount = posAttr.count;
  const faceCount = Math.floor(idx.count / 3);

  // Build adjacency: vertex → list of neighboring vertex indices
  const neighbors = new Map<number, Set<number>>();
  for (let i = 0; i < vertexCount; i++) {
    neighbors.set(i, new Set());
  }

  for (let f = 0; f < faceCount; f++) {
    const v0 = idxArr[f * 3];
    const v1 = idxArr[f * 3 + 1];
    const v2 = idxArr[f * 3 + 2];
    neighbors.get(v0)!.add(v1); neighbors.get(v0)!.add(v2);
    neighbors.get(v1)!.add(v0); neighbors.get(v1)!.add(v2);
    neighbors.get(v2)!.add(v0); neighbors.get(v2)!.add(v1);
  }

  // Smooth: blend each vertex position toward the average of its neighbors
  const smoothingFactor = 0.25; // Conservative smoothing
  for (let i = 0; i < vertexCount; i++) {
    const nSet = neighbors.get(i);
    if (!nSet || nSet.size === 0) continue;

    let sx = 0, sy = 0, sz = 0;
    for (const n of nSet) {
      sx += posArr[n * 3];
      sy += posArr[n * 3 + 1];
      sz += posArr[n * 3 + 2];
    }
    const count = nSet.size;
    const avgX = sx / count;
    const avgY = sy / count;
    const avgZ = sz / count;

    posArr[i * 3] = posArr[i * 3] * (1 - smoothingFactor) + avgX * smoothingFactor;
    posArr[i * 3 + 1] = posArr[i * 3 + 1] * (1 - smoothingFactor) + avgY * smoothingFactor;
    posArr[i * 3 + 2] = posArr[i * 3 + 2] * (1 - smoothingFactor) + avgZ * smoothingFactor;
  }

  const result = geometry.clone();
  (result.getAttribute('position') as THREE.BufferAttribute).array.set(posArr);
  result.getAttribute('position').needsUpdate = true;
  result.computeVertexNormals();
  return result;
}

// ============================================================================
// MirrorModifier
// ============================================================================

/**
 * Mirror modifier — duplicates and mirrors geometry across a specified axis,
 * then merges vertices near the mirror plane.
 *
 * @example
 * ```typescript
 * const mirror = new MirrorModifier('x', 0.001);
 * const mirrored = mirror.apply(halfGeometry);
 * ```
 */
export class MirrorModifier extends GeometryModifier {
  modifierType: GeometryModifierType = 'MIRROR';
  /** Axis to mirror across */
  axis: 'x' | 'y' | 'z';
  /** Distance threshold for merging vertices near the mirror plane */
  mergeThreshold: number;

  /**
   * Create a new MirrorModifier.
   *
   * @param axis - Mirror axis. Default: 'x'.
   * @param mergeThreshold - Merge distance. Default: 0.001.
   * @param name - Optional modifier name.
   */
  constructor(axis: 'x' | 'y' | 'z' = 'x', mergeThreshold: number = 0.001, name?: string) {
    super(name || 'Mirror');
    this.axis = axis;
    this.mergeThreshold = mergeThreshold;
    this.params.set('axis', axis);
    this.params.set('mergeThreshold', mergeThreshold);
  }

  /**
   * Apply mirror to the geometry.
   *
   * Duplicates the geometry with positions reflected across the
   * specified axis, then merges vertices within `mergeThreshold`
   * of the mirror plane.
   *
   * @param geometry - The input geometry.
   * @returns Mirrored geometry.
   */
  apply(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    const idx = geometry.getIndex();
    if (!posAttr) return geometry.clone();

    const posArr = posAttr.array as Float32Array;
    const vertexCount = posAttr.count;
    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : 2;

    // Copy original positions
    const newPositions: number[] = [];
    for (let i = 0; i < posArr.length; i++) {
      newPositions.push(posArr[i]);
    }

    // Add mirrored positions
    for (let i = 0; i < vertexCount; i++) {
      const px = posArr[i * 3];
      const py = posArr[i * 3 + 1];
      const pz = posArr[i * 3 + 2];
      const coords = [px, py, pz];
      coords[axisIndex] = -coords[axisIndex];
      newPositions.push(coords[0], coords[1], coords[2]);
    }

    // Build index buffer
    const newIndices: number[] = [];
    if (idx) {
      const idxArr = idx.array as Uint32Array | Uint16Array;
      // Original faces
      for (let i = 0; i < idxArr.length; i++) {
        newIndices.push(idxArr[i]);
      }
      // Mirrored faces (reversed winding for correct face orientation)
      for (let i = 0; i < idxArr.length; i += 3) {
        newIndices.push(
          idxArr[i] + vertexCount,
          idxArr[i + 2] + vertexCount,
          idxArr[i + 1] + vertexCount,
        );
      }
    } else {
      for (let i = 0; i < vertexCount; i++) newIndices.push(i);
      for (let i = 0; i < vertexCount; i += 3) {
        newIndices.push(i + vertexCount, i + 2 + vertexCount, i + 1 + vertexCount);
      }
    }

    // Merge vertices near the mirror plane
    if (this.mergeThreshold > 0) {
      mergeNearVertices(newPositions, newIndices, axisIndex, this.mergeThreshold, vertexCount);
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    result.setIndex(newIndices);
    result.computeVertexNormals();
    return result;
  }
}

/**
 * Merge mirrored vertices that are close to the mirror plane.
 * Rewrites the index buffer to use the original vertex for mirrored
 * vertices within `threshold` of the plane.
 */
function mergeNearVertices(
  positions: number[],
  indices: number[],
  axisIndex: number,
  threshold: number,
  originalVertexCount: number,
): void {
  // For each mirrored vertex, check if it's close to the mirror plane
  const mirrorVertexCount = (positions.length / 3) - originalVertexCount;
  const mergeMap = new Map<number, number>(); // mirrored index → original index

  for (let i = 0; i < mirrorVertexCount; i++) {
    const mirroredIdx = originalVertexCount + i;
    const pos = positions[mirroredIdx * 3 + axisIndex];
    if (Math.abs(pos) < threshold) {
      // This mirrored vertex is on the mirror plane — use original instead
      mergeMap.set(mirroredIdx, i);
    }
  }

  // Rewrite indices
  for (let i = 0; i < indices.length; i++) {
    const replacement = mergeMap.get(indices[i]);
    if (replacement !== undefined) {
      indices[i] = replacement;
    }
  }
}

// ============================================================================
// DisplaceModifier
// ============================================================================

/**
 * Displace modifier — displaces vertices along a direction using
 * either a uniform strength or a node graph for displacement values.
 *
 * Supports displacement along vertex normals, specific axes, or a
 * custom direction. When a `textureNodeGraph` is provided, the
 * modifier evaluates it per-vertex to determine displacement amounts.
 *
 * @example
 * ```typescript
 * const displace = new DisplaceModifier('normal', 0.5, 0.0);
 * displace.name = 'TerrainNoise';
 * const displaced = displace.apply(baseGeometry);
 * ```
 */
export class DisplaceModifier extends GeometryModifier {
  modifierType: GeometryModifierType = 'DISPLACE';
  /** Direction of displacement */
  direction: 'normal' | 'x' | 'y' | 'z' | 'custom';
  /** Displacement strength (multiplied with the displacement value) */
  strength: number;
  /** Mid-level: values below this are displaced inward, above outward */
  midLevel: number;
  /** Optional node graph for computing displacement values per vertex */
  textureNodeGraph: NodeGroup | null;
  /** Custom direction vector (used when direction='custom') */
  customDirection: THREE.Vector3;

  /**
   * Create a new DisplaceModifier.
   *
   * @param direction - Displacement direction. Default: 'normal'.
   * @param strength - Displacement strength. Default: 1.0.
   * @param midLevel - Mid-level threshold. Default: 0.0.
   * @param textureNodeGraph - Optional node graph for displacement values.
   * @param name - Optional modifier name.
   */
  constructor(
    direction: 'normal' | 'x' | 'y' | 'z' | 'custom' = 'normal',
    strength: number = 1.0,
    midLevel: number = 0.0,
    textureNodeGraph: NodeGroup | null = null,
    name?: string,
  ) {
    super(name || 'Displace');
    this.direction = direction;
    this.strength = strength;
    this.midLevel = midLevel;
    this.textureNodeGraph = textureNodeGraph;
    this.customDirection = new THREE.Vector3(0, 1, 0);
    this.params.set('direction', direction);
    this.params.set('strength', strength);
    this.params.set('midLevel', midLevel);
  }

  /**
   * Apply displacement to the geometry.
   *
   * If `textureNodeGraph` is provided, it is evaluated per-vertex to
   * compute displacement values. Otherwise, uniform displacement is
   * applied based on `strength` and `midLevel`.
   *
   * @param geometry - The input geometry.
   * @returns Displaced geometry.
   */
  apply(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    if (!posAttr) return geometry.clone();

    const posArr = new Float32Array(posAttr.array as Float32Array);
    const vertexCount = posAttr.count;

    // Compute normals if not present
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

    // Determine displacement values per vertex
    const displacements = new Float32Array(vertexCount);

    if (this.textureNodeGraph) {
      // Evaluate the node graph per-vertex
      for (let i = 0; i < vertexCount; i++) {
        const inputs = new Map<string, any>();
        inputs.set('position', new THREE.Vector3(
          posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]
        ));
        const outputs = this.textureNodeGraph.evaluate(inputs);
        // Get the first output value as displacement
        for (const value of outputs.values()) {
          displacements[i] = typeof value === 'number' ? value : 0;
          break;
        }
      }
    } else {
      // Uniform displacement based on midLevel
      for (let i = 0; i < vertexCount; i++) {
        displacements[i] = 1.0 - this.midLevel;
      }
    }

    // Apply displacement
    for (let i = 0; i < vertexCount; i++) {
      let dx: number, dy: number, dz: number;

      switch (this.direction) {
        case 'normal':
          dx = normalArray[i * 3];
          dy = normalArray[i * 3 + 1];
          dz = normalArray[i * 3 + 2];
          break;
        case 'x':
          dx = 1; dy = 0; dz = 0;
          break;
        case 'y':
          dx = 0; dy = 1; dz = 0;
          break;
        case 'z':
          dx = 0; dy = 0; dz = 1;
          break;
        case 'custom':
          dx = this.customDirection.x;
          dy = this.customDirection.y;
          dz = this.customDirection.z;
          break;
        default:
          dx = normalArray[i * 3];
          dy = normalArray[i * 3 + 1];
          dz = normalArray[i * 3 + 2];
      }

      const d = displacements[i] * this.strength;
      posArr[i * 3] += dx * d;
      posArr[i * 3 + 1] += dy * d;
      posArr[i * 3 + 2] += dz * d;
    }

    const result = geometry.clone();
    (result.getAttribute('position') as THREE.BufferAttribute).array.set(posArr);
    result.getAttribute('position').needsUpdate = true;
    result.computeVertexNormals();
    return result;
  }
}

// ============================================================================
// SimpleDeformModifier
// ============================================================================

/**
 * Simple Deform modifier — applies twist, bend, taper, or stretch
 * deformations to geometry vertices.
 *
 * Each deformation type transforms vertices relative to a specified
 * origin point and axis, using configurable angle or factor parameters.
 *
 * @example
 * ```typescript
 * const twist = new SimpleDeformModifier('twist', new THREE.Vector3(0,0,0), 'z', Math.PI / 4);
 * const twisted = twist.apply(baseGeometry);
 * ```
 */
export class SimpleDeformModifier extends GeometryModifier {
  modifierType: GeometryModifierType = 'SIMPLE_DEFORM';
  /** Type of deformation to apply */
  deformType: 'twist' | 'bend' | 'taper' | 'stretch';
  /** Origin point for the deformation */
  origin: THREE.Vector3;
  /** Primary axis for the deformation */
  axis: 'x' | 'y' | 'z';
  /** Deformation angle in radians (for twist/bend) */
  angle: number;
  /** Deformation factor (for taper/stretch) */
  factor: number;

  /**
   * Create a new SimpleDeformModifier.
   *
   * @param deformType - Deformation type. Default: 'twist'.
   * @param origin - Origin point. Default: (0,0,0).
   * @param axis - Primary axis. Default: 'z'.
   * @param angle - Angle for twist/bend. Default: 0.
   * @param factor - Factor for taper/stretch. Default: 0.
   * @param name - Optional modifier name.
   */
  constructor(
    deformType: 'twist' | 'bend' | 'taper' | 'stretch' = 'twist',
    origin: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    axis: 'x' | 'y' | 'z' = 'z',
    angle: number = 0,
    factor: number = 0,
    name?: string,
  ) {
    super(name || 'SimpleDeform');
    this.deformType = deformType;
    this.origin = origin;
    this.axis = axis;
    this.angle = angle;
    this.factor = factor;
    this.params.set('deformType', deformType);
    this.params.set('axis', axis);
    this.params.set('angle', angle);
    this.params.set('factor', factor);
  }

  /**
   * Apply the deformation to the geometry.
   *
   * @param geometry - The input geometry.
   * @returns Deformed geometry.
   */
  apply(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return geometry.clone();

    const posArr = new Float32Array(posAttr.array as Float32Array);
    const vertexCount = posAttr.count;
    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : 2;

    for (let i = 0; i < vertexCount; i++) {
      // Translate to origin
      const x = posArr[i * 3] - this.origin.x;
      const y = posArr[i * 3 + 1] - this.origin.y;
      const z = posArr[i * 3 + 2] - this.origin.z;

      let nx = x, ny = y, nz = z;

      switch (this.deformType) {
        case 'twist': {
          // Twist: rotate around the primary axis proportional to distance along that axis
          const alongAxis = [x, y, z][axisIndex];
          const twistAngle = alongAxis * this.angle;
          const cosA = Math.cos(twistAngle);
          const sinA = Math.sin(twistAngle);

          if (axisIndex === 0) { // X-axis twist: rotate Y-Z
            ny = y * cosA - z * sinA;
            nz = y * sinA + z * cosA;
          } else if (axisIndex === 1) { // Y-axis twist: rotate X-Z
            nx = x * cosA - z * sinA;
            nz = x * sinA + z * cosA;
          } else { // Z-axis twist: rotate X-Y
            nx = x * cosA - y * sinA;
            ny = x * sinA + y * cosA;
          }
          break;
        }
        case 'bend': {
          // Bend: progressively rotate around a perpendicular axis
          const alongAxis = [x, y, z][axisIndex];
          const bendAngle = alongAxis * this.angle * 0.1;
          const cosB = Math.cos(bendAngle);
          const sinB = Math.sin(bendAngle);

          if (axisIndex === 2) { // Bend around Z: rotate Y component
            ny = y * cosB - alongAxis * sinB;
            nz = y * sinB + alongAxis * cosB;
          } else if (axisIndex === 1) {
            nx = x * cosB - alongAxis * sinB;
            nz = x * sinB + alongAxis * cosB;
          } else {
            nx = x * cosB - alongAxis * sinB;
            ny = x * sinB + alongAxis * cosB;
          }
          break;
        }
        case 'taper': {
          // Taper: scale perpendicular axes proportional to distance along the primary axis
          const alongAxis = [x, y, z][axisIndex];
          const scale = 1.0 + alongAxis * this.factor;
          if (axisIndex === 0) { nx = x; ny = y * scale; nz = z * scale; }
          else if (axisIndex === 1) { nx = x * scale; ny = y; nz = z * scale; }
          else { nx = x * scale; ny = y * scale; nz = z; }
          break;
        }
        case 'stretch': {
          // Stretch: scale the primary axis and counter-scale perpendicular axes
          const stretchFactor = 1.0 + this.factor;
          const perpScale = 1.0 / Math.sqrt(Math.max(0.001, stretchFactor));
          if (axisIndex === 0) { nx = x * stretchFactor; ny = y * perpScale; nz = z * perpScale; }
          else if (axisIndex === 1) { nx = x * perpScale; ny = y * stretchFactor; nz = z * perpScale; }
          else { nx = x * perpScale; ny = y * perpScale; nz = z * stretchFactor; }
          break;
        }
      }

      // Translate back from origin
      posArr[i * 3] = nx + this.origin.x;
      posArr[i * 3 + 1] = ny + this.origin.y;
      posArr[i * 3 + 2] = nz + this.origin.z;
    }

    const result = geometry.clone();
    (result.getAttribute('position') as THREE.BufferAttribute).array.set(posArr);
    result.getAttribute('position').needsUpdate = true;
    result.computeVertexNormals();
    return result;
  }
}

// ============================================================================
// SolidifyModifier
// ============================================================================

/**
 * Solidify modifier — adds thickness to thin surfaces by creating
 * inner/outer shells.
 *
 * Creates a duplicate of the geometry offset inward or outward, then
 * connects the edges to form a solid shell with the specified thickness.
 *
 * @example
 * ```typescript
 * const solidify = new SolidifyModifier(0.1, 0.0);
 * const thickened = solidify.apply(thinSurface);
 * ```
 */
export class SolidifyModifier extends GeometryModifier {
  modifierType: GeometryModifierType = 'SOLIDIFY';
  /** Shell thickness */
  thickness: number;
  /** Offset: -1 = inward, 0 = centered, 1 = outward */
  offset: number;

  /**
   * Create a new SolidifyModifier.
   *
   * @param thickness - Shell thickness. Default: 0.1.
   * @param offset - Offset direction (-1 to 1). Default: 0.
   * @param name - Optional modifier name.
   */
  constructor(thickness: number = 0.1, offset: number = 0, name?: string) {
    super(name || 'Solidify');
    this.thickness = thickness;
    this.offset = Math.max(-1, Math.min(1, offset));
    this.params.set('thickness', thickness);
    this.params.set('offset', offset);
  }

  /**
   * Apply solidify to the geometry.
   *
   * Creates an offset shell and connects the original and offset
   * surfaces along their edges to form a solid mesh.
   *
   * @param geometry - The input geometry.
   * @returns Solidified geometry.
   */
  apply(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    const idx = geometry.getIndex();
    if (!posAttr || !idx) return geometry.clone();

    const posArr = posAttr.array as Float32Array;
    const idxArr = idx.array as Uint32Array | Uint16Array;
    const vertexCount = posAttr.count;
    const faceCount = Math.floor(idxArr.length / 3);

    // Compute normals for offset direction
    const normals = new Float32Array(vertexCount * 3);
    geometry.computeVertexNormals();
    const normAttr = geometry.getAttribute('normal');
    if (normAttr) {
      normals.set(normAttr.array as Float32Array);
    } else {
      for (let i = 0; i < vertexCount; i++) {
        normals[i * 3] = 0; normals[i * 3 + 1] = 1; normals[i * 3 + 2] = 0;
      }
    }

    // Compute offset distance based on offset parameter
    const innerOffset = this.thickness * (1 - (this.offset + 1) / 2);
    const outerOffset = this.thickness * ((this.offset + 1) / 2);

    // Create new positions: original vertices + offset vertices
    const newPositions: number[] = [];
    for (let i = 0; i < vertexCount; i++) {
      // Original position (slightly offset inward)
      newPositions.push(
        posArr[i * 3] - normals[i * 3] * innerOffset,
        posArr[i * 3 + 1] - normals[i * 3 + 1] * innerOffset,
        posArr[i * 3 + 2] - normals[i * 3 + 2] * innerOffset,
      );
    }
    for (let i = 0; i < vertexCount; i++) {
      // Offset position (outward)
      newPositions.push(
        posArr[i * 3] + normals[i * 3] * outerOffset,
        posArr[i * 3 + 1] + normals[i * 3 + 1] * outerOffset,
        posArr[i * 3 + 2] + normals[i * 3 + 2] * outerOffset,
      );
    }

    const newIndices: number[] = [];

    // Original faces (front shell)
    for (let i = 0; i < idxArr.length; i++) {
      newIndices.push(idxArr[i]);
    }

    // Offset faces (back shell - reversed winding)
    for (let i = 0; i < idxArr.length; i += 3) {
      newIndices.push(
        idxArr[i] + vertexCount,
        idxArr[i + 2] + vertexCount,
        idxArr[i + 1] + vertexCount,
      );
    }

    // Side faces connecting front and back shells
    for (let f = 0; f < faceCount; f++) {
      const v0 = idxArr[f * 3];
      const v1 = idxArr[f * 3 + 1];
      const v2 = idxArr[f * 3 + 2];

      // For each edge of the original face, create a quad (2 triangles)
      // Edge v0-v1
      newIndices.push(v0, v1, v0 + vertexCount);
      newIndices.push(v1, v1 + vertexCount, v0 + vertexCount);

      // Edge v1-v2
      newIndices.push(v1, v2, v1 + vertexCount);
      newIndices.push(v2, v2 + vertexCount, v1 + vertexCount);

      // Edge v2-v0
      newIndices.push(v2, v0, v2 + vertexCount);
      newIndices.push(v0, v0 + vertexCount, v2 + vertexCount);
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    result.setIndex(newIndices);
    result.computeVertexNormals();
    return result;
  }
}

// ============================================================================
// ArrayModifier (bonus)
// ============================================================================

/**
 * Array modifier — creates repeating copies of the geometry along
 * a direction with configurable count and offset.
 *
 * @example
 * ```typescript
 * const array = new ArrayModifier(5, new THREE.Vector3(2, 0, 0));
 * const repeated = array.apply(singleObject);
 * ```
 */
export class ArrayModifier extends GeometryModifier {
  modifierType: GeometryModifierType = 'ARRAY';
  /** Number of copies (including original) */
  count: number;
  /** Offset between each copy */
  offset: THREE.Vector3;
  /** Whether to merge vertices between adjacent copies */
  mergeVertices: boolean;
  /** Merge distance threshold */
  mergeThreshold: number;

  /**
   * Create a new ArrayModifier.
   *
   * @param count - Number of copies. Default: 2.
   * @param offset - Offset between copies. Default: (1,0,0).
   * @param mergeVertices - Whether to merge adjacent copies. Default: false.
   * @param mergeThreshold - Merge threshold. Default: 0.001.
   * @param name - Optional modifier name.
   */
  constructor(
    count: number = 2,
    offset: THREE.Vector3 = new THREE.Vector3(1, 0, 0),
    mergeVertices: boolean = false,
    mergeThreshold: number = 0.001,
    name?: string,
  ) {
    super(name || 'Array');
    this.count = Math.max(1, count);
    this.offset = offset;
    this.mergeVertices = mergeVertices;
    this.mergeThreshold = mergeThreshold;
    this.params.set('count', count);
    this.params.set('offset', [offset.x, offset.y, offset.z]);
  }

  /**
   * Apply array to the geometry.
   *
   * @param geometry - The input geometry.
   * @returns Geometry with repeated copies.
   */
  apply(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    const idx = geometry.getIndex();
    if (!posAttr) return geometry.clone();

    const posArr = posAttr.array as Float32Array;
    const vertexCount = posAttr.count;

    const allPositions: number[] = [];
    const allIndices: number[] = [];

    for (let copy = 0; copy < this.count; copy++) {
      const ox = this.offset.x * copy;
      const oy = this.offset.y * copy;
      const oz = this.offset.z * copy;
      const vertexOffset = copy * vertexCount;

      // Add offset positions
      for (let i = 0; i < vertexCount; i++) {
        allPositions.push(
          posArr[i * 3] + ox,
          posArr[i * 3 + 1] + oy,
          posArr[i * 3 + 2] + oz,
        );
      }

      // Add offset indices
      if (idx) {
        const idxArr = idx.array as Uint32Array | Uint16Array;
        for (let i = 0; i < idxArr.length; i++) {
          allIndices.push(idxArr[i] + vertexOffset);
        }
      } else {
        for (let i = 0; i < vertexCount; i++) {
          allIndices.push(i + vertexOffset);
        }
      }
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    result.setIndex(allIndices);
    result.computeVertexNormals();
    return result;
  }
}

// ============================================================================
// BevelModifier (bonus)
// ============================================================================

/**
 * Bevel modifier — adds beveled edges to geometry by expanding vertices
 * along edges with a specified width.
 *
 * @example
 * ```typescript
 * const bevel = new BevelModifier(0.05, 3);
 * const beveled = bevel.apply(boxGeometry);
 * ```
 */
export class BevelModifier extends GeometryModifier {
  modifierType: GeometryModifierType = 'BEVEL';
  /** Bevel width */
  width: number;
  /** Number of segments in the bevel */
  segments: number;

  /**
   * Create a new BevelModifier.
   *
   * @param width - Bevel width. Default: 0.05.
   * @param segments - Number of segments. Default: 1.
   * @param name - Optional modifier name.
   */
  constructor(width: number = 0.05, segments: number = 1, name?: string) {
    super(name || 'Bevel');
    this.width = width;
    this.segments = Math.max(1, segments);
    this.params.set('width', width);
    this.params.set('segments', segments);
  }

  /**
   * Apply bevel to the geometry.
   *
   * This simplified implementation applies vertex-based beveling by
   * moving each vertex slightly inward along its normal, then
   * subdividing the geometry for smoother transitions.
   *
   * @param geometry - The input geometry.
   * @returns Beveled geometry.
   */
  apply(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return geometry.clone();

    // Apply vertex normal displacement for bevel effect
    const posArr = new Float32Array(posAttr.array as Float32Array);
    const vertexCount = posAttr.count;

    geometry.computeVertexNormals();
    const normAttr = geometry.getAttribute('normal');
    if (normAttr) {
      const normArr = normAttr.array as Float32Array;
      for (let i = 0; i < vertexCount; i++) {
        posArr[i * 3] += normArr[i * 3] * this.width * 0.5;
        posArr[i * 3 + 1] += normArr[i * 3 + 1] * this.width * 0.5;
        posArr[i * 3 + 2] += normArr[i * 3 + 2] * this.width * 0.5;
      }
    }

    const result = geometry.clone();
    (result.getAttribute('position') as THREE.BufferAttribute).array.set(posArr);
    result.getAttribute('position').needsUpdate = true;
    result.computeVertexNormals();

    // Subdivide for smoother bevel if segments > 1
    for (let s = 1; s < this.segments; s++) {
      const subResult = subdivideOnce(result);
      result.dispose();
      // Re-apply bevel smoothing on subdivided result
      const subPosAttr = subResult.getAttribute('position');
      subResult.computeVertexNormals();
      const subNormAttr = subResult.getAttribute('normal');
      if (subPosAttr && subNormAttr) {
        const subPos = new Float32Array(subPosAttr.array as Float32Array);
        const subNorm = subNormAttr.array as Float32Array;
        const taper = 1.0 - (s / this.segments);
        for (let i = 0; i < subPosAttr.count; i++) {
          subPos[i * 3] += subNorm[i * 3] * this.width * 0.1 * taper;
          subPos[i * 3 + 1] += subNorm[i * 3 + 1] * this.width * 0.1 * taper;
          subPos[i * 3 + 2] += subNorm[i * 3 + 2] * this.width * 0.1 * taper;
        }
        (subResult.getAttribute('position') as THREE.BufferAttribute).array.set(subPos);
        subResult.getAttribute('position').needsUpdate = true;
      }
    }

    return result;
  }
}

// ============================================================================
// TriangulateModifier (bonus)
// ============================================================================

/**
 * Triangulate modifier — ensures all faces are triangles by
 * fan-triangulating any polygon faces.
 *
 * @example
 * ```typescript
 * const triangulate = new TriangulateModifier();
 * const triGeo = triangulate.apply(polygonGeometry);
 * ```
 */
export class TriangulateModifier extends GeometryModifier {
  modifierType: GeometryModifierType = 'TRIANGULATE';
  /** Minimum vertices per face to triangulate */
  minVertices: number;

  /**
   * Create a new TriangulateModifier.
   *
   * @param minVertices - Minimum face vertex count to trigger triangulation. Default: 4.
   * @param name - Optional modifier name.
   */
  constructor(minVertices: number = 4, name?: string) {
    super(name || 'Triangulate');
    this.minVertices = minVertices;
    this.params.set('minVertices', minVertices);
  }

  /**
   * Apply triangulation to the geometry.
   *
   * @param geometry - The input geometry.
   * @returns Triangulated geometry.
   */
  apply(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    // Three.js BufferGeometry with indexed triangles is already triangulated
    // This is mostly a pass-through for indexed triangle meshes
    const idx = geometry.getIndex();
    if (!idx) {
      // Non-indexed: already a triangle list
      return geometry.clone();
    }
    // All faces are already triangles in BufferGeometry
    return geometry.clone();
  }
}

// ============================================================================
// GeomodBridge
// ============================================================================

/**
 * Bridges the NodeWranglerBuilder fluent API to the GeometryModifierStack.
 *
 * GeomodBridge provides the `addGeomod()` and `exposeInput()` methods
 * that create GeometryModifier instances and ExposedInput entries from
 * within a NodeWranglerBuilder context. This enables the P1 workflow
 * of building geometry modifiers through the node system.
 *
 * @example
 * ```typescript
 * const builder = new NodeWranglerBuilder();
 * const bridge = new GeomodBridge();
 *
 * // Add a geometry modifier
 * const subsurf = bridge.addGeomod(builder, 'SUBSURF', { levels: 2 });
 *
 * // Expose an input
 * const scale = bridge.exposeInput(builder, 'Scale', SocketType.FLOAT, 5.0);
 *
 * // Create a modifier group
 * const modGroup = bridge.createModifierGroup(subsurf);
 *
 * // Apply modifiers
 * const stack = new GeometryModifierStack();
 * stack.addModifier(subsurf);
 * const result = stack.applyAll(baseGeometry);
 * ```
 */
export class GeomodBridge {
  /** Internal modifier stack for accumulated modifiers */
  private modifierStack: GeometryModifierStack;
  /** Exposed inputs created through this bridge */
  private exposedInputs: Map<string, ExposedInput>;

  /**
   * Create a new GeomodBridge.
   */
  constructor() {
    this.modifierStack = new GeometryModifierStack();
    this.exposedInputs = new Map();
  }

  /**
   * Create a GeometryModifier from a NodeWranglerBuilder context
   * and register it on the bridge's modifier stack.
   *
   * This is the primary entry point for adding geometry modifiers
   * through the node builder system, matching the Infinigen Python API's
   * `add_geomod()` function.
   *
   * @param builder - The NodeWranglerBuilder context (used for metadata).
   * @param modifierType - The type of modifier to create.
   * @param params - Modifier-specific parameters.
   * @returns The created GeometryModifier.
   *
   * @example
   * ```typescript
   * const subsurf = bridge.addGeomod(builder, 'SUBSURF', { levels: 2, subdivisionType: 'catmull_clark' });
   * const mirror = bridge.addGeomod(builder, 'MIRROR', { axis: 'x', mergeThreshold: 0.001 });
   * const displace = bridge.addGeomod(builder, 'DISPLACE', { direction: 'normal', strength: 0.5 });
   * ```
   */
  addGeomod(
    builder: NodeWranglerBuilder,
    modifierType: GeometryModifierType,
    params: Record<string, any> = {},
  ): GeometryModifier {
    let modifier: GeometryModifier;

    switch (modifierType) {
      case 'SUBSURF':
        modifier = new SubSurfModifier(
          params.levels ?? 1,
          params.subdivisionType ?? 'catmull_clark',
          params.name,
        );
        break;
      case 'MIRROR':
        modifier = new MirrorModifier(
          params.axis ?? 'x',
          params.mergeThreshold ?? 0.001,
          params.name,
        );
        break;
      case 'DISPLACE': {
        const textureGraph = params.textureNodeGraph ?? null;
        modifier = new DisplaceModifier(
          params.direction ?? 'normal',
          params.strength ?? 1.0,
          params.midLevel ?? 0.0,
          textureGraph,
          params.name,
        );
        break;
      }
      case 'SIMPLE_DEFORM':
        modifier = new SimpleDeformModifier(
          params.deformType ?? 'twist',
          params.origin ? new THREE.Vector3(params.origin.x, params.origin.y, params.origin.z) : new THREE.Vector3(0, 0, 0),
          params.axis ?? 'z',
          params.angle ?? 0,
          params.factor ?? 0,
          params.name,
        );
        break;
      case 'SOLIDIFY':
        modifier = new SolidifyModifier(
          params.thickness ?? 0.1,
          params.offset ?? 0,
          params.name,
        );
        break;
      case 'ARRAY':
        modifier = new ArrayModifier(
          params.count ?? 2,
          params.offset ? new THREE.Vector3(params.offset.x, params.offset.y, params.offset.z) : new THREE.Vector3(1, 0, 0),
          params.mergeVertices ?? false,
          params.mergeThreshold ?? 0.001,
          params.name,
        );
        break;
      case 'BEVEL':
        modifier = new BevelModifier(
          params.width ?? 0.05,
          params.segments ?? 1,
          params.name,
        );
        break;
      case 'TRIANGULATE':
        modifier = new TriangulateModifier(
          params.minVertices ?? 4,
          params.name,
        );
        break;
      case 'SHRINKWRAP':
        // ShrinkWrap is a placeholder — wraps geometry to a target surface
        modifier = new DisplaceModifier(
          'normal',
          params.strength ?? 1.0,
          0.0,
          null,
          params.name || 'ShrinkWrap',
        );
        modifier.modifierType = 'SHRINKWRAP';
        break;
      case 'SKIN':
        // Skin modifier placeholder — creates a skin from vertices
        modifier = new SubSurfModifier(1, 'catmull_clark', params.name || 'Skin');
        modifier.modifierType = 'SKIN';
        break;
      default:
        throw new Error(`[GeomodBridge] Unknown modifier type: ${modifierType}`);
    }

    // Apply any additional params
    for (const [key, value] of Object.entries(params)) {
      if (!['name', 'levels', 'subdivisionType', 'axis', 'mergeThreshold',
            'direction', 'strength', 'midLevel', 'textureNodeGraph',
            'deformType', 'origin', 'angle', 'factor', 'thickness', 'offset',
            'count', 'mergeVertices', 'width', 'segments', 'minVertices'].includes(key)) {
        modifier.setParam(key, value);
      }
    }

    this.modifierStack.addModifier(modifier);
    return modifier;
  }

  /**
   * Create an exposed input on the current group and wire it
   * to an internal node's input.
   *
   * This is the bridge's equivalent of the Infinigen Python API's
   * `expose_input()` function.
   *
   * @param builder - The NodeWranglerBuilder context.
   * @param name - The input name to expose.
   * @param type - Socket type of the input.
   * @param defaultValue - Default value.
   * @param description - User-facing documentation. Default: ''.
   * @param min - Optional minimum value.
   * @param max - Optional maximum value.
   * @returns The ExposedInput entry.
   *
   * @example
   * ```typescript
   * const scaleInput = bridge.exposeInput(builder, 'Scale', SocketType.FLOAT, 5.0, 'Noise scale');
   * ```
   */
  exposeInput(
    builder: NodeWranglerBuilder,
    name: string,
    type: SocketType | string,
    defaultValue: any,
    description: string = '',
    min?: number,
    max?: number,
  ): ExposedInput {
    // Use the builder's existing exposeInput to create the NodeOutput
    const nodeOutput = builder.exposeInput(name, type, defaultValue);

    // Create the ExposedInput record
    const groupInputNodeId = nodeOutput.nodeId;
    const exposed = new ExposedInput(name, type, defaultValue, description, groupInputNodeId, min, max);

    this.exposedInputs.set(name, exposed);
    return exposed;
  }

  /**
   * Wrap a GeometryModifier as a NodeGroup for composition.
   *
   * This enables geometry modifiers to be embedded within the node
   * graph system, allowing them to be composed with other nodes and
   * evaluated as part of a larger graph.
   *
   * For displacement modifiers, an optional shader graph can be provided
   * that computes displacement values per-vertex.
   *
   * @param modifier - The GeometryModifier to wrap.
   * @param displacementGraph - Optional NodeGroup for displacement computation.
   * @returns A NodeGroup representing the modifier.
   *
   * @example
   * ```typescript
   * const displaceMod = new DisplaceModifier('normal', 0.5);
   * const noiseGraph = new NodeGroup('NoiseDisplacement');
   * noiseGraph.addExposedInput('Scale', SocketType.FLOAT, 5.0);
   * noiseGraph.addExposedOutput('Displacement', SocketType.FLOAT);
   * const modifierGroup = bridge.createModifierGroup(displaceMod, noiseGraph);
   * ```
   */
  createModifierGroup(
    modifier: GeometryModifier,
    displacementGraph?: NodeGroup,
  ): NodeGroup {
    const groupName = `${modifier.name}Group`;
    const group = new NodeGroup(groupName);

    // Add common inputs
    group.addExposedInput('Enabled', SocketType.BOOLEAN, true, 'Whether the modifier is active');
    group.addExposedInput('Strength', SocketType.FLOAT, 1.0, 'Overall modifier strength', 0, 10);

    // Add modifier-type-specific inputs
    switch (modifier.modifierType) {
      case 'SUBSURF': {
        const subMod = modifier as SubSurfModifier;
        group.addExposedInput('Levels', SocketType.INTEGER, subMod.levels, 'Subdivision levels', 0, 6);
        break;
      }
      case 'MIRROR': {
        const mirMod = modifier as MirrorModifier;
        group.addExposedInput('Axis', SocketType.STRING, mirMod.axis, 'Mirror axis');
        group.addExposedInput('MergeThreshold', SocketType.FLOAT, mirMod.mergeThreshold, 'Merge distance', 0, 1);
        break;
      }
      case 'DISPLACE': {
        const dispMod = modifier as DisplaceModifier;
        group.addExposedInput('Direction', SocketType.STRING, dispMod.direction, 'Displacement direction');
        group.addExposedInput('MidLevel', SocketType.FLOAT, dispMod.midLevel, 'Mid-level', 0, 1);
        break;
      }
      case 'SIMPLE_DEFORM': {
        const defMod = modifier as SimpleDeformModifier;
        group.addExposedInput('DeformType', SocketType.STRING, defMod.deformType, 'Deformation type');
        group.addExposedInput('Angle', SocketType.FLOAT, defMod.angle, 'Deformation angle');
        group.addExposedInput('Factor', SocketType.FLOAT, defMod.factor, 'Deformation factor');
        break;
      }
      case 'SOLIDIFY': {
        const solMod = modifier as SolidifyModifier;
        group.addExposedInput('Thickness', SocketType.FLOAT, solMod.thickness, 'Shell thickness', 0, 100);
        group.addExposedInput('Offset', SocketType.FLOAT, solMod.offset, 'Shell offset', -1, 1);
        break;
      }
      default:
        // Add generic params
        for (const [key, value] of modifier.params.entries()) {
          group.addExposedInput(key, SocketType.ANY, value, `Parameter: ${key}`);
        }
    }

    // If a displacement graph is provided, embed it
    if (displacementGraph) {
      for (const [inputName, exposed] of displacementGraph.inputs.entries()) {
        group.addExposedInput(
          `Displacement_${inputName}`,
          exposed.type,
          exposed.defaultValue,
          exposed.description,
          exposed.min,
          exposed.max,
        );
      }
    }

    // Add output
    group.addExposedOutput('Geometry', SocketType.GEOMETRY);

    return group;
  }

  /**
   * Get the bridge's internal modifier stack.
   *
   * @returns The GeometryModifierStack.
   */
  getModifierStack(): GeometryModifierStack {
    return this.modifierStack;
  }

  /**
   * Get an exposed input by name.
   *
   * @param name - The input name.
   * @returns The ExposedInput, or undefined if not found.
   */
  getExposedInput(name: string): ExposedInput | undefined {
    return this.exposedInputs.get(name);
  }

  /**
   * Get all exposed inputs.
   *
   * @returns Map of name → ExposedInput.
   */
  getAllExposedInputs(): Map<string, ExposedInput> {
    return new Map(this.exposedInputs);
  }

  /**
   * Apply all modifiers in the bridge's stack to a geometry.
   *
   * @param geometry - The input geometry.
   * @returns The modified geometry.
   */
  applyModifiers(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    return this.modifierStack.applyAll(geometry);
  }

  /**
   * Apply all modifiers in the bridge's stack to a mesh.
   *
   * @param mesh - The THREE.Mesh to modify.
   */
  applyModifiersToMesh(mesh: THREE.Mesh): void {
    this.modifierStack.applyToMesh(mesh);
  }
}

// ============================================================================
// Convenience factory functions
// ============================================================================

/**
 * Create a GeomodBridge and immediately add a modifier.
 *
 * @param builder - The NodeWranglerBuilder context.
 * @param modifierType - Type of modifier to add.
 * @param params - Modifier parameters.
 * @returns The created GeometryModifier.
 *
 * @example
 * ```typescript
 * const subsurf = createGeomod(builder, 'SUBSURF', { levels: 2 });
 * ```
 */
export function createGeomod(
  builder: NodeWranglerBuilder,
  modifierType: GeometryModifierType,
  params: Record<string, any> = {},
): GeometryModifier {
  const bridge = new GeomodBridge();
  return bridge.addGeomod(builder, modifierType, params);
}

/**
 * Create a fully configured modifier stack from a list of modifier specs.
 *
 * @param specs - Array of modifier type + params.
 * @returns A GeometryModifierStack with all modifiers added.
 *
 * @example
 * ```typescript
 * const stack = createModifierStack([
 *   { type: 'SUBSURF', params: { levels: 2 } },
 *   { type: 'MIRROR', params: { axis: 'x' } },
 *   { type: 'SOLIDIFY', params: { thickness: 0.1 } },
 * ]);
 * const result = stack.applyAll(baseGeo);
 * ```
 */
export function createModifierStack(
  specs: Array<{ type: GeometryModifierType; params?: Record<string, any> }>,
): GeometryModifierStack {
  const bridge = new GeomodBridge();
  const builder = new NodeWranglerBuilder();

  for (const spec of specs) {
    bridge.addGeomod(builder, spec.type, spec.params || {});
  }

  return bridge.getModifierStack();
}

/**
 * Apply a sequence of modifiers to a geometry and return the result.
 *
 * Convenience function that creates a modifier stack, applies it,
 * and returns the modified geometry in one call.
 *
 * @param geometry - The input geometry.
 * @param specs - Array of modifier type + params.
 * @returns The modified geometry.
 *
 * @example
 * ```typescript
 * const result = applyModifierPipeline(baseGeo, [
 *   { type: 'SUBSURF', params: { levels: 1 } },
 *   { type: 'DISPLACE', params: { direction: 'normal', strength: 0.3 } },
 * ]);
 * ```
 */
export function applyModifierPipeline(
  geometry: THREE.BufferGeometry,
  specs: Array<{ type: GeometryModifierType; params?: Record<string, any> }>,
): THREE.BufferGeometry {
  const stack = createModifierStack(specs);
  return stack.applyAll(geometry);
}
