/**
 * NodeEvaluator - Node graph evaluation pipeline
 *
 * Takes a node graph (connections + node instances) and evaluates it
 * using topological sort to respect data flow order.
 *
 * Supports evaluation modes:
 * - MATERIAL: produces a Three.js material
 * - GEOMETRY: produces geometry modifications
 * - TEXTURE: produces a DataTexture
 */

import * as THREE from 'three';
import type { NodeInstance, NodeLink, NodeDefinition } from '../core/types';
import { SocketType, areSocketsCompatible, getDefaultValueForType } from '../core/types';
import * as CoreExecutors from './CoreNodeExecutors';
import * as ExtExecutors from './ExtendedNodeExecutors';
import * as AddExecutors from './AdditionalNodeExecutors';
import * as ExpExecutors from './ExpandedNodeExecutors';
import * as EssentialExecutors from './EssentialNodeExecutors';
import * as SpecializedExecutors from './SpecializedNodeExecutors';
import * as P1Executors from './P1NodeExecutors';
import * as P2Executors from './P2NodeExecutors';

// ============================================================================
// Types
// ============================================================================

/** Evaluation mode determines what output the evaluator produces */
export enum EvaluationMode {
  MATERIAL = 'MATERIAL',
  GEOMETRY = 'GEOMETRY',
  TEXTURE = 'TEXTURE',
}

/** Result of evaluating a node graph */
export interface NodeEvaluationResult {
  mode: EvaluationMode;
  value: any;
  warnings: string[];
  errors: string[];
}

/** A node graph to be evaluated */
export interface NodeGraph {
  nodes: Map<string, NodeInstance>;
  links: NodeLink[];
}

/** Cached output for a specific node+socket */
interface CacheKey {
  nodeId: string;
  socketName: string;
}

/** Error thrown when a cyclic dependency is detected */
export class CyclicDependencyError extends Error {
  constructor(public readonly cycleNodes: string[]) {
    super(`Cyclic dependency detected: ${cycleNodes.join(' → ')}`);
    this.name = 'CyclicDependencyError';
  }
}

/** Error thrown when a required connection is missing */
export class MissingConnectionError extends Error {
  constructor(nodeId: string, socketName: string) {
    super(`Missing required connection: node "${nodeId}" input "${socketName}"`);
    this.name = 'MissingConnectionError';
  }
}

/** Error thrown when socket types are incompatible */
export class SocketTypeMismatchError extends Error {
  constructor(
    fromNode: string, fromSocket: string, fromType: string,
    toNode: string, toSocket: string, toType: string
  ) {
    super(
      `Socket type mismatch: ${fromNode}.${fromSocket}(${fromType}) → ${toNode}.${toSocket}(${toType})`
    );
    this.name = 'SocketTypeMismatchError';
  }
}

// ============================================================================
// NodeEvaluator
// ============================================================================

export class NodeEvaluator {
  private cache: Map<string, any> = new Map();
  private warnings: string[] = [];
  private errors: string[] = [];
  private nodeDefinitions: Map<string, NodeDefinition> = new Map();

  /** Register a node definition for lookup during evaluation */
  registerDefinition(definition: NodeDefinition): void {
    this.nodeDefinitions.set(definition.type, definition);
  }

  /** Register multiple definitions at once */
  registerDefinitions(definitions: NodeDefinition[]): void {
    for (const def of definitions) {
      this.registerDefinition(def);
    }
  }

