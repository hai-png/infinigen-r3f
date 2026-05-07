/**
 * Node Wrangler — Clean rewrite
 *
 * Core class for managing node graphs in a Three.js/R3F context,
 * inspired by Blender's node system and infinigen's Python node_wrangler.py.
 *
 * ## What changed from the old version
 *
 * - Types (`NodeInstance`, `NodeLink`, `NodeGroup`, `NodeGraph`) are imported
 *   from the canonical `./types` module — no duplicate interface definitions.
 * - Node type identifiers use canonical Blender-style strings resolved through
 *   `NodeTypeRegistry` — no `NodeTypes` enum references.
 * - Execution is delegated to `ExecutorRegistry` — no `static executors` map
 *   or `static registerExecutor()` method.
 * - `fromJSON()` properly reconstructs the full graph from serialized data.
 *
 * @module core/nodes/node-wrangler
 */

import type { NodeInstance, NodeLink, NodeGroup, NodeGraph } from './types';
import type { NodeType } from './registry/node-type-registry';
import { resolveNodeType } from './registry/node-type-registry';
import {
  SocketType,
  type NodeSocket,
  type SocketDefinition,
  getDefaultValueForType,
  areSocketsCompatible,
} from './registry/socket-types';
import { nodeDefinitionRegistry } from './core/node-definition-registry';
import {
  getExecutor,
  executeNode,
  type ExecutorContext,
} from './execution/ExecutorRegistry';
import {
  applyCompatibility,
  resolveAllDeferred,
  isSocketReference,
  type CompatibilityResult,
  type DeferredNodeSpec,
} from './compatibility/CompatibilityLayer';

// ============================================================================
// Internal helper — NodeDefinition shape used by getNodeDefinition()
// ============================================================================

/**
 * Resolved definition for a single node type — the shape returned by
 * `getNodeDefinition()`. This is NOT a public interface; consumers should
 * use `NodeInstance` for runtime data and the registry for blueprints.
 */
interface ResolvedNodeDefinition {
  type: string;
  /** Socket definitions from the registry — `type` may be SocketType or string */
  inputs: Array<SocketDefinition | { name: string; type: string; defaultValue?: unknown; min?: number; max?: number; description?: string }>;
  outputs: Array<SocketDefinition | { name: string; type: string; defaultValue?: unknown; min?: number; max?: number; description?: string }>;
  properties?: Record<string, unknown>;
  defaultData?: unknown;
}

// ============================================================================
// Singleton Node Types
// ============================================================================

/**
 * Set of node types that should only have a single instance per node group.
 *
 * Mirrors `SINGLETON_NODES` from the Python `node_info.py` module.
 * When `new_node()` is called for one of these types, it will first check
 * whether an instance already exists in the active group and reuse it
 * rather than creating a duplicate.
 */
const SINGLETON_NODES: ReadonlySet<string> = new Set([
  'NodeGroupInput',
  'NodeGroupOutput',
  'ShaderNodeOutputMaterial',
  'ShaderNodeOutputWorld',
  'ShaderNodeOutputLight',
  'CompositorNodeComposite',
  'CompositorNodeViewer',
]);

/**
 * Type representing a value that can be passed as an input to `new_node()`.
 *
 * Duck-typed resolution is applied:
 * - `NodeInstance` → connect the node's first enabled output
 * - `NodeSocket` → connect directly
 * - `[NodeInstance, string]` tuple → connect a specific named output
 * - Literal value (number, string, boolean) → assign as `default_value`
 * - `null` / `undefined` → skip (no-op)
 * - Array of the above → for multi-input sockets, connect each item
 */
export type NodeInputItem =
  | NodeInstance
  | NodeSocket
  | [NodeInstance, string]
  | number
  | string
  | boolean
  | null
  | undefined
  | NodeInputItem[];

// ============================================================================
// NodeWrangler
// ============================================================================

/**
 * Central orchestrator for a node graph.
 *
 * Provides utilities for creating, connecting, and manipulating nodes,
 * plus convenience methods that mirror infinigen's Python API.
 */
export class NodeWrangler {

  // ---------------------------------------------------------------------------
  // Private state
  // ---------------------------------------------------------------------------

  private nodeGroups: Map<string, NodeGroup>;
  private activeGroup: string;
  private nodeCounter: number;
  private linkCounter: number;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Create a new NodeWrangler.
   *
   * @param initialGroup - Optional pre-built group to use as the root group.
   *   If omitted a default "root" group is created automatically.
   */
  constructor(initialGroup?: NodeGroup) {
    this.nodeGroups = new Map();
    this.nodeCounter = 0;
    this.linkCounter = 0;

    if (initialGroup) {
      this.nodeGroups.set(initialGroup.id, initialGroup);
      this.activeGroup = initialGroup.id;
    } else {
      const rootGroup: NodeGroup = {
        id: 'root',
        name: 'Root',
        nodes: new Map(),
        links: new Map(),
        inputs: new Map(),
        outputs: new Map(),
      };
      this.nodeGroups.set('root', rootGroup);
      this.activeGroup = 'root';
    }
  }

  // ===========================================================================
  // Group Management
  // ===========================================================================

  /**
   * Get the current active node group.
   *
   * @throws If the active group ID no longer exists in the map.
   */
  getActiveGroup(): NodeGroup {
    const group = this.nodeGroups.get(this.activeGroup);
    if (!group) {
      throw new Error(`Active group "${this.activeGroup}" not found`);
    }
    return group;
  }

  /**
   * Set the active node group.
   *
   * @throws If `groupId` does not exist in the wrangler.
   */
  setActiveGroup(groupId: string): void {
    if (!this.nodeGroups.has(groupId)) {
      throw new Error(`Node group "${groupId}" not found`);
    }
    this.activeGroup = groupId;
  }

  // ===========================================================================
  // Node CRUD
  // ===========================================================================

  /**
   * Create a new node in the active group.
   *
   * The `type` parameter is a canonical Blender-style string (e.g.
   * `'ShaderNodeVectorMath'`). It is resolved through `NodeTypeRegistry`
   * before the node is created so that aliases map to the canonical form.
   *
   * @param type        - Canonical Blender-style node type identifier (or any alias)
   * @param name        - Optional human-readable name; auto-generated if omitted
   * @param location    - Optional [x, y] position in the editor canvas
   * @param properties  - Optional initial property values
   * @returns The newly created `NodeInstance`
   */
  newNode(
    type: string,
    name?: string,
    location?: [number, number],
    properties?: Record<string, unknown>,
  ): NodeInstance {
    // Resolve the type through the registry so aliases become canonical
    const canonicalType = resolveNodeType(type);

    const group = this.getActiveGroup();
    const nodeId = `node_${this.nodeCounter++}`;
    const nodeName = name || `${canonicalType}_${this.nodeCounter}`;

    const nodeDef = this.getNodeDefinition(canonicalType);

    const node: NodeInstance = {
      id: nodeId,
      type: canonicalType,
      name: nodeName,
      location: location || [0, 0],
      inputs: new Map(),
      outputs: new Map(),
      properties: (properties as Record<string, unknown>) || {},
    };

    // Initialise input sockets from the definition
    for (const inputDef of nodeDef.inputs) {
      const socket: NodeSocket = {
        id: `${nodeId}_in_${inputDef.name}`,
        name: inputDef.name,
        type: inputDef.type as SocketType,
        value: inputDef.defaultValue,
        isInput: true,
        definition: inputDef as SocketDefinition,
      };
      node.inputs.set(inputDef.name, socket);
    }

    // Initialise output sockets from the definition
    for (const outputDef of nodeDef.outputs) {
      const socket: NodeSocket = {
        id: `${nodeId}_out_${outputDef.name}`,
        name: outputDef.name,
        type: outputDef.type as SocketType,
        isInput: false,
        definition: outputDef as SocketDefinition,
      };
      node.outputs.set(outputDef.name, socket);
    }

    group.nodes.set(nodeId, node);
    return node;
  }

  // ===========================================================================
  // Python-compatible new_node() API
  // ===========================================================================

