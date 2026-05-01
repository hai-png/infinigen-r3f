/**
 * MammalGenerator - Procedural mammal generation
 * Generates various mammals with fur, body proportions, and limb structures
 * Now includes 4 legs with upper/lower segments and paws
 */

import { Group, Mesh, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface MammalParameters extends CreatureParams {
  furLength: number;
  furPattern: 'solid' | 'striped' | 'spotted' | 'gradient';
  earShape: 'rounded' | 'pointed' | 'floppy' | 'tufted';
  tailType: 'bushy' | 'thin' | 'prehensile' | 'none';
  legType: 'digitigrade' | 'plantigrade' | 'unguligrade';
  primaryColor: string;
  secondaryColor: string;
}

export type MammalSpecies = 'dog' | 'cat' | 'deer' | 'bear' | 'rabbit' | 'fox' | 'elephant' | 'giraffe';

export class MammalGenerator extends CreatureBase {
  private _seed: number = 0;

  constructor(seed?: number) {
    super({ seed: seed || Math.random() * 10000 });
    this._seed = this.params.seed;
  }

  getDefaultConfig(): MammalParameters {
    return {
      ...this.params,
      creatureType: CreatureType.MAMMAL,
      furLength: 0.05,
      furPattern: 'solid',
      earShape: 'rounded',
      tailType: 'bushy',
      legType: 'digitigrade',
      primaryColor: '#8B4513',
      secondaryColor: '#D2691E',
    } as MammalParameters;
  }

  generate(species: MammalSpecies = 'dog', params: Partial<MammalParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const s = parameters.size;
    const mammal = new Group();
    mammal.name = `Mammal_${species}`;
    mammal.userData.parameters = parameters;

    // Body
    const body = this.generateBody(parameters);
    mammal.add(body);

    // Head
    const head = this.generateHeadMesh(parameters);
    head.position.set(0, s * 0.25, s * 0.45);
    head.name = 'head';
    mammal.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    const eyeGeo = this.createSphereGeometry(s * 0.03);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.08, s * 0.32, s * 0.6);
    mammal.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.08, s * 0.32, s * 0.6);
    mammal.add(rightEye);

    // Nose
    const noseMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const nose = new Mesh(this.createSphereGeometry(s * 0.025), noseMat);
    nose.position.set(0, s * 0.22, s * 0.62);
    mammal.add(nose);

    // 4 Legs with upper/lower segments + paws
    const legs = this.generateLegs(parameters);
    legs.forEach(leg => mammal.add(leg));

    // Tail
    if (parameters.tailType !== 'none') {
      const tail = this.generateTail(parameters);
      tail.position.set(0, s * 0.15, -s * 0.45);
      mammal.add(tail);
    }

    // Ears
    const ears = this.generateEars(parameters);
    ears.forEach(ear => mammal.add(ear));

    return mammal;
  }

  generateBodyCore(): Mesh {
    return this.generateBody(this.getDefaultConfig());
  }

  generateHead(): Mesh {
    return this.generateHeadMesh(this.getDefaultConfig());
  }

  generateLimbs(): Mesh[] {
    return this.generateLegs(this.getDefaultConfig());
  }

  generateAppendages(): Mesh[] {
    const params = this.getDefaultConfig();
    const appendages: Mesh[] = [];
    // Ears
    appendages.push(...this.generateEars(params));
    // Tail
    if (params.tailType !== 'none') {
      const tail = this.generateTail(params);
      tail.position.set(0, params.size * 0.15, -params.size * 0.45);
      appendages.push(tail);
    }
    return appendages;
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: MammalSpecies, params: MammalParameters): void {
    switch (species) {
      case 'dog':
        params.size = 0.6; params.furLength = 0.03; params.furPattern = 'solid';
        params.earShape = 'floppy'; params.tailType = 'bushy'; params.legType = 'digitigrade';
        params.primaryColor = '#8B4513'; break;
      case 'cat':
        params.size = 0.4; params.furLength = 0.02; params.furPattern = 'striped';
        params.earShape = 'pointed'; params.tailType = 'thin'; params.legType = 'digitigrade';
        params.primaryColor = '#696969'; break;
      case 'deer':
        params.size = 1.2; params.furLength = 0.02; params.furPattern = 'spotted';
        params.earShape = 'pointed'; params.tailType = 'thin'; params.legType = 'unguligrade';
        params.primaryColor = '#CD853F'; break;
      case 'bear':
        params.size = 1.8; params.furLength = 0.08; params.furPattern = 'solid';
        params.earShape = 'rounded'; params.tailType = 'none'; params.legType = 'plantigrade';
        params.primaryColor = '#2F1B0C'; break;
      case 'rabbit':
        params.size = 0.3; params.furLength = 0.03; params.furPattern = 'solid';
        params.earShape = 'tufted'; params.tailType = 'bushy'; params.legType = 'digitigrade';
        params.primaryColor = '#FFFFFF'; break;
      case 'fox':
        params.size = 0.5; params.furLength = 0.04; params.furPattern = 'gradient';
        params.earShape = 'pointed'; params.tailType = 'bushy'; params.legType = 'digitigrade';
        params.primaryColor = '#FF4500'; break;
      case 'elephant':
        params.size = 3.0; params.furLength = 0.001; params.furPattern = 'solid';
        params.earShape = 'floppy'; params.tailType = 'thin'; params.legType = 'unguligrade';
        params.primaryColor = '#808080'; break;
      case 'giraffe':
        params.size = 4.0; params.furLength = 0.01; params.furPattern = 'spotted';
        params.earShape = 'rounded'; params.tailType = 'thin'; params.legType = 'unguligrade';
        params.primaryColor = '#FFD700'; params.secondaryColor = '#8B4513'; break;
    }
  }

  private generateBody(params: MammalParameters): Mesh {
    const s = params.size;
    const bodyGeometry = this.createEllipsoidGeometry(s * 0.3, s * 0.25, s * 0.4);
    const bodyMaterial = this.createFurMaterial(params.primaryColor, params.furLength, params.furPattern);
    const mesh = new Mesh(bodyGeometry, bodyMaterial);
    mesh.name = 'body';
    return mesh;
  }

  private generateHeadMesh(params: MammalParameters): Mesh {
    const s = params.size;
    // Snout - elongated ellipsoid attached to head
    const headGroup = new Group();
    headGroup.name = 'headGroup';

    const headGeo = this.createSphereGeometry(s * 0.15);
    const headMat = this.createFurMaterial(params.primaryColor, params.furLength * 0.8, params.furPattern);
    const headMesh = new Mesh(headGeo, headMat);
    headGroup.add(headMesh);

    // Snout
    const snoutGeo = this.createEllipsoidGeometry(s * 0.06, s * 0.06, s * 0.12);
    const snout = new Mesh(snoutGeo, headMat);
    snout.position.set(0, -s * 0.04, s * 0.14);
    headGroup.add(snout);

    return headGroup as unknown as Mesh;
  }

  private generateLegs(params: MammalParameters): Mesh[] {
    const s = params.size;
    const legMat = this.createFurMaterial(params.primaryColor, params.furLength * 0.7, 'solid');
    const pawMat = new MeshStandardMaterial({ color: params.secondaryColor, roughness: 0.6 });
    const legs: Mesh[] = [];

    const legPositions = [
      { x: -s * 0.15, z: s * 0.2, name: 'frontLeft' },
      { x: s * 0.15, z: s * 0.2, name: 'frontRight' },
      { x: -s * 0.15, z: -s * 0.2, name: 'backLeft' },
      { x: s * 0.15, z: -s * 0.2, name: 'backRight' },
    ];

    const upperLen = s * 0.2;
    const lowerLen = s * 0.2;
    const legRadius = s * 0.04;
    const pawSize = s * 0.06;

    for (const pos of legPositions) {
      const legGroup = new Group();
      legGroup.name = pos.name;
      legGroup.position.set(pos.x, -s * 0.05, pos.z);

      // Upper leg
      const upperGeo = this.createCylinderGeometry(legRadius, legRadius * 0.9, upperLen);
      const upper = new Mesh(upperGeo, legMat);
      upper.position.y = -upperLen / 2;
      upper.name = 'upperLeg';
      legGroup.add(upper);

      // Lower leg
      const lowerGeo = this.createCylinderGeometry(legRadius * 0.9, legRadius * 0.7, lowerLen);
      const lower = new Mesh(lowerGeo, legMat);
      lower.position.y = -upperLen - lowerLen / 2;
      lower.name = 'lowerLeg';
      legGroup.add(lower);

      // Paw
      const pawGeo = this.createBoxGeometry(pawSize, pawSize * 0.4, pawSize * 0.8);
      const paw = new Mesh(pawGeo, pawMat);
      paw.position.y = -upperLen - lowerLen - pawSize * 0.2;
      paw.name = 'paw';
      legGroup.add(paw);

      legs.push(legGroup as unknown as Mesh);
    }

    return legs;
  }

  private generateTail(params: MammalParameters): Mesh {
    const s = params.size;
    const tailGroup = new Group();
    tailGroup.name = 'tail';

    if (params.tailType === 'bushy') {
      // Tapered cylinder + fluffy tip
      const tailGeo = this.createCylinderGeometry(s * 0.04, s * 0.06, s * 0.3);
      const tailMat = this.createFurMaterial(params.primaryColor, params.furLength * 1.5, params.furPattern);
      const tail = new Mesh(tailGeo, tailMat);
      tail.rotation.x = Math.PI * 0.3;
      tailGroup.add(tail);
      // Fluffy tip
      const tipGeo = this.createSphereGeometry(s * 0.06);
      const tip = new Mesh(tipGeo, tailMat);
      tip.position.set(0, s * 0.12, -s * 0.08);
      tailGroup.add(tip);
    } else {
      // Thin tail
      const tailGeo = this.createCylinderGeometry(s * 0.02, s * 0.01, s * 0.4);
      const tailMat = new MeshStandardMaterial({ color: params.primaryColor });
      const tail = new Mesh(tailGeo, tailMat);
      tail.rotation.x = Math.PI * 0.35;
      tailGroup.add(tail);
    }

    return tailGroup as unknown as Mesh;
  }

  private generateEars(params: MammalParameters): Mesh[] {
    const s = params.size;
    const earMat = this.createFurMaterial(params.secondaryColor, params.furLength * 0.5, 'solid');
    const innerMat = new MeshStandardMaterial({ color: 0xffcccc, roughness: 0.7 });
    const ears: Mesh[] = [];

    const earHeight = s * 0.12;
    const earWidth = s * 0.06;

    for (const side of [-1, 1]) {
      const earGroup = new Group();
      earGroup.name = side === -1 ? 'leftEar' : 'rightEar';

      const earGeo = this.createEarGeometry(earWidth, earHeight, earWidth * 0.4);
      const outer = new Mesh(earGeo, earMat);
      earGroup.add(outer);

      // Inner ear
      const innerGeo = this.createEarGeometry(earWidth * 0.6, earHeight * 0.7, earWidth * 0.2);
      const inner = new Mesh(innerGeo, innerMat);
      inner.position.z = earWidth * 0.1;
      earGroup.add(inner);

      earGroup.position.set(side * s * 0.1, s * 0.38, s * 0.38);
      if (params.earShape === 'floppy') {
        earGroup.rotation.z = side * 0.5;
      }
      ears.push(earGroup as unknown as Mesh);
    }

    return ears;
  }

  private createFurMaterial(color: string, length: number, pattern: string): MeshStandardMaterial {
    // Simulate fur with roughness/bump; length affects roughness
    const roughness = Math.min(0.5 + length * 5, 1.0);
    const mat = new MeshStandardMaterial({
      color,
      roughness,
      metalness: 0.0,
    });
    // Pattern would affect color in a real shader; for now adjust slightly
    if (pattern === 'striped') {
      mat.color.multiplyScalar(0.9);
    } else if (pattern === 'spotted') {
      mat.color.offsetHSL(0.02, 0, 0.05);
    }
    return mat;
  }
}
