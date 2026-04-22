/**
 * Node Transpiler - Converts node graphs to Three.js shaders/materials
 * Based on infinigen/core/nodes/node_transpiler/
 * 
 * This module traverses node graphs and generates GLSL shader code
 * or Three.js node material configurations.
 */

import { NodeWrangler, NodeInstance, NodeLink, NodeGroup } from '../core/node-wrangler';
import { NodeTypes } from '../core/node-types';
import { SocketType } from '../core/socket-types';

export interface ShaderChunk {
  uniforms: Map<string, string>;
  vertexCode: string;
  fragmentCode: string;
  varies: Map<string, string>;
}

export interface TranspiledMaterial {
  type: 'standard' | 'physical' | 'custom';
  shaderChunks: ShaderChunk[];
  connections: MaterialConnection[];
  properties: Record<string, any>;
}

export interface MaterialConnection {
  fromNode: string;
  fromSocket: string;
  toNode: string;
  toSocket: string;
  glslExpression?: string;
}

/**
 * Transpiles node graphs to Three.js compatible materials
 */
export class NodeTranspiler {
  private wrangler: NodeWrangler;
  private visitedNodes: Set<string>;
  private shaderVariables: Map<string, string>;

  constructor(wrangler: NodeWrangler) {
    this.wrangler = wrangler;
    this.visitedNodes = new Set();
    this.shaderVariables = new Map();
  }

  /**
   * Transpile the entire node graph to a material definition
   */
  transpile(groupId?: string): TranspiledMaterial {
    const group = groupId ? this.wrangler['nodeGroups'].get(groupId) : this.wrangler.getActiveGroup();
    
    if (!group) {
      throw new Error('Node group not found');
    }

    const material: TranspiledMaterial = {
      type: 'custom',
      shaderChunks: [],
      connections: [],
      properties: {},
    };

    // Reset state
    this.visitedNodes.clear();
    this.shaderVariables.clear();

    // Find output node (Material Output or similar)
    const outputNode = this.findOutputNode(group);
    
    if (outputNode) {
      this.transpileNode(outputNode, group, material);
    } else {
      // No output node found, transpile all nodes
      for (const [nodeId, node] of group.nodes) {
        if (!this.visitedNodes.has(nodeId)) {
          this.transpileNode(node, group, material);
        }
      }
    }

    return material;
  }

  /**
   * Transpile a single node and its dependencies
   */
  private transpileNode(
    node: NodeInstance,
    group: NodeGroup,
    material: TranspiledMaterial
  ): string {
    if (this.visitedNodes.has(node.id)) {
      return this.getVariableForNode(node.id);
    }

    this.visitedNodes.add(node.id);

    // First, transpile all input dependencies
    const inputValues: Map<string, string> = new Map();
    
    for (const [socketName, socket] of node.inputs) {
      if (socket.connectedTo) {
        // Find the source node
        const sourceNode = this.findNodeBySocketId(socket.connectedTo, group);
        if (sourceNode) {
          const value = this.transpileNode(sourceNode, group, material);
          inputValues.set(socketName, value);
        }
      } else {
        // Use default value
        inputValues.set(socketName, this.valueToGLSL(socket.value, socket.type));
      }
    }

    // Generate code for this node based on type
    const nodeName = node.type.replace(/_/g, '_').toLowerCase();
    const variableName = `v_${nodeName}_${node.id.substring(0, 8)}`;
    this.shaderVariables.set(node.id, variableName);

    const code = this.generateNodeCode(node, inputValues, material);
    
    if (code) {
      material.connections.push({
        fromNode: node.id,
        fromSocket: 'Value',
        toNode: 'output',
        toSocket: 'Surface',
        glslExpression: `${variableName} = ${code};`,
      });
    }

    return variableName;
  }

