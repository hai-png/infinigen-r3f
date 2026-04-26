/**
 * Attribute Nodes - Attribute data flow and manipulation
 * Based on Blender geometry nodes attribute system
 *
 * These nodes handle attribute storage, retrieval, and statistics
 */
import { NodeTypes } from '../core/node-types';
export interface AttributeNodeBase {
    type: NodeTypes;
    name: string;
    inputs: Record<string, any>;
    outputs: Record<string, any>;
}
export interface StoreNamedAttributeInputs {
    domain?: 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';
    dataType?: 'float' | 'vec3' | 'color' | 'boolean' | 'integer';
    name?: string;
    value?: any;
    selection?: boolean;
}
export interface StoreNamedAttributeOutputs {
    geometry: any;
}
export interface CaptureAttributeInputs {
    domain?: 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';
    dataType?: 'float' | 'vec3' | 'color' | 'boolean' | 'integer';
    attribute?: any;
}
export interface CaptureAttributeOutputs {
    geometry: any;
    attribute: any;
}
export interface RemoveAttributeInputs {
    name?: string;
}
export interface RemoveAttributeOutputs {
    geometry: any;
}
export interface NamedAttributeInputs {
    name?: string;
}
export interface NamedAttributeOutputs {
    attribute: any;
    exists: boolean;
}
export interface AttributeStatisticInputs {
    domain?: 'point' | 'edge' | 'face' | 'instance';
    attribute?: any;
    selection?: boolean;
}
export interface AttributeStatisticOutputs {
    total: number;
    count: number;
    average: number;
    min: number;
    max: number;
    sum: number;
    range: number;
    variance: number;
    standardDeviation: number;
}
export interface SetPositionInputs {
    position?: [number, number, number];
    offset?: [number, number, number];
    selection?: boolean;
}
export interface SetPositionOutputs {
    position: [number, number, number];
}
export interface PositionInputNodeOutputs {
    position: [number, number, number];
}
export interface NormalInputNodeOutputs {
    normal: [number, number, number];
}
export interface TangentInputNodeOutputs {
    tangent: [number, number, number];
}
export interface UVMapInputNodeOutputs {
    uv: [number, number];
}
export interface ColorInputNodeOutputs {
    color: [number, number, number];
}
export interface RadiusInputNodeOutputs {
    radius: number;
}
export interface IdInputNodeOutputs {
    id: number;
}
export interface IndexInputNodeOutputs {
    index: number;
}
/**
 * Store Named Attribute Node
 * Stores an attribute with a custom name on geometry
 */
export declare class StoreNamedAttributeNode implements AttributeNodeBase {
    readonly type = NodeTypes.StoreNamedAttribute;
    readonly name = "Store Named Attribute";
    inputs: StoreNamedAttributeInputs;
    outputs: StoreNamedAttributeOutputs;
    execute(geometry?: any): StoreNamedAttributeOutputs;
}
/**
 * Capture Attribute Node
 * Captures attribute values for use in field context
 */
export declare class CaptureAttributeNode implements AttributeNodeBase {
    readonly type = NodeTypes.CaptureAttribute;
    readonly name = "Capture Attribute";
    inputs: CaptureAttributeInputs;
    outputs: CaptureAttributeOutputs;
    execute(geometry?: any): CaptureAttributeOutputs;
}
/**
 * Remove Attribute Node
 * Removes a named attribute from geometry
 */
export declare class RemoveAttributeNode implements AttributeNodeBase {
    readonly type: any;
    readonly name = "Remove Attribute";
    inputs: RemoveAttributeInputs;
    outputs: RemoveAttributeOutputs;
    execute(geometry?: any): RemoveAttributeOutputs;
}
/**
 * Named Attribute Node
 * Retrieves a named attribute from geometry
 */
export declare class NamedAttributeNode implements AttributeNodeBase {
    readonly type = NodeTypes.NamedAttribute;
    readonly name = "Named Attribute";
    inputs: NamedAttributeInputs;
    outputs: NamedAttributeOutputs;
    execute(geometry?: any): NamedAttributeOutputs;
}
/**
 * Attribute Statistic Node
 * Calculates statistics for an attribute
 */
export declare class AttributeStatisticNode implements AttributeNodeBase {
    readonly type = NodeTypes.AttributeStatistic;
    readonly name = "Attribute Statistic";
    inputs: AttributeStatisticInputs;
    outputs: AttributeStatisticOutputs;
    execute(): AttributeStatisticOutputs;
}
/**
 * Set Position Node
 * Sets the position of points in geometry
 */
