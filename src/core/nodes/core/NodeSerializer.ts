/**
 * Node Serializer
 * 
 * Serializes and deserializes node graphs to/from JSON format
 * Enables saving/loading node setups and sharing between sessions
 */

import { NodeTree, NodeInstance, NodeLink, NodeGroup, SocketType } from './types';
import { NodeType } from './node-types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SerializedNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
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
    inputs: Array<{ name: string; type: string; defaultValue?: any }>;
    outputs: Array<{ name: string; type: string; defaultValue?: any }>;
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
    inputs: Array<{ name: string; type: string; defaultValue?: any }>;
    outputs: Array<{ name: string; type: string; defaultValue?: any }>;
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

// ============================================================================
// Serializer Version
// ============================================================================

const SERIALIZER_VERSION = '1.0.0';

// ============================================================================
// Node Serializer Class
// ============================================================================

export class NodeSerializer {
  private options: Required<SerializationOptions>;

  constructor(options: Partial<SerializationOptions> = {}) {
    this.options = {
      includeMetadata: true,
      includePosition: true,
      includeHiddenNodes: true,
      prettyPrint: true,
      compress: false,
      ...options,
    };
  }

  // ==========================================================================
  // Serialization Methods
  // ==========================================================================

  /**
   * Serialize a complete node tree to JSON string
   */
  serialize(tree: NodeTree): string {
    const serialized = this.serializeToObject(tree);
    
    if (this.options.prettyPrint) {
      return JSON.stringify(serialized, null, 2);
    }
    
    return JSON.stringify(serialized);
  }

