/**
 * Fabric Material Generator
 * Generates procedural fabric materials including cotton, linen, wool, velvet, denim
 */
import { Color } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
export interface FabricParams {
    [key: string]: unknown;
    type: 'cotton' | 'linen' | 'wool' | 'velvet' | 'denim' | 'silk' | 'canvas';
    color: Color;
    weaveType: 'plain' | 'twill' | 'satin' | 'knit';
    weaveScale: number;
    roughness: number;
    fuzziness: number;
    patternType: 'none' | 'striped' | 'checkered' | 'floral' | 'paisley';
    patternScale: number;
    wearLevel: number;
    stainIntensity: number;
}
export declare class FabricGenerator extends BaseMaterialGenerator<FabricParams> {
    private static readonly DEFAULT_PARAMS;
    constructor();
    getDefaultParams(): FabricParams;
    generate(params?: Partial<FabricParams>, seed?: number): MaterialOutput;
    private generateWeavePattern;
    private drawPlainWeave;
    private drawTwillWeave;
    private drawSatinWeave;
    private drawKnitWeave;
    private applyBaseColor;
    private applyPattern;
    private drawStripes;
    private drawCheckers;
    private drawFloral;
    private drawPaisley;
    private generateRoughnessMap;
    private applyFuzziness;
    private applyWear;
    private applyStains;
    private generateNormalMap;
    getVariations(count: number): FabricParams[];
}
//# sourceMappingURL=FabricGenerator.d.ts.map