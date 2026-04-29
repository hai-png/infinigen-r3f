/**
 * Decal Application System - Logo placement, labels, projected decals
 */
import { Texture, Color, Vector3 } from 'three';
export interface DecalParams {
    type: 'logo' | 'label' | 'warning' | 'custom';
    color: Color;
    opacity: number;
    scale: Vector3;
    rotation: number;
}
export interface DecalPlacement {
    position: Vector3;
    normal: Vector3;
    rotation: number;
    scale: number;
}
export declare class DecalSystem {
    generateDecal(params: DecalParams, seed: number): Texture;
    private drawLogo;
    private drawLabel;
    private drawWarning;
    calculatePlacement(surfaceNormal: Vector3, offset: number): DecalPlacement;
    getDefaultParams(): DecalParams;
}
//# sourceMappingURL=DecalSystem.d.ts.map