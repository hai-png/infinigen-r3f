/**
 * BirdGenerator - Procedural bird generation
 * Generates various bird species with configurable wings, beaks, feathers, and colors
 */

import { Group, Mesh, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface BirdParameters extends CreatureParams {
  wingSpan: number;
  beakType: 'hooked' | 'conical' | 'probing' | 'filter';
  featherPattern: 'solid' | 'striped' | 'spotted' | 'iridescent';
  flightStyle: 'soaring' | 'flapping' | 'hovering' | 'gliding';
  tailShape: 'forked' | 'rounded' | 'square' | 'pointed';
  primaryColor: string;
  secondaryColor: string;
}

export type BirdSpecies = 'eagle' | 'sparrow' | 'parrot' | 'owl' | 'hummingbird' | 'pelican' | 'flamingo' | 'penguin';

export class BirdGenerator extends CreatureBase {
  constructor(seed?: number) {
    super({ seed: seed || Math.random() * 10000 });
  }

  getDefaultConfig(): BirdParameters {
    return {
      ...this.params,
      creatureType: CreatureType.BIRD,
      wingSpan: 0.5,
      beakType: 'conical',
      featherPattern: 'solid',
      flightStyle: 'flapping',
      tailShape: 'rounded',
      primaryColor: '#8B4513',
      secondaryColor: '#D2691E',
    } as BirdParameters;
  }

  generate(species: BirdSpecies = 'sparrow', params: Partial<BirdParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const bird = new Group();
    bird.name = `Bird_${species}`;
    bird.userData.parameters = parameters;

    const body = this.generateBody(parameters);
    bird.add(body);

    const head = this.generateHead(parameters);
    head.position.set(0, parameters.size * 0.2, parameters.size * 0.3);
    bird.add(head);

    return bird;
  }

  generateBodyCore(): Mesh {
    return this.generateBody(this.getDefaultConfig());
  }

  generateHead(): Mesh {
    return this.generateHead(this.getDefaultConfig());
  }

  generateLimbs(): Mesh[] {
    return [];
  }

  generateAppendages(): Mesh[] {
    return [];
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: BirdSpecies, params: BirdParameters): void {
    switch (species) {
      case 'eagle':
        params.size = 1.2;
        params.wingSpan = 2.0;
        params.beakType = 'hooked';
        params.flightStyle = 'soaring';
        params.tailShape = 'square';
        params.primaryColor = '#2F1810';
        break;
      case 'sparrow':
        params.size = 0.15;
        params.wingSpan = 0.25;
        params.beakType = 'conical';
        params.flightStyle = 'flapping';
        params.tailShape = 'pointed';
        params.primaryColor = '#8B4513';
        break;
      case 'parrot':
        params.size = 0.4;
        params.wingSpan = 0.6;
        params.beakType = 'hooked';
        params.featherPattern = 'solid';
        params.flightStyle = 'flapping';
        params.tailShape = 'pointed';
        params.primaryColor = '#228B22';
        break;
      case 'owl':
        params.size = 0.5;
        params.wingSpan = 1.0;
        params.beakType = 'hooked';
        params.flightStyle = 'silent';
        params.tailShape = 'rounded';
        params.primaryColor = '#8B4513';
        break;
      case 'hummingbird':
        params.size = 0.05;
        params.wingSpan = 0.08;
        params.beakType = 'probing';
        params.flightStyle = 'hovering';
        params.tailShape = 'forked';
        params.primaryColor = '#228B22';
        break;
      case 'pelican':
        params.size = 1.0;
        params.wingSpan = 2.5;
        params.beakType = 'filter';
        params.flightStyle = 'gliding';
        params.tailShape = 'rounded';
        params.primaryColor = '#FFFFFF';
        break;
      case 'flamingo':
        params.size = 1.2;
        params.wingSpan = 1.5;
        params.beakType = 'filter';
        params.flightStyle = 'flapping';
        params.tailShape = 'pointed';
        params.primaryColor = '#FF69B4';
        break;
      case 'penguin':
        params.size = 0.6;
        params.wingSpan = 0.3;
        params.beakType = 'conical';
        params.flightStyle = 'swimming';
        params.tailShape = 'rounded';
        params.primaryColor = '#2F2F2F';
        break;
    }
  }

  private generateBody(params: BirdParameters): Mesh {
    const bodyGeometry = this.createEllipsoidGeometry(
      params.size * 0.3,
      params.size * 0.25,
      params.size * 0.4
    );
    const bodyMaterial = new MeshStandardMaterial({ color: params.primaryColor });
    return new Mesh(bodyGeometry, bodyMaterial);
  }

  private generateHead(params: BirdParameters): Mesh {
    const headGeometry = this.createSphereGeometry(params.size * 0.15);
    const headMaterial = new MeshStandardMaterial({ color: params.primaryColor });
    return new Mesh(headGeometry, headMaterial);
  }
}