/**
 * Copyright (C) 2025, Princeton University.
 * This source code is licensed under the BSD 3-Clause license.
 *
 * Authors: Ported from Python InfiniGen
 * - Abhishek Joshi (original Python author)
 *
 * Enhanced with KinematicNodeTree, compileKinematicTree, RigidBodySkeleton,
 * and RigidBodyNode to match Infinigen's core/sim/kinematic_compiler.py.
 */

import * as THREE from 'three';
import { KinematicNode, kinematicNodeFactory, KinematicType, JointType } from './KinematicNode';
import {
  JointInfo,
  JointType as ArticulatedJointType,
  ArticulatedObjectResult,
} from '../../assets/objects/articulated/types';

/**
 * Interface for Blender-like node structures
 */
interface BlenderNode {
  bl_idname: string;
  node_tree?: {
    name: string;
    nodes: BlenderNode[];
    links: any[];
  };
  inputs: Record<string, any>;
  outputs: Record<string, any>;
}

/**
 * Interface for node tree
 */
interface NodeTree {
  name: string;
  nodes: BlenderNode[];
  links: any[];
}

/**
 * Interface for geometry modifier
 */
interface NodesModifier {
  type: 'NODES';
  node_group: NodeTree;
}

/**
 * Utility functions for kinematic compilation
 */
export class KinematicUtils {
  static getNodeByIdname(nodeTree: NodeTree, blIdname: string): BlenderNode | undefined {
    return nodeTree.nodes.find((node) => node.bl_idname === blIdname);
  }

  static isNodeGroup(node: BlenderNode): boolean {
    return node.bl_idname === 'GeometryNodeGroup';
  }

  static isJoin(node: BlenderNode): boolean {
    return node.bl_idname === 'GeometryNodeJoinGeometry';
  }

  static isHinge(node: BlenderNode): boolean {
    if (!this.isNodeGroup(node) || !node.node_tree) return false;
    const name = node.node_tree.name.toLowerCase();
    return name.includes('hinge_joint') || name.includes('hinge joint');
  }

  static isSliding(node: BlenderNode): boolean {
    if (!this.isNodeGroup(node) || !node.node_tree) return false;
    const name = node.node_tree.name.toLowerCase();
    return name.includes('sliding_joint') || name.includes('sliding joint');
  }

  static isJoint(node: BlenderNode): boolean {
    return this.isHinge(node) || this.isSliding(node);
  }

  static isDuplicate(node: BlenderNode): boolean {
    if (!this.isNodeGroup(node) || !node.node_tree) return false;
    const name = node.node_tree.name.toLowerCase();
    return name.includes('duplicate_joints_on_parent') || name.includes('duplicate joints on parent');
  }

  static isSwitch(node: BlenderNode): boolean {
    return node.bl_idname.includes('Switch');
  }

  static isAddMetadata(node: BlenderNode): boolean {
    if (!this.isNodeGroup(node) || !node.node_tree) return false;
    const name = node.node_tree.name.toLowerCase();
    return name.includes('add_jointed_geometry_metadata') || name.includes('add jointed geometry metadata');
  }

  static getStringInput(node: BlenderNode, inputName: string): string {
    if (!node.inputs || !(inputName in node.inputs)) return '';
    const input = node.inputs[inputName];
    if (input.links && input.links.length > 0) {
      return input.links[0].from_node?.string || '';
    }
    return input.default_value || '';
  }

  static setDefaultJointState(node: BlenderNode): void {
    if (node.inputs?.['Show Joint']) {
      node.inputs['Show Joint'].links = [];
      node.inputs['Show Joint'].default_value = false;
    }
    if (node.inputs?.['Value']) {
      node.inputs['Value'].links = [];
      node.inputs['Value'].default_value = 0.0;
    }
  }
}

/**
 * Kinematic Compiler - Compiles Blender geometry nodes to kinematic graph
 */
export class KinematicCompiler {
  private blendToKinematicNode: Map<BlenderNode, KinematicNode> = new Map();
  private semanticLabels: Record<string, any> = {};
  private visited: Set<BlenderNode> = new Set();

