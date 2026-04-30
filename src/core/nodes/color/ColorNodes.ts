/**
 * Color Nodes - Color manipulation and conversion nodes
 * Based on Blender color nodes and infinigen material system
 * 
 * These nodes handle color operations, conversions, and adjustments
 */

import { NodeTypes } from '../core/node-types';
import type { Color } from 'three';

// Accept both THREE.Color and plain objects for compatibility
export type ColorLike = Color | { r: number; g: number; b: number };

// ============================================================================
// Type Definitions
// ============================================================================

export interface ColorNodeBase {
  type: NodeTypes;
  name: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
}

export interface ColorRampInputs {
  factor?: number;
  colorRamp?: Array<{ position: number; color: ColorLike }>;
  interpolation?: 'constant' | 'linear' | 'b_spline' | 'cardinal' | 'ease' | 'smooth_step';
}

export interface ColorRampOutputs {
  color: ColorLike;
  alpha: number;
}

export interface MixRGBInputs {
  blendType?: 'mix' | 'add' | 'multiply' | 'subtract' | 'screen' | 'divide' | 'difference' | 'darken' | 'lighten' | 'overlay' | 'soft_light' | 'linear_light' | 'color_dodge' | 'color_burn' | 'hue' | 'saturation' | 'value' | 'color' | 'luminosity';
  color1?: ColorLike;
  color2?: ColorLike;
  factor?: number;
  clampResult?: boolean;
  clampFactor?: boolean;
}

export interface MixRGBOutputs {
  color: ColorLike;
}

export interface RGBCurveInputs {
  color?: ColorLike;
  curveR?: Array<[number, number]>;
  curveG?: Array<[number, number]>;
  curveB?: Array<[number, number]>;
  factor?: number;
}

export interface RGBCurveOutputs {
  color: ColorLike;
}

export interface BrightContrastInputs {
  color?: ColorLike;
  bright?: number;
  contrast?: number;
}

export interface BrightContrastOutputs {
  color: ColorLike;
}

export interface ExposureInputs {
  color?: ColorLike;
  exposure?: number;
  gamma?: number;
}

export interface ExposureOutputs {
  color: ColorLike;
}

export interface CombineHSVInputs {
  hue?: number;
  saturation?: number;
  value?: number;
}

export interface CombineHSVOutputs {
  color: ColorLike;
}

export interface SeparateRGBInputs {
  color?: ColorLike;
}

export interface SeparateRGBOutputs {
  r: number;
  g: number;
  b: number;
}

export interface SeparateColorInputs {
  color?: ColorLike;
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
  color: ColorLike;
}

export interface CombineColorInputs {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
}

export interface CombineColorOutputs {
  color: ColorLike;
}

export interface HueSaturationValueInputs {
  color?: ColorLike;
  hue?: number;
  saturation?: number;
  value?: number;
  fac?: number;
}

export interface HueSaturationValueOutputs {
  color: ColorLike;
}

export interface BlackBodyInputs {
  temperature?: number;
}

export interface BlackBodyOutputs {
  color: ColorLike;
}

export interface InvertInputs {
  color?: ColorLike;
  fac?: number;
}

export interface InvertOutputs {
  color: ColorLike;
}

export interface PremulAlphaInputs {
  color?: ColorLike;
  alpha?: number;
}

export interface PremulAlphaOutputs {
  color: ColorLike;
}

export interface SetAlphaInputs {
  color?: ColorLike;
  alpha?: number;
  fac?: number;
}

export interface SetAlphaOutputs {
  color: ColorLike;
}

export interface AlphaOverInputs {
  color1?: ColorLike;
  color2?: ColorLike;
  fac?: number;
}

export interface AlphaOverOutputs {
  color: ColorLike;
}

// ============================================================================
// Node Implementations
// ============================================================================

/**
 * Color Ramp Node
 * Maps a factor to colors using a gradient ramp
 */
export class ColorRampNode implements ColorNodeBase {
  readonly type = NodeTypes.ColorRamp;
  readonly name = 'Color Ramp';
  
  inputs: ColorRampInputs = {
    factor: 0.5,
    colorRamp: [
      { position: 0, color: { r: 0, g: 0, b: 0 } },
      { position: 1, color: { r: 1, g: 1, b: 1 } },
    ],
    interpolation: 'linear',
  };
  
