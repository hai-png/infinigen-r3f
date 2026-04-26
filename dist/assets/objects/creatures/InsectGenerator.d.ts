/**
 * InsectGenerator - Procedural insect generation
 * Generates: ants, bees, butterflies, beetles, dragonflies, spiders
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureParams } from './CreatureBase';
export interface InsectParams extends CreatureParams {
    insectType: 'ant' | 'bee' | 'butterfly' | 'beetle' | 'dragonfly' | 'spider';
    wingCount: number;
    legCount: number;
    hasAntennae: boolean;
    exoskeletonMaterial: string;
}
export declare class InsectGenerator extends CreatureBase {
    private insectParams;
    private bodyPartGen;
    private wingGen;
    private legGen;
    private antennaGen;
    private eyeGen;
    constructor(params?: Partial<InsectParams>);
    generate(): Group;
    protected generateBodyCore(): Mesh;
    protected generateHead(): Mesh;
    protected generateLimbs(): Mesh[];
    protected generateAppendages(): Mesh[];
    protected applySkin(materials: any[]): any[];
    private generateAbdomen;
    private getThoraxSize;
    private getHeadSize;
    private getAbdomenSize;
    private getSizeMultiplier;
    private applyMaterials;
}
//# sourceMappingURL=InsectGenerator.d.ts.map