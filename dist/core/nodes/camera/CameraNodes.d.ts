/**
 * Camera Nodes Module
 * Camera data access, depth of field, and view properties
 * Ported from Blender Geometry Nodes
 */
import { Camera } from 'three';
import type { NodeBase, Domain } from '../core/types';
export interface CameraNodeBase extends NodeBase {
    category: 'camera';
}
export interface CameraDataInputs {
    camera?: Camera;
    type?: 'view_matrix' | 'projection_matrix' | 'view_projection_matrix';
}
export interface CameraDataOutputs {
    matrix: number[];
    cameraMatrixWorld: number[];
    depth: number;
    distance: number;
}
export declare class CameraDataNode implements CameraNodeBase {
    readonly category = "camera";
    readonly nodeType = "camera_data";
    readonly inputs: CameraDataInputs;
    readonly outputs: CameraDataOutputs;
    readonly domain: Domain;
    constructor(inputs?: CameraDataInputs);
    execute(camera: Camera): CameraDataOutputs;
}
export interface DepthOfFieldInputs {
    camera?: Camera;
    focusDistance?: number;
    fStop?: number;
    focalLength?: number;
    sensorWidth?: number;
}
export interface DepthOfFieldOutputs {
    focusDistance: number;
    aperture: number;
    focalLength: number;
    sensorWidth: number;
}
export declare class DepthOfFieldNode implements CameraNodeBase {
    readonly category = "camera";
    readonly nodeType = "depth_of_field";
    readonly inputs: DepthOfFieldInputs;
    readonly outputs: DepthOfFieldOutputs;
    readonly domain: Domain;
    constructor(inputs?: DepthOfFieldInputs);
    execute(camera: Camera): DepthOfFieldOutputs;
}
export interface FocalLengthInputs {
    camera?: Camera;
    focalLength?: number;
    sensorWidth?: number;
    fov?: number;
}
export interface FocalLengthOutputs {
    focalLength: number;
    fov: number;
    sensorWidth: number;
}
export declare class FocalLengthNode implements CameraNodeBase {
    readonly category = "camera";
    readonly nodeType = "focal_length";
    readonly inputs: FocalLengthInputs;
    readonly outputs: FocalLengthOutputs;
    readonly domain: Domain;
    constructor(inputs?: FocalLengthInputs);
    execute(camera: Camera): FocalLengthOutputs;
}
export interface ViewMatrixInputs {
    camera?: Camera;
}
export interface ViewMatrixOutputs {
    viewMatrix: number[];
    inverseViewMatrix: number[];
}
export declare class ViewMatrixNode implements CameraNodeBase {
    readonly category = "camera";
    readonly nodeType = "view_matrix";
    readonly inputs: ViewMatrixInputs;
    readonly outputs: ViewMatrixOutputs;
    readonly domain: Domain;
    constructor(inputs?: ViewMatrixInputs);
    execute(camera: Camera): ViewMatrixOutputs;
}
export declare function createCameraDataNode(inputs?: CameraDataInputs): CameraDataNode;
export declare function createDepthOfFieldNode(inputs?: DepthOfFieldInputs): DepthOfFieldNode;
export declare function createFocalLengthNode(inputs?: FocalLengthInputs): FocalLengthNode;
export declare function createViewMatrixNode(inputs?: ViewMatrixInputs): ViewMatrixNode;
export { CameraDataNode, DepthOfFieldNode, FocalLengthNode, ViewMatrixNode, };
export type { CameraNodeBase, CameraDataInputs, CameraDataOutputs, DepthOfFieldInputs, DepthOfFieldOutputs, FocalLengthInputs, FocalLengthOutputs, ViewMatrixInputs, ViewMatrixOutputs, };
//# sourceMappingURL=CameraNodes.d.ts.map