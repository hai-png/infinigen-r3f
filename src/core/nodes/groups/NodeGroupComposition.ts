/**
 * Node Group Composition — Deep Nesting, Parameterization & Reuse API
 *
 * Provides a comprehensive system for creating, parameterizing, nesting,
 * instantiating, and serializing node groups. This extends the existing
 * NodeGroupComposability with true composability:
 *
 * - **Deep nesting**: Groups can contain other groups (recursively)
 * - **Group parameterization**: Exposed inputs act as configurable parameters
 * - **Group instantiation**: Reuse a definition with different parameter values
 * - **Serialization/deserialization**: Persist and restore group definitions
 *
 * Architecture:
 * - NodeGroupDefinition: A reusable blueprint (like a class)
 * - NodeGroupInstance: A concrete usage with parameter overrides (like an object)
 * - GroupCompositionEngine: Registry, factory, and composition orchestrator
 * - GroupSerializer: JSON round-trip for definitions and instances
 * - PrebuiltGroupLibrary: Common parameterizable groups (noise, PBR, etc.)
 *
 * @module nodes/groups/NodeGroupComposition
 */

import * as THREE from 'three';

// ============================================================================
// GroupSocket — Socket descriptor for group interfaces
// ============================================================================

/**
 * Describes an input or output socket on a node group's interface.
 * Carries type information, default value, and range constraints
 * for numeric types — matching Blender's node group socket model.
 */
export interface GroupSocket {
  /** Socket display name (unique within its direction on the group) */
  name: string;
  /** Data type carried by this socket */
  type: 'float' | 'color' | 'vector' | 'shader' | 'geometry';
  /** Default value when no external connection or override is provided */
  defaultValue: unknown;
  /** Minimum value for float/numeric types */
  min?: number;
  /** Maximum value for float/numeric types */
  max?: number;
}

// ============================================================================
// InternalNode — Lightweight node descriptor inside a definition
// ============================================================================

/**
 * Represents a node inside a group definition.
 * Can be either a primitive node (noise, math, etc.) or a nested
 * group reference (identified by `groupDefinitionId`).
 */
export interface InternalNode {
  /** Unique ID within this group definition */
  id: string;
  /** Human-readable label */
  name: string;
  /** Node type identifier (e.g. 'NoiseTexture', 'Math') */
  nodeType: string;
  /** If this node is a nested group, the referenced definition ID */
  groupDefinitionId?: string;
  /** Per-socket default values (socket name → value) */
  socketDefaults: Record<string, unknown>;
}

// ============================================================================
// InternalConnection — A link between two internal nodes
// ============================================================================

/**
 * A directed connection from one internal node's output socket
 * to another internal node's input socket.
 */
export interface InternalConnection {
  /** Source node ID */
  fromNode: string;
  /** Source output socket name */
  fromSocket: string;
  /** Target node ID */
  toNode: string;
  /** Target input socket name */
  toSocket: string;
}

// ============================================================================
// ExposedMapping — Maps an exposed socket to an internal node socket
// ============================================================================

/**
 * Associates an exposed group input/output with the internal
 * node socket it connects to.
 */
export interface ExposedMapping {
  /** The exposed socket name on the group interface */
  exposedName: string;
  /** Internal node ID */
  internalNode: string;
  /** Internal socket name on that node */
  internalSocket: string;
}

// ============================================================================
// NodeGroupDefinition — Reusable, parameterizable node group blueprint
// ============================================================================

/**
 * A reusable, parameterizable node group definition.
 *
 * Think of this as a *class*: it declares the interface (inputs/outputs),
 * the internal node graph (nodes + connections), and the mappings from
 * exposed sockets to internal sockets. Multiple instances can be created
 * from a single definition with different parameter overrides.
 *
 * Definitions can also contain nested group references — an InternalNode
 * whose `groupDefinitionId` points to another registered definition.
 *
 * @example
 * ```typescript
 * const noiseDef = new NodeGroupDefinition('noise_1', 'Noise');
 * noiseDef.addNode({ id: 'n0', name: 'Noise', nodeType: 'NoiseTexture', socketDefaults: { Scale: 5.0 } });
 * noiseDef.exposeInput('n0', 'Scale', 'Scale', 5.0);
 * noiseDef.exposeOutput('n0', 'Fac', 'Fac');
 * ```
 */
export class NodeGroupDefinition {
  /** Unique definition identifier */
  readonly id: string;
  /** Human-readable name */
  name: string;
  /** Exposed input sockets */
  readonly inputSockets: Map<string, GroupSocket>;
  /** Exposed output sockets */
  readonly outputSockets: Map<string, GroupSocket>;
  /** Internal nodes (id → node) */
  readonly nodes: Map<string, InternalNode>;
  /** Internal connections */
  connections: InternalConnection[];
  /** Input exposure mappings (exposedName → mapping) */
  readonly inputMappings: Map<string, ExposedMapping>;
  /** Output exposure mappings (exposedName → mapping) */
  readonly outputMappings: Map<string, ExposedMapping>;

  /** Counter for generating unique node IDs (accessible to GroupCompositionEngine) */
  nextNodeId: number = 0;

  /**
   * @param id - Unique identifier for this definition.
   * @param name - Display name.
   * @param _inputSockets - Optional initial input socket descriptors.
   * @param _outputSockets - Optional initial output socket descriptors.
   */
  constructor(
    id: string,
    name: string,
    _inputSockets: GroupSocket[] = [],
    _outputSockets: GroupSocket[] = [],
  ) {
    this.id = id;
    this.name = name;
    this.inputSockets = new Map(_inputSockets.map(s => [s.name, s]));
    this.outputSockets = new Map(_outputSockets.map(s => [s.name, s]));
    this.nodes = new Map();
    this.connections = [];
    this.inputMappings = new Map();
    this.outputMappings = new Map();
  }

  // ── Node management ───────────────────────────────────────────────────

  /**
   * Add an internal node to this group definition.
   *
   * @param node - The internal node descriptor. If `node.id` is empty,
   *               a unique ID will be generated.
   * @returns The node with its resolved ID.
   */
  addNode(node: InternalNode): InternalNode {
    if (!node.id) {
      node.id = `nd_${this.id}_${this.nextNodeId++}`;
    }
    this.nodes.set(node.id, node);
    return node;
  }

  /**
   * Remove an internal node and any connections involving it.
   *
   * @param nodeId - The node ID to remove.
   * @returns True if the node was found and removed.
   */
  removeNode(nodeId: string): boolean {
    if (!this.nodes.has(nodeId)) return false;
    this.nodes.delete(nodeId);
    // Remove connections involving this node
    this.connections = this.connections.filter(
      c => c.fromNode !== nodeId && c.toNode !== nodeId,
    );
    // Remove exposure mappings referencing this node
    for (const [key, m] of this.inputMappings) {
      if (m.internalNode === nodeId) this.inputMappings.delete(key);
    }
    for (const [key, m] of this.outputMappings) {
      if (m.internalNode === nodeId) this.outputMappings.delete(key);
    }
    return true;
  }

  // ── Connection management ─────────────────────────────────────────────

