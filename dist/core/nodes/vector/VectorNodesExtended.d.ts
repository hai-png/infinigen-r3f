/**
 * Extended Vector Nodes - Additional vector operations
 * Completes the remaining 30 vector nodes from the implementation plan
 *
 * Note: Type definitions are imported from VectorNodes.ts to avoid duplicates
 */
import { NodeTypes } from '../core/node-types';
import type { VectorTransformInputs, VectorTransformOutputs, NormalMapInputs, NormalMapOutputs, BumpInputs, BumpOutputs, DisplacementInputs, DisplacementOutputs, AlignEulerToVectorInputs as BaseAlignEulerToVectorInputs, AlignEulerToVectorOutputs, RotateEulerInputs as BaseRotateEulerInputs, RotateEulerOutputs, QuaternionInputs as BaseQuaternionInputs, QuaternionOutputs } from './VectorNodes';
export interface AlignEulerToVectorInputs extends BaseAlignEulerToVectorInputs {
    useAlign?: boolean;
}
export interface RotateEulerInputs extends BaseRotateEulerInputs {
    type?: 'euler_xyz' | 'quaternion';
}
export interface QuaternionInputs extends BaseQuaternionInputs {
}
export interface MatrixTransformInputs {
    matrix?: number[];
    vector?: [number, number, number];
    transpose?: boolean;
    inverse?: boolean;
}
export interface MatrixTransformOutputs {
    vector: [number, number, number];
    matrix: number[];
}
export interface DirectionToPointInputs {
    from?: [number, number, number];
    to?: [number, number, number];
    up?: [number, number, number];
}
export interface DirectionToPointOutputs {
    direction: [number, number, number];
    rotation: [number, number, number];
}
export interface ReflectInputs {
    vector?: [number, number, number];
    normal?: [number, number, number];
}
export interface ReflectOutputs {
    reflected: [number, number, number];
}
export interface RefractInputs {
    vector?: [number, number, number];
    normal?: [number, number, number];
    ior?: number;
}
export interface RefractOutputs {
    refracted: [number, number, number];
}
export interface FaceForwardInputs {
    vector?: [number, number, number];
    reference?: [number, number, number];
    normal?: [number, number, number];
}
export interface FaceForwardOutputs {
    result: [number, number, number];
}
export interface WrapInputs {
    vector?: [number, number, number];
    min?: [number, number, number];
    max?: [number, number, number];
}
export interface WrapOutputs {
    wrapped: [number, number, number];
}
export interface SnapInputs {
    vector?: [number, number, number];
    increment?: [number, number, number];
}
export interface SnapOutputs {
    snapped: [number, number, number];
}
export interface FloorCeilInputs {
    vector?: [number, number, number];
    operation?: 'floor' | 'ceiling' | 'round' | 'snap';
}
export interface FloorCeilOutputs {
    result: [number, number, number];
}
export interface ModuloInputs {
    vector?: [number, number, number];
    divisor?: [number, number, number];
}
export interface ModuloOutputs {
    result: [number, number, number];
}
export interface FractionInputs {
    vector?: [number, number, number];
}
export interface FractionOutputs {
    fraction: [number, number, number];
    whole: [number, number, number];
}
export interface AbsoluteInputs {
    vector?: [number, number, number];
}
export interface AbsoluteOutputs {
    absolute: [number, number, number];
}
export interface MinMaxInputs {
    vector1?: [number, number, number];
    vector2?: [number, number, number];
    operation?: 'min' | 'max';
}
export interface MinMaxOutputs {
    result: [number, number, number];
}
export interface TrigonometryInputs {
    vector?: [number, number, number];
    operation?: 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | 'atan2' | 'sinh' | 'cosh' | 'tanh';
    value2?: number;
}
export interface TrigonometryOutputs {
    result: [number, number, number];
    value?: number;
}
export interface PowerLogInputs {
    vector?: [number, number, number];
    base?: number;
    exponent?: number;
    operation?: 'power' | 'log' | 'sqrt' | 'inverse_sqrt' | 'square';
}
export interface PowerLogOutputs {
    result: [number, number, number];
}
export interface SignInputs {
    vector?: [number, number, number];
}
export interface SignOutputs {
    sign: [number, number, number];
}
export interface CompareInputs {
    vector1?: [number, number, number];
    vector2?: [number, number, number];
    epsilon?: number;
    operation?: 'equal' | 'not_equal' | 'less' | 'greater' | 'less_equal' | 'greater_equal';
}
export interface CompareOutputs {
    result: boolean;
    comparison: [number, number, number];
}
export interface SmoothMinMaxInputs {
    vector1?: [number, number, number];
    vector2?: [number, number, number];
    smoothness?: number;
    operation?: 'smooth_min' | 'smooth_max';
}
export interface SmoothMinMaxOutputs {
    result: [number, number, number];
}
export interface AngleBetweenInputs {
    vector1?: [number, number, number];
    vector2?: [number, number, number];
}
export interface AngleBetweenOutputs {
    angle: number;
    degrees: number;
}
export interface SlerpInputs {
    start?: [number, number, number];
    end?: [number, number, number];
    factor?: number;
}
export interface SlerpOutputs {
    result: [number, number, number];
}
export interface PolarToCartInputs {
    radius?: number;
    angle?: number;
    z?: number;
}
export interface PolarToCartOutputs {
    x: number;
    y: number;
    z: number;
    vector: [number, number, number];
}
export interface CartToPolarInputs {
    vector?: [number, number, number];
}
export interface CartToPolarOutputs {
    radius: number;
    angle: number;
    z: number;
}
/**
 * Vector Transform Node
 * Transforms vectors between different coordinate spaces
 */
