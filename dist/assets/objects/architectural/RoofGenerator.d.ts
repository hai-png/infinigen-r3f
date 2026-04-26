/**
 * RoofGenerator - Procedural roof generation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface RoofParams {
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
    getDefaultParams(): RoofParams;
    generate(params?: Partial<RoofParams>): Group;
    getStylePresets(): Record<string, Partial<RoofParams>>;
}
//# sourceMappingURL=RoofGenerator.d.ts.map