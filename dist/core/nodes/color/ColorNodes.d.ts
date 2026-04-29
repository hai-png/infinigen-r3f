/**
 * Color Nodes - Color manipulation and conversion nodes
 * Based on Blender color nodes and infinigen material system
 *
 * These nodes handle color operations, conversions, and adjustments
 */
import { NodeTypes } from '../core/node-types';
import type { Color } from 'three';
export interface ColorNodeBase {
    type: NodeTypes;
    name: string;
    inputs: Record<string, any>;
    outputs: Record<string, any>;
}
export interface ColorRampInputs {
    factor?: number;
    colorRamp?: Array<{
        position: number;
        color: Color;
    }>;
    interpolation?: 'constant' | 'linear' | 'b_spline' | 'cardinal' | 'ease' | 'smooth_step';
}
export interface ColorRampOutputs {
    color: Color;
    alpha: number;
}
export interface MixRGBInputs {
    blendType?: 'mix' | 'add' | 'multiply' | 'subtract' | 'screen' | 'divide' | 'difference' | 'darken' | 'lighten' | 'overlay' | 'soft_light' | 'linear_light' | 'color_dodge' | 'color_burn' | 'hue' | 'saturation' | 'value' | 'color' | 'luminosity';
    color1?: Color;
    color2?: Color;
    factor?: number;
    clampResult?: boolean;
    clampFactor?: boolean;
}
export interface MixRGBOutputs {
    color: Color;
}
export interface RGBCurveInputs {
    color?: Color;
    curveR?: Array<[number, number]>;
    curveG?: Array<[number, number]>;
    curveB?: Array<[number, number]>;
    factor?: number;
}
export interface RGBCurveOutputs {
    color: Color;
}
export interface BrightContrastInputs {
    color?: Color;
    bright?: number;
    contrast?: number;
}
export interface BrightContrastOutputs {
    color: Color;
}
export interface ExposureInputs {
    color?: Color;
    exposure?: number;
    gamma?: number;
}
export interface ExposureOutputs {
    color: Color;
}
export interface CombineHSVInputs {
    hue?: number;
    saturation?: number;
    value?: number;
}
export interface CombineHSVOutputs {
    color: Color;
}
export interface SeparateRGBInputs {
    color?: Color;
}
export interface SeparateRGBOutputs {
    r: number;
    g: number;
    b: number;
}
export interface SeparateColorInputs {
    color?: Color;
}
export interface SeparateColorOutputs {
    r: number;
    g: number;
    b: number;
    a: number;
}
export interface CombineRGBInputs {
    r?: number;
    g?: number;
    b?: number;
}
export interface CombineRGBOutputs {
    color: Color;
}
export interface CombineColorInputs {
    r?: number;
    g?: number;
    b?: number;
    a?: number;
}
export interface CombineColorOutputs {
    color: Color;
}
export interface HueSaturationValueInputs {
    color?: Color;
    hue?: number;
    saturation?: number;
    value?: number;
    fac?: number;
}
export interface HueSaturationValueOutputs {
    color: Color;
}
export interface BlackBodyInputs {
    temperature?: number;
}
export interface BlackBodyOutputs {
    color: Color;
}
export interface InvertInputs {
    color?: Color;
    fac?: number;
}
export interface InvertOutputs {
    color: Color;
}
export interface PremulAlphaInputs {
    color?: Color;
    alpha?: number;
}
export interface PremulAlphaOutputs {
    color: Color;
}
export interface SetAlphaInputs {
    color?: Color;
    alpha?: number;
    fac?: number;
}
export interface SetAlphaOutputs {
    color: Color;
}
export interface AlphaOverInputs {
    color1?: Color;
    color2?: Color;
    fac?: number;
}
export interface AlphaOverOutputs {
    color: Color;
}
/**
 * Color Ramp Node
 * Maps a factor to colors using a gradient ramp
 */
export declare class ColorRampNode implements ColorNodeBase {
    readonly type = NodeTypes.ColorRamp;
    readonly name = "Color Ramp";
    inputs: ColorRampInputs;
    outputs: ColorRampOutputs;
    execute(): ColorRampOutputs;
    private applyInterpolation;
    private bspline;
    private lerp;
}
/**
 * Mix RGB Node
 * Blends two colors using various blend modes
 */
export declare class MixRGBNode implements ColorNodeBase {
    readonly type = NodeTypes.MixRGB;
    readonly name = "Mix RGB";
    inputs: MixRGBInputs;
    outputs: MixRGBOutputs;
    execute(): MixRGBOutputs;
    private mix;
    private add;
    private multiply;
    private subtract;
    private screen;
    private divide;
    private difference;
    private darken;
    private lighten;
}
/**
 * RGB Curve Node
 * Applies color curves to RGB channels
 */
export declare class RGBCurveNode implements ColorNodeBase {
    readonly type = NodeTypes.RGBCurve;
    readonly name = "RGB Curve";
    inputs: RGBCurveInputs;
    outputs: RGBCurveOutputs;
    execute(): RGBCurveOutputs;
    private evaluateCurve;
}
/**
 * Bright/Contrast Node
 * Adjusts brightness and contrast of a color
 */