  /**
   * Evaluate a node graph in the given mode
   */
  evaluate(graph: NodeGraph, mode: EvaluationMode): NodeEvaluationResult {
    this.cache.clear();
    this.warnings = [];
    this.errors = [];

    try {
      // Step 1: Validate graph
      this.validateGraph(graph);

      // Step 2: Topological sort
      const sortedNodes = this.topologicalSort(graph);

      // Step 3: Evaluate each node in order
      let finalOutput: any = null;

      for (const nodeId of sortedNodes) {
        const node = graph.nodes.get(nodeId);
        if (!node) continue;

        const output = this.evaluateNode(node, graph);
        finalOutput = output;
      }

      // Step 4: Find the output node and return its result
      const outputNodeId = this.findOutputNode(graph, mode);
      if (outputNodeId) {
        const outputNode = graph.nodes.get(outputNodeId);
        if (outputNode) {
          finalOutput = this.getNodeOutput(outputNode);
        }
      }

      return {
        mode,
        value: finalOutput,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    } catch (error: any) {
      this.errors.push(error.message);
      return {
        mode,
        value: null,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }
  }

  /**
   * Perform topological sort on the node graph using Kahn's algorithm.
   * Respects data flow order based on connections.
   */
  topologicalSort(graph: NodeGraph): string[] {
    const nodes = graph.nodes;
    const links = graph.links;

    // Build adjacency list and in-degree count
    const adj: Map<string, Set<string>> = new Map();
    const inDegree: Map<string, number> = new Map();

    for (const [id] of nodes) {
      adj.set(id, new Set());
      inDegree.set(id, 0);
    }

    // Build edges: from source node to target node
    for (const link of links) {
      if (!adj.get(link.fromNode)?.add(link.toNode)) {
        // Edge already exists or node doesn't exist
      }
      inDegree.set(link.toNode, (inDegree.get(link.toNode) || 0) + 1);
    }

    // Start with nodes that have no incoming edges
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sorted: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      sorted.push(current);

      const neighbors = adj.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) || 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0 && !visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    // Check for cycles
    if (sorted.length !== nodes.size) {
      const cycleNodes: string[] = [];
      for (const [id] of nodes) {
        if (!visited.has(id)) {
          cycleNodes.push(id);
        }
      }
      throw new CyclicDependencyError(cycleNodes);
    }

    return sorted;
  }

  /**
   * Validate the graph for type mismatches and missing connections
   */
  private validateGraph(graph: NodeGraph): void {
    for (const link of graph.links) {
      this.validateLink(link, graph);
    }

    // Check for missing required connections
    for (const [nodeId, node] of graph.nodes) {
      const def = this.nodeDefinitions.get(node.type);
      if (def) {
        for (const input of def.inputs) {
          if (input.required) {
            const hasConnection = graph.links.some(
              l => l.toNode === nodeId && l.toSocket === input.name
            );
            const hasValue = node.inputs instanceof Map
              ? node.inputs.has(input.name) && node.inputs.get(input.name) !== undefined
              : input.name in (node.inputs as any) && (node.inputs as any)[input.name] !== undefined;

            if (!hasConnection && !hasValue) {
              this.warnings.push(
                `Missing required input "${input.name}" on node "${nodeId}" (${node.type})`
              );
            }
          }
        }
      }
    }
  }

  /**
   * Validate a single link for type compatibility
   */
  private validateLink(link: NodeLink, graph: NodeGraph): void {
    const fromNode = graph.nodes.get(link.fromNode);
    const toNode = graph.nodes.get(link.toNode);

    if (!fromNode || !toNode) {
      this.errors.push(`Link references non-existent node: ${!fromNode ? link.fromNode : link.toNode}`);
      return;
    }

    // Try to get socket types from definitions
    const fromDef = this.nodeDefinitions.get(fromNode.type);
    const toDef = this.nodeDefinitions.get(toNode.type);

    if (fromDef && toDef) {
      const fromSocket = fromDef.outputs.find(o => o.name === link.fromSocket);
      const toSocket = toDef.inputs.find(i => i.name === link.toSocket);

      if (fromSocket && toSocket) {
        const fromType = fromSocket.type as SocketType;
        const toType = toSocket.type as SocketType;

        if (!areSocketsCompatible(fromType, toType)) {
          this.warnings.push(
            `Type mismatch: ${link.fromNode}.${link.fromSocket}(${fromType}) → ${link.toNode}.${link.toSocket}(${toType})`
          );
        }
      }
    }
  }

  /**
   * Evaluate a single node, pulling inputs from connected upstream nodes
   */
  private evaluateNode(node: NodeInstance, graph: NodeGraph): any {
    const cacheKey = `node:${node.id}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Resolve inputs: either from connections or from node settings
    const resolvedInputs: Record<string, any> = {};

    // Get default values from definition
    const def = this.nodeDefinitions.get(node.type);
    if (def?.defaults) {
      Object.assign(resolvedInputs, def.defaults);
    }

    // Override with node's own input values
    if (node.inputs instanceof Map) {
      for (const [key, value] of node.inputs) {
        if (value !== undefined && value !== null) {
          resolvedInputs[key] = value;
        }
      }
    } else if (typeof node.inputs === 'object') {
      Object.entries(node.inputs).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          resolvedInputs[key] = value;
        }
      });
    }

    // Resolve connections (overriding local values)
    for (const link of graph.links) {
      if (link.toNode === node.id) {
        const upstreamNode = graph.nodes.get(link.fromNode);
        if (upstreamNode) {
          const upstreamOutput = this.getNodeOutput(upstreamNode);
          const outputValue = upstreamOutput instanceof Map
            ? upstreamOutput.get(link.fromSocket)
            : typeof upstreamOutput === 'object' && upstreamOutput !== null
              ? (upstreamOutput as any)[link.fromSocket]
              : upstreamOutput;

          if (outputValue !== undefined) {
            resolvedInputs[link.toSocket] = outputValue;
          } else {
            // Use default for the socket type
            const toDef = this.nodeDefinitions.get(node.type);
            const toSocket = toDef?.inputs.find(i => i.name === link.toSocket);
            if (toSocket) {
              resolvedInputs[link.toSocket] = toSocket.default ?? getDefaultValueForType(toSocket.type as SocketType);
              this.warnings.push(
                `Missing output "${link.fromSocket}" from node "${link.fromNode}", using default`
              );
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Special handling for CaptureAttribute: evaluate Value field per-vertex
    //
    // In Blender's geometry nodes, CaptureAttribute evaluates the Value
    // input field at EACH element of the geometry. The upstream node
    // (e.g., Position, Normal, Index) produces per-element data that
    // must be collected for every vertex/face.
    //
    // If the Value input's upstream node already returned a per-element
    // array (which our Position/Normal executors do), the array is
    // passed through directly. If it returned a single scalar, we wrap
    // it in a field evaluator that the CaptureAttribute executor can
    // call for each element.
    // -----------------------------------------------------------------------
    const nodeType = node.type;
    const isCaptureAttr = nodeType === 'CaptureAttribute'
      || nodeType === 'CaptureAttributeNode'
      || nodeType === 'capture_attribute'
      || nodeType === 'GeometryNodeCaptureAttribute';

    if (isCaptureAttr) {
      this.enhanceCaptureAttributeInputs(node, graph, resolvedInputs);
    }

    // Execute the node
    const result = this.executeNodeByType(node, resolvedInputs);

    // Cache the result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Enhance the resolved inputs for a CaptureAttribute node so the Value
   * field is evaluated per-element rather than as a single global value.
   *
   * If the Value input's upstream node returned a per-element array, it
   * is passed through. If it returned a single value, we create a field
   * evaluator function that the CaptureAttribute executor can call per-element.
   */
  private enhanceCaptureAttributeInputs(
    node: NodeInstance,
    graph: NodeGraph,
    resolvedInputs: Record<string, any>,
  ): void {
    // If Value is already an array or function, it's per-vertex capable — skip
    const value = resolvedInputs.Value ?? resolvedInputs.value;
    if (value !== undefined && value !== null) {
      if (Array.isArray(value) || typeof value === 'function') {
        return; // Already per-element or field evaluator
      }
      // Check if it's an AttributeStream
      if (typeof value === 'object' && 'getFloat' in value && 'size' in value) {
        return; // Already a stream
      }
    }

    // Find the upstream node connected to the "Value" input
    let valueUpstreamNodeId: string | null = null;
    let valueUpstreamSocket: string | null = null;
    for (const link of graph.links) {
      if (link.toNode === node.id && (link.toSocket === 'Value' || link.toSocket === 'value')) {
        valueUpstreamNodeId = link.fromNode;
        valueUpstreamSocket = link.fromSocket;
        break;
      }
    }

    if (valueUpstreamNodeId && valueUpstreamSocket) {
      // Get the geometry from the resolved inputs
      const geometry = resolvedInputs.Geometry ?? resolvedInputs.geometry ?? null;
      if (geometry && typeof geometry === 'object' && 'getAttribute' in geometry) {
        // Create a field evaluator function that will evaluate the upstream
        // node per-vertex. The CaptureAttribute executor will call this
        // function for each element.
        const evaluator = this.createFieldEvaluator(
          valueUpstreamNodeId,
          valueUpstreamSocket,
          graph,
          geometry as THREE.BufferGeometry,
        );
        if (evaluator) {
          resolvedInputs.Value = evaluator;
        }
      }
    }
  }

  /**
   * Create a field evaluator function for the Value input of CaptureAttribute.
   *
   * The evaluator takes (index, position, normal) and returns the value
   * of the upstream node when evaluated with that per-vertex context.
   *
   * For known input nodes (Position, Normal, Index), we directly return
   * per-vertex data from the geometry. For other nodes, we re-evaluate
   * the upstream subgraph with per-vertex overrides.
   */
  private createFieldEvaluator(
    upstreamNodeId: string,
    upstreamSocket: string,
    graph: NodeGraph,
    geometry: THREE.BufferGeometry,
  ): ((index: number, position: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }) => any) | null {
    const upstreamNode = graph.nodes.get(upstreamNodeId);
    if (!upstreamNode) return null;

    const upstreamType = upstreamNode.type;
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');

    // For Position input nodes, directly return per-vertex position
    if (
      upstreamType === 'GeometryNodeInputPosition' || upstreamType === 'input_position'
      || upstreamType === 'InputPositionNode' || upstreamType === 'Position'
    ) {
      return (index: number) => {
        if (posAttr && index < posAttr.count) {
          return { x: posAttr.getX(index), y: posAttr.getY(index), z: posAttr.getZ(index) };
        }
        return { x: 0, y: 0, z: 0 };
      };
    }

    // For Normal input nodes, directly return per-vertex normal
    if (
      upstreamType === 'GeometryNodeInputNormal' || upstreamType === 'input_normal'
      || upstreamType === 'InputNormalNode' || upstreamType === 'Normal'
    ) {
      return (_index: number, _position: any, normal: { x: number; y: number; z: number }) => {
        return normal;
      };
    }

    // For Index input nodes, return the index itself
    if (
      upstreamType === 'GeometryNodeInputIndex' || upstreamType === 'input_index'
      || upstreamType === 'IndexNode' || upstreamType === 'Index'
    ) {
      return (index: number) => index;
    }

    // For ID input nodes, return the index (ID = index for now)
    if (
      upstreamType === 'GeometryNodeInputID' || upstreamType === 'input_id'
      || upstreamType === 'IDNode' || upstreamType === 'InputID'
    ) {
      return (index: number) => index;
    }

    // For other nodes, try to re-evaluate per-vertex by overriding
    // the Position/Normal/Index inputs in the upstream subgraph
    return (index: number, position: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }) => {
      try {
        // Temporarily override the cache for position/normal/index nodes
        // that feed into the upstream subgraph
        const overrides: Map<string, any> = new Map();
        this.overridePerVertexInputs(upstreamNodeId, graph, index, position, normal, overrides);

        // Re-evaluate the upstream node (clear its cache first)
        const cacheKey = `node:${upstreamNodeId}`;
        const prevCache = this.cache.get(cacheKey);
        this.cache.delete(cacheKey);

        // Also clear any transitive upstream nodes that were overridden
        for (const key of overrides.keys()) {
          this.cache.delete(key);
        }

        const result = this.evaluateNode(upstreamNode, graph);
        const outputValue = result instanceof Map
          ? result.get(upstreamSocket)
          : typeof result === 'object' && result !== null
            ? (result as any)[upstreamSocket]
            : result;

        // Restore the original cache
        if (prevCache !== undefined) {
          this.cache.set(cacheKey, prevCache);
        }
        for (const [key, prevValue] of overrides.entries()) {
          if (prevValue === undefined) {
            this.cache.delete(key);
          } else {
            this.cache.set(key, prevValue);
          }
        }

        return outputValue;
      } catch {
        return 0;
      }
    };
  }

  /**
   * Override per-vertex input nodes in the upstream subgraph with
   * per-element values. This allows re-evaluation of the subgraph
   * with different vertex contexts.
   */
  private overridePerVertexInputs(
    rootNodeId: string,
    graph: NodeGraph,
    elementIndex: number,
    position: { x: number; y: number; z: number },
    normal: { x: number; y: number; z: number },
    overrides: Map<string, any>,
  ): void {
    // Find all input nodes that feed into the upstream subgraph
    // and override their outputs with per-vertex values
    const visited = new Set<string>();
    const stack = [rootNodeId];

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = graph.nodes.get(nodeId);
      if (!node) continue;

      const nodeType = node.type;

      // Override Position node output
      if (
        nodeType === 'GeometryNodeInputPosition' || nodeType === 'input_position'
        || nodeType === 'InputPositionNode' || nodeType === 'Position'
      ) {
        const cacheKey = `node:${nodeId}`;
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { Position: position });
      }

      // Override Normal node output
      if (
        nodeType === 'GeometryNodeInputNormal' || nodeType === 'input_normal'
        || nodeType === 'InputNormalNode' || nodeType === 'Normal'
      ) {
        const cacheKey = `node:${nodeId}`;
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { Normal: normal });
      }

      // Override Index node output
      if (
        nodeType === 'GeometryNodeInputIndex' || nodeType === 'input_index'
        || nodeType === 'IndexNode' || nodeType === 'Index'
      ) {
        const cacheKey = `node:${nodeId}`;
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { Index: elementIndex });
      }

      // Override ID node output
      if (
        nodeType === 'GeometryNodeInputID' || nodeType === 'input_id'
        || nodeType === 'IDNode' || nodeType === 'InputID'
      ) {
        const cacheKey = `node:${nodeId}`;
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { ID: elementIndex });
      }

      // Walk upstream
      for (const link of graph.links) {
        if (link.toNode === nodeId) {
          stack.push(link.fromNode);
        }
      }
    }
  }

  /**
   * Get the output of a node (from cache or by evaluation)
   */
  private getNodeOutput(node: NodeInstance): any {
    const cacheKey = `node:${node.id}`;
    return this.cache.get(cacheKey) ?? node.outputs;
  }

  /**
   * Execute a node based on its type
   */
  private executeNodeByType(node: NodeInstance, inputs: Record<string, any>): any {
    const nodeType = node.type;

    // Shader nodes
    if (nodeType === 'principled_bsdf' || nodeType === 'ShaderNodeBsdfPrincipled' || nodeType === 'PrincipledBSDFNode') {
      return this.executePrincipledBSDF(inputs);
    }
    if (nodeType === 'bsdf_diffuse' || nodeType === 'ShaderNodeBsdfDiffuse' || nodeType === 'DiffuseBSDFNode') {
      return this.executeDiffuseBSDF(inputs);
    }
    if (nodeType === 'bsdf_glossy' || nodeType === 'ShaderNodeBsdfGlossy' || nodeType === 'GlossyBSDFNode') {
      return this.executeGlossyBSDF(inputs);
    }
    if (nodeType === 'bsdf_glass' || nodeType === 'ShaderNodeBsdfGlass' || nodeType === 'GlassBSDFNode') {
      return this.executeGlassBSDF(inputs);
    }
    if (nodeType === 'emission' || nodeType === 'ShaderNodeEmission' || nodeType === 'EmissionNode') {
      return this.executeEmission(inputs);
    }
    if (nodeType === 'mix_shader' || nodeType === 'ShaderNodeMixShader' || nodeType === 'MixShaderNode') {
      return this.executeMixShader(inputs);
    }
    if (nodeType === 'add_shader' || nodeType === 'ShaderNodeAddShader' || nodeType === 'AddShaderNode') {
      return this.executeAddShader(inputs);
    }

    // Texture nodes
    if (nodeType === 'ShaderNodeTexNoise' || nodeType === 'noise_texture' || nodeType === 'NoiseTextureNode') {
      return this.executeNoiseTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexVoronoi' || nodeType === 'voronoi_texture' || nodeType === 'VoronoiTextureNode') {
      return this.executeVoronoiTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexMusgrave' || nodeType === 'musgrave_texture' || nodeType === 'MusgraveTextureNode') {
      return this.executeMusgraveTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexGradient' || nodeType === 'gradient_texture' || nodeType === 'GradientTextureNode') {
      return this.executeGradientTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexBrick' || nodeType === 'brick_texture' || nodeType === 'BrickTextureNode') {
      return P1Executors.executeBrickTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexChecker' || nodeType === 'checker_texture' || nodeType === 'CheckerTextureNode') {
      return P1Executors.executeCheckerTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexMagic' || nodeType === 'magic_texture' || nodeType === 'MagicTextureNode') {
      return P1Executors.executeMagicTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexImage' || nodeType === 'image_texture' || nodeType === 'ImageTextureNode') {
      return P1Executors.executeImageTexture(inputs, node.settings);
    }

    // Color nodes
    if (nodeType === 'ShaderNodeMixRGB' || nodeType === 'mix_rgb' || nodeType === 'MixRGBNode') {
      return this.executeMixRGB(inputs);
    }
    if (nodeType === 'ShaderNodeValToRGB' || nodeType === 'color_ramp' || nodeType === 'ColorRampNode') {
      return this.executeColorRamp(inputs);
    }
    if (nodeType === 'ShaderNodeHueSaturation' || nodeType === 'hue_saturation' || nodeType === 'HueSaturationNode') {
      return P1Executors.executeHueSaturationValue(inputs);
    }
    if (nodeType === 'ShaderNodeInvert' || nodeType === 'invert' || nodeType === 'InvertNode') {
      return P1Executors.executeInvertColor(inputs);
    }
    if (nodeType === 'CompositorNodeBrightContrast' || nodeType === 'bright_contrast' || nodeType === 'BrightContrastNode') {
      return P1Executors.executeBrightContrast(inputs);
    }

    // Math nodes
    if (nodeType === 'ShaderNodeMath' || nodeType === 'math' || nodeType === 'MathNode') {
      return this.executeMath(inputs);
    }
    if (nodeType === 'ShaderNodeVectorMath' || nodeType === 'vector_math' || nodeType === 'VectorMathNode') {
      return this.executeVectorMath(inputs);
    }

    // Vector nodes
    if (nodeType === 'ShaderNodeMapping' || nodeType === 'mapping' || nodeType === 'MappingNode') {
      return this.executeMapping(inputs, node.settings);
    }
    if (nodeType === 'ShaderNodeCombineXYZ' || nodeType === 'combine_xyz' || nodeType === 'CombineXYZNode') {
      return this.executeCombineXYZ(inputs);
    }
    if (nodeType === 'ShaderNodeSeparateXYZ' || nodeType === 'separate_xyz' || nodeType === 'SeparateXYZNode') {
      return this.executeSeparateXYZ(inputs);
    }
    if (nodeType === 'ShaderNodeBump' || nodeType === 'bump' || nodeType === 'BumpNode') {
      return P1Executors.executeBump(inputs);
    }
    if (nodeType === 'ShaderNodeDisplacement' || nodeType === 'displacement' || nodeType === 'DisplacementNode') {
      return P1Executors.executeDisplacement(inputs);
    }
    if (nodeType === 'ShaderNodeNormalMap' || nodeType === 'normal_map' || nodeType === 'NormalMapNode') {
      return P1Executors.executeNormalMap(inputs);
    }

    // Texture coordinate
    if (nodeType === 'ShaderNodeTexCoord' || nodeType === 'texture_coordinate' || nodeType === 'TextureCoordinateNode') {
      return this.executeTextureCoordinate(inputs);
    }

    // Input nodes
    if (nodeType === 'GeometryNodeObjectInfo' || nodeType === 'object_info' || nodeType === 'ObjectInfoNode') {
      return P1Executors.executeObjectInfo(inputs, node.settings);
    }
    if (nodeType === 'ShaderNodeValue' || nodeType === 'value' || nodeType === 'ValueNode') {
      return P1Executors.executeValueNode(inputs, node.settings);
    }
    if (nodeType === 'ShaderNodeRGB' || nodeType === 'rgb' || nodeType === 'RGBNode') {
      return P1Executors.executeRGBNode(inputs, node.settings);
    }

    // =========================================================================
    // Core Geometry Node Executors (from CoreNodeExecutors.ts)
    // =========================================================================

    // Geometry Distribution
    if (nodeType === 'DistributePointsOnFaces' || nodeType === 'DistributePointsOnFacesNode' || nodeType === 'distribute_points_on_faces') {
      return CoreExecutors.executeDistributePointsOnFaces(inputs);
    }
    if (nodeType === 'InstanceOnPoints' || nodeType === 'InstanceOnPointsNode' || nodeType === 'instance_on_points') {
      return CoreExecutors.executeInstanceOnPoints(inputs);
    }
    if (nodeType === 'RealizeInstances' || nodeType === 'RealizeInstancesNode' || nodeType === 'realize_instances') {
      return CoreExecutors.executeRealizeInstances(inputs);
    }

    // Geometry Sampling
    if (nodeType === 'Proximity' || nodeType === 'ProximityNode' || nodeType === 'GeometryNodeProximity' || nodeType === 'proximity') {
      return CoreExecutors.executeProximity(inputs);
    }
    if (nodeType === 'Raycast' || nodeType === 'RaycastNode' || nodeType === 'GeometryNodeRaycast' || nodeType === 'raycast') {
      return CoreExecutors.executeRaycast(inputs);
    }
    if (nodeType === 'SampleNearestSurface' || nodeType === 'SampleNearestSurfaceNode' || nodeType === 'sample_nearest_surface') {
      return CoreExecutors.executeSampleNearestSurface(inputs);
    }

    // Geometry Operations
    if (nodeType === 'ConvexHull' || nodeType === 'ConvexHullNode' || nodeType === 'convex_hull') {
      return CoreExecutors.executeConvexHull(inputs);
    }
    if (nodeType === 'MergeByDistance' || nodeType === 'MergeByDistanceNode' || nodeType === 'merge_by_distance') {
      return CoreExecutors.executeMergeByDistance(inputs);
    }
    if (nodeType === 'SmoothByAngle' || nodeType === 'smooth_by_angle' || nodeType === 'SmoothByAngleNode') {
      return CoreExecutors.executeSmoothByAngle(inputs);
    }
    if (nodeType === 'EdgeSplit' || nodeType === 'edge_split' || nodeType === 'EdgeSplitNode') {
      return CoreExecutors.executeEdgeSplit(inputs);
    }

    // Curve Operations
    if (nodeType === 'CurveToMesh' || nodeType === 'CurveToMeshNode' || nodeType === 'curve_to_mesh') {
      return CoreExecutors.executeCurveToMesh(inputs);
    }
    if (nodeType === 'ResampleCurve' || nodeType === 'ResampleCurveNode' || nodeType === 'curve_resample' || nodeType === 'resample_curve') {
      return CoreExecutors.executeCurveResample(inputs);
    }
    if (nodeType === 'FillCurve' || nodeType === 'FillCurveNode' || nodeType === 'fill_curve') {
      return CoreExecutors.executeFillCurve(inputs);
    }
    if (nodeType === 'TrimCurve' || nodeType === 'TrimCurveNode' || nodeType === 'trim_curve') {
      return CoreExecutors.executeTrimCurve(inputs);
    }

    // Mesh Analysis
    if (nodeType === 'MeshBoolean' || nodeType === 'MeshBooleanNode' || nodeType === 'Boolean' || nodeType === 'BooleanUnionNode' || nodeType === 'BooleanIntersectNode' || nodeType === 'BooleanDifferenceNode' || nodeType === 'mesh_boolean') {
      return CoreExecutors.executeMeshBoolean(inputs);
    }
    if (nodeType === 'MeshToCurve' || nodeType === 'MeshToCurveNode' || nodeType === 'mesh_to_curve') {
      return CoreExecutors.executeMeshToCurve(inputs);
    }
    if (nodeType === 'FaceSetBoundaries' || nodeType === 'FaceSetBoundariesNode' || nodeType === 'face_set_boundaries') {
      return CoreExecutors.executeFaceSetBoundaries(inputs);
    }

    // Attribute
    if (nodeType === 'StoreNamedAttribute' || nodeType === 'StoreNamedAttributeNode' || nodeType === 'store_named_attribute') {
      return CoreExecutors.executeStoreNamedAttribute(inputs);
    }
    if (nodeType === 'NamedAttribute' || nodeType === 'NamedAttributeNode' || nodeType === 'named_attribute') {
      return CoreExecutors.executeNamedAttribute(inputs);
    }
    if (nodeType === 'AttributeStatistic' || nodeType === 'AttributeStatisticNode' || nodeType === 'attribute_statistic') {
      return CoreExecutors.executeAttributeStatistic(inputs);
    }

    // =========================================================================
    // Extended Node Executors (from ExtendedNodeExecutors.ts)
    // =========================================================================

    // Curve Nodes
    if (nodeType === 'curve_line' || nodeType === 'GeometryNodeCurveLine' || nodeType === 'CurveLineNode') {
      return ExtExecutors.executeCurveLine(inputs);
    }
    if (nodeType === 'quadratic_bezier' || nodeType === 'GeometryNodeQuadraticBezier' || nodeType === 'QuadraticBezierNode') {
      return ExtExecutors.executeQuadraticBezier(inputs);
    }
    if (nodeType === 'bezier_segment' || nodeType === 'GeometryNodeBezierSegment' || nodeType === 'BezierSegmentNode') {
      return ExtExecutors.executeBezierSegment(inputs);
    }
    if (nodeType === 'curve_length' || nodeType === 'GeometryNodeCurveLength' || nodeType === 'CurveLengthNode') {
      return ExtExecutors.executeCurveLength(inputs);
    }
    if (nodeType === 'sample_curve' || nodeType === 'GeometryNodeSampleCurve' || nodeType === 'SampleCurveNode') {
      return ExtExecutors.executeSampleCurve(inputs);
    }

    // Attribute Nodes
    if (nodeType === 'AttributeTransfer' || nodeType === 'AttributeTransferNode' || nodeType === 'GeometryNodeAttributeTransfer' || nodeType === 'attribute_transfer') {
      return ExtExecutors.executeAttributeTransfer(inputs);
    }

    // Input/Output Nodes
    if (nodeType === 'CollectionInfo' || nodeType === 'CollectionInfoNode' || nodeType === 'GeometryNodeCollectionInfo' || nodeType === 'collection_info') {
      return ExtExecutors.executeCollectionInfo(inputs);
    }
    if (nodeType === 'SelfObject' || nodeType === 'SelfObjectNode' || nodeType === 'GeometryNodeSelfObject' || nodeType === 'self_object') {
      return P1Executors.executeSelfObject(inputs);
    }
    if (nodeType === 'input_vector' || nodeType === 'GeometryNodeInputVector' || nodeType === 'NodeInputVector' || nodeType === 'InputVectorNode') {
      return ExtExecutors.executeInputVector(inputs, node.settings);
    }
    if (nodeType === 'input_color' || nodeType === 'GeometryNodeInputColor' || nodeType === 'NodeInputColor' || nodeType === 'InputColorNode') {
      return ExtExecutors.executeInputColor(inputs, node.settings);
    }
    if (nodeType === 'input_int' || nodeType === 'GeometryNodeInputInt' || nodeType === 'NodeInputInt' || nodeType === 'InputIntNode') {
      return ExtExecutors.executeInputInt(inputs, node.settings);
    }
    if (nodeType === 'input_float' || nodeType === 'GeometryNodeInputFloat' || nodeType === 'NodeInputFloat' || nodeType === 'InputFloatNode') {
      return ExtExecutors.executeInputFloat(inputs, node.settings);
    }
    if (nodeType === 'input_bool' || nodeType === 'GeometryNodeInputBool' || nodeType === 'NodeInputBool' || nodeType === 'InputBoolNode') {
      return ExtExecutors.executeInputBool(inputs, node.settings);
    }

    // Utility Nodes
    if (nodeType === 'clamp' || nodeType === 'ShaderNodeClamp' || nodeType === 'GeometryNodeClamp' || nodeType === 'ClampNode') {
      return ExtExecutors.executeClamp(inputs);
    }
    if (nodeType === 'map_range' || nodeType === 'ShaderNodeMapRange' || nodeType === 'GeometryNodeMapRange' || nodeType === 'MapRangeNode') {
      return P1Executors.executeMapRange(inputs);
    }
    if (nodeType === 'float_to_int' || nodeType === 'GeometryNodeFloatToInt' || nodeType === 'ShaderNodeFloatToInt' || nodeType === 'FloatToIntNode') {
      return ExtExecutors.executeFloatToInt(inputs);
    }
    if (nodeType === 'rotate_euler' || nodeType === 'GeometryNodeRotateEuler' || nodeType === 'RotateEuler' || nodeType === 'RotateEulerNode') {
      return ExtExecutors.executeRotateEuler(inputs);
    }
    if (nodeType === 'rotate_vector' || nodeType === 'GeometryNodeRotateVector' || nodeType === 'RotateVector' || nodeType === 'RotateVectorNode') {
      return ExtExecutors.executeRotateVector(inputs);
    }
    if (nodeType === 'align_euler_to_vector' || nodeType === 'GeometryNodeAlignEulerToVector' || nodeType === 'AlignEulerToVector' || nodeType === 'AlignEulerToVectorNode') {
      return ExtExecutors.executeAlignEulerToVector(inputs);
    }
    if (nodeType === 'switch' || nodeType === 'GeometryNodeSwitch' || nodeType === 'ShaderNodeSwitch' || nodeType === 'SwitchNode') {
      return ExtExecutors.executeSwitch(inputs);
    }
    if (nodeType === 'random_value' || nodeType === 'GeometryNodeRandomValue' || nodeType === 'FunctionNodeRandomValue' || nodeType === 'RandomValueNode') {
      return ExtExecutors.executeRandomValue(inputs);
    }

    // Geometry Utility Nodes
    if (nodeType === 'bounding_box' || nodeType === 'GeometryNodeBoundBox' || nodeType === 'GeometryNodeBoundingBox' || nodeType === 'BoundingBoxNode') {
      return ExtExecutors.executeBoundingBox(inputs);
    }
    if (nodeType === 'geometry_proximity' || nodeType === 'GeometryNodeProximity' || nodeType === 'GeometryProximityNode') {
      return ExtExecutors.executeGeometryProximity(inputs);
    }
    if (nodeType === 'GeometryNodeRaycast' || nodeType === 'RaycastEnhancedNode' || nodeType === 'raycast_enhanced') {
      return ExtExecutors.executeRaycastEnhanced(inputs);
    }
    if (nodeType === 'GeometryNodeSampleNearestSurface' || nodeType === 'SampleNearestSurfaceEnhancedNode' || nodeType === 'sample_nearest_surface_enhanced') {
      return ExtExecutors.executeSampleNearestSurfaceEnhanced(inputs);
    }
    if (nodeType === 'mesh_to_points' || nodeType === 'GeometryNodeMeshToPoints' || nodeType === 'MeshToPointsNode') {
      return ExtExecutors.executeMeshToPoints(inputs);
    }

    // =========================================================================
    // Additional Node Executors (from AdditionalNodeExecutors.ts)
    // =========================================================================

    // Texture Coordinate Nodes
    if (nodeType === 'TextureCoordinate' || nodeType === 'TextureCoordinateNode' || nodeType === 'texture_coordinate' || nodeType === 'ShaderNodeTexCoord') {
      return AddExecutors.executeTextureCoordinate(inputs);
    }
    if (nodeType === 'Mapping' || nodeType === 'MappingNode' || nodeType === 'mapping' || nodeType === 'ShaderNodeMapping') {
      return AddExecutors.executeMapping(inputs);
    }
    if (nodeType === 'UVMap' || nodeType === 'UVMapNode' || nodeType === 'uv_map' || nodeType === 'GeometryNodeInputUVMap') {
      return AddExecutors.executeUVMap(inputs);
    }
    if (nodeType === 'GeometryNodeInputPosition' || nodeType === 'input_position' || nodeType === 'InputPositionNode') {
      return AddExecutors.executeGeometryNodeInputPosition(inputs);
    }
    if (nodeType === 'GeometryNodeInputNormal' || nodeType === 'input_normal' || nodeType === 'InputNormalNode') {
      return AddExecutors.executeGeometryNodeInputNormal(inputs);
    }
    if (nodeType === 'GeometryNodeInputTangent' || nodeType === 'input_tangent' || nodeType === 'InputTangentNode') {
      return AddExecutors.executeGeometryNodeInputTangent(inputs);
    }

    // Geometry Operation Nodes
    if (nodeType === 'SubdivideMesh' || nodeType === 'SubdivideMeshNode' || nodeType === 'subdivide_mesh' || nodeType === 'GeometryNodeSubdivisionSurface') {
      return AddExecutors.executeSubdivideMesh(inputs);
    }
    if (nodeType === 'DecimateMesh' || nodeType === 'DecimateMeshNode' || nodeType === 'decimate_mesh' || nodeType === 'GeometryNodeDecimate') {
      return AddExecutors.executeDecimateMesh(inputs);
    }
    if (nodeType === 'ExtrudeFaces' || nodeType === 'ExtrudeFacesNode' || nodeType === 'extrude_faces' || nodeType === 'GeometryNodeExtrudeFaces') {
      return AddExecutors.executeExtrudeFaces(inputs);
    }
    if (nodeType === 'InsetFaces' || nodeType === 'InsetFacesNode' || nodeType === 'inset_faces' || nodeType === 'GeometryNodeInsetFaces') {
      return AddExecutors.executeInsetFaces(inputs);
    }
    if (nodeType === 'FlipFaces' || nodeType === 'FlipFacesNode' || nodeType === 'flip_faces' || nodeType === 'GeometryNodeFlipFaces') {
      return AddExecutors.executeFlipFaces(inputs);
    }
    if (nodeType === 'RotateMesh' || nodeType === 'RotateMeshNode' || nodeType === 'rotate_mesh' || nodeType === 'GeometryNodeRotateMesh') {
      return AddExecutors.executeRotateMesh(inputs);
    }
    if (nodeType === 'ScaleMesh' || nodeType === 'ScaleMeshNode' || nodeType === 'scale_mesh' || nodeType === 'GeometryNodeScaleMesh') {
      return AddExecutors.executeScaleMesh(inputs);
    }
    if (nodeType === 'TranslateMesh' || nodeType === 'TranslateMeshNode' || nodeType === 'translate_mesh' || nodeType === 'GeometryNodeTranslateMesh') {
      return AddExecutors.executeTranslateMesh(inputs);
    }

    // Texture/Evaluation Nodes
    if (nodeType === 'BrickTexture' || nodeType === 'BrickTextureNode' || nodeType === 'brick_texture' || nodeType === 'ShaderNodeTexBrick') {
      return P1Executors.executeBrickTexture(inputs);
    }
    if (nodeType === 'CheckerTexture' || nodeType === 'CheckerTextureNode' || nodeType === 'checker_texture' || nodeType === 'ShaderNodeTexChecker') {
      return P1Executors.executeCheckerTexture(inputs);
    }
    if (nodeType === 'GradientTexture' || nodeType === 'GradientTextureNode' || nodeType === 'gradient_texture' || nodeType === 'ShaderNodeTexGradient') {
      return AddExecutors.executeGradientTexture(inputs);
    }
    if (nodeType === 'MagicTexture' || nodeType === 'MagicTextureNode' || nodeType === 'magic_texture' || nodeType === 'ShaderNodeTexMagic') {
      return P1Executors.executeMagicTexture(inputs);
    }
    if (nodeType === 'WaveTexture' || nodeType === 'WaveTextureNode' || nodeType === 'wave_texture' || nodeType === 'ShaderNodeTexWave') {
      return AddExecutors.executeWaveTexture(inputs);
    }
    if (nodeType === 'WhiteNoiseTexture' || nodeType === 'WhiteNoiseTextureNode' || nodeType === 'white_noise_texture' || nodeType === 'ShaderNodeTexWhiteNoise') {
      return AddExecutors.executeWhiteNoiseTexture(inputs);
    }

    // Color/Mix Nodes
    if (nodeType === 'ColorRamp' || nodeType === 'ColorRampNode' || nodeType === 'color_ramp' || nodeType === 'ShaderNodeValToRGB') {
      return AddExecutors.executeColorRamp(inputs);
    }
    if (nodeType === 'Curves' || nodeType === 'CurvesNode' || nodeType === 'curves' || nodeType === 'ShaderNodeCurveRGB') {
      return AddExecutors.executeCurves(inputs);
    }
    if (nodeType === 'SeparateColor' || nodeType === 'SeparateColorNode' || nodeType === 'separate_color' || nodeType === 'FunctionNodeSeparateColor') {
      return AddExecutors.executeSeparateColor(inputs);
    }
    if (nodeType === 'CombineColor' || nodeType === 'CombineColorNode' || nodeType === 'combine_color' || nodeType === 'FunctionNodeCombineColor') {
      return AddExecutors.executeCombineColor(inputs);
    }

    // Math/Utility Nodes
    if (nodeType === 'BooleanMath' || nodeType === 'BooleanMathNode' || nodeType === 'boolean_math' || nodeType === 'FunctionNodeBooleanMath') {
      return AddExecutors.executeBooleanMath(inputs);
    }
    if (nodeType === 'FloatCompare' || nodeType === 'FloatCompareNode' || nodeType === 'float_compare' || nodeType === 'FunctionNodeFloatCompare') {
      return AddExecutors.executeFloatCompare(inputs);
    }
    if (nodeType === 'MapRangeVector' || nodeType === 'MapRangeVectorNode' || nodeType === 'map_range_vector' || nodeType === 'ShaderNodeVectorMapRange') {
      return AddExecutors.executeMapRangeVector(inputs);
    }
    if (nodeType === 'RotationToEuler' || nodeType === 'RotationToEulerNode' || nodeType === 'rotation_to_euler' || nodeType === 'FunctionNodeRotationToEuler') {
      return AddExecutors.executeRotationToEuler(inputs);
    }
    if (nodeType === 'EulerToRotation' || nodeType === 'EulerToRotationNode' || nodeType === 'euler_to_rotation' || nodeType === 'FunctionNodeEulerToRotation') {
      return AddExecutors.executeEulerToRotation(inputs);
    }
    if (nodeType === 'AccumulateField' || nodeType === 'AccumulateFieldNode' || nodeType === 'accumulate_field' || nodeType === 'GeometryNodeAccumulateField') {
      return AddExecutors.executeAccumulateField(inputs);
    }

    // =========================================================================
    // Expanded Node Executors (from ExpandedNodeExecutors.ts)
    // =========================================================================

    // Mesh Topology Nodes
    if (nodeType === 'DualMesh' || nodeType === 'DualMeshNode' || nodeType === 'dual_mesh' || nodeType === 'GeometryNodeDualMesh') {
      return ExpExecutors.executeDualMesh(inputs);
    }
    if (nodeType === 'EdgeNeighbors' || nodeType === 'EdgeNeighborsNode' || nodeType === 'edge_neighbors' || nodeType === 'GeometryNodeInputEdgeNeighbors') {
      return ExpExecutors.executeEdgeNeighbors(inputs);
    }
    if (nodeType === 'EdgeVertices' || nodeType === 'EdgeVerticesNode' || nodeType === 'edge_vertices' || nodeType === 'GeometryNodeInputEdgeVertices') {
      return ExpExecutors.executeEdgeVertices(inputs);
    }
    if (nodeType === 'FaceArea' || nodeType === 'FaceAreaNode' || nodeType === 'face_area' || nodeType === 'GeometryNodeInputMeshFaceArea') {
      return ExpExecutors.executeFaceArea(inputs);
    }
    if (nodeType === 'VertexNeighbors' || nodeType === 'VertexNeighborsNode' || nodeType === 'vertex_neighbors' || nodeType === 'GeometryNodeInputMeshVertexNeighbors') {
      return ExpExecutors.executeVertexNeighbors(inputs);
    }
    if (nodeType === 'EdgesOfFace' || nodeType === 'EdgesOfFaceNode' || nodeType === 'edges_of_face' || nodeType === 'GeometryNodeInputMeshFaceEdges') {
      return ExpExecutors.executeEdgesOfFace(inputs);
    }
    if (nodeType === 'FacesOfEdge' || nodeType === 'FacesOfEdgeNode' || nodeType === 'faces_of_edge' || nodeType === 'GeometryNodeInputMeshEdgeFaces') {
      return ExpExecutors.executeFacesOfEdge(inputs);
    }

    // Attribute Nodes
    if (nodeType === 'CaptureAttribute' || nodeType === 'CaptureAttributeNode' || nodeType === 'capture_attribute' || nodeType === 'GeometryNodeCaptureAttribute') {
      return ExpExecutors.executeCaptureAttribute(inputs);
    }
    if (nodeType === 'RemoveAttribute' || nodeType === 'RemoveAttributeNode' || nodeType === 'remove_attribute' || nodeType === 'GeometryNodeRemoveAttribute') {
      return ExpExecutors.executeRemoveAttribute(inputs);
    }
    if (nodeType === 'SampleIndex' || nodeType === 'SampleIndexNode' || nodeType === 'sample_index' || nodeType === 'GeometryNodeSampleIndex') {
      return ExpExecutors.executeSampleIndex(inputs);
    }
    if (nodeType === 'SampleNearest' || nodeType === 'SampleNearestNode' || nodeType === 'sample_nearest' || nodeType === 'GeometryNodeSampleNearest') {
      return ExpExecutors.executeSampleNearest(inputs);
    }
    if (nodeType === 'DomainSize' || nodeType === 'DomainSizeNode' || nodeType === 'domain_size' || nodeType === 'GeometryNodeInputDomainSize') {
      return ExpExecutors.executeDomainSize(inputs);
    }

    // Curve Modifier Nodes
    if (nodeType === 'SetCurveRadius' || nodeType === 'SetCurveRadiusNode' || nodeType === 'set_curve_radius' || nodeType === 'GeometryNodeSetCurveRadius') {
      return ExpExecutors.executeSetCurveRadius(inputs);
    }
    if (nodeType === 'SetCurveTilt' || nodeType === 'SetCurveTiltNode' || nodeType === 'set_curve_tilt' || nodeType === 'GeometryNodeSetCurveTilt') {
      return ExpExecutors.executeSetCurveTilt(inputs);
    }
    if (nodeType === 'SetHandlePositions' || nodeType === 'SetHandlePositionsNode' || nodeType === 'set_handle_positions' || nodeType === 'GeometryNodeSetCurveHandlePositions') {
      return ExpExecutors.executeSetHandlePositions(inputs);
    }
    if (nodeType === 'SplineParameter' || nodeType === 'SplineParameterNode' || nodeType === 'spline_parameter' || nodeType === 'GeometryNodeSplineParameter') {
      return ExpExecutors.executeSplineParameter(inputs);
    }
    if (nodeType === 'FilletCurve' || nodeType === 'FilletCurveNode' || nodeType === 'fillet_curve' || nodeType === 'GeometryNodeFilletCurve') {
      return ExpExecutors.executeFilletCurve(inputs);
    }

    // Instance Transform Nodes
    if (nodeType === 'TranslateInstances' || nodeType === 'TranslateInstancesNode' || nodeType === 'translate_instances' || nodeType === 'GeometryNodeTranslateInstances') {
      return ExpExecutors.executeTranslateInstances(inputs);
    }
    if (nodeType === 'RotateInstances' || nodeType === 'RotateInstancesNode' || nodeType === 'rotate_instances' || nodeType === 'GeometryNodeRotateInstances') {
      return ExpExecutors.executeRotateInstances(inputs);
    }
    if (nodeType === 'ScaleInstances' || nodeType === 'ScaleInstancesNode' || nodeType === 'scale_instances' || nodeType === 'GeometryNodeScaleInstances') {
      return ExpExecutors.executeScaleInstances(inputs);
    }

    // Volume/Point Conversion Nodes
    if (nodeType === 'VolumeToMesh' || nodeType === 'VolumeToMeshNode' || nodeType === 'volume_to_mesh' || nodeType === 'GeometryNodeVolumeToMesh') {
      return ExpExecutors.executeVolumeToMesh(inputs);
    }
    if (nodeType === 'VolumeToPoints' || nodeType === 'VolumeToPointsNode' || nodeType === 'volume_to_points' || nodeType === 'GeometryNodeVolumeToPoints') {
      return ExpExecutors.executeVolumeToPoints(inputs);
    }
    if (nodeType === 'PointsToVertices' || nodeType === 'PointsToVerticesNode' || nodeType === 'points_to_vertices' || nodeType === 'GeometryNodePointsToVertices') {
      return ExpExecutors.executePointsToVertices(inputs);
    }
    if (nodeType === 'PointsToCurves' || nodeType === 'PointsToCurvesNode' || nodeType === 'points_to_curves' || nodeType === 'GeometryNodePointsToCurves') {
      return ExpExecutors.executePointsToCurves(inputs);
    }

    // Geometry Operation Nodes
    if (nodeType === 'SetPosition' || nodeType === 'SetPositionNode' || nodeType === 'set_position' || nodeType === 'GeometryNodeSetPosition') {
      return ExpExecutors.executeSetPosition(inputs);
    }
    if (nodeType === 'DuplicateElements' || nodeType === 'DuplicateElementsNode' || nodeType === 'duplicate_elements' || nodeType === 'GeometryNodeDuplicateElements') {
      return ExpExecutors.executeDuplicateElements(inputs);
    }
    if (nodeType === 'SetShadeSmooth' || nodeType === 'SetShadeSmoothNode' || nodeType === 'set_shade_smooth' || nodeType === 'GeometryNodeSetShadeSmooth') {
      return ExpExecutors.executeSetShadeSmooth(inputs);
    }

    // Shader Input / Light Nodes
    if (nodeType === 'LightFalloff' || nodeType === 'LightFalloffNode' || nodeType === 'light_falloff' || nodeType === 'ShaderNodeLightFalloff') {
      return ExpExecutors.executeLightFalloff(inputs);
    }
    if (nodeType === 'ObjectIndex' || nodeType === 'ObjectIndexNode' || nodeType === 'object_index' || nodeType === 'GeometryNodeInputObjectIndex') {
      return ExpExecutors.executeObjectIndex(inputs, node.settings);
    }
    if (nodeType === 'IsCameraRay' || nodeType === 'IsCameraRayNode' || nodeType === 'is_camera_ray' || nodeType === 'ShaderNodeIsCameraRay') {
      return ExpExecutors.executeIsCameraRay(inputs);
    }

    // =========================================================================
    // Essential Node Executors (from EssentialNodeExecutors.ts) — 32 executors
    // =========================================================================

    // Geometry Merge/Split/Delete
    if (nodeType === 'JoinGeometry' || nodeType === 'join_geometry' || nodeType === 'GeometryNodeJoinGeometry' || nodeType === 'JoinGeometryNode') {
      return EssentialExecutors.executeJoinGeometry(inputs);
    }
    if (nodeType === 'SeparateGeometry' || nodeType === 'separate_geometry' || nodeType === 'GeometryNodeSeparateGeometry' || nodeType === 'SeparateGeometryNode') {
      return EssentialExecutors.executeSeparateGeometry(inputs);
    }
    if (nodeType === 'DeleteGeometry' || nodeType === 'delete_geometry' || nodeType === 'GeometryNodeDeleteGeometry' || nodeType === 'DeleteGeometryNode') {
      return EssentialExecutors.executeDeleteGeometry(inputs);
    }

    // Transform & Triangulate
    if (nodeType === 'Transform' || nodeType === 'transform' || nodeType === 'GeometryNodeTransform' || nodeType === 'TransformNode') {
      return EssentialExecutors.executeTransform(inputs);
    }
    if (nodeType === 'Triangulate' || nodeType === 'triangulate' || nodeType === 'GeometryNodeTriangulate' || nodeType === 'TriangulateNode') {
      return EssentialExecutors.executeTriangulate(inputs);
    }

    // Material
    if (nodeType === 'SetMaterial' || nodeType === 'set_material' || nodeType === 'GeometryNodeSetMaterial' || nodeType === 'SetMaterialNode') {
      return EssentialExecutors.executeSetMaterial(inputs);
    }

    // Curve Operations
    if (nodeType === 'CurveToPoints' || nodeType === 'curve_to_points' || nodeType === 'GeometryNodeCurveToPoints' || nodeType === 'CurveToPointsNode') {
      return EssentialExecutors.executeCurveToPoints(inputs);
    }
    if (nodeType === 'ReverseCurve' || nodeType === 'reverse_curve' || nodeType === 'GeometryNodeReverseCurve' || nodeType === 'ReverseCurveNode') {
      return EssentialExecutors.executeReverseCurve(inputs);
    }
    if (nodeType === 'SubdivideCurve' || nodeType === 'subdivide_curve' || nodeType === 'GeometryNodeSubdivideCurve' || nodeType === 'SubdivideCurveNode') {
      return EssentialExecutors.executeSubdivideCurve(inputs);
    }
    if (nodeType === 'CurveCircle' || nodeType === 'curve_circle' || nodeType === 'GeometryNodeCurveCircle' || nodeType === 'CurveCircleNode') {
      return EssentialExecutors.executeCurveCircle(inputs);
    }

    // Mesh Operations
    if (nodeType === 'ExtrudeMesh' || nodeType === 'extrude_mesh' || nodeType === 'GeometryNodeExtrudeMesh' || nodeType === 'ExtrudeMeshNode') {
      return EssentialExecutors.executeExtrudeMesh(inputs);
    }
    if (nodeType === 'SetMeshNormals' || nodeType === 'set_mesh_normals' || nodeType === 'GeometryNodeSetMeshNormals' || nodeType === 'SetMeshNormalsNode') {
      return EssentialExecutors.executeSetMeshNormals(inputs);
    }
    if (nodeType === 'MeshToVolume' || nodeType === 'mesh_to_volume' || nodeType === 'GeometryNodeMeshToVolume' || nodeType === 'MeshToVolumeNode') {
      return EssentialExecutors.executeMeshToVolume(inputs);
    }
    if (nodeType === 'DistributePointsInVolume' || nodeType === 'distribute_points_in_volume' || nodeType === 'GeometryNodeDistributePointsInVolume' || nodeType === 'DistributePointsInVolumeNode') {
      return EssentialExecutors.executeDistributePointsInVolume(inputs);
    }

    // Color Operations
    if (nodeType === 'CombineHSV' || nodeType === 'combine_hsv' || nodeType === 'ShaderNodeCombineHSV' || nodeType === 'CombineHSVNode') {
      return EssentialExecutors.executeCombineHSV(inputs);
    }
    if (nodeType === 'CombineRGB' || nodeType === 'combine_rgb' || nodeType === 'ShaderNodeCombineRGB' || nodeType === 'CombineRGBNode') {
      return EssentialExecutors.executeCombineRGB(inputs);
    }
    if (nodeType === 'SeparateRGB' || nodeType === 'separate_rgb' || nodeType === 'ShaderNodeSeparateRGB' || nodeType === 'SeparateRGBNode') {
      return EssentialExecutors.executeSeparateRGB(inputs);
    }
    if (nodeType === 'RGBCurve' || nodeType === 'rgb_curve' || nodeType === 'ShaderNodeCurveRGB' || nodeType === 'RGBCurveNode') {
      return EssentialExecutors.executeRGBCurve(inputs);
    }

    // Mix & Compare
    if (nodeType === 'Mix' || nodeType === 'ShaderNodeMix' || nodeType === 'GeometryNodeMix' || nodeType === 'MixNode') {
      return EssentialExecutors.executeMix(inputs);
    }
    if (nodeType === 'Compare' || nodeType === 'compare' || nodeType === 'FunctionNodeCompare' || nodeType === 'CompareNode') {
      return EssentialExecutors.executeCompare(inputs);
    }

    // Input Nodes
    if (nodeType === 'Integer' || nodeType === 'integer' || nodeType === 'GeometryNodeInputInt' || nodeType === 'IntegerNode') {
      return EssentialExecutors.executeInteger(inputs);
    }
    if (nodeType === 'Index' || nodeType === 'index' || nodeType === 'GeometryNodeInputIndex' || nodeType === 'IndexNode') {
      return EssentialExecutors.executeIndex(inputs);
    }
    if (nodeType === 'InputID' || nodeType === 'input_id' || nodeType === 'GeometryNodeInputID' || nodeType === 'InputIDNode') {
      return EssentialExecutors.executeInputID(inputs);
    }
    if (nodeType === 'InputEdgeVertices' || nodeType === 'input_edge_vertices' || nodeType === 'GeometryNodeInputMeshEdgeVertices' || nodeType === 'InputEdgeVerticesNode') {
      return EssentialExecutors.executeInputEdgeVertices(inputs);
    }

    // Ambient Occlusion
    if (nodeType === 'AmbientOcclusion' || nodeType === 'ambient_occlusion' || nodeType === 'ShaderNodeAmbientOcclusion' || nodeType === 'AmbientOcclusionNode') {
      return EssentialExecutors.executeAmbientOcclusion(inputs);
    }

    // Material Index
    if (nodeType === 'SetMaterialIndex' || nodeType === 'set_material_index' || nodeType === 'GeometryNodeSetMaterialIndex' || nodeType === 'SetMaterialIndexNode') {
      return EssentialExecutors.executeSetMaterialIndex(inputs);
    }
    if (nodeType === 'MaterialIndex' || nodeType === 'material_index' || nodeType === 'GeometryNodeInputMaterialIndex' || nodeType === 'MaterialIndexNode') {
      return EssentialExecutors.executeMaterialIndex(inputs);
    }

    // Mesh Offset & Subdivision
    if (nodeType === 'OffsetMesh' || nodeType === 'offset_mesh' || nodeType === 'GeometryNodeOffsetMesh' || nodeType === 'OffsetMeshNode') {
      return EssentialExecutors.executeOffsetMesh(inputs);
    }
    if (nodeType === 'SubdivisionSurface' || nodeType === 'subdivision_surface' || nodeType === 'GeometryNodeSubdivisionSurface' || nodeType === 'SubdivisionSurfaceNode') {
      return EssentialExecutors.executeSubdivisionSurface(inputs);
    }

    // UV Operations
    if (nodeType === 'SetUV' || nodeType === 'set_uv' || nodeType === 'GeometryNodeSetUV' || nodeType === 'SetUVNode') {
      return EssentialExecutors.executeSetUV(inputs);
    }
    if (nodeType === 'UVWarp' || nodeType === 'uv_warp' || nodeType === 'GeometryNodeUVWarp' || nodeType === 'UVWarpNode') {
      return EssentialExecutors.executeUVWarp(inputs);
    }

    // Group I/O
    if (nodeType === 'GroupInput' || nodeType === 'group_input' || nodeType === 'NodeGroupInput' || nodeType === 'GroupInputNode') {
      return EssentialExecutors.executeGroupInput(inputs);
    }
    if (nodeType === 'GroupOutput' || nodeType === 'group_output' || nodeType === 'NodeGroupOutput' || nodeType === 'GroupOutputNode') {
      return EssentialExecutors.executeGroupOutput(inputs);
    }

    // =========================================================================
    // Specialized Node Executors (from SpecializedNodeExecutors.ts) — 41 executors
    // =========================================================================

    // Shader Input Nodes
    if (nodeType === 'LayerWeight' || nodeType === 'layer_weight' || nodeType === 'ShaderNodeLayerWeight' || nodeType === 'LayerWeightNode') {
      return SpecializedExecutors.executeLayerWeight(inputs);
    }
    if (nodeType === 'LightPath' || nodeType === 'light_path' || nodeType === 'ShaderNodeLightPath' || nodeType === 'LightPathNode') {
      return SpecializedExecutors.executeLightPath(inputs);
    }
    if (nodeType === 'Wireframe' || nodeType === 'wireframe' || nodeType === 'ShaderNodeWireframe' || nodeType === 'WireframeNode') {
      return SpecializedExecutors.executeWireframe(inputs);
    }
    if (nodeType === 'ShaderObjectInfo' || nodeType === 'shader_object_info' || nodeType === 'ShaderNodeObjectInfo' || nodeType === 'ShaderObjectInfoNode') {
      return SpecializedExecutors.executeShaderObjectInfo(inputs);
    }
    if (nodeType === 'ParticleInfo' || nodeType === 'particle_info' || nodeType === 'ShaderNodeParticleInfo' || nodeType === 'ParticleInfoNode') {
      return SpecializedExecutors.executeParticleInfo(inputs);
    }
    if (nodeType === 'CameraData' || nodeType === 'camera_data' || nodeType === 'ShaderNodeCameraData' || nodeType === 'CameraDataNode') {
      return SpecializedExecutors.executeCameraData(inputs);
    }
    if (nodeType === 'HairInfo' || nodeType === 'hair_info' || nodeType === 'ShaderNodeHairInfo' || nodeType === 'HairInfoNode') {
      return SpecializedExecutors.executeHairInfo(inputs);
    }
    if (nodeType === 'NewGeometry' || nodeType === 'new_geometry' || nodeType === 'ShaderNodeNewGeometry' || nodeType === 'NewGeometryNode') {
      return SpecializedExecutors.executeNewGeometry(inputs);
    }
    if (nodeType === 'BlackBody' || nodeType === 'blackbody' || nodeType === 'ShaderNodeBlackbody' || nodeType === 'BlackBodyNode') {
      return SpecializedExecutors.executeBlackBody(inputs);
    }

    // Color/Wavelength Nodes
    if (nodeType === 'Wavelength' || nodeType === 'wavelength' || nodeType === 'ShaderNodeWavelength' || nodeType === 'WavelengthNode') {
      return SpecializedExecutors.executeWavelength(inputs);
    }
    if (nodeType === 'Bevel' || nodeType === 'bevel' || nodeType === 'ShaderNodeBevel' || nodeType === 'BevelNode') {
      return SpecializedExecutors.executeBevel(inputs);
    }

    // Vector/Math Nodes
    if (nodeType === 'Normalize' || nodeType === 'normalize' || nodeType === 'ShaderNodeVectorMathNormalize' || nodeType === 'NormalizeNode') {
      return SpecializedExecutors.executeNormalize(inputs);
    }
    if (nodeType === 'VectorRotate' || nodeType === 'vector_rotate' || nodeType === 'ShaderNodeVectorRotate' || nodeType === 'VectorRotateNode') {
      return SpecializedExecutors.executeVectorRotate(inputs);
    }
    if (nodeType === 'VectorTransform' || nodeType === 'vector_transform' || nodeType === 'ShaderNodeVectorTransform' || nodeType === 'VectorTransformNode') {
      return SpecializedExecutors.executeVectorTransform(inputs);
    }
    if (nodeType === 'Quaternion' || nodeType === 'quaternion' || nodeType === 'FunctionNodeQuaternion' || nodeType === 'QuaternionNode') {
      return SpecializedExecutors.executeQuaternion(inputs);
    }
    if (nodeType === 'MatrixTransform' || nodeType === 'matrix_transform' || nodeType === 'FunctionNodeMatrixTransform' || nodeType === 'MatrixTransformNode') {
      return SpecializedExecutors.executeMatrixTransform(inputs);
    }

    // Attribute Node (legacy)
    if (nodeType === 'Attribute' || nodeType === 'attribute' || nodeType === 'GeometryNodeAttribute' || nodeType === 'AttributeNode') {
      return SpecializedExecutors.executeAttribute(inputs);
    }

    // Curve Spline Type
    if (nodeType === 'CurveSplineType' || nodeType === 'curve_spline_type' || nodeType === 'GeometryNodeCurveSplineType' || nodeType === 'CurveSplineTypeNode') {
      return SpecializedExecutors.executeCurveSplineType(inputs);
    }

    // Topology Nodes
    if (nodeType === 'EdgeAngle' || nodeType === 'edge_angle' || nodeType === 'GeometryNodeInputEdgeAngle' || nodeType === 'EdgeAngleNode') {
      return SpecializedExecutors.executeEdgeAngle(inputs);
    }
    if (nodeType === 'EdgesOfVertex' || nodeType === 'edges_of_vertex' || nodeType === 'GeometryNodeInputMeshVertexEdges' || nodeType === 'EdgesOfVertexNode') {
      return SpecializedExecutors.executeEdgesOfVertex(inputs);
    }
    if (nodeType === 'VerticesOfEdge' || nodeType === 'vertices_of_edge' || nodeType === 'GeometryNodeInputMeshEdgeVertices' || nodeType === 'VerticesOfEdgeNode') {
      return SpecializedExecutors.executeVerticesOfEdge(inputs);
    }
    if (nodeType === 'VerticesOfFace' || nodeType === 'vertices_of_face' || nodeType === 'GeometryNodeInputMeshFaceVertices' || nodeType === 'VerticesOfFaceNode') {
      return SpecializedExecutors.executeVerticesOfFace(inputs);
    }
    if (nodeType === 'FacesOfVertex' || nodeType === 'faces_of_vertex' || nodeType === 'GeometryNodeInputMeshVertexFaces' || nodeType === 'FacesOfVertexNode') {
      return SpecializedExecutors.executeFacesOfVertex(inputs);
    }
    if (nodeType === 'FaceCorners' || nodeType === 'face_corners' || nodeType === 'GeometryNodeInputMeshFaceCorners' || nodeType === 'FaceCornersNode') {
      return SpecializedExecutors.executeFaceCorners(inputs);
    }
    if (nodeType === 'NamedCorner' || nodeType === 'named_corner' || nodeType === 'GeometryNodeInputNamedCorner' || nodeType === 'NamedCornerNode') {
      return SpecializedExecutors.executeNamedCorner(inputs);
    }

    // Exposure & Shader Input Nodes
    if (nodeType === 'Exposure' || nodeType === 'exposure' || nodeType === 'CompositorNodeExposure' || nodeType === 'ExposureNode') {
      return SpecializedExecutors.executeExposure(inputs);
    }
    if (nodeType === 'Normal' || nodeType === 'normal' || nodeType === 'ShaderNodeNormal' || nodeType === 'NormalNode') {
      return SpecializedExecutors.executeNormal(inputs);
    }
    if (nodeType === 'Tangent' || nodeType === 'tangent' || nodeType === 'ShaderNodeTangent' || nodeType === 'TangentNode') {
      return SpecializedExecutors.executeTangent(inputs);
    }
    if (nodeType === 'TrueNormal' || nodeType === 'true_normal' || nodeType === 'ShaderNodeTrueNormal' || nodeType === 'TrueNormalNode') {
      return SpecializedExecutors.executeTrueNormal(inputs);
    }
    if (nodeType === 'MaterialInfo' || nodeType === 'material_info' || nodeType === 'ShaderNodeMaterialInfo' || nodeType === 'MaterialInfoNode') {
      return SpecializedExecutors.executeMaterialInfo(inputs);
    }

    // Mesh Info & Light Nodes
    if (nodeType === 'MeshInfo' || nodeType === 'mesh_info' || nodeType === 'GeometryNodeInputMeshInfo' || nodeType === 'MeshInfoNode') {
      return SpecializedExecutors.executeMeshInfo(inputs);
    }
    if (nodeType === 'PointLight' || nodeType === 'point_light' || nodeType === 'ShaderNodePointLight' || nodeType === 'PointLightNode') {
      return SpecializedExecutors.executePointLight(inputs);
    }
    if (nodeType === 'SpotLight' || nodeType === 'spot_light' || nodeType === 'ShaderNodeSpotLight' || nodeType === 'SpotLightNode') {
      return SpecializedExecutors.executeSpotLight(inputs);
    }
    if (nodeType === 'SunLight' || nodeType === 'sun_light' || nodeType === 'ShaderNodeSunLight' || nodeType === 'SunLightNode') {
      return SpecializedExecutors.executeSunLight(inputs);
    }
    if (nodeType === 'AreaLight' || nodeType === 'area_light' || nodeType === 'ShaderNodeAreaLight' || nodeType === 'AreaLightNode') {
      return SpecializedExecutors.executeAreaLight(inputs);
    }
    if (nodeType === 'LightAttenuation' || nodeType === 'light_attenuation' || nodeType === 'ShaderNodeLightAttenuation' || nodeType === 'LightAttenuationNode') {
      return SpecializedExecutors.executeLightAttenuation(inputs);
    }
    if (nodeType === 'RandomPerIsland' || nodeType === 'random_per_island' || nodeType === 'GeometryNodeInputRandomPerIsland' || nodeType === 'RandomPerIslandNode') {
      return SpecializedExecutors.executeRandomPerIsland(inputs);
    }

    // Texture & Utility Math Nodes
    if (nodeType === 'TextureGabor' || nodeType === 'texture_gabor' || nodeType === 'ShaderNodeTexGabor' || nodeType === 'TextureGaborNode') {
      return SpecializedExecutors.executeTextureGabor(inputs);
    }
    if (nodeType === 'FloorCeil' || nodeType === 'floor_ceil' || nodeType === 'FunctionNodeFloorCeil' || nodeType === 'FloorCeilNode') {
      return SpecializedExecutors.executeFloorCeil(inputs);
    }
    if (nodeType === 'RGBToBW' || nodeType === 'rgb_to_bw' || nodeType === 'ShaderNodeRGBToBW' || nodeType === 'RGBToBWNode') {
      return SpecializedExecutors.executeRGBToBW(inputs);
    }
    if (nodeType === 'FloatCurve' || nodeType === 'float_curve' || nodeType === 'ShaderNodeFloatCurve' || nodeType === 'FloatCurveNode') {
      return P1Executors.executeFloatCurve(inputs);
    }

    // =========================================================================
    // P2 Node Executors (from P2NodeExecutors.ts)
    // Shader BSDF, geometry, texture, curve, and vector nodes.
    // =========================================================================

    // Shader BSDF Nodes
    if (nodeType === 'SubsurfaceScattering' || nodeType === 'SubsurfaceScatteringNode' || nodeType === 'subsurface_scattering' || nodeType === 'ShaderNodeSubsurfaceScattering') {
      return P2Executors.executeSubsurfaceScattering(inputs);
    }
    if (nodeType === 'ToonBSDF' || nodeType === 'ToonBSDFNode' || nodeType === 'toon_bsdf' || nodeType === 'ShaderNodeBsdfToon') {
      return P2Executors.executeToonBSDF(inputs);
    }
    if (nodeType === 'HairBSDF' || nodeType === 'HairBSDFNode' || nodeType === 'hair_bsdf' || nodeType === 'ShaderNodeBsdfHair') {
      return P2Executors.executeHairBSDF(inputs);
    }
    if (nodeType === 'GlassBSDFNode' || nodeType === 'glass_bsdf_p2' || nodeType === 'ShaderNodeBsdfGlassP2') {
      return P2Executors.executeGlassBSDF(inputs);
    }
    if (nodeType === 'RefractionBSDF' || nodeType === 'RefractionBSDFNode' || nodeType === 'refraction_bsdf' || nodeType === 'ShaderNodeBsdfRefraction') {
      return P2Executors.executeRefractionBSDF(inputs);
    }
    if (nodeType === 'Fresnel' || nodeType === 'FresnelNode' || nodeType === 'fresnel' || nodeType === 'ShaderNodeFresnel') {
      return P2Executors.executeFresnel(inputs);
    }

    // Geometry Nodes
    if (nodeType === 'Subdivide' || nodeType === 'SubdivideNode' || nodeType === 'subdivide' || nodeType === 'GeometryNodeSubdivide') {
      return P2Executors.executeSubdivide(inputs);
    }
    if (nodeType === 'Boolean' || nodeType === 'BooleanNode' || nodeType === 'boolean_operation' || nodeType === 'GeometryNodeBoolean') {
      return P2Executors.executeBoolean(inputs);
    }
    if (nodeType === 'Extrude' || nodeType === 'ExtrudeNode' || nodeType === 'extrude' || nodeType === 'GeometryNodeExtrude') {
      return P2Executors.executeExtrude(inputs);
    }
    if (nodeType === 'TransformGeometry' || nodeType === 'TransformGeometryNode' || nodeType === 'transform_geometry' || nodeType === 'GeometryNodeTransformGeometry') {
      return P2Executors.executeTransformGeometry(inputs);
    }
    if (nodeType === 'JoinGeometry' || nodeType === 'JoinGeometryNode' || nodeType === 'join_geometry_p2' || nodeType === 'GeometryNodeJoinGeometryP2') {
      return P2Executors.executeJoinGeometry(inputs);
    }

    // Texture Nodes (P2 dedicated)
    if (nodeType === 'GradientTexture' || nodeType === 'GradientTextureNode' || nodeType === 'gradient_texture_p2' || nodeType === 'ShaderNodeTexGradientP2') {
      return P2Executors.executeGradientTexture(inputs);
    }
    if (nodeType === 'VoronoiTexture' || nodeType === 'VoronoiTextureNode' || nodeType === 'voronoi_texture_p2' || nodeType === 'ShaderNodeTexVoronoiP2') {
      return P2Executors.executeVoronoiTexture(inputs);
    }
    if (nodeType === 'WaveTexture' || nodeType === 'WaveTextureNode' || nodeType === 'wave_texture_p2' || nodeType === 'ShaderNodeTexWaveP2') {
      return P2Executors.executeWaveTexture(inputs);
    }
    if (nodeType === 'WhiteNoiseTexture' || nodeType === 'WhiteNoiseTextureNode' || nodeType === 'white_noise_texture_p2' || nodeType === 'ShaderNodeTexWhiteNoiseP2') {
      return P2Executors.executeWhiteNoiseTexture(inputs);
    }
    if (nodeType === 'ColorRampP2' || nodeType === 'color_ramp_p2' || nodeType === 'ShaderNodeValToRGBP2') {
      return P2Executors.executeColorRamp(inputs);
    }

    // Curve Nodes (P2 dedicated)
    if (nodeType === 'CurveToMeshP2' || nodeType === 'curve_to_mesh_p2' || nodeType === 'GeometryNodeCurveToMeshP2') {
      return P2Executors.executeCurveToMesh(inputs);
    }
    if (nodeType === 'CurveLineP2' || nodeType === 'curve_line_p2' || nodeType === 'GeometryNodeCurveLineP2') {
      return P2Executors.executeCurveLine(inputs);
    }
    if (nodeType === 'BezierSegmentP2' || nodeType === 'bezier_segment_p2' || nodeType === 'GeometryNodeBezierSegmentP2') {
      return P2Executors.executeBezierSegment(inputs);
    }
    if (nodeType === 'QuadraticBezierP2' || nodeType === 'quadratic_bezier_p2' || nodeType === 'GeometryNodeQuadraticBezierP2') {
      return P2Executors.executeQuadraticBezier(inputs);
    }

    // Vector Nodes (P2 dedicated)
    if (nodeType === 'VectorMathP2' || nodeType === 'vector_math_p2' || nodeType === 'ShaderNodeVectorMathP2') {
      return P2Executors.executeVectorMath(inputs);
    }
    if (nodeType === 'VectorRotateP2' || nodeType === 'vector_rotate_p2' || nodeType === 'ShaderNodeVectorRotateP2') {
      return P2Executors.executeVectorRotate(inputs);
    }
    if (nodeType === 'CurveLengthP2' || nodeType === 'curve_length_p2' || nodeType === 'GeometryNodeCurveLengthP2') {
      return P2Executors.executeCurveLength(inputs);
    }

    // =========================================================================
    // Blender-Specific / Compositor / UI Nodes
    // These nodes are intentionally pass-through in R3F — they log a debug
    // message instead of emitting a warning so they don't pollute evaluation.
    // =========================================================================

    // Viewer / Compositor output nodes
    if (nodeType === 'ViewerNode' || nodeType === 'viewer' || nodeType === 'CompositorNodeViewer' || nodeType === 'ViewerNode') {
      console.debug(`[NodeEvaluator] Blender-specific node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }
    if (nodeType === 'SplitViewerNode' || nodeType === 'split_viewer' || nodeType === 'CompositorNodeSplitViewer' || nodeType === 'SplitViewer') {
      console.debug(`[NodeEvaluator] Blender-specific node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }
    if (nodeType === 'CompositeNode' || nodeType === 'composite' || nodeType === 'CompositorNodeComposite' || nodeType === 'CompositeNode') {
      console.debug(`[NodeEvaluator] Blender-specific node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }
    if (nodeType === 'RenderLayerNode' || nodeType === 'render_layer' || nodeType === 'CompositorNodeRLayers' || nodeType === 'RenderLayer') {
      console.debug(`[NodeEvaluator] Blender-specific node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }
    if (nodeType === 'DebugOutputNode' || nodeType === 'debug_output' || nodeType === 'GeometryNodeDebugOutput' || nodeType === 'DebugOutput') {
      console.debug(`[NodeEvaluator] Blender-specific node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }

    // Blender-specific output nodes
    if (nodeType === 'ShaderNodeOutputWorld' || nodeType === 'world_output' || nodeType === 'OutputWorldNode') {
      console.debug(`[NodeEvaluator] Blender-specific output node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }
    if (nodeType === 'ShaderNodeOutputLight' || nodeType === 'light_output' || nodeType === 'OutputLightNode') {
      console.debug(`[NodeEvaluator] Blender-specific output node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }
    if (nodeType === 'ShaderNodeOutputAOV' || nodeType === 'aov_output' || nodeType === 'OutputAOVNode') {
      console.debug(`[NodeEvaluator] Blender-specific output node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }
    if (nodeType === 'GeometryNodeOutput' || nodeType === 'geometry_output' || nodeType === 'OutputGeometryNode') {
      console.debug(`[NodeEvaluator] Blender-specific output node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }
    if (nodeType === 'CompositorNodeOutputFile' || nodeType === 'file_output' || nodeType === 'OutputFileNode') {
      console.debug(`[NodeEvaluator] Blender-specific output node "${nodeType}" — intentional pass-through in R3F`);
      return inputs;
    }

    // Structural pass-through nodes
    if (nodeType === 'NodeGroupInput' || nodeType === 'group_input_node' || nodeType === 'GroupInputNode') {
      // Already handled in Essential section; this catches alias-only types
      console.debug(`[NodeEvaluator] Structural pass-through "${nodeType}" in R3F`);
      return EssentialExecutors.executeGroupInput(inputs);
    }
    if (nodeType === 'NodeGroupOutput' || nodeType === 'group_output_node' || nodeType === 'GroupOutputNode') {
      console.debug(`[NodeEvaluator] Structural pass-through "${nodeType}" in R3F`);
      return EssentialExecutors.executeGroupOutput(inputs);
    }

    // =========================================================================
    // Domain Alias Nodes
    // Point/Volume prefixed types delegate to the generic executor.
    // Example: PointIndexNode → same executor as IndexNode
    // =========================================================================

    if (nodeType === 'PointIndexNode' || nodeType === 'point_index' || nodeType === 'GeometryNodeInputPointIndex') {
      return EssentialExecutors.executeIndex(inputs);
    }
    if (nodeType === 'PointPositionNode' || nodeType === 'point_position' || nodeType === 'GeometryNodeInputPointPosition') {
      return AddExecutors.executeGeometryNodeInputPosition(inputs);
    }
    if (nodeType === 'PointNormalNode' || nodeType === 'point_normal' || nodeType === 'GeometryNodeInputPointNormal') {
      return AddExecutors.executeGeometryNodeInputNormal(inputs);
    }
    if (nodeType === 'PointIDNode' || nodeType === 'point_id' || nodeType === 'GeometryNodeInputPointID') {
      return EssentialExecutors.executeInputID(inputs);
    }
    if (nodeType === 'PointRadiusNode' || nodeType === 'point_radius' || nodeType === 'GeometryNodeInputPointRadius') {
      return inputs; // Pass-through: radius context not available in R3F CPU eval
    }
    if (nodeType === 'PointCountNode' || nodeType === 'point_count' || nodeType === 'GeometryNodeInputPointCount') {
      return ExpExecutors.executeDomainSize(inputs); // DomainSize gives point count
    }
    if (nodeType === 'VolumeIndexNode' || nodeType === 'volume_index' || nodeType === 'GeometryNodeInputVolumeIndex') {
      return EssentialExecutors.executeIndex(inputs);
    }
    if (nodeType === 'VolumePositionNode' || nodeType === 'volume_position' || nodeType === 'GeometryNodeInputVolumePosition') {
      return AddExecutors.executeGeometryNodeInputPosition(inputs);
    }
    if (nodeType === 'VolumeNormalNode' || nodeType === 'volume_normal' || nodeType === 'GeometryNodeInputVolumeNormal') {
      return AddExecutors.executeGeometryNodeInputNormal(inputs);
    }
    if (nodeType === 'VolumeIDNode' || nodeType === 'volume_id' || nodeType === 'GeometryNodeInputVolumeID') {
      return EssentialExecutors.executeInputID(inputs);
    }

    // Output nodes - pass through
    if (nodeType === 'ShaderNodeOutputMaterial' || nodeType === 'material_output' || nodeType === 'OutputMaterialNode') {
      return inputs.Surface ?? inputs.surface ?? inputs.bsdf ?? null;
    }

    // Unknown node type - return inputs as-is with a warning
    this.warnings.push(`Unknown node type "${nodeType}", passing through inputs`);
    return inputs;
  }

  // ==========================================================================
  // Shader Node Execution
  // ==========================================================================

  private executePrincipledBSDF(inputs: Record<string, any>): any {
    const baseColor = this.resolveColor(inputs.BaseColor ?? inputs.baseColor ?? new THREE.Color(0.8, 0.8, 0.8));
    const metallic = inputs.Metallic ?? inputs.metallic ?? 0.0;
    const roughness = inputs.Roughness ?? inputs.roughness ?? 0.5;
    const specular = inputs.Specular ?? inputs.specular ?? 0.5;
    const ior = inputs.IOR ?? inputs.ior ?? 1.45;
    const transmission = inputs.Transmission ?? inputs.transmission ?? 0.0;
    const emissionStrength = inputs.EmissionStrength ?? inputs.emissionStrength ?? 0.0;
    const emissionColor = this.resolveColor(inputs.EmissionColor ?? inputs.emissionColor ?? new THREE.Color(0, 0, 0));
    const alpha = inputs.Alpha ?? inputs.alpha ?? 1.0;
    const clearcoat = inputs.Clearcoat ?? inputs.clearcoat ?? 0.0;
    const clearcoatRoughness = inputs.ClearcoatRoughness ?? inputs.clearcoatRoughness ?? 0.03;
    const subsurfaceWeight = inputs.SubsurfaceWeight ?? inputs.subsurfaceWeight ?? 0.0;
    const sheen = inputs.Sheen ?? inputs.sheen ?? 0.0;
    const anisotropic = inputs.Anisotropic ?? inputs.anisotropic ?? 0.0;

    return {
      BSDF: {
        type: 'principled_bsdf',
        baseColor,
        metallic,
        roughness,
        specular,
        ior,
        transmission,
        emissionStrength,
        emissionColor,
        alpha,
        clearcoat,
        clearcoatRoughness,
        subsurfaceWeight,
        sheen,
        anisotropic,
      },
    };
  }

  private executeDiffuseBSDF(inputs: Record<string, any>): any {
    const color = this.resolveColor(inputs.Color ?? inputs.color ?? new THREE.Color(0.8, 0.8, 0.8));
    const roughness = inputs.Roughness ?? inputs.roughness ?? 0.5;

    return {
      BSDF: {
        type: 'bsdf_diffuse',
        baseColor: color,
        metallic: 0.0,
        roughness,
      },
    };
  }

  private executeGlossyBSDF(inputs: Record<string, any>): any {
    const color = this.resolveColor(inputs.Color ?? inputs.color ?? new THREE.Color(1, 1, 1));
    const roughness = inputs.Roughness ?? inputs.roughness ?? 0.0;

    return {
      BSDF: {
        type: 'bsdf_glossy',
        baseColor: color,
        metallic: 1.0,
        roughness,
      },
    };
  }

  private executeGlassBSDF(inputs: Record<string, any>): any {
    const color = this.resolveColor(inputs.Color ?? inputs.color ?? new THREE.Color(1, 1, 1));
    const roughness = inputs.Roughness ?? inputs.roughness ?? 0.0;
    const ior = inputs.IOR ?? inputs.ior ?? 1.45;

    return {
      BSDF: {
        type: 'bsdf_glass',
        baseColor: color,
        metallic: 0.0,
        roughness,
        ior,
        transmission: 1.0,
        alpha: 1.0,
      },
    };
  }

  private executeEmission(inputs: Record<string, any>): any {
    const color = this.resolveColor(inputs.Color ?? inputs.color ?? new THREE.Color(1, 1, 1));
    const strength = inputs.Strength ?? inputs.strength ?? 1.0;

    return {
      Emission: {
        type: 'emission',
        baseColor: new THREE.Color(0, 0, 0),
        emissionColor: color,
        emissionStrength: strength,
      },
    };
  }

  private executeMixShader(inputs: Record<string, any>): any {
    const factor = inputs.Factor ?? inputs.factor ?? 0.5;
    const shader1 = inputs['Shader 1'] ?? inputs.shader1 ?? null;
    const shader2 = inputs['Shader 2'] ?? inputs.shader2 ?? null;

    return {
      Shader: {
        type: 'mix_shader',
        factor,
        shader1,
        shader2,
      },
    };
  }

  private executeAddShader(inputs: Record<string, any>): any {
    const shader1 = inputs['Shader 1'] ?? inputs.shader1 ?? null;
    const shader2 = inputs['Shader 2'] ?? inputs.shader2 ?? null;

    return {
      Shader: {
        type: 'add_shader',
        shader1,
        shader2,
      },
    };
  }

  // ==========================================================================
  // Texture Node Execution
  // ==========================================================================

  private executeNoiseTexture(inputs: Record<string, any>): any {
    const scale = inputs.Scale ?? inputs.scale ?? 5.0;
    const detail = inputs.Detail ?? inputs.detail ?? 2.0;
    const roughness = inputs.Roughness ?? inputs.roughness ?? 0.5;
    const distortion = inputs.Distortion ?? inputs.distortion ?? 0.0;
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };

    return {
      Fac: { type: 'noise_texture', scale, detail, roughness, distortion, vector },
      Color: { type: 'noise_texture', scale, detail, roughness, distortion, vector },
    };
  }

  private executeVoronoiTexture(inputs: Record<string, any>): any {
    const scale = inputs.Scale ?? inputs.scale ?? 5.0;
    const distanceMetric = inputs.Distance ?? inputs.distance ?? 'euclidean';
    const feature = inputs.Feature ?? inputs.feature ?? 'f1';
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };

    return {
      Distance: { type: 'voronoi_texture', scale, distanceMetric, feature, vector },
      Color: { type: 'voronoi_texture', scale, distanceMetric, feature, vector },
      Position: vector,
    };
  }

  private executeMusgraveTexture(inputs: Record<string, any>): any {
    const scale = inputs.Scale ?? inputs.scale ?? 5.0;
    const detail = inputs.Detail ?? inputs.detail ?? 2.0;
    const dimension = inputs.Dimension ?? inputs.dimension ?? 2.0;
    const lacunarity = inputs.Lacunarity ?? inputs.lacunarity ?? 2.0;
    const musgraveType = inputs.MusgraveType ?? inputs.musgraveType ?? 'fbm';
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };

    return {
      Fac: { type: 'musgrave_texture', scale, detail, dimension, lacunarity, musgraveType, vector },
    };
  }

  private executeGradientTexture(inputs: Record<string, any>): any {
    const gradientType = inputs.GradientType ?? inputs.gradientType ?? 'linear';
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };

    return {
      Fac: { type: 'gradient_texture', gradientType, vector },
      Color: { type: 'gradient_texture', gradientType, vector },
    };
  }