export declare class VectorTransformNode implements VectorNodeBase {
    readonly type = NodeTypes.VectorTransform;
    readonly name = "Vector Transform";
    inputs: VectorTransformInputs;
    outputs: VectorTransformOutputs;
    execute(): VectorTransformOutputs;
}
/**
 * Normal Map Node
 * Converts RGB color to normal map data
 */
export declare class NormalMapNode implements VectorNodeBase {
    readonly type = NodeTypes.NormalMap;
    readonly name = "Normal Map";
    inputs: NormalMapInputs;
    outputs: NormalMapOutputs;
    execute(): NormalMapOutputs;
}
/**
 * Bump Node
 * Creates bump mapping effect by perturbing normals
 */
export declare class BumpNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Bump";
    inputs: BumpInputs;
    outputs: BumpOutputs;
    execute(): BumpOutputs;
}
/**
 * Displacement Node
 * Calculates displacement vector for surface displacement
 */
export declare class DisplacementNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Displacement";
    inputs: DisplacementInputs;
    outputs: DisplacementOutputs;
    execute(): DisplacementOutputs;
}
/**
 * Align Euler to Vector Node
 * Rotates Euler angles to align with a target vector
 */
export declare class AlignEulerToVectorNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Align Euler to Vector";
    inputs: AlignEulerToVectorInputs;
    outputs: AlignEulerToVectorOutputs;
    execute(): AlignEulerToVectorOutputs;
}
/**
 * Rotate Euler Node
 * Applies additional rotation to Euler angles
 */
export declare class RotateEulerNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Rotate Euler";
    inputs: RotateEulerInputs;
    outputs: RotateEulerOutputs;
    execute(): RotateEulerOutputs;
}
/**
 * Quaternion Operations Node
 * Converts between quaternion and other representations
 */
export declare class QuaternionNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Quaternion";
    inputs: QuaternionInputs;
    outputs: QuaternionOutputs;
    execute(): QuaternionOutputs;
}
/**
 * Matrix Transform Node
 * Applies 4x4 matrix transformations
 */
export declare class MatrixTransformNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Matrix Transform";
    inputs: MatrixTransformInputs;
    outputs: MatrixTransformOutputs;
    execute(): MatrixTransformOutputs;
}
/**
 * Direction to Point Node
 * Calculates direction and rotation from one point to another
 */
export declare class DirectionToPointNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Direction to Point";
    inputs: DirectionToPointInputs;
    outputs: DirectionToPointOutputs;
    execute(): DirectionToPointOutputs;
}
/**
 * Reflect Node
 * Calculates reflection of vector around normal
 */
export declare class ReflectNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Reflect";
    inputs: ReflectInputs;
    outputs: ReflectOutputs;
    execute(): ReflectOutputs;
}
/**
 * Refract Node
 * Calculates refraction using Snell's law
 */
export declare class RefractNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Refract";
    inputs: RefractInputs;
    outputs: RefractOutputs;
    execute(): RefractOutputs;
}
/**
 * Face Forward Node
 * Orients a vector to face towards a reference
 */
