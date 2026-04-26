/**
 * Group Input/Output Manager for Node System
 *
 * Manages group input/output sockets for node graph encapsulation,
 * supporting nested groups and socket remapping.
 *
 * Based on infinigen/core/nodes/node_wrangler.py group management
 */
/**
 * Group IO Manager class
 */
export class GroupIOManager {
    constructor(wrangler) {
        this.wrangler = wrangler;
        this.groupSockets = new Map();
    }
    /**
     * Create a new node group with input/output management
     */
    createGroup(name, parentId) {
        const group = {
            id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            nodes: new Map(),
            links: new Map(),
            inputs: new Map(),
            outputs: new Map(),
            parent: parentId
        };
        const groups = this.wrangler.nodeGroups;
        groups.set(group.id, group);
        this.groupSockets.set(group.id, new Map());
        return group;
    }
    /**
     * Add an input socket to a group
     */
    addGroupInput(groupId, name, socketType, defaultValue) {
        const group = this.getGroup(groupId);
        const socketId = `input_${name}`;
        const groupSocket = {
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
        const socket = {
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
    addGroupOutput(groupId, name, socketType) {
        const group = this.getGroup(groupId);
        const socketId = `output_${name}`;
        const groupSocket = {
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
        const socket = {
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
    linkGroupInputToNode(groupId, inputName, targetNodeId, targetSocketName) {
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
    linkNodeToGroupOutput(groupId, sourceNodeId, sourceSocketName, outputName) {
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
    exposeAsGroupInput(groupId, nodeId, socketName, exposedName) {
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
    exposeAsGroupOutput(groupId, nodeId, socketName, exposedName) {
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
    getGroupInputs(groupId) {
        const sockets = this.groupSockets.get(groupId) || new Map();
        return Array.from(sockets.values()).filter(s => s.direction === 'input');
    }
    /**
     * Get all outputs for a group
     */
    getGroupOutputs(groupId) {
        const sockets = this.groupSockets.get(groupId) || new Map();
        return Array.from(sockets.values()).filter(s => s.direction === 'output');
    }
    /**
     * Remove a group input
     */
    removeGroupInput(groupId, inputName) {
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
    removeGroupOutput(groupId, outputName) {
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
    renameGroupInput(groupId, oldName, newName) {
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
    getGroupHierarchy(groupId) {
        const hierarchy = [];
        let currentGroup = this.getGroup(groupId);
        while (currentGroup) {
            hierarchy.unshift(currentGroup);
            if (currentGroup.parent) {
                currentGroup = this.getGroup(currentGroup.parent);
            }
            else {
                break;
            }
        }
        return hierarchy;
    }
    /**
     * Validate group IO connections
     */
    validateGroupIO(groupId) {
        const errors = [];
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
    exportGroupIO(groupId) {
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
    importGroupIO(config) {
        const groupId = this.createGroup(config.groupName).id;
        // Restore inputs
        for (const input of config.inputs || []) {
            const groupSocket = this.addGroupInput(groupId, input.name, input.type, input.defaultValue);
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
            const groupSocket = this.addGroupOutput(groupId, output.name, output.type);
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
    getGroup(groupId) {
        const groups = this.wrangler.nodeGroups;
        const group = groups.get(groupId);
        if (!group) {
            throw new Error(`Group ${groupId} not found`);
        }
        return group;
    }
    /**
     * Get a group socket by ID
     */
    getGroupSocket(groupId, socketId) {
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
export function createGroupIOManager(wrangler) {
    return new GroupIOManager(wrangler);
}
//# sourceMappingURL=group-io-manager.js.map