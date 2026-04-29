/**
 * Node Serializer
 *
 * Serializes and deserializes node graphs to/from JSON format
 * Enables saving/loading node setups and sharing between sessions
 */
import { NodeTree, NodeInstance, NodeLink } from './types';
export interface SerializedNode {
    id: string;
    type: string;
    name: string;
    position: {
        x: number;
        y: number;
    };
    settings: Record<string, any>;
    inputs: Record<string, any>;
    outputs: Record<string, any>;
    width?: number;
    height?: number;
    color?: [number, number, number];
    hide?: boolean;
    mute?: boolean;
}
export interface SerializedLink {
    id: string;
    fromNode: string;
    fromSocket: string;
    toNode: string;
    toSocket: string;
}
export interface SerializedGroup {
    id: string;
    name: string;
    nodes: SerializedNode[];
    links: SerializedLink[];
    interface: {
        inputs: Array<{
            name: string;
            type: string;
            defaultValue?: any;
        }>;
        outputs: Array<{
            name: string;
            type: string;
            defaultValue?: any;
        }>;
    };
}
export interface SerializedTree {
    version: string;
    id: string;
    name: string;
    type: 'GeometryNodeTree' | 'ShaderNodeTree' | 'CompositorNodeTree';
    nodes: SerializedNode[];
    links: SerializedLink[];
    groups: SerializedGroup[];
    interface: {
        inputs: Array<{
            name: string;
            type: string;
            defaultValue?: any;
        }>;
        outputs: Array<{
            name: string;
            type: string;
            defaultValue?: any;
        }>;
    };
    metadata?: {
        createdAt?: string;
        updatedAt?: string;
        author?: string;
        description?: string;
        tags?: string[];
    };
}
export interface SerializationOptions {
    includeMetadata?: boolean;
    includePosition?: boolean;
    includeHiddenNodes?: boolean;
    prettyPrint?: boolean;
    compress?: boolean;
}
export interface DeserializationOptions {
    mergeWithExisting?: boolean;
    generateNewIds?: boolean;
    validateOnLoad?: boolean;
}
export declare class NodeSerializer {
    private options;
    constructor(options?: Partial<SerializationOptions>);
    /**
     * Serialize a complete node tree to JSON string
     */
    serialize(tree: NodeTree): string;
    /**
     * Serialize a node tree to a plain object
     */
    serializeToObject(tree: NodeTree): SerializedTree;
    /**
     * Serialize a single node to JSON
     */
    serializeNode(node: NodeInstance): string;
    /**
     * Serialize multiple nodes with their connections
     */
    serializeNodesWithLinks(nodes: Map<string, NodeInstance>, links: NodeLink[]): string;
    /**
     * Deserialize a JSON string to a node tree
     */
    deserialize(jsonString: string, options?: Partial<DeserializationOptions>): NodeTree;
    /**
     * Deserialize a plain object to a node tree
     */
    deserializeFromObject(data: SerializedTree, options?: Partial<DeserializationOptions>): NodeTree;
    /**
     * Deserialize a single node from JSON
     */
    deserializeNode(jsonString: string): NodeInstance;
    /**
     * Import nodes from another node tree format (e.g., Blender)
     */
    importFromBlender(blenderData: any): NodeTree;
    /**
     * Export node tree as a downloadable file (browser environment)
     */
    exportToFile(tree: NodeTree, filename?: string): void;
    /**
     * Import node tree from a file (browser environment)
     */
    importFromFile(file: File): Promise<NodeTree>;
    /**
     * Create a snapshot of the current tree state
     */
    createSnapshot(tree: NodeTree): string;
    /**
     * Compare two node trees and return differences
     */
    diffTrees(tree1: NodeTree, tree2: NodeTree): {
        addedNodes: string[];
        removedNodes: string[];
        modifiedNodes: string[];
        addedLinks: NodeLink[];
        removedLinks: NodeLink[];
    };
    private serializeGroup;
    private deserializeGroup;
    private deserializeNodeType;
    private deserializeSocketType;
    private mapBlenderNodeType;
    private generateId;
}
/**
 * Quick serialize a node tree
 */
export declare function serializeNodeTree(tree: NodeTree, pretty?: boolean): string;
/**
 * Quick deserialize a node tree
 */
export declare function deserializeNodeTree(jsonString: string): NodeTree;
/**
 * Save a node tree to localStorage
 */
export declare function saveToLocalStorage(tree: NodeTree, key: string): void;
/**
 * Load a node tree from localStorage
 */
export declare function loadFromLocalStorage(key: string): NodeTree | null;
export default NodeSerializer;
//# sourceMappingURL=NodeSerializer.d.ts.map