export declare class BrightContrastNode implements ColorNodeBase {
    readonly type = NodeTypes.BrightContrast;
    readonly name = "Bright/Contrast";
    inputs: BrightContrastInputs;
    outputs: BrightContrastOutputs;
    execute(): BrightContrastOutputs;
    private clamp;
}
/**
 * Exposure Node
 * Adjusts exposure and gamma
 */
export declare class ExposureNode implements ColorNodeBase {
    readonly type = NodeTypes.Exposure;
    readonly name = "Exposure";
    inputs: ExposureInputs;
    outputs: ExposureOutputs;
    execute(): ExposureOutputs;
    private clamp;
}
/**
 * Combine HSV Node
 * Converts HSV to RGB
 */
export declare class CombineHSVNode implements ColorNodeBase {
    readonly type = NodeTypes.CombineHSV;
    readonly name = "Combine HSV";
    inputs: CombineHSVInputs;
    outputs: CombineHSVOutputs;
    execute(): CombineHSVOutputs;
    private hsvToRgb;
}
/**
 * Separate RGB Node
 * Splits RGB color into components
 */
export declare class SeparateRGBNode implements ColorNodeBase {
    readonly type = NodeTypes.SeparateRGB;
    readonly name = "Separate RGB";
    inputs: SeparateRGBInputs;
    outputs: SeparateRGBOutputs;
    execute(): SeparateRGBOutputs;
}
/**
 * Separate Color Node
 * Splits RGBA color into components
 */
export declare class SeparateColorNode implements ColorNodeBase {
    readonly type = NodeTypes.SeparateColor;
    readonly name = "Separate Color";
    inputs: SeparateColorInputs;
    outputs: SeparateColorOutputs;
    execute(): SeparateColorOutputs;
}
/**
 * Combine RGB Node
 * Combines RGB components into color
 */
export declare class CombineRGBNode implements ColorNodeBase {
    readonly type = NodeTypes.CombineRGB;
    readonly name = "Combine RGB";
    inputs: CombineRGBInputs;
    outputs: CombineRGBOutputs;
    execute(): CombineRGBOutputs;
}
/**
 * Combine Color Node
 * Combines RGBA components into color
 */
export declare class CombineColorNode implements ColorNodeBase {
    readonly type = NodeTypes.CombineColor;
    readonly name = "Combine Color";
    inputs: CombineColorInputs;
    outputs: CombineColorOutputs;
    execute(): CombineColorOutputs;
}
/**
 * Hue Saturation Value Node
 * Adjusts hue, saturation, and value of a color
 */
export declare class HueSaturationValueNode implements ColorNodeBase {
    readonly type = NodeTypes.HueSaturationValue;
    readonly name = "Hue Saturation Value";
    inputs: HueSaturationValueInputs;
    outputs: HueSaturationValueOutputs;
    execute(): HueSaturationValueOutputs;
    private rgbToHsv;
    private hsvToRgb;
}
/**
 * Black Body Node
 * Generates color from black body temperature
 */
export declare class BlackBodyNode implements ColorNodeBase {
    readonly type = NodeTypes.BlackBody;
    readonly name = "Black Body";
    inputs: BlackBodyInputs;
    outputs: BlackBodyOutputs;
    execute(): BlackBodyOutputs;
    private temperatureToRGB;
}
/**
 * Invert Node
 * Inverts color values
 */
export declare class InvertNode implements ColorNodeBase {
    readonly type: any;
    readonly name = "Invert";
    inputs: InvertInputs;
    outputs: InvertOutputs;
    execute(): InvertOutputs;
}
export declare function createColorRampNode(inputs?: Partial<ColorRampInputs>): ColorRampNode;
export declare function createMixRGBNode(inputs?: Partial<MixRGBInputs>): MixRGBNode;
export declare function createRGBCurveNode(inputs?: Partial<RGBCurveInputs>): RGBCurveNode;
export declare function createBrightContrastNode(inputs?: Partial<BrightContrastInputs>): BrightContrastNode;
export declare function createExposureNode(inputs?: Partial<ExposureInputs>): ExposureNode;
export declare function createCombineHSVNode(inputs?: Partial<CombineHSVInputs>): CombineHSVNode;
export declare function createSeparateRGBNode(inputs?: Partial<SeparateRGBInputs>): SeparateRGBNode;
export declare function createSeparateColorNode(inputs?: Partial<SeparateColorInputs>): SeparateColorNode;
export declare function createCombineRGBNode(inputs?: Partial<CombineRGBInputs>): CombineRGBNode;
export declare function createCombineColorNode(inputs?: Partial<CombineColorInputs>): CombineColorNode;
export declare function createHueSaturationValueNode(inputs?: Partial<HueSaturationValueInputs>): HueSaturationValueNode;
export declare function createBlackBodyNode(inputs?: Partial<BlackBodyInputs>): BlackBodyNode;
export declare function createInvertNode(inputs?: Partial<InvertInputs>): InvertNode;
//# sourceMappingURL=ColorNodes.d.ts.map