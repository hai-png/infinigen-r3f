import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';

export interface ChromaticAberrationProps {
  intensity?: number;
  enabled?: boolean;
}

const DEFAULT_PROPS: Required<ChromaticAberrationProps> = {
  intensity: 0.002,
  enabled: true,
};

export class ChromaticAberration extends Effect {
  private uniforms: Record<string, THREE.Uniform>;

  constructor(props: ChromaticAberrationProps = {}) {
    super('ChromaticAberration');
    const propsWithDefaults = { ...DEFAULT_PROPS, ...props };
    this.uniforms = {
      intensity: new THREE.Uniform(propsWithDefaults.intensity),
    };
  }

  setIntensity(value: number): void {
    this.uniforms.intensity.value = THREE.MathUtils.clamp(value, 0, 0.01);
  }

  getParams(): ChromaticAberrationProps {
    return {
      intensity: this.uniforms.intensity.value,
      enabled: this.enabled,
    };
  }
}

export const chromaticAberrationFragmentShader = `
  uniform float intensity;
  varying vec2 vUv;
  uniform sampler2D inputBuffer;
  
  void main() {
    vec2 center = vec2(0.5, 0.5);
    vec2 dir = vUv - center;
    vec2 redOffset = dir * intensity;
    vec2 blueOffset = -dir * intensity;
    
    float r = texture2D(inputBuffer, vUv + redOffset).r;
    float g = texture2D(inputBuffer, vUv).g;
    float b = texture2D(inputBuffer, vUv + blueOffset).b;
    
    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;

export default ChromaticAberration;