  /**
   * Generate GLSL code for a specific node type
   */
  private generateNodeCode(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string | null {
    switch (node.type) {
      case NodeTypes.BSDF_PRINCIPLED:
        return this.generatePrincipledBSDF(node, inputs, material);
      
      case NodeTypes.TEX_IMAGE:
        return this.generateImageTexture(node, inputs, material);
      
      case NodeTypes.TEX_NOISE:
        return this.generateNoiseTexture(node, inputs, material);
      
      case NodeTypes.MATH_ADD:
      case NodeTypes.MATH_SUBTRACT:
      case NodeTypes.MATH_MULTIPLY:
      case NodeTypes.MATH_DIVIDE:
        return this.generateMathOperation(node, inputs, material);
      
      case NodeTypes.MIX_RGB:
        return this.generateMixRGB(node, inputs, material);
      
      case NodeTypes.NORMAL_MAP:
        return this.generateNormalMap(node, inputs, material);
      
      case NodeTypes.BUMP:
        return this.generateBump(node, inputs, material);
      
      case NodeTypes.TEX_COORD:
        return this.generateTexCoord(node, inputs, material);
      
      case NodeTypes.VALUE:
      case NodeTypes.COLOR:
      case NodeTypes.VECTOR:
        return this.generateConstant(node, inputs, material);
      
      default:
        console.warn(`Unsupported node type: ${node.type}`);
        return null;
    }
  }

  /**
   * Generate Principled BSDF shader code
   */
  private generatePrincipledBSDF(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string {
    const baseColor = inputs.get('Base Color') || 'vec3(1.0)';
    const metallic = inputs.get('Metallic') || '0.0';
    const roughness = inputs.get('Roughness') || '0.5';
    const normal = inputs.get('Normal') || 'vec3(0.0, 0.0, 1.0)';

    // Add uniforms if textures are used
    if (!baseColor.startsWith('vec')) {
      material.properties.baseColor = baseColor;
    }

    return `principled_bsdf(${baseColor}, ${metallic}, ${roughness}, ${normal})`;
  }

  /**
   * Generate image texture sampling code
   */
  private generateImageTexture(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string {
    const vector = inputs.get('Vector') || 'vUV';
    const imagePath = node.properties.imagePath || 'texture.jpg';

    const uniformName = `u_texture_${node.id.substring(0, 8)}`;
    material.uniforms = material.uniforms || new Map();
    material.uniforms.set(uniformName, `sampler2D`);

    return `texture(${uniformName}, ${vector}.xy)`;
  }

  /**
   * Generate procedural noise texture code
   */
  private generateNoiseTexture(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string {
    const vector = inputs.get('Vector') || 'vUV';
    const scale = node.properties.scale || 1.0;
    const detail = node.properties.detail || 2.0;
    const distortion = node.properties.distortion || 0.0;

    return `noise(${vector} * ${scale.toFixed(2)}, ${detail.toFixed(2)}, ${distortion.toFixed(2)})`;
  }

  /**
   * Generate math operation code
   */
  private generateMathOperation(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string {
    const a = inputs.get('A') || '0.0';
    const b = inputs.get('B') || '0.0';

    let operation = '+';
    switch (node.type) {
      case NodeTypes.MATH_ADD:
        operation = '+';
        break;
      case NodeTypes.MATH_SUBTRACT:
        operation = '-';
        break;
      case NodeTypes.MATH_MULTIPLY:
        operation = '*';
        break;
      case NodeTypes.MATH_DIVIDE:
        operation = '/';
        break;
    }

    return `(${a} ${operation} ${b})`;
  }

  /**
   * Generate RGB mix code
   */
  private generateMixRGB(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string {
    const blendType = node.properties.blend_type || 'MIX';
    const factor = inputs.get('Fac') || '0.5';
    const color1 = inputs.get('Color1') || 'vec3(0.0)';
    const color2 = inputs.get('Color2') || 'vec3(1.0)';

    switch (blendType) {
      case 'MIX':
        return `mix(${color1}, ${color2}, ${factor})`;
      case 'ADD':
        return `(${color1} + ${color2})`;
      case 'MULTIPLY':
        return `(${color1} * ${color2})`;
      case 'OVERLAY':
        return `overlay(${color1}, ${color2}, ${factor})`;
      default:
        return `mix(${color1}, ${color2}, ${factor})`;
    }
  }

  /**
   * Generate normal map processing code
   */
  private generateNormalMap(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string {
    const color = inputs.get('Color') || 'vec3(0.5, 0.5, 1.0)';
    const strength = node.properties.strength || 1.0;

    return `normalize(${color} * 2.0 - 1.0) * ${strength.toFixed(2)}`;
  }

  /**
   * Generate bump map processing code
   */
  private generateBump(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string {
    const height = inputs.get('Height') || '0.0';
    const normal = inputs.get('Normal') || 'vec3(0.0, 0.0, 1.0)';
    const strength = node.properties.strength || 1.0;
    const distance = node.properties.distance || 1.0;

    return `bump_normal(${height}, ${normal}, ${strength.toFixed(2)}, ${distance.toFixed(2)})`;
  }

  /**
   * Generate texture coordinate code
   */
  private generateTexCoord(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string {
    const generated = node.properties.generated || false;
    
    if (generated) {
      return 'vPosition';
    }
    return 'vUV';
  }

  /**
   * Generate constant value code
   */
  private generateConstant(
    node: NodeInstance,
    inputs: Map<string, string>,
    material: TranspiledMaterial
  ): string {
    if (node.type === NodeTypes.VALUE) {
      const value = node.properties.value ?? 0.0;
      return value.toFixed(6);
    } else if (node.type === NodeTypes.COLOR) {
      const color = node.properties.color ?? [1, 1, 1];
      return `vec3(${color[0].toFixed(3)}, ${color[1].toFixed(3)}, ${color[2].toFixed(3)})`;
    } else if (node.type === NodeTypes.VECTOR) {
      const vector = node.properties.vector ?? [0, 0, 0];
      return `vec3(${vector[0].toFixed(3)}, ${vector[1].toFixed(3)}, ${vector[2].toFixed(3)})`;
    }
    return '0.0';
  }

  /**
   * Convert JavaScript value to GLSL representation
   */
  private valueToGLSL(value: any, type: SocketType): string {
    if (value === null || value === undefined) {
      return type === SocketType.FLOAT ? '0.0' : 
             type === SocketType.VECTOR ? 'vec3(0.0)' : 
             type === SocketType.COLOR ? 'vec3(1.0)' : '0.0';
    }

    if (typeof value === 'number') {
      return value.toFixed(6);
    }

    if (Array.isArray(value)) {
      if (value.length === 3) {
        return `vec3(${value[0].toFixed(3)}, ${value[1].toFixed(3)}, ${value[2].toFixed(3)})`;
      } else if (value.length === 4) {
        return `vec4(${value[0].toFixed(3)}, ${value[1].toFixed(3)}, ${value[2].toFixed(3)}, ${value[3].toFixed(3)})`;
      } else if (value.length === 2) {
        return `vec2(${value[0].toFixed(3)}, ${value[1].toFixed(3)})`;
      }
    }

    return String(value);
  }

  /**
   * Find the output node in a group
   */
  private findOutputNode(group: NodeGroup): NodeInstance | null {
    for (const [nodeId, node] of group.nodes) {
      if (node.type === NodeTypes.OUTPUT_MATERIAL || 
          node.type === NodeTypes.OUTPUT_WORLD ||
          node.type.includes('OUTPUT')) {
        return node;
      }
    }
    return null;
  }

  /**
   * Find a node by its socket ID
   */
  private findNodeBySocketId(socketId: string, group: NodeGroup): NodeInstance | null {
    for (const [nodeId, node] of group.nodes) {
      for (const [socketName, socket] of node.outputs) {
        if (socket.id === socketId) {
          return node;
        }
      }
    }
    return null;
  }

  /**
   * Get variable name for a node
   */
  private getVariableForNode(nodeId: string): string {
    return this.shaderVariables.get(nodeId) || 'unknown';
  }

  /**
   * Generate complete shader code from transpiled material
   */
  generateShaderCode(material: TranspiledMaterial): { vertex: string; fragment: string } {
    const vertexHeader = `
      varying vec2 vUV;
      varying vec3 vPosition;
      varying vec3 vNormal;
      
      void main() {
        vUV = uv;
        vPosition = position;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentHeader = `
      varying vec2 vUV;
      varying vec3 vPosition;
      varying vec3 vNormal;
      
      uniform vec3 uBaseColor;
    `;

    let fragmentBody = '';
    for (const conn of material.connections) {
      if (conn.glslExpression) {
        fragmentBody += `    ${conn.glslExpression}\n`;
      }
    }

    const fragment = `
      ${fragmentHeader}
      
      void main() {
        ${fragmentBody}
        gl_FragColor = vec4(uBaseColor, 1.0);
      }
    `;

    return {
      vertex: vertexHeader,
      fragment: fragment,
    };
  }
}

export default NodeTranspiler;
