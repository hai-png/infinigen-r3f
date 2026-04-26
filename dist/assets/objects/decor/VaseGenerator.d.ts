/**
 * Vase Generator
 *
 * Procedural vase generation with various shapes,
 * materials, patterns, and decorative elements.
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
export interface VaseConfig {
    shape: 'cylinder' | 'sphere' | 'cone' | 'hourglass' | 'amphora' | 'bud' | 'flute';
    material: 'ceramic' | 'glass' | 'crystal' | 'metal' | 'clay' | 'porcelain';
    color: string;
    height: number;
    radius: number;
    neckRadius: number;
    baseRadius: number;
    hasHandles: boolean;
    handleStyle: 'loop' | 'angular' | 'organic' | 'rope';
    handleCount: 0 | 1 | 2 | 3 | 4;
    pattern: 'none' | 'stripes' | 'checkered' | 'floral' | 'geometric' | 'swirls';
    patternColor: string;
    rimStyle: 'flat' | 'rounded' | 'flared' | 'notched';
    baseStyle: 'flat' | 'rounded' | 'pedestal' | 'wide';
    surfaceFinish: 'matte' | 'glossy' | 'textured' | 'cracked';
    seed?: number;
}
export declare class VaseGenerator extends BaseObjectGenerator<VaseConfig> {
    protected readonly defaultParams: VaseConfig;
    generate(params?: Partial<VaseConfig>): THREE.Group;
    private createVaseBody;
    private createCylinderVaseGeometry;
    private createSphereVaseGeometry;
    private createConeVaseGeometry;
    private createHourglassVaseGeometry;
    private createAmphoraVaseGeometry;
    private createBudVaseGeometry;
    private createFluteVaseGeometry;
    private getVaseMaterial;
    private createHandles;
    private createSingleHandle;
    private createLoopHandleShape;
    private createAngularHandleShape;
    private createOrganicHandleShape;
    private createRopeHandleShape;
    private createRim;
    private createNotchedRimGeometry;
    private createBase;
    private applyPattern;
    getVariations(): VaseConfig[];
}
//# sourceMappingURL=VaseGenerator.d.ts.map