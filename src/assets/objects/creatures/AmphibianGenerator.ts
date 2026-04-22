/**
 * AmphibianGenerator - Procedural amphibian generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureParameters, CreatureType } from './CreatureBase';

export type AmphibianSpecies = 'frog' | 'salamander' | 'newt' | 'toad';
export interface AmphibianParameters extends CreatureParameters {
  skinTexture: 'smooth' | 'warty' | 'ridged';
  hasTail: boolean;
  webbedFeet: boolean;
  primaryColor: string;
}

export class AmphibianGenerator extends CreatureBase<AmphibianParameters> {
  protected getDefaultParameters(): AmphibianParameters {
    return {
      ...super.getDefaultParameters(),
      creatureType: CreatureType.AMPHIBIAN,
      skinTexture: 'smooth',
      hasTail: false,
      webbedFeet: true,
      primaryColor: '#228B22',
    };
  }

  generate(species: AmphibianSpecies, params: Partial<AmphibianParameters> = {}): Group {
    const parameters = { ...this.getDefaultParameters(), ...params };
    this.applySpeciesDefaults(species, parameters);
    
    const amphibian = new Group();
    amphibian.name = `Amphibian_${species}`;
    amphibian.add(this.generateBody(parameters));
    
    if (parameters.hasTail) {
      amphibian.add(this.generateTail(parameters));
    }
    
    return amphibian;
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
    const material = new Mesh.StandardMaterial({ color: params.primaryColor });
    return new Mesh(geometry, material);
  }

  private generateTail(params: AmphibianParameters): Mesh {
    const geometry = this.createCylinderGeometry(params.size * 0.05, params.size * 0.02, params.size * 0.3);
    const material = new Mesh.StandardMaterial({ color: params.primaryColor });
    return new Mesh(geometry, material);
  }
}
