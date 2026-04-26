/**
 * ReptileGenerator - Procedural reptile generation
 */
import { Group } from 'three';
import { CreatureBase, CreatureParameters } from './CreatureBase';
export type ReptileSpecies = 'snake' | 'lizard' | 'turtle' | 'crocodile' | 'gecko' | 'iguana';
export interface ReptileParameters extends CreatureParameters {
    scalePattern: 'smooth' | 'keeled' | 'granular';
    limbCount: number;
    hasShell: boolean;
    primaryColor: string;
}
export declare class ReptileGenerator extends CreatureBase<ReptileParameters> {
    constructor(seed?: number);
    protected getDefaultParameters(): ReptileParameters;
    generate(species: ReptileSpecies, params?: Partial<ReptileParameters>): Group;
    private applySpeciesDefaults;
    private generateBody;
    private createShellGeometry;
    private createElongatedGeometry;
}
//# sourceMappingURL=ReptileGenerator.d.ts.map