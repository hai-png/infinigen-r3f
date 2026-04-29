/**
 * Candle Generator
 *
 * Procedural candle generation with various styles,
 * wax materials, flames, and holders.
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface CandleConfig {
    style: 'pillar' | 'taper' | 'votive' | 'tea-light' | 'jar';
    waxType: 'paraffin' | 'beeswax' | 'soy' | 'gel';
    waxColor: string;
    height: number;
    radius: number;
    hasFlame: boolean;
    flameSize: 'small' | 'medium' | 'large';
    burned: boolean;
    burnLevel: number;
    holderStyle: 'none' | 'simple' | 'ornate' | 'lantern';
    scentVisible: boolean;
    seed?: number;
}
export declare class CandleGenerator extends BaseObjectGenerator<CandleConfig> {
    protected readonly defaultParams: CandleConfig;
    getDefaultConfig(): CandleConfig;
    generate(params?: Partial<CandleConfig>): THREE.Group;
    private createCandleBody;
    private getWaxMaterial;
    private createWick;
    private createFlame;
    private createHolder;
    private addBurnEffects;
    private createScentEffect;
    getVariations(): CandleConfig[];
}
//# sourceMappingURL=CandleGenerator.d.ts.map