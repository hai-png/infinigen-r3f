/**
 * Leather Material Generator - Full-grain, top-grain, suede, distressed
 */
import { Color } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
export interface LeatherParams {
    [key: string]: unknown;
    type: 'full-grain' | 'top-grain' | 'suede' | 'distressed' | 'patent';
    color: Color;
    roughness: number;
    grainIntensity: number;
    wearLevel: number;
    sheen: number;
}
export declare class LeatherGenerator extends BaseMaterialGenerator<LeatherParams> {
    private static readonly DEFAULT_PARAMS;
    constructor();
    getDefaultParams(): LeatherParams;
    generate(params?: Partial<LeatherParams>, seed?: number): MaterialOutput;
    private generateGrainTexture;
    private generateNormalMap;
    private generateRoughnessMap;
    getVariations(count: number): LeatherParams[];
}
//# sourceMappingURL=LeatherGenerator.d.ts.map