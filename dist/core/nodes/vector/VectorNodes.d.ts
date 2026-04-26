/**
 * Vector Nodes - Mathematical vector operations
 * Based on Blender vector math nodes and infinigen geometry processing
 *
 * These nodes handle all vector mathematics needed for procedural generation
 */
import { NodeTypes } from '../core/node-types';
export interface VectorNodeBase {
    type: NodeTypes;
    name: string;
    inputs: Record<string, any>;
    outputs: Record<string, any>;
}
export interface VectorMathInputs {
    operation?: 'add' | 'subtract' | 'multiply' | 'divide' | 'cross_product' | 'project' | 'reflect' | 'refract' | 'faceforward' | 'dot_product' | 'distance' | 'length' | 'scale' | 'normalize' | 'wrap' | 'snap' | 'floor' | 'ceiling' | 'modulus' | 'fraction' | 'absolute' | 'minimum' | 'maximum' | 'sine' | 'cosine' | 'tangent' | 'arcsine' | 'arccosine' | 'arctangent' | 'arctan2' | 'hyperbolic_sine' | 'hyperbolic_cosine' | 'hyperbolic_tangent' | 'radians' | 'degrees' | 'power' | 'logarithm' | 'square_root' | 'inverse_square_root' | 'sign' | 'compare' | 'smooth_minimum' | 'smooth_maximum';
    vector1?: [number, number, number];
    vector2?: [number, number, number];
    value?: number;
    scale?: number;
    clamp?: boolean;
}
export interface VectorMathOutputs {
    vector: [number, number, number];
    value: number;
}
export interface VectorRotateInputs {
    rotationType?: 'euler_xyz' | 'axis_angle' | 'quaternion' | 'direction_to_point' | 'align_vectors';
    vector?: [number, number, number];
    center?: [number, number, number];
    angle?: number;
    axis?: [number, number, number];
    quaternion?: [number, number, number, number];
    target?: [number, number, number];
    source?: [number, number, number];
    pivot?: [number, number, number];
}
export interface VectorRotateOutputs {
    vector: [number, number, number];
}
export interface VectorTransformInputs {
    transformType?: 'point' | 'vector' | 'normal';
    vector?: [number, number, number];
    fromSpace?: 'world' | 'object' | 'camera' | 'light';
    toSpace?: 'world' | 'object' | 'camera' | 'light';
}
export interface VectorTransformOutputs {
    vector: [number, number, number];
}
export interface NormalMapInputs {
    strength?: number;
    distance?: number;
    color?: [number, number, number];
    direction?: 'tangent' | 'object' | 'world' | 'camera';
}
export interface NormalMapOutputs {
    normal: [number, number, number];
}
export interface BumpInputs {
    height?: number;
    strength?: number;
    distance?: number;
    useNormalMap?: boolean;
    invert?: boolean;
}
export interface BumpOutputs {
    normal: [number, number, number];
}
export interface DisplacementInputs {
    height?: number;
    midlevel?: number;
    scale?: number;
}
export interface DisplacementOutputs {
    displacement: [number, number, number];
}
export interface MappingInputs {
    vector?: [number, number, number];
    translation?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    type?: 'point' | 'texture' | 'vector' | 'normal';
    min?: [number, number, number];
    max?: [number, number, number];
    useMin?: boolean;
    useMax?: boolean;
}
export interface MappingOutputs {
    vector: [number, number, number];
}
export interface CombineXYZInputs {
    x?: number;
    y?: number;
    z?: number;
}
export interface CombineXYZOutputs {
    vector: [number, number, number];
}
export interface SeparateXYZInputs {
    vector?: [number, number, number];
}
export interface SeparateXYZOutputs {
    x: number;
    y: number;
    z: number;
}
export interface NormalizeInputs {
    vector?: [number, number, number];
}
export interface NormalizeOutputs {
    vector: [number, number, number];
    length: number;
}
export interface AlignEulerToVectorInputs {
    vector?: [number, number, number];
    axis?: 'x' | 'y' | 'z';
    pivotAxis?: 'x' | 'y' | 'z';
}
export interface AlignEulerToVectorOutputs {
    rotation: [number, number, number];
}
export interface RotateEulerInputs {
    rotation?: [number, number, number];
    angle?: number;
    axis?: 'x' | 'y' | 'z';
}
export interface RotateEulerOutputs {
    rotation: [number, number, number];
}
/**
 * Vector Math Node
 * Performs various mathematical operations on vectors
 */
export declare class VectorMathNode implements VectorNodeBase {
    readonly type = NodeTypes.VectorMath;
    readonly name = "Vector Math";
    inputs: VectorMathInputs;
    outputs: VectorMathOutputs;
    execute(): VectorMathOutputs;
    private normalize;
}
/**
 * Vector Rotate Node
 * Rotates a vector using various methods
 */
export declare class VectorRotateNode implements VectorNodeBase {
    readonly type = NodeTypes.VectorRotate;
    readonly name = "Vector Rotate";
    inputs: VectorRotateInputs;
    outputs: VectorRotateOutputs;
    execute(): VectorRotateOutputs;
    private rotateAxisAngle;
    private rotateQuaternion;
    private rotateDirectionToPoint;
    private normalize;
}
/**
 * Combine XYZ Node
 * Combines X, Y, Z components into a vector
 */
export declare class CombineXYZNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Combine XYZ";
    inputs: CombineXYZInputs;
    outputs: CombineXYZOutputs;
    execute(): CombineXYZOutputs;
}
/**
 * Separate XYZ Node
 * Separates a vector into X, Y, Z components
 */
export declare class SeparateXYZNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Separate XYZ";
    inputs: SeparateXYZInputs;
    outputs: SeparateXYZOutputs;
    execute(): SeparateXYZOutputs;
}
/**
 * Normalize Node
 * Normalizes a vector to unit length
 */
export declare class NormalizeNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Normalize";
    inputs: NormalizeInputs;
    outputs: NormalizeOutputs;
    execute(): NormalizeOutputs;
}
/**
 * Mapping Node
 * Transforms a vector through translation, rotation, and scale
 */
export declare class MappingNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Mapping";
    inputs: MappingInputs;
    outputs: MappingOutputs;
    execute(): MappingOutputs;
    private rotateEuler;
}
export declare function createVectorMathNode(inputs?: Partial<VectorMathInputs>): VectorMathNode;
export declare function createVectorRotateNode(inputs?: Partial<VectorRotateInputs>): VectorRotateNode;
export declare function createCombineXYZNode(inputs?: Partial<CombineXYZInputs>): CombineXYZNode;
export declare function createSeparateXYZNode(inputs?: Partial<SeparateXYZInputs>): SeparateXYZNode;
export declare function createNormalizeNode(inputs?: Partial<NormalizeInputs>): NormalizeNode;
export declare function createMappingNode(inputs?: Partial<MappingInputs>): MappingNode;
//# sourceMappingURL=VectorNodes.d.ts.map