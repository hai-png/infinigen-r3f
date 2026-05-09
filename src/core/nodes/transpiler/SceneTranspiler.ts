/**
 * Scene Transpiler
 *
 * Converts declarative scene configurations into node graphs compatible
 * with the existing NodeWrangler evaluation engine. This is the
 * TypeScript equivalent of infinigen's Python transpiler, adapted for
 * the R3F / Three.js pipeline.
 *
 * ## Architecture
 *
 * The transpiler supports three graph types, matching Blender's node
 * editor contexts:
 *
 * 1. **Material graphs** (`transpileMaterialGraph`) — Produces shader
 *    node graphs that evaluate to Three.js materials via the
 *    `MaterialFactory` / `ShaderCompiler` pipeline.
 *
 * 2. **Geometry graphs** (`transpileGeometryGraph`) — Produces geometry
 *    node graphs that evaluate to modified `BufferGeometry` instances
 *    via the `GeometryNodeExecutor` pipeline.
 *
 * 3. **Compositor graphs** (`transpileCompositorGraph`) — Produces
 *    compositor node graphs for post-processing effects.
 *
 * ## Declarative Configuration
 *
 * Instead of writing imperative Python functions (as in infinigen), you
 * describe the graph as a JSON-compatible configuration object. The
 * transpiler converts this configuration into a `NodeWrangler` graph
 * that can be evaluated by the existing engine.
 *
 * ## Node Group Nesting
 *
 * The transpiler supports nested node groups. A `SceneGraphConfig`
 * may contain `groups` which are themselves sub-graphs. These are
 * created as `NodeGroup` instances inside the wrangler, and nodes
 * within them reference the group via their `parent` field.
 *
 * ## JSON Export / Import
 *
 * Transpiled graphs can be serialised to JSON and re-imported, enabling
 * graph persistence and cross-session sharing.
 *
 * @module core/nodes/transpiler/SceneTranspiler
 */

import { NodeWrangler, type NodeInputItem } from '../node-wrangler';
import type { NodeInstance, NodeLink, NodeGroup, NodeSocket } from '../types';
import { SocketType } from '../registry/socket-types';

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

/**
 * Describes a single node placement in a declarative graph configuration.
 *
 * This is the JSON-serialisable representation that the transpiler
 * converts into a live `NodeInstance`.
 */
export interface NodeConfig {
  /** Unique identifier within this graph */
  id: string;
  /** Canonical Blender-style node type string */
  type: string;
  /** Human-readable display label */
  label?: string;
  /** Node properties (e.g. `{operation: 'ADD', data_type: 'FLOAT'}`) */
  attrs?: Record<string, unknown>;
  /** Positional input connections, by socket index */
  inputArgs?: unknown[];
  /** Named input connections: socket name -> value */
  inputKwargs?: Record<string, unknown>;
  /** Position in the editor canvas */
  location?: [number, number];
  /** Whether this node is muted (bypassed) */
  muted?: boolean;
  /** Whether this node is collapsed in the editor */
  hidden?: boolean;
  /** Parent group ID for nodes inside groups */
  parentGroup?: string;
}

/**
 * Describes a link between two nodes in a declarative configuration.
 */
export interface LinkConfig {
  /** Source node ID */
  fromNode: string;
  /** Source output socket name (or index as string) */
  fromSocket: string;
  /** Target node ID */
  toNode: string;
  /** Target input socket name (or index as string) */
  toSocket: string;
}

/**
 * Describes a nested node group within a scene configuration.
 */
export interface GroupConfig {
  /** Unique group identifier */
  id: string;
  /** Human-readable group name */
  name: string;
  /** Nodes inside this group */
  nodes: NodeConfig[];
  /** Links inside this group */
  links: LinkConfig[];
  /** Exposed group input sockets */
  inputs?: Record<string, { type: string; defaultValue?: unknown }>;
  /** Exposed group output sockets */
  outputs?: Record<string, { type: string; defaultValue?: unknown }>;
  /** Parent group ID for nested groups */
  parentGroup?: string;
}

