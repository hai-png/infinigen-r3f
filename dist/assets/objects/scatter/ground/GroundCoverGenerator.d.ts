/**
 * GroundCoverGenerator - Leaves, twigs, pebbles
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type GroundCoverType = 'leaves' | 'twigs' | 'pebbles' | 'mixed';
export interface GroundCoverConfig {
    coverage: number;
    density: number;
    coverType: GroundCoverType;
    color: number;
}
export declare class GroundCoverGenerator extends BaseObjectGenerator<GroundCoverConfig> {
    getDefaultConfig(): GroundCoverConfig;
    generate(config?: Partial<GroundCoverConfig>): THREE.Group;
    private createLeaves;
    private createTwigs;
    private createPebbles;
}
//# sourceMappingURL=GroundCoverGenerator.d.ts.map