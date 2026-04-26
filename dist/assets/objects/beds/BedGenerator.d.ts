/**
 * BedGenerator - Procedural generation of beds and bedding
 *
 * Generates: Bed frames, headboards, mattresses, pillows, comforters
 * Multiple styles from modern platform to traditional four-poster
 */
import { Group, Mesh } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { BBox } from '../../../../core/util/math/transforms';
export interface BedParams {
    size: 'twin' | 'full' | 'queen' | 'king' | 'cal-king';
    style: 'modern' | 'traditional' | 'minimal' | 'canopy' | 'storage';
    frameMaterial: 'wood' | 'metal' | 'upholstered' | 'leather';
    hasHeadboard: boolean;
    hasFootboard: boolean;
    hasStorage: boolean;
    mattressThickness: number;
    pillowCount: number;
    beddingStyle: 'duvet' | 'comforter' | 'quilt' | 'sheets-only';
}
export declare class BedGenerator extends BaseObjectGenerator<BedParams> {
    protected defaultParams: BedParams;
    constructor();
    protected validateParams(params: Partial<BedParams>): Partial<BedParams>;
    generate(params?: Partial<BedParams>): Group;
    private getBedDimensions;
    private createFrame;
    private createHeadboard;
    private createFootboard;
    private createMattress;
    private createBedding;
    private createPillows;
    private createStorageDrawers;
    private createCanopy;
    private getFrameMaterial;
    private getBeddingMaterial;
    getBoundingBox(params: BedParams): BBox;
    getCollisionMesh(params: BedParams): Mesh;
    getRandomParams(): BedParams;
}
//# sourceMappingURL=BedGenerator.d.ts.map