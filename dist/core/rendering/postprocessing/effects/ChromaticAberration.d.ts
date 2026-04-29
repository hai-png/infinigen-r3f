import { Effect } from '@react-three/postprocessing';
export interface ChromaticAberrationProps {
    intensity?: number;
    enabled?: boolean;
}
export declare class ChromaticAberration extends Effect {
    private uniforms;
    constructor(props?: ChromaticAberrationProps);
    setIntensity(value: number): void;
    getParams(): ChromaticAberrationProps;
}
export declare const chromaticAberrationFragmentShader = "\n  uniform float intensity;\n  varying vec2 vUv;\n  uniform sampler2D inputBuffer;\n  \n  void main() {\n    vec2 center = vec2(0.5, 0.5);\n    vec2 dir = vUv - center;\n    vec2 redOffset = dir * intensity;\n    vec2 blueOffset = -dir * intensity;\n    \n    float r = texture2D(inputBuffer, vUv + redOffset).r;\n    float g = texture2D(inputBuffer, vUv).g;\n    float b = texture2D(inputBuffer, vUv + blueOffset).b;\n    \n    gl_FragColor = vec4(r, g, b, 1.0);\n  }\n";
export default ChromaticAberration;
//# sourceMappingURL=ChromaticAberration.d.ts.map