/**
 * RugGenerator - Procedural rug/carpet generation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export type RugStyle = 'persian' | 'modern' | 'shag' | 'oriental' | 'geometric' | 'traditional';
export type RugShape = 'rectangular' | 'round' | 'oval' | 'runner';
export interface RugConfig {
    style: RugStyle;
    shape: RugShape;
    width: number;
    length: number;
    pileHeight: number;
    hasFringe: boolean;
    seed?: number;
}
export declare class RugGenerator extends BaseObjectGenerator<RugConfig> {
    protected readonly defaultParams: RugConfig;
    getDefaultConfig(): RugConfig;
    generate(params?: Partial<RugConfig>): Group;
    private createRug;
    private addFringe;
    private getMaterial;
    getVariations(): RugConfig[];
}
//# sourceMappingURL=RugGenerator.d.ts.map