  /**
   * Add a directed connection between two internal nodes.
   *
   * @param fromNode - Source node ID.
   * @param fromSocket - Source output socket name.
   * @param toNode - Target node ID.
   * @param toSocket - Target input socket name.
   * @throws If either node does not exist in the definition.
   */
  addConnection(
    fromNode: string,
    fromSocket: string,
    toNode: string,
    toSocket: string,
  ): void {
    if (!this.nodes.has(fromNode)) {
      throw new Error(
        `[NodeGroupDefinition] Cannot add connection: source node "${fromNode}" not found.`,
      );
    }
    if (!this.nodes.has(toNode)) {
      throw new Error(
        `[NodeGroupDefinition] Cannot add connection: target node "${toNode}" not found.`,
      );
    }
    this.connections.push({ fromNode, fromSocket, toNode, toSocket });
  }

  /**
   * Remove a specific connection.
   *
   * @param fromNode - Source node ID.
   * @param fromSocket - Source output socket name.
   * @param toNode - Target node ID.
   * @param toSocket - Target input socket name.
   * @returns True if the connection existed and was removed.
   */
  removeConnection(
    fromNode: string,
    fromSocket: string,
    toNode: string,
    toSocket: string,
  ): boolean {
    const idx = this.connections.findIndex(
      c =>
        c.fromNode === fromNode &&
        c.fromSocket === fromSocket &&
        c.toNode === toNode &&
        c.toSocket === toSocket,
    );
    if (idx < 0) return false;
    this.connections.splice(idx, 1);
    return true;
  }

  // ── Socket exposure ───────────────────────────────────────────────────

  /**
   * Expose an internal node's input socket as a group input.
   *
   * @param internalNode - ID of the internal node.
   * @param internalSocket - Name of the input socket on that node.
   * @param exposedName - Name to give the exposed group input.
   * @param defaultValue - Default value for the exposed input.
   * @param min - Optional minimum for numeric types.
   * @param max - Optional maximum for numeric types.
   */
  exposeInput(
    internalNode: string,
    internalSocket: string,
    exposedName: string,
    defaultValue: unknown = undefined,
    min?: number,
    max?: number,
  ): void {
    if (!this.nodes.has(internalNode)) {
      throw new Error(
        `[NodeGroupDefinition] Cannot expose input: node "${internalNode}" not found.`,
      );
    }
    const socketType = this.inferSocketType(defaultValue);
    this.inputSockets.set(exposedName, {
      name: exposedName,
      type: socketType,
      defaultValue,
      min,
      max,
    });
    this.inputMappings.set(exposedName, {
      exposedName,
      internalNode,
      internalSocket,
    });
  }

  /**
   * Expose an internal node's output socket as a group output.
   *
   * @param internalNode - ID of the internal node.
   * @param internalSocket - Name of the output socket on that node.
   * @param exposedName - Name to give the exposed group output.
   */
  exposeOutput(
    internalNode: string,
    internalSocket: string,
    exposedName: string,
  ): void {
    if (!this.nodes.has(internalNode)) {
      throw new Error(
        `[NodeGroupDefinition] Cannot expose output: node "${internalNode}" not found.`,
      );
    }
    const socketType: GroupSocket['type'] = 'float'; // default; can be overridden
    this.outputSockets.set(exposedName, {
      name: exposedName,
      type: socketType,
      defaultValue: undefined,
    });
    this.outputMappings.set(exposedName, {
      exposedName,
      internalNode,
      internalSocket,
    });
  }

  /**
   * Override the type of an existing exposed output socket.
   * Useful when the type cannot be inferred from the default value.
   */
  setOutputType(exposedName: string, type: GroupSocket['type']): void {
    const socket = this.outputSockets.get(exposedName);
    if (socket) {
      socket.type = type;
    }
  }

  // ── Default value management ──────────────────────────────────────────

  /**
   * Set the default value for an exposed input.
   *
   * @param inputName - The exposed input name.
   * @param value - The new default value.
   * @throws If the input does not exist.
   */
  setDefaultValue(inputName: string, value: unknown): void {
    const socket = this.inputSockets.get(inputName);
    if (!socket) {
      throw new Error(
        `[NodeGroupDefinition] Input "${inputName}" not found on "${this.name}".`,
      );
    }
    socket.defaultValue = value;
    socket.type = this.inferSocketType(value);
  }

  // ── Validation ────────────────────────────────────────────────────────

  /**
   * Validate this definition for structural correctness.
   *
   * Checks:
   * 1. No cycles in the internal node graph
   * 2. All exposed mappings reference existing internal nodes
   * 3. All connections reference existing nodes
   * 4. Type consistency for exposed mappings (best-effort)
   *
   * @returns An object with `valid` flag and an array of error messages.
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Check all connections reference existing nodes
    for (const conn of this.connections) {
      if (!this.nodes.has(conn.fromNode)) {
        errors.push(
          `Connection references non-existent source node "${conn.fromNode}".`,
        );
      }
      if (!this.nodes.has(conn.toNode)) {
        errors.push(
          `Connection references non-existent target node "${conn.toNode}".`,
        );
      }
    }

    // 2. Check exposed mappings reference existing nodes
    for (const [name, mapping] of this.inputMappings) {
      if (!this.nodes.has(mapping.internalNode)) {
        errors.push(
          `Input exposure "${name}" references non-existent node "${mapping.internalNode}".`,
        );
      }
    }
    for (const [name, mapping] of this.outputMappings) {
      if (!this.nodes.has(mapping.internalNode)) {
        errors.push(
          `Output exposure "${name}" references non-existent node "${mapping.internalNode}".`,
        );
      }
    }

    // 3. Cycle detection via DFS
    if (this.detectCycle()) {
      errors.push('Cycle detected in internal node graph.');
    }

    // 4. Check all exposed inputs have mappings
    for (const name of this.inputSockets.keys()) {
      if (!this.inputMappings.has(name)) {
        errors.push(`Input socket "${name}" has no internal mapping.`);
      }
    }
    for (const name of this.outputSockets.keys()) {
      if (!this.outputMappings.has(name)) {
        errors.push(`Output socket "${name}" has no internal mapping.`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * Infer a GroupSocket type from a default value.
   */
  private inferSocketType(value: unknown): GroupSocket['type'] {
    if (value === undefined || value === null) return 'float';
    if (typeof value === 'number') return 'float';
    if (value instanceof THREE.Color) return 'color';
    if (value instanceof THREE.Vector3) return 'vector';
    if (Array.isArray(value)) {
      if (value.length === 3 && value.every(v => typeof v === 'number')) {
        return 'color'; // Could be color or vector; default to color
      }
      if (value.length === 4 && value.every(v => typeof v === 'number')) {
        return 'color';
      }
    }
    return 'float';
  }

  /**
   * Detect cycles in the internal node graph using DFS.
   */
  private detectCycle(): boolean {
    const adj = new Map<string, string[]>();
    for (const nodeId of this.nodes.keys()) {
      adj.set(nodeId, []);
    }
    for (const conn of this.connections) {
      const list = adj.get(conn.fromNode);
      if (list) list.push(conn.toNode);
    }

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const nodeId of this.nodes.keys()) {
      color.set(nodeId, WHITE);
    }

    const dfs = (nodeId: string): boolean => {
      color.set(nodeId, GRAY);
      const neighbors = adj.get(nodeId) || [];
      for (const nb of neighbors) {
        const c = color.get(nb);
        if (c === GRAY) return true; // back-edge → cycle
        if (c === WHITE && dfs(nb)) return true;
      }
      color.set(nodeId, BLACK);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (color.get(nodeId) === WHITE) {
        if (dfs(nodeId)) return true;
      }
    }
    return false;
  }
}

