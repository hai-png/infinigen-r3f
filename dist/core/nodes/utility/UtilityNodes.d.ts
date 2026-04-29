/**
 * Utility Nodes for Infinigen R3F
 *
 * Provides mathematical operations, vector math, color operations, and general utilities.
 * Based on Blender Geometry Nodes utility system.
 *
 * @module nodes/utility
 */
import { SocketType } from '../core/types';
import { NodeDefinition } from '../core/node-base';
/**
 * Math Node - Basic mathematical operations
 */
export interface MathNodeData {
    operation: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE' | 'MULTIPLY_ADD' | 'POWER' | 'LOGARITHM' | 'SQRT' | 'ABS' | 'CEIL' | 'FLOOR' | 'ROUND' | 'FRACT' | 'MODULO' | 'MIN' | 'MAX' | 'SINE' | 'COSINE' | 'TANGENT' | 'ARCSINE' | 'ARCCOSINE' | 'ARCTANGENT' | 'ARCTAN2' | 'HYPOTENUSE' | 'DEGREES' | 'RADIANS' | 'SIGN' | 'COMPARE' | 'SNAP' | 'PINGPONG' | 'WRAP';
    clamp?: boolean;
    minClamp?: number;
    maxClamp?: number;
}
export declare const MathNode: NodeDefinition<MathNodeData>;
/**
 * Vector Math Node - Vector mathematical operations
 */
export interface VectorMathNodeData {
    operation: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE' | 'CROSS_PRODUCT' | 'DOT_PRODUCT' | 'PROJECT' | 'REFLECT' | 'REFRACT' | 'FACEFORWARD' | 'NEGATE' | 'NORMALIZE' | 'ROTATE' | 'SCALE' | 'LENGTH' | 'DISTANCE' | 'MINIMUM' | 'MAXIMUM' | 'WRAP';
}
export declare const VectorMathNode: NodeDefinition<VectorMathNodeData>;
/**
 * Color Math Node - Color operations
 */
export interface ColorMathNodeData {
    operation: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE' | 'DIFFERENCE' | 'DARKEN' | 'LIGHTEN' | 'SCREEN' | 'OVERLAY' | 'SOFT_LIGHT' | 'LINEAR_LIGHT' | 'DOT' | 'EXCLUSION' | 'INVERT' | 'SATURATION' | 'VALUE' | 'COLOR' | 'HUE' | 'COMPLEMENT' | 'DESATURATE';
    factor?: number;
    clamp?: boolean;
}
export declare const ColorMathNode: NodeDefinition<ColorMathNodeData>;
/**
 * Compare Node - Compare two values
 */
export interface CompareNodeData {
    operation: 'EQUAL' | 'NOT_EQUAL' | 'LESS_THAN' | 'LESS_EQUAL' | 'GREATER_THAN' | 'GREATER_EQUAL' | 'AND' | 'OR' | 'NOT';
    epsilon?: number;
}
export declare const CompareNode: NodeDefinition<CompareNodeData>;
/**
 * Switch Node - Select output based on condition
 */
export interface SwitchNodeData<T = any> {
    inputType: SocketType;
}
export declare const SwitchNode: NodeDefinition<SwitchNodeData>;
/**
 * Combine XYZ Node - Combine scalar values into vector
 */
export declare const CombineXYZNode: NodeDefinition<any>;
/**
 * Separate XYZ Node - Extract components from vector
 */
export declare const SeparateXYZNode: NodeDefinition<any>;
/**
 * Combine RGBA Node - Combine color and alpha
 */
export declare const CombineRGBANode: NodeDefinition<any>;
/**
 * Separate RGBA Node - Extract components from color
 */
export declare const SeparateRGBANode: NodeDefinition<any>;
/**
 * Float to Integer Node - Convert float to integer
 */
export declare const FloatToIntNode: NodeDefinition<any>;
/**
 * Integer to Float Node - Convert integer to float
 */
export declare const IntToFloatNode: NodeDefinition<any>;
/**
 * Random Value Node - Generate random values
 */
export interface RandomValueNodeData {
    dataType: SocketType;
    min: number;
    max: number;
    seed: number;
    useMin: boolean;
    useMax: boolean;
}
export declare const RandomValueNode: NodeDefinition<RandomValueNodeData>;
export declare const UtilityNodes: {
    Math: NodeDefinition<MathNodeData>;
    VectorMath: NodeDefinition<VectorMathNodeData>;
    ColorMath: NodeDefinition<ColorMathNodeData>;
    Compare: NodeDefinition<CompareNodeData>;
    Switch: NodeDefinition<SwitchNodeData<any>>;
    CombineXYZ: NodeDefinition<any>;
    SeparateXYZ: NodeDefinition<any>;
    CombineRGBA: NodeDefinition<any>;
    SeparateRGBA: NodeDefinition<any>;
    FloatToInt: NodeDefinition<any>;
    IntToFloat: NodeDefinition<any>;
    RandomValue: NodeDefinition<RandomValueNodeData>;
};
export type { MathNodeData, VectorMathNodeData, ColorMathNodeData, CompareNodeData, SwitchNodeData, RandomValueNodeData };
//# sourceMappingURL=UtilityNodes.d.ts.map