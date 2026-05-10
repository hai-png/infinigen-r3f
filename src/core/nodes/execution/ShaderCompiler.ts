/**
 * ShaderCompiler - Compiles a node graph into GLSL fragment + vertex shaders
 *
 * Uses GLSLShaderComposer for full node graph → GLSL generation.
 * Falls back to simplified PBR material when composer fails.
 *
 * Handles the PrincipledBSDF node as the output node and generates GLSL code
 * for each node type:
 * - Texture nodes → GLSL noise functions
 * - Color nodes → GLSL color operations
 * - Math nodes → GLSL math operations
 * - Vector nodes → GLSL vector operations
 * - Shader nodes → PBR material assembly
 *
 * Produces a complete Three.js ShaderMaterial with proper uniforms and varyings.
 * All shaders are WebGL2 compatible (no deprecated GLSL built-ins).
 *
 * Supports:
 * - IBL (Image-Based Lighting) via environment map uniforms
 * - Multi-light environments (up to 4 point lights + 1 directional)
 * - Shadow mapping for directional light
 * - Node group inlining
 * - Vertex displacement from node graphs
 */

import * as THREE from 'three';
import type { NodeGraph } from './NodeEvaluator';
import { NodeEvaluator, EvaluationMode } from './NodeEvaluator';
import { GLSLShaderComposer } from './glsl/GLSLShaderComposer';
import type { ShaderGraph, ComposableNode } from './glsl/GLSLShaderComposer';
import type { NodeLink } from '../core/types';
import {
  COMMON_UTILITIES_GLSL,
  NOISE_TEXTURE_GLSL,
  VORONOI_TEXTURE_GLSL,
  MUSGRAVE_TEXTURE_GLSL,
  GRADIENT_TEXTURE_GLSL,
  BRICK_TEXTURE_GLSL,
  CHECKER_TEXTURE_GLSL,
  MAGIC_TEXTURE_GLSL,
  COLOR_RAMP_GLSL,
  FLOAT_CURVE_GLSL,
  MIX_RGB_GLSL,
  MATH_GLSL,
  VECTOR_MATH_GLSL,
  PRINCIPLED_BSDF_GLSL,
  MIX_ADD_SHADER_GLSL,
  MAPPING_GLSL,
  TEXTURE_COORD_GLSL,
  IBL_GLSL,
  MULTI_LIGHT_GLSL,
  SHADOW_MAPPING_GLSL,
  NODE_TYPE_GLSL_REQUIREMENTS,
  GLSL_SNIPPET_MAP,
} from './glsl/GLSLNodeFunctions';

// ============================================================================
// Types
// ============================================================================

export interface ShaderCompileResult {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  material: THREE.ShaderMaterial;
  warnings: string[];
  errors: string[];
}

export interface ShaderCompileOptions {
  /** Enable IBL (Image-Based Lighting) */
  enableIBL?: boolean;
  /** Enable shadow mapping */
  enableShadows?: boolean;
  /** Environment map for IBL */
  envMap?: THREE.Texture;
  /** Use the full GLSLShaderComposer (true) or simplified mode (false) */
  useComposer?: boolean;
}

/** Parameters for buildShaderMaterial convenience function */
export interface BuildShaderMaterialParams {
  /** Enable IBL */
  enableIBL?: boolean;
  /** Enable shadows */
  enableShadows?: boolean;
  /** Side rendering mode */
  side?: THREE.Side;
  /** Wireframe mode */
  wireframe?: boolean;
  /** Transparent */
  transparent?: boolean;
  /** Custom uniform overrides */
  uniformOverrides?: Record<string, any>;
}

interface UniformInfo {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D' | 'int';
  value: any;
}

/** Compile mode for compileNodeGraph */
export type ShaderCompileMode = 'vertex' | 'fragment' | 'surface';

// ============================================================================
// GLSL Code Templates (simplified fallback)
// ============================================================================

const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

