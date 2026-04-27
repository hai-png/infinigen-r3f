/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, and animation hooks
 */

import { Group, Mesh, Material, SphereGeometry, BoxGeometry, CylinderGeometry, MeshStandardMaterial, ConeGeometry, CapsuleGeometry, EllipsoidGeometry } from 'three';
import { SeededRandom } from '../../../core/util/math/index';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export enum CreatureType {
  MAMMAL = 'mammal',
  BIRD = 'bird',
  REPTILE = 'reptile',
  AMPHIBIAN = 'amphibian',
  FISH = 'fish',
  INSECT = 'insect',
  INVERTEBRATE = 'invertebrate'
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

export abstract class CreatureBase extends BaseObjectGenerator<CreatureParams> {
  protected params: CreatureParams;
  protected rng: SeededRandom;

  constructor(params: Partial<CreatureParams> = {}) {
    super(0);
    this.params = {
      seed: Math.random() * 10000,
      species: 'unknown',
      size: 1.0,
      age: 'adult',
      gender: 'neutral',
      health: 1.0,
      biome: 'temperate',
      ...params
    };
    this.rng = new SeededRandom(this.params.seed);
  }

  getDefaultConfig(): CreatureParams {
    return this.params;
  }

  generate(): Group {
    return new Group();
  }

  protected createEllipsoidGeometry(x: number, y: number, z: number): EllipsoidGeometry {
    return new EllipsoidGeometry(x, y, z);
  }

  protected createSphereGeometry(radius: number): SphereGeometry {
    return new SphereGeometry(radius);
  }

  protected createBoxGeometry(width: number, height: number, depth: number): BoxGeometry {
    return new BoxGeometry(width, height, depth);
  }

  protected createCylinderGeometry(radiusTop: number, radiusBottom: number, height: number): CylinderGeometry {
    return new CylinderGeometry(radiusTop, radiusBottom, height);
  }

  protected createConeGeometry(radius: number, height: number): ConeGeometry {
    return new ConeGeometry(radius, height);
  }

  protected createCapsuleGeometry(radius: number, length: number): CapsuleGeometry {
    return new CapsuleGeometry(radius, length);
  }

  protected createStandardMaterial(params?: any): MeshStandardMaterial {
    return new MeshStandardMaterial(params);
  }

  protected createFinGeometry(shape: string, params?: any): Geometry {
    return new Geometry();
  }

  protected createEarGeometry(params?: any): Geometry {
    return new Geometry();
  }

  protected createShellGeometry(params?: any): Geometry {
    return new Geometry();
  }

  protected get seed(): number { return this.params.seed; }

  protected mergeParameters(base: any, override: any): any {
    return { ...base, ...override };
  }

  abstract generateBodyCore(): Mesh;
  abstract generateHead(): Mesh;
  abstract generateLimbs(): Mesh[];
  abstract generateAppendages(): Mesh[];
  abstract applySkin(materials: Material[]): Material[];

  getBoundingBox(): { min: [number, number, number]; max: [number, number, number] } {
    const sizeMultipliers: Record<string, number> = {
      tiny: 0.1,
      small: 0.3,
      medium: 1.0,
      large: 2.5,
      huge: 5.0
    };
    const mult = sizeMultipliers[this.params.size.toString()] || 1.0;
    return {
      min: [-0.5 * mult, 0, -0.5 * mult],
      max: [0.5 * mult, 1.0 * mult, 0.5 * mult]
    };
  }

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

  validateParams(): boolean {
    const validSizes = [0.1, 0.3, 1.0, 2.5, 5.0];
    const validAges = ['juvenile', 'adult', 'elder'];
    const validGenders = ['male', 'female', 'neutral'];
    return (
      validAges.includes(this.params.age) &&
      validGenders.includes(this.params.gender) &&
      this.params.health >= 0 &&
      this.params.health <= 1
    );
  }
}

class Geometry extends BoxGeometry {
  constructor() {
    super(1, 1, 1);
  }
}