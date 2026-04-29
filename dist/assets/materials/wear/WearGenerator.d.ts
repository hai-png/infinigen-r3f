/**
 * Wear and Tear Generator - Scratches, scuffs, dents, edge wear
 */
import { Texture } from 'three';
export interface WearParams {
    scratchDensity: number;
    scratchLength: number;
    scratchDepth: number;
    scuffDensity: number;
    edgeWear: number;
    dentCount: number;
    dirtAccumulation: number;
}
export declare class WearGenerator {
    generateWearMap(params: WearParams, seed: number): {
        roughnessMap: Texture;
        normalMap: Texture;
        aoMap: Texture;
    };
    private generateRoughnessWear;
    private generateNormalWear;
    private generateAOWear;
    getDefaultParams(): WearParams;
}
//# sourceMappingURL=WearGenerator.d.ts.map