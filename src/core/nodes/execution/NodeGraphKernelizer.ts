/**
 * NodeGraphKernelizer — Transpiles NodeGroup instances into GLSL shader code.
 *
 * TypeScript port of infinigen/terrain/surface_kernel/kernelizer.py that converts
 * Blender-style node graphs into GLSL shaders for GPU evaluation.
 *
 * The Kernelizer:
 * 1. Accepts a NodeGroup from @/core/nodes/core/NodeGeometryModifierBridge
 * 2. Regularizes the graph (removes functional / passthrough nodes)
 * 3. Topologically sorts the remaining nodes
 * 4. Generates GLSL code for each node type
 * 5. Handles group nodes recursively
 * 6. Produces a complete GLSL 300 es shader
 *
 * Supports two output modes:
 * - DISPLACEMENT: Outputs a float displacement value (for vertex displacement)
 * - MATERIAL: Outputs vec4 color + float roughness/metallic/AO (for fragment shading)
 *
 * @module core/nodes/execution
 */

import type { NodeGroup, ExposedInput, ExposedOutput } from '../core/NodeGeometryModifierBridge';
import type { NodeDefinition, NodeLink } from '../core/node-wrangler';
import { SocketType } from '../core/socket-types';
import {
  COMMON_UTILITIES_GLSL,
  NOISE_TEXTURE_GLSL,
  VORONOI_TEXTURE_GLSL,
  MUSGRAVE_TEXTURE_GLSL,
  GRADIENT_TEXTURE_GLSL,
  COLOR_RAMP_GLSL,
  FLOAT_CURVE_GLSL,
  MIX_RGB_GLSL,
  MATH_GLSL,
  VECTOR_MATH_GLSL,
  MAPPING_GLSL,
  TEXTURE_COORD_GLSL,
  GLSL_SNIPPET_MAP,
} from './glsl/GLSLNodeFunctions';

// ============================================================================
// Types
// ============================================================================

/** The two output modes for the kernelizer */
export type KernelizerMode = 'displacement' | 'material';

/** Result of kernelizing a node group */
export interface KernelizerResult {
  /** Complete vertex shader string (GLSL 300 es) */
  vertexShader: string;
  /** Complete fragment shader string (GLSL 300 es) */
  fragmentShader: string;
  /** Uniform names and their GLSL type declarations */
  uniforms: Map<string, { glslType: string; value: any }>;
  /** Any warnings encountered during kernelization */
  warnings: string[];
  /** Any errors encountered during kernelization */
  errors: string[];
}

/** Internal representation of a node during kernelization */
interface KernelNode {
  id: string;
  type: string;
  name: string;
  properties: Record<string, any>;
  inputs: Map<string, { type: string; defaultValue: any }>;
  outputs: Map<string, { type: string }>;
  /** Whether this is a group node that should be expanded recursively */
  isGroupNode: boolean;
  /** Reference to the sub-group if isGroupNode is true */
  subGroup?: NodeGroup;
}

// ============================================================================
// GLSL Snippets not yet in GLSLNodeFunctions (Wave Texture, Map Range,
// Separate/Combine Color, Separate/Combine XYZ)
// ============================================================================

const WAVE_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Wave Texture (bands & rings in X/Y/Z direction)
// ============================================================================

float waveTexture(vec3 coord, float scale, float distortion, float detail,
                  float detailScale, float detailRoughness, int waveType, int bandsDirection) {
  vec3 p = coord * scale;

  // Select the direction axis
  float direction;
  if (bandsDirection == 0) {      // X
    direction = p.x;
  } else if (bandsDirection == 1) { // Y
    direction = p.y;
  } else {                          // Z
    direction = p.z;
  }

  // Wave type
  float wave;
  if (waveType == 0) {             // Bands
    wave = 0.5 + 0.5 * sin(direction * 2.0 * PI + distortion * snoise3D(p));
  } else {                          // Rings
    float dist = length(p);
    wave = 0.5 + 0.5 * sin(dist * 2.0 * PI + distortion * snoise3D(p));
  }

  // Add detail octaves
  if (detail > 0.0) {
    int octaves = int(detail);
    float amp = detailScale;
    float freq = 2.0;
    for (int i = 0; i < 16; i++) {
      if (i >= octaves) break;
      wave += amp * snoise3D(p * freq) * detailRoughness;
      amp *= (1.0 - detailRoughness);
      freq *= 2.0;
    }
  }

  return clamp(wave, 0.0, 1.0);
}

vec3 waveTextureColor(vec3 coord, float scale, float distortion, float detail,
                      float detailScale, float detailRoughness, int waveType, int bandsDirection) {
  float f = waveTexture(coord, scale, distortion, detail, detailScale, detailRoughness, waveType, bandsDirection);
  return vec3(f);
}
`;

const MAP_RANGE_GLSL = /* glsl */ `
// ============================================================================
// Map Range Node
// ============================================================================