// ============================================================================
// NodeGroupInstance — A concrete instance with parameter overrides
// ============================================================================

/**
 * An instantiated node group with specific parameter values.
 *
 * References a NodeGroupDefinition and stores per-instance overrides
 * for any exposed inputs. Can be evaluated to produce output values.
 *
 * @example
 * ```typescript
 * const inst = new NodeGroupInstance(noiseDef, { Scale: 10.0, Detail: 6.0 });
 * const outputs = inst.evaluate();
 * ```
 */
export class NodeGroupInstance {
  /** Reference to the group definition */
  readonly definition: NodeGroupDefinition;
  /** Per-instance parameter overrides (input name → value) */
  readonly parameterOverrides: Map<string, unknown>;
  /** Cached output values (invalidated on parameter change) */
  private cachedOutputs: Map<string, unknown> | null = null;

  /**
   * @param definition - The group definition this is an instance of.
   * @param parameterOverrides - Initial parameter overrides.
   */
  constructor(
    definition: NodeGroupDefinition,
    parameterOverrides: Record<string, unknown> = {},
  ) {
    this.definition = definition;
    this.parameterOverrides = new Map(Object.entries(parameterOverrides));
  }

  /**
   * Override a default parameter value.
   *
   * @param name - Exposed input name.
   * @param value - Override value.
   * @throws If the input does not exist on the definition.
   */
  setParameter(name: string, value: unknown): void {
    if (!this.definition.inputSockets.has(name)) {
      throw new Error(
        `[NodeGroupInstance] Input "${name}" not found on definition "${this.definition.name}".`,
      );
    }
    this.parameterOverrides.set(name, value);
    this.cachedOutputs = null; // invalidate cache
  }

  /**
   * Get the resolved value for an input (override → default → undefined).
   */
  getParameterValue(name: string): unknown {
    if (this.parameterOverrides.has(name)) {
      return this.parameterOverrides.get(name);
    }
    return this.definition.inputSockets.get(name)?.defaultValue;
  }

  /**
   * Evaluate the group with current parameters.
   *
   * Resolves input values, propagates them through internal connections,
   * and returns a map of output name → computed value.
   *
   * @param context - Optional evaluation context (e.g. geometry, UVs).
   * @returns Map of output name → computed value.
   */
  evaluate(context?: Record<string, unknown>): Map<string, unknown> {
    if (this.cachedOutputs) return this.cachedOutputs;

    // Build resolved input values
    const resolvedInputs = new Map<string, unknown>();
    for (const [name, socket] of this.definition.inputSockets) {
      resolvedInputs.set(
        name,
        this.parameterOverrides.has(name)
          ? this.parameterOverrides.get(name)
          : socket.defaultValue,
      );
    }

    // Evaluate internal nodes in topological order
    const evalOrder = this.topologicalSortInternal();
    const nodeOutputs = new Map<string, Record<string, unknown>>();

    for (const nodeId of evalOrder) {
      const node = this.definition.nodes.get(nodeId)!;
      const inputs: Record<string, unknown> = {};

      // Gather input values from connections or defaults
      for (const conn of this.definition.connections) {
        if (conn.toNode === nodeId) {
          const srcOutputs = nodeOutputs.get(conn.fromNode);
          if (srcOutputs && conn.fromSocket in srcOutputs) {
            inputs[conn.toSocket] = srcOutputs[conn.fromSocket];
          }
        }
      }

      // Also gather values from exposed input mappings
      for (const [, mapping] of this.definition.inputMappings) {
        if (mapping.internalNode === nodeId) {
          const val = resolvedInputs.get(mapping.exposedName);
          if (val !== undefined) {
            inputs[mapping.internalSocket] = val;
          }
        }
      }

      // Fill missing inputs from socket defaults
      for (const [socketName, defaultVal] of Object.entries(
        node.socketDefaults,
      )) {
        if (!(socketName in inputs)) {
          inputs[socketName] = defaultVal;
        }
      }

      // Evaluate this node
      const outputs = this.evaluateNode(node, inputs, context);
      nodeOutputs.set(nodeId, outputs);
    }

    // Map internal outputs to exposed outputs
    const result = new Map<string, unknown>();
    for (const [exposedName, mapping] of this.definition.outputMappings) {
      const srcOutputs = nodeOutputs.get(mapping.internalNode);
      if (srcOutputs && mapping.internalSocket in srcOutputs) {
        result.set(exposedName, srcOutputs[mapping.internalSocket]);
      } else {
        result.set(exposedName, null);
      }
    }

    // If no output mappings, fall back to all output sockets
    if (result.size === 0) {
      for (const [name] of this.definition.outputSockets) {
        result.set(name, null);
      }
    }

    this.cachedOutputs = result;
    return result;
  }

  /**
   * Get all input sockets from the definition.
   */
  getInputSockets(): GroupSocket[] {
    return Array.from(this.definition.inputSockets.values());
  }