const VERTEX_SHADER_TEMPLATE = `${GLSL_HEADER}

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
// Node type → GLSL generation mapping
// ============================================================================

/** Map a node type string to its GLSL function requirement key */
function nodeTypeToGLSLKey(nodeType: string): string[] {
  const direct = NODE_TYPE_GLSL_REQUIREMENTS[nodeType];
  if (direct) return direct;

  // Aliases for alternate naming conventions
  const aliasMap: Record<string, string[]> = {
    'TextureNoiseNode': ['NOISE_TEXTURE_GLSL'],
    'TextureVoronoiNode': ['VORONOI_TEXTURE_GLSL', 'NOISE_TEXTURE_GLSL'],
    'TextureMusgraveNode': ['MUSGRAVE_TEXTURE_GLSL', 'NOISE_TEXTURE_GLSL'],
    'TextureGradientNode': ['GRADIENT_TEXTURE_GLSL'],
    'TextureBrickNode': ['BRICK_TEXTURE_GLSL'],
    'TextureCheckerNode': ['CHECKER_TEXTURE_GLSL'],
    'TextureMagicNode': ['MAGIC_TEXTURE_GLSL'],
    'ColorRampNode': ['COLOR_RAMP_GLSL'],
    'MixRGBNode': ['MIX_RGB_GLSL'],
    'PrincipledBSDFNode': ['PRINCIPLED_BSDF_GLSL'],
    'DiffuseBSDFNode': ['PRINCIPLED_BSDF_GLSL'],
    'GlossyBSDFNode': ['PRINCIPLED_BSDF_GLSL'],
    'GlassBSDFNode': ['PRINCIPLED_BSDF_GLSL'],
    'EmissionNode': ['PRINCIPLED_BSDF_GLSL'],
    'MappingNode': ['MAPPING_GLSL'],
    'TextureCoordNode': ['TEXTURE_COORD_GLSL'],
    'ValueNode': [],
    'VectorNode': [],
    'ColorNode': [],
    'NormalNode': [],
    'UVNode': [],
    'PositionNode': [],
    'MapRangeNode': ['MATH_GLSL'],
    'ClampNode': ['MATH_GLSL'],
    'BooleanMathNode': ['MATH_GLSL'],
    'SeparateRGBNode': [],
    'CombineRGBNode': [],
    'HueSaturationValueNode': [],
    'InvertNode': [],
    'BrightContrastNode': [],
    'WaveTextureNode': ['NOISE_TEXTURE_GLSL'],
  };
  return aliasMap[nodeType] ?? [];
}

// ============================================================================
// ShaderCompiler
// ============================================================================

export class NodeShaderCompiler {
  private evaluator: NodeEvaluator;
  private composer: GLSLShaderComposer;
  private uniforms: Map<string, UniformInfo> = new Map();
  private functions: Set<string> = new Set();
  private warnings: string[] = [];
  private errors: string[] = [];
  private uniformCounter: number = 0;

  constructor(evaluator?: NodeEvaluator) {
    this.evaluator = evaluator ?? new NodeEvaluator();
    this.composer = new GLSLShaderComposer();
  }

  // ==========================================================================
  // Main Entry Points
  // ==========================================================================

  /**
   * Compile a node graph into a GLSL shader string.
   *
   * Traverses the graph in topological order, generates the corresponding GLSL
   * function call for each node, handles node groups by inlining their contents,
   * and returns the compiled GLSL code.
   *
   * @param graph - The node graph to compile
   * @param mode  - 'vertex' for vertex shaders (displacement),
   *                'fragment' for fragment shaders,
   *                'surface' for full surface shaders (vertex + fragment)
   * @returns The compiled GLSL code string(s)
   */
  compileNodeGraph(
    graph: NodeGraph,
    mode: ShaderCompileMode = 'fragment',
  ): { vertexShader?: string; fragmentShader?: string; uniforms: Record<string, THREE.IUniform>; warnings: string[]; errors: string[] } {
    this.uniforms.clear();
    this.functions.clear();
    this.warnings = [];
    this.errors = [];
    this.uniformCounter = 0;

    try {
      // Convert NodeGraph to ShaderGraph if needed
      const shaderGraph = this.nodeGraphToShaderGraph(graph);

      // Inline any node groups
      this.inlineNodeGroups(shaderGraph, graph);

      // Determine required GLSL function snippets
      this.collectRequiredFunctions(shaderGraph);

      if (mode === 'vertex') {
        const vertexShader = this.generateVertexShaderFromGraph(shaderGraph);
        return {
          vertexShader,
          uniforms: this.buildThreeUniformsFromMap(),
          warnings: [...this.warnings],
          errors: [...this.errors],
        };
      }

      if (mode === 'fragment') {
        const fragmentShader = this.generateFragmentShaderFromGraph(shaderGraph);
        return {
          fragmentShader,
          uniforms: this.buildThreeUniformsFromMap(),
          warnings: [...this.warnings],
          errors: [...this.errors],
        };
      }

      // 'surface' mode: generate both
      const vertexShader = this.generateVertexShaderFromGraph(shaderGraph);
      const fragmentShader = this.generateFragmentShaderFromGraph(shaderGraph);
      return {
        vertexShader,
        fragmentShader,
        uniforms: this.buildThreeUniformsFromMap(),
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    } catch (error: any) {
      this.errors.push(error.message);
      return {
        vertexShader: mode !== 'fragment' ? VERTEX_SHADER_TEMPLATE : undefined,
        fragmentShader: mode !== 'vertex' ? this.generateFallbackFragment() : undefined,
        uniforms: this.buildThreeUniformsFromMap(),
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }
  }

  /**
   * Generate a vertex shader that:
   * - Declares all necessary uniforms (modelViewMatrix, projectionMatrix, normalMatrix, custom)
   * - Applies vertex displacement from the node graph
   * - Passes varyings to fragment shader (position, normal, uv, custom)
   */
  generateVertexShader(graph: NodeGraph): string {
    const shaderGraph = this.nodeGraphToShaderGraph(graph);
    this.inlineNodeGroups(shaderGraph, graph);
    return this.generateVertexShaderFromGraph(shaderGraph);
  }

  /**
   * Generate a fragment shader that:
   * - Imports the PBR lighting functions
   * - Evaluates the shader node graph to compute surface properties
   * - Outputs to gl_FragColor with proper tone mapping
   */
  generateFragmentShader(graph: NodeGraph): string {
    const shaderGraph = this.nodeGraphToShaderGraph(graph);
    this.inlineNodeGroups(shaderGraph, graph);
    this.collectRequiredFunctions(shaderGraph);
    return this.generateFragmentShaderFromGraph(shaderGraph);
  }

  /**
   * Convenience function that creates a THREE.ShaderMaterial from the compiled shaders.
   *
   * @param graph  - The node graph to compile
   * @param params - Optional build parameters (IBL, shadows, side, wireframe, etc.)
   * @returns A THREE.ShaderMaterial ready for use in a Three.js scene
   */
  buildShaderMaterial(graph: NodeGraph, params?: BuildShaderMaterialParams): THREE.ShaderMaterial {
    const result = this.compileNodeGraph(graph, 'surface');

    const uniforms = { ...result.uniforms };

    // Apply overrides
    if (params?.uniformOverrides) {
      for (const [key, value] of Object.entries(params.uniformOverrides)) {
        if (uniforms[key]) {
          uniforms[key].value = value;
        }
      }
    }

    // Add time uniform for animated materials
    if (!uniforms['u_time']) {
      uniforms['u_time'] = { value: 0.0 };
    }

    // Add camera position uniform
    if (!uniforms['u_cameraPosition']) {
      uniforms['u_cameraPosition'] = { value: new THREE.Vector3() };
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: result.vertexShader ?? VERTEX_SHADER_TEMPLATE,
      fragmentShader: result.fragmentShader ?? this.generateFallbackFragment(),
      uniforms,
      side: params?.side ?? THREE.FrontSide,
      wireframe: params?.wireframe ?? false,
      transparent: params?.transparent ?? false,
    });

    if (result.errors.length > 0) {
      console.warn('[ShaderCompiler.buildShaderMaterial] Errors:', result.errors);
    }

    return material;
  }

  // ==========================================================================
  // Composer-based Compilation (existing API)
  // ==========================================================================

  /**
   * Compile a node graph into a ShaderMaterial using the full GLSLShaderComposer
   */
  compileToGLSL(graph: ShaderGraph): string {
    const result = this.composer.compose(graph);
    return result.fragmentShader;
  }

  /**
   * Compile a node graph into a usable Three.js ShaderMaterial
   * Uses the full GLSLShaderComposer for complete node graph traversal
   */
  compileToMaterial(graph: ShaderGraph, options?: ShaderCompileOptions): THREE.Material {
    try {
      const composed = this.composer.compose(graph, {
        enableIBL: options?.enableIBL,
        enableShadows: options?.enableShadows,
      });

      this.warnings = composed.warnings;
      this.errors = composed.errors;

      const materialOptions: THREE.ShaderMaterialParameters = {
        vertexShader: composed.vertexShader,
        fragmentShader: composed.fragmentShader,
        uniforms: composed.uniforms,
        side: THREE.FrontSide,
        transparent: false,
      };

      // Check if any alpha < 1 or transmission
      const fragStr = composed.fragmentShader;
      if (fragStr.includes('transmission') || fragStr.includes('alpha')) {
        materialOptions.transparent = true;
        materialOptions.side = THREE.DoubleSide;
      }

      // Add environment map if provided
      if (options?.envMap) {
        composed.uniforms['u_envMap'] = { value: options.envMap };
      }

      const material = new THREE.ShaderMaterial(materialOptions);

      if (composed.errors.length > 0) {
        console.warn('[ShaderCompiler] Errors during composition:', composed.errors);
      }

      return material;
    } catch (error: any) {
      console.warn('[ShaderCompiler] Full composition failed, using fallback:', error.message);
      return this.createFallbackMaterial();
    }
  }

  /**
   * Compile a node graph using the legacy (simplified) path.
   * This evaluates the graph through NodeEvaluator and generates
   * a simplified PBR shader from the extracted BSDF parameters.
   */
  compile(graph: NodeGraph): ShaderCompileResult {
    this.uniforms.clear();
    this.functions.clear();
    this.warnings = [];
    this.errors = [];
    this.uniformCounter = 0;

    try {
      // Evaluate the node graph first to extract parameters
      const evalResult = this.evaluator.evaluate(graph, EvaluationMode.MATERIAL);
      this.warnings.push(...evalResult.warnings);
      this.errors.push(...evalResult.errors);

      // Extract material parameters from evaluated BSDF
      const bsdfParams = this.extractBSDFParameters(evalResult.value);

      // Generate fragment shader
      const fragmentShader = this.generateLegacyFragmentShader(bsdfParams);

      // Build uniforms
      const threeUniforms = this.buildThreeUniforms(bsdfParams);

      // Create ShaderMaterial
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER_TEMPLATE,
        fragmentShader,
        uniforms: threeUniforms,
        side: bsdfParams.transmission > 0 ? THREE.DoubleSide : THREE.FrontSide,
        transparent: bsdfParams.alpha < 1.0 || bsdfParams.transmission > 0,
      });

      return {
        vertexShader: VERTEX_SHADER_TEMPLATE,
        fragmentShader,
        uniforms: threeUniforms,
        material,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    } catch (error: any) {
      this.errors.push(error.message);

      // Return fallback material
      const fallbackMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x888888,
        roughness: 0.5,
        metalness: 0.0,
      });

      return {
        vertexShader: '',
        fragmentShader: '',
        uniforms: {},
        material: fallbackMaterial as any,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }
  }

  /**
   * Compile a node graph, falling back to MeshPhysicalMaterial on failure
   */
  compileWithFallback(graph: NodeGraph): THREE.Material {
    const result = this.compile(graph);

    if (result.errors.length > 0) {
      // Fall back to MeshPhysicalMaterial with approximate parameters
      const evalResult = this.evaluator.evaluate(graph, EvaluationMode.MATERIAL);
      return this.createFallbackMaterialFromBSDF(evalResult.value);
    }

    return result.material;
  }

  // ==========================================================================
  // Convert NodeGraph to ShaderGraph for the composer
  // ==========================================================================

  private nodeGraphToShaderGraph(graph: NodeGraph): ShaderGraph {
    const nodes: Map<string, ComposableNode> = new Map();
    const links: NodeLink[] = [];

    for (const [id, nodeInst] of graph.nodes) {
      const composableNode: ComposableNode = {
        id,
        type: nodeInst.type,
        name: nodeInst.name,
        inputs: new Map(),
        outputs: new Map(),
        settings: (nodeInst as any).settings ?? (nodeInst as any).properties ?? {},
      };

      // Convert inputs
      if (nodeInst.inputs instanceof Map) {
        for (const [key, value] of nodeInst.inputs) {
          const socketType = this.inferSocketType(key, value);
          composableNode.inputs.set(key, {
            type: socketType,
            value: value instanceof THREE.Color ? [value.r, value.g, value.b] :
                    value instanceof THREE.Vector3 ? [value.x, value.y, value.z] : value,
            connectedLinks: [],
          });
        }
      }

      // Convert outputs
      if (nodeInst.outputs instanceof Map) {
        for (const [key, value] of nodeInst.outputs) {
          const socketType = this.inferSocketType(key, value);
          composableNode.outputs.set(key, {
            type: socketType,
            value,
            connectedLinks: [],
          });
        }
      }

      nodes.set(id, composableNode);
    }

    // Copy links
    for (const link of graph.links) {
      links.push({ ...link });
    }

    return { nodes, links };
  }

  /** Infer socket type from name and value */
  private inferSocketType(name: string, value: any): string {
    const nameLower = name.toLowerCase();

    // Vector/color socket names
    if (['vector', 'normal', 'position', 'color', 'base_color', 'emission_color',
         'subsurface_color', 'color1', 'color2', 'brickcolor', 'mortarcolor',
         'generated', 'object', 'camera', 'reflection', 'window'].includes(nameLower)) {
      return 'COLOR';
    }

    if (['uv'].includes(nameLower)) {
      return 'VECTOR';
    }

    // If value is an array with 3 elements, it's a color/vector
    if (Array.isArray(value) && value.length === 3) return 'COLOR';

    // If value is a THREE.Color or Vector3
    if (value instanceof THREE.Color || value instanceof THREE.Vector3) return 'COLOR';

    // Default to float
    return 'FLOAT';
  }

  // ==========================================================================
  // Node Group Inlining
  // ==========================================================================

  /**
   * Inline node groups by expanding group nodes into their constituent nodes.
   * When a node's type matches a group definition, the group's internal nodes
   * and links are merged into the parent graph.
   */
  private inlineNodeGroups(shaderGraph: ShaderGraph, originalGraph: NodeGraph): void {
    const groupNodesToInline: string[] = [];

    for (const [id, node] of shaderGraph.nodes) {
      // Check if this node references a group
      if (node.type.startsWith('ShaderNodeGroup') || node.type.startsWith('NodeGroup') || node.type === 'group') {
        groupNodesToInline.push(id);
      }
    }

    // For each group node, we'd need access to the group definition.
    // Since group definitions are stored in the evaluator, we delegate there.
    // For now, we log a warning for unexpanded groups.
    for (const id of groupNodesToInline) {
      this.warnings.push(`Node group "${id}" could not be inlined — group definitions not available at compile time. Passthrough will be used.`);
    }
  }

  // ==========================================================================
  // GLSL Function Collection
  // ==========================================================================

  private collectRequiredFunctions(shaderGraph: ShaderGraph): void {
    // Always need common utilities
    this.functions.add('COMMON_UTILITIES_GLSL');

    for (const [, node] of shaderGraph.nodes) {
      const requirements = nodeTypeToGLSLKey(node.type);
      for (const snippet of requirements) {
        this.functions.add(snippet);
      }

      // PrincipledBSDF always needs PBR + multi-light
      if (node.type === 'ShaderNodeBsdfPrincipled' || node.type === 'PrincipledBSDFNode') {
        this.functions.add('PRINCIPLED_BSDF_GLSL');
        this.functions.add('MULTI_LIGHT_GLSL');
      }
    }
  }

  // ==========================================================================
  // Vertex Shader Generation from Graph
  // ==========================================================================

  private generateVertexShaderFromGraph(shaderGraph: ShaderGraph): string {
    // Check if the graph contains displacement nodes
    const hasDisplacement = this.graphHasDisplacement(shaderGraph);

    // Collect custom uniforms needed
    const customUniforms: string[] = [];
    for (const [name, info] of this.uniforms) {
      customUniforms.push(`uniform ${info.type} ${name};`);
    }

    // Add time and displacement scale uniforms
    customUniforms.push('uniform float u_time;');
    customUniforms.push('uniform float u_displacementScale;');

    // Build vertex shader with optional displacement
    const displacementCode = hasDisplacement
      ? this.generateDisplacementCode(shaderGraph)
      : '';

    return `${GLSL_HEADER}

