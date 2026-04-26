/**
 * DeskGenerator - Procedural desk generation
 */
import * as THREE from 'three';
import { BaseObjectGenerator, ObjectStylePreset } from '../utils/BaseObjectGenerator';
export interface DeskParams {
    width: number;
    depth: number;
    height: number;
    style: ObjectStylePreset;
    deskType: 'writing' | 'computer' | 'executive' | 'standing';
    hasDrawers: boolean;
    drawerCount: number;
    hasHutch: boolean;
    cableManagement: boolean;
    variationSeed?: number;
}
export declare class DeskGenerator extends BaseObjectGenerator<DeskParams> {
    static readonly GENERATOR_ID = "desk_generator";
    getDefaultParams(): DeskParams;
    generate(params?: Partial<DeskParams>): THREE.Object3D;
    private createTop;
    private createBase;
    private createDrawers;
    private createHutch;
    private createCableManagement;
    private getWoodColor;
    getVariationCount(): number;
    register(): void;
}
export default DeskGenerator;
//# sourceMappingURL=DeskGenerator.d.ts.map