  /**
   * Serialize a node tree to a plain object
   */
  serializeToObject(tree: NodeTree): SerializedTree {
    const serialized: SerializedTree = {
      version: SERIALIZER_VERSION,
      id: tree.id,
      name: tree.name,
      type: tree.type,
      nodes: [],
      links: [],
      groups: [],
      interface: {
        inputs: [],
        outputs: [],
      },
    };

    // Serialize nodes
    tree.nodes.forEach((node, nodeId) => {
      // Skip hidden nodes if configured
      if (!this.options.includeHiddenNodes && node.settings?.hide) {
        return;
      }

      const serializedNode: SerializedNode = {
        id: node.id,
        type: node.type.toString(),
        name: node.name,
        position: this.options.includePosition ? node.position : { x: 0, y: 0 },
        settings: { ...node.settings },
        inputs: Object.fromEntries(node.inputs),
        outputs: Object.fromEntries(node.outputs),
      };

      serialized.nodes.push(serializedNode);
    });

    // Serialize links
    serialized.links = tree.links.map(link => ({
      id: link.id || `link_${link.fromNode}_${link.toSocket}`,
      fromNode: link.fromNode,
      fromSocket: link.fromSocket,
      toNode: link.toNode,
      toSocket: link.toSocket,
    }));

    // Serialize groups
    tree.groups.forEach((group, groupId) => {
      serialized.groups.push(this.serializeGroup(group));
    });

    // Serialize interface
    tree.interface.inputs.forEach((socket, name) => {
      serialized.interface.inputs.push({
        name,
        type: socket.type.toString(),
        defaultValue: socket.defaultValue,
      });
    });

    tree.interface.outputs.forEach((socket, name) => {
      serialized.interface.outputs.push({
        name,
        type: socket.type.toString(),
        defaultValue: socket.defaultValue,
      });
    });

    // Add metadata if enabled
    if (this.options.includeMetadata) {
      serialized.metadata = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    return serialized;
  }

  /**
   * Serialize a single node to JSON
   */
  serializeNode(node: NodeInstance): string {
    const serializedNode: SerializedNode = {
      id: node.id,
      type: node.type.toString(),
      name: node.name,
      position: this.options.includePosition ? node.position : { x: 0, y: 0 },
      settings: { ...node.settings },
      inputs: Object.fromEntries(node.inputs),
      outputs: Object.fromEntries(node.outputs),
    };

    if (this.options.prettyPrint) {
      return JSON.stringify(serializedNode, null, 2);
    }

    return JSON.stringify(serializedNode);
  }

  /**
   * Serialize multiple nodes with their connections
   */
  serializeNodesWithLinks(
    nodes: Map<string, NodeInstance>,
    links: NodeLink[]
  ): string {
    const serialized: Omit<SerializedTree, 'version' | 'id' | 'name' | 'type' | 'groups' | 'interface'> = {
      nodes: [],
      links: [],
    };

    nodes.forEach((node) => {
      serialized.nodes.push({
        id: node.id,
        type: node.type.toString(),
        name: node.name,
        position: this.options.includePosition ? node.position : { x: 0, y: 0 },
        settings: { ...node.settings },
        inputs: Object.fromEntries(node.inputs),
        outputs: Object.fromEntries(node.outputs),
      });
    });

    serialized.links = links.map(link => ({
      id: link.id || `link_${link.fromNode}_${link.toSocket}`,
      fromNode: link.fromNode,
      fromSocket: link.fromSocket,
      toNode: link.toNode,
      toSocket: link.toSocket,
    }));

    if (this.options.prettyPrint) {
      return JSON.stringify(serialized, null, 2);
    }

    return JSON.stringify(serialized);
  }

  // ==========================================================================
  // Deserialization Methods
  // ==========================================================================

  /**
   * Deserialize a JSON string to a node tree
   */
  deserialize(jsonString: string, options: Partial<DeserializationOptions> = {}): NodeTree {
    const parsed = JSON.parse(jsonString);
    return this.deserializeFromObject(parsed, options);
  }

  /**
   * Deserialize a plain object to a node tree
   */
  deserializeFromObject(
    data: SerializedTree,
    options: Partial<DeserializationOptions> = {}
  ): NodeTree {
    const opts: Required<DeserializationOptions> = {
      mergeWithExisting: false,
      generateNewIds: false,
      validateOnLoad: true,
      ...options,
    };

    // Validate version
    if (data.version !== SERIALIZER_VERSION) {
      console.warn(
        `Version mismatch: expected ${SERIALIZER_VERSION}, got ${data.version}`
      );
      // Could add migration logic here for older versions
    }

    const tree: NodeTree = {
      id: opts.generateNewIds ? this.generateId('tree') : data.id,
      name: data.name,
      type: data.type,
      nodes: new Map(),
      links: [],
      groups: new Map(),
      interface: {
        inputs: new Map(),
        outputs: new Map(),
      },
    };

    // Deserialize nodes
    data.nodes.forEach(serializedNode => {
      const node: NodeInstance = {
        id: opts.generateNewIds ? this.generateId('node') : serializedNode.id,
        type: this.deserializeNodeType(serializedNode.type),
        name: serializedNode.name,
        position: serializedNode.position,
        settings: serializedNode.settings,
        inputs: new Map(Object.entries(serializedNode.inputs)),
        outputs: new Map(Object.entries(serializedNode.outputs)),
      };

      tree.nodes.set(node.id, node);
    });

    // Deserialize links
    data.links.forEach(serializedLink => {
      // Update node references if IDs were regenerated
      let fromNode = serializedLink.fromNode;
      let toNode = serializedLink.toNode;

      if (opts.generateNewIds) {
        // Find the new IDs based on old ones
        // This requires tracking the ID mapping during node deserialization
        // For simplicity, we'll assume the order is preserved
        const nodeArray = Array.from(tree.nodes.values());
        const fromIndex = data.nodes.findIndex(n => n.id === serializedLink.fromNode);
        const toIndex = data.nodes.findIndex(n => n.id === serializedLink.toNode);

        if (fromIndex >= 0 && fromIndex < nodeArray.length) {
          fromNode = nodeArray[fromIndex].id;
        }
        if (toIndex >= 0 && toIndex < nodeArray.length) {
          toNode = nodeArray[toIndex].id;
        }
      }

      tree.links.push({
        id: serializedLink.id,
        fromNode,
        fromSocket: serializedLink.fromSocket,
        toNode,
        toSocket: serializedLink.toSocket,
      });
    });

    // Deserialize groups
    data.groups.forEach(serializedGroup => {
      const group = this.deserializeGroup(serializedGroup, opts);
      tree.groups.set(group.id, group);
    });

    // Deserialize interface
    data.interface.inputs.forEach(socket => {
      tree.interface.inputs.set(socket.name, {
        name: socket.name,
        type: this.deserializeSocketType(socket.type),
        defaultValue: socket.defaultValue,
      });
    });

    data.interface.outputs.forEach(socket => {
      tree.interface.outputs.set(socket.name, {
        name: socket.name,
        type: this.deserializeSocketType(socket.type),
        defaultValue: socket.defaultValue,
      });
    });

    return tree;
  }

  /**
   * Deserialize a single node from JSON
   */
  deserializeNode(jsonString: string): NodeInstance {
    const data: SerializedNode = JSON.parse(jsonString);
    
    return {
      id: data.id,
      type: this.deserializeNodeType(data.type),
      name: data.name,
      position: data.position,
      settings: data.settings,
      inputs: new Map(Object.entries(data.inputs)),
      outputs: new Map(Object.entries(data.outputs)),
    };
  }

  /**
   * Import nodes from another node tree format (e.g., Blender)
   */
  importFromBlender(blenderData: any): NodeTree {
    // This would parse Blender's node tree format
    // For now, return a basic structure
    const tree: NodeTree = {
      id: this.generateId('tree'),
      name: blenderData.name || 'Imported Tree',
      type: 'ShaderNodeTree',
      nodes: new Map(),
      links: [],
      groups: new Map(),
      interface: {
        inputs: new Map(),
        outputs: new Map(),
      },
    };

    // Parse Blender nodes
    if (blenderData.nodes) {
      blenderData.nodes.forEach((bNode: any) => {
        const node: NodeInstance = {
          id: bNode.name || this.generateId('node'),
          type: this.mapBlenderNodeType(bNode.type),
          name: bNode.name || 'Node',
          position: {
            x: bNode.location?.[0] || 0,
            y: bNode.location?.[1] || 0,
          },
          settings: bNode.inputs || {},
          inputs: new Map(),
          outputs: new Map(),
        };

        tree.nodes.set(node.id, node);
      });
    }

    // Parse Blender links
    if (blenderData.links) {
      blenderData.links.forEach((bLink: any) => {
        tree.links.push({
          id: this.generateId('link'),
          fromNode: bLink.from_node,
          fromSocket: bLink.from_socket,
          toNode: bLink.to_node,
          toSocket: bLink.to_socket,
        });
      });
    }

    return tree;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Export node tree as a downloadable file (browser environment)
   */
  exportToFile(tree: NodeTree, filename?: string): void {
    if (typeof window === 'undefined') {
      throw new Error('exportToFile is only available in browser environments');
    }

    const json = this.serialize(tree);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `${tree.name.replace(/\s+/g, '_')}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Import node tree from a file (browser environment)
   */
  importFromFile(file: File): Promise<NodeTree> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const tree = this.deserialize(json);
          resolve(tree);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Create a snapshot of the current tree state
   */
  createSnapshot(tree: NodeTree): string {
    return this.serialize(tree);
  }

  /**
   * Compare two node trees and return differences
   */
  diffTrees(tree1: NodeTree, tree2: NodeTree): {
    addedNodes: string[];
    removedNodes: string[];
    modifiedNodes: string[];
    addedLinks: NodeLink[];
    removedLinks: NodeLink[];
  } {
    const addedNodes: string[] = [];
    const removedNodes: string[] = [];
    const modifiedNodes: string[] = [];

    // Find added and modified nodes
    tree2.nodes.forEach((node2, id) => {
      const node1 = tree1.nodes.get(id);
      if (!node1) {
        addedNodes.push(id);
      } else if (JSON.stringify(node1) !== JSON.stringify(node2)) {
        modifiedNodes.push(id);
      }
    });

    // Find removed nodes
    tree1.nodes.forEach((_, id) => {
      if (!tree2.nodes.has(id)) {
        removedNodes.push(id);
      }
    });

    // Find added and removed links
    const linkSet1 = new Set(tree1.links.map(l => JSON.stringify(l)));
    const linkSet2 = new Set(tree2.links.map(l => JSON.stringify(l)));

    const addedLinks = tree2.links.filter(l => !linkSet1.has(JSON.stringify(l)));
    const removedLinks = tree1.links.filter(l => !linkSet2.has(JSON.stringify(l)));

    return {
      addedNodes,
      removedNodes,
      modifiedNodes,
      addedLinks,
      removedLinks,
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private serializeGroup(group: NodeGroup): SerializedGroup {
    return {
      id: group.id,
      name: group.name,
      nodes: Array.from(group.nodes.values()).map(node => ({
        id: node.id,
        type: node.type.toString(),
        name: node.name,
        position: this.options.includePosition ? node.position : { x: 0, y: 0 },
        settings: { ...node.settings },
        inputs: Object.fromEntries(node.inputs),
        outputs: Object.fromEntries(node.outputs),
      })),
      links: group.links.map(link => ({
        id: link.id || `link_${link.fromNode}_${link.toSocket}`,
        fromNode: link.fromNode,
        fromSocket: link.fromSocket,
        toNode: link.toNode,
        toSocket: link.toSocket,
      })),
      interface: {
        inputs: Array.from(group.interface.inputs.entries()).map(([name, socket]) => ({
          name,
          type: socket.type.toString(),
          defaultValue: socket.defaultValue,
        })),
        outputs: Array.from(group.interface.outputs.entries()).map(([name, socket]) => ({
          name,
          type: socket.type.toString(),
          defaultValue: socket.defaultValue,
        })),
      },
    };
  }

  private deserializeGroup(
    data: SerializedGroup,
    options: DeserializationOptions
  ): NodeGroup {
    return {
      id: options.generateNewIds ? this.generateId('group') : data.id,
      name: data.name,
      nodes: new Map(
        data.nodes.map(node => [
          node.id,
          {
            id: options.generateNewIds ? this.generateId('node') : node.id,
            type: this.deserializeNodeType(node.type),
            name: node.name,
            position: node.position,
            settings: node.settings,
            inputs: new Map(Object.entries(node.inputs)),
            outputs: new Map(Object.entries(node.outputs)),
          },
        ])
      ),
      links: data.links.map(link => ({
        id: link.id,
        fromNode: link.fromNode,
        fromSocket: link.fromSocket,
        toNode: link.toNode,
        toSocket: link.toSocket,
      })),
      interface: {
        inputs: new Map(
          data.interface.inputs.map(socket => [
            socket.name,
            {
              name: socket.name,
              type: this.deserializeSocketType(socket.type),
              defaultValue: socket.defaultValue,
            },
          ])
        ),
        outputs: new Map(
          data.interface.outputs.map(socket => [
            socket.name,
            {
              name: socket.name,
              type: this.deserializeSocketType(socket.type),
              defaultValue: socket.defaultValue,
            },
          ])
        ),
      },
    };
  }

  private deserializeNodeType(typeString: string): NodeType {
    // Map string back to NodeType enum
    // This handles both the enum value and the string representation
    return (NodeType as any)[typeString] || typeString as NodeType;
  }

  private deserializeSocketType(typeString: string): SocketType {
    // Map string back to SocketType enum
    return (SocketType as any)[typeString] || typeString as SocketType;
  }

  private mapBlenderNodeType(blenderType: string): NodeType {
    // Map Blender node types to our NodeType enum
    const typeMap: Record<string, NodeType> = {
      'ShaderNodeBsdfPrincipled': NodeType.PrincipledBSDF,
      'ShaderNodeTexNoise': NodeType.NoiseTexture,
      'ShaderNodeTexVoronoi': NodeType.VoronoiTexture,
      'ShaderNodeTexMusgrave': NodeType.MusgraveTexture,
      'ShaderNodeValToRGB': NodeType.ColorRamp,
      'ShaderNodeMixRGB': NodeType.MixRGB,
      'ShaderNodeTexCoord': NodeType.TextureCoordinate,
      'ShaderNodeMapping': NodeType.Mapping,
      'ShaderNodeOutputMaterial': NodeType.MaterialOutput,
      'GeometryNodeGroupInput': NodeType.GroupInput,
      'GeometryNodeGroupOutput': NodeType.GroupOutput,
    };

    return typeMap[blenderType] || blenderType as NodeType;
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick serialize a node tree
 */
export function serializeNodeTree(tree: NodeTree, pretty: boolean = true): string {
  const serializer = new NodeSerializer({ prettyPrint: pretty });
  return serializer.serialize(tree);
}

/**
 * Quick deserialize a node tree
 */
export function deserializeNodeTree(jsonString: string): NodeTree {
  const serializer = new NodeSerializer();
  return serializer.deserialize(jsonString);
}

/**
 * Save a node tree to localStorage
 */
export function saveToLocalStorage(tree: NodeTree, key: string): void {
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage is not available');
  }
  
  const serializer = new NodeSerializer();
  const json = serializer.serialize(tree);
  localStorage.setItem(key, json);
}

/**
 * Load a node tree from localStorage
 */
export function loadFromLocalStorage(key: string): NodeTree | null {
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage is not available');
  }
  
  const json = localStorage.getItem(key);
  if (!json) return null;
  
  const serializer = new NodeSerializer();
  return serializer.deserialize(json);
}

export default NodeSerializer;