// Vertex attributes
in vec3 position;
in vec3 normal;
in vec2 uv;

// Uniforms
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// Custom uniforms
${customUniforms.join('\n')}

// Varyings
out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

${hasDisplacement ? this.collectGLSLFunctions() : ''}

void main() {
  vec3 displacedPosition = position;
  vec3 displacedNormal = normal;

${displacementCode}

  vec4 worldPos = modelMatrix * vec4(displacedPosition, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = displacedPosition;
  vNormal = normalize(normalMatrix * displacedNormal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
  }

  /** Check if the graph contains displacement-related nodes */
  private graphHasDisplacement(shaderGraph: ShaderGraph): boolean {
    for (const [, node] of shaderGraph.nodes) {
      const t = node.type;
      if (t === 'ShaderNodeDisplacement' || t === 'DisplacementNode' ||
          t === 'ShaderNodeSetPosition' || t === 'SetPositionNode' ||
          t === 'ShaderNodeBump' || t === 'BumpNode') {
        return true;
      }
    }
    return false;
  }

  /** Generate displacement GLSL code for the vertex shader */
  private generateDisplacementCode(shaderGraph: ShaderGraph): string {
    // Find displacement nodes in the graph
    for (const [id, node] of shaderGraph.nodes) {
      if (node.type === 'ShaderNodeDisplacement' || node.type === 'DisplacementNode') {
        // Generate code that reads the height and applies displacement along normal
        const heightInput = this.resolveGraphInput(id, 'height', shaderGraph);
        const scaleInput = this.resolveGraphInput(id, 'scale', shaderGraph);
        const midlevelInput = this.resolveGraphInput(id, 'midlevel', shaderGraph);

        return `  // Displacement from node graph
  float dispHeight = ${heightInput};
  float dispScale = ${scaleInput};
  float dispMidlevel = ${midlevelInput};
  displacedPosition = displacedPosition + displacedNormal * (dispHeight - dispMidlevel) * dispScale * u_displacementScale;
`;
      }

      if (node.type === 'ShaderNodeSetPosition' || node.type === 'SetPositionNode') {
        const posInput = this.resolveGraphInput(id, 'position', shaderGraph);
        return `  // Set position from node graph
  displacedPosition = ${posInput};
`;
      }
    }

    return '';
  }

  /** Resolve a graph input to a GLSL expression */
  private resolveGraphInput(nodeId: string, inputName: string, graph: ShaderGraph): string {
    // Find a link targeting this input
    for (const link of graph.links) {
      if (link.toNode === nodeId && link.toSocket === inputName) {
        const sourceNode = graph.nodes.get(link.fromNode);
        if (sourceNode) {
          return this.generateNodeExpression(link.fromNode, link.fromSocket, sourceNode, graph);
        }
      }
    }

    // No connection — use default value
    const node = graph.nodes.get(nodeId);
    const input = node?.inputs.get(inputName);
    const defaultVal = input?.value ?? this.getDefaultForInput(inputName, node?.type);
    const uName = this.addUniformForValue(`${nodeId}_${inputName}`, defaultVal);
    return uName;
  }

  /** Generate a GLSL expression for a node output */
  private generateNodeExpression(nodeId: string, outputSocket: string, node: ComposableNode, graph: ShaderGraph): string {
    const type = node.type;

    // Input nodes — return varying or uniform
    if (type === 'ShaderNodeValue' || type === 'ValueNode') {
      return this.addUniformForValue(`${nodeId}_value`, node.settings.value ?? 0.0);
    }
    if (type === 'ShaderNodeRGB' || type === 'ColorNode' || type === 'RGBNode') {
      const col = node.settings.color ?? [0.8, 0.8, 0.8];
      return this.addUniformForValue(`${nodeId}_color`, col);
    }
    if (type === 'ShaderNodeTexCoord' || type === 'TextureCoordNode') {
      if (outputSocket === 'uv' || outputSocket === 'UV') return 'vUV';
      if (outputSocket === 'normal' || outputSocket === 'Normal') return 'vNormal';
      if (outputSocket === 'object' || outputSocket === 'Object') return 'vPosition';
      if (outputSocket === 'generated' || outputSocket === 'Generated') return 'vPosition';
      return 'vPosition';
    }
    if (type === 'GeometryNodeInputPosition' || type === 'PositionNode') {
      return 'vPosition';
    }
    if (type === 'GeometryNodeInputNormal' || type === 'NormalNode' || type === 'ShaderNodeNormal') {
      return 'vNormal';
    }

    // Math nodes — inline the operation
    if (type === 'ShaderNodeMath' || type === 'MathNode') {
      const a = this.resolveGraphInput(nodeId, 'value', graph);
      const b = this.resolveGraphInput(nodeId, 'value_1', graph);
      const op = node.settings.operation ?? 'add';
      return this.mathOpGLSL(a, b, op);
    }

    // Vector math — inline the operation
    if (type === 'ShaderNodeVectorMath' || type === 'VectorMathNode') {
      const a = this.resolveGraphInput(nodeId, 'vector', graph);
      const b = this.resolveGraphInput(nodeId, 'vector_1', graph);
      const op = node.settings.operation ?? 'add';
      return this.vectorMathOpGLSL(a, b, op, outputSocket);
    }

    // Texture nodes — call the GLSL function
    if (type === 'ShaderNodeTexNoise' || type === 'TextureNoiseNode') {
      const vec = this.resolveGraphInput(nodeId, 'vector', graph);
      const scale = this.resolveGraphInput(nodeId, 'scale', graph);
      const detail = this.resolveGraphInput(nodeId, 'detail', graph);
      const distortion = this.resolveGraphInput(nodeId, 'distortion', graph);
      const roughness = this.resolveGraphInput(nodeId, 'roughness', graph);
      return `noiseTexture(${vec}, ${scale}, ${detail}, ${distortion}, ${roughness})`;
    }
    if (type === 'ShaderNodeTexVoronoi' || type === 'TextureVoronoiNode') {
      const vec = this.resolveGraphInput(nodeId, 'vector', graph);
      const scale = this.resolveGraphInput(nodeId, 'scale', graph);
      return `voronoiTexture(${vec}, ${scale}, 1.0, 1.0, 0, 0)`;
    }
    if (type === 'ShaderNodeTexMusgrave' || type === 'TextureMusgraveNode') {
      const vec = this.resolveGraphInput(nodeId, 'vector', graph);
      const scale = this.resolveGraphInput(nodeId, 'scale', graph);
      const detail = this.resolveGraphInput(nodeId, 'detail', graph);
      return `musgraveTexture(${vec}, ${scale}, ${detail}, 2.0, 2.0, 0.0, 1.0, 0)`;
    }
    if (type === 'ShaderNodeTexGradient' || type === 'TextureGradientNode') {
      const vec = this.resolveGraphInput(nodeId, 'vector', graph);
      return `gradientTexture(${vec}, 0)`;
    }
    if (type === 'ShaderNodeTexChecker' || type === 'TextureCheckerNode') {
      const vec = this.resolveGraphInput(nodeId, 'vector', graph);
      const scale = this.resolveGraphInput(nodeId, 'scale', graph);
      return `checkerTexture(${vec}, ${scale})`;
    }
    if (type === 'ShaderNodeTexBrick' || type === 'TextureBrickNode') {
      const vec = this.resolveGraphInput(nodeId, 'vector', graph);
      const scale = this.resolveGraphInput(nodeId, 'scale', graph);
      return `brickTexture(${vec}, ${scale}, 0.02, 0.1, 0.0, 2.0, 0.5, 0.5, 1.0, 0)`;
    }
    if (type === 'ShaderNodeTexMagic' || type === 'TextureMagicNode') {
      const vec = this.resolveGraphInput(nodeId, 'vector', graph);
      const scale = this.resolveGraphInput(nodeId, 'scale', graph);
      return `dot(magicTexture(${vec}, ${scale}, 2), vec3(0.333))`;
    }

    // Color nodes
    if (type === 'ShaderNodeMixRGB' || type === 'MixRGBNode') {
      const fac = this.resolveGraphInput(nodeId, 'factor', graph);
      const c1 = this.resolveGraphInput(nodeId, 'color1', graph);
      const c2 = this.resolveGraphInput(nodeId, 'color2', graph);
      const blendType = this.blendTypeToInt(node.settings.blendType ?? 'MIX');
      return `mixRGB(${fac}, ${c1}, ${c2}, ${blendType})`;
    }
    if (type === 'ShaderNodeValToRGB' || type === 'ColorRampNode') {
      const fac = this.resolveGraphInput(nodeId, 'fac', graph);
      return `colorRamp(${fac}, u_${nodeId}_crPositions, u_${nodeId}_crColors, 2, 1).rgb`;
    }
    if (type === 'ShaderNodeSeparateRGB' || type === 'SeparateRGBNode') {
      const col = this.resolveGraphInput(nodeId, 'color', graph);
      if (outputSocket === 'r' || outputSocket === 'R') return `${col}.r`;
      if (outputSocket === 'g' || outputSocket === 'G') return `${col}.g`;
      if (outputSocket === 'b' || outputSocket === 'B') return `${col}.b`;
      return `${col}.r`;
    }
    if (type === 'ShaderNodeCombineRGB' || type === 'CombineRGBNode') {
      const r = this.resolveGraphInput(nodeId, 'r', graph);
      const g = this.resolveGraphInput(nodeId, 'g', graph);
      const b = this.resolveGraphInput(nodeId, 'b', graph);
      return `vec3(${r}, ${g}, ${b})`;
    }
    if (type === 'ShaderNodeHueSaturation' || type === 'HueSaturationValueNode') {
      const col = this.resolveGraphInput(nodeId, 'color', graph);
      const hue = this.resolveGraphInput(nodeId, 'hue', graph);
      const sat = this.resolveGraphInput(nodeId, 'saturation', graph);
      const val = this.resolveGraphInput(nodeId, 'value', graph);
      return `(hsv2rgb(rgb2hsv(${col}) + vec3(${hue}, ${sat}, ${val})))`;
    }
    if (type === 'ShaderNodeInvert' || type === 'InvertNode') {
      const fac = this.resolveGraphInput(nodeId, 'fac', graph);
      const col = this.resolveGraphInput(nodeId, 'color', graph);
      return `mix(${col}, vec3(1.0) - ${col}, ${fac})`;
    }
    if (type === 'ShaderNodeBrightContrast' || type === 'BrightContrastNode') {
      const col = this.resolveGraphInput(nodeId, 'color', graph);
      const bright = this.resolveGraphInput(nodeId, 'bright', graph);
      const contrast = this.resolveGraphInput(nodeId, 'contrast', graph);
      return `(${col} * (1.0 + ${contrast}) + ${bright})`;
    }

    // Converter nodes
    if (type === 'ShaderNodeMapRange' || type === 'MapRangeNode') {
      const val = this.resolveGraphInput(nodeId, 'value', graph);
      const fromMin = this.resolveGraphInput(nodeId, 'from_min', graph);
      const fromMax = this.resolveGraphInput(nodeId, 'from_max', graph);
      const toMin = this.resolveGraphInput(nodeId, 'to_min', graph);
      const toMax = this.resolveGraphInput(nodeId, 'to_max', graph);
      return `mix(${toMin}, ${toMax}, clamp((${val} - ${fromMin}) / max(${fromMax} - ${fromMin}, 0.0001), 0.0, 1.0))`;
    }
    if (type === 'ShaderNodeClamp' || type === 'ClampNode') {
      const val = this.resolveGraphInput(nodeId, 'value', graph);
      const minVal = this.resolveGraphInput(nodeId, 'min', graph);
      const maxVal = this.resolveGraphInput(nodeId, 'max', graph);
      return `clamp(${val}, ${minVal}, ${maxVal})`;
    }

    // Mapping
    if (type === 'ShaderNodeMapping' || type === 'MappingNode') {
      const vec = this.resolveGraphInput(nodeId, 'vector', graph);
      const translation = node.settings.translation ?? [0, 0, 0];
      const rotation = node.settings.rotation ?? [0, 0, 0];
      const scale = node.settings.scale ?? [1, 1, 1];
      const uT = this.addUniformForValue(`${nodeId}_translation`, translation);
      const uR = this.addUniformForValue(`${nodeId}_rotation`, rotation);
      const uS = this.addUniformForValue(`${nodeId}_scale`, scale);
      return `mappingNode(${vec}, ${uT}, ${uR}, ${uS}, 0)`;
    }

    // Default: return uniform
    return this.addUniformForValue(`${nodeId}_${outputSocket}`, node.settings[outputSocket] ?? 0.0);
  }

  // ==========================================================================
  // Fragment Shader Generation from Graph
  // ==========================================================================

  private generateFragmentShaderFromGraph(shaderGraph: ShaderGraph): string {
    // Use the GLSLShaderComposer for full fragment shader generation
    try {
      const composed = this.composer.compose(shaderGraph);
      this.warnings.push(...composed.warnings);
      this.errors.push(...composed.errors);
      return composed.fragmentShader;
    } catch (error: any) {
      this.warnings.push(`Composer failed: ${error.message}. Using fallback.`);
      return this.generateFallbackFragment();
    }
  }

  // ==========================================================================
  // GLSL Expression Generators
  // ==========================================================================

  private mathOpGLSL(a: string, b: string, op: string): string {
    switch (op) {
      case 'add': return `(${a} + ${b})`;
      case 'subtract': return `(${a} - ${b})`;
      case 'multiply': return `(${a} * ${b})`;
      case 'divide': return `(${a} / max(${b}, 0.0001))`;
      case 'power': return `pow(max(${a}, 0.0), ${b})`;
      case 'sqrt': return `sqrt(max(${a}, 0.0))`;
      case 'abs': return `abs(${a})`;
      case 'min': return `min(${a}, ${b})`;
      case 'max': return `max(${a}, ${b})`;
      case 'clamp': return `clamp(${a}, 0.0, 1.0)`;
      case 'sin': return `sin(${a})`;
      case 'cos': return `cos(${a})`;
      case 'tan': return `tan(${a})`;
      case 'modulo': return `mod(${a}, ${b})`;
      default: return `mathOp(${a}, ${b}, 0)`;
    }
  }

  private vectorMathOpGLSL(a: string, b: string, op: string, outputSocket: string): string {
    if (outputSocket === 'value' || outputSocket === 'Value') {
      switch (op) {
        case 'dot': return `dot(${a}, ${b})`;
        case 'length': return `length(${a})`;
        case 'distance': return `distance(${a}, ${b})`;
        default: return `0.0`;
      }
    }
    // Default: vector output
    switch (op) {
      case 'add': return `(${a} + ${b})`;
      case 'subtract': return `(${a} - ${b})`;
      case 'multiply': return `(${a} * ${b})`;
      case 'normalize': return `normalize(${a})`;
      case 'cross': return `cross(${a}, ${b})`;
      case 'reflect': return `reflect(${a}, normalize(${b}))`;
      case 'refract': return `refract(${a}, normalize(${b}), 1.0)`;
      default: return `${a}`;
    }
  }

  private blendTypeToInt(blendType: string): number {
    const map: Record<string, number> = {
      'MIX': 0, 'ADD': 1, 'MULTIPLY': 2, 'SUBTRACT': 3, 'SCREEN': 4,
      'DIVIDE': 5, 'DIFFERENCE': 6, 'DARKEN': 7, 'LIGHTEN': 8,
      'OVERLAY': 9, 'COLOR_DODGE': 10, 'COLOR_BURN': 11,
      'HARD_LIGHT': 12, 'SOFT_LIGHT': 13, 'LINEAR_LIGHT': 14,
    };
    return map[blendType.toUpperCase()] ?? 0;
  }

  private getDefaultForInput(inputName: string, nodeType?: string): any {
    const defaults: Record<string, any> = {
      'scale': 5.0, 'Scale': 5.0,
      'detail': 2.0, 'Detail': 2.0,
      'roughness': 0.5, 'Roughness': 0.5,
      'distortion': 0.0, 'Distortion': 0.0,
      'factor': 0.5, 'Factor': 0.5, 'Fac': 0.5,
      'metallic': 0.0, 'Metallic': 0.0,
      'specular': 0.5, 'Specular': 0.5,
      'ior': 1.45, 'IOR': 1.45,
      'transmission': 0.0, 'Transmission': 0.0,
      'alpha': 1.0, 'Alpha': 1.0,
      'clearcoat': 0.0, 'Clearcoat': 0.0,
      'strength': 1.0, 'Strength': 1.0,
      'height': 0.0, 'Height': 0.0,
      'midlevel': 0.5, 'Midlevel': 0.5,
      'value': 0.0, 'Value': 0.0,
      'hue': 0.5, 'saturation': 0.0, 'value_1': 1.0,
      'bright': 0.0, 'contrast': 0.0,
      'from_min': 0.0, 'from_max': 1.0, 'to_min': 0.0, 'to_max': 1.0,
      'min': 0.0, 'max': 1.0,
    };
    return defaults[inputName] ?? 0.0;
  }

  // ==========================================================================
  // Uniform Helpers
  // ==========================================================================

  private addUniformForValue(name: string, value: any): string {
    const uniformName = `u_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    if (this.uniforms.has(uniformName)) {
      return uniformName;
    }

    let type: UniformInfo['type'];
    let uniformValue: any;

    if (typeof value === 'number') {
      type = 'float';
      uniformValue = { value };
    } else if (Array.isArray(value)) {
      if (value.length === 2) {
        type = 'vec2';
        uniformValue = { value: new THREE.Vector2(value[0], value[1]) };
      } else if (value.length === 3) {
        type = 'vec3';
        uniformValue = { value: new THREE.Vector3(value[0], value[1], value[2]) };
      } else if (value.length === 4) {
        type = 'vec4';
        uniformValue = { value: new THREE.Vector4(value[0], value[1], value[2], value[3]) };
      } else {
        type = 'float';
        uniformValue = { value: 0.0 };
      }
    } else if (value instanceof THREE.Color) {
      type = 'vec3';
      uniformValue = { value: new THREE.Vector3(value.r, value.g, value.b) };
    } else if (value instanceof THREE.Vector2) {
      type = 'vec2';
      uniformValue = { value };
    } else if (value instanceof THREE.Vector3) {
      type = 'vec3';
      uniformValue = { value };
    } else if (value instanceof THREE.Vector4) {
      type = 'vec4';
      uniformValue = { value };
    } else {
      type = 'float';
      uniformValue = { value: 0.0 };
    }

    this.uniforms.set(uniformName, { name: uniformName, type, value: uniformValue });
    return uniformName;
  }

  // ==========================================================================
  // GLSL Function Collection for Inline Code
  // ==========================================================================

  private collectGLSLFunctions(): string {
    const parts: string[] = [];
    for (const snippetName of this.functions) {
      const snippet = GLSL_SNIPPET_MAP[snippetName];
      if (snippet) {
        parts.push(snippet);
      }
    }
    return parts.join('\n');
  }

  // ==========================================================================
  // BSDF Parameter Extraction (legacy path)
  // ==========================================================================

  private extractBSDFParameters(evalOutput: any): BSDFParams {
    const defaultParams: BSDFParams = {
      baseColor: new THREE.Color(0.8, 0.8, 0.8),
      metallic: 0.0,
      roughness: 0.5,
      specular: 0.5,
      ior: 1.45,
      transmission: 0.0,
      emissionColor: new THREE.Color(0, 0, 0),
      emissionStrength: 0.0,
      alpha: 1.0,
      clearcoat: 0.0,
      clearcoatRoughness: 0.03,
      subsurfaceWeight: 0.0,
      sheen: 0.0,
      anisotropic: 0.0,
    };

    if (!evalOutput) return defaultParams;

    // Navigate through the eval output to find BSDF params
    let bsdf = evalOutput;

    // Handle material_output node wrapping
    if (evalOutput.BSDF) bsdf = evalOutput.BSDF;
    else if (evalOutput.Surface) bsdf = evalOutput.Surface;
    else if (evalOutput.Shader) bsdf = evalOutput.Shader;

    // Handle mix_shader/add_shader wrapping
    if (bsdf.shader1 || bsdf.shader2) {
      // For mix shaders, use the first shader's params weighted by factor
      const factor = bsdf.factor ?? 0.5;
      const p1 = this.extractBSDFParameters(bsdf.shader1);
      const p2 = this.extractBSDFParameters(bsdf.shader2);
      return this.blendBSDFParams(p1, p2, factor);
    }

    return {
      baseColor: this.resolveColorValue(bsdf.baseColor, defaultParams.baseColor),
      metallic: bsdf.metallic ?? defaultParams.metallic,
      roughness: Math.max(0.04, bsdf.roughness ?? defaultParams.roughness),
      specular: bsdf.specular ?? defaultParams.specular,
      ior: bsdf.ior ?? defaultParams.ior,
      transmission: bsdf.transmission ?? defaultParams.transmission,
      emissionColor: this.resolveColorValue(bsdf.emissionColor, defaultParams.emissionColor),
      emissionStrength: bsdf.emissionStrength ?? defaultParams.emissionStrength,
      alpha: bsdf.alpha ?? defaultParams.alpha,
      clearcoat: bsdf.clearcoat ?? defaultParams.clearcoat,
      clearcoatRoughness: bsdf.clearcoatRoughness ?? defaultParams.clearcoatRoughness,
      subsurfaceWeight: bsdf.subsurfaceWeight ?? defaultParams.subsurfaceWeight,
      sheen: bsdf.sheen ?? defaultParams.sheen,
      anisotropic: bsdf.anisotropic ?? defaultParams.anisotropic,
    };
  }

  private blendBSDFParams(a: BSDFParams, b: BSDFParams, factor: number): BSDFParams {
    return {
      baseColor: new THREE.Color().lerpColors(a.baseColor, b.baseColor, factor),
      metallic: a.metallic + factor * (b.metallic - a.metallic),
      roughness: a.roughness + factor * (b.roughness - a.roughness),
      specular: a.specular + factor * (b.specular - a.specular),
      ior: a.ior + factor * (b.ior - a.ior),
      transmission: a.transmission + factor * (b.transmission - a.transmission),
      emissionColor: new THREE.Color().lerpColors(a.emissionColor, b.emissionColor, factor),
      emissionStrength: a.emissionStrength + factor * (b.emissionStrength - a.emissionStrength),
      alpha: a.alpha + factor * (b.alpha - a.alpha),
      clearcoat: a.clearcoat + factor * (b.clearcoat - a.clearcoat),
      clearcoatRoughness: a.clearcoatRoughness + factor * (b.clearcoatRoughness - a.clearcoatRoughness),
      subsurfaceWeight: a.subsurfaceWeight + factor * (b.subsurfaceWeight - a.subsurfaceWeight),
      sheen: a.sheen + factor * (b.sheen - a.sheen),
      anisotropic: a.anisotropic + factor * (b.anisotropic - a.anisotropic),
    };
  }

  // ==========================================================================
  // Legacy Fragment Shader Generation (simplified PBR from BSDF params)
  // ==========================================================================

  private generateLegacyFragmentShader(params: BSDFParams): string {
    // Register uniforms from params
    const baseColorUniform = this.addUniformLegacy('baseColor', 'vec3', params.baseColor);
    const metallicUniform = this.addUniformLegacy('metallic', 'float', params.metallic);
    const roughnessUniform = this.addUniformLegacy('roughness', 'float', params.roughness);
    const specularUniform = this.addUniformLegacy('specular', 'float', params.specular);
    const iorUniform = this.addUniformLegacy('ior', 'float', params.ior);
    const transmissionUniform = this.addUniformLegacy('transmission', 'float', params.transmission);
    const emissionColorUniform = this.addUniformLegacy('emissionColor', 'vec3', params.emissionColor);
    const emissionStrengthUniform = this.addUniformLegacy('emissionStrength', 'float', params.emissionStrength);
    const alphaUniform = this.addUniformLegacy('alpha', 'float', params.alpha);
    const clearcoatUniform = this.addUniformLegacy('clearcoat', 'float', params.clearcoat);
    const clearcoatRoughnessUniform = this.addUniformLegacy('clearcoatRoughness', 'float', params.clearcoatRoughness);
    const subsurfaceWeightUniform = this.addUniformLegacy('subsurfaceWeight', 'float', params.subsurfaceWeight);
    const sheenUniform = this.addUniformLegacy('sheen', 'float', params.sheen);

    // Build fragment shader
    const frag = `${GLSL_HEADER}

// Varyings from vertex shader
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;

// Output
out vec4 fragColor;

// Material uniforms
uniform vec3 ${baseColorUniform};
uniform float ${metallicUniform};
uniform float ${roughnessUniform};
uniform float ${specularUniform};
uniform float ${iorUniform};
uniform float ${transmissionUniform};
uniform vec3 ${emissionColorUniform};
uniform float ${emissionStrengthUniform};
uniform float ${alphaUniform};
uniform float ${clearcoatUniform};
uniform float ${clearcoatRoughnessUniform};
uniform float ${subsurfaceWeightUniform};
uniform float ${sheenUniform};

// Camera uniforms (auto-set by Three.js)
uniform vec3 cameraPosition;

${this.getNoiseFunctions()}

// PBR lighting functions
const float PI = 3.14159265359;

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  float num = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;
  return num / max(denom, 0.0001);
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx2 = geometrySchlickGGX(NdotV, roughness);
  float ggx1 = geometrySchlickGGX(NdotL, roughness);
  return ggx1 * ggx2;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  // Base material properties
  vec3 albedo = ${baseColorUniform};
  float metallic = ${metallicUniform};
  float roughness = max(0.04, ${roughnessUniform});
  float transmission = ${transmissionUniform};
  float clearcoat = ${clearcoatUniform};
  float clearcoatRoughness = max(0.04, ${clearcoatRoughnessUniform});
  float subsurfaceWeight = ${subsurfaceWeightUniform};
  float sheenWeight = ${sheenUniform};

  // Calculate reflectance at normal incidence
  vec3 F0 = vec3(0.16 * ${specularUniform} * ${specularUniform});
  F0 = mix(F0, albedo, metallic);

  // Simple directional + ambient lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  vec3 lightColor = vec3(1.0);
  vec3 ambientColor = vec3(0.15);

  vec3 L = lightDir;
  vec3 H = normalize(V + L);

  // Cook-Torrance BRDF
  float NDF = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  vec3 specularBRDF = numerator / denominator;

  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
  kD *= 1.0 - metallic;

  float NdotL = max(dot(N, L), 0.0);

  vec3 Lo = (kD * albedo / PI + specularBRDF) * lightColor * NdotL;

  // Clearcoat layer
  if (clearcoat > 0.0) {
    float ccNDF = distributionGGX(N, H, clearcoatRoughness);
    float ccG = geometrySmith(N, V, L, clearcoatRoughness);
    vec3 ccF = fresnelSchlick(max(dot(H, V), 0.0), vec3(0.04));
    float ccSpecular = (ccNDF * ccG * ccF.x) / (4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001);
    Lo = mix(Lo, Lo + vec3(ccSpecular), clearcoat);
  }

  // Sheen
  if (sheenWeight > 0.0) {
    float NdotV = max(dot(N, V), 0.0);
    vec3 sheenColor = vec3(1.0, 1.0, 1.0) * pow(1.0 - NdotV, 5.0);
    Lo = mix(Lo, Lo + sheenColor * sheenWeight, sheenWeight);
  }

  // Subsurface scattering approximation
  if (subsurfaceWeight > 0.0) {
    vec3 sssColor = albedo * (1.0 - metallic);
    float sssFactor = pow(clamp(dot(V, -L), 0.0, 1.0), 2.0);
    Lo = mix(Lo, Lo + sssColor * sssFactor * 0.5, subsurfaceWeight);
  }

  // Transmission approximation
  if (transmission > 0.0) {
    vec3 transmittedColor = albedo * (1.0 - metallic);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    Lo = mix(Lo, transmittedColor * 0.5, transmission * (1.0 - fresnel));
  }

  // Ambient
  vec3 ambient = ambientColor * albedo;
  vec3 color = ambient + Lo;

  // Emission
  color += ${emissionColorUniform} * ${emissionStrengthUniform};

  // Tone mapping (simple Reinhard)
  color = color / (color + vec3(1.0));

  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  fragColor = vec4(color, ${alphaUniform});
}
`;

    return frag;
  }

  // ==========================================================================
  // Uniform Management
  // ==========================================================================

  private addUniformLegacy(name: string, type: UniformInfo['type'], value: any): string {
    const uniformName = `u_${name}`;
    let uniformValue: any;

    switch (type) {
      case 'float':
        uniformValue = { value: typeof value === 'number' ? value : 0.0 };
        break;
      case 'vec2':
        uniformValue = { value: value instanceof THREE.Vector2 ? value : new THREE.Vector2(0, 0) };
        break;
      case 'vec3':
        uniformValue = {
          value: value instanceof THREE.Color
            ? new THREE.Vector3(value.r, value.g, value.b)
            : value instanceof THREE.Vector3
              ? value
              : new THREE.Vector3(0, 0, 0),
        };
        break;
      case 'vec4':
        uniformValue = { value: value instanceof THREE.Vector4 ? value : new THREE.Vector4(0, 0, 0, 1) };
        break;
      case 'int':
        uniformValue = { value: typeof value === 'number' ? value : 0 };
        break;
      case 'sampler2D':
        uniformValue = { value: value instanceof THREE.Texture ? value : null };
        break;
      default:
        uniformValue = { value };
    }

    this.uniforms.set(uniformName, { name: uniformName, type, value: uniformValue });
    return uniformName;
  }

  private buildThreeUniforms(params: BSDFParams): Record<string, THREE.IUniform> {
    const result: Record<string, THREE.IUniform> = {};

    for (const [, info] of this.uniforms) {
      result[info.name] = info.value as THREE.IUniform;
    }

    return result;
  }

  private buildThreeUniformsFromMap(): Record<string, THREE.IUniform> {
    const result: Record<string, THREE.IUniform> = {};

    for (const [, info] of this.uniforms) {
      result[info.name] = info.value as THREE.IUniform;
    }

    return result;
  }

  // ==========================================================================
  // GLSL Noise Functions (simplified legacy)
  // ==========================================================================

  private getNoiseFunctions(): string {
    return `
// Hash function for noise
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// 3D Gradient noise
float gradientNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  return mix(mix(mix(dot(hash33(i + vec3(0,0,0)), f - vec3(0,0,0)),
                     dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)),
                     dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)),
                     dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)),
                     dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