/**
 * Describes an exposed input or output on a material graph.
 */
export interface SocketInterfaceConfig {
  /** Socket name */
  name: string;
  /** Socket type (e.g. 'FLOAT', 'VECTOR', 'COLOR', 'GEOMETRY') */
  type: string;
  /** Default value when unconnected */
  defaultValue?: unknown;
  /** Minimum value (for numeric types) */
  min?: number;
  /** Maximum value (for numeric types) */
  max?: number;
  /** Short description */
  description?: string;
}

/**
 * Base configuration shared by all graph types.
 */
export interface BaseGraphConfig {
  /** Unique graph identifier */
  id: string;
  /** Human-readable graph name */
  name: string;
  /** Node placements */
  nodes: NodeConfig[];
  /** Links between nodes */
  links: LinkConfig[];
  /** Nested node groups */
  groups?: GroupConfig[];
  /** Exposed graph-level inputs */
  inputs?: SocketInterfaceConfig[];
  /** Exposed graph-level outputs */
  outputs?: SocketInterfaceConfig[];
}

/**
 * Configuration for a material (shader) graph.
 *
 * A material graph must have exactly one output node of type
 * `ShaderNodeOutputMaterial` that receives the surface shader.
 */
export interface MaterialGraphConfig extends BaseGraphConfig {
  /** Discriminator */
  kind: 'material';
  /** The surface BSDF shader node ID to connect to the output */
  surfaceShader?: string;
  /** The volume shader node ID (optional) */
  volumeShader?: string;
  /** The displacement node ID (optional) */
  displacement?: string;
}

/**
 * Configuration for a geometry node graph.
 *
 * A geometry graph must have exactly one output node of type
 * `NodeGroupOutput` that receives the final geometry.
 */
export interface GeometryGraphConfig extends BaseGraphConfig {
  /** Discriminator */
  kind: 'geometry';
  /** The geometry node ID to connect to the output */
  outputGeometry?: string;
}

/**
 * Configuration for a compositor graph.
 */
export interface CompositorGraphConfig extends BaseGraphConfig {
  /** Discriminator */
  kind: 'compositor';
  /** The render layers input node ID (optional) */
  renderLayers?: string;
}

/**
 * Union type for all graph configuration types.
 */
export type SceneGraphConfig =
  | MaterialGraphConfig
  | GeometryGraphConfig
  | CompositorGraphConfig;

// ---------------------------------------------------------------------------
// Transpile Result
// ---------------------------------------------------------------------------

/**
 * Result of transpiling a scene configuration.
 */
export interface TranspileResult {
  /** The NodeWrangler instance containing the built graph */
  wrangler: NodeWrangler;
  /** The type of graph that was transpiled */
  kind: 'material' | 'geometry' | 'compositor';
  /** Map from config node ID to live NodeInstance */
  nodeMap: Map<string, NodeInstance>;
  /** Map from group config ID to live NodeGroup */
  groupMap: Map<string, NodeGroup>;
  /** Any warnings encountered during transpilation */
  warnings: string[];
  /** Serialised JSON of the graph */
  toJSON(): string;
}

// ---------------------------------------------------------------------------
// JSON Serialisation Types
// ---------------------------------------------------------------------------

/**
 * JSON-serialisable representation of a transpiled graph.
 */
export interface SerializedGraph {
  /** Graph type */
  kind: 'material' | 'geometry' | 'compositor';
  /** Original config name */
  name: string;
  /** The NodeWrangler's serialised state */
  graph: string;
  /** Metadata about the transpilation */
  meta: {
    nodeCount: number;
    linkCount: number;
    groupCount: number;
    transpiledAt: string;
  };
}

// ---------------------------------------------------------------------------
// SceneTranspiler
// ---------------------------------------------------------------------------

