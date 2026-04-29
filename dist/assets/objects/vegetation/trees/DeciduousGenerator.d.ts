/**
 * DeciduousGenerator - Broadleaf trees
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type DeciduousType = 'oak' | 'maple' | 'birch' | 'willow' | 'ash';
export interface DeciduousConfig {
    height: number;
    crownRadius: number;
    trunkThickness: number;
    treeType: DeciduousType;
    leafColor: number;
}
export declare class DeciduousGenerator extends BaseObjectGenerator<DeciduousConfig> {
    private noise;
    getDefaultConfig(): DeciduousConfig;
    generate(config?: Partial<DeciduousConfig>): THREE.Group;
    private createTrunk;
    private createCrown;
}
//# sourceMappingURL=DeciduousGenerator.d.ts.map