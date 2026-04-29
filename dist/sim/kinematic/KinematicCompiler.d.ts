/**
 * Copyright (C) 2025, Princeton University.
 * This source code is licensed under the BSD 3-Clause license.
 *
 * Authors: Ported from Python InfiniGen
 * - Abhishek Joshi (original Python author)
 */
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
 * Utility functions for kinematic compilation
 */
export declare class KinematicUtils {
    static getNodeByIdname(nodeTree: NodeTree, blIdname: string): BlenderNode | undefined;
    static isNodeGroup(node: BlenderNode): boolean;
    static isJoin(node: BlenderNode): boolean;
    static isHinge(node: BlenderNode): boolean;
    static isSliding(node: BlenderNode): boolean;
    static isJoint(node: BlenderNode): boolean;
    static isDuplicate(node: BlenderNode): boolean;
    static isSwitch(node: BlenderNode): boolean;
    static isAddMetadata(node: BlenderNode): boolean;
    static getStringInput(node: BlenderNode, inputName: string): string;
    static setDefaultJointState(node: BlenderNode): void;
}
/**
 * Kinematic Compiler - Compiles Blender geometry nodes to kinematic graph
 */
export declare class KinematicCompiler {
    private blendToKinematicNode;
    private semanticLabels;
    private visited;
    compile(obj: any): Record<string, any>;
    private getGeometryGraph;
    private addToGraph;
    private getFunctionalGeonodes;
    private buildKinematicGraph;
    private getKinematicNode;
    private addChild;
    private getLabels;
}
export default KinematicCompiler;
//# sourceMappingURL=KinematicCompiler.d.ts.map