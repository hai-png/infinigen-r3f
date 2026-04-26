/**
 * BeamGenerator - Procedural beam generation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface BeamParams {
    length: number;
    width: number;
    height: number;
    beamType: 'i_beam' | 'box_beam' | 'wood_beam' | 'decorative';
    material: string;
    hasEndCaps: boolean;
    endCapStyle: 'flat' | 'ornate' | 'bracket';
    style: 'industrial' | 'rustic' | 'modern' | 'traditional';
}
export declare class BeamGenerator extends BaseObjectGenerator<BeamParams> {
    constructor(seed?: number);
    getDefaultParams(): BeamParams;
    generate(params?: Partial<BeamParams>): Group;
    getStylePresets(): Record<string, Partial<BeamParams>>;
}
//# sourceMappingURL=BeamGenerator.d.ts.map