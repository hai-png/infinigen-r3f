/**
 * Wood Material Generator - Hardwood, softwood, plywood, reclaimed
 */
import { Color } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
export interface WoodParams {
    [key: string]: unknown;
    type: 'oak' | 'pine' | 'walnut' | 'mahogany' | 'plywood' | 'reclaimed';
    color: Color;
    grainIntensity: number;
    grainScale: number;
    roughness: number;
    knotDensity: number;
    finishType: 'matte' | 'satin' | 'gloss';
}
export declare class WoodGenerator extends BaseMaterialGenerator<WoodParams> {
    private static readonly DEFAULT_PARAMS;
    constructor();
    getDefaultParams(): WoodParams;
    generate(params?: Partial<WoodParams>, seed?: number): MaterialOutput;
    private generateGrainTexture;
    private generateNormalMap;
    getVariations(count: number): WoodParams[];
}
//# sourceMappingURL=WoodGenerator.d.ts.map