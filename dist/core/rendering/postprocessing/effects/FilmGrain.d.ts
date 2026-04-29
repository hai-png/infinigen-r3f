import { Effect } from '@react-three/postprocessing';
export interface FilmGrainProps {
    intensity?: number;
    size?: number;
    enabled?: boolean;
}
export declare class FilmGrain extends Effect {
    private uniforms;
    private time;
    constructor(props?: FilmGrainProps);
    setIntensity(value: number): void;
    setSize(value: number): void;
    update(deltaTime: number): void;
    getParams(): FilmGrainProps;
}
export declare const filmGrainFragmentShader = "\n  uniform float intensity;\n  uniform float size;\n  uniform float time;\n  varying vec2 vUv;\n  uniform sampler2D inputBuffer;\n  \n  float random(vec2 st) {\n    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);\n  }\n  \n  void main() {\n    vec4 color = texture2D(inputBuffer, vUv);\n    vec2 grainUV = vUv * size;\n    float noise = random(grainUV + time) - 0.5;\n    color.rgb += noise * intensity;\n    gl_FragColor = color;\n  }\n";
export default FilmGrain;
//# sourceMappingURL=FilmGrain.d.ts.map