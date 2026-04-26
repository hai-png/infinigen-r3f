/**
 * CabinetGenerator - Procedural cabinet generation
 */
import * as THREE from 'three';
import { BaseObjectGenerator, ObjectStylePreset } from '../utils/BaseObjectGenerator';
export interface CabinetParams {
    width: number;
    height: number;
    depth: number;
    style: ObjectStylePreset;
    cabinetType: 'base' | 'wall' | 'tall' | 'corner';
    doorCount: number;
    drawerCount: number;
    hasGlassDoors: boolean;
    hasShelves: boolean;
    variationSeed?: number;
}
export declare class CabinetGenerator extends BaseObjectGenerator<CabinetParams> {
    static readonly GENERATOR_ID = "cabinet_generator";
    getDefaultParams(): CabinetParams;
    generate(params?: Partial<CabinetParams>): THREE.Object3D;
    private createCarcass;
    private createDrawers;
    private createDoors;
    private createInteriorShelves;
    private createCountertop;
    private getWoodColor;
    private getStoneColor;
    getVariationCount(): number;
    register(): void;
}
export default CabinetGenerator;
//# sourceMappingURL=CabinetGenerator.d.ts.map