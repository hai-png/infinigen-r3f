/**
 * DrawerUnit - Procedural drawer system generation
 */
import * as THREE from 'three';
import { BaseObjectGenerator, ObjectStylePreset } from '../utils/BaseObjectGenerator';
export interface DrawerUnitParams {
    width: number;
    height: number;
    depth: number;
    style: ObjectStylePreset;
    unitType: 'chest' | 'filing' | 'nightstand' | 'dresser';
    drawerCount: number;
    hasWheels: boolean;
    lockable: boolean;
    variationSeed?: number;
}
export declare class DrawerUnit extends BaseObjectGenerator<DrawerUnitParams> {
    static readonly GENERATOR_ID = "drawer_unit";
    getDefaultParams(): DrawerUnitParams;
    generate(params?: Partial<DrawerUnitParams>): THREE.Object3D;
    private createFrame;
    private createDrawers;
    private createHandle;
    private createWheels;
    private createTop;
    private getWoodColor;
    private getHandleColor;
    getVariationCount(): number;
    register(): void;
}
export default DrawerUnit;
//# sourceMappingURL=DrawerUnit.d.ts.map