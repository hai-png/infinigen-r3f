/**
 * FishGenerator - Procedural fish generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureParameters, CreatureType } from './CreatureBase';

export type FishSpecies = 'tropical' | 'shark' | 'goldfish' | 'bass' | 'clownfish' | 'stingray';
export interface FishParameters extends CreatureParameters {
  finType: 'rounded' | 'pointed' | 'filamentous';
  scalePattern: 'cycloid' | 'ctenoid' | 'ganoid' | 'placoid';
  bodyShape: 'fusiform' | 'depressed' | 'compressed' | 'anguilliform';
  primaryColor: string;
}

export class FishGenerator extends CreatureBase<FishParameters> {
  protected getDefaultParameters(): FishParameters {
    return {
      ...super.getDefaultParameters(),
      creatureType: CreatureType.FISH,
      finType: 'rounded',
      scalePattern: 'cycloid',
      bodyShape: 'fusiform',
      primaryColor: '#FF6347',
    };
  }

  generate(species: FishSpecies, params: Partial<FishParameters> = {}): Group {
    const parameters = { ...this.getDefaultParameters(), ...params };
    this.applySpeciesDefaults(species, parameters);
    
    const fish = new Group();
    fish.name = `Fish_${species}`;
    fish.add(this.generateBody(parameters));
    fish.add(this.generateFins(parameters));
    return fish;
  }

  private applySpeciesDefaults(species: FishSpecies, params: FishParameters): void {
    switch (species) {
      case 'tropical': params.size = 0.15; params.primaryColor = '#00BFFF'; params.bodyShape = 'compressed'; break;
      case 'shark': params.size = 2.0; params.primaryColor = '#708090'; params.finType = 'pointed'; params.bodyShape = 'fusiform'; break;
      case 'goldfish': params.size = 0.2; params.primaryColor = '#FFD700'; params.tailType = 'fan'; break;
      case 'bass': params.size = 0.5; params.primaryColor = '#556B2F'; break;
      case 'clownfish': params.size = 0.12; params.primaryColor = '#FF4500'; params.scalePattern = 'ctenoid'; break;
      case 'stingray': params.size = 0.8; params.primaryColor = '#8B4513'; params.bodyShape = 'depressed'; break;
    }
  }

  private generateBody(params: FishParameters): Mesh {
    const geometry = this.createElongatedGeometry(params.size, params.bodyShape);
    const material = new Mesh.StandardMaterial({ color: params.primaryColor });
    return new Mesh(geometry, material);
  }

  private generateFins(params: FishParameters): Group {
    const fins = new Group();
    const finGeometry = this.createFinGeometry(params.finType, params.size * 0.2);
    const finMaterial = new Mesh.StandardMaterial({ color: params.primaryColor, transparent: true, opacity: 0.8 });
    
    const dorsal = new Mesh(finGeometry, finMaterial);
    const leftPectoral = new Mesh(finGeometry, finMaterial);
    const rightPectoral = new Mesh(finGeometry, finMaterial);
    
    dorsal.position.set(0, params.size * 0.15, 0);
    leftPectoral.position.set(-params.size * 0.1, 0, params.size * 0.1);
    rightPectoral.position.set(params.size * 0.1, 0, params.size * 0.1);
    
    fins.add(dorsal, leftPectoral, rightPectoral);
    return fins;
  }

  private createElongatedGeometry(size: number, shape: string): any {
    return this.createCapsuleGeometry(size * 0.15, size * 0.6);
  }

  private createFinGeometry(finType: string, size: number): any {
    return this.createBoxGeometry(size * 0.3, size, 0.02);
  }
}
