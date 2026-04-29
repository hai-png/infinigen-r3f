/**
 * IvyGenerator - Climbing plants with segmented growth
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export interface IvyConfig {
    vineLength: number;
    segmentCount: number;
    leafSize: number;
    leafDensity: number;
    curvature: number;
}
export declare class IvyGenerator extends BaseObjectGenerator<IvyConfig> {
    getDefaultConfig(): IvyConfig;
    generate(config?: Partial<IvyConfig>): THREE.Group;
    private createVine;
    private createLeaf;
}
//# sourceMappingURL=IvyGenerator.d.ts.map