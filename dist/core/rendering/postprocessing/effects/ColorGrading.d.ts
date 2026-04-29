import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';
/**
 * ColorGrading - Professional color grading and tone mapping effect
 *
 * Provides comprehensive color correction controls including:
 * - Exposure and contrast
 * - Saturation and vibrance
 * - Color temperature and tint
 * - Lift, gamma, gain (shadow/mid/highlight coloring)
 * - Tone curve adjustments
 * - Film emulation LUTs
 *
 * @example
 * ```tsx
 * <EffectChain>
 *   <ColorGrading
 *     exposure={1.0}
 *     contrast={1.1}
 *     saturation={1.2}
 *     temperature={6500}
 *     tint={0}
 *   />
 * </EffectChain>
 * ```
 */
export interface ColorGradingProps {
    /** Exposure adjustment (EV stops). Default: 0 */
    exposure?: number;
    /** Contrast multiplier. Default: 1.0 */
    contrast?: number;
    /** Saturation multiplier. Default: 1.0 */
    saturation?: number;
    /** Vibrance (protects skin tones). Default: 0 */
    vibrance?: number;
    /** Color temperature in Kelvin. Default: 6500 */
    temperature?: number;
    /** Tint adjustment (-1 green to +1 magenta). Default: 0 */
    tint?: number;
    /** Shadow color (lift). RGB values 0-1. Default: [0, 0, 0] */
    lift?: [number, number, number];
    /** Midtone color (gamma). RGB values 0-1. Default: [1, 1, 1] */
    gamma?: [number, number, number];
    /** Highlight color (gain). RGB values 0-1. Default: [1, 1, 1] */
    gain?: [number, number, number];
    /** Enable/disable effect */
    enabled?: boolean;
    /** Tone mapping operator */
    toneMapping?: 'aces' | 'reinhard' | 'filmic' | 'linear';
    /** Film emulation strength (0-1). Default: 0 */
    filmEmulation?: number;
    /** Vignette intensity (0-1). Default: 0 */
    vignette?: number;
}
export declare class ColorGrading extends Effect {
    private uniforms;
    private props;
    private lutTexture;
    constructor(props?: ColorGradingProps);
    /**
     * Convert color temperature (Kelvin) to RGB
     */
    private temperatureToRGB;
    /**
     * Update exposure
     */
    setExposure(value: number): void;
    /**
     * Update contrast
     */
    setContrast(value: number): void;
    /**
     * Update saturation
     */
    setSaturation(value: number): void;
    /**
     * Update color temperature
     */
    setTemperature(kelvin: number): void;
    /**
     * Update tint
     */
    setTint(value: number): void;
    /**
     * Set lift (shadow color)
     */
    setLift(rgb: [number, number, number]): void;
    /**
     * Set gamma (midtone color)
     */
    setGamma(rgb: [number, number, number]): void;
    /**
     * Set gain (highlight color)
     */
    setGain(rgb: [number, number, number]): void;
    /**
     * Load a custom LUT for film emulation
     */
    loadLUT(texture: THREE.DataTexture): void;
    /**
     * Get current grading parameters
     */
    getParams(): ColorGradingProps;
}
/**
 * GLSL fragment shader for color grading
 */