  /**
   * Create and configure a node using the Python `new_node()` API.
   *
   * This is the primary node-creation method matching infinigen's Python
   * `NodeWrangler.new_node()`. It differs from the simpler `newNode()` by
   * supporting:
   *
   * - **Compatibility layer**: When `compatMode` is `true` (default),
   *   deprecated node types (e.g. `ShaderNodeMixRGB`) are automatically
   *   converted to their modern equivalents via the `CompatibilityLayer`.
   * - **Singleton reuse**: For types like `NodeGroupInput`,
   *   `NodeGroupOutput`, `ShaderNodeOutputMaterial`, etc., an existing
   *   instance in the active group is reused rather than creating a
   *   duplicate.
   * - **attrs**: Node properties (like `operation`, `data_type`, `domain`)
   *   are applied via dot-path notation (e.g. `"operation"` sets
   *   `node.properties.operation`).
   * - **inputArgs**: Positional input connections — connect to the first N
   *   input sockets by index. Each arg can be a `NodeInstance`, `NodeSocket`,
   *   `[NodeInstance, string]` tuple, or a literal value.
   * - **inputKwargs**: Named input connections — dict of `socket_name → value`.
   *   Same duck-typed resolution as `inputArgs`.
   * - **label**: Sets the node's display label.
   * - **exposeInput**: If provided, exposes certain inputs to the node
   *   group's interface.
   *
   * @param nodeType    - Canonical Blender-style node type identifier
   * @param inputArgs   - Positional input arguments (connected by index)
   * @param attrs       - Node properties to set (e.g. `{operation: 'ADD'}`)
   * @param inputKwargs - Named input arguments (socket name → value/connection)
   * @param label       - Optional display label for the node
   * @param exposeInput - If provided, expose inputs to the group interface.
   *   - `true` → expose all inputs that have non-null values
   *   - `Record<string, any>` → map of `{socketName: {dtype, name, val}}`
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
   *   'ShaderNodeMix',
   *   [],
   *   { data_type: 'RGBA' },
   *   { Factor: 0.5, A: color1, B: color2 },
   * );
   *
   * // Reuse singleton GroupInput
   * const groupIn = nw.new_node('NodeGroupInput');
   * ```
   */
  new_node(
    nodeType: string,
    inputArgs?: NodeInputItem[],
    attrs?: Record<string, any>,
    inputKwargs?: Record<string, NodeInputItem>,
    label?: string,
    exposeInput?: Record<string, any> | boolean,
    compatMode: boolean = true,
  ): NodeInstance {
    // Normalise defaults
    const args = inputArgs ?? [];
    const kwargs = inputKwargs ?? {};
    const nodeAttrs = attrs ?? {};

    // ── Step 1: Apply compatibility layer ──
    if (compatMode) {
      const compatResult = applyCompatibility(nodeType, args, kwargs, nodeAttrs);

      // Resolve any deferred intermediate nodes before proceeding
      const resolved = resolveAllDeferred(compatResult, (spec: DeferredNodeSpec) => {
        return this.new_node(
          spec.nodeType,
          [],
          spec.attrs as Record<string, any>,
          spec.inputKwargs as Record<string, NodeInputItem>,
          undefined,
          undefined,
          false, // Don't re-apply compat layer for intermediate nodes
        );
      });

      // Recurse with the converted parameters (but skip compat to avoid infinite loop)
      if (resolved.converted) {
        return this.new_node(
          resolved.nodeType,
          resolved.inputArgs as NodeInputItem[],
          resolved.attrs as Record<string, any>,
          resolved.inputKwargs as Record<string, NodeInputItem>,
          label,
          exposeInput,
          false, // Already applied compat — don't re-apply
        );
      }
    }

    // ── Step 2: Create or reuse the node ──
    const canonicalType = resolveNodeType(nodeType);
    const node = this._makeNode(canonicalType);

    // ── Step 3: Set label ──
    if (label !== undefined) {
      node.name = label;
    }

    // ── Step 4: Apply attrs (dot-path property assignment) ──
    for (const [keyPath, val] of Object.entries(nodeAttrs)) {
      const keys = keyPath.split('.');
      let obj: Record<string, any> = node.properties;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in obj)) {
          obj[keys[i]] = {};
        }
        obj = obj[keys[i]] as Record<string, any>;
      }
      obj[keys[keys.length - 1]] = val;
    }

    // ── Step 5: Connect inputs ──
    // Build a combined list: positional args (indexed by socket position) + named kwargs
    const inputKeyvalList: Array<[string | number, NodeInputItem]> = [
      ...args.map((item, idx) => [idx as number, item] as [number, NodeInputItem]),
      ...Object.entries(kwargs).map(([k, v]) => [k as string, v] as [string, NodeInputItem]),
    ];

    for (const [inputSocketName, inputItem] of inputKeyvalList) {
      if (inputItem === null || inputItem === undefined) {
        continue;
      }

      // Resolve the input socket on the node
      const inputSocket = this._inferInputSocket(node, inputSocketName);
      if (!inputSocket) {
        // Socket doesn't exist on this node — skip silently
        // (In Python, GroupOutput dynamically creates sockets, but we handle that separately)
        continue;
      }

      this.connectInput(inputSocket, inputItem);
    }

    // ── Step 6: Handle exposeInput ──
    if (exposeInput !== undefined && exposeInput !== false) {
      if (typeof exposeInput === 'object') {
        // exposeInput is a dict of { socketName: { dtype, name, val } }
        for (const [_key, entry] of Object.entries(exposeInput)) {
          if (Array.isArray(entry) && entry.length >= 3) {
            // Python format: [nodeclass, name, val]
            const [_nodeclass, name, val] = entry as [unknown, string, unknown];
            this._exposeInputToGroup(node, name, val);
          } else if (entry && typeof entry === 'object' && 'name' in entry) {
            const e = entry as { name: string; val?: unknown; dtype?: string };
            this._exposeInputToGroup(node, e.name, e.val);
          }
        }
      } else if (exposeInput === true) {
        // Expose all non-null inputKwargs that aren't already linked
        for (const [socketName, item] of Object.entries(kwargs)) {
          if (item !== null && item !== undefined) {
            this._exposeInputToGroup(node, socketName, item);
          }
        }
      }
    }

    return node;
  }

  /**
   * Create a new Value node with the given float default value.
   *
   * Mirrors the Python `NodeWrangler.new_value()` convenience method.
   * The Value node outputs a single float that can be connected to other
   * nodes' inputs.
   *
   * @param v     - The default value for the node's output
   * @param label - Optional display label
   * @returns The newly created Value `NodeInstance`
   *
   * @example
   * ```ts
   * const threshold = nw.new_value(0.5, 'Threshold');
   * ```
   */
  new_value(v: number, label?: string): NodeInstance {
    const node = this.new_node('ShaderNodeValue', [], {}, {}, label, undefined, false);
    // Set the output socket's default_value
    const outputSocket = node.outputs.values().next().value;
    if (outputSocket) {
      outputSocket.value = v;
      outputSocket.defaultValue = v;
    }
    // Also store on the properties dict for serialisation
    node.properties['default_value'] = v;
    return node;
  }

  /**
   * Trace connections **backwards** from an input socket — find all links
   * whose `toSocket` matches the given socket.
   *
   * Mirrors the Python `NodeWrangler.find_from()` method.
   *
   * @param socket - The input `NodeSocket` to trace from
   * @returns Array of `NodeLink`s feeding into this socket
   */
  find_from(socket: NodeSocket): NodeLink[] {
    const group = this.getActiveGroup();
    const results: NodeLink[] = [];
    for (const link of group.links.values()) {
      if (link.toSocket === socket.name || link.toSocket === socket.id) {
        results.push(link);
      }
    }
    return results;
  }

  /**
   * Trace connections **forwards** from an output socket — find all links
   * whose `fromSocket` matches the given socket.
   *
   * Mirrors the Python `NodeWrangler.find_to()` method.
   *
   * @param socket - The output `NodeSocket` to trace from
   * @returns Array of `NodeLink`s going out from this socket
   */
  find_to(socket: NodeSocket): NodeLink[] {
    const group = this.getActiveGroup();
    const results: NodeLink[] = [];
    for (const link of group.links.values()) {
      if (link.fromSocket === socket.name || link.fromSocket === socket.id) {
        results.push(link);
      }
    }
    return results;
  }

  // ===========================================================================
  // Private helpers for new_node()
  // ===========================================================================

  /**
   * Create or reuse a node instance, handling singleton types.
   *
   * For node types in the `SINGLETON_NODES` set, this method searches the
   * active group for an existing instance and returns it if found. Otherwise,
   * a new `NodeInstance` is created via `newNode()`.
   *
   * @param canonicalType - The resolved canonical node type string
   * @returns A `NodeInstance` — either a reused singleton or a new node
   */
  private _makeNode(canonicalType: string): NodeInstance {
    const group = this.getActiveGroup();

    // Check for singleton reuse
    if (SINGLETON_NODES.has(canonicalType)) {
      for (const existingNode of group.nodes.values()) {
        if (existingNode.type === canonicalType) {
          return existingNode;
        }
      }
    }

    // Create a fresh node using the existing newNode() method
    return this.newNode(canonicalType);
  }

  /**
   * Resolve an input socket reference on a node by name or index.
   *
   * Matches the Python `infer_input_socket()` utility. When given a number,
   * it returns the Nth input socket. When given a string, it returns the
   * socket with that name (or `undefined` if not found).
   *
   * @param node         - The node whose input sockets to search
   * @param socketRef    - A socket name (string) or index (number)
   * @returns The matching `NodeSocket`, or `undefined` if not found
   */
  private _inferInputSocket(
    node: NodeInstance,
    socketRef: string | number,
  ): NodeSocket | undefined {
    if (typeof socketRef === 'number') {
      // Return the Nth input socket by insertion order
      const sockets = Array.from(node.inputs.values());
      return sockets[socketRef] ?? undefined;
    }

    // String lookup by name
    return node.inputs.get(socketRef);
  }

  /**
   * Connect an input item to a socket, applying duck-typed resolution.
   *
   * This implements the Python `connect_input()` / `_update_socket()` logic:
   *
   * - **NodeInstance**: Use the node's first enabled output socket and
   *   create a link.
   * - **NodeSocket**: Create a link directly from this output socket.
   * - **[NodeInstance, string] tuple**: Create a link from the named
   *   output socket on the specified node.
   * - **Array of items**: If the target socket is a multi-input socket,
   *   connect each item individually. Otherwise, connect the first item only.
   * - **Literal value** (number, string, boolean): Assign as the socket's
   *   `value` / `defaultValue` property.
   *
   * @param inputSocket - The target input socket to connect to
   * @param inputItem   - The value/connection to resolve and connect
   */
  private connectInput(inputSocket: NodeSocket, inputItem: NodeInputItem): void {
    if (inputItem === null || inputItem === undefined) {
      return;
    }

    // Handle arrays of items (multi-input sockets)
    if (Array.isArray(inputItem)) {
      // Check if any element is a socket reference (not a plain number/string/boolean)
      const hasSocketRef = inputItem.some(
        item => isSocketReference(item) || Array.isArray(item),
      );

      if (hasSocketRef) {
        // Connect each item to the same input (multi-input)
        for (const item of inputItem) {
          this.connectInput(inputSocket, item);
        }
        return;
      }
      // If it's just an array of literals (like a vector), fall through to literal assignment
    }

    // Resolve the input to determine the connection strategy
    const resolved = this._resolveInputItem(inputItem);

    if (resolved.type === 'link') {
      // We need to find the node that owns this inputSocket
      const toNode = this._findNodeForSocket(inputSocket);
      if (toNode) {
        this.connect(resolved.fromNode!, resolved.fromSocket!, toNode, inputSocket.name);
      }
    } else if (resolved.type === 'value') {
      // Assign the literal value to the socket
      inputSocket.value = resolved.value;
    }
    // 'none' → skip
  }

  /**
   * Resolve a `NodeInputItem` into either a link specification or a literal value.
   *
   * @param item - The input item to resolve
   * @returns An object describing how to apply the item:
   *   - `{ type: 'link', fromNode, fromSocket, toNode, toSocket }` for connections
   *   - `{ type: 'value', value }` for literal assignments
   *   - `{ type: 'none' }` for unresolvable items (skip)
   */
  private _resolveInputItem(item: NodeInputItem): {
    type: 'link' | 'value' | 'none';
    fromNode?: string;
    fromSocket?: string;
    value?: unknown;
  } {
    // ── NodeInstance → first enabled output ──
    if (this._isNodeInstance(item)) {
      const node = item as NodeInstance;
      // Find the first output socket
      const firstOutput = node.outputs.values().next().value;
      if (firstOutput) {
        return {
          type: 'link',
          fromNode: node.id,
          fromSocket: firstOutput.name,
        };
      }
      return { type: 'none' };
    }

    // ── [NodeInstance, string] tuple → specific named output ──
    if (Array.isArray(item) && item.length === 2) {
      const [maybeNode, maybeSocketName] = item;
      if (this._isNodeInstance(maybeNode) && typeof maybeSocketName === 'string') {
        const node = maybeNode as NodeInstance;
        return {
          type: 'link',
          fromNode: node.id,
          fromSocket: maybeSocketName,
        };
      }
    }

    // ── NodeSocket → direct link ──
    if (this._isNodeSocket(item)) {
      const socket = item as NodeSocket;
      // We need to find which node this socket belongs to
      const group = this.getActiveGroup();
      for (const node of group.nodes.values()) {
        for (const outSocket of node.outputs.values()) {
          if (outSocket.id === socket.id || outSocket === socket) {
            return {
              type: 'link',
              fromNode: node.id,
              fromSocket: outSocket.name,
            };
          }
        }
      }
      return { type: 'none' };
    }

    // ── Literal value (number, string, boolean) ──
    if (typeof item === 'number' || typeof item === 'string' || typeof item === 'boolean') {
      return { type: 'value', value: item };
    }

    return { type: 'none' };
  }

  /**
   * Find the node ID that owns a given input socket.
   *
   * Searches all nodes in the active group for one whose inputs contain
   * the given socket reference (by identity or by `id` match).
   *
   * @param socket - The input socket to search for
   * @returns The node ID string, or `undefined` if not found
   */
  private _findNodeForSocket(socket: NodeSocket): string | undefined {
    const group = this.getActiveGroup();
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
   * Type guard: check if a value looks like a `NodeInstance`.
   *
   * A `NodeInstance` is an object with `id`, `type`, `name`, `inputs`,
   * `outputs`, and `properties` fields.
   */
  private _isNodeInstance(value: unknown): value is NodeInstance {
    return (
      value !== null &&
      typeof value === 'object' &&
      'id' in (value as object) &&
      'type' in (value as object) &&
      'inputs' in (value as object) &&
      'outputs' in (value as object) &&
      !(Array.isArray(value))
    );
  }

  /**
   * Type guard: check if a value looks like a `NodeSocket`.
   *
   * A `NodeSocket` is an object with `name`, `type`, and `isInput` fields
   * but NOT `inputs`/`outputs` (which would indicate a `NodeInstance`).
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
   * Expose a node's input to the group interface, making it accessible
   * from outside the node group.
   *
   * This creates a group-level input socket and wires it through the
   * GroupInput node to the specified node's input.
   *
   * @param node     - The node whose input is being exposed
   * @param name     - The name for the exposed group input
   * @param val      - Optional default value for the exposed input
   */
  private _exposeInputToGroup(
    node: NodeInstance,
    name: string,
    val?: unknown,
  ): void {
    const group = this.getActiveGroup();

    // Ensure a GroupInput node exists (singleton)
    const groupInput = this.new_node('NodeGroupInput', undefined, undefined, undefined, undefined, undefined, false);

    // Check if this input already exists in the group's interface
    if (group.inputs.has(name)) {
      return; // Already exposed
    }

    // Determine the socket type for the group input
    let socketType = SocketType.VALUE;
    if (typeof val === 'number') {
      socketType = SocketType.FLOAT;
    } else if (typeof val === 'boolean') {
      socketType = SocketType.BOOLEAN;
    } else if (typeof val === 'string') {
      socketType = SocketType.STRING;
    } else if (Array.isArray(val)) {
      socketType = SocketType.VECTOR;
    } else if (this._isNodeInstance(val)) {
      // Infer type from the connected node's first output
      const srcNode = val as NodeInstance;
      const firstOut = srcNode.outputs.values().next().value;
      if (firstOut) {
        socketType = firstOut.type;
      }
    }

    // Create the group-level input socket
    const exposedSocket: NodeSocket = {
      id: `group_input_${name}`,
      name,
      type: socketType,
      value: val,
      defaultValue: val,
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
  }

  /**
   * Get a node by ID, optionally from a specific group.
   *
   * @throws If the group or node does not exist.
   */
  getNode(nodeId: string, groupId?: string): NodeInstance {
    const group = groupId ? this.nodeGroups.get(groupId) : this.getActiveGroup();
    if (!group) {
      throw new Error(`Group "${groupId || this.activeGroup}" not found`);
    }

    const node = group.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    return node;
  }

  /**
   * Remove a node and all of its connections from the active group.
   *
   * @throws If the node does not exist.
   */
  removeNode(nodeId: string): void {
    const group = this.getActiveGroup();
    const node = group.nodes.get(nodeId);

    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    // Disconnect every input socket
    for (const [socketName] of node.inputs) {
      this.disconnect(nodeId, socketName);
    }
    // Disconnect every output socket
    for (const [socketName] of node.outputs) {
      this.disconnect(nodeId, socketName);
    }

    group.nodes.delete(nodeId);
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect an output socket to an input socket.
   *
   * If the target input is already connected the existing connection is
   * replaced. Socket type compatibility is checked and a warning is emitted
   * for mismatches (not an error — implicit conversions may still work).
   *
   * @param fromNode   - Source node (ID string or NodeInstance)
   * @param fromSocket - Name of the output socket on the source node
   * @param toNode     - Target node (ID string or NodeInstance)
   * @param toSocket   - Name of the input socket on the target node
   * @returns The newly created `NodeLink`
   */
  connect(
    fromNode: string | NodeInstance,
    fromSocket: string,
    toNode: string | NodeInstance,
    toSocket: string,
  ): NodeLink {
    const fromNodeId = typeof fromNode === 'string' ? fromNode : fromNode.id;
    const toNodeId = typeof toNode === 'string' ? toNode : toNode.id;

    const group = this.getActiveGroup();
    const fromNodeInst = group.nodes.get(fromNodeId);
    const toNodeInst = group.nodes.get(toNodeId);

    if (!fromNodeInst) {
      throw new Error(`Source node "${fromNodeId}" not found`);
    }
    if (!toNodeInst) {
      throw new Error(`Target node "${toNodeId}" not found`);
    }

    const fromOutput = fromNodeInst.outputs.get(fromSocket);
    const toInput = toNodeInst.inputs.get(toSocket);

    if (!fromOutput) {
      throw new Error(`Output socket "${fromSocket}" not found on node "${fromNodeId}"`);
    }
    if (!toInput) {
      throw new Error(`Input socket "${toSocket}" not found on node "${toNodeId}"`);
    }

    // Validate socket type compatibility
    if (fromOutput.type !== toInput.type && !areSocketsCompatible(fromOutput.type, toInput.type)) {
      console.warn(
        `Type mismatch: connecting ${fromOutput.type} to ${toInput.type}. ` +
        `This may cause runtime errors.`,
      );
    }

    // Remove existing connection to this input if any
    if (toInput.connectedTo) {
      this.disconnect(toNodeId, toSocket);
    }

    // Create link
    const linkId = `link_${this.linkCounter++}`;
    const link: NodeLink = {
      id: linkId,
      fromNode: fromNodeId,
      fromSocket,
      toNode: toNodeId,
      toSocket,
    };

    // Update socket connection references
    toInput.connectedTo = fromOutput.id;
    fromOutput.connectedTo = toInput.id;

    group.links.set(linkId, link);
    return link;
  }

  /**
   * Disconnect a socket, removing the link and clearing connection state.
   *
   * @throws If the node or socket does not exist.
   */
  disconnect(nodeId: string, socketName: string): void {
    const group = this.getActiveGroup();
    const node = group.nodes.get(nodeId);

    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    const socket = node.inputs.get(socketName) || node.outputs.get(socketName);
    if (!socket) {
      throw new Error(`Socket "${socketName}" not found on node "${nodeId}"`);
    }

    // Find and remove the link
    for (const [linkId, link] of group.links.entries()) {
      if (
        (link.toNode === nodeId && link.toSocket === socketName) ||
        (link.fromNode === nodeId && link.fromSocket === socketName)
      ) {
        // Clear the other end of the connection
        const otherNodeId = link.toNode === nodeId ? link.fromNode : link.toNode;
        const otherSocketName = link.toNode === nodeId ? link.fromSocket : link.toSocket;
        const otherNode = group.nodes.get(otherNodeId);

        if (otherNode) {
          const otherSocket = otherNode.inputs.get(otherSocketName) ||
                             otherNode.outputs.get(otherSocketName);
          if (otherSocket) {
            otherSocket.connectedTo = undefined;
          }
        }

        socket.connectedTo = undefined;
        group.links.delete(linkId);
        break;
      }
    }
  }

  // ===========================================================================
  // Node Group (Subgraph) Management
  // ===========================================================================

  /**
   * Create a new node group (subgraph) inside the wrangler.
   *
   * The group's `parent` is set to the currently active group.
   *
   * @param name - Human-readable name for the group
   * @returns The newly created `NodeGroup`
   */
  createNodeGroup(name: string): NodeGroup {
    const groupId = `group_${this.nodeCounter++}`;
    const group: NodeGroup = {
      id: groupId,
      name,
      nodes: new Map(),
      links: new Map(),
      inputs: new Map(),
      outputs: new Map(),
      parent: this.activeGroup,
    };

    this.nodeGroups.set(groupId, group);
    return group;
  }

  /**
   * Expose an input socket from a node inside a group as a group-level input.
   *
   * @param groupId     - ID of the group to expose the input on
   * @param nodeName    - ID of the node whose socket is being exposed
   * @param socketName  - Name of the input socket on the node
   * @param exposedName - Optional override name for the group input; defaults
   *                      to the socket name
   * @returns The exposed `NodeSocket` on the group
   */
  exposeInput(
    groupId: string,
    nodeName: string,
    socketName: string,
    exposedName?: string,
  ): NodeSocket {
    const group = this.nodeGroups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const node = group.nodes.get(nodeName);
    if (!node) {
      throw new Error(`Node "${nodeName}" not found in group "${groupId}"`);
    }

    const socket = node.inputs.get(socketName);
    if (!socket) {
      throw new Error(`Input socket "${socketName}" not found on node "${nodeName}"`);
    }

    const exposedSocket: NodeSocket = {
      ...socket,
      id: `group_input_${exposedName || socketName}`,
      name: exposedName || socketName,
    };

    group.inputs.set(exposedSocket.name, exposedSocket);
    return exposedSocket;
  }

  /**
   * Expose an output socket from a node inside a group as a group-level output.
   *
   * @param groupId     - ID of the group to expose the output on
   * @param nodeName    - ID of the node whose socket is being exposed
   * @param socketName  - Name of the output socket on the node
   * @param exposedName - Optional override name for the group output; defaults
   *                      to the socket name
   * @returns The exposed `NodeSocket` on the group
   */
  exposeOutput(
    groupId: string,
    nodeName: string,
    socketName: string,
    exposedName?: string,
  ): NodeSocket {
    const group = this.nodeGroups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const node = group.nodes.get(nodeName);
    if (!node) {
      throw new Error(`Node "${nodeName}" not found in group "${groupId}"`);
    }

    const socket = node.outputs.get(socketName);
    if (!socket) {
      throw new Error(`Output socket "${socketName}" not found on node "${nodeName}"`);
    }

    const exposedSocket: NodeSocket = {
      ...socket,
      id: `group_output_${exposedName || socketName}`,
      name: exposedName || socketName,
    };

    group.outputs.set(exposedSocket.name, exposedSocket);
    return exposedSocket;
  }

  // ===========================================================================
  // Convenience Methods — Python API Parity
  // Based on infinigen/core/nodes/node_wrangler.py
  // ===========================================================================

  /**
   * Add two or more nodes (vector math ADD).
   * Supports N-ary associative addition: `add(a, b, c) = add(a, add(b, c))`
   */
  add(...nodes: unknown[]): unknown {
    if (nodes.length === 1) return nodes[0];
    if (nodes.length === 2) {
      return this.newNode('ShaderNodeVectorMath', undefined, undefined, { operation: 'ADD' });
    }
    return this.add(nodes[0], this.add(...nodes.slice(1)));
  }

  /**
   * Multiply two or more nodes (vector math MULTIPLY).
   * Supports N-ary associative multiplication.
   */
  multiply(...nodes: unknown[]): unknown {
    if (nodes.length === 1) return nodes[0];
    if (nodes.length === 2) {
      return this.newNode('ShaderNodeVectorMath', undefined, undefined, { operation: 'MULTIPLY' });
    }
    return this.multiply(nodes[0], this.multiply(...nodes.slice(1)));
  }

  /**
   * Scalar add: adds two float values using Math node ADD operation
   */
  scalarAdd(...nodes: unknown[]): unknown {
    if (nodes.length === 1) return nodes[0];
    if (nodes.length === 2) {
      return this.newNode('ShaderNodeMath', undefined, undefined, { operation: 'ADD' });
    }
    return this.scalarAdd(nodes[0], this.scalarAdd(...nodes.slice(1)));
  }

  /**
   * Scalar multiply: multiplies two float values using Math node MULTIPLY operation
   */
  scalarMultiply(...nodes: unknown[]): unknown {
    if (nodes.length === 1) return nodes[0];
    if (nodes.length === 2) {
      return this.newNode('ShaderNodeMath', undefined, undefined, { operation: 'MULTIPLY' });
    }
    return this.scalarMultiply(nodes[0], this.scalarMultiply(...nodes.slice(1)));
  }

  /**
   * Subtract two nodes (vector math SUBTRACT)
   */
  sub(nodeA: unknown, nodeB: unknown): unknown {
    return this.newNode('ShaderNodeVectorMath', undefined, undefined, { operation: 'SUBTRACT' });
  }

  /**
   * Scalar subtract: subtracts two float values using Math node SUBTRACT operation
   */
  scalarSub(nodeA: unknown, nodeB: unknown): unknown {
    return this.newNode('ShaderNodeMath', undefined, undefined, { operation: 'SUBTRACT' });
  }

  /**
   * Divide two nodes (vector math DIVIDE)
   */
  divide(nodeA: unknown, nodeB: unknown): unknown {
    return this.newNode('ShaderNodeVectorMath', undefined, undefined, { operation: 'DIVIDE' });
  }

  /**
   * Scalar divide: divides two float values using Math node DIVIDE operation
   */
  scalarDivide(nodeA: unknown, nodeB: unknown): unknown {
    return this.newNode('ShaderNodeMath', undefined, undefined, { operation: 'DIVIDE' });
  }

  /**
   * Scale a vector by a scalar
   */
  scale(vectorNode: unknown, scalarNode: unknown): unknown {
    return this.newNode(
      'ShaderNodeVectorMath',
      undefined,
      undefined,
      { operation: 'SCALE' },
    );
  }

  /**
   * Dot product of two vectors
   */
  dot(nodeA: unknown, nodeB: unknown): unknown {
    return this.newNode(
      'ShaderNodeVectorMath',
      undefined,
      undefined,
      { operation: 'DOT_PRODUCT' },
    );
  }

  /**
   * Generic math operation on a Math node
   */
  math(operation: string, ...nodes: unknown[]): unknown {
    return this.newNode(
      'ShaderNodeMath',
      undefined,
      undefined,
      { operation },
    );
  }

  /**
   * Generic vector math operation on a VectorMath node
   */
  vectorMath(operation: string, ...nodes: unknown[]): unknown {
    return this.newNode(
      'ShaderNodeVectorMath',
      undefined,
      undefined,
      { operation },
    );
  }

  /**
   * Bernoulli trial: returns a boolean output with given probability.
   * Creates a RandomValue node with BOOLEAN data type.
   */
  bernoulli(prob: number, seed?: number): NodeInstance {
    if (seed === undefined) {
      seed = Math.floor(Math.random() * 1e5);
    }
    return this.newNode(
      'FunctionNodeRandomValue',
      `bernoulli_${this.nodeCounter}`,
      undefined,
      {
        data_type: 'BOOLEAN',
        Probability: prob,
        Seed: seed,
      },
    );
  }

  /**
   * Uniform random value in [low, high] range.
   * Supports FLOAT and FLOAT_VECTOR data types.
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
    return this.newNode(
      'FunctionNodeRandomValue',
      `uniform_${this.nodeCounter}`,
      undefined,
      {
        data_type: dataType,
        Min: low,
        Max: high,
        Seed: seed,
      },
    );
  }

  /**
   * Build a float curve: maps input value through a curve defined by anchor points.
   * Each anchor is `[position, value]` where position and value are in [0, 1].
   */
  buildFloatCurve(
    x: unknown,
    anchors: [number, number][],
    handle: string = 'VECTOR',
  ): NodeInstance {
    const floatCurve = this.newNode(
      'ShaderNodeFloatCurve',
      `floatcurve_${this.nodeCounter}`,
      undefined,
      {
        Value: x,
        _anchors: anchors,
        _handle: handle,
      },
    );
    return floatCurve;
  }

  /**
   * Switch between two values based on a boolean condition.
   */
  switch(
    pred: unknown,
    trueVal: unknown,
    falseVal: unknown,
    inputType: string = 'FLOAT',
  ): NodeInstance {
    return this.newNode(
      'GeometryNodeSwitch',
      `switch_${this.nodeCounter}`,
      undefined,
      {
        input_type: inputType,
        Switch: pred,
        True: trueVal,
        False: falseVal,
      },
    );
  }

  /**
   * Vector switch between two vector values based on a boolean condition.
   */
  vectorSwitch(pred: unknown, trueVal: unknown, falseVal: unknown): NodeInstance {
    return this.switch(pred, trueVal, falseVal, 'VECTOR');
  }

  /**
   * Compare two values with a given operation.
   */
  compare(operation: string, nodeA: unknown, nodeB: unknown): NodeInstance {
    return this.newNode(
      'FunctionNodeCompare',
      undefined,
      undefined,
      { operation },
    );
  }

  /**
   * Compare direction between two vectors with angle threshold.
   */
  compareDirection(
    operation: string,
    a: unknown,
    b: unknown,
    angle: number,
  ): NodeInstance {
    return this.newNode(
      'FunctionNodeCompare',
      undefined,
      undefined,
      { data_type: 'VECTOR', mode: 'DIRECTION', operation },
    );
  }

  /**
   * Capture an attribute on geometry, returning `{ geometry, attribute }`.
   * This evaluates a field on the geometry and returns per-element values.
   */
  capture(
    geometry: unknown,
    attribute: unknown,
    attrs?: Record<string, unknown>,
  ): { geometry: NodeInstance; attribute: NodeInstance } {
    const captureNode = this.newNode(
      'GeometryNodeCaptureAttribute',
      `capture_${this.nodeCounter}`,
      undefined,
      {
        ...(attrs || {}),
        Geometry: geometry,
        Value: attribute,
      },
    );
    return {
      geometry: captureNode,
      attribute: captureNode,
    };
  }

  /**
   * Musgrave texture with automatic MapRange remapping from [-1, 1] to [0, 1].
   * Matches the Python `NodeWrangler.musgrave()` convenience method.
   */
  musgrave(scale: number = 10, vector?: unknown): NodeInstance {
    const musgraveNode = this.newNode(
      'ShaderNodeTexMusgrave',
      `musgrave_${this.nodeCounter}`,
      undefined,
      { Scale: scale },
    );
    if (vector !== undefined) {
      this.setInputValue(musgraveNode, 'Vector', vector);
    }

    // MapRange remaps [-1, 1] → [0, 1]
    const mapRange = this.newNode(
      'ShaderNodeMapRange',
      `maprange_${this.nodeCounter}`,
      undefined,
      {},
    );
    this.setInputValue(mapRange, 0, musgraveNode);   // value from musgrave
    this.setInputValue(mapRange, 'From Min', -1);
    this.setInputValue(mapRange, 'From Max', 1);
    this.setInputValue(mapRange, 'To Min', 0);
    this.setInputValue(mapRange, 'To Max', 1);

    return mapRange;
  }

  /**
   * Combine XYZ components into a vector.
   */
  combine(x: unknown, y: unknown, z: unknown): NodeInstance {
    return this.newNode('ShaderNodeCombineXYZ', `combine_${this.nodeCounter}`);
  }

  /**
   * Separate a vector into XYZ components.
   */
  separate(x: unknown): NodeInstance {
    return this.newNode('ShaderNodeSeparateXYZ', `separate_${this.nodeCounter}`);
  }

  /**
   * Convert a curve to mesh with optional profile curve, then set shade smooth off.
   */
  curve2mesh(curve: unknown, profileCurve?: unknown): NodeInstance {
    const curveToMesh = this.newNode(
      'GeometryNodeCurveToMesh',
      `curve2mesh_${this.nodeCounter}`,
    );
    if (profileCurve !== undefined) {
      this.setInputValue(curveToMesh, 'Profile Curve', profileCurve);
    }
    // Set shade smooth off
    const shadeSmooth = this.newNode(
      'GeometryNodeSetShadeSmooth',
      `shadesmooth_${this.nodeCounter}`,
    );
    this.setInputValue(shadeSmooth, 'Shade Smooth', false);
    return shadeSmooth;
  }

  /**
   * Build a case/switch statement based on index matching.
   */
  buildCase(
    value: unknown,
    inputs: unknown[],
    outputs: unknown[],
    inputType: string = 'FLOAT',
  ): unknown {
    let node = outputs[outputs.length - 1];
    for (let i = 0; i < inputs.length - 1; i++) {
      node = this.switch(
        this.compare('EQUAL', value, inputs[i]),
        outputs[i],
        node,
        inputType,
      );
    }
    return node;
  }

  /**
   * Build an index-based case: switch on the Index node.
   */
  buildIndexCase(inputs: unknown[]): unknown {
    const indexNode = this.newNode('GeometryNodeInputIndex', `index_${this.nodeCounter}`);
    return this.buildCase(
      indexNode,
      [...inputs, -1],
      [...Array(inputs.length).fill(true), false],
    );
  }

  // ===========================================================================
  // Query / Find
  // ===========================================================================

  /**
   * Find nodes by type name or display name in the active group.
   */
  find(name: string): NodeInstance[] {
    const group = this.getActiveGroup();
    return Array.from(group.nodes.values()).filter(
      n => String(n.type).includes(name) || n.name.includes(name),
    );
  }

  /**
   * Find nodes recursively, including within nested node groups.
   */
  findRecursive(name: string): { wrangler: NodeWrangler; node: NodeInstance }[] {
    const results: { wrangler: NodeWrangler; node: NodeInstance }[] = [];
    // Search in current group
    for (const node of this.find(name)) {
      results.push({ wrangler: this, node });
    }
    // Search in sub-groups
    for (const [groupId, group] of this.nodeGroups.entries()) {
      if (groupId === this.activeGroup) continue;
      for (const node of group.nodes.values()) {
        if (String(node.type).includes(name) || node.name.includes(name)) {
          results.push({ wrangler: this, node });
        }
      }
    }
    return results;
  }

  /**
   * Find links coming into a specific socket name.
   */
  findFrom(toSocketName: string, toNodeId?: string): NodeLink[] {
    const group = this.getActiveGroup();
    const result: NodeLink[] = [];
    for (const link of group.links.values()) {
      if (link.toSocket === toSocketName) {
        if (!toNodeId || link.toNode === toNodeId) {
          result.push(link);
        }
      }
    }
    return result;
  }

  /**
   * Find links going out from a specific socket name.
   */
  findTo(fromSocketName: string, fromNodeId?: string): NodeLink[] {
    const group = this.getActiveGroup();
    const result: NodeLink[] = [];
    for (const link of group.links.values()) {
      if (link.fromSocket === fromSocketName) {
        if (!fromNodeId || link.fromNode === fromNodeId) {
          result.push(link);
        }
      }
    }
    return result;
  }

  // ===========================================================================
  // Additional Convenience Methods
  // ===========================================================================

  /**
   * Create a new Value node with a given float value.
   */
  newValue(v: number, label?: string): NodeInstance {
    const node = this.newNode('ShaderNodeValue', label);
    this.setInputValue(node, 0, v);
    return node;
  }

  /**
   * Create a boolean math operation node.
   */
  booleanMath(operation: string, ...nodes: unknown[]): NodeInstance {
    return this.newNode(
      'FunctionNodeBooleanMath',
      undefined,
      undefined,
      { operation },
    );
  }

  /**
   * Power operation on two float inputs.
   */
  power(base: unknown, exponent: unknown): NodeInstance {
    return this.newNode(
      'ShaderNodeMath',
      undefined,
      undefined,
      { operation: 'POWER' },
    );
  }

  /**
   * Scalar max: maximum of two float values.
   */
  scalarMax(nodeA: unknown, nodeB: unknown): NodeInstance {
    return this.newNode(
      'ShaderNodeMath',
      undefined,
      undefined,
      { operation: 'MAXIMUM' },
    );
  }

  /**
   * Create a GroupInput node (singleton per group).
   */
  groupInput(): NodeInstance {
    const group = this.getActiveGroup();
    // Reuse existing GroupInput if one exists
    for (const node of group.nodes.values()) {
      if (String(node.type) === 'NodeGroupInput') {
        return node;
      }
    }
    return this.newNode('NodeGroupInput', 'Group Input');
  }

  // ===========================================================================
  // Python-style Convenience API (addNode / link / setInputValue / findNodesByType)
  // ===========================================================================

  /**
   * Add a node to the graph — convenience method matching the Python API.
   *
   * Accepts flexible parameter shapes:
   *   - `addNode(type, name?, location?)`
   *   - `addNode(type, name?, props?)`
   *   - `addNode(type, { x, y, ...props })`
   */
  addNode(
    nodeType: string,
    nameOrParams?: string | Record<string, unknown>,
    locationOrProps?: [number, number] | Record<string, unknown>,
  ): NodeInstance {
    let nodeName: string | undefined;
    let properties: Record<string, unknown> = {};
    let nodeLocation: [number, number] | undefined;

    if (typeof nameOrParams === 'string') {
      nodeName = nameOrParams;
      if (locationOrProps) {
        if (Array.isArray(locationOrProps)) {
          nodeLocation = locationOrProps as [number, number];
        } else if ('x' in locationOrProps && 'y' in locationOrProps) {
          nodeLocation = [locationOrProps.x as number, locationOrProps.y as number];
          const { x, y, ...rest } = locationOrProps;
          properties = rest;
        } else {
          properties = locationOrProps;
        }
      }
    } else if (nameOrParams) {
      const params = nameOrParams;
      if ('x' in params && 'y' in params) {
        nodeLocation = [params.x as number, params.y as number];
        const { x, y, ...rest } = params;
        properties = rest;
      } else {
        properties = params;
      }
    }

    const node = this.newNode(nodeType, nodeName, nodeLocation, properties);

    // Apply properties to node
    for (const [key, value] of Object.entries(properties)) {
      node.properties[key] = value;
    }

    return node;
  }

  /**
   * Link two node sockets together — convenience method matching the Python API.
   *
   * Socket references can be by name (string) or by index (number).
   */
  link(
    fromNode: string | NodeInstance,
    fromSocket: number | string,
    toNode: string | NodeInstance,
    toSocket: number | string,
  ): NodeLink {
    const fromNodeId = typeof fromNode === 'string' ? fromNode : fromNode.id;
    const toNodeId = typeof toNode === 'string' ? toNode : toNode.id;

    const group = this.getActiveGroup();
    const fromNodeInst = group.nodes.get(fromNodeId);
    const toNodeInst = group.nodes.get(toNodeId);

    if (!fromNodeInst) {
      throw new Error(`Source node "${fromNodeId}" not found`);
    }
    if (!toNodeInst) {
      throw new Error(`Target node "${toNodeId}" not found`);
    }

    const fromSocketName = this.resolveSocketName(fromNodeInst.outputs, fromSocket, 'output');
    const toSocketName = this.resolveSocketName(toNodeInst.inputs, toSocket, 'input');

    return this.connect(fromNodeId, fromSocketName, toNodeId, toSocketName);
  }

  /**
   * Set the value of a node input. Creates the socket if it does not exist.
   */
  setInputValue(
    node: string | NodeInstance,
    inputIndex: number | string,
    value: unknown,
  ): void {
    const nodeId = typeof node === 'string' ? node : node.id;
    const group = this.getActiveGroup();
    const nodeInst = group.nodes.get(nodeId);

    if (!nodeInst) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    const socketName = this.resolveSocketName(nodeInst.inputs, inputIndex, 'input');
    const socket = nodeInst.inputs.get(socketName);
    if (socket) {
      socket.value = value;
    } else {
      // Create the socket if it doesn't exist
      nodeInst.inputs.set(socketName, {
        id: `${nodeId}_in_${socketName}`,
        name: socketName,
        type: SocketType.VALUE,
        value,
        isInput: true,
      });
    }
  }

  /**
   * Find all nodes of a given type in the active group.
   */
  findNodesByType(type: string): NodeInstance[] {
    const group = this.getActiveGroup();
    const typeStr = typeof type === 'string' ? type : String(type);
    const results: NodeInstance[] = [];

    for (const node of group.nodes.values()) {
      if (node.type === typeStr || String(node.type) === typeStr) {
        results.push(node);
      }
    }

    return results;
  }

  // ===========================================================================
  // Evaluation Engine
  // ===========================================================================

  /**
   * Perform topological sort of the nodes in the active group.
   *
   * Returns an ordered array of node IDs such that all dependencies come
   * before dependents. Uses Kahn's algorithm (BFS-based).
   *
   * @throws If a cycle is detected.
   */
  topologicalSort(group?: NodeGroup): string[] {
    const g = group || this.getActiveGroup();
    const nodes = Array.from(g.nodes.keys());

    const inDegree = new Map<string, number>();
    const dependents = new Map<string, Set<string>>();

    for (const nodeId of nodes) {
      inDegree.set(nodeId, 0);
      dependents.set(nodeId, new Set());
    }

    for (const link of g.links.values()) {
      inDegree.set(link.toNode, (inDegree.get(link.toNode) || 0) + 1);
      dependents.get(link.fromNode)?.add(link.toNode);
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      order.push(nodeId);

      for (const depId of dependents.get(nodeId) || []) {
        const newDegree = (inDegree.get(depId) || 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }

    if (order.length !== nodes.length) {
      const cycleNodes = nodes.filter(n => !order.includes(n));
      throw new Error(`Cycle detected in node graph involving nodes: ${cycleNodes.join(', ')}`);
    }

    return order;
  }

  /**
   * Evaluate the entire node graph.
   *
   * Performs a topological sort, then executes each node in order,
   * passing resolved input values through connections. Execution is
   * delegated to the `ExecutorRegistry`.
   *
   * @returns Map of nodeId → output values (socket name → value)
   */
  evaluate(group?: NodeGroup): Map<string, Record<string, unknown>> {
    const g = group || this.getActiveGroup();
    const order = this.topologicalSort(g);
    const results = new Map<string, Record<string, unknown>>();

    for (const nodeId of order) {
      const node = g.nodes.get(nodeId);
      if (!node) continue;

      // Resolve input values: either from connected outputs or from socket defaults
      const inputValues: Record<string, unknown> = {};

      for (const [socketName, socket] of node.inputs.entries()) {
        let resolved = false;
        for (const link of g.links.values()) {
          if (link.toNode === nodeId && link.toSocket === socketName) {
            const sourceResults = results.get(link.fromNode);
            if (sourceResults && link.fromSocket in sourceResults) {
              inputValues[socketName] = sourceResults[link.fromSocket];
              resolved = true;
            }
            break;
          }
        }

        if (!resolved) {
          inputValues[socketName] = socket.value ?? socket.defaultValue ?? socket.default;
        }
      }

      // Execute via ExecutorRegistry
      const context: ExecutorContext = {
        settings: node.properties as Record<string, any>,
        node,
      };

      const executor = getExecutor(String(node.type));
      if (executor) {
        try {
          const outputValues = executor(inputValues, context);
          results.set(nodeId, outputValues);
        } catch (err) {
          console.warn(
            `[NodeWrangler] Error executing node ${nodeId} (type=${node.type}):`,
            err,
          );
          results.set(nodeId, {});
        }
      } else {
        // Default behaviour: pass through inputs to outputs
        const outputValues: Record<string, unknown> = {};
        for (const [outName] of node.outputs.entries()) {
          if (outName in inputValues) {
            outputValues[outName] = inputValues[outName];
          } else {
            outputValues[outName] = node.properties[outName] ?? null;
          }
        }
        results.set(nodeId, outputValues);
      }
    }

    return results;
  }

  /**
   * Get the final output of the node graph.
   *
   * Finds the "output" node (GroupOutput or similar) and returns its
   * input values. If no output node is found, returns the outputs of
   * the last node in topological order.
   */
  getOutput(group?: NodeGroup): Record<string, unknown> {
    const g = group || this.getActiveGroup();
    const results = this.evaluate(g);

    // Look for GroupOutput node
    for (const [nodeId, node] of g.nodes.entries()) {
      if (
        String(node.type) === 'NodeGroupOutput' ||
        String(node.type) === 'GroupOutput' ||
        node.name === 'Group Output' ||
        node.name === 'Output'
      ) {
        const outputValues: Record<string, unknown> = {};
        for (const [socketName] of node.inputs.entries()) {
          for (const link of g.links.values()) {
            if (link.toNode === nodeId && link.toSocket === socketName) {
              const sourceResults = results.get(link.fromNode);
              if (sourceResults && link.fromSocket in sourceResults) {
                outputValues[socketName] = sourceResults[link.fromSocket];
              }
              break;
            }
          }
        }
        return outputValues;
      }
    }

    // Fallback: return the outputs of the last node in topological order
    const order = this.topologicalSort(g);
    if (order.length === 0) return {};

    const lastNodeId = order[order.length - 1];
    return results.get(lastNodeId) || {};
  }

  /**
   * Evaluate the node graph per-vertex for the given geometry.
   *
   * Unlike the scalar `evaluate()` which produces a single value per node,
   * this produces an `AttributeStream` per node output — one value per vertex.
   * The result is a new `GeometryContext` with per-vertex attributes applied.
   */
  evaluatePerVertex(
    geometry: import('./core/geometry-context').GeometryContext,
  ): import('./core/geometry-context').GeometryContext {
    // Lazy import to avoid circular dependency at module load time.
    // PerVertexEvaluator imports NodeWrangler, so we cannot use a static import.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PvE = require('./core/per-vertex-evaluator').PerVertexEvaluator as typeof import('./core/per-vertex-evaluator').PerVertexEvaluator;
    const evaluator = new PvE(this as any);
    return evaluator.evaluate(geometry);
  }

  // ===========================================================================
  // Serialisation
  // ===========================================================================

  /**
   * Export the node graph to a JSON string.
   *
   * Maps are serialised as arrays of `[key, value]` pairs so they can be
   * faithfully reconstructed by `fromJSON()`.
   */
  toJSON(): string {
    const data = {
      groups: Array.from(this.nodeGroups.entries()).map(([id, group]) => ({
        id,
        name: group.name,
        parent: group.parent,
        nodes: Array.from(group.nodes.entries()).map(([nid, node]) => ({
          id: nid,
          type: node.type,
          name: node.name,
          location: node.location,
          properties: node.properties,
          hidden: node.hidden,
          muted: node.muted,
          parent: node.parent,
          inputs: Array.from(node.inputs.entries()).map(([name, socket]) => ({
            name,
            type: socket.type,
            value: socket.value,
            defaultValue: socket.defaultValue,
            connectedTo: socket.connectedTo,
            isInput: socket.isInput,
          })),
          outputs: Array.from(node.outputs.entries()).map(([name, socket]) => ({
            name,
            type: socket.type,
            connectedTo: socket.connectedTo,
            isInput: socket.isInput,
          })),
        })),
        links: Array.from(group.links.values()),
        inputs: Array.from(group.inputs.entries()).map(([name, socket]) => ({
          name,
          type: socket.type,
          value: socket.value,
          isInput: socket.isInput,
        })),
        outputs: Array.from(group.outputs.entries()).map(([name, socket]) => ({
          name,
          type: socket.type,
          isInput: socket.isInput,
        })),
      })),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import a node graph from a JSON string.
   *
   * Validates the structure, then reconstructs all `NodeGroup`, `NodeInstance`,
   * `NodeSocket`, and `NodeLink` objects — converting serialised arrays back
   * into `Map` instances.
   *
   * @throws If the JSON is malformed or the structure is invalid.
   */
  static fromJSON(json: string): NodeWrangler {
    let data: any;
    try {
      data = JSON.parse(json);
    } catch (err) {
      throw new Error(
        `NodeWrangler.fromJSON: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!data || typeof data !== 'object') {
      throw new Error('NodeWrangler.fromJSON: parsed value is not an object');
    }

    if (!Array.isArray(data.groups)) {
      throw new Error('NodeWrangler.fromJSON: expected "groups" array');
    }

    const wrangler = new NodeWrangler();
    // Clear the default root group so we can rebuild from the serialised data
    wrangler.nodeGroups.clear();

    // Track the highest node and link counters so new IDs don't collide
    let maxNodeCounter = 0;
    let maxLinkCounter = 0;

    for (const groupData of data.groups) {
      if (!groupData || typeof groupData !== 'object') {
        throw new Error('NodeWrangler.fromJSON: invalid group entry');
      }

      // ---- Rebuild nodes ----
      const nodesMap = new Map<string, NodeInstance>();
      if (Array.isArray(groupData.nodes)) {
        for (const [nid, nodeData] of groupData.nodes) {
          if (!nodeData || typeof nodeData !== 'object') continue;

          // Rebuild input sockets
          const inputsMap = new Map<string, NodeSocket>();
          if (Array.isArray(nodeData.inputs)) {
            for (const sockData of nodeData.inputs) {
              if (!sockData || typeof sockData !== 'object') continue;
              const socket: NodeSocket = {
                id: sockData.id ?? `${nid}_in_${sockData.name}`,
                name: String(sockData.name),
                type: sockData.type as SocketType,
                value: sockData.value,
                defaultValue: sockData.defaultValue,
                connectedTo: sockData.connectedTo,
                isInput: sockData.isInput ?? true,
              };
              inputsMap.set(socket.name, socket);
            }
          }

          // Rebuild output sockets
          const outputsMap = new Map<string, NodeSocket>();
          if (Array.isArray(nodeData.outputs)) {
            for (const sockData of nodeData.outputs) {
              if (!sockData || typeof sockData !== 'object') continue;
              const socket: NodeSocket = {
                id: sockData.id ?? `${nid}_out_${sockData.name}`,
                name: String(sockData.name),
                type: sockData.type as SocketType,
                connectedTo: sockData.connectedTo,
                isInput: sockData.isInput ?? false,
              };
              outputsMap.set(socket.name, socket);
            }
          }

          // Resolve the type through the registry
          const resolvedType = resolveNodeType(String(nodeData.type));

          const node: NodeInstance = {
            id: String(nid),
            type: resolvedType,
            name: String(nodeData.name ?? ''),
            location: nodeData.location ?? [0, 0],
            inputs: inputsMap,
            outputs: outputsMap,
            properties: nodeData.properties ?? {},
            hidden: nodeData.hidden,
            muted: nodeData.muted,
            parent: nodeData.parent,
          };
          nodesMap.set(node.id, node);

          // Track counters
          const nodeNum = parseInt(String(nid).replace('node_', ''), 10);
          if (!isNaN(nodeNum) && nodeNum >= maxNodeCounter) {
            maxNodeCounter = nodeNum + 1;
          }
        }
      }

      // ---- Rebuild links ----
      const linksMap = new Map<string, NodeLink>();
      if (Array.isArray(groupData.links)) {
        for (const linkData of groupData.links) {
          if (!linkData || typeof linkData !== 'object') continue;
          const link: NodeLink = {
            id: String(linkData.id),
            fromNode: String(linkData.fromNode),
            fromSocket: String(linkData.fromSocket),
            toNode: String(linkData.toNode),
            toSocket: String(linkData.toSocket),
          };
          linksMap.set(link.id, link);

          const linkNum = parseInt(String(linkData.id).replace('link_', ''), 10);
          if (!isNaN(linkNum) && linkNum >= maxLinkCounter) {
            maxLinkCounter = linkNum + 1;
          }
        }
      }

      // ---- Rebuild group-level input/output sockets ----
      const groupInputsMap = new Map<string, NodeSocket>();
      if (Array.isArray(groupData.inputs)) {
        for (const sockData of groupData.inputs) {
          if (!sockData || typeof sockData !== 'object') continue;
          const socket: NodeSocket = {
            id: sockData.id ?? `group_input_${sockData.name}`,
            name: String(sockData.name),
            type: sockData.type as SocketType,
            value: sockData.value,
            isInput: sockData.isInput ?? true,
          };
          groupInputsMap.set(socket.name, socket);
        }
      }

      const groupOutputsMap = new Map<string, NodeSocket>();
      if (Array.isArray(groupData.outputs)) {
        for (const sockData of groupData.outputs) {
          if (!sockData || typeof sockData !== 'object') continue;
          const socket: NodeSocket = {
            id: sockData.id ?? `group_output_${sockData.name}`,
            name: String(sockData.name),
            type: sockData.type as SocketType,
            isInput: sockData.isInput ?? false,
          };
          groupOutputsMap.set(socket.name, socket);
        }
      }

      // ---- Assemble NodeGroup ----
      const group: NodeGroup = {
        id: String(groupData.id),
        name: String(groupData.name ?? ''),
        nodes: nodesMap,
        links: linksMap,
        inputs: groupInputsMap,
        outputs: groupOutputsMap,
        parent: groupData.parent,
      };
      wrangler.nodeGroups.set(group.id, group);
    }

    // Set the active group to the first group (typically "root")
    if (wrangler.nodeGroups.size > 0) {
      wrangler.activeGroup = wrangler.nodeGroups.keys().next().value!;
    }

    // Restore counters so subsequent IDs don't collide
    wrangler.nodeCounter = maxNodeCounter;
    wrangler.linkCounter = maxLinkCounter;

    return wrangler;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Get a node definition from the central registry.
   * Falls back to an empty definition for unregistered types.
   */
  private getNodeDefinition(type: string): ResolvedNodeDefinition {
    const entry = nodeDefinitionRegistry.get(type);
    if (entry) {
      return {
        type,
        inputs: entry.inputs,
        outputs: entry.outputs,
        properties: entry.properties
          ? Object.fromEntries(
              Object.entries(entry.properties).map(([k, v]) => [k, v.default]),
            )
          : undefined,
      };
    }
    // Fallback for unregistered types
    return { type, inputs: [], outputs: [] };
  }

  /**
   * Resolve a socket identifier (index or name) to a socket name.
   */
  private resolveSocketName(
    sockets: Map<string, NodeSocket>,
    socketRef: number | string,
    direction: 'input' | 'output',
  ): string {
    if (typeof socketRef === 'string') {
      if (sockets.has(socketRef)) {
        return socketRef;
      }
      // Try as a numeric index passed as string
      const numIdx = parseInt(socketRef, 10);
      if (!isNaN(numIdx)) {
        return this.getSocketByIndex(sockets, numIdx);
      }
      return socketRef;
    }
    return this.getSocketByIndex(sockets, socketRef);
  }

  /**
   * Get a socket name by its numeric index in the map.
   */
  private getSocketByIndex(sockets: Map<string, NodeSocket>, index: number): string {
    const keys = Array.from(sockets.keys());
    if (index >= 0 && index < keys.length) {
      return keys[index];
    }
    return String(index);
  }
}
