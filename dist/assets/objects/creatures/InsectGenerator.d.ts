/**
 * InsectGenerator - Procedural insect generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureParams } from './CreatureBase';
export interface InsectParameters extends CreatureParams {
    legCount: number;
    hasWings: boolean;
    bodySegments: number;
    primaryColor: string;
}
export type InsectSpecies = 'ant' | 'bee' | 'beetle' | 'butterfly' | 'spider' | 'grasshopper';
export declare class InsectGenerator extends CreatureBase {
    constructor(params?: Partial<InsectParameters>);
    getDefaultConfig(): InsectParameters;
    generate(species?: InsectSpecies, params?: Partial<InsectParameters>): Group;
    generateBodyCore(): Mesh;
    generateHead(): Mesh;
    generateLimbs(): Mesh[];
    generateAppendages(): Mesh[];
    applySkin(materials: any): any[];
    private applySpeciesDefaults;
    private generateBody;
    private generateWings;
    private generateAntennae;
}
//# sourceMappingURL=InsectGenerator.d.ts.map