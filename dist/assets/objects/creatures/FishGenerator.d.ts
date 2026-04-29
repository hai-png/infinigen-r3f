/**
 * FishGenerator - Procedural fish generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureParams } from './CreatureBase';
export interface FishParameters extends CreatureParams {
    tailType: 'forked' | 'rounded' | 'square';
    scaleType: 'smooth' | 'cycloid' | 'ctenoid';
    hasFins: boolean;
    primaryColor: string;
    secondaryColor: string;
}
export type FishSpecies = 'goldfish' | 'tuna' | 'clownfish' | 'anglerfish' | 'seahorse';
export declare class FishGenerator extends CreatureBase {
    constructor(params?: Partial<FishParameters>);
    getDefaultConfig(): FishParameters;
    generate(species?: FishSpecies, params?: Partial<FishParameters>): Group;
    generateBodyCore(): Mesh;
    generateHead(): Mesh;
    generateLimbs(): Mesh[];
    generateAppendages(): Mesh[];
    applySkin(materials: any): any[];
    private applySpeciesDefaults;
    private generateBody;
    private generateFins;
    private createTriangleGeometry;
}
//# sourceMappingURL=FishGenerator.d.ts.map