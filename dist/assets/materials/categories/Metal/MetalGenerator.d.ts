/**
 * Metal Material Generator - Steel, aluminum, brass, copper, iron with patina
 */
import { Color } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
export interface MetalParams {
    type: 'steel' | 'aluminum' | 'brass' | 'copper' | 'iron' | 'gold' | 'silver';
    color: Color;
    roughness: number;
    metalness: number;
    oxidation: number;
    brushed: boolean;
    brushedDirection: number;
}
export declare class MetalGenerator extends BaseMaterialGenerator<MetalParams> {
    private static readonly DEFAULT_PARAMS;
    constructor();
    getDefaultParams(): MetalParams;
    generate(params?: Partial<MetalParams>, seed?: number): MaterialOutput;
    private generateBrushedNormal;
    private applyOxidation;
    private generateRoughnessMap;
    getVariations(count: number): MetalParams[];
}
//# sourceMappingURL=MetalGenerator.d.ts.map