  compile(obj: any): Record<string, any> {
    KinematicNode.resetCounts();
    const mods: NodesModifier[] = (obj.modifiers || []).filter((mod: any) => mod.type === 'NODES');

    if (mods.length === 0) {
      console.error('No NODES modifiers found');
      return { graph: {}, metadata: {}, labels: [] };
    }

    const geoGraph = this.getGeometryGraph(mods);
    const outputNode = KinematicUtils.getNodeByIdname(mods[mods.length - 1].node_group, 'NodeGroupOutput');

    if (!outputNode) {
      return { graph: {}, metadata: {}, labels: [] };
    }

    const root = this.buildKinematicGraph(outputNode, geoGraph);
    root.setIdn(0);

    const metadata: Record<string, any> = {};
    for (const [key, labels] of Object.entries(this.semanticLabels)) {
      metadata[key] = {
        'joint label': labels.joint || key,
        'parent body label': labels.parent || `${key}parent`,
        'child body label': labels.child || `${key}child`,
      };
    }

    return {
      graph: root.getGraph(),
      metadata,
      labels: this.getLabels(mods[mods.length - 1].node_group),
    };
  }

  private getGeometryGraph(mods: NodesModifier[]): Map<BlenderNode, Array<[BlenderNode, any]>> {
    const geoGraph = new Map();
    const visitedLinks = new Set();
    const outputNode = KinematicUtils.getNodeByIdname(mods[0].node_group, 'NodeGroupOutput');
    
    if (outputNode?.inputs?.['Geometry']?.links?.[0]) {
      const { fromNode, toNodes } = this.getFunctionalGeonodes(outputNode.inputs['Geometry'].links[0], visitedLinks);
      this.addToGraph(geoGraph, fromNode, toNodes);
    }

    const queue = mods.map((mod) => mod.node_group);
    const seenGroups = new Set();

    while (queue.length > 0) {
      const nodeTree = queue.shift()!;
      if (seenGroups.has(nodeTree)) continue;
      seenGroups.add(nodeTree);

      for (const node of nodeTree.nodes) {
        if (KinematicUtils.isNodeGroup(node) && node.node_tree && !node.node_tree.name.toLowerCase().includes('joint')) {
          queue.push(node.node_tree);
        }
      }

      for (const link of nodeTree.links) {
        if (link.to_socket?.type === 'GEOMETRY') {
          const { fromNode, toNodes } = this.getFunctionalGeonodes(link, visitedLinks);
          this.addToGraph(geoGraph, fromNode, toNodes);
        }
      }
    }

    return geoGraph;
  }

  private addToGraph(graph: Map<any, any>, fromNode: any, toNodes: any[]) {
    for (const [toNode, link] of toNodes) {
      if (!graph.has(toNode)) graph.set(toNode, []);
      graph.get(toNode).push([fromNode, link]);
    }
  }

  private getFunctionalGeonodes(link: any, visited: Set<any>): { fromNode: BlenderNode; toNodes: Array<[BlenderNode, any]> } {
    const toNodes: Array<[BlenderNode, any]> = [];
    let fromNode = link.from_node;
    let fromSocket = link.from_socket;

    while (KinematicUtils.isNodeGroup(fromNode)) {
      if (fromNode.node_tree?.name.toLowerCase().includes('joint')) break;
      const innerOutput = KinematicUtils.getNodeByIdname(fromNode.node_tree!, 'NodeGroupOutput');
      if (innerOutput?.inputs?.[fromSocket?.name]?.links?.[0]) {
        const prevLink = innerOutput.inputs[fromSocket.name].links[0];
        fromSocket = prevLink.from_socket;
        fromNode = prevLink.from_node;
      } else break;
    }

    const recurseForward = (node: BlenderNode, socketName: string, link: any) => {
      if (visited.has(link)) return;
      if (!KinematicUtils.isNodeGroup(node) || !node.node_tree?.name.toLowerCase().includes('joint')) {
        toNodes.push([node, link]);
        return;
      }
      const innerInput = KinematicUtils.getNodeByIdname(node.node_tree!, 'NodeGroupInput');
      for (const l of innerInput?.outputs?.[socketName]?.links || []) {
        recurseForward(l.to_node, l.to_socket?.name, l);
      }
    };

    recurseForward(link.to_node, link.to_socket?.name, link);
    return { fromNode, toNodes };
  }

