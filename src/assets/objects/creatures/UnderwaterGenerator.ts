/**
 * UnderwaterGenerator - Procedural marine life generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureParameters, CreatureType } from './CreatureBase';

export type MarineSpecies = 'jellyfish' | 'octopus' | 'anemone' | 'coral' | 'squid' | 'starfish';
export interface MarineParameters extends CreatureParameters {
  tentacleCount: number;
  bioluminescent: boolean;
  primaryColor: string;
}

export class UnderwaterGenerator extends CreatureBase<MarineParameters> {
  protected getDefaultParameters(): MarineParameters {
    return {
      ...super.getDefaultParameters(),
      creatureType: CreatureType.MARINE,
      tentacleCount: 8,
      bioluminescent: false,
      primaryColor: '#FF69B4',
    };
  }

  generate(species: MarineSpecies, params: Partial<MarineParameters> = {}): Group {
    const parameters = { ...this.getDefaultParameters(), ...params };
    this.applySpeciesDefaults(species, parameters);
    
    const marine = new Group();
    marine.name = `Marine_${species}`;
    
    switch (species) {
      case 'jellyfish': marine.add(this.generateJellyfish(parameters)); break;
      case 'octopus': marine.add(this.generateOctopus(parameters)); break;
      case 'anemone': marine.add(this.generateAnemone(parameters)); break;
      case 'coral': marine.add(this.generateCoral(parameters)); break;
      case 'squid': marine.add(this.generateSquid(parameters)); break;
      case 'starfish': marine.add(this.generateStarfish(parameters)); break;
    }
    
    return marine;
  }

  private applySpeciesDefaults(species: MarineSpecies, params: MarineParameters): void {
    switch (species) {
      case 'jellyfish': params.size = 0.3; params.tentacleCount = 4; params.bioluminescent = true; params.primaryColor = '#E0FFFF'; break;
      case 'octopus': params.size = 0.5; params.tentacleCount = 8; params.primaryColor = '#DC143C'; break;
      case 'anemone': params.size = 0.2; params.tentacleCount = 24; params.primaryColor = '#FF69B4'; break;
      case 'coral': params.size = 0.4; params.tentacleCount = 0; params.primaryColor = '#FF7F50'; break;
      case 'squid': params.size = 0.8; params.tentacleCount = 10; params.primaryColor = '#4B0082'; break;
      case 'starfish': params.size = 0.25; params.tentacleCount = 5; params.primaryColor = '#FFA500'; break;
    }
  }

  private generateJellyfish(params: MarineParameters): Group {
    const group = new Group();
    const bell = new Mesh(this.createSphereGeometry(params.size * 0.5), new Mesh.StandardMaterial({ color: params.primaryColor, transparent: true, opacity: 0.6 }));
    group.add(bell);
    for (let i = 0; i < params.tentacleCount; i++) {
      const tentacle = new Mesh(this.createCylinderGeometry(0.02, 0.01, params.size), new Mesh.StandardMaterial({ color: params.primaryColor }));
      tentacle.position.set(Math.cos(i * Math.PI * 2 / params.tentacleCount) * params.size * 0.3, -params.size * 0.3, Math.sin(i * Math.PI * 2 / params.tentacleCount) * params.size * 0.3);
      group.add(tentacle);
    }
    return group;
  }

  private generateOctopus(params: MarineParameters): Group {
    const group = new Group();
    const head = new Mesh(this.createSphereGeometry(params.size * 0.4), new Mesh.StandardMaterial({ color: params.primaryColor }));
    group.add(head);
    for (let i = 0; i < params.tentacleCount; i++) {
      const tentacle = new Mesh(this.createCylinderGeometry(0.05, 0.02, params.size * 0.8), new Mesh.StandardMaterial({ color: params.primaryColor }));
      tentacle.position.set(Math.cos(i * Math.PI * 2 / params.tentacleCount) * params.size * 0.2, -params.size * 0.3, Math.sin(i * Math.PI * 2 / params.tentacleCount) * params.size * 0.2);
      group.add(tentacle);
    }
    return group;
  }

  private generateAnemone(params: MarineParameters): Group {
    const group = new Group();
    const base = new Mesh(this.createCylinderGeometry(params.size * 0.3, params.size * 0.4, params.size * 0.2), new Mesh.StandardMaterial({ color: params.primaryColor }));
    group.add(base);
    for (let i = 0; i < params.tentacleCount; i++) {
      const tentacle = new Mesh(this.createCylinderGeometry(0.02, 0.01, params.size * 0.4), new Mesh.StandardMaterial({ color: params.primaryColor }));
      tentacle.position.set(Math.cos(i * Math.PI * 2 / params.tentacleCount) * params.size * 0.2, params.size * 0.1, Math.sin(i * Math.PI * 2 / params.tentacleCount) * params.size * 0.2);
      group.add(tentacle);
    }
    return group;
  }

  private generateCoral(params: MarineParameters): Group {
    const coral = new Group();
    for (let i = 0; i < 5; i++) {
      const branch = new Mesh(this.createCylinderGeometry(params.size * 0.1, params.size * 0.05, params.size * 0.5), new Mesh.StandardMaterial({ color: params.primaryColor }));
      branch.position.set((Math.random() - 0.5) * params.size, params.size * 0.25, (Math.random() - 0.5) * params.size);
      branch.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
      coral.add(branch);
    }
    return coral;
  }

  private generateSquid(params: MarineParameters): Group {
    const group = new Group();
    const body = new Mesh(this.createCapsuleGeometry(params.size * 0.15, params.size * 0.6), new Mesh.StandardMaterial({ color: params.primaryColor }));
    group.add(body);
    return group;
  }

  private generateStarfish(params: MarineParameters): Group {
    const starfish = new Group();
    for (let i = 0; i < params.tentacleCount; i++) {
      const arm = new Mesh(this.createBoxGeometry(params.size * 0.15, 0.05, params.size * 0.4), new Mesh.StandardMaterial({ color: params.primaryColor }));
      arm.rotation.y = (i * Math.PI * 2) / params.tentacleCount;
      arm.position.set(Math.cos(arm.rotation.y) * params.size * 0.2, 0, Math.sin(arm.rotation.y) * params.size * 0.2);
      starfish.add(arm);
    }
    return starfish;
  }
}
