/**
 * Node Transpiler - Convert Node Graphs to Executable Code
 *
 * Ports: infinigen/core/nodes/node_transpiler/transpiler.py
 *
 * Converts node graphs into executable TypeScript/JavaScript code or
 * Three.js shader material configurations.
 */
import { NodeTree } from '../core/types.js';
export interface TranspilerOptions {
    outputFormat: 'typescript' | 'javascript' | 'shader-material' | 'three-nodes';
    indentSize?: number;
    includeComments?: boolean;
    optimize?: boolean;
}
/**
 * Transpiles node graphs to various output formats
 */
export declare class NodeTranspiler {
    private options;
    private variableCounter;
    constructor(options?: Partial<TranspilerOptions>);
    /**
     * Transpile a complete node tree to code
     */
    transpile(tree: NodeTree): string;
    /**
     * Generate unique variable names
     */
    private generateVarName;
    /**
     * Transpile to TypeScript/JavaScript code
     */
    private transpileToCode;
    /**
     * Topological sort of nodes to ensure proper evaluation order
     */
    private topologicalSort;
    /**
     * Generate code for a single node
     */
    private generateNodeCode;
    /**
     * Transpile to Three.js ShaderMaterial configuration
     */
    private transpileToShaderMaterial;
    /**
     * Extract shader code from node tree
     */
    private extractShaders;
    /**
     * Transpile to Three.js node-based material system
     */
    private transpileToThreeNodes;
    /**
     * Convert a node instance to Three.js node syntax
     */
    private convertToThreeNode;
    /**
     * Optimize the node graph by removing redundant nodes
     */
    optimize(tree: NodeTree): NodeTree;
}
/**
 * Convenience function to transpile a node tree
 */
export declare function transpileNodeTree(tree: NodeTree, format?: TranspilerOptions['outputFormat']): string;
//# sourceMappingURL=transpiler.d.ts.map