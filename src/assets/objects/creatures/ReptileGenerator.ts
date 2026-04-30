/**
 * ReptileGenerator - Procedural reptile generation
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface ReptileParameters extends CreatureParams {
  scalePattern: 'smooth' | 'keeled' | 'granular';
  limbCount: number;
  hasShell: boolean;
  primaryColor: string;
}

export type ReptileSpecies = 'lizard' | 'snake' | 'turtle' | 'crocodile' | 'gecko';

export class ReptileGenerator extends CreatureBase {
  constructor(params: Partial<ReptileParameters> = {}) {
    super({ ...params, seed: params.seed || Math.random() * 10000 });
  }

  getDefaultConfig(): ReptileParameters {
    return {
      ...this.params,
      creatureType: CreatureType.REPTILE,
      scalePattern: 'smooth',
      limbCount: 4,
      hasShell: false,
      primaryColor: '#228B22',
    } as ReptileParameters;
  }

  generate(species: ReptileSpecies = 'lizard', params: Partial<ReptileParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const reptile = new Group();
    reptile.name = `Reptile_${species}`;
    reptile.add(this.generateBody(parameters));
    return reptile;
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
    return [];
  }

  applySkin(materials: any): any[] {
    return materials;
  }

  private applySpeciesDefaults(species: ReptileSpecies, params: ReptileParameters): void {
    switch (species) {
      case 'lizard':
        params.size = 0.3;
        params.scalePattern = 'smooth';
        params.limbCount = 4;
        params.hasShell = false;
        params.primaryColor = '#228B22';
        break;
      case 'snake':
        params.size = 1.0;
        params.scalePattern = 'smooth';
        params.limbCount = 0;
        params.hasShell = false;
        params.primaryColor = '#228B22';
        break;
      case 'turtle':
        params.size = 0.5;
        params.scalePattern = 'keeled';
        params.limbCount = 4;
        params.hasShell = true;
        params.primaryColor = '#2E8B57';
        break;
      case 'crocodile':
        params.size = 2.0;
        params.scalePattern = 'keeled';
        params.limbCount = 4;
        params.hasShell = false;
        params.primaryColor = '#556B2F';
        break;
      case 'gecko':
        params.size = 0.1;
        params.scalePattern = 'granular';
        params.limbCount = 4;
        params.hasShell = false;
        params.primaryColor = '#32CD32';
        break;
    }
  }

  private generateBody(params: ReptileParameters): Mesh {
    const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.5);
    const material = new MeshStandardMaterial({ color: params.primaryColor });
    return new Mesh(geometry, material);
  }

  protected createShellGeometry(params?: any): THREE.BoxGeometry {
    return new THREE.BoxGeometry(1, 1, 1); 
  }
}