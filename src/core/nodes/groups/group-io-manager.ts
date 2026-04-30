/**
 * Group Input/Output Manager for Node System
 * 
 * Manages group input/output sockets for node graph encapsulation,
 * supporting nested groups and socket remapping.
 * 
 * Based on infinigen/core/nodes/node_wrangler.py group management
 */

import { NodeWrangler, NodeGroup, NodeSocket, NodeInstance } from '../core/node-wrangler';
import { SocketType, SocketDefinition } from '../core/socket-types';
import { NodeTypes } from '../core/node-types';

/**
 * Represents a group input/output socket
 */
export interface GroupSocket {
  id: string;
  name: string;
  socketType: SocketType;
  direction: 'input' | 'output';
  groupId: string;
  internalLink?: {
    nodeId: string;
    socketName: string;
    isInput: boolean;
  };
  defaultValue?: any;
  min?: number;
  max?: number;
}

/**
 * Group IO Manager class
 */
export class GroupIOManager {
  private wrangler: NodeWrangler;
  private groupSockets: Map<string, Map<string, GroupSocket>>; // groupId -> socketName -> socket

  constructor(wrangler: NodeWrangler) {
    this.wrangler = wrangler;
    this.groupSockets = new Map();
  }

  /**
   * Create a new node group with input/output management
   */
  createGroup(name: string, parentId?: string): NodeGroup {
    const group: NodeGroup = {
      id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      nodes: new Map(),
      links: new Map(),
      inputs: new Map(),
      outputs: new Map(),
      parent: parentId
    };

    const groups = (this.wrangler as any).nodeGroups as Map<string, NodeGroup>;
    groups.set(group.id, group);
    this.groupSockets.set(group.id, new Map());

    return group;
  }

  /**
   * Add an input socket to a group
   */
  addGroupInput(
    groupId: string,
    name: string,
    socketType: SocketType,
    defaultValue?: any
  ): GroupSocket {
    const group = this.getGroup(groupId);
    const socketId = `input_${name}`;

    const groupSocket: GroupSocket = {
      id: socketId,
      name,
      socketType,
      direction: 'input',
      groupId,
      defaultValue
    };

    // Store in group sockets map
    const sockets = this.groupSockets.get(groupId) || new Map();
    sockets.set(socketId, groupSocket);
    this.groupSockets.set(groupId, sockets);

    // Add to group inputs
    const socket: NodeSocket = {
      id: socketId,
      name,
      type: socketType,
      value: defaultValue,
      links: []
    };
    group.inputs.set(name, socket);

    return groupSocket;
  }

  /**
   * Add an output socket to a group
   */
  addGroupOutput(
    groupId: string,
    name: string,
    socketType: SocketType
  ): GroupSocket {
    const group = this.getGroup(groupId);
    const socketId = `output_${name}`;

    const groupSocket: GroupSocket = {
      id: socketId,
      name,
      socketType,
      direction: 'output',
      groupId
    };

    // Store in group sockets map
    const sockets = this.groupSockets.get(groupId) || new Map();
    sockets.set(socketId, groupSocket);
    this.groupSockets.set(groupId, sockets);

    // Add to group outputs
    const socket: NodeSocket = {
      id: socketId,
      name,
      type: socketType,
      value: undefined,
      links: []
    };
    group.outputs.set(name, socket);

    return groupSocket;
  }

  /**
   * Link a group input to an internal node's input
   */
  linkGroupInputToNode(
    groupId: string,
    inputName: string,
    targetNodeId: string,
    targetSocketName: string
  ): void {
    const groupSocket = this.getGroupSocket(groupId, `input_${inputName}`);
    const group = this.getGroup(groupId);

    groupSocket.internalLink = {
      nodeId: targetNodeId,
      socketName: targetSocketName,
      isInput: true
    };

    // Create link between group input and node
    const node = group.nodes.get(targetNodeId);
    if (!node) {
      throw new Error(`Node ${targetNodeId} not found in group ${groupId}`);
    }

    const targetSocket = node.inputs.get(targetSocketName);
    if (!targetSocket) {
      throw new Error(`Socket ${targetSocketName} not found on node ${targetNodeId}`);
    }

    // Propagate type and default value
    targetSocket.type = groupSocket.socketType;
    if (groupSocket.defaultValue !== undefined) {
      targetSocket.value = groupSocket.defaultValue;
    }
  }

