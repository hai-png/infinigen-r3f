/**
 * AmphibianGenerator - Procedural amphibian generation
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export type AmphibianSpecies = 'frog' | 'salamander' | 'newt' | 'toad';
export interface AmphibianParameters extends CreatureParams {
  skinTexture: 'smooth' | 'warty' | 'ridged';
  hasTail: boolean;
  webbedFeet: boolean;
  primaryColor: string;
}

export class AmphibianGenerator extends CreatureBase {
  constructor(params: Partial<AmphibianParameters> = {}) {
    super({ ...params, seed: params.seed || Math.random() * 10000 });
  }

  getDefaultConfig(): AmphibianParameters {
    return {
      ...this.params,
      creatureType: CreatureType.AMPHIBIAN,
      skinTexture: 'smooth',
      hasTail: false,
      webbedFeet: true,
      primaryColor: '#228B22',
    } as AmphibianParameters;
  }

  generate(species: AmphibianSpecies = 'frog', params: Partial<AmphibianParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const amphibian = new Group();
    amphibian.name = `Amphibian_${species}`;
    amphibian.add(this.generateBody(parameters));

    if (parameters.hasTail) {
      amphibian.add(this.generateTail(parameters));
    }

    return amphibian;
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

  private applySpeciesDefaults(species: AmphibianSpecies, params: AmphibianParameters): void {
    switch (species) {
      case 'frog': params.hasTail = false; params.size = 0.1; params.webbedFeet = true; params.primaryColor = '#32CD32'; break;
      case 'salamander': params.hasTail = true; params.size = 0.2; params.skinTexture = 'smooth'; params.primaryColor = '#FF8C00'; break;
      case 'newt': params.hasTail = true; params.size = 0.15; params.primaryColor = '#FFD700'; break;
      case 'toad': params.hasTail = false; params.size = 0.12; params.skinTexture = 'warty'; params.primaryColor = '#8B4513'; break;
    }
  }

  private generateBody(params: AmphibianParameters): Mesh {
    const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.4);
    const material = new MeshStandardMaterial({ color: params.primaryColor });
    return new Mesh(geometry, material);
  }

  private generateTail(params: AmphibianParameters): Mesh {
    const geometry = this.createCylinderGeometry(params.size * 0.05, params.size * 0.02, params.size * 0.3);
    const material = new MeshStandardMaterial({ color: params.primaryColor });
    return new Mesh(geometry, material);
  }
}