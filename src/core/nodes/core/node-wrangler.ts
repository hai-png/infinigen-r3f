/**
 * Node Wrangler - Core class for managing node graphs
 * Based on infinigen/core/nodes/node_wrangler.py
 * 
 * This class provides utilities for creating, connecting, and manipulating nodes
 * in a Three.js/R3F context, inspired by Blender's node system.
 */

import { NodeTypes } from './node-types';
import { SocketType, NodeSocket, SocketDefinition } from './socket-types';

export interface NodeDefinition {
  type: NodeTypes;
  inputs: SocketDefinition[];
  outputs: SocketDefinition[];
  properties?: Record<string, any>;
  defaultData?: any;
}

export interface NodeInstance {
  id: string;
  type: NodeTypes;
  name: string;
  location: [number, number];
  inputs: Map<string, NodeSocket>;
  outputs: Map<string, NodeSocket>;
  properties: Record<string, any>;
  hidden?: boolean;
  muted?: boolean;
  parent?: string; // Parent node group ID
}

export interface NodeLink {
  id: string;
  fromNode: string;
  fromSocket: string;
  toNode: string;
  toSocket: string;
}

export interface NodeGroup {
  id: string;
  name: string;
  nodes: Map<string, NodeInstance>;
  links: Map<string, NodeLink>;
  inputs: Map<string, NodeSocket>;
  outputs: Map<string, NodeSocket>;
  parent?: string; // Parent group ID for nested groups
}

export class NodeWrangler {

  private nodeGroups: Map<string, NodeGroup>;
  private activeGroup: string;
  private nodeCounter: number;
  private linkCounter: number;

  constructor(initialGroup?: NodeGroup) {
    this.nodeGroups = new Map();
    this.nodeCounter = 0;
    this.linkCounter = 0;

    if (initialGroup) {
      this.nodeGroups.set(initialGroup.id, initialGroup);
      this.activeGroup = initialGroup.id;
    } else {
      // Create default root group
      const rootGroup: NodeGroup = {
        id: 'root',
        name: 'Root',
        nodes: new Map(),
        links: new Map(),
        inputs: new Map(),
        outputs: new Map(),
      };
      this.nodeGroups.set('root', rootGroup);
      this.activeGroup = 'root';
    }
  }

  /**
   * Get the current active node group
   */
  getActiveGroup(): NodeGroup {
    const group = this.nodeGroups.get(this.activeGroup);
    if (!group) {
      throw new Error(`Active group "${this.activeGroup}" not found`);
    }
    return group;
  }

  /**
   * Set the active node group
   */
  setActiveGroup(groupId: string): void {
    if (!this.nodeGroups.has(groupId)) {
      throw new Error(`Node group "${groupId}" not found`);
    }
    this.activeGroup = groupId;
  }

  /**
   * Create a new node in the active group
   */
  newNode(
    type: NodeTypes,
    name?: string,
    location?: [number, number],
    properties?: Record<string, any>
  ): NodeInstance {
    const group = this.getActiveGroup();
    const nodeId = `node_${this.nodeCounter++}`;
    const nodeName = name || `${type}_${this.nodeCounter}`;

    const nodeDef = this.getNodeDefinition(type);
    
    const node: NodeInstance = {
      id: nodeId,
      type,
      name: nodeName,
      location: location || [0, 0],
      inputs: new Map(),
      outputs: new Map(),
      properties: properties || {},
    };

    // Initialize input sockets
    for (const inputDef of nodeDef.inputs) {
      const socket: NodeSocket = {
        id: `${nodeId}_in_${inputDef.name}`,
        name: inputDef.name,
        type: inputDef.type,
        value: inputDef.defaultValue,
        isInput: true,
        definition: inputDef,
      };
      node.inputs.set(inputDef.name, socket);
    }

    // Initialize output sockets
    for (const outputDef of nodeDef.outputs) {
      const socket: NodeSocket = {
        id: `${nodeId}_out_${outputDef.name}`,
        name: outputDef.name,
        type: outputDef.type,
        isInput: false,
        definition: outputDef,
      };
      node.outputs.set(outputDef.name, socket);
    }

    group.nodes.set(nodeId, node);
    return node;
  }

