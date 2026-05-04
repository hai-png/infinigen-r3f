/**
 * Film Grain Post-Processing Effect
 *
 * Enhanced with temporal coherence, grain size control, grain intensity,
 * color grain channels, response curve simulation, and frame blending.
 */

import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface FilmGrainProps {
  /** Overall grain intensity (0-1, default 0.2) */
  intensity?: number;
  /** Grain size: fine (0.5) to coarse (3.0), default 1.0 */
  size?: number;
  /** Enable/disable */
  enabled?: boolean;
  /** Color grain: separate R/G/B noise channels for realistic film look */
  colorGrain?: boolean;
  /** Color grain intensity multiplier (0-1) */
  colorGrainIntensity?: number;
  /** Temporal smoothing: how much to blend with previous frame (0-1, higher = smoother) */
  temporalSmoothing?: number;
  /** Response curve: simulate real film stock response */
  responseCurve?: 'linear' | 'filmic' | 'agfa' | 'kodak' | 'ilford';
  /** Frame blending: smooth transition between grain samples */
  frameBlending?: boolean;
  /** Seed for deterministic grain pattern */
  seed?: number;
}

const DEFAULT_PROPS: Required<FilmGrainProps> = {
  intensity: 0.2,
  size: 1.0,
  enabled: true,
  colorGrain: false,
  colorGrainIntensity: 0.3,
  temporalSmoothing: 0.5,
  responseCurve: 'linear',
  frameBlending: true,
  seed: 0,
};

// ---------------------------------------------------------------------------
// Fragment Shader
// ---------------------------------------------------------------------------

export const filmGrainFragmentShader = /* glsl */ `
  uniform float intensity;
  uniform float size;
  uniform float time;
  uniform float colorGrainEnabled;
  uniform float colorGrainIntensity;
  uniform float temporalSmoothing;
  uniform float responseCurveMode;
  uniform float frameBlendingEnabled;
  uniform float seed;

  varying vec2 vUv;
  uniform sampler2D inputBuffer;

  // --- Hash-based pseudo-random (deterministic, frame-coherent) ---
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // --- 2D Value noise (smooth, tileable) ---
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // --- Temporal hash: evolves smoothly between frames ---
  float temporalHash(vec2 p, float t) {
    // Quantize time to reduce temporal aliasing
    float t0 = floor(t);
    float t1 = t0 + 1.0;
    float blend = fract(t);

    float n0 = valueNoise(p + t0 * 0.73 + seed * 0.01);
    float n1 = valueNoise(p + t1 * 0.73 + seed * 0.01);

    // Smooth interpolation between grain frames
    if (frameBlendingEnabled > 0.5) {
      blend = blend * blend * (3.0 - 2.0 * blend); // smoothstep
    }

    return mix(n0, n1, blend);
  }

  // --- Film response curves ---
  // Simulate how real film stock responds to light:
  // Grain is more visible in mid-tones and less in shadows/highlights
  float applyResponseCurve(float luminance) {
    if (responseCurveMode < 0.5) {
      // Linear: grain affects all luminance equally
      return 1.0;
    } else if (responseCurveMode < 1.5) {
      // Filmic: grain peaks in mid-tones
      return 1.0 - 2.0 * abs(luminance - 0.5);
    } else if (responseCurveMode < 2.5) {
      // Agfa: grain more visible in shadows
      return mix(1.2, 0.4, luminance);
    } else if (responseCurveMode < 3.5) {
      // Kodak: grain visible across range, slight mid-tone peak
      return 0.7 + 0.3 * (1.0 - 2.0 * abs(luminance - 0.5));
    } else {
      // Ilford (B&W): strong grain in shadows, clean highlights
      return mix(1.5, 0.3, luminance * luminance);
    }
  }

  void main() {
    vec4 color = texture2D(inputBuffer, vUv);

    // Scale UV for grain size
    vec2 grainUV = vUv * size * 512.0;

    // Compute luminance for response curve
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    // Apply response curve to modulate grain visibility
    float responseMod = applyResponseCurve(luminance);

    // --- Monochrome grain ---
    float noise = temporalHash(grainUV, time * 24.0) - 0.5; // [-0.5, 0.5]

    if (colorGrainEnabled < 0.5) {
      // Simple monochrome grain
      color.rgb += noise * intensity * responseMod;
    } else {
      // --- Color grain: separate R/G/B channels ---
      // Each channel gets slightly different noise for realistic film look
      float noiseR = temporalHash(grainUV + vec2(1.7, 9.2), time * 24.0 + 0.13) - 0.5;
      float noiseG = temporalHash(grainUV + vec2(8.3, 2.8), time * 24.0 + 0.37) - 0.5;
      float noiseB = temporalHash(grainUV + vec2(4.1, 6.5), time * 24.0 + 0.71) - 0.5;

      // Mix monochrome and color grain
      float monoGrain = noise * intensity * responseMod;
      float colorGrainR = noiseR * intensity * responseMod * colorGrainIntensity;
      float colorGrainG = noiseG * intensity * responseMod * colorGrainIntensity;
      float colorGrainB = noiseB * intensity * responseMod * colorGrainIntensity;

      color.r += monoGrain + colorGrainR;
      color.g += monoGrain + colorGrainG;
      color.b += monoGrain + colorGrainB;
    }

    gl_FragColor = color;
  }
`;

