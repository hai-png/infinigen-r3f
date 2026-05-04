/**
 * Chromatic Aberration Post-Processing Effect
 *
 * Enhanced with radial falloff, lens modeling, RGB channel separation,
 * anamorphic option, center weight, and EffectComposer integration.
 */

import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ChromaticAberrationProps {
  /** Overall aberration intensity (0-0.01, default 0.002) */
  intensity?: number;
  /** Radial falloff: how quickly aberration increases from center (0 = none, 1 = strong) */
  radialFalloff?: number;
  /** Center weight: reduce aberration at image center (0 = no reduction, 1 = full) */
  centerWeight?: number;
  /** Anamorphic stretch: horizontal aberration multiplier for cinematic look */
  anamorphicStretch?: number;
  /** Red channel offset multiplier */
  redOffset?: number;
  /** Green channel offset multiplier */
  greenOffset?: number;
  /** Blue channel offset multiplier */
  blueOffset?: number;
  /** Lens model: simulate real lens chromatic aberration curves */
  lensModel?: 'simple' | 'achromatic' | 'apochromatic';
  /** Enable/disable */
  enabled?: boolean;
  /** Aspect ratio for elliptical falloff */
  aspectRatio?: number;
}

const DEFAULT_PROPS: Required<ChromaticAberrationProps> = {
  intensity: 0.002,
  radialFalloff: 1.0,
  centerWeight: 0.5,
  anamorphicStretch: 1.0,
  redOffset: 1.0,
  greenOffset: 0.0,
  blueOffset: 1.0,
  lensModel: 'simple',
  enabled: true,
  aspectRatio: 16 / 9,
};

// ---------------------------------------------------------------------------
// Fragment Shader
// ---------------------------------------------------------------------------

