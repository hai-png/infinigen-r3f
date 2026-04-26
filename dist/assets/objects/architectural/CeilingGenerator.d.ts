/**
 * CeilingGenerator - Procedural ceiling generation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface CeilingParams {
    width: number;
    depth: number;
    height: number;
    thickness: number;
    ceilingType: 'flat' | 'coffered' | 'tray' | 'vaulted' | 'beamed';
    beamCount: number;
    beamDepth: number;
    cofferSize: number;
    material: string;
    hasMolding: boolean;
    moldingWidth: number;
}
export declare class CeilingGenerator extends BaseObjectGenerator<CeilingParams> {
    constructor(seed?: number);
    getDefaultParams(): CeilingParams;
    generate(params?: Partial<CeilingParams>): Group;
    getStylePresets(): Record<string, Partial<CeilingParams>>;
}
//# sourceMappingURL=CeilingGenerator.d.ts.map