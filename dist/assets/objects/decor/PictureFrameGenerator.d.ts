/**
 * PictureFrameGenerator - Procedural picture frame generation
 * Generates various frame styles with mats and glass
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
export type FrameStyle = 'modern' | 'classic' | 'ornate' | 'minimal' | 'rustic' | 'gallery';
export type FrameMaterial = 'wood' | 'metal' | 'plastic' | 'composite';
export type Orientation = 'portrait' | 'landscape' | 'square';
export interface PictureFrameConfig {
    style: FrameStyle;
    materialType: FrameMaterial;
    orientation: Orientation;
    width: number;
    height: number;
    frameWidth: number;
    hasMat: boolean;
    matColor: number;
    hasGlass: boolean;
    seed?: number;
}
export declare class PictureFrameGenerator extends BaseObjectGenerator<PictureFrameConfig> {
    protected readonly defaultParams: PictureFrameConfig;
    generate(params?: Partial<PictureFrameConfig>): Group;
    private createBacking;
    private createFrame;
    private addOrnateDetails;
    private createMat;
    private createGlass;
    private createHangingHardware;
    private getFrameMaterial;
    getVariations(): Params[];
}
//# sourceMappingURL=PictureFrameGenerator.d.ts.map