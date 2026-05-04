/**
 * GLSL Shader Composer
 *
 * Takes a shader graph (from ShaderGraphBuilder) and composes a complete
 * GLSL fragment shader by:
 * 1. Topologically sorting the nodes
 * 2. Generating GLSL variable declarations for each node output
 * 3. Concatenating: GLSL header, common utilities, uniform declarations,
 *    node function implementations, and main function body
 *
 * Supports:
 * - All Infinigen texture, color, math, vector, and shader node types
 * - IBL (Image-Based Lighting)
 * - Multi-light environments (up to 4 point + 1 directional)
 * - Shadow mapping for directional light
 * - Cook-Torrance PBR with GGX distribution
 *
 * @module core/nodes/execution/glsl
 */

import * as THREE from 'three';
import type { NodeLink } from '../../core/types';
import {
  COMMON_UTILITIES_GLSL,
  GLSL_SNIPPET_MAP,
  NODE_TYPE_GLSL_REQUIREMENTS,
} from './GLSLNodeFunctions';

// ============================================================================
// Types
// ============================================================================

/** A simplified shader graph node for the composer */
export interface ComposableNode {
  id: string;
  type: string;
  name: string;
  inputs: Map<string, { type: string; value?: any; connectedLinks: string[] }>;
  outputs: Map<string, { type: string; value?: any; connectedLinks: string[] }>;
  settings: Record<string, any>;
}

/** The shader graph to compose */
export interface ShaderGraph {
  nodes: Map<string, ComposableNode>;
  links: NodeLink[];
}

/** Result of composing a shader */
export interface ComposedShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  warnings: string[];
  errors: string[];
}

/** Uniform declaration info */
interface UniformDecl {
  name: string;
  glslType: string;
  threeType: 'float' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D' | 'int' | 'color';
  value: any;
}

// ============================================================================
// GLSL Header Templates
// ============================================================================

const GLSL_VERSION_HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