  // ==========================================================================
  // Color Node Execution
  // ==========================================================================

  private executeMixRGB(inputs: Record<string, any>): any {
    const color1 = inputs.Color1 ?? inputs.color1 ?? { r: 0.5, g: 0.5, b: 0.5 };
    const color2 = inputs.Color2 ?? inputs.color2 ?? { r: 0.5, g: 0.5, b: 0.5 };
    const factor = inputs.Fac ?? inputs.factor ?? inputs.Factor ?? 0.5;
    const blendType = inputs.BlendType ?? inputs.blendType ?? 'mix';

    let result: { r: number; g: number; b: number };

    const c1 = this.normalizeColorObj(color1);
    const c2 = this.normalizeColorObj(color2);

    switch (blendType) {
      case 'add':
        result = { r: c1.r + c2.r, g: c1.g + c2.g, b: c1.b + c2.b };
        break;
      case 'multiply':
        result = { r: c1.r * c2.r, g: c1.g * c2.g, b: c1.b * c2.b };
        break;
      case 'screen':
        result = {
          r: 1 - (1 - c1.r) * (1 - c2.r),
          g: 1 - (1 - c1.g) * (1 - c2.g),
          b: 1 - (1 - c1.b) * (1 - c2.b),
        };
        break;
      case 'subtract':
        result = { r: c1.r - c2.r, g: c1.g - c2.g, b: c1.b - c2.b };
        break;
      default: // 'mix'
        result = {
          r: c1.r + factor * (c2.r - c1.r),
          g: c1.g + factor * (c2.g - c1.g),
          b: c1.b + factor * (c2.b - c1.b),
        };
    }

    return { Color: result };
  }

