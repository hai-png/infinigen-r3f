/**
 * FruitTreeGenerator - Fruit-bearing trees
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type FruitType = 'apple' | 'orange' | 'cherry' | 'peach' | 'pear';
export interface FruitTreeConfig {
    height: number;
    crownRadius: number;
    fruitCount: number;
    fruitType: FruitType;
}
export declare class FruitTreeGenerator extends BaseObjectGenerator<FruitTreeConfig> {
    getDefaultConfig(): FruitTreeConfig;
    generate(config?: Partial<FruitTreeConfig>): THREE.Group;
    private createTrunk;
    private createCrown;
    private createFruits;
}
//# sourceMappingURL=FruitTreeGenerator.d.ts.map