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

export default NodeWrangler;
