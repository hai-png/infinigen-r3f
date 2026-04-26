/**
 * Floor Lamp Generator
 * Generates various floor-standing lamp designs
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface FloorLampParams {
    lampType: 'arc' | 'torchere' | 'tripod' | 'shelf' | 'tree' | 'standard';
    height: number;
    baseWidth: number;
    baseDepth: number;
    shadeHeight: number;
    shadeDiameter: number;
    style: 'modern' | 'traditional' | 'industrial' | 'scandinavian' | 'art-deco';
    material: 'metal' | 'wood' | 'brass' | 'chrome' | 'bamboo';
    color: string;
    shadeMaterial: 'fabric' | 'paper' | 'glass' | 'metal' | 'plastic';
    shadeColor: string;
    bulbType: 'edison' | 'standard' | 'globe';
    dimmable: boolean;
    adjustable: boolean;
    numShades: number;
}
export declare class FloorLamps extends BaseObjectGenerator<FloorLampParams> {
    constructor();
    getDefaultParams(): FloorLampParams;
    generate(params?: Partial<FloorLampParams>): THREE.Object3D;
    private createArcLamp;
    private createTorchiere;
    private createTripodLamp;
    private createShelfLamp;
    private createTreeLamp;
    private createStandardLamp;
    private createShade;
    private getShadeMaterial;
    private addLightSources;
    getRandomParams(): Partial<FloorLampParams>;
    validateParams(params: FloorLampParams): boolean;
}
//# sourceMappingURL=FloorLamps.d.ts.map