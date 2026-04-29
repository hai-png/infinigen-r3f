/**
 * AmphibianGenerator - Procedural amphibian generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureParams } from './CreatureBase';
export type AmphibianSpecies = 'frog' | 'salamander' | 'newt' | 'toad';
export interface AmphibianParameters extends CreatureParams {
    skinTexture: 'smooth' | 'warty' | 'ridged';
    hasTail: boolean;
    webbedFeet: boolean;
    primaryColor: string;
}
export declare class AmphibianGenerator extends CreatureBase {
    constructor(params?: Partial<AmphibianParameters>);
    getDefaultConfig(): AmphibianParameters;
    generate(species?: AmphibianSpecies, params?: Partial<AmphibianParameters>): Group;
    generateBodyCore(): Mesh;
    generateHead(): Mesh;
    generateLimbs(): Mesh[];
    generateAppendages(): Mesh[];
    applySkin(materials: any): any[];
    private applySpeciesDefaults;
    private generateBody;
    private generateTail;
}
//# sourceMappingURL=AmphibianGenerator.d.ts.map