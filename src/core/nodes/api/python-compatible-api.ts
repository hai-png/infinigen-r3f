/**
 * Python-Compatible NodeWrangler API
 *
 * Provides a wrapper around the existing NodeWrangler that matches
 * infinigen's Python `NodeWrangler.new_node()` API signature and
 * auto-connecting behaviour.
 *
 * ## Key Differences from the Base NodeWrangler
 *
 * The base `NodeWrangler.new_node()` already supports the Python-compatible
 * signature. However, the convenience methods (`add`, `multiply`,
 * `scalar_add`, etc.) in the base class do **not** auto-connect their
 * inputs to the newly created node. This wrapper fixes that by:
 *
 * 1. **Auto-connecting inputs**: When you call `nw.add(a, b)`, it creates
 *    a VectorMath node with operation=ADD and connects `a` and `b` as
 *    inputs 0 and 1.
 * 2. **Python-style `expose_input()`**: Infers the socket dtype from the
 *    provided value (number -> FLOAT, boolean -> BOOLEAN, array -> VECTOR).
 * 3. **`connect_input()`**: Handles both single and multi-input sockets,
 *    matching the Python `connect_input()` / `_update_socket()` logic.
 * 4. **Helper type guards**: `is_socket()` and `is_vector_socket()` for
 *    runtime type checking of node references.
 *
 * ## Usage
 *
 * ```ts
 * import { PythonCompatibleNodeWrangler } from '../api';
 *
 * const nw = new PythonCompatibleNodeWrangler();
 *
 * // Create nodes the Python way
 * const pos = nw.new_node('GeometryNodeInputPosition');
 * const noise = nw.new_node('ShaderNodeTexNoise', [], {}, { Vector: pos });
 * const scaled = nw.scalar_multiply(noise, 5.0);
 * const output = nw.new_node('NodeGroupOutput', [], {}, { Geometry: scaled });
 * ```
 *
 * @module core/nodes/api/python-compatible-api
 */

import { NodeWrangler, type NodeInputItem } from '../node-wrangler';
import type { NodeInstance, NodeLink, NodeGroup, NodeSocket } from '../types';
import { SocketType } from '../registry/socket-types';
import { NodeTypes } from '../core/node-types';

// ---------------------------------------------------------------------------
// Type aliases for Python API compatibility
// ---------------------------------------------------------------------------

/**
 * A value that can be passed as an input to any of the convenience methods.
 *
 * This is a superset of `NodeInputItem` that also allows plain arrays
 * representing vectors (e.g. `[1, 2, 3]`).
 */
export type PythonInputValue =
  | NodeInstance
  | NodeSocket
  | [NodeInstance, string]
  | number
  | string
  | boolean
  | number[]
  | null
  | undefined
  | PythonInputValue[];

/**
 * Result of the `capture()` method.
 *
 * Returns both the modified geometry and the captured attribute as
 * separate references, matching the Python API's
 * `return capture.outputs["Geometry"], capture.outputs["Attribute"]`.
 */
export interface CaptureResult {
  /** The geometry output with the attribute captured */
  geometry: NodeInstance;
  /** The captured attribute value */
  attribute: NodeInstance;
}

// ---------------------------------------------------------------------------
// NODETYPE_TO_DATATYPE mapping
// ---------------------------------------------------------------------------

/**
 * Maps Blender socket type identifiers to the data_type attribute values
 * used by nodes like CaptureAttribute, StoreNamedAttribute, etc.
 *
 * Ported from `infinigen/core/nodes/node_info.py` `NODETYPE_TO_DATATYPE`.
 */
const NODETYPE_TO_DATATYPE: Record<string, string> = {
  VALUE: 'FLOAT',
  INT: 'INT',
  VECTOR: 'FLOAT_VECTOR',
  FLOAT_COLOR: 'RGBA',
  BOOLEAN: 'BOOLEAN',
};

/**
 * Maps data_type values back to the Blender socket class names.
 *
 * Ported from `infinigen/core/nodes/node_info.py` `DATATYPE_TO_NODECLASS`.
 */
const DATATYPE_TO_NODECLASS: Record<string, string> = {
  FLOAT: 'NodeSocketFloat',
  INT: 'NodeSocketInt',
  FLOAT_VECTOR: 'NodeSocketVector',
  RGBA: 'NodeSocketColor',
  BOOLEAN: 'NodeSocketBool',
};

/**
 * Maps JavaScript/TypeScript runtime types to data_type strings.
 *
 * Ported from `infinigen/core/nodes/node_info.py` `PYTYPE_TO_DATATYPE`.
 */
const PYTYPE_TO_DATATYPE: Record<string, string> = {
  number: 'FLOAT',
  boolean: 'BOOLEAN',
  string: 'STRING',
};

// ---------------------------------------------------------------------------
// PythonCompatibleNodeWrangler
// ---------------------------------------------------------------------------

/**
 * A wrapper around the existing `NodeWrangler` that provides full
 * Python API compatibility with auto-connecting convenience methods.
 *
 * This class does **not** replace `NodeWrangler`; it delegates all
 * graph management to an inner `NodeWrangler` instance. The wrapper
 * adds:
 *
 * - Convenience methods that create nodes **and** auto-connect inputs
 * - Python-style `expose_input()` with dtype inference
 * - `connect_input()` with multi-input socket support
 * - `is_socket()` / `is_vector_socket()` type guards
 * - N-ary arithmetic methods (add, multiply, scalar_add, etc.)
 *
 * ### Why not just add these to NodeWrangler?
 *
 * The base `NodeWrangler` is used by many consumers that expect the
 * existing method signatures. Changing those methods would break
 * backward compatibility. This wrapper provides the Python API as a
 * separate layer that can be used alongside the base class.
 */
export class PythonCompatibleNodeWrangler {

  /** The underlying NodeWrangler that manages the actual graph */
  private readonly _nw: NodeWrangler;

  /**
   * Create a new PythonCompatibleNodeWrangler.
   *
   * @param wrangler - An existing `NodeWrangler` instance to wrap.
   *   If omitted, a fresh `NodeWrangler` is created.
   */
  constructor(wrangler?: NodeWrangler) {
    this._nw = wrangler ?? new NodeWrangler();
  }

