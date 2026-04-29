/**
 * ColumnGenerator - Procedural column generation
 */
import { Group } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface ColumnParams extends BaseGeneratorConfig {
    height: number;
    bottomRadius: number;
    topRadius: number;
    columnOrder: 'doric' | 'ionic' | 'corinthian' | 'tuscan' | 'composite' | 'modern';
    hasBase: boolean;
    hasCapital: boolean;
    shaftFluting: boolean;
    numFlutes: number;
    material: string;
    style: 'classical' | 'modern' | 'industrial';
}
export declare class ColumnGenerator extends BaseObjectGenerator<ColumnParams> {
    constructor(seed?: number);
    getDefaultConfig(): ColumnParams;
    generate(params?: Partial<ColumnParams>): Group;
    getStylePresets(): Record<string, Partial<ColumnParams>>;
}
//# sourceMappingURL=ColumnGenerator.d.ts.map