  private buildKinematicGraph(blendNode: BlenderNode, geoGraph: Map<BlenderNode, any[]>): KinematicNode {
    if (this.visited.has(blendNode)) return this.blendToKinematicNode.get(blendNode)!;

    const root = this.getKinematicNode(blendNode);
    if (KinematicUtils.isJoint(blendNode)) KinematicUtils.setDefaultJointState(blendNode);

    const children = geoGraph.get(blendNode) || [];

    if (KinematicUtils.isJoin(blendNode) || KinematicUtils.isJoint(blendNode)) {
      children.forEach(([child, link], i) => {
        const childSubgraph = this.buildKinematicGraph(child, geoGraph);
        let idx = KinematicUtils.isJoint(blendNode) ? (link.to_socket?.name === 'Child' ? 1 : 0) : i;
        
        if (KinematicUtils.isJoint(blendNode)) {
          this.semanticLabels[root.idn] = {
            joint: KinematicUtils.getStringInput(blendNode, 'Joint Label') || root.idn,
            parent: KinematicUtils.getStringInput(blendNode, 'Parent Label') || `${root.idn}parent`,
            child: KinematicUtils.getStringInput(blendNode, 'Child Label') || `${root.idn}child`,
          };
        }
        this.addChild(root, childSubgraph, idx);
      });
    } else if (KinematicUtils.isDuplicate(blendNode)) {
      children.forEach(([child, link]) => {
        if (link.to_socket?.name !== 'Points') {
          const childSubgraph = this.buildKinematicGraph(child, geoGraph);
          this.addChild(root, childSubgraph, link.to_socket?.name === 'Child' ? 1 : 0);
        }
      });
    } else if (KinematicUtils.isSwitch(blendNode)) {
      children.forEach(([child, link], i) => {
        const childSubgraph = this.buildKinematicGraph(child, geoGraph);
        const idx = blendNode.bl_idname.includes('IndexSwitch') 
          ? parseInt(link.to_socket?.name, 10) || 0 
          : (link.to_socket?.name === 'False' ? 0 : 1);
        this.addChild(root, childSubgraph, idx);
      });
    } else {
      children.forEach(([child], i) => {
        this.addChild(root, this.buildKinematicGraph(child, geoGraph), i);
      });
    }

    this.visited.add(blendNode);
    return root;
  }

  private getKinematicNode(blendNode: BlenderNode): KinematicNode {
    if (this.blendToKinematicNode.has(blendNode)) return this.blendToKinematicNode.get(blendNode)!;

    let kinematicType = KinematicType.NONE;
    let jointType = JointType.NONE;

    if (KinematicUtils.isJoin(blendNode)) { kinematicType = KinematicType.JOINT; jointType = JointType.WELD; }
    else if (KinematicUtils.isHinge(blendNode)) { kinematicType = KinematicType.JOINT; jointType = JointType.HINGE; }
    else if (KinematicUtils.isSliding(blendNode)) { kinematicType = KinematicType.JOINT; jointType = JointType.SLIDING; }
    else if (KinematicUtils.isDuplicate(blendNode)) { kinematicType = KinematicType.DUPLICATE; }
    else if (KinematicUtils.isSwitch(blendNode)) { kinematicType = KinematicType.SWITCH; }

    const newNode = kinematicNodeFactory(kinematicType, jointType);
    this.blendToKinematicNode.set(blendNode, newNode);
    return newNode;
  }

  private addChild(node: KinematicNode, child: KinematicNode, idx: number) {
    if (child.kinematicType === KinematicType.NONE) {
      if (child.children.length === 0) {
        node.addChild(idx, kinematicNodeFactory(KinematicType.ASSET));
      } else {
        child.getAllChildren().forEach((gc) => {
          node.addChild(idx, gc.kinematicType !== KinematicType.NONE ? gc : kinematicNodeFactory(KinematicType.ASSET));
        });
      }
    } else {
      node.addChild(idx, child);
    }
  }

  private getLabels(nodeTree: NodeTree): string[] {
    const labels: string[] = [];
    const queue: NodeTree[] = [nodeTree];
    while (queue.length > 0) {
      const nt = queue.shift()!;
      for (const node of nt.nodes) {
        if (KinematicUtils.isNodeGroup(node) && node.node_tree && !node.node_tree.name.toLowerCase().includes('joint')) {
          queue.push(node.node_tree);
        }
        if (KinematicUtils.isAddMetadata(node)) {
          const label = KinematicUtils.getStringInput(node, 'Label');
          if (label) labels.push(label);
        }
      }
    }
    return labels;
  }
}

// ============================================================================
// Kinematic Node Tree (DAG representation)
// ============================================================================

/**
 * Entry in the KinematicNodeTree representing a single node in the DAG.
 * Each node can be a JOINT, ASSET, SWITCH, DUPLICATE, or NONE type,
 * matching Infinigen's core/sim/kinematic_compiler.py node classification.
 */
