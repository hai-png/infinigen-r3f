/**
 * Vignette Post-Processing Effect
 *
 * Enhanced with aspect-ratio-aware elliptical falloff, adjustable softness,
 * color tint, roundness control, center offset, and multi-layer vignette.
 */

import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface VignetteEffectProps {
  /** Vignette intensity (0-1, default 0.3) */
  intensity?: number;
  /** Darkness: how dark the vignette gets at edges (0-1, default 0.5) */
  darkness?: number;
  /** Offset: start distance from center (default 1.0) */
  offset?: number;
  /** Enable/disable */
  enabled?: boolean;
  /** Softness: edge transition from hard (0) to gradual fade (1) */
  softness?: number;
  /** Roundness: shape from round (0) to rectangular (1) */
  roundness?: number;
  /** Aspect ratio for elliptical falloff (default 16/9) */
  aspectRatio?: number;
  /** Color tint: vignette darkens to this color instead of black */
  tintColor?: THREE.Color | [number, number, number];
  /** Center offset: vignette center doesn't have to be image center (0-1 UV space) */
  centerOffset?: [number, number];
  /** Multi-layer: enable subtle outer + stronger inner vignette for depth */
  multiLayer?: boolean;
  /** Inner layer intensity multiplier */
  innerLayerIntensity?: number;
  /** Inner layer size (fraction of outer, 0-1) */
  innerLayerSize?: number;
}

const DEFAULT_PROPS: Required<Omit<VignetteEffectProps, 'tintColor'>> & { tintColor: [number, number, number] } = {
  intensity: 0.3,
  darkness: 0.5,
  offset: 1.0,
  enabled: true,
  softness: 0.5,
  roundness: 0.0,
  aspectRatio: 16 / 9,
  tintColor: [0, 0, 0],
  centerOffset: [0.5, 0.5],
  multiLayer: false,
  innerLayerIntensity: 0.5,
  innerLayerSize: 0.6,
};

// ---------------------------------------------------------------------------
// Fragment Shader
// ---------------------------------------------------------------------------

export const vignetteFragmentShader = /* glsl */ `
  uniform float intensity;
  uniform float darkness;
  uniform float offset;
  uniform float softness;
  uniform float roundness;
  uniform float aspectRatio;
  uniform vec3 tintColor;
  uniform vec2 centerOffset;
  uniform float multiLayer;
  uniform float innerLayerIntensity;
  uniform float innerLayerSize;

  varying vec2 vUv;
  uniform sampler2D inputBuffer;

  /**
   * Compute vignette factor for a given UV position.
   * Returns 0 at edges (fully vignetted) to 1 at center (clear).
   */
  float computeVignette(vec2 uv, vec2 center, float radius, float soft, float round) {
    // Aspect-ratio-corrected distance for elliptical falloff
    vec2 aspectCorrection = vec2(1.0 / aspectRatio, 1.0);
    vec2 diff = (uv - center) * aspectCorrection;

    // Mix between circular and rectangular distance
    // Circular: Euclidean distance
    float circularDist = length(diff);
    // Rectangular: Chebyshev distance (max of |dx|, |dy|)
    float rectDist = max(abs(diff.x), abs(diff.y));

    // Blend based on roundness
    float dist = mix(circularDist, rectDist, round);

    // Softness controls the transition edge
    // softness=0: hard edge at offset radius
    // softness=1: gradual fade from center
    float innerRadius = offset * (1.0 - soft) * 0.5;
    float outerRadius = offset * 0.5;

    // Smooth falloff
    float vignette = smoothstep(outerRadius, innerRadius, dist);

    return vignette;
  }

  void main() {
    vec4 color = texture2D(inputBuffer, vUv);
    vec2 center = centerOffset;

    // --- Outer vignette layer ---
    float outerVignette = computeVignette(vUv, center, offset, softness, roundness);

    // Apply darkness and tint
    vec3 vignetteColor = mix(tintColor, vec3(0.0), 0.3); // slight mix toward black
    color.rgb = mix(
      mix(vignetteColor * darkness, color.rgb, outerVignette),
      color.rgb,
      1.0 - intensity
    );

    // --- Inner vignette layer (for depth) ---
    if (multiLayer > 0.5) {
      float innerVignette = computeVignette(
        vUv,
        center,
        offset * innerLayerSize,
        softness * 0.7,
        roundness * 0.8
      );

      // Inner layer is subtler but adds depth
      float innerStrength = innerLayerIntensity * intensity;
      color.rgb = mix(
        mix(vec3(0.0), color.rgb, innerVignette),
        color.rgb,
        1.0 - innerStrength * 0.5
      );
    }

    gl_FragColor = color;
  }
`;