  private executeColorRamp(inputs: Record<string, any>): any {
    const factor = inputs.Fac ?? inputs.factor ?? 0.5;
    const colorRamp = inputs.ColorRamp ?? inputs.colorRamp ?? [
      { position: 0, color: { r: 0, g: 0, b: 0 } },
      { position: 1, color: { r: 1, g: 1, b: 1 } },
    ];

    const t = Math.max(0, Math.min(1, factor));
    let color = { r: 0, g: 0, b: 0 };

    if (colorRamp.length > 0) {
      if (colorRamp.length === 1) {
        color = { ...colorRamp[0].color };
      } else {
        // Find surrounding stops
        let lower = colorRamp[0];
        let upper = colorRamp[colorRamp.length - 1];

        for (let i = 0; i < colorRamp.length - 1; i++) {
          if (t >= colorRamp[i].position && t <= colorRamp[i + 1].position) {
            lower = colorRamp[i];
            upper = colorRamp[i + 1];
            break;
          }
        }

        const range = upper.position - lower.position;
        const localT = range > 0 ? (t - lower.position) / range : 0;

        color = {
          r: lower.color.r + localT * (upper.color.r - lower.color.r),
          g: lower.color.g + localT * (upper.color.g - lower.color.g),
          b: lower.color.b + localT * (upper.color.b - lower.color.b),
        };
      }
    }

    return { Color: color, Alpha: 1.0 };
  }