// ---------------------------------------------------------------------------
// Effect Class
// ---------------------------------------------------------------------------

export class FilmGrain extends Effect {
  private uniforms: Record<string, THREE.Uniform>;
  private time: number = 0;
  private props: Required<FilmGrainProps>;

  constructor(props: FilmGrainProps = {}) {
    super('FilmGrain');

    this.props = { ...DEFAULT_PROPS, ...props };

    this.uniforms = {
      intensity: new THREE.Uniform(this.props.intensity),
      size: new THREE.Uniform(this.props.size),
      time: new THREE.Uniform(0),
      colorGrainEnabled: new THREE.Uniform(this.props.colorGrain ? 1.0 : 0.0),
      colorGrainIntensity: new THREE.Uniform(this.props.colorGrainIntensity),
      temporalSmoothing: new THREE.Uniform(this.props.temporalSmoothing),
      responseCurveMode: new THREE.Uniform(this.responseCurveToMode(this.props.responseCurve)),
      frameBlendingEnabled: new THREE.Uniform(this.props.frameBlending ? 1.0 : 0.0),
      seed: new THREE.Uniform(this.props.seed),
    };

    this.enabled = this.props.enabled;
  }

  // --- Response Curve Mapping ---

  private responseCurveToMode(curve: string): number {
    switch (curve) {
      case 'linear': return 0;
      case 'filmic': return 1;
      case 'agfa': return 2;
      case 'kodak': return 3;
      case 'ilford': return 4;
      default: return 0;
    }
  }

  // --- Setters ---

  setIntensity(value: number): void {
    this.uniforms.intensity.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setSize(value: number): void {
    this.uniforms.size.value = Math.max(0.1, value);
  }

  setColorGrain(enabled: boolean, intensity?: number): void {
    this.uniforms.colorGrainEnabled.value = enabled ? 1.0 : 0.0;
    if (intensity !== undefined) {
      this.uniforms.colorGrainIntensity.value = THREE.MathUtils.clamp(intensity, 0, 1);
    }
  }

  setTemporalSmoothing(value: number): void {
    this.uniforms.temporalSmoothing.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setResponseCurve(curve: 'linear' | 'filmic' | 'agfa' | 'kodak' | 'ilford'): void {
    this.uniforms.responseCurveMode.value = this.responseCurveToMode(curve);
    this.props.responseCurve = curve;
  }

  setFrameBlending(enabled: boolean): void {
    this.uniforms.frameBlendingEnabled.value = enabled ? 1.0 : 0.0;
  }

  setSeed(value: number): void {
    this.uniforms.seed.value = value;
    this.props.seed = value;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // --- Update ---

  update(deltaTime: number): void {
    this.time += deltaTime;
    this.uniforms.time.value = this.time;
  }

  // --- Getters ---

  getParams(): FilmGrainProps {
    return {
      intensity: this.uniforms.intensity.value,
      size: this.uniforms.size.value,
      enabled: this.enabled,
      colorGrain: this.uniforms.colorGrainEnabled.value > 0.5,
      colorGrainIntensity: this.uniforms.colorGrainIntensity.value,
      temporalSmoothing: this.uniforms.temporalSmoothing.value,
      responseCurve: this.props.responseCurve,
      frameBlending: this.uniforms.frameBlendingEnabled.value > 0.5,
      seed: this.props.seed,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create subtle film grain for a natural look.
 */
export function createSubtleGrain(): FilmGrain {
  return new FilmGrain({
    intensity: 0.08,
    size: 0.8,
    colorGrain: false,
    responseCurve: 'filmic',
    frameBlending: true,
    temporalSmoothing: 0.7,
  });
}

/**
 * Create vintage film grain (heavier, with color grain and Agfa-like response).
 */
export function createVintageGrain(): FilmGrain {
  return new FilmGrain({
    intensity: 0.35,
    size: 1.5,
    colorGrain: true,
    colorGrainIntensity: 0.4,
    responseCurve: 'agfa',
    frameBlending: true,
    temporalSmoothing: 0.5,
  });
}

/**
 * Create B&W film grain with Ilford-style response.
 */
export function createBWGrain(): FilmGrain {
  return new FilmGrain({
    intensity: 0.4,
    size: 1.2,
    colorGrain: false,
    responseCurve: 'ilford',
    frameBlending: true,
    temporalSmoothing: 0.4,
  });
}

/**
 * Create cinematic film grain (subtle, Kodak-like response).
 */
export function createCinematicGrain(): FilmGrain {
  return new FilmGrain({
    intensity: 0.12,
    size: 1.0,
    colorGrain: true,
    colorGrainIntensity: 0.15,
    responseCurve: 'kodak',
    frameBlending: true,
    temporalSmoothing: 0.6,
  });
}

export default FilmGrain;
