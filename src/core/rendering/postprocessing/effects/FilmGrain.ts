import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';

export interface FilmGrainProps {
  intensity?: number;
  size?: number;
  enabled?: boolean;
}

const DEFAULT_PROPS: Required<FilmGrainProps> = {
  intensity: 0.2,
  size: 1.0,
  enabled: true,
};

export class FilmGrain extends Effect {
  private uniforms: Record<string, THREE.Uniform>;
  private time: number = 0;

  constructor(props: FilmGrainProps = {}) {
    super('FilmGrain');
    const propsWithDefaults = { ...DEFAULT_PROPS, ...props };
    this.uniforms = {
      intensity: new THREE.Uniform(propsWithDefaults.intensity),
      size: new THREE.Uniform(propsWithDefaults.size),
      time: new THREE.Uniform(0),
    };
  }

  setIntensity(value: number): void {
    this.uniforms.intensity.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setSize(value: number): void {
    this.uniforms.size.value = Math.max(0.1, value);
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
    this.uniforms.time.value = this.time;
  }

  getParams(): FilmGrainProps {
    return {
      intensity: this.uniforms.intensity.value,
      size: this.uniforms.size.value,
      enabled: this.enabled,
    };
  }
}

export const filmGrainFragmentShader = `
  uniform float intensity;
  uniform float size;
  uniform float time;
  varying vec2 vUv;
  uniform sampler2D inputBuffer;
  
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }
  
  void main() {
    vec4 color = texture2D(inputBuffer, vUv);
    vec2 grainUV = vUv * size;
    float noise = random(grainUV + time) - 0.5;
    color.rgb += noise * intensity;
    gl_FragColor = color;
  }
`;

export default FilmGrain;
