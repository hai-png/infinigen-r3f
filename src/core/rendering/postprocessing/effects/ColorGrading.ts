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

const DEFAULT_PROPS: Required<ColorGradingProps> = {
  exposure: 0,
  contrast: 1.0,
  saturation: 1.0,
  vibrance: 0,
  temperature: 6500,
  tint: 0,
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  enabled: true,
  toneMapping: 'aces',
  filmEmulation: 0,
  vignette: 0,
};

export class ColorGrading extends Effect {
  private uniforms: Record<string, THREE.Uniform>;
  private props: Required<ColorGradingProps>;
  private lutTexture: THREE.DataTexture | null = null;

  constructor(props: ColorGradingProps = {}) {
    super('ColorGrading');
    
    this.props = { ...DEFAULT_PROPS, ...props };
    
    this.uniforms = {
      exposure: new THREE.Uniform(this.props.exposure),
      contrast: new THREE.Uniform(this.props.contrast),
      saturation: new THREE.Uniform(this.props.saturation),
      vibrance: new THREE.Uniform(this.props.vibrance),
      temperature: new THREE.Uniform(this.temperatureToRGB(this.props.temperature)),
      tint: new THREE.Uniform(this.props.tint),
      lift: new THREE.Uniform(new THREE.Vector3(...this.props.lift)),
      gamma: new THREE.Uniform(new THREE.Vector3(...this.props.gamma)),
      gain: new THREE.Uniform(new THREE.Vector3(...this.props.gain)),
      filmEmulation: new THREE.Uniform(this.props.filmEmulation),
      vignette: new THREE.Uniform(this.props.vignette),
    };
  }

