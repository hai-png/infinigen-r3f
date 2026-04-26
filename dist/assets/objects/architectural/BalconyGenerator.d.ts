/**
 * BalconyGenerator - Procedural balcony generation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface BalconyParams {
    width: number;
    depth: number;
    railingHeight: number;
    balconyType: 'cantilever' | 'supported' | 'juliet' | 'wrap_around';
    supportType: 'bracket' | 'column' | 'cable';
    railingStyle: 'glass' | 'metal' | 'wood' | 'wrought_iron';
    postSpacing: number;
    floorMaterial: string;
    railingMaterial: string;
}
export declare class BalconyGenerator extends BaseObjectGenerator<BalconyParams> {
    constructor(seed?: number);
    getDefaultParams(): BalconyParams;
    generate(params?: Partial<BalconyParams>): Group;
    getStylePresets(): Record<string, Partial<BalconyParams>>;
}
//# sourceMappingURL=BalconyGenerator.d.ts.map