const VERTEX_SHADER_TEMPLATE = `${GLSL_VERSION_HEADER}

// Vertex attributes
in vec3 position;
in vec3 normal;
in vec2 uv;

// Uniforms
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// Varyings
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

// ============================================================================
// GLSL Type Mapping
// ============================================================================

/** Map socket types to GLSL types */
function socketTypeToGLSL(socketType: string): string {
  switch (socketType) {
    case 'FLOAT': return 'float';
    case 'VECTOR': return 'vec3';
    case 'COLOR': return 'vec3';
    case 'RGBA': return 'vec4';
    case 'INT': return 'int';
    case 'BOOLEAN': return 'int';
    case 'SHADER': return 'int'; // Shader types are handled specially
    default: return 'float';
  }
}

/** Map a value to its GLSL representation */
function valueToGLSL(value: any, type: string): string {
  if (value === undefined || value === null) {
    switch (type) {
      case 'float': return '0.0';
      case 'vec2': return 'vec2(0.0)';
      case 'vec3': return 'vec3(0.0)';
      case 'vec4': return 'vec4(0.0, 0.0, 0.0, 1.0)';
      case 'int': return '0';
      default: return '0.0';
    }
  }

  if (typeof value === 'number') {
    if (type === 'int') return String(Math.round(value));
    const s = value.toFixed(6);
    return s.includes('.') ? s : s + '.0';
  }

  if (Array.isArray(value)) {
    if (value.length === 2) return `vec2(${value.map(v => Number(v).toFixed(6)).join(', ')})`;
    if (value.length === 3) return `vec3(${value.map(v => Number(v).toFixed(6)).join(', ')})`;
    if (value.length === 4) return `vec4(${value.map(v => Number(v).toFixed(6)).join(', ')})`;
  }

  if (value instanceof THREE.Color) {
    return `vec3(${value.r.toFixed(6)}, ${value.g.toFixed(6)}, ${value.b.toFixed(6)})`;
  }

  if (value instanceof THREE.Vector2) {
    return `vec2(${value.x.toFixed(6)}, ${value.y.toFixed(6)})`;
  }

  if (value instanceof THREE.Vector3) {
    return `vec3(${value.x.toFixed(6)}, ${value.y.toFixed(6)}, ${value.z.toFixed(6)})`;
  }

  if (value instanceof THREE.Vector4) {
    return `vec4(${value.x.toFixed(6)}, ${value.y.toFixed(6)}, ${value.z.toFixed(6)}, ${value.w.toFixed(6)})`;
  }

  if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
    return `vec3(${Number(value.r).toFixed(6)}, ${Number(value.g).toFixed(6)}, ${Number(value.b).toFixed(6)})`;
  }

  if (typeof value === 'object' && 'x' in value && 'y' in value && 'z' in value) {
    return `vec3(${Number(value.x).toFixed(6)}, ${Number(value.y).toFixed(6)}, ${Number(value.z).toFixed(6)})`;
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (typeof value === 'string') {
    // For enum-like values, return the string (will be mapped to int in GLSL)
    return '0'; // Default to 0, will be handled by node-specific code
  }

  return '0.0';
}

// ============================================================================
// GLSLShaderComposer Class
// ============================================================================

export class GLSLShaderComposer {
  private uniforms: Map<string, UniformDecl> = new Map();
  private requiredSnippets: Set<string> = new Set();
  private warnings: string[] = [];
  private errors: string[] = [];
  private variableCounter: number = 0;
  private uniformCounter: number = 0;

  /**
   * Compose a complete GLSL shader from a shader graph
   */
  compose(graph: ShaderGraph, options?: { enableIBL?: boolean; enableShadows?: boolean }): ComposedShader {
    this.uniforms.clear();
    this.requiredSnippets.clear();
    this.warnings = [];
    this.errors = [];
    this.variableCounter = 0;
    this.uniformCounter = 0;

    const enableIBL = options?.enableIBL ?? false;
    const enableShadows = options?.enableShadows ?? false;

    try {
      // Step 1: Topological sort
      const sortedNodeIds = this.topologicalSort(graph);

      // Step 2: Determine required GLSL function snippets
      this.collectRequiredSnippets(graph);

      // Step 3: Generate variable names and code for each node
      const nodeCode = new Map<string, string>();
      for (const nodeId of sortedNodeIds) {
        const node = graph.nodes.get(nodeId);
        if (!node) continue;
        const code = this.generateNodeCode(nodeId, node, graph);
        nodeCode.set(nodeId, code);
      }

      // Step 4: Find the output node (MaterialOutput)
      let outputNodeId: string | null = null;
      for (const [id, node] of graph.nodes) {
        if (node.type === 'ShaderNodeOutputMaterial' || node.type === 'MaterialOutputNode') {
          outputNodeId = id;
          break;
        }
      }

      if (!outputNodeId) {
        this.warnings.push('No MaterialOutput node found in graph');
      }

      // Step 5: Compose the fragment shader
      const fragmentShader = this.composeFragmentShader(
        nodeCode, outputNodeId, graph, enableIBL, enableShadows
      );

      // Step 6: Build uniforms map
      const threeUniforms = this.buildThreeUniforms();

      return {
        vertexShader: VERTEX_SHADER_TEMPLATE,
        fragmentShader,
        uniforms: threeUniforms,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    } catch (error: any) {
      this.errors.push(error.message);
      return {
        vertexShader: VERTEX_SHADER_TEMPLATE,
        fragmentShader: this.generateFallbackFragmentShader(),
        uniforms: this.buildThreeUniforms(),
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }
  }

  // ==========================================================================
  // Topological Sort
  // ==========================================================================

  private topologicalSort(graph: ShaderGraph): string[] {
    const nodes = graph.nodes;
    const links = graph.links;

    // Build adjacency list and in-degree count
    const adj: Map<string, Set<string>> = new Map();
    const inDegree: Map<string, number> = new Map();

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

    // Kahn's algorithm
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

    // Check for cycles
    if (sorted.length !== nodes.size) {
      const cycleNodes: string[] = [];
      for (const [id] of nodes) {
        if (!visited.has(id)) cycleNodes.push(id);
      }
      this.warnings.push(`Possible cycle in graph involving: ${cycleNodes.join(', ')}`);
    }

    return sorted;
  }

  // ==========================================================================
  // Collect Required GLSL Snippets
  // ==========================================================================

  private collectRequiredSnippets(graph: ShaderGraph): void {
    // Always need common utilities
    this.requiredSnippets.add('COMMON_UTILITIES_GLSL');

    for (const [, node] of graph.nodes) {
      const requirements = NODE_TYPE_GLSL_REQUIREMENTS[node.type];
      if (requirements) {
        for (const snippet of requirements) {
          this.requiredSnippets.add(snippet);
        }
      }

      // PrincipledBSDF always needs PBR + multi-light
      if (node.type === 'ShaderNodeBsdfPrincipled' || node.type === 'PrincipledBSDFNode') {
        this.requiredSnippets.add('PRINCIPLED_BSDF_GLSL');
        this.requiredSnippets.add('MULTI_LIGHT_GLSL');
      }
    }
  }

  // ==========================================================================
  // Generate Node Code
  // ==========================================================================

  private generateNodeCode(nodeId: string, node: ComposableNode, graph: ShaderGraph): string {
    const varPrefix = `n${this.variableCounter++}`;
    const lines: string[] = [];

    // Generate code based on node type
    const nodeType = node.type;

    // Texture nodes
    if (nodeType === 'ShaderNodeTexNoise' || nodeType === 'TextureNoiseNode') {
      return this.generateNoiseTextureCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeTexVoronoi' || nodeType === 'TextureVoronoiNode') {
      return this.generateVoronoiTextureCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeTexMusgrave' || nodeType === 'TextureMusgraveNode') {
      return this.generateMusgraveTextureCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeTexGradient' || nodeType === 'TextureGradientNode') {
      return this.generateGradientTextureCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeTexBrick' || nodeType === 'TextureBrickNode') {
      return this.generateBrickTextureCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeTexChecker' || nodeType === 'TextureCheckerNode') {
      return this.generateCheckerTextureCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeTexMagic' || nodeType === 'TextureMagicNode') {
      return this.generateMagicTextureCode(nodeId, varPrefix, node, graph);
    }

    // Color nodes
    if (nodeType === 'ShaderNodeValToRGB' || nodeType === 'ColorRampNode') {
      return this.generateColorRampCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeFloatCurve') {
      return this.generateFloatCurveCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeMixRGB' || nodeType === 'MixRGBNode') {
      return this.generateMixRGBCode(nodeId, varPrefix, node, graph);
    }

    // Math nodes
    if (nodeType === 'ShaderNodeMath') {
      return this.generateMathCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeVectorMath') {
      return this.generateVectorMathCode(nodeId, varPrefix, node, graph);
    }

    // Vector nodes
    if (nodeType === 'ShaderNodeMapping' || nodeType === 'MappingNode') {
      return this.generateMappingCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeTexCoord' || nodeType === 'TextureCoordNode') {
      return this.generateTexCoordCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeCombineXYZ') {
      return this.generateCombineXYZCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeSeparateXYZ') {
      return this.generateSeparateXYZCode(nodeId, varPrefix, node, graph);
    }

    // Shader nodes
    if (nodeType === 'ShaderNodeBsdfPrincipled' || nodeType === 'PrincipledBSDFNode') {
      return this.generatePrincipledBSDFCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeMixShader') {
      return this.generateMixShaderCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeAddShader') {
      return this.generateAddShaderCode(nodeId, varPrefix, node, graph);
    }
    if (nodeType === 'ShaderNodeEmission') {
      return this.generateEmissionCode(nodeId, varPrefix, node, graph);
    }

    // Output nodes
    if (nodeType === 'ShaderNodeOutputMaterial' || nodeType === 'MaterialOutputNode') {
      return this.generateMaterialOutputCode(nodeId, varPrefix, node, graph);
    }

    // Input nodes
    if (nodeType === 'ShaderNodeValue' || nodeType === 'ValueNode') {
      const uName = this.addUniform(`${varPrefix}_value`, 'float', 'float', node.settings.value ?? 0.0);
      return `float ${varPrefix}_value = ${uName};\n`;
    }
    if (nodeType === 'ShaderNodeRGB' || nodeType === 'RGBNode') {
      const col = node.settings.color ?? [0.8, 0.8, 0.8];
      const uName = this.addUniform(`${varPrefix}_color`, 'vec3', 'color', col);
      return `vec3 ${varPrefix}_color = ${uName};\n`;
    }

    // Unknown node - generate passthrough
    this.warnings.push(`Unknown node type "${nodeType}", generating passthrough`);
    return `// Passthrough for unknown node type: ${nodeType}\n`;
  }

  // ==========================================================================
  // Node Code Generators
  // ==========================================================================

  private resolveInput(nodeId: string, inputName: string, graph: ShaderGraph): { varName: string; glslType: string } {
    // Find a link targeting this input
    for (const link of graph.links) {
      if (link.toNode === nodeId && link.toSocket === inputName) {
        const sourceNode = graph.nodes.get(link.fromNode);
        if (sourceNode) {
          // Find the variable name for the source node's output
          const sourcePrefix = this.getNodePrefix(link.fromNode);
          const outputType = this.getSocketGLSLType(sourceNode, link.fromSocket, 'output');
          return { varName: `${sourcePrefix}_${link.fromSocket}`, glslType: outputType };
        }
      }
    }

    // No connection - use default value
    const node = graph.nodes.get(nodeId);
    const input = node?.inputs.get(inputName);
    const defaultVal = input?.value ?? this.getDefaultForInput(inputName, node?.type);
    const glslType = this.getSocketGLSLType(node, inputName, 'input');

    // For vectors/coordinates, use varyings
    if (inputName === 'vector' || inputName === 'Vector') {
      return { varName: 'vPosition', glslType: 'vec3' };
    }

    // For constant values, create a uniform
    const uName = this.addUniform(`${this.getNodePrefix(nodeId)}_${inputName}`, glslType, this.glslToThreeType(glslType), defaultVal);
    return { varName: uName, glslType };
  }

  private getNodePrefix(nodeId: string): string {
    // Generate a consistent prefix from node ID
    // Use a hash to keep names short but unique
    let hash = 0;
    for (let i = 0; i < nodeId.length; i++) {
      hash = ((hash << 5) - hash) + nodeId.charCodeAt(i);
      hash = hash & hash;
    }
    return `n${Math.abs(hash) % 10000}`;
  }

  private getSocketGLSLType(node: ComposableNode | undefined, socketName: string, direction: 'input' | 'output'): string {
    if (!node) return 'float';
    const sockets = direction === 'input' ? node.inputs : node.outputs;
    const socket = sockets.get(socketName);
    if (!socket) return 'float';
    return socketTypeToGLSL(socket.type);
  }

  private getDefaultForInput(inputName: string, nodeType?: string): any {
    const defaults: Record<string, any> = {
      'scale': 5.0,
      'Scale': 5.0,
      'detail': 2.0,
      'Detail': 2.0,
      'roughness': 0.5,
      'Roughness': 0.5,
      'distortion': 0.0,
      'Distortion': 0.0,
      'factor': 0.5,
      'Factor': 0.5,
      'Fac': 0.5,
      'metallic': 0.0,
      'Metallic': 0.0,
      'specular': 0.5,
      'Specular': 0.5,
      'ior': 1.45,
      'IOR': 1.45,
      'transmission': 0.0,
      'Transmission': 0.0,
      'alpha': 1.0,
      'Alpha': 1.0,
      'clearcoat': 0.0,
      'Clearcoat': 0.0,
      'clearcoat_roughness': 0.03,
      'smoothness': 0.0,
      'exponent': 1.0,
      'offset': 0.0,
      'gain': 1.0,
      'dimension': 2.0,
      'lacunarity': 2.0,
      'strength': 1.0,
      'base_color': [0.8, 0.8, 0.8],
      'color1': [1.0, 1.0, 1.0],
      'color2': [0.0, 0.0, 0.0],
      'emission_color': [0.0, 0.0, 0.0],
      'emission_strength': 0.0,
    };
    return defaults[inputName] ?? 0.0;
  }

  private glslToThreeType(glslType: string): 'float' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D' | 'int' | 'color' {
    switch (glslType) {
      case 'float': return 'float';
      case 'vec2': return 'vec2';
      case 'vec3': return 'color'; // vec3 uniforms are typically colors
      case 'vec4': return 'vec4';
      case 'int': return 'int';
      default: return 'float';
    }
  }

  // -- Noise Texture --
  private generateNoiseTextureCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const scale = this.resolveInput(nodeId, 'scale', graph);
    const detail = this.resolveInput(nodeId, 'detail', graph);
    const roughness = this.resolveInput(nodeId, 'roughness', graph);
    const distortion = this.resolveInput(nodeId, 'distortion', graph);
    const vector = this.resolveInput(nodeId, 'vector', graph);

    return `
  // Noise Texture: ${node.name}
  float ${prefix}_float = noiseTexture(${vector.varName}, ${scale.varName}, ${detail.varName}, ${distortion.varName}, ${roughness.varName});
  vec3 ${prefix}_color = noiseTextureColor(${vector.varName}, ${scale.varName}, ${detail.varName}, ${distortion.varName}, ${roughness.varName});
  `;
  }

  // -- Voronoi Texture --
  private generateVoronoiTextureCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const scale = this.resolveInput(nodeId, 'scale', graph);
    const vector = this.resolveInput(nodeId, 'vector', graph);
    const smoothness = this.resolveInput(nodeId, 'smoothness', graph);
    const exponent = this.resolveInput(nodeId, 'exponent', graph);
    const distMetric = node.settings.distanceMetric ?? 'euclidean';
    const feature = node.settings.featureMode ?? 'f1';

    const distInt = distMetric === 'manhattan' ? 1 : distMetric === 'chebychev' ? 2 : 0;
    const featInt = feature === 'f2-f1' ? 1 : feature === 'n_sphere_radius' ? 2 : feature === 'distance' ? 2 : 0;

    return `
  // Voronoi Texture: ${node.name}
  float ${prefix}_float = voronoiTexture(${vector.varName}, ${scale.varName}, ${smoothness.varName}, ${exponent.varName}, ${distInt}, ${featInt});
  vec3 ${prefix}_color = voronoiTextureColor(${vector.varName}, ${scale.varName}, ${smoothness.varName}, ${exponent.varName}, ${distInt}, ${featInt});
  `;
  }

  // -- Musgrave Texture --
  private generateMusgraveTextureCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const scale = this.resolveInput(nodeId, 'scale', graph);
    const detail = this.resolveInput(nodeId, 'detail', graph);
    const dimension = this.resolveInput(nodeId, 'dimension', graph);
    const lacunarity = this.resolveInput(nodeId, 'lacunarity', graph);
    const offset = this.resolveInput(nodeId, 'offset', graph);
    const gain = this.resolveInput(nodeId, 'gain', graph);
    const vector = this.resolveInput(nodeId, 'vector', graph);

    const musgraveType = node.settings.musgraveType ?? 'fbm';
    const typeInt = musgraveType === 'multifractal' ? 1 :
                    musgraveType === 'ridged_multifractal' ? 2 :
                    musgraveType === 'hybrid_multifractal' ? 3 :
                    musgraveType === 'hetero_terrain' ? 4 : 0;

    return `
  // Musgrave Texture: ${node.name}
  float ${prefix}_float = musgraveTexture(${vector.varName}, ${scale.varName}, ${detail.varName}, ${dimension.varName}, ${lacunarity.varName}, ${offset.varName}, ${gain.varName}, ${typeInt});
  `;
  }

  // -- Gradient Texture --
  private generateGradientTextureCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const vector = this.resolveInput(nodeId, 'vector', graph);
    const gradientType = node.settings.gradientType ?? 'linear';
    const typeInt = gradientType === 'quadratic' ? 1 :
                    gradientType === 'eased' ? 2 :
                    gradientType === 'diagonal' ? 3 :
                    gradientType === 'spherical' ? 4 :
                    gradientType === 'quadratic_sphere' ? 5 : 0;

    return `
  // Gradient Texture: ${node.name}
  float ${prefix}_float = gradientTexture(${vector.varName}, ${typeInt});
  vec3 ${prefix}_color = gradientTextureColor(${vector.varName}, ${typeInt});
  `;
  }

  // -- Brick Texture --
  private generateBrickTextureCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const vector = this.resolveInput(nodeId, 'vector', graph);
    const scale = this.resolveInput(nodeId, 'scale', graph);
    const mortarSize = this.resolveInput(nodeId, 'mortar_size', graph);
    const mortarSmooth = this.resolveInput(nodeId, 'mortar_smooth', graph);
    const bias = this.resolveInput(nodeId, 'bias', graph);
    const brickWidth = this.resolveInput(nodeId, 'brick_width', graph);
    const rowHeight = this.resolveInput(nodeId, 'row_height', graph);

    const offset = node.settings.offset ?? 0.5;
    const squash = node.settings.squash ?? 1.0;
    const brickColor = node.settings.color1 ?? [0.8, 0.3, 0.2];
    const mortarColor = node.settings.color2 ?? [0.5, 0.5, 0.5];

    return `
  // Brick Texture: ${node.name}
  float ${prefix}_float = brickTexture(${vector.varName}, ${scale.varName}, ${mortarSize.varName}, ${mortarSmooth.varName}, ${bias.varName}, ${brickWidth.varName}, ${rowHeight.varName}, ${offset.toFixed(6)}, ${squash.toFixed(6)}, 0);
  vec3 ${prefix}_color = vec3(${prefix}_float);
  `;
  }

  // -- Checker Texture --
  private generateCheckerTextureCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const vector = this.resolveInput(nodeId, 'vector', graph);
    const scale = this.resolveInput(nodeId, 'scale', graph);

    return `
  // Checker Texture: ${node.name}
  float ${prefix}_float = checkerTexture(${vector.varName}, ${scale.varName});
  vec3 ${prefix}_color = vec3(${prefix}_float);
  `;
  }

  // -- Magic Texture --
  private generateMagicTextureCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const vector = this.resolveInput(nodeId, 'vector', graph);
    const scale = this.resolveInput(nodeId, 'scale', graph);
    const depth = node.settings.depth ?? 2;

    return `
  // Magic Texture: ${node.name}
  vec3 ${prefix}_color = magicTexture(${vector.varName}, ${scale.varName}, ${depth});
  float ${prefix}_float = dot(${prefix}_color, vec3(0.333));
  `;
  }

  // -- ColorRamp --
  private generateColorRampCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const fac = this.resolveInput(nodeId, 'fac', graph);
    const stops = node.settings.stops ?? [
      { position: 0.0, color: [0.0, 0.0, 0.0, 1.0] },
      { position: 1.0, color: [1.0, 1.0, 1.0, 1.0] },
    ];
    const interp = node.settings.interpolation ?? 'linear';
    const modeInt = interp === 'constant' ? 0 : interp === 'ease' ? 2 : 1;

    // Generate uniform arrays
    const posArray = stops.map((s: any, i: number) => `u_${prefix}_crPos[${i}]`).join(', ');
    const colArray = stops.map((s: any, i: number) => `u_${prefix}_crCol[${i}]`).join(', ');

    // Register uniforms for positions and colors
    const stopCount = Math.min(stops.length, 16);
    for (let i = 0; i < stopCount; i++) {
      this.addUniform(`${prefix}_crPos_${i}`, 'float', 'float', stops[i].position);
      const c = stops[i].color;
      this.addUniform(`${prefix}_crCol_${i}`, 'vec4', 'vec4',
        c.length === 4 ? c : [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1]);
    }

    return `
  // ColorRamp: ${node.name}
  float ${prefix}_crPositions[16] = float[16](${Array.from({length: 16}, (_, i) => i < stopCount ? `u_${prefix}_crPos_${i}` : '0.0').join(', ')});
  vec4 ${prefix}_crColors[16] = vec4[16](${Array.from({length: 16}, (_, i) => i < stopCount ? `u_${prefix}_crCol_${i}` : 'vec4(0.0)').join(', ')});
  vec4 ${prefix}_color4 = colorRamp(${fac.varName}, ${prefix}_crPositions, ${prefix}_crColors, ${stopCount}, ${modeInt});
  vec3 ${prefix}_color = ${prefix}_color4.rgb;
  float ${prefix}_alpha = ${prefix}_color4.a;
  `;
  }

  // -- FloatCurve --
  private generateFloatCurveCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const fac = this.resolveInput(nodeId, 'fac', graph);
    const points = node.settings.points ?? [
      { position: 0.0, value: 0.0 },
      { position: 1.0, value: 1.0 },
    ];

    const pointCount = Math.min(points.length, 16);
    for (let i = 0; i < pointCount; i++) {
      this.addUniform(`${prefix}_fcPos_${i}`, 'float', 'float', points[i].position);
      this.addUniform(`${prefix}_fcVal_${i}`, 'float', 'float', points[i].value);
    }

    return `
  // FloatCurve: ${node.name}
  float ${prefix}_fcPositions[16] = float[16](${Array.from({length: 16}, (_, i) => i < pointCount ? `u_${prefix}_fcPos_${i}` : '0.0').join(', ')});
  float ${prefix}_fcValues[16] = float[16](${Array.from({length: 16}, (_, i) => i < pointCount ? `u_${prefix}_fcVal_${i}` : '0.0').join(', ')});
  float ${prefix}_float = floatCurve(${fac.varName}, ${prefix}_fcPositions, ${prefix}_fcValues, ${pointCount});
  `;
  }

  // -- MixRGB --
  private generateMixRGBCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const factor = this.resolveInput(nodeId, 'factor', graph);
    const color1 = this.resolveInput(nodeId, 'color1', graph);
    const color2 = this.resolveInput(nodeId, 'color2', graph);
    const blendType = node.settings.blendType ?? 'MIX';
    const blendInt = this.blendTypeToInt(blendType);

    return `
  // MixRGB: ${node.name}
  vec3 ${prefix}_color = mixRGB(${factor.varName}, ${color1.varName}, ${color2.varName}, ${blendInt});
  `;
  }

  private blendTypeToInt(blendType: string): number {
    const map: Record<string, number> = {
      'MIX': 0, 'ADD': 1, 'MULTIPLY': 2, 'SUBTRACT': 3, 'SCREEN': 4,
      'DIVIDE': 5, 'DIFFERENCE': 6, 'DARKEN': 7, 'LIGHTEN': 8,
      'OVERLAY': 9, 'COLOR_DODGE': 10, 'COLOR_BURN': 11,
      'HARD_LIGHT': 12, 'SOFT_LIGHT': 13, 'LINEAR_LIGHT': 14,
    };
    return map[blendType] ?? 0;
  }

  // -- Math --
  private generateMathCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const a = this.resolveInput(nodeId, 'value', graph);
    const b = this.resolveInput(nodeId, 'value_1', graph);
    const operation = node.settings.operation ?? 'add';
    const opInt = this.mathOpToInt(operation);

    return `
  // Math: ${node.name}
  float ${prefix}_value = mathOp(${a.varName}, ${b.varName}, ${opInt});
  `;
  }

  private mathOpToInt(op: string): number {
    const map: Record<string, number> = {
      'add': 0, 'subtract': 1, 'multiply': 2, 'divide': 3,
      'power': 4, 'logarithm': 5, 'sqrt': 6, 'inverse': 7,
      'absolute': 8, 'compare': 9, 'minimum': 10, 'maximum': 11,
      'sine': 12, 'cosine': 13, 'tangent': 14, 'arcsine': 15,
      'arccosine': 16, 'arctangent2': 17, 'sign': 18, 'exponent': 19,
      'modulo': 20, 'floor': 21, 'ceil': 22, 'fraction': 23,
    };
    return map[op] ?? 0;
  }

  // -- Vector Math --
  private generateVectorMathCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const a = this.resolveInput(nodeId, 'vector', graph);
    const b = this.resolveInput(nodeId, 'vector_1', graph);
    const scale = this.resolveInput(nodeId, 'scale', graph);
    const operation = node.settings.operation ?? 'add';
    const opInt = this.vectorMathOpToInt(operation);

    return `
  // Vector Math: ${node.name}
  VectorMathResult ${prefix}_vm = vectorMathOp(${a.varName}, ${b.varName}, ${scale.varName}, ${opInt});
  vec3 ${prefix}_vector = ${prefix}_vm.vector;
  float ${prefix}_value = ${prefix}_vm.value;
  `;
  }

  private vectorMathOpToInt(op: string): number {
    const map: Record<string, number> = {
      'add': 0, 'subtract': 1, 'multiply': 2, 'divide': 3,
      'cross': 4, 'dot': 5, 'normalize': 6, 'length': 7,
      'distance': 8, 'scale': 9, 'reflect': 10, 'refract': 11,
    };
    return map[op] ?? 0;
  }

  // -- Mapping --
  private generateMappingCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const vector = this.resolveInput(nodeId, 'vector', graph);
    const translation = node.settings.translation ?? [0, 0, 0];
    const rotation = node.settings.rotation ?? [0, 0, 0];
    const scale = node.settings.scale ?? [1, 1, 1];

    const uTranslation = this.addUniform(`${prefix}_translation`, 'vec3', 'vec3', translation);
    const uRotation = this.addUniform(`${prefix}_rotation`, 'vec3', 'vec3', rotation);
    const uScale = this.addUniform(`${prefix}_scale`, 'vec3', 'vec3', scale);

    return `
  // Mapping: ${node.name}
  vec3 ${prefix}_vector = mappingNode(${vector.varName}, ${uTranslation}, ${uRotation}, ${uScale}, 0);
  `;
  }

  // -- Texture Coordinate --
  private generateTexCoordCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    return `
  // Texture Coordinate: ${node.name}
  vec3 ${prefix}_generated = vPosition;
  vec3 ${prefix}_normal = vNormal;
  vec2 ${prefix}_uv = vUV;
  vec3 ${prefix}_object = vPosition;
  vec3 ${prefix}_camera = cameraPosition - vWorldPosition;
  vec3 ${prefix}_window = vPosition;
  vec3 ${prefix}_reflection = reflect(normalize(cameraPosition - vWorldPosition), vNormal);
  `;
  }

  // -- Combine XYZ --
  private generateCombineXYZCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const x = this.resolveInput(nodeId, 'x', graph);
    const y = this.resolveInput(nodeId, 'y', graph);
    const z = this.resolveInput(nodeId, 'z', graph);

    return `
  // Combine XYZ: ${node.name}
  vec3 ${prefix}_vector = vec3(${x.varName}, ${y.varName}, ${z.varName});
  `;
  }

  // -- Separate XYZ --
  private generateSeparateXYZCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const vector = this.resolveInput(nodeId, 'vector', graph);

    return `
  // Separate XYZ: ${node.name}
  float ${prefix}_x = ${vector.varName}.x;
  float ${prefix}_y = ${vector.varName}.y;
  float ${prefix}_z = ${vector.varName}.z;
  `;
  }

  // -- PrincipledBSDF --
  private generatePrincipledBSDFCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const baseColor = this.resolveInput(nodeId, 'base_color', graph);
    const metallic = this.resolveInput(nodeId, 'metallic', graph);
    const roughness = this.resolveInput(nodeId, 'roughness', graph);
    const specular = this.resolveInput(nodeId, 'specular', graph);
    const ior = this.resolveInput(nodeId, 'ior', graph);
    const transmission = this.resolveInput(nodeId, 'transmission', graph);
    const emissionColor = this.resolveInput(nodeId, 'emission_color', graph);
    const emissionStrength = this.resolveInput(nodeId, 'emission_strength', graph);
    const alpha = this.resolveInput(nodeId, 'alpha', graph);
    const clearcoat = this.resolveInput(nodeId, 'clearcoat', graph);
    const clearcoatRoughness = this.resolveInput(nodeId, 'clearcoat_roughness', graph);
    const subsurfaceWeight = this.resolveInput(nodeId, 'subsurface_weight', graph);
    const sheen = this.resolveInput(nodeId, 'sheen', graph);
    const anisotropic = this.resolveInput(nodeId, 'anisotropic', graph);

    return `
  // Principled BSDF: ${node.name}
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  BSDFResult ${prefix}_bsdf = principledBSDF(
    ${baseColor.varName}, ${metallic.varName}, ${roughness.varName}, ${specular.varName},
    ${ior.varName}, ${transmission.varName}, ${emissionColor.varName}, ${emissionStrength.varName},
    ${alpha.varName}, ${clearcoat.varName}, ${clearcoatRoughness.varName},
    ${subsurfaceWeight.varName}, ${sheen.varName}, ${anisotropic.varName},
    N, V, vWorldPosition
  );
  vec3 ${prefix}_bsdf_color = ${prefix}_bsdf.color;
  float ${prefix}_bsdf_alpha = ${prefix}_bsdf.alpha;
  `;
  }

  // -- Mix Shader --
  private generateMixShaderCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const factor = this.resolveInput(nodeId, 'factor', graph);
    const shader1 = this.resolveInput(nodeId, 'shader', graph);
    const shader2 = this.resolveInput(nodeId, 'shader_1', graph);

    return `
  // Mix Shader: ${node.name}
  vec3 ${prefix}_shader = mixShader(${shader1.varName}, ${shader2.varName}, ${factor.varName});
  `;
  }

  // -- Add Shader --
  private generateAddShaderCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const shader1 = this.resolveInput(nodeId, 'shader', graph);
    const shader2 = this.resolveInput(nodeId, 'shader_1', graph);

    return `
  // Add Shader: ${node.name}
  vec3 ${prefix}_shader = addShader(${shader1.varName}, ${shader2.varName});
  `;
  }

  // -- Emission --
  private generateEmissionCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const color = this.resolveInput(nodeId, 'color', graph);
    const strength = this.resolveInput(nodeId, 'strength', graph);

    return `
  // Emission: ${node.name}
  vec3 ${prefix}_emission = ${color.varName} * ${strength.varName};
  `;
  }

  // -- Material Output --
  private generateMaterialOutputCode(nodeId: string, prefix: string, node: ComposableNode, graph: ShaderGraph): string {
    const surface = this.resolveInput(nodeId, 'surface', graph);

    return `
  // Material Output: ${node.name}
  vec3 ${prefix}_surface = ${surface.varName};
  `;
  }

  // ==========================================================================
  // Compose Fragment Shader
  // ==========================================================================

  private composeFragmentShader(
    nodeCode: Map<string, string>,
    outputNodeId: string | null,
    graph: ShaderGraph,
    enableIBL: boolean,
    enableShadows: boolean
  ): string {
    // Collect required GLSL function snippets
    const functionCode: string[] = [COMMON_UTILITIES_GLSL];
    for (const snippetName of this.requiredSnippets) {
      const snippet = GLSL_SNIPPET_MAP[snippetName];
      if (snippet && !functionCode.includes(snippet)) {
        functionCode.push(snippet);
      }
    }

    // Collect all uniform declarations
    const uniformDecls: string[] = [];
    for (const [, info] of this.uniforms) {
      uniformDecls.push(`uniform ${info.glslType} ${info.name};`);
    }

    // Add IBL uniforms if needed
    if (enableIBL) {
      uniformDecls.push('uniform sampler2D u_irradianceMap;');
      uniformDecls.push('uniform sampler2D u_prefilteredMap;');
      uniformDecls.push('uniform sampler2D u_brdfLUT;');
    }

    // Add shadow uniforms if needed
    if (enableShadows) {
      uniformDecls.push('uniform sampler2D u_shadowMap;');
      uniformDecls.push('uniform mat4 u_lightViewProjection;');
      uniformDecls.push('uniform float u_shadowBias;');
    }

    // Collect all node code
    const bodyCode: string[] = [];
    for (const [, code] of nodeCode) {
      bodyCode.push(code);
    }

    // Determine the final output variable
    let finalOutput = 'vec3(0.8)'; // default gray
    let finalAlpha = '1.0';

    if (outputNodeId) {
      const outputPrefix = this.getNodePrefix(outputNodeId);
      finalOutput = `${outputPrefix}_surface`;

      // Check if there's a BSDF with alpha
      for (const [id, node] of graph.nodes) {
        if (node.type === 'ShaderNodeBsdfPrincipled' || node.type === 'PrincipledBSDFNode') {
          const bsdfPrefix = this.getNodePrefix(id);
          finalAlpha = `${bsdfPrefix}_bsdf_alpha`;
        }
      }
    }

    // Build complete fragment shader
    const frag = `${GLSL_VERSION_HEADER}

// Varyings from vertex shader
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;

// Output
out vec4 fragColor;

// Camera uniforms (auto-set by Three.js)
uniform vec3 cameraPosition;

// Material uniforms
${uniformDecls.join('\n')}

// ============================================================================
// GLSL Node Functions
// ============================================================================
${functionCode.join('\n')}

// ============================================================================
// Main
// ============================================================================
void main() {
${bodyCode.join('\n')}

  // Final output
  vec3 finalColor = ${finalOutput};
  float finalAlphaValue = ${finalAlpha};
  fragColor = vec4(finalColor, finalAlphaValue);
}
`;

    return frag;
  }

  // ==========================================================================
  // Fallback Fragment Shader
  // ==========================================================================

  private generateFallbackFragmentShader(): string {
    return `${GLSL_VERSION_HEADER}
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;
out vec4 fragColor;
uniform vec3 cameraPosition;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(vec3(0.5, 1.0, 0.8));
  float NdotL = max(dot(N, L), 0.0);
  vec3 color = vec3(0.8) * (0.15 + NdotL * 0.85);
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));
  fragColor = vec4(color, 1.0);
}
`;
  }

  // ==========================================================================
  // Uniform Management
  // ==========================================================================

  private addUniform(name: string, glslType: string, threeType: string, value: any): string {
    const uniformName = `u_${name}`;
    if (!this.uniforms.has(uniformName)) {
      this.uniforms.set(uniformName, {
        name: uniformName,
        glslType,
        threeType: threeType as any,
        value,
      });
    }
    return uniformName;
  }

  private buildThreeUniforms(): Record<string, THREE.IUniform> {
    const result: Record<string, THREE.IUniform> = {};

    for (const [, info] of this.uniforms) {
      let uniformValue: any;
      switch (info.threeType) {
        case 'float':
          uniformValue = { value: typeof info.value === 'number' ? info.value : 0.0 };
          break;
        case 'vec2':
          uniformValue = { value: info.value instanceof THREE.Vector2 ? info.value : new THREE.Vector2(
            Array.isArray(info.value) ? info.value[0] : 0,
            Array.isArray(info.value) ? info.value[1] : 0
          ) };
          break;
        case 'vec3':
          uniformValue = { value: info.value instanceof THREE.Vector3 ? info.value : new THREE.Vector3(
            Array.isArray(info.value) ? info.value[0] : 0,
            Array.isArray(info.value) ? info.value[1] : 0,
            Array.isArray(info.value) ? info.value[2] : 0
          ) };
          break;
        case 'vec4':
          uniformValue = { value: info.value instanceof THREE.Vector4 ? info.value : new THREE.Vector4(
            Array.isArray(info.value) ? info.value[0] : 0,
            Array.isArray(info.value) ? info.value[1] : 0,
            Array.isArray(info.value) ? info.value[2] : 0,
            Array.isArray(info.value) ? info.value[3] : 1
          ) };
          break;
        case 'color':
          if (info.value instanceof THREE.Color) {
            uniformValue = { value: new THREE.Vector3(info.value.r, info.value.g, info.value.b) };
          } else if (Array.isArray(info.value)) {
            uniformValue = { value: new THREE.Vector3(info.value[0], info.value[1], info.value[2]) };
          } else {
            uniformValue = { value: new THREE.Vector3(0.8, 0.8, 0.8) };
          }
          break;
        case 'int':
          uniformValue = { value: typeof info.value === 'number' ? Math.round(info.value) : 0 };
          break;
        case 'sampler2D':
          uniformValue = { value: info.value instanceof THREE.Texture ? info.value : null };
          break;
        default:
          uniformValue = { value: info.value };
      }
      result[info.name] = uniformValue as THREE.IUniform;
    }

    return result;
  }
}

export default GLSLShaderComposer;