export const chromaticAberrationFragmentShader = /* glsl */ `
  uniform float intensity;
  uniform float radialFalloff;
  uniform float centerWeight;
  uniform float anamorphicStretch;
  uniform float redOffset;
  uniform float greenOffset;
  uniform float blueOffset;
  uniform float aspectRatio;

  varying vec2 vUv;
  uniform sampler2D inputBuffer;

  void main() {
    vec2 center = vec2(0.5, 0.5);

    // Direction from center with aspect-ratio correction for elliptical falloff
    vec2 aspectCorrection = vec2(1.0 / aspectRatio, 1.0);
    vec2 correctedUv = (vUv - center) * aspectCorrection;
    float distFromCenter = length(correctedUv);
    vec2 dir = normalize(vUv - center);

    // --- Radial falloff: aberration increases toward edges ---
    // Use a power curve to simulate lens-like falloff
    float radialFactor = pow(distFromCenter * 2.0, radialFalloff);

    // --- Center weight: reduce aberration at image center ---
    float centerReduction = mix(1.0, smoothstep(0.0, 0.4, distFromCenter), centerWeight);

    // --- Combined aberration strength ---
    float aberrationStrength = intensity * radialFactor * centerReduction;

    // --- Anamorphic stretch: apply more offset horizontally ---
    vec2 anamorphicDir = vec2(dir.x * anamorphicStretch, dir.y);
    float anamorphicLen = length(anamorphicDir);
    vec2 adjustedDir = anamorphicLen > 0.0 ? anamorphicDir / anamorphicLen : dir;

    // --- RGB channel separation with configurable offsets ---
    // Red shifts outward
    vec2 redShift = adjustedDir * aberrationStrength * redOffset;
    // Green stays at center (or slight offset for more subtle effect)
    vec2 greenShift = adjustedDir * aberrationStrength * greenOffset * 0.1;
    // Blue shifts inward (opposite direction)
    vec2 blueShift = -adjustedDir * aberrationStrength * blueOffset;

    // Sample each channel at its offset position
    float r = texture2D(inputBuffer, vUv + redShift).r;
    float g = texture2D(inputBuffer, vUv + greenShift).g;
    float b = texture2D(inputBuffer, vUv + blueShift).b;

    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Effect Class
// ---------------------------------------------------------------------------

export class ChromaticAberration extends Effect {
  private uniforms: Record<string, THREE.Uniform>;
  private props: Required<ChromaticAberrationProps>;

  constructor(props: ChromaticAberrationProps = {}) {
    super('ChromaticAberration');

    this.props = { ...DEFAULT_PROPS, ...props };

    // Create uniforms
    this.uniforms = {
      intensity: new THREE.Uniform(this.props.intensity),
      radialFalloff: new THREE.Uniform(this.props.radialFalloff),
      centerWeight: new THREE.Uniform(this.props.centerWeight),
      anamorphicStretch: new THREE.Uniform(this.props.anamorphicStretch),
      redOffset: new THREE.Uniform(this.props.redOffset),
      greenOffset: new THREE.Uniform(this.props.greenOffset),
      blueOffset: new THREE.Uniform(this.props.blueOffset),
      aspectRatio: new THREE.Uniform(this.props.aspectRatio),
    };

    this.enabled = this.props.enabled;
  }

  // --- Setters ---

  setIntensity(value: number): void {
    this.uniforms.intensity.value = THREE.MathUtils.clamp(value, 0, 0.05);
  }

  setRadialFalloff(value: number): void {
    this.uniforms.radialFalloff.value = THREE.MathUtils.clamp(value, 0, 3);
  }

  setCenterWeight(value: number): void {
    this.uniforms.centerWeight.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setAnamorphicStretch(value: number): void {
    this.uniforms.anamorphicStretch.value = Math.max(0.1, value);
  }

  setRedOffset(value: number): void {
    this.uniforms.redOffset.value = value;
  }

  setGreenOffset(value: number): void {
    this.uniforms.greenOffset.value = value;
  }

  setBlueOffset(value: number): void {
    this.uniforms.blueOffset.value = value;
  }

  setAspectRatio(value: number): void {
    this.uniforms.aspectRatio.value = Math.max(0.1, value);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // --- Lens Presets ---

  /**
   * Apply a lens model preset that simulates real lens chromatic aberration curves.
   * - simple: basic RGB separation (default)
   * - achromatic: reduced aberration (better lens correction)
   * - apochromatic: minimal aberration (premium lens)
   */
  applyLensModel(model: 'simple' | 'achromatic' | 'apochromatic'): void {
    this.props.lensModel = model;

    switch (model) {
      case 'simple':
        this.uniforms.redOffset.value = 1.0;
        this.uniforms.greenOffset.value = 0.0;
        this.uniforms.blueOffset.value = 1.0;
        this.uniforms.radialFalloff.value = 1.0;
        break;

      case 'achromatic':
        // Achromatic lenses correct two wavelengths, leaving residual at the third
        this.uniforms.redOffset.value = 0.6;
        this.uniforms.greenOffset.value = 0.0;
        this.uniforms.blueOffset.value = 0.5;
        this.uniforms.radialFalloff.value = 1.5;
        break;

      case 'apochromatic':
        // Apochromatic lenses correct three wavelengths: very little aberration
        this.uniforms.redOffset.value = 0.25;
        this.uniforms.greenOffset.value = 0.0;
        this.uniforms.blueOffset.value = 0.2;
        this.uniforms.radialFalloff.value = 2.0;
        break;
    }
  }

  /**
   * Apply anamorphic cinematic preset: wide horizontal stretch.
   */
  applyAnamorphicPreset(strength: number = 2.0): void {
    this.uniforms.anamorphicStretch.value = strength;
    this.uniforms.redOffset.value = 0.8;
    this.uniforms.blueOffset.value = 0.6;
  }

  // --- Getters ---

  getParams(): ChromaticAberrationProps {
    return {
      intensity: this.uniforms.intensity.value,
      radialFalloff: this.uniforms.radialFalloff.value,
      centerWeight: this.uniforms.centerWeight.value,
      anamorphicStretch: this.uniforms.anamorphicStretch.value,
      redOffset: this.uniforms.redOffset.value,
      greenOffset: this.uniforms.greenOffset.value,
      blueOffset: this.uniforms.blueOffset.value,
      lensModel: this.props.lensModel,
      enabled: this.enabled,
      aspectRatio: this.uniforms.aspectRatio.value,
    };
  }

  /**
   * Update aspect ratio from the renderer/viewport.
   * Call this when the window resizes.
   */
  updateAspectRatio(width: number, height: number): void {
    this.uniforms.aspectRatio.value = width / Math.max(height, 1);
  }
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create a subtle chromatic aberration effect.
 */
export function createSubtleAberration(): ChromaticAberration {
  return new ChromaticAberration({
    intensity: 0.001,
    radialFalloff: 1.5,
    centerWeight: 0.7,
    anamorphicStretch: 1.0,
    redOffset: 0.5,
    greenOffset: 0.0,
    blueOffset: 0.4,
    lensModel: 'achromatic',
  });
}

/**
 * Create a strong chromatic aberration effect for stylized looks.
 */
export function createStylizedAberration(): ChromaticAberration {
  return new ChromaticAberration({
    intensity: 0.005,
    radialFalloff: 0.8,
    centerWeight: 0.3,
    anamorphicStretch: 1.5,
    redOffset: 1.2,
    greenOffset: 0.0,
    blueOffset: 1.0,
    lensModel: 'simple',
  });
}

/**
 * Create a cinematic anamorphic aberration effect.
 */
export function createCinematicAberration(): ChromaticAberration {
  const effect = new ChromaticAberration({
    intensity: 0.003,
    radialFalloff: 1.2,
    centerWeight: 0.6,
    anamorphicStretch: 2.0,
    lensModel: 'achromatic',
  });
  effect.applyAnamorphicPreset(2.0);
  return effect;
}

export default ChromaticAberration;