  /**
   * Access the underlying NodeWrangler for advanced operations
   * not covered by the Python-compatible API.
   */
  get inner(): NodeWrangler {
    return this._nw;
  }

  // =========================================================================
  // Core: new_node() — delegates to the inner NodeWrangler
  // =========================================================================

  /**
   * Create and configure a node using the Python `new_node()` API.
   *
   * This is the primary node-creation method matching infinigen's Python
   * `NodeWrangler.new_node()`. It supports:
   *
   * - **Compatibility layer**: When `compatMode` is `true` (default),
   *   deprecated node types are automatically converted to their modern
   *   equivalents.
   * - **Singleton reuse**: For types like `NodeGroupInput`,
   *   `NodeGroupOutput`, `ShaderNodeOutputMaterial`, etc., an existing
   *   instance in the active group is reused.
   * - **attrs**: Node properties (like `operation`, `data_type`, `domain`)
   *   are applied via dot-path notation.
   * - **inputArgs**: Positional input connections — connect to the first N
   *   input sockets by index. Each arg can be a `NodeInstance`, `NodeSocket`,
   *   `[NodeInstance, string]` tuple, or a literal value.
   * - **inputKwargs**: Named input connections — dict of `socket_name -> value`.
   *   Same duck-typed resolution as `inputArgs`.
   * - **label**: Sets the node's display label.
   * - **exposeInput**: If provided, exposes certain inputs to the node
   *   group's interface.
   *
   * @param nodeType    - Canonical Blender-style node type identifier
   * @param inputArgs   - Positional input arguments (connected by index)
   * @param attrs       - Node properties to set (e.g. `{operation: 'ADD'}`)
   * @param inputKwargs - Named input arguments (socket name -> value/connection)
   * @param label       - Optional display label for the node
   * @param exposeInput - If provided, expose inputs to the group interface.
   *   - `true` -> expose all inputs that have non-null values
   *   - `Record<string, any>` -> map of `{socketName: {dtype, name, val}}`
   * @param compatMode  - If `true` (default), apply the CompatibilityLayer
   *   to convert deprecated node types
   * @returns The newly created (or reused singleton) `NodeInstance`
   *
   * @example
   * ```ts
   * // Simple node with attrs
   * const mathNode = nw.new_node('ShaderNodeMath', [], { operation: 'ADD' });
   *
   * // Connect inputs positionally
   * const addNode = nw.new_node('ShaderNodeVectorMath', [nodeA, nodeB]);
   *
   * // Connect inputs by name
   * const mixNode = nw.new_node(
   *   'ShaderNodeMix', [], { data_type: 'RGBA' },
   *   { Factor: 0.5, A: color1, B: color2 },
   * );
   * ```
   */
  new_node(
    nodeType: string,
    inputArgs?: PythonInputValue[],
    attrs?: Record<string, any>,
    inputKwargs?: Record<string, PythonInputValue>,
    label?: string,
    exposeInput?: Record<string, any> | boolean,
    compatMode: boolean = true,
  ): NodeInstance {
    return this._nw.new_node(
      nodeType,
      inputArgs as NodeInputItem[],
      attrs,
      inputKwargs as Record<string, NodeInputItem>,
      label,
      exposeInput,
      compatMode,
    );
  }

  // =========================================================================
  // new_value() — convenience for Value nodes
  // =========================================================================

  /**
   * Create a new Value node with the given float default value.
   *
   * Mirrors the Python `NodeWrangler.new_value()` convenience method.
   *
   * @param v     - The default value for the node's output
   * @param label - Optional display label
   * @returns The newly created Value `NodeInstance`
   */
  new_value(v: number, label?: string): NodeInstance {
    return this._nw.new_value(v, label);
  }

  // =========================================================================
  // expose_input() — Python-style with dtype inference
  // =========================================================================

  /**
   * Expose an input to the node group's interface, making it accessible
   * from outside the node group.
   *
   * This matches the Python `NodeWrangler.expose_input()` signature and
   * automatically infers the socket type (dtype) from the provided value
   * when `dtype` is not explicitly given:
   *
   * - `number` -> FLOAT
   * - `boolean` -> BOOLEAN
   * - `number[]` (array) -> FLOAT_VECTOR
   * - `string` -> STRING
   * - `NodeInstance` -> inferred from the node's first output socket type
   *
   * If the input is already exposed (same name exists in the group
   * interface), the existing exposed socket is returned without creating
   * a duplicate.
   *
   * @param name    - The name for the exposed group input
   * @param val     - Optional default value (also used for dtype inference)
   * @param dtype   - Optional explicit data type string (e.g. 'FLOAT',
   *   'FLOAT_VECTOR', 'BOOLEAN', 'NodeSocketFloat'). Overrides inference.
   * @returns The output socket on the GroupInput node that corresponds
   *   to this exposed input
   */
  expose_input(
    name: string,
    val?: PythonInputValue,
    dtype?: string,
  ): NodeSocket | undefined {
    const groupInput = this.new_node('NodeGroupInput', undefined, undefined, undefined, undefined, undefined, false);

    const group = this._nw.getActiveGroup();

    // Check if already exposed
    if (group.inputs.has(name)) {
      // Return the existing GroupInput output socket
      return groupInput.outputs.get(name);
    }

    // Infer the socket class from dtype or val
    const nodeclass = this._inferNodeclassFromArgs(dtype, val);

    // Determine the SocketType for the group input
    const socketType = this._nodeclassToSocketType(nodeclass);

    // Create the group-level input socket
    const exposedSocket: NodeSocket = {
      id: `group_input_${name}`,
      name,
      type: socketType,
      value: val as any,
      defaultValue: val as any,
      isInput: true,
    };

    group.inputs.set(name, exposedSocket);

    // Ensure the GroupInput node has a corresponding output socket
    if (!groupInput.outputs.has(name)) {
      groupInput.outputs.set(name, {
        id: `${groupInput.id}_out_${name}`,
        name,
        type: socketType,
        isInput: false,
      });
    }

    // Set default value on the group input if val is a literal
    if (val !== undefined && val !== null && typeof val !== 'object') {
      const socket = group.inputs.get(name);
      if (socket) {
        socket.value = val as any;
        socket.defaultValue = val as any;
      }
    }

    return groupInput.outputs.get(name);
  }

