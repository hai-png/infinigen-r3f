/**
 * MushroomGenerator - Mushroom varieties
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type MushroomType = 'button' | 'shiitake' | 'fly_agaric' | 'puffball' | 'morel';
export interface MushroomConfig {
    capSize: number;
    stemHeight: number;
    stemThickness: number;
    mushroomType: MushroomType;
    gillDetail: boolean;
}
export declare class MushroomGenerator extends BaseObjectGenerator<MushroomConfig> {
    getDefaultConfig(): MushroomConfig;
    generate(config?: Partial<MushroomConfig>): THREE.Group;
    private createStem;
    private createCap;
    private createGills;
}
//# sourceMappingURL=MushroomGenerator.d.ts.map