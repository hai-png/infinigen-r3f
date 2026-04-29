/**
 * MossGenerator - Moss and lichen patches
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type MossType = 'sheet' | 'clump' | 'lichen';
export interface MossConfig {
    patchSize: number;
    density: number;
    height: number;
    mossType: MossType;
    color: number;
}
export declare class MossGenerator extends BaseObjectGenerator<MossConfig> {
    private noise;
    getDefaultConfig(): MossConfig;
    generate(config?: Partial<MossConfig>): THREE.Group;
    private createMossPatch;
}
//# sourceMappingURL=MossGenerator.d.ts.map