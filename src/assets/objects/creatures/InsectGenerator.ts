/**
 * InsectGenerator - Procedural insect generation
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface InsectParameters extends CreatureParams {
  legCount: number;
  hasWings: boolean;
  bodySegments: number;
  primaryColor: string;
}

export type InsectSpecies = 'ant' | 'bee' | 'beetle' | 'butterfly' | 'spider' | 'grasshopper';

export class InsectGenerator extends CreatureBase {
  constructor(params: Partial<InsectParameters> = {}) {
    super({ ...params, seed: params.seed || Math.random() * 10000 });
  }

  getDefaultConfig(): InsectParameters {
    return {
      ...this.params,
      creatureType: CreatureType.INSECT,
      legCount: 6,
      hasWings: false,
      bodySegments: 3,
      primaryColor: '#2F2F2F',
    } as InsectParameters;
  }

  generate(species: InsectSpecies = 'ant', params: Partial<InsectParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const insect = new Group();
    insect.name = `Insect_${species}`;
    insect.add(this.generateBody(parameters));
    if (parameters.hasWings) {
      insect.add(this.generateWings(parameters));
    }
    return insect;
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

  private applySpeciesDefaults(species: InsectSpecies, params: InsectParameters): void {
    switch (species) {
      case 'ant':
        params.size = 0.02;
        params.legCount = 6;
        params.hasWings = false;
        params.primaryColor = '#2F2F2F';
        break;
      case 'bee':
        params.size = 0.03;
        params.legCount = 6;
        params.hasWings = true;
        params.primaryColor = '#FFD700';
        break;
      case 'beetle':
        params.size = 0.05;
        params.legCount = 6;
        params.hasWings = true;
        params.primaryColor = '#228B22';
        break;
      case 'butterfly':
        params.size = 0.08;
        params.legCount = 6;
        params.hasWings = true;
        params.primaryColor = '#FF69B4';
        break;
      case 'spider':
        params.size = 0.04;
        params.legCount = 8;
        params.hasWings = false;
        params.primaryColor = '#2F2F2F';
        break;
      case 'grasshopper':
        params.size = 0.06;
        params.legCount = 6;
        params.hasWings = true;
        params.primaryColor = '#228B22';
        break;
    }
  }

  private generateBody(params: InsectParameters): Mesh {
    const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.5);
    const material = new MeshStandardMaterial({ color: params.primaryColor });
    return new Mesh(geometry, material);
  }

  private generateWings(params: InsectParameters): Mesh {
    const geometry = this.createBoxGeometry(params.size * 0.5, 0.001, params.size * 0.3);
    const material = new MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.5 });
    return new Mesh(geometry, material);
  }

  private generateAntennae(_params: InsectParameters): Mesh {
    const geometry = this.createCylinderGeometry(0.001, 0.001, 0.05);
    const material = new MeshStandardMaterial({ color: '#2F2F2F' });
    return new Mesh(geometry, material);
  }
}