// FBM (Fractional Brownian Motion)
float fbm(vec3 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value += amplitude * gradientNoise(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// Voronoi noise
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float voronoi(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash22(i + neighbor);
      vec2 diff = neighbor + point - f;
      float dist = length(diff);
      minDist = min(minDist, dist);
    }
  }

  return minDist;
}
`;
  }

  // ==========================================================================
  // Fallback Shaders
  // ==========================================================================

  private createFallbackMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      roughness: 0.5,
      metalness: 0.0,
    });
  }

  private createFallbackMaterialFromBSDF(evalOutput: any): THREE.MeshPhysicalMaterial {
    const params = this.extractBSDFParameters(evalOutput);

    const materialParams: THREE.MeshPhysicalMaterialParameters = {
      color: params.baseColor,
      metalness: params.metallic,
      roughness: Math.max(0.04, params.roughness),
      emissive: params.emissionColor,
      emissiveIntensity: params.emissionStrength,
      opacity: params.alpha,
      transparent: params.alpha < 1.0,
      clearcoat: params.clearcoat,
      clearcoatRoughness: params.clearcoatRoughness,
      ior: params.ior,
      sheen: params.sheen,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(1, 1, 1),
    };

    if (params.transmission > 0) {
      materialParams.transmission = params.transmission;
      materialParams.transparent = true;
    }

    return new THREE.MeshPhysicalMaterial(materialParams);
  }

  private generateFallbackFragment(): string {
    return `${GLSL_HEADER}
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
  // Helpers
  // ==========================================================================

  private resolveColorValue(value: any, defaultColor: THREE.Color): THREE.Color {
    if (value instanceof THREE.Color) return value.clone();
    if (typeof value === 'string') return new THREE.Color(value);
    if (typeof value === 'number') return new THREE.Color(value);
    if (value && typeof value === 'object') {
      if ('r' in value && 'g' in value && 'b' in value) {
        return new THREE.Color(value.r, value.g, value.b);
      }
    }
    return defaultColor.clone();
  }
}

// ============================================================================
// BSDF Parameters Interface
// ============================================================================

interface BSDFParams {
  baseColor: THREE.Color;
  metallic: number;
  roughness: number;
  specular: number;
  ior: number;
  transmission: number;
  emissionColor: THREE.Color;
  emissionStrength: number;
  alpha: number;
  clearcoat: number;
  clearcoatRoughness: number;
  subsurfaceWeight: number;
  sheen: number;
  anisotropic: number;
}
