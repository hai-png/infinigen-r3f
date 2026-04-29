/**
 * ConiferGenerator - Pine, fir, spruce trees
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type ConiferType = 'pine' | 'fir' | 'spruce' | 'cedar' | 'redwood';
export interface ConiferConfig {
    height: number;
    baseRadius: number;
    tierCount: number;
    coniferType: ConiferType;
}
export declare class ConiferGenerator extends BaseObjectGenerator<ConiferConfig> {
    getDefaultConfig(): ConiferConfig;
    generate(config?: Partial<ConiferConfig>): THREE.Group;
    private createTrunk;
    private createTier;
}
//# sourceMappingURL=ConiferGenerator.d.ts.map