export interface KinematicNodeEntry {
  /** Unique node identifier */
  id: string;
  /** Kinematic type classification */
  kinematicType: KinematicType;
  /** Joint type if this is a JOINT node */
  jointType?: JointType;
  /** Parent node ID (null for root) */
  parentId: string | null;
  /** Child node IDs */
  childIds: string[];
  /** Named attribute path for mesh subsetting (e.g. 'body_0', 'door_leaf') */
  pathAttribute: string;
  /** Arbitrary metadata: joint parameters, asset references, etc. */
  metadata: Record<string, any>;
}

/**
 * KinematicNodeTree — DAG representation of an articulated object's kinematic
 * structure, matching Infinigen's core/sim/kinematic_compiler.py output.
 *
 * The tree is built from JointInfo[] by `compileKinematicTree()` and consumed
 * by `RigidBodySkeleton` to produce a simplified rigid-body hierarchy for
 * physics simulation.
 */
export class KinematicNodeTree {
  /** Map of node ID → KinematicNodeEntry */
  nodes: Map<string, KinematicNodeEntry> = new Map();
  /** ID of the root node */
  rootId: string = '';
  /** Joint parameters, asset references, and other metadata */
  metadata: Record<string, any> = {};
  /** Semantic labels extracted from the node graph */
  labels: string[] = [];

  /**
   * Add a node to the tree.
   */
  addNode(entry: KinematicNodeEntry): void {
    this.nodes.set(entry.id, entry);
    if (entry.parentId === null) {
      this.rootId = entry.id;
    }
  }

  /**
   * Get a node by ID.
   */
  getNode(id: string): KinematicNodeEntry | undefined {
    return this.nodes.get(id);
  }

  /**
   * Return all node IDs in breadth-first order starting from the root.
   */
  bfsOrder(): string[] {
    if (!this.rootId) return [];
    const order: string[] = [];
    const queue: string[] = [this.rootId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);

      const node = this.nodes.get(id);
      if (node) {
        for (const childId of node.childIds) {
          if (!visited.has(childId)) {
            queue.push(childId);
          }
        }
      }
    }
    return order;
  }

  /**
   * Return the depth of the tree (longest root-to-leaf path).
   */
  depth(): number {
    if (!this.rootId) return 0;
    const computeDepth = (id: string, memo: Map<string, number> = new Map()): number => {
      if (memo.has(id)) return memo.get(id)!;
      const node = this.nodes.get(id);
      if (!node || node.childIds.length === 0) {
        memo.set(id, 1);
        return 1;
      }
      let maxChildDepth = 0;
      for (const childId of node.childIds) {
        maxChildDepth = Math.max(maxChildDepth, computeDepth(childId, memo));
      }
      const d = 1 + maxChildDepth;
      memo.set(id, d);
      return d;
    };
    return computeDepth(this.rootId);
  }
}

// ============================================================================
// compileKinematicTree — Build KinematicNodeTree from ArticulatedObjectResult
// ============================================================================

/**
 * Map an ArticulatedJointType (from types.ts) to a KinematicType enum value.
 *
 * Mapping rules (matching Infinigen's kinematic_compiler.py):
 * - hinge / continuous → JOINT (articulated rotational)
 * - prismatic          → JOINT (articulated linear)
 * - ball / ball_socket → JOINT (multi-DOF)
 * - fixed              → NONE (no kinematic degree of freedom)
 */
function articulatedJointTypeToKinematicType(type: ArticulatedJointType): KinematicType {
  switch (type) {
    case 'hinge':
    case 'continuous':
    case 'prismatic':
    case 'ball':
    case 'ball_socket':
      return KinematicType.JOINT;
    case 'fixed':
      return KinematicType.NONE;
    default:
      return KinematicType.NONE;
  }
}

/**
 * Map an ArticulatedJointType to the KinematicNode JointType enum.
 */
function articulatedJointTypeToNodeJointType(type: ArticulatedJointType): JointType {
  switch (type) {
    case 'hinge':
    case 'continuous':
      return JointType.HINGE;
    case 'prismatic':
      return JointType.SLIDING;
    case 'ball':
    case 'ball_socket':
      return JointType.Ball;
    case 'fixed':
      return JointType.WELD;
    default:
      return JointType.NONE;
  }
}

/**
 * Compile an ArticulatedObjectResult into a KinematicNodeTree DAG.
 *
 * This is the R3F equivalent of Infinigen's
 * `core/sim/kinematic_compiler.compile_kinematic_tree()`. It:
 * 1. Creates a root node from the base mesh
 * 2. For each joint, creates a JOINT node and an ASSET child node
 * 3. Assigns path attributes for mesh subsetting
 * 4. Stores joint parameters (axis, limits, damping, friction) in metadata
 *
 * @param articulatedResult - The articulated object result containing joints and mesh hierarchy
 * @returns A KinematicNodeTree representing the kinematic structure
 */
