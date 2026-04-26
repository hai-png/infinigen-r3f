/**
 * Ceiling Light Fixtures Generator
 * Generates various ceiling-mounted lighting fixtures
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface CeilingLightParams {
    fixtureType: 'flush' | 'semi-flush' | 'pendant' | 'chandelier' | 'track' | 'recessed';
    width: number;
    depth: number;
    height: number;
    numLights: number;
    style: 'modern' | 'traditional' | 'industrial' | 'crystal' | 'farmhouse';
    material: 'metal' | 'glass' | 'crystal' | 'wood' | 'fabric';
    color: string;
    lightColor: string;
    intensity: number;
    dimmable: boolean;
    shadeShape: 'dome' | 'drum' | 'globe' | 'cylinder' | 'cone';
    chainLength: number;
}
export declare class CeilingLights extends BaseObjectGenerator<CeilingLightParams> {
    constructor();
    getDefaultParams(): CeilingLightParams;
    generate(params?: Partial<CeilingLightParams>): THREE.Object3D;
    private createFlushMount;
    private createSemiFlushMount;
    private createPendant;
    private createChandelier;
    private createTrackLighting;
    private createRecessed;
    private createShadeGeometry;
    private getShadeMaterial;
    private addCrystalAccents;
    private addCrystalDrop;
    private addCrystalCluster;
    private addLightSource;
    getRandomParams(): Partial<CeilingLightParams>;
    validateParams(params: CeilingLightParams): boolean;
}
//# sourceMappingURL=CeilingLights.d.ts.map