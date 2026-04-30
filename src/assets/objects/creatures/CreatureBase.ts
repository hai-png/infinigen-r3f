/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, and animation hooks
 */

import { Group, Mesh, Material, SphereGeometry, BoxGeometry, CylinderGeometry, MeshStandardMaterial, ConeGeometry, CapsuleGeometry } from 'three';
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

  protected createEllipsoidGeometry(x: number, y: number, z: number): SphereGeometry {
    // Three.js doesn't have EllipsoidGeometry, use scaled SphereGeometry instead
    const geometry = new SphereGeometry(1, 32, 32);
    geometry.scale(x, y, z);
    return geometry;
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

  protected createFinGeometry(shape: string, params?: any): BoxGeometry {
    return new BoxGeometry(1, 1, 1);
  }

  protected createEarGeometry(params?: any): BoxGeometry {
    return new BoxGeometry(1, 1, 1);
  }

  protected createShellGeometry(params?: any): BoxGeometry {
    return new BoxGeometry(1, 1, 1);
  }

  protected mergeParameters(base: any, override: any): any {
    return { ...base, ...override };
  }

  abstract generateBodyCore(): Mesh;
  abstract generateHead(): Mesh;
  abstract generateLimbs(): Mesh[];
  abstract generateAppendages(): Mesh[];
  abstract applySkin(materials: Material[]): Material[];
}
