/**
 * Node Validation System
 * Validates node connections, socket compatibility, and graph integrity
 */

import { NodeType, SocketType, NodeSocket, NodeTree, NodeInstance } from './types';

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

/**
 * Socket type compatibility matrix
 * Defines which socket types can be connected to each other
 */
const SOCKET_COMPATIBILITY: Partial<Record<SocketType, SocketType[]>> = {
  [SocketType.GEOMETRY]: [SocketType.GEOMETRY],
  [SocketType.MATERIAL]: [SocketType.MATERIAL],
  [SocketType.TEXTURE]: [SocketType.TEXTURE],
  [SocketType.VECTOR]: [SocketType.VECTOR, SocketType.COLOR],
  [SocketType.COLOR]: [SocketType.COLOR, SocketType.VECTOR, SocketType.FLOAT, SocketType.INT],
  [SocketType.FLOAT]: [SocketType.FLOAT, SocketType.INT, SocketType.COLOR, SocketType.VECTOR],
  [SocketType.INT]: [SocketType.INT, SocketType.FLOAT],
  [SocketType.BOOLEAN]: [SocketType.BOOLEAN],
  [SocketType.STRING]: [SocketType.STRING],
  [SocketType.OBJECT]: [SocketType.OBJECT],
  [SocketType.COLLECTION]: [SocketType.COLLECTION],
  [SocketType.CAMERA]: [SocketType.CAMERA],
  [SocketType.LIGHT]: [SocketType.LIGHT],
  [SocketType.CURVE]: [SocketType.CURVE],
  [SocketType.VOLUME]: [SocketType.VOLUME],
};

