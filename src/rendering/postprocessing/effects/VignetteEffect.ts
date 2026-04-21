import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';

export interface VignetteEffectProps {
  intensity?: number;
  darkness?: number;
  offset?: number;
  enabled?: boolean;
}

const DEFAULT_PROPS: Required<VignetteEffectProps> = {
  intensity: 0.3,
  darkness: 0.5,
  offset: 1.0,
  enabled: true,
};

export class VignetteEffect extends Effect {
  private uniforms: Record<string, THREE.Uniform>;
  private props: Required<VignetteEffectProps>;

  constructor(props: VignetteEffectProps = {}) {
    super('VignetteEffect');
    this.props = { ...DEFAULT_PROPS, ...props };
    this.uniforms = {
      intensity: new THREE.Uniform(this.props.intensity),
      darkness: new THREE.Uniform(this.props.darkness),
      offset: new THREE.Uniform(this.props.offset),
    };
  }

  setIntensity(value: number): void {
    this.uniforms.intensity.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setDarkness(value: number): void {
    this.uniforms.darkness.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  getParams(): VignetteEffectProps {
    return {
      intensity: this.uniforms.intensity.value,
      darkness: this.uniforms.darkness.value,
      offset: this.uniforms.offset.value,
      enabled: this.enabled,
    };
  }
}

export const vignetteFragmentShader = `
  uniform float intensity;
  uniform float darkness;
  uniform float offset;
  varying vec2 vUv;
  uniform sampler2D inputBuffer;
  
  void main() {
    vec4 color = texture2D(inputBuffer, vUv);
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);
    float vignette = smoothstep(offset, offset - (intensity * 0.5), dist);
    color.rgb *= mix(1.0, darkness, vignette);
    gl_FragColor = color;
  }
`;

export default VignetteEffect;
