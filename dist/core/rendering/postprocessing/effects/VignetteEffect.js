import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';
const DEFAULT_PROPS = {
    intensity: 0.3,
    darkness: 0.5,
    offset: 1.0,
    enabled: true,
};
export class VignetteEffect extends Effect {
    constructor(props = {}) {
        super('VignetteEffect');
        this.props = { ...DEFAULT_PROPS, ...props };
        this.uniforms = {
            intensity: new THREE.Uniform(this.props.intensity),
            darkness: new THREE.Uniform(this.props.darkness),
            offset: new THREE.Uniform(this.props.offset),
        };
    }
    setIntensity(value) {
        this.uniforms.intensity.value = THREE.MathUtils.clamp(value, 0, 1);
    }
    setDarkness(value) {
        this.uniforms.darkness.value = THREE.MathUtils.clamp(value, 0, 1);
    }
    getParams() {
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
//# sourceMappingURL=VignetteEffect.js.map