float mapRange(float value, float fromMin, float fromMax, float toMin, float toMax, int mode) {
  float fromRange = fromMax - fromMin;
  float toRange = toMax - toMin;

  float t = fromRange != 0.0 ? (value - fromMin) / fromRange : 0.0;

  if (mode == 1) {       // Stepped
    t = floor(t + 0.5);
  } else if (mode == 2) { // Smoothstep
    t = t * t * (3.0 - 2.0 * t);
  } else if (mode == 3) { // Smootherstep
    t = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  return toMin + t * toRange;
}
`;

const SEPARATE_COMBINE_GLSL = /* glsl */ `
// ============================================================================
// Separate / Combine XYZ and Color
// ============================================================================

// SeparateXYZ is handled inline: vec3 swizzle .x .y .z

vec3 combineXYZ(float x, float y, float z) {
  return vec3(x, y, z);
}

vec3 combineColor(float r, float g, float b) {
  return vec3(r, g, b);
}

// SeparateColor: extract R, G, B from vec3 color
// Handled inline with .r .g .b swizzle
`;

// ============================================================================
// Node type → GLSL function name mapping (mirrors Python Kernelizer's
// NODE_FUNCTIONS dict)
// ============================================================================

const NODE_GLSL_MAP: Record<string, string> = {
  // Texture nodes
  'ShaderNodeTexNoise': 'noiseTexture',
  'TextureNoiseNode': 'noiseTexture',
  'ShaderNodeTexMusgrave': 'musgraveTexture',
  'TextureMusgraveNode': 'musgraveTexture',
  'ShaderNodeTexVoronoi': 'voronoiTexture',
  'TextureVoronoiNode': 'voronoiTexture',
  'ShaderNodeTexWave': 'waveTexture',
  'TextureWaveNode': 'waveTexture',
  'ShaderNodeTexGradient': 'gradientTexture',
  'TextureGradientNode': 'gradientTexture',
  'ShaderNodeTexBrick': 'brickTexture',
  'TextureBrickNode': 'brickTexture',
  'ShaderNodeTexChecker': 'checkerTexture',
  'TextureCheckerNode': 'checkerTexture',
  'ShaderNodeTexMagic': 'magicTexture',
  'TextureMagicNode': 'textureMagicNode',

  // Math nodes
  'ShaderNodeMath': 'mathOp',
  'MathNode': 'mathOp',
  'ShaderNodeVectorMath': 'vectorMathOp',
  'VectorMathNode': 'vectorMathOp',

  // Color / Mix nodes
  'ShaderNodeMixRGB': 'mixRGB',
  'MixRGBNode': 'mixRGB',
  'ShaderNodeMix': 'mixRGB',
  'MixNode': 'mixRGB',
  'ShaderNodeValToRGB': 'colorRamp',
  'ColorRampNode': 'colorRamp',
  'ShaderNodeFloatCurve': 'floatCurve',
  'FloatCurveNode': 'floatCurve',

  // Converter nodes
  'ShaderNodeMapRange': 'mapRange',
  'MapRangeNode': 'mapRange',
  'ShaderNodeSeparateXYZ': 'separateXYZ',
  'SeparateXYZNode': 'separateXYZ',
  'ShaderNodeCombineXYZ': 'combineXYZ',
  'CombineXYZNode': 'combineXYZ',
  'ShaderNodeSeparateColor': 'separateColor',
  'SeparateColorNode': 'separateColor',
  'ShaderNodeCombineColor': 'combineColor',
  'CombineColorNode': 'combineColor',
  'ShaderNodeSeparateRGB': 'separateColor',
  'ShaderNodeCombineRGB': 'combineColor',

  // Vector / Mapping nodes
  'ShaderNodeMapping': 'mappingNode',
  'MappingNode': 'mappingNode',
  'ShaderNodeTexCoord': 'textureCoordinateNode',
  'TextureCoordNode': 'textureCoordinateNode',
  'ShaderNodeVectorRotate': 'vectorRotateNode',

  // Input nodes
  'ShaderNodeValue': 'valueNode',
  'ValueNode': 'valueNode',
  'ShaderNodeRGB': 'rgbNode',
  'RGBNode': 'rgbNode',
  'FunctionNodeInputVector': 'vectorInputNode',
  'VectorNode': 'vectorInputNode',

  // Group I/O nodes
  'NodeGroupInput': 'groupInputNode',
  'GroupInputNode': 'groupInputNode',
  'NodeGroupOutput': 'groupOutputNode',
  'GroupOutputNode': 'groupOutputNode',
};

/** Node types that should be removed during regularization (passthrough/structural) */
const FUNCTIONAL_NODE_TYPES = new Set([
  'NodeReroute',
  'NodeFrame',
]);

/** Node types that are group I/O and handled specially */
const GROUP_IO_TYPES = new Set([
  'NodeGroupInput',
  'GroupInputNode',
  'NodeGroupOutput',
  'GroupOutputNode',
]);

/** Node types that require the noise GLSL library */
const NOISE_REQUIRING_TYPES = new Set([
  'ShaderNodeTexNoise', 'TextureNoiseNode',
  'ShaderNodeTexMusgrave', 'TextureMusgraveNode',
  'ShaderNodeTexVoronoi', 'TextureVoronoiNode',
  'ShaderNodeTexWave', 'TextureWaveNode',
]);

// ============================================================================
// Main Kernelizer Class
// ============================================================================

export class NodeGraphKernelizer {
  // -------------------------------------------------------------------------
  // Static configuration
  // -------------------------------------------------------------------------

  /** Map node type → GLSL function name */
  private static readonly NODE_GLSL_MAP: Record<string, string> = NODE_GLSL_MAP;

  // -------------------------------------------------------------------------
  // Instance state (per kernelize() call)
  // -------------------------------------------------------------------------

  private varCounter: number = 0;
  private uniformCounter: number = 0;
  private uniforms: Map<string, { glslType: string; value: any }> = new Map();
  private requiredSnippets: Set<string> = new Set();
  private warnings: string[] = [];
  private errors: string[] = [];
  /** Maps nodeId → variable prefix used in GLSL */
  private nodeVarMap: Map<string, string> = new Map();
  /** Depth limit for recursive group expansion */
  private maxGroupDepth: number = 8;

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Kernelize a NodeGroup into GLSL shader code.
   *
   * @param nodeGroup - The NodeGroup to transpile.
   * @param mode - Output mode: 'displacement' for vertex displacement, 'material' for fragment shading.
   * @returns A KernelizerResult containing vertex shader, fragment shader, uniforms, warnings, and errors.
   */
  kernelize(nodeGroup: NodeGroup, mode: KernelizerMode): KernelizerResult {
    // Reset per-invocation state
    this.varCounter = 0;
    this.uniformCounter = 0;
    this.uniforms = new Map();
    this.requiredSnippets = new Set();
    this.warnings = [];
    this.errors = [];
    this.nodeVarMap = new Map();

    try {
      // Step 1: Flatten the group into kernel nodes (recursive group expansion)
      const kernelNodes = this.flattenGroup(nodeGroup, 0);

      // Step 2: Regularize the graph (remove functional / passthrough nodes)
      const regularized = this.regularizeGraph(kernelNodes, nodeGroup.internalLinks);

      // Step 3: Topological sort
      const sortedIds = this.topologicalSort(regularized.nodes, regularized.links);

      // Step 4: Collect required GLSL snippet dependencies
      this.collectRequiredSnippets(regularized.nodes);

      // Step 5: Generate GLSL code for each node in topological order
      const nodeCode = new Map<string, string>();
      for (const nodeId of sortedIds) {
        const node = regularized.nodes.get(nodeId);
        if (!node) continue;
        const code = this.generateNodeCode(nodeId, node, regularized.nodes, regularized.links);
        nodeCode.set(nodeId, code);
      }

      // Step 6: Determine the output variable from the group's output connections
      const outputVar = this.resolveGroupOutput(nodeGroup, regularized);

      // Step 7: Compose the complete shaders
      const { vertexShader, fragmentShader } = this.composeShaders(
        nodeCode, sortedIds, outputVar, mode
      );

      return {
        vertexShader,
        fragmentShader,
        uniforms: new Map(this.uniforms),
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    } catch (err: any) {
      this.errors.push(`Kernelizer fatal error: ${err.message}`);
      return {
        vertexShader: this.fallbackVertexShader(),
        fragmentShader: this.fallbackFragmentShader(mode),
        uniforms: new Map(this.uniforms),
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }
  }

  // =========================================================================
  // Step 1: Flatten / Expand Group Nodes
  // =========================================================================

  /**
   * Flatten a NodeGroup into a flat list of KernelNodes.
   * Recursively expands nested NodeGroupInstance references.
   */
  private flattenGroup(
    group: NodeGroup,
    depth: number,
    prefix: string = '',
  ): { nodes: Map<string, KernelNode>; links: NodeLink[] } {
    if (depth > this.maxGroupDepth) {
      this.warnings.push(`Max group depth (${this.maxGroupDepth}) exceeded, stopping expansion`);
      return { nodes: new Map(), links: [] };
    }

    const nodes = new Map<string, KernelNode>();
    const links: NodeLink[] = [];

    for (let i = 0; i < group.internalNodes.length; i++) {
      const nodeDef = group.internalNodes[i];
      const nodeId = prefix ? `${prefix}_${i}` : `n${i}`;

      // Build input map from SocketDefinition
      const inputs = new Map<string, { type: string; defaultValue: any }>();
      if (nodeDef.inputs && Array.isArray(nodeDef.inputs)) {
        for (const inputDef of nodeDef.inputs) {
          const socketDef = inputDef as any; // SocketDefinition-like
          inputs.set(socketDef.name, {
            type: String(socketDef.type || 'FLOAT'),
            defaultValue: socketDef.defaultValue ?? socketDef.default ?? 0,
          });
        }
      }

      // Build output map from SocketDefinition
      const outputs = new Map<string, { type: string }>();
      if (nodeDef.outputs && Array.isArray(nodeDef.outputs)) {
        for (const outputDef of nodeDef.outputs) {
          const socketDef = outputDef as any;
          outputs.set(socketDef.name, {
            type: String(socketDef.type || 'FLOAT'),
          });
        }
      }

      const kernelNode: KernelNode = {
        id: nodeId,
        type: String(nodeDef.type),
        name: nodeDef.properties?.label ?? nodeDef.type,
        properties: nodeDef.properties ?? {},
        inputs,
        outputs,
        isGroupNode: false,
      };

      nodes.set(nodeId, kernelNode);
    }

    // Rewrite links with prefixed node IDs
    for (const link of group.internalLinks) {
      links.push({
        id: prefix ? `${prefix}_${link.id}` : link.id,
        fromNode: prefix ? `${prefix}_${link.fromNode}` : link.fromNode,
        fromSocket: link.fromSocket,
        toNode: prefix ? `${prefix}_${link.toNode}` : link.toNode,
        toSocket: link.toSocket,
      });
    }

    // Also handle exposed input/output connections from the NodeGroup class
    // These connect GroupInput nodes to internal nodes and internal nodes to GroupOutput nodes
    for (const [inputName, conn] of (group as any).inputConnections?.entries?.() ?? []) {
      const fromNode = prefix ? `${prefix}_${conn.fromNode}` : conn.fromNode;
      // Find the group input node that produces this value
      // The group input node has the same naming convention as in addExposedInput
      for (const [nodeId, node] of nodes) {
        if (node.type === 'NodeGroupInput' || node.type === 'GroupInputNode') {
          if (node.outputs.has(inputName)) {
            links.push({
              id: `grp_in_link_${prefix}_${inputName}`,
              fromNode: nodeId,
              fromSocket: inputName,
              toNode: prefix ? `${prefix}_${conn.fromNode}` : conn.fromNode,
              toSocket: conn.fromOutput,
            });
          }
        }
      }
    }

    return { nodes, links };
  }

  // =========================================================================
  // Step 2: Regularize Graph
  // =========================================================================

  /**
   * Remove functional/passthrough nodes from the graph.
   * Rewires connections around Reroute and Frame nodes.
   */
  private regularizeGraph(
    flat: { nodes: Map<string, KernelNode>; links: NodeLink[] },
    _originalLinks: NodeLink[],
  ): { nodes: Map<string, KernelNode>; links: NodeLink[] } {
    const nodesToRemove = new Set<string>();

    // Find all functional nodes
    for (const [nodeId, node] of flat.nodes) {
      if (FUNCTIONAL_NODE_TYPES.has(node.type)) {
        nodesToRemove.add(nodeId);
      }
    }

    // Rewire links around removed nodes
    const newLinks: NodeLink[] = [];
    const linkById = new Map<string, NodeLink>();
    for (const link of flat.links) {
      linkById.set(link.id, link);
    }

    // For each removed node, find what feeds into it and what it feeds into,
    // then create a direct link bypassing it.
    for (const removeId of nodesToRemove) {
      const incomingLinks = flat.links.filter(l => l.toNode === removeId);
      const outgoingLinks = flat.links.filter(l => l.fromNode === removeId);

      for (const inLink of incomingLinks) {
        for (const outLink of outgoingLinks) {
          newLinks.push({
            id: `rewired_${inLink.id}_${outLink.id}`,
            fromNode: inLink.fromNode,
            fromSocket: inLink.fromSocket,
            toNode: outLink.toNode,
            toSocket: outLink.toSocket,
          });
        }
      }
    }

    // Build new node map without removed nodes
    const newNodes = new Map<string, KernelNode>();
    for (const [nodeId, node] of flat.nodes) {
      if (!nodesToRemove.has(nodeId)) {
        newNodes.set(nodeId, node);
      }
    }

    // Keep links that don't involve removed nodes, plus rewired links
    const keptLinks = flat.links.filter(
      l => !nodesToRemove.has(l.fromNode) && !nodesToRemove.has(l.toNode)
    );

    return {
      nodes: newNodes,
      links: [...keptLinks, ...newLinks],
    };
  }

  // =========================================================================
  // Step 3: Topological Sort (Kahn's Algorithm)
  // =========================================================================

  /**
   * Topologically sort the nodes using Kahn's algorithm.
   * Returns an ordered array of node IDs such that all dependencies come before dependents.
   */
  private topologicalSort(
    nodes: Map<string, KernelNode>,
    links: NodeLink[],
  ): string[] {
    const adj = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const [id] of nodes) {
      adj.set(id, new Set());
      inDegree.set(id, 0);
    }

    for (const link of links) {
      if (adj.has(link.fromNode) && adj.has(link.toNode)) {
        adj.get(link.fromNode)!.add(link.toNode);
        inDegree.set(link.toNode, (inDegree.get(link.toNode) || 0) + 1);
      }
    }

    // Kahn's BFS
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
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

    // Cycle detection
    if (sorted.length !== nodes.size) {
      const cycleNodes: string[] = [];
      for (const [id] of nodes) {
        if (!visited.has(id)) cycleNodes.push(id);
      }
      this.warnings.push(`Cycle detected involving nodes: ${cycleNodes.join(', ')}`);
    }

    return sorted;
  }

  // =========================================================================
  // Step 4: Collect Required GLSL Snippets
  // =========================================================================

  /**
   * Determine which GLSL function libraries are required based on the node
   * types present in the graph.
   */
  private collectRequiredSnippets(nodes: Map<string, KernelNode>): void {
    // Always include common utilities
    this.requiredSnippets.add('COMMON_UTILITIES');

    let needsNoise = false;

    for (const [, node] of nodes) {
      const t = node.type;

      // Check if any node requires noise functions
      if (NOISE_REQUIRING_TYPES.has(t)) {
        needsNoise = true;
      }

      // Map node type to required GLSL snippet
      if (t === 'ShaderNodeTexNoise' || t === 'TextureNoiseNode') {
        this.requiredSnippets.add('NOISE_TEXTURE');
      } else if (t === 'ShaderNodeTexMusgrave' || t === 'TextureMusgraveNode') {
        this.requiredSnippets.add('MUSGRAVE_TEXTURE');
        this.requiredSnippets.add('NOISE_TEXTURE'); // Musgrave depends on noise
      } else if (t === 'ShaderNodeTexVoronoi' || t === 'TextureVoronoiNode') {
        this.requiredSnippets.add('VORONOI_TEXTURE');
      } else if (t === 'ShaderNodeTexWave' || t === 'TextureWaveNode') {
        this.requiredSnippets.add('WAVE_TEXTURE');
        this.requiredSnippets.add('NOISE_TEXTURE'); // Wave uses snoise3D
      } else if (t === 'ShaderNodeTexGradient' || t === 'TextureGradientNode') {
        this.requiredSnippets.add('GRADIENT_TEXTURE');
      } else if (t === 'ShaderNodeTexBrick' || t === 'TextureBrickNode') {
        this.requiredSnippets.add('BRICK_TEXTURE');
      } else if (t === 'ShaderNodeTexChecker' || t === 'TextureCheckerNode') {
        this.requiredSnippets.add('CHECKER_TEXTURE');
      } else if (t === 'ShaderNodeTexMagic' || t === 'TextureMagicNode') {
        this.requiredSnippets.add('MAGIC_TEXTURE');
      } else if (t === 'ShaderNodeValToRGB' || t === 'ColorRampNode') {
        this.requiredSnippets.add('COLOR_RAMP');
      } else if (t === 'ShaderNodeFloatCurve' || t === 'FloatCurveNode') {
        this.requiredSnippets.add('FLOAT_CURVE');
      } else if (t === 'ShaderNodeMixRGB' || t === 'MixRGBNode' || t === 'ShaderNodeMix' || t === 'MixNode') {
        this.requiredSnippets.add('MIX_RGB');
      } else if (t === 'ShaderNodeMath' || t === 'MathNode') {
        this.requiredSnippets.add('MATH');
      } else if (t === 'ShaderNodeVectorMath' || t === 'VectorMathNode') {
        this.requiredSnippets.add('VECTOR_MATH');
      } else if (t === 'ShaderNodeMapping' || t === 'MappingNode') {
        this.requiredSnippets.add('MAPPING');
      } else if (t === 'ShaderNodeMapRange' || t === 'MapRangeNode') {
        this.requiredSnippets.add('MAP_RANGE');
      } else if (t === 'ShaderNodeSeparateXYZ' || t === 'SeparateXYZNode' ||
                 t === 'ShaderNodeCombineXYZ' || t === 'CombineXYZNode' ||
                 t === 'ShaderNodeSeparateColor' || t === 'SeparateColorNode' ||
                 t === 'ShaderNodeCombineColor' || t === 'CombineColorNode' ||
                 t === 'ShaderNodeSeparateRGB' || t === 'ShaderNodeCombineRGB') {
        this.requiredSnippets.add('SEPARATE_COMBINE');
      }

      // Noise is needed by several texture types
      if (needsNoise) {
        this.requiredSnippets.add('NOISE_TEXTURE');
      }
    }
  }

  // =========================================================================
  // Step 5: Generate GLSL Code per Node
  // =========================================================================

  /**
   * Generate GLSL variable declarations and function calls for a single node.
   */
  private generateNodeCode(
    nodeId: string,
    node: KernelNode,
    allNodes: Map<string, KernelNode>,
    links: NodeLink[],
  ): string {
    const prefix = this.allocVarPrefix(nodeId);
    this.nodeVarMap.set(nodeId, prefix);

    const nodeType = node.type;

    // ---- Group I/O nodes ----
    if (GROUP_IO_TYPES.has(nodeType)) {
      return this.generateGroupIOCode(nodeId, node, prefix, links, allNodes);
    }

    // ---- Texture nodes ----
    if (nodeType === 'ShaderNodeTexNoise' || nodeType === 'TextureNoiseNode') {
      return this.generateNoiseTextureCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeTexMusgrave' || nodeType === 'TextureMusgraveNode') {
      return this.generateMusgraveTextureCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeTexVoronoi' || nodeType === 'TextureVoronoiNode') {
      return this.generateVoronoiTextureCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeTexWave' || nodeType === 'TextureWaveNode') {
      return this.generateWaveTextureCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeTexGradient' || nodeType === 'TextureGradientNode') {
      return this.generateGradientTextureCode(nodeId, node, prefix, links, allNodes);
    }

    // ---- Math nodes ----
    if (nodeType === 'ShaderNodeMath' || nodeType === 'MathNode') {
      return this.generateMathCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeVectorMath' || nodeType === 'VectorMathNode') {
      return this.generateVectorMathCode(nodeId, node, prefix, links, allNodes);
    }

    // ---- Color / Mix nodes ----
    if (nodeType === 'ShaderNodeMixRGB' || nodeType === 'MixRGBNode' ||
        nodeType === 'ShaderNodeMix' || nodeType === 'MixNode') {
      return this.generateMixRGBCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeValToRGB' || nodeType === 'ColorRampNode') {
      return this.generateColorRampCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeFloatCurve' || nodeType === 'FloatCurveNode') {
      return this.generateFloatCurveCode(nodeId, node, prefix, links, allNodes);
    }

    // ---- Converter nodes ----
    if (nodeType === 'ShaderNodeMapRange' || nodeType === 'MapRangeNode') {
      return this.generateMapRangeCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeSeparateXYZ' || nodeType === 'SeparateXYZNode') {
      return this.generateSeparateXYZCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeCombineXYZ' || nodeType === 'CombineXYZNode') {
      return this.generateCombineXYZCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeSeparateColor' || nodeType === 'SeparateColorNode' ||
        nodeType === 'ShaderNodeSeparateRGB') {
      return this.generateSeparateColorCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeCombineColor' || nodeType === 'CombineColorNode' ||
        nodeType === 'ShaderNodeCombineRGB') {
      return this.generateCombineColorCode(nodeId, node, prefix, links, allNodes);
    }

    // ---- Vector / Mapping nodes ----
    if (nodeType === 'ShaderNodeMapping' || nodeType === 'MappingNode') {
      return this.generateMappingCode(nodeId, node, prefix, links, allNodes);
    }
    if (nodeType === 'ShaderNodeTexCoord' || nodeType === 'TextureCoordNode') {
      return this.generateTexCoordCode(nodeId, node, prefix);
    }

    // ---- Input nodes ----
    if (nodeType === 'ShaderNodeValue' || nodeType === 'ValueNode') {
      return this.generateValueCode(nodeId, node, prefix);
    }
    if (nodeType === 'ShaderNodeRGB' || nodeType === 'RGBNode') {
      return this.generateRGBCode(nodeId, node, prefix);
    }
    if (nodeType === 'FunctionNodeInputVector' || nodeType === 'VectorNode') {
      return this.generateVectorInputCode(nodeId, node, prefix);
    }
    if (nodeType === 'FunctionNodeInputBool' || nodeType === 'BooleanNode') {
      return this.generateBooleanInputCode(nodeId, node, prefix);
    }
    if (nodeType === 'FunctionNodeInputInt' || nodeType === 'IntegerNode') {
      return this.generateIntegerInputCode(nodeId, node, prefix);
    }

    // Unknown node — generate a passthrough with a warning
    this.warnings.push(`Unknown node type "${nodeType}" (node ${nodeId}), generating passthrough`);
    return `  // Unknown node type: ${nodeType} (${node.name})\n`;
  }

  // =========================================================================
  // Input Resolution
  // =========================================================================

  /**
   * Resolve the GLSL variable name and type for a node input.
   * If the input is connected to another node's output, returns that output variable.
   * Otherwise returns the default value (either from the socket or a uniform).
   */
  private resolveInput(
    nodeId: string,
    inputName: string,
    node: KernelNode,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): { varName: string; glslType: string } {
    // Find a link targeting this input
    for (const link of links) {
      if (link.toNode === nodeId && link.toSocket === inputName) {
        const sourcePrefix = this.nodeVarMap.get(link.fromNode);
        if (sourcePrefix) {
          const sourceNode = allNodes.get(link.fromNode);
          const glslType = this.socketTypeToGLSL(
            sourceNode?.outputs.get(link.fromSocket)?.type ?? 'FLOAT'
          );
          return {
            varName: `${sourcePrefix}_${this.sanitizeSocketName(link.fromSocket)}`,
            glslType,
          };
        }
      }
    }

    // Not connected — use default value
    const inputDef = node.inputs.get(inputName);
    const defaultValue = inputDef?.defaultValue;
    const glslType = this.socketTypeToGLSL(inputDef?.type ?? 'FLOAT');

    // Special cases: vector inputs default to position
    if (inputName === 'Vector' || inputName === 'vector') {
      return { varName: 'vPosition', glslType: 'vec3' };
    }

    // Create a uniform for the default value
    const uniformName = `u_${this.allocUniform()}_${this.sanitizeSocketName(inputName)}`;
    const glslValue = this.valueToGLSL(defaultValue, glslType);
    this.uniforms.set(uniformName, { glslType, value: this.parseUniformValue(defaultValue, glslType) });

    // For constant scalar/vector values, inline them instead of using uniforms
    if (typeof defaultValue === 'number' && !isNaN(defaultValue)) {
      const formatted = this.formatFloat(defaultValue);
      return { varName: formatted, glslType };
    }
    if (typeof defaultValue === 'boolean') {
      return { varName: defaultValue ? '1' : '0', glslType: 'int' };
    }

    return { varName: uniformName, glslType };
  }

  // =========================================================================
  // Node Code Generators
  // =========================================================================

  // -- Group I/O --
  private generateGroupIOCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const lines: string[] = [];
    const isInput = node.type.includes('Input');

    if (isInput) {
      // GroupInput nodes expose their outputs from the group's inputs
      for (const [outputName, outputDef] of node.outputs) {
        const glslType = this.socketTypeToGLSL(outputDef.type);
        const varName = `${prefix}_${this.sanitizeSocketName(outputName)}`;
        // Group inputs come from uniforms
        const uniformName = `u_grpInput_${this.sanitizeSocketName(outputName)}`;
        this.uniforms.set(uniformName, {
          glslType,
          value: this.parseUniformValue(
            node.properties[outputName] ?? 0,
            glslType,
          ),
        });
        lines.push(`  ${glslType} ${varName} = ${uniformName};`);
      }
    } else {
      // GroupOutput nodes collect their inputs
      for (const [inputName] of node.inputs) {
        const resolved = this.resolveInput(nodeId, inputName, node, links, allNodes);
        const varName = `${prefix}_${this.sanitizeSocketName(inputName)}`;
        lines.push(`  float ${varName} = ${resolved.varName}; // group output`);
      }
    }

    return lines.join('\n') + '\n';
  }

  // -- Noise Texture --
  private generateNoiseTextureCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const vector = this.resolveInput(nodeId, 'Vector', node, links, allNodes);
    const scale = this.resolveInput(nodeId, 'Scale', node, links, allNodes);
    const detail = this.resolveInput(nodeId, 'Detail', node, links, allNodes);
    const roughness = this.resolveInput(nodeId, 'Roughness', node, links, allNodes);
    const distortion = this.resolveInput(nodeId, 'Distortion', node, links, allNodes);

    return `
  // Noise Texture: ${node.name}
  float ${prefix}_Fac = noiseTexture(${vector.varName}, ${scale.varName}, ${detail.varName}, ${distortion.varName}, ${roughness.varName});
  vec3 ${prefix}_Color = noiseTextureColor(${vector.varName}, ${scale.varName}, ${detail.varName}, ${distortion.varName}, ${roughness.varName});
`;
  }

  // -- Musgrave Texture --
  private generateMusgraveTextureCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const vector = this.resolveInput(nodeId, 'Vector', node, links, allNodes);
    const scale = this.resolveInput(nodeId, 'Scale', node, links, allNodes);
    const detail = this.resolveInput(nodeId, 'Detail', node, links, allNodes);
    const dimension = this.resolveInput(nodeId, 'Dimension', node, links, allNodes);
    const lacunarity = this.resolveInput(nodeId, 'Lacunarity', node, links, allNodes);
    const offset = this.resolveInput(nodeId, 'Offset', node, links, allNodes);
    const gain = this.resolveInput(nodeId, 'Gain', node, links, allNodes);

    const musgraveType = node.properties.musgrave_type ?? 'FBM';
    const typeInt = this.musgraveTypeToInt(musgraveType);

    return `
  // Musgrave Texture: ${node.name} (type=${musgraveType})
  float ${prefix}_Fac = musgraveTexture(${vector.varName}, ${scale.varName}, ${detail.varName}, ${dimension.varName}, ${lacunarity.varName}, ${offset.varName}, ${gain.varName}, ${typeInt});
`;
  }

  // -- Voronoi Texture --
  private generateVoronoiTextureCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const vector = this.resolveInput(nodeId, 'Vector', node, links, allNodes);
    const scale = this.resolveInput(nodeId, 'Scale', node, links, allNodes);
    const smoothness = this.resolveInput(nodeId, 'Smoothness', node, links, allNodes);
    const exponent = this.resolveInput(nodeId, 'Exponent', node, links, allNodes);

    const distance = node.properties.distance ?? 'EUCLIDEAN';
    const feature = node.properties.feature ?? 'F1';
    const distInt = distance === 'MANHATTAN' ? 1 : distance === 'CHEBYCHEV' ? 2 : 0;
    const featInt = feature === 'F2' ? 1 : feature === 'DISTANCE_TO_EDGE' || feature === 'N_SPHERE_RADIUS' ? 2 : 0;

    return `
  // Voronoi Texture: ${node.name} (feature=${feature})
  float ${prefix}_Fac = voronoiTexture(${vector.varName}, ${scale.varName}, ${smoothness.varName}, ${exponent.varName}, ${distInt}, ${featInt});
  vec3 ${prefix}_Color = voronoiTextureColor(${vector.varName}, ${scale.varName}, ${smoothness.varName}, ${exponent.varName}, ${distInt}, ${featInt});
`;
  }

  // -- Wave Texture --
  private generateWaveTextureCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const vector = this.resolveInput(nodeId, 'Vector', node, links, allNodes);
    const scale = this.resolveInput(nodeId, 'Scale', node, links, allNodes);
    const distortion = this.resolveInput(nodeId, 'Distortion', node, links, allNodes);
    const detail = this.resolveInput(nodeId, 'Detail', node, links, allNodes);
    const detailScale = this.resolveInput(nodeId, 'Detail Scale', node, links, allNodes);
    const detailRoughness = this.resolveInput(nodeId, 'Detail Roughness', node, links, allNodes);

    const waveType = node.properties.wave_type ?? 'BANDS';
    const bandsDirection = node.properties.bands_direction ?? 'X';
    const typeInt = waveType === 'RINGS' ? 1 : 0;
    const dirInt = bandsDirection === 'Y' ? 1 : bandsDirection === 'Z' ? 2 : 0;

    return `
  // Wave Texture: ${node.name} (type=${waveType}, dir=${bandsDirection})
  float ${prefix}_Fac = waveTexture(${vector.varName}, ${scale.varName}, ${distortion.varName}, ${detail.varName}, ${detailScale.varName}, ${detailRoughness.varName}, ${typeInt}, ${dirInt});
  vec3 ${prefix}_Color = vec3(${prefix}_Fac);
`;
  }

  // -- Gradient Texture --
  private generateGradientTextureCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const vector = this.resolveInput(nodeId, 'Vector', node, links, allNodes);
    const gradientType = node.properties.gradient_type ?? 'LINEAR';
    const typeInt = this.gradientTypeToInt(gradientType);

    return `
  // Gradient Texture: ${node.name} (type=${gradientType})
  float ${prefix}_Fac = gradientTexture(${vector.varName}, ${typeInt});
  vec3 ${prefix}_Color = gradientTextureColor(${vector.varName}, ${typeInt});
`;
  }

  // -- Math --
  private generateMathCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const a = this.resolveInput(nodeId, 'Value', node, links, allNodes);
    const b = this.resolveInput(nodeId, 'Value_001', node, links, allNodes);
    const operation = node.properties.operation ?? 'ADD';
    const opInt = this.mathOpToInt(operation);

    return `
  // Math: ${node.name} (${operation})
  float ${prefix}_Value = mathOp(${a.varName}, ${b.varName}, ${opInt});
`;
  }

  // -- Vector Math --
  private generateVectorMathCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const a = this.resolveInput(nodeId, 'Vector', node, links, allNodes);
    const b = this.resolveInput(nodeId, 'Vector_001', node, links, allNodes);
    const scale = this.resolveInput(nodeId, 'Scale', node, links, allNodes);
    const operation = node.properties.operation ?? 'ADD';
    const opInt = this.vectorMathOpToInt(operation);

    return `
  // Vector Math: ${node.name} (${operation})
  VectorMathResult ${prefix}_vm = vectorMathOp(${a.varName}, ${b.varName}, ${scale.varName}, ${opInt});
  vec3 ${prefix}_Vector = ${prefix}_vm.vector;
  float ${prefix}_Value = ${prefix}_vm.value;
`;
  }

  // -- MixRGB / Mix --
  private generateMixRGBCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const factor = this.resolveInput(nodeId, 'Fac', node, links, allNodes);
    const color1 = this.resolveInput(nodeId, 'Color1', node, links, allNodes);
    const color2 = this.resolveInput(nodeId, 'Color2', node, links, allNodes);
    const blendType = node.properties.blend_type ?? 'MIX';
    const blendInt = this.blendTypeToInt(blendType);

    return `
  // MixRGB: ${node.name} (${blendType})
  vec3 ${prefix}_Color = mixRGB(${factor.varName}, ${color1.varName}, ${color2.varName}, ${blendInt});
`;
  }

  // -- ColorRamp --
  private generateColorRampCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const fac = this.resolveInput(nodeId, 'Fac', node, links, allNodes);

    // Color ramp stops from properties
    const stops = node.properties.stops ?? node.properties.color_ramp ?? [
      { position: 0.0, color: [0.0, 0.0, 0.0, 1.0] },
      { position: 1.0, color: [1.0, 1.0, 1.0, 1.0] },
    ];
    const interpolation = node.properties.interpolation ?? 'LINEAR';
    const modeInt = interpolation === 'CONSTANT' ? 0 : interpolation === 'EASE' ? 2 : 1;
    const stopCount = Math.min(stops.length, 16);

    // Declare uniform arrays
    const posDecls: string[] = [];
    const colDecls: string[] = [];
    for (let i = 0; i < stopCount; i++) {
      const posUniform = `u_${prefix}_crPos_${i}`;
      const colUniform = `u_${prefix}_crCol_${i}`;
      const posVal = stops[i].position ?? i / (stopCount - 1);
      const colVal = stops[i].color ?? [0.5, 0.5, 0.5, 1.0];
      this.uniforms.set(posUniform, { glslType: 'float', value: posVal });
      this.uniforms.set(colUniform, { glslType: 'vec4', value: colVal.length === 4 ? colVal : [...colVal, 1.0] });
      posDecls.push(posUniform);
      colDecls.push(colUniform);
    }

    // Pad to 16 elements
    while (posDecls.length < 16) posDecls.push('0.0');
    while (colDecls.length < 16) colDecls.push('vec4(0.0)');

    return `
  // ColorRamp: ${node.name} (${interpolation}, ${stopCount} stops)
  float ${prefix}_crPositions[16] = float[16](${posDecls.join(', ')});
  vec4 ${prefix}_crColors[16] = vec4[16](${colDecls.join(', ')});
  vec4 ${prefix}_Color4 = colorRamp(${fac.varName}, ${prefix}_crPositions, ${prefix}_crColors, ${stopCount}, ${modeInt});
  vec3 ${prefix}_Color = ${prefix}_Color4.rgb;
  float ${prefix}_Alpha = ${prefix}_Color4.a;
`;
  }

  // -- FloatCurve --
  private generateFloatCurveCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const fac = this.resolveInput(nodeId, 'Value', node, links, allNodes);

    const points = node.properties.points ?? node.properties.curve ?? [
      { position: 0.0, value: 0.0 },
      { position: 1.0, value: 1.0 },
    ];
    const pointCount = Math.min(points.length, 16);

    const posDecls: string[] = [];
    const valDecls: string[] = [];
    for (let i = 0; i < pointCount; i++) {
      const posUniform = `u_${prefix}_fcPos_${i}`;
      const valUniform = `u_${prefix}_fcVal_${i}`;
      this.uniforms.set(posUniform, { glslType: 'float', value: points[i].position ?? i / (pointCount - 1) });
      this.uniforms.set(valUniform, { glslType: 'float', value: points[i].value ?? 0.5 });
      posDecls.push(posUniform);
      valDecls.push(valUniform);
    }
    while (posDecls.length < 16) posDecls.push('0.0');
    while (valDecls.length < 16) valDecls.push('0.0');

    return `
  // FloatCurve: ${node.name} (${pointCount} points)
  float ${prefix}_fcPositions[16] = float[16](${posDecls.join(', ')});
  float ${prefix}_fcValues[16] = float[16](${valDecls.join(', ')});
  float ${prefix}_Value = floatCurve(${fac.varName}, ${prefix}_fcPositions, ${prefix}_fcValues, ${pointCount});
`;
  }

  // -- MapRange --
  private generateMapRangeCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const value = this.resolveInput(nodeId, 'Value', node, links, allNodes);
    const fromMin = this.resolveInput(nodeId, 'From Min', node, links, allNodes);
    const fromMax = this.resolveInput(nodeId, 'From Max', node, links, allNodes);
    const toMin = this.resolveInput(nodeId, 'To Min', node, links, allNodes);
    const toMax = this.resolveInput(nodeId, 'To Max', node, links, allNodes);

    const interpolation = node.properties.interpolation_type ?? 'LINEAR';
    const modeInt = interpolation === 'STEPPED' ? 1 : interpolation === 'SMOOTHSTEP' ? 2 : interpolation === 'SMOOTHERSTEP' ? 3 : 0;

    return `
  // MapRange: ${node.name} (${interpolation})
  float ${prefix}_Result = mapRange(${value.varName}, ${fromMin.varName}, ${fromMax.varName}, ${toMin.varName}, ${toMax.varName}, ${modeInt});
`;
  }

  // -- SeparateXYZ --
  private generateSeparateXYZCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const vector = this.resolveInput(nodeId, 'Vector', node, links, allNodes);

    return `
  // SeparateXYZ: ${node.name}
  float ${prefix}_X = ${vector.varName}.x;
  float ${prefix}_Y = ${vector.varName}.y;
  float ${prefix}_Z = ${vector.varName}.z;
`;
  }

  // -- CombineXYZ --
  private generateCombineXYZCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const x = this.resolveInput(nodeId, 'X', node, links, allNodes);
    const y = this.resolveInput(nodeId, 'Y', node, links, allNodes);
    const z = this.resolveInput(nodeId, 'Z', node, links, allNodes);

    return `
  // CombineXYZ: ${node.name}
  vec3 ${prefix}_Vector = vec3(${x.varName}, ${y.varName}, ${z.varName});
`;
  }

  // -- SeparateColor --
  private generateSeparateColorCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const color = this.resolveInput(nodeId, 'Color', node, links, allNodes);

    return `
  // SeparateColor: ${node.name}
  float ${prefix}_R = ${color.varName}.r;
  float ${prefix}_G = ${color.varName}.g;
  float ${prefix}_B = ${color.varName}.b;
  float ${prefix}_A = 1.0; // alpha passthrough
`;
  }

  // -- CombineColor --
  private generateCombineColorCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const r = this.resolveInput(nodeId, 'Red', node, links, allNodes);
    const g = this.resolveInput(nodeId, 'Green', node, links, allNodes);
    const b = this.resolveInput(nodeId, 'Blue', node, links, allNodes);

    return `
  // CombineColor: ${node.name}
  vec3 ${prefix}_Color = vec3(${r.varName}, ${g.varName}, ${b.varName});
`;
  }

  // -- Mapping --
  private generateMappingCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
    links: NodeLink[],
    allNodes: Map<string, KernelNode>,
  ): string {
    const vector = this.resolveInput(nodeId, 'Vector', node, links, allNodes);
    const translation = node.properties.translation ?? [0, 0, 0];
    const rotation = node.properties.rotation ?? [0, 0, 0];
    const scale = node.properties.scale ?? [1, 1, 1];

    const uTrans = this.addUniform(`${prefix}_translation`, 'vec3', translation);
    const uRot = this.addUniform(`${prefix}_rotation`, 'vec3', rotation);
    const uScale = this.addUniform(`${prefix}_scale`, 'vec3', scale);

    return `
  // Mapping: ${node.name}
  vec3 ${prefix}_Vector = mappingNode(${vector.varName}, ${uTrans}, ${uRot}, ${uScale}, 0);
`;
  }

  // -- TextureCoordinate --
  private generateTexCoordCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
  ): string {
    return `
  // TextureCoordinate: ${node.name}
  vec3 ${prefix}_Generated = vPosition;
  vec3 ${prefix}_Normal = vNormal;
  vec2 ${prefix}_UV = vUV;
  vec3 ${prefix}_Object = vPosition;
  vec3 ${prefix}_Camera = cameraPosition - vWorldPosition;
  vec3 ${prefix}_Window = vPosition;
  vec3 ${prefix}_Reflection = reflect(normalize(cameraPosition - vWorldPosition), vNormal);
`;
  }

  // -- Value input --
  private generateValueCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
  ): string {
    const val = node.properties.value ?? node.properties.Value ?? 0.0;
    const uName = this.addUniform(`${prefix}_value`, 'float', val);
    return `  float ${prefix}_Value = ${uName};\n`;
  }

  // -- RGB input --
  private generateRGBCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
  ): string {
    const color = node.properties.color ?? node.properties.Color ?? [0.8, 0.8, 0.8];
    const uName = this.addUniform(`${prefix}_color`, 'vec3', color);
    return `  vec3 ${prefix}_Color = ${uName};\n`;
  }

  // -- Vector input --
  private generateVectorInputCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
  ): string {
    const vector = node.properties.vector ?? node.properties.Vector ?? [0, 0, 0];
    const uName = this.addUniform(`${prefix}_vector`, 'vec3', vector);
    return `  vec3 ${prefix}_Vector = ${uName};\n`;
  }

  // -- Boolean input --
  private generateBooleanInputCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
  ): string {
    const val = node.properties.boolean ?? node.properties.value ?? false;
    return `  int ${prefix}_Value = ${val ? 1 : 0};\n`;
  }

  // -- Integer input --
  private generateIntegerInputCode(
    nodeId: string,
    node: KernelNode,
    prefix: string,
  ): string {
    const val = node.properties.integer ?? node.properties.value ?? 0;
    return `  int ${prefix}_Value = ${Math.round(val)};\n`;
  }

  // =========================================================================
  // Step 6: Resolve Group Output
  // =========================================================================

  /**
   * Find the variable that represents the final output of the node group.
   */
  private resolveGroupOutput(
    nodeGroup: NodeGroup,
    regularized: { nodes: Map<string, KernelNode>; links: NodeLink[] },
  ): { displacement: string; color: string; roughness: string; metallic: string; ao: string } {
    const outputConns = (nodeGroup as any).outputConnections as Map<string, { toNode: string; toInput: string }> | undefined;
    const result = {
      displacement: '0.0',
      color: 'vec3(0.5)',
      roughness: '0.5',
      metallic: '0.0',
      ao: '1.0',
    };

    if (!outputConns) {
      // Fallback: find GroupOutput node and trace back
      for (const [nodeId, node] of regularized.nodes) {
        if (node.type === 'NodeGroupOutput' || node.type === 'GroupOutputNode') {
          const prefix = this.nodeVarMap.get(nodeId);
          if (prefix) {
            // Try to find what feeds into this output
            for (const link of regularized.links) {
              if (link.toNode === nodeId) {
                const srcPrefix = this.nodeVarMap.get(link.fromNode);
                if (srcPrefix) {
                  result.displacement = `${srcPrefix}_${this.sanitizeSocketName(link.fromSocket)}`;
                  result.color = result.displacement;
                }
              }
            }
          }
          break;
        }
      }
      return result;
    }

    // Use the group's output connections to find the final output variable
    for (const [outputName, conn] of outputConns) {
      // Find the internal node that produces the output
      for (const link of regularized.links) {
        // The toNode/toInput from outputConnections refers to the GroupOutput node
        // But we need the node that feeds INTO the output
      }

      // Look for the source node by tracing connections
      for (const [nodeId, node] of regularized.nodes) {
        if (node.type === 'NodeGroupOutput' || node.type === 'GroupOutputNode') {
          const prefix = this.nodeVarMap.get(nodeId);
          if (prefix) {
            // Find the link that feeds this output
            for (const link of regularized.links) {
              if (link.toNode === nodeId) {
                const srcPrefix = this.nodeVarMap.get(link.fromNode);
                if (srcPrefix) {
                  const outputVar = `${srcPrefix}_${this.sanitizeSocketName(link.fromSocket)}`;
                  if (outputName.toLowerCase().includes('displacement') || outputName.toLowerCase().includes('height')) {
                    result.displacement = outputVar;
                  } else if (outputName.toLowerCase().includes('color') || outputName.toLowerCase().includes('base')) {
                    result.color = outputVar;
                  } else if (outputName.toLowerCase().includes('rough')) {
                    result.roughness = outputVar;
                  } else if (outputName.toLowerCase().includes('metal')) {
                    result.metallic = outputVar;
                  } else if (outputName.toLowerCase().includes('ao') || outputName.toLowerCase().includes('ambient')) {
                    result.ao = outputVar;
                  } else {
                    // Default: treat the first unnamed output as displacement
                    if (result.displacement === '0.0') {
                      result.displacement = outputVar;
                    }
                  }
                }
              }
            }
          }
          break;
        }
      }
    }

    return result;
  }

  // =========================================================================
  // Step 7: Compose Complete Shaders
  // =========================================================================

  /**
   * Compose the complete vertex and fragment shaders from the generated node code.
   */
  private composeShaders(
    nodeCode: Map<string, string>,
    sortedIds: string[],
    outputVars: { displacement: string; color: string; roughness: string; metallic: string; ao: string },
    mode: KernelizerMode,
  ): { vertexShader: string; fragmentShader: string } {
    const versionHeader = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

    // -------------------------------------------------------------------------
    // Vertex shader
    // -------------------------------------------------------------------------
    const vertexShader = `${versionHeader}
// ============================================================================
// Vertex Shader — Generated by NodeGraphKernelizer
// ============================================================================

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

    // -------------------------------------------------------------------------
    // Fragment shader
    // -------------------------------------------------------------------------

    // Collect required GLSL function libraries
    const functionLib = this.buildFunctionLibrary();

    // Collect uniform declarations
    const uniformDecls: string[] = [];
    for (const [name, info] of this.uniforms) {
      uniformDecls.push(`uniform ${info.glslType} ${name};`);
    }

    // Collect node body code
    const bodyLines: string[] = [];
    for (const nodeId of sortedIds) {
      const code = nodeCode.get(nodeId);
      if (code) bodyLines.push(code);
    }

    // Determine output based on mode
    let outputCode: string;
    if (mode === 'displacement') {
      outputCode = `
  // Output displacement value
  float displacement = ${outputVars.displacement};
  fragColor = vec4(vec3(displacement), 1.0);
`;
    } else {
      // Material mode
      outputCode = `
  // Output material properties
  vec3 baseColor = ${outputVars.color};
  float roughness = ${outputVars.roughness};
  float metallic = ${outputVars.metallic};
  float ao = ${outputVars.ao};

  // Simple lighting for preview
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.5, 1.0, 0.8));
  float NdotL = max(dot(N, L), 0.0);
  vec3 ambient = 0.3 * baseColor * ao;
  vec3 diffuse = baseColor * NdotL;

  // Metallic mix
  vec3 color = mix(diffuse + ambient, baseColor * (0.5 + 0.5 * NdotL), metallic);

  // Tone mapping
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));

  fragColor = vec4(color, 1.0);