export function compileKinematicTree(
  articulatedResult: ArticulatedObjectResult
): KinematicNodeTree {
  const tree = new KinematicNodeTree();
  const joints = articulatedResult.joints;

  if (joints.length === 0) {
    // Single rigid body — root is an ASSET
    const rootId = `${articulatedResult.category}_root`;
    tree.addNode({
      id: rootId,
      kinematicType: KinematicType.ASSET,
      parentId: null,
      childIds: [],
      pathAttribute: 'root',
      metadata: { category: articulatedResult.category },
    });
    tree.rootId = rootId;
    return tree;
  }

  // Identify the root mesh — the one that appears as parentMesh but never as childMesh
  const childMeshes = new Set(joints.map((j) => j.childMesh));
  const parentMeshes = new Set(joints.map((j) => j.parentMesh).filter((p) => p !== ''));

  let rootMesh = '';
  for (const pm of parentMeshes) {
    if (!childMeshes.has(pm)) {
      rootMesh = pm;
      break;
    }
  }
  // Fallback: use the first joint's parent
  if (!rootMesh && joints.length > 0) {
    rootMesh = joints[0].parentMesh || `${articulatedResult.category}_base`;
  }

  // Create root ASSET node
  const rootId = rootMesh;
  tree.addNode({
    id: rootId,
    kinematicType: KinematicType.ASSET,
    parentId: null,
    childIds: [],
    pathAttribute: rootMesh,
    metadata: { category: articulatedResult.category, isRoot: true },
  });

  // Track which meshes have been added as nodes
  const meshToNodeId = new Map<string, string>();
  meshToNodeId.set(rootMesh, rootId);

  // Process joints in order, building the tree
  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    const kinematicType = articulatedJointTypeToKinematicType(joint.type);
    const nodeJointType = articulatedJointTypeToNodeJointType(joint.type);

    // Create JOINT node for the joint itself
    const jointNodeId = `joint_${joint.id}`;
    const parentMeshId = joint.parentMesh || rootId;

    // Ensure parent mesh has a node
    if (!meshToNodeId.has(parentMeshId) && parentMeshId) {
      const assetNodeId = `asset_${parentMeshId}`;
      tree.addNode({
        id: assetNodeId,
        kinematicType: KinematicType.ASSET,
        parentId: rootId,
        childIds: [],
        pathAttribute: parentMeshId,
        metadata: { meshName: parentMeshId },
      });
      // Link to root if root exists
      const rootNode = tree.getNode(rootId);
      if (rootNode) {
        rootNode.childIds.push(assetNodeId);
      }
      meshToNodeId.set(parentMeshId, assetNodeId);
    }

    const parentNodeId = meshToNodeId.get(parentMeshId) || rootId;

    tree.addNode({
      id: jointNodeId,
      kinematicType,
      jointType: nodeJointType,
      parentId: parentNodeId,
      childIds: [],
      pathAttribute: joint.id,
      metadata: {
        jointType: joint.type,
        axis: { x: joint.axis.x, y: joint.axis.y, z: joint.axis.z },
        limits: { min: joint.limits.min, max: joint.limits.max },
        damping: joint.damping,
        friction: joint.friction,
        actuated: joint.actuated,
        anchor: { x: joint.anchor.x, y: joint.anchor.y, z: joint.anchor.z },
      },
    });

    // Link parent → joint
    const parentNode = tree.getNode(parentNodeId);
    if (parentNode) {
      parentNode.childIds.push(jointNodeId);
    }

    // Create ASSET node for the child mesh
    const childMeshId = joint.childMesh;
    const childAssetNodeId = `asset_${childMeshId}`;

    tree.addNode({
      id: childAssetNodeId,
      kinematicType: KinematicType.ASSET,
      parentId: jointNodeId,
      childIds: [],
      pathAttribute: childMeshId,
      metadata: { meshName: childMeshId },
    });

    // Link joint → child asset
    const jointNode = tree.getNode(jointNodeId);
    if (jointNode) {
      jointNode.childIds.push(childAssetNodeId);
    }

    meshToNodeId.set(childMeshId, childAssetNodeId);
  }

  // Extract labels from metadata
  tree.labels = joints
    .filter((j) => j.actuated)
    .map((j) => j.id);

  // Store global metadata
  tree.metadata = {
    category: articulatedResult.category,
    jointCount: joints.length,
    actuatedCount: joints.filter((j) => j.actuated).length,
  };

  return tree;
}

