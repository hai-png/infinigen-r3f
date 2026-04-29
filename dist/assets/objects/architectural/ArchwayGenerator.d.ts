import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface ArchwayParams extends BaseGeneratorConfig {
    type: 'round' | 'pointed' | 'segmental' | 'elliptical' | 'parabolic' | 'trefoil';
    width: number;
    height: number;
    depth: number;
    style: 'classical' | 'gothic' | 'modern' | 'islamic' | 'romanesque';
    material: 'stone' | 'brick' | 'concrete' | 'wood' | 'plaster';
    hasKeystone: boolean;
    hasColumns: boolean;
    columnStyle: 'doric' | 'ionic' | 'corinthian' | 'simple';
    decorativeMolding: boolean;
    color: string;
}
export declare class ArchwayGenerator extends BaseObjectGenerator<ArchwayParams> {
    protected defaultParams: ArchwayParams;
    getDefaultConfig(): ArchwayParams;
    generate(params?: Partial<ArchwayParams>): THREE.Group;
    private createArch;
    private createRoundArch;
    private createPointedArch;
    private createSegmentalArch;
    private createEllipticalArch;
    private createParabolicArch;
    private createTrefoilArch;
    private addKeystone;
    private addColumns;
    private createColumn;
    private addMolding;
    private getMaterial;
    protected validateParams(params: ArchwayParams): void;
}
//# sourceMappingURL=ArchwayGenerator.d.ts.map