  /**
   * Connect two sockets
   */
  connect(
    fromNode: string | NodeInstance,
    fromSocket: string,
    toNode: string | NodeInstance,
    toSocket: string
  ): NodeLink {
    const fromNodeId = typeof fromNode === 'string' ? fromNode : fromNode.id;
    const toNodeId = typeof toNode === 'string' ? toNode : toNode.id;

    const group = this.getActiveGroup();
    const fromNodeInst = group.nodes.get(fromNodeId);
    const toNodeInst = group.nodes.get(toNodeId);

    if (!fromNodeInst) {
      throw new Error(`Source node "${fromNodeId}" not found`);
    }
    if (!toNodeInst) {
      throw new Error(`Target node "${toNodeId}" not found`);
    }

    const fromOutput = fromNodeInst.outputs.get(fromSocket);
    const toInput = toNodeInst.inputs.get(toSocket);

    if (!fromOutput) {
      throw new Error(`Output socket "${fromSocket}" not found on node "${fromNodeId}"`);
    }
    if (!toInput) {
      throw new Error(`Input socket "${toSocket}" not found on node "${toNodeId}"`);
    }

    // Validate socket type compatibility
    if (fromOutput.type !== toInput.type) {
      console.warn(
        `Type mismatch: connecting ${fromOutput.type} to ${toInput.type}. ` +
        `This may cause runtime errors.`
      );
    }

    // Remove existing connection to this input if any
    if (toInput.connectedTo) {
      this.disconnect(toNodeId, toSocket);
    }

    // Create link
    const linkId = `link_${this.linkCounter++}`;
    const link: NodeLink = {
      id: linkId,
      fromNode: fromNodeId,
      fromSocket,
      toNode: toNodeId,
      toSocket,
    };

    // Update socket connections
    toInput.connectedTo = fromOutput.id;
    fromOutput.connectedTo = toInput.id;

    group.links.set(linkId, link);
    return link;
  }

  /**
   * Disconnect a socket
   */
  disconnect(nodeId: string, socketName: string): void {
    const group = this.getActiveGroup();
    const node = group.nodes.get(nodeId);
    
    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    const socket = node.inputs.get(socketName) || node.outputs.get(socketName);
    if (!socket) {
      throw new Error(`Socket "${socketName}" not found on node "${nodeId}"`);
    }

    // Find and remove the link
    for (const [linkId, link] of group.links.entries()) {
      if (
        (link.toNode === nodeId && link.toSocket === socketName) ||
        (link.fromNode === nodeId && link.fromSocket === socketName)
      ) {
        // Clear socket connections
        const otherNodeId = link.toNode === nodeId ? link.fromNode : link.toNode;
        const otherSocketName = link.toNode === nodeId ? link.fromSocket : link.toSocket;
        const otherNode = group.nodes.get(otherNodeId);
        
        if (otherNode) {
          const otherSocket = otherNode.inputs.get(otherSocketName) || 
                             otherNode.outputs.get(otherSocketName);
          if (otherSocket) {
            otherSocket.connectedTo = undefined;
          }
        }

        if (socket.isInput) {
          socket.connectedTo = undefined;
        } else {
          socket.connectedTo = undefined;
        }

        group.links.delete(linkId);
        break;
      }
    }
  }

  /**
   * Create a node group (subgraph)
   */
  createNodeGroup(name: string): NodeGroup {
    const groupId = `group_${this.nodeCounter++}`;
    const group: NodeGroup = {
      id: groupId,
      name,
      nodes: new Map(),
      links: new Map(),
      inputs: new Map(),
      outputs: new Map(),
      parent: this.activeGroup,
    };

    this.nodeGroups.set(groupId, group);
    return group;
  }

