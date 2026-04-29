import { Effect } from '@react-three/postprocessing';
/**
 * BloomEffect - High-quality bloom/glow post-processing effect
 *
 * Implements multi-pass bloom with configurable threshold, intensity, and blur radius.
 * Based on the original Infinigen bloom implementation but adapted for Three.js/R3F.
 *
 * @example
 * ```tsx
 * <EffectChain>
 *   <BloomEffect
 *     threshold={0.8}
 *     intensity={1.5}
 *     radius={0.5}
 *     resolution={256}
 *   />
 * </EffectChain>
 * ```
 */
export interface BloomEffectProps {
    /** Luminance threshold for bloom (0-1). Higher values = only brightest areas bloom */
    threshold?: number;
    /** Bloom intensity/strength multiplier */
    intensity?: number;
    /** Blur radius for bloom spread (0-1) */
    radius?: number;
    /** Resolution of bloom buffer (higher = better quality, more performance) */
    resolution?: number;
    /** Number of blur iterations (more = smoother but slower) */
    iterations?: number;
    /** Enable/disable effect */
    enabled?: boolean;
    /** Blend mode: 'additive' or 'screen' */
    blendMode?: 'additive' | 'screen';
    /** Mipmapping levels for blur pyramid */
    mipmapLevels?: number;
}
export declare class BloomEffect extends Effect {
    private uniforms;
    private props;
    constructor(props?: BloomEffectProps);
    /**
     * Update bloom threshold
     */
    setThreshold(value: number): void;
    /**
     * Update bloom intensity
     */
    setIntensity(value: number): void;
    /**
     * Update blur radius
     */
    setRadius(value: number): void;
    /**
     * Enable or disable the effect
     */
    setEnabled(enabled: boolean): void;
    /**
     * Get current bloom parameters
     */
    getParams(): BloomEffectProps;
}
/**
 * GLSL fragment shader for bloom effect
 * Implements threshold extraction and gaussian blur pyramid
 */
export declare const bloomFragmentShader = "\n  uniform float threshold;\n  uniform float intensity;\n  uniform float radius;\n  uniform float resolution;\n  uniform int iterations;\n  uniform int mipmapLevels;\n  \n  varying vec2 vUv;\n  uniform sampler2D inputBuffer;\n  \n  // Extract bright areas above threshold\n  vec3 extractBright(vec3 color) {\n    float luminance = dot(color, vec3(0.299, 0.587, 0.114));\n    float brightness = max(0.0, luminance - threshold);\n    float scale = brightness / max(luminance, 0.0001);\n    return color * scale * intensity;\n  }\n  \n  // Gaussian blur kernel\n  float gaussian(float x, float sigma) {\n    return exp(-(x * x) / (2.0 * sigma * sigma)) / (sqrt(2.0 * 3.14159) * sigma);\n  }\n  \n  // Apply horizontal blur pass\n  vec3 blurHorizontal(sampler2D tex, vec2 uv, float sigma) {\n    vec3 color = vec3(0.0);\n    float totalWeight = 0.0;\n    int kernelSize = 5;\n    \n    for (int i = -2; i <= 2; i++) {\n      float weight = gaussian(float(i), sigma);\n      vec2 offset = vec2(float(i) / resolution, 0.0);\n      color += texture2D(tex, uv + offset).rgb * weight;\n      totalWeight += weight;\n    }\n    \n    return color / totalWeight;\n  }\n  \n  // Apply vertical blur pass\n  vec3 blurVertical(sampler2D tex, vec2 uv, float sigma) {\n    vec3 color = vec3(0.0);\n    float totalWeight = 0.0;\n    int kernelSize = 5;\n    \n    for (int i = -2; i <= 2; i++) {\n      float weight = gaussian(float(i), sigma);\n      vec2 offset = vec2(0.0, float(i) / resolution);\n      color += texture2D(tex, uv + offset).rgb * weight;\n      totalWeight += weight;\n    }\n    \n    return color / totalWeight;\n  }\n  \n  void main() {\n    vec4 baseColor = texture2D(inputBuffer, vUv);\n    \n    // Extract bright areas\n    vec3 bright = extractBright(baseColor.rgb);\n    \n    // Apply multi-pass gaussian blur\n    float sigma = radius * 2.0;\n    vec3 blurred = bright;\n    \n    for (int i = 0; i < iterations; i++) {\n      blurred = blurHorizontal(texture2D(inputBuffer, vUv), vUv, sigma);\n      blurred = blurVertical(texture2D(inputBuffer, vUv), vUv, sigma);\n      sigma *= 0.8; // Reduce sigma for each iteration\n    }\n    \n    // Add bloom to original color\n    vec3 finalColor = baseColor.rgb + blurred;\n    \n    gl_FragColor = vec4(finalColor, baseColor.a);\n  }\n";
/**
 * Create a bloom effect preset for cinematic looks
 */
export declare function createCinematicBloom(): BloomEffectProps;
/**
 * Create a bloom effect preset for subtle, realistic glow
 */
export declare function createRealisticBloom(): BloomEffectProps;
/**
 * Create a bloom effect preset for stylized/dreamy looks
 */
export declare function createDreamyBloom(): BloomEffectProps;
export default BloomEffect;
//# sourceMappingURL=BloomEffect.d.ts.map