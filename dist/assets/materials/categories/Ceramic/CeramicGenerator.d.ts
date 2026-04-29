/**
 * Ceramic Material Generator
 * Generates procedural ceramic materials including porcelain, stoneware, earthenware, and tiles
 */
import { Color } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
export interface CeramicParams {
    [key: string]: unknown;
    type: 'porcelain' | 'stoneware' | 'earthenware' | 'terracotta' | 'tile';
    color: Color;
    glazeType: 'glossy' | 'matte' | 'satin' | 'crackle';
    glazeThickness: number;
    surfaceRoughness: number;
    patternType: 'none' | 'floral' | 'geometric' | 'striped' | 'dotted';
    patternIntensity: number;
    edgeWear: number;
    dirtAccumulation: number;
    tileGroutWidth?: number;
    tileGroutColor?: Color;
    tileSize?: number;
}
export declare class CeramicGenerator extends BaseMaterialGenerator<CeramicParams> {
    private static readonly DEFAULT_PARAMS;
    constructor();
    getDefaultParams(): CeramicParams;
    generate(params?: Partial<CeramicParams>, seed?: number): MaterialOutput;
    private generateBaseColor;
    private applyGlaze;
    private applyCrackleEffect;
    private applyPattern;
    private drawFloralPattern;
    private drawGeometricPattern;
    private drawStripedPattern;
    private drawDottedPattern;
    private generateRoughnessMap;
    private applyEdgeWear;
    private applyDirt;
    private applyTileGrout;
    private generateNormalMap;
    private generateAOMap;
    private createRoughnessTexture;
    getVariations(count: number): CeramicParams[];
}
//# sourceMappingURL=CeramicGenerator.d.ts.map