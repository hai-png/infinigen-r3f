/**
 * MirrorGenerator - Procedural mirror generation with various frame styles
 * Generates wall mirrors, standing mirrors, decorative mirrors
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export type MirrorStyle = 'wall' | 'standing' | 'vanity' | 'decorative' | 'round' | 'oval' | 'sunburst';
export type FrameStyle = 'simple' | 'ornate' | 'modern' | 'vintage' | 'rustic' | 'gilded';
export type MirrorShape = 'rectangular' | 'square' | 'round' | 'oval' | 'arched' | 'custom';
export interface MirrorConfig {
    style: MirrorStyle;
    frameStyle: FrameStyle;
    shape: MirrorShape;
    width: number;
    height: number;
    frameWidth: number;
    frameThickness: number;
    hasStand: boolean;
    seed?: number;
}
export declare class MirrorGenerator extends BaseObjectGenerator<MirrorConfig> {
    protected readonly defaultParams: MirrorConfig;
    private noise;
    constructor();
    getDefaultConfig(): MirrorConfig;
    generate(params?: Partial<MirrorConfig>): Group;
    private createMirrorGlass;
    private createCircularGlass;
    private createOvalGlass;
    private createArchedGlass;
    private createFrame;
    private createRectangularFrame;
    private createRoundFrame;
    private createOvalFrame;
    private addOrnateDetails;
    private addRoundOrnaments;
    private createStand;
    private getFrameMaterial;
    getVariations(): MirrorConfig[];
}
//# sourceMappingURL=MirrorGenerator.d.ts.map