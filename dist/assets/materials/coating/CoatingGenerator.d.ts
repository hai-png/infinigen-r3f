/**
 * Coating Generator - Varnish, lacquer, paint, powder coating
 */
import { Color } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../BaseMaterialGenerator';
export interface CoatingParams {
    type: 'varnish' | 'lacquer' | 'paint' | 'powder' | 'anodized';
    color: Color;
    glossiness: number;
    thickness: number;
    clearcoat: number;
    [key: string]: unknown;
}
export declare class CoatingGenerator extends BaseMaterialGenerator<CoatingParams> {
    private static readonly DEFAULT_PARAMS;
    constructor();
    getDefaultParams(): CoatingParams;
    generate(params?: Partial<CoatingParams>, seed?: number): MaterialOutput;
    getVariations(count: number): CoatingParams[];
}
//# sourceMappingURL=CoatingGenerator.d.ts.map