  // ==========================================================================
  // Math Node Execution
  // ==========================================================================

  private executeMath(inputs: Record<string, any>): any {
    const value1 = inputs.Value ?? inputs.value ?? inputs.Value1 ?? 0.0;
    const value2 = inputs.Value_1 ?? inputs.value2 ?? inputs.Value2 ?? 0.0;
    const operation = inputs.Operation ?? inputs.operation ?? 'add';

    let result: number;

    switch (operation) {
      case 'add': result = value1 + value2; break;
      case 'subtract': result = value1 - value2; break;
      case 'multiply': result = value1 * value2; break;
      case 'divide': result = value2 !== 0 ? value1 / value2 : 0; break;
      case 'power': result = Math.pow(value1, value2); break;
      case 'logarithm': result = value1 > 0 && value2 > 0 ? Math.log(value1) / Math.log(value2) : 0; break;
      case 'sqrt': result = Math.sqrt(Math.max(0, value1)); break;
      case 'abs': result = Math.abs(value1); break;
      case 'min': result = Math.min(value1, value2); break;
      case 'max': result = Math.max(value1, value2); break;
      case 'clamp': result = Math.max(0, Math.min(1, value1)); break;
      case 'sin': result = Math.sin(value1); break;
      case 'cos': result = Math.cos(value1); break;
      case 'tan': result = Math.tan(value1); break;
      case 'modulo': result = value2 !== 0 ? ((value1 % value2) + value2) % value2 : 0; break;
      case 'floor': result = Math.floor(value1); break;
      case 'ceil': result = Math.ceil(value1); break;
      case 'round': result = Math.round(value1); break;
      default: result = value1;
    }

    // Apply clamp if useClamp is set
    if (inputs.UseClamp ?? inputs.useClamp) {
      result = Math.max(0, Math.min(1, result));
    }

    return { Value: result };
  }