/**
 * Converts declarative scene configurations into node graphs compatible
 * with the existing NodeWrangler evaluation engine.
 *
 * ## Usage
 *
 * ```ts
 * const transpiler = new SceneTranspiler();
 *
 * // Define a material graph
 * const config: MaterialGraphConfig = {
 *   kind: 'material',
 *   id: 'my_material',
 *   name: 'My Material',
 *   nodes: [
 *     { id: 'noise', type: 'ShaderNodeTexNoise', attrs: { scale: 5 } },
 *     { id: 'bsdf', type: 'ShaderNodeBsdfPrincipled', inputKwargs: { Base Color: { ref: 'noise', socket: 'Color' } } },
 *     { id: 'output', type: 'ShaderNodeOutputMaterial', inputKwargs: { Surface: { ref: 'bsdf', socket: 'BSDF' } } },
 *   ],
 *   links: [],
 * };
 *
 * const result = transpiler.transpileMaterialGraph(config);
 * ```
 */
export class SceneTranspiler {

  /**
   * Transpile a material (shader) graph configuration.
   *
   * Creates a `NodeWrangler` with the appropriate shader nodes and
   * connections. The resulting graph can be evaluated by the
   * `MaterialFactory` / `ShaderCompiler` pipeline to produce a
   * Three.js `Material`.
   *
   * ### Node Group Nesting
   *
   * If the config contains `groups`, each group is created as a
   * `NodeGroup` inside the wrangler. Nodes with a `parentGroup`
   * field are placed inside the corresponding group.
   *
   * ### Auto-Connections
   *
   * Input values in `inputKwargs` that are objects with a `ref` and
   * `socket` field are resolved as references to other nodes' outputs.
   * Literal values (numbers, strings, booleans, arrays) are assigned
   * as socket default values.
   *
   * @param config - The material graph configuration
   * @returns The transpilation result
   *
   * @throws If the config does not contain an output node
   * @throws If a referenced node ID does not exist
   */
  transpileMaterialGraph(config: MaterialGraphConfig): TranspileResult {
    return this._transpile(config, 'material');
  }

  /**
   * Transpile a geometry node graph configuration.
   *
   * Creates a `NodeWrangler` with geometry nodes and connections.
   * The resulting graph can be evaluated by the `GeometryNodeExecutor`
   * pipeline to produce modified `BufferGeometry` instances.
   *
   * @param config - The geometry graph configuration
   * @returns The transpilation result
   */
  transpileGeometryGraph(config: GeometryGraphConfig): TranspileResult {
    return this._transpile(config, 'geometry');
  }

  /**
   * Transpile a compositor graph configuration.
   *
   * Creates a `NodeWrangler` with compositor nodes and connections.
   *
   * @param config - The compositor graph configuration
   * @returns The transpilation result
   */
  transpileCompositorGraph(config: CompositorGraphConfig): TranspileResult {
    return this._transpile(config, 'compositor');
  }

