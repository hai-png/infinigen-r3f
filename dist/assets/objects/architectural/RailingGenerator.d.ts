/**
 * RailingGenerator - Procedural railing generation
 */
import { Group } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface RailingParams extends BaseGeneratorConfig {
    length: number;
    height: number;
    width: number;
    railingType: 'horizontal' | 'vertical' | 'glass' | 'cable' | 'ornate';
    postSpacing: number;
    postWidth: number;
    railCount: number;
    balusterType: 'round' | 'square' | 'flat' | 'twisted';
    style: 'modern' | 'traditional' | 'industrial' | 'classic';
    material: string;
    hasHandrail: boolean;
    handrailShape: 'round' | 'rectangular' | 'custom';
}
export declare class RailingGenerator extends BaseObjectGenerator<RailingParams> {
    constructor(seed?: number);
    getDefaultConfig(): RailingParams;
    generate(params?: Partial<RailingParams>): Group;
    getStylePresets(): Record<string, Partial<RailingParams>>;
}
//# sourceMappingURL=RailingGenerator.d.ts.map