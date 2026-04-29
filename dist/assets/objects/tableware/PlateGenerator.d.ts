import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface PlateParams extends BaseGeneratorConfig {
    type: 'dinner' | 'salad' | 'dessert' | 'soup' | 'appetizer';
    shape: 'round' | 'square' | 'oval' | 'rectangular';
    diameter: number;
    rimWidth: number;
    depth: number;
    material: 'ceramic' | 'porcelain' | 'stoneware' | 'glass' | 'melamine';
    pattern: 'plain' | 'rim' | 'floral' | 'geometric' | 'striped';
    color: string;
    rimColor?: string;
}
export declare class PlateGenerator extends BaseObjectGenerator<PlateParams> {
    protected defaultParams: PlateParams;
    getDefaultConfig(): PlateParams;
    generate(params?: Partial<PlateParams>): THREE.Group;
    private createRoundPlate;
    private createSquarePlate;
    private createOvalPlate;
    private createRectangularPlate;
    private addPattern;
    private getMaterial;
    private getRimMaterial;
    protected validateParams(params: PlateParams): void;
}
//# sourceMappingURL=PlateGenerator.d.ts.map