export declare class FaceForwardNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Face Forward";
    inputs: FaceForwardInputs;
    outputs: FaceForwardOutputs;
    execute(): FaceForwardOutputs;
}
/**
 * Wrap Node
 * Wraps vector values within min/max range
 */
export declare class WrapNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Wrap";
    inputs: WrapInputs;
    outputs: WrapOutputs;
    execute(): WrapOutputs;
}
/**
 * Snap Node
 * Snaps vector values to nearest increment
 */
export declare class SnapNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Snap";
    inputs: SnapInputs;
    outputs: SnapOutputs;
    execute(): SnapOutputs;
}
/**
 * Floor/Ceil Node
 * Applies floor, ceiling, or round operations
 */
export declare class FloorCeilNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Floor/Ceil";
    inputs: FloorCeilInputs;
    outputs: FloorCeilOutputs;
    execute(): FloorCeilOutputs;
}
/**
 * Modulo Node
 * Calculates modulo of vector components
 */
export declare class ModuloNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Modulo";
    inputs: ModuloInputs;
    outputs: ModuloOutputs;
    execute(): ModuloOutputs;
}
/**
 * Fraction Node
 * Separates fractional and whole parts
 */
export declare class FractionNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Fraction";
    inputs: FractionInputs;
    outputs: FractionOutputs;
    execute(): FractionOutputs;
}
/**
 * Absolute Node
 * Calculates absolute value of vector components
 */
export declare class AbsoluteNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Absolute";
    inputs: AbsoluteInputs;
    outputs: AbsoluteOutputs;
    execute(): AbsoluteOutputs;
}
/**
 * Min/Max Node
 * Calculates component-wise minimum or maximum
 */
export declare class MinMaxNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Min/Max";
    inputs: MinMaxInputs;
    outputs: MinMaxOutputs;
    execute(): MinMaxOutputs;
}
/**
 * Trigonometry Node
 * Applies trigonometric functions to vector components
 */
export declare class TrigonometryNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Trigonometry";
    inputs: TrigonometryInputs;
    outputs: TrigonometryOutputs;
    execute(): TrigonometryOutputs;
}
/**
 * Power/Logarithm Node
 * Applies power, logarithm, or root operations
 */
export declare class PowerLogNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Power/Logarithm";
    inputs: PowerLogInputs;
    outputs: PowerLogOutputs;
    execute(): PowerLogOutputs;
}
/**
 * Sign Node
 * Returns sign of each component (-1, 0, or 1)
 */
export declare class SignNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Sign";
    inputs: SignInputs;
    outputs: SignOutputs;
    execute(): SignOutputs;
}
/**
 * Compare Node
 * Compares two vectors with epsilon tolerance
 */
export declare class CompareNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Compare";
    inputs: CompareInputs;
    outputs: CompareOutputs;
    execute(): CompareOutputs;
}
/**
 * Smooth Min/Max Node
 * Calculates smooth minimum or maximum using polynomial smoothing
 */
export declare class SmoothMinMaxNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Smooth Min/Max";
    inputs: SmoothMinMaxInputs;
    outputs: SmoothMinMaxOutputs;
    execute(): SmoothMinMaxOutputs;
}
/**
 * Angle Between Node
 * Calculates angle between two vectors
 */
export declare class AngleBetweenNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Angle Between";
    inputs: AngleBetweenInputs;
    outputs: AngleBetweenOutputs;
    execute(): AngleBetweenOutputs;
}
/**
 * Spherical Linear Interpolation Node
 * Interpolates between two vectors on a sphere
 */
export declare class SlerpNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Slerp";
    inputs: SlerpInputs;
    outputs: SlerpOutputs;
    execute(): SlerpOutputs;
}
/**
 * Polar to Cartesian Node
 * Converts polar coordinates to Cartesian
 */
export declare class PolarToCartNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Polar to Cartesian";
    inputs: PolarToCartInputs;
    outputs: PolarToCartOutputs;
    execute(): PolarToCartOutputs;
}
/**
 * Cartesian to Polar Node
 * Converts Cartesian coordinates to polar
 */
export declare class CartToPolarNode implements VectorNodeBase {
    readonly type: any;
    readonly name = "Cartesian to Polar";
    inputs: CartToPolarInputs;
    outputs: CartToPolarOutputs;
    execute(): CartToPolarOutputs;
}
//# sourceMappingURL=VectorNodesExtended.d.ts.map