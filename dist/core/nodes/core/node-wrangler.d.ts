/**
 * Node Wrangler - Core class for managing node graphs
 * Based on infinigen/core/nodes/node_wrangler.py
 *
 * This class provides utilities for creating, connecting, and manipulating nodes
 * in a Three.js/R3F context, inspired by Blender's node system.
 */
import { NodeTypes } from './node-types';
import { NodeSocket, SocketDefinition } from './socket-types';
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
    parent?: string;
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
    parent?: string;
}
export declare class NodeWrangler {
    private nodeGroups;
    private activeGroup;
    private nodeCounter;
    private linkCounter;
    constructor(initialGroup?: NodeGroup);
    /**
     * Get the current active node group
     */
    getActiveGroup(): NodeGroup;
    /**
     * Set the active node group
     */
    setActiveGroup(groupId: string): void;
    /**
     * Create a new node in the active group
     */
    newNode(type: NodeTypes, name?: string, location?: [number, number], properties?: Record<string, any>): NodeInstance;
    /**
     * Connect two sockets
     */
    connect(fromNode: string | NodeInstance, fromSocket: string, toNode: string | NodeInstance, toSocket: string): NodeLink;
    /**
     * Disconnect a socket
     */
    disconnect(nodeId: string, socketName: string): void;
    /**
     * Create a node group (subgraph)
     */
    createNodeGroup(name: string): NodeGroup;
    /**
     * Expose an input from a node group
     */
    exposeInput(groupId: string, nodeName: string, socketName: string, exposedName?: string): NodeSocket;
    /**
     * Expose an output from a node group
     */
    exposeOutput(groupId: string, nodeName: string, socketName: string, exposedName?: string): NodeSocket;
    /**
     * Get a node by ID
     */
    getNode(nodeId: string, groupId?: string): NodeInstance;
    /**
     * Remove a node and its connections
     */
    removeNode(nodeId: string): void;
    /**
     * Get node definition (stub - should be populated with actual definitions)
     */
    private getNodeDefinition;
    /**
     * Export node graph to JSON
     */
    toJSON(): string;
    /**
     * Import node graph from JSON
     */
    static fromJSON(json: string): NodeWrangler;
}
export default NodeWrangler;
//# sourceMappingURL=node-wrangler.d.ts.map