export declare const colorGradingFragmentShader = "\n  uniform float exposure;\n  uniform float contrast;\n  uniform float saturation;\n  uniform float vibrance;\n  uniform vec3 temperature;\n  uniform float tint;\n  uniform vec3 lift;\n  uniform vec3 gamma;\n  uniform vec3 gain;\n  uniform float filmEmulation;\n  uniform float vignette;\n  \n  varying vec2 vUv;\n  uniform sampler2D inputBuffer;\n  \n  // Convert RGB to HSV\n  vec3 rgb2hsv(vec3 c) {\n    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);\n    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));\n    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));\n    \n    float d = q.x - min(q.w, q.y);\n    float e = 1.0e-10;\n    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);\n  }\n  \n  // Convert HSV to RGB\n  vec3 hsv2rgb(vec3 c) {\n    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);\n    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);\n    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);\n  }\n  \n  // Apply contrast\n  vec3 applyContrast(vec3 color, float contrast) {\n    return (color - 0.5) * contrast + 0.5;\n  }\n  \n  // Apply saturation with vibrance protection\n  vec3 applySaturation(vec3 color, float saturation, float vibrance) {\n    vec3 hsv = rgb2hsv(color);\n    \n    // Vibrance protects low-saturation colors (skin tones)\n    float satAdjust = saturation + vibrance * (1.0 - hsv.y);\n    hsv.y *= satAdjust;\n    hsv.y = clamp(hsv.y, 0.0, 1.0);\n    \n    return hsv2rgb(hsv);\n  }\n  \n  // Apply color temperature\n  vec3 applyTemperature(vec3 color, vec3 temp) {\n    return color * temp;\n  }\n  \n  // Apply lift, gamma, gain\n  vec3 applyLGG(vec3 color, vec3 lift, vec3 gamma, vec3 gain) {\n    // Lift (shadows)\n    vec3 lifted = color + lift;\n    \n    // Gamma (midtones)\n    vec3 powered = pow(lifted, vec3(1.0 / max(gamma, 0.0001)));\n    \n    // Gain (highlights)\n    vec3 gained = powered * gain;\n    \n    return clamp(gained, 0.0, 1.0);\n  }\n  \n  // ACES tone mapping\n  vec3 acesToneMap(vec3 color) {\n    const float a = 2.51;\n    const float b = 0.03;\n    const float c = 2.43;\n    const float d = 0.59;\n    const float e = 0.14;\n    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);\n  }\n  \n  // Reinhard tone mapping\n  vec3 reinhardToneMap(vec3 color) {\n    return color / (1.0 + color);\n  }\n  \n  // Filmic tone mapping\n  vec3 filmicToneMap(vec3 color) {\n    vec3 x = max(vec3(0.0), color - 0.004);\n    vec3 ret = (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);\n    return ret * ret;\n  }\n  \n  // Apply vignette\n  vec3 applyVignette(vec3 color, vec2 uv, float intensity) {\n    vec2 center = vec2(0.5, 0.5);\n    float dist = distance(uv, center);\n    float vignetteFactor = 1.0 - (dist * intensity * 2.0);\n    return color * vignetteFactor;\n  }\n  \n  void main() {\n    vec4 baseColor = texture2D(inputBuffer, vUv);\n    vec3 color = baseColor.rgb;\n    \n    // Apply exposure\n    color *= pow(2.0, exposure);\n    \n    // Apply contrast\n    color = applyContrast(color, contrast);\n    \n    // Apply saturation and vibrance\n    color = applySaturation(color, saturation, vibrance);\n    \n    // Apply color temperature and tint\n    color = applyTemperature(color, temperature);\n    color.r += tint * 0.1;\n    color.g -= tint * 0.05;\n    color.b += tint * 0.1;\n    \n    // Apply lift, gamma, gain\n    color = applyLGG(color, lift, gamma, gain);\n    \n    // Apply tone mapping\n    #if defined(TONE_MAPPING_ACES)\n      color = acesToneMap(color);\n    #elif defined(TONE_MAPPING_REINHARD)\n      color = reinhardToneMap(color);\n    #elif defined(TONE_MAPPING_FILMIC)\n      color = filmicToneMap(color);\n    #endif\n    \n    // Apply vignette\n    if (vignette > 0.0) {\n      color = applyVignette(color, vUv, vignette);\n    }\n    \n    gl_FragColor = vec4(color, baseColor.a);\n  }\n";
/**
 * Create a cinematic color grading preset
 */
export declare function createCinematicGrading(): ColorGradingProps;
/**
 * Create a natural/realistic color grading preset
 */
export declare function createNaturalGrading(): ColorGradingProps;
/**
 * Create a warm/sunny color grading preset
 */
export declare function createWarmGrading(): ColorGradingProps;
/**
 * Create a cool/moody color grading preset
 */
export declare function createCoolGrading(): ColorGradingProps;
export default ColorGrading;
//# sourceMappingURL=ColorGrading.d.ts.map