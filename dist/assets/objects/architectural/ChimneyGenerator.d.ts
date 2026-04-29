/**
 * ChimneyGenerator - Procedural chimney generation
 */
import { Group } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface ChimneyParams extends BaseGeneratorConfig {
    height: number;
    width: number;
    depth: number;
    chimneyType: 'brick' | 'stone' | 'metal' | 'modern';
    hasCap: boolean;
    capStyle: 'flat' | 'conical' | 'decorative';
    flueCount: number;
    hasDamper: boolean;
    material: string;
    style: 'traditional' | 'modern' | 'rustic' | 'industrial';
}
export declare class ChimneyGenerator extends BaseObjectGenerator<ChimneyParams> {
    constructor(seed?: number);
    getDefaultConfig(): ChimneyParams;
    generate(params?: Partial<ChimneyParams>): Group;
    getStylePresets(): Record<string, Partial<ChimneyParams>>;
}
//# sourceMappingURL=ChimneyGenerator.d.ts.map