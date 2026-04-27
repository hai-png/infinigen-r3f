/**
 * FishGenerator - Procedural fish generation
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface FishParameters extends CreatureParams {
  tailType: 'forked' | 'rounded' | 'square';
  scaleType: 'smooth' | 'cycloid' | 'ctenoid';
  hasFins: boolean;
  primaryColor: string;
  secondaryColor: string;
}

export type FishSpecies = 'goldfish' | 'tuna' | 'clownfish' | 'anglerfish' | 'seahorse';

export class FishGenerator extends CreatureBase {
  constructor(params: Partial<FishParameters> = {}) {
    super({ ...params, seed: params.seed || Math.random() * 10000 });
  }

  getDefaultConfig(): FishParameters {
    return {
      ...this.params,
      creatureType: CreatureType.FISH,
      tailType: 'forked',
      scaleType: 'smooth',
      hasFins: true,
      primaryColor: '#FF8C00',
      secondaryColor: '#FFFFFF',
    } as FishParameters;
  }

  generate(species: FishSpecies = 'goldfish', params: Partial<FishParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const fish = new Group();
    fish.name = `Fish_${species}`;
    fish.add(this.generateBody(parameters));
    if (parameters.hasFins) {
      fish.add(this.generateFins(parameters));
    }
    return fish;
  }

  generateBodyCore(): Mesh {
    return this.generateBody(this.getDefaultConfig());
  }

  generateHead(): Mesh {
    return this.generateBody(this.getDefaultConfig());
  }

  generateLimbs(): Mesh[] {
    return [];
  }

  generateAppendages(): Mesh[] {
    return this.generateFins(this.getDefaultConfig());
  }

  applySkin(materials: any): any[] {
    return materials;
  }

  private applySpeciesDefaults(species: FishSpecies, params: FishParameters): void {
    switch (species) {
      case 'goldfish':
        params.size = 0.1;
        params.tailType = 'rounded';
        params.primaryColor = '#FF8C00';
        break;
      case 'tuna':
        params.size = 2.0;
        params.tailType = 'forked';
        params.primaryColor = '#4169E1';
        break;
      case 'clownfish':
        params.size = 0.1;
        params.tailType = 'rounded';
        params.primaryColor = '#FF6347';
        break;
      case 'anglerfish':
        params.size = 0.5;
        params.tailType = 'forked';
        params.primaryColor = '#2F2F2F';
        break;
      case 'seahorse':
        params.size = 0.15;
        params.tailType = 'square';
        params.primaryColor = '#FFD700';
        break;
    }
  }

  private generateBody(params: FishParameters): Mesh {
    const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.5);
    const material = new MeshStandardMaterial({ color: params.primaryColor });
    return new Mesh(geometry, material);
  }

  private generateFins(params: FishParameters): Mesh {
    const geometry = this.createTriangleGeometry();
    const material = new MeshStandardMaterial({ color: params.secondaryColor, transparent: true });
    return new Mesh(geometry, material);
  }

  private createTriangleGeometry() {
    return this.createBoxGeometry(0.1, 0.1, 0.05);
  }
}