/**
 * PlantPotGenerator - Procedural plant pot generation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
export type PotStyle = 'terracotta' | 'ceramic' | 'plastic' | 'hanging' | 'self_watering' | 'decorative';
export type PotShape = 'cylindrical' | 'tapered' | 'square' | 'rectangular' | 'spherical';
export interface PlantPotConfig {
    style: PotStyle;
    shape: PotShape;
    size: 'small' | 'medium' | 'large';
    hasDrainage: boolean;
    hasSaucer: boolean;
    seed?: number;
}
export declare class PlantPotGenerator extends BaseObjectGenerator<PlantPotConfig> {
    protected readonly defaultParams: PlantPotConfig;
    generate(params?: Partial<PlantPotConfig>): Group;
    private createPot;
    private createSaucer;
    private getMaterial;
    getVariations(): Params[];
}
//# sourceMappingURL=PlantPotGenerator.d.ts.map