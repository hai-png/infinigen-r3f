/**
 * FishGenerator - Procedural fish generation
 */
import { Group } from 'three';
import { CreatureBase, CreatureParameters } from './CreatureBase';
export type FishSpecies = 'tropical' | 'shark' | 'goldfish' | 'bass' | 'clownfish' | 'stingray';
export interface FishParameters extends CreatureParameters {
    finType: 'rounded' | 'pointed' | 'filamentous';
    scalePattern: 'cycloid' | 'ctenoid' | 'ganoid' | 'placoid';
    bodyShape: 'fusiform' | 'depressed' | 'compressed' | 'anguilliform';
    primaryColor: string;
}
export declare class FishGenerator extends CreatureBase<FishParameters> {
    protected getDefaultParameters(): FishParameters;
    generate(species: FishSpecies, params?: Partial<FishParameters>): Group;
    private applySpeciesDefaults;
    private generateBody;
    private generateFins;
    private createElongatedGeometry;
    private createFinGeometry;
}
//# sourceMappingURL=FishGenerator.d.ts.map