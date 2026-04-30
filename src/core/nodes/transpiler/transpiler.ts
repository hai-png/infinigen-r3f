/**
 * Node Transpiler - Convert Node Graphs to Executable Code
 * 
 * Ports: infinigen/core/nodes/node_transpiler/transpiler.py
 * 
 * Converts node graphs into executable TypeScript/JavaScript code or
 * Three.js shader material configurations.
 */

import {
  NodeType,
  NodeTree,
  NodeInstance,
  NodeLink,
  SocketType,
} from '../core/types';

export interface TranspilerOptions {
  outputFormat: 'typescript' | 'javascript' | 'shader-material' | 'three-nodes';
  indentSize?: number;
  includeComments?: boolean;
  optimize?: boolean;
}

const DEFAULT_OPTIONS: Required<TranspilerOptions> = {
  outputFormat: 'typescript',
  indentSize: 2,
  includeComments: true,
  optimize: true,
};

/**
 * Transpiles node graphs to various output formats
 */
export class NodeTranspiler {
  private options: Required<TranspilerOptions>;
  private variableCounter: number = 0;

  constructor(options: Partial<TranspilerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Transpile a complete node tree to code
   */
  transpile(tree: NodeTree): string {
    switch (this.options.outputFormat) {
      case 'typescript':
      case 'javascript':
        return this.transpileToCode(tree);
      case 'shader-material':
        return this.transpileToShaderMaterial(tree);
      case 'three-nodes':
        return this.transpileToThreeNodes(tree);
      default:
        throw new Error(`Unknown output format: ${this.options.outputFormat}`);
    }
  }

  /**
   * Generate unique variable names
   */
  private generateVarName(prefix: string = 'var'): string {
    return `${prefix}_${this.variableCounter++}`;
  }

  /**
   * Transpile to TypeScript/JavaScript code
   */
  private transpileToCode(tree: NodeTree): string {
    const lines: string[] = [];
    const varNames = new Map<string, string>();

    // Add header
    if (this.options.includeComments) {
      lines.push('// Auto-generated node graph code');
      lines.push(`// Tree: ${tree.name}`);
      lines.push(`// Type: ${tree.type}`);
      lines.push('');
    }

    // Sort nodes for proper ordering (inputs before outputs)
    const sortedNodes = this.topologicalSort(tree);

    // Generate code for each node
    sortedNodes.forEach(node => {
      const varName = this.generateVarName(node.type.toString());
      varNames.set(node.id, varName);

      if (this.options.includeComments) {
        lines.push(`// Node: ${node.name} (${node.type})`);
      }

      const nodeCode = this.generateNodeCode(node, varNames);
      if (nodeCode) {
        lines.push(nodeCode);
      }
    });

    // Generate link connections
    lines.push('');
    lines.push('// Connections');
    tree.links.forEach(link => {
      const fromVar = varNames.get(link.fromNode);
      const toVar = varNames.get(link.toNode);
      
      if (fromVar && toVar) {
        lines.push(`${toVar}.inputs["${link.toSocket}"] = ${fromVar}.outputs["${link.fromSocket}"];`);
      }
    });

    // Export/interface
    lines.push('');
    lines.push('// Interface');
    tree.interface.inputs.forEach((socket, name) => {
      lines.push(`export const input_${name} = ${socket.defaultValue ?? 'null'};`);
    });

    return lines.join('\n');
  }

  /**
   * Topological sort of nodes to ensure proper evaluation order
   */
  private topologicalSort(tree: NodeTree): NodeInstance[] {
    const visited = new Set<string>();
    const result: NodeInstance[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      // Visit all nodes that feed into this one first
      tree.links
        .filter(link => link.toNode === nodeId)
        .forEach(link => visit(link.fromNode));

      const node = tree.nodes.get(nodeId);
      if (node) {
        result.push(node);
      }
    };

    tree.nodes.forEach((_, nodeId) => visit(nodeId));
    return result;
  }

  /**
   * Generate code for a single node
   */
  private generateNodeCode(
    node: NodeInstance,
    varNames: Map<string, string>
  ): string {
    const varName = varNames.get(node.id) || 'unknown';

    switch (node.type) {
      case NodeType.Value:
        return `const ${varName} = { type: 'value', value: ${node.settings.value} };`;
      
      case NodeType.RGB:
        const color = node.settings.color || [1, 1, 1, 1];
        return `const ${varName} = { type: 'rgb', value: [${color.join(', ')}] };`;
      
      case NodeType.RandomValue:
        return `const ${varName} = { type: 'random', min: ${node.settings.min}, max: ${node.settings.max}, seed: ${node.settings.seed} };`;
      
      case NodeType.PrincipledBSDF:
        return `const ${varName} = { type: 'principled_bsdf', baseColor: ${JSON.stringify(node.settings.baseColor)}, roughness: ${node.settings.roughness}, metallic: ${node.settings.metallic} };`;
      
      case NodeType.NoiseTexture:
        return `const ${varName} = { type: 'noise_texture', scale: ${node.settings.scale ?? 5}, detail: ${node.settings.detail ?? 2} };`;
      
      case NodeType.ColorRamp:
        return `const ${varName} = { type: 'color_ramp', stops: ${JSON.stringify(node.settings.stops || [])} };`;
      
      case NodeType.Transform:
        return `const ${varName} = { type: 'transform', translation: ${JSON.stringify(node.settings.translation)}, rotation: ${JSON.stringify(node.settings.rotation)}, scale: ${JSON.stringify(node.settings.scale)} };`;
      
      case NodeType.GroupInput:
        return `const ${varName} = { type: 'group_input' };`;
      
      case NodeType.GroupOutput:
        return `const ${varName} = { type: 'group_output' };`;
      
      default:
        return `const ${varName} = { type: '${node.type}', settings: ${JSON.stringify(node.settings)} };`;
    }
  }

  /**
   * Transpile to Three.js ShaderMaterial configuration
   */
  private transpileToShaderMaterial(tree: NodeTree): string {
    const lines: string[] = [];
    
    lines.push('import * as THREE from "three";');
    lines.push('');
    lines.push(`// Shader Material: ${tree.name}`);
    lines.push('');

    // Extract vertex and fragment shaders from the node graph
    const { vertexShader, fragmentShader, uniforms } = this.extractShaders(tree);

    lines.push('const uniforms = {');
    Object.entries(uniforms).forEach(([name, value]) => {
      if (typeof value === 'number') {
        lines.push(`  ${name}: { value: ${value} },`);
      } else if (Array.isArray(value)) {
        lines.push(`  ${name}: { value: new THREE.Vector${value.length}(${value.join(', ')}) },`);
      } else {
        lines.push(`  ${name}: { value: ${JSON.stringify(value)} },`);
      }
    });
    lines.push('};');
    lines.push('');

    lines.push('const material = new THREE.ShaderMaterial({');
    lines.push('  uniforms,');
    lines.push('  vertexShader: `');
    lines.push(vertexShader);
    lines.push('`,');
    lines.push('  fragmentShader: `');
    lines.push(fragmentShader);
    lines.push('`,');
    lines.push('});');
    lines.push('');
    lines.push('export default material;');

    return lines.join('\n');
  }

  /**
   * Extract shader code from node tree
   */
  private extractShaders(tree: NodeTree): {
    vertexShader: string;
    fragmentShader: string;
    uniforms: Record<string, any>;
  } {
    const uniforms: Record<string, any> = {};
    let vertexShader = 'void main() {\n';
    let fragmentShader = 'void main() {\n';

    // Simple implementation - would need full node evaluation for complex graphs
    vertexShader += '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n';
    vertexShader += '  vUv = uv;\n';
    vertexShader += '}\n';

    fragmentShader += '  gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);\n';
    fragmentShader += '}\n';

    return { vertexShader, fragmentShader, uniforms };
  }

  /**
   * Transpile to Three.js node-based material system
   */
  private transpileToThreeNodes(tree: NodeTree): string {
    const lines: string[] = [];
    
    lines.push('import { Nodes } from "three/examples/jsm/nodes/Nodes";');
    lines.push('import * as THREE from "three";');
    lines.push('');
    lines.push(`// Node-based Material: ${tree.name}`);
    lines.push('');

    const nodeVars = new Map<string, string>();

    tree.nodes.forEach(node => {
      const varName = this.generateVarName('node');
      nodeVars.set(node.id, varName);

      const threeNode = this.convertToThreeNode(node);
      if (threeNode) {
        lines.push(`const ${varName} = ${threeNode};`);
      }
    });

    // Connect nodes
    tree.links.forEach(link => {
      const fromVar = nodeVars.get(link.fromNode);
      const toVar = nodeVars.get(link.toNode);
      
      if (fromVar && toVar) {
        lines.push(`${toVar}.${link.toSocket} = ${fromVar};`);
      }
    });

    lines.push('');
    lines.push('export const material = new THREE.MeshStandardNodeMaterial({');
    lines.push('  colorNode: outputNode,');
    lines.push('});');

    return lines.join('\n');
  }

  /**
   * Convert a node instance to Three.js node syntax
   */
  private convertToThreeNode(node: NodeInstance): string | null {
    switch (node.type) {
      case NodeType.Value:
        return `Nodes.constant(${node.settings.value})`;
      
      case NodeType.RGB:
        const color = node.settings.color || [1, 1, 1];
        return `Nodes.vec3(${color[0]}, ${color[1]}, ${color[2]})`;
      
      case NodeType.NoiseTexture:
        return `Nodes.noise()`;
      
      case NodeType.PrincipledBSDF:
        return `Nodes.standardMaterial()`;
      
      case NodeType.MixRGB:
        return `Nodes.mix()`;
      
      default:
        return null;
    }
  }

  /**
   * Optimize the node graph by removing redundant nodes
   */
  optimize(tree: NodeTree): NodeTree {
    if (!this.options.optimize) return tree;

    const optimized = { ...tree };
    optimized.nodes = new Map(tree.nodes);
    optimized.links = [...tree.links];

    // Remove pass-through nodes with single input/output
    const nodesToRemove: string[] = [];
    
    optimized.nodes.forEach((node, nodeId) => {
      const inputs = optimized.links.filter(l => l.toNode === nodeId);
      const outputs = optimized.links.filter(l => l.fromNode === nodeId);

      // Simple optimization: remove identity transforms
      if (node.type === NodeType.Transform) {
        const isIdentity = 
          JSON.stringify(node.settings.translation) === '[0,0,0]' &&
          JSON.stringify(node.settings.rotation) === '[0,0,0]' &&
          JSON.stringify(node.settings.scale) === '[1,1,1]';
        
        if (isIdentity && inputs.length === 1 && outputs.length === 1) {
          nodesToRemove.push(nodeId);
          // Reconnect input to output
          const inputLink = inputs[0];
          const outputLink = outputs[0];
          
          optimized.links = optimized.links.filter(
            l => l !== inputLink && l !== outputLink
          );
          
          optimized.links.push({
            fromNode: inputLink.fromNode,
            fromSocket: inputLink.fromSocket,
            toNode: outputLink.toNode,
            toSocket: outputLink.toSocket,
          });
        }
      }
    });

    nodesToRemove.forEach(id => optimized.nodes.delete(id));

    return optimized;
  }
}

/**
 * Convenience function to transpile a node tree
 */
export function transpileNodeTree(
  tree: NodeTree,
  format: TranspilerOptions['outputFormat'] = 'typescript'
): string {
  const transpiler = new NodeTranspiler({ outputFormat: format });
  return transpiler.transpile(tree);
}
