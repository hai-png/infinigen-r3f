import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface CupParams extends BaseGeneratorConfig {
    type: 'mug' | 'teacup' | 'coffee' | 'espresso' | 'tumbler' | 'wine' | 'beer';
    capacity: number;
    material: 'ceramic' | 'glass' | 'metal' | 'plastic' | 'porcelain';
    hasHandle: boolean;
    handleStyle: 'classic' | 'modern' | 'ornate' | 'minimal';
    hasSaucer: boolean;
    color: string;
    transparent?: boolean;
}
export declare class CupGenerator extends BaseObjectGenerator<CupParams> {
    protected defaultParams: CupParams;
    getDefaultConfig(): CupParams;
    generate(params?: Partial<CupParams>): THREE.Group;
    private createCupBody;
    private createStandardCup;
    private createWineGlass;
    private createBeerMug;
    private addHandle;
    private addSaucer;
    private getMaterial;
    protected validateParams(params: CupParams): void;
}
//# sourceMappingURL=CupGenerator.d.ts.map