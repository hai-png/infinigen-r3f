/**
 * Collection Nodes Module
 * Collection instancing, object information, and hierarchy access
 * Ported from Blender Geometry Nodes
 */
import { Object3D, Group } from 'three';
import type { NodeBase, Domain } from '../core/types';
export interface CollectionNodeBase extends NodeBase {
    category: 'collection';
}
export interface CollectionInfoInputs {
    collection?: Group;
    instance?: boolean;
    resetChildren?: boolean;
    separator?: string;
}
export interface CollectionInfoOutputs {
    geometry: Group;
    instances: Object3D[];
    count: number;
}
export declare class CollectionInfoNode implements CollectionNodeBase {
    readonly category = "collection";
    readonly nodeType = "collection_info";
    readonly inputs: CollectionInfoInputs;
    readonly outputs: CollectionInfoOutputs;
    readonly domain: Domain;
    constructor(inputs?: CollectionInfoInputs);
    execute(): CollectionInfoOutputs;
}
export interface ObjectInfoInputs {
    object?: Object3D;
    asInstance?: boolean;
}
export interface ObjectInfoOutputs {
    geometry: Object3D;
    pivot: number[];
    boundingBoxMin: number[];
    boundingBoxMax: number[];
}
export declare class ObjectInfoNode implements CollectionNodeBase {
    readonly category = "collection";
    readonly nodeType = "object_info";
    readonly inputs: ObjectInfoInputs;
    readonly outputs: ObjectInfoOutputs;
    readonly domain: Domain;
    constructor(inputs?: ObjectInfoInputs);
    execute(): ObjectInfoOutputs;
}
export interface InstanceOnPointsInputs {
    points?: number[][];
    instance?: Object3D;
    scale?: number[];
    rotation?: number[];
    pickRandom?: boolean;
}
export interface InstanceOnPointsOutputs {
    instances: Object3D[];
    count: number;
}
export declare class InstanceOnPointsNode implements CollectionNodeBase {
    readonly category = "collection";
    readonly nodeType = "instance_on_points";
    readonly inputs: InstanceOnPointsInputs;
    readonly outputs: InstanceOnPointsOutputs;
    readonly domain: Domain;
    constructor(inputs?: InstanceOnPointsInputs);
    execute(): InstanceOnPointsOutputs;
}
export interface DuplicateElementsInputs {
    geometry?: Object3D;
    duplicates?: number;
    startIndex?: number;
}
export interface DuplicateElementsOutputs {
    geometry: Object3D;
    count: number;
}
export declare class DuplicateElementsNode implements CollectionNodeBase {
    readonly category = "collection";
    readonly nodeType = "duplicate_elements";
    readonly inputs: DuplicateElementsInputs;
    readonly outputs: DuplicateElementsOutputs;
    readonly domain: Domain;
    constructor(inputs?: DuplicateElementsInputs);
    execute(): DuplicateElementsOutputs;
}
export interface ChildrenOfSceneInputs {
    scene?: Group;
}
export interface ChildrenOfSceneOutputs {
    children: Object3D[];
    count: number;
}
export declare class ChildrenOfSceneNode implements CollectionNodeBase {
    readonly category = "collection";
    readonly nodeType = "children_of_scene";
    readonly inputs: ChildrenOfSceneInputs;
    readonly outputs: ChildrenOfSceneOutputs;
    readonly domain: Domain;
    constructor(inputs?: ChildrenOfSceneInputs);
    execute(): ChildrenOfSceneOutputs;
}
export declare function createCollectionInfoNode(inputs?: CollectionInfoInputs): CollectionInfoNode;
export declare function createObjectInfoNode(inputs?: ObjectInfoInputs): ObjectInfoNode;
export declare function createInstanceOnPointsNode(inputs?: InstanceOnPointsInputs): InstanceOnPointsNode;
export declare function createDuplicateElementsNode(inputs?: DuplicateElementsInputs): DuplicateElementsNode;
export declare function createChildrenOfSceneNode(inputs?: ChildrenOfSceneInputs): ChildrenOfSceneNode;
export { CollectionInfoNode, ObjectInfoNode, InstanceOnPointsNode, DuplicateElementsNode, ChildrenOfSceneNode, };
export type { CollectionNodeBase, CollectionInfoInputs, CollectionInfoOutputs, ObjectInfoInputs, ObjectInfoOutputs, InstanceOnPointsInputs, InstanceOnPointsOutputs, DuplicateElementsInputs, DuplicateElementsOutputs, ChildrenOfSceneInputs, ChildrenOfSceneOutputs, };
//# sourceMappingURL=CollectionNodes.d.ts.map