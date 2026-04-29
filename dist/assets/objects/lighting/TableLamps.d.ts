/**
 * Table Lamp Generator
 * Generates various table-top lamp designs
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface TableLampParams extends BaseGeneratorConfig {
    lampType: 'desk' | 'bedside' | 'banker' | 'piano' | 'buffet' | 'accent';
    baseWidth: number;
    baseDepth: number;
    height: number;
    shadeDiameter: number;
    shadeHeight: number;
    style: 'modern' | 'traditional' | 'industrial' | 'art-deco' | 'minimalist' | 'rustic';
    baseMaterial: 'metal' | 'wood' | 'ceramic' | 'glass' | 'stone' | 'brass';
    baseColor: string;
    shadeMaterial: 'fabric' | 'paper' | 'glass' | 'metal' | 'plastic';
    shadeColor: string;
    bulbVisible: boolean;
    dimmable: boolean;
    adjustable: boolean;
    switchType: 'pull-chain' | 'rotary' | 'touch' | 'inline';
}
export declare class TableLamps extends BaseObjectGenerator<TableLampParams> {
    constructor();
    getDefaultConfig(): TableLampParams;
    generate(params?: Partial<TableLampParams>): THREE.Object3D;
    private createDeskLamp;
    private createBedsideLamp;
    private createBankerLamp;
    private createPianoLamp;
    private createBuffetLamp;
    private createAccentLamp;
    private getBaseGeometry;
    private createShade;
    private getShadeMaterial;
    private addLightSource;
    private addSwitchIndicator;
    getRandomParams(): Partial<TableLampParams>;
    validateParams(params: TableLampParams): boolean;
}
//# sourceMappingURL=TableLamps.d.ts.map