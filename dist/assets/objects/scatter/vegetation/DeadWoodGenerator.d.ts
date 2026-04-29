/**
 * DeadWoodGenerator - Fallen trees and branches
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
export type DeadWoodType = 'fallen_log' | 'snag' | 'branch_pile' | 'stump';
export interface DeadWoodConfig extends BaseGeneratorConfig {
    length: number;
    radius: number;
    woodType: DeadWoodType;
    decay: number;
}
export declare class DeadWoodGenerator extends BaseObjectGenerator<DeadWoodConfig> {
    getDefaultConfig(): DeadWoodConfig;
    generate(config?: Partial<DeadWoodConfig>): THREE.Group;
    private createLog;
    private createSnag;
    private createBranch;
    private createStump;
}
//# sourceMappingURL=DeadWoodGenerator.d.ts.map