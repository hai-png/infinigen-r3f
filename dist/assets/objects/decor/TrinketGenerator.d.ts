/**
 * TrinketGenerator - Procedural small decorative objects
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export type TrinketType = 'figurine' | 'vase_mini' | 'crystal' | 'coin' | 'jewelry' | 'ornament';
export type TrinketMaterial = 'ceramic' | 'metal' | 'glass' | 'stone' | 'wood';
export interface TrinketConfig {
    type: TrinketType;
    materialType: TrinketMaterial;
    size: 'tiny' | 'small' | 'medium';
    seed?: number;
}
export declare class TrinketGenerator extends BaseObjectGenerator<TrinketConfig> {
    protected readonly defaultParams: TrinketConfig;
    generate(params?: Partial<TrinketConfig>): Group;
    private createTrinket;
    private getMaterial;
    getVariations(): Params[];
}
//# sourceMappingURL=TrinketGenerator.d.ts.map