// ============================================================================
// RigidBodyNode — Single rigid body in the physics skeleton
// ============================================================================

/**
 * A single rigid body in the articulated physics skeleton.
 * Each RigidBodyNode represents a physical body connected to its parent
 * via a joint (or weld). This is the output of RigidBodySkeleton's
 * simplification pass.
 */
export class RigidBodyNode {
  /** Unique identifier */
  id: string;
  /** Parent body ID (null for root / base body) */
  parentId: string | null;
  /** Joint type connecting this body to its parent */
  jointType: ArticulatedJointType | 'weld';
  /** Joint axis in the parent body's local frame */
  jointAxis: THREE.Vector3;
  /** Joint limits (min, max) in radians or meters */
  jointLimits: { min: number; max: number };
  /** Joint dynamics parameters */
  jointDynamics: { stiffness: number; damping: number; friction: number };
  /** Named path attribute identifying which mesh subset this body uses */
  meshSubset: string;
  /** Shape category for fill-factor estimation (e.g. 'box', 'cylinder', 'sphere') */
  category?: string;
  /** Child bodies */
  children: RigidBodyNode[];

  constructor(params: {
    id: string;
    parentId?: string | null;
    jointType?: ArticulatedJointType | 'weld';
    jointAxis?: THREE.Vector3;
    jointLimits?: { min: number; max: number };
    jointDynamics?: { stiffness: number; damping: number; friction: number };
    meshSubset?: string;
    category?: string;
  }) {
    this.id = params.id;
    this.parentId = params.parentId ?? null;
    this.jointType = params.jointType ?? 'weld';
    this.jointAxis = params.jointAxis ?? new THREE.Vector3(0, 1, 0);
    this.jointLimits = params.jointLimits ?? { min: 0, max: 0 };
    this.jointDynamics = params.jointDynamics ?? { stiffness: 0, damping: 0, friction: 0 };
    this.meshSubset = params.meshSubset ?? '';
    this.category = params.category;
    this.children = [];
  }

  /**
   * Check if this body is connected to its parent via a fixed/weld joint
   * (no degrees of freedom).
   */
  isWelded(): boolean {
    return this.jointType === 'weld' || this.jointType === 'fixed';
  }

  /**
   * Check if this body has any articulation (non-fixed joint).
   */
  isArticulated(): boolean {
    return !this.isWelded();
  }

  /**
   * Collect all descendant body IDs.
   */
  descendantIds(): string[] {
    const ids: string[] = [];
    const collect = (node: RigidBodyNode) => {
      for (const child of node.children) {
        ids.push(child.id);
        collect(child);
      }
    };
    collect(this);
    return ids;
  }
}

// ============================================================================
// RigidBodySkeleton — Simplified rigid-body tree for physics simulation
// ============================================================================

/**
 * RigidBodySkeleton — A tree of rigid bodies connected by joints,
 * produced by simplifying a KinematicNodeTree.
 *
 * This is the R3F equivalent of Infinigen's
 * `core/sim/kinematic_compiler.construct_rigid_body_skeleton()`. The key
 * simplification step merges bodies connected by WELD/NONE joints, which
 * reduces the number of physics bodies while preserving the kinematic
 * degrees of freedom.
 *
 * Usage:
 * ```ts
 * const tree = compileKinematicTree(articulatedResult);
 * const skeleton = new RigidBodySkeleton();
 * skeleton.construct(tree);
 * const bodies = skeleton.bodies; // simplified rigid body tree
 * ```
 */
export class RigidBodySkeleton {
  /** Flat list of all rigid body nodes in the skeleton (root at index 0) */
  bodies: RigidBodyNode[] = [];
  /** Root body of the skeleton tree */
  rootBody: RigidBodyNode | null = null;
  /** Map from node ID to RigidBodyNode for fast lookup */
  private bodyMap: Map<string, RigidBodyNode> = new Map();

  /**
   * Construct the rigid body skeleton from a KinematicNodeTree.
   * This first builds the full skeleton, then simplifies it by merging
   * weld-connected bodies.
   *
   * @param tree - The kinematic node tree to construct from
   */
  construct(tree: KinematicNodeTree): void {
    this.bodies = [];
    this.bodyMap = new Map();
    this.rootBody = null;

    this._construct_rigid_body_skeleton(tree);
    this._simplify_skeleton();
  }

