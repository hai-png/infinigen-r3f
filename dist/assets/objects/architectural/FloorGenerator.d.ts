/**
 * FloorGenerator - Procedural flooring generation
 */
import { Group } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface FloorParams extends BaseGeneratorConfig {
    width: number;
    depth: number;
    thickness: number;
    floorType: 'hardwood' | 'tile' | 'carpet' | 'concrete' | 'laminate';
    pattern: 'plank' | 'parquet' | 'herringbone' | 'basketweave' | 'uniform';
    plankWidth: number;
    tileWidth: number;
    material: string;
    hasBorder: boolean;
    borderWidth: number;
    borderMaterial: string;
}
export declare class FloorGenerator extends BaseObjectGenerator<FloorParams> {
    constructor(seed?: number);
    getDefaultConfig(): FloorParams;
    generate(params?: Partial<FloorParams>): Group;
    getStylePresets(): Record<string, Partial<FloorParams>>;
}
//# sourceMappingURL=FloorGenerator.d.ts.map