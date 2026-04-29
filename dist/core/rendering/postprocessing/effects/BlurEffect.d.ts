import { Effect } from '@react-three/postprocessing';
/**
 * BlurEffect - Gaussian blur post-processing effect
 *
 * Provides configurable blur for depth of field, motion blur base, or artistic effects.
 * Supports both uniform and directional blur.
 *
 * @example
 * ```tsx
 * <EffectChain>
 *   <BlurEffect
 *     radius={2.0}
 *     samples={10}
 *     direction={[0, 1]} // Vertical blur
 *   />
 * </EffectChain>
 * ```
 */
export interface BlurEffectProps {
    /** Blur radius/strength. Default: 1.0 */
    radius?: number;
    /** Number of blur samples (higher = smoother but slower). Default: 8 */
    samples?: number;
    /** Blur direction [x, y]. [0, 0] = uniform blur. Default: [0, 0] */
    direction?: [number, number];
    /** Enable/disable effect */
    enabled?: boolean;
    /** Blur type */
    blurType?: 'gaussian' | 'box' | 'motion';
}
export declare class BlurEffect extends Effect {
    private uniforms;
    private props;
    constructor(props?: BlurEffectProps);
    /**
     * Update blur radius
     */
    setRadius(value: number): void;
    /**
     * Update number of samples
     */
    setSamples(value: number): void;
    /**
     * Set blur direction
     */
    setDirection(x: number, y: number): void;
    /**
     * Set uniform blur (no direction)
     */
    setUniformBlur(): void;
    /**
     * Set horizontal blur
     */
    setHorizontalBlur(): void;
    /**
     * Set vertical blur
     */
    setVerticalBlur(): void;
    /**
     * Get current blur parameters
     */
    getParams(): BlurEffectProps;
}
/**
 * GLSL fragment shader for gaussian blur
 */
export declare const blurFragmentShader = "\n  uniform float radius;\n  uniform float samples;\n  uniform vec2 direction;\n  \n  varying vec2 vUv;\n  uniform sampler2D inputBuffer;\n  \n  // Gaussian weight function\n  float gaussian(float x, float sigma) {\n    return exp(-(x * x) / (2.0 * sigma * sigma)) / (sqrt(2.0 * 3.14159) * sigma);\n  }\n  \n  void main() {\n    vec4 baseColor = texture2D(inputBuffer, vUv);\n    \n    // If no direction specified, use uniform blur\n    vec2 dir = normalize(direction);\n    if (length(direction) < 0.0001) {\n      // Uniform blur - sample in circular pattern\n      vec3 color = vec3(0.0);\n      float totalWeight = 0.0;\n      float sigma = radius * 0.5;\n      \n      int sampleCount = int(samples);\n      for (int i = -4; i <= 4; i++) {\n        for (int j = -4; j <= 4; j++) {\n          if (i == 0 && j == 0) continue;\n          \n          float dist = sqrt(float(i * i + j * j));\n          if (dist > samples) continue;\n          \n          float weight = gaussian(dist / samples, sigma);\n          vec2 offset = vec2(float(i), float(j)) / resolution * radius;\n          color += texture2D(inputBuffer, vUv + offset).rgb * weight;\n          totalWeight += weight;\n        }\n      }\n      \n      // Add center pixel\n      color += baseColor.rgb * gaussian(0.0, sigma);\n      totalWeight += gaussian(0.0, sigma);\n      \n      gl_FragColor = vec4(color / totalWeight, baseColor.a);\n    } else {\n      // Directional blur\n      vec3 color = vec3(0.0);\n      float totalWeight = 0.0;\n      float sigma = radius * 0.5;\n      \n      int sampleCount = int(samples);\n      for (int i = -4; i <= 4; i++) {\n        float weight = gaussian(float(i) / samples, sigma);\n        vec2 offset = dir * float(i) / resolution * radius;\n        color += texture2D(inputBuffer, vUv + offset).rgb * weight;\n        totalWeight += weight;\n      }\n      \n      gl_FragColor = vec4(color / totalWeight, baseColor.a);\n    }\n  }\n";
/**
 * Create a subtle blur preset
 */
export declare function createSubtleBlur(): BlurEffectProps;
/**
 * Create a strong blur preset (for depth of field backgrounds)
 */
export declare function createStrongBlur(): BlurEffectProps;
/**
 * Create a motion blur preset (horizontal)
 */
export declare function createMotionBlur(speed?: number): BlurEffectProps;
/**
 * Create a tilt-shift style blur (vertical)
 */
export declare function createTiltShiftBlur(): BlurEffectProps;
export default BlurEffect;
//# sourceMappingURL=BlurEffect.d.ts.map