  /**
   * Build the initial rigid body skeleton from a KinematicNodeTree.
   * Dispatches on kinematic type to create the appropriate body structure.
   *
   * @param tree - The kinematic node tree
   */
  private _construct_rigid_body_skeleton(tree: KinematicNodeTree): void {
    const order = tree.bfsOrder();
    if (order.length === 0) return;

    // Create a RigidBodyNode for each tree node
    for (const nodeId of order) {
      const entry = tree.getNode(nodeId);
      if (!entry) continue;

      let jointType: ArticulatedJointType | 'weld' = 'weld';
      let jointAxis = new THREE.Vector3(0, 1, 0);
      let jointLimits = { min: 0, max: 0 };
      let jointDynamics = { stiffness: 0, damping: 0, friction: 0 };

      if (entry.kinematicType === KinematicType.JOINT && entry.metadata) {
        // Map from metadata back to articulated joint type
        const metaJointType = entry.metadata.jointType as ArticulatedJointType | undefined;
        if (metaJointType) {
          jointType = metaJointType;
        }

        // Extract joint axis
        if (entry.metadata.axis) {
          const a = entry.metadata.axis;
          jointAxis = new THREE.Vector3(a.x, a.y, a.z);
        }

        // Extract joint limits
        if (entry.metadata.limits) {
          jointLimits = { min: entry.metadata.limits.min, max: entry.metadata.limits.max };
        }

        // Extract joint dynamics
        jointDynamics = {
          stiffness: 0,
          damping: entry.metadata.damping ?? 0,
          friction: entry.metadata.friction ?? 0,
        };
      }

      // Dispatch on kinematic type
      switch (entry.kinematicType) {
        case KinematicType.JOINT:
          // Joint nodes create a body with the joint connection
          // The child ASSET node will be merged with this joint body during simplification
          break;
        case KinematicType.ASSET:
          // Asset nodes become rigid bodies, potentially welded to parent
          jointType = 'weld';
          break;
        case KinematicType.SWITCH:
          // Switch nodes: treat as weld (select one branch)
          jointType = 'weld';
          break;
        case KinematicType.DUPLICATE:
          // Duplicate nodes: treat as weld (replicate structure)
          jointType = 'weld';
          break;
        case KinematicType.NONE:
        default:
          // NONE-type nodes are welded to their parent
          jointType = 'weld';
          break;
      }

      const body = new RigidBodyNode({
        id: nodeId,
        parentId: entry.parentId,
        jointType,
        jointAxis,
        jointLimits,
        jointDynamics,
        meshSubset: entry.pathAttribute,
      });

      this.bodyMap.set(nodeId, body);
      this.bodies.push(body);
    }

    // Build parent-child relationships
    for (const body of this.bodies) {
      if (body.parentId !== null) {
        const parentBody = this.bodyMap.get(body.parentId);
        if (parentBody) {
          parentBody.children.push(body);
        }
      }
    }

    // Set root body
    this.rootBody = this.bodyMap.get(tree.rootId) || null;
  }

  /**
   * Simplify the skeleton by merging bodies connected by WELD/NONE joints.
   *
   * This is the key gap-filling operation from Infinigen's kinematic_compiler:
   * bodies that are rigidly connected (no degrees of freedom between them)
   * should be merged into a single physics body. This reduces the number of
   * rigid bodies in the simulation while preserving all kinematic DOFs.
   *
   * Algorithm:
   * 1. Walk the tree top-down (BFS)
   * 2. For each body connected via a weld/fixed joint to its parent:
   *    a. Merge the child into the parent (combine mesh subsets)
   *    b. Re-attach the child's children to the parent
   * 3. Repeat until no more merges are possible
   */
  private _simplify_skeleton(): void {
    if (!this.rootBody) return;

    let changed = true;
    while (changed) {
      changed = false;
      const queue: RigidBodyNode[] = [this.rootBody!];

      while (queue.length > 0) {
        const parent = queue.shift()!;

        // Iterate children in reverse so we can safely splice
        for (let i = parent.children.length - 1; i >= 0; i--) {
          const child = parent.children[i];

          if (child.isWelded()) {
            // Merge child into parent
            // Combine mesh subsets (comma-separated)
            const parentSubset = parent.meshSubset;
            const childSubset = child.meshSubset;
            if (parentSubset && childSubset) {
              parent.meshSubset = `${parentSubset},${childSubset}`;
            } else if (childSubset) {
              parent.meshSubset = childSubset;
            }

            // Re-attach child's children to parent
            for (const grandchild of child.children) {
              grandchild.parentId = parent.id;
              parent.children.push(grandchild);
            }

            // Remove child from parent's children list
            parent.children.splice(i, 1);

            // Remove child from bodies list and bodyMap
            const bodyIdx = this.bodies.indexOf(child);
            if (bodyIdx !== -1) {
              this.bodies.splice(bodyIdx, 1);
            }
            this.bodyMap.delete(child.id);

            changed = true;
          }
        }

        // Add remaining (non-merged) children to queue
        for (const child of parent.children) {
          queue.push(child);
        }
      }
    }
  }

