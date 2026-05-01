/**
 * BirdGenerator - Procedural bird generation
 * Generates various bird species with body, head+beak, wings, legs+toes, and tail
 */

import { Group, Mesh, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface BirdParameters extends CreatureParams {
  wingSpan: number;
  beakType: 'hooked' | 'conical' | 'probing' | 'filter';
  featherPattern: 'solid' | 'striped' | 'spotted' | 'iridescent';
  flightStyle: 'soaring' | 'flapping' | 'hovering' | 'gliding' | 'silent' | 'swimming';
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

    const s = parameters.size;
    const bird = new Group();
    bird.name = `Bird_${species}`;
    bird.userData.parameters = parameters;

    // Body - elongated sphere
    const body = this.generateBody(parameters);
    bird.add(body);

    // Head
    const head = this.generateHeadGroup(parameters);
    head.position.set(0, s * 0.15, s * 0.25);
    bird.add(head);

    // Wings
    const wings = this.generateWings(parameters);
    wings.forEach(w => bird.add(w));

    // Legs + toes
    const legs = this.generateLegs(parameters);
    legs.forEach(l => bird.add(l));

    // Tail
    const tail = this.generateTail(parameters);
    bird.add(tail);

    return bird;
  }

  generateBodyCore(): Mesh {
    return this.generateBody(this.getDefaultConfig());
  }

  generateHead(): Mesh {
    return this.generateHeadGroup(this.getDefaultConfig());
  }

  generateLimbs(): Mesh[] {
    return this.generateLegs(this.getDefaultConfig());
  }

  generateAppendages(): Mesh[] {
    const params = this.getDefaultConfig();
    return [...this.generateWings(params), this.generateTail(params)];
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: BirdSpecies, params: BirdParameters): void {
    switch (species) {
      case 'eagle':
        params.size = 1.2; params.wingSpan = 2.0; params.beakType = 'hooked';
        params.flightStyle = 'soaring'; params.tailShape = 'square'; params.primaryColor = '#2F1810'; break;
      case 'sparrow':
        params.size = 0.15; params.wingSpan = 0.25; params.beakType = 'conical';
        params.flightStyle = 'flapping'; params.tailShape = 'pointed'; params.primaryColor = '#8B4513'; break;
      case 'parrot':
        params.size = 0.4; params.wingSpan = 0.6; params.beakType = 'hooked';
        params.flightStyle = 'flapping'; params.tailShape = 'pointed'; params.primaryColor = '#228B22'; break;
      case 'owl':
        params.size = 0.5; params.wingSpan = 1.0; params.beakType = 'hooked';
        params.flightStyle = 'silent'; params.tailShape = 'rounded'; params.primaryColor = '#8B4513'; break;
      case 'hummingbird':
        params.size = 0.05; params.wingSpan = 0.08; params.beakType = 'probing';
        params.flightStyle = 'hovering'; params.tailShape = 'forked'; params.primaryColor = '#228B22'; break;
      case 'pelican':
        params.size = 1.0; params.wingSpan = 2.5; params.beakType = 'filter';
        params.flightStyle = 'gliding'; params.tailShape = 'rounded'; params.primaryColor = '#FFFFFF'; break;
      case 'flamingo':
        params.size = 1.2; params.wingSpan = 1.5; params.beakType = 'filter';
        params.flightStyle = 'flapping'; params.tailShape = 'pointed'; params.primaryColor = '#FF69B4'; break;
      case 'penguin':
        params.size = 0.6; params.wingSpan = 0.3; params.beakType = 'conical';
        params.flightStyle = 'swimming'; params.tailShape = 'rounded'; params.primaryColor = '#2F2F2F'; break;
    }
  }

  private generateBody(params: BirdParameters): Mesh {
    const s = params.size;
    const geo = this.createEllipsoidGeometry(s * 0.15, s * 0.12, s * 0.25);
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.7 });
    const mesh = new Mesh(geo, mat);
    mesh.name = 'body';
    return mesh;
  }

  private generateHeadGroup(params: BirdParameters): Mesh {
    const s = params.size;
    const group = new Group();
    group.name = 'headGroup';

    // Head sphere
    const headGeo = this.createSphereGeometry(s * 0.08);
    const headMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.7 });
    const head = new Mesh(headGeo, headMat);
    head.name = 'head';
    group.add(head);

    // Beak - cone
    const beakLen = s * 0.08;
    const beakGeo = this.createConeGeometry(s * 0.02, beakLen, 8);
    const beakMat = new MeshStandardMaterial({ color: 0xf5a623, roughness: 0.4 });
    const beak = new Mesh(beakGeo, beakMat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, -s * 0.01, s * 0.08 + beakLen / 2);
    beak.name = 'beak';
    group.add(beak);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(s * 0.015);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.04, s * 0.02, s * 0.06);
    group.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.04, s * 0.02, s * 0.06);
    group.add(rightEye);

    return group as unknown as Mesh;
  }

  private generateWings(params: BirdParameters): Mesh[] {
    const s = params.size;
    const wingLen = params.wingSpan / 2;
    const wingMat = new MeshStandardMaterial({
      color: params.secondaryColor,
      roughness: 0.8,
      side: 2, // DoubleSide
    });
    const wings: Mesh[] = [];

    for (const side of [-1, 1]) {
      const wingGroup = new Group();
      wingGroup.name = side === -1 ? 'leftWing' : 'rightWing';

      // Wing - flat tapered shape using a scaled box
      const wingGeo = this.createBoxGeometry(wingLen, s * 0.01, s * 0.12);
      const wing = new Mesh(wingGeo, wingMat);
      wing.position.set(side * wingLen / 2, s * 0.05, -s * 0.05);
      wing.rotation.z = side * -0.15; // Slight angle
      wingGroup.add(wing);

      wings.push(wingGroup as unknown as Mesh);
    }

    return wings;
  }

  private generateLegs(params: BirdParameters): Mesh[] {
    const s = params.size;
    const legMat = new MeshStandardMaterial({ color: 0xcc8833, roughness: 0.5 });
    const legs: Mesh[] = [];

    for (const side of [-1, 1]) {
      const legGroup = new Group();
      legGroup.name = side === -1 ? 'leftLeg' : 'rightLeg';

      // Upper leg
      const upperGeo = this.createCylinderGeometry(s * 0.01, s * 0.008, s * 0.12);
      const upper = new Mesh(upperGeo, legMat);
      upper.position.set(side * s * 0.04, -s * 0.18, s * 0.02);
      legGroup.add(upper);

      // Lower leg
      const lowerGeo = this.createCylinderGeometry(s * 0.008, s * 0.006, s * 0.1);
      const lower = new Mesh(lowerGeo, legMat);
      lower.position.set(side * s * 0.04, -s * 0.29, s * 0.02);
      legGroup.add(lower);

      // Toes (3 forward, 1 back)
      const toeGeo = this.createCylinderGeometry(s * 0.003, s * 0.002, s * 0.04);
      for (let t = -1; t <= 1; t++) {
        const toe = new Mesh(toeGeo, legMat);
        toe.rotation.x = Math.PI / 2;
        toe.position.set(side * s * 0.04 + t * s * 0.015, -s * 0.34, s * 0.04);
        legGroup.add(toe);
      }
      // Back toe
      const backToe = new Mesh(toeGeo, legMat);
      backToe.rotation.x = -Math.PI / 2;
      backToe.position.set(side * s * 0.04, -s * 0.34, -s * 0.01);
      legGroup.add(backToe);

      legs.push(legGroup as unknown as Mesh);
    }

    return legs;
  }

  private generateTail(params: BirdParameters): Mesh {
    const s = params.size;
    const tailGroup = new Group();
    tailGroup.name = 'tail';
    const tailMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.7 });

    // Fan-shaped tail
    const fanCount = 5;
    for (let i = 0; i < fanCount; i++) {
      const angle = ((i / (fanCount - 1)) - 0.5) * 0.6;
      const featherGeo = this.createBoxGeometry(s * 0.015, s * 0.005, s * 0.1);
      const feather = new Mesh(featherGeo, tailMat);
      feather.position.set(Math.sin(angle) * s * 0.05, 0, -s * 0.25 - Math.cos(angle) * s * 0.05);
      feather.rotation.y = angle;
      tailGroup.add(feather);
    }

    return tailGroup as unknown as Mesh;
  }
}
