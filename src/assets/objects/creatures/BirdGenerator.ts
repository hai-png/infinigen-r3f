/**
 * BirdGenerator - Procedural bird generation
 * Generates various bird species with configurable wings, beaks, feathers, and colors
 */

import { Group, Mesh, Material } from 'three';
import { CreatureBase, CreatureParameters, CreatureType } from './CreatureBase';
import { FixedSeed } from '../../../../core/util/math/utils';
import { WingGenerator } from './parts/WingGenerator';
import { LegGenerator } from './parts/LegGenerator';
import { BeakGenerator } from './parts/MouthGenerator';
import { EyeGenerator } from './parts/EyeGenerator';

export interface BirdParameters extends CreatureParameters {
  wingSpan: number;
  beakType: 'hooked' | 'conical' | 'probing' | 'filter';
  featherPattern: 'solid' | 'striped' | 'spotted' | 'iridescent';
  flightStyle: 'soaring' | 'flapping' | 'hovering' | 'gliding';
  tailShape: 'forked' | 'rounded' | 'square' | 'pointed';
  primaryColor: string;
  secondaryColor: string;
}

export type BirdSpecies = 'eagle' | 'sparrow' | 'parrot' | 'owl' | 'hummingbird' | 'pelican' | 'flamingo' | 'penguin';

export class BirdGenerator extends CreatureBase<BirdParameters> {
  private wingGenerator: WingGenerator;
  private legGenerator: LegGenerator;
  private beakGenerator: BeakGenerator;
  private eyeGenerator: EyeGenerator;

  constructor(seed?: number) {
    super(seed);
    this.wingGenerator = new WingGenerator(this.seed);
    this.legGenerator = new LegGenerator(this.seed);
    this.beakGenerator = new BeakGenerator(this.seed);
    this.eyeGenerator = new EyeGenerator(this.seed);
  }

  protected getDefaultParameters(): BirdParameters {
    return {
      ...super.getDefaultParameters(),
      creatureType: CreatureType.BIRD,
      wingSpan: 0.5,
      beakType: 'conical',
      featherPattern: 'solid',
      flightStyle: 'flapping',
      tailShape: 'rounded',
      primaryColor: '#8B4513',
      secondaryColor: '#D2691E',
    };
  }

  generate(species: BirdSpecies, params: Partial<BirdParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultParameters(), params);
    this.applySpeciesDefaults(species, parameters);
    
    const bird = new Group();
    bird.name = `Bird_${species}`;
    bird.userData.parameters = parameters;

    // Generate body
    const body = this.generateBody(parameters);
    bird.add(body);

    // Generate wings
    const leftWing = this.wingGenerator.generate('left', parameters.wingSpan, parameters.featherPattern);
    const rightWing = this.wingGenerator.generate('right', parameters.wingSpan, parameters.featherPattern);
    leftWing.position.set(-parameters.size * 0.3, parameters.size * 0.1, 0);
    rightWing.position.set(parameters.size * 0.3, parameters.size * 0.1, 0);
    bird.add(leftWing, rightWing);

    // Generate legs
    const legs = this.legGenerator.generate('avian', 2, parameters.size * 0.3);
    legs.position.y = -parameters.size * 0.5;
    bird.add(legs);

    // Generate beak
    const beak = this.beakGenerator.generate(parameters.beakType, parameters.size * 0.15);
    beak.position.set(0, parameters.size * 0.05, parameters.size * 0.35);
    bird.add(beak);

    // Generate eyes
    const eyes = this.eyeGenerator.generate('camera', 2, parameters.size * 0.08);
    eyes.position.set(0, parameters.size * 0.1, parameters.size * 0.25);
    bird.add(eyes);

    // Generate tail
    const tail = this.generateTail(parameters);
    tail.position.z = -parameters.size * 0.4;
    bird.add(tail);

    return bird;
  }

  private applySpeciesDefaults(species: BirdSpecies, params: BirdParameters): void {
    const seed = new FixedSeed(this.seed + this.hashString(species));
    
    switch (species) {
      case 'eagle':
        params.size = 0.8;
        params.wingSpan = 2.0;
        params.beakType = 'hooked';
        params.flightStyle = 'soaring';
        params.tailShape = 'fan';
        params.primaryColor = '#4A3728';
        params.secondaryColor = '#FFD700';
        break;
      case 'sparrow':
        params.size = 0.15;
        params.wingSpan = 0.25;
        params.beakType = 'conical';
        params.flightStyle = 'flapping';
        params.tailShape = 'notched';
        params.primaryColor = '#8B7355';
        params.secondaryColor = '#D2B48C';
        break;
      case 'parrot':
        params.size = 0.35;
        params.wingSpan = 0.6;
        params.beakType = 'hooked';
        params.featherPattern = 'iridescent';
        params.flightStyle = 'flapping';
        params.primaryColor = '#00FF00';
        params.secondaryColor = '#FF0000';
        break;
      case 'owl':
        params.size = 0.5;
        params.wingSpan = 1.2;
        params.beakType = 'hooked';
        params.flightStyle = 'silent';
        params.tailShape = 'rounded';
        params.primaryColor = '#8B4513';
        params.secondaryColor = '#F4A460';
        break;
      case 'hummingbird':
        params.size = 0.1;
        params.wingSpan = 0.15;
        params.beakType = 'probing';
        params.flightStyle = 'hovering';
        params.tailShape = 'forked';
        params.primaryColor = '#FF69B4';
        params.secondaryColor = '#00CED1';
        break;
      case 'pelican':
        params.size = 1.2;
        params.wingSpan = 2.5;
        params.beakType = 'pouch';
        params.flightStyle = 'gliding';
        params.tailShape = 'wedge';
        params.primaryColor = '#FFFFFF';
        params.secondaryColor = '#FFA500';
        break;
      case 'flamingo':
        params.size = 1.0;
        params.wingSpan = 1.5;
        params.beakType = 'filter';
        params.flightStyle = 'soaring';
        params.tailShape = 'rounded';
        params.primaryColor = '#FF69B4';
        params.secondaryColor = '#FF1493';
        break;
      case 'penguin':
        params.size = 0.7;
        params.wingSpan = 0.4;
        params.beakType = 'conical';
        params.flightStyle = 'swimming';
        params.tailShape = 'pointed';
        params.primaryColor = '#1a1a1a';
        params.secondaryColor = '#FFFFFF';
        break;
    }
  }

  private generateBody(params: BirdParameters): Mesh {
    // Simplified body geometry - would use detailed mesh in production
    const bodyGeometry = this.createEllipsoidGeometry(
      params.size * 0.3,
      params.size * 0.4,
      params.size * 0.2
    );
    const bodyMaterial = this.createFeatherMaterial(params.primaryColor, params.featherPattern);
    return new Mesh(bodyGeometry, bodyMaterial);
  }

  private generateTail(params: BirdParameters): Mesh {
    const tailGeometry = this.createTailGeometry(params.tailShape, params.size * 0.3);
    const tailMaterial = this.createFeatherMaterial(params.secondaryColor, params.featherPattern);
    return new Mesh(tailGeometry, tailMaterial);
  }

  private createFeatherMaterial(color: string, pattern: string): Material {
    // Would integrate with MaterialGenerator for procedural feather textures
    return new MeshStandardMaterial({ color });
  }

  private createTailGeometry(shape: string, size: number): any {
    // Simplified tail geometry based on shape
    return this.createBoxGeometry(size, size * 0.3, size * 0.1);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
