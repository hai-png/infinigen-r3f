/**
 * WallGenerator - Procedural wall segment generation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface WallParams {
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
    getDefaultParams(): WallParams;
    generate(params?: Partial<WallParams>): Group;
    getStylePresets(): Record<string, Partial<WallParams>>;
}
//# sourceMappingURL=WallGenerator.d.ts.map