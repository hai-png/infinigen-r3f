import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';

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

const DEFAULT_PROPS: Required<BloomEffectProps> = {
  threshold: 0.8,
  intensity: 1.5,
  radius: 0.5,
  resolution: 256,
  iterations: 6,
  enabled: true,
  blendMode: 'additive',
  mipmapLevels: 4,
};

export class BloomEffect extends Effect {
  private uniforms: Record<string, THREE.Uniform>;
  private props: Required<BloomEffectProps>;

  constructor(props: BloomEffectProps = {}) {
    super('BloomEffect');
    
    this.props = { ...DEFAULT_PROPS, ...props };
    
    this.uniforms = {
      threshold: new THREE.Uniform(this.props.threshold),
      intensity: new THREE.Uniform(this.props.intensity),
      radius: new THREE.Uniform(this.props.radius),
      resolution: new THREE.Uniform(this.props.resolution),
      iterations: new THREE.Uniform(this.props.iterations),
      mipmapLevels: new THREE.Uniform(this.props.mipmapLevels),
    };
  }

  /**
   * Update bloom threshold
   */
  setThreshold(value: number): void {
    this.uniforms.threshold.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  /**
   * Update bloom intensity
   */
  setIntensity(value: number): void {
    this.uniforms.intensity.value = Math.max(0, value);
  }

  /**
   * Update blur radius
   */
  setRadius(value: number): void {
    this.uniforms.radius.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  /**
   * Enable or disable the effect
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get current bloom parameters
   */
  getParams(): BloomEffectProps {
    return {
      threshold: this.uniforms.threshold.value,
      intensity: this.uniforms.intensity.value,
      radius: this.uniforms.radius.value,
      resolution: this.uniforms.resolution.value,
      iterations: this.uniforms.iterations.value,
      mipmapLevels: this.uniforms.mipmapLevels.value,
      enabled: this.enabled,
      blendMode: this.props.blendMode,
    };
  }
}

/**
 * GLSL fragment shader for bloom effect
 * Implements threshold extraction and gaussian blur pyramid
 */
export const bloomFragmentShader = `
  uniform float threshold;
  uniform float intensity;
  uniform float radius;
  uniform float resolution;
  uniform int iterations;
  uniform int mipmapLevels;
  
  varying vec2 vUv;
  uniform sampler2D inputBuffer;
  
  // Extract bright areas above threshold
  vec3 extractBright(vec3 color) {
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    float brightness = max(0.0, luminance - threshold);
    float scale = brightness / max(luminance, 0.0001);
    return color * scale * intensity;
  }
  
  // Gaussian blur kernel
  float gaussian(float x, float sigma) {
    return exp(-(x * x) / (2.0 * sigma * sigma)) / (sqrt(2.0 * 3.14159) * sigma);
  }
  
  // Apply horizontal blur pass
  vec3 blurHorizontal(sampler2D tex, vec2 uv, float sigma) {
    vec3 color = vec3(0.0);
    float totalWeight = 0.0;
    int kernelSize = 5;
    
    for (int i = -2; i <= 2; i++) {
      float weight = gaussian(float(i), sigma);
      vec2 offset = vec2(float(i) / resolution, 0.0);
      color += texture2D(tex, uv + offset).rgb * weight;
      totalWeight += weight;
    }
    
    return color / totalWeight;
  }
  
  // Apply vertical blur pass
  vec3 blurVertical(sampler2D tex, vec2 uv, float sigma) {
    vec3 color = vec3(0.0);
    float totalWeight = 0.0;
    int kernelSize = 5;
    
    for (int i = -2; i <= 2; i++) {
      float weight = gaussian(float(i), sigma);
      vec2 offset = vec2(0.0, float(i) / resolution);
      color += texture2D(tex, uv + offset).rgb * weight;
      totalWeight += weight;
    }
    
    return color / totalWeight;
  }
  
  void main() {
    vec4 baseColor = texture2D(inputBuffer, vUv);
    
    // Extract bright areas
    vec3 bright = extractBright(baseColor.rgb);
    
    // Apply multi-pass gaussian blur
    float sigma = radius * 2.0;
    vec3 blurred = bright;
    
    for (int i = 0; i < iterations; i++) {
      blurred = blurHorizontal(texture2D(inputBuffer, vUv), vUv, sigma);
      blurred = blurVertical(texture2D(inputBuffer, vUv), vUv, sigma);
      sigma *= 0.8; // Reduce sigma for each iteration
    }
    
    // Add bloom to original color
    vec3 finalColor = baseColor.rgb + blurred;
    
    gl_FragColor = vec4(finalColor, baseColor.a);
  }
`;

/**
 * Create a bloom effect preset for cinematic looks
 */
export function createCinematicBloom(): BloomEffectProps {
  return {
    threshold: 0.7,
    intensity: 2.0,
    radius: 0.7,
    resolution: 512,
    iterations: 8,
    mipmapLevels: 5,
    blendMode: 'additive',
  };
}

/**
 * Create a bloom effect preset for subtle, realistic glow
 */
export function createRealisticBloom(): BloomEffectProps {
  return {
    threshold: 0.85,
    intensity: 1.2,
    radius: 0.3,
    resolution: 256,
    iterations: 4,
    mipmapLevels: 3,
    blendMode: 'screen',
  };
}

/**
 * Create a bloom effect preset for stylized/dreamy looks
 */
export function createDreamyBloom(): BloomEffectProps {
  return {
    threshold: 0.6,
    intensity: 2.5,
    radius: 0.9,
    resolution: 512,
    iterations: 10,
    mipmapLevels: 6,
    blendMode: 'additive',
  };
}

export default BloomEffect;
