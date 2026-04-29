/**
 * Microsurface Detail Generator - Bump, normal, displacement maps
 */
import { Texture } from 'three';
export interface SurfaceParams {
    bumpScale: number;
    normalStrength: number;
    displacementScale: number;
    detailFrequency: number;
    detailAmplitude: number;
}
export declare class SurfaceDetailGenerator {
    generate(params: SurfaceParams, seed: number): {
        bumpMap: Texture;
        normalMap: Texture;
        displacementMap: Texture;
    };
    private generateBumpMap;
    private generateNormalMap;
    private generateDisplacementMap;
    getDefaultParams(): SurfaceParams;
}
//# sourceMappingURL=SurfaceDetail.d.ts.map