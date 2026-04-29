/**
 * DiningTable - Procedural dining table generation
 *
 * Generates various dining table styles with configurable tops, legs,
 * and extension mechanisms.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig, ObjectStylePreset } from '../utils/BaseObjectGenerator';
export interface DiningTableParams extends BaseGeneratorConfig {
    width: number;
    depth: number;
    height: number;
    style: ObjectStylePreset;
    topShape: 'rectangular' | 'round' | 'oval' | 'square';
    topThickness: number;
    topMaterial: 'wood' | 'glass' | 'stone' | 'metal';
    baseType: 'four_legs' | 'pedestal' | 'trestle' | 'sled';
    legStyle: 'straight' | 'tapered' | 'cabriole' | 'hairpin';
    extendable: boolean;
    extensionLeaves: number;
    apron: boolean;
    apronHeight: number;
    variationSeed?: number;
}
export declare class DiningTable extends BaseObjectGenerator<DiningTableParams> {
    static readonly GENERATOR_ID = "dining_table";
    getDefaultConfig(): DiningTableParams;
    generate(params?: Partial<DiningTableParams>): THREE.Object3D;
    private createTop;
    private getTopGeometry;
    private createRectangularTop;
    private createRoundTop;
    private createOvalTop;
    private createSquareTop;
    private getTopMaterial;
    private createBase;
    private addFourLegs;
    private addPedestalBase;
    private addTrestleBase;
    private addSledBase;
    private createLegGeometry;
    private createApron;
    private createExtensionMechanism;
    private getLegMaterial;
    private getWoodColor;
    private getStoneColor;
    getVariationCount(): number;
    register(): void;
}
export default DiningTable;
//# sourceMappingURL=DiningTable.d.ts.map