/**
 * Input/Output Nodes for Infinigen R3F
 *
 * Provides nodes for managing data flow, object references, and collection operations.
 * Based on Blender Geometry Nodes input/output system.
 *
 * @module nodes/input_output
 */
import * as THREE from 'three';
import { SocketType } from '../core/types';
import { NodeDefinition } from '../core/node-base';
/**
 * Value Node - Basic value input
 * Allows manual input of various data types
 */
export interface ValueNodeData {
    valueType: SocketType;
    defaultValue: number | THREE.Vector3 | THREE.Color | string | boolean | THREE.Matrix4;
    min?: number;
    max?: number;
    step?: number;
}
export declare const ValueNode: NodeDefinition<ValueNodeData>;
/**
 * Integer Node - Integer value input
 */
export interface IntegerNodeData {
    value: number;
    min?: number;
    max?: number;
}
export declare const IntegerNode: NodeDefinition<IntegerNodeData>;
/**
 * Float Node - Floating point value input
 */
export interface FloatNodeData {
    value: number;
    min?: number;
    max?: number;
    step?: number;
}
export declare const FloatNode: NodeDefinition<FloatNodeData>;
/**
 * Vector Node - 3D vector input
 */
export interface VectorNodeData {
    value: THREE.Vector3;
}
export declare const VectorNode: NodeDefinition<VectorNodeData>;
/**
 * Rotation Node - Euler rotation input
 */
export interface RotationNodeData {
    rotation: THREE.Euler;
    order?: THREE.EulerOrder;
}
export declare const RotationNode: NodeDefinition<RotationNodeData>;
/**
 * Scale Node - Uniform or axis-specific scale input
 */
export interface ScaleNodeData {
    scale: number | THREE.Vector3;
    uniform: boolean;
}
export declare const ScaleNode: NodeDefinition<ScaleNodeData>;
/**
 * Boolean Node - Boolean value input
 */
export interface BooleanNodeData {
    value: boolean;
}
export declare const BooleanNode: NodeDefinition<BooleanNodeData>;
/**
 * Color Node - RGB color input
 */
export interface ColorNodeData {
    color: THREE.Color;
    alpha?: number;
}
export declare const ColorNode: NodeDefinition<ColorNodeData>;
/**
 * String Node - Text string input
 */
export interface StringNodeData {
    value: string;
}
export declare const StringNode: NodeDefinition<StringNodeData>;
/**
 * Object Info Node - Get information about a scene object
 * Provides geometry, transform, and attributes from an object reference
 */
export interface ObjectInfoNodeData {
    objectRef: string | null;
    transformSpace: 'world' | 'local' | 'instance';
    separateChildren: boolean;
}
export declare const ObjectInfoNode: NodeDefinition<ObjectInfoNodeData>;
/**
 * Collection Info Node - Get objects from a collection
 */
export interface CollectionInfoNodeData {
    collectionRef: string | null;
    instanceChildren: boolean;
}
export declare const CollectionInfoNode: NodeDefinition<CollectionInfoNodeData>;
/**
 * Self Object Node - Reference to the object being modified
 */
export interface SelfObjectNodeData {
    includeChildren: boolean;
}
export declare const SelfObjectNode: NodeDefinition<SelfObjectNodeData>;
/**
 * Join Geometry Node - Combine multiple geometries into one
 */
export interface JoinGeometryNodeData {
    mergeMaterials: boolean;
    preserveAttributes: boolean;
}
export declare const JoinGeometryNode: NodeDefinition<JoinGeometryNodeData>;
/**
 * Group Output Node - Define node group outputs
 */
export interface GroupOutputNodeData {
    groupName: string;
}
export declare const GroupOutputNode: NodeDefinition<GroupOutputNodeData>;
export declare const InputOutputNodes: {
    Value: NodeDefinition<ValueNodeData>;
    Integer: NodeDefinition<IntegerNodeData>;
    Float: NodeDefinition<FloatNodeData>;
    Vector: NodeDefinition<VectorNodeData>;
    Rotation: NodeDefinition<RotationNodeData>;
    Scale: NodeDefinition<ScaleNodeData>;
    Boolean: NodeDefinition<BooleanNodeData>;
    Color: NodeDefinition<ColorNodeData>;
    String: NodeDefinition<StringNodeData>;
    ObjectInfo: NodeDefinition<ObjectInfoNodeData>;
    CollectionInfo: NodeDefinition<CollectionInfoNodeData>;
    SelfObject: NodeDefinition<SelfObjectNodeData>;
    JoinGeometry: NodeDefinition<JoinGeometryNodeData>;
    GroupOutput: NodeDefinition<GroupOutputNodeData>;
};
export type { ValueNodeData, IntegerNodeData, FloatNodeData, VectorNodeData, RotationNodeData, ScaleNodeData, BooleanNodeData, ColorNodeData, StringNodeData, ObjectInfoNodeData, CollectionInfoNodeData, SelfObjectNodeData, JoinGeometryNodeData, GroupOutputNodeData };
//# sourceMappingURL=InputOutputNodes.d.ts.map