// ---------------------------------------------------------------------------
// Effect Class
// ---------------------------------------------------------------------------

export class VignetteEffect extends Effect {
  private uniforms: Record<string, THREE.Uniform>;
  private props: Required<Omit<VignetteEffectProps, 'tintColor'>> & { tintColor: [number, number, number] };

  constructor(props: VignetteEffectProps = {}) {
    super('VignetteEffect');

    // Normalize tintColor
    let tintColor: [number, number, number] = [0, 0, 0];
    if (props.tintColor) {
      if (props.tintColor instanceof THREE.Color) {
        tintColor = [props.tintColor.r, props.tintColor.g, props.tintColor.b];
      } else {
        tintColor = props.tintColor;
      }
    }

    this.props = {
      ...DEFAULT_PROPS,
      ...props,
      tintColor,
    };

    this.uniforms = {
      intensity: new THREE.Uniform(this.props.intensity),
      darkness: new THREE.Uniform(this.props.darkness),
      offset: new THREE.Uniform(this.props.offset),
      softness: new THREE.Uniform(this.props.softness),
      roundness: new THREE.Uniform(this.props.roundness),
      aspectRatio: new THREE.Uniform(this.props.aspectRatio),
      tintColor: new THREE.Uniform(new THREE.Vector3(...this.props.tintColor)),
      centerOffset: new THREE.Uniform(new THREE.Vector2(...this.props.centerOffset)),
      multiLayer: new THREE.Uniform(this.props.multiLayer ? 1.0 : 0.0),
      innerLayerIntensity: new THREE.Uniform(this.props.innerLayerIntensity),
      innerLayerSize: new THREE.Uniform(this.props.innerLayerSize),
    };

    this.enabled = this.props.enabled;
  }

  // --- Setters ---