  /**
   * Expose an input from a node group
   */
  exposeInput(groupId: string, nodeName: string, socketName: string, exposedName?: string): NodeSocket {
    const group = this.nodeGroups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const node = group.nodes.get(nodeName);
    if (!node) {
      throw new Error(`Node "${nodeName}" not found in group "${groupId}"`);
    }

    const socket = node.inputs.get(socketName);
    if (!socket) {
      throw new Error(`Input socket "${socketName}" not found on node "${nodeName}"`);
    }

    const exposedSocket: NodeSocket = {
      ...socket,
      id: `group_input_${exposedName || socketName}`,
      name: exposedName || socketName,
    };

    group.inputs.set(exposedSocket.name, exposedSocket);
    return exposedSocket;
  }

  /**
   * Expose an output from a node group
   */
  exposeOutput(groupId: string, nodeName: string, socketName: string, exposedName?: string): NodeSocket {
    const group = this.nodeGroups.get(groupId);
    if (!group) {
      throw new Error(`Group "${groupId}" not found`);
    }

    const node = group.nodes.get(nodeName);
    if (!node) {
      throw new Error(`Node "${nodeName}" not found in group "${groupId}"`);
    }

    const socket = node.outputs.get(socketName);
    if (!socket) {
      throw new Error(`Output socket "${socketName}" not found on node "${nodeName}"`);
    }

    const exposedSocket: NodeSocket = {
      ...socket,
      id: `group_output_${exposedName || socketName}`,
      name: exposedName || socketName,
    };

    group.outputs.set(exposedSocket.name, exposedSocket);
    return exposedSocket;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string, groupId?: string): NodeInstance {
    const group = groupId ? this.nodeGroups.get(groupId) : this.getActiveGroup();
    if (!group) {
      throw new Error(`Group "${groupId || this.activeGroup}" not found`);
    }

    const node = group.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    return node;
  }

  /**
   * Remove a node and its connections
   */
  removeNode(nodeId: string): void {
    const group = this.getActiveGroup();
    const node = group.nodes.get(nodeId);
    
    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    // Remove all connections
    for (const [socketName] of node.inputs) {
      this.disconnect(nodeId, socketName);
    }
    for (const [socketName] of node.outputs) {
      this.disconnect(nodeId, socketName);
    }

    group.nodes.delete(nodeId);
  }

  /**
   * Get node definition (stub - should be populated with actual definitions)
   */
  private getNodeDefinition(type: NodeTypes): NodeDefinition {
    // This is a stub implementation
    // In a full implementation, this would return detailed definitions
    // for each node type based on Three.js node capabilities
    
    return {
      type,
      inputs: [
        { name: 'Value', type: SocketType.FLOAT, defaultValue: 0 },
      ],
      outputs: [
        { name: 'Value', type: SocketType.FLOAT },
      ],
    };
  }

