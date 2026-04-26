/**
 * ColumnGenerator - Procedural column generation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface ColumnParams {
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
    getDefaultParams(): ColumnParams;
    generate(params?: Partial<ColumnParams>): Group;
    getStylePresets(): Record<string, Partial<ColumnParams>>;
}
//# sourceMappingURL=ColumnGenerator.d.ts.map