  // =========================================================================
  // connect_input() — Python-style with multi-input support
  // =========================================================================

  /**
   * Connect an input item to a socket, handling both single and
   * multi-input sockets.
   *
   * This matches the Python `NodeWrangler.connect_input()` logic:
   *
   * - If `inputItem` is an array where any element is a socket/node
   *   reference AND the target socket supports multi-input, each element
   *   is connected individually.
   * - If `inputItem` is a `NodeInstance`, the node's first enabled output
   *   is connected to the input socket.
   * - If `inputItem` is a `NodeSocket`, it is connected directly.
   * - If `inputItem` is a `[NodeInstance, string]` tuple, the named output
   *   socket on the node is connected.
   * - If `inputItem` is a literal value (number, string, boolean), it is
   *   assigned as the socket's default_value.
   *
   * @param inputSocket - The target input socket to connect to
   * @param inputItem   - The value/connection to resolve and connect
   */
  connect_input(inputSocket: NodeSocket, inputItem: PythonInputValue): void {
    if (inputItem === null || inputItem === undefined) {
      return;
    }

    // Handle arrays of items for multi-input sockets
    if (Array.isArray(inputItem)) {
      // Check if any element is a socket/node reference
      const hasSocketRef = inputItem.some(
        item => this._isNodeInstance(item) || this._isNodeSocket(item) ||
          (Array.isArray(item) && item.length === 2 && this._isNodeInstance(item[0]) && typeof item[1] === 'string'),
      );

      if (hasSocketRef) {
        // Multi-input: connect each item to the same socket
        for (const item of inputItem) {
          this._updateSocket(inputSocket, item as PythonInputValue);
        }
        return;
      }
      // If it's just an array of literals (like a vector), fall through
      // to literal assignment
    }

    this._updateSocket(inputSocket, inputItem);
  }

  // =========================================================================
  // Type Guards
  // =========================================================================

  /**
   * Check if a value is a valid socket reference (either a `NodeSocket`
   * or a `NodeInstance`).
   *
   * Mirrors the Python `NodeWrangler.is_socket()` static method.
   *
   * @param node - The value to check
   * @returns `true` if the value is a NodeSocket or NodeInstance
   */
  static is_socket(node: unknown): boolean {
    if (node === null || node === undefined) return false;
    if (typeof node !== 'object') return false;
    const obj = node as Record<string, unknown>;
    // NodeSocket has: name, type, isInput
    // NodeInstance has: id, type, name, inputs, outputs
    return (
      ('name' in obj && 'type' in obj && 'isInput' in obj) ||
      ('id' in obj && 'type' in obj && 'inputs' in obj && 'outputs' in obj)
    );
  }

  /**
   * Instance-level convenience wrapper for the static `is_socket()`.
   */
  is_socket(node: unknown): boolean {
    return PythonCompatibleNodeWrangler.is_socket(node);
  }

  /**
   * Check if a value represents a vector-type socket or node output.
   *
   * A value is considered a vector if:
   * - It is a `NodeInstance` whose first output socket has type VECTOR
   * - It is a `NodeSocket` with type VECTOR
   * - It is a plain number array (e.g. `[1, 2, 3]`)
   *
   * Mirrors the Python `NodeWrangler.is_vector_socket()` static method.
   *
   * @param node - The value to check
   * @returns `true` if the value represents a vector type
   */
  static is_vector_socket(node: unknown): boolean {
    if (node === null || node === undefined) return false;

    // NodeInstance: check first output socket type
    if (typeof node === 'object' && 'outputs' in (node as object)) {
      const inst = node as NodeInstance;
      const firstOutput = inst.outputs.values().next().value;
      if (firstOutput) {
        return String(firstOutput.type) === String(SocketType.VECTOR) ||
               String(firstOutput.type).includes('VECTOR');
      }
      return false;
    }

    // NodeSocket: check type
    if (typeof node === 'object' && 'type' in (node as object) && 'isInput' in (node as object)) {
      const socket = node as NodeSocket;
      return String(socket.type) === String(SocketType.VECTOR) ||
             String(socket.type).includes('VECTOR');
    }

    // Array of numbers -> vector
    if (Array.isArray(node) && node.length > 0 && typeof node[0] === 'number') {
      return true;
    }

    return false;
  }

  /**
   * Instance-level convenience wrapper for the static `is_vector_socket()`.
   */
  is_vector_socket(node: unknown): boolean {
    return PythonCompatibleNodeWrangler.is_vector_socket(node);
  }

  // =========================================================================
  // Arithmetic Convenience Methods (with auto-connecting)
  // =========================================================================

  /**
   * Vector addition of two or more inputs.
   *
   * Creates a `ShaderNodeVectorMath` node with operation `ADD` and
   * **auto-connects** the inputs positionally.
   *
   * Supports N-ary associative addition: `add(a, b, c) = add(a, add(b, c))`
   *
   * @param nodes - The inputs to add together (NodeInstances, sockets, or values)
   * @returns The resulting `NodeInstance`
   */
  add(...nodes: PythonInputValue[]): NodeInstance {
    if (nodes.length === 1) return nodes[0] as NodeInstance;
    if (nodes.length === 2) {
      return this.new_node(
        'ShaderNodeVectorMath',
        [nodes[0], nodes[1]],
        { operation: 'ADD' },
      );
    }
    return this.add(nodes[0], this.add(...nodes.slice(1)));
  }

  /**
   * Vector multiplication of two or more inputs.
   *
   * Creates a `ShaderNodeVectorMath` node with operation `MULTIPLY` and
   * **auto-connects** the inputs positionally.
   *
   * @param nodes - The inputs to multiply together
   * @returns The resulting `NodeInstance`
   */
  multiply(...nodes: PythonInputValue[]): NodeInstance {
    if (nodes.length === 1) return nodes[0] as NodeInstance;
    if (nodes.length === 2) {
      return this.new_node(
        'ShaderNodeVectorMath',
        [nodes[0], nodes[1]],
        { operation: 'MULTIPLY' },
      );
    }
    return this.multiply(nodes[0], this.multiply(...nodes.slice(1)));
  }

