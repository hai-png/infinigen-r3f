/**
 * MammalGenerator - Procedural mammal generation
 * Generates various mammals with fur, body proportions, and limb structures
 */
import { Group } from 'three';
import { CreatureBase, CreatureParameters } from './CreatureBase';
export interface MammalParameters extends CreatureParameters {
    furLength: number;
    furPattern: 'solid' | 'striped' | 'spotted' | 'gradient';
    earShape: 'rounded' | 'pointed' | 'floppy' | 'tufted';
    tailType: 'bushy' | 'thin' | 'prehensile' | 'none';
    legType: 'digitigrade' | 'plantigrade' | 'unguligrade';
    primaryColor: string;
    secondaryColor: string;
}
export type MammalSpecies = 'dog' | 'cat' | 'deer' | 'bear' | 'rabbit' | 'fox' | 'elephant' | 'giraffe';
export declare class MammalGenerator extends CreatureBase<MammalParameters> {
    private legGenerator;
    private tailGenerator;
    private eyeGenerator;
    private mouthGenerator;
    constructor(seed?: number);
    protected getDefaultParameters(): MammalParameters;
    generate(species: MammalSpecies, params?: Partial<MammalParameters>): Group;
    private applySpeciesDefaults;
    private generateBody;
    private generateHead;
    private generateEars;
    private createFurMaterial;
    private createEarGeometry;
}
//# sourceMappingURL=MammalGenerator.d.ts.map