  /**
   * Get all output sockets from the definition.
   */
  getOutputSockets(): GroupSocket[] {
    return Array.from(this.definition.outputSockets.values());
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  /**
   * Topological sort of internal nodes (Kahn's algorithm).
   */
  private topologicalSortInternal(): string[] {
    const nodes = Array.from(this.definition.nodes.keys());
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const n of nodes) {
      inDegree.set(n, 0);
      adj.set(n, []);
    }
    for (const conn of this.definition.connections) {
      inDegree.set(conn.toNode, (inDegree.get(conn.toNode) ?? 0) + 1);
      adj.get(conn.fromNode)?.push(conn.toNode);
    }

    const queue: string[] = [];
    for (const [n, deg] of inDegree) {
      if (deg === 0) queue.push(n);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const n = queue.shift()!;
      order.push(n);
      for (const dep of adj.get(n) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) queue.push(dep);
      }
    }
    return order;
  }

  /**
   * Evaluate a single internal node.
   *
   * For primitive nodes, applies built-in evaluation logic.
   * For nested group references, recursively evaluates the child group.
   */
  private evaluateNode(
    node: InternalNode,
    inputs: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Record<string, unknown> {
    // If this is a nested group reference, evaluate recursively
    if (node.groupDefinitionId) {
      const engine = GroupCompositionEngine.getInstance();
      const childDef = engine.getDefinition(node.groupDefinitionId);
      if (childDef) {
        // Map inputs to child group's exposed inputs
        const childOverrides: Record<string, unknown> = {};
        for (const [exposedName] of childDef.inputSockets) {
          if (exposedName in inputs) {
            childOverrides[exposedName] = inputs[exposedName];
          }
        }
        const childInstance = new NodeGroupInstance(childDef, childOverrides);
        const childOutputs = childInstance.evaluate(context);
        const result: Record<string, unknown> = {};
        for (const [name, val] of childOutputs) {
          result[name] = val;
        }
        return result;
      }
    }

    // Built-in primitive node evaluation
    return this.evaluatePrimitiveNode(node, inputs, context);
  }

  /**
   * Evaluate a primitive (non-group) node based on its type.
   */
  private evaluatePrimitiveNode(
    node: InternalNode,
    inputs: Record<string, unknown>,
    _context?: Record<string, unknown>,
  ): Record<string, unknown> {
    const scale = Number(inputs['Scale'] ?? node.socketDefaults['Scale'] ?? 5);
    const detail = Number(inputs['Detail'] ?? node.socketDefaults['Detail'] ?? 2);
    const distortion = Number(inputs['Distortion'] ?? node.socketDefaults['Distortion'] ?? 0);
    const roughness = Number(inputs['Roughness'] ?? node.socketDefaults['Roughness'] ?? 0.5);
    const fac = Number(inputs['Fac'] ?? node.socketDefaults['Fac'] ?? 0.5);
    const amplitude = Number(inputs['Amplitude'] ?? node.socketDefaults['Amplitude'] ?? 1);
    const frequency = Number(inputs['Frequency'] ?? node.socketDefaults['Frequency'] ?? 1);

    switch (node.nodeType) {
      case 'NoiseTexture':
        return {
          Fac: this.simpleNoise(fac * scale, detail),
          Color: [
            this.simpleNoise(fac * scale * 0.9, detail),
            this.simpleNoise(fac * scale * 1.1, detail),
            this.simpleNoise(fac * scale * 1.3, detail),
          ],
        };

      case 'MusgraveTexture':
        return {
          Fac: this.fbmNoise(fac * scale, detail, roughness),
          Color: [0, 0, 0],
        };

      case 'VoronoiTexture':
        return {
          Distance: this.voronoiNoise(fac * scale),
          Color: [0, 0, 0],
        };

      case 'ColorRamp': {
        const stops = (inputs['Stops'] ??
          node.socketDefaults['Stops'] ??
          [
            { position: 0, color: [0, 0, 0] },
            { position: 1, color: [1, 1, 1] },
          ]) as Array<{ position: number; color: number[] }>;
        return { Color: this.sampleColorRamp(stops, fac), Fac: fac };
      }

      case 'Mix': {
        const mixFac = Number(inputs['Factor'] ?? node.socketDefaults['Factor'] ?? 0.5);
        const color1 = (inputs['Color1'] ?? node.socketDefaults['Color1'] ?? [1, 1, 1]) as number[];
        const color2 = (inputs['Color2'] ?? node.socketDefaults['Color2'] ?? [0, 0, 0]) as number[];
        return {
          Color: [
            color1[0] * (1 - mixFac) + color2[0] * mixFac,
            color1[1] * (1 - mixFac) + color2[1] * mixFac,
            color1[2] * (1 - mixFac) + color2[2] * mixFac,
          ],
        };
      }

      case 'Math': {
        const v1 = Number(inputs['Value'] ?? node.socketDefaults['Value'] ?? 0);
        const v2 = Number(inputs['Value_001'] ?? node.socketDefaults['Value_001'] ?? 0);
        const op = String(inputs['Operation'] ?? node.socketDefaults['Operation'] ?? 'ADD');
        let result: number;
        switch (op) {
          case 'ADD': result = v1 + v2; break;
          case 'MULTIPLY': result = v1 * v2; break;
          case 'SUBTRACT': result = v1 - v2; break;
          case 'DIVIDE': result = v2 !== 0 ? v1 / v2 : 0; break;
          case 'POWER': result = Math.pow(v1, v2); break;
          case 'MAXIMUM': result = Math.max(v1, v2); break;
          case 'MINIMUM': result = Math.min(v1, v2); break;
          case 'MODULO': result = v2 !== 0 ? v1 % v2 : 0; break;
          default: result = v1 + v2;
        }
        return { Value: result };
      }

      case 'Displacement': {
        const dispValue = amplitude * Math.sin(frequency * fac * Math.PI * 2);
        return {
          Displacement: dispValue,
          Vector: [0, dispValue, 0],
        };
      }

      case 'PrincipledBSDF': {
        const baseColor = (inputs['Base Color'] ?? node.socketDefaults['Base Color'] ?? [0.8, 0.8, 0.8]) as number[];
        const metal = Number(inputs['Metallic'] ?? node.socketDefaults['Metallic'] ?? 0);
        const rough = Number(inputs['Roughness'] ?? node.socketDefaults['Roughness'] ?? 0.5);
        return {
          BSDF: { baseColor, metallic: metal, roughness: rough },
          Color: baseColor,
        };
      }

      case 'NormalMap': {
        const strength = Number(inputs['Strength'] ?? node.socketDefaults['Strength'] ?? 1.0);
        return {
          Normal: [0, strength, 0],
        };
      }

      case 'Bump': {
        const height = Number(inputs['Height'] ?? node.socketDefaults['Height'] ?? 1.0);
        const str = Number(inputs['Strength'] ?? node.socketDefaults['Strength'] ?? 1.0);
        return {
          Normal: [0, height * str, 0],
        };
      }

      default:
        // Pass-through for unknown nodes
        return { ...inputs, Value: fac };
    }
  }

  // ── Procedural noise helpers ──────────────────────────────────────────

  /** Simple hash-based pseudo-random for noise evaluation */
  private simpleNoise(x: number, detail: number): number {
    let value = 0;
    let amp = 1;
    let freq = x;
    let totalAmp = 0;
    for (let i = 0; i < Math.min(detail, 8); i++) {
      value += amp * (Math.sin(freq * 12.9898 + 78.233) * 0.5 + 0.5);
      totalAmp += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return totalAmp > 0 ? value / totalAmp : 0;
  }

  /** FBM (Fractal Brownian Motion) noise */
  private fbmNoise(x: number, detail: number, roughness: number): number {
    let value = 0;
    let amp = 1;
    let freq = x;
    let totalAmp = 0;
    for (let i = 0; i < Math.min(detail, 8); i++) {
      value += amp * (Math.sin(freq * 17.31 + 43.75) * 0.5 + 0.5);
      totalAmp += amp;
      amp *= roughness;
      freq *= 2.0;
    }
    return totalAmp > 0 ? value / totalAmp : 0;
  }

  /** Simple Voronoi-like noise */
  private voronoiNoise(x: number): number {
    const cell = Math.floor(x);
    const frac = x - cell;
    const d1 = Math.abs(frac);
    const d2 = 1 - d1;
    return Math.min(d1, d2);
  }

  /** Sample a color ramp at the given factor */
  private sampleColorRamp(
    stops: Array<{ position: number; color: number[] }>,
    factor: number,
  ): number[] {
    if (stops.length === 0) return [0, 0, 0];
    if (stops.length === 1) return stops[0].color;
    const f = Math.max(0, Math.min(1, factor));
    for (let i = 0; i < stops.length - 1; i++) {
      if (f >= stops[i].position && f <= stops[i + 1].position) {
        const t =
          (f - stops[i].position) /
          (stops[i + 1].position - stops[i].position);
        return [
          stops[i].color[0] * (1 - t) + stops[i + 1].color[0] * t,
          stops[i].color[1] * (1 - t) + stops[i + 1].color[1] * t,
          stops[i].color[2] * (1 - t) + stops[i + 1].color[2] * t,
        ];
      }
    }
    return stops[stops.length - 1].color;
  }
}

// ============================================================================
// GroupCompositionEngine — Registry, factory, and composition orchestrator
// ============================================================================

/**
 * Manages group definitions, creates instances, composes (nests) groups,
 * and provides evaluation of potentially nested group graphs.
 *
 * Acts as a singleton registry for NodeGroupDefinitions and provides
 * the primary API for working with composable node groups.
 *
 * @example
 * ```typescript
 * const engine = GroupCompositionEngine.getInstance();
 * engine.registerDefinition(noiseDef);
 * const instance = engine.createInstance('noise_1', { Scale: 10.0 });
 * const outputs = instance.evaluate();
 * ```
 */
export class GroupCompositionEngine {
  /** Registered group definitions (id → definition) */
  private definitions: Map<string, NodeGroupDefinition>;
  /** Singleton instance */
  private static instance: GroupCompositionEngine | null = null;

  constructor() {
    this.definitions = new Map();
  }

  /**
   * Get the singleton engine instance.
   */
  static getInstance(): GroupCompositionEngine {
    if (!GroupCompositionEngine.instance) {
      GroupCompositionEngine.instance = new GroupCompositionEngine();
    }
    return GroupCompositionEngine.instance;
  }

  /**
   * Reset the singleton (useful for testing).
   */
  static resetInstance(): void {
    GroupCompositionEngine.instance = null;
  }

  // ── Registration ──────────────────────────────────────────────────────

  /**
   * Register a group definition.
   *
   * @param definition - The definition to register.
   * @throws If a definition with the same ID is already registered.
   */
  registerDefinition(definition: NodeGroupDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(
        `[GroupCompositionEngine] Definition "${definition.id}" already registered.`,
      );
    }
    this.definitions.set(definition.id, definition);
  }

  /**
   * Unregister a group definition.
   *
   * @param id - Definition ID to remove.
   * @returns True if the definition existed and was removed.
   */
  unregisterDefinition(id: string): boolean {
    return this.definitions.delete(id);
  }

  /**
   * Retrieve a registered definition by ID.
   *
   * @param id - Definition ID.
   * @returns The definition, or undefined if not found.
   */
  getDefinition(id: string): NodeGroupDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * List all registered definition IDs.
   */
  listDefinitions(): string[] {
    return Array.from(this.definitions.keys());
  }

  // ── Instantiation ─────────────────────────────────────────────────────

  /**
   * Create an instance of a registered definition with parameter overrides.
   *
   * @param definitionId - ID of the registered definition.
   * @param overrides - Parameter overrides for the instance.
   * @returns A new NodeGroupInstance.
   * @throws If the definition is not registered.
   */
  createInstance(
    definitionId: string,
    overrides: Record<string, unknown> = {},
  ): NodeGroupInstance {
    const def = this.definitions.get(definitionId);
    if (!def) {
      throw new Error(
        `[GroupCompositionEngine] Definition "${definitionId}" not registered.`,
      );
    }
    return new NodeGroupInstance(def, overrides);
  }

  // ── Composition (nesting) ─────────────────────────────────────────────

  /**
   * Nest one group inside another by creating a new definition that
   * incorporates the child group as an internal node.
   *
   * @param parentGroupId - ID of the parent group definition.
   * @param childGroupId - ID of the child group definition to nest inside.
   * @param inputMapping - Maps parent exposed inputs to child exposed inputs
   *                       (parentInputName → childInputName).
   * @param outputMapping - Maps child exposed outputs to parent exposed outputs
   *                        (childOutputName → parentOutputName).
   * @returns The modified parent definition (mutated in place).
   * @throws If either definition is not found.
   */
  compose(
    parentGroupId: string,
    childGroupId: string,
    inputMapping: Record<string, string> = {},
    outputMapping: Record<string, string> = {},
  ): NodeGroupDefinition {
    const parent = this.definitions.get(parentGroupId);
    const child = this.definitions.get(childGroupId);
    if (!parent) {
      throw new Error(
        `[GroupCompositionEngine] Parent definition "${parentGroupId}" not found.`,
      );
    }
    if (!child) {
      throw new Error(
        `[GroupCompositionEngine] Child definition "${childGroupId}" not found.`,
      );
    }

    // Add the child group as an internal node in the parent
    const childNode: InternalNode = {
      id: `nested_${child.id}_${parent.nextNodeId++}`,
      name: child.name,
      nodeType: 'GroupReference',
      groupDefinitionId: child.id,
      socketDefaults: {},
    };
    parent.addNode(childNode);

    // Map parent inputs → child inputs
    for (const [parentInput, childInput] of Object.entries(inputMapping)) {
      parent.exposeInput(childNode.id, childInput, parentInput, undefined);
    }

    // Map child outputs → parent outputs
    for (const [childOutput, parentOutput] of Object.entries(outputMapping)) {
      parent.exposeOutput(childNode.id, childOutput, parentOutput);
    }

    return parent;
  }

  // ── Flattening ────────────────────────────────────────────────────────

  /**
   * Flatten a nested group definition into a single evaluation graph.
   *
   * Recursively expands all group references, inlining their internal
   * nodes and connections into a single flat definition. The resulting
   * definition has no `groupDefinitionId` references.
   *
   * @param definition - The definition to flatten.
   * @param visited - Set of already-visited definition IDs (cycle guard).
   * @returns A new flat definition with all groups inlined.
   */
  flatten(
    definition: NodeGroupDefinition,
    visited: Set<string> = new Set(),
  ): NodeGroupDefinition {
    if (visited.has(definition.id)) {
      throw new Error(
        `[GroupCompositionEngine] Circular group reference detected: "${definition.id}".`,
      );
    }
    visited.add(definition.id);

    const flat = new NodeGroupDefinition(
      `${definition.id}_flat`,
      `${definition.name} (flat)`,
    );

    // Remap old node IDs to new IDs to avoid collisions
    const idRemap = new Map<string, string>();

    for (const [nodeId, node] of definition.nodes) {
      if (node.groupDefinitionId) {
        // Recursively flatten the child group and inline its nodes
        const childDef = this.definitions.get(node.groupDefinitionId);
        if (!childDef) {
          // If not registered, keep as-is
          const newNode: InternalNode = {
            ...node,
            id: `flat_${flat.nextNodeId++}`,
          };
          idRemap.set(nodeId, newNode.id);
          flat.addNode(newNode);
          continue;
        }
        const flatChild = this.flatten(childDef, new Set(visited));
        const childIdRemap = new Map<string, string>();

        // Inline all child nodes with unique IDs
        for (const [childNodeId, childNode] of flatChild.nodes) {
          const inlinedNode: InternalNode = {
            ...childNode,
            id: `flat_${flat.nextNodeId++}`,
          };
          childIdRemap.set(childNodeId, inlinedNode.id);
          flat.addNode(inlinedNode);
        }

        // Inline all child connections
        for (const conn of flatChild.connections) {
          flat.addConnection(
            childIdRemap.get(conn.fromNode) ?? conn.fromNode,
            conn.fromSocket,
            childIdRemap.get(conn.toNode) ?? conn.toNode,
            conn.toSocket,
          );
        }

        // Remap the nested node ID to a representative node from the child
        // Use the first node of the child as the remap target
        const firstChildNodeId = Array.from(flatChild.nodes.keys())[0];
        idRemap.set(
          nodeId,
          childIdRemap.get(firstChildNodeId) ?? firstChildNodeId,
        );
      } else {
        // Regular node: copy with a new unique ID
        const newNode: InternalNode = {
          ...node,
          id: `flat_${flat.nextNodeId++}`,
        };
        idRemap.set(nodeId, newNode.id);
        flat.addNode(newNode);
      }
    }

    // Remap connections
    for (const conn of definition.connections) {
      const newFrom = idRemap.get(conn.fromNode) ?? conn.fromNode;
      const newTo = idRemap.get(conn.toNode) ?? conn.toNode;
      if (flat.nodes.has(newFrom) && flat.nodes.has(newTo)) {
        flat.addConnection(newFrom, conn.fromSocket, newTo, conn.toSocket);
      }
    }

    // Remap exposed inputs
    for (const [name, mapping] of definition.inputMappings) {
      const newInternalNode = idRemap.get(mapping.internalNode);
      if (newInternalNode) {
        const socket = definition.inputSockets.get(name);
        flat.exposeInput(
          newInternalNode,
          mapping.internalSocket,
          name,
          socket?.defaultValue,
          socket?.min,
          socket?.max,
        );
      }
    }

    // Remap exposed outputs
    for (const [name, mapping] of definition.outputMappings) {
      const newInternalNode = idRemap.get(mapping.internalNode);
      if (newInternalNode) {
        flat.exposeOutput(newInternalNode, mapping.internalSocket, name);
        const socket = definition.outputSockets.get(name);
        if (socket) {
          flat.setOutputType(name, socket.type);
        }
      }
    }

    return flat;
  }

  // ── Evaluation ────────────────────────────────────────────────────────

  /**
   * Evaluate a potentially nested group definition with given inputs.
   *
   * Convenience method that creates an instance, applies inputs,
   * evaluates, and returns outputs.
   *
   * @param definition - The group definition to evaluate.
   * @param inputs - Map of input name → value.
   * @returns Map of output name → computed value.
   */
  evaluate(
    definition: NodeGroupDefinition,
    inputs: Record<string, unknown> = {},
  ): Map<string, unknown> {
    const instance = new NodeGroupInstance(definition, inputs);
    return instance.evaluate();
  }
}