  private executeVectorMath(inputs: Record<string, any>): any {
    const vector1 = inputs.Vector ?? inputs.vector1 ?? inputs.Vector1 ?? { x: 0, y: 0, z: 0 };
    const vector2 = inputs.Vector_1 ?? inputs.vector2 ?? inputs.Vector2 ?? { x: 0, y: 0, z: 0 };
    const operation = inputs.Operation ?? inputs.operation ?? 'add';

    const v1 = this.normalizeVector(vector1);
    const v2 = this.normalizeVector(vector2);

    let result: { x: number; y: number; z: number };
    let value: number = 0;

    switch (operation) {
      case 'add':
        result = { x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z };
        break;
      case 'subtract':
        result = { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
        break;
      case 'multiply':
        result = { x: v1.x * v2.x, y: v1.y * v2.y, z: v1.z * v2.z };
        break;
      case 'divide':
        result = {
          x: v2.x !== 0 ? v1.x / v2.x : 0,
          y: v2.y !== 0 ? v1.y / v2.y : 0,
          z: v2.z !== 0 ? v1.z / v2.z : 0,
        };
        break;
      case 'cross':
        result = {
          x: v1.y * v2.z - v1.z * v2.y,
          y: v1.z * v2.x - v1.x * v2.z,
          z: v1.x * v2.y - v1.y * v2.x,
        };
        break;
      case 'dot':
        value = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        result = v1;
        break;
      case 'normalize': {
        const len = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
        result = len > 0 ? { x: v1.x / len, y: v1.y / len, z: v1.z / len } : { x: 0, y: 0, z: 0 };
        break;
      }
      case 'length':
        value = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
        result = v1;
        break;
      case 'scale': {
        const s = inputs.Scale ?? inputs.scale ?? 1.0;
        result = { x: v1.x * s, y: v1.y * s, z: v1.z * s };
        break;
      }
      default:
        result = v1;
    }

    return { Vector: result, Value: value };
  }

  // ==========================================================================
  // Vector Node Execution
  // ==========================================================================

  private executeMapping(inputs: Record<string, any>, settings: Record<string, any>): any {
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };
    const translation = settings.Translation ?? settings.translation ?? { x: 0, y: 0, z: 0 };
    const rotation = settings.Rotation ?? settings.rotation ?? { x: 0, y: 0, z: 0 };
    const scale = settings.Scale ?? settings.scale ?? { x: 1, y: 1, z: 1 };

    let result = this.normalizeVector(vector);

    // Apply scale
    result = {
      x: result.x * (scale.x ?? 1),
      y: result.y * (scale.y ?? 1),
      z: result.z * (scale.z ?? 1),
    };

    // Apply rotation using Euler rotation
    const rx = (rotation.x ?? 0);
    const ry = (rotation.y ?? 0);
    const rz = (rotation.z ?? 0);

    // Rotation around Z axis
    if (rz !== 0) {
      const cos = Math.cos(rz);
      const sin = Math.sin(rz);
      const x = result.x * cos - result.y * sin;
      const y = result.x * sin + result.y * cos;
      result = { x, y, z: result.z };
    }

    // Rotation around Y axis
    if (ry !== 0) {
      const cos = Math.cos(ry);
      const sin = Math.sin(ry);
      const x = result.x * cos + result.z * sin;
      const z = -result.x * sin + result.z * cos;
      result = { x, y: result.y, z };
    }

    // Rotation around X axis
    if (rx !== 0) {
      const cos = Math.cos(rx);
      const sin = Math.sin(rx);
      const y = result.y * cos - result.z * sin;
      const z = result.y * sin + result.z * cos;
      result = { x: result.x, y, z };
    }

    // Apply translation
    result = {
      x: result.x + (translation.x ?? 0),
      y: result.y + (translation.y ?? 0),
      z: result.z + (translation.z ?? 0),
    };

    return { Vector: result };
  }

