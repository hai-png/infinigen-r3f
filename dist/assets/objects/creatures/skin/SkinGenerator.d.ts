import { MeshStandardMaterial } from 'three';
export declare class SkinGenerator {
    private seed?;
    constructor(seed?: number | undefined);
    generateFur(color: string, length: number): MeshStandardMaterial;
    generateScales(color: string, pattern: string): MeshStandardMaterial;
    generateFeathers(color: string, pattern: string): MeshStandardMaterial;
    generateSmoothSkin(color: string): MeshStandardMaterial;
}
//# sourceMappingURL=SkinGenerator.d.ts.map