/**
 * InsectGenerator - Procedural insect generation
 * Generates insects with 3 body segments, 6 legs, antennae, and optional wings
 */
import { Group, Mesh, Material, MeshStandardMaterial } from 'three';
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

    const s = parameters.size;
    const insect = new Group();
    insect.name = `Insect_${species}`;

    const mat = new MeshStandardMaterial({ color: parameters.primaryColor, roughness: 0.5, metalness: 0.1 });

    // 3 body segments: head, thorax, abdomen
    const segments = this.generateBodySegments(parameters, mat);
    segments.forEach(seg => insect.add(seg));

    // Eyes on head
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(s * 0.08);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.12, s * 0.15, s * 0.35);
    insect.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.12, s * 0.15, s * 0.35);
    insect.add(rightEye);

    // 6 legs (3 pairs) attached to thorax
    const legs = this.generateLegs(parameters, mat);
    legs.forEach(l => insect.add(l));

    // Antennae
    const antennae = this.generateAntennae(parameters, mat);
    antennae.forEach(a => insect.add(a));

    // Optional wings
    if (parameters.hasWings) {
      const wings = this.generateWings(parameters);
      wings.forEach(w => insect.add(w));
    }

    return insect;
  }

  generateBodyCore(): Mesh {
    const params = this.getDefaultConfig();
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    return this.generateBodySegments(params, mat)[1]; // Thorax
  }

  generateHead(): Mesh {
    const params = this.getDefaultConfig();
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    return this.generateBodySegments(params, mat)[0];
  }

  generateLimbs(): Mesh[] {
    const params = this.getDefaultConfig();
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    return this.generateLegs(params, mat);
  }

  generateAppendages(): Mesh[] {
    const params = this.getDefaultConfig();
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    const app: Mesh[] = [];
    app.push(...this.generateAntennae(params, mat));
    if (params.hasWings) {
      app.push(...this.generateWings(params));
    }
    return app;
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: InsectSpecies, params: InsectParameters): void {
    switch (species) {
      case 'ant':
        params.size = 0.02; params.legCount = 6; params.hasWings = false; params.primaryColor = '#2F2F2F'; break;
      case 'bee':
        params.size = 0.03; params.legCount = 6; params.hasWings = true; params.primaryColor = '#FFD700'; break;
      case 'beetle':
        params.size = 0.05; params.legCount = 6; params.hasWings = true; params.primaryColor = '#228B22'; break;
      case 'butterfly':
        params.size = 0.08; params.legCount = 6; params.hasWings = true; params.primaryColor = '#FF69B4'; break;
      case 'spider':
        params.size = 0.04; params.legCount = 8; params.hasWings = false; params.primaryColor = '#2F2F2F'; break;
      case 'grasshopper':
        params.size = 0.06; params.legCount = 6; params.hasWings = true; params.primaryColor = '#228B22'; break;
    }
  }

  private generateBodySegments(params: InsectParameters, mat: MeshStandardMaterial): Mesh[] {
    const s = params.size;
    const segments: Mesh[] = [];

    // Head - small sphere
    const headGeo = this.createSphereGeometry(s * 0.2);
    const head = new Mesh(headGeo, mat);
    head.position.set(0, s * 0.1, s * 0.3);
    head.name = 'head';
    segments.push(head);

    // Thorax - medium ellipsoid
    const thoraxGeo = this.createEllipsoidGeometry(s * 0.18, s * 0.15, s * 0.2);
    const thorax = new Mesh(thoraxGeo, mat);
    thorax.position.set(0, s * 0.05, 0);
    thorax.name = 'thorax';
    segments.push(thorax);

    // Abdomen - larger ellipsoid
    const abdomenGeo = this.createEllipsoidGeometry(s * 0.22, s * 0.18, s * 0.35);
    const abdomen = new Mesh(abdomenGeo, mat);
    abdomen.position.set(0, s * 0.05, -s * 0.4);
    abdomen.name = 'abdomen';
    segments.push(abdomen);

    return segments;
  }

  private generateLegs(params: InsectParameters, mat: MeshStandardMaterial): Mesh[] {
    const s = params.size;
    const legs: Mesh[] = [];
    const numPairs = Math.floor(params.legCount / 2);

    for (let pair = 0; pair < numPairs; pair++) {
      for (const side of [-1, 1]) {
        const legGroup = new Group();
        legGroup.name = `leg_${side === -1 ? 'L' : 'R'}${pair}`;
        const zOffset = -s * 0.05 + pair * s * 0.1;

        // Upper leg segment
        const upperLen = s * 0.3;
        const upperGeo = this.createCylinderGeometry(s * 0.015, s * 0.012, upperLen);
        const upper = new Mesh(upperGeo, mat);
        upper.rotation.z = side * 0.8;
        upper.position.set(side * s * 0.1, -s * 0.05, zOffset);
        legGroup.add(upper);

        // Lower leg segment
        const lowerLen = s * 0.35;
        const lowerGeo = this.createCylinderGeometry(s * 0.012, s * 0.005, lowerLen);
        const lower = new Mesh(lowerGeo, mat);
        lower.rotation.z = side * 0.4;
        lower.position.set(side * s * 0.2, -s * 0.2, zOffset);
        legGroup.add(lower);

        legs.push(legGroup as unknown as Mesh);
      }
    }

    return legs;
  }

  private generateAntennae(params: InsectParameters, mat: MeshStandardMaterial): Mesh[] {
    const s = params.size;
    const antennae: Mesh[] = [];

    for (const side of [-1, 1]) {
      const group = new Group();
      group.name = side === -1 ? 'leftAntenna' : 'rightAntenna';

      // Antenna stalk
      const stalkGeo = this.createCylinderGeometry(s * 0.008, s * 0.005, s * 0.3);
      const stalk = new Mesh(stalkGeo, mat);
      stalk.rotation.z = side * -0.6;
      stalk.rotation.x = -0.3;
      stalk.position.set(side * s * 0.08, s * 0.25, s * 0.35);
      group.add(stalk);

      // Tip
      const tipGeo = this.createSphereGeometry(s * 0.02);
      const tip = new Mesh(tipGeo, mat);
      tip.position.set(side * s * 0.18, s * 0.38, s * 0.4);
      group.add(tip);

      antennae.push(group as unknown as Mesh);
    }

    return antennae;
  }

  private generateWings(params: InsectParameters): Mesh[] {
    const s = params.size;
    const wingMat = new MeshStandardMaterial({
      color: params.primaryColor === '#FF69B4' ? 0xffaacc : 0xffffff,
      transparent: true,
      opacity: 0.6,
      roughness: 0.3,
      side: 2,
    });
    const wings: Mesh[] = [];

    for (const side of [-1, 1]) {
      const wingGeo = this.createEllipsoidGeometry(s * 0.4, s * 0.01, s * 0.25);
      const wing = new Mesh(wingGeo, wingMat);
      wing.position.set(side * s * 0.35, s * 0.15, -s * 0.05);
      wing.rotation.z = side * -0.3;
      wing.name = side === -1 ? 'leftWing' : 'rightWing';
      wings.push(wing);
    }

    return wings;
  }
}