// ============================================================================
// GroupSerializer — JSON serialization for definitions and instances
// ============================================================================

/**
 * Serializes and deserializes node group definitions and instances.
 *
 * Definitions are serialized to self-contained JSON that captures all
 * internal nodes, connections, socket metadata, and exposure mappings.
 * Instances are serialized as a reference to a definition ID plus
 * parameter overrides.
 *
 * @example
 * ```typescript
 * const serializer = new GroupSerializer();
 * const json = serializer.serialize(noiseDef);
 * const restored = serializer.deserialize(json);
 * ```
 */
export class GroupSerializer {
  /**
   * Serialize a group definition to a JSON-compatible object.
   *
   * @param definition - The definition to serialize.
   * @returns A JSON-compatible plain object.
   */
  serialize(definition: NodeGroupDefinition): Record<string, unknown> {
    return {
      id: definition.id,
      name: definition.name,
      inputSockets: mapToObject(definition.inputSockets, s => ({
        name: s.name,
        type: s.type,
        defaultValue: this.serializeValue(s.defaultValue),
        min: s.min,
        max: s.max,
      })),
      outputSockets: mapToObject(definition.outputSockets, s => ({
        name: s.name,
        type: s.type,
        defaultValue: this.serializeValue(s.defaultValue),
      })),
      nodes: mapToObject(definition.nodes, n => ({
        id: n.id,
        name: n.name,
        nodeType: n.nodeType,
        groupDefinitionId: n.groupDefinitionId ?? null,
        socketDefaults: this.serializeSocketDefaults(n.socketDefaults),
      })),
      connections: definition.connections.map(c => ({ ...c })),
      inputMappings: mapToObject(definition.inputMappings, m => ({ ...m })),
      outputMappings: mapToObject(definition.outputMappings, m => ({ ...m })),
    };
  }