  /**
   * Scalar addition of two or more float inputs.
   *
   * Creates a `ShaderNodeMath` node with operation `ADD` and
   * **auto-connects** the inputs positionally.
   *
   * @param nodes - The float inputs to add together
   * @returns The resulting `NodeInstance`
   */
  scalar_add(...nodes: PythonInputValue[]): NodeInstance {
    if (nodes.length === 1) return nodes[0] as NodeInstance;
    if (nodes.length === 2) {
      return this.new_node(
        'ShaderNodeMath',
        [nodes[0], nodes[1]],
        { operation: 'ADD' },
      );
    }
    return this.scalar_add(nodes[0], this.scalar_add(...nodes.slice(1)));
  }

  /**
   * Scalar multiplication of two or more float inputs.
   *
   * Creates a `ShaderNodeMath` node with operation `MULTIPLY` and
   * **auto-connects** the inputs positionally.
   *
   * @param nodes - The float inputs to multiply together
   * @returns The resulting `NodeInstance`
   */
  scalar_multiply(...nodes: PythonInputValue[]): NodeInstance {
    if (nodes.length === 1) return nodes[0] as NodeInstance;
    if (nodes.length === 2) {
      return this.new_node(
        'ShaderNodeMath',
        [nodes[0], nodes[1]],
        { operation: 'MULTIPLY' },
      );
    }
    return this.scalar_multiply(nodes[0], this.scalar_multiply(...nodes.slice(1)));
  }

  /**
   * Scalar max of two or more float inputs.
   *
   * Creates a `ShaderNodeMath` node with operation `MAXIMUM` and
   * **auto-connects** the inputs positionally.
   *
   * @param nodes - The float inputs to take the maximum of
   * @returns The resulting `NodeInstance`
   */
  scalar_max(...nodes: PythonInputValue[]): NodeInstance {
    if (nodes.length === 1) return nodes[0] as NodeInstance;
    if (nodes.length === 2) {
      return this.new_node(
        'ShaderNodeMath',
        [nodes[0], nodes[1]],
        { operation: 'MAXIMUM' },
      );
    }
    return this.scalar_max(nodes[0], this.scalar_max(...nodes.slice(1)));
  }

  /**
   * Vector subtraction of two inputs.
   *
   * Creates a `ShaderNodeVectorMath` node with operation `SUBTRACT` and
   * **auto-connects** the inputs positionally.
   *
   * @param nodeA - The minuend
   * @param nodeB - The subtrahend
   * @returns The resulting `NodeInstance`
   */
  sub(nodeA: PythonInputValue, nodeB: PythonInputValue): NodeInstance {
    return this.new_node(
      'ShaderNodeVectorMath',
      [nodeA, nodeB],
      { operation: 'SUBTRACT' },
    );
  }

  /**
   * Scalar subtraction of two float inputs.
   *
   * Creates a `ShaderNodeMath` node with operation `SUBTRACT` and
   * **auto-connects** the inputs positionally.
   *
   * @param nodeA - The minuend
   * @param nodeB - The subtrahend
   * @returns The resulting `NodeInstance`
   */
  scalar_sub(nodeA: PythonInputValue, nodeB: PythonInputValue): NodeInstance {
    return this.new_node(
      'ShaderNodeMath',
      [nodeA, nodeB],
      { operation: 'SUBTRACT' },
    );
  }

  /**
   * Vector division of two inputs.
   *
   * Creates a `ShaderNodeVectorMath` node with operation `DIVIDE` and
   * **auto-connects** the inputs positionally.
   *
   * @param nodeA - The dividend
   * @param nodeB - The divisor
   * @returns The resulting `NodeInstance`
   */
  divide(nodeA: PythonInputValue, nodeB: PythonInputValue): NodeInstance {
    return this.new_node(
      'ShaderNodeVectorMath',
      [nodeA, nodeB],
      { operation: 'DIVIDE' },
    );
  }

  /**
   * Scalar division of two float inputs.
   *
   * Creates a `ShaderNodeMath` node with operation `DIVIDE` and
   * **auto-connects** the inputs positionally.
   *
   * @param nodeA - The dividend
   * @param nodeB - The divisor
   * @returns The resulting `NodeInstance`
   */
  scalar_divide(nodeA: PythonInputValue, nodeB: PythonInputValue): NodeInstance {
    return this.new_node(
      'ShaderNodeMath',
      [nodeA, nodeB],
      { operation: 'DIVIDE' },
    );
  }

  /**
   * Scale a vector by a scalar.
   *
   * Creates a `ShaderNodeVectorMath` node with operation `SCALE` and
   * **auto-connects** the inputs by name.
   *
   * If the scalar input is actually a vector (or the vector input is
   * actually a scalar), they are swapped automatically, matching the
   * Python `NodeWrangler.scale()` behaviour.
   *
   * @param vectorNode - The vector input
   * @param scalarNode - The scalar factor
   * @returns The resulting `NodeInstance`
   */
  scale(vectorNode: PythonInputValue, scalarNode: PythonInputValue): NodeInstance {
    let vec = vectorNode;
    let scl = scalarNode;

    // Auto-swap if the "scalar" is actually a vector
    if (this.is_vector_socket(scl) && !this.is_vector_socket(vec)) {
      [vec, scl] = [scl, vec];
    } else if (Array.isArray(scl) && !Array.isArray(vec)) {
      [vec, scl] = [scl, vec];
    }

    return this.new_node(
      'ShaderNodeVectorMath',
      [],
      { operation: 'SCALE' },
      { Vector: vec, Scale: scl },
    );
  }

  /**
   * Dot product of two vectors.
   *
   * Creates a `ShaderNodeVectorMath` node with operation `DOT_PRODUCT` and
   * **auto-connects** the inputs positionally.
   *
   * @param nodeA - First vector input
   * @param nodeB - Second vector input
   * @returns The resulting `NodeInstance`
   */
  dot(nodeA: PythonInputValue, nodeB: PythonInputValue): NodeInstance {
    return this.new_node(
      'ShaderNodeVectorMath',
      [nodeA, nodeB],
      { operation: 'DOT_PRODUCT' },
    );
  }

