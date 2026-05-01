/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, and animation hooks
 */

import {
  Group, Mesh, Material, SphereGeometry, BoxGeometry, CylinderGeometry,
  MeshStandardMaterial, ConeGeometry, CapsuleGeometry, TorusGeometry,
  BufferGeometry, Float32BufferAttribute, Vector3
} from 'three';
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
    const group = new Group();
    // Base creature: visible ellipsoid body + sphere head
    const bodyMat = this.createStandardMaterial({ color: 0x8b7355, roughness: 0.8 });
    const body = new Mesh(this.createEllipsoidGeometry(0.4, 0.35, 0.5), bodyMat);
    body.name = 'body';
    group.add(body);

    const head = new Mesh(this.createSphereGeometry(0.2), bodyMat);
    head.position.set(0, 0.3, 0.4);
    head.name = 'head';
    group.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(0.04);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 0.35, 0.58);
    group.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.08, 0.35, 0.58);
    group.add(rightEye);

    return group;
  }

  protected createEllipsoidGeometry(x: number, y: number, z: number): SphereGeometry {
    const geometry = new SphereGeometry(1, 32, 32);
    geometry.scale(x, y, z);
    return geometry;
  }

  protected createSphereGeometry(radius: number): SphereGeometry {
    return new SphereGeometry(radius, 16, 16);
  }

  protected createBoxGeometry(width: number, height: number, depth: number): BoxGeometry {
    return new BoxGeometry(width, height, depth);
  }

  protected createCylinderGeometry(radiusTop: number, radiusBottom: number, height: number, segments: number = 16): CylinderGeometry {
    return new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  }

  protected createConeGeometry(radius: number, height: number, segments: number = 16): ConeGeometry {
    return new ConeGeometry(radius, height, segments);
  }

  protected createCapsuleGeometry(radius: number, length: number): CapsuleGeometry {
    return new CapsuleGeometry(radius, length, 8, 16);
  }

  protected createStandardMaterial(params?: Record<string, any>): MeshStandardMaterial {
    return new MeshStandardMaterial({ roughness: 0.7, metalness: 0.0, ...params });
  }

  /**
   * Create a fin-shaped geometry - a tapered flat shape
   */
  protected createFinGeometry(width: number, height: number, depth: number): BufferGeometry {
    const vertices = new Float32Array([
      // Front face - triangular fin
      0, height, 0,       // tip
      -width / 2, 0, -depth / 2,  // base left back
      width / 2, 0, -depth / 2,   // base right back
      // Back face
      0, height, 0,
      width / 2, 0, depth / 2,
      -width / 2, 0, depth / 2,
      // Left side
      0, height, 0,
      -width / 2, 0, -depth / 2,
      -width / 2, 0, depth / 2,
      // Right side
      0, height, 0,
      width / 2, 0, depth / 2,
      width / 2, 0, -depth / 2,
      // Bottom
      -width / 2, 0, -depth / 2,
      width / 2, 0, -depth / 2,
      width / 2, 0, depth / 2,

      -width / 2, 0, -depth / 2,
      width / 2, 0, depth / 2,
      -width / 2, 0, depth / 2,
    ]);
    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geom.computeVertexNormals();
    return geom;
  }

  /**
   * Create an ear-shaped geometry - a curved pointed/cone shape
   */
  protected createEarGeometry(width: number, height: number, depth: number): BufferGeometry {
    // Create a tapered cone-like ear shape
    const geo = new ConeGeometry(width / 2, height, 8);
    geo.scale(1, 1, depth / width);
    return geo;
  }

  /**
   * Create a shell-shaped geometry - a dome/hemisphere
   */
  protected createShellGeometry(radius: number, domeHeight: number): SphereGeometry {
    const geo = new SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
    geo.scale(1, domeHeight / radius, 1);
    return geo;
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
