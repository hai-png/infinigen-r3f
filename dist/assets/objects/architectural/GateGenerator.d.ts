import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface GateParams extends BaseGeneratorConfig {
    type: 'swing' | 'slide' | 'double' | 'ornate' | 'farm' | 'picket';
    width: number;
    height: number;
    material: 'wood' | 'metal' | 'vinyl' | 'wrought_iron';
    style: 'modern' | 'traditional' | 'rustic' | 'victorian' | 'industrial';
    hasPosts: boolean;
    postHeight: number;
    hasLatch: boolean;
    latchType: 'ring' | 'bar' | 'lock' | 'chain';
    hingeStyle: 'visible' | 'hidden' | 'decorative';
    color: string;
    decorativeElements: boolean;
}
export declare class GateGenerator extends BaseObjectGenerator<GateParams> {
    protected defaultParams: GateParams;
    getDefaultConfig(): GateParams;
    generate(params?: Partial<GateParams>): THREE.Group;
    private createSwingGate;
    private createSlidingGate;
    private createDoubleGate;
    private createOrnateGate;
    private createFarmGate;
    private createPicketGate;
    private addPosts;
    private addLatch;
    private addHinges;
    private addDecorativeElements;
    private getMaterial;
    protected validateParams(params: GateParams): void;
}
//# sourceMappingURL=GateGenerator.d.ts.map