  /**
   * Generic math operation on a `ShaderNodeMath` node.
   *
   * Creates a Math node with the given operation and **auto-connects**
   * the inputs positionally.
   *
   * @param operation - The Math operation (e.g. 'ADD', 'SINE', 'POWER')
   * @param nodes     - The input values
   * @returns The resulting `NodeInstance`
   */
  math(operation: string, ...nodes: PythonInputValue[]): NodeInstance {
    return this.new_node(
      'ShaderNodeMath',
      nodes,
      { operation },
    );
  }

  /**
   * Generic vector math operation on a `ShaderNodeVectorMath` node.
   *
   * Creates a VectorMath node with the given operation and **auto-connects**
   * the inputs positionally.
   *
   * @param operation - The VectorMath operation (e.g. 'ADD', 'CROSS_PRODUCT')
   * @param nodes     - The input values
   * @returns The resulting `NodeInstance`
   */
  vector_math(operation: string, ...nodes: PythonInputValue[]): NodeInstance {
    return this.new_node(
      'ShaderNodeVectorMath',
      nodes,
      { operation },
    );
  }

  /**
   * Boolean math operation.
   *
   * Creates a `FunctionNodeBooleanMath` node with the given operation and
   * **auto-connects** the inputs positionally.
   *
   * @param operation - The BooleanMath operation (e.g. 'AND', 'OR', 'NOT')
   * @param nodes     - The input boolean values
   * @returns The resulting `NodeInstance`
   */
  boolean_math(operation: string, ...nodes: PythonInputValue[]): NodeInstance {
    return this.new_node(
      'FunctionNodeBooleanMath',
      nodes,
      { operation },
    );
  }

  // =========================================================================
  // Compare / Switch / Build Methods
  // =========================================================================

  /**
   * Compare two values with a given operation.
   *
   * Creates a `FunctionNodeCompare` node and **auto-connects**
   * the inputs positionally.
   *
   * @param operation - The comparison operation (e.g. 'EQUAL', 'GREATER_THAN')
   * @param nodes     - The two input values to compare
   * @returns The resulting `NodeInstance`
   */
  compare(operation: string, ...nodes: PythonInputValue[]): NodeInstance {
    return this.new_node(
      'FunctionNodeCompare',
      nodes,
      { operation },
    );
  }

  /**
   * Compare direction between two vectors with angle threshold.
   *
   * Creates a `FunctionNodeCompare` node with `data_type=VECTOR` and
   * `mode=DIRECTION`, and **auto-connects** the inputs by name.
   *
   * @param operation - The comparison operation (e.g. 'EQUAL')
   * @param a         - First vector input
   * @param b         - Second vector input
   * @param angle     - The angle threshold
   * @returns The resulting `NodeInstance`
   */
  compare_direction(
    operation: string,
    a: PythonInputValue,
    b: PythonInputValue,
    angle: PythonInputValue,
  ): NodeInstance {
    return this.new_node(
      'FunctionNodeCompare',
      [],
      { data_type: 'VECTOR', mode: 'DIRECTION', operation },
      { A: a, B: b, Angle: angle },
    );
  }

  /**
   * Switch between two values based on a boolean condition.
   *
   * Creates a `GeometryNodeSwitch` node and **auto-connects**
   * the inputs by name.
   *
   * @param pred       - The boolean condition (switch)
   * @param trueVal    - The value when the condition is true
   * @param falseVal   - The value when the condition is false
   * @param inputType  - The input type (default: 'FLOAT')
   * @returns The resulting `NodeInstance`
   */
  switch(
    pred: PythonInputValue,
    trueVal: PythonInputValue,
    falseVal: PythonInputValue,
    inputType: string = 'FLOAT',
  ): NodeInstance {
    return this.new_node(
      'GeometryNodeSwitch',
      [],
      { input_type: inputType },
      { Switch: pred, True: trueVal, False: falseVal },
    );
  }

  /**
   * Switch between two vector values based on a boolean condition.
   *
   * Convenience wrapper around `switch()` with `input_type='VECTOR'`.
   *
   * @param pred       - The boolean condition
   * @param trueVal    - The vector value when true
   * @param falseVal   - The vector value when false
   * @returns The resulting `NodeInstance`
   */
  vector_switch(
    pred: PythonInputValue,
    trueVal: PythonInputValue,
    falseVal: PythonInputValue,
  ): NodeInstance {
    return this.switch(pred, trueVal, falseVal, 'VECTOR');
  }

  /**
   * Bernoulli trial: returns a boolean output with given probability.
   *
   * Creates a `FunctionNodeRandomValue` node with `data_type=BOOLEAN`
   * and **auto-connects** the Probability and Seed inputs.
   *
   * @param prob - The probability of returning true (0.0 to 1.0)
   * @param seed - Optional seed value; auto-generated if not provided
   * @returns The resulting `NodeInstance`
   */
  bernoulli(prob: number, seed?: number): NodeInstance {
    if (seed === undefined) {
      seed = Math.floor(Math.random() * 1e5);
    }
    return this.new_node(
      'FunctionNodeRandomValue',
      [],
      { data_type: 'BOOLEAN' },
      { Probability: prob, Seed: seed },
    );
  }

  /**
   * Uniform random value in [low, high] range.
   *
   * Creates a `FunctionNodeRandomValue` node and **auto-connects**
   * the Min, Max, and Seed inputs.
   *
   * @param low      - The minimum value (or vector for FLOAT_VECTOR)
   * @param high     - The maximum value
   * @param seed     - Optional seed; auto-generated if not provided
   * @param dataType - The data type (default: 'FLOAT')
   * @returns The resulting `NodeInstance`
   */
  uniform(
    low: number | number[] = 0.0,
    high: number | number[] = 1.0,
    seed?: number,
    dataType: string = 'FLOAT',
  ): NodeInstance {
    if (seed === undefined) {
      seed = Math.floor(Math.random() * 1e5);
    }
    if (Array.isArray(low)) {
      dataType = 'FLOAT_VECTOR';
    }
    return this.new_node(
      'FunctionNodeRandomValue',
      [],
      { data_type: dataType },
      { Min: low, Max: high, Seed: seed },
    );
  }

