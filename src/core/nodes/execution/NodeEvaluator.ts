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

    // Execute the node
    const result = this.executeNodeByType(node, resolvedInputs);

    // Cache the result
    this.cache.set(cacheKey, result);

    return result;
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
    if (nodeType === 'principled_bsdf' || nodeType === 'ShaderNodeBsdfPrincipled') {
      return this.executePrincipledBSDF(inputs);
    }
    if (nodeType === 'bsdf_diffuse' || nodeType === 'ShaderNodeBsdfDiffuse') {
      return this.executeDiffuseBSDF(inputs);
    }
    if (nodeType === 'bsdf_glossy' || nodeType === 'ShaderNodeBsdfGlossy') {
      return this.executeGlossyBSDF(inputs);
    }
    if (nodeType === 'bsdf_glass' || nodeType === 'ShaderNodeBsdfGlass') {
      return this.executeGlassBSDF(inputs);
    }
    if (nodeType === 'emission' || nodeType === 'ShaderNodeEmission') {
      return this.executeEmission(inputs);
    }
    if (nodeType === 'mix_shader' || nodeType === 'ShaderNodeMixShader') {
      return this.executeMixShader(inputs);
    }
    if (nodeType === 'add_shader' || nodeType === 'ShaderNodeAddShader') {
      return this.executeAddShader(inputs);
    }

    // Texture nodes
    if (nodeType === 'ShaderNodeTexNoise' || nodeType === 'noise_texture') {
      return this.executeNoiseTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexVoronoi' || nodeType === 'voronoi_texture') {
      return this.executeVoronoiTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexMusgrave' || nodeType === 'musgrave_texture') {
      return this.executeMusgraveTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexGradient' || nodeType === 'gradient_texture') {
      return this.executeGradientTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexBrick' || nodeType === 'brick_texture') {
      return this.executeBrickTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexChecker' || nodeType === 'checker_texture') {
      return this.executeCheckerTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexMagic' || nodeType === 'magic_texture') {
      return this.executeMagicTexture(inputs);
    }
    if (nodeType === 'ShaderNodeTexImage' || nodeType === 'image_texture') {
      return this.executeImageTexture(inputs);
    }

    // Color nodes
    if (nodeType === 'ShaderNodeMixRGB' || nodeType === 'mix_rgb') {
      return this.executeMixRGB(inputs);
    }
    if (nodeType === 'ShaderNodeValToRGB' || nodeType === 'color_ramp') {
      return this.executeColorRamp(inputs);
    }
    if (nodeType === 'ShaderNodeHueSaturation' || nodeType === 'hue_saturation') {
      return this.executeHueSaturationValue(inputs);
    }
    if (nodeType === 'ShaderNodeInvert' || nodeType === 'invert') {
      return this.executeInvert(inputs);
    }
    if (nodeType === 'CompositorNodeBrightContrast' || nodeType === 'bright_contrast') {
      return this.executeBrightContrast(inputs);
    }

    // Math nodes
    if (nodeType === 'ShaderNodeMath' || nodeType === 'math') {
      return this.executeMath(inputs);
    }
    if (nodeType === 'ShaderNodeVectorMath' || nodeType === 'vector_math') {
      return this.executeVectorMath(inputs);
    }

    // Vector nodes
    if (nodeType === 'ShaderNodeMapping' || nodeType === 'mapping') {
      return this.executeMapping(inputs, node.settings);
    }
    if (nodeType === 'ShaderNodeCombineXYZ' || nodeType === 'combine_xyz') {
      return this.executeCombineXYZ(inputs);
    }
    if (nodeType === 'ShaderNodeSeparateXYZ' || nodeType === 'separate_xyz') {
      return this.executeSeparateXYZ(inputs);
    }
    if (nodeType === 'ShaderNodeBump' || nodeType === 'bump') {
      return this.executeBump(inputs);
    }
    if (nodeType === 'ShaderNodeDisplacement' || nodeType === 'displacement') {
      return this.executeDisplacement(inputs);
    }
    if (nodeType === 'ShaderNodeNormalMap' || nodeType === 'normal_map') {
      return this.executeNormalMap(inputs);
    }

    // Texture coordinate
    if (nodeType === 'ShaderNodeTexCoord' || nodeType === 'texture_coordinate') {
      return this.executeTextureCoordinate(inputs);
    }

    // Input nodes
    if (nodeType === 'GeometryNodeObjectInfo' || nodeType === 'object_info') {
      return this.executeObjectInfo(inputs, node.settings);
    }
    if (nodeType === 'ShaderNodeValue' || nodeType === 'value') {
      return this.executeValue(inputs, node.settings);
    }
    if (nodeType === 'ShaderNodeRGB' || nodeType === 'rgb') {
      return this.executeRGB(inputs, node.settings);
    }

    // Output nodes - pass through
    if (nodeType === 'ShaderNodeOutputMaterial' || nodeType === 'material_output') {
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
