/**
 * Node Wrangler - Core class for managing node graphs
 * Based on infinigen/core/nodes/node_wrangler.py
 * 
 * This class provides utilities for creating, connecting, and manipulating nodes
 * in a Three.js/R3F context, inspired by Blender's node system.
 */

import { NodeTypes } from './node-types';
import { SocketType, NodeSocket, SocketDefinition } from './socket-types';
import { nodeDefinitionRegistry } from './node-definition-registry';

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

  // ==========================================================================
  // Convenience Methods - Python API Parity
  // Based on infinigen/core/nodes/node_wrangler.py
  // ==========================================================================

  /**
   * Add two or more nodes (vector math ADD).
   * Supports N-ary associative addition: add(a, b, c) = add(a, add(b, c))
   */
  add(...nodes: any[]): any {
    if (nodes.length === 1) return nodes[0];
    if (nodes.length === 2) {
      return this.newNode(NodeTypes.VectorMath, undefined, undefined, { operation: 'ADD' });
      // The caller should connect the two nodes as inputs via link()
    }
    // Recursive N-ary: add the first with the rest
    return this.add(nodes[0], this.add(...nodes.slice(1)));
  }

  /**
   * Multiply two or more nodes (vector math MULTIPLY).
   * Supports N-ary associative multiplication.
   */
  multiply(...nodes: any[]): any {
    if (nodes.length === 1) return nodes[0];
    if (nodes.length === 2) {
      return this.newNode(NodeTypes.VectorMath, undefined, undefined, { operation: 'MULTIPLY' });
    }
    return this.multiply(nodes[0], this.multiply(...nodes.slice(1)));
  }

  /**
   * Scalar add: adds two float values using Math node ADD operation
   */
  scalarAdd(...nodes: any[]): any {
    if (nodes.length === 1) return nodes[0];
    if (nodes.length === 2) {
      return this.newNode(NodeTypes.Math, undefined, undefined, { operation: 'ADD' });
    }
    return this.scalarAdd(nodes[0], this.scalarAdd(...nodes.slice(1)));
  }

  /**
   * Scalar multiply: multiplies two float values using Math node MULTIPLY operation
   */
  scalarMultiply(...nodes: any[]): any {
    if (nodes.length === 1) return nodes[0];
    if (nodes.length === 2) {
      return this.newNode(NodeTypes.Math, undefined, undefined, { operation: 'MULTIPLY' });
    }
    return this.scalarMultiply(nodes[0], this.scalarMultiply(...nodes.slice(1)));
  }

  /**
   * Subtract two nodes (vector math SUBTRACT)
   */
  sub(nodeA: any, nodeB: any): any {
    return this.newNode(NodeTypes.VectorMath, undefined, undefined, { operation: 'SUBTRACT' });
  }

  /**
   * Scalar subtract: subtracts two float values using Math node SUBTRACT operation
   */
  scalarSub(nodeA: any, nodeB: any): any {
    return this.newNode(NodeTypes.Math, undefined, undefined, { operation: 'SUBTRACT' });
  }

  /**
   * Divide two nodes (vector math DIVIDE)
   */
  divide(nodeA: any, nodeB: any): any {
    return this.newNode(NodeTypes.VectorMath, undefined, undefined, { operation: 'DIVIDE' });
  }

  /**
   * Scalar divide: divides two float values using Math node DIVIDE operation
   */
  scalarDivide(nodeA: any, nodeB: any): any {
    return this.newNode(NodeTypes.Math, undefined, undefined, { operation: 'DIVIDE' });
  }

  /**
   * Scale a vector by a scalar
   */
  scale(vectorNode: any, scalarNode: any): any {
    return this.newNode(
      NodeTypes.VectorMath,
      undefined,
      undefined,
      { operation: 'SCALE' }
    );
  }

  /**
   * Dot product of two vectors
   */
  dot(nodeA: any, nodeB: any): any {
    return this.newNode(
      NodeTypes.VectorMath,
      undefined,
      undefined,
      { operation: 'DOT_PRODUCT' }
    );
  }

  /**
   * Generic math operation on Math node
   */
  math(operation: string, ...nodes: any[]): any {
    return this.newNode(
      NodeTypes.Math,
      undefined,
      undefined,
      { operation }
    );
  }

  /**
   * Generic vector math operation on VectorMath node
   */
  vectorMath(operation: string, ...nodes: any[]): any {
    return this.newNode(
      NodeTypes.VectorMath,
      undefined,
      undefined,
      { operation }
    );
  }

  /**
   * Bernoulli trial: returns a boolean output with given probability
   * Creates a RandomValue node with BOOLEAN data type
   */
  bernoulli(prob: number, seed?: number): NodeInstance {
    if (seed === undefined) {
      seed = Math.floor(Math.random() * 1e5);
    }
    return this.newNode(
      NodeTypes.RandomValue,
      `bernoulli_${this.nodeCounter}`,
      undefined,
      {
        data_type: 'BOOLEAN',
        Probability: prob,
        Seed: seed,
      }
    );
  }

  /**
   * Uniform random value in [low, high] range
   * Supports FLOAT and FLOAT_VECTOR data types
   */
  uniform(low: number | number[] = 0.0, high: number | number[] = 1.0, seed?: number, dataType: string = 'FLOAT'): NodeInstance {
    if (seed === undefined) {
      seed = Math.floor(Math.random() * 1e5);
    }
    if (Array.isArray(low)) {
      dataType = 'FLOAT_VECTOR';
    }
    return this.newNode(
      NodeTypes.RandomValue,
      `uniform_${this.nodeCounter}`,
      undefined,
      {
        data_type: dataType,
        Min: low,
        Max: high,
        Seed: seed,
      }
    );
  }

  /**
   * Build a float curve: maps input value through a curve defined by anchor points
   * Each anchor is [position, value] where position and value are in [0, 1]
   */
  buildFloatCurve(x: any, anchors: [number, number][], handle: string = 'VECTOR'): NodeInstance {
    const floatCurve = this.newNode(
      NodeTypes.FloatCurve,
      `floatcurve_${this.nodeCounter}`,
      undefined,
      {
        Value: x,
        _anchors: anchors,
        _handle: handle,
      }
    );
    return floatCurve;
  }

  /**
   * Switch between two values based on a boolean condition
   */
  switch(pred: any, trueVal: any, falseVal: any, inputType: string = 'FLOAT'): NodeInstance {
    return this.newNode(
      NodeTypes.Switch,
      `switch_${this.nodeCounter}`,
      undefined,
      {
        input_type: inputType,
        Switch: pred,
        True: trueVal,
        False: falseVal,
      }
    );
  }

  /**
   * Vector switch between two vector values based on a boolean condition
   */
  vectorSwitch(pred: any, trueVal: any, falseVal: any): NodeInstance {
    return this.switch(pred, trueVal, falseVal, 'VECTOR');
  }

  /**
   * Compare two values with a given operation
   */
  compare(operation: string, nodeA: any, nodeB: any): NodeInstance {
    return this.newNode(
      NodeTypes.Compare,
      undefined,
      undefined,
      { operation }
    );
  }

  /**
   * Compare direction between two vectors with angle threshold
   */
  compareDirection(operation: string, a: any, b: any, angle: number): NodeInstance {
    return this.newNode(
      NodeTypes.Compare,
      undefined,
      undefined,
      { data_type: 'VECTOR', mode: 'DIRECTION', operation }
    );
  }

  /**
   * Capture an attribute on geometry, returning [geometry, attribute] tuple
   * This evaluates a field on the geometry and returns per-element values
   */
  capture(geometry: any, attribute: any, attrs?: Record<string, any>): { geometry: any; attribute: any } {
    const captureNode = this.newNode(
      NodeTypes.CaptureAttribute,
      `capture_${this.nodeCounter}`,
      undefined,
      {
        ...(attrs || {}),
        Geometry: geometry,
        Value: attribute,
      }
    );
    return {
      geometry: captureNode,
      attribute: captureNode,
    };
  }

  /**
   * Musgrave texture with automatic MapRange remapping from [-1, 1] to [0, 1]
   * This matches the Python NodeWrangler.musgrave() convenience method
   */
  musgrave(scale: number = 10, vector?: any): NodeInstance {
    const musgraveNode = this.newNode(
      NodeTypes.MusgraveTexture,
      `musgrave_${this.nodeCounter}`,
      undefined,
      { Scale: scale }
    );
    if (vector !== undefined) {
      this.setInputValue(musgraveNode, 'Vector', vector);
    }

    // MapRange remaps [-1, 1] -> [0, 1]
    const mapRange = this.newNode(
      NodeTypes.MapRange,
      `maprange_${this.nodeCounter}`,
      undefined,
      {}
    );
    this.setInputValue(mapRange, 0, musgraveNode);  // value from musgrave
    this.setInputValue(mapRange, 'From Min', -1);
    this.setInputValue(mapRange, 'From Max', 1);
    this.setInputValue(mapRange, 'To Min', 0);
    this.setInputValue(mapRange, 'To Max', 1);

    return mapRange;
  }

  /**
   * Combine XYZ components into a vector
   */
  combine(x: any, y: any, z: any): NodeInstance {
    return this.newNode(NodeTypes.CombineXYZ, `combine_${this.nodeCounter}`);
  }

  /**
   * Separate a vector into XYZ components
   */
  separate(x: any): NodeInstance {
    return this.newNode(NodeTypes.SeparateXYZ, `separate_${this.nodeCounter}`);
  }

  /**
   * Convert a curve to mesh with optional profile curve
   */
  curve2mesh(curve: any, profileCurve?: any): NodeInstance {
    const curveToMesh = this.newNode(
      NodeTypes.CurveToMesh,
      `curve2mesh_${this.nodeCounter}`
    );
    if (profileCurve !== undefined) {
      this.setInputValue(curveToMesh, 'Profile Curve', profileCurve);
    }
    // Set shade smooth off
    const shadeSmooth = this.newNode(
      NodeTypes.SetShadeSmooth,
      `shadesmooth_${this.nodeCounter}`
    );
    this.setInputValue(shadeSmooth, 'Shade Smooth', false);
    return shadeSmooth;
  }

  /**
   * Build a case/switch statement based on index matching
   */
  buildCase(value: any, inputs: any[], outputs: any[], inputType: string = 'FLOAT'): any {
    let node = outputs[outputs.length - 1];
    for (let i = 0; i < inputs.length - 1; i++) {
      node = this.switch(
        this.compare('EQUAL', value, inputs[i]),
        outputs[i],
        node,
        inputType
      );
    }
    return node;
  }

  /**
   * Build an index-based case: switch on the Index node
   */
  buildIndexCase(inputs: any[]): any {
    const indexNode = this.newNode(NodeTypes.Index, `index_${this.nodeCounter}`);
    return this.buildCase(
      indexNode,
      [...inputs, -1],
      [...Array(inputs.length).fill(true), false]
    );
  }

  /**
   * Find nodes by type name in the active group
   */
  find(name: string): NodeInstance[] {
    const group = this.getActiveGroup();
    return Array.from(group.nodes.values()).filter(
      n => String(n.type).includes(name) || n.name.includes(name)
    );
  }

  /**
   * Find nodes recursively, including within nested node groups
   */
  findRecursive(name: string): { wrangler: NodeWrangler; node: NodeInstance }[] {
    const results: { wrangler: NodeWrangler; node: NodeInstance }[] = [];
    // Search in current group
    for (const node of this.find(name)) {
      results.push({ wrangler: this, node });
    }
    // Search in sub-groups
    for (const [groupId, group] of this.nodeGroups.entries()) {
      if (groupId === this.activeGroup) continue;
      for (const node of group.nodes.values()) {
        if (String(node.type).includes(name) || node.name.includes(name)) {
          results.push({ wrangler: this, node });
        }
      }
    }
    return results;
  }

  /**
   * Find links coming into a specific socket
   */
  findFrom(toSocketName: string, toNodeId?: string): NodeLink[] {
    const group = this.getActiveGroup();
    const result: NodeLink[] = [];
    for (const link of group.links.values()) {
      if (link.toSocket === toSocketName) {
        if (!toNodeId || link.toNode === toNodeId) {
          result.push(link);
        }
      }
    }
    return result;
  }

  /**
   * Find links going out from a specific socket
   */
  findTo(fromSocketName: string, fromNodeId?: string): NodeLink[] {
    const group = this.getActiveGroup();
    const result: NodeLink[] = [];
    for (const link of group.links.values()) {
      if (link.fromSocket === fromSocketName) {
        if (!fromNodeId || link.fromNode === fromNodeId) {
          result.push(link);
        }
      }
    }
    return result;
  }

  /**
   * Create a new Value node with a given value
   */
  newValue(v: number, label?: string): NodeInstance {
    const node = this.newNode(NodeTypes.Value, label);
    this.setInputValue(node, 0, v);
    return node;
  }

  /**
   * Create a boolean math operation node
   */
  booleanMath(operation: string, ...nodes: any[]): NodeInstance {
    return this.newNode(
      NodeTypes.BooleanMath,
      undefined,
      undefined,
      { operation }
    );
  }

  /**
   * Power operation on two float inputs
   */
  power(base: any, exponent: any): NodeInstance {
    return this.newNode(
      NodeTypes.Math,
      undefined,
      undefined,
      { operation: 'POWER' }
    );
  }

  /**
   * Scalar max: maximum of two float values
   */
  scalarMax(nodeA: any, nodeB: any): NodeInstance {
    return this.newNode(
      NodeTypes.Math,
      undefined,
      undefined,
      { operation: 'MAXIMUM' }
    );
  }

  /**
   * Create a GroupInput node (singleton per group)
   */
  groupInput(): NodeInstance {
    const group = this.getActiveGroup();
    // Reuse existing GroupInput if one exists
    for (const node of group.nodes.values()) {
      if (String(node.type) === String(NodeTypes.GroupInput)) {
        return node;
      }
    }
    return this.newNode(NodeTypes.GroupInput, 'Group Input');
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
   * Get node definition from the central registry.
   * Falls back to an empty definition for unregistered types.
   */
  private getNodeDefinition(type: NodeTypes): NodeDefinition {
    const entry = nodeDefinitionRegistry.get(String(type));
    if (entry) {
      return {
        type: type,
        inputs: entry.inputs,
        outputs: entry.outputs,
        properties: entry.properties
          ? Object.fromEntries(
              Object.entries(entry.properties).map(([k, v]) => [k, v.default])
            )
          : undefined,
      };
    }
    // Fallback for unregistered types
    return { type, inputs: [], outputs: [] };
  }

  /**
   * Add a node to the graph - convenience method matching Python API
   * Creates a node instance and adds it to the active group
   */
  addNode(nodeType: any, nameOrParams?: string | Record<string, any>, locationOrProps?: [number, number] | Record<string, any>): NodeInstance {
    let nodeName: string | undefined;
    let properties: Record<string, any> = {};
    let nodeLocation: [number, number] | undefined;

    if (typeof nameOrParams === 'string') {
      nodeName = nameOrParams;
      if (locationOrProps) {
        if (Array.isArray(locationOrProps)) {
          nodeLocation = locationOrProps as [number, number];
        } else if ('x' in locationOrProps && 'y' in locationOrProps) {
          nodeLocation = [locationOrProps.x, locationOrProps.y];
          const { x, y, ...rest } = locationOrProps;
          properties = rest;
        } else {
          properties = locationOrProps;
        }
      }
    } else if (nameOrParams) {
      // It's a params object - check for x/y location
      const params = nameOrParams;
      if ('x' in params && 'y' in params) {
        nodeLocation = [params.x, params.y];
        const { x, y, ...rest } = params;
        properties = rest;
      } else {
        properties = params;
      }
    }

    const node = this.newNode(nodeType, nodeName, nodeLocation, properties);
    
    // Apply properties to node
    for (const [key, value] of Object.entries(properties)) {
      node.properties[key] = value;
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

  // ==========================================================================
  // Evaluation Engine: topological sort + execute + getOutput
  // ==========================================================================

  /**
   * Node execution function type.
   * Each node type can register an executor that receives its resolved input values
   * and returns an object mapping output socket names to their computed values.
   */
  static executors: Map<string, (inputs: Record<string, any>, properties: Record<string, any>) => Record<string, any>> = new Map();

  /**
   * Register an executor for a node type.
   */
  static registerExecutor(
    nodeType: string,
    executor: (inputs: Record<string, any>, properties: Record<string, any>) => Record<string, any>
  ): void {
    NodeWrangler.executors.set(nodeType, executor);
  }

  /**
   * Perform topological sort of the nodes in the active group.
   * Returns an ordered array of node IDs such that all dependencies come before dependents.
   * Throws if a cycle is detected.
   */
  topologicalSort(group?: NodeGroup): string[] {
    const g = group || this.getActiveGroup();
    const nodes = Array.from(g.nodes.keys());
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const order: string[] = [];

    // Build adjacency list: for each node, which nodes depend on it?
    // We need to know: to execute node B, we need the output of node A if A→B
    // So we find incoming edges for each node.
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, Set<string>>(); // nodeId → set of nodes that depend on it

    for (const nodeId of nodes) {
      inDegree.set(nodeId, 0);
      dependents.set(nodeId, new Set());
    }

    for (const link of g.links.values()) {
      // link.fromNode → link.toNode means toNode depends on fromNode
      inDegree.set(link.toNode, (inDegree.get(link.toNode) || 0) + 1);
      dependents.get(link.fromNode)?.add(link.toNode);
    }

    // Kahn's algorithm (BFS-based topological sort)
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      order.push(nodeId);

      for (const depId of dependents.get(nodeId) || []) {
        const newDegree = (inDegree.get(depId) || 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }

    // If not all nodes are in the order, there's a cycle
    if (order.length !== nodes.length) {
      const cycleNodes = nodes.filter(n => !order.includes(n));
      throw new Error(`Cycle detected in node graph involving nodes: ${cycleNodes.join(', ')}`);
    }

    return order;
  }

  /**
   * Evaluate the entire node graph.
   * Performs a topological sort, then executes each node in order,
   * passing resolved input values through connections.
   * Returns a Map of nodeId → output values (record of output socket name → value).
   */
  evaluate(group?: NodeGroup): Map<string, Record<string, any>> {
    const g = group || this.getActiveGroup();
    const order = this.topologicalSort(g);
    const results = new Map<string, Record<string, any>>();

    for (const nodeId of order) {
      const node = g.nodes.get(nodeId);
      if (!node) continue;

      // Resolve input values: either from connected outputs or from socket defaults
      const inputValues: Record<string, any> = {};

      for (const [socketName, socket] of node.inputs.entries()) {
        // Find if there's a link to this input
        let resolved = false;
        for (const link of g.links.values()) {
          if (link.toNode === nodeId && link.toSocket === socketName) {
            const sourceResults = results.get(link.fromNode);
            if (sourceResults && link.fromSocket in sourceResults) {
              inputValues[socketName] = sourceResults[link.fromSocket];
              resolved = true;
            }
            break;
          }
        }

        // If not resolved from a connection, use socket value or default
        if (!resolved) {
          inputValues[socketName] = socket.value ?? socket.defaultValue ?? socket.default;
        }
      }

      // Execute the node
      const executor = NodeWrangler.executors.get(String(node.type));
      if (executor) {
        try {
          const outputValues = executor(inputValues, node.properties);
          results.set(nodeId, outputValues);
        } catch (err) {
          console.warn(`[NodeWrangler] Error executing node ${nodeId} (type=${node.type}):`, err);
          results.set(nodeId, {});
        }
      } else {
        // Default behavior: pass through inputs to outputs
        const outputValues: Record<string, any> = {};
        for (const [outName] of node.outputs.entries()) {
          // If there's an input with the same name, pass it through
          if (outName in inputValues) {
            outputValues[outName] = inputValues[outName];
          } else {
            // Use the node's properties or a default
            outputValues[outName] = node.properties[outName] ?? null;
          }
        }
        results.set(nodeId, outputValues);
      }
    }

    return results;
  }

  /**
   * Get the final output of the node graph.
   * Finds the "output" node (GroupOutput or similar) and returns its input values.
   * If no output node is found, returns the outputs of the last node in topological order.
   */
  getOutput(group?: NodeGroup): Record<string, any> {
    const g = group || this.getActiveGroup();
    const results = this.evaluate(g);

    // Look for GroupOutput node
    for (const [nodeId, node] of g.nodes.entries()) {
      if (
        String(node.type) === 'GroupOutputNode' ||
        String(node.type) === 'GroupOutput' ||
        node.name === 'Group Output' ||
        node.name === 'Output'
      ) {
        // Return the values that feed into this node
        const outputValues: Record<string, any> = {};
        for (const [socketName] of node.inputs.entries()) {
          // Find connected source
          for (const link of g.links.values()) {
            if (link.toNode === nodeId && link.toSocket === socketName) {
              const sourceResults = results.get(link.fromNode);
              if (sourceResults && link.fromSocket in sourceResults) {
                outputValues[socketName] = sourceResults[link.fromSocket];
              }
              break;
            }
          }
        }
        return outputValues;
      }
    }

    // Fallback: return the outputs of the last node in topological order
    const order = this.topologicalSort(g);
    if (order.length === 0) return {};

    const lastNodeId = order[order.length - 1];
    return results.get(lastNodeId) || {};
  }

  /**
   * Evaluate the node graph per-vertex for the given geometry.
   * This is the main entry point for geometry node evaluation.
   *
   * Unlike the scalar `evaluate()` which produces a single value per node,
   * this produces an AttributeStream per node output — one value per vertex.
   * The result is a new GeometryContext with per-vertex attributes applied.
   */
  evaluatePerVertex(geometry: import('./geometry-context').GeometryContext): import('./geometry-context').GeometryContext {
    // Lazy import to avoid circular dependency at module load time.
    // PerVertexEvaluator imports NodeWrangler, so we cannot use a static import here.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PvE = require('./per-vertex-evaluator').PerVertexEvaluator as typeof import('./per-vertex-evaluator').PerVertexEvaluator;
    const evaluator = new PvE(this);
    return evaluator.evaluate(geometry);
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
export type { NodeSocket } from './socket-types';

/** Create a new NodeWrangler pre-configured for geometry node trees */
export function createGeometryNodeTree(name?: string): NodeWrangler {
  const nw = new NodeWrangler();
  if (name) {
    const group = nw.getActiveGroup();
    group.name = name;
  }
  return nw;
}

/** Create a new NodeWrangler pre-configured for material node trees */
export function createMaterialNodeTree(name?: string): NodeWrangler {
  const nw = new NodeWrangler();
  if (name) {
    const group = nw.getActiveGroup();
    group.name = name;
  }
  return nw;
}

export default NodeWrangler;
