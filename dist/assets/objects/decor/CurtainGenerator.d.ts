/**
 * CurtainGenerator - Procedural curtain generation with various styles
 * Generates drapes, sheers, valances, and different curtain types
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export type CurtainStyle = 'drapes' | 'sheer' | 'valance' | 'cafe' | 'pencil' | 'grommet' | 'rod_pocket';
export type CurtainMaterialType = 'cotton' | 'linen' | 'silk' | 'velvet' | 'polyester' | 'lace';
export type CurtainPattern = 'solid' | 'striped' | 'floral' | 'geometric' | 'damask';
export interface CurtainConfig {
    style: CurtainStyle;
    materialType: CurtainMaterialType;
    pattern: CurtainPattern;
    width: number;
    height: number;
    folds: number;
    hasValance: boolean;
    hasTieback: boolean;
    seed?: number;
}
export declare class CurtainGenerator extends BaseObjectGenerator<CurtainConfig> {
    protected readonly defaultParams: CurtainConfig;
    private noise;
    constructor();
    getDefaultConfig(): CurtainConfig;
    generate(params?: Partial<CurtainConfig>): Group;
    private createCurtainPanels;
    private createFoldedCurtainGeometry;
    private createCurtainRod;
    private createValance;
    private createSwagValanceGeometry;
    private createTiebacks;
    private getMaterialByType;
    getVariations(count?: number, baseConfig?: Partial<CurtainConfig>): THREE.Object3D[];
}
//# sourceMappingURL=CurtainGenerator.d.ts.map