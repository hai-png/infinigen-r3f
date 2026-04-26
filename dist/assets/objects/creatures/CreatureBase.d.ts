/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, and animation hooks
 */
import { Group, Mesh, Material } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface CreatureParams {
    seed: number;
    species: string;
    size: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
    age: 'juvenile' | 'adult' | 'elder';
    gender: 'male' | 'female' | 'neutral';
    health: number;
    biome: string;
}
export declare abstract class CreatureBase extends BaseObjectGenerator {
    protected params: CreatureParams;
    constructor(params?: Partial<CreatureParams>);
    /**
     * Generate complete creature with all body parts
     */
    abstract generate(): Group;
    /**
     * Generate body core (torso/chest/abdomen)
     */
    protected abstract generateBodyCore(): Mesh;
    /**
     * Generate head with facial features
     */
    protected abstract generateHead(): Mesh;
    /**
     * Generate limbs (legs/arms/flippers)
     */
    protected abstract generateLimbs(): Mesh[];
    /**
     * Generate appendages (wings/tails/antennae)
     */
    protected abstract generateAppendages(): Mesh[];
    /**
     * Apply skin texture and materials
     */
    protected abstract applySkin(materials: Material[]): Material[];
    /**
     * Get creature-specific bounding box
     */
    getBoundingBox(): {
        min: [number, number, number];
        max: [number, number, number];
    };
    /**
     * Get animation rig skeleton structure
     */
    getSkeletonStructure(): Record<string, any>;
    /**
     * Validate creature parameters
     */
    validateParams(): boolean;
}
//# sourceMappingURL=CreatureBase.d.ts.map