  outputs: ColorRampOutputs = {
    color: { r: 0, g: 0, b: 0 },
    alpha: 1,
  };

  execute(): ColorRampOutputs {
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

  private applyInterpolation(t: number): number {
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

  private bspline(t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }
}

/**
 * Mix RGB Node
 * Blends two colors using various blend modes
 */
export class MixRGBNode implements ColorNodeBase {
  readonly type = NodeTypes.MixRGB;
  readonly name = 'Mix RGB';
  
  inputs: MixRGBInputs = {
    blendType: 'mix',
    color1: { r: 1, g: 1, b: 1 },
    color2: { r: 0, g: 0, b: 0 },
    factor: 0.5,
    clampResult: false,
    clampFactor: true,
  };
  
  outputs: MixRGBOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): MixRGBOutputs {
    let factor = this.inputs.factor || 0.5;
    if (this.inputs.clampFactor) {
      factor = Math.max(0, Math.min(1, factor));
    }
    
    const c1 = this.inputs.color1 || { r: 0, g: 0, b: 0 };
    const c2 = this.inputs.color2 || { r: 0, g: 0, b: 0 };
    const blendType = this.inputs.blendType || 'mix';
    
    let result: ColorLike;
    
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

  private mix(c1: Color, c2: Color, f: number): Color {
    return {
      r: c1.r + f * (c2.r - c1.r),
      g: c1.g + f * (c2.g - c1.g),
      b: c1.b + f * (c2.b - c1.b),
    };
  }

  private add(c1: Color, c2: Color, f: number): Color {
    return {
      r: c1.r + f * c2.r,
      g: c1.g + f * c2.g,
      b: c1.b + f * c2.b,
    };
  }

  private multiply(c1: Color, c2: Color, f: number): Color {
    return {
      r: c1.r + f * (c1.r * c2.r - c1.r),
      g: c1.g + f * (c1.g * c2.g - c1.g),
      b: c1.b + f * (c1.b * c2.b - c1.b),
    };
  }

  private subtract(c1: Color, c2: Color, f: number): Color {
    return {
      r: c1.r - f * c2.r,
      g: c1.g - f * c2.g,
      b: c1.b - f * c2.b,
    };
  }

  private screen(c1: Color, c2: Color, f: number): Color {
    return {
      r: c1.r + f * (1 - (1 - c1.r) * (1 - c2.r) - c1.r),
      g: c1.g + f * (1 - (1 - c1.g) * (1 - c2.g) - c1.g),
      b: c1.b + f * (1 - (1 - c1.b) * (1 - c2.b) - c1.b),
    };
  }

  private divide(c1: Color, c2: Color, f: number): Color {
    return {
      r: c1.r + f * (c2.r !== 0 ? c1.r / c2.r - c1.r : 0),
      g: c1.g + f * (c2.g !== 0 ? c1.g / c2.g - c1.g : 0),
      b: c1.b + f * (c2.b !== 0 ? c1.b / c2.b - c1.b : 0),
    };
  }

  private difference(c1: Color, c2: Color, f: number): Color {
    return {
      r: c1.r + f * (Math.abs(c1.r - c2.r) - c1.r),
      g: c1.g + f * (Math.abs(c1.g - c2.g) - c1.g),
      b: c1.b + f * (Math.abs(c1.b - c2.b) - c1.b),
    };
  }

  private darken(c1: Color, c2: Color, f: number): Color {
    return {
      r: c1.r + f * (Math.min(c1.r, c2.r) - c1.r),
      g: c1.g + f * (Math.min(c1.g, c2.g) - c1.g),
      b: c1.b + f * (Math.min(c1.b, c2.b) - c1.b),
    };
  }

  private lighten(c1: Color, c2: Color, f: number): Color {
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
export class RGBCurveNode implements ColorNodeBase {
  readonly type = NodeTypes.RGBCurve;
  readonly name = 'RGB Curve';
  
  inputs: RGBCurveInputs = {
    color: { r: 0.5, g: 0.5, b: 0.5 },
    curveR: [[0, 0], [1, 1]],
    curveG: [[0, 0], [1, 1]],
    curveB: [[0, 0], [1, 1]],
    factor: 1,
  };
  
  outputs: RGBCurveOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): RGBCurveOutputs {
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

  private evaluateCurve(value: number, curve: Array<[number, number]>): number {
    if (curve.length === 0) return value;
    if (curve.length === 1) return curve[0][1];
    
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
    if (value < curve[0][0]) return curve[0][1];
    return curve[curve.length - 1][1];
  }
}

/**
 * Bright/Contrast Node
 * Adjusts brightness and contrast of a color
 */
export class BrightContrastNode implements ColorNodeBase {
  readonly type = NodeTypes.BrightContrast;
  readonly name = 'Bright/Contrast';
  
  inputs: BrightContrastInputs = {
    color: { r: 0.5, g: 0.5, b: 0.5 },
    bright: 0,
    contrast: 0,
  };
  
  outputs: BrightContrastOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): BrightContrastOutputs {
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

  private clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}

/**
 * Exposure Node
 * Adjusts exposure and gamma
 */
export class ExposureNode implements ColorNodeBase {
  readonly type = NodeTypes.Exposure;
  readonly name = 'Exposure';
  
  inputs: ExposureInputs = {
    color: { r: 0.5, g: 0.5, b: 0.5 },
    exposure: 0,
    gamma: 1,
  };
  
  outputs: ExposureOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): ExposureOutputs {
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

  private clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}

/**
 * Combine HSV Node
 * Converts HSV to RGB
 */
export class CombineHSVNode implements ColorNodeBase {
  readonly type = NodeTypes.CombineHSV;
  readonly name = 'Combine HSV';
  
  inputs: CombineHSVInputs = {
    hue: 0,
    saturation: 1,
    value: 1,
  };
  
  outputs: CombineHSVOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): CombineHSVOutputs {
    const h = (this.inputs.hue || 0) % 1;
    const s = Math.max(0, Math.min(1, this.inputs.saturation || 0));
    const v = Math.max(0, Math.min(1, this.inputs.value || 0));
    
    const rgb = this.hsvToRgb(h, s, v);
    
    this.outputs.color = rgb;
    
    return this.outputs;
  }

  private hsvToRgb(h: number, s: number, v: number): Color {
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
export class SeparateRGBNode implements ColorNodeBase {
  readonly type = NodeTypes.SeparateRGB;
  readonly name = 'Separate RGB';
  
  inputs: SeparateRGBInputs = {
    color: { r: 0.5, g: 0.5, b: 0.5 },
  };
  
  outputs: SeparateRGBOutputs = {
    r: 0,
    g: 0,
    b: 0,
  };

  execute(): SeparateRGBOutputs {
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
export class SeparateColorNode implements ColorNodeBase {
  readonly type = NodeTypes.SeparateColor;
  readonly name = 'Separate Color';
  
  inputs: SeparateColorInputs = {
    color: { r: 0.5, g: 0.5, b: 0.5 },
  };
  
  outputs: SeparateColorOutputs = {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  };

  execute(): SeparateColorOutputs {
    const color = this.inputs.color || { r: 0, g: 0, b: 0 };
    
    this.outputs.r = color.r;
    this.outputs.g = color.g;
    this.outputs.b = color.b;
    this.outputs.a = (color as any).a ?? 1;
    
    return this.outputs;
  }
}

/**
 * Combine RGB Node
 * Combines RGB components into color
 */
export class CombineRGBNode implements ColorNodeBase {
  readonly type = NodeTypes.CombineRGB;
  readonly name = 'Combine RGB';
  
  inputs: CombineRGBInputs = {
    r: 0,
    g: 0,
    b: 0,
  };
  
  outputs: CombineRGBOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): CombineRGBOutputs {
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
export class CombineColorNode implements ColorNodeBase {
  readonly type = NodeTypes.CombineColor;
  readonly name = 'Combine Color';
  
  inputs: CombineColorInputs = {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  };
  
  outputs: CombineColorOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): CombineColorOutputs {
    this.outputs.color = {
      r: this.inputs.r || 0,
      g: this.inputs.g || 0,
      b: this.inputs.b || 0,
      a: this.inputs.a ?? 1,
    } as any;
    
    return this.outputs;
  }
}

/**
 * Hue Saturation Value Node
 * Adjusts hue, saturation, and value of a color
 */
export class HueSaturationValueNode implements ColorNodeBase {
  readonly type = NodeTypes.HueSaturationValue;
  readonly name = 'Hue Saturation Value';
  
  inputs: HueSaturationValueInputs = {
    color: { r: 0.5, g: 0.5, b: 0.5 },
    hue: 0,
    saturation: 0,
    value: 0,
    fac: 1,
  };
  
  outputs: HueSaturationValueOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): HueSaturationValueOutputs {
    const color = this.inputs.color || { r: 0, g: 0, b: 0 };
    const fac = this.inputs.fac ?? 1;
    
    const [h, s, v] = this.rgbToHsv(color.r, color.g, color.b);
    
    const newH = (h + this.inputs.hue! * fac) % 1;
    const newS = Math.max(0, Math.min(1, s + this.inputs.saturation! * fac));
    const newV = Math.max(0, Math.min(1, v + this.inputs.value! * fac));
    
    this.outputs.color = this.hsvToRgb(newH, newS, newV);
    
    return this.outputs;
  }

  private rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    
    const s = max === 0 ? 0 : d / max;
    const v = max;
    
    return [h, s, v];
  }

  private hsvToRgb(h: number, s: number, v: number): Color {
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
export class BlackBodyNode implements ColorNodeBase {
  readonly type = NodeTypes.BlackBody;
  readonly name = 'Black Body';
  
  inputs: BlackBodyInputs = {
    temperature: 6500,
  };
  
  outputs: BlackBodyOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): BlackBodyOutputs {
    const temp = this.inputs.temperature || 6500;
    this.outputs.color = this.temperatureToRGB(temp);
    return this.outputs;
  }

  private temperatureToRGB(temp: number): Color {
    const t = temp / 100;
    
    let r: number, g: number, b: number;
    
    // Red
    if (t <= 66) {
      r = 255;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      r = Math.max(0, Math.min(255, r));
    }
    
    // Green
    if (t <= 66) {
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
    } else {
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    }
    g = Math.max(0, Math.min(255, g));
    
    // Blue
    if (t >= 66) {
      b = 255;
    } else if (t <= 19) {
      b = 0;
    } else {
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
export class InvertNode implements ColorNodeBase {
  readonly type = NodeTypes.Invert;
  readonly name = 'Invert';
  
  inputs: InvertInputs = {
    color: { r: 0.5, g: 0.5, b: 0.5 },
    fac: 1,
  };
  
  outputs: InvertOutputs = {
    color: { r: 0, g: 0, b: 0 },
  };

  execute(): InvertOutputs {
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

export function createColorRampNode(inputs?: Partial<ColorRampInputs>): ColorRampNode {
  const node = new ColorRampNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMixRGBNode(inputs?: Partial<MixRGBInputs>): MixRGBNode {
  const node = new MixRGBNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createRGBCurveNode(inputs?: Partial<RGBCurveInputs>): RGBCurveNode {
  const node = new RGBCurveNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createBrightContrastNode(inputs?: Partial<BrightContrastInputs>): BrightContrastNode {
  const node = new BrightContrastNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createExposureNode(inputs?: Partial<ExposureInputs>): ExposureNode {
  const node = new ExposureNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createCombineHSVNode(inputs?: Partial<CombineHSVInputs>): CombineHSVNode {
  const node = new CombineHSVNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createSeparateRGBNode(inputs?: Partial<SeparateRGBInputs>): SeparateRGBNode {
  const node = new SeparateRGBNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createSeparateColorNode(inputs?: Partial<SeparateColorInputs>): SeparateColorNode {
  const node = new SeparateColorNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createCombineRGBNode(inputs?: Partial<CombineRGBInputs>): CombineRGBNode {
  const node = new CombineRGBNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createCombineColorNode(inputs?: Partial<CombineColorInputs>): CombineColorNode {
  const node = new CombineColorNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createHueSaturationValueNode(inputs?: Partial<HueSaturationValueInputs>): HueSaturationValueNode {
  const node = new HueSaturationValueNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createBlackBodyNode(inputs?: Partial<BlackBodyInputs>): BlackBodyNode {
  const node = new BlackBodyNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createInvertNode(inputs?: Partial<InvertInputs>): InvertNode {
  const node = new InvertNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}
