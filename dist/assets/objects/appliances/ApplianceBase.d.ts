/**
 * ApplianceBase - Abstract base class for procedural appliance generation
 *
 * Provides common functionality for kitchen and laundry appliances including:
 * - Standard appliance dimensions and proportions
 * - Door/handle systems
 * - Control panel generation
 * - Material slots for stainless steel, plastic, glass
 * - Integration with lighting for indicator LEDs
 */
import { Object3D, Group, Mesh } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
import { BBox } from '../../../core/util/math/index';
export interface ApplianceParams extends BaseGeneratorConfig {
    width: number;
    height: number;
    depth: number;
    style: 'modern' | 'retro' | 'industrial' | 'minimal';
    finish: 'stainless' | 'black' | 'white' | 'colored';
    hasDisplay: boolean;
    hasHandle: boolean;
    handleStyle: 'bar' | 'tube' | 'recessed' | 'knob';
    doorCount: number;
    vented: boolean;
}
export declare abstract class ApplianceBase<T extends ApplianceParams = ApplianceParams> extends BaseObjectGenerator<T> {
    protected defaultParams: ApplianceParams;
    getDefaultConfig(): T;
    constructor();
    protected validateParams(params: Partial<ApplianceParams>): Partial<ApplianceParams>;
    protected generateMainBody(params: ApplianceParams): Group;
    protected createDoor(params: ApplianceParams, position: {
        x: number;
        y: number;
        z: number;
    }, size: {
        w: number;
        h: number;
    }): Group;
    protected createHandle(style: string, height: number, finish: string): Mesh;
    protected createDisplayPanel(params: ApplianceParams): Mesh;
    protected addRetroTrim(group: Group, params: ApplianceParams): void;
    protected addIndustrialDetails(group: Group, params: ApplianceParams): void;
    protected getFinishMaterial(finish: string): any;
    protected getHandleMaterial(finish: string): any;
    protected createEmissiveMaterial(color: number, intensity: number): any;
    getBoundingBox(params: ApplianceParams): BBox;
    getCollisionMesh(params: ApplianceParams): Object3D;
    getRandomParams(): ApplianceParams;
}
//# sourceMappingURL=ApplianceBase.d.ts.map