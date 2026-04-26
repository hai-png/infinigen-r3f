/**
 * BirdGenerator - Procedural bird generation
 * Generates various bird species with configurable wings, beaks, feathers, and colors
 */
import { Group } from 'three';
import { CreatureBase, CreatureParameters } from './CreatureBase';
export interface BirdParameters extends CreatureParameters {
    wingSpan: number;
    beakType: 'hooked' | 'conical' | 'probing' | 'filter';
    featherPattern: 'solid' | 'striped' | 'spotted' | 'iridescent';
    flightStyle: 'soaring' | 'flapping' | 'hovering' | 'gliding';
    tailShape: 'forked' | 'rounded' | 'square' | 'pointed';
    primaryColor: string;
    secondaryColor: string;
}
export type BirdSpecies = 'eagle' | 'sparrow' | 'parrot' | 'owl' | 'hummingbird' | 'pelican' | 'flamingo' | 'penguin';
export declare class BirdGenerator extends CreatureBase<BirdParameters> {
    private wingGenerator;
    private legGenerator;
    private beakGenerator;
    private eyeGenerator;
    constructor(seed?: number);
    protected getDefaultParameters(): BirdParameters;
    generate(species: BirdSpecies, params?: Partial<BirdParameters>): Group;
    private applySpeciesDefaults;
    private generateBody;
    private generateTail;
    private createFeatherMaterial;
    private createTailGeometry;
    private hashString;
}
//# sourceMappingURL=BirdGenerator.d.ts.map