`;
    }

    const fragmentShader = `${versionHeader}
// ============================================================================
// Fragment Shader — Generated by NodeGraphKernelizer (mode: ${mode})
// ============================================================================

in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;

out vec4 fragColor;

uniform vec3 cameraPosition;

// ============================================================================
// Uniforms
// ============================================================================
${uniformDecls.join('\n')}

// ============================================================================
// GLSL Function Library
// ============================================================================
${functionLib}

// ============================================================================
// Main
// ============================================================================
void main() {
${bodyLines.join('\n')}
${outputCode}
}
`;

    return { vertexShader, fragmentShader };
  }

  // =========================================================================
  // GLSL Function Library Builder
  // =========================================================================

  /**
   * Build the complete GLSL function library string by concatenating
   * the required snippets.
   */
  private buildFunctionLibrary(): string {
    const parts: string[] = [];

    // Always include common utilities
    parts.push(COMMON_UTILITIES_GLSL);

    // Add each required snippet
    if (this.requiredSnippets.has('NOISE_TEXTURE')) {
      parts.push(NOISE_TEXTURE_GLSL);
    }
    if (this.requiredSnippets.has('VORONOI_TEXTURE')) {
      parts.push(VORONOI_TEXTURE_GLSL);
    }
    if (this.requiredSnippets.has('MUSGRAVE_TEXTURE')) {
      parts.push(MUSGRAVE_TEXTURE_GLSL);
    }
    if (this.requiredSnippets.has('WAVE_TEXTURE')) {
      parts.push(WAVE_TEXTURE_GLSL);
    }
    if (this.requiredSnippets.has('GRADIENT_TEXTURE')) {
      parts.push(GRADIENT_TEXTURE_GLSL);
    }
    if (this.requiredSnippets.has('COLOR_RAMP')) {
      parts.push(COLOR_RAMP_GLSL);
    }
    if (this.requiredSnippets.has('FLOAT_CURVE')) {
      parts.push(FLOAT_CURVE_GLSL);
    }
    if (this.requiredSnippets.has('MIX_RGB')) {
      parts.push(MIX_RGB_GLSL);
    }
    if (this.requiredSnippets.has('MATH')) {
      parts.push(MATH_GLSL);
    }
    if (this.requiredSnippets.has('VECTOR_MATH')) {
      parts.push(VECTOR_MATH_GLSL);
    }
    if (this.requiredSnippets.has('MAPPING')) {
      parts.push(MAPPING_GLSL);
    }
    if (this.requiredSnippets.has('MAP_RANGE')) {
      parts.push(MAP_RANGE_GLSL);
    }
    if (this.requiredSnippets.has('SEPARATE_COMBINE')) {
      parts.push(SEPARATE_COMBINE_GLSL);
    }

    return parts.join('\n');
  }

  // =========================================================================
  // Fallback Shaders
  // =========================================================================

  private fallbackVertexShader(): string {
    return `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
  }

  private fallbackFragmentShader(mode: KernelizerMode): string {
    if (mode === 'displacement') {
      return `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;
out vec4 fragColor;

void main() {
  fragColor = vec4(vec3(0.0), 1.0);
}
`;
    }
    return `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;
out vec4 fragColor;
uniform vec3 cameraPosition;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.5, 1.0, 0.8));
  float NdotL = max(dot(N, L), 0.0);
  vec3 color = vec3(0.8) * (0.15 + NdotL * 0.85);
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));
  fragColor = vec4(color, 1.0);
}
`;
  }

  // =========================================================================
  // Utility Helpers
  // =========================================================================

  /** Allocate a unique variable prefix for a node */
  private allocVarPrefix(nodeId: string): string {
    return `k${this.varCounter++}`;
  }

  /** Allocate a unique uniform index */
  private allocUniform(): number {
    return this.uniformCounter++;
  }

  /** Add a uniform and return its name */
  private addUniform(baseName: string, glslType: string, value: any): string {
    const name = `u_${baseName}`;
    this.uniforms.set(name, { glslType, value: this.parseUniformValue(value, glslType) });
    return name;
  }

  /** Sanitize a socket name for use as a GLSL variable suffix */
  private sanitizeSocketName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^(\d)/, '_$1')
      .replace(/_+/g, '_')
      .replace(/_$/, '');
  }

  /** Convert a SocketType to a GLSL type string */
  private socketTypeToGLSL(socketType: string): string {
    const t = String(socketType).toUpperCase();
    switch (t) {
      case 'FLOAT':
      case 'VALUE':
        return 'float';
      case 'VECTOR':
      case 'FLOAT_VECTOR':
        return 'vec3';
      case 'COLOR':
      case 'RGB':
      case 'RGBA':
      case 'FLOAT_COLOR':
        return 'vec3';
      case 'INT':
      case 'INTEGER':
        return 'int';
      case 'BOOLEAN':
        return 'int';
      case 'VEC2':
      case 'FLOAT2':
        return 'vec2';
      case 'VEC4':
        return 'vec4';
      default:
        return 'float';
    }
  }

  /** Convert a TypeScript value to a GLSL literal string */
  private valueToGLSL(value: any, glslType: string): string {
    if (value === undefined || value === null) {
      switch (glslType) {
        case 'float': return '0.0';
        case 'vec2': return 'vec2(0.0)';
        case 'vec3': return 'vec3(0.0)';
        case 'vec4': return 'vec4(0.0, 0.0, 0.0, 1.0)';
        case 'int': return '0';
        default: return '0.0';
      }
    }

    if (typeof value === 'number') {
      if (glslType === 'int') return String(Math.round(value));
      return this.formatFloat(value);
    }

    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }

    if (Array.isArray(value)) {
      const formatted = value.map(v => typeof v === 'number' ? this.formatFloat(v) : '0.0');
      if (value.length === 2) return `vec2(${formatted.join(', ')})`;
      if (value.length === 3) return `vec3(${formatted.join(', ')})`;
      if (value.length === 4) return `vec4(${formatted.join(', ')})`;
    }

    if (typeof value === 'object' && 'x' in value && 'y' in value && 'z' in value) {
      return `vec3(${this.formatFloat(value.x)}, ${this.formatFloat(value.y)}, ${this.formatFloat(value.z)})`;
    }
    if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
      return `vec3(${this.formatFloat(value.r)}, ${this.formatFloat(value.g)}, ${this.formatFloat(value.b)})`;
    }

    return '0.0';
  }

  /** Parse a value for the uniform map (not GLSL string, runtime value) */
  private parseUniformValue(value: any, glslType: string): any {
    if (value === undefined || value === null) {
      switch (glslType) {
        case 'float': return 0;
        case 'vec2': return [0, 0];
        case 'vec3': return [0, 0, 0];
        case 'vec4': return [0, 0, 0, 1];
        case 'int': return 0;
        default: return 0;
      }
    }
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (Array.isArray(value)) return value;
    if (typeof value === 'object' && 'x' in value) return [value.x ?? 0, value.y ?? 0, value.z ?? 0];
    if (typeof value === 'object' && 'r' in value) return [value.r ?? 0, value.g ?? 0, value.b ?? 0];
    return value;
  }

  /** Format a float number for GLSL */
  private formatFloat(n: number): string {
    if (Number.isInteger(n)) return `${n}.0`;
    const s = n.toFixed(6);
    return s.includes('.') ? s : s + '.0';
  }

  // =========================================================================
  // Enum-to-int conversion helpers
  // =========================================================================

  private musgraveTypeToInt(type: string): number {
    const map: Record<string, number> = {
      'FBM': 0, 'fBm': 0, 'fbm': 0,
      'MULTIFRACTAL': 1, 'multifractal': 1, 'MultiFractal': 1,
      'RIDGED_MULTIFRACTAL': 2, 'ridged_multifractal': 2, 'Ridged': 2, 'RIDGED': 2,
      'HYBRID_MULTIFRACTAL': 3, 'hybrid_multifractal': 3, 'Hybrid': 3, 'HYBRID': 3,
      'HETERO_TERRAIN': 4, 'hetero_terrain': 4, 'HeteroTerrain': 4, 'HETERO': 4,
    };
    return map[type] ?? 0;
  }

  private gradientTypeToInt(type: string): number {
    const map: Record<string, number> = {
      'LINEAR': 0, 'linear': 0,
      'QUADRATIC': 1, 'quadratic': 1,
      'EASED': 2, 'eased': 2,
      'DIAGONAL': 3, 'diagonal': 3,
      'SPHERICAL': 4, 'spherical': 4,
      'QUADRATIC_SPHERE': 5, 'quadratic_sphere': 5,
      'RADIAL': 6, 'radial': 6,
    };
    return map[type] ?? 0;
  }

  private mathOpToInt(op: string): number {
    const map: Record<string, number> = {
      'ADD': 0, 'add': 0,
      'SUBTRACT': 1, 'subtract': 1,
      'MULTIPLY': 2, 'multiply': 2,
      'DIVIDE': 3, 'divide': 3,
      'POWER': 4, 'power': 4,
      'LOGARITHM': 5, 'logarithm': 5,
      'SQRT': 6, 'sqrt': 6,
      'INVERSE': 7, 'inverse': 7,
      'ABSOLUTE': 8, 'absolute': 8,
      'COMPARE': 9, 'compare': 9,
      'MINIMUM': 10, 'minimum': 10,
      'MAXIMUM': 11, 'maximum': 11,
      'SINE': 12, 'sine': 12,
      'COSINE': 13, 'cosine': 13,
      'TANGENT': 14, 'tangent': 14,
      'ARCSINE': 15, 'arcsine': 15,
      'ARCCOSINE': 16, 'arccosine': 16,
      'ARCTANGENT2': 17, 'arctangent2': 17,
      'SIGN': 18, 'sign': 18,
      'EXPONENT': 19, 'exponent': 19,
      'MODULO': 20, 'modulo': 20,
      'FLOOR': 21, 'floor': 21,
      'CEIL': 22, 'ceil': 22,
      'FRACTION': 23, 'fraction': 23,
      'CLAMP': 25, 'clamp': 25,
    };
    return map[op] ?? 0;
  }

  private vectorMathOpToInt(op: string): number {
    const map: Record<string, number> = {
      'ADD': 0, 'add': 0,
      'SUBTRACT': 1, 'subtract': 1,
      'MULTIPLY': 2, 'multiply': 2,
      'DIVIDE': 3, 'divide': 3,
      'CROSS_PRODUCT': 4, 'cross': 4, 'CROSS': 4,
      'DOT_PRODUCT': 5, 'dot': 5, 'DOT': 5,
      'NORMALIZE': 6, 'normalize': 6,
      'LENGTH': 7, 'length': 7,
      'DISTANCE': 8, 'distance': 8,
      'SCALE': 9, 'scale': 9,
      'REFLECT': 10, 'reflect': 10,
      'REFRACT': 11, 'refract': 11,
      'FACEFORWARD': 12, 'faceforward': 12,
      'MULTIPLY_ADD': 13, 'multiply_add': 13,
      'PROJECT': 14, 'project': 14,
    };
    return map[op] ?? 0;
  }

  private blendTypeToInt(blendType: string): number {
    const map: Record<string, number> = {
      'MIX': 0, 'mix': 0,
      'ADD': 1, 'add': 1,
      'MULTIPLY': 2, 'multiply': 2,
      'SUBTRACT': 3, 'subtract': 3,
      'SCREEN': 4, 'screen': 4,
      'DIVIDE': 5, 'divide': 5,
      'DIFFERENCE': 6, 'difference': 6,
      'DARKEN': 7, 'darken': 7,
      'LIGHTEN': 8, 'lighten': 8,
      'OVERLAY': 9, 'overlay': 9,
      'COLOR_DODGE': 10, 'color_dodge': 10,
      'COLOR_BURN': 11, 'color_burn': 11,
      'HARD_LIGHT': 12, 'hard_light': 12,
      'SOFT_LIGHT': 13, 'soft_light': 13,
      'LINEAR_LIGHT': 14, 'linear_light': 14,
    };
    return map[blendType] ?? 0;
  }
}