  /**
   * Link an internal node's output to a group output
   */
  linkNodeToGroupOutput(
    groupId: string,
    sourceNodeId: string,
    sourceSocketName: string,
    outputName: string
  ): void {
    const groupSocket = this.getGroupSocket(groupId, `output_${outputName}`);
    const group = this.getGroup(groupId);

    groupSocket.internalLink = {
      nodeId: sourceNodeId,
      socketName: sourceSocketName,
      isInput: false
    };

    // Get source node output
    const node = group.nodes.get(sourceNodeId);
    if (!node) {
      throw new Error(`Node ${sourceNodeId} not found in group ${groupId}`);
    }

    const sourceSocket = node.outputs.get(sourceSocketName);
    if (!sourceSocket) {
      throw new Error(`Socket ${sourceSocketName} not found on node ${sourceNodeId}`);
    }

    // Infer output type from source
    groupSocket.socketType = sourceSocket.type;
  }

  /**
   * Expose an existing node socket as a group input
   */
  exposeAsGroupInput(
    groupId: string,
    nodeId: string,
    socketName: string,
    exposedName?: string
  ): GroupSocket {
    const group = this.getGroup(groupId);
    const node = group.nodes.get(nodeId);
    
    if (!node) {
      throw new Error(`Node ${nodeId} not found in group ${groupId}`);
    }

    const socket = node.inputs.get(socketName);
    if (!socket) {
      throw new Error(`Input socket ${socketName} not found on node ${nodeId}`);
    }

    const name = exposedName || socketName;
    const groupSocket = this.addGroupInput(groupId, name, socket.type, socket.value);
    
    this.linkGroupInputToNode(groupId, name, nodeId, socketName);

    return groupSocket;
  }

  /**
   * Expose an existing node socket as a group output
   */
  exposeAsGroupOutput(
    groupId: string,
    nodeId: string,
    socketName: string,
    exposedName?: string
  ): GroupSocket {
    const group = this.getGroup(groupId);
    const node = group.nodes.get(nodeId);
    
    if (!node) {
      throw new Error(`Node ${nodeId} not found in group ${groupId}`);
    }

    const socket = node.outputs.get(socketName);
    if (!socket) {
      throw new Error(`Output socket ${socketName} not found on node ${nodeId}`);
    }

    const name = exposedName || socketName;
    const groupSocket = this.addGroupOutput(groupId, name, socket.type);
    
    this.linkNodeToGroupOutput(groupId, nodeId, socketName, name);

    return groupSocket;
  }

  /**
   * Get all inputs for a group
   */
  getGroupInputs(groupId: string): GroupSocket[] {
    const sockets = this.groupSockets.get(groupId) || new Map();
    return Array.from(sockets.values()).filter(s => s.direction === 'input');
  }

  /**
   * Get all outputs for a group
   */
  getGroupOutputs(groupId: string): GroupSocket[] {
    const sockets = this.groupSockets.get(groupId) || new Map();
    return Array.from(sockets.values()).filter(s => s.direction === 'output');
  }

  /**
   * Remove a group input
   */
  removeGroupInput(groupId: string, inputName: string): void {
    const group = this.getGroup(groupId);
    const socketId = `input_${inputName}`;
    
    group.inputs.delete(inputName);
    const sockets = this.groupSockets.get(groupId);
    if (sockets) {
      sockets.delete(socketId);
    }
  }

  /**
   * Remove a group output
   */
  removeGroupOutput(groupId: string, outputName: string): void {
    const group = this.getGroup(groupId);
    const socketId = `output_${outputName}`;
    
    group.outputs.delete(outputName);
    const sockets = this.groupSockets.get(groupId);
    if (sockets) {
      sockets.delete(socketId);
    }
  }

