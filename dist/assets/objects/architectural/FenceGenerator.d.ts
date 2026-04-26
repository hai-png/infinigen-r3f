/**
 * FenceGenerator - Procedural fence generation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface FenceParams {
    length: number;
    height: number;
    fenceType: 'picket' | 'privacy' | 'chain_link' | 'wrought_iron' | 'ranch';
    postSpacing: number;
    postWidth: number;
    picketWidth: number;
    picketSpacing: number;
    hasGate: boolean;
    gateWidth: number;
    material: string;
    style: 'traditional' | 'modern' | 'rustic' | 'farmhouse';
}
export declare class FenceGenerator extends BaseObjectGenerator<FenceParams> {
    constructor(seed?: number);
    getDefaultParams(): FenceParams;
    generate(params?: Partial<FenceParams>): Group;
    getStylePresets(): Record<string, Partial<FenceParams>>;
}
//# sourceMappingURL=FenceGenerator.d.ts.map