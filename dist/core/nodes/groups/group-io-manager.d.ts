/**
 * Group Input/Output Manager for Node System
 *
 * Manages group input/output sockets for node graph encapsulation,
 * supporting nested groups and socket remapping.
 *
 * Based on infinigen/core/nodes/node_wrangler.py group management
 */
import { NodeWrangler, NodeGroup } from '../core/node-wrangler';
import { SocketType } from '../core/socket-types';
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
export declare class GroupIOManager {
    private wrangler;
    private groupSockets;
    constructor(wrangler: NodeWrangler);
    /**
     * Create a new node group with input/output management
     */
    createGroup(name: string, parentId?: string): NodeGroup;
    /**
     * Add an input socket to a group
     */
    addGroupInput(groupId: string, name: string, socketType: SocketType, defaultValue?: any): GroupSocket;
    /**
     * Add an output socket to a group
     */
    addGroupOutput(groupId: string, name: string, socketType: SocketType): GroupSocket;
    /**
     * Link a group input to an internal node's input
     */
    linkGroupInputToNode(groupId: string, inputName: string, targetNodeId: string, targetSocketName: string): void;
    /**
     * Link an internal node's output to a group output
     */
    linkNodeToGroupOutput(groupId: string, sourceNodeId: string, sourceSocketName: string, outputName: string): void;
    /**
     * Expose an existing node socket as a group input
     */
    exposeAsGroupInput(groupId: string, nodeId: string, socketName: string, exposedName?: string): GroupSocket;
    /**
     * Expose an existing node socket as a group output
     */
    exposeAsGroupOutput(groupId: string, nodeId: string, socketName: string, exposedName?: string): GroupSocket;
    /**
     * Get all inputs for a group
     */
    getGroupInputs(groupId: string): GroupSocket[];
    /**
     * Get all outputs for a group
     */
    getGroupOutputs(groupId: string): GroupSocket[];
    /**
     * Remove a group input
     */
    removeGroupInput(groupId: string, inputName: string): void;
    /**
     * Remove a group output
     */
    removeGroupOutput(groupId: string, outputName: string): void;
    /**
     * Rename a group input
     */
    renameGroupInput(groupId: string, oldName: string, newName: string): void;
    /**
     * Get nested group hierarchy
     */
    getGroupHierarchy(groupId: string): NodeGroup[];
    /**
     * Validate group IO connections
     */
    validateGroupIO(groupId: string): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Export group IO configuration to JSON
     */
    exportGroupIO(groupId: string): Record<string, any>;
    /**
     * Import group IO configuration from JSON
     */
    importGroupIO(config: Record<string, any>): string;
    /**
     * Get a group by ID
     */
    private getGroup;
    /**
     * Get a group socket by ID
     */
    private getGroupSocket;
}
/**
 * Create a group IO manager instance
 */
export declare function createGroupIOManager(wrangler: NodeWrangler): GroupIOManager;
export { GroupIOManager };
//# sourceMappingURL=group-io-manager.d.ts.map