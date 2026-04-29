/**
 * FernGenerator - Procedural fern species with fronds and pinnae
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type FernSpecies = 'boston' | 'maidenhair' | 'bird_nest' | 'staghorn' | 'tree_fern';
export interface FernConfig {
    frondCount: number;
    frondLength: number;
    pinnaePerFrond: number;
    curvature: number;
    species: FernSpecies;
    size: number;
}
export declare class FernGenerator extends BaseObjectGenerator<FernConfig> {
    getDefaultConfig(): FernConfig;
    generate(config?: Partial<FernConfig>): THREE.Group;
    private createFrond;
    private createRachis;
    private createPinna;
}
//# sourceMappingURL=FernGenerator.d.ts.map