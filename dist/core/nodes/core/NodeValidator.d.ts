/**
 * Node Validation System
 * Validates node connections, socket compatibility, and graph integrity
 */
import { NodeType, SocketType, NodeTree } from './types';
export interface ValidationError {
    nodeId: string;
    socketId: string;
    error: string;
    severity: 'error' | 'warning';
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
}
export declare class NodeValidator {
    /**
     * Validate a single node tree
     */
    validateTree(tree: NodeTree): ValidationResult;
    /**
     * Validate a single node
     */
    validateNode(node: NodeType, tree: NodeTree): ValidationResult;
    /**
     * Validate a link between nodes
     */
    private validateLink;
    /**
     * Validate output link compatibility
     */
    private validateOutputLink;
    /**
     * Check if socket types are compatible
     */
    areSocketsCompatible(sourceType: SocketType, targetType: SocketType): boolean;
    /**
     * Detect cycles in the node graph using DFS
     */
    detectCycles(tree: NodeTree): {
        hasCycle: boolean;
        nodeId?: string;
        path?: string[];
    };
    /**
     * Check for unconnected required inputs
     */
    checkRequiredInputs(node: NodeType, tree: NodeTree): ValidationResult;
    /**
     * Validate node type exists in registry
     */
    validateNodeType(nodeType: string, registeredTypes: string[]): boolean;
    /**
     * Get all nodes that depend on a given node
     */
    getDependentNodes(nodeId: string, tree: NodeTree): string[];
    /**
     * Get all nodes that a given node depends on
     */
    getDependencies(nodeId: string, tree: NodeTree): string[];
    /**
     * Topological sort of nodes for execution order
     */
    topologicalSort(tree: NodeTree): string[];
}
export declare const nodeValidator: NodeValidator;
//# sourceMappingURL=NodeValidator.d.ts.map