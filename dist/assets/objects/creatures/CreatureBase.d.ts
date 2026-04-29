/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, and animation hooks
 */
import { Group, Mesh, Material, SphereGeometry, BoxGeometry, CylinderGeometry, MeshStandardMaterial, ConeGeometry, CapsuleGeometry } from 'three';
import { SeededRandom } from '../../../core/util/math/index';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export declare enum CreatureType {
    MAMMAL = "mammal",
    BIRD = "bird",
    REPTILE = "reptile",
    AMPHIBIAN = "amphibian",
    FISH = "fish",
    INSECT = "insect",
    INVERTEBRATE = "invertebrate"
}
export interface CreatureParams extends BaseGeneratorConfig {
    seed: number;
    species: string;
    size: number;
    age: 'juvenile' | 'adult' | 'elder';
    gender: 'male' | 'female' | 'neutral';
    health: number;
    biome: string;
    creatureType?: CreatureType;
}
export type CreatureParameters = CreatureParams;
export declare abstract class CreatureBase extends BaseObjectGenerator<CreatureParams> {
    protected params: CreatureParams;
    protected rng: SeededRandom;
    constructor(params?: Partial<CreatureParams>);
    getDefaultConfig(): CreatureParams;
    generate(): Group;
    protected createEllipsoidGeometry(x: number, y: number, z: number): SphereGeometry;
    protected createSphereGeometry(radius: number): SphereGeometry;
    protected createBoxGeometry(width: number, height: number, depth: number): BoxGeometry;
    protected createCylinderGeometry(radiusTop: number, radiusBottom: number, height: number): CylinderGeometry;
    protected createConeGeometry(radius: number, height: number): ConeGeometry;
    protected createCapsuleGeometry(radius: number, length: number): CapsuleGeometry;
    protected createStandardMaterial(params?: any): MeshStandardMaterial;
    protected createFinGeometry(shape: string, params?: any): BoxGeometry;
    protected createEarGeometry(params?: any): BoxGeometry;
    protected createShellGeometry(params?: any): BoxGeometry;
    protected get seed(): number;
    protected mergeParameters(base: any, override: any): any;
    abstract generateBodyCore(): Mesh;
    abstract generateHead(): Mesh;
    abstract generateLimbs(): Mesh[];
    abstract generateAppendages(): Mesh[];
    abstract applySkin(materials: Material[]): Material[];
}
//# sourceMappingURL=CreatureBase.d.ts.map