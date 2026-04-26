/**
 * Plastic Material Generator - Matte, glossy, textured plastic
 */
import { Color } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
export interface PlasticParams {
    type: 'matte' | 'glossy' | 'textured' | 'translucent' | 'metallic';
    color: Color;
    roughness: number;
    metalness: number;
    transmission: number;
    textureScale: number;
}
export declare class PlasticGenerator extends BaseMaterialGenerator<PlasticParams> {
    private static readonly DEFAULT_PARAMS;
    constructor();
    getDefaultParams(): PlasticParams;
    generate(params?: Partial<PlasticParams>, seed?: number): MaterialOutput;
    private generateTexture;
    private generateNormalMap;
    getVariations(count: number): PlasticParams[];
}
//# sourceMappingURL=PlasticGenerator.d.ts.map