// ============================================================================
// Convenience function
// ============================================================================

/**
 * Kernelize a NodeGroup into GLSL shaders.
 *
 * This is the main entry point for the kernelizer. It creates a new
 * NodeGraphKernelizer instance and calls kernelize() on it.
 *
 * @param nodeGroup - The NodeGroup to transpile.
 * @param mode - Output mode: 'displacement' or 'material'.
 * @returns KernelizerResult with vertex shader, fragment shader, uniforms, warnings, and errors.
 *
 * @example
 * ```typescript
 * import { kernelizeNodeGroup } from './NodeGraphKernelizer';
 * import { NodeGroup } from '@/core/nodes/core/NodeGeometryModifierBridge';
 *
 * const group = new NodeGroup('TerrainDisplacement');
 * // ... set up nodes and connections ...
 *
 * const result = kernelizeNodeGroup(group, 'displacement');
 * console.log(result.fragmentShader); // Complete GLSL fragment shader
 * console.log(result.warnings);       // Any warnings during kernelization
 * ```
 */
export function kernelizeNodeGroup(
  nodeGroup: NodeGroup,
  mode: KernelizerMode,
): KernelizerResult {
  const kernelizer = new NodeGraphKernelizer();
  return kernelizer.kernelize(nodeGroup, mode);
}
