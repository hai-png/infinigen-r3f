/**
 * UnderwaterGenerator - Procedural marine life generation
 */
import { Group } from 'three';
import { CreatureBase, CreatureParameters } from './CreatureBase';
export type MarineSpecies = 'jellyfish' | 'octopus' | 'anemone' | 'coral' | 'squid' | 'starfish';
export interface MarineParameters extends CreatureParameters {
    tentacleCount: number;
    bioluminescent: boolean;
    primaryColor: string;
}
export declare class UnderwaterGenerator extends CreatureBase<MarineParameters> {
    protected getDefaultParameters(): MarineParameters;
    generate(species: MarineSpecies, params?: Partial<MarineParameters>): Group;
    private applySpeciesDefaults;
    private generateJellyfish;
    private generateOctopus;
    private generateAnemone;
    private generateCoral;
    private generateSquid;
    private generateStarfish;
}
//# sourceMappingURL=UnderwaterGenerator.d.ts.map