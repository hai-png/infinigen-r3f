/**
 * BirdGenerator - Procedural bird generation
 * Generates various bird species with configurable wings, beaks, feathers, and colors
 */
import { Group, Mesh, Material } from 'three';
import { CreatureBase, CreatureParams } from './CreatureBase';
export interface BirdParameters extends CreatureParams {
    wingSpan: number;
    beakType: 'hooked' | 'conical' | 'probing' | 'filter';
    featherPattern: 'solid' | 'striped' | 'spotted' | 'iridescent';
    flightStyle: 'soaring' | 'flapping' | 'hovering' | 'gliding';
    tailShape: 'forked' | 'rounded' | 'square' | 'pointed';
    primaryColor: string;
    secondaryColor: string;
}
export type BirdSpecies = 'eagle' | 'sparrow' | 'parrot' | 'owl' | 'hummingbird' | 'pelican' | 'flamingo' | 'penguin';
export declare class BirdGenerator extends CreatureBase {
    constructor(seed?: number);
    getDefaultConfig(): BirdParameters;
    generate(species?: BirdSpecies, params?: Partial<BirdParameters>): Group;
    generateBodyCore(): Mesh;
    generateLimbs(): Mesh[];
    generateAppendages(): Mesh[];
    applySkin(materials: Material[]): Material[];
    private applySpeciesDefaults;
    private generateBody;
}
//# sourceMappingURL=BirdGenerator.d.ts.map