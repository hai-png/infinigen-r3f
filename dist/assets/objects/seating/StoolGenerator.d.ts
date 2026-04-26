/**
 * StoolGenerator - Procedural stool and bench generation
 *
 * Generates various stool types including bar stools, dining stools,
 * benches, and ottomans with parametric controls.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, ObjectStylePreset } from '../utils/BaseObjectGenerator';
export interface StoolParams {
    width: number;
    depth: number;
    height: number;
    seatHeight: number;
    style: ObjectStylePreset;
    seatShape: 'round' | 'square' | 'rectangular' | 'saddle';
    seatThickness: number;
    upholstered: boolean;
    legType: 'four' | 'three' | 'single' | 'sled';
    legStyle: 'straight' | 'tapered' | 'curved' | 'hairpin';
    legMaterial: 'wood' | 'metal' | 'plastic';
    backrest: boolean;
    backrestHeight: number;
    footrest: boolean;
    swivel: boolean;
    variationSeed?: number;
}
export declare class StoolGenerator extends BaseObjectGenerator<StoolParams> {
    static readonly GENERATOR_ID = "stool_generator";
    constructor();
    getDefaultParams(): StoolParams;
    generate(params?: Partial<StoolParams>): THREE.Object3D;
    private createSeat;
    private getSeatGeometry;
    private createRoundSeat;
    private createSquareSeat;
    private createRectangularSeat;
    private createSaddleSeat;
    private createLegs;
    private addFourLegs;
    private addThreeLegs;
    private addSingleLeg;
    private addSledBase;
    private createSingleLegGeometry;
    private createBackrest;
    private createFootrest;
    private createSwivelMechanism;
    private getSeatMaterial;
    private getLegMaterial;
    private getWoodColor;
    private getRandomColor;
    getVariationCount(): number;
    register(): void;
}
export default StoolGenerator;
//# sourceMappingURL=StoolGenerator.d.ts.map