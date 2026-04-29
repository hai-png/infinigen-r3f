/**
 * RoofGenerator - Procedural roof generation
 */
import { Group } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface RoofParams extends BaseGeneratorConfig {
    width: number;
    depth: number;
    roofType: 'gable' | 'hip' | 'mansard' | 'gambrel' | 'flat' | 'shed';
    pitch: number;
    overhang: number;
    hasDormers: boolean;
    dormerCount: number;
    hasGutters: boolean;
    material: string;
}
export declare class RoofGenerator extends BaseObjectGenerator<RoofParams> {
    constructor(seed?: number);
    getDefaultConfig(): RoofParams;
    generate(params?: Partial<RoofParams>): Group;
    getStylePresets(): Record<string, Partial<RoofParams>>;
}
//# sourceMappingURL=RoofGenerator.d.ts.map