  /**
   * Add a node to the graph - convenience method matching Python API
   * Creates a node instance and adds it to the active group
   */
  addNode(nodeType: any, params?: Record<string, any>): NodeInstance {
    const properties = params || {};
    const node = this.newNode(nodeType, undefined, undefined, properties);
    
    // Apply params to node properties
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        node.properties[key] = value;
      }
    }
    
    return node;
  }

  /**
   * Link two node sockets together - convenience method matching Python API
   * Connects an output socket of one node to an input socket of another
   */
  link(
    fromNode: any,
    fromSocket: number | string,
    toNode: any,
    toSocket: number | string
  ): NodeLink {
    const fromNodeId = typeof fromNode === 'string' ? fromNode : fromNode.id;
    const toNodeId = typeof toNode === 'string' ? toNode : toNode.id;

    const group = this.getActiveGroup();
    const fromNodeInst = group.nodes.get(fromNodeId);
    const toNodeInst = group.nodes.get(toNodeId);

    if (!fromNodeInst) {
      throw new Error(`Source node "${fromNodeId}" not found`);
    }
    if (!toNodeInst) {
      throw new Error(`Target node "${toNodeId}" not found`);
    }

    // Resolve socket by index or name
    const fromSocketName = this.resolveSocketName(fromNodeInst.outputs, fromSocket, 'output');
    const toSocketName = this.resolveSocketName(toNodeInst.inputs, toSocket, 'input');

    return this.connect(fromNodeId, fromSocketName, toNodeId, toSocketName);
  }

  /**
   * Set the value of a node input
   */
  setInputValue(node: any, inputIndex: number | string, value: any): void {
    const nodeId = typeof node === 'string' ? node : node.id;
    const group = this.getActiveGroup();
    const nodeInst = group.nodes.get(nodeId);

    if (!nodeInst) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    const socketName = this.resolveSocketName(nodeInst.inputs, inputIndex, 'input');
    const socket = nodeInst.inputs.get(socketName);
    if (socket) {
      socket.value = value;
    } else {
      // Create the socket if it doesn't exist
      nodeInst.inputs.set(socketName, {
        id: `${nodeId}_in_${socketName}`,
        name: socketName,
        type: 'ANY',
        value,
        isInput: true,
      });
    }
  }

  /**
   * Find all nodes of a given type in the active group
   */
  findNodesByType(type: any): NodeInstance[] {
    const group = this.getActiveGroup();
    const typeStr = typeof type === 'string' ? type : String(type);
    const results: NodeInstance[] = [];

    for (const node of group.nodes.values()) {
      if (node.type === typeStr || String(node.type) === typeStr) {
        results.push(node);
      }
    }

    return results;
  }

  /**
   * Resolve a socket identifier (index or name) to a socket name
   */
  private resolveSocketName(
    sockets: Map<string, NodeSocket>,
    socketRef: number | string,
    direction: 'input' | 'output'
  ): string {
    if (typeof socketRef === 'string') {
      // If it's already a name, check if it exists
      if (sockets.has(socketRef)) {
        return socketRef;
      }
      // Try as a numeric index passed as string
      const numIdx = parseInt(socketRef, 10);
      if (!isNaN(numIdx)) {
        return this.getSocketByIndex(sockets, numIdx);
      }
      return socketRef;
    }

    // Numeric index
    return this.getSocketByIndex(sockets, socketRef);
  }

  /**
   * Get a socket name by its numeric index
   */
  private getSocketByIndex(sockets: Map<string, NodeSocket>, index: number): string {
    const keys = Array.from(sockets.keys());
    if (index >= 0 && index < keys.length) {
      return keys[index];
    }
    return String(index);
  }

  /**
   * Export node graph to JSON
   */
  toJSON(): string {
    const data = {
      groups: Array.from(this.nodeGroups.entries()).map(([id, group]) => ({
        id,
        name: group.name,
        parent: group.parent,
        nodes: Array.from(group.nodes.entries()).map(([nid, node]) => ({
          id: nid,
          type: node.type,
          name: node.name,
          location: node.location,
          properties: node.properties,
          inputs: Array.from(node.inputs.entries()).map(([name, socket]) => ({
            name,
            type: socket.type,
            value: socket.value,
            connectedTo: socket.connectedTo,
          })),
          outputs: Array.from(node.outputs.entries()).map(([name, socket]) => ({
            name,
            type: socket.type,
            connectedTo: socket.connectedTo,
          })),
        })),
        links: Array.from(group.links.values()),
        inputs: Array.from(group.inputs.entries()).map(([name, socket]) => ({
          name,
          type: socket.type,
        })),
        outputs: Array.from(group.outputs.entries()).map(([name, socket]) => ({
          name,
          type: socket.type,
        })),
      })),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import node graph from JSON
   */
  static fromJSON(json: string): NodeWrangler {
    const data = JSON.parse(json);
    const wrangler = new NodeWrangler();
    
    // Implementation would reconstruct the node graph from JSON
    // This is a stub for the basic structure
    
    return wrangler;
  }
}

/** Re-export NodeSocket from socket-types for convenience */
export { NodeSocket } from './socket-types';

/** Create a new NodeWrangler pre-configured for geometry node trees */
export function createGeometryNodeTree(): NodeWrangler {
  return new NodeWrangler();
}

/** Create a new NodeWrangler pre-configured for material node trees */
export function createMaterialNodeTree(): NodeWrangler {
  return new NodeWrangler();
}

export default NodeWrangler;
