/**
 * WallDecor - Procedural generation of wall decorations
 *
 * Generates: Picture frames, mirrors, wall art, clocks, shelves
 * Multiple styles and mounting options
 */
import { Group, Mesh } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
import { BBox } from '../../../core/util/math/transforms';
export interface WallDecorParams {
    decorType: 'picture' | 'mirror' | 'art' | 'clock' | 'shelf';
    style: 'modern' | 'traditional' | 'minimal' | 'industrial' | 'bohemian';
    frameMaterial: 'wood' | 'metal' | 'plastic' | 'none';
    width: number;
    height: number;
    shape: 'rectangle' | 'square' | 'circle' | 'oval' | 'abstract';
    hasGlass: boolean;
    hangingStyle: 'wire' | 'cleat' | 'bracket' | 'adhesive';
}
export declare class WallDecor extends BaseObjectGenerator<WallDecorParams> {
    protected defaultParams: WallDecorParams;
    constructor();
    protected validateParams(params: Partial<WallDecorParams>): Partial<WallDecorParams>;
    generate(params?: Partial<WallDecorParams>): Group;
    private createContent;
    private createFrame;
    private createGlass;
    private createHangingHardware;
    private createAbstractShape;
    private createClockFace;
    private createArtworkMaterial;
    private createPicturePlaceholder;
    private getFrameMaterial;
    getBoundingBox(params: WallDecorParams): BBox;
    getCollisionMesh(params: WallDecorParams): Mesh;
    getRandomParams(): WallDecorParams;
}
//# sourceMappingURL=WallDecor.d.ts.map