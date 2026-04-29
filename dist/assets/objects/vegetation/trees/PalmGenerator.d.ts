/**
 * PalmGenerator - Palm trees
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type PalmType = 'coconut' | 'date' | 'fan' | 'sago';
export interface PalmConfig {
    trunkHeight: number;
    trunkRadius: number;
    frondCount: number;
    frondLength: number;
    palmType: PalmType;
}
export declare class PalmGenerator extends BaseObjectGenerator<PalmConfig> {
    getDefaultConfig(): PalmConfig;
    generate(config?: Partial<PalmConfig>): THREE.Group;
    private createTrunk;
    private createFrond;
}
//# sourceMappingURL=PalmGenerator.d.ts.map