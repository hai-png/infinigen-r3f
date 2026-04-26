/**
 * Stone Material Generator - Marble, granite, limestone, slate, concrete
 */
import { Color } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
export interface StoneParams {
    type: 'marble' | 'granite' | 'limestone' | 'slate' | 'concrete' | 'travertine';
    color: Color;
    veinColor: Color;
    roughness: number;
    veinIntensity: number;
    veinScale: number;
    polishLevel: number;
}
export declare class StoneGenerator extends BaseMaterialGenerator<StoneParams> {
    private static readonly DEFAULT_PARAMS;
    constructor();
    getDefaultParams(): StoneParams;
    generate(params?: Partial<StoneParams>, seed?: number): MaterialOutput;
    private generateMarbleTexture;
    private generateGraniteTexture;
    private generateConcreteTexture;
    private generateNormalMap;
    getVariations(count: number): StoneParams[];
}
//# sourceMappingURL=StoneGenerator.d.ts.map