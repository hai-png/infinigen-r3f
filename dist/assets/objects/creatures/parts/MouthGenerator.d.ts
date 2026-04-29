import { Mesh } from 'three';
export declare class MouthGenerator {
    private seed?;
    constructor(seed?: number | undefined);
    generate(type: string, size: number): Mesh;
}
export declare const BeakGenerator: typeof MouthGenerator;
//# sourceMappingURL=MouthGenerator.d.ts.map