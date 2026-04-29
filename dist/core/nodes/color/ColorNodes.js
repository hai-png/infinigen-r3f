/**
 * Color Nodes - Color manipulation and conversion nodes
 * Based on Blender color nodes and infinigen material system
 *
 * These nodes handle color operations, conversions, and adjustments
 */
import { NodeTypes } from '../core/node-types';
// ============================================================================
// Node Implementations
// ============================================================================
/**
 * Color Ramp Node
 * Maps a factor to colors using a gradient ramp
 */
export class ColorRampNode {
    constructor() {
        this.type = NodeTypes.ColorRamp;
        this.name = 'Color Ramp';
        this.inputs = {
            factor: 0.5,
            colorRamp: [
                { position: 0, color: { r: 0, g: 0, b: 0 } },
                { position: 1, color: { r: 1, g: 1, b: 1 } },
            ],
            interpolation: 'linear',
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
            alpha: 1,
        };
    }
    execute() {
        const factor = Math.max(0, Math.min(1, this.inputs.factor || 0.5));
        const ramp = this.inputs.colorRamp || [];
        if (ramp.length === 0) {
            this.outputs.color = { r: 0, g: 0, b: 0 };
            this.outputs.alpha = 1;
            return this.outputs;
        }
        // Find the two stops to interpolate between
        let lowerStop = ramp[0];
        let upperStop = ramp[ramp.length - 1];
        for (let i = 0; i < ramp.length - 1; i++) {
            if (factor >= ramp[i].position && factor <= ramp[i + 1].position) {
                lowerStop = ramp[i];
                upperStop = ramp[i + 1];
                break;
            }
        }
        // Interpolate
        const range = upperStop.position - lowerStop.position;
        const t = range > 0 ? (factor - lowerStop.position) / range : 0;
        const interpolatedT = this.applyInterpolation(t);
        this.outputs.color = {
            r: this.lerp(lowerStop.color.r, upperStop.color.r, interpolatedT),
            g: this.lerp(lowerStop.color.g, upperStop.color.g, interpolatedT),
            b: this.lerp(lowerStop.color.b, upperStop.color.b, interpolatedT),
        };
        this.outputs.alpha = 1;
        return this.outputs;
    }
    applyInterpolation(t) {
        const interpolation = this.inputs.interpolation || 'linear';
        switch (interpolation) {
            case 'smooth':
                return t * t * (3 - 2 * t);
            case 'ease':
                return 0.5 * Math.sin((t - 0.5) * Math.PI) + 0.5;
            case 'b_spline':
                return this.bspline(t);
            default:
                return t;
        }
    }
    bspline(t) {
        const t2 = t * t;
        const t3 = t2 * t;
        return (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
    }
    lerp(a, b, t) {
        return a + t * (b - a);
    }
}
/**
 * Mix RGB Node
 * Blends two colors using various blend modes
 */
export class MixRGBNode {
    constructor() {
        this.type = NodeTypes.MixRGB;
        this.name = 'Mix RGB';
        this.inputs = {
            blendType: 'mix',
            color1: { r: 1, g: 1, b: 1 },
            color2: { r: 0, g: 0, b: 0 },
            factor: 0.5,
            clampResult: false,
            clampFactor: true,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        let factor = this.inputs.factor || 0.5;
        if (this.inputs.clampFactor) {
            factor = Math.max(0, Math.min(1, factor));
        }
        const c1 = this.inputs.color1 || { r: 0, g: 0, b: 0 };
        const c2 = this.inputs.color2 || { r: 0, g: 0, b: 0 };
        const blendType = this.inputs.blendType || 'mix';
        let result;
        switch (blendType) {
            case 'mix':
                result = this.mix(c1, c2, factor);
                break;
            case 'add':
                result = this.add(c1, c2, factor);
                break;
            case 'multiply':
                result = this.multiply(c1, c2, factor);
                break;
            case 'subtract':
                result = this.subtract(c1, c2, factor);
                break;
            case 'screen':
                result = this.screen(c1, c2, factor);
                break;
            case 'divide':
                result = this.divide(c1, c2, factor);
                break;
            case 'difference':
                result = this.difference(c1, c2, factor);
                break;
            case 'darken':
                result = this.darken(c1, c2, factor);
                break;
            case 'lighten':
                result = this.lighten(c1, c2, factor);
                break;
            default:
                result = this.mix(c1, c2, factor);
        }
        if (this.inputs.clampResult) {
            result.r = Math.max(0, Math.min(1, result.r));
            result.g = Math.max(0, Math.min(1, result.g));
            result.b = Math.max(0, Math.min(1, result.b));
        }
        this.outputs.color = result;
        return this.outputs;
    }
    mix(c1, c2, f) {
        return {
            r: c1.r + f * (c2.r - c1.r),
            g: c1.g + f * (c2.g - c1.g),
            b: c1.b + f * (c2.b - c1.b),
        };
    }
    add(c1, c2, f) {
        return {
            r: c1.r + f * c2.r,
            g: c1.g + f * c2.g,
            b: c1.b + f * c2.b,
        };
    }
    multiply(c1, c2, f) {
        return {
            r: c1.r + f * (c1.r * c2.r - c1.r),
            g: c1.g + f * (c1.g * c2.g - c1.g),
            b: c1.b + f * (c1.b * c2.b - c1.b),
        };
    }
    subtract(c1, c2, f) {
        return {
            r: c1.r - f * c2.r,
            g: c1.g - f * c2.g,
            b: c1.b - f * c2.b,
        };
    }
    screen(c1, c2, f) {
        return {
            r: c1.r + f * (1 - (1 - c1.r) * (1 - c2.r) - c1.r),
            g: c1.g + f * (1 - (1 - c1.g) * (1 - c2.g) - c1.g),
            b: c1.b + f * (1 - (1 - c1.b) * (1 - c2.b) - c1.b),
        };
    }
    divide(c1, c2, f) {
        return {
            r: c1.r + f * (c2.r !== 0 ? c1.r / c2.r - c1.r : 0),
            g: c1.g + f * (c2.g !== 0 ? c1.g / c2.g - c1.g : 0),
            b: c1.b + f * (c2.b !== 0 ? c1.b / c2.b - c1.b : 0),
        };
    }
    difference(c1, c2, f) {
        return {
            r: c1.r + f * (Math.abs(c1.r - c2.r) - c1.r),
            g: c1.g + f * (Math.abs(c1.g - c2.g) - c1.g),
            b: c1.b + f * (Math.abs(c1.b - c2.b) - c1.b),
        };
    }
    darken(c1, c2, f) {
        return {
            r: c1.r + f * (Math.min(c1.r, c2.r) - c1.r),
            g: c1.g + f * (Math.min(c1.g, c2.g) - c1.g),
            b: c1.b + f * (Math.min(c1.b, c2.b) - c1.b),
        };
    }
    lighten(c1, c2, f) {
        return {
            r: c1.r + f * (Math.max(c1.r, c2.r) - c1.r),
            g: c1.g + f * (Math.max(c1.g, c2.g) - c1.g),
            b: c1.b + f * (Math.max(c1.b, c2.b) - c1.b),
        };
    }
}
/**
 * RGB Curve Node
 * Applies color curves to RGB channels
 */
export class RGBCurveNode {
    constructor() {
        this.type = NodeTypes.RGBCurve;
        this.name = 'RGB Curve';
        this.inputs = {
            color: { r: 0.5, g: 0.5, b: 0.5 },
            curveR: [[0, 0], [1, 1]],
            curveG: [[0, 0], [1, 1]],
            curveB: [[0, 0], [1, 1]],
            factor: 1,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        const color = this.inputs.color || { r: 0, g: 0, b: 0 };
        const factor = this.inputs.factor || 1;
        const r = this.evaluateCurve(color.r, this.inputs.curveR || []);
        const g = this.evaluateCurve(color.g, this.inputs.curveG || []);
        const b = this.evaluateCurve(color.b, this.inputs.curveB || []);
        this.outputs.color = {
            r: color.r + factor * (r - color.r),
            g: color.g + factor * (g - color.g),
            b: color.b + factor * (b - color.b),
        };
        return this.outputs;
    }
    evaluateCurve(value, curve) {
        if (curve.length === 0)
            return value;
        if (curve.length === 1)
            return curve[0][1];
        // Find segment
        for (let i = 0; i < curve.length - 1; i++) {
            const [x0, y0] = curve[i];
            const [x1, y1] = curve[i + 1];
            if (value >= x0 && value <= x1) {
                const t = (value - x0) / (x1 - x0);
                return y0 + t * (y1 - y0);
            }
        }
        // Extrapolate
        if (value < curve[0][0])
            return curve[0][1];
        return curve[curve.length - 1][1];
    }
}
/**
 * Bright/Contrast Node
 * Adjusts brightness and contrast of a color
 */
export class BrightContrastNode {
    constructor() {
        this.type = NodeTypes.BrightContrast;
        this.name = 'Bright/Contrast';
        this.inputs = {
            color: { r: 0.5, g: 0.5, b: 0.5 },
            bright: 0,
            contrast: 0,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        const color = this.inputs.color || { r: 0, g: 0, b: 0 };
        const bright = this.inputs.bright || 0;
        const contrast = this.inputs.contrast || 0;
        const contrastFactor = (1 + contrast) / (1 - contrast);
        this.outputs.color = {
            r: this.clamp((color.r + bright) * contrastFactor + 0.5 - 0.5 * contrastFactor),
            g: this.clamp((color.g + bright) * contrastFactor + 0.5 - 0.5 * contrastFactor),
            b: this.clamp((color.b + bright) * contrastFactor + 0.5 - 0.5 * contrastFactor),
        };
        return this.outputs;
    }
    clamp(value) {
        return Math.max(0, Math.min(1, value));
    }
}
/**
 * Exposure Node
 * Adjusts exposure and gamma
 */
export class ExposureNode {
    constructor() {
        this.type = NodeTypes.Exposure;
        this.name = 'Exposure';
        this.inputs = {
            color: { r: 0.5, g: 0.5, b: 0.5 },
            exposure: 0,
            gamma: 1,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        const color = this.inputs.color || { r: 0, g: 0, b: 0 };
        const exposure = this.inputs.exposure || 0;
        const gamma = this.inputs.gamma || 1;
        const exposureFactor = Math.pow(2, exposure);
        this.outputs.color = {
            r: Math.pow(this.clamp(color.r * exposureFactor), 1 / gamma),
            g: Math.pow(this.clamp(color.g * exposureFactor), 1 / gamma),
            b: Math.pow(this.clamp(color.b * exposureFactor), 1 / gamma),
        };
        return this.outputs;
    }
    clamp(value) {
        return Math.max(0, Math.min(1, value));
    }
}
/**
 * Combine HSV Node
 * Converts HSV to RGB
 */
export class CombineHSVNode {
    constructor() {
        this.type = NodeTypes.CombineHSV;
        this.name = 'Combine HSV';
        this.inputs = {
            hue: 0,
            saturation: 1,
            value: 1,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        const h = (this.inputs.hue || 0) % 1;
        const s = Math.max(0, Math.min(1, this.inputs.saturation || 0));
        const v = Math.max(0, Math.min(1, this.inputs.value || 0));
        const rgb = this.hsvToRgb(h, s, v);
        this.outputs.color = rgb;
        return this.outputs;
    }
    hsvToRgb(h, s, v) {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: return { r: v, g: t, b: p };
            case 1: return { r: q, g: v, b: p };
            case 2: return { r: p, g: v, b: t };
            case 3: return { r: p, g: q, b: v };
            case 4: return { r: t, g: p, b: v };
            case 5: return { r: v, g: p, b: q };
            default: return { r: v, g: t, b: p };
        }
    }
}
/**
 * Separate RGB Node
 * Splits RGB color into components
 */
export class SeparateRGBNode {
    constructor() {
        this.type = NodeTypes.SeparateRGB;
        this.name = 'Separate RGB';
        this.inputs = {
            color: { r: 0.5, g: 0.5, b: 0.5 },
        };
        this.outputs = {
            r: 0,
            g: 0,
            b: 0,
        };
    }
    execute() {
        const color = this.inputs.color || { r: 0, g: 0, b: 0 };
        this.outputs.r = color.r;
        this.outputs.g = color.g;
        this.outputs.b = color.b;
        return this.outputs;
    }
}
/**
 * Separate Color Node
 * Splits RGBA color into components
 */
export class SeparateColorNode {
    constructor() {
        this.type = NodeTypes.SeparateColor;
        this.name = 'Separate Color';
        this.inputs = {
            color: { r: 0.5, g: 0.5, b: 0.5 },
        };
        this.outputs = {
            r: 0,
            g: 0,
            b: 0,
            a: 1,
        };
    }
    execute() {
        const color = this.inputs.color || { r: 0, g: 0, b: 0 };
        this.outputs.r = color.r;
        this.outputs.g = color.g;
        this.outputs.b = color.b;
        this.outputs.a = color.a ?? 1;
        return this.outputs;
    }
}
/**
 * Combine RGB Node
 * Combines RGB components into color
 */
export class CombineRGBNode {
    constructor() {
        this.type = NodeTypes.CombineRGB;
        this.name = 'Combine RGB';
        this.inputs = {
            r: 0,
            g: 0,
            b: 0,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        this.outputs.color = {
            r: this.inputs.r || 0,
            g: this.inputs.g || 0,
            b: this.inputs.b || 0,
        };
        return this.outputs;
    }
}
/**
 * Combine Color Node
 * Combines RGBA components into color
 */
export class CombineColorNode {
    constructor() {
        this.type = NodeTypes.CombineColor;
        this.name = 'Combine Color';
        this.inputs = {
            r: 0,
            g: 0,
            b: 0,
            a: 1,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        this.outputs.color = {
            r: this.inputs.r || 0,
            g: this.inputs.g || 0,
            b: this.inputs.b || 0,
            a: this.inputs.a ?? 1,
        };
        return this.outputs;
    }
}
/**
 * Hue Saturation Value Node
 * Adjusts hue, saturation, and value of a color
 */
export class HueSaturationValueNode {
    constructor() {
        this.type = NodeTypes.HueSaturationValue;
        this.name = 'Hue Saturation Value';
        this.inputs = {
            color: { r: 0.5, g: 0.5, b: 0.5 },
            hue: 0,
            saturation: 0,
            value: 0,
            fac: 1,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        const color = this.inputs.color || { r: 0, g: 0, b: 0 };
        const fac = this.inputs.fac ?? 1;
        const [h, s, v] = this.rgbToHsv(color.r, color.g, color.b);
        const newH = (h + this.inputs.hue * fac) % 1;
        const newS = Math.max(0, Math.min(1, s + this.inputs.saturation * fac));
        const newV = Math.max(0, Math.min(1, v + this.inputs.value * fac));
        this.outputs.color = this.hsvToRgb(newH, newS, newV);
        return this.outputs;
    }
    rgbToHsv(r, g, b) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        if (d !== 0) {
            switch (max) {
                case r:
                    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                    break;
                case g:
                    h = ((b - r) / d + 2) / 6;
                    break;
                case b:
                    h = ((r - g) / d + 4) / 6;
                    break;
            }
        }
        const s = max === 0 ? 0 : d / max;
        const v = max;
        return [h, s, v];
    }
    hsvToRgb(h, s, v) {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: return { r: v, g: t, b: p };
            case 1: return { r: q, g: v, b: p };
            case 2: return { r: p, g: v, b: t };
            case 3: return { r: p, g: q, b: v };
            case 4: return { r: t, g: p, b: v };
            case 5: return { r: v, g: p, b: q };
            default: return { r: v, g: t, b: p };
        }
    }
}
/**
 * Black Body Node
 * Generates color from black body temperature
 */
export class BlackBodyNode {
    constructor() {
        this.type = NodeTypes.BlackBody;
        this.name = 'Black Body';
        this.inputs = {
            temperature: 6500,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        const temp = this.inputs.temperature || 6500;
        this.outputs.color = this.temperatureToRGB(temp);
        return this.outputs;
    }
    temperatureToRGB(temp) {
        const t = temp / 100;
        let r, g, b;
        // Red
        if (t <= 66) {
            r = 255;
        }
        else {
            r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
            r = Math.max(0, Math.min(255, r));
        }
        // Green
        if (t <= 66) {
            g = 99.4708025861 * Math.log(t) - 161.1195681661;
        }
        else {
            g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
        }
        g = Math.max(0, Math.min(255, g));
        // Blue
        if (t >= 66) {
            b = 255;
        }
        else if (t <= 19) {
            b = 0;
        }
        else {
            b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
            b = Math.max(0, Math.min(255, b));
        }
        return {
            r: r / 255,
            g: g / 255,
            b: b / 255,
        };
    }
}
/**
 * Invert Node
 * Inverts color values
 */
export class InvertNode {
    constructor() {
        this.type = NodeTypes.Invert;
        this.name = 'Invert';
        this.inputs = {
            color: { r: 0.5, g: 0.5, b: 0.5 },
            fac: 1,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        const color = this.inputs.color || { r: 0, g: 0, b: 0 };
        const fac = this.inputs.fac ?? 1;
        this.outputs.color = {
            r: color.r + fac * (1 - color.r - color.r),
            g: color.g + fac * (1 - color.g - color.g),
            b: color.b + fac * (1 - color.b - color.b),
        };
        return this.outputs;
    }
}
// ============================================================================
// Factory Functions
// ============================================================================
export function createColorRampNode(inputs) {
    const node = new ColorRampNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createMixRGBNode(inputs) {
    const node = new MixRGBNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createRGBCurveNode(inputs) {
    const node = new RGBCurveNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createBrightContrastNode(inputs) {
    const node = new BrightContrastNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createExposureNode(inputs) {
    const node = new ExposureNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createCombineHSVNode(inputs) {
    const node = new CombineHSVNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createSeparateRGBNode(inputs) {
    const node = new SeparateRGBNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createSeparateColorNode(inputs) {
    const node = new SeparateColorNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createCombineRGBNode(inputs) {
    const node = new CombineRGBNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createCombineColorNode(inputs) {
    const node = new CombineColorNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createHueSaturationValueNode(inputs) {
    const node = new HueSaturationValueNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createBlackBodyNode(inputs) {
    const node = new BlackBodyNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createInvertNode(inputs) {
    const node = new InvertNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
//# sourceMappingURL=ColorNodes.js.map