export class NodeValidator {
  /**
   * Validate a single node tree
   */
  validateTree(tree: NodeTree): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check for duplicate node IDs
    const nodeIds = new Set<string>();
    for (const [id, node] of tree.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push({
          nodeId: node.id,
          socketId: '',
          error: `Duplicate node ID: ${node.id}`,
          severity: 'error',
        });
      }
      nodeIds.add(node.id);
    }

    // Validate each node
    for (const [id, node] of tree.nodes) {
      const nodeResult = this.validateNode(node, tree);
      errors.push(...nodeResult.errors);
      warnings.push(...nodeResult.warnings);
    }

    // Check for cycles
    const cycleResult = this.detectCycles(tree);
    if (cycleResult.hasCycle) {
      errors.push({
        nodeId: cycleResult.nodeId || '',
        socketId: '',
        error: `Circular dependency detected: ${cycleResult.path?.join(' → ')}`,
        severity: 'error',
      });
    }

    // Check for unconnected required inputs
    for (const [id, node] of tree.nodes) {
      const unconnectedResult = this.checkRequiredInputs(node, tree);
      errors.push(...unconnectedResult.errors);
      warnings.push(...unconnectedResult.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a single node
   */
  validateNode(node: NodeInstance, tree: NodeTree): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Validate input sockets
    for (const [socketName, inputValue] of node.inputs) {
      if (inputValue && typeof inputValue === 'object' && inputValue.link) {
        const linkValidation = this.validateLink(inputValue.link, tree, node.id);
        errors.push(...linkValidation.errors);
        warnings.push(...linkValidation.warnings);
      }
    }

    // Validate output sockets
    for (const [socketName, outputValue] of node.outputs) {
      if (outputValue && typeof outputValue === 'object' && outputValue.links && outputValue.links.length > 0) {
        for (const link of outputValue.links) {
          const linkValidation = this.validateOutputLink(link, tree, node.id);
          errors.push(...linkValidation.errors);
          warnings.push(...linkValidation.warnings);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate a link between nodes
   */
  private validateLink(
    link: { fromNode: string; fromSocket: string },
    tree: NodeTree,
    targetNodeId: string
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const sourceNode = Array.from(tree.nodes.values()).find(n => n.id === link.fromNode);
    if (!sourceNode) {
      errors.push({
        nodeId: targetNodeId,
        socketId: link.fromSocket,
        error: `Linked node not found: ${link.fromNode}`,
        severity: 'error',
      });
      return { valid: false, errors, warnings };
    }

    const sourceOutput = Array.from(sourceNode.outputs.values()).find((o: any) => o.identifier === link.fromSocket);
    if (!sourceOutput) {
      errors.push({
        nodeId: targetNodeId,
        socketId: link.fromSocket,
        error: `Output socket not found: ${link.fromSocket} on node ${sourceNode.name}`,
        severity: 'error',
      });
      return { valid: false, errors, warnings };
    }

    return { valid: true, errors, warnings };
  }

  /**
   * Validate output link compatibility
   */
  private validateOutputLink(
    link: { toNode: string; toSocket: string },
    tree: NodeTree,
    sourceNodeId: string
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const targetNode = Array.from(tree.nodes.values()).find(n => n.id === link.toNode);
    if (!targetNode) {
      errors.push({
        nodeId: sourceNodeId,
        socketId: link.toSocket,
        error: `Target node not found: ${link.toNode}`,
        severity: 'error',
      });
      return { valid: false, errors, warnings };
    }

    const targetInput = Array.from(targetNode.inputs.values()).find((i: any) => i.identifier === link.toSocket);
    if (!targetInput) {
      errors.push({
        nodeId: sourceNodeId,
        socketId: link.toSocket,
        error: `Input socket not found: ${link.toSocket} on node ${targetNode.name}`,
        severity: 'error',
      });
      return { valid: false, errors, warnings };
    }

    return { valid: true, errors, warnings };
  }

  /**
   * Check if socket types are compatible
   */
  areSocketsCompatible(sourceType: SocketType, targetType: SocketType): boolean {
    const compatibleTypes = SOCKET_COMPATIBILITY[sourceType] || [];
    return compatibleTypes.includes(targetType);
  }

  /**
   * Detect cycles in the node graph using DFS
   */
  detectCycles(tree: NodeTree): { hasCycle: boolean; nodeId?: string; path?: string[] } {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const parentMap = new Map<string, string>();

    const dfs = (nodeId: string, path: string[]): boolean | { hasCycle: boolean; nodeId: string; path: string[] } => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = Array.from(tree.nodes.values()).find(n => n.id === nodeId);
      if (!node) return false;

      // Check all input links (dependencies)
      for (const [socketName, inputValue] of node.inputs) {
        if (inputValue && typeof inputValue === 'object' && inputValue.link) {
          const neighborId = inputValue.link.fromNode;
          
          if (!visited.has(neighborId)) {
            parentMap.set(neighborId, nodeId);
            const newPath = [...path, neighborId];
            const result = dfs(neighborId, newPath);
            if (result !== false) {
              return result;
            }
          } else if (recursionStack.has(neighborId)) {
            // Found cycle
            const cycleStart = path.indexOf(neighborId);
            const cyclePath = path.slice(cycleStart);
            cyclePath.push(neighborId);
            return { hasCycle: true, nodeId, path: cyclePath };
          }
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const [id, node] of tree.nodes) {
      if (!visited.has(node.id)) {
        const result = dfs(node.id, [node.id]);
        if (result !== false) {
          return result;
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Check for unconnected required inputs
   */
  checkRequiredInputs(node: NodeInstance, tree: NodeTree): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    for (const [socketName, inputValue] of node.inputs) {
      const input = inputValue as any;
      // Skip if input has a default value or is linked
      if (input.value !== undefined || input.link) {
        continue;
      }

      // Check if input is marked as required
      if (input.required) {
        errors.push({
          nodeId: node.id,
          socketId: input.identifier || socketName,
          error: `Required input "${input.name || socketName}" is not connected`,
          severity: 'error',
        });
      } else if (!input.optional) {
        warnings.push({
          nodeId: node.id,
          socketId: input.identifier || socketName,
          error: `Input "${input.name || socketName}" has no value or connection`,
          severity: 'warning',
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate node type exists in registry
   */
  validateNodeType(nodeType: string, registeredTypes: string[]): boolean {
    return registeredTypes.includes(nodeType);
  }

  /**
   * Get all nodes that depend on a given node
   */
  getDependentNodes(nodeId: string, tree: NodeTree): string[] {
    const dependents: string[] = [];

    for (const [id, node] of tree.nodes) {
      for (const [socketName, inputValue] of node.inputs) {
        if (inputValue && typeof inputValue === 'object' && (inputValue as any).link && (inputValue as any).link.fromNode === nodeId) {
          dependents.push(node.id);
          break;
        }
      }
    }

    return dependents;
  }

  /**
   * Get all nodes that a given node depends on
   */
  getDependencies(nodeId: string, tree: NodeTree): string[] {
    const dependencies: string[] = [];
    const node = Array.from(tree.nodes.values()).find(n => n.id === nodeId);
    
    if (!node) return dependencies;

    for (const [socketName, inputValue] of node.inputs) {
      if (inputValue && typeof inputValue === 'object' && (inputValue as any).link) {
        dependencies.push((inputValue as any).link.fromNode);
      }
    }

    return dependencies;
  }

  /**
   * Topological sort of nodes for execution order
   */
  topologicalSort(tree: NodeTree): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const tempMark = new Set<string>();

    const visit = (nodeId: string): boolean => {
      if (tempMark.has(nodeId)) {
        return false; // Cycle detected
      }
      if (visited.has(nodeId)) {
        return true;
      }

      tempMark.add(nodeId);
      
      const node = Array.from(tree.nodes.values()).find(n => n.id === nodeId);
      if (node) {
        for (const [socketName, inputValue] of node.inputs) {
          if (inputValue && typeof inputValue === 'object' && (inputValue as any).link) {
            if (!visit((inputValue as any).link.fromNode)) {
              return false;
            }
          }
        }
      }

      tempMark.delete(nodeId);
      visited.add(nodeId);
      sorted.push(nodeId);
      return true;
    };

    for (const [id, node] of tree.nodes) {
      if (!visited.has(node.id)) {
        if (!visit(node.id)) {
          throw new Error('Cannot sort: graph contains a cycle');
        }
      }
    }

    return sorted;
  }
}

export const nodeValidator = new NodeValidator();
