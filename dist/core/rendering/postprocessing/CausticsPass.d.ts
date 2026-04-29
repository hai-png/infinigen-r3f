import * as THREE from 'three';
/**
 * Screen-Space Caustics Post-Processing Pass
 * Simulates caustic light patterns from refractive/reflective surfaces
 */
export interface CausticsConfig {
    intensity: number;
    scale: number;
    speed: number;
    distortion: number;
    color: THREE.Color;
}
export declare class CausticsPass extends THREE.ShaderMaterial {
    private config;
    private time;
    private depthTexture;
    private normalTexture;
    constructor(config?: Partial<CausticsConfig>);
    private updateUniforms;
    update(dt: number): void;
    setDepthTexture(texture: THREE.Texture): void;
    setNormalTexture(texture: THREE.Texture): void;
    setIntensity(intensity: number): void;
    setResolution(width: number, height: number): void;
    dispose(): void;
}
export default CausticsPass;
//# sourceMappingURL=CausticsPass.d.ts.map