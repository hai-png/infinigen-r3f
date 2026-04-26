/**
 * Glass Material Generator - Clear, frosted, tinted, patterned glass
 */
import { Color } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
export interface GlassParams {
    type: 'clear' | 'frosted' | 'tinted' | 'patterned' | 'textured';
    color: Color;
    transmission: number;
    roughness: number;
    thickness: number;
    ior: number;
    patternType: 'none' | 'ribbed' | 'fluted' | 'geometric';
}
export declare class GlassGenerator extends BaseMaterialGenerator<GlassParams> {
    private static readonly DEFAULT_PARAMS;
    constructor();
    getDefaultParams(): GlassParams;
    generate(params?: Partial<GlassParams>, seed?: number): MaterialOutput;
    private generatePatternNormal;
    getVariations(count: number): GlassParams[];
}
//# sourceMappingURL=GlassGenerator.d.ts.map