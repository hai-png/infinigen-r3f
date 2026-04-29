/**
 * WallGenerator - Procedural wall segment generation
 */
import { Group } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface WallParams extends BaseGeneratorConfig {
    width: number;
    height: number;
    thickness: number;
    wallType: 'solid' | 'curtain' | 'partition' | 'retaining';
    hasDoorOpening: boolean;
    doorWidth: number;
    doorHeight: number;
    hasWindowOpenings: boolean;
    windowCount: number;
    windowWidth: number;
    windowHeight: number;
    material: string;
    style: 'modern' | 'traditional' | 'industrial' | 'rustic';
}
export declare class WallGenerator extends BaseObjectGenerator<WallParams> {
    constructor(seed?: number);
    getDefaultConfig(): WallParams;
    generate(params?: Partial<WallParams>): Group;
    getStylePresets(): Record<string, Partial<WallParams>>;
}
//# sourceMappingURL=WallGenerator.d.ts.map