  // =========================================================================
  // Texture / Curve / Capture Methods
  // =========================================================================

  /**
   * Combine XYZ components into a vector.
   *
   * Creates a `ShaderNodeCombineXYZ` node and **auto-connects**
   * the X, Y, Z inputs positionally.
   *
   * @param x - The X component
   * @param y - The Y component
   * @param z - The Z component
   * @returns The resulting `NodeInstance`
   */
  combine(x: PythonInputValue, y: PythonInputValue, z: PythonInputValue): NodeInstance {
    return this.new_node('ShaderNodeCombineXYZ', [x, y, z]);
  }

  /**
   * Separate a vector into XYZ components.
   *
   * Creates a `ShaderNodeSeparateXYZ` node and **auto-connects**
   * the vector input positionally.
   *
   * Returns the node instance. Access individual components via:
   * `node.outputs.get('X')`, `node.outputs.get('Y')`, `node.outputs.get('Z')`.
   *
   * @param x - The vector input
   * @returns The resulting `NodeInstance`
   */
  separate(x: PythonInputValue): NodeInstance {
    return this.new_node('ShaderNodeSeparateXYZ', [x]);
  }

  /**
   * Musgrave texture with automatic MapRange remapping from [-1, 1] to [0, 1].
   *
   * This matches the Python `NodeWrangler.musgrave()` convenience method:
   * it creates a Musgrave texture node, then wraps it in a MapRange node
   * that remaps the output from [-1, 1] to [0, 1].
   *
   * All inputs are **auto-connected**.
   *
   * @param scale  - The noise scale (default: 10)
   * @param vector - Optional vector input; if not provided, uses default
   * @returns The MapRange node that outputs the remapped value
   */
  musgrave(scale: number = 10, vector?: PythonInputValue): NodeInstance {
    const musgraveNode = this.new_node(
      'ShaderNodeTexMusgrave',
      vector !== undefined ? [vector] : [],
      {},
      { Scale: scale },
    );

    // MapRange remaps [-1, 1] -> [0, 1]
    return this.new_node(
      'ShaderNodeMapRange',
      [musgraveNode, -1, 1, 0, 1],
    );
  }

  /**
   * Capture an attribute on geometry, returning both the geometry and
   * the captured attribute.
   *
   * Creates a `GeometryNodeCaptureAttribute` node and **auto-connects**
   * the Geometry and Value inputs by name.
   *
   * This matches the Python `NodeWrangler.capture()` which returns
   * `capture.outputs["Geometry"], capture.outputs["Attribute"]`.
   *
   * @param geometry  - The input geometry
   * @param attribute - The attribute value to capture
   * @param attrs     - Optional additional properties (e.g. `{data_type: 'FLOAT', domain: 'POINT'}`)
   * @returns An object with `geometry` and `attribute` references
   */
  capture(
    geometry: PythonInputValue,
    attribute: PythonInputValue,
    attrs?: Record<string, any>,
  ): CaptureResult {
    const captureNode = this.new_node(
      'GeometryNodeCaptureAttribute',
      [],
      attrs ?? {},
      { Geometry: geometry, Value: attribute },
    );
    return {
      geometry: captureNode,
      attribute: captureNode,
    };
  }

  /**
   * Build a float curve: maps an input value through a curve defined by
   * anchor points.
   *
   * Creates a `ShaderNodeFloatCurve` node with the given anchor points
   * and **auto-connects** the Value input.
   *
   * Each anchor is `[position, value]` where position and value are in [0, 1].
   *
   * @param x        - The input value to map through the curve
   * @param anchors  - Array of [position, value] pairs defining the curve
   * @param handle   - The handle type for curve points (default: 'VECTOR')
   * @returns The FloatCurve `NodeInstance`
   */
  build_float_curve(
    x: PythonInputValue,
    anchors: [number, number][],
    handle: string = 'VECTOR',
  ): NodeInstance {
    const floatCurve = this.new_node(
      'ShaderNodeFloatCurve',
      [],
      {},
      { Value: x },
    );

    // Store curve data in properties for serialization and evaluation
    floatCurve.properties['_anchors'] = anchors;
    floatCurve.properties['_handle'] = handle;
    floatCurve.properties['_use_clip'] = false;

    return floatCurve;
  }

  /**
   * Convert a curve to mesh with optional profile curve and shade smooth.
   *
   * Creates a `GeometryNodeCurveToMesh` node followed by a
   * `GeometryNodeSetShadeSmooth` node, and **auto-connects** all inputs.
   *
   * Matches the Python `NodeWrangler.curve2mesh()` convenience method.
   *
   * @param curve          - The input curve geometry
   * @param profileCurve   - Optional profile curve for the sweep
   * @returns The SetShadeSmooth `NodeInstance`
   */
  curve2mesh(curve: PythonInputValue, profileCurve?: PythonInputValue): NodeInstance {
    const curveToMesh = this.new_node(
      'GeometryNodeCurveToMesh',
      [curve, profileCurve ?? null, true],
    );

    return this.new_node(
      'GeometryNodeSetShadeSmooth',
      [curveToMesh, null, false],
    );
  }

  // =========================================================================
  // Build Case / Index Methods
  // =========================================================================

  /**
   * Build a case/switch statement based on index matching.
   *
   * For each input value, creates a comparison node that checks if the
   * value equals the corresponding input, then switches to the matching
   * output. The last output is the default (fallback) case.
   *
   * @param value     - The value to match against
   * @param inputs    - The input values to compare against (plus a trailing sentinel)
   * @param outputs   - The corresponding outputs (plus a default fallback)
   * @param inputType - The switch input type (default: 'FLOAT')
   * @returns The final switched `NodeInstance`
   */
  build_case(
    value: PythonInputValue,
    inputs: PythonInputValue[],
    outputs: PythonInputValue[],
    inputType: string = 'FLOAT',
  ): NodeInstance {
    let node = outputs[outputs.length - 1];
    for (let i = 0; i < inputs.length - 1; i++) {
      node = this.switch(
        this.compare('EQUAL', value, inputs[i]),
        outputs[i],
        node,
        inputType,
      );
    }
    return node as NodeInstance;
  }