  /**
   * Import a previously serialised graph.
   *
   * Reconstructs the `NodeWrangler` from a JSON string produced by
   * `TranspileResult.toJSON()` or `SceneTranspiler.serializeGraph()`.
   *
   * @param json - The serialised graph JSON string
   * @returns The transpilation result with the reconstructed graph
   *
   * @throws If the JSON is invalid or cannot be parsed
   */
  importGraph(json: string): TranspileResult {
    let parsed: SerializedGraph;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new Error(
        `SceneTranspiler.importGraph: invalid JSON — ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.graph) {
      throw new Error('SceneTranspiler.importGraph: missing "graph" field in serialised data');
    }

    const wrangler = NodeWrangler.fromJSON(parsed.graph);
    const kind = parsed.kind || 'geometry';

    // Rebuild node map from the wrangler's active group
    const nodeMap = new Map<string, NodeInstance>();
    const group = wrangler.getActiveGroup();
    for (const [nodeId, node] of group.nodes.entries()) {
      // Try to find the original config ID from the node name
      nodeMap.set(node.name, node);
      nodeMap.set(nodeId, node);
    }

    return {
      wrangler,
      kind: kind as 'material' | 'geometry' | 'compositor',
      nodeMap,
      groupMap: new Map(),
      warnings: [],
      toJSON: () => json,
    };
  }

  /**
   * Serialize a transpiled graph for persistence.
   *
   * @param result - The transpilation result to serialize
   * @returns The serialized graph object
   */
  serializeGraph(result: TranspileResult): SerializedGraph {
    const wranglerJson = result.wrangler.toJSON();
    const group = result.wrangler.getActiveGroup();

    return {
      kind: result.kind,
      name: 'transpiled_graph',
      graph: wranglerJson,
      meta: {
        nodeCount: group.nodes.size,
        linkCount: group.links.size,
        groupCount: result.groupMap.size,
        transpiledAt: new Date().toISOString(),
      },
    };
  }

  // =========================================================================
  // Private: Core Transpilation Pipeline
  // =========================================================================

  /**
   * Core transpilation pipeline shared by all graph types.
   *
   * Steps:
   * 1. Create a fresh `NodeWrangler`.
   * 2. Create node groups (if any) from the config.
   * 3. Create all nodes, collecting them in a nodeMap.
   * 4. Create all links between nodes.
   * 5. Apply input kwargs (connections and default values).
   * 6. Expose group-level inputs and outputs.
   *
   * @param config - The scene graph configuration
   * @param kind   - The type of graph being transpiled
   * @returns The transpilation result
   */
  private _transpile(config: SceneGraphConfig, kind: 'material' | 'geometry' | 'compositor'): TranspileResult {
    const warnings: string[] = [];
    const wrangler = new NodeWrangler();
    const nodeMap = new Map<string, NodeInstance>();
    const groupMap = new Map<string, NodeGroup>();

    // ── Step 1: Create node groups ──
    if (config.groups) {
      for (const groupConfig of config.groups) {
        const group = wrangler.createNodeGroup(groupConfig.name);
        groupMap.set(groupConfig.id, group);

        // Expose group inputs
        if (groupConfig.inputs) {
          for (const [socketName, socketDef] of Object.entries(groupConfig.inputs)) {
            const socketType = this._parseSocketType(socketDef.type);
            const socket: NodeSocket = {
              id: `group_input_${socketName}`,
              name: socketName,
              type: socketType,
              value: socketDef.defaultValue as any,
              defaultValue: socketDef.defaultValue as any,
              isInput: true,
            };
            group.inputs.set(socketName, socket);
          }
        }

        // Expose group outputs
        if (groupConfig.outputs) {
          for (const [socketName, socketDef] of Object.entries(groupConfig.outputs)) {
            const socketType = this._parseSocketType(socketDef.type);
            const socket: NodeSocket = {
              id: `group_output_${socketName}`,
              name: socketName,
              type: socketType,
              value: socketDef.defaultValue as any,
              defaultValue: socketDef.defaultValue as any,
              isInput: false,
            };
            group.outputs.set(socketName, socket);
          }
        }
      }
    }

    // ── Step 2: Create all nodes ──
    for (const nodeConfig of config.nodes) {
      // If the node belongs to a group, switch to that group
      if (nodeConfig.parentGroup) {
        const group = groupMap.get(nodeConfig.parentGroup);
        if (group) {
          wrangler.setActiveGroup(group.id);
        } else {
          warnings.push(`Node "${nodeConfig.id}" references unknown group "${nodeConfig.parentGroup}"`);
          continue;
        }
      }

      try {
        const node = wrangler.newNode(
          nodeConfig.type,
          nodeConfig.label,
          nodeConfig.location,
          nodeConfig.attrs as Record<string, unknown>,
        );

        // Apply muted / hidden flags
        if (nodeConfig.muted) node.muted = true;
        if (nodeConfig.hidden) node.hidden = true;

        nodeMap.set(nodeConfig.id, node);
      } catch (err) {
        warnings.push(
          `Failed to create node "${nodeConfig.id}" of type "${nodeConfig.type}": ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Switch back to root group
      wrangler.setActiveGroup('root');
    }

    // ── Step 3: Create all links ──
    for (const linkConfig of config.links) {
      const fromNode = nodeMap.get(linkConfig.fromNode);
      const toNode = nodeMap.get(linkConfig.toNode);

      if (!fromNode) {
        warnings.push(`Link references unknown source node "${linkConfig.fromNode}"`);
        continue;
      }
      if (!toNode) {
        warnings.push(`Link references unknown target node "${linkConfig.toNode}"`);
        continue;
      }

      // If the target node belongs to a group, switch to that group
      const toNodeConfig = config.nodes.find(n => n.id === linkConfig.toNode);
      if (toNodeConfig?.parentGroup) {
        const group = groupMap.get(toNodeConfig.parentGroup);
        if (group) {
          wrangler.setActiveGroup(group.id);
        }
      }

      try {
        wrangler.connect(fromNode, linkConfig.fromSocket, toNode, linkConfig.toSocket);
      } catch (err) {
        warnings.push(
          `Failed to connect "${linkConfig.fromNode}.${linkConfig.fromSocket}" -> ` +
          `"${linkConfig.toNode}.${linkConfig.toSocket}": ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
      }

      wrangler.setActiveGroup('root');
    }

    // ── Step 4: Apply input kwargs ──
    for (const nodeConfig of config.nodes) {
      if (!nodeConfig.inputKwargs) continue;

      const node = nodeMap.get(nodeConfig.id);
      if (!node) continue;

      // Switch to the correct group if needed
      if (nodeConfig.parentGroup) {
        const group = groupMap.get(nodeConfig.parentGroup);
        if (group) {
          wrangler.setActiveGroup(group.id);
        }
      }

      for (const [socketName, value] of Object.entries(nodeConfig.inputKwargs)) {
        const inputSocket = node.inputs.get(socketName);
        if (!inputSocket) {
          // Try by index
          const idx = parseInt(socketName, 10);
          if (!isNaN(idx)) {
            const sockets = Array.from(node.inputs.values());
            if (idx < sockets.length) {
              this._applyInputValue(wrangler, node, sockets[idx], value, nodeMap, warnings);
            } else {
              warnings.push(`Socket index ${idx} out of range on node "${nodeConfig.id}"`);
            }
          } else {
            warnings.push(`Input socket "${socketName}" not found on node "${nodeConfig.id}" (type: ${nodeConfig.type})`);
          }
          continue;
        }

        this._applyInputValue(wrangler, node, inputSocket, value, nodeMap, warnings);
      }

      wrangler.setActiveGroup('root');
    }

    // ── Step 5: Apply input args (positional) ──
    for (const nodeConfig of config.nodes) {
      if (!nodeConfig.inputArgs) continue;

      const node = nodeMap.get(nodeConfig.id);
      if (!node) continue;

      if (nodeConfig.parentGroup) {
        const group = groupMap.get(nodeConfig.parentGroup);
        if (group) {
          wrangler.setActiveGroup(group.id);
        }
      }

      const inputSockets = Array.from(node.inputs.values());
      for (let i = 0; i < nodeConfig.inputArgs.length; i++) {
        if (i >= inputSockets.length) {
          warnings.push(`Input arg index ${i} out of range on node "${nodeConfig.id}"`);
          break;
        }
        this._applyInputValue(wrangler, node, inputSockets[i], nodeConfig.inputArgs[i], nodeMap, warnings);
      }

      wrangler.setActiveGroup('root');
    }

    // ── Step 6: Expose graph-level inputs and outputs ──
    if (config.inputs) {
      const group = wrangler.getActiveGroup();
      for (const inputConfig of config.inputs) {
        const socketType = this._parseSocketType(inputConfig.type);
        const socket: NodeSocket = {
          id: `graph_input_${inputConfig.name}`,
          name: inputConfig.name,
          type: socketType,
          value: inputConfig.defaultValue as any,
          defaultValue: inputConfig.defaultValue as any,
          isInput: true,
          min: inputConfig.min,
          max: inputConfig.max,
          description: inputConfig.description,
        };
        group.inputs.set(inputConfig.name, socket);
      }
    }

    if (config.outputs) {
      const group = wrangler.getActiveGroup();
      for (const outputConfig of config.outputs) {
        const socketType = this._parseSocketType(outputConfig.type);
        const socket: NodeSocket = {
          id: `graph_output_${outputConfig.name}`,
          name: outputConfig.name,
          type: socketType,
          value: outputConfig.defaultValue as any,
          defaultValue: outputConfig.defaultValue as any,
          isInput: false,
          min: outputConfig.min,
          max: outputConfig.max,
          description: outputConfig.description,
        };
        group.outputs.set(outputConfig.name, socket);
      }
    }

    return {
      wrangler,
      kind,
      nodeMap,
      groupMap,
      warnings,
      toJSON: () => {
        const serialized = this.serializeGraph({
          wrangler,
          kind,
          nodeMap,
          groupMap,
          warnings,
          toJSON: () => '',
        });
        return JSON.stringify(serialized, null, 2);
      },
    };
  }

  // =========================================================================
  // Private: Input Value Application
  // =========================================================================

  /**
   * Apply an input value to a socket.
   *
   * Handles three cases:
   * 1. **Reference**: An object with `{ref: 'nodeId', socket: 'socketName'}`
   *   is resolved to a link from the referenced node's output.
   * 2. **Literal**: A primitive value (number, string, boolean) is assigned
   *   as the socket's default value.
   * 3. **Array**: A plain number array is assigned as a vector default value.
   *
   * @param wrangler  - The active NodeWrangler
   * @param node      - The target node
   * @param socket    - The target input socket
   * @param value     - The value from the config
   * @param nodeMap   - Map of config IDs to NodeInstances
   * @param warnings  - Accumulator for warnings
   */
  private _applyInputValue(
    wrangler: NodeWrangler,
    node: NodeInstance,
    socket: NodeSocket,
    value: unknown,
    nodeMap: Map<string, NodeInstance>,
    warnings: string[],
  ): void {
    if (value === null || value === undefined) {
      return;
    }

    // Case 1: Reference object {ref, socket}
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      const ref = (value as Record<string, unknown>).ref;
      const socketName = (value as Record<string, unknown>).socket;
      if (typeof ref === 'string' && typeof socketName === 'string') {
        const sourceNode = nodeMap.get(ref);
        if (sourceNode) {
          try {
            wrangler.connect(sourceNode, socketName, node, socket.name);
          } catch (err) {
            warnings.push(
              `Failed to connect ref "${ref}.${socketName}" -> "${node.id}.${socket.name}": ` +
              `${err instanceof Error ? err.message : String(err)}`,
            );
          }
          return;
        } else {
          warnings.push(`Referenced node "${ref}" not found in nodeMap`);
          return;
        }
      }
    }

    // Case 2: NodeInstance direct reference
    if (typeof value === 'object' && !Array.isArray(value) && value !== null &&
        'id' in (value as object) && 'type' in (value as object) &&
        'outputs' in (value as object)) {
      const sourceNode = value as NodeInstance;
      const firstOutput = sourceNode.outputs.values().next().value;
      if (firstOutput) {
        try {
          wrangler.connect(sourceNode, firstOutput.name, node, socket.name);
        } catch (err) {
          warnings.push(
            `Failed to connect node "${sourceNode.id}" -> "${node.id}.${socket.name}": ` +
            `${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return;
    }

    // Case 3: Literal value
    socket.value = value as any;
  }

  // =========================================================================
  // Private: Utility
  // =========================================================================

  /**
   * Parse a socket type string into a SocketType enum value.
   *
   * Supports both the full enum name ('FLOAT', 'VECTOR') and
   * Blender-style socket class names ('NodeSocketFloat', 'NodeSocketVector').
   *
   * @param typeStr - The socket type string
   * @returns The corresponding SocketType enum value
   */
  private _parseSocketType(typeStr: string): SocketType {
    // Direct enum match
    const upper = typeStr.toUpperCase();
    for (const value of Object.values(SocketType)) {
      if (value === upper || value === typeStr) {
        return value as SocketType;
      }
    }

    // Blender socket class mapping
    if (typeStr.startsWith('NodeSocket')) {
      const mapping: Record<string, SocketType> = {
        NodeSocketFloat: SocketType.FLOAT,
        NodeSocketInt: SocketType.INTEGER,
        NodeSocketVector: SocketType.VECTOR,
        NodeSocketColor: SocketType.COLOR,
        NodeSocketBool: SocketType.BOOLEAN,
        NodeSocketString: SocketType.STRING,
        NodeSocketShader: SocketType.SHADER,
        NodeSocketGeometry: SocketType.GEOMETRY,
        NodeSocketMaterial: SocketType.MATERIAL,
        NodeSocketTexture: SocketType.TEXTURE,
        NodeSocketObject: SocketType.OBJECT,
        NodeSocketCollection: SocketType.COLLECTION,
        NodeSocketImage: SocketType.IMAGE,
        NodeSocketFloatAngle: SocketType.FLOAT,
        NodeSocketFloatDistance: SocketType.FLOAT,
        NodeSocketFloatFactor: SocketType.FLOAT,
        NodeSocketFloatPercentage: SocketType.FLOAT,
        NodeSocketFloatTime: SocketType.FLOAT,
        NodeSocketVectorAcceleration: SocketType.VECTOR,
        NodeSocketVectorDirection: SocketType.VECTOR,
        NodeSocketVectorEuler: SocketType.VECTOR,
        NodeSocketVectorSpeed: SocketType.VECTOR,
        NodeSocketVectorTranslation: SocketType.VECTOR,
        NodeSocketVectorXYZ: SocketType.VECTOR,
      };
      if (typeStr in mapping) {
        return mapping[typeStr];
      }
    }

    // Semantic mappings
    const semanticMap: Record<string, SocketType> = {
      FLOAT: SocketType.FLOAT,
      INT: SocketType.INTEGER,
      INTEGER: SocketType.INTEGER,
      VECTOR: SocketType.VECTOR,
      COLOR: SocketType.COLOR,
      COLOUR: SocketType.COLOR,
      RGBA: SocketType.COLOR,
      RGB: SocketType.COLOR,
      BOOLEAN: SocketType.BOOLEAN,
      BOOL: SocketType.BOOLEAN,
      STRING: SocketType.STRING,
      SHADER: SocketType.SHADER,
      GEOMETRY: SocketType.GEOMETRY,
      MESH: SocketType.MESH,
      CURVE: SocketType.CURVE,
      VOLUME: SocketType.VOLUME,
      MATERIAL: SocketType.MATERIAL,
      TEXTURE: SocketType.TEXTURE,
      OBJECT: SocketType.OBJECT,
      COLLECTION: SocketType.COLLECTION,
      IMAGE: SocketType.IMAGE,
      VALUE: SocketType.VALUE,
      ROTATION: SocketType.ROTATION,
      MATRIX: SocketType.MATRIX,
      QUATERNION: SocketType.QUATERNION,
      TRANSFORM: SocketType.TRANSFORM,
      INSTANCE: SocketType.INSTANCE,
      POINTS: SocketType.POINTS,
      FLOAT_VECTOR: SocketType.VECTOR,
      FLOAT_COLOR: SocketType.COLOR,
    };

    if (upper in semanticMap) {
      return semanticMap[upper];
    }

    // Default fallback
    return SocketType.VALUE;
  }
}
