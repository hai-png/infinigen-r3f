/**
 * Copyright (C) 2025, Princeton University.
 * This source code is licensed under the BSD 3-Clause license.
 *
 * Authors: Ported from Python InfiniGen
 * - Abhishek Joshi (original Python author)
 */
import { KinematicNode, kinematicNodeFactory, KinematicType, JointType } from './KinematicNode';
/**
 * Utility functions for kinematic compilation
 */
export class KinematicUtils {
    static getNodeByIdname(nodeTree, blIdname) {
        return nodeTree.nodes.find((node) => node.bl_idname === blIdname);
    }
    static isNodeGroup(node) {
        return node.bl_idname === 'GeometryNodeGroup';
    }
    static isJoin(node) {
        return node.bl_idname === 'GeometryNodeJoinGeometry';
    }
    static isHinge(node) {
        if (!this.isNodeGroup(node) || !node.node_tree)
            return false;
        const name = node.node_tree.name.toLowerCase();
        return name.includes('hinge_joint') || name.includes('hinge joint');
    }
    static isSliding(node) {
        if (!this.isNodeGroup(node) || !node.node_tree)
            return false;
        const name = node.node_tree.name.toLowerCase();
        return name.includes('sliding_joint') || name.includes('sliding joint');
    }
    static isJoint(node) {
        return this.isHinge(node) || this.isSliding(node);
    }
    static isDuplicate(node) {
        if (!this.isNodeGroup(node) || !node.node_tree)
            return false;
        const name = node.node_tree.name.toLowerCase();
        return name.includes('duplicate_joints_on_parent') || name.includes('duplicate joints on parent');
    }
    static isSwitch(node) {
        return node.bl_idname.includes('Switch');
    }
    static isAddMetadata(node) {
        if (!this.isNodeGroup(node) || !node.node_tree)
            return false;
        const name = node.node_tree.name.toLowerCase();
        return name.includes('add_jointed_geometry_metadata') || name.includes('add jointed geometry metadata');
    }
    static getStringInput(node, inputName) {
        if (!node.inputs || !(inputName in node.inputs))
            return '';
        const input = node.inputs[inputName];
        if (input.links && input.links.length > 0) {
            return input.links[0].from_node?.string || '';
        }
        return input.default_value || '';
    }
    static setDefaultJointState(node) {
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
    constructor() {
        this.blendToKinematicNode = new Map();
        this.semanticLabels = {};
        this.visited = new Set();
    }
    compile(obj) {
        KinematicNode.resetCounts();
        const mods = (obj.modifiers || []).filter((mod) => mod.type === 'NODES');
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
        root.setIdn('root');
        const metadata = {};
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
    getGeometryGraph(mods) {
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
            const nodeTree = queue.shift();
            if (seenGroups.has(nodeTree))
                continue;
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
    addToGraph(graph, fromNode, toNodes) {
        for (const [toNode, link] of toNodes) {
            if (!graph.has(toNode))
                graph.set(toNode, []);
            graph.get(toNode).push([fromNode, link]);
        }
    }
    getFunctionalGeonodes(link, visited) {
        const toNodes = [];
        let fromNode = link.from_node;
        let fromSocket = link.from_socket;
        while (KinematicUtils.isNodeGroup(fromNode)) {
            if (fromNode.node_tree?.name.toLowerCase().includes('joint'))
                break;
            const innerOutput = KinematicUtils.getNodeByIdname(fromNode.node_tree, 'NodeGroupOutput');
            if (innerOutput?.inputs?.[fromSocket?.name]?.links?.[0]) {
                const prevLink = innerOutput.inputs[fromSocket.name].links[0];
                fromSocket = prevLink.from_socket;
                fromNode = prevLink.from_node;
            }
            else
                break;
        }
        const recurseForward = (node, socketName, link) => {
            if (visited.has(link))
                return;
            if (!KinematicUtils.isNodeGroup(node) || !node.node_tree?.name.toLowerCase().includes('joint')) {
                toNodes.push([node, link]);
                return;
            }
            const innerInput = KinematicUtils.getNodeByIdname(node.node_tree, 'NodeGroupInput');
            for (const l of innerInput?.outputs?.[socketName]?.links || []) {
                recurseForward(l.to_node, l.to_socket?.name, l);
            }
        };
        recurseForward(link.to_node, link.to_socket?.name, link);
        return { fromNode, toNodes };
    }
    buildKinematicGraph(blendNode, geoGraph) {
        if (this.visited.has(blendNode))
            return this.blendToKinematicNode.get(blendNode);
        const root = this.getKinematicNode(blendNode);
        if (KinematicUtils.isJoint(blendNode))
            KinematicUtils.setDefaultJointState(blendNode);
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
        }
        else if (KinematicUtils.isDuplicate(blendNode)) {
            children.forEach(([child, link]) => {
                if (link.to_socket?.name !== 'Points') {
                    const childSubgraph = this.buildKinematicGraph(child, geoGraph);
                    this.addChild(root, childSubgraph, link.to_socket?.name === 'Child' ? 1 : 0);
                }
            });
        }
        else if (KinematicUtils.isSwitch(blendNode)) {
            children.forEach(([child, link], i) => {
                const childSubgraph = this.buildKinematicGraph(child, geoGraph);
                const idx = blendNode.bl_idname.includes('IndexSwitch')
                    ? parseInt(link.to_socket?.name, 10) || 0
                    : (link.to_socket?.name === 'False' ? 0 : 1);
                this.addChild(root, childSubgraph, idx);
            });
        }
        else {
            children.forEach(([child], i) => {
                this.addChild(root, this.buildKinematicGraph(child, geoGraph), i);
            });
        }
        this.visited.add(blendNode);
        return root;
    }
    getKinematicNode(blendNode) {
        if (this.blendToKinematicNode.has(blendNode))
            return this.blendToKinematicNode.get(blendNode);
        let kinematicType = KinematicType.NONE;
        let jointType = JointType.NONE;
        if (KinematicUtils.isJoin(blendNode)) {
            kinematicType = KinematicType.JOINT;
            jointType = JointType.WELD;
        }
        else if (KinematicUtils.isHinge(blendNode)) {
            kinematicType = KinematicType.JOINT;
            jointType = JointType.HINGE;
        }
        else if (KinematicUtils.isSliding(blendNode)) {
            kinematicType = KinematicType.JOINT;
            jointType = JointType.SLIDING;
        }
        else if (KinematicUtils.isDuplicate(blendNode)) {
            kinematicType = KinematicType.DUPLICATE;
        }
        else if (KinematicUtils.isSwitch(blendNode)) {
            kinematicType = KinematicType.SWITCH;
        }
        const newNode = kinematicNodeFactory(kinematicType, jointType);
        this.blendToKinematicNode.set(blendNode, newNode);
        return newNode;
    }
    addChild(node, child, idx) {
        if (child.kinematicType === KinematicType.NONE) {
            if (child.children.size === 0) {
                node.addChild(idx, kinematicNodeFactory(KinematicType.ASSET));
            }
            else {
                child.getAllChildren().forEach((gc) => {
                    node.addChild(idx, gc.kinematicType !== KinematicType.NONE ? gc : kinematicNodeFactory(KinematicType.ASSET));
                });
            }
        }
        else {
            node.addChild(idx, child);
        }
    }
    getLabels(nodeTree) {
        const labels = [];
        const queue = [nodeTree];
        while (queue.length > 0) {
            const nt = queue.shift();
            for (const node of nt.nodes) {
                if (KinematicUtils.isNodeGroup(node) && node.node_tree && !node.node_tree.name.toLowerCase().includes('joint')) {
                    queue.push(node.node_tree);
                }
                if (KinematicUtils.isAddMetadata(node)) {
                    const label = KinematicUtils.getStringInput(node, 'Label');
                    if (label)
                        labels.push(label);
                }
            }
        }
        return labels;
    }
}
export default KinematicCompiler;
//# sourceMappingURL=KinematicCompiler.js.map