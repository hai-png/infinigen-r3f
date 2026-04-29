/**
 * MammalGenerator - Procedural mammal generation
 * Generates various mammals with fur, body proportions, and limb structures
 */
import { Group, Mesh, Material } from 'three';
import { CreatureBase, CreatureParams } from './CreatureBase';
export interface MammalParameters extends CreatureParams {
    furLength: number;
    furPattern: 'solid' | 'striped' | 'spotted' | 'gradient';
    earShape: 'rounded' | 'pointed' | 'floppy' | 'tufted';
    tailType: 'bushy' | 'thin' | 'prehensile' | 'none';
    legType: 'digitigrade' | 'plantigrade' | 'unguligrade';
    primaryColor: string;
    secondaryColor: string;
}
export type MammalSpecies = 'dog' | 'cat' | 'deer' | 'bear' | 'rabbit' | 'fox' | 'elephant' | 'giraffe';
export declare class MammalGenerator extends CreatureBase {
    private _seed;
    constructor(seed?: number);
    getDefaultConfig(): MammalParameters;
    generate(species?: MammalSpecies, params?: Partial<MammalParameters>): Group;
    generateBodyCore(): Mesh;
    generateLimbs(): Mesh[];
    generateAppendages(): Mesh[];
    applySkin(materials: Material[]): Material[];
    private applySpeciesDefaults;
    private generateBody;
    private generateTail;
    private generateEars;
    private createFurMaterial;
}
//# sourceMappingURL=MammalGenerator.d.ts.map