/**
 * CoffeeTable - Procedural coffee table generation
 */
import * as THREE from 'three';
import { BaseObjectGenerator, ObjectStylePreset } from '../utils/BaseObjectGenerator';
export interface CoffeeTableParams {
    width: number;
    depth: number;
    height: number;
    style: ObjectStylePreset;
    topShape: 'rectangular' | 'round' | 'oval' | 'organic';
    topMaterial: 'wood' | 'glass' | 'stone' | 'marble';
    baseType: 'four_legs' | 'pedestal' | 'nested' | 'sculptural';
    hasShelf: boolean;
    variationSeed?: number;
}
export declare class CoffeeTable extends BaseObjectGenerator<CoffeeTableParams> {
    static readonly GENERATOR_ID = "coffee_table";
    getDefaultParams(): CoffeeTableParams;
    generate(params?: Partial<CoffeeTableParams>): THREE.Object3D;
    private createTop;
    private createBase;
    private createShelf;
    private getMaterialColor;
    getVariationCount(): number;
    register(): void;
}
export default CoffeeTable;
//# sourceMappingURL=CoffeeTable.d.ts.map