  /**
   * Convert color temperature (Kelvin) to RGB
   */
  private temperatureToRGB(kelvin: number): THREE.Color {
    const temp = kelvin / 100;
    let r, g, b;

    if (temp <= 66) {
      r = 255;
      g = Math.max(0, Math.min(255, 99.4708025861 * Math.log(temp) - 161.1195681661));
    } else {
      r = Math.max(0, Math.min(255, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
      g = Math.max(0, Math.min(255, 288.1221695283 * Math.pow(temp - 50, -0.0755148492)));
    }

    if (temp >= 66) {
      b = 255;
    } else if (temp <= 19) {
      b = 0;
    } else {
      b = Math.max(0, Math.min(255, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
    }

    return new THREE.Color(r / 255, g / 255, b / 255);
  }

  /**
   * Update exposure
   */
  setExposure(value: number): void {
    this.uniforms.exposure.value = value;
  }

  /**
   * Update contrast
   */
  setContrast(value: number): void {
    this.uniforms.contrast.value = Math.max(0, value);
  }

  /**
   * Update saturation
   */
  setSaturation(value: number): void {
    this.uniforms.saturation.value = Math.max(0, value);
  }

  /**
   * Update color temperature
   */
  setTemperature(kelvin: number): void {
    this.uniforms.temperature.value = this.temperatureToRGB(kelvin);
  }

  /**
   * Update tint
   */
  setTint(value: number): void {
    this.uniforms.tint.value = THREE.MathUtils.clamp(value, -1, 1);
  }

  /**
   * Set lift (shadow color)
   */
  setLift(rgb: [number, number, number]): void {
    this.uniforms.lift.value.set(rgb[0], rgb[1], rgb[2]);
  }

  /**
   * Set gamma (midtone color)
   */
  setGamma(rgb: [number, number, number]): void {
    this.uniforms.gamma.value.set(rgb[0], rgb[1], rgb[2]);
  }

  /**
   * Set gain (highlight color)
   */
  setGain(rgb: [number, number, number]): void {
    this.uniforms.gain.value.set(rgb[0], rgb[1], rgb[2]);
  }

  /**
   * Load a custom LUT for film emulation
   */
  loadLUT(texture: THREE.DataTexture): void {
    this.lutTexture = texture;
  }

  /**
   * Get current grading parameters
   */
  getParams(): ColorGradingProps {
    return {
      exposure: this.uniforms.exposure.value,
      contrast: this.uniforms.contrast.value,
      saturation: this.uniforms.saturation.value,
      vibrance: this.uniforms.vibrance.value,
      temperature: this.props.temperature,
      tint: this.uniforms.tint.value,
      lift: [
        this.uniforms.lift.value.x,
        this.uniforms.lift.value.y,
        this.uniforms.lift.value.z,
      ],
      gamma: [
        this.uniforms.gamma.value.x,
        this.uniforms.gamma.value.y,
        this.uniforms.gamma.value.z,
      ],
      gain: [
        this.uniforms.gain.value.x,
        this.uniforms.gain.value.y,
        this.uniforms.gain.value.z,
      ],
      enabled: this.enabled,
      toneMapping: this.props.toneMapping,
      filmEmulation: this.uniforms.filmEmulation.value,
      vignette: this.uniforms.vignette.value,
    };
  }
}

/**
 * GLSL fragment shader for color grading
 */
export const colorGradingFragmentShader = `
  uniform float exposure;
  uniform float contrast;
  uniform float saturation;
  uniform float vibrance;
  uniform vec3 temperature;
  uniform float tint;
  uniform vec3 lift;
  uniform vec3 gamma;
  uniform vec3 gain;
  uniform float filmEmulation;
  uniform float vignette;
  
  varying vec2 vUv;
  uniform sampler2D inputBuffer;
  
  // Convert RGB to HSV
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }
  
  // Convert HSV to RGB
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
  
  // Apply contrast
  vec3 applyContrast(vec3 color, float contrast) {
    return (color - 0.5) * contrast + 0.5;
  }
  
  // Apply saturation with vibrance protection
  vec3 applySaturation(vec3 color, float saturation, float vibrance) {
    vec3 hsv = rgb2hsv(color);
    
    // Vibrance protects low-saturation colors (skin tones)
    float satAdjust = saturation + vibrance * (1.0 - hsv.y);
    hsv.y *= satAdjust;
    hsv.y = clamp(hsv.y, 0.0, 1.0);
    
    return hsv2rgb(hsv);
  }
  
  // Apply color temperature
  vec3 applyTemperature(vec3 color, vec3 temp) {
    return color * temp;
  }
  
  // Apply lift, gamma, gain
  vec3 applyLGG(vec3 color, vec3 lift, vec3 gamma, vec3 gain) {
    // Lift (shadows)
    vec3 lifted = color + lift;
    
    // Gamma (midtones)
    vec3 powered = pow(lifted, vec3(1.0 / max(gamma, 0.0001)));
    
    // Gain (highlights)
    vec3 gained = powered * gain;
    
    return clamp(gained, 0.0, 1.0);
  }
  
  // ACES tone mapping
  vec3 acesToneMap(vec3 color) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
  }
  
  // Reinhard tone mapping
  vec3 reinhardToneMap(vec3 color) {
    return color / (1.0 + color);
  }
  
  // Filmic tone mapping
  vec3 filmicToneMap(vec3 color) {
    vec3 x = max(vec3(0.0), color - 0.004);
    vec3 ret = (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
    return ret * ret;
  }
  
  // Apply vignette
  vec3 applyVignette(vec3 color, vec2 uv, float intensity) {
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(uv, center);
    float vignetteFactor = 1.0 - (dist * intensity * 2.0);
    return color * vignetteFactor;
  }
  
  void main() {
    vec4 baseColor = texture2D(inputBuffer, vUv);
    vec3 color = baseColor.rgb;
    
    // Apply exposure
    color *= pow(2.0, exposure);
    
    // Apply contrast
    color = applyContrast(color, contrast);
    
    // Apply saturation and vibrance
    color = applySaturation(color, saturation, vibrance);
    
    // Apply color temperature and tint
    color = applyTemperature(color, temperature);
    color.r += tint * 0.1;
    color.g -= tint * 0.05;
    color.b += tint * 0.1;
    
    // Apply lift, gamma, gain
    color = applyLGG(color, lift, gamma, gain);
    
    // Apply tone mapping
    #if defined(TONE_MAPPING_ACES)
      color = acesToneMap(color);
    #elif defined(TONE_MAPPING_REINHARD)
      color = reinhardToneMap(color);
    #elif defined(TONE_MAPPING_FILMIC)
      color = filmicToneMap(color);
    #endif
    
    // Apply vignette
    if (vignette > 0.0) {
      color = applyVignette(color, vUv, vignette);
    }
    
    gl_FragColor = vec4(color, baseColor.a);
  }
`;

/**
 * Create a cinematic color grading preset
 */
export function createCinematicGrading(): ColorGradingProps {
  return {
    exposure: 0.2,
    contrast: 1.15,
    saturation: 1.1,
    vibrance: 0.2,
    temperature: 6000,
    tint: 0.1,
    lift: [0.02, 0.02, 0.03],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.02, 1.0, 0.98],
    toneMapping: 'aces',
    filmEmulation: 0.3,
    vignette: 0.3,
  };
}

/**
 * Create a natural/realistic color grading preset
 */
export function createNaturalGrading(): ColorGradingProps {
  return {
    exposure: 0,
    contrast: 1.0,
    saturation: 1.0,
    vibrance: 0.1,
    temperature: 6500,
    tint: 0,
    lift: [0, 0, 0],
    gamma: [1, 1, 1],
    gain: [1, 1, 1],
    toneMapping: 'aces',
    filmEmulation: 0,
    vignette: 0.1,
  };
}

/**
 * Create a warm/sunny color grading preset
 */
export function createWarmGrading(): ColorGradingProps {
  return {
    exposure: 0.3,
    contrast: 1.1,
    saturation: 1.2,
    vibrance: 0.15,
    temperature: 5500,
    tint: 0.05,
    lift: [0.03, 0.02, 0.01],
    gamma: [1.02, 1.0, 0.98],
    gain: [1.05, 1.02, 0.95],
    toneMapping: 'filmic',
    filmEmulation: 0.2,
    vignette: 0.2,
  };
}

/**
 * Create a cool/moody color grading preset
 */
export function createCoolGrading(): ColorGradingProps {
  return {
    exposure: -0.2,
    contrast: 1.2,
    saturation: 0.9,
    vibrance: 0,
    temperature: 7500,
    tint: -0.1,
    lift: [0.02, 0.025, 0.03],
    gamma: [0.98, 0.99, 1.02],
    gain: [0.95, 0.98, 1.05],
    toneMapping: 'aces',
    filmEmulation: 0.4,
    vignette: 0.4,
  };
}

export default ColorGrading;
