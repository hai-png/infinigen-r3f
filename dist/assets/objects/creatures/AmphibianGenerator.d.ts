/**
 * AmphibianGenerator - Procedural amphibian generation
 */
import { Group } from 'three';
import { CreatureBase, CreatureParameters } from './CreatureBase';
export type AmphibianSpecies = 'frog' | 'salamander' | 'newt' | 'toad';
export interface AmphibianParameters extends CreatureParameters {
    skinTexture: 'smooth' | 'warty' | 'ridged';
    hasTail: boolean;
    webbedFeet: boolean;
    primaryColor: string;
}
export declare class AmphibianGenerator extends CreatureBase<AmphibianParameters> {
    protected getDefaultParameters(): AmphibianParameters;
    generate(species: AmphibianSpecies, params?: Partial<AmphibianParameters>): Group;
    private applySpeciesDefaults;
    private generateBody;
    private generateTail;
}
//# sourceMappingURL=AmphibianGenerator.d.ts.map