  /**
   * Rename a group input
   */
  renameGroupInput(groupId: string, oldName: string, newName: string): void {
    const group = this.getGroup(groupId);
    const sockets = this.groupSockets.get(groupId);
    
    const oldSocket = group.inputs.get(oldName);
    if (!oldSocket) {
      throw new Error(`Input ${oldName} not found in group ${groupId}`);
    }

    // Update group inputs
    group.inputs.delete(oldName);
    oldSocket.name = newName;
    oldSocket.id = `input_${newName}`;
    group.inputs.set(newName, oldSocket);

    // Update sockets map
    if (sockets) {
      const oldGroupSocket = sockets.get(`input_${oldName}`);
      if (oldGroupSocket) {
        oldGroupSocket.name = newName;
        oldGroupSocket.id = `input_${newName}`;
        sockets.delete(`input_${oldName}`);
        sockets.set(`input_${newName}`, oldGroupSocket);
      }
    }
  }

  /**
   * Get nested group hierarchy
   */
  getGroupHierarchy(groupId: string): NodeGroup[] {
    const hierarchy: NodeGroup[] = [];
    let currentGroup = this.getGroup(groupId);
    
    while (currentGroup) {
      hierarchy.unshift(currentGroup);
      if (currentGroup.parent) {
        currentGroup = this.getGroup(currentGroup.parent);
      } else {
        break;
      }
    }
    
    return hierarchy;
  }

  /**
   * Validate group IO connections
   */
  validateGroupIO(groupId: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const group = this.getGroup(groupId);
    const sockets = this.groupSockets.get(groupId) || new Map();

    // Check all inputs have valid internal links
    for (const [name, socket] of group.inputs) {
      const groupSocket = sockets.get(`input_${name}`);
      if (groupSocket && !groupSocket.internalLink) {
        errors.push(`Group input "${name}" has no internal connection`);
      }
    }

    // Check all outputs have valid internal links
    for (const [name, socket] of group.outputs) {
      const groupSocket = sockets.get(`output_${name}`);
      if (groupSocket && !groupSocket.internalLink) {
        errors.push(`Group output "${name}" has no internal connection`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export group IO configuration to JSON
   */
  exportGroupIO(groupId: string): Record<string, any> {
    const group = this.getGroup(groupId);
    const inputs = this.getGroupInputs(groupId);
    const outputs = this.getGroupOutputs(groupId);

    return {
      groupId: group.id,
      groupName: group.name,
      inputs: inputs.map(s => ({
        name: s.name,
        type: s.socketType,
        defaultValue: s.defaultValue,
        linkedNode: s.internalLink?.nodeId,
        linkedSocket: s.internalLink?.socketName
      })),
      outputs: outputs.map(s => ({
        name: s.name,
        type: s.socketType,
        linkedNode: s.internalLink?.nodeId,
        linkedSocket: s.internalLink?.socketName
      }))
    };
  }

  /**
   * Import group IO configuration from JSON
   */
  importGroupIO(config: Record<string, any>): string {
    const groupId = this.createGroup(config.groupName).id;

    // Restore inputs
    for (const input of config.inputs || []) {
      const groupSocket = this.addGroupInput(
        groupId,
        input.name,
        input.type as SocketType,
        input.defaultValue
      );
      
      if (input.linkedNode && input.linkedSocket) {
        groupSocket.internalLink = {
          nodeId: input.linkedNode,
          socketName: input.linkedSocket,
          isInput: true
        };
      }
    }

    // Restore outputs
    for (const output of config.outputs || []) {
      const groupSocket = this.addGroupOutput(
        groupId,
        output.name,
        output.type as SocketType
      );
      
      if (output.linkedNode && output.linkedSocket) {
        groupSocket.internalLink = {
          nodeId: output.linkedNode,
          socketName: output.linkedSocket,
          isInput: false
        };
      }
    }

    return groupId;
  }

  /**
   * Get a group by ID
   */
  private getGroup(groupId: string): NodeGroup {
    const groups = (this.wrangler as any).nodeGroups as Map<string, NodeGroup>;
    const group = groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }
    return group;
  }

  /**
   * Get a group socket by ID
   */
  private getGroupSocket(groupId: string, socketId: string): GroupSocket {
    const sockets = this.groupSockets.get(groupId) || new Map();
    const socket = sockets.get(socketId);
    if (!socket) {
      throw new Error(`Group socket ${socketId} not found in group ${groupId}`);
    }
    return socket;
  }
}

/**
 * Create a group IO manager instance
 */
export function createGroupIOManager(wrangler: NodeWrangler): GroupIOManager {
  return new GroupIOManager(wrangler);
}
