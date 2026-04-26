/**
 * ShelfGenerator - Procedural shelving unit generation
 */
import * as THREE from 'three';
import { BaseObjectGenerator, ObjectStylePreset } from '../utils/BaseObjectGenerator';
export interface ShelfParams {
    width: number;
    height: number;
    depth: number;
    style: ObjectStylePreset;
    shelfType: 'bookcase' | 'wall_shelf' | 'cube' | 'ladder';
    shelfCount: number;
    adjustable: boolean;
    hasBack: boolean;
    hasDoors: boolean;
    variationSeed?: number;
}
export declare class ShelfGenerator extends BaseObjectGenerator<ShelfParams> {
    static readonly GENERATOR_ID = "shelf_generator";
    getDefaultParams(): ShelfParams;
    generate(params?: Partial<ShelfParams>): THREE.Object3D;
    private createFrame;
    private createShelves;
    private createBack;
    private createDoors;
    private getWoodColor;
    getVariationCount(): number;
    register(): void;
}
export default ShelfGenerator;
//# sourceMappingURL=ShelfGenerator.d.ts.map