  setIntensity(value: number): void {
    this.uniforms.intensity.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setDarkness(value: number): void {
    this.uniforms.darkness.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setOffset(value: number): void {
    this.uniforms.offset.value = Math.max(0, value);
  }

  setSoftness(value: number): void {
    this.uniforms.softness.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setRoundness(value: number): void {
    this.uniforms.roundness.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setAspectRatio(value: number): void {
    this.uniforms.aspectRatio.value = Math.max(0.1, value);
  }

  /**
   * Set the color the vignette darkens toward.
   * Default is black (0,0,0). Use warm tones for vintage looks.
   */
  setTintColor(r: number, g: number, b: number): void {
    this.uniforms.tintColor.value.set(r, g, b);
  }

  /**
   * Set the center point of the vignette in UV space.
   * Default is (0.5, 0.5) = image center.
   */
  setCenterOffset(x: number, y: number): void {
    this.uniforms.centerOffset.value.set(x, y);
  }

  /**
   * Enable or disable the multi-layer vignette (subtle outer + stronger inner).
   */
  setMultiLayer(enabled: boolean, innerIntensity?: number, innerSize?: number): void {
    this.uniforms.multiLayer.value = enabled ? 1.0 : 0.0;
    if (innerIntensity !== undefined) {
      this.uniforms.innerLayerIntensity.value = THREE.MathUtils.clamp(innerIntensity, 0, 1);
    }
    if (innerSize !== undefined) {
      this.uniforms.innerLayerSize.value = THREE.MathUtils.clamp(innerSize, 0, 1);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // --- Presets ---

  /**
   * Apply a natural vignette: subtle, round, smooth.
   */
  applyNaturalPreset(): void {
    this.uniforms.intensity.value = 0.2;
    this.uniforms.darkness.value = 0.4;
    this.uniforms.softness.value = 0.6;
    this.uniforms.roundness.value = 0.0;
    this.uniforms.multiLayer.value = 0.0;
    this.uniforms.tintColor.value.set(0, 0, 0);
  }

  /**
   * Apply a cinematic vignette: moderate, slightly rectangular, multi-layer.
   */
  applyCinematicPreset(): void {
    this.uniforms.intensity.value = 0.4;
    this.uniforms.darkness.value = 0.6;
    this.uniforms.softness.value = 0.5;
    this.uniforms.roundness.value = 0.3;
    this.uniforms.multiLayer.value = 1.0;
    this.uniforms.innerLayerIntensity.value = 0.4;
    this.uniforms.innerLayerSize.value = 0.65;
    this.uniforms.tintColor.value.set(0.01, 0.01, 0.02);
  }

  /**
   * Apply a dramatic vignette: heavy, hard-edged, warm tint.
   */
  applyDramaticPreset(): void {
    this.uniforms.intensity.value = 0.6;
    this.uniforms.darkness.value = 0.8;
    this.uniforms.softness.value = 0.3;
    this.uniforms.roundness.value = 0.2;
    this.uniforms.multiLayer.value = 1.0;
    this.uniforms.innerLayerIntensity.value = 0.6;
    this.uniforms.innerLayerSize.value = 0.5;
    this.uniforms.tintColor.value.set(0.02, 0.01, 0.0);
  }

  /**
   * Apply a vintage vignette: warm brown tint, soft, slightly rectangular.
   */
  applyVintagePreset(): void {
    this.uniforms.intensity.value = 0.5;
    this.uniforms.darkness.value = 0.7;
    this.uniforms.softness.value = 0.7;
    this.uniforms.roundness.value = 0.4;
    this.uniforms.multiLayer.value = 0.0;
    this.uniforms.tintColor.value.set(0.06, 0.03, 0.01);
  }

  // --- Getters ---

  getParams(): VignetteEffectProps {
    const tintColor = this.uniforms.tintColor.value;
    const centerOffset = this.uniforms.centerOffset.value;

    return {
      intensity: this.uniforms.intensity.value,
      darkness: this.uniforms.darkness.value,
      offset: this.uniforms.offset.value,
      enabled: this.enabled,
      softness: this.uniforms.softness.value,
      roundness: this.uniforms.roundness.value,
      aspectRatio: this.uniforms.aspectRatio.value,
      tintColor: [tintColor.x, tintColor.y, tintColor.z],
      centerOffset: [centerOffset.x, centerOffset.y],
      multiLayer: this.uniforms.multiLayer.value > 0.5,
      innerLayerIntensity: this.uniforms.innerLayerIntensity.value,
      innerLayerSize: this.uniforms.innerLayerSize.value,
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
 * Create a subtle natural vignette.
 */
export function createNaturalVignette(): VignetteEffect {
  const effect = new VignetteEffect({
    intensity: 0.2,
    darkness: 0.4,
    softness: 0.6,
    roundness: 0.0,
    multiLayer: false,
  });
  return effect;
}

/**
 * Create a cinematic vignette with multi-layer depth.
 */
export function createCinematicVignette(): VignetteEffect {
  const effect = new VignetteEffect({
    intensity: 0.4,
    darkness: 0.6,
    softness: 0.5,
    roundness: 0.3,
    multiLayer: true,
    innerLayerIntensity: 0.4,
    innerLayerSize: 0.65,
  });
  effect.setTintColor(0.01, 0.01, 0.02);
  return effect;
}

/**
 * Create a dramatic vignette with warm tint.
 */
export function createDramaticVignette(): VignetteEffect {
  const effect = new VignetteEffect({
    intensity: 0.6,
    darkness: 0.8,
    softness: 0.3,
    roundness: 0.2,
    multiLayer: true,
    innerLayerIntensity: 0.6,
    innerLayerSize: 0.5,
  });
  effect.setTintColor(0.02, 0.01, 0.0);
  return effect;
}

export default VignetteEffect;