  /**
   * Deserialize a group definition from a JSON object.
   *
   * @param json - The JSON object (as returned by `serialize`).
   * @returns A reconstructed NodeGroupDefinition.
   */
  deserialize(json: Record<string, any>): NodeGroupDefinition {
    const def = new NodeGroupDefinition(
      json.id,
      json.name,
      this.deserializeSockets(json.inputSockets),
      this.deserializeSockets(json.outputSockets),
    );

    // Restore nodes
    if (json.nodes) {
      for (const [, nodeData] of Object.entries(json.nodes)) {
        const nd = nodeData as Record<string, any>;
        def.addNode({
          id: nd.id,
          name: nd.name,
          nodeType: nd.nodeType,
          groupDefinitionId: nd.groupDefinitionId ?? undefined,
          socketDefaults: this.deserializeSocketDefaults(nd.socketDefaults),
        });
      }
    }

    // Restore connections
    if (json.connections) {
      for (const conn of json.connections as InternalConnection[]) {
        def.addConnection(
          conn.fromNode,
          conn.fromSocket,
          conn.toNode,
          conn.toSocket,
        );
      }
    }

    // Restore input mappings
    if (json.inputMappings) {
      for (const [, mapping] of Object.entries(json.inputMappings)) {
        const m = mapping as ExposedMapping;
        def.inputMappings.set(m.exposedName, m);
      }
    }

    // Restore output mappings
    if (json.outputMappings) {
      for (const [, mapping] of Object.entries(json.outputMappings)) {
        const m = mapping as ExposedMapping;
        def.outputMappings.set(m.exposedName, m);
      }
    }

    return def;
  }

  /**
   * Serialize an instance as a reference to its definition + overrides.
   *
   * @param instance - The instance to serialize.
   * @returns A JSON-compatible object.
   */
  serializeInstance(instance: NodeGroupInstance): Record<string, unknown> {
    return {
      definitionId: instance.definition.id,
      parameterOverrides: mapToObject(
        instance.parameterOverrides,
        v => this.serializeValue(v),
      ),
    };
  }

  /**
   * Deserialize an instance from JSON, resolving the definition
   * from the engine's registry.
   *
   * @param json - The JSON object (as returned by `serializeInstance`).
   * @param engine - The composition engine to resolve the definition from.
   * @returns A reconstructed NodeGroupInstance.
   * @throws If the referenced definition is not registered.
   */
  deserializeInstance(
    json: Record<string, any>,
    engine: GroupCompositionEngine,
  ): NodeGroupInstance {
    const def = engine.getDefinition(json.definitionId);
    if (!def) {
      throw new Error(
        `[GroupSerializer] Definition "${json.definitionId}" not found in engine.`,
      );
    }
    const overrides: Record<string, unknown> = {};
    if (json.parameterOverrides) {
      for (const [key, val] of Object.entries(json.parameterOverrides)) {
        overrides[key] = this.deserializeValue(val);
      }
    }
    return new NodeGroupInstance(def, overrides);
  }

  // ── Value serialization helpers ───────────────────────────────────────

  /**
   * Serialize a value that might be a THREE.Color, THREE.Vector3, etc.
   */
  private serializeValue(value: unknown): unknown {
    if (value instanceof THREE.Color) {
      return { __type: 'Color', r: value.r, g: value.g, b: value.b };
    }
    if (value instanceof THREE.Vector3) {
      return { __type: 'Vector3', x: value.x, y: value.y, z: value.z };
    }
    if (Array.isArray(value)) {
      return value.map(v => this.serializeValue(v));
    }
    return value;
  }

