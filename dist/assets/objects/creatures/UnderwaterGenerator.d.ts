/**
 * UnderwaterGenerator - Procedural underwater creature generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureParams } from './CreatureBase';
export interface MarineParameters extends CreatureParams {
    hasShell: boolean;
    swimMode: 'propulsion' | 'drift' | 'jet';
    depthRange: 'shallow' | 'mid' | 'deep';
    primaryColor: string;
    secondaryColor: string;
}
export type MarineSpecies = 'jellyfish' | 'crab' | 'starfish' | 'octopus' | 'whale' | 'dolphin';
export declare class UnderwaterGenerator extends CreatureBase {
    constructor(params?: Partial<MarineParameters>);
    getDefaultConfig(): MarineParameters;
    generate(species?: MarineSpecies, params?: Partial<MarineParameters>): Group;
    generateBodyCore(): Mesh;
    generateHead(): Mesh;
    generateLimbs(): Mesh[];
    generateAppendages(): Mesh[];
    applySkin(materials: any): any[];
    private applySpeciesDefaults;
    private generateBody;
    private generateShell;
}
//# sourceMappingURL=UnderwaterGenerator.d.ts.map