  /**
   * Build an index-based case: switch on the Index node.
   *
   * Convenience method that creates an Index node and uses it as the
   * switch value in a `build_case()` call.
   *
   * @param inputs - The index values and a trailing sentinel value (-1)
   * @returns The final switched `NodeInstance`
   */
  build_index_case(inputs: PythonInputValue[]): NodeInstance {
    const indexNode = this.new_node('GeometryNodeInputIndex');
    return this.build_case(
      indexNode,
      [...inputs, -1],
      [...Array(inputs.length).fill(true), false],
    );
  }

  // =========================================================================
  // Power / Misc Math
  // =========================================================================

  /**
   * Power operation on two float inputs.
   *
   * Creates a `ShaderNodeMath` node with operation `POWER` and
   * **auto-connects** the inputs positionally.
   *
   * @param base     - The base value
   * @param exponent - The exponent value
   * @returns The resulting `NodeInstance`
   */
  power(base: PythonInputValue, exponent: PythonInputValue): NodeInstance {
    return this.new_node(
      'ShaderNodeMath',
      [base, exponent],
      { operation: 'POWER' },
    );
  }

  // =========================================================================
  // Geometry Convenience Methods
  // =========================================================================

  /**
   * Convert geometry to a single point by merging all vertices.
   *
   * Creates a `GeometryNodeMergeByDistance` node with a large distance
   * threshold and **auto-connects** the inputs.
   *
   * Matches the Python `NodeWrangler.geometry2point()`.
   *
   * @param geometry - The input geometry
   * @returns The resulting `NodeInstance`
   */
  geometry2point(geometry: PythonInputValue): NodeInstance {
    return this.new_node(
      'GeometryNodeMergeByDistance',
      [],
      {},
      { Geometry: geometry, Distance: 100.0 },
    );
  }

  /**
   * Create a point at a given position.
   *
   * Creates a `GeometryNodeMeshLine` node with count=1 and
   * **auto-connects** the inputs.
   *
   * Matches the Python `NodeWrangler.position2point()`.
   *
   * @param position - The position for the point
   * @returns The resulting `NodeInstance`
   */
  position2point(position: PythonInputValue): NodeInstance {
    return this.new_node(
      'GeometryNodeMeshLine',
      [],
      { mode: 'START' },
      { Count: 1, 'Start Location': position },
    );
  }

  // =========================================================================
  // Delegated Methods
  // =========================================================================

  /** Get the current active node group */
  getActiveGroup(): NodeGroup {
    return this._nw.getActiveGroup();
  }

  /** Set the active node group */
  setActiveGroup(groupId: string): void {
    this._nw.setActiveGroup(groupId);
  }

  /** Connect two sockets */
  connect(
    fromNode: string | NodeInstance,
    fromSocket: string,
    toNode: string | NodeInstance,
    toSocket: string,
  ): NodeLink {
    return this._nw.connect(fromNode, fromSocket, toNode, toSocket);
  }

  /** Find nodes by name */
  find(name: string): NodeInstance[] {
    return this._nw.find(name);
  }

  /** Find nodes recursively */
  findRecursive(name: string): { wrangler: NodeWrangler; node: NodeInstance }[] {
    return this._nw.findRecursive(name);
  }

  /** Find links coming into a socket */
  findFrom(socket: NodeSocket): NodeLink[] {
    return this._nw.find_from(socket);
  }

  /** Find links going out from a socket */
  findTo(socket: NodeSocket): NodeLink[] {
    return this._nw.find_to(socket);
  }

  /** Get a node by ID */
  getNode(nodeId: string, groupId?: string): NodeInstance {
    return this._nw.getNode(nodeId, groupId);
  }

  /** Remove a node and its connections */
  removeNode(nodeId: string): void {
    this._nw.removeNode(nodeId);
  }

  /** Create a node group (subgraph) */
  createNodeGroup(name: string): NodeGroup {
    return this._nw.createNodeGroup(name);
  }