  private executeCombineXYZ(inputs: Record<string, any>): any {
    const x = inputs.X ?? inputs.x ?? 0;
    const y = inputs.Y ?? inputs.y ?? 0;
    const z = inputs.Z ?? inputs.z ?? 0;
    return { Vector: { x, y, z } };
  }

  private executeSeparateXYZ(inputs: Record<string, any>): any {
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };
    const v = this.normalizeVector(vector);
    return { X: v.x, Y: v.y, Z: v.z };
  }

  private executeTextureCoordinate(inputs: Record<string, any>): any {
    // Returns placeholder coordinate info - actual values come from geometry at render time
    return {
      Generated: { x: 0, y: 0, z: 0 },
      Normal: { x: 0, y: 1, z: 0 },
      UV: { x: 0, y: 0, z: 0 },
      Object: { x: 0, y: 0, z: 0 },
      Camera: { x: 0, y: 0, z: 0 },
      Window: { x: 0, y: 0, z: 0 },
    };
  }

  // ==========================================================================
  // P1 Texture Node Execution (Brick, Checker, Magic, Image)
  // ==========================================================================

  private executeBrickTexture(inputs: Record<string, any>): any {
    const scale = inputs.Scale ?? inputs.scale ?? 5.0;
    const mortarSize = inputs.MortarSize ?? inputs.mortarSize ?? 0.02;
    const mortarSmooth = inputs.MortarSmooth ?? inputs.mortarSmooth ?? 0.1;
    const bias = inputs.Bias ?? inputs.bias ?? 0.0;
    const brickWidth = inputs.BrickWidth ?? inputs.brickWidth ?? 0.5;
    const brickHeight = inputs.BrickHeight ?? inputs.brickHeight ?? 0.25;
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };
    const color1 = this.normalizeColorObj(inputs.Color1 ?? inputs.color1 ?? { r: 0.8, g: 0.28, b: 0.2 });
    const color2 = this.normalizeColorObj(inputs.Color2 ?? inputs.color2 ?? { r: 0.63, g: 0.3, b: 0.18 });
    const mortarColor = this.normalizeColorObj(inputs.Mortar ?? inputs.mortar ?? { r: 0.6, g: 0.58, b: 0.55 });

    return {
      Color: { type: 'brick_texture', scale, mortarSize, mortarSmooth, bias, brickWidth, brickHeight, vector, color1, color2, mortarColor },
      Fac: { type: 'brick_texture', scale, mortarSize, mortarSmooth, bias, brickWidth, brickHeight, vector },
    };
  }

  private executeCheckerTexture(inputs: Record<string, any>): any {
    const scale = inputs.Scale ?? inputs.scale ?? 5.0;
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };
    const color1 = this.normalizeColorObj(inputs.Color1 ?? inputs.color1 ?? { r: 0.8, g: 0.8, b: 0.8 });
    const color2 = this.normalizeColorObj(inputs.Color2 ?? inputs.color2 ?? { r: 0.2, g: 0.2, b: 0.2 });

    return {
      Color: { type: 'checker_texture', scale, vector, color1, color2 },
      Fac: { type: 'checker_texture', scale, vector },
    };
  }

  private executeMagicTexture(inputs: Record<string, any>): any {
    const scale = inputs.Scale ?? inputs.scale ?? 5.0;
    const distortion = inputs.Distortion ?? inputs.distortion ?? 2.0;
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };

    // Magic texture uses sinusoidal combinations to create psychedelic/distortion patterns
    const v = this.normalizeVector(vector);
    const x = v.x * scale;
    const y = v.y * scale;
    const z = v.z * scale;
    const dist = distortion;

    const r = (Math.sin(x + Math.sin(y + dist * Math.sin(z))) + 1) / 2;
    const g = (Math.sin(y + Math.sin(z + dist * Math.sin(x))) + 1) / 2;
    const b = (Math.sin(z + Math.sin(x + dist * Math.sin(y))) + 1) / 2;

    return {
      Color: { r, g, b },
      Fac: { type: 'magic_texture', scale, distortion, vector },
    };
  }

  private executeImageTexture(inputs: Record<string, any>): any {
    const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };
    // Image texture: placeholder when no actual image is loaded
    // Returns a colored DataTexture placeholder based on inputs
    const color = this.normalizeColorObj(inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 });
    const alpha = inputs.Alpha ?? inputs.alpha ?? 1.0;

    return {
      Color: { ...color, a: alpha },
      Alpha: alpha,
      _imageTexture: true,
      _source: inputs.Image ?? inputs.image ?? null,
    };
  }

  // ==========================================================================
  // P1 Color Node Execution (HueSaturationValue, Invert, BrightContrast)
  // ==========================================================================

  private executeHueSaturationValue(inputs: Record<string, any>): any {
    const color = this.normalizeColorObj(inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 });
    const hue = inputs.Hue ?? inputs.hue ?? 0.5;       // 0.5 = no change (centered)
    const saturation = inputs.Saturation ?? inputs.saturation ?? 1.0; // 1.0 = no change
    const value = inputs.Value ?? inputs.value ?? 1.0;  // 1.0 = no change
    const factor = inputs.Fac ?? inputs.factor ?? inputs.Factor ?? 1.0;

    // Convert RGB to HSV
    const threeColor = new THREE.Color(color.r, color.g, color.b);
    const hsl = { h: 0, s: 0, l: 0 };
    threeColor.getHSL(hsl);

    // Apply HSV adjustments (hue offset is centered at 0.5)
    const newH = ((hsl.h + (hue - 0.5)) % 1 + 1) % 1;
    const newS = Math.max(0, Math.min(1, hsl.s * saturation));
    // Value adjustment: map HSL lightness via value multiplier
    const newL = Math.max(0, Math.min(1, hsl.l * value));

    const result = new THREE.Color().setHSL(newH, newS, newL);

    // Blend with original based on factor
    const outR = color.r + factor * (result.r - color.r);
    const outG = color.g + factor * (result.g - color.g);
    const outB = color.b + factor * (result.b - color.b);

    return { Color: { r: outR, g: outG, b: outB } };
  }

  private executeInvert(inputs: Record<string, any>): any {
    const color = this.normalizeColorObj(inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 });
    const factor = inputs.Fac ?? inputs.factor ?? inputs.Factor ?? 1.0;

    const invR = 1 - color.r;
    const invG = 1 - color.g;
    const invB = 1 - color.b;

    // Blend between original and inverted based on factor
    const outR = color.r + factor * (invR - color.r);
    const outG = color.g + factor * (invG - color.g);
    const outB = color.b + factor * (invB - color.b);

    return { Color: { r: outR, g: outG, b: outB } };
  }

  private executeBrightContrast(inputs: Record<string, any>): any {
    const color = this.normalizeColorObj(inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 });
    const bright = inputs.Bright ?? inputs.bright ?? 0.0;   // 0 = no change
    const contrast = inputs.Contrast ?? inputs.contrast ?? 0.0; // 0 = no change

    // Apply brightness (additive offset)
    let r = color.r + bright;
    let g = color.g + bright;
    let b = color.b + bright;

    // Apply contrast (scale from 0.5 midpoint)
    const contrastFactor = Math.max(0, 1 + contrast);
    r = (r - 0.5) * contrastFactor + 0.5;
    g = (g - 0.5) * contrastFactor + 0.5;
    b = (b - 0.5) * contrastFactor + 0.5;

    return { Color: { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) } };
  }

  // ==========================================================================
  // P1 Vector Node Execution (Bump, Displacement, NormalMap)
  // ==========================================================================

  private executeBump(inputs: Record<string, any>): any {
    const strength = inputs.Strength ?? inputs.strength ?? 1.0;
    const distance = inputs.Distance ?? inputs.distance ?? 1.0;
    const height = inputs.Height ?? inputs.height ?? 1.0;
    const normal = inputs.Normal ?? inputs.normal ?? { x: 0, y: 0, z: 1 };
    const invert = inputs.Invert ?? inputs.invert ?? false;

    const bumpHeight = invert ? -height : height;

    // Compute perturbed normal from height (simplified finite-difference)
    const eps = 0.001;
    const n = this.normalizeVector(normal);
    const hCenter = bumpHeight * strength * distance;
    const hDx = hCenter + eps;
    const hDy = hCenter + eps;

    const nx = n.x - (hDx - hCenter) / eps * 0.5;
    const ny = n.y - (hDy - hCenter) / eps * 0.5;
    const nz = n.z;

    // Renormalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const resultNormal = len > 0 ? { x: nx / len, y: ny / len, z: nz / len } : { x: 0, y: 0, z: 1 };

    return { Normal: resultNormal };
  }

  private executeDisplacement(inputs: Record<string, any>): any {
    const height = inputs.Height ?? inputs.height ?? 0.0;
    const midlevel = inputs.Midlevel ?? inputs.midlevel ?? 0.5;
    const scale = inputs.Scale ?? inputs.scale ?? 1.0;
    const normal = inputs.Normal ?? inputs.normal ?? { x: 0, y: 0, z: 1 };
    const space = inputs.Space ?? inputs.space ?? 'object';

    const n = this.normalizeVector(normal);
    const displacement = (height - midlevel) * scale;

    // Displacement vector along normal direction
    const result = {
      x: n.x * displacement,
      y: n.y * displacement,
      z: n.z * displacement,
    };

    return { Displacement: { vector: result, space } };
  }

  private executeNormalMap(inputs: Record<string, any>): any {
    const color = this.normalizeColorObj(inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 1.0 });
    const strength = inputs.Strength ?? inputs.strength ?? 1.0;
    const space = inputs.Space ?? inputs.space ?? 'tangent';

    // Convert color-encoded normal map to normal vector
    // Normal map encoding: R=x [0,1]→[-1,1], G=y [0,1]→[-1,1], B=z [0,1]→[-1,1]
    let nx = (color.r * 2 - 1) * strength;
    let ny = (color.g * 2 - 1) * strength;
    let nz = color.b * 2 - 1;

    // Renormalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0; ny = 0; nz = 1;
    }

    return { Normal: { x: nx, y: ny, z: nz } };
  }

  // ==========================================================================
  // P1 Input Node Execution (ObjectInfo, Value, RGB)
  // ==========================================================================

  private executeObjectInfo(inputs: Record<string, any>, settings: Record<string, any>): any {
    // ObjectInfo provides object-level data. When not connected to a real object,
    // return placeholder/default values from settings or defaults.
    const location = settings.Location ?? settings.location ?? inputs.Location ?? inputs.location ?? { x: 0, y: 0, z: 0 };
    const rotation = settings.Rotation ?? settings.rotation ?? inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 };
    const scale = settings.Scale ?? settings.scale ?? inputs.Scale ?? inputs.scale ?? { x: 1, y: 1, z: 1 };
    const random = settings.Random ?? settings.random ?? inputs.Random ?? inputs.random ?? Math.random();

    return {
      Location: this.normalizeVector(location),
      Rotation: this.normalizeVector(rotation),
      Scale: this.normalizeVector(scale),
      Random: typeof random === 'number' ? random : Math.random(),
    };
  }

  private executeValue(inputs: Record<string, any>, settings: Record<string, any>): any {
    const value = settings.Value ?? settings.value ?? inputs.Value ?? inputs.value ?? 0.0;
    const floatValue = typeof value === 'number' ? value : parseFloat(value) || 0.0;
    return { Value: floatValue };
  }

  private executeRGB(inputs: Record<string, any>, settings: Record<string, any>): any {
    const defaultColor = settings.Color ?? settings.color ?? inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5 };
    const color = this.normalizeColorObj(defaultColor);
    return { Color: color };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private findOutputNode(graph: NodeGraph, mode: EvaluationMode): string | null {
    const outputTypes: Record<string, string[]> = {
      [EvaluationMode.MATERIAL]: ['ShaderNodeOutputMaterial', 'material_output'],
      [EvaluationMode.GEOMETRY]: ['GeometryNodeOutput', 'geometry_output'],
      [EvaluationMode.TEXTURE]: ['ShaderNodeOutputMaterial', 'material_output'],
    };

    const types = outputTypes[mode] || [];

    for (const [id, node] of graph.nodes) {
      if (types.includes(node.type)) {
        return id;
      }
    }

    // If no output node found, return the last node in topological order
    return null;
  }

  private resolveColor(color: any): THREE.Color {
    if (color instanceof THREE.Color) return color;
    if (typeof color === 'string') return new THREE.Color(color);
    if (typeof color === 'number') return new THREE.Color(color);
    if (color && typeof color === 'object') {
      if ('r' in color && 'g' in color && 'b' in color) {
        return new THREE.Color(color.r, color.g, color.b);
      }
    }
    return new THREE.Color(0.8, 0.8, 0.8);
  }

  private normalizeVector(v: any): { x: number; y: number; z: number } {
    if (v instanceof THREE.Vector3) return { x: v.x, y: v.y, z: v.z };
    if (Array.isArray(v)) return { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 };
    if (v && typeof v === 'object') return { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 };
    return { x: 0, y: 0, z: 0 };
  }

  private normalizeColorObj(c: any): { r: number; g: number; b: number } {
    if (c instanceof THREE.Color) return { r: c.r, g: c.g, b: c.b };
    if (c && typeof c === 'object' && 'r' in c) return { r: c.r, g: c.g, b: c.b };
    return { r: 0.5, g: 0.5, b: 0.5 };
  }
}
