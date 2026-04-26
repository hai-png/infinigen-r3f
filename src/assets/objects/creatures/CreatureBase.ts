/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, and animation hooks
 */

import { Group, Mesh, Material } from 'three';
import { FixedSeed } from '../../../../core/util/math/utils';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';

export interface CreatureParams {
  seed: number;
  species: string;
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  age: 'juvenile' | 'adult' | 'elder';
  gender: 'male' | 'female' | 'neutral';
  health: number; // 0-1, affects appearance
  biome: string;
}

export abstract class CreatureBase extends BaseObjectGenerator {
  protected params: CreatureParams;
  
  constructor(params: Partial<CreatureParams> = {}) {
    super();
    this.params = {
      seed: Math.random() * 10000,
      species: 'unknown',
      size: 'medium',
      age: 'adult',
      gender: 'neutral',
      health: 1.0,
      biome: 'temperate',
      ...params
    };
    this.rng = new FixedSeed(this.params.seed);
  }

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
  getBoundingBox(): { min: [number, number, number]; max: [number, number, number] } {
    const sizeMultipliers = {
      tiny: 0.1,
      small: 0.3,
      medium: 1.0,
      large: 2.5,
      huge: 5.0
    };
    
    const mult = sizeMultipliers[this.params.size];
    return {
      min: [-0.5 * mult, 0, -0.5 * mult],
      max: [0.5 * mult, 1.0 * mult, 0.5 * mult]
    };
  }

  /**
   * Get animation rig skeleton structure
   */
  getSkeletonStructure(): Record<string, any> {
    return {
      root: 'pelvis',
      spine: ['spine_01', 'spine_02', 'spine_03'],
      neck: 'neck_01',
      head: 'head',
      limbs: {
        front_left: ['shoulder_l', 'arm_l', 'hand_l'],
        front_right: ['shoulder_r', 'arm_r', 'hand_r'],
        back_left: ['hip_l', 'leg_l', 'foot_l'],
        back_right: ['hip_r', 'leg_r', 'foot_r']
      }
    };
  }

  /**
   * Validate creature parameters
   */
  validateParams(): boolean {
    const validSizes = ['tiny', 'small', 'medium', 'large', 'huge'];
    const validAges = ['juvenile', 'adult', 'elder'];
    const validGenders = ['male', 'female', 'neutral'];
    
    return (
      validSizes.includes(this.params.size) &&
      validAges.includes(this.params.age) &&
      validGenders.includes(this.params.gender) &&
      this.params.health >= 0 &&
      this.params.health <= 1
    );
  }
}
