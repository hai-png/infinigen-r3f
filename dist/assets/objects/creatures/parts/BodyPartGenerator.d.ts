import { Mesh } from 'three';
export declare class BodyPartGenerator {
    private seed?;
    constructor(seed?: number | undefined);
    generateHead(size: number): Mesh;
    generateTorso(size: number): Mesh;
    generateLimb(type: string, size: number): Mesh;
}
//# sourceMappingURL=BodyPartGenerator.d.ts.map