/**
 * UnderwaterGenerator - Procedural underwater creature generation
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface MarineParameters extends CreatureParams {
  hasShell: boolean;
  swimMode: 'propulsion' | 'drift' | 'jet';
  depthRange: 'shallow' | 'mid' | 'deep';
  primaryColor: string;
  secondaryColor: string;
}

export type MarineSpecies = 'jellyfish' | 'crab' | 'starfish' | 'octopus' | 'whale' | 'dolphin';

export class UnderwaterGenerator extends CreatureBase {
  constructor(params: Partial<MarineParameters> = {}) {
    super({ ...params, seed: params.seed || Math.random() * 10000 });
  }

  getDefaultConfig(): MarineParameters {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      hasShell: false,
      swimMode: 'propulsion',
      depthRange: 'shallow',
      primaryColor: '#4169E1',
      secondaryColor: '#87CEEB',
    } as MarineParameters;
  }

  generate(species: MarineSpecies = 'jellyfish', params: Partial<MarineParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const marine = new Group();
    marine.name = `Marine_${species}`;
    marine.add(this.generateBody(parameters));
    if (parameters.hasShell) {
      marine.add(this.generateShell(parameters));
    }
    return marine;
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

  private applySpeciesDefaults(species: MarineSpecies, params: MarineParameters): void {
    switch (species) {
      case 'jellyfish':
        params.size = 0.3;
        params.hasShell = false;
        params.swimMode = 'drift';
        params.primaryColor = '#FF69B4';
        params.secondaryColor = '#FFFFFF';
        break;
      case 'crab':
        params.size = 0.2;
        params.hasShell = true;
        params.swimMode = 'propulsion';
        params.primaryColor = '#FF6347';
        break;
      case 'starfish':
        params.size = 0.15;
        params.hasShell = false;
        params.swimMode = 'drift';
        params.primaryColor = '#FF8C00';
        break;
      case 'octopus':
        params.size = 0.4;
        params.hasShell = false;
        params.swimMode = 'jet';
        params.primaryColor = '#8B4513';
        break;
      case 'whale':
        params.size = 5.0;
        params.hasShell = false;
        params.swimMode = 'propulsion';
        params.depthRange = 'mid';
        params.primaryColor = '#2F2F2F';
        params.secondaryColor = '#FFFFFF';
        break;
      case 'dolphin':
        params.size = 1.5;
        params.hasShell = false;
        params.swimMode = 'propulsion';
        params.depthRange = 'shallow';
        params.primaryColor = '#708090';
        break;
    }
  }

  private generateBody(params: MarineParameters): Mesh {
    const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.5);
    const material = new MeshStandardMaterial({ color: params.primaryColor });
    return new Mesh(geometry, material);
  }

  private generateShell(params: MarineParameters): Mesh {
    const geometry = this.createSphereGeometry(params.size * 0.2);
    const material = new MeshStandardMaterial({ color: params.secondaryColor });
    return new Mesh(geometry, material);
  }
}