export declare class SetPositionNode implements AttributeNodeBase {
    readonly type = NodeTypes.SetPosition;
    readonly name = "Set Position";
    inputs: SetPositionInputs;
    outputs: SetPositionOutputs;
    execute(): SetPositionOutputs;
}
/**
 * Position Input Node
 * Provides position attribute access
 */
export declare class PositionInputNode implements AttributeNodeBase {
    readonly type: any;
    readonly name = "Position";
    inputs: Record<string, any>;
    outputs: PositionInputNodeOutputs;
    execute(position?: [number, number, number]): PositionInputNodeOutputs;
}
/**
 * Normal Input Node
 * Provides normal attribute access
 */
export declare class NormalInputNode implements AttributeNodeBase {
    readonly type: any;
    readonly name = "Normal";
    inputs: Record<string, any>;
    outputs: NormalInputNodeOutputs;
    execute(normal?: [number, number, number]): NormalInputNodeOutputs;
}
/**
 * Tangent Input Node
 * Provides tangent attribute access
 */
export declare class TangentInputNode implements AttributeNodeBase {
    readonly type: any;
    readonly name = "Tangent";
    inputs: Record<string, any>;
    outputs: TangentInputNodeOutputs;
    execute(tangent?: [number, number, number]): TangentInputNodeOutputs;
}
/**
 * UV Map Input Node
 * Provides UV coordinate access
 */
export declare class UVMapInputNode implements AttributeNodeBase {
    readonly type: any;
    readonly name = "UV Map";
    inputs: Record<string, any>;
    outputs: UVMapInputNodeOutputs;
    execute(uv?: [number, number]): UVMapInputNodeOutputs;
}
/**
 * Color Input Node
 * Provides color attribute access
 */
export declare class ColorInputNode implements AttributeNodeBase {
    readonly type: any;
    readonly name = "Color";
    inputs: Record<string, any>;
    outputs: ColorInputNodeOutputs;
    execute(color?: [number, number, number]): ColorInputNodeOutputs;
}
/**
 * Radius Input Node
 * Provides radius attribute access (for curves/points)
 */
export declare class RadiusInputNode implements AttributeNodeBase {
    readonly type: any;
    readonly name = "Radius";
    inputs: Record<string, any>;
    outputs: RadiusInputNodeOutputs;
    execute(radius?: number): RadiusInputNodeOutputs;
}
/**
 * ID Input Node
 * Provides unique ID attribute access
 */
export declare class IdInputNode implements AttributeNodeBase {
    readonly type: any;
    readonly name = "ID";
    inputs: Record<string, any>;
    outputs: IdInputNodeOutputs;
    execute(id?: number): IdInputNodeOutputs;
}
/**
 * Index Input Node
 * Provides index attribute access
 */
export declare class IndexInputNode implements AttributeNodeBase {
    readonly type: any;
    readonly name = "Index";
    inputs: Record<string, any>;
    outputs: IndexInputNodeOutputs;
    execute(index?: number): IndexInputNodeOutputs;
}
export declare function createStoreNamedAttributeNode(inputs?: Partial<StoreNamedAttributeInputs>): StoreNamedAttributeNode;
export declare function createCaptureAttributeNode(inputs?: Partial<CaptureAttributeInputs>): CaptureAttributeNode;
export declare function createRemoveAttributeNode(inputs?: Partial<RemoveAttributeInputs>): RemoveAttributeNode;
export declare function createNamedAttributeNode(inputs?: Partial<NamedAttributeInputs>): NamedAttributeNode;
export declare function createAttributeStatisticNode(inputs?: Partial<AttributeStatisticInputs>): AttributeStatisticNode;
export declare function createSetPositionNode(inputs?: Partial<SetPositionInputs>): SetPositionNode;
export declare function createPositionInputNode(): PositionInputNode;
export declare function createNormalInputNode(): NormalInputNode;
export declare function createTangentInputNode(): TangentInputNode;
export declare function createUVMapInputNode(): UVMapInputNode;
export declare function createColorInputNode(): ColorInputNode;
export declare function createRadiusInputNode(): RadiusInputNode;
export declare function createIdInputNode(): IdInputNode;
export declare function createIndexInputNode(): IndexInputNode;
//# sourceMappingURL=AttributeNodes.d.ts.map