  /**
   * Deserialize a value that might be a serialized THREE.Color or Vector3.
   */
  private deserializeValue(value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, any>;
      if (obj.__type === 'Color') {
        return new THREE.Color(obj.r, obj.g, obj.b);
      }
      if (obj.__type === 'Vector3') {
        return new THREE.Vector3(obj.x, obj.y, obj.z);
      }
    }
    if (Array.isArray(value)) {
      return value.map(v => this.deserializeValue(v));
    }
    return value;
  }

  /**
   * Serialize socket defaults, handling THREE types.
   */
  private serializeSocketDefaults(
    defaults: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(defaults)) {
      result[key] = this.serializeValue(val);
    }
    return result;
  }

  /**
   * Deserialize socket defaults.
   */
  private deserializeSocketDefaults(
    defaults: Record<string, any>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (defaults) {
      for (const [key, val] of Object.entries(defaults)) {
        result[key] = this.deserializeValue(val);
      }
    }
    return result;
  }

  /**
   * Deserialize an object of GroupSocket entries.
   */
  private deserializeSockets(
    obj: Record<string, any> | undefined,
  ): GroupSocket[] {
    if (!obj) return [];
    return Object.values(obj).map((s: any) => ({
      name: s.name,
      type: s.type,
      defaultValue: this.deserializeValue(s.defaultValue),
      min: s.min,
      max: s.max,
    }));
  }
}

// ============================================================================
// Helper: Map → plain object serialization
// ============================================================================

/**
 * Convert a Map to a plain object, applying a transform to each value.
 */
function mapToObject<K, V, R>(
  map: Map<K, V>,
  transform: (value: V, key: K) => R,
): Record<string, R> {
  const obj: Record<string, R> = {};
  for (const [key, value] of map) {
    obj[String(key)] = transform(value, key);
  }
  return obj;
}

// ============================================================================
// PrebuiltGroupLibrary — Pre-built parameterizable groups
// ============================================================================

/**
 * Factory for common parameterizable node groups.
 *
 * Each method returns a fully-constructed NodeGroupDefinition
 * with sensible defaults and exposed inputs for customization.
 * These can be registered with a GroupCompositionEngine and
 * then instantiated or composed as needed.
 *
 * @example
 * ```typescript
 * const engine = GroupCompositionEngine.getInstance();
 * const noiseGroup = PrebuiltGroupLibrary.createNoiseGroup('perlin', 5.0, 4.0);
 * engine.registerDefinition(noiseGroup);
 * const instance = engine.createInstance(noiseGroup.id, { Scale: 10.0 });
 * ```
 */
export class PrebuiltGroupLibrary {
  private static counter = 0;

  private static nextId(): string {
    return `prebuilt_${PrebuiltGroupLibrary.counter++}`;
  }

  /**
   * Create a parameterizable noise group.
   *
   * Internal nodes: NoiseTexture → (optional MusgraveTexture) → output
   *
   * Exposed inputs:
   * - Scale: noise frequency (default: provided or 5.0)
   * - Detail: detail/octaves (default: provided or 2.0)
   * - Distortion: distortion amount (default: 0.0)
   * - Roughness: musgrave roughness (default: 0.5)
   *
   * Exposed outputs:
   * - Fac: scalar noise output
   * - Color: RGB noise output
   *
   * @param noiseType - Type of noise: 'perlin', 'musgrave', 'voronoi'.
   * @param scale - Default scale.
   * @param detail - Default detail.
   * @returns A parameterizable noise group definition.
   */
  static createNoiseGroup(
    noiseType: 'perlin' | 'musgrave' | 'voronoi' = 'perlin',
    scale: number = 5.0,
    detail: number = 2.0,
  ): NodeGroupDefinition {
    const id = PrebuiltGroupLibrary.nextId();
    const def = new NodeGroupDefinition(id, `Noise_${noiseType}`);

    let nodeType: string;
    switch (noiseType) {
      case 'musgrave':
        nodeType = 'MusgraveTexture';
        break;
      case 'voronoi':
        nodeType = 'VoronoiTexture';
        break;
      default:
        nodeType = 'NoiseTexture';
    }

    const noiseNode: InternalNode = {
      id: 'noise_0',
      name: `${noiseType}Noise`,
      nodeType,
      socketDefaults: { Scale: scale, Detail: detail, Distortion: 0.0, Roughness: 0.5 },
    };
    def.addNode(noiseNode);

    def.exposeInput('noise_0', 'Scale', 'Scale', scale, 0.01, 1000);
    def.exposeInput('noise_0', 'Detail', 'Detail', detail, 0, 16);
    def.exposeInput('noise_0', 'Distortion', 'Distortion', 0.0, 0, 10);
    if (noiseType === 'musgrave') {
      def.exposeInput('noise_0', 'Roughness', 'Roughness', 0.5, 0, 1);
    }

    def.exposeOutput('noise_0', 'Fac', 'Fac');
    def.exposeOutput('noise_0', 'Color', 'Color');
    def.setOutputType('Color', 'color');

    return def;
  }

  /**
   * Create a parameterizable color ramp group.
   *
   * Internal nodes: ColorRamp → output
   *
   * Exposed inputs:
   * - Fac: ramp position (default: 0.5)
   * - Stops: color ramp stops (default: provided or black→white)
   *
   * Exposed outputs:
   * - Color: interpolated color
   * - Fac: scalar output
   *
   * @param stops - Default color ramp stops.
   * @returns A parameterizable color ramp group definition.
   */
  static createColorRampGroup(
    stops: Array<{ position: number; color: number[] }> = [
      { position: 0, color: [0, 0, 0] },
      { position: 1, color: [1, 1, 1] },
    ],
  ): NodeGroupDefinition {
    const id = PrebuiltGroupLibrary.nextId();
    const def = new NodeGroupDefinition(id, 'ColorRamp');

    const rampNode: InternalNode = {
      id: 'ramp_0',
      name: 'ColorRamp',
      nodeType: 'ColorRamp',
      socketDefaults: { Fac: 0.5, Stops: stops },
    };
    def.addNode(rampNode);

    def.exposeInput('ramp_0', 'Fac', 'Fac', 0.5, 0, 1);
    def.exposeInput('ramp_0', 'Stops', 'Stops', stops);

    def.exposeOutput('ramp_0', 'Color', 'Color');
    def.exposeOutput('ramp_0', 'Fac', 'Fac');
    def.setOutputType('Color', 'color');

    return def;
  }

  /**
   * Create a full PBR material group.
   *
   * Internal nodes: PrincipledBSDF → output
   *
   * Exposed inputs:
   * - Base Color: RGB base color (default: provided or [0.8, 0.8, 0.8])
   * - Roughness: surface roughness (default: provided or 0.5)
   * - Metallic: metalness (default: provided or 0.0)
   * - Normal: normal map input
   *
   * Exposed outputs:
   * - BSDF: shader output
   * - Color: albedo color
   *
   * @param baseColor - Default base color.
   * @param roughness - Default roughness.
   * @param metallic - Default metallic.
   * @returns A parameterizable PBR material group definition.
   */
  static createPBRMaterialGroup(
    baseColor: number[] = [0.8, 0.8, 0.8],
    roughness: number = 0.5,
    metallic: number = 0.0,
  ): NodeGroupDefinition {
    const id = PrebuiltGroupLibrary.nextId();
    const def = new NodeGroupDefinition(id, 'PBRMaterial');

    const bsdfNode: InternalNode = {
      id: 'bsdf_0',
      name: 'PrincipledBSDF',
      nodeType: 'PrincipledBSDF',
      socketDefaults: {
        'Base Color': baseColor,
        Roughness: roughness,
        Metallic: metallic,
      },
    };
    def.addNode(bsdfNode);

    def.exposeInput('bsdf_0', 'Base Color', 'Base Color', baseColor);
    def.exposeInput('bsdf_0', 'Roughness', 'Roughness', roughness, 0, 1);
    def.exposeInput('bsdf_0', 'Metallic', 'Metallic', metallic, 0, 1);
    def.exposeInput('bsdf_0', 'Normal', 'Normal', [0, 0, 1]);

    def.exposeOutput('bsdf_0', 'BSDF', 'BSDF');
    def.exposeOutput('bsdf_0', 'Color', 'Color');
    def.setOutputType('BSDF', 'shader');
    def.setOutputType('Color', 'color');

    // Set input types
    const baseColorSocket = def.inputSockets.get('Base Color');
    if (baseColorSocket) baseColorSocket.type = 'color';
    const normalSocket = def.inputSockets.get('Normal');
    if (normalSocket) normalSocket.type = 'vector';

    return def;
  }