  /**
   * Extract per-body mesh subsets from a combined BufferGeometry using
   * named path attributes.
   *
   * In Infinigen, each face of the combined mesh has a named string attribute
   * that identifies which rigid body it belongs to. This method splits the
   * geometry into separate BufferGeometry instances, one per body.
   *
   * @param geometry - The combined BufferGeometry with path attributes
   * @param pathAttribute - Name of the string attribute encoding body membership
   * @returns Map from body ID to its sub-geometry
   */
  _get_subsets(
    geometry: THREE.BufferGeometry,
    pathAttribute: string
  ): Map<string, THREE.BufferGeometry> {
    const subsets = new Map<string, THREE.BufferGeometry>();

    // Get the path attribute data
    const attr = geometry.getAttribute(pathAttribute);
    if (!attr) {
      // If no path attribute, return entire geometry as single subset
      subsets.set('root', geometry.clone());
      return subsets;
    }

    // Get index buffer for face iteration
    const index = geometry.getIndex();
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return subsets;

    // Collect unique path values and map faces to paths
    const pathGroups = new Map<string, number[]>();

    if (index) {
      // Indexed geometry — iterate over triangles
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        const b = index.getX(i + 1);
        const c = index.getX(i + 2);

        // Use the first vertex of the triangle to determine the path
        const pathValue = this._getPathValue(attr, a);
        if (!pathGroups.has(pathValue)) {
          pathGroups.set(pathValue, []);
        }
        pathGroups.get(pathValue)!.push(a, b, c);
      }
    } else {
      // Non-indexed geometry — every 3 vertices form a triangle
      for (let i = 0; i < posAttr.count; i += 3) {
        const pathValue = this._getPathValue(attr, i);
        if (!pathGroups.has(pathValue)) {
          pathGroups.set(pathValue, []);
        }
        pathGroups.get(pathValue)!.push(i, i + 1, i + 2);
      }
    }

    // Build a sub-geometry for each path group
    for (const [pathValue, indices] of pathGroups) {
      const subGeo = new THREE.BufferGeometry();

      // Build vertex data for this subset
      const vertexMap = new Map<number, number>();
      const newPositions: number[] = [];
      const newIndices: number[] = [];

      let newVertexIdx = 0;
      for (const origIdx of indices) {
        if (!vertexMap.has(origIdx)) {
          vertexMap.set(origIdx, newVertexIdx);
          // Copy position
          newPositions.push(
            posAttr.getX(origIdx),
            posAttr.getY(origIdx),
            posAttr.getZ(origIdx)
          );
          // Copy other standard attributes if present
          newVertexIdx++;
        }
        newIndices.push(vertexMap.get(origIdx)!);
      }

      subGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
      subGeo.setIndex(newIndices);
      subGeo.computeVertexNormals();

      subsets.set(pathValue, subGeo);
    }

    return subsets;
  }

  /**
   * Extract a string path value from a geometry attribute at the given index.
   * Handles both string-typed and numeric-typed attributes.
   * Accepts both BufferAttribute and InterleavedBufferAttribute since
   * THREE.BufferGeometry.getAttribute() returns their union type.
   */
  private _getPathValue(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number): string {
    // THREE.js doesn't natively support string attributes in BufferAttribute,
    // so we handle the common convention: integer IDs stored as floats
    const val = attr.getX(index);
    if (Number.isInteger(val)) {
      return String(Math.round(val));
    }
    return val.toFixed(4);
  }

  /**
   * Get a body by ID.
   */
  getBody(id: string): RigidBodyNode | undefined {
    return this.bodyMap.get(id);
  }

  /**
   * Count the number of articulated (non-welded) bodies in the skeleton.
   */
  articulatedBodyCount(): number {
    return this.bodies.filter((b) => b.isArticulated()).length;
  }

  /**
   * Count total bodies including welded ones.
   */
  totalBodyCount(): number {
    return this.bodies.length;
  }
}

export default KinematicCompiler;
