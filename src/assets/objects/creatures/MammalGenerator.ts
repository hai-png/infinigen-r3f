/**
 * MammalGenerator - Procedural mammal generation
 * Generates various mammals with fur, body proportions, and limb structures
 */

import { Group, Mesh, Material } from 'three';
import { CreatureBase, CreatureParameters, CreatureType } from './CreatureBase';
import { FixedSeed } from '../../../../core/util/MathUtils';
import { LegGenerator } from './parts/LegGenerator';
import { TailGenerator } from './parts/TailGenerator';
import { EyeGenerator } from './parts/EyeGenerator';
import { MouthGenerator } from './parts/MouthGenerator';

export interface MammalParameters extends CreatureParameters {
  furLength: number;
  furPattern: 'solid' | 'striped' | 'spotted' | 'gradient';
  earShape: 'rounded' | 'pointed' | 'floppy' | 'tufted';
  tailType: 'bushy' | 'thin' | 'prehensile' | 'none';
  legType: 'digitigrade' | 'plantigrade' | 'unguligrade';
  primaryColor: string;
  secondaryColor: string;
}

export type MammalSpecies = 'dog' | 'cat' | 'deer' | 'bear' | 'rabbit' | 'fox' | 'elephant' | 'giraffe';

export class MammalGenerator extends CreatureBase<MammalParameters> {
  private legGenerator: LegGenerator;
  private tailGenerator: TailGenerator;
  private eyeGenerator: EyeGenerator;
  private mouthGenerator: MouthGenerator;

  constructor(seed?: number) {
    super(seed);
    this.legGenerator = new LegGenerator(this.seed);
    this.tailGenerator = new TailGenerator(this.seed);
    this.eyeGenerator = new EyeGenerator(this.seed);
    this.mouthGenerator = new MouthGenerator(this.seed);
  }

  protected getDefaultParameters(): MammalParameters {
    return {
      ...super.getDefaultParameters(),
      creatureType: CreatureType.MAMMAL,
      furLength: 0.05,
      furPattern: 'solid',
      earShape: 'rounded',
      tailType: 'bushy',
      legType: 'digitigrade',
      primaryColor: '#8B4513',
      secondaryColor: '#D2691E',
    };
  }

  generate(species: MammalSpecies, params: Partial<MammalParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultParameters(), params);
    this.applySpeciesDefaults(species, parameters);
    
    const mammal = new Group();
    mammal.name = `Mammal_${species}`;
    mammal.userData.parameters = parameters;

    // Generate body
    const body = this.generateBody(parameters);
    mammal.add(body);

    // Generate head
    const head = this.generateHead(parameters);
    head.position.set(0, parameters.size * 0.3, parameters.size * 0.4);
    mammal.add(head);

    // Generate legs
    const legs = this.legGenerator.generate(parameters.legType, 4, parameters.size * 0.3);
    legs.position.y = -parameters.size * 0.5;
    mammal.add(legs);

    // Generate tail
    if (parameters.tailType !== 'none') {
      const tail = this.tailGenerator.generate(parameters.tailType, parameters.size * 0.4);
      tail.position.z = -parameters.size * 0.4;
      mammal.add(tail);
    }

    // Generate ears
    const ears = this.generateEars(parameters);
    ears.position.copy(head.position);
    mammal.add(ears);

    return mammal;
  }

  private applySpeciesDefaults(species: MammalSpecies, params: MammalParameters): void {
    switch (species) {
      case 'dog':
        params.size = 0.6;
        params.furLength = 0.03;
        params.furPattern = 'solid';
        params.earShape = 'floppy';
        params.tailType = 'bushy';
        params.legType = 'digitigrade';
        params.primaryColor = '#8B4513';
        break;
      case 'cat':
        params.size = 0.4;
        params.furLength = 0.02;
        params.furPattern = 'striped';
        params.earShape = 'pointed';
        params.tailType = 'thin';
        params.legType = 'digitigrade';
        params.primaryColor = '#696969';
        break;
      case 'deer':
        params.size = 1.2;
        params.furLength = 0.02;
        params.furPattern = 'spotted';
        params.earShape = 'pointed';
        params.tailType = 'thin';
        params.legType = 'unguligrade';
        params.primaryColor = '#CD853F';
        break;
      case 'bear':
        params.size = 1.8;
        params.furLength = 0.08;
        params.furPattern = 'solid';
        params.earShape = 'rounded';
        params.tailType = 'none';
        params.legType = 'plantigrade';
        params.primaryColor = '#2F1B0C';
        break;
      case 'rabbit':
        params.size = 0.3;
        params.furLength = 0.03;
        params.furPattern = 'solid';
        params.earShape = 'tufted';
        params.tailType = 'bushy';
        params.legType = 'digitigrade';
        params.primaryColor = '#FFFFFF';
        break;
      case 'fox':
        params.size = 0.5;
        params.furLength = 0.04;
        params.furPattern = 'gradient';
        params.earShape = 'pointed';
        params.tailType = 'bushy';
        params.legType = 'digitigrade';
        params.primaryColor = '#FF4500';
        break;
      case 'elephant':
        params.size = 3.0;
        params.furLength = 0.001;
        params.furPattern = 'solid';
        params.earShape = 'floppy';
        params.tailType = 'thin';
        params.legType = 'unguligrade';
        params.primaryColor = '#808080';
        break;
      case 'giraffe':
        params.size = 4.0;
        params.furLength = 0.01;
        params.furPattern = 'spotted';
        params.earShape = 'rounded';
        params.tailType = 'thin';
        params.legType = 'unguligrade';
        params.primaryColor = '#FFD700';
        params.secondaryColor = '#8B4513';
        break;
    }
  }

  private generateBody(params: MammalParameters): Mesh {
    const bodyGeometry = this.createEllipsoidGeometry(
      params.size * 0.4,
      params.size * 0.35,
      params.size * 0.5
    );
    const bodyMaterial = this.createFurMaterial(params.primaryColor, params.furLength, params.furPattern);
    return new Mesh(bodyGeometry, bodyMaterial);
  }

  private generateHead(params: MammalParameters): Mesh {
    const headGeometry = this.createSphereGeometry(params.size * 0.2);
    const headMaterial = this.createFurMaterial(params.primaryColor, params.furLength * 0.8, params.furPattern);
    return new Mesh(headGeometry, headMaterial);
  }

  private generateEars(params: MammalParameters): Group {
    const ears = new Group();
    const earGeometry = this.createEarGeometry(params.earShape, params.size * 0.1);
    const earMaterial = this.createFurMaterial(params.secondaryColor, params.furLength * 0.5, 'solid');
    
    const leftEar = new Mesh(earGeometry, earMaterial);
    const rightEar = new Mesh(earGeometry, earMaterial);
    
    leftEar.position.set(-params.size * 0.15, params.size * 0.1, 0);
    rightEar.position.set(params.size * 0.15, params.size * 0.1, 0);
    
    ears.add(leftEar, rightEar);
    return ears;
  }

  private createFurMaterial(color: string, length: number, pattern: string): Material {
    // Would integrate with SkinGenerator for procedural fur
    return new MeshStandardMaterial({ color });
  }

  private createEarGeometry(shape: string, size: number): any {
    return this.createBoxGeometry(size, size * 1.5, size * 0.1);
  }
}