  /**
   * Create a displacement group.
   *
   * Internal nodes: Displacement → output
   *
   * Exposed inputs:
   * - Amplitude: displacement strength (default: provided or 1.0)
   * - Frequency: displacement frequency (default: provided or 1.0)
   * - Octaves: FBM octaves (default: provided or 4)
   * - Fac: displacement factor (default: 0.5)
   *
   * Exposed outputs:
   * - Displacement: scalar displacement value
   * - Vector: displacement vector
   *
   * @param amplitude - Default amplitude.
   * @param frequency - Default frequency.
   * @param octaves - Default octave count.
   * @returns A parameterizable displacement group definition.
   */
  static createDisplacementGroup(
    amplitude: number = 1.0,
    frequency: number = 1.0,
    octaves: number = 4,
  ): NodeGroupDefinition {
    const id = PrebuiltGroupLibrary.nextId();
    const def = new NodeGroupDefinition(id, 'Displacement');

    // Noise source → Displacement
    const noiseNode: InternalNode = {
      id: 'noise_0',
      name: 'NoiseTexture',
      nodeType: 'NoiseTexture',
      socketDefaults: { Scale: frequency, Detail: octaves },
    };
    const dispNode: InternalNode = {
      id: 'disp_0',
      name: 'Displacement',
      nodeType: 'Displacement',
      socketDefaults: { Amplitude: amplitude, Frequency: frequency, Fac: 0.5 },
    };
    def.addNode(noiseNode);
    def.addNode(dispNode);

    def.addConnection('noise_0', 'Fac', 'disp_0', 'Fac');

    def.exposeInput('noise_0', 'Scale', 'Scale', frequency, 0.01, 100);
    def.exposeInput('noise_0', 'Detail', 'Detail', octaves, 0, 16);
    def.exposeInput('disp_0', 'Amplitude', 'Amplitude', amplitude, 0, 100);
    def.exposeInput('disp_0', 'Frequency', 'Frequency', frequency, 0.01, 100);

    def.exposeOutput('disp_0', 'Displacement', 'Displacement');
    def.exposeOutput('disp_0', 'Vector', 'Vector');
    def.setOutputType('Vector', 'vector');

    return def;
  }

  /**
   * Create a multi-layer material blending group.
   *
   * Takes an array of layer specifications and creates a group that
   * blends them using mix nodes. Each layer has its own color, roughness,
   * metallic, and blend factor.
   *
   * Exposed inputs:
   * - Base Color: overall base color (default: first layer color)
   * - For each layer i: `Layer{i}_Color`, `Layer{i}_Roughness`,
   *   `Layer{i}_Metallic`, `Layer{i}_Blend`
   *
   * Exposed outputs:
   * - Color: blended color
   * - Roughness: blended roughness
   * - Metallic: blended metallic
   *
   * @param layers - Array of layer specs with color, roughness, metallic, blend.
   * @returns A parameterizable layered material group definition.
   */
  static createLayeredMaterialGroup(
    layers: Array<{
      color?: number[];
      roughness?: number;
      metallic?: number;
      blend?: number;
    }> = [
      { color: [0.8, 0.8, 0.8], roughness: 0.5, metallic: 0, blend: 1.0 },
      { color: [0.3, 0.3, 0.35], roughness: 0.7, metallic: 0.1, blend: 0.5 },
    ],
  ): NodeGroupDefinition {
    const id = PrebuiltGroupLibrary.nextId();
    const def = new NodeGroupDefinition(id, 'LayeredMaterial');

    if (layers.length === 0) {
      layers = [{ color: [0.8, 0.8, 0.8], roughness: 0.5, metallic: 0, blend: 1.0 }];
    }

    // Create a BSDF node for each layer
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const bsdfNode: InternalNode = {
        id: `layer_bsdf_${i}`,
        name: `Layer${i}_BSDF`,
        nodeType: 'PrincipledBSDF',
        socketDefaults: {
          'Base Color': layer.color ?? [0.8, 0.8, 0.8],
          Roughness: layer.roughness ?? 0.5,
          Metallic: layer.metallic ?? 0,
        },
      };
      def.addNode(bsdfNode);

      def.exposeInput(
        `layer_bsdf_${i}`,
        'Base Color',
        `Layer${i}_Color`,
        layer.color ?? [0.8, 0.8, 0.8],
      );
      def.exposeInput(
        `layer_bsdf_${i}`,
        'Roughness',
        `Layer${i}_Roughness`,
        layer.roughness ?? 0.5,
        0,
        1,
      );
      def.exposeInput(
        `layer_bsdf_${i}`,
        'Metallic',
        `Layer${i}_Metallic`,
        layer.metallic ?? 0,
        0,
        1,
      );

      // Set color type on color inputs
      const colorSocket = def.inputSockets.get(`Layer${i}_Color`);
      if (colorSocket) colorSocket.type = 'color';
    }

    // Create mix nodes to blend layers pairwise
    if (layers.length === 1) {
      // Single layer: output directly
      def.exposeOutput('layer_bsdf_0', 'Color', 'Color');
      def.exposeOutput('layer_bsdf_0', 'BSDF', 'BSDF');
      def.setOutputType('Color', 'color');
      def.setOutputType('BSDF', 'shader');
    } else {
      // Chain mix nodes
      let prevColorNode = 'layer_bsdf_0';
      for (let i = 1; i < layers.length; i++) {
        const mixNode: InternalNode = {
          id: `mix_${i}`,
          name: `MixLayer${i}`,
          nodeType: 'Mix',
          socketDefaults: {
            Factor: layers[i].blend ?? 0.5,
            Color1: layers[i - 1].color ?? [0.8, 0.8, 0.8],
            Color2: layers[i].color ?? [0.3, 0.3, 0.35],
          },
        };
        def.addNode(mixNode);

        // Connect previous color output to Color1
        if (i === 1) {
          def.addConnection('layer_bsdf_0', 'Color', `mix_${i}`, 'Color1');
        } else {
          def.addConnection(`mix_${i - 1}`, 'Color', `mix_${i}`, 'Color1');
        }
        def.addConnection(`layer_bsdf_${i}`, 'Color', `mix_${i}`, 'Color2');

        def.exposeInput(`mix_${i}`, 'Factor', `Layer${i}_Blend`, layers[i].blend ?? 0.5, 0, 1);
        prevColorNode = `mix_${i}`;
      }

      // Output the last mix node
      const lastMix = `mix_${layers.length - 1}`;
      def.exposeOutput(lastMix, 'Color', 'Color');
      def.setOutputType('Color', 'color');

      // Also expose a roughness output (blended from last two layers)
      def.exposeOutput(
        `layer_bsdf_${layers.length - 1}`,
        'BSDF',
        'BSDF',
      );
      def.setOutputType('BSDF', 'shader');
    }

    return def;
  }
}
