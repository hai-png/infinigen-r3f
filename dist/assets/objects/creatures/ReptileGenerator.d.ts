/**
 * ReptileGenerator - Procedural reptile generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureParams } from './CreatureBase';
export interface ReptileParameters extends CreatureParams {
    scalePattern: 'smooth' | 'keeled' | 'granular';
    limbCount: number;
    hasShell: boolean;
    primaryColor: string;
}
export type ReptileSpecies = 'lizard' | 'snake' | 'turtle' | 'crocodile' | 'gecko';
export declare class ReptileGenerator extends CreatureBase {
    constructor(params?: Partial<ReptileParameters>);
    getDefaultConfig(): ReptileParameters;
    generate(species?: ReptileSpecies, params?: Partial<ReptileParameters>): Group;
    generateBodyCore(): Mesh;
    generateHead(): Mesh;
    generateLimbs(): Mesh[];
    generateAppendages(): Mesh[];
    applySkin(materials: any): any[];
    private applySpeciesDefaults;
    private generateBody;
    private createShellGeometry;
}
//# sourceMappingURL=ReptileGenerator.d.ts.map