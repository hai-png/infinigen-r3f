import { Effect } from '@react-three/postprocessing';
export interface VignetteEffectProps {
    intensity?: number;
    darkness?: number;
    offset?: number;
    enabled?: boolean;
}
export declare class VignetteEffect extends Effect {
    private uniforms;
    private props;
    constructor(props?: VignetteEffectProps);
    setIntensity(value: number): void;
    setDarkness(value: number): void;
    getParams(): VignetteEffectProps;
}
export declare const vignetteFragmentShader = "\n  uniform float intensity;\n  uniform float darkness;\n  uniform float offset;\n  varying vec2 vUv;\n  uniform sampler2D inputBuffer;\n  \n  void main() {\n    vec4 color = texture2D(inputBuffer, vUv);\n    vec2 center = vec2(0.5, 0.5);\n    float dist = distance(vUv, center);\n    float vignette = smoothstep(offset, offset - (intensity * 0.5), dist);\n    color.rgb *= mix(1.0, darkness, vignette);\n    gl_FragColor = color;\n  }\n";
export default VignetteEffect;
//# sourceMappingURL=VignetteEffect.d.ts.map