  /** Export the graph to JSON */
  toJSON(): string {
    return this._nw.toJSON();
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Internal: connect or assign a value to an input socket.
   *
   * Mirrors the Python `_update_socket()` method:
   * - If the inputItem can be resolved to a node output socket, create a link
   * - If it's a literal value, assign it as the socket's default_value
   *
   * @param inputSocket - The target input socket
   * @param inputItem   - The value or connection to apply
   */
  private _updateSocket(inputSocket: NodeSocket, inputItem: PythonInputValue): void {
    if (inputItem === null || inputItem === undefined) {
      return;
    }

    // Try to resolve to an output socket for linking
    const resolved = this._resolveToOutputSocket(inputItem);

    if (resolved !== null) {
      // Create a link
      const toNode = this._findNodeOwningSocket(inputSocket);
      if (toNode) {
        this._nw.connect(resolved.nodeId, resolved.socketName, toNode, inputSocket.name);
      }
    } else {
      // Assign as literal value
      inputSocket.value = inputItem as any;
    }
  }

  /**
   * Resolve a PythonInputValue to an output socket reference.
   *
   * @param item - The input value to resolve
   * @returns An object with `nodeId` and `socketName`, or `null` if
   *   the item is a literal value that cannot be resolved to a socket
   */
  private _resolveToOutputSocket(item: PythonInputValue): { nodeId: string; socketName: string } | null {
    // NodeInstance: use the first output socket
    if (this._isNodeInstance(item)) {
      const node = item as NodeInstance;
      const firstOutput = node.outputs.values().next().value;
      if (firstOutput) {
        return { nodeId: node.id, socketName: firstOutput.name };
      }
      return null;
    }

    // [NodeInstance, string] tuple: use the named output socket
    if (Array.isArray(item) && item.length === 2 && this._isNodeInstance(item[0]) && typeof item[1] === 'string') {
      const node = item[0] as NodeInstance;
      const socketName = item[1] as string;
      return { nodeId: node.id, socketName };
    }

    // NodeSocket: find the node that owns this output socket
    if (this._isNodeSocket(item) && !(item as NodeSocket).isInput) {
      const socket = item as NodeSocket;
      const group = this._nw.getActiveGroup();
      for (const [nodeId, node] of group.nodes.entries()) {
        for (const outSocket of node.outputs.values()) {
          if (outSocket.id === socket.id || outSocket === socket) {
            return { nodeId, socketName: outSocket.name };
          }
        }
      }
      return null;
    }

    return null;
  }

  /**
   * Find the node ID that owns a given input socket.
   *
   * @param socket - The input socket to find the owner for
   * @returns The node ID, or undefined if not found
   */
  private _findNodeOwningSocket(socket: NodeSocket): string | undefined {
    const group = this._nw.getActiveGroup();
    for (const [nodeId, node] of group.nodes.entries()) {
      for (const inp of node.inputs.values()) {
        if (inp === socket || inp.id === socket.id) {
          return nodeId;
        }
      }
    }
    return undefined;
  }

  /**
   * Type guard: check if a value looks like a NodeInstance.
   */
  private _isNodeInstance(value: unknown): value is NodeInstance {
    return (
      value !== null &&
      typeof value === 'object' &&
      'id' in (value as object) &&
      'type' in (value as object) &&
      'inputs' in (value as object) &&
      'outputs' in (value as object) &&
      !Array.isArray(value)
    );
  }

  /**
   * Type guard: check if a value looks like a NodeSocket.
   */
  private _isNodeSocket(value: unknown): value is NodeSocket {
    return (
      value !== null &&
      typeof value === 'object' &&
      'name' in (value as object) &&
      'type' in (value as object) &&
      'isInput' in (value as object) &&
      !('inputs' in (value as object))
    );
  }

  /**
   * Infer the Blender socket class from dtype and/or value.
   *
   * Mirrors the Python `NodeWrangler._infer_nodeclass_from_args()`.
   *
   * Resolution order:
   * 1. If `dtype` is provided and is a known nodeclass (e.g. 'NodeSocketFloat'), return it
   * 2. If `dtype` maps to a data_type (e.g. 'FLOAT'), convert to nodeclass
   * 3. If `val` is provided, infer data_type from its runtime type
   * 4. Default to FLOAT_VECTOR
   *
   * @param dtype - Optional explicit dtype specification
   * @param val   - Optional value for type inference
   * @returns The inferred nodeclass string (e.g. 'NodeSocketFloat')
   */
  private _inferNodeclassFromArgs(dtype?: string, val?: PythonInputValue): string {
    if (dtype !== undefined && dtype !== null) {
      // Check if it's already a nodeclass
      if (dtype in DATATYPE_TO_NODECLASS) {
        return DATATYPE_TO_NODECLASS[dtype];
      }
      if (dtype.startsWith('NodeSocket')) {
        return dtype;
      }
      // Check NODETYPE_TO_DATATYPE mapping
      if (dtype in NODETYPE_TO_DATATYPE) {
        const dataType = NODETYPE_TO_DATATYPE[dtype];
        return DATATYPE_TO_NODECLASS[dataType] ?? 'NodeSocketFloat';
      }
      // Check PYTYPE_TO_DATATYPE mapping
      if (dtype in PYTYPE_TO_DATATYPE) {
        const dataType = PYTYPE_TO_DATATYPE[dtype];
        return DATATYPE_TO_NODECLASS[dataType] ?? 'NodeSocketFloat';
      }
    }

    // Infer from val
    if (val !== undefined && val !== null) {
      if (typeof val === 'number') {
        return 'NodeSocketFloat';
      }
      if (typeof val === 'boolean') {
        return 'NodeSocketBool';
      }
      if (typeof val === 'string') {
        return 'NodeSocketString';
      }
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
        return 'NodeSocketVector';
      }
      if (this._isNodeInstance(val)) {
        const firstOutput = (val as NodeInstance).outputs.values().next().value;
        if (firstOutput) {
          const typeStr = String(firstOutput.type);
          if (typeStr in NODETYPE_TO_DATATYPE) {
            const dataType = NODETYPE_TO_DATATYPE[typeStr];
            return DATATYPE_TO_NODECLASS[dataType] ?? 'NodeSocketFloat';
          }
        }
      }
    }

    // Default
    return 'NodeSocketVector';
  }

  /**
   * Convert a nodeclass string to a SocketType enum value.
   *
   * @param nodeclass - The Blender socket class (e.g. 'NodeSocketFloat')
   * @returns The corresponding SocketType enum value
   */
  private _nodeclassToSocketType(nodeclass: string): SocketType {
    switch (nodeclass) {
      case 'NodeSocketFloat':
      case 'NodeSocketFloatAngle':
      case 'NodeSocketFloatDistance':
      case 'NodeSocketFloatFactor':
      case 'NodeSocketFloatPercentage':
      case 'NodeSocketFloatTime':
      case 'NodeSocketFloatTimeAbsolute':
      case 'NodeSocketUnsignedInt':
        return SocketType.FLOAT;
      case 'NodeSocketInt':
        return SocketType.INTEGER;
      case 'NodeSocketVector':
      case 'NodeSocketVectorAcceleration':
      case 'NodeSocketVectorDirection':
      case 'NodeSocketVectorEuler':
      case 'NodeSocketVectorSpeed':
      case 'NodeSocketVectorTranslation':
      case 'NodeSocketVectorXYZ':
        return SocketType.VECTOR;
      case 'NodeSocketColor':
        return SocketType.COLOR;
      case 'NodeSocketBool':
        return SocketType.BOOLEAN;
      case 'NodeSocketString':
        return SocketType.STRING;
      case 'NodeSocketShader':
        return SocketType.SHADER;
      case 'NodeSocketGeometry':
        return SocketType.GEOMETRY;
      case 'NodeSocketMaterial':
        return SocketType.MATERIAL;
      case 'NodeSocketTexture':
        return SocketType.TEXTURE;
      case 'NodeSocketObject':
        return SocketType.OBJECT;
      case 'NodeSocketCollection':
        return SocketType.COLLECTION;
      case 'NodeSocketImage':
        return SocketType.IMAGE;
      default:
        return SocketType.VALUE;
    }
  }
}
